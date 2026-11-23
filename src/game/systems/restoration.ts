// Island restorations (B3): bundles on the notice board. Deposits are
// permanent and can be partial; a finished bundle grants XP, a journal line
// and a lasting change in the world. Crops, goods, wood and coins are brought
// and used up; `built` needs are conditions, checked live. The biome isles'
// hidden details (C2) are kept here too.

import { CROPS, ITEMS, UNLOCKS, type IslandId } from '../config'
import { DETAILS, DETAIL_IDS, ISLANDS, type DetailId } from '../content/biomes'
import { BUNDLES, BUNDLE_IDS, isConsumed, needAmount, type BundleId, type BundleNeed } from '../content/bundles'
import { GOODS } from '../content/goods'
import { clone, grantXp, plural, refuse, type Notice, type Result } from '../core'
import { isOn } from '../features'
import { levelForXp } from '../progression'
import { count, field, isObj, timeMap } from '../sanitize'
import type { GameState } from '../state'
import { note, tell } from './journal'

/** How many bundles are finished. */
export const bundlesDone = (s: GameState): number => Object.keys(s.restoration.done).length

export const isRestored = (s: GameState, id: BundleId): boolean => s.restoration.done[id] !== undefined

/** Bundles in board order. */
const BY_ORDER = [...BUNDLE_IDS].sort((a, b) => BUNDLES[a].order - BUNDLES[b].order)

/** Whether an island's part of the board is open: the board is up from level 6, with the home island on it, and each other island once it is owned. */
export function islandOpen(s: GameState, island: IslandId): boolean {
  const land = ISLANDS[island].land
  return levelForXp(s.xp) >= UNLOCKS.island && (land === null || s.owned[land] > 0)
}

/** A bundle is on the board once its island is open. */
export const isListed = (s: GameState, id: BundleId): boolean => islandOpen(s, BUNDLES[id].island)

/** The bundles that belong to an island, in board order. */
export const bundlesOn = (island: IslandId): BundleId[] => BY_ORDER.filter((id) => BUNDLES[id].island === island)

/** Every bundle on the board right now, in order. */
export const listedBundles = (s: GameState): BundleId[] => BY_ORDER.filter((id) => isListed(s, id))

/** How much has been brought for a need so far. */
const brought = (s: GameState, id: BundleId, index: number): number => s.restoration.progress[id]?.[index] ?? 0

/** How much of a consumed need the player could bring right now (conditions count as 0). */
function available(s: GameState, need: BundleNeed): number {
  switch (need.kind) {
    case 'crop':
      return s.barn.produce[need.id] ?? 0
    case 'good':
      return s.barn.goods[need.id] ?? 0
    case 'wood':
      return s.wood
    case 'coins':
      return s.coins
    default:
      return 0
  }
}

/** Whether a condition holds right now. Consumed needs are never conditions. */
const conditionMet = (s: GameState, need: BundleNeed): boolean => need.kind === 'built' && s.owned[need.item] >= need.n

/** What a need still wants brought (0 for conditions, which are never brought). */
function needLeft(s: GameState, id: BundleId, index: number): number {
  const need = BUNDLES[id].needs[index]
  if (!need || !isConsumed(need)) return 0
  return Math.max(0, needAmount(need) - brought(s, id, index))
}

function needMet(s: GameState, id: BundleId, index: number): boolean {
  const need = BUNDLES[id].needs[index]
  if (!need) return false
  return isConsumed(need) ? needLeft(s, id, index) === 0 : conditionMet(s, need)
}

/** Every need is brought and every condition holds. */
const bundleReady = (s: GameState, id: BundleId): boolean => BUNDLES[id].needs.every((_, i) => needMet(s, id, i))

export interface NeedStatus {
  need: BundleNeed
  index: number
  /** Brought and used up (true), or a condition that just has to hold (false). */
  consumed: boolean
  /** How much the need asks for (0 for conditions). */
  amount: number
  brought: number
  left: number
  /** How much the player has that could go towards it. */
  have: number
  /** What a "Bring" would bring right now. */
  canBring: number
  met: boolean
}

/** One bundle's needs, as the board shows them. */
export function needStatus(s: GameState, id: BundleId): NeedStatus[] {
  return BUNDLES[id].needs.map((need, index) => {
    const consumed = isConsumed(need)
    const left = needLeft(s, id, index)
    const have = consumed ? available(s, need) : 0
    return {
      need,
      index,
      consumed,
      amount: needAmount(need),
      brought: brought(s, id, index),
      left,
      have,
      canBring: Math.min(left, have),
      met: needMet(s, id, index),
    }
  })
}

