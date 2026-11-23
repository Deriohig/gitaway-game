import * as THREE from 'three'
import { BLUEPRINT, type PieceId } from './blueprint'

// Cliff skirts along the seams between pieces (art/BLUEPRINT.md, pieces v2):
// a baked piece can carry child nodes `skirt_<neighbourId>`, a cliff face
// along its seam with that neighbour. A skirt shows while its neighbour isn't
// in the world, so the piece's side there reads as a cliff, and hides the
// moment the neighbour starts rising, so the two meet with nothing between
// them. MAIN is always there, so a skirt facing it never shows. Pieces without
// skirt nodes are drawn as before.

const SKIRT = /^skirt_([a-z]+)(?:[._-]\d+)?$/

/** The neighbour a node's skirt faces, from its name (`skirt_meadow`, or `skirt_meadow.001` as exporters number copies), or null. */
export function skirtFor(name: string): PieceId | null {
  const match = SKIRT.exec(name)
  return match && (BLUEPRINT.order as string[]).includes(match[1]) ? (match[1] as PieceId) : null
}

/** Whether a skirt facing `neighbour` shows: only while that piece is not in the world (rising or docked). */
export const skirtShown = (neighbour: PieceId, present: readonly PieceId[]): boolean => neighbour !== 'main' && !present.includes(neighbour)

/**
 * Shows or hides every skirt under `root` for the pieces in the world now
 * (`present`, rising or docked), leaving every other node as it is. Returns
 * how many skirts there were.
 */
export function showSkirts(root: THREE.Object3D, present: readonly PieceId[]): number {
  let count = 0
  root.traverse((node) => {
    const neighbour = skirtFor(node.name)
    if (!neighbour) return
    node.visible = skirtShown(neighbour, present)
    count++
  })
  return count
}

/**
 * Takes a loaded piece's skirt nodes out of its scene into a group of their
 * own, each where it was in the piece's coordinates, so the piece's own mesh
 * is all that is left. Meshes painted with vertex colours, as the pieces are,
 * are drawn with `material`; others keep their own. Null when there are none.
 */
export function takeSkirts(scene: THREE.Object3D, material?: THREE.Material): THREE.Group | null {
  scene.updateMatrixWorld(true)
  const nodes: THREE.Object3D[] = []
  scene.traverse((node) => {
    // A skirt inside another skirt goes with it.
    if (skirtFor(node.name) && !nodes.some((outer) => isInside(node, outer))) nodes.push(node)
  })
  if (!nodes.length) return null
  const group = new THREE.Group()
  group.name = 'skirts'
  for (const node of nodes) {
    // Attached with its place in the piece kept (the group stands at the piece's origin).
    group.attach(node)
    node.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (material && mesh.geometry.getAttribute('color')) {
        ;(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose())
        mesh.material = material
      }
    })
  }
  return group
}

function isInside(node: THREE.Object3D, outer: THREE.Object3D): boolean {
  for (let p = node.parent; p; p = p.parent) if (p === outer) return true
  return false
}
