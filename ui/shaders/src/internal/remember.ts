/**
 * A shader factory that hands back the same `Shader` for the same parameters
 * object.
 *
 * The runtime sets a fill up — compiles its module, allocates its buffers —
 * whenever it is handed a different object, so a factory called while a
 * component renders would set the fill up on every frame. The map is per
 * factory, so two fills never share the GPU resources `setup` puts on a frame's
 * state.
 */

import type { Shader } from "#/internal/runtime/index.ts";

export const remembered = <P extends object>(build: (params: P) => Shader) => {
  const shaders = new WeakMap<P, Shader>();

  return (params: P): Shader => {
    const remembered = shaders.get(params);

    if (remembered !== undefined) {
      return remembered;
    }

    const shader = build(params);

    shaders.set(params, shader);

    return shader;
  };
};
