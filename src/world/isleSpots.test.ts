import { describe, expect, it } from 'vitest'
import composition from '../../art/config/composition.pieces.json?raw'
import { GLADE_HIVES } from '../game/config'
import { PIECES, piecesInPlay, zone, type DockId, type FlatZone } from './blueprint'
import { GLADE, GROVE, HIGHLAND, ISLE_VISITORS, ISLET, JETTY_DECK, MEADOW, ORCHARD, OUTCROP_SIZE, SIOFRA_SPOT, WETLAND, byOutcrop, fromRiver, grazingGround, inPolygon, inWater } from './isleSpots'
import { polygonOutline, sampleGrid, type HeightGrid } from './pieces'
import { bakedGrid } from './testing'

// Things on the unlock pieces stand on their tops, clear of the rim, of the seam with the farm and of the spots
// kept for buildings, on the baked pieces' ground as the game draws it.

type XZ = [number, number]
type Spot = [DockId, string, XZ]

const mainRim = polygonOutline(PIECES.main.outline)

/** How far inside its piece's rim a local spot is. */
const inside = (id: DockId, [x, z]: XZ) => polygonOutline(PIECES[id].outline)(Math.atan2(z, x)) - Math.hypot(x, z)

/** How far from the farm's rim a local spot is, in the world. */
function fromFarm(id: DockId, [x, z]: XZ): number {
  const [px, , pz] = PIECES[id].dockedPosition
  return Math.hypot(px + x, pz + z) - mainRim(Math.atan2(pz + z, px + x))
}

const buildings = (id: DockId) => PIECES[id].flatZones.filter((z) => z.kind === 'building' || z.kind === 'restoration')
const inZone = ([x, z]: XZ, zone: FlatZone) => Math.hypot(x - zone.at[0], z - zone.at[1]) < zone.r
const dist = (a: XZ, b: XZ) => Math.hypot(a[0] - b[0], a[1] - b[1])
const spots = (id: DockId, what: string, ps: XZ[]): Spot[] => ps.map((p, i) => [id, `${what} ${i}`, p])
type Ribbons = { id: string; pts: XZ[]; width: number }[]
const piecePaths = (id: 'meadow' | 'cottage') => (JSON.parse(composition) as { pieces: Record<string, { paths: Ribbons }> }).pieces[id].paths
/** How far from a ribbon's edge, measured as a river's is. */
const fromRibbon = (p: XZ, run: Ribbons[number]) => fromRiver(p, run.pts.map((at) => ({ at, level: 0, width: run.width })))

const SCATTER: Spot[] = [
  ...spots('meadow', 'bush', MEADOW.bushes),
  ['meadow', 'tree', MEADOW.tree],
  ['meadow', 'rock', MEADOW.rock],
  ['grove', 'log', GROVE.log],
  ['grove', 'rock', GROVE.rock],
  ...spots('islet', 'rock', ISLET.rocks.map((r) => r.at)),
  ['islet', 'bush', ISLET.bush],
  ...spots('wetland', 'rock', WETLAND.rocks.map((r) => r.at)),
  ...spots('wetland', 'bush', WETLAND.bushes),
  ...spots('highland', 'rock', HIGHLAND.rocks.map((r) => r.at)),
  ...spots('cottage', 'beehive', GLADE.hives),
]
const GROVE_TREES = spots('grove', 'tree', GROVE.trees.map((t) => t.p))
const VISITORS = Object.entries(ISLE_VISITORS).map(([id, s]) => [s.isle, id, s.at] as Spot)

