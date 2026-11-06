<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BoardScene } from '@/three/scene'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import { useLanStore } from '@/stores/lan'
import { BLACK, colorName, withinSquare } from '@/core/constants'
import { toLabel } from '@/core/coords'
import type { Color, Point } from '@/core/types'

const game = useGameStore()
const settings = useSettingsStore()
const lan = useLanStore()

const host = ref<HTMLElement | null>(null)
let scene: BoardScene | null = null

const selected = ref<Point[]>([])

const expect = computed(() => game.expectation)
const needCount = computed(() => (expect.value.kind === 'offer' ? expect.value.count : 0))

const promptText = computed(() => {
  const e = expect.value
  if (game.phase === 'finished') return '对局结束'
  if (e.kind === 'end') return ''
  if (game.playMode === 'ai' && e.side !== game.mySide) {
    return game.aiThinking ? 'AI 思考中…' : '等待 AI 落子'
  }
  if (e.kind === 'swap') return '请选择是否交换'
  if (e.kind === 'fifth-mode') return '黑方请选择第 5 子的方式'
  if (e.kind === 'offer') return `请在 9×9 区域内给出 10 个打点（已选 ${selected.value.length}/10）`
  if (e.kind === 'pick') return '白方请从打点中选择第 5 子'
  const zone = e.size ? `，限 ${e.size}×${e.size}` : ''
  return `${colorName(e.color)}方落子${zone}`
})

function emptyAt(r: number, c: number): boolean {
  return game.engine.board.isEmpty(r, c)
}

function canPlaceAt(r: number, c: number): boolean {
  if (!game.canAct) return false
  const e = expect.value
  if (e.kind === 'stone') {
    if (!emptyAt(r, c)) return false
    return e.size === null || withinSquare({ r, c }, e.size)
  }
  if (e.kind === 'pick') return e.options.some((p) => p.r === r && p.c === c)
  if (e.kind === 'offer') {
    if (!emptyAt(r, c)) return false
    if (e.size !== null && !withinSquare({ r, c }, e.size)) return false
    return !selected.value.some((p) => p.r === r && p.c === c)
  }
  return false
}

function ghostColor(): Color {
  return expect.value.kind === 'stone' ? expect.value.color : BLACK
}

function handlePlace(r: number, c: number): void {
  if (!game.canAct) return
  const e = expect.value
  if (e.kind === 'stone') {
    game.place(r, c)
  } else if (e.kind === 'pick') {
    game.pick(r, c)
  } else if (e.kind === 'offer') {
    if (!canPlaceAt(r, c)) return
    if (selected.value.length >= e.count) return
    selected.value.push({ r, c })
    scene?.setCandidates(selected.value)
  }
}

function handleHover(p: Point | null): void {
  if (!p || !canPlaceAt(p.r, p.c)) {
    scene?.setGhost(null, BLACK)
    return
  }
  scene?.setGhost(p, ghostColor())
}

function confirmOffer(): void {
  if (expect.value.kind !== 'offer') return
  if (selected.value.length !== expect.value.count) return
  game.offerPoints(selected.value.map((p) => ({ ...p })))
  selected.value = []
  scene?.setCandidates([])
}

function clearOffer(): void {
  selected.value = []
  scene?.setCandidates([])
}

function syncScene(): void {
  if (!scene) return
  scene.sync(game.engine.board)
  scene.setLastMove(game.lastMove)
  scene.setInteractive(game.canAct || expect.value.kind !== 'end')
  scene.setForbidden(settings.showForbidden ? game.forbiddenPoints : [])
  const hints = [...game.hintPoints, ...game.threatPoints]
  scene.setHints(hints, 0x66c2ff)
  if (expect.value.kind !== 'offer') {
    selected.value = []
    scene.setCandidates([])
  } else {
    scene.setCandidates(selected.value)
  }
}

onMounted(() => {
  if (!host.value) return
  scene = new BoardScene(host.value, {
    onPlace: handlePlace,
    onHover: handleHover
  })
  scene.setAutoRotate(settings.autoRotate)
  scene.setWood(settings.woodTone)
  syncScene()
})

watch(() => game.revision, syncScene)
watch(
  () => settings.autoRotate,
  (v) => scene?.setAutoRotate(v)
)
watch(
  () => settings.woodTone,
  (v) => scene?.setWood(v)
)
watch(
  () => expect.value.kind,
  () => syncScene()
)

