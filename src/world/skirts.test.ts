/// <reference types="node" />
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { describe, expect, it } from 'vitest'
import type { ItemId } from '../game/config'
import { createInitialState } from '../game/state'
import type { PieceId } from './blueprint'
import { visibleIsles } from './framing'
import { showSkirts, skirtFor, skirtShown, takeSkirts } from './skirts'

// The cliff skirts along the seams between pieces, on a scene graph shaped like a baked piece's: its ground mesh,
// with skirt_<neighbour> nodes under it.

const mesh = (name: string, colours = false) => {
  const geometry = new THREE.BoxGeometry()
  if (colours) geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geometry.getAttribute('position').count * 3).fill(1), 3))
  const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
  m.name = name
  return m
}

/** A meadow piece as pieces v2 bakes it: its ground, a skirt for each petal neighbour, and one an exporter numbered. */
function meadowPiece() {
  const scene = new THREE.Group()
  const ground = mesh('piece_meadow', true)
  scene.add(ground)
  const islet = mesh('skirt_islet', true)
  islet.position.set(1, -0.5, 0)
  ground.add(islet)
  const wetland = new THREE.Group() // a skirt that is a group of faces, not a mesh itself
  wetland.name = 'skirt_wetland'
  wetland.add(mesh('cliff_a'), mesh('cliff_b'))
  ground.add(wetland)
  ground.add(mesh('skirt_main.001'))
  ground.add(mesh('rock_skirt_islet'), mesh('skirt_lagoon')) // not skirts: a name that only mentions one, and one for no piece there is
  return { scene, ground, islet, wetland }
}

const shown = (root: THREE.Object3D, name: string) => root.getObjectByName(name)!.visible

describe('skirt nodes', () => {
  it.each([['skirt_islet', 'islet'], ['skirt_wetland.001', 'wetland'], ['skirt_main', 'main'], ['skirt_lagoon', null], ['rock_skirt_islet', null], ['piece_meadow', null]])('names %s for %s', (name, neighbour) => {
    expect(skirtFor(name)).toBe(neighbour)
  })

  it('show while their neighbour is not in the world, never towards the farm', () => {
    expect(skirtShown('islet', ['main'])).toBe(true)
    expect(skirtShown('islet', ['main', 'islet'])).toBe(false)
    expect(skirtShown('main', [])).toBe(false)
  })
})

describe('showing skirts on a piece', () => {
  it('shows each skirt until its neighbour starts rising, then hides it, and shows it again if the neighbour goes', () => {
    const { scene } = meadowPiece()
    expect(showSkirts(scene, ['main', 'meadow'])).toBe(3)
    expect([shown(scene, 'skirt_islet'), shown(scene, 'skirt_wetland'), shown(scene, 'skirt_main.001')]).toEqual([true, true, false])
    showSkirts(scene, ['main', 'meadow', 'islet'])
    expect([shown(scene, 'skirt_islet'), shown(scene, 'skirt_wetland')]).toEqual([false, true])
    showSkirts(scene, ['main', 'meadow'])
    expect(shown(scene, 'skirt_islet')).toBe(true)
  })

  it('leaves everything else as it is, and is harmless on a piece with no skirts', () => {
    const { scene, ground } = meadowPiece()
    scene.getObjectByName('skirt_lagoon')!.visible = false
    showSkirts(scene, ['main', 'islet', 'wetland'])
    expect([ground.visible, shown(scene, 'rock_skirt_islet'), shown(scene, 'skirt_lagoon'), shown(scene, 'cliff_a')]).toEqual([true, true, false, true])

    const bare = new THREE.Group().add(mesh('piece_grove', true))
    expect(showSkirts(bare, ['main'])).toBe(0)
    expect(bare.children[0].visible).toBe(true)
    expect(takeSkirts(bare)).toBeNull()
    expect(bare.children).toHaveLength(1)
  })
})

