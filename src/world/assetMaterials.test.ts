import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { backLit, gameMaterial, prepareModel, releaseModel } from './assetMaterials'
import { glassMat, glowMat, setGlow } from './materials'

const DECODE = '#define DECODE_VIDEO_TEXTURE'

function srgbTexture(): THREE.Texture {
  const t = new THREE.Texture()
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** The fragment shader three would compile for this material, after its onBeforeCompile. */
function fragmentOf(material: THREE.Material, source = '#define STANDARD\nvoid main() {}'): string {
  const shader = { fragmentShader: source, vertexShader: 'void main() {}', uniforms: {} }
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
  return shader.fragmentShader
}
const count = (text: string, part: string) => text.split(part).length - 1
// The two hooks differ in source text, which is what three keys a program by.
const hooked = (map: THREE.Texture, which: 'first' | 'second') => {
  const m = new THREE.MeshStandardMaterial({ map })
  m.onBeforeCompile =
    which === 'first'
      ? (shader) => {
          shader.fragmentShader += '// the first hook'
        }
      : (shader) => {
          shader.fragmentShader += '// the second hook'
        }
  return m
}

afterEach(() => setGlow(0))

describe('a two-sided leaf lit on its back as on its front', () => {
  // three turns a two-sided material's normal round on a face seen from behind: a fir frond seen from below drew black.
  const lightSource = 'void main() {\n#include <normal_fragment_begin>\n#include <lights_fragment_begin>\n}'

  it('turns the normal back to its front after three has turned it, before the lights read it, on a copy', () => {
    const leaves = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, alphaTest: 0.2 })
    const lit = backLit(leaves)
    expect(lit).not.toBe(leaves)
    const f = fragmentOf(lit, lightSource)
    const undo = f.indexOf('normal *= faceDirection;')
    expect(undo).toBeGreaterThan(f.indexOf('#include <normal_fragment_begin>'))
    expect(undo).toBeLessThan(f.indexOf('#include <lights_fragment_begin>'))
    // Only where three turned it: two-sided, and not flat-shaded.
    expect(f).toMatch(/#if defined\( DOUBLE_SIDED \) && !defined\( FLAT_SHADED \)\s+normal \*= faceDirection;\s+#endif/)
    expect(fragmentOf(leaves, lightSource)).not.toMatch(/faceDirection/)
    expect(lit.customProgramCacheKey()).not.toBe(leaves.customProgramCacheKey())
    expect((lit as THREE.MeshStandardMaterial).alphaTest).toBe(0.2)
  })

  it('keeps a shader change the material already had', () => {
    const leaves = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
    leaves.onBeforeCompile = (shader) => {
      shader.fragmentShader = '#define DECODE_VIDEO_TEXTURE\n' + shader.fragmentShader
    }
    expect(fragmentOf(backLit(leaves), lightSource)).toMatch(/DECODE_VIDEO_TEXTURE/)
  })
})

describe('loaded model materials', () => {
  it('store an sRGB colour map linear and decode it in the shader instead (iOS), filtered for slanted surfaces, changed once however many copies load', () => {
    const map = srgbTexture()
    const m = new THREE.MeshStandardMaterial({ name: 'farmhouse', map })
    expect(gameMaterial(m)).toBe(m)
    expect(map.colorSpace).toBe(THREE.NoColorSpace)
    expect(map.version).toBeGreaterThan(0)
    expect(map.anisotropy).toBe(8)
    const version = map.version
    gameMaterial(m)
    gameMaterial(m)
    expect(map.version).toBe(version)
    expect(fragmentOf(m).startsWith(`${DECODE}\n`)).toBe(true)
    expect(count(fragmentOf(m), DECODE)).toBe(1)
  })

  it('never share a compiled program with a material drawn another way, hooks of their own included', () => {
    // three keys a program by customProgramCacheKey(), the source text of onBeforeCompile unless set: a patched hook wraps the old one.
    const a = hooked(srgbTexture(), 'first')
    const b = hooked(srgbTexture(), 'second')
    const unpatched = hooked(new THREE.Texture(), 'first') // a linear map: nothing to decode
    const keys = () => new Set([a, b, unpatched].map((m) => m.customProgramCacheKey()))
    expect(keys().size).toBe(2)
    for (const m of [a, b, unpatched]) gameMaterial(m)
    expect(fragmentOf(a)).toContain('the first hook')
    expect(fragmentOf(a)).toContain(DECODE)
    expect(fragmentOf(b)).toContain('the second hook')
    expect(fragmentOf(b)).toContain(DECODE)
    expect(fragmentOf(unpatched)).not.toContain(DECODE)
    expect(keys().size).toBe(3)
  })

  it('store the emissive window mask linear without decoding it, and decode a map shared by two materials in both', () => {
    const emissiveMap = srgbTexture()
    const glow = new THREE.MeshStandardMaterial({ name: 'Glow', map: srgbTexture(), emissiveMap })
    gameMaterial(glow)
    expect(emissiveMap.colorSpace).toBe(THREE.NoColorSpace)
    expect(emissiveMap.anisotropy).toBe(8)
    expect(fragmentOf(glow)).not.toContain('DECODE_VIDEO_TEXTURE_EMISSIVE')

    const map = srgbTexture()
    const [a, b] = ['a', 'b'].map((name) => new THREE.MeshStandardMaterial({ name, map }))
    gameMaterial(a)
    gameMaterial(b)
    expect([count(fragmentOf(a), DECODE), count(fragmentOf(b), DECODE)]).toEqual([1, 1])
  })

  it('leave untextured and already-linear materials alone', () => {
    const flat = new THREE.MeshStandardMaterial({ name: 'Soil', color: '#6E5444' })
    const linearMap = new THREE.Texture()
    const linear = new THREE.MeshStandardMaterial({ name: 'data', map: linearMap })
    const flatKey = flat.customProgramCacheKey()
    gameMaterial(flat)
    gameMaterial(linear)
    expect(flat.customProgramCacheKey()).toBe(flatKey)
    expect(fragmentOf(flat)).not.toContain(DECODE)
    expect(fragmentOf(linear)).not.toContain(DECODE)
    expect(linearMap.userData.srgbInShader).toBeUndefined()
    expect(linearMap.colorSpace).toBe(THREE.NoColorSpace)
  })

  it('swap an untextured Glow and the Glass for the shared materials, untouched', () => {
    const state = () => [glowMat, glassMat].map((m) => ({ hook: m.onBeforeCompile, key: m.customProgramCacheKey(), version: m.version, map: (m as { map?: unknown }).map ?? null }))
    const before = state()
    expect(gameMaterial(new THREE.MeshStandardMaterial({ name: 'Glow' }))).toBe(glowMat)
    expect(gameMaterial(new THREE.MeshStandardMaterial({ name: 'Glass' }))).toBe(glassMat)
    gameMaterial(glowMat)
    gameMaterial(glassMat)
    expect(state()).toEqual(before)
  })

  it('keep a textured Glow, and light its windows with the day cycle like the shared glow', () => {
    const m = new THREE.MeshStandardMaterial({ name: 'Glow', map: srgbTexture(), emissiveMap: srgbTexture(), emissive: '#776644', emissiveIntensity: 1 })
    expect(gameMaterial(m)).toBe(m)
    expect(fragmentOf(m)).toContain(DECODE)
    setGlow(0)
    expect(m.emissiveIntensity).toBe(0)
    setGlow(1.15)
    expect([m.emissiveIntensity, glowMat.emissiveIntensity]).toEqual([1.15, 1.15])
    expect(m.emissive.getHex()).toBe(glowMat.emissive.getHex())
  })
})

