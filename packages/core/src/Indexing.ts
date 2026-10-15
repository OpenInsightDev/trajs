/**
 * Indexing a trajectory: the whole of a recording read into memory once, so that
 * what it holds is asked of the index rather than read out of the stream it arrived
 * in.
 *
 * A trajectory is one stream of parts in total order — see {@link Trajectory} — so
 * every question about a recording that is not about the parts as they arrive is
 * answered by reading the recording to its end first. An {@link Index} is that
 * reading: a schema stating what the index holds, and the sink that holds it, which
 * {@link build} runs over a trajectory.
 *
 * Two indexes are stated here. {@link parts} holds every part of a recording with
 * the data it carries left behind — the messages a model was given, the response it
 * returned, the data an event or a metric was recorded with, and the extra data a
 * kit declared of a part — so what is left is what each part is and where it sits.
 * {@link sessions} holds the sessions of a recording read as they are recorded
 * ({@link Session.sessions}), each with the parts it recorded held the same way:
 * where it continues from, and the ones forked off it.
 */

import { Context, Effect, Layer, Option, Schema, Sink, Stream } from "effect";
import * as Struct from "effect/Struct";

import * as Event from "#/Event.ts";
import * as Extra from "#/Extra.ts";
import * as Metric from "#/Metric.ts";
import { type Session as Read, sessions as read } from "#/Session.ts";
import * as Toolkit from "#/Toolkit.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * An index of a trajectory of the config given: what it holds, and the sink that
 * holds it.
 *
 * **When to use**
 *
 * Use to type an index — one of the two this module states, or one of your own — or
 * to name one a function takes.
 *
 * **Details**
 *
 * - `Config` is what the parts of a trajectory are read with as the index is built,
 *   so an index is of a reading of a recording rather than of a recording: an index
 *   of {@link Trajectory.AnyConfig} reads the parts of any recording, whichever kits
 *   it was written with — which is what the two this module states are, both holding
 *   nothing a kit states of a part — while an index of a config holds what that
 *   config states of a part, such as the tool a response part was returned by or the
 *   extra data a kit declared of one, and is built from a trajectory read with that
 *   config alone.
 * - `schema` states what the index holds. It is a plain schema rather than a
 *   {@link VersionedSchema.VersionedSchema}: an index is derived from a recording
 *   rather than recorded, so what reads one is the program that built it, and a
 *   change to what an index holds is a change to that program.
 * - `sink` is what holds it: one reading of a trajectory's parts to their end, so
 *   what a sink holds is anything an array of parts can be read into — an order, a
 *   set, the sessions they were recorded in — and nothing of a part is held before the
 *   whole recording is. What the sink fails with is `E` on top of what the trajectory
 *   fails with, and what it requires is `R`.
 *
 * @see {@link build} for reading a trajectory into an index.
 * @category models
 */
export interface Index<Config extends Trajectory.AnyConfig, A, E = never, R = never> {
  readonly schema: Schema.Schema<A>;
  readonly sink: Sink.Sink<A, Trajectory.Part<Config>, never, E, R>;
}

/**
 * Reads a trajectory into the index given.
 *
 * **When to use**
 *
 * Use to hold what a recording is asked about more than once — the parts it is made
 * of, the sessions it declares, an index of your own — rather than read the recording
 * again for each question: a trajectory is a stream, and a stream is read once.
 *
 * **Details**
 *
 * The trajectory is read through the index's sink, and what the effect yields is
 * what the index holds. The recording is read as it arrives and held only as the
 * index holds it, so what an index does not hold is never held. The effect fails
 * with what the trajectory fails with, and with `E` where a recording cannot be
 * read into the index (see {@link sessions}), and it requires what either of them
 * does.
 *
 * The trajectory is of the config the index is of ({@link Index}), so an index of a
 * config reads a recording that was read with it and no other: what an index holds
 * of a part is what that config states of it.
 *
 * **Example** (Reading a recording into the sessions it declares)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Extra, Indexing, Prompt, Trajectory } from "@trajs/core"
 *
 * const extrakit = Extra.makeKit()
 *
 * const asked = Trajectory.promptPart(extrakit)({
 *   prompt: Prompt.make("What is a fork?"),
 *   sessionId: "asking"
 * })
 * const forking = Trajectory.sessionPart(extrakit)({ id: "replying", fork: asked.uuid })
 *
 * const trajectory = Stream.make(
 *   Trajectory.sessionPart(extrakit)({ id: "asking" }),
 *   asked,
 *   forking
 * )
 *
 * const index = await Effect.runPromise(Indexing.build(Indexing.sessions)(trajectory))
 *
 * Object.keys(index) // => ["asking", "replying"]
 * index["asking"]?.forkedBy // => ["replying"]
 * index["replying"]?.forkedFrom?.session // => "asking"
 * ```
 *
 * @see {@link Index} for what an index is made of.
 * @see {@link parts} and {@link sessions} for the two this module states.
 * @category combinators
 */
