import { isOn } from '../game/features'
import type { GameState } from '../game/state'
import { cottageStage } from '../game/systems/cottage'
import { orchardVisible } from '../game/systems/gitEvents'
import { PIECES, type DockId } from './blueprint'
import type { IsleId } from './layout'

// Framing the farm. The camera always looks at the same point from the same
// direction (before the player turns it), so how far back it sits is a pure
// function of which pieces are there, which are rising, and the window's
// shape. By default it frames the farm (defaultFrame); while a piece rises it
// eases out to show it (riseFrame).

/** Which neighbouring isles are in the world right now. Isles of switched-off features aren't (see features.ts). */
export function visibleIsles(s: GameState): IsleId[] {
  const shown: Record<IsleId, boolean> = {
    meadow: s.owned.meadow > 0,
    grove: s.owned.grove > 0,
    islet: s.owned.islet > 0,
    wetland: isOn('wildIsles') && s.owned.wetland > 0,
    highland: isOn('wildIsles') && s.owned.highland > 0,
    // Bought as land, or brought by the repo orchard and the retirement cottage.
    orchard: (isOn('ringIsles') && s.owned.orchardLand > 0) || (isOn('gitEvents') && orchardVisible(s)),
    cottage: (isOn('ringIsles') && s.owned.cottageLand > 0) || (isOn('cottage') && cottageStage(s) >= 1),
  }
  return (Object.keys(shown) as IsleId[]).filter((id) => shown[id])
}

type V3 = readonly [number, number, number]

export const VIEW = {
  target: [0, -0.6, 0] as V3,
  /** From the target towards the camera. */
  dir: [1, 0.78, 1] as V3,
  halfFov: (15 * Math.PI) / 180,
}

export interface FrameIsle {
  pos: V3
  radius: number
  /** The island's cliff depth scale. */
  depth: number
  /** The points to keep on screen, if not a ring around its middle, its tip and its tallest props. */
  points?: readonly V3[]
}

/** Room the main island alone needs, in world units (it sets the closest view). */
const MAIN = { width: 27, height: 19 }
/** Fractions of the view a neighbouring isle may reach into, leaving room for the HUD. */
const FILL = { vertical: 0.72, horizontal: 0.86 }
/** A neighbour counts as framed once this much of it, around its middle, is in view. */
const KEEP = 0.2
const MAX_DISTANCE = 130

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const unit = (v: V3): V3 => {
  const n = Math.hypot(...v)
  return [v[0] / n, v[1] / n, v[2] / n]
}

const FORWARD = unit(VIEW.dir)
const RIGHT = unit([FORWARD[2], 0, -FORWARD[0]])
const UP = unit([-FORWARD[0] * FORWARD[1], 1 - FORWARD[1] * FORWARD[1], -FORWARD[2] * FORWARD[1]])

/** Points that should be on screen for a neighbouring isle: a ring around its middle, its tip and its tallest props. */
function framePoints({ pos, radius, depth, points: given }: FrameIsle): readonly V3[] {
  if (given) return given
  const r = radius * KEEP
  const points: V3[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    points.push([pos[0] + Math.cos(a) * r, pos[1], pos[2] + Math.sin(a) * r])
  }
  points.push([pos[0], pos[1] - 5.5 * depth * KEEP, pos[2]], [pos[0], pos[1] + 2.5 * KEEP, pos[2]])
  return points
}

/** How far back the camera must be for every point to be inside the given fractions of the view. */
function distanceFor(points: Iterable<V3>, aspect: number, fill: { vertical: number; horizontal: number }): number {
  const tan = Math.tan(VIEW.halfFov)
  const tanV = tan * fill.vertical
  const tanH = tan * aspect * fill.horizontal
  let need = 0
  for (const p of points) {
    const c: V3 = [p[0] - VIEW.target[0], p[1] - VIEW.target[1], p[2] - VIEW.target[2]]
    // A point this far towards the camera needs the camera that much further back.
    const toward = dot(c, FORWARD)
    need = Math.max(need, toward + Math.abs(dot(c, RIGHT)) / tanH, toward + Math.abs(dot(c, UP)) / tanV)
  }
  return need
}

