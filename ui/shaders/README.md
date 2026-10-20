# @trajs/ui-shaders

The shader fills the trajs designs are painted with, as the component that draws
them: one component, `ShaderFill`, and one module per effect — `Apricot haze`
today, in the six colourways the Figma file draws it in — with more to come.

They live in their own package because a fill outlives the page it was first
drawn for: the landing page's paper and the inside of its mark are two of these
fills, and a shader copied into an app is a shader that drifts from the file it
was exported from.

## A fill

```tsx
import { Haze, ShaderFill } from "@trajs/ui-shaders";

<ShaderFill shader={Haze.drift(Haze.presets.abyss)} className="absolute inset-0 -z-10" />;
```

A fill is what an effect's build returns — `Haze.drift(params)` for a painting in
motion, `Haze.still(params)` for one that is read rather than watched — and
`ShaderFill` draws it into a canvas the size of its box. The canvas takes its
size from CSS the way an `img` does: `absolute inset-0` behind content, or a
sized parent and `size-full`.

A painting of your own is given as the parameters the colourways hold:

```tsx
import { Haze, ShaderFill } from "@trajs/ui-shaders";

const ground = {
  // …the pigments, the field, the clouds, the seed
} satisfies Haze.Params;

<ShaderFill shader={Haze.still(ground)} className="absolute inset-0 -z-10" />;
```

Parameters are objects, and a build remembers its shader per parameters object —
so `Haze.drift(Haze.presets.iris)` may be written inline, while pigments built
during a render are a new object every time and set the fill up again. Keep those
a module constant or a `useMemo`.

## The colourways

`Haze.presets` holds the six `Rectangle · flowing` swatches the design draws the
fill in — the same painting on the same current, each in its own pigments, field
and seed, so the cloud and the grain differ with them. They are those nodes'
parameters, read off the file, so a preset can be compared against the swatch it
is named for rather than measured by eye.

| preset    | node    | what it paints                                        |
| --------- | ------- | ----------------------------------------------------- |
| `apricot` | `168:2` | coral, apricot and gold: the fill's own palette       |
| `iris`    | `168:3` | violet, indigo and cyan                               |
| `harbor`  | `168:4` | pool blue, olive and a gold that reads as sand        |
| `orchid`  | `168:5` | peach, lilac and orchid, the softest cloud of the six |
| `ember`   | `168:6` | orange, apricot and red, the calmest cloud of the six |
| `abyss`   | `168:7` | two blues and a pale foam, under the heaviest grain   |

`Haze.motion` is the current all six are carried on, for pigments of your own:
`Haze.drift({ ...pigments, ...Haze.motion })`.

## Adding a fill

An effect is a module beside `Haze.ts`, and nothing about the component changes
when one is added:

1. `src/internal/<name>.ts` — the WGSL as Figma exports it, unchanged, and the
   plumbing that turns its parameters into the uniforms, the pipeline and the
   draw. The parameter type is the export's property names, typed; the build is
   wrapped in `remembered` (see `internal/remember.ts`) so a caller can call it
   while rendering.
2. `src/<Name>.ts` — the effect's public face: the parameter types, a build per
   shader the file exports (a still drawing and an animated one are two shaders,
   as `Haze.still` and `Haze.drift` are), and its presets if it has any.
3. One line in `src/index.ts` — `export * as <Name> from "#/<Name>.ts"`.
4. A test beside `tests/Haze.test.ts` if the effect carries presets: the fields
   each one states and the ranges its controls allow, so a colourway that is
   missing a value fails rather than painting one.

## The drawing

The WGSL in [`src/internal/haze.ts`](src/internal/haze.ts) and
[`src/internal/haze-drift.ts`](src/internal/haze-drift.ts) is the export's own
text, unchanged: a pigment painting made of a warped colour field, nine placed
deposits, uneven breathing areas and paper granulation, drawn from the parameters
rather than sampled from an image. Editing a fill in Figma and re-exporting it —
or editing it here — keeps the uniforms' layout either way.

What is not the export is the plumbing: the parameters are typed and the ones a
component cannot produce are not carried. There are two shaders because the file
has two: `Apricot haze` paints one frame and stops, and `Apricot haze — drift`
advects the same painting through one current and wants a clock. They share the
drawing's text rather than one shader with a switch, since that text is what is
diffed against the export.

## WebGPU

Fills are drawn with WebGPU. Where it is not available `ShaderFill` renders
nothing at all rather than an empty box, so the flat colour of whatever is behind
the fill is what shows — the design always has one.

The runtime that draws them is [`src/internal/runtime`](src/internal/runtime), a
copy of [`@figma/expressive-components`](https://github.com/figma/expressive-components)
with a README of its own saying what was changed. It is copied source rather than
project code: both this package's `vite.config.ts` and the repository's leave it
as written, so it can be diffed against upstream.

## The cost of a fill

A moving fill paints every frame, and the drawing is a dozen five-octave noise
clouds per pixel over the whole box, so a fill the size of a page is expensive:
at 1920 × 1080, one canvas pixel per device pixel is 33ms a frame on the machine
the landing page was measured on. A fill that is a texture rather than a subject
can be drawn into a canvas smaller than its box and stretched over it — the
landing page's paper is half a canvas pixel per CSS pixel. A moving fill also
paints whether or not it is on screen, so a fill below the fold is worth mounting
when it is reached.

## What is in the package

- `src/index.ts` — the barrel: `ShaderFill`, `Haze` and the `Shader` type.
- `src/ShaderFill.tsx` — the component, and the props it takes.
- `src/Shader.ts` — what a fill is: the Figma export's own shape.
- `src/Haze.ts` — `Apricot haze`: its parameters, its two builds, its six
  colourways.
- `src/internal/` — the shaders' WGSL and plumbing, `remembered`, and the vendored
  Figma runtime that draws them.
