import type { IslandId, ItemId } from '../config'

// The islands, as the restoration board names them, and the hidden details of
// the two biome isles (C2): the wetland and the highland. Each has one hidden
// detail that is never required and pays nothing but a line in the journal.

export interface IslandInfo {
  name: string
  /** A few words under the island's name on the board. */
  blurb: string
  /** The land that brings the island, or null for the home island. */
  land: ItemId | null
}

export const ISLANDS: Record<IslandId, IslandInfo> = {
  main: { name: 'Home island', blurb: 'The farmhouse, the garden and the pond.', land: null },
  meadow: { name: 'Meadow isle', blurb: 'Long grass, sheep and a lot of sky.', land: 'meadow' },
  grove: { name: 'Forest grove', blurb: 'Tall trees, mushrooms and a hush.', land: 'grove' },
  islet: { name: 'Lighthouse islet', blurb: 'Rocks, gulls and the edge of the cloud sea.', land: 'islet' },
  wetland: { name: 'Wetland isle', blurb: 'Still water, reeds and dragonflies.', land: 'wetland' },
  highland: { name: 'Highland isle', blurb: 'Heather, wind and very old stones.', land: 'highland' },
  cottage: { name: 'Woodland glade', blurb: 'A quiet clearing in the pines.', land: 'cottageLand' },
  orchard: { name: 'Orchard isle', blurb: 'Fruit trees in rows.', land: 'orchardLand' },
}

/**
 * The islands with a list on the board, in board order. The woodland glade and
 * the orchard isle have no bundles, so they have no list (the almanac's
 * Visitors page leaves them out too).
 */
export const ISLAND_ORDER: IslandId[] = ['main', 'meadow', 'grove', 'islet', 'wetland', 'highland']

export type BiomeId = Extract<IslandId, 'wetland' | 'highland'>

/** A hidden detail: something to find by looking closely. */
export type DetailId = 'bell' | 'note'

export interface DetailDef {
  id: DetailId
  island: BiomeId
  /** How it looks before anyone has noticed it, for the board's quiet link. */
  hint: string
  /** The keyboard way to notice it. */
  action: string
  /** The journal line (a story line), written once. */
  title: string
  detail: string
}

export const DETAILS: Record<DetailId, DetailDef> = {
  bell: {
    id: 'bell',
    island: 'wetland',
    hint: 'Rings of ripples keep spreading by the reeds, though there is no wind.',
    action: 'Look at the ripples',
    title: 'A bell rang under the wetland',
    detail: 'Just once, low and green, from somewhere far below the reeds. Then the water went still, as if nothing had happened.',
  },
  note: {
    id: 'note',
    island: 'highland',
    hint: 'One stone on the cairn has marks on it, worn soft by the weather.',
    action: 'Look at the carved stone',
    title: 'Words carved on a cairn stone',
    detail: '"Gone for a walk. Back by teatime." Nobody knows which teatime. The moss has its doubts.',
  },
}

export const DETAIL_IDS = Object.keys(DETAILS) as DetailId[]
