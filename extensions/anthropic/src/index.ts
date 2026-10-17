/**
 * A `@trajs/core` trajectory read as the conversations the Anthropic Messages API
 * takes.
 *
 * `Codec.makeAnthropic` reads a trajectory as one conversation per session — the
 * messages each session was given and answered, with what it inherited from the
 * session it continues from — stated the way the API takes them: the instructions of
 * a call apart from the messages of its conversation. It is re-exported as a
 * namespace, and is also available as the subpath import
 * `@trajs/extension-anthropic/Codec`.
 */
export * as Codec from "./Codec.ts";
