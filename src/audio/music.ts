/**
 * 预置背景音乐：使用 Web Audio 实时合成，无任何外部音频文件，不涉及版权。
 * 每首曲目是一段生成式的东方风氛围乐（音阶 + 拨弦/铺底 + 混响）。
 */

export interface TrackDef {
  id: string
  name: string
  root: number // MIDI 根音
  scale: number[] // 音阶（半音）
  wave: OscillatorType
  bpm: number
  filter: number
}

export const TRACKS: TrackDef[] = [
  { id: 'guzheng', name: '古道 · 拨弦', root: 57, scale: [0, 2, 4, 7, 9, 12], wave: 'triangle', bpm: 74, filter: 2600 },
  { id: 'forest', name: '山林 · 空灵', root: 50, scale: [0, 3, 5, 7, 10, 12], wave: 'sine', bpm: 52, filter: 1700 },
  { id: 'night', name: '夜阑 · 低吟', root: 45, scale: [0, 2, 3, 7, 8, 12], wave: 'sine', bpm: 46, filter: 1150 },
  { id: 'bamboo', name: '竹韵 · 清越', root: 60, scale: [0, 2, 4, 7, 9, 12], wave: 'triangle', bpm: 92, filter: 3200 }
]

const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

export class MusicPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private reverb: ConvolverNode | null = null
  private reverbGain: GainNode | null = null
  private drone: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null
  private timer: number | null = null
  private track: TrackDef | null = null
  private nextTime = 0
  private volume = 0.45
  private muted = false

  get currentId(): string | null {
    return this.track?.id ?? null
  }

  get isPlaying(): boolean {
    return this.track !== null
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.muted ? 0 : this.volume
      this.master.connect(this.ctx.destination)

      // 简易混响
      this.reverb = this.ctx.createConvolver()
      this.reverb.buffer = this.makeImpulse(this.ctx, 2.6, 2.4)
      this.reverbGain = this.ctx.createGain()
      this.reverbGain.gain.value = 0.34
      this.reverb.connect(this.reverbGain)
      this.reverbGain.connect(this.master)
    }
    return this.ctx
  }

  private makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate
    const len = Math.floor(rate * seconds)
    const buf = ctx.createBuffer(2, len, rate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
      }
    }
    return buf
  }

  async play(id: string): Promise<void> {
    const def = TRACKS.find((t) => t.id === id)
    if (!def) return
    const ctx = this.ensureCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    this.stop()
    this.track = def
    this.nextTime = ctx.currentTime + 0.1
    this.startDrone(def)
    this.timer = window.setInterval(() => this.schedule(), 25)
  }

  private startDrone(def: TrackDef): void {
    const ctx = this.ctx!
    const gain = ctx.createGain()
    gain.gain.value = 0.0
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = midiToFreq(def.root - 12)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.06
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.045
    lfo.connect(lfoGain)
    lfoGain.connect(gain.gain)
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    osc.connect(gain)
    gain.connect(this.master!)
    gain.connect(this.reverb!)
    osc.start()
    lfo.start()
    this.drone = { osc, lfo, gain }
  }

  private schedule(): void {
    const ctx = this.ctx
    if (!ctx || !this.track) return
    const beat = 60 / this.track.bpm
    while (this.nextTime < ctx.currentTime + 0.6) {
      if (Math.random() < 0.72) this.playNote(this.track, this.nextTime)
      // 偶尔叠一个高八度
      if (Math.random() < 0.16) this.playNote(this.track, this.nextTime + beat * 0.5, 12)
      this.nextTime += beat * (Math.random() < 0.3 ? 2 : 1)
    }
  }

  private playNote(def: TrackDef, time: number, octave = 0): void {
    const ctx = this.ctx!
    const deg = def.scale[Math.floor(Math.random() * def.scale.length)]
    const midi = def.root + deg + octave
    const freq = midiToFreq(midi)

    const osc = ctx.createOscillator()
    osc.type = def.wave
    osc.frequency.value = freq
    const g = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = def.filter

    const peak = 0.12 + Math.random() * 0.06
    const dur = 1.6 + Math.random() * 2.2
    g.gain.setValueAtTime(0.0001, time)
    g.gain.exponentialRampToValueAtTime(peak, time + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur)

    osc.connect(filter)
    filter.connect(g)
    g.connect(this.master!)
    g.connect(this.reverb!)
    osc.start(time)
    osc.stop(time + dur + 0.1)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.drone && this.ctx) {
      const t = this.ctx.currentTime
      this.drone.gain.gain.cancelScheduledValues(t)
      this.drone.gain.gain.setValueAtTime(this.drone.gain.gain.value, t)
      this.drone.gain.gain.linearRampToValueAtTime(0, t + 0.6)
      const { osc, lfo } = this.drone
      osc.stop(t + 0.7)
      lfo.stop(t + 0.7)
      this.drone = null
    }
    this.track = null
  }

  setVolume(v: number): void {
    this.volume = v
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime)
      this.master.gain.linearRampToValueAtTime(this.muted ? 0 : v, this.ctx.currentTime + 0.08)
    }
  }

  setMuted(m: boolean): void {
    this.muted = m
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime)
      this.master.gain.linearRampToValueAtTime(m ? 0 : this.volume, this.ctx.currentTime + 0.08)
    }
  }

  get isMuted(): boolean {
    return this.muted
  }
}

export const musicPlayer = new MusicPlayer()
