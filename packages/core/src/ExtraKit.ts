import type { Schema } from "effect";

import type * as Extra from "#/Extra.ts";
import type { IndexByKey } from "#/internal/types.ts";

type ExtrasByTag<Xs> = IndexByKey<Xs, "tag">;

export type Kit<Extras extends Record<string, Extra.Any>> = Readonly<{
  extra: Extras;
}>;

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

export type Any = Kit<Record<string, Extra.Any>>;

export const empty = make();

export type Empty = typeof empty;

/**
 * A utility type which extracts the extra data from a {@link Kit}.
 *
 * @see {@link Extra.ExtraRecord} for the record schema those declarations make
 * @category models
 */
export type Extras<K> = K extends Kit<infer Extras> ? Extras : never;

type Schemas<K extends Any> = Exclude<
  | K["extra"][keyof K["extra"]]["prompt"]
  | K["extra"][keyof K["extra"]]["response"]
  | K["extra"][keyof K["extra"]]["session"],
  undefined
>;

/**
 * The services that decoding the extra data schemas of a {@link Kit} requires.
 *
 * @see {@link EncodingServices} for the services of writing the same schemas
 * @category models
 */
export type DecodingServices<K extends Any> = Schema.Codec.DecodingServices<Schemas<K>>;

/**
 * The services that encoding the extra data schemas of a {@link Kit} requires.
 *
 * @see {@link DecodingServices} for the services of reading the same schemas
 * @category models
 */
export type EncodingServices<K extends Any> = Schema.Codec.EncodingServices<Schemas<K>>;

type ExtrasMerged<Ks extends ReadonlyArray<Any>> = Ks extends readonly [
  infer Head extends Any,
  ...infer Tail extends ReadonlyArray<Any>,
]
  ? Omit<Head["extra"], keyof ExtrasMerged<Tail>> & ExtrasMerged<Tail>
  : {};

export type Merged<Ks extends ReadonlyArray<Any>> = Kit<ExtrasMerged<Ks>>;

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
