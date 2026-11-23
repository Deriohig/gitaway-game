import { describe, expect, it } from 'vitest'
import {
  CROPS,
  CROP_IDS,
  GLADE_HIVES,
  ITEMS,
  ITEM_IDS,
  LAND,
  LEVEL_XP,
  ORCHARD_FRUIT_TREES,
  PLOTS,
  type ItemId,
} from './config'
import { BUNDLE_IDS } from './content/bundles'
import { CRAFT_IDS } from './content/goods'
import { buyBlock, buyItem, buySeeds, harvestValue, isCropUnlocked, itemMax, itemPrice, landOwned, plant } from './engine'
import { levelForXp, levelTitle, xpForLevel } from './progression'
import { v2XpForLevel } from './save'
import { createInitialState, type GameState } from './state'
import { yieldSources } from './systems/yields'
import { ALL_ON, useFeatures, withFeatures } from './testing'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)
const fresh = () => createInitialState(T0)
const rich = (patch: Partial<GameState> = {}): GameState => ({ ...fresh(), coins: 50_000, wood: 5_000, xp: 20_000, levelSeen: 20, ...patch })
const done = (n: number) => Object.fromEntries(BUNDLE_IDS.slice(0, n).map((id) => [id, T0]))
const owning = (s: GameState, owned: Partial<GameState['owned']>): GameState => ({ ...s, owned: { ...s.owned, ...owned } })
const RISES = /rises from the clouds and docks/

describe('levels', () => {
  it('runs to level 20 with its titles', () => {
    expect(LEVEL_XP).toHaveLength(20)
    for (let level = 2; level <= LEVEL_XP.length; level++) {
      expect(levelForXp(LEVEL_XP[level - 1] - 1), `level ${level}`).toBe(level - 1)
      expect(levelForXp(LEVEL_XP[level - 1]), `level ${level}`).toBe(level)
    }
    expect([10, 11, 20, 25].map(levelTitle)).toEqual(['Islander', 'Old Hand', 'Part of the Furniture', 'Part of the Furniture'])
  })

  it('keeps each level past the table a little longer than the last, and asks at least what version 2 did', () => {
    expect(xpForLevel(21) - xpForLevel(20)).toBeGreaterThan(xpForLevel(20) - xpForLevel(19))
    for (let level = 1; level <= 30; level++) expect(xpForLevel(level), `level ${level}`).toBeGreaterThanOrEqual(v2XpForLevel(level))
  })
})

describe('pricing and rules of the basics', () => {
  it('charges 12% more for each one beyond the starting count (two chickens are owned)', () => {
    const s = fresh()
    const hen = ITEMS.chicken.coins
    expect(itemPrice(s, 'chicken')).toEqual({ coins: hen, wood: 0 })
    expect(itemPrice(owning(s, { chicken: 3 }), 'chicken')).toEqual({ coins: Math.round(hen * 1.12), wood: 0 })
    expect(itemPrice(owning(s, { chicken: 5 }), 'chicken')).toEqual({ coins: Math.round(hen * 1.12 ** 3), wood: 0 })
    expect(itemPrice(s, 'flowerbed')).toEqual({ coins: ITEMS.flowerbed.coins, wood: ITEMS.flowerbed.wood })
    for (const id of ['fence', 'beehive'] as const) {
      expect(itemPrice(owning(s, { [id]: 2 }), id)).toEqual({ coins: Math.round(ITEMS[id].coins * 1.12 ** 2), wood: Math.round(ITEMS[id].wood * 1.12 ** 2) })
    }
  })

  it('leaves plots and one-off things at their own prices, and charges the next price when buying', () => {
    expect(itemPrice(owning(fresh(), { plot: 3 }), 'plot').coins).toBe(PLOTS.baseCost + PLOTS.costStep * 3)
    expect(itemPrice(rich(), 'windmill')).toEqual({ coins: ITEMS.windmill.coins, wood: ITEMS.windmill.wood })
    const s = buyItem(rich(), 'flowerbed', T0).state
    expect(s.coins - buyItem(s, 'flowerbed', T0).state.coins).toBe(Math.round(ITEMS.flowerbed.coins * 1.12))
  })

  it('makes the woodshed a level 1 building for coins only, one per farm', () => {
    expect(ITEMS.woodshed).toMatchObject({ category: 'building', unlockLevel: 1, wood: 0, max: 1 })
    expect(buyBlock({ ...fresh(), coins: ITEMS.woodshed.coins }, 'woodshed')).toBe(null)
  })
})

