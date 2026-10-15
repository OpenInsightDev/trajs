import { Predicate } from "effect";
import type { Tool } from "effect/ai";

import * as Response from "#/Response.ts";

interface Chunk {
  text: string;
  metadata: Response.ProviderMetadata;
}

type OpenChunks = Map<string, Map<string, Chunk>>;

export interface State {
  readonly text: OpenChunks;
  readonly reasoning: OpenChunks;
}

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
