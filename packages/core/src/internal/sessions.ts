/**
 * The reading behind {@link Session.sessions}: one pass over a trajectory routes
 * each of its parts to the session that names it, so the sessions of a trajectory
 * are read as it is produced rather than once it has ended.
 *
 * Nothing here is published: a program reaches the reading through
 * `Session.sessions` and `Session.of`.
 */

import { Cause, Effect, Exit, Option, Queue, Stream } from "effect";

import type { Fork, Session, Sessions } from "#/Session.ts";
import type * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * A session as it is being read: what {@link Session} states of one, with the
 * `forkedFrom` it is read with settled by the time the session is emitted — so the
 * field is mutable here and read-only where a reader sees it.
 */
interface Reading<Config extends Trajectory.AnyConfig, E, R> {
  id: string;
  forkedFrom: Option.Option<Fork<Config, E, R>>;
  parts: Trajectory.TrajectoryStream<Config, E | TrajectoryError, R>;
  forkedBy: Sessions<Config, E, R>;
}

/**
 * A session the trajectory has named, and where what it produces arrives: the parts
 * of the session and the sessions forked off it are routed to it as the trajectory
 * is read.
 */
interface Opened<Config extends Trajectory.AnyConfig, E, R> {
  readonly session: Reading<Config, E, R>;
  readonly parts: Queue.Queue<Trajectory.Part<Config>, E | TrajectoryError | Cause.Done>;
  readonly forkedBy: Queue.Queue<Session<Config, E, R>, E | TrajectoryError | Cause.Done>;
  /** Whether a declaration of the session was read: a session declared again is read where it first was. */
  declared: boolean;
  /** Whether the session was emitted: as a root, or into the `forkedBy` of the session it continues from. */
  emitted: boolean;
}

/**
 * The session that produced a part read so far, and the part itself: what a `fork`
 * naming the part is resolved against.
 */
interface Produced<Config extends Trajectory.AnyConfig, E, R> {
  readonly reading: Opened<Config, E, R>;
  readonly part: Trajectory.Part<Config>;
}

/**
 * The stream a queue hands out, with the end the queue reports as `Done` read as the
 * end of the stream.
 *
 * A queue ends by failing with `Cause.Done`, which is why its failure type carries
 * it, and `Stream.fromQueue` ends the stream there instead of reporting it: what a
 * reader of the stream fails with is what the queue was failed with, `E`.
 */
const fromQueue = <A, E>(queue: Queue.Queue<A, E | Cause.Done>): Stream.Stream<A, E> =>
  // SAFETY: what `Stream.fromQueue` leaves out is `Done`, which ends the stream
  // rather than failing it, so the stream fails with everything else the queue was
  // failed with. The `Exclude` it takes `Done` out with leaves the rest behind as an
  // unresolved type parameter where the queue is failed with a generic `E`.
  Stream.fromQueue(queue) as Stream.Stream<A, E>;

/**
 * Reads a trajectory as the sessions it produces, in one pass: the parts of a session
 * are routed to it as they are read, a session is emitted where the trajectory
 * declares it or first names it, and a `fork` is resolved against the `uuid` of every
 * part read.
 *
 * A trajectory is read against what it is taken to hold — a session is declared before
 * the parts it produced, and a `fork` names a part the trajectory holds by the time the
 * declaration reading it is read — so nothing is waited for and nothing is placed once
 * the trajectory has ended: a trajectory that holds neither fails.
 */
