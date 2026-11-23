/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { describe, expect, it } from 'vitest'
import raw from '../../art/config/composition.pieces.json?raw'
import type { ItemId } from '../game/config'
import { FEATURES } from '../game/features'
import { createInitialState } from '../game/state'
import { withFeatures } from '../game/testing'
import { BLUEPRINT, type DockId, type PieceId } from './blueprint'
import {
  batchColors,
  batchFeet,
  batchMatrices,
  composes,
  drawsFar,
  FAR_SWITCH,
  farEverywhere,
  farModelOf,
  itemMatrix,
  nearestFoot,
  keptClear,
  loadCompositionItems,
  loadCompositionReeds,
  modelParts,
  motionOf,
  onFootprint,
  paintOf,
  pieceBatches,
  readyRibbons,
  runShown,
  showRuns,
  shownRuns,
  type Category,
} from './composition'
import { backLitAsFront, receivesShadow } from './composedLight'
import { composedPart } from './composedParts'
import { COMPOSITION_ITEMS, COMPOSITION_REEDS } from './composition.data'
import { COMPOSITION_META } from './composition.meta'
import { visibleIsles } from './framing'
import { sampleGrid } from './pieces'
import { bakedGrid } from './testing'

// The art session's composition (art/config/composition.pieces.json) is copied into composition.meta.ts and
// composition.data.ts by `npm run composition`; the first test fails until it is run again.

type Item = { asset: string; x: number; z: number; rotY: number; scale: number }
interface JsonPiece extends Record<string, unknown> {
  paths: { id: string; leadsTo: string | null; needs: string[] }[]
  reeds?: { x: number; z: number; height: number; head: boolean }[]
}
const json = JSON.parse(raw) as {
  format: string
  categories: string[]
  assets: Record<string, { category: string; file: string; far?: string; yOffset: number }>
  counts: Record<string, Record<string, number>>
  pieces: Record<string, JsonPiece>
}
const close = (a: number[]) => a.map((v) => expect.closeTo(v, 6))

describe('the composition copied from the art session', () => {
  it('holds the JSON as it is now (run `npm run composition` if not)', async () => {
    expect(Object.keys(COMPOSITION_ITEMS)).toEqual(Object.keys(json.pieces))
    expect(Object.keys(json.pieces).sort()).toEqual([...BLUEPRINT.order].sort())
    for (const [id, piece] of Object.entries(json.pieces)) {
      for (const c of json.categories) expect(COMPOSITION_ITEMS[id as keyof typeof COMPOSITION_ITEMS][c as 'trees'], `${id} ${c}`).toEqual(piece[c] as Item[])
      expect(COMPOSITION_META.counts[id as keyof typeof COMPOSITION_META.counts], id).toEqual(Object.fromEntries(json.categories.map((c) => [c, json.counts[id][c]])))
      expect(COMPOSITION_META.paths[id as keyof typeof COMPOSITION_META.paths], id).toEqual(piece.paths.map((r) => ({ id: r.id, leadsTo: r.leadsTo, needs: r.needs })))
    }
    expect(COMPOSITION_META.format).toBe(json.format)
    expect(COMPOSITION_META.categories).toEqual(json.categories)
    for (const [id, a] of Object.entries(json.assets)) {
      expect(COMPOSITION_META.assets[id], id).toEqual({ category: a.category, file: a.file, ...(a.far ? { far: a.far } : {}), yOffset: a.yOffset })
    }
    expect(await loadCompositionItems()).toBe(COMPOSITION_ITEMS)
  })

  it('carries the farm pond’s reeds as they are, outside the categories and the counts', async () => {
    expect(Object.entries(json.pieces).filter(([, p]) => p.reeds !== undefined).map(([id]) => id)).toEqual(['main'])
    expect(Object.keys(COMPOSITION_REEDS)).toEqual(['main'])
    expect(COMPOSITION_REEDS.main).toEqual(json.pieces.main.reeds)
    expect(COMPOSITION_REEDS.main).toHaveLength(7)
    for (const reed of COMPOSITION_REEDS.main!) expect(Object.keys(reed).sort()).toEqual(['head', 'height', 'x', 'z'])
    expect(Object.keys(COMPOSITION_ITEMS.main)).toEqual(json.categories)
    expect(Object.keys(COMPOSITION_META.counts.main)).toEqual(json.categories)
    expect(await loadCompositionReeds()).toBe(COMPOSITION_REEDS)
  })
})

