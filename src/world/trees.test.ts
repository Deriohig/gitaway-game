import { describe, expect, it } from 'vitest'
import { createInitialState, type GameState } from '../game/state'
import { withFeatures } from '../game/testing'
import { DOCK_IDS, type DockId } from './blueprint'
import { pieceBatches } from './composition'
import { COMPOSITION_ITEMS } from './composition.data'
import { COMPOSITION_META } from './composition.meta'
import { GROVE, ORCHARD } from './isleSpots'
import { FRUIT_TREES, STATIC_TREES, byDockedRim } from './layout'
import { standOnBakedGround } from './testing'
import { treeCount } from './trees'

// The Farm panel's tree count: MainIsland's static trees (less those making way for a docked piece) and fruit trees,
// the meadow's tree, and the grove's clumps and its big tree.

const farm = (owned: Partial<GameState['owned']> = {}) => {
  const s = createInitialState(Date.UTC(2026, 9, 19, 9))
  Object.assign(s.owned, owned)
  return s
}

/** The static trees MainIsland leaves out to make way for these docked pieces. */
const makingWay = (docked: DockId[]) => STATIC_TREES.filter((t) => byDockedRim(t.at, docked)).length
const ALPHA: DockId[] = ['meadow', 'grove', 'islet']

describe('the farm’s tree count', () => {
  it('counts the farm’s own trees and the fruit trees planted, up to the slots there are', () => {
    expect(treeCount(farm())).toBe(STATIC_TREES.length)
    expect(treeCount(farm({ fruitTree: 3 }))).toBe(STATIC_TREES.length + 3)
    expect(treeCount(farm({ fruitTree: 99 }))).toBe(STATIC_TREES.length + FRUIT_TREES.length)
  })

  it('counts the meadow’s tree and every tree the grove draws, and leaves out the farm’s trees that make way for docked pieces', () => {
    expect(GROVE.trees.length).toBeGreaterThan(0)
    expect(treeCount(farm({ grove: 1 }))).toBe(STATIC_TREES.length - makingWay(['grove']) + GROVE.trees.length + 1)
    expect(treeCount(farm({ meadow: 1 }))).toBe(STATIC_TREES.length - makingWay(['meadow']) + 1)
    expect(treeCount(farm({ meadow: 1, grove: 1, islet: 1 }))).toBe(STATIC_TREES.length - makingWay(ALPHA) + 1 + GROVE.trees.length + 1)
  })

  it('counts the art’s trees where its composition is drawn, in place of the meadow’s tree and the grove’s clumps', () => {
    const back = standOnBakedGround(['main', 'meadow', 'grove', 'islet'])
    try {
      const art = (ids: DockId[]) =>
        ['main' as const, ...ids].reduce((n, id) => n + pieceBatches(id, COMPOSITION_ITEMS, { source: 'baked' }).filter((b) => b.category === 'trees').reduce((m, b) => m + b.items.length, 0), 0)
      expect(art([])).toBe(COMPOSITION_META.counts.main.trees)
      expect(treeCount(farm(), art([]))).toBe(STATIC_TREES.length + art([]))
      // The grove keeps its big tree.
      expect(treeCount(farm({ meadow: 1, grove: 1, islet: 1, fruitTree: 2 }), art(ALPHA))).toBe(STATIC_TREES.length - makingWay(ALPHA) + 2 + 1 + art(ALPHA))
      withFeatures({ composition: false }, () => expect(treeCount(farm({ meadow: 1, grove: 1 }))).toBe(STATIC_TREES.length - makingWay(['meadow', 'grove']) + 1 + GROVE.trees.length + 1))
    } finally {
      back()
    }
  })

  it('counts the orchard’s fruit trees once its land is owned, and leaves out the farm’s trees by the rim all the way round', () => {
    const land = { meadow: 1, grove: 1, islet: 1, wetland: 1, highland: 1, cottageLand: 1 }
    const six: DockId[] = ['meadow', 'grove', 'islet', 'wetland', 'highland', 'cottage']
    expect(treeCount(farm(land))).toBe(STATIC_TREES.length - makingWay(six) + 1 + GROVE.trees.length + 1)
    expect(makingWay(DOCK_IDS)).toBeGreaterThan(0)
    expect(ORCHARD.rows.length).toBe(8)
    expect(treeCount(farm({ ...land, orchardLand: 1 }))).toBe(STATIC_TREES.length - makingWay(DOCK_IDS) + 1 + GROVE.trees.length + 1 + ORCHARD.rows.length)
  })
})
