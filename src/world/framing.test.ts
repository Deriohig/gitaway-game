import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ITEMS, ITEM_IDS } from '../game/config'
import { createInitialState } from '../game/state'
import { ALL_OFF, withFeatures } from '../game/testing'
import { DOCK_IDS, dockedAt, mainThetaRange, PIECES, type DockId } from './blueprint'
import { defaultFrame, frameDistance, overviewDistance, pieceFrame, riseFrame, visibleIsles, VIEW } from './framing'
import { BEEHIVES, BENCH, BUSHES, FLOWERBEDS, FRUIT_TREES, LANTERNS, RIM_BAND, ROCKS, SCARECROW, STATIC_TREES, STREAM_THETA, WELL, byDockedRim, insideRim, isClear, type XZ } from './layout'
import { polygonOutline } from './pieces'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)
const tan = Math.tan(VIEW.halfFov)
const ALPHA: DockId[] = ['meadow', 'grove', 'islet']
const PHONE = 412 / 915
const REPO = { path: '/r', name: 'r', cursor: 0, addedAt: T0, commits: 1, alias: 'Apple', tagCursor: 0 }

/** The pieces in the world for a farm that has bought every piece of land there is: the island closed all the way round. */
function closedIsland(): DockId[] {
  const s = createInitialState(T0)
  for (const id of ITEM_IDS) if (ITEMS[id].category === 'land') s.owned[id] = 1
  return visibleIsles(s)
}

/** Where a world point lands in the view (-1 to 1 across and up) with the camera at `distance`, as World.tsx places it. */
function onScreen([x, y, z]: readonly [number, number, number], distance: number, aspect: number) {
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.5, 600)
  const target = new THREE.Vector3(...VIEW.target)
  camera.position.copy(target).addScaledVector(new THREE.Vector3(...VIEW.dir).normalize(), distance)
  camera.lookAt(target)
  camera.updateMatrixWorld()
  const p = new THREE.Vector3(x, y, z).project(camera)
  return { x: p.x, y: p.y }
}
const inView = (p: { x: number; y: number }) => Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1
const farmInView = (d: number, aspect: number) => PIECES.main.outline.every(([x, z]) => inView(onScreen([x, 0, z], d, aspect)))
/** Every piece's rim, docked, is in view at `d`. */
const rimsInView = (ids: readonly ('main' | DockId)[], d: number, aspect: number, label = '') => {
  for (const id of ids) {
    const [px, py, pz] = PIECES[id].dockedPosition
    for (const [x, z] of PIECES[id].outline) expect(inView(onScreen([px + x, py, pz + z], d, aspect)), `${id} ${label}`).toBe(true)
  }
}

