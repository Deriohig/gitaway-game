import { afterEach, describe, expect, it, vi } from 'vitest'
import { advance } from '../advance'
import { BUNDLE_IDS } from '../content/bundles'
import { SIOFRA, SIOFRA_NAME } from '../content/siofra'
import { VISITORS, type VisitorId } from '../content/visitors'
import { xpForLevel } from '../progression'
import type { Notice } from '../result'
import { clone } from '../result'
import { createInitialState, type GameState } from '../state'
import { ALL_OFF, ALL_ON, useFeatures, withFeatures, type Switches } from '../testing'
import {
  FIRST_VISITOR_STORY,
  PERIOD_MS,
  advanceVisitors,
  arrivalAt,
  availableVisitors,
  eligibleVisitors,
  hereNow,
  isEligible,
  keepsakeLine,
  noticeVisitor,
  ownName,
  pickVisitor,
  sanitizeVisitors,
  sayHelloLabel,
  visitorName,
  visitorsDue,
} from './visitors'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0) // 09:00 UTC (tests run with TZ=UTC)
const HOUR = 3_600_000
const DAY = 24 * HOUR

// Visitors are switched on for every test here; tests that need other features flip those too.
useFeatures({ visitors: true })
const on = <T,>(switches: Switches, fn: () => T) => withFeatures({ ...ALL_OFF, visitors: true, ...switches }, fn)

/** A level-4 farm, a month old, with whatever else the test needs. */
function farm(patch: Partial<GameState> = {}, owned: Partial<GameState['owned']> = {}): GameState {
  const s = createInitialState(T0 - 30 * DAY)
  s.xp = xpForLevel(4)
  s.levelSeen = 4
  Object.assign(s.owned, owned)
  return { ...s, ...patch }
}

/** A farm whose visitors started arriving at T0. */
const started = (owned: Partial<GameState['owned']> = {}) => {
  const s = farm({}, owned)
  s.visitors.since = T0
  return s
}

/** Runs the visitors step on a copy, like `advance` does. */
function step(s: GameState, now: number) {
  const next = clone(s)
  const out: Notice[] = []
  const changed = advanceVisitors(next, now, out)
  return { s: next, out, changed }
}

/** The meadow isle, where the hare lives. */
const MEADOW = { meadow: 1 }
const HARE_SPRIG = 'The brown hare left a clover sprig.'
/** A started farm with the hare waiting to be noticed. */
const hareHere = (s = started(MEADOW)): GameState => {
  s.visitors.present = [{ id: 'hare', arrivedAt: T0 }]
  return s
}

describe('when visitors start', () => {
  it('waits for level 4, then starts the schedule from that moment', () => {
    const before = step(farm({ xp: xpForLevel(4) - 1, levelSeen: 3 }), T0)
    expect(before.changed).toBe(false)
    expect(before.s.visitors.since).toBeNull()

    const now = step(farm(), T0)
    expect(now.changed).toBe(true)
    expect(now.s.visitors).toMatchObject({ since: T0, nextPeriod: 0 })
    // And through advance, on the first tick at level 4.
    const r = advance(farm(), T0)
    expect(r.ok).toBe(true)
    expect(r.state.visitors.since).toBe(T0)
  })
})

describe('the schedule', () => {
  it('brings the hare exactly when her period comes round, with a quiet journal line and no toast', () => {
    const s = started(MEADOW)
    const at = arrivalAt(s, 0)
    expect(step(s, at - 1).s.visitors.present).toEqual([])
    const r = step(s, at)
    expect(r.s.visitors.present).toEqual([{ id: 'hare', arrivedAt: at }])
    expect(r.s.visitors.nextPeriod).toBe(1)
    expect(r.out).toEqual([])
    expect(r.s.journal[0]).toMatchObject({ kind: 'visitor', title: VISITORS.hare.arrives })
    // Nothing more until the next period's arrival.
    expect(step(r.s, arrivalAt(s, 1) - 1).changed).toBe(false)
  })
})

describe('who comes', () => {
  it('only brings the hare once the meadow is claimed, and brings her back once she has been seen', () => {
    expect(eligibleVisitors(farm())).toEqual([])
    expect(isEligible(farm(), 'hare')).toBe(false)
    expect(eligibleVisitors(farm({}, MEADOW))).toEqual(['hare'])
    const s = started(MEADOW)
    s.visitors.seen = { hare: 2 }
    for (let k = 0; k < 20; k++) expect(pickVisitor(s, k)).toBe('hare')
  })
})

describe('when the clock was wrong', () => {
  it('picks up again within two periods after the clock read far ahead for a while', () => {
    let s = started(MEADOW)
    const real = arrivalAt(s, 2)
    s = step(s, real).s
    for (const p of s.visitors.present) s = noticeVisitor(s, p.id, real).state

    // One tick 400 days ahead, then the clock is put right.
    const ahead = step(s, real + 400 * DAY).s
    expect(ahead.visitors.nextPeriod).toBeGreaterThan(200)
    const back = step({ ...ahead, visitors: { ...ahead.visitors, present: [] } }, real + HOUR)
    expect(back.changed).toBe(true)
    const current = Math.floor((real + HOUR - T0) / PERIOD_MS)
    expect(back.s.visitors).toMatchObject({ since: T0, nextPeriod: current + 1, present: [] })
    // The next visitor comes in the next period, not months from now.
    expect(step(back.s, arrivalAt(s, current + 1)).s.visitors.present).toHaveLength(1)
  })
})

