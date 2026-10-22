/**
 * Ways of reading the parts of a session as what they say rather than as the parts they were
 * produced as: {@link promptTurns} groups them into the turns a model was given and answered,
 * folding the increments of a streamed response into the parts they complete, {@link prompt}
 * folds those turns back into the one prompt a model was given, {@link conversations} reads
 * the sessions of a trajectory as the messages each of them ran on — which is what a
 * provider's API is handed — and {@link toolTurns} reads them as the calls a model made with
 * its tools, each with the result it was answered with.
 *
 * What each of them reads is the parts of one session ({@link Session.SessionStream}),
 * which {@link Session.toSessions} reads apart from the one stream a trajectory holds
 * them in. {@link conversations} reads every session a trajectory holds at once; the others
 * read one of them — `View.promptTurns(session.stream)`, say.
 */

import type { Effect, Stream } from "effect";
import type { Prompt } from "effect/ai";

import { readConversations, readPrompt, readToolTurns, readTurns } from "#/internal/view.ts";
import type * as Response from "#/Response.ts";
import type * as Session from "#/Session.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/** The tools of a config's toolkit, which the response parts read from it are typed by. */
type Tools<Config extends Trajectory.AnyConfig> = Config["toolkit"]["tools"];

/**
 * One turn of a session: the prompt part a model was given, and the parts it answered that
 * prompt with.
 *
 * **When to use**
 *
 * Use to type a turn read from a session — what {@link promptTurns} emits — such as to read
 * a conversation one turn at a time.
 *
 * **Details**
 *
 * The response is what the model returned for that prompt alone, as whole parts: a response
 * part produced as the increments of a streamed one reads as the part they complete, and
 * parts whose response parts are whole already read as themselves. Nothing else of a session
 * is part of a turn — an event or a metric part the parts hold between a prompt and its
 * responses is read past.
 *
 * @see {@link promptTurns} for the reader that emits one turn per prompt given.
 * @category models
 */
export type PromptTurn<Config extends Trajectory.AnyConfig> = Readonly<{
  prompt: Trajectory.PromptPart<Config["extrakit"]>;
  response: ReadonlyArray<Response.PartView<Tools<Config>>>;
}>;

/**
 * Reads the parts of a session as the turns its conversation was produced in.
 *
 * **When to use**
 *
 * Use to read what a model was given and what it answered one turn at a time, rather than as
 * the parts they were produced as: to display a conversation, to score it, or to hand it to a
 * format that states a run as its turns.
 *
 * **Details**
 *
 * - A prompt part opens a turn, and every response part that follows it is produced on that
 *   turn, whichever form the parts were written in: the increments of a streamed response are
 *   folded into the parts they complete, and a response part that is whole already is produced
 *   as itself.
 * - The parts are of one session ({@link Session.SessionStream}), so a response part is on
 *   the turn the prompt before it opened: one no prompt precedes is on no turn, and is dropped
 *   rather than carried.
 * - A prompt part with no response reads as its messages alone: it opens a turn whether or not
 *   a model answered it.
 * - The turn the parts end in is emitted when they end, since no prompt part follows it to
 *   close it.
 * - Only prompt and response parts open, extend or close a turn: an event or a metric part the
 *   parts hold between them is read past.
 *
 * **Example** (Reading the parts of a session as their turns)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Response, Trajectory, View } from "@trajs/core"
 *
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * // What one session's model was given, and what it returned for it as one whole part.
 * const stream = Stream.make(
 *   part.prompt(Prompt.make("What is 2 + 2?"), { sessionId }),
 *   part.response(Response.makePart("text", { text: "4" }), { sessionId })
 * )
 *
 * const turns = await Effect.runPromise(Stream.runCollect(View.promptTurns(stream)))
 *
 * Array.from(turns).map((turn) => turn.response.map((part) => part.type)) // => [["text"]]
 * ```
 *
 * @see {@link PromptTurn} for the turn it emits.
 * @see {@link Session.Session.stream} for the parts a session is read by.
 * @category combinators
 */
