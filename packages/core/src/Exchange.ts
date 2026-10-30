/**
 * Stored trajectories with a JSON header, binary part frame, and JSON metadata tail.
 *
 * {@link Service.inspect} reads descriptive records without decoding parts.
 * {@link Service.load} and {@link Service.save} read and write complete trajectories.
 *
 * @stability stable
 */

import {
  Algorithm as CompressionAlgorithm,
  Compression,
  type CompressionError,
  type Options as CompressionOptions,
  defaultAlgorithm as defaultCompressionAlgorithm,
} from "@trajs/utils/Compression";
import { Storage, type StorageError } from "@trajs/utils/Storage";
import {
  Algorithm as HashAlgorithm,
  StreamHash,
  type Options as StreamHashOptions,
  defaultAlgorithm as defaultHashAlgorithm,
} from "@trajs/utils/StreamHash";
import { Context, Effect, Fiber, Layer, Schema, Stream } from "effect";

import * as Config from "#/Config.ts";
import * as EventKit from "#/EventKit.ts";
import * as ExchangeIssue from "#/ExchangeIssue.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import {
  checkParts,
  encodeHeader,
  encodeMetadata,
  encodePart,
  ExchangePart,
  frameOf,
  headerOf,
  metadataOf,
  trajectoryOf,
} from "#/internal/exchange.ts";
import { Magic as ContainerMagic } from "#/internal/exchange/chunk.ts";
import { configOf } from "#/internal/trajectory.ts";
import * as MetricKit from "#/MetricKit.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

import pkg from "../package.json" with { type: "json" };

/**
 * The UTF-8 `TRAJS` marker ending a stored trajectory.
 *
 * @see {@link Metadata} for the record before the tail length and marker.
 * @stability stable
 * @category constants
 */
export const Magic = ContainerMagic;

/**
 * The core package version written into {@link Metadata}.
 *
 * @stability stable
 * @category constants
 */
export const Version = pkg.version;

/**
 * Schema for stored kit descriptions at the start of a trajectory.
 *
 * **Details**
 *
 * The uncompressed JSON record follows a four-byte big-endian length.
 * Each entry states what its declaration names of itself and its stored schemas.
 * Tool entries include them but no executable handlers or schema transformations.
 *
 * @see {@link Toolkit.ToolkitSchema} for stored tool declarations.
 * @see {@link EventKit.EventKitSchema} for stored event declarations.
 * @see {@link MetricKit.MetricKitSchema} for stored metric declarations.
 * @see {@link ExtraKit.ExtraKitSchema} for stored extra declarations.
 * @see {@link Metadata} for the tail.
 * @stability stable
 * @category schemas
 */
export const Header = Schema.Struct({
  toolkit: Toolkit.ToolkitSchema,
  eventkit: EventKit.EventKitSchema,
  metrickit: MetricKit.MetricKitSchema,
  extrakit: ExtraKit.ExtraKitSchema,
});

/**
 * Stored kit descriptions without executable handlers or runtime decoding schemas.
 *
 * @see {@link Header} for the schema and layout.
 * @stability stable
 * @category models
 */
export type Header = Schema.Schema.Type<typeof Header>;

/**
 * Schema for the version, compression, and digest record at the trajectory tail.
 *
 * **Details**
 *
 * The uncompressed JSON record precedes its four-byte big-endian length and {@link Magic}.
 * The digest covers encoded part bytes before compression, excluding the header and metadata.
 *
 * @see {@link Header} for the head.
 * @stability stable
 * @category schemas
 */
export const Metadata = Schema.Struct({
  version: Schema.String,
  compression: CompressionAlgorithm,
  hash: HashAlgorithm,
  digest: Schema.String,
});

/**
 * The stored format version, compression algorithm, hash algorithm, and part digest.
 *
 * @see {@link Metadata} for the schema and layout.
 * @stability stable
 * @category models
 */
export type Metadata = Schema.Schema.Type<typeof Metadata>;

/**
 * Creates the storage part schema using `config`'s kits.
 *
 * **Details**
 *
 * A stored part is a trajectory part, so a response is a finished part.
 * Prompt file data also accepts stored URL representations.
 *
 * @see {@link Trajectory.Part} for ordinary trajectory parts.
 * @stability stable
 * @category schemas
 */
export const Part = <C extends Config.AnyConfig>(config: C) => ExchangePart(config);

/**
 * A stored trajectory's header and metadata without decoded parts.
 *
 * @see {@link Service.inspect} for reading these records.
 * @see {@link Loaded} for access to parts as well.
 * @stability stable
 * @category models
 */
