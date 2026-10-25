/**
 * The reading behind {@link Session.main}: one pass over a cached trajectory records the
 * sessions it declares, and each session is then read as the parts of that cache which
 * state its id, as often as it is read.
 *
 * No part is kept by this reading. What the pass keeps is what the parts state of the
 * sessions they name: one entry per session, one per fork, and the ids metrics attach
 * to. The parts themselves stay in the cache the program provided.
 *
 * Nothing here is published: a program reaches the reading through {@link Session.main}.
 */

import { Effect, Option, Stream } from "effect";

import type * as Config from "#/Config.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/** A part of a session, which is every part of a trajectory but the declaration of one. */
type Part<Config extends Config.AnyConfig> = Exclude<
  Trajectory.Part<Config>,
  Trajectory.SessionPart<Config["extrakit"]>
>;

/** What the declaration of a session states of the session it places in the tree. */
interface Declared {
  /** The `uuid` of the part it continues from. */
  readonly fork: string;
  /** The position of the declaration in the trajectory. */
  readonly index: number;
  /** The session that produced the part it continues from, once the reading resolved it. */
  session?: string;
}

/** What the parts of a trajectory state of the sessions they name, before the tree is built. */
interface Reading {
  /** The sessions a part named, by declaration order, with what their declaration states. */
  readonly declared: Map<string, Declared>;
  /** The sessions parts named, whether or not the trajectory declares them. */
  readonly named: Set<string>;
  /** The part `uuid`s a metric may be attached to, which is what a metric names. */
  readonly attached: Set<string>;
}

/** The reading a trajectory starts from: no part read yet. */
const reading = (): Reading => ({
  declared: new Map(),
  named: new Set(),
  attached: new Set(),
});

/**
 * Reads `part`, at `index`, into the reading given.
 *
 * The main session is the root whether or not the trajectory declares it, and a session
 * declared again is read where it first was declared.
 */
const recordPart = <Config extends Config.AnyConfig>(
  state: Reading,
  part: Trajectory.Part<Config>,
  index: number,
): Effect.Effect<void, TrajectoryError> => {
  switch (part._tag) {
    case "Session": {
      const id = part.type.id;

      if (id === Trajectory.mainSessionId || state.declared.has(id)) {
        return Effect.void;
      }

      // A session is declared before the parts it produced.
      if (state.named.has(id)) {
        return Effect.fail(TrajectoryError.session(id, "late-declaration"));
      }

      switch (part.type._tag) {
        case "main":
          return Effect.void;

        case "sub":
          state.declared.set(id, { fork: part.type.fork, index });

          return Effect.void;
      }
    }

    // A metric part names no session: it is read by the parts it is attached to.
    case "Metric": {
      for (const attached of part.metric.data.attach ?? []) {
        state.attached.add(attached);
      }

      return Effect.void;
    }

    case "Prompt":
    case "Response":
    case "Event": {
      state.named.add(part.sessionId ?? Trajectory.mainSessionId);

      return Effect.void;
    }
  }
};

/** The session named by a part and never declared by the trajectory, where one is. */
const undeclared = (state: Reading): string | undefined =>
  [...state.named].find((id) => id !== Trajectory.mainSessionId && !state.declared.has(id));

type Read<Config extends Config.AnyConfig, E, R> = Session.MainSession<Config, E, R>;

/**
 * Reads `part` as a part of the session given, holding the `uuid` of every part a
 * metric may be attached to.
 */
const belongsTo = <Config extends Config.AnyConfig>(
  part: Trajectory.Part<Config>,
  id: string,
  attached: ReadonlySet<string>,
  held: Set<string>,
): part is Part<Config> => {
  switch (part._tag) {
    // A declaration places a session rather than being a part of it, but a metric may
    // be attached to it.
    case "Session": {
      if (part.type.id === id && attached.has(part.uuid)) {
        held.add(part.uuid);
      }

      return false;
    }

    // A metric part names no session: it is held by the sessions of the parts it is
    // attached to, or by the session it names directly. A metric is produced after the
    // part it names, so a reading holds it by the parts read so far.
    case "Metric":
      return (part.metric.data.attach ?? []).some((target) => target === id || held.has(target));

    case "Prompt":
    case "Response":
    case "Event": {
      if ((part.sessionId ?? Trajectory.mainSessionId) !== id) {
        return false;
      }

      if (attached.has(part.uuid)) {
        held.add(part.uuid);
      }

      return true;
    }
  }
};

