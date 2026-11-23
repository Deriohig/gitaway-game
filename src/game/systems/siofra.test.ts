import { describe, expect, it } from 'vitest'
import { advance } from '../advance'
import type { GiftAnimalId, ItemId } from '../config'
import { BARNABY } from '../content/barnaby'
import { SIOFRA, SIOFRA_NAME, type MomentLine, type SiofraGiftId } from '../content/siofra'
import { VISITORS } from '../content/visitors'
import { xpForLevel } from '../progression'
import type { Notice } from '../result'
import { migrate } from '../save'
import { createInitialState, type GameState, type JournalKind } from '../state'
import { ALL_ON, useFeatures, withFeatures } from '../testing'
import { charactersDue } from './characters'
import { recapEntries } from './journal'
import { advanceSiofra, meetingDue, MOMENT_GAP_DAYS, MOMENT_HOUR, momentDue, momentPool, SHIVER_QUIET_MS, siofraDue, siofraShown, tapSiofra } from './siofra'
import { isPresent, noticeVisitor } from './visitors'

// The days run from Monday 19 October 2026 (tests run with TZ=UTC, so local 06:00 is 06:00Z).
const on = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour, minute)
const MONDAY = on(19, 9)
const TUESDAY_MORNING = on(20, 6) // Barnaby is found...
const FRIDAY_MORNING = on(23, 6) // ...and, camping, has settled three days later.
const HOUR = 3_600_000
const MIN = 60_000

const saved = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const withTZ = (tz: string, fn: () => void) => {
  const old = process.env.TZ
  process.env.TZ = tz
  try {
    fn()
  } finally {
    if (old === undefined) delete process.env.TZ
    else process.env.TZ = old
  }
}

/** A farm at `level` at `now`, owning these things besides what every farm starts with. */
function farmAt(level: number, now = MONDAY, owned: Partial<Record<ItemId, number>> = {}): GameState {
  const s = createInitialState(now)
  return { ...s, xp: xpForLevel(level), levelSeen: level, owned: { ...s.owned, ...owned } }
}
const greeted = (s: GameState, times = 1): GameState => ({ ...s, visitors: { ...s.visitors, seen: { ...s.visitors.seen, hare: times } } })
/** Level 7, meadow owned, hare said hello to: everything she waits for but Barnaby, who is due at the next 06:00. */
const readyFarm = (owned: Partial<Record<ItemId, number>> = {}, now = MONDAY): GameState => greeted(farmAt(7, now, { meadow: 1, ...owned }))
const claim = (s: GameState, piece: ItemId): GameState => ({ ...s, owned: { ...s.owned, [piece]: 1 } })

/** Advances through each time in turn: the state after, and every notice on the way. */
function through(from: GameState, ...times: number[]): { state: GameState; notices: Notice[] } {
  let state = from
  const notices: Notice[] = []
  for (const t of times) {
    const r = advance(state, t)
    state = r.state
    notices.push(...r.notices)
  }
  return { state, notices }
}

const TOAST: Notice = { kind: 'info', title: SIOFRA.met.toast, journal: false }
const toasts = (notices: Notice[]) => notices.filter((n) => n.title === SIOFRA.met.toast)
const plain = ({ at, kind, title, detail }: GameState['journal'][number]) => ({ at, kind, title, detail })
const line = (at: number, { title, detail }: { title: string; detail?: string }, kind: JournalKind = 'character') => ({ at, kind, title, detail })
/** The character lines, oldest first. */
const lines = (s: GameState) => s.journal.filter((e) => e.kind === 'character').reverse().map(plain)
const meetings = (s: GameState) => s.journal.filter((e) => e.title === SIOFRA.met.title).map(plain)
const metAt = (s: GameState) => s.characters.siofra.metAt
const dueAt = (s: GameState) => s.characters.siofra.dueAt
/** She was met at `at`: her one toast and one journal line, and nothing else of hers. */
const expectMet = (r: { state: GameState; notices: Notice[] }, at: number) => {
  expect(metAt(r.state)).toBe(at)
  expect(toasts(r.notices)).toEqual([TOAST])
  expect(meetings(r.state)).toEqual([line(at, SIOFRA.met)])
}
/** She has not been met: no meeting, toast or line. */
const expectUnmet = (r: { state: GameState; notices?: Notice[] }) => {
  expect(metAt(r.state)).toBeNull()
  expect(toasts(r.notices ?? [])).toEqual([])
  expect(meetings(r.state)).toEqual([])
}

