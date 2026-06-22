import { Grid, Header, MinimizedPanelsMenu, MinimizedPanelsMenuContextProvider, Panel, usePanelManager } from '@6njp/prototype-library'
import { getThemeVariables } from '@6njp/prototype-library/machinery'
import { Cuboid } from 'lucide-react'

import { InputPanel } from '@/features/InputPanel/InputPanel.jsx'
import { OutputPanel } from '@/features/OutputPanel/OutputPanel.jsx'
import { ServerOutputPanel } from '@/features/ServerOutputPanel/ServerOutputPanel.jsx'
import { ServerSetupModal } from '@/features/ServerSetupModal/ServerSetupModal.jsx'

import { remesh } from '@/machinery/reconstruct3dReconstructor.js'
import { loadImageData } from '@/machinery/loadImageData.js'
import { generateMesh } from '@/machinery/generateMesh.js'
import { checkServer } from '@/machinery/depthEstimator.js'
import { removeBackground, maskToCutoutCanvas } from '@/machinery/removeBackground.js'
import { resizeImageData } from '@/machinery/resizeImageData.js'
import { segmentSubject } from '@/machinery/segmentSubject.js'

import styles from './App.module.css'

// Maps raw pipeline progress events to a display-ready { percent, label }.
function toProgressInfo(info) {
  if (!info) return null
  const p = info.progress ?? 0
  switch (info.phase) {
    case 'reconstruct':   return { percent: p * 0.90,         label: 'Reconstructing 3D model…' }
    case 'multiview':     return { percent: p * 0.40,         label: 'Synthesising views…' }
    case 'reconstruct3d': return { percent: 40 + p * 0.50,    label: 'Reconstructing mesh…' }
    case 'depth':         return { percent: p * 0.35,         label: 'Estimating depth…' }
    case 'mesh':          return { percent: 35 + p * 0.40,    label: 'Generating mesh…' }
    case 'smooth':        return { percent: 75 + p * 0.15,    label: 'Smoothing mesh…' }
    case 'serving':       return { percent: 90 + p * 0.10,    label: 'Serving 3D model…' }
    default:              return null
  }
}

