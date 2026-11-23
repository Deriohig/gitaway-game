import { describe, expect, it } from 'vitest'
import { COMMITS, MINUTE, TASKS } from '../config'
import { BARNABY } from '../content/barnaby'
import { endSession, logTask, recordCommits, startSession, watchRepository } from '../engine'
import type { Result } from '../result'
import { createInitialState, type GameState, type ShiverSize } from '../state'
import { withFeatures } from '../testing'
import { shiver } from './shiver'

// Tests run with TZ=UTC, so a local day is a UTC day.
const HOUR = 60 * MINUTE
const on = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour, minute)
const T0 = on(23, 9)
const SEC = (ms: number) => Math.floor(ms / 1000)
const REPO = { path: '/code/api', name: 'api' }

/** A farm Barnaby has camped on since this morning, or one he hasn't reached yet. */
function farm(stage: 'away' | 'camp' = 'camp'): GameState {
  const s = createInitialState(T0)
  if (stage === 'camp') s.characters.barnaby = { ...s.characters.barnaby, stage, dueAt: on(23, 6), foundAt: on(23, 6) }
  return s
}

/** His shiver remarks, in the order they were written. */
const remarks = (s: GameState) => s.journal.filter((e) => e.kind === 'character').reverse().map((e) => e.title)
const lineOf = (title: string) => BARNABY.shiver.findIndex((l) => l.title === title)
const session = (s: GameState, start: number, end: number) => endSession(startSession(s, start).state, end)

describe('what shivers', () => {
  it('a session with credited minutes shivers big, but one that earns nothing or cannot be measured does not', () => {
    expect(session(farm('away'), T0, T0 + 30 * MINUTE).state.characters.shiver).toEqual({ at: T0 + 30 * MINUTE, size: 'big' })
    for (const end of [T0 + 30_000, T0 - MINUTE]) expect(session(farm('away'), T0, end).state.characters.shiver).toBeNull()
  })

  it("a live commit shivers small, and commits found after time away don't", () => {
    const s = watchRepository(farm('away'), REPO, T0).state
    const report = (from: GameState, count: number, latest: number) => ({ count, latest: SEC(latest), since: from.repos[0].cursor })
    const now = T0 + 4 * HOUR
    const live = recordCommits(s, REPO.path, report(s, 2, now - 2 * MINUTE), now)
    expect([live.state.stats.commits, live.state.characters.shiver]).toEqual([2, { at: now, size: 'small' }])
    const away = recordCommits(s, REPO.path, report(s, 2, now - 3 * HOUR), now)
    expect([away.state.stats.commits, away.state.characters.shiver]).toEqual([2, null])
    // Today's commits are all counted: a live one credits nothing, so nothing shivers.
    const full = recordCommits(s, REPO.path, report(s, COMMITS.dailyLimit, now - 3 * HOUR), now).state
    const capped = recordCommits(full, REPO.path, report(full, 2, now), now + MINUTE)
    expect([capped.ok, capped.state.stats.commits, capped.state.characters.shiver]).toEqual([true, COMMITS.dailyLimit, null])
    // Commit times are the device's, so a game clock skipped ahead still shivers for a live one.
    const skipped = recordCommits(s, REPO.path, report(s, 1, now - 2 * MINUTE), now + 8 * HOUR, now)
    expect(skipped.state.characters.shiver).toEqual({ at: now + 8 * HOUR, size: 'small' })
  })
})

