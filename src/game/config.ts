// The whole game economy lives here. UI and world code read from these tables
// and never hardcode prices, rates or unlock levels. Content for the idle-loop
// systems (visitors, goods, bundles and so on) lives in ./content.

import type { BundleId } from './content/bundles'
import { yieldEffect } from './content/yields'
import type { FeatureId } from './features'

export const MINUTE = 60_000

export const SESSION = {
  /** Coins earned per credited minute of a work session. */
  coinsPerMinute: 10,
  /** XP earned per credited minute of a work session. */
  xpPerMinute: 1,
  /** One piece of wood for every N credited minutes. */
  minutesPerWood: 10,
  /** Shorter sessions are ended without a reward. */
  minMinutes: 1,
  /** A single session stops accruing after this many minutes. */
  maxMinutes: 240,
  /** Credited session minutes per local calendar day. */
  dailyMinuteCap: 480,
  /** Elapsed minutes at which a gentle milestone note appears. */
  milestones: [25, 60, 120, 180, 240],
} as const

export const TASKS = {
  coins: 40,
  xp: 5,
  /** Pieces of wood for each rewarded task, so the first isle doesn't wait on hours of sessions. */
  wood: 2,
  /** Rewarded task entries per local calendar day. */
  dailyLimit: 12,
  maxTitleLength: 80,
} as const

/** Rewards for your own commits in repositories you chose (desktop app only). */
/**
 * The farm-only setting, for someone playing without any work to bring. The
 * farm's coins, wood and XP are multiplied; see the balance report's farm-only player.
 */
export const FARM_ONLY = { pay: 3 }

export const COMMITS = {
  coins: 20,
  xp: 3,
  /** Commits credited per local calendar day, across all repositories. */
  dailyLimit: 20,
  maxRepos: 8,
} as const

export type CropId =
  | 'radish'
  | 'carrot'
  | 'wheat'
  | 'lettuce'
  | 'tomato'
  | 'sunflower'
  | 'pumpkin'
  | 'blueberry'
  | 'cranberry'
  | 'lavender'

export interface CropDef {
  id: CropId
  name: string
  plural: string
  seedCost: number
  growMinutes: number
  coins: number
  /** The most XP a harvest earns. A short crop earns less, by its grow time (GROW_MINUTES_PER_XP). */
  xp: number
  unlockLevel: number
  /** Something that has to be owned before it can be grown, such as its island. */
  requires?: ItemId
  /** The idle-loop feature it belongs to; it's hidden while that feature is switched off (see features.ts). */
  feature?: FeatureId
  blurb: string
}

export const CROPS: Record<CropId, CropDef> = {
  radish: {
    id: 'radish', name: 'Radish', plural: 'radishes', seedCost: 3, growMinutes: 5, coins: 4, xp: 1, unlockLevel: 1,
    blurb: 'Ready before your coffee cools.',
  },
  carrot: {
    id: 'carrot', name: 'Carrot', plural: 'carrots', seedCost: 3, growMinutes: 15, coins: 5, xp: 1, unlockLevel: 1,
    blurb: 'A dependable little root.',
  },
  wheat: {
    id: 'wheat', name: 'Wheat', plural: 'sheaves of wheat', seedCost: 5, growMinutes: 20, coins: 6, xp: 1, unlockLevel: 2,
    blurb: "Mills into flour, or sways nicely if you'd rather.",
  },
  lettuce: {
    id: 'lettuce', name: 'Lettuce', plural: 'lettuces', seedCost: 5, growMinutes: 30, coins: 7, xp: 1, unlockLevel: 2,
    blurb: 'Crisp, leafy, low maintenance.',
  },
  tomato: {
    id: 'tomato', name: 'Tomato', plural: 'tomatoes', seedCost: 6, growMinutes: 60, coins: 8, xp: 1, unlockLevel: 3,
    blurb: 'Ripens over a long meeting.',
  },
  sunflower: {
    id: 'sunflower', name: 'Sunflower', plural: 'sunflowers', seedCost: 6, growMinutes: 90, coins: 9, xp: 1, unlockLevel: 4,
    blurb: 'Always faces the good news.',
  },
  pumpkin: {
    id: 'pumpkin', name: 'Pumpkin', plural: 'pumpkins', seedCost: 8, growMinutes: 150, coins: 10, xp: 1, unlockLevel: 5,
    blurb: 'Slow, round and deeply satisfying.',
  },
  blueberry: {
    id: 'blueberry', name: 'Blueberry', plural: 'blueberries', seedCost: 13, growMinutes: 300, coins: 16, xp: 1, unlockLevel: 9,
    blurb: 'Plant before lunch, pick before home time.',
  },
  cranberry: {
    id: 'cranberry', name: 'Cranberry', plural: 'cranberries', seedCost: 14, growMinutes: 240, coins: 16, xp: 1, unlockLevel: 1,
    requires: 'wetland', feature: 'wildIsles',
    blurb: 'Tart, red and very at home in the wet.',
  },
  lavender: {
    id: 'lavender', name: 'Lavender', plural: 'bunches of lavender', seedCost: 12, growMinutes: 600, coins: 16, xp: 1, unlockLevel: 1,
    requires: 'highland', feature: 'wildIsles',
    blurb: 'Smells like a long weekend.',
  },
}

