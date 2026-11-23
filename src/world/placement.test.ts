import * as THREE from 'three'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import blueprintRaw from '../../art/config/blueprint.pieces.json?raw'
import raw from '../../art/config/composition.pieces.json?raw'
import type { VisitorId } from '../game/content/visitors'
import { zone } from './blueprint'
import { visitorTap } from './features/Visitors'
import { ISLE_VISITORS, KEPT_CLEAR, RUIN, SIOFRA_SPOT } from './isleSpots'
import { bushModel } from './Nature'
import {
  BEEHIVES,
  BENCH,
  BLOCKERS,
  BUSHES,
  bushLook,
  CHICKEN_YARDS,
  DIRT_PATHS,
  DOG_YARD,
  FENCE_RUNS,
  FLOWERBEDS,
  FRUIT_TREES,
  HOME_FENCE,
  HOUSE,
  ISLES,
  LANTERNS,
  LEGACY_POND,
  MAIN,
  POND,
  POND_SHORE,
  ROCKS,
  SCARECROW,
  SLOT_DISCS,
  STATIC_TREES,
  STONE_PATHS,
  STREAM_LINE,
  WELL,
  WINDMILL,
  WINDMILL_ROT,
  WOODSHED,
  WOODSHED_ROT,
  type XZ,
} from './layout'
import { CAMP, CAMP_ROT, CAMP_STAND, CHARACTER_BLOCKERS, TAP } from './places/characters'
import { rng } from './random'
import { footprintDrop, type Island } from './terrain'
import { fromFarmWater, fromOutline, glbMeshes, standOnBakedGround, vertices } from './testing'
import { ANIMAL_ROOM, farmPatch, nextSpot } from './wander'

const ground = (height: (x: number, z: number) => number) => ({ height }) as Island

/** The art's path ribbons on the farm, each with its widest width. */
const ribbons = (JSON.parse(raw) as { pieces: { main: { paths: { id: string; width: number; pts: XZ[] }[] } } }).pieces.main.paths

/** How close the straight run from `a` to `b` comes to a point (`a` itself, when they're the same). */
const closest = ([ax, az]: XZ, [bx, bz]: XZ, [x, z]: XZ) => {
  const dx = bx - ax
  const dz = bz - az
  const length2 = dx * dx + dz * dz
  const t = length2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2)) : 0
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
}
const fromPath = (points: XZ[], p: XZ) => Math.min(...points.slice(1).map((b, i) => closest(points[i], b, p)))
const dist = (a: XZ, [x, z]: XZ) => Math.hypot(x - a[0], z - a[1])

/** A disc of radius `r` at `p` keeps clear of every slot disc (bar `skip`), dirt path, stepping stone and ribbon. */
function expectClearOfSlotsAndPaths(p: XZ, r: number, skip: unknown[] = []) {
  for (const d of SLOT_DISCS.filter((d) => !skip.includes(d))) expect(dist(p, d.at), `the slot at (${d.at})`).toBeGreaterThanOrEqual(d.r + r)
  // The dirt paths are up to 0.6 wide and the stepping stones about 0.4.
  for (const path of DIRT_PATHS) expect(fromPath(path, p), `the dirt path from (${path[0]})`).toBeGreaterThanOrEqual(0.3 + r)
  for (const path of STONE_PATHS) expect(fromPath(path, p), `the stepping stones from (${path[0]})`).toBeGreaterThanOrEqual(0.2 + r)
  for (const run of ribbons) expect(fromPath(run.pts, p), `the ribbon ${run.id}`).toBeGreaterThanOrEqual(run.width / 2 + r)
}

