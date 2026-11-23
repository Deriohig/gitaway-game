import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { duckAt } from './ducks'
import { CHICKEN_YARDS } from './layout'
import { rng } from './random'
import { farmPatch, HOP_SECONDS, hopWalker, nextSpot, pausableTime, startWalker, stepWalker, type Patch, type Walker } from './wander'

// A frame of an animal's amble, as plain functions. Quiet mode stands the wanderers still: no walking, turning or
// pecking, heads come back up, and the ducks stop paddling; a click still makes an animal hop.

const FRAME = 1 / 30
const HEN = { speed: 0.32, idle: [1.5, 5] as const }
const yard = (): Patch => farmPatch(CHICKEN_YARDS[0].center, CHICKEN_YARDS[0].radius)
const OPEN: Patch = { center: [0, 0], radius: 2 }
const step = (w: Walker, rand: () => number, wandering: boolean, patch = yard(), dt = FRAME) => stepWalker(w, dt, { ...patch, ...HEN, rand, wandering })

/** A hen of the given seed `frames` frames into her amble, wandering as usual. */
function henAfter(seed: number, frames: number): { w: Walker; rand: () => number } {
  const rand = rng(seed)
  const w = startWalker(yard(), rand)
  for (let i = 0; i < frames; i++) step(w, rand, true)
  return { w, rand }
}

/** Steps a walker standing still (quiet mode) for `frames` frames; returns each frame's stride. */
const standStill = (w: Walker, rand: () => number, frames: number, patch = yard()) => Array.from({ length: frames }, () => step(w, rand, false, patch))

describe('a wanderer standing still (quiet mode)', () => {
  it('neither walks nor turns, wherever it was in its amble', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const frames of [0, 40, 130, 400]) {
        const { w, rand } = henAfter(seed, frames)
        const snapshot = () => ({ pos: [...w.pos], heading: w.heading, wait: w.wait, target: [...w.target] })
        const before = snapshot()
        const strides = standStill(w, rand, 300)
        expect(snapshot()).toEqual(before)
        expect(strides.every((s) => !s.walking && s.lift === 0)).toBe(true)
      }
    }
  })

  it('stops a walk part-way, and lifts its head from pecking or grazing and keeps it up', () => {
    const rand = rng(7)
    const walking: Walker = { pos: [0, 0], target: [1.5, 0], wait: 0, heading: Math.PI / 2, hop: -1, peck: 0 }
    standStill(walking, rand, 300, OPEN)
    expect(walking.pos).toEqual([0, 0])
    step(walking, rand, true, OPEN)
    expect(walking.pos[0]).toBeGreaterThan(0)

    const pecking: Walker = { pos: [0, 0], target: [0, 0], wait: 2, heading: 0, hop: -1, peck: 0.5 }
    expect(step(pecking, rand, true, OPEN).headDown).toBe(true) // standing, at a moment of its nod when the head is down
    expect(standStill(pecking, rand, 200, OPEN).every((s) => !s.headDown)).toBe(true)
  })

  it('finishes a hop it is in', () => {
    const { w, rand } = henAfter(2, 60)
    hopWalker(w)
    step(w, rand, true)
    const strides = standStill(w, rand, Math.ceil(HOP_SECONDS / FRAME) + 2)
    expect(strides[0].lift).toBeGreaterThan(0)
    expect(w.hop).toBe(-1)
    expect(strides.at(-1)!.lift).toBe(0)
  })

  it('still hops when clicked, once at a time, and lands where it stood', () => {
    const { w, rand } = henAfter(4, 90)
    standStill(w, rand, 5)
    const at = [...w.pos]
    hopWalker(w)
    const first = standStill(w, rand, 3)
    hopWalker(w) // a second click mid-hop doesn't start it again
    expect(w.hop).toBeGreaterThan(0)
    const rest = standStill(w, rand, Math.ceil(HOP_SECONDS / FRAME))
    expect(Math.max(...[...first, ...rest].map((s) => s.lift))).toBeCloseTo(0.22, 2)
    expect(w.hop).toBe(-1)
    expect(w.pos).toEqual(at)
  })
})