describe('meeting Síofra', () => {
  useFeatures(ALL_ON)

  it('waits for each of the four conditions', () => {
    const week = [MONDAY, TUESDAY_MORNING, on(21, 9), on(22, 9), FRIDAY_MORNING, on(24, 6), on(26, 9)]
    expect(metAt(through(readyFarm(), ...week).state)).toBe(FRIDAY_MORNING) // all four: at 06:00 on Friday, once Barnaby has settled
    expect(metAt(through(readyFarm(), MONDAY, TUESDAY_MORNING, on(22, 9), on(23, 5, 59)).state)).toBeNull() // camping less than three days
    for (const farm of [
      greeted(farmAt(5, MONDAY, { meadow: 1 })), // Barnaby never comes below level 6
      greeted(farmAt(7, MONDAY, { meadow: 0 })), // the meadow isn't owned
      farmAt(7, MONDAY, { meadow: 1 }), // the hare was never said hello to
      greeted(farmAt(7, MONDAY, { meadow: 1 }), 0),
    ]) {
      expectUnmet(through(farm, ...week))
    }
  })

  it('meets her at the next 06:00 once all four hold, and never again', () => {
    const before = through(readyFarm(), MONDAY, TUESDAY_MORNING, on(22, 9), on(23, 5, 59))
    expectUnmet(before)
    expect(meetingDue(before.state)).toBe(FRIDAY_MORNING)
    const r = advance(before.state, FRIDAY_MORNING)
    expectMet(r, FRIDAY_MORNING)
    expect(lines(r.state)).toEqual([line(TUESDAY_MORNING, BARNABY.found), line(FRIDAY_MORNING, SIOFRA.met)])
    expectMet({ state: through(r.state, on(23, 9), on(24, 6), on(27, 6)).state, notices: r.notices }, FRIDAY_MORNING)
  })

  it('meets her at the first 06:00 after Barnaby settles, never the morning he is found', () => {
    // Moving up to the ruin at 14:00 on Wednesday settles him: she's met at 06:00 on Thursday.
    const moved = advance(claim(through(readyFarm(), MONDAY, TUESDAY_MORNING).state, 'highland'), on(21, 14)).state
    expect([metAt(moved), meetingDue(moved), dueAt(moved)]).toEqual([null, on(22, 6), on(22, 6)])
    expect(metAt(advance(moved, on(22, 5, 59)).state)).toBeNull()
    expectMet(advance(moved, on(22, 6)), on(22, 6))
    // Straight up to the ruin he is settled the moment he's found, but she waits for the next morning.
    const straight = through(readyFarm({ highland: 1 }), MONDAY, TUESDAY_MORNING, on(20, 12), on(20, 23, 59))
    expectUnmet(straight)
    expect(meetingDue(straight.state)).toBe(on(21, 6))
    expect(metAt(advance(straight.state, on(21, 6)).state)).toBe(on(21, 6))
  })

  it.each([
    ['the hare', farmAt(7, MONDAY, { meadow: 1 }), (s: GameState) => greeted(s)],
    ['the meadow', greeted(farmAt(7, MONDAY, { meadow: 0 })), (s: GameState) => claim(s, 'meadow')],
  ])('waits for the morning after %s comes last, never stamped before it', (_what, farm, grant) => {
    // Barnaby settled at 06:00 on Friday and the rest in place, but this only at 14:00 on Saturday.
    const before = through(farm, MONDAY, TUESDAY_MORNING, FRIDAY_MORNING, on(24, 14))
    expectUnmet(before)
    expect(dueAt(before.state)).toBeNull()
    const after = through(grant(before.state), on(24, 14, 1), on(24, 23), on(25, 5, 59))
    expectUnmet(after)
    expect(dueAt(after.state)).toBe(on(25, 6))
    expectMet(advance(after.state, on(25, 6)), on(25, 6))
    // Before that day's 06:00: met at that 06:00.
    const night = through(farm, MONDAY, TUESDAY_MORNING, FRIDAY_MORNING, on(24, 3)).state
    const early = advance(grant(night), on(24, 3, 1)).state
    expect(metAt(early)).toBeNull()
    expect(dueAt(early)).toBe(on(24, 6))
    expect(metAt(advance(early, on(24, 6)).state)).toBe(on(24, 6))
  })

  it('a farm that already qualifies when the update lands meets her the next morning, not on load', () => {
    // Saved at 20:00 on Friday by a build from before her.
    const old = saved(through(readyFarm(), MONDAY, TUESDAY_MORNING, on(23, 20)).state) as Omit<GameState, 'characters'> & { characters: Partial<GameState['characters']> }
    delete old.characters.siofra
    old.journal = old.journal.filter((e) => e.title !== SIOFRA.met.title)
    const loaded = migrate(old, on(24, 14))!
    expect(metAt(loaded)).toBeNull()
    const r = through(loaded, on(24, 14), on(24, 23), on(25, 5, 59))
    expectUnmet(r)
    expect(dueAt(r.state)).toBe(on(25, 6))
    expectMet(advance(r.state, on(25, 6)), on(25, 6))
  })

  it('puts back a morning left days ahead by a clock that ran ahead, once she could be met', () => {
    const s = through(readyFarm(), MONDAY, TUESDAY_MORNING, on(22, 9)).state
    const withDue = (st: GameState, at: number): GameState => ({ ...st, characters: { ...st.characters, siofra: { ...st.characters.siofra, dueAt: at } } })
    const ahead = withDue(s, on(30, 6))
    expect(siofraDue(ahead, on(22, 10))).toBe(true)
    const r = advance(ahead, on(22, 10)).state
    expect(dueAt(r)).toBe(FRIDAY_MORNING)
    expect(metAt(advance(r, FRIDAY_MORNING).state)).toBe(FRIDAY_MORNING)
    const noHare: GameState = { ...ahead, visitors: { ...ahead.visitors, seen: {} } } // left alone while something she waits for is missing
    expect(siofraDue(noHare, on(22, 10))).toBe(false)
    expect(siofraDue(withDue(s, on(23, 8)), on(22, 10))).toBe(false) // and when less than a day ahead
  })

  it('meets her once, even if the clock goes back', () => {
    const met = through(readyFarm(), MONDAY, TUESDAY_MORNING, FRIDAY_MORNING)
    expectMet(met, FRIDAY_MORNING)
    expectMet({ state: through(met.state, on(22, 9), on(23, 5), FRIDAY_MORNING, on(23, 9), on(24, 6)).state, notices: met.notices }, FRIDAY_MORNING)
    // Loaded by a clock put back to Thursday: the meeting is put back to then, never undone.
    const loaded = migrate(saved(met.state), on(22, 9))!
    expect(metAt(loaded)).toBe(on(22, 9))
    expect(meetings(through(loaded, on(22, 10), FRIDAY_MORNING, on(24, 6)).state)).toHaveLength(1)
  })

  it('meets nobody with characters off', () => {
    const thursday = through(readyFarm(), MONDAY, TUESDAY_MORNING, on(22, 9)).state
    expect(metAt(advance(thursday, FRIDAY_MORNING).state)).toBe(FRIDAY_MORNING) // on, she'd be met on Friday
    withFeatures({ characters: false }, () => {
      const off = through(thursday, FRIDAY_MORNING, on(24, 6), on(26, 9))
      expect(off.state.characters.siofra).toEqual(thursday.characters.siofra)
      expectUnmet(off)
    })
  })

  it('puts back a morning set while the clock ran ahead, even to before the hello that let her be met', () => {
    const settled = through(farmAt(7, MONDAY, { meadow: 1 }), MONDAY, TUESDAY_MORNING, FRIDAY_MORNING).state
    const set = advance(noticeVisitor(hareHere(settled, on(30, 13)), 'hare', on(30, 14)).state, on(30, 14) + 1000).state // clock a week ahead
    expect(dueAt(set)).toBe(on(31, 6))
    const back = advance(set, on(23, 14)).state // clock put right: her morning is put back to Saturday's
    expect(dueAt(back)).toBe(on(24, 6))
    expectMet(advance(back, on(24, 6)), on(24, 6))
  })

  it('meets her at 06:00 local the morning the clocks go back', () => {
    withTZ('Europe/London', () => {
      const start = Date.UTC(2026, 9, 21, 8)
      const found = through(readyFarm({}, start), start, Date.UTC(2026, 9, 22, 5))
      const sunday = Date.UTC(2026, 9, 25, 6) // 06:00 GMT, 25 hours after Saturday's 06:00 BST
      expect(dueAt(found.state)).toBe(sunday)
      const night = through(found.state, Date.UTC(2026, 9, 24, 5, 30), Date.UTC(2026, 9, 25, 1, 30), sunday - 1) // 24½ hours off isn't taken for stale
      expect([metAt(night.state), dueAt(night.state)]).toEqual([null, sunday])
      const r = advance(night.state, sunday)
      expectMet({ state: r.state, notices: [...found.notices, ...night.notices, ...r.notices] }, sunday)
    })
  })

  it('is not due on an idle second', () => {
    const fresh = createInitialState(MONDAY)
    expect(meetingDue(fresh)).toBeNull()
    expect(siofraDue(fresh, MONDAY + 1000)).toBe(false)
    // Waiting for Friday: not due until then, and hers wakes the characters step with nothing of Barnaby's to do.
    const waiting = through(readyFarm(), MONDAY, TUESDAY_MORNING, on(22, 20)).state
    expect([siofraDue(waiting, on(22, 20) + 1000), siofraDue(waiting, FRIDAY_MORNING - 1), siofraDue(waiting, FRIDAY_MORNING)]).toEqual([false, false, true])
    expect([charactersDue(waiting, FRIDAY_MORNING - 1), charactersDue(waiting, FRIDAY_MORNING)]).toEqual([false, true])
    // Scheduling her is something to do: all four hold, and no morning is set yet.
    const unscheduled = through(farmAt(7, MONDAY, { meadow: 1 }), MONDAY, TUESDAY_MORNING).state
    expect(siofraDue(unscheduled, on(20, 7))).toBe(false)
    expect(siofraDue(greeted(unscheduled), on(20, 7))).toBe(true)
    const scheduled = advance(greeted(unscheduled), on(20, 7)).state
    expect(dueAt(scheduled)).toBe(FRIDAY_MORNING)
    expect([siofraDue(scheduled, on(20, 7) + 1000), charactersDue(scheduled, on(20, 7) + 1000)]).toEqual([false, false])
    const met = advance(waiting, FRIDAY_MORNING).state // once met, only her moments' 18:00 posts wake the step
    expect([siofraDue(met, FRIDAY_MORNING + 1000), siofraDue(advance(met, on(24, 6)).state, on(24, 6) + 1000)]).toEqual([false, false])
  })
})

