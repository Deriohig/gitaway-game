import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { prepareModel } from './assetMaterials'
import { chickenCoat, goatCoat } from './coats'
import { mat } from './materials'

/** A model as the loader hands it over: one painted (sRGB-textured) coat on its body and on its Head node. */
function loaded(name: string): THREE.Group {
  const map = new THREE.Texture()
  map.colorSpace = THREE.SRGBColorSpace
  const coat = new THREE.MeshStandardMaterial({ name, map })
  const body = new THREE.Mesh(new THREE.BufferGeometry(), coat)
  const head = new THREE.Mesh(new THREE.BufferGeometry(), coat)
  head.name = 'Head'
  body.add(head)
  return new THREE.Group().add(body)
}

/** The colours a model copy's meshes are drawn in. */
function colours(root: THREE.Object3D): string[] {
  const found = new Set<string>()
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh) found.add((mesh.material as THREE.MeshStandardMaterial).color.getHexString())
  })
  return [...found]
}

const SEEDS = [1, 2, 3]

describe.each([
  ['chicken', chickenCoat, (seed: number) => chickenCoat(seed).standIn],
  ['goat', goatCoat, (seed: number) => goatCoat(seed).coat],
] as const)('the coats %ss wear', (name, coatOf, standIn) => {
  it('differ from one animal to the next, one colour all over (head and all) on the model as on the stand-in', () => {
    const model = loaded(name)
    const onModel = SEEDS.map((seed) => colours(prepareModel(model, coatOf(seed).tint)))
    for (const c of onModel) expect(c).toHaveLength(1)
    expect(new Set(onModel.flat()).size).toBe(SEEDS.length)
    expect(new Set(SEEDS.map((seed) => mat(standIn(seed)).color.getHexString())).size).toBe(SEEDS.length)
  })

  it('leave the palest coat as the model is painted, and only ever darken it', () => {
    for (const seed of SEEDS) for (const channel of [coatOf(seed).tint.r, coatOf(seed).tint.g, coatOf(seed).tint.b]) expect(channel).toBeLessThanOrEqual(1)
    expect(coatOf(1).tint.getHex()).toBe(0xffffff)
  })
})
