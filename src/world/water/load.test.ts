/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PIECES } from '../blueprint'
import { PIECE_TIMEOUT_MS } from '../pieceLoader'
import { glbMeshes } from '../testing'
import { BANDS, BAND_SOFT, NOISE_SIZE, PALETTES, TEXEL, WATER_FORMAT } from './core.gen'
import { disposeWater, loadWaterPiece, makeMapTexture, makeNoiseTexture, resetSessionLoad, type LoadedWater } from './load'
import { WATER_PIECES, type WaterPieceId } from './report'
import type { WaterBody, WaterJson, WaterPiece } from './types'
import type { WaterMaps } from './waterMaterial'

// Loading each piece's baked water (load.ts): water.json and the noise (shared by every piece), then the piece's map
// and its bodies' meshes, read from public/models as the game fetches them. Anything that goes wrong gives null for
// that piece and one warning, and that piece keeps today's water.

const models = new URL('../../../public/models/', import.meta.url)
const bytesOf = (name: string) => readFileSync(new URL(name, models))
const waterJson = () => JSON.parse(bytesOf('water.json').toString('utf8')) as WaterJson
const nameOf = (input: string | URL | Request) => {
  const url = String(input)
  return url.slice(url.lastIndexOf('/models/') + '/models/'.length)
}

/** The nodes of water_main.glb other than the pond (its fall, the fall's skirt and its mist). */
const NOT_THE_POND = ['water_fall', 'water_fall_skirt', 'mist_fall']

/** What a stubbed fetch serves in place of a file of public/models: other bytes or text, an HTTP status, or a network error. */
type Served = Record<string, Uint8Array | string | number | Error>

/** Stubs `fetch` to serve public/models, except for `instead`. Returns the stub, to see what was asked for. */
function serve(instead: Served = {}) {
  const stub = vi.fn(async (input: string | URL | Request) => {
    const other = instead[nameOf(input)]
    if (other instanceof Error) throw other
    if (typeof other === 'number') return new Response('not here', { status: other })
    return new Response((other ?? bytesOf(nameOf(input))) as BodyInit)
  })
  vi.stubGlobal('fetch', stub)
  return stub
}

/** A geometry's vertex positions, whether or not its attributes are interleaved (a GLB's usually are). */
const positions = (geometry: THREE.BufferGeometry) => {
  const p = geometry.getAttribute('position')
  return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)])
}

/** water.json after `edit`, as the served replacement. */
function edited(edit: (json: WaterJson) => void): Served {
  const json = waterJson()
  edit(json)
  return { 'water.json': JSON.stringify(json) }
}

/** A .glb's JSON chunk, as far as these tests read and edit it. */
interface GlbJson {
  nodes: { name?: string; translation?: number[] }[]
  meshes: { primitives: { attributes: Record<string, number> }[] }[]
}
const glbJson = (glb: Buffer) => JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8')) as GlbJson

/** A .glb with its JSON chunk edited: re-padded to 4 bytes and the header's lengths fixed. Its binary chunk stays as it is. */
function editGlb(glb: Buffer, edit: (gltf: GlbJson) => void): Buffer {
  const length = glb.readUInt32LE(12)
  const gltf = glbJson(glb)
  edit(gltf)
  const text = Buffer.from(JSON.stringify(gltf), 'utf8')
  const chunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
  const bin = glb.subarray(20 + length)
  const head = Buffer.alloc(20)
  head.writeUInt32LE(0x46546c67, 0) // 'glTF'
  head.writeUInt32LE(2, 4)
  head.writeUInt32LE(20 + chunk.length + bin.length, 8)
  head.writeUInt32LE(chunk.length, 12)
  head.writeUInt32LE(0x4e4f534a, 16) // 'JSON'
  return Buffer.concat([head, chunk, bin])
}

/** water_main.glb with one vertex attribute taken out of every primitive. */
const glbWithout = (attribute: string): Buffer =>
  editGlb(bytesOf('water_main.glb'), (gltf) => {
    for (const mesh of gltf.meshes) for (const prim of mesh.primitives) delete prim.attributes[attribute]
  })

/** A .glb with one node moved (the art's water nodes have no transform of their own). */
const withNodeTransform = (glb: Buffer, node: string, translation: [number, number, number]): Buffer =>
  editGlb(glb, (gltf) => {
    const found = gltf.nodes.find((n) => n.name === node)
    if (!found) throw new Error(`the GLB has no node ${node}`)
    found.translation = translation
  })

