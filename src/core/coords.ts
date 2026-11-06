import type { Point } from './types'

/** 列号 -> 字母：0 -> A ... 14 -> O */
export const colLetter = (c: number): string => String.fromCharCode(65 + c)

/** 内部坐标 -> 竞赛记谱坐标，如 (r=7,c=7) -> "H8" */
export function toLabel(p: Point): string {
  return `${colLetter(p.c)}${p.r + 1}`
}

/** 记谱坐标 -> 内部坐标，如 "H8" -> {r:7,c:7} */
export function fromLabel(s: string): Point | null {
  const m = /^([A-Za-z])(\d{1,2})$/.exec(s.trim())
  if (!m) return null
  const c = m[1].toUpperCase().charCodeAt(0) - 65
  const r = parseInt(m[2], 10) - 1
  if (c < 0 || c > 14 || r < 0 || r > 14) return null
  return { r, c }
}

/** 是否为同一坐标 */
export const samePoint = (a: Point, b: Point): boolean => a.r === b.r && a.c === b.c