describe('buying rules', () => {
  useFeatures(ALL_ON) // the idle loop's things, with their features switched on

  it('never sells workbench crafts', () => {
    for (const id of CRAFT_IDS) {
      expect(buyBlock(rich(), id)).toBe('workbench')
      const r = buyItem(rich(), id, T0)
      expect(r.ok).toBe(false)
      expect(r.notices[0].detail).toMatch(/workbench/)
    }
  })

  it('opens the new isles only after enough restorations', () => {
    const s = rich()
    const after = (n: number) => ({ ...s, restoration: { progress: {}, done: done(n) } })
    expect(buyBlock(s, 'wetland')).toBe('bundles')
    expect(buyItem(s, 'wetland', T0).notices[0].detail).toBe('Opens once 4 restorations are finished.')
    expect(buyBlock(after(3), 'wetland')).toBe('bundles')
    expect(buyItem(after(4), 'wetland', T0).ok).toBe(true)
    expect(buyBlock(after(8), 'highland')).toBe('bundles')
    expect(buyBlock(after(9), 'highland')).toBe(null)
  })

  it('checks levels and requirements on the new buildings', () => {
    expect(buyBlock(rich({ xp: 0 }), 'barn')).toBe('level')
    expect(buyBlock(rich(), 'press')).toBe('requires')
    expect(buyBlock(owning(rich(), { barn: 1 }), 'press')).toBe(null)
    expect(buyBlock(rich(), 'goat')).toBe('requires')
    expect(buyBlock(rich(), 'gazebo')).toBe(null)
  })
})

describe('the wetland and highland while restorations are off', () => {
  useFeatures({ wildIsles: true, restorations: false })

  it('sell for coins and wood alone', () => {
    const s = rich()
    for (const id of ['wetland', 'highland'] as const) {
      expect(buyBlock(s, id)).toBe(null)
      expect(buyItem(s, id, T0).ok).toBe(true)
    }
    expect(buyBlock({ ...s, coins: itemPrice(s, 'wetland').coins - 1 }, 'wetland')).toBe('coins')
    expect(buyBlock({ ...s, wood: itemPrice(s, 'highland').wood - 1 }, 'highland')).toBe('wood')
  })

  it('grow cranberries and lavender, and keep goats, once their isle is owned', () => {
    const s = rich()
    expect(buyBlock(s, 'goat')).toBe('requires')
    expect(isCropUnlocked(s, 'cranberry')).toBe(false)
    const wetland = buyItem(s, 'wetland', T0).state
    expect(isCropUnlocked(wetland, 'cranberry')).toBe(true)
    expect(isCropUnlocked(wetland, 'lavender')).toBe(false)
    const both = buyItem(wetland, 'highland', T0).state
    expect(isCropUnlocked(both, 'lavender')).toBe(true)
    const seeded = buySeeds(buySeeds(both, 'cranberry', 1, T0).state, 'lavender', 1, T0).state
    const sown = plant(plant(seeded, 0, 'cranberry', T0).state, 1, 'lavender', T0).state
    expect(sown.plots.slice(0, 2).map((p) => p.crop)).toEqual(['cranberry', 'lavender'])
    expect(buyItem(both, 'goat', T0).ok).toBe(true)
  })
})

