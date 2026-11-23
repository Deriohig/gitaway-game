// Visitors (B1): wild things that turn up because of what you have built, and
// stay until you notice them. Arrivals come in 36-hour periods counted from
// `visitors.since`, chosen with hash01. They never pay coins, wood or XP.
// A visitor drawn by something of a switched-off feature (see features.ts)
// neither arrives nor shows anywhere until that feature is on.

import { itemAvailable } from '../available'
import { UNLOCKS } from '../config'
import { SIOFRA_NAME } from '../content/siofra'
import { VISITORS, VISITOR_IDS, type VisitorId, type VisitorNeed } from '../content/visitors'
import { isOn } from '../features'
import { hash01, hashPick } from '../hash'
import { levelForXp } from '../progression'
import { clone, refuse, type Notice, type Result } from '../result'
import { count, countMap, field, isObj, time } from '../sanitize'
import type { GameState, PresentVisitor } from '../state'
import { eventTime, note, tell } from './journal'

export const VISITING = {
  /** Real hours per arrival period; each period brings at most one visitor. */
  periodHours: 36,
  /** No more than this many wait to be noticed at once. */
  maxPresent: 3,
  /** After a long absence, only this many of the latest periods are looked at. */
  catchUpPeriods: 6,
  /**
   * How many periods the schedule may run ahead of the clock before it's put
   * back: room for a small correction, so nobody comes twice.
   */
  clockSlack: 2,
} as const

export const PERIOD_MS = VISITING.periodHours * 3_600_000

/** The story line for the first visitor ever noticed. */
export const FIRST_VISITOR_STORY = 'The hare has been and gone. It was in no hurry.'

export function sanitizeVisitors(raw: unknown, _base: GameState, now: number): Pick<GameState, 'visitors' | 'keepsakes'> {
  const v = field(raw, 'visitors')
  const rawPresent = field(v, 'present')
  const here = new Set<VisitorId>()
  // Each visitor once, so the list stays short. No cap beyond that: hidden
  // visitors don't count towards the three, and none is ever sent away.
  const present: PresentVisitor[] = []
  for (const p of Array.isArray(rawPresent) ? rawPresent : []) {
    if (!isObj(p)) continue
    const id = VISITOR_IDS.find((x) => x === p.id)
    const arrivedAt = time(p.arrivedAt)
    if (!id || arrivedAt === null || here.has(id)) continue
    here.add(id)
    present.push({ id, arrivedAt })
  }
  // A schedule started in the future (the clock read ahead) starts again now, as in advanceVisitors.
  const since = time(field(v, 'since'))
  const ahead = since !== null && since > now
  return {
    visitors: {
      since: ahead ? now : since,
      nextPeriod: ahead ? 0 : count(field(v, 'nextPeriod')),
      present,
      seen: countMap(field(v, 'seen'), VISITOR_IDS),
    },
    keepsakes: countMap(field(raw, 'keepsakes'), VISITOR_IDS),
  }
}

// ---------------------------------------------------------------------------
// Selectors

/** Whether a need can be met at all with the switches as they are: its thing can be had, or restorations are on. */
function needAvailable(need: VisitorNeed): boolean {
  switch (need.kind) {
    case 'owned':
      return itemAvailable(need.item)
    case 'level':
      return true
    case 'restored':
      return isOn('restorations')
  }
}

/** Whether a visitor is part of the game right now: visitors are on, and everything it needs can be had. */
export const visitorAvailable = (id: VisitorId): boolean => isOn('visitors') && VISITORS[id].needs.every(needAvailable)

/** Every visitor that's part of the game right now, in table order. */
export const availableVisitors = (): VisitorId[] => VISITOR_IDS.filter(visitorAvailable)

export function needMet(s: GameState, need: VisitorNeed): boolean {
  switch (need.kind) {
    case 'owned':
      return (s.owned[need.item] ?? 0) >= need.min
    case 'level':
      return levelForXp(s.xp) >= need.level
    case 'restored':
      return s.restoration.done[need.bundle] !== undefined
  }
}

/** Whether a visitor is part of the game and everything it needs is on the island now. */
export const isEligible = (s: GameState, id: VisitorId): boolean => visitorAvailable(id) && VISITORS[id].needs.every((n) => needMet(s, n))

export const eligibleVisitors = (s: GameState): VisitorId[] => VISITOR_IDS.filter((id) => isEligible(s, id))

export const isPresent = (s: GameState, id: VisitorId): boolean => s.visitors.present.some((p) => p.id === id)

/**
 * Who is waiting to be noticed, to draw and to list. A visitor of a
 * switched-off feature (only possible in a save from a build that had it on)
 * stays in the save, unseen, until its feature is on.
 */
export const hereNow = (present: readonly PresentVisitor[]): PresentVisitor[] => present.filter((p) => visitorAvailable(p.id))

/** Visitors have started arriving (level 4 was reached). */
export const visitorsOpen = (s: GameState): boolean => s.visitors.since !== null

/** When period `k` brings its visitor: somewhere inside the period, the same on every device. */
export function arrivalAt(s: GameState, k: number): number {
  return (s.visitors.since ?? 0) + (k + hash01(s.createdAt, 'visit', k)) * PERIOD_MS
}

/** Who period `k` brings: an eligible visitor who isn't already here, someone new if there is anyone new. */
export function pickVisitor(s: GameState, k: number): VisitorId | undefined {
  const eligible = eligibleVisitors(s).filter((id) => !isPresent(s, id))
  const unseen = eligible.filter((id) => !s.visitors.seen[id])
  return hashPick(unseen.length ? unseen : eligible, s.createdAt, 'visitor', k)
}

