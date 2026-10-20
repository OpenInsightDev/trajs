/**
 * Ways of reading a trajectory as the conversation it produces: {@link promptTurns}
 * groups the parts of one into the turns a model was given and answered, folding
 * the increments of a streamed response into the parts they complete,
 * {@link prompt} folds those turns back into the one prompt a model was given, and
 * {@link conversations} reads a trajectory session by session, as the messages each
 * of them ran on — which is what a provider's API is handed.
 *
 * A trajectory is one stream of parts in total order — see {@link Trajectory} — so
 * what a model was given and what it returned are read by grouping the parts that
 * follow one another: no part names the turn it belongs to.
 */

import type { Effect, Stream } from "effect";
import type { Prompt } from "effect/ai";

import type * as Response from "#/Response.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

import { readConversations, readPrompt, readTurns } from "./internal/view.ts";

/** The tools of a config's toolkit, which the response parts read from it are typed by. */
type Tools<Config extends Trajectory.AnyConfig> = Config["toolkit"]["tools"];

/**
 * One turn of a trajectory: the prompt part a model was given, and the parts it
 * answered that prompt with.
 *
 * **When to use**
 *
 * Use to type a turn read from a trajectory — what {@link promptTurns} emits — such
 * as to read a conversation one turn at a time.
 *
 * **Details**
 *
 * The response is what the model returned for that prompt alone, as whole parts: a
 * response part produced as the increments of a streamed one reads as the part they
 * complete, and a trajectory whose response parts are whole already reads as itself.
 * Nothing else of a trajectory is part of a turn — a session declaration, an event
 * or a metric part a trajectory holds between a prompt and its responses is read past.
 *
 * @see {@link promptTurns} for the reader that emits one turn per prompt given.
 * @category models
 */
export type PromptTurn<Config extends Trajectory.AnyConfig> = Readonly<{
  prompt: Trajectory.PromptPart<Config["extrakit"]>;
  response: ReadonlyArray<Response.PartView<Tools<Config>>>;
}>;

/**
 * Reads a trajectory as the turns its conversation was produced in.
 *
 * **When to use**
 *
 * Use to read a trajectory as what a model was given and what it answered, one turn
 * at a time, rather than as the parts it arrived in: to display a conversation, to
 * score it, or to hand it to a format that states a run as its turns.
 *
 * **Details**
 *
 * - A prompt part opens a turn, and every response part that follows it is produced
 *   on that turn, whichever form the trajectory was written in: the increments of a
 *   streamed response are folded into the parts they complete, and a response part
 *   that is whole already is produced as itself.
 * - A response part the open turn is not the prompt of — one no prompt precedes, or
 *   one of another session — belongs to no turn and is dropped, so a trajectory that
 *   interleaves several sessions reads one session at a time.
 * - A prompt part with no response reads as its messages alone: it opens a turn
 *   whether or not a model answered it.
 * - The turn a trajectory ends in is emitted when the trajectory ends, since no
 *   prompt part follows it to close it.
 * - Only prompt and response parts open, extend or close a turn: a session
 *   declaration, an event or a metric part is read past.
 *
 * **Example** (Reading a trajectory as its turns)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Extra, Prompt, Response, Toolkit, Trajectory, View } from "@trajs/core"
 *
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 * const extrakit = Extra.makeKit()
 * const response = Trajectory.ResponsePart({ toolkit: Toolkit.empty, extrakit, stream: false })
 *
 * // A trajectory of one exchange: what a model was given, and what it returned for
 * // it as one whole part.
 * const trajectory = Stream.make(
 *   Trajectory.promptPart(extrakit)(Prompt.make("What is 2 + 2?"), { sessionId }),
 *   response.make({ response: Response.makePart("text", { text: "4" }), sessionId, extra: {} })
 * )
 *
 * const turns = await Effect.runPromise(Stream.runCollect(View.promptTurns(trajectory)))
 *
 * Array.from(turns).map((turn) => turn.response.map((part) => part.type)) // => [["text"]]
 * ```
 *
 * @see {@link PromptTurn} for the turn it emits.
 * @see {@link Trajectory.Part} for the parts it reads.
 * @category combinators
 */
export const promptTurns = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Stream.Stream<PromptTurn<Config>, E, R> => readTurns(trajectory);

