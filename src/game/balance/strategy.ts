// How a simulated player looks in on the farm (spec §2): catch up, collect
// what the farm made on its own, harvest, buy, then sow each plot for the time
// until the next look-in. The engine decides what everything costs, pays and
// allows; this file only chooses.

import { advance } from '../advance'
import { availableItems } from '../available'
import { CROPS, CROP_IDS, ITEMS, levelBonus, type CropId, type ItemId } from '../config'
import { YIELDS, YIELD_IDS } from '../content/yields'
import {
  buyBlock,
  buyItem,
  buySeeds,
  growMs,
  harvestAll,
  harvestValue,
  isCropUnlocked,
  isFresh,
  isReady,
  itemMax,
  itemPrice,
  plant,
} from '../engine'
import type { GameState } from '../state'
import { collectAll, waitingYields, yieldSources } from '../systems/yields'
import type { DayLog, Tally } from './players'

/** Coins kept back for seeds, per plot, when buying anything but land. */
const SEED_RESERVE_PER_PLOT = 40

/**
 * The land the player wants first, by what each piece brings (spec §4): the
 * grove's wood, the meadow's sheep, the wetland's fish and cranberries, the
 * highland's goats and lavender, the orchard's trees, the glade's room for
 * hives, and last the islet, which brings only room for the lighthouse.
 */
export const LAND_ORDER: ItemId[] = ['grove', 'meadow', 'wetland', 'highland', 'orchardLand', 'cottageLand', 'islet']

/** Adds a call's earnings, the state difference across it. Only used across calls that spend nothing. */
export function earn(into: Tally, before: GameState, after: GameState): void {
  into.coins += after.coins - before.coins
  into.wood += after.wood - before.wood
  into.xp += after.xp - before.xp
}

/**
 * A look-in at `now`, with the next one `nextGapMs` away. The farm's earnings
 * are what collecting and harvesting bring in (spec §2: "harvests plus
 * collected output"), and what its seeds cost is logged beside them; the XP of
 * what's bought is neither the farm's nor work's.
 */
export function checkIn(state: GameState, now: number, nextGapMs: number, log: DayLog): GameState {
  let s = advance(state, now).state

  if (Object.values(waitingYields(s, now)).some((units) => units > 0)) {
    const collected = collectAll(s, now).state
    earn(log.earned.farm, s, collected)
    s = collected
  }

  s = harvestRipe(s, now, log)

  for (;;) {
    const id = nextPurchase(s, nextGapMs, now)
    const bought = id ? buyItem(s, id, now) : null
    if (!id || !bought?.ok) break
    s = bought.state
    log.bought.push(id)
  }

  return sow(s, now, nextGapMs, log)
}

/**
 * Harvests every ripe plot. Each crop is logged with what its plots paid,
 * fresh soil counted, and those payments are checked against the coins the
 * harvest brought in, less the bonus of any level it reached.
 */
function harvestRipe(s: GameState, now: number, log: DayLog): GameState {
  const ripe = s.plots.filter((plot) => isReady(plot, now))
  if (!ripe.length) return s
  const paid: Partial<Record<CropId, number>> = {}
  for (const plot of ripe) paid[plot.crop!] = (paid[plot.crop!] ?? 0) + harvestValue(s, plot.crop!, isFresh(plot, plot.crop!))

  const harvested = harvestAll(s, now).state
  earn(log.earned.farm, s, harvested)

  let bonus = 0
  for (let level = s.levelSeen + 1; level <= harvested.levelSeen; level++) bonus += levelBonus(level)
  const crops = Object.values(paid).reduce((a, b) => a + b, 0)
  const brought = harvested.coins - s.coins - bonus
  if (crops !== brought) log.mismatches.push(`${new Date(now).toISOString().slice(11, 16)}: crops ${crops}, harvest ${brought}`)

  for (const [crop, coins] of Object.entries(paid) as [CropId, number][]) log.harvest[crop] = (log.harvest[crop] ?? 0) + coins
  return harvested
}

/**
 * What to buy next, or null for nothing. The woodshed comes first, and then
 * the most wanted piece of land, each whenever the shop allows it. Then,
 * keeping enough coins back to sow every plot and enough wood back for the
 * next piece of land: the yield source that repays its coins soonest; failing
 * that, whatever else pays for itself soonest; and decor only when nothing
 * else can be had.
 */
