/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import ART from '../../../art/scripts/lib/water-core.mjs'
import waterRaw from '../../../public/models/water.json?raw'
import { bodyColours, decode, patchOptsFor, patchWaterLambert, waterPhases, type PatchOpts } from './core'
import * as gen from './core.gen'
import type { WaterBody, WaterBodyKind, WaterJson } from './types'

// The game's copy of the art session's shader library (art/scripts/lib/water-core.mjs): constants and GLSL are
// generated into core.gen.ts, functions are ported by hand to core.ts. These hold both to the original.

const water = JSON.parse(waterRaw) as WaterJson
const SCRIPT = fileURLToPath(new URL('../../../scripts/water-core.mjs', import.meta.url))
const SPEEDS = { normalSpeed: 0.3, riverFlowSpeed: 1, fallStreakSpeed: 1.2 }
const lambert = THREE.ShaderLib.lambert

const KINDS = ['still', 'ribbon', 'fall'] as const
const TIERS = ['phone', 'mid'] as const
const FLAGS = ['flow', 'join', 'brink', 'vhead', 'ripple'] as const
/** Every combination of the five flags: a superset of what water.json's bodies use. */
const FLAG_SETS = Array.from({ length: 1 << FLAGS.length }, (_, m) => Object.fromEntries(FLAGS.map((f, i) => [f, Boolean(m & (1 << i))])))

const allBodies = () => Object.entries(water.pieces).flatMap(([piece, p]) => p.bodies.map((body: WaterBody) => ({ piece, body })))
const surfaces = () => allBodies().filter(({ body }) => ['still', 'ribbon', 'fall'].includes(body.kind))
function bodyOf(piece: keyof WaterJson['pieces'], node: string): WaterBody {
  const body = water.pieces[piece].bodies.find((b: WaterBody) => b.node === node)
  if (!body) throw new Error(`no water body ${piece}/${node}`)
  return body
}