/** One body's mesh as the art baked it: glbMeshes names meshes by material (all `Water`), so every other node is skipped. */
function bakedBody(glb: string, node: string): THREE.Mesh {
  const others = glbJson(bytesOf(glb))
    .nodes.map((n) => n.name ?? '')
    .filter((name) => name !== node)
  const meshes = glbMeshes(fileURLToPath(new URL(glb, models)), others)
  expect(meshes, `${glb}'s ${node}`).toHaveLength(1)
  return meshes[0]
}

/** The files a stubbed fetch was asked for, by name, sorted. */
const asked = (stub: ReturnType<typeof serve>) => stub.mock.calls.map(([input]) => nameOf(input)).sort()

/** The loading manager item the water tells three about. */
const ITEM = 'water:main'

/** Spies to put back after the test, so a failing assertion can't leak them. */
const putBack: (() => void)[] = []

/** Spies on the manager's item calls, counting only the water's (the GLB's loader may report its own). */
function watch() {
  const manager = THREE.DefaultLoadingManager
  const spies = { start: vi.spyOn(manager, 'itemStart'), end: vi.spyOn(manager, 'itemEnd'), error: vi.spyOn(manager, 'itemError') }
  putBack.push(() => Object.values(spies).forEach((s) => s.mockRestore()))
  const calls = (spy: (typeof spies)['start']) => spy.mock.calls.filter(([url]) => url === ITEM).length
  return { started: () => calls(spies.start), ended: () => calls(spies.end), failed: () => calls(spies.error) }
}

/** load.ts afresh, so its once-a-session cache starts empty. */
async function fresh() {
  vi.resetModules()
  return import('./load')
}

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
  for (const restore of putBack.splice(0)) restore()
  vi.unstubAllGlobals()
  // water.json and the noise are fetched once a session: each test starts with none
  resetSessionLoad()
})

/** What both texture builders give: linear, mipmapped, byte-aligned data textures. */
function expectDataTexture(t: THREE.DataTexture, size: [number, number], format: THREE.PixelFormat, wrap: THREE.Wrapping) {
  expect(t.isDataTexture).toBe(true)
  expect([t.image.width, t.image.height]).toEqual(size)
  expect([t.format, t.type, t.colorSpace]).toEqual([format, THREE.UnsignedByteType, THREE.NoColorSpace])
  expect([t.minFilter, t.magFilter, t.generateMipmaps]).toEqual([THREE.LinearMipmapLinearFilter, THREE.LinearFilter, true])
  expect([t.wrapS, t.wrapT]).toEqual([wrap, wrap])
  expect(t.unpackAlignment).toBe(1)
  expect(t.version).toBeGreaterThan(0)
}

describe('MAIN\'s baked water', () => {
  it('loads the pond and stream as one body, and the farm fall, as the art baked them', async () => {
    serve()
    const water = (await loadWaterPiece('main'))!
    expect(water).not.toBeNull()
    expect(water.bodies.map((b) => b.body.node)).toEqual(['water_pond', 'water_fall'])
    const { body, geometry } = water.bodies[0]
    expect([body.kind, body.join?.to]).toEqual(['still', 'river'])
    expect(['position', 'normal', 'uv'].map((a) => geometry.getAttribute(a).itemSize)).toEqual([3, 3, 2])
    expect(water.json.format).toBe(WATER_FORMAT)
    const [baked] = glbMeshes(fileURLToPath(new URL('water_main.glb', models)), NOT_THE_POND)
    expect(positions(geometry)).toEqual(positions(baked.geometry))
    expect(Array.from(geometry.getIndex()!.array)).toEqual(Array.from(baked.geometry.getIndex()!.array))
    expect(geometry.getAttribute('position').count).toBe(213)
    const maps: WaterMaps = water
    expect(maps.origin).toEqual([-8.525, 1.975])
    expect(water.extent[0]).toBeCloseTo(192 * 0.05, 9)
    expect(water.extent[1]).toBeCloseTo(128 * 0.05, 9)
    expect(warn).not.toHaveBeenCalled()
  })

  it('fetches water.json, the map, the noise and the GLB, once each, under the app’s base path', async () => {
    const stub = serve()
    await loadWaterPiece('main')
    const urls = stub.mock.calls.map(([url]) => String(url))
    expect(urls.map((u) => u.slice(u.indexOf('models/'))).sort()).toEqual(['models/water.json', 'models/water_main.glb', 'models/water_main.map.bin', 'models/water_noise.bin'])
    for (const url of urls) expect(url.startsWith(`${import.meta.env.BASE_URL}models/`)).toBe(true)
  })

  it('builds the map (192×128, clamped) and the noise (128×128, repeating) from the files’ bytes', async () => {
    serve()
    const { map, noise } = (await loadWaterPiece('main'))!
    expectDataTexture(map, [192, 128], THREE.RGBAFormat, THREE.ClampToEdgeWrapping)
    expect(map.image.data).toHaveLength(98304)
    expect(Buffer.from(map.image.data as Uint8Array).equals(bytesOf('water_main.map.bin'))).toBe(true)
    expectDataTexture(noise, [128, 128], THREE.RGFormat, THREE.RepeatWrapping)
    expect(noise.image.data).toHaveLength(32768)
    expect(Buffer.from(noise.image.data as Uint8Array).equals(bytesOf('water_noise.bin'))).toBe(true)
  })
})

