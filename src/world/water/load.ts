import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { isOn } from '../../game/features'
import type { IsleId } from '../layout'
import { PIECE_TIMEOUT_MS } from '../pieceLoader'
import { WATER_FORMAT } from './core.gen'
import { fillPlan } from './fill'
import { WATER_PIECES, type WaterPieceId } from './report'
import type { LoadedBody, WaterBody, WaterBodyKind, WaterJson } from './types'

// Loading each piece's baked water (spec §4.2, "Loading the maps"): the piece's
// map and water GLB, fetched the way pieceLoader.ts fetches the ground, behind
// water.json and the noise, which every piece shares and which are fetched once
// for the session. A piece's water is asked for when the farm has the piece
// (askForWater): MAIN's and each piece the farm has as the world mounts, and a
// bought piece's with its ground, never a piece not bought.
//
// Nothing here is allowed to leave a hole. If any file is missing or isn't what
// water.json says, or is still coming PIECE_TIMEOUT_MS (the ground's own wait)
// after it was asked for, that piece's result is null with one warning naming
// it, and that piece keeps today's water. The other pieces load as they would.

/** What the water of one piece needs to be drawn: its bodies' meshes, its map and the noise, and where the map stands. */
export interface LoadedWater {
  json: WaterJson
  /** The surfaces drawn from this load, each with its mesh in the piece's frame and the bodies of water.json it is made of. */
  bodies: LoadedBody[]
  map: THREE.DataTexture
  /** The session's noise, which every piece shares: never one piece's to let go of. */
  noise: THREE.DataTexture
  /** The map's corner (piece-local x, z) and size (u). */
  origin: [number, number]
  extent: [number, number]
}

/**
 * The kinds of body drawn: still water, ribbons and the falls' sheets (I2). The skirts are depth only, for an
 * outline pass the game hasn't, and the mists and steam are billboards (PR 5): not surfaces this draws.
 */
const DRAWN: readonly WaterBodyKind[] = ['still', 'ribbon', 'fall']

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

async function get(file: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url(file), { signal })
  if (!response.ok) throw new Error(`${file}: ${response.status}`)
  return response
}

const bytesOf = async (file: string, signal: AbortSignal) => new Uint8Array(await (await get(file, signal)).arrayBuffer())

/**
 * A promise that rejects, and cancels `cancel`, PIECE_TIMEOUT_MS from now,
 * saying what took too long; and the means to stop it.
 */
