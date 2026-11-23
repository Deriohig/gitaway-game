import { describe, expect, it } from 'vitest'
import { byDay } from '../../ui/panels/journal/days'
import { CROPS, LEVEL_XP, MINUTE } from '../config'
import { buyItem, harvest, harvestAll, logTask, plant, plantAll, startSession, checkSessionMilestones } from '../engine'
import { advance } from '../advance'
import type { Notice } from '../result'
import { migrate } from '../save'
import { createInitialState, JOURNAL_KINDS, OPENING_LINE, type GameState, type JournalEntry, type JournalKind } from '../state'
import { ALL_OFF, ALL_ON, useFeatures, withFeatures } from '../testing'
import { JOURNAL, journalKindOf, kindShown, markSeen, note, recapEntries, retain, setEntryNote, setNextNote, shownLines } from './journal'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)
const HOUR = 3_600_000
const DAY = 86_400_000
const RIPE = T0 + CROPS.radish.growMinutes * MINUTE
const fresh = () => createInitialState(T0)
const rich = (patch: Partial<GameState> = {}): GameState => ({ ...fresh(), coins: 50_000, wood: 5_000, ...patch })
const titles = (s: GameState, kind?: JournalKind) => s.journal.filter((e) => !kind || e.kind === kind).map((e) => e.title)
const roundTrip = <T,>(s: T) => JSON.parse(JSON.stringify(s))

describe('notes', () => {
  it('writes the journal line and queues the toast', () => {
    const s = fresh()
    const out: Notice[] = []
    note(s, out, { kind: 'crop', title: 'Harvested radish', detail: '+10 coins' }, T0 + 5)
    expect(s.journal[0]).toEqual({ id: 2, at: T0 + 5, kind: 'garden', title: 'Harvested radish', detail: '+10 coins' })
    expect(s.journalSeq).toBe(2)
    expect(out.map((n) => n.title)).toEqual(['Harvested radish'])
  })
})

describe('retention', () => {
  const entry = (id: number, kind: JournalKind): JournalEntry => ({ id, at: T0 + id, kind, title: `${kind} ${id}` })

  it('keeps the newest 400 of each busy kind, and every other line', () => {
    const list: JournalEntry[] = []
    let id = 5000
    for (const [kind, n] of [['garden', 450], ['work', 420], ['visitor', 500]] as const) for (let i = 0; i < n; i++) list.push(entry(id--, kind))
    const kept = retain(list)
    const count = (k: JournalKind) => kept.filter((e) => e.kind === k).length
    expect([count('garden'), count('work'), count('visitor')]).toEqual([JOURNAL.keepBusy, JOURNAL.keepBusy, 500])
    expect(kept[0].id).toBe(5000)
  })

  it.each([
    ['of any kind', (i: number) => entry(4000 - i, 'story')],
    ['even for lines carrying a note', (i: number) => ({ ...entry(4000 - i, 'work'), note: 'mine' })],
  ])('never keeps more than the hard cap, %s', (_, make) => {
    const kept = retain(Array.from({ length: 3500 }, (_x, i) => make(i)))
    expect(kept).toHaveLength(JOURNAL.hardCap)
    expect(kept[0].id).toBe(4000)
  })

  it('never trims a busy line the player wrote a note on, and applies as lines are written', () => {
    const s = fresh()
    note(s, [], { kind: 'reward', title: 'Fix the build' }, T0)
    const noted = setEntryNote(s, s.journal[0].id, 'the one that took all week').state
    for (let i = 1; i <= JOURNAL.keepBusy; i++) note(noted, [], { kind: 'reward', title: `task ${i}` }, T0 + i)
    expect(noted.journal.find((e) => e.title === 'Fix the build')?.note).toBe('the one that took all week')
    // The rest of the kind still keeps its newest 400.
    expect(noted.journal.filter((e) => e.kind === 'work')).toHaveLength(JOURNAL.keepBusy + 1)
    expect(migrate(roundTrip(noted), T0)!.journal).toEqual(noted.journal)

    const t = fresh()
    for (let i = 0; i < 450; i++) note(t, [], { kind: 'crop', title: `ripe ${i}` }, T0 + i)
    expect(t.journal.filter((e) => e.kind === 'garden')).toHaveLength(JOURNAL.keepBusy)
    expect(t.journal[0].title).toBe('ripe 449')
    expect(titles(t, 'story')).toEqual([OPENING_LINE])
  })
})

