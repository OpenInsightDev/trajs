/**
 * Exchanging a trajectory with a storage.
 *
 * A trajectory is a stream of parts, and what a program keeps it in — a file, a
 * database, a bucket — holds bytes. {@link Exchange} is the seam between the two:
 * {@link Service.save} encodes a trajectory into the bytes it is made of, and {@link Service.load} reads back what a trajectory states of itself, the
 * metadata it ends with, and the trajectory its parts make. Those bytes are read
 * at random — the head of a trajectory for what it states of itself, its tail for
 * the metadata it ends with — and held under an id by the storage the exchange was
 * provided, so an exchange performs no IO of its own: it asks that storage for the
 * bytes of a trajectory and for the place to write one, and where those bytes are
 * kept is the storage's to say.
 *
 * What those bytes are is the layer's to say. {@link Exchange.layer} is the format
 * this package ships — the bytes a `.trajs` file holds, described on the layer
 * itself — and a program that keeps trajectories some other way provides a layer of
 * its own, which is the only thing that changes. Of that format, a trajectory
 * starts with a header stating what it was made with, the parts follow in one
 * frame, and the metadata stating how that frame was written and what it is named
 * by follows them ({@link Metadata}); reading at random is what lets the head of a
 * trajectory be read for the header and its tail for the metadata without
 * reading the frame between them. How such a frame is written, how the parts are
 * hashed and where a trajectory is kept are not the format's to state: the layer is
 * built over a compression of the parts, over a hash of them and over a storage,
 * which are `@trajs/utils`'s services — a program provides the layer a platform
 * package states them with, such as `@trajs/platform-node` for one that runs on
 * Node — over `node:zlib`, the hashes the Rust binding and `node:crypto`
 * compute, and the files of the machine — or `@trajs/platform-browser` for one that
 * runs where `node:zlib` is not, a page say. Which frame the parts are carried in,
 * and which digest names them, are the layer's to state too
 * ({@link Compression.Options}), and what it was built over is what the trajectory
 * states of itself in the metadata it ends with.
 */

import { Algorithm as CompressionAlgorithm, Compression } from "@trajs/utils/Compression";
import { Storage, type StorageError } from "@trajs/utils/Storage";
import { Algorithm as HashAlgorithm, StreamHash } from "@trajs/utils/StreamHash";
import { Context, Effect, Layer, Schema } from "effect";

import { Contribution, part, service, type PartMembers } from "#/internal/exchange.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * What a trajectory states about itself, before any of its parts.
 *
 * **When to use**
 *
 * Use to read what a trajectory was made with before decoding any of its parts.
 *
 * **Details**
 *
 * The toolkit and the kits a trajectory was made with are carried as the
 * descriptions they state of themselves, which is enough to name the tools, the
 * events, the metrics and the kinds of extra data a trajectory refers to without
 * their Effect Schemas: the toolkit as {@link Toolkit.encode} describes it — an
 * arbitrary JSON object, which a reader carries on with whatever the writer put in
 * it — and each kit as the name and the description of each of its contributions,
 * keyed by the tag it is produced under.
 *
 * Where a trajectory carries it is the layer's to say, and
 * {@link Exchange.layer} says it for the one this package ships.
 *
 * @see {@link Loaded.header} for reading it back.
 * @category models
 */
export const Header = Schema.Struct({
  toolkit: Schema.JsonObject,
  eventkit: Schema.Record(Schema.String, Contribution),
  metrickit: Schema.Record(Schema.String, Contribution),
  extrakit: Schema.Record(Schema.String, Contribution),
});

export type Header = Schema.Schema.Type<typeof Header>;

/**
 * What a trajectory states at its end about the bytes it is made of: how that frame
 * was written, and what the trajectory is named by.
 *
 * **When to use**
 *
 * Use to read what a trajectory was written with and what names it without reading
 * the parts it carries, or to state the metadata of a trajectory of your own.
 *
 * **Details**
 *
 * - `compression` is the algorithm the parts were carried in a frame with
 *   ({@link Compression.Algorithm}), and `hash` the algorithm their digest was read
 *   with ({@link StreamHash.Algorithm}), each stated as the code its algorithm goes
 *   by rather than as the name of it, so a trajectory states what wrote it rather than
 *   leaving whatever reads it to assume.
 * - `digest` is the digest of those parts, which is what the trajectory is named by
 *   — the lowercase hex a {@link StreamHash} reads one off with.
 * - `version` is the version of this package that wrote the trajectory, as its
 *   `package.json` states it, so a reader can tell which of them wrote what it is
 *   reading.
 *
 * Where a trajectory carries it is the layer's to say, and {@link Exchange.layer}
 * says it for the one this package ships: the metadata is the last thing a
 * trajectory holds, so it is read from the tail of those bytes while the frame the
 * parts are carried in is left unread.
 *
 * @see {@link Loaded.metadata} for reading it back.
 * @category models
 */