/**
 * Folds a trajectory back into the prompt its model was given.
 *
 * **When to use**
 *
 * Use when the conversation a trajectory ran on is to be continued, evaluated or
 * inspected as one prompt rather than turn by turn.
 *
 * **Details**
 *
 * The turns of {@link promptTurns} are concatenated in the order they were produced
 * — each prompt part followed by the responses folded for it — so the result holds
 * the messages of the whole trajectory rather than of one turn.
 *
 * The prompt folded is that of one session alone, since a prompt that mixes the
 * turns of several is one no model was ever given. A session declaration is read
 * past where it opens the trajectory — a session is declared before the parts it
 * produced — but a declaration read after those parts declares another session, and
 * the reading fails with the {@link TrajectoryError} that names it: a
 * {@link TrajectoryError.SessionError} whose reason is `"several-sessions"`. Read
 * one session of a trajectory that holds several with {@link Session.of}, whose
 * parts begin with the declaration of that session.
 *
 * The effect fails with the trajectory's failure — `E` on top of the
 * {@link TrajectoryError} a produced trajectory fails with — and requires the
 * services `R` names.
 *
 * **Example** (Folding a trajectory back into the prompt a model was given)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Extra, Prompt, Response, Toolkit, Trajectory, View } from "@trajs/core"
 *
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 * const extrakit = Extra.makeKit()
 * const response = Trajectory.ResponsePart({ toolkit: Toolkit.empty, extrakit, stream: false })
 *
 * // A trajectory of one session: what a model was given, and what it answered.
 * const trajectory = Stream.make(
 *   Trajectory.sessionPart(extrakit)(sessionId),
 *   Trajectory.promptPart(extrakit)(Prompt.make("What is 2 + 2?"), { sessionId }),
 *   response.make({ response: Response.makePart("text", { text: "4" }), sessionId, extra: {} })
 * )
 *
 * const folded = await Effect.runPromise(View.prompt(trajectory))
 * folded.content.map((message) => message.role) // => ["user", "assistant"]
 * ```
 *
 * @see {@link promptTurns} for the turns it is folded from.
 * @see {@link PromptTurn} for a turn of the conversation on its own.
 * @see {@link Session.of} for reading one session of a trajectory that holds several.
 * @category combinators
 */
export const prompt = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E | TrajectoryError, R> => readPrompt(trajectory);

/**
 * The messages of one session of a trajectory, as the conversation it ran in: the
 * messages the session produced, and the ones it inherited from the sessions it
 * continues from.
 *
 * **When to use**
 *
 * Use to type a conversation read from a trajectory — what {@link conversations}
 * returns — such as to write one as a provider's API states it.
 *
 * @see {@link conversations} for the operation that reads a trajectory as them.
 * @category models
 */
export type Conversation = ReadonlyArray<Prompt.Message>;

/**
 * Reads a trajectory as the conversations its sessions ran in, one conversation per
 * session, keyed by the id of the session.
 *
 * **When to use**
 *
 * Use to read a trajectory as the messages each of its sessions was given and
 * answered — to write them as a provider's API states them, or to inspect what one
 * session's model saw — rather than as the single stream its parts arrived in.
 *
 * **Details**
 *
 * - A session's conversation is the messages the session produced, preceded by the
 *   ones it inherited: what the sessions it continues from produced up to the part
 *   it continues from, from the root of the fork down. A session that continues from
 *   nothing is read as the messages it produced alone.
 * - The messages of a session are its prompts and the responses to them, folded the
 *   way {@link prompt} folds a trajectory: a session declaration is read past, and
 *   the increments of a streamed response into the parts they complete.
 * - A session appears whether or not it produced a conversation: a session whose
 *   parts hold no prompt is one that ran on what it inherited alone, and is read as
 *   that.
 *
 * The effect fails with what reading the trajectory's sessions fails with — `E` on
 * top of the {@link TrajectoryError} a trajectory whose sessions cannot be read fails
 * with — and requires the services `R` names.
 *
 * **Example** (Reading a trajectory as the conversation of each of its sessions)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Extra, Prompt, Response, Toolkit, Trajectory, View } from "@trajs/core"
 *
 * const extrakit = Extra.makeKit()
 * const response = Trajectory.ResponsePart({ toolkit: Toolkit.empty, extrakit, stream: false })
 *
 * const asked = Trajectory.promptPart(extrakit)(
 *   Prompt.make("What is a fork?"),
 *   { sessionId: "asking" }
 * )
 * const answered = response.make({
 *   response: Response.makePart("text", { text: "It is a session that continues another." }),
 *   sessionId: "asking",
 *   extra: {}
 * })
 *
 * // One session asks and is answered, and a session forked off the answer asks again:
 * // its conversation is the answer that was given, then its own question.
 * const trajectory = Stream.make(
 *   Trajectory.sessionPart(extrakit)("asking"),
 *   asked,
 *   answered,
 *   Trajectory.sessionPart(extrakit)("reply", { fork: answered.uuid }),
 *   Trajectory.promptPart(extrakit)(Prompt.make("And what does it hold?"), { sessionId: "reply" })
 * )
 *
 * const conversations = await Effect.runPromise(View.conversations(trajectory))
 *
 * conversations["asking"]?.map((message) => message.role) // => ["user", "assistant"]
 * conversations["reply"]?.map((message) => message.role) // => ["user", "assistant", "user"]
 * ```
 *
 * @see {@link Conversation} for one session's messages.
 * @see {@link Session.toSessions} for the sessions a trajectory is read as.
 * @see {@link prompt} for the whole trajectory read as one prompt instead.
 * @category combinators
 */
export const conversations = <Config extends Trajectory.AnyConfig, E, R>(
  trajectory: Trajectory.TrajectoryStream<Config, E, R>,
): Effect.Effect<Record<string, Conversation>, E | TrajectoryError, R> =>
  readConversations(trajectory);
