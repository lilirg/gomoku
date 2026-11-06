<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLanStore } from '@/stores/lan'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import { colorName } from '@/core/constants'

const lan = useLanStore()
const game = useGameStore()
const settings = useSettingsStore()

const joinCode = ref('')
const busy = ref(false)
const inRoom = computed(() => lan.status === 'in-room')
const myColor = computed(() => {
  void game.revision
  return game.mySide === null ? null : game.engine.colorOf(game.mySide)
})

const statusLabel = computed(() => {
  switch (lan.status) {
    case 'connecting':
      return '连接中…'
    case 'connected':
      return '已连接服务'
    case 'in-room':
      return `房间 ${lan.roomCode}`
    case 'error':
      return '连接失败'
    default:
      return '未连接'
  }
})

async function create(): Promise<void> {
  busy.value = true
  try {
    await lan.createRoom()
  } catch {
    /* message 已由 store 记录 */
  } finally {
    busy.value = false
  }
}

async function join(): Promise<void> {
  if (!joinCode.value.trim()) return
  busy.value = true
  try {
    await lan.joinRoom(joinCode.value.trim())
  } catch {
    /* ignore */
  } finally {
    busy.value = false
  }
}

function disconnect(): void {
  lan.disconnect()
}
</script>

<template>
  <div class="panel-lan">
    <section class="block">
      <h3>局域网对战</h3>
      <p class="faint">
        同一局域网内，先运行 <code>npm run server</code> 启动对战服务，再在需要参与的设备上加入房间。
      </p>

      <div class="kv"><span>状态</span><b :class="{ err: lan.status === 'error' }">{{ statusLabel }}</b></div>
      <div v-if="lan.message" class="faint">{{ lan.message }}</div>

      <div v-if="!inRoom" class="stack">
        <button class="btn primary" :disabled="busy" @click="create">创建房间</button>
        <div class="row">
          <input v-model="joinCode" type="text" placeholder="输入 4 位房间号" maxlength="4" @keyup.enter="join" />
          <button class="btn" :disabled="busy || !joinCode.trim()" @click="join">加入</button>
        </div>
      </div>

      <template v-else>
        <div class="room-code">
          <span class="faint">房间号</span>
          <b>{{ lan.roomCode }}</b>
          <button class="btn small ghost" @click="disconnect">离开</button>
        </div>
        <div class="kv">
          <span>本方执子</span>
          <b>{{ lan.side === 0 ? '房主' : '挑战者' }}<template v-if="myColor !== null"> · 执{{ colorName(myColor) }}</template>
          </b>
        </div>
        <div class="kv">
          <span>对手</span>
          <b>{{ lan.peerPresent ? '已就座' : '等待加入…' }}</b>
        </div>
      </template>
    </section>

    <section v-if="inRoom" class="block">
      <h3>对局请求</h3>
      <div class="stack">
        <div class="row">
          <button class="btn small" :disabled="!!lan.pendingUndoFrom" @click="lan.requestUndo()">请求悔棋</button>
          <button class="btn small" @click="lan.requestRematch()">再战一局</button>
        </div>

        <div v-if="lan.pendingUndoFrom !== null" class="request card">
          <span>对手请求悔棋</span>
          <div class="row">
            <button class="btn small primary" @click="lan.acceptUndo()">同意</button>
            <button class="btn small" @click="lan.declineUndo()">拒绝</button>
          </div>
        </div>

        <div v-if="lan.pendingRematchFrom !== null" class="request card">
          <span>对手邀请再战</span>
          <div class="row">
            <button class="btn small primary" @click="lan.acceptRematch()">接受</button>
            <button class="btn small ghost" @click="lan.pendingRematchFrom = null">忽略</button>
          </div>
        </div>
      </div>
    </section>

    <section class="block">
      <div class="field">
        <label>服务地址</label>
        <input v-model="settings.lanUrl" type="text" :placeholder="lan.defaultUrl()" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.panel-lan {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.block h3 {
  font-size: 15px;
  color: var(--gold-bright);
  margin-bottom: 10px;
}

code {
  background: rgba(12, 9, 6, 0.6);
  padding: 1px 6px;
  border-radius: 6px;
  color: var(--gold);
  font-size: 12px;
}

.kv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 13px;
}

.kv span {
  color: var(--text-dim);
}

.kv b.err {
  color: var(--danger);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.room-code {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 10px 0;
}

.room-code b {
  font-family: var(--font-display);
  font-size: 26px;
  letter-spacing: 0.24em;
  color: var(--gold-bright);
}

.request {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  font-size: 13px;
}
</style>
