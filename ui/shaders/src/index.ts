/**
 * The shader fills the trajs designs are painted with: the component that draws
 * one, {@link ShaderFill}, and the effects to draw with it — `Apricot haze` as
 * {@link Haze}, the six colourways it is drawn in included.
 *
 * Every fill is a shader authored in the Figma file and drawn here unchanged —
 * the pigments, the warped colour field, the nine deposited washes, the breathing
 * areas and the paper grain are the fill's own drawing, not an image. They are
 * drawn with WebGPU (`src/internal/runtime`, a copy of Figma's expressive
 * components), so a browser without it paints nothing and the colours behind the
 * fill are what shows.
 *
 * An effect is a module beside {@link Haze}: its parameters, a build per shader
 * the file exports, and its presets. A fill is whatever such a build returns,
 * which is what {@link Shader} names — adding the next one does not touch this
 * component.
 */

export { ShaderFill } from "#/ShaderFill.tsx";

export type { ShaderFillProps } from "#/ShaderFill.tsx";

export * as Haze from "#/Haze.ts";

export type { Manifest, Shader } from "#/Shader.ts";
