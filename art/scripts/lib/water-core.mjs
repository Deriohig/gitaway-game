// water-core.mjs -- the water revamp's shared core (art/specs/2026-10-23-water-revamp-design.md, section 4.1). Pure ESM, no
// three dependency (like look-core.mjs): the bake (water-bake.mjs), the proof (arch-scene.js) and, through a TypeScript copy held
// to it by a drift test, the game all read the same constants, encodings and GLSL from here.
// =============================================================================
// THE WATER MAP (one per wet piece: main, wetland, highland): raw RGBA8, row-major with x fastest (texel (i, j) at byte
// 4 * (j * w + i)), piece-local, texel centre (i, j) at origin + ((i + 0.5) * texel, (j + 0.5) * texel) (x, z):
//   R  depth below the water level = R / 255 u (0 .. 1 u; virtual for the farm pond + stream)
//   G  signed shore distance, + in the water = (G - 128) / 127 u (-1 .. ~1 u; G = 128 exactly on the shore)
//   B  flow x = (B - 128) / 255 u/s (B = 128 exactly: no flow)
//   A  flow z = (A - 128) / 255 u/s
// The noise: water_noise.bin, 128 x 128 RG8, tileable, two decorrelated value-noise channels in 0 .. 255.
// Both load as linear data (NoColorSpace) with GPU-built mipmaps; the map clamps to edge, the noise repeats.
// =============================================================================

export const WATER_FORMAT = 'gitaway.water/1';
export const TEXEL = 0.05;          // u per map texel
export const MARGIN = 1;            // u of coverage round the water's bounding box
export const SUPERSAMPLE = 4;       // the shore distance is an exact EDT on a 4x supersampled water mask
export const SIZE_STEP = 8;         // map sides are rounded up to multiples of 8
export const MAX_SIDE = 512;        // budget (W7)
export const SD_BLUR = 0.06;        // sigma (u) of the blur after the distance transform
export const NOISE_SIZE = 128;

const clampByte = (v, lo = 0, hi = 255) => Math.max(lo, Math.min(hi, v));
export const encode = {
  depth: (d) => clampByte(Math.round(Math.max(0, Math.min(1, d)) * 255)),
  sd: (s) => clampByte(128 + Math.round(s * 127), 1, 255),
  flow: (v) => clampByte(128 + Math.round(v * 255)),
};
export const decode = {
  depth: (b) => b / 255,
  sd: (b) => (b - 128) / 127,
  flow: (b) => (b - 128) / 255,
};
// what water.json says about the encoding (the game reads this, not art/config)
export const ENCODING = Object.freeze({
  type: 'RGBA8', order: 'row-major, x fastest; row j = local z', texelCentre: 'origin + (i + 0.5, j + 0.5) * texel',
  r: { meaning: 'depth below the level (u)', decode: 'R / 255' },
  g: { meaning: 'signed shore distance, + in the water (u)', decode: '(G - 128) / 127', zero: 128 },
  b: { meaning: 'flow x (u/s)', decode: '(B - 128) / 255', zero: 128 },
  a: { meaning: 'flow z (u/s)', decode: '(A - 128) / 255', zero: 128 },
});

// the look (section 3): depth bands, foam, alpha, Fresnel, glints and caustics; per tier (section 4.2 Tiers)
export const BANDS = [0.08, 0.22];
export const BAND_SOFT = 0.015;
export const NOISE_CELL = 1.8;                         // u, scroll A along 25 deg; scroll B = 1.8 / phi along 205 deg at sqrt(2) x
export const PHI = (1 + Math.sqrt(5)) / 2;
export const TIERS = Object.freeze({
  phone: { scrolls: 1, flowAdvect: false, foamBands: 1, riffles: false, glints: false, caustics: false, lapping: false, wake: false, shadows: false, fallLayers: 1, mistPuffs: 3, steamPuffs: 3 },
  mid: { scrolls: 2, flowAdvect: true, foamBands: 2, riffles: true, glints: true, caustics: true, lapping: true, wake: true, shadows: true, fallLayers: 2, mistPuffs: 6, steamPuffs: 5 },
});

// the per-body palettes (section 3.3; albedo, lit by the scene; the same in every mood). lookPresets water.bodies mirrors these
export const PALETTES = Object.freeze({
  pond: { shallow: '#93BCAE', mid: '#7CA7A6', deep: '#43726E', foam: '#F4F4EB', bed: '#8E8B79' },   // (tuning 1: deep #4E7D8C -> darker teal)
  lake: { shallow: '#86B0A2', mid: '#75A7A0', deep: '#4E7A77', foam: '#EEF2EA', bed: '#6D7F6C' },   // (tuning 1: deep #4F7188 -> #4A6E72; tuning 2: mid / deep ~10 % livelier, greener, still cooler than the pond)
  river: { shallow: '#B4D4CE', mid: '#82ACB0', deep: '#5F93A2', foam: '#F6F6EE', bed: '#8E8B79' },
  tarn: { shallow: '#9BB0B8', mid: '#7A9EBD', deep: '#4C6275', foam: '#EDF1F4', bed: '#6F7A80' },
  spring: { shallow: '#BEDFD2', mid: '#7FC4BE', deep: '#4FA7B0', foam: '#F6F2EA', bed: '#E3D2B4' },
  fall: { shallow: '#82ACB0', mid: '#B4D4CE', deep: '#5F93A2', foam: '#F6F6EE', bed: '#FBF5EA' },   // body, streak, shadowed body, spray, mist
});
// a body's colours: the preset's water.bodies[palette] key by key (what the look panel edits, live), else water.json's resolved
// palette, else the defaults above (review I3: the wired keys are read)
export function bodyColours(presetWater, json, palette) {
  const base = (json && json.palettes && (json.palettes[palette] || json.palettes.river)) || PALETTES[palette] || PALETTES.river;
  const p = (presetWater && presetWater.bodies && presetWater.bodies[palette]) || {}, out = {};
  for (const k of ['shallow', 'mid', 'deep', 'foam', 'bed']) out[k] = typeof p[k] === 'string' ? p[k] : base[k];
  return out;
}
export const BODY_PALETTE = Object.freeze({ pond: 'pond', stream: 'river', lake: 'lake', river: 'river', outflow: 'river', tarn: 'tarn', spring: 'spring', fall: 'fall' });

