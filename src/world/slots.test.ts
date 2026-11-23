import { describe, expect, it } from 'vitest'
import { withFeatures } from '../game/testing'
import { MAIN } from './layout'
import { placeable, RIM_CLEARANCE, slotFor } from './slots'

// Moving and recolouring things is the island studio's. A save can hold placements and tints (from a later version, or
// a studio switched off again), and they must do nothing while the studio switch is off. A moved thing stands on the
// farm's own piece, clear of its rim and so of every seam.

const saved = { placements: { 'bench#0': { x: 1, z: 2, rot: 3 } }, tints: { 'bench#0': 4 } }

it('stands things in their own slots while the studio is off or when nothing was saved, and where the studio put them, in its colours, once it is on', () => {
  withFeatures({ studio: false }, () => expect(slotFor(saved, 'bench#0', [5, 6], 0.5)).toEqual({ x: 5, z: 6, rot: 0.5, tint: null }))
  withFeatures({ studio: true }, () => {
    expect(slotFor(saved, 'bench#0', [5, 6], 0.5)).toEqual({ x: 1, z: 2, rot: 3, tint: 4 })
    expect(slotFor(saved, 'well#0', [5, 6])).toEqual({ x: 5, z: 6, rot: 0, tint: null })
  })
})

describe('where a moved thing may stand', () => {
  /** A point `inside` units in from the farm's rim, in direction θ. */
  const fromRim = (theta: number, inside: number): [number, number] => {
    const r = MAIN.outline(theta) - inside
    return [Math.cos(theta) * r, Math.sin(theta) * r]
  }

  it('is on the farm’s own piece, at least 0.6 in from its rim, all the way round', () => {
    expect(RIM_CLEARANCE).toBe(0.6)
    for (let i = 0; i < 24; i++) {
      const theta = (i / 24) * Math.PI * 2 - Math.PI
      expect(placeable(...fromRim(theta, 0.65)), `θ ${theta.toFixed(2)}, 0.65 in`).toBe(true)
      expect(placeable(...fromRim(theta, 0.55)), `θ ${theta.toFixed(2)}, 0.55 in`).toBe(false)
      expect(placeable(...fromRim(theta, -1)), `θ ${theta.toFixed(2)}, past the rim`).toBe(false)
    }
    expect(placeable(0, 0)).toBe(true)
  })

  it('drops a saved spot within 0.6 of the rim, or out on a docked piece, and keeps the thing in its slot (the tint is kept)', () => {
    withFeatures({ studio: true }, () => {
      const save = ([x, z]: [number, number]) => ({ placements: { 'bench#0': { x, z, rot: 1 } }, tints: { 'bench#0': 2 } })
      const wellIn = fromRim(0.8, 1.5)
      expect(slotFor(save(fromRim(0.8, 0.4)), 'bench#0', [5, 6], 0.5)).toEqual({ x: 5, z: 6, rot: 0.5, tint: 2 })
      expect(slotFor(save([10.9, 11.7]), 'bench#0', [5, 6], 0.5)).toEqual({ x: 5, z: 6, rot: 0.5, tint: 2 }) // on the meadow
      expect(slotFor(save(wellIn), 'bench#0', [5, 6], 0.5)).toEqual({ x: wellIn[0], z: wellIn[1], rot: 1, tint: 2 })
    })
  })
})