export const build =
  <Config extends Trajectory.AnyConfig, A, E, R>(index: Index<Config, A, E, R>) =>
  <E2, R2>(
    trajectory: Trajectory.TrajectoryStream<Config, E2, R2>,
  ): Effect.Effect<A, E | E2, R | R2> =>
    Stream.run(trajectory, index.sink);

/**
 * The kits the part schemas are read with as the schemas of an index are derived,
 * all of them empty: an index holds nothing a kit states of a part, so the fields
 * left out are the ones a kit states and what remains reads the same whichever kit
 * the part was recorded with — which is why {@link parts} is an index of
 * {@link Trajectory.AnyConfig}.
 */
const kits = {
  toolkit: Toolkit.empty,
  eventkit: Event.makeKit(),
  metrickit: Metric.makeKit(),
  extrakit: Extra.makeKit(),
};

/**
 * The fields of each kind of part that carry the data it holds, which an index leaves
 * behind: what a part holds of what was said or derived, rather than what it is and
 * where it sits. They are named once and read twice, since what an index holds of a
 * part is both stated by {@link Part} and built by {@link parts}.
 */
const data = {
  Prompt: ["messages", "extra"],
  Session: ["extra"],
  Response: ["response", "extra"],
  Event: ["event"],
  Metric: ["metric"],
} as const;

const PromptPart = Trajectory.PromptPart(kits.extrakit).mapFields((fields) =>
  Struct.omit(fields, data.Prompt),
);

const SessionPart = Trajectory.SessionPart(kits.extrakit).mapFields((fields) =>
  Struct.omit(fields, data.Session),
);

/**
 * The response part schema of a streaming trajectory, which every response part of a
 * recording is a member of, less {@link data}.
 */
const ResponsePart = Trajectory.ResponsePart({
  toolkit: kits.toolkit,
  extrakit: kits.extrakit,
  stream: true,
}).mapFields((fields) => Struct.omit(fields, data.Response));

const EventPart = Trajectory.EventPart(kits.eventkit).mapFields((fields) =>
  Struct.omit(fields, data.Event),
);

const MetricPart = Trajectory.MetricPart(kits.metrickit).mapFields((fields) =>
  Struct.omit(fields, data.Metric),
);

/**
 * A part of a trajectory as {@link parts} holds it: what the part is and where it
 * sits, without the data it carries.
 *
 * **When to use**
 *
 * Use to read the parts of a recording as an index holds them, to type one of them
 * — what a function takes, say — or to decode one a program was handed.
 *
 * **Details**
 *
 * The schema of a part is the schema of the part it is ({@link Trajectory.PromptPart}
 * and the part schemas beside it) with the fields that carry data left out
 * ({@link data}), so what one holds is where the part sits and nothing of what it
 * says:
 *
 * - A prompt part holds the session it was recorded in and the uuid it is named by,
 *   and nothing of the messages a model was given.
 * - A session part holds the id it declares, the part it continues from and the uuid
 *   it is named by.
 * - A response, event or metric part holds the session it was recorded in where it
 *   names one, when it was recorded, and the uuid it is named by, and nothing of the
 *   response a model returned or of the event or metric that was recorded.
 *
 * Nothing a kit states of a part is held, since what a kit states of a part is data
 * rather than placement: the extra data it declared of a prompt, response or session
 * part, and the tag of the event or of the metric a part names, which is a field of
 * the event or metric itself. That is why a recording reads the same way whatever kits
 * it was written with ({@link Trajectory.AnyConfig}), and an index of a config is what
 * reads what a kit states of a part ({@link Index}).
 *
 * @see {@link parts} for the index that holds these.
 * @category models
 */
export const Part = Schema.Union([PromptPart, SessionPart, ResponsePart, EventPart, MetricPart]);

export type Part = Schema.Schema.Type<typeof Part>;

