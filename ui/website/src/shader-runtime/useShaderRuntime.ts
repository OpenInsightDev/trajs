import { useEffect, useRef, useState, type RefObject } from 'react'

import type {
  CustomEffectState,
  Shader,
  GpuState,
  HtmlInCanvasElement,
  HtmlInCanvasQueue,
  Manifest,
  MousePosition,
  PaintEvent,
  ShaderData,
} from './types'
import { useWebGPUDevice } from './webgpu'
import { beginGpuErrorScope } from './gpuErrors'
import { getRenderSize } from './renderSize'

export type DpiGPUTexture = GPUTexture & {
  dpi: number
  physicalWidth: number
  physicalHeight: number
}

function makeDpiIndependent(
  texture: GPUTexture,
  dpi: number,
  logicalWidth: number,
  logicalHeight: number,
) {
  // If texture is already a DpiGPUTexture, then this is a no-op.
  const dpiTexture = texture as Partial<DpiGPUTexture>
  if (dpiTexture.physicalWidth !== undefined && dpiTexture.physicalHeight !== undefined) {
    return texture as DpiGPUTexture
  }

  const physicalWidth = texture.width
  const physicalHeight = texture.height

  Object.defineProperty(texture, 'width', {
    value: logicalWidth,
    writable: false,
    configurable: true,
    enumerable: true,
  })
  Object.defineProperty(texture, 'height', {
    value: logicalHeight,
    writable: false,
    configurable: true,
    enumerable: true,
  })

  const result = texture as DpiGPUTexture
  result.dpi = dpi
  result.physicalWidth = physicalWidth
  result.physicalHeight = physicalHeight

  return result
}

class RuntimeState {
  generation = 0
  gpu: GpuState
  input: DpiGPUTexture | null
  output: DpiGPUTexture | null = null
  shaderData: ShaderData[] = []
  // An array of 2 textures that we alternate between for rendering multiple shaders
  // in sequence.
  intermediateTextures: DpiGPUTexture[] = []

  _time = 0
  _deltaTime = 0
  _frame = 0
  _mousePosition: MousePosition = { x: 0, y: 0, down: false }

  // Driven by each shader's manifest (see DEFAULT_MANIFEST); set when effects are applied.
  isAnimated = false
  usesMouse = false

  constructor(gpu: GpuState, input: DpiGPUTexture | null) {
    this.gpu = gpu
    this.input = input
  }

  getShaderState(index: number): CustomEffectState {
    return {
      gpu: this.gpu,
      input: index === 0 ? this.input : this.intermediateTextures[index % 2]!,
      output:
        index === this.shaderData.length - 1
          ? this.output
          : this.intermediateTextures[(index + 1) % 2]!,
      time: this._time,
      deltaTime: this._deltaTime,
      frame: this._frame,
      mousePosition: this._mousePosition,
      renderScale: 1,
      params: this.shaderData[index]!.shader.params,
      state: this.shaderData[index]!.state,
    }
  }

  createIntermediateTexture(input: DpiGPUTexture): DpiGPUTexture {
    const { width, height, physicalWidth, physicalHeight, dpi } = input
    return makeDpiIndependent(
      this.gpu.device.createTexture({
        size: [physicalWidth, physicalHeight, 1],
        format: this.gpu.format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
      }),
      dpi,
      width,
      height,
    )
  }

  // This is a no-op if input is null or if the input texture dimensions already matches the
  // existing intermediate texture dimensions.
  updateIntermediateTextures() {
    if (!this.input) {
      return
    }

    const { width, height, physicalWidth, physicalHeight, dpi } = this.input
    const currentIntermediateTextures = this.intermediateTextures

    // Do not recreate intermediate textures if canvas size hasn't changed.
    if (
      currentIntermediateTextures[0]?.width === width &&
      currentIntermediateTextures[0]?.height === height &&
      currentIntermediateTextures[0]?.physicalWidth === physicalWidth &&
      currentIntermediateTextures[0]?.physicalHeight === physicalHeight &&
      currentIntermediateTextures[0]?.dpi === dpi
    ) {
      return
    }

    this.intermediateTextures.forEach((texture) => {
      texture.destroy()
    })
    this.intermediateTextures = [
      this.createIntermediateTexture(this.input),
      this.createIntermediateTexture(this.input),
    ]
  }
}

export const DEFAULT_MANIFEST: Manifest = {
  version: 2,
  isAnimated: false,
  usesMouse: false,
  name: '',
}

