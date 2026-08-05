/** Palette presets. Index 0 is always black / "off" in both. Frames store
 * indices, so switching a project's preset re-skins existing pixels in place. */

/** Classic 4-bit CGA/RGBI palette (IRGB bit order, authentic brown at 6). */
export const CGA_PALETTE: string[] = [
  '#000000', // 0  black / off
  '#0000aa', // 1  blue
  '#00aa00', // 2  green
  '#00aaaa', // 3  cyan
  '#aa0000', // 4  red
  '#aa00aa', // 5  magenta
  '#aa5500', // 6  brown
  '#aaaaaa', // 7  light gray
  '#555555', // 8  dark gray
  '#5555ff', // 9  bright blue
  '#55ff55', // 10 bright green
  '#55ffff', // 11 bright cyan
  '#ff5555', // 12 bright red
  '#ff55ff', // 13 bright magenta
  '#ffff55', // 14 yellow
  '#ffffff', // 15 white
]

/** Minecraft wool colors (black wool dropped — redundant with off). */
export const WOOL_PALETTE: string[] = [
  '#000000', // off
  '#e9ecec', // white wool
  '#8e8e86', // light gray wool
  '#3e4447', // gray wool
  '#a12722', // red wool
  '#f07613', // orange wool
  '#f8c627', // yellow wool
  '#70b919', // lime wool
  '#546d1b', // green wool
  '#158991', // cyan wool
  '#3aafd9', // light blue wool
  '#35399d', // blue wool
  '#792aac', // purple wool
  '#bd44b3', // magenta wool
  '#ed8dac', // pink wool
  '#724728', // brown wool
]

export const PRESET_PALETTES: Array<{ name: string; colors: string[] }> = [
  { name: 'CGA', colors: CGA_PALETTE },
  { name: 'Wool', colors: WOOL_PALETTE },
]

export const DEFAULT_PALETTE = CGA_PALETTE
