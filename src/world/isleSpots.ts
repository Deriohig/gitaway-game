import type { VisitorId } from '../game/content/visitors'
import { anchor, PIECES, zone, type DockId, type FlatZone } from './blueprint'
import type { Footprint } from './composition'
import { aside } from './layout'
import { polygonOutline } from './pieces'
import { rng } from './random'

// Where things stand on the unlock pieces, in each piece's own coordinates.
// Buildings, animals and named spots come from the blueprint's flat zones and
// coast anchors (art/config/blueprint.pieces.json); the scatter around them
// (bushes, trees, rocks) is placed here, clear of those zones, of the rim and
// of the seam with the farm. isleSpots.test.ts checks every spot.

type XZ = [number, number]

const at = (z: FlatZone): XZ => z.at

/** The open meadow on the near side: a flock grazing, a field shelter, haystacks and a drift of wildflowers. */
export const MEADOW = {
  shelter: at(zone('meadow', 'shelter')),
  haystacks: [at(zone('meadow', 'haystack_a')), at(zone('meadow', 'haystack_b'))],
  pasture: zone('meadow', 'pasture'),
  wildflowers: zone('meadow', 'wildflowers'),
  /** Flowering bushes around the wildflower drift. */
  bushes: [[4.6, 2.4], [1.2, 5.3], [-2.2, 4.4], [3.4, 0.2]] as XZ[],
  /** A tree shading the shelter. */
  tree: [-6.8, 1.2] as XZ,
  /** A rock in the wildflowers; the hare waits in the long grass below it. */
  rock: [3.2, 3.4] as XZ,
}

/**
 * Where Síofra stands as herself once she's met (features/Siofra.tsx), in the
 * meadow's own coordinates: at the field edge, in the long grass about 1.3 u
 * from where the hare waits (ISLE_VISITORS), on level ground well inside the
 * rim, clear of the paths and of the art's trees, shrubs and flowers. Her
 * tap target keeps off the hare's (placement.test.ts), and the composition's
 * grass makes way for her (KEPT_CLEAR). Not a visitor's spot: she's never
 * there while the hare is.
 */
export const SIOFRA_SPOT: IsleVisitorSpot = { isle: 'meadow', at: [1.5, 3.8], lift: 0 }

const GROVE_SPOTS = {
  clearing: zone('grove', 'core'),
  mushrooms: at(zone('grove', 'mushroom_ring')),
  /** The big tree at the clearing's edge (its treehouse comes later). */
  bigTree: at(zone('grove', 'treehouse')),
  /** Kept clear for the woodcutter's hut. */
  hut: zone('grove', 'woodcutters_hut'),
  log: [-0.4, -1.6] as XZ,
  /** How the log lies (rotation.y): it runs along its own x. */
  logTurn: 0.5,
  rock: [-1.0, 1.9] as XZ,
}

/** One of the grove's trees: where, how big, and whether a pine or a round tree. */
export interface GroveTree {
  p: XZ
  s: number
  pine: boolean
}

/** Trees in a few clumps round the grove's clearing, clear of its rim, the farm's rim and the spots kept for other things. */
function groveTrees(): GroveTree[] {
  const piece = PIECES.grove
  const rim = polygonOutline(piece.outline)
  const mainRim = polygonOutline(PIECES.main.outline)
  const [px, , pz] = piece.dockedPosition
  const g = GROVE_SPOTS
  const kept = [
    { at: g.clearing.at, r: g.clearing.r + 0.4 },
    { at: g.hut.at, r: g.hut.r + 0.3 },
    { at: g.mushrooms, r: 0.8 },
    { at: g.bigTree, r: 1.1 },
    { at: g.log, r: 0.8 },
    { at: g.rock, r: 0.5 },
  ]
  const free = ([x, z]: XZ) =>
    rim(Math.atan2(z, x)) - Math.hypot(x, z) > 0.8 &&
    Math.hypot(px + x, pz + z) - mainRim(Math.atan2(pz + z, px + x)) > 1.4 &&
    kept.every((k) => Math.hypot(x - k.at[0], z - k.at[1]) > k.r)
  const r = rng(91)
  const list: GroveTree[] = []
  for (let clump = 0, tries = 0; clump < 5 && tries < 400; tries++) {
    const a = r() * Math.PI * 2
    const d = (0.35 + r() * 0.55) * rim(a)
    const centre: XZ = [Math.cos(a) * d, Math.sin(a) * d]
    if (!free(centre)) continue
    clump++
    for (let i = 0, placed = 0; placed < 5 && i < 60; i++) {
      const b = r() * Math.PI * 2
      const e = Math.sqrt(r()) * 1.7
      const p: XZ = [centre[0] + Math.cos(b) * e, centre[1] + Math.sin(b) * e]
      if (!free(p) || list.some((t) => Math.hypot(t.p[0] - p[0], t.p[1] - p[1]) < 0.85)) continue
      list.push({ p, s: 0.8 + r() * 0.6, pine: r() > 0.4 })
      placed++
    }
  }
  return list
}

