// Síofra, the púca (docs/superpowers/specs/2026-10-25-siofra-design.md): seen
// first as the Brown hare, then met properly, as herself, at a 06:00 once
// Barnaby has settled, and turning up in her moments before and after. Her
// step runs after his, inside the characters step (see characters.ts). Like
// his, nothing of hers pays or counts down.

import { MINUTE } from '../config'
import { SIOFRA, type MomentLine, type NoticeNeed, type ShapeNeed, type SiofraGiftId, type TapNeed } from '../content/siofra'
import { isOn } from '../features'
import { hash01, hashPick } from '../hash'
import { clone, refuse, type Notice, type Result } from '../result'
import { localDateKey, type GameState } from '../state'
import { barnabySettledAt } from './barnaby'
import { MORNING_HOUR, morningStamp, nextMorning, pickTap, staleDue } from './characterKit'
import { eventTime, note, write } from './journal'
import { hereNow, isPresent } from './visitors'

// ---------------------------------------------------------------------------
// The meeting (spec, "The meeting")

/** 06:00 on the local day after `at`'s, by the calendar. */
function morningAfter(at: number): number {
  const d = new Date(at)
  d.setDate(d.getDate() + 1)
  d.setHours(MORNING_HOUR, 0, 0, 0)
  return d.getTime()
}

/**
 * The earliest she can be met: the first local 06:00 that Barnaby has settled
 * by, on a local day after the one he was found on. Null while the farm
 * doesn't own the meadow, hasn't said hello to the hare, or he hasn't been
 * found. The meadow and the hare keep no time, so they're judged as the farm
 * is now, and `dueAt` remembers when they were first seen to hold.
 */
export function meetingDue(s: GameState): number | null {
  if ((s.visitors.seen.hare ?? 0) < 1 || !(s.owned.meadow > 0)) return null
  const settled = barnabySettledAt(s)
  if (settled === null) return null
  // The first 06:00 at or after he settled, but never on the day he was found.
  return Math.max(nextMorning(settled - 1, MORNING_HOUR), morningAfter(s.characters.barnaby.foundAt ?? settled))
}

/**
 * The morning she'd be due if scheduled at `now`: the earliest she can be met,
 * but never before the first 06:00 strictly after now, so a meeting is never
 * stamped before the hello or the meadow that let it happen. Null while she
 * can't be met.
 */
function scheduleAt(s: GameState, now: number): number | null {
  const earliest = meetingDue(s)
  return earliest === null ? null : Math.max(earliest, nextMorning(now, MORNING_HOUR))
}

/**
 * A morning to put her due time back to, or null to leave it: only when it's
 * more than a day off (as Barnaby's stale one, ruling R8) and scheduling now
 * would give an earlier one. Then the clock ran ahead when it was set and has
 * since been put right, or Barnaby settled sooner than he was going to (he
 * moved up to the ruin). While she can't be met, it's left alone.
 *
 * The caveat, of R8's kind and accepted: put back after the clock ran ahead,
 * she's met at a morning before the lines written while it was ahead, the
 * hello to the hare that let her be met among them. Each line keeps its own
 * time, so her meeting reads before that hello (pinned in siofra.test.ts).
 */
function putBack(s: GameState, dueAt: number, now: number): number | null {
  if (!staleDue(dueAt, now, MORNING_HOUR)) return null
  const next = scheduleAt(s, now)
  return next !== null && next < dueAt ? next : null
}

/** Whether the meeting has anything to do: she's to be scheduled, or her due time put back, or met. */
function meetingWaits(s: GameState, now: number): boolean {
  const f = s.characters.siofra
  if (f.metAt !== null) return false
  if (f.dueAt === null) return meetingDue(s) !== null
  return now >= f.dueAt || putBack(s, f.dueAt, now) !== null
}

/**
 * Schedules her once everything she waits for holds (the first time it does:
 * a farm that already qualified when she came to the game is due the morning
 * after it loads), then meets her when that morning comes, at `morningStamp`'s
 * time: the toast, her only one, and one character line stamped then. Back
 * after that morning passed while the game was closed, the line is written
 * last of the catch-up's, and no moment comes with it (see `advanceMoment`), so
 * it leads the recap. Once set, the due time stays (only put back, see
 * `putBack`), and she's met then even if something she waited for has gone.
 * Never a second time: `metAt` is never cleared, even by a clock put back.
 */