export const CROP_IDS = Object.keys(CROPS) as CropId[]

/**
 * Crop XP follows grow time, so replanting a short crop at the desk can't
 * out-level work (spec §2, T2): a harvest earns a point of XP for every this
 * many minutes the crop grows, up to the crop's own `xp`. Clicking any one
 * crop on every plot, greenhouse or not, then keeps within the spec's "work
 * pays about 2.5 times the farm" (engine.test.ts checks the numbers).
 * Fractions of a point are carried until they make a whole one
 * (`harvestXpCarry`). Every short crop earns whole tenths, which the carry
 * (rounded to a millionth) adds up exactly; a rate giving thirds or twelfths
 * would fall a hair short.
 */
export const GROW_MINUTES_PER_XP = 50

export const PLOTS = {
  starting: 4,
  max: 16,
  /** Cost of the n-th purchased plot (0-based) is base + step * n. */
  baseCost: 60,
  costStep: 12,
} as const

// ---------------------------------------------------------------------------
// Things you can add to the island.

export type ItemCategory = 'garden' | 'decor' | 'building' | 'land' | 'animal'

/** The islands things can live on. */
export type IslandId = 'main' | 'meadow' | 'grove' | 'islet' | 'wetland' | 'highland' | 'cottage' | 'orchard'

export type ItemId =
  | 'plot'
  | 'flowerbed'
  | 'fence'
  | 'path'
  | 'lantern'
  | 'bench'
  | 'scarecrow'
  | 'woodshed'
  | 'well'
  | 'beehive'
  | 'fruitTree'
  | 'windmill'
  | 'greenhouse'
  | 'meadow'
  | 'grove'
  | 'islet'
  | 'lighthouse'
  | 'chicken'
  | 'duck'
  | 'sheep'
  | 'workbench'
  | 'barn'
  | 'press'
  | 'loom'
  | 'wetland'
  | 'highland'
  | 'cottageLand'
  | 'orchardLand'
  | 'boardwalk'
  | 'lilyLantern'
  | 'goat'
  | 'stoneCircle'
  | 'gazebo'
  | 'hotSpring'
  | 'observatory'
  | 'birdhouse'
  | 'planter'
  | 'signpost'
  | 'windChime'
  | 'picnicTable'
  | 'hammock'
  | 'arbour'
  | 'rowboat'
  | 'dovecote'
  | 'treehouse'

/** Where a thing comes from: bought in the shop, or made from wood at the workbench. */
export type ItemSource = 'shop' | 'workbench'

export interface ItemDef {
  id: ItemId
  name: string
  category: ItemCategory
  coins: number
  wood: number
  max: number
  unlockLevel: number
  /** Another item that must be owned first. */
  requires?: ItemId
  /** How many restoration bundles must be finished first, while restorations are switched on (see available.ts). */
  requiresBundles?: number
  /** A particular restoration that must be finished first. */
  requiresBundle?: BundleId
  /** Shop by default. Workbench crafts are never bought; they take wood and real time. */
  source?: ItemSource
  /** Real minutes a workbench craft takes. */
  craftMinutes?: number
  /** The island it lives on, when it isn't the main one. */
  island?: IslandId
  /**
   * The idle-loop feature it belongs to; it's hidden while that feature is
   * switched off (see features.ts). Workbench crafts also need the workshop,
   * things that wait on a particular restoration need the restorations, and
   * things that require another item need that item to be shown (see
   * available.ts).
   */
  feature?: FeatureId
  xp: number
  blurb: string
  /** A short line describing a gameplay effect, if any. */
  effect?: string
}

