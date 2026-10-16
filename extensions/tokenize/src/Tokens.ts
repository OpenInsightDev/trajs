/**
 * The schemas a count of a trajectory part is recorded as.
 *
 * A recording holds the parts a session ran on but not what they cost, and what a
 * part costs depends on what kind of part it is. A prompt is many messages at
 * once, so its count is stated kind by kind — the text it carries, the reasoning
 * of a model, the calls of tools and their results, and a payload that is not
 * text — beside the total those kinds sum to, so that what a prompt spent on one
 * kind of information is read from its count rather than only what it cost in all.
 * A response is one message part, so it has a schema of its own per kind:
 * {@link TextTokens}, {@link ReasoningTokens}, {@link ToolCallTokens},
 * {@link FileTokens} and {@link ToolResultTokens}.
 *
 * Every response kind states the part's `tokens` and how many of them,
 * `mediaTokens`, a rule on a payload that is not text priced rather than the
 * tokenizer. A tool result is the other half of a tool call, so
 * {@link ToolResultTokens} states what the call it answers is worth beside the
 * result: a call-result is what a session spends on a tool, and a reader deciding
 * whether a tool is worth its place needs the two numbers together.
 *
 * The members are the union {@link TokenCount}, which is what a metric's output
 * holds as a field of its own rather than being the union itself: the data a
 * metric's output states has to be a struct with a `version` of its own, and a
 * union is not one — see {@link Metrics} for the output the union is recorded in,
 * and {@link Count} for the functions that take a count.
 *
 * These are shapes of a count rather than versioned data of their own: only the
 * output a count is recorded in is versioned, since it is the datum a recording
 * holds. A field added to a count is therefore a new version of the metric's
 * output rather than a version of the count — see {@link Metrics}.
 */

import { Schema } from "effect";

/** The fields every response kind states. */
const contentFields = {
  tokens: Schema.Number,
  mediaTokens: Schema.Number,
};

/**
 * The count of a prompt part: the tokens each kind of information it carries
 * contributed, beside the total.
 *
 * - `text` and `reasoning` are the tokens the text of those parts is worth, and
 *   `toolCall` and `toolResult` the tokens of the calls a prompt carries and of
 *   their results — a call is its name and the JSON of its parameters, and a
 *   result is its identifier and its result.
 * - `media` is what a payload that is not text is estimated at, which a rule
 *   prices rather than the tokenizer.
 * - `tokens` is the total: the sum of every kind above. The kinds partition the
 *   count, so nothing a prompt carries is left out of one of them, and a kind the
 *   prompt's messages do not carry states `0`.
 *
 * A prompt is one schema however many messages it carries, because what a caller
 * reads from it is what the prompt is made of rather than which of its messages
 * was counted: the part holds them all, and `attach` names it for all of them.
 *
 * @see {@link TokenCount} for the union the shape is a member of.
 * @category schemas
 */
export const PromptTokens = Schema.TaggedStruct("prompt", {
  text: Schema.Number,
  reasoning: Schema.Number,
  toolCall: Schema.Number,
  toolResult: Schema.Number,
  media: Schema.Number,
  tokens: Schema.Number,
});

/**
 * A count of a prompt part, as the package records it.
 *
 * @see {@link PromptTokens} for the schema the datum is read by.
 * @category models
 */
export type PromptTokens = Schema.Schema.Type<typeof PromptTokens>;

/**
 * The count of a response part that carries text.
 *
 * **When to use**
 *
 * Use when reading what one text part a model returned is worth, or when building
 * the count of one.
 *
 * **Details**
 *
 * The count is the tokens of the text the part holds, which is what a tokenizer
 * answers for, so `mediaTokens` is `0`.
 *
 * @see {@link TokenCount} for the union the shape is a member of.
 * @category schemas
 */
export const TextTokens = Schema.TaggedStruct("text", contentFields);

/**
 * A count of a response part that carries text.
 *
 * @see {@link TextTokens} for the schema the datum is read by.
 * @category models
 */
export type TextTokens = Schema.Schema.Type<typeof TextTokens>;

/**
 * The count of a response part that carries the reasoning of a model.
 *
 * **When to use**
 *
 * Use when reading what one reasoning part is worth, such as to see how much of a
 * session a model spent thinking rather than answering.
 *
 * **Details**
 *
 * The count is the tokens of the reasoning text, counted the way text is — the
 * one rule `ai-tokenizer` does not state, because the messages it counts carry no
 * reasoning part. `mediaTokens` is `0`.
 *
 * @see {@link TokenCount} for the union the shape is a member of.
 * @category schemas
 */
export const ReasoningTokens = Schema.TaggedStruct("reasoning", contentFields);

/**
 * A count of a response part that carries the reasoning of a model.
 *
 * @see {@link ReasoningTokens} for the schema the datum is read by.
 * @category models
 */
export type ReasoningTokens = Schema.Schema.Type<typeof ReasoningTokens>;

/**
 * The count of a response part that calls a tool.
 *
 * **When to use**
 *
 * Use when reading what one tool call a model made is worth, such as to see what
 * the calls of a session cost before their results are read.
 *
 * **Details**
 *
 * The count is the tokens of the call's name and of the JSON of its parameters,
 * which is what a tokenizer answers for. What the result that answers the call is
 * worth is stated by the result's own count — {@link ToolResultTokens} — because
 * the two are recorded as parts of their own.
 *
 * @see {@link TokenCount} for the union the shape is a member of.
 * @category schemas
 */