const stripped = (part: Trajectory.Part<Trajectory.AnyConfig>): Part => {
  switch (part._tag) {
    case "Prompt":
      return Struct.omit(part, data.Prompt);

    case "Session":
      return Struct.omit(part, data.Session);

    case "Response":
      return Struct.omit(part, data.Response);

    case "Event":
      return Struct.omit(part, data.Event);

    case "Metric":
      return Struct.omit(part, data.Metric);
  }
};

/**
 * A sink that holds every part of a trajectory, in the order it is recorded: what an
 * index of a recording is built by, whether it holds the parts themselves
 * ({@link parts}) or reads them into something else ({@link sessions}).
 */
const collected = <A>(): Sink.Sink<ReadonlyArray<A>, A> =>
  // The array is the reading's own: `Sink.reduce` asks for the initial value when it
  // reads, so the parts of one reading are held in an array no other reading holds.
  Sink.reduce<Array<A>, A>(
    () => [],
    (all, part) => {
      all.push(part);

      return all;
    },
  );

/**
 * The parts index: every part of a recording, with the data it carries left behind.
 *
 * **When to use**
 *
 * Use to read the structure of a recording — what it is made of, in the order it
 * was recorded, and which session each part belongs to — without holding the
 * messages, the responses, the events, the metrics and the extra data it was
 * recorded with; and as the parts a session of it is held by ({@link sessions}).
 *
 * **Details**
 *
 * Every part is held, in the order it was recorded, as the part it is with the fields
 * that carry data left out ({@link Part}), so a recording of any kind reads the same
 * way: the schema of the index is the part schemas with those fields left out, which
 * is why the index is of {@link Trajectory.AnyConfig} ({@link Index}). A recording
 * that is being recorded reads as it arrives, since the parts are held where they are
 * read rather than where the trajectory ends.
 *
 * **Example** (The parts of a recording, without what they say)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Extra, Indexing, Prompt, Response, Toolkit, Trajectory } from "@trajs/core"
 *
 * const extrakit = Extra.makeKit()
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 *
 * const trajectory = Stream.make(
 *   Trajectory.sessionPart(extrakit)({ id: sessionId }),
 *   Trajectory.promptPart(extrakit)({ prompt: Prompt.make("What is 2 + 2?"), sessionId }),
 *   Trajectory.responsePart({ toolkit: Toolkit.empty, extrakit, stream: false })({
 *     response: Response.makePart("text", { text: "4" }),
 *     sessionId
 *   })
 * )
 *
 * const index = await Effect.runPromise(Indexing.build(Indexing.parts)(trajectory))
 *
 * index.map((part) => part._tag) // => ["Session", "Prompt", "Response"]
 * Object.hasOwn(index[1], "messages") // => false
 * Object.hasOwn(index[2], "response") // => false
 * ```
 *
 * @see {@link Part} for what one part is held as.
 * @see {@link sessions} for the sessions of a recording, held the same way.
 * @category constructors
 */
export const parts: Index<Trajectory.AnyConfig, ReadonlyArray<Part>> = {
  schema: Schema.Array(Part),
  sink: collected<Part>().pipe(Sink.mapInput(stripped)),
};

/**
 * Where a session continues from: the session that recorded the part the `fork` of
 * this one's declaration named, and that part — {@link Session.Fork}, as an index
 * holds it.
 *
 * **When to use**
 *
 * Use to read where a session was forked from, or to type one of your own.
 *
 * **Details**
 *
 * A `fork` names a part rather than a session ({@link Trajectory.SessionPart}), so
 * what one holds is that part — `part` — and the session that recorded it, which is
 * the session this one inherited its parts from. Those are named rather than held,
 * since an index holds every session of a recording once: read the session itself off
 * {@link Sessions}.
 *
 * @see {@link Session.Fork} for the fork a reading of a recording holds.
 * @category models
 */
export const Fork = Schema.Struct({
  session: Schema.String,
  part: Part,
});

export type Fork = Schema.Schema.Type<typeof Fork>;

