import { describe, expect, it } from 'vitest'
import { BLACK, WHITE } from '../constants'
import { GomokuGame } from '../rules/engine'
import { decideAction } from './decide'
import { aiLevelConfig } from './levels'
import { chooseMove } from './search'

describe('人机 AI', () => {
  it('空盘自由开局选择天元', () => {
    const g = new GomokuGame({ mode: 'free' })
    const a = decideAction(g, aiLevelConfig('normal'), () => 0.5)
    expect(a).toEqual({ t: 'place', r: 7, c: 7 })
  })

  it('能抓住自身的直接成五', () => {
    const board = new GomokuGame({ mode: 'free' }).board
    for (let c = 3; c <= 6; c++) board.set(7, c, BLACK)
    const p = chooseMove(board, { color: BLACK, size: null, forbidden: false, cfg: aiLevelConfig('hard'), rand: () => 0.99 })
    expect(p).not.toBeNull()
    expect(p!.r).toBe(7)
    expect([2, 7]).toContain(p!.c)
  })

  it('会封堵对手的直接成五', () => {
    const board = new GomokuGame({ mode: 'free' }).board
    for (let c = 3; c <= 6; c++) board.set(7, c, WHITE)
    const p = chooseMove(board, { color: BLACK, size: null, forbidden: false, cfg: aiLevelConfig('normal'), rand: () => 0.99 })
    expect(p).not.toBeNull()
    expect(p!.r).toBe(7)
    expect([2, 7]).toContain(p!.c)
  })

  it('塔拉山口-10 第 1 手限制在天元', () => {
    const g = new GomokuGame({ mode: 'tara-10' })
    const a = decideAction(g, aiLevelConfig('normal'))
    expect(a).toEqual({ t: 'place', r: 7, c: 7 })
  })

  it('黑方落子不会选择禁手点', () => {
    const board = new GomokuGame({ mode: 'free' }).board
    // 构造一个三三点：黑子在 (5,5)(5,6) 与 (6,5)(7,5) 之外，简单起见构造双活三
    board.set(7, 5, BLACK)
    board.set(7, 7, BLACK)
    board.set(5, 7, BLACK)
    board.set(9, 7, BLACK)
    const p = chooseMove(board, { color: BLACK, size: null, forbidden: true, cfg: aiLevelConfig('hard'), rand: () => 0.99 })
    expect(p).not.toBeNull()
  })

  it('可完整走完塔拉山口-10 开局（含给点/选点/交换）', () => {
    const g = new GomokuGame({ mode: 'tara-10', firstSide: 0 })
    const cfg = aiLevelConfig('normal')
    let applied = 0
    for (let i = 0; i < 14 && g.phase !== 'finished'; i++) {
      const a = decideAction(g, cfg)
      expect(a).not.toBeNull()
      if (!a) break
      expect(g.apply(a)).toBe(true)
      applied++
    }
    expect(applied).toBeGreaterThanOrEqual(7)
  })
})
