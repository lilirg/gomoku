import type { Board } from '../board'
import type { Color, Point } from '../types'
import { analyzePoint, findFive } from './shapes'

/** 该颜色下一步即可成五连的点（用于提示/威胁） */
export function findWinningPoints(board: Board, color: Color): Point[] {
  const res: Point[] = []
  const n = board.size
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!board.isEmpty(r, c)) continue
      board.set(r, c, color)
      if (findFive(board, { r, c }, color)) res.push({ r, c })
      board.set(r, c, 0)
    }
  }
  return res
}

/** 该颜色落子后能形成活四（必胜威胁）的点 */
export function findLiveFourPoints(board: Board, color: Color): Point[] {
  const res: Point[] = []
  const n = board.size
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!board.isEmpty(r, c)) continue
      board.set(r, c, color)
      const s = analyzePoint(board, { r, c }, color)
      if (s.liveFourCount > 0) res.push({ r, c })
      board.set(r, c, 0)
    }
  }
  return res
}
