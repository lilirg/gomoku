import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Board } from '../core/board'
import { BLACK, WHITE } from '../core/constants'
import type { Color, Point } from '../core/types'
import {
  BOARD_FACE,
  createBoardTexture,
  createJadeTexture,
  createPlainWoodTexture,
  woodPalette,
  type WoodTone
} from './textures'

const STONE_RADIUS = 0.42
const STONE_FLAT = 0.3

interface StoneMesh extends THREE.Mesh {
  userData: {
    r: number
    c: number
    color: Color
    t: number
  }
}

export interface SceneCallbacks {
  onPlace?: (r: number, c: number) => void
  onHover?: (p: Point | null) => void
}

export class BoardScene {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  private container: HTMLElement
  private raf = 0
  private ro: ResizeObserver
  private clock = new THREE.Clock()

  private stones = new Map<string, StoneMesh>()
  private boardGroup = new THREE.Group()
  private ghost!: StoneMesh
  private lastMark!: THREE.Mesh
  private hintGroup = new THREE.Group()
  private forbiddenGroup = new THREE.Group()

  private raycaster = new THREE.Raycaster()
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private pointer = new THREE.Vector2()
  private hover: Point | null = null
  private pointerDown: { id: number; x: number; y: number } | null = null
  private activePointers = new Set<number>()
  private interactive = true

  private matBlack!: THREE.MeshPhysicalMaterial
  private matWhite!: THREE.MeshPhysicalMaterial
  private stoneGeo!: THREE.BufferGeometry
  private topMat!: THREE.MeshStandardMaterial
  private sideMat!: THREE.MeshStandardMaterial
  private woodTone: WoodTone = 'classic'

  private cb: SceneCallbacks

