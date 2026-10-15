/**
 * Exchanging a trajectory with a storage.
 *
 * A trajectory is a stream of parts, and what a program keeps it in — a file, a
 * database, a bucket — holds bytes. {@link Exchange} is the seam between the two:
 * {@link Service.save} encodes a trajectory into the bytes a recording is made
 * of, and {@link Service.load} reads back what a recording states of itself, the
 * digest it ends with, and the trajectory its parts make. Those bytes are read at
 * random ({@link Bytes}) and held under an id by a {@link Storage}, so an exchange
 * performs no IO of its own: it asks the storage it was provided for the bytes of
 * a recording and for the place to write one, and where those bytes are kept is
 * the storage's to say.
 *
 * What a storage is of is a place, and {@link Storage.layer} states the one a
 * program that keeps its recordings as files runs on: a recording per path, which
 * a load reads and a save writes. A program that keeps them elsewhere — a bucket,
 * a database, the bytes a page was handed — states a storage of its own and the
 * rest is unchanged.
 *
 * What those bytes are is the layer's to say. {@link Exchange.layer} is the format
 * this package ships — the bytes a `.trajs` file holds, described on the layer
 * itself — and a program that keeps recordings some other way provides a layer of
 * its own, which is the only thing that changes. Of that format, a recording
 * starts with a header line stating what it was made with, the parts follow in one
 * zstd frame, and the digest of those parts follows them; reading at random is what
 * lets the head of a recording be read for the header line and its tail for the
 * digest without reading the frame between them. Neither how such a frame is
 * written nor how the parts are hashed is the format's to state: a layer is built
 * over a {@link Compression} and the {@link Indexing.Hasher} that hashes the parts,
 * each of which {@link nodeLayer} states for a program that runs on Node and
 * {@link wasmLayer} for one that runs where `node:zlib` is not — a page, say — or
 * which a program states one of its own as.
 */

import type { CompressStream } from "@structured-world/structured-zstd";
import {
  Context,
  Data,
  Effect,
  FileSystem,
  Layer,
  PlatformError,
  Schema,
  Sink,
  Stream,
} from "effect";
import type { Scope } from "effect";

import * as Indexing from "#/Indexing.ts";
import { Contribution, part, service, type PartMembers } from "#/internal/exchange.ts";
import * as Trajectory from "#/Trajectory.ts";
import { failure, TrajectoryError } from "#/TrajectoryError.ts";

/**
 * What a recording states about itself, before any of its parts.
 *
 * **When to use**
 *
 * Use to read what a recording was made with before decoding any of its parts.
 *
 * **Details**
 *
 * The toolkit and the kits a recording was made with are carried as the
 * descriptions they state of themselves, which is enough to name the tools, the
 * events, the metrics and the kinds of extra data a recording refers to without
 * their Effect Schemas: the toolkit as {@link Toolkit.encode} describes it — an
 * arbitrary JSON object, which a reader carries on with whatever the writer put in
 * it — and each kit as the name and the description of each of its contributions,
 * keyed by the tag it is recorded under.
 *
 * Where a recording carries it is the layer's to say, and
 * {@link Exchange.layer} says it for the one this package ships.
 *
 * @see {@link Loaded.metadata} for reading it back.
 * @category models
 */
export const Header = Schema.Struct({
  metadata: Trajectory.Metadata,
  toolkit: Schema.JsonObject,
  eventkit: Schema.Record(Schema.String, Contribution),
  metrickit: Schema.Record(Schema.String, Contribution),
  extrakit: Schema.Record(Schema.String, Contribution),
});

export type Header = Schema.Schema.Type<typeof Header>;

/**
 * The services encoding a trajectory's parts takes, as the part schemas of its
 * config state them.
 *
 * **When to use**
 *
 * Use to type what {@link Service.save} requires beside the services of the
 * trajectory it writes.
 *
 * **Details**
 *
 * A response part is written through the schemas of the toolkit it was recorded
 * with — the tool results the toolkit's own tools state — so this is what those
 * schemas need, and `never` for a toolkit of plain ones. Nothing else a part
 * holds states a service: the parts of a recording are rebuilt from the plain
 * schemas of `effect/ai` and of this package rather than read as the schemas
 * they were recorded with, which is what {@link Part} states. Reading takes
 * none, since the frames of a body are parsed synchronously.
 *
 * @see {@link Service.save} for the operation that requires them.
 * @category utility types
 */
export type EncodingServices<C extends Trajectory.AnyConfig> = Schema.Union<
  PartMembers<C>
>["EncodingServices"];