describe('things on the docked pieces', () => {
  it('stand well inside their piece, away from the farm’s rim, off the spots kept for buildings', () => {
    for (const [id, what, p] of [...SCATTER, ...GROVE_TREES]) {
      expect(inside(id, p), `${id} ${what}`).toBeGreaterThan(0.6)
      expect(fromFarm(id, p), `${id} ${what}`).toBeGreaterThan(1.4)
      for (const zone of buildings(id)) expect(inZone(p, zone), `${id} ${what} in ${zone.id}`).toBe(false)
    }
  })

  it('give the grove at least 15 trees, none on another', () => {
    expect(GROVE.trees.length).toBeGreaterThanOrEqual(15)
    for (const [i, a] of GROVE.trees.entries()) for (const b of GROVE.trees.slice(i + 1)) expect(dist(a.p, b.p)).toBeGreaterThanOrEqual(0.85)
  })

  it('keep the meadow’s shelter, haystacks and tree out of one another’s way and the flock’s pasture, which is all on the meadow', () => {
    const things = [
      { what: 'shelter', at: MEADOW.shelter, r: zone('meadow', 'shelter').r },
      { what: 'haystack a', at: MEADOW.haystacks[0], r: zone('meadow', 'haystack_a').r },
      { what: 'haystack b', at: MEADOW.haystacks[1], r: zone('meadow', 'haystack_b').r },
      { what: 'tree', at: MEADOW.tree, r: 0.4 }, // the tree shading the shelter: its trunk, not its crown
    ]
    for (const [i, a] of things.entries()) {
      for (const b of things.slice(i + 1)) expect(dist(a.at, b.at), `${a.what} and ${b.what}`).toBeGreaterThanOrEqual(a.r + b.r)
      expect(dist(a.at, MEADOW.pasture.at), `${a.what} and the pasture`).toBeGreaterThanOrEqual(MEADOW.pasture.r + a.r)
    }
    expect(inside('meadow', MEADOW.pasture.at)).toBeGreaterThan(MEADOW.pasture.r * 0.8)
  })

  it('plant the orchard’s eight fruit trees in rows on its clearing, apart, and well inside the piece', () => {
    expect(ORCHARD.rows).toHaveLength(8)
    for (const [i, p] of ORCHARD.rows.entries()) {
      expect(dist(p, ORCHARD.clearing.at), `fruit tree ${i}`).toBeLessThan(ORCHARD.clearing.r + 0.3)
      expect(inside('orchard', p), `fruit tree ${i}`).toBeGreaterThan(2)
      expect(fromFarm('orchard', p), `fruit tree ${i}`).toBeGreaterThan(1.4)
      for (const q of ORCHARD.rows.slice(i + 1)) expect(dist(p, q), `fruit tree ${i}`).toBeGreaterThan(0.9)
    }
  })

  it('make room in the glade for its beehives, apart, and clear of its paths and of the art’s trees and shrubs', () => {
    const plants = (JSON.parse(composition) as { pieces: { cottage: Record<'trees' | 'shrubs', { x: number; z: number }[]> } }).pieces.cottage
    expect(GLADE.hives).toHaveLength(GLADE_HIVES)
    for (const [i, p] of GLADE.hives.entries()) {
      for (const q of GLADE.hives.slice(i + 1)) expect(dist(p, q), `beehive ${i}`).toBeGreaterThan(0.8)
      for (const run of piecePaths('cottage')) expect(fromRibbon(p, run), `beehive ${i} and ${run.id}`).toBeGreaterThan(0.5)
      for (const t of [...plants.trees, ...plants.shrubs]) expect(dist(p, [t.x, t.z]), `beehive ${i} and the art’s plant at ${t.x}, ${t.z}`).toBeGreaterThan(0.9)
    }
  })

  it('keep the lighthouse clear of the keeper’s cottage spot and of the rocks', () => {
    const light = zone('islet', 'lighthouse')
    expect(dist(ISLET.lighthouse, ISLET.cottage.at)).toBeGreaterThanOrEqual(light.r + ISLET.cottage.r)
    for (const rock of ISLET.rocks) expect(dist(ISLET.lighthouse, rock.at)).toBeGreaterThan(light.r)
  })

  it('stand Síofra at the meadow’s field edge, a step from the hare, clear of its scatter, its buildings’ spots and its paths', () => {
    const { isle, at, lift } = SIOFRA_SPOT
    expect([isle, lift, ISLE_VISITORS.hare.isle]).toEqual(['meadow', 0, 'meadow'])
    expect(dist(at, ISLE_VISITORS.hare.at)).toBeGreaterThan(1)
    expect(dist(at, ISLE_VISITORS.hare.at)).toBeLessThan(2)
    expect(fromFarm(isle, at)).toBeGreaterThan(1.4)
    for (const [id, what, p] of SCATTER) if (id === 'meadow') expect(dist(at, p), what).toBeGreaterThan(0.9)
    for (const z of buildings('meadow')) expect(dist(at, z.at), z.id).toBeGreaterThan(z.r + 0.55)
    expect(piecePaths('meadow').length).toBeGreaterThan(0)
    for (const run of piecePaths('meadow')) expect(fromRibbon(at, run), run.id).toBeGreaterThan(0.55)
  })
})

