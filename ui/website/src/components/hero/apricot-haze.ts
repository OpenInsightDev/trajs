/**
 * The fill the hero is drawn with: `Apricot haze`, the shader fill authored in the
 * Figma file and exported from it, brought to the runtime the page draws it with
 * (`src/shader-runtime`).
 *
 * ---------------------------------------------------------------------------
 * Apricot haze — Figma shader fill `e1ad0ef3-ad80-4486-8954-5cbbc25dd52a`,
 * version `b30bf20b270e756cb40e01d934ddaf3bf18d2652`. The WGSL below is that
 * shader's own text, unchanged: a pigment painting made of a warped colour
 * field, nine placed deposits, uneven breathing areas and paper granulation,
 * drawn from the parameters rather than sampled from an image. Edit it in Figma
 * and re-export, or edit it here — the uniforms keep the export's layout either
 * way.
 * ---------------------------------------------------------------------------
 *
 * What is not the export's text is the plumbing. Figma's `render` reads its
 * parameters out of an untyped dictionary on every frame and carries a branch for
 * every control its property panel can produce; this page names its parameters
 * when it builds the shader, so the ones it uses are read typed, once, and the
 * ones it cannot produce (gradients, colour points, booleans) are not carried at
 * all. The uniform block, the pipeline and the draw are the export's.
 */

import type { Manifest, Shader } from "../../shader-runtime";

/** A pigment, as the exported properties hold one: straight-alpha sRGB in 0..1. */
export type Pigment = Readonly<{ r: number; g: number; b: number; a: number }>;

/**
 * Where the colour field sits: a centre in percent of the fill, a radius in
 * percent of its shorter side, and a turn in degrees.
 */
export type ColorField = Readonly<{
  x: number;
  y: number;
  radius: number;
  angle: number;
}>;

/**
 * What the fill draws, named the way the exported properties are named, so a
 * value can be carried between the Figma file and this page without translation.
 */
export type HazeParams = Readonly<{
  /** The three pigments. In the export the first is coral pink, the second
   * apricot orange and the third golden yellow; a composition may recolour all
   * three, and the dark hero does. */
  coral: Pigment;
  apricot: Pigment;
  golden: Pigment;
  fieldLayout: ColorField;
  /**
   * Which of the three compositions to draw: 0 places nine warm washes, 1 draws
   * veils of one colour through another, and 2 runs a broad diagonal front
   * between two pigments with a mixing body along it. The export also swaps in a
   * palette per preset; this page passes its pigments explicitly, so a preset
   * only changes the drawing.
   */
  preset: number;
  /** How much the clouds warp the field, 0..1. */
  cloudStrength: number;
  /** The size of those clouds: larger is finer. */
  cloudScale: number;
  /** How soft the clouds' edges are, 0..1. */
  cloudSoftness: number;
  /** How far pigment is dragged along the composition's direction, 0..1. */
  flow: number;
  /** How strongly the deposits stack, 0..1. */
  layering: number;
  /** The strength of the paper grain, 0..1. */
  grainStrength: number;
  /** The size of the grain, in device pixels of the fill. */
  grainSize: number;
  /** The seed the noise and the cloud geometry are drawn from. */
  seed: number;
}>;

/**
 * The GPU objects one fill owns: the shader module, the pipeline it is drawn
 * with, the quad it covers the fill with, and the uniforms. Created once by
 * `setup` and kept for the life of that fill.
 */
type Resources = {
  module: GPUShaderModule;
  pipeline: GPURenderPipeline | null;
  pipelineFormat: GPUTextureFormat | null;
  quad: GPUBuffer;
  uniform: GPUBuffer;
  uniforms: Float32Array;
};

/**
 * The resources of every live fill, keyed by the object the runtime keeps for
 * it. The runtime hands `setup` and `render` the same state object and nothing
 * else to hold resources in, and a `WeakMap` keeps two fills of this shader from
 * sharing buffers without asking for a cast out of that untyped state.
 */
const resourcesOf = new WeakMap<object, Resources>();

const manifest: Manifest = {
  version: 2,
  name: "Apricot haze",
  isAnimated: false,
  usesMouse: false,
};

/**
 * The uniform block is thirteen `vec4`s, one per field of the WGSL `Uniforms`
 * struct. A scalar control fills the first lane of its `vec4` and leaves the rest
 * zero, which is how the export packs a panel of single numbers.
 */
const uniformSize = 13 * 4;

