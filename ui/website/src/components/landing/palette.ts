/**
 * The file's `Effect` variables, as the pigments its shader fills are drawn from.
 *
 * A fill takes its colours as the numbers it mixes, not as CSS, so the palette
 * the variables state has a second home here — with the same values, one entry
 * per mode, so a fill can be drawn in the mode the page is in.
 */

import type { Theme } from "../../theme";

/** `#rrggbb` as the pigment a fill takes, the way the file states it. */
const pigment = (hex: string) => ({
  a: 1,
  b: parseInt(hex.slice(5, 7), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  r: parseInt(hex.slice(1, 3), 16) / 255,
});

/**
 * `Effect / Mark / …`: the coral, golden and apricot the mark's pigment fill
 * (`224:322`) is mixed from, and the three the file colours its lockups with.
 */
export const markPigments = {
  dark: { apricot: pigment("#9b9954"), coral: pigment("#0f69be"), golden: pigment("#f4bd22") },
  light: { apricot: pigment("#ffb378"), coral: pigment("#ff908c"), golden: pigment("#ffd21b") },
};

/**
 * `Effect / Cloud / …`: the greys the page's paper is mixed from — the haze's
 * corals are the cloud's mids, its goldens the highs and its apricots the lows,
 * as the boards' fill (`230:2`) carries them.
 */
export const cloudPigments = {
  dark: { high: pigment("#3c3c3c"), low: pigment("#000000"), mid: pigment("#2c2c2c") },
  light: { high: pigment("#ffffff"), low: pigment("#d9d9d9"), mid: pigment("#f5f5f5") },
};

/** One mode's pigments, as the fills beside this module take them. */
export type MarkPigments = (typeof markPigments)[Theme];

export type CloudPigments = (typeof cloudPigments)[Theme];
