import type { Board } from '../board'
import { DIRS } from '../constants'
import type { Cell, Color, Point } from '../types'

/** 单个方向的棋形分析结果 */
export interface DirShape {
  /** 经过该点的同色连续子数 */
  run: number
  /** 恰好 5 连（五连） */
  five: boolean
  /** 6 连及以上（长连） */
  overline: boolean
  /** 本方向形成的“四”的个数（冲四/活四） */
  fourCount: number
  /** 是否存在活四 */
  liveFour: boolean
  /** 是否存在活三 */
  openThree: boolean
  /** 是否存在眠三 */
  sleepThree: boolean
  /** 是否存在活二 */
  openTwo: boolean
  /** 是否存在眠二 */
  sleepTwo: boolean
}

/** 经过 (r,c) 的同色连续子数（真实棋盘，边界正确） */
export function contiguousRun(
  board: Board,
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: Color
): number {
  let n = 1
  let rr = r - dr
  let cc = c - dc
  while (board.get(rr, cc) === color) {
    n++
    rr -= dr
    cc -= dc
  }
  rr = r + dr
  cc = c + dc
  while (board.get(rr, cc) === color) {
    n++
    rr += dr
    cc += dc
  }
  return n
}

/**
 * 取以 (r,c) 为中心、沿 (dr,dc) 方向 ±5 的 11 格窗口。
 * 值：0 空、1 同色、2 阻挡（异色或墙）。中心恒为 1。
 */
function window11(board: Board, r: number, c: number, dr: number, dc: number, color: Color): Int8Array {
  const line = new Int8Array(11)
  for (let k = -5; k <= 5; k++) {
    const v = board.get(r + dr * k, c + dc * k)
    let enc: number
    if (v === 0) enc = 0
    else if (v === color) enc = 1
    else enc = 2 // 异色或墙
    line[k + 5] = enc
  }
  return line
}

interface Four {
  cells: number[] // 偏移（相对中心），需含 0
  live: boolean
}

/** 枚举经过中心(偏移 0)的“四”，按 4 颗子集合去重 */
function foursThroughCenter(line: Int8Array): Four[] {
  const seen = new Map<string, number[]>()
  for (let start = -4; start <= 0; start++) {
    const selfIdx: number[] = []
    let empty = 0
    let blocked = false
    for (let k = start; k < start + 5; k++) {
      const v = line[k + 5]
      if (v === 1) selfIdx.push(k)
      else if (v === 0) empty++
      else {
        blocked = true
        break
      }
    }
    if (blocked || empty !== 1 || selfIdx.length !== 4) continue
    if (!selfIdx.includes(0)) continue
    const key = selfIdx.join(',')
    if (!seen.has(key)) seen.set(key, selfIdx)
  }
  const res: Four[] = []
  for (const cells of seen.values()) {
    const consecutive = cells.every((v, i) => i === 0 || v === cells[i - 1] + 1)
    const before = line[cells[0] - 1 + 5]
    const after = line[cells[cells.length - 1] + 1 + 5]
    const live = consecutive && before === 0 && after === 0
    res.push({ cells, live })
  }
  return res
}

function hasFourThroughCenter(line: Int8Array): boolean {
  return foursThroughCenter(line).length > 0
}

function hasLiveFourThroughCenter(line: Int8Array): boolean {
  return foursThroughCenter(line).some((f) => f.live)
}

/** 是否存在“活三”：再走一着可形成经过中心的活四 */
function hasOpenThree(line: Int8Array): boolean {
  for (let j = -4; j <= 4; j++) {
    if (j === 0) continue
    const idx = j + 5
    if (line[idx] !== 0) continue
    line[idx] = 1
    const ok = hasLiveFourThroughCenter(line)
    line[idx] = 0
    if (ok) return true
  }
  return false
}

/** 是否存在“眠三”：只能形成冲四（无活四） */
function hasSleepThree(line: Int8Array): boolean {
  if (hasOpenThree(line)) return false
  for (let j = -4; j <= 4; j++) {
    if (j === 0) continue
    const idx = j + 5
    if (line[idx] !== 0) continue
    line[idx] = 1
    const ok = hasFourThroughCenter(line)
    line[idx] = 0
    if (ok) return true
  }
  return false
}

/** 是否存在“活二”：再走一着可形成经过中心的活三 */
function hasOpenTwo(line: Int8Array): boolean {
  for (let j = -4; j <= 4; j++) {
    if (j === 0) continue
    const idx = j + 5
    if (line[idx] !== 0) continue
    line[idx] = 1
    const ok = hasOpenThree(line)
    line[idx] = 0
    if (ok) return true
  }
  return false
}

