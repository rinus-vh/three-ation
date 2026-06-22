// Load an uploaded image File into ImageData, downscaling very large images so
// the (synchronous) mask + mesh passes stay snappy.

const MAX_DIMENSION = 1024

/**
 * @param {File} file
 * @returns {Promise<{ imageData: ImageData, previewUrl: string, width: number, height: number }>}
 */
export function loadImageData(file) {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      let { naturalWidth: width, naturalHeight: height } = img
      const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
      width = Math.max(1, Math.round(width * scale))
      height = Math.max(1, Math.round(height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0, width, height)
      const imageData = ctx.getImageData(0, 0, width, height)
      resolve({ imageData, previewUrl, width, height })
    }
    img.onerror = () => { URL.revokeObjectURL(previewUrl); reject(new Error('Could not load image')) }
    img.src = previewUrl
  })
}
