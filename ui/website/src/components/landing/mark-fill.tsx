"use client";

/**
 * The pigment inside the mark: `Apricot haze` again, in the file's `Effect / Mark`
 * pigments (`224:322`) — the coral, golden and apricot the mark is filled with,
 * which the file restates for the light mode the way it restates the palette it
 * colours its lockups with.
 *
 * It is the fill the file exports in motion — `Apricot haze — drift` — on the
 * design's own current (`Haze.motion`: speed 3, amount 1, heading 32°), so the
 * pigment streams through the mark and keeps reshaping rather than sitting as one
 * frame. The rest is the mark's: its field, its seed, and where the design draws
 * it — over the upper square of the mark, clipped to the triangle its vector mask
 * cuts, and scaled with that square rather than sized on its own.
 */

import { Haze, ShaderFill, type Shader } from "@trajs/ui-shaders";

import { useTheme, type Theme } from "../../theme";
import { markPigments, type MarkPigments } from "./palette";

/** The painting in one mode's mark pigments, on the field and seed the mark's
 * fill is drawn from, carried down the current the design carries it on. */
const markOf = ({ coral, golden, apricot }: MarkPigments): Shader =>
  Haze.drift({
    coral,
    golden,
    apricot,
    fieldLayout: { x: 46.1356, y: 56.5894, radius: 57.5612, angle: 100.5984 },
    preset: 0,
    cloudStrength: 0.35,
    cloudScale: 1,
    cloudSoftness: 0.72,
    flow: 0.6,
    layering: 0.65,
    grainStrength: 0.18,
    grainSize: 0.7,
    seed: 42,
    ...Haze.motion,
  });

const marks: Readonly<Record<Theme, Shader>> = {
  dark: markOf(markPigments.dark),
  light: markOf(markPigments.light),
};

/** The fill, drawn into the triangle its box is clipped to, in the mode the page
 * is in. */
export const MarkFill = ({ className }: { className?: string }) => (
  <ShaderFill className={className} shader={marks[useTheme()]} />
);