// The baked pieces are always in public/models: a missing one fails here (bakedGrid throws), never skips.
describe('things on the baked pieces', () => {
  const grids = new Map<DockId, HeightGrid>()
  const grid = (id: DockId) => grids.get(id) ?? grids.set(id, bakedGrid(id)).get(id)!
  /** The ground at a spot, and how far it rises or falls within `reach` of it. */
  const ground = (id: DockId, [x, z]: XZ, reach: number) => {
    const g = grid(id)
    const h = sampleGrid(g, x, z)
    let slope = 0
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      slope = Math.max(slope, Math.abs(sampleGrid(g, x + Math.cos(a) * reach, z + Math.sin(a) * reach) - h))
    }
    return { h, slope }
  }
  const expectLevelTop = (id: DockId, p: XZ, what: string, reach = 0.3) => {
    const { h, slope } = ground(id, p, reach)
    expect(Number.isNaN(h), what).toBe(false)
    expect(slope, what).toBeLessThan(0.12)
  }

  it('has every piece in play', () => {
    expect(piecesInPlay()).toEqual(['main', 'meadow', 'wetland', 'cottage', 'highland', 'orchard', 'grove', 'islet'])
    for (const id of piecesInPlay()) expect(() => bakedGrid(id), id).not.toThrow()
  })

  it('stand the scatter, buildings’ spots and trees on the top, on nearly level ground', () => {
    const all: Spot[] = [
      ...SCATTER,
      ...GROVE_TREES,
      ['meadow', 'shelter', MEADOW.shelter],
      ...spots('meadow', 'haystack', MEADOW.haystacks),
      ['grove', 'big tree', GROVE.bigTree],
      ['grove', 'mushrooms', GROVE.mushrooms],
      ['islet', 'lighthouse', ISLET.lighthouse],
      ...spots('orchard', 'fruit tree', ORCHARD.rows),
    ]
    for (const [id, what, p] of all) expectLevelTop(id, p, `${id} ${what}`)
  })

  it('stand the shelter, haystacks and lighthouse on level ground right across their spots', () => {
    for (const [id, z] of [['meadow', 'shelter'], ['meadow', 'haystack_a'], ['meadow', 'haystack_b'], ['islet', 'lighthouse']] as const) {
      const spot = zone(id, z)
      expect(ground(id, spot.at, spot.r * 0.9).slope, `${id} ${z}`).toBeLessThan(0.12)
    }
  })

  it('give the flock a pasture on the top and gently rolling, all the way to its edge', () => {
    const { at, r } = MEADOW.pasture
    for (const f of [0, 0.3, 0.6, 0.95]) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        expectLevelTop('meadow', [at[0] + Math.cos(a) * r * f, at[1] + Math.sin(a) * r * f], `pasture at ${f} of its radius, ${k}`)
      }
    }
  })

  it('wait for the visitors, and Síofra, on the top of their pieces, on level ground well inside the rim', () => {
    for (const [id, what, p] of [...VISITORS, [SIOFRA_SPOT.isle, 'Síofra', SIOFRA_SPOT.at] as Spot]) {
      expectLevelTop(id, p, `${what} on the ${id}`)
      expect(inside(id, p), `${what} on the ${id}`).toBeGreaterThan(0.5)
    }
  })
})

