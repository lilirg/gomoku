/**
 * 五子棋 · 局域网对战服务
 * 无需外网：同一局域网内的设备直连本服务即可开房对弈。
 *
 * 运行：npm run server     （默认端口 8787，可用环境变量 PORT 覆盖）
 */
import { WebSocketServer } from 'ws'
import os from 'node:os'

const PORT = Number(process.env.PORT || 8787)
const wss = new WebSocketServer({ port: PORT })

/** code -> Set<WebSocket> */
const rooms = new Map()

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  } while (rooms.has(code))
  return code
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
}

function roomPeers(code) {
  return Array.from(rooms.get(code) ?? [])
}

function broadcastRoom(code, obj, except) {
  for (const peer of roomPeers(code)) {
    if (peer !== except) send(peer, obj)
  }
}

function leaveRoom(ws) {
  const code = ws.room
  if (!code) return
  const set = rooms.get(code)
  if (!set) return
  set.delete(ws)
  ws.room = null
  broadcastRoom(code, { t: 'peer-left', side: ws.side })
  if (set.size === 0) rooms.delete(code)
}

wss.on('connection', (ws, req) => {
  ws.room = null
  ws.side = null
  const ip = req.socket.remoteAddress
  console.log(`[+] 连接 ${ip}`)

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    switch (msg.t) {
      case 'create': {
        const code = genCode()
        rooms.set(code, new Set([ws]))
        ws.room = code
        ws.side = 0
        send(ws, { t: 'created', room: code, side: 0 })
        console.log(`[房] ${code} 创建`)
        break
      }
      case 'join': {
        const code = String(msg.room || '').toUpperCase()
        const set = rooms.get(code)
        if (!set) {
          send(ws, { t: 'error', message: '房间不存在' })
          break
        }
        if (set.size >= 2) {
          send(ws, { t: 'error', message: '房间已满' })
          break
        }
        set.add(ws)
        ws.room = code
        ws.side = 1
        send(ws, { t: 'joined', room: code, side: 1 })
        broadcastRoom(code, { t: 'peer-joined', side: 1 }, ws)
        console.log(`[房] ${code} 加入`)
        break
      }
      case 'action': {
        if (!ws.room) break
        broadcastRoom(ws.room, { t: 'action', action: msg.action }, ws)
        break
      }
      case 'control': {
        if (!ws.room) break
        const { t, ...rest } = msg
        broadcastRoom(ws.room, { t: 'control', ...rest }, ws)
        break
      }
      case 'ping': {
        send(ws, { t: 'pong' })
        break
      }
      default:
        break
    }
  })

  ws.on('close', () => {
    console.log(`[-] 断开 ${ip}`)
    leaveRoom(ws)
  })
  ws.on('error', () => leaveRoom(ws))
})

function localAddresses() {
  const out = []
  const ifaces = os.networkInterfaces()
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address)
    }
  }
  return out
}

console.log('五子棋 · 局域网对战服务已启动')
console.log(`  端口: ${PORT}`)
console.log('  本机地址（供同一局域网的其他设备连接）:')
for (const a of localAddresses()) console.log(`    ws://${a}:${PORT}`)
console.log('  本机: ws://localhost:' + PORT)