function limit(what: string, cancel: AbortController): { stalled: Promise<never>; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${what} took longer than ${PIECE_TIMEOUT_MS / 1000} s`)
      reject(error)
      cancel.abort(error)
    }, PIECE_TIMEOUT_MS)
  })
  return { stalled, stop: () => clearTimeout(timer) }
}

// ---- the textures --------------------------------------------------------------

/** Raw bytes as a linear data texture with GPU-built mipmaps (linear data: no colour space). */
function dataTexture(bytes: Uint8Array, [width, height]: readonly [number, number], format: THREE.PixelFormat, channels: number, wrap: THREE.Wrapping): THREE.DataTexture {
  if (bytes.length !== width * height * channels) throw new RangeError(`a ${width}×${height} texture of ${channels} bytes a texel needs ${width * height * channels} bytes, not ${bytes.length}`)
  const texture = new THREE.DataTexture(bytes, width, height, format, THREE.UnsignedByteType)
  texture.colorSpace = THREE.NoColorSpace
  texture.wrapS = texture.wrapT = wrap
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}

/** A piece's water map (RGBA8, row-major, x fastest): clamped at its edge. */
export function makeMapTexture(bytes: Uint8Array, size: readonly [number, number]): THREE.DataTexture {
  return dataTexture(bytes, size, THREE.RGBAFormat, 4, THREE.ClampToEdgeWrapping)
}

/** The shared noise (RG8, two decorrelated channels): tileable, so repeated. */
export function makeNoiseTexture(bytes: Uint8Array, size: readonly [number, number]): THREE.DataTexture {
  return dataTexture(bytes, size, THREE.RGFormat, 2, THREE.RepeatWrapping)
}

// ---- the meshes ----------------------------------------------------------------

const parseGlb = (buffer: ArrayBuffer) => new Promise<THREE.Group>((resolve, reject) => new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf.scene), reject))

/** The first mesh at or under an object. */
function firstMesh(object: THREE.Object3D): THREE.Mesh | undefined {
  if ((object as THREE.Mesh).isMesh) return object as THREE.Mesh
  for (const child of object.children) {
    const found = firstMesh(child)
    if (found) return found
  }
  return undefined
}

/** A body's mesh geometry, with the node's transform baked in (the water is drawn in the piece's own coordinates). */
function geometryOf(scene: THREE.Group, node: string): THREE.BufferGeometry {
  const found = scene.getObjectByName(node)
  if (!found) throw new Error(`the GLB has no node ${node}`)
  const mesh = firstMesh(found)
  if (!mesh) throw new Error(`${node} is not a mesh`)
  const { geometry, material } = mesh
  // the material is the GLB's placeholder, which the game replaces
  for (const m of Array.isArray(material) ? material : [material]) m.dispose()
  // what the water shader reads: the uv is the body's stream length and across, and the lights want a normal
  for (const name of ['position', 'normal', 'uv']) if (!geometry.getAttribute(name)) throw new Error(`${node} has no ${name}`)
  scene.updateMatrixWorld(true)
  if (!mesh.matrixWorld.equals(new THREE.Matrix4())) geometry.applyMatrix4(mesh.matrixWorld)
  geometry.computeBoundingSphere()
  return geometry
}

const RIVER = 'water_river'
const OUTFLOW = 'water_outflow'

/** How far apart (u) the river's end and the outflow's start may be for the two to run on as one ribbon. */
const RUNS_ON = 1e-3

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * The river's and the outflow's lengths, when the outflow's u runs on from
 * the river's end so that the two can be drawn as one ribbon (spec §4.2, I3);
 * null when the piece hasn't both, or they don't meet.
 */
function runOn(river: WaterBody | undefined, outflow: WaterBody | undefined): [number, number] | null {
  if (!river || !outflow || !finite(river.uStart) || !finite(river.length) || !finite(outflow.uStart) || !finite(outflow.length)) return null
  return Math.abs(outflow.uStart - (river.uStart + river.length)) <= RUNS_ON ? [river.length, outflow.length] : null
}

/**
 * The river and the outflow as one ribbon: one mesh (their meshes merged,
 * whole) and one body, the river's (its start, virtual head, ripples and
 * palette) running the length of both. It has no fill of its own: its parts,
 * the river and then the outflow, carry water.json's fills.
 */
function riverRunningOn(scene: THREE.Group, river: WaterBody, [riverLength, outflowLength]: [number, number]): LoadedBody {
  const parts = [geometryOf(scene, RIVER), geometryOf(scene, OUTFLOW)]
  const geometry = mergeGeometries(parts)
  if (!geometry) throw new Error(`${RIVER} and ${OUTFLOW} can't be drawn as one mesh`)
  for (const part of parts) part.dispose()
  geometry.computeBoundingSphere()
  return {
    body: { ...river, length: riverLength + outflowLength, fillFrom: null },
    geometry,
    parts: [
      { node: RIVER, length: riverLength },
      { node: OUTFLOW, length: outflowLength },
    ],
  }
}

/** The surfaces drawn of a piece's listed bodies, in water.json's order: each its own, but the river and outflow as one where they run on. */
function surfacesOf(scene: THREE.Group, wanted: readonly WaterBody[]): LoadedBody[] {
  const river = wanted.find((b) => b.node === RIVER)
  const outflow = wanted.find((b) => b.node === OUTFLOW)
  const lengths = runOn(river, outflow)
  return wanted.flatMap((body): LoadedBody[] => {
    if (lengths && body === outflow) return []
    if (lengths && body === river) return [riverRunningOn(scene, body, lengths)]
    return [{ body, geometry: geometryOf(scene, body.node), parts: [{ node: body.node, length: body.length ?? 0 }] }]
  })
}

// ---- what every piece shares ----------------------------------------------------

/** Whether a value is a list of `length` finite numbers (a JSON NaN is null, and isn't one). */
const finiteNumbers = (value: unknown, length: number): boolean => Array.isArray(value) && value.length === length && value.every(finite)

/** water.json, once it is in and in a form the game reads, with the layers the draw uses. */
async function fetchJson(signal: AbortSignal): Promise<WaterJson> {
  const json = (await (await get('water.json', signal)).json()) as WaterJson
  if (json.format !== WATER_FORMAT) throw new Error(`water.json is format ${JSON.stringify(json.format)}, and the game reads ${WATER_FORMAT}`)
  // What the draw reads from the json (the layers, driver.ts) must be usable now: a file without it would load and
  // then throw while the world renders, and the can't-draw notice would take the place of today's water. Failing
  // here keeps today's water, as a missing file does.
  const { layers } = json
  if (!layers || !finiteNumbers(layers.bands, 2) || !Number.isFinite(layers.bandSoft)) {
    throw new Error(`water.json has no usable layers: they need two band depths and a softness, not ${JSON.stringify(layers)}`)
  }
  return json
}

