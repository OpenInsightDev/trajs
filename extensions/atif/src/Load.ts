/**
 * Loads ATIF documents as trajs trajectories.
 *
 * Harbor records an agent's interaction history as an ATIF document, usually
 * `trajectory.json`. Loading one produces a trajectory whose parts carry the
 * document's steps, whose toolkit is rebuilt from the agent's tool definitions
 * and whose extension definitions include this package's, so a system step the
 * document records decodes typed rather than as an unconstrained datum.
 *
 * **Not implemented**
 *
 * The mapping is undecided, because an ATIF step and a trajs part are not the
 * same unit: a step is turn-grained (one LLM call together with its tool calls
 * and observation) while a part is message-grained (a prompt part, plus one
 * response part per returned content part). RFC 0001 and RFC 0002 both track the
 * question as open. Until it is settled, {@link trajectory} fails as a defect
 * rather than committing to a guess.
 */

import type { Trajectory } from "@trajs/core";
import type { TrajectoryError } from "@trajs/core/TrajectoryError";
import { Effect } from "effect";
import type { Schema } from "effect";

/**
 * A parsed ATIF document.
 *
 * **When to use**
 *
 * Use as the input of {@link trajectory}.
 *
 * **Details**
 *
 * The document is the JSON object an ATIF file holds, parsed: its
 * `schema_version`, `agent`, `steps` and the optional fields around them. The
 * shape is not modelled here yet; the loader validates it against the ATIF
 * versions it supports, so callers hand over what a JSON parser produced.
 *
 * @see {@link trajectory} for loading one.
 * @category models
 */
export type Document = Schema.Json;

/**
 * Loads an ATIF document as a trajectory.
 *
 * **When to use**
 *
 * Use when reading a recorded ATIF document, such as Harbor's
 * `agent/trajectory.json`, into the trajs part model.
 *
 * **Details**
 *
 * Not implemented yet: the mapping from a turn-grained step to message-grained
 * parts is undecided, as described in the module documentation. Calling this
 * fails with a defect, so an unimplemented conversion is never mistaken for a
 * conversion that succeeded.
 *
 * @see {@link Document} for the input it accepts.
 * @category constructors
 */
export const trajectory: (
  document: Document,
) => Effect.Effect<Trajectory.Any, TrajectoryError> = () =>
  Effect.die(new Error("Atif.Load.trajectory is not implemented"));
