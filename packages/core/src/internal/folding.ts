/**
 * Converges the increments of a streamed response into the parts it was made of.
 *
 * A model streams a chunk of text or reasoning as a start, its deltas and an
 * end, and the part protocol is what gives those increments their boundaries:
 * the identifier a chunk was opened under and the session it was recorded in are
 * all a fold needs to converge them. The state that holds those open chunks, and
 * the rules that advance it, live here rather than in `Trajectory`, because they
 * are machinery of the fold rather than part of the part model that module
 * describes.
 */

import { Predicate } from "effect";
import type { Tool } from "effect/ai";
import * as Response from "#/Response.ts";

/**
 * A chunk of text or reasoning that the fold has opened and not yet ended.
 *
 * It is mutated in place while it is open: copying it for each of the deltas a
 * chunk accumulates would make folding quadratic in its length.
 */
interface Chunk {
  text: string;
  metadata: Response.ProviderMetadata;
}

/**
 * The chunks a fold holds open, keyed by session and then by the identifier the
 * part protocol gives a chunk.
 *
 * The identifier alone does not isolate them: a model numbers its chunks from
 * the start of each response, so two responses recorded in one trajectory reuse
 * the same identifiers, and folding them together would merge their text. Parts
 * that carry no session are grouped under the empty string, which is how `Codec`
 * and `Persist` group them.
 */
type OpenChunks = Map<string, Map<string, Chunk>>;

/**
 * The chunks a fold holds open, one set for the text of a response and one for
 * its reasoning, since a model streams both at once.
 */
export interface State {
  readonly text: OpenChunks;
  readonly reasoning: OpenChunks;
}

export const initial = (): State => ({ text: new Map(), reasoning: new Map() });

const chunksOf = (chunks: OpenChunks, session: string | undefined): Map<string, Chunk> => {
  const id = session ?? "";
  let open = chunks.get(id);

  if (open === undefined) {
    open = new Map();
    chunks.set(id, open);
  }

  return open;
};

/**
 * Merges the provider metadata of two parts of one chunk, a provider named in
 * both keeping the later part's data.
 *
 * A provider spreads a chunk's metadata over the parts of the chunk rather than
 * repeating it on each: `anthropic` carries a thinking block's signature on a
 * delta and its redacted form on the start, and `openai` carries its own on the
 * end. Taking the metadata of the part that ends a chunk would therefore drop
 * what the parts before it carried.
 */
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
 * Advances a fold by one part of a response, returning the parts it completes.
 */
export const collapse = <Tools extends Record<string, Tool.Any>>(
  state: State,
  session: string | undefined,
  part: Response.AllPartsView<Tools>,
): readonly [State, ReadonlyArray<Response.PartView<Tools>>] => {
  switch (part.type) {
    case "text-start":
      chunksOf(state.text, session).set(part.id, { text: "", metadata: part.metadata });

      return [state, []];
    case "text-delta": {
      const chunk = chunksOf(state.text, session).get(part.id);

      if (chunk !== undefined) {
        chunk.text += part.delta;
        chunk.metadata = mergeMetadata(chunk.metadata, part.metadata);
      }

      return [state, []];
    }

    case "text-end": {
      const open = chunksOf(state.text, session);
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
      chunksOf(state.reasoning, session).set(part.id, { text: "", metadata: part.metadata });

      return [state, []];
    case "reasoning-delta": {
      const chunk = chunksOf(state.reasoning, session).get(part.id);

      if (chunk !== undefined) {
        chunk.text += part.delta;
        chunk.metadata = mergeMetadata(chunk.metadata, part.metadata);
      }

      return [state, []];
    }

    case "reasoning-end": {
      const open = chunksOf(state.reasoning, session);
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

    // The parameters of a tool call arrive as the JSON of the call being built
    // up, and the call itself carries them whole once it is parsed, so there is
    // nothing to keep. An error is not a part a folded response records either.
    case "tool-params-start":
    case "tool-params-delta":
    case "tool-params-end":
    case "error":
      return [state, []];
    default:
      return [state, [part]];
  }
};
