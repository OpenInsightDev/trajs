/**
 * The metric a recording's parts are counted by, and the producer that derives
 * it.
 *
 * A recording holds the parts a session ran on, but not what they cost: a count
 * is a property of the model that will read them rather than of the recording,
 * and the parts a model produced carry no count of their own — the only usage
 * Effect AI reports is the whole-request figure of a `finish` part. This module
 * declares the `@trajs/extension-tokenize/Estimate` metric, whose output is the
 * {@link Estimate} of one part, so a recording can state what each of its parts
 * is worth without the tokenizer that produced the number, and the
 * {@link makeProducer} that derives that output. The package entry re-exports
 * this module directly, so what it declares is what the package offers.
 *
 * Deriving the output of a recording is all this package contributes to one: the
 * producer counts the messages a model was given and returned and names the part
 * each count was taken for, and the rest of what a recording needs — recording
 * each count as a metric part of its own, reading one back with the kit it was
 * written with, and what the recording is kept in — belongs to the kit that runs
 * the producer.
 *
 * An estimate is anchored to the part it was computed for: the producer attaches
 * its datum to the part's `uuid`, so the datum carries only what the part cannot
 * — how many tokens it is worth, how much of that count a rule on a payload that
 * is not text priced, and which family priced it when one was named.
 *
 * The metric is named by the package that declares it: the `package` of its tag
 * is the `name` of this package, so what a recording states of a count is the
 * package that wrote it rather than a name the package made up. The shapes it
 * states are versioned the way any metric's are. The metric declares two
 * versioned schemas: the {@link Estimate} its producer yields for a part, and the
 * {@link Uncounted} failure of one it could not count. `0.1.0` is written out as
 * the oldest version of each and `0.1.1` derives the estimate from it once, with
 * `VersionedSchema.upgrade` of `@trajs/core`; {@link tokenEstimate} is the metric
 * that derives the newest of each, {@link Estimate} and {@link Uncounted} are its
 * shapes — taken off the schemas rather than written again, so a version moves
 * them — and {@link metrics} is the kit it is an entry of.
 */

import { Metric, VersionedSchema } from "@trajs/core";
import type { Trajectory } from "@trajs/core";
import { Effect, Predicate, Result, Schema, SchemaGetter, Stream } from "effect";
import { AiError, Tokenizer } from "effect/ai";

import { type Counted, carriesAnyOf, countedOf, type PartTag } from "#/internal/count.ts";
import { mediaRuleIds, mediaRuleOf, type MediaRuleId } from "#/internal/media.ts";
import type { CountedPart } from "#/internal/part.ts";

import pkg from "../package.json" with { type: "json" };

/**
 * A kind of message part a count is taken for.
 *
 * **When to use**
 *
 * Use when naming the kinds of message part a recording is counted for, such as
 * for the parts that carry an image.
 *
 * **Details**
 *
 * A tag is the `type` of a message part that carries content, which is `text`,
 * `reasoning`, `tool-call`, `tool-result` and `file`. The kinds that carry meta
 * information instead — `tool-approval-request`, `tool-approval-response`,
 * `source`, `response-metadata` and `finish` — hold nothing a tokenizer answers
 * for, so no count is taken from them. A system message holds its content as text
 * rather than as parts, so it carries `text`.
 *
 * @see {@link ProducerOptions} for the option that takes them.
 * @category models
 */
export type EstimateTag = PartTag;

/**
 * How the output of the metric is derived from a recording.
 *
 * **When to use**
 *
 * Use when a recording should be counted for the parts that carry a kind of
 * message part rather than for every part of it, such as for the parts that carry
 * an image, or when a payload that is not text is to be priced the way a named
 * family's model prices it.
 *
 * **Details**
 *
 * `tags` names the kinds of message part a datum is derived for: a part is counted
 * when its messages carry one of them, which for a response part means the one
 * part it is. Every part a tokenizer can count is counted when it is absent.
 *
 * The count is the part's own either way: naming kinds decides which parts are
 * counted rather than what a count covers, so a recording read later holds one
 * number per part whichever kinds were asked for.
 *
 * `media` names the family a payload that is not text is priced with, and is
 * recorded with the datum. Only a family this package names can be given, because
 * the datum states which one priced the count; a rule of the caller's own is
 * `Count`'s alone, because a recording cannot name it.
 *
 * @see {@link Count.CountOptions} for the rules and their numbers.
 * @see {@link EstimateTag} for the kinds a call accepts.
 * @category models
 */
