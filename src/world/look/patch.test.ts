import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { addPatch } from './patch'

// Every shader tweak of a material goes through addPatch, so the tweaks chain instead of overwriting each other's
// onBeforeCompile, and three keys the compiled program by all of them.

/** What three would compile for a material, after its onBeforeCompile. */
function compiled(material: THREE.Material) {
  const stand = '#include <common>\nvoid main() {}'
  const shader = { vertexShader: stand, fragmentShader: stand, uniforms: {} as Record<string, THREE.IUniform> }
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
  return shader
}

const append = (text: string) => (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.fragmentShader += text
}

describe('addPatch', () => {
  it('runs patches in the order they were added, keying the program by the joined patch keys', () => {
    const m = new THREE.MeshLambertMaterial()
    expect(addPatch(m, 'a', append('\n// first'))).toBe(true)
    expect(m.customProgramCacheKey()).toBe('a')
    expect(addPatch(m, 'b', append('\n// second'))).toBe(true)
    expect(m.customProgramCacheKey()).toBe('a|b')
    expect(compiled(m).fragmentShader.endsWith('\n// first\n// second')).toBe(true)
  })

  it('refuses a key the material already has, and marks the material for a recompile only on a new one', () => {
    const m = new THREE.MeshLambertMaterial()
    const v0 = m.version
    addPatch(m, 'a', append('A'))
    expect(m.version).toBe(v0 + 1)
    expect(addPatch(m, 'a', append('again'))).toBe(false)
    expect(m.version).toBe(v0 + 1)
    expect(m.customProgramCacheKey()).toBe('a')
    expect(compiled(m).fragmentShader).not.toContain('again')
    expect(addPatch(new THREE.MeshLambertMaterial(), 'a', append('A'))).toBe(true) // the list is the material's own
  })

  it('survives the Rising fader: a clone that copies the two hooks compiles the same program', () => {
    const m = new THREE.MeshLambertMaterial({ color: '#7CA7A6' })
    addPatch(m, 'a', append('\n// first'))
    addPatch(m, 'b', (shader) => {
      shader.uniforms.uThing = { value: 3 }
    })
    // As Rising.tsx copyOf() makes its fading copies.
    const copy = m.clone()
    copy.onBeforeCompile = m.onBeforeCompile
    copy.customProgramCacheKey = m.customProgramCacheKey
    copy.transparent = true
    expect(copy.customProgramCacheKey()).toBe('a|b')
    const [mine, its] = [compiled(m), compiled(copy)]
    expect(its.vertexShader).toBe(mine.vertexShader)
    expect(its.fragmentShader).toBe(mine.fragmentShader)
    expect(its.fragmentShader).toContain('// first')
    expect(its.uniforms.uThing).toEqual({ value: 3 })
    // clone() alone drops the hooks (not material properties), hence the fader's copy.
    expect(compiled(m.clone()).fragmentShader).not.toContain('// first')
  })
})