const PIECE_IDS = BLUEPRINT.order
const CATEGORIES: Category[] = ['trees', 'shrubs', 'rocks', 'flowers', 'grass']
const NON_TREES = ['shrubs', 'rocks', 'flowers', 'grass']

/** The pieces in the world for a farm that owns this land. */
function inWorld(land: ItemId[]): PieceId[] {
  const s = createInitialState(Date.UTC(2026, 9, 19, 9))
  for (const id of land) s.owned[id] = 1
  return visibleIsles(s)
}
const baked = { source: 'baked' as const }
const procedural = { source: 'procedural' as const }

describe('the composition’s switch', () => {
  it('is on as committed, and switched off draws nothing on any piece', () => {
    expect(FEATURES.composition).toBe(true)
    withFeatures({ composition: false }, () => {
      for (const id of PIECE_IDS) {
        expect(pieceBatches(id, COMPOSITION_ITEMS, baked), id).toEqual([])
        expect(shownRuns(id, PIECE_IDS), id).toEqual([])
        for (const c of CATEGORIES) expect(composes(id, c, baked), `${id} ${c}`).toBe(false)
      }
    })
  })

  it('leaves a procedurally drawn piece to the game’s own dressing; the farm’s rocks are composed too', () => {
    expect(pieceBatches('meadow', COMPOSITION_ITEMS, procedural)).toEqual([])
    for (const c of CATEGORIES) expect(composes('meadow', c, procedural), c).toBe(false)
    expect(composes('meadow', 'flowers', baked)).toBe(true)
    expect(composes('main', 'rocks', baked)).toBe(true)
  })
})

describe('which path runs show', () => {
  const run = (piece: PieceId, id: string) => COMPOSITION_META.paths[piece].find((r) => r.id === id)!
  const ALPHA: DockId[] = ['meadow', 'grove', 'islet', 'wetland', 'highland']
  const LAND: ItemId[] = ['meadow', 'grove', 'islet', 'wetland', 'highland']

  it.each([
    ['main', 'to_meadow', [], false],
    ['main', 'to_meadow', ['meadow'], true],
    ['main', 'to_grove', ['grove'], false], // crosses the islet: waits for both
    ['main', 'to_grove', ['islet'], false],
    ['main', 'to_grove', ['grove', 'islet'], true],
    ['meadow', 'meadow_hut', [], true], // nothing else to cross
    ['meadow', 'rim_walk', ['meadow'], false],
    ['meadow', 'rim_walk', ['meadow', 'islet'], true],
  ] as [PieceId, string, DockId[], boolean][])('%s %s with %j in the world: %s', (piece, id, docked, shown) => {
    expect(runShown(run(piece, id), docked)).toBe(shown)
  })

  it('hides the runs to the glade and the orchard, and those crossing them, until their land is in the world', () => {
    expect(shownRuns('main', ALPHA)).toEqual(['to_meadow', 'to_highland', 'to_islet', 'to_grove'])
    expect(shownRuns('wetland', ALPHA)).toEqual(['meadow_lake'])
    expect(shownRuns('highland', ALPHA)).toEqual(['to_highland', 'plateau_walk'])
    expect(shownRuns('grove', ALPHA)).toEqual(['to_grove'])
    expect(shownRuns('main', [])).toEqual([])
    expect(inWorld(LAND)).toEqual(expect.arrayContaining(ALPHA))
    const glade = inWorld([...LAND, 'cottageLand'])
    expect(shownRuns('main', glade)).toEqual(['to_meadow', 'to_highland', 'to_islet', 'to_cottage', 'to_wetland', 'to_grove'])
    expect(shownRuns('wetland', glade)).toEqual(['to_wetland', 'meadow_lake'])
    expect(shownRuns('cottage', glade)).toEqual(['to_cottage', 'to_wetland'])
    const closed = inWorld([...LAND, 'cottageLand', 'orchardLand'])
    for (const id of PIECE_IDS) expect(shownRuns(id, closed), id).toEqual(COMPOSITION_META.paths[id].map((r) => r.id))
  })
})