/** The grove to the right: tree clumps round a clearing, a fallen log and a ring of mushrooms. */
export const GROVE = {
  ...GROVE_SPOTS,
  /** The clumps of trees, besides the big tree. */
  trees: groveTrees(),
}

/** The rocky islet out on the right: the lighthouse on its headland, rocks along the coast. */
export const ISLET = {
  lighthouse: at(zone('islet', 'lighthouse')),
  /** The headland's tip, by the signal fire's spot. */
  point: anchor('islet', 'signal_fire').at,
  fishing: anchor('islet', 'cloud_fishing').at,
  mooring: anchor('islet', 'harbour_mooring').at,
  /** Kept clear for the keeper's cottage. */
  cottage: zone('islet', 'keepers_cottage'),
  /** Rocks along the coast: on the headland, by the fishing spot, by the mooring. */
  rocks: [
    { at: [9.0, -1.2] as XZ, s: [0.45, 0.35, 0.4] as [number, number, number] },
    { at: [5.4, -3.85] as XZ, s: [0.3, 0.22, 0.3] as [number, number, number] },
    { at: [6.0, 2.35] as XZ, s: [0.34, 0.24, 0.3] as [number, number, number] },
  ],
  /** Off the art's ribbon to the lighthouse while it is drawn (see layout.ts `aside`). */
  bush: aside<XZ>([1.9, -0.6], [1.9, -1.4]),
}

// ---------------------------------------------------------------------------
// The wild isles' water, from the blueprint (which gives it in the world's x, z and y).

/** A lake or tarn, in its piece's own coordinates: its shore, its water's height, and its middle and rough radius. */
export interface Pool {
  outline: XZ[]
  level: number
  centre: XZ
  radius: number
}

/** A point along a river: where it runs, its water's height and its width, in its piece's own coordinates. */
export interface WaterPoint {
  at: XZ
  level: number
  width: number
}

type BlueprintWater = Record<string, { outline?: XZ[]; level?: number; points?: ({ x: number; z: number; level: number; width: number } | [number, number, number])[] }>

const waterOf = (id: DockId) => (PIECES[id].water ?? {}) as BlueprintWater

function pool(id: DockId, key: string): Pool {
  const [px, py, pz] = PIECES[id].dockedPosition
  const w = waterOf(id)[key]
  const outline = w.outline!.map(([x, z]) => [x - px, z - pz] as XZ)
  const centre: XZ = [outline.reduce((s, p) => s + p[0], 0) / outline.length, outline.reduce((s, p) => s + p[1], 0) / outline.length]
  const radius = outline.reduce((s, p) => s + Math.hypot(p[0] - centre[0], p[1] - centre[1]), 0) / outline.length
  return { outline, level: w.level! - py, centre, radius }
}

function river(id: DockId, key: string): WaterPoint[] {
  const [px, py, pz] = PIECES[id].dockedPosition
  return waterOf(id)[key].points!.map((p) => {
    const { x, z, level, width } = p as { x: number; z: number; level: number; width: number }
    return { at: [x - px, z - pz] as XZ, level: level - py, width }
  })
}