export const promptTurns = <Config extends Trajectory.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<PromptTurn<Config>, E, R> => readTurns(stream);

/**
 * Folds the parts of a session back into the prompt its model was given.
 *
 * **When to use**
 *
 * Use when the conversation a session ran on is to be continued, evaluated or inspected as
 * one prompt rather than turn by turn.
 *
 * **Details**
 *
 * The turns of {@link promptTurns} are concatenated in the order they were produced — each
 * prompt part followed by the responses folded for it — so the result holds the messages of
 * the whole session rather than of one turn: what it inherited from the sessions it continues
 * from, and what it produced itself.
 *
 * The effect fails with what reading the parts fails with — `E` — and requires the services
 * `R` names.
 *
 * **Example** (Folding the parts of a session back into the prompt its model was given)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Response, Trajectory, View } from "@trajs/core"
 *
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * // What one session's model was given, and what it answered.
 * const stream = Stream.make(
 *   part.prompt(Prompt.make("What is 2 + 2?"), { sessionId }),
 *   part.response(Response.makePart("text", { text: "4" }), { sessionId })
 * )
 *
 * const folded = await Effect.runPromise(View.prompt(stream))
 * folded.content.map((message) => message.role) // => ["user", "assistant"]
 * ```
 *
 * @see {@link promptTurns} for the turns it is folded from.
 * @see {@link PromptTurn} for a turn of the conversation on its own.
 * @see {@link Session.Session.stream} for the parts a session is read by.
 * @category combinators
 */
export const prompt = <Config extends Trajectory.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Effect.Effect<Prompt.Prompt, E, R> => readPrompt(stream);

/**
 * The messages of one session, as the conversation it ran in: the ones it inherited from the
 * sessions it continues from, and the ones it produced itself.
 *
 * **When to use**
 *
 * Use to type a conversation read from a session — what {@link conversations} returns — such
 * as to write one as a provider's API states it.
 *
 * @see {@link conversations} for the operation that reads sessions as them.
 * @category models
 */
export type Conversation = ReadonlyArray<Prompt.Message>;

/**
 * Reads the sessions of a trajectory as the conversations they ran in, one conversation per
 * session, keyed by the id of the session.
 *
 * **When to use**
 *
 * Use to read a trajectory as the messages each of its sessions was given and answered — to
 * write them as a provider's API states them, or to inspect what one session's model saw —
 * rather than as the single stream its parts arrived in.
 *
 * **Details**
 *
 * - A session's conversation is the messages of what it ran on: what it inherited from the
 *   sessions it continues from, up to the part each of them is continued from, and what it
 *   produced itself ({@link Session.Session.stream}).
 * - The messages of a session are its prompts and the responses to them, folded the way
 *   {@link prompt} folds a trajectory: the increments of a streamed response into the parts
 *   they complete, and what a kit produced of the session beside them read past.
 * - A session appears whether or not it produced a conversation: a session whose parts hold no
 *   prompt is one that ran on what it inherited alone, and is read as that.
 *
 * The effect fails with what reading the parts of a session fails with — the {@link TrajectoryError}
 * a trajectory whose parts cannot be read fails with, on top of what the store they are kept in
 * fails with — and requires the services `R` names.
 *
 * **Example** (Reading a trajectory as the conversation of each of its sessions)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt, Response, Session, Trajectory, View } from "@trajs/core"
 *
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * const asked = part.prompt(Prompt.make("What is a fork?"))
 * const answered = part.response(
 *   Response.makePart("text", { text: "It is a session that continues another." })
 * )
 *
 * // The main session asks and is answered, and a session forked off the answer asks
 * // again: its conversation is the answer that was given, then its own question.
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
 * const conversations = await Effect.runPromise(View.conversations(sessions))
 *
 * conversations["main"]?.map((message) => message.role) // => ["user", "assistant"]
 * conversations["reply"]?.map((message) => message.role) // => ["user", "assistant", "user"]
 * ```
 *
 * @see {@link Conversation} for one session's messages.
 * @see {@link Session.toSessions} for the sessions it is given.
 * @see {@link prompt} for one session's messages read as one prompt instead.
 * @category combinators
 */
