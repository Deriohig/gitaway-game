import type { Blocker, XZ } from '../layout'

// Where the island's characters stay on the main island (Barnaby Wick's camp
// by the garden, while he camps there), and the areas around them that
// animals and moved things keep clear of. Import only types from ../layout:
// it imports this file.

/**
 * Barnaby's camp, a lean-to over a bedroll, about 1.0 by 0.7: a step outside
 * the garden fence's west side, between the dirt path to the gate and the
 * art's path to the highland, where the default camera sees it over the
 * garden, through the gap the gate leaves in the fence. Its ground keeps clear
 * of every other area, every slot and every path (placement.test.ts), and the
 * composition keeps off it (layout.ts SLOT_DISCS).
 */
export const CAMP: XZ = [-0.85, -0.85]
/** The camp's turn (rotation.y): the lean-to's open front (+Z) to the camera, as the woodshed's is, so the bedroll shows under it. */
export const CAMP_ROT = Math.PI / 4
/** Which way from the camp Barnaby stands: before the lean-to's left end as the camera sees it (radians from its +Z towards its +X). */
const STAND_BEARING = -0.61
/**
 * Where Barnaby stands while he camps: 0.75 u from the camp, clear of the
 * lean-to's poles and guy lines and of the books and candle laid out before
 * its left end (public/models/barnaby_camp.glb, modelPlacement.test.ts). He
 * faces the farmhouse.
 */
export const CAMP_STAND: XZ = [CAMP[0] + 0.75 * Math.sin(CAMP_ROT + STAND_BEARING), CAMP[1] + 0.75 * Math.cos(CAMP_ROT + STAND_BEARING)]

/** Barnaby's tap target, an invisible ball round him (features/Barnaby.tsx): how high its middle is, and how far it reaches. */
export const TAP = { height: 0.55, reach: 0.5 }

export const CHARACTER_BLOCKERS: Blocker[] = [
  { at: CAMP, r: 0.65 },
  // Where he stands by it, so no hen stops in him or takes a tap meant for him: his tap target, and a
  // little over, as an animal's walk is looked at in steps (wander.ts).
  { at: CAMP_STAND, r: TAP.reach + 0.05 },
]
