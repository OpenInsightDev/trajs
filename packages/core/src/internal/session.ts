/**
 * The reading behind {@link Session.main}: the trajectory cached once, so every session
 * reads the parts of its own from a stream that can be iterated again, and the sessions
 * the trajectory declares placed as the tree they were forked into.
 *
 * Nothing here is published: a program reaches the reading through {@link Session.main}.
 */

import type { ByteStore } from "@trajs/utils";
import { Effect, Stream } from "effect";

import * as Cache from "#/Cache.ts";
import type * as Config from "#/Config.ts";
import type * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";

/** A part that names the session it was produced in. */
type NamedPart<Config extends Config.AnyConfig> =
  | Trajectory.PromptPart<Config["extrakit"]>
  | Trajectory.ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>
  | Trajectory.EventPart<Config["eventkit"]>;

/** A part of a session, which is every part of a trajectory but the declaration of one. */
type Part<Config extends Config.AnyConfig> = Exclude<
  Trajectory.Part<Config>,
  Trajectory.SessionPart<Config["extrakit"]>
>;

/** What the declaration of a session states of the session it places in the tree. */
interface Declared {
  /** The session it continues from, named by the part it continues from. */
  readonly session: string;
  /** The `uuid` of the part it continues from. */
  readonly fork: string;
}

/** What the parts of a trajectory state of the sessions they name, before the tree is built. */
interface Reading {
  /** The session each part a session continues from was produced in, by the part's `uuid`. */
  readonly producing: Map<string, string>;
  /** The session each part was produced in, by the part's `uuid`, for the metrics attached to it. */
  readonly contained: Map<string, string>;
  /** The parts of each session that named it before the declaration reading it. */
  readonly named: Set<string>;
  /** What each declared session states, by id, in the order the trajectory declares them. */
  readonly declared: Map<string, Declared>;
}

/** The reading a trajectory starts from: no part read yet. */
const reading = (): Reading => ({
  producing: new Map(),
  contained: new Map(),
  named: new Set(),
  declared: new Map(),
});

/**
 * Whether a part is one a session holds: every part but a declaration, which names the
 * session it declares rather than being a part of it.
 */
const isPart = <Config extends Config.AnyConfig>(
  part: Trajectory.Part<Config>,
): part is Part<Config> => part._tag !== "Session";

/**
 * Whether a part belongs to the session given: a part states the session it was produced
 * in, and a part stating none belongs to the main session. A metric part names no session
 * and belongs to the sessions of the parts it is attached to.
 */
const belongsTo = <Config extends Config.AnyConfig>(
  part: Part<Config>,
  id: string,
  contained: ReadonlyMap<string, string>,
): boolean => {
  switch (part._tag) {
    case "Metric":
      return part.metric.data.attach.some(
        (attached) => attached === id || contained.get(attached) === id,
      );

    case "Prompt":
    case "Response":
    case "Event":
      return (part.sessionId ?? Trajectory.mainSessionId) === id;
  }
};

/** The parts of one session, read out of the cache of a trajectory as often as asked for. */
const streamOf = <Config extends Config.AnyConfig, E, R>(
  trajectory: Stream.Stream<Trajectory.Part<Config>, E, R>,
  contained: ReadonlyMap<string, string>,
  id: string,
): Session.SessionStream<Config, E, R> =>
  trajectory.pipe(
    Stream.filter(isPart<Config>),
    Stream.filter((part) => belongsTo(part, id, contained)),
  );

/**
 * Reads the declaration `part` into the reading given.
 *
 * The main session is read whether or not the trajectory declares it, and a session
 * declared again is read where it first was declared.
 */
const readSession = <Config extends Config.AnyConfig>(
  state: Reading,
  part: Trajectory.SessionPart<Config["extrakit"]>,
): Effect.Effect<Reading, TrajectoryError> =>
  Effect.gen(function* () {
    const id = part.type.id;

    state.contained.set(part.uuid, id);

    if (id === Trajectory.mainSessionId || state.declared.has(id)) {
      state.producing.set(part.uuid, id);

      return state;
    }

    // A session is declared before the parts it produced.
    if (state.named.has(id)) {
      return yield* Effect.fail(TrajectoryError.session(id, "late-declaration"));
    }

    switch (part.type._tag) {
      case "main":
        break;

      // A `fork` names a part read before the declaration reading it.
      case "sub": {
        const session = state.producing.get(part.type.fork);

        if (session === undefined) {
          return yield* Effect.fail(TrajectoryError.session(id, "unproduced-fork"));
        }

        state.declared.set(id, { session, fork: part.type.fork });
      }
    }

    state.producing.set(part.uuid, id);

    return state;
  });

