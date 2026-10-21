/**
 * Exchanging a trajectory with a storage.
 *
 * A trajectory is a stream of parts, and what a program keeps it in holds bytes.
 * {@link Exchange} is the seam between the two: {@link Service.save} encodes a
 * trajectory into its bytes, and {@link Service.load} reads back what a trajectory
 * states of itself, the metadata it ends with, and the trajectory its parts make. An
 * exchange performs no IO of its own — what writes and reads the bytes is a storage, a
 * compression and a hash ({@link Storage}, {@link Compression}, {@link StreamHash}),
 * provided with a layer such as {@link Exchange.layer} or one a platform package states —
 * and a reading that keeps the bytes of a frame between its readings requires a store of
 * sequences beside them ({@link Loaded.readCached}).
 */

import type { ByteStore, ByteStoreError } from "@trajs/utils/ByteStore";
import { Algorithm as CompressionAlgorithm, Compression } from "@trajs/utils/Compression";
import { Storage, type StorageError } from "@trajs/utils/Storage";
import { Algorithm as HashAlgorithm, StreamHash } from "@trajs/utils/StreamHash";
import { Context, Effect, Layer, Schema } from "effect";

import { Contribution, service } from "#/internal/exchange.ts";
import {
  part,
  type EncodingServices as Encoding,
  type PartMembers,
  type Readable,
} from "#/internal/parts.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

import pkg from "../package.json" with { type: "json" };

/**
 * The magic a trajectory written whole ends with: the ASCII `TRAJS`.
 *
 * **When to use**
 *
 * Use to end a trajectory of your own the way this format does, or to tell a
 * trajectory written whole from one that was cut short without going through an
 * exchange.
 *
 * **Details**
 *
 * The magic is the last of the bytes a trajectory carries ({@link Exchange.layer}), and
 * only a trajectory written whole carries it, so bytes that end with anything else were
 * cut short rather than holding a metadata. It is stated as the bytes a trajectory is
 * held in — the text they encode is `TRAJS` — and the exchange itself writes and reads
 * this same value, so it is read rather than changed.
 *
 * @see {@link Metadata} for what a trajectory states before the magic.
 * @category constants
 */
export const Magic = new TextEncoder().encode("TRAJS");

/**
 * The version of this package, which is the version a trajectory states of itself: the
 * one its bytes were written at.
 *
 * **When to use**
 *
 * Use to state the version of a trajectory of your own in this format, or to compare
 * what a trajectory states of itself ({@link Metadata}) with what wrote it.
 *
 * **Details**
 *
 * The version is read from this package's `package.json`, so what a trajectory states
 * is the version of trajs that wrote it rather than a version of the format's own.
 *
 * @see {@link Metadata} for where a trajectory states it.
 * @category constants
 */
export const Version = pkg.version;

/**
 * What a trajectory states about itself, before any of its parts.
 *
 * **When to use**
 *
 * Use to read what a trajectory was made with before decoding any of its parts.
 *
 * **Details**
 *
 * The toolkit and the kits a trajectory was made with are carried as the descriptions
 * they state of themselves — enough to name the tools, events, metrics and kinds of
 * extra data a trajectory refers to without their Effect Schemas: the toolkit as
 * {@link Toolkit.encode} describes it, and each kit as the name and description of
 * each contribution, keyed by tag.
 *
 * Where a trajectory carries it is the layer's to say; {@link Exchange.layer} says it
 * for the one this package ships.
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

/** The type of {@link Header}. */
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
 * - `compression` is the algorithm the parts were framed with
 *   ({@link Compression.Algorithm}) and `hash` the algorithm their digest was read
 *   with ({@link StreamHash.Algorithm}), each as the code it goes by, so a trajectory
 *   states what wrote it rather than leaving the reader to assume.
 * - `digest` is the digest of those parts, which is what names the trajectory — the
 *   lowercase hex a {@link StreamHash} reads one off with.
 * - `version` is the version of this package that wrote the trajectory
 *   ({@link Version}).
 *
 * Where a trajectory carries it is the layer's to say; {@link Exchange.layer} says it
 * for the one this package ships: the metadata is the last thing a trajectory holds,
 * so it is read from the tail of the bytes while the frame is left unread.
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

/** The type of {@link Metadata}. */
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
 * schemas need, and `never` for a toolkit of plain ones. No other part states a
 * service: the parts are rebuilt from the plain schemas of `effect/ai` and of this
 * package rather than read as the schemas they were produced with ({@link Part}).
 * Reading takes none, since frames of a body are parsed synchronously.
 *
 * @see {@link Service.save} for the operation that requires them.
 * @category utility types
 */
