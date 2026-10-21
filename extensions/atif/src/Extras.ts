/**
 * The fields ATIF states of a document and of its steps that a trajectory holds no
 * place for, carried as extra data.
 *
 * ATIF states more of a run than a trajectory holds: the version of the format, the
 * agent that ran, the ordinal of a step and the model that answered it, the tokens
 * and the cost of a step and of the run, and the `extra` a producer writes at any
 * level. A trajectory holds the parts a session ran on and what a kit derived of
 * them, so those fields are carried as extra data: {@link documentExtra} for what a
 * document states of the run itself, which a session part holds, and {@link stepExtra}
 * for what a step states beyond what it says, which the prompt or response part of the
 * step holds. {@link extrakit} collects them into the kit a trajectory is written and
 * read with, so a document another program wrote is read back with its fields typed,
 * and a trajectory this package read states them again where it is written as ATIF.
 *
 * What a trajectory does have a place for is not carried here. A step's moment is the
 * `timestamp` of the part it belongs to; the tools an agent was given are the toolkit
 * the trajectory was read with, which the header of a trajectory names.
 */

import { Extra, ExtraKit, VersionedSchema } from "@trajs/core";
import { Schema } from "effect";

import { packageName } from "#/internal/package.ts";

import { FinalMetrics, Metrics, ProducerFields, SchemaVersion } from "./Document.ts";

/**
 * The fields ATIF states of a step, at data version `1.8`, the oldest and only version
 * of its shape.
 *
 * A version is added by deriving this shape once, as `VersionedSchema.upgrade` of
 * `@trajs/core` does.
 */
const step180 = Schema.Struct({
  /**
   * Version of the format this datum is stated against.
   */
  version: Schema.Literal("1.8"),
  /**
   * The ordinal ATIF numbers the steps of a document from `1` with.
   */
  step_id: Schema.Int,
  /**
   * The model that answered the step, where the document names one.
   */
  model_name: Schema.optional(Schema.NullOr(Schema.String)),
  /**
   * How much effort the step took: a qualitative name, or a numeric score.
   */
  reasoning_effort: Schema.Union([Schema.String, Schema.Number]).pipe(
    Schema.NullOr,
    Schema.optional,
  ),
  /**
   * How many inferences the step stands for, where the producer tracked it.
   */
  llm_call_count: Schema.optional(Schema.NullOr(Schema.Int)),
  /**
   * The tokens, the cost and the confidence data of the step.
   */
  metrics: Schema.optional(Schema.NullOr(Metrics)),
  /**
   * What the producer states of the step beyond the format.
   */
  extra: Schema.optional(ProducerFields),
}).pipe(VersionedSchema.make);

/**
 * The fields ATIF states of a document, at data version `1.8`, the oldest and only
 * version of its shape.
 */
const document180 = Schema.Struct({
  /**
   * Version of the format this datum is stated against.
   */
  version: Schema.Literal("1.8"),
  /**
   * The version of ATIF the document conforms to.
   */
  schema_version: SchemaVersion,
  /**
   * The identity of the document among the ones of its run, where it states one.
   */
  trajectory_id: Schema.optional(Schema.NullOr(Schema.String)),
  /**
   * The agent that ran, as the document identifies it. Its tools are the toolkit of
   * the trajectory rather than stated here.
   */
  agent: Schema.Struct({
    name: Schema.String,
    version: Schema.String,
    model_name: Schema.optional(Schema.NullOr(Schema.String)),
    extra: Schema.optional(ProducerFields),
  }),
  /**
   * What the producer wrote of the run itself, rather than of its conversation.
   */
  notes: Schema.optional(Schema.NullOr(Schema.String)),
  /**
   * The tokens and the cost of the run as a whole, where the document states them.
   */
  final_metrics: Schema.optional(Schema.NullOr(FinalMetrics)),
  /**
   * What the producer states of the document beyond the format.
   */
  extra: Schema.optional(ProducerFields),
}).pipe(VersionedSchema.make);

/**
 * The fields ATIF states of a document, which the session part of a trajectory holds.
 *
 * **When to use**
 *
 * Use as an entry of the kit a trajectory is written or read with — {@link extrakit}
 * — or to read the metadata of the extra data and the tag it is held under.
 *
 * **Details**
 *
 * `package` is the `name` of this package as `package.json` states it —
 * {@link packageName} — and `id` names the extra data within the package, so the tag a
 * document's fields are held under is the package's own name followed by `Document`.
 * The schema is stated for a session part, since a document states one run and a
 * trajectory holds it in the session its parts were produced in.
 *
 * @see {@link extrakit} for the kit the extra data is an entry of.
 * @see {@link DocumentFields} for the shape of one document's fields.
 * @category constants
 */