function advanceMeeting(s: GameState, now: number, out: Notice[]): boolean {
  const f = s.characters.siofra
  if (f.metAt !== null) return false
  if (f.dueAt === null || now < f.dueAt) {
    const next = f.dueAt === null ? scheduleAt(s, now) : putBack(s, f.dueAt, now)
    if (next === null) return false
    f.dueAt = next
    return true
  }
  f.metAt = morningStamp(f.dueAt, now, MORNING_HOUR)
  note(s, out, { kind: 'info', title: SIOFRA.met.toast, journal: false }, now)
  write(s, 'character', SIOFRA.met.title, SIOFRA.met.detail, f.metAt)
  return true
}

// ---------------------------------------------------------------------------
// Moments (spec, "Moments"): one quiet journal line at 18:00 local, two or
// three days apart, never straight after a shiver, and at most one waiting
// for a player who's been away (the letters rule). Local dates and hours
// throughout, never 24 hours in milliseconds, so a day the clocks change
// still posts at 18:00.

/** Moments post at this local hour: several of her lines tell of a whole day. */
export const MOMENT_HOUR = 18
/** Local days from one moment to the next: which of the two, picked by the date of the one before. */
export const MOMENT_GAP_DAYS = [2, 3] as const
/** No moment comes this soon after the island shivers. */
export const SHIVER_QUIET_MS = 15 * MINUTE

/** 18:00 local on `ms`'s local date, `addDays` local days on. */
function momentTimeOn(ms: number, addDays = 0): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + addDays)
  d.setHours(MOMENT_HOUR, 0, 0, 0)
  return d.getTime()
}

/** The latest post time at or before `now`: today's 18:00 from 18:00 on, yesterday's before. */
function latestEvening(now: number): number {
  const today = momentTimeOn(now)
  return today <= now ? today : momentTimeOn(now, -1)
}

/**
 * The local days after a moment at `at` before the next can come: two or
 * three, picked repeatably by its local date. With `hash01` (FNV-1a, then a
 * finaliser): the low bit of FNV-1a alone, for keys this alike, is the parity
 * of the date's odd digits, so it would run in long stretches of one gap.
 */
const gapAfter = (at: number): number => MOMENT_GAP_DAYS[Math.floor(hash01('siofra-gap', localDateKey(at)) * MOMENT_GAP_DAYS.length)]

/** Whether her moments have begun: the hare has been said hello to (or, a save edited since, one has come). */
const momentsBegun = (s: GameState): boolean => s.characters.siofra.momentAt !== null || (s.visitors.seen.hare ?? 0) >= 1

/**
 * The earliest post time her next moment can come at, or null before the
 * hare's first hello. After a moment, 18:00 on the local day two or three days
 * on (see `gapAfter`). Before her first, any post time (-Infinity): the state
 * keeps no time for the hello, so the cursor `checkedAt`, started at the
 * latest 18:00 when the hello is first seen (see `advanceMoment`), decides
 * which post comes first.
 */
export function momentDue(s: GameState): number | null {
  if (!momentsBegun(s)) return null
  const at = s.characters.siofra.momentAt
  return at === null ? Number.NEGATIVE_INFINITY : momentTimeOn(at, gapAfter(at))
}

/** What each gated shape needs the island to own, at least one of. */
const SHAPE_NEEDS: Record<NonNullable<ShapeNeed>, (s: GameState) => boolean> = {
  sheep: (s) => s.owned.sheep > 0,
  scarecrow: (s) => s.owned.scarecrow > 0,
  fruitTree: (s) => s.owned.fruitTree > 0,
  chicken: (s) => s.owned.chicken > 0,
}

/** What each notice needs of the beds, judged as they are when the moment posts (ruling S3: the state keeps no history of them). */
const NOTICE_NEEDS: Record<NoticeNeed, (s: GameState, post: number) => boolean> = {
  // A crop ripe by the post time and not yet harvested.
  ripe: (s, post) => s.plots.some((p) => p.crop !== null && p.readyAt !== null && p.readyAt <= post),
  // A bed lying empty shows resting soil.
  resting: (s) => s.plots.some((p) => p.crop === null),
}

