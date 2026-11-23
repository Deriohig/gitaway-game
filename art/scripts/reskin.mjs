// reskin.mjs -- a free CC0 tree / bush (Quaternius Stylized Nature MegaKit: one node, one primitive per material, bark + alpha-cut
// leaf cards) -> a Gitaway game asset, repainted in the painterly style of the approved concepts (art/meshy/<folder>/source/concept_1.png).
//
// node reskin.mjs --recipe <id> [out.glb] [--far]   one model from lib/species.mjs (SPECIES or AUTUMN), by default to
//   art/reskin/<id>.glb; --far: a tree's far version too, beside it (<out>_far.glb, step 7)
// node reskin.mjs --all [--out <dir>]       every SPECIES and AUTUMN id into art/reskin/<id>.glb (or <dir>), and every tree's far version
//   into <id>_far.glb, a RESULT line each (the far version's under its `far` key)
// node reskin.mjs <src.gltf|glb> <out.glb> --id <id> --kind broad|conifer|bush --height H --cap N [--seed S] [--minKeep F] [--grow k|auto]
//   [--concept <art/meshy folder>] (for an id not in LOOKS) [--keepBark]   (ad hoc)
// Looks (LOOK_V1 / KIND_LOOK): every conifer keeps round 1's ramp ("the firs keep their ramp"), rebuilt round a straight trunk with
// its fronds evenly round it and painted shade to sun along each frond (step 3c, the owner on 2026-10-25: "weird and blotchy ... Just
// fix them"); every broadleaf and bush takes R1's (KIND_LOOK, the owner on round 2: "the color seems off", a flat lime), the
// flowering bush too (recoloured on the owner's "Yes, recolour it", its cards and blossom kept):
//   * the foliage ramp from the concept's own luminance bands (bandRamp): the mean hue, saturation AND value of its darkest 15 %, its
//     middle band and its brightest 15 % of foliage pixels, so each stop keeps the concept's hue for that band (deep cool teal-green
//     shadows, warm yellow-green tops), its brightness and saturation never lifted (tune.hueSpread: the birch's end hues pushed out);
//   * the atlas cells spread over the whole ramp (R1_WINDOWS) in equal shares, a card's cell by its light (lightR1: height in the crown,
//     its normal, how far out, its height within its own clump), so undersides and inner cards reach the deep stop and only the outer
//     and upper ones the sunlit stop;
//   * the ramp interpolated in hue / saturation / value between the stops (an RGB blend loses the teal shadows at once);
//   * broad: hidden bark leaves (step 0), leaves two-sided by duplicated faces (dupLeaves), a 60 % card floor; tune.trim thins to fewer,
//     bigger cards (R1's trim); bush (and tune.sides 'faceOut'): the leaves single-faced, wound outward, on a single-sided material
//   * autumn (AUTUMN): the species' geometry byte for byte (its own seed), the foliage on autumnStops(hue); birch: the bark repainted
//     white with dark marks (paintBirchBark); overlays (OVERLAY: apples in `Canopy`, berries on the bush) as a second primitive
//   0. (broad) hidden bark: in the source's frame, whole bark components (never the trunk: the one holding the lowest bark vertex) whose
//      vertices lie >= 90 % inside the leaf cards' convex hull shrunk 10 % toward the crown centroid, none below the lowest leaf, leave
//      (tune.trunkOnly: every component but the trunk leaves)
//   1. normalise: node transforms baked; uniform scale to height H; base on y 0; x, z centred on the trunk axis (the centroid of the
//      vertices in the bottom 10 % of the height)
//   2. split for the game's wind sway (src/world/composition.ts modelParts / inCrown, Composed.tsx: one InstancedMesh per three.js Mesh,
//      the crown swaying about its mesh's own origin, wind.ts sway): broad = <id> (bark mesh) > `Canopy` (leaf mesh, its pivot on the
//      trunk axis at the leaves' lowest y, vertices relative to it); conifer = <id> > `Crown` (no mesh, at the pivot) > `Canopy`
//      (translation 0); bush = one node <id> (the game draws bushes still), its leaves and flowers packed into ONE atlas, one primitive,
//      one material. Every mesh holds exactly one primitive
//   3. thin to the cap: whole leaf cards (welded connected components) leave, seeded and deterministic, INTERIOR first (nearest the
//      crown's centroid, by the crown's own proportions) so the silhouette survives, only until the total is <= N (a card that fits the
//      slack comes back); never below --minKeep of the source's cards (broad / conifer 0.6, bush 0; when that floor stops it first:
//      an error); bark is never removed. A bush's leaves and flowers thin together, each keeping the same share
//   3b. grow: the kept cards scale about their own centres by sqrt(source foliage tris / kept), at most 1.5 (--grow; 1 = off), so the
//      thinned crown covers what the full one did (the bush keeps 44 % of its cards); then normalised again
//   4. repaint, every texture's ALPHA KEPT EXACTLY (lib/png.mjs resizeBilinear; RGB resized premultiplied, so the clear texels' colour
//      does not fringe the edges): RGB from a gradient map (per-texel luminance normalised to the texture's opaque p5..p95, onto a
//      3-stop ramp from the concept: R1 (broadleaf, bushes) its foliage's luminance bands (bandRamp, above), never lifted; round 1's
//      look (LOOK_V1: the conifers) and every bark the 10th / 50th / 90th luminance percentiles of its foliage / bark pixels, each stop
//      the median hue / saturation / value there (sampleRamp), round 1's foliage then lifted by FOLIAGE_LIFT), then painterly
//      variation: low-frequency value noise +-6 % and fine grain +-3 % (tileable: the textures repeat). The MegaKit's leaf textures are
//      FLAT colour (one green, luminance sd 0), so a leaf texture's luminance is painted from its alpha shape first: each leaf a soft
//      dome lit from the upper left, softly folded on its long axis, a conifer frond with needle streaks.
//      The leaf texture is a 2 x 2 atlas of the leaf picture painted through four windows of the ramp, shade to sun (R1: R1_WINDOWS;
//      round 1: WINDOWS); the kept cards take them by rank of their light (R1: lightR1; round 1: height in the crown, how far out, a
//      seeded jitter): the concepts' sunlit yellow-green tops and deep green undersides. Flowers keep their own hue structure,
//      shifted onto the concept's pink (and a cream copy for a seeded third of the clusters). Colour bleeds outward under the clear
//      texels (no dark mipmap halos)
//      leaves: PNG with alpha <= 512 px (CLAMP: an atlas), MASK at the source's cutoff (or 0.4), doubleSided as the source, metallic 0,
//      roughness 1; bark: JPEG q85 <= 512 px, OPAQUE. Materials <id>_bark / <id>_leaves (bush: <id>). The source's COLOR_0 (bark: a
//      baked grey occlusion ramp, leaves: all 1) and normal maps are dropped
//   5. checks the triangle limits (the cap; with --far, the far version's target, FAR_MAX) BEFORE writing anything, then writes core
//      glTF (no extensions), near then far; 6. prints one `RESULT {json}` line
//   7. (task 11b, trees, --far / --all) the far version <id>_far.glb from the same build, for distant trees and low-power draws: the
//      trunk alone, simplified (simplifyMesh); the leaf cards thinned to FAR.cards (0.37) of the near's, the least seen from the game
//      camera first (cardCoverage), grown <= 1.5 x into the crown (the outline and height kept); conifers keep every frond, simplified
//      in one pass with none below FIR.farFloor (species `far`), on a six-sided tube along the straight trunk (farTrunk); tree_fruit 6 apples; the same materials (names, alpha, sampler), each texture box-downsampled to 256 px
//      (FAR_TEX, ruling R20: self-contained); the same pivot and nodes (<id>_far > [Crown >] Canopy); at most FAR_MAX triangles
//      (broadleaf 1,000, conifers and the sapling 500)
// node reskin.mjs --ramp <concept.png> <foliage|bark|barkGrey|pink|cream>   prints a sampled ramp (for checking)
// node reskin.mjs --bands <concept.png>   prints R1's band ramp and the concept foliage's luminance p10 / p90
// node reskin.mjs --freeze-stats [--out file]   writes every number the build reads from the concept images (every concept folder of
//   lib/species.mjs; all its images must be present, and the pack: a bush's source glTF says whether it has flowers) into
//   art/reskin/concept-stats.json (ruling R23)
// Inputs (ruling R23), outside git: MEGAKIT_DIR = the unpacked MegaKit (default ~/Downloads/assets/quaternius-megakit/unpacked; its
//   glTF/ folder is PACK), CONCEPTS_DIR = the concept folders (default art/meshy). A concept image that is absent is read from its
//   frozen numbers in art/reskin/concept-stats.json, which give byte-identical models (tests/reskin.test.mjs RS11); RESULT.concepts
//   says which each build read
import { Document, NodeIO } from '@gltf-transform/core';
import jpeg from 'jpeg-js';
import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePNG, encodePNG, resizeBilinear, crop } from './lib/png.mjs';
import { SPECIES, AUTUMN } from './lib/species.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// the inputs (ruling R23), neither in git: MEGAKIT_DIR = the unpacked MegaKit download (its glTF/ folder holds the sources;
// art/reskin/SOURCES.md has the zip's sha256), CONCEPTS_DIR = the concept folders (<dir>/<folder>/source/concept_1.png). A concept
// image that is absent is read from its frozen numbers, CONCEPT_STATS (written by --freeze-stats from the images)
export const PACK = path.join(process.env.MEGAKIT_DIR ?? '/home/me/Downloads/assets/quaternius-megakit/unpacked', 'glTF');
export const CONCEPTS = process.env.CONCEPTS_DIR ? path.resolve(process.env.CONCEPTS_DIR) : path.join(here, '..', 'meshy');
const RESKIN = path.join(here, '..', 'reskin');
export const CONCEPT_STATS = path.join(RESKIN, 'concept-stats.json');
// the concept each probe id is painted from (art/meshy/<folder>/source/concept_1.png); `barkPart: 'barkGrey'` = the beech's silvery bark
export const LOOKS = {
  tree_round_a: { foliage: 'tree_oak', bark: 'tree_oak' },
  tree_round_b: { foliage: 'tree_beech', bark: 'tree_beech', barkPart: 'barkGrey' },
  tree_pine_a: { foliage: 'tree_fir', bark: 'tree_fir' },
  bush_flowering: { foliage: 'bush_flowering', flowers: 'bush_flowering' },
};
const LEAF_MAX = 512, BARK_MAX = 512, BARK_Q = 85, ATLAS = 512;
const NOISE = 0.06, GRAIN = 0.03;
const FOLIAGE_LIFT = { s: 1.15, v: 1.1 };
// per kind: how the foliage ramp is made (round 1: the concept percentiles its three stops are taken at, and the lift on them; R1:
// 'bands', bandRamp), the atlas cells' ramp windows (null: WINDOWS), the shares of the kept leaf cards in the cells (shade .. sun, by
// rank of their light), which light (v1: height and how far out; r1: lightR1), the leaf-card floor, whether hidden bark leaves, the
// leaves two-sided by duplicated faces, and (bush) the atlas cell size.
// LOOK_V1: round 1, the owner-approved fir and flowering bush, byte for byte (every conifer takes it: "the firs keep their ramp").
// The conifers keep round 1's ramp (pct, lift) but not its geometry or its cells (the owner, 2026-10-25: the firs "look weird and
// blotchy and unnatural. They don't have a consistent shape all around, and look warped" ... "Just fix them"): rebuilt around a
// straight trunk (rebuild: FIR, step 3c), the cells by height alone on narrow, overlapping windows (FIR_WINDOWS, light 'fir': no
// jitter), and every frond painted shade to sun along its own length (along: the trunk end deep, the tip sunlit)
const LOOK_V1 = {
  conifer: { pct: [0.1, 0.5, 0.9], lift: FOLIAGE_LIFT, windows: 'fir', shares: [0.25, 0.25, 0.25, 0.25], light: 'fir', minKeep: 0.6, hideBark: false, dupLeaves: false, rebuild: true, along: 0.6 },
  bush: { pct: [0.1, 0.5, 0.9], lift: FOLIAGE_LIFT, windows: null, shares: [0.25, 0.25, 0.25, 0.25], light: 'v1', minKeep: 0, hideBark: false, dupLeaves: false },
};
// R1 (the owner on round 2: "They look good but the color seems off": round 2's crowns a flat, uniform lime): the concept's own
// luminance bands, cells spread over the whole ramp in equal shares (the texture's luminance spread then follows the concept's), lit by
// lightR1. Windows tuned so the leaf texture's luminance p10 / p90 land on the concept foliage's (RS4c), the sunlit cell reaching the
// concept's own brightest band (its p90, never above: the game-light renders read dull with the sun cell at [0.58, 1])
export const R1_WINDOWS = [[0, 0.34], [0.16, 0.62], [0.44, 0.9], [0.7, 1]];
const KIND_LOOK = {
  broad: { ramp: 'bands', interp: 'hsv', windows: R1_WINDOWS, shares: [0.25, 0.25, 0.25, 0.25], light: 'r1', minKeep: 0.6, hideBark: true, dupLeaves: true },
  conifer: LOOK_V1.conifer,
  bush: { ramp: 'bands', interp: 'hsv', windows: R1_WINDOWS, shares: [0.25, 0.25, 0.25, 0.25], light: 'r1', minKeep: 0, hideBark: false, dupLeaves: false, faceOut: true, oneSided: true, cell: 256 },
};
// dupLeaves (broadleaf, round 2): the leaf cards two-sided by DUPLICATED faces (each triangle again, wound the other way, the same
// outward-leaning normals) on a single-sided material, as lib/plantkit.mjs does. A doubleSided material flips a card's normal on its
// back face, and under the game's noon light (sun x 1.9, a brown hemisphere ground) every card seen from behind went near black: the
// round-1 broadleaf's "dark, scrappy" speckle (the game-light forest sheet shows it). It costs twice the leaf triangles.
// hidden bark: a bark component (not the trunk) leaves when >= HIDE_IN of its vertices lie inside the leaf cards' convex hull shrunk by
// HIDE_SHRINK toward the crown centroid, and none lies below the lowest leaf (a branch seen under the crown stays)
export const HIDE_IN = 0.9, HIDE_SHRINK = 0.1;
// FIR (step 3c, every conifer): the fir rebuilt from its source's own frond cards around a straight trunk. barkMin = the fewest
// triangles the trunk is simplified to (it takes the cap's slack above that); minFronds = the share of the source's fronds that must
// stay (never thinned harder: round 1 kept 32 of Pine_5's 53, grown 1.29 x); slabs = the height slabs the trunk's centre line is
// measured in; jitterAz (deg) / jitterLen = the seeded spread on each frond's azimuth and its reach on the cone; tip = the
// cone's reach at the top of the leaves (a share of its base reach); scale = the least and most a frond is scaled to reach the cone; maxRise (deg) =
// the steepest a frond may rise, trunk end to tip, topDroop (deg) = the steepest one in the top topBand of the crown may hang; trunkTop =
// where the trunk ends, a share of the way from the lowest frond to the top; whorl = the lowest fronds set evenly round as one whorl;
// widen = each frond's width across, horizontally, over the source's; tries = the seeded layouts tried, the most even kept (crownEvenness), of the farTries most even near also simplified as far;
// farFloor = the fewest triangles the far version simplifies a frond to [below, in the top topBand] (the small top fronds went first)
export const FIR = { barkMin: 180, minFronds: 0.85, slabs: 24, jitterAz: 6, jitterLen: 0.05, tip: 0.3, scale: [0.35, 1.6], maxRise: 22, topBand: 0.2, topDroop: 18, trunkTop: 0.8, whorl: 6, widen: 1.45, tries: 24, farTries: 6, farFloor: [6, 10] };
export const GOLDEN = 180 * (3 - Math.sqrt(5));   // 137.508 deg: consecutive fronds this far apart cover the circle evenly at any height
// the fir atlas's cells, shade to sun: narrow and overlapping (round 1's WINDOWS spread one flat tone per frond over 2 x in luminance),
// a touch deeper than its middle: without the bands of shadow the canopy no longer takes (src/world/composedLight.ts) the crown keeps its value
export const FIR_WINDOWS = [[0, 0.56], [0.1, 0.68], [0.2, 0.8], [0.3, 0.92]];

// ---- seeded randomness and smooth noise (as lib/plantkit.mjs, which keeps them private) + a tileable value noise ----
const seedOf = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash2 = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x, y, s) => { const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  return (hash2(x0, y0, s) * (1 - sx) + hash2(x0 + 1, y0, s) * sx) * (1 - sy) + (hash2(x0, y0 + 1, s) * (1 - sx) + hash2(x0 + 1, y0 + 1, s) * sx) * sy; };
// value noise on a P x Q lattice that wraps (u, v in 0..1 of the texture): seamless where a texture repeats
const tnoise = (u, v, P, Q, s) => { const x = u * P, y = v * Q, x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const m = (a, n) => ((a % n) + n) % n, h = (i, j) => hash2(m(i, P), m(j, Q), s);
  return (h(x0, y0) * (1 - sx) + h(x0 + 1, y0) * sx) * (1 - sy) + (h(x0, y0 + 1) * (1 - sx) + h(x0 + 1, y0 + 1) * sx) * sy; };

// ---- colour ----
const lumOf = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255]; };
const rgbOf = (h, s, v) => { h = ((h % 360) + 360) % 360 / 60; const i = Math.floor(h) % 6, f = h - Math.floor(h), p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i].map((c) => c * 255); };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const median = (a) => { const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };
// circular median of hues: rotated so their circular mean sits at 180, the plain median, rotated back
const medianHue = (hs) => { let x = 0, y = 0; for (const h of hs) { x += Math.cos(h * Math.PI / 180); y += Math.sin(h * Math.PI / 180); }
  const off = 180 - Math.atan2(y, x) * 180 / Math.PI; return ((median(hs.map((h) => (((h + off) % 360) + 360) % 360)) - off) % 360 + 360) % 360; };
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

// ---- concept ramps ----
// which concept pixels count: foliage greens (the yellow-green tops to the teal shade), brown bark, the beech's warm silver-grey bark,
// the bush's pink and cream blossom; never the flat grey background (within 14 of the corners' median colour)
const SELECT = {
  foliage: (h, s, v) => h >= 55 && h <= 175 && s >= 0.18 && v >= 0.1,
  bark: (h, s, v) => h >= 8 && h <= 40 && s >= 0.3 && v >= 0.12 && v <= 0.92,
  barkGrey: (h, s, v) => h >= 20 && h <= 75 && s >= 0.05 && s <= 0.35 && v >= 0.3 && v <= 0.93,
  pink: (h, s, v) => (h >= 330 || h <= 15) && s >= 0.2 && v >= 0.55,
  cream: (h, s, v) => h >= 30 && h <= 62 && s >= 0.06 && s <= 0.32 && v >= 0.8,
};
const conceptCache = new Map();
/**
 * A 3-stop ramp from a concept image: the colour at the 10th / 50th / 90th (or `pct`) luminance percentile of the selected pixels.
 * `pct` may also be { hue: [3], value: [3] }: each stop's hue and saturation from one percentile, its value from another (a stop as
 * green as the concept's middle, as bright as its sunlit tops).
 */