export const ITEMS: Record<ItemId, ItemDef> = {
  plot: {
    id: 'plot', name: 'Garden plot', category: 'garden', coins: PLOTS.baseCost, wood: 0,
    max: PLOTS.max - PLOTS.starting, unlockLevel: 1, xp: 4,
    blurb: 'Another bed of soft, dark soil.',
  },
  flowerbed: {
    id: 'flowerbed', name: 'Flower bed', category: 'decor', coins: 150, wood: 0, max: 8, unlockLevel: 1, xp: 3,
    blurb: 'Wildflowers for the bees and the soul.',
  },
  fence: {
    id: 'fence', name: 'Fence run', category: 'decor', coins: 300, wood: 6, max: 5, unlockLevel: 1, xp: 3,
    blurb: 'A low timber fence around the garden.',
  },
  path: {
    id: 'path', name: 'Stepping stones', category: 'decor', coins: 120, wood: 0, max: 4, unlockLevel: 1, xp: 3,
    blurb: 'A winding stone path to somewhere nice.',
  },
  lantern: {
    id: 'lantern', name: 'Garden lantern', category: 'decor', coins: 200, wood: 0, max: 6, unlockLevel: 4, xp: 5,
    blurb: 'Glows softly when the evening comes in.',
  },
  bench: {
    id: 'bench', name: 'Pond bench', category: 'decor', coins: 500, wood: 0, max: 1, unlockLevel: 10, xp: 6,
    blurb: 'For sitting. Just sitting.',
  },
  scarecrow: {
    id: 'scarecrow', name: 'Scarecrow', category: 'decor', coins: 400, wood: 0, max: 1, unlockLevel: 11, xp: 5,
    blurb: 'Wears your old conference T-shirt.',
  },
  woodshed: {
    id: 'woodshed', name: 'Woodshed', category: 'building', coins: 50, wood: 0, max: 1, unlockLevel: 1, xp: 6,
    blurb: "A lean-to for the logs the island's own trees give up.",
    effect: 'Stacks wood to collect, more once you own the grove.',
  },
  well: {
    id: 'well', name: 'Stone well', category: 'building', coins: 800, wood: 0, max: 1, unlockLevel: 8, xp: 10,
    blurb: 'Cool water and a place to make wishes.',
  },
  beehive: {
    id: 'beehive', name: 'Beehive', category: 'decor', coins: 200, wood: 0, max: 3, unlockLevel: 6, xp: 8,
    blurb: 'A small, buzzing workforce. They never ask for standups.',
    effect: yieldEffect('honey', 'Fills'),
  },
  fruitTree: {
    id: 'fruitTree', name: 'Fruit tree', category: 'building', coins: 150, wood: 0, max: 8, unlockLevel: 7, xp: 6,
    blurb: 'Plant enough and you have an orchard.',
    effect: yieldEffect('fruit', 'Drops'),
  },
  windmill: {
    id: 'windmill', name: 'Windmill', category: 'building', coins: 1500, wood: 0, max: 1, unlockLevel: 9, xp: 30,
    blurb: 'Turns lazily in the breeze and mills your harvest.',
    effect: 'Harvests earn 10% more coins.',
  },
  greenhouse: {
    id: 'greenhouse', name: 'Greenhouse', category: 'building', coins: 3500, wood: 0, max: 1, unlockLevel: 12, xp: 40,
    blurb: 'Warm glass and the smell of tomato leaves.',
    effect: 'New crops grow 20% faster.',
  },
  // Land (these three, and the four further down) is claimed in any order with no level, and priced by LAND: its
  // coins and wood stay 0.
  meadow: {
    id: 'meadow', name: 'Meadow isle', category: 'land', coins: 0, wood: 0, max: 1, unlockLevel: 1, xp: 80,
    blurb: 'A stretch of long grass that rises from the clouds beside the farm.',
    effect: 'Sheep can graze here: wool to collect.',
  },
  grove: {
    id: 'grove', name: 'Forest grove', category: 'land', coins: 0, wood: 0, max: 1, unlockLevel: 1, xp: 80,
    blurb: 'A quiet island of tall trees and mushrooms.',
    effect: 'Its trees give a woodshed more wood to stack.',
  },
  islet: {
    id: 'islet', name: 'Lighthouse islet', category: 'land', coins: 0, wood: 0, max: 1, unlockLevel: 1, xp: 80,
    blurb: 'A rocky outcrop on the edge of the cloud sea.',
    effect: 'Room for the lighthouse.',
  },
  lighthouse: {
    id: 'lighthouse', name: 'Lighthouse', category: 'building', coins: 4000, wood: 60, max: 1, unlockLevel: 1,
    requires: 'islet', island: 'islet', xp: 70,
    blurb: 'A steady light for the end of a long sprint.',
  },
  chicken: {
    id: 'chicken', name: 'Chicken', category: 'animal', coins: 60, wood: 0, max: 8, unlockLevel: 1, xp: 5,
    blurb: 'Busy, opinionated, excellent company.',
    effect: yieldEffect('eggs', 'Lays'),
  },
  duck: {
    id: 'duck', name: 'Duck', category: 'animal', coins: 80, wood: 0, max: 5, unlockLevel: 3, xp: 6,
    blurb: 'Paddles in slow circles on the pond.',
    effect: yieldEffect('eggs', 'Lays'),
  },
  sheep: {
    id: 'sheep', name: 'Sheep', category: 'animal', coins: 120, wood: 0, max: 6, unlockLevel: 1, requires: 'meadow', island: 'meadow', xp: 8,
    blurb: 'Grazes on the meadow isle. Very fluffy.',
    effect: yieldEffect('wool', 'Grows'),
  },

  // The idle loop: workshops, new isles and their things.
  //
  // NOT YET TUNED: the things behind switched-off features below (the workbench, barn, oil press and spinning wheel;
  // the boardwalk, lily lantern, standing stones and hot spring; the gazebo and observatory; and every workbench
  // craft) still have their prices, wood and levels on the old scale, from before the idle economy
  // (docs/superpowers/specs/2026-10-22-idle-economy-design.md). Retune each with `npm run balance` when its feature
  // turns on.
  workbench: {
    id: 'workbench', name: 'Workbench', category: 'building', coins: 60, wood: 6, max: 1, unlockLevel: 3, feature: 'workshop', xp: 12,
    blurb: 'A sturdy bench under the oak, for making things slowly.',
    effect: 'Craft decorations from wood.',
  },
  barn: {
    id: 'barn', name: 'Barn', category: 'building', coins: 90, wood: 10, max: 1, unlockLevel: 3, feature: 'workshop', xp: 15,
    blurb: 'Big, red-ish and dry inside. Smells of hay and good intentions.',
    effect: 'Keeps harvests and goods. Nothing in here ever spoils. Opens the kitchen.',
  },
  press: {
    id: 'press', name: 'Oil press', category: 'building', coins: 160, wood: 12, max: 1, unlockLevel: 5, requires: 'barn', feature: 'workshop', xp: 20,
    blurb: 'Squeezes the sunshine out of sunflowers.',
    effect: 'Presses sunflowers into oil.',
  },
  loom: {
    id: 'loom', name: 'Spinning wheel', category: 'building', coins: 200, wood: 10, max: 1, unlockLevel: 6, requires: 'sheep', feature: 'workshop', xp: 24,
    blurb: 'Clicks along like a well-loved keyboard.',
    effect: 'Spins wool into yarn.',
  },
  // Land, priced by LAND like the meadow, grove and islet.
  wetland: {
    id: 'wetland', name: 'Wetland isle', category: 'land', coins: 0, wood: 0, max: 1, unlockLevel: 1, requiresBundles: 4,
    island: 'wetland', feature: 'wildIsles', xp: 80,
    blurb: 'A reedy island of still water and dragonflies.',
    effect: 'Cranberries grow here, and fish can be caught.',
  },
  highland: {
    id: 'highland', name: 'Highland isle', category: 'land', coins: 0, wood: 0, max: 1, unlockLevel: 1, requiresBundles: 9,
    island: 'highland', feature: 'wildIsles', xp: 80,
    blurb: 'A windy island of heather and old stones.',
    effect: 'Goats and lavender.',
  },
  // The cottage's and the orchard's pieces as plain land, priced by LAND. The retirement cottage (C3) and the repo
  // orchard (C1) keep the words `cottage` and `orchard` for themselves, and build on this land once it is owned.
  cottageLand: {
    id: 'cottageLand', name: 'Woodland glade', category: 'land', coins: 0, wood: 0, max: 1, unlockLevel: 1,
    island: 'cottage', feature: 'ringIsles', xp: 80,
    blurb: 'A quiet clearing in the pines that rises from the clouds and docks at the edge of the farm.',
    effect: 'Wildflowers: room for 3 more beehives.',
  },
  orchardLand: {
    id: 'orchardLand', name: 'Orchard isle', category: 'land', coins: 0, wood: 0, max: 1, unlockLevel: 1,
    island: 'orchard', feature: 'ringIsles', xp: 80,
    blurb: 'A sheltered clearing with fruit trees in rows that rises from the clouds and docks behind the farm.',
    effect: 'Its 8 trees bear fruit to collect.',
  },
  boardwalk: {
    id: 'boardwalk', name: 'Boardwalk', category: 'decor', coins: 45, wood: 6, max: 3, unlockLevel: 9, requires: 'wetland',
    island: 'wetland', feature: 'biomes', xp: 6,
    blurb: 'Planks over the shallows, so nobody gets wet socks.',
  },
  lilyLantern: {
    id: 'lilyLantern', name: 'Lily lantern', category: 'decor', coins: 30, wood: 1, max: 4, unlockLevel: 9, requires: 'wetland',
    island: 'wetland', feature: 'biomes', xp: 5,
    blurb: 'A paper lantern that floats among the lily pads.',
  },
  goat: {
    id: 'goat', name: 'Goat', category: 'animal', coins: 150, wood: 0, max: 4, unlockLevel: 1, requires: 'highland', island: 'highland', feature: 'wildIsles', xp: 9,
    blurb: 'Will eat the documentation if you let it.',
    effect: yieldEffect('milk', 'Gives'),
  },
  stoneCircle: {
    id: 'stoneCircle', name: 'Standing stones', category: 'decor', coins: 250, wood: 0, max: 1, unlockLevel: 12, requires: 'highland',
    island: 'highland', feature: 'biomes', xp: 20,
    blurb: 'Nobody knows who put them there. They seem pleased you asked.',
  },
  gazebo: {
    id: 'gazebo', name: 'Gazebo', category: 'building', coins: 900, wood: 24, max: 1, unlockLevel: 13, feature: 'lateBuildings', xp: 60,
    blurb: 'Somewhere to stand out of the drizzle and admire things.',
  },
  hotSpring: {
    id: 'hotSpring', name: 'Hot spring', category: 'building', coins: 1100, wood: 20, max: 1, unlockLevel: 15, requires: 'highland',
    island: 'highland', feature: 'biomes', xp: 70,
    blurb: 'Warm water on a cold hill. Bring a towel.',
  },
  observatory: {
    id: 'observatory', name: 'Observatory', category: 'building', coins: 1600, wood: 40, max: 1, unlockLevel: 16, requires: 'islet',
    island: 'islet', feature: 'lateBuildings', xp: 90,
    blurb: 'For looking at the stars, and now and then at the lighthouse.',
  },

  // Workbench crafts: wood only, real time, one at a time.
  birdhouse: {
    id: 'birdhouse', name: 'Birdhouse', category: 'decor', source: 'workbench', coins: 0, wood: 3, craftMinutes: 20, max: 3, unlockLevel: 3, xp: 4,
    blurb: 'A tiny house with a round door. Rent: one song a day.',
  },
  planter: {
    id: 'planter', name: 'Planter box', category: 'decor', source: 'workbench', coins: 0, wood: 4, craftMinutes: 30, max: 4, unlockLevel: 3, xp: 4,
    blurb: 'Herbs at a sensible height, no kneeling required.',
  },
  signpost: {
    id: 'signpost', name: 'Signpost', category: 'decor', source: 'workbench', coins: 0, wood: 2, craftMinutes: 15, max: 1, unlockLevel: 3, xp: 3,
    blurb: 'Points to places. Most of them are on this island.',
  },
  windChime: {
    id: 'windChime', name: 'Wind chime', category: 'decor', source: 'workbench', coins: 0, wood: 2, craftMinutes: 15, max: 2, unlockLevel: 4, xp: 3,
    blurb: 'Reports the weather, musically.',
  },
  picnicTable: {
    id: 'picnicTable', name: 'Picnic table', category: 'decor', source: 'workbench', coins: 0, wood: 6, craftMinutes: 45, max: 1, unlockLevel: 5, xp: 8,
    blurb: 'Seats six, or one person and a very long lunch.',
  },
  hammock: {
    id: 'hammock', name: 'Hammock', category: 'decor', source: 'workbench', coins: 0, wood: 5, craftMinutes: 40, max: 1, unlockLevel: 6, xp: 7,
    blurb: 'Do not schedule anything here.',
  },
  arbour: {
    id: 'arbour', name: 'Rose arbour', category: 'decor', source: 'workbench', coins: 0, wood: 8, craftMinutes: 60, max: 1, unlockLevel: 7, xp: 10,
    blurb: 'An arch of climbing roses to walk under on the way to nowhere.',
  },
  rowboat: {
    id: 'rowboat', name: 'Rowboat', category: 'decor', source: 'workbench', coins: 0, wood: 10, craftMinutes: 90, max: 1, unlockLevel: 8,
    requiresBundle: 'pondJetty', xp: 12,
    blurb: 'For drifting about the pond with nowhere to be.',
  },
  dovecote: {
    id: 'dovecote', name: 'Dovecote', category: 'decor', source: 'workbench', coins: 0, wood: 9, craftMinutes: 60, max: 1, unlockLevel: 9, xp: 12,
    blurb: 'A white tower of little doors. The doves are very polite about it.',
  },
  treehouse: {
    id: 'treehouse', name: 'Treehouse', category: 'decor', source: 'workbench', coins: 0, wood: 16, craftMinutes: 120, max: 1, unlockLevel: 10,
    requires: 'grove', island: 'grove', xp: 20,
    blurb: 'A hideout in the grove. No grown-ups allowed, except you.',
  },
}

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]