/** Whether a point is inside a polygon. */
export function inPolygon([x, z]: XZ, polygon: readonly XZ[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]
    const [xj, zj] = polygon[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** How far a point is from a polygon's edge, in x, z: negative inside it. */
export function fromOutline([x, z]: XZ, outline: readonly XZ[]): number {
  let edge = Infinity
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i]
    const [bx, bz] = outline[(i + 1) % outline.length]
    const dx = bx - ax
    const dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
    edge = Math.min(edge, Math.hypot(x - (ax + dx * t), z - (az + dz * t)))
  }
  return inPolygon([x, z], outline) ? -edge : edge
}

/** How far a point is from a river's middle line (in x, z), less half its width there: negative in the water. */
export function fromRiver([x, z]: XZ, points: readonly WaterPoint[]): number {
  let best = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i].at
    const [bx, bz] = points[i + 1].at
    const dx = bx - ax
    const dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
    const half = (points[i].width + (points[i + 1].width - points[i].width) * t) / 2
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)) - half)
  }
  return best
}

const WETLAND_WATER = (() => {
  const rim = polygonOutline(PIECES.wetland.outline)
  const [px, py, pz] = PIECES.wetland.dockedPosition
  const fall = (waterOf('wetland').waterfall.points as [number, number, number][]).map(([x, y, z]) => [x - px, y - py, z - pz] as [number, number, number])
  // The outflow runs on to the lip of the wetland's outer rim, where the waterfall drops off it.
  const onTop = river('wetland', 'outflow').filter(({ at: [x, z] }) => rim(Math.atan2(z, x)) - Math.hypot(x, z) > 0.4)
  const lip = { at: [fall[0][0], fall[0][2]] as XZ, level: fall[0][1], width: onTop[onTop.length - 1].width }
  return { lake: pool('wetland', 'lake'), river: river('wetland', 'river'), outflow: [...onTop, lip], fall }
})()

/** Points spaced round a pool's shore, `inset` in from it towards its middle. */
function shore(p: Pool, fractions: number[], inset: number): XZ[] {
  return fractions.map((f) => {
    const [x, z] = p.outline[Math.floor(f * p.outline.length) % p.outline.length]
    const d = Math.hypot(x - p.centre[0], z - p.centre[1]) || 1
    return [x - ((x - p.centre[0]) / d) * inset, z - ((z - p.centre[1]) / d) * inset] as XZ
  })
}

/** One reed: where it stands, how tall it is, and whether it carries a bulrush head. */
export interface Reed {
  at: XZ
  height: number
  head: boolean
}

/** Reeds in clumps: `count` of them scattered within `r` of each clump's middle. */
function reedsIn(clumps: { at: XZ; r: number; count: number }[], seed: number): Reed[] {
  const r = rng(seed)
  return clumps.flatMap((c) =>
    Array.from({ length: c.count }, () => {
      const a = r() * Math.PI * 2
      const d = Math.sqrt(r()) * c.r
      return { at: [c.at[0] + Math.cos(a) * d, c.at[1] + Math.sin(a) * d] as XZ, height: 0.8 + r() * 0.45, head: r() > 0.55 }
    }),
  )
}

const REED_BEDS = [zone('wetland', 'reed_bed_a'), zone('wetland', 'reed_bed_b')]

/** The wetland jetty's deck (the wetland_jetty model): its half-width and half-length, along its own x and z. */
export const JETTY_DECK = { half: [0.37, 0.86] as XZ }

const JETTY_ANCHOR = anchor('wetland', 'wetland_jetty')

/**
 * The wetland, on the left: a reedy lake fed by the farm's stream, which
 * drains over the far rim as a waterfall. Reeds stand in its two reed beds
 * and here and there round the shore, lily pads float on the open water, and
 * a cranberry bed sits on the level ground to the west.
 */