describe('the instances drawn on each piece', () => {
  it('draws one batch per asset, and every item of the JSON but those on ground the game keeps', () => {
    for (const id of PIECE_IDS) {
      const batches = pieceBatches(id, COMPOSITION_ITEMS, baked)
      const assets = batches.map((b) => b.asset)
      expect(new Set(assets).size, id).toBe(assets.length)
      for (const c of CATEGORIES) {
        const drawn = batches.filter((b) => b.category === c).reduce((n, b) => n + b.items.length, 0)
        const kept = COMPOSITION_ITEMS[id][c].filter((item) => keptClear(id).some((f) => onFootprint(f, item.x, item.z))).length
        expect(drawn, `${id} ${c}`).toBe(json.counts[id][c] - kept)
      }
    }
  })

  it('stands every item on its piece’s baked ground, lifted by its asset’s yOffset', () => {
    for (const id of PIECE_IDS) {
      const grid = bakedGrid(id)
      for (const batch of pieceBatches(id, COMPOSITION_ITEMS, baked)) {
        const lift = COMPOSITION_META.assets[batch.asset].yOffset
        const m = batchMatrices(batch.items, (x, z) => sampleGrid(grid, x, z), lift, null)
        expect(m.length, `${id} ${batch.asset}`).toBe(batch.items.length * 16)
        batch.items.forEach((item, i) => {
          const ground = sampleGrid(grid, item.x, item.z)
          expect(Number.isNaN(ground), `${id} ${batch.asset} ${i} is on the top`).toBe(false)
          expect([m[i * 16 + 12], m[i * 16 + 13], m[i * 16 + 14]], `${id} ${batch.asset} ${i}`).toEqual([expect.closeTo(item.x, 6), expect.closeTo(ground + lift, 5), expect.closeTo(item.z, 6)])
        })
      }
    }
  })

  it('turns and scales an item about its foot, then places its mesh as the model does', () => {
    const item = { asset: 'tree_round_a', x: 1, z: 2, rotY: Math.PI / 2, scale: 2 }
    const m = itemMatrix(item, 0.5, 0, new THREE.Matrix4().makeTranslation(0, 0.95, 0))
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual(close([1, 0.5 + 1.9, 2]))
    expect(new THREE.Vector3(1, 0, 0).transformDirection(m).toArray()).toEqual(close([0, 0, -1]))
    expect(new THREE.Vector3().setFromMatrixScale(m).toArray()).toEqual(close([2, 2, 2]))
    expect(new THREE.Vector3().setFromMatrixScale(itemMatrix({ ...item, scaleY: 0.5 }, 0, 0, null)).toArray()).toEqual(close([2, 0.5, 2]))
  })
})

describe('the rocks the composition places on the farm', () => {
  const standing = COMPOSITION_ITEMS.main.rocks.filter((item) => !keptClear('main').some((f) => onFootprint(f, item.x, item.z)))
  const drawn = () => pieceBatches('main', COMPOSITION_ITEMS, baked).filter((b) => b.category === 'rocks')
  const models = new URL('../../public/models/', import.meta.url)
  const manifest = (JSON.parse(readFileSync(new URL('manifest.json', models), 'utf8')) as { assets: Record<string, { file: string; status: string }> }).assets

  it('draws every rock off the kept ground, one batch for each asset, each with a ready model on disk', () => {
    const batches = drawn()
    expect(batches.map((b) => b.asset).sort()).toEqual([...new Set(standing.map((item) => item.asset))].sort())
    for (const batch of batches) {
      expect(batch.items, batch.asset).toEqual(standing.filter((item) => item.asset === batch.asset))
      const asset = COMPOSITION_META.assets[batch.asset]
      expect(manifest[batch.asset]?.status, batch.asset).toBe('ready')
      expect(manifest[batch.asset].file, batch.asset).toBe(asset.file)
      expect(existsSync(new URL(asset.file, models)), batch.asset).toBe(true)
    }
  })

  it('draws at least 17 pebbles, each tinted by its own tint, still in the wind, lifted by 0.006', () => {
    const pebbles = drawn().find((b) => b.asset === 'pebbles')!
    expect(pebbles.items.length).toBeGreaterThanOrEqual(17)
    expect(pebbles.items.every((item) => item.tint)).toBe(true)
    expect(paintOf(pebbles.category, pebbles.items, false)).toBe('tint')
    expect(Array.from(batchColors(pebbles.items, 'tint')!)).toEqual(close(pebbles.items.flatMap((item) => item.tint!)))
    expect(COMPOSITION_META.assets.pebbles.category).toBe('rocks')
    expect(COMPOSITION_META.assets.pebbles.yOffset).toBeCloseTo(0.006, 6)
  })
})

