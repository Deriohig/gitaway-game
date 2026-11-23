import type * as THREE from 'three'
import { PIECES, type PieceId } from './blueprint'
import { hash01 } from '../game/hash'
import { rng } from './random'
import { makeIsland, type Island, type IslandSpec } from './terrain'

// Turning the art session's baked pieces into the game's `Island` (terrain.ts):
// the mesh from piece_<id>.glb, `height` from piece_<id>.height.bin, `outline`
// from the blueprint's outline polygon. Without the files (or if they fail to
// load) a piece is built procedurally with makeIsland instead: MAIN as it
// always was, the others flat-topped, cut to the same outline so they still
// dock. Everything here is plain functions, so it runs in tests and in node.

type XZ = [number, number]

/** Where a piece's height grid is and how it's laid out (its manifest entry's `height`). */
export interface HeightGridInfo {
  file: string
  /** Local x, z of the first value. */
  origin: [number, number]
  spacing: number
  /** Values along x, then along z. */
  size: [number, number]
}

/** Ground heights on a regular grid, row-major with x fastest; NaN where the point is off the piece's top. */
export interface HeightGrid extends Omit<HeightGridInfo, 'file'> {
  data: Float32Array
}

/** Reads a height grid file: little-endian Float32, `size[0] × size[1]` values. */
export function parseHeightGrid(info: HeightGridInfo, buffer: ArrayBuffer): HeightGrid {
  const [nx, nz] = info.size
  if (buffer.byteLength !== nx * nz * 4) throw new Error(`${info.file} holds ${buffer.byteLength} bytes, not ${nx} × ${nz} heights`)
  const view = new DataView(buffer)
  const data = new Float32Array(nx * nz)
  for (let i = 0; i < data.length; i++) data[i] = view.getFloat32(i * 4, true)
  return { origin: info.origin, spacing: info.spacing, size: info.size, data }
}

/**
 * The ground height at a local point, looked up bilinearly. At the rim the
 * corners that are off the top (NaN) are left out and the others weighted up
 * to make up; with none left the point is off the piece and this is NaN.
 */
export function sampleGrid(grid: HeightGrid, x: number, z: number): number {
  const [nx, nz] = grid.size
  const gx = (x - grid.origin[0]) / grid.spacing
  const gz = (z - grid.origin[1]) / grid.spacing
  if (!(gx >= 0 && gz >= 0 && gx <= nx - 1 && gz <= nz - 1)) return NaN
  const i = Math.floor(gx)
  const j = Math.floor(gz)
  const u = gx - i
  const v = gz - j
  let weights = 0
  let sum = 0
  for (const [di, dj, w] of [
    [0, 0, (1 - u) * (1 - v)],
    [1, 0, u * (1 - v)],
    [0, 1, (1 - u) * v],
    [1, 1, u * v],
  ] as const) {
    const ii = i + di
    const jj = j + dj
    if (w <= 0 || ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue
    const h = grid.data[jj * nx + ii]
    if (Number.isNaN(h)) continue
    weights += w
    sum += w * h
  }
  return weights > 1e-9 ? sum / weights : NaN
}

/**
 * The rim radius in each direction of a polygon drawn counter-clockwise around
 * the origin, where every direction crosses the rim once (as every blueprint
 * outline does): the distance to where a ray from the origin at θ meets it.
 */
export function polygonOutline(points: readonly XZ[]): (theta: number) => number {
  const n = points.length
  // Start at the smallest angle and unwrap, so the angles only increase.
  const raw = points.map(([x, z]) => Math.atan2(z, x))
  let first = 0
  for (let i = 1; i < n; i++) if (raw[i] < raw[first]) first = i
  const pts: XZ[] = []
  const ang: number[] = []
  for (let k = 0; k < n; k++) {
    const i = (first + k) % n
    let a = raw[i]
    while (k > 0 && a < ang[k - 1]) a += Math.PI * 2
    pts.push(points[i] as XZ)
    ang.push(a)
  }
  const a0 = ang[0]
  const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx
  return (theta: number) => {
    let t = theta
    while (t < a0) t += Math.PI * 2
    while (t >= a0 + Math.PI * 2) t -= Math.PI * 2
    // The edge whose angles span t: the last point at or before it.
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (ang[mid] <= t) lo = mid
      else hi = mid - 1
    }
    const [ax, az] = pts[lo]
    const [bx, bz] = pts[(lo + 1) % n]
    const dx = Math.cos(t)
    const dz = Math.sin(t)
    const den = cross(dx, dz, bx - ax, bz - az)
    if (Math.abs(den) < 1e-12) return Math.hypot(ax, az)
    return cross(ax, az, bx - ax, bz - az) / den
  }
}

/** The area inside a polygon. */
export function polygonArea(points: readonly XZ[]): number {
  let twice = 0
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i]
    const [bx, bz] = points[(i + 1) % points.length]
    twice += ax * bz - bx * az
  }
  return Math.abs(twice) / 2
}

/**
 * Ground heights that are always a number: off the top (just past the rim,
 * say), the height where the way back towards the piece's middle meets it.
 */
export function groundFrom(sample: (x: number, z: number) => number): (x: number, z: number) => number {
  return (x, z) => {
    const h = sample(x, z)
    if (!Number.isNaN(h)) return h
    for (let k = 1; k <= 40; k++) {
      const f = 1 - k * 0.025
      const hk = sample(x * f, z * f)
      if (!Number.isNaN(hk)) return hk
    }
    return 0
  }
}