export const WETLAND = {
  ...WETLAND_WATER,
  /** Kept clear for the heron hide. */
  hide: zone('wetland', 'heron_hide'),
  reeds: reedsIn(
    [
      ...REED_BEDS.map((z) => ({ at: z.at, r: z.r * 0.85, count: 16 })),
      ...shore(WETLAND_WATER.lake, [0.05, 0.3, 0.62, 0.84], 0.35).map((at) => ({ at, r: 0.45, count: 7 })),
    ],
    41,
  ),
  /** Lily pads on the open water, in twos and threes. */
  pads: [[3.1, 5.3], [3.55, 5.75], [2.95, 5.95], [4.7, 4.3], [5.15, 4.6], [8.6, 5.3], [8.2, 4.85], [4.7, 8.2]] as XZ[],
  /** The cranberry bed: its middle, how it's turned, and its half-width and half-depth. */
  cranberryBed: { at: [-1.4, 1.5] as XZ, rot: 0.5, half: [0.95, 0.6] as XZ },
  /** Rocks on the banks. */
  rocks: [
    { at: [0.1, 7.7] as XZ, s: [0.32, 0.22, 0.3] as [number, number, number] },
    { at: [10.5, 6.2] as XZ, s: [0.28, 0.2, 0.26] as [number, number, number] },
    { at: [8.6, 10.4] as XZ, s: [0.36, 0.26, 0.32] as [number, number, number] },
    { at: [6.6, 1.2] as XZ, s: [0.24, 0.17, 0.22] as [number, number, number] },
  ],
  /** Bushes on the level ground to the west. */
  bushes: [[-4.6, 3.4], [-2.9, -2.7], [-6.3, 0.4]] as XZ[],
  /**
   * The jetty, at its coast anchor on the lake's shore: its deck's
   * middle, the height of its waterline (the lake's level), and its turn
   * (rotation.y), which runs its far end (+Z) out over the lake with its
   * shore end on the bank. Beside it, the shed patch is kept clear for a
   * small shed later.
   */
  jetty: {
    at: JETTY_ANCHOR.at,
    y: JETTY_ANCHOR.y!,
    turn: Math.atan2(JETTY_ANCHOR.outward![0], JETTY_ANCHOR.outward![1]),
    shedPatch: JETTY_ANCHOR.shedPatch!,
  },
}

/** An outcrop model standing against one of the highland's risers: which, where, how it's turned and scaled. */
export interface Outcrop {
  model: 'outcrop_a' | 'outcrop_b'
  at: XZ
  rot: number
  scale: number
}

/** Each outcrop model's half-width and half-depth, and height, at scale 1 (public/models/manifest.json notes, and the models' bounds). */
export const OUTCROP_SIZE: Record<Outcrop['model'], { half: XZ; height: number }> = {
  outcrop_a: { half: [0.89, 0.89], height: 2.8 },
  outcrop_b: { half: [1.32, 1.79], height: 1.9 },
}

/**
 * The highland, behind the farm and 3 u above it: a heather moor on top, with
 * a tarn, rocks and the old stones' spots, stepping down in two risers to the
 * farm. Outcrops stand against the risers, and goats graze the terrace between
 * them.
 */
export const HIGHLAND = {
  tarn: pool('highland', 'tarn'),
  /** Kept clear for the cairn, the standing stones, the bothy and the ruins. */
  kept: PIECES.highland.flatZones.filter((z) => z.kind === 'building' || z.kind === 'restoration'),
  outcrops: [
    { model: 'outcrop_a', at: [-2.2, 7.2], rot: 0.4, scale: 1 },
    { model: 'outcrop_a', at: [2.4, 7.3], rot: 2.1, scale: 0.85 },
    { model: 'outcrop_a', at: [8.4, -4.6], rot: 4.0, scale: 0.9 },
    { model: 'outcrop_b', at: [11.9, -5.0], rot: 0, scale: 1.15 },
    { model: 'outcrop_a', at: [-6.0, 5.3], rot: 1.2, scale: 0.8 },
  ] as Outcrop[],
  /** Rocks about the moor. */
  rocks: [
    { at: [-4.2, -3.0] as XZ, s: [0.3, 0.22, 0.28] as [number, number, number] },
    { at: [2.9, -6.8] as XZ, s: [0.36, 0.26, 0.32] as [number, number, number] },
    { at: [-6.6, 1.6] as XZ, s: [0.28, 0.2, 0.26] as [number, number, number] },
    { at: [5.6, 1.8] as XZ, s: [0.25, 0.18, 0.24] as [number, number, number] },
    { at: [0.7, 5.2] as XZ, s: [0.2, 0.15, 0.2] as [number, number, number] },
  ],
  /** Where the heather grows in drifts. */
  heather: [[-3.4, 1.4], [1.8, 2.6], [5.4, -6.2], [3.6, -7.0], [3.6, -2.6], [-5.6, 3.0], [6.4, -1.2], [-2.0, -2.4]] as XZ[],
  /** Where the goats graze: the level part of the terrace by the blueprint's goat spot. */
  goats: { at: [4.75, 7.5] as XZ, r: 1.5 },
}

