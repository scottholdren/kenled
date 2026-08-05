/** Default 16-color palette: the classic 4-bit CGA/RGBI palette (IRGB bit order).
 * Index 0 is black, which doubles as "off" — the original convention and ours. */
export const DEFAULT_PALETTE: string[] = [
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