/** A baked piece's skirts, from public/models as the game loads it. */
async function bakedSkirts(id: PieceId): Promise<THREE.Group> {
  const bytes = readFileSync(new URL(`../../public/models/piece_${id}.glb`, import.meta.url))
  const scene = await new Promise<THREE.Group>((resolve, reject) =>
    new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '', (g) => resolve(g.scene), reject),
  )
  return takeSkirts(scene)!
}

/** What the skirts are shown for on a farm that owns this land: the farm, and the pieces in the world. */
function inWorld(land: ItemId[]): PieceId[] {
  const s = createInitialState(Date.UTC(2026, 9, 19, 9))
  for (const id of land) s.owned[id] = 1
  return ['main', ...visibleIsles(s)]
}

describe('the skirts by the glade and the orchard, on the baked pieces', () => {
  const FIVE: ItemId[] = ['meadow', 'grove', 'islet', 'wetland', 'highland']

  it('hide on both sides of a seam the moment the glade’s or the orchard’s land is in the world', async () => {
    const [wetland, cottage, highland, orchard, grove] = await Promise.all((['wetland', 'cottage', 'highland', 'orchard', 'grove'] as const).map(bakedSkirts))
    const shownFor = (present: PieceId[]) => {
      for (const root of [wetland, cottage, highland, orchard, grove]) showSkirts(root, present)
      return {
        wetland: shown(wetland, 'skirt_cottage'),
        highlandToGlade: shown(highland, 'skirt_cottage'),
        highlandToOrchard: shown(highland, 'skirt_orchard'),
        grove: shown(grove, 'skirt_orchard'),
        gladeToWetland: shown(cottage, 'skirt_wetland'),
        gladeToHighland: shown(cottage, 'skirt_highland'),
        orchardToHighland: shown(orchard, 'skirt_highland'),
        orchardToGrove: shown(orchard, 'skirt_grove'),
      }
    }
    // The wetland, highland and grove show cliffs where the glade and the orchard will dock.
    expect(shownFor(inWorld(FIVE))).toMatchObject({ wetland: true, highlandToGlade: true, highlandToOrchard: true, grove: true })
    // The glade's land starts rising: the skirts either side of its seams go.
    expect(shownFor(inWorld([...FIVE, 'cottageLand']))).toMatchObject({ wetland: false, highlandToGlade: false, highlandToOrchard: true, grove: true, gladeToWetland: false, gladeToHighland: false })
    // The island is closed: no skirt shows anywhere.
    expect(Object.values(shownFor(inWorld([...FIVE, 'cottageLand', 'orchardLand']))).some(Boolean)).toBe(false)
    // Bought ahead of its neighbours, the orchard shows cliffs towards them until they come.
    expect(shownFor(inWorld(['orchardLand']))).toMatchObject({ orchardToHighland: true, orchardToGrove: true })
  })
})

describe('taking the skirts out of a loaded piece', () => {
  it('leaves the piece its ground alone and keeps each skirt where it was', () => {
    const { scene, ground, islet, wetland } = meadowPiece()
    ground.position.set(2, 0, 0)
    const material = new THREE.MeshLambertMaterial({ vertexColors: true })
    const skirts = takeSkirts(scene, material)!
    expect(skirts.children.map((c) => c.name).sort()).toEqual(['skirt_islet', 'skirt_main.001', 'skirt_wetland'])
    expect(ground.children.map((c) => c.name).sort()).toEqual(['rock_skirt_islet', 'skirt_lagoon'])
    let first: THREE.Object3D | null = null
    scene.traverse((o) => {
      if (!first && (o as THREE.Mesh).isMesh) first = o
    })
    expect(first).toBe(ground) // the first mesh in the scene is still the ground
    skirts.updateMatrixWorld(true)
    expect(islet.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([3, -0.5, 0]) // under the ground, which stood 2 along x
    // Painted with vertex colours, drawn like the piece; the wetland's faces keep their own material.
    expect(islet.material).toBe(material)
    expect((wetland.children[0] as THREE.Mesh).material).not.toBe(material)
    expect(islet.castShadow && islet.receiveShadow).toBe(true)
  })
})
