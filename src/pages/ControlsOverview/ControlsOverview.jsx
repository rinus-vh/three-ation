import { Info } from 'lucide-react'
import {
  Button,
  Checkbox,
  ColorInput,
  ColorPicker,
  Dropdown,
  FileUpload,
  Knob,
  KnobWithOffset,
  LabelSm, LabelUppercaseSm,
  ParagraphXs,
  RadioGroup,
  Slider,
  TextInput,
  Tooltip,
} from '@6njp/prototype-library'

import styles from './ControlsOverview.module.css'

/** @param {{ layoutClassName?: string }} props */
export function ControlsOverview({ layoutClassName = undefined }) {
  const [knobA, setKnobA] = React.useState(42)
  const [knobB, setKnobB] = React.useState(75)
  const [knobC, setKnobC] = React.useState(10)
  const [knobOffset, setKnobOffset] = React.useState(50)
  const [knobOffsetRange, setKnobOffsetRange] = React.useState(20)
  const [sliderA, setSliderA] = React.useState(60)
  const [sliderB, setSliderB] = React.useState(30)
  const [checkA, setCheckA] = React.useState(true)
  const [checkB, setCheckB] = React.useState(false)
  const [checkC, setCheckC] = React.useState(true)
  const [radioVal, setRadioVal] = React.useState('b')
  const [dropVal, setDropVal] = React.useState(null)
  const [textA, setTextA] = React.useState('')
  const [textB, setTextB] = React.useState('Hello world')
  const [uploadedFile, setUploadedFile] = React.useState(null)
  const [tooltipAnchor, setTooltipAnchor] = React.useState(null)
  const [tooltipOpen, setTooltipOpen] = React.useState(false)
  const [colorA, setColorA] = React.useState('#e05c2a')
  const [colorB, setColorB] = React.useState('#2a7ae0')

  return (
    <div className={cx(styles.component, layoutClassName)}>
      <section className={styles.section}>
        <LabelUppercaseSm>Knob</LabelUppercaseSm>

        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Default</LabelSm>
            <div className={styles.knobRow}>
              <Knob
                value={knobA}
                onChange={setKnobA}
                min={0}
                max={100}
                step={1}
                label='Volume'
              />
              <Knob
                value={knobB}
                onChange={setKnobB}
                min={0}
                max={200}
                step={5}
                label='Frequency'
              />
              <Knob
                value={knobC}
                onChange={setKnobC}
                min={0}
                max={100}
                step={0.1}
                label='Pan'
              />
            </div>
          </div>

          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Fine (shift)</LabelSm>
            <ParagraphXs>
              Hold Shift while dragging for fine scrubbing. <br />
              Double-click to type a value.
            </ParagraphXs>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>Knob with offset</LabelUppercaseSm>

        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>With offset arc</LabelSm>
            <div className={styles.knobRow}>
              <KnobWithOffset
                value={knobOffset}
                onChange={setKnobOffset}
                offset={knobOffsetRange}
                onOffsetChange={setKnobOffsetRange}
                min={0}
                max={100}
                step={1}
                label='Detune'
              />
            </div>
          </div>

          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Cmd/Ctrl + drag</LabelSm>
            <ParagraphXs>
              Hold Cmd (Mac) or Ctrl (Win) while dragging to adjust the offset arc.
            </ParagraphXs>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>Slider</LabelUppercaseSm>

        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Horizontal</LabelSm>
            <div className={styles.sliderStack}>
              <Slider
                value={sliderA}
                onChange={setSliderA}
                min={0}
                max={100}
                step={1}
                label='Gain'
              />
              <Slider
                value={sliderB}
                onChange={setSliderB}
                min={-50}
                max={50}
                step={1}
                label='Offset'
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>Checkbox</LabelUppercaseSm>

        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Default</LabelSm>
            <div className={styles.rowContent}>
              <Checkbox
                checked={checkA}
                onChange={setCheckA}
                label='Enable feature'
              />
              <Checkbox
                checked={checkB}
                onChange={setCheckB}
                label='Dark mode'
              />
              <Checkbox
                checked={checkC}
                onChange={setCheckC}
                label='Auto-save'
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>Radio</LabelUppercaseSm>

        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Single select</LabelSm>
            <RadioGroup
              name='demo-radio'
              value={radioVal}
              onChange={setRadioVal}
              options={[
                { value: 'a', label: 'Option A' },
                { value: 'b', label: 'Option B' },
                { value: 'c', label: 'Option C' },
              ]}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>Dropdown</LabelUppercaseSm>

        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Select</LabelSm>
            <Dropdown
              value={dropVal}
              onChange={setDropVal}
              placeholder='Choose a preset…'
              options={[
                { value: 'sine', label: 'Sine wave' },
                { value: 'square', label: 'Square wave' },
                { value: 'sawtooth', label: 'Sawtooth' },
                { value: 'triangle', label: 'Triangle' },
              ]}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>Text input</LabelUppercaseSm>

        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Empty</LabelSm>
            <TextInput
              value={textA}
              onChange={setTextA}
              placeholder='Type something…'
              label='Name'
            />
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>With value</LabelSm>
            <TextInput
              value={textB}
              onChange={setTextB}
              label='Message'
            />
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Disabled</LabelSm>
            <TextInput
              disabled
              value='Read only'
              onChange={() => {}}
              label='Disabled'
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>File upload</LabelUppercaseSm>

        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Default</LabelSm>
            <div className={styles.rowContent}>
              <FileUpload
                onFile={setUploadedFile}
                label='Upload file'
                accept={['.png', '.jpg', '.svg']}
              />
              {uploadedFile && (
                <ParagraphXs>{uploadedFile.name}</ParagraphXs>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>Tooltip</LabelUppercaseSm>

        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Anchored</LabelSm>
            <div className={styles.rowContent}>
              <Button
                label='Show tooltip'
                variant='outline'
                icon={Info}
                onClick={e => {
                  setTooltipAnchor(e.currentTarget)
                  setTooltipOpen(v => !v)
                }}
              />
              <Tooltip
                anchor={tooltipAnchor}
                open={tooltipOpen}
                onClose={() => setTooltipOpen(false)}
              >
                <ParagraphXs>
                  This is a tooltip anchored to the button above. Click outside or press Escape to dismiss.
                </ParagraphXs>
              </Tooltip>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>Color</LabelUppercaseSm>

        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Picker</LabelSm>
            <ColorPicker value={colorA} onChange={setColorA} />
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Input</LabelSm>
            <div className={styles.rowContent}>
              <ColorInput value={colorA} onChange={setColorA} />
              <ColorInput value={colorB} onChange={setColorB} />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
