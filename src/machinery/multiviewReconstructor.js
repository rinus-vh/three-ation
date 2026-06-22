import * as THREE from 'three'

import { estimateDepth } from './depthEstimator.js'
import { resizeImageData } from './resizeImageData.js'

const SERVER = 'http://127.0.0.1:8765'

// Zero123++ v1.2 output poses, row-major 3×2 grid
// Azimuths evenly spaced 30–330°; elevations alternate +20° / −10°
const VIEW_POSES = [
  { az: 30,  el: 20  },  // row 0, col 0
  { az: 90,  el: -10 },  // row 0, col 1
  { az: 150, el: 20  },  // row 0, col 2
  { az: 210, el: -10 },  // row 1, col 0
  { az: 270, el: 20  },  // row 1, col 1
  { az: 330, el: -10 },  // row 1, col 2
]

const DISC_ABS = 2.5
const TARGET_MEDIAN_Z = 5.0

const yieldFrame = () => new Promise(r => setTimeout(r, 0))

/**
 * Multi-view 3D reconstruction using Zero123++ + Depth-Anything.
 *
 * Fires onProgress:
 *   { phase: 'multiview', progress: 0-100 }  — synthesis + depth + mesh build
 *   { phase: 'serving',   progress: 0|100  } — geometry assembly
 *
 * @param {HTMLCanvasElement} cutoutCanvas  RGBA cutout of the subject (full-res)
 * @param {ImageData}         smallImageData  Front view at target resolution
 * @param {Uint8Array}        frontMask       Foreground mask for front view
 * @param {{ onProgress?, resolution? }} options
 * @returns {Promise<{ geometry: THREE.BufferGeometry, texture: THREE.Texture } | null>}
 */