// ---------------------------------------------------------------------------
// Her moments

/** 18:00 on a day of October 2026 (the 32nd is the 1st of November). */
const evening = (day: number, minute = 0) => on(day, 18, minute)
const evenings = (day: number, n: number) => Array.from({ length: n }, (_, i) => evening(day + i))
/** Every `by` from `from` to `to`, both included. */
const every = (from: number, to: number, by: number) => Array.from({ length: Math.floor((to - from) / by) + 1 }, (_, i) => from + i * by)

const MOMENT_LINES: readonly MomentLine[] = [...SIOFRA.glimpses, ...SIOFRA.shapes, ...SIOFRA.cropsLeftStanding, ...Object.values(SIOFRA.gifts)]
const MOMENT_ID = new Map(MOMENT_LINES.map((l) => [l.title, l.id]))
const lineOf = (id: string) => MOMENT_LINES.find((l) => l.id === id)!
const GIFT_OF = new Map(Object.entries(SIOFRA.gifts).map(([gift, l]) => [l.id, gift as SiofraGiftId]))
const ids = (pool: readonly MomentLine[]) => pool.map((l) => l.id)
const GLIMPSES = ids(SIOFRA.glimpses)
const SHAPES = ids(SIOFRA.shapes)
const UNGATED = ids(SIOFRA.shapes.filter((l) => l.needs === null))
const NOTICES = ids(SIOFRA.cropsLeftStanding)
const GIFT_LINES = ids(Object.values(SIOFRA.gifts))
const ALL_GIFTS = Object.keys(SIOFRA.gifts) as SiofraGiftId[]