// Every piece loads the same way, each from its own map and GLB, behind the one water.json and noise of the session.
describe('every piece’s baked water', () => {
  it('loads each piece’s surfaces, and nothing that isn’t one', async () => {
    serve()
    const loaded = await Promise.all(WATER_PIECES.map((piece) => loadWaterPiece(piece)))
    expect(loaded.map((water) => water?.bodies.map((b) => b.body.node))).toEqual([
      ['water_pond', 'water_fall'],
      ['water_lake', 'water_river', 'water_fall'],
      ['water_tarn', 'water_spring'],
    ])
    for (const water of loaded)
      for (const { body } of water!.bodies) {
        if (body.node === 'water_fall') expect(body.kind).toBe('fall')
        expect(['skirt', 'mist', 'steam'], body.node).not.toContain(body.kind)
      }
    expect(warn).not.toHaveBeenCalled()
  })

  it('draws the river and the outflow as one body, its u running on', async () => {
    serve()
    const water = (await loadWaterPiece('wetland'))!
    const listed = waterJson().pieces.wetland.bodies.find((b) => b.node === 'water_river')!
    const river = water.bodies.find((b) => b.body.node === 'water_river')!
    expect(river.body.kind).toBe('ribbon')
    expect(river.body.uStart).toBeCloseTo(3.4457, 4)
    expect(river.body.length).toBeCloseTo(12.0844, 4)
    expect(river.body.vhead).toEqual([3.6457, 5.0457])
    expect(river.body.palette).toBe(listed.palette)
    expect(river.body.ripples).toEqual(listed.ripples)
    expect(river.body.fillFrom).toBeNull()
    expect(river.parts).toEqual([
      { node: 'water_river', length: 7.9566 },
      { node: 'water_outflow', length: 4.1278 },
    ])
    const [baked, outflow] = [bakedBody('water_wetland.glb', 'water_river'), bakedBody('water_wetland.glb', 'water_outflow')]
    const count = (mesh: { geometry: THREE.BufferGeometry }) => mesh.geometry.getAttribute('position').count
    expect(count(river)).toBe(count(baked) + count(outflow))
    expect(river.geometry.getIndex()!.count).toBe(baked.geometry.getIndex()!.count + outflow.geometry.getIndex()!.count)
    expect(water.bodies.find((b) => b.body.node === 'water_lake')!.parts).toEqual([{ node: 'water_lake', length: 0 }])
  })

  // The two run on as one only where the outflow's u start is the river's end to within 1e-3 u, and both are numbers.
  it.each<[string, (river: WaterBody, outflow: WaterBody) => void]>([
    ['the outflow starts 0.01 u past the river’s end', (river, outflow) => (outflow.uStart = river.uStart! + river.length! + 0.01)],
    ['the outflow starts 0.01 u short of the river’s end', (river, outflow) => (outflow.uStart = river.uStart! + river.length! - 0.01)],
    ['the river has no length (a NaN in the bake)', (river, outflow) => ((outflow.uStart = river.uStart), (river.length = null))],
  ])('draws the river and the outflow apart when %s', async (_name, edit) => {
    const json = waterJson()
    const listed = json.pieces.wetland.bodies
    edit(listed.find((b) => b.node === 'water_river')!, listed.find((b) => b.node === 'water_outflow')!)
    serve({ 'water.json': JSON.stringify(json) })
    const water = (await loadWaterPiece('wetland'))!
    expect(water.bodies.map((b) => b.body.node)).toEqual(['water_lake', 'water_river', 'water_outflow', 'water_fall'])
    for (const node of ['water_river', 'water_outflow']) {
      const { body, geometry, parts } = water.bodies.find((b) => b.body.node === node)!
      const own = listed.find((b) => b.node === node)!
      expect(body, node).toEqual(own)
      expect(parts, node).toEqual([{ node, length: own.length ?? 0 }])
      expect(geometry.getAttribute('position').count, node).toBe(bakedBody('water_wetland.glb', node).geometry.getAttribute('position').count)
    }
    expect(warn).not.toHaveBeenCalled()
  })

  it('runs them on as one when the outflow starts within 1e-3 u of the river’s end', async () => {
    const json = waterJson()
    const [river, outflow] = ['water_river', 'water_outflow'].map((node) => json.pieces.wetland.bodies.find((b) => b.node === node)!)
    outflow.uStart = river.uStart! + river.length! + 5e-4
    serve({ 'water.json': JSON.stringify(json) })
    const water = (await loadWaterPiece('wetland'))!
    expect(water.bodies.map((b) => b.body.node)).toEqual(['water_lake', 'water_river', 'water_fall'])
    expect(water.bodies[1].parts.map((p) => p.node)).toEqual(['water_river', 'water_outflow'])
  })

  it('fetches water.json and the noise once for the session, however many pieces load', async () => {
    const stub = serve()
    const main = await loadWaterPiece('main')
    const [wetland, highland] = await Promise.all([loadWaterPiece('wetland'), loadWaterPiece('highland')])
    expect(asked(stub)).toEqual([
      'water.json', 'water_highland.glb', 'water_highland.map.bin', 'water_main.glb', 'water_main.map.bin', 'water_noise.bin', 'water_wetland.glb', 'water_wetland.map.bin',
    ])
    expect(wetland!.noise).toBe(main!.noise)
    expect(highland!.noise).toBe(main!.noise)
  })

  it('falls back alone when one piece’s map is missing', async () => {
    const stub = serve({ 'water_wetland.map.bin': 404 })
    expect(await loadWaterPiece('wetland')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('wetland')
    const [main, highland] = await Promise.all([loadWaterPiece('main'), loadWaterPiece('highland')])
    expect(main).not.toBeNull()
    expect(highland!.noise).toBe(main!.noise)
    expect(asked(stub).filter((file) => file === 'water.json' || file === 'water_noise.bin')).toEqual(['water.json', 'water_noise.bin'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('bakes a node’s transform into its mesh, and only that node’s', async () => {
    serve()
    const plain = (await loadWaterPiece('highland'))!
    serve({ 'water_highland.glb': withNodeTransform(bytesOf('water_highland.glb'), 'water_spring', [1, 0.5, -2]) })
    const moved = (await loadWaterPiece('highland'))!
    const box = (water: LoadedWater, node: string) => {
      const { geometry } = water.bodies.find((b) => b.body.node === node)!
      geometry.computeBoundingBox()
      return geometry.boundingBox!
    }
    const offset = new THREE.Vector3(1, 0.5, -2)
    const [was, is] = [box(plain, 'water_spring'), box(moved, 'water_spring')]
    for (const [got, want] of [[is.min, was.min.clone().add(offset)], [is.max, was.max.clone().add(offset)]])
      for (const axis of ['x', 'y', 'z'] as const) expect(Math.abs(got[axis] - want[axis]), axis).toBeLessThanOrEqual(1e-5)
    expect(box(moved, 'water_tarn').equals(box(plain, 'water_tarn'))).toBe(true)
  })

  // Pieces mount their water inside their group (I7): the pivot is pinned to the docked place and a load ignores it.
  it('has each piece’s pivot at its docked place, and loads a piece whatever its pivot says', async () => {
    for (const id of WATER_PIECES) expect(waterJson().pieces[id].pivot, id).toEqual(PIECES[id].dockedPosition)
    serve(
      edited((json) => {
        delete (json.pieces.main as Partial<WaterPiece>).pivot
        json.pieces.wetland.pivot = [0, Number.NaN, 0]
      }),
    )
    expect(await loadWaterPiece('main')).not.toBeNull()
    expect(await loadWaterPiece('wetland')).not.toBeNull()
    expect(warn).not.toHaveBeenCalled()
  })

  it('lets go of a piece’s water but keeps the shared noise', async () => {
    serve()
    const water = (await loadWaterPiece('wetland'))!
    const geometries = water.bodies.map((b) => vi.spyOn(b.geometry, 'dispose'))
    const [map, noise] = [vi.spyOn(water.map, 'dispose'), vi.spyOn(water.noise, 'dispose')]
    disposeWater(water)
    for (const spy of geometries) expect(spy).toHaveBeenCalledTimes(1)
    expect(map).toHaveBeenCalledTimes(1)
    expect(noise).not.toHaveBeenCalled()
  })

  // Spec §5, for a farm with every piece: about 0.90 MB of textures with mips, 674 KB of maps and noise, 40 KB of GLB, 761 triangles, 11 draws.
  it('fits the spec’s budgets', async () => {
    const json = waterJson()
    const [KB, MB] = [1e3, 1e6]
    const sum = (files: string[]) => files.reduce((total, file) => total + bytesOf(file).length, 0)
    const bins = [...WATER_PIECES.map((id) => json.pieces[id].map.file), json.noise.file]
    expect((sum(bins) * 4) / 3, 'texture memory (mips a third more)').toBeLessThanOrEqual(1.5 * MB)
    expect(sum(bins), 'the maps and the noise').toBeLessThanOrEqual(0.8 * MB)
    expect(sum(WATER_PIECES.map((id) => json.pieces[id].glb)), 'the GLBs').toBeLessThanOrEqual(150 * KB)
    let triangles = 0
    for (const id of WATER_PIECES) {
      const notDrawn = json.pieces[id].bodies.filter((b) => !['still', 'ribbon', 'fall'].includes(b.kind)).map((b) => b.node)
      for (const mesh of glbMeshes(fileURLToPath(new URL(json.pieces[id].glb, models)), notDrawn)) triangles += mesh.geometry.getIndex()!.count / 3
    }
    expect(triangles, 'triangles').toBeLessThanOrEqual(4000)
    serve()
    const loaded = await Promise.all(WATER_PIECES.map((piece) => loadWaterPiece(piece)))
    expect(loaded.reduce((total, water) => total + water!.bodies.length, 0) + 4, 'draw calls').toBeLessThanOrEqual(12)
  })
})

describe('when the water can\'t be loaded', () => {
  // [what failed, what is served, text the warning names (in its second argument)]
  const FAILURES: [string, () => Served, string?][] = [
    ['the map is missing', () => ({ 'water_main.map.bin': 404 }), 'water_main.map.bin'],
    ['the format is unknown', () => edited((json) => (json.format = 'gitaway.water/2')), 'gitaway.water/2'],
    ['water.json has no layers', () => edited((json) => delete (json as Partial<WaterJson>).layers), 'layers'],
    ['water.json is missing', () => ({ 'water.json': 404 })],
    ['water.json is not JSON', () => ({ 'water.json': '{ "format": ' })],
    ['it has no format', () => edited((json) => delete (json as Partial<WaterJson>).format)],
    ['the noise is missing', () => ({ 'water_noise.bin': 404 })],
    ['the GLB is missing', () => ({ 'water_main.glb': 500 })],
    ['the network fails', () => ({ 'water_main.map.bin': new TypeError('Failed to fetch') })],
    ['the map is the wrong length', () => ({ 'water_main.map.bin': bytesOf('water_main.map.bin').subarray(0, 98000) })],
    ['the map is for a different size', () => edited((json) => (json.pieces.main.map.size = [192, 127]))],
    ['the noise is the wrong length', () => ({ 'water_noise.bin': bytesOf('water_noise.bin').subarray(0, 16384) })],
    ['the GLB is not a GLB', () => ({ 'water_main.glb': 'this is not a model' })],
    ['the GLB lacks the pond\'s node', () => edited((json) => (json.pieces.main.bodies[0].node = 'water_nowhere'))],
    ['the pond\'s node is not a mesh', () => edited((json) => (json.pieces.main.bodies[0].node = 'mist_fall'))],
    ['the pond\'s mesh has no uvs', () => ({ 'water_main.glb': glbWithout('TEXCOORD_0') })],
    ['the pond\'s mesh has no normals', () => ({ 'water_main.glb': glbWithout('NORMAL') })],
    ['water.json has no surface to draw for MAIN', () => edited((json) => (json.pieces.main.bodies = json.pieces.main.bodies.filter((b) => b.kind === 'skirt' || b.kind === 'mist')))],
    ['water.json has no MAIN', () => edited((json) => delete (json.pieces as Partial<WaterJson['pieces']>).main)],
    ['the layers have no bands', () => edited((json) => delete (json.layers as Partial<WaterJson['layers']>).bands)],
    ['the layers\' bands are one number', () => edited((json) => (json.layers.bands = [0.08] as unknown as WaterJson['layers']['bands']))],
    ['the layers\' bands are not finite', () => edited((json) => (json.layers.bands = [0.08, Number.NaN]))],
    ['the layers have no softness', () => edited((json) => delete (json.layers as Partial<WaterJson['layers']>).bandSoft)],
    ['the farm fall’s retreat has no length', () => edited((json) => delete json.pieces.main.bodies.find((b) => b.node === 'water_fall')!.fillFrom!.retreat)],
  ]
  it.each(FAILURES)('returns null and warns once when %s', async (_name, served, text) => {
    serve(served())
    expect(await loadWaterPiece('main')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    if (text) expect(String(warn.mock.calls[0][1])).toContain(text)
  })

  // The wetland's fills are read when it is built, while the world renders: a bad one fails the load too.
  it('names a wetland fill that follows a body water.json hasn’t', async () => {
    serve(edited((json) => (json.pieces.wetland.bodies.find((b) => b.node === 'water_outflow')!.fillFrom = { after: 'water_rivr', seconds: 1 })))
    expect(await loadWaterPiece('wetland')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][1])).toContain('water_rivr')
  })

  // A piece that has failed has no use for its other files: its map stops coming. water.json and the noise go on.
  it('stops its other downloads when one of them fails', async () => {
    const signals: Record<string, AbortSignal | undefined> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const name = nameOf(input)
        signals[name] = init?.signal ?? undefined
        if (name === 'water_wetland.glb') return new Response('not here', { status: 404 })
        if (name === 'water_wetland.map.bin') return new Promise<Response>(() => {}) // still coming when the GLB fails
        return new Response(bytesOf(name) as BodyInit)
      }),
    )
    expect(await loadWaterPiece('wetland')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(signals['water_wetland.map.bin']?.aborted, 'the map, still coming').toBe(true)
    expect(signals['water.json']?.aborted, 'the session’s water.json').toBe(false)
    expect(signals['water_noise.bin']?.aborted, 'the session’s noise').toBe(false)
  })

  // water.json is the session's: once failed, a piece asked after fails at once with its own warning, and nothing asks again.
  it('keeps a failed water.json failed for the session, each piece warning for itself', async () => {
    const stub = serve({ 'water.json': 404 })
    expect(await loadWaterPiece('main')).toBeNull()
    expect(await loadWaterPiece('wetland')).toBeNull()
    expect(asked(stub)).toEqual(['water.json'])
    expect(warn).toHaveBeenCalledTimes(2)
    expect(String(warn.mock.calls[0][0])).toContain('main')
    expect(String(warn.mock.calls[1][0])).toContain('wetland')
  })
})

// A download that never finishes must not leave the world's models loading for good: after PIECE_TIMEOUT_MS it fails
// like any other, to null, one warning and today's water.
describe('a download that stalls', () => {
  // Only the timers are faked: reading a Response's body needs the rest of the event loop.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Stubs `fetch` to serve public/models, except for the named files (all, if none is named), which never answer. */
  function stall(...files: string[]) {
    const stub = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const name = nameOf(input)
      if (files.length === 0 || files.includes(name)) return new Promise<Response>(() => {})
      return new Response(bytesOf(name) as BodyInit)
    })
    vi.stubGlobal('fetch', stub)
    return stub
  }

  /** Starts a load and says what it came to, if it has: `undefined` while it is still waiting. */
  function start() {
    const outcome: { result?: LoadedWater | null } = {}
    const done = loadWaterPiece('main').then((result) => {
      outcome.result = result
    })
    return { outcome, done }
  }

  it.each([[''], ['water.json'], ['water_main.map.bin'], ['water_noise.bin'], ['water_main.glb']])('gives up after the ground’s own wait, null with one warning, ending its loading item as a failure (stalled: %s)', async (file) => {
    stall(...(file ? [file] : []))
    const items = watch()
    const { outcome } = start()
    await vi.advanceTimersByTimeAsync(PIECE_TIMEOUT_MS - 1)
    expect([outcome, warn.mock.calls.length, items.started(), items.ended(), items.failed()]).toEqual([{}, 0, 1, 0, 0])
    await vi.advanceTimersByTimeAsync(1)
    expect(outcome.result).toBeNull()
    expect(String(warn.mock.calls[0][1])).toContain(`${PIECE_TIMEOUT_MS / 1000} s`)
    await vi.advanceTimersByTimeAsync(PIECE_TIMEOUT_MS * 3)
    expect([warn.mock.calls.length, items.ended(), items.failed()]).toEqual([1, 1, 1])
  })

  // water.json and the noise have their own limit from the session's first ask: a piece asked later waits no longer than that.
  it('gives water.json and the noise their own limit, from the first ask, and cancels the download', async () => {
    const stub = stall('water.json')
    const outcome: Partial<Record<WaterPieceId, LoadedWater | null>> = {}
    const ask = (piece: WaterPieceId) => {
      void loadWaterPiece(piece).then((result) => {
        outcome[piece] = result
      })
    }
    ask('main')
    await vi.advanceTimersByTimeAsync(5000)
    ask('wetland')
    await vi.advanceTimersByTimeAsync(PIECE_TIMEOUT_MS - 5000 - 1)
    expect(outcome, 'both still waiting just before the limit').toEqual({})
    expect(stub.mock.calls[0][1]?.signal?.aborted, 'still wanted before the limit').toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(outcome).toEqual({ main: null, wetland: null })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(String(warn.mock.calls[1][0])).toContain('wetland')
    expect(String(warn.mock.calls[1][1])).toContain('water.json')
    expect(stub).toHaveBeenCalledTimes(1) // water.json first; the rest wait on it
    expect(stub.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(vi.getTimerCount(), 'no limit left running').toBe(0)
  })

  it('stays failed through waterPiece: no second try, no second warning', async () => {
    const stub = stall()
    const { waterPiece } = await fresh()
    const first = waterPiece('main')
    await vi.advanceTimersByTimeAsync(PIECE_TIMEOUT_MS)
    expect(await first).toBeNull()
    expect(await waterPiece('main')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(stub).toHaveBeenCalledTimes(1)
  })

  it('lets a slow load that comes in time through, and leaves no timer behind', async () => {
    const slow = PIECE_TIMEOUT_MS - 1000 // water.json takes most of the wait; the rest come at once
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const name = nameOf(input)
        if (name === 'water.json') await new Promise((resolve) => setTimeout(resolve, slow))
        return new Response(bytesOf(name) as BodyInit)
      }),
    )
    const { outcome, done } = start()
    await vi.advanceTimersByTimeAsync(slow)
    await done
    expect(outcome.result).not.toBeNull()
    expect(warn).not.toHaveBeenCalled()
    expect(vi.getTimerCount(), 'the limit is no longer running').toBe(0)
  })

  it('leaves no timer behind when the load fails some other way', async () => {
    serve({ 'water_main.map.bin': 404 })
    await loadWaterPiece('main')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1)
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(0))
  })
})

