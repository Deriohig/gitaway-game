import * as THREE from 'three'
import { PALETTE } from './palette'
import { rng, smoothstep } from './random'

// Procedural floating islands: a gently rolling grassy top with a soft lip,
// a band of soil, then layered cliffs tapering to a point below. Every face
// gets its own colour for a painterly, low-poly look.

export interface IslandSpec {
  seed: number
  radius: number
  /** Height of the rolling hills near the rim. */
  hills: number
  /** Vertical scale of the cliffs underneath. */
  depth: number
  /** Fraction of the radius that stays nearly flat for building on. */
  flatCenter?: number
  /** Soft hills added on top, in local coordinates. */
  mounds?: { x: number; z: number; h: number; r: number }[]
  /** The rim radius in each direction, if not the usual wobbly circle of `radius` (a blueprint piece's outline, say). */
  shape?: (theta: number) => number
  /** Points around the rim (more follow a detailed shape closely). */
  segments?: number
}

export interface Island {
  spec: IslandSpec
  geometry: THREE.BufferGeometry
  /** Ground height at a local position. */
  height: (x: number, z: number) => number
  /** Rim radius in a direction. */
  outline: (theta: number) => number
  random: () => number
  /** A baked piece's cliff skirts along its seams with other pieces, if it has any (see skirts.ts). */
  skirts?: THREE.Group | null
}

const HARMONICS = [2, 3, 5, 7]
const AMPS = [0.06, 0.045, 0.025, 0.014]
const CLIFF: [number, number][] = [
  [1.03, -0.14],
  [1.0, -0.48],
  [0.95, -1.25],
  [0.84, -2.2],
  [0.67, -3.2],
  [0.45, -4.1],
  [0.2, -4.9],
]
const TIP_Y = -5.5

const c = (hex: string) => new THREE.Color(hex)
const GRASS = { light: c(PALETTE.grassLight), sage: c(PALETTE.sage), meadow: c(PALETTE.meadow), deep: c(PALETTE.grassDeep) }
const CLIFF_COLORS = [c(PALETTE.grassDeep), c(PALETTE.soil), c(PALETTE.cliffTop), c(PALETTE.cliffTop), c(PALETTE.cliffMid), c(PALETTE.cliffLow), c(PALETTE.cliffTip), c(PALETTE.cliffTip)]

