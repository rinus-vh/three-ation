import { ArrowRight, Check, Layers, Settings, Star, Zap } from 'lucide-react'
import {
  Button,
  ContextMenu,
  GhostButton,
  HeadingXs, HeadingSm, HeadingMd, HeadingLg, HeadingXl,
  Icon,
  LabelSm, LabelUppercaseSm,
  Link, LinkUnderline,
  Modal,
  ParagraphXs, ParagraphSm, ParagraphMd, ParagraphLg,
} from '@6njp/prototype-library'

import styles from './DesignOverview.module.css'

/** @param {{ layoutClassName?: string }} props */
export function DesignOverview({ layoutClassName = undefined }) {
  const [isModalOpen, setIsModalOpen] = React.useState(false)
  const [contextMenu, setContextMenu] = React.useState({ isOpen: false, x: 0, y: 0 })

  return (
    <div className={cx(styles.component, layoutClassName)}>
      <section className={styles.section}>
        <LabelUppercaseSm>
          Typography
        </LabelUppercaseSm>
        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Heading XL</LabelSm>
            <HeadingXl title='Prototype' />
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Heading LG</LabelSm>
            <HeadingLg title='Prototype' />
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Heading MD</LabelSm>
            <HeadingMd title='Prototype' />
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Heading SM</LabelSm>
            <HeadingSm title='Prototype' />
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Heading XS</LabelSm>
            <HeadingXs title='Prototype' />
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Paragraph LG</LabelSm>
            <ParagraphLg>
              Prototype placeholder text for a large paragraph.
            </ParagraphLg>
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Paragraph MD</LabelSm>
            <ParagraphMd>
              Prototype placeholder text for a medium paragraph.
            </ParagraphMd>
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Paragraph SM</LabelSm>
            <ParagraphSm>
              Prototype placeholder text for a small paragraph.
            </ParagraphSm>
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Paragraph XS</LabelSm>
            <ParagraphXs>
              Prototype placeholder text for a small paragraph.
            </ParagraphXs>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>
          Buttons
        </LabelUppercaseSm>
        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Solid</LabelSm>
            <div className={styles.rowContent}>
              <Button
                label='Prototype'
                variant='solid'
                onClick={() => {}}
              />
              <Button
                label='Prototype'
                variant='solid'
                icon={ArrowRight}
                onClick={() => {}}
              />
            </div>
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Outline</LabelSm>
            <div className={styles.rowContent}>
              <Button
                label='Prototype'
                variant='outline'
                onClick={() => {}}
              />
              <Button
                label='Prototype'
                variant='outline'
                icon={ArrowRight}
                onClick={() => {}}
              />
            </div>
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Ghost orange</LabelSm>
            <div className={styles.rowContent}>
              <GhostButton label='Prototype' color='orange' onClick={() => {}} />
              <GhostButton
                label='Prototype'
                color='orange'
                icon={Zap}
                onClick={() => {}}
              />
            </div>
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Ghost red</LabelSm>
            <div className={styles.rowContent}>
              <GhostButton label='Prototype' color='red' onClick={() => {}} />
              <GhostButton
                label='Prototype'
                color='red'
                icon={Zap}
                onClick={() => {}}
              />
            </div>
          </div>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Ghost white</LabelSm>
            <div className={styles.rowContent}>
              <GhostButton label='Prototype' color='white' onClick={() => {}} />
              <GhostButton
                label='Prototype'
                color='white'
                icon={Zap}
                onClick={() => {}}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>
          Links
        </LabelUppercaseSm>
        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Link</LabelSm>
            <div className={styles.rowContent}>
              <Link href='#' label='Prototype' />
              <LinkUnderline href='#' label='Prototype' />
              <Link
                href='#'
                label='Prototype'
                icon={ArrowRight}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>
          Icons
        </LabelUppercaseSm>
        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Lucide icons</LabelSm>
            <div className={styles.iconRow}>
              <Icon icon={ArrowRight} layoutClassName={styles.iconLayout} />
              <Icon icon={Layers} layoutClassName={styles.iconLayout} />
              <Icon icon={Check} layoutClassName={styles.iconLayout} />
              <Icon icon={Star} layoutClassName={styles.iconLayout} />
              <Icon icon={Settings} layoutClassName={styles.iconLayout} />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>
          Context Menu
        </LabelUppercaseSm>
        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Interactive</LabelSm>
            <div
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY })
              }}
              className={styles.contextMenuTrigger}
            >
              <ParagraphSm>Right-click here to open context menu</ParagraphSm>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <LabelUppercaseSm>
          Modal
        </LabelUppercaseSm>
        <div className={styles.sectionBody}>
          <div className={styles.row}>
            <LabelSm layoutClassName={styles.rowLabelLayout}>Interactive</LabelSm>
            <Button label='Open Prototype modal' onClick={() => setIsModalOpen(true)} />
          </div>
        </div>
      </section>

      <ContextMenu
        isOpen={contextMenu.isOpen}
        x={contextMenu.x}
        y={contextMenu.y}
        onClose={() => setContextMenu(m => ({ ...m, isOpen: false }))}
        items={[
          { label: 'Edit', onClick: () => {} },
          { label: 'Duplicate', onClick: () => {} },
          { divider: true },
          { label: 'Delete', onClick: () => {} },
          { label: 'Disabled action', onClick: () => {}, disabled: true },
        ]}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title='Prototype'
      >
        <ParagraphMd>
          Prototype placeholder text for modal content. This demonstrates the
          floating-ui driven dialog element with backdrop click and Escape key
          to close.
        </ParagraphMd>
      </Modal>
    </div>
  )
}
