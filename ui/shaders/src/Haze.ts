/**
 * `Apricot haze`: the pigment painting authored in the Figma file, as the fills
 * this package hands to `ShaderFill` — the painting standing still, the same
 * painting advected through one current, and the six colourways the file draws
 * it in.
 *
 * The parameters are named the way the export names them, so a value can be
 * carried between the Figma file and this package without translation. Every
 * effect in the package is a module like this one: its parameters, the builds
 * the exported shader comes in, and its presets.
 *
 * @see {@link ShaderFill} — draw a fill
 */

import { designMotion, hazeDrift, type FillParams, type Motion } from "#/internal/haze-drift.ts";
import { apricotHaze, type Params } from "#/internal/haze.ts";
import type { Shader } from "#/internal/runtime/index.ts";

export type { ColorField, Params, Pigment } from "#/internal/haze.ts";

export type { FillParams, Motion } from "#/internal/haze-drift.ts";

/**
 * The current the design carries all six colourways on: a speed of 3, an amount
 * of 1 and a heading of 32°.
 *
 * **When to use**
 *
 * Spread it onto pigments of your own that should move the way the design moves
 * this painting, rather than at a rate of their own.
 *
 * **Example**
 *
 * ```tsx
 * <ShaderFill shader={Haze.drift({ ...pigments, ...Haze.motion })} />;
 * ```
 *
 * @see {@link drift} — carry the same painting on a current
 * @category fills
 */
export const motion: Motion = designMotion;

/**
 * The painting standing still: one frame, no clock, held until it is unmounted.
 *
 * **When to use**
 *
 * For a fill that is read rather than watched — a page's paper, a card's ground,
 * a surface the size of a screen. It costs nothing after its first frame.
 *
 * **Details**
 *
 * It is the Figma file's own still shader, `Apricot haze`; the parameters are the
 * ones {@link drift} takes without the current.
 *
 * **Example**
 *
 * ```tsx
 * <ShaderFill shader={Haze.still(Haze.presets.apricot)} className="size-full" />;
 * ```
 *
 * @see {@link drift} — the same painting in motion
 * @category fills
 */
export const still = (params: Params): Shader => apricotHaze(params);

/**
 * The painting in motion: the same pigments and clouds advected down one
 * heading, so the masses stream downstream and keep reshaping rather than
 * sloshing in place.
 *
 * **When to use**
 *
 * For the fill that is the subject of what it is drawn in — the inside of a mark,
 * a hero, a card that is meant to be watched. A moving fill paints every frame,
 * and the drawing is expensive; see the README.
 *
 * **Details**
 *
 * It is the file's animated build, `Apricot haze — drift`, whose parameters are
 * the still painting's and {@link motion}'s.
 *
 * **Example**
 *
 * ```tsx
 * <ShaderFill shader={Haze.drift(Haze.presets.iris)} className="size-full" />;
 *
 * // Your own pigments on the design's current:
 * <ShaderFill shader={Haze.drift({ ...Haze.presets.apricot, ...Haze.motion })} />;
 * ```
 *
 * @see {@link still} — the same painting, standing still
 * @category fills
 */
export const drift = (params: FillParams): Shader => hazeDrift(params);

/**
 * The design's six colourways, named the way the file names their node bodies,
 * each the parameters one of its swatches is drawn from.
 *
 * **When to use**
 *
 * Pass one to {@link drift} to paint a colourway as the design draws it, or read
 * the parameters of one to start a painting of your own from it.
 *
 * **Details**
 *
 * Every colourway is the same painting on the same current in its own pigments,
 * its own field and its own seed — drawn one at a time rather than recoloured
 * from one, so the cloud and the grain differ with them. They are those nodes'
 * parameters, read off the file, so a preset can be compared against the swatch
 * it is named for rather than measured by eye: `apricot` is `168:2`, `iris`
 * `168:3`, `harbor` `168:4`, `orchid` `168:5`, `ember` `168:6` and `abyss`
 * `168:7`. `apricot` is the fill's own palette: the three pigments the design
 * colours its mark with.
 *
 * **Example**
 *
 * ```tsx
 * import { Haze, ShaderFill } from "@trajs/ui-shaders";
 *
 * <ShaderFill shader={Haze.drift(Haze.presets.iris)} className="size-full" />;
 *
 * // The same colourway, from its parameters:
 * const iris = Haze.presets.iris;
 * ```
 *
 * @see {@link PresetName} — the names a preset is chosen by
 * @see {@link FillParams} — what a preset states
 * @category fills
 */
