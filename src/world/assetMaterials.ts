import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { adoptGlow, dropGlow, followsGlow, glassMat, glowMat } from './materials'

// How a loaded model's materials are drawn in the game. GLTFLoader shares
// materials and textures between every copy of a model, so all of this is
// done to the shared objects and is safe to repeat.

type Textured = THREE.Material & { map?: THREE.Texture | null; emissiveMap?: THREE.Texture | null }

const hasEmissive = (m: THREE.Material): m is THREE.Material & { emissive: THREE.Color; emissiveIntensity: number } =>
  (m as { emissive?: unknown }).emissive instanceof THREE.Color

const DECODE = '#define DECODE_VIDEO_TEXTURE\n'
const decoding = new WeakSet<THREE.Material>()

/**
 * iOS-safe textures. Apple GPUs corrupt the mipmaps they build for sRGB
 * textures, which speckles textured models. So an sRGB colour map is stored as
 * plain data (the mipmaps are built on that) and decoded from sRGB in the
 * shader instead, through three's inline decode for video textures. The
 * emissive map is a black-and-white window mask: stored as data, not decoded.
 * Mirrors linearStore in the art proof (art/scripts/lib/arch-scene.js).
 */
export function storeLinear(material: THREE.Material): void {
  if (material === glowMat || material === glassMat) return
  const m = material as Textured
  for (const key of ['map', 'emissiveMap'] as const) {
    const t = m[key]
    if (!t?.isTexture || t.colorSpace !== THREE.SRGBColorSpace) continue
    t.colorSpace = THREE.NoColorSpace
    t.needsUpdate = true
    // Marked on the texture, so a map shared by two materials is decoded in both.
    if (key === 'map') t.userData.srgbInShader = true
  }
  if (!m.map?.userData.srgbInShader || decoding.has(material)) return
  decoding.add(material)
  const before = material.onBeforeCompile
  const key = material.customProgramCacheKey()
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer)
    shader.fragmentShader = DECODE + shader.fragmentShader
  }
  material.customProgramCacheKey = () => `${key}|srgb-in-shader`
  material.needsUpdate = true
}

/**
 * Anisotropic filtering for a model's colour map and window mask. The game's
 * camera looks down on the island at a slant, and without it a sloping
 * surface such as a roof takes a blurrier mipmap than it needs. three clamps
 * the value to what the GPU allows.
 */
export const MODEL_ANISOTROPY = 8

function sharpen(material: THREE.Material): void {
  const m = material as Textured
  for (const key of ['map', 'emissiveMap'] as const) {
    const t = m[key]
    if (!t?.isTexture || t.anisotropy >= MODEL_ANISOTROPY) continue
    t.anisotropy = MODEL_ANISOTROPY
    t.needsUpdate = true
  }
}

/**
 * A copy of a two-sided material whose faces seen from behind are lit with the
 * front's normal: three turns the normal round for them (normal_fragment_begin),
 * and this turns it back, before the lights read it, only where three turned it
 * (two-sided and not flat-shaded: a flat-shaded normal comes from the screen
 * and is never turned). For leaf cards, lit as thin foliage is (composedLight.ts
 * backLitAsFront). Keeps any shader change the material already has.
 */
export function backLit(material: THREE.Material): THREE.Material {
  const m = material.clone()
  const before = material.onBeforeCompile
  const key = material.customProgramCacheKey()
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n#if defined( DOUBLE_SIDED ) && !defined( FLAT_SHADED )\n  normal *= faceDirection;\n#endif',
    )
  }
  m.customProgramCacheKey = () => `${key}|back-lit`
  return m
}

/** The material a loaded model's mesh is drawn with in the game. */
export function gameMaterial(material: THREE.Material): THREE.Material {
  if (material.name === 'Glass') return glassMat
  if (material.name === 'Glow') {
    // A plain Glow (window panes, lamp glass) becomes the shared glow. A
    // textured one is a painted wall band whose emissive map masks the
    // windows: it keeps its paint and its windows light up at dusk.
    if (!(material as Textured).map || !hasEmissive(material)) return glowMat
    storeLinear(material)
    sharpen(material)
    adoptGlow(material)
    return material
  }
  storeLinear(material)
  sharpen(material)
  return material
}

