/**
 * A `@trajs/core` trajectory read as the conversations a model API takes.
 *
 * `Anthropic` reads one as the conversations the Anthropic Messages API takes — the
 * instructions of a call apart from the messages of its conversation — and
 * `OpenAiCompat` as the messages a chat completions API of an OpenAI-compatible
 * client takes, with a tool result in a message of its own.
 */
export * as Anthropic from "#/codec/Anthropic.ts";

export * as OpenAiCompat from "#/codec/OpenAiCompat.ts";
