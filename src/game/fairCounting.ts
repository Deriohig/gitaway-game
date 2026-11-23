// Fair counting (A7, docs/idle-loop.md §5 and guardrail G5): the daily caps
// are told in words, never as "x / y" counters. Below a cap nothing is said
// about it; near one the field is nearly full; at one, the field is full for
// today, and more comes tomorrow. Never "behind", never "limit". Every rule,
// with its numbers, is written down in Settings → What counts. All of it is
// behind the `fairCounting` switch (features.ts).

import { COMMITS, SESSION, TASKS } from './config'
import { localDateKey, type GameState } from './state'

/** The things a day's rewards are counted in. */
export type Counted = 'focus' | 'tasks' | 'commits'

export type Fill = 'open' | 'nearly' | 'full'

/** How much may be left before a day's field reads as nearly full: minutes of focus, tasks, commits. */
export const NEARLY: Readonly<Record<Counted, number>> = { focus: 30, tasks: 2, commits: 3 }

/** What each is called when the field speaks of it. */
const SUBJECT: Readonly<Record<Counted, string>> = { focus: 'focus time', tasks: 'tasks', commits: 'commits' }

export const FIELD = {
  full: 'The field is full for today.',
  nearly: 'The field is nearly full for today.',
  fresh: 'Tomorrow the field is fresh again.',
} as const

const fill = (used: number, cap: number, near: number): Fill => (used >= cap ? 'full' : cap - used <= near ? 'nearly' : 'open')

/**
 * How full today's field is in each thing it's counted in. `running` is what
 * the session under way would add if it ended now (its credited minutes).
 */
export function fieldToday(state: GameState, now: number, running = 0): Record<Counted, Fill> {
  const today = state.daily.date === localDateKey(now) ? state.daily : null
  return {
    focus: fill((today?.sessionMinutes ?? 0) + running, SESSION.dailyMinuteCap, NEARLY.focus),
    tasks: fill(today?.tasks.length ?? 0, TASKS.dailyLimit, NEARLY.tasks),
    commits: fill(today?.commits ?? 0, COMMITS.dailyLimit, NEARLY.commits),
  }
}

/** "Your tasks have earned all they can today." for one thing or several. */
export function earnedAll(which: readonly Counted[]): string {
  const names = which.map((k) => SUBJECT[k])
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
  const one = which.length === 1 && which[0] === 'focus'
  return `Your ${list} ${one ? 'has earned all it can' : 'have earned all they can'} today.`
}

export interface FieldNote {
  fill: Exclude<Fill, 'open'>
  title: string
  line: string
}

/** The soft line for a card that cares about `which`: null while the field is open for all of them. */
export function fieldNote(field: Record<Counted, Fill>, which: readonly Counted[]): FieldNote | null {
  const full = which.filter((k) => field[k] === 'full')
  if (full.length) return { fill: 'full', title: FIELD.full, line: `${earnedAll(full)} Anything more is for the joy of it. ${FIELD.fresh}` }
  if (which.some((k) => field[k] === 'nearly')) {
    return { fill: 'nearly', title: FIELD.nearly, line: "Today's rewards are nearly all in. Stop whenever you like: nothing is lost." }
  }
  return null
}
