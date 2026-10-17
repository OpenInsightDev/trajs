/**
 * The tools a document states its agent was given, as the toolkit of a trajectory.
 *
 * ATIF states the tools of the agent that ran — the name each is called by, what it
 * does, and the JSON schema of the arguments it accepts — which is what a dynamic
 * tool is built from, so a document read as a trajectory names the tools it was run
 * with rather than none: {@link toolkitOf} is that reading, and the tools of a
 * document are what {@link Tools} holds.
 */

import { Toolkit } from "@trajs/core";
import { Tool } from "effect/ai";

import type { Document, ToolDefinition } from "#/Document.ts";

/**
 * The tools a document names: what it states of the tool definitions of its agent,
 * keyed by the name each tool is called by.
 *
 * A document names its tools where it is read rather than a program naming them where
 * it is written, so what is known of a tool here is that it is one — not which tool
 * it is, nor the arguments it accepts.
 */
export type Tools = Record<string, Tool.Any>;

/**
 * One tool a document states, as the dynamic tool the document names it by.
 *
 * The arguments of the tool are the JSON schema the document states rather than an
 * Effect Schema of this package: the tool is the document's, so what it accepts is
 * read off the document rather than asserted by a program that reads one. A document
 * that states no schema for the arguments states a tool whose arguments are not
 * known, which is what a dynamic tool left without one is.
 *
 * What the document states of the definition besides the tool itself is read past:
 * `type` names the kind of tool a definition is, which is `"function"` for the tools
 * ATIF states, and `strict` is OpenAI's, so neither says anything of the tool a
 * trajectory names.
 */
const toolOf = (definition: ToolDefinition): Tool.Any =>
  Tool.dynamic(definition.function.name, {
    description: definition.function.description ?? undefined,
    parameters: definition.function.parameters,
  });

/**
 * The toolkit a document states its agent was given.
 *
 * ATIF states the tool definitions of an agent since v1.5, so a document that ran an
 * agent told nothing of its tools states none — and a document that states
 * definitions but no tool among them states a toolkit that names no tool either.
 */
export const toolkitOf = (document: Document): Toolkit.Toolkit<Tools> =>
  Toolkit.make(...(document.agent.tool_definitions ?? []).map(toolOf));
