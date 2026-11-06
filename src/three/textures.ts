/**
 * 程序化纹理：实木棋盘、玉石棋子。
 * 全部用 Canvas 生成，无需外部图片资源。
 */
import * as THREE from 'three'

export interface WoodPalette {
  base1: string
  base2: string
  grainDark: string
  grainLight: string
  line: string
  star: string
  label: string
}

export const DEFAULT_WOOD: WoodPalette = {
  base1: '#d9a95f',
  base2: '#b57c38',
  grainDark: 'rgba(80,44,16,0.10)',
  grainLight: 'rgba(255,224,170,0.10)',
  line: 'rgba(46,26,10,0.82)',
  star: 'rgba(40,22,8,0.92)',
  label: 'rgba(60,36,14,0.75)'
}

export const WALNUT_WOOD: WoodPalette = {
  base1: '#8a5a2b',
  base2: '#5c3816',
  grainDark: 'rgba(38,20,8,0.22)',
  grainLight: 'rgba(212,162,104,0.12)',
  line: 'rgba(28,15,6,0.85)',
  star: 'rgba(22,11,4,0.95)',
  label: 'rgba(228,196,140,0.72)'
}

export const DARK_WOOD: WoodPalette = {
  base1: '#4a3320',
  base2: '#2a1c10',
  grainDark: 'rgba(8,5,2,0.32)',
  grainLight: 'rgba(184,142,92,0.10)',
  line: 'rgba(226,193,136,0.58)',
  star: 'rgba(226,193,136,0.82)',
  label: 'rgba(226,193,136,0.66)'
}

export type WoodTone = 'classic' | 'walnut' | 'dark'

export function woodPalette(tone: WoodTone): WoodPalette {
  return tone === 'walnut' ? WALNUT_WOOD : tone === 'dark' ? DARK_WOOD : DEFAULT_WOOD
}

function drawWoodBase(ctx: CanvasRenderingContext2D, size: number, p: WoodPalette): void {
  const g = ctx.createLinearGradient(0, 0, size, size * 0.6)
  g.addColorStop(0, p.base1)
  g.addColorStop(1, p.base2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // 木纹：沿一个主方向的层叠曲线
  ctx.save()
  for (let i = 0; i < 260; i++) {
    const y0 = Math.random() * size
    const amp = 4 + Math.random() * 26
    const freq = 1.5 + Math.random() * 2.5
    const phase = Math.random() * Math.PI * 2
    const drift = (Math.random() - 0.5) * size * 0.12
    ctx.beginPath()
    ctx.moveTo(0, y0)
    for (let x = 0; x <= size; x += 10) {
      const y = y0 + Math.sin((x / size) * Math.PI * freq + phase) * amp * 0.18 + (x / size) * drift
      ctx.lineTo(x, y)
    }
    ctx.strokeStyle = Math.random() > 0.5 ? p.grainDark : p.grainLight
    ctx.lineWidth = 0.6 + Math.random() * 2.2
    ctx.stroke()
  }
  // 少量木节
  for (let i = 0; i < 5; i++) {
    const cx = Math.random() * size
    const cy = Math.random() * size
    const r = 8 + Math.random() * 26
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    rg.addColorStop(0, 'rgba(70,38,12,0.22)')
    rg.addColorStop(1, 'rgba(70,38,12,0)')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // 边缘暗角
  const vg = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.72)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(40,20,4,0.28)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, size, size)
}

/** 棋盘尺寸（世界单位）：格距 1，14 格 + 两侧留边 0.9 */
export const BOARD_CELL = 1
export const BOARD_MARGIN = 0.9
export const BOARD_FACE = 14 + BOARD_MARGIN * 2 // 15.8

/** 生成带格线、星位、坐标标注的棋盘顶面纹理 */
export function createBoardTexture(size = 1600, palette: WoodPalette = DEFAULT_WOOD): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')!
  drawWoodBase(ctx, size, palette)

  const face = BOARD_FACE
  const half = face / 2
  // 世界坐标 <-> 画布像素
  const toPx = (worldX: number, worldZ: number) => {
    const u = (worldX + half) / face
    const v = (-worldZ + half) / face
    return { x: u * size, y: (1 - v) * size }
  }
  const gridPt = (r: number, c: number) => toPx(c - 7, 7 - r)

  // 内框
  const a = gridPt(0, 0)
  const b = gridPt(14, 14)
  ctx.strokeStyle = palette.line
  ctx.lineWidth = Math.max(2, size * 0.0035)
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)

  // 格线
  ctx.lineWidth = Math.max(1, size * 0.0012)
  ctx.strokeStyle = palette.line
  for (let i = 0; i < 15; i++) {
    const p1 = gridPt(i, 0)
    const p2 = gridPt(i, 14)
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    const q1 = gridPt(0, i)
    const q2 = gridPt(14, i)
    ctx.beginPath()
    ctx.moveTo(q1.x, q1.y)
    ctx.lineTo(q2.x, q2.y)
    ctx.stroke()
  }

  // 星位与天元
  const stars: Array<[number, number]> = [
    [3, 3],
    [3, 11],
    [11, 3],
    [11, 11],
    [7, 7]
  ]
  ctx.fillStyle = palette.star
  for (const [r, c] of stars) {
    const p = gridPt(r, c)
    ctx.beginPath()
    ctx.arc(p.x, p.y, size * 0.0062, 0, Math.PI * 2)
    ctx.fill()
  }

  // 坐标标注
  ctx.fillStyle = palette.label
  ctx.font = `600 ${Math.round(size * 0.017)}px "Georgia", serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let c = 0; c < 15; c++) {
    const p = toPx(c - 7, half - 0.1)
    ctx.fillText(String.fromCharCode(65 + c), p.x, p.y + size * 0.005)
  }
  for (let r = 0; r < 15; r++) {
    const p = toPx(-half + 0.1, 7 - r)
    ctx.fillText(String(r + 1), p.x, p.y)
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** 无格线的纯木纹（用于棋盘侧面与底部） */
export function createPlainWoodTexture(size = 1024, palette: WoodPalette = DEFAULT_WOOD): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')!
  drawWoodBase(ctx, size, palette)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1, 1)
  return tex
}

/** 玉石纹理：底色 + 云絮 + 细筋 */
export function createJadeTexture(base: string, blotch: string, vein: string, size = 512): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  // 云絮状斑块
  for (let i = 0; i < 60; i++) {
    const cx = Math.random() * size
    const cy = Math.random() * size
    const r = size * (0.04 + Math.random() * 0.16)
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, blotch)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // 细筋
  for (let i = 0; i < 14; i++) {
    ctx.beginPath()
    let x = Math.random() * size
    let y = Math.random() * size
    ctx.moveTo(x, y)
    for (let k = 0; k < 8; k++) {
      x += (Math.random() - 0.5) * size * 0.3
      y += (Math.random() - 0.5) * size * 0.3
      ctx.lineTo(x, y)
    }
    ctx.strokeStyle = vein
    ctx.lineWidth = 0.6 + Math.random() * 1.4
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
