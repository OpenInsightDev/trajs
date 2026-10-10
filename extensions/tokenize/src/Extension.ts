/**
 * The estimated token count of a trajectory part, as extension data.
 *
 * A recording holds the parts a session ran on, but not what they cost: a count
 * is a property of the model that will read them rather than of the recording,
 * and the parts a model produced carry no count of their own — the only usage
 * Effect AI reports is the whole-request figure of a `finish` part. This module
 * defines the `org.js.tra.tokenize` extension, whose data is the {@link Estimate}
 * of one part, so a recording can state what each of its parts is worth without
 * the tokenizer that produced the number. The package entry re-exports this module
 * directly, so what it declares is what the package offers.
 *
 * An estimate is anchored to the part it was computed for by the extension part's
 * `attach`, so the datum carries only what the part cannot: how many tokens it is
 * worth, under which encoding, how much of that count a rule on a payload that is
 * not text priced, and which family priced it when one was named. {@link of}
 * estimates one part; {@link annotate} annotates a recording for the message-part
 * kinds the caller names.
 *
 * The datum's shape is versioned the way any extension's is. `0.1.0` is written
 * out as the oldest version of the line and `0.1.1` is derived from it once, with
 * `Extension.upgrade` of `@trajs/core`; {@link registry} holds the extension as of
 * each version, keyed by the version literal and by `latest`, {@link extension} is
 * the newest one, and {@link Estimate} is the newest shape — taken off the line
 * rather than written again, so extending the line moves it.
 */

import { Effect, Option, Predicate, Schema, Stream } from "effect";
import type { Tool } from "effect/ai";
import { Extension, Extensionkit, Trajectory } from "@trajs/core";
import { type Counted, carriesAnyOf, countedOf, type PartTag } from "#/internal/count.ts";
import { mediaRuleIds, mediaRuleOf, type MediaRuleId } from "#/internal/media.ts";
import type * as Tokenizer from "#/Tokenizer.ts";

/**
 * A kind of message part an estimate can be attached for.
 *
 * **When to use**
 *
 * Use when naming the kinds of message part a recording is annotated for, such as
 * to annotate what the parts that carry an image are worth.
 *
 * **Details**
 *
 * A tag is the `type` of a message part that carries content, which is `text`,
 * `reasoning`, `tool-call`, `tool-result` and `file`. The kinds that carry meta
 * information instead — `tool-approval-request`, `tool-approval-response`,
 * `source`, `response-metadata` and `finish` — hold nothing a tokenizer answers
 * for, so there is no estimate to attach for them. A system message holds its
 * content as text rather than as parts, so it carries `text`.
 *
 * @see {@link AnnotateOptions} for the option that takes them.
 * @category models
 */
export type EstimateTag = PartTag;

/**
 * The data of the extension at version `0.1.0`, the oldest version of its line.
 */
const Estimate010 = Schema.Struct({
  /**
   * Version of the extension's data this datum conforms to.
   */
  version: Schema.Literal("0.1.0"),
  /**
   * Estimated number of tokens the part is worth.
   */
  tokens: Schema.Number,
  /**
   * Name of the encoding the count was taken under.
   */
  encoding: Schema.String,
  /**
   * Family a payload that is not text was priced with, if one was named.
   */
  media: Schema.optional(Schema.Literals(mediaRuleIds)),
});

/**
 * How one part is estimated.
 *
 * **When to use**
 *
 * Use when a part carries a payload that is not text and its count should be the
 * count of the model that will read it.
 *
 * **Details**
 *
 * `media` names the family a payload that is not text is priced with, and is
 * recorded with the estimate. Only a family this package names can be given,
 * because the datum states which one priced the count; a rule of the caller's own
 * is `Count`'s alone, because a recording cannot name it.
 *
 * @see `Count.CountOptions` for the rules and their numbers.
 * @category models
 */
export interface EstimateOptions {
  /** Family a payload that is not text is priced with. */
  readonly media?: MediaRuleId;
}

