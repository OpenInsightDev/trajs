/**
 * Counts what the parts of a recording are worth, and the tokens they become
 * under a model's own tokenizer.
 *
 * `Count` takes the count of a recorded part with the tokenizer `effect/ai`
 * defines, and states it as the schema of the kind of part it was taken for — see
 * `Tokens` — so that what a prompt spent on reasoning or on the results of tools
 * is read from the count rather than only what it cost in all. `Tokenizer` holds
 * the two implementations of the service this package supplies: one counts the
 * way Anthropic's models do and one the way an OpenAI model does. The metric this
 * package reports is re-exported directly, because it is what the package
 * contributes to a recording; every other module is re-exported as a namespace.
 * Every module is also available as a subpath import such as
 * `@trajs/extension-tokenize/Tokenizer`.
 */

export * as Count from "./Count.ts";

export * from "./Metrics.ts";

export * as Tokenizer from "./Tokenizer.ts";

export * as Tokens from "./Tokens.ts";