export async function reconstructMultiview(cutoutCanvas, smallImageData, frontMask, { onProgress, resolution = 256 } = {}) {
  // --- Step 1: synthesise 6 novel views via Zero123++ ---
  onProgress?.({ phase: 'multiview', progress: 5 })
  const viewsB64 = await fetchMultiviews(cutoutCanvas)
  onProgress?.({ phase: 'multiview', progress: 30 })

  // --- Step 2: decode views → resize → background mask ---
  const viewImageDatas = await Promise.all(viewsB64.map(b64ToImageData))
  const viewSmall = viewImageDatas.map(d => resizeImageData(d, resolution))
  const viewMasks = viewSmall.map(whiteBackgroundMask)

  // --- Step 3: depth-estimate all 7 views in parallel ---
  onProgress?.({ phase: 'multiview', progress: 35 })
  const [frontDepth, ...viewDepths] = await Promise.all([
    estimateDepth(smallImageData, {}),
    ...viewSmall.map(d => estimateDepth(d, {})),
  ])
  onProgress?.({ phase: 'multiview', progress: 70 })

  // --- Step 4: build world-space meshes and merge ---
  const allPos = []
  const allIdx = []
  let idxOffset = 0

  const views = [
    { depth: frontDepth, mask: frontMask, az: 0, el: 0 },
    ...VIEW_POSES.map(({ az, el }, k) => ({ depth: viewDepths[k], mask: viewMasks[k], az, el })),
  ]

  for (const { depth, mask, az, el } of views) {
    const normDepth = normaliseDepthScale(depth.rawDepth, mask, depth.width, depth.height)
    const { positions, indices } = buildViewMesh(normDepth, mask, depth.width, depth.height, az, el)
    for (const p of positions) allPos.push(p)
    for (const i of indices) allIdx.push(i + idxOffset)
    idxOffset += positions.length / 3
    await yieldFrame()
  }
  onProgress?.({ phase: 'multiview', progress: 90 })

  if (allPos.length === 0) return null

  // --- Step 5: normalise merged point cloud to unit scale ---
  const positions = new Float32Array(allPos)
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i]   < minX) minX = positions[i];   if (positions[i]   > maxX) maxX = positions[i]
    if (positions[i+1] < minY) minY = positions[i+1]; if (positions[i+1] > maxY) maxY = positions[i+1]
    if (positions[i+2] < minZ) minZ = positions[i+2]; if (positions[i+2] > maxZ) maxZ = positions[i+2]
  }
  const cX = (minX + maxX) / 2, cY = (minY + maxY) / 2, cZ = (minZ + maxZ) / 2
  const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 || 1
  for (let i = 0; i < positions.length; i += 3) {
    positions[i]   = (positions[i]   - cX) / ext
    positions[i+1] = (positions[i+1] - cY) / ext
    positions[i+2] = (positions[i+2] - cZ) / ext
  }

  // --- Step 6: UV by front-projection (world X/Y → U/V) ---
  const uvArr = new Float32Array(positions.length / 3 * 2)
  for (let i = 0; i < positions.length / 3; i++) {
    uvArr[i * 2]     = positions[i * 3]     * 0.5 + 0.5
    uvArr[i * 2 + 1] = positions[i * 3 + 1] * 0.5 + 0.5
  }

  // --- Step 7: assemble geometry ---
  onProgress?.({ phase: 'serving', progress: 0 })
  await yieldFrame()

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2))
  geometry.setIndex(allIdx)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const texture = new THREE.CanvasTexture(cutoutCanvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = true

  onProgress?.({ phase: 'serving', progress: 100 })
  return { geometry, texture }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchMultiviews(cutoutCanvas) {
  const imageB64 = cutoutCanvas.toDataURL('image/png').split(',')[1]
  const res = await fetch(`${SERVER}/multiview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageB64 }),
  })
  if (!res.ok) throw new Error(`Multiview server responded ${res.status}`)
  return (await res.json()).views
}

function b64ToImageData(b64) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      canvas.getContext('2d').drawImage(img, 0, 0)
      resolve(canvas.getContext('2d').getImageData(0, 0, img.width, img.height))
    }
    img.onerror = reject
    img.src = 'data:image/png;base64,' + b64
  })
}

// Pixels where all channels > 240 are treated as white background (Zero123++ output)
function whiteBackgroundMask(imageData) {
  const { data, width, height } = imageData
  const mask = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    mask[i] = (data[i * 4] < 240 || data[i * 4 + 1] < 240 || data[i * 4 + 2] < 240) ? 1 : 0
  }
  return mask
}

// Rescale rawDepth so the foreground median equals TARGET_MEDIAN_Z.
// This aligns the metric scale across views so the merged point clouds overlap correctly.
function normaliseDepthScale(rawDepth, mask, width, height) {
  const depths = []
  for (let i = 0; i < width * height; i++) if (mask[i]) depths.push(rawDepth[i])
  if (depths.length === 0) return rawDepth
  depths.sort((a, b) => a - b)
  const median = depths[Math.floor(depths.length / 2)]
  if (median <= 0) return rawDepth
  const scale = TARGET_MEDIAN_Z / median
  const out = new Float32Array(rawDepth.length)
  for (let i = 0; i < rawDepth.length; i++) out[i] = rawDepth[i] * scale
  return out
}

/**
 * Build a world-space triangle mesh from one depth map.
 *
 * Camera-to-world rotation matrix for azimuth `a` and elevation `e`:
 *   Xw =  cos(a)·Xc − sin(a)·sin(e)·Yc + cos(e)·sin(a)·Zc
 *   Yw =               cos(e)·Yc         + sin(e)·Zc
 *   Zw = −sin(a)·Xc − cos(a)·sin(e)·Yc + cos(e)·cos(a)·Zc
 *
 * Verified: at az=0, el=0 this is the identity transform (front view unchanged).
 */
function buildViewMesh(rawDepth, mask, width, height, azDeg, elDeg) {
  const a = azDeg * Math.PI / 180
  const e = elDeg * Math.PI / 180
  const cA = Math.cos(a), sA = Math.sin(a)
  const cE = Math.cos(e), sE = Math.sin(e)

  const cx = width / 2, cy = height / 2
  const fx = width / (2 * Math.tan(27.5 * Math.PI / 180))

  // Pass 1: build vertices in world space
  const vertMap = new Int32Array(width * height).fill(-1)
  const positions = []

  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const pi = v * width + u
      if (!mask[pi]) continue
      const Z = rawDepth[pi]
      vertMap[pi] = positions.length / 3
      const Xc = (u - cx) * Z / fx
      const Yc = -(v - cy) * Z / fx  // fy = fx (square pixels assumed)
      const Zc = -Z
      positions.push(
        cA * Xc - sA * sE * Yc + cE * sA * Zc,
        cE * Yc + sE * Zc,
        -sA * Xc - cA * sE * Yc + cE * cA * Zc,
      )
    }
  }

  if (positions.length === 0) return { positions: [], indices: [] }

  // Outlier removal — remove vertices whose rawDepth deviates > 1.5σ from median
  const depths = []
  for (let i = 0; i < width * height; i++) if (vertMap[i] >= 0) depths.push(rawDepth[i])
  depths.sort((a, b) => a - b)
  const med = depths[Math.floor(depths.length / 2)]
  let variance = 0
  for (const d of depths) variance += (d - med) ** 2
  const std = Math.sqrt(variance / depths.length)
  const lo = med - 1.5 * std, hi = med + 1.5 * std
  for (let i = 0; i < width * height; i++) {
    if (vertMap[i] >= 0 && (rawDepth[i] < lo || rawDepth[i] > hi)) vertMap[i] = -1
  }

  // Triangulation — grid-based quads split into two triangles
  const indices = []
  for (let v = 0; v < height - 1; v++) {
    for (let u = 0; u < width - 1; u++) {
      const i00 = v * width + u,       i10 = v * width + u + 1
      const i01 = (v + 1) * width + u, i11 = (v + 1) * width + u + 1
      const v00 = vertMap[i00], v10 = vertMap[i10]
      const v01 = vertMap[i01], v11 = vertMap[i11]
      const d00 = rawDepth[i00], d10 = rawDepth[i10]
      const d01 = rawDepth[i01], d11 = rawDepth[i11]

      if (v00 >= 0 && v10 >= 0 && v01 >= 0) {
        if (Math.max(d00, d10, d01) - Math.min(d00, d10, d01) < DISC_ABS)
          indices.push(v00, v10, v01)
      }
      if (v10 >= 0 && v11 >= 0 && v01 >= 0) {
        if (Math.max(d10, d11, d01) - Math.min(d10, d11, d01) < DISC_ABS)
          indices.push(v10, v11, v01)
      }
    }
  }

  return { positions, indices }
}