describe('the cottage’s and the orchard’s land', () => {
  useFeatures({ ringIsles: true, restorations: false })
  const RING = ['cottageLand', 'orchardLand'] as const

  it('sells for coins and wood alone, one of each, rising from the clouds with no bridge and no cottage promised', () => {
    const s = rich()
    for (const id of RING) {
      expect(buyBlock(s, id), id).toBe(null)
      const r = buyItem(s, id, T0)
      expect(buyBlock(r.state, id), id).toBe('max')
      expect(r.notices[0].title, id).toBe(`${ITEMS[id].name} added`)
      expect(r.notices[0].detail, id).toMatch(RISES)
      expect(r.notices[0].detail, id).not.toMatch(/bridge/i)
      expect(ITEMS[id].blurb, id).toMatch(RISES) // the shop says so before it's bought
      expect([ITEMS[id].category, ITEMS[id].max, ITEMS[id].feature], id).toEqual(['land', 1, 'ringIsles'])
    }
    expect([ITEMS.cottageLand.island, ITEMS.orchardLand.island]).toEqual(['cottage', 'orchard'])
    const said = [ITEMS.cottageLand.name, ITEMS.cottageLand.blurb, buyItem(s, 'cottageLand', T0).notices[0].detail ?? '']
    for (const words of said) expect(words).not.toMatch(/cottage|house|home/i)
    expect(buyBlock({ ...s, coins: itemPrice(s, 'cottageLand').coins - 1 }, 'cottageLand')).toBe('coins')
    expect(buyBlock({ ...s, wood: itemPrice(s, 'orchardLand').wood - 1 }, 'orchardLand')).toBe('wood')
    // The restorations, switched on later, don't hold them up.
    withFeatures({ restorations: true }, () => {
      for (const id of RING) expect(buyBlock(s, id), id).toBe(null)
    })
  })
})

describe('land in any order', () => {
  useFeatures({ wildIsles: true, ringIsles: true, restorations: false })
  const LAND_IDS = ITEM_IDS.filter((id) => ITEMS[id].category === 'land')
  /** The price of every piece not yet owned, with `owned` pieces owned. */
  const landPrice = (owned: number) => ({
    coins: Math.round(LAND.coins.base * LAND.coins.growth ** owned),
    wood: Math.round(LAND.wood.base * LAND.wood.growth ** owned),
  })
  /** A new farm, at level 1, with plenty to spend and these pieces of land. */
  const holding = (ids: readonly ItemId[]): GameState =>
    owning({ ...fresh(), coins: 50_000, wood: 5_000 }, Object.fromEntries(ids.map((id) => [id, 1])))

  it('every land piece costs the same, rising by LAND.growth with each one owned', () => {
    expect(LAND_IDS).toEqual(['meadow', 'grove', 'islet', 'wetland', 'highland', 'cottageLand', 'orchardLand'])
    for (let n = 0; n < LAND_IDS.length; n++) {
      for (let start = 0; start < LAND_IDS.length; start++) {
        // Seven mixes of n pieces, each taken from a different place in the list.
        const ids = Array.from({ length: n }, (_, i) => LAND_IDS[(start + i * 3) % LAND_IDS.length])
        const s = holding(ids)
        expect(landOwned(s)).toBe(n)
        for (const id of LAND_IDS.filter((l) => !ids.includes(l))) expect(itemPrice(s, id), `${id} with ${ids.join(', ') || 'no land'}`).toEqual(landPrice(n))
      }
    }
  })

  it('land has no level gate', () => {
    const s = holding([])
    expect(levelForXp(s.xp)).toBe(1)
    for (const id of LAND_IDS) expect(buyBlock(s, id), id).toBe(null)
    expect(itemPrice(s, 'orchardLand')).toEqual(landPrice(0))
    const r = buyItem(s, 'orchardLand', T0)
    expect([r.ok, r.state.owned.orchardLand]).toEqual([true, 1])
    expect(s.wood - r.state.wood).toBe(landPrice(0).wood) // its XP levels the farm up, so only the wood shows the price
  })

  it('owning a piece unlocks its content, and without it each waits on the piece, never a level', () => {
    const highland = holding(['highland'])
    expect(isCropUnlocked(highland, 'lavender')).toBe(true)
    expect(buyBlock(highland, 'goat')).toBe(null)
    const wetland = holding(['wetland'])
    expect(yieldSources(wetland, 'fish')).toBe(1)
    expect(isCropUnlocked(wetland, 'cranberry')).toBe(true)
    expect(buyBlock(holding(['meadow']), 'sheep')).toBe(null)
    expect(buyBlock(holding(['islet']), 'lighthouse')).toBe(null)
    const none = holding([])
    for (const id of ['goat', 'sheep', 'lighthouse'] as const) expect(buyBlock(none, id), id).toBe('requires')
    expect(isCropUnlocked(none, 'lavender')).toBe(false)
    expect(yieldSources(none, 'fish')).toBe(0)
    expect(yieldSources(holding(['orchardLand']), 'fruit') - yieldSources(none, 'fruit')).toBe(ORCHARD_FRUIT_TREES)
  })

  // More than one level at once would bury the piece's own toast under level-ups.
  it('the glade makes room for 3 more beehives, and nothing else gets more room', () => {
    const hives = (n: number, ids: ItemId[] = []) => {
      const s = holding(ids)
      return { ...owning(s, { beehive: n }), xp: xpForLevel(ITEMS.beehive.unlockLevel) }
    }
    expect(GLADE_HIVES).toBe(3)
    expect(itemMax(hives(3), 'beehive')).toBe(ITEMS.beehive.max)
    expect(buyBlock(hives(3), 'beehive')).toBe('max')
    expect(itemMax(hives(3, ['cottageLand']), 'beehive')).toBe(ITEMS.beehive.max + 3)
    expect(buyBlock(hives(3, ['cottageLand']), 'beehive')).toBe(null)
    expect(buyItem(hives(3, ['cottageLand']), 'beehive', T0).state.owned.beehive).toBe(4)
    expect(buyBlock(hives(ITEMS.beehive.max + 3, ['cottageLand']), 'beehive')).toBe('max')
    for (const id of ITEM_IDS) if (id !== 'beehive') expect(itemMax(hives(0, ['cottageLand']), id), id).toBe(ITEMS[id].max)
  })

})

