/**
 * A `@trajs/core` recording read as the messages a chat completions API of an
 * OpenAI-compatible client takes.
 *
 * `Codec.makeOpenAiCompat` reads a recording as one conversation per session — the
 * messages each session was given and answered, with what it inherited from the
 * session it continues from — stated the way that API takes them. It is re-exported
 * as a namespace, and is also available as the subpath import
 * `@trajs/extension-openai-compat/Codec`.
 */
export * as Codec from "./Codec.ts";