const definesOf = (fragmentShader: string) => [...fragmentShader.matchAll(/^#define (WATER_[A-Z]+(?: \d+)?)$/gm)].map((m) => m[1])
const patch = (opts: PatchOpts) => patchWaterLambert(lambert.vertexShader, lambert.fragmentShader, opts)
const artPatch = (opts: PatchOpts) => ART.patchWaterLambert(lambert.vertexShader, lambert.fragmentShader, opts)
const optsOf = (piece: keyof WaterJson['pieces'], node: string, tier: PatchOpts['tier'] = 'mid') => patchOptsFor(bodyOf(piece, node), tier)

describe('the generated copy of water-core', () => {
  it('holds exactly the exports the game reads, byte for byte (run `npm run water-core` if not)', () => {
    expect(Object.keys(gen).sort()).toEqual(
      [
        'WATER_FORMAT', 'TEXEL', 'NOISE_SIZE', 'BANDS', 'BAND_SOFT', 'NOISE_CELL', 'PHI', 'FLOW_CYCLE', 'PHASE_PERIODS', 'PHASE_USES',
        'TIERS', 'PALETTES', 'BODY_PALETTE', 'RIPPLE', 'RIPPLE_BODIES', 'WATER_UNIFORMS',
        'WATER_VERT_PARS', 'WATER_VERT', 'WATER_FRAG_PARS', 'WATER_COLOR', 'WATER_LIGHT', 'WATER_ANCHORS',
      ].sort(),
    )
    for (const [name, value] of Object.entries(gen)) expect(value, name).toEqual(ART[name])
  })

  it('is regenerated from water-core', () => {
    expect(() => execFileSync(process.execPath, [SCRIPT, '--check'], { stdio: 'pipe' })).not.toThrow()
  })
})

describe('the ported water-core functions', () => {
  it('phases match the original', () => {
    const other = { normalSpeed: 0.7, riverFlowSpeed: 2.5, fallStreakSpeed: 0.4 }
    for (const t of [0, 1.5, 59.9, 3600, 1e7]) {
      expect(waterPhases(t, SPEEDS), `t = ${t}`).toEqual(ART.waterPhases(t, SPEEDS))
      expect(waterPhases(t, other), `t = ${t}, other speeds`).toEqual(ART.waterPhases(t, other))
      expect(waterPhases(t), `t = ${t}, default speeds`).toEqual(ART.waterPhases(t))
    }
  })

  it('patches like the original, for every kind, tier and flag set and for debug views', () => {
    const all: PatchOpts[] = [
      ...KINDS.flatMap((kind) => TIERS.flatMap((tier) => FLAG_SETS.map((flags) => ({ kind, tier, ...flags })))),
      ...[1, 2, 3, 4].map((debug) => ({ kind: 'still' as const, tier: 'mid' as const, flow: true, debug })),
    ]
    for (const opts of all) {
      const label = JSON.stringify(opts)
      const mine = patch(opts)
      expect(mine, label).toEqual(artPatch(opts))
      expect(mine.applied, label).toBe(true)
      expect(mine.misses, label).toEqual([])
    }
  })

  it('patches every body water.json draws, in both tiers, like the original', () => {
    expect(surfaces()).toHaveLength(8)
    for (const { piece, body } of surfaces())
      for (const tier of TIERS) {
        const opts = patchOptsFor(body, tier)
        const mine = patch(opts)
        expect(mine, `${piece}/${body.node} ${tier}`).toEqual(artPatch(opts))
        expect([mine.applied, mine.misses]).toEqual([true, []])
      }
  })

  it('adds the defines the options ask for', () => {
    const defines = (piece: keyof WaterJson['pieces'], node: string, tier: PatchOpts['tier']) => definesOf(patch(optsOf(piece, node, tier)).fragmentShader)
    expect(defines('main', 'water_pond', 'mid')).toEqual(['WATER_STILL', 'WATER_MID', 'WATER_FLOW', 'WATER_JOIN', 'WATER_RIPPLE'])
    expect(defines('main', 'water_pond', 'phone')).toEqual(['WATER_STILL', 'WATER_FLOW', 'WATER_JOIN', 'WATER_RIPPLE'])
    expect(defines('main', 'water_fall', 'mid')).toEqual(['WATER_FALL', 'WATER_MID', 'WATER_BRINK'])
    expect(defines('wetland', 'water_river', 'mid')).toEqual(['WATER_RIBBON', 'WATER_MID', 'WATER_VHEAD', 'WATER_RIPPLE'])
    expect(defines('wetland', 'water_outflow', 'phone')).toEqual(['WATER_RIBBON', 'WATER_RIPPLE'])
    expect(defines('wetland', 'water_lake', 'phone')).toEqual(['WATER_STILL', 'WATER_FLOW', 'WATER_RIPPLE'])
    expect(defines('highland', 'water_spring', 'mid')).toEqual(['WATER_STILL', 'WATER_MID', 'WATER_FLOW'])
    expect(definesOf(patch({ kind: 'fall', tier: 'mid', ripple: true }).fragmentShader)).toEqual(['WATER_FALL', 'WATER_MID'])
    expect(definesOf(patch({ kind: 'still', tier: 'phone', debug: 2 }).fragmentShader)).toEqual(['WATER_STILL', 'WATER_DEBUG 2'])
  })

  it('refuses a second patch', () => {
    const opts: PatchOpts = { kind: 'still', tier: 'mid', flow: true, join: true, ripple: true }
    const once = patch(opts)
    const twice = patchWaterLambert(once.vertexShader, once.fragmentShader, opts)
    expect(twice).toEqual(ART.patchWaterLambert(once.vertexShader, once.fragmentShader, opts))
    expect(twice).toMatchObject({ applied: false, misses: ['already patched'], vertexShader: once.vertexShader, fragmentShader: once.fragmentShader })
  })

  it('refuses a shader whose anchor is missing or appears twice, and leaves it alone', () => {
    const { vertexShader: vs, fragmentShader: fs } = lambert
    const twice = (src: string, anchor: string) => src.replace(anchor, `${anchor}\n${anchor}`)
    const cases: [string, string, string, string][] = [
      ['no opaque_fragment', vs, fs.replace('#include <opaque_fragment>', ''), 'opaque x0'],
      ['no worldpos_vertex', vs.replace('#include <worldpos_vertex>', ''), fs, 'vertWorld x0'],
      ['two fragment commons', vs, twice(fs, '#include <common>'), 'fragCommon x2'],
      ['two vertex commons', twice(vs, '#include <common>'), fs, 'vertCommon x2'],
      ['two color_fragments', vs, twice(fs, '#include <color_fragment>'), 'color x2'],
    ]
    for (const [label, vertexShader, fragmentShader, miss] of cases) {
      const opts: PatchOpts = { kind: 'still', tier: 'mid' }
      const mine = patchWaterLambert(vertexShader, fragmentShader, opts)
      expect(mine, label).toEqual(ART.patchWaterLambert(vertexShader, fragmentShader, opts))
      expect(mine, label).toMatchObject({ applied: false, misses: [miss], vertexShader, fragmentShader })
    }
  })

  it('decodes a map texel like the original', () => {
    const flows = [[128, 128], [0, 255], [255, 0], [100, 150]]
    for (const r of [0, 1, 127, 128, 255])
      for (const g of [1, 127, 128, 129, 255])
        for (const [b, a] of flows) {
          const art = { depth: ART.decode.depth(r), sd: ART.decode.sd(g), flow: [ART.decode.flow(b), ART.decode.flow(a)] }
          expect(decode(r, g, b, a), `${r} ${g} ${b} ${a}`).toEqual(art)
        }
    expect(decode(255, 128, 128, 128)).toEqual({ depth: 1, sd: 0, flow: [0, 0] })
  })

  it('gives a body its colours like the original', () => {
    const preset = { bodies: { pond: { deep: '#102030', mid: 12, foam: '#ffffff' }, tarn: {} } }
    const cases: [Record<string, unknown>, WaterJson | null, string][] = [
      [{}, water, 'pond'], [{}, water, 'fall'], [preset, water, 'pond'], [preset, water, 'tarn'], [preset, water, 'nowhere'],
      [{}, water, 'nowhere'], [preset, null, 'pond'], [{}, null, 'spring'], [{}, null, 'nowhere'],
      ...Object.keys(water.palettes).map((palette): [Record<string, unknown>, WaterJson | null, string] => [{}, water, palette]),
    ]
    for (const [p, json, palette] of cases) expect(bodyColours(p, json, palette), `${palette} ${!!json} ${JSON.stringify(p)}`).toEqual(ART.bodyColours(p, json, palette))
    expect(bodyColours(preset, water, 'pond')).toEqual({ ...water.palettes.pond, deep: '#102030', foam: '#ffffff' })
  })
})

describe('the options a water.json body is patched with', () => {
  const o = (kind: string, tier: string, flow: boolean, join: boolean, brink: boolean, vhead: boolean, ripple: boolean) => ({ kind, tier, flow, join, brink, vhead, ripple })
  it('follow the art proof: a body with ripples draws the ripple layer, only still water flows', () => {
    expect(optsOf('main', 'water_pond')).toEqual(o('still', 'mid', true, true, false, false, true))
    expect(optsOf('main', 'water_fall', 'phone')).toEqual(o('fall', 'phone', false, false, true, false, false))
    expect(optsOf('wetland', 'water_river')).toEqual(o('ribbon', 'mid', false, false, false, true, true))
    expect(optsOf('wetland', 'water_outflow')).toEqual(o('ribbon', 'mid', false, false, false, false, true))
    expect(optsOf('wetland', 'water_lake')).toEqual(o('still', 'mid', true, false, false, false, true))
    expect(optsOf('highland', 'water_tarn')).toEqual(o('still', 'mid', false, false, false, false, true))
    expect(optsOf('highland', 'water_spring')).toEqual(o('still', 'mid', true, false, false, false, false))
    const ripples = { density: 0.4, shore: 0, chevrons: false }
    expect(patchOptsFor({ node: 'x', kind: 'fall', flow: true, ripples }, 'mid')).toMatchObject({ flow: false, ripple: false })
    expect(patchOptsFor({ node: 'x', kind: 'ribbon', flow: true, ripples }, 'mid')).toMatchObject({ flow: false, ripple: true })
  })

  it('are refused for a node that is no surface', () => {
    const rest = allBodies().filter(({ body }) => !['still', 'ribbon', 'fall'].includes(body.kind))
    expect(rest.map(({ body }) => body.kind).sort()).toEqual(['mist', 'mist', 'skirt', 'skirt', 'steam'])
    for (const { body } of rest) expect(() => patchOptsFor(body, 'mid'), body.node).toThrow(/not a water surface/)
  })
})

// types.ts is a hand copy of water.json's shape; these records are checked by tsc to list exactly the type's keys.
const BODY_KEYS: Record<keyof WaterBody, true> = {
  node: true, kind: true, palette: true, level: true, virtual: true, flow: true, uStart: true, length: true,
  dissolveFrom: true, fillFrom: true, join: true, brink: true, vhead: true, ripples: true, note: true,
}
const BODY_KINDS: Record<WaterBodyKind, true> = { still: true, ribbon: true, fall: true, skirt: true, mist: true, steam: true }

describe('types.ts against water.json', () => {
  it('knows every field and kind of every body, and has a palette for each one it names', () => {
    expect(allBodies().length).toBeGreaterThan(0)
    for (const { piece, body } of allBodies()) {
      expect(Object.keys(body).filter((k) => !(k in BODY_KEYS)), `${piece}/${body.node} fields`).toEqual([])
      expect(body.kind in BODY_KINDS, `${piece}/${body.node} kind ${body.kind}`).toBe(true)
      for (const name of [body.palette, body.join?.to, body.brink?.to])
        if (name != null) expect(water.palettes[name], `${piece}/${body.node} palette ${name}`).toBeDefined()
    }
  })
})