export const presets = {
  /** Coral, apricot and gold: the fill's own palette. */
  apricot: {
    coral: { r: 1, g: 0.565, b: 0.548, a: 1 },
    apricot: { r: 1, g: 0.701, b: 0.469, a: 1 },
    golden: { r: 1, g: 0.824, b: 0.105, a: 1 },
    fieldLayout: { x: 39.59, y: 55.53, radius: 67.64, angle: -7.23 },
    preset: 0,
    cloudStrength: 0.35,
    cloudScale: 1,
    cloudSoftness: 0.72,
    flow: 0.6,
    layering: 0.65,
    grainStrength: 0.18,
    grainSize: 0.7,
    seed: 7,
    motionSpeed: 3,
    driftAmount: 1,
    flowDirection: 32,
  },
  /** Violet, indigo and cyan. */
  iris: {
    coral: { r: 0.7686, g: 0.5529, b: 0.9137, a: 1 },
    apricot: { r: 0.2678, g: 0.3322, b: 0.9412, a: 1 },
    golden: { r: 0.2353, g: 0.7647, b: 0.9882, a: 1 },
    fieldLayout: { x: 60.11, y: 52.14, radius: 44.06, angle: 79.6 },
    preset: 0,
    cloudStrength: 0.35,
    cloudScale: 1,
    cloudSoftness: 0.72,
    flow: 0.6,
    layering: 0.65,
    grainStrength: 0.18,
    grainSize: 0.7,
    seed: 118,
    motionSpeed: 3,
    driftAmount: 1,
    flowDirection: 32,
  },
  /** Pool blue, olive and a gold that reads as sand. */
  harbor: {
    coral: { r: 0.2431, g: 0.5059, b: 0.7569, a: 1 },
    apricot: { r: 0.6078, g: 0.6, b: 0.3294, a: 1 },
    golden: { r: 0.9569, g: 0.7412, b: 0.1333, a: 1 },
    fieldLayout: { x: 55.36, y: 50, radius: 57.56, angle: 100.6 },
    preset: 0,
    cloudStrength: 0.35,
    cloudScale: 1,
    cloudSoftness: 0.72,
    flow: 0.6,
    layering: 0.65,
    grainStrength: 0.18,
    grainSize: 0.7,
    seed: 42,
    motionSpeed: 3,
    driftAmount: 1,
    flowDirection: 32,
  },
  /** Peach, lilac and orchid, at the softest cloud the six are drawn with. */
  orchid: {
    coral: { r: 0.9647, g: 0.6314, b: 0.549, a: 1 },
    apricot: { r: 0.8078, g: 0.5843, b: 0.8235, a: 1 },
    golden: { r: 0.6039, g: 0.4235, b: 0.7647, a: 1 },
    fieldLayout: { x: 55.36, y: 50, radius: 58.89, angle: -28.28 },
    preset: 0,
    cloudStrength: 0.14,
    cloudScale: 0.6,
    cloudSoftness: 0.72,
    flow: 0.55,
    layering: 0.65,
    grainStrength: 0.18,
    grainSize: 0.7,
    seed: 111,
    motionSpeed: 3,
    driftAmount: 1,
    flowDirection: 32,
  },
  /** Orange, apricot and red at the calmest cloud of the six. */
  ember: {
    coral: { r: 0.9882, g: 0.6588, b: 0.4196, a: 1 },
    apricot: { r: 0.9882, g: 0.8235, b: 0.6627, a: 1 },
    golden: { r: 0.9843, g: 0.4157, b: 0.2549, a: 1 },
    fieldLayout: { x: 50, y: 36.55, radius: 67.66, angle: 6.47 },
    preset: 0,
    cloudStrength: 0.09,
    cloudScale: 0.6,
    cloudSoftness: 0.72,
    flow: 0.51,
    layering: 0.65,
    grainStrength: 0.18,
    grainSize: 0.7,
    seed: 128,
    motionSpeed: 3,
    driftAmount: 1,
    flowDirection: 32,
  },
  /** Two blues and a pale foam, under the heaviest grain of the six. */
  abyss: {
    coral: { r: 0.7374, g: 0.8516, b: 0.9583, a: 1 },
    apricot: { r: 0.0078, g: 0.298, b: 0.698, a: 1 },
    golden: { r: 0.0078, g: 0.5216, b: 0.9569, a: 1 },
    fieldLayout: { x: 41.75, y: 50, radius: 59.01, angle: -9.22 },
    preset: 0,
    cloudStrength: 0.09,
    cloudScale: 0.6,
    cloudSoftness: 0.59,
    flow: 0.51,
    layering: 0.65,
    grainStrength: 0.4,
    grainSize: 1.15,
    seed: 255,
    motionSpeed: 3,
    driftAmount: 1,
    flowDirection: 32,
  },
} satisfies Record<string, FillParams>;

/**
 * The name of one of the design's colourways, which is what its swatch is called
 * in {@link presets}.
 *
 * @category fills
 */
export type PresetName = keyof typeof presets;
