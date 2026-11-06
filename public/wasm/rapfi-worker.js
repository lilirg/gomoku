/*
 * Rapfi WASM 协议 worker（经典 worker，使用 importScripts 加载 Emscripten 胶水）。
 * 通过 Gomocup/piskvork 协议驱动引擎：BOARD 自带重置棋盘，单线程下搜索同步完成，
 * sendCommand 返回时最佳着法已打印到 stdout。
 */
/* eslint-disable no-undef */
'use strict'

let engine = null // { mod, lines }
let bootPromise = null

function boot(jsUrl) {
  if (bootPromise) return bootPromise
  bootPromise = new Promise(function (resolve, reject) {
    const lines = []
    let settled = false
    const fail = function (err) {
      if (!settled) {
        settled = true
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    try {
      importScripts(jsUrl)
    } catch (e) {
      fail(e)
      return
    }
    if (typeof self.Rapfi !== 'function') {
      fail(new Error('Rapfi factory not found at ' + jsUrl))
      return
    }
    const base = jsUrl.replace(/[^/]*$/, '')
    self
      .Rapfi({
        noInitialRun: false,
        print: function () {},
        printErr: function () {},
        locateFile: function (p) {
          // 产物 JS 内部引用 rapfi-single-simd128.wasm，这里统一映射到 rapfi.wasm
          if (/\.wasm$/.test(p)) return base + 'rapfi.wasm'
          return base + p
        },
        onReceiveStdout: function (line) {
          lines.push(line)
        },
        onReceiveStderr: function () {}
      })
      .then(function (mod) {
        if (!settled) {
          settled = true
          engine = { mod: mod, lines: lines }
          resolve(engine)
        }
      })
      .catch(fail)
  })
  return bootPromise
}

function bestMove(msg) {
  if (!engine) return null
  const mod = engine.mod
  const lines = engine.lines
  lines.length = 0

  // 规则：黑方禁手 -> 1（标准），否则 0（自由）
  mod.sendCommand('INFO RULE ' + (msg.rule | 0))
  mod.sendCommand('START ' + (msg.size | 0))
  mod.sendCommand('INFO MAX_MEMORY ' + (msg.maxMemoryBytes | 0))
  if (msg.maxDepth > 0) mod.sendCommand('INFO MAX_DEPTH ' + (msg.maxDepth | 0))
  mod.sendCommand('INFO TIMEOUT_TURN ' + (msg.timeoutMs | 0))

  const parts = ['BOARD']
  for (let i = 0; i < msg.stones.length; i++) {
    const s = msg.stones[i]
    parts.push(s.c + ',' + s.r + ',' + s.who)
  }
  parts.push('DONE')
  mod.sendCommand(parts.join('\n'))

  // 从后往前找形如 "x,y" 的着法行
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^(-?\d+)\s*,\s*(-?\d+)$/.exec(lines[i].trim())
    if (m) {
      const x = parseInt(m[1], 10)
      const y = parseInt(m[2], 10)
      if (x < 0 || y < 0) return null
      return { r: y, c: x }
    }
  }
  return null
}

self.onmessage = function (ev) {
  const msg = ev.data || {}
  if (msg.type === 'init') {
    boot(msg.jsUrl).then(
      function () {
        self.postMessage({ type: 'ready' })
      },
      function (err) {
        self.postMessage({ type: 'init-error', error: String((err && err.message) || err) })
      }
    )
    return
  }
  if (msg.type === 'move') {
    let move = null
    let error = null
    try {
      move = bestMove(msg)
    } catch (e) {
      error = String((e && e.message) || e)
    }
    self.postMessage({ type: 'move', id: msg.id, move: move, error: error })
  }
}
