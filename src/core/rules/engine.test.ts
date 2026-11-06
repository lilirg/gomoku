import { describe, it, expect } from 'vitest'
import { GomokuGame } from './engine'
import { BLACK, WHITE } from '../constants'

describe('塔拉山口-10 开局', () => {
  it('完整走完开局并进入对局', () => {
    const g = new GomokuGame({ mode: 'tara-10', firstSide: 0 })
    // move1 黑天元
    expect(g.getExpectation().kind).toBe('stone')
    expect(g.apply({ t: 'place', r: 7, c: 7 })).toBe(true)
    // 交换权（白方）
    expect(g.getExpectation().kind).toBe('swap')
    expect(g.apply({ t: 'noswap' })).toBe(true)
    // move2 白 3x3
    expect(g.apply({ t: 'place', r: 6, c: 7 })).toBe(true)
    expect(g.apply({ t: 'noswap' })).toBe(true)
    // move3 黑 5x5
    expect(g.apply({ t: 'place', r: 5, c: 7 })).toBe(true)
    expect(g.apply({ t: 'noswap' })).toBe(true)
    // move4 白 7x7
    expect(g.apply({ t: 'place', r: 4, c: 7 })).toBe(true)
    expect(g.apply({ t: 'noswap' })).toBe(true)
    // 第 5 子模式选择
    expect(g.getExpectation().kind).toBe('fifth-mode')
    expect(g.apply({ t: 'fifth-single' })).toBe(true)
    // move5 黑 9x9
    expect(g.apply({ t: 'place', r: 3, c: 7 })).toBe(true)
    expect(g.getExpectation().kind).toBe('swap')
    expect(g.apply({ t: 'noswap' })).toBe(true)
    // move6 白 任意
    expect(g.apply({ t: 'place', r: 2, c: 7 })).toBe(true)
    expect(g.phase).toBe('playing')
    expect(g.moves.filter((m) => m.kind === 'stone').length).toBe(6)
  })

  it('区域限制：第 2 子不得超出 3x3', () => {
    const g = new GomokuGame({ mode: 'tara-10', firstSide: 0 })
    g.apply({ t: 'place', r: 7, c: 7 })
    g.apply({ t: 'noswap' })
    expect(g.apply({ t: 'place', r: 7, c: 10 })).toBe(false) // 超出 3x3
    expect(g.apply({ t: 'place', r: 7, c: 8 })).toBe(true) // 3x3 内
  })

  it('交换会翻转执黑方', () => {
    const g = new GomokuGame({ mode: 'tara-10', firstSide: 0 })
    g.apply({ t: 'place', r: 7, c: 7 })
    expect(g.blackSide).toBe(0)
    expect(g.apply({ t: 'swap' })).toBe(true)
    expect(g.blackSide).toBe(1)
    // 交换后由 side0 执白走第 2 子
    expect(g.sideOf(WHITE)).toBe(0)
  })

  it('十 5 分支：给出 10 个打点，白方选择其一', () => {
    const g = new GomokuGame({ mode: 'tara-10', firstSide: 0 })
    g.apply({ t: 'place', r: 7, c: 7 })
    g.apply({ t: 'noswap' })
    g.apply({ t: 'place', r: 6, c: 7 })
    g.apply({ t: 'noswap' })
    g.apply({ t: 'place', r: 5, c: 7 })
    g.apply({ t: 'noswap' })
    g.apply({ t: 'place', r: 4, c: 7 })
    g.apply({ t: 'noswap' })
    g.apply({ t: 'fifth-ten' })
    const exp = g.getExpectation()
    expect(exp.kind).toBe('offer')
    const pts = [
      { r: 3, c: 5 },
      { r: 3, c: 6 },
      { r: 3, c: 7 },
      { r: 3, c: 8 },
      { r: 3, c: 9 },
      { r: 4, c: 5 },
      { r: 4, c: 6 },
      { r: 4, c: 8 },
      { r: 5, c: 5 },
      { r: 5, c: 8 }
    ]
    expect(g.apply({ t: 'offer', points: pts })).toBe(true)
    expect(g.getExpectation().kind).toBe('pick')
    expect(g.apply({ t: 'pick', r: 3, c: 7 })).toBe(true)
    expect(g.getExpectation().kind).toBe('stone')
    expect(g.apply({ t: 'place', r: 2, c: 7 })).toBe(true)
    expect(g.moves.filter((m) => m.kind === 'stone').length).toBe(6)
  })
})