// =============================================================================
// GLSL: one MeshLambertMaterial per body, patched through onBeforeCompile (the CSM approach without the package), so the scene's
// lights, shadows, fog and tone mapping apply. Layout (decode -> bands -> foam -> light) so it ports to TSL mechanically.
// The two-phase flow-map advection follows the method of three.js examples/jsm/objects/Water2.js (MIT, (c) 2010-2024 three.js
// authors, https://github.com/mrdoob/three.js/blob/r186/LICENSE); written here from the method, no code copied.
// Defines: WATER_STILL | WATER_RIBBON | WATER_FALL, WATER_MID (tier mid; absent = phone), WATER_FLOW (advect the noise along the
// map's flow), WATER_DEBUG 1 depth | 2 shore | 3 flow | 4 bands. Rev 1 (spec Revision 1): WATER_JOIN (the farm pond + stream as one
// surface: the flow ramp and the palette hand-over along u), WATER_VHEAD (the river's virtual head at the MAIN seam), WATER_BRINK (a
// fall whose first rows are its channel's surface curling over the edge), WATER_RIPPLE (L11: rings on still water, chevrons and
// streaks on streams, the hook's rings; never on a fall).
// Uniforms (set by the host; phases are wrapped on the CPU in float64): see WATER_UNIFORMS.
// =============================================================================
export const WATER_UNIFORMS = ['uWaterMap', 'uWaterNoise', 'uMapOrigin', 'uMapExtent', 'uShallow', 'uMid', 'uDeep', 'uFoamCol', 'uBed', 'uBands', 'uBandSoft',
  'uShoreBand', 'uFoamLine', 'uSkyMix', 'uGlint', 'uCaustics', 'uSkyHorizon', 'uSkyZenith', 'uScrollA', 'uScrollB', 'uCausticOff', 'uGlintOff', 'uFoamPhase', 'uFlowPhase', 'uRibbonPhase', 'uRibbonPhaseB',
  'uFallPhase1', 'uFallPhase2', 'uVirtual', 'uUStart', 'uLength', 'uFill',
  // (rev 1) WATER_JOIN: uJoin (u0, ramp, uEnd, handover) + the second palette; WATER_VHEAD: uVHead (start, end u)
  'uJoin', 'uVHead', 'uShallow2', 'uMid2', 'uDeep2', 'uFoamCol2', 'uBed2',
  // (rev 1) WATER_BRINK: uBrink (start, length u past the fall's top row)
  'uBrink',
  // (rev 1) WATER_RIPPLE (L11): the phases (shared), the body's density + shore weight, the hook (4 x vec4, the game's duck / heron rings)
  'uRipplePhase', 'uRippleFlow', 'uRippleClock', 'uRippleDensity', 'uRippleShore', 'uRipple'];
export const FLOW_CYCLE = 8.0;   // s, the two-phase flow-map cycle
// (rev 1, spec Revision 1 R1.5) L11 ripples. Still water: ambient rings in two layers of world cells (A 1.5 u, B 1.5 / phi u; phone draws
// A only); each cell holds at most one ring a cycle (A 3.4 s, B 3.4 phi s), its start, centre and presence from a hash of the cell and
// its epoch (cycle count mod `epochs`), growing to radius x cell and fading over the cycle. Streams: cells `chevron` u long along u, moving
// with the flow and counted mod `chevronCells` (= the chevron phase's period / the cell, so its wrap moves them by whole periods); each
// cycle of ring A a `chevronShare` of them hold a small V wake (apex jittered, arms up to `chevronArm` u trailing upstream at 35 deg and
// bending out by `chevronBend`) that fades in, spreads and fades out; + streaks along u (mid). Thin lines: rings `width` u (>= 1.25 px
// at the desktop default, faded out at the phone framing); the stream lines keep a pixel floor between `chevronMin` and `chevronWidth` u
// (streaks `streakMin`-`streakWidth` of the width), so close up they stay lines, not bands. Soft cream: they feed the foam colour at
// <= `strength`.
export const RIPPLE = Object.freeze({ cellA: 1.5, cellB: +(1.5 / PHI).toFixed(6), periodA: 3.4, periodB: +(3.4 * PHI).toFixed(4), epochs: 251, radius: 0.22, width: 0.06,
  chevron: 1.1, chevronCells: 100, chevronWidth: 0.055, chevronMin: 0.02, chevronArm: 0.2, chevronBend: 1.2, chevronSpan: 0.7, chevronShare: 0.65,
  streakWidth: 0.03, streakMin: 0.01, strength: 0.32, hooks: 4, hookClock: 64 });
// per body: the share of cells with a ring each cycle (density), the extra strength toward the shore (the lake's reeds), chevrons on
// the streams (the farm stream is part of water_pond). The spring has none (its steam carries its life); falls none.
export const RIPPLE_BODIES = Object.freeze({ pond: { density: 0.42, shore: 0, chevrons: true }, lake: { density: 0.55, shore: 1, chevrons: false }, tarn: { density: 0.16, shore: 0, chevrons: false },
  river: { density: 0, shore: 0, chevrons: true }, outflow: { density: 0, shore: 0, chevrons: true } });
const fract1 = (v) => v - Math.floor(v);
// the GLSL wHash12 (Dave Hoskins' sin-free hash, written from the method), in JS: [0, 1)
export function hash12(x, y) {
  let a = fract1(x * 0.1031), b = fract1(y * 0.1031), c = fract1(x * 0.1031); const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d; b += d; c += d; return fract1((a + b) * c);
}
// the JS mirror of wRingLayer for one cell (integer cx, cz) of a layer (0 = A, 1 = B) at time t: { on, epoch, cx, cz (the ring's world
// centre), r, amp, phase } - a function of (cell, t) only, so a ring is where it is for its whole cycle, never a per-frame random
export function rippleRing(layer, cx, cz, t, density) {
  const R = RIPPLE, per = layer ? R.periodB : R.periodA, cell = layer ? R.cellB : R.cellA, off = layer ? [0.53, 0.29] : [0, 0];
  const ph0 = fract1(t / per), ep0 = ((Math.floor(t / per) % R.epochs) + R.epochs) % R.epochs;
  let ph = ph0 + hash12(cx + 17.17, cz + 17.17); const ep = (ep0 + Math.floor(ph)) % R.epochs; ph = fract1(ph);
  const kx = cx + ep * 1.618, kz = cz + ep * 2.414, on = hash12(kx + 3.7, kz + 3.7) < density;
  const fx = 0.25 + 0.5 * hash12(kx + 11.3, kz + 11.3), fz = 0.25 + 0.5 * hash12(kx + 29.1, kz + 29.1), r = R.radius * cell * (1 - (1 - ph) ** 2), sm = Math.min(1, Math.max(0, (r - R.width) / (1.5 * R.width))), fade = sm * sm * (3 - 2 * sm);
  return { on, epoch: ep, cx: (cx + fx) * cell - off[0], cz: (cz + fz) * cell - off[1], r, amp: on ? (1 - ph) ** 2 * fade : 0, phase: ph };
}
// (review I1: each scaled use has its own phase, wrapped so period x scale / tile is whole - W12)
export const PHASE_PERIODS = Object.freeze({ scrollA: NOISE_CELL * 8, scrollB: (NOISE_CELL / PHI) * 8, causticOff: NOISE_CELL * 8, glintOff: (NOISE_CELL * 8) / 14, foam: 1, flow: 1,
  ribbon: NOISE_CELL * 8 * 100, ribbonB: (NOISE_CELL / PHI) * 8 * 100, fall: NOISE_CELL * 8 * 100,
  ringA: 1, ringB: 1, chevron: +(RIPPLE.chevron * RIPPLE.chevronCells).toFixed(6), rippleClock: RIPPLE.hookClock });   // (rev 1: the ripples)