/** What every piece's water shares: water.json, then the noise it names. */
interface SessionLoad {
  json: Promise<WaterJson>
  noise: Promise<THREE.DataTexture>
  /** Stops it: its limit, and whatever of it is still coming. */
  stop: () => void
}

/**
 * Starts fetching water.json and the noise, with their own limit:
 * PIECE_TIMEOUT_MS from now, after which whatever of them is still coming is
 * cancelled, and they fail. The noise follows water.json, which names it.
 */
function startSession(): SessionLoad {
  const cancel = new AbortController()
  const { stalled, stop } = limit('water.json and the noise', cancel)
  const json = Promise.race([fetchJson(cancel.signal), stalled])
  const noise = Promise.race([json.then(async ({ noise: { file, size } }) => makeNoiseTexture(await bytesOf(file, cancel.signal), size)), stalled]).finally(stop)
  // The pieces that ask hear of a failure, each for itself; one that has stopped waiting (its own limit) no longer
  // listens, and that is not a failure left unheard.
  json.catch(() => {})
  noise.catch(() => {})
  return {
    json,
    noise,
    stop: () => {
      stop()
      cancel.abort()
    },
  }
}

/** water.json and the noise, fetched once for the session, as every piece's water needs them: a failure stays failed. */
let session: SessionLoad | undefined

const shared = (): SessionLoad => (session ??= startSession())

/** For tests: forgets the session's water.json and noise, stopping whatever of them is still coming, so the next ask fetches them afresh. */
export function resetSessionLoad(): void {
  session?.stop()
  session = undefined
}

// ---- loading -------------------------------------------------------------------

async function load(piece: WaterPieceId, { json: jsonLoad, noise: noiseLoad }: SessionLoad, signal: AbortSignal): Promise<LoadedWater> {
  const json = await jsonLoad
  const listing = (json.pieces as Partial<WaterJson['pieces']>)[piece]
  if (!listing) throw new Error(`water.json has no ${piece} piece`)
  const { map: mapInfo, glb, bodies: listed } = listing
  const wanted = listed.filter((b) => DRAWN.includes(b.kind))
  if (wanted.length === 0) throw new Error(`water.json lists no surface to draw for ${piece}`)
  // The fills must be usable now, as the layers must (fetchJson): build.ts reads them with fill.ts fillPlan, which
  // throws, naming the body, for one it can't. (The pivot is the data's own: the piece's group places its water, I7.)
  fillPlan(listed)

  const [mapBytes, glbBytes, noise] = await Promise.all([bytesOf(mapInfo.file, signal), bytesOf(glb, signal), noiseLoad])
  const map = makeMapTexture(mapBytes, mapInfo.size)
  const scene = await parseGlb(glbBytes.buffer.slice(glbBytes.byteOffset, glbBytes.byteOffset + glbBytes.byteLength) as ArrayBuffer)
  const bodies = surfacesOf(scene, wanted)

  return {
    json,
    bodies,
    map,
    noise,
    origin: [mapInfo.origin[0], mapInfo.origin[1]],
    extent: [mapInfo.size[0] * mapInfo.texel, mapInfo.size[1] * mapInfo.texel],
  }
}

/**
 * A piece's baked water, ready for createWaterMaterial: its surfaces' meshes
 * (the wetland's river and outflow as one, and the falls' sheets), its map and
 * the session's noise as textures. Resolves to null, with one console.warn
 * naming the piece, if anything fails: a file that is missing or the wrong
 * size, a format this game doesn't read, a water.json without the piece, the
 * layers or the fills the draw uses, or a mesh that lacks what the shader
 * needs. One piece failing leaves the others be, and water.json and the noise,
 * shared and fetched once for the session, stay theirs.
 *
 * Its files are fetched outside three's loaders, so it tells three's default
 * loading manager itself, as one item (`water:<piece>`), from the call until
 * it is in or has failed (an error, then the end, as three's own loaders do):
 * the world's `data-models` (drei's useProgress) says the models are in only
 * once the water has settled too, and a failure never leaves it waiting.
 *
 * A download that stalls fails too: PIECE_TIMEOUT_MS after the call, as the
 * ground's files do (pieceLoader.ts), whatever of the piece's own is still
 * coming is cancelled and it settles as a failure, so a dead connection can't
 * hold the models "loading" for good. water.json and the noise have the same
 * limit of their own, from the first ask. A piece that fails any other way
 * cancels whatever of its own is still coming too (a map, on a phone).
 */
