import { describe, expect, it } from 'vitest'
import { advance } from '../advance'
import { GROVE_WOOD_SOURCES, ITEMS, MINUTE, SESSION, levelBonus } from '../config'
import { YIELDS, YIELD_IDS, type YieldId } from '../content/yields'
import { buyItem, endSession, startSession } from '../engine'
import { levelForXp } from '../progression'
import { migrate } from '../save'
import { createInitialState } from '../state'
import { RECAP_AFTER_MS, recapEntries } from './journal'
import { collectAll, sanitizeYields, settleYields, waitingYields, yieldSources, yieldsDue } from './yields'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0) // 09:00 UTC (tests run with TZ=UTC)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const fresh = () => createInitialState(T0)
const none = () => Object.fromEntries(YIELD_IDS.map((id) => [id, 0])) as Record<YieldId, number>
const eggsFor = (hens: number, hours: number) => (hens * hours) / YIELDS.eggs.hours

describe('idle yields', () => {
  it('two starting hens lay from the start, up to 72 hours worth, and nothing is lost at the cap', () => {
    const s = fresh()
    expect(waitingYields(s, T0 + DAY).eggs).toBe(Math.floor(eggsFor(2, 24)))
    const cap = Math.floor(eggsFor(2, 72))
    expect(waitingYields(s, T0 + 30 * DAY).eggs).toBe(cap)
    settleYields(s, T0 + 30 * DAY)
    expect(waitingYields(s, T0 + 30 * DAY).eggs).toBe(cap)
    settleYields(s, T0 + 31 * DAY)
    expect(waitingYields(s, T0 + 31 * DAY).eggs).toBe(cap)
  })

  it('buying a source banks what is waiting at the old count; at the cap, a new source raises the cap and accrual resumes', () => {
    const early = buyItem(fresh(), 'chicken', T0 + 9 * HOUR)
    expect(early.ok).toBe(true)
    expect(waitingYields(early.state, T0 + 18 * HOUR).eggs).toBe(Math.floor(eggsFor(2, 9) + eggsFor(3, 9)))
    const s = fresh()
    settleYields(s, T0 + 30 * DAY)
    expect(s.yields.stored.eggs).toBe(eggsFor(2, 72))
    const bought = buyItem(s, 'chicken', T0 + 30 * DAY)
    expect(bought.ok).toBe(true)
    settleYields(bought.state, T0 + 30 * DAY + 8 * HOUR)
    expect(bought.state.yields.stored.eggs).toBeGreaterThan(eggsFor(2, 72))
    expect(bought.state.yields.stored.eggs).toBeLessThanOrEqual(eggsFor(3, 72))
  })

  it('a clock that steps back pays nothing and never pays a window twice', () => {
    const s = fresh()
    settleYields(s, T0 + 10 * HOUR)
    const before = structuredClone(s.yields)
    settleYields(s, T0 + 5 * HOUR)
    expect(s.yields).toEqual(before)
    settleYields(s, T0 + 12 * HOUR)
    expect(s.yields.stored.eggs).toBeCloseTo(before.stored.eggs + eggsFor(2, 2))
  })

  it.each([
    [18, ['The hens laid 18 eggs.', 'The sheep grew 18 fleeces.', 'The goats gave 18 pails of milk.', 'The bees filled 18 jars of honey.', 'The trees dropped 18 baskets of fruit.', '18 fish were landed in the wetland.', '18 logs were split and stacked.']],
    [1, ['The hens laid 1 egg.', 'The sheep grew 1 fleece.', 'The goats gave 1 pail of milk.', 'The bees filled 1 jar of honey.', 'The trees dropped 1 basket of fruit.', '1 fish was landed in the wetland.', '1 log was split and stacked.']],
  ])('narrates each kind in plain words for %i', (n, lines) => expect(YIELD_IDS.map((id) => YIELDS[id].line(n))).toEqual(lines))
})

