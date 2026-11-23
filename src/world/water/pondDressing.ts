import * as THREE from 'three'
import { toWorld } from '../blueprint'
import type { CompositionReeds } from '../composition'
import { fromOutline, fromRiver, type Reed } from '../isleSpots'
import { BLOCKERS, DIRT_PATHS, LEGACY_POND, MAIN, POND_SHORE, SLOT_DISCS, STREAM_LINE, STREAM_THETA, WATER_BLOCKERS, type XZ } from '../layout'
import { rng, spotHash } from '../random'
import { rimPoint } from '../terrain'

// The farm pond's dressing (spec §4.2: "The stones, pads, reeds and bridge
// stay"): its stones, lily pads and reeds, the stream's footbridge and the
// fall's mist, for the pond that is drawn. `legacy` is today's, round the old blob (LEGACY_POND),
// number for number: it goes with today's water, with the water switch off,
// while the baked pond loads, or if it fails to. `v2` stands on the art's
// Teardrop and its stream (Revision 1, R1.2), once the baked pond is drawn; its
// reeds are the art's own (GV3: teardropReeds), drawn as the wetland's are.
// Plain functions, so they run in tests; Water.tsx draws them.

export type DressingMode = 'legacy' | 'v2'

/** A stone on the bank: where it stands (MAIN's x, z), its size (its Rock scale, about its radius), and its turn (rotation.y). */
export interface DressingStone {
  x: number
  z: number
  r: number
  rot: number
}

/** A lily pad on the water: where it floats, its radius, and whether it is in flower. */
export interface DressingPad {
  x: number
  z: number
  r: number
  blossom: boolean
}

/** A spike reed in the old pond's shallows: where it grows, and how tall it is. */
export interface DressingReed {
  x: number
  z: number
  h: number
}

/** The stream's footbridge: where its middle stands, and its turn (rotation.y: its planks run along its own +Z). */
export interface DressingBridge {
  x: number
  z: number
  rot: number
}

export interface Dressing {
  stones: DressingStone[]
  pads: DressingPad[]
  /** The old pond's spike reeds; none on the Teardrop, whose reeds are the art's (teardropReeds). */
  reeds: DressingReed[]
  bridge: DressingBridge
}

type V3 = [number, number, number]

// ---- today's -------------------------------------------------------------------

/**
 * The pond's dressing as Water.tsx has always drawn it, in the old pond's own
 * frame (its group stands at LEGACY_POND, on the ground there): stones on its
 * bank with a gap where the stream leaves, three pads, and a clump of reeds.
 * New objects each call.
 */
