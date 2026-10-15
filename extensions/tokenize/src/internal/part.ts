/**
 * The parts of a trajectory this package counts.
 *
 * A count is taken from what a model was given — the messages a prompt part holds
 * — and from what it returned — the one content part a response part carries.
 * Both are read as the parts of the most general trajectory,
 * `Trajectory.AnyConfig`: a recording is counted without knowing the toolkit, the
 * kits or the variant it was recorded with, so a part is read for the content it
 * carries and for nothing else.
 *
 * The aliases below name the three shapes a count reads, so that the rules of
 * `media.ts`, the estimating of `count.ts` and the producer of the metric all
 * speak of the same parts.
 */

import type { Trajectory } from "@trajs/core";

/** A part a count is taken from: what a model was given, or what it returned. */
export type CountedPart = Extract<
  Trajectory.Part<Trajectory.AnyConfig>,
  { readonly _tag: "Prompt" | "Response" }
>;

/**
 * A prompt part of a trajectory, whose messages are the messages a model was
 * given.
 */
export type PromptPart = Extract<CountedPart, { readonly _tag: "Prompt" }>;

/** A response part of a trajectory: one content part a model returned. */
export type ResponsePart = Extract<CountedPart, { readonly _tag: "Response" }>;

/** The content part a response part of a trajectory carries. */
export type ResponseContentPart = ResponsePart["response"];