function hasSleepTwo(line: Int8Array): boolean {
  if (hasOpenTwo(line)) return false
  for (let j = -4; j <= 4; j++) {
    if (j === 0) continue
    const idx = j + 5
    if (line[idx] !== 0) continue
    line[idx] = 1
    const ok = hasSleepThree(line)
    line[idx] = 0
    if (ok) return true
  }
  return false
}

/** 分析某方向（要求 board 在该点已是 color） */
export function analyzeDirection(
  board: Board,
  r: number,
  c: number,
  dr: number,
  dc: number,
  color: Color
): DirShape {
  const run = contiguousRun(board, r, c, dr, dc, color)
  const five = run === 5
  const overline = run >= 6
  const line = window11(board, r, c, dr, dc, color)

  let fourCount = 0
  let liveFour = false
  let openThree = false
  let sleepThree = false
  let openTwo = false
  let sleepTwo = false

  if (!five && !overline) {
    const fours = foursThroughCenter(line)
    fourCount = fours.length
    liveFour = fours.some((f) => f.live)
    if (fourCount === 0) {
      openThree = hasOpenThree(line)
      sleepThree = !openThree && hasSleepThree(line)
      if (!openThree && !sleepThree) {
        openTwo = hasOpenTwo(line)
        sleepTwo = !openTwo && hasSleepTwo(line)
      }
    }
  } else if (five) {
    // 五连本身也算“四”的延伸；不计入禁手四数
    fourCount = 0
  }

  return { run, five, overline, fourCount, liveFour, openThree, sleepThree, openTwo, sleepTwo }
}

export interface PointShapes {
  dirs: DirShape[]
  five: boolean
  overline: boolean
  /** 五连的方向（用于高亮） */
  fiveDir: number
  fourCount: number
  liveFourCount: number
  openThreeCount: number
  sleepThreeCount: number
  openTwoCount: number
  sleepTwoCount: number
}

/** 汇总某点四个方向的棋形（要求 board 在该点已是 color） */
export function analyzePoint(board: Board, p: Point, color: Color): PointShapes {
  const dirs: DirShape[] = []
  let five = false
  let overline = false
  let fiveDir = -1
  let fourCount = 0
  let liveFourCount = 0
  let openThreeCount = 0
  let sleepThreeCount = 0
  let openTwoCount = 0
  let sleepTwoCount = 0

  DIRS.forEach(([dr, dc], i) => {
    const s = analyzeDirection(board, p.r, p.c, dr, dc, color)
    dirs.push(s)
    if (s.five) {
      five = true
      fiveDir = i
    }
    if (s.overline) overline = true
    fourCount += s.fourCount
    if (s.liveFour) liveFourCount++
    if (s.openThree) openThreeCount++
    if (s.sleepThree) sleepThreeCount++
    if (s.openTwo) openTwoCount++
    if (s.sleepTwo) sleepTwoCount++
  })

  return {
    dirs,
    five,
    overline,
    fiveDir,
    fourCount,
    liveFourCount,
    openThreeCount,
    sleepThreeCount,
    openTwoCount,
    sleepTwoCount
  }
}

/** 经过某点的五连（返回 5 个坐标）；要求 board 已含该点。优先返回五连而非长连 */
export function findFive(board: Board, p: Point, color: Color): Point[] | null {
  for (const [dr, dc] of DIRS) {
    if (contiguousRun(board, p.r, p.c, dr, dc, color) !== 5) continue
    // 向左回退到连子起点
    let sr = p.r
    let sc = p.c
    while (board.get(sr - dr, sc - dc) === color) {
      sr -= dr
      sc -= dc
    }
    return Array.from({ length: 5 }, (_, i) => ({ r: sr + dr * i, c: sc + dc * i }))
  }
  return null
}

/** 经过某点的长连（≥6） */
export function findOverline(board: Board, p: Point, color: Color): Point[] | null {
  for (const [dr, dc] of DIRS) {
    const n = contiguousRun(board, p.r, p.c, dr, dc, color)
    if (n < 6) continue
    let sr = p.r
    let sc = p.c
    while (board.get(sr - dr, sc - dc) === color) {
      sr -= dr
      sc -= dc
    }
    return Array.from({ length: n }, (_, i) => ({ r: sr + dr * i, c: sc + dc * i }))
  }
  return null
}

export const cellAt = (board: Board, r: number, c: number): Cell | -1 => board.get(r, c)
