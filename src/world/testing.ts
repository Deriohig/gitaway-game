/// <reference types="node" />
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import type { PieceId } from './blueprint'
import { fromOutline, fromRiver } from './isleSpots'
import { ISLES, MAIN, POND_SHORE, STREAM_LINE, type XZ } from './layout'
import { bakedIsland, parseHeightGrid, type HeightGrid, type HeightGridInfo } from './pieces'

// For tests: the art session's baked pieces, read from public/models with
// node's own files. They are always in the tree, so a missing one fails the
// test that asked for it rather than quietly skipping it.

const models = new URL('../../public/models/', import.meta.url)

interface Entry {
  status?: string
  height?: HeightGridInfo
}

const manifest = () => (JSON.parse(readFileSync(new URL('manifest.json', models), 'utf8')) as { assets?: Record<string, Entry> }).assets ?? {}

/** A baked piece's height grid. Throws, naming the piece, if public/models doesn't have it. */
export function bakedGrid(id: PieceId): HeightGrid {
  const entry = manifest()[`piece_${id}`]
  if (entry?.status !== 'ready' || !entry.height) throw new Error(`public/models/manifest.json has no ready height grid for piece_${id}`)
  const bytes = readFileSync(new URL(entry.height.file, models))
  return parseHeightGrid(entry.height, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
}

const SIZES: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3 }

interface Gltf {
  scene?: number
  scenes: { nodes: number[] }[]
  nodes: { name?: string; mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[]
  meshes: { primitives: { attributes: { POSITION: number }; indices?: number; material?: number }[] }[]
  materials?: { name?: string }[]
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[]
  bufferViews: { byteOffset?: number; byteStride?: number }[]
}

/**
 * A .glb's geometry in the model's own frame (node transforms applied), one
 * mesh per primitive, named for its material. No textures are read. `skip`
 * names nodes left out, such as a part that spins.
 */
export function glbMeshes(file: string, skip: string[] = []): THREE.Mesh[] {
  const bytes = readFileSync(file)
  const jsonLength = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as Gltf
  const bin = bytes.subarray(20 + jsonLength + 8)

  const read = (index: number): number[] => {
    const a = gltf.accessors[index]
    const view = gltf.bufferViews[a.bufferView]
    const size = SIZES[a.type]
    const width = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1
    const stride = view.byteStride ?? size * width
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const out: number[] = []
    for (let i = 0; i < a.count; i++) {
      for (let c = 0; c < size; c++) {
        const at = start + i * stride + c * width
        out.push(
          a.componentType === 5126 ? bin.readFloatLE(at) : a.componentType === 5125 ? bin.readUInt32LE(at) : a.componentType === 5123 ? bin.readUInt16LE(at) : bin.readUInt8(at),
        )
      }
    }
    return out
  }

  const meshes: THREE.Mesh[] = []
  const visit = (i: number, parent: THREE.Matrix4) => {
    const node = gltf.nodes[i]
    if (node.name && skip.includes(node.name)) return
    const local = new THREE.Matrix4()
    if (node.matrix) local.fromArray(node.matrix)
    else
      local.compose(
        new THREE.Vector3(...(node.translation ?? [0, 0, 0])),
        new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        new THREE.Vector3(...(node.scale ?? [1, 1, 1])),
      )
    const world = parent.clone().multiply(local)
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes[node.mesh].primitives) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(read(prim.attributes.POSITION), 3))
        if (prim.indices !== undefined) geometry.setIndex(read(prim.indices))
        geometry.applyMatrix4(world)
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
        mesh.name = prim.material === undefined ? '' : (gltf.materials?.[prim.material]?.name ?? '')
        meshes.push(mesh)
      }
    }
    for (const child of node.children ?? []) visit(child, world)
  }
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root, new THREE.Matrix4())
  return meshes
}

/** A .glb's nodes at the root of its scene, by name, with where they stand (their translation). */
export function glbRootNodes(file: string): Record<string, THREE.Vector3> {
  const bytes = readFileSync(file)
  const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8')) as Gltf
  return Object.fromEntries(
    gltf.scenes[gltf.scene ?? 0].nodes.map((i) => [gltf.nodes[i].name ?? '', new THREE.Vector3(...(gltf.nodes[i].translation ?? [0, 0, 0]))]),
  )
}

/** A mesh's vertices, in the frame its geometry is in. */
export function vertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const p = mesh.geometry.getAttribute('position')
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i))
}

/** How far a point is from a polygon's edge, in x, z: negative inside it (isleSpots.ts, where the game uses it too). */
export { fromOutline }

/** How far a spot on the farm is from its water, the art's pond and stream (layout.ts): negative in it. */
export const fromFarmWater = (p: XZ): number => Math.min(fromOutline(p, POND_SHORE), fromRiver(p, STREAM_LINE))

/**
 * Hands the baked pieces' ground to MAIN and ISLES, as pieceLoader does in the
 * game (with an empty mesh: tests only read heights). Returns a function that
 * puts the procedural stand-ins back.
 */
export function standOnBakedGround(ids: readonly PieceId[] = ['main', 'meadow', 'grove', 'islet']): () => void {
  const islandOf = (id: PieceId) => (id === 'main' ? MAIN : ISLES[id].island)
  for (const id of ids) islandOf(id).use(bakedIsland(id, new THREE.BufferGeometry(), bakedGrid(id)))
  return () => {
    for (const id of ids) islandOf(id).use(null)
  }
}
