import { defineStore } from 'pinia'
import { computed, markRaw, ref, shallowRef } from 'vue'
import type { Action, Expectation, GameOptions } from '@/core/rules/engine'
import { GomokuGame } from '@/core/rules/engine'
import { BLACK, other } from '@/core/constants'
import type { Color, GameResult, Move, OpeningMode, Phase, Point } from '@/core/types'
import { findWinningPoints } from '@/core/rules/analyze'
import { scanForbiddenPoints } from '@/core/rules/forbidden'
import { decideAction } from '@/core/ai/decide'
import { chooseWithRapfi } from '@/core/ai/rapfi'
import { aiLevelConfig, type AiLevel } from '@/core/ai/levels'
import { sfx } from '@/audio/sfx'
import { useSettingsStore } from './settings'
import { useHistoryStore } from './history'

export type PlayMode = 'local' | 'lan' | 'ai'
export type HumanSideChoice = 'black' | 'white' | 'random'

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
  const mySide = ref<0 | 1 | null>(null) // LAN / 人机时本方执子方
  const lanRoom = ref<string | null>(null)
  const lanConnected = ref(false)

  // 人机对战
  const aiLevel = ref<AiLevel>('normal')
  const aiSide = ref<0 | 1 | null>(null)
  const aiThinking = ref(false)
  let aiWorker: Worker | null = null
  let aiToken = 0

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
    aiToken++
    refresh()
    if (playMode.value === 'ai') void maybeAiMove()
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
    if (broadcast) void maybeAiMove()
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
    const g = engine.value
    if (playMode.value === 'ai') {
      let pops = 0
      if (g.undo()) pops++
      // 若撤销后轮到 AI，再退一手，回到本方行棋
      if (pops > 0 && g.canUndo()) {
        const exp = g.getExpectation()
        if (exp.kind !== 'end' && exp.side !== mySide.value) {
          g.undo()
          pops++
        }
      }
      if (pops === 0) return false
      for (let i = 0; i < pops; i++) actionLog.pop()
      aiToken++
      recorded = false
      refresh()
      void maybeAiMove()
      return true
    }
    const ok = g.undo()
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
    aiToken++
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

  // ---------- 人机对战 ----------

  function ensureWorker(): Worker | null {
    if (typeof Worker === 'undefined') return null
    if (!aiWorker) {
      aiWorker = new Worker(new URL('../core/ai/ai.worker.ts', import.meta.url), { type: 'module' })
    }
    return aiWorker
  }

  /** 自研 JS 引擎推进：优先在 Worker 中执行，失败则主线程兜底 */
  function computeJsAction(): Promise<Action | null> {
    const opts = gameOptions.value
    const actions = actionLog.slice()
    const level = aiLevel.value
    if (!opts) return Promise.resolve(null)
    const w = ensureWorker()
    if (w) {
      return new Promise((resolve) => {
        const onMsg = (e: MessageEvent) => {
          w.removeEventListener('message', onMsg)
          resolve((e.data as Action | null) ?? null)
        }
        w.addEventListener('message', onMsg)
        // 发送纯数据副本：opts 可能来自响应式 ref，Proxy 无法被结构化克隆
        w.postMessage(JSON.parse(JSON.stringify({ opts, actions, level })))
      })
    }
    const g = new GomokuGame(opts)
    for (const a of actions) g.apply(a)
    return Promise.resolve(decideAction(g, aiLevelConfig(level)))
  }

  /**
   * 计算 AI 本轮动作：自由落子优先用 Rapfi（WASM），
   * 开局受限输入与 Rapfi 不可用时回退自研 JS 引擎。
   */
  async function computeAiAction(): Promise<Action | null> {
    const opts = gameOptions.value
    if (!opts) return null
    const g = new GomokuGame(opts)
    for (const a of actionLog) g.apply(a)
    if (g.getExpectation().kind === 'stone') {
      const mv = await chooseWithRapfi(g, aiLevelConfig(aiLevel.value))
      if (mv) return { t: 'place', r: mv.r, c: mv.c }
    }
    return computeJsAction()
  }

  /** 若轮到 AI，则计算并落子；否则立即返回 */
  async function maybeAiMove(): Promise<void> {
    if (playMode.value !== 'ai' || aiSide.value === null) return
    if (phase.value === 'finished') return
    const exp = engine.value.getExpectation()
    if (exp.kind === 'end' || exp.side !== aiSide.value) return

    const token = ++aiToken
    aiThinking.value = true
    try {
      const action = await computeAiAction()
      if (token !== aiToken) return
      if (action) perform(action, false)
    } finally {
      if (token === aiToken) aiThinking.value = false
    }
    // AI 落子后若仍轮到 AI（罕见），继续
    if (token === aiToken) void maybeAiMove()
  }

  /** 开始人机对战：humanChoice 决定本方执黑/执白/随机 */
  function startAiGame(level: AiLevel, humanChoice: HumanSideChoice): void {
    aiLevel.value = level
    const humanSide: 0 | 1 = humanChoice === 'black' ? 0 : humanChoice === 'white' ? 1 : Math.random() < 0.5 ? 0 : 1
    playMode.value = 'ai'
    mySide.value = humanSide
    aiSide.value = (1 - humanSide) as 0 | 1
    // side 0 执黑：humanSide 即本方所在方，据此本方执黑或执白
    newGame({ firstSide: 0 })
  }

  /** 退出人机，回到本地双人 */
  function stopAi(): void {
    aiToken++
    if (aiWorker) {
      aiWorker.terminate()
      aiWorker = null
    }
    aiThinking.value = false
    aiSide.value = null
    mySide.value = null
    playMode.value = 'local'
    newGame()
  }

  /** 按当前模式重开一局（人机保留难度与本方执子） */
  function restart(): void {
    if (playMode.value === 'ai') {
      const human: HumanSideChoice = mySide.value === 0 ? 'black' : mySide.value === 1 ? 'white' : 'random'
      startAiGame(aiLevel.value, human)
    } else {
      newGame()
    }
  }

  // 默认进入人机对战
  startAiGame(settings.aiLevel, settings.aiHuman)

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
    aiLevel,
    aiSide,
    aiThinking,
    canAct,
    expectedSide,
    mode,
    forbiddenEnabled,
    isMyTurn,
    canUndo,
    swap2,
    setSendHook,
    newGame,
    startAiGame,
    stopAi,
    restart,
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
