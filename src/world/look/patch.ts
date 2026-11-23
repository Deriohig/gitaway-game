import type * as THREE from 'three'

// Chained shader patches (LOOK-PORT step 2; the art proof's addPatch,
// art/scripts/lib/arch-scene.js). Every onBeforeCompile tweak of a material
// goes through addPatch(material, key, fn), so the tweaks compose instead of
// overwriting each other. Each key applies once per material, and three keys
// the compiled program by the joined keys (customProgramCacheKey).
//
// The list lives in a WeakMap, not in userData: clone() JSON-copies userData
// and would drop the functions. A copy that takes over both hooks (Rising's
// fader) runs the original's list and shares its program.
//
// Only the water uses it so far; wind.ts and assetMaterials.ts storeLinear()
// still set the hooks themselves until the look port moves them here.

export type ShaderPatch = (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void

type Patches = { key: string; fn: ShaderPatch }[]

const PATCHES = new WeakMap<THREE.Material, Patches>()

/**
 * Adds a shader patch to a material, after the ones it already has. Returns
 * false (and changes nothing) when the material already has a patch of that
 * key; otherwise marks the material for a recompile.
 */
export function addPatch(m: THREE.Material, key: string, fn: ShaderPatch): boolean {
  if (!m) return false
  let list = PATCHES.get(m)
  if (!list) {
    const own: Patches = (list = [])
    PATCHES.set(m, own)
    m.onBeforeCompile = (shader, renderer) => {
      for (const p of own) p.fn(shader, renderer)
    }
    m.customProgramCacheKey = () => own.map((p) => p.key).join('|')
  }
  if (list.some((p) => p.key === key)) return false
  list.push({ key, fn })
  m.needsUpdate = true
  return true
}
