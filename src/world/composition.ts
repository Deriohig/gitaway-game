import * as THREE from 'three'
import { isOn } from '../game/features'
import { gameMaterial } from './assetMaterials'
import type { PieceId } from './blueprint'
import { COMPOSITION_META } from './composition.meta'
import { KEPT_CLEAR } from './isleSpots'
import { SLOT_DISCS } from './layout'

// The art session's composition (art/BLUEPRINT.md, "Composition data"): the
// trees, shrubs, rocks, flowers and grass it places on every piece, item for
// item, and the path runs its ribbons draw. scripts/composition.mjs copies it
// from art/config/composition.pieces.json into composition.meta.ts (small:
// assets, counts, path runs) and composition.data.ts (large: every item, only
// loaded once it is drawn). It is drawn on a piece's baked ground, which it
// was placed on, while its switch is on (features.ts); a piece drawn from its
// procedural stand-in keeps the game's own dressing. Everything here is plain
// functions, so it runs in tests; Composed.tsx draws it. The reeds the art
// stands by the farm pond travel with the items, outside the categories: the
// pond's dressing draws them (water/pondDressing.ts teardropReeds, Water.tsx).

export type Category = 'trees' | 'shrubs' | 'rocks' | 'flowers' | 'grass'

/** One thing placed on a piece, in the piece's own x, z; it stands on the piece's ground. */
export interface CompositionItem {
  asset: string
  x: number
  z: number
  rotY: number
  scale: number
  /** Its height scale, in place of `scale`, when it has one of its own. */
  scaleY?: number
  /** A tree's canopy (a plant shrub's whole) colour, as a linear RGB multiplier. */
  tint?: [number, number, number]
  /** A flower's colour, as an sRGB hex. */
  color?: string
}

export type CompositionItems = Record<PieceId, Record<Category, CompositionItem[]>>

/**
 * A reed the art stands by a piece's water (its `reeds`, outside the five categories and their counts): where, in the
 * piece's own x, z, how tall, and whether it carries a bulrush head. 1:1 the game's Reed (isleSpots.ts), drawn by its
 * own Reeds (Reeds.tsx).
 */
export interface CompositionReed {
  x: number
  z: number
  height: number
  head: boolean
}

/** The art's reeds on each piece that has them: the farm pond's, today. */
export type CompositionReeds = Partial<Record<PieceId, CompositionReed[]>>

/** A path run on a piece: the piece it runs into at an end, if any, and the other pieces it crosses. */
export interface PathRun {
  id: string
  leadsTo: string | null
  needs: string[]
}

export interface CompositionMeta {
  format: string
  categories: string[]
  /** Each asset: its kind, its model file, its far version's file (a tree's: see FAR_SWITCH) and how far above the ground it stands. */
  assets: Record<string, { category: string; file: string; far?: string; yOffset: number }>
  counts: Record<PieceId, Record<Category, number>>
  paths: Record<PieceId, PathRun[]>
}

const CATEGORIES: Category[] = ['trees', 'shrubs', 'rocks', 'flowers', 'grass']

let items: Promise<CompositionItems> | null = null

/** Every item of the composition, loaded once, the first time it's drawn. */
export function loadCompositionItems(): Promise<CompositionItems> {
  items ??= import('./composition.data').then((m) => m.COMPOSITION_ITEMS)
  return items
}

let reeds: Promise<CompositionReeds> | null = null

/** The art's reeds, loaded once, the first time they're drawn: from the items' own module, so loaded with them. */
export function loadCompositionReeds(): Promise<CompositionReeds> {
  reeds ??= import('./composition.data').then((m) => m.COMPOSITION_REEDS)
  return reeds
}

/** Where a piece's ground came from: the composition stands on the baked pieces only. */
interface Ground {
  readonly source: 'baked' | 'procedural'
}

/** Whether the composition is drawn on a piece: its switch is on, and the piece's ground is the baked one it was placed on. */
export const composedOn = (ground: Ground): boolean => isOn('composition') && ground.source === 'baked'

/** Whether the composition places a kind of thing on a piece, so the game's own of that kind makes way there. */
export const composes = (piece: PieceId, category: Category, ground: Ground): boolean => composedOn(ground) && COMPOSITION_META.counts[piece][category] > 0

type XZ = [number, number]

/** A game thing's ground: a disc, or a box (half its width and depth) turned `rot` about its middle, as rotation.y turns it. */
export type Footprint = { at: XZ; r: number } | { at: XZ; half: XZ; rot: number }

/** Whether a point is on a footprint. */
export function onFootprint(f: Footprint, x: number, z: number): boolean {
  const dx = x - f.at[0]
  const dz = z - f.at[1]
  if ('r' in f) return Math.hypot(dx, dz) < f.r
  const c = Math.cos(f.rot)
  const s = Math.sin(f.rot)
  return Math.abs(c * dx - s * dz) < f.half[0] && Math.abs(s * dx + c * dz) < f.half[1]
}

/**
 * The ground the composition keeps clear on a piece, leaving out what it put
 * there: on the farm, every slot where it stands now (the composition kept
 * clear of them where they stood before some moved aside for its ribbons),
 * and on the other pieces the things the game keeps there, which it knew
 * nothing of (isleSpots.ts).
 */