/** How the game draws a piece: shaded smooth by the baked normals, or faceted like the procedural islands. */
export const isBaked = (island: Island) => island.geometry.userData.baked === true

/** A rough radius for a piece: the mean of its outline's distance from its origin. */
function meanRadius(outline: readonly XZ[]): number {
  return outline.reduce((sum, [x, z]) => sum + Math.hypot(x, z), 0) / outline.length
}

/** The procedural MAIN, unchanged since before the blueprint (its outline is the one the blueprint was cut around). */
export const MAIN_SPEC: IslandSpec = {
  seed: 11,
  radius: 8.8,
  hills: 0.8,
  depth: 1.25,
  flatCenter: 0.55,
  mounds: [
    { x: -5.6, z: -4.6, h: 0.75, r: 3.2 },
    { x: 6.2, z: -3.4, h: 0.35, r: 2.4 },
    { x: -1.5, z: 7.2, h: 0.3, r: 2.2 },
  ],
}

/** The spec a piece's Island reports: its seed, its rough size and its depth. */
export function pieceSpec(id: PieceId): IslandSpec {
  if (id === 'main') return MAIN_SPEC
  const p = PIECES[id]
  return { seed: Math.floor(hash01(`piece:${id}`) * 1e6), radius: meanRadius(p.outline), hills: 0, depth: p.depth }
}

/** How deep a procedural stand-in's cliffs go (MAIN's are 1.25). */
const FALLBACK_DEPTH = 1.6

/** How far out from the farm's rim a stand-in docked above the farm (the highland) climbs to its own level. */
const SEAM_RAMP = 6

const smooth01 = (t: number) => {
  const u = Math.min(1, Math.max(0, t))
  return u * u * (3 - 2 * u)
}

/**
 * The procedural stand-in for a piece: MAIN as makeIsland always drew it,
 * the others flat-topped and cut to their blueprint outline. makeIsland's rim
 * is at height 0, as MAIN's is, so a piece docked at the farm's level meets it
 * without a step. One docked higher (the highland, 3 u up) is eased down to
 * the farm's level along their seam, so it does too.
 */
export function fallbackIsland(id: PieceId): Island {
  if (id === 'main') return makeIsland(MAIN_SPEC)
  const p = PIECES[id]
  // Not as deep as the baked piece: makeIsland's cliffs taper to a single spike.
  const island = makeIsland({ ...pieceSpec(id), depth: Math.min(p.depth, FALLBACK_DEPTH), flatCenter: 0.9, shape: polygonOutline(p.outline), segments: p.outline.length })
  return p.dockedPosition[1] === 0 ? island : easedToFarm(island, id)
}

/** A stand-in docked above (or below) the farm, its ground and mesh brought to the farm's level along their seam. */
function easedToFarm(island: Island, id: Exclude<PieceId, 'main'>): Island {
  const [px, py, pz] = PIECES[id].dockedPosition
  const mainRim = polygonOutline(PIECES.main.outline)
  // How far a local point is lowered: all the way at the farm's rim, none SEAM_RAMP out from it.
  const ease = (x: number, z: number) => {
    const wx = px + x
    const wz = pz + z
    return -py * (1 - smooth01((Math.hypot(wx, wz) - mainRim(Math.atan2(wz, wx))) / SEAM_RAMP))
  }
  const position = island.geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) position.setY(i, position.getY(i) + ease(position.getX(i), position.getZ(i)))
  position.needsUpdate = true
  island.geometry.computeVertexNormals()
  island.geometry.computeBoundingSphere()
  return { ...island, height: (x, z) => island.height(x, z) + ease(x, z) }
}

/** A piece's Island from its baked mesh and height grid, and its cliff skirts if it has any. */
export function bakedIsland(id: PieceId, geometry: THREE.BufferGeometry, grid: HeightGrid, skirts: THREE.Group | null = null): Island {
  geometry.userData.baked = true
  geometry.userData.islandId = id
  const spec = pieceSpec(id)
  return {
    spec,
    geometry,
    height: groundFrom((x, z) => sampleGrid(grid, x, z)),
    outline: polygonOutline(PIECES[id].outline),
    random: rng(spec.seed),
    skirts,
  }
}

/**
 * An Island that can change what it is: the procedural stand-in until the
 * baked piece is handed to it. Nothing is drawn on a piece until it has
 * loaded, failed or run out of time (see pieceLoader.ts), so nothing placed
 * on it ever moves. Everything reads it through the same object (MAIN and ISLES in
 * layout.ts), so code written for the procedural islands keeps working.
 */
export interface DockedIsland extends Island {
  readonly source: 'procedural' | 'baked'
  use(island: Island | null): void
}

export function swappable(make: () => Island): DockedIsland {
  let fallback: Island | null = null
  let baked: Island | null = null
  const current = () => baked ?? (fallback ??= make())
  return {
    get spec() {
      return current().spec
    },
    get geometry() {
      return current().geometry
    },
    get skirts() {
      return current().skirts ?? null
    },
    height: (x, z) => current().height(x, z),
    outline: (theta) => current().outline(theta),
    random: () => current().random(),
    get source() {
      return baked ? 'baked' : 'procedural'
    },
    use(island) {
      baked = island
    },
  }
}