export const documentExtra = new Extra.Extra({
  package: packageName,
  id: "Document",
  name: "Document fields",
  description: "The fields ATIF states of a document beyond its steps.",
  session: document180,
});

/**
 * The fields ATIF states of a step, which the prompt or response part of the step
 * holds.
 *
 * **When to use**
 *
 * Use as an entry of the kit a trajectory is written or read with — {@link extrakit}
 * — or to read the metadata of the extra data and the tag it is held under.
 *
 * **Details**
 *
 * The tag a step's fields are held under is the package's own name followed by `Step`.
 * The schema is stated for a prompt part and for a response part, since a step states a
 * message through the prompt part of its turn and answers it through the response part;
 * the fields a step of one source does not state are absent rather than defaulted.
 *
 * @see {@link extrakit} for the kit the extra data is an entry of.
 * @see {@link StepFields} for the shape of one step's fields.
 * @category constants
 */
export const stepExtra = new Extra.Extra({
  package: packageName,
  id: "Step",
  name: "Step fields",
  description: "The fields ATIF states of a step beyond what it says.",
  prompt: step180,
  response: step180,
});

/**
 * The fields of a document at the newest version of their shape.
 *
 * ATIF RFC 0001 v1.8, Section II "Root-Level Metadata" and "AgentSchema".
 *
 * **When to use**
 *
 * Use when building the datum the extra data of a session part carries, or when
 * reading one that was produced at the newest version. A trajectory may hold a datum
 * of an older version, so read one through the extra data's schema —
 * {@link documentExtra} — rather than with this shape alone.
 *
 * **Details**
 *
 * - `schema_version` is the version of ATIF the document conforms to.
 * - `trajectory_id` is the identity of the document among the ones of its run; the run
 *   identity ATIF calls `session_id` names the session of the trajectory itself.
 * - `agent` identifies the agent that ran — its `name`, its `version` and the
 *   `model_name` it ran on by default.
 * - `notes`, `final_metrics` and `extra` are what the document states beyond its steps.
 *
 * @see {@link documentExtra} for the extra data the shape is declared by.
 * @category schemas
 */
export const DocumentFields = document180.self;

/**
 * A document's fields as the package carries them, at the newest version of their
 * shape.
 *
 * @see {@link documentExtra} for the extra data the datum belongs to.
 * @category models
 */
export type DocumentFields = Schema.Schema.Type<typeof DocumentFields>;

/**
 * The fields of a step at the newest version of their shape.
 *
 * ATIF RFC 0001 v1.8, Section II "StepObject" and "MetricsSchema".
 *
 * **When to use**
 *
 * Use when building the datum the extra data of a prompt or response part carries, or
 * when reading one that was produced at the newest version.
 *
 * **Details**
 *
 * - `step_id` is the ordinal ATIF numbers the steps of a document from `1` with, which
 *   a trajectory holds no field of its own for.
 * - `model_name` and `reasoning_effort` are what the step was answered with and how much
 *   effort it took — a qualitative name or a numeric score.
 * - `llm_call_count` is how many inferences the step stands for: one, more where the
 *   producer could not split the calls of an opaque tool, or `0` for a deterministic
 *   dispatch that called tools without an inference.
 * - `metrics` is the tokens, the cost and the confidence data of the step, and `extra`
 *   what the producer states beyond the format.
 *
 * The moment of the step is not among them: it times the part the fields hang on.
 *
 * @see {@link stepExtra} for the extra data the shape is declared by.
 * @category schemas
 */
export const StepFields = step180.self;

/**
 * A step's fields as the package carries them, at the newest version of their shape.
 *
 * @see {@link stepExtra} for the extra data the datum belongs to.
 * @category models
 */
export type StepFields = Schema.Schema.Type<typeof StepFields>;

/**
 * The extra data this package carries, collected into a kit.
 *
 * **When to use**
 *
 * Use as the extra data of the kit a trajectory is written or read with — the
 * `extrakit` of the run that produces it — so that the fields ATIF states of a document
 * are read back with their types, and a run read by this package states those fields
 * again where it is written as ATIF.
 *
 * **Details**
 *
 * The kit is an `ExtraKit.Kit` of every kind of extra data this package declares, each
 * held under the tag it is produced under — {@link documentExtra} for a session part
 * and {@link stepExtra} for a prompt or response part. It is extended rather than
 * replaced when other packages' extra data is produced with the same trajectory, and
 * it is what a reader installs to get those fields back with their types.
 *
 * @see {@link documentExtra} for the extra data of a session part.
 * @see {@link stepExtra} for the extra data of a prompt or response part.
 * @category constants
 */
export const extrakit = ExtraKit.make(stepExtra, documentExtra);
