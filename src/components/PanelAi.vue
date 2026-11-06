<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import { useLanStore } from '@/stores/lan'
import { AI_LEVELS, aiLevelConfig, type AiLevel } from '@/core/ai/levels'
import { colorName } from '@/core/constants'

const game = useGameStore()
const settings = useSettingsStore()
const lan = useLanStore()

const active = computed(() => game.playMode === 'ai')
const cfg = computed(() => aiLevelConfig(settings.aiLevel))

function setLevel(id: AiLevel): void {
  settings.aiLevel = id
  if (active.value) game.aiLevel = id
}

const myColor = computed(() => (game.mySide === null ? null : game.engine.colorOf(game.mySide)))
const aiColor = computed(() => (game.aiSide === null ? null : game.engine.colorOf(game.aiSide)))

const myLabel = computed(() => (myColor.value === null ? '—' : `本方执${colorName(myColor.value)}`))
const aiLabel = computed(() => (aiColor.value === null ? '—' : `AI 执${colorName(aiColor.value)}`))

const statusLabel = computed(() => {
  if (game.phase === 'finished') return '对局结束'
  if (game.aiThinking) return 'AI 思考中…'
  return active.value ? '轮到你行棋' : '未开始'
})

function start(): void {
  if (lan.status !== 'idle') lan.disconnect()
  game.startAiGame(settings.aiLevel, settings.aiHuman)
}

function stop(): void {
  game.stopAi()
}
</script>

<template>
  <div class="panel-ai">
    <section class="block">
      <h3>人机对战</h3>
      <p class="faint">对阵内置 Rapfi 引擎（WebAssembly），开局遵循当前规则（塔拉山口-10 等）与黑方禁手。</p>

      <div class="field">
        <label>难度</label>
        <div class="levels">
          <button
            v-for="lv in AI_LEVELS"
            :key="lv.id"
            class="lv"
            :class="{ active: settings.aiLevel === lv.id }"
            @click="setLevel(lv.id)"
          >
            {{ lv.label }}
          </button>
        </div>
        <div class="blurb">{{ cfg.blurb }}</div>
      </div>

      <div class="field">
        <label>本方执子</label>
        <div class="row">
          <button class="btn small" :class="{ primary: settings.aiHuman === 'black' }" @click="settings.aiHuman = 'black'">
            执黑
          </button>
          <button class="btn small" :class="{ primary: settings.aiHuman === 'white' }" @click="settings.aiHuman = 'white'">
            执白
          </button>
          <button class="btn small" :class="{ primary: settings.aiHuman === 'random' }" @click="settings.aiHuman = 'random'">
            随机
          </button>
        </div>
      </div>

      <div class="stack">
        <button class="btn primary" @click="start">{{ active ? '重新开始' : '开始人机对局' }}</button>
        <button v-if="active" class="btn ghost" @click="stop">退出人机</button>
      </div>
    </section>

    <section v-if="active" class="block">
      <h3>对局信息</h3>
      <div class="kv"><span>难度</span><b>{{ cfg.label }}</b></div>
      <div class="kv"><span>本方</span><b>{{ myLabel }}</b></div>
      <div class="kv"><span>对手</span><b>{{ aiLabel }}</b></div>
      <div class="kv"><span>状态</span><b :class="{ live: game.aiThinking }">{{ statusLabel }}</b></div>
    </section>
  </div>
</template>

<style scoped>
.panel-ai {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.block h3 {
  font-size: 15px;
  color: var(--gold-bright);
  margin-bottom: 10px;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  font-size: 12px;
  color: var(--text-dim);
  margin-bottom: 8px;
  letter-spacing: 0.06em;
}

.levels {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}

.lv {
  border: 1px solid var(--border);
  background: rgba(12, 9, 6, 0.5);
  color: var(--text-dim);
  border-radius: 9px;
  padding: 9px 4px;
  font-size: 13px;
  cursor: pointer;
  transition: 0.15s;
}

.lv:hover {
  border-color: var(--gold);
  color: var(--gold-bright);
}

.lv.active {
  background: linear-gradient(180deg, var(--gold-bright), var(--gold-deep));
  border-color: var(--gold-deep);
  color: #201503;
  font-weight: 600;
}

.blurb {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-faint);
}

.row {
  display: flex;
  gap: 8px;
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 4px;
}

.kv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px dashed rgba(226, 193, 136, 0.1);
}

.kv span {
  color: var(--text-dim);
}

.kv b.live {
  color: var(--jade);
}
</style>
