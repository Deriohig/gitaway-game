import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import presetsRaw from '../../../art/config/lookPresets.json?raw'
import waterRaw from '../../../public/models/water.json?raw'
import { skyAt } from '../skyPalette'
import { PHASE_PERIODS, RIPPLE, WATER_UNIFORMS } from './core.gen'
import {
  createSharedWaterUniforms,
  driveWater,
  flowDockFor,
  registerWaterBodies,
  resetSessionWater,
  sessionWaterUniforms,
  setFlowDock,
  SPEEDS,
  stepWater,
  WATER_LOOK,
  type FlowDock,
} from './driver'
import { duskUniforms } from './dusk'
import { fillPlan } from './fill'
import { waterReadout } from './readout'
import type { WaterPieceId } from './report'
import type { BuiltBody, FillPart, SharedWaterUniforms, WaterJson, WaterSurfaceKind } from './types'
import { bodyUniforms, createWaterMaterial } from './waterMaterial'

// The water's driver: the shared uniforms every body reads, their phases stepped from a held clock, and the sky's colours.

const json = JSON.parse(waterRaw) as WaterJson
const day = skyAt(13)
const night = skyAt(0)

/** Every phase uniform, flattened to [name, value, period]; the ring epochs are whole numbers instead (see `epochs`). */
function phases(u: SharedWaterUniforms): [string, number, number][] {
  const P = PHASE_PERIODS
  return [
    ['uScrollA.x', u.uScrollA.value.x, P.scrollA], ['uScrollA.y', u.uScrollA.value.y, P.scrollA],
    ['uScrollB.x', u.uScrollB.value.x, P.scrollB], ['uScrollB.y', u.uScrollB.value.y, P.scrollB],
    ['uCausticOff.x', u.uCausticOff.value.x, P.causticOff], ['uCausticOff.y', u.uCausticOff.value.y, P.causticOff],
    ['uGlintOff.x', u.uGlintOff.value.x, P.glintOff], ['uGlintOff.y', u.uGlintOff.value.y, P.glintOff],
    ['uFoamPhase', u.uFoamPhase.value, P.foam], ['uFlowPhase', u.uFlowPhase.value, P.flow],
    ['uRibbonPhase', u.uRibbonPhase.value, P.ribbon], ['uRibbonPhaseB', u.uRibbonPhaseB.value, P.ribbonB],
    ['uFallPhase1', u.uFallPhase1.value, P.fall], ['uFallPhase2', u.uFallPhase2.value, P.fall],
    ['uRipplePhase.x', u.uRipplePhase.value.x, P.ringA], ['uRipplePhase.y', u.uRipplePhase.value.y, P.ringB],
    ['uRippleFlow', u.uRippleFlow.value, P.chevron], ['uRippleClock', u.uRippleClock.value, P.rippleClock],
  ]
}
const epochs = (u: SharedWaterUniforms) => [u.uRipplePhase.value.z, u.uRipplePhase.value.w]
const values = (u: SharedWaterUniforms) => [...phases(u).map(([, v]) => v), ...epochs(u)]

/** How far `to` is ahead of `from` round a cycle of this period, in (-period/2, period/2]. */
function around(from: number, to: number, period: number): number {
  const d = (((to - from) % period) + period) % period
  return d > period / 2 ? d - period : d
}

afterEach(() => resetSessionWater())