export function makeIsland(spec: IslandSpec): Island {
  const random = rng(spec.seed)
  const phases = HARMONICS.map(() => random() * Math.PI * 2)
  const hp = [random(), random(), random(), random()].map((v) => v * Math.PI * 2)
  const flat = spec.flatCenter ?? 0.45

  const outline =
    spec.shape ?? ((theta: number) => spec.radius * (1 + HARMONICS.reduce((sum, k, i) => sum + AMPS[i] * Math.sin(k * theta + phases[i]), 0)))

  const height = (x: number, z: number) => {
    const f = Math.hypot(x, z) / outline(Math.atan2(z, x))
    const rim = 1 - smoothstep(0.86, 1.0, f)
    const amp = spec.hills * (0.18 + 0.82 * smoothstep(flat, 0.85, f)) * rim
    const n = Math.sin(0.42 * x + hp[0]) * Math.cos(0.37 * z + hp[1]) * 0.6 + Math.sin(0.8 * x - 0.6 * z + hp[2]) * 0.4
    let h = amp * (n * 0.5 + 0.5)
    for (const m of spec.mounds ?? []) {
      const d = Math.hypot(x - m.x, z - m.z) / m.r
      if (d < 1) h += m.h * (0.5 + 0.5 * Math.cos(d * Math.PI)) * rim
    }
    return h
  }

  const grassAt = (x: number, z: number, f: number, h: number, out: THREE.Color) => {
    const patch = 0.5 + 0.5 * Math.sin(0.9 * x + hp[3]) * Math.cos(0.75 * z + hp[0])
    out.copy(GRASS.sage).lerp(GRASS.meadow, patch)
    const bright = 0.5 + 0.5 * Math.sin(1.7 * x - 1.3 * z + hp[1])
    if (bright > 0.82) out.lerp(GRASS.light, (bright - 0.82) * 3)
    out.lerp(GRASS.deep, smoothstep(0.7, 1.0, f) * 0.45)
    out.offsetHSL(0, 0, h * 0.12 + (random() - 0.5) * 0.035)
    return out
  }

  const segments = spec.segments ?? Math.max(24, Math.round(spec.radius * 6.5))
  const rings = Math.max(4, Math.round(spec.radius * 0.8))

  // Top surface: concentric rings with slight jitter so it reads as hand-made.
  const top: THREE.Vector3[][] = []
  for (let k = 1; k <= rings; k++) {
    const ring: THREE.Vector3[] = []
    const f = k / rings
    for (let j = 0; j < segments; j++) {
      const theta = ((j + (k % 2) * 0.5) / segments) * Math.PI * 2
      const jitter = k < rings ? (random() - 0.5) * 0.06 : 0
      const r = (f + jitter) * outline(theta)
      const x = Math.cos(theta) * r
      const z = Math.sin(theta) * r
      ring.push(new THREE.Vector3(x, k === rings ? height(x, z) * 0.3 : height(x, z), z))
    }
    top.push(ring)
  }

  // Cliffs: rings below the rim, tapering inwards, jittered for a rocky feel.
  const edgeRing = top[rings - 1]
  const cliffs: THREE.Vector3[][] = CLIFF.map(([rf, y], level) =>
    edgeRing.map((p) => {
      const theta = Math.atan2(p.z, p.x)
      const wobble = level === 0 ? 1 : 1 + (random() - 0.5) * 0.14
      const r = outline(theta) * rf * wobble
      const yy = y * spec.depth + (level > 1 ? (random() - 0.5) * 0.3 * spec.depth : 0)
      return new THREE.Vector3(Math.cos(theta) * r, yy, Math.sin(theta) * r)
    }),
  )
  const tip = new THREE.Vector3((random() - 0.5) * 0.4, TIP_Y * spec.depth, (random() - 0.5) * 0.4)

  const positions: number[] = []
  const colors: number[] = []
  const color = new THREE.Color()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const n = new THREE.Vector3()

  const tri = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3, col: THREE.Color, outward: THREE.Vector3) => {
    ab.subVectors(b, a)
    ac.subVectors(cc, a)
    n.crossVectors(ab, ac)
    const [p, q] = n.dot(outward) >= 0 ? [b, cc] : [cc, b]
    positions.push(a.x, a.y, a.z, p.x, p.y, p.z, q.x, q.y, q.z)
    for (let i = 0; i < 3; i++) colors.push(col.r, col.g, col.b)
  }

  const up = new THREE.Vector3(0, 1, 0)
  const centroid = new THREE.Vector3()
  const topTri = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3) => {
    centroid.copy(a).add(b).add(cc).divideScalar(3)
    const f = Math.hypot(centroid.x, centroid.z) / outline(Math.atan2(centroid.z, centroid.x))
    tri(a, b, cc, grassAt(centroid.x, centroid.z, f, centroid.y, color), up)
  }

  const center = new THREE.Vector3(0, height(0, 0), 0)
  const first = top[0]
  for (let j = 0; j < segments; j++) topTri(center, first[j], first[(j + 1) % segments])

  const strip = (inner: THREE.Vector3[], outer: THREE.Vector3[], face: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => void) => {
    for (let j = 0; j < segments; j++) {
      const j2 = (j + 1) % segments
      face(inner[j], outer[j], outer[j2])
      face(inner[j], outer[j2], inner[j2])
    }
  }
  for (let k = 1; k < rings; k++) strip(top[k - 1], top[k], topTri)

  const outward = new THREE.Vector3()
  const cliffFace = (level: number) => (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3) => {
    centroid.copy(a).add(b).add(cc).divideScalar(3)
    outward.set(centroid.x, -0.35, centroid.z).normalize()
    color.copy(CLIFF_COLORS[Math.min(level, CLIFF_COLORS.length - 1)])
    if (level >= 2) color.lerp(CLIFF_COLORS[Math.min(level + 1, CLIFF_COLORS.length - 1)], random() * 0.5)
    color.offsetHSL(0, 0, (random() - 0.5) * 0.05)
    tri(a, b, cc, color, outward)
  }
  strip(edgeRing, cliffs[0], cliffFace(0))
  for (let level = 1; level < cliffs.length; level++) strip(cliffs[level - 1], cliffs[level], cliffFace(level))

  const last = cliffs[cliffs.length - 1]
  const tipFace = cliffFace(cliffs.length)
  for (let j = 0; j < segments; j++) tipFace(last[j], tip, last[(j + 1) % segments])

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return { spec, geometry, height, outline, random }
}

/**
 * How far the ground falls away below a footprint's centre, as a negative
 * number (0 on level ground). The footprint is an ellipse, rx along the
 * thing's own x and rz along its z, turned by rot like rotation.y. Standing a
 * model this much lower leaves no edge of it floating on a slope.
 */
export function footprintDrop(island: Island, x: number, z: number, rx: number, rz = rx, rot = 0): number {
  const y0 = island.height(x, z)
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  let low = 0
  for (const f of [0.5, 1]) {
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * Math.PI * 2
      const lx = Math.cos(t) * rx * f
      const lz = Math.sin(t) * rz * f
      low = Math.min(low, island.height(x + lx * cos + lz * sin, z - lx * sin + lz * cos) - y0)
    }
  }
  return low
}

/** Point on the rim of an island (in its local space) in a direction. */
export function rimPoint(island: Island, theta: number, inset = 0): THREE.Vector3 {
  const r = island.outline(theta) - inset
  const x = Math.cos(theta) * r
  const z = Math.sin(theta) * r
  return new THREE.Vector3(x, island.height(x, z), z)
}