  constructor(container: HTMLElement, cb: SceneCallbacks = {}) {
    this.container = container
    this.cb = cb

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = null

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    this.camera.position.set(0, 15.5, 13.5)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.minDistance = 12
    this.controls.maxDistance = 34
    this.controls.minPolarAngle = 0.12
    this.controls.maxPolarAngle = Math.PI * 0.46
    this.controls.enablePan = false
    this.controls.rotateSpeed = 0.85
    this.controls.zoomSpeed = 0.9
    this.controls.autoRotateSpeed = 0.5

    this.buildEnvironment()
    this.buildLights()
    this.buildBoard()
    this.buildOverlays()

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()

    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerCancel)
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave)

    this.animate()
  }

  private buildEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.05)
    this.scene.environment = env.texture
    pmrem.dispose()
  }

  private buildLights(): void {
    const hemi = new THREE.HemisphereLight(0xfff3e0, 0x2a1c10, 0.55)
    this.scene.add(hemi)

    const key = new THREE.DirectionalLight(0xfff1d6, 2.1)
    key.position.set(8, 18, 9)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 5
    key.shadow.camera.far = 60
    key.shadow.camera.left = -14
    key.shadow.camera.right = 14
    key.shadow.camera.top = 14
    key.shadow.camera.bottom = -14
    key.shadow.bias = -0.0006
    key.shadow.radius = 3
    this.scene.add(key)

    const fill = new THREE.DirectionalLight(0xbfd8ff, 0.5)
    fill.position.set(-10, 9, -8)
    this.scene.add(fill)

    const warm = new THREE.PointLight(0xffb066, 0.55, 60, 2)
    warm.position.set(-6, 8, 10)
    this.scene.add(warm)
  }

  private buildBoard(): void {
    const palette = woodPalette(this.woodTone)
    const topTex = createBoardTexture(1600, palette)
    const sideTex = createPlainWoodTexture(1024, palette)
    sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping

    const thickness = 0.7
    this.sideMat = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.68, metalness: 0.02 })
    this.topMat = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.44, metalness: 0.03 })
    const sideMat = this.sideMat
    const topMat = this.topMat
    const bottomMat = new THREE.MeshStandardMaterial({ color: 0x4a3016, roughness: 0.9 })

    // 盒体（侧面/底部为木纹，顶面置空）
    const boxGeo = new THREE.BoxGeometry(BOARD_FACE, thickness, BOARD_FACE)
    const mats = [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat]
    const box = new THREE.Mesh(boxGeo, mats)
    box.position.y = -thickness / 2
    box.receiveShadow = true
    box.castShadow = true
    this.boardGroup.add(box)

    // 顶面单独一层，保证格线清晰
    const topGeo = new THREE.PlaneGeometry(BOARD_FACE, BOARD_FACE)
    const topPlane = new THREE.Mesh(topGeo, topMat)
    topPlane.rotation.x = -Math.PI / 2
    topPlane.position.y = 0.002
    topPlane.receiveShadow = true
    this.boardGroup.add(topPlane)

    this.scene.add(this.boardGroup)

    // 棋子几何与材质
    this.stoneGeo = new THREE.SphereGeometry(STONE_RADIUS, 40, 24)
    this.stoneGeo.scale(1, STONE_FLAT, 1)

    const blackJade = createJadeTexture('#0d1512', 'rgba(70,120,100,0.28)', 'rgba(150,200,175,0.25)')
    const whiteJade = createJadeTexture('#f4f6ec', 'rgba(255,255,255,0.5)', 'rgba(170,180,150,0.22)')

    this.matBlack = new THREE.MeshPhysicalMaterial({
      color: 0x1b2a24,
      map: blackJade,
      roughness: 0.14,
      metalness: 0.0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      transmission: 0.22,
      thickness: 0.6,
      ior: 1.6,
      sheen: 0.6,
      sheenColor: new THREE.Color(0x9fe8c8),
      sheenRoughness: 0.5,
      envMapIntensity: 1.25
    })
    this.matWhite = new THREE.MeshPhysicalMaterial({
      color: 0xf6f8ee,
      map: whiteJade,
      roughness: 0.16,
      metalness: 0.0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      transmission: 0.32,
      thickness: 0.8,
      ior: 1.5,
      sheen: 0.5,
      sheenColor: new THREE.Color(0xdfffee),
      sheenRoughness: 0.6,
      envMapIntensity: 1.15
    })
  }

  private buildOverlays(): void {
    // 落子预览
    this.ghost = this.makeStone(0, 0, BLACK) as StoneMesh
    this.ghost.material = (this.matBlack.clone() as THREE.MeshPhysicalMaterial)
    ;(this.ghost.material as THREE.Material).transparent = true
    ;(this.ghost.material as THREE.Material).opacity = 0.5
    this.ghost.visible = false
    this.ghost.userData.r = -1
    this.ghost.castShadow = false
    this.scene.add(this.ghost)

    // 最后一手标记（环）
    const ringGeo = new THREE.RingGeometry(STONE_RADIUS * 0.62, STONE_RADIUS * 0.78, 40)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    this.lastMark = new THREE.Mesh(ringGeo, ringMat)
    this.lastMark.rotation.x = -Math.PI / 2
    this.lastMark.visible = false
    this.scene.add(this.lastMark)

    this.scene.add(this.hintGroup)
    this.scene.add(this.forbiddenGroup)
  }

  private makeStone(r: number, c: number, color: Color): StoneMesh {
    const mesh = new THREE.Mesh(this.stoneGeo, color === BLACK ? this.matBlack : this.matWhite) as unknown as StoneMesh
    const { x, z } = this.worldXZ(r, c)
    mesh.position.set(x, STONE_RADIUS * STONE_FLAT, z)
    mesh.castShadow = true
    mesh.receiveShadow = false
    mesh.userData = { r, c, color, t: 1 }
    return mesh
  }

  private worldXZ(r: number, c: number): { x: number; z: number } {
    return { x: c - 7, z: 7 - r }
  }

  // ---------- 公开 API ----------

  /** 与棋盘同步棋子 */
  sync(board: Board): void {
    const present = new Set<string>()
    for (let r = 0; r < board.size; r++) {
      for (let c = 0; c < board.size; c++) {
        const v = board.get(r, c)
        if (v === BLACK || v === WHITE) {
          const key = `${r},${c}`
          present.add(key)
          if (!this.stones.has(key)) {
            const m = this.makeStone(r, c, v as Color) as StoneMesh
            m.userData.t = 0
            m.scale.set(1.3, 0.4, 1.3)
            const { x, z } = this.worldXZ(r, c)
            m.position.y = 1.6
            m.position.set(x, 1.6, z)
            this.scene.add(m)
            this.stones.set(key, m)
          }
        }
      }
    }
    for (const [key, mesh] of this.stones) {
      if (!present.has(key)) {
        this.scene.remove(mesh)
        this.stones.delete(key)
      }
    }
  }

  /** 标记最后一手 */
  setLastMove(p: Point | null): void {
    if (!p) {
      this.lastMark.visible = false
      return
    }
    const { x, z } = this.worldXZ(p.r, p.c)
    this.lastMark.position.set(x, 0.035, z)
    this.lastMark.visible = true
  }

  /** 落子预览 */
  setGhost(p: Point | null, color: Color): void {
    if (!p || !this.interactive) {
      this.ghost.visible = false
      return
    }
    const mat = this.ghost.material as THREE.MeshPhysicalMaterial
    const src = color === BLACK ? this.matBlack : this.matWhite
    mat.color.copy(src.color)
    mat.map = src.map
    mat.needsUpdate = true
    const { x, z } = this.worldXZ(p.r, p.c)
    this.ghost.position.set(x, STONE_RADIUS * STONE_FLAT, z)
    this.ghost.visible = true
  }

  setInteractive(v: boolean): void {
    this.interactive = v
    if (!v) this.ghost.visible = false
  }

  /** 提示点（如活三/冲四） */
  setHints(points: Point[], color = 0x66c2ff): void {
    this.clearGroup(this.hintGroup)
    const geo = new THREE.RingGeometry(STONE_RADIUS * 0.5, STONE_RADIUS * 0.68, 28)
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    for (const p of points) {
      const m = new THREE.Mesh(geo, mat)
      m.rotation.x = -Math.PI / 2
      const { x, z } = this.worldXZ(p.r, p.c)
      m.position.set(x, 0.03, z)
      this.hintGroup.add(m)
    }
  }

  /** 禁手点标记 */
  setForbidden(points: Point[]): void {
    this.clearGroup(this.forbiddenGroup)
    const geo = new THREE.RingGeometry(STONE_RADIUS * 0.34, STONE_RADIUS * 0.52, 28)
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    for (const p of points) {
      const m = new THREE.Mesh(geo, mat)
      m.rotation.x = -Math.PI / 2
      const { x, z } = this.worldXZ(p.r, p.c)
      m.position.set(x, 0.03, z)
      this.forbiddenGroup.add(m)
    }
  }

  /** 多选候选点（十 5 打点） */
  setCandidates(points: Point[]): void {
    this.setHints(points, 0xffc857)
  }

  private clearGroup(g: THREE.Group): void {
    for (let i = g.children.length - 1; i >= 0; i--) g.remove(g.children[i])
  }

  setAutoRotate(v: boolean): void {
    this.controls.autoRotate = v
  }

  /** 切换棋盘木色（经典浅木 / 胡桃 / 深檀） */
  setWood(tone: WoodTone): void {
    if (tone === this.woodTone) return
    this.woodTone = tone
    const palette = woodPalette(tone)
    const topTex = createBoardTexture(1600, palette)
    const sideTex = createPlainWoodTexture(1024, palette)
    sideTex.wrapS = sideTex.wrapT = THREE.RepeatWrapping
    const old = [this.topMat.map, this.sideMat.map]
    this.topMat.map = topTex
    this.topMat.needsUpdate = true
    this.sideMat.map = sideTex
    this.sideMat.needsUpdate = true
    for (const t of old) t?.dispose()
  }

  resetView(): void {
    this.camera.position.set(0, 15.5, 13.5)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  setTopView(): void {
    this.camera.position.set(0, 22, 0.001)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  // ---------- 交互 ----------

  private pickGrid(clientX: number, clientY: number): Point | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) return null
    const c = Math.round(hit.x + 7)
    const r = Math.round(7 - hit.z)
    if (r < 0 || r > 14 || c < 0 || c > 14) return null
    const dx = Math.abs(hit.x - (c - 7))
    const dz = Math.abs(hit.z - (7 - r))
    if (dx > 0.5 || dz > 0.5) return null
    return { r, c }
  }

  private clearHover(): void {
    if (this.hover === null) return
    this.hover = null
    this.cb.onHover?.(null)
  }

  private onPointerMove = (e: PointerEvent): void => {
    // 触屏无悬停：拖动只用于旋转视角，不显示落子预览
    if (e.pointerType === 'touch') {
      this.clearHover()
      return
    }
    const p = this.pickGrid(e.clientX, e.clientY)
    if ((p?.r ?? -1) !== (this.hover?.r ?? -1) || (p?.c ?? -1) !== (this.hover?.c ?? -1)) {
      this.hover = p
      this.cb.onHover?.(p)
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.activePointers.add(e.pointerId)
    if (this.activePointers.size === 1) {
      this.pointerDown = { id: e.pointerId, x: e.clientX, y: e.clientY }
    } else {
      // 多指手势（捏合缩放）：取消落子判定
      this.pointerDown = null
      this.clearHover()
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId)
    const down = this.pointerDown
    this.pointerDown = null
    if (!down || down.id !== e.pointerId) return
    if (this.activePointers.size > 0) return // 仍有多指按下
    if (!this.interactive) return
    const threshold = e.pointerType === 'touch' ? 12 : 6
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    if (moved > threshold) return // 拖动旋转，不落子
    const p = this.pickGrid(e.clientX, e.clientY)
    if (p) this.cb.onPlace?.(p.r, p.c)
  }

  private onPointerCancel = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId)
    this.pointerDown = null
  }

  private onPointerLeave = (): void => {
    this.activePointers.clear()
    this.pointerDown = null
    this.clearHover()
  }

  private resize(): void {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private animate = (): void => {
    this.raf = requestAnimationFrame(this.animate)
    const dt = this.clock.getDelta()
    this.controls.update()

    // 落子动画
    for (const m of this.stones.values()) {
      if (m.userData.t < 1) {
        m.userData.t = Math.min(1, m.userData.t + dt * 6)
        const k = 1 - Math.pow(1 - m.userData.t, 3)
        const { x, z } = this.worldXZ(m.userData.r, m.userData.c)
        const s = 1.3 - 0.3 * k
        m.scale.set(s, s, s)
        m.position.set(x, STONE_RADIUS * STONE_FLAT + (1 - k) * 1.4, z)
      }
    }

    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.renderer.domElement.removeEventListener('pointercancel', this.onPointerCancel)
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave)
    this.controls.dispose()
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    })
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