describe('the instances’ colours and movement', () => {
  const tree = { asset: 'tree_round_a', x: 0, z: 0, rotY: 0, scale: 1, tint: [0.9, 1.1, 0.8] as [number, number, number] }

  it('tints a tree’s canopy and not its trunk, a plant shrub all over, and keeps the model’s colours without a tint', () => {
    expect(paintOf('trees', [tree], true)).toBe('tint')
    expect(paintOf('trees', [tree], false)).toBeNull()
    expect(paintOf('shrubs', [{ ...tree, asset: 'shrub_mound' }], false)).toBe('tint')
    expect(Array.from(batchColors([tree], 'tint')!)).toEqual(close([0.9, 1.1, 0.8]))
    expect(Array.from(batchColors([{ ...tree, tint: undefined }], 'tint')!)).toEqual([1, 1, 1])
  })

  it('colours a flower from its sRGB hex, in linear as three’s Color has it', () => {
    const flower = { asset: 'flower_head', x: 0, z: 0, rotY: 0, scale: 1, color: '#E58A6A' }
    expect(paintOf('flowers', [flower], false)).toBe('color')
    const c = new THREE.Color('#E58A6A')
    expect(Array.from(batchColors([flower], 'color')!)).toEqual(close([c.r, c.g, c.b]))
    expect(c.r).toBeLessThan(0.8)
  })

  it('tints the composed trees, pebbles, grass and flowers, and leaves the other rocks and shrubs in their own colours', () => {
    for (const id of PIECE_IDS) {
      for (const batch of pieceBatches(id, COMPOSITION_ITEMS, baked)) {
        if (batch.asset === 'pebbles' || ['trees', 'grass', 'flowers'].includes(batch.category)) expect(paintOf(batch.category, batch.items, true), batch.asset).toBe('tint')
        else expect(paintOf(batch.category, batch.items, true), batch.asset).toBeNull()
      }
    }
  })

  it.each([
    ['trees', true, false, 'broadleaf'],
    ['trees', true, true, 'conifer'],
    ['trees', false, false, 'still'],
    ['grass', false, false, 'grass'],
    ['flowers', false, false, 'grass'],
    ['rocks', false, false, 'still'],
    ['shrubs', false, false, 'still'],
  ] as const)('%s canopy=%s conifer=%s sways as %s', (category, canopy, conifer, motion) => {
    expect(motionOf(category, canopy, conifer)).toBe(motion)
  })

  it('lights a conifer canopy’s frond backs as their fronts, and takes shadows off it; everything else as three draws it', () => {
    expect(backLitAsFront('trees', true, true)).toBe(true)
    expect(backLitAsFront('trees', false, true)).toBe(false)
    expect(backLitAsFront('trees', true, false)).toBe(false)
    expect(receivesShadow('trees', true, true)).toBe(false)
    expect(receivesShadow('trees', false, true)).toBe(true)
    expect(receivesShadow('trees', true, false)).toBe(true)
    expect(receivesShadow('trees', false, false)).toBe(true)
    for (const category of NON_TREES) {
      expect(backLitAsFront(category, false, false), category).toBe(false)
      expect(receivesShadow(category, false, false), category).toBe(true)
    }
  })
})

