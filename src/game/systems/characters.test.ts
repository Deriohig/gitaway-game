import { describe, expect, it, vi } from 'vitest'
import { byDay } from '../../ui/panels/journal/days'
import { advance } from '../advance'
import type { ItemId } from '../config'
import { BARNABY, type Line } from '../content/barnaby'
import { MOMENT_IDS, SIOFRA } from '../content/siofra'
import { logTask } from '../engine'
import { FEATURES } from '../features'
import { xpForLevel } from '../progression'
import { migrate } from '../save'
import { createInitialState, type GameState } from '../state'
import { ALL_OFF, withFeatures } from '../testing'
import { barnabySettled, barnabySettledAt, charactersDue, nextMorning, sanitizeCharacters, SAYS_MS, SETTLE_MS, speaking, tapBarnaby, tapLine } from './characters'
import { JOURNAL, recapEntries, write } from './journal'

const T0 = Date.UTC(2026, 9, 23, 9, 0, 0)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const fresh = () => createInitialState(T0)
const withHighland = (): GameState => ({ ...fresh(), owned: { ...fresh().owned, highland: 1 } })
/** What a save holds: plain JSON. */
const saved = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b)

type Characters = GameState['characters']

const unmet = (): Characters['siofra'] => ({ dueAt: null, metAt: null, momentAt: null, checkedAt: null, lastMoment: null, given: [], met: false, heard: [], said: null })

/** Síofra met four days ago, with a moment posted yesterday evening and some of everything used. */
const metSiofra = (): Characters['siofra'] => ({
  dueAt: T0 - 4 * DAY - 3 * HOUR,
  metAt: T0 - 4 * DAY - 3 * HOUR,
  momentAt: T0 - 15 * HOUR,
  checkedAt: T0 - 15 * HOUR,
  lastMoment: 'shape-goat',
  given: ['pebble', 'clover'],
  met: true,
  heard: [0, 14, 3],
  said: { index: 3, at: T0 - 1000 },
})

/** Barnaby found three hours ago, camping by the garden, with some of everything used; Síofra not met. */
const camping = (): Characters => ({
  shiver: { at: T0 - HOUR, size: 'small' },
  barnaby: {
    stage: 'camp',
    dueAt: T0 - 3 * HOUR,
    foundAt: T0 - 3 * HOUR,
    movedAt: null,
    sawLand: ['meadow', 'grove'],
    remarksUsed: [0, 5],
    lastRemarkDay: '2026-10-23',
    met: true,
    heard: [0, 7, 3],
    said: { index: 3, at: T0 - 1000 },
  },
  siofra: unmet(),
})

const repaired = (patch: Record<string, unknown>, farm = fresh()) =>
  sanitizeCharacters({ characters: { ...camping(), barnaby: { ...camping().barnaby, ...patch } } }, farm, T0).characters.barnaby
const repairedSiofra = (patch: Record<string, unknown>) =>
  sanitizeCharacters({ characters: { ...camping(), siofra: { ...metSiofra(), ...patch } } }, fresh(), T0).characters.siofra
/** Both ways a save is read, with the features in whatever state the caller set. */
const expectRoundTrip = (characters: Characters, farm = fresh()) => {
  expect(sanitizeCharacters(saved({ characters }), farm, T0)).toEqual({ characters })
  expect(migrate(saved({ ...farm, characters }), T0)!.characters).toEqual(characters)
}

describe("Barnaby's lines", () => {
  it('every line fits the journal', () => {
    const lines: Line[] = [BARNABY.found, BARNABY.straightToRuin, ...Object.values(BARNABY.land), ...BARNABY.shiver]
    for (const { title, detail } of lines) {
      expect(title.length, title).toBeLessThanOrEqual(JOURNAL.titleMax)
      expect((detail ?? '').length, title).toBeLessThanOrEqual(JOURNAL.detailMax)
    }
  })

  it("has the appendix's counts, shiver sizes and land order, and his introduction as the first tap line", () => {
    expect(Object.keys(BARNABY.land)).toEqual(['meadow', 'grove', 'islet', 'wetland', 'orchardLand', 'cottageLand', 'highland'])
    expect(BARNABY.tapCamp[0].startsWith('Barnaby Wick. At your service.')).toBe(true)
  })

  it('the characters switch is on as committed', () => expect(FEATURES.characters).toBe(true))
})

