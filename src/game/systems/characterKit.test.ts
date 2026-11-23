import { describe, expect, it } from 'vitest'
import { indices, morningStamp, nextMorning, notAfter, pickTap, SAYS_MS, saidFrom, speaking } from './characterKit'

// Tests run with TZ=UTC (npm test), so local times below are written with the local constructors and read the same.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b)

/** A small seeded generator (mulberry32), for runs of many taps. */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Taps `n` times through `pickTap`, carrying the heard list along. */
function tapN(pool: readonly number[], n: number, rand: () => number) {
  let heard: number[] = []
  let said: { index: number } | null = null
  const picked: number[] = []
  for (let i = 0; i < n; i++) {
    const r = pickTap(pool, heard, said, rand)
    picked.push(r.index)
    heard = r.heard
    said = { index: r.index }
  }
  return { picked, heard }
}

describe('picking a tap line', () => {
  const POOL = [0, 1, 2, 3, 4, 5, 6, 7]
  const SEEDS = [1, 7, 2026]

  it('never picks a line already heard in the round, and picks uniformly among the rest in pool order', () => {
    const heard = [0, 2, 3, 5, 7]
    for (const roll of [0, 0.1, 0.25, 0.5, 0.74, 0.9999, 1]) expect([1, 4, 6], `roll ${roll}`).toContain(pickTap(POOL, heard, null, () => roll).index)
    // Five left: 3 to 7.
    expect([0, 0.2, 0.5, 0.7, 0.9999].map((roll) => pickTap(POOL, [0, 1, 2], null, () => roll).index)).toEqual([3, 4, 5, 6, 7])
    expect(pickTap(POOL, [4, 1], { index: 1 }, () => 0)).toEqual({ index: 0, heard: [4, 1, 0] })
  })

  it('works through the whole pool before repeating, then starts a new round with only the new line heard', () => {
    for (const seed of SEEDS) {
      const first = tapN(POOL, POOL.length, seeded(seed))
      expect(sorted(first.picked), `seed ${seed}`).toEqual(POOL)
      expect(sorted(first.heard), `seed ${seed}`).toEqual(POOL)
      const r = pickTap(POOL, first.heard, { index: first.picked[first.picked.length - 1] }, seeded(seed + 1))
      expect(POOL).toContain(r.index)
      expect(r.heard).toEqual([r.index])
    }
  })

  it('never begins a new round on the line just said, through cycle after cycle', () => {
    for (const [position, last] of POOL.entries()) {
      for (const roll of [position / POOL.length, (position + 0.5) / POOL.length, (position + 0.999) / POOL.length]) {
        const r = pickTap(POOL, [...POOL], { index: last }, () => roll)
        expect(r.index, `${last} just said, roll ${roll}`).not.toBe(last)
        expect(POOL).toContain(r.index)
        expect(r.heard).toEqual([r.index])
      }
    }
    for (const seed of SEEDS) {
      const { picked } = tapN(POOL, 100, seeded(seed))
      expect(picked.flatMap((index, i) => (i > 0 && index === picked[i - 1] ? [i + 1] : [])), `seed ${seed}`).toEqual([])
    }
  })

  it('keeps returning the only line of a pool of one', () => {
    expect(pickTap([4], [], null, () => 0.5)).toEqual({ index: 4, heard: [4] })
    expect(pickTap([4], [4], { index: 4 }, () => 0.5)).toEqual({ index: 4, heard: [4] })
    expect(tapN([4], 5, seeded(3)).picked).toEqual([4, 4, 4, 4, 4])
  })

})

it('the speaking window is open for SAYS_MS after the line was said, and closed before and after', () => {
  const said = { at: 100_000 }
  expect(speaking(null, 100_000)).toBe(false)
  expect([100_000, 100_000 + SAYS_MS - 1].map((t) => speaking(said, t))).toEqual([true, true])
  // Closed at the end, and before he said it (the clock put back).
  expect([100_000 + SAYS_MS, 100_000 - 1].map((t) => speaking(said, t))).toEqual([false, false])
})

