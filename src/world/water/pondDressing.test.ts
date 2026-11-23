import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import waterRaw from '../../../public/models/water.json?raw'
import blueprintRaw from '../../../art/config/blueprint.pieces.json?raw'
import { PIECES } from '../blueprint'
import { COMPOSITION_REEDS } from '../composition.data'
import { duckAt } from '../ducks'
import { fromRiver } from '../isleSpots'
import { BLOCKERS, DIRT_PATHS, LEGACY_POND, MAIN, POND, POND_LEVEL, POND_SHORE, SLOT_DISCS, STREAM_LINE, STREAM_THETA, WATER_BLOCKERS, type XZ } from '../layout'
import { rng, spotHash } from '../random'
import { rimPoint } from '../terrain'
import { fromFarmWater, fromOutline, glbRootNodes } from '../testing'
import { bankStones, fallMist, legacyPondLocal, MAIN_FALL_MIST, pondDressing, streamPath, teardropReeds } from './pondDressing'
import type { WaterJson } from './types'

type V3 = [number, number, number]

/** Today's Pond and Stream (Water.tsx before the baked water), copied as they were: what the old pond's dressing must stay. */
function todays() {
  const r = rng(77)
  const stones = Array.from({ length: 11 }, (_, i) => {
    const a = (i / 11) * Math.PI * 2 + r() * 0.3
    const d = LEGACY_POND.r + 0.22 + r() * 0.08
    return { p: [Math.cos(a) * d, 0.03, Math.sin(a) * d] as V3, s: 0.09 + r() * 0.1 }
  }).filter((s) => {
    const a = Math.atan2(s.p[2], s.p[0])
    return Math.abs(((a - STREAM_THETA + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.45
  })
  const pads = [[0.45, -0.35], [-0.55, 0.2], [0.1, 0.62]].map(([x, z]) => [x, 0.075, z] as V3)
  const reeds = Array.from({ length: 7 }, (_, i) => [-LEGACY_POND.r * 0.75 + (i % 3) * 0.12, 0, -LEGACY_POND.r * 0.45 - Math.floor(i / 3) * 0.12 + r() * 0.05] as V3)

  const dir = new THREE.Vector2(Math.cos(STREAM_THETA), Math.sin(STREAM_THETA))
  const start = new THREE.Vector2(LEGACY_POND.x, LEGACY_POND.z).add(dir.clone().multiplyScalar(LEGACY_POND.r * 0.7))
  const end = rimPoint(MAIN, STREAM_THETA, -0.05)
  const mid1 = start.clone().lerp(new THREE.Vector2(end.x, end.z), 0.35).add(new THREE.Vector2(0.25, 0.35))
  const mid2 = start.clone().lerp(new THREE.Vector2(end.x, end.z), 0.7).add(new THREE.Vector2(-0.2, -0.15))
  const tan = new THREE.Vector3(mid2.x - mid1.x, 0, mid2.y - mid1.y).normalize()
  const bridge = { x: mid2.x, z: mid2.y, rot: Math.atan2(tan.x, tan.z) + Math.PI / 2 }
  const out = new THREE.Vector3(Math.cos(STREAM_THETA), 0, Math.sin(STREAM_THETA))
  const mist = [0, 1, 2, 3].map((i) => end.clone().add(out.clone().multiplyScalar(0.7 + i * 0.12)).setY(end.y - 4.6 + (i % 2) * 0.25).add(new THREE.Vector3((i - 1.5) * 0.25, 0, 0)))
  return { stones, pads, reeds, bridge, mist, path: { start, mid1, mid2, end } }
}

const v2 = pondDressing('v2')
const ART_REEDS = teardropReeds(COMPOSITION_REEDS)
/** Where the stream leaves the pond: the shore's cap line, its first and last points. */
const MOUTH: [XZ, XZ] = [POND_SHORE[0], POND_SHORE[POND_SHORE.length - 1]]

function fromSegment([x, z]: XZ, [ax, az]: XZ, [bx, bz]: XZ): number {
  const dx = bx - ax
  const dz = bz - az
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
}
const apart = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)
const stoneAt = (s: { x: number; z: number }) => `the stone at (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`
const quietWarn = () => vi.spyOn(console, 'warn').mockImplementation(() => {})

describe('the old pond’s dressing', () => {
  it('keeps the legacy dressing exactly, with its bridge where the art put the new stream’s', () => {
    const was = todays()
    const local = legacyPondLocal()
    expect(local.stones).toEqual(was.stones)
    expect(local.pads).toEqual(was.pads)
    expect(local.reeds).toEqual(was.reeds)
    // on the farm (MAIN's frame), with each stone's turn as the rock takes it from its spot
    const legacy = pondDressing('legacy')
    expect(legacy.stones).toEqual(was.stones.map(({ p, s }) => ({ x: LEGACY_POND.x + p[0], z: LEGACY_POND.z + p[2], r: s, rot: spotHash(p[2], p[0]) * Math.PI * 2 })))
    expect(legacy.pads).toEqual(was.pads.map(([x, , z], i) => ({ x: LEGACY_POND.x + x, z: LEGACY_POND.z + z, r: 0.17, blossom: i === 1 })))
    expect(legacy.reeds).toEqual(was.reeds.map(([x, , z], i) => ({ x: LEGACY_POND.x + x, z: LEGACY_POND.z + z, h: 0.5 + (i % 3) * 0.12 })))
    expect(legacy.bridge).toEqual(was.bridge)
    expect(streamPath()).toEqual(was.path)
    expect([legacy.bridge.x, legacy.bridge.z]).toEqual([expect.closeTo(-5.7089, 4), expect.closeTo(5.5385, 4)])
  })
})

describe('the new pond’s dressing', () => {
  it('places 11 stones on the shore band, 0.10–0.35 outside the shore, off the stream, sized, spaced and all the way round', () => {
    expect(v2.stones).toHaveLength(11)
    for (const s of v2.stones) {
      const out = fromOutline([s.x, s.z], POND_SHORE)
      expect(fromSegment([s.x, s.z], ...MOUTH), stoneAt(s)).toBeGreaterThanOrEqual(0.4) // off the stream: clear of its mouth and its water
      expect(fromRiver([s.x, s.z], STREAM_LINE), stoneAt(s)).toBeGreaterThanOrEqual(s.r)
      expect([out >= 0.1, out <= 0.35, s.r >= 0.09, s.r <= 0.19, s.rot >= 0, s.rot < Math.PI * 2], stoneAt(s)).toEqual([true, true, true, true, true, true])
    }
    for (let a = 0; a < v2.stones.length; a++) for (let b = a + 1; b < v2.stones.length; b++) expect(apart(v2.stones[a], v2.stones[b]), `stones ${a} and ${b}`).toBeGreaterThan(v2.stones[a].r + v2.stones[b].r + 0.1)
    // not bunched on one side: every part of the shore has one within 1.5
    for (const p of POND_SHORE.filter((p) => fromSegment(p, ...MOUTH) > 0.6)) expect(Math.min(...v2.stones.map((s) => Math.hypot(s.x - p[0], s.z - p[1]))), `the shore at (${p})`).toBeLessThan(1.5)
  })

  it('floats 3 lily pads at least 0.3 inside the shore and 0.5 apart, one in flower, on the baked pond’s surface', () => {
    expect(v2.pads).toHaveLength(3)
    for (const p of v2.pads) {
      expect(-fromOutline([p.x, p.z], POND_SHORE), `the pad at (${p.x}, ${p.z})`).toBeGreaterThanOrEqual(0.3)
      expect(fromRiver([p.x, p.z], STREAM_LINE)).toBeGreaterThan(p.r)
      expect(p.r).toBeGreaterThanOrEqual(0.14)
      expect(p.r).toBeLessThanOrEqual(0.2)
    }
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) expect(apart(v2.pads[a], v2.pads[b]), `pads ${a} and ${b}`).toBeGreaterThanOrEqual(0.5)
    expect(v2.pads.filter((p) => p.blossom)).toHaveLength(1)
    const json = JSON.parse(waterRaw) as WaterJson
    expect(POND_LEVEL).toBe(json.pieces.main.bodies.find((b) => b.node === 'water_pond')!.level)
    expect(POND_LEVEL).toBe(0.06)
  })

  it('puts the bridge at the art’s bridge point, on the stream’s middle line, turned across its flow', () => {
    const { bridge } = v2
    expect([bridge.x, bridge.z]).toEqual([-5.7089, 5.5385])
    const points = (JSON.parse(blueprintRaw) as { pieces: { main: { water: { stream: { points: { x: number; z: number }[] } } } } }).pieces.main.water.stream.points
    expect(points.some((p) => p.x === bridge.x && p.z === bridge.z)).toBe(true)
    const segs = STREAM_LINE.slice(0, -1).map((p, i) => ({ a: p.at, b: STREAM_LINE[i + 1].at, d: fromSegment([bridge.x, bridge.z], p.at, STREAM_LINE[i + 1].at) }))
    const { a: [ax, az], b: [bx, bz], d } = segs.reduce((m, x) => (x.d < m.d ? x : m))
    expect(d).toBeLessThan(0.01)
    const flow = new THREE.Vector2(bx - ax, bz - az).normalize()
    // its planks run along its own +Z: turned by rot, across the flow
    expect(Math.abs(new THREE.Vector2(Math.sin(bridge.rot), Math.cos(bridge.rot)).dot(flow))).toBeLessThan(0.02)
  })

  it('keeps the dressing off the ducks’ rings and the blockers’ cover', () => {
    const rings = new Set<string>()
    for (let seed = 1; seed <= 6; seed++) for (let t = 0; t < 60; t += 3.7) { const d = duckAt(seed, t); rings.add(Math.hypot(d.x - POND.x, d.z - POND.z).toFixed(4)) }
    const radii = [...rings].map(Number)
    expect(radii).toHaveLength(2)
    // a duck is about 0.28 wide: a pad clears its ring line by 0.2 past the pad's rim, a reed too
    for (const thing of [...v2.pads, ...ART_REEDS.map(({ at: [x, z] }) => ({ x, z, r: 0.03 }))]) {
      const d = Math.hypot(thing.x - POND.x, thing.z - POND.z)
      for (const ring of radii) expect(Math.abs(d - ring) - thing.r, `(${thing.x.toFixed(2)}, ${thing.z.toFixed(2)}) from the ring at ${ring}`).toBeGreaterThanOrEqual(0.2)
    }
    // no stone in the water the water blockers guard, nor on any other kept-clear area, slot disc or dirt path
    const others = BLOCKERS.filter((b) => !WATER_BLOCKERS.includes(b))
    for (const s of v2.stones) {
      const at: XZ = [s.x, s.z]
      expect(fromFarmWater(at), stoneAt(s)).toBeGreaterThanOrEqual(0.1)
      for (const b of [...others, ...SLOT_DISCS]) expect(Math.hypot(s.x - b.at[0], s.z - b.at[1]), `${stoneAt(s)}, from the area at (${b.at})`).toBeGreaterThanOrEqual(b.r + s.r)
      for (const path of DIRT_PATHS) for (let i = 0; i < path.length - 1; i++) expect(fromSegment(at, path[i], path[i + 1]), `${stoneAt(s)}, from a dirt path`).toBeGreaterThanOrEqual(0.3 + s.r)
      // whole on the ground the water blockers keep clear, so nothing walks through it
      expect(Math.max(...WATER_BLOCKERS.map((b) => b.r - Math.hypot(s.x - b.at[0], s.z - b.at[1]))), stoneAt(s)).toBeGreaterThanOrEqual(s.r)
    }
  })

  it('is the same every time: worked out afresh, it comes out as before', async () => {
    vi.resetModules()
    const warn = quietWarn()
    const again = (await import('./pondDressing')).pondDressing('v2')
    expect(again).not.toBe(v2)
    expect(again).toEqual(v2)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
    const [a, b] = [pondDressing('legacy'), pondDressing('legacy')]
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})

// The Teardrop's reeds are the art's, drawn by the wild isles' Reeds in place of the 7 spikes; the old round pond keeps its spikes.
describe('the Teardrop’s reeds', () => {
  const where = ({ at: [x, z] }: { at: XZ }) => `the reed at (${x.toFixed(2)}, ${z.toFixed(2)})`

  it('draws none of the spike reeds, and stands the art’s 1:1 in MAIN’s frame', () => {
    expect(v2.reeds).toEqual([])
    expect(PIECES.main.dockedPosition).toEqual([0, 0, 0])
    const [dx, , dz] = PIECES.main.dockedPosition
    expect(ART_REEDS).toEqual(COMPOSITION_REEDS.main!.map(({ x, z, height, head }) => ({ at: [x + dx, z + dz], height, head })))
    expect(ART_REEDS).toHaveLength(7)
    for (const reed of ART_REEDS) {
      expect([reed.height >= 0.8, reed.height <= 1.25], where(reed)).toEqual([true, true])
    }
    expect(ART_REEDS.filter((reed) => reed.head)).toHaveLength(4)
    expect(teardropReeds({})).toEqual([])
  })

  it('stands them in 2 clumps at the far shore’s waterline: 0.25 inside to 0.4 outside its edge, 1.0 or more from its mouth', () => {
    for (const reed of ART_REEDS) {
      const out = fromOutline(reed.at, POND_SHORE)
      expect(out, where(reed)).toBeGreaterThanOrEqual(-0.25)
      expect(out, where(reed)).toBeLessThanOrEqual(0.4)
      expect(fromSegment(reed.at, ...MOUTH), where(reed)).toBeGreaterThanOrEqual(1.0)
    }
    // reeds within 0.5 of one another form a clump, the clumps 1.0 or more apart
    const clumps: XZ[][] = []
    for (const { at } of ART_REEDS) {
      const near = clumps.filter((c) => c.some((p) => Math.hypot(p[0] - at[0], p[1] - at[1]) < 0.5))
      const merged = [at, ...near.flat()]
      for (const c of near) clumps.splice(clumps.indexOf(c), 1)
      clumps.push(merged)
    }
    expect(clumps.map((c) => c.length).sort()).toEqual([3, 4])
    const [a, b] = clumps
    expect(Math.min(...a.flatMap((p) => b.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))))).toBeGreaterThanOrEqual(1.0)
  })

})

describe('the farm fall’s mist', () => {
  const centre = (points: THREE.Vector3[]) => points.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(points.length)

  it('keeps today’s mist exactly under today’s fall', () => {
    expect(fallMist('legacy')).toEqual(todays().mist)
  })

  it('stands the baked fall’s mist at the art’s mist node, today’s cluster moved there whole', () => {
    const node = glbRootNodes('public/models/water_main.glb').mist_fall
    expect(node).toBeDefined()
    expect(MAIN_FALL_MIST).toHaveLength(3)
    MAIN_FALL_MIST.forEach((v, i) => expect(Math.abs(v - node.getComponent(i)), 'xyz'[i]).toBeLessThanOrEqual(1e-4))
    const [was, now] = [todays().mist, fallMist('v2')]
    expect(now).toHaveLength(4)
    const at = centre(now)
    MAIN_FALL_MIST.forEach((v, i) => expect(at.getComponent(i), 'xyz'[i]).toBeCloseTo(v, 9))
    const step = now[0].clone().sub(was[0])
    now.forEach((p, i) => expect(p.clone().sub(was[i]).distanceTo(step), `blob ${i}`).toBeLessThan(1e-9))
  })
})

describe('a bank with no room for a stone', () => {
  it('places the stones that fit and warns once, instead of failing the farm’s drawing; has room for all 11 with no warning', () => {
    const warn = quietWarn()
    expect(bankStones(11)).toEqual(v2.stones)
    expect(warn).not.toHaveBeenCalled()
    const stones = bankStones(40)
    expect(stones.length).toBeGreaterThan(11)
    expect(stones.length).toBeLessThan(40)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/stone/)
    warn.mockRestore()
  })
})
