import { Board } from '../board'
import { BLACK, CENTER, WHITE, other, withinSquare } from '../constants'
import type { Color, GameResult, Move, OpeningMode, Phase, Point } from '../types'
import { checkForbidden } from './forbidden'
import { findFive, findOverline } from './shapes'

export interface GameOptions {
  mode: OpeningMode
  /** 黑方禁手（塔拉山口-10、Swap2 恒为 true；自由开局可配置） */
  forbidden?: boolean
  /** 初始执黑方（先手），0 或 1 */
  firstSide?: 0 | 1
}

/** 引擎期望的下一步输入 */
export type Expectation =
  | { kind: 'stone'; side: 0 | 1; color: Color; size: number | null }
  | { kind: 'swap'; side: 0 | 1; color: Color }
  | { kind: 'fifth-mode'; side: 0 | 1; color: Color }
  | { kind: 'offer'; side: 0 | 1; color: Color; size: number; count: number }
  | { kind: 'pick'; side: 0 | 1; color: Color; options: Point[] }
  | { kind: 'end' }

export type Action =
  | { t: 'place'; r: number; c: number }
  | { t: 'swap' }
  | { t: 'noswap' }
  | { t: 'extend' }
  | { t: 'fifth-single' }
  | { t: 'fifth-ten' }
  | { t: 'offer'; points: Point[] }
  | { t: 'pick'; r: number; c: number }
  | { t: 'pass' }
  | { t: 'resign'; by: Color }

interface Snapshot {
  cells: Uint8Array
  turn: Color
  blackSide: 0 | 1
  phase: Phase
  result: GameResult | null
  moves: Move[]
  passStreak: number
  stones: number
  pendingSwap: boolean
  fifthMode: 'single' | 'ten' | null
  offered: Point[]
  swap2Stage: Swap2Stage
  swap2Placed: number
}

type Swap2Stage = 'place3' | 'choose' | 'extend' | 'choose2' | 'done'

/** 塔拉山口-10：各着手允许区域边长（move1..move6） */
const TARA_ZONE = [1, 3, 5, 7, 9, 0] // 0 表示任意

/** 塔拉山口-10：哪些着手后对手有权交换（move1..move5） */
const TARA_SWAP_AFTER = [true, true, true, true, true]

export class GomokuGame {
  board = new Board()
  moves: Move[] = []
  turn: Color = BLACK
  blackSide: 0 | 1 = 0
  phase: Phase = 'playing'
  result: GameResult | null = null
  mode: OpeningMode
  forbiddenEnabled: boolean
  passStreak = 0

  private stonesInOpening = 0
  private pendingSwap = false
  private fifthMode: 'single' | 'ten' | null = null
  private offered: Point[] = []
  private swap2Stage: Swap2Stage = 'place3'
  private swap2Placed = 0
  private undoStack: Snapshot[] = []

  constructor(opts: GameOptions) {
    this.mode = opts.mode
    this.forbiddenEnabled = opts.forbidden ?? opts.mode !== 'free'
    this.blackSide = opts.firstSide ?? 0
    this.phase = opts.mode === 'free' ? 'playing' : 'opening'
  }

  // ---------- 查询 ----------

  sideOf(color: Color): 0 | 1 {
    return color === BLACK ? this.blackSide : ((1 - this.blackSide) as 0 | 1)
  }

  colorOf(side: 0 | 1): Color {
    return side === this.blackSide ? BLACK : WHITE
  }

  lastMove(): Move | null {
    return this.moves.length ? this.moves[this.moves.length - 1] : null
  }

  getExpectation(): Expectation {
    if (this.phase === 'finished') return { kind: 'end' }

    if (this.mode === 'free') {
      return { kind: 'stone', side: this.sideOf(this.turn), color: this.turn, size: null }
    }

    if (this.mode === 'tara-10') {
      if (this.pendingSwap) return { kind: 'swap', side: this.sideOf(this.turn), color: this.turn }
      if (this.stonesInOpening >= 6) {
        // 开局结束
        return { kind: 'stone', side: this.sideOf(this.turn), color: this.turn, size: null }
      }
      if (this.stonesInOpening === 4 && this.fifthMode === null) {
        return { kind: 'fifth-mode', side: this.sideOf(BLACK), color: BLACK }
      }
      if (this.fifthMode === 'ten' && this.offered.length === 0) {
        return { kind: 'offer', side: this.sideOf(BLACK), color: BLACK, size: 9, count: 10 }
      }
      if (this.offered.length > 0) {
        return { kind: 'pick', side: this.sideOf(WHITE), color: WHITE, options: this.offered }
      }
      const size = TARA_ZONE[this.stonesInOpening]
      return { kind: 'stone', side: this.sideOf(this.turn), color: this.turn, size: size === 0 ? null : size }
    }

    // swap2
    return this.swap2Expectation()
  }