describe('the next morning', () => {
  it.each([
    [at(20, 5), undefined, at(20, 6)],
    [at(20, 6), undefined, at(21, 6)],
    [at(20, 9), undefined, at(21, 6)],
    [at(20, 17, 59), 18, at(20, 18)],
    [at(20, 18), 18, at(21, 18)],
    [at(20, 23, 59), 18, at(21, 18)],
    [at(20, 0), 18, at(20, 18)],
  ])('from %i with hour %s is %i', (from, hour, next) => expect(nextMorning(from, hour)).toBe(next))

  it('is the next local 18:00 (and 06:00) across a daylight-saving change in London', () => {
    const tz = process.env.TZ
    process.env.TZ = 'Europe/London'
    try {
      const local = (m: number, d: number, h: number, min = 0) => new Date(2026, m, d, h, min).getTime()
      // Clocks go back at 02:00 on Sunday 25 October 2026 (25 hours long), forward at 01:00 on Sunday 29 March (23 hours long).
      expect(nextMorning(local(9, 24, 18), 18)).toBe(Date.UTC(2026, 9, 25, 18))
      expect(nextMorning(local(2, 28, 18), 18)).toBe(Date.UTC(2026, 2, 29, 17))
      for (const [from, to] of [
        [local(9, 24, 18), local(9, 25, 18)],
        [local(9, 25, 17, 59), local(9, 25, 18)],
        [local(9, 25, 18), local(9, 26, 18)],
        [local(9, 25, 0, 30), local(9, 25, 18)],
        [local(2, 28, 18), local(2, 29, 18)],
        [local(2, 29, 17, 59), local(2, 29, 18)],
      ]) expect(nextMorning(from, 18)).toBe(to)
      expect(nextMorning(local(9, 24, 6))).toBe(local(9, 25, 6))
      expect(nextMorning(local(2, 28, 6))).toBe(local(2, 29, 6))
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })
})

describe('the morning a thing is stamped', () => {
  // Never before it was due; before that day's hour it is the moment found, then the due time that morning, then that day's hour.
  it.each([
    ['found before 06:00 that day', at(20, 6) - 1000, at(20, 3), undefined, at(20, 3)],
    ['found before 06:00, due the day before', at(19, 6), at(20, 5, 59), undefined, at(20, 5, 59)],
    ['found at the due time', at(20, 6), at(20, 6), undefined, at(20, 6)],
    ['found later that morning', at(20, 6), at(20, 9), undefined, at(20, 6)],
    ['found late that day', at(20, 6), at(20, 23, 59), undefined, at(20, 6)],
    ['found days later', at(20, 6), at(23, 9), undefined, at(23, 6)],
    ['found at 06:00 days later', at(20, 6), at(23, 6), undefined, at(23, 6)],
    ['due this afternoon, found this evening', at(20, 14), at(20, 15), undefined, at(20, 14)],
    ['found the moment it was due in the afternoon', at(20, 14), at(20, 14), undefined, at(20, 14)],
    ['evening hour: found before it was due', at(20, 18), at(20, 17), 18, at(20, 17)],
    ['evening hour: found when due', at(20, 18), at(20, 18), 18, at(20, 18)],
    ['evening hour: found later that evening', at(20, 18), at(20, 21), 18, at(20, 18)],
    ['evening hour: found days later in the evening', at(20, 18), at(23, 21), 18, at(23, 18)],
    ['evening hour: found days later before 18:00', at(20, 18), at(23, 12), 18, at(23, 12)],
  ])('%s', (_, due, found, hour, expected) => expect(morningStamp(due, found, hour)).toBe(expected))
})

describe('repairing a saved character', () => {
  const NOW = 1_000_000

  it.each([[null, null], [NOW - 5, NOW - 5], [NOW, NOW], [NOW + 5, NOW]])('keeps a time that is not after now, and puts back one that is: %s', (time, kept) => expect(notAfter(time, NOW)).toBe(kept))

  it.each<[unknown, number, unknown]>([
    [[3, 1, 3, 0, 1], 5, [3, 1, 0]],
    [[0, 4, 5, 6], 5, [0, 4]],
    [[], 5, []],
    [[-1, 1.5, '2', null, undefined, NaN, Infinity, {}, [], true, 2], 5, [2]],
    [[0, 1], 0, []],
    ...[undefined, null, 'abc', 4, true, { 0: 1, length: 1 }].map((raw) => [raw, 5, []] as [unknown, number, unknown]),
  ])('keeps the indices into a list of that length, each once, in order, and drops the rest: %j', (raw, length, kept) => expect(indices(raw, length)).toEqual(kept))

  it.each<[unknown, number, unknown]>([
    [{ index: 2, at: NOW - 10 }, 5, { index: 2, at: NOW - 10 }],
    [{ index: 4, at: NOW + 99 }, 5, { index: 4, at: NOW }], // a clock that ran ahead is put back
    [{ index: 5, at: NOW }, 5, null],
    [{ index: -1, at: NOW }, 5, null],
    [{ index: 1.5, at: NOW }, 5, null],
    [{ index: '1', at: NOW }, 5, null],
    [{ index: 1 }, 5, null],
    [{ index: 1, at: 'soon' }, 5, null],
    [{ index: 1, at: 0 }, 5, null],
    [{ index: 0, at: NOW }, 0, null],
    ...[undefined, null, 'abc', 7, [1, 2]].map((raw) => [raw, 5, null] as [unknown, number, unknown]),
  ])('repairs a saved line, or drops it when not whole: %j', (raw, length, kept) => expect(saidFrom(raw, length, NOW)).toEqual(kept))
})
