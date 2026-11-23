import { create } from 'zustand'
import type { IsleId } from './layout'

// Which isles are rising into place right now, and which are docked in their
// place. The world element reports them as `data-rising` and `data-docked`,
// next to `data-isles`, so tests can tell an isle has arrived. UI only, never
// saved.

interface RiseState {
  rising: IsleId[]
  docked: IsleId[]
  setRising: (id: IsleId, on: boolean) => void
  setDocked: (id: IsleId, on: boolean) => void
}

const toggle = (list: IsleId[], id: IsleId, on: boolean) => (on ? [...list, id] : list.filter((r) => r !== id))

/**
 * The pieces joined to the farm, so that its rim along them is the middle of
 * the island and the scatter and waterfall there make way: of the pieces
 * drawn, `present`, those that rose in this session (`risingIn`) once docked,
 * and the rest at once.
 */
export function joinedIsles(present: readonly IsleId[], risingIn: readonly IsleId[], docked: readonly IsleId[]): IsleId[] {
  return present.filter((id) => !risingIn.includes(id) || docked.includes(id))
}

export const useRiseState = create<RiseState>((set) => ({
  rising: [],
  docked: [],
  setRising: (id, on) => set((s) => (on === s.rising.includes(id) ? s : { rising: toggle(s.rising, id, on) })),
  setDocked: (id, on) => set((s) => (on === s.docked.includes(id) ? s : { docked: toggle(s.docked, id, on) })),
}))
