import { useEffect, useState, type CSSProperties } from 'react'
import type { Design } from './types.ts'

interface Props {
  design: Design
  onClose: () => void
}

function Preview({ design, onClose }: Props) {
  const { cols, rows, palette, frames, frameDurationMs } = design
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    if (!playing || frames.length < 2) return
    const id = setInterval(() => setIndex((i) => (i + 1) % frames.length), frameDurationMs)
    return () => clearInterval(id)
  }, [playing, frames.length, frameDurationMs])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return // don't steal keys from inputs
      if (e.key === 'Escape') onClose()
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const frame = frames[Math.min(index, frames.length - 1)]
  const style = {
    '--cols': cols,
    '--rows': rows,
    '--maxdim': Math.max(cols, rows),
  } as CSSProperties

  return (
    <div className="preview">
      <div className="grid preview-grid" style={style}>
        {frame.map((colorIndex, i) => {
          const c = palette[colorIndex]
          return (
            <div
              key={i}
              className={colorIndex === 0 ? 'cell dot off' : 'cell dot'}
              style={colorIndex === 0 ? undefined : { background: c, color: c }}
            />
          )
        })}
      </div>
      <div className="preview-controls">
        <button onClick={() => setPlaying(!playing)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        <span className="preview-info">
          frame {Math.min(index, frames.length - 1) + 1}/{frames.length} · {design.frameDurationMs} ms
        </span>
        <button onClick={onClose}>✏ Back to edit</button>
      </div>
    </div>
  )
}

export default Preview
