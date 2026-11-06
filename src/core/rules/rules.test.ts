import { describe, it, expect } from 'vitest'
import { Board } from '../board'
import { BLACK, WHITE } from '../constants'
import type { Cell } from '../types'
import { analyzePoint, findFive, findOverline } from './shapes'
import { checkForbidden } from './forbidden'

function makeBoard(stones: Array<[number, number, Cell]>): Board {
  const b = new Board()
  for (const [r, c, col] of stones) b.set(r, c, col)
  return b
}

describe('五连 / 长连', () => {
  it('恰好五连成立', () => {
    const b = makeBoard([
      [7, 3, BLACK],
      [7, 4, BLACK],
      [7, 5, BLACK],
      [7, 6, BLACK],
      [7, 7, BLACK]
    ])
    expect(findFive(b, { r: 7, c: 7 }, BLACK)).not.toBeNull()
    expect(findOverline(b, { r: 7, c: 7 }, BLACK)).toBeNull()
  })

  it('六连长连不判五连', () => {
    const b = makeBoard([
      [7, 3, BLACK],
      [7, 4, BLACK],
      [7, 5, BLACK],
      [7, 6, BLACK],
      [7, 7, BLACK],
      [7, 8, BLACK]
    ])
    expect(findFive(b, { r: 7, c: 7 }, BLACK)).toBeNull()
    expect(findOverline(b, { r: 7, c: 7 }, BLACK)).not.toBeNull()
  })
})

describe('棋形识别', () => {
  it('识别活三', () => {
    const b = makeBoard([
      [7, 5, BLACK],
      [7, 6, BLACK],
      [7, 7, BLACK]
    ])
    const s = analyzePoint(b, { r: 7, c: 7 }, BLACK)
    expect(s.openThreeCount).toBe(1)
    expect(s.five).toBe(false)
  })

  it('识别冲四', () => {
    const b = makeBoard([
      [7, 3, WHITE],
      [7, 4, BLACK],
      [7, 5, BLACK],
      [7, 6, BLACK],
      [7, 7, BLACK]
    ])
    const s = analyzePoint(b, { r: 7, c: 7 }, BLACK)
    expect(s.fourCount).toBe(1)
    expect(s.liveFourCount).toBe(0)
  })

  it('识别活四', () => {
    const b = makeBoard([
      [7, 4, BLACK],
      [7, 5, BLACK],
      [7, 6, BLACK],
      [7, 7, BLACK]
    ])
    const s = analyzePoint(b, { r: 7, c: 7 }, BLACK)
    expect(s.liveFourCount).toBe(1)
  })
})

describe('黑方禁手', () => {
  it('三三禁手', () => {
    const b = makeBoard([
      [7, 5, BLACK],
      [7, 6, BLACK],
      [5, 7, BLACK],
      [6, 7, BLACK],
      [7, 7, BLACK]
    ])
    const f = checkForbidden(b, { r: 7, c: 7 })
    expect(f?.types).toContain('three-three')
  })

  it('四四禁手', () => {
    const b = makeBoard([
      [7, 3, BLACK],
      [7, 4, BLACK],
      [7, 5, BLACK],
      [3, 7, BLACK],
      [4, 7, BLACK],
      [5, 7, BLACK],
      [7, 7, BLACK]
    ])
    const f = checkForbidden(b, { r: 7, c: 7 })
    expect(f?.types).toContain('four-four')
  })

  it('长连禁手', () => {
    const b = makeBoard([
      [7, 3, BLACK],
      [7, 4, BLACK],
      [7, 5, BLACK],
      [7, 6, BLACK],
      [7, 7, BLACK],
      [7, 8, BLACK]
    ])
    const f = checkForbidden(b, { r: 7, c: 7 })
    expect(f?.types).toContain('overline')
  })

  it('四三不禁手', () => {
    const b = makeBoard([
      [7, 3, BLACK],
      [7, 4, BLACK],
      [7, 5, BLACK],
      [5, 7, BLACK],
      [6, 7, BLACK],
      [7, 7, BLACK]
    ])
    const f = checkForbidden(b, { r: 7, c: 7 })
    expect(f).toBeNull()
  })

  it('五连优先于禁手', () => {
    // 横向成五连；竖向同时若是双三也不判禁手
    const b = makeBoard([
      [7, 3, BLACK],
      [7, 4, BLACK],
      [7, 5, BLACK],
      [7, 6, BLACK],
      [7, 7, BLACK],
      [5, 7, BLACK],
      [6, 7, BLACK]
    ])
    const f = checkForbidden(b, { r: 7, c: 7 })
    expect(f).toBeNull()
    expect(findFive(b, { r: 7, c: 7 }, BLACK)).not.toBeNull()
  })
})