export function legacyPondLocal(): { stones: { p: V3; s: number }[]; pads: V3[]; reeds: V3[] } {
  const r = rng(77)
  const stones = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2 + r() * 0.3
    const d = LEGACY_POND.r + 0.22 + r() * 0.08
    // On the bank (y 0.03), the stand-in's centre a little above it.
    return { p: [Math.cos(a) * d, 0.03, Math.sin(a) * d] as V3, s: 0.09 + r() * 0.1 }
  }).filter((s) => {
    // leave a gap where the stream leaves the pond
    const a = Math.atan2(s.p[2], s.p[0])
    return Math.abs(((a - STREAM_THETA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.45
  })
  const pads = [[0.45, -0.35], [-0.55, 0.2], [0.1, 0.62]].map(([x, z]) => [x, 0.075, z] as V3)
  const reeds = Array.from({ length: 7 }, (_, i) => [-LEGACY_POND.r * 0.75 + (i % 3) * 0.12, 0, -LEGACY_POND.r * 0.45 - Math.floor(i / 3) * 0.12 + r() * 0.05] as V3)
  return { stones, pads, reeds }
}

/** The stream as Water.tsx has always drawn it: out of the old pond at STREAM_THETA, through two bends, to the rim. */
export function streamPath() {
  const dir = new THREE.Vector2(Math.cos(STREAM_THETA), Math.sin(STREAM_THETA))
  const start = new THREE.Vector2(LEGACY_POND.x, LEGACY_POND.z).add(dir.clone().multiplyScalar(LEGACY_POND.r * 0.7))
  const end = rimPoint(MAIN, STREAM_THETA, -0.05)
  const mid1 = start.clone().lerp(new THREE.Vector2(end.x, end.z), 0.35).add(new THREE.Vector2(0.25, 0.35))
  const mid2 = start.clone().lerp(new THREE.Vector2(end.x, end.z), 0.7).add(new THREE.Vector2(-0.2, -0.15))
  return { start, mid1, mid2, end }
}

/**
 * Where the art's mist for the farm fall stands: the `mist_fall` node of
 * water_main.glb (MAIN's frame), at the foot of the baked fall.
 */
export const MAIN_FALL_MIST: readonly [number, number, number] = [-7.63946, -8.15389, 6.49781]

/**
 * The farm fall's four mist blobs (MAIN's frame): today's (`legacy`), under
 * the old fall's foot 4.6 below the rim; or, with the baked fall (`v2`), the
 * same cluster, blob for blob, moved to stand round MAIN_FALL_MIST, until the
 * art's own mist is drawn there (PR 5). New objects each call.
 */
export function fallMist(mode: DressingMode): THREE.Vector3[] {
  const { end } = streamPath()
  const out = new THREE.Vector3(Math.cos(STREAM_THETA), 0, Math.sin(STREAM_THETA))
  const mist = [0, 1, 2, 3].map((i) => end.clone().add(out.clone().multiplyScalar(0.7 + i * 0.12)).setY(end.y - 4.6 + (i % 2) * 0.25).add(new THREE.Vector3((i - 1.5) * 0.25, 0, 0)))
  if (mode === 'legacy') return mist
  const centre = mist.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(mist.length)
  const step = new THREE.Vector3(...MAIN_FALL_MIST).sub(centre)
  return mist.map((p) => p.add(step))
}

/** Today's dressing on the farm (MAIN's frame), each stone turned as the rock takes its turn from its spot in the old pond's frame. */
function legacy(): Dressing {
  const { stones, pads, reeds } = legacyPondLocal()
  // The bridge stands on the second bend, across the stream's run from the first.
  const { mid1, mid2 } = streamPath()
  const tan = new THREE.Vector3(mid2.x - mid1.x, 0, mid2.y - mid1.y).normalize()
  return {
    stones: stones.map(({ p, s }) => ({ x: LEGACY_POND.x + p[0], z: LEGACY_POND.z + p[2], r: s, rot: spotHash(p[2], p[0]) * Math.PI * 2 })),
    pads: pads.map(([x, , z], i) => ({ x: LEGACY_POND.x + x, z: LEGACY_POND.z + z, r: 0.17, blossom: i === 1 })),
    reeds: reeds.map(([x, , z], i) => ({ x: LEGACY_POND.x + x, z: LEGACY_POND.z + z, h: 0.5 + (i % 3) * 0.12 })),
    bridge: { x: mid2.x, z: mid2.y, rot: Math.atan2(tan.x, tan.z) + Math.PI / 2 },
  }
}

// ---- the Teardrop's ----------------------------------------------------------------

/** Where the stream leaves the pond: the shore's cap line, from its last point to its first (R1.2). */
const MOUTH: [XZ, XZ] = [POND_SHORE[POND_SHORE.length - 1], POND_SHORE[0]]
/** The art's bridge point, the third point its stream's curve runs through (R1.2). */
export const BRIDGE_AT: XZ = [-5.7089, 5.5385]

/** How many stones stand round the bank, as round the old pond. */
const STONES = 11
/** How far out from the shore a stone's middle stands: on the bank, by the water's edge. */
const BANK = { near: 0.1, far: 0.35 }
/** How close to the stream's mouth (the cap line) a stone may stand. */
const MOUTH_ROOM = 0.4
/** Half the wider dirt path's width: a stone keeps that, and its own size, from a path's middle line. */
const PATH_HALF = 0.3
/** The grass between two stones, past their sizes. */
const STONE_GAP = 0.25

/**
 * Three lily pads (x, z, radius) in the Teardrop's tail, where it reaches
 * furthest past the open middle the ducks paddle round: they float clear of
 * both rings, on still water (the pond surface takes its flow only past the
 * cap line). The middle one flowers, as the old pond's did.
 */
const PADS: V3[] = [
  [-2.45, 5.85, 0.17],
  [-3.05, 5.6, 0.15],
  [-2.75, 5.15, 0.16],
]

const fromSegment = ([x, z]: XZ, [ax, az]: XZ, [bx, bz]: XZ): number => {
  const dx = bx - ax
  const dz = bz - az
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
}

/** The pond's shore from one cap corner round to the other (the cap line left out), measured along it. */
function shoreWalk() {
  const pts = POND_SHORE
  const n = pts.length
  const along = [0]
  for (let i = 1; i < n; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  // which way is out of the water: by the way the outline turns (its signed area in x, z)
  let area = 0
  for (let i = 0; i < n; i++) area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1]
  const turn = area < 0 ? 1 : -1
  return {
    length: along[n - 1],
    /** The shore's point `s` along it, and the way out of the water there (x, z, of length 1). */
    at(s: number): { p: XZ; out: XZ } {
      let i = 0
      while (i < n - 2 && along[i + 1] < s) i++
      const t = Math.max(0, Math.min(1, (s - along[i]) / (along[i + 1] - along[i])))
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      // across the shore over a few points, so one kink in the outline doesn't swing it
      const [cx, cz] = pts[Math.max(0, i - 2)]
      const [dx, dz] = pts[Math.min(n - 1, i + 3)]
      const l = Math.hypot(dx - cx, dz - cz)
      return { p: [ax + (bx - ax) * t, az + (bz - az) * t], out: [(-turn * (dz - cz)) / l, (turn * (dx - cx)) / l] }
    },
  }
}

/**
 * `count` stones, spaced evenly round the bank from the stream's mouth back to
 * it (the farm pond has STONES). Each is aimed at its share of the shore and
 * stepped along it, a little each way in turn, to the nearest spot where it is
 * clear: on the bank, 0.4 or more from the mouth and off the stream's water,
 * whole on the ground the water's blockers keep clear (so no animal or moved
 * thing walks through it), off every other area, slot and dirt path, and apart
 * from the stones before it. A stone with no clear spot near its share is left
 * out, with one warning for them all: a changed layout loses a stone, never the
 * farm's drawing (this runs as the pond is drawn).
 */
export function bankStones(count: number): DressingStone[] {
  const shore = shoreWalk()
  const others = [...BLOCKERS.filter((b) => !WATER_BLOCKERS.includes(b)), ...SLOT_DISCS]
  const cover = ([x, z]: XZ) => Math.max(...WATER_BLOCKERS.map((b) => b.r - Math.hypot(x - b.at[0], z - b.at[1])))
  const fromPaths = (p: XZ) => Math.min(...DIRT_PATHS.flatMap((path) => path.slice(1).map((b, i) => fromSegment(p, path[i], b))))
  const r = rng(29)
  const stones: DressingStone[] = []
  const clear = (at: XZ, size: number) => {
    const out = fromOutline(at, POND_SHORE)
    return (
      out >= BANK.near &&
      out <= BANK.far &&
      fromSegment(at, ...MOUTH) >= MOUTH_ROOM &&
      fromRiver(at, STREAM_LINE) >= size &&
      cover(at) >= size &&
      fromPaths(at) >= PATH_HALF + size &&
      others.every((b) => Math.hypot(at[0] - b.at[0], at[1] - b.at[1]) >= b.r + size) &&
      stones.every((s) => Math.hypot(at[0] - s.x, at[1] - s.z) >= s.r + size + STONE_GAP)
    )
  }
  const missed: string[] = []
  for (let i = 0; i < count; i++) {
    // as big as the old pond's, and set a little way up the bank
    const size = 0.09 + r() * 0.08
    const out = 0.12 + r() * 0.08
    const rot = r() * Math.PI * 2
    const aim = (shore.length * (i + 0.5)) / count
    let stone: DressingStone | null = null
    for (let k = 0; k <= 40 && !stone; k++) {
      const s = aim + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05
      if (s < 0 || s > shore.length) continue
      const { p, out: way } = shore.at(s)
      const at: XZ = [p[0] + way[0] * out, p[1] + way[1] * out]
      if (clear(at, size)) stone = { x: at[0], z: at[1], r: size, rot }
    }
    if (stone) stones.push(stone)
    else missed.push(`${i} (near ${aim.toFixed(2)} round the shore)`)
  }
  if (missed.length) console.warn(`The farm pond's bank has no clear spot for ${missed.length} of its ${count} stones, so they are left out: ${missed.join(', ')}.`)
  return stones
}

/**
 * The Teardrop's reeds: the art's (the composition's pieces.main.reeds, plan
 * Task 10, GR30: two clumps at the waterline of its far shore), 1:1 the game's
 * Reed, in MAIN's frame. The art's spots are the piece's own, so each is moved
 * by MAIN's dock (toWorld); MAIN is docked at the origin, so its frame, its own
 * spots and the world's are one. Drawn with the wild isles' Reeds (Reeds.tsx)
 * with the baked Teardrop only, never round the old pond: they were placed
 * blind to it. None where the art has none.
 */
export function teardropReeds(all: CompositionReeds): Reed[] {
  return (all.main ?? []).map(({ x, z, height, head }) => {
    const [wx, , wz] = toWorld('main', [x, z])
    return { at: [wx, wz], height, head }
  })
}

/** The footbridge at the art's bridge point, across the stream's middle line where it runs there. */
function v2Bridge(): DressingBridge {
  let near = 0
  for (let i = 1; i < STREAM_LINE.length - 1; i++) {
    if (fromSegment(BRIDGE_AT, STREAM_LINE[i].at, STREAM_LINE[i + 1].at) < fromSegment(BRIDGE_AT, STREAM_LINE[near].at, STREAM_LINE[near + 1].at)) near = i
  }
  const [ax, az] = STREAM_LINE[near].at
  const [bx, bz] = STREAM_LINE[near + 1].at
  return { x: BRIDGE_AT[0], z: BRIDGE_AT[1], rot: Math.atan2(bx - ax, bz - az) + Math.PI / 2 }
}

let teardrop: Dressing | null = null

/**
 * The farm pond's dressing, in MAIN's frame (x, z; the drawing reads each
 * height off the ground, or the pond's level for the pads): `legacy` for the
 * old round pond and its stream, `v2` for the art's Teardrop. The Teardrop's is
 * worked out once; today's is read afresh, as its stream's end sits on MAIN's
 * rim.
 */
export function pondDressing(mode: DressingMode): Dressing {
  if (mode === 'legacy') return legacy()
  teardrop ??= {
    stones: bankStones(STONES),
    pads: PADS.map(([x, z, r], i) => ({ x, z, r, blossom: i === 1 })),
    // Its reeds are the art's (teardropReeds), not spikes.
    reeds: [],
    bridge: v2Bridge(),
  }
  return teardrop
}
