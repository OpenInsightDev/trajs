import { Option, Predicate, Stream } from "effect";
import { Prompt, type Tool } from "effect/ai";
import type * as Extensionkit from "#/Extensionkit.ts";
import { type Part, type PartStream, type PromptTurn } from "#/Trajectory.ts";
import type { TrajectoryError } from "#/TrajectoryError.ts";

/**
 * Groups the parts of a trajectory into turns: a prompt and the response parts
 * produced for it.
 *
 * A `PromptPart` opens a turn, and every `ResponsePart` that follows it until the
 * next prompt is recorded on it. Session parts are skipped, and so are response
 * parts that precede the first prompt, because they belong to no
 * prompt the recording holds. A turn is not attributed to a session, so select
 * the session to read before grouping a recording that interleaves several.
 *
 * A turn is emitted once the next prompt is reached, so only the turn being
 * assembled is held; the last one is emitted when the trajectory ends.
 */
export const promptTurns = <Tools extends Record<string, Tool.Any>, E, R>(
  trajectory: PartStream<Tools, Extensionkit.Any, E, R>,
): Stream.Stream<PromptTurn<Tools>, E | TrajectoryError, R> =>
  // A turn is only known to be over once the next prompt is reached, so the
  // trajectory is closed with a marker that releases the turn still open.
  Stream.concat(
    trajectory.pipe(Stream.map((part) => Option.some(part))),
    Stream.make(Option.none<Part<Tools>>()),
  ).pipe(
    Stream.mapAccum(
      (): Option.Option<PromptTurn<Tools>> => Option.none(),
      (assembling, part) => {
        if (Option.isNone(part)) {
          return [Option.none(), Option.toArray(assembling)] as const;
        }

        const value = part.value;

        if (Predicate.isTagged("Prompt")(value)) {
          const opened: PromptTurn<Tools> = {
            prompt: Prompt.fromMessages(value.messages),
            response: [],
          };

          return [Option.some(opened), Option.toArray(assembling)] as const;
        }

        // Appended in place: a turn holds every response recorded for it, and
        // copying the list on each part would make holding quadratic in its
        // length.
        if (Predicate.isTagged("Response")(value) && Option.isSome(assembling)) {
          assembling.value.response.push(value.response);
        }

        return [assembling, []] as const;
      },
    ),
  );
