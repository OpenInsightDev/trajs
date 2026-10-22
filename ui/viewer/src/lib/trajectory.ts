/**
 * Reading the bytes of a `.trajs` file as what the viewer shows.
 *
 * A trajectory is one stream of parts, and what a viewer shows of one is not that
 * stream: it is the sessions it declares, the forks that relate them, and the turns each
 * of them ran — `@trajs/core`'s `Session.toSessions` and `View`. The bytes and the
 * kits to read them with are the exchange's work, and what this adds is the shape the
 * components read: one session at a time, with what it inherited from the sessions it
 * continues from read as the turns those sessions had reached by then.
 *
 * A trajectory is read with no tools, no events, no metrics and no extra data: its
 * header names the kits it was written with, and what a kit states of a part is read by
 * a reading that names that kit alone, so a metric or event part of a kind the header
 * names without stating is stepped over, and the extra data of a part is held as far as
 * the reading names the kinds of it. What a viewer shows of a trajectory is therefore
 * the parts that are its own rather than those a kit made of it.
 */

import { Session, Trajectory, View } from "@trajs/core";
import { Exchange } from "@trajs/core/Exchange";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";
import { BrowserServices } from "@trajs/platform-browser";
import { makeBytes } from "@trajs/utils/Bytes";
import { type ByteStoreError } from "@trajs/utils/ByteStore";
import { Storage, StorageError } from "@trajs/utils/Storage";
import { Effect, Layer, Option, Sink, type Scope, Stream } from "effect";

/**
 * What reading a trajectory fails with: the trajectory's own failure, or the store its
 * parts are kept in while its sessions are read.
 */
type Failure = TrajectoryError | StorageError | ByteStoreError;

/** The id a page serves a trajectory it was handed under: a page is handed the bytes, not a name. */
const Handed = "handed";

/**
 * The storage a page serves a trajectory it was handed out of: the bytes it was
 * given, under one id. A page reads a trajectory rather than writing one, so what it
 * writes through fails.
 */
const handed = (bytes: Uint8Array): Storage => ({
  read: () =>
    Effect.succeed(
      makeBytes({
        length: Effect.succeed(BigInt(bytes.length)),
        read: (buffer, { offset = 0n } = {}) =>
          Effect.sync(() => {
            const taken = bytes.subarray(Number(offset), Number(offset) + buffer.length);

            buffer.set(taken);

            return taken.length;
          }),
      }),
    ),
  write: () => Sink.fail(new StorageError({ id: Handed, cause: "a page only reads a trajectory" })),
});

/** The exchange a page reads through: its own codecs, over the services a page runs. */
const browserExchange = Layer.provide(Exchange.layer, BrowserServices.layer());

/** One turn of a session's conversation: what a model was given, and what it answered. */
export type Turn = View.PromptTurn<Trajectory.AnyConfig>;

/**
 * One stretch of a conversation: the turns one session produced.
 *
 * A session's conversation is every stretch of the sessions it continues from,
 * from the root down, and then its own.
 */
export interface Stretch {
  readonly sessionId: string;
  readonly turns: ReadonlyArray<Turn>;
}

/**
 * Where a session continues from: the session that produced the part, and the part
 * itself — which is what tells a reader where the conversation it inherited ends
 * and its own begins.
 */
export interface Continuation {
  readonly sessionId: string;
  readonly partUuid: string;
}

/**
 * One session of a trajectory, as a viewer reads it: what it produced for itself,
 * what it inherited from the sessions it continues from, and what was forked off it.
 *
 * A fork holds none of the parts of the sessions it continues from, so the turns it
 * inherited are read from those sessions up to the part each of them is continued from
 * rather than held here as its own ({@link Stretch}).
 */
export interface TrajectorySession {
  readonly id: string;
  /** The turns this session produced, in the order it produced them. */
  readonly turns: ReadonlyArray<Turn>;
  /** The stretches of the conversation it inherited, from the root down. */
  readonly inherited: ReadonlyArray<Stretch>;
  readonly continuesFrom: Option.Option<Continuation>;
  /** The sessions forked off it, each continuing from one of its parts. */
  readonly forks: ReadonlyArray<TrajectorySession>;
}

/** A trajectory, as the viewer reads it. */
export interface Trajectory {
  readonly roots: ReadonlyArray<TrajectorySession>;
}

