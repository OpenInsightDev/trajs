/**
 * The sessions of a trajectory, and the forks that relate them.
 *
 * A trajectory is one stream of parts, so what it holds of a session is read out of that
 * stream rather than stated beside it: {@link toSessions} reads a trajectory as the
 * {@link Sessions} it names, {@link session} looks one of them up by the id the trajectory
 * names it by, and a session that continues another does so through a {@link Fork} rather
 * than by repeating the parts it inherited. The main session — the one a part belongs to
 * that states no session of its own ({@link Trajectory.mainSessionId}) — is the one
 * session a trajectory reads without declaring it; every other session is declared by a
 * {@link Trajectory.SessionPart} of its own.
 *
 * What parts a trajectory is made of, and what they are read with, is `Trajectory`'s: a part
 * schema is built for the kit it is read with, and what a session runs on is those parts
 * ({@link Trajectory.Part}). This module reads them; it declares none of them.
 */

import type { ByteStore, ByteStoreError } from "@trajs/utils/ByteStore";
import { type Effect, Option, type Scope, type Stream } from "effect";

import type * as Extra from "#/Extra.ts";
import type { EncodingServices, Readable } from "#/internal/parts.ts";
import { read, readCached } from "#/internal/sessions.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * The session a session continues from, and the part of it that it continues from.
 *
 * **When to use**
 *
 * Use to follow a session back to the one it was started from — to show where a session
 * was forked off another, or to read what it ran on before the parts of its own.
 *
 * **Details**
 *
 * `session` is the id of the session that produced the part, and `part` the `uuid` of the
 * part itself: a `fork` names a part rather than a session, so what a session inherited is
 * what the session it continues from produced up to and including that part. It is the
 * `uuid` of a {@link Trajectory.SessionPart} or of a prompt or response part — the parts
 * a session continues from — and never of an event, which no session continues from.
 *
 * A session that continues from nothing has no `fork`, and its {@link Session.forkedFrom}
 * is `None`. A `fork` naming a part the trajectory does not hold by the time the
 * declaration reading it is read is one no session can be read as: the reading fails with
 * a {@link TrajectoryError} rather than reading the session as one that continues from
 * nothing (see {@link toSessions}).
 *
 * @see {@link Session.forkedFrom} for the fork a session is read with.
 * @see {@link Session.stream} for what a session runs on through one.
 * @see {@link Trajectory.SessionPart} for the part that declares a fork.
 * @category models
 */
export interface Fork {
  readonly session: string;
  readonly part: string;
}

/**
 * The parts of one session of a trajectory.
 *
 * **When to use**
 *
 * Use to type what {@link Session.stream} is, or to hand the parts of one session to a
 * function that reads them.
 *
 * **Details**
 *
 * - What it holds is what the session ran on: the parts of the sessions it continues from, up to
 *   the part each of them is continued from, and the parts it produced itself — the prompts it
 *   was given, the responses it was answered with, and the events a kit produced of it — in the
 *   order the trajectory holds them.
 * - It holds no {@link Trajectory.SessionPart}: a declaration names the session it
 *   declares rather than being a part of it.
 * - It holds the metric parts attached to the parts of the session, wherever they were produced:
 *   a metric part names no session of its own, so the one a producer derived of a part of this
 *   session is a part of it, and one derived of parts of two sessions is a part of both
 *   ({@link Trajectory.MetricPart}).
 * - It is a reading that may be taken as often as it is asked for: the parts are read out of
 *   what {@link toSessions} kept rather than out of the trajectory, which is one stream that is
 *   read once.
 *
 * @see {@link Session.stream} for the parts a session runs on.
 * @see {@link toSessions} for the reading they are taken by.
 * @category models
 */
export type SessionStream<
  Config extends Trajectory.AnyConfig,
  E = never,
  R = never,
> = Stream.Stream<
  Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
  E,
  R
>;

