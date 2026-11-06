import { defineStore } from 'pinia'
import { computed, markRaw, ref, shallowRef } from 'vue'
import type { Action, Expectation, GameOptions } from '@/core/rules/engine'
import { GomokuGame } from '@/core/rules/engine'
import { BLACK, other } from '@/core/constants'
import type { Color, GameResult, Move, OpeningMode, Phase, Point } from '@/core/types'
import { findWinningPoints } from '@/core/rules/analyze'
import { scanForbiddenPoints } from '@/core/rules/forbidden'
import { sfx } from '@/audio/sfx'
import { useSettingsStore } from './settings'
import { useHistoryStore } from './history'

export type PlayMode = 'local' | 'lan'

export const useGameStore = defineStore('game', () => {
  const settings = useSettingsStore()
  const history = useHistoryStore()

  const engine = shallowRef<GomokuGame>(markRaw(new GomokuGame({ mode: 'tara-10', firstSide: 0 })))
  const revision = ref(0)

  const grid = ref<number[]>(new Array(225).fill(0))
  const moves = ref<Move[]>([])
  const phase = ref<Phase>('opening')
  const result = ref<GameResult | null>(null)
  const expectation = ref<Expectation>({ kind: 'end' })
  const turn = ref<Color>(BLACK)
  const blackSide = ref<0 | 1>(0)
  const lastMove = ref<Point | null>(null)
  const hintPoints = ref<Point[]>([])
  const threatPoints = ref<Point[]>([])
  const forbiddenPoints = ref<Point[]>([])

  const playMode = ref<PlayMode>('local')
  const mySide = ref<0 | 1 | null>(null) // LAN 时本方执子方
  const lanRoom = ref<string | null>(null)
  const lanConnected = ref(false)

  const gameOptions = ref<GameOptions | null>(null)
  let actionLog: Action[] = []

  let sendHook: ((a: Action) => void) | null = null
  let recorded = false

  const setSendHook = (fn: ((a: Action) => void) | null) => {
    sendHook = fn
  }

  function boardArray(g: GomokuGame): number[] {
    return Array.from(g.board.cells)
  }

  function refresh(): void {
    const g = engine.value
    grid.value = boardArray(g)
    moves.value = g.moves.map((m) => ({ ...m }))
    phase.value = g.phase
    result.value = g.result ? structuredClone(g.result) : null
    expectation.value = g.getExpectation()
    turn.value = g.turn
    blackSide.value = g.blackSide
    const lm = g.lastMove()
    lastMove.value = lm && lm.r >= 0 ? { r: lm.r, c: lm.c } : null

    // 提示与禁手
    if (settings.showHints && g.phase === 'playing') {
      hintPoints.value = findWinningPoints(g.board, g.turn)
      threatPoints.value = findWinningPoints(g.board, other(g.turn))
    } else {
      hintPoints.value = []
      threatPoints.value = []
    }
    forbiddenPoints.value =
      settings.showForbidden && g.forbiddenEnabled && g.phase !== 'finished'
        ? scanForbiddenPoints(g.board).map((f) => f.point)
        : []

    revision.value++

    if (g.phase === 'finished' && g.result && !recorded) {
      recorded = true
      recordResult(g)
    }
  }

  function recordResult(g: GomokuGame): void {
    const r = g.result!
    const outcome = r.type === 'win' ? (r.winner === BLACK ? 'black' : 'white') : 'draw'
    history.add({
      mode: g.mode,
      forbidden: g.forbiddenEnabled,
      blackName: settings.blackName,
      whiteName: settings.whiteName,
      outcome,
      reason: r.type === 'win' ? r.reason : r.reason,
      movesCount: g.moves.filter((m) => m.kind === 'stone' && m.r >= 0).length,
      moves: g.moves.map((m) => ({ ...m })),
      result: structuredClone(r)
    })
  }

  /** 随机/指定先手 */
  function decideFirstSide(): 0 | 1 {
    if (settings.firstChoice === 'black') return 0
    if (settings.firstChoice === 'white') return 1
    return Math.random() < 0.5 ? 0 : 1
  }

  function newGame(opts?: { mode?: OpeningMode; forbidden?: boolean; firstSide?: 0 | 1 }): void {
    const mode = opts?.mode ?? settings.mode
    const options: GameOptions = {
      mode,
      forbidden: opts?.forbidden ?? (mode === 'free' ? settings.forbidden : true),
      firstSide: opts?.firstSide ?? decideFirstSide()
    }
    engine.value = markRaw(new GomokuGame(options))
    gameOptions.value = options
    actionLog = []
    recorded = false
    refresh()
  }

  function perform(action: Action, broadcast = true): boolean {
    const g = engine.value
    const ok = g.apply(action)
    if (!ok) return false
    actionLog.push(action)
    // 音效
    switch (action.t) {
      case 'place':
      case 'pick':
        sfx.place()
        break
      case 'swap':
      case 'noswap':
      case 'extend':
        sfx.swap()
        break
    }
    const wasFinished = phase.value === 'finished'
    refresh()
    if (phase.value === 'finished' && !wasFinished) {
      const r = engine.value.result
      if (r?.type === 'win') {
        if (r.reason === 'black-forbidden') sfx.forbidden()
        // 本地视角胜负音效
        const localWon =
          playMode.value === 'local' ? true : mySide.value !== null && engine.value.sideOf(r.winner) === mySide.value
        setTimeout(() => (localWon ? sfx.win() : sfx.lose()), 120)
      }
    }
    if (broadcast && sendHook && playMode.value === 'lan') sendHook(action)
    return true
  }

  function place(r: number, c: number): boolean {
    return perform({ t: 'place', r, c })
  }
  function swap(): boolean {
    return perform({ t: 'swap' })
  }
  function noswap(): boolean {
    return perform({ t: 'noswap' })
  }
  function extend(): boolean {
    return perform({ t: 'extend' })
  }
  function fifthSingle(): boolean {
    return perform({ t: 'fifth-single' })
  }
  function fifthTen(): boolean {
    return perform({ t: 'fifth-ten' })
  }
  function offerPoints(points: Point[]): boolean {
    return perform({ t: 'offer', points })
  }
  function pick(r: number, c: number): boolean {
    return perform({ t: 'pick', r, c })
  }
  function pass(): boolean {
    return perform({ t: 'pass' })
  }
  function resign(by: Color): boolean {
    return perform({ t: 'resign', by })
  }

  function undo(): boolean {
    const ok = engine.value.undo()
    if (ok) {
      actionLog.pop()
      recorded = false
      refresh()
    }
    return ok
  }

  /** 从动作日志恢复（LAN 入场同步） */
  function replay(opts: GameOptions, actions: Action[]): void {
    engine.value = markRaw(new GomokuGame(opts))
    gameOptions.value = opts
    actionLog = []
    for (const a of actions) {
      if (engine.value.apply(a)) actionLog.push(a)
    }
    recorded = false
    refresh()
  }

  function syncPayload(): { opts: GameOptions | null; actions: Action[] } {
    return { opts: gameOptions.value, actions: actionLog.slice() }
  }

  /** 是否轮到本地方操作 */
  const canAct = computed(() => {
    if (phase.value === 'finished') return false
    if (expectation.value.kind === 'end') return false
    if (playMode.value === 'local') return true
    return mySide.value !== null && expectation.value.side === mySide.value
  })

  const expectedSide = computed(() => (expectation.value.kind === 'end' ? null : expectation.value.side))

  const mode = computed(() => engine.value.mode)
  const forbiddenEnabled = computed(() => engine.value.forbiddenEnabled)

  // 派生：用于界面高亮禁手提示等
  const isMyTurn = computed(() => canAct.value)

  /** 引擎内部状态非响应式，故依赖 revision 触发重算 */
  const canUndo = computed(() => {
    void revision.value
    return engine.value.canUndo()
  })

  const swap2 = computed(() => {
    void revision.value
    return engine.value.swap2
  })

  function applyRemote(action: Action): void {
    perform(action, false)
  }

  // 初始化派生状态，避免 expectation/canAct 停留在默认值
  refresh()

  return {
    engine,
    revision,
    grid,
    moves,
    phase,
    result,
    expectation,
    turn,
    blackSide,
    lastMove,
    hintPoints,
    threatPoints,
    forbiddenPoints,
    playMode,
    mySide,
    lanRoom,
    lanConnected,
    canAct,
    expectedSide,
    mode,
    forbiddenEnabled,
    isMyTurn,
    canUndo,
    swap2,
    setSendHook,
    newGame,
    decideFirstSide,
    perform,
    place,
    swap,
    noswap,
    extend,
    fifthSingle,
    fifthTen,
    offerPoints,
    pick,
    pass,
    resign,
    undo,
    replay,
    syncPayload,
    refresh,
    applyRemote
  }
})
