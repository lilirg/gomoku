/** 棋子颜色：1 = 黑（先手），2 = 白（后手） */
export type Color = 1 | 2

/** 棋盘格：0 = 空，1 = 黑，2 = 白 */
export type Cell = 0 | 1 | 2

/** 棋盘坐标（内部以 r=行、c=列；r=0 为最下第 1 行，c=0 为最左 A 列） */
export interface Point {
  r: number
  c: number
}

/** 落子/开局阶段的记录项 */
export interface Move {
  /** 序号，从 1 开始（含开局的每一着与交换、给点等，符合规则第 6 条） */
  n: number
  color: Color
  r: number
  c: number
  /** 特殊着类型 */
  kind?: 'stone' | 'swap' | 'offer'
}

/** 对局阶段 */
export type Phase = 'idle' | 'opening' | 'playing' | 'finished'

/** 终局结果 */
export type GameResult =
  | { type: 'win'; winner: Color; reason: WinReason; line?: Point[] }
  | { type: 'draw'; reason: DrawReason }

export type WinReason =
  | 'five' // 五连
  | 'black-forbidden' // 黑方禁手判负，白胜
  | 'resign' // 认输
  | 'timeout' // 超时判负
  | 'forfeit' // 违规判负

export type DrawReason =
  | 'agreement' // 双方同意和棋
  | 'double-pass' // 双方连续放弃行棋权
  | 'full-board' // 满盘无胜
  | 'mutual-timeout' // 双方超时无法判定先后

/** 禁手类型 */
export type ForbiddenType = 'three-three' | 'four-four' | 'overline'

export interface ForbiddenInfo {
  point: Point
  types: ForbiddenType[]
}

/** 开局模式 */
export type OpeningMode = 'tara-10' | 'swap2' | 'free'

/** 计时规则 */
export type TimeControlMode = 'sudden' | 'byoyomi' | 'shared' | 'none'
