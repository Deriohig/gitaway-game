// Optional ambient sound: a soft, slowly gusting breeze and the occasional
// distant bird, synthesised on the fly. Off by default; nothing is downloaded.

import { now } from '../game/clock'

let ctx: AudioContext | null = null
let stopFns: (() => void)[] = []

function brownNoise(context: AudioContext): AudioBuffer {
  const length = context.sampleRate * 4
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.2
  }
  return buffer
}

function chirp(context: AudioContext, out: AudioNode) {
  const t = context.currentTime
  const notes = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < notes; i++) {
    const osc = context.createOscillator()
    const gain = context.createGain()
    const start = t + i * 0.16
    const base = 2600 + Math.random() * 900
    osc.type = 'sine'
    osc.frequency.setValueAtTime(base, start)
    osc.frequency.exponentialRampToValueAtTime(base * 1.35, start + 0.08)
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.012, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12)
    osc.connect(gain).connect(out)
    osc.start(start)
    osc.stop(start + 0.14)
  }
}

export function startAmbient() {
  if (ctx) return
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  ctx = new AC()
  const context = ctx

  const master = context.createGain()
  master.gain.value = 0
  master.gain.linearRampToValueAtTime(0.5, context.currentTime + 3)
  master.connect(context.destination)

  const noise = context.createBufferSource()
  noise.buffer = brownNoise(context)
  noise.loop = true
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 420
  const wind = context.createGain()
  wind.gain.value = 0.05
  const lfo = context.createOscillator()
  lfo.frequency.value = 0.07
  const lfoDepth = context.createGain()
  lfoDepth.gain.value = 0.03
  lfo.connect(lfoDepth).connect(wind.gain)
  noise.connect(filter).connect(wind).connect(master)
  noise.start()
  lfo.start()

  let birdTimer: ReturnType<typeof setTimeout>
  const scheduleBird = () => {
    birdTimer = setTimeout(() => {
      const hour = new Date(now()).getHours()
      if (hour > 5 && hour < 21) chirp(context, master)
      scheduleBird()
    }, 9000 + Math.random() * 16000)
  }
  scheduleBird()

  // Browsers keep audio suspended until the page is interacted with.
  const resume = () => void context.resume()
  window.addEventListener('pointerdown', resume, { once: true })
  stopFns = [() => clearTimeout(birdTimer), () => window.removeEventListener('pointerdown', resume)]
}

export function stopAmbient() {
  stopFns.forEach((f) => f())
  stopFns = []
  void ctx?.close()
  ctx = null
}
