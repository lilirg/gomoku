import { BOARD_SIZE } from './constants'
import type { Cell, Color, Point } from './types'

/** 棋盘：以 Uint8Array 存储，get 越界返回 -1（视作“墙”） */
export class Board {
  readonly size: number
  cells: Uint8Array

  constructor(size = BOARD_SIZE) {
    this.size = size
    this.cells = new Uint8Array(size * size)
  }

  private idx(r: number, c: number): number {
    return r * this.size + c
  }

  inBounds(r: number, c: number): boolean {
    return r >= 0 && r < this.size && c >= 0 && c < this.size
  }

  /** 越界返回 -1（墙） */
  get(r: number, c: number): Cell | -1 {
    if (!this.inBounds(r, c)) return -1
    return this.cells[this.idx(r, c)] as Cell
  }

  set(r: number, c: number, v: Cell): void {
    if (this.inBounds(r, c)) this.cells[this.idx(r, c)] = v
  }

  isEmpty(r: number, c: number): boolean {
    return this.get(r, c) === 0
  }

  place(p: Point, color: Color): void {
    this.set(p.r, p.c, color)
  }

  clear(p: Point): void {
    this.set(p.r, p.c, 0)
  }

  clone(): Board {
    const b = new Board(this.size)
    b.cells = this.cells.slice()
    return b
  }

  reset(): void {
    this.cells.fill(0)
  }

  /** 落子总数 */
  count(): number {
    let n = 0
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i]) n++
    return n
  }

  isFull(): boolean {
    return this.count() === this.size * this.size
  }
}