function nextPurchase(s: GameState, gapMs: number, now: number): ItemId | null {
  const shop = availableItems()
  const coins = (id: ItemId) => itemPrice(s, id).coins
  // Sorting is stable, so equal prices keep the shop's order.
  const cheapest = (ids: ItemId[]) => [...ids].sort((a, b) => coins(a) - coins(b))[0] ?? null

  if (shop.includes('woodshed') && buyBlock(s, 'woodshed') === null) return 'woodshed'

  // Every piece of land not yet owned costs the same, so the next is simply the most wanted.
  const unowned = LAND_ORDER.filter((id) => shop.includes(id) && s.owned[id] < itemMax(s, id))
  const land = unowned.find((id) => buyBlock(s, id) === null)
  if (land) return land

  const spareCoins = s.coins - SEED_RESERVE_PER_PLOT * s.plots.length
  // Short of the land's wood, things that take no wood can still be bought.
  const spareWood = Math.max(0, s.wood - (unowned.length ? itemPrice(s, unowned[0]).wood : 0))
  const affordable = shop.filter((id) => {
    if (ITEMS[id].category === 'land' || buyBlock(s, id) !== null) return false
    const price = itemPrice(s, id)
    return price.coins <= spareCoins && price.wood <= spareWood
  })

  const sources = affordable.filter((id) => coinsPerHour(s, id) > 0)
  if (sources.length) {
    const hours = new Map(sources.map((id) => [id, coins(id) / coinsPerHour(s, id)]))
    return [...sources].sort((a, b) => hours.get(a)! - hours.get(b)!)[0]
  }

  const useful = affordable.filter((id) => ITEMS[id].category !== 'decor')
  if (useful.length) {
    const pays = new Map(useful.map((id) => [id, payback(s, id, gapMs, now)]))
    // Two that never pay back give NaN, which falls through to the cheaper one.
    return [...useful].sort((a, b) => pays.get(a)! - pays.get(b)! || coins(a) - coins(b))[0]
  }
  return cheapest(affordable.filter((id) => ITEMS[id].category === 'decor'))
}

/** The coins an hour that one more of the item adds to what the farm makes on its own; 0 if it adds none. */
function coinsPerHour(s: GameState, id: ItemId): number {
  const more = { owned: { ...s.owned, [id]: s.owned[id] + 1 } }
  let perHour = 0
  for (const y of YIELD_IDS) {
    if (YIELDS[y].pays === 'coins') perHour += ((yieldSources(more, y) - yieldSources(s, y)) * YIELDS[y].value) / YIELDS[y].hours
  }
  return perHour
}

/** How many look-ins' worth of extra garden profit an item takes to repay its coins; Infinity if it adds none. */
function payback(s: GameState, id: ItemId, gapMs: number, now: number): number {
  // The item's XP is left out: a level-up it happens to trigger isn't its doing.
  const after = { ...buyItem(s, id, now).state, xp: s.xp }
  const gain = gardenProfit(after, gapMs) - gardenProfit(s, gapMs)
  return gain > 0 ? itemPrice(s, id).coins / gain : Infinity
}

/** What one look-in's sowing makes, every plot growing the best crop for the gap in soil that isn't fresh. */
function gardenProfit(s: GameState, gapMs: number): number {
  const crop = bestCrop(s, gapMs, () => true)
  return crop ? s.plots.length * profit(s, crop) : 0
}

/** What a harvest of the crop pays over its seed. */
const profit = (s: GameState, crop: CropId, fresh = false) => harvestValue(s, crop, fresh) - CROPS[crop].seedCost

/**
 * The unlocked, usable crop that pays most over its seed and is ripe within
 * the gap, in soil that's fresh for the crops `fresh` says. Ties go to the
 * longer grow.
 */
function bestCrop(
  s: GameState,
  gapMs: number,
  usable: (crop: CropId) => boolean,
  fresh: (crop: CropId) => boolean = () => false,
): CropId | null {
  let best: CropId | null = null
  let most = 0
  for (const crop of CROP_IDS) {
    if (!isCropUnlocked(s, crop) || growMs(s, crop) > gapMs || !usable(crop)) continue
    const gain = profit(s, crop, fresh(crop))
    if (best === null || gain > most || (gain === most && growMs(s, crop) > growMs(s, best))) {
      best = crop
      most = gain
    }
  }
  return best
}

/**
 * Sows each empty plot with the crop that pays it most, fresh soil counted,
 * from seeds in hand or bought one packet at a time. A crop whose seeds the
 * shop won't sell is passed over for the rest of the look-in, and a plot that
 * won't take its crop is left empty, so nothing is asked twice. What the seeds
 * cost is logged as the farm's running cost.
 */
function sow(state: GameState, now: number, gapMs: number, log: DayLog): GameState {
  let s = state
  const refused = new Set<CropId>()
  for (const plot of state.plots) {
    if (plot.crop) continue
    for (;;) {
      const crop = bestCrop(
        s,
        gapMs,
        (c) => !refused.has(c) && (s.seeds[c] > 0 || CROPS[c].seedCost <= s.coins),
        (c) => isFresh(plot, c),
      )
      if (!crop) break
      if (s.seeds[crop] < 1) {
        const bought = buySeeds(s, crop, 1, now)
        if (!bought.ok) {
          refused.add(crop)
          continue
        }
        log.seeds += s.coins - bought.state.coins
        s = bought.state
      }
      const planted = plant(s, plot.id, crop, now)
      if (planted.ok) s = planted.state
      break
    }
  }
  return s
}