export function sampleRamp(png, part, pct = [0.1, 0.5, 0.9]) {
  if (!SELECT[part]) throw new Error('sampleRamp: unknown part ' + part);
  const ph = Array.isArray(pct) ? pct : pct.hue, pv = Array.isArray(pct) ? pct : pct.value;
  if (ph.length !== 3 || pv.length !== 3 || [...ph, ...pv].some((p) => !(p >= 0.02 && p <= 0.98))) throw new Error('sampleRamp: three percentiles in 0.02..0.98');
  let img = conceptCache.get(png); if (!img) conceptCache.set(png, (img = decodePNG(fs.readFileSync(png))));
  const { width: W, height: H, data: D } = img, corner = [];
  for (const [cx, cy] of [[0, 0], [W - 16, 0], [0, H - 16], [W - 16, H - 16]]) for (let y = cy; y < cy + 16; y++) for (let x = cx; x < cx + 16; x++) corner.push((y * W + x) * 4);
  const bg = [0, 1, 2].map((k) => corner.map((o) => D[o + k]).sort((a, b) => a - b)[corner.length >> 1]);
  const px = [];
  for (let o = 0; o < D.length; o += 4) {
    const r = D[o], g = D[o + 1], b = D[o + 2]; if (Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) < 14) continue;
    const [h, s, v] = hsv(r, g, b); if (SELECT[part](h, s, v)) px.push([lumOf(r, g, b), r, g, b]);
  }
  if (px.length < 200) throw new Error(`sampleRamp: only ${px.length} ${part} pixels in ${png}`);
  px.sort((a, b) => a[0] - b[0]);
  // a stop's colour: the median hue, saturation and value of the pixels within 2 percentiles of it (not their mean RGB: the mean of a
  // yellow-green and a teal at the same luminance is a muddy olive)
  const band = (p) => { const a = Math.floor((p - 0.02) * px.length), b = Math.ceil((p + 0.02) * px.length), hs = [], ss = [], vs = [];
    for (let i = a; i < b; i++) { const [h, s2, v] = hsv(px[i][1], px[i][2], px[i][3]); hs.push(h); ss.push(s2); vs.push(v); }
    return { h: medianHue(hs), s: median(ss), v: median(vs) }; };
  const stop = (k) => { const c = band(ph[k]), v = ph[k] === pv[k] ? c.v : band(pv[k]).v; return rgbOf(c.h, c.s, v).map(Math.round); };
  let mean = 0; for (const p of px) mean += p[0]; mean /= px.length; let sd = 0; for (const p of px) sd += (p[0] - mean) ** 2; sd = Math.sqrt(sd / px.length);
  return { stops: [stop(0), stop(1), stop(2)], sd, n: px.length };
}
const rampAt = (stops, t) => { const [a, b, u] = t < 0.5 ? [stops[0], stops[1], t * 2] : [stops[1], stops[2], t * 2 - 1]; return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u); };
// circular mean of hues (degrees)
const meanHue = (hs) => { let x = 0, y = 0; for (const h of hs) { x += Math.cos(h * Math.PI / 180); y += Math.sin(h * Math.PI / 180); } return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360; };
/**
 * R1's foliage ramp (the owner's colour note): the concept's foliage pixels (as sampleRamp selects them) sorted by luminance; each stop
 * the MEAN hue (circular), saturation and value of a band: the darkest 15 %, the middle band (42.5..57.5 %) and the brightest 15 %. So
 * every stop carries the concept's own hue for that band (its deep cool teal-green shadows, its warm yellow-green sunlit tops), and its
 * brightness and saturation, never lifted. Also the pixels' luminance p10 / p90 (what RS4c holds the leaf texture to).
 */
export function bandRamp(png, part = 'foliage', spread = 1) {
  if (!SELECT[part]) throw new Error('bandRamp: unknown part ' + part);
  const m = measureBands(png, part);
  return { ...spreadStops(m.bands, spread), p10: m.p10, p90: m.p90, n: m.n };
}
// the bands' stops: spread (tune.hueSpread, > 1): the end stops' hues pushed further from the middle stop's. The linear 3-stop ramp keeps
// ~85 % of a concept's shadow-to-sun hue gap in the painted texture; a concept whose gap is small to begin with (the birch's olive
// shadows, 21.6 deg) needs it back to stay "like the concept" (RS4c)
function spreadStops(raw, spread) {
  if (!(spread >= 1 && spread <= 1.5)) throw new Error('bandRamp: hue spread 1..1.5');
  const bands = raw.map((b) => ({ h: b.h, s: b.s, v: b.v }));
  if (spread !== 1) for (const k of [0, 2]) { const d = ((bands[k].h - bands[1].h + 540) % 360) - 180; bands[k] = { ...bands[k], h: (bands[1].h + d * spread + 360) % 360 }; }
  return { stops: bands.map((c) => rgbOf(c.h, c.s, c.v).map(Math.round)), bands };
}
// bandRamp's measurement: the raw bands (no spread), the luminance p10 / p90 and gap20 (the circular mean hue of the darkest 20 % of the
// pixels minus that of the brightest 20 %: the concept's own shadow-to-sun hue gap, what tests/reskin.test.mjs RS4c holds the texture to)
function measureBands(png, part) {
  let img = conceptCache.get(png); if (!img) conceptCache.set(png, (img = decodePNG(fs.readFileSync(png))));
  const { width: W, height: H, data: D } = img, corner = [];
  for (const [cx, cy] of [[0, 0], [W - 16, 0], [0, H - 16], [W - 16, H - 16]]) for (let y = cy; y < cy + 16; y++) for (let x = cx; x < cx + 16; x++) corner.push((y * W + x) * 4);
  const bg = [0, 1, 2].map((k) => corner.map((o) => D[o + k]).sort((a, b) => a - b)[corner.length >> 1]);
  const px = [];
  for (let o = 0; o < D.length; o += 4) {
    const r = D[o], g = D[o + 1], b = D[o + 2]; if (Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) < 14) continue;
    const c = hsv(r, g, b); if (SELECT[part](...c)) px.push([lumOf(r, g, b), ...c]);
  }
  if (px.length < 200) throw new Error(`bandRamp: only ${px.length} ${part} pixels in ${png}`);
  px.sort((a, b) => a[0] - b[0]);
  const band = (a, b) => { const s = px.slice(Math.floor(a * px.length), Math.ceil(b * px.length)); let ss = 0, vv = 0; for (const p of s) { ss += p[2]; vv += p[3]; }
    return { h: meanHue(s.map((p) => p[1])), s: ss / s.length, v: vv / s.length }; };
  const bands = [band(0, 0.15), band(0.425, 0.575), band(0.85, 1)], at = (p) => px[Math.min(px.length - 1, Math.floor(p * px.length))][0], n = px.length;
  const gap20 = ((meanHue(px.slice(0, Math.floor(0.2 * n)).map((p) => p[1])) - meanHue(px.slice(Math.floor(0.8 * n)).map((p) => p[1])) + 540) % 360) - 180;
  return { bands, p10: at(0.1), p90: at(0.9), n, gap20 };
}

// ---- the concepts' numbers (ruling R23): measured from the image when it is present, else its frozen copy in CONCEPT_STATS ----
const conceptPng = (folder) => path.join(CONCEPTS, folder, 'source', 'concept_1.png');
const PCT = [0.1, 0.5, 0.9];
let FROZEN = null; const READ = new Map();   // READ: the concept folders the current build read, each 'png' or 'frozen' (RESULT.concepts)
function frozenStats(folder, part) {
  if (!FROZEN) FROZEN = fs.existsSync(CONCEPT_STATS) ? JSON.parse(fs.readFileSync(CONCEPT_STATS, 'utf8')).folders || {} : {};
  const v = FROZEN[folder] && FROZEN[folder][part];
  if (!v) throw new Error(`missing concept ${conceptPng(folder)}, and no frozen '${part}' numbers for ${folder} in ${CONCEPT_STATS} (node reskin.mjs --freeze-stats writes them from the images)`);
  READ.set(folder, 'frozen'); return v;
}
/** A concept folder's 3-stop ramp of `part` (sampleRamp at `pct`): from its image, or, the image absent, from CONCEPT_STATS (which holds
 * the default percentiles only). { stops, sd, n } */
export function conceptRamp(folder, part, pct = PCT) {
  const png = conceptPng(folder);
  if (fs.existsSync(png)) { READ.set(folder, 'png'); return sampleRamp(png, part, pct); }
  if (!Array.isArray(pct) || pct.join() !== PCT.join()) throw new Error(`conceptRamp: ${png} is absent, and its frozen numbers hold the ${PCT.join(' / ')} percentiles only`);
  const f = frozenStats(folder, part); return { stops: f.stops.map((s) => s.slice()), sd: f.sd, n: f.n };
}
/** A concept folder's foliage band ramp (bandRamp, its hues spread by `spread`): from its image, or from CONCEPT_STATS. */
export function conceptBands(folder, spread = 1) {
  const png = conceptPng(folder);
  if (fs.existsSync(png)) { READ.set(folder, 'png'); return bandRamp(png, 'foliage', spread); }
  const f = frozenStats(folder, 'foliage'); return { ...spreadStops(f.bands, spread), p10: f.p10, p90: f.p90, n: f.n };
}
// a source model with a flower primitive (a material named *flower*, as build() splits them): its bush reads the pink and cream stops
const sourceHasFlowers = (source) => (JSON.parse(fs.readFileSync(path.join(PACK, source + '.gltf'), 'utf8')).materials || []).some((m) => /flower/i.test(m.name || ''));
/**
 * The text of CONCEPT_STATS: every number the build (and tests/reskin.test.mjs RS4) reads from a concept image, per concept folder of
 * lib/species.mjs, measured from the images (each must be present): foliage = sampleRamp at the default percentiles (stops, sd, n)
 * + bandRamp's raw bands, p10 / p90 and gap20; bark / barkGrey (the folders a species' bark is painted from) and pink / cream (a
 * flowering bush's folder) = sampleRamp (stops, sd, n); png = the image's size and sha256. Deterministic.
 */
export function freezeStats() {
  const need = new Map(), add = (f, part) => { if (!need.has(f)) need.set(f, new Set()); need.get(f).add(part); };
  for (const s of SPECIES) { add(s.ramp, 'foliage'); if (s.barkRamp) add(s.barkRamp, s.barkPart || 'bark'); if (s.kind === 'bush' && sourceHasFlowers(s.source)) { add(s.ramp, 'pink'); add(s.ramp, 'cream'); } }
  const folders = {};
  for (const f of [...need.keys()].sort()) {
    const png = conceptPng(f); if (!fs.existsSync(png)) throw new Error('--freeze-stats: missing concept ' + png);
    const bytes = fs.readFileSync(png), o = { png: { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') } };
    for (const part of Object.keys(SELECT).filter((p) => need.get(f).has(p))) {
      const r = sampleRamp(png, part); o[part] = { stops: r.stops, sd: r.sd, n: r.n };
      if (part === 'foliage') { const m = measureBands(png, part); Object.assign(o[part], { bands: m.bands, p10: m.p10, p90: m.p90, gap20: m.gap20 }); }
    }
    folders[f] = o;
  }
  const about = 'reskin.mjs --freeze-stats: the numbers the build (and tests/reskin.test.mjs) reads from each concept image, art/meshy/<folder>/source/concept_1.png '
    + '(git-ignored), frozen so the build runs without them; reskin.mjs measures an image that is present and reads these for one that is absent. foliage: sampleRamp '
    + 'at the 10 / 50 / 90 % luminance percentiles (stops, sd, n), bandRamp\'s raw bands (mean hue, saturation, value of the darkest 15 %, the middle 15 % and the '
    + 'brightest 15 % of the foliage pixels), their luminance p10 / p90, and gap20 (the darkest 20 %\'s mean hue minus the brightest 20 %\'s); bark, barkGrey, pink, '
    + 'cream: sampleRamp stops, sd, n; png: the image\'s size and sha256.';
  // (indented; an array of numbers or an object of numbers on one line)
  return JSON.stringify({ about, folders }, null, 2).replace(/\[\s+([-\d.e+]+(?:,\s+[-\d.e+]+)*)\s+\]/g, (m, inner) => `[${inner.split(/,\s+/).join(', ')}]`)
    .replace(/\{\s+("\w+": [-\d.e+]+(?:,\s+"\w+": [-\d.e+]+)*)\s+\}/g, (m, inner) => `{ ${inner.split(/,\s+/).join(', ')} }`) + '\n';
}
/** An autumn ramp around `hue`: deep (value 0.35), mid (0.6), sunlit (0.85), saturation 0.7 / 0.64 / 0.56, the hue a touch redder in the
 * shade and yellower in the sun (warm and soft, never neon). */
export const autumnStops = (hue) => [rgbOf(hue - 6, 0.7, 0.35), rgbOf(hue, 0.64, 0.6), rgbOf(hue + 6, 0.56, 0.85)].map((c) => c.map(Math.round));

// ---- image helpers: { width, height, data: Uint8Array RGBA } ----
function decodeImage(bytes, mime) {
  if (mime === 'image/png') return decodePNG(Buffer.from(bytes));
  const j = jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 }); return { width: j.width, height: j.height, data: j.data };
}
const fitSize = (w, h, max) => { const k = Math.min(1, max / Math.max(w, h)); return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]; };
// resize with the alpha exactly as lib/png.mjs resizeBilinear gives it, the colour premultiplied (clear texels do not bleed into edges)
function resizeKeepAlpha(img, w, h) {
  const pm = new Uint8Array(img.data.length);
  for (let o = 0; o < pm.length; o += 4) { const a = img.data[o + 3]; for (let k = 0; k < 3; k++) pm[o + k] = Math.round(img.data[o + k] * a / 255); pm[o + 3] = a; }
  const r = resizeBilinear({ width: img.width, height: img.height, data: pm }, w, h), plain = resizeBilinear(img, w, h);
  for (let o = 0; o < r.data.length; o += 4) { const a = r.data[o + 3];
    for (let k = 0; k < 3; k++) r.data[o + k] = a ? clamp255(r.data[o + k] * 255 / a) : plain.data[o + k]; }
  return r;
}
// the colour of every texel not in `done` grown outward from its painted neighbours, one ring a pass; the rest take the mean
function bleed(img, done) {
  const { width: w, height: h, data: d } = img; let todo = []; for (let i = 0; i < w * h; i++) if (!done[i]) todo.push(i);
  for (let pass = 0; pass < 96 && todo.length; pass++) {
    const next = [], fill = [];
    for (const i of todo) { const x = i % w, y = (i / w) | 0; let r = 0, g = 0, b = 0, m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (!done[j]) continue; r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; m++; }
      if (m) fill.push(i, r / m, g / m, b / m); else next.push(i); }
    for (let k = 0; k < fill.length; k += 4) { const i = fill[k]; d[i * 4] = Math.round(fill[k + 1]); d[i * 4 + 1] = Math.round(fill[k + 2]); d[i * 4 + 2] = Math.round(fill[k + 3]); done[i] = 1; }
    todo = next;
  }
  if (todo.length) { const m = [0, 0, 0]; let n = 0; for (let i = 0; i < w * h; i++) if (done[i]) { for (let k = 0; k < 3; k++) m[k] += d[i * 4 + k]; n++; }
    for (const i of todo) for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.round(m[k] / (n || 1)); }
}
// painterly variation on the painted texels: low-frequency value noise (two octaves, tileable) +-NOISE, per-texel grain +-GRAIN
function paintNoise(img, mask, seed, cells = 6) {
  const { width: w, height: h, data: d } = img;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!mask[i]) continue;
    const u = (x + 0.5) / w, v = (y + 0.5) / h;
    const lf = (tnoise(u, v, cells, cells, seed) - 0.5) * 2 * 0.65 + (tnoise(u, v, cells * 3, cells * 3, seed + 1) - 0.5) * 2 * 0.35;
    const k = (1 + NOISE * lf) * (1 + GRAIN * (hash2(x, y, seed + 7) - 0.5) * 2);
    for (let c = 0; c < 3; c++) d[i * 4 + c] = clamp255(d[i * 4 + c] * k); }
}
// R1: the ramp interpolated in hue / saturation / value (the hue the short way round), not RGB: between a dark teal stop and a far
// brighter green one, an RGB blend takes the green's hue almost at once (the brighter colour's channels dominate), so the painted
// shadows lost the concept's teal 40 % up the ramp; the concept's hue moves through its luminance gradually
const rampAtHSV = (stops, t) => { const [a, b, u] = t < 0.5 ? [stops[0], stops[1], t * 2] : [stops[1], stops[2], t * 2 - 1], A = hsv(...a), B = hsv(...b);
  const dh = ((B[0] - A[0] + 540) % 360) - 180; return rgbOf(A[0] + dh * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u); };
// the gradient map: luminance normalised to the masked texels' p5..p95, onto the ramp (or onto its window [a, b]); interp 'hsv' (R1)
// (along, the firs: { map, weight }: t moved toward map[i], each texel's place along its frond, trunk end 0 .. tip 1, by weight)
function gradientMap(img, lum, mask, stops, win = [0, 1], interp = 'rgb', along = null) {
  const vals = []; for (let i = 0; i < lum.length; i++) if (mask[i]) vals.push(lum[i]); vals.sort((a, b) => a - b);
  const p5 = vals[Math.floor(vals.length * 0.05)], p95 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))], span = p95 - p5 || 1, at = interp === 'hsv' ? rampAtHSV : rampAt;
  for (let i = 0; i < lum.length; i++) { if (!mask[i]) continue; let t = Math.max(0, Math.min(1, (lum[i] - p5) / span)); if (along) t = t * (1 - along.weight) + along.map[i] * along.weight;
    const c = at(stops, win[0] + (win[1] - win[0]) * t);
    for (let k = 0; k < 3; k++) img.data[i * 4 + k] = clamp255(c[k]); }
  return { p5, p95 };
}

// a leaf texture's luminance, painted from its alpha shape (the MegaKit's leaf textures are one flat colour): every leaf (a connected
// blob of alpha >= 128) a soft dome lit from the upper left, folded on its long axis (the half toward the light lit), its heart a touch
// lighter; a conifer frond also streaked along its length (needle clumps). Softened by a small blur. NaN outside the leaves.
function leafLuma(img, conifer, seed) {
  const { width: w, height: h, data: d } = img, N = w * h, inside = new Uint8Array(N);
  for (let i = 0; i < N; i++) inside[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  // chamfer distance (1, sqrt 2) to the nearest clear texel (beyond the border counts as clear)
  const D = new Float32Array(N), S2 = Math.SQRT2, at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : D[y * w + x]);
  for (let i = 0; i < N; i++) D[i] = inside[i] ? 1e9 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!inside[i]) continue; D[i] = Math.min(D[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + S2, at(x + 1, y - 1) + S2); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!inside[i]) continue; D[i] = Math.min(D[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + S2, at(x - 1, y + 1) + S2); }
  // blobs (4-connected): size, centroid, long axis (PCA), the greatest depth
  const lab = new Int32Array(N).fill(-1), blobs = [];
  for (let i0 = 0; i0 < N; i0++) { if (!inside[i0] || lab[i0] >= 0) continue; const b = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, dmax: 1 }, st = [i0]; lab[i0] = blobs.length;
    while (st.length) { const i = st.pop(), x = i % w, y = (i / w) | 0; b.n++; b.sx += x; b.sy += y; b.sxx += x * x; b.syy += y * y; b.sxy += x * y; b.dmax = Math.max(b.dmax, D[i]);
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && inside[j] && lab[j] < 0) { lab[j] = blobs.length; st.push(j); } }
    b.cx = b.sx / b.n; b.cy = b.sy / b.n; const cxx = b.sxx / b.n - b.cx * b.cx, cyy = b.syy / b.n - b.cy * b.cy, cxy = b.sxy / b.n - b.cx * b.cy;
    const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy), tr = (cxx + cyy) / 2, det = Math.sqrt(Math.max(0, ((cxx - cyy) / 2) ** 2 + cxy * cxy));
    b.ax = [Math.cos(th), Math.sin(th)]; b.nx = [-Math.sin(th), Math.cos(th)]; b.minor = Math.sqrt(Math.max(1, tr - det)); b.major = Math.sqrt(Math.max(1, tr + det));
    if (b.nx[0] * -0.6 + b.nx[1] * -0.8 < 0) b.nx = [-b.nx[0], -b.nx[1]];   // the normal toward the light (upper left, y down)
    blobs.push(b); }
  const hgt = new Float32Array(N); for (let i = 0; i < N; i++) if (inside[i]) hgt[i] = Math.sqrt(D[i] / blobs[lab[i]].dmax);
  const L = [-0.5, -0.65, 0.58], ll = Math.hypot(...L), out = new Float32Array(N).fill(NaN);
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!inside[i]) continue; const b = blobs[lab[i]];
    const hx = (hgt[y * w + Math.min(w - 1, x + 1)] - hgt[y * w + Math.max(0, x - 1)]) / 2, hy = (hgt[Math.min(h - 1, y + 1) * w + x] - hgt[Math.max(0, y - 1) * w + x]) / 2;
    const k = b.dmax * 0.9, nx = -hx * k, ny = -hy * k, nl = Math.hypot(nx, ny, 1), shade = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / (nl * ll));
    const side = sstep(-0.9, 0.9, ((x - b.cx) * b.nx[0] + (y - b.cy) * b.nx[1]) / b.minor), dn = D[i] / b.dmax;   // a soft fold, never a hard line
    let v = 0.5 * shade + 0.2 * side + 0.3 * Math.sqrt(dn);
    if (conifer) { const a = (x - b.cx) * b.ax[0] + (y - b.cy) * b.ax[1], c = (x - b.cx) * b.nx[0] + (y - b.cy) * b.nx[1], u = w / 512;   // (streaks sized for 512 px)
      const streak = vnoise(c / (4 * u) + 50, a / (20 * u) + 50, seed + 11) * 0.65 + vnoise(c / (9 * u), a / (36 * u) + 20, seed + 12) * 0.35;
      v = 0.35 * shade + 0.05 * side + 0.25 * Math.sqrt(dn) + 0.35 * streak; }
    out[i] = v; }
  for (let pass = 0; pass < 3; pass++) { const src = out.slice();   // soft: a 3 x 3 box over the leaf texels
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!inside[i]) continue; let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const v = src[yy * w + xx]; if (v === v) { s += v; n++; } }
      out[i] = s / n; } }
  return { lum: out, mask: inside };
}

