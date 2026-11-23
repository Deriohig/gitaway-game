import { describe, expect, it } from 'vitest'
import { advance } from '../advance'
import type { ItemId } from '../config'
import { BARNABY, type LandPiece } from '../content/barnaby'
import { LETTERS, type LetterId } from '../content/letters'
import { xpForLevel } from '../progression'
import { createInitialState, type GameState } from '../state'
import { ALL_ON, withFeatures, type Switches } from '../testing'
import {
  hasUnread,
  latestPost,
  letterDue,
  lettersForTab,
  mailDue,
  needMet,
  postTimeOn,
  readLetter,
  unlockedNotes,
} from './mail'

// The days are in October 2026; tests run with TZ=UTC, so local 08:00 is 08:00Z.
const at = (d: number, h: number, m = 0) => Date.UTC(2026, 9, d, h, m)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const LAND = Object.keys(BARNABY.land) as LandPiece[]
const iso = (t: number) => new Date(t).toISOString()
const local = (...args: [number, number, number, number?, number?]) => new Date(...args).getTime()

/** A farm Barnaby is on (camping, found 06:00 Monday 19 October, land seen already), owning these things besides the start. */
function farm(barnaby: Partial<GameState['characters']['barnaby']> = {}, owned: Partial<Record<ItemId, number>> = {}, now = at(19, 6)): GameState {
  const s = createInitialState(now)
  s.owned = { ...s.owned, ...owned }
  s.characters.barnaby = { ...s.characters.barnaby, stage: 'camp', dueAt: at(19, 6), foundAt: at(19, 6), sawLand: LAND.filter((p) => s.owned[p] > 0), ...barnaby }
  return s
}

/** Camping since 06:00 on the 19th: settled at 06:00 on the 22nd, so the first letter is due at 08:00 on the 23rd. */
const camp = (owned: Partial<Record<ItemId, number>> = { islet: 1, meadow: 1 }) => farm({}, owned)

/** Advances to `now` as a player who is about (last seen two minutes before; a letter is never stamped at or before `seenAt`). */
const step = (s: GameState, now: number, seenAt = now - 2 * 60_000, switches: Switches = ALL_ON): GameState =>
  withFeatures(switches, () => advance({ ...s, seenAt }, now).state)

const letterLines = (s: GameState) => s.journal.filter((e) => e.kind === 'letter')
const letterAts = (s: GameState) => s.mail.letters.map((l) => l.at)
const ids = (letters: GameState['mail']['letters']) => letters.map((l) => l.id)