// the CPU side of "phases, not time": (t x speed) mod period, in float64, as small uniforms
export function waterPhases(t, p = {}) {
  const ns = p.normalSpeed != null ? p.normalSpeed : 0.3, rf = p.riverFlowSpeed != null ? p.riverFlowSpeed : 1, fs = p.fallStreakSpeed != null ? p.fallStreakSpeed : 1.2;
  const sA = 0.05 * (ns / 0.3), sB = sA * Math.SQRT2, mod = (v, m) => ((v % m) + m) % m, P = PHASE_PERIODS, a = 25 * Math.PI / 180, b = 205 * Math.PI / 180;
  return { scrollA: [mod(Math.cos(a) * sA * t, P.scrollA), mod(Math.sin(a) * sA * t, P.scrollA)], scrollB: [mod(Math.cos(b) * sB * t, P.scrollB), mod(Math.sin(b) * sB * t, P.scrollB)],
    causticOff: [mod(Math.cos(b) * sB * t * 0.6, P.causticOff), mod(Math.sin(b) * sB * t * 0.6, P.causticOff)], glintOff: [mod(Math.cos(b) * sB * t * 0.5, P.glintOff), mod(Math.sin(b) * sB * t * 0.5, P.glintOff)],
    foam: mod(t / 3.5, 1), flow: mod(t / FLOW_CYCLE, 1), ribbon: mod(t * 0.45 * rf, P.ribbon), ribbonB: mod(t * 0.45 * rf * Math.SQRT2, P.ribbonB), fall1: mod(t * fs, P.fall), fall2: mod(t * fs * PHI, P.fall),
    // (rev 1) ripples: ring phases (0..1) + their epochs (whole cycles mod RIPPLE.epochs), the chevrons (with the flow), the hook's clock
    ripple: { ringA: mod(t / RIPPLE.periodA, 1), ringB: mod(t / RIPPLE.periodB, 1), epochA: mod(Math.floor(t / RIPPLE.periodA), RIPPLE.epochs), epochB: mod(Math.floor(t / RIPPLE.periodB), RIPPLE.epochs),
      chevron: mod(t * 0.45 * rf, P.chevron), clock: mod(t, P.rippleClock) } };
}
// every use of a CPU-wrapped phase in the GLSL: { phase (PHASE_PERIODS key), scale, tile (the texture period in the phase's units),
// glsl (the expression, held to the source by W12) }. A wrap is invisible only if period x scale / tile is a whole number (W12).
const TILE_A = NOISE_CELL * 8, TILE_B = (NOISE_CELL / PHI) * 8;
export const PHASE_USES = Object.freeze([
  { phase: 'scrollA', scale: 1, tile: TILE_A, glsl: 'wNoiseA( wp + uScrollA' },
  { phase: 'scrollB', scale: 1, tile: TILE_B, glsl: 'wNoiseB( wp + uScrollB )' },
  { phase: 'causticOff', scale: 1, tile: TILE_A, glsl: '( wp * 1.7 + uCausticOff )' },
  { phase: 'glintOff', scale: 14, tile: TILE_A, glsl: '( wp + uGlintOff ) * 14.0' },
  { phase: 'ribbon', scale: 1, tile: TILE_A, glsl: 'vec2( vWaterUv.x - uRibbonPhase, vWaterUv.y * 0.5 )' },
  { phase: 'ribbonB', scale: 1, tile: TILE_B, glsl: 'vWaterUv.x - uRibbonPhaseB' },
  { phase: 'ribbon', scale: 0.35, tile: TILE_A, glsl: '( vWaterUv.x - uRibbonPhase ) * 0.35' },
  { phase: 'fall', scale: 1 / 24, tile: 1, glsl: '( U - uFallPhase1 ) / 24.0' },
  { phase: 'fall', scale: 1 / 16, tile: 1, glsl: '( U - uFallPhase2 ) / 16.0' },
  { phase: 'fall', scale: 1 / 6, tile: 1, glsl: '( U - uFallPhase1 ) / 6.0' },
  { phase: 'foam', scale: 1, tile: 1, glsl: 'wSd / 0.22 - uFoamPhase' },
  // (rev 1) WATER_JOIN reuses the ribbon expressions above on the still path; WATER_BRINK's channel surface on a fall:
  { phase: 'ribbon', scale: 1, tile: TILE_A, glsl: 'vec2( U - uRibbonPhase, v * 0.5 )' },
  { phase: 'ribbonB', scale: 1, tile: TILE_B, glsl: 'vec2( U - uRibbonPhaseB, v * 0.8 + 0.37 )' },
  { phase: 'ribbon', scale: 0.35, tile: TILE_A, glsl: '( U - uRibbonPhase ) * 0.35' },
  { phase: 'causticOff', scale: 1, tile: TILE_A, glsl: '( vWaterWorld.xz * 1.7 + uCausticOff )' },
  { phase: 'glintOff', scale: 14, tile: TILE_A, glsl: '( vWaterWorld.xz + uGlintOff ) * 14.0' },
  { phase: 'foam', scale: 1, tile: 1, glsl: 'bSd / 0.22 - uFoamPhase' },
  // (rev 1) L11 ripples: the ring phases (used under fract / per cycle), the chevrons along u, the hook's clock
  { phase: 'ringA', scale: 1, tile: 1, glsl: 'uRipplePhase.x' },
  { phase: 'ringB', scale: 1, tile: 1, glsl: 'uRipplePhase.y' },
  { phase: 'chevron', scale: 1 / RIPPLE.chevron, tile: 1, glsl: '( uv.x - uRippleFlow ) / W_CHEV' },
  { phase: 'rippleClock', scale: 1, tile: RIPPLE.hookClock, glsl: 'mod( uRippleClock - R.z, 64.0 )' },
]);
const f = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
export const WATER_VERT_PARS = `
varying vec3 vWaterWorld;
varying vec3 vWaterLocal;
varying vec2 vWaterUv;`;
export const WATER_VERT = `
vWaterLocal = transformed;
vWaterWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vWaterUv = uv;`;
export const WATER_FRAG_PARS = `
varying vec3 vWaterWorld;
varying vec3 vWaterLocal;
varying vec2 vWaterUv;
uniform sampler2D uWaterMap;
uniform sampler2D uWaterNoise;
uniform vec2 uMapOrigin;
uniform vec2 uMapExtent;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uFoamCol;
uniform vec3 uBed;
uniform vec2 uBands;
uniform float uBandSoft;
uniform float uShoreBand;
uniform float uFoamLine;
uniform float uSkyMix;
uniform float uGlint;
uniform float uCaustics;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec2 uScrollA;
uniform vec2 uScrollB;
uniform float uFoamPhase;
uniform float uFlowPhase;
uniform float uRibbonPhase;
uniform float uRibbonPhaseB;
uniform vec2 uCausticOff;
uniform vec2 uGlintOff;
uniform float uFallPhase1;
uniform float uFallPhase2;
uniform float uVirtual;
uniform float uUStart;
uniform float uLength;
uniform float uFill;
#ifdef WATER_VHEAD
uniform vec2 uVHead;
#endif
#ifdef WATER_BRINK
uniform vec2 uBrink;
#endif
#ifdef WATER_JOIN
uniform vec4 uJoin;
#endif
#if defined( WATER_JOIN ) || defined( WATER_BRINK )
uniform vec3 uShallow2;
uniform vec3 uMid2;
uniform vec3 uDeep2;
uniform vec3 uFoamCol2;
uniform vec3 uBed2;
// variance-keeping mix of two independent noise samples (no flat, low-contrast zone half way through the blend)
float wMixN( float a, float b, float w ) { return 0.5 + ( ( a - 0.5 ) * ( 1.0 - w ) + ( b - 0.5 ) * w ) / max( sqrt( ( 1.0 - w ) * ( 1.0 - w ) + w * w ), 1e-3 ); }
#endif
#define W_CELL ${f(NOISE_CELL)}
#define W_PHI ${f(+PHI.toFixed(6))}
#define W_FLOW_CYCLE ${f(FLOW_CYCLE)}
float wNoiseA( vec2 p ) { return texture( uWaterNoise, p / ( W_CELL * 8.0 ) ).r; }
float wNoiseB( vec2 p ) { return texture( uWaterNoise, p / ( W_CELL / W_PHI * 8.0 ) ).g; }
// a layer of on-screen thickness th (in its coordinate) fades out once it would be thinner than 1.25 px
float wFade( float coordPerPx, float th ) { return 1.0 - smoothstep( th / 2.5, th / 1.25, coordPerPx ); }
vec3 wRamp( float t ) { return clamp( vec3( 1.5 - abs( 4.0 * t - 3.0 ), 1.5 - abs( 4.0 * t - 2.0 ), 1.5 - abs( 4.0 * t - 1.0 ) ), 0.0, 1.0 ); }
#ifdef WATER_RIPPLE
// (rev 1) L11 ripples: phases wrapped on the CPU (water-core waterPhases().ripple): uRipplePhase = ring layer A / B phase (0..1), epoch
// A / B (whole cycles mod W_RING_EPOCHS); uRippleFlow = the chevrons' phase along u; uRippleClock = s mod 64 (the hook's clock)
uniform vec4 uRipplePhase;
uniform float uRippleFlow;
uniform float uRippleClock;
uniform float uRippleDensity;
uniform float uRippleShore;
// the hook (the game's PR 4: duck and heron rings): world x, z, start (on uRippleClock, s), strength; all 0 (unused) for now
uniform vec4 uRipple[ 4 ];
#define W_RING_A ${f(RIPPLE.cellA)}
#define W_RING_B ${f(RIPPLE.cellB)}
#define W_RING_R ${f(RIPPLE.radius)}
#define W_RING_W ${f(RIPPLE.width)}
#define W_RING_EPOCHS ${f(RIPPLE.epochs)}
#define W_CHEV ${f(RIPPLE.chevron)}
#define W_CHEV_CELLS ${f(RIPPLE.chevronCells)}
#define W_CHEV_W ${f(RIPPLE.chevronWidth)}
#define W_CHEV_MIN ${f(RIPPLE.chevronMin)}
#define W_CHEV_ARM ${f(RIPPLE.chevronArm)}
#define W_CHEV_BEND ${f(RIPPLE.chevronBend)}
#define W_STREAK ${f(RIPPLE.streakWidth)}
#define W_STREAK_MIN ${f(RIPPLE.streakMin)}
#define W_CHEV_SPAN ${f(RIPPLE.chevronSpan)}
#define W_CHEV_SHARE ${f(RIPPLE.chevronShare)}
#define W_RIP_STRENGTH ${f(RIPPLE.strength)}
// Dave Hoskins' sin-free hash (written from the method; water-core hash12 is its JS twin)
float wHash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
// a ring at distance d from its centre, radius r: thin and soft, faded out once thinner than 1.25 px (px = u a pixel)
float wRing( float d, float r, float px ) { return ( 1.0 - smoothstep( W_RING_W * 0.3, W_RING_W, abs( d - r ) ) ) * wFade( px, W_RING_W ); }
// one layer of ambient rings (water-core rippleRing is its JS mirror): cells of \`cell\` u; each holds at most one ring a cycle, its start,
// presence and centre from a hash of the cell and its epoch (never a per-frame random); it grows to W_RING_R x cell (fast, then slow)
// with a fainter inner ring, and fades out over its cycle
float wRingLayer( vec2 p, float cell, float phase, float epoch, float px ) {
  vec2 c = floor( p / cell ), f = p / cell - c;
  float ph = phase + wHash12( c + 17.17 ), ep = mod( epoch + floor( ph ), W_RING_EPOCHS ); ph = fract( ph );
  vec2 k = c + vec2( ep * 1.618, ep * 2.414 );
  float on = step( wHash12( k + 3.7 ), uRippleDensity ) * ( 1.0 - step( uRippleDensity, 0.0 ) );
  vec2 ctr = 0.25 + 0.5 * vec2( wHash12( k + 11.3 ), wHash12( k + 29.1 ) );
  float d = length( f - ctr ) * cell, r = W_RING_R * cell * ( 1.0 - ( 1.0 - ph ) * ( 1.0 - ph ) );
  // (a young ring fades in with its radius, so it never reads as a dot; the second ring trails just inside, faint: no target)
  return on * ( 1.0 - ph ) * ( 1.0 - ph ) * smoothstep( W_RING_W, 2.5 * W_RING_W, r ) * max( wRing( d, r, px ), 0.3 * wRing( d, r * 0.72, px ) );
}
// stream chevrons: small V wakes pointing downstream, moving with the flow: cells W_CHEV u long along u, counted mod W_CHEV_CELLS (the
// chevron phase wraps on a whole number of cells: no pop). Each lives one ring-A cycle, its start from the cell's hash; each cycle a
// W_CHEV_SHARE of the cells hold one (a hash of the cell and its epoch, never a per-frame random). It fades in, spreads (its arms grow to
// W_CHEV_ARM u) and fades out; its apex is jittered in the cell, its arms trail upstream at 35 deg bending out by W_CHEV_BEND (v scaled
// to ~W_CHEV_SPAN u across), softer at the apex, fading toward their tips; a thin line (2 px, between W_CHEV_MIN and W_CHEV_W u), broken by the noise n;
// px = u a pixel
float wChevron( vec2 uv, float n, float px ) {
  float qu = ( uv.x - uRippleFlow ) / W_CHEV, ci = mod( floor( qu ), W_CHEV_CELLS );
  vec2 cid = vec2( ci, 11.0 );
  float ph = uRipplePhase.x + wHash12( cid + 5.5 ), ep = mod( uRipplePhase.z + floor( ph ), W_RING_EPOCHS ); ph = fract( ph );
  float on = step( wHash12( cid + vec2( ep * 1.618, ep * 2.414 ) + 7.3 ), W_CHEV_SHARE );
  float life = smoothstep( 0.0, 0.25, ph ) * ( 1.0 - smoothstep( 0.5, 1.0, ph ) ), L = W_CHEV_ARM * ( 0.55 + 0.45 * ph );
  float au = 0.35 + 0.3 * wHash12( cid + 1.1 ), av = 0.3 + 0.4 * wHash12( cid + 2.2 );
  vec2 q = vec2( ( au - fract( qu ) ) * W_CHEV, abs( uv.y - av ) * W_CHEV_SPAN );   // (q.x: upstream of the apex, u; q.y: across, u)
  float x = max( q.x, 0.0 ), sl = 0.7 + 2.0 * W_CHEV_BEND * x;   // (the arm: y = x ( 0.7 + bend x ); its slope sl)
  float dist = q.x < 0.0 ? length( q ) : abs( q.y - x * ( 0.7 + W_CHEV_BEND * x ) ) / sqrt( 1.0 + sl * sl ), w = clamp( 2.0 * px, W_CHEV_MIN, W_CHEV_W );
  return on * life * ( 1.0 - smoothstep( w * 0.35, w, dist ) ) * ( 0.45 + 0.55 * smoothstep( 0.0, 0.3 * L, q.x ) ) * ( 1.0 - smoothstep( 0.45 * L, L, q.x ) )
    * ( 1.0 - smoothstep( 0.38, 0.47, abs( uv.y - 0.5 ) ) ) * smoothstep( 0.25, 0.5, n ) * wFade( px, W_CHEV_W );
}
// stream streaks (mid): thin lines along u in 5 jittered lanes (1.5 px, between W_STREAK_MIN and W_STREAK of the width), dashed by the
// noise n; pv = v a pixel
float wStreak( vec2 uv, float n, float pv ) {
  float lane = floor( uv.y * 5.0 ), lc = ( lane + 0.5 + ( wHash12( vec2( lane, 3.1 ) ) - 0.5 ) * 0.5 ) / 5.0, w = clamp( 1.5 * pv, W_STREAK_MIN, W_STREAK );
  return ( 1.0 - smoothstep( 0.4 * w, w, abs( uv.y - lc ) ) ) * smoothstep( 0.64, 0.74, n ) * ( 1.0 - smoothstep( 0.32, 0.45, abs( uv.y - 0.5 ) ) ) * wFade( pv, W_STREAK );
}
#endif
float wFoamOut; float wNA; float wNB; float wDepthOut; float wSdOut; vec2 wFlowOut; float wBandOut; float wGlintN; float wBrK;`;
// L1-L4 (+ L7): into diffuseColor, before lighting
export const WATER_COLOR = `
#ifdef WATER_FALL
{
  float U = vWaterUv.x, u = U - uUStart, v = vWaterUv.y, t = clamp( u / uLength, 0.0, 1.0 );
  float s1 = texture( uWaterNoise, vec2( v * 0.5, ( U - uFallPhase1 ) / 24.0 ) ).r;
  #ifdef WATER_MID
  float s2 = texture( uWaterNoise, vec2( v * 0.8 + 0.31, ( U - uFallPhase2 ) / 16.0 ) ).g;
  float s = max( s1, s2 * 0.95 );
  #else
  float s = s1;
  #endif
  vec3 wc = mix( uDeep, uShallow, smoothstep( 0.25, 0.4, s ) );
  wc = mix( wc, uMid, smoothstep( 0.54, 0.62, s ) );
  wc = mix( wc, uFoamCol, smoothstep( 0.74, 0.82, s ) );
  #ifdef WATER_BRINK
  // (rev 1) a broken foam lip just past the brink (from 0.35 to 2.6 brink lengths past its start, only where the streaks run high), not
  // a solid band
  float lip = smoothstep( uBrink.y * 0.35, uBrink.y, u - uBrink.x ) * ( 1.0 - smoothstep( uBrink.y * 1.5, uBrink.y * 2.6, u - uBrink.x ) ) * smoothstep( 0.32, 0.5, s );
  #else
  float lip = 1.0 - smoothstep( 0.12, 0.3, u );
  #endif
  float thr = smoothstep( 0.55, 1.0, t );
  wc = mix( wc, uFoamCol, max( lip * 0.9, thr * 0.45 ) );
  float nd = texture( uWaterNoise, vec2( v * 1.3 + 0.7, ( U - uFallPhase1 ) / 6.0 ) ).g;
  float edge = abs( v - 0.5 ) * 2.0 + ( nd - 0.5 ) * 0.35 * ( 0.3 + thr );
  float a = 0.84 * ( 1.0 - smoothstep( 0.8 - thr * 0.45, 1.0 - thr * 0.25, edge ) );
  a *= 1.0 - smoothstep( nd - 0.08, nd + 0.04, thr * 1.05 );
  a = max( a, lip * 0.9 * ( 1.0 - smoothstep( 0.85, 1.0, abs( v - 0.5 ) * 2.0 ) ) );
  #ifdef WATER_BRINK
  // (rev 1, R1.4) the brink: over its first uBrink.x u, then fading over uBrink.y, the sheet IS its channel's surface (the channel's map,
  // the second palette, the ribbon noise with u carried on, the contact line and bands, riffles, caustics, glints and the sky Fresnel),
  // so the river runs over the edge unbroken; no emissive there
  float kB = 1.0 - smoothstep( uBrink.x, uBrink.x + uBrink.y, u ), bA, bB, bD, bSd, bfoam, bGl = 0.0;
  {
    vec4 Mb = texture( uWaterMap, ( vWaterLocal.xz - uMapOrigin ) / uMapExtent );
    bD = Mb.r; bSd = ( Mb.g * 255.0 - 128.0 ) / 127.0;
    #ifdef WATER_MID
    bA = wNoiseA( vec2( U - uRibbonPhase, v * 0.5 ) );
    bB = wNoiseB( vec2( U - uRibbonPhaseB, v * 0.8 + 0.37 ) ); float bN = bA * 0.62 + bB * 0.38;
    #else
    // (rev 3, R3.1) phone: the brink's noise is the streak tap s1 (the same channel, R), not a ribbon tap of its own, so the fall reads
    // 3 texels a pixel (s1, nd, the map). It only wobbles the bands and dashes the foam bands over the brink's ~3 px at the phone
    // framing; the contact line is kept unbroken there (bB >= 0.4), so s1 never notches the cream bank where the river's line runs on
    bA = s1; bB = max( bA, 0.4 ); float bN = bA;
    #endif
    float bdw = bD + ( bN - 0.5 ) * 0.06, bsoft = max( uBandSoft, 2.0 * fwidth( bD ) );
    vec3 bc = mix( mix( uShallow2, uMid2, smoothstep( uBands.x - bsoft, uBands.x + bsoft, bdw ) ), uDeep2, smoothstep( uBands.y - bsoft, uBands.y + bsoft, bdw ) );
    bc = mix( bc, uBed2, ( 1.0 - smoothstep( 0.0, 0.03, bdw ) ) * 0.35 );
    float bpx = max( fwidth( bSd ), 1e-5 );
    #ifdef WATER_MID
    float bnc = texture( uWaterNoise, ( vWaterWorld.xz * 1.7 + uCausticOff ) / ( W_CELL * 8.0 ) ).r;
    bc += ( 1.0 - smoothstep( 0.0, 0.05, abs( bnc - 0.5 ) ) ) * smoothstep( 0.02, 0.05, bD ) * ( 1.0 - smoothstep( 0.12, 0.18, bD ) ) * uCaustics * 0.35 * wFade( bpx, 0.04 );
    float breach = uShoreBand * 1.25;
    #else
    float breach = uShoreBand * 0.62;
    #endif
    float blw = max( 0.05, 1.25 * bpx );
    float bcontact = ( 1.0 - smoothstep( blw * 0.5, blw, bSd ) ) * smoothstep( -blw * 0.6, 0.0, bSd ) * smoothstep( 0.3, 0.4, bB );
    float btb = sin( 6.2831853 * ( bSd / 0.22 - uFoamPhase ) );
    float bbands = smoothstep( 0.7, 0.9, btb ) * ( 1.0 - smoothstep( 0.0, breach, bSd ) ) * smoothstep( 0.42, 0.56, bN ) * smoothstep( blw, blw * 1.6, bSd ) * wFade( bpx, 0.03 );
    bfoam = clamp( bcontact * uFoamLine * 1.8 + bbands * 0.75, 0.0, 1.0 );
    #ifdef WATER_MID
    float brf = texture( uWaterNoise, vec2( ( U - uRibbonPhase ) * 0.35, v * 2.5 ) / ( W_CELL * 8.0 ) ).g;
    bfoam = max( bfoam, smoothstep( 0.66, 0.76, brf ) * 0.6 * ( 1.0 - smoothstep( 0.06, 0.2, bD ) ) * smoothstep( 0.0, 0.05, bSd ) * wFade( bpx, 0.05 ) );
    #endif
    bc = mix( bc, uFoamCol2, bfoam );
    float ba = max( 0.96 * smoothstep( 0.0, 0.03, bSd ), bfoam * 0.95 * smoothstep( -0.03, 0.0, bSd ) );
    wc = mix( wc, bc, kB ); a = mix( a, ba, kB );
    #ifdef WATER_MID
    bGl = texture( uWaterNoise, ( vWaterWorld.xz + uGlintOff ) * 14.0 / ( W_CELL * 8.0 ) ).r * wFade( bpx, 0.08 ) * kB;
    #endif
  }
  totalEmissiveRadiance *= 1.0 - kB;
  #endif
  a *= step( u, uFill * uLength + 0.001 );
  diffuseColor.rgb = wc; diffuseColor.a *= a;
  wFoamOut = 1.0; wNA = s; wNB = nd; wDepthOut = 0.0; wSdOut = 0.0; wFlowOut = vec2( 0.0 ); wBandOut = 0.0; wGlintN = 0.0; wBrK = 0.0;
  #ifdef WATER_BRINK
  wFoamOut = bfoam; wNA = bA; wNB = bB; wDepthOut = bD; wSdOut = bSd; wBrK = kB; wGlintN = bGl;
  #endif
}
#else
{
  vec4 M = texture( uWaterMap, ( vWaterLocal.xz - uMapOrigin ) / uMapExtent );
  float wDepth = M.r;
  float wSd = ( M.g * 255.0 - 128.0 ) / 127.0;
  vec2 wFlow = ( M.ba * 255.0 - 128.0 ) / 255.0;
  vec2 wp = vWaterWorld.xz;
  float wVirt = uVirtual;
  #ifdef WATER_VHEAD
  // (rev 1) the river's virtual head at the MAIN seam: the stream's look (bed paint, alpha) eases into the carved river over uVHead
  wVirt = max( wVirt, 1.0 - smoothstep( uVHead.x, uVHead.y, vWaterUv.x ) );
  #endif
  #ifdef WATER_JOIN
  // (rev 1) one surface pond + stream: still -> flowing over uJoin.y u past the junction (uJoin.x); the pond palette, handing over to the
  // second palette (the river's) over the last uJoin.w u before uJoin.z
  float jW = smoothstep( uJoin.x, uJoin.x + uJoin.y, vWaterUv.x ), jR = smoothstep( uJoin.z - uJoin.w, uJoin.z, vWaterUv.x );
  vec3 cSh = mix( uShallow, uShallow2, jR ), cMi = mix( uMid, uMid2, jR ), cDe = mix( uDeep, uDeep2, jR ), cFo = mix( uFoamCol, uFoamCol2, jR ), cBe = mix( uBed, uBed2, jR );
  #else
  vec3 cSh = uShallow, cMi = uMid, cDe = uDeep, cFo = uFoamCol, cBe = uBed;
  #endif
  #ifdef WATER_RIBBON
  vec2 np = vec2( vWaterUv.x - uRibbonPhase, vWaterUv.y * 0.5 );
  float nA = wNoiseA( np );
  #elif defined( WATER_FLOW ) && defined( WATER_MID )
  float ph0 = uFlowPhase, ph1 = fract( uFlowPhase + 0.5 ), fl = abs( 0.5 - ph0 ) * 2.0;
  float nA = mix( wNoiseA( wp + uScrollA - wFlow * ph0 * W_FLOW_CYCLE ), wNoiseA( wp + uScrollA - wFlow * ph1 * W_FLOW_CYCLE ), fl );
  #else
  float nA = wNoiseA( wp + uScrollA );
  #endif
  #ifdef WATER_JOIN
  nA = wMixN( nA, wNoiseA( vec2( vWaterUv.x - uRibbonPhase, vWaterUv.y * 0.5 ) ), jW );
  #endif
  #ifdef WATER_MID
    #ifdef WATER_RIBBON
  float nB = wNoiseB( vec2( vWaterUv.x - uRibbonPhaseB, vWaterUv.y * 0.8 + 0.37 ) );
    #else
  float nB = wNoiseB( wp + uScrollB );
      #ifdef WATER_JOIN
  nB = wMixN( nB, wNoiseB( vec2( vWaterUv.x - uRibbonPhaseB, vWaterUv.y * 0.8 + 0.37 ) ), jW );
      #endif
    #endif
  float wN = nA * 0.62 + nB * 0.38;
  #else
  float nB = nA;
  float wN = nA;
  #endif
  // L1 depth bands: 3 posterised bands, soft edges (>= 2 px) wobbled +/- 0.03 u by the noise
  float dw = wDepth + ( wN - 0.5 ) * 0.06;
  float soft = max( uBandSoft, 2.0 * fwidth( wDepth ) );
  float b1 = smoothstep( uBands.x - soft, uBands.x + soft, dw ), b2 = smoothstep( uBands.y - soft, uBands.y + soft, dw );
  vec3 wc = mix( mix( cSh, cMi, b1 ), cDe, b2 );
  wc = mix( wc, cBe, wVirt * ( 1.0 - smoothstep( 0.0, 0.03, dw ) ) * 0.35 );   // virtual basins: the bed painted into the outer shallows
  float pxSd = max( fwidth( wSd ), 1e-5 );
  #ifdef WATER_MID
  // L7 caustics: a faint web of light in the shallow band
  float nc = texture( uWaterNoise, ( wp * 1.7 + uCausticOff ) / ( W_CELL * 8.0 ) ).r;
  float web = 1.0 - smoothstep( 0.0, 0.05, abs( nc - 0.5 ) );
  wc += web * smoothstep( 0.02, 0.05, wDepth ) * ( 1.0 - smoothstep( 0.12, 0.18, wDepth ) ) * uCaustics * 0.35 * wFade( pxSd, 0.04 );
  #endif
  // L3 foam: the contact line (0.05 u, >= 1.25 px, broken where the noise < 0.35) + travelling bands thresholded into dashes
  float lw = max( 0.05, 1.25 * pxSd );
  float contact = ( 1.0 - smoothstep( lw * 0.5, lw, wSd ) ) * smoothstep( -lw * 0.6, 0.0, wSd ) * smoothstep( 0.3, 0.4, nB );
  float tb = sin( 6.2831853 * ( wSd / 0.22 - uFoamPhase ) );
  #ifdef WATER_MID
  float reach = uShoreBand * 1.25;
  #else
  float reach = uShoreBand * 0.62;
  #endif
  float bands = smoothstep( 0.7, 0.9, tb ) * ( 1.0 - smoothstep( 0.0, reach, wSd ) ) * smoothstep( 0.42, 0.56, wN ) * smoothstep( lw, lw * 1.6, wSd ) * wFade( pxSd, 0.03 );
  float foam = clamp( contact * uFoamLine * 1.8 + bands * 0.75, 0.0, 1.0 );
  #if defined( WATER_RIBBON ) && defined( WATER_MID )
  float rf = texture( uWaterNoise, vec2( ( vWaterUv.x - uRibbonPhase ) * 0.35, vWaterUv.y * 2.5 ) / ( W_CELL * 8.0 ) ).g;
  foam = max( foam, smoothstep( 0.66, 0.76, rf ) * 0.6 * ( 1.0 - smoothstep( 0.06, 0.2, wDepth ) ) * smoothstep( 0.0, 0.05, wSd ) * wFade( pxSd, 0.05 ) );
  #endif
  #if defined( WATER_JOIN ) && defined( WATER_MID )
  // (rev 1) the stream's riffles fade in with the flow (0 at the junction: no edge highlight there)
  float rfj = texture( uWaterNoise, vec2( ( vWaterUv.x - uRibbonPhase ) * 0.35, vWaterUv.y * 2.5 ) / ( W_CELL * 8.0 ) ).g;
  foam = max( foam, jW * smoothstep( 0.66, 0.76, rfj ) * 0.6 * ( 1.0 - smoothstep( 0.06, 0.2, wDepth ) ) * smoothstep( 0.0, 0.05, wSd ) * wFade( pxSd, 0.05 ) );
  #endif
  #ifdef WATER_RIPPLE
  // L11 ripples (rev 1, spec Revision 1 R1.5): ambient rings on still water (one layer on phone, two on mid), stronger toward the shore
  // where uRippleShore is set (the lake's reeds); chevrons (+ streaks on mid) on streams; the hook's rings (the game's ducks and heron).
  // Soft cream: they feed the foam colour at <= W_RIP_STRENGTH, kept off the shore line
  float rpx = sqrt( length( cross( dFdx( vWaterWorld ), dFdy( vWaterWorld ) ) ) ), rip = 0.0;   // (u a pixel: the footprint's geometric mean)
    #ifndef WATER_RIBBON
  rip = wRingLayer( wp, W_RING_A, uRipplePhase.x, uRipplePhase.z, rpx );
      #ifdef WATER_MID
  rip = max( rip, wRingLayer( wp + vec2( 0.53, 0.29 ), W_RING_B, uRipplePhase.y, uRipplePhase.w, rpx ) );
      #endif
  rip *= mix( 1.0, 0.3 + 0.7 * ( 1.0 - smoothstep( 0.15, 0.9, wSd ) ), uRippleShore );
      #ifdef WATER_JOIN
  rip *= 1.0 - jW;   // (the rings stay on the pond; past the junction the stream draws chevrons)
      #endif
    #endif
  for ( int i = 0; i < 4; i++ ) { vec4 R = uRipple[ i ]; float age = mod( uRippleClock - R.z, 64.0 ); rip = max( rip, R.w * ( 1.0 - smoothstep( 0.0, 2.5, age ) ) * wRing( length( vWaterWorld.xz - R.xy ), 0.5 * age / ( age + 0.7 ), rpx ) ); }
    #if defined( WATER_RIBBON ) || defined( WATER_JOIN )
  float chv = wChevron( vWaterUv, nB, rpx );
      #ifdef WATER_MID
  chv = max( chv, 0.6 * wStreak( vWaterUv, nA, max( fwidth( vWaterUv.y ), 1e-5 ) ) );
      #endif
      #ifdef WATER_JOIN
  chv *= jW;
      #endif
  rip = max( rip, chv * 0.75 );   // (the chevrons a touch fainter than the rings: a hint of current, not arrows)
    #endif
  rip *= smoothstep( 0.03, 0.12, wSd );
  foam = max( foam, rip * W_RIP_STRENGTH );
  #endif
  wc = mix( wc, cFo, foam );
  // L4 alpha: carved 0.55 in the shallows -> 0.92 at 0.25 u, x a 0.04 u soft shore; virtual 0.96; foam raises it
  float aC = mix( 0.55, 0.92, smoothstep( 0.0, 0.25, wDepth ) ) * smoothstep( 0.0, 0.04, wSd );
  float aV = 0.96 * smoothstep( 0.0, 0.03, wSd );
  float wa = max( mix( aC, aV, wVirt ), foam * 0.95 * smoothstep( -0.03, 0.0, wSd ) );
  #ifdef WATER_RIBBON
  wa *= step( vWaterUv.x, uUStart + uFill * uLength + 0.001 );
  #endif
  diffuseColor.rgb = wc; diffuseColor.a *= wa;
  wFoamOut = foam; wNA = nA; wNB = nB; wDepthOut = wDepth; wSdOut = wSd; wFlowOut = wFlow; wBandOut = b1 + b2; wBrK = 1.0;
  #ifdef WATER_MID
  wGlintN = texture( uWaterNoise, ( wp + uGlintOff ) * 14.0 / ( W_CELL * 8.0 ) ).r * wFade( pxSd, 0.08 );
  #else
  wGlintN = 0.0;
  #endif
}
#endif`;
// L5 sky Fresnel + L6 glints, after lighting; debug views
export const WATER_LIGHT = `
#if !defined( WATER_FALL ) || defined( WATER_BRINK )
#if defined( WATER_FALL ) && !defined( WATER_MID )
// (rev 3, R3.1) phone: a fall's sky Fresnel only over its brink (F carries wBrK, 0 below it), so the rest of the sheet skips the block
// (no texture or derivative in it on phone: the branch is safe)
if ( wBrK > 0.0 )
#endif
{
  vec3 Vv = normalize( vViewPosition );
  vec3 Nw = normalize( vec3( ( wNA - 0.5 ) * 0.3, 1.0, ( wNB - 0.5 ) * 0.3 ) );
  vec3 Nv = normalize( ( viewMatrix * vec4( Nw, 0.0 ) ).xyz );
  float ndv = clamp( dot( Nv, Vv ), 0.0, 1.0 );
  // (tuning 1) over the deep core the body's own colour carries the read: F eases to 45 % there, toward a half-desaturated sky
  float wDeepF = mix( 1.0, 0.45, smoothstep( uBands.x, uBands.y + 0.08, wDepthOut ) );
  float F = min( ( 0.1 + 0.6 * ( 1.0 - ndv ) * ( 1.0 - ndv ) ) * uSkyMix / 0.25, 0.6 ) * wDeepF * ( 1.0 - wFoamOut ) * wBrK;   // (a fall's brink: only over its surface part)
  vec3 Rw = reflect( -normalize( cameraPosition - vWaterWorld ), Nw );
  vec3 wSky = mix( uSkyHorizon, uSkyZenith, smoothstep( 0.0, 0.75, Rw.y ) );
  float wSkyGrey = dot( wSky, vec3( 0.2126, 0.7152, 0.0722 ) );
  outgoingLight = mix( outgoingLight, mix( wSky, vec3( wSkyGrey ), 0.45 ), F );
  #if defined( WATER_MID ) && NUM_DIR_LIGHTS > 0
  // L6 glints (tuning 1): sparse, small, soft sparkles that cluster in the sun's reflection path (a broad lobe on the FLAT normal),
  // faded out once a 0.06 u sparkle would be under ~2.5 px (gone at the phone framing, ~0.07 u a pixel)
  vec3 Hv = normalize( directionalLights[ 0 ].direction + Vv );
  vec3 Nflat = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float wSunPath = pow( max( dot( Nflat, Hv ), 0.0 ), 60.0 );
  float wGlintPx = 1.0 - smoothstep( 0.022, 0.045, length( fwidth( vWaterWorld.xz ) ) );
  float sparkle = smoothstep( 0.9, 0.96, wGlintN ) * ( 0.03 + 0.97 * wSunPath );
  outgoingLight += directionalLights[ 0 ].color * uGlint * 0.5 * sparkle * wGlintPx * ( 1.0 - wFoamOut ) * smoothstep( 0.05, 0.15, wSdOut );
  #endif
}
#endif
#ifdef WATER_DEBUG
  #if WATER_DEBUG == 1
  outgoingLight = wRamp( clamp( wDepthOut / 0.5, 0.0, 1.0 ) );
  #elif WATER_DEBUG == 2
  outgoingLight = wSdOut > 0.0 ? vec3( 0.0, 0.3 + 0.7 * wSdOut, 1.0 * wSdOut ) : vec3( -wSdOut, 0.1, 0.0 ); if ( abs( wSdOut ) < 0.012 ) outgoingLight = vec3( 1.0 );
  #elif WATER_DEBUG == 3
  outgoingLight = vec3( 0.5 + wFlowOut.x * 6.0, 0.5 + wFlowOut.y * 6.0, 0.5 );
  #else
  outgoingLight = wBandOut < 0.5 ? vec3( 0.75, 0.9, 0.85 ) : wBandOut < 1.5 ? vec3( 0.35, 0.65, 0.65 ) : vec3( 0.1, 0.3, 0.45 );
  #endif
  diffuseColor.a = max( diffuseColor.a, 0.9 );
#endif`;
export const WATER_ANCHORS = Object.freeze({ vertCommon: '#include <common>', vertWorld: '#include <worldpos_vertex>', fragCommon: '#include <common>', color: '#include <color_fragment>', opaque: '#include <opaque_fragment>' });
const countOf2 = (s, sub) => s.split(sub).length - 1;
// string transform of a MeshLambertMaterial shader (onBeforeCompile): { vertexShader, fragmentShader, applied, misses }.
// opts: { kind: 'still' | 'ribbon' | 'fall', tier: 'phone' | 'mid', flow: bool, debug: 0-4 }. Every anchor must occur exactly once;
// otherwise nothing is changed (the host falls back to plain Lambert in the body's mid colour).
export function patchWaterLambert(vertexShader, fragmentShader, opts = {}) {
  const misses = [], A = WATER_ANCHORS;
  if (countOf2(fragmentShader, 'wFoamOut') > 0) misses.push('already patched');
  for (const [k, a, src] of [['vertCommon', A.vertCommon, vertexShader], ['vertWorld', A.vertWorld, vertexShader], ['fragCommon', A.fragCommon, fragmentShader], ['color', A.color, fragmentShader], ['opaque', A.opaque, fragmentShader]]) {
    const n = countOf2(src, a); if (n !== 1) misses.push(`${k} x${n}`);
  }
  if (misses.length) return { vertexShader, fragmentShader, applied: false, misses };
  const kind = opts.kind === 'fall' ? 'WATER_FALL' : opts.kind === 'ribbon' ? 'WATER_RIBBON' : 'WATER_STILL';
  const defs = [`#define ${kind}`, opts.tier === 'phone' ? '' : '#define WATER_MID', opts.flow ? '#define WATER_FLOW' : '', opts.join ? '#define WATER_JOIN' : '', opts.brink ? '#define WATER_BRINK' : '',
    opts.vhead ? '#define WATER_VHEAD' : '', opts.ripple && opts.kind !== 'fall' ? '#define WATER_RIPPLE' : '', opts.debug ? `#define WATER_DEBUG ${opts.debug | 0}` : ''].filter(Boolean).join('\n');
  const vs = vertexShader.replace(A.vertCommon, () => A.vertCommon + '\n' + WATER_VERT_PARS).replace(A.vertWorld, () => A.vertWorld + '\n' + WATER_VERT);
  const fs = fragmentShader.replace(A.fragCommon, () => A.fragCommon + '\n' + defs + '\n' + WATER_FRAG_PARS).replace(A.color, () => A.color + '\n' + WATER_COLOR).replace(A.opaque, () => WATER_LIGHT + '\n' + A.opaque);
  return { vertexShader: vs, fragmentShader: fs, applied: true, misses };
}

const WCORE = { RIPPLE, RIPPLE_BODIES, hash12, rippleRing, PALETTES, BODY_PALETTE, bodyColours, PHASE_USES, WATER_UNIFORMS, FLOW_CYCLE, PHASE_PERIODS, waterPhases, WATER_VERT_PARS, WATER_VERT, WATER_FRAG_PARS, WATER_COLOR, WATER_LIGHT, WATER_ANCHORS, patchWaterLambert, WATER_FORMAT, TEXEL, MARGIN, SUPERSAMPLE, SIZE_STEP, MAX_SIDE, SD_BLUR, NOISE_SIZE, encode, decode, ENCODING, BANDS, BAND_SOFT, NOISE_CELL, PHI, TIERS };
export default WCORE;