describe("Barnaby's remark", () => {
  it('one remark a day, in the journal only', () => {
    let s = farm()
    for (let i = 0; i < TASKS.dailyLimit; i++) s = logTask(s, `Task ${i}`, T0 + i * MINUTE).state
    s = session(s, T0 + HOUR, T0 + 2 * HOUR).state
    expect(s.characters.shiver).toEqual({ at: T0 + 2 * HOUR, size: 'big' })
    // The day's first shiver, the first task's, is the one he remarks on.
    expect(remarks(s)).toEqual([BARNABY.shiver[2].title])
    expect(s.characters.barnaby).toMatchObject({ remarksUsed: [2], lastRemarkDay: '2026-10-23' })
    const r = logTask(s, 'Task 0', on(24, 0, 1))
    expect(remarks(r.state)).toEqual([BARNABY.shiver[2].title, BARNABY.shiver[4].title])
    expect(r.state.characters.barnaby).toMatchObject({ remarksUsed: [2, 4], lastRemarkDay: '2026-10-24' })
    expect(r.notices.map((n) => n.title)).toEqual(['Task logged'])
  })

  /** Shivers once a day, at noon, for `days` days from the 23rd, and gives the line each remark was. */
  function shiverDaily(s: GameState, size: ShiverSize, days: number, from = 23): number[] {
    const before = remarks(s).length
    for (let d = 0; d < days; d++) shiver(s, size, on(from + d, 12), [])
    return remarks(s).slice(before).map(lineOf)
  }

  it("remarks match the shiver's size, and no line repeats until all are used", () => {
    const big = shiverDaily(farm(), 'big', 9)
    expect(big.every((i) => ['big', 'either'].includes(BARNABY.shiver[i].size))).toBe(true)
    expect(big).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3])
    const s = farm()
    const small = shiverDaily(s, 'small', 9)
    expect(small.every((i) => ['small', 'either'].includes(BARNABY.shiver[i].size))).toBe(true)
    expect(small).toEqual([2, 4, 5, 6, 7, 2, 4, 5, 6])
    // Starting the small lines over leaves the big ones unused. The 32nd of October is the day after the 31st.
    expect(s.characters.barnaby.remarksUsed).toEqual([2, 4, 5, 6])
    expect(shiverDaily(s, 'big', 2, 32)).toEqual([0, 1])
  })

  it('he shivers and remarks with the characters on, but not off, and the pay and toasts are the same', () => {
    const paid = (s: GameState) => ({ coins: s.coins, wood: s.wood, xp: s.xp })
    const work: Record<string, (s: GameState) => Result> = {
      'logging a task': (s) => logTask(s, 'Write the shiver', T0),
      'ending a session': (s) => session(s, T0 + HOUR, T0 + 2 * HOUR),
    }
    for (const [what, act] of Object.entries(work)) {
      const start = { ...farm(), coins: 123, wood: 7, xp: 456 }
      const withHim = act(start)
      const without = withFeatures({ characters: false }, () => act(start))
      expect(withHim.state.coins, what).toBeGreaterThan(123)
      expect(withHim.state.xp, what).toBeGreaterThan(456)
      expect([withHim.state.characters.shiver === null, remarks(withHim.state).length], what).toEqual([false, 1])
      expect([without.state.characters.shiver, remarks(without.state)], what).toEqual([null, []])
      expect(paid(withHim.state), what).toEqual(paid(without.state))
      expect(withHim.notices, what).toEqual(without.notices)
    }
  })

  it('switched off, nothing shivers', () => {
    withFeatures({ characters: false }, () => {
      const s = farm()
      shiver(s, 'big', T0, [])
      let r = session(logTask(farm(), 'Write the shiver', T0).state, T0 + HOUR, T0 + 2 * HOUR).state
      r = watchRepository(r, REPO, T0 + 3 * HOUR).state
      r = recordCommits(r, REPO.path, { count: 1, latest: SEC(T0 + 3 * HOUR) + 60, since: r.repos[0].cursor }, T0 + 3 * HOUR + 2 * MINUTE).state
      expect(r.stats).toMatchObject({ tasks: 1, sessions: 1, commits: 1 })
      expect([s.characters, r.characters, remarks(r)]).toEqual([farm().characters, farm().characters, []])
    })
  })
})

describe('a task', () => {
  it('shivers small before Barnaby arrives, with nobody remarking', () => {
    const r = logTask(farm('away'), 'Write the shiver', T0)
    expect([r.state.characters.shiver, remarks(r.state)]).toEqual([{ at: T0, size: 'small' }, []])
  })
})

describe('a refused task', () => {
  it("doesn't shiver", () => {
    const once = logTask(farm(), 'Write the shiver', T0).state
    let full = farm()
    for (let i = 0; i < TASKS.dailyLimit; i++) full = logTask(full, `Task ${i}`, T0 + i).state
    for (const [s, text] of [[farm(), '   '], [once, 'write  the SHIVER'], [full, 'One more']] as const) {
      expect(logTask({ ...s, characters: { ...s.characters, shiver: null } }, text, T0 + HOUR)).toMatchObject({ ok: false, state: { characters: { shiver: null } } })
    }
  })
})
