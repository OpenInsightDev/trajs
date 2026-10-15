import { Cause, Effect, Exit, Option, Queue, Stream } from "effect";

import type { Fork, Session, Sessions } from "#/Session.ts";
import type * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/** A session as it is read: what {@link Session} is, with the `forkedFrom` it is read with settled by the time it is emitted. */
type Reading<K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R> = {
  id: string;
  forkedFrom: Option.Option<Fork<K, V, E, R>>;
  parts: Trajectory.TrajectoryStream<K, V, E, R>;
  forkedBy: Sessions<K, V, E, R>;
};

interface Opened<K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R> {
  readonly session: Reading<K, V, E, R>;
  readonly parts: Queue.Queue<Trajectory.Part<K, V>, E | TrajectoryError | Cause.Done>;
  readonly forkedBy: Queue.Queue<Session<K, V, E, R>, E | TrajectoryError | Cause.Done>;
  /** Whether the first declaration read names the session: one declared again is read where it first was. */
  declared: boolean;
  /** Whether the session has been emitted: into the roots, or into the `forkedBy` of the session it continues from. */
  emitted: boolean;
}

/**
 * Reads a trajectory as the sessions it records, in one pass: the parts of a
 * session are routed to it as they are read, a session is emitted where the
 * trajectory declares it or first names it, and a `fork` is resolved against the
 * `uuid` of every part read.
 *
 * A recording is read against what it is taken to hold — a session is declared
 * before the parts it recorded, and a `fork` names a part the recording holds by
 * the time the declaration is read — so nothing is waited for and nothing is
 * placed once the trajectory has ended: a recording that holds neither fails.
 */
export const read = <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R>(
  trajectory: Trajectory.TrajectoryStream<K, V, E, R>,
): Sessions<K, V, E, R> =>
  Effect.gen(function* () {
    const roots = yield* Queue.unbounded<Session<K, V, E, R>, E | TrajectoryError | Cause.Done>();

    /** The sessions read so far, by id, in the order the trajectory first named them. */
    const opened = new Map<string, Opened<K, V, E, R>>();
    /** The session that recorded each part read so far, by the part's `uuid`: what a `fork` is resolved against. */
    const recorded = new Map<string, Opened<K, V, E, R>>();

    /** The reading of the session `id`, opened on the first part that names it. */
    const opening = (id: string): Effect.Effect<Opened<K, V, E, R>> =>
      Effect.gen(function* () {
        const known = opened.get(id);

        if (known !== undefined) {
          return known;
        }

        const parts = yield* Queue.unbounded<
          Trajectory.Part<K, V>,
          E | TrajectoryError | Cause.Done
        >();

        const forkedBy = yield* Queue.unbounded<
          Session<K, V, E, R>,
          E | TrajectoryError | Cause.Done
        >();

        const reading: Opened<K, V, E, R> = {
          session: {
            id,
            forkedFrom: Option.none(),
            parts: Stream.fromQueue(parts),
            forkedBy: Stream.fromQueue(forkedBy),
          },
          parts,
          forkedBy,
          declared: false,
          emitted: false,
        };

        opened.set(id, reading);

        return reading;
      });

    /**
     * Emits a session with the `forkedFrom` it is read with: it is emitted once, and
     * its `forkedFrom` is settled before it is emitted anywhere, so it does not
     * change under whoever reads it.
     */
    const emit = (
      reading: Opened<K, V, E, R>,
      into: Queue.Queue<Session<K, V, E, R>, E | TrajectoryError | Cause.Done>,
      forkedFrom: Option.Option<Fork<K, V, E, R>>,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        reading.session.forkedFrom = forkedFrom;
        reading.emitted = true;
        yield* Queue.offer(into, reading.session);
      });

    const emitRoot = (reading: Opened<K, V, E, R>): Effect.Effect<void> =>
      emit(reading, roots, Option.none());

    /**
     * Emits a session under the session that recorded the part it continues from.
     * A `fork` names a part the recording holds by the time it is read, and the
     * session that recorded a part is declared before it: that session has been
     * read and emitted, so there is nothing to wait for.
     */
    const emitFork = (
      reading: Opened<K, V, E, R>,
      uuid: string,
    ): Effect.Effect<void, TrajectoryError> =>
      Effect.gen(function* () {
        const parent = recorded.get(uuid);

        if (parent === undefined) {
          return yield* Effect.fail(TrajectoryError.session(reading.session.id, "unrecorded-fork"));
        }

        yield* emit(reading, parent.forkedBy, Option.some({ session: parent.session, uuid }));
      });

    /**
     * Reads the declaration of a session: one read after the parts the session
     * recorded is the failure of a recording that does not declare it first.
     */
    const declare = (
      reading: Opened<K, V, E, R>,
      declaration: Trajectory.SessionPart,
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
     * Routes a part to the session that recorded it: a session whose first part is
     * not a declaration is one nothing declares — a session is declared before the
     * parts it recorded — so it is a root, emitted where the trajectory first names
     * it.
     */
    const readPart = (part: Trajectory.Part<K, V>): Effect.Effect<void, TrajectoryError> =>
      Effect.gen(function* () {
        // A derived part names no session: what a kit derived is read with the
        // parts it is attached to, so it is no part of any session's own.
        if (part._tag !== "Prompt" && part._tag !== "Response" && part._tag !== "Session") {
          return;
        }

        // A session declaration names the session it declares with `id`; every
        // other part that names a session refers to it with `sessionId`.
        const reading = yield* opening(part._tag === "Session" ? part.id : part.sessionId);

        recorded.set(part.uuid, reading);
        yield* Queue.offer(reading.parts, part);

        if (part._tag === "Session") {
          yield* declare(reading, part);

          return;
        }

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
        // A reading that ends, or that is interrupted where whoever reads it
        // leaves it, ends its streams; a trajectory that fails fails them, since
        // nothing more can arrive at any of them.
        if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) {
          yield* end();

          return;
        }

        yield* fail(exit.cause);
      });

    // The trajectory is read while the sessions are read rather than on the
    // demand of whoever reads one of them, and a trajectory that fails fails the
    // sessions it was read into.
    return Stream.fromQueue(roots).pipe(
      Stream.drainFork(trajectory.pipe(Stream.tap(readPart), Stream.onExit(close), Stream.drain)),
    );
  }).pipe(Stream.unwrap);

/** The session a stream of sessions records under `id`, if it records one. */
export const find =
  (id: string) =>
  <K extends Trajectory.AnyKit, V extends Trajectory.AnyVariant, E, R>(
    sessions: Sessions<K, V, E, R>,
  ): Stream.Stream<Session<K, V, E, R>, E | TrajectoryError, R> =>
    sessions.pipe(
      Stream.flatMap((session) =>
        session.id === id ? Stream.make(session) : find(id)(session.forkedBy),
      ),
      Stream.take(1),
    );
