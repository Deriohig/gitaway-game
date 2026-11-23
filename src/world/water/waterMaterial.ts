import * as THREE from 'three'
import { addPatch } from '../look/patch'
import { type PatchOpts, patchOptsFor, patchWaterLambert } from './core'
import { PALETTES } from './core.gen'
import { duskUniforms, floorShare, patchWaterFloor } from './dusk'
import { waterReadout } from './readout'
import type { WaterPieceId } from './report'
import type { WaterTierName } from './tier'
import type { BodyWaterUniforms, SharedWaterUniforms, WaterBody, WaterPalette } from './types'

// One MeshLambertMaterial per water body (spec §4.2), patched by water-core's
// patchWaterLambert through addPatch: the water gets three's sun, hemisphere
// light, received shadows, fog and tone mapping, plus its own layers. A mirror
// of the art proof's water v2 materials (art/scripts/lib/arch-scene.js). Then
// the game's own dusk floor (dusk.ts) is laid on, so the lit water stays
// readable at dusk and at night.

// ---- the material --------------------------------------------------------------

/** A piece's water map and the shared noise, with the map's rectangle (piece-local, u). */
export interface WaterMaps {
  map: THREE.DataTexture
  noise: THREE.DataTexture
  origin: [number, number]
  /** The map's size in u: its texels times the texel size. */
  extent: [number, number]
}

const palettes = PALETTES as Record<string, WaterPalette>

/** A palette as uShallow, uMid, ... (or, with '2', the second palette a join or a brink hands over to). */
function paletteUniforms(p: WaterPalette, n: '' | '2'): Record<string, THREE.IUniform<THREE.Color>> {
  return {
    [`uShallow${n}`]: { value: new THREE.Color(p.shallow) },
    [`uMid${n}`]: { value: new THREE.Color(p.mid) },
    [`uDeep${n}`]: { value: new THREE.Color(p.deep) },
    [`uFoamCol${n}`]: { value: new THREE.Color(p.foam) },
    [`uBed${n}`]: { value: new THREE.Color(p.bed) },
  }
}

const bit = (on: boolean | undefined) => (on ? 1 : 0)

/** An option's value as it is written in the program key: a flag as 0 or 1, a word as it is, anything else as JSON. */
const keyValue = (v: unknown) => (typeof v === 'boolean' ? bit(v) : typeof v === 'string' ? v : JSON.stringify(v))

/**
 * The key of a water program (three's program cache key, before the floor's): every field of the options
 * patchWaterLambert is given, by name in sorted order, so a field that water-core adds to PatchOpts can't be
 * left out of it and let two different shaders share one program. A field left undefined counts as absent,
 * as it does to the patch. Bodies that patch alike have the same key. For the farm pond on the mid tier:
 * `water:brink=0,flow=1,join=1,kind=still,ripple=1,tier=mid,vhead=0`.
 */
