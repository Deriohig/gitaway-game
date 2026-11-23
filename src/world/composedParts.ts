import * as THREE from 'three'
import { backLit, gameMaterial } from './assetMaterials'
import { backLitAsFront, receivesShadow } from './composedLight'
import { batchColors, batchMatrices, motionOf, paintOf, type Batch, type ModelPart, type Motion } from './composition'
import { COMPOSITION_META } from './composition.meta'
import { leaningMaterial, swayingDepthMaterial, swayingMaterial } from './wind'

// The meshes the composition draws (Composed.tsx): one InstancedMesh per mesh
// of an asset's model, moving and lit as its part of the plant is. Apart from
// the React component, so the tests build them from the models as loaded.

/** How a tree's crown sways, as Nature.tsx sways a tree's: conifers (their crown in `Crown`) a little less and slower. */
export const CROWN_SWAY = { broadleaf: { amount: 0.03, speed: 0.9 }, conifer: { amount: 0.025, speed: 0.7 } }
/** How far the grass leans in the wind, as the procedural tufts do. */
export const GRASS_LEAN = 1.6

/** A tree's near model, or its far one (composition.ts, FAR_SWITCH). */
export type Version = 'near' | 'far'

/** The game's material for a mesh of a composition model: shared by every piece, one per model material, way of moving and lighting (`lit`: its leaves' backs lit as their fronts, composedLight.ts). */
const materials = new WeakMap<THREE.Material, Map<string, THREE.Material>>()
function composedMaterial(source: THREE.Material, motion: Motion, lit = false): THREE.Material {
  let byMotion = materials.get(source)
  if (!byMotion) materials.set(source, (byMotion = new Map()))
  const key = lit ? `${motion}|back-lit` : motion
  let m = byMotion.get(key)
  if (!m) {
    const base = gameMaterial(source)
    m = motion === 'still' ? base : motion === 'grass' ? leaningMaterial(base, GRASS_LEAN) : swayingMaterial(base, CROWN_SWAY[motion].amount, CROWN_SWAY[motion].speed)
    if (lit) m = backLit(m)
    byMotion.set(key, m)
  }
  return m
}

/** The shadow pass's material for a swaying crown (wind.ts): one per model material and way of swaying, shared by every piece. */
const depths = new WeakMap<THREE.Material, Map<Motion, THREE.MeshDepthMaterial>>()
function composedDepth(source: THREE.Material, motion: 'broadleaf' | 'conifer'): THREE.MeshDepthMaterial {
  let byMotion = depths.get(source)
  if (!byMotion) depths.set(source, (byMotion = new Map()))
  let m = byMotion.get(motion)
  if (!m) byMotion.set(motion, (m = swayingDepthMaterial(CROWN_SWAY[motion].amount, CROWN_SWAY[motion].speed)))
  return m
}

/**
 * One mesh of an asset's model as the composition draws its batch on a piece:
 * an InstancedMesh, one instance per item, standing on `height` (the piece's
 * ground as drawn), placed once and never moved again. `conifer`: the model has
 * a `Crown` node.
 */
export function composedPart(batch: Batch, part: ModelPart, conifer: boolean, height: (x: number, z: number) => number, version: Version = 'near'): THREE.InstancedMesh {
  const lift = COMPOSITION_META.assets[batch.asset]?.yOffset ?? 0
  const tree = batch.category === 'trees'
  const motion = motionOf(batch.category, part.canopy, conifer)
  const sources = Array.isArray(part.mesh.material) ? part.mesh.material : [part.mesh.material]
  const material = sources.map((m) => composedMaterial(m, motion, backLitAsFront(batch.category, part.canopy, conifer)))
  const mesh = new THREE.InstancedMesh(part.mesh.geometry, material.length === 1 ? material[0] : material, batch.items.length)
  // Read once, from the piece's ground as drawn (its baked height grid), and never moved again.
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(batchMatrices(batch.items, height, lift, part.matrix), 16)
  const colors = batchColors(batch.items, paintOf(batch.category, batch.items, part.canopy))
  if (colors) mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3)
  // Only the trees cast shadows, a swaying crown's from where it has swayed to. Everything takes them but a
  // conifer's canopy, whose stacked fronds banded each other with them (composedLight.ts).
  mesh.castShadow = tree
  mesh.receiveShadow = receivesShadow(batch.category, part.canopy, conifer)
  if (tree && (motion === 'broadleaf' || motion === 'conifer')) mesh.customDepthMaterial = composedDepth(sources[0], motion)
  mesh.name = `${batch.asset}${version === 'far' ? '_far' : ''}${part.canopy ? ':canopy' : ''}`
  mesh.computeBoundingSphere()
  return mesh
}