// the leaf atlas's cells, shade to sun: each paints the leaf texture through its own window of the concept ramp (the deep teal-green
// end for the crown's underside, the sunlit yellow-green end for its top); a card takes a cell by where it sits in the crown
export const WINDOWS = [[0, 0.4], [0.2, 0.62], [0.42, 0.85], [0.62, 1]];
/** A leaf texture's base at w x h: alpha exactly the source's resize; its luminance: its own, or painted from its alpha shape when flat. */
function leafBase(src, w, h, conifer, seed) {
  const img = resizeKeepAlpha(src, w, h), L = new Float32Array(w * h), M = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { M[i] = img.data[i * 4 + 3] >= 128 ? 1 : 0; L[i] = lumOf(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]); }
  const v = []; for (let i = 0; i < L.length; i++) if (M[i]) v.push(L[i]); v.sort((a, b) => a - b);
  const flat = !(v[Math.floor(v.length * 0.95)] - v[Math.floor(v.length * 0.05)] > 0.02);
  return flat ? { img, ...leafLuma(img, conifer, seed), flat } : { img, lum: L, mask: M, flat };
}
/**
 * The leaf atlas: 2 x 2 cells of `cell` px, cell k the leaf texture repainted through WINDOWS[k] of the ramp (+ noise, grain), its
 * colour bled under the clear texels. Every cell's alpha is the source's resize to `cell` px.
 */
// (along, the firs: { weight, baseV }: every frond painted shade to sun along its length, alongMap: the trunk end at texture v = baseV)
function leafAtlas(src, cw, ch, stops, conifer, seed, windows = WINDOWS, interp = 'rgb', along = null) {
  const base = leafBase(src, cw, ch, conifer, seed), img = { width: cw * 2, height: ch * 2, data: new Uint8Array(cw * ch * 16) }, cells = [];
  const AL = along ? { weight: along.weight, map: alongMap(base.mask, cw, ch, along.baseV) } : null;
  windows.forEach((win, k) => {
    const v = { width: cw, height: ch, data: Uint8Array.from(base.img.data) }, x0 = (k % 2) * cw, y0 = (k >> 1) * ch;
    gradientMap(v, base.lum, base.mask, stops, win, interp, AL); paintNoise(v, base.mask, seed + 31 * k); bleed(v, Uint8Array.from(base.mask));
    for (let y = 0; y < ch; y++) img.data.set(v.data.subarray(y * cw * 4, (y + 1) * cw * 4), ((y0 + y) * cw * 2 + x0) * 4);
    cells.push({ x: x0, y: y0, w: cw, h: ch });
  });
  return { img, cells, flat: base.flat };
}
/** Each texel's place along the leaf picture's long (v) axis, 0 at the trunk end (texture v = baseV, 0 or 1) .. 1 at the tip, over the
 * rows its alpha covers, eased (smoothstep): the fir's frond deep where it meets the trunk, sunlit at its tip. */
function alongMap(mask, w, h, baseV) {
  let y0 = h, y1 = -1; for (let i = 0; i < w * h; i++) if (mask[i]) { const y = (i / w) | 0; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const y = (i / w) | 0, f = Math.max(0, Math.min(1, (y - y0) / Math.max(1, y1 - y0))), a = baseV < 0.5 ? f : 1 - f; out[i] = a * a * (3 - 2 * a); }
  return out;
}
/** The bark: gradient map of its own (painted) luminance onto `stops`, noise, grain; opaque. */
function paintBark(src, w, h, stops, seed) {
  const img = resizeKeepAlpha(src, w, h), N = w * h, L = new Float32Array(N), M = new Uint8Array(N).fill(1);
  for (let i = 0; i < N; i++) { L[i] = lumOf(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]); img.data[i * 4 + 3] = 255; }
  gradientMap(img, L, M, stops); paintNoise(img, M, seed, 4);
  return img;
}
/** Flowers keep their hue structure: every hue turned by the same angle, saturation scaled, value moved, so the petals' median lands on `target`. */
function paintFlowers(img, target, seed) {
  const { data: d } = img, N = img.width * img.height, petals = [];
  for (let i = 0; i < N; i++) { if (d[i * 4 + 3] < 128) continue; const c = hsv(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); if (c[1] >= 0.15) petals.push(c); }
  const med = (k) => { const a = petals.map((p) => p[k]).sort((x, y) => x - y); return a[a.length >> 1]; };
  let x = 0, y = 0; for (const p of petals) { x += Math.cos(p[0] * Math.PI / 180); y += Math.sin(p[0] * Math.PI / 180); }
  const mh = Math.atan2(y, x) * 180 / Math.PI, [th, ts, tv] = hsv(...target), dh = th - mh, ks = ts / (med(1) || 1), kv = tv / (med(2) || 1);
  const mask = new Uint8Array(N);
  // the pale heart (low saturation) keeps its own hue: turned with the petals, a cream heart would go mint
  const turn = (s) => { const t = Math.max(0, Math.min(1, (s - 0.2) / 0.14)); return t * t * (3 - 2 * t); };
  // value: the petals' median onto the target's, their shading kept at 0.7 of its depth (the violet's dark petal bases went maroon in pink)
  const mv = med(2);
  for (let i = 0; i < N; i++) { if (!d[i * 4 + 3]) continue; mask[i] = 1; const [h, s, v] = hsv(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]), c = rgbOf(h + dh * turn(s), Math.min(1, s * ks), Math.max(0, Math.min(1, tv + (v - mv) * 0.7)));
    for (let k = 0; k < 3; k++) d[i * 4 + k] = clamp255(c[k]); }
  paintNoise(img, mask, seed);
  bleed(img, mask);
  return { dh, ks, kv };
}

// ---- birch bark (R1) ----
const rgbHex = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
// tall / long: the brief's mark sizes in px, multiplied by `scale`: the MegaKit bark repeats ~11 times up the trunk and once around it,
// so at 512 px a texel is ~0.6 mm of a 2.3 u tree and a 30 px mark is sub-pixel at the game camera; at x4.5 a mark spans about a
// quarter of the trunk's girth, as the concept's dashes do
export const BIRCH = { base: [rgbHex(0xD8D0C0), rgbHex(0xE9E3D6)], mark: [rgbHex(0x2E2A26), rgbHex(0x4A4038)], tall: [2, 6], long: [8, 30], scale: 4.5, cover: 0.05 };
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/**
 * The birch bark, on the source bark's UVs: a warm white base (#D8D0C0 .. #E9E3D6 by the source's luminance, its ridges softened to 0.6
 * of their depth), short dark horizontal marks (#2E2A26 .. #4A4038): soft-edged lenses 2-6 px tall and 8-30 px long (at 512 px, scaled
 * with the texture), each slightly tilted, until about 5 % of the texels lie under a mark's core (alpha >= 0.85), then grain. Tileable
 * (the marks wrap: the bark repeats ~11 times up the trunk and once around it), seeded. The MegaKit bark tiles along the trunk, so the
 * marks cannot thicken toward the base without new UVs (kept as the source's): their density is even.
 */
function paintBirchBark(src, w, h, seed) {
  const img = resizeKeepAlpha(src, w, h), N = w * h, L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = lumOf(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
  const vals = Float32Array.from(L).sort(), p5 = vals[Math.floor(N * 0.05)], p95 = vals[Math.floor(N * 0.95)], span = p95 - p5 || 1;
  for (let i = 0; i < N; i++) { const t = 0.5 + (Math.max(0, Math.min(1, (L[i] - p5) / span)) - 0.5) * 0.6;
    for (let k = 0; k < 3; k++) img.data[i * 4 + k] = clamp255(BIRCH.base[0][k] + (BIRCH.base[1][k] - BIRCH.base[0][k]) * t); img.data[i * 4 + 3] = 255; }
  const R = rng(seed ^ 0xb12c), A = new Float32Array(N), C = new Float32Array(N * 3), u = w / 512 * BIRCH.scale;
  let core = 0, marks = 0;
  while (core < BIRCH.cover * N && marks < 20000) {
    marks++;
    const cx = R() * w, cy = R() * h, len = (BIRCH.long[0] + R() * (BIRCH.long[1] - BIRCH.long[0])) * u, tall = (BIRCH.tall[0] + R() * (BIRCH.tall[1] - BIRCH.tall[0])) * u, tilt = (R() - 0.5) * 0.12, t = R();
    const col = [0, 1, 2].map((k) => BIRCH.mark[0][k] + (BIRCH.mark[1][k] - BIRCH.mark[0][k]) * t), hx = Math.ceil(len / 2 + 1), hy = Math.ceil(tall / 2 + 2);
    for (let dy = -hy; dy <= hy; dy++) for (let dx = -hx; dx <= hx; dx++) {
      const x = ((Math.round(cx) + dx) % w + w) % w, y = ((Math.round(cy) + dy) % h + h) % h, i = y * w + x;
      const lx = dx + Math.round(cx) - cx, ly = dy + Math.round(cy) - cy - tilt * lx, along = 2 * lx / len; if (Math.abs(along) >= 1) continue;
      const half = tall / 2 * Math.sqrt(1 - along * along), soft = 0.35 * u, a = sstep(half + soft, half - soft, Math.abs(ly)) * sstep(1, 0.8, Math.abs(along));
      if (a <= A[i]) continue;
      if (A[i] < 0.85 && a >= 0.85) core++;
      A[i] = a; C[i * 3] = col[0]; C[i * 3 + 1] = col[1]; C[i * 3 + 2] = col[2];
    }
  }
  for (let i = 0; i < N; i++) if (A[i] > 0) for (let k = 0; k < 3; k++) img.data[i * 4 + k] = clamp255(img.data[i * 4 + k] * (1 - A[i]) + C[i * 3 + k] * A[i]);
  paintNoise(img, new Uint8Array(N).fill(1), seed, 4);
  return { img, marks, core: core / N };
}

// ---- overlays (R1): painted apple / berry cards, a second primitive (MASK PNG `<id>_overlay`) on `Canopy` (apple) or the bush (berry) ----
// count, card size range (u), where (apple: kept leaf triangles above `minHf` of the canopy's leaf height span; berry: facing up / out,
// face normal y >= minNy), and the outer share of the crown they sit in (the triangles at or beyond the `outer` quantile of distance from
// the crown's centre, so the game camera sees them). Each card: OFFSET u along its triangle's face normal (oriented with the leaf's
// smooth normal), facing that normal blended UP toward +Y, a seeded roll (+-ROLL rad from upright), >= SPACING x the larger size apart.
// (berry, "upper": its card centres also >= minH x the model's height, the base at y 0: none hangs below the bush's outline)
export const OVERLAY = { apple: { count: 12, size: [0.07, 0.09], minHf: 0.5, outer: 0.4 }, berry: { count: 30, size: [0.06, 0.09], minNy: -0.2, minH: 0.35, outer: 0.4 } };
const OV_OFFSET = 0.004, OV_UP = 0.4, OV_SPACING = 0.6, OV_ROLL = 0.75, OV_TEX = 256, OV_VIEW = [Math.cos(29 * Math.PI / 180), Math.sin(29 * Math.PI / 180)];
/** Overlay cards on the kept leaf triangles of `L` (positions in the model's frame): [{ c, f, t, b, s, k }] (centre, facing, the card's
 * right and up, size, atlas cell). Seeded, deterministic. `opts` overrides OVERLAY[kind]'s count / size (the far version's apples). */
export function placeOverlay(kind, L, seed, height, opts = {}) {
  const O = { ...OVERLAY[kind], ...opts }, R = rng(seed), P = L.P, N = L.NR, I = L.Ik;
  if (O.minH !== undefined && !(height > 0)) throw new Error(`overlay ${kind}: needs the model's height`);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const at = (v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
  let y0 = Infinity, y1 = -Infinity; const cen = [0, 0, 0];
  for (let k = 0; k < I.length; k++) { const y = P[I[k] * 3 + 1]; y0 = Math.min(y0, y); y1 = Math.max(y1, y); for (let q = 0; q < 3; q++) cen[q] += P[I[k] * 3 + q] / I.length; }
  const tris = [];
  for (let t = 0; t < I.length; t += 3) { const a = at(I[t]), b = at(I[t + 1]), c = at(I[t + 2]), sn = norm([0, 1, 2].map((q) => N[I[t] * 3 + q] + N[I[t + 1] * 3 + q] + N[I[t + 2] * 3 + q]));
    let g = norm(cross(sub(b, a), sub(c, a))); if (dot(g, sn) < 0) g = g.map((v) => -v);
    const m = [0, 1, 2].map((q) => (a[q] + b[q] + c[q]) / 3); tris.push({ a, b, c, g, m, d: Math.hypot(m[0] - cen[0], (m[1] - cen[1]) * 0.8, m[2] - cen[2]) }); }
  const ds = tris.map((x) => x.d).sort((p, q) => p - q), dCut = ds[Math.floor(O.outer * ds.length)];
  const fits = (x) => (O.minHf === undefined || x.m[1] >= y0 + O.minHf * (y1 - y0)) && (O.minNy === undefined || x.g[1] >= O.minNy) && (O.minH === undefined || x.m[1] >= O.minH * height);
  tris.forEach((x, i) => { x.card = L.cardOf ? L.cardOf[I[i * 3]] : i; });
  // exposed: a ray from the card toward the viewer leaves the crown without crossing another kept leaf (Moller-Trumbore), so the
  // card shows from outside (the grown cards overlap: one 0.004 u above a leaf is otherwise mostly covered by its neighbours)
  const exposed = (p, f, card) => { for (const y of tris) { if (y.card === card) continue;
    const e1 = sub(y.b, y.a), e2 = sub(y.c, y.a), h = cross(f, e2), det = dot(e1, h); if (Math.abs(det) < 1e-12) continue;
    const s = sub(p, y.a), u = dot(s, h) / det; if (u < 0 || u > 1) continue; const q = cross(s, e1), v = dot(f, q) / det; if (v < 0 || u + v > 1) continue;
    if (dot(e2, q) / det > 1e-4) return false; } return true; };
  let cand = tris.filter((x) => fits(x) && x.d >= dCut); if (cand.length < O.count * 3) cand = tris.filter(fits);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const out = [];
  for (const strict of [true, false]) for (const x of cand) {
    if (out.length >= O.count) break;
    let r1 = R(), r2 = R(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
    const p = [0, 1, 2].map((q) => x.a[q] + r1 * (x.b[q] - x.a[q]) + r2 * (x.c[q] - x.a[q]) + x.g[q] * OV_OFFSET), s = O.size[0] + R() * (O.size[1] - O.size[0]);
    const roll = (R() * 2 - 1) * OV_ROLL, k = Math.floor(R() * 4);
    if (O.minHf !== undefined && p[1] < y0 + O.minHf * (y1 - y0)) continue;   // the card itself above the line, not only its triangle's centre
    if (O.minH !== undefined && p[1] < O.minH * height) continue;
    if (out.some((o) => Math.hypot(o.c[0] - p[0], o.c[1] - p[1], o.c[2] - p[2]) < OV_SPACING * Math.max(o.s, s))) continue;
    const f = norm(x.g.map((v, q) => v * (1 - OV_UP) + (q === 1 ? OV_UP : 0)));
    // upright: the card's up = +Y projected onto its plane (else +Z), turned by the roll; right = up x facing (right x up = facing)
    let up = sub([0, 1, 0], f.map((v) => v * f[1])); if (Math.hypot(...up) < 1e-3) up = sub([0, 0, 1], f.map((v) => v * f[2])); up = norm(up);
    const rt = norm(cross(up, f)), cr = Math.cos(roll), sr = Math.sin(roll);
    const t = rt.map((v, q) => v * cr + up[q] * sr), b = up.map((v, q) => v * cr - rt[q] * sr);
    // seen from the game's elevation (29 deg) on the card's own side of the crown: the card not edge-on to that line of sight, and at
    // least 2 of 5 points on it (its centre, four points 0.35 x size out) clear along it: peeking out from under the leaves, as the
    // concept's apples do, and (strict) below the top 8 % of the leaf span, so none pokes above the crown's outline
    const rad = norm([p[0] - cen[0], 0, p[2] - cen[2]]), view = norm([rad[0] * OV_VIEW[0], OV_VIEW[1], rad[2] * OV_VIEW[0]]);
    const pts5 = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([i, j]) => p.map((v, q) => v + (t[q] * i + b[q] * j) * 0.35 * s));
    if (strict && (Math.abs(dot(f, view)) < 0.35 || p[1] > y0 + 0.92 * (y1 - y0) || pts5.filter((q) => exposed(q, view, x.card)).length < 2)) continue;
    out.push({ c: p, f, t, b, s, k, exposed: strict });
  }
  if (out.length < O.count) throw new Error(`overlay ${kind}: only ${out.length} of ${O.count} cards fit (${cand.length} candidate triangles)`);
  return out;
}
/** The overlay's quads (+ each again wound the other way: two-sided with the front's normal), positions minus `off`. */
function overlayGeometry(cards, off) {
  const P = [], N = [], U = [], I = [], C = OV_TEX / 2;
  for (const q of cards) { const j = P.length / 3, x0 = (q.k % 2) * C / OV_TEX, y0 = (q.k >> 1) * C / OV_TEX, h = q.s / 2;
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { for (let k = 0; k < 3; k++) P.push(q.c[k] + q.t[k] * su * h + q.b[k] * sv * h - off[k]); N.push(...q.f);
      U.push(x0 + (su + 1) / 2 * 0.5, y0 + (1 - sv) / 2 * 0.5); }
    I.push(j, j + 1, j + 2, j, j + 2, j + 3); }
  for (let t = 0, n = I.length; t < n; t += 3) I.push(I[t], I[t + 2], I[t + 1]);
  return { P, N, U, I };
}
/** The overlay cards as a primitive of `doc` (material `mat`), positions minus `off`. */
function overlayPrimIn(doc, acc, mat, cards, off) {
  const g = overlayGeometry(cards, off);
  return doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', acc('VEC3', new Float32Array(g.P))).setAttribute('NORMAL', acc('VEC3', new Float32Array(g.N)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.U))).setIndices(acc('SCALAR', new Uint16Array(g.I)));
}
/**
 * A primitive of `doc` from kept triangles (each part: { p: { P, NR, UV, Ik }, uvMap? }), with its own compacted vertices (positions
 * minus `off`), UVs through `uvMap`; `dup`: every triangle again after them, wound the other way, on the same vertices (the card's back,
 * with the front's normals).
 */
function primIn(doc, acc, parts, off, mat, dup = false) {
  const P = [], N = [], U = [], ix = [];
  for (const { p, uvMap } of parts) { const map = new Map(), I = p.Ik;
    for (let k = 0; k < I.length; k++) { const v = I[k]; let j = map.get(v); if (j === undefined) { j = P.length / 3; map.set(v, j);
      P.push(p.P[v * 3] - off[0], p.P[v * 3 + 1] - off[1], p.P[v * 3 + 2] - off[2]); N.push(p.NR[v * 3], p.NR[v * 3 + 1], p.NR[v * 3 + 2]); const uv = uvMap ? uvMap(p.UV[v * 2], p.UV[v * 2 + 1], v) : [p.UV[v * 2], p.UV[v * 2 + 1]]; U.push(uv[0], uv[1]); }
      ix.push(j); } }
  if (dup) for (let t = 0, n = ix.length; t < n; t += 3) ix.push(ix[t], ix[t + 2], ix[t + 1]);
  const big = P.length / 3 >= 65535;
  return doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', acc('VEC3', new Float32Array(P))).setAttribute('NORMAL', acc('VEC3', new Float32Array(N)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(U))).setIndices(acc('SCALAR', big ? new Uint32Array(ix) : new Uint16Array(ix)));
}
// the far version's textures (ruling R20): each near image box-downsampled to FAR_TEX x FAR_TEX (resizeKeepAlpha: lib/png.mjs
// resizeBilinear is a box filter at a whole factor, here with the colour premultiplied), PNG with its alpha or JPEG at BARK_Q, as the
// near; an image no larger (the 256 px overlay atlas) is kept byte for byte. A far tree is drawn only from ~35 u, where 256 px is ample
export const FAR_TEX = 256;
export function farImage(bytes, mime) {
  const img = decodeImage(bytes, mime);
  if (img.width <= FAR_TEX && img.height <= FAR_TEX) return Uint8Array.from(bytes);
  if (img.width % FAR_TEX || img.height % FAR_TEX) throw new Error(`far texture: ${img.width}x${img.height} is not a whole multiple of ${FAR_TEX} px (a box filter)`);
  const r = resizeKeepAlpha(img, FAR_TEX, FAR_TEX);
  return new Uint8Array(mime === 'image/png' ? encodePNG(r) : jpeg.encode({ data: r.data, width: FAR_TEX, height: FAR_TEX }, BARK_Q).data);
}
/** A copy of material `m` in `doc` for the far version: the same name, alpha mode, cutoff, sides, factors and sampler, its base-colour
 * texture the same name and type with the image at FAR_TEX px (farImage): self-contained, about a quarter of the near's texture memory. */
function materialIn(doc, m) {
  const t = m.getBaseColorTexture(), ti = m.getBaseColorTextureInfo();
  const nm = doc.createMaterial(m.getName()).setBaseColorTexture(doc.createTexture(t.getName()).setMimeType(t.getMimeType()).setImage(farImage(t.getImage(), t.getMimeType())))
    .setAlphaMode(m.getAlphaMode()).setAlphaCutoff(m.getAlphaCutoff()).setDoubleSided(m.getDoubleSided()).setMetallicFactor(m.getMetallicFactor()).setRoughnessFactor(m.getRoughnessFactor());
  nm.getBaseColorTextureInfo().setWrapS(ti.getWrapS()).setWrapT(ti.getWrapT()).setMinFilter(ti.getMinFilter()).setMagFilter(ti.getMagFilter());
  return nm;
}
// soft disc coverage (1 inside, 0 outside, a ~1.2 px soft edge), for a distance d to the edge in px (negative inside)
const cover = (d) => sstep(0.6, -0.6, d);
/** The overlay atlas: 2 x 2 cells of 128 px, four painted variants (apples from #C8352B to #E05A3C; bunches of 4 / 5 / 6 / 8 berries
 * #C0392B on a dark-green leaf scrap), lit from the upper left, soft and grainy, the colour bled under the clear texels. */
export function paintOverlay(kind, seed) {
  const S = OV_TEX, C = S / 2, img = { width: S, height: S, data: new Uint8Array(S * S * 4) }, R = rng(seed);
  const put = (x, y, rgb, a) => { if (a <= 0) return; const o = (y * S + x) * 4, a0 = img.data[o + 3] / 255, na = a + a0 * (1 - a);
    for (let k = 0; k < 3; k++) img.data[o + k] = clamp255((rgb[k] * a + img.data[o + k] * a0 * (1 - a)) / (na || 1)); img.data[o + 3] = clamp255(na * 255); };
  const Lt = [-0.5, -0.62, 0.6], Ll = Math.hypot(...Lt);
  const shade = (dx, dy) => { const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)); return Math.max(0, (dx * Lt[0] + dy * Lt[1] + nz * Lt[2]) / Ll); };
  const ball = (x0, y0, cx, cy, r, base, hiCol) => {   // a lit sphere: shaded body, darker rim, a soft highlight upper left
    const [bh, bs, bv] = hsv(...base);
    for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) for (let x = Math.floor(cx - r - 2); x <= Math.ceil(cx + r + 2); x++) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d = Math.hypot(dx, dy), a = cover((d - 1) * r); if (a <= 0) continue;
      const l = shade(Math.min(0.99, dx), Math.min(0.99, dy)), rim = 0.82 + 0.18 * sstep(1, 0.7, d);
      let c = rgbOf(bh + (l - 0.5) * 8, Math.min(1, bs * (1.05 - 0.15 * l)), Math.min(1, bv * (0.72 + 0.4 * l) * rim));
      const hd = Math.hypot(dx + 0.36, dy + 0.38) / 0.28, hl = sstep(1, 0.2, hd) * 0.75; c = c.map((v, k) => v + (hiCol[k] - v) * hl);
      put(x0 + x, y0 + y, c, a); } };
  const leaf = (x0, y0, cx, cy, rx, ry, rot, col, vein) => {   // a pointed leaf, a darker midrib, lit across
    const cs = Math.cos(rot), sn = Math.sin(rot), [lh, ls, lv] = hsv(...col);
    for (let y = Math.floor(cy - rx - 2); y <= Math.ceil(cy + rx + 2); y++) for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
      const px = x + 0.5 - cx, py = y + 0.5 - cy, u = (px * cs + py * sn) / rx, v = (-px * sn + py * cs) / ry; if (Math.abs(u) > 1.05) continue;
      const w = Math.pow(Math.max(0, 1 - u * u), 0.75), d = (Math.abs(v) - w) * ry, a = cover(d); if (a <= 0) continue;
      const side = v < 0 ? 1.08 : 0.86, mid = vein ? 1 - 0.25 * sstep(0.09, 0, Math.abs(v)) * (1 - Math.abs(u)) : 1;
      put(x0 + x, y0 + y, rgbOf(lh + (v < 0 ? 4 : -3), ls, Math.min(1, lv * side * mid * (0.92 + 0.12 * (1 - Math.abs(u))))), a); } };
  for (let k = 0; k < 4; k++) {
    const x0 = (k % 2) * C, y0 = (k >> 1) * C;
    if (kind === 'apple') {
      const t = k / 3 + (R() - 0.5) * 0.1, base = [0, 1, 2].map((q) => [0xC8, 0x35, 0x2B][q] + ([0xE0, 0x5A, 0x3C][q] - [0xC8, 0x35, 0x2B][q]) * Math.max(0, Math.min(1, t)));
      const cx = 64 + (R() - 0.5) * 4, cy = 77, r = 49;   // the body fills the card (its top margin: the stem and leaf)
      // stem (behind the body's top dent) and a small leaf at its side
      for (let s = 0; s <= 1; s += 0.02) { const sx = cx + 2 + 7 * s * s, sy = cy - r * 0.8 - 18 * s; for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) put(x0 + Math.round(sx + x), y0 + Math.round(sy + y), [0x5B, 0x3A, 0x22], cover(Math.hypot(x, y) - 2.2) * 0.9); }
      leaf(x0, y0, cx + 21, cy - r - 2, 18, 8, -0.5 + (R() - 0.5) * 0.4, [0x55, 0x86, 0x2E], true);
      ball(x0, y0, cx, cy, r, base, [0xF6, 0xC9, 0xB0]);
      // the top dent: the body darkened a little where the stem sits
      for (let y = Math.floor(cy - r); y < cy - r + 14; y++) for (let x = Math.floor(cx - 10); x <= cx + 10; x++) { const o = ((y0 + y) * S + x0 + x) * 4, f = sstep(10, 0, Math.hypot(x - cx, (y - (cy - r + 3)) * 1.4)) * 0.28;
        if (img.data[o + 3] > 0) for (let q = 0; q < 3; q++) img.data[o + q] = clamp255(img.data[o + q] * (1 - f)); }
    } else {
      const n = [4, 5, 6, 8][k];
      leaf(x0, y0, 64, 64, 60, 28, -0.6 + (R() - 0.5) * 0.5, [0x2E, 0x55, 0x2C], true);
      leaf(x0, y0, 60 + (R() - 0.5) * 8, 70, 46, 20, 0.9 + (R() - 0.5) * 0.5, [0x3A, 0x63, 0x33], true);
      // n berries, never fewer: the berries shrink a little each time a bunch will not fit
      let pts = [];
      for (let k2 = 1; pts.length < n; k2 *= 0.94) { pts = [];
        for (let tries = 0; pts.length < n && tries < 400; tries++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 31, p = [64 + Math.cos(a) * d, 64 + Math.sin(a) * d * 0.9], r = (12 + R() * 4) * k2;
          if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) >= (q[2] + r) * 0.8)) pts.push([...p, r]); } }
      pts.sort((a, b) => a[1] - b[1]);
      for (const [px, py, r] of pts) ball(x0, y0, px, py, r, [0xC0, 0x39, 0x2B], [0xF4, 0xB8, 0xA8]);
    }
  }
  const mask = new Uint8Array(S * S); for (let i = 0; i < S * S; i++) mask[i] = img.data[i * 4 + 3] >= 128 ? 1 : 0;
  paintNoise(img, mask, seed + 5, 8);
  const keepA = new Uint8Array(S * S); for (let i = 0; i < S * S; i++) keepA[i] = img.data[i * 4 + 3];
  bleed(img, Uint8Array.from(keepA, (a) => (a > 0 ? 1 : 0)));
  for (let i = 0; i < S * S; i++) img.data[i * 4 + 3] = keepA[i];
  return img;
}