describe('where models stand', () => {
  it.each([
    ['level ground at its own height', ground(() => 0.4), [1, 2, 0.8], 0],
    ['a slope at the lowest ground under it', ground((x) => x * 0.1), [0, 0, 1], -0.1],
    ['a downhill slope the same', ground((x) => -x * 0.1), [3, 0, 1], -0.1],
    ['a footprint 2 long on x', ground((x) => x), [0, 0, 2, 0.5, 0], -2],
    ['a footprint turned a quarter, the long side along z', ground((x) => x), [0, 0, 2, 0.5, Math.PI / 2], -0.5],
  ] as [string, Island, [number, number, number, number?, number?], number][])('stands on %s', (_, island, args, drop) => {
    expect(footprintDrop(island, ...args)).toBeCloseTo(drop)
  })

  it('sinks the well a little into its slope, and turns the windmill door (+Z) to the end of its stone path', () => {
    const drop = footprintDrop(MAIN, WELL[0], WELL[1], 0.45)
    expect(drop).toBeLessThan(-0.03)
    expect(drop).toBeGreaterThan(-0.2)
    const end = STONE_PATHS[2][STONE_PATHS[2].length - 1]
    expect(WINDMILL_ROT).toBeCloseTo(Math.atan2(end[0] - WINDMILL[0], end[1] - WINDMILL[1]), 2)
  })
})

describe('fences', () => {
  it('never pass within 1.5 u of a tree that is always there (the hero tree’s roots reach about 1.36)', () => {
    for (const [what, runs] of [['the home fence', HOME_FENCE], ['the garden fence', FENCE_RUNS]] as const) {
      runs.forEach(([a, b], i) => {
        for (const tree of STATIC_TREES) expect(closest(a, b, tree.at), `${what}, run ${i}, by the tree at (${tree.at})`).toBeGreaterThanOrEqual(1.5)
      })
    }
  })

  it('leave the garden gate open where the dirt path comes in', () => {
    const gate = DIRT_PATHS[0][DIRT_PATHS[0].length - 1]
    for (const [a, b] of [...HOME_FENCE, ...FENCE_RUNS]) expect(closest(a, b, gate)).toBeGreaterThan(0.25)
  })
})

it('keeps the farm’s bushes’ feet off the big tree’s root flare', () => {
  /** How far a model reaches from its middle along the ground: its vertices within 5 cm of its lowest. */
  const foot = (file: string) => {
    const model = glbMeshes(file).flatMap(vertices)
    const lowest = Math.min(...model.map((v) => v.y))
    return Math.max(...model.filter((v) => v.y < lowest + 0.05).map((v) => Math.hypot(v.x, v.z)))
  }
  const flare = foot('public/models/hero_tree.glb')
  expect(flare).toBeGreaterThan(1.4)
  const [tx, tz] = STATIC_TREES[0].at
  const onRoots = BUSHES.flatMap((at, i) => {
    const { scale, seed, flowers } = bushLook(i)
    const reach = flare + foot(`public/models/${bushModel(seed, flowers)}.glb`) * scale
    const from = Math.hypot(at[0] - tx, at[1] - tz)
    return from > reach ? [] : [`bush ${i} at (${at}): ${from.toFixed(3)} from the trunk, within ${reach.toFixed(3)}`]
  })
  expect(onRoots).toEqual([])
})

