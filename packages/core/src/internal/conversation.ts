import { Effect, Stream } from "effect";
import type { Prompt, Tool } from "effect/ai";
import type * as Extension from "#/Extension.ts";
import type * as Trajectory from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";
import * as View from "#/View.ts";

const groupBySession = <Tools extends Record<string, Tool.Any>>(
  parts: ReadonlyArray<Trajectory.Part<Tools, Record<string, Extension.Any>>>,
): Map<string, Trajectory.Part<Tools, Record<string, Extension.Any>>[]> => {
  const sessions = new Map<string, Trajectory.Part<Tools, Record<string, Extension.Any>>[]>();

  for (const part of parts) {
    const id = part.session ?? "";
    const group = sessions.get(id);

    if (group === undefined) {
      sessions.set(id, [part]);
    } else {
      group.push(part);
    }
  }

  return sessions;
};

// A session's messages are folded from its own parts, in the order they were
// recorded: each prompt contributes the messages the model was given and the
// responses that follow it contribute what the model returned.
const sessionMessages = <Tools extends Record<string, Tool.Any>>(
  parts: ReadonlyArray<Trajectory.Part<Tools, Record<string, Extension.Any>>>,
): Effect.Effect<ReadonlyArray<Prompt.Message>, TrajectoryError> =>
  View.prompt(Stream.fromIterable(parts)).pipe(Effect.map((prompt) => prompt.content));

/**
 * Reads a trajectory as the provider-neutral messages of each of its sessions.
 *
 * The parts are grouped by the `session` they carry and each group is folded
 * with {@link View.prompt}, so a prompt part contributes the messages the model
 * was given and the response parts that follow it contribute the messages it
 * returned. Parts that carry no `session` are grouped under the empty string,
 * and session and extension parts are skipped.
 *
 * Both provider exports of `Codec` read their input through this fold and then
 * write the messages in the request shape of one provider, so the grouping and
 * folding are held here rather than in each provider module.
 */
export const messagesBySession = Effect.fn("Codec.messagesBySession")(function* <
  Tools extends Record<string, Tool.Any>,
  E,
  R,
>(
  trajectory: Trajectory.Trajectory<Tools, Record<string, Extension.Any>, E, R>,
): Effect.fn.Return<Record<string, ReadonlyArray<Prompt.Message>>, E | TrajectoryError, R> {
  const parts = Array.from(yield* Stream.runCollect(trajectory));
  const sessions: Record<string, ReadonlyArray<Prompt.Message>> = {};

  for (const [id, group] of groupBySession(parts)) {
    sessions[id] = yield* sessionMessages(group);
  }

  return sessions;
});