describe('the shared water uniforms', () => {
  it('hold every uniform the art proof shares, and only water-core’s', () => {
    const keys = Object.keys(createSharedWaterUniforms(json)).sort()
    expect(keys).toEqual([
      'uBandSoft', 'uBands', 'uCaustics', 'uCausticOff', 'uFallPhase1', 'uFallPhase2', 'uFlowPhase', 'uFoamLine', 'uFoamPhase',
      'uGlint', 'uGlintOff', 'uRibbonPhase', 'uRibbonPhaseB', 'uRipple', 'uRippleClock', 'uRippleFlow', 'uRipplePhase', 'uScrollA',
      'uScrollB', 'uShoreBand', 'uSkyHorizon', 'uSkyMix', 'uSkyZenith',
    ].sort())
    for (const k of keys) expect(WATER_UNIFORMS as readonly string[], k).toContain(k)
  })

  it('take the depth bands from water.json and the rest of the look from the presets’ defaults', () => {
    const u = createSharedWaterUniforms(json)
    expect(u.uBands.value).toEqual(new THREE.Vector2(...json.layers.bands))
    expect(u.uBands.value).toEqual(new THREE.Vector2(0.08, 0.22))
    expect(u.uBandSoft.value).toBe(json.layers.bandSoft)
    expect(WATER_LOOK).toEqual({ shoreBand: 0.35, foamLine: 0.5, skyMix: 0.25, glint: 0.6, caustics: 0.35 })
    expect([u.uShoreBand.value, u.uFoamLine.value, u.uSkyMix.value, u.uGlint.value, u.uCaustics.value]).toEqual([0.35, 0.5, 0.25, 0.6, 0.35])
  })

  // The look values, speeds and depth bands the game holds are the presets' in every preset: fails if the art retunes one.
  it('matches the look presets', () => {
    type PresetWater = Record<string, unknown> & { bands: { shallow: number; deep: number }; bandSoft: number }
    const { presets } = JSON.parse(presetsRaw) as { presets: Record<string, { water?: PresetWater }> }
    const entries = Object.entries(presets)
    expect(entries.length).toBeGreaterThan(0)
    for (const [name, { water }] of entries) {
      expect(water, name).toBeDefined()
      const pick = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, water![k]]))
      expect(pick(['shoreBand', 'foamLine', 'skyMix', 'glint', 'caustics']), `${name}: the look`).toEqual(WATER_LOOK)
      expect(pick(['normalSpeed', 'riverFlowSpeed', 'fallStreakSpeed']), `${name}: the speeds`).toEqual(SPEEDS)
      expect([water!.bands.shallow, water!.bands.deep, water!.bandSoft], `${name}: the bands`).toEqual([...json.layers.bands, json.layers.bandSoft])
    }
  })

  it('start at phase 0, with the hook’s rings at zero strength, and are new objects each time', () => {
    const u = createSharedWaterUniforms(json)
    expect(values(u).every((v) => v === 0)).toBe(true)
    expect(u.uRipple.value).toHaveLength(RIPPLE.hooks)
    for (const ring of u.uRipple.value) expect(ring).toEqual(new THREE.Vector4(0, 0, 0, 0))
    const b = createSharedWaterUniforms(json)
    for (const k of Object.keys(u) as (keyof SharedWaterUniforms)[]) expect(u[k], k).not.toBe(b[k])
    expect(u.uRipple.value[0]).not.toBe(b.uRipple.value[0])
    expect(u.uSkyZenith.value).not.toBe(b.uSkyZenith.value)
  })
})