describe('the woodshed', () => {
  const own = BLOCKERS.find((b) => b.at === WOODSHED)!
  /** The farmhouse's blocker: a disc round a square house, which the woodshed stands in the corner of. */
  const house = BLOCKERS.find((b) => b.at[0] === HOUSE.x && b.at[1] === HOUSE.z)!
  /** A place on the farm in the farmhouse's own frame: its door on +Z, its right side on +x. */
  const byTheHouse = ([x, z]: XZ): XZ => {
    const [dx, dz, a] = [x - HOUSE.x, z - HOUSE.z, HOUSE.rot]
    return [dx * Math.cos(a) - dz * Math.sin(a), dx * Math.sin(a) + dz * Math.cos(a)]
  }

  it('stands beside the farmhouse, back right of it by its log stack, on ground clear of the other buildings, slots and paths', () => {
    expect(dist([HOUSE.x, HOUSE.z], WOODSHED)).toBeLessThan(3)
    expect(own.r).toBeGreaterThanOrEqual(0.6)
    const [x, z] = byTheHouse(WOODSHED)
    expect(x).toBeCloseTo(2.0)
    expect(z).toBeCloseTo(-1.2)
    for (const b of BLOCKERS.filter((b) => b !== own && b !== house)) expect(dist(WOODSHED, b.at), `the area at (${b.at})`).toBeGreaterThanOrEqual(b.r + own.r)
    expectClearOfSlotsAndPaths(WOODSHED, own.r)
  })

  it('stands nearer the farmhouse than their round grounds allow, square to it, its footprint clear of the house’s eaves and log stack', () => {
    expect(dist(WOODSHED, house.at)).toBeLessThan(house.r + own.r)
    expect(WOODSHED_ROT).toBe(HOUSE.rot)
    const [sx, sz] = byTheHouse(WOODSHED)
    const shed = new THREE.Box3().setFromPoints(glbMeshes('public/models/woodshed.glb').flatMap(vertices)).translate(new THREE.Vector3(sx, 0, sz))
    const farmhouse = glbMeshes('public/models/farmhouse.glb').flatMap(vertices)
    /** How far a point of the farmhouse is from the woodshed's footprint, seen from above. */
    const gap = (v: THREE.Vector3) => Math.hypot(Math.max(shed.min.x - v.x, 0, v.x - shed.max.x), Math.max(shed.min.z - v.z, 0, v.z - shed.max.z))
    const eaves = Math.min(...farmhouse.filter((v) => v.y > 0.5).map(gap))
    expect(eaves).toBeGreaterThan(0.1)
    expect(eaves).toBeLessThan(0.15)
    // The log stack along the house's side ends just before the woodshed's front.
    expect(Math.min(...farmhouse.map(gap))).toBeGreaterThan(0.03)
  })
})

/** How far round where he stands Barnaby reaches (public/models/barnaby.glb, widest 0.256). */
const ROBE = 0.26

describe('the camp', () => {
  const own = BLOCKERS.find((b) => b.at === CAMP)!
  const his = BLOCKERS.find((b) => b.at === CAMP_STAND)!
  const others = BLOCKERS.filter((b) => !CHARACTER_BLOCKERS.includes(b))
  const disc = SLOT_DISCS.find((d) => d.at === CAMP)
  const hisDisc = SLOT_DISCS.find((d) => d.at === CAMP_STAND)
  /** How far a point is outside the garden fence's line, round all four sides (the gate is only a gap in it): 0 inside it. */
  const xs = FENCE_RUNS.flat().map(([x]) => x)
  const zs = FENCE_RUNS.flat().map(([, z]) => z)
  const outside = ([x, z]: XZ) => Math.hypot(Math.max(Math.min(...xs) - x, 0, x - Math.max(...xs)), Math.max(Math.min(...zs) - z, 0, z - Math.max(...zs)))
  /** The corners of the camp itself, about 1.0 by 0.7, turned as it stands. */
  const corners = ([[-0.5, -0.35], [0.5, -0.35], [0.5, 0.35], [-0.5, 0.35]] as XZ[]).map(([x, z]): XZ => [
    CAMP[0] + x * Math.cos(CAMP_ROT) + z * Math.sin(CAMP_ROT),
    CAMP[1] - x * Math.sin(CAMP_ROT) + z * Math.cos(CAMP_ROT),
  ])

  it('stands just outside the garden fence, on ground of its own the composition keeps clear of, clear of the other buildings, woodshed, slots and paths', () => {
    expect(outside(CAMP)).toBeLessThanOrEqual(1.2)
    for (const corner of corners) expect(outside(corner), `the corner at (${corner})`).toBeGreaterThan(0)
    expect(own.r).toBe(0.65)
    expect(disc?.r).toBeGreaterThanOrEqual(own.r)
    for (const b of others) expect(dist(CAMP, b.at), `the area at (${b.at})`).toBeGreaterThanOrEqual(b.r + own.r)
    expect(dist(CAMP, WOODSHED)).toBeGreaterThanOrEqual(0.65 + own.r)
    expectClearOfSlotsAndPaths(CAMP, own.r, [disc, hisDisc])
  })

  it('has Barnaby stand 0.75 u from it, outside the fence, off every path and slot, on ground of his own covering his tap target', () => {
    expect(dist(CAMP, CAMP_STAND)).toBeCloseTo(0.75)
    expect(outside(CAMP_STAND)).toBeGreaterThan(ROBE)
    expect(hisDisc?.r).toBeGreaterThanOrEqual(ROBE)
    expectClearOfSlotsAndPaths(CAMP_STAND, ROBE, [disc, hisDisc])
    expect(his.r).toBeGreaterThanOrEqual(TAP.reach)
    for (const b of others) expect(dist(CAMP_STAND, b.at), `the area at (${b.at})`).toBeGreaterThanOrEqual(b.r + his.r)
  })

  it('keeps the hens and the dog off the camp and out of Barnaby’s tap target, where they stop and the whole way between', () => {
    const camp = Math.hypot(0.5, 0.35) + ANIMAL_ROOM
    const tap = TAP.reach + ANIMAL_ROOM
    for (const yard of [...CHICKEN_YARDS, DOG_YARD]) {
      const patch = farmPatch(yard.center, yard.radius)
      for (let seed = 1; seed <= 12; seed++) {
        const rand = rng(seed)
        let at = nextSpot(patch, rand, null)
        for (let i = 0; i < 300; i++) {
          const to = nextSpot(patch, rand, at)
          const walk = `the walk from (${at}) to (${to})`
          expect(closest(at, to, CAMP), walk).toBeGreaterThanOrEqual(camp)
          expect(closest(at, to, CAMP_STAND), walk).toBeGreaterThanOrEqual(tap)
          at = to
        }
      }
    }
  })
})