/** The quad's six vertices: two triangles, each with a position and a uv. */
const quadVertices = [-1, -1, 0, 1, 1, -1, 1, 1, -1, 1, 0, 0, -1, 1, 0, 0, 1, -1, 1, 1, 1, 1, 1, 0];

const wgsl = `
diagnostic(off,derivative_uniformity);
struct Uniforms {
  frameData: vec4f,
  inputDimsData: vec4f,
  coral: vec4f,
  apricot: vec4f,
  golden: vec4f,
  fieldLayout: vec4f,
  cloudStrength: vec4f,
  cloudScale: vec4f,
  cloudSoftness: vec4f,
  grainStrength: vec4f,
  grainSize: vec4f,
  seed: vec4f,
  composition: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsIn {
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
};
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn hazeHash(p: vec2f) -> f32 {

  var q = fract(vec3f(p.x, p.y, p.x) * vec3f(0.1031, 0.1030, 0.0973));

  q = q + dot(q, q.yzx + 33.33);

  return fract((q.x + q.y) * q.z);

}

fn hazeNoise(p: vec2f) -> f32 {

  let cell = floor(p);

  let f = fract(p);

  let w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  return mix(mix(hazeHash(cell), hazeHash(cell + vec2f(1.0, 0.0)), w.x),

             mix(hazeHash(cell + vec2f(0.0, 1.0)), hazeHash(cell + vec2f(1.0)), w.x), w.y);

}

fn hazeCloud(p: vec2f, softness: f32) -> f32 {

  var pos = p;

  var weight = 0.55;

  var total = 0.0;

  var norm = 0.0;

  let persistence = mix(0.57, 0.23, softness);

  for (var i = 0; i < 5; i = i + 1) {

    total = total + weight * hazeNoise(pos);

    norm = norm + weight;

    pos = mat2x2f(0.8, 0.6, -0.6, 0.8) * pos * 2.07 + vec2f(17.1, 9.2);

    weight = weight * persistence;

  }

  return total / norm - 0.5;

}

// Smooth deposited pigment, not a contour / threshold noise pattern.
fn washMask(p: vec2f, center: vec2f, radii: vec2f, angle: f32,
            bloom: f32, edge: f32) -> f32 {
  let d = p - center;
  let r = vec2f(cos(angle) * d.x + sin(angle) * d.y,
               -sin(angle) * d.x + cos(angle) * d.y) / radii;
  let distanceField = dot(r, r);
  return exp(-distanceField * mix(1.55, 0.95, edge)) *
         clamp(0.82 + bloom * 1.3, 0.16, 1.35);
}

// Internal compositing is premultiplied; final fill output is straight alpha.
fn glaze(base: vec4f, pigment: vec4f, coverage: f32) -> vec4f {
  let a = clamp(coverage * pigment.a, 0.0, 0.94);
  return vec4f(pigment.rgb * a, a) + base * (1.0 - a);
}

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}

@fragment fn fs_main(@location(0) outputUv_in: vec2f) -> @location(0) vec4f {
  let dims = max(u.frameData.yz, vec2f(1.0));
  let uv = outputUv_in;
  let coral = u.coral;
  let apricot = u.apricot;
  let golden = u.golden;
  let fieldLayout = u.fieldLayout;
  let strength = clamp(u.cloudStrength.x, 0.0, 1.0);
  let cloudScale = max(u.cloudScale.x, 0.15);
  let softness = clamp(u.cloudSoftness.x, 0.0, 1.0);
  let seed = u.seed.x;
  let preset = i32(u.composition.x + 0.5);
  let flow = u.composition.y;
  let layering = u.composition.z;
  let shortSide = min(dims.x, dims.y);
  let p = (uv * dims - fieldLayout.xy / 100.0 * dims) / shortSide;
  let angle = radians(fieldLayout.w);
  let local = vec2f(cos(angle) * p.x + sin(angle) * p.y,
                   -sin(angle) * p.x + cos(angle) * p.y);
  let spread = max(fieldLayout.z / 100.0, 0.1);
  let q = local / spread;
  let seedOffset = vec2f(seed * 1.731 + 13.7, seed * 0.917 + 41.3);
  let npos = q / cloudScale;
  let macroWarp = vec2f(hazeCloud(npos * 2.1 + seedOffset, 0.82),
                    hazeCloud(npos * 2.1 + seedOffset + vec2f(21.8, 9.1), 0.82));
  // A real compositional warp exists even on old nodes at strength=.35.
  let bent = q + macroWarp * (0.23 + strength * 0.75);
  let across = (bent.x + bent.y) * 0.7071068;
  let along = (bent.x - bent.y) * 0.7071068;
  let drift = vec2f(across * (7.0 + flow * 8.0), along * 1.8) / cloudScale;
  let wisps = hazeCloud(drift + seedOffset + vec2f(31.0), softness);
  let bloom = hazeCloud(npos * 8.0 + macroWarp * 2.0 + seedOffset, softness);
  let fine = hazeCloud(npos * 37.0 + seedOffset + macroWarp, 0.45);
  let activity = strength * (0.65 + layering * 0.65);
  let edgeNoise = bloom * activity + fine * activity * (0.16 + 0.23 * (1.0 - softness));
  let field = bent + vec2f(wisps, -wisps) * flow * (0.08 + 0.22 * strength);

  // Light underpainting is derived from the editable pigments, not fixed white.
  var ground = mix(apricot, golden, 0.24);
  if (preset == 1) { ground = mix(coral, golden, 0.56); }
  if (preset == 2) { ground = mix(apricot, coral, 0.65); }
  let groundRgb = mix(ground.rgb, vec3f(1.0, 0.985, 0.97), 0.18);
  var paint = vec4f(groundRgb * ground.a, ground.a);

  if (preset == 2) {
    // Broad yellow/blue diagonal with a muted mixing body, broken by dry wisps.
    let front = across + 0.10 * sin(along * 3.4 + seed * 0.13) +
                bloom * strength * 0.32 + wisps * flow * 0.34;
    let yellowBody = 1.0 - smoothstep(-0.54, 0.24, front);
    let blueBody = smoothstep(-0.18, 0.65, front);
    paint = glaze(paint, golden, yellowBody * 0.93);
    paint = glaze(paint, coral, blueBody * 0.91);
    let mixingBody = exp(-pow((front + 0.06) / 0.39, 2.0));
    paint = glaze(paint, apricot, mixingBody * (0.52 + bloom * activity));
    let pulled = hazeCloud(vec2f(across * 24.0, along * 2.3) / cloudScale + seedOffset, softness);
    let dragged = exp(-pow((front - 0.08 - pulled * 0.46) / 0.23, 2.0));
    paint = glaze(paint, mix(apricot, coral, 0.72), dragged * (0.12 + 0.36 * layering) *
                  clamp(0.65 + pulled + fine * strength, 0.0, 1.0));
  }

  // Nine deliberately placed overlapping deposits; each preset changes geometry,
  // recurrence, transparency and stroke direction, not only endpoint colors.
  for (var i = 0; i < 9; i = i + 1) {
    var center = vec2f(0.0);
    var radii = vec2f(0.6);
    var turn = 0.0;
    var pigment = apricot;
    var opacity = 0.65;
    if (preset == 0) {
      if (i == 0) { center = vec2f(-0.48, -0.31); radii = vec2f(0.94, 0.70); turn = 0.45; }
      if (i == 1) { center = vec2f(0.43, -0.43); radii = vec2f(0.80, 0.72); pigment = coral; }
      if (i == 2) { center = vec2f(-0.34, 0.64); radii = vec2f(0.99, 0.58); pigment = golden; turn = 0.25; opacity = 0.79; }
      if (i == 3) { center = vec2f(0.26, 0.02); radii = vec2f(0.44, 0.62); pigment = coral; turn = -0.55; opacity = 0.46; }
      if (i == 4) { center = vec2f(-0.52, 0.03); radii = vec2f(0.34, 0.67); pigment = golden; turn = -0.4; opacity = 0.48; }
      if (i == 5) { center = vec2f(0.60, 0.51); radii = vec2f(0.56, 0.31); turn = 0.62; opacity = 0.51; }
      if (i == 6) { center = vec2f(-0.10, 0.20); radii = vec2f(0.67, 0.22); turn = 0.7; opacity = 0.44; }
      if (i == 7) { center = vec2f(0.20, 0.73); radii = vec2f(0.66, 0.40); pigment = golden; opacity = 0.64; }
      if (i == 8) { center = vec2f(0.70, -0.04); radii = vec2f(0.38, 0.68); pigment = coral; turn = -0.3; opacity = 0.48; }
    } else if (preset == 1) {
      if (i == 0) { center = vec2f(-0.60, -0.25); radii = vec2f(0.65, 0.96); pigment = apricot; opacity = 0.83; turn = 0.25; }
      if (i == 1) { center = vec2f(0.13, -0.50); radii = vec2f(0.72, 0.43); pigment = coral; turn = -0.55; }
      if (i == 2) { center = vec2f(0.52, 0.12); radii = vec2f(0.62, 0.63); pigment = golden; opacity = 0.84; }
      if (i == 3) { center = vec2f(-0.14, 0.12); radii = vec2f(0.35, 0.83); pigment = coral; turn = -0.75; opacity = 0.49; }
      if (i == 4) { center = vec2f(-0.43, 0.65); radii = vec2f(0.69, 0.32); pigment = golden; turn = -0.65; opacity = 0.67; }
      if (i == 5) { center = vec2f(0.69, 0.69); radii = vec2f(0.70, 0.32); pigment = coral; turn = -0.62; opacity = 0.80; }
      if (i == 6) { center = vec2f(-0.59, 0.04); radii = vec2f(0.22, 0.58); pigment = apricot; turn = -0.6; opacity = 0.56; }
      if (i == 7) { center = vec2f(0.29, 0.38); radii = vec2f(0.24, 0.74); pigment = golden; turn = -0.8; opacity = 0.49; }
      if (i == 8) { center = vec2f(-0.06, 0.53); radii = vec2f(0.36, 0.19); pigment = coral; turn = -0.6; opacity = 0.25; }
    } else {
      let index = f32(i);
      center = vec2f(-0.54 + index * 0.14, 0.37 - index * 0.10);
      center = center + vec2f(hazeHash(vec2f(index, seed)), hazeHash(vec2f(seed, index))) * 0.24 - 0.12;
      radii = vec2f(0.63 + 0.20 * hazeHash(vec2f(index + 4.0, seed)), 0.075 + 0.08 * hazeHash(vec2f(seed, index + 3.0)));
      turn = -0.80;
      pigment = mix(apricot, coral, 0.48);
      if (i == 1 || i == 5) { pigment = golden; center = center - vec2f(0.24); }
      if (i == 3 || i == 7) { pigment = coral; center = center + vec2f(0.21); }
      opacity = 0.13 + layering * 0.18;
    }
    let index = f32(i);
    let layerNoise = hazeCloud(npos * (5.0 + index * 0.31) + seedOffset + vec2f(index * 9.7, index * 3.9), softness);
    let feather = edgeNoise + layerNoise * activity * 0.48 + wisps * flow * 0.12;
    let deposit = washMask(field, center, radii, turn, feather, softness);
    let thickness = clamp(0.76 + layerNoise * (0.48 + strength) + fine * activity * 0.22, 0.12, 1.15);
    paint = glaze(paint, pigment, deposit * opacity * thickness * (0.64 + layering * 0.58));
  }

  // Small uneven areas of diluted binder open the composition; not a vignette.
  let breathing = washMask(field, select(vec2f(-0.23, -0.12), vec2f(0.43, 0.03), preset == 1),
                            vec2f(0.24, 0.63), -0.66, bloom * activity, softness);
  let lightPigment = vec4f(mix(groundRgb, vec3f(1.0, 0.99, 0.97), 0.32), ground.a);
  paint = glaze(paint, lightPigment, breathing * (0.10 + layering * 0.12));
  let renderScale = max(u.frameData.w, 0.001);
  let size = max(u.grainSize.x, 0.25);
  let grainPos = uv * dims / (renderScale * size);
  let grain = hazeNoise(grainPos + seedOffset * 3.1) - 0.5;
  let grainVisible = smoothstep(0.25, 1.0, size * renderScale);
  let microVisible = smoothstep(0.8, 1.8, size * renderScale);
  let micro = hazeHash(floor(grainPos * 1.71) + seedOffset) - 0.5;
  // Granulation darkens deposited pigment and opens small paper flecks, with
  // coverage-dependent amplitude. No blanket white-noise layer.
  let tooth = (grain * grainVisible * 0.8 + micro * microVisible * 0.2);
  let granulation = (fine * strength * 0.042 + tooth * u.grainStrength.x * 0.105) *
                    (0.57 + 0.7 * abs(bloom) + 0.35 * abs(wisps));
  let straight = paint.rgb / max(paint.a, 0.00001);
  let rgb = clamp(straight + granulation * (vec3f(0.34) + (1.0 - straight) * 0.68), vec3f(0.0), vec3f(1.0));
  return vec4f(rgb, paint.a);
}
`;