describe('the ducks standing still (quiet mode)', () => {
  it('stop where they are on the pond, and paddle on from there afterwards', () => {
    const clock = { held: 0, stoppedAt: null as number | null }
    let elapsed = 0
    const frame = (running: boolean) => {
      elapsed += FRAME
      return pausableTime(clock, elapsed, running)
    }
    for (let i = 0; i < 90; i++) frame(true)
    const stoppedAt = frame(false)
    const held = Array.from({ length: 300 }, () => frame(false))
    expect(held.every((t) => t === stoppedAt)).toBe(true)
    for (const seed of [1, 2, 3]) expect(duckAt(seed, held.at(-1)!)).toEqual(duckAt(seed, stoppedAt))
    const resumed = frame(true) // no jump to the scene's time
    expect(resumed).toBeCloseTo(stoppedAt, 9)
    expect(elapsed - resumed).toBeCloseTo(301 * FRAME, 9)
    expect(frame(true) - resumed).toBeCloseTo(FRAME, 9)
  })

  it("keep the scene's own time while they never stop", () => {
    const clock = { held: 0, stoppedAt: null as number | null }
    for (const elapsed of [0, 0.016, 1.5, 3600.25]) expect(pausableTime(clock, elapsed, true)).toBe(elapsed)
  })
})

describe('a wanderer on the move (quiet mode off)', () => {
  /** How the amble ran before quiet mode, on a THREE.Vector2 per frame, as the reference. */
  function originalAmble(patch: Patch, seed: number) {
    const r = rng(seed)
    const pick = (from: THREE.Vector2 | null = null): THREE.Vector2 => new THREE.Vector2(...nextSpot(patch, r, from ? [from.x, from.y] : null))
    const pos = pick()
    const s = { r, pick, pos, target: pick(pos), wait: r() * 3, heading: r() * Math.PI * 2, hop: -1, peck: 0 }
    const stepOld = (dt: number) => {
      if (s.wait > 0) {
        s.wait -= dt
        s.peck += dt
        if (s.wait <= 0) s.target = s.pick(s.pos)
      } else {
        const to = s.target.clone().sub(s.pos)
        const dist = to.length()
        if (dist < 0.05) {
          s.wait = HEN.idle[0] + s.r() * (HEN.idle[1] - HEN.idle[0])
          s.peck = 0
        } else {
          const want = Math.atan2(to.x, to.y)
          let diff = want - s.heading
          diff = Math.atan2(Math.sin(diff), Math.cos(diff))
          s.heading += diff * Math.min(1, dt * 3)
          if (Math.abs(diff) < 0.6) s.pos.addScaledVector(to.normalize(), Math.min(dist, HEN.speed * dt))
        }
      }
      let lift = 0
      if (s.hop >= 0) {
        s.hop += dt
        lift = Math.sin(Math.min(1, s.hop / 0.45) * Math.PI) * 0.22
        if (s.hop > 0.45) s.hop = -1
      }
      const walking = s.wait <= 0
      return { lift, walking, headDown: !walking && Math.sin(s.peck * 2.2) > 0.55 }
    }
    return { s, step: stepOld, hop: () => void (s.hop < 0 && (s.hop = 0)) }
  }

  it('ambles exactly as it always has, frame by frame, hops and all', () => {
    for (const [patch, seed] of [[yard(), 1], [yard(), 5], [OPEN, 2], [{ center: [3, -1], radius: 1.2 } as Patch, 9]] as const) {
      const old = originalAmble(patch, seed)
      const rand = rng(seed)
      const w = startWalker(patch, rand)
      const jitter = rng(seed + 100)
      for (let i = 0; i < 2000; i++) {
        const dt = Math.min(0.1, 0.01 + jitter() * 0.06) // frames of uneven length, capped at a tenth of a second
        if (i % 700 === 350) {
          old.hop()
          hopWalker(w)
        }
        expect(step(w, rand, true, patch, dt)).toEqual(old.step(dt))
        expect([w.pos[0], w.pos[1], w.heading, w.wait, w.hop, w.peck]).toEqual([old.s.pos.x, old.s.pos.y, old.s.heading, old.s.wait, old.s.hop, old.s.peck])
      }
    }
  })
})
