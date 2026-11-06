<script setup lang="ts">
import { computed } from 'vue'
import { useHistoryStore } from '@/stores/history'
import { downloadText, exportSGF, winReasonLabel, drawReasonLabel } from '@/core/record'
import type { GameResult, Move } from '@/core/types'

const history = useHistoryStore()

const stats = computed(() => history.stats)

function resultText(e: { outcome: string; reason: string; result: GameResult | null }): string {
  if (e.result?.type === 'win') return `${e.result.winner === 1 ? '黑' : '白'}胜 · ${winReasonLabel(e.result.reason)}`
  if (e.result?.type === 'draw') return `和棋 · ${drawReasonLabel(e.result.reason)}`
  return e.outcome === 'draw' ? '和棋' : e.outcome === 'black' ? '黑胜' : '白胜'
}

function dateText(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

function exportEntry(e: { blackName: string; whiteName: string; mode: string; forbidden: boolean; date: string; moves: Move[]; result: GameResult | null }): void {
  const meta = {
    title: `${e.blackName} vs ${e.whiteName}`,
    blackName: e.blackName,
    whiteName: e.whiteName,
    event: '历史对局',
    mode: e.mode,
    forbidden: e.forbidden,
    date: e.date
  }
  const stamp = e.date.slice(0, 19).replace(/[:T]/g, '-')
  downloadText(`五子棋-${stamp}.sgf`, exportSGF(e.moves, meta, e.result), 'application/x-go-sgf')
}
</script>

<template>
  <div class="panel-history">
    <section class="block">
      <div class="block-head">
        <h3>战绩统计</h3>
        <button v-if="stats.total" class="btn small ghost" @click="history.clear()">清空</button>
      </div>
      <div class="stats">
        <div class="stat"><b>{{ stats.total }}</b><span>总对局</span></div>
        <div class="stat"><b>{{ stats.black }}</b><span>黑胜</span></div>
        <div class="stat"><b>{{ stats.white }}</b><span>白胜</span></div>
        <div class="stat"><b>{{ stats.draw }}</b><span>和棋</span></div>
      </div>
    </section>

    <section class="block">
      <h3>历史记录</h3>
      <ul class="history-list">
        <li v-for="e in history.entries" :key="e.id">
          <div class="line1">
            <span class="names">{{ e.blackName }} <i>vs</i> {{ e.whiteName }}</span>
            <span class="res" :class="e.outcome">{{ resultText(e) }}</span>
          </div>
          <div class="line2">
            <span class="faint">{{ dateText(e.date) }} · {{ e.movesCount }} 手</span>
            <span class="ops">
              <button class="btn small ghost" @click="exportEntry(e)">导出</button>
              <button class="btn small ghost" @click="history.remove(e.id)">删除</button>
            </span>
          </div>
        </li>
        <li v-if="!history.entries.length" class="empty">暂无历史对局</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.panel-history {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.block h3 {
  font-size: 15px;
  color: var(--gold-bright);
}

.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  border-radius: 10px;
  background: rgba(12, 9, 6, 0.45);
  border: 1px solid var(--border);
}

.stat b {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--gold-bright);
}

.stat span {
  font-size: 11px;
  color: var(--text-dim);
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
}

.history-list li {
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(12, 9, 6, 0.4);
  border: 1px solid var(--border);
}

.history-list li.empty {
  text-align: center;
  color: var(--text-faint);
  padding: 18px;
}

.line1,
.line2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.line1 {
  margin-bottom: 6px;
  font-size: 13px;
}

.names i {
  color: var(--text-faint);
  font-style: normal;
  margin: 0 4px;
}

.res {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
}

.res.black {
  color: #ffe9c4;
  background: rgba(60, 50, 40, 0.7);
}

.res.white {
  color: #eef3e6;
  background: rgba(90, 98, 84, 0.5);
}

.res.draw {
  color: var(--text-dim);
  background: rgba(60, 60, 60, 0.5);
}

.ops {
  display: flex;
  gap: 4px;
}
</style>