// ---------------------------------------------------------------------------
// Words

/** "6 carrots", "a jar of jam", "300 coins": a need's amount in words. */
function needWords(need: BundleNeed, n: number): string {
  switch (need.kind) {
    case 'crop': {
      const c = CROPS[need.id]
      return plural(n, c.name.toLowerCase(), c.plural)
    }
    case 'good': {
      const [one, many] = GOODS[need.id].unit
      return plural(n, one, many)
    }
    case 'wood':
      return `${n} wood`
    case 'coins':
      return plural(n, 'coin', 'coins')
    case 'built':
      return need.n > 1 ? `${need.n} ${ITEMS[need.item].name.toLowerCase()}s` : `a ${ITEMS[need.item].name.toLowerCase()}`
    default:
      // No bundle asks for keepsakes or a visitor seen since only the hare stayed.
      return ''
  }
}

/** A need's name on the board: "Carrots", "Blueberry jam", "A beehive". */
export function needLabel(need: BundleNeed): string {
  switch (need.kind) {
    case 'crop': {
      const p = CROPS[need.id].plural
      return p.charAt(0).toUpperCase() + p.slice(1)
    }
    case 'good':
      return GOODS[need.id].name
    case 'wood':
      return 'Wood'
    case 'coins':
      return 'Coins'
    case 'built':
      return need.n > 1 ? `${need.n} ${ITEMS[need.item].name.toLowerCase()}s` : `A ${ITEMS[need.item].name.toLowerCase()}`
    default:
      return ''
  }
}

/** How a condition comes true, for the board. */
export function conditionHint(need: BundleNeed): string {
  if (need.kind !== 'built') return ''
  return ITEMS[need.item].source === 'workbench' ? 'Made at the workbench, in Stores.' : 'Built from the shop or the farm panel.'
}

