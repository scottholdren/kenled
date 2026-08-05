import type { Design } from './types.ts'
import { MAX_DIM, PALETTE_SIZE } from './types.ts'

const KEY = 'kenled.v1'

export interface SavedProject {
  design: Design
  updatedAt: number
}

export interface ProjectSummary {
  id: string
  name: string
  cols: number
  rows: number
  frameCount: number
  updatedAt: number
}

interface Store {
  currentId: string | null
  projects: Record<string, SavedProject>
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw !== null) {
      const store = JSON.parse(raw) as Store
      if (store && typeof store === 'object' && store.projects) return store
    }
  } catch {
    // corrupted store falls through to a fresh one
  }
  return { currentId: null, projects: {} }
}

function writeStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function newId(): string {
  return crypto.randomUUID()
}

export function loadCurrent(): { id: string; design: Design } | null {
  const store = readStore()
  if (store.currentId === null) return null
  const saved = store.projects[store.currentId]
  if (!saved) return null
  const design = validateDesign(saved.design)
  return design === null ? null : { id: store.currentId, design }
}

export function loadProject(id: string): Design | null {
  const saved = readStore().projects[id]
  return saved ? validateDesign(saved.design) : null
}

export function saveProject(id: string, design: Design) {
  const store = readStore()
  store.projects[id] = { design, updatedAt: Date.now() }
  store.currentId = id
  writeStore(store)
}

export function deleteProject(id: string) {
  const store = readStore()
  delete store.projects[id]
  if (store.currentId === id) store.currentId = null
  writeStore(store)
}

export function setCurrent(id: string | null) {
  const store = readStore()
  store.currentId = id
  writeStore(store)
}

export function listProjects(): ProjectSummary[] {
  const store = readStore()
  return Object.entries(store.projects)
    .map(([id, p]) => ({
      id,
      name: p.design.name || 'untitled',
      cols: p.design.cols,
      rows: p.design.rows,
      frameCount: p.design.frames.length,
      updatedAt: p.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** Validate untrusted design data (imported files, stored state). Returns a clean Design or null. */
export function validateDesign(data: unknown): Design | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>

  const cols = d.cols
  const rows = d.rows
  if (typeof cols !== 'number' || typeof rows !== 'number') return null
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) return null
  if (cols < 1 || rows < 1 || cols > MAX_DIM || rows > MAX_DIM) return null

  if (!Array.isArray(d.palette) || d.palette.length !== PALETTE_SIZE) return null
  if (!d.palette.every((c) => typeof c === 'string' && HEX.test(c))) return null

  const size = cols * rows
  if (!Array.isArray(d.frames) || d.frames.length < 1) return null
  const frames: number[][] = []
  for (const f of d.frames as unknown[]) {
    if (!Array.isArray(f) || f.length !== size) return null
    frames.push(
      f.map((v) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < PALETTE_SIZE ? (v as number) : 0)),
    )
  }

  const duration = typeof d.frameDurationMs === 'number' ? d.frameDurationMs : 125
  return {
    version: 1,
    name: typeof d.name === 'string' ? d.name.slice(0, 80) : 'untitled',
    cols,
    rows,
    frameDurationMs: Math.max(30, Math.min(2000, Math.round(duration))),
    palette: d.palette as string[],
    frames,
  }
}
