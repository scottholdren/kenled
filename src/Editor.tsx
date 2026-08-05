import { useEffect, useState } from 'react'
import type { Design, Tool } from './types.ts'
import Grid from './Grid.tsx'
import Palette from './Palette.tsx'

interface Props {
  design: Design
  onChange: (design: Design) => void
  onNewProject: () => void
}

function floodFill(frame: number[], cols: number, start: number, color: number): number[] {
  const target = frame[start]
  if (target === color) return frame
  const next = frame.slice()
  const queue = [start]
  while (queue.length > 0) {
    const i = queue.pop()!
    if (next[i] !== target) continue
    next[i] = color
    const x = i % cols
    if (x > 0) queue.push(i - 1)
    if (x < cols - 1) queue.push(i + 1)
    if (i - cols >= 0) queue.push(i - cols)
    if (i + cols < next.length) queue.push(i + cols)
  }
  return next
}

function Editor({ design, onChange, onNewProject }: Props) {
  const [selectedColor, setSelectedColor] = useState(1)
  const [tool, setTool] = useState<Tool>('paint')
  const [undoStack, setUndoStack] = useState<number[][]>([])
  const [redoStack, setRedoStack] = useState<number[][]>([])
  const [confirmNew, setConfirmNew] = useState(false)

  const frameIndex = 0
  const frame = design.frames[frameIndex]

  const setFrame = (next: number[]) => {
    const frames = design.frames.slice()
    frames[frameIndex] = next
    onChange({ ...design, frames })
  }

  const snapshot = () => {
    setUndoStack((u) => [...u.slice(-49), frame])
    setRedoStack([])
  }

  const undo = () => {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(undoStack.slice(0, -1))
    setRedoStack([...redoStack, frame])
    setFrame(prev)
  }

  const redo = () => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setRedoStack(redoStack.slice(0, -1))
    setUndoStack([...undoStack, frame])
    setFrame(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const paintCell = (cell: number, erase: boolean) => {
    const color = erase || tool === 'erase' ? 0 : selectedColor
    if (frame[cell] === color) return
    const next = frame.slice()
    next[cell] = color
    setFrame(next)
  }

  const fillCell = (cell: number) => {
    const color = tool === 'erase' ? 0 : selectedColor
    const next = floodFill(frame, design.cols, cell, color)
    if (next === frame) return
    snapshot()
    setFrame(next)
  }

  const clearFrame = () => {
    if (frame.every((c) => c === 0)) return
    snapshot()
    setFrame(new Array<number>(frame.length).fill(0))
  }

  const editColor = (index: number, color: string) => {
    const palette = design.palette.slice()
    palette[index] = color
    onChange({ ...design, palette })
  }

  return (
    <div className="editor">
      <header className="topbar">
        <span className="brand">KenLED</span>
        <span className="grid-info">
          {design.cols}×{design.rows} · {design.cols * design.rows} LEDs
        </span>
        {confirmNew ? (
          <span className="confirm-new">
            Discard design?
            <button onClick={onNewProject}>Discard</button>
            <button onClick={() => setConfirmNew(false)}>Cancel</button>
          </span>
        ) : (
          <button onClick={() => setConfirmNew(true)}>New…</button>
        )}
      </header>

      <div className="toolbar">
        <div className="tool-group">
          {(['paint', 'fill', 'erase'] as Tool[]).map((t) => (
            <button key={t} className={t === tool ? 'active' : ''} onClick={() => setTool(t)}>
              {t === 'paint' ? '🖌 Paint' : t === 'fill' ? '🪣 Fill' : '⌫ Erase'}
            </button>
          ))}
        </div>
        <div className="tool-group">
          <button onClick={undo} disabled={undoStack.length === 0}>
            ↩ Undo
          </button>
          <button onClick={redo} disabled={redoStack.length === 0}>
            ↪ Redo
          </button>
          <button onClick={clearFrame}>Clear</button>
        </div>
      </div>

      <div className="stage">
        <Grid
          design={design}
          frameIndex={frameIndex}
          fillMode={tool === 'fill'}
          onStrokeStart={snapshot}
          onPaintCell={paintCell}
          onFillCell={fillCell}
        />
      </div>

      <footer className="palettebar">
        <Palette
          palette={design.palette}
          selected={selectedColor}
          onSelect={setSelectedColor}
          onEditColor={editColor}
        />
        <p className="hint">Click/drag to paint · right-click to erase · ✎ on the selected swatch edits its color</p>
      </footer>
    </div>
  )
}

export default Editor
