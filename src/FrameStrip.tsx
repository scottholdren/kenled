import { useEffect, useRef, useState } from 'react'
import type { Design } from './types.ts'

// Free-typing duration field: clamping on every keystroke makes multi-digit
// entry impossible (typing "500" clamps "5" to 30), so clamp on commit only.
function DurationInput({ value, onCommit }: { value: number; onCommit: (ms: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const v = Math.round(Number(draft))
    onCommit(Number.isFinite(v) && draft.trim() !== '' ? Math.max(30, Math.min(2000, v)) : value)
  }
  return (
    <input
      type="number"
      min={30}
      max={2000}
      step={5}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

interface ThumbProps {
  frame: number[]
  cols: number
  rows: number
  palette: string[]
}

function FrameThumb({ frame, cols, rows, palette }: ThumbProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#101016'
    ctx.fillRect(0, 0, cols, rows)
    for (let i = 0; i < frame.length; i++) {
      if (frame[i] === 0) continue
      ctx.fillStyle = palette[frame[i]]
      ctx.fillRect(i % cols, Math.floor(i / cols), 1, 1)
    }
  }, [frame, cols, rows, palette])

  return <canvas ref={ref} width={cols} height={rows} className="thumb-canvas" />
}

interface Props {
  design: Design
  current: number
  onion: boolean
  onSelect: (index: number) => void
  onAdd: () => void
  onDuplicate: () => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  onToggleOnion: () => void
  onDuration: (ms: number) => void
}

function FrameStrip({
  design,
  current,
  onion,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onToggleOnion,
  onDuration,
}: Props) {
  const { frames, cols, rows, palette, frameDurationMs } = design
  const fps = 1000 / frameDurationMs

  return (
    <div className="framebar">
      <div className="frames">
        {frames.map((frame, i) => (
          <button
            key={i}
            className={i === current ? 'frame-thumb selected' : 'frame-thumb'}
            onClick={() => onSelect(i)}
            title={`Frame ${i + 1}`}
          >
            <FrameThumb frame={frame} cols={cols} rows={rows} palette={palette} />
            <span className="frame-num">{i + 1}</span>
          </button>
        ))}
        <button className="frame-add" onClick={onAdd} title="Add blank frame">
          +
        </button>
      </div>
      <div className="frame-actions">
        <button onClick={onDuplicate} title="Duplicate frame">
          ⧉ Duplicate
        </button>
        <button onClick={onDelete} disabled={frames.length <= 1} title="Delete frame">
          🗑 Delete
        </button>
        <button onClick={() => onMove(-1)} disabled={current === 0} title="Move frame left">
          ◀
        </button>
        <button onClick={() => onMove(1)} disabled={current === frames.length - 1} title="Move frame right">
          ▶
        </button>
        <button className={onion ? 'active' : ''} onClick={onToggleOnion} title="Ghost of previous frame">
          👻 Onion
        </button>
        <label className="duration">
          <DurationInput value={frameDurationMs} onCommit={onDuration} />
          ms/frame · {fps >= 10 ? Math.round(fps) : fps.toFixed(1)} fps
        </label>
      </div>
    </div>
  )
}

export default FrameStrip