/**
 * The uniform values the parameters alone decide, in the order the struct
 * declares them. The first four are the frame's — time, size and render scale —
 * and are written by `render`; the eighth and ninth describe an input image,
 * which a fill does not have.
 */
const uniformsOf = (params: HazeParams): Float32Array => {
  const { apricot, coral, fieldLayout: field, golden } = params;
  const values = new Float32Array(uniformSize);

  // One vector at a time, in the order the struct above declares them, so the block
  // can be read against the WGSL. The first two hold the frame and an input image;
  // `render` writes the frame's.
  values.set([0, 1, 1, 1], 0);
  values.set([1, 1, 0, 0], 4);
  values.set([coral.r, coral.g, coral.b, coral.a], 8);
  values.set([apricot.r, apricot.g, apricot.b, apricot.a], 12);
  values.set([golden.r, golden.g, golden.b, golden.a], 16);
  values.set([field.x, field.y, field.radius, field.angle], 20);
  values[24] = params.cloudStrength;
  values[28] = params.cloudScale;
  values[32] = params.cloudSoftness;
  values[36] = params.grainStrength;
  values[40] = params.grainSize;
  values[44] = params.seed;
  values.set([params.preset, params.flow, params.layering, 0], 48);

  return values;
};

/**
 * The pipeline the fill is drawn with, created the first time a target of this
 * format is rendered into and kept after that: the runtime's two targets share a
 * format, so this runs once per fill in practice.
 */
