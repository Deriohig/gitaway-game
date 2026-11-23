// The journal's days: lines grouped by the local date, labelled Today,
// Yesterday, then by the date.

import { localDateKey, type JournalEntry } from '../../../game/state'

/** Today, Yesterday, then the date. Days follow the local clock. */
export function dayLabel(date: string, now: number): string {
  if (date === localDateKey(now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date === localDateKey(yesterday.getTime())) return 'Yesterday'
  const [y, m, d] = date.split('-').map(Number)
  const thisYear = new Date(now).getFullYear() === y
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', ...(thisYear ? {} : { year: 'numeric' }) })
}

/**
 * When a letter came: Today, Yesterday, then the date alone, such as "24 October", with no weekday (the letters
 * spec's own form).
 */
export function letterDay(at: number, now: number): string {
  const label = dayLabel(localDateKey(at), now)
  return label === 'Today' || label === 'Yesterday' ? label : new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

/** Noon on a local date: any time that day labels the days alike, and noon is clear of clock changes. */
export function noonOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 12).getTime()
}

/** Groups a newest-first list by local day, keeping the order. */
export function byDay(entries: JournalEntry[]): [string, JournalEntry[]][] {
  const days: [string, JournalEntry[]][] = []
  for (const e of entries) {
    const date = localDateKey(e.at)
    const last = days[days.length - 1]
    if (last && last[0] === date) last[1].push(e)
    else days.push([date, [e]])
  }
  return days
}
