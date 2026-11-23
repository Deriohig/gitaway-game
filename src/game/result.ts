// What every game action hands back: the new state, the notices to show, and
// whether anything happened at all. Kept tiny and free of imports so every
// system can use it.

import type { GameState, JournalKind } from './state'

export type NoticeKind = 'reward' | 'level' | 'unlock' | 'animal' | 'crop' | 'session' | 'info' | 'warn'

export interface Notice {
  kind: NoticeKind
  title: string
  detail?: string
  /**
   * The journal kind this notice is written down as. Left out, it follows the
   * notice kind (see `journalKindOf`); `false` keeps it out of the journal.
   */
  journal?: JournalKind | false
  /** Journal only: no toast. */
  quiet?: boolean
  /** Different words for the journal line than for the toast. */
  entry?: { title: string; detail?: string }
}

export interface Result {
  state: GameState
  notices: Notice[]
  /** False when the action was refused and the state is unchanged. */
  ok: boolean
}

export const clone = (s: GameState): GameState => structuredClone(s)

export const refuse = (state: GameState, notice?: Notice): Result => ({ state, notices: notice ? [notice] : [], ok: false })

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
