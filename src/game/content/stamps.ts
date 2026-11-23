import type { GameState } from '../state'

// Quiet stamps (C4): small marks of things done, awarded without a toast.
// Hidden stamps stay out of sight (and out of any count) until earned. The
// stamps themselves are written by the stamps feature.

/** A stamp's id. A plain string until the stamps are written. */
export type StampId = string

export interface StampDef {
  id: StampId
  name: string
  /** How to earn it, shown before it's earned (unless hidden). */
  hint: string
  hidden?: boolean
  /** Pure check, run in `advance`. */
  test: (s: GameState) => boolean
}

export const STAMPS: Record<StampId, StampDef> = {}
