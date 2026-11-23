// When Barnaby Wick has settled (docs/superpowers/specs/2026-10-22-barnaby-design.md):
// what his letters (mail.ts) and Síofra's meeting (siofra.ts) wait for. Apart
// from the rest of him in characters.ts, which runs Síofra's step, so that
// siofra.ts can read it without importing characters.ts back.

import { MINUTE } from '../config'
import type { GameState } from '../state'

const DAY = 24 * 60 * MINUTE

/** Camping this long after he's found, he counts as settled. */
export const SETTLE_MS = 3 * DAY

/** Whether he counts as settled: three days after he's found, or once he lives in the ruin. */
export function barnabySettled(s: GameState, now: number): boolean {
  const b = s.characters.barnaby
  if (b.stage === 'ruin') return true
  return b.stage === 'camp' && b.foundAt !== null && now >= b.foundAt + SETTLE_MS
}

/**
 * When `barnabySettled` first became true: three days after he was found, or when he moved into the ruin, whichever
 * came first. Straight to the ruin, that's when he was found. Null while he's away.
 */
export function barnabySettledAt(s: GameState): number | null {
  const { stage, foundAt, movedAt } = s.characters.barnaby
  if (stage === 'camp') return foundAt === null ? null : foundAt + SETTLE_MS
  if (stage === 'ruin') return foundAt === null ? movedAt : Math.min(foundAt + SETTLE_MS, movedAt ?? foundAt)
  return null
}
