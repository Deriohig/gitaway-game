/// <reference types="node" />
import * as THREE from 'three'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CAMP_FACE, campAt } from './features/Barnaby'
import { VIEW } from './framing'
import { inPolygon, JETTY_DECK, RUIN, WETLAND } from './isleSpots'
import {
  BLOCKERS,
  CAT_NAP,
  FRUIT_TREES,
  GREENHOUSE,
  HERO_ROT,
  heroSink,
  HOUSE,
  ISLES,
  MAIN,
  SCARECROW,
  SCARECROW_SCALE,
  SCARECROW_TURN,
  STATIC_TREES,
  WINDMILL,
  windmillDrop,
  WOODSHED,
  WOODSHED_ROT,
  woodshedDrop,
  type XZ,
} from './layout'
import { CAMP_ROT, CAMP_STAND } from './places/characters'
import { footprintDrop, type Island } from './terrain'
import { glbMeshes, glbRootNodes, standOnBakedGround, vertices } from './testing'

// Measures the hand-made models in public/models against the baked ground the game stands them on, so a model
// that floats or sinks shows up here, not by eye.

let procedural: () => void
beforeAll(() => {
  procedural = standOnBakedGround(['main', 'wetland', 'highland'])
})
afterAll(() => procedural())

const UP = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)
/** Where a thing stands: at (x, y, z), turned by `turn` (rotation.y). */
const standing = (x: number, y: number, z: number, turn: number) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, turn), new THREE.Vector3(1, 1, 1))
/** A model's vertices, in its own frame. */
const modelOf = (name: string) => glbMeshes(`public/models/${name}.glb`).flatMap(vertices)
/** Gaps (+ above, − below the ground) all lie within (−down, up). */
const expectGrounded = (gaps: number[], up: number, down: number) => {
  expect(gaps.length).toBeGreaterThan(20)
  expect(Math.max(...gaps)).toBeLessThan(up)
  expect(Math.min(...gaps)).toBeGreaterThan(-down)
}

/** How far each of a model's lowest vertices (its foot) is above (+) or below (−) the ground where the game stands it. */
function footGaps(model: THREE.Vector3[], island: Island, [x, z]: XZ, y: number, turn: number): number[] {
  const low = Math.min(...model.map((v) => v.y))
  const at = standing(x, y, z, turn)
  return model
    .filter((v) => v.y < low + 0.03)
    .map((v) => {
      const w = v.clone().applyMatrix4(at)
      return w.y - island.height(w.x, w.z)
    })
}

it('measures the slopes on the ground as drawn, the baked piece once it has loaded', () => {
  const [x, z] = STATIC_TREES[0].at
  expect(heroSink()).toBeCloseTo(footprintDrop(MAIN, x, z, 1.5), 5)
  expect(windmillDrop()).toBeCloseTo(footprintDrop(MAIN, WINDMILL[0], WINDMILL[1], 0.8), 5)
})

describe('the cat on the porch', () => {
  // The farmhouse as the game stands it; the porch lamp hangs above the deck, so it is left out.
  const house = glbMeshes('public/models/farmhouse.glb', ['PorchLamp'])
  const cat = glbMeshes('public/models/cat_sleeping.glb')
  const ray = new THREE.Raycaster()
  /** The top of whatever is under a point of the porch, in the house's own frame. */
  const under = (x: number, z: number) => {
    ray.set(new THREE.Vector3(x, 0.6, z), DOWN)
    return ray.intersectObjects(house)[0]?.point.y
  }
  const deck = under(-0.25, 1.3)!
  /** The cat's vertices in the farmhouse's own frame, where the game lays it. */
  const catOnPorch = () => {
    const houseAt = standing(HOUSE.x, MAIN.height(HOUSE.x, HOUSE.z), HOUSE.z, HOUSE.rot)
    const catAt = standing(CAT_NAP.at[0], CAT_NAP.y, CAT_NAP.at[1], CAT_NAP.face)
    const toHouse = houseAt.invert().multiply(catAt)
    return cat.flatMap((mesh) => vertices(mesh).map((v) => v.applyMatrix4(toHouse)))
  }

  it('lies wholly on the deck boards: clear of its edges and posts, neither above nor sunk in them', () => {
    expect(deck).toBeGreaterThan(0.15)
    expect(deck).toBeLessThan(0.3)
    const verts = catOnPorch()
    const off = verts.filter((v) => Math.abs((under(v.x, v.z) ?? -1) - deck) > 0.012)
    expect(off.length, `cat over ${off.slice(0, 3).map((v) => `(${v.x.toFixed(2)}, ${v.z.toFixed(2)}): ${under(v.x, v.z)?.toFixed(3)}`).join(', ')}`).toBe(0)
    expect(Math.abs(Math.min(...verts.map((v) => v.y)) - deck)).toBeLessThan(0.015)
  })

  it('shows the camera its sleeping face (along the model’s +X; the camera looks from +x/+z)', () => {
    const face = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, CAT_NAP.face)
    expect(face.dot(new THREE.Vector3(...VIEW.dir).setY(0).normalize())).toBeGreaterThan(0.85)
  })
})