export const Metadata = Schema.Struct({
  version: Schema.String,
  compression: CompressionAlgorithm,
  hash: HashAlgorithm,
  digest: Schema.String,
});

export type Metadata = Schema.Schema.Type<typeof Metadata>;

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
 * A response part is written through the schemas of the toolkit it was produced
 * with — the tool results the toolkit's own tools state — so this is what those
 * schemas need, and `never` for a toolkit of plain ones. Nothing else a part
 * holds states a service: the parts of a trajectory are rebuilt from the plain
 * schemas of `effect/ai` and of this package rather than read as the schemas
 * they were produced with, which is what {@link Part} states. Reading takes
 * none, since the frames of a body are parsed synchronously.
 *
 * @see {@link Service.save} for the operation that requires them.
 * @category utility types
 */
export type EncodingServices<C extends Trajectory.AnyConfig> = Schema.Union<
  PartMembers<C>
>["EncodingServices"];

/**
 * A trajectory a storage holds under an id, as the operations that read it: what it
 * states of itself, the metadata it ends with, and the trajectory its parts make.
 *
 * **When to use**
 *
 * Use to read what a trajectory is before reading it — what it was made with, and
 * what names it, are both readable without reading its parts — or to read it once
 * as the trajectory it holds.
 *
 * **Details**
 *
 * - `header` is what the header a trajectory starts with states, decoded
 *   ({@link Header}), and is read while the trajectory is loaded: what a trajectory
 *   was made with is known without reading the frame its parts are carried in.
 * - `metadata` reads what a trajectory states at its end off its tail, without
 *   reading that frame either ({@link Metadata}).
 * - `read(config)` reads the whole trajectory as the trajectory its parts make, with
 *   the kits the config names: what a part is read as is what those kits state of the
 *   tag it carries, and a part none of them reads is stepped over rather than ending
 *   the reading — an event part of an event the config names none of, or a metric part
 *   of a metric it names none of, say — since a trajectory is read as far as the kits
 *   in hand state it ({@link Part}). The extra data of a part is held the same way: a
 *   kind the config names none of there is not data the part is read as holding. Reading
 *   with no config names no kit at all.
 *
 * What a load reads is the head of a trajectory alone, so a program that asks what
 * a trajectory states of itself reads neither its parts nor its tail, and what reads
 * the tail asks for the metadata and reads it alone ({@link Service.load}). `read`
 * is a function rather than a value because a trajectory is a stream of parts and a
 * stream is read once: each call gives the parts as they are read rather than a
 * reading already begun, and each reads the frame the parts are carried in again —
 * and the metadata with it, since where that frame ends is what the metadata says.
 *
 * Either of the three fails with what the trajectory fails with — bytes that do not
 * hold a header, a frame that does not decode, bytes that do not end with the
 * metadata of a trajectory — as {@link TrajectoryError}, and with what the
 * storage fails with as a failure of its own.
 *
 * @see {@link Service.load} for the operation that gives these.
 * @category models
 */
export interface Loaded {
  /**
   * What the trajectory states about itself, as the header the load of it read.
   */
  readonly header: Header;

  /**
   * What the trajectory states at its end about its own bytes — how the frame was
   * written and what the trajectory is named by — read from the tail of them
   * ({@link Metadata}).
   */
  readonly metadata: Effect.Effect<Metadata, TrajectoryError | StorageError>;

  /**
   * The trajectory the trajectory holds, read as the config given states it — with no
   * config, as the trajectory the most general reading makes — and the parts it is made
   * of as the bytes they are read from.
   */
  readonly read: <C extends Trajectory.AnyConfig = Trajectory.AnyConfig>(
    config?: C,
  ) => Trajectory.Trajectory<C, TrajectoryError | StorageError, never>;
}

/**
 * The exchange of a trajectory with a storage.
 *
 * **When to use**
 *
 * Use to save a trajectory where a program keeps its trajectories, or to load one
 * back, without naming the format those trajectories are in or where they are kept.
 *
 * **Details**
 *
 * {@link Service.save} writes a trajectory into the storage under an id, encoding
 * it as it is produced, and {@link Service.load} reads a trajectory kept under an id
 * as the operations it is read by ({@link Loaded}): loading reads the head of a
 * trajectory and what it takes, and the operations read the parts of it and its
 * tail where they are asked for.
 *
 * What those bytes are is the layer's to say, and where they are kept is the
 * storage's. An exchange holds neither: it asks the storage it was provided for the
 * bytes of a trajectory and for the place to write one, so what a storage fails with
 * is a failure of its own and what a trajectory fails with is a
 * {@link TrajectoryError}, and a program can tell the two apart by the error
 * alone.
 *
 * Either direction fails with what the trajectory fails with — a part that cannot
 * be encoded or decoded, bytes that do not decode — as {@link TrajectoryError}, on
 * top of the failures of what it reads: the trajectory being saved or the
 * trajectory being loaded as `E`, and the services they need as `R`, which saving
 * adds the services the parts' own schemas state to.
 *
 * @see {@link Exchange.layer} for the format this package ships.
 * @category models
 */
