import {
  Algorithm as CompressionAlgorithm,
  Compression,
  type CompressionError,
} from "@trajs/utils/Compression";
import { Storage, type StorageError } from "@trajs/utils/Storage";
import { Algorithm as HashAlgorithm, StreamHash } from "@trajs/utils/StreamHash";
import { Context, Effect, Fiber, Layer, Schema, Stream } from "effect";

import * as Config from "#/Config.ts";
import {
  encodeExchangePart,
  encodeHeader,
  encodeMetadata,
  ExchangePart,
  frameOf,
  headerOf,
  metadataOf,
  trajectoryOf,
} from "#/internal/exchange.ts";
import { configOf } from "#/internal/trajectory.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

import pkg from "../package.json" with { type: "json" };

/**
 * Reading and writing a trajectory as bytes.
 *
 * {@link Service.inspect} reads the header and the metadata.
 * {@link Service.load} reads the parts as well.
 * {@link Service.save} writes a trajectory under an id.
 *
 * {@link Header} sits at the head.
 * {@link Metadata} sits at the tail.
 * The frame of parts sits between them.
 *
 * @see {@link layer} for providing the exchange.
 */

/**
 * Tail marker of a trajectory, after the metadata length.
 *
 * @see {@link Metadata} for the JSON before the length.
 * @category models
 */
export const Magic = new TextEncoder().encode("TRAJS");

/**
 * Trajs version in {@link Metadata}.
 *
 * @see {@link Metadata} for the tail record.
 * @category models
 */
export const Version = pkg.version;

/**
 * Schema of {@link Header}.
 *
 * **Details**
 *
 * JSON text, with a 4-byte big-endian length before it.
 * Not compressed.
 *
 * @see {@link Metadata} for the tail.
 * @category models
 */
export const Header = Schema.Struct({
  toolkit: Schema.JsonObject,
  eventkit: Schema.Record(Schema.String, Schema.Json),
  metrickit: Schema.Record(Schema.String, Schema.Json),
  extrakit: Schema.Record(Schema.String, Schema.Json),
});

/**
 * Kits at the head of a trajectory.
 *
 * @see {@link Metadata} for the tail.
 * @category models
 */
export type Header = Schema.Schema.Type<typeof Header>;

/**
 * Schema of {@link Metadata}.
 *
 * **Details**
 *
 * JSON text, then a 4-byte big-endian length, then {@link Magic}.
 * Not compressed.
 *
 * @see {@link Header} for the head.
 * @category models
 */
export const Metadata = Schema.Struct({
  version: Schema.String,
  compression: CompressionAlgorithm,
  hash: HashAlgorithm,
  digest: Schema.String,
});

/**
 * Metadata at the tail of a trajectory.
 *
 * @see {@link Header} for the head.
 * @category models
 */
export type Metadata = Schema.Schema.Type<typeof Metadata>;

/**
 * Returns the streaming part schema of `config`.
 *
 * **Details**
 *
 * {@link Loaded.read} folds parts when the config is not streaming.
 *
 * @see {@link Trajectory.Part} for a config's own part, streaming or not.
 * @category constructors
 */
export const Part = <C extends Config.AnyConfig>(config: C) => ExchangePart(config);

/**
 * Header and metadata of a trajectory, without the parts.
 *
 * **When to use**
 *
 * Use to hold the result of {@link Service.inspect}.
 *
 * @see {@link Loaded} for the same fields plus the parts.
 * @category models
 */
export interface Inspected {
  readonly header: Header;
  readonly metadata: Metadata;
}

/**
 * Header, metadata and parts of a stored trajectory.
 *
 * **When to use**
 *
 * Use to hold the result of {@link Service.load}.
 *
 * **Details**
 *
 * `read` uses the load config when called with none.
 * A config argument reads the parts with that config instead.
 *
 * @see {@link Inspected} for the header and the metadata alone.
 * @category models
 */
export interface Loaded<Config extends Config.AnyConfig = Config.AnyConfig> {
  readonly header: Header;

  readonly metadata: Metadata;

  readonly read: <C extends Config.AnyConfig = Config>(
    config?: C,
  ) => Trajectory.Trajectory<string, C, TrajectoryError | StorageError, Config.DecodingServices<C>>;
}

/**
 * Reading and writing of stored trajectories.
 *
 * **When to use**
 *
 * Use to require an exchange, and {@link layer} to provide it.
 *
 * @see {@link Exchange} for the service tag.
 * @category models
 */
export interface Service {
  /**
   * Reads the header and the metadata under `id`.
   *
   * **When to use**
   *
   * Use to read the header and the metadata without the parts.
   *
   * **Details**
   *
   * The header sits at the head and the metadata at the tail.
   * Neither is compressed, so the frame of parts is not read.
   *
   * @see {@link Service.load} for the parts as well.
   */
  readonly inspect: (id: string) => Effect.Effect<Inspected, TrajectoryError | StorageError>;

