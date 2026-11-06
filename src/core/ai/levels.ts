/** 人机对战难度定义 */

export type AiLevel = 'entry' | 'easy' | 'normal' | 'hard' | 'hell'

export interface AiLevelConfig {
  id: AiLevel
  label: string
  blurb: string
  /** minimax 最大深度（迭代加深上限） */
  depth: number
  /** 每层保留的候选点数 */
  candidates: number
  /** 从若干候选中随机选取（越大越弱） */
  random: number
  /** 概率性放弃封堵对手的直接成五（越大越“漏”） */
  blunder: number
  /** 每步思考时间上限（毫秒）：Rapfi 的 timeout_turn，也是 JS 兜底预算 */
  budgetMs: number
  /** Rapfi 搜索深度上限（0 = 不限制，仅受时间约束） */
  maxDepth: number
}

export const AI_LEVELS: AiLevelConfig[] = [
  { id: 'entry', label: '入门', blurb: '刚学会规则，常常看不到威胁', depth: 1, candidates: 6, random: 0.6, blunder: 0.5, budgetMs: 100, maxDepth: 1 },
  { id: 'easy', label: '简单', blurb: '会封堵活三，但偶尔失误', depth: 2, candidates: 8, random: 0.28, blunder: 0.25, budgetMs: 220, maxDepth: 2 },
  { id: 'normal', label: '普通', blurb: '攻防兼备，会算几步', depth: 4, candidates: 10, random: 0.08, blunder: 0.08, budgetMs: 600, maxDepth: 0 },
  { id: 'hard', label: '困难', blurb: '深算，能抓住连续进攻', depth: 6, candidates: 12, random: 0, blunder: 0, budgetMs: 1200, maxDepth: 0 },
  { id: 'hell', label: '地狱', blurb: '全力搜索，几乎不留机会', depth: 8, candidates: 14, random: 0, blunder: 0, budgetMs: 2500, maxDepth: 0 }
]

export function aiLevelConfig(id: AiLevel): AiLevelConfig {
  return AI_LEVELS.find((l) => l.id === id) ?? AI_LEVELS[2]
}
