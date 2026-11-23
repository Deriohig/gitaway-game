import * as THREE from 'three'
import { expect, it } from 'vitest'
import { holdStill, restOf, type Rests } from './visitorPose'

it('holds a visitor still: back in its place at its own size, every part as modelled', () => {
  const rests: Rests = new Map()
  const body = new THREE.Group()
  const head = new THREE.Object3D()
  const wings = new THREE.Object3D()
  head.rotation.set(0.1, 0.3, 0)
  wings.scale.x = 0.8
  restOf(rests, head)
  restOf(rests, wings)

  // Caught mid-hop, mid-breath, mid-glance and mid-flap when Still is chosen.
  body.position.set(0.02, 0.05, -0.01)
  body.scale.y = 1.015
  head.rotation.set(0.25, 0.9, 0)
  wings.scale.x = 0.3

  holdStill(body, [head, wings, null], rests)
  expect(body.position.toArray()).toEqual([0, 0, 0])
  expect(body.scale.toArray()).toEqual([1, 1, 1])
  expect([head.rotation.x, head.rotation.y]).toEqual([0.1, 0.3])
  expect(wings.scale.x).toBe(0.8)
})
