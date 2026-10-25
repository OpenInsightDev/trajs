/**
 * Event definitions of the GenAI semantic conventions.
 *
 * Each export states the name of an event and the attributes it carries. Attributes
 * the registry marks required are struct fields, and the rest are optional.
 *
 * @see [the source event definitions](https://github.com/open-telemetry/semantic-conventions-genai/tree/main/model).
 * @stability experimental
 */

import { Schema } from "effect";

import * as Groups from "#/unstable/otel/internal/groups.ts";
import * as Spans from "#/unstable/otel/Spans.ts";

/**
 * An event definition.
 *
 * @stability experimental
 * @category models
 */
export interface Event<Name extends string, Attributes> {
  /** The event name the registry identifies the event by. */
  readonly name: Name;
  /** Schema for the attributes of the event. */
  readonly attributes: Schema.Schema<Attributes>;
}

const defineEvent = <const Name extends string, Attributes>(
  name: Name,
  attributes: Schema.Schema<Attributes>,
): Event<Name, Attributes> => ({ name, attributes });

/**
 * The details of an inference request, including its conversation and parameters.
 *
 * **Details**
 *
 * The attributes are those of {@link Spans.Inference}, so the event carries the
 * content of the call independently of its span. Instrumentations should record the
 * event at debug severity.
 *
 * @see {@link Spans.Inference} for the attributes the event carries.
 * @stability experimental
 * @category models
 */
export const InferenceOperationDetails = defineEvent(
  "gen_ai.client.inference.operation.details",
  Spans.Inference.attributes,
);

/**
 * The result of evaluating generated output.
 *
 * **Details**
 *
 * The event belongs under the span of the evaluated operation where one exists, or
 * carries `gen_ai.response.id` where it does not.
 *
 * @stability experimental
 * @category models
 */
export const EvaluationResult = defineEvent(
  "gen_ai.evaluation.result",
  Schema.Struct({
    ...Groups.error,
    "gen_ai.evaluation.name": Schema.String,
    "gen_ai.evaluation.score.value": Schema.optional(Schema.Number),
    "gen_ai.evaluation.score.label": Schema.optional(Schema.String),
    "gen_ai.evaluation.explanation": Schema.optional(Schema.String),
    "gen_ai.response.id": Schema.optional(Schema.String),
  }),
);

/**
 * An exception that occurred during a GenAI client operation.
 *
 * **Details**
 *
 * The event covers API errors, rate limits, model errors, timeouts, and other
 * failures. Instrumentations should record it at warn severity.
 *
 * @stability experimental
 * @category models
 */
export const ClientOperationException = defineEvent(
  "gen_ai.client.operation.exception",
  Schema.Struct({
    "exception.type": Schema.optional(Schema.String),
    "exception.message": Schema.optional(Schema.String),
    "exception.stacktrace": Schema.optional(Schema.String),
  }),
);
