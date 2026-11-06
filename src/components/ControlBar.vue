<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import { colorName } from '@/core/constants'
import { downloadText, exportJSON, exportSGF, exportText } from '@/core/record'
import type { Color } from '@/core/types'

const game = useGameStore()
const settings = useSettingsStore()

const expect = computed(() => game.expectation)
const finished = computed(() => game.phase === 'finished')
const canUndo = computed(() => game.canUndo)

/** Swap2 的“扩展”分支只在选择点出现 */
const swap2Extend = computed(() => game.mode === 'swap2' && game.swap2.stage === 'choose')

const canPass = computed(() => expect.value.kind === 'stone' && game.phase === 'playing')

function resignBy(): Color {
  if (game.playMode === 'lan' && game.mySide !== null) return game.engine.colorOf(game.mySide)
  return game.turn
}

function onResign(): void {
  if (finished.value) return
  const by = resignBy()
  if (window.confirm(`确认${colorName(by)}方认输？`)) game.resign(by)
}

const exportOpen = ref(false)

function meta() {
  return {
    title: `${settings.blackName} vs ${settings.whiteName}`,
    blackName: settings.blackName,
    whiteName: settings.whiteName,
    event: game.playMode === 'lan' ? '局域网对局' : '本地对局',
    mode: game.mode,
    forbidden: game.forbiddenEnabled,
    date: new Date().toISOString()
  }
}

function doExport(kind: 'sgf' | 'txt' | 'json'): void {
  exportOpen.value = false
  const m = meta()
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  if (kind === 'sgf') downloadText(`五子棋-${stamp}.sgf`, exportSGF(game.moves, m, game.result), 'application/x-go-sgf')
  else if (kind === 'txt') downloadText(`五子棋-${stamp}.txt`, exportText(game.moves, m, game.result))
  else downloadText(`五子棋-${stamp}.json`, exportJSON(game.moves, m, game.result), 'application/json')
}
</script>

<template>
  <div class="control-bar">
    <!-- 开局阶段：上下文操作 -->
    <div v-if="!finished" class="opening-actions">
      <template v-if="expect.kind === 'swap'">
        <span class="hint">{{ swap2Extend ? '轮到你应对开局：' : '对手落子，你可选择：' }}</span>
        <button class="btn primary" @click="game.swap()">交换</button>
        <button class="btn" @click="game.noswap()">不交换</button>
        <button v-if="swap2Extend" class="btn" @click="game.extend()">再放两子</button>
      </template>

      <template v-else-if="expect.kind === 'fifth-mode'">
        <span class="hint">黑方第 5 子方式：</span>
        <button class="btn primary" @click="game.fifthSingle()">单五打</button>
        <button class="btn" @click="game.fifthTen()">十 5 打</button>
      </template>

      <template v-else-if="expect.kind === 'offer'">
        <span class="hint">在棋盘 9×9 内点选 10 个打点，然后确认</span>
      </template>

      <template v-else-if="expect.kind === 'pick'">
        <span class="hint">白方请从金色打点中选择第 5 子</span>
      </template>

      <template v-else-if="expect.kind === 'stone'">
        <span class="hint">
          请{{ colorName(expect.color) }}方落子<span v-if="expect.size">（限 {{ expect.size }}×{{ expect.size }}）</span>
        </span>
      </template>
    </div>

    <!-- 对局操作 -->
    <div class="game-actions">
      <button class="btn small" :disabled="finished || !canUndo" @click="game.undo()">悔棋</button>
      <button class="btn small" :disabled="!canPass" @click="game.pass()">放弃行棋</button>
      <button class="btn small danger" :disabled="finished" @click="onResign">认输</button>

      <div class="export">
        <button class="btn small" @click="exportOpen = !exportOpen">导出棋谱 ▾</button>
        <div v-if="exportOpen" class="export-menu card" @mouseleave="exportOpen = false">
          <button @click="doExport('sgf')">SGF 棋谱</button>
          <button @click="doExport('txt')">文字记录</button>
          <button @click="doExport('json')">JSON 数据</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.control-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 12px 16px;
}

.opening-actions,
.game-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hint {
  font-size: 13px;
  color: var(--text-dim);
  margin-right: 2px;
}

.export {
  position: relative;
}

.export-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  min-width: 150px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  z-index: 20;
}

.export-menu button {
  text-align: left;
  background: transparent;
  border: none;
  color: var(--text);
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}

.export-menu button:hover {
  background: rgba(216, 171, 95, 0.18);
}
</style>
