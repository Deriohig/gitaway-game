import { describe, expect, it } from 'vitest'
import raw from '../../art/config/blueprint.pieces.json?raw'
import { DOCK_IDS, mainThetaRange, PIECES, type DockId } from './blueprint'
import { fallbackIsland, groundFrom, MAIN_SPEC, parseHeightGrid, polygonArea, polygonOutline, sampleGrid, swappable, type HeightGrid } from './pieces'
import { makeIsland } from './terrain'
import { bakedGrid } from './testing'

/** A 4 x 3 grid at 0.5 spacing from (-1, 2): height = x + 2z where it's on the top. */
function grid(holes: [number, number][] = []): HeightGrid {
  const nx = 4
  const nz = 3
  const data = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) data[j * nx + i] = -1 + i * 0.5 + 2 * (2 + j * 0.5)
  for (const [i, j] of holes) data[j * nx + i] = NaN
  return { origin: [-1, 2], spacing: 0.5, size: [nx, nz], data }
}

/** Evenly spaced θ along the farm's rim where `id` docks. */
function seamThetas(id: DockId, steps: number[]): number[] {
  const [from, to] = mainThetaRange(id)
  const span = (((to - from) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  return steps.map((k) => from + span * k)
}
const mainRim = polygonOutline(PIECES.main.outline)

describe('the height grid', () => {
  it.each([
    ['at its points', -1, 2, 3],
    ['at another point', 0, 2.5, 5],
    ['a plane exactly between points', -0.8, 2.1, -0.8 + 4.2],
    ['a plane exactly between points', -0.25, 2.75, -0.25 + 5.5],
    ['a plane exactly between points', 0.49, 2.99, 0.49 + 5.98],
    ['its far edges, exactly', 0.5, 3, 6.5],
    ['its far edges, exactly', 0.5, 2.75, 6],
    ['its far edges, exactly', -0.2, 3, 5.8],
  ])('reads %s', (_, x, z, h) => {
    expect(sampleGrid(grid(), x, z)).toBeCloseTo(h, 5)
  })

  it.each([[-1.01, 2.5], [0, 1.9], [0.6, 2.5]])('is NaN outside the grid at (%s, %s)', (x, z) => {
    expect(sampleGrid(grid(), x, z)).toBeNaN()
  })

  it('leaves out corners off the top and weights the others up', () => {
    // With the corner at (3, 1) gone, a point near it takes the other three.
    const [x, z] = [0.4, 2.4]
    const u = x / 0.5
    const v = (z - 2) / 0.5
    const w = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v]
    const h = [4, 4.5, 5]
    expect(sampleGrid(grid([[3, 1]]), x, z)).toBeCloseTo((w[0] * h[0] + w[1] * h[1] + w[2] * h[2]) / (w[0] + w[1] + w[2]), 5)
  })

  it('is NaN off the top: every corner gone, or right on a point that is; a number next to the hole', () => {
    const g = grid([[0, 0], [1, 0], [0, 1], [1, 1]])
    expect(sampleGrid(g, -0.75, 2.25)).toBeNaN()
    expect(sampleGrid(g, -1, 2)).toBeNaN()
    expect(sampleGrid(g, 0.25, 2.25)).toBeCloseTo(0.25 + 4.5, 5)
  })

  it('reads a grid file of little-endian floats, and refuses one of the wrong size', () => {
    const buffer = new ArrayBuffer(4 * 3 * 4)
    const view = new DataView(buffer)
    for (let i = 0; i < 12; i++) view.setFloat32(i * 4, i === 5 ? NaN : i / 4, true)
    const g = parseHeightGrid({ file: 'piece_test.height.bin', origin: [-1, 2], spacing: 0.5, size: [4, 3] }, buffer)
    expect(g.data[3]).toBe(0.75)
    expect(g.data[5]).toBeNaN()
    expect(sampleGrid(g, -1 + 0.5 * 3, 2)).toBe(0.75)
    expect(() => parseHeightGrid({ file: 'short.bin', origin: [0, 0], spacing: 0.25, size: [5, 3] }, buffer)).toThrow(/short\.bin/)
  })

  it('stands things just past the rim on the rim, never on NaN', () => {
    const g = grid()
    const ground = groundFrom((x, z) => sampleGrid(g, x, z))
    expect(Number.isFinite(ground(0.3, 3.4))).toBe(true)
    expect(ground(-0.5, 2.5)).toBeCloseTo(4.5)
    expect(ground(50, 50)).toBe(0) // nowhere near any ground at all: 0, not NaN
  })
})

describe('the outline', () => {
  it('is the distance to a polygon around the origin in each direction, for any turn of θ', () => {
    const square = polygonOutline([[1, -1], [1, 1], [-1, 1], [-1, -1]]) // 2 across, from an arbitrary corner
    for (const [theta, r] of [[0, 1], [Math.PI / 4, Math.SQRT2], [Math.PI / 2, 1], [Math.PI, 1], [-Math.PI / 2, 1], [Math.atan2(0.5, 1), Math.hypot(1, 0.5)], [Math.PI / 4 + Math.PI * 6, Math.SQRT2]]) {
      expect(square(theta)).toBeCloseTo(r)
    }
    expect(square(-Math.PI * 4 + 0.3)).toBeCloseTo(square(0.3))
    expect(polygonArea([[1, -1], [1, 1], [-1, 1], [-1, -1]])).toBeCloseTo(4)
  })

  it('handles a polygon whose points straddle θ = ±π', () => {
    const hexagon = Array.from({ length: 6 }, (_, i) => [2 * Math.cos(Math.PI - 0.2 + (i * Math.PI) / 3), 2 * Math.sin(Math.PI - 0.2 + (i * Math.PI) / 3)] as [number, number])
    const r = polygonOutline(hexagon)
    for (const p of hexagon) expect(r(Math.atan2(p[1], p[0]))).toBeCloseTo(2)
    expect(r(Math.PI)).toBeGreaterThan(Math.sqrt(3) - 1e-9)
    expect(r(Math.PI)).toBeLessThanOrEqual(2 + 1e-9)
  })

  it("follows the farm's own rim, as the blueprint cut the pieces round it", () => {
    const procedural = makeIsland(MAIN_SPEC)
    for (let i = 0; i < 360; i++) {
      const theta = (i / 360) * Math.PI * 2 - Math.PI
      expect(Math.abs(mainRim(theta) - procedural.outline(theta)), `θ ${theta.toFixed(2)}`).toBeLessThan(0.01)
    }
  })
})

describe('the baked pieces', () => {
  it('meet the farm’s baked rim along their seams with no step and no gap, the highland’s too, docked 3 u up', () => {
    const farm = bakedGrid('main')
    for (const id of DOCK_IDS) {
      const piece = bakedGrid(id)
      const [px, py, pz] = PIECES[id].dockedPosition
      for (const theta of seamThetas(id, Array.from({ length: 19 }, (_, k) => (k + 1) / 20))) {
        const r = mainRim(theta)
        const at = (d: number): [number, number] => [Math.cos(theta) * (r + d), Math.sin(theta) * (r + d)]
        const where = `${id} at θ ${theta.toFixed(2)}`
        const [x, z] = at(0.05)
        expect(Number.isNaN(py + sampleGrid(piece, x - px, z - pz)), where).toBe(false) // the top starts right at the rim
        const [x2, z2] = at(0.15)
        expect(Math.abs(py + sampleGrid(piece, x2 - px, z2 - pz) - sampleGrid(farm, ...at(-0.15))), where).toBeLessThan(0.08)
      }
    }
  })

  it('meet each neighbour along their shared seam with no step and no gap, the glade and the orchard too', () => {
    const seamsOf = (JSON.parse(raw) as { pieces: Record<DockId, { seams?: { with: DockId; world: [number, number][] }[] }> }).pieces
    const grids = new Map(DOCK_IDS.map((id) => [id, bakedGrid(id)]))
    const ground = (id: DockId, [x, z]: [number, number]) => {
      const [px, py, pz] = PIECES[id].dockedPosition
      return py + sampleGrid(grids.get(id)!, x - px, z - pz)
    }
    const met: string[] = []
    for (const id of DOCK_IDS) {
      for (const { with: other, world } of seamsOf[id].seams ?? []) {
        met.push(`${id}/${other}`)
        for (let i = 1; i < world.length; i += 3) {
          const where = `${id}/${other} at ${world[i].map((v) => v.toFixed(1))}`
          const [mine, theirs] = [ground(id, world[i]), ground(other, world[i])]
          expect([Number.isNaN(mine), Number.isNaN(theirs)], where).toEqual([false, false])
          expect(Math.abs(mine - theirs), where).toBeLessThan(0.08)
        }
      }
    }
    // Every piece meets both its neighbours: seven seams, each seen from both sides.
    expect(met.length).toBe(14)
    for (const pair of ['wetland/cottage', 'cottage/highland', 'highland/orchard', 'orchard/grove']) expect(met).toContain(pair)
  })
})

describe('procedural stand-ins', () => {
  it('cut each piece to its blueprint outline, flat and at height 0 where it meets the farm', () => {
    for (const id of ['meadow', 'grove', 'islet'] as const) {
      const island = fallbackIsland(id)
      const rim = polygonOutline(PIECES[id].outline)
      for (const theta of [0, 1, 2, 3, 4, 5, 6]) expect(island.outline(theta)).toBeCloseTo(rim(theta))
      expect(island.height(0, 0)).toBeCloseTo(0)
      expect(island.spec.depth).toBeLessThanOrEqual(PIECES[id].depth)
    }
  })

  it('meet the farm’s rim at the farm’s height, so they dock without a step, even the highland docked 3 u up', () => {
    const farm = makeIsland(MAIN_SPEC)
    expect(PIECES.highland.dockedPosition[1]).toBe(3)
    for (const id of DOCK_IDS) {
      const island = fallbackIsland(id)
      const [px, py, pz] = PIECES[id].dockedPosition
      for (const theta of seamThetas(id, [0.2, 0.35, 0.5, 0.65, 0.8])) {
        const r = mainRim(theta) + 0.05 // just past the farm's rim: the piece's side of the seam
        const step = py + island.height(Math.cos(theta) * r - px, Math.sin(theta) * r - pz) - farm.height(Math.cos(theta) * (r - 0.1), Math.sin(theta) * (r - 0.1))
        expect(Math.abs(step), `${id} at θ ${theta.toFixed(2)}`).toBeLessThan(0.15)
      }
    }
  })

  it('swap for the baked piece when it arrives, everywhere at once', () => {
    let made = 0
    const island = swappable(() => {
      made++
      return makeIsland({ seed: 1, radius: 3, hills: 0.3, depth: 0.5 })
    })
    expect(made).toBe(0) // nothing is built until it's needed
    expect(island.source).toBe('procedural')
    const procedural = island.height(0.5, 0.5)
    expect(made).toBe(1)
    const baked = makeIsland({ seed: 2, radius: 3, hills: 0, depth: 0.5 })
    island.use(baked)
    expect(island.source).toBe('baked')
    expect(island.geometry).toBe(baked.geometry)
    expect(island.height(0.5, 0.5)).toBe(baked.height(0.5, 0.5))
    island.use(null)
    expect(island.height(0.5, 0.5)).toBe(procedural)
  })
})
