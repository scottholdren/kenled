import { useState } from 'react'
import { MAX_DIM, TARGET_LED_COUNT } from './types.ts'

const PRESETS: Array<[number, number]> = [
  [8, 8],
  [8, 10],
  [8, 12],
  [10, 10],
]

interface Props {
  onCreate: (cols: number, rows: number) => void
}

function SetupScreen({ onCreate }: Props) {
  const [cols, setCols] = useState(8)
  const [rows, setRows] = useState(10)

  const count = cols * rows
  const valid = cols >= 1 && rows >= 1 && cols <= MAX_DIM && rows <= MAX_DIM

  const clamp = (v: number) => Math.max(1, Math.min(MAX_DIM, Math.floor(v) || 1))

  return (
    <main className="setup">
      <h1>KenLED</h1>
      <p className="subtitle">Set up your LED matrix</p>

      <div className="presets">
        {PRESETS.map(([c, r]) => (
          <button
            key={`${c}x${r}`}
            className={c === cols && r === rows ? 'preset active' : 'preset'}
            onClick={() => {
              setCols(c)
              setRows(r)
            }}
          >
            {c}×{r}
          </button>
        ))}
      </div>

      <div className="dims">
        <label>
          Columns
          <input
            type="number"
            min={1}
            max={MAX_DIM}
            value={cols}
            onChange={(e) => setCols(clamp(e.target.valueAsNumber))}
          />
        </label>
        <span className="dims-x">×</span>
        <label>
          Rows
          <input
            type="number"
            min={1}
            max={MAX_DIM}
            value={rows}
            onChange={(e) => setRows(clamp(e.target.valueAsNumber))}
          />
        </label>
      </div>

      <p className="led-count">
        <strong>{count}</strong> LEDs
        <span className="led-note">
          {count === TARGET_LED_COUNT
            ? ' — right on target'
            : ` (target ~${TARGET_LED_COUNT} for the physical build)`}
        </span>
      </p>

      <button className="primary" disabled={!valid} onClick={() => onCreate(cols, rows)}>
        Start designing
      </button>
    </main>
  )
}

export default SetupScreen
