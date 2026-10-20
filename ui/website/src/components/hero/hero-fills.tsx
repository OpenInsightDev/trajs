"use client";

import { useTheme } from "fumadocs-ui/provider/base";
import { type CSSProperties, useSyncExternalStore } from "react";

import { ShaderFill } from "../../shader-runtime";
import { apricotHaze, type HazeParams } from "./apricot-haze";
import { type DriftMotion, hazeDrift } from "./apricot-haze-drift";

/**
 * The hero's two shader fills, one per ground the design is drawn on.
 *
 * Both are `Apricot haze`. The ground is the same painting in greys, which is the
 * paper the page is printed on; the mark is the painting in pigment, masked to the
 * mark's inner triangle — the one shape the design fills with colour.
 *
 * Only the mark moves. The paper is drawn still — a page whose paper moves is a
 * page that is watched rather than read, and the ground is the size of the page,
 * so it is also the fill there is something to save in holding still. The mark is
 * the subject: it is carried by the file's animated build, `Apricot haze — drift`
 * in `hero/apricot-haze-drift.ts`, the same painting advected through one current.
 * A reader who asks for less motion is given the still painting in its place.
 *
 * The parameters are the Figma file's: the marks' are read off nodes `140:5`
 * (dark) and `135:95` (light) as they stand, and the ground's are the file's own
 * greys opened out — see {@link groundParams}. They are module constants rather
 * than values built when the theme is read, because the runtime sets a shader up
 * again whenever it is handed a different object, and an object built during a
 * render is a new one every time.
 *
 * The ground covers the whole page, which is the page's one fill measured in tens
 * of millions of pixels. So it is drawn into a canvas smaller than the box it
 * fills and stretched over it: half a canvas pixel for every CSS pixel of the
 * hero — see {@link groundShare}. The painting is pigment and grain at a scale
 * far larger than a pixel, so the half is not something the page shows.
 */

/**
 * The paper the page is printed on: the ground nodes `135:38` (light) and `130:2`
 * (dark) are filled with.
 *
 * The pigments are the design's greys opened out, and the cloud and the grain are
 * carried as far as the mark's own pigments are: at the file's 14% cloud and 18%
 * grain the paper reads as one flat colour. The middle grey stays where the design
 * draws it, so the page is the same tone — it is the variation across it that is
 * now wide enough to be read.
 */
const groundParams = {
  light: {
    coral: { r: 0.8784, g: 0.8784, b: 0.8784, a: 1 },
    apricot: { r: 0.9373, g: 0.9373, b: 0.9373, a: 1 },
    golden: { r: 1, g: 1, b: 1, a: 1 },
    fieldLayout: { x: 55.36, y: 50, radius: 58.89, angle: -28.28 },
    preset: 0,
    cloudStrength: 0.65,
    cloudScale: 0.6,
    cloudSoftness: 0.72,
    flow: 0.55,
    layering: 0.8,
    grainStrength: 0.5,
    grainSize: 1.3,
    seed: 111,
  },
  dark: {
    coral: { r: 0.2431, g: 0.2431, b: 0.2431, a: 1 },
    apricot: { r: 0.0157, g: 0.0157, b: 0.0157, a: 1 },
    golden: { r: 0.3451, g: 0.3451, b: 0.3451, a: 1 },
    fieldLayout: { x: 50, y: 58.45, radius: 71.57, angle: -23.6 },
    preset: 0,
    cloudStrength: 0.65,
    cloudScale: 0.6,
    cloudSoftness: 0.72,
    flow: 0.55,
    layering: 0.8,
    grainStrength: 0.5,
    grainSize: 1.3,
    seed: 111,
  },
} satisfies Record<"light" | "dark", HazeParams>;

/** The mark's pigments: nodes `135:95` (light) and `140:5` (dark), as the design
 * draws them standing still. {@link markMotion} is what carries them. */
const markParams = {
  light: {
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
  },
  dark: {
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
  },
} satisfies Record<"light" | "dark", HazeParams>;

/**
 * How the mark is carried: one current, a speed and a heading, at the values every
 * one of the design's drift swatches is drawn with — `hazeDriftPresets`' own three,
 * so the mark moves at the rate the file moves the fill it is painted from.
 */
const markMotion = {
  motionSpeed: 3,
  driftAmount: 1,
  flowDirection: 32,
} satisfies DriftMotion;

/** The two grounds, painted once: the runtime is handed the same object every
 * render, and nothing here is built when the theme is read. */
const ground = {
  light: apricotHaze(groundParams.light),
  dark: apricotHaze(groundParams.dark),
};