const DIAG = Math.SQRT1_2
/** A spot given as (across, towards the camera) as a piece's x, z: the camera looks along −x, −z. */
const facingCamera = ([across, toward]: XZ): XZ => [(across + toward) * DIAG, (toward - across) * DIAG]

/**
 * The orchard, behind the windmill: fruit trees in rows on its clearing, at
 * the spots the repo orchard (C1) gives its repositories' trees, in the order
 * it hands them out. The art's composition leaves them to the game. Two
 * staggered rows face the camera, so the back one shows between the front
 * one. The second spot sits at the back, not at the front left where the art
 * had it: there the paths from the farm and the highland come into the
 * clearing.
 */
export const ORCHARD = {
  clearing: zone('orchard', 'core'),
  rows: ([[0, 0.55], [-1.05, -1.6], [1.05, 0.45], [-0.55, -0.6], [0.55, -0.6], [-1.55, -0.75], [1.55, -0.75], [0, -1.55]] as XZ[]).map(facingCamera),
  /** How far round each trunk is the tree's own, as the farm's fruit trees keep it (layout.ts SLOT_DISCS). */
  treeClear: 0.55,
  /** How big the trees are drawn, as the farm's fruit trees are. */
  treeScale: 0.72,
}

/**
 * The woodland glade, the cottage's piece: in the wildflowers by the path in
 * from the farm, room for GLADE_HIVES more beehives once the farm's own are
 * all placed. Level ground, clear of the cottage's plot and garden, of the path
 * and of the art's trees and shrubs.
 */
export const GLADE = {
  hives: [[8.25, -1.75], [7.3, -1.65], [7.0, -2.4]] as XZ[],
}

/**
 * The ground of the things the game keeps on each piece once the art's
 * composition is drawn there (see composition.ts `keptClear`): the
 * composition was placed knowing nothing of them, so what it puts on them is
 * left out. The rest of the game's scatter on a piece makes way for the
 * composition's instead (Isles.tsx, WildIsles.tsx).
 */
export const KEPT_CLEAR: Partial<Record<DockId, Footprint[]>> = {
  // The rock in the wildflowers, and where Síofra stands: her tap target (0.5 round) and a little over.
  meadow: [
    { at: MEADOW.rock, r: 0.35 },
    { at: SIOFRA_SPOT.at, r: 0.55 },
  ],
  // The fallen log: 0.9 long and 0.28 thick, as Structures.tsx draws it.
  grove: [{ at: GROVE.log, half: [0.52, 0.2], rot: GROVE.logTurn }],
  // The rocks along its coast (a rock model spans about 1.85 times its scale).
  islet: ISLET.rocks.map((rock) => ({ at: rock.at, r: rock.s[0] * 0.95 })),
  // The cranberry bed and its timber frame; the jetty's deck, and the shed patch beside it.
  wetland: [
    { at: WETLAND.cranberryBed.at, half: [WETLAND.cranberryBed.half[0] + 0.15, WETLAND.cranberryBed.half[1] + 0.15], rot: WETLAND.cranberryBed.rot },
    { at: WETLAND.jetty.at, half: [JETTY_DECK.half[0] + 0.1, JETTY_DECK.half[1] + 0.1], rot: WETLAND.jetty.turn },
    WETLAND.jetty.shedPatch,
  ],
  // The outcrops against the risers.
  highland: HIGHLAND.outcrops.map((o) => ({ at: o.at, half: [OUTCROP_SIZE[o.model].half[0] * o.scale, OUTCROP_SIZE[o.model].half[1] * o.scale], rot: o.rot })),
  // The fruit trees, each in a disc as wide as the farm's fruit trees keep.
  orchard: ORCHARD.rows.map((at) => ({ at, r: ORCHARD.treeClear })),
  // The glade's beehives, each in a disc as wide as the farm's hives keep (layout.ts SLOT_DISCS).
  cottage: GLADE.hives.map((at) => ({ at, r: 0.35 })),
}

