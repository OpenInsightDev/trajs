// Bound runtime-owned RGBA textures to 64 MiB each, even on high-DPI displays.
const MAX_RENDER_DIMENSION = 4096

export function getRenderSize(
  width: number,
  height: number,
  devicePixelRatio: number,
  maxTextureDimension2D: number,
) {
  const logicalWidth = Number.isFinite(width) && width > 0 ? width : 1
  const logicalHeight = Number.isFinite(height) && height > 0 ? height : 1
  const dpi = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  const limit = Math.max(1, Math.min(MAX_RENDER_DIMENSION, maxTextureDimension2D))
  const scale = Math.min(dpi, limit / logicalWidth, limit / logicalHeight)
  return {
    width: Math.max(1, Math.min(limit, Math.round(logicalWidth * scale))),
    height: Math.max(1, Math.min(limit, Math.round(logicalHeight * scale))),
    logicalWidth,
    logicalHeight,
    dpi: scale,
  }
}