describe('camera framing', () => {
  it('frames the main island alone exactly as before', () => {
    for (const aspect of [1.6, 1.0, 0.46]) {
      const before = Math.min(130, Math.max(30, (27 / (2 * tan * aspect)) * 0.95, 19 / (2 * tan)))
      expect(frameDistance([], aspect)).toBeCloseTo(before)
    }
  })

  it('on a wide screen frames the farm and the middle of every docked piece; pulls back, never in, as more dock, and stops at the limit', () => {
    for (const docked of [['meadow'], ALPHA, DOCK_IDS] as DockId[][]) {
      const d = frameDistance(docked.map(pieceFrame), 1.6)
      expect(d).toBeLessThan(70)
      for (const id of docked) expect(inView(onScreen(PIECES[id].dockedPosition, d, 1.6)), id).toBe(true)
    }
    for (const aspect of [1.6, 1.0, 0.46]) {
      let last = frameDistance([], aspect)
      for (let n = 1; n <= DOCK_IDS.length; n++) {
        const d = frameDistance(DOCK_IDS.slice(0, n).map(pieceFrame), aspect)
        expect(d).toBeGreaterThanOrEqual(last)
        expect(d).toBeLessThanOrEqual(130)
        last = d
      }
    }
  })

  it('on a phone held upright, frames the farm with docked pieces running off the sides, and can zoom out to all of it', () => {
    const framed = frameDistance(ALPHA.map(pieceFrame), PHONE)
    expect(framed).toBe(130)
    expect(farmInView(framed, PHONE)).toBe(true)
    for (const id of ['grove', 'islet'] as const) {
      const outline = PIECES[id].outline.map(([x, z]) => onScreen([PIECES[id].dockedPosition[0] + x, 0, PIECES[id].dockedPosition[2] + z], framed, PHONE))
      expect(outline.some(inView), id).toBe(true)
      expect(outline.every(inView), id).toBe(false)
    }
    const furthest = overviewDistance(ALPHA, PHONE)
    expect(furthest).toBeGreaterThan(130)
    expect(furthest).toBeLessThan(400)
    rimsInView(['main', ...ALPHA], furthest, PHONE)
  })

  it('by default frames the farm on a wide screen whatever has docked, with docked pieces round the edges; on a phone the farm and every docked middle', () => {
    const farm = frameDistance([], 1.6)
    expect(farm).toBeGreaterThan(32) // MAIN is about 27 u across: about 32-36 u back at 1440 x 900
    expect(farm).toBeLessThan(36)
    for (const docked of [[], ['meadow'], ALPHA, DOCK_IDS] as DockId[][]) expect(defaultFrame(docked, 1.6)).toBe(farm)
    expect(defaultFrame(ALPHA, 1.0)).toBe(frameDistance([], 1.0))
    expect(farmInView(farm, 1.6)).toBe(true)
    expect(ALPHA.filter((id) => inView(onScreen(PIECES[id].dockedPosition, farm, 1.6))).length).toBeLessThan(ALPHA.length)
    for (const docked of [[], ['meadow'], ALPHA] as DockId[][]) expect(defaultFrame(docked, PHONE)).toBe(frameDistance(docked.map(pieceFrame), PHONE))
  })

  it('eases out to show a piece rising, framing its middle with the farm, and back once it has docked', () => {
    // The glade's and the orchard's middles are in view already as they rise; the others need the camera further out.
    expect(DOCK_IDS.filter((id) => riseFrame([], [id], 1.6) > defaultFrame([], 1.6))).toEqual(['meadow', 'wetland', 'highland', 'grove', 'islet'])
    for (const id of DOCK_IDS) {
      const rising = riseFrame([], [id], 1.6)
      expect(rising, id).toBeGreaterThanOrEqual(defaultFrame([], 1.6))
      expect(inView(onScreen(PIECES[id].dockedPosition, rising, 1.6)), id).toBe(true)
      expect(farmInView(rising, 1.6), id).toBe(true)
    }
    // Pieces already docked don't widen it; upright, it frames them as the default does.
    expect(riseFrame(['meadow', 'islet'], ['grove'], 1.6)).toBe(riseFrame([], ['grove'], 1.6))
    expect(riseFrame(['meadow'], ['grove'], PHONE)).toBe(frameDistance(['meadow', 'grove'].map((p) => pieceFrame(p as DockId)), PHONE))
  })

  it('knows which pieces are in the world, leaving out those of switched-off features', () => {
    const s = createInitialState(T0)
    expect(visibleIsles(s)).toEqual([])
    s.owned.meadow = 1
    s.owned.wetland = 1
    s.xp = 2550
    s.repos = [REPO]
    expect(withFeatures({ wildIsles: true, gitEvents: true, cottage: true }, () => visibleIsles(s))).toEqual(['meadow', 'wetland', 'orchard', 'cottage'])
    s.owned.highland = 1
    expect(visibleIsles(s)).toEqual(['meadow', 'wetland', 'highland'])
    expect(withFeatures(ALL_OFF, () => visibleIsles(s))).toEqual(['meadow'])
    expect(withFeatures({ ...ALL_OFF, biomes: true }, () => visibleIsles(s))).toEqual(['meadow'])
    expect(withFeatures({ ...ALL_OFF, cottage: true }, () => visibleIsles(s))).toEqual(['meadow', 'cottage'])
  })

  it('puts the glade and the orchard in the world once their land is bought, and with their own features, land or no land', () => {
    const s = createInitialState(T0)
    s.owned.cottageLand = 1
    expect(visibleIsles(s)).toEqual(['cottage'])
    s.owned.orchardLand = 1
    expect(visibleIsles(s)).toEqual(['orchard', 'cottage'])
    expect(withFeatures({ ringIsles: false }, () => visibleIsles(s))).toEqual([])
    const t = createInitialState(T0)
    t.xp = 2550
    t.repos = [REPO]
    expect(visibleIsles(t)).toEqual([])
    expect(withFeatures({ ringIsles: false, gitEvents: true, cottage: true }, () => visibleIsles(t))).toEqual(['orchard', 'cottage'])
    expect(withFeatures({ gitEvents: true, cottage: true }, () => visibleIsles(t))).toEqual(['orchard', 'cottage'])
    expect(withFeatures({ gitEvents: true, cottage: true }, () => visibleIsles(s))).toEqual(['orchard', 'cottage'])
  })

  it('with the island closed all the way round, frames the farm as before and zooms out to all of it', () => {
    const closed = closedIsland()
    expect([...closed].sort()).toEqual([...DOCK_IDS].sort())
    expect(defaultFrame(closed, 1.6)).toBeCloseTo(35.5, 1)
    expect(defaultFrame(closed, 1.6)).toBe(frameDistance([], 1.6))
    expect(defaultFrame(closed, PHONE)).toBe(130)
    expect(farmInView(130, PHONE)).toBe(true)
    for (const aspect of [1.6, 1.0, PHONE]) {
      const furthest = overviewDistance(closed, aspect)
      expect(furthest, `${aspect}`).toBeLessThan(400)
      rimsInView(['main', ...closed], furthest, aspect, `at ${aspect}`)
    }
  })
})

