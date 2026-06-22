// Subject segmentation via Google MediaPipe DeepLab v3.
// DeepLab classifies every pixel into semantic categories; category 0 is
// background. Everything else is treated as subject (foreground).
//
// The WASM runtime and model are loaded lazily on first use and cached
// process-globally, so subsequent calls pay no startup cost.

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite'

let segmenterPromise = null

async function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })
    })().catch(err => {
      segmenterPromise = null
      throw err
    })
  }
  return segmenterPromise
}

/**
 * Segment the subject out of an image using MediaPipe DeepLab v3.
 * Falls back to the flood-fill colour keyer if the model fails to load.
 *
 * @param {ImageData} imageData
 * @param {{ fallback?: (imageData: ImageData) => { mask: Uint8Array } }} [options]
 * @returns {Promise<{ mask: Uint8Array, width: number, height: number }>}
 */
export async function segmentSubject(imageData, { fallback } = {}) {
  const { width, height } = imageData

  let segmenter
  try {
    segmenter = await getSegmenter()
  } catch {
    return fallback ? fallback(imageData) : { mask: new Uint8Array(width * height).fill(1), width, height }
  }

  // MediaPipe needs an HTMLCanvasElement or HTMLImageElement.
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').putImageData(imageData, 0, 0)

  const result = segmenter.segment(canvas)
  const categoryMask = result.categoryMask
  const categories = categoryMask.getAsUint8Array()
  const srcW = categoryMask.width
  const srcH = categoryMask.height
  categoryMask.close()

  // Nearest-neighbour resample to match the input resolution.
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(srcH - 1, Math.floor((y / height) * srcH))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(srcW - 1, Math.floor((x / width) * srcW))
      // category 0 = background; anything else = subject (car, person, etc.)
      mask[y * width + x] = categories[sy * srcW + sx] === 0 ? 0 : 1
    }
  }

  return { mask, width, height }
}