/**
 * One session of a trajectory.
 *
 * **When to use**
 *
 * Use to read a trajectory one session at a time rather than as the single order its parts
 * arrived in — to show a session with what it continued from, to score it, or to continue
 * it.
 *
 * **Details**
 *
 * - `stream` is the parts the session ran on: what it inherited from the sessions it continues
 *   from, up to the part each of them is continued from, and the parts it produced itself
 *   ({@link SessionStream}).
 * - `forkedFrom` is the session it continues from and the part of it that it continues from,
 *   and is `None` for a session that continues from nothing ({@link Fork}).
 * - `extra` is the extra data the kit declares of a session part, as the part that declares
 *   the session states it ({@link Extra.ExtraRecord}): the main session carries it in its
 *   declaration as any other session does ({@link Trajectory.Parts.mainSession}), and a main
 *   session the trajectory does not declare holds none.
 * - The sessions forked off a session are the ones whose `forkedFrom` names it, and a session is
 *   looked up by the id the trajectory names it by ({@link Sessions}, {@link session}).
 * - The parts of a session are read out of what {@link toSessions} kept rather than out of the
 *   trajectory, so a session is read as often as it is asked for, and a session forked off
 *   another reads the parts of that one again rather than repeating them.
 *
 * @see {@link Sessions} for the sessions of a trajectory as a whole.
 * @see {@link SessionStream} for the parts it runs on.
 * @see {@link toSessions} for reading a trajectory as them.
 * @category models
 */
export interface Session<Config extends Trajectory.AnyConfig, E = never, R = never> {
  readonly id: string;
  readonly forkedFrom: Option.Option<Fork>;
  readonly extra: Extra.ExtraRecord<Config["extrakit"]["extra"], "session">;
  readonly stream: SessionStream<Config, E, R>;
}

/**
 * The sessions of a trajectory, by the id each is named by.
 *
 * **When to use**
 *
 * Use to look a session up by an id ({@link session}), or to read every session of a
 * trajectory — which is what {@link View.conversations} is given.
 *
 * **Details**
 *
 * A trajectory names a session by declaring it, or by producing a part in it, so the record
 * holds the sessions the trajectory names in the order it first named them: the main session,
 * and the ones forked off it or off one another. A session of its own is only named by
 * declaring it, so an id the trajectory holds parts of and no declaration of is not a session
 * the record holds — the reading fails instead ({@link toSessions}). Each is read with what the
 * trajectory is read with.
 *
 * @see {@link toSessions} for reading a trajectory as them.
 * @see {@link session} for the session one id names.
 * @category models
 */
export type Sessions<Config extends Trajectory.AnyConfig, E = never, R = never> = Readonly<
  Record<string, Session<Config, E, R>>
>;

