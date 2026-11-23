import type { CropId, ItemId } from '../config'

// Goods (B2): what the barn keeps besides crops. Animals and hives produce a
// few on their own; stations turn crops and goods into something better. The
// barn never lets anything spoil.

export type GoodId =
  | 'eggs'
  | 'honey'
  | 'wool'
  | 'milk'
  | 'flour'
  | 'jam'
  | 'sauce'
  | 'pickles'
  | 'pie'
  | 'cranberrySauce'
  | 'oil'
  | 'soap'
  | 'yarn'
  | 'cheese'

/** Goods that animals and hives make by themselves, over time. */
export type ProducerId = 'eggs' | 'honey' | 'wool' | 'milk'

export type StationId = 'mill' | 'kitchen' | 'press' | 'loom' | 'workbench'

/** Goods made at a station from ingredients. */
export type GoodRecipeId = Exclude<GoodId, ProducerId>

/** Workbench crafts: wood goes in, a decoration comes out (see ITEMS, source 'workbench'). */
export type CraftId = Extract<
  ItemId,
  'birdhouse' | 'planter' | 'signpost' | 'windChime' | 'picnicTable' | 'hammock' | 'arbour' | 'rowboat' | 'dovecote' | 'treehouse'
>

/** Anything a station can be busy with. */
export type RecipeId = GoodRecipeId | CraftId

export interface GoodDef {
  id: GoodId
  name: string
  /** How one unit and several are counted: "a jar of jam", "3 jars of jam". */
  unit: [one: string, many: string]
  /** Coins when sold from the barn. */
  value: number
  blurb: string
}

export const GOODS: Record<GoodId, GoodDef> = {
  eggs: { id: 'eggs', name: 'Eggs', unit: ['egg', 'eggs'], value: 10, blurb: 'Still warm, mostly brown, one slightly blue.' },
  honey: { id: 'honey', name: 'Honey', unit: ['jar of honey', 'jars of honey'], value: 28, blurb: 'Tastes faintly of whatever is flowering.' },
  wool: { id: 'wool', name: 'Wool', unit: ['fleece', 'fleeces'], value: 24, blurb: 'Soft, a bit greasy, smells of meadow.' },
  milk: { id: 'milk', name: 'Milk', unit: ['pail of milk', 'pails of milk'], value: 20, blurb: 'From a goat with opinions.' },
  flour: { id: 'flour', name: 'Flour', unit: ['bag of flour', 'bags of flour'], value: 58, blurb: 'Stone-ground by a windmill in no hurry.' },
  jam: { id: 'jam', name: 'Blueberry jam', unit: ['jar of jam', 'jars of jam'], value: 265, blurb: 'Dark, glossy and gone by Thursday.' },
  sauce: { id: 'sauce', name: 'Tomato sauce', unit: ['jar of sauce', 'jars of sauce'], value: 145, blurb: 'Slow-simmered while you were in a meeting.' },
  pickles: { id: 'pickles', name: 'Pickled carrots', unit: ['jar of pickles', 'jars of pickles'], value: 65, blurb: 'Crunchy, tangy, oddly cheerful.' },
  pie: { id: 'pie', name: 'Pumpkin pie', unit: ['pie', 'pies'], value: 190, blurb: 'A whole pie. Nobody is counting the slices.' },
  cranberrySauce: {
    id: 'cranberrySauce', name: 'Cranberry sauce', unit: ['jar of cranberry sauce', 'jars of cranberry sauce'], value: 230,
    blurb: 'Sharp and sweet, like a good code review.',
  },
  oil: { id: 'oil', name: 'Sunflower oil', unit: ['bottle of oil', 'bottles of oil'], value: 200, blurb: 'Pressed from sunflowers. It catches the light.' },
  soap: { id: 'soap', name: 'Lavender soap', unit: ['bar of soap', 'bars of soap'], value: 490, blurb: 'Smells like a long weekend, in a bar.' },
  yarn: { id: 'yarn', name: 'Yarn', unit: ['skein of yarn', 'skeins of yarn'], value: 86, blurb: 'Enough for a scarf, if you start now.' },
  cheese: { id: 'cheese', name: 'Goat cheese', unit: ['wheel of cheese', 'wheels of cheese'], value: 48, blurb: 'Small, white and surprisingly bold.' },
}