/**
 * What a storage failed with: bytes that could not be read, or a place they could
 * not be written to.
 *
 * **When to use**
 *
 * Use to report the failure of a storage of your own ({@link Storage}), and to
 * tell one apart from a recording that failed: a storage that is missing, that
 * refused, or that was cut short is this error, where bytes that do not hold what
 * a recording is made of are a {@link TrajectoryError}.
 *
 * **Details**
 *
 * `id` names the recording the storage was asked about — the one whose bytes
 * could not be read, or the one that could not be written — and `cause` is what
 * the storage failed with, as it reported it: the failure of a file system, the
 * message a bucket answered with, or the description of what a byte sequence did
 * not hold.
 *
 * @see {@link Bytes} for the reads a storage serves.
 * @see {@link Storage} for the writes one takes.
 * @category errors
 */
export class StorageError extends Data.TaggedError("StorageError")<{
  id: string;
  cause: unknown;
}> {
  override get message(): string {
    return `Failed to read or write '${this.id}': ${failure(this.cause)}`;
  }
}

/**
 * Where and how much a byte sequence is read by.
 *
 * **When to use**
 *
 * Use to name what {@link Bytes.read} and {@link Bytes.readAlloc} read, what
 * {@link Storage.read} reserves an `options` for, or to type what a caller hands
 * one.
 *
 * **Details**
 *
 * - `offset` is where the read begins, counted in bytes from the start of the
 *   sequence, and defaults to `0n`. A byte sequence is read at random, so a read
 *   names where it starts rather than carrying on from the last one it followed.
 * - `size` is how many bytes are asked for, and defaults to what that read can
 *   take: the length of the buffer {@link Bytes.read} is given, and the rest of
 *   the sequence for {@link Bytes.readAlloc}.
 *
 * What a read yields is what it could read, which is fewer bytes than were asked
 * for where the sequence ends before them — and none at all where the offset is
 * at or past that end.
 *
 * @see {@link Bytes} for the sequence these are read from.
 * @category models
 */
export interface ReadOptions {
  readonly offset?: bigint;
  readonly size?: number;
}

/**
 * A sequence of bytes that can be read at random: what a storage serves of a
 * recording.
 *
 * **When to use**
 *
 * Use to read a recording without holding it whole — or to read part of one, such
 * as its head or its tail — and to type what a storage serves ({@link Storage.read})
 * or what a sequence of your own reads by ({@link makeBytes}).
 *
 * **Details**
 *
 * - `length` is how many bytes the sequence holds.
 * - `read` fills a buffer the caller holds, beginning at the offset asked for
 *   and taking up to the size asked for, and yields how many bytes it read into
 *   it.
 * - `readAlloc` reads the same way into a buffer it allocates, and yields that
 *   buffer, cut to what was read where the sequence ended before the size asked
 *   for.
 * - `stream` reads the whole sequence from its head, in chunks, so a recording
 *   too large to hold is read as it arrives rather than all at once.
 *
 * Where a byte sequence comes from is not part of what one is: a file, the range
 * of a bucket, or bytes already in memory are all read the same way. So every
 * read is effectful and fails as {@link StorageError}, since what a sequence is
 * of — a disk, a socket — is what may fail, and a sequence over memory is one
 * that never does.
 *
 * **Example** (A sequence of bytes read at random)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { makeBytes } from "@trajs/core/Exchange"
 *
 * const held = new TextEncoder().encode("trajs")
 *
 * const bytes = makeBytes({
 *   length: Effect.succeed(BigInt(held.length)),
 *   read: (buffer, { offset = 0n, size = buffer.length } = {}) =>
 *     Effect.sync(() => {
 *       const taken = held.subarray(Number(offset), Number(offset) + size)
 *
 *       buffer.set(taken)
 *
 *       return taken.length
 *     })
 * })
 *
 * const tail = await Effect.runPromise(bytes.readAlloc({ offset: 2n }))
 *
 * new TextDecoder().decode(tail) // => "ajs"
 * ```
 *
 * @see {@link makeBytes} for building one from the reads it takes.
 * @see {@link Storage} for what serves one.
 * @category models
 */
export interface Bytes {
  /**
   * How many bytes the sequence holds, asked when it is wanted rather than once
   * when it is made: what a sequence is of may have changed since, and the
   * length is read to tell where a read can reach.
   */
  readonly length: Effect.Effect<bigint, StorageError>;

  /**
   * Reads up to `size` bytes of the sequence beginning at `offset` into the
   * buffer given, and yields how many bytes were read into it.
   *
   * The buffer is the caller's, and what it holds past the bytes read is left as
   * it was: a read of `n` bytes reads into the first `n`, and a read that reaches
   * the end of the sequence before the size asked for reads fewer.
   */
  readonly read: (buffer: Uint8Array, options?: ReadOptions) => Effect.Effect<number, StorageError>;

  /**
   * Reads up to `size` bytes of the sequence beginning at `offset` into a buffer
   * it allocates, and yields that buffer cut to what it read.
   *
   * Without a size, the read takes everything left from the offset to the end of
   * the sequence.
   */
  readonly readAlloc: (options?: ReadOptions) => Effect.Effect<Uint8Array, StorageError>;