/** How many of an item every farm starts with (the two first chickens). */
export const startingCount = (id: ItemId): number => START.animals[id] ?? 0

export const PRICING = {
  /** Each extra unit of a repeatable item costs this much more than the last (plots have their own steps). */
  repeatGrowth: 1.12,
} as const

/**
 * Land is claimed in any order, at one price for every piece not yet owned
 * (spec §4): in each currency, its base times its growth for every piece
 * already owned. Tuned with the simulator (`npm run balance`).
 */
export const LAND = {
  coins: { base: 100, growth: 1.75 },
  wood: { base: 8, growth: 1.57 },
} as const

/** Levels at which parts of the idle loop open (spec §4). */
export const UNLOCKS = {
  almanac: 2,
  visitors: 4,
  island: 6,
} as const

/** Animals that arrive on their own as the farm grows, never bought. */
export type GiftAnimalId = 'cat' | 'dog'

export const GIFTS: { level: number; animal: GiftAnimalId; title: string; detail: string }[] = [
  { level: 2, animal: 'cat', title: 'A cat has moved in', detail: 'It has already claimed the warmest windowsill.' },
  { level: 5, animal: 'dog', title: 'A dog wandered up the path', detail: 'It seems to have decided to stay.' },
]

// ---------------------------------------------------------------------------
// Levels