/**
 * A game material for one model copy, its colour multiplied by `tint`: a
 * clone that keeps everything the shared one is drawn with. three's clone
 * leaves out the compile hook and the program cache key, which carry the iOS
 * decode (storeLinear), so they are carried over: the copy is drawn the same
 * way, by the program already compiled for the shared one, with the same
 * textures. A copy of a textured Glow is lit with the day cycle like it. The
 * shared glow and glass are lamps and panes, not paint: they stay shared.
 */
function tintedCopy(shared: THREE.Material, tint: THREE.Color): THREE.Material {
  if (shared === glowMat || shared === glassMat) return shared
  const copy = shared.clone()
  copy.onBeforeCompile = shared.onBeforeCompile
  copy.customProgramCacheKey = shared.customProgramCacheKey
  ;(copy as { color?: THREE.Color }).color?.multiply(tint)
  if (followsGlow(shared) && hasEmissive(copy)) {
    glowCopies.add(copy)
    adoptGlow(copy)
  }
  return copy
}

/** The tinted copies of textured Glow materials. */
const glowCopies = new WeakSet<THREE.Material>()

/** Each model copy's own materials, for letting them go. */
const ownMaterials = new WeakMap<THREE.Object3D, THREE.Material[]>()

/**
 * How much larger a skinned mesh's bounds are made than at rest: its clips
 * reach outside them (a dabble, a scratch, a hop), and three culls a skinned
 * mesh by the bounds it had when first drawn.
 */
const SKINNED_REACH = 1.5

/**
 * A copy of a loaded model to draw: its meshes cast and take shadows, and are
 * drawn with the game's materials. With a `tint`, such as an animal's coat,
 * the copy has its own copy of each of them, its colour multiplied by the
 * tint, one shared by all its meshes (see tintedCopy). Let those go with
 * releaseModel once the copy is no longer drawn. A skinned model (an animal
 * rig) gets its own skeleton: `clone(true)` would keep every copy bound to the
 * loaded one's bones, so two hens would move as one.
 */
export function prepareModel(scene: THREE.Object3D, tint?: THREE.Color): THREE.Object3D {
  let skinned = false
  scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true
  })
  const copy = skinned ? cloneSkinned(scene) : scene.clone(true)
  // The bones' world matrices, for the bounds below.
  if (skinned) copy.updateMatrixWorld(true)
  const own = new Map<THREE.Material, THREE.Material>()
  const material = (loaded: THREE.Material) => {
    const shared = gameMaterial(loaded)
    if (!tint) return shared
    let m = own.get(shared)
    if (!m) own.set(shared, (m = tintedCopy(shared, tint)))
    return m
  }
  copy.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(material) : material(mesh.material)
    const skin = mesh as THREE.SkinnedMesh
    if (skin.isSkinnedMesh) {
      skin.computeBoundingSphere()
      skin.boundingSphere!.radius *= SKINNED_REACH
    }
  })
  ownMaterials.set(copy, [...own.entries()].filter(([shared, m]) => m !== shared).map(([, m]) => m))
  return copy
}

/**
 * Keeps a model copy's own materials lit as they should be while it is drawn
 * (a Glow copy follows the day cycle). Returns the function that lets them go.
 */
export function holdModel(root: THREE.Object3D): () => void {
  for (const m of ownMaterials.get(root) ?? []) if (glowCopies.has(m) && hasEmissive(m)) adoptGlow(m)
  return () => releaseModel(root)
}

/** Lets a model copy's own materials go: they leave the day cycle and free what the renderer holds for them. */
export function releaseModel(root: THREE.Object3D): void {
  for (const m of ownMaterials.get(root) ?? []) {
    dropGlow(m)
    m.dispose()
  }
}
