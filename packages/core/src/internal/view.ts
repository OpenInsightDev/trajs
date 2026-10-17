/**
 * The reading behind {@link View.promptTurns}, {@link View.prompt} and
 * {@link View.conversations}: one pass over a trajectory groups its parts into the
 * turns they were produced in, folding the increments of a streamed response into
 * the parts they complete, and the turns are folded back into the prompt one
 * session's model was given — or, session by session, into the conversation each of
 * them ran in.
 *
 * Nothing here is published: a program reaches the reading through those three.
 */

import { Effect, Option, Stream } from "effect";
import { Prompt } from "effect/ai";

import * as Session from "#/Session.ts";
import * as Trajectory from "#/Trajectory.ts";
import { TrajectoryError } from "#/TrajectoryError.ts";
import type { Conversation, PromptTurn } from "#/View.ts";

import { collapse, initial, type State } from "./folding.ts";

/** The turn being assembled from the parts read so far, and the folding of its responses. */
interface Assembly<Config extends Trajectory.AnyConfig> {
  readonly turn: Option.Option<PromptTurn<Config>>;
  readonly folding: State;
}

const closed = <Config extends Trajectory.AnyConfig>(): Assembly<Config> => ({
  turn: Option.none(),
  folding: initial(),
});

/** The turn a prompt opens: what a model was given, with nothing answered yet. */
const opened = <Config extends Trajectory.AnyConfig>(
  prompt: Trajectory.PromptPart<Config["extrakit"]>,
): Assembly<Config> => ({ turn: Option.some({ prompt, response: [] }), folding: initial() });

const turnsOf = <Config extends Trajectory.AnyConfig>(
  turn: Option.Option<PromptTurn<Config>>,
): ReadonlyArray<PromptTurn<Config>> => (Option.isSome(turn) ? [turn.value] : []);

const assemble = <Config extends Trajectory.AnyConfig>(
  assembly: Assembly<Config>,
  part: Trajectory.Part<Config>,
): readonly [Assembly<Config>, ReadonlyArray<PromptTurn<Config>>] => {
  switch (part._tag) {
    case "Prompt":
      // A prompt opens a turn and closes the one before it, whether or not that one
      // was answered, so the turns are emitted in the order they were produced in.
      return [opened(part), turnsOf(assembly.turn)];

    case "Response": {
      const open = assembly.turn;

      // A response the open turn is not the prompt of — one no prompt precedes, or
      // one of another session — is on no turn of this reading.
      if (Option.isNone(open) || open.value.prompt.sessionId !== part.sessionId) {
        return [assembly, []];
      }

      const [folding, folded] = collapse(assembly.folding, part.sessionId, part.response);
      const response = [...open.value.response, ...folded];

      return [{ turn: Option.some({ prompt: open.value.prompt, response }), folding }, []];
    }

    default:
      return [assembly, []];
  }
};

/**
 * A trajectory read as the parts of one session alone: it fails where it declares
 * a session after a part of the session the trajectory reads.
 *
 * A session is declared before the parts it produced, so the declarations a
 * trajectory opens with are the ones it makes before trajectory anything; a
 * declaration read after a part is the declaration of another session, or of one
 * declared twice, so the stream holds the parts of more than one session — which is
 * what {@link readPrompt} refuses to fold.
 */
const oneSession = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Stream.Stream<Trajectory.Part<Config>, E | TrajectoryError, R> =>
  Stream.suspend(() => {
    // A reading of the stream starts afresh, so whether a part has been read is
    // held per reading rather than by the combinator.
    let seen = false;

    const check = (part: Trajectory.Part<Config>): Effect.Effect<void, TrajectoryError> => {
      if (part._tag !== "Session") {
        seen = true;

        return Effect.void;
      }

      return seen ? Effect.fail(TrajectoryError.session(part.id, "several-sessions")) : Effect.void;
    };

    return trajectory.pipe(Stream.tap(check));
  });

/**
 * Reads a trajectory as the turns its conversation was produced in: a prompt part
 * opens a turn, the response parts that follow it are folded into that turn, and a
 * turn is closed by the prompt after it, or by the trajectory ending.
 */