/** Her moment lines in the journal, oldest first. */
const moments = (s: GameState) =>
  s.journal
    .filter((e) => MOMENT_ID.has(e.title))
    .reverse()
    .map((e) => ({ at: e.at, kind: e.kind, id: MOMENT_ID.get(e.title)! }))
const momentTimes = (s: GameState) => moments(s).map((m) => m.at)
const oneMoment = (at: number, kind: JournalKind = 'character', id: unknown = expect.any(String)) => [{ at, kind, id }]

const withSiofra = (s: GameState, patch: Partial<GameState['characters']['siofra']>): GameState => ({ ...s, characters: { ...s.characters, siofra: { ...s.characters.siofra, ...patch } } })
/** Met at `at` (06:00 on Monday 19th unless given). */
const met = (s: GameState, at = on(19, 6)) => withSiofra(s, { dueAt: at, metAt: at })
const hareHere = (s: GameState, at: number): GameState => ({ ...s, visitors: { ...s.visitors, present: [{ id: 'hare', arrivedAt: at }] } })
const shiverAt = (s: GameState, at: number): GameState => ({ ...s, characters: { ...s.characters, shiver: { at, size: 'small' } } })
const lookedAt = (s: GameState, at: number): GameState => ({ ...s, seenAt: at })

/** Level 7, meadow owned, hare said hello to, Barnaby away: she isn't met and can't be, so her step sees only to moments. */
const hareFarm = (owned: Partial<Record<ItemId, number>> = {}): GameState => greeted(farmAt(7, MONDAY, { meadow: 1, ...owned }))
/** As `hareFarm`, owning only these besides the meadow (not even chickens), every bed growing and ripe in a year. */
function bareFarm(owned: Partial<Record<ItemId, number>> = {}): GameState {
  const s = hareFarm({ chicken: 0, ...owned })
  return { ...s, plots: s.plots.map((p) => ({ ...p, crop: 'radish', plantedAt: MONDAY, readyAt: MONDAY + 365 * 24 * HOUR, notified: false })) }
}
const bed = (s: GameState, patch: Partial<GameState['plots'][number]>): GameState => ({ ...s, plots: s.plots.map((p, i) => (i === 0 ? { ...p, ...patch } : p)) })
/** Her last moment came at 18:00 on Monday 19th and was seen at `seen`: the next is due at 18:00 on Thursday 22nd. */
const afterMonday = (seen: number) => lookedAt(withSiofra(met(hareFarm()), { momentAt: evening(19), checkedAt: evening(19), lastMoment: 'shape-goat' }), seen)

/**
 * Her step alone at each time in turn, as the characters step runs it, checking each time that `siofraDue` said
 * whether it would change anything, and that it told nothing. With `looking`, the player sees everything up to each time.
 */
function steps(from: GameState, times: readonly number[], looking = false): GameState {
  let s = from
  for (const t of times) {
    const next = structuredClone(s)
    const out: Notice[] = []
    const changed = advanceSiofra(next, t, out)
    expect(siofraDue(s, t), `due at ${new Date(t).toISOString()}`).toBe(changed)
    expect(out).toEqual([])
    s = changed ? next : s
    if (looking) s = lookedAt(s, t)
  }
  return s
}

