import { useEffect, useState } from 'react'
import type { Design, Tool } from './types.ts'
import Grid from './Grid.tsx'
import Palette from './Palette.tsx'
import FrameStrip from './FrameStrip.tsx'

interface Props {
  design: Design
  onChange: (design: Design) => void
  onNewProject: () => void
}

/** Undo history entries capture all frames plus which frame was active. */
interface HistoryEntry {
  frames: number[][]
  frame: number
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
  const [frameIndex, setFrameIndex] = useState(0)
  const [onion, setOnion] = useState(false)
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([])
  const [confirmNew, setConfirmNew] = useState(false)

  const frame = design.frames[frameIndex]

  const setFrames = (frames: number[][], nextIndex = frameIndex) => {
    onChange({ ...design, frames })
    setFrameIndex(nextIndex)
  }

  const setFrame = (next: number[]) => {
    const frames = design.frames.slice()
    frames[frameIndex] = next
    onChange({ ...design, frames })
  }

  const snapshot = () => {
    setUndoStack((u) => [...u.slice(-49), { frames: design.frames, frame: frameIndex }])
    setRedoStack([])
  }

  const undo = () => {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(undoStack.slice(0, -1))
    setRedoStack([...redoStack, { frames: design.frames, frame: frameIndex }])
    setFrames(prev.frames, Math.min(prev.frame, prev.frames.length - 1))
  }

  const redo = () => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setRedoStack(redoStack.slice(0, -1))
    setUndoStack([...undoStack, { frames: design.frames, frame: frameIndex }])
    setFrames(next.frames, Math.min(next.frame, next.frames.length - 1))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (e.key === 'ArrowLeft' && frameIndex > 0) setFrameIndex(frameIndex - 1)
      if (e.key === 'ArrowRight' && frameIndex < design.frames.length - 1) setFrameIndex(frameIndex + 1)
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

  const addFrame = () => {
    snapshot()
    const frames = design.frames.slice()
    frames.splice(frameIndex + 1, 0, new Array<number>(frame.length).fill(0))
    setFrames(frames, frameIndex + 1)
  }

  const duplicateFrame = () => {
    snapshot()
    const frames = design.frames.slice()
    frames.splice(frameIndex + 1, 0, frame.slice())
    setFrames(frames, frameIndex + 1)
  }

  const deleteFrame = () => {
    if (design.frames.length <= 1) return
    snapshot()
    const frames = design.frames.slice()
    frames.splice(frameIndex, 1)
    setFrames(frames, Math.min(frameIndex, frames.length - 1))
  }

  const moveFrame = (dir: -1 | 1) => {
    const target = frameIndex + dir
    if (target < 0 || target >= design.frames.length) return
    snapshot()
    const frames = design.frames.slice()
    ;[frames[frameIndex], frames[target]] = [frames[target], frames[frameIndex]]
    setFrames(frames, target)
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
          {design.cols}×{design.rows} · {design.cols * design.rows} LEDs · frame {frameIndex + 1}/
          {design.frames.length}
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
          onionFrame={onion && frameIndex > 0 ? design.frames[frameIndex - 1] : null}
          onStrokeStart={snapshot}
          onPaintCell={paintCell}
          onFillCell={fillCell}
        />
      </div>

      <FrameStrip
        design={design}
        current={frameIndex}
        onion={onion}
        onSelect={setFrameIndex}
        onAdd={addFrame}
        onDuplicate={duplicateFrame}
        onDelete={deleteFrame}
        onMove={moveFrame}
        onToggleOnion={() => setOnion(!onion)}
        onDuration={(ms) => onChange({ ...design, frameDurationMs: ms })}
      />

      <footer className="palettebar">
        <Palette
          palette={design.palette}
          selected={selectedColor}
          onSelect={setSelectedColor}
          onEditColor={editColor}
        />
        <p className="hint">
          Click/drag to paint · right-click to erase · ←/→ switch frames · ✎ edits the selected color
        </p>
      </footer>
    </div>
  )
}

export default Editor