/**
 * How a recording is annotated.
 *
 * **When to use**
 *
 * Use when a recording should carry estimates for the parts that carry a kind of
 * message part rather than for every part, such as for the parts that carry an
 * image.
 *
 * **Details**
 *
 * `tags` names the kinds of message part an estimate is attached for: a part is
 * annotated when its messages carry one of them, which for a response part means
 * the one part it is. Every part a tokenizer can count is annotated when it is
 * absent.
 *
 * The count is the part's own either way: naming kinds decides which parts are
 * annotated rather than what a count covers, so a recording read later holds one
 * number per part whichever kinds were asked for.
 *
 * @see {@link EstimateTag} for the kinds a call accepts.
 * @category models
 */
export interface AnnotateOptions extends EstimateOptions {
  /** Kinds of message part an estimate is attached for. Defaults to every part. */
  readonly tags?: ReadonlyArray<EstimateTag>;
}

/** The extension at data version `0.1.0`, the oldest version of the line. */
const version010 = Extension.make(
  "org.js.tra.tokenize",
  Extension.Metadata.make({
    name: "Token estimate",
    description: "The estimated token count of a trajectory part, under a named encoding.",
  }),
  Extension.Versions.make(Estimate010),
);

// A version is added by deriving the newest entry once — the fields the version
// changes, and the mapping from a datum of the version before it — then keying it
// in `registry` by its literal and moving `latest` to it. A field the mapping
// cannot fill is optional in the shape, and stands for data that predates the
// version rather than for a default. The tests pin both ends of the change: a
// datum of every earlier version reading as the new one, and a datum the
// constructors write stating the new version.
/**
 * The extension at data version `0.1.1`, derived from `0.1.0`: an estimate that
 * also states how much of its count a rule priced.
 *
 * The number is not in a datum of `0.1.0` and cannot be recovered from one, so
 * the field is optional and its absence means the datum was recorded before this
 * version rather than that no rule priced anything. A datum this version writes
 * states it, `0` included.
 */
const version011 = version010.pipe(
  Extension.upgrade(
    (fields) => ({
      ...fields,
      version: Schema.Literal("0.1.1"),
      mediaTokens: Schema.optional(Schema.Number),
    }),
    { decode: (from) => ({ ...from, version: "0.1.1" }) },
  ),
);

/**
 * The extension as of each version of its data the package defines, keyed by the
 * version literal, with `latest` naming the newest.
 *
 * **When to use**
 *
 * Use when a recording should be read or written at a particular data version
 * rather than at the newest one: to write an older version deliberately, to read
 * a datum in the shape it was recorded in rather than upgraded, or to install the
 * extension a header names.
 *
 * **Details**
 *
 * Each entry is the extension whose data version is its key. Its line reads the
 * data of every version up to that one and writes that version, so an earlier
 * entry neither accepts nor emits data of a later one. `latest` is an alias for
 * the newest entry, so a caller that does not care which version is newest asks
 * for it by name.
 *
 * A version the package does not define is a compile-time error rather than a
 * lookup that falls back, because a recording of it cannot be read by any entry
 * here.
 *
 * **Example** (Installing the extension a header names)
 *
 * ```ts import.meta.vitest
 * import { Extensionkit } from "@trajs/core"
 * import { registry } from "@trajs/extension-tokenize"
 *
 * const extkit = Extensionkit.make(registry["0.1.0"])
 * Object.keys(extkit) // => ["org.js.tra.tokenize"]
 * ```
 *
 * @see {@link extension} for the newest version alone.
 * @category constants
 */
export const registry = {
  "0.1.0": version010,
  "0.1.1": version011,
  latest: version011,
} as const;

/**
 * A version of the extension's data a registry entry can be asked for.
 *
 * **When to use**
 *
 * Use when a function takes the version a recording is read or written at, rather
 * than a particular one.
 *
 * **Details**
 *
 * The literals are the versions {@link registry} holds, plus `"latest"` for the
 * newest of them.
 *
 * @see {@link registry} for the extension at one.
 * @category models
 */
export type Version = keyof typeof registry;

/**
 * The extension at the newest version of its data the package defines.
 *
 * **When to use**
 *
 * Use when a recording is read or written at the newest version, which is the
 * common case: the newest line reads the data of every version before it, and
 * writing it is the only direction a version change goes.
 *
 * @see {@link registry} for an older version of the same extension.
 * @category constants
 */
export const extension = registry.latest;