  /**
   * The whole sequence, read from its head in chunks as the consumer pulls them,
   * so what a sequence holds is read as it arrives rather than all at once.
   *
   * `chunkSize` states how many bytes are read at a time, and defaults to 64 KiB.
   * A chunk is allocated as it is read, so a caller reading a recording it does not
   * hold states how much of it to hold at once.
   */
  readonly stream: (options?: {
    readonly chunkSize?: number;
  }) => Stream.Stream<Uint8Array, StorageError>;
}

/** How many bytes of a sequence are read at a time when it is read as a stream. */
const Chunk = 64 * 1024;

/**
 * Builds a byte sequence from what its reads take: what a storage serves of the
 * bytes it holds.
 *
 * **When to use**
 *
 * Use to serve the bytes a storage holds ({@link Storage.read}), or to read bytes
 * that are, or that arrive, somewhere a storage is not: a buffer in memory, a
 * range a program fetched, a source it walks.
 *
 * **Details**
 *
 * Only `length` and `read` are asked for, since what the other two are is what
 * those two read: {@link Bytes.readAlloc} allocates what it reads into, and
 * {@link Bytes.stream} reads the sequence from its head one chunk at a time. A
 * read that takes nothing ends that stream, since a read takes what it can and the
 * offset it was asked for is where it started — so the bytes a sequence holds are
 * what its reads serve from the offset `0n` on.
 *
 * **Example** (Building the sequence a storage serves)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { makeBytes } from "@trajs/core/Exchange"
 *
 * const held = new Uint8Array([1, 2, 3])
 *
 * const bytes = makeBytes({
 *   length: Effect.succeed(BigInt(held.length)),
 *   read: (buffer, { offset = 0n } = {}) =>
 *     Effect.sync(() => {
 *       const taken = held.subarray(Number(offset), Number(offset) + buffer.length)
 *
 *       buffer.set(taken)
 *
 *       return taken.length
 *     })
 * })
 *
 * const all = await Effect.runPromise(bytes.readAlloc())
 *
 * Array.from(all) // => [1, 2, 3]
 * ```
 *
 * @see {@link Bytes} for the sequence this builds.
 * @category constructors
 */
export const makeBytes = (bytes: {
  readonly length: Effect.Effect<bigint, StorageError>;
  readonly read: (buffer: Uint8Array, options?: ReadOptions) => Effect.Effect<number, StorageError>;
}): Bytes => {
  const readAlloc = (options?: ReadOptions): Effect.Effect<Uint8Array, StorageError> => {
    const offset = options?.offset ?? 0n;
    const size = options?.size;

    const allocated =
      size === undefined
        ? // Everything left from the offset, which is nothing where the offset is
          // at or past the end of the sequence.
          bytes.length.pipe(
            Effect.map((length) => new Uint8Array(Number(length > offset ? length - offset : 0n))),
          )
        : Effect.sync(() => new Uint8Array(size));

    return allocated.pipe(
      Effect.flatMap((buffer) =>
        bytes
          .read(buffer, { offset, size: buffer.length })
          .pipe(Effect.map((read) => (read === buffer.length ? buffer : buffer.subarray(0, read)))),
      ),
    );
  };

  return {
    ...bytes,
    readAlloc,
    stream: (options) =>
      Stream.unfold(0n, (offset) =>
        readAlloc({ offset, size: options?.chunkSize ?? Chunk }).pipe(
          Effect.map((chunk) =>
            // A read that takes nothing has reached the end of the sequence: the
            // read before it ended there, and this one begins at the end it left.
            chunk.length === 0 ? undefined : ([chunk, offset + BigInt(chunk.length)] as const),
          ),
        ),
      ),
  };
};

/**
 * What a recording is written with.
 *
 * **When to use**
 *
 * Use to type what {@link Storage.write} is given — the options of a storage of
 * your own — or to state one where a recording is written.
 *
 * **Details**
 *
 * - `overwrite` says whether a recording already held under the id is written
 *   over, and defaults to `true`: a storage holds one recording per id, and
 *   writing one again is how a trajectory is recorded a second time. A storage
 *   given `false` fails with a {@link StorageError} where the id is taken, rather
 *   than putting one recording where another was.
 *
 * @see {@link Storage.write} for the operation it is given to.
 * @category models
 */
export interface WriteOptions {
  readonly overwrite?: boolean;
}

