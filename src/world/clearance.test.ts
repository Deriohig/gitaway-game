import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BLUEPRINT, type PieceId } from './blueprint'
import { keptClear, onFootprint, pieceBatches, type CompositionItem, type Footprint } from './composition'
import { COMPOSITION_ITEMS } from './composition.data'
import { GLADE, GROVE, HIGHLAND, ISLET, MEADOW, ORCHARD, OUTCROP_SIZE, SIOFRA_SPOT, WETLAND } from './isleSpots'
import { BEEHIVES, BENCH, BUSHES, FLOWERBEDS, FRUIT_TREES, GREENHOUSE, LANTERNS, ROCKS, SCARECROW, STATIC_TREES, type XZ } from './layout'
import { CAMP, CAMP_STAND } from './places/characters'
import { glbMeshes, vertices } from './testing'

// The art's composition and the game's own things: nothing it draws stands in a slot of the farm's, where the slot
// stands now, or on a thing the game keeps on a piece. The few items there are left out.

const baked = { source: 'baked' as const }
const everything = (items: Record<string, CompositionItem[]>) => Object.entries(items).flatMap(([category, list]) => list.map((item) => ({ category, ...item })))
const drawn = (id: PieceId) => pieceBatches(id, COMPOSITION_ITEMS, baked).flatMap((b) => b.items)
/** What the composition places on a piece but the game leaves out. */
const dropped = (id: PieceId) => {
  const shown = drawn(id)
  return everything(COMPOSITION_ITEMS[id]).filter((item) => !shown.some((d) => d.x === item.x && d.z === item.z && d.asset === item.asset))
}
const named = <T,>(list: readonly T[], what: string, at: (t: T) => XZ, r: (t: T) => number): [string, XZ, number][] => list.map((t, i) => [`${what} ${i}`, at(t), r(t)])

describe('the composition on the farm', () => {
  // Every slot's keep-clear disc, where the slot stands now.
  const slots: [string, XZ, number][] = [
    ...named(FRUIT_TREES, 'fruit tree', (p) => p, () => 0.55),
    ...named(FLOWERBEDS, 'flower bed', (p) => p, () => 0.6),
    ...named(LANTERNS, 'lantern', (p) => p, () => 0.3),
    ...named(BEEHIVES, 'beehive', (p) => p, () => 0.35),
    ...named(BUSHES, 'bush', (p) => p, () => 0.45),
    ...named(STATIC_TREES, 'tree', (t) => t.at, (t) => 0.3 + 0.2 * t.s),
    ...named(ROCKS, 'rock', (r) => r.at, () => 0.4),
    ['bench', [BENCH.x, BENCH.z], 0.6],
    ['scarecrow', SCARECROW, 0.4],
    ['the camp', CAMP, 0.75], // Barnaby's camp, which the composition knew nothing of
    ['where Barnaby stands by the camp', CAMP_STAND, 0.3],
  ]

  it('stands nothing in a slot of the farm’s, or inside the greenhouse, whichever model is in', () => {
    for (const item of drawn('main')) {
      for (const [what, at, r] of slots) expect(Math.hypot(item.x - at[0], item.z - at[1]), `${item.asset} at ${item.x}, ${item.z} in ${what}`).toBeGreaterThanOrEqual(r)
    }
    // The greenhouse footprint is read from the model, turned as the game turns it, with a little room round it.
    const box = new THREE.Box3().setFromPoints(glbMeshes('public/models/greenhouse.glb').flatMap(vertices))
    const half: XZ = [Math.max(-box.min.x, box.max.x) + 0.1, Math.max(-box.min.z, box.max.z) + 0.1]
    const footprint: Footprint = { at: [GREENHOUSE.x, GREENHOUSE.z], half, rot: GREENHOUSE.rot }
    expect(drawn('main').filter((item) => onFootprint(footprint, item.x, item.z)).map((item) => `${item.asset} at ${item.x}, ${item.z}`)).toEqual([])
  })

  it('leaves out only the few items the moved slots now stand on', () => {
    const gone = dropped('main')
    for (const item of gone) expect(slots.some(([, at, r]) => Math.hypot(item.x - at[0], item.z - at[1]) < r), `${item.asset} at ${item.x}, ${item.z}`).toBe(true)
    expect(gone.length).toBeGreaterThan(0)
    expect(gone.length).toBeLessThan(15)
  })
})

