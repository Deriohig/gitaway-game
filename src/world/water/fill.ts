import type { FillPart, WaterBody, WaterFillFrom } from './types'

// When each body of water is drawn (spec §3.5), from water.json's `fillFrom`:
// the flowing water starts when the wetland docks. The farm fall retreats over
// its second, and the wetland's river fills from the farm's seam, then the
// outflow, then the wetland's fall, each after the one before. The still water
// has no fill: it rises with its piece. Plain functions, read by the driver
// (driver.ts registerWaterBodies), which times them from the dock.

/**
 * One body's part in the flow, in seconds from the dock: it fills `in` (drawn
 * from its top down to its end, the shader's fill front) or goes `out` (the
 * farm fall's retreat), from `start` over `seconds`.
 */
export type FillStep = { dir: 'in' | 'out'; start: number; seconds: number }

/** A piece's fills, by node: null for a body drawn whatever the dock (it has no `fillFrom`). */
export type FillPlan = Record<string, FillStep | null>

/**
 * How far (u) the farm fall slides down as it retreats (I5). Water-core's fill
 * front only grows from the top, so it can't empty a fall from the top down:
 * the game slides the sheet down while it fades out instead, then hides it.
 */
export const RETREAT_DROP = 2

/** The dock, as a fill's `after`: the moment the wetland docked. */
const DOCK = 'dock'

const usable = (seconds: unknown): seconds is number => typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0

/**
 * A piece's fills from water.json's bodies (`json.pieces[piece].bodies`), by
 * node:
 * - `{ shownWhile, retreat }` goes `out` from the dock over `retreat`;
 * - `{ after: 'dock', seconds }` comes `in` from the dock over `seconds`;
 * - `{ after: <node>, seconds }` comes `in` once that body's step is done
 *   (its start plus its seconds), over `seconds`;
 * - no `fillFrom` is null.
 *
 * Throws, naming the body, for a fill after a body the piece hasn't (or one
 * with no fill), for fills that wait on each other, and for a fill it can't
 * read; load.ts reads the plan as the piece loads, so such a water.json keeps
 * today's water.
 */
export function fillPlan(bodies: readonly WaterBody[]): FillPlan {
  const listed = new Map(bodies.map((b) => [b.node, b]))
  const plan: FillPlan = {}
  // the bodies whose step is being read, in the order they wait on each other
  const reading: string[] = []

  const stepOf = (body: WaterBody): FillStep | null => {
    if (Object.hasOwn(plan, body.node)) return plan[body.node]
    if (reading.includes(body.node)) throw new Error(`water.json's fills wait on each other: ${[...reading, body.node].join(' after ')}`)
    reading.push(body.node)
    const step = read(body.node, body.fillFrom)
    reading.pop()
    return (plan[body.node] = step)
  }

  const read = (node: string, from: WaterFillFrom | null | undefined): FillStep | null => {
    if (!from) return null
    const { after, shownWhile, retreat, seconds } = from
    if (after === undefined && shownWhile !== undefined && usable(retreat)) return { dir: 'out', start: 0, seconds: retreat }
    if (after === DOCK && usable(seconds)) return { dir: 'in', start: 0, seconds }
    if (typeof after === 'string' && after !== DOCK && usable(seconds)) {
      const before = listed.get(after)
      if (!before) throw new Error(`${node} fills after ${after}, which water.json doesn't list with it`)
      const prior = stepOf(before)
      if (!prior) throw new Error(`${node} fills after ${after}, which has no fill of its own`)
      return { dir: 'in', start: prior.start + prior.seconds, seconds }
    }
    throw new Error(`${node}'s fill can't be read: ${JSON.stringify(from)}`)
  }

  for (const body of bodies) stepOf(body)
  return plan
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** One part's fill `sinceDock` seconds after the dock: null (not docked) has nothing in and all out, and a body with no step is full. */
function partFill(step: FillStep | null, sinceDock: number | null): number {
  if (!step) return 1
  if (sinceDock === null) return step.dir === 'in' ? 0 : 1
  const done = step.seconds > 0 ? clamp01((sinceDock - step.start) / step.seconds) : sinceDock >= step.start ? 1 : 0
  return step.dir === 'in' ? done : 1 - done
}

/**
 * A drawn body's fill (its `uFill`, or for a retreat its opacity) `sinceDock`
 * seconds after the wetland docked, or null while it isn't docked (Infinity
 * for long ago: everything in place). One part's fill is its own. A body of
 * several parts (the wetland's river and outflow, one ribbon) fills by their
 * lengths: its parts run on end to end, so the share of its length filled is
 * where its fill front stands. A body whose parts have no length (a still
 * body's one part) takes their plain mean.
 */
export function bodyFill(parts: readonly FillPart[], plan: FillPlan, sinceDock: number | null): number {
  const fillOf = ({ node }: FillPart) => partFill(Object.hasOwn(plan, node) ? plan[node] : null, sinceDock)
  if (parts.length === 0) return 1
  if (parts.length === 1) return fillOf(parts[0])
  let length = 0
  let filled = 0
  for (const part of parts) {
    length += part.length
    filled += part.length * fillOf(part)
  }
  return length > 0 ? filled / length : parts.reduce((sum, part) => sum + fillOf(part), 0) / parts.length
}
