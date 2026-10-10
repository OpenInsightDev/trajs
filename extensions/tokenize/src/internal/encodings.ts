/**
 * The encodings the package ships, read when a tokenizer is built from one.
 *
 * Each encoding is kept as the rank source its model publishes, which is a few
 * megabytes rather than the tens of megabytes the same vocabulary takes once it
 * is split into lookup tables. Reading one costs a few hundred milliseconds, so
 * no encoding is touched at import: a source is imported the first time a
 * tokenizer is built from it, and the encoding it yields is reused after that.
 */

import { Effect } from "effect";
import type { Encoding } from "#/Encoding.ts";
import { fromRanks, type RankSource } from "#/internal/ranks.ts";

/**
 * The encodings the package ships.
 *
 * **Details**
 *
 * `cl100k_base` and `o200k_base` are the encodings of OpenAI's GPT-3.5/4 and
 * GPT-4o/5 families, `p50k_base` is the older GPT-3 one, and `claude` is the
 * encoding the Claude models and Claude Code count their prompts with.
 */
export const names = ["cl100k_base", "o200k_base", "p50k_base", "claude"] as const;

/** Name of an encoding the package ships. */
export type Name = (typeof names)[number];

/**
 * Reads one shipped encoding's rank source.
 *
 * The imports are dynamic so that a program that never builds a tokenizer from
 * a shipped encoding never loads one, and so that each encoding stays its own
 * chunk: a layer is built from the encoding it names, not from all of them.
 */
const readSource: Record<Name, () => Promise<RankSource>> = {
  cl100k_base: async () => (await import("./encodings/cl100k_base.json")).default,
  o200k_base: async () => (await import("./encodings/o200k_base.json")).default,
  p50k_base: async () => (await import("./encodings/p50k_base.json")).default,
  claude: async () => (await import("./encodings/claude.json")).default,
};

/** Encodings already read, keyed by name, so a second tokenizer reuses one. */
const read = new Map<Name, Promise<Encoding>>();

/**
 * Reads one shipped encoding, once per process.
 *
 * The pending read is memoized rather than its result, so two tokenizers built
 * from one encoding at the same time share a single read. Failing to read a
 * source the package ships is a defect of the package and not of the program, so
 * it dies instead of entering the caller's error channel.
 */
export const encodingOf = (name: Name): Effect.Effect<Encoding> =>
  Effect.promise(() => {
    const pending = read.get(name) ?? readSource[name]().then((source) => fromRanks(name, source));

    read.set(name, pending);

    return pending;
  });
