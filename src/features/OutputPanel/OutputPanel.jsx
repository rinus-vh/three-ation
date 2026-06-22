import { Download } from 'lucide-react'
import { Button, FileUpload, GhostButton, ImageGalleryViewer, Loader, ParagraphSm } from '@6njp/prototype-library'

import { ModelViewer } from '@/features/ModelViewer/ModelViewer.jsx'

import { exportGLB, exportOBJ } from '@/machinery/exportModel.js'

import styles from './OutputPanel.module.css'

export function OutputPanel({ result, generating, progressInfo, uploadedImage, maskPreviewUrl, pointCloud, viewUrls = [], onImageFile, onDownloadTexture, layoutClassName = undefined }) {
  const objectRef = React.useRef(null)
  const replaceRef = React.useRef(null)
  const [galleryIndex, setGalleryIndex] = React.useState(null)

  function handleReplaceChange(e) {
    const file = e.target.files[0]
    if (file) onImageFile(file)
    e.target.value = ''
  }

  return (
    <div className={cx(styles.component, layoutClassName)}>
      <div className={styles.stage}>
        {generating && (
          <div className={styles.overlay}>
            <Loader size={28} />
            <div className={styles.progressBar}>
              <div
                style={{ width: `${(progressInfo?.percent ?? 0).toFixed(1)}%` }}
                className={styles.progressFill}
              />
            </div>
            <ParagraphSm>{progressInfo?.label ?? 'Starting…'}</ParagraphSm>
          </div>
        )}

        {result ? (
          <ModelViewer
            geometry={result.geometry}
            texture={result.texture}
            scene={result.scene}
            layoutClassName={styles.stageContentLayout}
            {...{ objectRef, pointCloud }}
          />
        ) : uploadedImage ? (
          <button
            type='button'
            onClick={() => replaceRef.current?.click()}
            className={cx(styles.previewArea, maskPreviewUrl && styles.previewAreaCheckerboard)}
          >
            <input
              ref={replaceRef}
              type='file'
              accept='image/*'
              onChange={handleReplaceChange}
              className={styles.hiddenInput}
            />
            <img
              src={maskPreviewUrl ?? uploadedImage.previewUrl}
              alt='Reference'
              className={styles.previewImage}
            />
          </button>
        ) : (
          <div className={styles.uploadWrapper}>
            <FileUpload
              onFile={onImageFile}
              label='Drop reference image here'
              accept={['image/jpeg', 'image/png', 'image/webp']}
              layoutClassName={styles.uploadLayout}
            />
          </div>
        )}
      </div>

      {viewUrls.length > 0 && (
        <div className={styles.viewsStrip}>
          {viewUrls.map((url, i) => (
            <button
              key={i}
              type='button'
              className={styles.viewThumb}
              onClick={() => setGalleryIndex(i)}
              title={`View ${i + 1}`}
            >
              <img src={url} alt={`View ${i + 1}`} className={styles.viewThumbImg} />
            </button>
          ))}
        </div>
      )}

      <ImageGalleryViewer
        images={viewUrls.map((src, i) => ({ src, alt: `View ${i + 1}` }))}
        initialIndex={galleryIndex ?? 0}
        isOpen={galleryIndex !== null}
        onClose={() => setGalleryIndex(null)}
      />

      {result && !generating && (
        <div className={styles.footer}>
          <div className={styles.downloads}>
            <Button
              label='Download .OBJ'
              variant='solid'
              icon={Download}
              onClick={() => objectRef.current && exportOBJ(objectRef.current, 'three-ation')}
              layoutClassName={styles.downloadLayout}
            />
            <Button
              label='Download .GLB'
              variant='outline'
              icon={Download}
              onClick={() => objectRef.current && exportGLB(objectRef.current, 'three-ation')}
              layoutClassName={styles.downloadLayout}
            />
          </div>
          <GhostButton
            label='Download texture'
            icon={Download}
            color='white'
            onClick={onDownloadTexture}
          />
        </div>
      )}
    </div>
  )
}