  private swap2Expectation(): Expectation {
    if (this.swap2Stage === 'place3') {
      const size = 3
      return { kind: 'stone', side: this.sideOf(this.turn), color: this.turn, size }
    }
    if (this.swap2Stage === 'choose') {
      return { kind: 'swap', side: this.sideOf(this.turn), color: this.turn }
    }
    if (this.swap2Stage === 'extend') {
      return { kind: 'stone', side: this.sideOf(this.turn), color: this.turn, size: 5 }
    }
    // choose2
    return { kind: 'swap', side: this.sideOf(this.turn), color: this.turn }
  }

  /** 当前局面对黑方是否启用禁手（仅黑方） */
  private blackForbiddenOn(): boolean {
    return this.forbiddenEnabled
  }

  // ---------- 悔棋 ----------

  private snapshot(): Snapshot {
    return {
      cells: this.board.cells.slice(),
      turn: this.turn,
      blackSide: this.blackSide,
      phase: this.phase,
      result: this.result ? structuredClone(this.result) : null,
      moves: this.moves.map((m) => ({ ...m })),
      passStreak: this.passStreak,
      stones: this.stonesInOpening,
      pendingSwap: this.pendingSwap,
      fifthMode: this.fifthMode,
      offered: this.offered.map((p) => ({ ...p })),
      swap2Stage: this.swap2Stage,
      swap2Placed: this.swap2Placed
    }
  }

  private restore(s: Snapshot): void {
    this.board.cells = s.cells.slice()
    this.turn = s.turn
    this.blackSide = s.blackSide
    this.phase = s.phase
    this.result = s.result ? structuredClone(s.result) : null
    this.moves = s.moves.map((m) => ({ ...m }))
    this.passStreak = s.passStreak
    this.stonesInOpening = s.stones
    this.pendingSwap = s.pendingSwap
    this.fifthMode = s.fifthMode
    this.offered = s.offered.map((p) => ({ ...p }))
    this.swap2Stage = s.swap2Stage
    this.swap2Placed = s.swap2Placed
  }