const GIFT_IDS = Object.keys(SIOFRA.gifts) as SiofraGiftId[]

/** The shapes the island has what they need for. */
const shapesNow = (s: GameState): MomentLine[] => SIOFRA.shapes.filter((l) => l.needs === null || SHAPE_NEEDS[l.needs](s))

/**
 * The lines a moment at post time `post` can be, in pool order, never the
 * line that came last:
 * - before she's met, the glimpses, and the shapes once a glimpse has come;
 *   none while the hare is waiting to be noticed;
 * - once she's met, the shapes, the notices whose beds are as they need at
 *   the post, and the gifts not yet given; the glimpses stop. None at a post
 *   from before the meeting, seen to after it (as when the clock is put back
 *   after it), so no moment is ever stamped before she was met: a moment is
 *   stamped at its post or later.
 * Each shape only while the island owns what it needs. Before the meeting
 * only a glimpse can come first, so any moment by then means one has.
 */
export function momentPool(s: GameState, post: number): MomentLine[] {
  const f = s.characters.siofra
  let pool: MomentLine[]
  if (f.metAt === null) {
    if (isPresent(s, 'hare')) return []
    pool = f.momentAt === null ? [...SIOFRA.glimpses] : [...SIOFRA.glimpses, ...shapesNow(s)]
  } else {
    if (post < f.metAt) return []
    pool = [
      ...shapesNow(s),
      ...SIOFRA.cropsLeftStanding.filter((l) => NOTICE_NEEDS[l.needs](s, post)),
      ...GIFT_IDS.filter((id) => !f.given.includes(id)).map((id) => SIOFRA.gifts[id]),
    ]
  }
  return pool.filter((l) => l.id !== f.lastMoment)
}

/**
 * When the moment at post time `post` can come: the post, or, if the island
 * shivered in the 15 minutes before it (or since, before it was seen to, as a
 * second shiver while one holds it), once 15 minutes after that shiver are
 * up. A shiver ahead of the clock, since put back, holds nothing.
 */
function quietFrom(s: GameState, post: number, now: number): number {
  const sh = s.characters.shiver
  return sh !== null && sh.at <= now && post < sh.at + SHIVER_QUIET_MS ? sh.at + SHIVER_QUIET_MS : post
}

/**
 * The post time her moment step has to see to at `now`, or null: the latest
 * 18:00, if a moment can come by then (see `momentDue`), it hasn't been seen
 * to yet (`checkedAt`), and no shiver holds it (see `quietFrom`).
 */
function momentPost(s: GameState, now: number): number | null {
  // Before the hare's hello, a comparison or two and nothing allocated.
  if (!momentsBegun(s)) return null
  const f = s.characters.siofra
  const post = latestEvening(now)
  if (f.checkedAt !== null && post <= f.checkedAt) return null
  const due = momentDue(s)
  if (due === null || post < due) return null
  return now < quietFrom(s, post, now) ? null : post
}

/**
 * Her moment step: sees to the latest 18:00, once, when a moment can come by
 * then (see `momentPost`).
 * - The first time the hare's hello is seen, it only starts the cursor there,
 *   so her first moment comes at the next 18:00, after the hello's own line.
 * - While a line of hers that came after the player last looked is waiting,
 *   her latest moment or her meeting, nothing more comes: so however long the
 *   game was closed (or however catch-up splits the span), one waits at most,
 *   and a meeting that passed while it was closed leads the recap alone. Only
 *   her latest moment can be after `seenAt`, so `momentAt` stands for them all.
 * - With nothing in the pool (see `momentPool`), the post passes in silence.
 * - Otherwise one line, picked repeatably by the post's local date and the
 *   line before, written quietly at the post (or as a shiver's quiet ends):
 *   a visitor line before the meeting, as the hare's are, and hers after.
 *   A gift is remembered in `given`. Never a toast.
 * Mutates an already-cloned state.
 */