/** The parts of one session, read out of the cache of a trajectory as often as asked for. */
const streamOf = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
  id: string,
  attached: ReadonlySet<string>,
): Session.SessionStream<Config, E, R> =>
  // The parts a metric names are held per reading, so one reading does not see another.
  Stream.suspend(() => {
    const held = new Set<string>();

    return trajectory.pipe(Stream.filter((part) => belongsTo(part, id, attached, held)));
  });

/** Records the sessions a cached trajectory declares, failing where one states them wrong. */
const readParts = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
): Effect.Effect<Reading, E | TrajectoryError, R> =>
  Effect.gen(function* () {
    const state = reading();

    yield* trajectory.pipe(
      Stream.zipWithIndex,
      Stream.runForEach(([part, index]) => recordPart(state, part, index)),
    );

    const missing = undeclared(state);

    if (missing !== undefined) {
      return yield* Effect.fail(TrajectoryError.session(missing, "undeclared-session"));
    }

    return state;
  });

/**
 * Resolves the part each declaration continues from, in a second pass over the cache.
 *
 * A `fork` names a part read before the declaration reading it, so only the parts before
 * the last declaration are read, and only the `uuid`s a fork names are kept.
 */
const resolveForks = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
  state: Reading,
): Effect.Effect<void, E | TrajectoryError, R> =>
  Effect.gen(function* () {
    const wanted = new Set<string>();
    let last = 0;

    for (const declared of state.declared.values()) {
      wanted.add(declared.fork);
      last = Math.max(last, declared.index);
    }

    if (wanted.size === 0) {
      return;
    }

    /** The session that produced each part a fork named, by the part's `uuid`. */
    const found = new Map<string, { readonly index: number; readonly session: string }>();

    if (last > 0) {
      yield* trajectory.pipe(
        Stream.zipWithIndex,
        Stream.take(last),
        // Every fork the reading can resolve is resolved before the last declaration.
        Stream.takeWhile(() => found.size < wanted.size),
        Stream.runForEach(([part, index]) =>
          Effect.sync(() => {
            switch (part._tag) {
              // A session continues from a prompt, a response, or a declaration.
              case "Session":
              case "Prompt":
              case "Response": {
                if (!wanted.has(part.uuid)) {
                  return;
                }

                const session =
                  part._tag === "Session"
                    ? part.type.id
                    : (part.sessionId ?? Trajectory.mainSessionId);

                found.set(part.uuid, { index, session });

                return;
              }

              case "Event":
              case "Metric":
                return;
            }
          }),
        ),
      );
    }

    for (const [id, declared] of state.declared) {
      const target = found.get(declared.fork);

      // A fork names a part read before the declaration reading it.
      if (target === undefined || target.index >= declared.index) {
        return yield* Effect.fail(TrajectoryError.session(id, "unproduced-fork"));
      }

      declared.session = target.session;
    }
  });