/**
 * One session of a recording as {@link sessions} holds it: the parts it recorded, the
 * session it forked from, and the ones forked off it.
 *
 * **When to use**
 *
 * Use to read one session of a recording — what it recorded, and how it relates to
 * the sessions around it.
 *
 * **Details**
 *
 * It is what {@link Session.Session} states of a session, with the sessions it relates
 * to named by id rather than served as they are read, since an index holds every
 * session of a recording once ({@link Sessions}):
 *
 * - `parts` are the parts this session recorded, in the order it recorded them,
 *   beginning with the declaration of it, held as the index of the recording holds
 *   them ({@link Part}). What a session inherited from the session it forked from is
 *   among that session's parts rather than among these ({@link Session.Fork}).
 * - `forkedFrom` is the part the session's declaration named the `fork` of, and the
 *   session that recorded it, and is left out where the session continues from nothing.
 * - `forkedBy` names the sessions forked off this one, in the order they were declared,
 *   each continuing from one of this session's parts.
 *
 * @see {@link Sessions} for the sessions a recording declares.
 * @category models
 */
export const Session = Schema.Struct({
  id: Schema.String,
  forkedFrom: Schema.optional(Fork),
  parts: Schema.Array(Part),
  forkedBy: Schema.Array(Schema.String),
});

export type Session = Schema.Schema.Type<typeof Session>;

/**
 * The sessions a recording declares, as an index holds them: {@link Session.Sessions},
 * which a reading of a recording serves as they arrive and an index holds whole — held
 * once each, under the id the recording names it by.
 *
 * **When to use**
 *
 * Use to read a recording's sessions — what one of them recorded, where it continues
 * from, and which were forked off it — without walking the forks to find one.
 *
 * **Details**
 *
 * The sessions are in the order a reading of a recording reaches them: the roots —
 * those with no `forkedFrom` — are in the order the recording declared them, each
 * followed by the ones forked off it. A session whose first part is not a declaration
 * is one the recording never declares, and is among the roots as one nothing was forked
 * from.
 *
 * @see {@link sessions} for reading a trajectory as one.
 * @category models
 */
export const Sessions = Schema.Record(Schema.String, Session);

export type Sessions = Schema.Schema.Type<typeof Sessions>;

/**
 * A recording read as the sessions it declares — {@link Session.sessions} — held in
 * memory: one session and the sessions forked off it, by id, which are held the same
 * way.
 *
 * A session is read as a reading of a recording reads one, since reading one here and
 * reading one there are the same reading: the parts are routed to the session that
 * names them, a `fork` is resolved against the part it names, and a recording that
 * does not hold what reading its sessions needs fails rather than being held.
 */
const held = (session: Read<Trajectory.AnyConfig>): Effect.Effect<Sessions, TrajectoryError> =>
  Effect.gen(function* () {
    const parts = Array.from(yield* Stream.runCollect(session.parts));
    const forks = Array.from(yield* Stream.runCollect(session.forkedBy));

    const forked = yield* Effect.forEach(forks, held);

    const sessions = {
      [session.id]: {
        id: session.id,
        forkedFrom: Option.match(session.forkedFrom, {
          onNone: () => undefined,
          onSome: (fork) => ({ session: fork.session.id, part: stripped(fork.part) }),
        }),
        parts: parts.map(stripped),
        forkedBy: forks.map((fork) => fork.id),
      },
    };

    for (const subtree of forked) {
      Object.assign(sessions, subtree);
    }

    return sessions;
  });

const sessionsOf = (
  recorded: ReadonlyArray<Trajectory.Part<Trajectory.AnyConfig>>,
): Effect.Effect<Sessions, TrajectoryError> =>
  Effect.gen(function* () {
    const roots = Array.from(yield* Stream.runCollect(read(Stream.fromIterable(recorded))));

    const readings = yield* Effect.forEach(roots, held);

    const sessions: Record<string, Session> = {};

    for (const subtree of readings) {
      Object.assign(sessions, subtree);
    }

    return sessions;
  });