export interface ProducerOptions {
  /** Kinds of message part a datum is derived for. Defaults to every part. */
  readonly tags?: ReadonlyArray<EstimateTag>;
  /** Family a payload that is not text is priced with. */
  readonly media?: MediaRuleId;
}

/** The estimate at data version `0.1.0`, the oldest version of its shape. */
const estimate010 = Schema.Struct({
  /**
   * Version of the metric's output this datum conforms to.
   */
  version: Schema.Literal("0.1.0"),
  /**
   * Estimated number of tokens the part is worth.
   */
  tokens: Schema.Number,
  /**
   * Family a payload that is not text was priced with, if one was named.
   */
  media: Schema.optional(Schema.Literals(mediaRuleIds)),
}).pipe(VersionedSchema.make);

/** The uncounted failure at data version `0.1.0`, the only version of its shape. */
const uncounted010 = Schema.Struct({
  /**
   * Version of the metric's failure this datum conforms to.
   */
  version: Schema.Literal("0.1.0"),
  /**
   * The tokenizer's failure that left the part uncounted.
   */
  reason: AiError.AiError,
}).pipe(VersionedSchema.make);

// A version is added by deriving the shape once — the fields the version changes,
// and how a datum of the version before it reads as that one. A field the mapping
// cannot fill is optional in the shape, and stands for data that predates the
// version rather than for a default.
/**
 * The estimate's shape at data version `0.1.1`, derived from `0.1.0`: one that
 * also states how much of its count a rule priced.
 *
 * The number is not in a datum of `0.1.0` and cannot be recovered from one, so
 * the field is optional and its absence means the datum was recorded before this
 * version rather than that no rule priced anything. A datum this version writes
 * states it, `0` included.
 */
const estimate011 = estimate010.pipe(
  VersionedSchema.upgrade(
    (fields) => ({
      ...fields,
      version: Schema.Literal("0.1.1"),
      mediaTokens: Schema.optional(Schema.Number),
    }),
    { decode: SchemaGetter.transform((from) => ({ ...from, version: "0.1.1" as const })) },
  ),
);

/**
 * The metric this package reports: the tokens each part of a recording is
 * estimated to be worth.
 *
 * **When to use**
 *
 * Use as an entry of the kit a recording is written or read with — {@link metrickit}
 * — or to read the metadata of the metric and the tag its output is recorded
 * under.
 *
 * **Details**
 *
 * `package` is the `name` of this package as `package.json` states it, and `id`
 * names the metric within the package, so the tag an estimate is recorded under is
 * the package's own name followed by `Estimate`: what a recording states of a count
 * is the package that wrote it rather than a name the package made up. `metadata`
 * describes the metric itself, and `output` and `failure` are the two shapes it
 * states — what a producer yields of a part, and what it fails with for a part it
 * could not count — each at every version it was written at.
 *
 * @see {@link metrickit} for the kit the metric is an entry of.
 * @see {@link makeProducer} for what derives its output.
 * @category constants
 */
export const tokenEstimate = new Metric.Metric({
  package: pkg.name,
  id: "Estimate",
  metadata: new Metric.Metadata({
    name: "Token estimate",
    description: "The estimated token count of a trajectory part.",
  }),
  output: estimate011,
  failure: uncounted010,
});