// Wrapper function to accomodate queue.copyElementImageToTexture API changes.
// See https://github.com/WICG/html-in-canvas/issues/132.
function copyElementImageToInputTexture(content: Element, runtime: RuntimeState) {
  if (!runtime.input) {
    throw new Error('Cannot copy to null input texture')
  }
  const queue: HtmlInCanvasQueue = runtime.gpu.device.queue as unknown as HtmlInCanvasQueue
  try {
    queue.copyElementImageToTexture(
      { source: content },
      {
        destination: { texture: runtime.input },
        width: runtime.input.physicalWidth,
        height: runtime.input.physicalHeight,
      },
    )
  } catch {
    const legacyQueue = queue as unknown as {
      copyElementImageToTexture: (
        content: Element,
        width: number,
        height: number,
        destination: { texture: GPUTexture },
      ) => void
    }
    legacyQueue.copyElementImageToTexture(
      content,
      runtime.input.physicalWidth,
      runtime.input.physicalHeight,
      {
        texture: runtime.input,
      },
    )
  }
}

/**
 * Drives the WebGPU render loop for a stack of shader effects against a single canvas. Shared
 * by ShaderEffect (optionally with a rasterized DOM subtree) and ShaderFill (procedural only).
 * - canvas / contentRef: the render target and, when hasChildren, the subtree to rasterize
 * - shaders / hasChildren: the effect chain and whether an input texture is sourced from the DOM
 */
