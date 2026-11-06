import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { GameResult, Move, OpeningMode } from '@/core/types'

const KEY = 'gomoku.history.v1'

export interface HistoryEntry {
  id: string
  date: string // ISO
  mode: OpeningMode
  forbidden: boolean
  blackName: string
  whiteName: string
  /** 胜负：'black' | 'white' | 'draw' */
  outcome: 'black' | 'white' | 'draw'
  reason: string
  movesCount: number
  moves: Move[]
  result: GameResult | null
}

function load(): HistoryEntry[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? '[]') as HistoryEntry[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export const useHistoryStore = defineStore('history', () => {
  const entries = ref<HistoryEntry[]>(load())

  watch(
    entries,
    (v) => localStorage.setItem(KEY, JSON.stringify(v.slice(0, 300))),
    { deep: true }
  )

  const stats = computed(() => {
    const total = entries.value.length
    let black = 0
    let white = 0
    let draw = 0
    for (const e of entries.value) {
      if (e.outcome === 'black') black++
      else if (e.outcome === 'white') white++
      else draw++
    }
    return { total, black, white, draw }
  })

  function add(entry: Omit<HistoryEntry, 'id' | 'date'> & { date?: string }): HistoryEntry {
    const full: HistoryEntry = {
      ...entry,
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: entry.date ?? new Date().toISOString()
    }
    entries.value.unshift(full)
    return full
  }

  function remove(id: string): void {
    entries.value = entries.value.filter((e) => e.id !== id)
  }

  function clear(): void {
    entries.value = []
  }

  return { entries, stats, add, remove, clear }
})
