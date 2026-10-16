/**
 * The metric a recording's parts are counted by, and the producer that derives
 * it.
 *
 * A recording holds the parts a session ran on, but not what they cost: a count
 * is a property of the model that will read them rather than of the recording,
 * and the parts a model produced carry no count of their own — the only usage
 * Effect AI reports is the whole-request figure of a `finish` part. This module
 * declares the `@trajs/extension-tokenize/Estimate` metric, whose output states
 * the {@link Estimate} of one part — the count of that part, and what its session
 * had been worth up to it — so a recording can state what each of its parts is
 * worth without the tokenizer that produced the number, and the
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
 * — the count of that part, and what the session it belongs to was worth up to
 * and including it.
 *
 * A count is more than a number, so the datum holds one: {@link Estimate.count} is
 * a `Tokens.TokenCount`, the union of the shapes a count is stated as, which a
 * reader branches on by its tag. It is a field rather than the output itself
 * because the data a metric's output states has to be a struct with a `version` of
 * its own, and a union is not one. {@link Estimate.total} is the other half:
 * the tokens the session of the part had been worth up to it, so that a recording
 * can be read for what it cost at any point of it without summing what came
 * before.
 *
 * The metric is named by the package that declares it: the `package` of its tag
 * is the `name` of this package, so what a recording states of a count is the
 * package that wrote it rather than a name the package made up. The metric
 * declares two versioned schemas: the {@link Estimate} its producer yields for a
 * part, and the {@link Uncounted} failure of one it could not count. `0.1.0` is
 * written out as the oldest version of each, and is the only version stated so
 * far; {@link tokenEstimate} is the metric, {@link Estimate} and {@link Uncounted}
 * are its shapes — taken off the schemas rather than written again, so a version
 * moves them — and {@link metrickit} is the kit it is an entry of.
 */

import { Metric, VersionedSchema } from "@trajs/core";
import { Effect, Schema, Stream } from "effect";
import { AiError, Tokenizer } from "effect/ai";

import type { PartTag } from "#/internal/count.ts";
import { type MediaRuleId } from "#/internal/media.ts";
import { type Measured, sessions, stepOf } from "#/internal/producer.ts";
import { TokenCount } from "#/Tokens.ts";

import pkg from "../package.json" with { type: "json" };

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
 * count per part whichever kinds were asked for.
 *
 * `media` names the family a payload that is not text is priced with. Only a
 * family this package names can be given, because a rule of the caller's own
 * cannot be named by a recording: what it priced is stated in the count, and a
 * reader would have no way to tell which rule that was.
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
 * The estimate at data version `0.1.0`, the oldest and only version of its shape.
 *
 * A version is added by deriving this shape once, as `VersionedSchema.upgrade` of
 * `@trajs/core` does: a field the version adds is optional in the shape, with its
 * absence meaning the datum predates the version rather than standing for a
 * default.
 */
const estimate010 = Schema.Struct({
  /**
   * Version of the metric's output this datum conforms to.
   */
  version: Schema.Literal("0.1.0"),
  /**
   * What the part is worth: the count of the kind of part it was taken for.
   */
  count: TokenCount,
  /**
   * Tokens the session of the part had been worth up to and including it.
   */
  total: Schema.Number,
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
  output: estimate010,
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
 * - `count` is what the part is worth, as the shape of the kind of part it was
 *   taken for — see `Tokens` for the members of the union and what each of them
 *   states. It is an estimate and not the usage a provider reported: exact usage
 *   is whole-request data that belongs to a `finish` response part, and is not
 *   recorded here.
 * - `total` is the tokens the session of the part had been worth up to and
 *   including it: the sum of what `count` states for every part of that session
 *   the producer counted, this one among them. It is what the session had cost at
 *   the point of this part without summing the parts before it. A part the
 *   producer did not count leaves it unchanged.
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
 * The producer reads the parts in the order the trajectory holds them and carries
 * what a session has been worth from one part to the next, so that every estimate
 * states the session's running total — {@link Estimate.total} — and a tool
 * result states what the call it answers is worth beside it. A part the producer
 * does not count is carried over, leaving that total as it was rather than
 * resetting it.
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
    const step = yield* stepOf(options);

    // What a producer is: a reading of a trajectory for the output the metric
    // states. The step the run was provided with a tokenizer for is read here and
    // closed over, so what a recording is counted under travels with the producer
    // rather than with the kit that runs it. What a session has been worth is
    // carried by the stream rather than by this closure, so a producer run over two
    // recordings counts each of them from its own beginning rather than continuing
    // one into the other.
    const producer: Metric.Producer<typeof tokenEstimate> = (trajectory) =>
      trajectory.pipe(
        Stream.mapAccumEffect(sessions, (state, part) =>
          step(state, part).pipe(
            Effect.mapError((failure) => uncounted(failure.attach, failure.reason)),
            Effect.map(([next, measured]) => [next, measured.map(outputOf)] as const),
          ),
        ),
      );

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
 * The output the metric records for one part, as the producer reports it.
 *
 * The count the step derived is wrapped into the metric's own datum here rather
 * than where it was measured, because the shapes are this module's: what a part is
 * worth is measured in terms of the schemas of `Tokens`, and what a recording
 * holds of it is in terms of the metric's versioned output.
 */
const outputOf = (measured: Measured): Metric.ProducerOutput<typeof tokenEstimate> =>
  Metric.makeOutput<typeof tokenEstimate>(
    Estimate.make({
      version: Estimate.fields.version.literal,
      count: measured.count,
      total: measured.total,
    }),
    { attach: [measured.attach] },
  );

/**
 * The failure of one part that could not be counted, naming the part it is about.
 */
const uncounted = (
  attach: string,
  reason: AiError.AiError,
): Metric.ProducerFailure<typeof tokenEstimate> =>
  Metric.makeFailure<typeof tokenEstimate>(
    Uncounted.make({ version: Uncounted.fields.version.literal, reason }),
    { attach: [attach] },
  );
