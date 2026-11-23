import { afterEach, describe, expect, it, vi } from 'vitest'
import { CROPS, MINUTE } from './config'
import { advance, STEPS } from './advance'
import { BARNABY, type LandPiece } from './content/barnaby'
import { HISTORY_DAYS } from './core'
import { endSession, harvestAll, logTask, plant, plantAll, startSession } from './engine'
import { createInitialState, type GameState } from './state'
import { ALL_OFF, longJournalFarm, withFeatures } from './testing'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0) // 09:00 UTC (tests run with TZ=UTC)
const HOUR = 3_600_000
const DAY = 86_400_000
const fresh = () => createInitialState(T0)

describe('advance', () => {
  it('reports no change on an idle second, and hands back the same state', () => {
    const s = fresh()
    const r = advance(s, T0 + 1000)
    expect([r.ok, r.notices]).toEqual([false, []])
    expect(r.state).toBe(s)
  })

  it('runs every part of the game in the order of the spec', () => {
    expect(STEPS.map(([name]) => name)).toEqual([
      'day', 'crops', 'yields', 'workshop', 'visitors', 'fishing', 'restoration', 'gitEvents', 'mail', 'cottage', 'studio', 'stamps', 'characters', 'journal',
    ])
  })

  describe('on a farm with a long journal', () => {
    // structuredClone is what `clone` copies the state with.
    const clones = () => vi.spyOn(globalThis, 'structuredClone')
    afterEach(() => vi.restoreAllMocks())

    /** Barnaby settled long ago, and this morning's 08:00 post brought a letter. */
    const withLetter = (s: GameState, post: number) => {
      const pieces = (Object.keys(BARNABY.land) as LandPiece[]).filter((piece) => s.owned[piece] > 0)
      s.characters.barnaby = { ...s.characters.barnaby, stage: 'camp', dueAt: T0 - 10 * DAY, foundAt: T0 - 10 * DAY, sawLand: pieces }
      s.mail = { letters: [{ id: 'cloud-sea', at: post, read: false }], checkedAt: post }
    }

    it('copies nothing on an idle second', () => {
      const s = longJournalFarm()
      expect(s.journal.length).toBeGreaterThanOrEqual(2400)
      const spy = clones()
      const r = advance(s, T0 + 1000)
      expect(r.ok).toBe(false)
      expect(r.state).toBe(s)
      expect(spy).not.toHaveBeenCalled()
    })

    it('copies nothing on an idle second with letters on and a letter just come', () => {
      const s = longJournalFarm()
      withLetter(s, T0 - HOUR)
      const spy = clones()
      withFeatures({ letters: true }, () => expect(advance(s, T0 + 1000).ok).toBe(false))
      expect(spy).not.toHaveBeenCalled()
    })

    it('copies nothing on an idle second with the hare greeted and Síofra waiting for her morning, and copies once when it comes', () => {
      const s = longJournalFarm()
      // Everything she waits for holds: the meadow, the hare's hello, and Barnaby settled in his camp long ago.
      s.owned.meadow = 1
      s.visitors.seen = { hare: 1 }
      withLetter(s, T0 - HOUR)
      // Her morning is set for tomorrow's 06:00, and last evening's 18:00 post has been seen to: no moment is due either.
      const morning = Date.UTC(2026, 9, 18, 6)
      s.characters.siofra = { ...s.characters.siofra, dueAt: morning, checkedAt: Date.UTC(2026, 9, 16, 18) }
      const spy = clones()
      withFeatures({ letters: true, characters: true }, () => {
        const r = advance(s, T0 + 1000)
        expect(r.ok).toBe(false)
      expect(r.state).toBe(s)
        expect(spy).not.toHaveBeenCalled()
        // The control: the same farm, at her morning, is due, and copies once.
        const met = advance(s, morning)
        expect(met.ok).toBe(true)
        expect(met.state.characters.siofra.metAt).toBe(morning)
        expect(spy).toHaveBeenCalledTimes(1)
      })
    })

    it('copies once when something is due, and still leaves the original alone', () => {
      const s = longJournalFarm()
      for (const p of s.plots) p.readyAt = T0
      const before = JSON.stringify(s)
      const spy = clones()
      const r = advance(s, T0 + 1000)
      expect(r.ok).toBe(true)
      expect(r.notices.map((n) => n.title)).toEqual(['Your pumpkins are ready'])
      expect(spy).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(s)).toBe(before)
    })

    it('copies once on a new day, and once for a story line due with a switch turned on', () => {
      // Grown with every switch off, so turning one on has a story line to tell.
      const s = withFeatures(ALL_OFF, () => longJournalFarm())
      const spy = clones()
      expect(advance(s, T0 + DAY).ok).toBe(true)
      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockClear()
      withFeatures({ ...ALL_OFF, visitors: true }, () => expect(advance(s, T0 + 1000).ok).toBe(true))
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })
})

describe('crop readiness', () => {
  it('announces ripe crops once, and waits until a crop is actually ripe', () => {
    const planted = plant(fresh(), 0, 'radish', T0).state
    const later = T0 + CROPS.radish.growMinutes * MINUTE
    expect(advance(planted, later - 1).ok).toBe(false)
    const first = advance(planted, later)
    expect(first.ok).toBe(true)
    expect(first.notices).toEqual([{ kind: 'crop', title: 'Your radish is ready', detail: 'Harvest whenever you like. They will wait.', entry: { title: 'Your radish is ready' } }])
    expect(first.state.plots[0].notified).toBe(true)
    expect(advance(first.state, later + MINUTE).ok).toBe(false)
  })

  describe('after a closed ten-hour gap', () => {
    // Planted at T0, when the player was last here, and back ten hours later.
    const back = (s: GameState, title: string) => advance(s, T0 + 10 * HOUR).state.journal.find((e) => e.title === title)

    it.each([
      ['a ripe crop down when it ripened, not when the player came back', ['radish'], 'Your radish is ready', CROPS.radish.growMinutes],
      ['crops that ripened at different times down together, when the last of them ripened', ['radish', 'carrot'], '2 crops are ready', CROPS.carrot.growMinutes],
    ] as const)('writes %s', (_, crops, title, minutes) => {
      const s = crops.reduce((acc, crop, i) => plant(acc, i, crop, T0).state, fresh())
      expect(back(s, title)?.at).toBe(T0 + minutes * MINUTE)
    })
  })
})

describe('days', () => {
  it('keeps the finished day in history when a new day starts', () => {
    let s = endSession(startSession(fresh(), T0).state, T0 + 45 * MINUTE).state
    s = logTask(s, 'ship it', T0 + 46 * MINUTE).state
    s = harvestAll(plantAll(s, 'radish', T0).state, T0 + 50 * MINUTE).state
    const next = advance(s, T0 + DAY)
    expect(next.ok).toBe(true)
    expect(next.state.daily).toEqual({ date: '2026-10-18', sessionMinutes: 0, tasks: [], commits: 0, harvests: 0 })
    expect(next.state.history).toEqual([{ date: '2026-10-17', minutes: 45, tasks: 1, commits: 0, harvests: 4 }])
  })

  it('keeps the last 14 days, newest first', () => {
    let s: GameState = fresh()
    for (let d = 1; d <= 20; d++) s = advance(s, T0 + d * DAY).state
    expect(s.history).toHaveLength(HISTORY_DAYS)
    expect([s.history[0].date, s.history[HISTORY_DAYS - 1].date]).toEqual(['2026-11-05', '2026-10-23'])
  })
})

it('a month away loses nothing: coins, wood, XP, seeds, buildings and crops stay, ripe crops wait', () => {
  let s = plantAll({ ...fresh(), coins: 500, wood: 40 }, 'carrot', T0).state
  s = endSession(startSession(s, T0).state, T0 + 90 * MINUTE).state
  const away = advance(s, T0 + 30 * DAY).state
  for (const key of ['coins', 'wood', 'xp', 'seeds', 'owned', 'gifts', 'stats', 'recent'] as const) expect(away[key]).toEqual(s[key])
  expect(away.plots.map((p) => p.crop)).toEqual(s.plots.map((p) => p.crop))
  expect(away.plots.filter((p) => p.crop).every((p) => p.notified)).toBe(true)
  expect(away.journal.length).toBeGreaterThanOrEqual(s.journal.length)
})
