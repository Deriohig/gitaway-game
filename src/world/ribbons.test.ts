import { describe, expect, it, vi } from 'vitest'
import raw from '../../art/config/composition.pieces.json?raw'
import type { PieceId } from './blueprint'
import { ISLET, ORCHARD } from './isleSpots'
import { BEEHIVES, BENCH, BUSHES, FLOWERBEDS, FRUIT_TREES, LANTERNS, ROCKS, SCARECROW, STATIC_TREES, STONE_PATHS, type XZ } from './layout'

// The art's path ribbons (composition.pieces.json `paths`) and the farm's own slots: where a ribbon ran over a slot,
// the slot stands aside while the composition is drawn (the JSON's `conflicts`). With it switched off, every slot
// stands where it always has.

interface Run {
  id: string
  width: number
  widths?: number[]
  pts: XZ[]
}
interface Conflict {
  slotAt?: XZ
  resolution?: string
}
const json = JSON.parse(raw) as { pieces: Record<PieceId, { paths: Run[] }>; conflicts: { items: Conflict[] } }

/** The farm's slots by the names the JSON's resolutions give them. */
type Layout = typeof import('./layout')
const slotsOf = (l: Pick<Layout, 'FRUIT_TREES' | 'FLOWERBEDS' | 'LANTERNS' | 'BUSHES' | 'STATIC_TREES' | 'ROCKS' | 'BENCH'>): Record<string, XZ> => ({
  ...Object.fromEntries(l.FRUIT_TREES.map((p, i) => [`FRUIT_TREES[${i}]`, p])),
  ...Object.fromEntries(l.FLOWERBEDS.map((p, i) => [`FLOWERBEDS[${i}]`, p])),
  ...Object.fromEntries(l.LANTERNS.map((p, i) => [`LANTERNS[${i}]`, p])),
  ...Object.fromEntries(l.BUSHES.map((p, i) => [`BUSHES[${i}]`, p])),
  ...Object.fromEntries(l.STATIC_TREES.map((t, i) => [`STATIC_TREES[${i}]`, t.at])),
  ...Object.fromEntries(l.ROCKS.map((r, i) => [`ROCKS[${i}]`, r.at])),
  BENCH: [l.BENCH.x, l.BENCH.z],
})

/** The JSON's "game moves X to (x, z)" resolutions: the slot, where it stood and where it stands now. */
const MOVES = json.conflicts.items.flatMap((c) => {
  const m = /^game moves (\S+) to \((-?[\d.]+), (-?[\d.]+)\)$/.exec(c.resolution ?? '')
  return m ? [{ slot: m[1], was: c.slotAt!, now: [Number(m[2]), Number(m[3])] as XZ }] : []
})

const segment = ([px, pz]: XZ, [ax, az]: XZ, [bx, bz]: XZ) => {
  const dx = bx - ax
  const dz = bz - az
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)))
  return Math.hypot(px - ax - dx * t, pz - az - dz * t)
}

/** How far a disc reaches into a run's ribbon (its half width): positive where they overlap, as the JSON measures it. */
function overlap(run: Run, at: XZ, r: number): number {
  let most = -Infinity
  for (let i = 0; i < run.pts.length - 1; i++) {
    const half = Math.max(run.widths?.[i] ?? run.width, run.widths?.[i + 1] ?? run.width) / 2
    most = Math.max(most, half + r - segment(at, run.pts[i], run.pts[i + 1]))
  }
  return most
}

describe('the farm’s slots where the art’s ribbons run', () => {
  it('stand where the JSON says the game moves them, and end the stepping stones to the well where the run to the cottage starts', () => {
    expect(MOVES.length).toBeGreaterThanOrEqual(13)
    const slots = slotsOf({ FRUIT_TREES, FLOWERBEDS, LANTERNS, BUSHES, STATIC_TREES, ROCKS, BENCH })
    for (const { slot, now } of MOVES) expect(slots[slot], slot).toEqual(now)
    expect(STONE_PATHS[1][STONE_PATHS[1].length - 1]).toEqual(json.pieces.main.paths.find((r) => r.id === 'to_cottage')!.pts[0])
  })

  it('keep every slot off the farm’s ribbons (radii as the JSON measures them)', () => {
    const discs: [string, XZ, number][] = [
      ...FRUIT_TREES.map((p, i) => [`fruit tree ${i}`, p, 0.55] as [string, XZ, number]),
      ...FLOWERBEDS.map((p, i) => [`flower bed ${i}`, p, 0.6] as [string, XZ, number]),
      ...LANTERNS.map((p, i) => [`lantern ${i}`, p, 0.3] as [string, XZ, number]),
      ...BEEHIVES.map((p, i) => [`beehive ${i}`, p, 0.35] as [string, XZ, number]),
      ...BUSHES.map((p, i) => [`bush ${i}`, p, 0.45] as [string, XZ, number]),
      ...STATIC_TREES.map((t, i) => [`tree ${i}`, t.at, 0.3 + 0.2 * t.s] as [string, XZ, number]),
      ...ROCKS.map((r, i) => [`rock ${i}`, r.at, 0.4] as [string, XZ, number]),
      ['bench', [BENCH.x, BENCH.z], 0.6],
      ['scarecrow', SCARECROW, 0.4],
    ]
    for (const run of json.pieces.main.paths) for (const [what, at, r] of discs) expect(overlap(run, at, r), `${what} on ${run.id}`).toBeLessThanOrEqual(0)
  })

  it('keep the islet’s bush and rocks, and the orchard’s fruit trees, off the ribbons', () => {
    for (const run of json.pieces.islet.paths) {
      expect(overlap(run, ISLET.bush, 0.35), `bush on ${run.id}`).toBeLessThanOrEqual(0)
      ISLET.rocks.forEach((rock, i) => expect(overlap(run, rock.at, 0.4), `rock ${i} on ${run.id}`).toBeLessThanOrEqual(0))
    }
    expect(json.pieces.orchard.paths.length).toBe(3)
    for (const run of json.pieces.orchard.paths) {
      ORCHARD.rows.forEach((p, i) => expect(overlap(run, p, ORCHARD.treeClear), `fruit tree ${i} on ${run.id}`).toBeLessThanOrEqual(0))
    }
  })

  it('stand where they always have with the composition switched off', async () => {
    vi.resetModules()
    const { FEATURES } = await import('../game/features')
    FEATURES.composition = false
    const off = await import('./layout')
    const slots = slotsOf(off)
    for (const { slot, was } of MOVES) expect(slots[slot], slot).toEqual(was)
    expect(off.STONE_PATHS[1]).toEqual([[-4.6, -0.55], [-5.25, 0.05], [-5.65, 0.55]])
    expect((await import('./isleSpots')).ISLET.bush).toEqual([1.9, -0.6])
  })
})