describe('when a batch of trees is drawn from its far models', () => {
  it('names a far model for every tree, and none for anything else', () => {
    for (const [id, a] of Object.entries(COMPOSITION_META.assets)) expect(farModelOf(id), id).toBe(a.category === 'trees' ? `${id}_far` : null)
    expect(farModelOf('no_such_asset')).toBeNull()
  })

  it('switches to far 35 u off and back to near within 30 u, so a batch by the line doesn’t flicker', () => {
    expect(FAR_SWITCH).toEqual({ in: 35, out: 30 })
    for (const [was, d, now] of [[false, 34.9, false], [false, 35, true], [false, 80, true], [false, 32, false], [true, 32, true], [true, 30, true], [true, 29.9, false]] as const) {
      expect(drawsFar(was, d, false), `${was} ${d}`).toBe(now)
    }
    let far = false
    const seen = [20, 33, 35, 40, 31, 30.5, 29, 33, 34.99, 36].map((d) => (far = drawsFar(far, d, false)))
    expect(seen).toEqual([false, false, true, true, true, true, false, false, false, true])
  })

  it('draws far everywhere on a phone held either way up, and not on a desktop or a laptop-sized touch screen', () => {
    expect(farEverywhere(true, { width: 390, height: 844 })).toBe(true)
    expect(farEverywhere(true, { width: 844, height: 390 })).toBe(true)
    expect(farEverywhere(false, { width: 1440, height: 900 })).toBe(false)
    expect(farEverywhere(false, { width: 390, height: 844 })).toBe(false)
    expect(farEverywhere(true, { width: 1440, height: 900 })).toBe(false)
    for (const d of [0, 29, 50]) for (const was of [false, true]) expect(drawsFar(was, d, true), `${d} ${was}`).toBe(true)
  })

  it('measures a batch’s distance to its nearest tree, from where each stands on its piece’s ground', () => {
    const items = [
      { asset: 'tree_round_a', x: 0, z: 0, rotY: 0, scale: 1 },
      { asset: 'tree_round_a', x: 10, z: 0, rotY: 1, scale: 0.6 },
      { asset: 'tree_round_a', x: 0, z: -5, rotY: 2, scale: 1.2 },
    ]
    const feet = batchFeet(items, (x) => x * 0.1, 0.5)
    expect(Array.from(feet)).toEqual(close([0, 0.5, 0, 10, 1.5, 0, 0, 0.5, -5]))
    expect(nearestFoot(feet, new THREE.Vector3(10, 1.5, 3))).toBeCloseTo(3, 6)
    expect(nearestFoot(feet, new THREE.Vector3(0, 40.5, -5))).toBeCloseTo(40, 6)
    expect(nearestFoot(new Float32Array(0), new THREE.Vector3())).toBe(Infinity)
  })
})

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a

/** A GLB without its images (three's loader can't decode them under vitest); the binary chunk stays as it is. */
function withoutImages(bytes: Buffer): ArrayBuffer {
  const length = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as { materials?: object[]; images?: unknown; textures?: unknown; samplers?: unknown }
  const untexture = (o: object) => {
    for (const [key, value] of Object.entries(o)) {
      if (!value || typeof value !== 'object') continue
      if (key.endsWith('Texture') && 'index' in value) delete (o as Record<string, unknown>)[key]
      else untexture(value)
    }
  }
  for (const m of gltf.materials ?? []) untexture(m)
  delete gltf.images
  delete gltf.textures
  delete gltf.samplers
  const text = Buffer.from(JSON.stringify(gltf), 'utf8')
  const chunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
  const bin = bytes.subarray(20 + length)
  const head = Buffer.alloc(20)
  head.writeUInt32LE(GLB_MAGIC, 0)
  head.writeUInt32LE(2, 4)
  head.writeUInt32LE(20 + chunk.length + bin.length, 8)
  head.writeUInt32LE(chunk.length, 12)
  head.writeUInt32LE(JSON_CHUNK, 16)
  const out = Buffer.concat([head, chunk, bin])
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
}

