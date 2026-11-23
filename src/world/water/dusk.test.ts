import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { skyAt } from '../skyPalette'
import { patchWaterLambert } from './core'
import { PALETTES, WATER_COLOR, WATER_LIGHT } from './core.gen'
import { daylight, duskUniforms, FALL_GLOW_NIGHT, fallGlowAt, FLOOR_DEEP_REF, FLOOR_KEYS, floorShare, NIGHT_SKY_MIX, patchWaterFloor, skyLight, skyMixShareAt, WATER_FLOOR, waterFloorAt } from './dusk'
import type { WaterPalette } from './types'

// The dusk floor: lit water keeps a floor, the sky reflection's share and the falls' glow follow the day's light (1 at 13:00, 0 at night).

const lambert = THREE.ShaderLib.lambert
const waterFragment = (opts = {}) => patchWaterLambert(lambert.vertexShader, lambert.fragmentShader, { kind: 'still', tier: 'mid', flow: true, join: true, ripple: true, ...opts }).fragmentShader
const count = (text: string, part: string) => text.split(part).length - 1
const palettes = PALETTES as Record<string, WaterPalette>
const lumOf = (hex: string) => {
  const c = new THREE.Color(hex)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
}

/** The uniforms and varyings a fragment shader declares at its top level, with the #ifdef/#ifndef/#if defined() blocks resolved against its #defines. */
function declaredGlobals(fragmentShader: string): string[] {
  const head = fragmentShader.slice(0, fragmentShader.indexOf('void main'))
  const defines = new Set([...head.matchAll(/^#define (\w+)/gm)].map((m) => m[1]))
  const isDefined = (term: string) => {
    const m = /^(!?)\s*defined\(\s*(\w+)\s*\)$/.exec(term.trim())
    if (!m) throw new Error(`teach declaredGlobals this condition: ${term}`)
    return defines.has(m[2]) !== (m[1] === '!')
  }
  const live: boolean[] = []
  const out: string[] = []
  for (const line of head.split('\n').map((l) => l.trim())) {
    let m: RegExpExecArray | null
    if ((m = /^#ifdef (\w+)/.exec(line))) live.push(defines.has(m[1]))
    else if ((m = /^#ifndef (\w+)/.exec(line))) live.push(!defines.has(m[1]))
    else if ((m = /^#if (.+)/.exec(line))) live.push(m[1].split('||').some((any) => any.split('&&').every(isDefined)))
    else if (line.startsWith('#elif')) throw new Error(`teach declaredGlobals #elif: ${line}`)
    else if (line.startsWith('#else')) live.push(!live.pop())
    else if (line.startsWith('#endif')) live.pop()
    else if ((m = /^(?:uniform|varying) \w+ (\w+)\s*;/.exec(line)) && live.every(Boolean)) out.push(m[1])
  }
  return out
}

describe('daylight', () => {
  it('is 1 at 13:00, 0 at night, in its bands between, and never rises but by the night light’s small bump after 21:00', () => {
    const at = (h: number) => daylight(skyAt(h))
    expect(at(13)).toBeCloseTo(1, 12)
    expect([at(2), at(22.6)]).toEqual([0, 0])
    for (const [h, lo, hi] of [[16.6, 0.55, 0.85], [19.1, 0.2, 0.45], [20.1, 0, 0.15]]) expect([at(h) >= lo, at(h) <= hi], `${h} h`).toEqual([true, true])
    for (let t = 130; t < 209; t++) expect(at((t + 1) / 10), `${(t + 1) / 10} h`).toBeLessThanOrEqual(at(t / 10) + 1e-12)
    for (let t = 209; t <= 240; t++) expect(at(t / 10), `${t / 10} h`).toBeLessThanOrEqual(at(20.9) + 0.065)
  })
})

describe('the floor', () => {
  it('runs between its keys, is 0 from late afternoon to noon, and never lifts the water past half its noon brightness', () => {
    expect(FLOOR_KEYS).toEqual([[0, 0.24], [0.1, 0.34], [0.3, 0.38], [0.6, 0]])
    for (const [day, floor] of [[0, 0.24], [0.1, 0.34], [0.3, 0.38], [0.45, 0.19], [0.6, 0], [0.8, 0], [1, 0]]) expect(waterFloorAt(day), `daylight ${day}`).toBeCloseTo(floor, 12)
    expect(Math.max(...FLOOR_KEYS.map(([, floor]) => floor))).toBeLessThanOrEqual((0.5 * skyLight(skyAt(13))) / Math.PI)
    expect(typeof duskUniforms.uWaterFloor.value).toBe('number')
  })

  it('eases the sky reflection and the falls’ glow at night, and leaves them whole from a third of the day’s light', () => {
    expect([NIGHT_SKY_MIX, FALL_GLOW_NIGHT, skyMixShareAt(0), fallGlowAt(0)]).toEqual([0.6, 0.4, 0.6, 0.4])
    expect([skyMixShareAt(0.15), fallGlowAt(0.15)]).toEqual([expect.closeTo(0.8, 12), expect.closeTo(0.7, 12)])
    for (const day of [0.3, 0.6, 1]) expect([skyMixShareAt(day), fallGlowAt(day)], `daylight ${day}`).toEqual([1, 1])
  })
})

// Each body's floor is scaled so that no palette's deep band is floored above the lake's.
describe('each palette’s share of the floor', () => {
  it('is the lake’s deep band over its own, whole for palettes no lighter than the lake’s, and floors none above the lake’s at night', () => {
    expect(FLOOR_DEEP_REF).toBe(0.17)
    expect(lumOf(palettes.lake.deep)).toBeCloseTo(FLOOR_DEEP_REF, 2)
    expect(lumOf(palettes.lake.deep)).toBeLessThanOrEqual(FLOOR_DEEP_REF)
    for (const p of ['pond', 'lake', 'tarn']) expect(floorShare(palettes[p].deep), p).toBe(1)
    expect(floorShare(palettes.river.deep)).toBeCloseTo(0.656, 2)
    expect(floorShare(palettes.fall.deep)).toBeCloseTo(0.656, 2)
    expect(floorShare(palettes.spring.deep)).toBeCloseTo(0.525, 2)
    for (const [name, p] of Object.entries(palettes)) expect(waterFloorAt(0) * floorShare(p.deep) * lumOf(p.deep), name).toBeLessThanOrEqual(waterFloorAt(0) * FLOOR_DEEP_REF + 1e-9)
  })

  // core.gen.ts is regenerated with the art's water-core, so the reference must follow the lake's deep band.
  it('takes its reference from the lake’s deep band in the palettes', async () => {
    const deep = palettes.tarn.deep // a lake as dark as the tarn
    vi.resetModules()
    vi.doMock('./core.gen', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), PALETTES: { ...palettes, lake: { ...palettes.lake, deep } } }))
    try {
      const dusk = await import('./dusk')
      expect(dusk.FLOOR_DEEP_REF).not.toBe(0.17)
      expect(dusk.FLOOR_DEEP_REF).toBeGreaterThanOrEqual(lumOf(deep))
      expect(dusk.FLOOR_DEEP_REF).toBeLessThan(lumOf(deep) + 0.01)
      expect(dusk.floorShare(deep)).toBe(1)
      expect(dusk.floorShare(palettes.river.deep)).toBeCloseTo(dusk.FLOOR_DEEP_REF / lumOf(palettes.river.deep), 6)
    } finally {
      vi.doUnmock('./core.gen')
      vi.resetModules()
    }
  })
})

describe('patchWaterFloor', () => {
  it('lays the floor on the lit water, scaled by the body’s share, before the sky’s reflection, taking nothing of the water away', () => {
    const before = waterFragment()
    const r = patchWaterFloor(before)
    expect([r.applied, r.misses]).toEqual([true, []])
    const fs = r.fragmentShader
    for (const u of ['uniform float uWaterFloor;', 'uniform float uFloorShare;']) {
      expect(count(fs, u), u).toBe(1)
      expect(fs.indexOf(u), u).toBeLessThan(fs.indexOf('void main'))
    }
    const [envmap, floor, light, opaque] = ['#include <envmap_fragment>', 'float wFloor = uWaterFloor', WATER_LIGHT, '#include <opaque_fragment>'].map((p) => fs.indexOf(p))
    expect(envmap).toBeGreaterThan(0)
    expect([floor > envmap, light > floor, opaque > light]).toEqual([true, true, true])
    expect(fs.replace(/\nuniform float uWaterFloor;\nuniform float uFloorShare;/, '').replace(/(#include <envmap_fragment>)\n\{[\s\S]*?\n\}/, '$1')).toBe(before)
    // a scale of the albedo's luminance, lit or not
    expect(WATER_FLOOR).toContain('float wFloor = uWaterFloor * wShare * dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );')
    expect(WATER_FLOOR).toContain(': diffuseColor.rgb * uWaterFloor * wShare;')
  })

  it('gives MAIN’s stream its river’s share as it starts to flow, along water-core’s flow ramp', () => {
    const ramp = 'smoothstep( uJoin.x, uJoin.x + uJoin.y, vWaterUv.x )'
    expect(WATER_COLOR).toContain(`float jW = ${ramp}`)
    const join = /#ifdef WATER_JOIN\n\s*wShare = mix\( wShare, min\( 1\.0, ([0-9.]+) \/ dot\( uDeep2, vec3\( 0\.2126, 0\.7152, 0\.0722 \) \) \), (.+) \);\n\s*#endif/.exec(WATER_FLOOR)
    expect(join, 'the join’s share in the floor').not.toBeNull()
    expect(join![2]).toBe(ramp)
    expect(Math.min(1, Number(join![1]) / lumOf(palettes.river.deep))).toBeCloseTo(floorShare(palettes.river.deep), 6)
  })

  // Were core.gen.ts regenerated to rename or drop one of these declarations, the pond's shader would fail on the GPU unseen.
  it('reads in the join’s share only what the join-patched water declares', () => {
    const joinBlock = /#ifdef WATER_JOIN\n([\s\S]*?)#endif/.exec(WATER_FLOOR)![1]
    const read = [...new Set(joinBlock.match(/\b[uv][A-Z]\w*/g))].filter((name) => name !== 'uFloorShare').sort()
    expect(read).toEqual(['uDeep2', 'uJoin', 'vWaterUv'])
    const fs = patchWaterFloor(waterFragment()).fragmentShader
    expect(fs).toContain('#define WATER_JOIN')
    expect(declaredGlobals(fs)).toEqual(expect.arrayContaining([...read, 'uFloorShare']))
    expect(declaredGlobals(patchWaterFloor(waterFragment({ join: false, flow: false, ripple: false })).fragmentShader)).not.toContain('uJoin')
  })

  it('leaves alone a shader the water patch didn’t change, refuses a second patch, and refuses a missing or doubled anchor', () => {
    expect(patchWaterFloor(lambert.fragmentShader)).toEqual({ fragmentShader: lambert.fragmentShader, applied: false, misses: [] })
    const once = patchWaterFloor(waterFragment()).fragmentShader
    expect(patchWaterFloor(once)).toEqual({ fragmentShader: once, applied: false, misses: ['already patched'] })
    const fs = waterFragment()
    const cases: [string, string][] = [
      [fs.replace('#include <envmap_fragment>', ''), 'envmap x0'],
      [fs.replace('#include <envmap_fragment>', '#include <envmap_fragment>\n#include <envmap_fragment>'), 'envmap x2'],
      [fs.replace('#include <common>', '#include <common>\n#include <common>'), 'fragCommon x2'],
    ]
    for (const [stub, miss] of cases) expect(patchWaterFloor(stub), miss).toEqual({ fragmentShader: stub, applied: false, misses: [miss] })
  })
})
