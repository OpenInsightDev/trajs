"use client";

import { useTheme } from "fumadocs-ui/provider/base";

import { ShaderFill } from "../../shader-runtime";
import { apricotHaze } from "./apricot-haze";

/**
 * The hero's two shader fills, one per ground the design is drawn on.
 *
 * Both are `Apricot haze`. The ground is the same painting at almost no strength
 * in greys, which is the paper the page is printed on; the mark is the painting
 * in pigment, masked to the mark's inner triangle — the one shape the design
 * fills with colour.
 *
 * The parameters are the Figma file's own, read off nodes `130:2` (dark),
 * `135:38` (light), `140:5` and `135:95` (the marks). They are module constants
 * rather than values built when the theme is read, because the runtime sets a
 * shader up again whenever it is handed a different object, and an object built
 * during a render is a new one every time.
 */
const ground = {
  light: apricotHaze({
    coral: { r: 0.9608, g: 0.9608, b: 0.9608, a: 1 },
    apricot: { r: 0.8493, g: 0.8493, b: 0.8493, a: 1 },
    golden: { r: 1, g: 1, b: 1, a: 1 },
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
  }),
  dark: apricotHaze({
    coral: { r: 0.1741, g: 0.1741, b: 0.1741, a: 1 },
    apricot: { r: 0, g: 0, b: 0, a: 1 },
    golden: { r: 0.2358, g: 0.2358, b: 0.2358, a: 1 },
    fieldLayout: { x: 50, y: 58.45, radius: 71.57, angle: -23.6 },
    preset: 0,
    cloudStrength: 0.14,
    cloudScale: 0.6,
    cloudSoftness: 0.72,
    flow: 0.55,
    layering: 0.65,
    grainStrength: 0.18,
    grainSize: 0.7,
    seed: 111,
  }),
};

const mark = {
  light: apricotHaze({
    coral: { r: 1, g: 0.565, b: 0.548, a: 1 },
    apricot: { r: 1, g: 0.701, b: 0.469, a: 1 },
    golden: { r: 1, g: 0.824, b: 0.105, a: 1 },
    fieldLayout: { x: 34.76, y: 59.57, radius: 50.51, angle: 3.29 },
    preset: 0,
    cloudStrength: 0.35,
    cloudScale: 1,
    cloudSoftness: 0.72,
    flow: 0.6,
    layering: 0.65,
    grainStrength: 0.18,
    grainSize: 0.7,
    seed: 7,
  }),
  dark: apricotHaze({
    coral: { r: 0.0603, g: 0.4104, b: 0.7448, a: 1 },
    apricot: { r: 0.6078, g: 0.6, b: 0.3294, a: 1 },
    golden: { r: 0.9569, g: 0.7412, b: 0.1333, a: 1 },
    fieldLayout: { x: 46.14, y: 56.59, radius: 57.56, angle: 100.6 },
    preset: 0,
    cloudStrength: 0.35,
    cloudScale: 1,
    cloudSoftness: 0.72,
    flow: 0.6,
    layering: 0.65,
    grainStrength: 0.18,
    grainSize: 0.7,
    seed: 42,
  }),
};

/**
 * The paper the hero is printed on: the fill's own grains and clouds, drawn over
 * the whole section in the greys of the ground it sits on. It is behind
 * everything, and it is what the section's own colour is a flat stand-in for
 * where WebGPU is not available.
 */
export const HeroGround = () => {
  const { resolvedTheme } = useTheme();

  return (
    <ShaderFill
      className="absolute inset-0 -z-10"
      shader={resolvedTheme === "dark" ? ground.dark : ground.light}
    />
  );
};

/**
 * The colour inside the mark: the painting, masked to the triangle the mark's
 * diagonals cut.
 *
 * The mask is the wrapper's rather than `ShaderFill`'s own `mask` prop, and the
 * reason is a CSS one: that prop arrives as the `mask` shorthand, which resets the
 * size and the repeat Figma's export sets beside it, and an inline shorthand cannot
 * be overridden by a class. Set here, the triangle is also in place before the
 * first frame instead of after a fetch of its own.
 *
 * The numbers place the fill over the mark's own coordinates, which are `Icon`'s:
 * the triangle is the region those diagonals bound, opened out to the left edge of
 * the frame, and it is 87.23 × 114.19 of the mark's 92 × 146 — so the mask's viewBox
 * is that box, and the fill is that much of the lockup it sits in.
 */
export const HeroMark = () => {
  const { resolvedTheme } = useTheme();

  return (
    <div className="absolute left-[0.94%] top-[1.6%] h-[78.21%] w-[34.89%] [mask-image:url(/mark-triangle.svg)] [mask-position:0_0] [mask-repeat:no-repeat] [mask-size:100%_100%]">
      <ShaderFill shader={resolvedTheme === "dark" ? mark.dark : mark.light} />
    </div>
  );
};