/** Total XP needed to reach each level. Index 0 is level 1. */
export const LEVEL_XP = [
  0, 40, 120, 260, 460, 720, 1050, 1500, 2000, 2800, 3600, 4450,
  5400, 6450, 7600, 8900, 10350, 12000, 13850, 15850,
]

export const LEVEL_TITLES = [
  'Weekend Plot',
  'Allotment',
  'Smallholding',
  'Hobby Farm',
  'Homestead',
  'Country Retreat',
  'Orchard Keeper',
  'Valley Farm',
  'Island Estate',
  'Islander',
  'Old Hand',
  'Cloud Sea Elder',
  'Drystone Waller',
  'Wetland Warden',
  'Lantern Keeper',
  'Highland Crofter',
  'Almanac Author',
  'Archipelago Steward',
  'Sky Gardener',
  'Part of the Furniture',
]

/** Coins gifted on reaching a level. */
export const levelBonus = (level: number) => 15 + level * 10

export const START = {
  coins: 300,
  wood: 12,
  seeds: { radish: 4, carrot: 2 } as Partial<Record<CropId, number>>,
  animals: { chicken: 2 } as Partial<Record<ItemId, number>>,
  farmName: 'Willow Hollow',
} as const

export const BONUS = {
  windmillHarvest: 0.1,
  greenhouseGrowth: 0.2,
  /** Extra pay for a crop that differs from the one its plot last grew (see `isFresh`). */
  freshSoil: 0.25,
} as const

// ---------------------------------------------------------------------------
// Idle yields (rates and values in content/yields.ts)

/** Each kind of yield stops filling at this many hours' worth: a cap, never a loss. */
export const YIELD_CAP_HOURS = 72

/** Sources the grove adds to the woodshed. */
export const GROVE_WOOD_SOURCES = 1

/** Sources the orchard isle adds to the fruit trees. */
export const ORCHARD_FRUIT_TREES = 8

/** Beehives the woodland glade's wildflowers make room for, beyond the farm's own. */
export const GLADE_HIVES = 3

export const RECENT_LIMIT = 6