describe('the isles’ characters', () => {
  let putBack = () => {}
  beforeAll(() => {
    putBack = standOnBakedGround(['highland', 'meadow'])
  })
  afterAll(() => putBack())

  /** The middle of a tap target standing at a spot on an isle. */
  const middle = (isle: 'highland' | 'meadow', [x, z]: XZ, lift: number, height: number) => new THREE.Vector3(x, ISLES[isle].island.height(x, z) + lift + height, z)

  it('has Barnaby stand on the ruin’s level spot, his tap target off any visitor waiting on the highland', () => {
    expect(Math.hypot(RUIN.stand[0] - RUIN.at[0], RUIN.stand[1] - RUIN.at[1]) + ROBE).toBeLessThanOrEqual(zone('highland', 'ruins').r)
    const his = middle('highland', RUIN.stand, 0, TAP.height)
    for (const [id, spot] of Object.entries(ISLE_VISITORS)) {
      if (spot.isle !== 'highland') continue
      const theirs = visitorTap(id as VisitorId)
      expect(his.distanceTo(middle('highland', spot.at, spot.lift, theirs.height)), id).toBeGreaterThan(TAP.reach + theirs.reach)
    }
  })

  it('keeps Síofra’s tap target, as big as Barnaby’s, off the hare’s, and her ground clear a little wider than it', () => {
    const hare = ISLE_VISITORS.hare
    const theirs = visitorTap('hare')
    expect(hare.isle).toBe(SIOFRA_SPOT.isle)
    const hers = middle('meadow', SIOFRA_SPOT.at, SIOFRA_SPOT.lift, TAP.height)
    expect(hers.distanceTo(middle('meadow', hare.at, hare.lift, theirs.height))).toBeGreaterThan(TAP.reach + theirs.reach)
    const kept = KEPT_CLEAR.meadow?.find((f) => f.at === SIOFRA_SPOT.at)
    expect(kept && 'r' in kept ? kept.r : 0).toBeGreaterThanOrEqual(TAP.reach + 0.05)
  })
})

