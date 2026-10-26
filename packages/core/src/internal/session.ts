import { Effect, Option, Stream } from "effect";

import type * as Config from "#/Config.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

type Part<Config extends Config.AnyConfig> = Exclude<
  Trajectory.Part<Config>,
  Trajectory.SessionPart<Config["extrakit"]>
>;

interface Declared {
  readonly fork: string;
  readonly index: number;
  session?: string;
}

interface Recorded {
  readonly declared: Map<string, Declared>;
  readonly named: Set<string>;
  readonly attached: Set<string>;
}

const recordPart = <Config extends Config.AnyConfig>(
  recorded: Recorded,
  part: Trajectory.Part<Config>,
  index: number,
): Effect.Effect<void, TrajectoryError> => {
  switch (part._tag) {
    case "Session": {
      const id = part.type.id;

      if (id === Trajectory.mainSessionId || recorded.declared.has(id)) {
        return Effect.void;
      }

      // A session is declared before the parts it produced.
      if (recorded.named.has(id)) {
        return Effect.fail(TrajectoryError.session(id, "late-declaration"));
      }

      switch (part.type._tag) {
        case "main":
          return Effect.void;

        case "sub":
          recorded.declared.set(id, { fork: part.type.fork, index });

          return Effect.void;
      }
    }

    case "Metric": {
      for (const attached of part.metric.data.attach ?? []) {
        recorded.attached.add(attached);
      }

      return Effect.void;
    }

    case "Prompt":
    case "Response":
    case "Event": {
      recorded.named.add(part.sessionId ?? Trajectory.mainSessionId);

      return Effect.void;
    }
  }
};

const undeclared = (recorded: Recorded): string | undefined =>
  [...recorded.named].find((id) => id !== Trajectory.mainSessionId && !recorded.declared.has(id));

const belongsTo = <Config extends Config.AnyConfig>(
  part: Trajectory.Part<Config>,
  id: string,
  attached: ReadonlySet<string>,
  seen: Set<string>,
): part is Part<Config> => {
  switch (part._tag) {
    case "Session": {
      if (part.type.id === id && attached.has(part.uuid)) {
        seen.add(part.uuid);
      }

      return false;
    }

    // A metric is produced after the part it names, so only uuids seen so far match.
    case "Metric":
      return (part.metric.data.attach ?? []).some((target) => target === id || seen.has(target));

    case "Prompt":
    case "Response":
    case "Event": {
      if ((part.sessionId ?? Trajectory.mainSessionId) !== id) {
        return false;
      }

      if (attached.has(part.uuid)) {
        seen.add(part.uuid);
      }

      return true;
    }
  }
};

const streamOf = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
  id: string,
  attached: ReadonlySet<string>,
): Session.SessionStream<Config, E, R> =>
  // Each pull tracks its own part uuids, so one pull does not see another.
  Stream.suspend(() => {
    const seen = new Set<string>();

    return trajectory.pipe(Stream.filter((part) => belongsTo(part, id, attached, seen)));
  });

const readParts = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
): Effect.Effect<Recorded, E | TrajectoryError, R> =>
  Effect.gen(function* () {
    const recorded: Recorded = {
      declared: new Map(),
      named: new Set(),
      attached: new Set(),
    };

    yield* trajectory.pipe(
      Stream.zipWithIndex,
      Stream.runForEach(([part, index]) => recordPart(recorded, part, index)),
    );

    const missing = undeclared(recorded);

    if (missing !== undefined) {
      return yield* Effect.fail(TrajectoryError.session(missing, "undeclared-session"));
    }

    return recorded;
  });

const resolveForks = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
  recorded: Recorded,
): Effect.Effect<void, E | TrajectoryError, R> =>
  Effect.gen(function* () {
    const wanted = new Set<string>();
    let last = 0;

    for (const declared of recorded.declared.values()) {
      wanted.add(declared.fork);
      last = Math.max(last, declared.index);
    }

    if (wanted.size === 0) {
      return;
    }

    const found = new Map<string, { readonly index: number; readonly session: string }>();

    if (last > 0) {
      yield* trajectory.pipe(
        Stream.zipWithIndex,
        Stream.take(last),
        Stream.takeWhile(() => found.size < wanted.size),
        Stream.runForEach(([part, index]) =>
          Effect.sync(() => {
            switch (part._tag) {
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

              // A part kind added to a trajectory stops this compiling rather than
              // going unread here.
              default:
                return part satisfies never;
            }
          }),
        ),
      );
    }

    for (const [id, declared] of recorded.declared) {
      const target = found.get(declared.fork);

      // A fork names a part from before its declaration.
      if (target === undefined || target.index >= declared.index) {
        return yield* Effect.fail(TrajectoryError.session(id, "unproduced-fork"));
      }

      declared.session = target.session;
    }
  });

const treeOf = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
  recorded: Recorded,
): Effect.Effect<Session.MainSession<Config, E | TrajectoryError, R>, TrajectoryError> =>
  Effect.gen(function* () {
    const streamOfSession = (id: string) => streamOf(trajectory, id, recorded.attached);

    const root: Session.MainSession<Config, E | TrajectoryError, R> = {
      id: Trajectory.mainSessionId,
      forkBy: {},
      stream: streamOfSession(Trajectory.mainSessionId),
    };

    const sessions = new Map<string, Session.Session<Config, E | TrajectoryError, R>>();

    for (const [id, declared] of recorded.declared) {
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

export const read = <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.Effect<Session.MainSession<Config, E | TrajectoryError, R>, E | TrajectoryError, R> =>
  Effect.gen(function* () {
    const recorded = yield* readParts(trajectory);

    yield* resolveForks(trajectory, recorded);

    return yield* treeOf(trajectory, recorded);
  });

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

export const sessionParts = <Config extends Config.AnyConfig, E, R>(
  session: Session.AnySession<Config, E, R>,
): Session.SessionStream<Config, E, R> => {
  const streams: Array<Session.SessionStream<Config, E, R>> = [];

  let current: Session.AnySession<Config, E, R> = session;

  while ("forkFrom" in current) {
    streams.push(inherited(current.forkFrom.session.stream, current.forkFrom.uuid));

    current = current.forkFrom.session;
  }

  return streams.reduce((produced, stream) => Stream.concat(stream, produced), session.stream);
};

export const allSessions = <Config extends Config.AnyConfig, E, R>(
  main: Session.MainSession<Config, E, R>,
): ReadonlyArray<Session.AnySession<Config, E, R>> => {
  const sessions: Array<Session.AnySession<Config, E, R>> = [];

  const visit = (session: Session.AnySession<Config, E, R>): void => {
    sessions.push(session);

    for (const forked of Object.values(session.forkBy)) {
      visit(forked);
    }
  };

  visit(main);

  return sessions;
};

export const findSession = <Config extends Config.AnyConfig, E, R>(
  session: Session.AnySession<Config, E, R>,
  id: string,
): Option.Option<Session.AnySession<Config, E, R>> => {
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