// The water is fetched outside three's loaders, so it tells the loading manager itself: one item, `water:<piece>`,
// from the moment it is asked for until it is in or has failed, so nothing lands after the world says it has loaded.
describe('three’s loading manager', () => {
  it('counts the water as loading from the moment it is asked for until it is in', async () => {
    serve()
    const items = watch()
    const loading = loadWaterPiece('main')
    expect([items.started(), items.ended()]).toEqual([1, 0]) // at once, before any file has come back
    expect(await loading).not.toBeNull()
    expect([items.ended(), items.failed()]).toEqual([1, 0])
  })

  it('still ends its item when the load fails, so the world never waits on it', async () => {
    serve({ 'water_main.map.bin': 404 })
    const items = watch()
    expect(await loadWaterPiece('main')).toBeNull()
    expect([items.started(), items.failed(), items.ended()]).toEqual([1, 1, 1])
  })

  it('counts it once a session, however often it is asked for', async () => {
    serve()
    vi.resetModules()
    const [{ waterPiece }, { DefaultLoadingManager }] = await Promise.all([import('./load'), import('three')])
    const start = vi.spyOn(DefaultLoadingManager, 'itemStart')
    const end = vi.spyOn(DefaultLoadingManager, 'itemEnd')
    putBack.push(() => {
      start.mockRestore()
      end.mockRestore()
    })
    await Promise.all([waterPiece('main'), waterPiece('main')])
    await waterPiece('main')
    expect(start.mock.calls.filter(([u]) => u === ITEM)).toHaveLength(1)
    expect(end.mock.calls.filter(([u]) => u === ITEM)).toHaveLength(1)
  })
})

