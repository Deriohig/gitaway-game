// Development-build helpers for trying the game out quickly: granting coins,
// wood and a level, and skipping time. Pure, like the rest of the rules. Only
// the Dev panel (src/dev) imports this file, and ordinary production builds
// leave that panel out, so none of this ships (see dev.test.ts, which checks
// the imports).

import { MINUTE } from './config'
import { clone, grantXp, refuse } from './core'
import { xpForLevel, levelForXp } from './progression'
import type { Notice, Result } from './result'
import type { GameState } from './state'

const HOUR = 60 * MINUTE

/** The panel's buttons. */
export const DEV_GRANTS = {
  coins: [100, 1000],
  wood: [10, 50],
} as const

/** Each is long enough for the farm to catch up as after a real absence, recap and all (see catchup.test.ts). */
export const DEV_SKIPS = [
  { label: '+1 hour', ms: HOUR },
  { label: '+8 hours', ms: 8 * HOUR },
  { label: '+1 day', ms: 24 * HOUR },
] as const

/** Adds coins and wood straight to the farm. They aren't earnings, so the farm's stats don't count them. */
export function grantResources(state: GameState, grant: { coins?: number; wood?: number }): Result {
  const coins = Math.max(0, Math.floor(grant.coins ?? 0))
  const wood = Math.max(0, Math.floor(grant.wood ?? 0))
  if (!coins && !wood) return refuse(state)
  const s = clone(state)
  s.coins += coins
  s.wood += wood
  const parts = [coins && `+${coins} coins`, wood && `+${wood} wood`].filter(Boolean)
  const notice: Notice = { kind: 'info', title: `Dev: ${parts.join(' · ')}` }
  return { state: s, notices: [notice], ok: true }
}

/** The XP still missing to the next level. */
export function xpToNext(xp: number): number {
  return xpForLevel(levelForXp(xp) + 1) - xp
}

/**
 * Grants exactly the XP missing to the next level, through the normal
 * level-up path, so its bonus, unlocks, gifts and story lines all happen.
 */
export function levelUp(state: GameState, now: number): Result {
  const s = clone(state)
  const notices: Notice[] = []
  grantXp(s, xpToNext(state.xp), notices, now)
  return { state: s, notices, ok: true }
}

/** How far ahead of the device's clock the game is, in a few words: "+1 d 8 h". */
export function formatOffset(ms: number): string {
  if (ms <= 0) return 'none'
  const minutes = Math.floor(ms / MINUTE)
  const d = Math.floor(minutes / (24 * 60))
  const h = Math.floor((minutes % (24 * 60)) / 60)
  const m = minutes % 60
  const parts = [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean)
  return `+${parts.length ? parts.join(' ') : '0 min'}`
}
