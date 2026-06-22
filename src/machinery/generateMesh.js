import * as THREE from 'three'

import { estimateDepth } from './depthEstimator.js'
import { reconstruct } from './reconstructor.js'
import { reconstruct3d } from './reconstruct3dReconstructor.js'
import { removeBackground, maskToCutoutCanvas } from './removeBackground.js'
import { resizeImageData } from './resizeImageData.js'
import { segmentSubject } from './segmentSubject.js'

// Default working resolution. Overridden by options.resolution.
const DEFAULT_MAX_DIM = 256

// Yield to the event loop so React can flush progress state updates.
const yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0))

function buildAdjacency(vertCount, idxArr) {
  const adj = Array.from({ length: vertCount }, () => new Set())
  for (let i = 0; i < idxArr.length; i += 3) {
    const a = idxArr[i], b = idxArr[i + 1], c = idxArr[i + 2]
    adj[a].add(b); adj[a].add(c)
    adj[b].add(a); adj[b].add(c)
    adj[c].add(a); adj[c].add(b)
  }
  return adj.map(s => [...s])
}

async function taubinSmoothAsync(posArr, adj, passes, onProgress) {
  const lambda = 0.5, mu = -0.53
  const n = posArr.length / 3
  const delta = new Float32Array(n * 3)
  for (let p = 0; p < passes; p++) {
    for (const factor of [lambda, mu]) {
      for (let v = 0; v < n; v++) {
        const nb = adj[v]
        if (!nb.length) continue
        let sx = 0, sy = 0, sz = 0
        for (const u of nb) { sx += posArr[u*3]; sy += posArr[u*3+1]; sz += posArr[u*3+2] }
        const k = 1 / nb.length
        delta[v*3]   = factor * (sx * k - posArr[v*3])
        delta[v*3+1] = factor * (sy * k - posArr[v*3+1])
        delta[v*3+2] = factor * (sz * k - posArr[v*3+2])
      }
      for (let i = 0; i < n * 3; i++) posArr[i] += delta[i]
    }
    onProgress?.({ phase: 'smooth', progress: ((p + 1) / passes) * 100 })
    await yieldFrame()
  }
}

/**
 * Progress events emitted via onProgress:
 *   { phase: 'download', progress: 0-100 }  — model file download
 *   { phase: 'depth',    progress: 0|100  }  — inference start / complete
 *   { phase: 'mesh',     progress: 0-100  }  — vertex + triangle building
 *   { phase: 'smooth',   progress: 0-100  }  — Taubin smoothing passes
 *   { phase: 'serving',  progress: 0|100  }  — geometry assembly start / complete
 *
 * @param {ImageData} imageData
 * @param {{ onProgress?: (info: object) => void, resolution?: number }} [options]
 * @returns {Promise<{ geometry: THREE.BufferGeometry, texture: THREE.Texture } | null>}
 */
