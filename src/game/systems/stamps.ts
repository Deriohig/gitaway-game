// Quiet stamps (C4): checked in `advance`, awarded with a journal line and no
// toast. Hidden stamps are never shown or counted until they're earned.

import { STAMPS, type StampId } from '../content/stamps'
import type { Notice } from '../result'
import { field, isObj, time } from '../sanitize'
import type { GameState } from '../state'

export function sanitizeStamps(raw: unknown, _base: GameState, _now: number): Pick<GameState, 'stamps'> {
  const rawStamps = field(raw, 'stamps')
  const stamps: Partial<Record<StampId, number>> = {}
  if (isObj(rawStamps)) {
    for (const [id, at] of Object.entries(rawStamps)) {
      const t = time(at)
      if (Object.hasOwn(STAMPS, id) && t !== null) stamps[id] = t
    }
  }
  return { stamps }
}

/** Awards stamps whose tests now pass. The table is empty until the stamps feature fills it. */
export function advanceStamps(_s: GameState, _now: number, _out: Notice[]): boolean {
  return false
}