describe('new crops', () => {
  useFeatures(ALL_ON)

  it('grows cranberries and lavender only on their isles, which open them with no level of their own', () => {
    const s = rich()
    expect([isCropUnlocked(s, 'cranberry'), isCropUnlocked(s, 'lavender')]).toEqual([false, false])
    expect(buySeeds(s, 'cranberry', 1, T0).notices[0].detail).toBe('It needs the wetland isle first.')
    expect(plant({ ...s, seeds: { ...s.seeds, cranberry: 1 } }, 0, 'cranberry', T0).ok).toBe(false)
    const isles = owning(s, { wetland: 1, highland: 1 })
    expect([isCropUnlocked(isles, 'cranberry'), isCropUnlocked(isles, 'lavender')]).toEqual([true, true])
    expect([CROPS.cranberry.requires, CROPS.lavender.requires]).toEqual(['wetland', 'highland'])
    for (const id of CROP_IDS) if (CROPS[id].requires) expect(CROPS[id].unlockLevel, id).toBe(1)
  })

  // Each crop suits one kind of time away: longer pays more per harvest, shorter more per hour.
  it('pays a little over its seed, more per harvest the longer a crop grows, and more per hour the shorter it grows', () => {
    const byTime = [...CROP_IDS].sort((a, b) => CROPS[a].growMinutes - CROPS[b].growMinutes)
    const profit = (id: (typeof CROP_IDS)[number]) => harvestValue(fresh(), id, true) - CROPS[id].seedCost
    for (const id of CROP_IDS) expect(harvestValue(fresh(), id) - CROPS[id].seedCost, id).toBeGreaterThan(0) // even replanted on the same soil
    for (let i = 1; i < byTime.length; i++) {
      const [shorter, longer] = [byTime[i - 1], byTime[i]]
      expect(CROPS[longer].growMinutes, longer).toBeGreaterThan(CROPS[shorter].growMinutes)
      expect(profit(longer), `${longer} per harvest`).toBeGreaterThanOrEqual(profit(shorter))
      expect(profit(longer) / CROPS[longer].growMinutes, `${longer} per hour`).toBeLessThan(profit(shorter) / CROPS[shorter].growMinutes)
    }
  })
})
