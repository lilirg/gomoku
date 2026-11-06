/// <reference lib="webworker" />
import { decideAction } from '@/core/ai/decide'
import { aiLevelConfig, type AiLevel } from '@/core/ai/levels'
import { GomokuGame, type Action, type GameOptions } from '@/core/rules/engine'

interface AiRequest {
  opts: GameOptions
  actions: Action[]
  level: AiLevel
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AiRequest>) => void) | null
  postMessage: (m: Action | null) => void
}

ctx.onmessage = (e: MessageEvent<AiRequest>) => {
  const { opts, actions, level } = e.data
  let action: Action | null = null
  try {
    const g = new GomokuGame(opts)
    for (const a of actions) g.apply(a)
    action = decideAction(g, aiLevelConfig(level))
  } catch {
    action = null
  }
  ctx.postMessage(action)
}