describe('a model copy with a tint of its own', () => {
  /** A loaded model: a body and a Head node in one painted coat, and the given extras. */
  function loaded(...extras: THREE.Material[]) {
    const coat = new THREE.MeshStandardMaterial({ name: 'chicken', color: '#ffffff', map: srgbTexture() })
    const body = new THREE.Mesh(new THREE.BufferGeometry(), coat)
    const head = new THREE.Mesh(new THREE.BufferGeometry(), coat)
    head.name = 'Head'
    body.add(head, ...extras.map((m) => new THREE.Mesh(new THREE.BufferGeometry(), m)))
    const scene = new THREE.Group()
    scene.add(body)
    return { scene, coat }
  }
  const materialOf = (root: THREE.Object3D, name: string) => (root.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial
  const meshes = (root: THREE.Object3D) => {
    const found: THREE.Mesh[] = []
    root.traverse((o) => void ((o as THREE.Mesh).isMesh && found.push(o as THREE.Mesh)))
    return found
  }
  const tint = new THREE.Color(0.8, 0.5, 0.2)

  it('draws it in one copy of the shared material, colour times the tint, keeping the iOS decode, the texture and the compiled program', () => {
    const { scene, coat } = loaded()
    const root = prepareModel(scene, tint)
    const copy = (root.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
    expect(copy).not.toBe(coat)
    expect(materialOf(root, 'Head')).toBe(copy)
    expect(copy.color.toArray()).toEqual(new THREE.Color('#ffffff').multiply(tint).toArray())
    expect(coat.color.getHex()).toBe(0xffffff) // every other copy of the model keeps its own colour
    expect(materialOf(prepareModel(scene, new THREE.Color(1, 1, 1)), 'Head')).not.toBe(copy)
    expect(copy.map).toBe(coat.map)
    expect(coat.map?.colorSpace).toBe(THREE.NoColorSpace)
    expect(count(fragmentOf(copy), DECODE)).toBe(1)
    expect(copy.customProgramCacheKey()).toBe(coat.customProgramCacheKey())
    expect(copy.customProgramCacheKey()).toContain('srgb-in-shader')
  })

  it('keeps the shared glow and glass, and lights a textured Glow copy with the day cycle until it is let go', () => {
    const band = new THREE.MeshStandardMaterial({ name: 'Glow', map: srgbTexture(), emissiveMap: srgbTexture(), emissive: '#776644' })
    const { scene } = loaded(new THREE.MeshStandardMaterial({ name: 'Glass' }), new THREE.MeshStandardMaterial({ name: 'Glow' }), band)
    const shared = [glowMat.color.getHex(), glassMat.color.getHex()]
    const root = prepareModel(scene, tint)
    const drawn = meshes(root).map((m) => m.material)
    expect(drawn).toContain(glassMat)
    expect(drawn).toContain(glowMat)
    expect([glowMat.color.getHex(), glassMat.color.getHex()]).toEqual(shared)
    const bandCopy = drawn.find((m) => m !== band && (m as THREE.MeshStandardMaterial).emissiveMap === band.emissiveMap) as THREE.MeshStandardMaterial
    expect(bandCopy).toBeDefined()
    setGlow(0.9)
    expect(bandCopy.emissiveIntensity).toBe(0.9)
    expect(bandCopy.emissive.getHex()).toBe(glowMat.emissive.getHex())

    let disposed = false
    bandCopy.addEventListener('dispose', () => (disposed = true))
    releaseModel(root)
    expect(disposed).toBe(true)
    setGlow(0.3)
    expect(bandCopy.emissiveIntensity).toBe(0.9)
    expect(band.emissiveIntensity).toBe(0.3)
  })

  it('leaves a copy without a tint on the shared materials', () => {
    const { scene, coat } = loaded()
    expect(meshes(prepareModel(scene)).every((m) => m.material === coat)).toBe(true)
  })
})