/** "a clover sprig", "an acorn". */
export function withArticle(thing: string): string {
  const lower = thing.charAt(0).toLowerCase() + thing.slice(1)
  return `${/^[aeiou]/i.test(lower) ? 'an' : 'a'} ${lower}`
}

/**
 * The name a visitor has of their own, or undefined while they're only "the brown hare": Síofra, for the hare,
 * once she has been met properly (the meeting is hers, see siofra.ts) and while the characters are on (ruling S4:
 * with that switch off she doesn't exist in the game, so the hare is just the hare). Reads only the state, so
 * a screen can follow it without importing her system.
 */
export function ownName(s: GameState, id: VisitorId): string | undefined {
  return id === 'hare' && isOn('characters') && s.characters.siofra.metAt !== null ? SIOFRA_NAME : undefined
}

/** What to call a visitor on screen: `ownName`, or the name its definition gives ("Brown hare"). */
export const visitorName = (s: GameState, id: VisitorId): string => ownName(s, id) ?? VISITORS[id].name

/**
 * The line under a visitor's words in the journal, and in the almanac after saying hello. With `named` (see
 * `ownName`), the visitor's own name stands where "The brown hare" does: "Síofra left a clover sprig."
 */
export const keepsakeLine = (id: VisitorId, named?: string): string =>
  `${named ?? `The ${VISITORS[id].name.toLowerCase()}`} left ${withArticle(VISITORS[id].keepsake)}.`

/** The label of the Say hello button: "Say hello to the brown hare", or, with `named` (see `ownName`), "Say hello to Síofra". */
export const sayHelloLabel = (id: VisitorId, named?: string): string => `Say hello to ${named ?? `the ${VISITORS[id].name.toLowerCase()}`}`

// ---------------------------------------------------------------------------
// Time

function arrive(s: GameState, k: number, out: Notice[], now: number) {
  // Only visitors who can be seen fill the three places; hidden ones wait apart.
  if (hereNow(s.visitors.present).length >= VISITING.maxPresent) return
  const id = pickVisitor(s, k)
  if (!id) return
  const arrivedAt = arrivalAt(s, k)
  s.visitors.present.push({ id, arrivedAt })
  // Written down for the recap, when it came, never announced: visitors wait, they don't call.
  note(s, out, { kind: 'info', journal: 'visitor', quiet: true, title: VISITORS[id].arrives }, eventTime(s, arrivedAt, now))
}

/** The period `now` falls in, counted from `since`. */
const periodAt = (since: number, now: number): number => Math.floor((now - since) / PERIOD_MS)

/**
 * Whether the schedule has to be put right because the clock was wrong: it
 * started in the future, or it ran far ahead of now (the clock read ahead for
 * a while, then came back).
 */
function skewed(v: GameState['visitors'], now: number): boolean {
  return v.since !== null && (now < v.since || v.nextPeriod > periodAt(v.since, now) + VISITING.clockSlack)
}

/**
 * Whether the visitors step has anything to do, cheaply, for `DUE` in
 * advance.ts: the schedule is due to start, or to be put right, or the next
 * period's visitor has come round.
 */
export function visitorsDue(s: GameState, now: number): boolean {
  const v = s.visitors
  if (v.since === null) return levelForXp(s.xp) >= UNLOCKS.visitors
  return skewed(v, now) || arrivalAt(s, v.nextPeriod) <= now
}

/**
 * Starts the schedule once level 4 is reached, then lets each period that has
 * come round bring its visitor. A long absence looks at the latest few
 * periods only; whoever is already here stays. After a wrong clock the
 * schedule starts again from now, or comes back to the next period.
 */
export function advanceVisitors(s: GameState, now: number, out: Notice[]): boolean {
  const v = s.visitors
  let changed = false
  if (v.since === null) {
    if (levelForXp(s.xp) < UNLOCKS.visitors) return false
    v.since = now
    v.nextPeriod = 0
    changed = true
  } else if (skewed(v, now)) {
    if (now < v.since) {
      v.since = now
      v.nextPeriod = 0
    } else v.nextPeriod = Math.max(0, periodAt(v.since, now) + 1)
    changed = true
  }
  let last = periodAt(v.since, now)
  if (last >= 0 && arrivalAt(s, last) > now) last--
  if (last < v.nextPeriod) return changed
  const first = Math.max(v.nextPeriod, last - VISITING.catchUpPeriods + 1)
  for (let k = first; k <= last; k++) arrive(s, k, out, now)
  v.nextPeriod = last + 1
  return true
}

// ---------------------------------------------------------------------------
// Actions

/**
 * Says hello to a visitor who is here: it leaves a keepsake and goes on its
 * way, with a line in its own words in the journal. No coins, wood, XP,
 * toast or sound.
 */
export function noticeVisitor(state: GameState, id: VisitorId, now: number): Result {
  if (!isPresent(state, id) || !visitorAvailable(id)) return refuse(state)
  const s = clone(state)
  const out: Notice[] = []
  s.visitors.present = s.visitors.present.filter((p) => p.id !== id)
  const times = (s.visitors.seen[id] ?? 0) + 1
  s.visitors.seen[id] = times
  s.keepsakes[id] = (s.keepsakes[id] ?? 0) + 1
  if (s.stats.visitors === 0) tell(s, FIRST_VISITOR_STORY, now)
  s.stats.visitors++
  const def = VISITORS[id]
  note(s, out, { kind: 'info', journal: 'visitor', quiet: true, title: def.says[times === 1 ? 0 : 1], detail: keepsakeLine(id, ownName(s, id)) }, now)
  return { state: s, notices: out, ok: true }
}
