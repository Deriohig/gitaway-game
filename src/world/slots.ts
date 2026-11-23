import { isOn } from '../game/features'
import type { GameState, Placement } from '../game/state'
import { useGame } from '../store/game'
import { insideRim, type XZ } from './layout'

// Where a placeable thing stands. Things start in their layout slot; the
// island studio can move, turn and recolour them, which is stored in
// `placements` and `tints` under the key `${itemId}#${index}` (see slotKey).
// They stand on the farm's own piece, clear of its rim, so never on a seam
// with a docked piece: a saved spot that isn't is ignored.

/** How far inside the farm's rim a moved thing must stand. */
export const RIM_CLEARANCE = 0.6

/** Whether a moved thing may stand here: on the farm's own piece, clear of its rim (and so of every seam). */
export const placeable = (x: number, z: number): boolean => insideRim(x, z) >= RIM_CLEARANCE

export interface Slot {
  x: number
  z: number
  rot: number
  /** Palette swatch, or null for the thing's own colours. */
  tint: number | null
}

// Saved moves and colours count only while the studio is switched on; until
// then everything stands in its own slot, in its own colours.
const placementOf = (game: Pick<GameState, 'placements'>, key: string): Placement | undefined => {
  const placed = isOn('studio') ? game.placements[key] : undefined
  return placed && placeable(placed.x, placed.z) ? placed : undefined
}
const tintOf = (game: Pick<GameState, 'tints'>, key: string): number | undefined => (isOn('studio') ? game.tints[key] : undefined)

function slotFrom(placed: Placement | undefined, tint: number | undefined, defaultXZ: XZ, defaultRot: number): Slot {
  return {
    x: placed?.x ?? defaultXZ[0],
    z: placed?.z ?? defaultXZ[1],
    rot: placed?.rot ?? defaultRot,
    tint: tint ?? null,
  }
}

/** Where a thing stands and what colour it is, for a farm. */
export function slotFor(game: Pick<GameState, 'placements' | 'tints'>, key: string, defaultXZ: XZ, defaultRot = 0): Slot {
  return slotFrom(placementOf(game, key), tintOf(game, key), defaultXZ, defaultRot)
}

export function useSlot(key: string, defaultXZ: XZ, defaultRot = 0): Slot {
  const placed = useGame((s) => placementOf(s.game, key))
  const tint = useGame((s) => tintOf(s.game, key))
  return slotFrom(placed, tint, defaultXZ, defaultRot)
}