export const ToolCallTokens = Schema.TaggedStruct("tool-call", contentFields);

/**
 * A count of a response part that calls a tool.
 *
 * @see {@link ToolCallTokens} for the schema the datum is read by.
 * @category models
 */
export type ToolCallTokens = Schema.Schema.Type<typeof ToolCallTokens>;

/**
 * The count of a response part that is a tool result.
 *
 * **When to use**
 *
 * Use when reading what a tool result is worth and what the call it answers is
 * worth with it, such as to total what a session spent on the tools it called.
 *
 * **Details**
 *
 * - `tokens` and `mediaTokens` are the result's own.
 * - `toolCallTokens` is what the call and its result are worth together — the
 *   whole call-result — so that what a tool cost is read from its result alone.
 *   A result always answers a call, which is the call of the same `id` recorded
 *   before it; the two are counted as one number here because a caller reads the
 *   cost of a tool from the result that closes it.
 *
 * The call is not counted here but read from the recording the result belongs to,
 * by the identifier the two share. A reading that does not hold the call — a
 * recording that begins after it was made — is one no count is taken from, rather
 * than one whose call-result is guessed, so `Count` gives back nothing for a tool
 * result it is handed on its own while the metric's producer, which reads a whole
 * recording, states the pair.
 *
 * @see {@link TokenCount} for the union the shape is a member of.
 * @category schemas
 */
export const ToolResultTokens = Schema.TaggedStruct("tool-result", {
  tokens: Schema.Number,
  mediaTokens: Schema.Number,
  toolCallTokens: Schema.Number,
});

/**
 * A count of a response part that is a tool result.
 *
 * @see {@link ToolResultTokens} for the schema the datum is read by.
 * @category models
 */
export type ToolResultTokens = Schema.Schema.Type<typeof ToolResultTokens>;

/**
 * The count of a response part that carries a payload that is not text.
 *
 * **When to use**
 *
 * Use when reading what an image or a file a model returned is estimated to cost,
 * such as to see whether the media of a session dominates it.
 *
 * **Details**
 *
 * A payload that is not text is the one thing a tokenizer cannot answer for, so
 * the whole count is what a rule estimated it at and `mediaTokens` is the same
 * number as `tokens` rather than `0`. Which rule priced it is not stated: the
 * estimation is a property of the run that counted rather than of the recording —
 * see {@link Count.CountOptions.media}.
 *
 * @see {@link TokenCount} for the union the shape is a member of.
 * @category schemas
 */
export const FileTokens = Schema.TaggedStruct("file", contentFields);

/**
 * A count of a response part that carries a payload that is not text.
 *
 * @see {@link FileTokens} for the schema the datum is read by.
 * @category models
 */
export type FileTokens = Schema.Schema.Type<typeof FileTokens>;

/**
 * The union a count of one part is recorded as.
 *
 * **When to use**
 *
 * Use to read a recorded count without knowing which kind of part it was taken
 * for, which is what a metric's output does with it, or to type a count a
 * function takes of one part.
 *
 * **Details**
 *
 * Each member is the count of one kind of part, tagged by that kind: `"prompt"`
 * for a prompt part, and the `type` of the response part for a response one —
 * `"text"`, `"reasoning"`, `"tool-call"`, `"tool-result"` and `"file"`. A reader
 * therefore branches on the tag rather than on the fields a datum happens to
 * hold. A kind of response part that carries no content — the source of a
 * response, its metadata, its finish, the approval of a call — has no member,
 * because no count is taken from one.
 *
 * A prompt part is one member whatever its messages carry, and the response kinds
 * are one member each, because a prompt holds many messages at once while a
 * response part is one message part.
 *
 * **Example** (Reading the count of a prompt and of the text of a response)
 *
 * ```ts import.meta.vitest
 * import { Tokens } from "@trajs/extension-tokenize"
 *
 * const prompt = Tokens.PromptTokens.make({
 *   text: 3,
 *   reasoning: 0,
 *   toolCall: 0,
 *   toolResult: 0,
 *   media: 0,
 *   tokens: 3
 * })
 *
 * const text = Tokens.TextTokens.make({ tokens: 2, mediaTokens: 0 })
 *
 * prompt._tag // => "prompt"
 * text._tag // => "text"
 * ```
 *
 * @see {@link PromptTokens}, {@link TextTokens}, {@link ReasoningTokens},
 * {@link ToolCallTokens}, {@link ToolResultTokens} and {@link FileTokens} for the
 * members' shapes.
 * @see {@link Metrics} for the output the union is a field of.
 * @category schemas
 */
export const TokenCount = Schema.Union([
  PromptTokens,
  TextTokens,
  ReasoningTokens,
  ToolCallTokens,
  ToolResultTokens,
  FileTokens,
]);

/**
 * A count of one trajectory part, whichever kind of part it was taken for.
 *
 * @see {@link TokenCount} for the schema the datum is read by.
 * @category models
 */
export type TokenCount = Schema.Schema.Type<typeof TokenCount>;
