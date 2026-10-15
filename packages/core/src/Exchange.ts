/**
 * Exchanging a trajectory with a storage.
 *
 * A trajectory is a stream of parts, and what a program keeps it in — a file, a
 * database, a bucket — holds bytes. {@link Exchange} is the seam between the two:
 * {@link Service.save} encodes a trajectory into the bytes a recording is made
 * of, and {@link Service.load} reads back what a recording states of itself, the
 * digest it ends with, and the trajectory its parts make. Those bytes are read at
 * random — the head of a recording for what it states of itself, its tail for the
 * digest it ends with — and held under an id by the storage the exchange was
 * provided, so an exchange performs no IO of its own: it asks that storage for the
 * bytes of a recording and for the place to write one, and where those bytes are
 * kept is the storage's to say.
 *
 * What those bytes are is the layer's to say. {@link Exchange.layer} is the format
 * this package ships — the bytes a `.trajs` file holds, described on the layer
 * itself — and a program that keeps recordings some other way provides a layer of
 * its own, which is the only thing that changes. Of that format, a recording
 * starts with a header line stating what it was made with, the parts follow in one
 * zstd frame, and the digest of those parts follows them; reading at random is what
 * lets the head of a recording be read for the header line and its tail for the
 * digest without reading the frame between them. How such a frame is written, how
 * the parts are hashed and where a recording is kept are not the format's to
 * state: the layer is built over a compression of the parts, over a hash of them
 * and over a storage, which are `@trajs/utils`'s services — a program provides the
 * layer a platform package states them with, such as `@trajs/platform-node` for one
 * that runs on Node — over `node:zlib`, the BLAKE3 binding and the files of the
 * machine — or `@trajs/platform-browser` for one that runs where `node:zlib` is not,
 * a page say.
 */

import { Compression } from "@trajs/utils/Compression";
import { Storage, type StorageError } from "@trajs/utils/Storage";
import { StreamHash } from "@trajs/utils/StreamHash";
import { Context, Effect, Layer, Schema } from "effect";

import { Contribution, part, service, type PartMembers } from "#/internal/exchange.ts";
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
 * digest — as {@link TrajectoryError}, and with what the storage fails with as a
 * failure of its own.
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
 * storage's. An exchange holds neither: it asks the storage it was provided for the
 * bytes of a recording and for the place to write one, so what a storage fails with
 * is a failure of its own and what a recording fails with is a
 * {@link TrajectoryError}, and a program can tell the two apart by the error
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
   * kept.
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
   * What writes and reads that frame is the compression the layer is provided
   * with, what hashes the parts is the hash it is provided with, and what holds the
   * bytes of a recording is the storage — so the layer requires all three rather
   * than holding any, and what a program provides them with is where its recordings
   * are kept. These are `@trajs/utils`'s services: a program provides the layer a
   * platform package states them with, such as `@trajs/platform-node` — over
   * `node:zlib`, a BLAKE3 binding and the files of the machine — or
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

        return service(Header, storage, compression, hasher);
      }),
    );
}

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