describe('her moments', () => {
  useFeatures(ALL_ON)

  it('posts at 18:00, two or three days apart', () => {
    expect([MOMENT_HOUR, MOMENT_GAP_DAYS]).toEqual([18, [2, 3]])
    const s = steps(met(hareFarm()), every(MONDAY, evening(38), 30 * MIN), true)
    expect(momentTimes(s)).toEqual([evening(19), evening(22), evening(25), evening(28), evening(31), evening(34), evening(36)])
    expect(momentDue(s)).toBe(evening(39))
    // The gap depends on the date alone, not the time of day.
    const after = (at: number) => momentDue(withSiofra(hareFarm(), { momentAt: at }))
    expect([after(evening(20)), after(on(20, 0, 1)), after(on(22, 23, 59))]).toEqual([evening(22), evening(22), evening(25)])
    // Not a minute before 18:00.
    const thursday = steps(met(hareFarm()), [...every(MONDAY, on(22, 17), HOUR), on(22, 17, 59)], true)
    expect(momentTimes(thursday)).toEqual([evening(19)])
    expect(momentTimes(steps(thursday, [evening(22)]))).toEqual([evening(19), evening(22)])
  })

  it('holds a moment back for 15 minutes after a shiver, then posts it the same evening', () => {
    expect(SHIVER_QUIET_MS).toBe(15 * MIN)
    const due = afterMonday(on(22, 17))
    expect(momentDue(due)).toBe(evening(22))
    const shivered = shiverAt(due, on(22, 17, 50)) // nothing at 18:00, nor until 18:05...
    const held = steps(shivered, every(on(22, 17, 51), evening(22, 4), MIN), true)
    expect(moments(held)).toEqual([])
    expect(held.characters.siofra.checkedAt).toBe(evening(19))
    const posted = steps(held, [evening(22, 5)], true) // ...then the moment, stamped then; the gap counts from it
    expect(moments(posted)).toEqual(oneMoment(evening(22, 5)))
    expect(posted.characters.siofra).toMatchObject({ momentAt: evening(22, 5), checkedAt: evening(22) })
    expect(momentDue(posted)).toBe(evening(25))
    // A shiver at 18:00 holds it until 18:15; one 16 minutes before doesn't hold it at all.
    expect(momentTimes(steps(shiverAt(due, evening(22)), every(evening(22), evening(22, 15), MIN), true))).toEqual([evening(22, 15)])
    expect(momentTimes(steps(shiverAt(due, on(22, 17, 44)), [evening(22)], true))).toEqual([evening(22)])
    // A shiver ahead of the clock (since put back) holds nothing.
    expect(momentTimes(steps(shiverAt(due, on(25, 12)), [evening(22)], true))).toEqual([evening(22)])
  })

  it('keeps one moment waiting after an absence, not several', () => {
    const left = afterMonday(on(19, 20)) // closed until 09:00 on Friday 30th
    const back = advance(left, on(30, 9)).state
    expect(moments(back)).toEqual(oneMoment(evening(29)))
    expect(back.characters.siofra).toMatchObject({ momentAt: evening(29), checkedAt: evening(29) })
    expect(momentDue(back)).toBe(evening(32))
    expect(recapEntries(back, left.seenAt).filter((e) => MOMENT_ID.has(e.title))).toHaveLength(1)
    const nightly = steps(left, [...evenings(22, 8), on(30, 9)]) // seen to evening by evening while away: only the first that was due
    expect(momentTimes(nightly)).toEqual([evening(22)])
  })

  it('posts nothing when nothing is eligible', () => {
    const week = every(MONDAY, evening(26), HOUR)
    const unmet = farmAt(7, MONDAY, { meadow: 1 }) // never said hello to the hare
    expect(momentDue(unmet)).toBeNull()
    expect(steps(unmet, week, true).characters.siofra).toEqual(unmet.characters.siofra)
    const waiting = hareHere(hareFarm(), MONDAY) // the hare waiting at every post before she's met
    const s = steps(waiting, week, true)
    expect(moments(s)).toEqual([])
    expect(s.journal).toEqual(waiting.journal)
    expect(s.characters.siofra).toMatchObject({ momentAt: null, lastMoment: null, checkedAt: evening(26) })
    expect(siofraDue(s, evening(26) + 1000)).toBe(false)
    expect(momentPool(met(hareFarm(), on(23, 6)), evening(22))).toEqual([]) // a post from before her meeting
  })

  it("glimpses only after the hare's first visit, never while the hare is waiting, and stops once she's met", () => {
    const before = steps(hareHere(farmAt(7, MONDAY, { meadow: 1 }), MONDAY), every(MONDAY, on(20, 13), HOUR), true)
    expect(moments(before)).toEqual([])
    const hello = noticeVisitor(before, 'hare', on(20, 14)) // nothing of hers until it's said hello to
    expect(hello.ok).toBe(true)
    // The first, a visitor-line glimpse, comes at the next 18:00, after the hello's own line.
    const s = steps(hello.state, [on(20, 14, 1), ...every(on(20, 15), evening(20), HOUR)], true)
    const glimpse = moments(s)
    expect(glimpse).toEqual(oneMoment(evening(20), 'visitor', expect.stringMatching(/^glimpse-/)))
    expect(s.journal.find((e) => e.title === VISITORS.hare.says[0])!.at).toBeLessThan(glimpse[0].at)
    // The next is due Thursday, but the hare is back at noon and waiting: nothing until it's said hello to again.
    expect(momentDue(s)).toBe(evening(22))
    const waiting = steps(hareHere(s, on(22, 12)), every(on(22, 12), on(23, 9), HOUR), true)
    expect(moments(waiting)).toHaveLength(1)
    expect(momentPool(waiting, evening(22))).toEqual([])
    const next = steps(noticeVisitor(waiting, 'hare', on(23, 10)).state, every(on(23, 11), evening(23), HOUR), true)
    expect(moments(next).map((m) => [m.at, m.kind])).toEqual([[evening(20), 'visitor'], [evening(23), 'visitor']])
    // Shapes can come now as well as glimpses; before any moment, only glimpses.
    expect(ids(momentPool(next, evening(25)))).toEqual(expect.arrayContaining([...GLIMPSES, ...UNGATED].filter((id) => id !== next.characters.siofra.lastMoment)))
    expect(ids(momentPool(hareFarm(), evening(19)))).toEqual(GLIMPSES)
    // Once she's met, the glimpses stop.
    const after = steps(met(next, on(24, 6)), evenings(24, 40), true)
    const since = moments(after).filter((m) => m.at > on(24, 6))
    expect(since.length).toBeGreaterThan(10)
    expect(since.filter((m) => GLIMPSES.includes(m.id))).toEqual([])
    expect(ids(momentPool(after, evening(70))).filter((id) => GLIMPSES.includes(id))).toEqual([])
  })

  it("gates each shape on what's owned", () => {
    const shapesIn = (s: GameState) => ids(momentPool(s, evening(22))).filter((id) => SHAPES.includes(id))
    for (const [owned, expected] of [
      [{}, UNGATED],
      [{ sheep: 1 }, ['shape-sheep', ...UNGATED]],
      [{ scarecrow: 1 }, ['shape-goat', 'shape-crow', 'shape-duck', 'shape-stone', 'shape-hedge']],
      [{ fruitTree: 1 }, ['shape-goat', 'shape-fruit-tree', 'shape-duck', 'shape-stone', 'shape-hedge']],
      [{ chicken: 1 }, ['shape-goat', 'shape-duck', 'shape-chicken', 'shape-stone', 'shape-hedge']],
      [{ sheep: 2, scarecrow: 1, fruitTree: 3, chicken: 2 }, SHAPES],
    ] as [Partial<Record<ItemId, number>>, string[]][]) {
      expect(shapesIn(met(bareFarm(owned))), JSON.stringify(owned)).toEqual(expected)
    }
    expect(shapesIn(withSiofra(bareFarm({ sheep: 1 }), { momentAt: evening(19), lastMoment: 'glimpse-1' }))).toEqual(['shape-sheep', ...UNGATED]) // before she's met, once a glimpse has come
  })

  it('posts the notice only while a crop is ripe or soil is resting', () => {
    const post = evening(22)
    const noticesIn = (s: GameState) => ids(momentPool(s, post)).filter((id) => NOTICES.includes(id))
    const growing = met(bareFarm())
    expect(noticesIn(growing)).toEqual([])
    expect(noticesIn(bed(growing, { readyAt: post }))).toEqual(['notice-ripe-1', 'notice-ripe-2']) // ripe by the post...
    expect(noticesIn(bed(growing, { readyAt: post + 1 }))).toEqual([]) // ...not a moment later
    const resting = bed(growing, { crop: null, plantedAt: null, readyAt: null })
    expect(noticesIn(resting)).toEqual(['notice-resting'])
    expect(noticesIn({ ...resting, plots: resting.plots.map((p, i) => (i === 1 ? { ...p, readyAt: on(22, 9) } : p)) })).toEqual(NOTICES)
    expect(noticesIn(withSiofra(bed(bareFarm(), { crop: null, plantedAt: null, readyAt: null }), { momentAt: evening(19) }))).toEqual([]) // never before she's met
    expect(moments(steps(resting, evenings(19, 60), true)).some((m) => m.id === 'notice-resting')).toBe(true) // posted while soil rests
  })

  it('gives each gift once and never counts them', () => {
    const s = steps(met(hareFarm()), evenings(19, 120), true)
    const gifts = moments(s).filter((m) => GIFT_LINES.includes(m.id))
    expect([...gifts.map((m) => m.id)].sort()).toEqual([...GIFT_LINES].sort()) // all five, each once
    expect(s.characters.siofra.given).toEqual(gifts.map((m) => GIFT_OF.get(m.id))) // in the order given
    expect(s.keepsakes).toEqual(hareFarm().keepsakes)
    for (const g of gifts) {
      const e = s.journal.find((j) => j.title === lineOf(g.id).title)!
      expect(e).toMatchObject({ kind: 'character', detail: lineOf(g.id).detail })
      expect(`${e.title} ${e.detail}`).not.toMatch(/\d/)
    }
    expect(ids(momentPool(s, evening(140))).filter((id) => GIFT_LINES.includes(id))).toEqual([])
    expect(ids(momentPool(met(hareFarm()), evening(19))).filter((id) => GIFT_LINES.includes(id))).toEqual(GIFT_LINES)
    expect(ids(momentPool(withSiofra(met(hareFarm()), { given: ['clover'] }), evening(19)))).not.toContain(SIOFRA.gifts.clover.id)
  })

  it('never plays the same line twice running, whichever pool', () => {
    const run = moments(steps(met(bareFarm()), evenings(19, 200), true)).map((m) => m.id) // the fewest lines: four shapes once the gifts are given
    expect(run.length).toBeGreaterThan(60)
    run.slice(1).forEach((id, i) => expect(id, `moment ${i + 1}`).not.toBe(run[i]))
    expect(new Set(run).size).toBeLessThan(run.length)
    expect(ids(momentPool(withSiofra(hareFarm(), { lastMoment: 'glimpse-2' }), evening(22)))).toEqual(GLIMPSES.filter((id) => id !== 'glimpse-2'))
    for (const last of ['shape-goat', 'notice-resting', 'gift-pebble']) {
      const pool = ids(momentPool(withSiofra(met(hareFarm()), { lastMoment: last }), evening(22)))
      expect(pool, last).not.toContain(last)
      expect(pool.length, last).toBeGreaterThan(0)
    }
  })

  it('writes visitor lines before the meeting and character lines after', () => {
    let s = readyFarm() // played every half hour, saying hello to the hare whenever it's waiting
    const notices: Notice[] = []
    for (const t of every(MONDAY, on(31, 9), 30 * MIN)) {
      if (isPresent(s, 'hare')) s = noticeVisitor(s, 'hare', t).state
      const r = advance(s, t)
      notices.push(...r.notices)
      s = lookedAt(r.state, t)
    }
    expect(metAt(s)).toBe(FRIDAY_MORNING)
    const before = moments(s).filter((m) => m.at < FRIDAY_MORNING)
    const after = moments(s).filter((m) => m.at > FRIDAY_MORNING)
    expect(before.length).toBeGreaterThan(0)
    expect(after.length).toBeGreaterThan(0)
    expect(before.map((m) => m.kind)).toEqual(before.map(() => 'visitor'))
    expect(after.map((m) => m.kind)).toEqual(after.map(() => 'character'))
    for (const m of before) expect(`${lineOf(m.id).title} ${lineOf(m.id).detail}`).not.toContain(SIOFRA_NAME) // nothing before the meeting names her
    expect(toasts(notices)).toEqual([TOAST]) // her only notice: moments are journal lines and nothing else
    expect(notices.filter((n) => MOMENT_ID.has(n.title))).toEqual([])
  })

  it('still posts at 18:00 local across a daylight-saving change', () => {
    withTZ('Europe/London', () => {
      const run = (last: number, until: number) => {
        const s = lookedAt(withSiofra(met(hareFarm()), { momentAt: last, checkedAt: last, lastMoment: 'shape-goat' }), last)
        return momentTimes(steps(s, every(last + 30 * MIN, until, 30 * MIN), true))
      }
      // Autumn: last at 18:00 BST on Fri 23 Oct; two local days on is 18:00 GMT on the Sunday (25 hours after Saturday's), then three more.
      const a = run(Date.UTC(2026, 9, 23, 17), Date.UTC(2026, 9, 29, 12))
      expect(a).toEqual([Date.UTC(2026, 9, 25, 18), Date.UTC(2026, 9, 28, 18)])
      // Spring: last at 18:00 GMT on Fri 26 Mar 2027; 18:00 BST on the Sunday (23 hours after Saturday's), then two more.
      const b = run(Date.UTC(2027, 2, 26, 18), Date.UTC(2027, 2, 31, 12))
      expect(b).toEqual([Date.UTC(2027, 2, 28, 17), Date.UTC(2027, 2, 30, 17)])
      for (const at of [...a, ...b]) expect(new Date(at).getHours()).toBe(18)
    })
  })

  it("always has an ungated shape to post once she's met, with nothing owned and every gift given", () => {
    const bare = withSiofra(met(bareFarm()), { given: ALL_GIFTS })
    expect(ids(momentPool(bare, evening(19)))).toEqual(UNGATED)
    for (const last of UNGATED) expect(ids(momentPool(withSiofra(bare, { lastMoment: last }), evening(19)))).toEqual(UNGATED.filter((id) => id !== last))
  })
})

