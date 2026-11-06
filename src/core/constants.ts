import type { Color, Point } from './types'

export const BOARD_SIZE = 15

export const BLACK: Color = 1
export const WHITE: Color = 2

export const other = (c: Color): Color => (c === BLACK ? WHITE : BLACK)

/** 天元 H8 -> (r=7, c=7) */
export const CENTER: Point = { r: 7, c: 7 }

/** 星位：D4 / L4 / D12 / L12 + 天元 */
export const STAR_POINTS: Point[] = [
  { r: 3, c: 3 },
  { r: 3, c: 11 },
  { r: 11, c: 3 },
  { r: 11, c: 11 },
  { r: 7, c: 7 }
]

/** 四个方向：横、纵、主对角(↗)、副对角(↘) */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
]

/** 以天元为中心的方形区域内可落子（边长为 n 的方框） */
export function withinSquare(p: Point, n: number, center: Point = CENTER): boolean {
  const half = Math.floor(n / 2)
  return Math.abs(p.r - center.r) <= half && Math.abs(p.c - center.c) <= half
}

export const colorName = (c: Color): string => (c === BLACK ? '黑' : '白')