// ---- geometry ----
// welded connected components of a triangle list: [{ tris: [t...], c: centroid }]
function components(P, I) {
  const n = P.length / 3, key = new Map(), wid = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, key.size); wid[i] = key.get(k); }
  const par = Int32Array.from({ length: key.size }, (_, i) => i), find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < I.length; t += 3) { const a = find(wid[I[t]]); par[find(wid[I[t + 1]])] = a; par[find(wid[I[t + 2]])] = a; }
  const byRoot = new Map(), out = [];
  for (let t = 0; t < I.length / 3; t++) { const r = find(wid[I[t * 3]]); let c = byRoot.get(r); if (!c) { byRoot.set(r, (c = { tris: [], c: [0, 0, 0], nv: 0 })); out.push(c); } c.tris.push(t);
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; c.c[0] += P[v * 3]; c.c[1] += P[v * 3 + 1]; c.c[2] += P[v * 3 + 2]; c.nv++; } }
  for (const c of out) { c.c = c.c.map((v) => v / c.nv); delete c.nv; }
  return out;
}
/**
 * The bark's welded components, each marked: `trunk` (it holds the lowest bark vertex), `inside` / `below` (how many of its vertices
 * lie inside the leaf cards' convex hull shrunk HIDE_SHRINK toward the crown centroid (the mean of the cards' centres) / below the
 * lowest leaf vertex) and `hidden` (not the trunk, >= HIDE_IN inside, none below). `first` = its first triangle index.
 */
export function hiddenBark(BP, BI, LP, LI) {
  const cards = components(LP, LI), cen = [0, 0, 0], k1 = 1 - HIDE_SHRINK, pts = []; let leafMinY = Infinity;
  for (const c of cards) for (let k = 0; k < 3; k++) cen[k] += c.c[k] / cards.length;
  for (let i = 0; i < LP.length; i += 3) { leafMinY = Math.min(leafMinY, LP[i + 1]); pts.push(new THREE.Vector3(cen[0] + (LP[i] - cen[0]) * k1, cen[1] + (LP[i + 1] - cen[1]) * k1, cen[2] + (LP[i + 2] - cen[2]) * k1)); }
  const hull = new ConvexHull().setFromPoints(pts), p = new THREE.Vector3();
  let low = 0; for (let i = 1; i < BP.length / 3; i++) if (BP[i * 3 + 1] < BP[low * 3 + 1]) low = i;
  return components(BP, BI).map((c) => {
    const vs = new Set(); for (const t of c.tris) for (let k = 0; k < 3; k++) vs.add(BI[t * 3 + k]);
    let inside = 0, below = 0; for (const v of vs) { p.set(BP[v * 3], BP[v * 3 + 1], BP[v * 3 + 2]); if (hull.containsPoint(p)) inside++; if (p.y < leafMinY) below++; }
    const trunk = vs.has(low);
    return { first: c.tris[0], tris: c.tris, n: vs.size, inside, below, trunk, hidden: !trunk && inside >= HIDE_IN * vs.size && below === 0 };
  });
}
const bboxY = (P) => { let lo = Infinity, hi = -Infinity; for (let i = 1; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); } return [lo, hi]; };

// ---- the far version (task 11b): a light copy of every tree for distant trees and low-power draws ----
// FAR: the defaults (lib/species.mjs `far` overrides them per species): cards = the share of the near version's kept leaf cards the far
// version keeps (thinned on, coverage first: the least seen from the game camera's views leave first, cardCoverage; ties interior
// first), growMax = the most its cards grow about their own centres (by sqrt(near cards / far cards)), barkTris = the trunk's
// triangles after simplifyMesh, overlay = the overlay cards it keeps (tree_fruit's apples, placed again on the far leaves, grown with
// them). FAR_MAX: the far version's triangle target by kind (species far.maxTris overrides it: the sapling's 500); over it, the build
// throws before writing (M2)
export const FAR = { cards: 0.37, growMax: 1.5, barkTris: 120, overlay: 6 };
export const FAR_MAX = { broad: 1000, conifer: 500 };
// (leafTris, optional: the far leaves then simplified to this many single-sided triangles by simplifyMesh, each card within itself: a
// conifer's 32 big frond strips keep every frond, only less bent, where thinning them showed dark, blobby gaps)
// the game camera's views a far card is ranked by: 12 azimuths at elevations 20, 33 (the game's Canvas camera [30, 28, 30]) and 50 deg
export const FAR_VIEWS = [20, 33, 50].flatMap((el) => Array.from({ length: 12 }, (_, k) => { const a = k * Math.PI / 6, e = el * Math.PI / 180; return [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)]; }));
/**
 * How much of the crown's picture each card is, over FAR_VIEWS: per view, a FAR_RAYS x FAR_RAYS grid of parallel rays from outside the
 * crown's bounding sphere toward it; each ray counts for the first card it meets (Moller-Trumbore, either face; each card's bounding
 * sphere first). A card no ray meets first is hidden behind others in every view. `cards` = [{ tris }] (triangle indices into I).
 */
export const FAR_RAYS = 40;
export function cardCoverage(cards, P, I) {
  const n = cards.length, cen = new Float64Array(n * 3), rad = new Float64Array(n), tri = [], C = [0, 0, 0];
  cards.forEach((c, k) => { let m = 0; for (const t of c.tris) for (let j = 0; j < 3; j++) { const v = I[t * 3 + j]; for (let q = 0; q < 3; q++) cen[k * 3 + q] += P[v * 3 + q]; m++; }
    for (let q = 0; q < 3; q++) { cen[k * 3 + q] /= m; C[q] += cen[k * 3 + q] / n; }
    const ts = []; for (const t of c.tris) { const p = [0, 1, 2].map((j) => { const v = I[t * 3 + j]; return [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; });
      for (const q of p) rad[k] = Math.max(rad[k], Math.hypot(q[0] - cen[k * 3], q[1] - cen[k * 3 + 1], q[2] - cen[k * 3 + 2]));
      ts.push([p[0], [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]]); }
    tri.push(ts); });
  let R = 0; for (let k = 0; k < n; k++) R = Math.max(R, Math.hypot(cen[k * 3] - C[0], cen[k * 3 + 1] - C[1], cen[k * 3 + 2] - C[2]) + rad[k]);
  const cover = new Int32Array(n);
  for (const view of FAR_VIEWS) {
    const d = view.map((x) => -x), up = Math.abs(d[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
    const u0 = [up[1] * d[2] - up[2] * d[1], up[2] * d[0] - up[0] * d[2], up[0] * d[1] - up[1] * d[0]], ul = Math.hypot(...u0), u = u0.map((x) => x / ul);
    const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
    for (let i = 0; i < FAR_RAYS; i++) for (let j = 0; j < FAR_RAYS; j++) {
      const x = ((i + 0.5) / FAR_RAYS * 2 - 1) * R, y = ((j + 0.5) / FAR_RAYS * 2 - 1) * R, o = [0, 1, 2].map((q) => C[q] + u[q] * x + v[q] * y - d[q] * 2 * R);
      let best = Infinity, who = -1;
      for (let k = 0; k < n; k++) {
        const wx = cen[k * 3] - o[0], wy = cen[k * 3 + 1] - o[1], wz = cen[k * 3 + 2] - o[2], tc = wx * d[0] + wy * d[1] + wz * d[2];
        if (tc + rad[k] < 0 || tc - rad[k] > best || wx * wx + wy * wy + wz * wz - tc * tc > rad[k] * rad[k]) continue;
        for (const [a, e1, e2] of tri[k]) { const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
          if (Math.abs(det) < 1e-12) continue; const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]], uu = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det; if (uu < 0 || uu > 1) continue;
          const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], vv = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det; if (vv < 0 || uu + vv > 1) continue;
          const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det; if (t > 0 && t < best) { best = t; who = k; } } }
      if (who >= 0) cover[who]++;
    }
  }
  return cover;
}
/**
 * Simplify a triangle mesh to <= `target` triangles by quadric-error half-edge collapses (Garland & Heckbert): the surviving vertex
 * stays where it is, so every output vertex is one of the input's, with its own position, normal and UV. `I` indexes P / NR / UV; the
 * result is a new index list into them (the input's winding kept). Vertices are merged first where position, normal and UV agree, then
 * by position for the topology. A collapse b -> a must keep the surface manifold (the link condition), move a boundary b only along a
 * boundary edge, map each corner of b to exactly one corner of a across the collapsed edge's triangles (a UV or normal seam only slides
 * along itself), and flip or flatten no remaining triangle (its normal turns by < ~78 deg). Faces add area-weighted plane quadrics,
 * boundary and seam edges a stiff perpendicular one (the outline and the seams keep their shape). Deterministic (ties by order).
 * `why` (optional, an object): when no allowed collapse is left above the target, the blocked ones tallied by reason.
 */