/** How far the ground may rise or fall within 0.3 u for an animal to graze it. */
const GRAZING_SLOPE = 0.15

/** Whether a spot is under (or within `pad` of) one of the highland's outcrops. */
export const byOutcrop = ([x, z]: XZ, pad = 0): boolean =>
  HIGHLAND.outcrops.some((o) => Math.hypot(x - o.at[0], z - o.at[1]) < Math.max(...OUTCROP_SIZE[o.model].half) * o.scale + pad)

/**
 * The ground the goats keep to, read from the piece's ground as drawn: inside
 * their pasture, clear of the outcrops, at about its middle's height and
 * gently sloping, so none climbs a riser. Heights are read when asked, never
 * stored.
 */
export function grazingGround(height: (x: number, z: number) => number, pasture: { at: XZ; r: number }): (x: number, z: number) => boolean {
  const level = height(...pasture.at)
  return (x, z) => {
    if (Math.hypot(x - pasture.at[0], z - pasture.at[1]) > pasture.r || byOutcrop([x, z], 0.25)) return false
    const h = height(x, z)
    if (!(Math.abs(h - level) < 0.4)) return false
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      if (!(Math.abs(height(x + Math.cos(a) * 0.3, z + Math.sin(a) * 0.3) - h) < GRAZING_SLOPE)) return false
    }
    return true
  }
}

/** Whether a spot on a wild isle is in its water (or within `margin` of it): the wetland's lake and rivers, the highland's tarn. */
export function inWater(id: DockId, p: XZ, margin = 0): boolean {
  const near = (pool: Pool) => inPolygon(p, pool.outline) || (margin > 0 && pool.outline.some(([x, z]) => Math.hypot(x - p[0], z - p[1]) < margin))
  if (id === 'wetland') return near(WETLAND.lake) || fromRiver(p, WETLAND.river) < margin || fromRiver(p, WETLAND.outflow) < margin
  if (id === 'highland') return near(HIGHLAND.tarn)
  return false
}

/** A visitor's spot on a piece: where it waits, in the piece's coordinates, and how far above the ground. */
export interface IsleVisitorSpot {
  isle: DockId
  at: XZ
  lift: number
}

/** A point by a flat zone: towards its piece's middle from the zone's own middle, by `toward` of its radius. */
export const near = (z: FlatZone, toward: number): XZ => {
  const d = Math.hypot(z.at[0], z.at[1]) || 1
  return [z.at[0] - (z.at[0] / d) * z.r * toward, z.at[1] - (z.at[1] / d) * z.r * toward]
}

const spot = (isle: DockId, at: XZ, lift = 0): IsleVisitorSpot => ({ isle, at, lift })

const ruins = zone('highland', 'ruins')
/**
 * The old tower's ruin on the highland's plateau, on its reserved spot (see
 * features/Barnaby.tsx): `turn` (rotation.y) puts its open side (+Z) to the
 * middle of the plateau, where the plateau path comes in, and `stand` is
 * where Barnaby stands in it once he lives there: at the back, before its
 * tallest walls, leaving its open side clear for any visitor that waits on
 * the highland (ISLE_VISITORS).
 */
export const RUIN = { at: ruins.at, turn: Math.atan2(-ruins.at[0], -ruins.at[1]), stand: near(ruins, -0.4) }

/** Where the wild visitors that come to the pieces wait (see features/Visitors.tsx), by what they're named for. */
export const ISLE_VISITORS = {
  hare: spot('meadow', [MEADOW.rock[0] - 1.2, MEADOW.rock[1] - 0.8]),
} satisfies Partial<Record<VisitorId, IsleVisitorSpot>>
