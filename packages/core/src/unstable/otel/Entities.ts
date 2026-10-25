/**
 * Entity definitions of the GenAI semantic conventions.
 *
 * An entity is a resource attributes describe once, rather than a signal. Each
 * export states the type of the entity, the attributes that identify it, and the
 * attributes that describe it.
 *
 * @see [the source entity definitions](https://github.com/open-telemetry/semantic-conventions-genai/tree/main/model).
 * @stability experimental
 */

import { Schema } from "effect";

/**
 * An entity definition.
 *
 * @stability experimental
 * @category models
 */
export interface Entity<
  Type extends string,
  Identity extends Schema.Struct.Fields,
  Description extends Schema.Struct.Fields,
> {
  /** The entity type the registry identifies the entity by. */
  readonly type: Type;
  /** Schema for the attributes that identify the entity. */
  readonly identity: Schema.Struct<Identity>;
  /** Schema for the attributes that describe the entity. */
  readonly description: Schema.Struct<Description>;
}

const defineEntity = <
  const Type extends string,
  const Identity extends Schema.Struct.Fields,
  const Description extends Schema.Struct.Fields,
>(
  type: Type,
  identity: Identity,
  description: Description,
): Entity<Type, Identity, Description> => ({
  type,
  identity: Schema.Struct(identity),
  description: Schema.Struct(description),
});

/**
 * A logical top-level GenAI agent in the process.
 *
 * **Details**
 *
 * The entity is emitted only with a stable, provider-assigned identifier. An
 * in-memory or process-local identifier does not identify a main agent.
 *
 * @stability experimental
 * @category models
 */
export const MainAgent = defineEntity(
  "gen_ai.main_agent",
  {
    "gen_ai.main_agent.id": Schema.String,
  },
  {
    "gen_ai.main_agent.name": Schema.optional(Schema.String),
    "gen_ai.main_agent.description": Schema.optional(Schema.String),
  },
);
