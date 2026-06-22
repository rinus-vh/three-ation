import styles from './ServerOutputPanel.module.css'

const SERVER = 'http://127.0.0.1:8765'
const POLL_MS = 600

export function ServerOutputPanel({ layoutClassName = undefined }) {
  const [lines, setLines] = React.useState([])
  const seqRef  = React.useRef(0)
  const bottomRef = React.useRef(null)

  React.useEffect(() => {
    let cancelled = false

    async function poll() {
      if (cancelled) return
      try {
        const res = await fetch(`${SERVER}/logs?since=${seqRef.current}`)
        if (res.ok) {
          const fresh = await res.json()
          if (fresh.length > 0 && !cancelled) {
            seqRef.current = fresh[fresh.length - 1].seq
            setLines(prev => [...prev, ...fresh].slice(-500))
          }
        }
      } catch {
        // server temporarily busy — back off and retry
        if (!cancelled) setTimeout(poll, POLL_MS * 8)
        return
      }
      if (!cancelled) setTimeout(poll, POLL_MS)
    }

    poll()
    return () => { cancelled = true }
  }, [])

  // Auto-scroll to bottom when new lines arrive
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div className={cx(styles.component, layoutClassName)}>
      <pre className={styles.log}>
        {lines.length === 0
          ? <span className={styles.empty}>Waiting for server output…</span>
          : lines.map(l => <span key={l.seq} className={styles.line}>{l.text}</span>)
        }
        <span ref={bottomRef} />
      </pre>
    </div>
  )
}
