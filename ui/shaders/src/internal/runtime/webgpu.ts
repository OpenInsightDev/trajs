import { useEffect, useState } from 'react'

// Module-level singleton. Acquiring a GPUDevice is expensive and a single device can
// back every ShaderEffect on the page, so we acquire it once and hand the same promise
// to all callers rather than one device per component.
let devicePromise: Promise<GPUDevice> | null = null

// Requests the adapter and device on first call and caches the promise. On failure the
// cache is cleared so a later mount can retry.
function acquireDevice(): Promise<GPUDevice> {
  if (!devicePromise) {
    const pending = (async () => {
      const gpu = navigator.gpu
      if (!gpu) {
        throw new Error('WebGPU unsupported.')
      }
      const adapter = await gpu.requestAdapter()
      if (!adapter) {
        throw new Error('Failed to get WebGPU adapter.')
      }
      const device = await adapter.requestDevice()
      void device.lost.then(() => {
        if (devicePromise === pending) {
          devicePromise = null
        }
      })
      return device
    })()
    devicePromise = pending
    void pending.catch(() => {
      if (devicePromise === pending) {
        devicePromise = null
      }
    })
  }
  return devicePromise
}

/**
 * Shares one WebGPU device across every ShaderEffect. The device is initialized once and
 * reused until lost. Mounted effects fall back on loss; a later mount acquires a new device.
 * Returns the device once ready (null until then) and any acquisition error.
 */
export function useWebGPUDevice(): { device: GPUDevice | null; error: Error | null } {
  const [device, setDevice] = useState<GPUDevice | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    void acquireDevice().then(
      (acquired) => {
        if (!cancelled) {
          setDevice(acquired)
          void acquired.lost.then((info) => {
            if (cancelled) {
              return
            }
            setDevice(null)
            setError(new Error(`WebGPU device lost: ${info.message || info.reason}`))
          })
        }
      },
      (e) => {
        if (!cancelled) {
          console.warn('Failed to acquire WebGPU device', e)
          setError(e instanceof Error ? e : new Error(String(e)))
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return { device, error }
}