it('stands the hero tree with its lowest roots on the ground, on the slope it grows on', () => {
  const SET_IN = -0.05 // every static tree is stood this far into the ground, in MainIsland
  const verts = modelOf('hero_tree')
  const lowest = Math.min(...verts.map((v) => v.y))
  const roots = verts.filter((v) => v.y < lowest + 0.05)
  expect(roots.length).toBeGreaterThan(100)
  const [x, z] = STATIC_TREES[0].at
  const base = MAIN.height(x, z) + SET_IN + heroSink()
  const cos = Math.cos(HERO_ROT)
  const sin = Math.sin(HERO_ROT)
  const gaps = roots.map((v) => base + v.y - MAIN.height(x + v.x * cos + v.z * sin, z - v.x * sin + v.z * cos))
  // No root floats, and none is sunk deeper than it needs.
  expect(Math.max(...gaps)).toBeLessThan(0.05)
  expect(Math.max(...gaps)).toBeGreaterThan(-0.05)
})

describe('the lighthouse beam', () => {
  const file = 'public/models/lighthouse.glb'
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  const faceCentres = (mesh: THREE.Mesh) => {
    const p = mesh.geometry.getAttribute('position')
    const index = mesh.geometry.getIndex()!
    const out: THREE.Vector3[] = []
    for (let t = 0; t < index.count; t += 3) {
      const c = new THREE.Vector3()
      for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(p, index.getX(t + k)))
      out.push(c.divideScalar(3))
    }
    return out
  }

  it('turns about a Beam node at the model’s root, in the lamp room among the glass the model lights', () => {
    const beam = glbRootNodes(file).Beam
    expect(beam).toBeDefined()
    const lit = glbMeshes(file).filter((m) => m.name === 'Glow').flatMap(faceCentres).filter((c) => c.y > 2)
    expect(lit.length).toBeGreaterThan(20)
    expect(Math.abs(median(lit.map((c) => c.y)) - beam.y)).toBeLessThan(0.2)
    expect(Math.abs(median(lit.map((c) => c.x)) - beam.x)).toBeLessThan(0.15)
    expect(Math.abs(median(lit.map((c) => c.z)) - beam.z)).toBeLessThan(0.15)
  })
})

describe('the greenhouse', () => {
  const meshes = glbMeshes('public/models/greenhouse.glb')
  const all = meshes.flatMap(vertices)
  const box = new THREE.Box3().setFromPoints(all)
  const onFarm = (x: number, z: number): XZ => {
    const { x: gx, z: gz, rot } = GREENHOUSE
    return [gx + x * Math.cos(rot) + z * Math.sin(rot), gz - x * Math.sin(rot) + z * Math.cos(rot)]
  }

  it('keeps its own painted glass (no Glass material for the game to swap) and fits the ground kept clear round it', () => {
    expect(meshes.map((m) => m.name)).not.toContain('Glass')
    const blocker = BLOCKERS.find((b) => b.at[0] === GREENHOUSE.x && b.at[1] === GREENHOUSE.z)!
    const half = { x: Math.max(-box.min.x, box.max.x), z: Math.max(-box.min.z, box.max.z) }
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [x, z] = onFarm(sx * half.x, sz * half.z)
      expect(Math.hypot(x - GREENHOUSE.x, z - GREENHOUSE.z)).toBeLessThan(blocker.r - 0.2)
    }
  })

  it('stands on the ground all round, no corner of it floating', () => {
    const y0 = MAIN.height(GREENHOUSE.x, GREENHOUSE.z)
    const gaps = all.filter((v) => v.y < box.min.y + 0.03).map((v) => y0 + v.y - MAIN.height(...onFarm(v.x, v.z)))
    expectGrounded(gaps, 0.04, 0.04)
  })
})