// The wild isles' water and dressing, against their baked ground (nothing here snapshots a height).
describe('the wetland', () => {
  const g = bakedGrid('wetland')
  const h = (p: XZ) => sampleGrid(g, p[0], p[1])
  const { lake, river, outflow, fall } = WETLAND

  it('keeps its scatter out of the water', () => {
    for (const [id, what, p] of SCATTER) if (id === 'wetland') expect(inWater('wetland', p, 0.3), what).toBe(false)
  })

  it('takes the farm’s stream on from its rim exit down to the lake, and drains it over the far rim', () => {
    expect(fromFarm('wetland', river[0].at)).toBeLessThan(0.1)
    expect(inPolygon(river[river.length - 1].at, lake.outline)).toBe(true)
    for (let i = 1; i < river.length; i++) expect(river[i].level).toBeLessThanOrEqual(river[i - 1].level)
    for (const p of river) expect(p.level, `river at ${p.at}`).toBeGreaterThan(h(p.at) - 0.02)
    // The outflow leaves the lake for the rim's lip, where the waterfall drops into the clouds.
    expect(inPolygon(outflow[0].at, lake.outline)).toBe(true)
    const lip = outflow[outflow.length - 1]
    expect(inside('wetland', lip.at)).toBeLessThan(0.3)
    expect([fall[0][0], fall[0][2]]).toEqual(lip.at)
    expect(fall[fall.length - 1][1]).toBeLessThan(-10)
    for (const p of outflow.slice(0, -1)) expect(p.level, `outflow at ${p.at}`).toBeGreaterThan(h(p.at) - 0.02)
  })

  it('has a lake whose water covers its basin', () => {
    let wet = 0
    let all = 0
    for (let x = -1; x < 12; x += 0.25) {
      for (let z = 1; z < 11; z += 0.25) {
        if (!inPolygon([x, z], lake.outline)) continue
        all++
        if (h([x, z]) < lake.level) wet++
      }
    }
    expect(wet / all).toBeGreaterThan(0.85)
  })

  it('floats its lily pads on open water, and stands its reeds in the shallows and round the shore', () => {
    for (const p of WETLAND.pads) {
      expect(inPolygon(p, lake.outline), `pad at ${p}`).toBe(true)
      expect(h(p), `pad at ${p}`).toBeLessThan(lake.level - 0.05)
    }
    expect(WETLAND.reeds.length).toBeGreaterThan(40)
    const beds = [zone('wetland', 'reed_bed_a'), zone('wetland', 'reed_bed_b')]
    for (const reed of WETLAND.reeds) {
      expect(Number.isNaN(h(reed.at)), `reed at ${reed.at}`).toBe(false)
      expect(beds.some((b) => inZone(reed.at, b)) || inWater('wetland', reed.at, 0.8), `reed at ${reed.at}`).toBe(true)
      expect(inZone(reed.at, WETLAND.hide), `reed at ${reed.at}`).toBe(false)
      expect(h(reed.at) + reed.height, `reed at ${reed.at}`).toBeGreaterThan(lake.level + 0.35) // tall enough to stand out of the water
    }
  })

  it('lays the cranberry bed on level ground, clear of the water and the hide', () => {
    const { at, rot, half } = WETLAND.cranberryBed
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([i, j]) => {
      const [dx, dz] = [i * half[0], j * half[1]]
      return [at[0] + dx * Math.cos(rot) + dz * Math.sin(rot), at[1] - dx * Math.sin(rot) + dz * Math.cos(rot)] as XZ
    })
    const heights = corners.map(h)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.08)
    for (const c of corners) {
      expect(inside('wetland', c)).toBeGreaterThan(0.8)
      expect(inWater('wetland', c, 0.5)).toBe(false)
      expect(dist(c, WETLAND.hide.at)).toBeGreaterThan(WETLAND.hide.r)
    }
  })

  it('moors the jetty at its coast anchor, its deck and shed patch clear of the reeds, lily pads, rocks, bushes and cranberry bed', () => {
    const { jetty } = WETLAND
    const anchor = PIECES.wetland.anchors.find((a) => a.id === 'wetland_jetty')!
    expect([jetty.at, jetty.y, jetty.shedPatch]).toEqual([anchor.at, anchor.y, anchor.shedPatch])
    // Turned so its +Z runs along the anchor's outward line, out over the lake.
    expect(Math.sin(jetty.turn)).toBeCloseTo(anchor.outward![0], 3)
    expect(Math.cos(jetty.turn)).toBeCloseTo(anchor.outward![1], 3)
    expect(jetty.shedPatch.at).toEqual([7.8081, 2.4255])
    expect(jetty.shedPatch.r).toBeGreaterThanOrEqual(0.6)
    /** Whether a thing `r` round reaches onto the deck, in the jetty's own frame. */
    const onDeck = ([x, z]: XZ, r: number) => {
      const [dx, dz] = [x - jetty.at[0], z - jetty.at[1]]
      const across = dx * Math.cos(jetty.turn) - dz * Math.sin(jetty.turn)
      const along = dx * Math.sin(jetty.turn) + dz * Math.cos(jetty.turn)
      return Math.abs(across) < JETTY_DECK.half[0] + r && Math.abs(along) < JETTY_DECK.half[1] + r
    }
    const things: [string, XZ, number][] = [
      ...WETLAND.reeds.map((reed, i) => [`reed ${i}`, reed.at, 0.05] as [string, XZ, number]),
      ...WETLAND.pads.map((p, i) => [`lily pad ${i}`, p, 0.25] as [string, XZ, number]),
      ...WETLAND.rocks.map((rock, i) => [`rock ${i}`, rock.at, rock.s[0] * 0.95] as [string, XZ, number]),
      ...WETLAND.bushes.map((p, i) => [`bush ${i}`, p, 0.4] as [string, XZ, number]),
      ['the cranberry bed', WETLAND.cranberryBed.at, Math.hypot(...WETLAND.cranberryBed.half) + 0.15],
    ]
    for (const [what, p, r] of things) {
      expect(onDeck(p, r), `${what} on the jetty`).toBe(false)
      expect(dist(p, jetty.shedPatch.at), `${what} on the shed patch`).toBeGreaterThan(jetty.shedPatch.r + r)
    }
  })

  it('knows a river by its width', () => {
    expect(fromRiver(river[3].at, river)).toBeLessThan(0)
    expect(fromRiver([river[3].at[0] + 3, river[3].at[1]], river)).toBeGreaterThan(2)
  })
})

