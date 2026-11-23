import * as THREE from 'three'
import type { SkyState } from '../skyPalette'
import { waterPhases, type WaterSpeeds } from './core'
import { RIPPLE } from './core.gen'
import { daylight, duskUniforms, fallGlowAt, skyMixShareAt, waterFloorAt } from './dusk'
import { bodyFill, RETREAT_DROP, type FillPlan, type FillStep } from './fill'
import { waterReadout } from './readout'
import type { WaterPieceId } from './report'
import type { BuiltBody, SharedWaterUniforms, WaterJson } from './types'

// The water's driver (spec §4.2): the uniforms every water material shares,
// and the per-frame step that moves them. Phases, not time: the clock is held
// here, wrapped on the CPU in float64 by water-core's waterPhases, so the
// water stays smooth however long the game has been open, and a still island
// holds it. The step never asks for a frame; the Ticker owns the frame rate.
// The same clock times the flowing water from the wetland's dock (spec §3.5):
// the bodies each piece registers are filled, retreated and shown from it.

// ---- the look ------------------------------------------------------------------

/**
 * The look values water.json does not carry: the look presets' water defaults
 * (art/config/lookPresets.json), which the art proof sets.
 * The depth bands and their softness come from water.json's `layers`.
 */
export const WATER_LOOK = { shoreBand: 0.35, foamLine: 0.5, skyMix: 0.25, glint: 0.6, caustics: 0.35 } as const

/**
 * What the phases run at: the look presets' water speeds (normalSpeed 0.3,
 * riverFlowSpeed 1, fallStreakSpeed 1.2), which are also the defaults
 * waterPhases falls back to. The art proof passes its preset's, the same.
 */
export const SPEEDS: Readonly<WaterSpeeds> = { normalSpeed: 0.3, riverFlowSpeed: 1, fallStreakSpeed: 1.2 }

// ---- the shared uniforms ---------------------------------------------------------

/**
 * The uniforms every water material shares (the art proof's `wU`, arch-scene.js):
 * the phases at 0, the sky colours (the driver fills them), the look, the
 * ripples' phases and four hook rings of strength 0. New objects each call:
 * the game draws on the session's one set (sessionWaterUniforms).
 */
export function createSharedWaterUniforms(json: WaterJson): SharedWaterUniforms {
  const v2 = () => ({ value: new THREE.Vector2() })
  const f = (value = 0) => ({ value })
  // (three's Vector4 starts at w = 1, which in a hook ring is its strength: ask for all zeros)
  const v4 = () => new THREE.Vector4(0, 0, 0, 0)
  return {
    uScrollA: v2(), uScrollB: v2(), uCausticOff: v2(), uGlintOff: v2(),
    uFoamPhase: f(), uFlowPhase: f(), uRibbonPhase: f(), uRibbonPhaseB: f(), uFallPhase1: f(), uFallPhase2: f(),
    uSkyHorizon: { value: new THREE.Color() }, uSkyZenith: { value: new THREE.Color() },
    uBands: { value: new THREE.Vector2(...json.layers.bands) },
    uBandSoft: f(json.layers.bandSoft),
    uShoreBand: f(WATER_LOOK.shoreBand), uFoamLine: f(WATER_LOOK.foamLine), uSkyMix: f(WATER_LOOK.skyMix),
    uGlint: f(WATER_LOOK.glint), uCaustics: f(WATER_LOOK.caustics),
    uRipplePhase: { value: v4() }, uRippleFlow: f(), uRippleClock: f(),
    uRipple: { value: Array.from({ length: RIPPLE.hooks }, v4) },
  }
}

// ---- the step --------------------------------------------------------------------

/**
 * Moves the shared uniforms to now. The held clock `held.t` (seconds) goes on by
 * `dt` unless `still`, in which case it stops and the phases hold; the phases
 * are written from it. The sky colours follow `sky` (its linear `top` for the
 * zenith, `mid` for the horizon) even when still, as the light does; and so
 * does the dusk (dusk.ts): the session's floor is the one for the day's light,
 * and the sky's share of the reflection eases from the look's at night.
 */