export function simplifyMesh(P, NR, UV, I, target, why = null, groups = null) {
  const r = (v, s) => Math.round(v * s), n = P.length / 3, akey = new Map(), attr = new Int32Array(n), rep = [];
  for (let i = 0; i < n; i++) { const k = `${r(P[i * 3], 1e5)},${r(P[i * 3 + 1], 1e5)},${r(P[i * 3 + 2], 1e5)},${r(NR[i * 3], 1e4)},${r(NR[i * 3 + 1], 1e4)},${r(NR[i * 3 + 2], 1e4)},${r(UV[i * 2], 1e5)},${r(UV[i * 2 + 1], 1e5)}`;
    let a = akey.get(k); if (a === undefined) { a = rep.length; akey.set(k, a); rep.push(i); } attr[i] = a; }
  const wkey = new Map(), wOf = new Int32Array(rep.length), Q = [];
  rep.forEach((i, a) => { const k = `${r(P[i * 3], 1e5)},${r(P[i * 3 + 1], 1e5)},${r(P[i * 3 + 2], 1e5)}`; let w = wkey.get(k);
    if (w === undefined) { w = Q.length; wkey.set(k, w); Q.push([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]); } wOf[a] = w; });
  const T = []; for (let t = 0; t < I.length; t += 3) { const c = [attr[I[t]], attr[I[t + 1]], attr[I[t + 2]]], w = c.map((a) => wOf[a]); if (w[0] !== w[1] && w[1] !== w[2] && w[0] !== w[2]) T.push(c); }
  const NW = Q.length, sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const K = Array.from({ length: NW }, () => new Float64Array(10));
  const plane = (k, u, d, g) => { k[0] += g * u[0] * u[0]; k[1] += g * u[0] * u[1]; k[2] += g * u[0] * u[2]; k[3] += g * u[0] * d; k[4] += g * u[1] * u[1]; k[5] += g * u[1] * u[2]; k[6] += g * u[1] * d; k[7] += g * u[2] * u[2]; k[8] += g * u[2] * d; k[9] += g * d * d; };
  const cost = (ka, kb, v) => { const [x, y, z] = v, k = (i) => ka[i] + kb[i];
    return k(0) * x * x + 2 * k(1) * x * y + 2 * k(2) * x * z + 2 * k(3) * x + k(4) * y * y + 2 * k(5) * y * z + 2 * k(6) * y + k(7) * z * z + 2 * k(8) * z + k(9); };
  const normalOf = (p) => cross(sub(p[1], p[0]), sub(p[2], p[0]));
  // face quadrics (area-weighted), then the boundary and seam edges' perpendicular planes (BORDER x the edge's length squared)
  const BORDER = 10, edgeTris = new Map(), ekey = (a, b) => (a < b ? a * NW + b : b * NW + a);
  T.forEach((t, i) => { const p = t.map((a) => Q[wOf[a]]), nn = normalOf(p), l = Math.hypot(...nn); if (l > 0) { const u = nn.map((v) => v / l); for (const a of t) plane(K[wOf[a]], u, -dot(u, p[0]), l / 2); }
    for (let k = 0; k < 3; k++) { const e = ekey(wOf[t[k]], wOf[t[(k + 1) % 3]]); (edgeTris.get(e) || edgeTris.set(e, []).get(e)).push(i); } });
  for (const [e, ts] of edgeTris) {
    const a = Math.floor(e / NW), b = e % NW, cornerOf = (t, w) => T[t].find((c) => wOf[c] === w);
    const seam = ts.length === 2 && (cornerOf(ts[0], a) !== cornerOf(ts[1], a) || cornerOf(ts[0], b) !== cornerOf(ts[1], b));
    if (ts.length !== 1 && !seam) continue;
    const d = sub(Q[b], Q[a]), len2 = dot(d, d);
    for (const t of ts) { const nn = normalOf(T[t].map((c) => Q[wOf[c]])), u0 = cross(d, nn), l = Math.hypot(...u0); if (!(l > 0)) continue;
      const u = u0.map((v) => v / l); plane(K[a], u, -dot(u, Q[a]), BORDER * len2); plane(K[b], u, -dot(u, Q[a]), BORDER * len2); }
  }
  const alive = new Uint8Array(T.length).fill(1); let count = T.length;
  // (groups, optional: { of: a group per input vertex, floor (a number, or a function of the group) }: no collapse takes a group below floor triangles, e.g. a fir's fronds)
  const fl = (g) => (typeof groups.floor === 'function' ? groups.floor(g) : groups.floor), tg = groups ? T.map((t) => groups.of[rep[t[0]]]) : null, gc = new Map(); if (tg) for (const g of tg) gc.set(g, (gc.get(g) || 0) + 1);
  while (count > target) {
    const vt = Array.from({ length: NW }, () => []), edges = new Map();
    T.forEach((t, i) => { if (!alive[i]) return; for (let k = 0; k < 3; k++) { vt[wOf[t[k]]].push(i); const e = ekey(wOf[t[k]], wOf[t[(k + 1) % 3]]); (edges.get(e) || edges.set(e, []).get(e)).push(i); } });
    const border = new Uint8Array(NW); for (const [e, ts] of edges) if (ts.length === 1) { border[Math.floor(e / NW)] = 1; border[e % NW] = 1; }
    const ring = (w) => { const s = new Set(); for (const t of vt[w]) for (const c of T[t]) if (wOf[c] !== w) s.add(wOf[c]); return s; };
    // b -> a: the corner map of b onto a, or why not (a string)
    const allowed = (b, a, ets) => {
      if (ets.length > 2) return 'non-manifold edge'; if (border[b] && ets.length !== 1) return 'boundary';
      const opp = new Set(ets.map((t) => wOf[T[t].find((c) => wOf[c] !== a && wOf[c] !== b)])), rb = ring(b);
      for (const w of ring(a)) if (rb.has(w) && !opp.has(w)) return 'link';
      const map = new Map();
      for (const t of ets) { const cb = T[t].find((c) => wOf[c] === b), ca = T[t].find((c) => wOf[c] === a); if (map.has(cb) && map.get(cb) !== ca) return 'seam'; map.set(cb, ca); }
      for (const t of vt[b]) { if (ets.includes(t)) continue; const cb = T[t].find((c) => wOf[c] === b); if (!map.has(cb)) return 'seam';
        const p0 = T[t].map((c) => Q[wOf[c]]), p1 = T[t].map((c) => (wOf[c] === b ? Q[a] : Q[wOf[c]])), n0 = normalOf(p0), n1 = normalOf(p1), l0 = Math.hypot(...n0), l1 = Math.hypot(...n1);
        if (!(l1 > 1e-3 * l0) || dot(n0, n1) < 0.2 * l0 * l1) return 'flip'; }
      return map;
    };
    let best = null;
    for (const [e, ets] of edges) { const u = Math.floor(e / NW), v = e % NW;
      if (tg && gc.get(tg[ets[0]]) - ets.length < fl(tg[ets[0]])) continue;
      for (const [b, a] of [[u, v], [v, u]]) { const c = cost(K[a], K[b], Q[a]); if (best && c >= best.c) continue; const map = allowed(b, a, ets); if (typeof map !== 'string') best = { c, a, b, ets, map }; } }
    if (!best) { if (why) for (const [e, ets] of edges) for (const [b, a] of [[Math.floor(e / NW), e % NW], [e % NW, Math.floor(e / NW)]]) { const r0 = allowed(b, a, ets); why[r0] = (why[r0] || 0) + 1; } break; }
    for (const t of best.ets) { alive[t] = 0; count--; if (tg) gc.set(tg[t], gc.get(tg[t]) - 1); }
    for (const t of vt[best.b]) if (alive[t]) T[t] = T[t].map((c) => (wOf[c] === best.b ? best.map.get(c) : c));
    for (let k = 0; k < 10; k++) K[best.a][k] += K[best.b][k];
  }
  const out = []; T.forEach((t, i) => { if (alive[i]) out.push(rep[t[0]], rep[t[1]], rep[t[2]]); });
  return Uint32Array.from(out);
}

/** How even a crown is round its trunk (the y axis): its leaf triangles sampled on a barycentric grid (step 1/4), in FIR_EVEN.bands
 * height bands over their span; per band the max distance from the axis in 8 directions (45 deg sectors), at FIR_EVEN.phases turns of
 * the sectors; the worst band's max / min (an empty sector: Infinity). 1 = a perfect cone. (tests/reskin.test.mjs RS13 holds the
 * finished models to <= 1.6 at one phase.) */
export const FIR_EVEN = { bands: 6, phases: 4 };
/** The ranks (0 .. n - 1, by height) of the fronds a rebuilt fir's far version leaves out to keep nFar: evenly spaced above its lowest
 * FIR.whorl. */