describe('stepWater', () => {
  it('advances the held clock by dt and writes the phases for it', () => {
    const u = createSharedWaterUniforms(json)
    const held = { t: 10 }
    stepWater(u, held, 2, false, day)
    expect(held.t).toBe(12)
    expect(u.uFoamPhase.value).toBeCloseTo((12 / 3.5) % 1, 12)
    expect(u.uRibbonPhase.value).toBeCloseTo(12 * 0.45, 12)
    expect(u.uFallPhase1.value).toBeCloseTo(12 * 1.2, 12)
    expect(u.uRippleClock.value).toBe(12)
    const before = values(u)
    stepWater(u, held, 0.5, false, day)
    expect(held.t).toBe(12.5)
    expect(values(u)).not.toEqual(before)
  })

  it('holds the phases in still motion, and picks up where it was when motion returns', () => {
    const u = createSharedWaterUniforms(json)
    const held = { t: 37.25 }
    stepWater(u, held, 0, false, day)
    const before = values(u)
    expect(before.some((v) => v !== 0)).toBe(true)
    stepWater(u, held, 5, true, day)
    expect(held.t).toBe(37.25)
    expect(values(u)).toEqual(before)
    stepWater(u, held, 1 / 30, false, day)
    expect(held.t).toBeCloseTo(37.25 + 1 / 30, 12)
    expect(values(u)).not.toEqual(before)
  })

  it('keeps the phases bounded and smooth at t = 1e7', () => {
    const dt = 1 / 30
    const sample = (t: number) => {
      const u = createSharedWaterUniforms(json)
      const held = { t }
      stepWater(u, held, 0, false, day)
      const at = phases(u)
      const epochsAt = epochs(u)
      stepWater(u, held, dt, false, day)
      return { at, epochsAt, after: phases(u) }
    }
    const far = sample(1e7)
    const near = sample(0)
    far.at.forEach(([name, v, period], i) => {
      const next = far.after[i][1]
      expect(Number.isFinite(v), name).toBe(true)
      for (const x of [v, next]) {
        expect(x, name).toBeGreaterThanOrEqual(0)
        expect(x, name).toBeLessThan(period)
      }
      const stepFar = around(v, next, period)
      expect(Math.abs(stepFar - around(near.at[i][1], near.after[i][1], period)), name).toBeLessThan(1e-6)
      expect(Math.abs(stepFar), name).toBeLessThan(period / 2)
    })
    for (const e of far.epochsAt) {
      expect(Number.isInteger(e)).toBe(true)
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThan(RIPPLE.epochs)
    }
  })

  it('follows the sky by value, in still motion too with the phases held, and leaves the rest of the look alone', () => {
    const u = createSharedWaterUniforms(json)
    const look = () => [u.uBands.value.toArray(), u.uBandSoft.value, u.uShoreBand.value, u.uFoamLine.value, u.uGlint.value, u.uCaustics.value]
    const lookBefore = look()
    const held = { t: 0 }
    stepWater(u, held, 1 / 30, false, night)
    expect(u.uSkyZenith.value.equals(night.top)).toBe(true)
    expect(u.uSkyHorizon.value.equals(night.mid)).toBe(true)
    expect(u.uSkyZenith.value).not.toBe(night.top)
    expect(u.uSkyHorizon.value).not.toBe(night.mid)
    expect(look()).toEqual(lookBefore)
    stepWater(u, held, 1 / 30, false, day)
    expect(u.uSkyZenith.value.equals(day.top)).toBe(true)
    expect(u.uSkyHorizon.value.equals(day.mid)).toBe(true)
    const phasesBefore = values(u)
    stepWater(u, held, 1, true, night)
    expect(u.uSkyZenith.value.equals(night.top)).toBe(true)
    expect(values(u)).toEqual(phasesBefore)
  })
})

// One set of shared uniforms for the session: every piece's water reads it and the driver steps it whichever pieces are drawn.
describe('the session’s water and driveWater', () => {
  it('makes the shared uniforms once for the session', () => {
    const u = sessionWaterUniforms(json)
    expect(Object.keys(u).sort()).toEqual(Object.keys(createSharedWaterUniforms(json)).sort())
    expect(sessionWaterUniforms(json)).toBe(u)
    resetSessionWater()
    expect(sessionWaterUniforms(json)).not.toBe(u)
  })

  // The held clock is the fill's too: it runs before any piece's water is made.
  it('runs the held clock before the session’s water is made, but steps no uniforms of another set', () => {
    const held = { t: 4 }
    const other = createSharedWaterUniforms(json)
    driveWater(held, 1 / 30, false, day)
    expect(held.t).toBeCloseTo(4 + 1 / 30, 12)
    expect(values(other).every((v) => v === 0)).toBe(true)
    driveWater(held, 1 / 30, true, day)
    expect(held.t).toBeCloseTo(4 + 1 / 30, 12)
  })

  it('steps the session’s uniforms from the frame’s delta, and holds them in still motion', () => {
    const u = sessionWaterUniforms(json)
    const scroll = u.uScrollA.value.clone()
    const held = { t: 0 }
    driveWater(held, 1 / 30, false, night)
    expect(u.uScrollA.value.equals(scroll)).toBe(false)
    expect(held.t).toBeCloseTo(1 / 30, 12)
    expect(u.uSkyZenith.value.equals(night.top)).toBe(true)
    const before = values(u)
    driveWater(held, 5 / 30, true, night)
    expect(held.t).toBeCloseTo(1 / 30, 12)
    expect(values(u)).toEqual(before)
  })

  it('holds the water through a frame with no good delta, and carries on after it', () => {
    const u = sessionWaterUniforms(json)
    const held = { t: 7 }
    driveWater(held, 0, false, day)
    const before = values(u)
    for (const delta of [NaN, Infinity, -Infinity, -0.5]) {
      driveWater(held, delta, false, day)
      expect(held.t, `a delta of ${delta}`).toBe(7)
      expect(values(u), `a delta of ${delta}`).toEqual(before)
    }
    driveWater(held, 1 / 30, false, day)
    expect(held.t).toBeCloseTo(7 + 1 / 30, 12)
  })

  it('does not jump the water over a long gap (a hidden tab, or a long still spell)', () => {
    sessionWaterUniforms(json)
    const held = { t: 100 }
    driveWater(held, 600, false, day)
    expect(held.t).toBeGreaterThan(100)
    expect(held.t).toBeLessThan(101)
  })
})

