/**
 * The tools a document states its agent was given, as the toolkit of a trajectory.
 *
 * A tool is stated by its name, its description and the JSON schema of its arguments,
 * which a dynamic tool is built from.
 */

import { Tool } from "effect/ai";

import type { Document, ToolDefinition } from "#/atif/Document.ts";
import * as Toolkit from "#/Toolkit.ts";

/**
 * The tools a document names, keyed by the name each is called by.
 */
export type Tools = Record<string, Tool.Any>;

/**
 * One tool a document states, as the dynamic tool the document names it by.
 *
 * The arguments are the JSON schema the document states. What the definition states of
 * the tool besides the tool itself is read past.
 */
const toolOf = (definition: ToolDefinition): Tool.Any =>
  Tool.dynamic(definition.function.name, {
    description: definition.function.description ?? undefined,
    parameters: definition.function.parameters,
  });

/**
 * The toolkit a document states its agent was given.
 *
 * A document that states no tool definitions, or none among them, states a toolkit that
 * names no tool.
 */
export const toolkitOf = (document: Document): Toolkit.Toolkit<Tools> =>
  Toolkit.make(...(document.agent.tool_definitions ?? []).map(toolOf));
