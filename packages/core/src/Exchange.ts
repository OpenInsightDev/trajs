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
 * parts are carried in one zstd frame, and how such a frame is written and read
 * is not the format's to state either: a layer is built over a
 * {@link Compression}, which this package ships for `node:zlib` as
 * {@link Zstd.compression} and which a program without `node:zlib` — a page, say
 * — provides a decoder of its own as.
 */

import { Context, Layer, Schema, Sink, Stream } from "effect";

import type * as Event from "#/Event.ts";
import type * as Extra from "#/Extra.ts";
import { Contribution, headerSink, part, service, type PartMembers } from "#/internal/exchange.ts";
import type * as Metric from "#/Metric.ts";
import type * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

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
 * Use to build a layer of the format this package ships where `node:zlib` is not
 * there to compress with — a page, say — or to state how the parts of a recording
 * are carried some other way.
 *
 * **Details**
 *
 * What a recording is of is the format's: a header line, and after it one zstd
 * frame carrying one SchemaBinary frame per part ({@link Exchange.layer}). How
 * that frame is written and read is this: `compress` takes the chunks of a stream
 * and gives back the chunks of the same stream compressed, and `decompress` takes
 * the chunks of a compressed one and gives back the chunks it decompresses to.
 *
 * Either direction reports what it failed with as {@link TrajectoryError}, since a
 * frame that cannot be written or read is a recording that failed rather than a
 * compression that did; a failure of the chunks the stream carries is left to pass
 * through as the failure it is.
 *
 * **Example** (A layer over the compression `node:zlib` provides)
 *
 * ```ts import.meta.vitest
 * import { Exchange } from "@trajs/core"
 * import { compression } from "@trajs/core/Zstd"
 *
 * const layer = Exchange.layer(compression())
 * ```
 *
 * @see {@link Exchange.layer} for the layer it is built over.
 * @see {@link Zstd.compression} for the one this package ships.
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
 * itself, and {@link Service.read} turns the bytes of a recording into a
 * trajectory once the kits it was recorded with are in hand.
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
   * whole, and what it states of itself is what the header line carries.
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
   * Decodes the bytes of a recording into a trajectory of the kits it is handed.
   *
   * The header line a recording starts with is read and passed by, since a
   * recording is read with the kits themselves rather than with the names the
   * header carries; what the trajectory goes by is the metadata it is handed.
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
   * Use when a program keeps recordings the way this package writes them, over
   * the compression it has to carry them with.
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
   * than once it has ended.
   *
   * `compression` is what that frame is written and read with.
   * {@link Zstd.compression} is the one this package ships, over `node:zlib`,
   * taken straight as `node:zlib` takes it; a program without `node:zlib` — a
   * page, say — builds the layer over a compression of its own, which is the only
   * thing that changes ({@link Compression}).
   *
   * **Example** (Setting how the parts are compressed)
   *
   * ```ts import.meta.vitest
   * import { Exchange } from "@trajs/core"
   * import { compression } from "@trajs/core/Zstd"
   *
   * const layer = Exchange.layer(compression({ chunkSize: 64 * 1024 }))
   * ```
   *
   * @see {@link Service} for the exchange the layer provides.
   * @see {@link Compression} for what carries a recording's parts.
   * @category constructors
   */
  static readonly layer = (compression: Compression): Layer.Layer<Exchange> =>
    Layer.succeed(Exchange, service(headerSink(Header), compression));
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
