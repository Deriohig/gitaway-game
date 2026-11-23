import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useEffect, type RefObject } from 'react'
import { HOUSE } from './layout'

// One shared clock for everything that moves in the breeze.

export const windTime = { value: 0 }

/**
 * The shiver that follows work, as a wave rolling out through the grass and
 * the trees from the farmhouse (ShiverDriver.tsx plays it): how hard it pushes
 * now, and how far out from the farmhouse its front is, in world units.
 */
export const shiverWave = { strength: { value: 0 }, radius: { value: 0 } }

/** How wide the shiver's front is: it falls to 1/e of its strength √4.5, about 2.1 u, either side of it. */
const SHIVER_SPREAD = 4.5

/**
 * The shiver at a place on the ground, in the world's frame: its strength on
 * the wave's front, falling away either side, and nothing while there's no
 * shiver. For what sways on the CPU; the shaders work it out the same way
 * (`shiverCode`).
 */
export function shiverAt(x: number, z: number): number {
  const strength = shiverWave.strength.value
  if (strength <= 0) return 0
  const off = Math.hypot(x - HOUSE.x, z - HOUSE.z) - shiverWave.radius.value
  return strength * Math.exp(-(off * off) / SHIVER_SPREAD)
}

/**
 * Shader code for `float shiver`, the shiver at `at`, a vec2 place on the
 * ground in the world's frame, as `shiverAt` works it out. While there's no
 * shiver, which is nearly always, it's 0 and nothing is worked out, `at`
 * included: the branch is on a uniform, so every vertex takes the same way.
 */
const shiverCode = (at: string) => `
        float shiver = 0.0;
        if (uShiver > 0.0) {
          float fromFront = length(${at} - vec2(${HOUSE.x.toFixed(3)}, ${HOUSE.z.toFixed(3)})) - uShiverRadius;
          shiver = uShiver * exp(-fromFront * fromFront / ${SHIVER_SPREAD.toFixed(3)});
        }`

/** Adds code to a vertex shader, after its vertex is read, with the wind clock and the shiver to hand. */
function inWind(shader: THREE.WebGLProgramParametersWithUniforms, code: string) {
  shader.uniforms.uWind = windTime
  shader.uniforms.uShiver = shiverWave.strength
  shader.uniforms.uShiverRadius = shiverWave.radius
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uWind;\nuniform float uShiver;\nuniform float uShiverRadius;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${code}`)
}

/**
 * Leans the vertex in the wind, more the higher it is, gusting by where it
 * stands, and further as the shiver passes. The gust goes by the instance's
 * place in its own piece; the shiver by its place in the world, so it rolls on
 * across the pieces from the farmhouse (ruling R14).
 */
const lean = (strength: number) => `
        #ifdef USE_INSTANCING
          vec3 wp = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);${shiverCode('(modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xz')}
        #else
          vec3 wp = vec3(modelMatrix[3][0], 0.0, modelMatrix[3][2]);${shiverCode('modelMatrix[3].xz')}
        #endif
        float gust = sin(uWind * 1.05 + wp.x * 0.55 + wp.z * 0.4) * 0.6 + sin(uWind * 1.85 + wp.x * 1.3 - wp.z) * 0.25 + shiver;
        float lean = max(transformed.y, 0.0) * ${(0.16 * strength).toFixed(3)};
        transformed.x += gust * lean;
        transformed.z += gust * lean * 0.6;`

/**
 * Rocks each instance about its own origin as useSway rocks a crown (about z,
 * then a little about x), `amount` radians at `speed`, its phase from where it
 * stands so neighbours don't move as one; and further about z, by `amount`
 * times the shiver where it stands in the world, as the shiver passes.
 */
const sway = (amount: number, speed: number) => `
        #ifdef USE_INSTANCING
          float swayAt = uWind * ${speed.toFixed(3)} + instanceMatrix[3][0] * 1.7 + instanceMatrix[3][2] * 2.3;${shiverCode('(modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xz')}
          float rz = sin(swayAt) * ${amount.toFixed(4)} + shiver * ${amount.toFixed(4)};
          float rx = sin(swayAt * 0.8 + 1.3) * ${(amount * 0.6).toFixed(4)};
          transformed.xy = mat2(cos(rz), sin(rz), -sin(rz), cos(rz)) * transformed.xy;
          transformed.yz = mat2(cos(rx), sin(rx), -sin(rx), cos(rx)) * transformed.yz;
        #endif`

