import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import waterRaw from '../../../public/models/water.json?raw'
import type { PatchOpts } from './core'
import { PALETTES, WATER_ANCHORS, WATER_FRAG_PARS, WATER_LIGHT, WATER_UNIFORMS } from './core.gen'
import { createSharedWaterUniforms } from './driver'
import { duskUniforms } from './dusk'
import { waterReadout } from './readout'
import type { WaterPieceId } from './report'
import type { WaterBody, WaterJson, WaterPalette } from './types'
import { bodyUniforms, createWaterMaterial, type WaterMaps, waterProgramKey } from './waterMaterial'

// One patched MeshLambertMaterial per water body: three's lights, shadows, fog and tone mapping, plus water-core's layers.

const water = JSON.parse(waterRaw) as WaterJson
const TIERS = ['phone', 'mid'] as const
const lambert = THREE.ShaderLib.lambert
const palettes = PALETTES as Record<string, WaterPalette>

function bodyOf(piece: WaterPieceId, node: string): WaterBody {
  const body = water.pieces[piece].bodies.find((b: WaterBody) => b.node === node)
  if (!body) throw new Error(`no water body ${piece}/${node}`)
  return body
}
/** Every surface body of water.json (not the skirts, mists or steam), with its piece. */
const surfaces = () =>
  (Object.entries(water.pieces) as [WaterPieceId, WaterJson['pieces'][WaterPieceId]][]).flatMap(([piece, p]) =>
    p.bodies.filter((b: WaterBody) => ['still', 'ribbon', 'fall'].includes(b.kind)).map((body: WaterBody) => ({ piece, body })),
  )

const sharedUniforms = () => createSharedWaterUniforms(water)

function maps(): WaterMaps {
  const map = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat)
  const noise = new THREE.DataTexture(new Uint8Array(2), 1, 1, THREE.RGFormat)
  return { map, noise, origin: [-8.525, 1.975], extent: [9.6, 6.4] }
}

/** A body's water material, for a tier, on a fresh set of shared uniforms and stand-in maps unless it is given them. */
const materialOf = (piece: WaterPieceId, node: string, tier: 'phone' | 'mid', shared = sharedUniforms(), m = maps()) =>
  createWaterMaterial(piece, bodyOf(piece, node), shared, m, tier)

/** Runs a material's onBeforeCompile on a copy of three's own Lambert shader (or a stand-in), as the renderer would. */
function compile(material: THREE.Material, vertexShader = lambert.vertexShader, fragmentShader = lambert.fragmentShader) {
  const shader = { vertexShader, fragmentShader, uniforms: THREE.UniformsUtils.clone(lambert.uniforms) as Record<string, THREE.IUniform> }
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
  return shader
}

