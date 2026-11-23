import { afterEach, describe, expect, it } from 'vitest'
import { localDateKey } from '../../../game/state'
import { byDay, dayLabel, letterDay, noonOf } from './days'

// Tests run in UTC but days follow the player's clock, so these move it to a zone of their choosing.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env
const ZONE = env.TZ
afterEach(() => {
  if (ZONE === undefined) delete env.TZ
  else env.TZ = ZONE
})

type When = [y: number, month: number, d: number, h: number, min?: number]
/** A local time, read in the current zone. */
const at = (...[y, month, d, h, min = 0]: When) => new Date(y, month - 1, d, h, min).getTime()

const LON = 'Europe/London'
const LA = 'America/Los_Angeles'

describe('day labels', () => {
  it.each<[string, string, When, When, string]>([
    ['turn over at local midnight', LON, [2026, 10, 19, 23, 59], [2026, 10, 19, 23, 59], 'Today'],
    ['turn over at local midnight', LON, [2026, 10, 19, 23, 59], [2026, 10, 20, 0, 1], 'Yesterday'],
    ['turn over at local midnight', LON, [2026, 10, 20, 0, 0], [2026, 10, 20, 0, 1], 'Today'],
    ['turn over at local midnight', LON, [2026, 10, 18, 23, 59], [2026, 10, 20, 0, 1], 'Sunday 18 October'],
    ['follow the local date, not UTC (20:00 on the 19th in LA is the 20th in UTC)', LA, [2026, 10, 19, 6], [2026, 10, 19, 20], 'Today'],
    ['follow the local date, not UTC (20:00 on the 19th in LA is the 20th in UTC)', LA, [2026, 10, 18, 21], [2026, 10, 19, 20], 'Yesterday'],
    ['follow the local date, not UTC (00:30 on the 20th in Auckland is the 19th in UTC)', 'Pacific/Auckland', [2026, 10, 19, 23, 30], [2026, 10, 20, 0, 30], 'Yesterday'],
    ['count a day as a day when the clocks go back (25-hour day)', LON, [2026, 10, 25, 0, 30], [2026, 10, 25, 23, 30], 'Today'],
    ['count a day as a day when the clocks go back (25-hour day)', LON, [2026, 10, 24, 12], [2026, 10, 25, 23, 30], 'Yesterday'],
    ['count a day as a day when the clocks go back (25-hour day)', LON, [2026, 10, 23, 12], [2026, 10, 25, 23, 30], 'Friday 23 October'],
    ['count a day as a day when the clocks go forward (23-hour day)', LON, [2026, 3, 29, 0, 30], [2026, 3, 30, 0, 30], 'Yesterday'],
    ['count a day as a day when the clocks go forward (23-hour day)', LON, [2026, 3, 28, 23, 30], [2026, 3, 30, 0, 30], 'Saturday 28 March'],
  ])('%s', (_, zone, moment, now, expected) => {
    env.TZ = zone
    expect(dayLabel(localDateKey(at(...moment)), at(...now))).toBe(expected)
  })

  it('give the year only for another year', () => {
    env.TZ = LON
    expect(dayLabel('2026-01-01', at(2026, 1, 2, 9))).toBe('Yesterday')
    expect(dayLabel('2025-12-30', at(2026, 1, 2, 9))).toBe('Tuesday, 30 December 2025')
    expect(dayLabel('2026-10-16', at(2026, 10, 19, 9))).toBe('Friday 16 October')
  })

  it('are the same from any time on a day as from its noon', () => {
    env.TZ = LON
    for (const now of [at(2026, 10, 25, 0, 5), at(2026, 10, 25, 23, 55), at(2026, 3, 29, 0, 30), at(2026, 3, 29, 23, 30)]) {
      for (const date of ['2026-03-27', '2026-03-28', '2026-03-29', '2026-10-24', '2026-10-25']) {
        expect(dayLabel(date, noonOf(localDateKey(now)))).toBe(dayLabel(date, now))
      }
    }
  })
})

describe('when a letter came', () => {
  it.each<[string, string, When, When, string]>([
    ['Today', LON, [2026, 10, 25, 8], [2026, 10, 25, 9], 'Today'],
    ['Yesterday', LON, [2026, 10, 24, 8], [2026, 10, 25, 9], 'Yesterday'],
    ['Yesterday just after midnight', LON, [2026, 10, 24, 0, 5], [2026, 10, 25, 9], 'Yesterday'],
    ['the date with no weekday', LON, [2026, 10, 23, 23, 55], [2026, 10, 25, 9], '23 October'],
    ['no year across New Year', LON, [2025, 12, 30, 8], [2026, 1, 2, 9], '30 December'],
    ['Today by the local date', LA, [2026, 10, 19, 8], [2026, 10, 19, 20], 'Today'],
    ['the local date, not UTC', LA, [2026, 10, 17, 20], [2026, 10, 19, 20], '17 October'],
  ])('is %s', (_, zone, moment, now, expected) => {
    env.TZ = zone
    expect(letterDay(at(...moment), at(...now))).toBe(expected)
  })
})

describe('days', () => {
  it('group a newest-first list by local day, in order', () => {
    env.TZ = LON
    const entry = (id: number, when: number) => ({ id, at: when, kind: 'work' as const, title: `line ${id}` })
    const lines = [entry(4, at(2026, 10, 20, 0, 1)), entry(3, at(2026, 10, 19, 23, 59)), entry(2, at(2026, 10, 19, 8)), entry(1, at(2026, 10, 17, 9))]
    expect(byDay(lines).map(([date, entries]) => [date, entries.map((e) => e.id)])).toEqual([
      ['2026-10-20', [4]],
      ['2026-10-19', [3, 2]],
      ['2026-10-17', [1]],
    ])
  })
})
