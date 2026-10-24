import { ByteStore } from "@trajs/utils";
import { Effect, Stream } from "effect";

import * as Cache from "#/Cache.ts";
import * as Config from "#/Config.ts";
import { reading, streamOf, undeclared, type Reading } from "#/internal/session.ts";
import * as Trajectory from "#/Trajectory.ts";

import { TrajectoryError } from "./TrajectoryError.ts";

/**
 * The parts one session ran on: every part of a trajectory that states its id, and the
 * metric parts attached to those, in the order the trajectory holds them.
 *
 * A declaration names the session it declares rather than being a part of it, so what a
 * session stream holds is every other kind of part.
 *
 * @see {@link Session} for the session it is read from.
 * @category models
 */
export type SessionStream<Config extends Config.AnyConfig, E, R> = Stream.Stream<
  Exclude<Trajectory.Part<Config>, Trajectory.SessionPart<Config["extrakit"]>>,
  E,
  R
>;

/**
 * One session of a trajectory, placed in the tree it was forked into.
 *
 * **Details**
 *
 * - `forkFrom` is the session it continues from, and the `uuid` of the part it continues
 *   from: a prompt, a response, or the declaration of that session.
 * - `forkBy` holds the sessions forked directly off it, keyed by their id.
 * - `stream` is what it ran on, read out of a cache of the trajectory, so it can be
 *   iterated as often as it is asked for.
 *
 * @see {@link MainSession} for the root of the tree.
 * @category models
 */
export type Session<Config extends Config.AnyConfig, E, R> = Readonly<{
  id: string;
  forkFrom: Readonly<{
    session: Session<Config, E, R> | MainSession<Config, E, R>;
    uuid: string;
  }>;
  forkBy: Record<string, Session<Config, E, R>>;
  stream: SessionStream<Config, E, R>;
}>;

/**
 * The main session of a trajectory: the root of the tree it declares, the one session
 * whose parts state no id of their own or state {@link Trajectory.mainSessionId}.
 *
 * @see {@link Session} for a session forked off it.
 * @see {@link main} for reading a trajectory as it.
 * @category models
 */
export type MainSession<Config extends Config.AnyConfig, E, R> = Readonly<{
  id: typeof Trajectory.mainSessionId;
  forkBy: Record<string, Session<Config, E, R>>;
  stream: SessionStream<Config, E, R>;
}>;

/** A part that names the session it was produced in. */
type NamedPart<Config extends Config.AnyConfig> =
  | Trajectory.PromptPart<Config["extrakit"]>
  | Trajectory.ResponsePart<Config["toolkit"], Config["extrakit"], Config["stream"]>
  | Trajectory.EventPart<Config["eventkit"]>;

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

type Read<Config extends Config.AnyConfig, E, R> = MainSession<
  Config,
  E | TrajectoryError | ByteStore.ByteStoreError,
  R | Config.DecodingServices<Config>
>;

/**
 * Reads a trajectory as the sessions it declares, with the main session at the root.
 *
 * **When to use**
 *
 * Use to read a trajectory one session at a time rather than as the single order its
 * parts arrived in.
 *
 * **Details**
 *
 * The trajectory is cached first, so its parts are read once and every session stream
 * reads them again. A session's stream holds the parts that state its id, and the metric
 * parts attached to them, in the order the trajectory holds them. The main session is the
 * one session read without a declaration, and a part naming another session the
 * trajectory does not declare fails the reading.
 *
 * A session is declared before the parts it produced, and a `fork` names a part read
 * before the declaration reading it. A trajectory that breaks either rule fails with a
 * {@link TrajectoryError}.
 *
 * @see {@link MainSession} for the reading.
 * @see {@link Session} for one session of it.
 * @category constructors
 */
export const main = Effect.fn(function* <Config extends Config.AnyConfig, E, R>(
  trajectory: Trajectory.Trajectory<string, Config, E, R>,
): Effect.fn.Return<
  MainSession<
    Config,
    E | TrajectoryError | ByteStore.ByteStoreError,
    R | Config.DecodingServices<Config>
  >,
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
    Session<
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

    const forked: Session<
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