  /**
   * Reads the trajectory under `id`.
   *
   * **When to use**
   *
   * Use to read the parts, not only the header and the metadata.
   *
   * **Details**
   *
   * `config` is the default config of {@link Loaded.read}.
   *
   * @see {@link Service.inspect} for the header and the metadata alone.
   * @see {@link Service.save} for writing a trajectory.
   */
  readonly load: <Config extends Config.AnyConfig>(
    config: Config,
  ) => (
    id: string,
  ) => Effect.Effect<
    Loaded<Config>,
    TrajectoryError | StorageError,
    Config.DecodingServices<Config>
  >;

  /**
   * Writes `trajectory` into storage under `id`.
   *
   * **Details**
   *
   * Parts go out as one compressed frame between the header and the metadata.
   *
   * @see {@link Service.load} for reading a trajectory back.
   */
  readonly save: <Config extends Config.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<string, Config, E, R>,
  ) => (
    id: string,
  ) => Effect.Effect<void, E | TrajectoryError | StorageError, R | Config.EncodingServices<Config>>;
}

const asConfig = <C extends Config.AnyConfig>(config: Config.AnyConfig): C =>
  // SAFETY: every config is read as the config it already is.
  config as C;

const catchCompression = <E, R>(
  bytes: Stream.Stream<Uint8Array, E | CompressionError, R>,
): Stream.Stream<Uint8Array, E | TrajectoryError, R> =>
  bytes.pipe(
    Stream.catchTag("CompressionError", (cause) => Stream.fail(TrajectoryError.parse(cause))),
  );

/**
 * Service tag for {@link Service}.
 *
 * **When to use**
 *
 * Use to require an exchange, and {@link layer} to provide it.
 *
 * @see {@link Service} for the operations.
 * @category services
 */
export class Exchange extends Context.Service<Exchange, Service>()("trajs/core/Exchange") {}

/**
 * Exchange over {@link Storage}, {@link Compression} and {@link StreamHash}.
 *
 * **When to use**
 *
 * Use to read and write trajectories.
 * Provide those three services beside it.
 *
 * **Details**
 *
 * {@link Storage} keeps the bytes.
 * {@link Compression} carries the frame of parts.
 * {@link StreamHash} names the parts by digest.
 *
 * @see {@link Service} for the operations.
 * @category layers
 */
export const layer: Layer.Layer<Exchange, never, Storage | Compression | StreamHash> = Layer.effect(
  Exchange,
  Effect.gen(function* () {
    const storage = yield* Storage;
    const compression = yield* Compression;
    const hasher = yield* StreamHash;

    const headerAndMetadata = (id: string) =>
      Effect.gen(function* () {
        const bytes = yield* storage.read(id);
        // `from` is the header's end.
        // `to` is the metadata's start.
        const { header, end: from } = yield* headerOf(Header, bytes);
        const { metadata, end: to } = yield* metadataOf(Metadata, Magic, bytes);

        return { bytes, header, metadata, from, to };
      });

    return {
      inspect: (id) =>
        headerAndMetadata(id).pipe(
          Effect.map(({ header, metadata }) => ({
            header,
            metadata,
          })),
        ),
      load:
        <Config extends Config.AnyConfig>(config: Config) =>
        (id: string) =>
          Effect.gen(function* () {
            const { bytes, header, metadata, from, to } = yield* headerAndMetadata(id);

            const compressed = frameOf<StorageError>({ from, to })(bytes).pipe(
              compression.decompress,
            );

            const body = catchCompression(compressed);

            return {
              header,
              metadata,
              read: <C extends Config.AnyConfig = Config>(given?: C) =>
                trajectoryOf(body, given ?? asConfig<C>(config)),
            };
          }),
      save:
        <Config extends Config.AnyConfig, E, R>(
          trajectory: Trajectory.Trajectory<string, Config, E, R>,
        ) =>
        (id: string) => {
          const config = configOf(trajectory);

          const encoded = Effect.gen(function* () {
            const header = encodeHeader(config);

            // Part order is the trajectory order, so encoding stays sequential.
            const frames = trajectory.pipe(
              Stream.mapEffect(encodeExchangePart(config), { concurrency: 1 }),
            );

            // The digest sits in the metadata at the tail.
            // Hash the parts during the write, in one pass with the compressed frame.
            const [written, hashed] = yield* Stream.broadcastN(frames, {
              n: 2,
              capacity: "unbounded",
            });

            const digest = yield* Stream.run(hashed, hasher.digest).pipe(Effect.forkScoped);

            const metadata = Fiber.join(digest).pipe(
              Effect.map((digest) =>
                encodeMetadata(Metadata, Magic, {
                  version: Version,
                  compression: compression.algorithm,
                  hash: hasher.algorithm,
                  digest,
                }),
              ),
              Stream.fromEffect,
            );

            // `frames` are the encoded parts.
            // `frame` is those parts compressed.
            const frame = catchCompression(written.pipe(compression.compress));

            return Stream.make(header).pipe(Stream.concat(frame), Stream.concat(metadata));
          }).pipe(
            Stream.unwrap,
            // Broadcast needs the scope of this stream.
            Stream.scoped,
          );

          // The storage sink needs a scope for the write.
          return Stream.run(encoded, storage.write(id)).pipe(Effect.scoped);
        },
    };
  }),
);
