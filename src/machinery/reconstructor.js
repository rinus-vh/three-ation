import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SERVER = 'http://127.0.0.1:8765'

/**
 * Run full 3D reconstruction via the local server (TripoSR).
 *
 * Fires onProgress:
 *   { phase: 'reconstruct', progress: 0 }   — request sent
 *   { phase: 'reconstruct', progress: 100 } — response received
 *
 * Returns { geometry: THREE.BufferGeometry, texture: THREE.Texture | null }
 */
export async function reconstruct(cutoutCanvas, { onProgress } = {}) {
  onProgress?.({ phase: 'reconstruct', progress: 0 })

  // Send the masked RGBA image as PNG so the server gets the alpha channel.
  const imageB64 = cutoutCanvas.toDataURL('image/png').split(',')[1]

  const res = await fetch(`${SERVER}/reconstruct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageB64 }),
  })

  if (!res.ok) throw new Error(`Reconstruct server responded ${res.status}`)

  const data = await res.json()
  onProgress?.({ phase: 'reconstruct', progress: 100 })

  return loadGLB(data.glb_b64)
}

async function loadGLB(glbB64) {
  const binaryStr = atob(glbB64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

  const blob = new Blob([bytes], { type: 'model/gltf-binary' })
  const url = URL.createObjectURL(blob)

  try {
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().load(url, resolve, undefined, reject)
    })

    // Return the full scene so ModelViewer can render it with <primitive>,
    // preserving TripoSR's original materials, textures and UVs exactly.
    gltf.scene.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })

    return { scene: gltf.scene }
  } finally {
    URL.revokeObjectURL(url)
  }
}
