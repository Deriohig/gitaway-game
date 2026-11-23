import { describe, expect, it } from 'vitest'
import { hash01, hashPick } from './hash'

const SEED = 1_760_000_000_000

describe('hash01', () => {
  it('is stable, and keeps parts apart', () => {
    // Pinned values: changing the hash would reshuffle every visitor, fish and weather already seen.
    expect(hash01(SEED, 'visit', 0)).toBe(0.3472116633784026)
    expect(hash01('gitaway')).toBe(0.5985853322781622)
    expect(hash01(1, 23)).not.toBe(hash01(12, 3))
    expect(hash01('a', 'b')).not.toBe(hash01('b', 'a'))
  })

  it('stays in [0, 1) and spreads evenly', () => {
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 10_000; i++) {
      const v = hash01(SEED, 'roll', i)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
      buckets[Math.floor(v * 10)]++
    }
    expect(Math.min(...buckets)).toBeGreaterThan(900)
    expect(Math.max(...buckets)).toBeLessThan(1100)
  })

  it('picks from a list, or nothing from an empty one', () => {
    const items = ['radish', 'carrot', 'wheat']
    expect(items).toContain(hashPick(items, SEED, 'pick'))
    expect(hashPick(items, SEED, 'pick')).toBe(hashPick(items, SEED, 'pick'))
    expect(hashPick([], SEED)).toBeUndefined()
  })
})