export default function App() {
  const [isDark, setIsDark] = React.useState(true)
  const themeName = isDark ? 'dark' : 'light'
  const themeVariables = getThemeVariables(themeName)

  const [uploadedImage, setUploadedImage] = React.useState(null)
  const [result, setResult] = React.useState(null)
  const [generating, setGenerating] = React.useState(false)
  const [progressInfo, setProgressInfo] = React.useState(null)
  const [resolution, setResolution] = React.useState(256)
  const [segmentMode, setSegmentMode] = React.useState('ai')
  const [tolerance, setTolerance] = React.useState(0.18)
  const [pointCloud, setPointCloud] = React.useState(false)
  const [method, setMethod] = React.useState('auto')
  const [mvSteps, setMvSteps] = React.useState(10)
  const [mvScheduler, setMvScheduler] = React.useState('dpm++')
  const [viewUrls, setViewUrls] = React.useState([])

  const [maskPreviewUrl, setMaskPreviewUrl] = React.useState(null)

  // Recompute the mask preview whenever the image or isolation settings change.
  React.useEffect(() => {
    let cancelled = false
    async function run() {
      if (!uploadedImage?.imageData) {
        setMaskPreviewUrl(null)
        return
      }
      const small = resizeImageData(uploadedImage.imageData, 512)
      const { mask } =
        segmentMode === 'ai'
          ? await segmentSubject(small, { fallback: (d) => removeBackground(d, { tolerance }) })
          : removeBackground(small, { tolerance })
      if (cancelled) return
      const canvas = maskToCutoutCanvas(small, mask)
      setMaskPreviewUrl(canvas.toDataURL())
    }
    run()
    return () => { cancelled = true }
  }, [uploadedImage, segmentMode, tolerance])

  const [serverAvailable, setServerAvailable] = React.useState(null)
  const [serverCapabilities, setServerCapabilities] = React.useState([])
  const [showServerModal, setShowServerModal] = React.useState(false)
  const [checkingServer, setCheckingServer] = React.useState(false)

  const previousResultRef = React.useRef(null)

  // Check server on mount.
  React.useEffect(() => {
    checkServer().then(({ ok, capabilities }) => {
      setServerAvailable(ok)
      setServerCapabilities(capabilities)
      if (!ok) setShowServerModal(true)
    })
  }, [])

  async function handleCheckAgain() {
    setCheckingServer(true)
    const { ok, capabilities } = await checkServer()
    setServerAvailable(ok)
    setServerCapabilities(capabilities)
    setCheckingServer(false)
    if (ok) setShowServerModal(false)
  }

  function requireServer() {
    if (serverAvailable) return true
    setShowServerModal(true)
    return false
  }

  function disposeResult(r) {
    if (!r) return
    r.geometry?.dispose?.()
    r.texture?.dispose?.()
  }

  async function handleImageFile(file) {
    if (!requireServer()) return
    try {
      const { imageData, previewUrl } = await loadImageData(file)
      setUploadedImage(prev => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
        return { imageData, previewUrl }
      })
      disposeResult(previousResultRef.current)
      previousResultRef.current = null
      setResult(null)
    } catch (err) {
      console.error(err)
    }
  }

  async function handleGenerate() {
    if (!uploadedImage?.imageData || generating) return
    if (!requireServer()) return
    setGenerating(true)
    setProgressInfo(null)
    setViewUrls([])
    await new Promise(resolve => setTimeout(resolve, 40))
    try {
      const generated = await generateMesh(uploadedImage.imageData, {
        onProgress: info => setProgressInfo(toProgressInfo(info)),
        onViews: urls => setViewUrls(urls),
        resolution,
        segmentMode,
        tolerance,
        capabilities: serverCapabilities,
        method,
        mvSteps,
        mvScheduler,
      })
      disposeResult(previousResultRef.current)
      previousResultRef.current = generated
      setResult(generated)
    } catch (err) {
      console.error(err)
      // Only mark server unavailable for genuine connectivity failures.
      // Reconstruction errors (bad mesh, Poisson failure, etc.) still mean
      // the server is reachable — don't pop the setup modal for those.
      const msg = err?.message ?? ''
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ECONNREFUSED')) {
        setServerAvailable(false)
      }
    } finally {
      setGenerating(false)
      setProgressInfo(null)
    }
  }

  function handleDiscard() {
    disposeResult(previousResultRef.current)
    previousResultRef.current = null
    setResult(null)
  }

  function handleFullDiscard() {
    disposeResult(previousResultRef.current)
    previousResultRef.current = null
    setResult(null)
    setUploadedImage(prev => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
    setViewUrls([])
    setMaskPreviewUrl(null)
    setProgressInfo(null)
  }

  function handleDownloadTexture() {
    const bytes = result?.glbBytes
    if (!bytes) return
    const blob = new Blob([bytes], { type: 'model/gltf-binary' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'three-ation-textured.glb'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function handleResolutionCommit(newResolution) {
    // Before generation: just update resolution state (existing behaviour).
    // After generation: re-mesh at the new voxel resolution without re-running Zero123++.
    setResolution(newResolution)
    if (!result || generating) return
    setGenerating(true)
    setProgressInfo({ percent: 10, label: 'Re-meshing…' })
    try {
      const remeshed = await remesh(newResolution)
      disposeResult(previousResultRef.current)
      previousResultRef.current = remeshed
      setResult(remeshed)
    } catch (err) {
      console.error('remesh error:', err)
    } finally {
      setGenerating(false)
      setProgressInfo(null)
    }
  }

  return (
    <MinimizedPanelsMenuContextProvider>
      <main style={themeVariables} className={styles.app}>
        <Header
          title='Three·ation'
          logo={Cuboid}
          onToggleTheme={() => setIsDark(d => !d)}
          layoutClassName={styles.headerLayout}
          {...{ isDark }}
        />

        <Grid layoutClassName={styles.gridLayout}>
          <AppPanels
            onResolutionChange={setResolution}
            onResolutionCommit={handleResolutionCommit}
            onSegmentModeChange={setSegmentMode}
            onToleranceChange={setTolerance}
            onPointCloudChange={setPointCloud}
            onMethodChange={setMethod}
            onMvStepsChange={setMvSteps}
            onMvSchedulerChange={setMvScheduler}
            onImageFile={handleImageFile}
            onGenerate={handleGenerate}
            onDiscard={handleDiscard}
            onFullDiscard={handleFullDiscard}
            onDownloadTexture={handleDownloadTexture}
            {...{ uploadedImage, maskPreviewUrl, result, generating, progressInfo, resolution, segmentMode, tolerance, pointCloud, method, mvSteps, mvScheduler, viewUrls, serverCapabilities, serverAvailable }}
          />
        </Grid>

        <MinimizedPanelsMenu layoutClassName={styles.minimizedMenuLayout} />

        <ServerSetupModal
          isOpen={showServerModal}
          checking={checkingServer}
          onClose={() => setShowServerModal(false)}
          onCheckAgain={handleCheckAgain}
        />
      </main>
    </MinimizedPanelsMenuContextProvider>
  )
}

function AppPanels({ uploadedImage, maskPreviewUrl, result, generating, progressInfo, resolution, segmentMode, tolerance, pointCloud, method, mvSteps, mvScheduler, viewUrls, serverCapabilities, serverAvailable, onResolutionChange, onResolutionCommit, onSegmentModeChange, onToleranceChange, onPointCloudChange, onMethodChange, onMvStepsChange, onMvSchedulerChange, onImageFile, onGenerate, onDiscard, onFullDiscard, onDownloadTexture }) {
  const input = usePanelManager('input', 'Settings')
  const output = usePanelManager('output', 'Output')
  const serverOut = usePanelManager('serverOutput', 'Server Output')
  const canGenerate = Boolean(uploadedImage) && !generating

  // Auto-show server output panel whenever the server is available (it has useful info)
  const showServerOutput = serverAvailable

  return (
    <>
      {input.visible && (
        <Panel
          isMinimizable
          title='Settings'
          minWidth={4}
          minHeight={9}
          onMinimize={input.minimize}
        >
          <InputPanel
            capabilities={serverCapabilities}
            hasResult={Boolean(result)}
            hasImage={Boolean(uploadedImage)}
            {...{ generating, canGenerate, resolution, onResolutionChange, onResolutionCommit, segmentMode, onSegmentModeChange, tolerance, onToleranceChange, pointCloud, onPointCloudChange, method, onMethodChange, mvSteps, onMvStepsChange, mvScheduler, onMvSchedulerChange, onGenerate, onDiscard, onFullDiscard }}
          />
        </Panel>
      )}

      {output.visible && (
        <Panel
          isMinimizable
          title='Output'
          minWidth={6}
          minHeight={9}
          defaultWidth={7}
          onMinimize={output.minimize}
        >
          <OutputPanel
            {...{ result, generating, progressInfo, uploadedImage, maskPreviewUrl, pointCloud, viewUrls, onImageFile, onDownloadTexture }}
          />
        </Panel>
      )}

      {showServerOutput && serverOut.visible && (
        <Panel
          isMinimizable
          title='Server Output'
          minWidth={4}
          minHeight={6}
          defaultWidth={9}
          onMinimize={serverOut.minimize}
        >
          <ServerOutputPanel />
        </Panel>
      )}
    </>
  )
}
