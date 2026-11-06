<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useGameStore } from '@/stores/game'
import { TRACKS } from '@/audio/music'

const settings = useSettingsStore()
const game = useGameStore()

const forbiddenLocked = computed(() => settings.mode !== 'free')

function applyAndNewGame(): void {
  game.newGame({ mode: settings.mode, forbidden: settings.mode === 'free' ? settings.forbidden : true })
}
</script>

<template>
  <div class="panel-settings">
    <section class="block">
      <h3>对局规则</h3>
      <div class="field">
        <label>开局模式</label>
        <select v-model="settings.mode">
          <option value="tara-10">塔拉山口-10 开局（默认，黑方禁手）</option>
          <option value="swap2">Swap2（两次交换）开局</option>
          <option value="free">自由开局</option>
        </select>
      </div>

      <label class="switch" :class="{ locked: forbiddenLocked }">
        <span>黑方禁手（三三 / 四四 / 长连）</span>
        <input v-model="settings.forbidden" type="checkbox" :disabled="forbiddenLocked" />
      </label>
      <p v-if="forbiddenLocked" class="faint">塔拉山口-10 与 Swap2 依规则固定启用禁手，仅自由开局可切换。</p>

      <div class="field">
        <label>猜先方式</label>
        <select v-model="settings.firstChoice">
          <option value="random">随机猜先</option>
          <option value="black">本方固定执黑</option>
          <option value="white">本方固定执白</option>
        </select>
      </div>

      <div class="row">
        <div class="field grow">
          <label>黑方名称</label>
          <input v-model="settings.blackName" type="text" />
        </div>
        <div class="field grow">
          <label>白方名称</label>
          <input v-model="settings.whiteName" type="text" />
        </div>
      </div>

      <button class="btn primary" @click="applyAndNewGame">应用并开始新局</button>
    </section>

    <section class="block">
      <h3>界面与提示</h3>
      <label class="switch">
        <span>显示取胜/威胁提示</span>
        <input v-model="settings.showHints" type="checkbox" />
      </label>
      <label class="switch">
        <span>显示禁手点</span>
        <input v-model="settings.showForbidden" type="checkbox" />
      </label>
      <label class="switch">
        <span>棋盘自动旋转</span>
        <input v-model="settings.autoRotate" type="checkbox" />
      </label>
      <div class="field">
        <label>棋盘木色</label>
        <select v-model="settings.woodTone">
          <option value="classic">经典浅木</option>
          <option value="walnut">胡桃</option>
          <option value="dark">深檀</option>
        </select>
      </div>
    </section>

    <section class="block">
      <h3>声音</h3>
      <div class="field">
        <label>背景音乐</label>
        <select v-model="settings.musicTrack">
          <option :value="null">关闭</option>
          <option v-for="t in TRACKS" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
      </div>
      <div class="field">
        <label>音乐音量</label>
        <input v-model.number="settings.musicVolume" type="range" min="0" max="1" step="0.02" />
      </div>
      <label class="switch">
        <span>静音</span>
        <input v-model="settings.musicMuted" type="checkbox" />
      </label>
      <label class="switch">
        <span>落子等游戏音效</span>
        <input v-model="settings.sfxEnabled" type="checkbox" />
      </label>
    </section>
  </div>
</template>

<style scoped>
.panel-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.block h3 {
  font-size: 15px;
  color: var(--gold-bright);
}

.grow {
  flex: 1;
}

.switch.locked {
  opacity: 0.6;
}
</style>