/** How far back the camera sits to frame the main island plus the given neighbours. */
export function frameDistance(neighbours: readonly FrameIsle[], aspect: number): number {
  const tan = Math.tan(VIEW.halfFov)
  const base = Math.max(30 + neighbours.length * 3, (MAIN.width / (2 * tan * aspect)) * 0.95, MAIN.height / (2 * tan))
  const need = distanceFor(
    neighbours.flatMap((isle) => framePoints(isle)),
    aspect,
    FILL,
  )
  return Math.min(MAX_DISTANCE, Math.max(base, need))
}

/** A screen at least as wide as it is tall: the view frames the farm alone, and docked pieces show round its edges. */
const wide = (aspect: number) => aspect >= 1

/**
 * How far back the camera sits by default. On a wide screen it frames the
 * farm (MAIN, about 27 u across) whatever has docked: the docked pieces show
 * round the edges, and the player zooms out to see the whole island. On a
 * phone held upright, where the farm alone already needs the camera well
 * back, it frames the farm and the middle of every docked piece.
 */
export function defaultFrame(docked: readonly DockId[], aspect: number): number {
  return frameDistance(wide(aspect) ? [] : docked.map(pieceFrame), aspect)
}

/**
 * How far back the camera eases while pieces rise into place: far enough to
 * show the farm and each rising piece's middle, so the rise is seen. Once
 * they have docked it settles back to `defaultFrame`.
 */
export function riseFrame(docked: readonly DockId[], rising: readonly DockId[], aspect: number): number {
  return frameDistance([...(wide(aspect) ? [] : docked), ...rising].map(pieceFrame), aspect)
}

/**
 * A docked piece as the camera frames it: its ground around its middle, like
 * any neighbour, and the props standing there. Not its underside, which hangs
 * far down into the clouds. The farm stays the focus; a piece reaching far out
 * (the islet's headland, say) runs on past the edge of the view until the
 * player zooms out.
 */
export function pieceFrame(id: DockId): FrameIsle {
  const p = PIECES[id]
  const pos = p.dockedPosition
  const radius = meanRadius(p.outline)
  const r = radius * KEEP
  const points: V3[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    points.push([pos[0] + Math.cos(a) * r, pos[1], pos[2] + Math.sin(a) * r])
  }
  points.push([pos[0], pos[1] + 2.5 * KEEP, pos[2]])
  return { pos, radius, depth: p.depth, points }
}

const meanRadius = (outline: readonly (readonly [number, number])[]) => outline.reduce((sum, [x, z]) => sum + Math.hypot(x, z), 0) / outline.length

/** How far from the farm's middle shadows must reach to cover a docked piece's middle, where its things stand. */
export function shadowReachOf(id: DockId): number {
  const [x, , z] = PIECES[id].dockedPosition
  return Math.min(26, Math.hypot(x, z) + meanRadius(PIECES[id].outline) * 0.4)
}

/** The furthest the view goes when zoomed out, whatever the island's size. */
const OVERVIEW_LIMIT = 400

/**
 * How far back the camera must be to see the whole island as it is now, the
 * farm and every docked piece out to their coasts. The player can zoom out
 * this far: on a phone held upright that's well past the framing.
 */
export function overviewDistance(docked: readonly DockId[], aspect: number): number {
  const points: V3[] = []
  for (const id of ['main' as const, ...docked]) {
    const [px, py, pz] = PIECES[id].dockedPosition
    PIECES[id].outline.forEach(([x, z], i) => {
      if (i % 4 === 0) points.push([px + x, py, pz + z])
    })
  }
  return Math.min(OVERVIEW_LIMIT, distanceFor(points, aspect, { vertical: 0.9, horizontal: 0.94 }))
}