describe('the farm’s pond and stream', () => {
  interface MainWater {
    pond: { outline: XZ[]; legacy: { at: XZ; r: number; outline: XZ[] } }
    stream: { line: { x: number; z: number; width: number }[] }
  }
  const water = (JSON.parse(blueprintRaw) as { pieces: { main: { water: MainWater } } }).pieces.main.water
  /** Points all over the water, 5 cm apart, and every point of the pond's shore. */
  const wet: XZ[] = [...POND_SHORE]
  for (let x = -7; x <= 0; x += 0.05) for (let z = 3; z <= 6.6; z += 0.05) if (fromFarmWater([x, z]) <= 0) wet.push([x, z])
  /** How far a point is inside the blockers' ground: inside the disc it is deepest in (negative outside them all). */
  const blocked = ([x, z]: XZ) => Math.max(...BLOCKERS.map((b) => b.r - Math.hypot(x - b.at[0], z - b.at[1])))

  it('follows the art’s Teardrop and stream as the blueprint has them, and leaves the legacy pond as the art records it', () => {
    expect(POND_SHORE).toEqual(water.pond.outline)
    expect(POND_SHORE.length).toBe(191)
    expect(STREAM_LINE.map((p) => [...p.at, p.width])).toEqual(water.stream.line.map((p) => [p.x, p.z, p.width]))
    expect(wet.length).toBeGreaterThan(4000)
    expect([LEGACY_POND.x, LEGACY_POND.z]).toEqual(water.pond.legacy.at)
    expect(LEGACY_POND.r).toBe(water.pond.legacy.r)
  })

  it('has its open middle, which the ducks paddle round, as the widest circle inside the new shore', () => {
    const deepest = Math.max(0, ...wet.map((p) => -fromOutline(p, POND_SHORE)))
    expect(deepest).toBeGreaterThan(1.3)
    expect(-fromOutline([POND.x, POND.z], POND_SHORE)).toBeGreaterThanOrEqual(POND.r)
    expect(POND.r).toBeGreaterThan(deepest - 0.05)
  })

  it('keeps the ground round the water clear: the pond and stream at least 0.3 inside the blockers, which reach no more than 0.45 past it', () => {
    expect(wet.filter((p) => blocked(p) < 0.3).map(([x, z]) => `${x.toFixed(2)}, ${z.toFixed(2)}: ${blocked([x, z]).toFixed(3)}`).slice(0, 5)).toEqual([])
    for (const p of water.pond.legacy.outline) expect(blocked(p), `the legacy shore at (${p})`).toBeGreaterThan(0.1)
    for (const b of BLOCKERS.filter((b) => fromFarmWater(b.at) < b.r)) {
      for (let k = 0; k < 180; k++) {
        const a = (k / 180) * Math.PI * 2
        const edge: XZ = [b.at[0] + Math.cos(a) * b.r, b.at[1] + Math.sin(a) * b.r]
        expect(fromFarmWater(edge), `the blocker at (${b.at}) r ${b.r}, at (${edge})`).toBeLessThan(0.46)
      }
    }
    // Every other blocker keeps its whole disc on dry ground.
    for (const b of BLOCKERS.filter((b) => fromFarmWater(b.at) >= 0)) expect(fromFarmWater(b.at), `the area at (${b.at})`).toBeGreaterThanOrEqual(b.r)
  })

  it('stands every slot at least 0.3 from the water, the bench’s seat and the flower beds whole, flower bed 8 on the lawn south of the pond', () => {
    expect(FLOWERBEDS[7]).toEqual([-1.5, 7.75])
    const spots: [string, XZ][] = [
      ...FRUIT_TREES.map((p, i) => [`fruit tree ${i}`, p] as [string, XZ]),
      ...LANTERNS.map((p, i) => [`lantern ${i}`, p] as [string, XZ]),
      ...BEEHIVES.map((p, i) => [`beehive ${i}`, p] as [string, XZ]),
      ...BUSHES.map((p, i) => [`bush ${i}`, p] as [string, XZ]),
      ...STATIC_TREES.map((t, i) => [`tree ${i}`, t.at] as [string, XZ]),
      ...ROCKS.map((r, i) => [`rock ${i}`, r.at] as [string, XZ]),
      ['the scarecrow', SCARECROW],
      ['the well', WELL],
    ]
    for (const [what, at] of spots) expect(fromFarmWater(at), what).toBeGreaterThanOrEqual(0.3)
    // A flower bed and the bench's seat are about 1.2 across: their discs keep 0.3 from the water.
    FLOWERBEDS.forEach((at, i) => expect(fromFarmWater(at) - 0.6, `flower bed ${i}`).toBeGreaterThanOrEqual(0.3))
    expect(fromFarmWater([BENCH.x, BENCH.z]) - 0.6, 'the bench').toBeGreaterThanOrEqual(0.3)
  })
})