describe('the engine writes things down', () => {
  // Lines about the workbench, the notice board and the wetland need their features.
  useFeatures({ workshop: true, restorations: true, wildIsles: true })

  it('journals planting, ripening and harvesting as garden lines, telling the first harvest once', () => {
    let s = advance(plantAll(fresh(), 'radish', T0).state, RIPE).state
    s = harvestAll(s, RIPE).state
    expect(titles(s, 'garden')).toEqual(['Harvested 4 crops', 'Your radishes are ready', 'Planted 4 radishes'])
    expect(titles(s, 'story')).toContain('The first harvest. Small, but it came out of your own soil.')
    expect(s.daily.harvests).toBe(4)

    const two = harvest(harvest(plant(plant(fresh(), 0, 'radish', T0).state, 1, 'radish', T0).state, 0, RIPE).state, 1, RIPE).state
    expect(titles(two, 'story').filter((t) => t.startsWith('The first harvest'))).toHaveLength(1)
  })

  it('journals building (a story line for the first workbench) and level-ups (and what opens)', () => {
    const built = buyItem(rich({ xp: LEVEL_XP[2] }), 'workbench', T0).state
    expect(titles(built, 'build')).toEqual(['Workbench added'])
    expect(titles(built, 'story')).toContain("There's a workbench under the oak now. It smells of sawdust.")
    // One XP short of level 6, so the woodshed's XP takes the farm there.
    const up = buyItem(rich({ xp: LEVEL_XP[5] - 1 }), 'woodshed', T0).state
    expect(titles(up, 'level')).toContain('Farm level 6: Country Retreat')
    expect(titles(up, 'story')).toContain('A notice board has gone up by the path, with a list of old places worth mending.')
  })
})

describe('story lines for features that arrive later', () => {
  const STUDIO_LINE = 'There is a studio now, for moving things about until they look right.'
  const stories = (s: GameState) => titles(s, 'story')
  const told = (s: GameState, line: string) => stories(s).filter((t) => t === line)
  /** A farm that reached level 7 while every feature was off, and has been told all it could be. */
  const pastLevel7 = () => withFeatures(ALL_OFF, () => advance(rich({ xp: LEVEL_XP[6], levelSeen: 7 }), T0).state)

  it("tells a feature's line once it's switched on, to a farm already past its level", () => {
    const s = pastLevel7()
    expect(stories(s)).not.toContain(STUDIO_LINE)
    withFeatures({ ...ALL_OFF, studio: true }, () => {
      const on = advance(s, T0 + 1000)
      expect(on.ok).toBe(true)
      expect(on.notices).toEqual([])
      expect(told(on.state, STUDIO_LINE)).toHaveLength(1)
      expect(on.state.told).toContain('studio')
      expect(advance(on.state, T0 + 2000).ok).toBe(false)
    })
  })
})

describe('lines written out of order', () => {
  /** The journal's days as JournalTab groups them: each date once, newest first. */
  const days = (s: GameState) => byDay(s.journal).map(([date]) => date)

  it('come out newest first, the later written first at the same moment, with each day once', () => {
    // T0 is 09:00 on Saturday. A catch-up on Sunday morning writes what happened overnight after what it found then.
    const s = fresh()
    note(s, [], { kind: 'crop', title: 'Sunday 09:00' }, T0 + DAY)
    note(s, [], { kind: 'crop', title: 'Saturday 21:00' }, T0 + 12 * HOUR)
    note(s, [], { kind: 'info', journal: 'visitor', title: 'Sunday 06:00' }, T0 + DAY - 3 * HOUR)
    note(s, [], { kind: 'crop', title: 'Saturday 21:00, written later' }, T0 + 12 * HOUR)
    expect(titles(s)).toEqual(['Sunday 09:00', 'Sunday 06:00', 'Saturday 21:00, written later', 'Saturday 21:00', OPENING_LINE])
    expect(days(s)).toEqual(['2026-10-18', '2026-10-17'])
  })

  it('load from a save kept in the order they were written, newest first by time, each day once', () => {
    // Every build before kept the journal newest first by id. Here the clock ran a day ahead for line 4, then was put right.
    const lines: JournalEntry[] = [
      { id: 5, at: T0 + 2 * HOUR, kind: 'work', title: 'Saturday 11:00' },
      { id: 4, at: T0 + DAY, kind: 'work', title: 'Sunday 09:00' },
      { id: 3, at: T0 + HOUR, kind: 'garden', title: 'Saturday 10:00, written later' },
      { id: 2, at: T0 + HOUR, kind: 'garden', title: 'Saturday 10:00' },
    ]
    const s = migrate({ ...roundTrip(fresh()), journal: [...lines, ...fresh().journal], journalSeq: 5 }, T0 + DAY)!
    expect(titles(s)).toEqual(['Sunday 09:00', 'Saturday 11:00', 'Saturday 10:00, written later', 'Saturday 10:00', OPENING_LINE])
    expect(days(s)).toEqual(['2026-10-18', '2026-10-17'])
    expect(s.journalSeq).toBe(5)
  })
})