export function useShaderRuntime({
  canvas,
  shaders,
  hasChildren,
  contentRef,
}: {
  canvas: HtmlInCanvasElement | null
  shaders: Shader[]
  hasChildren: boolean
  contentRef?: RefObject<HTMLDivElement | null>
}): { error: Error | null } {
  const runtimeRef = useRef<RuntimeState | null>(null)
  const setupCompleteRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const renderCoreRef = useRef<() => void>(() => {})
  const startClockRef = useRef<() => void>(() => {})
  const stopClockRef = useRef<() => void>(() => {})
  const schedulePaintRef = useRef<() => void>(() => {})
  const isDirtiedRef = useRef(true)
  // The shared WebGPU device is initialized once and reused across every effect.
  const { device, error: deviceError } = useWebGPUDevice()
  // GPU validation/allocation failures latch the fallback; DOM copy exceptions can retry.
  const [error, setError] = useState<Error | null>(null)
  const [deviceReady, setDeviceReady] = useState(false)

  useEffect(() => {
    startClockRef.current = () => {
      if (rafRef.current != null) {
        return
      }
      lastTsRef.current = null
      const tick = (ts: number) => {
        const runtime = runtimeRef.current
        if (!runtime) {
          rafRef.current = null
          return
        }
        rafRef.current = requestAnimationFrame(tick)
        runtime._deltaTime = lastTsRef.current == null ? 0 : ts - lastTsRef.current
        lastTsRef.current = ts
        runtime._time += runtime._deltaTime
        runtime._frame += 1
        schedulePaintRef.current()
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    stopClockRef.current = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      lastTsRef.current = null
    }

    schedulePaintRef.current = () => {
      if (hasChildren) {
        canvas?.requestPaint()
      } else {
        renderCoreRef.current()
      }
    }

    renderCoreRef.current = () => {
      // Skip until the current effect's setup() has completed. Otherwise an early paint
      // (e.g. from a params-sync requestPaint() before the setup useEffect has run, or
      // immediately after an effect swap) would call render() against an uninitialized
      // pipeline state.
      if (!setupCompleteRef.current) {
        return
      }
      const runtime = runtimeRef.current
      if (!runtime || !runtime.input) {
        return
      }
      const content = contentRef?.current ?? null
      if (hasChildren && !content) {
        return
      }
      const generation = runtime.generation
      const finish = beginGpuErrorScope(runtime.gpu.device, (error) => {
        if (runtimeRef.current !== runtime || runtime.generation !== generation) {
          return
        }
        setupCompleteRef.current = false
        stopClockRef.current()
        setError(error)
      })
      try {
        if (hasChildren && content && isDirtiedRef.current) {
          copyElementImageToInputTexture(content, runtime)
          isDirtiedRef.current = false
        }
        runtime.updateIntermediateTextures()
        const dpi = runtime.input.dpi
        const outputTexture = runtime.gpu.context.getCurrentTexture()
        const logicalWidth = runtime.input.width
        const logicalHeight = runtime.input.height
        runtime.output = makeDpiIndependent(outputTexture, dpi, logicalWidth, logicalHeight)
        shaders.forEach((effect, idx) => {
          effect.render(runtime.gpu.device, runtime.getShaderState(idx))
        })
      } catch (e) {
        // Render-path failures are treated as transient — e.g. "No cached paint record
        // for element" on the very first paint before the browser has produced a paint
        // record for the content subtree, or a briefly detached element. The next paint
        // typically succeeds, so we log and continue rather than latching the error.
        console.warn('Failed to render effect', e)
        return
      } finally {
        finish()
      }
      if (runtime.isAnimated) {
        startClockRef.current()
      } else {
        stopClockRef.current()
      }
    }
  })

  // Configure the canvas context and allocate the input texture against the shared device.
  // Survives effect swaps; re-runs when the canvas or device changes.
  useEffect(() => {
    if (!canvas || !device) {
      return
    }
    let input: DpiGPUTexture | null = null
    let cancelled = false
    const finish = beginGpuErrorScope(device, (error) => {
      if (!cancelled) {
        setError(error)
      }
    })
    try {
      const context = canvas.getContext('webgpu')
      if (!context) {
        throw new Error('Failed to get WebGPU context.')
      }

      // Check for HTML-in-Canvas support by seeing if copyElementImageToTexture() exists.
      // Only required when there are children to copy into the input texture; pure-GPU
      // effects with no DOM content leave the input as an empty (zeroed) texture.
      if (hasChildren && !('copyElementImageToTexture' in device.queue)) {
        throw new Error('HTML-in-Canvas is not supported.')
      }

      const format: GPUTextureFormat = 'rgba8unorm'
      context.configure({ device, format, alphaMode: 'premultiplied' })
      const size = getRenderSize(
        canvas.clientWidth,
        canvas.clientHeight,
        window.devicePixelRatio,
        device.limits.maxTextureDimension2D,
      )
      canvas.width = size.width
      canvas.height = size.height
      const { logicalWidth, logicalHeight, dpi } = size
      // RENDER_ATTACHMENT is mandatory on the destination of
      // copyElementImageToTexture in Chrome's HiC implementation. Without it,
      // the call doesn't throw but silently writes nothing — the texture
      // stays zeroed. (Dawn emits "Destination texture needs to have CopyDst
      // and RenderAttachment usage." as a warning, but no exception.)

      input = makeDpiIndependent(
        device.createTexture({
          size: [canvas.width, canvas.height, 1],
          format,
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        }),
        dpi,
        logicalWidth,
        logicalHeight,
      )

      runtimeRef.current = new RuntimeState({ device, context, format }, input)
      isDirtiedRef.current = true
      setDeviceReady(true)
    } catch (e) {
      // Destroy the input texture if it was created before the throw. The shared device is
      // owned by useWebGPUDevice and is intentionally left alive.
      input?.destroy()
      console.warn('Failed to initialize shader runtime', e)
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      finish()
    }

    return () => {
      cancelled = true
      stopClockRef.current()
      const runtime = runtimeRef.current
      if (runtime) {
        runtime.input?.destroy()
        for (const texture of runtime.intermediateTextures) {
          texture.destroy()
        }
        runtimeRef.current = null
      }
      setDeviceReady(false)
    }
  }, [canvas, hasChildren, device])

  // Run effect-specific setup. Resets per-effect bookkeeping but keeps the device.
  // setupCompleteRef gates onpaint so render() can never observe a half-initialized
  // effect (e.g. between an effect swap and its setup running).
  useEffect(() => {
    if (!deviceReady) {
      return
    }
    const runtime = runtimeRef.current
    if (!runtime) {
      return
    }
    setupCompleteRef.current = false
    stopClockRef.current()
    runtime._time = 0
    runtime._deltaTime = 0
    runtime._frame = 0
    runtime.output = null
    // Animation and mouse wiring are declared by each shader's manifest, not probed at runtime.
    runtime.isAnimated = shaders.some((effect) => (effect.manifest ?? DEFAULT_MANIFEST).isAnimated)
    runtime.usesMouse = shaders.some((effect) => (effect.manifest ?? DEFAULT_MANIFEST).usesMouse)
    runtime.shaderData = shaders.map((effect) => {
      return {
        shader: effect,
        state: {},
      }
    })
    const generation = ++runtime.generation
    const finish = beginGpuErrorScope(runtime.gpu.device, (error) => {
      if (runtimeRef.current !== runtime || runtime.generation !== generation) {
        return
      }
      setupCompleteRef.current = false
      stopClockRef.current()
      setError(error)
    })
    try {
      runtime.updateIntermediateTextures()
      shaders.forEach((effect, idx) => {
        effect.setup(runtime.gpu.device, runtime.getShaderState(idx))
      })
      setupCompleteRef.current = true
      schedulePaintRef.current()
    } catch (e) {
      console.warn('Failed to set up effect', e)
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      finish()
    }
    return () => {
      runtime.generation++
      setupCompleteRef.current = false
    }
  }, [shaders, deviceReady, canvas, hasChildren])

  useEffect(() => {
    if (!canvas || !deviceReady || !hasChildren) {
      return
    }
    canvas.onpaint = (event: PaintEvent) => {
      if (event.changedElements.length > 0) {
        isDirtiedRef.current = true
      }
      renderCoreRef.current()
    }
    return () => {
      canvas.onpaint = null
    }
  }, [canvas, deviceReady, hasChildren])

  // Cap the backing store before allocating textures. CSS layout stays full-sized;
  // copyElementImageToTexture scales DOM content into this smaller render target.
  useEffect(() => {
    if (!canvas || !deviceReady) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const runtime = runtimeRef.current
      const entry = entries[0]
      if (!runtime || !entry) {
        return
      }
      const physicalBox = entry.devicePixelContentBoxSize?.[0]
      const width = entry.contentRect.width
      const height = entry.contentRect.height
      const pixelRatio = physicalBox && width > 0 && height > 0
        ? Math.min(physicalBox.inlineSize / width, physicalBox.blockSize / height)
        : window.devicePixelRatio
      const size = getRenderSize(width, height, pixelRatio, runtime.gpu.device.limits.maxTextureDimension2D)
      const previous = runtime.input
      if (
        previous?.physicalWidth === size.width &&
        previous?.physicalHeight === size.height &&
        previous?.width === size.logicalWidth &&
        previous?.height === size.logicalHeight &&
        previous?.dpi === size.dpi
      ) {
        return
      }

      const generation = runtime.generation
      const finish = beginGpuErrorScope(runtime.gpu.device, (error) => {
        if (runtimeRef.current !== runtime || runtime.generation !== generation) {
          return
        }
        setupCompleteRef.current = false
        stopClockRef.current()
        setError(error)
      })
      try {
        // Avoid resetting the context when only the logical size changes.
        if (canvas.width !== size.width) {
          canvas.width = size.width
        }
        if (canvas.height !== size.height) {
          canvas.height = size.height
        }
        previous?.destroy()
        runtime.input = makeDpiIndependent(
          runtime.gpu.device.createTexture({
            size: [size.width, size.height, 1],
            format: runtime.gpu.format,
            usage:
              GPUTextureUsage.TEXTURE_BINDING |
              GPUTextureUsage.COPY_DST |
              GPUTextureUsage.RENDER_ATTACHMENT,
          }),
          size.dpi,
          size.logicalWidth,
          size.logicalHeight,
        )
        isDirtiedRef.current = true
        runtime.updateIntermediateTextures()
        schedulePaintRef.current()
      } catch (e) {
        console.warn('Failed to create texture after resizing', e)
        setError(e instanceof Error ? e : new Error(String(e)))
      } finally {
        finish()
      }
    })
    resizeObserver.observe(canvas, { box: 'device-pixel-content-box' })

    return () => resizeObserver.disconnect()
  }, [canvas, deviceReady, hasChildren])

  useEffect(() => {
    if (!canvas || !deviceReady) {
      return
    }

    const mouseSync = (runtime: RuntimeState, e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      runtime._mousePosition.x = e.clientX - rect.left
      runtime._mousePosition.y = e.clientY - rect.top
    }

    // The rAF clock already repaints animated effects, so only repaint here when
    // it isn't running (a mouse-only, non-animated effect).
    const repaint = () => {
      if (rafRef.current == null) {
        schedulePaintRef.current()
      }
    }

    const onMove = (e: PointerEvent) => {
      const runtime = runtimeRef.current
      if (!runtime || !runtime.usesMouse) {
        return
      }
      mouseSync(runtime, e)
      repaint()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
    }
  }, [canvas, deviceReady, hasChildren])

  return { error: deviceError ?? error }
}
