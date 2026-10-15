/**
 * Tokenization with the service `effect/ai` defines, implemented for Anthropic
 * and for OpenAI.
 *
 * Which tokens a prompt becomes is not one function of the prompt: it depends on
 * the provider, the model and the encoding rules that model counts with, so
 * `effect/ai` leaves the counting to a service and this package supplies two
 * implementations of it. {@link layerAnthropic} counts with Anthropic's own
 * tokenizer, and {@link layerOpenAi} counts with `gpt-tokenizer` under the
 * encoding `gpt-tokenizer` gives a model, which is the encoding the OpenAI models
 * of that family count with.
 *
 * The service, its tag and its `make` are `effect/ai`'s, re-exported as they are
 * rather than restated here, so what a program does with a tokenizer is what it
 * would do with any other and what is documented of them is their own. A
 * tokenizer is provided where a program runs:
 *
 * **Example** (Counting the tokens of a text)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Tokenizer } from "@trajs/extension-tokenize"
 *
 * const program = Effect.gen(function* () {
 *   const tokenizer = yield* Tokenizer.Tokenizer
 *
 *   return yield* tokenizer.tokenize("some text input")
 * })
 *
 * const tokens = await Effect.runPromise(
 *   program.pipe(Effect.provide(Tokenizer.layerOpenAi({ model: "gpt-4o" })))
 * )
 * ```
 *
 * Either implementation counts the text a prompt carries — the text of its
 * messages, the name and parameters of a tool call, the identifier and result of
 * a tool result — and not the framing a provider adds around messages, because
 * nothing a recording holds states that framing. `Count` estimates a recorded
 * part the same way, one contribution at a time.
 */

import { getTokenizer } from "@anthropic-ai/tokenizer";
import { Effect, Layer, Predicate } from "effect";
import { AiError, Prompt, Tokenizer as AiTokenizer } from "effect/ai";
import { DEFAULT_ENCODING, modelToEncodingMap } from "gpt-tokenizer/mapping";

export * from "effect/ai/Tokenizer";

/**
 * How an OpenAI tokenizer chooses the encoding it counts with.
 *
 * **When to use**
 *
 * Use when the OpenAI model a recording was made against is known, which is
 * what ties a count to the tokens that model would see.
 *
 * **Details**
 *
 * `model` names the model as OpenAI names it, such as `gpt-4o` or
 * `gpt-3.5-turbo`. `gpt-tokenizer` maps the name to the byte-pair encoding that
 * model counts with and counts a model the catalogue does not list with the
 * encoding of the newest models, `o200k_base`, which is the one it defaults to
 * for a model it does not know.
 *
 * @see {@link layerOpenAi} for the layer the options are given to.
 * @category models
 */
export interface OpenAiOptions {
  /** Name of the model the count is taken for, such as `gpt-4o`. */
  readonly model: string;
}

/**
 * A tokenizer that counts the way Anthropic's models count.
 *
 * **When to use**
 *
 * Use when the tokens a Claude model would see are what a recording should be
 * measured by, such as to check a prompt against a context window or to compare
 * the parts of a recording by size.
 *
 * **Details**
 *
 * The counting is `@anthropic-ai/tokenizer`'s: its tokenizer is built once when
 * the layer is built, over the byte-pair ranks Anthropic publishes, and released
 * when the run that was provided with it ends. A text is normalized before it is
 * encoded, as that package does, so the count is of the tokens Anthropic would
 * count.
 *
 * @see {@link layerOpenAi} for the other implementation.
 * @category layers
 */
export const layerAnthropic: Layer.Layer<AiTokenizer.Tokenizer> = Layer.effect(
  AiTokenizer.Tokenizer,
  Effect.map(
    Effect.acquireRelease(
      Effect.sync(() => getTokenizer()),
      (tokenizer) => Effect.sync(() => tokenizer.free()),
    ),
    (tokenizer) =>
      makeTokenizer("AnthropicTokenizer", (text) =>
        Array.from(tokenizer.encode(text.normalize("NFKC"), "all")),
      ),
  ),
);

