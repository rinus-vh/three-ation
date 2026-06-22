import { Info, RotateCcw, Trash2 } from 'lucide-react'
import { ActionIconButton, Button, Checkbox, Dropdown, GhostButton, PanelContainer, PanelContainerDivider, PanelContainerSettingsRow, PanelContainerSettingsSectionHeader, Slider, Tooltip } from '@6njp/prototype-library'

import styles from './InputPanel.module.css'

const SEGMENT_OPTIONS = [
  { value: 'ai',       label: 'AI segmentation' },
  { value: 'colorkey', label: 'Color key' },
]

const SCHEDULER_OPTIONS = [
  { value: 'dpm++', label: 'DPM++ 2M' },
  { value: 'ddim',  label: 'DDIM' },
]

const SCHEDULER_INFO = {
  'dpm++': 'Fast multi-step sampler. Reaches similar quality to DDIM at roughly half the steps. Recommended with 15–20 steps.',
  'ddim':  'Classic sampler. Very reliable across all step counts. Use 25–30 steps for best quality.',
}

const STEPS_INFO = 'Denoising steps Zero123++ runs per generation. More steps = finer detail, longer wait. DPM++ 2M needs fewer steps than DDIM to reach the same quality.'

// Mirrors the auto-routing logic in generateMesh.js — keep in sync.
function resolveAutoMethod(capabilities) {
  if (capabilities.includes('multiview') && capabilities.includes('reconstruct3d')) return 'Multi-view + Poisson'
  if (capabilities.includes('reconstruct')) return 'TripoSR'
  return 'Depth only'
}

function InfoTip({ text }) {
  const [open, setOpen] = React.useState(false)
  const [anchor, setAnchor] = React.useState(null)

  return (
    <>
      <ActionIconButton
        ref={setAnchor}
        icon={Info}
        size={20}
        style='transparent'
        title='More information'
        onClick={() => setOpen(v => !v)}
      />
      <Tooltip {...{ open, anchor }} onClose={() => setOpen(false)}>
        {text}
      </Tooltip>
    </>
  )
}

export function InputPanel({
  generating,
  canGenerate,
  hasResult = false,
  hasImage = false,
  capabilities = [],
  resolution,
  onResolutionChange,
  onResolutionCommit,
  segmentMode,
  onSegmentModeChange,
  tolerance,
  onToleranceChange,
  pointCloud,
  onPointCloudChange,
  method,
  onMethodChange,
  mvSteps,
  onMvStepsChange,
  mvScheduler,
  onMvSchedulerChange,
  onGenerate,
  onDiscard,
  onFullDiscard,
  layoutClassName = undefined,
}) {
  const methodOptions = React.useMemo(() => {
    const opts = []
    if (capabilities.length > 0) {
      opts.push({ value: 'auto', label: 'Auto (best available)' })
      if (capabilities.includes('multiview') && capabilities.includes('reconstruct3d')) {
        opts.push({ value: 'reconstruct3d', label: 'Multi-view + Poisson' })
      }
      if (capabilities.includes('reconstruct')) {
        opts.push({ value: 'triposr', label: 'TripoSR' })
      }
    }
    opts.push({ value: 'depth', label: 'Depth only' })
    return opts
  }, [capabilities])

  const autoHint = method === 'auto' ? resolveAutoMethod(capabilities) : null

  // Show multiview options when the active pipeline uses Zero123++
  const showMultiviewOptions = React.useMemo(() => {
    const effective = method === 'auto' ? resolveAutoMethod(capabilities) : method
    return effective === 'Multi-view + Poisson' || effective === 'reconstruct3d'
  }, [method, capabilities])

  return (
    <div className={cx(styles.component, layoutClassName)}>
      <PanelContainerSettingsSectionHeader title='Reconstruction' />
      <PanelContainer>
        <PanelContainerSettingsRow label='Method'>
          <Dropdown
            value={method}
            onChange={onMethodChange}
            options={methodOptions}
          />
        </PanelContainerSettingsRow>

        {autoHint && (
          <span className={styles.autoHint}>→ {autoHint}</span>
        )}

        {/* Slider manages its own label and drag geometry — do not nest in PanelContainerSettingsRow */}
        <Slider
          label='Resolution'
          value={resolution}
          onChange={onResolutionChange}
          onCommit={onResolutionCommit}
          min={64}
          max={512}
          step={64}
        />
      </PanelContainer>

      {showMultiviewOptions && (
        <>
          <PanelContainerDivider />
          <PanelContainerSettingsSectionHeader title='Generation' />
          <PanelContainer>
            <PanelContainerSettingsRow label='Scheduler'>
              <div className={styles.rowWithInfo}>
                <Dropdown
                  value={mvScheduler}
                  onChange={onMvSchedulerChange}
                  options={SCHEDULER_OPTIONS}
                />
                <InfoTip text={SCHEDULER_INFO[mvScheduler] ?? ''} />
              </div>
            </PanelContainerSettingsRow>

            <Slider
              label='Steps'
              value={mvSteps}
              onChange={onMvStepsChange}
              min={10}
              max={50}
              step={1}
            />
            <div className={styles.stepsHintRow}>
              <span className={styles.stepsHint}>
                {mvScheduler === 'dpm++' ? 'DPM++ 2M works well at 15–20 steps.' : 'DDIM works best at 25–30 steps.'}
              </span>
              <InfoTip text={STEPS_INFO} />
            </div>
          </PanelContainer>
        </>
      )}

      <PanelContainerDivider />

      <PanelContainerSettingsSectionHeader title='Isolation' />
      <PanelContainer>
        <PanelContainerSettingsRow label='Method'>
          <Dropdown
            value={segmentMode}
            onChange={onSegmentModeChange}
            options={SEGMENT_OPTIONS}
          />
        </PanelContainerSettingsRow>

        {segmentMode === 'colorkey' && (
          <Slider
            label='Tolerance'
            value={tolerance}
            onChange={onToleranceChange}
            min={0.05}
            max={0.5}
            step={0.01}
          />
        )}
      </PanelContainer>

      <PanelContainerDivider />

      <PanelContainerSettingsSectionHeader title='View' />
      <PanelContainer>
        <PanelContainerSettingsRow label='Point cloud'>
          <Checkbox
            checked={pointCloud}
            onChange={onPointCloudChange}
          />
        </PanelContainerSettingsRow>
      </PanelContainer>

      <div className={styles.footer}>
        <Button
          label={generating ? 'Generating…' : 'Generate'}
          variant='solid'
          disabled={!canGenerate}
          onClick={() => { if (canGenerate) onGenerate() }}
          layoutClassName={styles.actionLayout}
        />
        {hasResult && !generating && (
          <GhostButton
            label='Regenerate'
            icon={RotateCcw}
            color='white'
            onClick={onDiscard}
            layoutClassName={styles.actionLayout}
          />
        )}
        {hasImage && !generating && (
          <GhostButton
            label='Discard model'
            icon={Trash2}
            color='dynamic'
            onClick={onFullDiscard}
            layoutClassName={styles.actionLayout}
          />
        )}
      </div>
    </div>
  )
}