describe('the scarecrow', () => {
  const crow = modelOf('scarecrow')
  const FRUIT_TREE_SCALE = 0.72 // as MainIsland draws the fruit trees in their slots
  const tree = modelOf('tree_fruit')
  /** How far the crown reaches out from the trunk at a height (in the tree's own units). */
  const crownAt = (y: number) => Math.max(0, ...tree.filter((v) => Math.abs(v.y - y) < 0.06).map((v) => Math.hypot(v.x, v.z)))

  it('keeps its arms out of the fruit trees’ crowns and stands taller than the fence and crops', () => {
    let nearest = Infinity
    for (const [tx, tz] of FRUIT_TREES) {
      for (const v of crow) {
        const w = v.clone().multiplyScalar(SCARECROW_SCALE).applyAxisAngle(UP, SCARECROW_TURN)
        nearest = Math.min(nearest, Math.hypot(SCARECROW[0] + w.x - tx, SCARECROW[1] + w.z - tz) - FRUIT_TREE_SCALE * crownAt(w.y / FRUIT_TREE_SCALE))
      }
    }
    expect(nearest).toBeGreaterThan(0.03)
    expect(Math.max(...crow.map((v) => v.y)) * SCARECROW_SCALE).toBeGreaterThan(1)
  })
})

it('stands the woodshed on the ground all round, none of it floating or sunk', () => {
  const gaps = footGaps(modelOf('woodshed'), MAIN, WOODSHED, MAIN.height(...WOODSHED) + woodshedDrop(), WOODSHED_ROT)
  expectGrounded(gaps, 0.04, 0.06)
})

describe('the wetland jetty', () => {
  const jetty = modelOf('wetland_jetty')
  const { at, y, turn } = WETLAND.jetty
  const wetland = ISLES.wetland.island
  const place = standing(at[0], y, at[1], turn)
  const onPiece = (v: THREE.Vector3) => {
    const w = v.clone().applyMatrix4(place)
    return { w, ground: wetland.height(w.x, w.z) }
  }

  it('fits the deck the game keeps clear for it', () => {
    const box = new THREE.Box3().setFromPoints(jetty)
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(JETTY_DECK.half[0])
    expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual(JETTY_DECK.half[1])
  })

  it('stands at the lake’s level (its y 0 is the waterline), its far end running out over open water', () => {
    expect(y).toBeCloseTo(WETLAND.lake.level, 3)
    expect(turn).toBeCloseTo(-0.763, 3)
    const { w, ground } = onPiece(new THREE.Vector3(0, 0, 0.85))
    expect(inPolygon([w.x, w.z], WETLAND.lake.outline)).toBe(true)
    expect(ground).toBeLessThan(WETLAND.lake.level - 0.05)
  })

  it('keeps its deck above the bank, and rests its shore-end sill log on the bank, none of it floating', () => {
    const deck = jetty.filter((v) => v.y > 0.17 && v.y < 0.25)
    expect(deck.length).toBeGreaterThan(20)
    expect(Math.min(...deck.map((v) => onPiece(v)).map(({ w, ground }) => w.y - ground))).toBeGreaterThan(0.01)
    const sill = jetty.filter((v) => v.z < -0.75 && v.y < 0.17)
    expect(sill.length).toBeGreaterThan(8)
    const lowest = Math.min(...sill.map((v) => v.y))
    const gaps = sill.filter((v) => v.y < lowest + 0.01).map((v) => onPiece(v)).map(({ w, ground }) => w.y - ground)
    expect(Math.min(...gaps)).toBeLessThan(0)
    expect(Math.max(...gaps)).toBeLessThan(0.025)
  })
})

