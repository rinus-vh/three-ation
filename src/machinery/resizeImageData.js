export function resizeImageData(imageData, maxDim) {
  const { width, height } = imageData
  const scale = Math.min(1, maxDim / Math.max(width, height))
  if (scale >= 1) return imageData
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)
  const src = Object.assign(document.createElement('canvas'), { width, height })
  src.getContext('2d').putImageData(imageData, 0, 0)
  const dst = Object.assign(document.createElement('canvas'), { width: w, height: h })
  dst.getContext('2d').drawImage(src, 0, 0, w, h)
  return dst.getContext('2d').getImageData(0, 0, w, h)
}
