import { useEffect, useState } from 'react'

// Strip out potential url("...") wrappers.
function extractRawMaskUrl(maskUrl: string): string | null {
  const trimmed = maskUrl.trim()

  // Already a plain URL / data URI — no url() wrapper
  if (!trimmed.startsWith('url(')) {
    return trimmed
  }

  // Strip url( ... ) — last ) is the wrapper, not part of the value
  const inner = trimmed.slice(4, -1).trim()

  // Strip optional surrounding quotes (single or double)
  if (
    (inner.startsWith('"') && inner.endsWith('"')) ||
    (inner.startsWith("'") && inner.endsWith("'"))
  ) {
    return inner.slice(1, -1)
  }

  return inner
}

/**
 * React hook to process the SVG mask url(...) and ensure it gives
 * a correct alpha mask for custom fills.
 */
export function useProcessMaskUrl(maskUrl: string | undefined): string | null {
  const [processed, setProcessed] = useState<{ source: string; url: string } | null>(null)

  useEffect(() => {
    const rawMaskUrl = maskUrl && extractRawMaskUrl(maskUrl)

    if (!rawMaskUrl) {
      return
    }

    let cancelled = false
    const controller = new AbortController()

    async function fetchAndTransform() {
      const response = await fetch(rawMaskUrl as string, { signal: controller.signal })
      if (!response.ok) {throw new Error(`Failed to load mask: ${response.status}`)}
      const mask = await response.text()

      // Parse SVG and add a top-level fill:black !important so we can
      // use it as an alpha mask correctly.
      const parser = new DOMParser()
      const svgDoc = parser.parseFromString(mask, 'image/svg+xml')
      const style = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style')
      style.textContent = '* { fill: black !important; }'
      const svgElement = svgDoc.querySelector('svg')
      if (!svgElement || svgDoc.querySelector('parsererror')) {
        throw new Error('Invalid SVG mask')
      }
      svgElement.appendChild(style)

      const serializer = new XMLSerializer()
      const uriComponent = encodeURIComponent(serializer.serializeToString(svgElement))
      return `url("data:image/svg+xml,${uriComponent}")`
    }

    void fetchAndTransform().then((result) => {
      if (cancelled) {
        return
      }
      setProcessed({ source: maskUrl!, url: result })
    }).catch((error: unknown) => {
      if (!cancelled) {
        setProcessed(null)
        console.warn('Failed to process mask', error)
      }
    })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [maskUrl])

  return maskUrl && processed?.source === maskUrl ? processed.url : null
}
