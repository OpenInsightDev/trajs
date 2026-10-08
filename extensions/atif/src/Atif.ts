/**
 * Models ATIF system steps as trajs extension data.
 *
 * The Agent Trajectory Interchange Format (ATIF) records a `source: "system"`
 * step for operations the system initiates rather than the user or the model:
 * context compaction, pruning, knowledge injection, subagent delegation,
 * environment resets and checkpoints. Such a step runs no LLM call, so it is not
 * model output, and its payload is not a message either, which leaves it no
 * place in a trajectory's conversation parts.
 *
 * This module defines the `org.js.tra.atif` extension, whose data is a
 * {@link SystemStep}. The step's `message` stays where trajs records messages —
 * a prompt part carrying a system message — and the datum is anchored to that
 * part. What ATIF keeps next to the message, the operation, its
 * `context_management` semantics and its observation, is the datum's payload.
 *
 * Every schema carries an `atifVersion` annotation naming the ATIF specification
 * version whose shape it models, so the mapping from this package to the
 * specification is machine-readable rather than only described in prose. Read it
 * with `Schema.resolveAnnotations`.
 */

import { Extension, Trajectory } from "@trajs/core";
import { Schema } from "effect";

declare module "effect/Schema" {
  namespace Annotations {
    interface Annotations {
      /**
       * ATIF specification version a schema models, as `[major, minor]`.
       *
       * **Details**
       *
       * ATIF labels its versions `ATIF-v1.7`; the tuple carries the two numbers
       * the specification actually uses, so it can be compared with the
       * `schema_version` of an ATIF document.
       */
      readonly atifVersion?: readonly [major: number, minor: number] | undefined;
    }
  }
}

/**
 * How a system step transformed the agent's context window.
 *
 * **When to use**
 *
 * Use when reading or recording the `context_management` convention of an ATIF
 * system step.
 *
 * **Details**
 *
 * Modelled from ATIF-v1.7, which introduced the `context_management` convention.
 *
 * `type` is the kind of transformation: `"compaction"` (prior context
 * compressed into a summary), `"pruning"` (older turns removed) or
 * `"injection"` (external knowledge added to the context). `boundary` says how
 * the transformation affects the context of subsequent steps: `"replace"`
 * (the observation content replaces all prior context), `"append"` (the
 * observation content is added to the existing context) or `"truncate"` (prior
 * context trimmed).
 *
 * Both are open strings rather than literals, because ATIF extends each set
 * with producer-specific values.
 *
 * @see {@link SystemStep} for the step this describes.
 * @category schemas
 */
export const ContextManagement = Schema.Struct({
  /**
   * Kind of context transformation.
   */
  type: Schema.String,
  /**
   * How the transformation applies to the context of subsequent steps.
   */
  boundary: Schema.String,
}).annotate({ atifVersion: [1, 7] });

/**
 * A subagent trajectory a system step delegated to.
 *
 * **When to use**
 *
 * Use when reading or recording the subagent a system step spawned, such as the
 * subagent a context compaction produced a summary through.
 *
 * **Details**
 *
 * Modelled from ATIF-v1.7, whose resolution rules this mirrors. A system step
 * has been able to delegate to a subagent since ATIF-v1.2, but only ATIF-v1.7
 * made a reference resolvable by `trajectory_id` and reduced `session_id` to
 * informational metadata.
 *
 * Mirrors ATIF's `SubagentTrajectoryRef`. `trajectoryId` and `trajectoryPath`
 * are the resolution keys and ATIF requires at least one of them: a subagent
 * embedded in the same recording is named by `trajectoryId`, one stored
 * elsewhere by `trajectoryPath`. `sessionId` is the run identity of the
 * subagent and is informational only — ATIF forbids resolving a reference by
 * `sessionId` alone, because sibling subagents of one run may share it.
 *
 * @category schemas
 */
export const SubagentRef = Schema.Struct({
  /**
   * Canonical identifier of the delegated subagent trajectory.
   */
  trajectoryId: Schema.optional(Schema.String),
  /**
   * Location of the delegated subagent trajectory as an external file.
   */
  trajectoryPath: Schema.optional(Schema.String),
  /**
   * Run identity of the delegated subagent trajectory.
   */
  sessionId: Schema.optional(Schema.String),
}).annotate({ atifVersion: [1, 7] });

/**
 * One result of the observation of a system step.
 *
 * **When to use**
 *
 * Use when reading or recording what a system-initiated operation produced.
 *
 * **Details**
 *
 * Modelled from ATIF-v1.2, which extended observations to the operations a
 * system step initiates.
 *
 * Mirrors ATIF's `ObservationResultSchema`. `content` is the result's text, and
 * may be omitted when the result is a reference to a subagent trajectory whose
 * detail lives in that trajectory. `subagentTrajectoryRef` is an array, as in
 * ATIF, which uses a singleton array for a single subagent.
 *
 * @see {@link Observation} for the results a step produced.
 * @category schemas
 */
export const ObservationResult = Schema.Struct({
  /**
   * Output of the operation.
   */
  content: Schema.optional(Schema.String),
  /**
   * Trajectories the operation delegated to.
   */
  subagentTrajectoryRef: Schema.optional(Schema.Array(SubagentRef)),
}).annotate({ atifVersion: [1, 2] });

