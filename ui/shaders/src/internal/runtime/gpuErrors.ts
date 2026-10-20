/** Scopes must be popped synchronously: the device is shared by multiple canvases. */
export function beginGpuErrorScope(device: GPUDevice, onError: (error: Error) => void): () => void {
  device.pushErrorScope('internal')
  device.pushErrorScope('out-of-memory')
  device.pushErrorScope('validation')
  return () => {
    const results = [device.popErrorScope(), device.popErrorScope(), device.popErrorScope()]
    void Promise.all(results).then((errors) => {
      const error = errors.find((value) => value !== null)
      if (error) {
        onError(new Error(error.message))
      }
    }, (error: unknown) => {
      onError(error instanceof Error ? error : new Error(String(error)))
    })
  }
}
