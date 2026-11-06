/** 轻量音效：落子、交换、禁手、胜负。使用 Web Audio 合成。 */

let ctx: AudioContext | null = null
let enabled = true

function ac(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
  }
  return ctx
}

function blip(freq: number, dur: number, type: OscillatorType, gain = 0.12, freqTo?: number): void {
  if (!enabled) return
  const c = ac()
  if (c.state === 'suspended') void c.resume()
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime)
  if (freqTo) osc.frequency.exponentialRampToValueAtTime(freqTo, c.currentTime + dur)
  g.gain.setValueAtTime(0.0001, c.currentTime)
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + dur + 0.05)
}

function noiseHit(dur: number, gain = 0.16): void {
  if (!enabled) return
  const c = ac()
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  const src = c.createBufferSource()
  src.buffer = buf
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 1400
  const g = c.createGain()
  g.gain.value = gain
  src.connect(f)
  f.connect(g)
  g.connect(c.destination)
  src.start()
}

export const sfx = {
  setEnabled(v: boolean): void {
    enabled = v
  },
  place(): void {
    noiseHit(0.09, 0.18)
    blip(320, 0.06, 'sine', 0.06, 180)
  },
  swap(): void {
    blip(520, 0.12, 'triangle', 0.1, 760)
  },
  forbidden(): void {
    blip(180, 0.35, 'sawtooth', 0.12, 90)
  },
  win(): void {
    const notes = [523, 659, 784, 1047]
    notes.forEach((n, i) => setTimeout(() => blip(n, 0.35, 'triangle', 0.12), i * 130))
  },
  lose(): void {
    const notes = [392, 330, 262]
    notes.forEach((n, i) => setTimeout(() => blip(n, 0.4, 'sine', 0.12), i * 160))
  }
}

export function unlockAudio(): void {
  const c = ac()
  if (c.state === 'suspended') void c.resume()
}
