/**
 * Exchanging a trajectory with what a program keeps it in.
 *
 * A trajectory is a stream of parts, and what a program stores it in — a file, a
 * database, a socket — carries bytes. {@link Exchange} is the seam between the
 * two: {@link Service.write} encodes a trajectory into the bytes of a recording,
 * {@link Service.metadata} reads back what those bytes say the recording was
 * made with, and {@link Service.read} decodes a recording into a trajectory. The
 * exchange is sans IO — it neither performs IO of its own nor asks for any — so
 * where the bytes are carried is the caller's to decide.
 *
 * What those bytes are is the layer's to say. {@link Exchange.layer} is the
 * format this package ships — the bytes a `.trajs` file holds, described on the
 * layer itself — and a program that keeps recordings some other way provides a
 * layer of its own, which is the only thing that changes. Of that format, the
 * parts are carried in one zstd frame and the digest of those parts follows it,
 * and neither how such a frame is written nor how the parts are hashed is the
 * format's to state: a layer is built over a {@link Compression} and the
 * {@link Indexing.Hasher} that hashes the parts, each of which {@link nodeLayer}
 * states for a program that runs on Node and {@link wasmLayer} for one that runs
 * where `node:zlib` is not — a page, say — or which a program states one of its
 * own as.
 */

import type { CompressStream } from "@structured-world/structured-zstd";
import { Context, Effect, Layer, Schema, Sink, Stream } from "effect";

import type * as Event from "#/Event.ts";
import type * as Extra from "#/Extra.ts";
import * as Indexing from "#/Indexing.ts";
import { Contribution, headerSink, part, service, type PartMembers } from "#/internal/exchange.ts";
import type * as Metric from "#/Metric.ts";
import type * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

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
 * @see {@link Service.metadata} for reading it back.
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
 * Use to type what {@link Service.write} requires beside the services of the
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
 * @see {@link Service.write} for the operation that requires them.
 * @category utility types
 */
export type EncodingServices<C extends Trajectory.AnyConfig> = Schema.Union<
  PartMembers<C>
>["EncodingServices"];

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
 * The exchange of a trajectory with the bytes a storage carries.
 *
 * **When to use**
 *
 * Use to encode a trajectory into the bytes of a recording, or to decode one
 * back, without naming the format those bytes are in.
 *
 * **Details**
 *
 * {@link Service.write} produces the bytes of a recording as the trajectory is
 * produced, {@link Service.metadata} reads back what a recording states about
 * itself, {@link Service.digest} reads the digest the recording ends with, and
 * {@link Service.read} turns the bytes of a recording into a trajectory once the
 * kits it was recorded with are in hand.
 *
 * What those bytes are is the layer's to say. An exchange carries no bytes of
 * its own, so what carries them is the caller's to choose. Reading is handed the
 * toolkit, the event kit, the metric kit, the extra kit and the metadata a
 * recording was made with, but not the trajectory its parts were recorded as:
 * any recording may be of any kind, so reading assumes the most general
 * trajectory, a streaming one, whose response parts are streams — see
 * {@link Part} for what that means for the frames of either kind.
 *
 * Either direction fails with what the recording fails with — a part that cannot
 * be encoded or decoded, and bytes that do not decode — as
 * {@link TrajectoryError}, on top of the failures of what it reads: the
 * trajectory being written, or the bytes being read, as `E`, and the services
 * they need as `R`, which writing adds the services the parts' own schemas state
 * to.
 *
 * @see {@link Exchange.layer} for the format this package ships.
 * @category models
 */
export interface Service {
  /**
   * Encodes a trajectory into the bytes of a recording.
   *
   * The trajectory is encoded as it is produced, so what it holds is never held
   * whole, and what it states of itself is what the header line carries; the
   * digest of its parts, read off the bytes those parts are carried in, follows
   * them.
   */
  readonly write: <C extends Trajectory.AnyConfig, E, R>(
    trajectory: Trajectory.Trajectory<C, E, R>,
  ) => Stream.Stream<Uint8Array, E | TrajectoryError, R | EncodingServices<C>>;

  /**
   * Reads what a recording states about itself, leaving the bytes that follow it
   * over for {@link Service.read}.
   */
  readonly metadata: Sink.Sink<Header, Uint8Array, Uint8Array, TrajectoryError>;

  /**
   * Reads the digest a recording ends with, without reading its parts.
   *
   * A recording ends with the digest of the parts it carries, which
   * {@link Service.write} writes after them, so what names a recording is read off
   * its tail without the frame those parts are in ever being decompressed. What a
   * recording ends with but a digest is a failure of the same kind as any other
   * part of the format.
   */
  readonly digest: Sink.Sink<string, Uint8Array, never, TrajectoryError>;

  /**
   * Decodes the bytes of a recording into a trajectory of the kits it is handed.
   *
   * The header line a recording starts with is read and passed by, since a
   * recording is read with the kits themselves rather than with the names the
   * header carries; what the trajectory goes by is the metadata it is handed. The
   * digest the recording ends with is passed by too, since it follows the parts
   * rather than being one.
   */
  readonly read: <
    Toolkit extends Toolkit.Any,
    Eventkit extends Event.AnyKit,
    Metrickit extends Metric.AnyKit,
    Extrakit extends Extra.AnyKit,
  >(options: {
    toolkit: Toolkit;
    eventkit: Eventkit;
    metrickit: Metrickit;
    extrakit: Extrakit;
    metadata: Trajectory.Metadata;
  }) => <E, R>(
    bytes: Stream.Stream<Uint8Array, E, R>,
  ) => Trajectory.Trajectory<
    {
      stream: true;
      toolkit: Toolkit;
      eventkit: Eventkit;
      metrickit: Metrickit;
      extrakit: Extrakit;
    },
    E | TrajectoryError,
    R
  >;
}

