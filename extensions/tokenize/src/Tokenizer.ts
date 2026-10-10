/**
 * Byte-pair tokenization of text.
 *
 * A tokenizer answers the two questions analysis asks of text: which tokens
 * encode it, and which text a list of tokens decodes to. It is offered as a
 * `Context.Service`, so a program depends on the tokenization it uses and the
 * encoding it was built from stays at the composition root: build one from an
 * encoding the package ships with `layer`, or from your own generated data with
 * `layerFromEncoding`.
 *
 * Encoding is not a pure function of an encoding's data: a text is split into
 * pieces whose byte-pair merges repeat heavily, within one call and across them,
 * so merges are memoized in an Effect `Cache` — bounded, evicting the oldest
 * merge first, and safe to read from several fibers at once. A merge that misses
 * suspends its fiber, which is why no call leaves a match position behind in a
 * shared pattern: a pattern is matched through `matchAll` or through a matcher
 * built for one call, so two fibers may encode at the same time.
 */

import { Cache, Context, Data, Effect, Layer } from "effect";
import type { Encoding } from "#/Encoding.ts";
import { bytePairMerge } from "#/internal/bpe.ts";
import { decodeTokens } from "#/internal/decode.ts";
import { encodingOf, names as shippedEncodings, type Name } from "#/internal/encodings.ts";
import { compile, type Tables } from "#/internal/tables.ts";
import { encodeUtf8, escapeRegex } from "#/internal/text.ts";

/** Merges a tokenizer keeps for reuse when none is asked for. */
const DEFAULT_MERGE_CACHE_CAPACITY = 100000;

/** Texts shorter than this are looked up whole before they are matched. */
const DIRECT_LOOKUP_LENGTH = 10;

/**
 * Name of an encoding the package ships.
 *
 * **When to use**
 *
 * Use when a program names the encoding it tokenizes with, usually because it
 * already knows the model behind a recording.
 *
 * **Details**
 *
 * `cl100k_base` and `o200k_base` are the encodings of OpenAI's GPT-3.5/4 and
 * GPT-4o/5 families, `p50k_base` is the older GPT-3 one, and `claude` is the
 * encoding the Claude models count their prompts with. Each name is the one
 * `{@link Tokenizer}` lists in its `encodingNames`.
 *
 * @see {@link Tokenizer.layer} for the constructor that reads a shipped encoding
 * by name.
 * @category models
 */
export type EncodingName = Name;

/**
 * Which special tokens one `encode` call may and may not read.
 *
 * **When to use**
 *
 * Use when a text is not a model's own input and a marker such as
 * `<|endoftext|>` must be either read as the token it stands for or rejected
 * before the text reaches a model.
 *
 * **Details**
 *
 * `allowedSpecial` names the special tokens the call reads as tokens; `"all"`
 * reads every declared one and skips the check below. Every other text is
 * ordinary, and a pattern splits it like the rest.
 *
 * `disallowedSpecial` rejects the special tokens a text must not contain and
 * defaults to `"all"`, so a text holding a marker the call does not allow fails
 * instead of being silently encoded as ordinary text. `"all"` rejects every
 * declared special token the call does not allow; an explicit list rejects
 * exactly its members. The call fails with {@link DisallowedSpecialToken}.
 *
 * @see {@link Tokenizer} for the `encode` call that reads them.
 * @category models
 */
export interface EncodeOptions {
  /** Special tokens to read as tokens; `"all"` reads every declared one. */
  readonly allowedSpecial?: ReadonlyArray<string> | "all";
  /** Special tokens a text must not contain; `"all"` rejects the rest. */
  readonly disallowedSpecial?: ReadonlyArray<string> | "all";
}

/**
 * How a tokenizer memoizes merges and which special tokens it knows.
 *
 * **Details**
 *
 * `specialTokens` are read beside the ones the encoding declares, which is how a
 * model adds the markers of its own chat template without regenerating a
 * multi-megabyte table. They take part in `encode`'s allowed and disallowed
 * selection exactly like declared ones.
 *
 * @see {@link Tokenizer.layerFromEncoding} for the constructor that reads them.
 * @category models
 */
export interface TokenizerOptions {
  /** Merges kept for reuse, the oldest evicted first. Defaults to 100000. */
  readonly mergeCacheCapacity?: number;
  /** Special tokens to read beside the ones the encoding declares. */
  readonly specialTokens?: Readonly<Record<string, number>>;
}

/**
 * Failure to encode text that holds a special token the call disallowed.
 *
 * @category errors
 */
export class DisallowedSpecialToken extends Data.TaggedError("DisallowedSpecialToken")<{
  /** The disallowed special token that appeared in the text. */
  readonly token: string;
}> {
  override get message(): string {
    return `Text contains disallowed special token: ${this.token}`;
  }
}

/**
 * The tokenization capabilities a tokenizer provides.
 *
 * **Details**
 *
 * `encode` and `count` read special tokens according to the options a call
 * passes; `decode` maps identifiers back to text and ignores the ones no table
 * holds, so a recording from a model with a wider vocabulary still decodes.
 *
 * @see {@link Tokenizer} for the service that provides them.
 * @category models
 */
