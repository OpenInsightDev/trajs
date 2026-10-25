/**
 * The fields ATIF states of a document and of its steps that a trajectory holds no
 * place for, carried as extra data.
 *
 * {@link documentExtra} carries what a document states of the run, and {@link stepExtra}
 * what a step states beyond what it says.
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
 * The fields ATIF states of a document, held by the session part of a trajectory.
 *
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
 * The fields ATIF states of a step, held by the prompt or response part of the step.
 *
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
 * @category schemas
 */
export const DocumentFields = document180.self;

/**
 * A document's fields as the module carries them, at the newest version of their
 * shape.
 *
 * @category models
 */
export type DocumentFields = Schema.Schema.Type<typeof DocumentFields>;

/**
 * The fields of a step at the newest version of their shape.
 *
 * ATIF RFC 0001 v1.8, Section II "StepObject" and "MetricsSchema".
 *
 * @category schemas
 */
export const StepFields = step180.self;

/**
 * A step's fields as the module carries them, at the newest version of their shape.
 *
 * @category models
 */
export type StepFields = Schema.Schema.Type<typeof StepFields>;

/**
 * The extra data this module carries, collected into a kit.
 *
 * @category constants
 */
export const extrakit = ExtraKit.make(stepExtra, documentExtra);
