/**
 * Session conversations converted into model API request messages.
 *
 * Anthropic conversion separates system instructions from conversation messages.
 * OpenAI-compatible conversion emits Chat Completions messages with separate tool-result messages.
 *
 * @stability stable
 */

/**
 * Anthropic Messages API conversation conversion.
 *
 * @stability stable
 * @category re-exports
 */
export * as Anthropic from "#/codec/Anthropic.ts";

/**
 * OpenAI-compatible Chat Completions message conversion.
 *
 * @stability stable
 * @category re-exports
 */
export * as OpenAiCompat from "#/codec/OpenAiCompat.ts";