onBeforeUnmount(() => {
  scene?.dispose()
  scene = null
})

const coordsHint = computed(() => {
  const lm = game.lastMove
  return lm ? toLabel(lm) : '—'
})

const turnLabel = computed(() => {
  if (game.phase === 'finished') return '终局'
  return `${colorName(game.turn)}方行棋`
})

const twoPlayerHint = computed(() => {
  if (game.playMode === 'ai') {
    if (game.aiSide === null) return '人机对战'
    const c = colorName(game.engine.colorOf(game.aiSide))
    return game.aiThinking ? `AI 思考中（执${c}）…` : `人机对战 · AI 执${c}`
  }
  if (game.playMode !== 'lan') return '本地双人'
  return lan.peerPresent ? `房间 ${lan.roomCode}` : '等待对手…'
})

const blackTurn = computed(() => game.turn === BLACK)
</script>

<template>
  <div class="board-wrap">
    <div ref="host" class="board-canvas"></div>

    <!-- 顶部信息 -->
    <div class="overlay top-left">
      <div class="pill" :class="{ black: blackTurn, white: !blackTurn }">
        <span class="dot" :class="{ black: blackTurn, white: !blackTurn }"></span>
        {{ turnLabel }}
      </div>
      <div class="pill subtle">{{ twoPlayerHint }}</div>
    </div>

    <div class="overlay top-right">
      <div class="pill subtle">最后一手 {{ coordsHint }}</div>
    </div>

    <!-- 提示文案 -->
    <div v-if="promptText" class="overlay bottom-center">
      <div class="prompt">{{ promptText }}</div>
      <div v-if="expect.kind === 'offer'" class="offer-actions">
        <button class="btn small" :disabled="selected.length !== needCount" @click="confirmOffer">
          确认打点
        </button>
        <button class="btn small ghost" @click="clearOffer">清除</button>
      </div>
    </div>

    <!-- 视角控制 -->
    <div class="overlay view-ctrl">
      <button class="icon" title="复位视角" @click="scene?.resetView()">⤢</button>
      <button class="icon" title="俯视" @click="scene?.setTopView()">▣</button>
      <button
        class="icon"
        :class="{ active: settings.autoRotate }"
        title="自动旋转"
        @click="settings.autoRotate = !settings.autoRotate"
      >
        ↻
      </button>
    </div>
  </div>
</template>

<style scoped>
.board-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 320px;
  border-radius: 18px;
  overflow: hidden;
  background: radial-gradient(circle at 50% 30%, rgba(60, 42, 24, 0.55), rgba(14, 11, 8, 0.9));
}
.board-canvas {
  position: absolute;
  inset: 0;
  /* 独立合成层：避免相邻 DOM 重绘时把画布一起重栅格化（WebView2 闪黑） */
  transform: translateZ(0);
}
.overlay {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
  z-index: 3;
}
.overlay.top-left {
  top: 12px;
  left: 12px;
}
.overlay.top-right {
  top: 12px;
  right: 12px;
}
.overlay.bottom-center {
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  align-items: center;
}
.overlay.view-ctrl {
  right: 12px;
  bottom: 12px;
  flex-direction: row;
  gap: 8px;
  pointer-events: auto;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 14px;
  color: #f3ead9;
  background: rgba(24, 18, 12, 0.87);
  border: 1px solid rgba(255, 230, 180, 0.16);
}
.pill.subtle {
  font-size: 12px;
  color: #cbb894;
  padding: 5px 12px;
}
.pill .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.5);
}
.dot.black {
  background: radial-gradient(circle at 35% 30%, #4a5650, #0a0f0d 70%);
}
.dot.white {
  background: radial-gradient(circle at 35% 30%, #ffffff, #cfd6c8 75%);
}
.prompt {
  padding: 8px 18px;
  border-radius: 12px;
  font-size: 14px;
  color: #ffe9c4;
  background: rgba(38, 26, 14, 0.8);
  border: 1px solid rgba(255, 210, 140, 0.22);
}
.offer-actions {
  display: flex;
  gap: 8px;
  pointer-events: auto;
}
.icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid rgba(255, 230, 180, 0.18);
  background: rgba(24, 18, 12, 0.87);
  color: #f0e2c6;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
}
.icon:hover,
.icon.active {
  background: rgba(196, 148, 72, 0.85);
  color: #1a1206;
}
@media (max-width: 720px) {
  .overlay.top-right {
    display: none;
  }
}
</style>