function advanceMoment(s: GameState, now: number): boolean {
  const post = momentPost(s, now)
  if (post === null) return false
  const f = s.characters.siofra
  const starting = f.checkedAt === null && f.momentAt === null
  f.checkedAt = post
  const unseen = (at: number | null) => at !== null && at > s.seenAt
  if (starting || unseen(f.momentAt) || unseen(f.metAt)) return true
  const line = hashPick(momentPool(s, post), 'siofra-moment', localDateKey(post), f.lastMoment ?? '')
  if (!line) return true
  const at = eventTime(s, quietFrom(s, post, now), now)
  write(s, f.metAt === null ? 'visitor' : 'character', line.title, line.detail, at)
  f.momentAt = at
  f.lastMoment = line.id
  const gift = GIFT_IDS.find((id) => SIOFRA.gifts[id].id === line.id)
  if (gift) f.given.push(gift)
  return true
}

// ---------------------------------------------------------------------------
// Her step

/**
 * Whether `advanceSiofra` has anything to do, for the characters step's due
 * check: the meeting's (see `advanceMeeting`), or a moment's post time to see
 * to (see `momentPost`). Cheap, not free: before the hare's hello, a few
 * comparisons and nothing allocated; after it, a Date or two a call for the
 * latest 18:00 (as the letters' `mailDue`), and a few more while her morning
 * is more than a day off (the put-back check) or a new post is waiting.
 */
export function siofraDue(s: GameState, now: number): boolean {
  return meetingWaits(s, now) || momentPost(s, now) !== null
}

/**
 * Her step: the meeting (see `advanceMeeting`), then her moments (see
 * `advanceMoment`), which see her as met from that morning on. True if
 * either changed anything. Mutates an already-cloned state.
 */
export function advanceSiofra(s: GameState, now: number, out: Notice[]): boolean {
  const meeting = advanceMeeting(s, now, out)
  const moment = advanceMoment(s, now)
  return meeting || moment
}

// ---------------------------------------------------------------------------
// Her figure and taps (spec, "Her figure and taps")

/**
 * Whether her figure stands at the meadow's field edge (features/Siofra.tsx):
 * once she's met, while the characters are on and the meadow is the farm's,
 * but never while the hare is drawn there waiting to be noticed, so there's
 * only ever one of her, her meeting morning included. A hare left waiting in
 * a save while the visitors are switched off isn't drawn (see `hereNow`), so
 * then she is.
 */
export function siofraShown(s: GameState): boolean {
  if (!isOn('characters') || s.characters.siofra.metAt === null || !(s.owned.meadow > 0)) return false
  return !hereNow(s.visitors.present).some((v) => v.id === 'hare')
}

/** What each gated tap line needs the island to have: the cat for the windowsill nap, a duck for the duckling. */
const TAP_NEEDS: Record<TapNeed, (s: GameState) => boolean> = {
  cat: (s) => s.gifts.includes('cat'),
  duck: (s) => s.owned.duck > 0,
}

/** Her tap lines the island has what they need for, as indices into `SIOFRA.taps`. Never empty: most need nothing. */
const tapPool = (s: GameState): number[] => SIOFRA.taps.flatMap((t, i) => (t.needs === undefined || TAP_NEEDS[t.needs](s) ? [i] : []))

/**
 * Taps her: picks a line for the label over her head, and remembers it in
 * `said`. No line comes first: from the first tap, each line of the pool (see
 * `tapPool`) comes round once, picked by `rand`, before any comes round again,
 * and never the line she's just said (see `pickTap`). No notice, no journal
 * line, nothing paid. Refused while her figure isn't there to tap (see
 * `siofraShown`): before she's met, with the characters off, or while she's
 * the hare.
 */
export function tapSiofra(state: GameState, now: number, rand: () => number = Math.random): Result {
  if (!siofraShown(state)) return refuse(state)
  const s = clone(state)
  const f = s.characters.siofra
  const tap = pickTap(tapPool(s), f.heard, f.said, rand)
  f.met = true
  f.heard = tap.heard
  f.said = { index: tap.index, at: now }
  return { state: s, notices: [], ok: true }
}
