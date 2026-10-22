/**
 * The parts of a response that arrived in increments as the whole parts they add
 * up to.
 *
 * A response may be produced as it arrives — the increments of a streamed answer —
 * and read as the parts those increments complete: {@link collapse} is that
 * reading of one part, and {@link foldParts} the reading of a whole trajectory.
 * Either way the folding is the one `View` reads a turn with, so what a reader of
 * a trajectory sees of a streamed answer is the answer itself, however it was
 * produced.
 */

import { Predicate, Stream } from "effect";
import type { Tool } from "effect/ai";

import * as Response from "#/Response.ts";
import * as Trajectory from "#/Trajectory.ts";

interface Chunk {
  text: string;
  metadata: Response.ProviderMetadata;
}

type OpenChunks = Map<string, Map<string, Chunk>>;

/** The chunks of a streamed response that are still open, by session and by chunk. */
export interface State {
  readonly text: OpenChunks;
  readonly reasoning: OpenChunks;
}

/** The state a folding starts from: no chunk open yet. */
export const initial = (): State => ({ text: new Map(), reasoning: new Map() });

const chunksOf = (chunks: OpenChunks, id: string): Map<string, Chunk> => {
  let open = chunks.get(id);

  if (open === undefined) {
    open = new Map();
    chunks.set(id, open);
  }

  return open;
};

const mergeMetadata = (
  left: Response.ProviderMetadata,
  right: Response.ProviderMetadata,
): Response.ProviderMetadata => {
  const merged = { ...left };

  for (const [provider, metadata] of Object.entries(right)) {
    const previous = merged[provider];

    merged[provider] =
      Predicate.isObject(previous) && Predicate.isObject(metadata)
        ? Object.assign({}, previous, metadata)
        : metadata;
  }

  return merged;
};

export const collapse = <Tools extends Record<string, Tool.Any>>(
  state: State,
  id: string,
  part: Response.AllPartsView<Tools>,
): readonly [State, ReadonlyArray<Response.PartView<Tools>>] => {
  switch (part.type) {
    case "text-start":
      chunksOf(state.text, id).set(part.id, { text: "", metadata: part.metadata });

      return [state, []];
    case "text-delta": {
      const chunk = chunksOf(state.text, id).get(part.id);

      if (chunk !== undefined) {
        chunk.text += part.delta;
        chunk.metadata = mergeMetadata(chunk.metadata, part.metadata);
      }

      return [state, []];
    }

    case "text-end": {
      const open = chunksOf(state.text, id);
      const chunk = open.get(part.id);

      if (chunk === undefined) {
        return [state, []];
      }

      open.delete(part.id);

      const text = Response.makePart("text", {
        text: chunk.text,
        metadata: mergeMetadata(chunk.metadata, part.metadata),
      });

      return [state, [text]];
    }

    case "reasoning-start":
      chunksOf(state.reasoning, id).set(part.id, { text: "", metadata: part.metadata });

      return [state, []];
    case "reasoning-delta": {
      const chunk = chunksOf(state.reasoning, id).get(part.id);

      if (chunk !== undefined) {
        chunk.text += part.delta;
        chunk.metadata = mergeMetadata(chunk.metadata, part.metadata);
      }

      return [state, []];
    }

    case "reasoning-end": {
      const open = chunksOf(state.reasoning, id);
      const chunk = open.get(part.id);

      if (chunk === undefined) {
        return [state, []];
      }

      open.delete(part.id);

      const reasoning = Response.makePart("reasoning", {
        text: chunk.text,
        metadata: mergeMetadata(chunk.metadata, part.metadata),
      });

      return [state, [reasoning]];
    }

    case "tool-params-start":
    case "tool-params-delta":
    case "tool-params-end":
    case "error":
      return [state, []];
    default:
      return [state, [part]];
  }
};