export function stepWater(shared: SharedWaterUniforms, held: { t: number }, dt: number, still: boolean, sky: SkyState): void {
  if (!still) held.t += dt
  const ph = waterPhases(held.t, SPEEDS)
  shared.uScrollA.value.set(ph.scrollA[0], ph.scrollA[1])
  shared.uScrollB.value.set(ph.scrollB[0], ph.scrollB[1])
  shared.uCausticOff.value.set(ph.causticOff[0], ph.causticOff[1])
  shared.uGlintOff.value.set(ph.glintOff[0], ph.glintOff[1])
  shared.uFoamPhase.value = ph.foam
  shared.uFlowPhase.value = ph.flow
  shared.uRibbonPhase.value = ph.ribbon
  shared.uRibbonPhaseB.value = ph.ribbonB
  shared.uFallPhase1.value = ph.fall1
  shared.uFallPhase2.value = ph.fall2
  const r = ph.ripple
  shared.uRipplePhase.value.set(r.ringA, r.ringB, r.epochA, r.epochB)
  shared.uRippleFlow.value = r.chevron
  shared.uRippleClock.value = r.clock
  shared.uSkyZenith.value.copy(sky.top)
  shared.uSkyHorizon.value.copy(sky.mid)
  const day = daylight(sky)
  duskUniforms.uWaterFloor.value = waterFloorAt(day)
  shared.uSkyMix.value = WATER_LOOK.skyMix * skyMixShareAt(day)
}

// ---- the session's one set ---------------------------------------------------------

// One set of shared uniforms for the session (I1): every piece's water reads it,
// so the phases, the sky and the look are the same for all of them, and the
// driver (WaterDriver, in the world) steps it whichever pieces are drawn. No
// piece holds it: a piece built after another, or one that goes, changes
// nothing of what the others read. One canvas, one set.
let session: SharedWaterUniforms | null = null

/** The session's shared uniforms, made from water.json on the first call (the session has one water.json) and the same object after. */
export function sessionWaterUniforms(json: WaterJson): SharedWaterUniforms {
  return (session ??= createSharedWaterUniforms(json))
}

/**
 * For tests: forgets the session's set, so the driver steps nothing until the
 * next sessionWaterUniforms makes one afresh; and the flow with it: the dock,
 * and the bodies registered (the readout's `shown` is emptied). The dusk
 * floor goes back to 0 (its uniform is the same object).
 */
export function resetSessionWater(): void {
  session = null
  duskUniforms.uWaterFloor.value = 0
  dockAt = null
  dockComing = false
  heldAt = 0
  registered.clear()
  writeShown()
}

// ---- the flowing water (spec §3.5) ----------------------------------------------------

/**
 * Where the wetland's dock stands for the flowing water: not docked (`none`);
 * docking now, as it rises in (`now`), so the farm fall retreats and the river
 * fills from this moment; or docked before, or in still motion (`before`), so
 * all of it is in place at once.
 */
export type FlowDock = 'none' | 'now' | 'before'

/**
 * When the wetland docked, on the held clock: null while it isn't docked, and
 * -Infinity for a dock long before (a wetland already there, or one that
 * docked in still motion), whose flow is all in place.
 */
let dockAt: number | null = null
/** `now` was said and the next drive records the dock: the held clock as it stands before that frame's step. */
let dockComing = false
/** The held clock at the last drive, for a body registered between frames. */
let heldAt = 0

/**
 * Says where the wetland's dock stands (the Wetland says it, flowDockFor).
 * `now` takes effect only from `none`, so a dock is timed once: the next drive
 * records the held clock as the dock's moment. `before` puts all of it in
 * place at once, even part way through. `none` takes it all back: the farm
 * fall in place, the river and the wetland fall not drawn.
 */
export function setFlowDock(dock: FlowDock): void {
  if (dock === 'none') {
    dockAt = null
    dockComing = false
  } else if (dock === 'before') {
    dockAt = -Infinity
    dockComing = false
  } else if (dockAt === null && !dockComing) {
    dockComing = true
  }
}

/**
 * Where the wetland's dock stands: `none` until it has docked; `now` if it
 * rose in just now; `before` for one that was already there, and in still
 * motion, where everything is simply in place.
 */
export function flowDockFor(docked: boolean, risesIn: boolean, still: boolean): FlowDock {
  if (!docked) return 'none'
  return risesIn && !still ? 'now' : 'before'
}

/** Seconds since the wetland docked, on the held clock as of the last drive: null if it hasn't, 0 if it is docking now. */
function sinceDock(): number | null {
  if (dockComing) return 0
  return dockAt === null ? null : heldAt - dockAt
}

/**
 * A body as the driver holds it: the body, which way it flows (null for one
 * without a fill, which the driver leaves be) and the material it fades,
 * which is the build's own (the Fader's copy, while its piece rises, reads
 * that one's opacity).
 */
interface DrivenBody {
  body: BuiltBody
  dir: FillStep['dir'] | null
  material: THREE.MeshLambertMaterial
}

/** A piece's bodies as registered, with the piece's fills. */
interface Registered {
  piece: WaterPieceId
  plan: FillPlan
  bodies: DrivenBody[]
}

const registered = new Set<Registered>()

/**
 * Which way a body flows: its parts' fills' way (the river and outflow, one
 * ribbon, have no fill of their own as a body: their parts carry
 * water.json's), or null if none of them has a fill.
 */
