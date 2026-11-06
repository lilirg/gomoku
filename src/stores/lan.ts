import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Action, GameOptions } from '@/core/rules/engine'
import { useGameStore } from './game'
import { useSettingsStore } from './settings'

type Status = 'idle' | 'connecting' | 'connected' | 'in-room' | 'error'

interface SyncPayload {
  opts: GameOptions | null
  actions: Action[]
}

export const useLanStore = defineStore('lan', () => {
  const game = useGameStore()
  const settings = useSettingsStore()

  const status = ref<Status>('idle')
  const roomCode = ref<string | null>(null)
  const side = ref<0 | 1 | null>(null)
  const peerPresent = ref(false)
  const message = ref('')
  const pendingUndoFrom = ref<0 | 1 | null>(null)
  const pendingRematchFrom = ref<0 | 1 | null>(null)

  let ws: WebSocket | null = null

  function defaultUrl(): string {
    if (settings.lanUrl) return settings.lanUrl
    const host = location.hostname || 'localhost'
    return `ws://${host}:8787`
  }

  function send(obj: unknown): void {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj))
  }

  function sendAction(a: Action): void {
    send({ t: 'action', action: a })
  }

  function sendControl(obj: Record<string, unknown>): void {
    send({ t: 'control', ...obj })
  }

  function connect(url?: string): Promise<void> {
    const target = url || defaultUrl()
    settings.lanUrl = target
    return new Promise((resolve, reject) => {
      try {
        ws?.close()
        ws = new WebSocket(target)
        status.value = 'connecting'
        ws.onopen = () => {
          status.value = 'connected'
          message.value = '已连接'
          resolve()
        }
        ws.onerror = () => {
          status.value = 'error'
          message.value = '连接失败，请确认已运行 npm run server'
          reject(new Error('ws error'))
        }
        ws.onclose = () => {
          if (status.value !== 'error') status.value = 'idle'
          peerPresent.value = false
          roomCode.value = null
          side.value = null
          game.setSendHook(null)
        }
        ws.onmessage = (ev) => handle(JSON.parse(ev.data))
      } catch (e) {
        status.value = 'error'
        message.value = String(e)
        reject(e)
      }
    })
  }

  function handle(msg: Record<string, unknown>): void {
    switch (msg.t) {
      case 'created': {
        roomCode.value = String(msg.room)
        side.value = 0
        game.playMode = 'lan'
        game.mySide = 0
        game.lanRoom = roomCode.value
        status.value = 'in-room'
        message.value = `房间 ${roomCode.value} 已创建，等待对手加入…`
        game.setSendHook((a) => sendAction(a))
        break
      }
      case 'joined': {
        roomCode.value = String(msg.room)
        side.value = 1
        game.playMode = 'lan'
        game.mySide = 1
        game.lanRoom = roomCode.value
        status.value = 'in-room'
        peerPresent.value = true
        message.value = `已加入房间 ${roomCode.value}`
        game.setSendHook((a) => sendAction(a))
        break
      }
      case 'peer-joined': {
        peerPresent.value = true
        message.value = '对手已加入'
        if (side.value === 0) {
          const payload = game.syncPayload()
          sendControl({ kind: 'sync', payload })
        }
        break
      }
      case 'peer-left': {
        peerPresent.value = false
        message.value = '对手已离开'
        break
      }
      case 'action': {
        game.applyRemote(msg.action as Action)
        break
      }
      case 'control': {
        handleControl(msg as Record<string, unknown>)
        break
      }
      case 'error': {
        message.value = String(msg.message)
        break
      }
      default:
        break
    }
  }

  function handleControl(msg: Record<string, unknown>): void {
    switch (msg.kind) {
      case 'sync': {
        const p = msg.payload as SyncPayload
        if (p?.opts) game.replay(p.opts, p.actions ?? [])
        break
      }
      case 'undo-request':
        pendingUndoFrom.value = (msg.from as 0 | 1) ?? null
        break
      case 'undo-accept':
        game.undo()
        break
      case 'undo-decline':
        message.value = '对手拒绝悔棋'
        break
      case 'rematch-request':
        pendingRematchFrom.value = (msg.from as 0 | 1) ?? null
        break
      case 'rematch-accept':
        game.newGame((msg.opts as GameOptions) ?? undefined)
        break
      default:
        break
    }
  }

  function createRoom(): Promise<void> {
    return connect().then(() => send({ t: 'create' }))
  }

  function joinRoom(code: string): Promise<void> {
    return connect().then(() => send({ t: 'join', room: code.toUpperCase() }))
  }

  function requestUndo(): void {
    sendControl({ kind: 'undo-request', from: side.value })
  }
  function acceptUndo(): void {
    const from = pendingUndoFrom.value
    pendingUndoFrom.value = null
    game.undo()
    sendControl({ kind: 'undo-accept', from })
  }
  function declineUndo(): void {
    const from = pendingUndoFrom.value
    pendingUndoFrom.value = null
    sendControl({ kind: 'undo-decline', from })
  }

  function requestRematch(): void {
    sendControl({ kind: 'rematch-request', from: side.value, opts: game.syncPayload().opts })
  }
  function acceptRematch(): void {
    const opts = game.syncPayload().opts ?? undefined
    pendingRematchFrom.value = null
    game.newGame(opts)
    sendControl({ kind: 'rematch-accept', opts })
  }

  function disconnect(): void {
    ws?.close()
    ws = null
    game.setSendHook(null)
    game.playMode = 'local'
    game.mySide = null
    game.lanRoom = null
    status.value = 'idle'
  }

  const isHost = computed(() => side.value === 0)

  return {
    status,
    roomCode,
    side,
    peerPresent,
    message,
    pendingUndoFrom,
    pendingRematchFrom,
    isHost,
    defaultUrl,
    connect,
    createRoom,
    joinRoom,
    requestUndo,
    acceptUndo,
    declineUndo,
    requestRematch,
    acceptRematch,
    disconnect
  }
})