export async function loadWaterPiece(piece: WaterPieceId): Promise<LoadedWater | null> {
  const manager = THREE.DefaultLoadingManager
  const item = `water:${piece}`
  manager.itemStart(item)
  const cancel = new AbortController()
  const { stalled, stop } = limit('its files', cancel)
  try {
    return await Promise.race([load(piece, shared(), cancel.signal), stalled])
  } catch (error) {
    // Whatever of its own is still coming is no use now (its limit has cancelled it already, if that is what failed).
    // water.json and the noise are the session's, and go on for the other pieces.
    cancel.abort(error)
    console.warn(`The ${piece} piece's baked water didn't load, so its water is drawn as it was.`, error)
    manager.itemError(item)
    return null
  } finally {
    stop()
    manager.itemEnd(item)
  }
}

/** Each piece's water, loaded or failed, once for the session. */
const loads = new Map<WaterPieceId, Promise<LoadedWater | null>>()

/**
 * A piece's baked water as the game asks for it: loadWaterPiece's result,
 * fetched once for the session however many times it is asked for (React's
 * StrictMode runs effects twice in development, and a remount asks again), so
 * there is one fetch of each file and at most one warning. A failed load stays
 * failed, as does a water given up on (giveUpOnWater), and the piece keeps
 * today's water. The world asks for it when the farm has the piece
 * (askForWater), and the piece's water again when it is drawn: one load, which
 * counts among the models from the first. Nothing waits on it: today's water
 * is drawn until it is in. Because it is fetched once for the session, its
 * meshes and textures stay for as long as the page lives, and whatever draws
 * them (build.ts) leaves them be; only a water given up on lets them go
 * (disposeWater).
 */
export function waterPiece(piece: WaterPieceId): Promise<LoadedWater | null> {
  let loading = loads.get(piece)
  if (!loading) loads.set(piece, (loading = loadWaterPiece(piece)))
  return loading
}

/**
 * The pieces whose baked water the farm asks for: MAIN's, and the wetland's
 * and the highland's once the farm has them (`inWorld`, the pieces in the
 * world), in WATER_PIECES' order. Never a piece not bought (I4): the wetland's
 * map alone is over half of all the water.
 */
export function waterPiecesFor(inWorld: readonly IsleId[]): WaterPieceId[] {
  return WATER_PIECES.filter((piece) => piece === 'main' || inWorld.includes(piece))
}

/**
 * Asks for pieces' baked water (World.tsx's Scene, through PieceWater.tsx
 * useAskForWater): MAIN's and each piece's the farm has as the world mounts,
 * and a bought piece's with its ground. With the switch on, each load starts
 * there and then, and three's loading manager has its item from this call on,
 * so the world's `data-models` can't say the models are in before the water
 * has settled, however late the water mounts. With the switch off, nothing is
 * fetched and the manager is told nothing.
 */
export function askForWater(pieces: readonly WaterPieceId[]): void {
  if (!isOn('water')) return
  for (const piece of pieces) void waterPiece(piece)
}

/**
 * Lets go of a loaded water that nothing will draw again (one given up on,
 * giveUpOnWater): its meshes' geometry and its map, which the session would
 * otherwise keep. Never the noise: that is the session's, and the other
 * pieces' too. PieceWater calls it once today's water is drawn in its place.
 */
export function disposeWater(water: LoadedWater): void {
  for (const { geometry } of water.bodies) geometry.dispose()
  water.map.dispose()
}

/** The pieces whose water was given up on after it loaded (giveUpOnWater). */
const givenUp = new Set<WaterPieceId>()

/**
 * Gives up on a piece's baked water for the session once it is in but can't
 * be drawn: the GPU couldn't build its shader (build.ts watchWaterPrograms).
 * As a failed load does: one warning, and from then on waterPiece resolves to
 * null, so the piece keeps today's water and a remount doesn't try again.
 * Told again, it says nothing more. The other pieces keep theirs.
 */
export function giveUpOnWater(piece: WaterPieceId): void {
  if (givenUp.has(piece)) return
  givenUp.add(piece)
  loads.set(piece, Promise.resolve(null))
  console.warn(`The ${piece} piece's baked water can't be drawn on this device (its shader didn't build), so its water is drawn as it was.`)
}
