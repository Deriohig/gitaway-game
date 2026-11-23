import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { beeAt, beeGeometry } from './bees'
import { glbMeshes, vertices } from './testing'

/** The relative luminance of a linear colour. */
const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

describe('the bees about a beehive', () => {
  it('read as bees, not dark dots: mostly golden, and big enough to see from the farm view', () => {
    const color = beeGeometry.getAttribute('color')
    const position = beeGeometry.getAttribute('position')
    let bright = 0 // each triangle's colour, weighed by its area
    let total = 0
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
    for (let i = 0; i < position.count; i += 3) {
      a.fromBufferAttribute(position, i)
      b.fromBufferAttribute(position, i + 1)
      c.fromBufferAttribute(position, i + 2)
      const area = new THREE.Triangle(a, b, c).getArea()
      total += area
      if (luminance(color.getX(i), color.getY(i), color.getZ(i)) > 0.3) bright += area
    }
    expect(bright / total).toBeGreaterThan(0.5)
    beeGeometry.computeBoundingBox()
    const size = beeGeometry.boundingBox!.getSize(new THREE.Vector3())
    expect(size.z).toBeGreaterThan(0.065)
    expect(size.x).toBeGreaterThan(0.05)
  })

  it('fly round the hive, never through it', () => {
    const hive = glbMeshes('public/models/beehive.glb').flatMap(vertices)
    const reach = Math.max(...hive.map((v) => Math.hypot(v.x, v.z)))
    const top = Math.max(...hive.map((v) => v.y))
    for (const seed of [1, 2, 3]) {
      for (const i of [0, 1, 2]) {
        for (let time = 0; time < 200; time += 0.37) {
          const { x, y, z } = beeAt(i, seed, time)
          if (y < top + 0.05) expect(Math.hypot(x, z), `bee ${i} of hive ${seed} at ${time.toFixed(2)} s`).toBeGreaterThan(reach + 0.04)
        }
      }
    }
  })

  it('face the way they fly', () => {
    for (const i of [0, 1, 2]) {
      for (let time = 0; time < 60; time += 0.53) {
        const p = beeAt(i, 1, time)
        const q = beeAt(i, 1, time + 0.02)
        const way = new THREE.Vector2(q.x - p.x, q.z - p.z).normalize()
        expect(new THREE.Vector2(Math.sin(p.heading), Math.cos(p.heading)).dot(way)).toBeGreaterThan(0.9)
      }
    }
  })
})
