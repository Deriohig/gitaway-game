import * as THREE from 'three'
import { PALETTE, type PaletteKey } from './palette'

// Shared materials, cached by colour, so the scene uses a handful of materials
// instead of one per mesh.

const cache = new Map<string, THREE.Material>()

export function mat(color: PaletteKey | string, opts: { flat?: boolean; side?: THREE.Side } = {}): THREE.MeshLambertMaterial {
  const hex = (PALETTE as Record<string, string>)[color] ?? color
  const key = `${hex}|${opts.flat ?? true}|${opts.side ?? 0}`
  let m = cache.get(key) as THREE.MeshLambertMaterial | undefined
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex, flatShading: opts.flat ?? true, side: opts.side ?? THREE.FrontSide })
    cache.set(key, m)
  }
  return m
}

/** Vertex-coloured, flat-shaded material for terrain and generated meshes. */
export const vertexMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })

/**
 * The baked island pieces' material: the same Lambert and vertex colours,
 * shaded by the pieces' own normals (smooth on grass, faceted on rock).
 */
export const pieceMat = new THREE.MeshLambertMaterial({ vertexColors: true })

/** The material for an island's ground: a baked piece keeps its normals, a procedural island is faceted. */
export function groundMaterial(island: { geometry: THREE.BufferGeometry }): THREE.MeshLambertMaterial {
  return island.geometry.userData.baked === true ? pieceMat : vertexMat
}

/** Warm window and lantern glow. Its intensity follows the time of day. */
export const glowMat = new THREE.MeshLambertMaterial({
  color: PALETTE.window,
  emissive: new THREE.Color('#F2B35E'),
  emissiveIntensity: 0,
})

/** Soft glass for the greenhouse. */
export const glassMat = new THREE.MeshLambertMaterial({
  color: '#DCEBE8',
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
  side: THREE.DoubleSide,
})

type Glowing = THREE.Material & { emissive: THREE.Color; emissiveIntensity: number }

/** Models' own textured Glow materials (a painted wall band with a window mask), lit with glowMat. */
const glowing = new Set<Glowing>()

/** Lights a model's textured Glow material with the shared glow: same colour, same strength. */
export function adoptGlow(material: Glowing) {
  material.emissive.copy(glowMat.emissive)
  material.emissiveIntensity = glowMat.emissiveIntensity
  glowing.add(material)
}

/** Whether a material is lit with the shared glow (see adoptGlow). */
export const followsGlow = (material: THREE.Material): boolean => glowing.has(material as Glowing)

/** Stops lighting a material with the shared glow, once it is no longer drawn. */
export function dropGlow(material: THREE.Material) {
  glowing.delete(material as Glowing)
}

export function setGlow(intensity: number) {
  glowMat.emissiveIntensity = intensity
  for (const m of glowing) m.emissiveIntensity = intensity
}
