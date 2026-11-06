import { other, withinSquare } from '@/core/constants'
import type { Point } from '@/core/types'
import type { GomokuGame } from '@/core/rules/engine'
import { findWinningPoints } from '@/core/rules/analyze'
import type { AiLevelConfig } from './levels'

/** 传给 Rapfi worker 的着法请求（已转换为协议坐标） */
export interface RapfiMoveRequest {
  size: number
  /** 0 = 自由（无禁手），1 = 标准（黑方禁手） */
  rule: number
  stones: { r: number; c: number; who: number }[]
  timeoutMs: number
  maxDepth: number
  maxMemoryBytes?: number
}

type Pending = { resolve: (p: Point | null) => void; timer: ReturnType<typeof setTimeout> }

let worker: Worker | null = null
let broken = false
let seq = 0
let boot: Promise<boolean> | null = null
const pending = new Map<number, Pending>()

function baseUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

/** 确保 Rapfi worker 已启动；返回是否可用 */
export function rapfiReady(): Promise<boolean> {
  if (broken) return Promise.resolve(false)
  if (boot) return boot
  boot = new Promise<boolean>((resolve) => {
    if (typeof Worker === 'undefined') {
      broken = true
      resolve(false)
      return
    }
    try {
      worker = new Worker(`${baseUrl()}wasm/rapfi-worker.js`)
    } catch {
      broken = true
      resolve(false)
      return
    }
    const w = worker
    let settled = false
    const done = (ok: boolean): void => {
      if (settled) return
      settled = true
      if (!ok) broken = true
      resolve(ok)
    }
    w.onmessage = (ev: MessageEvent) => {
      const msg = (ev.data || {}) as {
        type?: string
        id?: number
        move?: Point | null
      }
      if (msg.type === 'ready') {
        done(true)
        return
      }
      if (msg.type === 'init-error') {
        done(false)
        return
      }
      if (msg.type === 'move' && typeof msg.id === 'number') {
        const p = pending.get(msg.id)
        if (p) {
          pending.delete(msg.id)
          clearTimeout(p.timer)
          p.resolve(msg.move ?? null)
        }
      }
    }
    w.onerror = () => done(false)
    w.postMessage({ type: 'init', jsUrl: `${baseUrl()}wasm/rapfi.js` })
    // 兜底：越界超时视为不可用
    setTimeout(() => done(false), 8000)
  })
  return boot
}

/** 向 Rapfi 请求一个着法；超时或不可用返回 null */
export function rapfiBestMove(req: RapfiMoveRequest): Promise<Point | null> {
  return rapfiReady().then((ok) => {
    if (!ok || !worker) return null
    const w = worker
    const id = ++seq
    return new Promise<Point | null>((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        resolve(null)
      }, req.timeoutMs + 2000)
      pending.set(id, { resolve, timer })
      w.postMessage({ type: 'move', id, ...req })
    })
  })
}

function neighborEmpties(engine: GomokuGame, radius: number): Point[] {
  const board = engine.board
  const n = board.size
  const out: Point[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!board.isEmpty(r, c)) continue
      let near = false
      for (let dr = -radius; dr <= radius && !near; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          const rr = r + dr
          const cc = c + dc
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue
          if (!board.isEmpty(rr, cc)) {
            near = true
            break
          }
        }
      }
      if (near) out.push({ r, c })
    }
  }
  return out
}

/**
 * 用 Rapfi 引擎为本轮选择落点。
 * 自由落子与受限开局（塔拉山口-10 的区域着法）都会尝试交给 Rapfi；
 * 引擎不可用、着法非法或落在允许区域之外时返回 null，以便回退自研 JS 引擎。
 */
export async function chooseWithRapfi(
  engine: GomokuGame,
  cfg: AiLevelConfig,
  rand: () => number = Math.random
): Promise<Point | null> {
  const exp = engine.getExpectation()
  if (exp.kind !== 'stone') return null

  const aiColor = exp.color
  const size = exp.size
  // 区域过小（如首手仅天元）时无搜索价值，直接交给 JS 引擎，避免无谓等待
  if (size !== null && size <= 1) return null
  const stones = engine.moves
    .filter((m) => m.kind === 'stone' && m.r >= 0 && m.c >= 0)
    .map((m) => ({ r: m.r, c: m.c, who: m.color === aiColor ? 1 : 2 }))

  const rule = engine.forbiddenEnabled ? 1 : 0
  const best = await rapfiBestMove({
    size: engine.board.size,
    rule,
    stones,
    timeoutMs: cfg.budgetMs,
    maxDepth: cfg.maxDepth,
    maxMemoryBytes: 64 * 1024 * 1024
  })
  if (!best) return null

  // 合法性校验：必须为空位且在全盘内，受限开局还须落在允许区域内
  if (!engine.board.isEmpty(best.r, best.c)) return null
  if (!withinSquare(best, engine.board.size)) return null
  if (size !== null && !withinSquare(best, size)) return null

  // 弱难度：非关键局面（无立即成五/封堵）时概率性走随机邻近点
  const aiWin = findWinningPoints(engine.board, aiColor)
  const oppWin = findWinningPoints(engine.board, other(aiColor))
  const critical = aiWin.length > 0 || oppWin.length > 0
  if (!critical && cfg.blunder > 0 && rand() < cfg.blunder) {
    const cand = neighborEmpties(engine, 2).filter((p) => size === null || withinSquare(p, size))
    if (cand.length > 0) return cand[Math.floor(rand() * cand.length)]
  }
  return best
}
