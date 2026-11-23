// Hand ports of the functions of the art session's shader library
// (art/scripts/lib/water-core.mjs), next to its generated constants (core.gen.ts).
// They behave exactly like the originals: core.test.ts runs both and compares.

import { FLOW_CYCLE, PALETTES, PHASE_PERIODS, PHI, RIPPLE, WATER_ANCHORS, WATER_COLOR, WATER_FRAG_PARS, WATER_LIGHT, WATER_VERT, WATER_VERT_PARS } from './core.gen'
import type { WaterBody, WaterJson, WaterPalette } from './types'

// ---- a map texel -------------------------------------------------------------

/** The four bytes of a water map texel as the shader reads them: depth below the level (u), signed shore distance (u, + in the water), flow (x, z in u/s). */
export function decode(r: number, g: number, b: number, a: number): { depth: number; sd: number; flow: [number, number] } {
  return { depth: r / 255, sd: (g - 128) / 127, flow: [(b - 128) / 255, (a - 128) / 255] }
}

// ---- a body's colours --------------------------------------------------------

/**
 * A body's colours: the look preset's `water.bodies[palette]` key by key (what the
 * look panel edits), else water.json's palette, else the core's defaults.
 */
export function bodyColours(presetWater: Record<string, unknown> | null | undefined, json: WaterJson | null | undefined, palette: string): WaterPalette {
  const defaults = PALETTES as Record<string, WaterPalette>
  const base = (json && json.palettes && (json.palettes[palette] || json.palettes.river)) || defaults[palette] || defaults.river
  const bodies = presetWater && (presetWater.bodies as Record<string, Partial<Record<keyof WaterPalette, unknown>>> | undefined)
  const p = (bodies && bodies[palette]) || {}
  const out = {} as WaterPalette
  for (const k of ['shallow', 'mid', 'deep', 'foam', 'bed'] as const) {
    const v = p[k]
    out[k] = typeof v === 'string' ? v : base[k]
  }
  return out
}

// ---- phases, not time --------------------------------------------------------

/** The speeds in the look preset's `water` (normalSpeed 0.3, riverFlowSpeed 1, fallStreakSpeed 1.2 are the defaults). */
export interface WaterSpeeds {
  normalSpeed: number
  riverFlowSpeed: number
  fallStreakSpeed: number
}

/** The shader's phase uniforms at one moment: each is (t x speed) mod its period, so it stays small and smooth however long the game runs. */
export interface WaterPhases {
  scrollA: [number, number]
  scrollB: [number, number]
  causticOff: [number, number]
  glintOff: [number, number]
  foam: number
  flow: number
  ribbon: number
  ribbonB: number
  fall1: number
  fall2: number
  ripple: { ringA: number; ringB: number; epochA: number; epochB: number; chevron: number; clock: number }
}

/** The CPU side of "phases, not time": (t x speed) mod period, in float64. */
export function waterPhases(t: number, p: Partial<WaterSpeeds> = {}): WaterPhases {
  const ns = p.normalSpeed != null ? p.normalSpeed : 0.3
  const rf = p.riverFlowSpeed != null ? p.riverFlowSpeed : 1
  const fs = p.fallStreakSpeed != null ? p.fallStreakSpeed : 1.2
  const sA = 0.05 * (ns / 0.3)
  const sB = sA * Math.SQRT2
  const mod = (v: number, m: number) => ((v % m) + m) % m
  const P = PHASE_PERIODS
  const a = (25 * Math.PI) / 180
  const b = (205 * Math.PI) / 180
  return {
    scrollA: [mod(Math.cos(a) * sA * t, P.scrollA), mod(Math.sin(a) * sA * t, P.scrollA)],
    scrollB: [mod(Math.cos(b) * sB * t, P.scrollB), mod(Math.sin(b) * sB * t, P.scrollB)],
    causticOff: [mod(Math.cos(b) * sB * t * 0.6, P.causticOff), mod(Math.sin(b) * sB * t * 0.6, P.causticOff)],
    glintOff: [mod(Math.cos(b) * sB * t * 0.5, P.glintOff), mod(Math.sin(b) * sB * t * 0.5, P.glintOff)],
    foam: mod(t / 3.5, 1),
    flow: mod(t / FLOW_CYCLE, 1),
    ribbon: mod(t * 0.45 * rf, P.ribbon),
    ribbonB: mod(t * 0.45 * rf * Math.SQRT2, P.ribbonB),
    fall1: mod(t * fs, P.fall),
    fall2: mod(t * fs * PHI, P.fall),
    // ripples: ring phases (0..1) and their epochs (whole cycles mod RIPPLE.epochs), the chevrons (with the flow), the hook's clock
    ripple: {
      ringA: mod(t / RIPPLE.periodA, 1),
      ringB: mod(t / RIPPLE.periodB, 1),
      epochA: mod(Math.floor(t / RIPPLE.periodA), RIPPLE.epochs),
      epochB: mod(Math.floor(t / RIPPLE.periodB), RIPPLE.epochs),
      chevron: mod(t * 0.45 * rf, P.chevron),
      clock: mod(t, P.rippleClock),
    },
  }
}

