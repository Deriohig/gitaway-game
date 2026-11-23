import * as THREE from 'three'
import { clamp01 } from '../random'
import { skyAt, type SkyState } from '../skyPalette'
import { PALETTES } from './core.gen'

// The dusk floor (plan I9, the owner's complaint at dusk): the baked water is
// lit, so at dusk and at night it goes as dark and flat as the light, its
// depth bands too close to tell apart. Three game-side knobs, keyed to one
// measure of the day's light, keep it readable without glowing the way the
// unlit legacy water does: a floor the lit water is lifted to, a smaller share
// of the dark sky in its reflection, and a dimmer glow on the falls. No
// palette changes: the art's colours are as they are at noon.

// ---- the day's light -------------------------------------------------------------

/** Relative luminance (Rec. 709) of a linear colour. */
const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

/**
 * The light a level surface gets from the sky (E): the sun's (its intensity,
 * its colour's luminance, the height of its direction) and the hemisphere's
 * (from above). Lambert draws a surface at its albedo times E over π.
 */
export function skyLight(s: SkyState): number {
  return s.sunI * lum(s.sun) * Math.max(s.lightDir.y, 0) + s.hemiI * lum(s.hemiSky)
}

// (skyAt makes new colours and vectors each call: the two ends are read once)
const NIGHT_LIGHT = skyLight(skyAt(0))
const NOON_LIGHT = skyLight(skyAt(13))

/**
 * How far the day's light stands between night and noon: 1 at 13:00, 0 at
 * night. It falls steadily through the afternoon and evening; at 21:00 the
 * night light takes over from the sun, higher in the sky, a small bump the
 * floor follows like the rest of the scene.
 */
export function daylight(sky: SkyState): number {
  return clamp01((skyLight(sky) - NIGHT_LIGHT) / (NOON_LIGHT - NIGHT_LIGHT))
}

// ---- the knobs ---------------------------------------------------------------------

/**
 * The floor, by the day's light: [daylight, floor], where the floor is the
 * least the lit water is drawn at, as a share of its albedo's luminance. Night
 * (0.24) is the owner's choice of "a little lighter than the grass". It is 0
 * from late afternoon on to noon, so midday and its shadows are untouched, and
 * never more than half the noon brightness (0.5 x NOON_LIGHT / π, about
 * 0.397), so the water can't glow the way the legacy water does (0.65 to 1
 * times its albedo, unlit).
 */
export const FLOOR_KEYS = [[0, 0.24], [0.1, 0.34], [0.3, 0.38], [0.6, 0]] as const

/** The floor at this much of the day's light: linear between FLOOR_KEYS, the first key's below them and 0 above the last. */
export function waterFloorAt(day: number): number {
  const keys = FLOOR_KEYS
  if (day <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [d1, f1] = keys[i]
    if (day <= d1) {
      const [d0, f0] = keys[i - 1]
      return f0 + ((f1 - f0) * (day - d0)) / (d1 - d0)
    }
  }
  return keys[keys.length - 1][1]
}

/** The day's light from which the sky's share and the falls' glow are whole. */
const WHOLE_FROM = 0.3

/** The share of the look's sky reflection (WATER_LOOK.skyMix) kept at night, so the dark sky doesn't grey the bands. */
export const NIGHT_SKY_MIX = 0.6

/** The share of the sky reflection at this much of the day's light: NIGHT_SKY_MIX at night, whole from a third of the day. */
export function skyMixShareAt(day: number): number {
  return NIGHT_SKY_MIX + (1 - NIGHT_SKY_MIX) * Math.min(1, day / WHOLE_FROM)
}

/** A fall's glow (its material's emissiveIntensity) at night: it is lit through, but not a lamp. */
export const FALL_GLOW_NIGHT = 0.4

/** A fall's glow at this much of the day's light: FALL_GLOW_NIGHT at night, whole from a third of the day. */
export function fallGlowAt(day: number): number {
  return FALL_GLOW_NIGHT + (1 - FALL_GLOW_NIGHT) * Math.min(1, day / WHOLE_FROM)
}

/**
 * The floor's uniform: one object for the session, which every water
 * material's shader reads (and the Fader's copies, which run the same patch)
 * and the driver writes each frame (driver.ts stepWater).
 */
export const duskUniforms: { uWaterFloor: THREE.IUniform<number> } = { uWaterFloor: { value: 0 } }

// ---- each body's share of the floor ----------------------------------------------------

