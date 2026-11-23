import type { BundleId } from './bundles'

// Fish (B6): catch and release. Each open spot lands one fish every
// FISH_SLOT_MINUTES of real time; fish only fill the almanac and never pay.
// The table is filled in by the fishing feature.

export type FishSpot = 'pond' | 'cloud' | 'wetland' | 'tarn'

/** A fish's id. A plain string until the fish table is written. */
export type FishId = string

/** When a fish bites: by day (06–20 local), by night, or any time. */
export type FishTime = 'day' | 'night' | 'any'

export interface FishDef {
  id: FishId
  name: string
  spot: FishSpot
  time: FishTime
  /** Smallest and largest size, in cm. */
  size: [number, number]
  /** Colours for the procedural card. */
  colors: { body: string; fin: string; belly: string; mark?: string }
  /** Shape parameters for the procedural card. */
  shape: { length: number; depth: number; tail: 'fork' | 'round' | 'fan' | 'long'; pattern: 'plain' | 'spots' | 'stripes' | 'speckles' }
  /** One line for the almanac. */
  note: string
}

export const FISH_SPOTS: Record<FishSpot, { name: string; opensWith: BundleId }> = {
  pond: { name: 'The pond', opensWith: 'pondJetty' },
  cloud: { name: 'The cloud sea', opensWith: 'skyHarbour' },
  wetland: { name: 'The wetland', opensWith: 'boardwalkLoop' },
  tarn: { name: 'The tarn', opensWith: 'bothy' },
}

export const FISH_SPOT_IDS = Object.keys(FISH_SPOTS) as FishSpot[]

/** Real minutes between catches at an open spot. */
export const FISH_SLOT_MINUTES = 45

export const FISH: Record<FishId, FishDef> = {}