export const GOOD_IDS = Object.keys(GOODS) as GoodId[]

/** XP for making a good: 5% of its value, rounded, and at least 1. */
export const goodXp = (id: GoodId): number => Math.max(1, Math.round(GOODS[id].value * 0.05))

// ---------------------------------------------------------------------------
// Producers: whole units go to the barn automatically.

export interface ProducerDef {
  /** The animal or hive that makes it; each one owned produces. */
  source: ItemId
  /** Hours for one unit from one source. */
  hours: number
}

export const PRODUCERS: Record<ProducerId, ProducerDef> = {
  eggs: { source: 'chicken', hours: 8 },
  honey: { source: 'beehive', hours: 12 },
  wool: { source: 'sheep', hours: 12 },
  milk: { source: 'goat', hours: 12 },
}

export const PRODUCER_IDS = Object.keys(PRODUCERS) as ProducerId[]

/** Production while away accrues for at most this long: a cap, never a loss. */
export const PRODUCER_CAP_HOURS = 48

// ---------------------------------------------------------------------------
// Stations: one job each, no deadlines, output goes to the barn when done.

export interface StationDef {
  id: StationId
  name: string
  /** The building that has to be owned for the station to work. */
  needs: ItemId
}

export const STATIONS: Record<StationId, StationDef> = {
  mill: { id: 'mill', name: 'Mill', needs: 'windmill' },
  kitchen: { id: 'kitchen', name: 'Kitchen', needs: 'barn' },
  press: { id: 'press', name: 'Oil press', needs: 'press' },
  loom: { id: 'loom', name: 'Spinning wheel', needs: 'loom' },
  workbench: { id: 'workbench', name: 'Workbench', needs: 'workbench' },
}

export const STATION_IDS = Object.keys(STATIONS) as StationId[]

export type Ingredient = { kind: 'crop'; id: CropId; n: number } | { kind: 'good'; id: GoodId; n: number }

export interface RecipeDef {
  id: GoodRecipeId
  station: Exclude<StationId, 'workbench'>
  inputs: Ingredient[]
  minutes: number
}

const crop = (id: CropId, n: number): Ingredient => ({ kind: 'crop', id, n })
const good = (id: GoodId, n: number): Ingredient => ({ kind: 'good', id, n })

export const RECIPES: Record<GoodRecipeId, RecipeDef> = {
  flour: { id: 'flour', station: 'mill', inputs: [crop('wheat', 3)], minutes: 30 },
  jam: { id: 'jam', station: 'kitchen', inputs: [crop('blueberry', 2)], minutes: 45 },
  sauce: { id: 'sauce', station: 'kitchen', inputs: [crop('tomato', 3)], minutes: 40 },
  pickles: { id: 'pickles', station: 'kitchen', inputs: [crop('carrot', 3)], minutes: 30 },
  pie: { id: 'pie', station: 'kitchen', inputs: [crop('pumpkin', 1), good('flour', 1), good('eggs', 2)], minutes: 60 },
  cranberrySauce: { id: 'cranberrySauce', station: 'kitchen', inputs: [crop('cranberry', 2)], minutes: 50 },
  cheese: { id: 'cheese', station: 'kitchen', inputs: [good('milk', 2)], minutes: 60 },
  oil: { id: 'oil', station: 'press', inputs: [crop('sunflower', 3)], minutes: 40 },
  soap: { id: 'soap', station: 'press', inputs: [crop('lavender', 2), good('oil', 1)], minutes: 60 },
  yarn: { id: 'yarn', station: 'loom', inputs: [good('wool', 3)], minutes: 45 },
}

export const RECIPE_IDS = Object.keys(RECIPES) as GoodRecipeId[]

/** Workbench crafts in menu order. Their wood, time and limits live in ITEMS. */
export const CRAFT_IDS: CraftId[] = [
  'birdhouse',
  'planter',
  'signpost',
  'windChime',
  'picnicTable',
  'hammock',
  'arbour',
  'rowboat',
  'dovecote',
  'treehouse',
]

/** Everything a station can make, in menu order. */
export function stationRecipes(station: StationId): RecipeId[] {
  if (station === 'workbench') return CRAFT_IDS
  return RECIPE_IDS.filter((id) => RECIPES[id].station === station)
}
