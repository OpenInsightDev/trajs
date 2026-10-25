/**
 * Extra declarations collected by tag.
 *
 * {@link make} collects declarations and {@link merge} combines kits.
 * Each declaration can supply schemas for prompt, response, and session extras.
 *
 * @stability stable
 */

import type { Schema } from "effect";

import type * as Extra from "#/Extra.ts";
import type { IndexByKey } from "#/internal/types.ts";

type ExtrasByTag<Xs> = IndexByKey<Xs, "tag">;

/**
 * A record of {@link Extra.Extra} declarations keyed by tag.
 *
 * @see {@link make} for construction.
 * @stability stable
 * @category models
 */
export type Kit<Extras extends Record<string, Extra.Any>> = Readonly<{
  extra: Extras;
}>;

/**
 * Collects extra declarations under their tags.
 *
 * **Gotchas**
 *
 * The last declaration wins for a repeated tag.
 *
 * @see {@link merge} for combining existing kits.
 * @stability stable
 * @category constructors
 */
export const make = <Xs extends ReadonlyArray<Extra.Any>>(...extra: Xs) => {
  // SAFETY: every kind of extra data given is inserted under its own tag below, so
  // what the record holds is one kind per tag the kit names.
  const output = {} as Record<string, Extra.Any>;

  for (const item of extra) {
    output[item.tag] = item;
  }

  // SAFETY: `output` holds the extra data of every tag in `Xs`, which is what
  // `ExtrasByTag` reads the extra data given as.
  return { extra: output } as Kit<ExtrasByTag<Xs>>;
};

/**
 * A {@link Kit} without specific extra types.
 *
 * @stability stable
 * @category utility types
 */
export type Any = Kit<Record<string, Extra.Any>>;

/**
 * An extra kit with no declarations.
 *
 * @see {@link make} for a kit with declarations.
 * @stability stable
 * @category constants
 */
export const empty = make();

/**
 * The type of the declaration-free {@link empty} kit.
 *
 * @stability stable
 * @category utility types
 */
export type Empty = typeof empty;

/**
 * Extra declarations of a {@link Kit}, or `never` for another type.
 *
 * @see {@link Extra.ExtraRecord} for the corresponding extra fields.
 * @stability stable
 * @category utility types
 */
export type Extras<K> = K extends Kit<infer Extras> ? Extras : never;

type Schemas<K extends Any> = Exclude<
  | K["extra"][keyof K["extra"]]["prompt"]
  | K["extra"][keyof K["extra"]]["response"]
  | K["extra"][keyof K["extra"]]["session"],
  undefined
>;

/**
 * Schema requirements for decoding prompt, response, and session extras of a {@link Kit}.
 *
 * @see {@link EncodingServices} for writing the same extras.
 * @stability stable
 * @category utility types
 */
export type DecodingServices<K extends Any> = Schema.Codec.DecodingServices<Schemas<K>>;

/**
 * Schema requirements for encoding prompt, response, and session extras of a {@link Kit}.
 *
 * @see {@link DecodingServices} for reading the same extras.
 * @stability stable
 * @category utility types
 */
export type EncodingServices<K extends Any> = Schema.Codec.EncodingServices<Schemas<K>>;

type ExtrasMerged<Ks extends ReadonlyArray<Any>> = Ks extends readonly [
  infer Head extends Any,
  ...infer Tail extends ReadonlyArray<Any>,
]
  ? Omit<Head["extra"], keyof ExtrasMerged<Tail>> & ExtrasMerged<Tail>
  : {};

/**
 * The {@link Kit} produced by merging kits in tuple order.
 *
 * @see {@link merge} for duplicate-tag behavior.
 * @stability stable
 * @category utility types
 */
export type Merged<Ks extends ReadonlyArray<Any>> = Kit<ExtrasMerged<Ks>>;

/**
 * Combines the declarations of existing extra kits.
 *
 * **Gotchas**
 *
 * The last kit wins for a repeated tag.
 * The whole declaration is replaced, including schemas for other part kinds.
 *
 * @see {@link make} for collecting individual declarations.
 * @stability stable
 * @category combining
 */
export const merge = <Ks extends ReadonlyArray<Any>>(...kits: Ks): Merged<Ks> => {
  // SAFETY: every datum of every kit is inserted under its own tag below, so what the
  // record holds is one datum per tag the kits name.
  const extra = {} as Record<string, Extra.Any>;

  for (const kit of kits) {
    Object.assign(extra, kit.extra);
  }

  // SAFETY: `extra` holds the datum of every tag in `Ks`, the one of the kit latest
  // among those that names it, which is what `ExtrasMerged` reads the kits as.
  return { extra } as Merged<Ks>;
};