// The game asks for a piece's water through waterPiece, once a session: StrictMode's double effects and remounts must
// not fetch again or warn twice.
describe('waterPiece', () => {
  it.each([[{}, true], [{ 'water_main.map.bin': 404 }, false]])('loads a piece once, however often it is asked for, and warns once on failure (%j)', async (instead, ok) => {
    const stub = serve(instead)
    const { waterPiece } = await fresh()
    const first = waterPiece('main')
    expect(waterPiece('main')).toBe(first)
    const water = await first
    expect(water !== null).toBe(ok)
    expect(await waterPiece('main')).toBe(water)
    expect(stub).toHaveBeenCalledTimes(4)
    expect(warn).toHaveBeenCalledTimes(ok ? 0 : 1)
  })

})

// A water that loaded but that the GPU can't draw (build.ts watchWaterPrograms) is given up on like a failed load.
describe('giveUpOnWater', () => {
  it('drops a loaded piece’s water for the session, with one warning however often it is told, and fetches nothing again', async () => {
    const stub = serve()
    const { waterPiece, giveUpOnWater } = await fresh()
    expect(await waterPiece('main')).not.toBeNull()
    giveUpOnWater('main')
    giveUpOnWater('main')
    expect(await waterPiece('main')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/^The main piece's baked water can't be drawn on this device .*, so its water is drawn as it was\.$/)
    expect(stub).toHaveBeenCalledTimes(4)
  })
})

