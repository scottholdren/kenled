/** A full animation design. Frames are arrays of palette indices (0-15), row-major, top-left origin. */
export interface Design {
  version: 1
  name: string
  cols: number
  rows: number
  frameDurationMs: number
  palette: string[]
  frames: number[][]
}

export type Tool = 'paint' | 'fill' | 'erase'

export const MAX_DIM = 32
export const PALETTE_SIZE = 16
export const TARGET_LED_COUNT = 100

export function createDesign(cols: number, rows: number, palette: string[]): Design {
  return {
    version: 1,
    name: 'untitled',
    cols,
    rows,
    frameDurationMs: 125,
    palette,
    frames: [new Array<number>(cols * rows).fill(0)],
  }
}
