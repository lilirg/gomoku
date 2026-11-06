import type { Board } from '../board'
import { BLACK, CENTER, other, withinSquare } from '../constants'
import { findFive } from '../rules/shapes'
import type { Color, Point } from '../types'
import { evaluateBoard, isForbiddenMove, isWinningMove, neighborPoints, pointScore, WIN_SCORE } from './evaluate'
import type { AiLevelConfig } from './levels'

interface RankedMove {
  p: Point
  score: number
}

export interface SearchInput {
  color: Color
  size: number | null
  forbidden: boolean
  cfg: AiLevelConfig
  rand: () => number
}

/** 候选点排序：进攻价值 + 防守价值（略降权） */
function rankMoves(board: Board, color: Color, size: number | null, forbidden: boolean, limit: number): RankedMove[] {
  const opp = other(color)
  const list: RankedMove[] = []
  for (const p of neighborPoints(board)) {
    if (size !== null && !withinSquare(p, size, CENTER)) continue
    if (forbidden && color === BLACK && isForbiddenMove(board, p)) continue
    const s = pointScore(board, p, color) + pointScore(board, p, opp) * 0.92
    list.push({ p, score: s })
  }
  list.sort((a, b) => b.score - a.score)
  return limit > 0 ? list.slice(0, limit) : list
}

function pickWeak(ranked: RankedMove[], cfg: AiLevelConfig, rand: () => number): Point {
  if (ranked.length === 0) return { ...CENTER }
  if (rand() < cfg.random) {
    const k = Math.min(4, ranked.length)
    return ranked[Math.floor(rand() * k)].p
  }
  return ranked[0].p
}

function negamax(
  board: Board,
  color: Color,
  depth: number,
  alpha: number,
  beta: number,
  size: number | null,
  forbidden: boolean,
  cfg: AiLevelConfig,
  deadline: number
): number {
  if (depth <= 0 || Date.now() >= deadline) return evaluateBoard(board, color)
  const moves = rankMoves(board, color, size, forbidden, cfg.candidates)
  if (moves.length === 0) return evaluateBoard(board, color)

  let a = alpha
  for (const m of moves) {
    board.set(m.p.r, m.p.c, color)
    let sc: number
    if (findFive(board, m.p, color)) {
      sc = WIN_SCORE - (cfg.depth - depth)
    } else {
      sc = -negamax(board, other(color), depth - 1, -beta, -a, size, forbidden, cfg, deadline)
    }
    board.set(m.p.r, m.p.c, 0)
    if (sc > a) a = sc
    if (a >= beta) break
  }
  return a
}

function rootSearch(
  board: Board,
  color: Color,
  depth: number,
  size: number | null,
  forbidden: boolean,
  cfg: AiLevelConfig,
  deadline: number,
  ranked: RankedMove[]
): RankedMove | null {
  let alpha = Number.NEGATIVE_INFINITY
  let best: RankedMove | null = null
  for (const m of ranked) {
    if (Date.now() >= deadline) break
    board.set(m.p.r, m.p.c, color)
    let sc: number
    if (findFive(board, m.p, color)) {
      sc = WIN_SCORE
    } else {
      sc = -negamax(board, other(color), depth - 1, Number.NEGATIVE_INFINITY, -alpha, size, forbidden, cfg, deadline)
    }
    board.set(m.p.r, m.p.c, 0)
    if (best === null || sc > alpha) {
      alpha = sc
      best = { p: m.p, score: sc }
    }
  }
  return best
}

/** 为 color 选点。返回 null 表示无合法点 */
export function chooseMove(board: Board, input: SearchInput): Point | null {
  const { color, size, forbidden, cfg, rand } = input
  const opp = other(color)

  if (board.count() === 0) return { ...CENTER }

  const ranked = rankMoves(board, color, size, forbidden, cfg.candidates)
  if (ranked.length === 0) return null

  // 我方直接成五
  for (const m of ranked) if (isWinningMove(board, m.p, color)) return m.p

  // 封堵对手直接成五（低难度有概率漏防）
  if (rand() >= cfg.blunder) {
    for (const p of neighborPoints(board)) {
      if (size !== null && !withinSquare(p, size, CENTER)) continue
      if (isWinningMove(board, p, opp)) return p
    }
  }

  if (cfg.depth <= 1) return pickWeak(ranked, cfg, rand)
  if (rand() < cfg.random) return pickWeak(ranked, cfg, rand)

  // 迭代加深
  const deadline = Date.now() + cfg.budgetMs
  let best = ranked[0].p
  for (let d = 2; d <= cfg.depth; d += 2) {
    const res = rootSearch(board, color, d, size, forbidden, cfg, deadline, ranked)
    if (res) best = res.p
    if (Date.now() >= deadline) break
  }
  return best
}