describe('Swap2 开局', () => {
  it('前 3 子后可直接以白方续弈', () => {
    const g = new GomokuGame({ mode: 'swap2', firstSide: 0 })
    g.apply({ t: 'place', r: 7, c: 7 })
    g.apply({ t: 'place', r: 6, c: 7 })
    g.apply({ t: 'place', r: 6, c: 8 })
    expect(g.getExpectation().kind).toBe('swap')
    g.apply({ t: 'noswap' })
    expect(g.phase).toBe('playing')
    expect(g.turn).toBe(WHITE)
  })

  it('扩展分支：再放两子后由对手选择', () => {
    const g = new GomokuGame({ mode: 'swap2', firstSide: 0 })
    g.apply({ t: 'place', r: 7, c: 7 })
    g.apply({ t: 'place', r: 6, c: 7 })
    g.apply({ t: 'place', r: 6, c: 8 })
    expect(g.apply({ t: 'extend' })).toBe(true)
    expect(g.getExpectation().kind).toBe('stone')
    g.apply({ t: 'place', r: 7, c: 6 })
    g.apply({ t: 'place', r: 7, c: 8 })
    expect(g.getExpectation().kind).toBe('swap')
    g.apply({ t: 'noswap' })
    expect(g.phase).toBe('playing')
  })
})

describe('对局与胜负', () => {
  it('五连判胜', () => {
    const g = new GomokuGame({ mode: 'free', forbidden: true, firstSide: 0 })
    // 黑：A8..E8，白：远处
    const seq: Array<[number, number, number]> = [
      [7, 0, BLACK],
      [0, 0, WHITE],
      [7, 1, BLACK],
      [0, 1, WHITE],
      [7, 2, BLACK],
      [0, 2, WHITE],
      [7, 3, BLACK],
      [0, 3, WHITE],
      [7, 4, BLACK]
    ]
    for (const [r, c] of seq.map((s) => [s[0], s[1]] as [number, number])) {
      // color 由引擎自行决定
      expect(g.apply({ t: 'place', r, c })).toBe(true)
    }
    expect(g.result?.type).toBe('win')
    if (g.result?.type === 'win') expect(g.result.winner).toBe(BLACK)
  })

  it('黑方禁手判白胜', () => {
    const g = new GomokuGame({ mode: 'free', forbidden: true, firstSide: 0 })
    // 构造黑方三三，白方在别处落子
    // 黑先手构建：横向 7,5 7,6；纵向 5,7 6,7；随后 7,7 为三三
    const blackSeq = [
      [7, 5],
      [5, 7],
      [7, 6],
      [6, 7]
    ]
    const whiteSeq = [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3]
    ]
    for (let i = 0; i < 4; i++) {
      expect(g.apply({ t: 'place', r: blackSeq[i][0], c: blackSeq[i][1] })).toBe(true)
      expect(g.apply({ t: 'place', r: whiteSeq[i][0], c: whiteSeq[i][1] })).toBe(true)
    }
    expect(g.apply({ t: 'place', r: 7, c: 7 })).toBe(true)
    expect(g.result?.type).toBe('win')
    if (g.result?.type === 'win') {
      expect(g.result.winner).toBe(WHITE)
      expect(g.result.reason).toBe('black-forbidden')
    }
  })

  it('悔棋可回退一步', () => {
    const g = new GomokuGame({ mode: 'free', forbidden: true, firstSide: 0 })
    g.apply({ t: 'place', r: 7, c: 7 })
    expect(g.moves.length).toBe(1)
    expect(g.undo()).toBe(true)
    expect(g.moves.length).toBe(0)
    expect(g.board.isEmpty(7, 7)).toBe(true)
  })
})
