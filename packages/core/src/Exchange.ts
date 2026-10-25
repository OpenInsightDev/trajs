import { Algorithm as CompressionAlgorithm, Compression } from "@trajs/utils/Compression";
import { Storage, type StorageError } from "@trajs/utils/Storage";
import { Algorithm as HashAlgorithm, StreamHash } from "@trajs/utils/StreamHash";
import { Context, Effect, Fiber, Layer, Schema, Stream } from "effect";

import * as Config from "#/Config.ts";
import {
  encodeExchangePart,
  encodeHeader,
  encodeTrailing,
  ExchangePart,
  framed,
  framesOf,
  headerOf,
  lengthPrefixed,
  reading,
  trailingOf,
} from "#/internal/exchange.ts";
import { configOf } from "#/internal/trajectory.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

import pkg from "../package.json" with { type: "json" };

export const Magic = new TextEncoder().encode("TRAJS");

export const Version = pkg.version;

export const Header = Schema.Struct({
  toolkit: Schema.JsonObject,
  eventkit: Schema.Record(Schema.String, Schema.Json),
  metrickit: Schema.Record(Schema.String, Schema.Json),
  extrakit: Schema.Record(Schema.String, Schema.Json),
});

export type Header = Schema.Schema.Type<typeof Header>;

export const Metadata = Schema.Struct({
  version: Schema.String,
  compression: CompressionAlgorithm,
  hash: HashAlgorithm,
  digest: Schema.String,
});

export type Metadata = Schema.Schema.Type<typeof Metadata>;

/**
 * The schema of a trajectory part, as the exchange writes and reads one.
 *
 * @category constructors
 */
export const Part = <C extends Config.AnyConfig>(config: C) => ExchangePart(config);

/**
 * The header and the metadata of a trajectory.
 *
 * **When to use**
 *
 * Use to hold what {@link Service.inspect} reads, without the parts.
 *
 * @see {@link Loaded} for the same fields plus a reading of the parts.
 * @category models
 */
export interface Inspected {
  readonly header: Header;
  readonly metadata: Metadata;
}

export interface Loaded<Config extends Config.AnyConfig = Config.AnyConfig> {
  readonly header: Header;

  readonly metadata: Metadata;

  readonly read: <C extends Config.AnyConfig = Config>(
    config?: C,
  ) => Trajectory.Trajectory<string, C, TrajectoryError | StorageError, Config.DecodingServices<C>>;
}

export interface Service {
  /**
   * Reads the header and the metadata stored under `id`.
   *
   * **When to use**
   *
   * Use to read what a trajectory states about itself without opening its parts.
   *
   * **Details**
   *
   * The header sits at the head of the bytes and the metadata at the tail.
   * Neither is compressed, so the frame of parts is not read.
   *
   * @see {@link Service.load} for a reading of the parts as well.
   */
  readonly inspect: (id: string) => Effect.Effect<Inspected, TrajectoryError | StorageError>;

  readonly load: <Config extends Config.AnyConfig>(
    config: Config,
  ) => (
    id: string,
  ) => Effect.Effect<
    Loaded<Config>,
    TrajectoryError | StorageError,
    Config.DecodingServices<Config>
  >;

  readonly save: <Config extends Config.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<string, Config, E, R>,
  ) => (
    id: string,
  ) => Effect.Effect<void, E | TrajectoryError | StorageError, R | Config.EncodingServices<Config>>;
}

const asConfig = <C extends Config.AnyConfig>(config: Config.AnyConfig): C =>
  // SAFETY: every config is read as the config it already is.
  config as C;

export class Exchange extends Context.Service<Exchange, Service>()("trajs/core/Exchange") {}

/**
 * The exchange that reads and writes a trajectory through the services a program
 * provides: the storage its bytes are kept in, the compression they are carried in, and
 * the hash they are named by.
 *
 * **When to use**
 *
 * Use to read and write trajectories, providing {@link Storage}, {@link Compression} and
 * {@link StreamHash} beside it.
 *
 * @see {@link Service} for what the exchange reads and writes.
 * @category layers
 */
export const layer: Layer.Layer<Exchange, never, Storage | Compression | StreamHash> = Layer.effect(
  Exchange,
  Effect.gen(function* () {
    const storage = yield* Storage;
    const compression = yield* Compression;
    const hasher = yield* StreamHash;

    const endsOf = (id: string) =>
      Effect.gen(function* () {
        const bytes = yield* storage.read(id);
        const stated = yield* headerOf(Header, bytes);
        const trailing = yield* trailingOf(Metadata, Magic, bytes);

        return { bytes, stated, trailing };
      });

    return {
      inspect: (id) =>
        endsOf(id).pipe(
          Effect.map(({ stated, trailing }) => ({
            header: stated.header,
            metadata: trailing.metadata,
          })),
        ),
      load:
        <Config extends Config.AnyConfig>(config: Config) =>
        (id: string) =>
          Effect.gen(function* () {
            const { bytes, stated, trailing } = yield* endsOf(id);

            const frame = framed(
              framesOf<StorageError>({ from: stated.end, to: trailing.end })(bytes).pipe(
                compression.decompress,
              ),
            );

            return {
              header: stated.header,
              metadata: trailing.metadata,
              read: <C extends Config.AnyConfig = Config>(given?: C) =>
                reading(frame, given ?? asConfig<C>(config)),
            };
          }),
      save:
        <Config extends Config.AnyConfig, E, R>(
          trajectory: Trajectory.Trajectory<string, Config, E, R>,
        ) =>
        (id: string) => {
          const config = configOf(trajectory);

          const encoded = Effect.gen(function* () {
            const header = new TextEncoder().encode(encodeHeader(config));

            const frames = trajectory.pipe(
              Stream.mapEffect(encodeExchangePart(config), { concurrency: 1 }),
            );

            const [written, hashed] = yield* Stream.broadcastN(frames, {
              n: 2,
              capacity: "unbounded",
            });

            const digest = yield* Stream.run(hashed, hasher.digest).pipe(Effect.forkScoped);

            const trailing = Fiber.join(digest).pipe(
              Effect.map((digest) =>
                encodeTrailing(Metadata, Magic, {
                  version: Version,
                  compression: compression.algorithm,
                  hash: hasher.algorithm,
                  digest,
                }),
              ),
              Stream.fromEffect,
            );

            const body = framed(written.pipe(compression.compress));

            return Stream.make(lengthPrefixed(header)).pipe(
              Stream.concat(body),
              Stream.concat(trailing),
            );
          }).pipe(Stream.unwrap, Stream.scoped);

          return Stream.run(encoded, storage.write(id)).pipe(Effect.scoped);
        },
    };
  }),
);
