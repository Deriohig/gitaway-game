// Fishing (B6): catch and release. Open spots land a fish every 45 minutes of
// real time, even while the game is closed; fish fill the almanac and never
// pay. A big catch waits at the jetty until it's noticed.

import { FISH, FISH_SPOT_IDS, type FishId } from '../content/fish'
import type { Notice } from '../result'
import { count, countMap, field, isObj, num, time } from '../sanitize'
import type { BigCatch, CaughtFish, GameState } from '../state'

const knownFish = (id: unknown): id is FishId => typeof id === 'string' && Object.hasOwn(FISH, id)

function bigFrom(raw: unknown): BigCatch | null {
  if (!isObj(raw)) return null
  const spot = FISH_SPOT_IDS.find((s) => s === raw.spot)
  const at = time(raw.at)
  const size = num(raw.size, 0, 0)
  if (!knownFish(raw.id) || !spot || at === null || size <= 0) return null
  return { id: raw.id, spot, size, at }
}

export function sanitizeFishing(raw: unknown, _base: GameState, _now: number): Pick<GameState, 'fishing'> {
  const f = field(raw, 'fishing')
  const rawCaught = field(f, 'caught')
  const caught: Partial<Record<FishId, CaughtFish>> = {}
  if (isObj(rawCaught)) {
    for (const [id, c] of Object.entries(rawCaught)) {
      const firstAt = time(field(c, 'firstAt'))
      const n = count(field(c, 'count'))
      if (!knownFish(id) || firstAt === null || n < 1) continue
      caught[id] = { count: n, firstAt, best: num(field(c, 'best'), 0, 0) }
    }
  }
  return { fishing: { slots: countMap(field(f, 'slots'), FISH_SPOT_IDS), caught, big: bigFrom(field(f, 'big')) } }
}

/** Catches as time passes at each open spot. Nothing bites until the fishing feature casts. */
export function advanceFishing(_s: GameState, _now: number, _out: Notice[]): boolean {
  return false
}
