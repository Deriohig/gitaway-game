// Idle yields (spec §3): animals, hives, trees, the woodshed and the wetland
// produce on their own. What they make is kept in fractional units up to one
// timestamp, `yields.at`, and settled lazily: before the number of sources
// changes, when collecting, and whenever someone asks what's waiting. Each
// kind stops filling at YIELD_CAP_HOURS' worth for the sources owned, and
// nothing is ever taken away. Collect all turns whole units into coins, wood
// and a little XP, and leaves the fractions to keep growing.

import { GROVE_WOOD_SOURCES, ORCHARD_FRUIT_TREES, YIELD_CAP_HOURS, type ItemId } from '../config'
import { YIELDS, YIELD_IDS, yieldAmount, type YieldId } from '../content/yields'
import { carryXp, farmPay, grantCoins, grantXp } from '../core'
import { clone, refuse, type Notice, type Result } from '../result'
import { field, num, time, xpCarry } from '../sanitize'
import type { GameState } from '../state'
import { RECAP_AFTER_MS, note } from './journal'

const HOUR_MS = 3_600_000

/**
 * How many sources each kind has: one per animal, hive or tree, the orchard
 * isle's trees among them; one for the wetland; the woodshed, fed by the grove.
 */
const SOURCES: Record<YieldId, (owned: Record<ItemId, number>) => number> = {
  eggs: (o) => o.chicken + o.duck,
  wool: (o) => o.sheep,
  milk: (o) => o.goat,
  honey: (o) => o.beehive,
  fruit: (o) => o.fruitTree + (o.orchardLand ? ORCHARD_FRUIT_TREES : 0),
  fish: (o) => (o.wetland > 0 ? 1 : 0),
  wood: (o) => (o.woodshed > 0 ? 1 + o.grove * GROVE_WOOD_SOURCES : 0),
}

/** How many things on the farm make a kind of yield. */
export const yieldSources = (s: Pick<GameState, 'owned'>, id: YieldId): number => SOURCES[id](s.owned)

/** The most of a kind that waits: YIELD_CAP_HOURS' worth from the sources owned. */
const capOf = (s: Pick<GameState, 'owned'>, id: YieldId): number => (YIELD_CAP_HOURS * yieldSources(s, id)) / YIELDS[id].hours

/**
 * Adds what was made since `yields.at`, up to each kind's cap, and moves
 * `at` on to `now`. A clock that went back adds nothing and leaves `at` where
 * it was, so no stretch of time is ever paid twice. Mutates.
 */
export function settleYields(s: GameState, now: number): void {
  const y = s.yields
  const hours = Math.max(0, now - y.at) / HOUR_MS
  for (const id of YIELD_IDS) {
    const cap = capOf(s, id)
    // Full stops filling, but never takes anything away.
    if (y.stored[id] < cap) y.stored[id] = Math.min(cap, y.stored[id] + (hours * yieldSources(s, id)) / YIELDS[id].hours)
  }
  y.at = Math.max(y.at, now)
}

/** Whole units waiting at `now`, per kind. Pure: it settles a copy of the yields. */
export function waitingYields(s: GameState, now: number): Record<YieldId, number> {
  const copy: GameState = { ...s, yields: { ...s.yields, stored: { ...s.yields.stored } } }
  settleYields(copy, now)
  return Object.fromEntries(YIELD_IDS.map((id) => [id, Math.floor(copy.yields.stored[id])])) as Record<YieldId, number>
}

/** Collects every whole unit waiting, of every kind: coins and wood, a little XP, and one narrated line. */
export function collectAll(state: GameState, now: number): Result {
  const s = clone(state)
  settleYields(s, now)
  const units = YIELD_IDS.map((id) => [id, Math.floor(s.yields.stored[id])] as const).filter(([, n]) => n > 0)
  if (!units.length) return refuse(state)
  const paid = { coins: 0, wood: 0 }
  let xp = 0
  for (const [id, n] of units) {
    s.yields.stored[id] -= n
    paid[YIELDS[id].pays] += n * YIELDS[id].value * farmPay(s)
    xp += n * YIELDS[id].xp * farmPay(s)
  }
  grantCoins(s, paid.coins)
  s.wood += paid.wood
  const title = [paid.coins && `+${paid.coins} coins`, paid.wood && `+${paid.wood} wood`].filter(Boolean).join(', ')
  const lines = units.map(([id, n]) => YIELDS[id].line(n)).join(' ')
  const out: Notice[] = []
  // The lines go in the journal's detail, which has room for all seven kinds; its title stays short.
  note(s, out, { kind: 'reward', journal: 'garden', title, detail: lines, entry: { title: 'You brought in what the farm made.', detail: lines } }, now)
  // Whole points of XP now, and the fraction carried to the next collect.
  const { whole, carry } = carryXp(s.yields.xpCarry, xp)
  s.yields.xpCarry = carry
  grantXp(s, whole, out, now)
  return { state: s, notices: out, ok: true }
}

/**
 * Repairs the saved yields for a farm that owns `farm.owned`. A stamp ahead of
 * `now` (a clock that ran ahead, or junk) counts from `now`, so the farm never
 * stops making things while it waits for the clock to catch up.
 */
export function sanitizeYields(raw: unknown, now: number, farm: Pick<GameState, 'owned'>): Pick<GameState, 'yields'> {
  const stored = field(raw, 'stored')
  return {
    yields: {
      at: Math.min(time(field(raw, 'at')) ?? now, now),
      stored: Object.fromEntries(YIELD_IDS.map((id) => [id, num(field(stored, id), 0, 0, capOf(farm, id))])) as Record<YieldId, number>,
      xpCarry: xpCarry(field(raw, 'xpCarry')),
    },
  }
}

// ---------------------------------------------------------------------------
// The recap

const WAITING = 'Waiting to be collected:'

/** "a", "a and b", "a, b and c". */
const listed = (words: string[]): string => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`)

/**
 * Whether this absence's line is already written: lines newer than the last
 * time the player was here are this absence's, and the journal is newest first.
 */
function toldThisAbsence(s: GameState): boolean {
  for (const e of s.journal) {
    if (e.at <= s.seenAt) return false
    if (e.kind === 'garden' && e.title.startsWith(WAITING)) return true
  }
  return false
}

/**
 * Whether the yields step has anything to say, for `DUE` in advance.ts: the
 * player has been away long enough for a recap, something whole is waiting,
 * and this absence's line isn't written yet.
 */
export function yieldsDue(s: GameState, now: number): boolean {
  if (now - s.seenAt < RECAP_AFTER_MS || toldThisAbsence(s)) return false
  const waiting = waitingYields(s, now)
  return YIELD_IDS.some((id) => waiting[id] > 0)
}

/** After an absence, writes one quiet line for the recap saying what's waiting to be collected. */
export function advanceYields(s: GameState, now: number, out: Notice[]): boolean {
  if (!yieldsDue(s, now)) return false
  const waiting = waitingYields(s, now)
  const amounts = YIELD_IDS.filter((id) => waiting[id] > 0).map((id) => yieldAmount(id, waiting[id]))
  note(s, out, { kind: 'info', journal: 'garden', quiet: true, title: `${WAITING} ${listed(amounts)}.` }, now)
  return true
}