/**
 * The lake's deep band's luminance (0.1687 today), up to the next hundredth
 * (0.17, so the lake's own share is whole whatever the colour): at night no
 * body's deep band is floored above it. The floor is a share of each pixel's
 * albedo, and the palettes' deep bands differ about twofold, so without a
 * share of their own the light palettes (the river and the falls, 0.259; the
 * spring, 0.324) stood 3 to 6 times the grass at night, where the lake, the
 * tarn and the pond stand a little lighter than it (Task 7's night look, p1).
 * Taken from the lake's palette, not copied from it: core.gen.ts is
 * regenerated with the art's water-core, and the reference follows the lake
 * when its colour changes. Rounded up so a regeneration that doesn't move
 * the lake's luminance by a hundredth leaves the tuned shares as they are.
 */
export const FLOOR_DEEP_REF = Math.ceil(lum(new THREE.Color(PALETTES.lake.deep)) * 100) / 100

/**
 * A body's share of the floor, from its palette's deep colour: the lake's deep
 * band over its own, and whole for a palette no lighter than the lake's (the
 * pond, the lake and the tarn). 0.656 for the river and the falls, 0.525 for
 * the spring. One scale for the whole body, so its bands keep their ratios.
 * Its material sets it once, as the uniform uFloorShare (waterMaterial.ts):
 * it never changes with the day, and builds no program.
 */
export function floorShare(deep: THREE.ColorRepresentation): number {
  return Math.min(1, FLOOR_DEEP_REF / lum(new THREE.Color(deep)))
}

// ---- the patch -----------------------------------------------------------------------

/** Where the floor goes in: its uniforms after the common chunk, and the floor itself after the envmap's, before WATER_LIGHT's Fresnel. */
export const FLOOR_ANCHORS = { fragCommon: '#include <common>', envmap: '#include <envmap_fragment>' } as const

/**
 * The floor: the lit water is scaled up to at least uWaterFloor times the
 * body's share of it (uFloorShare, floorShare) times its albedo's luminance.
 * A scale, so it keeps the light's hue, and the bands (each with its own
 * albedo) keep their ratios. Water lit not at all takes the floor in its
 * albedo's colour.
 *
 * The farm pond and its stream are one body (R1.3) on the pond's palette,
 * which hands over to the river's only at the stream's very end; so the
 * stream takes the river's share as it starts to flow, along water-core's
 * flow ramp (its `jW`), worked out from the join's second palette's deep
 * colour, which the shader has already (Task 7's p4).
 */
export const WATER_FLOOR = `{
  float wLum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
  float wShare = uFloorShare;
  #ifdef WATER_JOIN
  wShare = mix( wShare, min( 1.0, ${FLOOR_DEEP_REF.toFixed(3)} / dot( uDeep2, vec3( 0.2126, 0.7152, 0.0722 ) ) ), smoothstep( uJoin.x, uJoin.x + uJoin.y, vWaterUv.x ) );
  #endif
  float wFloor = uWaterFloor * wShare * dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  outgoingLight = wLum > 1e-4 ? outgoingLight * max( 1.0, wFloor / wLum ) : diffuseColor.rgb * uWaterFloor * wShare;
}`

export interface FloorPatchResult {
  fragmentShader: string
  /** False when nothing was changed: see `misses` (empty for a shader that isn't water). */
  applied: boolean
  misses: string[]
}

const countOf = (s: string, sub: string) => s.split(sub).length - 1

/**
 * Lays the floor on a Lambert fragment shader that water-core's patch has
 * made water (it holds `wFoamOut`); any other shader is left as it is, with
 * no misses. Each anchor must occur exactly once, and the shader must not
 * have its floor already; otherwise nothing is changed and `misses` says why
 * (`envmap x0`, `fragCommon x2`, `already patched`).
 */
export function patchWaterFloor(fragmentShader: string): FloorPatchResult {
  if (!fragmentShader.includes('wFoamOut')) return { fragmentShader, applied: false, misses: [] }
  const misses: string[] = []
  if (fragmentShader.includes('uWaterFloor')) misses.push('already patched')
  for (const [k, anchor] of Object.entries(FLOOR_ANCHORS)) {
    const n = countOf(fragmentShader, anchor)
    if (n !== 1) misses.push(`${k} x${n}`)
  }
  if (misses.length) return { fragmentShader, applied: false, misses }
  const A = FLOOR_ANCHORS
  // (replacer functions, so a `$` in the GLSL is never read as a replacement pattern)
  const fs = fragmentShader
    .replace(A.fragCommon, () => `${A.fragCommon}\nuniform float uWaterFloor;\nuniform float uFloorShare;`)
    .replace(A.envmap, () => `${A.envmap}\n${WATER_FLOOR}`)
  return { fragmentShader: fs, applied: true, misses }
}