// ---------------------------------------------------------------------------
// Her figure and taps

const ALL_TAPS = SIOFRA.taps.map((_, i) => i)
const FREE_TAPS = SIOFRA.taps.flatMap((t, i) => (t.needs === undefined ? [i] : []))
const needing = (need: 'cat' | 'duck') => SIOFRA.taps.flatMap((t, i) => (t.needs === need ? [i] : []))

/** A seeded generator (mulberry32), so a "random" run of taps is the same every run. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const TAP_AT = on(23, 9)

/** Met at 06:00 on Friday, with `duck` ducks, and given these of the cat and the dog. */
const tappable = ({ duck = 0, gifts = [] }: { duck?: number; gifts?: GiftAnimalId[] } = {}): GameState => ({ ...met(readyFarm({ duck }), FRIDAY_MORNING), gifts })

/** Taps her `n` times a second apart: the state after, and the line each tap picked. */
function tappedHer(from: GameState, n: number, rand: () => number): { state: GameState; picked: number[] } {
  let state = from
  const picked: number[] = []
  for (let i = 0; i < n; i++) {
    const r = tapSiofra(state, TAP_AT + i * 1000, rand)
    expect(r.ok, `tap ${i + 1}`).toBe(true)
    state = r.state
    picked.push(state.characters.siofra.said!.index)
  }
  return { state, picked }
}