/**
 * The extensions this package records with, collected into a set.
 *
 * **When to use**
 *
 * Use as the extensions a trajectory is recorded or read with, such as through
 * `Extensionkit.extkits` or as the `extkit` of a trajectory.
 *
 * **Details**
 *
 * The set holds the newest version of the extension, so a recording it writes is
 * read back by it whatever version its data was recorded at.
 *
 * @see {@link registry} for the extension at another version.
 * @category constants
 */
export const extensions = Extensionkit.make(extension);

/**
 * The estimate at the newest version of the extension's data.
 *
 * **When to use**
 *
 * Use when building the datum an estimate carries, or when reading a datum that was
 * recorded at the newest version. A recording may hold a datum of an older
 * version, so read one through the extension's line — {@link registry}, or
 * {@link extension} for the newest — rather than with this shape alone.
 *
 * **Details**
 *
 * The datum describes the estimate rather than the part it is about: the part is
 * named by the extension part's `attach`, so restating its kind or its content
 * here would be a second copy that can disagree with the first.
 *
 * - `tokens` is the estimated count of the whole part. It is an estimate and not
 *   the usage a provider reported: exact usage is whole-request data that belongs
 *   to a `finish` response part, and is not recorded here.
 * - `encoding` is the name of the encoding the count was taken under, without
 *   which the number means nothing.
 * - `media` is the family that priced a payload that is not text, and is absent
 *   when no family was named, in which case `Count`'s 85 and 100 token placeholder
 *   priced any such payload. A count a rule changed can therefore be told from one
 *   it did not.
 * - `mediaTokens` is how many of `tokens` such a rule priced, and is `0` when
 *   nothing was. It is the part of the count that is neither text nor exact, so a
 *   reader can see what a count rests on. A datum recorded at `0.1.0` does not
 *   state it, and its absence means that rather than zero.
 *
 * The shape is the newest version's own, read off the line rather than written
 * again, so deriving a version moves it: the datum an estimate carries becomes the
 * newer one, and a datum recorded at an older version still reads as it.
 *
 * @see {@link registry} for the extension at each version of its data.
 * @see {@link of} for recording one.
 * @category schemas
 */
export const Estimate = extension.version.self;

/**
 * An estimate as recorded by the `org.js.tra.tokenize` extension, at the newest
 * version of its data.
 *
 * @see {@link registry} for a datum read at an earlier version.
 * @category models
 */
export type Estimate = Schema.Schema.Type<typeof Estimate>;

/**
 * Estimates one part and returns the extension part carrying the estimate.
 *
 * **When to use**
 *
 * Use when what one part is worth is recorded as it is produced, such as while a
 * session is being recorded, or to annotate a single part of a recording.
 *
 * **Details**
 *
 * The part is counted by the same walk `Count` counts it with, so a text or
 * reasoning part is the text it holds and the role of every message of a prompt
 * part is counted before that message's content; the datum states the count and
 * how much of it a rule on a payload that is not text priced. The returned part is
 * anchored to the given part's `uuid`, so the count stays with the part it counts
 * wherever the part is read.
 *
 * A text holding a special token the tokenizer does not allow fails with
 * {@link Tokenizer.DisallowedSpecialToken}, as `Count` fails.
 *
 * **Example** (Recording what a prompt is worth)
 *
 * ```ts import.meta.vitest
 * import { Effect, Option } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Trajectory } from "@trajs/core"
 * import { of, Tokenizer } from "@trajs/extension-tokenize"
 *
 * const program = Effect.gen(function* () {
 *   const tokenizer = yield* Tokenizer.Tokenizer
 *   const part = Trajectory.promptPart(Prompt.make("Hello"))
 *   const estimate = yield* of(part, tokenizer)
 *
 *   return Option.getOrThrow(estimate.attach)
 * })
 * ```
 *
 * @see {@link annotate} for annotating a whole recording.
 * @category constructors
 */
export const of = (
  part: Trajectory.PromptPart | Trajectory.AnyResponsePart,
  tokenizer: Tokenizer.Service,
  options?: EstimateOptions,
): Effect.Effect<Trajectory.AnyExtensionPart, Tokenizer.DisallowedSpecialToken> =>
  Effect.map(countedOf(part, tokenizer, mediaRuleOf(options?.media)), (counted) =>
    Trajectory.AnyExtensionPart.make({
      extension: { extension: extension.id, data: datum(counted, tokenizer, options) },
      attach: Option.some([part.uuid]),
    }),
  );