/**
 * What a program keeps its recordings in: the bytes of a recording per id, and
 * the place to put them.
 *
 * **When to use**
 *
 * Use to say where recordings are kept — a directory of `.trajs` files, a bucket,
 * a map in memory — and provide the layer to {@link Exchange.layer}, which reads
 * and writes recordings through it.
 *
 * **Details**
 *
 * - `read` serves the bytes held under an id as a {@link Bytes}, which what reads
 *   them takes what it needs from: the exchange reads the head of a recording for
 *   the header line and its tail for the digest, without reading the frame the
 *   parts between them are carried in. An id that holds nothing fails as a
 *   {@link StorageError}.
 * - `write` gives the sink a recording of that id is written through, so its
 *   bytes are written as they are produced rather than held whole. What such a
 *   sink writes into — a file, a socket — is held open for as long as it is run,
 *   so it is run in a scope; {@link Service.save} runs it in the scope of the save
 *   itself.
 *
 * An exchange carries no bytes of its own: it asks the storage it was provided
 * for the bytes of a recording and for the place to write one, so where those
 * bytes are kept is the storage's to say, and the programs that read and write
 * recordings through an exchange are the same whichever storage is provided.
 *
 * @see {@link Bytes} for what a read serves.
 * @see {@link Exchange.layer} for what reads and writes through this.
 * @category services
 */
export interface Storage {
  /**
   * Serves the bytes held under `id`.
   *
   * What it holds is a recording of the format the layer writes, and what it
   * serves is read at random rather than at once, so a reader takes the part of
   * it it came for: the head for what the recording states of itself, and the tail
   * for what it is named by. An id that holds nothing fails as a
   * {@link StorageError} where its bytes are read, which a load of a recording
   * reaches at once, since loading reads the head of one.
   *
   * A window of a recording may be asked for ({@link ReadOptions}), which nothing
   * asks for yet: an exchange reads the whole of a recording and takes the part of
   * it it came for, so a storage of your own may serve the whole of one.
   */
  readonly read: (id: string, options?: ReadOptions) => Effect.Effect<Bytes, StorageError>;

  /**
   * The sink a recording is written into `id` through.
   *
   * The bytes arrive in the order they are recorded, and what holds them is held
   * for as long as the sink is run — so the sink is run in a scope, and the
   * recording is written where it is produced rather than once it has ended.
   */
  readonly write: (
    id: string,
    options?: WriteOptions,
  ) => Sink.Sink<void, Uint8Array, never, StorageError, Scope.Scope>;
}

/**
 * What the file system failed an operation on a recording with, as the failure of
 * the storage that asked it.
 */
const asStorageError =
  (id: string) =>
  (cause: PlatformError.PlatformError): StorageError =>
    new StorageError({ id, cause });

/**
 * The bytes a file holds, as the storage that keeps recordings in files serves
 * them.
 *
 * A read names where it starts and a file handle is read where its cursor was
 * left, so a read of one recording's bytes opens the file, moves the cursor to the
 * offset asked for, reads what was asked of it and closes the file again: what a
 * read serves holds nothing open between reads, so two reads of the same
 * recording are each their own.
 */
const fileBytes = (files: FileSystem.FileSystem, path: string): Bytes =>
  makeBytes({
    length: files.stat(path).pipe(
      Effect.map((info) => info.size),
      Effect.mapError(asStorageError(path)),
    ),
    read: (buffer, { offset = 0n } = {}) =>
      Effect.scoped(
        Effect.gen(function* () {
          const file = yield* files.open(path, { flag: "r" });

          if (offset !== 0n) {
            yield* file.seek(offset, "start");
          }

          return yield* file.read(buffer);
        }),
      ).pipe(Effect.mapError(asStorageError(path))),
  });

/**
 * The service a storage is provided through.
 *
 * **When to use**
 *
 * Use to require a storage of a program, and {@link Exchange.layer} — or
 * {@link nodeLayer} — to read and write recordings through it. A program that
 * keeps its recordings as files provides {@link fileSystemLayer} for it.
 *
 * **Details**
 *
 * What a storage is of is a place: a directory of files, a bucket, a map in
 * memory. So a layer of it is provided at the composition root of a program
 * rather than by the exchange, which reaches the bytes of a recording through the
 * service alone.
 *
 * @see {@link Storage} for what the service gives.
 * @see {@link fileSystemLayer} for the storage this package ships.
 * @category services
 */
export const Storage: Context.Service<Storage, Storage> = Context.Service<Storage, Storage>()(
  "trajs/core/Exchange/Storage",
);

