"use client";

/**
 * A fill as a React component: a canvas the size of its box, with whatever shader
 * it is handed drawn into it.
 *
 * **When to use**
 *
 * Wherever a design paints a surface with a shader fill — a card's ground, a
 * page's paper, the inside of a mark. The fill comes from an effect module's
 * build: `Haze.still(…)` for a painting that is read, `Haze.drift(…)` for one
 * that is watched.
 *
 * **Details**
 *
 * The canvas fills its own box, so the component takes its size from CSS the way
 * an `img` does: `className="absolute inset-0"` for a fill behind content, or a
 * sized parent and `className="size-full"`. It draws nothing where WebGPU is
 * not available (`null`, not an empty canvas), so the flat colour of whatever is
 * behind it is what a browser without it shows.
 *
 * Whether the fill moves is the shader's own: the manifest a build carries says
 * so, and the runtime runs a clock for a fill that does. The component reuses the
 * shader it is handed as long as the object is the same one — an effect's builds
 * remember theirs per parameters object, so calling `Haze.drift(Haze.presets.iris)`
 * inline does not set the fill up again on every render.
 *
 * A fill carries the shader's own functions, so it is built where it is drawn:
 * a client component. Rendering `ShaderFill` from a server component means
 * handing React a `Shader` it cannot serialize, so a page that draws a fill — a
 * demo in a document, a hero — is a client module, as are the fills it holds as
 * module constants.
 *
 * **Example**
 *
 * ```tsx
 * import { Haze, ShaderFill } from "@trajs/ui-shaders";
 *
 * // A colourway of the design, in motion.
 * <ShaderFill shader={Haze.drift(Haze.presets.orchid)} className="absolute inset-0 -z-10" />;
 *
 * // A painting of your own, drawn still in the greys of a page.
 * <ShaderFill shader={Haze.still(ground)} className="absolute inset-0 -z-10" />;
 *
 * // The same painting, carried on a current of its own.
 * <ShaderFill shader={Haze.drift({ ...Haze.presets.apricot, ...Haze.motion })} />;
 * ```
 *
 * @see {@link Shader} — what a fill is
 * @see {@link ShaderFillProps} — the props this component takes
 * @category fills
 */

import type { CSSProperties } from "react";

import type { Shader } from "#/internal/runtime/index.ts";
import * as Runtime from "#/internal/runtime/index.ts";

/**
 * What {@link ShaderFill} takes: the fill, and the box it is drawn in.
 *
 * @category fills
 */
export type ShaderFillProps = Readonly<{
  /** The fill to draw: a build of an effect, and the parameters it was built from. */
  shader: Shader;
  /** Styling for the canvas, which is the fill's own box. */
  className?: string;
  /** The same, inline — where a caller computes the box rather than classifies it. */
  style?: CSSProperties;
  /** A CSS `mask` value, `url(…)` or otherwise, clipping the fill to a shape. */
  mask?: string;
}>;

/**
 * The fill, drawn into a canvas that fills its box.
 *
 * @category fills
 */
export const ShaderFill = ({ shader, className, style, mask }: ShaderFillProps) => (
  <Runtime.ShaderFill className={className} mask={mask} shader={shader} style={style} />
);