/**
 * The service tag a trajectory is exchanged with bytes through.
 *
 * **When to use**
 *
 * Use to require an exchange of a program, and {@link Exchange.layer} to provide
 * the one this package ships.
 *
 * **Details**
 *
 * An effect written against this service takes whatever format the layer it is
 * provided with writes — nothing of a format is part of what an exchange
 * requires — so a program that keeps recordings some other way provides a layer
 * of its own and the code that exchanges them is unchanged.
 *
 * {@link Service.metadata} reads back what a recording was made with, and
 * {@link Service.read} reads one back; both take the bytes, so what carries them
 * is the caller's to choose, and reading hands back the trajectory the bytes
 * hold, so its parts are read as the bytes arrive rather than once they have
 * ended. What a recording states of itself is the header line, which
 * {@link Service.metadata} reads; {@link Service.read} is handed what to read the
 * parts with instead — the kits themselves, rather than the names the header
 * carries — and the metadata the returned trajectory goes by.
 *
 * Either direction fails with the failures of what it reads — the bytes being
 * read, the trajectory being written — as `E` on top of the {@link TrajectoryError}
 * a part that cannot be encoded or decoded fails with, and requires the services
 * `R` names.
 *
 * @see {@link Service} for what an exchange is made of.
 * @see {@link Exchange.layer} for the format this package ships.
 * @see {@link Service.read} for the other direction.
 * @category services
 */
export class Exchange extends Context.Service<Exchange, Service>()("trajs/core/Exchange") {
  /**
   * Builds the exchange of the format this package ships: the bytes a `.trajs`
   * file holds.
   *
   * **When to use**
   *
   * Use to state the format itself, and provide it with a compression of a
   * recording's parts — one of the two this package states, or one of your own.
   *
   * **Details**
   *
   * Providing the layer touches no file and holds no resource: the layer is the
   * encoding and the decoding of the format, and the bytes it produces are the
   * caller's to carry.
   *
   * A recording starts with one plain-text line, the encoded {@link Header}, and
   * nothing before it is compressed, so the head of a file is readable — and its
   * toolkit and kits knowable — without anything else. Everything after that line
   * is one zstd frame carrying the trajectory's parts, each encoded as one
   * SchemaBinary frame ({@link Part}), so a recording is read as it arrives rather
   * than once it has ended; the digest of those parts follows the frame, so a
   * recording is named by its tail without that frame being read
   * ({@link Service.digest}).
   *
   * What writes and reads that frame is the {@link Compression} the layer is
   * provided with, and what hashes the parts is the {@link Indexing.Hasher}, so
   * the layer requires both rather than holding either: a program states the
   * compression it runs on and the hash it names a recording by where it provides
   * its layers. The two this package states are layers of their own —
   * {@link nodeLayer}, over `node:zlib` and a BLAKE3 binding, and
   * {@link wasmLayer}, over WebAssembly codecs that run where `node:zlib` is not —
   * and neither is loaded unless it is provided.
   *
   * **Example** (The exchange over the compression a page uses)
   *
   * ```ts import.meta.vitest
   * import { Effect } from "effect"
   * import { Exchange, wasmLayer } from "@trajs/core/Exchange"
   *
   * const program = Effect.gen(function*() {
   *   const exchange = yield* Exchange
   *
   *   return exchange
   * })
   *
   * Effect.provide(program, wasmLayer)
   * ```
   *
   * @see {@link Service} for the exchange the layer provides.
   * @see {@link Compression} for what carries a recording's parts.
   * @category constructors
   */
  static readonly layer: Layer.Layer<Exchange, never, Compression | Indexing.Hasher> = Layer.effect(
    Exchange,
    Effect.gen(function* () {
      const compression = yield* Compression;
      const hasher = yield* Indexing.Hasher;

      return service(headerSink(Header), compression, hasher);
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
 * writes and reads one with and the BLAKE3 {@link Indexing.nodeLayer} hashes with,
 * each frame written and read through one zstd stream per run, so a recording is
 * written and read as it arrives rather than once it has ended. What either
 * carries with is read when this layer is provided rather than when this module is
 * imported, so a program that never provides it — a page — loads neither
 * `node:zlib` nor a native addon.
 *
 * What it needs of a program that runs where `node:zlib` is not is stated by
 * {@link wasmLayer} instead; the format is the same one, and a frame either
 * compression writes the other reads, and a digest either hash writes the other
 * agrees with.
 *
 * @see {@link Exchange.layer} for the format this carries.
 * @category layers
 */
export const nodeLayer: Layer.Layer<Exchange> = Layer.provide(
  Exchange.layer,
  Layer.merge(
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
 * @see {@link Exchange.layer} for the format this carries.
 * @category layers
 */
export const wasmLayer: Layer.Layer<Exchange> = Layer.provide(
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
