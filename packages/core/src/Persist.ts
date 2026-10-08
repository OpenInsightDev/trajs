import { Effect } from "effect";
import * as Trajectory from "#/Trajectory.ts";
import type { Tool } from "effect/ai";

export const persist = (path: string) =>
  Effect.fn(function* <Tools extends Record<string, Tool.Any>>(
    trajectory: Trajectory.Trajectory<Tools>,
  ) {
    throw new Error("Not implemented");
  });