// ---- the flowing water ----
// It starts when the wetland docks: the farm fall retreats over a second, the wetland's river fills from the seam over
// 2.5 s, then the outflow over 1 s, then the wetland fall over 1 s. All instant in still motion and for a wetland that
// was already there, and it never plays twice.

/** A body as built, as far as the driver reads it: a real mesh with a Lambert material, its fill, and its parts. */
function fakeBody(name: string, kind: WaterSurfaceKind, parts: FillPart[]): BuiltBody {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ transparent: true }))
  mesh.name = name
  return { name, kind, mesh, uniforms: { uFill: { value: 1 }, uFloorShare: { value: 1 } }, parts }
}

const lengthOf = (piece: WaterPieceId, node: string) => json.pieces[piece].bodies.find((b) => b.node === node)!.length ?? 0
const own = (piece: WaterPieceId, node: string): FillPart[] => [{ node, length: lengthOf(piece, node) }]

/** MAIN's water as drawn: the pond and the farm fall. */
function mainWater() {
  const pond = fakeBody('water_pond', 'still', own('main', 'water_pond'))
  const fall = fakeBody('water_fall', 'fall', own('main', 'water_fall'))
  return { pond, fall, bodies: [pond, fall] }
}

/** The wetland's water as drawn: the lake, the river and outflow as one ribbon (load.ts), and the fall. */
function wetlandWater() {
  const lake = fakeBody('water_lake', 'still', own('wetland', 'water_lake'))
  const river = fakeBody('water_river', 'ribbon', [...own('wetland', 'water_river'), ...own('wetland', 'water_outflow')])
  const fall = fakeBody('water_fall', 'fall', own('wetland', 'water_fall'))
  return { lake, river, fall, bodies: [lake, river, fall] }
}

const register = (piece: WaterPieceId, bodies: BuiltBody[]) => registerWaterBodies(piece, bodies, fillPlan(json.pieces[piece].bodies))

/** `n` frames of a quarter of a second each (the longest step one frame may take). */
function frames(held: { t: number }, n: number) {
  for (let i = 0; i < n; i++) driveWater(held, 0.25, false, day)
}

const fill = (body: BuiltBody) => body.uniforms.uFill.value
const shown = () => waterReadout().shown
const retreat = ({ mesh }: BuiltBody) => ({ visible: mesh.visible, opacity: mesh.material.opacity, y: mesh.position.y })
const inPlace = { visible: true, opacity: 1, y: 0 }
const halfway = { visible: true, opacity: 0.5, y: -1 }
/** The wetland river and fall, each as [fill, visible]. */
const wetlandState = (w: ReturnType<typeof wetlandWater>) => [fill(w.river), w.river.mesh.visible, fill(w.fall), w.fall.mesh.visible]