function flowOf(body: BuiltBody, plan: FillPlan): FillStep['dir'] | null {
  for (const { node } of body.parts) {
    const step = Object.hasOwn(plan, node) ? plan[node] : null
    if (step) return step.dir
  }
  return null
}

/**
 * Draws a piece's bodies as the flow has them `since` seconds after the dock
 * (null: not docked). A body that fills `in` has its `uFill` (its shader's
 * fill front, and its Fader copy's: the same object) and is drawn once it has
 * any; one that goes `out` (the farm fall) fades and slides down
 * RETREAT_DROP u as it does, and is hidden once gone. A body without a fill is
 * left be. Says whether a body was shown or hidden.
 */
function flow({ plan, bodies }: Registered, since: number | null): boolean {
  let changed = false
  for (const { body, dir, material } of bodies) {
    if (!dir) continue
    const f = bodyFill(body.parts, plan, since)
    if (dir === 'out') {
      material.opacity = f
      body.mesh.position.y = (f - 1) * RETREAT_DROP
    } else {
      body.uniforms.uFill.value = f
    }
    const visible = f > 0
    if (body.mesh.visible !== visible) {
      body.mesh.visible = visible
      changed = true
    }
  }
  return changed
}

/** Rewrites the readout's `shown`: the registered bodies drawn now, as `<piece>:<node>`, sorted. */
function writeShown(): void {
  const shown: string[] = []
  for (const { piece, bodies } of registered) for (const { body } of bodies) if (body.mesh.visible) shown.push(`${piece}:${body.name}`)
  const { shown: list } = waterReadout()
  list.splice(0, list.length, ...shown.sort())
}

/**
 * Hands a piece's bodies to the driver (build.ts showPieceWater) for as long
 * as they are drawn, with the piece's fills (fill.ts fillPlan). They are drawn
 * as the flow stands at once, before the next frame, so a piece built part
 * way through (a tier change rebuilds it) doesn't flash full water, and so are
 * the ones registered before (a wetland already docked has MAIN's fall gone
 * at once); then each frame moves them on. The readout's `shown` lists them
 * all. Returns the undo,
 * which takes them out: the driver leaves them be from then on.
 */
export function registerWaterBodies(piece: WaterPieceId, bodies: readonly BuiltBody[], plan: FillPlan): () => void {
  const entry: Registered = { piece, plan, bodies: bodies.map((body) => ({ body, dir: flowOf(body, plan), material: body.mesh.material })) }
  registered.add(entry)
  // The whole flow, not the new piece's alone: a dock said before it registered (a wetland already there) has the
  // farm fall, registered before, gone at once too, and `shown` lists what is drawn.
  const since = sinceDock()
  for (const each of registered) flow(each, since)
  writeShown()
  return () => {
    if (registered.delete(entry)) writeShown()
  }
}

/**
 * The longest gap one frame may move the held clock by, in seconds. A frame
 * after a hidden tab or a long still spell would otherwise carry the water
 * minutes on in one jump; this way it carries on from where it was.
 */
const LONGEST_STEP = 0.25

/**
 * One frame of the water: moves the held clock on by the frame's `delta`
 * (seconds; held in still motion), steps the session's shared uniforms to it
 * once a piece's water has made them (before that, today's water drives
 * itself), and draws the registered bodies as the flow has them. The clock
 * runs whether or not there is water yet, so a wetland that docks while the
 * water is still coming is timed from its dock and drawn full when it comes.
 * The driver calls it from useFrame; it never asks for a frame. A delta that
 * is no use (not a number, endless, or backwards) holds the water for that
 * frame.
 *
 * A dock said `now` is recorded here, on the held clock before this frame's
 * step. In still motion everything is in place at once: a dock (coming or
 * part way) is moved to `before`, so the flow never plays again when motion
 * comes back.
 *
 * Each registered fall glows as the dusk has it (dusk.ts fallGlowAt): its
 * material's emissiveIntensity, which builds no program.
 */
export function driveWater(held: { t: number }, delta: number, still: boolean, sky: SkyState): void {
  const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), LONGEST_STEP) : 0
  if (dockComing || (still && dockAt !== null)) {
    dockAt = still ? -Infinity : held.t
    dockComing = false
  }
  if (!still) held.t += dt
  heldAt = held.t
  if (session) stepWater(session, held, 0, still, sky)
  const since = sinceDock()
  const glow = fallGlowAt(daylight(sky))
  let changed = false
  for (const entry of registered) {
    changed = flow(entry, since) || changed
    for (const { body, material } of entry.bodies) if (body.kind === 'fall') material.emissiveIntensity = glow
  }
  if (changed) writeShown()
}
