import { describe, expect, it } from 'vitest'
import waterRaw from '../../../public/models/water.json?raw'
import { bodyFill, fillPlan, RETREAT_DROP, type FillPlan } from './fill'
import type { FillPart, WaterBody, WaterJson } from './types'

// When each body of water is drawn (spec §3.5), read from the real water.json.

const json = JSON.parse(waterRaw) as WaterJson
const plan = (piece: keyof WaterJson['pieces']) => fillPlan(json.pieces[piece].bodies)
const listed = (piece: keyof WaterJson['pieces'], node: string) => json.pieces[piece].bodies.find((b) => b.node === node)!

/** The wetland's river and outflow as load.ts draws them: one ribbon with the two as its parts. */
function mergedRiver() {
  const river = listed('wetland', 'water_river')
  const outflow = listed('wetland', 'water_outflow')
  const parts: FillPart[] = [
    { node: river.node, length: river.length! },
    { node: outflow.node, length: outflow.length! },
  ]
  return { uStart: river.uStart!, length: river.length! + outflow.length!, parts }
}

describe('fillPlan', () => {
  it('reads the real water.json', () => {
    expect(plan('main')).toMatchObject({ water_fall: { dir: 'out', start: 0, seconds: 1 }, water_pond: null })
    expect(plan('wetland')).toMatchObject({
      water_river: { dir: 'in', start: 0, seconds: 2.5 },
      water_outflow: { dir: 'in', start: 2.5, seconds: 1 },
      water_fall: { dir: 'in', start: 3.5, seconds: 1 },
      water_lake: null,
    })
    expect(plan('highland')).toMatchObject({ water_tarn: null, water_spring: null })
  })

  it('reads a fill after a body listed later', () => {
    const bodies: WaterBody[] = [
      { node: 'b', kind: 'ribbon', fillFrom: { after: 'a', seconds: 2 } },
      { node: 'a', kind: 'ribbon', fillFrom: { after: 'dock', seconds: 3 } },
    ]
    expect(fillPlan(bodies)).toEqual({ a: { dir: 'in', start: 0, seconds: 3 }, b: { dir: 'in', start: 3, seconds: 2 } })
  })

  const ribbon = (node: string, fillFrom: WaterBody['fillFrom']): WaterBody => ({ node, kind: 'ribbon', fillFrom })
  it.each<[string, WaterBody[], RegExp]>([
    ['after a body it hasn’t', [ribbon('water_river', { after: 'dock', seconds: 2.5 }), ribbon('water_outflow', { after: 'water_rivr', seconds: 1 })], /water_outflow.*water_rivr/],
    ['fills that wait on each other', [ribbon('water_river', { after: 'water_fall', seconds: 2.5 }), ribbon('water_outflow', { after: 'water_river', seconds: 1 }), ribbon('water_fall', { after: 'water_outflow', seconds: 1 })], /water_river/],
    ['a fill after itself', [ribbon('loop', { after: 'loop', seconds: 1 })], /loop/],
    ['a fill it can’t read', [{ node: 'water_fall', kind: 'fall', fillFrom: { shownWhile: 'wetland undocked' } }], /water_fall/],
    ['a fill with no seconds', [ribbon('water_river', { after: 'dock' })], /water_river/],
    ['a negative fill', [ribbon('water_river', { after: 'dock', seconds: -1 })], /water_river/],
    ['a fill after a body that has none', [{ node: 'water_lake', kind: 'still' }, ribbon('water_river', { after: 'water_lake', seconds: 1 })], /water_river.*water_lake/],
  ])('throws, naming the bodies, for %s', (_n, bodies, re) => {
    expect(() => fillPlan(bodies)).toThrow(re)
  })
})

describe('bodyFill', () => {
  const wetland = plan('wetland')
  const main = plan('main')
  const part = (node: string, length = 1): FillPart[] => [{ node, length }]

  // The merged river's front runs the length of both parts (u - uStart < uFill x uLength): the river's, then the outflow's.
  it('runs the merged river’s front from the seam to the lake, then down the outflow', () => {
    const { parts } = mergedRiver()
    const at = (s: number) => bodyFill(parts, wetland, s)
    expect(at(0)).toBe(0)
    expect(at(1.25)).toBeCloseTo(0.32921, 4)
    expect(at(2.5)).toBeCloseTo(0.65842, 4)
    expect(at(3.0)).toBeCloseTo(0.82921, 4)
    expect(at(3.5)).toBe(1)
    expect(at(60)).toBe(1)
  })

  it('stands the merged river’s front where its filling part’s has got to', () => {
    const { uStart, length, parts } = mergedRiver()
    let from = uStart
    for (const { node, length: partLength } of parts) {
      expect(from, node).toBeCloseTo(listed('wetland', node).uStart!, 3)
      from += partLength
    }
    const [river, outflow] = parts
    expect(uStart + bodyFill(parts, wetland, 1.25) * length).toBeCloseTo(uStart + 0.5 * river.length, 3)
    expect(uStart + bodyFill(parts, wetland, 3.0) * length).toBeCloseTo(uStart + river.length + 0.5 * outflow.length, 3)
  })

  it('gives one part its own fill', () => {
    expect(bodyFill(part('water_fall', 10.6758), wetland, 4.0)).toBeCloseTo(0.5, 12)
    expect(bodyFill(part('water_fall', 10.6758), wetland, 3.4)).toBe(0)
    expect(bodyFill(part('water_fall', 10.6759), main, 0.25)).toBeCloseTo(0.75, 12)
  })

  it('fills a body with no fill (a still body’s one part has no length)', () => {
    for (const s of [null, 0, 2, Infinity]) {
      expect(bodyFill(part('water_lake', 0), wetland, s), String(s)).toBe(1)
      expect(bodyFill(part('water_pond', 0), main, s), String(s)).toBe(1)
    }
  })

  it('has nothing in and everything out before the dock, and the reverse long after it', () => {
    expect([null, Infinity].map((s) => [bodyFill(part('water_river'), wetland, s), bodyFill(part('water_fall'), main, s), bodyFill(mergedRiver().parts, wetland, s)])).toEqual([
      [0, 1, 0],
      [1, 0, 1],
    ])
  })

  it('takes a step of no seconds at once, and RETREAT_DROP is 2 u', () => {
    const now: FillPlan = { a: { dir: 'in', start: 1, seconds: 0 }, b: { dir: 'out', start: 0, seconds: 0 } }
    expect([bodyFill(part('a'), now, 0.5), bodyFill(part('a'), now, 1), bodyFill(part('b'), now, 0), bodyFill(part('b'), now, null)]).toEqual([0, 1, 0, 1])
    expect(RETREAT_DROP).toBe(2)
  })
})