/**
 * The storage this package ships: one recording per file, named by its path.
 *
 * **When to use**
 *
 * Use when a program keeps its recordings as files — what a `.trajs` file is —
 * which is what a program that runs on Node and keeps recordings on disk wants,
 * and what {@link nodeLayer} provides.
 *
 * **Details**
 *
 * `id` is the path of the file a recording is kept in, and nothing else of the id
 * is read as a name of anything: a recording is loaded from the file it names and
 * saved into it, and a path that holds nothing fails as a {@link StorageError}.
 *
 * What a read serves holds no file open: a read opens the file, takes what it was
 * asked for and closes it again, so what {@link Storage.read} gives out is read at
 * random without a scope of its own, and a recording too large to hold is read
 * where the parts of it are wanted ({@link Bytes}).
 *
 * A recording is written through the file system's own sink, so its bytes are
 * written as they are produced; `overwrite` states whether a file that is already
 * there is written over ({@link WriteOptions}), which defaults to being:
 * `overwrite: false` fails where the path is taken rather than putting one
 * recording where another was.
 *
 * **Example** (Keeping recordings as files)
 *
 * ```ts import.meta.vitest
 * import { Layer } from "effect"
 * import { Exchange, fileSystemLayer, nodeLayer } from "@trajs/core/Exchange"
 *
 * const exchange = nodeLayer.pipe(Layer.provide(fileSystemLayer))
 * ```
 *
 * @see {@link Storage} for the service this provides.
 * @category layers
 */
export const fileSystemLayer: Layer.Layer<Storage, never, FileSystem.FileSystem> = Layer.effect(
  Storage,
  Effect.gen(function* () {
    const files = yield* FileSystem.FileSystem;

    return {
      read: (id) => Effect.succeed(fileBytes(files, id)),
      write: (id, options) =>
        files
          .sink(id, { flag: options?.overwrite === false ? "wx" : "w" })
          .pipe(Sink.mapError(asStorageError(id))),
    };
  }),
);

/**
 * How the parts of a recording are carried: the zstd frame they are written and
 * read in.
 *
 * **When to use**
 *
 * Use to state a compression of a recording's parts for {@link Exchange.layer}
 * where neither of the two this package states is the one to use.
 *
 * **Details**
 *
 * What a recording is of is the format's: a header line, after it one zstd frame
 * carrying one SchemaBinary frame per part, and after that the digest of those
 * frames ({@link Exchange.layer}). How that frame is written and read is this:
 * `compress` takes the chunks of a stream and gives back the chunks of the same
 * stream compressed, and `decompress` takes the chunks of a compressed one and
 * gives back the chunks it decompresses to.
 *
 * Either direction reports what it failed with as {@link TrajectoryError}, since a
 * frame that cannot be written or read is a recording that failed rather than a
 * compression that did; a failure of the chunks the stream carries is left to pass
 * through as the failure it is.
 *
 * @see {@link Compression} for the service a layer takes it through.
 * @category models
 */
export interface Compression {
  /**
   * Compresses the chunks of a stream into the frame a recording's parts are
   * carried in.
   */
  readonly compress: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<Uint8Array, E | TrajectoryError, R>;

  /**
   * Decompresses the chunks of the frame a recording's parts are carried in.
   */
  readonly decompress: <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Stream.Stream<Uint8Array, E | TrajectoryError, R>;
}

/**
 * The compression a recording's parts are written and read with.
 *
 * **When to use**
 *
 * Use to provide a compression to {@link Exchange.layer}, which {@link nodeLayer}
 * and {@link wasmLayer} — the two this package states — do, and which a program
 * that carries a recording's parts some other way does with one of its own
 * ({@link Compression}).
 *
 * **Details**
 *
 * What writes and reads the frame a recording's parts are carried in is the only
 * thing that changes between the programs that keep recordings: what a recording
 * is of is the format's ({@link Exchange.layer}), and a compression is what that
 * frame is written and read with. So the layer requires this service rather than
 * holding one itself, and a program states which one it runs on where it provides
 * its layers.
 *
 * The two this package states differ in what they need to run, and neither is
 * loaded unless the layer that uses it is provided: {@link nodeLayer} is over the
 * zstd stream `node:zlib` writes and reads one with, which is read when that layer
 * is provided, and {@link wasmLayer} is over a WebAssembly codec that runs where
 * `node:zlib` is not — a page, say — whose payload is loaded when it first writes
 * or reads a frame.
 *
 * @see {@link Exchange.layer} for the layer this is provided to.
 * @category services
 */
export const Compression: Context.Service<Compression, Compression> = Context.Service<
  Compression,
  Compression
>()("trajs/core/Exchange/Compression");

