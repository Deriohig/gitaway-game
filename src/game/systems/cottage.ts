// The retirement cottage (C3): lifetime XP raises it in six stages on its own
// small isle. No schedule, no ETA, never "behind".

import type { Notice } from '../result'
import { count, field } from '../sanitize'
import type { GameState } from '../state'

export const COTTAGE_STAGES: { xp: number; name: string }[] = [
  { xp: 2550, name: 'Pegged out' },
  { xp: 6100, name: 'Foundations' },
  { xp: 10300, name: 'Timber frame' },
  { xp: 15850, name: 'Roof on' },
  { xp: 24000, name: 'Windows and door' },
  { xp: 36000, name: 'Home' },
]

/** The stage reached by lifetime XP: 0 before the first, up to 6. */
export const cottageStage = (s: GameState): number => COTTAGE_STAGES.filter((stage) => s.xp >= stage.xp).length

export function sanitizeCottage(raw: unknown, _base: GameState, _now: number): Pick<GameState, 'cottageSeen'> {
  return { cottageSeen: count(field(raw, 'cottageSeen'), 0, COTTAGE_STAGES.length) }
}

/** Announces each new stage once. Quiet until the cottage feature writes its lines. */
export function advanceCottage(_s: GameState, _now: number, _out: Notice[]): boolean {
  return false
}