/**
 * A tokenizer that counts the way an OpenAI model counts.
 *
 * **When to use**
 *
 * Use when the tokens a model of one OpenAI family would see are what a recording
 * should be measured by, which is why the model is named: two families count the
 * same text into different tokens.
 *
 * **Details**
 *
 * The counting is `gpt-tokenizer`'s, under the encoding that package gives the
 * model: the encoding's ranks are read when the layer is built rather than when
 * the package is imported, so a tokenizer built for `gpt-4o` loads the encoding
 * of that family and no other. A model the package's catalogue does not list is
 * counted with that package's default encoding rather than refused, which is the
 * encoding of the newest models — see {@link OpenAiOptions}.
 *
 * **Example** (Counting for one of the GPT-4o family)
 *
 * ```ts import.meta.vitest
 * const layer = Tokenizer.layerOpenAi({ model: "gpt-4o" })
 * ```
 *
 * @see {@link layerAnthropic} for the other implementation.
 * @see {@link OpenAiOptions} for the model a call accepts.
 * @category layers
 */
export const layerOpenAi = (options: OpenAiOptions): Layer.Layer<AiTokenizer.Tokenizer> =>
  Layer.effect(
    AiTokenizer.Tokenizer,
    Effect.map(
      Effect.promise(() => loadEncoding(encodingOf(options.model))),
      (encoding) => makeTokenizer("OpenAiTokenizer", (text) => encoding.encode(text)),
    ),
  );

/**
 * The `encode` of one of the encodings `gpt-tokenizer` ships, which is all a
 * tokenizer reads of one.
 */
interface GptEncoding {
  readonly encode: (text: string) => Array<number>;
}

/** The encoding every model `gpt-tokenizer` does not list is counted with. */
const encodingsByModel = new Map(Object.entries(modelToEncodingMap));

/** The encoding of a model, or the newest models' own for one not listed. */
const encodingOf = (model: string): string => encodingsByModel.get(model) ?? DEFAULT_ENCODING;

/**
 * Reads one of `gpt-tokenizer`'s encodings by name.
 *
 * The encoding is read when a tokenizer is built rather than when the package is
 * imported, so a tokenizer loads the ranks of the model it counts for and no
 * others: the package ships the ranks of every family, and one of them is
 * megabytes.
 */
const loadEncoding = (encoding: string): Promise<GptEncoding> =>
  import(`gpt-tokenizer/encoding/${encoding}`);

/**
 * The tokenizer one provider's counting makes, as `effect/ai` defines the
 * service.
 *
 * `truncate` is the one `effect/ai` generates from `tokenize`, so an
 * implementation supplies only the counting, and a count that throws is reported
 * as the `AiError` the service fails with.
 */
const makeTokenizer = (
  module: string,
  encode: (text: string) => Array<number>,
): AiTokenizer.Service =>
  AiTokenizer.make({
    tokenize: (prompt) =>
      Effect.try({
        try: () => encode(textOf(prompt)),
        catch: (cause) =>
          new AiError.AiError({
            module,
            method: "tokenize",
            reason: new AiError.UnknownError({
              description: Predicate.isError(cause) ? cause.message : "Could not tokenize",
            }),
          }),
      }),
  });

/** The text a prompt carries, which is what either implementation counts. */
const textOf = (prompt: Prompt.Prompt): string => prompt.content.map(messageText).join("");

/** The text of one message: its content, or the text of the parts it carries. */
const messageText = (message: Prompt.Message): string =>
  message.role === "system" ? message.content : message.content.map(partText).join("");

/**
 * The text of one part of a message.
 *
 * The kinds that carry meta information rather than content — a payload that is
 * not text, and the approval of a tool call — hold nothing a tokenizer answers
 * for, so they contribute no text.
 */
const partText = (part: Prompt.Part): string => {
  switch (part.type) {
    case "text":
    case "reasoning":
      return part.text;
    case "tool-call":
      return part.name + JSON.stringify(part.params);
    case "tool-result":
      return part.id + JSON.stringify(part.result);
    default:
      return "";
  }
};
