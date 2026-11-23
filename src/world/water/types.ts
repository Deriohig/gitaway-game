// What public/models/water.json holds (the art session's water bake, format
// gitaway.water/1; the game reads this file and the files it names, and nothing
// from art/). Fields that only some bodies carry are optional.

import type { BufferGeometry, Color, IUniform, Mesh, MeshLambertMaterial, Vector2, Vector4 } from 'three'

/** The five colours of a body's palette, as `#RRGGBB`. */
export interface WaterPalette {
  shallow: string
  mid: string
  deep: string
  foam: string
  bed: string
}

/** Which of the water layers a quality tier draws. */
export interface WaterTier {
  scrolls: number
  flowAdvect: boolean
  foamBands: number
  riffles: boolean
  glints: boolean
  caustics: boolean
  lapping: boolean
  wake: boolean
  shadows: boolean
  fallLayers: number
  mistPuffs: number
  steamPuffs: number
}

export type WaterBodyKind = 'still' | 'ribbon' | 'fall' | 'skirt' | 'mist' | 'steam'

/** The ambient ripples of a body: the share of cells with a ring, the extra strength toward the shore, and chevrons on streams. */
export interface WaterRipples {
  density: number
  shore: number
  chevrons: boolean
}

/** A pond that runs on into a stream as one surface: still until `u0`, flowing over `ramp`, its palette handing over to `to`'s over the last `handover` before `uEnd`. */
export interface WaterJoin {
  u0: number
  ramp: number
  uEnd: number
  handover: number
  to: string
}

/** A fall whose first rows are its channel's surface curling over the edge. */
export interface WaterBrink {
  start: number
  len: number
  to: string
}

/** When a body is drawn: while (or after) something else is. */
export interface WaterFillFrom {
  shownWhile?: string
  after?: string
  from?: string
  retreat?: number
  seconds?: number
}

/** One mesh node of a piece's water GLB, and how to draw it. */
export interface WaterBody {
  node: string
  kind: WaterBodyKind
  /** A key of `WaterJson.palettes`; null for the depth-only skirt. */
  palette?: string | null
  level?: number | null
  /** The carved basin is virtual: the bed is painted into the shallows. */
  virtual?: boolean
  /** Water that flows (the noise is advected along the map's flow). */
  flow?: boolean
  uStart?: number
  length?: number | null
  dissolveFrom?: number
  fillFrom?: WaterFillFrom | null
  join?: WaterJoin
  brink?: WaterBrink
  /** The river's virtual head: where (start, end u) the stream's look eases into the carved river. */
  vhead?: [number, number]
  ripples?: WaterRipples | null
  note?: string
}

/** One body of water.json within a drawn surface: its node and its stream length (u). A surface's parts run in the order its u does. */
export type FillPart = { node: string; length: number }

/**
 * A surface as loaded (load.ts): the body it is drawn as, its mesh in the
 * piece's frame, and the bodies of water.json it is made of. That is the body
 * itself, or for the wetland's river and outflow, merged into one ribbon, the
 * two of them, whose fills (`fillFrom`) the parts carry.
 */
export type LoadedBody = { body: WaterBody; geometry: BufferGeometry; parts: FillPart[] }

/** The kinds of body drawn as a water surface: still water, a ribbon (a stream) and a fall. */
export type WaterSurfaceKind = 'still' | 'ribbon' | 'fall'

/**
 * The uniforms one body's shader reads (waterMaterial.ts bodyUniforms): its
 * own (its fill, map, palette and shape, and its share of the dusk floor) and
 * the session's shared ones beside them. Its material's copies (the Fader's)
 * read the same objects.
 */
export type BodyWaterUniforms = { uFill: IUniform<number>; uFloorShare: IUniform<number> } & Record<string, IUniform>

/** A surface as built (build.ts): its name (the node), kind and mesh, the uniforms its shader reads, and the bodies of water.json it is made of. */
export interface BuiltBody {
  name: string
  kind: WaterSurfaceKind
  mesh: Mesh<BufferGeometry, MeshLambertMaterial>
  uniforms: BodyWaterUniforms
  parts: FillPart[]
}

/** A piece's water map (RGBA8, `size` texels, piece-local from `origin`) and the bodies in its GLB. */
export interface WaterPiece {
  pivot: [number, number, number]
  glb: string
  map: { file: string; origin: [number, number]; texel: number; size: [number, number]; encoding: string }
  bodies: WaterBody[]
}

export interface WaterJson {
  format: string
  about: string
  encoding: Record<'type' | 'order' | 'texelCentre', string> & Record<'r' | 'g' | 'b' | 'a', { meaning: string; decode: string; zero?: number }>
  noise: { file: string; size: [number, number]; format: string; wrap: string; cell: number; cellsAcross: number }
  pieces: { main: WaterPiece; wetland: WaterPiece; highland: WaterPiece }
  palettes: Record<string, WaterPalette>
  tiers: { phone: WaterTier; mid: WaterTier }
  /** The ripple constants (the same as the core's RIPPLE). */
  ripple: Record<string, number>
  layers: { bands: [number, number]; bandSoft: number; noiseCell: number; phi: number }
}

/**
 * The uniforms every water material shares by reference (the art proof's `wU`,
 * arch-scene.js): the phases (wrapped on the CPU, water-core waterPhases), the
 * sky colours, the look values and the ripples' phases and hook. Made once for
 * the session (driver.ts sessionWaterUniforms), whatever pieces are drawn, and
 * stepped each frame by the WaterDriver; each body's material adds its own map,
 * palette and shape uniforms beside them.
 */
export interface SharedWaterUniforms {
  uScrollA: IUniform<Vector2>
  uScrollB: IUniform<Vector2>
  uCausticOff: IUniform<Vector2>
  uGlintOff: IUniform<Vector2>
  uFoamPhase: IUniform<number>
  uFlowPhase: IUniform<number>
  uRibbonPhase: IUniform<number>
  uRibbonPhaseB: IUniform<number>
  uFallPhase1: IUniform<number>
  uFallPhase2: IUniform<number>
  /** Linear, from `sky.current.mid`. */
  uSkyHorizon: IUniform<Color>
  /** Linear, from `sky.current.top`. */
  uSkyZenith: IUniform<Color>
  /** The depths (u) of the shallow and deep band edges. */
  uBands: IUniform<Vector2>
  uBandSoft: IUniform<number>
  uShoreBand: IUniform<number>
  uFoamLine: IUniform<number>
  uSkyMix: IUniform<number>
  uGlint: IUniform<number>
  uCaustics: IUniform<number>
  /** Ring layer A / B phase (0..1), then their epochs. */
  uRipplePhase: IUniform<Vector4>
  /** The stream chevrons' phase along u. */
  uRippleFlow: IUniform<number>
  /** Seconds mod 64: the clock of the hook's rings. */
  uRippleClock: IUniform<number>
  /** The hook (ducks and the heron, PR 4): four rings of world x, z, start (on uRippleClock), strength; all 0 for now. */
  uRipple: IUniform<Vector4[]>
}