describe('the characters slice in the save', () => {
  it('starts every farm with Barnaby away, Síofra not met and no shiver yet', () => {
    expect(fresh().characters).toEqual({
      shiver: null,
      barnaby: { stage: 'away', dueAt: null, foundAt: null, movedAt: null, sawLand: [], remarksUsed: [], lastRemarkDay: null, met: false, heard: [], said: null },
      siofra: unmet(),
    })
  })

  it('a missing or junk slice loads him as away, and a junk one of hers loads her as not met', () => {
    for (const raw of [undefined, 42, {}, { characters: 42 }, { characters: { barnaby: 'x' } }, { characters: { barnaby: { stage: 7 }, shiver: 'x' } }]) {
      expect(sanitizeCharacters(raw, fresh(), T0), JSON.stringify(raw)).toEqual({ characters: fresh().characters })
    }
    for (const siofra of [undefined, null, 42, 'met', [], {}, { met: 'yes', given: 7 }]) {
      const loaded = sanitizeCharacters({ characters: { ...camping(), siofra } }, fresh(), T0).characters
      expect(loaded, JSON.stringify(siofra)).toEqual(camping())
    }
  })

  it('saved characters survive a round-trip, with the features on or off', () => {
    const ruin: Characters = { ...camping(), barnaby: { ...camping().barnaby, stage: 'ruin', movedAt: T0 - 2 * HOUR, heard: [12, 16] } }
    const met: Characters = { ...camping(), siofra: metSiofra() }
    // Every kind of thing she can hold: the last tap line, the last gift, the last moment.
    const given = Object.keys(SIOFRA.gifts) as Characters['siofra']['given']
    const full: Characters = { ...met, siofra: { ...metSiofra(), lastMoment: MOMENT_IDS[MOMENT_IDS.length - 1], given, heard: [14], said: { index: 14, at: T0 } } }
    for (const state of [undefined, ALL_OFF]) {
      const check = () => {
        expectRoundTrip(camping())
        expectRoundTrip(ruin, withHighland()) // the ruin only holds while the highland is owned
        expectRoundTrip(met)
        expectRoundTrip(full)
      }
      if (state) withFeatures(state, check)
      else check()
    }
  })

  it('a save from before Síofra loads her as not met with Barnaby intact, however old', () => {
    const before = { shiver: camping().shiver, barnaby: camping().barnaby }
    expect(sanitizeCharacters(saved({ characters: before }), fresh(), T0).characters).toEqual(camping())
    expect(migrate(saved({ ...fresh(), characters: before }), T0)!.characters).toEqual(camping())
    const older: Partial<GameState> = saved(fresh())
    delete older.characters
    expect(migrate(older, T0)!.characters.siofra).toEqual(unmet())
  })

  // [what, patch over a camping Barnaby, farm owns the highland, fields expected]
  it.each<[string, Record<string, unknown>, boolean, Record<string, unknown>]>([
    ['unknown stage', { stage: 'tower' }, false, { stage: 'away' }],
    ['sawLand known, once each', { sawLand: ['meadow', 'farmhouse', 7, 'toString', 'meadow', 'highland'] }, false, { sawLand: ['meadow', 'highland'] }],
    ['remarks are shiver lines 0-7', { remarksUsed: [0, 7, 8, -1, 2.5, '3', 7, null, 3] }, false, { remarksUsed: [0, 7, 3] }],
    ['heard are tap lines 0-16', { heard: [0, 16, 17, -1, 1.5, '4', 16, 4] }, false, { heard: [0, 16, 4] }],
    ['found and moved after now (clock ran ahead)', { foundAt: T0 + HOUR, movedAt: T0 + 2 * HOUR }, false, { foundAt: T0, movedAt: T0 }],
    ['said after now', { said: { index: 2, at: T0 + HOUR } }, false, { said: { index: 2, at: T0 } }],
    ['ruin without the highland is put back at the camp', { stage: 'ruin', movedAt: T0 - HOUR }, false, { stage: 'camp', movedAt: null }],
    ['ruin with the highland stays', { stage: 'ruin', movedAt: T0 - HOUR }, true, { stage: 'ruin', movedAt: T0 - HOUR }],
    ['ruin that lost movedAt: when he was found', { stage: 'ruin', movedAt: null }, true, { movedAt: T0 - 3 * HOUR }],
    ['found that lost foundAt: now', { foundAt: null }, false, { foundAt: T0 }],
    ['junk dueAt, day, met, said index', { dueAt: -5, lastRemarkDay: 'Thursday', met: 'yes', said: { index: 17, at: T0 } }, false, { dueAt: null, lastRemarkDay: null, met: false, said: null }],
  ])('repairs Barnaby: %s', (_what, patch, highland, expected) => {
    expect(repaired(patch, highland ? withHighland() : fresh())).toMatchObject(expected)
  })

  it.each([
    [{ at: T0, size: 'huge' }, null],
    [{ at: T0, size: 'either' }, null],
    [{ at: T0, size: 'big' }, { at: T0, size: 'big' }],
    [{ at: T0 + HOUR, size: 'big' }, { at: T0, size: 'big' }], // ahead of the clock: put back to now
  ])('repairs the shiver %j', (shiver, expected) => {
    expect(sanitizeCharacters({ characters: { ...camping(), shiver } }, fresh(), T0).characters.shiver).toEqual(expected)
  })

  const taps = SIOFRA.taps.length
  it.each<[string, Record<string, unknown>, Record<string, unknown>]>([
    ['meeting ahead of the clock is put back to now, never undone', { metAt: T0 + DAY }, { metAt: T0 }],
    ['moment times ahead restart her pacing', { momentAt: T0 + 2 * HOUR, checkedAt: T0 + 3 * HOUR }, { momentAt: null, checkedAt: null }],
    ['said after now', { said: { index: 2, at: T0 + HOUR } }, { said: { index: 2, at: T0 } }],
    ['gifts known, once each, in order', { given: ['pebble', 'toString', 'pebble', 'shell', 7, 'gift-pebble', '__proto__', null, 'feather'] }, { given: ['pebble', 'shell', 'feather'] }],
    ['heard bounded by her lines', { heard: [0, taps - 1, taps, -1, 1.5, '4', taps - 1, 4] }, { heard: [0, taps - 1, 4] }],
    ['said last line', { said: { index: taps - 1, at: T0 } }, { said: { index: taps - 1, at: T0 } }],
    ['said past her lines, negative or not an object', { said: { index: taps, at: T0 } }, { said: null }],
  ])('repairs Síofra: %s', (_what, patch, expected) => {
    expect(repairedSiofra(patch)).toMatchObject(expected)
  })

  it('her due time and last moment are known values or none', () => {
    for (const junk of ['dawn', -5, 0, true, [T0], undefined, null]) expect(repairedSiofra({ dueAt: junk }).dueAt, JSON.stringify(junk)).toBeNull()
    for (const id of MOMENT_IDS) expect(repairedSiofra({ lastMoment: id }).lastMoment, id).toBe(id)
    for (const junk of ['shape-unicorn', 'toString', '__proto__', '', 7, true, ['shape-goat'], { id: 'shape-goat' }, undefined, null]) {
      expect(repairedSiofra({ lastMoment: junk }).lastMoment, JSON.stringify(junk)).toBeNull()
    }
  })

  it('a meeting time ahead of the clock is put back to now through a whole save too', () => {
    const ahead: Characters = { ...camping(), siofra: { ...metSiofra(), metAt: T0 + DAY } }
    expect(migrate(saved({ ...fresh(), characters: ahead }), T0)!.characters.siofra).toEqual({ ...metSiofra(), metAt: T0 })
  })
})