describe('docking', () => {
  const mainRim = polygonOutline(PIECES.main.outline)

  it('puts each piece against the farm’s rim along its stretch, with no gap', () => {
    for (const id of DOCK_IDS) {
      const [px, , pz] = PIECES[id].dockedPosition
      const rim = polygonOutline(PIECES[id].outline)
      const [from, to] = mainThetaRange(id)
      const span = (((to - from) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      for (let k = 1; k < 10; k++) {
        const theta = from + (span * k) / 10
        // The farm's rim there, seen from the piece's own middle, is on the piece's rim.
        const [x, z] = [Math.cos(theta) * mainRim(theta) - px, Math.sin(theta) * mainRim(theta) - pz]
        expect(Math.abs(rim(Math.atan2(z, x)) - Math.hypot(x, z)), `${id} at θ ${theta.toFixed(2)}`).toBeLessThan(0.05)
      }
    }
  })

  it('keeps every piece’s middle off the farm and off the other pieces', () => {
    for (const id of DOCK_IDS) {
      const [px, , pz] = PIECES[id].dockedPosition
      expect(Math.hypot(px, pz) - mainRim(Math.atan2(pz, px)), id).toBeGreaterThan(3)
      for (const other of DOCK_IDS.filter((o) => o !== id)) {
        const [ox, , oz] = PIECES[other].dockedPosition
        const rim = polygonOutline(PIECES[other].outline)
        expect(Math.hypot(px - ox, pz - oz) - rim(Math.atan2(pz - oz, px - ox)), `${id} in ${other}`).toBeGreaterThan(1)
      }
    }
  })
})

describe('layout slots', () => {
  it('has a slot for every flower bed, fruit tree, lantern and beehive the shop allows', () => {
    expect(FLOWERBEDS.length).toBeGreaterThanOrEqual(ITEMS.flowerbed.max)
    expect(FRUIT_TREES.length).toBeGreaterThanOrEqual(ITEMS.fruitTree.max)
    expect(LANTERNS.length).toBeGreaterThanOrEqual(ITEMS.lantern.max)
    expect(BEEHIVES.length).toBeGreaterThanOrEqual(ITEMS.beehive.max)
  })

  it('keeps slots off the buildings, pond and garden, apart from each other, and well inside the farm’s rim', () => {
    const all = [...FLOWERBEDS, ...FRUIT_TREES, ...LANTERNS, ...BEEHIVES]
    for (const [x, z] of all) expect(isClear(x, z), `${x}, ${z}`).toBe(true)
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i][0] - all[j][0], all[i][1] - all[j][1])).toBeGreaterThan(0.6)
    }
    for (const [x, z] of [...all, WELL, SCARECROW, [BENCH.x, BENCH.z]] as XZ[]) expect(insideRim(x, z), `${x}, ${z}`).toBeGreaterThan(RIM_BAND)
    for (const t of STATIC_TREES) expect(insideRim(...t.at), `${t.at}`).toBeGreaterThan(0.3)
  })

  it('clears the scatter by the rim where a piece docks alongside, and only there', () => {
    expect(byDockedRim([7.4, 1.8], [])).toBe(false)
    expect(byDockedRim([7.4, 1.8], ['meadow'])).toBe(true)
    expect(byDockedRim([7.4, 1.8], ['grove'])).toBe(false)
    expect(byDockedRim([-3.5, -4.2], DOCK_IDS)).toBe(false)
    expect(BUSHES.filter((b) => byDockedRim(b, ALPHA))).toEqual([[6.6, 4.0], [4.1, 6.4], [7.4, 1.8]])
  })

  it('with the island closed all the way round, has a piece alongside the whole rim, and clears all the scatter by it', () => {
    const closed = closedIsland()
    for (let k = 0; k < 720; k++) expect(dockedAt((k / 720) * Math.PI * 2, closed), `θ ${k / 2}°`).not.toBeNull()
    const scatter: XZ[] = [...STATIC_TREES.map((t) => t.at), ...BUSHES, ...ROCKS.map((r) => r.at)]
    for (const p of scatter) expect(byDockedRim(p, closed), `${p}`).toBe(insideRim(...p) < RIM_BAND)
    expect(scatter.filter((p) => byDockedRim(p, closed)).length).toBeGreaterThan(0)
    expect(dockedAt(STREAM_THETA, closed)).toBe('wetland') // the farm's stream leaves the rim where the wetland docks
  })
})