export function firLeave(n, nFar) {
  const W = Math.min(FIR.whorl, n), d = Math.max(0, n - nFar), out = new Set();
  for (let j = 0; j < d; j++) out.add(W + Math.min(n - W - 1, Math.floor((j + 0.5) * (n - W) / d)));
  return out;
}
export function crownEvenness(P, I) {
  const pts = []; for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    for (let i = 0; i <= 4; i++) for (let j = 0; i + j <= 4; j++) { const u = i / 4, v = j / 4; pts.push([0, 1, 2].map((k) => P[a + k] * (1 - u - v) + P[b + k] * u + P[c + k] * v)); } }
  let y0 = Infinity, y1 = -Infinity; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  let worst = 1;
  for (let ph = 0; ph < FIR_EVEN.phases; ph++) { const off = ph / FIR_EVEN.phases * Math.PI / 4, r = Array.from({ length: FIR_EVEN.bands }, () => new Array(8).fill(0));
    for (const [x, y, z] of pts) { const b = Math.min(FIR_EVEN.bands - 1, Math.floor((y - y0) / (y1 - y0) * FIR_EVEN.bands)), s = Math.floor(((Math.atan2(z, x) + Math.PI + off) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
      r[b][s] = Math.max(r[b][s], Math.hypot(x, z)); }
    for (const band of r) worst = Math.max(worst, Math.max(...band) / Math.max(1e-12, Math.min(...band))); }
  return worst;
}
/**
 * A rebuilt fir's far trunk (its near trunk stands straight on the axis): a tapered FAR_TRUNK.sides-sided tube through FAR_TRUNK.rings
 * rings at shares of its height, each ring's radius the mean xz distance of the trunk's vertices near that height and its texture v
 * their mean v (u once round, the seam column repeated: one welded component), normals outward. The simplified trunk (simplifyMesh)
 * stopped at ~130 triangles on its UV seams, a quarter of the far budget for what is a stick at 35 u; this is 24, and the fronds keep
 * their shape. { P, NR, UV, Ik } as the far build takes them
 */
export const FAR_TRUNK = { sides: 6, rings: [0, 0.2, 1] };
export function farTrunk(P, UV, I) {
  const vs = [...new Set(I)]; let y0 = Infinity, y1 = -Infinity; for (const v of vs) { y0 = Math.min(y0, P[v * 3 + 1]); y1 = Math.max(y1, P[v * 3 + 1]); }
  const S = FAR_TRUNK.sides, ring = FAR_TRUNK.rings.map((f) => { const y = y0 + f * (y1 - y0), band = 0.06 * (y1 - y0); let r = 0, v = 0, n = 0;
    for (const q of vs) if (Math.abs(P[q * 3 + 1] - y) <= band) { r += Math.hypot(P[q * 3], P[q * 3 + 2]); v += UV[q * 2 + 1]; n++; }
    return { y, r: n ? r / n : 0.01, v: n ? v / n : f }; });
  const OP = [], ON = [], OU = [], OI = [];
  ring.forEach((g, j) => { const dr = j < ring.length - 1 ? (ring[j + 1].r - g.r) / Math.max(1e-6, ring[j + 1].y - g.y) : (g.r - ring[j - 1].r) / Math.max(1e-6, g.y - ring[j - 1].y), ny = -dr, l = Math.hypot(1, ny);
    for (let k = 0; k <= S; k++) { const a = (k % S) / S * 2 * Math.PI; OP.push(Math.cos(a) * g.r, g.y, Math.sin(a) * g.r); ON.push(Math.cos(a) / l, ny / l, Math.sin(a) / l); OU.push(k / S, g.v); } });
  for (let j = 0; j < ring.length - 1; j++) for (let k = 0; k < S; k++) { const a = j * (S + 1) + k, b = a + 1, c = a + S + 1, d = c + 1; OI.push(a, c, b, b, c, d); }
  return { P: Float64Array.from(OP), NR: Float64Array.from(ON), UV: Float64Array.from(OU), Ik: Uint32Array.from(OI) };
}

// ---- recipes: lib/species.mjs -> a build config ----
export const allIds = () => [...SPECIES.map((s) => s.id), ...AUTUMN.map((a) => a.id)];
/**
 * The build config of one SPECIES or AUTUMN id. An autumn id is its species' recipe with the foliage on autumnStops(hue) and the
 * species' own seed, so its geometry (thinning, growth, atlas cells: the UVs) comes out byte for byte the same; its overlay is dropped.
 */
export function recipe(id) {
  const a = AUTUMN.find((x) => x.id === id);
  if (a) { const f = recipe(a.from); return { ...f, id, geomId: a.from, autumn: a.hue, overlay: null, approved: false, out: path.join(RESKIN, id + '.glb') }; }
  const s = SPECIES.find((x) => x.id === id);
  if (!s) throw new Error(`no recipe '${id}': not in lib/species.mjs SPECIES or AUTUMN`);
  return { id, geomId: id, src: path.join(PACK, s.source + '.gltf'), source: s.source, out: path.join(RESKIN, id + '.glb'), kind: s.kind, height: s.height, cap: s.cap,
    look: s.kind === 'conifer' ? 'v1' : 'r1', approved: !!s.approved, foliage: s.ramp, flowers: s.ramp, bark: s.bark === 'birch' ? 'birch' : s.barkRamp,
    barkPart: s.barkPart || 'bark', overlay: s.overlay || null, ...(s.tune || {}), ...(s.kind !== 'bush' ? { far: { ...(s.far || {}) } } : {}) };
}

// R1 light, as the concepts paint a crown: separate pads, each sunlit on top and deep teal beneath. The kept cards are grouped into
// pads (seeded k-means on their centres, about PAD_CARDS cards a pad, 4..16 pads); a card's light is mostly its height within its own
// pad, then its height in the crown, its smooth normal (up-facing lit) and how far out it sits, jittered
const PAD_CARDS = 40, LIGHT_W = { pad: 0.5, crown: 0.2, normal: 0.1, out: 0.2, jitter: 0.14 };
function lightR1(L, lo, hi, R) {
  const kept = L.cards.filter((c) => !c.out), K = Math.max(4, Math.min(16, Math.round(kept.length / PAD_CARDS)));
  for (const c of L.cards) { let ny = 0, m = 0; for (const t of c.tris) for (let k = 0; k < 3; k++) { ny += L.NR[L.I[t * 3 + k] * 3 + 1]; m++; } c.ny = ny / m; }
  // k-means: farthest-point seeds from the highest card, 10 rounds (deterministic: no randomness, ties by index)
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  let first = 0; kept.forEach((c, i) => { if (c.c[1] > kept[first].c[1]) first = i; });
  const cen = [kept[first].c.slice()];
  while (cen.length < K) { let best = 0, bd = -1; kept.forEach((c, i) => { const d = Math.min(...cen.map((q) => d2(c.c, q))); if (d > bd) { bd = d; best = i; } }); cen.push(kept[best].c.slice()); }
  for (let it = 0; it < 10; it++) {
    for (const c of kept) { let b = 0, bd = Infinity; cen.forEach((q, j) => { const d = d2(c.c, q); if (d < bd) { bd = d; b = j; } }); c.pad = b; }
    cen.forEach((q, j) => { const m = kept.filter((c) => c.pad === j); if (m.length) for (let k = 0; k < 3; k++) q[k] = m.reduce((s, c) => s + c.c[k], 0) / m.length; });
  }
  const pads = cen.map((q, j) => { const m = kept.filter((c) => c.pad === j); return { y0: Math.min(...m.map((c) => c.c[1])), y1: Math.max(...m.map((c) => c.c[1])) }; });
  for (const c of L.cards) { const hf = (c.c[1] - lo[1]) / Math.max(1e-6, hi[1] - lo[1]), p = c.out ? null : pads[c.pad];
    const pf = p && p.y1 > p.y0 ? (c.c[1] - p.y0) / (p.y1 - p.y0) : hf;
    c.light = LIGHT_W.pad * pf + LIGHT_W.crown * hf + LIGHT_W.normal * (0.5 + 0.5 * c.ny) + LIGHT_W.out * Math.min(1, c.d) + (R() - 0.5) * 2 * LIGHT_W.jitter; }
  return K;
}

/** Build one model (cfg: a recipe(), or the ad hoc CLI's flags) into cfg.out; returns the RESULT object (what the file holds). */
export async function build(cfg) {
  const ID = cfg.id, KIND = cfg.kind, HT = +cfg.height, CAP = +cfg.cap;
  if (!ID || !cfg.src || !cfg.out) throw new Error('build: id, src and out are needed');
  if (!['broad', 'conifer', 'bush'].includes(KIND)) throw new Error('--kind must be broad, conifer or bush, got ' + KIND);
  if (!(HT > 0) || !(CAP > 0)) throw new Error('--height and --cap must be positive numbers');
  // sides (tune): 'faceOut' = a broadleaf's leaves single-faced, wound outward on a single-sided material, as the R1 bushes (half the
  // triangles of duplicated faces: twice the cards in a tight cap)
  if (cfg.sides !== undefined && !(cfg.sides === 'faceOut' && KIND === 'broad' && cfg.look !== 'v1')) throw new Error("sides: only 'faceOut', on an R1 broadleaf");
  const KL = { ...(cfg.look === 'v1' ? LOOK_V1 : KIND_LOOK)[KIND], ...(cfg.sides === 'faceOut' ? { dupLeaves: false, faceOut: true, oneSided: true } : {}) };
  const SEED = cfg.seed !== undefined ? (+cfg.seed >>> 0) : seedOf(cfg.geomId || ID), MINKEEP = +(cfg.trim ?? cfg.minKeep ?? KL.minKeep);
  const OV = cfg.overlay ? OVERLAY[cfg.overlay] : null; if (cfg.overlay && !OV) throw new Error('unknown overlay ' + cfg.overlay);
  if (cfg.overlay === 'apple' && KIND !== 'broad') throw new Error('the apple overlay goes in a broadleaf Canopy');
  if (cfg.overlay === 'berry' && KIND !== 'bush') throw new Error('the berry overlay goes on a bush');
  // the thinning's goal: the cap less the overlay's triangles (two-sided: 4 a card); a trim thins to exactly its card floor
  const OVT = OV ? OV.count * 4 : 0, GOAL = cfg.trim ? 0 : CAP - OVT;
  if (!cfg.foliage && cfg.autumn === undefined) throw new Error(`no concept for ${ID}: add it to LOOKS or pass --concept <art/meshy folder>`);
  READ.clear();   // (the concept folders this build reads: conceptRamp / conceptBands, each image or its frozen numbers)
  const IN = cfg.src, OUT = cfg.out, STRETCH = +(cfg.stretch ?? 1);

  // ---- read: every primitive baked into the model's frame, by role ----
  const src = await new NodeIO().read(IN), sroot = src.getRoot(), prims = [], dropped = new Set();
  for (const node of sroot.listNodes()) { const mesh = node.getMesh(); if (!mesh) continue; const M = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const mat = p.getMaterial(), name = mat ? mat.getName() : '', role = /bark/i.test(name) ? 'bark' : /flower/i.test(name) ? 'flowers' : 'leaves';
      const A = p.getAttribute('POSITION'), Nn = p.getAttribute('NORMAL'), U = p.getAttribute('TEXCOORD_0'), n = A.getCount(), e = [0, 0, 0];
      if (!Nn || !U || !p.getIndices()) throw new Error(`${name}: needs NORMAL, TEXCOORD_0 and indices`);
      const P = new Float64Array(n * 3), NR = new Float64Array(n * 3), UV = new Float64Array(n * 2);
      for (let i = 0; i < n; i++) { A.getElement(i, e); for (let k = 0; k < 3; k++) P[i * 3 + k] = M[k] * e[0] + M[4 + k] * e[1] + M[8 + k] * e[2] + M[12 + k];
        Nn.getElement(i, e); const v = [0, 1, 2].map((k) => M[k] * e[0] + M[4 + k] * e[1] + M[8 + k] * e[2]), l = Math.hypot(...v) || 1; for (let k = 0; k < 3; k++) NR[i * 3 + k] = v[k] / l;
        U.getElement(i, e); UV[i * 2] = e[0]; UV[i * 2 + 1] = e[1]; }
      const C = p.getAttribute('COLOR_0'); if (C) { let lo = Infinity, hi = -Infinity; const c = []; for (let i = 0; i < C.getCount(); i++) { C.getElement(i, c); for (let k = 0; k < 3; k++) { lo = Math.min(lo, c[k]); hi = Math.max(hi, c[k]); } }
        dropped.add(`COLOR_0 on ${name}: ${lo > 0.999 && hi < 1.001 ? 'neutral (all 1)' : `NOT neutral (${lo.toFixed(2)}..${hi.toFixed(2)})`}`); }
      if (mat && mat.getNormalTexture()) dropped.add(`normal map on ${name}`);
      const tex = mat && mat.getBaseColorTexture(); if (!tex) throw new Error(`${name}: no base colour texture`);
      const ti = mat.getBaseColorTextureInfo();
      prims.push({ role, name, mat, P, NR, UV, I: Uint32Array.from(p.getIndices().getArray()), tex: decodeImage(tex.getImage(), tex.getMimeType()),
        sampler: { wrapS: ti.getWrapS(), wrapT: ti.getWrapT(), min: ti.getMinFilter() ?? 9987, mag: ti.getMagFilter() ?? 9729 } });
    } }
  const byRole = (r) => prims.filter((p) => p.role === r);
  if (byRole('leaves').length !== 1) throw new Error('expected exactly one leaves primitive, got ' + byRole('leaves').length);
  if (KIND === 'bush' ? byRole('bark').length !== 0 : byRole('bark').length !== 1) throw new Error(`${KIND}: expected ${KIND === 'bush' ? 'no' : 'exactly one'} bark primitive, got ${byRole('bark').length}`);
  if (KIND !== 'bush' && byRole('flowers').length) throw new Error('flowers are only packed for --kind bush');
  if (byRole('flowers').length > 1) throw new Error('expected at most one flowers primitive');
  const bark = byRole('bark')[0], leaves = byRole('leaves')[0], flowers = byRole('flowers')[0];
  // leafTex (tune): another of the pack's leaf pictures on the same cards (each card maps the whole 0..1 picture), e.g. the pointed
  // Leaves_NormalTree_C for a bush whose kit leaves are round blobs
  if (cfg.leafTex) { if (!/^Leaves_\w+\.png$/.test(cfg.leafTex)) throw new Error('leafTex: a Leaves_*.png of the pack'); leaves.tex = decodePNG(fs.readFileSync(path.join(PACK, cfg.leafTex))); }

  // ---- 0. bark: hidden branches out (broadleaf; --keepBark keeps it all), or every branch out (trunkOnly); in the source's own frame,
  //      before anything moves; never the trunk, never (hidden) a branch seen below or outside the crown ----
  let barkHidden = null;
  // (a rebuilt fir, step 3c, keeps the trunk alone too: its twigs belong to the source's fronds where they were)
  const TRUNK_ONLY = !!(cfg.trunkOnly || KL.rebuild);
  if (bark && (TRUNK_ONLY || (KL.hideBark && !cfg.keepBark))) {
    const comps = hiddenBark(bark.P, bark.I, leaves.P, leaves.I), goes = (c) => (TRUNK_ONLY ? !c.trunk : c.hidden), keep = [];
    for (const c of comps) if (!goes(c)) keep.push(...c.tris); keep.sort((a, b) => a - b);
    const I2 = new Uint32Array(keep.length * 3); keep.forEach((t, j) => { I2[j * 3] = bark.I[t * 3]; I2[j * 3 + 1] = bark.I[t * 3 + 1]; I2[j * 3 + 2] = bark.I[t * 3 + 2]; });
    const gone = comps.filter(goes);
    barkHidden = { mode: TRUNK_ONLY ? 'trunk only' : 'hidden', sourceTris: bark.I.length / 3, components: comps.length, trunkTris: comps.find((c) => c.trunk).tris.length, removed: gone.map((c) => c.first),
      removedTris: gone.reduce((t, c) => t + c.tris.length, 0), keptBranches: comps.filter((c) => !c.trunk && !goes(c)).map((c) => `${c.tris.length}t ${Math.round(100 * c.inside / c.n)}%in${c.below ? ' below' : ''}`) };
    bark.I = I2;
  }

  // ---- 1. normalise (again after the cards grow, step 3b); stretch (tune): x and z scaled once more (a broader crown), normals with it ----
  const normalise = (onAxis = false) => {   // (onAxis: x, z kept, the rebuilt fir already centred on its straight trunk)
    let y0 = Infinity, y1 = -Infinity; for (const p of prims) { const [a, b] = bboxY(p.P); y0 = Math.min(y0, a); y1 = Math.max(y1, b); }
    const s = HT / (y1 - y0), band = y0 + 0.1 * (y1 - y0); let ax = 0, az = 0, an = 0;
    for (const p of prims) for (let i = 0; i < p.P.length; i += 3) if (p.P[i + 1] <= band) { ax += p.P[i]; az += p.P[i + 2]; an++; }
    ax = onAxis ? 0 : ax / an; az = onAxis ? 0 : az / an;
    for (const p of prims) for (let i = 0; i < p.P.length; i += 3) { p.P[i] = (p.P[i] - ax) * s; p.P[i + 1] = (p.P[i + 1] - y0) * s; p.P[i + 2] = (p.P[i + 2] - az) * s; }
    return s;
  };
  normalise();
  if (STRETCH !== 1) {
    if (!(STRETCH > 0.5 && STRETCH < 2)) throw new Error('stretch must be within 0.5..2');
    for (const p of prims) for (let i = 0; i < p.P.length; i += 3) { p.P[i] *= STRETCH; p.P[i + 2] *= STRETCH;
      const n = [p.NR[i] / STRETCH, p.NR[i + 1], p.NR[i + 2] / STRETCH], l = Math.hypot(...n) || 1; p.NR[i] = n[0] / l; p.NR[i + 1] = n[1] / l; p.NR[i + 2] = n[2] / l; }
  }
  // (R1) the leaves' normals bent toward +Y by normalUp: the painted shade-to-sun atlas carries the crown's light, as the concept paints
  // it, instead of the game's light shading every underside a second time (warm brown from the ground hemisphere: muddy, olive shadows)
  const NUP = +(cfg.normalUp ?? KL.normalUp ?? 0);
  if (NUP > 0) for (const p of prims) { if (p.role === 'bark') continue;
    for (let i = 0; i < p.NR.length; i += 3) { const n = [p.NR[i] * (1 - NUP), p.NR[i + 1] * (1 - NUP) + NUP, p.NR[i + 2] * (1 - NUP)], l = Math.hypot(...n) || 1; p.NR[i] = n[0] / l; p.NR[i + 1] = n[1] / l; p.NR[i + 2] = n[2] / l; } }
  // (R1 bush, faceOut sapling) every leaf triangle wound to face along its smooth (outward) normals, on a SINGLE-sided material: on a
  // doubleSided one a card seen from its back gets its normal flipped (about half the MegaKit's cards face in), and those backs went
  // near black under the game's noon light (round 1's dark speckle). Wound outward and single-sided, the near side's cards face the
  // camera and the far side's backs are culled instead of drawn black (the broadleaf duplicates its faces: twice the triangles)
  let rewound = 0; const ONESIDED = !!(cfg.oneSided ?? KL.oneSided);
  // The flowers (the recoloured flowering bush) are wound to face UP instead: they sit on the bush's top, and a flower whose front
  // faced away from the camera, drawn as a dark back on round 1's doubleSided material, would be culled; facing up, every elevated
  // camera (the game's: 29 deg) sees each flower from any side
  if (KL.faceOut) for (const p of prims) { if (p.role === 'bark') continue; const P = p.P, N = p.NR, I = p.I, up = p.role === 'flowers';
    for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [I[t], I[t + 1], I[t + 2]], u = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), w = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]);
      const g = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], s = up ? g[1] : [0, 1, 2].reduce((acc, k) => acc + g[k] * (N[a * 3 + k] + N[b * 3 + k] + N[c * 3 + k]), 0);
      if (s < 0) { I[t + 1] = c; I[t + 2] = b; rewound++; } } }

  // ---- 3c. (conifer, KL.rebuild) the fir rebuilt around a straight trunk (the owner, 2026-10-25: "They don't have a consistent shape
  //      all around, and look warped"): every MegaKit pine leans and its trunk bends toward -z (Pine_5's top 1.3 source units off its
  //      foot), and its fronds crowd one side, so each random rotY showed the player another lopsided silhouette.
  //      * the trunk's centre line, per height slab (FIR.slabs, the mean of its vertices, smoothed), taken out of every bark vertex: the
  //        trunk stands straight; then simplified (simplifyMesh) to the cap's slack after the fronds, never below FIR.barkMin;
  //      * the fronds (the leaf cards) by height of their trunk end (the vertex nearest the centre line): as many as fit the cap beside
  //        FIR.barkMin of trunk, the rest out at evenly spaced ranks (never more than 1 - FIR.minFronds of them: an error);
  //      * each kept frond, its own shape unchanged, moved so its trunk end sits on the axis, turned to the golden angle (GOLDEN) from
  //        the one below (+- FIR.jitterAz, seeded; the lowest FIR.whorl evenly round as one whorl; the most even of FIR.tries seeds) and scaled about its trunk end so its reach lies on the source's own cone (the
  //        least-squares line of the fronds' reach over height, +- FIR.jitterLen): the same crown from every side;
  //      then normalised again. A frond's texture v at its trunk end is kept for the atlas (step 4: shade to sun along it) ----
  let firInfo = null, firBaseV = 0;
  if (KL.rebuild && KIND === 'conifer') {
    const BI = bark.I, BP = bark.P, S = FIR.slabs;
    let ty0 = Infinity, ty1 = -Infinity; const bvs = new Set(BI); for (const v of bvs) { ty0 = Math.min(ty0, BP[v * 3 + 1]); ty1 = Math.max(ty1, BP[v * 3 + 1]); }
    const sx = new Float64Array(S), sz = new Float64Array(S), sn = new Float64Array(S), slab = (y) => Math.max(0, Math.min(S - 1, Math.floor((y - ty0) / (ty1 - ty0) * S)));
    for (const v of bvs) { const k = slab(BP[v * 3 + 1]); sx[k] += BP[v * 3]; sz[k] += BP[v * 3 + 2]; sn[k]++; }
    const cx = [], cz = []; for (let k = 0; k < S; k++) { cx.push(sn[k] ? sx[k] / sn[k] : NaN); cz.push(sn[k] ? sz[k] / sn[k] : NaN); }
    for (const a of [cx, cz]) { for (let k = 0; k < S; k++) if (!(a[k] === a[k])) { let j = 1; while (!(a[k - j] === a[k - j]) && !(a[k + j] === a[k + j])) j++; a[k] = a[k - j] === a[k - j] ? a[k - j] : a[k + j]; }
      const b = a.slice(); for (let k = 0; k < S; k++) a[k] = (b[Math.max(0, k - 1)] + 2 * b[k] + b[Math.min(S - 1, k + 1)]) / 4; }
    const line = (y) => { const t = Math.max(0, Math.min(S - 1, (y - ty0) / (ty1 - ty0) * S - 0.5)), i = Math.min(S - 2, Math.floor(t)), f = t - i; return [cx[i] + (cx[i + 1] - cx[i]) * f, cz[i] + (cz[i + 1] - cz[i]) * f]; };
    let bent = 0; for (let k = 0; k < S; k++) bent = Math.max(bent, Math.hypot(cx[k], cz[k]));
    for (const v of bvs) { const [lx, lz] = line(BP[v * 3 + 1]); BP[v * 3] -= lx; BP[v * 3 + 2] -= lz; }
    // the fronds: trunk end, direction (to the card's centre), reach (from the trunk end, in xz)
    const LPs = leaves.P, LN = leaves.NR, LU = leaves.UV, cards0 = components(LPs, leaves.I);
    const fr = cards0.map((c, ci) => { const vs = [...new Set(c.tris.flatMap((t) => [leaves.I[t * 3], leaves.I[t * 3 + 1], leaves.I[t * 3 + 2]]))];
      let base = vs[0], bd = Infinity; for (const v of vs) { const [lx, lz] = line(LPs[v * 3 + 1]), d = Math.hypot(LPs[v * 3] - lx, LPs[v * 3 + 2] - lz); if (d < bd) { bd = d; base = v; } }
      const b = [LPs[base * 3], LPs[base * 3 + 1], LPs[base * 3 + 2]]; let mx = 0, mz = 0, reach = 0, tip = base;
      for (const v of vs) { mx += LPs[v * 3] / vs.length; mz += LPs[v * 3 + 2] / vs.length; const r = Math.hypot(LPs[v * 3] - b[0], LPs[v * 3 + 2] - b[2]); if (r > reach) { reach = r; tip = v; } }
      return { ci, vs, tris: c.tris, base: b, y: b[1], dir: Math.atan2(mz - b[2], mx - b[0]), reach, tip, baseV: LU[base * 2 + 1], tipV: LU[tip * 2 + 1] }; });
    fr.sort((a, b) => a.y - b.y || a.ci - b.ci);
    // the trunk end's texture v: the side most fronds start on
    firBaseV = fr.filter((f) => f.baseV - Math.floor(f.baseV) < f.tipV - Math.floor(f.tipV)).length * 2 >= fr.length ? 0 : 1;
    // the source's cone: reach = a + b y, least squares
    let my = 0, mr = 0; for (const f of fr) { my += f.y / fr.length; mr += f.reach / fr.length; }
    let sxy = 0, syy = 0; for (const f of fr) { sxy += (f.y - my) * (f.reach - mr); syy += (f.y - my) ** 2; }
    const slope = syy > 0 ? sxy / syy : 0, icpt = mr - slope * my, maxReach = Math.max(...fr.map((f) => f.reach));
    // (a cone: the fit's reach at the lowest frond (at most the longest frond's), narrowing straight to FIR.tip of it at the top of the leaves:
    // round 1 kept each frond's own reach, long and short side by side, a ragged outline)
    let apex = -Infinity; for (const f of fr) for (const v of f.vs) apex = Math.max(apex, LPs[v * 3 + 1]);
    const y0f = fr[0].y, rBase = Math.min(maxReach, icpt + slope * y0f) * +(cfg.coneReach ?? 1), cone = (y) => rBase * (FIR.tip + (1 - FIR.tip) * Math.max(0, Math.min(1, (apex - y) / Math.max(1e-6, apex - y0f))));
    // how many fronds fit: the cap less FIR.barkMin of trunk; out at evenly spaced ranks, any that fits the slack back (the topmost first)
    const all = fr.reduce((t, f) => t + f.tris.length, 0), barkSrc = BI.length / 3, room = GOAL - Math.min(barkSrc, FIR.barkMin);
    const out = new Set(); let leafT = all;
    for (let d = 1; leafT > room && d <= fr.length; d++) { out.clear(); for (let j = 0; j < d; j++) out.add(Math.min(fr.length - 1, Math.floor((j + 0.5) * fr.length / d))); leafT = fr.reduce((t, f, i) => t + (out.has(i) ? 0 : f.tris.length), 0); }
    for (const i of [...out].sort((a, b) => b - a)) if (leafT + fr[i].tris.length <= room) { out.delete(i); leafT += fr[i].tris.length; }
    const kept = fr.filter((f, i) => !out.has(i)), floorN = Math.ceil(FIR.minFronds * fr.length);
    if (kept.length < floorN) throw new Error(`cap ${CAP} unreachable: a rebuilt fir keeps >= ${floorN} of its ${fr.length} fronds (FIR.minFronds ${FIR.minFronds}), and ${kept.length} fit beside ${Math.min(barkSrc, FIR.barkMin)} tris of trunk`);
    // the trunk simplified to the slack the fronds leave (never below FIR.barkMin)
    const barkGoal = Math.max(FIR.barkMin, GOAL - leafT), barkStop = {};
    if (barkGoal < barkSrc) bark.I = simplifyMesh(BP, bark.NR, bark.UV, BI, barkGoal, barkStop);
    // the kept fronds laid out: trunk end on the axis, the golden angle from the one below, reach on the cone. The lowest FIR.whorl
    // fronds a whorl: evenly round, at their mean height, hanging at their mean angle (the crown's skirt as even as the rest); the golden
    // angle goes on from between two of them. FIR.tries seeded layouts (their start angle and jitter), the most even kept (crownEvenness:
    // per height band, the max reach round the trunk, its max / min over 8 directions at 4 phases; the worst band): a crown's few
    // longest fronds in each band decide its outline there, and one seed's luck put two of them side by side
    const W = Math.min(FIR.whorl, kept.length), riseOf = (f) => Math.atan2(LPs[f.tip * 3 + 1] - f.base[1], Math.hypot(LPs[f.tip * 3] - f.base[0], LPs[f.tip * 3 + 2] - f.base[2]));
    const wY = kept.slice(0, W).reduce((t, f) => t + f.y / W, 0), wRise = kept.slice(0, W).reduce((t, f) => t + riseOf(f) / W, 0);
    const lay = (variant) => {
      const RL = rng((SEED ^ 0xf12) + variant * 0x9e3779b1), P2 = [], N2 = [], U2 = [], I2 = [], frondOf = [], th0 = RL() * 360; let lowered = 0;
      kept.forEach((f, k) => {
        const az = k < W ? th0 + k * 360 / W : th0 + 180 / W + (k - W) * GOLDEN, by = k < W ? wY : f.base[1];
        const th = (az + (RL() - 0.5) * 2 * FIR.jitterAz) * Math.PI / 180, da = th - f.dir, ca = Math.cos(da), sa = Math.sin(da);
        const s = Math.max(FIR.scale[0], Math.min(FIR.scale[1], cone(f.y) * (1 + (RL() - 0.5) * 2 * FIR.jitterLen) / Math.max(1e-6, f.reach)));
        // (a frond rising steeper than FIR.maxRise, trunk end to tip, is lowered to it about the horizontal through its trunk end, and one
        // in the top FIR.topBand of the crown hanging steeper than FIR.topDroop raised to it: from the game's 29 deg camera a frond tilted
        // past ~29 deg away from it shows its underside, drawn near black on the doubleSided leaves; the top fronds hang 25-40 deg, and
        // those on the far side stood over the top as dark flags)
        // (yaw: also widened FIR.widen x across the frond, horizontally: each frond covers more of the circle round the trunk, so the few
        // longest fronds of a height band leave no bare side between them; a normal across it shrinks as much, renormalised)
        const ct = Math.cos(th), st = Math.sin(th), wide = (x, z, k) => { const a = x * ct + z * st, b = (-x * st + z * ct) * k; return [a * ct - b * st, a * st + b * ct]; };
        const yaw = (x, z, k = FIR.widen) => wide(x * ca - z * sa, x * sa + z * ca, k), mr = FIR.maxRise * Math.PI / 180;
        const top = (apex - f.y) / Math.max(1e-6, apex - y0f) < FIR.topBand, md = -FIR.topDroop * Math.PI / 180;
        const rise = riseOf(f), phi = k < W ? wRise - rise : rise > mr ? mr - rise : top && rise < md ? md - rise : 0;
        const K = [-Math.sin(th), 0, Math.cos(th)], cp = Math.cos(phi), sp = Math.sin(phi);
        const turn = (v) => { const kv = K[0] * v[0] + K[2] * v[2], c = [K[1] * v[2] - K[2] * v[1], K[2] * v[0] - K[0] * v[2], K[0] * v[1] - K[1] * v[0]];
          return [0, 1, 2].map((q) => v[q] * cp + c[q] * sp + K[q] * kv * (1 - cp)); };
        if (phi) lowered++;
        const map = new Map();
        for (const v of f.vs) { map.set(v, P2.length / 3); frondOf.push(k);
          const [rx, rz] = yaw((LPs[v * 3] - f.base[0]) * s, (LPs[v * 3 + 2] - f.base[2]) * s), d = turn([rx, (LPs[v * 3 + 1] - f.base[1]) * s, rz]);
          P2.push(d[0] + (k < W ? ct * 0.004 : 0), by + d[1], d[2] + (k < W ? st * 0.004 : 0));   // (a whorl's fronds a hair apart: not welded at the trunk into one card)
          const [nx, nz] = yaw(LN[v * 3], LN[v * 3 + 2], 1 / FIR.widen), n0 = turn([nx, LN[v * 3 + 1], nz]), nl = Math.hypot(...n0) || 1; N2.push(n0[0] / nl, n0[1] / nl, n0[2] / nl); U2.push(LU[v * 2], LU[v * 2 + 1]); }
        for (const t of f.tris) for (let j = 0; j < 3; j++) I2.push(map.get(leaves.I[t * 3 + j]));
      });
      return { P2, N2, U2, I2, frondOf, lowered, even: crownEvenness(P2, I2) };
    };
    // (the FIR.farTries most even layouts also simplified as the far version will be, step 7: the frond floors FIR.farFloor by each
    // frond's centre, its leafTris; the one whose worse crown, near or far, is the more even kept)
    const FF = { ...FAR, ...(cfg.far || {}) };
    const farEven = (L) => {
      const n = kept.length, nF = Math.max(1, Math.round(FF.cards * n)), out = firLeave(n, nF), G = Math.min(FF.growMax, Math.sqrt(n / nF)), cy = new Float64Array(n), cn = new Float64Array(n);
      for (const v of L.I2) { cy[L.frondOf[v]] += L.P2[v * 3 + 1]; cn[L.frondOf[v]]++; }
      const P = Float64Array.from(L.P2), byF = Array.from({ length: n }, () => new Set());
      for (const v of L.I2) byF[L.frondOf[v]].add(v);
      for (let k = 0; k < n; k++) { const m = [0, 0, 0]; for (const v of L.I2) if (L.frondOf[v] === k) for (let q = 0; q < 3; q++) m[q] += L.P2[v * 3 + q] / cn[k];
        cy[k] = m[1]; if (out.has(k) || G === 1) continue; let r0 = 0, r1 = 0;
        for (const v of byF[k]) { for (let q = 0; q < 3; q++) P[v * 3 + q] = m[q] + (L.P2[v * 3 + q] - m[q]) * G; r0 = Math.max(r0, Math.hypot(L.P2[v * 3], L.P2[v * 3 + 2])); r1 = Math.max(r1, Math.hypot(P[v * 3], P[v * 3 + 2])); }
        const mr = Math.hypot(m[0], m[2]); if (mr > 1e-6) for (const v of byF[k]) { P[v * 3] -= m[0] / mr * (r1 - r0); P[v * 3 + 2] -= m[2] / mr * (r1 - r0); } }
      const ylo = Math.min(...cy), yhi = Math.max(...cy), I = Uint32Array.from(L.I2.filter((v, i) => !out.has(L.frondOf[L.I2[i - i % 3]])));
      const ix = FF.leafTris ? simplifyMesh(P, Float64Array.from(L.N2), Float64Array.from(L.U2), I, FF.leafTris, null, { of: L.frondOf, floor: (k) => FIR.farFloor[cy[k] > ylo + (1 - FIR.topBand) * (yhi - ylo) ? 1 : 0] }) : I;
      return crownEvenness(P, ix); };
    const cands = Array.from({ length: FIR.tries }, (_, v) => ({ ...lay(v), variant: v })).sort((a, b) => a.even - b.even || a.variant - b.variant).slice(0, FIR.farTries);
    for (const c of cands) { c.farEven = farEven(c); c.score = Math.max(c.even, c.farEven); }
    const best = cands.slice().sort((a, b) => a.score - b.score || a.variant - b.variant)[0];
    const { P2, N2, U2, I2, lowered } = best;
    leaves.P = Float64Array.from(P2); leaves.NR = Float64Array.from(N2); leaves.UV = Float64Array.from(U2); leaves.I = Uint32Array.from(I2);
    // the trunk inside the crown pressed down so its tip ends FIR.trunkTop of the way from the lowest frond to the top of the leaves (the
    // straight trunk's tip, 0.9 of the height, poked out of the narrow top as a brown stub); the bare trunk below the crown is untouched
    let leafTop = -Infinity; for (let i = 1; i < leaves.P.length; i += 3) leafTop = Math.max(leafTop, leaves.P[i]);
    const tTop = y0f + FIR.trunkTop * (leafTop - y0f), tk = ty1 > tTop ? (tTop - y0f) / (ty1 - y0f) : 1;
    if (tk < 1) for (const v of bvs) if (BP[v * 3 + 1] > y0f) BP[v * 3 + 1] = y0f + (BP[v * 3 + 1] - y0f) * tk;
    firInfo = { fronds: `${kept.length}/${fr.length}`, bark: `${bark.I.length / 3}/${barkSrc}`, ...(Object.keys(barkStop).length ? { barkStop } : {}), bentWas: +bent.toFixed(4),
      cone: { base: +rBase.toFixed(4), y0: +y0f.toFixed(4), apex: +apex.toFixed(4) }, lowered, layout: { tries: FIR.tries, chosen: best.variant, evenness: +best.even.toFixed(3), farEvenness: +best.farEven.toFixed(3) }, trunkTop: +tk.toFixed(3), baseV: firBaseV };
    normalise(true);
  }

  // ---- 3. thin: whole cards, interior first (seeded), until the total <= the goal (a trim: down to its floor) ----
  const fol = [leaves, flowers].filter(Boolean), R = rng(SEED);
  for (const p of fol) p.cards = components(p.P, p.I);
  const all = fol.flatMap((p) => p.cards), cen = [0, 0, 0], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of all) for (let k = 0; k < 3; k++) { cen[k] += c.c[k] / all.length; lo[k] = Math.min(lo[k], c.c[k]); hi[k] = Math.max(hi[k], c.c[k]); }
  const half = [0, 1, 2].map((k) => Math.max(1e-6, (hi[k] - lo[k]) / 2));
  for (const p of fol) { for (const c of p.cards) { c.d = Math.hypot(...[0, 1, 2].map((k) => (c.c[k] - cen[k]) / half[k])); c.score = c.d * (0.85 + 0.3 * R()); }
    p.order = p.cards.map((c, i) => i).sort((a, b) => p.cards[a].score - p.cards[b].score || a - b); p.removed = 0; p.floor = Math.ceil(MINKEEP * p.cards.length); }
  // (a foliage triangle costs DUP output triangles: twice with dupLeaves)
  const DUP = KL.dupLeaves ? 2 : 1, triCount = (p) => p.I.length / 3, keptTris = (p) => p.cards.reduce((t, c) => t + (c.out ? 0 : c.tris.length * DUP), 0);
  let total = (bark ? triCount(bark) : 0) + fol.reduce((t, p) => t + triCount(p) * DUP, 0); const gone = [];
  while (total > GOAL) {
    // the foliage part keeping the largest share loses its next interior card (leaves first on a tie)
    const cand = fol.filter((p) => p.removed < p.cards.length - p.floor).sort((a, b) => (b.cards.length - b.removed) / b.cards.length - (a.cards.length - a.removed) / a.cards.length);
    if (!cand.length) { if (cfg.trim && total + OVT <= CAP) break;
      throw new Error(`cap ${CAP} unreachable: bark ${bark ? triCount(bark) : 0} + ${fol.map((p) => `${p.name} at its floor ${p.floor} of ${p.cards.length} cards = ${keptTris(p)} tris`).join(' + ')}${OVT ? ` + overlay ${OVT}` : ''} (--minKeep ${MINKEEP})`); }
    const p = cand[0], c = p.cards[p.order[p.removed++]]; c.out = true; total -= c.tris.length * DUP; gone.push(c);
  }
  // no further than needed: the last card out may have been a big one (a bush's flower cluster); cards that fit the slack come back,
  // the latest removed (the least interior) first (a trim keeps exactly its floor)
  if (!cfg.trim) for (let k = gone.length - 1; k >= 0; k--) if (gone[k].tris.length * DUP <= GOAL - total) { gone[k].out = false; total += gone[k].tris.length * DUP; }
  for (const p of fol) { const keep = []; for (const c of p.cards) if (!c.out) keep.push(...c.tris); keep.sort((a, b) => a - b);
    const I2 = new Uint32Array(keep.length * 3); keep.forEach((t, j) => { I2[j * 3] = p.I[t * 3]; I2[j * 3 + 1] = p.I[t * 3 + 1]; I2[j * 3 + 2] = p.I[t * 3 + 2]; }); p.Ik = I2; }
  if (bark) bark.Ik = bark.I;

  // ---- 3b. grow: every kept card scaled about its own centre by sqrt(source foliage tris / kept), at most growMax (default 1.5; --grow
  //      k sets it, 1 = off), so a thinned crown covers about the area the full one did instead of showing holes; then normalised again ----
  const fTot = fol.reduce((t, p) => t + p.I.length / 3, 0), fKept = fol.reduce((t, p) => t + p.Ik.length / 3, 0);
  const GROW = (cfg.grow ?? 'auto') === 'auto' ? Math.min(+(cfg.growMax ?? 1.5), Math.sqrt(fTot / fKept)) : +cfg.grow;
  if (!(GROW >= 1)) throw new Error('--grow must be >= 1 (or auto)');
  if (GROW > 1) {
    for (const p of fol) for (const c of p.cards) { if (c.out) continue; const vs = new Set(); for (const t of c.tris) for (let j = 0; j < 3; j++) vs.add(p.I[t * 3 + j]);
      for (const v of vs) for (let q = 0; q < 3; q++) p.P[v * 3 + q] = c.c[q] + (p.P[v * 3 + q] - c.c[q]) * GROW; }
    normalise();
  }

  // the crown's light: every leaf card takes a cell of the leaf atlas, shade (0) to sun (3), by its light (v1: its height in the crown,
  // mostly, and how far out it sits; r1: lightR1), jittered (seeded) so the bands break up like dabs; its UVs move into the cell (whole
  // UV tiles off first: a card the MegaKit tiled one repeat over keeps its picture). The cells split the kept cards by rank, in KL.shares.
  const R2 = rng(SEED ^ 0x5eed), cellCards = [0, 0, 0, 0];
  // (look-sheet experiments may override the cells: --set shares=a,b,c,d / windows=a-b,c-d,e-f,g-h / interp=rgb|hsv)
  const list = (v) => (typeof v === 'string' ? v.split(',').map((x) => (x.includes('-') ? x.split('-').map(Number) : +x)) : v);
  const SHARES = list(cfg.shares) ?? KL.shares, WINS = list(cfg.windows) ?? (KL.windows === 'fir' ? FIR_WINDOWS : KL.windows), INTERP = cfg.interp ?? KL.interp ?? 'rgb';
  leaves.cardOf = new Int32Array(leaves.P.length / 3).fill(-1);
  leaves.cards.forEach((c, ci) => {
    if (KL.light === 'v1') { const hf = (c.c[1] - lo[1]) / Math.max(1e-6, hi[1] - lo[1]); c.light = 0.75 * hf + 0.25 * Math.min(1, c.d) + (R2() - 0.5) * 0.2; }
    else if (KL.light === 'fir') c.light = (c.c[1] - lo[1]) / Math.max(1e-6, hi[1] - lo[1]);   // (the fir: its height in the crown alone, no jitter: no slabs of tone)
    let mu = Infinity, mv = Infinity; for (const tr of c.tris) for (let k = 0; k < 3; k++) { const v = leaves.I[tr * 3 + k]; leaves.cardOf[v] = ci; mu = Math.min(mu, leaves.UV[v * 2]); mv = Math.min(mv, leaves.UV[v * 2 + 1]); }
    c.ou = Math.floor(mu + 0.01); c.ov = Math.floor(mv + 0.01);
  });
  const pads = KL.light === 'r1' ? lightR1(leaves, lo, hi, R2) : null;
  { const kept = leaves.cards.map((c, ci) => ci).filter((ci) => !leaves.cards[ci].out).sort((a, b) => leaves.cards[a].light - leaves.cards[b].light || a - b);
    const bound = []; let acc = 0; for (const s of SHARES) bound.push((acc += s));   // the cells' cumulative shares, shade .. sun
    kept.forEach((ci, r) => { const c = leaves.cards[ci], q = r / kept.length, k = bound.findIndex((b) => q < b); c.cell = k < 0 ? SHARES.length - 1 : k; cellCards[c.cell]++; });
    for (const c of leaves.cards) if (c.out) c.cell = 0; }
  const leafUV = (cells, TW, TH) => (u, v, vi) => { const c = leaves.cards[leaves.cardOf[vi]], cell = cells[c.cell], uu = u - c.ou, vv = v - c.ov;
    if (uu < -0.01 || vv < -0.01 || uu > 1.01 || vv > 1.01) throw new Error(`a leaf card spans more than one UV tile (${u.toFixed(4)}, ${v.toFixed(4)}): it cannot go into the leaf atlas`);
    return [(cell.x + Math.min(1, Math.max(0, uu)) * cell.w) / TW, (cell.y + Math.min(1, Math.max(0, vv)) * cell.h) / TH]; };

  // ---- 4. repaint ----
  let rampF;
  if (cfg.autumn !== undefined) rampF = { stops: autumnStops(+cfg.autumn) };
  else if (KL.ramp === 'bands') rampF = conceptBands(cfg.foliage, +(cfg.hueSpread ?? 1));
  else {
    rampF = conceptRamp(cfg.foliage, 'foliage', KL.pct);
    // round 1's look pass (tuned by eye on the turntable sheet): the concept's foliage stops a little more saturated and lighter
    // (KL.lift), so the game's lighting on top of them reads as the concept's painted greens, not olive. Hue untouched.
    rampF.stops = rampF.stops.map((c) => { const [h, s2, v] = hsv(...c); return rgbOf(h, Math.min(1, s2 * KL.lift.s), Math.min(1, v * KL.lift.v)).map(Math.round); });
  }
  const birch = cfg.bark === 'birch', rampB = bark && !birch ? conceptRamp(cfg.bark, cfg.barkPart || 'bark') : null;
  const ramps = { foliage: rampF.stops.map(hex), ...(rampB ? { bark: rampB.stops.map(hex) } : {}), ...(birch ? { bark: 'birch' } : {}) };
  const doc = new Document(), buf = doc.createBuffer(), acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const pngTex = (name, img) => doc.createTexture(name).setMimeType('image/png').setImage(new Uint8Array(encodePNG(img)));
  const leafMat = (name, t, sampler) => { const m = doc.createMaterial(name).setBaseColorTexture(t).setAlphaMode('MASK').setAlphaCutoff(leaves.mat.getAlphaMode() === 'MASK' ? leaves.mat.getAlphaCutoff() : 0.4)
    .setDoubleSided(KL.dupLeaves || (KL.faceOut && ONESIDED) ? false : leaves.mat.getDoubleSided()).setMetallicFactor(0).setRoughnessFactor(1);
    m.getBaseColorTextureInfo().setWrapS(sampler.wrapS).setWrapT(sampler.wrapT).setMinFilter(sampler.min).setMagFilter(sampler.mag); return m; };
  const makePrim = (parts, off, mat, dup = false) => primIn(doc, acc, parts, off, mat, dup);
  // the overlay (R1): cards placed on the kept leaves (their final positions), painted atlas, its own material, a primitive in `off`'s frame
  // (nearMats: the near version's materials and leaf-atlas cells, which the far version shares)
  let ovCards = null, ovPrim = null; const nearMats = {};
  if (OV) {
    ovCards = placeOverlay(cfg.overlay, leaves, SEED ^ 0x0fe1, HT);
    const om = doc.createMaterial(ID + '_overlay').setBaseColorTexture(pngTex(ID + '_overlay', paintOverlay(cfg.overlay, SEED + 404))).setAlphaMode('MASK').setAlphaCutoff(0.5)
      .setDoubleSided(false).setMetallicFactor(0).setRoughnessFactor(1);
    om.getBaseColorTextureInfo().setWrapS(33071).setWrapT(33071).setMinFilter(9987).setMagFilter(9729);
    nearMats.overlay = om;
    ovPrim = (off) => overlayPrimIn(doc, acc, om, ovCards, off);
  }
  const scene = doc.createScene('Scene'); doc.getRoot().setDefaultScene(scene);
  const info = { textures: [], atlas: null, flat: null };
  let pivot = null;
  if (KIND === 'bush' && (KL.light === 'v1' || flowers)) {
    // a bush with flowers (and round 1's bush look): one 512 atlas, four 256 quarters: the leaf atlas (2 x 2 cells of 128, shade to
    // sun; R1: its windows, HSV ramp), the pink flowers, a cream copy, (empty: the leaves' mean colour under clear alpha)
    const C = ATLAS / 2, atlas = { width: ATLAS, height: ATLAS, data: new Uint8Array(ATLAS * ATLAS * 4) };
    const put = (img, x0, y0) => { for (let y = 0; y < img.height; y++) atlas.data.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), ((y0 + y) * ATLAS + x0) * 4); };
    const LA = leafAtlas(leaves.tex, C / 2, C / 2, rampF.stops, false, SEED, WINS ?? WINDOWS, INTERP), L = LA; put(LA.img, 0, 0); info.flat = LA.flat;
    const reg = { leaves: LA.cells };
    const m = [0, 0, 0]; let mn = 0; for (let i = 0; i < C * C; i++) if (L.img.data[i * 4 + 3] >= 128) { for (let k = 0; k < 3; k++) m[k] += L.img.data[i * 4 + k]; mn++; }
    for (let y = C; y < ATLAS; y++) for (let x = C; x < ATLAS; x++) for (let k = 0; k < 3; k++) atlas.data[(y * ATLAS + x) * 4 + k] = Math.round(m[k] / mn);
    let flowerMap = null;
    if (flowers) {
      const FW = flowers.tex.width, FH = flowers.tex.height; let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
      for (let k = 0; k < flowers.Ik.length; k++) { const v = flowers.Ik[k]; u0 = Math.min(u0, flowers.UV[v * 2]); u1 = Math.max(u1, flowers.UV[v * 2]); v0 = Math.min(v0, flowers.UV[v * 2 + 1]); v1 = Math.max(v1, flowers.UV[v * 2 + 1]); }
      if (u0 < 0 || v0 < 0 || u1 > 1 || v1 > 1) throw new Error('flowers: UVs outside 0..1 cannot be packed into the atlas');
      const x0 = Math.max(0, Math.floor(u0 * FW) - 6), y0c = Math.max(0, Math.floor(v0 * FH) - 6), x1 = Math.min(FW, Math.ceil(u1 * FW) + 6), y1c = Math.min(FH, Math.ceil(v1 * FH) + 6);
      const box = [x0, y0c, x1 - x0, y1c - y0c], cropped = crop(flowers.tex, ...box);
      const pk = conceptRamp(cfg.flowers, 'pink'), cr = conceptRamp(cfg.flowers, 'cream');
      const pink = resizeKeepAlpha(cropped, C, C), cream = resizeKeepAlpha(cropped, C, C);
      const sp = paintFlowers(pink, pk.stops[1], SEED + 101), sc = paintFlowers(cream, cr.stops[1], SEED + 202);
      put(pink, C, 0); put(cream, 0, C);
      reg.pink = { x: C, y: 0, w: C, h: C, crop: box }; reg.cream = { x: 0, y: C, w: C, h: C, crop: box };
      ramps.pink = hex(pk.stops[1]); ramps.cream = hex(cr.stops[1]); info.flowerShift = { pink: { dh: +sp.dh.toFixed(1), ks: +sp.ks.toFixed(2), kv: +sp.kv.toFixed(2) }, cream: { dh: +sc.dh.toFixed(1), ks: +sc.ks.toFixed(2), kv: +sc.kv.toFixed(2) } };
      // a seeded third of the flower clusters takes the cream copy (the concept: pink with some cream)
      const RC = rng(SEED ^ 0xc4ea), creamVert = new Set();
      for (const c of flowers.cards) { const cream = RC() < 0.35; if (cream && !c.out) for (const t of c.tris) for (let k = 0; k < 3; k++) creamVert.add(flowers.I[t * 3 + k]); }
      flowerMap = (u, v, vi) => { const r = creamVert.has(vi) ? reg.cream : reg.pink; return [(r.x + (u * FW - box[0]) / box[2] * r.w) / ATLAS, (r.y + (v * FH - box[1]) / box[3] * r.h) / ATLAS]; };
    }
    info.atlas = reg;
    const t = pngTex(ID, atlas), mat = leafMat(ID, t, { wrapS: 33071, wrapT: 33071, min: 9987, mag: 9729 });
    const parts = [{ p: leaves, uvMap: leafUV(LA.cells, ATLAS, ATLAS) }];
    if (flowers) parts.push({ p: flowers, uvMap: flowerMap });
    scene.addChild(doc.createNode(ID).setMesh(doc.createMesh(ID).addPrimitive(makePrim(parts, [0, 0, 0], mat))));
  } else if (KIND === 'bush') {
    // R1: the leaf atlas alone, 2 x 2 cells of KL.cell px (shade to sun); the berries (overlay) a second primitive with their own material
    const LA = leafAtlas(leaves.tex, KL.cell, KL.cell, rampF.stops, false, SEED, WINS, INTERP); info.flat = LA.flat; info.atlas = { leaves: LA.cells };
    const mat = leafMat(ID, pngTex(ID, LA.img), { wrapS: 33071, wrapT: 33071, min: 9987, mag: 9729 });
    const mesh = doc.createMesh(ID).addPrimitive(makePrim([{ p: leaves, uvMap: leafUV(LA.cells, KL.cell * 2, KL.cell * 2) }], [0, 0, 0], mat));
    if (ovPrim) mesh.addPrimitive(ovPrim([0, 0, 0]));
    scene.addChild(doc.createNode(ID).setMesh(mesh));
  } else {
    // the leaf atlas: 2 x 2 cells, each the leaf texture at <= 256 px (the whole <= 512), shade to sun
    const [cw, ch] = fitSize(leaves.tex.width, leaves.tex.height, LEAF_MAX / 2), LA = leafAtlas(leaves.tex, cw, ch, rampF.stops, KIND === 'conifer', SEED, WINS ?? WINDOWS, INTERP, KL.along ? { weight: KL.along, baseV: firBaseV } : null); info.flat = LA.flat;
    info.atlas = { leaves: LA.cells };
    const lmat = leafMat(ID + '_leaves', pngTex(ID + '_leaves', LA.img), { ...leaves.sampler, wrapS: 33071, wrapT: 33071 });
    const [bw, bh] = fitSize(bark.tex.width, bark.tex.height, BARK_MAX);
    let B; if (birch) { const bb = paintBirchBark(bark.tex, bw, bh, SEED + 3); B = bb.img; info.birch = { marks: bb.marks, core: +bb.core.toFixed(4) }; } else B = paintBark(bark.tex, bw, bh, rampB.stops, SEED + 3);
    const bt = doc.createTexture(ID + '_bark').setMimeType('image/jpeg').setImage(new Uint8Array(jpeg.encode({ data: B.data, width: bw, height: bh }, BARK_Q).data));
    const bmat = doc.createMaterial(ID + '_bark').setBaseColorTexture(bt).setAlphaMode('OPAQUE').setDoubleSided(bark.mat.getDoubleSided()).setMetallicFactor(0).setRoughnessFactor(1);
    bmat.getBaseColorTextureInfo().setWrapS(bark.sampler.wrapS).setWrapT(bark.sampler.wrapT).setMinFilter(bark.sampler.min).setMagFilter(bark.sampler.mag);
    let ly = Infinity; for (let k = 0; k < leaves.Ik.length; k++) ly = Math.min(ly, leaves.P[leaves.Ik[k] * 3 + 1]);
    pivot = [0, ly, 0];
    Object.assign(nearMats, { leaves: lmat, bark: bmat, leafUV: leafUV(LA.cells, cw * 2, ch * 2) });
    const root = doc.createNode(ID).setMesh(doc.createMesh(ID).addPrimitive(makePrim([{ p: bark }], [0, 0, 0], bmat)));
    const cmesh = doc.createMesh(ID + '_canopy').addPrimitive(makePrim([{ p: leaves, uvMap: leafUV(LA.cells, cw * 2, ch * 2) }], pivot, lmat, KL.dupLeaves));
    if (ovPrim) cmesh.addPrimitive(ovPrim(pivot));
    const canopy = doc.createNode('Canopy').setMesh(cmesh);
    if (KIND === 'conifer') root.addChild(doc.createNode('Crown').setTranslation(pivot).addChild(canopy.setTranslation([0, 0, 0])));
    else root.addChild(canopy.setTranslation(pivot));
    scene.addChild(root);
  }

  // ---- 5. the triangle limits, checked BEFORE any file is written (M2): the near against its cap here, the far against its target
  //      once it is built (step 7); a build over either throws and leaves no file behind, near or far ----
  const trisIn = (d) => d.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.getIndices().getCount() / 3, 0), 0);
  const nearTris = trisIn(doc); if (nearTris > CAP) throw new Error(`${ID}: ${nearTris} triangles > cap ${CAP}`);
  const tree = (n) => n.getName() + (n.getMesh() ? '[mesh]' : '') + (n.listChildren().length ? ' > ' + n.listChildren().map(tree).join(', ') : '');
  const e = [0, 0, 0];

  // ---- 7. the far version (task 11b; --far, --all), from this same build (which it never changes), built and checked before the near
  //      file is written, written after it; for distant trees and low-power draws:
  //      * bark: the trunk alone (the welded component holding the lowest bark vertex: every branch out, seen or not), simplified to
  //        <= F.barkTris (simplifyMesh: every vertex one of the trunk's own);
  //      * leaves: the near version's kept cards thinned on to F.cards of them, the least seen from the game camera's views first
  //        (cardCoverage: the cards hidden behind others, the crown's interior), ties interior first (the near thinning's order); the
  //        rest grown about their own centres by min(F.growMax, sqrt(near cards / far cards)), then moved back toward the trunk axis until
  //        their farthest point is as far out as before, and into the near crown's height span (the outline keeps its size and height:
  //        the cards grow inward); two-sided as the near (duplicated faces), each in its own atlas cell; (F.leafTris, the conifers)
  //        then simplified, each card within itself, to that many triangles;
  //      * the overlay (tree_fruit): F.overlay apple cards placed again on the far leaves (placeOverlay), grown with them;
  //      * the same materials (names, alpha mode, cutoff, samplers), each texture the near's box-downsampled to FAR_TEX px (ruling R20);
  //        the same pivot and nodes: <id>_far (bark) > [Crown >] Canopy;
  //      * at most F.maxTris triangles (FAR_MAX by kind: broadleaf 1,000, conifers 500; species far.maxTris: the sapling's 500) ----
  let far = null, writeFar = null;
  if (cfg.farOut && KIND !== 'bush') {
    const F = { ...FAR, maxTris: FAR_MAX[KIND], ...(cfg.far || {}) };
    if (!(F.cards > 0 && F.cards <= 1) || !(F.growMax >= 1 && F.growMax <= 1.5) || !(F.barkTris >= 12) || !(F.overlay >= 1) || (F.leafTris !== undefined && !(F.leafTris >= 1)) || !(F.maxTris >= 1))
      throw new Error('far: cards in (0, 1], growMax 1..1.5, barkTris >= 12, overlay >= 1, leafTris >= 1, maxTris >= 1');
    let low = bark.Ik[0]; for (let k = 1; k < bark.Ik.length; k++) if (bark.P[bark.Ik[k] * 3 + 1] < bark.P[low * 3 + 1]) low = bark.Ik[k];
    const trunk = components(bark.P, bark.Ik).find((c) => c.tris.some((t) => bark.Ik[t * 3] === low || bark.Ik[t * 3 + 1] === low || bark.Ik[t * 3 + 2] === low));
    const TI = new Uint32Array(trunk.tris.length * 3); trunk.tris.forEach((t, j) => TI.set(bark.Ik.subarray(t * 3, t * 3 + 3), j * 3));
    const barkStop = {}, fBark = KL.rebuild ? farTrunk(bark.P, bark.UV, TI) : { P: bark.P, NR: bark.NR, UV: bark.UV, Ik: simplifyMesh(bark.P, bark.NR, bark.UV, TI, F.barkTris, barkStop) };
    // the cards that leave: the least seen from the game camera's views first (cardCoverage on the near version's kept cards), ties
    // interior first (the near thinning's own order: its score, then index)
    const idx = new Map(leaves.cards.map((c, i) => [c, i])), kept = leaves.cards.filter((c) => !c.out), nFar = Math.max(1, Math.round(F.cards * kept.length));
    // (a rebuilt fir: the fronds that leave at evenly spaced ranks above its lowest whorl, firLeave: the fronds, by height, go round the
    // trunk evenly, and so do those left; leaving the least seen took the crown's back side)
    const seen = nFar < kept.length && !KL.rebuild ? cardCoverage(kept, leaves.P, leaves.I) : new Int32Array(kept.length), seenOf = new Map(kept.map((c, k) => [c, seen[k]]));
    const leave = KL.rebuild ? new Set([...firLeave(kept.length, nFar)].map((k) => kept[k]))
      : new Set(kept.slice().sort((a, b) => seenOf.get(a) - seenOf.get(b) || a.score - b.score || idx.get(a) - idx.get(b)).slice(0, kept.length - nFar));
    // grown about its own centre, then moved back toward the trunk axis until its farthest point is as far out as before, and up or down
    // into the near crown's height span (its lowest leaf .. the model's top, HT): the crown's outline keeps its size and height, the
    // cards grow into the crown, not out of it
    let leafLo = Infinity; for (let k = 0; k < leaves.Ik.length; k++) leafLo = Math.min(leafLo, leaves.P[leaves.Ik[k] * 3 + 1]);
    const G = Math.min(F.growMax, Math.sqrt(kept.length / nFar)), LP = Float64Array.from(leaves.P), ftris = []; let moved = 0;
    for (const c of kept) { if (leave.has(c)) continue;
      const vs = new Set(), m = [0, 0, 0]; let nc = 0, r0 = 0, r1 = 0, y0 = Infinity, y1 = -Infinity;
      for (const t of c.tris) for (let j = 0; j < 3; j++) { const v = leaves.I[t * 3 + j]; vs.add(v); nc++; for (let q = 0; q < 3; q++) m[q] += leaves.P[v * 3 + q]; }
      for (let q = 0; q < 3; q++) m[q] /= nc;
      for (const v of vs) { for (let q = 0; q < 3; q++) LP[v * 3 + q] = m[q] + (leaves.P[v * 3 + q] - m[q]) * G;
        r0 = Math.max(r0, Math.hypot(leaves.P[v * 3], leaves.P[v * 3 + 2])); r1 = Math.max(r1, Math.hypot(LP[v * 3], LP[v * 3 + 2])); }
      const mr = Math.hypot(m[0], m[2]), dx = mr > 1e-6 ? -m[0] / mr * (r1 - r0) : 0, dz = mr > 1e-6 ? -m[2] / mr * (r1 - r0) : 0;
      for (const v of vs) { LP[v * 3] += dx; LP[v * 3 + 2] += dz; y0 = Math.min(y0, LP[v * 3 + 1]); y1 = Math.max(y1, LP[v * 3 + 1]); }
      const dy = y1 > HT ? HT - y1 : y0 < leafLo ? Math.min(leafLo - y0, HT - y1) : 0;
      if (dy) { for (const v of vs) LP[v * 3 + 1] += dy; moved++; }
      ftris.push(...c.tris); }
    ftris.sort((a, b) => a - b);
    const fLeaves = { ...leaves, P: LP, Ik: new Uint32Array(ftris.length * 3) }; ftris.forEach((t, j) => fLeaves.Ik.set(leaves.I.subarray(t * 3, t * 3 + 3), j * 3));
    // (leafTris) the kept cards simplified, each within itself (the cards are welded components: no collapse joins two)
    // (a rebuilt fir: one pass over every frond, but none below FIR.farFloor triangles: unchecked, the pass collapsed the flattest fronds
    // to slivers first, some sides of the crown bare and the far crown lopsided)
    const leafStop = {};
    if (F.leafTris) fLeaves.Ik = simplifyMesh(LP, leaves.NR, leaves.UV, fLeaves.Ik, F.leafTris, leafStop, KL.rebuild ? { of: leaves.cardOf, floor: (ci) => FIR.farFloor[leaves.cards[ci].c[1] > lo[1] + (1 - FIR.topBand) * (hi[1] - lo[1]) ? 1 : 0] } : null);
    const fdoc = new Document(), fbuf = fdoc.createBuffer(), facc = (type, arr) => fdoc.createAccessor().setType(type).setArray(arr).setBuffer(fbuf);
    const froot = fdoc.createNode(ID + '_far').setMesh(fdoc.createMesh(ID + '_far').addPrimitive(primIn(fdoc, facc, [{ p: fBark }], [0, 0, 0], materialIn(fdoc, nearMats.bark))));
    const fcm = fdoc.createMesh(ID + '_far_canopy').addPrimitive(primIn(fdoc, facc, [{ p: fLeaves, uvMap: nearMats.leafUV }], pivot, materialIn(fdoc, nearMats.leaves), KL.dupLeaves));
    let fov = null;
    if (OV) { fov = placeOverlay(cfg.overlay, fLeaves, SEED ^ 0x0fe1 ^ 0xfa7, HT, { count: F.overlay, size: OV.size.map((s) => s * G) });
      fcm.addPrimitive(overlayPrimIn(fdoc, facc, materialIn(fdoc, nearMats.overlay), fov, pivot)); }
    const fcan = fdoc.createNode('Canopy').setMesh(fcm);
    if (KIND === 'conifer') froot.addChild(fdoc.createNode('Crown').setTranslation(pivot).addChild(fcan.setTranslation([0, 0, 0])));
    else froot.addChild(fcan.setTranslation(pivot));
    const fscene = fdoc.createScene('Scene'); fdoc.getRoot().setDefaultScene(fscene); fscene.addChild(froot);
    const farTris = trisIn(fdoc); if (farTris > F.maxTris) throw new Error(`${ID}: its far version has ${farTris} triangles > its target ${F.maxTris} (far.maxTris)`);
    writeFar = async () => {
      fs.mkdirSync(path.dirname(cfg.farOut), { recursive: true });
      await new NodeIO().write(cfg.farOut, fdoc);
      const f2 = (await new NodeIO().read(cfg.farOut)).getRoot(), fmn = [Infinity, Infinity, Infinity], fmx = [-Infinity, -Infinity, -Infinity]; let FT = 0;
      for (const nd of f2.listNodes()) { const m = nd.getMesh(); if (!m) continue; const w = nd.getWorldMatrix();
        for (const p of m.listPrimitives()) { FT += p.getIndices().getCount() / 3; const A = p.getAttribute('POSITION');
          for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e); for (let k = 0; k < 3; k++) { const v = w[k] * e[0] + w[4 + k] * e[1] + w[8 + k] * e[2] + w[12 + k]; fmn[k] = Math.min(fmn[k], v); fmx[k] = Math.max(fmx[k], v); } } } }
      far = { file: path.basename(cfg.farOut), tris: FT, bark: `${fBark.Ik.length / 3}/${TI.length / 3}`, ...(Object.keys(barkStop).length ? { barkStop } : {}), cards: `${nFar}/${kept.length}`, leafTris: fLeaves.Ik.length / 3 * DUP, ...(Object.keys(leafStop).length ? { leafStop } : {}), grow: +G.toFixed(3), movedY: moved,
        ...(leave.size && !KL.rebuild ? { coverage: { kept: +(kept.filter((c) => !leave.has(c)).reduce((s, c) => s + seenOf.get(c), 0) / Math.max(1, seen.reduce((s, x) => s + x, 0))).toFixed(3), hiddenCards: seen.filter((x) => !x).length,
          nearMix: [0, 1, 2, 3].map((k) => +(kept.filter((c) => c.cell === k).reduce((s, c) => s + seenOf.get(c), 0) / Math.max(1, seen.reduce((s, x) => s + x, 0))).toFixed(3)),
          farMix: [0, 1, 2, 3].map((k) => { const fk = kept.filter((c) => !leave.has(c)), tot = fk.reduce((s, c) => s + seenOf.get(c), 0); return +(fk.filter((c) => c.cell === k).reduce((s, c) => s + seenOf.get(c), 0) / Math.max(1, tot)).toFixed(3); }) } } : {}),
        ...(fov ? { overlay: { cards: fov.length, exposed: fov.filter((c) => c.exposed).length, tris: fov.length * 4, sizes: fov.map((c) => +c.s.toFixed(3)) } } : {}),
        height: +(fmx[1] - fmn[1]).toFixed(4), minY: +fmn[1].toFixed(5), width: +Math.max(fmx[0] - fmn[0], fmx[2] - fmn[2]).toFixed(4), pivot: pivot.map((v) => +v.toFixed(4)),
        nodes: f2.listScenes()[0].listChildren().map(tree).join(' | '), kb: Math.round(fs.statSync(cfg.farOut).size / 1024), knobs: F };
    };
  }

  // ---- 6. write: the near file, then the far; RESULT (re-read: what the files really hold) ----
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await new NodeIO().write(OUT, doc);
  const kb = Math.round(fs.statSync(OUT).size / 1024), r2 = (await new NodeIO().read(OUT)).getRoot();
  let T = 0; const mn2 = [Infinity, Infinity, Infinity], mx2 = [-Infinity, -Infinity, -Infinity];
  for (const n of r2.listNodes()) { const m = n.getMesh(); if (!m) continue; const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { T += p.getIndices().getCount() / 3; const A = p.getAttribute('POSITION');
      for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e); for (let k = 0; k < 3; k++) { const v = w[k] * e[0] + w[4 + k] * e[1] + w[8 + k] * e[2] + w[12 + k]; mn2[k] = Math.min(mn2[k], v); mx2[k] = Math.max(mx2[k], v); } } } }
  if (writeFar) await writeFar();
  return {
    id: ID, src: path.basename(IN), kind: KIND, look: cfg.look || null, tris: T, cap: CAP, bark: bark ? bark.Ik.length / 3 : 0,
    foliage: Object.fromEntries(fol.map((p) => [p.role, { cards: `${p.cards.filter((c) => !c.out).length}/${p.cards.length}`, tris: `${p.Ik.length / 3 * DUP}/${p.I.length / 3 * DUP}` }])),
    ...(cfg.trim ? { trim: +cfg.trim } : {}), ...(cfg.leafTex ? { leafTex: cfg.leafTex } : {}), ...(OV ? { overlay: { kind: cfg.overlay, cards: ovCards.length, exposed: ovCards.filter((c) => c.exposed).length, tris: OVT, sizes: ovCards.map((c) => +c.s.toFixed(3)) } } : {}),
    height: +(mx2[1] - mn2[1]).toFixed(4), width: +Math.max(mx2[0] - mn2[0], mx2[2] - mn2[2]).toFixed(4), minY: +mn2[1].toFixed(5), pivot: pivot && pivot.map((v) => +v.toFixed(4)),
    nodes: r2.listScenes()[0].listChildren().map(tree).join(' | '), materials: r2.listMaterials().map((m) => `${m.getName()} ${m.getAlphaMode()}${m.getAlphaMode() === 'MASK' ? ' ' + m.getAlphaCutoff().toFixed(2) : ''}`),
    textures: r2.listTextures().map((t) => `${t.getName()} ${t.getSize().join('x')} ${t.getMimeType().slice(6)} ${Math.round(t.getImage().length / 1024)}KB`), kb,
    ...(barkHidden ? { barkHidden } : {}), ...(firInfo ? { fir: firInfo } : {}), ...(KL.dupLeaves ? { dupLeaves: true } : {}), ...(KL.faceOut ? { rewound } : {}), ...(STRETCH !== 1 ? { stretch: STRETCH } : {}), grow: +GROW.toFixed(3), ramps,
    ...(cfg.autumn !== undefined ? { autumn: +cfg.autumn } : {}), ...(info.birch ? { birch: info.birch } : {}),
    leafTextureFlat: info.flat, atlas: info.atlas, cellCards, ...(pads ? { pads } : {}), ...(info.flowerShift ? { flowerShift: info.flowerShift } : {}), seed: SEED, dropped: [...dropped],
    concepts: Object.fromEntries([...READ].sort()),
    ...(far ? { far } : {}),
  };
}

