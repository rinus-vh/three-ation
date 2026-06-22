// Simple, dependency-free background removal.
//
// Strategy: the input photos we target (see supavoxel-style examples) sit on a
// reasonably uniform backdrop. We sample the colour around the image border,
// then flood-fill inward from every border pixel, consuming any pixel whose
// colour is close to that border reference. Whatever the flood never reaches is
// treated as foreground (the object). This is intentionally cheap — no model,
// no async — and works well on clean / solid / softly-graded backgrounds.

/**
 * @param {ImageData} imageData
 * @param {{ tolerance?: number }} [options]
 *   tolerance — 0..1, how aggressively border-similar colours are removed.
 * @returns {{ mask: Uint8Array, width: number, height: number }}
 *   mask[i] === 1 → foreground, 0 → background. Length = width * height.
 */
export function removeBackground(imageData, { tolerance = 0.18 } = {}) {
  const { data, width, height } = imageData
  const n = width * height

  // Reference background colour = average of the border ring.
  let br = 0, bg = 0, bb = 0, count = 0
  function sampleBorder(x, y) {
    const i = (y * width + x) * 4
    br += data[i]; bg += data[i + 1]; bb += data[i + 2]; count++
  }
  for (let x = 0; x < width; x++) { sampleBorder(x, 0); sampleBorder(x, height - 1) }
  for (let y = 0; y < height; y++) { sampleBorder(0, y); sampleBorder(width - 1, y) }
  br /= count; bg /= count; bb /= count

  // Colour distance threshold in 0..255 space (255*sqrt(3) is the max distance).
  const threshold = tolerance * 441.67

  const isBackground = new Uint8Array(n) // 1 once flood-filled as background
  const visited = new Uint8Array(n)
  const stack = new Int32Array(n)
  let sp = 0

  function similarToBackground(idx) {
    const i = idx * 4
    const dr = data[i] - br
    const dg = data[i + 1] - bg
    const db = data[i + 2] - bb
    return Math.sqrt(dr * dr + dg * dg + db * db) <= threshold
  }

  // Seed the flood from every border pixel that looks like background.
  function seed(idx) {
    if (visited[idx]) return
    visited[idx] = 1
    if (similarToBackground(idx)) { isBackground[idx] = 1; stack[sp++] = idx }
  }
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x) }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1) }

  // 4-connected flood fill.
  while (sp > 0) {
    const idx = stack[--sp]
    const x = idx % width
    const y = (idx - x) / width
    const neighbours = [
      x > 0 ? idx - 1 : -1,
      x < width - 1 ? idx + 1 : -1,
      y > 0 ? idx - width : -1,
      y < height - 1 ? idx + width : -1,
    ]
    for (const nIdx of neighbours) {
      if (nIdx < 0 || visited[nIdx]) continue
      visited[nIdx] = 1
      if (similarToBackground(nIdx)) { isBackground[nIdx] = 1; stack[sp++] = nIdx }
    }
  }

  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = isBackground[i] ? 0 : 1

  return { mask, width, height }
}

/**
 * Build an RGBA cutout canvas (background pixels → transparent) for use as a
 * texture and as the input-panel preview.
 *
 * @param {ImageData} imageData
 * @param {Uint8Array} mask
 * @returns {HTMLCanvasElement}
 */
export function maskToCutoutCanvas(imageData, mask) {
  const { width, height } = imageData
  const out = new ImageData(width, height)
  for (let i = 0; i < width * height; i++) {
    const j = i * 4
    out.data[j] = imageData.data[j]
    out.data[j + 1] = imageData.data[j + 1]
    out.data[j + 2] = imageData.data[j + 2]
    out.data[j + 3] = mask[i] ? 255 : 0
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').putImageData(out, 0, 0)
  return canvas
}