/** Lambert material whose vertices lean in the wind, more the higher they are. */
export function windMaterial(color: string, strength = 1): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true })
  m.onBeforeCompile = (shader) => inWind(shader, lean(strength))
  m.customProgramCacheKey = () => `wind-${strength}`
  return m
}

/** A copy of a model's material with `code` added in the wind, keeping any shader change it already has. */
function windCopy(material: THREE.Material, code: string, key: string): THREE.Material {
  const m = material.clone()
  const before = material.onBeforeCompile
  const was = material.customProgramCacheKey()
  m.onBeforeCompile = (shader, renderer) => {
    before.call(m, shader, renderer)
    inWind(shader, code)
  }
  m.customProgramCacheKey = () => `${was}|${key}`
  return m
}

/** A copy of a model's material whose instances lean in the wind as the grass tufts do. */
export const leaningMaterial = (material: THREE.Material, strength = 1): THREE.Material => windCopy(material, lean(strength), `lean-${strength}`)

/**
 * A copy of a model's material whose instances sway in the breeze about their
 * own origin, as useSway rocks a tree's crown: for the composition's instanced
 * canopies, whose origin is the crown's pivot at the trunk top. It all happens
 * in the vertex shader, so nothing is moved on the CPU from frame to frame.
 */
export const swayingMaterial = (material: THREE.Material, amount: number, speed: number): THREE.Material =>
  windCopy(material, sway(amount, speed), `sway-${amount}-${speed}`)

/**
 * A shadow pass material for crowns swaying as swayingMaterial sways them:
 * without one the depth pass drew each crown still, and its shadow slid across
 * the swaying fronds. three copies the drawn material's map, alpha test and
 * sides onto it before each shadow draw, so the leaves' cut-outs cast their own
 * shapes; give each drawn material its own (Composed.tsx keeps one per model
 * material), so nothing changes on it from draw to draw.
 */
export const swayingDepthMaterial = (amount: number, speed: number): THREE.MeshDepthMaterial =>
  windCopy(new THREE.MeshDepthMaterial(), sway(amount, speed), `sway-${amount}-${speed}`) as THREE.MeshDepthMaterial

const placed = new THREE.Vector3()

/** Advances the wind clock, and rocks what sways on the CPU, further as the shiver passes it. Mount once inside the Canvas. */
export function WindDriver() {
  useFrame(({ clock }) => {
    windTime.value = clock.elapsedTime
    const shivering = shiverWave.strength.value > 0
    for (const s of swayers) {
      const g = s.ref.current
      if (!g) continue
      const t = clock.elapsedTime * s.speed + s.phase
      // Where it stands is only looked up while the shiver passes.
      let shiver = 0
      if (shivering) {
        g.getWorldPosition(placed)
        shiver = shiverAt(placed.x, placed.z)
      }
      g.rotation.z = Math.sin(t) * s.amount + shiver * s.amount
      g.rotation.x = Math.sin(t * 0.8 + 1.3) * s.amount * 0.6
    }
  })
  return null
}

interface Swayer {
  ref: RefObject<THREE.Object3D | null>
  phase: number
  amount: number
  speed: number
}
const swayers = new Set<Swayer>()

/** Gently rocks an object (a tree canopy, a flower) in the breeze. */
export function useSway(ref: RefObject<THREE.Object3D | null>, phase: number, amount = 0.035, speed = 0.9) {
  useEffect(() => {
    const s = { ref, phase, amount, speed }
    swayers.add(s)
    return () => {
      swayers.delete(s)
    }
  }, [ref, phase, amount, speed])
}
