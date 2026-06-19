import { SettingsKeyframeTimeline } from '@6njp/prototype-library'

import styles from './TimelineOverview.module.css'

/** @param {{ layoutClassName?: string }} props */
export function TimelineOverview({ layoutClassName = undefined }) {
  const [tlTracks, setTlTracks] = React.useState(() => [
    {
      id: 'track_opacity',
      path: 'opacity',
      label: 'Opacity',
      muted: false,
      keyframes: [
        { id: 'kf_0', time: 0, value: 0 },
        { id: 'kf_1', time: 3, value: 1 },
        { id: 'kf_2', time: 6, value: 0 },
      ],
    },
    {
      id: 'track_scale',
      path: 'scale',
      label: 'Scale',
      muted: false,
      keyframes: [
        { id: 'kf_3', time: 0, value: 1 },
        { id: 'kf_4', time: 4, value: 2 },
        { id: 'kf_5', time: 6, value: 1 },
      ],
    },
    {
      id: 'track_x',
      path: 'position.x',
      label: 'Position X',
      muted: false,
      keyframes: [
        { id: 'kf_6', time: 1, value: -100 },
        { id: 'kf_7', time: 5, value: 100 },
      ],
    },
  ])
  const [tlPlayhead, setTlPlayheadState] = React.useState(0)
  const tlPlayheadRef = React.useRef(0)
  const [tlPlaying, setTlPlaying] = React.useState(false)
  const [tlLoop, setTlLoop] = React.useState(true)
  const [tlFps, setTlFps] = React.useState(30)
  const [tlRecording, setTlRecording] = React.useState(false)
  const [tlSelected, setTlSelected] = React.useState(() => new Set())

  const tlDuration = React.useMemo(() => {
    let max = 0
    for (const t of tlTracks) for (const k of t.keyframes) if (k.time > max) max = k.time
    return Math.max(1, max)
  }, [tlTracks])
  const tlDurationRef = React.useRef(tlDuration)
  tlDurationRef.current = tlDuration
  const tlPlayingRef = React.useRef(tlPlaying)
  tlPlayingRef.current = tlPlaying
  const tlLoopRef = React.useRef(tlLoop)
  tlLoopRef.current = tlLoop

  const setTlPlayhead = React.useCallback((t) => {
    const clamped = Math.max(0, Math.min(tlDurationRef.current, t))
    tlPlayheadRef.current = clamped
    setTlPlayheadState(clamped)
  }, [])

  React.useEffect(() => {
    let raf
    let prev = null
    const tick = (now) => {
      if (prev == null) prev = now
      const dt = (now - prev) / 1000
      prev = now
      if (tlPlayingRef.current) {
        let p = tlPlayheadRef.current + dt
        const dur = tlDurationRef.current
        if (p >= dur) {
          p = tlLoopRef.current ? (dur === 0 ? 0 : p % dur) : dur
          if (!tlLoopRef.current) { tlPlayingRef.current = false; setTlPlaying(false) }
        }
        tlPlayheadRef.current = p
        setTlPlayheadState(p)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const tlToggle = React.useCallback(() => {
    const next = !tlPlayingRef.current
    tlPlayingRef.current = next
    setTlPlaying(next)
  }, [])

  const tlPause = React.useCallback(() => {
    tlPlayingRef.current = false
    setTlPlaying(false)
  }, [])

  return (
    <div className={cx(styles.component, layoutClassName)}>
      <SettingsKeyframeTimeline
        tracks={tlTracks}
        playhead={tlPlayhead}
        playheadRef={tlPlayheadRef}
        playing={tlPlaying}
        loop={tlLoop}
        fps={tlFps}
        duration={tlDuration}
        recording={tlRecording}
        selectedKeyframes={tlSelected}
        onToggle={tlToggle}
        onPause={tlPause}
        onSetLoop={setTlLoop}
        onSetRecording={setTlRecording}
        onSetPlayhead={setTlPlayhead}
        onSetTrackMuted={(trackId, muted) =>
          setTlTracks(prev => prev.map(t => t.id === trackId ? { ...t, muted } : t))
        }
        onClearAll={() => setTlTracks([])}
        onSelectKeyframe={({ trackId, keyframeId, multi }) => {
          const key = `${trackId}::${keyframeId}`
          setTlSelected(prev => {
            const next = multi ? new Set(prev) : new Set()
            next.has(key) && multi ? next.delete(key) : next.add(key)
            return next
          })
        }}
        onMoveSelectedKeyframes={(trackId, keyframeId, newTime) => {
          setTlTracks(prev => prev.map(t => t.id !== trackId ? t : {
            ...t,
            keyframes: t.keyframes
              .map(k => k.id === keyframeId ? { ...k, time: Math.max(0, newTime) } : k)
              .sort((a, b) => a.time - b.time),
          }))
        }}
        onSelectKeyframesInBox={(items) => {
          setTlSelected(new Set(items.map(({ trackId, keyframeId }) => `${trackId}::${keyframeId}`)))
        }}
        onClearSelection={() => setTlSelected(new Set())}
        onSetFps={setTlFps}
      />
    </div>
  )
}
