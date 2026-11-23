import { isOn } from '../game/features'
import { BLUEPRINT_DATA } from './blueprint.data'

// The island blueprint (art/BLUEPRINT.md): the world is one island cut into
// eight pieces. The centre piece is MAIN, the farm; each of the other seven is
// unlocked in play, rises out of the cloud sea and docks against MAIN's rim
// with no step and no gap, so that, fully unlocked, it is one round island
// about 55 u across. This module reads the pieces' data (blueprint.data.ts,
// copied from the art session's JSON by scripts/blueprint.mjs).
//
// θ is Math.atan2(z, x), as in terrain.ts. A piece's own coordinates ("local")
// are around its docked position, at its flat ground's level.

type XZ = [number, number]
type V3 = [number, number, number]

export type PieceId = 'main' | 'meadow' | 'wetland' | 'cottage' | 'highland' | 'orchard' | 'grove' | 'islet'
/** The pieces that dock against MAIN: every piece but MAIN itself. */
export type DockId = Exclude<PieceId, 'main'>

/** A labelled spot on a piece kept clear and level for something (a building, animals, a spot). */
export interface FlatZone {
  id: string
  kind: 'core' | 'building' | 'restoration' | 'animals' | 'spot' | (string & {})
  /** Local x, z. */
  at: XZ
  r: number
  flat: boolean
  /** Ground height there, local. */
  level: number
}

/** A point on a piece's open coast, facing out over the cloud sea. */
export interface CoastAnchor {
  id: string
  /** Local x, z. */
  at: XZ
  /** Unit x, z pointing out to sea. */
  outward?: XZ
  /** Ground height there, local; for a jetty, the water's level it stands at. */
  y?: number
  /** Ground beside it kept clear for a small shed later: local x, z and its radius. */
  shedPatch?: { at: XZ; r: number }
}

export interface PieceData {
  id: PieceId
  /** Where the piece's own origin sits in the world once docked. */
  dockedPosition: V3
  /** Its cliff depth scale: the underside reaches about 5.5 × this below its ground. */
  depth: number
  /** Its rim, local x, z, counter-clockwise around its origin. */
  outline: XZ[]
  /** The stretch of MAIN's rim it docks along, in degrees, counter-clockwise from the first to the second (null for MAIN). */
  mainTheta: [number, number] | null
  flatZones: FlatZone[]
  anchors: CoastAnchor[]
  /** Lakes, rivers and waterfalls, in world x, z and y (the game draws them). */
  water: Record<string, unknown> | null
}

export interface BlueprintData {
  format: string
  order: PieceId[]
  pieces: Record<PieceId, PieceData>
}

export const BLUEPRINT: BlueprintData = BLUEPRINT_DATA
export const PIECES = BLUEPRINT.pieces

/** The pieces that dock against MAIN, in the blueprint's order (counter-clockwise from the near side). */
export const DOCK_IDS = BLUEPRINT.order.filter((id): id is DockId => id !== 'main')

/** A piece's labelled flat zone. */
export function zone(id: PieceId, zoneId: string): FlatZone {
  const z = PIECES[id].flatZones.find((f) => f.id === zoneId)
  if (!z) throw new Error(`The ${id} piece has no flat zone "${zoneId}"`)
  return z
}

/** A piece's coast anchor. */
export function anchor(id: PieceId, anchorId: string): CoastAnchor {
  const a = PIECES[id].anchors.find((f) => f.id === anchorId)
  if (!a) throw new Error(`The ${id} piece has no coast anchor "${anchorId}"`)
  return a
}

const TAU = Math.PI * 2
const DEG = Math.PI / 180

/** The stretch of MAIN's rim a piece docks along, in radians: [from, to], counter-clockwise (`to` may be less than `from` when it wraps past 0). */
export function mainThetaRange(id: DockId): [number, number] {
  const [a, b] = PIECES[id].mainTheta!
  return [a * DEG, b * DEG]
}

/** Whether θ (any turn) lies on a counter-clockwise stretch [from, to] of the rim. */
export function thetaIn(theta: number, [from, to]: readonly [number, number]): boolean {
  const t = (((theta - from) % TAU) + TAU) % TAU
  const span = (((to - from) % TAU) + TAU) % TAU
  return t <= span
}

/** Which of the given docked pieces covers MAIN's rim at θ, if any. */
export function dockedAt(theta: number, docked: readonly DockId[]): DockId | null {
  for (const id of docked) if (thetaIn(theta, mainThetaRange(id))) return id
  return null
}

/** The pieces whose feature is switched on (see features.ts), so they can appear in play: the farm loads these. */
export function piecesInPlay(): PieceId[] {
  const on: Record<PieceId, boolean> = {
    main: true,
    meadow: true,
    grove: true,
    islet: true,
    wetland: isOn('wildIsles'),
    highland: isOn('wildIsles'),
    // Plain land with the ring isles switched on, or with the repo orchard and the retirement cottage.
    orchard: isOn('ringIsles') || isOn('gitEvents'),
    cottage: isOn('ringIsles') || isOn('cottage'),
  }
  return BLUEPRINT.order.filter((id) => on[id])
}

/** A piece's docked position plus a local point: where that point is in the world. */
export function toWorld(id: PieceId, [x, z]: XZ, y = 0): V3 {
  const [px, py, pz] = PIECES[id].dockedPosition
  return [px + x, py + y, pz + z]
}