/**
 * The estimate at the newest version of the metric's output.
 *
 * **When to use**
 *
 * Use when building the datum an estimate carries, or when reading one that was
 * recorded at the newest version. A recording may hold a datum of an older
 * version, so read one through the metric's schema — {@link tokenEstimate} —
 * rather than with this shape alone.
 *
 * **Details**
 *
 * The datum describes the estimate rather than the part it is about: the part is
 * named by the datum's `attach`, so restating its kind or its content here would
 * be a second copy that can disagree with the first.
 *
 * - `tokens` is the estimated count of the whole part. It is an estimate and not
 *   the usage a provider reported: exact usage is whole-request data that belongs
 *   to a `finish` response part, and is not recorded here.
 * - `media` is the family that priced a payload that is not text, and is absent
 *   when no family was named, in which case `Count`'s 85 and 100 token placeholder
 *   priced any such payload. A count a rule changed can therefore be told from one
 *   it did not.
 * - `mediaTokens` is how many of `tokens` such a rule priced, and is `0` when
 *   nothing was. It is the part of the count that is neither text nor exact, so a
 *   reader can see what a count rests on. A datum recorded at `0.1.0` does not
 *   state it, and its absence means that rather than zero.
 *
 * Which tokenizer took the count is not among them: a tokenizer states no name,
 * and which one a run was provided with is a property of the run rather than of
 * the recording.
 *
 * The shape is the metric's own, read off its schema rather than written again,
 * so deriving a version moves it: the datum an estimate carries becomes the newer
 * one, and a datum recorded at an older version still reads as it.
 *
 * @see {@link tokenEstimate} for the metric the shape is declared by.
 * @category schemas
 */
export const Estimate = tokenEstimate.output.self;

/**
 * An estimate as the package records it, at the newest version of the metric's
 * output.
 *
 * @see {@link tokenEstimate} for the metric the datum belongs to.
 * @category models
 */
export type Estimate = Schema.Schema.Type<typeof Estimate>;

/**
 * The failure at the newest version of the metric's failure schema.
 *
 * **When to use**
 *
 * Use when reading what a recorded run could not count, or when building the
 * failure a producer reports for a part.
 *
 * **Details**
 *
 * The failure describes the part rather than the text it held: the part is named
 * by the failure's `attach`, and `reason` is the `AiError` the tokenizer failed
 * with, which is why no count was derived for it.
 *
 * @see {@link tokenEstimate} for the metric the shape is declared by.
 * @category schemas
 */
export const Uncounted = tokenEstimate.failure.self;

/**
 * A part no count was recorded for, as the package states it, at the newest
 * version of the metric's failure schema.
 *
 * @see {@link tokenEstimate} for the metric the failure belongs to.
 * @category models
 */
export type Uncounted = Schema.Schema.Type<typeof Uncounted>;

/**
 * Builds the producer that derives the metric's output from a recording.
 *
 * **When to use**
 *
 * Use when a recording should carry what each of its parts costs, so the counts
 * can be summed, compared or read back without the tokenizer, such as to see which
 * turn of a session dominates it or whether it fits a context window. Name kinds
 * of message part with `tags` to derive a count for the parts that carry those
 * kinds alone.
 *
 * **Details**
 *
 * The producer is run by the kit the metric is an entry of — the `metrickit` of a
 * run — over the parts of a trajectory, and yields one datum of the metric for
 * every part it counts, naming that part by its `uuid`: the kit records the datum
 * as a metric part of the trajectory, about the part it was counted for. The count
 * is the part's own however the kinds were named: what `tags` decides is which
 * parts are counted rather than what a count covers.
 *
 * The producer is built with a tokenizer: this asks the run it is built in for
 * one, so the tokenizer a recording is counted under is chosen where the producer
 * is built — `Effect.provide` with its layer — and travels with the producer
 * rather than with the kit that runs it. A part the tokenizer cannot count derives
 * no count: the producer fails with {@link Uncounted}, naming that part and
 * carrying the `AiError` the tokenizer failed with. A recording that fails fails
 * the run too, because a producer reads the parts of one.
 *
 * **Example** (Providing the kit with the producer of its metric)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { Metric } from "@trajs/core"
 * import { Tokenizer, makeProducer, metrickit, tokenEstimate } from "@trajs/extension-tokenize"
 *
 * // The tokenizer a recording is counted under is chosen here, where the producer
 * // is built, and the kit that runs it is told nothing of it.
 * const producer = await Effect.runPromise(
 *   makeProducer().pipe(Effect.provide(Tokenizer.layerOpenAi({ model: "gpt-4o" })))
 * )
 *
 * const runnable = Metric.toProducers(metrickit, {
 *   [tokenEstimate.tag]: producer
 * })
 *
 * Object.keys(runnable.producers) // => ["@trajs/extension-tokenize/Estimate"]
 * ```
 *
 * @see {@link metrickit} for the kit the metric is an entry of.
 * @see {@link Count} for counting one part without recording it.
 * @see {@link EstimateTag} for the kinds a call accepts.
 * @category constructors
 */