describe('the highland', () => {
  const g = bakedGrid('highland')
  const h = (x: number, z: number) => sampleGrid(g, x, z)
  const { tarn, kept, outcrops, goats } = HIGHLAND

  it('keeps its rocks and heather off the tarn and the kept spots', () => {
    for (const [id, what, p] of SCATTER) if (id === 'highland') expect(inWater('highland', p, 0.3), what).toBe(false)
    for (const p of HIGHLAND.heather) {
      expect(inside('highland', p)).toBeGreaterThan(1)
      expect(inWater('highland', p)).toBe(false)
    }
    expect(inPolygon(tarn.centre, tarn.outline)).toBe(true)
    expect(h(...tarn.centre)).toBeLessThan(tarn.level)
  })

  it('stands its outcrops on the piece against a riser, settled to the lowest ground under them, never buried', () => {
    for (const o of outcrops) {
      const { half, height } = OUTCROP_SIZE[o.model]
      const r = Math.max(...half) * o.scale
      const what = `${o.model} at ${o.at}`
      expect(inside('highland', o.at), what).toBeGreaterThan(r + 0.3)
      expect(fromFarm('highland', o.at), what).toBeGreaterThan(1.4)
      for (const k of kept) expect(dist(o.at, k.at), `${what} by ${k.id}`).toBeGreaterThan(k.r + r)
      expect(inWater('highland', o.at, r)).toBe(false)
      let lo = Infinity
      let hi = -Infinity
      for (const f of [0, 0.5, 1]) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2
          const y = h(o.at[0] + Math.cos(a) * r * f, o.at[1] + Math.sin(a) * r * f)
          expect(Number.isNaN(y), what).toBe(false)
          lo = Math.min(lo, y)
          hi = Math.max(hi, y)
        }
      }
      // Its back against the riser: the ground under it climbs, but it still stands well clear of the top.
      expect(hi - lo, what).toBeGreaterThan(0.3)
      expect(lo + height * o.scale - hi, what).toBeGreaterThan(0.4)
    }
  })

  it('gives the goats room to graze on level ground, clear of the outcrops, away from the risers', () => {
    const grazing = grazingGround(h, goats)
    expect(grazing(...goats.at)).toBe(true)
    let good = 0
    let all = 0
    for (let x = goats.at[0] - goats.r; x <= goats.at[0] + goats.r; x += 0.1) {
      for (let z = goats.at[1] - goats.r; z <= goats.at[1] + goats.r; z += 0.1) {
        if (dist([x, z], goats.at) > goats.r) continue
        all++
        if (!grazing(x, z)) continue
        good++
        expect(byOutcrop([x, z]), `${x}, ${z}`).toBe(false)
        expect(Math.abs(h(x, z) - h(...goats.at)), `${x}, ${z}`).toBeLessThan(0.4)
      }
    }
    expect(good * 0.01).toBeGreaterThan(3) // at least a few square units of grass
    expect(good / all).toBeGreaterThan(0.4)
    expect(dist(goats.at, zone('highland', 'goats').at)).toBeLessThan(zone('highland', 'goats').r + goats.r)
  })
})
