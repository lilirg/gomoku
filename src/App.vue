<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BoardView from '@/components/BoardView.vue'
import ControlBar from '@/components/ControlBar.vue'
import PanelGame from '@/components/PanelGame.vue'
import PanelAi from '@/components/PanelAi.vue'
import PanelLan from '@/components/PanelLan.vue'
import PanelHistory from '@/components/PanelHistory.vue'
import PanelSettings from '@/components/PanelSettings.vue'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import { useHistoryStore } from '@/stores/history'
import { useLanStore } from '@/stores/lan'
import { unlockAudio } from '@/audio/sfx'
import { colorName } from '@/core/constants'
import { drawReasonLabel, exportSGF, downloadText, winReasonLabel } from '@/core/record'

const game = useGameStore()
const settings = useSettingsStore()
const history = useHistoryStore()
const lan = useLanStore()

type Tab = 'game' | 'ai' | 'lan' | 'history' | 'settings'
const tab = ref<Tab>('ai')
const dismissed = ref(false)

const showResult = computed(() => game.phase === 'finished' && game.result !== null && !dismissed.value)

const resultTitle = computed(() => {
  const r = game.result
  if (!r) return ''
  if (r.type === 'win') return `${colorName(r.winner)}方胜`
  return '和棋'
})

const resultReason = computed(() => {
  const r = game.result
  if (!r) return ''
  return r.type === 'win' ? winReasonLabel(r.reason) : drawReasonLabel(r.reason)
})

const inLanRoom = computed(() => game.playMode === 'lan' && lan.status === 'in-room')

function newGame(): void {
  dismissed.value = false
  game.restart()
}

function exportResult(): void {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const meta = {
    title: `${settings.blackName} vs ${settings.whiteName}`,
    blackName: settings.blackName,
    whiteName: settings.whiteName,
    event: game.playMode === 'lan' ? '局域网对局' : '本地对局',
    mode: game.mode,
    forbidden: game.forbiddenEnabled,
    date: new Date().toISOString()
  }
  downloadText(`五子棋-${stamp}.sgf`, exportSGF(game.moves, meta, game.result), 'application/x-go-sgf')
}

let audioReady = false
function primeAudio(): void {
  if (audioReady) return
  audioReady = true
  unlockAudio()
  settings.applyMusic()
}

onMounted(() => {
  document.addEventListener('pointerdown', primeAudio, { once: true })
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="mark">弈</span>
        <div class="titles">
          <h1>五子棋 · 竞赛版</h1>
          <p>中国五子棋竞赛规则（2025）· 塔拉山口-10 · 黑方禁手</p>
        </div>
      </div>

      <div class="top-actions">
        <div class="stats">
          <span>总 {{ history.stats.total }}</span>
          <span>黑 {{ history.stats.black }}</span>
          <span>白 {{ history.stats.white }}</span>
          <span>和 {{ history.stats.draw }}</span>
        </div>
        <button class="btn" :disabled="inLanRoom" :title="inLanRoom ? '局域网对局请使用“再战一局”' : ''" @click="newGame">
          新对局
        </button>
      </div>
    </header>

    <main class="stage">
      <section class="board-area card">
        <BoardView />
        <ControlBar />
      </section>

      <aside class="side card">
        <nav class="tabs">
          <button :class="{ active: tab === 'game' }" @click="tab = 'game'">对局</button>
          <button :class="{ active: tab === 'ai' }" @click="tab = 'ai'">
            人机<span v-if="game.playMode === 'ai'" class="live"></span>
          </button>
          <button :class="{ active: tab === 'lan' }" @click="tab = 'lan'">
            局域网<span v-if="lan.peerPresent" class="live"></span>
          </button>
          <button :class="{ active: tab === 'history' }" @click="tab = 'history'">历史</button>
          <button :class="{ active: tab === 'settings' }" @click="tab = 'settings'">设置</button>
        </nav>
        <div class="tab-body">
          <PanelGame v-if="tab === 'game'" />
          <PanelAi v-else-if="tab === 'ai'" />
          <PanelLan v-else-if="tab === 'lan'" />
          <PanelHistory v-else-if="tab === 'history'" />
          <PanelSettings v-else />
        </div>
      </aside>
    </main>

    <!-- 结算弹窗 -->
    <div v-if="showResult" class="result-mask">
      <div class="result-dialog card">
        <p class="faint">对局结束</p>
        <h2>{{ resultTitle }}</h2>
        <p class="reason">{{ resultReason }}</p>
        <div class="result-actions">
          <button class="btn primary" @click="newGame">再来一局</button>
          <button class="btn" @click="exportResult">导出棋谱</button>
          <button class="btn ghost" @click="dismissed = true">查看棋盘</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px clamp(14px, 3vw, 32px) 26px;
  max-width: 1440px;
  margin: 0 auto;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.mark {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  font-family: var(--font-display);
  font-size: 26px;
  color: #201503;
  background: linear-gradient(150deg, var(--gold-bright), var(--gold-deep));
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.titles h1 {
  font-size: 20px;
}

.titles p {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 0.06em;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stats {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-dim);
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(12, 9, 6, 0.4);
}

.stage {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 16px;
  align-items: stretch;
}

.board-area {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 520px;
}

.board-area > :first-child {
  flex: 1;
  min-height: 0;
}

.side {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tabs {
  display: flex;
  gap: 2px;
  padding: 8px 8px 0;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

.tabs button {
  position: relative;
  border: none;
  background: transparent;
  color: var(--text-dim);
  padding: 10px 14px;
  font-size: 14px;
  cursor: pointer;
  border-radius: 10px 10px 0 0;
  white-space: nowrap;
  flex: none;
}

.tabs button.active {
  color: var(--gold-bright);
  background: rgba(216, 171, 95, 0.12);
}

.tabs .live {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--jade);
  box-shadow: 0 0 8px var(--jade);
}

.tab-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.result-mask {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(6, 4, 2, 0.66);
  backdrop-filter: blur(4px);
  z-index: 50;
}

.result-dialog {
  width: min(360px, 88vw);
  padding: 26px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: pop 0.22s ease-out;
}

.result-dialog h2 {
  font-size: 30px;
  color: var(--gold-bright);
}

.result-dialog .reason {
  margin: 0;
  color: var(--text-dim);
  font-size: 14px;
}

.result-actions {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 12px;
}

@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 980px) {
  .stage {
    grid-template-columns: 1fr;
  }
  .board-area {
    min-height: 420px;
  }
  .side {
    min-height: 420px;
  }
}

@media (max-width: 560px) {
  .app {
    padding: 12px 10px 20px;
    gap: 12px;
  }
  .board-area {
    min-height: 62vh;
  }
  .tabs button {
    padding: 10px 9px;
    font-size: 13px;
  }
}
</style>