/**
 * The sessions index: the sessions a recording declares, and what was forked off
 * them.
 *
 * **When to use**
 *
 * Use to read a recording's sessions without reading its parts one at a time — to
 * show the sessions of a recording and how they forked from one another, or to read
 * what one of them recorded.
 *
 * **Details**
 *
 * A recording is read as its sessions exactly as {@link Session.sessions} reads them,
 * and what a session recorded is held as the parts index holds it ({@link parts}), so
 * an index of either kind reads a recording the same way. It is of
 * {@link Trajectory.AnyConfig}, as the parts are ({@link Index}).
 *
 * A recording whose sessions cannot be read is not read into sessions: a `fork` naming
 * a part the recording does not hold by the time the declaration reading it is read
 * fails with an `"unrecorded-fork"`, and a session declared after the parts it recorded
 * with a `"late-declaration"` — see {@link TrajectoryError.SessionError} for what each
 * says of the session it names, and {@link Session.sessions} for the reading that
 * states them.
 *
 * **Example** (The sessions of a recording, and what each of them recorded)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Extra, Indexing, Prompt, Trajectory } from "@trajs/core"
 *
 * const extrakit = Extra.makeKit()
 *
 * const asked = Trajectory.promptPart(extrakit)({
 *   prompt: Prompt.make("What is 2 + 2?"),
 *   sessionId: "asking"
 * })
 *
 * // A recording of two sessions: the one that asked, and the one forked off it at
 * // the part that asked.
 * const trajectory = Stream.make(
 *   Trajectory.sessionPart(extrakit)({ id: "asking" }),
 *   asked,
 *   Trajectory.sessionPart(extrakit)({ id: "replying", fork: asked.uuid })
 * )
 *
 * const index = await Effect.runPromise(Indexing.build(Indexing.sessions)(trajectory))
 *
 * Object.keys(index) // => ["asking", "replying"]
 * index["asking"]?.parts.map((part) => part._tag) // => ["Session", "Prompt"]
 * index["replying"]?.forkedFrom?.part.uuid === asked.uuid // => true
 * ```
 *
 * @see {@link Sessions} for what it holds.
 * @see {@link parts} for the parts it holds a session by.
 * @category constructors
 */
export const sessions: Index<Trajectory.AnyConfig, Sessions, TrajectoryError> = {
  schema: Sessions,
  sink: collected<Trajectory.Part<Trajectory.AnyConfig>>().pipe(Sink.mapEffect(sessionsOf)),
};

/**
 * The hash a trajectory is fingerprinted with: BLAKE3 over the bytes a recording
 * carries its parts in.
 *
 * **When to use**
 *
 * Use to require a fingerprint of a program — what names a trajectory by the
 * bytes it is carried in rather than by the parts it is made of — or to write a
 * layer of your own, and {@link nodeLayer} or {@link wasmLayer} to provide one of
 * the two this package states.
 *
 * **Details**
 *
 * A fingerprint is a hash of bytes rather than of parts: a {@link Hasher} is fed
 * the bytes a recording carries its parts in, in the order they were recorded,
 * and the fingerprint is read off it once they have ended. What those bytes are
 * is the format's and the same for every program — a part of a recording is
 * carried the way `Exchange.Part` carries it rather than the way a program
 * happened to read it — so the fingerprint of a trajectory is the same wherever
 * one is computed from it.
 *
 * The two layers this package states differ in what they need to run, and neither
 * is loaded unless it is provided: {@link nodeLayer} is over a Rust binding that
 * only a program that runs on Node loads, and {@link wasmLayer} is over a
 * WebAssembly build of the same hash that runs anywhere WebAssembly does. BLAKE3
 * is what either computes, so a fingerprint one layer writes the other agrees
 * with.
 *
 * @see {@link Hasher} for what a fingerprint is computed with.
 * @category services
 */
export interface Fingerprint {
  /**
   * A hasher of one stream of bytes: the bytes a recording carries its parts in
   * are fed to it in the order they were recorded, and the fingerprint is read
   * off it once they have ended.
   */
  readonly hasher: () => Hasher;
}

/**
 * The service tag a trajectory is fingerprinted through.
 *
 * **When to use**
 *
 * Use to require a fingerprint of a program, and {@link nodeLayer} or
 * {@link wasmLayer} to provide one the way the program runs.
 *
 * **Details**
 *
 * An effect written against this service is fingerprinted by whatever the layer
 * it is provided with hashes with — nothing of how a fingerprint is computed is
 * part of what one requires — so a program that hashes bytes some other way
 * provides a layer of its own and the code that reads a fingerprint is
 * unchanged.
 *
 * **Example** (Fingerprinting the bytes of a recording)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Fingerprint, nodeLayer } from "@trajs/core/Indexing"
 *
 * const program = Effect.gen(function*() {
 *   const fingerprinted = yield* Fingerprint
 *   const hashing = fingerprinted.hasher()
 *
 *   hashing.update(new TextEncoder().encode("hello"))
 *
 *   return hashing.digest()
 * })
 *
 * const fingerprint = await Effect.runPromise(Effect.provide(program, nodeLayer))
 *
 * fingerprint // => "ea8f163db38682925e4491c5e58d4bb3506ef8c14eb78a86e908c5624a67200f"
 * ```
 *
 * @see {@link Fingerprint} for what a fingerprint is made of.
 * @category services
 */