const pipelineOf = (
  device: GPUDevice,
  resources: Resources,
  format: GPUTextureFormat,
): GPURenderPipeline => {
  if (resources.pipeline !== null && resources.pipelineFormat === format) {
    return resources.pipeline;
  }

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: resources.module,
      entryPoint: "vs_main",
      buffers: [
        {
          arrayStride: 16,
          attributes: [
            { shaderLocation: 0, format: "float32x2", offset: 0 },
            { shaderLocation: 1, format: "float32x2", offset: 8 },
          ],
        },
      ],
    },
    fragment: {
      module: resources.module,
      entryPoint: "fs_main",
      targets: [{ format }],
    },
    primitive: { topology: "triangle-list" },
  });

  resources.pipeline = pipeline;
  resources.pipelineFormat = format;

  return pipeline;
};

/**
 * The fill, as a shader the runtime can draw: the export's drawing, drawn into a
 * target of the runtime's choosing with the parameters given here.
 *
 * **When to use**
 *
 * Build one per set of parameters and keep it — pass the same object on every
 * render, and a new one only when the parameters change, since a new object is
 * what makes the runtime set the shader up again.
 *
 * **Example**
 *
 * ```tsx
 * const shader = apricotHaze({
 *   coral: { r: 1, g: 0.565, b: 0.548, a: 1 },
 *   // …the rest of the pigments and the field
 *   preset: 0,
 * })
 * <ShaderFill shader={shader} className="absolute inset-0" />
 * ```
 */