describe('tapping Síofra', () => {
  useFeatures(ALL_ON)

  it('plays her whole pool, with no fixed first line, never the same line twice running', () => {
    expect(SIOFRA.taps).toHaveLength(15) // twelve lines and three naps, with the cat and a duck for the two that need them
    const s = tappable({ duck: 1, gifts: ['cat'] })
    expect(s.characters.siofra).toMatchObject({ met: false, heard: [], said: null })
    const first = (roll: number) => tapSiofra(s, TAP_AT, () => roll).state.characters.siofra
    expect([0, 0.5, 0.9999].map((roll) => first(roll).said!.index)).toEqual([0, 7, 14])
    expect(first(0.5)).toMatchObject({ met: true, heard: [7], said: { index: 7, at: TAP_AT } })
    for (const seed of [1, 7, 2026]) {
      const round = tappedHer(s, 15, seeded(seed))
      expect(sorted(round.picked), `seed ${seed}`).toEqual(ALL_TAPS) // each line once before any comes round again
      const more = tappedHer(round.state, 100, seeded(seed + 1))
      const all = [...round.picked, ...more.picked]
      expect(all.flatMap((index, i) => (i > 0 && index === all[i - 1] ? [i] : [])), `seed ${seed}`).toEqual([])
      expect(new Set(more.picked), `seed ${seed}`).toEqual(new Set(ALL_TAPS))
    }
  })

  it('waits for the cat before the windowsill nap, and for a duck before the duckling', () => {
    expect(needing('cat').map((i) => SIOFRA.taps[i].line)).toEqual([expect.stringContaining("cat's windowsill")])
    expect(needing('duck').map((i) => SIOFRA.taps[i].line)).toEqual([expect.stringContaining('duckling')])
    expect(FREE_TAPS).toHaveLength(13)
    const heard = (s: GameState, seed: number) => new Set(tappedHer(s, 60, seeded(seed)).picked)
    for (const seed of [1, 7]) {
      for (const [opts, expected] of [
        [{}, FREE_TAPS], // the dog is no cat
        [{ gifts: ['dog'] }, FREE_TAPS],
        [{ gifts: ['dog', 'cat'] }, [...FREE_TAPS, ...needing('cat')]],
        [{ duck: 2 }, [...FREE_TAPS, ...needing('duck')]],
        [{ duck: 1, gifts: ['cat'] }, ALL_TAPS],
      ] as [Parameters<typeof tappable>[0], number[]][]) {
        expect(heard(tappable(opts), seed), `seed ${seed} ${JSON.stringify(opts)}`).toEqual(new Set(expected))
      }
    }
    const last = FREE_TAPS[FREE_TAPS.length - 1] // everything she can say heard, the last just said: a new round starts, whatever the dice say
    const spent = withSiofra(tappable(), { met: true, heard: [...FREE_TAPS], said: { index: last, at: TAP_AT - 1000 } })
    for (const roll of [0, 0.9999]) expect(tapSiofra(spent, TAP_AT, () => roll).state.characters.siofra.said!.index).not.toBe(last)
    expect(tapSiofra({ ...spent, gifts: ['cat'] }, TAP_AT, () => 0).state.characters.siofra.said!.index).toBe(needing('cat')[0]) // with the cat, the windowsill is what's left
  })

  it("can't be tapped, and isn't shown, before she's met, with the characters off, or while the hare is here", () => {
    const refused = (s: GameState) => {
      const r = tapSiofra(s, TAP_AT)
      expect(r).toMatchObject({ ok: false, notices: [] })
      expect(r.state).toBe(s)
    }
    refused(readyFarm())
    refused(through(readyFarm(), MONDAY, TUESDAY_MORNING, on(23, 5, 59)).state)
    refused(hareHere(tappable(), on(23, 8)))
    const s = tappable()
    withFeatures({ characters: false }, () => refused(s))
    expect(tapSiofra(s, TAP_AT).ok).toBe(true)
    expect(siofraShown(readyFarm())).toBe(false)
    expect(siofraShown(s)).toBe(true)
    expect(siofraShown({ ...s, owned: { ...s.owned, meadow: 0 } })).toBe(false)
    withFeatures({ characters: false }, () => expect(siofraShown(s)).toBe(false))
    withFeatures({ visitors: false }, () => expect(siofraShown(hareHere(s, on(23, 8)))).toBe(true)) // a hare left in the save, visitors off: not drawn, so she is
  })

  it('keeps her figure hidden while the hare is here, even on her meeting morning', () => {
    // The hare comes back on Thursday evening, still waiting, unnoticed, when she's met at 06:00 on Friday.
    const before = through(readyFarm(), MONDAY, TUESDAY_MORNING, on(22, 9))
    const morning = through(hareHere(before.state, on(22, 19)), FRIDAY_MORNING, on(23, 9), on(23, 17))
    expect(isPresent(morning.state, 'hare')).toBe(true)
    expect(siofraShown(morning.state)).toBe(false)
    expect(tapSiofra(morning.state, on(23, 17)).ok).toBe(false)
    expectMet({ state: morning.state, notices: [...before.notices, ...morning.notices] }, FRIDAY_MORNING)
    // Said hello to, the hare goes and she's at the field edge: no second toast.
    const hello = noticeVisitor(morning.state, 'hare', on(23, 17, 30))
    expect(hello.ok).toBe(true)
    expect(toasts(hello.notices)).toEqual([])
    expect(siofraShown(hello.state)).toBe(true)
    // She stays until the hare comes back of its own accord (within the week), and then she's gone again.
    let s = hello.state
    let t = on(23, 17, 30)
    while (!isPresent(s, 'hare') && t < on(30, 18)) {
      expect(siofraShown(s), new Date(t).toISOString()).toBe(true)
      t += HOUR
      s = advance(s, t).state
    }
    expect(isPresent(s, 'hare')).toBe(true)
    expect(siofraShown(s)).toBe(false)
  })
})

function sorted(xs: number[]) {
  return [...xs].sort((a, b) => a - b)
}
