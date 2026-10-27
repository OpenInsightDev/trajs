/**
 * ATIF metadata of a run, a step, a call, a result and the media of a part, carried
 * as versioned extras.
 *
 * {@link documentExtra} and {@link stepExtra} declare what a document states of a run
 * and of a step. {@link callExtra}, {@link resultExtra} and {@link mediaExtra} declare
 * what it states of a tool call, of an observation result and of the media a part
 * holds. {@link extrakit} collects every declaration.
 *
 * @stability stable
 */

import { Schema } from "effect";

import * as Extra from "#/Extra.ts";
import * as ExtraKit from "#/ExtraKit.ts";
import { FinalMetrics, Metrics, ProducerFields, SchemaVersion } from "#/unstable/atif/Document.ts";
import { packageName } from "#/unstable/atif/internal/package.ts";
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
 * The fields ATIF states of one tool call, at data version `1.8`.
 */
const call180 = Schema.Struct({
  /** The version of the shape of these fields. */
  version: Schema.Literal("1.8"),
  /** What the producer wrote of the call. */
  extra: Schema.optional(ProducerFields),
}).pipe(VersionedSchema.make);

/**
 * The fields ATIF states of one observation result, at data version `1.8`.
 */
const result180 = Schema.Struct({
  /** The version of the shape of these fields. */
  version: Schema.Literal("1.8"),
  /** The call the result states it answers, where the document states one. */
  source_call_id: Schema.optional(Schema.NullOr(Schema.String)),
  /** What the producer wrote of the result. */
  extra: Schema.optional(ProducerFields),
}).pipe(VersionedSchema.make);

/**
 * The fields ATIF states of the media a part holds, at data version `1.8`.
 */
const media180 = Schema.Struct({
  /** The version of the shape of these fields. */
  version: Schema.Literal("1.8"),
  /** The seconds each recording lasts, by the ordinal of the media in the part. */
  duration: Schema.optional(Schema.Record(Schema.String, Schema.NullOr(Schema.Number))),
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
    /**
     * What each tool definition states besides the tool it names, by that name.
     * A dynamic tool states the description and the parameters alone.
     */
    tool_definitions: Schema.optional(
      Schema.Record(
        Schema.String,
        Schema.Struct({
          type: Schema.String,
          strict: Schema.optional(Schema.NullOr(Schema.Boolean)),
          extra: Schema.optional(ProducerFields),
        }),
      ),
    ),
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
 * Extra declaration for ATIF tool call metadata on response parts.
 *
 * **Details**
 *
 * Each tool call the reading produces is a response part of its own, so the fields
 * of a call are the fields of its part.
 *
 * @see {@link CallFields} for the current payload schema.
 * @see {@link resultExtra} for the fields of the result a call is answered with.
 * @stability stable
 * @category constants
 */
export const callExtra = new Extra.Extra({
  package: packageName,
  id: "Call",
  name: "Call fields",
  description: "The fields ATIF states of a tool call beyond the call itself.",
  response: call180,
});

/**
 * Extra declaration for ATIF observation result metadata on response parts.
 *
 * **Details**
 *
 * Each result the reading produces is a response part of its own, so the fields of a
 * result are the fields of its part.
 *
 * @see {@link ResultFields} for the current payload schema.
 * @see {@link callExtra} for the fields of the call a result answers.
 * @stability stable
 * @category constants
 */
export const resultExtra = new Extra.Extra({
  package: packageName,
  id: "Result",
  name: "Result fields",
  description: "The fields ATIF states of an observation result beyond its content.",
  response: result180,
});

/**
 * Extra declaration for ATIF media metadata on prompt and response parts.
 *
 * **Details**
 *
 * A trajectory part holds the bytes of the media it states and the media type. The
 * seconds a recording lasts belongs to the part rather than to its bytes.
 *
 * @see {@link MediaFields} for the current payload schema.
 * @stability stable
 * @category constants
 */
export const mediaExtra = new Extra.Extra({
  package: packageName,
  id: "Media",
  name: "Media fields",
  description: "The fields ATIF states of the media a part holds beyond its bytes.",
  prompt: media180,
  response: media180,
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
 * Schema for current tool call extras at data version `"1.8"`.
 *
 * @see {@link callExtra} for the versioned declaration.
 * @stability stable
 * @category schemas
 */
export const CallFields = call180.self;

/**
 * Current decoded tool call extras.
 *
 * @see {@link CallFields} for the schema.
 * @stability stable
 * @category models
 */
export type CallFields = Schema.Schema.Type<typeof CallFields>;

/**
 * Schema for current observation result extras at data version `"1.8"`.
 *
 * @see {@link resultExtra} for the versioned declaration.
 * @stability stable
 * @category schemas
 */
export const ResultFields = result180.self;

/**
 * Current decoded observation result extras.
 *
 * @see {@link ResultFields} for the schema.
 * @stability stable
 * @category models
 */
export type ResultFields = Schema.Schema.Type<typeof ResultFields>;

/**
 * Schema for current media extras at data version `"1.8"`.
 *
 * @see {@link mediaExtra} for the versioned declaration.
 * @stability stable
 * @category schemas
 */
export const MediaFields = media180.self;

/**
 * Current decoded media extras.
 *
 * @see {@link MediaFields} for the schema.
 * @stability stable
 * @category models
 */
export type MediaFields = Schema.Schema.Type<typeof MediaFields>;

/**
 * The kit containing every extra declaration of this module.
 *
 * @see {@link documentExtra} for session metadata.
 * @see {@link stepExtra} for prompt and response metadata.
 * @see {@link callExtra} for the fields of a tool call.
 * @see {@link resultExtra} for the fields of an observation result.
 * @see {@link mediaExtra} for the fields of the media a part holds.
 * @stability stable
 * @category constants
 */
export const extrakit = ExtraKit.make(stepExtra, documentExtra, callExtra, resultExtra, mediaExtra);
