import { describe, expect, it } from 'vitest'
import { COMMITS, MINUTE, SESSION, TASKS } from './config'
import { endSession, logTask, sessionPreview, startSession } from './engine'
import { FIELD, NEARLY, earnedAll, fieldNote, fieldToday, type Counted, type Fill } from './fairCounting'
import type { Notice } from './result'
import { createInitialState, type GameState } from './state'
import { useFeatures, withFeatures } from './testing'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0) // 09:00 UTC (tests run with TZ=UTC)
const LATE = T0 + 9 * 60 * MINUTE
const fresh = () => createInitialState(T0)
const withDay = (patch: Partial<GameState['daily']>): GameState => ({ ...fresh(), daily: { ...fresh().daily, ...patch } })
const tasks = (n: number) => Array.from({ length: n }, (_, i) => `task ${i}`)
/** Anything that reads as a counter, a debt or a limit. */
const HARSH = /behind|limit|quota|\d+\s*\/\s*\d+/i
/** Fails if any notice reads as a counter, a debt or a limit; returns them. */
const calm = (notices: Notice[]) => {
  expect(notices.map((x) => `${x.title} ${x.detail ?? ''}`).join(' | ')).not.toMatch(HARSH)
  return notices
}
const ALL: Counted[] = ['focus', 'tasks', 'commits']
const all = (fill: Fill) => ({ focus: fill, tasks: fill, commits: fill })

/** A farm whose day's focus is all credited: two sessions of the most a session earns. */
const focusFull = (): GameState => {
  let s = fresh()
  for (let at = T0; s.daily.sessionMinutes < SESSION.dailyMinuteCap; at += SESSION.maxMinutes * MINUTE + MINUTE) {
    s = endSession(startSession(s, at).state, at + SESSION.maxMinutes * MINUTE).state
  }
  return s
}
/** A farm with every task of the day's rewards logged. */
const tasksFull = () => {
  let s = fresh()
  for (let i = 0; i < TASKS.dailyLimit; i++) s = logTask(s, `task ${i}`, T0 + i).state
  return s
}

describe("today's field", () => {
  it('is open on a fresh farm, nearly full close to the caps, and full at them', () => {
    expect(fieldToday(fresh(), T0)).toEqual(all('open'))
    const short = (gap: number) => withDay({ sessionMinutes: SESSION.dailyMinuteCap - NEARLY.focus - gap, tasks: tasks(TASKS.dailyLimit - NEARLY.tasks - gap), commits: COMMITS.dailyLimit - NEARLY.commits - gap })
    expect(fieldToday(short(0), T0)).toEqual(all('nearly'))
    expect(fieldToday(short(1), T0)).toEqual(all('open'))
    const full = withDay({ sessionMinutes: SESSION.dailyMinuteCap, tasks: tasks(TASKS.dailyLimit), commits: COMMITS.dailyLimit })
    expect(fieldToday(full, T0)).toEqual(all('full'))
    expect(fieldToday(focusFull(), LATE).focus).toBe('full')
    // A new day starts open, whatever yesterday's was.
    expect(fieldToday(full, T0 + 24 * 60 * MINUTE)).toEqual(all('open'))
  })

  it('counts what the session under way would add', () => {
    const s = startSession(withDay({ sessionMinutes: SESSION.dailyMinuteCap - 60 }), T0).state
    const at = (minutes: number) => fieldToday(s, T0 + minutes * MINUTE, sessionPreview(s, T0 + minutes * MINUTE).creditedMinutes).focus
    expect([at(10), at(60 - NEARLY.focus), at(60), at(90)]).toEqual(['open', 'nearly', 'full', 'full'])
  })
})

describe('the field note', () => {
  const field = (patch: Partial<Record<Counted, Fill>>): Record<Counted, Fill> => ({ ...all('open'), ...patch })

  it('says nothing while the field is open, or about what a card does not show', () => {
    expect(fieldNote(field({}), ALL)).toBeNull()
    expect(fieldNote(field({ commits: 'full' }), ['focus', 'tasks'])).toBeNull()
  })

  it('says the field is nearly full close to a cap, and that stopping costs nothing', () => {
    expect(fieldNote(field({ tasks: 'nearly' }), ALL)).toEqual({
      fill: 'nearly',
      title: FIELD.nearly,
      line: "Today's rewards are nearly all in. Stop whenever you like: nothing is lost.",
    })
  })

  it('says the field is full for today, what has earned all it can, and that more comes tomorrow', () => {
    expect(fieldNote(field({ tasks: 'full', focus: 'nearly' }), ALL)).toEqual({
      fill: 'full',
      title: 'The field is full for today.',
      line: 'Your tasks have earned all they can today. Anything more is for the joy of it. Tomorrow the field is fresh again.',
    })
    expect(earnedAll(['focus'])).toBe('Your focus time has earned all it can today.')
    expect(earnedAll(['commits'])).toBe('Your commits have earned all they can today.')
    expect(earnedAll(ALL)).toBe('Your focus time, tasks and commits have earned all they can today.')
  })

  it('never reads as a counter, a debt or a limit', () => {
    const fills: Fill[] = ['open', 'nearly', 'full']
    for (const focus of fills)
      for (const tasks of fills)
        for (const commits of fills) {
          const note = fieldNote({ focus, tasks, commits }, ALL)
          if (note) expect(`${note.title} ${note.line}`).not.toMatch(HARSH)
        }
  })
})

describe('the words at a cap, with fair counting on', () => {
  useFeatures({ fairCounting: true })

  it('a session started or ended on a full field is for the joy of it, said kindly', () => {
    const started = startSession(focusFull(), LATE)
    expect(calm(started.notices)).toEqual([{ kind: 'info', title: FIELD.full, detail: `This session is for the joy of it. ${FIELD.fresh}` }])
    const ended = endSession(started.state, T0 + 10 * 60 * MINUTE)
    expect(calm(ended.notices)).toEqual([{ kind: 'info', title: FIELD.full, detail: `This session was for the joy of it. ${FIELD.fresh}` }])
  })

  it("a task past the day's rewards finds the field full, and says more comes tomorrow", () => {
    const more = logTask(tasksFull(), 'one more', T0 + 100)
    expect(more.ok).toBe(false)
    expect(calm(more.notices)).toEqual([{ kind: 'info', title: FIELD.full, detail: `${earnedAll(['tasks'])} ${FIELD.fresh}` }])
  })
})

describe('the words at a cap, with fair counting off', () => {
  it('are as they always were', () =>
    withFeatures({ fairCounting: false }, () => {
      const started = startSession(focusFull(), LATE)
      expect(started.notices).toEqual([{ kind: 'info', title: 'Session started', detail: "You've reached today's reward cap, so this one is just for the joy of it." }])
      expect(endSession(started.state, T0 + 10 * 60 * MINUTE).notices).toEqual([
        { kind: 'info', title: 'Session ended', detail: "You've already reached today's reward cap. The farm can wait. Rest up." },
      ])
      expect(logTask(tasksFull(), 'one more', T0 + 100).notices).toEqual([
        { kind: 'info', title: "That's today's task rewards", detail: `The first ${TASKS.dailyLimit} tasks each day earn a bonus. Well done.` },
      ])
    }))
})