// The world asks for the farm's water, and each bought piece's, as it mounts, so each counts among three's loading
// manager's items from when its ground is needed. A piece not bought is never asked for. With the switch off, nothing.
describe('askForWater', () => {
  /** load.ts, three and the switches afresh from one module registry: the cache is empty and the spy is on the manager this load.ts tells. */
  async function freshAsk() {
    vi.resetModules()
    const [load, three, testing] = await Promise.all([import('./load'), import('three'), import('../../game/testing')])
    const start = vi.spyOn(three.DefaultLoadingManager, 'itemStart')
    putBack.push(() => start.mockRestore())
    const started = (item = ITEM) => start.mock.calls.filter(([url]) => url === item).length
    return { ...load, withFeatures: testing.withFeatures, started }
  }

  it('asks for the farm’s water and each piece it has, never one it hasn’t bought', async () => {
    const stub = serve()
    const { askForWater, waterPiece, waterPiecesFor, withFeatures, started } = await freshAsk()
    expect(waterPiecesFor(['highland', 'meadow', 'wetland'])).toEqual(['main', 'wetland', 'highland'])
    expect(waterPiecesFor([])).toEqual(['main'])
    withFeatures({ water: true }, () => askForWater(waterPiecesFor(['meadow', 'wetland'])))
    expect([started('water:main'), started('water:wetland'), started('water:highland')]).toEqual([1, 1, 0])
    await Promise.all([waterPiece('main'), waterPiece('wetland')])
    expect(asked(stub)).toEqual(expect.arrayContaining(['water_main.map.bin', 'water_main.glb', 'water_wetland.map.bin', 'water_wetland.glb']))
    expect(asked(stub).filter((file) => file.includes('highland'))).toEqual([])
  })

  it('with the switch on, starts the load there and then, and the pond’s own ask gets the same load', async () => {
    const stub = serve()
    const { askForWater, waterPiece, withFeatures, started } = await freshAsk()
    withFeatures({ water: true }, () => askForWater(['main']))
    expect([started(), stub.mock.calls.length]).toEqual([1, 1]) // the manager has the item, water.json is asked for
    expect(await waterPiece('main')).not.toBeNull()
    expect(started()).toBe(1)
    expect(stub).toHaveBeenCalledTimes(4)
  })

  it('with the switch off, fetches nothing and tells the manager nothing', async () => {
    const stub = serve()
    const { askForWater, withFeatures, started } = await freshAsk()
    withFeatures({ water: false }, () => askForWater(['main', 'wetland']))
    expect(started()).toBe(0)
    expect(stub).not.toHaveBeenCalled()
  })
})