/** The mark both ways, painted once: the same pigments, with the drift's current
 * running through the moving pair. */
const mark = {
  still: {
    light: apricotHaze(markParams.light),
    dark: apricotHaze(markParams.dark),
  },
  moving: {
    light: hazeDrift({ ...markParams.light, ...markMotion }),
    dark: hazeDrift({ ...markParams.dark, ...markMotion }),
  },
};

/**
 * How much of its box the ground is drawn into, in canvas pixels per CSS pixel:
 * half, so that a page's worth of paper costs a quarter of the paint.
 *
 * The runtime sizes a canvas at the display's pixel ratio on top of this, so the
 * share is divided by it — half a canvas pixel for every CSS pixel whether the
 * screen is plain or Retina, and the same work on both. Measured on the hero at
 * 1920 × 1080, one canvas pixel per device pixel is 33ms a frame and drops one
 * frame in two; this share holds 60.
 */
const groundShare = 0.5;

/**
 * The display's pixel ratio, which changes when the window is zoomed or dragged
 * to a screen of another kind — the one thing that decides how many pixels the
 * ground is drawn at.
 */
const pixelRatio = {
  subscribe: (onChange: () => void) => {
    window.addEventListener("resize", onChange);

    return () => window.removeEventListener("resize", onChange);
  },
  getSnapshot: () => window.devicePixelRatio || 1,
  getServerSnapshot: () => 1,
};

const usePixelRatio = () =>
  useSyncExternalStore(pixelRatio.subscribe, pixelRatio.getSnapshot, pixelRatio.getServerSnapshot);

/**
 * A media query as a store, for the one thing the page asks the reader rather than
 * the display: the mark is the page's only motion, so whether to draw it moving is
 * a choice between two shaders, and the runtime reads that choice off the object it
 * is handed.
 *
 * `serverMatches` is what the page draws before it can ask — the server renders
 * without a window, and hydration is a frame or two later.
 */
const media = (query: string, serverMatches: boolean) => {
  let list: MediaQueryList | null = null;
  const of = () => (list ??= window.matchMedia(query));

  return {
    subscribe: (onChange: () => void) => {
      const target = of();
      target.addEventListener("change", onChange);

      return () => target.removeEventListener("change", onChange);
    },
    getSnapshot: () => of().matches,
    getServerSnapshot: () => serverMatches,
  };
};

/**
 * Whether the reader has asked the system for less motion than the page shows.
 *
 * The server answers yes, so the mark stands still until the page can ask: a reader
 * who wants no movement never sees any, and everyone else sees it start, which the
 * two paintings are close enough for that it does not read as a change.
 */
const lessMotion = media("(prefers-reduced-motion: reduce)", true);

const useLessMotion = () =>
  useSyncExternalStore(lessMotion.subscribe, lessMotion.getSnapshot, lessMotion.getServerSnapshot);

/**
 * The style that draws a fill into `share` of its box and stretches it over the
 * rest: the canvas keeps the position its class gives it, and the scale grows it
 * from its own top-left corner to the box's.
 */
const stretched = (share: number): CSSProperties => ({
  width: `${share * 100}%`,
  height: `${share * 100}%`,
  transform: `scale(${1 / share})`,
  transformOrigin: "0 0",
});

/**
 * The paper the hero is printed on: the fill's own grains and clouds, drawn over
 * the whole section in the greys of the ground it sits on. It is behind
 * everything, and it is what the section's own colour is a flat stand-in for
 * where WebGPU is not available.
 */
export const HeroGround = () => {
  const { resolvedTheme } = useTheme();
  const ratio = usePixelRatio();

  return (
    <ShaderFill
      className="absolute inset-0 -z-10"
      shader={resolvedTheme === "dark" ? ground.dark : ground.light}
      style={stretched(groundShare / ratio)}
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
 *
 * This is the page's one moving fill. The still painting stands in for it where the
 * reader has asked for less motion, and where WebGPU is not available the mark is
 * the outline the flat colour leaves.
 */
export const HeroMark = () => {
  const { resolvedTheme } = useTheme();
  const painting = useLessMotion() ? mark.still : mark.moving;

  return (
    <div className="absolute left-[0.94%] top-[1.6%] h-[78.21%] w-[34.89%] [mask-image:url(/mark-triangle.svg)] [mask-position:0_0] [mask-repeat:no-repeat] [mask-size:100%_100%]">
      <ShaderFill shader={resolvedTheme === "dark" ? painting.dark : painting.light} />
    </div>
  );
};