/** A model from public/models, as the game's loader reads it, but for its images. */
function model(file: string): Promise<THREE.Group> {
  const bytes = readFileSync(new URL(`../../public/models/${file}`, import.meta.url))
  return new Promise((resolve, reject) => new GLTFLoader().parse(withoutImages(bytes), '', (g) => resolve(g.scene), reject))
}

const TREES = Object.entries(COMPOSITION_META.assets)
  .filter(([, a]) => a.category === 'trees')
  .map(([id]) => id)
const pivotOf = (part: { matrix: THREE.Matrix4 }) => new THREE.Vector3().setFromMatrixPosition(part.matrix).y
const isPine = (asset: string) => asset.startsWith('tree_pine')

describe('the plant models’ meshes', () => {
  it('splits a tree into trunk and pivoted canopy, and its far version the same way with fewer triangles', async () => {
    const triangles = (parts: ReturnType<typeof modelParts>) => parts.reduce((n, p) => n + (p.mesh.geometry.index?.count ?? p.mesh.geometry.getAttribute('position').count) / 3, 0)
    for (const asset of TREES) {
      const root = await model(`${asset}.glb`)
      const near = modelParts(root)
      expect(near.map((p) => p.canopy), asset).toEqual(asset === 'tree_fruit' ? [false, true, true] : [false, true])
      const [trunk, canopy] = near
      trunk.mesh.geometry.computeBoundingBox()
      expect(trunk.mesh.geometry.boundingBox!.min.y, `${asset} trunk`).toBeCloseTo(0, 5)
      expect(trunk.matrix.equals(new THREE.Matrix4()), `${asset} trunk`).toBe(true)
      const height = new THREE.Box3().setFromObject(root).max.y
      expect(pivotOf(canopy), `${asset} canopy`).toBeGreaterThanOrEqual(0.05 * height)
      expect(pivotOf(canopy), `${asset} canopy`).toBeLessThanOrEqual(0.8 * height)
      expect(root.getObjectByName('Crown') !== undefined, asset).toBe(isPine(asset))

      const far = farModelOf(asset)!
      const farRoot = await model(`${far}.glb`)
      const parts = modelParts(farRoot)
      expect(parts.map((p) => p.canopy), far).toEqual(near.map((p) => p.canopy))
      expect(parts[0].matrix.equals(new THREE.Matrix4()), `${far} trunk`).toBe(true)
      expect(pivotOf(parts[1]), `${far} canopy`).toBeCloseTo(pivotOf(canopy), 5)
      expect(farRoot.getObjectByName('Crown') !== undefined, far).toBe(isPine(asset))
      expect(triangles(parts), far).toBeLessThan(triangles(near) / 2)
    }
  })

  it('keeps a plant’s one mesh whole', async () => {
    for (const asset of ['shrub_mound', 'grass_tuft', 'flower_head', 'bush_a']) {
      const parts = modelParts(await model(`${asset}.glb`))
      expect(parts.map((p) => p.canopy), asset).toEqual([false])
    }
  })
})

describe('a tree’s meshes as the composition draws them (composedPart)', () => {
  const batchOf = (asset: string) => ({ asset, category: 'trees' as const, items: [{ asset, x: 0, z: 0, rotY: 0, scale: 1 }] })
  const keys = (mesh: THREE.Mesh) => [mesh.material].flat().map((m) => m.customProgramCacheKey()).join(' ')

  it('takes no shadow on a fir’s canopy (near and far), lights its frond backs as fronts, and sways every canopy’s shadow; trunks as before', async () => {
    for (const asset of TREES) {
      for (const id of [asset, `${asset}_far`]) {
        const root = await model(`${id}.glb`)
        const conifer = root.getObjectByName('Crown') !== undefined
        const parts = modelParts(root)
        for (const part of parts) {
          let inCrown = false
          for (let o: THREE.Object3D | null = part.mesh; o; o = o.parent) if (o.name === 'Crown') inCrown = true
          expect(receivesShadow('trees', part.canopy, conifer), `${id} ${part.canopy}`).toBe(!(isPine(asset) && part.canopy && inCrown))
        }
        const drawn = parts.map((part) => ({ canopy: part.canopy, mesh: composedPart(batchOf(asset), part, conifer, () => 0, id === asset ? 'near' : 'far') }))
        const canopy = drawn.find((p) => p.canopy)!.mesh
        const trunk = drawn.find((p) => !p.canopy)!.mesh
        expect(canopy.receiveShadow, `${id} canopy`).toBe(!isPine(asset))
        expect(keys(canopy), `${id} canopy`).toMatch(isPine(asset) ? /back-lit/ : /^((?!back-lit).)*$/)
        expect(canopy.customDepthMaterial, `${id} canopy`).toBeInstanceOf(THREE.MeshDepthMaterial)
        expect(canopy.castShadow, `${id} canopy`).toBe(true)
        expect(trunk.receiveShadow, `${id} trunk`).toBe(true)
        expect(keys(trunk), `${id} trunk`).not.toMatch(/back-lit/)
        expect(trunk.customDepthMaterial, `${id} trunk`).toBeUndefined()
        expect(trunk.castShadow, `${id} trunk`).toBe(true)
      }
    }
  })
})