export interface Inspected {
  readonly header: Header;
  readonly metadata: Metadata;
}

/**
 * A stored trajectory's descriptive records and a lazy part reader.
 *
 * **Details**
 *
 * `read` uses the load config unless another config is supplied.
 * Each call returns a trajectory with a fresh uuid v7, not the storage key.
 *
 * **Gotchas**
 *
 * Header descriptions do not rebuild the decoding kits.
 * The caller supplies compatible schemas through the read config.
 *
 * @see {@link Inspected} for descriptive records only.
 * @stability stable
 * @category models
 */
export interface Loaded<Config extends Config.AnyConfig = Config.AnyConfig> {
  readonly header: Header;

  readonly metadata: Metadata;

  /**
   * Returns a lazy trajectory decoded with the supplied or default config.
   *
   * **Details**
   *
   * Decoding and storage failures occur during stream consumption.
   */
  readonly read: <C extends Config.AnyConfig = Config>(
    config?: C,
  ) => Trajectory.Trajectory<string, C, TrajectoryError | StorageError, Config.DecodingServices<C>>;

  /**
   * Verifies that the part frame holds whole decoded parts and the recorded digest.
   *
   * **When to use**
   *
   * Use when a trajectory must be known to be complete before it is read.
   *
   * **Details**
   *
   * Every part is decoded with the supplied or default config.
   * The digest is computed over the encoded parts, as {@link Metadata} states.
   * A trajectory that fails several checks reports them together as
   * {@link ExchangeIssue.Composite}.
   *
   * **Gotchas**
   *
   * Validation reads and decompresses the whole frame.
   * Session declarations and forks are not checked.
   *
   * @see {@link Service.load} for opening the stored trajectory.
   */
  readonly validate: <C extends Config.AnyConfig = Config>(
    config?: C,
  ) => Effect.Effect<void, ExchangeIssue.Issue | StorageError, Config.DecodingServices<C>>;
}

/**
 * The options of one trajectory write.
 *
 * **When to use**
 *
 * Use to state the algorithms of {@link Service.save}.
 *
 * **Details**
 *
 * - `compression` holds the {@link CompressionOptions} of the write. The metadata
 *   records the algorithm.
 * - `hash` holds the {@link StreamHashOptions} of the write. The metadata records
 *   the algorithm too.
 *
 * Omitted options fall back to {@link defaultCompressionAlgorithm} and
 * {@link defaultHashAlgorithm}. A read needs no option, because the metadata
 * carries both algorithms.
 *
 * **Gotchas**
 *
 * A trajectory records the algorithm of its digest, not its `length`, so a write
 * reads the whole digest of `hash.algorithm` and a stated `hash.length` is
 * ignored.
 *
 * @see {@link Service.save} for the operation.
 * @stability stable
 * @category models
 */
export interface SaveOptions {
  readonly compression?: CompressionOptions;
  readonly hash?: StreamHashOptions;
}

/**
 * Service for inspecting, loading, and saving stored trajectories.
 *
 * @see {@link Exchange} for the service tag.
 * @see {@link layer} for the storage-backed provider.
 * @stability stable
 * @category services
 */
export interface Service {
  /**
   * Reads a stored trajectory's header and metadata without decoding its parts.
   *
   * **When to use**
   *
   * Use to inspect available kits and format metadata before choosing decoding schemas.
   *
   * **Details**
   *
   * The part frame is neither read nor decompressed.
   *
   * **Gotchas**
   *
   * Inspection does not verify the part digest.
   *
   * @see {@link Service.load} for the parts as well.
   * @see {@link Loaded.validate} for verifying the parts and the digest.
   */
  readonly inspect: (id: string) => Effect.Effect<Inspected, TrajectoryError | StorageError>;