export const makeProducer = (
  options?: ProducerOptions,
): Effect.Effect<Metric.Producer<typeof tokenEstimate>, never, Tokenizer.Tokenizer> =>
  Effect.gen(function* () {
    const tokenizer = yield* Tokenizer.Tokenizer;

    // What a producer is: a reading of a trajectory for the output the metric
    // states. The tokenizer the run was provided with is read here and closed
    // over, so what a recording is counted under travels with the producer rather
    // than with the kit that runs it.
    const producer: Metric.Producer<typeof tokenEstimate> = (trajectory) =>
      trajectory.pipe(Stream.filterMapEffect((part) => estimateOf(tokenizer, part, options)));

    return producer;
  });

/**
 * The metrics this package reports, collected into a kit.
 *
 * **When to use**
 *
 * Use as the metrics of the kit a recording is written or read with — the
 * `metrickit` of the run that records it — so that the estimates this package
 * derives are recorded as metric parts of the trajectory, and read back by it.
 *
 * **Details**
 *
 * The kit is a `Metrickit` of every metric this package declares, each held under
 * the tag it is recorded under — here {@link tokenEstimate}, the one metric the
 * package reports. It is extended rather than replaced when other packages'
 * metrics are recorded with the same trajectory, and it is what a reader installs
 * to get the estimates back with their types.
 *
 * @see {@link tokenEstimate} for the metric it holds.
 * @see {@link makeProducer} for the producer a kit is provided with.
 * @category constants
 */
export const metrickit = Metric.makeKit(tokenEstimate);

/**
 * Whether a part of a trajectory is one a count is taken from: what a model was
 * given, or what it returned. Every other part of a trajectory — a session
 * declaration, an event, an estimate already derived — holds nothing a tokenizer
 * answers for.
 */
const isCounted = (part: Trajectory.Part<Trajectory.AnyConfig>): part is CountedPart =>
  Predicate.isTagged("Prompt")(part) || Predicate.isTagged("Response")(part);

/**
 * The output one part of a recording is worth, or nothing when it is not a part a
 * call names a kind of.
 *
 * A part a call does not name a kind of — a session declaration, an event, an
 * estimate already derived, or one whose messages carry no named kind — is skipped
 * rather than counted as nothing, so a kit derives a datum for the parts it
 * counted and no others. A response part is one message part itself, so it is
 * counted by the kind it carries rather than by the kinds of a message. A part the
 * tokenizer cannot count fails as {@link Uncounted}, naming that part.
 */
const estimateOf = (
  tokenizer: Tokenizer.Service,
  part: Trajectory.Part<Trajectory.AnyConfig>,
  options?: ProducerOptions,
): Effect.Effect<
  Result.Result<Metric.ProducerOutput<typeof tokenEstimate>, void>,
  Metric.ProducerFailure<typeof tokenEstimate>
> =>
  Effect.gen(function* () {
    if (!isCounted(part)) return Result.failVoid;

    const tags = options?.tags;

    if (tags !== undefined && !carriesAnyOf(part, tags)) return Result.failVoid;

    const counted = yield* countedOf(part, mediaRuleOf(options?.media)).pipe(
      Effect.provideService(Tokenizer.Tokenizer, tokenizer),
      Effect.mapError((error) => uncounted(part, error)),
    );

    return Result.succeed(
      Metric.makeOutput<typeof tokenEstimate>(datum(counted, options?.media), {
        attach: [part.uuid],
      }),
    );
  });

/**
 * The failure of one part that could not be counted, naming the part it is about.
 */
const uncounted = (
  part: CountedPart,
  reason: AiError.AiError,
): Metric.ProducerFailure<typeof tokenEstimate> =>
  Metric.makeFailure<typeof tokenEstimate>(
    Uncounted.make({ version: Uncounted.fields.version.literal, reason }),
    { attach: [part.uuid] },
  );

/**
 * The datum one estimate is, with the family left out rather than set to
 * `undefined`, so a recorded datum has no key for it unless one was named.
 */
const datum = (counted: Counted, media: MediaRuleId | undefined): Estimate => {
  const described = Estimate.make({
    version: Estimate.fields.version.literal,
    tokens: counted.tokens,
    mediaTokens: counted.mediaTokens,
  });

  return media === undefined ? described : Estimate.make({ ...described, media });
};