async function main(argv) {
  const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--all', '--keepBark', '--far'].includes(argv[i - 1])));
  const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  const farOf = (out) => out.replace(/\.glb$/i, '') + '_far.glb';   // the far version beside its near one
  if (argv[0] === '--ramp') { const r = sampleRamp(argv[1], argv[2] || 'foliage'); console.log(JSON.stringify({ stops: r.stops.map(hex), sd: +r.sd.toFixed(4), n: r.n })); return; }
  if (argv[0] === '--bands') { const r = bandRamp(argv[1], argv[2] || 'foliage');
    console.log(JSON.stringify({ stops: r.stops.map(hex), bands: r.bands.map((b) => [+b.h.toFixed(1), +b.s.toFixed(3), +b.v.toFixed(3)]), p10: +r.p10.toFixed(4), p90: +r.p90.toFixed(4), n: r.n })); return; }
  // --freeze-stats [--out file]: the concept images' numbers into CONCEPT_STATS (or file)
  if (argv.includes('--freeze-stats')) { const out = path.resolve(opt('out', CONCEPT_STATS)), text = freezeStats(); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, text);
    console.log(`wrote ${out} (${Object.keys(JSON.parse(text).folders).length} concept folders)`); return; }
  // --all: every id, and every tree's far version as a second output (<id>_far.glb)
  if (argv.includes('--all')) { const dir = opt('out', RESKIN);
    for (const id of allIds()) { const cfg = recipe(id); cfg.out = path.join(dir, id + '.glb'); if (cfg.kind !== 'bush') cfg.farOut = farOf(cfg.out); console.log('RESULT ' + JSON.stringify(await build(cfg))); } return; }
  if (argv.includes('--recipe')) { const cfg = recipe(opt('recipe')); if (pos[0]) cfg.out = pos[0];
    // --far: the tree's far version too, beside it (<out>_far.glb)
    if (argv.includes('--far')) { if (cfg.kind === 'bush') throw new Error('--far: a bush has no far version'); cfg.farOut = farOf(cfg.out); }
    // --set k=v (repeatable): a look-sheet experiment on top of the recipe (source=<MegaKit name>, any build key: trim, stretch, ..., or
    // far.<knob>=v: a far-version knob, cards / growMax / barkTris / overlay)
    argv.forEach((a, i) => { if (a !== '--set') return; const [k, v] = argv[i + 1].split('='), val = v === 'true' ? true : v === 'false' ? false : isNaN(+v) ? v : +v;
      if (k === 'source') { cfg.src = path.join(PACK, v + '.gltf'); cfg.source = v; } else if (k.startsWith('far.')) cfg.far = { ...cfg.far, [k.slice(4)]: val }; else cfg[k] = val; });
    console.log('RESULT ' + JSON.stringify(await build(cfg))); return; }
  const [IN, OUT] = pos, ID = opt('id'), KIND = opt('kind');
  if (!IN || !OUT || !ID) throw new Error('usage: node reskin.mjs --recipe <id> [out.glb] [--far] | --all [--out dir] | --freeze-stats [--out file] | <src.gltf|glb> <out.glb> --id <id> --kind broad|conifer|bush --height H --cap N [--seed S] [--minKeep F] [--grow k|auto] [--concept folder]');
  const L = LOOKS[ID] ?? { foliage: opt('concept'), bark: opt('concept') };
  const cfg = { id: ID, src: IN, out: OUT, kind: KIND, height: opt('height'), cap: opt('cap'), look: KIND === 'broad' ? 'r1' : 'v1', foliage: L.foliage, flowers: L.flowers, bark: L.bark, barkPart: L.barkPart,
    keepBark: argv.includes('--keepBark'), ...(opt('seed') !== undefined ? { seed: +opt('seed') } : {}), ...(opt('minKeep') !== undefined ? { minKeep: +opt('minKeep') } : {}), ...(opt('grow') !== undefined ? { grow: opt('grow') } : {}) };
  console.log('RESULT ' + JSON.stringify(await build(cfg)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => { console.error('Error: ' + err.message); process.exit(1); });
}
