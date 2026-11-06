import type { Board } from '../board'
import { BLACK, CENTER, other, withinSquare } from '../constants'
import { checkForbidden } from '../rules/forbidden'
import { analyzePoint, findFive, type PointShapes } from '../rules/shapes'
import type { Color, Point } from '../types'

/** 成五分值 */
export const WIN_SCORE = 10_000_000

const NEIGHBORS8: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1]
]

/** 与任一已有棋子相邻（八邻域）的空点 */
export function neighborPoints(board: Board): Point[] {
  const res: Point[] = []
  const n = board.size
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (board.get(r, c) !== 0) continue
      let near = false
      for (const [dr, dc] of NEIGHBORS8) {
        if (board.get(r + dr, c + dc) > 0) {
          near = true
          break
        }
      }
      if (near) res.push({ r, c })
    }
  }
  return res
}

/** 将某点棋形折算为分值 */
export function shapeValue(s: PointShapes): number {
  if (s.five) return WIN_SCORE
  let v = 0
  if (s.liveFourCount > 0) v += 500_000 + s.liveFourCount * 20_000
  if (s.fourCount > 0) v += 60_000 + s.fourCount * 6_000
  if (s.openThreeCount > 0) v += 9_000 + s.openThreeCount * 2_000
  if (s.sleepThreeCount > 0) v += 900
  if (s.openTwoCount > 0) v += 140
  if (s.sleepTwoCount > 0) v += 25
  return v
}

/** 在某空点落 color 后的棋形分值（不改动棋盘）；非空返回 -Infinity */
export function pointScore(board: Board, p: Point, color: Color): number {
  if (board.get(p.r, p.c) !== 0) return Number.NEGATIVE_INFINITY
  board.set(p.r, p.c, color)
  const v = shapeValue(analyzePoint(board, p, color))
  board.set(p.r, p.c, 0)
  return v
}

/** 该点落子是否直接成五 */
export function isWinningMove(board: Board, p: Point, color: Color): boolean {
  if (board.get(p.r, p.c) !== 0) return false
  board.set(p.r, p.c, color)
  const w = !!findFive(board, p, color)
  board.set(p.r, p.c, 0)
  return w
}

/** 该点落黑子是否构成禁手 */
export function isForbiddenMove(board: Board, p: Point): boolean {
  if (board.get(p.r, p.c) !== 0) return false
  board.set(p.r, p.c, BLACK)
  const f = checkForbidden(board, p)
  board.set(p.r, p.c, 0)
  return f !== null
}

/** 局面评估：color 的相对优势（正数表示 color 占优） */
export function evaluateBoard(board: Board, color: Color): number {
  const opp = other(color)
  let mine = 0
  let theirs = 0
  for (const p of neighborPoints(board)) {
    board.set(p.r, p.c, color)
    mine += shapeValue(analyzePoint(board, p, color))
    board.set(p.r, p.c, opp)
    theirs += shapeValue(analyzePoint(board, p, opp))
    board.set(p.r, p.c, 0)
  }
  return mine - theirs * 1.06
}

/** 合法候选点（区域内、非禁手） */
export function legalCandidates(board: Board, color: Color, size: number | null, forbidden: boolean): Point[] {
  const res: Point[] = []
  for (const p of neighborPoints(board)) {
    if (size !== null && !withinSquare(p, size, CENTER)) continue
    if (forbidden && color === BLACK && isForbiddenMove(board, p)) continue
    res.push(p)
  }
  return res
}
