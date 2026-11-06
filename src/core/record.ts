import { colLetter } from './coords'
import type { GameResult, Move } from './types'

export interface GameMeta {
  title?: string
  blackName?: string
  whiteName?: string
  event?: string
  date?: string // ISO
  mode?: string
  forbidden?: boolean
}

export interface GameRecord {
  version: 1
  meta: GameMeta
  moves: Move[]
  result: GameResult | null
}

/** SGF 坐标：列在前、行在后，均以小写字母，原点在左上（需翻转行） */
function sgfCoord(r: number, c: number): string {
  const size = 15
  return `${String.fromCharCode(97 + c)}${String.fromCharCode(97 + (size - 1 - r))}`
}

const modeLabel: Record<string, string> = {
  'tara-10': '塔拉山口-10 开局',
  swap2: 'Swap2 开局',
  free: '自由开局'
}

export function exportSGF(moves: Move[], meta: GameMeta, result: GameResult | null): string {
  const date = (meta.date ?? new Date().toISOString()).slice(0, 10).replace(/-/g, '-')
  const head = [
    '(;GM[4]FF[4]CA[UTF-8]AP[GomokuPro:1.0]SZ[15]',
    `GN[${meta.title ?? '五子棋对局'}]`,
    `DT[${date}]`,
    `EV[${meta.event ?? '个人对局'}]`,
    `PB[${meta.blackName ?? '黑方'}]PW[${meta.whiteName ?? '白方'}]`,
    `RU[${modeLabel[meta.mode ?? 'free'] ?? meta.mode ?? '自由开局'}${meta.forbidden ? ' + 禁手' : ''}]`
  ].join('')

  const body: string[] = []
  for (const m of moves) {
    if (m.kind === 'swap') body.push(`C[交换]`)
    else if (m.kind === 'offer') body.push(`C[黑方给出打点]`)
    else if (m.r < 0) body.push(m.color === 1 ? 'B[]' : 'W[]')
    else body.push(`${m.color === 1 ? 'B' : 'W'}[${sgfCoord(m.r, m.c)}]`)
  }
  let tail = ''
  if (result) {
    if (result.type === 'win') {
      tail = `RE[${result.winner === 1 ? 'B' : 'W'}+${reasonShort(result.reason)}]`
    } else {
      tail = `RE[0]`
    }
  }
  return head + body.join('') + tail + ')'
}

function reasonShort(reason: string): string {
  switch (reason) {
    case 'five':
      return '五连'
    case 'black-forbidden':
      return '禁手'
    case 'resign':
      return 'R'
    case 'timeout':
      return 'T'
    case 'forfeit':
      return 'F'
    default:
      return 'V'
  }
}

export function exportJSON(moves: Move[], meta: GameMeta, result: GameResult | null): string {
  const rec: GameRecord = { version: 1, meta, moves, result }
  return JSON.stringify(rec, null, 2)
}

export function exportText(moves: Move[], meta: GameMeta, result: GameResult | null): string {
  const lines: string[] = []
  lines.push('五子棋对局记录（中国五子棋竞赛规则 2025）')
  lines.push('='.repeat(40))
  lines.push(`对局名称：${meta.title ?? '五子棋对局'}`)
  lines.push(`黑方：${meta.blackName ?? '黑方'}    白方：${meta.whiteName ?? '白方'}`)
  lines.push(`开局：${modeLabel[meta.mode ?? 'free'] ?? meta.mode}${meta.forbidden ? '（黑方禁手）' : ''}`)
  lines.push(`日期：${(meta.date ?? new Date().toISOString()).slice(0, 19).replace('T', ' ')}`)
  lines.push('-'.repeat(40))

  const stoneMoves = moves.filter((m) => m.kind !== 'swap' && m.kind !== 'offer' && m.r >= 0)
  for (const m of moves) {
    if (m.kind === 'swap') {
      lines.push(`${pad(m.n)}  ${m.color === 1 ? '黑' : '白'}方 交换`)
    } else if (m.kind === 'offer') {
      lines.push(`${pad(m.n)}  黑方 给出打点（十 5 候选）`)
    } else if (m.r < 0) {
      lines.push(`${pad(m.n)}  ${m.color === 1 ? '黑' : '白'}方 放弃行棋（pass）`)
    } else {
      lines.push(`${pad(m.n)}  ${m.color === 1 ? '黑' : '白'}方 ${colLetter(m.c)}${m.r + 1}`)
    }
  }

  lines.push('-'.repeat(40))
  if (result?.type === 'win') {
    lines.push(`结果：${result.winner === 1 ? '黑方' : '白方'}胜（${winReasonLabel(result.reason)}）`)
  } else if (result?.type === 'draw') {
    lines.push(`结果：和棋（${drawReasonLabel(result.reason)}）`)
  } else {
    lines.push('结果：未终局')
  }
  lines.push(`着数：共 ${stoneMoves.length} 子，记录 ${moves.length} 着`)
  return lines.join('\n')
}

function pad(n: number): string {
  return String(n).padStart(3, ' ')
}

const WIN_REASON: Record<string, string> = {
  five: '五连',
  'black-forbidden': '黑方禁手判负',
  resign: '对方认输',
  timeout: '超时',
  forfeit: '违规判负'
}

const DRAW_REASON: Record<string, string> = {
  agreement: '双方同意',
  'double-pass': '双方放弃行棋',
  'full-board': '满盘无胜局',
  'mutual-timeout': '双方超时'
}

export function winReasonLabel(r: string): string {
  return WIN_REASON[r] ?? r
}

export function drawReasonLabel(r: string): string {
  return DRAW_REASON[r] ?? r
}

/** 触发浏览器下载 */
export function downloadText(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