describe('notes from the player', () => {
  it('sets and clears a one-line note on an entry', () => {
    const s = fresh()
    const noted = setEntryNote(s, 1, '  where\nit all   began  ')
    expect(noted.state.journal[0].note).toBe('where it all began')
    expect(setEntryNote(noted.state, 1, 'where it all began').ok).toBe(false)
    expect(setEntryNote(noted.state, 1, 'x'.repeat(200)).state.journal[0].note).toHaveLength(JOURNAL.noteMax)
    expect(setEntryNote(noted.state, 1, '   ').state.journal[0]).not.toHaveProperty('note')
    expect(setEntryNote(s, 99, 'nobody').ok).toBe(false)
  })
})

describe('recap', () => {
  it('gathers what happened since the player was last here, of the kinds worth telling', () => {
    let s = plantAll(fresh(), 'radish', T0).state
    s = markSeen(s, T0 + MINUTE).state
    s = logTask(s, 'quiet work', T0 + 2 * MINUTE).state
    s = advance(s, T0 + 30 * MINUTE).state
    expect(recapEntries(s, s.seenAt).map((e) => e.title)).toEqual(['Your radishes are ready'])
    expect(recapEntries(s, T0 + 31 * MINUTE)).toEqual([])
  })

  it('never stamps a line at or before the last time the player was here, or the recap would leave it out', () => {
    // The radish ripened, and half a second later the tab was hidden, before a tick saw it.
    const s = { ...plant(fresh(), 0, 'radish', T0).state, seenAt: RIPE + 500 }
    const back = advance(s, RIPE + 10 * HOUR).state
    expect(back.journal.find((e) => e.title === 'Your radish is ready')?.at).toBe(RIPE + 501)
    expect(recapEntries(back, s.seenAt).map((e) => e.title)).toContain('Your radish is ready')
  })
})

describe('lines of switched-off features', () => {
  // A save from a build that had them on can carry their lines.
  const carrying = (): GameState => {
    const s = fresh()
    const lines: JournalEntry[] = [
      { id: 5, at: T0 + 4 * MINUTE, kind: 'stamp', title: 'A stamp for the first harvest' },
      { id: 4, at: T0 + 3 * MINUTE, kind: 'visitor', title: 'A hedgehog came by' },
      { id: 3, at: T0 + 2 * MINUTE, kind: 'garden', title: 'Your radishes are ready' },
      { id: 2, at: T0 + MINUTE, kind: 'git', title: 'Two commits landed' },
    ]
    return { ...s, journal: [...lines, ...s.journal], journalSeq: 5 }
  }
  const kinds = (entries: JournalEntry[]) => entries.map((e) => e.kind)

  it('stay in the save but out of the journal and the recap while their feature is off, and show again once it is on', () => {
    withFeatures({ ...ALL_OFF, journal: true }, () => {
      expect(kinds(shownLines(carrying().journal))).toEqual(['garden', 'git', 'story'])
      expect(kinds(recapEntries(carrying(), T0))).toEqual(['garden', 'git'])
    })
    withFeatures({ ...ALL_OFF, journal: true, stamps: true, visitors: true }, () => {
      expect(shownLines(carrying().journal)).toEqual(carrying().journal)
      expect(kinds(recapEntries(carrying(), T0))).toEqual(['visitor', 'garden', 'git'])
    })
  })

  it('belong to the feature that writes them, while work, garden, building, levels, story and commits belong to every farm', () => {
    withFeatures(ALL_OFF, () => expect(JOURNAL_KINDS.filter(kindShown)).toEqual(['work', 'garden', 'build', 'level', 'story', 'git']))
    for (const [feature, kind] of [['letters', 'letter'], ['workshop', 'craft'], ['characters', 'character']] as const) {
      withFeatures({ ...ALL_OFF, [feature]: true }, () => expect(kindShown(kind)).toBe(true))
    }
    withFeatures(ALL_ON, () => expect(JOURNAL_KINDS.filter(kindShown)).toEqual([...JOURNAL_KINDS]))
  })
})