describe('collect all', () => {
  it('pays coins, wood and XP, keeps fractions, and writes narrated lines', () => {
    const s = fresh()
    s.owned.woodshed = 1
    const eggs = Math.floor(eggsFor(2, 13))
    const logs = Math.floor(13 / YIELDS.wood.hours)
    expect(eggs).toBeGreaterThan(0)
    expect(logs).toBeGreaterThan(0)
    const r = collectAll(s, T0 + 13 * HOUR)
    expect(r.ok).toBe(true)
    // Whole XP now; the fraction is carried to the next collect, and any level reached pays its bonus.
    const earned = eggs * YIELDS.eggs.xp + logs * YIELDS.wood.xp
    const xp = Math.floor(earned)
    let bonus = 0
    for (let level = levelForXp(s.xp) + 1; level <= levelForXp(s.xp + xp); level++) bonus += levelBonus(level)
    expect(r.state.coins).toBe(s.coins + eggs * YIELDS.eggs.value + bonus)
    expect(r.state.wood).toBe(s.wood + logs * YIELDS.wood.value)
    expect(r.state.xp).toBe(s.xp + xp)
    expect(r.state.yields.xpCarry).toBeCloseTo(earned - xp)
    expect(r.state.yields.stored.eggs).toBeCloseTo(eggsFor(2, 13) - eggs)
    const rewards = r.notices.filter((n) => n.kind === 'reward')
    expect(rewards).toHaveLength(1)
    expect(rewards[0]).toMatchObject({ journal: 'garden', title: expect.stringMatching(/^\+\d+ coins, \+\d+ wood$/), detail: expect.stringMatching(/^The hens laid.*split and stacked\.$/) })
    expect(rewards[0].entry).toEqual({ title: 'You brought in what the farm made.', detail: rewards[0].detail })
    expect(r.state.journal[0]).toMatchObject({ kind: 'garden', title: 'You brought in what the farm made.', detail: rewards[0].detail })
    // What was paid is gone; collecting again straight away has nothing whole to give.
    expect(collectAll(r.state, T0 + 13 * HOUR).ok).toBe(false)
    expect(collectAll(fresh(), T0 + HOUR)).toMatchObject({ ok: false, notices: [] }) // only fractions waiting: refused quietly
  })

  it("carries each collect's XP fraction to the next, so how often you collect barely changes the XP", () => {
    const s = fresh()
    s.owned.chicken = ITEMS.chicken.max
    s.owned.woodshed = 1
    const once = collectAll(s, T0 + 60 * HOUR).state
    let often = s
    for (let h = 1; h <= 60; h++) {
      const r = collectAll(often, T0 + h * HOUR)
      if (r.ok) often = r.state
    }
    expect(once.xp - s.xp).toBeGreaterThan(1)
    expect(Math.abs(often.xp - once.xp)).toBeLessThanOrEqual(1)
    for (const farm of [once, often]) expect(farm.yields.xpCarry >= 0 && farm.yields.xpCarry < 1).toBe(true)
  })
})

describe('sources', () => {
  it('the grove adds woodshed sources and no longer adds session wood', () => {
    const s = fresh()
    expect(yieldSources(s, 'wood')).toBe(0)
    s.owned.grove = 1
    expect(yieldSources(s, 'wood')).toBe(0) // the grove alone feeds the woodshed
    s.owned.woodshed = 1
    expect(yieldSources(s, 'wood')).toBe(1 + GROVE_WOOD_SOURCES)
    const r = endSession(startSession(s, T0).state, T0 + 45 * MINUTE)
    expect(r.state.wood).toBe(s.wood + Math.floor(45 / SESSION.minutesPerWood))
  })

})

describe('saves', () => {
  const T5 = T0 + 5 * DAY

  it("a fresh farm's yields start counting at creation, and an old save's at load", () => {
    const zero = (at: number) => ({ at, stored: none(), xpCarry: 0 })
    expect(fresh().yields).toEqual(zero(T0))
    expect(sanitizeYields({}, T5, fresh()).yields).toEqual(zero(T5))
    const old = JSON.parse(JSON.stringify(fresh()))
    delete old.yields
    expect(migrate(old, T5)!.yields).toEqual(zero(T5))
  })

  it.each([[0.45, 0.45], [undefined, 0], ['lots', 0], [-0.5, 0], [Number.NaN, 0], [1, 0], [40, 0]])('keeps the carried XP %s as %s (held to [0, 1))', (xpCarry, kept) =>
    expect(sanitizeYields({ at: T0, stored: {}, xpCarry }, T0, fresh()).yields.xpCarry).toBe(kept),
  )

  it('repairs junk and holds what is stored to the cap of the sources owned', () => {
    const { yields } = sanitizeYields({ at: 'soon', stored: { eggs: 999, wool: -3, milk: 'lots', wood: 5 } }, T5, fresh())
    expect(yields.at).toBe(T5)
    expect(yields.stored).toEqual({ ...none(), eggs: eggsFor(2, 72) }) // no sheep, goats or woodshed
    expect(sanitizeYields({ at: T0 + HOUR, stored: { eggs: 1.5 } }, T5, fresh()).yields).toEqual({ at: T0 + HOUR, stored: { ...none(), eggs: 1.5 }, xpCarry: 0 })
  })
})

describe('the recap', () => {
  it('after an absence the recap says what is waiting, once', () => {
    const s = fresh()
    s.owned.woodshed = 1
    const at = s.seenAt + Math.max(RECAP_AFTER_MS, YIELDS.wood.hours * HOUR)
    const { eggs, wood } = waitingYields(s, at)
    expect(eggs).toBeGreaterThan(0)
    expect(wood).toBeGreaterThan(0)
    const r = advance(s, at)
    expect(r.ok).toBe(true)
    expect(r.notices).toEqual([]) // written down for the recap, never announced
    const lines = r.state.journal.filter((e) => e.kind === 'garden')
    expect(lines).toHaveLength(1)
    expect(lines[0].title).toMatch(new RegExp(`^Waiting to be collected: ${eggs} eggs? and ${wood} logs?\\.$`))
    expect(recapEntries(r.state, s.seenAt).map((e) => e.title)).toContain(lines[0].title)
    expect(advance(r.state, at + 1000).ok).toBe(false)
  })

  it('yieldsDue is false while the player was here recently, or with nothing whole waiting', () => {
    const s = { ...fresh(), seenAt: T0 + 20 * HOUR }
    expect(waitingYields(s, s.seenAt).eggs).toBeGreaterThan(0)
    expect(yieldsDue(s, s.seenAt + RECAP_AFTER_MS - 1)).toBe(false)
    expect(yieldsDue(s, s.seenAt + RECAP_AFTER_MS)).toBe(true)
    expect(yieldsDue(fresh(), T0 + RECAP_AFTER_MS)).toBe(false)
  })
})