describe('the flowing water', () => {
  it('fills the river from the seam, then the outflow, then the fall', () => {
    const { lake, river, fall, bodies } = wetlandWater()
    register('wetland', bodies)
    setFlowDock('now')
    const held = { t: 3 }
    frames(held, 5)
    expect(fill(river)).toBeCloseTo(0.329, 3)
    expect(river.mesh.visible).toBe(true)
    expect(fall.mesh.visible).toBe(false)
    frames(held, 11)
    expect(fill(river)).toBe(1)
    expect(fill(fall)).toBeCloseTo(0.5, 9)
    expect(fall.mesh.visible).toBe(true)
    frames(held, 2)
    expect(fill(fall)).toBe(1)
    expect([fill(lake), lake.mesh.visible]).toEqual([1, true])
  })

  it('retreats the farm fall over a second, then hides it', () => {
    const { pond, fall, bodies } = mainWater()
    register('main', bodies)
    expect(retreat(fall)).toEqual(inPlace)
    setFlowDock('now')
    const held = { t: 12 }
    frames(held, 2)
    expect(retreat(fall)).toEqual(halfway)
    expect(fill(fall)).toBe(1)
    frames(held, 2)
    expect(fall.mesh.visible).toBe(false)
    expect([fill(pond), ...Object.values(retreat(pond))]).toEqual([1, true, 1, 0])
  })

  it('puts it all in place at once in still motion, or when motion goes still part way, and never replays it', () => {
    for (const framesFirst of [0, 3]) {
      resetSessionWater()
      const main = mainWater()
      const wetland = wetlandWater()
      register('main', main.bodies)
      register('wetland', wetland.bodies)
      setFlowDock('now')
      const held = { t: 0 }
      frames(held, framesFirst)
      if (framesFirst) {
        expect(fill(wetland.river)).toBeLessThan(1)
        expect(retreat(main.fall).opacity).toBeCloseTo(0.25, 9)
      }
      driveWater(held, 1 / 30, true, day)
      expect(wetlandState(wetland)).toEqual([1, true, 1, true])
      expect(main.fall.mesh.visible).toBe(false)
      setFlowDock('now')
      frames(held, 4)
      expect(wetlandState(wetland)).toEqual([1, true, 1, true])
      expect(main.fall.mesh.visible).toBe(false)
    }
  })

  it('puts it all in place at once for a wetland already there, before any frame', () => {
    const main = mainWater()
    const wetland = wetlandWater()
    setFlowDock('before')
    register('main', main.bodies)
    register('wetland', wetland.bodies)
    expect(wetlandState(wetland)).toEqual([1, true, 1, true])
    expect(main.fall.mesh.visible).toBe(false)
    frames({ t: 0 }, 1)
    expect(wetlandState(wetland)).toEqual([1, true, 1, true])
    expect(main.fall.mesh.visible).toBe(false)
  })

  it('retreats a farm fall registered before a docked wetland’s water comes in', () => {
    const main = mainWater()
    register('main', main.bodies)
    expect(shown()).toEqual(['main:water_fall', 'main:water_pond'])
    setFlowDock('before')
    register('wetland', wetlandWater().bodies)
    expect(main.fall.mesh.visible).toBe(false)
    expect(shown()).toEqual(['main:water_pond', 'wetland:water_fall', 'wetland:water_lake', 'wetland:water_river'])
  })

  // A phone on a slow link: the wetland docks while its water (or even MAIN's) is still coming.
  it('draws a piece built after the dock full', () => {
    setFlowDock('now')
    const held = { t: 0 }
    frames(held, 40)
    const wetland = wetlandWater()
    register('wetland', wetland.bodies)
    driveWater(held, 0.25, false, day)
    expect(wetlandState(wetland)).toEqual([1, true, 1, true])
  })

  it('starts a body as the fill has it when it is registered, so a rebuild part way doesn’t flash full water', () => {
    const before = wetlandWater()
    register('wetland', before.bodies)
    expect(wetlandState(before)).toEqual([0, false, 0, false])
    expect([fill(before.lake), before.lake.mesh.visible]).toEqual([1, true])
    const main = mainWater()
    register('main', main.bodies)
    expect(retreat(main.fall)).toEqual(inPlace)
    setFlowDock('now')
    frames({ t: 0 }, 2)
    const rebuilt = wetlandWater()
    register('wetland', rebuilt.bodies)
    expect(fill(rebuilt.river)).toBeCloseTo(fill(before.river), 12)
    expect(fill(rebuilt.river)).toBeGreaterThan(0)
    expect([rebuilt.river.mesh.visible, rebuilt.fall.mesh.visible]).toEqual([true, false])
    const rebuiltMain = mainWater()
    register('main', rebuiltMain.bodies)
    expect(retreat(rebuiltMain.fall)).toEqual(halfway)
  })

  it('times the fill from the first dock: a second ‘now’ doesn’t start it again', () => {
    const { river, bodies } = wetlandWater()
    register('wetland', bodies)
    setFlowDock('now')
    const held = { t: 0 }
    frames(held, 5)
    const at = fill(river)
    setFlowDock('now')
    frames(held, 1)
    expect(fill(river)).toBeGreaterThan(at)
    const riverShare = lengthOf('wetland', 'water_river') / (lengthOf('wetland', 'water_river') + lengthOf('wetland', 'water_outflow'))
    expect(fill(river)).toBeCloseTo((1.5 / 2.5) * riverShare, 9)
  })

  it('brings the farm fall back when the wetland goes, and retreats it again if the wetland returns', () => {
    const { fall, bodies } = mainWater()
    register('main', bodies)
    setFlowDock('now')
    const held = { t: 0 }
    frames(held, 8)
    expect(fall.mesh.visible).toBe(false)
    setFlowDock('none')
    frames(held, 1)
    expect(retreat(fall)).toEqual(inPlace)
    setFlowDock('now')
    frames(held, 2)
    expect(retreat(fall)).toEqual(halfway)
  })

  it('lists the bodies showing in the readout, and a body taken out is the driver’s no more', () => {
    const main = mainWater()
    const undoMain = register('main', main.bodies)
    expect(shown()).toEqual(['main:water_fall', 'main:water_pond'])
    const undoWetland = register('wetland', wetlandWater().bodies)
    expect(shown()).toEqual(['main:water_fall', 'main:water_pond', 'wetland:water_lake'])
    setFlowDock('now')
    const held = { t: 0 }
    frames(held, 1)
    expect(shown()).toEqual(['main:water_fall', 'main:water_pond', 'wetland:water_lake', 'wetland:water_river'])
    frames(held, 15)
    expect(shown()).toEqual(['main:water_pond', 'wetland:water_fall', 'wetland:water_lake', 'wetland:water_river'])
    undoMain()
    expect(shown()).toEqual(['wetland:water_fall', 'wetland:water_lake', 'wetland:water_river'])
    undoWetland()
    expect(shown()).toEqual([])
    setFlowDock('none')
    frames(held, 1)
    expect(main.fall.mesh.visible).toBe(false)
  })
})

