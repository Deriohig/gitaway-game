// What the island's characters have in common (Barnaby, then Síofra): the
// morning they're found, the pool their taps are picked from, how long a line
// stays up, and the repairs a saved character needs. Pure and generic: no
// character's lines or fields are known here, only indices, times and lists.

import { MINUTE } from '../config'
import { field, time } from '../sanitize'

/** The local hour the morning of a character is found at, unless a character says otherwise. */
export const MORNING_HOUR = 6

const DAY = 24 * 60 * MINUTE

/**
 * The first local `hour`:00 strictly after `now`: today's if it's not yet that
 * hour. The next day is reached by the calendar (`setDate`), never by adding
 * 24 hours, so a day the clocks change is 23 or 25 hours long and still lands
 * on the hour.
 */
export function nextMorning(now: number, hour: number = MORNING_HOUR): number {
  const d = new Date(now)
  d.setHours(hour, 0, 0, 0)
  if (d.getTime() <= now) {
    d.setDate(d.getDate() + 1)
    d.setHours(hour, 0, 0, 0)
  }
  return d.getTime()
}

/**
 * When something due at `dueAt` counts as found, and its lines are stamped
 * (ruling R17): the `hour`:00 it was due, or, found late after a longer
 * absence, today's `hour`:00, so its lines sit in today's part of the journal,
 * beside the catch-up's own lines (some stamped now, some when their thing
 * happened). Never before it was due. Before `hour`:00 today, now.
 */
export function morningStamp(dueAt: number, now: number, hour: number = MORNING_HOUR): number {
  const d = new Date(now)
  d.setHours(hour, 0, 0, 0)
  const morning = d.getTime()
  return morning > now ? now : Math.max(morning, dueAt)
}

/**
 * Whether a due time is more than a day off, as one set while the clock ran
 * ahead and since put right can be (ruling R8). The night the clocks go back
 * the next `hour`:00 really can be 25 hours off, so it's only stale when it's
 * also later than that.
 */
export function staleDue(dueAt: number, now: number, hour: number = MORNING_HOUR): boolean {
  return dueAt - now > DAY && dueAt > nextMorning(now, hour)
}

// ---------------------------------------------------------------------------
// Taps

/**
 * Picks the line for a tap from `pool`, a list of line indices. Each line of
 * the pool comes round once, picked by `rand`, before any comes round again,
 * and the first of a new round is never the line just said. Returns the index
 * and what has been heard in the round, the new index included; when the pool
 * is used up that is a fresh list with only the new index in it. The pool must
 * not be empty. Nothing it is given is changed.
 */
export function pickTap(
  pool: readonly number[],
  heard: readonly number[],
  said: { index: number } | null,
  rand: () => number,
): { index: number; heard: number[] } {
  let round = [...heard]
  let unheard = pool.filter((i) => !round.includes(i))
  if (unheard.length === 0) {
    // A new round, starting on something other than what was just said.
    round = []
    const fresh = pool.filter((i) => i !== said?.index)
    unheard = fresh.length > 0 ? fresh : [...pool]
  }
  const index = unheard[Math.floor(rand() * unheard.length)] ?? unheard[0]
  if (!round.includes(index)) round.push(index)
  return { index, heard: round }
}

/** How long a line a character says stays up over their head, by the game's clock. */
export const SAYS_MS = 4000

/**
 * Whether a character is still saying the line in `said`: for `SAYS_MS` after
 * it was said. Not before then, as when the clock is put back while they speak.
 */
export function speaking(said: { at: number } | null, now: number): boolean {
  if (said === null) return false
  const age = now - said.at
  return age >= 0 && age < SAYS_MS
}

// ---------------------------------------------------------------------------
// Saves

/** A raw value as a list: itself if it is one, otherwise empty. */
export const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Whether a raw value is an index into a list of `length` lines. */
const isIndex = (v: unknown, length: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < length

/** Indices into a list of `length` lines, each once, in the order saved. */
export const indices = (raw: unknown, length: number): number[] => [...new Set(list(raw).filter((i): i is number => isIndex(i, length)))]

/** A time that can't be later than now: a clock that ran ahead is put back. */
export const notAfter = (t: number | null, now: number): number | null => (t === null ? null : Math.min(t, now))

/** The line a character is saying, repaired: an index into a list of `length` lines, and when it was said (not after now). Null if either is bad. */
export function saidFrom(raw: unknown, length: number, now: number): { index: number; at: number } | null {
  const index = field(raw, 'index')
  const at = notAfter(time(field(raw, 'at')), now)
  return at !== null && isIndex(index, length) ? { index, at } : null
}
