import * as THREE from 'three'
import type { TimeOfDayPreference } from '../game/state'
import { clamp01 } from './random'

// The light follows the player's own clock: cool mornings, warm afternoons,
// rosy evenings and a calm blue night with fireflies.

export interface SkyKey {
  top: string
  mid: string
  bottom: string
  fog: string
  sun: string
  sunI: number
  hemiSky: string
  hemiGround: string
  hemiI: number
  /** Window and lantern glow. */
  glow: number
  fireflies: number
  stars: number
}

const NIGHT: SkyKey = {
  top: '#252E48', mid: '#3B4463', bottom: '#5B5E7E', fog: '#4A5070',
  sun: '#9DB0D8', sunI: 0.45, hemiSky: '#7C88AE', hemiGround: '#3A3944', hemiI: 0.6,
  glow: 1.5, fireflies: 1, stars: 1,
}

const KEYS: [number, SkyKey][] = [
  [0, NIGHT],
  [4.6, NIGHT],
  [6.1, {
    top: '#7C91B4', mid: '#CBB3B6', bottom: '#F2C9A6', fog: '#D8BFB3',
    sun: '#F7C08F', sunI: 1.0, hemiSky: '#C9C6D6', hemiGround: '#6B5E52', hemiI: 0.85,
    glow: 0.55, fireflies: 0.15, stars: 0.2,
  }],
  [8.5, {
    top: '#A1C2D3', mid: '#CEE0E2', bottom: '#F3EEE2', fog: '#DAE5E2',
    sun: '#FFF0D8', sunI: 1.75, hemiSky: '#DDE9EE', hemiGround: '#7A6A55', hemiI: 1.05,
    glow: 0, fireflies: 0, stars: 0,
  }],
  [13, {
    top: '#9CC1D3', mid: '#C9DFE3', bottom: '#F5F0E6', fog: '#DDE7E4',
    sun: '#FFF5E4', sunI: 1.9, hemiSky: '#E2EDF0', hemiGround: '#80705A', hemiI: 1.1,
    glow: 0, fireflies: 0, stars: 0,
  }],
  [16.6, {
    top: '#A6BED0', mid: '#E1D6C7', bottom: '#F4DDB8', fog: '#E6DAC7',
    sun: '#FFE3B5', sunI: 1.75, hemiSky: '#E6E2DA', hemiGround: '#806A55', hemiI: 1.0,
    glow: 0.05, fireflies: 0, stars: 0,
  }],
  [18.6, {
    top: '#9A92B3', mid: '#E0B4A6', bottom: '#F2C08A', fog: '#E1BDA3',
    sun: '#FFC27F', sunI: 1.95, hemiSky: '#E6CFC6', hemiGround: '#8A6E5C', hemiI: 1.0,
    glow: 0.65, fireflies: 0.25, stars: 0,
  }],
  [20.1, {
    top: '#5B6189', mid: '#A3849A', bottom: '#DC9E80', fog: '#A48A93',
    sun: '#F2A47A', sunI: 1.15, hemiSky: '#ABA0BE', hemiGround: '#5E5052', hemiI: 0.85,
    glow: 1.15, fireflies: 0.75, stars: 0.35,
  }],
  [21.6, NIGHT],
  [24, NIGHT],
]

const PRESETS: Record<Exclude<TimeOfDayPreference, 'clock'>, number> = {
  morning: 8.2,
  afternoon: 14.5,
  evening: 19.1,
  night: 22.6,
}

export function hourFor(pref: TimeOfDayPreference, now: number): number {
  if (pref !== 'clock') return PRESETS[pref]
  const d = new Date(now)
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

export interface SkyState {
  hour: number
  top: THREE.Color
  mid: THREE.Color
  bottom: THREE.Color
  fog: THREE.Color
  sun: THREE.Color
  sunI: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  hemiI: number
  glow: number
  fireflies: number
  stars: number
  /** Direction the light comes from (unit vector). */
  lightDir: THREE.Vector3
  isNight: boolean
}

const tmpA = new THREE.Color()
const tmpB = new THREE.Color()
const mix = (a: string, b: string, t: number) => tmpA.set(a).clone().lerp(tmpB.set(b), t)

export function skyAt(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24
  let i = 0
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++
  const [h0, a] = KEYS[i]
  const [h1, b] = KEYS[i + 1]
  const raw = h1 > h0 ? (h - h0) / (h1 - h0) : 0
  const t = raw * raw * (3 - 2 * raw)
  const num = (k: keyof SkyKey) => (a[k] as number) + ((b[k] as number) - (a[k] as number)) * t

  const day = clamp01((h - 6) / 14)
  const isNight = h < 5.6 || h > 21
  const lightDir = new THREE.Vector3()
  if (isNight) {
    lightDir.set(Math.cos(0.9) * Math.cos(0.95), Math.sin(0.95), Math.sin(0.9) * Math.cos(0.95))
  } else {
    const az = -1.05 + day * 3.5
    const el = 0.28 + Math.sin(Math.PI * day) * 0.85
    lightDir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el))
  }
  return {
    hour: h,
    top: mix(a.top, b.top, t),
    mid: mix(a.mid, b.mid, t),
    bottom: mix(a.bottom, b.bottom, t),
    fog: mix(a.fog, b.fog, t),
    sun: mix(a.sun, b.sun, t),
    sunI: num('sunI'),
    hemiSky: mix(a.hemiSky, b.hemiSky, t),
    hemiGround: mix(a.hemiGround, b.hemiGround, t),
    hemiI: num('hemiI'),
    glow: num('glow'),
    fireflies: num('fireflies'),
    stars: num('stars'),
    lightDir: lightDir.normalize(),
    isNight,
  }
}

/** Where the painted sun sits in the backdrop, in viewport percentages. */
export function sunPlacement(hour: number) {
  const day = clamp01((hour - 5.8) / 14.6)
  const visible = clamp01(Math.min((hour - 5.6) / 0.8, (21 - hour) / 0.8))
  return { x: 82 - day * 64, y: 32 - Math.sin(Math.PI * day) * 22, opacity: visible }
}

/** Writes the sky into CSS variables for the painted backdrop behind the canvas. */
export function applySkyCss(sky: SkyState) {
  const root = document.documentElement.style
  const hex = (c: THREE.Color) => `#${c.getHexString(THREE.SRGBColorSpace)}`
  const sun = sunPlacement(sky.hour)
  root.setProperty('--sky-top', hex(sky.top))
  root.setProperty('--sky-mid', hex(sky.mid))
  root.setProperty('--sky-bottom', hex(sky.bottom))
  root.setProperty('--sun-color', hex(sky.sun))
  root.setProperty('--sun-x', `${sun.x.toFixed(2)}vw`)
  root.setProperty('--sun-y', `${sun.y.toFixed(2)}vh`)
  root.setProperty('--sun-o', sun.opacity.toFixed(2))
  root.setProperty('--night', sky.stars.toFixed(2))
}
