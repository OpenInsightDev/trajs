import { Option, Predicate } from "effect";
import type { Tool } from "effect/ai";

import * as Response from "#/Response.ts";

interface Open {
  text: string;
  metadata: Response.ProviderMetadata;
}

type OpenBySession = Map<string, Map<string, Open>>;

/**
 * The text and reasoning chunks a response has opened, by session and by chunk id.
 *
 * A chunk is opened by the part that starts it, added to by its deltas, and closed
 * by the part that ends it, which is the part the chunk is written as.
 */
export interface State {
  readonly text: OpenBySession;
  readonly reasoning: OpenBySession;
}

export const initial = (): State => ({ text: new Map(), reasoning: new Map() });

const openOf = (open: OpenBySession, id: string): Map<string, Open> => {
  let parts = open.get(id);

  if (parts === undefined) {
    parts = new Map();
    open.set(id, parts);
  }

  return parts;
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

/**
 * Folds one part into the finished part it belongs to.
 *
 * Returns none for an increment, and for a part a trajectory does not hold.
 */
export const foldResponse = <Tools extends Record<string, Tool.Any>>(
  state: State,
  id: string,
  part: Response.AllPartsView<Tools>,
): readonly [State, Option.Option<Response.PartView<Tools>>] => {
  switch (part.type) {
    case "text-start":
      openOf(state.text, id).set(part.id, { text: "", metadata: part.metadata });

      return [state, Option.none()];
    case "text-delta": {
      const text = openOf(state.text, id).get(part.id);

      if (text !== undefined) {
        text.text += part.delta;
        text.metadata = mergeMetadata(text.metadata, part.metadata);
      }

      return [state, Option.none()];
    }

    case "text-end": {
      const open = openOf(state.text, id);
      const text = open.get(part.id);

      if (text === undefined) {
        return [state, Option.none()];
      }

      open.delete(part.id);

      const completed = Response.makePart("text", {
        text: text.text,
        metadata: mergeMetadata(text.metadata, part.metadata),
      });

      return [state, Option.some(completed)];
    }

    case "reasoning-start":
      openOf(state.reasoning, id).set(part.id, { text: "", metadata: part.metadata });

      return [state, Option.none()];
    case "reasoning-delta": {
      const text = openOf(state.reasoning, id).get(part.id);

      if (text !== undefined) {
        text.text += part.delta;
        text.metadata = mergeMetadata(text.metadata, part.metadata);
      }

      return [state, Option.none()];
    }

    case "reasoning-end": {
      const open = openOf(state.reasoning, id);
      const text = open.get(part.id);

      if (text === undefined) {
        return [state, Option.none()];
      }

      open.delete(part.id);

      const completed = Response.makePart("reasoning", {
        text: text.text,
        metadata: mergeMetadata(text.metadata, part.metadata),
      });

      return [state, Option.some(completed)];
    }

    case "tool-params-start":
    case "tool-params-delta":
    case "tool-params-end":
    case "error":
      return [state, Option.none()];
    default:
      return [state, Option.some(part)];
  }
};