describe('whether anything is due', () => {
  afterEach(() => vi.restoreAllMocks())

  it('says so exactly when the step would change something', () => {
    const states: [string, GameState][] = [
      ['level 3', farm({ xp: xpForLevel(4) - 1, levelSeen: 3 })],
      ['level 4, not started', farm()],
      ['started in the future', { ...started(MEADOW), visitors: { since: T0 + 400 * DAY, nextPeriod: 0, present: [], seen: {} } }],
    ]
    for (const next of [0, 1, 2, 3, 4, 7, 40]) {
      const s = started(MEADOW)
      s.visitors.nextPeriod = next
      states.push([`next period ${next}`, s])
    }
    const times: number[] = []
    for (let t = T0 - DAY; t <= T0 + 8 * PERIOD_MS; t += 2 * HOUR) times.push(t)
    const s0 = started(MEADOW)
    for (let k = 0; k < 8; k++) times.push(arrivalAt(s0, k) - 1, arrivalAt(s0, k))

    for (const [name, s] of states) for (const t of times) expect(visitorsDue(s, t), `${name} at T0${t >= T0 ? '+' : ''}${(t - T0) / HOUR}h`).toBe(step(s, t).changed)
  })

  it('lets an idle second pass without copying the farm', () => {
    const s = advance(started(MEADOW), T0).state
    expect(arrivalAt(s, 0)).toBeGreaterThan(T0 + 1000)
    const copies = vi.spyOn(globalThis, 'structuredClone')
    expect(advance(s, T0 + 1000).ok).toBe(false)
    expect(copies).not.toHaveBeenCalled()
    expect(advance(s, arrivalAt(s, 0)).ok).toBe(true)
    expect(copies).toHaveBeenCalledTimes(1)
  })
})

/** A level-20 farm that owns everything any visitor needs, with every restoration done and visitors arriving from T0. */
function everything(): GameState {
  const s = farm({ xp: xpForLevel(20), levelSeen: 20 })
  for (const v of Object.values(VISITORS)) for (const n of v.needs) if (n.kind === 'owned') s.owned[n.item] = Math.max(s.owned[n.item] ?? 0, n.min)
  s.restoration.done = Object.fromEntries(BUNDLE_IDS.map((id) => [id, T0]))
  s.visitors.since = T0
  return s
}

/** Everyone who turns up over a good few months, saying hello to each as they come. */
function whoComes(): VisitorId[] {
  let s = everything()
  const met = new Set<VisitorId>()
  for (let k = 0; k < 80; k++) {
    s = step(s, arrivalAt(s, k)).s
    for (const p of s.visitors.present) {
      met.add(p.id)
      s = noticeVisitor(s, p.id, arrivalAt(s, k)).state
    }
  }
  return [...met].sort()
}

describe('with the feature switches', () => {
  it.each([
    ['visitors on alone', () => on({}, (): [VisitorId[], VisitorId[]] => [availableVisitors(), whoComes()]), ['hare']],
    ['everything on', () => withFeatures(ALL_ON, (): [VisitorId[], VisitorId[]] => [availableVisitors(), whoComes()]), ['hare']],
    ['visitors off', () => withFeatures(ALL_OFF, (): [VisitorId[], VisitorId[]] => [availableVisitors(), whoComes()]), []],
  ])('lists and brings %s', (_, run, expected) => {
    expect(run()).toEqual([expected, expected])
  })
})

describe('saying hello', () => {
  it('leaves a keepsake and a line in her own words, and pays nothing', () => {
    const s = hareHere()
    const r = noticeVisitor(s, 'hare', T0 + HOUR)
    expect(r).toMatchObject({ ok: true, notices: [] })
    expect(r.state.visitors).toMatchObject({ present: [], seen: { hare: 1 } })
    expect(r.state.keepsakes.hare).toBe(1)
    expect(r.state.stats.visitors).toBe(1)
    for (const key of ['coins', 'wood', 'xp', 'levelSeen'] as const) expect(r.state[key]).toBe(s[key])
    expect(r.state.journal[0]).toEqual({ id: r.state.journalSeq, at: T0 + HOUR, kind: 'visitor', title: VISITORS.hare.says[0], detail: HARE_SPRIG })
    expect(r.state.journal[1]).toMatchObject({ kind: 'story', title: FIRST_VISITOR_STORY })
  })

  it('makes room for her next arrival', () => {
    let s = step(started(MEADOW), arrivalAt(started(MEADOW), 0)).s
    expect(s.visitors.present).toHaveLength(1)
    s = noticeVisitor(s, 'hare', arrivalAt(s, 0)).state
    expect(s.visitors.present).toEqual([])
    s = step(s, arrivalAt(s, 1)).s
    expect(s.visitors.present).toEqual([{ id: 'hare', arrivedAt: arrivalAt(s, 1) }])
  })
})

