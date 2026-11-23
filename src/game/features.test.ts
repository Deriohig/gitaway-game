import { describe, expect, it } from 'vitest'
import { activeSteps, advance, STEPS } from './advance'
import { availableCrops, availableItems, cropAvailable, itemAvailable, shopCatalogue } from './available'
import { CROP_IDS, ITEMS, ITEM_IDS, LEVEL_XP, MINUTE, type CropId, type ItemCategory, type ItemId } from './config'
import { CRAFT_IDS } from './content/goods'
import { grantXp } from './core'
import { buyItem, buySeeds, harvestAll, isCropUnlocked, logTask, plant, plantAll } from './engine'
import { FEATURES, isOn, type FeatureId } from './features'
import { unlocksAtLevel } from './progression'
import type { Notice } from './result'
import { createInitialState, type GameState } from './state'
import { repoLabel } from './systems/gitEvents'
import { BUILT, LADDER } from './systems/journal'
import { ALL_OFF, ALL_ON, withFeatures, type Switches } from './testing'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)
const fresh = () => createInitialState(T0)
const rich = (patch: Partial<GameState> = {}): GameState => ({ ...fresh(), coins: 1_000_000, wood: 100_000, xp: LEVEL_XP[19], levelSeen: 20, ...patch })
const CATEGORIES: ItemCategory[] = ['garden', 'decor', 'building', 'land', 'animal']

/** What each feature brings, written out by hand from the spec so the tables can't vouch for themselves. */
const ITEMS_OF: Partial<Record<FeatureId, ItemId[]>> = {
  workshop: ['workbench', 'barn', 'press', 'loom', ...CRAFT_IDS],
  wildIsles: ['wetland', 'highland', 'goat', 'boardwalk', 'lilyLantern', 'stoneCircle', 'hotSpring'], // the isles, the goat, and the decor on the isles
  biomes: ['boardwalk', 'lilyLantern', 'stoneCircle', 'hotSpring'],
  ringIsles: ['cottageLand', 'orchardLand'],
  restorations: ['rowboat'], // the rowboat waits on the Fishing Bench
  lateBuildings: ['gazebo', 'observatory'],
}
const CROPS_OF: Partial<Record<FeatureId, CropId[]>> = { wildIsles: ['cranberry', 'lavender'] }

const offFeatures = () => (Object.keys(FEATURES) as FeatureId[]).filter((f) => !isOn(f))
const hiddenItems = () => new Set(offFeatures().flatMap((f) => ITEMS_OF[f] ?? []))
const hiddenCrops = () => new Set(offFeatures().flatMap((f) => CROPS_OF[f] ?? []))
const BASE_ITEMS = ITEM_IDS.filter((id) => !Object.values(ITEMS_OF).some((list) => list.includes(id)))
const BASE_CROPS = CROP_IDS.filter((id) => !Object.values(CROPS_OF).some((list) => list.includes(id)))
const shopListing = () => CATEGORIES.flatMap(shopCatalogue)
const ladderLines = () => Object.values(LADDER).flatMap((lines) => lines ?? [])
const off = <T,>(fn: () => T) => withFeatures(ALL_OFF, fn)
const on = <T,>(switches: Switches, fn: () => T) => withFeatures({ ...ALL_OFF, ...switches }, fn)
const storyWith = (switches: Switches) => on(switches, () => levelAllTheWay().story)

/** Levels a fresh farm up to 20 and gathers what it was told on the way. */
function levelAllTheWay() {
  const s = fresh()
  const out: Notice[] = []
  grantXp(s, LEVEL_XP[19], out, T0)
  const unlocked = new Set(out.filter((n) => n.kind === 'unlock').flatMap((n) => (n.detail ?? '').split(', ')))
  return { unlocked, story: s.journal.filter((e) => e.kind === 'story').map((e) => e.title) }
}

/** The checks behind "nothing of a switched-off feature shows", for whatever the switches are now. */
function expectNothingOfOffFeatures() {
  const hidden = hiddenItems()
  const listed = shopListing()
  for (const id of hidden) {
    expect(itemAvailable(id), id).toBe(false)
    expect(availableItems(), id).not.toContain(id)
    expect(listed, id).not.toContain(id)
  }
  for (const crop of hiddenCrops()) {
    expect(cropAvailable(crop), crop).toBe(false)
    expect(availableCrops(), crop).not.toContain(crop)
  }
  for (let level = 1; level <= 25; level++) {
    const u = unlocksAtLevel(level)
    for (const item of u.items) expect(hidden.has(item.id), `${item.id} at level ${level}`).toBe(false)
    for (const crop of u.crops) expect(hiddenCrops().has(crop.id), `${crop.id} at level ${level}`).toBe(false)
  }
  const { unlocked, story } = levelAllTheWay()
  for (const id of hidden) expect(unlocked.has(ITEMS[id].name), ITEMS[id].name).toBe(false)
  for (const { line, feature } of ladderLines()) expect(story.includes(line), line).toBe(!feature || isOn(feature))
}