/**
 * A recording a storage holds under an id, as the operations that read it: what it
 * states of itself, the digest it ends with, and the trajectory its parts make.
 *
 * **When to use**
 *
 * Use to read what a recording is before reading it — what it was made with, and
 * what names it, are both readable without reading its parts — or to read it once
 * as the trajectory it holds.
 *
 * **Details**
 *
 * - `metadata` is what the header line a recording starts with states, decoded
 *   ({@link Header}), and is read while the recording is loaded: what a recording
 *   was made with is known without reading the frame its parts are carried in.
 * - `digest` reads the digest a recording ends with off its tail, without reading
 *   that frame either.
 * - `read()` reads the whole recording as the trajectory its parts make, read as
 *   the most general one: any recording may be of any kind, so its response parts
 *   are read as the streams they arrived in, and its parts are read with no kit at
 *   all — see {@link Part} for what that means for the parts of either kind. The
 *   trajectory goes by the metadata the header states, which is what the load of
 *   the recording read the head of it for.
 *
 * What a load reads is the head of a recording and its length, so a program that
 * asks what a recording states of itself reads neither its parts nor its tail, and
 * `digest` reads the tail alone ({@link Service.load}). `read` is a function rather
 * than a value because a trajectory is a stream of parts and a stream is read
 * once: each call gives the parts as they are read rather than a reading already
 * begun, and each reads the frame the parts are carried in again.
 *
 * Either of the three fails with what the recording fails with — a header line
 * that is not a header, a frame that does not decode, bytes that do not end with a
 * digest — as {@link TrajectoryError}, and with what the storage fails with as
 * {@link StorageError}.
 *
 * @see {@link Service.load} for the operation that gives these.
 * @category models
 */
export interface Loaded {
  /**
   * What the recording states about itself, as the header line the load of it
   * read.
   */
  readonly metadata: Header;

  /**
   * The digest the recording ends with, which is what it is named by, read from
   * the tail of its bytes.
   */
  readonly digest: Effect.Effect<string, TrajectoryError | StorageError>;

  /**
   * The trajectory the recording holds, carrying the metadata its header states,
   * and the parts it is made of as the bytes they are read from.
   */
  readonly read: () => Trajectory.Trajectory<
    Trajectory.AnyConfig,
    TrajectoryError | StorageError,
    never
  >;
}

/**
 * The exchange of a trajectory with a storage.
 *
 * **When to use**
 *
 * Use to save a trajectory where a program keeps its recordings, or to load one
 * back, without naming the format those recordings are in or where they are kept.
 *
 * **Details**
 *
 * {@link Service.save} writes a trajectory into the storage under an id, encoding
 * it as it is produced, and {@link Service.load} reads a recording kept under an id
 * as the operations it is read by ({@link Loaded}): loading reads the head of a
 * recording and what it takes, and the operations read the parts of it and its
 * tail where they are asked for.
 *
 * What those bytes are is the layer's to say, and where they are kept is the
 * storage's. An exchange holds neither: it asks the {@link Storage} it was
 * provided for the bytes of a recording and for the place to write one, so what a
 * storage fails with is a {@link StorageError} and what a recording fails with is
 * a {@link TrajectoryError}, and a program can tell the two apart by the error
 * alone.
 *
 * Either direction fails with what the recording fails with — a part that cannot
 * be encoded or decoded, bytes that do not decode — as {@link TrajectoryError}, on
 * top of the failures of what it reads: the trajectory being saved or the
 * recording being loaded as `E`, and the services they need as `R`, which saving
 * adds the services the parts' own schemas state to.
 *
 * @see {@link Exchange.layer} for the format this package ships.
 * @category models
 */
export interface Service {
  /**
   * Reads a recording kept under `id` into the operations it is read by.
   *
   * What loading reads is the head of a recording — the line it states itself in
   * — and the length of its bytes, so a recording that is not there, or whose head
   * is not a header, fails here rather than when its trajectory is read. What is
   * left for the operations is the frame its parts are carried in and the digest
   * it ends with, neither of which a load reads.
   */
  readonly load: (id: string) => Effect.Effect<Loaded, TrajectoryError | StorageError>;

  /**
   * Writes a trajectory into the storage under the id it is given.
   *
   * The trajectory comes first and the id second, as what a save is of is the
   * trajectory: `save(trajectory)(id)` records one trajectory where recordings are
   * kept, rather than naming a place and asking what goes in it.
   *
   * The trajectory is encoded as it is produced, so what it holds is never held
   * whole: what it states of itself is what the header line carries, its parts
   * follow in the frame they are compressed into, and the digest of those parts,
   * read off the bytes they are carried in, follows them.
   */
  readonly save: <C extends Trajectory.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<C, E, R>,
  ) => (
    id: string,
  ) => Effect.Effect<void, E | TrajectoryError | StorageError, R | EncodingServices<C>>;
}

/**
 * The service tag a trajectory is exchanged with a storage through.
 *
 * **When to use**
 *
 * Use to require an exchange of a program, and {@link Exchange.layer} to provide
 * the one this package ships.
 *
 * **Details**
 *
 * An effect written against this service takes whatever format the layer it is
 * provided with writes — nothing of a format is part of what an exchange requires
 * — and whatever storage that layer was provided with keeps its recordings, so a
 * program that keeps recordings some other way, or keeps them somewhere else,
 * provides a layer of its own and the code that exchanges them is unchanged.
 *
 * {@link Service.save} writes a trajectory where recordings are kept, and
 * {@link Service.load} gives what one of them is read by ({@link Loaded}): what
 * it states of itself, read from its head, what it is named by, read from its
 * tail, and the trajectory it holds, read out of it as it arrives rather than
 * once it has ended.
 *
 * Either direction fails with the failures of what it reads — the trajectory
 * being saved, the storage being read — as `E` on top of the
 * {@link TrajectoryError} a part that cannot be encoded or decoded fails with,
 * and requires the services `R` names.
 *
 * @see {@link Service} for what an exchange is made of.
 * @see {@link Exchange.layer} for the format this package ships.
 * @see {@link Service.load} for the other direction.
 * @category services
 */
