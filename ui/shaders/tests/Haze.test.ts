/**
 * The six colourways as the shader reads them: the fields each one states, the
 * ranges the fill's own controls allow, and the one current the design carries
 * all six on.
 *
 * A preset is read off the Figma file rather than computed, so there is nothing
 * here to exercise the drawing with. What is worth asserting is that a preset is
 * whole: a field it leaves out is a uniform the shader reads as garbage, and a
 * value outside its control draws a fill that is not the swatch it is named for.
 */

import { expect, it } from "vite-plus/test";

import { motion, presets } from "#/Haze.ts";

/**
 * The design's colourways, in the order the file draws them: `apricot` is node
 * `168:2`, `iris` `168:3`, `harbor` `168:4`, `orchid` `168:5`, `ember` `168:6`
 * and `abyss` `168:7`. Spelled out rather than read off `presets` so that a
 * colourway removed or renamed here is a test that fails.
 */
const names = [
  "apricot",
  "iris",
  "harbor",
  "orchid",
  "ember",
  "abyss",
] as const satisfies ReadonlyArray<keyof typeof presets>;

/** Every field a colourway states: the painting, and the current that carries it. */
const fields = [
  "coral",
  "apricot",
  "golden",
  "fieldLayout",
  "preset",
  "cloudStrength",
  "cloudScale",
  "cloudSoftness",
  "flow",
  "layering",
  "grainStrength",
  "grainSize",
  "seed",
  "motionSpeed",
  "driftAmount",
  "flowDirection",
] as const satisfies ReadonlyArray<keyof (typeof presets)["apricot"]>;

it("is the design's six colourways, and nothing else", () => {
  expect(Object.keys(presets)).toEqual([...names]);
});

it("states every field the fill is drawn from", () => {
  for (const name of names) {
    expect(Object.keys(presets[name]).sort(), name).toEqual([...fields].sort());
  }
});

it("stays inside the ranges the fill's controls allow", () => {
  const violations: Array<string> = [];

  const check = (field: string, value: number, min: number, max: number) => {
    if (!(value >= min && value <= max)) {
      violations.push(`${field} = ${value}, wanted ${min}..${max}`);
    }
  };

  for (const name of names) {
    const preset = presets[name];
    const at = (field: keyof typeof preset) => `${name}.${String(field)}`;

    for (const pigment of [preset.coral, preset.apricot, preset.golden]) {
      for (const channel of [pigment.r, pigment.g, pigment.b, pigment.a]) {
        check(at("coral"), channel, 0, 1);
      }
    }

    check(at("cloudStrength"), preset.cloudStrength, 0, 1);
    check(at("cloudScale"), preset.cloudScale, 0.2, 4);
    check(at("cloudSoftness"), preset.cloudSoftness, 0, 1);
    check(at("flow"), preset.flow, 0, 1);
    check(at("layering"), preset.layering, 0, 1);
    check(at("grainStrength"), preset.grainStrength, 0, 1);
    check(at("grainSize"), preset.grainSize, 0.25, 3);
    check(at("seed"), preset.seed, 0, 9999);
    check(at("motionSpeed"), preset.motionSpeed, 0, 4);
    check(at("driftAmount"), preset.driftAmount, 0, 1.5);
    check(at("flowDirection"), preset.flowDirection, 0, 360);
  }

  expect(violations).toEqual([]);
});

it("is carried on the current the design draws all six on", () => {
  for (const name of names) {
    const { driftAmount, flowDirection, motionSpeed } = presets[name];

    expect({ motionSpeed, driftAmount, flowDirection }, name).toEqual(motion);
  }
});