/** The parts of one session, as the turns they were produced in. */
const turnsOf = (
  stream: Session.SessionStream<Trajectory.AnyConfig, Failure>,
): Effect.Effect<ReadonlyArray<Turn>, Failure> =>
  View.promptTurns(stream).pipe(
    Stream.runCollect,
    Effect.map((turns): ReadonlyArray<Turn> => Array.from(turns)),
  );

/**
 * The sessions a session continues from, from the root down.
 *
 * A session's parts are what it ran on — what it inherited, and what it produced — so a stretch
 * of the conversation is the parts of one session out of them.
 */
const ancestorsOf = (
  sessions: Session.Sessions<Trajectory.AnyConfig, Failure>,
  session: Session.Session<Trajectory.AnyConfig, Failure>,
): ReadonlyArray<string> => {
  const walked: Array<string> = [];

  let fork = session.forkedFrom;

  while (Option.isSome(fork) && !walked.includes(fork.value.session)) {
    walked.push(fork.value.session);
    fork = Option.flatMap(
      Option.fromUndefinedOr(sessions[fork.value.session]),
      (from) => from.forkedFrom,
    );
  }

  return walked.reverse();
};

/** The parts of the session `id` out of what it ran on, as the turns they were produced in. */
const turnsOfSession = (
  session: Session.Session<Trajectory.AnyConfig, Failure>,
  id: string,
): Effect.Effect<ReadonlyArray<Turn>, Failure> =>
  turnsOf(
    session.stream.pipe(Stream.filter((part) => part._tag !== "Metric" && part.sessionId === id)),
  );

/**
 * One session as the viewer reads it, and the sessions forked off it.
 *
 * A session is read from the sessions `Session.toSessions` read, which hold what each
 * of them ran on: the parts of the sessions it continues from, up to the part each of them
 * is continued from, and the parts of its own ({@link Session.Session.stream}).
 */
const readSession = (
  sessions: Session.Sessions<Trajectory.AnyConfig, Failure>,
  session: Session.Session<Trajectory.AnyConfig, Failure>,
): Effect.Effect<TrajectorySession, Failure> =>
  Effect.gen(function* () {
    const forks = Object.values(sessions).filter((forked) =>
      Option.exists(forked.forkedFrom, (from) => from.session === session.id),
    );

    return {
      id: session.id,
      turns: yield* turnsOfSession(session, session.id),
      inherited: yield* Effect.forEach(ancestorsOf(sessions, session), (from) =>
        turnsOfSession(session, from).pipe(Effect.map((turns) => ({ sessionId: from, turns }))),
      ),
      continuesFrom: Option.map(session.forkedFrom, (from) => ({
        sessionId: from.session,
        partUuid: from.part,
      })),
      forks: yield* Effect.forEach(forks, (forked) => readSession(sessions, forked)),
    };
  });

/**
 * Reads the bytes of a trajectory as the sessions it holds.
 *
 * **When to use**
 *
 * Use to read a `.trajs` file a page was handed — a dropped file, one fetched
 * from somewhere — as what the components show. It is seen in a scope, since reading
 * the parts of a session reads the store they are kept in.
 *
 * **Details**
 *
 * The page is handed one trajectory, so it serves it under one id: the exchange the
 * bytes are read through is provided with the codecs a page runs — the WebAssembly
 * compression and hash `@trajs/platform-browser` states — and with a storage over
 * the bytes themselves. Loading reads the head of them for what the trajectory was
 * made with, and `read` reads the parts, which is what the exchange reads a
 * trajectory into. What the parts are kept in while the sessions are read is the store
 * `Session.toSessions` states where a program states none: the parts are kept in
 * memory for as long as the page runs, which is as long as the sessions are shown. It
 * takes a `Uint8Array` rather than a stream because a `.trajs` file is what a page
 * reads, and a file is read whole.
 */
export const read = (bytes: Uint8Array): Effect.Effect<Trajectory, Failure, Scope.Scope> =>
  Effect.gen(function* () {
    const exchange = yield* Exchange;

    const loaded = yield* exchange.load(Handed);

    const sessions = yield* Session.toSessions(loaded.read());
    const roots = Object.values(sessions).filter((session) => Option.isNone(session.forkedFrom));

    return {
      roots: yield* Effect.forEach(roots, (session) => readSession(sessions, session)),
    };
  }).pipe(Effect.provide(Layer.provide(browserExchange, Layer.succeed(Storage, handed(bytes)))));