  /**
   * Opens a stored trajectory using a default decoding config.
   *
   * **When to use**
   *
   * Use when parts will be decoded after inspecting the descriptive records.
   *
   * **Details**
   *
   * Header and metadata are read immediately.
   * Part decompression and decoding wait until the returned trajectory is consumed.
   * The frame decodes with the recorded algorithm of the metadata
   * ({@link Metadata}), so a read takes no algorithm from the caller.
   *
   * **Gotchas**
   *
   * Loading does not verify the digest.
   *
   * @see {@link Service.inspect} for the header and the metadata alone.
   * @see {@link Loaded.validate} for verifying the parts and the digest.
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
   * Writes a trajectory under a caller-supplied storage key.
   *
   * **Details**
   *
   * The source is consumed once and its parts are encoded in order.
   * Encoded parts form one frame between the header and metadata.
   * The frame and the digest follow `options` ({@link SaveOptions}), and the
   * metadata records both.
   * Hashing covers the uncompressed encoded part bytes.
   * The storage key is independent of the trajectory's id.
   *
   * **Gotchas**
   *
   * Unsupported tool schemas can fail header conversion as defects.
   * Hashing and writing share an unbounded broadcast buffer.
   * A slower hashing branch can retain an unbounded backlog.
   *
   * @see {@link Service.load} for reading a trajectory back.
   */
  readonly save: <Config extends Config.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<string, Config, E, R>,
    options?: SaveOptions,
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
 * Service tag for stored trajectory exchange.
 *
 * @see {@link Service} for the operations.
 * @see {@link layer} for the provider.
 * @stability stable
 * @category tags
 */
export class Exchange extends Context.Service<Exchange, Service>()("trajs/core/Exchange") {}

/**
 * Layer using {@link Storage}, {@link Compression}, and {@link StreamHash} for trajectory exchange.
 *
 * **When to use**
 *
 * Use when the application supplies its storage, compression, and hashing implementations.
 *
 * **Details**
 *
 * Storage controls persistence and storage-key behavior.
 * Compression handles the binary part frame.
 * Hashing records a digest during saving.
 *
 * @see {@link Service} for the operations.
 * @stability stable
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

            const decompressed = frameOf<StorageError>({ from, to })(bytes).pipe(
              compression.decompress({ algorithm: metadata.compression }),
            );

            const body = catchCompression(decompressed);

            return {
              header,
              metadata,
              read: <C extends Config.AnyConfig = Config>(given?: C) =>
                trajectoryOf(body, given ?? asConfig<C>(config)),
              validate: <C extends Config.AnyConfig = Config>(given?: C) =>
                Effect.gen(function* () {
                  const selected = given ?? asConfig<C>(config);

                  const frame = decompressed.pipe(
                    Stream.catchTag("CompressionError", (cause) =>
                      Stream.fail(new ExchangeIssue.CompressionFailure({ cause })),
                    ),
                  );

                  // One pass over the part frame: hash the parts, and check their frames.
                  // A bounded buffer keeps the slower branch from holding the whole frame.
                  const [hashing, checking] = yield* Stream.broadcastN(frame, {
                    n: 2,
                    capacity: 16,
                  });

                  const [digest, found] = yield* Effect.all(
                    [
                      Stream.run(hashing, hasher.digest({ algorithm: metadata.hash })),
                      checkParts(selected)(checking).pipe(Stream.runCollect),
                    ],
                    { concurrency: 2 },
                  );

                  const issues = [
                    ...(digest === metadata.digest
                      ? []
                      : [
                          new ExchangeIssue.DigestMismatch({
                            algorithm: metadata.hash,
                            expected: metadata.digest,
                            actual: digest,
                          }),
                        ]),
                    ...found,
                  ];

                  const [first, ...others] = issues;

                  if (first === undefined) {
                    return;
                  }

                  return yield* Effect.fail(
                    others.length === 0 ? first : new ExchangeIssue.Composite({ issues }),
                  );
                }).pipe(Effect.scoped),
            };
          }),
      save:
        <Config extends Config.AnyConfig, E, R>(
          trajectory: Trajectory.Trajectory<string, Config, E, R>,
          options?: SaveOptions,
        ) =>
        (id: string) => {
          const config = configOf(trajectory);
          const compressed = options?.compression?.algorithm ?? defaultCompressionAlgorithm;
          const digested = options?.hash?.algorithm ?? defaultHashAlgorithm;

          const encoded = Effect.gen(function* () {
            const header = encodeHeader(Header, config);

            // Part order is the trajectory order, so encoding stays sequential.
            const frames = trajectory.pipe(
              Stream.mapEffect(encodePart(config), { concurrency: 1 }),
            );

            // The digest sits in the metadata at the tail.
            // Hash the parts during the write, in one pass with the compressed frame.
            const [written, hashed] = yield* Stream.broadcastN(frames, {
              n: 2,
              capacity: "unbounded",
            });

            const digest = yield* Stream.run(hashed, hasher.digest({ algorithm: digested })).pipe(
              Effect.forkScoped,
            );

            const metadata = Fiber.join(digest).pipe(
              Effect.map((digest) =>
                encodeMetadata(Metadata, Magic, {
                  version: Version,
                  compression: compressed,
                  hash: digested,
                  digest,
                }),
              ),
              Stream.fromEffect,
            );

            // `frames` are the encoded parts.
            // `frame` is those parts compressed.
            const frame = catchCompression(
              written.pipe(compression.compress({ algorithm: compressed })),
            );

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