/**
 * The results a system step's operation produced.
 *
 * **When to use**
 *
 * Use when reading or recording the environment feedback of a system step.
 *
 * **Details**
 *
 * Modelled from ATIF-v1.2, which extended observations to the operations a
 * system step initiates.
 *
 * Mirrors ATIF's `ObservationSchema`. `results` holds one entry per action the
 * step took; a system step whose results carry no tool call answers no tool
 * call, so the entries have no `source_call_id` to correlate with either.
 *
 * @see {@link ObservationResult} for a single result.
 * @category schemas
 */
export const Observation = Schema.Struct({
  /**
   * Feedback from each action of the step.
   */
  results: Schema.Array(ObservationResult),
}).annotate({ atifVersion: [1, 2] });

/**
 * The data of the `org.js.tra.atif` extension: one ATIF system step.
 *
 * **When to use**
 *
 * Use when recording an operation the system initiated rather than the user or
 * the model, such as a context compaction, a subagent delegation, an
 * environment reset or a checkpoint.
 *
 * **Details**
 *
 * Modelled from ATIF-v1.7: system steps appeared in ATIF-v1.2, and
 * `context_management`, together with the shape modelled here, in ATIF-v1.7.
 *
 * Mirrors ATIF's system `StepObject`: `operation` is the kind of operation, an
 * open string whose standard values are `"context-management"`,
 * `"subagent-delegation"`, `"environment-reset"` and `"checkpoint"`. ATIF
 * enumerates those operations in prose rather than in a field, which is why
 * tracing the kind is this extension's own refinement.
 *
 * The step's `message` is deliberately not repeated here. A message belongs to
 * the conversation, so record it as the prompt part carrying a system message
 * and anchor this datum to that part; a step with no message carries no anchor.
 * ATIF's step-level `extra` is not modelled either — data outside this schema
 * belongs to an extension of its own, anchored to the same part.
 *
 * **Example** (Recording a context compaction)
 *
 * ```ts import.meta.vitest
 * import { Atif } from "@trajs/extension-atif"
 *
 * const step = Atif.SystemStep.make({
 *   operation: "context-management",
 *   contextManagement: { type: "compaction", boundary: "replace" },
 *   observation: { results: [{ content: "Summary: prior conversation..." }] }
 * })
 * step.operation // => "context-management"
 * ```
 *
 * @see {@link part} for recording one in a trajectory.
 * @category schemas
 */
export const SystemStep = Schema.Struct({
  /**
   * Kind of operation the system initiated.
   */
  operation: Schema.String,
  /**
   * How the step transformed the agent's context window.
   */
  contextManagement: Schema.optional(ContextManagement),
  /**
   * Environment feedback the operation produced.
   */
  observation: Schema.optional(Observation),
}).annotate({ atifVersion: [1, 7] });

/**
 * A system step as recorded by the `org.js.tra.atif` extension.
 *
 * @category models
 */
export type SystemStep = Schema.Schema.Type<typeof SystemStep>;

/**
 * The `org.js.tra.atif` extension definition.
 *
 * **When to use**
 *
 * Use when a trajectory should be encoded or decoded with this extension
 * installed, or when reading its data with `Extension.select`.
 *
 * @see {@link extensions} for the definition already collected into a set.
 * @category constants
 */
export const extension = Extension.make("org.js.tra.atif", "1.0.0", SystemStep);

/**
 * The definitions of this package, collected into a set.
 *
 * **When to use**
 *
 * Use as the `extensions` argument of `Trajectory.make` or `Persist.decode`.
 *
 * @category constants
 */
export const extensions = Extension.Extensions.make(extension);

/**
 * Constructs a datum of the `org.js.tra.atif` extension.
 *
 * **When to use**
 *
 * Use when recording a system step in a trajectory, optionally anchored to the
 * prompt part that carries the step's message.
 *
 * **Details**
 *
 * The returned part carries the extension's identifier, so it decodes with
 * {@link extension} installed and degrades to an unconstrained extension part
 * without it.
 *
 * **Example** (Recording an anchored system step)
 *
 * ```ts import.meta.vitest
 * import { Prompt, Toolkit } from "effect/ai"
 * import { Stream } from "effect"
 * import { Trajectory } from "@trajs/core"
 * import { Atif } from "@trajs/extension-atif"
 *
 * const prompt = Trajectory.promptPart(Prompt.make("Context compaction performed"))
 *
 * const trajectory = Trajectory.make(
 *   Stream.make(prompt, Atif.part({ operation: "context-management" }, { anchor: prompt.uuid })),
 *   Toolkit.empty,
 *   Trajectory.Metadata.make({}),
 *   Atif.extensions
 * )
 * ```
 *
 * @see {@link SystemStep} for the data the datum carries.
 * @category constructors
 */
export const part = (
  data: SystemStep,
  options?: Readonly<{ anchor?: string; session?: string }>,
): Trajectory.AnyExtensionPart =>
  Trajectory.anyExtensionPart({
    extension: extension.id,
    data,
    ...(options?.anchor === undefined ? {} : { anchor: options.anchor }),
    ...(options?.session === undefined ? {} : { session: options.session }),
  });
