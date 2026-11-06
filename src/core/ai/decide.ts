import type { Board } from '../board'
import { BLACK, CENTER, other, withinSquare } from '../constants'
import type { Action, GomokuGame } from '../rules/engine'
import type { Point } from '../types'
import { evaluateBoard, isForbiddenMove, pointScore } from './evaluate'
import type { AiLevelConfig } from './levels'
import { chooseMove } from './search'

/** 在 size×size 区域内挑选 count 个对黑方价值最高的空点（剔除禁手点） */
function offerPoints(board: Board, size: number, count: number): Point[] {
  const area: { p: Point; v: number }[] = []
  const n = board.size
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const p = { r, c }
      if (board.get(r, c) !== 0) continue
      if (!withinSquare(p, size, CENTER)) continue
      if (isForbiddenMove(board, p)) continue
      area.push({ p, v: pointScore(board, p, BLACK) })
    }
  }
  area.sort((a, b) => b.v - a.v)
  return area.slice(0, count).map((x) => x.p)
}

/**
 * 依据引擎当前期望，给出 AI 应执行的动作。
 * 覆盖落子 / 交换 / 五手方式 / 给点 / 选点全部开局输入。
 */
export function decideAction(engine: GomokuGame, cfg: AiLevelConfig, rand: () => number = Math.random): Action | null {
  const exp = engine.getExpectation()
  const board = engine.board
  const forbid = engine.forbiddenEnabled

  switch (exp.kind) {
    case 'end':
      return null

    case 'stone': {
      const p = chooseMove(board, {
        color: exp.color,
        size: exp.size,
        forbidden: forbid && exp.color === BLACK,
        cfg,
        rand
      })
      return p ? { t: 'place', r: p.r, c: p.c } : null
    }

    case 'swap': {
      // 若“换成对手颜色”更优（开局黑方占优）则交换
      const blackAdv = evaluateBoard(board, BLACK) - evaluateBoard(board, other(BLACK))
      const wouldBe = other(exp.color)
      const want = wouldBe === BLACK ? blackAdv : -blackAdv
      return want > 4000 ? { t: 'swap' } : { t: 'noswap' }
    }

    case 'fifth-mode':
      // 低难度走单五打；普通及以上走十打，掌握更多主动权
      return cfg.depth <= 2 ? { t: 'fifth-single' } : { t: 'fifth-ten' }

    case 'offer':
      return { t: 'offer', points: offerPoints(board, exp.size, exp.count) }

    case 'pick': {
      // 白方从黑方给点中挑对黑方价值最低者
      let best: Point | null = null
      let bestVal = Number.POSITIVE_INFINITY
      for (const p of exp.options) {
        const v = pointScore(board, p, BLACK)
        if (v < bestVal) {
          bestVal = v
          best = p
        }
      }
      return best ? { t: 'pick', r: best.r, c: best.c } : null
    }

    default:
      return null
  }
}