/** The tree the recorded sessions were forked into, the main session at its root. */
const treeOf = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
  state: Reading,
): Effect.Effect<Read<Config, E | TrajectoryError, R>, TrajectoryError> =>
  Effect.gen(function* () {
    const streamOfSession = (id: string) => streamOf(trajectory, id, state.attached);

    const root: Read<Config, E | TrajectoryError, R> = {
      id: Trajectory.mainSessionId,
      forkBy: {},
      stream: streamOfSession(Trajectory.mainSessionId),
    };

    const sessions = new Map<string, Session.Session<Config, E | TrajectoryError, R>>();

    for (const [id, declared] of state.declared) {
      if (declared.session === undefined) {
        return yield* Effect.fail(TrajectoryError.session(id, "unproduced-fork"));
      }

      const parent =
        declared.session === Trajectory.mainSessionId ? root : sessions.get(declared.session);

      if (parent === undefined) {
        return yield* Effect.fail(TrajectoryError.session(id, "unproduced-fork"));
      }

      const forked: Session.Session<Config, E | TrajectoryError, R> = {
        id,
        forkFrom: { session: parent, uuid: declared.fork },
        forkBy: {},
        stream: streamOfSession(id),
      };

      parent.forkBy[id] = forked;
      sessions.set(id, forked);
    }

    return root;
  });

/**
 * Reads a cached trajectory as the sessions it declares, with the main session at the
 * root. The trajectory is read twice at most, and no part of it is kept.
 */
export const read = <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.Effect<Read<Config, E | TrajectoryError, R>, E | TrajectoryError, R> =>
  Effect.gen(function* () {
    const state = yield* readParts(trajectory);

    yield* resolveForks(trajectory, state);

    return yield* treeOf(trajectory, state);
  });

type AnySession<Config extends Config.AnyConfig, E, R> =
  | Session.Session<Config, E, R>
  | Session.MainSession<Config, E, R>;

const holds = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
  uuid: string,
): Effect.Effect<boolean, E, R> =>
  stream.pipe(
    Stream.takeUntil((part) => part._tag !== "Metric" && part.uuid === uuid),
    Stream.runFold(
      () => false,
      (_, part) => part._tag !== "Metric" && part.uuid === uuid,
    ),
  );

const inherited = <Config extends Config.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
  fork: string,
): Session.SessionStream<Config, E, R> =>
  holds(stream, fork).pipe(
    Effect.map((produces) =>
      produces
        ? stream.pipe(Stream.takeUntil((part) => part._tag !== "Metric" && part.uuid === fork))
        : Stream.empty,
    ),
    Stream.unwrap,
  );

/**
 * Reads the parts `session` ran on, spliced with what it inherited from the sessions it
 * continues from.
 *
 * The stream holds what the session it continues from produced up to the part it was
 * continued at, down the chain of continuations, then what `session` produced itself.
 */
export const sessionParts = <Config extends Config.AnyConfig, E, R>(
  session: AnySession<Config, E, R>,
): Session.SessionStream<Config, E, R> => {
  const steps: Array<Session.SessionStream<Config, E, R>> = [];

  let current: AnySession<Config, E, R> = session;

  while ("forkFrom" in current) {
    steps.push(inherited(current.forkFrom.session.stream, current.forkFrom.uuid));

    current = current.forkFrom.session;
  }

  return steps.reduce((produced, step) => Stream.concat(step, produced), session.stream);
};

/**
 * Reads every session of the tree, the main session before the sessions forked off it.
 *
 * A session is read before the sessions forked off it, and the sessions forked off one
 * are read in the order they were declared.
 */
export const allSessions = <Config extends Config.AnyConfig, E, R>(
  main: Session.MainSession<Config, E, R>,
): ReadonlyArray<AnySession<Config, E, R>> => {
  const sessions: Array<AnySession<Config, E, R>> = [];

  const visit = (session: AnySession<Config, E, R>): void => {
    sessions.push(session);

    for (const forked of Object.values(session.forkBy)) {
      visit(forked);
    }
  };

  visit(main);

  return sessions;
};

/**
 * Finds the session `id` names in the tree, or none where the tree holds no such session.
 */
export const findSession = <Config extends Config.AnyConfig, E, R>(
  session: AnySession<Config, E, R>,
  id: string,
): Option.Option<AnySession<Config, E, R>> => {
  if (session.id === id) {
    return Option.some(session);
  }

  for (const forked of Object.values(session.forkBy)) {
    const found = findSession(forked, id);

    if (Option.isSome(found)) {
      return found;
    }
  }

  return Option.none();
};