// ---- patching three's Lambert shader ------------------------------------------

export interface PatchOpts {
  /** still: a pond or lake; ribbon: a stream; fall: a waterfall. */
  kind: 'still' | 'ribbon' | 'fall'
  /** phone draws one noise layer and no caustics or glints; mid draws the lot. */
  tier: 'phone' | 'mid'
  /** Advect the noise along the map's flow. */
  flow?: boolean
  /** The farm pond and its stream as one surface. */
  join?: boolean
  /** A fall whose first rows are its channel's surface curling over the edge. */
  brink?: boolean
  /** The river's virtual head at the MAIN seam. */
  vhead?: boolean
  /** Ambient rings on still water, chevrons and streaks on streams; never on a fall. */
  ripple?: boolean
  /** 1 depth, 2 shore, 3 flow, 4 bands. */
  debug?: number
}

/**
 * How a water.json body is patched: its kind, the tier, and the flags its entry
 * carries. The rule is the art proof's (arch-scene.js): a body with `ripples`
 * draws the ripple layer whatever its density (a stream's density is 0, but its
 * chevrons and streaks live there), except a fall; only still water flows.
 * Throws for a node that is not a surface (the skirt, the mist, the steam).
 */
export function patchOptsFor(body: WaterBody, tier: PatchOpts['tier']): PatchOpts {
  const kind = body.kind
  if (kind !== 'still' && kind !== 'ribbon' && kind !== 'fall') throw new Error(`${body.node} (${kind}) is not a water surface`)
  return {
    kind,
    tier,
    flow: Boolean(body.flow) && kind === 'still',
    join: Boolean(body.join),
    brink: Boolean(body.brink),
    vhead: Boolean(body.vhead),
    ripple: Boolean(body.ripples) && kind !== 'fall',
  }
}

export interface PatchResult {
  vertexShader: string
  fragmentShader: string
  /** False when nothing was changed: see `misses`. */
  applied: boolean
  misses: string[]
}

const countOf = (s: string, sub: string) => s.split(sub).length - 1

/**
 * The string transform of a MeshLambertMaterial's shaders (onBeforeCompile) that
 * makes it water. Every anchor must occur exactly once, and the shader must not
 * be patched already; otherwise nothing is changed and `misses` says why (the
 * caller then draws plain Lambert).
 */
export function patchWaterLambert(vertexShader: string, fragmentShader: string, opts: PatchOpts): PatchResult {
  const misses: string[] = []
  const A = WATER_ANCHORS
  if (countOf(fragmentShader, 'wFoamOut') > 0) misses.push('already patched')
  const checks: [string, string, string][] = [
    ['vertCommon', A.vertCommon, vertexShader],
    ['vertWorld', A.vertWorld, vertexShader],
    ['fragCommon', A.fragCommon, fragmentShader],
    ['color', A.color, fragmentShader],
    ['opaque', A.opaque, fragmentShader],
  ]
  for (const [k, anchor, src] of checks) {
    const n = countOf(src, anchor)
    if (n !== 1) misses.push(`${k} x${n}`)
  }
  if (misses.length) return { vertexShader, fragmentShader, applied: false, misses }
  const kind = opts.kind === 'fall' ? 'WATER_FALL' : opts.kind === 'ribbon' ? 'WATER_RIBBON' : 'WATER_STILL'
  const defs = [
    `#define ${kind}`,
    opts.tier === 'phone' ? '' : '#define WATER_MID',
    opts.flow ? '#define WATER_FLOW' : '',
    opts.join ? '#define WATER_JOIN' : '',
    opts.brink ? '#define WATER_BRINK' : '',
    opts.vhead ? '#define WATER_VHEAD' : '',
    opts.ripple && opts.kind !== 'fall' ? '#define WATER_RIPPLE' : '',
    opts.debug ? `#define WATER_DEBUG ${opts.debug | 0}` : '',
  ]
    .filter(Boolean)
    .join('\n')
  // (replacer functions, so a `$` in the GLSL is never read as a replacement pattern)
  const vs = vertexShader.replace(A.vertCommon, () => A.vertCommon + '\n' + WATER_VERT_PARS).replace(A.vertWorld, () => A.vertWorld + '\n' + WATER_VERT)
  const fs = fragmentShader
    .replace(A.fragCommon, () => A.fragCommon + '\n' + defs + '\n' + WATER_FRAG_PARS)
    .replace(A.color, () => A.color + '\n' + WATER_COLOR)
    .replace(A.opaque, () => WATER_LIGHT + '\n' + A.opaque)
  return { vertexShader: vs, fragmentShader: fs, applied: true, misses }
}