/** Where a consumed need comes from, for the board's "none yet" hint. */
function sourceHint(need: BundleNeed): string {
  switch (need.kind) {
    case 'crop':
      return 'Keep some in the barn at harvest (Stores → Barn), then bring them here.'
    case 'good':
      return 'Goods go to the barn when they are made. Bring them here once there are some.'
    case 'wood':
      return 'Wood comes from work sessions.'
    case 'coins':
      return 'Coins come from work and harvests.'
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Actions

/** Takes `n` of a consumed need from where it is kept. */
function take(s: GameState, need: BundleNeed, n: number) {
  switch (need.kind) {
    case 'crop':
      s.barn.produce[need.id] = (s.barn.produce[need.id] ?? 0) - n
      return
    case 'good':
      s.barn.goods[need.id] = (s.barn.goods[need.id] ?? 0) - n
      return
    case 'wood':
      s.wood -= n
      return
    case 'coins':
      s.coins -= n
      return
  }
}

const FIRST_BUNDLE = 'The first thing on the notice board is mended. Its card has been crossed through, neatly.'

/** Marks a bundle finished: XP, a restoration line and toast, and its change in the world. */
function finish(s: GameState, id: BundleId, out: Notice[], now: number) {
  const def = BUNDLES[id]
  const first = bundlesDone(s) === 0
  s.restoration.done[id] = now
  s.stats.bundles++
  note(s, out, {
    kind: 'info',
    journal: 'restoration',
    title: `${def.name} restored`,
    detail: `${def.change} +${def.xp} XP`,
    entry: { title: `${def.name} restored`, detail: def.change },
  }, now)
  if (first) tell(s, FIRST_BUNDLE, now)
  grantXp(s, def.xp, out, now)
}

/**
 * Brings as much as there is of one need, up to what's left. Deposits are
 * permanent. If that was the last thing missing, the bundle is finished.
 */
export function deposit(state: GameState, id: BundleId, index: number, now: number): Result {
  const def = BUNDLES[id]
  if (!isOn('restorations') || !def || !isListed(state, id) || isRestored(state, id)) return refuse(state)
  const need = def.needs[index]
  if (!need || !isConsumed(need)) return refuse(state)
  const left = needLeft(state, id, index)
  if (left <= 0) return refuse(state)
  const have = available(state, need)
  if (have <= 0) {
    return refuse(state, { kind: 'warn', title: `No ${needLabel(need).toLowerCase()} to bring yet`, detail: sourceHint(need) })
  }

  const n = Math.min(left, have)
  const s = clone(state)
  take(s, need, n)
  const list = s.restoration.progress[id] ?? def.needs.map(() => 0)
  list[index] = (list[index] ?? 0) + n
  s.restoration.progress[id] = list

  const notices: Notice[] = []
  const still = left - n
  note(s, notices, {
    kind: 'info',
    title: `Brought ${needWords(need, n)}`,
    detail: still > 0 ? `The ${def.name} could use ${needWords(need, still)} more, whenever there are some.` : `That's all the ${def.name} needs of those.`,
  }, now)
  if (bundleReady(s, id)) finish(s, id, notices, now)
  return { state: s, notices, ok: true }
}

/** A listed bundle that isn't finished yet but has everything: what `advanceRestoration` finishes. */
const finishable = (s: GameState, id: BundleId): boolean => !isRestored(s, id) && isListed(s, id) && bundleReady(s, id)

/** Whether `advanceRestoration` has anything to finish. Cheap, so an idle second can skip the clone. */
export const restorationDue = (s: GameState): boolean => BY_ORDER.some((id) => finishable(s, id))

/**
 * Finishes any bundle whose last missing piece was a condition that has
 * since come true (a flower bed built, say).
 */
export function advanceRestoration(s: GameState, now: number, out: Notice[]): boolean {
  let changed = false
  for (const id of BY_ORDER) {
    if (!finishable(s, id)) continue
    finish(s, id, out, now)
    changed = true
  }
  return changed
}

// ---------------------------------------------------------------------------
// Hidden details (C2)

export const isFound = (s: GameState, id: DetailId): boolean => s.restoration.found?.[id] !== undefined

/** Notices a biome's hidden detail: one journal line, once, and nothing else. */
export function findDetail(state: GameState, id: DetailId, now: number): Result {
  const def = DETAILS[id]
  if (!isOn('biomes') || !def || state.owned[def.island] < 1 || isFound(state, id)) return refuse(state)
  const s = clone(state)
  s.restoration.found = { ...s.restoration.found, [id]: now }
  const notices: Notice[] = []
  note(s, notices, { kind: 'info', journal: 'story', title: def.title, detail: def.detail }, now)
  return { state: s, notices, ok: true }
}

// ---------------------------------------------------------------------------
// Saves

/**
 * Needs that went from a bundle's list when the wild visitors left (only the
 * hare stayed), by how long the list was and where the need stood in it. A
 * `seen` need was a condition, so nothing was ever brought for it: a save
 * from before keeps everything else it brought, each in its new place.
 *
 * An old layout is told by its length alone: give one of these bundles back
 * the length it had (a third need for the Fishing Bench, say, for Fin), and this
 * table must change with it, or that need's deposits get dropped on load.
 *
 * Not handled: the Mushroom Ring and the Stone Circle kept three needs, their
 * keepsakes swapped in place for wood and milk. Their old and new lists can't
 * be told apart (same length, the same save version, a condition first in
 * both), so keepsakes an old save brought there count as wood or milk brought,
 * up to what is asked. No code on main has ever written a deposit.
 */
const DROPPED: Partial<Record<BundleId, { was: number; at: number }>> = {
  pondJetty: { was: 3, at: 0 },
  boardwalkLoop: { was: 3, at: 0 },
  keeperCottage: { was: 3, at: 2 },
}

export function sanitizeRestoration(raw: unknown, _base: GameState, _now: number): Pick<GameState, 'restoration'> {
  const r = field(raw, 'restoration')
  const rawProgress = field(r, 'progress')
  const progress: Partial<Record<BundleId, number[]>> = {}
  if (isObj(rawProgress)) {
    for (const id of BUNDLE_IDS) {
      const saved = rawProgress[id]
      if (!Array.isArray(saved)) continue
      const dropped = DROPPED[id]
      const list = dropped && saved.length === dropped.was ? saved.filter((_, i) => i !== dropped.at) : saved
      // One amount per need, never more than the need asks for.
      progress[id] = BUNDLES[id].needs.map((need, i) => count(list[i], 0, needAmount(need)))
    }
  }
  const restoration: GameState['restoration'] = { progress, done: timeMap(field(r, 'done'), BUNDLE_IDS) }
  // Hidden details found, kept only once there is one.
  const found = timeMap(field(r, 'found'), DETAIL_IDS)
  if (Object.keys(found).length) restoration.found = found
  return { restoration }
}