export function waterProgramKey(opts: PatchOpts): string {
  const fields = Object.entries(opts)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${keyValue(v)}`)
  return `water:${fields.join(',')}`
}

/**
 * The uniforms each water material's shader reads, by material: kept here, not
 * in `userData` (which clone() JSON-copies, and the driver writes to them each
 * frame). A copy of the material that takes over its hooks (Rising.tsx's
 * Fader) runs the same patch, so its shader reads these same objects.
 */
const BODY_UNIFORMS = new WeakMap<THREE.Material, BodyWaterUniforms>()

/**
 * The uniforms a water material hands its shader: the body's own (its fill,
 * which the driver writes, its map, palette and shape, and its share of the
 * dusk floor) and the session's shared ones. Undefined for a material that
 * isn't water.
 */
export function bodyUniforms(material: THREE.Material): BodyWaterUniforms | undefined {
  return BODY_UNIFORMS.get(material)
}

/**
 * The material of one surface of a piece's water (still, ribbon or fall; it
 * throws for the skirt, the mist and the steam), named `water:<piece>:<node>`.
 * The shared uniforms are passed by reference, so the driver steps every body
 * at once; the body's own are in bodyUniforms. If three's Lambert shader lacks
 * one of the patch's anchors, the material stays plain Lambert in the body's
 * mid colour and the miss is listed in `waterReadout().misses` as
 * `<piece>:<node>: <misses>`. The dusk floor is a second patch (program key
 * `<water key>|water-floor`) reading the session's duskUniforms and the
 * body's own share of the floor (uFloorShare, its palette's: dusk.ts
 * floorShare), set here once; if its own anchor is missing the water is drawn
 * without it, and that miss is listed the same way.
 */
export function createWaterMaterial(piece: WaterPieceId, body: WaterBody, shared: SharedWaterUniforms, maps: WaterMaps, tier: WaterTierName): THREE.MeshLambertMaterial {
  const opts = patchOptsFor(body, tier)
  const { kind } = opts
  const pal = palettes[body.palette ?? ''] ?? palettes.river
  const material = new THREE.MeshLambertMaterial({
    name: `water:${piece}:${body.node}`,
    color: pal.mid,
    transparent: true,
    depthWrite: kind !== 'fall',
    side: kind === 'fall' ? THREE.DoubleSide : THREE.FrontSide,
  })
  // the water's own layers do its posterising
  material.userData.celKind = 'none'
  // a falling sheet is lit through: never darker than a third of its body tone
  if (kind === 'fall') material.emissive = new THREE.Color(pal.shallow).multiplyScalar(0.35)

  // (the body's share of the floor joins them with the floor's patch, below)
  const uniforms: { uFill: THREE.IUniform<number> } & Record<string, THREE.IUniform> = {
    ...shared,
    uWaterMap: { value: maps.map },
    uWaterNoise: { value: maps.noise },
    uMapOrigin: { value: new THREE.Vector2(...maps.origin) },
    uMapExtent: { value: new THREE.Vector2(...maps.extent) },
    ...paletteUniforms(pal, ''),
    uVirtual: { value: body.virtual ? 1 : 0 },
    uUStart: { value: body.uStart || 0 },
    uLength: { value: body.length || 1 },
    uFill: { value: 1 },
  }
  // the farm pond's join into its stream (the flow ramp and the palette hand-over), a fall's brink, the river's virtual head
  const second = (to: string) => paletteUniforms(palettes[to] ?? pal, '2')
  const { join, brink, vhead, ripples } = body
  if (join) Object.assign(uniforms, { uJoin: { value: new THREE.Vector4(join.u0, join.ramp, join.uEnd, join.handover) } }, second(join.to))
  if (brink) Object.assign(uniforms, { uBrink: { value: new THREE.Vector2(brink.start || 0, brink.len) } }, second(brink.to))
  if (vhead) uniforms.uVHead = { value: new THREE.Vector2(vhead[0], vhead[1]) }
  if (opts.ripple) {
    uniforms.uRippleDensity = { value: ripples?.density || 0 }
    uniforms.uRippleShore = { value: ripples?.shore || 0 }
  }

  // one program per set of patch options: the key is three's program cache key
  const key = waterProgramKey(opts)
  /** Lists a patch's miss in the readout once (a recompile, the Fader's copy, says it again). */
  const listMiss = (found: string[]) => {
    const miss = `${piece}:${body.node}: ${found.join(', ')}`
    const { misses } = waterReadout()
    if (!misses.includes(miss)) misses.push(miss)
  }
  addPatch(material, key, (shader) => {
    const r = patchWaterLambert(shader.vertexShader, shader.fragmentShader, opts)
    if (!r.applied) return listMiss(r.misses)
    shader.vertexShader = r.vertexShader
    shader.fragmentShader = r.fragmentShader
    Object.assign(shader.uniforms, uniforms)
  })
  // then the game's dusk floor (dusk.ts), on the water only: a shader the water patch left as plain Lambert keeps
  // none, and a floor that misses leaves the water drawn without it. Added here, so the Fader's copies, which run
  // this material's patches, lay it on too and read the session's one floor, and this body's share of it: a float
  // set once from its palette (the join's stream takes its second palette's in the shader), never a define, so the
  // bodies that patch alike keep one program.
  const floor = { uFloorShare: { value: floorShare(pal.deep) } }
  addPatch(material, 'water-floor', (shader) => {
    const r = patchWaterFloor(shader.fragmentShader)
    if (r.misses.length) listMiss(r.misses)
    if (!r.applied) return
    shader.fragmentShader = r.fragmentShader
    Object.assign(shader.uniforms, duskUniforms, floor)
  })
  BODY_UNIFORMS.set(material, { ...uniforms, ...floor })
  return material
}