describe('the path ribbons', () => {
  const ribbons = (piece: PieceId) => model(`paths_${piece}.glb`)
  const runNodes = (root: THREE.Object3D) => {
    const nodes: THREE.Mesh[] = []
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) nodes.push(o as THREE.Mesh)
    })
    return nodes
  }

  it('has a node for every run of every piece, needing what the JSON says', async () => {
    for (const piece of PIECE_IDS) {
      const runs = COMPOSITION_META.paths[piece]
      if (!runs.length) continue
      const nodes = runNodes(await ribbons(piece))
      expect(nodes.map((n) => n.name).sort(), piece).toEqual(runs.map((r) => `path_${r.id}`).sort())
      for (const run of runs) expect(nodes.find((n) => n.name === `path_${run.id}`)!.userData.needs, `${piece} ${run.id}`).toEqual(run.needs)
    }
  })

  it('shows the runs whose pieces are in the world and hides the rest', async () => {
    const root = await ribbons('main')
    expect(showRuns(root, 'main', ['meadow'])).toEqual(['to_meadow'])
    expect(runNodes(root).filter((n) => n.visible).map((n) => n.name)).toEqual(['path_to_meadow'])
    expect(showRuns(root, 'main', ['meadow', 'grove', 'islet', 'wetland', 'highland'])).toEqual(['to_meadow', 'to_highland', 'to_islet', 'to_grove'])
    expect(runNodes(root).find((n) => n.name === 'path_to_cottage')!.visible).toBe(false)
    expect(showRuns(root, 'main', [...BLUEPRINT.order.filter((id) => id !== 'main')])).toEqual(COMPOSITION_META.paths.main.map((r) => r.id))
    expect(runNodes(root).every((n) => n.visible)).toBe(true)
    withFeatures({ composition: false }, () => expect(showRuns(root, 'main', ['meadow'])).toEqual([]))
    expect(runNodes(root).every((n) => !n.visible)).toBe(true)
  })

  it('draws over the ground, blended by its vertex alpha, never fighting it, under the game’s model rules', async () => {
    const root = await ribbons('meadow')
    readyRibbons(root)
    for (const node of runNodes(root)) {
      const m = node.material as THREE.MeshStandardMaterial
      expect(node.renderOrder, node.name).toBeGreaterThan(0)
      expect([node.castShadow, node.receiveShadow], node.name).toEqual([false, true])
      expect(node.geometry.getAttribute('color').itemSize, node.name).toBe(4)
      expect([m.vertexColors, m.transparent, m.depthWrite, m.polygonOffset], node.name).toEqual([true, true, false, true])
      expect(m.polygonOffsetFactor + m.polygonOffsetUnits, node.name).toBeLessThan(0)
      // The iOS colour-map rule leaves a ribbon, which has no map, as it is.
      expect([m.map, m.opacity], node.name).toEqual([null, 1])
      const shader = { uniforms: {}, vertexShader: '', fragmentShader: 'void main() {}' }
      m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer)
      expect(shader.fragmentShader, node.name).toBe('void main() {}')
    }
  })
})
