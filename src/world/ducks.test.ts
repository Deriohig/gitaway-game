import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import blueprintRaw from '../../art/config/blueprint.pieces.json?raw'
import { duckAt } from './ducks'
import { POND_SHORE, type XZ } from './layout'
import { fromOutline, glbMeshes, vertices } from './testing'

describe('ducks on the pond', () => {
  const duck = glbMeshes('public/models/duck.glb').flatMap(vertices)

  it('have a model that faces +Z, its head and beak forward', () => {
    const high = duck.filter((v) => v.y > 0.17) // the head is the part well above the waterline
    expect(high.length).toBeGreaterThan(20)
    expect(high.reduce((sum, v) => sum + v.z, 0) / high.length).toBeGreaterThan(0.05)
  })

  it.each([1, 2, 3, 4, 5, 6])('swim head first, whichever way round the pond they go (duck %i)', (seed) => {
    for (let time = 0; time < 120; time += 0.7) {
      const a = duckAt(seed, time)
      const b = duckAt(seed, time + 0.05)
      const way = new THREE.Vector2(b.x - a.x, b.z - a.z).normalize()
      const facing = new THREE.Vector2(Math.sin(a.heading), Math.cos(a.heading)) // rotation.y turns +Z towards +X
      expect(facing.dot(way), `at ${time.toFixed(1)} s`).toBeGreaterThan(0.9)
    }
  })

  it('pass each other without swimming through one another', () => {
    const width = Math.max(...duck.map((v) => Math.abs(v.x))) * 2 // two ducks side by side need their middles further apart
    expect(width).toBeGreaterThan(0.25)
    const seeds = [1, 2, 3, 4, 5]
    for (let time = 0; time < 600; time += 0.25) {
      const at = seeds.map((seed) => duckAt(seed, time))
      for (let a = 0; a < seeds.length; a++) {
        for (let b = a + 1; b < seeds.length; b++) {
          expect(Math.hypot(at[a].x - at[b].x, at[a].z - at[b].z), `ducks ${seeds[a]} and ${seeds[b]} at ${time} s`).toBeGreaterThan(width + 0.04)
        }
      }
    }
  })

  it('keep to the pond: well inside the art’s new shore, and on the pond drawn until the baked water ships', () => {
    const legacy = (JSON.parse(blueprintRaw) as { pieces: { main: { water: { pond: { legacy: { outline: XZ[] } } } } } }).pieces.main.water.pond.legacy.outline
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (let time = 0; time < 120; time += 1.3) {
        const { x, z } = duckAt(seed, time)
        expect(fromOutline([x, z], POND_SHORE), `duck ${seed} at ${time.toFixed(1)} s, from the new shore`).toBeLessThan(-0.5)
        expect(fromOutline([x, z], legacy), `duck ${seed} at ${time.toFixed(1)} s, from the pond drawn now`).toBeLessThan(-0.25)
      }
    }
  })
})