/**
 * The config of a trajectory whose response parts are read as whole parts alone.
 *
 * It is the config the trajectory was read with, with `stream` turned off: which
 * increments a response arrived in says nothing about what reads the parts, so
 * every kit of the reading is carried over as it is.
 */
type FoldedConfig<Config extends Trajectory.AnyConfig> = Trajectory.Config<
  false,
  Config["toolkit"],
  Config["eventkit"],
  Config["metrickit"],
  Config["extrakit"]
>;

/**
 * One part of a trajectory, and the whole parts it completes.
 *
 * A part that is not a response is passed on as it is, since a response is the one
 * kind of part that arrives in increments. A response part is read by
 * {@link collapse}, and what it completes is stated as the part it completed it:
 * the part's own fields are kept, and only its response becomes the whole part.
 * The whole part is one a response of either kind of trajectory may hold, so what
 * is returned is still a part of the trajectory that was read.
 */
const foldPart = <Config extends Trajectory.AnyConfig>(
  state: State,
  part: Trajectory.Part<Config>,
): readonly [State, ReadonlyArray<Trajectory.Part<Config>>] => {
  if (part._tag !== "Response") return [state, [part]];

  const [folding, completed] = collapse(
    state,
    part.sessionId ?? Trajectory.mainSessionId,
    part.response,
  );

  return [folding, completed.map((response) => ({ ...part, response }))];
};

/**
 * Reads a trajectory with the increments of its streamed responses folded into the
 * whole parts they complete.
 *
 * **When to use**
 *
 * Use when what reads a part is to read it as it was said rather than as it was
 * produced, since a trajectory is read as the most general one and the parts of it
 * are therefore the increments of a streamed response as well as the whole parts
 * those increments complete — see {@link Trajectory.AnyConfig}. The producers of a
 * metric are the readers this is for: a producer measures the parts a model was
 * given and returned, which are whole. So is a reading of the bytes a trajectory is
 * kept in under a config whose response parts are whole: `internal/exchange.ts`
 * folds them where the config it is given states `stream` off.
 *
 * **Details**
 *
 * The folding is {@link collapse}'s, taken of each part of the trajectory: the
 * increments of a text and of a reasoning are gathered into the whole part their
 * `*-end` increment completes, a part a response carries whole is passed on as it
 * is, and the increments of a tool's parameters and the error of a response are
 * dropped, because no whole part is made of them — a tool call whose parameters
 * are still being written is not yet a call.
 *
 * A folded part is the part its increments completed, and carries that part's own
 * `uuid`, `timestamp` and extra data rather than an identity of its own: what
 * `collapse` gathers is the content of the part, and the `*-end` increment is the
 * part at which the whole of it exists. What attaches to a folded part therefore
 * names a part the trajectory holds, which is the increment the reading of it
 * arrived at.
 *
 * The state of the folding is one per reading rather than shared between them, so
 * a stream read twice folds each of them from its own beginning: an increment
 * completes a whole part only where the trajectory holds the increments before it.
 *
 * @see {@link collapse} for the folding of one part.
 * @category combinators
 */
export const foldParts = <Config extends Trajectory.AnyConfig, E, R>(
  parts: Trajectory.TrajectoryStream<Config, E, R>,
): Trajectory.TrajectoryStream<FoldedConfig<Config>, E, R> => {
  const folded = parts.pipe(
    Stream.mapAccum(initial, (state, part) => foldPart<Config>(state, part)),
  );

  // SAFETY: every response part of `folded` is a whole one — `collapse` either
  // completes the whole part its increments add up to or passes on a part a
  // response already carries whole, and the parts it drops are the increments no
  // whole part is made of — so what the stream holds is the parts of a trajectory
  // whose response parts are whole, which is what the config of the return type
  // states. A part's type is read off the schema the config builds it with, and
  // TypeScript does not read one config's parts as another's, so the invariant is
  // stated here rather than derived.
  return folded as Trajectory.TrajectoryStream<FoldedConfig<Config>, E, R>;
};
