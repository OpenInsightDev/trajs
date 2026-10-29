/**
 * Effect toolkits and their stored form.
 *
 * {@link ToolkitSchema} states a toolkit as a stored header holds it, and {@link encode} writes it.
 * The toolkit APIs come from `effect/ai/Toolkit`.
 *
 * @stability stable
 */

import { Schema } from "effect";
import type { Toolkit } from "effect/ai";

import * as Tool from "#/Tool.ts";

/**
 * Re-exports Effect's toolkit APIs without modification.
 *
 * @stability stable
 * @category re-exports
 */
export * from "effect/ai/Toolkit";

/**
 * The toolkit type with no declared tools.
 *
 * @see {@link Toolkit.empty} for the value.
 * @stability stable
 * @category utility types
 */
export type Empty = typeof Toolkit.empty;

/**
 * Schema for stored tool declarations keyed by their toolkit keys.
 *
 * @see {@link Tool.ToolSchema} for each declaration.
 * @stability stable
 * @category schemas
 */
export const ToolkitSchema = Schema.Record(Schema.String, Tool.ToolSchema);

/**
 * Stored tool declarations keyed by their toolkit keys.
 *
 * @see {@link ToolkitSchema} for the schema.
 * @stability stable
 * @category models
 */
export type ToolkitSchema = Schema.Schema.Type<typeof ToolkitSchema>;

/**
 * Converts a toolkit into the stored declarations of its tools.
 *
 * **When to use**
 *
 * Use to describe the tools of a toolkit without their handlers.
 *
 * **Details**
 *
 * Record keys are the keys of the toolkit.
 *
 * @see {@link ToolkitSchema} for the stored declarations.
 * @see {@link Tool.encode} for a single declaration.
 * @stability stable
 * @category encoding
 */
export const encode = (toolkit: Toolkit.Any): ToolkitSchema =>
  Object.fromEntries(Object.entries(toolkit.tools).map(([key, tool]) => [key, Tool.encode(tool)]));
