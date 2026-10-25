import { Predicate, Stream } from "effect";
import type { Tool } from "effect/ai";

import * as Config from "#/Config.ts";
import * as Response from "#/Response.ts";
import * as Trajectory from "#/Trajectory.ts";

interface Open {
  text: string;
  metadata: Response.ProviderMetadata;
}

type OpenBySession = Map<string, Map<string, Open>>;

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

export const foldResponse = <Tools extends Record<string, Tool.Any>>(
  state: State,
  id: string,
  part: Response.AllPartsView<Tools>,
): readonly [State, ReadonlyArray<Response.PartView<Tools>>] => {
  switch (part.type) {
    case "text-start":
      openOf(state.text, id).set(part.id, { text: "", metadata: part.metadata });

      return [state, []];
    case "text-delta": {
      const text = openOf(state.text, id).get(part.id);

      if (text !== undefined) {
        text.text += part.delta;
        text.metadata = mergeMetadata(text.metadata, part.metadata);
      }

      return [state, []];
    }

    case "text-end": {
      const open = openOf(state.text, id);
      const text = open.get(part.id);

      if (text === undefined) {
        return [state, []];
      }

      open.delete(part.id);

      const completed = Response.makePart("text", {
        text: text.text,
        metadata: mergeMetadata(text.metadata, part.metadata),
      });

      return [state, [completed]];
    }

    case "reasoning-start":
      openOf(state.reasoning, id).set(part.id, { text: "", metadata: part.metadata });

      return [state, []];
    case "reasoning-delta": {
      const text = openOf(state.reasoning, id).get(part.id);

      if (text !== undefined) {
        text.text += part.delta;
        text.metadata = mergeMetadata(text.metadata, part.metadata);
      }

      return [state, []];
    }

    case "reasoning-end": {
      const open = openOf(state.reasoning, id);
      const text = open.get(part.id);

      if (text === undefined) {
        return [state, []];
      }

      open.delete(part.id);

      const completed = Response.makePart("reasoning", {
        text: text.text,
        metadata: mergeMetadata(text.metadata, part.metadata),
      });

      return [state, [completed]];
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

type StreamingConfig<Config extends Config.AnyConfig> = Config.Config<
  true,
  Config["toolkit"],
  Config["eventkit"],
  Config["metrickit"],
  Config["extrakit"]
>;

type FoldablePart<Config extends Config.AnyConfig> =
  | Trajectory.Part<Config>
  | Trajectory.Part<StreamingConfig<Config>>;

const StreamingTypes: ReadonlySet<string> = new Set([
  "text-start",
  "text-delta",
  "text-end",
  "reasoning-start",
  "reasoning-delta",
  "reasoning-end",
  "tool-params-start",
  "tool-params-delta",
  "tool-params-end",
  "error",
]);

const isStreaming = <Config extends Config.AnyConfig>(
  part: FoldablePart<Config>,
): part is Trajectory.Part<StreamingConfig<Config>> =>
  part._tag === "Response" && StreamingTypes.has(part.response.type);

const foldPart = <Config extends Config.AnyConfig>(
  state: State,
  part: Trajectory.Part<StreamingConfig<Config>>,
): readonly [State, ReadonlyArray<Trajectory.Part<FoldedConfig<Config>>>] => {
  if (part._tag !== "Response") return [state, [part]];

  const [folding, completed] = foldResponse(
    state,
    part.sessionId ?? Trajectory.mainSessionId,
    part.response,
  );

  return [folding, completed.map((response) => ({ ...part, response }))];
};

export const foldParts = <Config extends Config.AnyConfig, E, R>(
  parts: Stream.Stream<FoldablePart<Config>, E, R>,
): Stream.Stream<Trajectory.Part<FoldedConfig<Config>>, E, R> => {
  const folded = parts.pipe(
    Stream.mapAccum(initial, (state, part) =>
      isStreaming(part) ? foldPart<Config>(state, part) : [state, [part]],
    ),
  );

  return folded;
};