export interface Service {
  /** Name of the encoding the tokenizer was built from. */
  readonly encodingName: string;
  /** Encodes text into token identifiers. */
  readonly encode: (
    text: string,
    options?: EncodeOptions,
  ) => Effect.Effect<Array<number>, DisallowedSpecialToken>;
  /** Decodes token identifiers back into the text they stand for. */
  readonly decode: (tokens: ReadonlyArray<number>) => Effect.Effect<string>;
  /** Counts the tokens the text encodes to. */
  readonly count: (
    text: string,
    options?: EncodeOptions,
  ) => Effect.Effect<number, DisallowedSpecialToken>;
}

/**
 * Tokenization with the byte-pair encoding of one model.
 *
 * **When to use**
 *
 * Use when a program has to know which tokens a text becomes — to count a
 * prompt, to check what fits a context window, or to read a recording made
 * against the same encoding.
 *
 * **Details**
 *
 * A tokenizer is built with {@link layer} from an encoding the package ships,
 * or with {@link layerFromEncoding} from your own data. Either way the encoding
 * is compiled once and merges are memoized as it encodes. Yield the service to
 * use it:
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
 *   return yield* tokenizer.count("some text input")
 * })
 *
 * const total = await Effect.runPromise(program.pipe(Effect.provide(Tokenizer.Tokenizer.layer("o200k_base"))))
 * ```
 *
 * @see {@link layer} for an encoding the package ships.
 * @see {@link layerFromEncoding} for your own generated data.
 * @category services
 */
export class Tokenizer extends Context.Service<Tokenizer, Service>()(
  "trajs/extension-tokenize/Tokenizer",
) {
  /**
   * The encodings the package ships, as {@link layer} accepts them.
   *
   * @category constructors
   */
  static readonly encodingNames: ReadonlyArray<EncodingName> = shippedEncodings;

  /**
   * Builds a tokenizer from one of the encodings the package ships.
   *
   * **When to use**
   *
   * Use when the model a program counts tokens for is one of the encodings the
   * package ships, which is the common case.
   *
   * **Details**
   *
   * The encoding is kept as the rank source its model publishes, so it is read
   * when the layer is built rather than when the package is imported: building a
   * tokenizer from `cl100k_base` loads and splits that encoding and no other. A
   * read encoding is reused, so a second tokenizer built from the same name pays
   * for it once. Failing to read a source the package ships is a defect, not a
   * failure a program has to handle.
   *
   * ```ts import.meta.vitest
   * const layer = Tokenizer.Tokenizer.layer("o200k_base")
   * ```
   *
   * @see {@link EncodingName} for the names a call accepts, and the service's
   * `encodingNames` for the list of them.
   * @category constructors
   */
  static readonly layer = (
    encoding: EncodingName,
    options?: TokenizerOptions,
  ): Layer.Layer<Tokenizer> => tokenizerLayer(encodingOf(encoding), options);

  /**
   * Builds a tokenizer from one encoding's generated data.
   *
   * **When to use**
   *
   * Use when a program has the generated data of an encoding the package does
   * not ship, such as one of a model that is not part of it.
   *
   * **Details**
   *
   * The encoding is compiled when the layer is built: the piece pattern is
   * compiled, the binary ranks are bucketed by first byte, and the bytes of
   * every special token are precomputed. Merges are then memoized in a `Cache`
   * of `mergeCacheCapacity` entries that evicts the oldest first.
   *
   * The layer has no requirements of its own, so it is provided directly:
   *
   * ```ts import.meta.vitest
   * const layer = Tokenizer.Tokenizer.layerFromEncoding(encoding, { mergeCacheCapacity: 1000 })
   * ```
   *
   * @see {@link Tokenizer.layer} for an encoding the package ships.
   * @see {@link TokenizerOptions} for the capacity and the extra special tokens.
   * @category constructors
   */
  static readonly layerFromEncoding = (
    encoding: Encoding,
    options?: TokenizerOptions,
  ): Layer.Layer<Tokenizer> => tokenizerLayer(Effect.succeed(encoding), options);
}

/**
 * The layer a tokenizer is provided with, over an encoding that is read when the
 * layer is built.
 *
 * The two constructors differ in how the encoding arrives, not in what happens
 * to it: one that is in hand is already there, while a shipped one is read and
 * split into its tables here, once per layer.
 */
const tokenizerLayer = (
  load: Effect.Effect<Encoding>,
  options?: TokenizerOptions,
): Layer.Layer<Tokenizer> =>
  Layer.effect(
    Tokenizer,
    Effect.gen(function* () {
      const encoding = yield* load;
      const tables = compile(encoding, options?.specialTokens);

      const mergeCache = yield* Cache.make<string, ReadonlyArray<number>>({
        capacity: options?.mergeCacheCapacity ?? DEFAULT_MERGE_CACHE_CAPACITY,
        lookup: (piece) => Effect.sync(() => bytePairMerge(encodeUtf8(piece), tables)),
      });

      return tokenizerService(tables, mergeCache);
    }),
  );

