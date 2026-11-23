// Test helpers for the feature switches (see features.ts). The switches are a
// plain object read whenever the game asks, so a test can flip some for a
// while and put them back afterwards. Also farms for tests and benchmarks.

import { afterEach, beforeEach } from 'vitest'
import { advance } from './advance'
import { LEVEL_XP } from './config'
import { plantAll } from './engine'
import { FEATURES, type FeatureId } from './features'
import { createInitialState, type GameState, type JournalEntry, type JournalKind } from './state'

export type Switches = Partial<Record<FeatureId, boolean>>

const ALL = Object.keys(FEATURES) as FeatureId[]

/** Every feature switched on, or off. */
export const ALL_ON: Switches = Object.fromEntries(ALL.map((f) => [f, true]))
export const ALL_OFF: Switches = Object.fromEntries(ALL.map((f) => [f, false]))

/** Runs `fn` with some switches flipped, then puts every switch back as it was. */
export function withFeatures<T>(switches: Switches, fn: () => T): T {
  const saved = { ...FEATURES }
  Object.assign(FEATURES, switches)
  try {
    return fn()
  } finally {
    Object.assign(FEATURES, saved)
  }
}

/**
 * A farm well into the game at `now`: level 12, every plot growing pumpkins,
 * and 2,400 journal lines (400 of each busy kind, the rest stories and
 * visitors). Already caught up, so nothing is due until time moves on.
 */
export function longJournalFarm(now = Date.UTC(2026, 9, 17, 9, 0, 0)): GameState {
  const kinds: [JournalKind, number][] = [['work', 400], ['garden', 400], ['build', 400], ['craft', 400], ['story', 400], ['visitor', 400]]
  const journal: JournalEntry[] = []
  let id = 2400
  for (const [kind, n] of kinds) {
    for (let i = 0; i < n; i++, id--) journal.push({ id, at: now - id * 60_000, kind, title: `${kind} line ${id}`, detail: 'Something small happened on the island.' })
  }
  const farm = { ...createInitialState(now - 90 * 86_400_000), xp: LEVEL_XP[11], levelSeen: 12, journal, journalSeq: 2400 }
  farm.seeds.pumpkin = 99
  return advance(plantAll(farm, 'pumpkin', now).state, now).state
}

/** Flips some switches for each test in the enclosing `describe` (or file), and puts them back after each. */
export function useFeatures(switches: Switches): void {
  let saved = { ...FEATURES }
  beforeEach(() => {
    saved = { ...FEATURES }
    Object.assign(FEATURES, switches)
  })
  afterEach(() => {
    Object.assign(FEATURES, saved)
  })
}