describe('character lines in the journal', () => {
  it('the recap shows character lines', () => {
    const s = fresh()
    write(s, 'character', BARNABY.found.title, BARNABY.found.detail, T0 + HOUR)
    expect(recapEntries(s, T0).map((e) => [e.kind, e.title])).toEqual([['character', BARNABY.found.title]])
    expect(recapEntries(s, T0 + HOUR)).toEqual([])
    withFeatures({ characters: false }, () => expect(recapEntries(s, T0)).toEqual([]))
  })
})

// The arc runs on Monday 19 October 2026 and the days after (tests run with TZ=UTC, so local 06:00 is 06:00Z).
const on = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour, minute)
const MONDAY = on(19, 9)
const TUESDAY_MORNING = on(20, 6)

function farmAt(level: number, now = MONDAY, owned: Partial<Record<ItemId, number>> = {}): GameState {
  const s = createInitialState(now)
  return { ...s, xp: xpForLevel(level), levelSeen: level, owned: { ...s.owned, ...owned } }
}

const claim = (s: GameState, piece: ItemId): GameState => ({ ...s, owned: { ...s.owned, [piece]: 1 } })
const withBarnaby = (s: GameState, patch: Partial<Characters['barnaby']>): GameState => ({ ...s, characters: { ...s.characters, barnaby: { ...s.characters.barnaby, ...patch } } })