export const conversations = <Config extends Trajectory.AnyConfig, E, R>(
  sessions: Session.Sessions<Config, E, R>,
): Effect.Effect<Record<string, Conversation>, E | TrajectoryError, R> =>
  readConversations(sessions);

/**
 * One tool turn of a trajectory: a tool a model called, and the result that call was
 * answered with.
 *
 * **When to use**
 *
 * Use to type a tool turn read from a trajectory — what {@link toolTurns} emits — such
 * as to read what a run asked of its tools, one call at a time.
 *
 * **Details**
 *
 * The two parts are read the way every part of a trajectory is: through the toolkit,
 * so a call or a result of a tool the toolkit does not describe reads as the part the
 * trajectory holds rather than failing to read at all — see
 * {@link Response.ToolCallPartsView}.
 *
 * @see {@link toolTurns} for the reader that emits one tool turn per call.
 * @category models
 */
export type ToolTurn<Config extends Trajectory.AnyConfig> = Readonly<{
  call: Response.ToolCallPartsView<Tools<Config>>;
  result: Response.ToolResultPartsView<Tools<Config>>;
}>;

/**
 * Reads the parts of a session as the tool turns it holds: every tool a model called, with the
 * result that call was answered with.
 *
 * **When to use**
 *
 * Use to read a session for what it did with its tools rather than for the conversation it
 * had: to score a run by the tools it used, to find the calls a model made over and over, or
 * to display each call beside what its tool returned. A session read as the conversation
 * instead is what {@link promptTurns} emits.
 *
 * **Details**
 *
 * - A tool turn is emitted where the result that answers a call arrives, which is the result
 *   whose `id` is the call's.
 * - A preliminary result is the progress of a call rather than the answer to it and is read
 *   past, so the result of a tool turn is the final one.
 * - A call the parts hold no such result for is not a tool turn, and neither is a result whose
 *   call they do not hold: parts that end while a tool still runs hold the call alone, and a
 *   result no call of this reading was made for has nothing to pair it with.
 * - The turns are emitted in the order the calls were answered, which is the order the calls
 *   were made in parts that answer each one as it runs, and a call is held only until then, so
 *   the parts are read once rather than held whole.
 * - Only the parts that carry a tool call or a tool result are read: the increments a streamed
 *   response arrived in, and the text and reasoning a model answered with, are read past.
 *
 * The stream fails with what reading the parts fails with — `E` — and requires the services
 * `R` names.
 *
 * **Example** (Reading the parts of a session as their tool turns)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Response, Trajectory, View } from "@trajs/core"
 *
 * const sessionId = "01890a5d-ac96-774b-bcce-b302099a8057"
 * const part = Trajectory.parts(Trajectory.anyConfig)
 *
 * // The parts of one call: the tool a model called, and the result it was answered with.
 * const stream = Stream.make(
 *   part.response(
 *     Response.anyToolCallPart({
 *       id: "call_1",
 *       name: "get_weather",
 *       params: { city: "Paris" },
 *       providerExecuted: false
 *     }),
 *     { sessionId }
 *   ),
 *   part.response(
 *     Response.anyToolResultPart({
 *       id: "call_1",
 *       name: "get_weather",
 *       isFailure: false,
 *       result: "sunny",
 *       providerExecuted: false
 *     }),
 *     { sessionId }
 *   )
 * )
 *
 * const turns = await Effect.runPromise(Stream.runCollect(View.toolTurns(stream)))
 *
 * Array.from(turns).map((turn) => [turn.call.name, turn.result.result]) // => [["get_weather", "sunny"]]
 * ```
 *
 * @see {@link ToolTurn} for the turn it emits.
 * @see {@link promptTurns} for the conversation read instead.
 * @see {@link Session.Session.stream} for the parts a session is read by.
 * @category combinators
 */
export const toolTurns = <Config extends Trajectory.AnyConfig, E, R>(
  stream: Session.SessionStream<Config, E, R>,
): Stream.Stream<ToolTurn<Config>, E, R> => readToolTurns(stream);
