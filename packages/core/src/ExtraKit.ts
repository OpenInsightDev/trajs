/**
 * Extra data collected into a kit: what a reading of a trajectory declares, keyed by
 * the tag each kind of extra data is held under.
 *
 * {@link make} collects the kinds of extra data an extension declares
 * ({@link Extra.Extra}) into a kit, {@link merge} adds the kinds of one kit to
 * another's, and {@link empty} names none. A kit is what a trajectory is read with —
 * the `extrakit` of its {@link Trajectory.Config} — so the kinds a reading knows are
 * the kinds its kit names.
 *
 * {@link Extra.ExtraRecord} reads a part's extra data as a kit declares it, and
 * {@link Extra.stated} takes one as a kit declares it out of a value that states more.
 */

import type * as Extra from "#/Extra.ts";
import type { IndexByKey } from "#/internal/types.ts";

/** The kinds of extra data of the ones given, keyed by the tag each names. */
type ExtrasByTag<Xs> = IndexByKey<Xs, "tag">;

/**
 * A kit of extra data, keyed by the tag each kind names.
 *
 * **When to use**
 *
 * Use to name the extra data a trajectory is read with — a field of a config, or the
 * parameter of a function that reads a part's extra data under one.
 *
 * @see {@link make} for building one, {@link Extra.ExtraRecord} for reading it.
 * @category models
 */
export type Kit<Extras extends Record<string, Extra.Any>> = Readonly<{
  extra: Extras;
}>;

/**
 * Collects extra data into a kit, keyed by the tag each kind names.
 *
 * **When to use**
 *
 * Use to gather the extra data an extension states into the kit a trajectory is read
 * with.
 *
 * **Details**
 *
 * Each kind is keyed by its own `tag`, so a kit names one kind per tag. A kit names
 * the kinds it was given and no others; {@link empty} names none.
 *
 * @see {@link merge} for adding the extra data of one kit to another's.
 * @see {@link Extra.ExtraRecord} for reading a part's extra data under a kit.
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
 * A kit whose extra data is not known.
 *
 * @category models
 */
export type Any = Kit<Record<string, Extra.Any>>;

/**
 * A kit that declares no extra data.
 *
 * @category constants
 */
export const empty = make();

/**
 * The type of {@link empty}.
 *
 * @category utility types
 */
export type Empty = typeof empty;

/** The extra data of the kits given as one, a shared tag holding the extra data of the latest kit that names it. */
type ExtrasMerged<Ks extends ReadonlyArray<Any>> = Ks extends readonly [
  infer Head extends Any,
  ...infer Tail extends ReadonlyArray<Any>,
]
  ? Omit<Head["extra"], keyof ExtrasMerged<Tail>> & ExtrasMerged<Tail>
  : {};

/**
 * The kit the kits given make, as one: every kind they name, a shared tag holding
 * the extra data of the latest kit that names it.
 *
 * **When to use**
 *
 * Use to type the kit {@link merge} returns.
 *
 * @see {@link merge} for the kit it types.
 * @category models
 */
export type Merged<Ks extends ReadonlyArray<Any>> = Kit<ExtrasMerged<Ks>>;

/**
 * Adds the extra data of each kit given to the ones of the kits before it.
 *
 * **When to use**
 *
 * Use when the extra data of several extensions are read together, or when a reader
 * that knows some of a trajectory's extra data reads it under the ones it knows
 * without forgetting the rest.
 *
 * **Details**
 *
 * A shared tag holds the extra data of the latest kit that names it, so a kit of a
 * version an extension states now states over the one a trajectory was read with.
 *
 * **Example** (Adding the extra data of one kit to another's)
 *
 * ```ts import.meta.vitest
 * import { Schema } from "effect"
 * import { Extra, ExtraKit, VersionedSchema } from "@trajs/core"
 *
 * const estimate = new Extra.Extra({
 *   package: "tokenize",
 *   id: "estimate",
 *   prompt: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     tokens: Schema.Number
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const step = new Extra.Extra({
 *   package: "atif",
 *   id: "step",
 *   session: Schema.Struct({
 *     version: Schema.Literal("0.1.0"),
 *     index: Schema.Number
 *   }).pipe(VersionedSchema.make)
 * })
 *
 * const merged = ExtraKit.merge(ExtraKit.make(estimate), ExtraKit.make(step))
 * Object.keys(merged.extra) // => ["tokenize/estimate", "atif/step"]
 * ```
 *
 * @see {@link make} for a kit of the extra data given alone.
 * @category constructors
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
