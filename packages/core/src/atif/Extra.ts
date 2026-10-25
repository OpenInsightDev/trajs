/**
 * ATIF run and step metadata carried as versioned extras.
 *
 * {@link documentExtra} declares session metadata and {@link stepExtra} declares prompt and response metadata.
 * {@link extrakit} collects both declarations.
 *
 * @stability stable
 */

import { Schema } from "effect";

import { FinalMetrics, Metrics, ProducerFields, SchemaVersion } from "#/atif/Document.ts";
import { packageName } from "#/atif/internal/package.ts";
import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import * as VersionedSchema from "#/VersionedSchema.ts";

/**
 * The fields ATIF states of a step, at data version `1.8`.
 */
const step180 = Schema.Struct({
  /** The version of the shape of these fields. */
  version: Schema.Literal("1.8"),
  /** The ordinal of the step, numbered from `1`. */
  step_id: Schema.Int,
  /** The model that answered the step, where the document names one. */
  model_name: Schema.optional(Schema.NullOr(Schema.String)),
  /** A qualitative name, or a numeric score. */
  reasoning_effort: Schema.Union([Schema.String, Schema.Number]).pipe(
    Schema.NullOr,
    Schema.optional,
  ),
  /** How many inferences the step stands for, where the producer tracked it. */
  llm_call_count: Schema.optional(Schema.NullOr(Schema.Int)),
  /** The tokens, the cost and the confidence data of the step. */
  metrics: Schema.optional(Schema.NullOr(Metrics)),
  extra: Schema.optional(ProducerFields),
}).pipe(VersionedSchema.make);

/**
 * The fields ATIF states of a document, at data version `1.8`.
 */
const document180 = Schema.Struct({
  /** The version of the shape of these fields. */
  version: Schema.Literal("1.8"),
  schema_version: SchemaVersion,
  /** The identity of the document among the ones of its run. */
  trajectory_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** The agent that ran; its tools are the toolkit of the trajectory. */
  agent: Schema.Struct({
    name: Schema.String,
    version: Schema.String,
    model_name: Schema.optional(Schema.NullOr(Schema.String)),
    extra: Schema.optional(ProducerFields),
  }),
  /** What the producer wrote of the run itself. */
  notes: Schema.optional(Schema.NullOr(Schema.String)),
  final_metrics: Schema.optional(Schema.NullOr(FinalMetrics)),
  extra: Schema.optional(ProducerFields),
}).pipe(VersionedSchema.make);

/**
 * Extra declaration for ATIF run metadata on session parts.
 *
 * **Details**
 *
 * Agent identity and run metadata remain here.
 * Agent tool definitions are carried separately as the trajectory's toolkit.
 *
 * @see {@link DocumentFields} for the current payload schema.
 * @see {@link stepExtra} for per-step metadata.
 * @stability stable
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
 * Extra declaration for ATIF metadata on prompt and response parts.
 *
 * **Details**
 *
 * The payload carries the original step id, model settings, metrics, and producer fields.
 * Step timestamps belong to the trajectory part rather than this extra.
 *
 * @see {@link StepFields} for the current payload schema.
 * @see {@link documentExtra} for run metadata.
 * @stability stable
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
 * Schema for current ATIF run extras at data version `"1.8"`.
 *
 * **Gotchas**
 *
 * The data `version` is separate from the source document's `schema_version`.
 * This schema alone does not read historical extra versions.
 *
 * @see {@link documentExtra} for the versioned declaration.
 * @stability stable
 * @category schemas
 */
export const DocumentFields = document180.self;

/**
 * Current decoded ATIF run extras.
 *
 * @see {@link DocumentFields} for the schema.
 * @stability stable
 * @category models
 */
export type DocumentFields = Schema.Schema.Type<typeof DocumentFields>;

/**
 * Schema for current ATIF step extras at data version `"1.8"`.
 *
 * **Gotchas**
 *
 * This schema alone does not read historical extra versions.
 *
 * @see {@link stepExtra} for the versioned declaration.
 * @stability stable
 * @category schemas
 */
export const StepFields = step180.self;

/**
 * Current decoded ATIF step extras.
 *
 * @see {@link StepFields} for the schema.
 * @stability stable
 * @category models
 */
export type StepFields = Schema.Schema.Type<typeof StepFields>;

/**
 * The kit containing ATIF run and step extra declarations.
 *
 * @see {@link documentExtra} for session metadata.
 * @see {@link stepExtra} for prompt and response metadata.
 * @stability stable
 * @category constants
 */
export const extrakit = ExtraKit.make(stepExtra, documentExtra);