export const readTurns = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Stream.Stream<PromptTurn<Config>, E, R> =>
  trajectory.pipe(
    Stream.mapAccum(closed<Config>, assemble, {
      // The turn a trajectory ends in has no prompt after it to close it, so the
      // trajectory ending is what closes it.
      onHalt: (assembly) => turnsOf(assembly.turn),
    }),
  );

/**
 * Folds a trajectory back into the prompt its model was given, from the parts of one
 * session alone: a trajectory that declares a session after the parts of another one
 * fails with the {@link TrajectoryError} that names it rather than folding the prompt
 * of both.
 */
export const readPrompt = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E | TrajectoryError, R> =>
  readTurns(oneSession(trajectory)).pipe(
    Stream.runFold(
      () => Prompt.empty,
      (folded, turn) =>
        folded.pipe(
          Prompt.concat(Prompt.fromMessages(turn.prompt.messages)),
          Prompt.concat(Prompt.fromResponseParts(turn.response)),
        ),
    ),
  );

/**
 * The conversation of every session of a trajectory, by session id: the messages
 * each of them produced, preceded by what it inherited from the sessions it
 * continues from.
 */
export const readConversations = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Effect.Effect<Record<string, Conversation>, E | TrajectoryError, R> =>
  Effect.gen(function* () {
    const roots = yield* Session.sessions(trajectory).pipe(Stream.runCollect);

    const read = yield* Effect.forEach(roots, (session) => readSession(session, []));

    return Object.fromEntries(read.flat());
  });

/**
 * One session of a trajectory and the sessions forked off it, read as the messages
 * of their conversations.
 *
 * `inherited` is the conversation the session continues from, which is read from
 * the session that produced the part a fork names rather than from the fork: a fork
 * holds none of the parts of the session it continues from.
 */
const readSession = <Config extends Trajectory.AnyConfig, E, R>(
  session: Session.Session<Config, E, R>,
  inherited: Conversation,
): Effect.Effect<ReadonlyArray<readonly [string, Conversation]>, E | TrajectoryError, R> =>
  Effect.gen(function* () {
    const parts = Array.from(yield* Stream.runCollect(session.parts));
    const forks = Array.from(yield* Stream.runCollect(session.forkedBy));

    const entry: readonly [string, Conversation] = [
      session.id,
      [...inherited, ...(yield* messagesOf(parts))],
    ];

    const forked = yield* Effect.forEach(forks, (fork) =>
      Effect.gen(function* () {
        const continues = yield* Option.match(fork.forkedFrom, {
          onNone: () => Effect.succeed(inherited),
          onSome: (from) =>
            messagesOf(upTo(parts, uuidOf(from.part))).pipe(
              Effect.map((produced) => [...inherited, ...produced]),
            ),
        });

        return yield* readSession(fork, continues);
      }),
    );

    return [entry, ...forked.flat()];
  });

/**
 * The `uuid` a part is named by, which is what a `fork` continues from. A metric
 * part names no session and holds no `uuid`, and a fork names a part of a session,
 * so it is never one: it is read as naming none.
 */
const uuidOf = <Config extends Trajectory.AnyConfig>(part: Trajectory.Part<Config>): string =>
  part._tag === "Metric" ? "" : part.uuid;

/** The parts of a session up to and including the one `uuid` names. */
const upTo = <Config extends Trajectory.AnyConfig>(
  parts: ReadonlyArray<Trajectory.Part<Config>>,
  uuid: string,
): ReadonlyArray<Trajectory.Part<Config>> => {
  const at = parts.findIndex((part) => uuidOf(part) === uuid);

  return at === -1 ? parts : parts.slice(0, at + 1);
};

/**
 * The messages the parts of one session were produced as, folded the way a
 * trajectory is read back into the prompt its model was given.
 *
 * A declaration is read past rather than folded: it declares the session, and what
 * a model was given of a session is its prompts and the responses to them.
 */
const messagesOf = <Config extends Trajectory.AnyConfig>(
  parts: ReadonlyArray<Trajectory.Part<Config>>,
): Effect.Effect<Conversation, TrajectoryError> =>
  readPrompt(
    Stream.fromIterable(parts).pipe(Stream.filter((part) => part._tag !== "Session")),
  ).pipe(Effect.map((prompt) => prompt.content));
