import { useRef, type CSSProperties, type PointerEvent } from 'react'
import type { Design } from './types.ts'

interface Props {
  design: Design
  frameIndex: number
  /** Called once when a paint gesture (stroke) begins, before any cells change. */
  onStrokeStart: () => void
  /** Paint a single cell. erase=true forces color 0 (right-button drag). */
  onPaintCell: (cellIndex: number, erase: boolean) => void
  /** Fill tool tap. */
  onFillCell: (cellIndex: number) => void
  fillMode: boolean
  /** Previous frame to ghost under off cells (onion skin), or null. */
  onionFrame: number[] | null
}

function Grid({ design, frameIndex, onStrokeStart, onPaintCell, onFillCell, fillMode, onionFrame }: Props) {
  const { cols, rows, palette } = design
  const frame = design.frames[frameIndex]
  // null = no active stroke; otherwise whether the stroke is erasing (right button)
  const strokeErase = useRef<boolean | null>(null)

  const cellAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const idx = el instanceof HTMLElement ? el.dataset.cell : undefined
    return idx === undefined ? null : Number(idx)
  }

  const handleDown = (e: PointerEvent<HTMLDivElement>) => {
    const cell = cellAt(e)
    if (cell === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const erase = e.button === 2
    if (fillMode && !erase) {
      onFillCell(cell)
      return
    }
    strokeErase.current = erase
    onStrokeStart()
    onPaintCell(cell, erase)
  }

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (strokeErase.current === null) return
    const cell = cellAt(e)
    if (cell !== null) onPaintCell(cell, strokeErase.current)
  }

  const endStroke = () => {
    strokeErase.current = null
  }

  const style = {
    '--cols': cols,
    '--rows': rows,
    '--maxdim': Math.max(cols, rows),
  } as CSSProperties

  return (
    <div
      className="grid"
      style={style}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onContextMenu={(e) => e.preventDefault()}
    >
      {frame.map((colorIndex, i) => {
        if (colorIndex !== 0) {
          const c = palette[colorIndex]
          return <div key={i} data-cell={i} className="cell" style={{ background: c, color: c }} />
        }
        const ghost = onionFrame !== null && onionFrame[i] !== 0 ? palette[onionFrame[i]] : null
        return (
          <div
            key={i}
            data-cell={i}
            className="cell off"
            // hex + '3D' = ~24% alpha ghost of the previous frame
            style={ghost === null ? undefined : { background: `${ghost}3D` }}
          />
        )
      })}
    </div>
  )
}

export default Grid