  undo(): boolean {
    if (this.undoStack.length === 0) return false
    this.restore(this.undoStack.pop()!)
    return true
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  private commit(): void {
    this.undoStack.push(this.snapshot())
  }

  // ---------- 应用动作 ----------

  apply(action: Action): boolean {
    if (this.phase === 'finished') return false
    const exp = this.getExpectation()

    switch (action.t) {
      case 'resign': {
        this.commit()
        this.result = { type: 'win', winner: other(action.by), reason: 'resign' }
        this.phase = 'finished'
        return true
      }
      case 'pass': {
        if (exp.kind !== 'stone') return false
        this.commit()
        this.moves.push({ n: this.moves.length + 1, color: this.turn, r: -1, c: -1, kind: 'stone' })
        this.passStreak++
        this.turn = other(this.turn)
        if (this.passStreak >= 2) {
          this.result = { type: 'draw', reason: 'double-pass' }
          this.phase = 'finished'
        }
        return true
      }
      case 'place': {
        if (exp.kind !== 'stone') return false
        return this.placeStone({ r: action.r, c: action.c }, exp)
      }
      case 'offer': {
        if (exp.kind !== 'offer') return false
        if (action.points.length !== exp.count) return false
        const seen = new Set<string>()
        for (const p of action.points) {
          if (!this.validStone(p, exp.size)) return false
          const k = `${p.r},${p.c}`
          if (seen.has(k)) return false
          seen.add(k)
        }
        this.commit()
        this.offered = action.points.map((p) => ({ ...p }))
        this.moves.push({ n: this.moves.length + 1, color: BLACK, r: -1, c: -1, kind: 'offer' })
        return true
      }
      case 'pick': {
        if (exp.kind !== 'pick') return false
        const target = exp.options.find((p) => p.r === action.r && p.c === action.c)
        if (!target) return false
        this.commit()
        this.offered = []
        this.fifthMode = null
        this.board.place(target, BLACK)
        this.stonesInOpening++
        this.moves.push({ n: this.moves.length + 1, color: BLACK, r: target.r, c: target.c, kind: 'stone' })
        this.turn = WHITE
        this.finishOpeningIfDone()
        this.checkAfterStone(target, BLACK)
        return true
      }
      case 'swap': {
        if (exp.kind !== 'swap') return false
        this.commit()
        this.blackSide = (1 - this.blackSide) as 0 | 1
        this.moves.push({ n: this.moves.length + 1, color: other(this.turn), r: -1, c: -1, kind: 'swap' })
        this.resolveAfterSwap()
        return true
      }
      case 'noswap': {
        if (exp.kind !== 'swap') return false
        this.commit()
        this.resolveAfterSwap()
        return true
      }
      case 'extend': {
        if (this.mode !== 'swap2' || this.swap2Stage !== 'choose') return false
        this.commit()
        this.swap2Stage = 'extend'
        this.swap2Placed = 3
        return true
      }
      case 'fifth-single': {
        if (exp.kind !== 'fifth-mode') return false
        this.commit()
        this.fifthMode = 'single'
        return true
      }
      case 'fifth-ten': {
        if (exp.kind !== 'fifth-mode') return false
        this.commit()
        this.fifthMode = 'ten'
        return true
      }
      default:
        return false
    }
  }

  private validStone(p: Point, size: number | null): boolean {
    if (!this.board.isEmpty(p.r, p.c)) return false
    if (size !== null && !withinSquare(p, size, CENTER)) return false
    return true
  }

  private placeStone(p: Point, exp: Extract<Expectation, { kind: 'stone' }>): boolean {
    if (!this.validStone(p, exp.size)) return false
    this.commit()
    const color = this.turn
    this.board.place(p, color)
    this.moves.push({ n: this.moves.length + 1, color, r: p.r, c: p.c, kind: 'stone' })
    this.passStreak = 0

    if (this.phase === 'opening') this.stonesInOpening++

    this.turn = other(color)

    if (this.phase === 'opening') {
      this.advanceOpeningAfterStone(color)
      // 开局阶段也可能直接成五/禁手（如第 5、6 子），继续判定
      this.checkAfterStone(p, color)
      return true
    }

    this.checkAfterStone(p, color)
    return true
  }

  /** 落子后判定胜负/禁手/和棋；返回 true 若对局未结束 */
  private checkAfterStone(p: Point, color: Color): boolean {
    if (this.phase === 'finished') return false

    if (color === BLACK) {
      const five = findFive(this.board, p, BLACK)
      if (five) {
        this.result = { type: 'win', winner: BLACK, reason: 'five', line: five }
        this.phase = 'finished'
        return false
      }
      if (this.blackForbiddenOn()) {
        const f = checkForbidden(this.board, p)
        if (f) {
          this.result = { type: 'win', winner: WHITE, reason: 'black-forbidden' }
          this.phase = 'finished'
          return false
        }
      }
    } else {
      const five = findFive(this.board, p, WHITE)
      if (five) {
        this.result = { type: 'win', winner: WHITE, reason: 'five', line: five }
        this.phase = 'finished'
        return false
      }
      const over = findOverline(this.board, p, WHITE)
      if (over) {
        // 白方无禁手，长连视同五连
        this.result = { type: 'win', winner: WHITE, reason: 'five', line: over }
        this.phase = 'finished'
        return false
      }
    }

    if (this.board.isFull()) {
      this.result = { type: 'draw', reason: 'full-board' }
      this.phase = 'finished'
      return false
    }
    return true
  }

  private advanceOpeningAfterStone(color: Color): void {
    if (this.mode === 'tara-10') {
      if (this.stonesInOpening < 6 && TARA_SWAP_AFTER[this.stonesInOpening - 1]) {
        this.pendingSwap = true
      }
      this.finishOpeningIfDone()
    } else if (this.mode === 'swap2') {
      if (this.swap2Stage === 'place3') {
        this.swap2Placed++
        if (this.swap2Placed >= 3) this.swap2Stage = 'choose'
      } else if (this.swap2Stage === 'extend') {
        this.swap2Placed++
        if (this.swap2Placed >= 5) this.swap2Stage = 'choose2'
      }
    }
    void color
  }

  private finishOpeningIfDone(): void {
    if (this.mode === 'tara-10') {
      if (this.stonesInOpening >= 6) this.phase = 'playing'
    } else if (this.mode === 'swap2') {
      if (this.swap2Stage === 'choose2' && this.swap2Placed >= 5) {
        // still awaiting choose2 decision
      }
    }
  }

  private resolveAfterSwap(): void {
    if (this.mode === 'tara-10') {
      this.pendingSwap = false
      this.finishOpeningIfDone()
      return
    }
    if (this.mode === 'swap2') {
      if (this.swap2Stage === 'choose') {
        // 交换/不交换后进入正常对局
        this.swap2Stage = 'done'
        this.phase = 'playing'
      } else if (this.swap2Stage === 'choose2') {
        this.swap2Stage = 'done'
        this.phase = 'playing'
      }
      return
    }
  }

  /** 是否处于 Swap2 的扩展分支选择点 */
  get swap2() {
    return { stage: this.swap2Stage, placed: this.swap2Placed }
  }

  get tara() {
    return { stones: this.stonesInOpening, pendingSwap: this.pendingSwap, fifthMode: this.fifthMode, offered: this.offered }
  }

  /** 用于棋谱序列化 */
  serialize(): string {
    const lines: string[] = []
    lines.push(`[GM]GomokuPro`)
    lines.push(`[MODE]${this.mode}`)
    lines.push(`[FORBIDDEN]${this.forbiddenEnabled}`)
    lines.push(`[BLACKSIDE]${this.blackSide}`)
    for (const m of this.moves) {
      if (m.kind === 'swap') lines.push(`;${m.n}S`)
      else if (m.kind === 'offer') lines.push(`;${m.n}O`)
      else if (m.r < 0) lines.push(`;${m.n}p`)
      else lines.push(`;${m.n}${String.fromCharCode(65 + m.c)}${m.r + 1}`)
    }
    return lines.join('\n')
  }
}