/** The fragment shader with a chunk include removed, as a stand-in for an anchor going missing. */
const without = (chunk: string) => lambert.fragmentShader.replace(`#include <${chunk}>`, '')
const count = (text: string, part: string) => text.split(part).length - 1
const definesOf = (fragmentShader: string) => new Set([...fragmentShader.matchAll(/^#define (WATER_[A-Z]+)/gm)].map((m) => m[1]))

/** The uniforms water-core's fragment declarations hold for these defines (its #ifdef / #if defined() || defined() blocks resolved). */
function declaredUniforms(defines: Set<string>): string[] {
  const live: boolean[] = []
  const out: string[] = []
  for (const line of WATER_FRAG_PARS.split('\n').map((l) => l.trim())) {
    let m: RegExpExecArray | null
    if ((m = /^#ifdef (\w+)/.exec(line))) live.push(defines.has(m[1]))
    else if ((m = /^#ifndef (\w+)/.exec(line))) live.push(!defines.has(m[1]))
    else if (line.startsWith('#if ')) {
      if (line.includes('&&')) throw new Error(`teach declaredUniforms this condition: ${line}`)
      live.push([...line.matchAll(/defined\(\s*(\w+)\s*\)/g)].some((d) => defines.has(d[1])))
    } else if (line.startsWith('#else')) live.push(!live.pop())
    else if (line.startsWith('#endif')) live.pop()
    else if ((m = /^uniform \w+ (\w+)/.exec(line)) && live.every(Boolean)) out.push(m[1])
  }
  return out
}

beforeEach(() => {
  const r = waterReadout()
  r.tier = ''
  r.bodies.length = 0
  r.misses.length = 0
  r.compiled.length = 0
})
afterEach(() => vi.unstubAllGlobals())

describe('the water material', () => {
  it('applies every anchor exactly once on the installed three, for every tier, join and ripple', () => {
    const pond = bodyOf('main', 'water_pond')
    let checked = 0
    for (const tier of TIERS) {
      for (const join of [true, false]) {
        for (const ripple of [true, false]) {
          const label = `still ${tier} join ${join} ripple ${ripple}`
          const body: WaterBody = { ...pond, join: join ? pond.join : undefined, ripples: ripple ? pond.ripples : null }
          const shader = compile(createWaterMaterial('main', body, sharedUniforms(), maps(), tier))
          for (const k of ['vertCommon', 'vertWorld'] as const) expect(count(shader.vertexShader, WATER_ANCHORS[k]), `${label} ${k}`).toBe(1)
          for (const k of ['fragCommon', 'color', 'opaque'] as const) expect(count(shader.fragmentShader, WATER_ANCHORS[k]), `${label} ${k}`).toBe(1)
          expect(shader.fragmentShader, label).toContain('wFoamOut')
          const defines = definesOf(shader.fragmentShader)
          expect([defines.has('WATER_MID'), defines.has('WATER_JOIN'), defines.has('WATER_RIPPLE')], label).toEqual([tier === 'mid', join, ripple])
          checked++
        }
      }
    }
    expect(checked).toBe(8)
    expect(waterReadout().misses).toEqual([])
  })

  it('keys the program by kind and tier', () => {
    const key = (piece: WaterPieceId, node: string, tier: 'phone' | 'mid') => materialOf(piece, node, tier).customProgramCacheKey()
    expect(key('main', 'water_pond', 'mid')).toBe('water:brink=0,flow=1,join=1,kind=still,ripple=1,tier=mid,vhead=0|water-floor')
    expect(key('main', 'water_fall', 'mid')).toBe('water:brink=1,flow=0,join=0,kind=fall,ripple=0,tier=mid,vhead=0|water-floor')
    // phone and mid never share a program, nor still water and a stream; bodies that patch alike do (the two falls)
    for (const { piece, body } of surfaces()) expect(key(piece, body.node, 'phone'), body.node).not.toBe(key(piece, body.node, 'mid'))
    for (const tier of TIERS) expect(key('wetland', 'water_lake', tier)).not.toBe(key('wetland', 'water_outflow', tier))
    expect(key('main', 'water_fall', 'mid')).toBe(key('wetland', 'water_fall', 'mid'))
  })

  // PatchOpts can gain a field when core.gen.ts is regenerated: the key must be derived from all of its fields.
  it('puts every patch option in the program key', () => {
    // Required<PatchOpts>: a field added to PatchOpts stops this compiling until it has a value in both objects
    const base: Required<PatchOpts> = { kind: 'still', tier: 'mid', flow: false, join: false, brink: false, vhead: false, ripple: false, debug: 0 }
    const other: Required<PatchOpts> = { kind: 'fall', tier: 'phone', flow: true, join: true, brink: true, vhead: true, ripple: true, debug: 2 }
    const baseKey = waterProgramKey(base)
    const changed = new Map<string, keyof PatchOpts>()
    for (const field of Object.keys(base) as (keyof PatchOpts)[]) {
      expect(other[field], `${field} has a second value to try`).not.toEqual(base[field])
      const key = waterProgramKey({ ...base, [field]: other[field] } as PatchOpts)
      expect(key, `changing ${field} changes the key`).not.toBe(baseKey)
      expect(changed.get(key), `changing ${field} and ${changed.get(key)} make one key`).toBeUndefined()
      changed.set(key, field)
    }
    expect(changed.size).toBe(Object.keys(base).length)
    expect(waterProgramKey({ tier: 'mid', kind: 'still', flow: true })).toBe(waterProgramKey({ kind: 'still', flow: true, debug: undefined, tier: 'mid' }))
  })

  it('falls back to plain Lambert when an anchor is missing, naming the miss once', () => {
    const material = materialOf('main', 'water_pond', 'mid')
    const stub = without('opaque_fragment')
    const shader = compile(material, lambert.vertexShader, stub)
    expect(shader.vertexShader).toBe(lambert.vertexShader)
    expect(shader.fragmentShader).toBe(stub)
    expect(Object.keys(shader.uniforms).sort()).toEqual(Object.keys(lambert.uniforms).sort())
    expect(material.color.equals(new THREE.Color(palettes.pond.mid))).toBe(true)
    expect(waterReadout().misses).toEqual(['main:water_pond: opaque x0'])
    compile(material, lambert.vertexShader, stub) // a recompile (the fader's copy) does not list it twice
    expect(waterReadout().misses).toEqual(['main:water_pond: opaque x0'])
  })

  it('names the piece and the body, in the material and in a miss (every piece has a water_fall)', () => {
    expect(materialOf('wetland', 'water_lake', 'mid').name).toBe('water:wetland:water_lake')
    expect(materialOf('main', 'water_fall', 'mid').name).toBe('water:main:water_fall')
    expect(materialOf('wetland', 'water_fall', 'mid').name).toBe('water:wetland:water_fall')
    const stub = without('opaque_fragment')
    for (const [piece, node] of [['wetland', 'water_lake'], ['main', 'water_fall'], ['wetland', 'water_fall']] as const) compile(materialOf(piece, node, 'mid'), lambert.vertexShader, stub)
    expect(waterReadout().misses).toEqual(['wetland:water_lake: opaque x0', 'main:water_fall: opaque x0', 'wetland:water_fall: opaque x0'])
  })

  // The driver writes the uniforms the body's shader reads, which the material hands out (never through userData, which clone() JSON-copies).
  it('hands out the body’s own uniforms, the ones its shader reads', () => {
    const shared = sharedUniforms()
    const material = materialOf('wetland', 'water_river', 'mid', shared)
    const own = bodyUniforms(material)!
    expect(own.uFill.value).toBe(1)
    const shader = compile(material)
    for (const [k, u] of Object.entries(own)) expect(shader.uniforms[k], k).toBe(u)
    expect(own.uScrollA).toBe(shared.uScrollA)
    const lake = bodyUniforms(materialOf('wetland', 'water_lake', 'mid', shared))!
    expect([lake.uFill, lake.uMid, lake.uWaterMap].map((u, i) => u === [own.uFill, own.uMid, own.uWaterMap][i])).toEqual([false, false, false])
    for (const k of Object.keys(shared)) expect(lake[k], k).toBe(own[k])
    expect(JSON.stringify(material.userData)).not.toContain('uFill')
    expect(bodyUniforms(new THREE.MeshLambertMaterial())).toBeUndefined()
  })

  // A piece rising through the clouds is drawn with the Fader's copies of its materials: the fill and floor must reach them too.
  it('shares them with the fader’s copy, the dusk floor and the body’s share of it included', () => {
    const copyOf = (material: THREE.MeshLambertMaterial) => {
      const copy = material.clone()
      copy.onBeforeCompile = material.onBeforeCompile
      copy.customProgramCacheKey = material.customProgramCacheKey
      copy.transparent = true
      return copy
    }
    const material = materialOf('wetland', 'water_lake', 'mid')
    const copy = copyOf(material)
    const shader = compile(copy)
    expect(shader.uniforms.uFill).toBe(bodyUniforms(material)!.uFill)
    expect(copy.customProgramCacheKey()).toBe(material.customProgramCacheKey())
    expect(shader.fragmentShader).toContain('float wFloor = uWaterFloor')
    expect(shader.uniforms.uWaterFloor).toBe(duskUniforms.uWaterFloor)
    expect(shader.uniforms.uFloorShare).toBe(bodyUniforms(material)!.uFloorShare)
    const river = materialOf('wetland', 'water_river', 'mid')
    const riverShare = compile(copyOf(river)).uniforms.uFloorShare
    expect(riverShare?.value).toBeCloseTo(0.656, 2)
    expect(riverShare).toBe(bodyUniforms(river)!.uFloorShare)
  })

  // Every surface body, every tier: its floor share (a uniform of its own, no program depends on it), the dusk floor laid on after the
  // water, and a shader declaring only uniforms it is given, water-core's and the floor's.
  it('gives every surface body its palette’s floor share, the dusk floor after the water, and every uniform its shader declares', () => {
    const shares: Record<string, number> = { 'main/water_pond': 1, 'main/water_fall': 0.656, 'wetland/water_lake': 1, 'wetland/water_river': 0.656, 'wetland/water_outflow': 0.656, 'wetland/water_fall': 0.656, 'highland/water_tarn': 1, 'highland/water_spring': 0.525 }
    expect(surfaces().map(({ piece, body }) => `${piece}/${body.node}`).sort()).toEqual(Object.keys(shares).sort())
    const own = new Set(Object.keys(lambert.uniforms))
    const allowed: readonly string[] = [...WATER_UNIFORMS, 'uWaterFloor', 'uFloorShare']
    for (const { piece, body } of surfaces()) {
      for (const tier of TIERS) {
        const label = `${piece}/${body.node} ${tier}`
        const material = materialOf(piece, body.node, tier)
        const { uniforms, fragmentShader: fs } = compile(material)
        expect(bodyUniforms(material)!.uFloorShare?.value, label).toBeCloseTo(shares[`${piece}/${body.node}`], 2)
        expect(uniforms.uFloorShare, label).toBe(bodyUniforms(material)!.uFloorShare)
        expect(uniforms.uWaterFloor, label).toBe(duskUniforms.uWaterFloor)
        expect(material.customProgramCacheKey(), label).toMatch(/^water:brink=[01],flow=[01],join=[01],kind=[a-z]+,ripple=[01],tier=[a-z]+,vhead=[01]\|water-floor$/)
        expect(count(fs, 'uniform float uWaterFloor;'), label).toBe(1)
        expect(fs.indexOf('float wFloor = uWaterFloor'), label).toBeGreaterThan(fs.indexOf('#include <envmap_fragment>'))
        expect(fs.indexOf('float wFloor = uWaterFloor'), label).toBeLessThan(fs.indexOf(WATER_LIGHT))
        const declared = [...declaredUniforms(definesOf(fs)), ...[...fs.matchAll(/^uniform float (uWaterFloor|uFloorShare);/gm)].map((m) => m[1])]
        expect(declared.length, label).toBeGreaterThan(20)
        expect(declared.filter((k) => !(k in uniforms)), `${label}: declared but not given`).toEqual([])
        expect(Object.keys(uniforms).filter((k) => !own.has(k) && !allowed.includes(k)), `${label}: given but not water-core's or the floor's`).toEqual([])
      }
    }
    expect(waterReadout().misses).toEqual([])
    // the share is a uniform, not a define: a lake on the spring's palette has another share but the same program
    const asLake = materialOf('wetland', 'water_lake', 'mid')
    const asSpring = createWaterMaterial('wetland', { ...bodyOf('wetland', 'water_lake'), palette: 'spring' }, sharedUniforms(), maps(), 'mid')
    expect(bodyUniforms(asSpring)!.uFloorShare.value).not.toBe(bodyUniforms(asLake)!.uFloorShare.value)
    expect(asSpring.customProgramCacheKey()).toBe(asLake.customProgramCacheKey())
    expect(compile(asSpring).fragmentShader).toBe(compile(asLake).fragmentShader)
    // a fall's brink is its channel's surface on the river's palette, as dark as the fall's own: the fall's one share serves both
    expect(palettes.river.deep).toBe(palettes.fall.deep)
    for (const piece of ['main', 'wetland'] as const) expect(bodyOf(piece, 'water_fall').brink?.to, `${piece}/water_fall`).toBe('river')
  })

  it('draws the water without its floor, naming the miss, when the floor’s anchor is missing', () => {
    const shader = compile(materialOf('wetland', 'water_lake', 'mid'), lambert.vertexShader, without('envmap_fragment'))
    expect(shader.fragmentShader).toContain('wFoamOut')
    expect(shader.fragmentShader).not.toContain('uWaterFloor')
    expect(['uWaterFloor' in shader.uniforms, 'uFloorShare' in shader.uniforms]).toEqual([false, false])
    expect(waterReadout().misses).toEqual(['wetland:water_lake: envmap x0'])
  })

  it('sets the body’s uniforms as the art proof does', () => {
    const m = maps()
    const pond = bodyOf('main', 'water_pond')
    const material = createWaterMaterial('main', pond, sharedUniforms(), m, 'mid')
    const u = compile(material).uniforms
    expect(u.uWaterMap.value).toBe(m.map)
    expect(u.uWaterNoise.value).toBe(m.noise)
    expect(u.uMapOrigin.value).toEqual(new THREE.Vector2(-8.525, 1.975))
    expect(u.uMapExtent.value).toEqual(new THREE.Vector2(9.6, 6.4))
    for (const [k, c] of [['uShallow', 'shallow'], ['uMid', 'mid'], ['uDeep', 'deep'], ['uFoamCol', 'foam'], ['uBed', 'bed']] as const) {
      expect(u[k].value, k).toEqual(new THREE.Color(palettes.pond[c]))
      expect(u[`${k}2`].value, `${k}2`).toEqual(new THREE.Color(palettes.river[c])) // the join hands over to the stream's palette
    }
    expect(u.uJoin.value).toEqual(new THREE.Vector4(pond.join!.u0, pond.join!.ramp, pond.join!.uEnd, pond.join!.handover))
    expect([u.uVirtual.value, u.uUStart.value, u.uLength.value, u.uFill.value]).toEqual([1, 0, pond.length, 1])
    expect([u.uRippleDensity.value, u.uRippleShore.value]).toEqual([0.42, 0])
    expect(material.color.equals(new THREE.Color(palettes.pond.mid))).toBe(true)
    expect([material.transparent, material.depthWrite, material.side, material.userData.celKind]).toEqual([true, true, THREE.FrontSide, 'none'])

    // a stream's ambient density is 0, but it still carries the ripple uniforms (its chevrons); its virtual head
    const river = compile(materialOf('wetland', 'water_river', 'mid')).uniforms
    expect([river.uRippleDensity.value, river.uRippleShore.value]).toEqual([0, 0])
    expect(river.uVHead.value).toEqual(new THREE.Vector2(3.6457, 5.0457))
    expect('uJoin' in river).toBe(false)

    // a fall: its brink, no ripples, double-sided, writes no depth, lit through
    const fall = createWaterMaterial('main', bodyOf('main', 'water_fall'), sharedUniforms(), maps(), 'phone')
    const fu = compile(fall).uniforms
    expect(fu.uBrink.value).toEqual(new THREE.Vector2(0.075, 0.16))
    expect(fu.uMid2.value).toEqual(new THREE.Color(palettes.river.mid))
    expect('uRippleDensity' in fu).toBe(false)
    expect([fall.depthWrite, fall.side]).toEqual([false, THREE.DoubleSide])
    expect(fall.emissive.equals(new THREE.Color(palettes.fall.shallow).multiplyScalar(0.35))).toBe(true)

    // the spring has `ripples: null`
    expect('uRippleDensity' in compile(materialOf('highland', 'water_spring', 'mid')).uniforms).toBe(false)
  })

  it('refuses a node that is no surface', () => {
    expect(() => materialOf('main', 'water_fall_skirt', 'mid')).toThrow(/not a water surface/)
  })
})