describe('the morning post', () => {
  it.each([
    ['in camp, the morning after he settles', camp(), at(23, 7, 59), at(23, 8, 1), at(23, 8)],
    ['straight in the ruin, the morning after he is found', farm({ stage: 'ruin', movedAt: at(19, 6) }, { islet: 1, meadow: 1, highland: 1 }), at(20, 7, 59), at(20, 8, 1), at(20, 8)],
  ])('sends the first letter at 08:00 %s', (_, s0, before, after, sentAt) => {
    const early = step(s0, before)
    expect(early.mail.letters).toEqual([])
    const s = step(early, after)
    expect(s.mail.letters).toHaveLength(1)
    expect(s.mail.letters[0]).toMatchObject({ at: sentAt, read: false })
    expect(Object.keys(LETTERS)).toContain(s.mail.letters[0].id)
  })

  it('waits three days between letters', () => {
    let s = step(camp(), at(23, 8, 1))
    for (const t of [at(23, 20), at(24, 8, 1), at(25, 8, 1), at(25, 23)]) {
      s = step(s, t)
      expect(letterAts(s), iso(t)).toEqual([at(23, 8)])
    }
    s = step(s, at(26, 8, 1))
    expect(letterAts(s)).toEqual([at(23, 8), at(26, 8)])
    expect(new Set(ids(s.mail.letters)).size).toBe(2)
  })

  it("opens each gate as the spec's table says", () => {
    const s = createInitialState(at(19, 6))
    const post = at(24, 8) // only Síofra's gate reads the post time
    const owning = (...pieces: ItemId[]): GameState => ({ ...s, owned: { ...s.owned, ...Object.fromEntries(pieces.map((p) => [p, 1])) } })
    for (const piece of ['wetland', 'islet', 'grove'] as const) {
      expect([needMet(s, piece, post), needMet(owning(piece), piece, post), needMet(owning(...LAND.filter((p) => p !== piece)), piece, post)], piece).toEqual([false, true, false])
    }
    // Two pieces of new land, whichever they are; things that aren't land don't count.
    for (const [owned, met] of [[[], false], [['meadow'], false], [['meadow', 'windmill', 'fence'], false], [['meadow', 'orchardLand'], true], [['cottageLand', 'highland'], true]] as const) {
      expect(needMet(owning(...owned), 'twoPiecesDocked', post), owned.join()).toBe(met)
    }
    // Living in the ruin, however he got there.
    expect(needMet(farm(), 'inRuin', post)).toBe(false)
    for (const movedAt of [at(20, 9), at(19, 6)]) expect(needMet(farm({ stage: 'ruin', movedAt }, { highland: 1 }), 'inRuin', post)).toBe(true)
    // Not before Síofra is met, nor until Fin is built, whatever the farm has.
    const everything = farm({ stage: 'ruin', movedAt: at(19, 6) }, Object.fromEntries(LAND.map((p) => [p, 1])))
    expect([needMet(everything, 'siofraMet', post), needMet(everything, 'finOnJetty', post)]).toEqual([false, false])
  })

  it('holds the note about Síofra until three local days after she is met, then sends it', () => {
    const s = camp({})
    expect(needMet(s, 'siofraMet', at(30, 8))).toBe(false)
    // Met at 06:00 on the 23rd: not that morning's post, nor the next two days', at whatever hour.
    s.characters.siofra = { ...s.characters.siofra, dueAt: at(23, 6), metAt: at(23, 6) }
    for (const post of [at(23, 8), at(25, 8), at(25, 23, 59)]) expect([needMet(s, 'siofraMet', post), unlockedNotes(s, post)], iso(post)).toEqual([false, []])
    expect([needMet(s, 'siofraMet', at(26, 8)), unlockedNotes(s, at(26, 8))]).toEqual([true, ['siofra-readings']])
    // Counted by the date she was met, whatever the hour: met late on the 23rd, it's still the 26th.
    expect(needMet({ ...s, characters: { ...s.characters, siofra: { ...s.characters.siofra, metAt: at(23, 23, 30) } } }, 'siofraMet', at(26, 8))).toBe(true)
    // In the post: three silent mornings, then the note.
    let t = s
    for (const now of [at(23, 8, 1), at(24, 8, 1), at(25, 8, 1)]) {
      t = step(t, now)
      expect(t.mail.letters, iso(now)).toEqual([])
    }
    t = step(t, at(26, 8, 1))
    expect(t.mail.letters).toEqual([{ id: 'siofra-readings', at: at(26, 8), read: false }])
    expect(letterLines(t).map((e) => e.at)).toEqual([at(26, 8)])
  })

  it('brings one letter, not a backlog, after a long absence or a long-settled farm, however it is stepped', () => {
    // Back at 10:00 thirty days on: the next gap counts from the one letter.
    const back = step(camp(), at(23, 8) + 30 * DAY + 2 * HOUR, at(23, 7))
    expect([letterAts(back), letterLines(back).map((e) => e.at), letterDue(back)]).toEqual([[at(23, 8) + 30 * DAY], [at(23, 8) + 30 * DAY], at(23, 8) + 33 * DAY])
    // Twenty days, a step a day, and nobody looking.
    let stepped: GameState = { ...camp(), seenAt: at(23, 7) }
    for (let day = 0; day < 20; day++) stepped = withFeatures(ALL_ON, () => advance(stepped, at(23, 9) + day * DAY).state)
    expect([stepped.seenAt, stepped.mail.letters.length, letterLines(stepped).length]).toEqual([at(23, 7), 1, 1])
    // Updated to a build with letters, last played yesterday; he was found sixty days ago.
    const now = at(25, 10)
    let old = step(farm({ foundAt: now - 60 * DAY, dueAt: now - 60 * DAY }, { islet: 1, meadow: 1 }), now, now - DAY)
    expect(letterAts(old)).toEqual([at(25, 8)])
    for (const t of [now + 60_000, at(25, 20), at(26, 9), at(27, 9)]) old = step(old, t)
    expect(old.mail.letters).toHaveLength(1)
  })

  it('sends each note once and stops in silence', () => {
    let s = farm({ stage: 'ruin', foundAt: at(19, 6), movedAt: at(19, 6) }, { wetland: 1, islet: 1, grove: 1, highland: 1 })
    for (let day = 1; day <= 60; day++) s = step(s, at(19, 9) + day * DAY, at(19, 9) + day * DAY)
    const sent = ids(s.mail.letters)
    expect(new Set(sent).size).toBe(8)
    expect(sent).toHaveLength(8)
    expect(sent).not.toContain('siofra-readings')
    expect(sent).not.toContain('fin')
    // Each follow-up after the note it follows.
    for (const [i, id] of sent.entries()) {
      const after = LETTERS[id].after
      if (after) expect(sent.indexOf(after), id).toBeLessThan(i)
    }
    // Nothing more, however long it goes on.
    const later = step(s, at(19, 9) + 90 * DAY, at(19, 9) + 90 * DAY)
    expect([later.mail.letters, letterLines(later).length]).toEqual([s.mail.letters, 8])
  })

  it('posts at 08:00 local across a daylight-saving change', () => {
    const tz = process.env.TZ
    process.env.TZ = 'Europe/London'
    try {
      // The clocks go back at 02:00 on Sunday 25 October 2026, and forward at 01:00 on Sunday 29 March 2026.
      const ruin = (t: number) => farm({ stage: 'ruin', dueAt: t, foundAt: t, movedAt: t }, { islet: 1, highland: 1 }, t)
      for (const [settled, [month, day]] of [[local(2026, 9, 24, 10), [9, 25]], [local(2026, 2, 28, 23, 30), [2, 29]]] as const) {
        expect(step(ruin(settled), local(2026, month, day, 7, 59)).mail.letters).toEqual([])
        expect(letterAts(step(ruin(settled), local(2026, month, day, 8, 1)))).toEqual([local(2026, month, day, 8)])
      }
      // 08:00 GMT and 08:00 BST: not 24 hours after the day before's 08:00.
      expect([local(2026, 9, 25, 8), local(2026, 2, 29, 8)]).toEqual([Date.UTC(2026, 9, 25, 8), Date.UTC(2026, 2, 29, 7)])
      // A gap across the change is three local days, 08:00 to 08:00.
      const gap = ruin(local(2026, 9, 24, 10))
      gap.mail.letters = [{ id: 'cloud-sea', at: local(2026, 9, 23, 8), read: false }]
      expect(letterDue(gap)).toBe(local(2026, 9, 26, 8))
      // The next local day, across the 25-hour day and the 23-hour one, from just after and just before midnight.
      expect(postTimeOn(local(2026, 9, 25, 0, 30), 1)).toBe(local(2026, 9, 26, 8))
      expect(postTimeOn(local(2026, 2, 28, 23, 30), 1)).toBe(local(2026, 2, 29, 8))
      expect([latestPost(local(2026, 9, 25, 7, 30)), latestPost(local(2026, 9, 25, 8))]).toEqual([local(2026, 9, 24, 8), local(2026, 9, 25, 8)])
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  it('reads letters', () => {
    const s = camp()
    s.mail.letters = [
      { id: 'cloud-sea', at: at(23, 8), read: false },
      { id: 'docking-height', at: at(26, 8), read: true },
      { id: 'cloud-sea-thursday', at: at(29, 8), read: false },
    ]
    expect(hasUnread(s)).toBe(true)
    // Unread first, then newest first; the list it was given stays as it was.
    expect(ids(lettersForTab(s.mail.letters))).toEqual(['cloud-sea-thursday', 'cloud-sea', 'docking-height'])
    expect(ids(s.mail.letters)).toEqual(['cloud-sea', 'docking-height', 'cloud-sea-thursday'])
    const r = readLetter(s, 'cloud-sea-thursday')
    expect(r).toMatchObject({ ok: true, notices: [] })
    expect(r.state.mail.letters.map((l) => l.read)).toEqual([false, true, true])
    expect(s.mail.letters[2].read).toBe(false)
    expect(ids(lettersForTab(r.state.mail.letters))).toEqual(['cloud-sea', 'cloud-sea-thursday', 'docking-height'])
    // Refused: already read, not arrived, or not a letter at all.
    for (const id of ['cloud-sea-thursday', 'bell', 'toString'] as LetterId[]) expect(readLetter(r.state, id)).toEqual({ state: r.state, notices: [], ok: false })
    expect([hasUnread(readLetter(r.state, 'cloud-sea').state), hasUnread(createInitialState(at(23, 8)))]).toEqual([false, false])
  })
})

describe('the clock', () => {
  it('delivers nothing new and settles him at once in the ruin, when the clock goes back or he moves', () => {
    const s = step(camp(), at(23, 8, 1))
    for (const t of [at(23, 7), at(10, 9)]) expect(step(s, t).mail.letters, iso(t)).toEqual(s.mail.letters)
    const moved = step({ ...camp(), owned: { ...camp().owned, highland: 1 } }, at(20, 15))
    expect(moved.characters.barnaby).toMatchObject({ stage: 'ruin', movedAt: at(20, 15) })
    expect(letterAts(step(moved, at(21, 8, 1)))).toEqual([at(21, 8)])
  })
})

describe('characters off', () => {
  it('does nothing', () => {
    const off: Switches = { ...ALL_ON, characters: false }
    let s = createInitialState(at(19, 9))
    s = { ...s, xp: xpForLevel(7), levelSeen: 7, owned: { ...s.owned, islet: 1, meadow: 1 } }
    for (let day = 0; day <= 30; day++) s = step(s, at(19, 9) + day * DAY, undefined, off)
    expect([s.characters.barnaby.stage, s.mail]).toEqual(['away', { letters: [], checkedAt: null }])
    withFeatures(off, () => expect(mailDue(camp(), at(23, 8, 1))).toBe(false))
  })
})