/** His journal lines, oldest first, with when they're stamped. */
const lines = (s: GameState) =>
  s.journal
    .filter((e) => e.kind === 'character')
    .reverse()
    .map(({ at, title, detail }) => ({ at, title, detail }))

const line = (at: number, { title, detail }: Line) => ({ at, title, detail })

/** A level-7 farm that met him at 06:00 on Tuesday, camping by the garden. */
const foundOnTuesday = (owned: Partial<Record<ItemId, number>> = {}) => advance(advance(farmAt(7, MONDAY, owned), MONDAY).state, TUESDAY_MORNING).state

/** An idle second does nothing and copies nothing (the step is skipped before it clones the state). */
function expectIdle(s: GameState, at: number) {
  expect(charactersDue(s, at)).toBe(false)
  const clones = vi.spyOn(globalThis, 'structuredClone')
  try {
    expect(advance(s, at)).toEqual({ state: s, notices: [], ok: false })
    expect(clones).not.toHaveBeenCalled()
  } finally {
    clones.mockRestore()
  }
}

describe("Barnaby's arc", () => {
  it('the next morning is 06:00 today before 06:00, and 06:00 tomorrow from 06:00 on', () => {
    expect([nextMorning(on(20, 5)), nextMorning(on(20, 6)), nextMorning(on(20, 9))]).toEqual([on(20, 6), on(21, 6), on(21, 6)])
  })

  it('he is found at the first 06:00 after level 6', () => {
    let s = advance(farmAt(5), MONDAY).state
    expect(s.characters.barnaby.dueAt).toBeNull()
    s = advance({ ...s, xp: xpForLevel(6) }, on(19, 10)).state
    expect(s.characters.barnaby).toMatchObject({ stage: 'away', dueAt: TUESDAY_MORNING, foundAt: null })
    s = advance(s, on(20, 5, 59)).state
    expect(s.characters.barnaby).toMatchObject({ stage: 'away', foundAt: null })
    expect(lines(s)).toEqual([])
    const r = advance(s, TUESDAY_MORNING)
    expect(r.state.characters.barnaby).toMatchObject({ stage: 'camp', foundAt: TUESDAY_MORNING, movedAt: null })
    expect(r.notices.filter((n) => n.title === BARNABY.found.toast)).toEqual([{ kind: 'info', title: 'Someone is asleep in the radishes.', journal: false }])
    expect(lines(r.state)).toEqual([line(TUESDAY_MORNING, BARNABY.found)])
  })

  it('he goes straight to the ruin if the highland is owned, even when claimed after he was due', () => {
    const straight = [line(TUESDAY_MORNING, BARNABY.found), line(TUESDAY_MORNING, BARNABY.straightToRuin)] // no moving line: he never camped
    const ruin = { stage: 'ruin', foundAt: TUESDAY_MORNING, movedAt: TUESDAY_MORNING, sawLand: ['highland'] }
    const s = foundOnTuesday({ highland: 1 })
    expect(s.characters.barnaby).toMatchObject(ruin)
    expect(lines(s)).toEqual(straight)
    const late = advance(claim(advance(farmAt(7), MONDAY).state, 'highland'), on(20, 8)).state
    expect(late.characters.barnaby).toMatchObject(ruin)
    expect(lines(late)).toEqual(straight)
  })

  it("land lines are journal only, for pieces claimed after he's found", () => {
    const s = foundOnTuesday({ meadow: 1 })
    expect(s.characters.barnaby.sawLand).toEqual(['meadow'])
    expect(lines(s)).toEqual([line(TUESDAY_MORNING, BARNABY.found)])
    const r = advance(claim(s, 'grove'), on(20, 9))
    expect(r.state.characters.barnaby).toMatchObject({ stage: 'camp', sawLand: ['meadow', 'grove'] })
    expect(lines(r.state)).toEqual([line(TUESDAY_MORNING, BARNABY.found), line(on(20, 9), BARNABY.land.grove)])
    expect(r.notices.map((n) => n.title)).not.toContain(BARNABY.land.grove.title)
    expect(lines(advance(r.state, on(20, 10)).state)).toEqual(lines(r.state))
  })

  it('claiming the highland moves him, and land claimed together gets its lines in his land order', () => {
    const s = foundOnTuesday()
    const moved = advance(claim(s, 'highland'), on(21, 12))
    expect(moved.state.characters.barnaby).toMatchObject({ stage: 'ruin', foundAt: TUESDAY_MORNING, movedAt: on(21, 12), sawLand: ['highland'] })
    expect(lines(moved.state)).toEqual([line(TUESDAY_MORNING, BARNABY.found), line(on(21, 12), BARNABY.land.highland)])
    expect(moved.notices.map((n) => n.title)).not.toContain(BARNABY.land.highland.title)
    const both = advance(claim(claim(s, 'highland'), 'orchardLand'), on(21, 12)).state
    expect(both.characters.barnaby.sawLand).toEqual(['orchardLand', 'highland'])
    expect(lines(both)).toEqual([line(TUESDAY_MORNING, BARNABY.found), line(on(21, 12), BARNABY.land.orchardLand), line(on(21, 12), BARNABY.land.highland)])
  })

  it('has nothing due below level 6 (even with a far-off due time); due when scheduling, finding or seeing to land', () => {
    const s = advance(farmAt(5), MONDAY).state
    expectIdle(s, MONDAY + 1000)
    const tampered = withBarnaby(s, { dueAt: MONDAY + 5 * DAY })
    expectIdle(tampered, MONDAY + 1000)
    expect(charactersDue({ ...tampered, xp: xpForLevel(6) }, MONDAY + 1000)).toBe(true) // at level 6 it's put back
    const level6 = { ...s, xp: xpForLevel(6) }
    expect(charactersDue(level6, MONDAY + 1000)).toBe(true)
    const scheduled = advance(level6, MONDAY + 1000).state
    expect([charactersDue(scheduled, TUESDAY_MORNING - 1), charactersDue(scheduled, TUESDAY_MORNING)]).toEqual([false, true])
    const found = advance(scheduled, TUESDAY_MORNING).state
    expect([charactersDue(found, on(20, 7)), charactersDue(claim(found, 'islet'), on(20, 7))]).toEqual([false, true])
  })

  describe('found after a longer absence (ruling R17)', () => {
    /** A level-7 farm at 20:00 on Monday with radishes that ripen overnight: he's due at 06:00 on Tuesday. */
    function eveningFarm(owned: Partial<Record<ItemId, number>> = {}): GameState {
      const s = farmAt(7, on(19, 20), owned)
      s.plots[0] = { ...s.plots[0], crop: 'radish', plantedAt: on(19, 20), readyAt: on(19, 21), notified: false }
      const r = advance(s, on(19, 20)).state
      expect(r.characters.barnaby.dueAt).toBe(TUESDAY_MORNING)
      return r
    }

    it.each<[string, Partial<Record<ItemId, number>>, number, number, boolean]>([
      ["three days late, he's found at that day's 06:00", {}, on(23, 9), on(23, 6), false],
      ['late with the highland owned, he goes straight up at the same 06:00', { highland: 1 }, on(23, 9), on(23, 6), true],
      ["back before 06:00, he's found then", {}, on(23, 3), on(23, 3), false],
      ['on the morning he was due, stamped at that 06:00 however late', {}, on(20, 23), TUESDAY_MORNING, false],
    ])('%s, in the same journal day as the catch-up', (_what, owned, back, foundAt, ruin) => {
      const r = advance(eveningFarm(owned), back)
      expect(r.state.characters.barnaby).toMatchObject({ stage: ruin ? 'ruin' : 'camp', foundAt })
      expect(lines(r.state)).toEqual([line(foundAt, BARNABY.found), ...(ruin ? [line(foundAt, BARNABY.straightToRuin)] : [])])
      // Each date shows once, newest first, so no journal day shows twice or shares a key.
      const later = logTask(r.state, 'Sweep the porch', back + HOUR)
      expect(later.ok).toBe(true)
      const dates = byDay(later.state.journal).map(([date]) => date)
      expect(new Set(dates).size, dates.join(' ')).toBe(dates.length)
      expect(dates).toEqual([...dates].sort().reverse())
      if (back === on(23, 9) && !ruin) expect(recapEntries(r.state, on(19, 20))[0].title).toBe(BARNABY.found.title) // his line leads the recap
    })

  })

  it('the clock stepping back never un-finds him', () => {
    const back = advance(foundOnTuesday(), TUESDAY_MORNING - DAY).state
    expect(advance(back, on(20, 7)).state.characters.barnaby).toMatchObject({ stage: 'camp', foundAt: TUESDAY_MORNING })
  })

  it('a due time left days ahead by a clock that ran ahead is put back to the next morning', () => {
    const stale = withBarnaby(farmAt(6), { dueAt: MONDAY + 5 * DAY })
    expect(charactersDue(stale, MONDAY)).toBe(true)
    const r = advance(stale, MONDAY).state
    expect(r.characters.barnaby).toMatchObject({ stage: 'away', dueAt: TUESDAY_MORNING })
    expect(advance(r, TUESDAY_MORNING).state.characters.barnaby).toMatchObject({ stage: 'camp', foundAt: TUESDAY_MORNING })
  })

  it('a farm saved before characters existed, already past level 6, meets him the morning after it loads', () => {
    const old: Partial<GameState> = saved(farmAt(7, on(12, 9)))
    delete old.characters
    const s = advance(migrate(old, MONDAY)!, MONDAY).state
    expect(s.characters.barnaby.dueAt).toBe(TUESDAY_MORNING)
    expect(advance(s, TUESDAY_MORNING).state.characters.barnaby).toMatchObject({ stage: 'camp', foundAt: TUESDAY_MORNING })
  })

  it('the night the clocks go back, a next morning 25 hours off is not taken for a stale one', () => {
    const tz = process.env.TZ
    process.env.TZ = 'Europe/London'
    try {
      const now = Date.UTC(2026, 9, 24, 5, 30) // 06:30 BST Saturday; the next 06:00 is 24½ hours off
      const s = advance(farmAt(6, now), now).state
      expect(s.characters.barnaby.dueAt).toBe(Date.UTC(2026, 9, 25, 6, 0))
      expect(charactersDue(s, now + 1000)).toBe(false)
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  it('he is settled three days after he is found, or as soon as he moves to the ruin; barnabySettledAt gives when', () => {
    expect(barnabySettled(advance(farmAt(7), MONDAY).state, on(30, 6))).toBe(false)
    expect(barnabySettledAt(fresh())).toBeNull()
    expect(barnabySettledAt(advance(farmAt(7), MONDAY).state)).toBeNull()
    const camp = foundOnTuesday() // camping: three days after he's found
    expect(TUESDAY_MORNING + SETTLE_MS).toBe(on(23, 6))
    expect(barnabySettledAt(camp)).toBe(TUESDAY_MORNING + SETTLE_MS)
    const moved = advance(claim(camp, 'highland'), on(20, 9)).state // moved before then: when he moved
    expect(barnabySettledAt(moved)).toBe(on(20, 9))
    const late = advance(claim(camp, 'highland'), on(25, 9)).state // moved after he'd settled anyway
    expect(late.characters.barnaby.movedAt).toBe(on(25, 9))
    expect(barnabySettledAt(late)).toBe(TUESDAY_MORNING + SETTLE_MS)
    const straight = foundOnTuesday({ highland: 1 })
    expect(barnabySettledAt(straight)).toBe(TUESDAY_MORNING)
    const unfound = withBarnaby(moved, { foundAt: null }) // a save edited by hand: when he moved
    expect(barnabySettledAt(unfound)).toBe(on(20, 9))
    for (const [name, s] of Object.entries({ camp, moved, late, straight, unfound })) expect(barnabySettled(s, barnabySettledAt(s)!), name).toBe(true)
    expect(barnabySettled(camp, barnabySettledAt(camp)! - 1)).toBe(false)
  })

  it('switched off, he is never scheduled or found, and one already due stays unfound', () => {
    withFeatures({ characters: false }, () => {
      let s = advance(farmAt(7), MONDAY).state
      for (const t of [TUESDAY_MORNING, on(25, 6)]) s = advance(s, t).state
      expect(s.characters).toEqual(fresh().characters)
      expect(lines(s)).toEqual([])
    })
  })
})

// A small seeded generator (mulberry32), so a "random" cycle of taps is the same every run.
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** A farm Barnaby is on: camping by the garden, or living in the ruin (with the highland that takes), never tapped yet. */
function tappable(stage: 'camp' | 'ruin' = 'camp', patch: Partial<Characters['barnaby']> = {}): GameState {
  const s = stage === 'ruin' ? withHighland() : fresh()
  s.characters.barnaby = {
    ...s.characters.barnaby,
    stage,
    dueAt: T0 - 3 * HOUR,
    foundAt: T0 - 3 * HOUR,
    movedAt: stage === 'ruin' ? T0 - 2 * HOUR : null,
    ...patch,
  }
  return s
}

/** Taps him `n` times a second apart: the state after and the line each tap picked. */
function tapped(from: GameState, n: number, rand: () => number): { state: GameState; picked: number[] } {
  let state = from
  const picked: number[] = []
  for (let i = 0; i < n; i++) {
    const r = tapBarnaby(state, T0 + i * 1000, rand)
    expect(r.ok, `tap ${i + 1}`).toBe(true)
    state = r.state
    picked.push(state.characters.barnaby.said!.index)
  }
  return { state, picked }
}

/** The camp tap that is the lean-to line (ruling R12): in the pool only while he camps. */
const LEAN_TO = 11
const CAMP_POOL = Array.from({ length: 12 }, (_, i) => i)
/** Once he lives in the ruin: every index 0-16 but the lean-to's. */
const RUIN_POOL = Array.from({ length: 17 }, (_, i) => i).filter((i) => i !== LEAN_TO)
const heardOf = (s: GameState) => s.characters.barnaby.heard
const tapPicks = (s: GameState, roll: number) => tapBarnaby(s, T0, () => roll).state.characters.barnaby

describe('tapping Barnaby', () => {
  it('maps an index to the camp lines, then the ruin lines', () => {
    expect(BARNABY.tapCamp.map((_, i) => tapLine(i))).toEqual(BARNABY.tapCamp)
    expect(BARNABY.tapRuin.map((_, i) => tapLine(12 + i))).toEqual(BARNABY.tapRuin)
  })

  it('his first tap is his introduction, whatever the dice say', () => {
    const s = tappable()
    expect(s.characters.barnaby).toMatchObject({ met: false, heard: [], said: null })
    for (const roll of [0, 0.5, 0.999]) {
      expect(tapPicks(s, roll)).toMatchObject({ met: true, heard: [0], said: { index: 0, at: T0 } })
    }
    expect(tapLine(0)).toBe(BARNABY.tapCamp[0])
    expect(s.characters.barnaby).toMatchObject({ met: false, heard: [], said: null }) // the state he was tapped in is unchanged
  })

  it.each([
    ['camp', CAMP_POOL],
    ['ruin', RUIN_POOL],
  ] as const)('at the %s, every cycle is the whole pool once each, never the same line twice running', (stage, pool) => {
    for (const seed of [1, 7, 2026]) {
      const { picked, state } = tapped(tappable(stage), 100, seeded(seed))
      expect(picked[0], `seed ${seed}`).toBe(0)
      for (let from = 0; from + pool.length <= 100; from += pool.length) {
        expect(sorted(picked.slice(from, from + pool.length)), `${stage}, seed ${seed}, from ${from}`).toEqual(pool)
      }
      expect(picked.flatMap((index, i) => (i > 0 && index === picked[i - 1] ? [`tap ${i + 1}`] : [])), `${stage}, seed ${seed}`).toEqual([])
      expect(new Set(picked)).toEqual(new Set(pool)) // the camp never reaches the ruin's lines, the ruin never the lean-to
      expect(heardOf(state).length).toBeLessThanOrEqual(pool.length)
    }
    // The pool used up, the last of it just said: the roll that would pick that one again picks another, and a new cycle starts.
    for (const [at, last] of pool.entries()) {
      const after = tapPicks(tappable(stage, { met: true, heard: [...pool], said: { index: last, at: T0 - 1000 } }), (at + 0.5) / pool.length)
      expect(after.said!.index, `${stage}, ${last} just said`).not.toBe(last)
      expect(pool).toContain(after.said!.index)
      expect(after.heard).toEqual([after.said!.index])
    }
  })

  it('the lean-to line sits at the index the gate leaves out (a reorder must not gate another)', () => {
    expect(BARNABY.tapCamp[LEAN_TO]).toContain('lean-to')
    expect(tapLine(LEAN_TO)).toBe(BARNABY.tapCamp[LEAN_TO])
  })

  it.each([
    ['camp: only the lean-to left', 'camp', CAMP_POOL.slice(0, LEAN_TO), LEAN_TO],
    ['ruin: only the last left, never the lean-to', 'ruin', RUIN_POOL.filter((i) => i !== 16), 16],
  ] as const)('%s, whatever the dice say', (_what, stage, heard, expected) => {
    const s = tappable(stage, { met: true, heard: [...heard], said: null })
    for (const roll of [0, 0.5, 0.9999]) expect(tapPicks(s, roll).said!.index, `roll ${roll}`).toBe(expected)
  })

  it('at the ruin a used-up pool resets over the same 16 lines, so a roll of 0.67 is line 10, not the lean-to', () => {
    const spent = tappable('ruin', { met: true, heard: RUIN_POOL, said: null })
    for (const roll of [0, 0.5, 0.67, 0.9999]) {
      const after = tapPicks(spent, roll)
      expect(after.said!.index, `roll ${roll}`).toBe(RUIN_POOL[Math.floor(roll * 16)])
      expect(after.heard).toEqual([after.said!.index])
    }
  })

  it('moving to the ruin mid-cycle adds the ruin lines to what is left, the lean-to said at the camp being harmless', () => {
    const camped = tapped(tappable('camp'), 12, seeded(5)).state // all twelve camp lines said, then the highland is claimed
    const moved: GameState = { ...camped, owned: { ...camped.owned, highland: 1 }, characters: { ...camped.characters, barnaby: { ...camped.characters.barnaby, stage: 'ruin', movedAt: T0 } } }
    const next = tapped(moved, 5, seeded(6))
    expect(sorted(next.picked)).toEqual([12, 13, 14, 15, 16])
    expect(heardOf(next.state)).toHaveLength(17)
    const again = tapped(next.state, 1, seeded(7)) // used up: starts over with only itself heard
    expect(heardOf(again.state)).toEqual(again.picked)
    expect(again.picked[0]).not.toBe(LEAN_TO)
  })

  it('a line he says is up for 4 s by the game’s clock, and down if the clock is put back', () => {
    const said = { index: 3, at: T0 }
    expect(SAYS_MS).toBe(4000)
    expect(speaking(null, T0)).toBe(false)
    expect([T0, T0 + 2500, T0 + 3999, T0 + 4000, T0 + 60_000, T0 - 1, T0 - DAY].map((now) => speaking(said, now))).toEqual([true, true, true, false, false, false, false])
  })

  it("can't be tapped before he's found or with the characters switched off", () => {
    const refused = (s: GameState) => {
      const r = tapBarnaby(s, T0)
      expect(r).toMatchObject({ ok: false, notices: [] })
      expect(r.state).toBe(s)
    }
    refused(fresh())
    for (const stage of ['camp', 'ruin'] as const) {
      const s = tappable(stage)
      withFeatures({ characters: false }, () => refused(s))
      expect(tapBarnaby(s, T0).ok).toBe(true)
    }
  })
})