describe('feature switches as committed', () => {
  it('keep the shop, crop list, unlock notices and story lines clear of switched-off features, and the base game in place', () => {
    expectNothingOfOffFeatures()
    for (const id of BASE_ITEMS) expect(itemAvailable(id), id).toBe(true)
    for (const crop of BASE_CROPS) expect(cropAvailable(crop), crop).toBe(true)
    expect(BASE_CROPS).toContain('wheat') // wheat grows and sells with or without the mill
  })

  it('have the wetland, highland and the cottage and orchard land for sale in order, with restorations, cottage and repo orchard off', () => {
    expect(['wildIsles', 'ringIsles', 'water'].map((f) => isOn(f as FeatureId))).toEqual([true, true, true])
    expect(['restorations', 'cottage', 'gitEvents'].map((f) => isOn(f as FeatureId))).toEqual([false, false, false])
    expect(shopCatalogue('land')).toEqual(['meadow', 'grove', 'islet', 'wetland', 'highland', 'cottageLand', 'orchardLand'])
    for (const id of ['wetland', 'cottageLand', 'orchardLand'] as const) expect(buyItem(rich(), id, T0).ok, id).toBe(true)
  })

  it('run only the advance steps of switched-on features', () => {
    for (const [name, , features] of STEPS) expect(activeSteps().includes(name), name).toBe(!features || features.some(isOn))
  })
})

describe('with every feature switched off', () => {
  it('lists only the base game in the shop and the crop list', () => {
    off(() => {
      expect(availableItems()).toEqual(BASE_ITEMS)
      expect(availableCrops()).toEqual(BASE_CROPS)
      expect(shopCatalogue('decor')).toEqual(['flowerbed', 'fence', 'path', 'lantern', 'bench', 'scarecrow', 'beehive'])
      expect(shopCatalogue('animal')).toEqual(['chicken', 'duck', 'sheep'])
      expect(shopCatalogue('building')).toEqual(['woodshed', 'well', 'fruitTree', 'windmill', 'greenhouse', 'lighthouse'])
      expect(shopCatalogue('land')).toEqual(['meadow', 'grove', 'islet'])
      expectNothingOfOffFeatures()
    })
  })

  it('tells only the wheat line on the way to level 20, and names nothing new past level 12', () => {
    off(() => {
      const ladder = new Set(ladderLines().map((l) => l.line))
      expect(levelAllTheWay().story.filter((t) => ladder.has(t))).toEqual(['There is wheat seed in the shop now.'])
      for (let level = 13; level <= 20; level++) expect(unlocksAtLevel(level), `level ${level}`).toEqual({ crops: [], items: [], gifts: [] })
    })
  })

  it("can't sell or grow anything of theirs, and says nothing about it", () => {
    off(() => {
      const s = rich({ owned: { ...fresh().owned, wetland: 1, highland: 1 } })
      for (const id of ['barn', 'workbench', 'gazebo', 'goat', 'boardwalk', 'birdhouse'] as const) {
        const r = buyItem(s, id, T0)
        expect([r.ok, r.notices, r.state], id).toEqual([false, [], s])
      }
      expect(buySeeds(s, 'cranberry', 1, T0)).toEqual({ state: s, notices: [], ok: false })
      expect(isCropUnlocked(s, 'lavender')).toBe(false)
      expect(plant({ ...s, seeds: { ...s.seeds, cranberry: 1 } }, 0, 'cranberry', T0).ok).toBe(false)
      // The base game still sells as before.
      expect(buyItem(s, 'windmill', T0).ok).toBe(true)
      expect(buySeeds(s, 'wheat', 1, T0).ok).toBe(true)
    })
  })

  it('names repositories by their aliases even if the save asks for real names', () => {
    const s = rich({ settings: { ...fresh().settings, showRepoNames: true } })
    const repo = { path: '/code/api', name: 'api', cursor: 0, addedAt: T0, commits: 0, alias: 'Apple', tagCursor: 0 }
    expect([off(() => repoLabel(s, repo)), on({ gitEvents: true }, () => repoLabel(s, repo))]).toEqual(['the Apple tree', 'api'])
  })

  it('runs only the day, the crops, the yields and the journal as time passes, and still keeps the journal', () => {
    off(() => {
      expect(activeSteps()).toEqual(['day', 'crops', 'yields', 'journal'])
      let s = logTask(plantAll(fresh(), 'radish', T0).state, 'Fix the build', T0).state
      s = advance(s, T0 + 5 * MINUTE).state
      s = harvestAll(s, T0 + 5 * MINUTE).state
      const titles = s.journal.map((e) => e.title)
      expect(titles).toEqual(expect.arrayContaining(['Harvested 4 crops', 'Your radishes are ready', 'Fix the build', 'Planted 4 radishes']))
      expect(titles).toContain('The first harvest. Small, but it came out of your own soil.')
    })
  })
})