describe('smaller pieces', () => {
  it('keeps session milestones out of the journal, a next-time note, and who was last seen', () => {
    const m = checkSessionMilestones(startSession(fresh(), T0).state, T0 + 30 * MINUTE)
    expect([m.notices.length, m.state.journal]).toEqual([1, fresh().journal])
    const s = setNextNote(fresh(), 'Finish the parser').state
    expect([s.nextNote, setNextNote(s, 'y'.repeat(300)).state.nextNote?.length, setNextNote(s, '').state.nextNote]).toEqual(['Finish the parser', JOURNAL.noteMax, ''])
    const seen = markSeen(fresh(), T0 + 5)
    expect([seen.state.seenAt, markSeen(seen.state, T0 + 5).ok]).toEqual([T0 + 5, false])
  })

  it('tells lines for passed levels to a version 1 farm, only at their level, and keeps only known told lines', () => {
    const v1 = migrate({ version: 1, createdAt: T0 - DAY, xp: LEVEL_XP[6], levelSeen: 7, settings: { welcomed: true } }, T0)!
    const after = withFeatures({ ...ALL_OFF, almanac: true }, () => advance(v1, T0).state)
    expect(titles(after, 'story')).toEqual(expect.arrayContaining(['There is wheat seed in the shop now.', 'The cat brought in an old almanac. Most of its pages are blank.']))
    withFeatures({ ...ALL_OFF, studio: true }, () => {
      expect(titles(advance(rich({ xp: LEVEL_XP[4], levelSeen: 5 }), T0).state, 'story').some((t) => t.startsWith('There is a studio'))).toBe(false)
      expect(titles(advance(rich({ xp: LEVEL_XP[5], levelSeen: 6 }), T0).state, 'story').some((t) => t.startsWith('There is a studio'))).toBe(true)
    })
    expect(migrate({ ...roundTrip(fresh()), told: ['wheat', 'wheat', 'dragons', 7, 'toString', 'wetland'] }, T0)!.told).toEqual(['wheat'])
    expect(migrate({ ...roundTrip(fresh()), told: 'everything' }, T0)!.told).toEqual([])
  })

  it('stamps a crop that ripened during a closed gap when it ripened', () => {
    const s = plant(fresh(), 0, 'radish', T0).state
    expect(recapEntries(advance(s, T0 + 10 * HOUR).state, s.seenAt).find((e) => e.title === 'Your radish is ready')?.at).toBe(RIPE)
  })
})

describe('told lines', () => {
  const STUDIO = 'There is a studio now, for moving things about until they look right.'
  it('are told once a feature is on to a farm past its level, remembered in the save, and never told twice', () => {
    const past = withFeatures(ALL_OFF, () => advance(rich({ xp: LEVEL_XP[6], levelSeen: 7 }), T0).state)
    const kept = withFeatures({ ...ALL_OFF, studio: true }, () => advance(past, T0 + 1000).state)
    expect(titles(kept, 'story').filter((t) => t === STUDIO)).toHaveLength(1)
    const back = migrate(roundTrip(kept), T0)!
    expect(back.told).toEqual(['wheat', 'studio'])
    withFeatures(ALL_ON, () => expect(titles(advance(back, T0 + 1000).state, 'story').filter((t) => t === STUDIO)).toHaveLength(1))
    // Wild visitors tell nothing, so their line is never added.
    expect(withFeatures({ ...ALL_OFF, visitors: true }, () => advance(past, T0 + 1000).state.told)).not.toContain('visitors')
  })
})

describe('kinds', () => {
  it('files each notice kind under its journal kind, info only when asked, never warnings', () => {
    const kinds = (['reward', 'session', 'crop', 'level', 'unlock', 'animal', 'info', 'warn'] as const).map((kind) => journalKindOf({ kind, title: '' }))
    expect([...kinds, journalKindOf({ kind: 'info', title: '', journal: 'build' }), journalKindOf({ kind: 'warn', title: '', journal: 'build' }), journalKindOf({ kind: 'crop', title: '', journal: false })])
      .toEqual(['work', 'work', 'garden', 'level', 'level', 'build', false, false, 'build', false, false])
  })
})
