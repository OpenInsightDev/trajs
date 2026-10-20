/**
 * What a fill is, as the runtime draws one: the `setup`/`render` pair a Figma
 * shader export is written as, the parameters it is drawn from, and the manifest
 * that says whether it moves and whether it reads the pointer.
 *
 * **When to use**
 *
 * As the type of a fill: every build of every effect in this package returns one
 * — `Haze.still(…)`, `Haze.drift(…)` — and {@link ShaderFill} draws one.
 *
 * **Details**
 *
 * It is the vendored runtime's own shape rather than a package-specific one, so a
 * shader exported from Figma keeps the module it was written as, and an effect
 * written outside this package is handed to {@link ShaderFill} without an
 * adapter.
 *
 * **Example**
 *
 * ```tsx
 * import { Haze, type Shader, ShaderFill } from "@trajs/ui-shaders";
 *
 * const fill: Shader = Haze.drift(Haze.presets.iris);
 *
 * <ShaderFill shader={fill} />;
 * ```
 *
 * @see {@link ShaderFill} — draw a fill
 */

export type { Manifest, Shader } from "#/internal/runtime/index.ts";