describe('the texture builders', () => {
  it('wrap raw RGBA8 bytes (map, clamped) and RG8 bytes (noise, repeating) as linear data textures', () => {
    const bytes = new Uint8Array(5 * 3 * 4).map((_, i) => i)
    const map = makeMapTexture(bytes, [5, 3])
    expectDataTexture(map, [5, 3], THREE.RGBAFormat, THREE.ClampToEdgeWrapping)
    expect(map.image.data).toBe(bytes)
    const noiseBytes = new Uint8Array(4 * 4 * 2)
    const noise = makeNoiseTexture(noiseBytes, [4, 4])
    expectDataTexture(noise, [4, 4], THREE.RGFormat, THREE.RepeatWrapping)
    expect(noise.image.data).toBe(noiseBytes)
  })

  it('refuse bytes that don\'t fill their size', () => {
    expect(() => makeMapTexture(new Uint8Array(5 * 3 * 4 - 1), [5, 3])).toThrow(/60/)
    expect(() => makeMapTexture(new Uint8Array(5 * 3 * 4 + 4), [5, 3])).toThrow()
    expect(() => makeNoiseTexture(new Uint8Array(4 * 4 * 2 - 1), [4, 4])).toThrow(/32/)
  })
})

// A re-bake that moves a number the generated core also holds must fail here, not draw quietly with the wrong colours.
describe('water.json and the core agree', () => {
  it('on the format, palettes, layers, and noise and map texels', () => {
    const json = waterJson()
    expect(json.format).toBe(WATER_FORMAT)
    expect(json.palettes).toEqual(PALETTES)
    expect(json.layers.bands).toEqual([...BANDS])
    expect(json.layers.bandSoft).toBe(BAND_SOFT)
    expect(json.noise.size).toEqual([NOISE_SIZE, NOISE_SIZE])
    for (const piece of Object.values(json.pieces)) expect(piece.map.texel).toBe(TEXEL)
  })
})
