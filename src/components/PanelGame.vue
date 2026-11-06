<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import { BLACK, colorName } from '@/core/constants'
import { toLabel } from '@/core/coords'
import { drawReasonLabel, winReasonLabel } from '@/core/record'
import type { Move } from '@/core/types'

const game = useGameStore()
const settings = useSettingsStore()

const modeLabel = computed(
  () => ({ 'tara-10': '塔拉山口-10 开局', swap2: 'Swap2（两次交换）开局', free: '自由开局' })[game.mode] ?? game.mode
)

const firstChoiceLabel = computed(
  () => ({ black: '固定先手（本方执黑）', white: '固定后手（本方执白）', random: '随机猜先' })[settings.firstChoice]
)

const resultText = computed(() => {
  const r = game.result
  if (!r) return null
  if (r.type === 'win') return `${colorName(r.winner)}方胜 · ${winReasonLabel(r.reason)}`
  return `和棋 · ${drawReasonLabel(r.reason)}`
})

function moveText(m: Move): string {
  if (m.kind === 'swap') return '交换'
  if (m.kind === 'offer') return '给出 10 打点'
  if (m.r < 0) return 'pass'
  return toLabel(m)
}

function isLast(m: Move): boolean {
  return game.moves.length > 0 && game.moves[game.moves.length - 1].n === m.n
}
</script>

<template>
  <div class="panel-game">
    <section class="block">
      <h3>对局</h3>
      <div class="kv"><span>规则</span><b>中国五子棋竞赛规则（2025）</b></div>
      <div class="kv"><span>开局</span><b>{{ modeLabel }}</b></div>
      <div class="kv"><span>禁手</span><b>{{ game.forbiddenEnabled ? '黑方有禁手' : '双方均无禁手' }}</b></div>
      <div class="kv"><span>猜先</span><b>{{ firstChoiceLabel }}</b></div>
      <div class="kv">
        <span>执子</span>
        <b>
          {{ settings.blackName }}（黑）· {{ settings.whiteName }}（白）
          <template v-if="game.playMode === 'lan' && game.mySide !== null">
            · 本方执{{ colorName(game.engine.colorOf(game.mySide)) }}
          </template>
        </b>
      </div>
    </section>

    <section class="block">
      <div class="block-head">
        <h3>着法记录</h3>
        <span class="faint">共 {{ game.moves.length }} 着</span>
      </div>
      <ol class="move-list">
        <li v-for="m in game.moves" :key="m.n" :class="{ last: isLast(m) }">
          <span class="idx">{{ m.n }}</span>
          <span class="dot" :class="m.color === BLACK ? 'black' : 'white'"></span>
          <span class="txt">{{ moveText(m) }}</span>
        </li>
        <li v-if="game.moves.length === 0" class="empty">尚无着法</li>
      </ol>
    </section>

    <section v-if="resultText" class="block result">
      <h3>结果</h3>
      <p>{{ resultText }}</p>
    </section>
  </div>
</template>

<style scoped>
.panel-game {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.block h3 {
  font-size: 15px;
  color: var(--gold-bright);
  margin-bottom: 10px;
}

.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.kv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 13px;
  border-bottom: 1px dashed rgba(226, 193, 136, 0.1);
}

.kv span {
  color: var(--text-dim);
  flex: none;
}

.kv b {
  font-weight: 500;
  text-align: right;
}

.move-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 300px;
  overflow-y: auto;
}

.move-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border-radius: 8px;
  font-size: 13px;
}

.move-list li.last {
  background: rgba(216, 171, 95, 0.16);
}

.move-list .idx {
  width: 28px;
  text-align: right;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}

.move-list .txt {
  font-variant-numeric: tabular-nums;
}

.move-list .empty {
  color: var(--text-faint);
  justify-content: center;
  padding: 14px;
}

.dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  flex: none;
}

.dot.black {
  background: radial-gradient(circle at 35% 30%, #4a5650, #0a0f0d 70%);
}

.dot.white {
  background: radial-gradient(circle at 35% 30%, #ffffff, #cfd6c8 75%);
}

.result p {
  margin: 0;
  font-family: var(--font-display);
  font-size: 17px;
  color: var(--gold-bright);
}
</style>