/** Reads a part that names the session it was produced in into the reading given. */
const readNamed = <Config extends Config.AnyConfig>(
  state: Reading,
  part: NamedPart<Config>,
): Reading => {
  const id = part.sessionId ?? Trajectory.mainSessionId;

  state.named.add(id);
  state.contained.set(part.uuid, id);

  // The parts a session continues from are the prompts, responses and declarations.
  switch (part._tag) {
    case "Event":
      break;

    case "Prompt":
    case "Response":
      state.producing.set(part.uuid, id);
  }

  return state;
};

/**
 * Reads `part` into the reading given: a declaration places a session, a metric part is
 * read by the parts it is attached to, and every other part names its session.
 */
const readPart = <Config extends Config.AnyConfig>(
  state: Reading,
  part: Trajectory.Part<Config>,
): Effect.Effect<Reading, TrajectoryError> => {
  switch (part._tag) {
    case "Session":
      return readSession(state, part);

    // A metric part names no session: it is read by the parts it is attached to.
    case "Metric":
      return Effect.succeed(state);

    case "Prompt":
    case "Response":
    case "Event":
      return Effect.sync(() => readNamed<Config>(state, part));
  }
};

/** The reading of every part of a trajectory, failing where one states a session incorrectly. */
const readParts = <Config extends Config.AnyConfig>(
  parts: Iterable<Trajectory.Part<Config>>,
): Effect.Effect<Reading, TrajectoryError> =>
  Effect.reduce(parts, reading, (state, part) => readPart(state, part));

/**
 * The session named by a part and never declared by the trajectory, where one is:
 * the main session is the one session read without a declaration.
 */
const undeclared = (state: Reading): string | undefined =>
  [...state.named].find((id) => id !== Trajectory.mainSessionId && !state.declared.has(id));

type Read<Config extends Config.AnyConfig, E, R> = Session.MainSession<
  Config,
  E | TrajectoryError | ByteStore.ByteStoreError,
  R | Config.DecodingServices<Config>
>;

export const read = Effect.fn(function* <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.fn.Return<
  Read<Config, E, R>,
  E | TrajectoryError | ByteStore.ByteStoreError,
  R | Config.EncodingServices<Config> | Config.DecodingServices<Config> | Cache.Cache
> {
  const cached = yield* Cache.cache(trajectory);

  const parts = yield* cached.pipe(Stream.runCollect);

  const state = yield* readParts(parts);

  const missing = undeclared(state);

  if (missing !== undefined) {
    return yield* Effect.fail(TrajectoryError.session(missing, "undeclared-session"));
  }

  const streamOfSession = (id: string) =>
    streamOf<
      Config,
      E | TrajectoryError | ByteStore.ByteStoreError,
      R | Config.DecodingServices<Config>
    >(cached, state.contained, id);

  // The main session is the root of the tree, and every other session hangs off the
  // session it continues from.
  const root: Read<Config, E, R> = {
    id: Trajectory.mainSessionId,
    forkBy: {},
    stream: streamOfSession(Trajectory.mainSessionId),
  };

  const sessions = new Map<
    string,
    Session.Session<
      Config,
      E | TrajectoryError | ByteStore.ByteStoreError,
      R | Config.DecodingServices<Config>
    >
  >();

  for (const [id, { session, fork }] of state.declared) {
    const parent = session === Trajectory.mainSessionId ? root : sessions.get(session);

    if (parent === undefined) {
      return yield* Effect.fail(TrajectoryError.session(id, "unproduced-fork"));
    }

    const forked: Session.Session<
      Config,
      E | TrajectoryError | ByteStore.ByteStoreError,
      R | Config.DecodingServices<Config>
    > = {
      id,
      forkFrom: { session: parent, uuid: fork },
      forkBy: {},
      stream: streamOfSession(id),
    };

    parent.forkBy[id] = forked;
    sessions.set(id, forked);
  }

  return root;
});