/**
 * Reads a trajectory as the sessions it names.
 *
 * **When to use**
 *
 * Use to read a trajectory by its sessions rather than by the single order its parts
 * arrived in — to show what each session ran on, to score one of them, or to continue one.
 *
 * **Details**
 *
 * - The trajectory is read once and cached ({@link Trajectory.cache}), so that its parts read
 *   again: a session is then read by filtering the parts it holds from the head into it — the
 *   parts of the sessions it continues from, up to the part each of them is continued from, the
 *   parts it produced itself, and the metric parts attached to them ({@link SessionStream}) —
 *   so a session is read as often as it is asked for, and a session forked off another runs on
 *   what it inherited rather than repeating it. Caching is what makes that possible: a
 *   trajectory is one stream, and one stream is read once.
 * - The main session is the one a part belongs to that states no session of its own — or
 *   states `"main"` — and it is the one session read whether or not the trajectory declares
 *   it ({@link Trajectory.mainSessionId}). Every other session is read from the session part
 *   that declares it, so a part naming a session the trajectory does not declare fails the
 *   reading, as does a session declared after the parts it produced ({@link Sessions}).
 * - Two things are taken to hold, neither of which can be waited for: a session is declared
 *   before the parts it produced, and a `fork` names a part the trajectory holds by the time
 *   the declaration reading it is read. A trajectory that declares a session after the parts it
 *   produced, or reaches a session before the part it continues from — which is what a cycle of
 *   forks is — fails with the {@link TrajectoryError} that names the session and what is wrong
 *   with it.
 * - The parts are kept in memory, for as long as the program runs: a program that reads the
 *   sessions after that — one that keeps the parts of a trajectory somewhere else, a file system
 *   or a database — reads them with {@link toSessionsCached}, whose store it provides.
 *
 * It fails with `E`, on top of the failure of keeping a part ({@link ByteStoreError} and
 * {@link TrajectoryError}), and requires the services `R` names beside the ones the parts
 * of its config are written with ({@link Exchange.EncodingServices}). The sessions it gives
 * fail with the same `E`: a session is read out of what the cache kept of the trajectory, so
 * a trajectory that failed to read fails the reading of its sessions as well
 * ({@link Sessions}).
 *
 * **Example** (Reading a trajectory as the sessions it names)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 * import { Prompt, Response, Session, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * // The main session asks and is answered, and a session forked off the answer asks again.
 * const asked = part.prompt(Prompt.make("What is a fork?"))
 * const answered = part.response(
 *   Response.makePart("text", { text: "It is a session that continues another." })
 * )
 *
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.mainSession(),
 *     asked,
 *     answered,
 *     part.subSession("reply", { fork: answered.uuid }),
 *     part.prompt(Prompt.make("And what does it hold?"), { sessionId: "reply" })
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Session.toSessions(trajectory))
 * const reply = Option.getOrThrow(Session.session("reply")(sessions))
 *
 * // What a session's model ran on is what it inherited, up to the part it continues from,
 * // and what it produced itself — and no declaration, which is not a part of a session.
 * const stream = Array.from(await Effect.runPromise(Stream.runCollect(reply.stream)))
 * stream.map((part) => part._tag) // => ["Prompt", "Response", "Prompt"]
 *
 * // What it continues from is read from the declaration of the session it was forked off.
 * Option.getOrThrow(reply.forkedFrom).session // => "main"
 * ```
 *
 * @see {@link Session} for one session of a trajectory.
 * @see {@link session} for the session one id names.
 * @see {@link toSessionsCached} for reading them through a store a program provides.
 * @see {@link View.conversations} for the conversations they ran in.
 * @category constructors
 */
export const toSessions = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R> & Readable<Config>,
): Effect.Effect<
  Sessions<Config, E | TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config>
> => read(trajectory);

