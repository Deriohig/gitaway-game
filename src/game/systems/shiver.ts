// The island's shiver (docs/superpowers/specs/2026-10-22-barnaby-design.md §4):
// it runs through the island when work is done, big when a session ends with
// credited minutes, small when a task is logged or a live commit is counted.
// It shivers from day one, whether or not Barnaby has arrived, and pays nothing.

import { isOn } from '../features'
import type { Notice } from '../result'
import type { GameState, ShiverSize } from '../state'
import { barnabyRemark } from './characters'

/** How long after it was made a counted commit still shivers: the watcher looks every couple of minutes while the game is open. */
export const LIVE_COMMIT_MS = 10 * 60_000

/**
 * Whether a report's newest commit (Unix seconds) was made while the game was
 * open, by the device's clock, rather than found on catching up after time away.
 */
export const isLiveCommit = (latestSeconds: number, realNow: number): boolean => realNow - latestSeconds * 1000 <= LIVE_COMMIT_MS

/** The island shivers, and Barnaby may remark on it. Mutates an already-cloned state. */
export function shiver(s: GameState, size: ShiverSize, now: number, out: Notice[]): void {
  if (!isOn('characters')) return
  s.characters.shiver = { at: now, size }
  barnabyRemark(s, size, now, out)
}
