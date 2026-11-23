/// <reference types="node" />
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { CROP_IDS } from '../game/config'
import { CROP_Y, SPARKLE, sparkleY, WET_BED } from './gardenHeights'
import { GARDEN } from './layout'
import { glbMeshes, vertices } from './testing'

// The garden's plots against the art's models in public/models, measured in a plot's own frame (y 0 its foot).

/** The top of a model, in its own frame. */
const topOf = (name: string) => Math.max(...glbMeshes(`public/models/${name}.glb`).flatMap(vertices).map((v) => v.y))

it.each(CROP_IDS)('floats the sparkle clear over the ripe %s: never inside it, and not far above it', (crop) => {
  const top = CROP_Y + topOf(`crop_${crop}_3`)
  const lowest = sparkleY(crop) - SPARKLE.bob - SPARKLE.half // the sparkle's foot at the bottom of its bob
  const say = `the sparkle's foot at ${lowest.toFixed(3)}, the ripe ${crop}'s top at ${top.toFixed(3)}`
  expect(lowest - top, say).toBeGreaterThan(0.04)
  expect(lowest - top, say).toBeLessThan(0.2)
})

describe('the water of a cranberry bed', () => {
  const plot = glbMeshes('public/models/plot.glb')
  const down = new THREE.Raycaster()
  const DOWN = new THREE.Vector3(0, -1, 0)
  const surfaceAt = (x: number, z: number) => {
    down.set(new THREE.Vector3(x, 1, z), DOWN)
    return down.intersectObjects(plot)[0]?.point.y
  }
  const [rx, rz] = WET_BED.radius
  // The soil under the water, over a fine grid of its oval (a hair off the grid's lines, so no ray runs down an edge).
  const under: number[] = []
  for (let i = -24; i <= 24; i++) {
    for (let j = -24; j <= 24; j++) {
      const x = (i / 24) * rx + 0.0013
      const z = (j / 24) * rz + 0.0007
      if ((x / rx) ** 2 + (z / rz) ** 2 > 1) continue
      const y = surfaceAt(x, z)
      if (y !== undefined) under.push(y)
    }
  }
  const crests = Math.max(...under)
  const surface = CROP_Y + WET_BED.top
  const underside = surface - WET_BED.depth

  it('lies over the plot’s furrows as a shallow sheet, clear above their crests, and stays inside the boards', () => {
    expect(under.length).toBeGreaterThan(1500)
    expect(crests - Math.min(...under)).toBeGreaterThan(0.02) // troughs and crests
    const say = `water ${underside.toFixed(4)} to ${surface.toFixed(4)}, the crests at ${crests.toFixed(4)}`
    expect(surface - crests, say).toBeGreaterThan(0.005) // none pokes through it or flickers against it
    expect(underside - crests, say).toBeGreaterThan(0)
    expect(surface - crests).toBeLessThan(0.015) // not a slab standing on the bed
    expect(Math.max(rx, rz)).toBeLessThanOrEqual(GARDEN.plot / 2 - 0.03)
  })
})
