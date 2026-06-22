import { Check, Copy, Terminal, Trash2 } from 'lucide-react'
import { ActionIconButton, Button, GhostButton, Modal, ParagraphSm } from '@6njp/prototype-library'

import styles from './ServerSetupModal.module.css'

function CopyableCode({ children }) {
  const [copied, setCopied] = React.useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={styles.componentCopyableCode}>
      <code className={styles.code}>{children}</code>
      <ActionIconButton
        icon={copied ? Check : Copy}
        onClick={handleCopy}
        title='Copy to clipboard'
        size={20}
        style='transparent'
        layoutClassName={styles.copyButtonLayout}
      />
    </div>
  )
}

export function ServerSetupModal({ isOpen, onClose, onCheckAgain, checking = false }) {
  const [page, setPage] = React.useState(1)

  function handleClose() {
    setPage(1)
    onClose()
  }

  return (
    <Modal title={page === 1 ? 'Local server required' : 'Cleanup guide'} onClose={handleClose} {...{ isOpen }}>
      {page === 1 ? (
        <SetupPage onCleanupGuide={() => setPage(2)} {...{ checking, onCheckAgain }} />
      ) : (
        <CleanupPage onBack={() => setPage(1)} />
      )}
    </Modal>
  )
}

function SetupPage({ checking, onCheckAgain, onCleanupGuide }) {
  return (
    <div className={styles.componentSetupPage}>
      <ParagraphSm>
        Three·ation uses a local depth estimation model that runs on your machine.
        You need to start it once before uploading an image.
      </ParagraphSm>

      <ol className={styles.steps}>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Open a terminal in the project folder</span>
        </li>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Install base dependencies <em>(one-time)</em></span>
          <CopyableCode>python3 -m pip install -r server/requirements.txt</CopyableCode>
        </li>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Optional — install Zero123++ + Open3D for multi-view reconstruction <em>(one-time, ~1 GB model download on first run)</em></span>
          <CopyableCode>python3 -m pip install &quot;diffusers&gt;=0.25&quot; accelerate open3d</CopyableCode>
        </li>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Optional — clone TripoSR for single-image neural reconstruction <em>(one-time, ~500 MB on first run)</em></span>
          <CopyableCode>git clone https://github.com/VAST-AI-Research/TripoSR.git server/vendor/TripoSR</CopyableCode>
        </li>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Start the server</span>
          <CopyableCode>python3 server/server.py</CopyableCode>
        </li>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Keep that terminal open and come back here</span>
        </li>
      </ol>

      <ParagraphSm>
        The model runs entirely on your machine — nothing is sent to any external service.
        The first run downloads ~100 MB and caches it locally.
      </ParagraphSm>

      <div className={styles.footer}>
        <GhostButton
          label='Cleanup guide'
          icon={Trash2}
          color='white'
          onClick={onCleanupGuide}
        />
        <Button
          label={checking ? 'Checking…' : 'I\'ve started the server'}
          variant='solid'
          icon={Terminal}
          disabled={checking}
          onClick={onCheckAgain}
        />
      </div>
    </div>
  )
}

function CleanupPage({ onBack }) {
  return (
    <div className={styles.componentCleanupPage}>
      <ParagraphSm>
        Follow these steps to fully remove Three·ation&apos;s Python dependencies and cached models
        from your machine. Stop the server first (Ctrl+C in the terminal) before proceeding.
      </ParagraphSm>

      <ol className={styles.steps}>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Uninstall Python packages</span>
          <CopyableCode>python3 -m pip uninstall -y flask flask-cors transformers torch Pillow numpy diffusers accelerate trimesh einops omegaconf huggingface-hub open3d</CopyableCode>
        </li>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Remove the TripoSR clone <em>(if you installed it)</em></span>
          <CopyableCode>rm -rf server/vendor/TripoSR</CopyableCode>
        </li>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Remove all Hugging Face model caches <em>(shared with other tools — skip if unsure)</em></span>
          <CopyableCode>rm -rf ~/.cache/huggingface/hub</CopyableCode>
        </li>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Or remove only Three·ation models individually</span>
          <CopyableCode>rm -rf ~/.cache/huggingface/hub/models--depth-anything*</CopyableCode>
          <CopyableCode>rm -rf ~/.cache/huggingface/hub/models--sudo-ai*</CopyableCode>
          <CopyableCode>rm -rf ~/.cache/huggingface/hub/models--stabilityai--TripoSR</CopyableCode>
        </li>
        <li className={styles.step}>
          <span className={styles.stepLabel}>Optional — remove the Python package cache to free disk space</span>
          <CopyableCode>python3 -m pip cache purge</CopyableCode>
        </li>
      </ol>

      <ParagraphSm>
        The app itself (this browser window) has no local state beyond your browser cache.
        Nothing else needs to be removed.
      </ParagraphSm>

      <div className={styles.footer}>
        <GhostButton
          label='Back to setup'
          color='white'
          onClick={onBack}
        />
      </div>
    </div>
  )
}