export const apricotHaze = (params: HazeParams): Shader => ({
  manifest,
  params,
  setup: (device, frame) => {
    const uniforms = uniformsOf(params);

    const quad = device.createBuffer({
      size: quadVertices.length * 4,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });

    new Float32Array(quad.getMappedRange()).set(quadVertices);
    quad.unmap();

    resourcesOf.set(frame.state, {
      module: device.createShaderModule({ code: wgsl }),
      pipeline: null,
      pipelineFormat: null,
      quad,
      uniform: device.createBuffer({
        size: uniforms.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
      uniforms,
    });
  },
  render: (device, frame) => {
    const output = frame.output;
    const resources = resourcesOf.get(frame.state);

    if (output === null || resources === undefined) {
      return;
    }

    // SAFETY: the runtime draws into its own textures and annotates them with the
    // device-pixel size beside the logical width it leaves on `GPUTexture`; the
    // two are set together in its `makeDpiIndependent`. The grain is drawn at the
    // device-pixel size so it keeps the density it has in the design.
    const size = output as GPUTexture & {
      physicalWidth: number;
      physicalHeight: number;
    };

    resources.uniforms.set(
      [
        frame.time,
        Math.max(1, size.physicalWidth),
        Math.max(1, size.physicalHeight),
        frame.renderScale,
      ],
      0,
    );
    device.queue.writeBuffer(resources.uniform, 0, resources.uniforms);

    const pipeline = pipelineOf(device, resources, output.format);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: resources.uniform } }],
    });

    const encoder = device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: output.createView(),
          loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: "store",
        },
      ],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, resources.quad);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
  },
});