describe('flipping a switch on', () => {
  it('brings the workshop back: its buildings in the shop, its crafts at the workbench, its lines in the journal', () => {
    on({ workshop: true }, () => {
      for (const id of ['workbench', 'barn', 'press', 'loom'] as const) expect(shopCatalogue('building')).toContain(id)
      for (const id of CRAFT_IDS.filter((c) => c !== 'rowboat')) {
        expect(itemAvailable(id), id).toBe(true)
        expect(shopListing(), id).not.toContain(id)
      }
      expect(itemAvailable('rowboat')).toBe(false) // waits on the Fishing Bench, a restoration
      expect(unlocksAtLevel(3).items.map((i) => i.id)).toEqual(expect.arrayContaining(['workbench', 'barn', 'birdhouse']))
      expect(levelAllTheWay().story).toContain('Someone has drawn up plans for a workbench and a barn.')
      expect(buyItem(rich(), 'workbench', T0).state.journal.map((e) => e.title)).toContain(BUILT.workbench)
      expectNothingOfOffFeatures()
    })
    on({ workshop: true, restorations: true }, () => expect(itemAvailable('rowboat')).toBe(true))
  })

  it('brings the wetland, the highland and the goat back on their own switch, with their crops', () => {
    // With restorations or without: while they are off, the isles are bought with coins and wood alone.
    for (const restorations of [false, true]) {
      on({ wildIsles: true, restorations }, () => {
        for (const id of ['wetland', 'highland', 'goat'] as const) expect(itemAvailable(id), id).toBe(true)
        expect(shopCatalogue('land')).toEqual(['meadow', 'grove', 'islet', 'wetland', 'highland'])
        expect(shopCatalogue('animal')).toContain('goat')
        expect(availableCrops()).toEqual(CROP_IDS)
        for (const id of ITEMS_OF.biomes!) expect(itemAvailable(id), id).toBe(false) // the decor on the isles stays with the biomes
        expectNothingOfOffFeatures()
      })
    }
    on({ wildIsles: true, biomes: true, restorations: true }, () => {
      for (const id of ITEMS_OF.wildIsles!) expect(itemAvailable(id), id).toBe(true)
      expectNothingOfOffFeatures()
    })
    on({ biomes: true, restorations: true }, () => expect(ITEMS_OF.wildIsles!.some((id) => itemAvailable(id))).toBe(false)) // the biomes alone bring nothing
  })

  it('brings the cottage’s and the orchard’s land on their own switch, not on the cottage or repo orchard', () => {
    on({ ringIsles: true }, () => {
      expect(shopCatalogue('land')).toEqual(['meadow', 'grove', 'islet', 'cottageLand', 'orchardLand'])
      expectNothingOfOffFeatures()
    })
    on({ cottage: true, gitEvents: true }, () => {
      for (const id of ITEMS_OF.ringIsles!) expect(itemAvailable(id), id).toBe(false)
    })
  })

  it.each([
    [{ almanac: true }, 'The cat brought in an old almanac. Most of its pages are blank.'],
    [{ restorations: true }, 'A notice board has gone up by the path, with a list of old places worth mending.'],
    [{ studio: true }, 'There is a studio now, for moving things about until they look right.'],
  ] as [Switches, string][])("tells %j's own line at its level", (switches, line) => {
    expect(storyWith(switches)).toContain(line)
    expect(storyWith({})).not.toContain(line)
  })

  it('runs its advance step, and tells no line for the visitors or letters', () => {
    expect(storyWith({ visitors: true })).toEqual(storyWith({}))
    expect(storyWith({ letters: true })).toEqual(storyWith({}))
    on({ visitors: true }, () => expect(activeSteps()).toEqual(['day', 'crops', 'yields', 'visitors', 'journal']))
    on({ letters: true }, () => expect(activeSteps()).toContain('mail'))
    on({ helpers: true }, () => expect(activeSteps()).toContain('workshop'))
    withFeatures(ALL_ON, () => expect(activeSteps()).toEqual(STEPS.map(([name]) => name)))
  })

  it('with everything on, lists the whole catalogue', () => {
    withFeatures(ALL_ON, () => {
      expect(availableItems()).toEqual(ITEM_IDS)
      expect(availableCrops()).toEqual(CROP_IDS)
      const { story } = levelAllTheWay()
      expect(ladderLines().every(({ line }) => story.includes(line))).toBe(true)
    })
  })
})
