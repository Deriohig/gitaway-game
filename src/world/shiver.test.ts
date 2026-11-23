import { describe, expect, it } from 'vitest'
import { gustStart, gustStillFresh, shiverEnvelope } from './ShiverDriver'

// When work is done, a gust rolls out from the farmhouse through the grass and the trees: big after a work session,
// small after a task or a commit.

describe('the shiver’s gust', () => {
  it('starts at its peak at the farmhouse, fades as it rolls out 14 u a second, and has died away after 2 s when big', () => {
    expect(shiverEnvelope('big', 0)).toEqual({ strength: 1.6, radius: 0 })
    const { strength, radius } = shiverEnvelope('big', 1.0)
    expect(strength).toBeCloseTo(0.8)
    expect(radius).toBeCloseTo(14)
    expect(shiverEnvelope('big', 2.0).strength).toBe(0)
    expect(shiverEnvelope('big', 3.5).strength).toBe(0)
  })

  it('is half as strong for half as long when small', () => {
    const { strength, radius } = shiverEnvelope('small', 0.5)
    expect(strength).toBeCloseTo(0.4)
    expect(radius).toBeCloseTo(7)
    expect(shiverEnvelope('small', 1.0).strength).toBe(0)
  })
})

describe('when a shiver sets the world moving', () => {
  const NOW = Date.UTC(2026, 9, 19, 9)
  const small = (age: number) => ({ at: NOW - age, size: 'small' as const })

  it.each([
    ['a new shiver a second old starts a gust from when it came', null, small(1000), NOW - 1000],
    ['the same shiver again starts nothing', NOW - 1000, small(1000), null],
    ['a shiver read from a save, 10 s old, starts nothing', null, { at: NOW - 10_000, size: 'big' as const }, null],
    ['no shiver yet starts nothing', null, null, null],
    ['a shiver 3 s old is fresh', null, small(3000), NOW - 3000],
    ['a shiver older than 3 s is not', null, small(3001), null],
  ])('%s', (_, last, shiver, start) => {
    expect(gustStart(last, shiver, NOW)).toBe(start)
  })

  it('drops a gust whose first frame comes over 3 s after its shiver, as one queued while the window was hidden', () => {
    expect(gustStillFresh(NOW - 30, NOW)).toBe(true)
    expect(gustStillFresh(NOW - 3000, NOW)).toBe(true)
    expect(gustStillFresh(NOW - 3001, NOW)).toBe(false)
    expect(gustStillFresh(NOW - 2 * 3_600_000, NOW)).toBe(false)
  })

  it('starts a second shiver while one plays afresh, at its own peak rather than added to the first', () => {
    expect(shiverEnvelope('big', 0.5).strength).toBeCloseTo(1.2) // a big gust half a second in, still strong
    const start = gustStart(NOW - 500, { at: NOW, size: 'small' }, NOW)
    expect(start).toBe(NOW)
    expect(shiverEnvelope('small', (NOW - start!) / 1000).strength).toBe(0.8)
  })
})