export interface Service {
  /**
   * Reads a trajectory kept under `id` into the operations it is read by.
   *
   * What loading reads is the head of a trajectory — the header it states itself
   * in — so a trajectory that is not there, or whose head is not a header, fails
   * here rather than when its trajectory is read. What is left for the operations is
   * the frame its parts are carried in and the metadata it ends with, neither of
   * which a load reads.
   */
  readonly load: (id: string) => Effect.Effect<Loaded, TrajectoryError | StorageError>;

  /**
   * Writes a trajectory into the storage under the id it is given.
   *
   * The trajectory comes first and the id second, as what a save is of is the
   * trajectory: `save(trajectory)(id)` produces one trajectory where trajectories are
   * kept, rather than naming a place and asking what goes in it.
   *
   * The trajectory is encoded as it is produced, so what it holds is never held
   * whole: what it states of itself is what the header carries, its parts
   * follow in the frame they are compressed into, and the metadata stating how that
   * frame was written and what the trajectory is named by, read off the bytes they
   * are carried in, follows them.
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
 * — and whatever storage that layer was provided with keeps its trajectories, so a
 * program that keeps trajectories some other way, or keeps them somewhere else,
 * provides a layer of its own and the code that exchanges them is unchanged.
 *
 * {@link Service.save} writes a trajectory where trajectories are kept, and
 * {@link Service.load} gives what one of them is read by ({@link Loaded}): what
 * it states of itself, read from its head, what it states at its end about its own
 * bytes, read from its tail, and the trajectory it holds, read out of it as it
 * arrives rather than once it has ended.
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
   * Use to state the format itself, and provide it with where its trajectories are
   * kept.
   *
   * **Details**
   *
   * A trajectory starts with the length of its header as four bytes, big-endian, and
   * the encoded {@link Header} after them; neither is compressed, so the head of a
   * file is readable — and its toolkit and kits knowable — without anything else.
   * What follows is one frame carrying the trajectory's parts, each encoded as one
   * SchemaBinary frame ({@link Part}), so a trajectory is read as it arrives rather
   * than once it has ended. The frame is followed by the metadata of the trajectory
   * ({@link Metadata}) as plain JSON, by the length of that JSON as four bytes,
   * big-endian, and by the magic `TRAJS` last: what a trajectory is named by is its
   * tail, and the length of the metadata, read off the end of the file, states where
   * the metadata begins, so it is read without the frame before it being read either
   * ({@link Loaded.metadata}). The magic ends every trajectory that was written
   * whole, so one that does not end with it was cut short.
   *
   * What the metadata states of the algorithms is what the compression and the hash
   * state of themselves ({@link Compression.algorithm}, {@link StreamHash.algorithm}),
   * and its version is the one this package is at, as its `package.json` states it.
   *
   * What writes and reads that frame is the compression the layer is provided
   * with, what hashes the parts is the hash it is provided with, and what holds the
   * bytes of a trajectory is the storage — so the layer requires all three rather
   * than holding any, and what a program provides them with is where its trajectories
   * are kept. These are `@trajs/utils`'s services: a program provides the layer a
   * platform package states them with, such as `@trajs/platform-node` — over
   * `node:zlib`, the Rust binding and `node:crypto` — or
   * `@trajs/platform-browser`, over WebAssembly codecs that run where `node:zlib` is
   * not.
   *
   * @see {@link Service} for the exchange the layer provides.
   * @category constructors
   */
  static readonly layer: Layer.Layer<Exchange, never, Storage | Compression | StreamHash> =
    Layer.effect(
      Exchange,
      Effect.gen(function* () {
        const storage = yield* Storage;
        const compression = yield* Compression;
        const hasher = yield* StreamHash;

        return service(Header, Metadata, storage, compression, hasher);
      }),
    );
}

/**
 * The parts of a trajectory as the frames of the format this package ships carry
 * them.
 *
 * **When to use**
 *
 * Use to read the parts of a trajectory this package wrote, or to write the parts
 * of a trajectory of your own in that format.
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
 * trajectory is read as the most general trajectory, whose response parts are
 * streams, and the response parts of any other kind are the members of that
 * schema too, so one schema carries the response parts of every kind.
 *
 * A part is written through the schemas of the toolkit it was produced with, so
 * encoding one takes what those schemas state ({@link EncodingServices}); what
 * the other parts state is the services of none, since a trajectory is rebuilt
 * from plain schemas rather than read as the schemas it was produced with.
 *
 * @see {@link Exchange.layer} for the format these frames belong to.
 * @category models
 */
export const Part = <C extends Trajectory.AnyConfig>(config: C): Schema.Union<PartMembers<C>> =>
  part(config);
