import type { Board } from '../board'
import { BLACK } from '../constants'
import type { ForbiddenInfo, ForbiddenType, Point } from '../types'
import { analyzePoint } from './shapes'

/**
 * 判定黑方在 p 落子是否禁手（要求 board 已在 p 落下黑子）。
 * 规则第 19.1.2 条：五连与禁手同时形成时优先判五连，故此处若已成五连则返回 null。
 * 返回 null 表示非禁手。
 */
export function checkForbidden(board: Board, p: Point): ForbiddenInfo | null {
  const s = analyzePoint(board, p, BLACK)
  if (s.five) return null // 五连优先，黑胜

  const types: ForbiddenType[] = []
  if (s.overline) types.push('overline')
  if (s.fourCount >= 2) types.push('four-four')
  if (s.openThreeCount >= 2) types.push('three-three')

  if (types.length === 0) return null
  return { point: p, types }
}

/** 扫描当前局面下所有“黑方禁手点”（用于界面提示） */
export function scanForbiddenPoints(board: Board): ForbiddenInfo[] {
  const res: ForbiddenInfo[] = []
  const n = board.size
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!board.isEmpty(r, c)) continue
      board.set(r, c, BLACK)
      const f = checkForbidden(board, { r, c })
      board.set(r, c, 0)
      if (f) res.push(f)
    }
  }
  return res
}

/** 中文描述 */
export const forbiddenLabel = (t: ForbiddenType): string =>
  t === 'overline' ? '长连' : t === 'four-four' ? '四四' : '三三'
