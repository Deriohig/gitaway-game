import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { HOUSE } from './layout'
import { leaningMaterial, shiverAt, shiverWave, swayingDepthMaterial, swayingMaterial, windMaterial, windTime } from './wind'

// The breeze in the vertex shader: the composition's instanced canopies sway about their pivot, and its grass
// leans, with nothing moved on the CPU from frame to frame.

/** Compiles a material's shader change against a stand-in for three's vertex shader, and returns the result. */
function compiled(material: THREE.Material) {
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}', fragmentShader: '' }
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer)
  return shader
}
const std = () => new THREE.MeshStandardMaterial()
const leaning = () => leaningMaterial(std(), 1.6)
const swaying = () => swayingMaterial(std(), 0.03, 0.9)
const windy = () => windMaterial('#ffffff', 1.6)

describe('a model’s material in the wind', () => {
  it('sways each instance about its own origin by the wind clock, after its vertex is read, on a copy', () => {
    const plant = new THREE.MeshStandardMaterial({ vertexColors: true })
    const crown = swayingMaterial(plant, 0.03, 0.9)
    const shader = compiled(crown)
    expect(shader.uniforms.uWind).toBe(windTime)
    expect(shader.vertexShader).toMatch(/uniform float uWind;/)
    const sway = shader.vertexShader.indexOf('transformed.xy = mat2(')
    expect(sway).toBeGreaterThan(shader.vertexShader.indexOf('#include <begin_vertex>'))
    expect(sway).toBeLessThan(shader.vertexShader.indexOf('#include <project_vertex>'))
    expect(shader.vertexShader).toMatch(/sin\(swayAt\) \* 0\.0300/)
    expect(crown).not.toBe(plant)
    expect(compiled(plant).vertexShader).not.toMatch(/uWind/)
    expect((crown as THREE.MeshStandardMaterial).vertexColors).toBe(true)
  })

  it('casts a swaying crown’s shadow from where the crown is: the depth pass sways it the same way, one program per way of swaying', () => {
    const depth = swayingDepthMaterial(0.025, 0.7)
    expect(depth).toBeInstanceOf(THREE.MeshDepthMaterial)
    const shader = compiled(depth)
    const instancing = /#ifdef USE_INSTANCING([\s\S]*?)#endif/
    const [, crown] = compiled(swayingMaterial(std(), 0.025, 0.7)).vertexShader.match(instancing)!
    expect(shader.vertexShader.match(instancing)?.[1]).toBe(crown)
    expect(shader.uniforms.uWind).toBe(windTime)
    expect(depth.customProgramCacheKey()).not.toBe(swayingDepthMaterial(0.03, 0.9).customProgramCacheKey())
  })

  it('keeps a shader change the material already had, and compiles apart from it', () => {
    const plant = std()
    plant.onBeforeCompile = (shader) => {
      shader.fragmentShader = '#define DECODE_VIDEO_TEXTURE\n' + shader.fragmentShader
    }
    const crown = swayingMaterial(plant, 0.025, 0.7)
    expect(compiled(crown).fragmentShader).toMatch(/DECODE_VIDEO_TEXTURE/)
    expect(crown.customProgramCacheKey()).not.toBe(plant.customProgramCacheKey())
    expect(crown.customProgramCacheKey()).not.toBe(swayingMaterial(plant, 0.03, 0.9).customProgramCacheKey())
  })

  it('leans grass as the procedural tufts lean', () => {
    const lean = /float lean = max\(transformed\.y, 0\.0\) \* 0\.256;/
    expect(compiled(leaning()).vertexShader).toMatch(lean)
    expect(compiled(windy()).vertexShader).toMatch(lean)
  })
})

describe('the shiver in the wind', () => {
  it('is carried by every wind shader: added to the gust a tuft leans by and to the angle a crown sways by', () => {
    for (const material of [leaning(), swaying(), windy()]) {
      const shader = compiled(material)
      expect(shader.vertexShader).toMatch(/uniform float uShiver;/)
      expect(shader.vertexShader).toMatch(/uniform float uShiverRadius;/)
      expect(shader.uniforms.uShiver).toBe(shiverWave.strength)
      expect(shader.uniforms.uShiverRadius).toBe(shiverWave.radius)
    }
    expect(compiled(leaning()).vertexShader).toMatch(/float gust = .* \+ shiver;/)
    expect(compiled(swaying()).vertexShader).toMatch(/float rz = sin\(swayAt\) \* 0\.0300 \+ shiver \* 0\.0300;/)
  })

  it('costs a vertex nothing while there is no shiver: it is only worked out while uShiver is above 0', () => {
    for (const material of [leaning(), swaying(), windy()]) {
      const src = compiled(material).vertexShader
      // Each `float shiver` starts at nothing, and is only worked out inside a branch on the uniform.
      const guards = [...src.matchAll(/float shiver = 0\.0;\s*if \(uShiver > 0\.0\) \{([^}]*)\}/g)].map((m) => m[1])
      expect(guards.length).toBeGreaterThan(0)
      expect(guards.length).toBe(src.match(/float shiver\b/g)!.length)
      const inside = guards.join('\n')
      for (const work of [/modelMatrix \* vec4\(instanceMatrix/g, /length\(/g, /exp\(/g]) {
        expect(src.match(work)?.length ?? 0, String(work)).toBe(inside.match(work)?.length ?? 0)
      }
      expect(inside).toMatch(/shiver = uShiver \* exp\(/)
    }
  })

  it('rolls out from the farmhouse in the world’s frame, wherever the piece is', () => {
    expect(HOUSE).toMatchObject({ x: -4, z: -2 })
    const fromHouse = (at: string) => `length(${at} - vec2(-4.000, -2.000))`
    const instancedPlace = fromHouse('(modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xz')
    // A tuft or a model's grass: the instance's place carried into the world, or, not instanced, the mesh's own.
    for (const material of [leaning(), windy()]) {
      const [, instanced, plain] = compiled(material).vertexShader.match(/#ifdef USE_INSTANCING([\s\S]*?)#else([\s\S]*?)#endif/)!
      expect(instanced).toContain(instancedPlace)
      expect(plain).toContain(fromHouse('modelMatrix[3].xz'))
    }
    const [, crown] = compiled(swaying()).vertexShader.match(/#ifdef USE_INSTANCING([\s\S]*?)#endif/)! // a canopy, always instanced
    expect(crown).toContain(instancedPlace)
  })

  it('reaches what sways on the CPU as it reaches the shaders: strongest on the wave’s front', () => {
    try {
      shiverWave.strength.value = 1.6
      shiverWave.radius.value = 7
      expect(shiverAt(HOUSE.x + 7, HOUSE.z)).toBeCloseTo(1.6)
      expect(shiverAt(HOUSE.x, HOUSE.z - 7)).toBeCloseTo(1.6)
      expect(shiverAt(HOUSE.x + 7 + Math.sqrt(4.5), HOUSE.z)).toBeCloseTo(1.6 * Math.exp(-1))
      expect(shiverAt(HOUSE.x, HOUSE.z)).toBeLessThan(0.001) // well inside or out, all but nothing
      expect(shiverAt(HOUSE.x + 20, HOUSE.z)).toBeLessThan(0.001)
      shiverWave.strength.value = 0
      expect(shiverAt(HOUSE.x + 7, HOUSE.z)).toBe(0)
    } finally {
      shiverWave.strength.value = 0
      shiverWave.radius.value = 0
    }
  })
})
