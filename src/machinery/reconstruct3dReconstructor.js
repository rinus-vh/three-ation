import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const SERVER = 'http://127.0.0.1:8765'
const JOB_POLL_MS = 2000

/**
 * Two-stage 3D reconstruction:
 *   1. POST /multiview   → Zero123++ synthesises 6 novel views (+ full grid)
 *   2. POST /reconstruct3d → Depth per view + Open3D Poisson → GLB
 *
 * Both stages run in server-side background threads; the client polls
 * GET /job/<id> so no HTTP connection is held open for 30+ minutes.
 *
 * @param {HTMLCanvasElement} cutoutCanvas  RGBA subject cutout
 * @param {{ onProgress?, onViews? }} options
 * @returns {Promise<{ scene: THREE.Group }>}
 */
export async function reconstruct3d(cutoutCanvas, { onProgress, onViews, mvSteps = 20, mvScheduler = 'dpm++' } = {}) {
  const imageB64 = cutoutCanvas.toDataURL('image/png').split(',')[1]

  // --- Stage 1: Zero123++ multi-view synthesis ---
  onProgress?.({ phase: 'multiview', progress: 5 })
  const { job_id: mvJobId } = await _post('/multiview', { image: imageB64, steps: mvSteps, scheduler: mvScheduler })

  let lastPreviewStep = -1
  const mvResult = await _pollJob(mvJobId, (elapsed, job) => {
    // Interpolate 5→38% over an expected ~40 min (2400 s) with a soft cap
    const frac = Math.min(elapsed / 2400, 0.95)
    onProgress?.({ phase: 'multiview', progress: 5 + frac * 33 })

    // Show preview views as they arrive from the step callback
    const preview = job?.preview
    if (preview?.views?.length && preview.step !== lastPreviewStep) {
      lastPreviewStep = preview.step
      const format = 'jpeg' // previews are JPEG; final will be PNG
      onViews?.(preview.views.map(b64 => `data:image/${format};base64,` + b64))
    }
  })

  onProgress?.({ phase: 'multiview', progress: 40 })

  // Replace preview thumbnails with the final full-quality PNG views
  if (mvResult.views?.length) {
    onViews?.(mvResult.views.map(b64 => 'data:image/png;base64,' + b64))
  }

  // --- Stage 2: Depth per view + Open3D Poisson reconstruction ---
  onProgress?.({ phase: 'reconstruct3d', progress: 0 })
  const { job_id: r3dJobId } = await _post('/reconstruct3d', {
    grid: mvResult.grid,
    front: imageB64,
  })

  const r3dResult = await _pollJob(r3dJobId, (elapsed) => {
    const frac = Math.min(elapsed / 300, 0.95)
    onProgress?.({ phase: 'reconstruct3d', progress: frac * 88 })
  })

  onProgress?.({ phase: 'reconstruct3d', progress: 90 })

  // --- Load the returned GLB ---
  const glbBytes = Uint8Array.from(atob(r3dResult.glb_b64), c => c.charCodeAt(0))
  const scene = await _loadGLB(glbBytes.buffer)

  onProgress?.({ phase: 'serving', progress: 100 })
  return { scene, glbBytes }
}

export async function remesh(voxelRes) {
  const { job_id } = await _post('/remesh', { voxel_res: voxelRes })
  const result = await _pollJob(job_id, () => {})
  const glbBytes = Uint8Array.from(atob(result.glb_b64), c => c.charCodeAt(0))
  const scene = await _loadGLB(glbBytes.buffer)
  return { scene, glbBytes }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function _pollJob(jobId, onTick) {
  const started = Date.now()
  while (true) {
    await new Promise(r => setTimeout(r, JOB_POLL_MS))

    let job
    try {
      const res = await fetch(`${SERVER}/job/${jobId}`)
      job = await res.json()
    } catch (err) {
      // Transient network hiccup — keep waiting
      console.warn('job poll error, retrying…', err)
      continue
    }

    const elapsed = (Date.now() - started) / 1000
    onTick?.(elapsed, job)

    if (job.status === 'done') return job.result
    if (job.status === 'error') throw new Error(`Server error: ${job.error}`)
    // 'running' → keep polling
  }
}

async function _post(path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(`${path} responded ${res.status}${json.error ? ': ' + json.error : ''}`)
  }
  return res.json()
}

function _loadGLB(buffer) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.parse(buffer, '', gltf => resolve(gltf.scene), reject)
  })
}