export const keptClear = (piece: PieceId): readonly Footprint[] => (piece === 'main' ? SLOT_DISCS : (KEPT_CLEAR[piece] ?? []))

/** One asset's items on a piece: drawn together, as one InstancedMesh per mesh of its model. */
export interface Batch {
  asset: string
  category: Category
  items: CompositionItem[]
}

/**
 * What is drawn on a piece, asset by asset, in the order the composition
 * lists them, but for what stands on ground the game keeps (keptClear);
 * nothing while it isn't drawn there.
 */
export function pieceBatches(piece: PieceId, all: CompositionItems, ground: Ground): Batch[] {
  if (!composedOn(ground)) return []
  const kept = keptClear(piece)
  const batches = new Map<string, Batch>()
  for (const category of CATEGORIES) {
    for (const item of all[piece][category]) {
      if (kept.some((f) => onFootprint(f, item.x, item.z))) continue
      let batch = batches.get(item.asset)
      if (!batch) batches.set(item.asset, (batch = { asset: item.asset, category, items: [] }))
      batch.items.push(item)
    }
  }
  return [...batches.values()]
}

/** Whether a path run shows: once every other piece it crosses is in the world (rising or docked). The farm is always there. */
export const runShown = (run: PathRun, present: readonly PieceId[]): boolean => run.needs.every((id) => id === 'main' || present.includes(id as PieceId))

/** The path runs that show on a piece, with these pieces in the world; none while the composition is off. */
export function shownRuns(piece: PieceId, present: readonly PieceId[]): string[] {
  if (!isOn('composition')) return []
  return COMPOSITION_META.paths[piece].filter((run) => runShown(run, present)).map((run) => run.id)
}

/**
 * Shows the nodes of a piece's ribbon model (paths_<piece>.glb: one node
 * `path_<runId>` per run) whose runs show with these pieces in the world, and
 * hides every other. Returns the runs shown.
 */
export function showRuns(root: THREE.Object3D, piece: PieceId, present: readonly PieceId[]): string[] {
  const shown = new Set(shownRuns(piece, present).map((id) => `path_${id}`))
  const drawn: string[] = []
  root.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh) return
    node.visible = shown.has(node.name)
    if (node.visible) drawn.push(node.name.slice('path_'.length))
  })
  // In the composition's order, as shownRuns gives them.
  return shownRuns(piece, present).filter((id) => drawn.includes(id))
}

/** Where the path ribbons come in the draw order: after the ground (0), so they're blended over it, a piece fading in included. */
export const RIBBON_ORDER = 1

/**
 * Readies a loaded ribbon model to draw on its piece: under the game's rules
 * for models (gameMaterial), its material (alphaMode BLEND, its soft edges in
 * the vertex colours' alpha) blended over the ground without writing depth,
 * and pulled towards the camera so it never fights the ground it lies on. It
 * takes the trees' shadows and casts none.
 */
export function readyRibbons(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const ribbon = gameMaterial(m)
      ribbon.transparent = true
      ribbon.depthWrite = false
      ribbon.polygonOffset = true
      ribbon.polygonOffsetFactor = -1
      ribbon.polygonOffsetUnits = -4
      return ribbon
    })
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0]
    mesh.renderOrder = RIBBON_ORDER
    mesh.castShadow = false
    mesh.receiveShadow = true
  })
}

const UP = new THREE.Vector3(0, 1, 0)
const at = new THREE.Vector3()
const turn = new THREE.Quaternion()
const size = new THREE.Vector3()

/**
 * Where an item's mesh is drawn on its piece: translate(x, ground + yOffset, z)
 * · rotateY(rotY) · scale(scale, scaleY ?? scale, scale), times `node`, the
 * mesh's place in its model (null for the model's own origin).
 */
export function itemMatrix(item: CompositionItem, ground: number, yOffset: number, node: THREE.Matrix4 | null, out = new THREE.Matrix4()): THREE.Matrix4 {
  out.compose(at.set(item.x, ground + yOffset, item.z), turn.setFromAxisAngle(UP, item.rotY), size.set(item.scale, item.scaleY ?? item.scale, item.scale))
  return node ? out.multiply(node) : out
}

/**
 * The far version of an asset's model, by its id in the manifest: a light
 * copy of a tree (art/BLUEPRINT.md, "Far versions"), with the same Crown and
 * Canopy nodes and pivot, so it is instanced and sways as the tree does, and
 * its own small textures. Null for anything but a tree.
 */
export function farModelOf(asset: string): string | null {
  return COMPOSITION_META.assets[asset]?.far?.replace(/\.glb$/, '') ?? null
}

/**
 * Where a batch of trees changes to its far models, by its distance from the
 * camera in world units: out at `in`, back only within `out`, so a batch by
 * the line doesn't flicker from one to the other as the view turns.
 */
export const FAR_SWITCH = { in: 35, out: 30 } as const