describe('the hare carries her name', () => {
  /** A farm where Síofra has been met (the meadow owned, as the hare needs it). */
  const metFarm = (): GameState => {
    const s = started(MEADOW)
    s.characters.siofra.metAt = T0 - DAY
    return s
  }

  it('is the Brown hare until she has been met, even when everything she waits for holds', () => {
    const s = started(MEADOW)
    const names = () => [visitorName(s, 'hare'), ownName(s, 'hare')]
    expect(names()).toEqual(['Brown hare', undefined])
    // The hare greeted and her morning set, but the morning not yet come.
    s.visitors.seen.hare = 1
    s.characters.siofra.dueAt = T0 + DAY
    expect(names()).toEqual(['Brown hare', undefined])
  })

  it('says the keepsake line and the Say hello button as they always did, or with a name when given one', () => {
    for (const name of [undefined, SIOFRA_NAME]) {
      expect(keepsakeLine('hare', name)).toBe(name ? 'Síofra left a clover sprig.' : HARE_SPRIG)
      expect(sayHelloLabel('hare', name)).toBe(name ? 'Say hello to Síofra' : 'Say hello to the brown hare')
    }
    expect(keepsakeLine('hare')).toBe(HARE_SPRIG)
    // Her name makes the lore's lines.
    expect(keepsakeLine('hare', SIOFRA_NAME)).toBe(SIOFRA.hareOnceMet.keepsakeLine)
    expect(sayHelloLabel('hare', SIOFRA_NAME)).toBe(SIOFRA.hareOnceMet.sayHello)
  })

  it.each([
    ['after the meeting', () => hareHere(metFarm()), undefined, 'Síofra left a clover sprig.'],
    ['before the meeting', () => hareHere(started(MEADOW)), undefined, HARE_SPRIG],
    ['with characters off after it', () => hareHere(metFarm()), {}, HARE_SPRIG],
  ] as const)('writes the journal detail %s, leaving the hare\'s own words unchanged', (_, make, switches, detail) => {
    const r = switches ? on(switches, () => noticeVisitor(make(), 'hare', T0 + HOUR)) : noticeVisitor(make(), 'hare', T0 + HOUR)
    expect(r.ok).toBe(true)
    expect(r.state.journal[0]).toEqual({ id: r.state.journalSeq, at: T0 + HOUR, kind: 'visitor', title: VISITORS.hare.says[0], detail })
  })

  it("doesn't count her gifts among the hare's keepsakes", () => {
    const s = hareHere(metFarm())
    s.characters.siofra.given = ['pebble', 'feather', 'clover']
    const r = noticeVisitor(s, 'hare', T0 + HOUR)
    // One hello, one sprig; the three gifts are kept apart, as they were.
    expect(r.state.keepsakes).toEqual({ hare: 1 })
    expect(r.state.visitors.seen.hare).toBe(1)
    expect(r.state.characters.siofra.given).toEqual(['pebble', 'feather', 'clover'])
    expect(s.keepsakes).toEqual({})
  })
})

describe('smaller pieces', () => {
  it('starts again from now on load if the save started in the future, and leaves a small correction be', () => {
    const s = started()
    s.visitors.since = T0 + 400 * DAY
    s.visitors.nextPeriod = 5
    expect(sanitizeVisitors(s, s, T0).visitors).toMatchObject({ since: T0, nextPeriod: 0 })
    const m = started(MEADOW)
    const ahead = step(m, arrivalAt(m, 1)).s
    expect([step(ahead, T0 + HOUR).changed, step(ahead, arrivalAt(m, 1)).changed]).toEqual([false, false])
  })

  it('is the Brown hare again with characters off, whatever the save holds', () => {
    const s = started(MEADOW)
    s.characters.siofra.metAt = T0 - DAY
    on({}, () => expect([visitorName(s, 'hare'), ownName(s, 'hare')]).toEqual(['Brown hare', undefined]))
  })
})

describe('away and switched off', () => {
  it('loses nothing in a month away, and keeps the hare waiting out of sight while visitors are off', () => {
    const s = hareHere()
    s.visitors = { ...s.visitors, nextPeriod: 1, seen: { hare: 1 } }
    s.coins = 321
    const later = T0 + 30 * DAY
    const away = advance(s, later).state
    expect([away.coins, away.visitors.seen, away.visitors.present]).toEqual([321, { hare: 1 }, s.visitors.present])
    let last = Math.floor((later - T0) / PERIOD_MS)
    if (arrivalAt(s, last) > later) last--
    expect(away.visitors.nextPeriod).toBe(last + 1)
    withFeatures(ALL_OFF, () => {
      expect([hereNow(s.visitors.present), noticeVisitor(s, 'hare', T0).ok, sanitizeVisitors(s, s, T0).visitors.seen]).toEqual([[], false, { hare: 1 }])
    })
    expect([hereNow(s.visitors.present), noticeVisitor(s, 'hare', T0).ok]).toEqual([s.visitors.present, true])
  })
})
