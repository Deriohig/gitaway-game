import type { IslandId, ItemId } from '../config'
import type { BundleId } from './bundles'

// Wild visitors (B1). They are drawn in by what you build and arrive on their
// own time; noticing one leaves a keepsake. Luck here pays in delight only.
// Only the Brown hare comes by now: the others left (docs/lore/CAST.md, C4).

export type VisitorId = 'hare'

/** Something that has to be true on the island for a visitor to come. All of a visitor's needs must hold. */
export type VisitorNeed =
  | { kind: 'owned'; item: ItemId; min: number }
  | { kind: 'level'; level: number }
  | { kind: 'restored'; bundle: BundleId }

export interface VisitorDef {
  id: VisitorId
  name: string
  island: IslandId
  needs: VisitorNeed[]
  keepsake: string
  /** How to find them, for the almanac. */
  hint: string
  /** Where it waits to be noticed, for the "Here now" list ("in the meadow grass"). */
  where: string
  /** The quiet journal line written when it turns up. */
  arrives: string
  /** What it says when you notice it: the first time, then on later visits. In its own voice. */
  says: [first: string, again: string]
}

const owned = (item: ItemId, min = 1): VisitorNeed => ({ kind: 'owned', item, min })

export const VISITORS: Record<VisitorId, VisitorDef> = {
  hare: {
    id: 'hare', name: 'Brown hare', island: 'meadow', needs: [owned('meadow')], keepsake: 'Clover sprig',
    hint: 'Lives in the long grass of the meadow isle.',
    where: 'in the meadow grass',
    arrives: 'A brown hare is sitting up in the long grass of the meadow, ears at full height.',
    says: [
      "I was here first, technically. But the grass is long and I'm not one to argue.",
      'Same grass, same me. Slightly longer ears today, I think.',
    ],
  },
}

export const VISITOR_IDS = Object.keys(VISITORS) as VisitorId[]
