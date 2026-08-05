import { useEffect, useRef, useState } from 'react'
import { MAX_DIM, TARGET_LED_COUNT, type Design } from './types.ts'
import { validateDesign, type ProjectSummary } from './storage.ts'

const PRESETS: Array<[number, number]> = [
  [10, 8],
  [8, 10],
  [8, 8],
  [10, 10],
]

interface Props {
  projects: ProjectSummary[]
  onCreate: (cols: number, rows: number) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onImport: (design: Design) => void
}

function SetupScreen({ projects, onCreate, onOpen, onDelete, onImport }: Props) {
  const [cols, setCols] = useState(10)
  const [rows, setRows] = useState(8)
  const [importError, setImportError] = useState<string | null>(null)
  const [atRisk, setAtRisk] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void navigator.storage
      ?.persisted?.()
      .then((persisted) => setAtRisk(!persisted))
      .catch(() => {})
  }, [])

  const count = cols * rows
  const valid = cols >= 1 && rows >= 1 && cols <= MAX_DIM && rows <= MAX_DIM

  const clamp = (v: number) => Math.max(1, Math.min(MAX_DIM, Math.floor(v) || 1))

  const handleImportFile = async (file: File) => {
    try {
      const design = validateDesign(JSON.parse(await file.text()))
      if (design === null) {
        setImportError('Not a valid KenLED design file.')
        return
      }
      onImport(design)
    } catch {
      setImportError('Could not read that file as JSON.')
    }
  }

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

      <div className="setup-secondary">
        <button onClick={() => fileRef.current?.click()}>⇪ Import .json</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleImportFile(file)
            e.target.value = ''
          }}
        />
      </div>
      {importError !== null && <p className="import-error">{importError}</p>}

      {atRisk && projects.length > 0 && (
        <p className="storage-note">
          Saves live in this browser and could be evicted — use 🔗 Share links or ⇓ export to keep work safe.
        </p>
      )}

      {projects.length > 0 && (
        <section className="saved">
          <h2>Saved designs</h2>
          <ul>
            {projects.map((p) => (
              <li key={p.id}>
                <button className="saved-open" onClick={() => onOpen(p.id)}>
                  <strong>{p.name}</strong>
                  <span>
                    {p.cols}×{p.rows} · {p.frameCount} frame{p.frameCount === 1 ? '' : 's'} ·{' '}
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </span>
                </button>
                <button className="saved-delete" title="Delete design" onClick={() => onDelete(p.id)}>
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

export default SetupScreen