export class Exchange extends Context.Service<Exchange, Service>()("trajs/core/Exchange") {
  /**
   * Builds the exchange of the format this package ships: the bytes a `.trajs`
   * file holds.
   *
   * **When to use**
   *
   * Use to state the format itself, and provide it with where its recordings are
   * kept and what carries the frame its parts are in.
   *
   * **Details**
   *
   * A recording starts with one plain-text line, the encoded {@link Header}, and
   * nothing before it is compressed, so the head of a file is readable — and its
   * toolkit and kits knowable — without anything else. Everything after that line
   * is one zstd frame carrying the trajectory's parts, each encoded as one
   * SchemaBinary frame ({@link Part}), so a recording is read as it arrives rather
   * than once it has ended; the digest of those parts follows the frame, so a
   * recording is named by its tail without that frame being read
   * ({@link Loaded.digest}).
   *
   * What writes and reads that frame is the {@link Compression} the layer is
   * provided with, what hashes the parts is the {@link Indexing.Hasher}, and what
   * holds the bytes of a recording is the {@link Storage} — so the layer requires
   * all three rather than holding any: a program states where its recordings are
   * kept, the compression it runs on and the hash it names a recording by where it
   * provides its layers. What this package states of the three are layers of their
   * own — {@link nodeLayer}, over `node:zlib` and a BLAKE3 binding, and
   * {@link wasmLayer}, over WebAssembly codecs that run where `node:zlib` is not —
   * and neither is loaded unless it is provided. It states no storage, since where
   * recordings are kept is a program's to say.
   *
   * @see {@link Service} for the exchange the layer provides.
   * @see {@link Storage} for what it reads and writes recordings through.
   * @see {@link Compression} for what carries a recording's parts.
   * @category constructors
   */
  static readonly layer: Layer.Layer<Exchange, never, Storage | Compression | Indexing.Hasher> =
    Layer.effect(
      Exchange,
      Effect.gen(function* () {
        const storage = yield* Storage;
        const compression = yield* Compression;
        const hasher = yield* Indexing.Hasher;

        return service(Header, storage, compression, hasher);
      }),
    );
}

/**
 * The exchange of the format this package ships, over the zstd stream `node:zlib`
 * writes and reads one with.
 *
 * **When to use**
 *
 * Use when a program runs on Node, where `node:zlib` is there: of the two
 * compressions this package states, it is the one that loads nothing else and the
 * faster of the two.
 *
 * **Details**
 *
 * {@link nodeLayer} is {@link Exchange.layer} over the zstd stream `node:zlib`
 * writes and reads one with, the BLAKE3 {@link Indexing.nodeLayer} hashes with, and
 * {@link fileSystemLayer}, which keeps a recording in the file it is named by —
 * each frame is written and read through one zstd stream per run, so a recording
 * is written and read as it arrives rather than once it has ended. What either
 * carries with is read when this layer is provided rather than when this module is
 * imported, so a program that never provides it — a page — loads neither
 * `node:zlib` nor a native addon.
 *
 * What it needs of a program that runs where `node:zlib` is not is stated by
 * {@link wasmLayer} instead; the format is the same one, and a frame either
 * compression writes the other reads, and a digest either hash writes the other
 * agrees with.
 *
 * A program that keeps its recordings somewhere else than in the files of the
 * machine it runs on states that with a {@link Storage} of its own: it provides
 * {@link Exchange.layer} with what this layer states of the format, and with its
 * own storage in place of {@link fileSystemLayer}.
 *
 * @see {@link Exchange.layer} for the format this carries.
 * @category layers
 */
export const nodeLayer: Layer.Layer<Exchange, never, FileSystem.FileSystem> = Layer.provide(
  Exchange.layer,
  Layer.mergeAll(
    fileSystemLayer,
    Layer.unwrap(
      Effect.promise(() => import("#/internal/zstd.ts")).pipe(Effect.map((zstd) => zstd.layer)),
    ),
    Indexing.nodeLayer,
  ),
);

/** A handle of the WebAssembly codec: what one direction of a frame is written and read through. */
type Codec = Pick<CompressStream, "push" | "finish" | "free">;