export const Fingerprint: Context.Service<Fingerprint, Fingerprint> = Context.Service<
  Fingerprint,
  Fingerprint
>()("trajs/core/Indexing/Fingerprint");

/**
 * The hasher a {@link Fingerprint} computes a fingerprint with.
 *
 * **When to use**
 *
 * Use to type what a layer hashes through, or to write a layer of your own.
 *
 * **Details**
 *
 * - `update` feeds the bytes of one chunk to the hash. A stream of bytes is fed
 *   to one hasher in the order it arrives, so what a hasher has hashed is the
 *   bytes it was fed, in that order, and nothing else.
 * - `digest` reads the fingerprint of the bytes fed so far, as a lowercase hex
 *   string of 64 characters. A hasher is read once the bytes have ended: what a
 *   layer does with one that is read before then, or updated after, is its own to
 *   say and none of a fingerprint's.
 *
 * A hasher belongs to one run of one stream of bytes rather than to a program:
 * two streams are hashed by two hashers, and a hasher that has read its
 * fingerprint is not fed the bytes of another stream.
 *
 * @see {@link Fingerprint} for the service that makes one.
 * @category models
 */
export interface Hasher {
  /**
   * Feeds the bytes of one chunk to the hash, after the chunks fed before it.
   */
  readonly update: (bytes: Uint8Array) => void;

  /**
   * Reads the fingerprint of the bytes fed so far.
   */
  readonly digest: () => string;
}

/**
 * The fingerprint a program on Node computes, over the Rust binding
 * `@napi-rs/blake-hash`.
 *
 * **When to use**
 *
 * Use when a program runs on Node: of the two layers this package states, it is
 * the faster of the two and the one that hashes through a native addon.
 *
 * **Details**
 *
 * The binding is a native addon, so it is loaded when this layer is provided
 * rather than when this module is imported: a program that never provides it — a
 * page — never reaches for it. A program that bundles its code loads the addon
 * from the machine it runs on rather than from the machine it was built on,
 * since a bundle carrying one would carry a binding for that platform alone.
 * What a program that runs where a native addon cannot be loaded provides
 * instead is {@link wasmLayer}; BLAKE3 is what either computes, and the layers
 * agree on the fingerprint of a trajectory whole.
 *
 * @see {@link Fingerprint} for the service this provides.
 * @category layers
 */
export const nodeLayer: Layer.Layer<Fingerprint> = Layer.unwrap(
  Effect.promise(() => import("#/internal/blake3.ts")).pipe(Effect.map((blake3) => blake3.layer)),
);

/**
 * The fingerprint a program computes anywhere, over the WebAssembly BLAKE3
 * `blake3-wasm` carries.
 *
 * **When to use**
 *
 * Use when a program runs where a native addon cannot be loaded — a page, a
 * worker, Deno — or when every run should hash a trajectory with the same code,
 * whether or not the program it runs in could load one.
 *
 * **Details**
 *
 * The WebAssembly code is loaded when this layer is provided rather than when
 * this module is imported, and hashing through it is what {@link nodeLayer} does
 * through the binding: the bytes of a trajectory are fed to one hasher in the
 * order they arrive and the fingerprint is read off it once they have ended.
 *
 * The hasher is spent by reading it — the WebAssembly hasher frees itself on the
 * digest — so a layer reads it once: the fingerprint is held where it is read
 * again, rather than asked of the code that has already let go of the bytes.
 *
 * A bundle is handed the implementation `blake3-wasm` states for the browser,
 * which carries no WebAssembly code of its own: a page provides that code the way
 * the package's own readme says — `blake3/browser` is the entry carrying it — and
 * a program that will not is better served by a layer of its own
 * ({@link Fingerprint}). What carries the code itself is the package's Node.js
 * entry, so a program that runs on Node hashes through this layer as it stands.
 *
 * @see {@link Fingerprint} for the service this provides.
 * @category layers
 */
export const wasmLayer: Layer.Layer<Fingerprint> = Layer.unwrap(
  Effect.promise(() => import("blake3-wasm")).pipe(
    Effect.map((blake3) =>
      Layer.succeed(Fingerprint, {
        hasher: () => {
          const hashing = blake3.createHash();
          let fingerprint: string | undefined;

          return {
            update: (bytes) => {
              hashing.update(bytes);
            },
            digest: () => (fingerprint ??= hashing.digest("hex")),
          };
        },
      }),
    ),
  ),
);