describe('Barnaby, his camp and the ruin', () => {
  const him = modelOf('barnaby')
  const BAND = 0.04
  /** How far he reaches from his middle, all the way round, in each 4 cm band of height. */
  const widest: number[] = Array.from({ length: 30 }, () => 0)
  for (const v of him) {
    const b = Math.floor(v.y / BAND)
    widest[b] = Math.max(widest[b] ?? 0, Math.hypot(v.x, v.z))
  }
  const reach = (y: number) => {
    const b = Math.floor(y / BAND)
    return Math.max(widest[b - 1] ?? 0, widest[b] ?? 0, widest[b + 1] ?? 0)
  }
  /** How far a model, where the game stands it, keeps out of him where he stands, up to his hat: negative inside his reach. */
  const room = (model: THREE.Vector3[], modelAt: THREE.Matrix4, hisAt: THREE.Matrix4) => {
    const toHim = hisAt.clone().invert().multiply(modelAt)
    let least = Infinity
    for (const v of model) {
      const p = v.clone().applyMatrix4(toHim)
      if (p.y > 1.1) continue
      least = Math.min(least, Math.hypot(p.x, p.z) - reach(p.y))
    }
    return least
  }

  it('is one model on a single root node, his feet on its origin, 1.06 tall, within 0.26 of his middle', () => {
    expect(Object.keys(glbRootNodes('public/models/barnaby.glb'))).toEqual(['barnaby'])
    const box = new THREE.Box3().setFromPoints(him)
    expect(box.min.y).toBeCloseTo(0, 3)
    expect(box.max.y).toBeCloseTo(1.063, 2)
    expect(Math.max(...him.map((v) => Math.hypot(v.x, v.z)))).toBeLessThan(0.26)
  })

  describe('at the camp', () => {
    const camp = modelOf('barnaby_camp')

    it('stands the camp and him on their ground, faces him to the farmhouse, and keeps his robe clear of the camp', () => {
      const [cx, cy, cz] = campAt()
      expectGrounded(footGaps(camp, MAIN, [cx, cz], cy, CAMP_ROT), 0.04, 0.06)
      expectGrounded(footGaps(him, MAIN, CAMP_STAND, MAIN.height(...CAMP_STAND), CAMP_FACE), 0.03, 0.05)
      const front = new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, CAMP_FACE)
      const toHouse = new THREE.Vector3(HOUSE.x - CAMP_STAND[0], 0, HOUSE.z - CAMP_STAND[1]).normalize()
      expect(front.dot(toHouse)).toBeGreaterThan(0.9999)
      // The camp's poles and guy lines, his books and candle, the kettle on its stones.
      expect(room(camp, standing(...campAt(), CAMP_ROT), standing(CAMP_STAND[0], MAIN.height(...CAMP_STAND), CAMP_STAND[1], CAMP_FACE))).toBeGreaterThan(0.02)
    })
  })

  describe('at the ruin', () => {
    const ruin = modelOf('tower_ruin')
    const highland = ISLES.highland.island

    it('turns it as the art does (open front +Z along (0.41, 0.91)) and stands him on the model’s spot, (0, −0.40), facing out of it', () => {
      expect(RUIN.turn).toBeCloseTo(Math.atan2(0.41, 0.91), 2)
      const spot = new THREE.Vector3(RUIN.stand[0] - RUIN.at[0], 0, RUIN.stand[1] - RUIN.at[1]).applyAxisAngle(UP, -RUIN.turn)
      expect(spot.x).toBeCloseTo(0, 2)
      expect(spot.z).toBeCloseTo(-0.4, 2)
    })

    it('stands it and him on the plateau, and keeps him inside its walls, clear of them and the rubble', () => {
      expectGrounded(footGaps(ruin, highland, RUIN.at, highland.height(...RUIN.at), RUIN.turn), 0.02, 0.08)
      expectGrounded(footGaps(him, highland, RUIN.stand, highland.height(...RUIN.stand), RUIN.turn), 0.03, 0.05)
      // The back wall's inner face is 0.73 from the middle, and he stands 0.40 back.
      expect(0.4 + Math.max(...widest)).toBeLessThan(0.73)
      const ruinAt = standing(RUIN.at[0], highland.height(...RUIN.at), RUIN.at[1], RUIN.turn)
      const hisAt = standing(RUIN.stand[0], highland.height(...RUIN.stand), RUIN.stand[1], RUIN.turn)
      expect(room(ruin, ruinAt, hisAt)).toBeGreaterThan(0.02)
    })
  })
})
