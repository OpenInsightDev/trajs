/**
 * The part of `@figma/expressive-components` the site draws its shader fills
 * with: the WebGPU device, the render loop, and {@link ShaderFill}.
 *
 * See the README beside this file for where it came from and what changed.
 */

export type {
  CustomEffectState,
  GpuState,
  Manifest,
  MousePosition,
  Shader,
} from "./types";

export { ShaderFill } from "./ShaderFill";

export type { ShaderFillProps } from "./ShaderFill";
