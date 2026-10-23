import { Predicate, Stream } from "effect";
import type { Tool } from "effect/ai";

import * as Config from "#/Config.ts";
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

type FoldedConfig<Config extends Config.AnyConfig> = Config.Config<
  false,
  Config["toolkit"],
  Config["eventkit"],
  Config["metrickit"],
  Config["extrakit"]
>;

const foldPart = <Config extends Config.AnyConfig>(
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

export const foldParts = <Config extends Config.AnyConfig, E, R>(
  parts: Trajectory.TrajectoryStream<Config, E, R>,
): Trajectory.TrajectoryStream<FoldedConfig<Config>, E, R> => {
  const folded = parts.pipe(
    Stream.mapAccum(initial, (state, part) => foldPart<Config>(state, part)),
  );

  return folded as Trajectory.TrajectoryStream<FoldedConfig<Config>, E, R>;
};