export async function generateMesh(imageData, options = {}) {
  const {
    onProgress,
    resolution = DEFAULT_MAX_DIM,
    segmentMode = 'ai',
    tolerance = 0.18,
    capabilities = [],
    method = 'auto',
    onViews = null,
    mvSteps = 20,
    mvScheduler = 'dpm++',
  } = options

  const segment = segmentMode === 'ai'
    ? (img) => segmentSubject(img, { fallback: (d) => removeBackground(d, { tolerance }) })
    : (img) => Promise.resolve(removeBackground(img, { tolerance }))

  // Full-res mask for the texture cutout.
  const { mask: fullMask } = await segment(imageData)

  // Resolve effective pipeline method.
  // 'auto' picks the best available; explicit values override.
  // NOTE: mirrors resolveAutoMethod() in InputPanel.jsx — keep in sync.
  let effective = method
  if (method === 'auto') {
    if (capabilities.includes('multiview') && capabilities.includes('reconstruct3d')) effective = 'reconstruct3d'
    else if (capabilities.includes('reconstruct')) effective = 'triposr'
    else effective = 'depth'
  }

  // --- Route: Zero123++ + Poisson surface reconstruction ---
  if (effective === 'reconstruct3d' && capabilities.includes('reconstruct3d')) {
    const cutoutCanvas = maskToCutoutCanvas(imageData, fullMask)
    return await reconstruct3d(cutoutCanvas, { onProgress, onViews, mvSteps, mvScheduler })
  }

  // --- Route: TripoSR single-image reconstruction ---
  if (effective === 'triposr' && capabilities.includes('reconstruct')) {
    const cutoutCanvas = maskToCutoutCanvas(imageData, fullMask)
    onProgress?.({ phase: 'reconstruct', progress: 0 })
    const result = await reconstruct(cutoutCanvas, { onProgress })
    onProgress?.({ phase: 'serving', progress: 100 })
    return result
  }

  // Downsample for mesh generation.
  const small = resizeImageData(imageData, resolution)
  const { mask } = await segment(small)

  const { rawDepth, width: dw, height: dh } = await estimateDepth(small, { onProgress })

  // Pinhole backprojection — ~55° FoV approximation.
  const cx = dw / 2, cy = dh / 2
  const fx = dw / (2 * Math.tan(27.5 * Math.PI / 180))
  const fy = fx

  // Absolute Z-difference threshold for depth discontinuities.
  // rawDepth ranges 0.5-10.5 (range 10); skip triangles where any edge spans > 25% of that.
  const DISC_ABS = 2.5

  // --- Phase: mesh (vertex building, 0-50%) ---
  const vertMap = new Int32Array(dw * dh).fill(-1)
  const posArr = []
  const uvArr  = []

  // Yield every ~10% of rows so React can flush progress updates.
  const yieldEvery = Math.max(1, Math.floor(dh / 10))

  for (let v = 0; v < dh; v++) {
    for (let u = 0; u < dw; u++) {
      const pi = v * dw + u
      if (!mask[pi]) continue
      const Z = rawDepth[pi]
      vertMap[pi] = posArr.length / 3
      posArr.push(
        (u - cx) * Z / fx,
        -(v - cy) * Z / fy,
        -Z,
      )
      uvArr.push(u / (dw - 1), 1 - v / (dh - 1))
    }
    if (v % yieldEvery === 0) {
      onProgress?.({ phase: 'mesh', progress: (v / dh) * 50 })
      await yieldFrame()
    }
  }

  if (posArr.length === 0) return null

  // Remove depth outliers before compression.
  // Shadow/ground pixels cluster at extreme rawDepth values far from the object.
  // Compute median rawDepth across foreground pixels, then discard vertices
  // whose depth deviates more than 1.5 standard deviations from the mean.
  {
    const depths = []
    for (let i = 0; i < dw * dh; i++) {
      if (vertMap[i] >= 0) depths.push(rawDepth[i])
    }
    depths.sort((a, b) => a - b)
    const median = depths[Math.floor(depths.length / 2)]
    let variance = 0
    for (const d of depths) variance += (d - median) ** 2
    const std = Math.sqrt(variance / depths.length)
    const lo = median - 1.5 * std
    const hi = median + 1.5 * std

    for (let i = 0; i < dw * dh; i++) {
      if (vertMap[i] < 0) continue
      const d = rawDepth[i]
      if (d < lo || d > hi) vertMap[i] = -1
    }
  }

  // Compress Z so depth doesn't dominate the bounding box after normalization.
  // Target: depth = 50% of the widest XY dimension.
  {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    let minZp = Infinity, maxZp = -Infinity
    for (let i = 0; i < posArr.length; i += 3) {
      if (posArr[i]   < minX) minX = posArr[i];   if (posArr[i]   > maxX) maxX = posArr[i]
      if (posArr[i+1] < minY) minY = posArr[i+1]; if (posArr[i+1] > maxY) maxY = posArr[i+1]
      if (posArr[i+2] < minZp) minZp = posArr[i+2]; if (posArr[i+2] > maxZp) maxZp = posArr[i+2]
    }
    const xyExt = Math.max(maxX - minX, maxY - minY)
    const zExt  = maxZp - minZp
    const targetZ = xyExt * 0.25
    if (zExt > 0 && targetZ < zExt) {
      const zMid = (minZp + maxZp) / 2
      const f = targetZ / zExt
      for (let i = 2; i < posArr.length; i += 3)
        posArr[i] = zMid + (posArr[i] - zMid) * f
    }
  }

  // --- Phase: mesh (triangle building, 50-100%) ---
  const indices = []

  for (let v = 0; v < dh - 1; v++) {
    for (let u = 0; u < dw - 1; u++) {
      const i00 = v * dw + u,       i10 = v * dw + u + 1
      const i01 = (v+1) * dw + u,   i11 = (v+1) * dw + u + 1

      const v00 = vertMap[i00], v10 = vertMap[i10]
      const v01 = vertMap[i01], v11 = vertMap[i11]

      const d00 = rawDepth[i00], d10 = rawDepth[i10]
      const d01 = rawDepth[i01], d11 = rawDepth[i11]

      if (v00 >= 0 && v10 >= 0 && v01 >= 0) {
        const dMax = Math.max(d00, d10, d01), dMin = Math.min(d00, d10, d01)
        if (dMax - dMin < DISC_ABS) indices.push(v00, v10, v01)
      }
      if (v10 >= 0 && v11 >= 0 && v01 >= 0) {
        const dMax = Math.max(d10, d11, d01), dMin = Math.min(d10, d11, d01)
        if (dMax - dMin < DISC_ABS) indices.push(v10, v11, v01)
      }
    }
    if (v % yieldEvery === 0) {
      onProgress?.({ phase: 'mesh', progress: 50 + (v / (dh - 1)) * 50 })
      await yieldFrame()
    }
  }

  if (indices.length === 0) return null

  // --- Phase: smooth ---
  const positions = new Float32Array(posArr)
  const adj = buildAdjacency(posArr.length / 3, indices)
  await taubinSmoothAsync(positions, adj, 8, onProgress)

  // Center and normalize to unit scale
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);   maxX = Math.max(maxX, positions[i])
    minY = Math.min(minY, positions[i+1]); maxY = Math.max(maxY, positions[i+1])
    minZ = Math.min(minZ, positions[i+2]); maxZ = Math.max(maxZ, positions[i+2])
  }
  const cx3 = (minX + maxX) / 2, cy3 = (minY + maxY) / 2, cz3 = (minZ + maxZ) / 2
  const ext = Math.max(maxX - minX, maxY - minY, maxZ - minZ) / 2 || 1
  for (let i = 0; i < positions.length; i += 3) {
    positions[i]   = (positions[i]   - cx3) / ext
    positions[i+1] = (positions[i+1] - cy3) / ext
    positions[i+2] = (positions[i+2] - cz3) / ext
  }

  // --- Build back cap (side walls) ---
  // Find boundary edges: edges that belong to exactly one triangle.
  const edgeTris = new Map()
  for (let i = 0; i < indices.length; i += 3) {
    for (const [a, b] of [[indices[i], indices[i+1]], [indices[i+1], indices[i+2]], [indices[i+2], indices[i]]]) {
      const key = a < b ? `${a},${b}` : `${b},${a}`
      edgeTris.set(key, (edgeTris.get(key) ?? 0) + 1)
    }
  }

  const frontCount = positions.length / 3

  // Each back vertex is offset by a fixed distance from its own front Z so all
  // side walls have uniform depth regardless of the front surface curvature.
  // This prevents long stretched triangles where front Z values vary widely.
  const WALL_DEPTH = 0.18

  const backPos = []
  const backUV  = []
  const backIdx = []
  const f2b = new Map()

  function backVert(fi) {
    if (f2b.has(fi)) return f2b.get(fi)
    const bi = frontCount + backPos.length / 3
    backPos.push(positions[fi*3], positions[fi*3+1], positions[fi*3+2] - WALL_DEPTH)
    backUV.push(uvArr[fi*2], uvArr[fi*2+1])
    f2b.set(fi, bi)
    return bi
  }

  for (const [key, count] of edgeTris) {
    if (count !== 1) continue
    const [a, b] = key.split(',').map(Number)
    const ba = backVert(a), bb = backVert(b)
    // Side wall quad — DoubleSide material, so winding is for normal direction only.
    backIdx.push(a, b, bb)
    backIdx.push(a, bb, ba)
  }


  // Merge front and back geometry.
  const backPosF32 = new Float32Array(backPos)
  const allPositions = new Float32Array(positions.length + backPosF32.length)
  allPositions.set(positions, 0)
  allPositions.set(backPosF32, positions.length)

  const frontUVFlat = new Float32Array(uvArr)
  const backUVF32 = new Float32Array(backUV)
  const allUVs = new Float32Array(frontUVFlat.length + backUVF32.length)
  allUVs.set(frontUVFlat, 0)
  allUVs.set(backUVF32, frontUVFlat.length)

  const allIndices = [...indices, ...backIdx]

  // --- Phase: serving ---
  onProgress?.({ phase: 'serving', progress: 0 })
  await yieldFrame()

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(allUVs, 2))
  geometry.setIndex(allIndices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  const cutout = maskToCutoutCanvas(imageData, fullMask)
  const texture = new THREE.CanvasTexture(cutout)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = true

  onProgress?.({ phase: 'serving', progress: 100 })
  await yieldFrame()

  return { geometry, texture }
}