/**
 * Whether a batch of trees is drawn from its far models now, drawn from them
 * before or not (`wasFar`) and its nearest tree `distance` from the camera.
 * On a phone it always is: the far models are lighter to draw, and the
 * framing there keeps every tree well back.
 */
export function drawsFar(wasFar: boolean, distance: number, phone: boolean): boolean {
  if (phone) return true
  return wasFar ? distance >= FAR_SWITCH.out : distance >= FAR_SWITCH.in
}

/** The longest a phone's screen is on its short side, in CSS pixels (a small tablet's is about this). */
export const PHONE_SHORT_SIDE = 820

/**
 * Whether the trees are drawn far everywhere (drawsFar's `phone`): on a
 * phone, held either way up, which is a touch screen (`coarse`, a coarse
 * pointer) no longer than PHONE_SHORT_SIDE on its short side. Not on a
 * desktop, however narrow its window, nor on a laptop's touch screen.
 */
export function farEverywhere(coarse: boolean, screen: { width: number; height: number }): boolean {
  return coarse && Math.min(screen.width, screen.height) <= PHONE_SHORT_SIDE
}

/** Where each item stands on `height` (its piece's ground), lifted by `yOffset`, in the piece's frame: x, y, z for each. */
export function batchFeet(list: readonly CompositionItem[], height: (x: number, z: number) => number, yOffset: number): Float32Array {
  const out = new Float32Array(list.length * 3)
  list.forEach((item, i) => out.set([item.x, height(item.x, item.z) + yOffset, item.z], i * 3))
  return out
}

/** How far `at` is from the nearest of these feet (batchFeet), in the same frame; Infinity for none. */
export function nearestFoot(feet: Float32Array, at: { x: number; y: number; z: number }): number {
  let nearest = Infinity
  for (let i = 0; i < feet.length; i += 3) nearest = Math.min(nearest, Math.hypot(feet[i] - at.x, feet[i + 1] - at.y, feet[i + 2] - at.z))
  return nearest
}

/** Every item's matrix for one mesh of its model, standing on `height` (the piece's ground), packed for an InstancedMesh. */
export function batchMatrices(list: readonly CompositionItem[], height: (x: number, z: number) => number, yOffset: number, node: THREE.Matrix4 | null): Float32Array {
  const out = new Float32Array(list.length * 16)
  const m = new THREE.Matrix4()
  list.forEach((item, i) => itemMatrix(item, height(item.x, item.z), yOffset, node, m).toArray(out, i * 16))
  return out
}

/** How a mesh is coloured per instance: by its item's tint (a tree's canopy, a plant shrub), by its colour (a flower), or not at all. */
export type Paint = 'tint' | 'color' | null

/** How the instances of one mesh of an asset are coloured: a tree's tint goes on its canopy only, the trunk keeps its own colours. */
export function paintOf(category: Category, list: readonly CompositionItem[], canopy: boolean): Paint {
  if (list.some((item) => item.color)) return 'color'
  if (list.some((item) => item.tint) && (category !== 'trees' || canopy)) return 'tint'
  return null
}

/** How a composed mesh moves in the wind: a tree's canopy sways (a conifer's more stiffly), grass and flowers lean, the rest stands still. */
export type Motion = 'still' | 'grass' | 'broadleaf' | 'conifer'

/** The wind's hold on one mesh of an asset: `canopy` marks a tree's crown, `conifer` a model with a `Crown` node. */
export function motionOf(category: Category, canopy: boolean, conifer: boolean): Motion {
  if (category === 'trees') return canopy ? (conifer ? 'conifer' : 'broadleaf') : 'still'
  return category === 'grass' || category === 'flowers' ? 'grass' : 'still'
}

/** Every instance's colour, linear RGB: a tint as it is, a flower's sRGB hex turned linear (as three's Color does), white without one. */
export function batchColors(list: readonly CompositionItem[], paint: Paint): Float32Array | null {
  if (!paint) return null
  const out = new Float32Array(list.length * 3)
  const c = new THREE.Color()
  list.forEach((item, i) => {
    if (paint === 'color' && item.color) c.set(item.color)
    else if (paint === 'tint' && item.tint) c.setRGB(...item.tint)
    else c.setRGB(1, 1, 1)
    c.toArray(out, i * 3)
  })
  return out
}

/** A mesh of a model: where it sits in the model, and whether it is (in) the tree's crown. */
export interface ModelPart {
  mesh: THREE.Mesh
  matrix: THREE.Matrix4
  canopy: boolean
}

/** Whether a node is a tree's crown, or inside it: the plant models keep it in `Canopy`, the conifers wrapped in `Crown`. */
function inCrown(node: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = node; n && n !== root; n = n.parent) if (n.name === 'Canopy' || n.name === 'Crown') return true
  return false
}

/** The meshes of a loaded model (left as it is), each with its matrix relative to the model's root. */
export function modelParts(root: THREE.Object3D): ModelPart[] {
  root.updateMatrixWorld(true)
  const inverse = root.matrixWorld.clone().invert()
  const parts: ModelPart[] = []
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh) parts.push({ mesh, matrix: inverse.clone().multiply(mesh.matrixWorld), canopy: inCrown(mesh, root) })
  })
  return parts
}