// ---- the dusk floor ----
// Lit water goes dark and flat at dusk and at night, so the driver lifts it to a floor keyed to the day's light, eases
// the sky's share of its reflection and the falls' glow, and leaves midday as it was. None of it builds a program.

/** A body as built, with its real water material on the session's uniforms and stand-in maps. */
function realBody(piece: WaterPieceId, node: string): BuiltBody {
  const body = json.pieces[piece].bodies.find((b) => b.node === node)!
  const map = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat)
  const noise = new THREE.DataTexture(new Uint8Array(2), 1, 1, THREE.RGFormat)
  const material = createWaterMaterial(piece, body, sessionWaterUniforms(json), { map, noise, origin: [0, 0], extent: [1, 1] }, 'mid')
  return { name: node, kind: body.kind as WaterSurfaceKind, mesh: new THREE.Mesh(new THREE.BufferGeometry(), material), uniforms: bodyUniforms(material)!, parts: own(piece, node) }
}

describe('the dusk floor', () => {
  it('keeps midday as it was, and lifts the floor and eases the sky at night', () => {
    const u = sessionWaterUniforms(json)
    const main = mainWater()
    const wetland = wetlandWater()
    register('main', main.bodies)
    register('wetland', wetland.bodies)
    const held = { t: 0 }
    const look = () => [duskUniforms.uWaterFloor.value, u.uSkyMix.value, main.fall.mesh.material.emissiveIntensity, wetland.fall.mesh.material.emissiveIntensity]
    driveWater(held, 1 / 30, false, day)
    expect(look()).toEqual([0, 0.25, 1, 1])
    driveWater(held, 1 / 30, false, skyAt(22.6))
    const [floor, skyMix, mainGlow, wetlandGlow] = look()
    expect(floor).toBeCloseTo(0.24, 12)
    expect(skyMix).toBeCloseTo(0.15, 12)
    expect(mainGlow).toBeCloseTo(0.4, 12)
    expect(wetlandGlow).toBeCloseTo(0.4, 12)
    for (const body of [main.pond, wetland.lake, wetland.river]) expect(body.mesh.material.emissiveIntensity, body.name).toBe(1)
    driveWater(held, 1 / 30, false, day)
    expect(look()).toEqual([0, 0.25, 1, 1])
  })

  it('lifts the floor and eases the sky from stepWater, in still motion too', () => {
    const u = createSharedWaterUniforms(json)
    stepWater(u, { t: 3 }, 0, true, skyAt(22.6))
    expect(duskUniforms.uWaterFloor.value).toBeCloseTo(0.24, 12)
    expect(u.uSkyMix.value).toBeCloseTo(0.15, 12)
    stepWater(u, { t: 3 }, 0, true, skyAt(20.1))
    expect(duskUniforms.uWaterFloor.value).toBeGreaterThan(0.24)
    expect(duskUniforms.uWaterFloor.value).toBeLessThan(0.38)
    expect(u.uSkyMix.value).toBeGreaterThan(0.15)
    expect(u.uSkyMix.value).toBeLessThan(0.25)
    stepWater(u, { t: 3 }, 0, true, day)
    expect([duskUniforms.uWaterFloor.value, u.uSkyMix.value]).toEqual([0, 0.25])
  })

  // A program built at dusk would stall a phone's frame: floor, sky share and glow are uniforms, never a define or recompile.
  it('changes no program across the day', () => {
    const bodies = [realBody('main', 'water_pond'), realBody('main', 'water_fall'), realBody('wetland', 'water_river')]
    register('main', bodies.slice(0, 2))
    register('wetland', bodies.slice(2))
    const held = { t: 0 }
    driveWater(held, 1 / 30, false, day)
    const programs = () =>
      bodies.map(({ mesh: { material }, uniforms }) => [material.version, material.customProgramCacheKey(), JSON.stringify(material.defines ?? null), uniforms.uFloorShare.value])
    const before = programs()
    expect(before.every(([, key]) => String(key).endsWith('|water-floor'))).toBe(true)
    expect(before[2][3]).toBeLessThan(before[0][3] as number)
    for (let h = 130; h <= 226; h++) driveWater(held, 1 / 30, false, skyAt(h / 10))
    expect(duskUniforms.uWaterFloor.value).toBeCloseTo(0.24, 12)
    expect(programs()).toEqual(before)
  })
})

describe('flowDockFor', () => {
  it.each<[boolean, boolean, boolean, FlowDock]>([
    [false, false, false, 'none'],
    [false, true, false, 'none'],
    [false, false, true, 'none'],
    [false, true, true, 'none'],
    [true, true, false, 'now'],
    [true, false, false, 'before'],
    [true, true, true, 'before'],
    [true, false, true, 'before'],
  ])('docked %s, rising in %s, still %s: %s', (docked, risesIn, still, dock) => {
    expect(flowDockFor(docked, risesIn, still)).toBe(dock)
  })
})