export type EncodingServices<C extends Trajectory.AnyConfig> = Encoding<C>;

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
 * - `header` is what the header a trajectory starts with states ({@link Header}),
 *   decoded while the trajectory is loaded — so what it was made with is known
 *   without reading the frame.
 * - `metadata` is what the metadata a trajectory ends with states ({@link Metadata}),
 *   read off its tail while the trajectory is loaded — so how its parts were written
 *   and what it is named by are known without reading that frame either.
 * - `read(config)` reads the whole trajectory as its parts make it, under the kits
 *   the config names: a part none of them reads is stepped over rather than ending the
 *   reading — an event part of an event the config does not name, say — since a
 *   trajectory is read as far as the kits in hand state it ({@link Part}). The extra
 *   data of a part is held the same way, and a reading with no config names no kit.
 *   A config whose response parts are whole — one that states `stream` off
 *   ({@link Trajectory.NonStreamConfig}) — reads it folded: the bytes carry the
 *   increments a streamed answer arrived in as well as the whole parts they complete,
 *   so what such a reading yields is the whole parts.
 * - `readCached(config)` reads it the same way, over the bytes a store keeps for it
 *   rather than the storage ({@link Loaded.readCached}).
 *
 * A load reads what a trajectory states of itself and nothing else — the header at its
 * head and the metadata at its tail — so what a trajectory states of itself is known
 * without reading its parts or the frame they are carried in ({@link Service.load}).
 * `read` is a function rather than a value because a stream is read once: each call
 * gives the parts as they are read, and reads the frame again — or, where those bytes
 * were kept by a reading before it, reads them from there.
 *
 * A config a trajectory is read as is one whose parts take no service to read: a
 * trajectory is read from its bytes synchronously rather than run, so a part read through
 * a schema that needs a service is not one a trajectory is read with. What a kit states
 * is read as the plain schemas it is rebuilt from, which take none; a toolkit is what can
 * state one, through the schemas its own tools state their results with ({@link Part}).
 *
 * Each fails with {@link TrajectoryError} where the trajectory cannot be read — bytes
 * that hold no header, a frame that does not decode, bytes that do not end with the
 * metadata — and with the failure of what served the bytes: the storage's own failure,
 * and the store's where a reading keeps the bytes in one.
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
   * What the trajectory states at its end about its own bytes, as the metadata read
   * off the tail of them — how the frame was written and what the trajectory is named
   * by ({@link Metadata}).
   */
  readonly metadata: Metadata;

  /**
   * The trajectory the trajectory holds, read as the config given states it — with no
   * config, as the trajectory the most general reading makes — and the parts it is made
   * of as the bytes they are read from.
   *
   * A config whose response parts are whole reads it folded, as {@link Loaded} states:
   * the increments a streamed answer arrived in are read as the whole parts they
   * complete, since a trajectory is carried as the most general one ({@link Part}).
   *
   * TODO: what is kept of a trajectory here is kept as the bytes of its frame, whether that is
   * the storage's ({@link Loaded.readCached}) or memory's, because a trajectory is one stream
   * and a stream is read once: a second reading of the parts has to be a reading of something
   * that is held. Held in memory, the parts need no encoding at all — the capability a stream
   * states for this (`Stream.share` with a `replay` a later subscriber reads, or the pull one is
   * taken through) serves the same parts to every reader of them without their being written
   * out and read back. `Trajectory.toSessions` keeps the parts of a session the same way, so
   * what settles one settles both.
   */
  readonly read: <C extends Trajectory.AnyConfig = Trajectory.AnyConfig>(
    config?: C & Readable<C>,
  ) => Trajectory.Trajectory<C, TrajectoryError | StorageError, never>;

  /**
   * The trajectory the trajectory holds, read as {@link Loaded.read} reads it, except
   * that the bytes its parts are carried in are kept in a store rather than read from
   * the storage again.
   *
   * **Details**
   *
   * The bytes read from the storage the first time are written to the store under what
   * the trajectory states of them — the hash and the digest of its parts, which is what
   * {@link Metadata} names it by — so every reading after that, here and in any other
   * load of a trajectory whose bytes are the same, takes them from the store rather
   * than reading the storage and the frame a second time. Nothing of a config travels
   * with them: the bytes are the frame a trajectory is carried in, so they are read as
   * the kits any reading of it states.
   *
   * The store is a store of byte sequences ({@link ByteStore}), which a
   * reading of a trajectory this way requires and one through {@link Loaded.read} does
   * not: a store's layers are their own — memory, a file system, a database — so where
   * the bytes live is the program's to say, and one that reads a trajectory again
   * provides a store. `ByteStore.layer` keeps them in memory, which is what a reading
   * that keeps them no longer than the program runs takes, and `ByteStore.layerKVStore`
   * keeps them in the key/value store a program states.
   *
   * The frame is kept in that store as it is read rather than held whole, and is cut
   * into chunks of a size the store states: so a trajectory too large to hold is read
   * this way all the same, and a reading that ends before the frame does keeps nothing.
   *
   * @see {@link Loaded.read} for reading a trajectory without keeping its bytes.
   */
  readonly readCached: <C extends Trajectory.AnyConfig = Trajectory.AnyConfig>(
    config?: C & Readable<C>,
  ) => Trajectory.Trajectory<C, TrajectoryError | StorageError | ByteStoreError, ByteStore>;
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
 * as the operations it is read by ({@link Loaded}).
 *
 * What those bytes are is the layer's to say, and where they are kept is the
 * storage's. An exchange holds neither: it asks the storage it was provided for the
 * bytes of a trajectory and for the place to write one, so what a storage fails with
 * is a failure of its own and what a trajectory fails with is a
 * {@link TrajectoryError}, and a program can tell the two apart by the error
 * alone.
 *
 * Either direction fails with what the trajectory fails with as
 * {@link TrajectoryError}, on top of the failures of what it reads: the trajectory
 * being saved or the trajectory being loaded as `E`, and the services they need as
 * `R`, which saving adds the services the parts' own schemas state to.
 *
 * @see {@link Exchange.layer} for the format this package ships.
 * @category models
 */