describe('the composition on the pieces', () => {
  it('keeps off the things the game keeps there, and leaves out only what stands on them, and little of it', () => {
    const { jetty } = WETLAND
    const deckEnd = (z: number): XZ => [jetty.at[0] + z * Math.sin(jetty.turn), jetty.at[1] + z * Math.cos(jetty.turn)]
    const things: [PieceId, string, XZ][] = [
      ['meadow', 'the meadow’s rock', MEADOW.rock],
      ['meadow', 'where Síofra stands', SIOFRA_SPOT.at],
      ['grove', 'the log', GROVE.log],
      ...ISLET.rocks.map((r, i) => ['islet', `rock ${i}`, r.at] as [PieceId, string, XZ]),
      ['wetland', 'the cranberry bed', WETLAND.cranberryBed.at],
      ['wetland', 'the jetty', jetty.at],
      ['wetland', 'the jetty’s shore end', deckEnd(-0.84)],
      ['wetland', 'the jetty’s far end', deckEnd(0.84)],
      ['wetland', 'the shed patch', jetty.shedPatch.at],
      ...HIGHLAND.outcrops.map((o, i) => ['highland', `outcrop ${i}`, o.at] as [PieceId, string, XZ]),
      ...ORCHARD.rows.map((p, i) => ['orchard', `fruit tree ${i}`, p] as [PieceId, string, XZ]),
      ...GLADE.hives.map((p, i) => ['cottage', `beehive ${i}`, p] as [PieceId, string, XZ]),
    ]
    for (const p of ORCHARD.rows) expect(keptClear('orchard').some((f) => 'r' in f && f.at === p && f.r >= 0.55)).toBe(true) // each fruit tree keeps its whole disc
    for (const [id, what, at] of things) expect(keptClear(id).some((f) => onFootprint(f, ...at)), `${id}: ${what}`).toBe(true)
    for (const id of BLUEPRINT.order) {
      for (const item of drawn(id)) for (const f of keptClear(id)) expect(onFootprint(f, item.x, item.z), `${id} ${item.asset} at ${item.x}, ${item.z}`).toBe(false)
      const gone = dropped(id)
      for (const item of gone) expect(keptClear(id).some((f) => onFootprint(f, item.x, item.z)), `${id} ${item.asset} at ${item.x}, ${item.z}`).toBe(true)
      expect(gone.length, id).toBeLessThan(everything(COMPOSITION_ITEMS[id]).length * 0.1)
    }
    // The cranberry bed is meadow in the art's proof, and the highland's big outcrop stands on a drift of its flowers: they give way.
    expect(dropped('wetland').length).toBeGreaterThan(10)
    expect(dropped('highland').length).toBeGreaterThan(40)
  })

  it('gives way to Síofra with only the grass at her feet: every tree, shrub, rock and flower of the meadow stands clear of her', () => {
    const [x, z] = SIOFRA_SPOT.at
    const her = keptClear('meadow').find((f) => f.at === SIOFRA_SPOT.at)
    expect(her && 'r' in her ? her.r : 0).toBeGreaterThanOrEqual(0.55)
    for (const c of ['trees', 'shrubs', 'rocks', 'flowers'] as const) {
      for (const item of COMPOSITION_ITEMS.meadow[c]) expect(Math.hypot(item.x - x, item.z - z), `${c}: ${item.asset} at ${item.x}, ${item.z}`).toBeGreaterThan(0.55)
    }
    const gone = dropped('meadow').filter((item) => her !== undefined && onFootprint(her, item.x, item.z))
    expect(gone.length).toBeLessThan(8)
    expect(new Set(gone.map((item) => item.category))).toEqual(new Set(gone.length ? ['grass'] : []))
  })

  it('knows a footprint: a disc, or a box turned as rotation.y turns it', () => {
    const disc: Footprint = { at: [1, 1], r: 0.5 }
    expect([onFootprint(disc, 1.4, 1), onFootprint(disc, 1.6, 1)]).toEqual([true, false])
    const box: Footprint = { at: [0, 0], half: [1, 0.2], rot: Math.PI / 2 } // 2 x 0.4 turned a quarter: its long side runs along z
    expect([onFootprint(box, 0, 0.9), onFootprint(box, 0.9, 0)]).toEqual([true, false])
    const { at, rot, half } = WETLAND.cranberryBed // turned by the cranberry bed's turn, its corner is where isleSpots.test.ts puts it
    const corner: XZ = [at[0] + half[0] * 0.99 * Math.cos(rot) + half[1] * 0.99 * Math.sin(rot), at[1] - half[0] * 0.99 * Math.sin(rot) + half[1] * 0.99 * Math.cos(rot)]
    expect(onFootprint({ at, half, rot }, ...corner)).toBe(true)
    expect(OUTCROP_SIZE.outcrop_b.half[1]).toBeGreaterThan(OUTCROP_SIZE.outcrop_b.half[0])
  })
})