export const read = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Sessions<Config, E, R> =>
  Effect.gen(function* () {
    const roots = yield* Queue.unbounded<Session<Config, E, R>, E | TrajectoryError | Cause.Done>();

    /** The sessions the trajectory has named so far, by id, in the order it first named them. */
    const opened = new Map<string, Opened<Config, E, R>>();
    /** The session that produced each part read so far, by the part's `uuid`: what a `fork` is resolved against. */
    const produced = new Map<string, Produced<Config, E, R>>();

    /** The reading of the session `id`, opened on the first part that names it. */
    const opening = (id: string): Effect.Effect<Opened<Config, E, R>> =>
      Effect.gen(function* () {
        const known = opened.get(id);

        if (known !== undefined) {
          return known;
        }

        const parts = yield* Queue.unbounded<
          Trajectory.Part<Config>,
          E | TrajectoryError | Cause.Done
        >();

        const forkedBy = yield* Queue.unbounded<
          Session<Config, E, R>,
          E | TrajectoryError | Cause.Done
        >();

        const session: Reading<Config, E, R> = {
          id,
          // Settled when the session is emitted, which is before anyone reads it.
          forkedFrom: Option.none(),
          parts: fromQueue(parts),
          forkedBy: fromQueue(forkedBy),
        };

        const reading: Opened<Config, E, R> = {
          session,
          parts,
          forkedBy,
          declared: false,
          emitted: false,
        };

        opened.set(id, reading);

        return reading;
      });

    /**
     * Emits a session with the `forkedFrom` it is read with: a session is emitted
     * once, and what it continues from is settled before it is handed out, so it does
     * not change under whoever reads it.
     */
    const emit = (
      reading: Opened<Config, E, R>,
      into: Queue.Queue<Session<Config, E, R>, E | TrajectoryError | Cause.Done>,
      forkedFrom: Option.Option<Fork<Config, E, R>>,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        reading.session.forkedFrom = forkedFrom;
        reading.emitted = true;

        yield* Queue.offer(into, reading.session);
      });

    const emitRoot = (reading: Opened<Config, E, R>): Effect.Effect<void> =>
      emit(reading, roots, Option.none());

    /**
     * Emits a session under the session that produced the part it continues from. A
     * `fork` names a part the trajectory holds by the time it is read, and the session
     * that produced a part is declared before it: that session has been read and
     * emitted, so there is nothing to wait for.
     */
    const emitFork = (
      reading: Opened<Config, E, R>,
      uuid: string,
    ): Effect.Effect<void, TrajectoryError> =>
      Effect.gen(function* () {
        const parent = produced.get(uuid);

        if (parent === undefined) {
          return yield* Effect.fail(TrajectoryError.session(reading.session.id, "unproduced-fork"));
        }

        yield* emit(
          reading,
          parent.reading.forkedBy,
          Option.some({ session: parent.reading.session, part: parent.part }),
        );
      });

    /**
     * Reads the declaration of a session: one read after the parts the session
     * produced is the failure of a trajectory that does not declare it first.
     */
    const declare = (
      reading: Opened<Config, E, R>,
      declaration: Trajectory.SessionPart<Config["extrakit"]>,
    ): Effect.Effect<void, TrajectoryError> =>
      Effect.gen(function* () {
        if (reading.declared) {
          return;
        }

        if (reading.emitted) {
          return yield* Effect.fail(
            TrajectoryError.session(reading.session.id, "late-declaration"),
          );
        }

        reading.declared = true;

        if (declaration.fork === undefined) {
          yield* emitRoot(reading);

          return;
        }

        yield* emitFork(reading, declaration.fork);
      });

    /**
     * Routes a part to the session that names it: a declaration names the session it
     * declares with `id`, and every other part that names one refers to it with
     * `sessionId`.
     */
    const produce = (part: Trajectory.Part<Config>): Effect.Effect<void, TrajectoryError> =>
      Effect.gen(function* () {
        // A metric part names no session, and is on no session's parts: what a kit
        // contributes of its own is read with the parts it is attached to.
        if (part._tag === "Metric") {
          return;
        }

        const reading = yield* opening(part._tag === "Session" ? part.id : part.sessionId);

        // A `fork` names the part it continues from by `uuid` rather than by session,
        // so the reading remembers the session that produced every part it reads.
        produced.set(part.uuid, { reading, part });

        yield* Queue.offer(reading.parts, part);

        if (part._tag === "Session") {
          yield* declare(reading, part);

          return;
        }

        // A session whose first part is not a declaration is one nothing declares — a
        // session is declared before the parts it produced — so it is a root, emitted
        // where the trajectory first names it.
        if (!reading.emitted) {
          yield* emitRoot(reading);
        }
      });

    /** Fails every stream handed out with `cause`: nothing more can arrive at any of them. */
    const fail = (cause: Cause.Cause<E | TrajectoryError>): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* Queue.failCause(roots, cause);

        yield* Effect.forEach(
          opened.values(),
          (reading) =>
            Effect.all(
              [Queue.failCause(reading.parts, cause), Queue.failCause(reading.forkedBy, cause)],
              { discard: true },
            ),
          { discard: true },
        );
      });

    /** Ends every stream handed out: the trajectory ended, so nothing more arrives at any of them. */
    const end = (): Effect.Effect<void> =>
      Effect.gen(function* () {
        yield* Queue.end(roots);

        yield* Effect.forEach(
          opened.values(),
          (reading) =>
            Effect.all([Queue.end(reading.parts), Queue.end(reading.forkedBy)], { discard: true }),
          { discard: true },
        );
      });

    const close = (exit: Exit.Exit<unknown, E | TrajectoryError>): Effect.Effect<void> =>
      Effect.gen(function* () {
        // A reading that ends, or that is interrupted where whoever reads it leaves
        // it, ends its streams; a trajectory that fails fails them, since nothing more
        // can arrive at any of them.
        if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) {
          yield* end();

          return;
        }

        yield* fail(exit.cause);
      });

    // The trajectory is read while the sessions are read rather than on the demand of
    // whoever reads one of them, and a trajectory that fails fails the sessions it was
    // read into.
    return Stream.fromQueue(roots).pipe(
      Stream.drainFork(trajectory.pipe(Stream.tap(produce), Stream.onExit(close), Stream.drain)),
    );
  }).pipe(Stream.unwrap);

/** The session a stream of sessions carries under `id`, if it names one. */
export const find =
  (id: string) =>
  <Config extends Trajectory.AnyConfig, E, R>(
    sessions: Sessions<Config, E, R>,
  ): Stream.Stream<Session<Config, E, R>, E | TrajectoryError, R> =>
    sessions.pipe(
      Stream.flatMap((session) =>
        session.id === id ? Stream.make(session) : find(id)(session.forkedBy),
      ),
      Stream.take(1),
    );