/**
 * Reads a trajectory as the sessions it names, out of a cache of it kept in the store a program
 * provides.
 *
 * **When to use**
 *
 * Use where the parts of a trajectory are to be kept beyond the memory of one reading — in a
 * file system, a database, or a store a program already holds — so that the sessions read of
 * them are served from there rather than from memory this reading states.
 *
 * **Details**
 *
 * What it reads is what {@link toSessions} reads — the trajectory cached ({@link Trajectory.cache}),
 * one pass over it for the sessions it names, and a session read by filtering the parts of it
 * into it — and the difference is where the cache keeps those parts: those its window leaves out
 * are written into the store a program provides ({@link ByteStore}) rather than into one this
 * reading states. The store is what this reading requires and one through {@link toSessions} does
 * not: `ByteStore.layer` keeps the parts in memory, `ByteStore.layerKVStore` in the key/value
 * store a program states, `ByteStore.layerFsTemp` in a temporary directory of the file system,
 * and a store of a program's own is a layer of its own. Its scope must outlive the sessions read
 * of it, since a session is read out of those parts as often as it is asked for, and what the
 * cache wrote is removed with the scope.
 *
 * `options` is what that cache is read with ({@link Trajectory.CacheOptions}), as it is read with
 * it wherever a trajectory is cached: `capacity` states how many of the newest parts are held in
 * memory, and defaults to every one of them. A program that keeps nothing of a trajectory in
 * memory states `{ capacity: 0 }`, and every part becomes one the store is read for.
 *
 * The parts are kept under keys of the cache's own — a sequence per part, named after a reading
 * of its own — so a store serves the readings of more than one trajectory without them meeting.
 *
 * It fails with `E`, on top of the failure of keeping or reading a part ({@link ByteStoreError}
 * and {@link TrajectoryError}), and requires the services `R` names, the store, the scope, and
 * the ones the parts of its config are written with ({@link Exchange.EncodingServices}).
 *
 * **Example** (Reading a trajectory as the sessions it names, through a store a program holds)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 * import { ByteStore, Prompt, Response, Session, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.prompt(Prompt.make("What is a fork?")),
 *     part.response(Response.makePart("text", { text: "A session that continues another." }))
 *   )
 * )
 *
 * const tags = await Effect.runPromise(
 *   Effect.scoped(
 *     Effect.gen(function*() {
 *       const sessions = yield* Session.toSessionsCached(trajectory, { capacity: 0 })
 *       const main = Option.getOrThrow(Session.session(Trajectory.mainSessionId)(sessions))
 *
 *       // The parts are served from the store, for as long as the scope is open.
 *       return Array.from(yield* Stream.runCollect(main.stream)).map((part) => part._tag)
 *     })
 *   ).pipe(Effect.provide(ByteStore.layer()))
 * )
 *
 * tags // => ["Prompt", "Response"]
 * ```
 *
 * @see {@link toSessions} for reading them into memory instead.
 * @see {@link Session} for one session of a trajectory.
 * @see {@link Trajectory.cache} for the reading its parts are kept by.
 * @see {@link Trajectory.CacheOptions} for the window it keeps in memory.
 * @see {@link ByteStore} for the store the parts are kept in.
 * @category constructors
 */
export const toSessionsCached = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R> & Readable<Config>,
  options?: Trajectory.CacheOptions,
): Effect.Effect<
  Sessions<Config, E | TrajectoryError | ByteStoreError>,
  E | TrajectoryError | ByteStoreError,
  R | EncodingServices<Config> | ByteStore | Scope.Scope
> => readCached(trajectory, options);

/**
 * The session of a trajectory that the id given names.
 *
 * **When to use**
 *
 * Use to read one session by the id the trajectory names it by, rather than reading every
 * session of a trajectory to find it.
 *
 * **Details**
 *
 * It is a lookup of what {@link toSessions} read ({@link Sessions}), so it needs nothing and
 * fails for nothing: an id the trajectory names no session by is `None`. A session of its own
 * is one the trajectory declares, so an id it holds parts of and no declaration of is not a
 * session {@link toSessions} reads at all ({@link Trajectory.mainSessionId} for the one session
 * read without a declaration).
 *
 * **Example** (Looking one session up by its id)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option, Stream } from "effect"
 * import { Prompt, Session, Trajectory } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const trajectory = Trajectory.make(Trajectory.anyConfig)(
 *   Stream.make(
 *     part.mainSession(),
 *     part.prompt(Prompt.make("What is a fork?"))
 *   )
 * )
 *
 * const sessions = await Effect.runPromise(Session.toSessions(trajectory))
 *
 * Option.isSome(Session.session(Trajectory.mainSessionId)(sessions)) // => true
 * Option.isSome(Session.session("replying")(sessions)) // => false
 * ```
 *
 * @see {@link Sessions} for the record it reads.
 * @see {@link toSessions} for the sessions it is looked up in.
 * @category combinators
 */
export const session =
  (id: string) =>
  <Config extends Trajectory.AnyConfig, E, R>(
    sessions: Sessions<Config, E, R>,
  ): Option.Option<Session<Config, E, R>> =>
    Option.fromUndefinedOr(sessions[id]);
