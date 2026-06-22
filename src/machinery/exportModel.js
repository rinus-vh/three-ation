import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'

// Export helpers for the generated mesh.
//
//   • OBJ  — native to three (geometry only; widely interoperable).
//   • GLB  — native to three (GLTFExporter, binary). Embeds the texture and
//            material, so it round-trips the full look in most viewers/DCC tools.
//
// FBX is intentionally not here: three ships no FBX exporter and the format is
// proprietary. GLB covers the "textured, portable" case today; FBX can be added
// later via a converter or backend step.

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** @param {THREE.Object3D} object @param {string} [name] */
export function exportOBJ(object, name = 'model') {
  const text = new OBJExporter().parse(object)
  triggerDownload(new Blob([text], { type: 'text/plain' }), `${name}.obj`)
}

/** @param {THREE.Object3D} object @param {string} [name] */
export function exportGLB(object, name = 'model') {
  const exporter = new GLTFExporter()
  exporter.parse(
    object,
    result => {
      const blob = result instanceof ArrayBuffer
        ? new Blob([result], { type: 'model/gltf-binary' })
        : new Blob([JSON.stringify(result)], { type: 'model/gltf+json' })
      triggerDownload(blob, `${name}.glb`)
    },
    error => { console.error('GLB export failed', error) },
    { binary: true },
  )
}
