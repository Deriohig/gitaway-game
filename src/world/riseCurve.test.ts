import { describe, expect, it } from 'vitest'
import { ISLES } from './layout'
import { CLOUD_SEA, RISE_PLANS, arrivalRing, breachCloud, bridgeLaid, riseDepth, riseDone, riseOffset, riseOpacity, type RisePlan } from './riseCurve'

const full = RISE_PLANS.full!
const calm = RISE_PLANS.calm!

/** The offsets over a rise, sampled at 60 fps. */
function samples(plan: RisePlan, depth: number) {
  const out: { t: number; y: number }[] = []
  for (let t = 0; t <= plan.seconds + 0.5; t += 1 / 60) out.push({ t, y: riseOffset(plan, depth, t) })
  return out
}

describe('an isle rising into place', () => {
  const depth = riseDepth(ISLES.meadow.pos[1])
  const mid = (CLOUD_SEA.bottom + CLOUD_SEA.top) / 2

  it('takes four to five seconds at full motion, bridge included, and starts with its top under the cloud sea, unseen', () => {
    expect(full.seconds + full.bridgeSeconds).toBeGreaterThanOrEqual(4)
    expect(full.seconds + full.bridgeSeconds).toBeLessThanOrEqual(5)
    for (const id of ['meadow', 'grove', 'islet'] as const) {
      const y = ISLES[id].pos[1]
      expect(y + riseOffset(full, riseDepth(y), 0)).toBeCloseTo(CLOUD_SEA.bottom, 9)
    }
    expect(riseOpacity(CLOUD_SEA.bottom)).toBe(0)
  })

  it('eases up, overshoots very slightly, and settles exactly in place', () => {
    const ys = samples(full, depth)
    const peak = ys.reduce((a, b) => (b.y > a.y ? b : a))
    expect(peak.y).toBeGreaterThan(0.1)
    expect(peak.y).toBeLessThanOrEqual(full.overshoot + 1e-9)
    for (let i = 1; i < ys.length; i++) {
      const [a, b] = [ys[i - 1], ys[i]]
      if (b.t <= peak.t) expect(b.y).toBeGreaterThanOrEqual(a.y)
      else expect(b.y).toBeLessThanOrEqual(a.y + 1e-12)
      expect(Math.abs(b.y - a.y)).toBeLessThan(0.3) // no jumps
    }
    expect(riseOffset(full, depth, full.seconds)).toBe(0)
    expect(riseOffset(full, depth, full.seconds + 10)).toBe(0)
    expect(riseOffset(full, depth, 0.1) + depth).toBeLessThan(0.1) // slow under the clouds at first
  })

  it('breaks through the cloud sea within the first couple of seconds, fading in on the way, and is solid long before it settles', () => {
    const through = samples(full, depth).find((s) => ISLES.meadow.pos[1] + s.y >= CLOUD_SEA.top)!
    expect(through.t).toBeGreaterThan(0.4)
    expect(through.t).toBeLessThan(2)
    expect(riseOpacity(CLOUD_SEA.bottom - 3)).toBe(0)
    expect(riseOpacity(mid)).toBeGreaterThan(0)
    expect(riseOpacity(mid)).toBeLessThan(1)
    expect(riseOpacity(ISLES.meadow.pos[1] + riseOffset(full, depth, 0.7 * full.seconds))).toBe(1)
  })

  it('lays the bridge only once the isle has settled', () => {
    expect(bridgeLaid(full, 0)).toBe(0)
    expect(bridgeLaid(full, full.seconds - 0.01)).toBe(0)
    expect(bridgeLaid(full, full.seconds + full.bridgeSeconds / 2)).toBeCloseTo(0.5)
    expect(bridgeLaid(full, full.seconds + full.bridgeSeconds)).toBe(1)
    expect(riseDone(full, full.seconds)).toBe(false)
    expect(riseDone(full, full.seconds + full.bridgeSeconds)).toBe(true)
  })

  it('billows cloud where it breaks through, and rings its base as it arrives, then clears', () => {
    expect(breachCloud(full, 0.6)?.opacity).toBeGreaterThan(0.5)
    expect(breachCloud(full, full.seconds)).toBeNull()
    expect(arrivalRing(full, 0.85 * full.seconds)?.opacity).toBeGreaterThan(0.3)
    expect(arrivalRing(full, 0.3 * full.seconds)).toBeNull()
    for (let t = full.seconds + full.bridgeSeconds; t < 10; t += 0.25) {
      expect(breachCloud(full, t)).toBeNull()
      expect(arrivalRing(full, t)).toBeNull()
    }
  })
})

describe('motion levels', () => {
  it('calm is slower and simpler: no overshoot, no clouds, the bridge at once; still has no rise at all', () => {
    expect(calm.seconds).toBeGreaterThan(full.seconds)
    expect(Math.max(...samples(calm, riseDepth(ISLES.grove.pos[1])).map((s) => s.y))).toBe(0)
    expect(calm.puffs).toBe(false)
    for (let t = 0; t < calm.seconds; t += 0.1) {
      expect(breachCloud(calm, t)).toBeNull()
      expect(arrivalRing(calm, t)).toBeNull()
    }
    expect(bridgeLaid(calm, calm.seconds)).toBe(1)
    expect(riseDone(calm, calm.seconds)).toBe(true)
    expect(RISE_PLANS.still).toBeNull()
  })
})
