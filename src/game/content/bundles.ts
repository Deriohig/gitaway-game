import type { CropId, IslandId, ItemId } from '../config'
import type { GoodId } from './goods'
import type { VisitorId } from './visitors'

// Island restorations (B3). Each bundle lists what it needs; deposits are
// permanent and can be partial. A finished bundle changes the world for good.

export type BundleId =
  | 'gardenGate'
  | 'pondJetty'
  | 'kitchenShelf'
  | 'waterwheel'
  | 'wildflowers'
  | 'shepherdsHut'
  | 'stoneBridge'
  | 'mushroomRing'
  | 'woodcutter'
  | 'treetopWalk'
  | 'keeperCottage'
  | 'skyHarbour'
  | 'signalFire'
  | 'boardwalkLoop'
  | 'reedBeds'
  | 'heronHide'
  | 'stoneCircle'
  | 'bothy'
  | 'summitCairn'

/** Crops, goods, wood, coins and keepsakes are brought and used up; `built` and `seen` are conditions. */
export type BundleNeed =
  | { kind: 'crop'; id: CropId; n: number }
  | { kind: 'good'; id: GoodId; n: number }
  | { kind: 'wood'; n: number }
  | { kind: 'coins'; n: number }
  | { kind: 'anyKeepsakes'; n: number }
  | { kind: 'built'; item: ItemId; n: number }
  | { kind: 'seen'; visitor: VisitorId }

export interface BundleDef {
  id: BundleId
  /** Position on the board, from 1. */
  order: number
  island: IslandId
  name: string
  needs: BundleNeed[]
  xp: number
  /** The permanent change in the world when it's done. */
  change: string
}

const crop = (id: CropId, n: number): BundleNeed => ({ kind: 'crop', id, n })
const good = (id: GoodId, n: number): BundleNeed => ({ kind: 'good', id, n })
const wood = (n: number): BundleNeed => ({ kind: 'wood', n })
const coins = (n: number): BundleNeed => ({ kind: 'coins', n })
const built = (item: ItemId, n = 1): BundleNeed => ({ kind: 'built', item, n })

export const BUNDLES: Record<BundleId, BundleDef> = {
  gardenGate: {
    id: 'gardenGate', order: 1, island: 'main', name: 'Garden Gate', needs: [crop('carrot', 6), crop('radish', 6), crop('wheat', 4)], xp: 40,
    change: 'A stone arch over the garden gate; the scarecrow learns to replant.',
  },
  pondJetty: {
    id: 'pondJetty', order: 2, island: 'main', name: 'Fishing Bench', needs: [wood(8), good('honey', 2)], xp: 60,
    change: 'A bench by the pond; fishing opens.',
  },
  kitchenShelf: {
    id: 'kitchenShelf', order: 3, island: 'main', name: 'Kitchen Shelf', needs: [good('flour', 2), good('jam', 2), good('eggs', 6)], xp: 80,
    change: 'A porch with a herb rack and a little table.',
  },
  waterwheel: {
    id: 'waterwheel', order: 4, island: 'main', name: 'Waterwheel', needs: [coins(300), wood(10)], xp: 60,
    change: 'A waterwheel on the stream.',
  },
  wildflowers: {
    id: 'wildflowers', order: 5, island: 'meadow', name: 'Wildflower Meadow', needs: [built('beehive'), crop('sunflower', 6), built('flowerbed', 2)], xp: 70,
    change: 'The meadow bursts into wildflowers.',
  },
  shepherdsHut: {
    id: 'shepherdsHut', order: 6, island: 'meadow', name: "Shepherd's Hut", needs: [good('wool', 4), good('yarn', 2), wood(12)], xp: 90,
    change: "A shepherd's hut on wheels.",
  },
  stoneBridge: {
    // Its id is from when the meadow was reached by a rope bridge; docked, it gets a wall along its seam instead.
    id: 'stoneBridge', order: 7, island: 'meadow', name: 'Drystone Wall', needs: [coins(600), wood(20)], xp: 80,
    change: 'A drystone wall and gate where the meadow meets the farm.',
  },
  mushroomRing: {
    id: 'mushroomRing', order: 8, island: 'grove', name: 'Mushroom Ring', needs: [built('lantern'), crop('pumpkin', 4), wood(10)], xp: 90,
    change: 'A mushroom ring that glows at night.',
  },
  woodcutter: {
    id: 'woodcutter', order: 9, island: 'grove', name: "Woodcutter's Hut", needs: [wood(25), built('birdhouse'), good('oil', 2)], xp: 100,
    change: "A woodcutter's hut.",
  },
  treetopWalk: {
    id: 'treetopWalk', order: 10, island: 'grove', name: 'Treetop Walk', needs: [coins(900), wood(20)], xp: 100,
    change: 'Rope walkways between the trees.',
  },
  keeperCottage: {
    id: 'keeperCottage', order: 11, island: 'islet', name: "Keeper's Cottage", needs: [built('lighthouse'), good('oil', 4)], xp: 110,
    change: 'A cottage by the lighthouse, with a light in the window.',
  },
  skyHarbour: {
    id: 'skyHarbour', order: 12, island: 'islet', name: 'Sky Harbour', needs: [good('jam', 3), good('sauce', 3), good('pickles', 3)], xp: 120,
    change: 'A little harbour with a moored sky-boat; cloud fishing opens.',
  },
  signalFire: {
    id: 'signalFire', order: 13, island: 'islet', name: 'Signal Fire', needs: [coins(1200), wood(30)], xp: 110,
    change: "A beacon on the islet's point.",
  },
  boardwalkLoop: {
    id: 'boardwalkLoop', order: 14, island: 'wetland', name: 'Boardwalk Loop', needs: [crop('cranberry', 6), wood(20)], xp: 120,
    change: 'A boardwalk ring; wetland fishing opens.',
  },
  reedBeds: {
    id: 'reedBeds', order: 15, island: 'wetland', name: 'Reed Beds', needs: [good('cranberrySauce', 4), built('boardwalk')], xp: 130,
    change: 'Tall reed beds along the boardwalk.',
  },
  heronHide: {
    id: 'heronHide', order: 16, island: 'wetland', name: 'Stilt Hide', needs: [coins(1600), wood(30)], xp: 120,
    change: 'A bird hide on stilts.',
  },
  stoneCircle: {
    id: 'stoneCircle', order: 17, island: 'highland', name: 'Stone Circle', needs: [built('goat', 2), crop('lavender', 6), good('milk', 6)], xp: 140,
    change: 'The old stones stand upright again.',
  },
  bothy: {
    id: 'bothy', order: 18, island: 'highland', name: "Crofter's Bothy", needs: [good('soap', 2), good('yarn', 4), good('pie', 2), good('cheese', 2)], xp: 150,
    change: 'A stone bothy with a peat fire; tarn fishing opens.',
  },
  summitCairn: {
    id: 'summitCairn', order: 19, island: 'highland', name: 'Summit Cairn', needs: [coins(2000), wood(40)], xp: 150,
    change: 'A cairn on the highest point.',
  },
}

export const BUNDLE_IDS = Object.keys(BUNDLES) as BundleId[]

/** Whether a need is brought and used up (rather than a condition that just has to hold). */
export const isConsumed = (need: BundleNeed): boolean => need.kind !== 'built' && need.kind !== 'seen'

/** How much of a consumed need there is to bring; conditions count as 0. */
export const needAmount = (need: BundleNeed): number => ('n' in need && isConsumed(need) ? need.n : 0)
