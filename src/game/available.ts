// What the player can see and get with the feature switches as they are (see
// features.ts). Things that belong to a switched-off feature, or that can only
// be had through one, are left out of the shop, the unlock notices and the
// level ladder, and can't be bought. Read when called, so tests can flip a
// switch.

import { CROPS, CROP_IDS, ITEMS, ITEM_IDS, type CropId, type ItemCategory, type ItemId } from './config'
import { isOn } from './features'

/** Whether an item is part of the game right now: its feature, and everything it needs, is switched on. */
export function itemAvailable(id: ItemId): boolean {
  const def = ITEMS[id]
  if (!def) return false
  if (def.feature && !isOn(def.feature)) return false
  if (def.source === 'workbench' && !isOn('workshop')) return false
  // A particular restoration can only be finished with the restorations on.
  if (def.requiresBundle && !isOn('restorations')) return false
  return !def.requires || itemAvailable(def.requires)
}

/**
 * How many finished restorations an item waits on: its `requiresBundles`
 * while the restorations are switched on, none while they're off. So the
 * wetland and highland are bought with coins, wood and a level alone until
 * the restoration board arrives, and wait on it again once it has.
 */
export function bundlesNeeded(id: ItemId): number {
  return isOn('restorations') ? (ITEMS[id]?.requiresBundles ?? 0) : 0
}

/** Whether a crop can be grown at all right now (levels aside): its feature, and what it needs, are switched on. */
export function cropAvailable(id: CropId): boolean {
  const def = CROPS[id]
  if (!def) return false
  if (def.feature && !isOn(def.feature)) return false
  return !def.requires || itemAvailable(def.requires)
}

/** Every item that's part of the game right now, in table order. */
export const availableItems = (): ItemId[] => ITEM_IDS.filter(itemAvailable)

/** Every crop that's part of the game right now, in table order. */
export const availableCrops = (): CropId[] => CROP_IDS.filter(cropAvailable)

/** What the shop lists on a tab: things of that category for sale (workbench crafts are made, not bought). */
export const shopCatalogue = (category: ItemCategory): ItemId[] =>
  availableItems().filter((id) => ITEMS[id].category === category && ITEMS[id].source !== 'workbench')