/** A special token found in a text, with the offset it begins at. */
interface FoundSpecialToken {
  readonly index: number;
  readonly text: string;
}

/** The service a tokenizer exposes over its compiled tables and merge cache. */
const tokenizerService = (
  tables: Tables,
  mergeCache: Cache.Cache<string, ReadonlyArray<number>>,
): Service => ({
  encodingName: tables.name,
  encode: (text, options) => encodeText(tables, mergeCache, text, options),
  decode: (tokens) => Effect.sync(() => decodeTokens(tokens, tables)),
  count: (text, options) =>
    Effect.map(encodeText(tables, mergeCache, text, options), (tokens) => tokens.length),
});

/**
 * Encodes text, reading or rejecting the special tokens the options name.
 *
 * A text is encoded piece by piece either way; the special tokens only decide
 * where the ordinary runs of a text begin and end, and which of them may be
 * read as the token they stand for.
 */
const encodeText = (
  tables: Tables,
  mergeCache: Cache.Cache<string, ReadonlyArray<number>>,
  text: string,
  options?: EncodeOptions,
): Effect.Effect<Array<number>, DisallowedSpecialToken> =>
  Effect.gen(function* () {
    const allowed = options?.allowedSpecial ?? [];
    const pattern = tables.specialTokenPattern;

    // Reading every special token leaves no marker to single out, so the text is
    // ordinary and the check below is skipped.
    if (pattern === null || allowed === "all") {
      return yield* encodeOrdinary(tables, mergeCache, text);
    }

    const allowedTokens = new Set(allowed);
    const disallowed = options?.disallowedSpecial ?? "all";

    const disallowedTokens = new Set(
      disallowed === "all"
        ? tables.specialTokenTexts.filter((token) => !allowedTokens.has(token))
        : disallowed,
    );

    if (disallowedTokens.size > 0) {
      const found = text.match(new RegExp([...disallowedTokens].map(escapeRegex).join("|"), "g"));

      if (found !== null) {
        return yield* Effect.fail(new DisallowedSpecialToken({ token: found[0] }));
      }
    }

    const tokens: Array<number> = [];
    // A matcher of this call's own: encoding suspends on a merge that missed, so
    // a match position shared between calls would be a race between fibers.
    const matcher = new RegExp(pattern, "g");
    let start = 0;

    while (start < text.length) {
      const next = nextAllowedSpecial(matcher, text, start, allowedTokens);
      const end = next === null ? text.length : next.index;

      yield* encodeOrdinaryInto(tables, mergeCache, text.slice(start, end), tokens);

      if (next === null) break;

      tokens.push(tables.specialTokens[next.text]);
      start = next.index + next.text.length;
    }

    return tokens;
  });

/**
 * Encodes text that holds no special tokens.
 *
 * A short text is often one token, so it is looked up whole before the pattern
 * splits it: a map read answers the most common call without a match or a merge.
 */
const encodeOrdinary = (
  tables: Tables,
  mergeCache: Cache.Cache<string, ReadonlyArray<number>>,
  text: string,
): Effect.Effect<Array<number>> =>
  Effect.gen(function* () {
    if (text.length < DIRECT_LOOKUP_LENGTH) {
      const direct = tables.stringRanks[text];

      if (direct !== undefined) return [direct];
    }

    const tokens: Array<number> = [];

    yield* encodeOrdinaryInto(tables, mergeCache, text, tokens);

    return tokens;
  });

/**
 * Encodes ordinary text, appending its tokens to `tokens`.
 *
 * Every piece is answered by the rank table when one token holds it whole and by
 * the merge cache otherwise, so a piece that repeats pays for a single merge
 * however often it occurs.
 */
const encodeOrdinaryInto = (
  tables: Tables,
  mergeCache: Cache.Cache<string, ReadonlyArray<number>>,
  text: string,
  tokens: Array<number>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (const match of text.matchAll(tables.piecePattern)) {
      const piece = match[0];
      const direct = tables.stringRanks[piece];

      if (direct !== undefined) {
        tokens.push(direct);

        continue;
      }

      const merged = yield* Cache.get(mergeCache, piece);

      for (const token of merged) tokens.push(token);
    }
  });

/**
 * The next special token at or after `start` that the caller allows.
 *
 * Matching advances one character past a match the caller does not allow, so a
 * disallowed match does not hide an allowed token that begins inside it.
 */
const nextAllowedSpecial = (
  matcher: RegExp,
  text: string,
  start: number,
  allowedTokens: ReadonlySet<string>,
): FoundSpecialToken | null => {
  let from = start;

  while (true) {
    matcher.lastIndex = from;

    const match = matcher.exec(text);

    if (match === null) return null;

    if (allowedTokens.has(match[0])) return { index: match.index, text: match[0] };

    from = match.index + 1;
  }
};
