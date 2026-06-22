const SERVER = 'http://127.0.0.1:8765'

/**
 * Returns { ok: boolean, capabilities: string[] }.
 * capabilities lists which pipeline stages the server has loaded,
 * e.g. ['depth', 'reconstruct'].
 */
export async function checkServer() {
  try {
    const res = await fetch(`${SERVER}/health`, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return { ok: false, capabilities: [] }
    const data = await res.json()
    return { ok: true, capabilities: data.capabilities ?? [] }
  } catch {
    return { ok: false, capabilities: [] }
  }
}

/**
 * Run depth estimation via the local server.
 *
 * Fires onProgress:
 *   { phase: 'depth', progress: 0 }   — request sent
 *   { phase: 'depth', progress: 100 } — response received
 *
 * Returns rawDepth where LARGER = FARTHER (Z distance), range 0.5–10.5.
 */
export async function estimateDepth(imageData, { onProgress } = {}) {
  onProgress?.({ phase: 'depth', progress: 0 })

  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d').putImageData(imageData, 0, 0)

  const imageB64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1]

  const res = await fetch(`${SERVER}/depth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageB64 }),
  })

  if (!res.ok) throw new Error(`Depth server responded ${res.status}`)

  const data = await res.json()

  const binaryStr = atob(data.depth_b64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
  const normDepth = new Float32Array(bytes.buffer)

  // Convert normalised depth (1=closest) to Z distance (larger=farther).
  const rawDepth = new Float32Array(normDepth.length)
  for (let i = 0; i < normDepth.length; i++) {
    rawDepth[i] = (1.0 - normDepth[i]) * 10.0 + 0.5
  }

  onProgress?.({ phase: 'depth', progress: 100 })

  return { rawDepth, width: data.width, height: data.height }
}