export interface Service {
  /**
   * Reads a trajectory kept under `id` into the operations it is read by.
   *
   * What loading reads is what a trajectory states of itself — the header at its head
   * and the metadata at its tail — so a trajectory that is not there, whose head is
   * not a header, or whose bytes do not end with the metadata fails here rather than
   * when its trajectory is read. The frame the parts are carried in is left for
   * `read`, which a load never reads.
   */
  readonly load: (id: string) => Effect.Effect<Loaded, TrajectoryError | StorageError>;

  /**
   * Writes a trajectory into the storage under the id it is given.
   *
   * The trajectory comes first and the id second, as what a save is of is the
   * trajectory: `save(trajectory)(id)` produces one trajectory where trajectories are
   * kept.
   *
   * The trajectory is encoded as it is produced, so it is never held whole: the header
   * carries what it states of itself, its parts follow in the frame they are compressed
   * into, and the metadata stating how that frame was written and what names the
   * trajectory follows them.
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
 * An effect written against this service takes whatever format its layer writes —
 * nothing of a format is part of what an exchange requires — and whatever storage
 * that layer was provided with keeps its trajectories, so a program that keeps
 * trajectories another way provides a layer of its own and the exchanging code is
 * unchanged.
 *
 * It fails with the failures of what it reads as `E` on top of the
 * {@link TrajectoryError} a part that cannot be encoded or decoded fails with, and
 * requires the services `R` names.
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
   * file is readable — and its toolkit and kits knowable — without anything else. What
   * follows is one frame carrying the trajectory's parts, each encoded as one
   * SchemaBinary frame ({@link Part}), so a trajectory is read as it arrives rather
   * than once it has ended. The frame is followed by the metadata of the trajectory
   * ({@link Metadata}) as plain JSON, by the length of that JSON as four bytes,
   * big-endian, and by the magic {@link Magic} last: the metadata's length, read off
   * the end of the file, states where it begins, so it is read without the frame before
   * it ({@link Loaded.metadata}). The magic ends every trajectory that was written
   * whole, so one that does not end with it was cut short.
   *
   * What the metadata states of the algorithms is what the compression and the hash
   * state of themselves ({@link Compression.algorithm}, {@link StreamHash.algorithm}),
   * and its version is the one this package is at ({@link Version}).
   *
   * What writes and reads that frame is the compression the layer is provided with,
   * what hashes the parts is the hash it is provided with, and what holds the bytes of a
   * trajectory is the storage — so the layer requires all three rather than holding any.
   * These are `@trajs/utils`'s services, re-exported here: a program provides the layer a
   * platform package states them with, such as `@trajs/platform-node` or
   * `@trajs/platform-browser`. A reading that keeps the bytes of a frame requires a store
   * of sequences beside them ({@link Loaded.readCached}), which this layer holds no more
   * than it holds a storage: a program provides one ({@link ByteStore.layer}) where it
   * reads trajectories again.
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