/** What the WebAssembly codec refuses a frame for, as the recording that failed. */
const refused = (cause: unknown): TrajectoryError => TrajectoryError.parse(cause);

/**
 * Carries a stream of chunks through one handle of the codec: every chunk is fed
 * to the handle as the downstream pulls it, whatever the handle has complete is
 * emitted, and the frame is sealed when the chunks end.
 *
 * The handle belongs to the run of the stream it carries, so it is freed when that
 * stream ends — and when a downstream stops reading early, which is when it would
 * otherwise be left to the engine's collector.
 */
const carried = <E, R>(
  open: () => Promise<Codec>,
  bytes: Stream.Stream<Uint8Array, E, R>,
): Stream.Stream<Uint8Array, E | TrajectoryError, R> =>
  Stream.unwrap(
    Effect.acquireRelease(Effect.tryPromise({ try: open, catch: refused }), (handle) =>
      Effect.sync(() => handle.free()),
    ).pipe(
      Effect.map((handle) =>
        bytes.pipe(
          // One frame is one stream the handle keeps across the chunks, so the
          // chunks are fed to it one at a time and in the order they are read.
          Stream.mapEffect(
            (chunk) => Effect.try({ try: () => handle.push(chunk), catch: refused }),
            {
              concurrency: 1,
            },
          ),
          Stream.filter((piece) => piece.length > 0),
          Stream.concat(
            Stream.fromEffect(Effect.try({ try: () => handle.finish(), catch: refused })),
          ),
        ),
      ),
    ),
  );

/**
 * The exchange of the format this package ships, over the zstd stream the
 * WebAssembly codec `@structured-world/structured-zstd` writes and reads one with.
 *
 * **When to use**
 *
 * Use when a program runs where `node:zlib` is not — a page, a worker, Deno — or
 * when every run should write and read a recording with the same codec.
 *
 * **Details**
 *
 * {@link wasmLayer} is {@link Exchange.layer} over that codec, whose engine picks
 * the SIMD payload where the host has it and the scalar one where it has not, and
 * over the WebAssembly BLAKE3 {@link Indexing.wasmLayer} hashes with. Each payload
 * is loaded when this layer is provided rather than when this module is imported,
 * and each frame is then carried through one handle of the codec per run, so a
 * recording is written and read as it arrives.
 *
 * What it writes is the same zstd `node:zlib` writes and the same BLAKE3 the
 * binding computes, so a frame either compression writes the other reads and a
 * digest either hash writes the other agrees with — {@link nodeLayer} is the one
 * of a program that runs on Node, where `node:zlib` is there. The BLAKE3
 * WebAssembly code is not the codec's own, so a page that writes recordings with
 * this layer provides it the way {@link Indexing.wasmLayer} says.
 *
 * What it states is how a recording is carried and how its parts are hashed, so
 * what it is provided with is where the recordings are kept: a {@link Storage}.
 *
 * @see {@link Exchange.layer} for the format this carries.
 * @category layers
 */
export const wasmLayer: Layer.Layer<Exchange, never, Storage> = Layer.provide(
  Exchange.layer,
  Layer.merge(
    Layer.unwrap(
      Effect.promise(() => import("@structured-world/structured-zstd")).pipe(
        Effect.map((codec) =>
          Layer.succeed(Compression, {
            compress: (bytes) => carried(() => codec.createCompressStream(), bytes),
            decompress: (bytes) => carried(() => codec.createDecompressStream(), bytes),
          }),
        ),
      ),
    ),
    Indexing.wasmLayer,
  ),
);

/**
 * The parts of a trajectory as the frames of the format this package ships carry
 * them.
 *
 * **When to use**
 *
 * Use to read the parts of a recording this package wrote, or to write the parts
 * of a recording of your own in that format.
 *
 * **Details**
 *
 * It is {@link Trajectory.Part} with a prompt part's messages carrying their
 * file data tagged — a binary layout cannot carry the file data's union of a
 * string, bytes and a URL as it is — and every other part of the trajectory
 * keeping its own layout. A layer of another format states its own parts as it
 * likes and has no use for this one.
 *
 * The response parts are stated as {@link Trajectory.ResponsePart} states them
 * for a streaming trajectory, whatever the trajectory being written states: a
 * recording is read as the most general trajectory, whose response parts are
 * streams, and the response parts of any other kind are the members of that
 * schema too, so one schema carries the response parts of every kind.
 *
 * A part is written through the schemas of the toolkit it was recorded with, so
 * encoding one takes what those schemas state ({@link EncodingServices}); what
 * the other parts state is the services of none, since a recording is rebuilt
 * from plain schemas rather than read as the schemas it was recorded with.
 *
 * @see {@link Exchange.layer} for the format these frames belong to.
 * @category models
 */
export const Part = <C extends Trajectory.AnyConfig>(config: C): Schema.Union<PartMembers<C>> =>
  part(config);