/**
 * Annotates a recording's parts with estimates of what they are worth.
 *
 * **When to use**
 *
 * Use when a recording should carry what each of its parts costs, so the counts
 * can be summed, compared or read back without the tokenizer, such as to see
 * which turn of a session dominates it or whether it fits a context window. Name
 * kinds of message part with `tags` to annotate the parts that carry those kinds
 * alone.
 *
 * **Details**
 *
 * An estimate is emitted directly after every part whose messages carry a message
 * part of a kind `tags` names, and is anchored to it. The count is the part's own
 * either way, because what the kinds decide is which parts are annotated rather
 * than what a count covers. Every part a tokenizer can count is annotated when no
 * kind is named, and a part whose messages carry none of the named kinds — or that
 * is of a kind no tokenizer can count — is carried over unchanged.
 *
 * The toolkit, the metadata and the extension kit travel with the returned
 * trajectory, its kit extended with this extension, so the estimates it writes
 * decode with it.
 *
 * A text holding a special token the tokenizer does not allow fails the whole
 * stream with {@link Tokenizer.DisallowedSpecialToken}, as `Count` fails, after
 * the parts before it have been emitted.
 *
 * **Example** (Annotating the parts of a recording that carry text)
 *
 * ```ts import.meta.vitest
 * import { Effect, Stream } from "effect"
 * import { Prompt } from "effect/ai"
 * import { Trajectory } from "@trajs/core"
 * import { annotate, Tokenizer } from "@trajs/extension-tokenize"
 *
 * const trajectory = Trajectory.make(Stream.make(Trajectory.promptPart(Prompt.make("Hello"))))
 *
 * const program = Effect.gen(function* () {
 *   const tokenizer = yield* Tokenizer.Tokenizer
 *   const annotated = annotate(trajectory, tokenizer, { tags: ["text"] })
 *
 *   return yield* Stream.runCollect(annotated)
 * })
 * ```
 *
 * @see {@link of} for estimating one part.
 * @see {@link EstimateTag} for the kinds a call accepts.
 * @category combinators
 */
export const annotate = <
  Tools extends Record<string, Tool.Any>,
  Exts extends Record<string, Extension.Any>,
  E,
  R,
>(
  trajectory: Trajectory.Trajectory<Tools, Exts, E, R>,
  tokenizer: Tokenizer.Service,
  options?: AnnotateOptions,
) => {
  const tags = options?.tags;

  const carries = (part: Trajectory.PromptPart | Trajectory.AnyResponsePart): boolean =>
    tags === undefined || carriesAnyOf(part, tags);

  const estimated = <Part extends Trajectory.PromptPart | Trajectory.AnyResponsePart>(part: Part) =>
    Stream.unwrap(
      Effect.map(of(part, tokenizer, options), (estimate) => Stream.make(part, estimate)),
    );

  const parts = trajectory.pipe(
    Stream.flatMap((recorded) => {
      if (Predicate.isTagged("Prompt")(recorded) && carries(recorded)) return estimated(recorded);

      if (Predicate.isTagged("Response")(recorded) && carries(recorded)) return estimated(recorded);

      return Stream.make(recorded);
    }),
  );

  return Object.assign(parts, {
    toolkit: trajectory.toolkit,
    metadata: trajectory.metadata,
    extkit: Extensionkit.merge(trajectory.extkit, extensions),
  });
};

/**
 * The family is left out rather than set to `undefined`, so a recorded datum has
 * no key for it unless one was named.
 */
const datum = (
  counted: Counted,
  tokenizer: Tokenizer.Service,
  options?: EstimateOptions,
): Estimate => {
  const described = Estimate.make({
    version: Estimate.fields.version.literal,
    tokens: counted.tokens,
    encoding: tokenizer.encodingName,
    mediaTokens: counted.mediaTokens,
  });

  return options?.media === undefined
    ? described
    : Estimate.make({ ...described, media: options.media });
};
