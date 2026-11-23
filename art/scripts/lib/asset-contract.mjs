// asset-contract.mjs -- VISUAL-QA V1, the asset contract (ART-PLAN A2, stage 1 "QA rails"). Every model in
// public/models/manifest.json is held to its category's contract from ART-BIBLE §D (texture approaches A-E, surface model,
// budgets, texel density) and ASSET-RULES §1-§9 (per-category budgets, materials, nodes). tests/assets.test.mjs runs it on the
// published models and on mutated copies (the contract must go red on them).
//
// Layout: DATA (classes, the id -> class table, the registers that may only shrink), MEASURE (measureModel: one GLB -> plain
// numbers), RULES (evaluate: manifest + measurements + registers -> one result per check). No game code, read-only.
//
// The registers are the point of this file:
//   STAND_INS   flat-colour placed models (approach E on a placed object = a stand-in, ART-BIBLE §D.3) that are allowed for now,
//               each with the plan item that replaces it. Any OTHER flat model fails, so new flat assets cannot creep in. An entry
//               that is no longer flat (or no longer published) fails as stale: the register only shrinks.
//   DEPRECATED  ids on their way out (ART-PLAN P3-3 / A16): flagged in the output, exempt from the stand-in rule.
//   EXCEPTIONS  per-id budget / base / roughness ceilings written down elsewhere (ASSET-RULES, models.test, ASSET-CATALOG). An
//               exception that is no longer needed fails as stale. The eight tris exceptions are the owner's list (2026-10-25;
//               the sheep's rig source 2026-10-26, animal-rigs R37); a ninth fails (TRIS_EXCEPTION_CEILING).
//   HERO_WALLS  the one named exception to the hero-wall density target (the farmhouse, owner kept its 1024 px texture).
//   KNOWN_DEFECTS  genuine, tracked defects (owner, 2026-10-25): outcrop_b's texel density and tree_spread's canopy pivot. Each ties
//               to the ART-PLAN item that fixes it, so enforcement passes while it stays tracked; same pattern as STAND_INS: an
//               entry that is no longer a defect fails as stale, and the register can never grow past KNOWN_DEFECT_CEILING.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';

// ---- DATA -------------------------------------------------------------------------------------------------------------------
// approach letters: ART-BIBLE §D.3 (A Meshy painted atlas, B painted procedural on the shared atlas, C ramp reskin, D code-painted
// cards, E flat colour), plus W = baked data (ASSET-CATALOG §6, the water bake: geometry with one untextured 'Water' placeholder
// material, the colour and motion come from the .map.bin data the game reads). tris / kb / texMax: null = no budget in the rules.
// density: texels per unit band [lo, hi] (null = open),
// APPROVED by the owner 2026-10-25 (ART-BIBLE §D.3, ASSET-RULES §4-§5): buildings >= 75, props 150-500 (Meshy) / 200-500 (painted),
// painted-atlas models 200-500, outcrops >= 100, boulders 200-500, cards 250-1,000, far trees >= 110.
const CARDS = [250, 1000];
const PAINTED = [200, 500];   // approach B cells of the shared atlas (observed 246-465)
export const CLASSES = {
  building: { rules: 'ASSET-RULES §5', approach: ['A'], tris: 3000, kb: 200, texMax: 512, density: [75, null] },
  landmark: { rules: 'ASSET-RULES §8 (as buildings)', approach: ['A', 'B'], tris: 3000, kb: 200, texMax: 512, density: { A: [75, null], B: PAINTED } },
  structure: { rules: 'ASSET-RULES §5 small farm structures (sheds, lean-tos, shelters): approach B', approach: ['B'], tris: 3000, kb: 200, texMax: 512, density: PAINTED },
  plot: { rules: 'ASSET-RULES §5 plot edging (approach B); ART-PLAN P0-1 (<= 300 tris)', approach: ['B'], tris: 300, kb: 200, texMax: 512, density: PAINTED },
  prop: { rules: 'ASSET-RULES §6', approach: ['A', 'B'], tris: 600, kb: 200, texMax: 512, density: { A: [150, 500], B: PAINTED } },
  rock: { rules: 'ASSET-RULES §4 boulders', approach: ['A'], tris: 650, kb: 200, texMax: 512, density: [200, 500] },
  outcrop: { rules: 'ASSET-RULES §4 outcrops', approach: ['A'], tris: 2100, kb: 200, texMax: 512, density: [100, null] },
  animal: { rules: 'ASSET-RULES §9', approach: ['A'], tris: 1500, kb: 200, texMax: 512, density: null },
  character: { rules: 'ASSET-RULES §9 (Barnaby: approach B, Decided)', approach: ['B'], tris: 1500, kb: 200, texMax: 512, density: PAINTED },
  tree_hero: { rules: 'ART-BIBLE §D.3 hero tree (Meshy one-off)', approach: ['A'], tris: 3500, kb: 600, texMax: 1024, nodes: ['Canopy'], density: null },
  tree_broadleaf: { rules: 'ASSET-RULES §3 (R15, R20)', approach: ['C'], tris: 3500, far: 1000, kb: null, texMax: 512, nodes: ['Canopy'], density: null },
  tree_birch: { rules: 'ASSET-RULES §3 (R15, R20)', approach: ['C'], tris: 3000, far: 1000, kb: null, texMax: 512, nodes: ['Canopy'], density: null },
  tree_sapling: { rules: 'ASSET-RULES §3 (R15, R20)', approach: ['C'], tris: 1500, far: 500, kb: null, texMax: 512, nodes: ['Canopy'], density: null },
  tree_conifer: { rules: 'ASSET-RULES §3 (R15, R20; Crown > Canopy)', approach: ['C'], tris: 1200, far: 500, kb: null, texMax: 512, nodes: ['Crown', 'Canopy'], density: null },
  tree_far: { rules: 'ASSET-RULES §3 far versions (R20, trees.test T9)', approach: ['C'], tris: null, kb: null, texMax: 256, density: [110, null] },
  bush: { rules: 'ASSET-RULES §3 bushes', approach: ['C'], tris: 600, kb: null, texMax: 512, density: null },
  card_shrub: { rules: 'ASSET-RULES §3 card shrubs', approach: ['D'], tris: 120, kb: null, texMax: 512, density: CARDS },
  grass: { rules: 'ASSET-RULES §2 (plantkit.test K2)', approach: ['D'], tris: 24, kb: null, texMax: 512, density: CARDS },
  pebble: { rules: 'ASSET-RULES §2 (plantkit.test K10)', approach: ['D'], tris: 24, kb: null, texMax: 512, density: CARDS },
  wildflower: { rules: 'ASSET-RULES §2 (plantkit.test K2)', approach: ['D'], tris: 40, kb: null, texMax: 512, density: CARDS },
  perennial: { rules: 'ASSET-RULES §2 (plantkit.test K2; ferns)', approach: ['D'], tris: 120, kb: null, texMax: 512, density: CARDS },
  crop: { rules: 'ASSET-RULES §3 crops: the kit stages (crops.test F1-F4, G1)', approach: ['D'], tris: 400, kb: null, texMax: 512, density: CARDS },
  // the NAMED exception (owner, 2026-10-25: "crops, mature on Meshy"; keep about 2,200 tris, no decimation): the eight Meshy ready
  // stages (MESHY_CROPS) are painted atlases, <= 2,500 tris, held to the Meshy props' density band 150-500 and their own neighbour family
  crop_meshy: { rules: 'ASSET-RULES §3 crops: the Meshy ready stages, a named exception (owner 2026-10-25: <= 2,500 tris, no decimation)', approach: ['A'], tris: 2500, kb: 200, texMax: 512, density: [150, 500] },
  flowerbed: { rules: 'ASSET-RULES §3 flower beds (kit bed; ASSETS.md plants <= 600)', approach: ['D'], tris: 600, kb: null, texMax: 512, density: CARDS },
  terrain: { rules: 'ASSET-RULES §1 (approach E by design; bake.test owns the geometry)', approach: ['E'], tris: null, kb: 280, texMax: null, base: false, density: null },
  path_ribbon: { rules: 'ASSET-RULES §5 paths (approach E by design, BLEND)', approach: ['E'], tris: null, kb: null, texMax: null, base: false, density: null },
  // water_main / _wetland / _highland (bake-water.mjs, ASSET-RULES §7, water spec 2026-10-23): flat still surfaces, ribbons, falls and a
  // depth-only fall skirt on one OPAQUE 'Water' placeholder the game replaces, empty mist / steam nodes; no texture, no COLOR_0 (the
  // colour comes from the RGBA8 map beside the GLB). tris: ASSET-CATALOG §6 "<= 1,500 per piece" (measured 349 / 328 / 104). kb: the
  // 200 KB per-file cap (measured 6-17 KB). base: false, the bodies sit at their own levels (pond 0.06, lake -0.32, tarn -0.2) and the
  // falls drop ~10 u below the waterline (water_wetland min y -10.9), so y 0 is the waterline but not the lowest point.
  water_surface: { rules: 'ASSET-RULES §7 water + ASSET-CATALOG §6 baked data (approach W: one untextured Water placeholder, <= 1,500 tris per piece)', approach: ['W'], tris: 1500, kb: 200, texMax: null, base: false, density: null },
  deprecated: { rules: 'ART-PLAN P3-3 (A16): retire', approach: ['E'], tris: null, kb: null, texMax: null, base: false, density: null },
};
// hero building walls (a building-class model with a 1024 px texture exception: farmhouse, windmill): ART-BIBLE §D.3 ">= 128
// texels/u" is the target for any hero. The farmhouse (79) is the one NAMED exception: the owner kept its 1024 px texture and
// raises sharpness only by resolution (ART-PLAN P2-2). Stale (fails) once its walls reach the target. Roofs: ASSET-RULES §5 ">= 200 t/u".
export const HERO_WALL_TARGET = [128, null];
export const HERO_WALLS = { farmhouse: { band: [75, null], why: 'owner kept the 1024 px atlas (walls 79 t/u); raise only by resolution, never by flattening (ART-PLAN P2-2 / A13)' } };
export const ROOF_BAND = [200, null];
// canopy pivot (ASSET-RULES §3): 0.25-0.45 x the tree's height on broadleaf, birch, sapling and the hero tree (not conifers)
export const PIVOT_BAND = [0.25, 0.45];
export const PIVOT_CLASSES = new Set(['tree_broadleaf', 'tree_birch', 'tree_sapling', 'tree_hero']);
// the 3x neighbour rule holds inside a family of similar models; across families it only reports (ART-BIBLE §D.3)
export const NEIGHBOUR_MAX = 3;
const FAMILY_OF = (cls, letter) => ({ building: 'Meshy buildings', landmark: letter === 'A' ? 'Meshy buildings' : 'painted atlas models', structure: 'painted atlas models', character: 'painted atlas models', plot: 'painted atlas models',
  prop: 'props', animal: 'animals', card_shrub: 'plant cards', grass: 'plant cards', wildflower: 'plant cards', perennial: 'plant cards', crop: 'plant cards', flowerbed: 'plant cards', rock: 'boulders + outcrops', outcrop: 'boulders + outcrops',
  crop_meshy: 'Meshy crops' })[cls] || null;
// the eight Meshy crop ready stages, by name (owner, 2026-10-25): the only ids in the crop_meshy class; a ninth needs the owner
export const MESHY_CROPS = ['radish', 'carrot', 'wheat', 'lettuce', 'tomato', 'pumpkin', 'blueberry', 'cranberry'].map((c) => `crop_${c}_3`);

// every published id -> its class. Families by pattern below; anything else must be listed here, or it is unclassified (fails).
export const ASSET_CLASS = {
  farmhouse: 'building', windmill: 'building', well: 'building', greenhouse: 'building',
  lighthouse: 'landmark', tower_ruin: 'landmark', wetland_jetty: 'landmark',
  woodshed: 'structure', barnaby_camp: 'structure', shelter: 'structure', sheep_shelter: 'structure',
  plot: 'plot',
  bench: 'prop', haystack: 'prop', cart: 'prop', lantern: 'prop', beehive: 'prop', scarecrow: 'prop',
  rock_a: 'rock', rock_b: 'rock', rock_c: 'rock', outcrop_a: 'outcrop', outcrop_b: 'outcrop',
  sheep: 'animal', chicken: 'animal', duck: 'animal', dog: 'animal', cat_sleeping: 'animal', goat: 'animal', visitor_hare: 'animal',
  barnaby: 'character',
  hero_tree: 'tree_hero',
  tree_round_a: 'tree_broadleaf', tree_round_b: 'tree_broadleaf', tree_spread: 'tree_broadleaf', tree_fruit: 'tree_broadleaf',
  tree_oak_autumn: 'tree_broadleaf', tree_beech_autumn: 'tree_broadleaf',
  tree_birch: 'tree_birch', tree_birch_autumn: 'tree_birch', tree_sapling: 'tree_sapling',
  tree_pine_a: 'tree_conifer', tree_pine_b: 'tree_conifer',
  bush_a: 'bush', bush_berry: 'bush', bush_flowering: 'bush',
  shrub_mound: 'card_shrub', shrub_low: 'card_shrub', shrub_heather: 'card_shrub',
  grass_short: 'grass', grass_tall: 'grass', grass_seedhead: 'grass', clover_patch: 'grass', pebbles: 'pebble',
  flower_daisy: 'wildflower', flower_buttercup: 'wildflower', flower_poppy: 'wildflower', flower_cornflower: 'wildflower',
  perennial_lavender: 'perennial', perennial_foxglove: 'perennial', perennial_oxeye: 'perennial', fern_clump: 'perennial',
  flowerbed: 'flowerbed',
  water_main: 'water_surface', water_wetland: 'water_surface', water_highland: 'water_surface',
  grass_tuft: 'deprecated', flower_head: 'deprecated',
  ...Object.fromEntries(MESHY_CROPS.map((id) => [id, 'crop_meshy'])),
};
const TREE_CLASSES = new Set(['tree_broadleaf', 'tree_birch', 'tree_sapling', 'tree_conifer']);
export function classOf(id, table = ASSET_CLASS) {
  if (table[id]) return table[id];
  if (/^crop_[a-z]+_[123]$/.test(id)) return 'crop';
  if (/^piece_[a-z]+$/.test(id)) return 'terrain';
  if (/^paths_[a-z]+$/.test(id)) return 'path_ribbon';
  const m = id.match(/^(.+)_far$/); if (m && TREE_CLASSES.has(table[m[1]])) return 'tree_far';
  return null;
}
export const nearOf = (id) => id.replace(/_far$/, '');

// data files that sit beside a model's GLB (V1.1: each must exist, and none counts as an orphan): a terrain piece's height grid
// (declared on its manifest entry) and, for a water surface, its baked RGBA8 map `<id>.map.bin` plus the one shared RG8 noise
// `water_noise.bin`. bake-water.mjs writes the water files but does not declare them on the manifest entry, so they follow from the class.
export const WATER_NOISE = 'water_noise.bin';
export function dataFilesOf(id, entry, cls) {
  const out = [];
  if (entry.height && entry.height.file) out.push({ file: entry.height.file, what: 'height grid' });
  if (cls === 'water_surface') out.push({ file: `${id}.map.bin`, what: 'baked map' }, { file: WATER_NOISE, what: 'shared noise' });
  return out;
}

// the rigged animals (art/blender/rigs, animal-rigs ruling R36): public/models/rigs.json lists each rig (`animals.<id>.file`) and
// the GLB it was built from (`.source`). Neither is a manifest entry (the game reads the rigs through rigs.json, the manifest keeps
// today's static models), so both are declared data files: each must exist and neither counts as an orphan. A rig is budgeted
// against its source, not its category: <= the source's tris + RIG_EXTRA_TRIS (the eyelid caps) and <= RIG_KB (ruling R13: the
// clips' keys; the animal class's 200 KB is for a static model), and within the animal class's tris cap unless its source id has
// a written tris exception (R37: the dog's, the sheep's). The rigs' own contract (bones, clips, poses) is rigs.test AR1-AR7.
export const RIGS_FILE = 'rigs.json';
export const RIG_EXTRA_TRIS = 40;
export const RIG_KB = 400;
export function readRigs(modelsDir) {
  const f = path.join(modelsDir, RIGS_FILE);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
export function rigFilesOf(rigs) {
  const out = [];
  for (const [id, a] of Object.entries((rigs && rigs.animals) || {})) {
    out.push({ id, file: a.file, what: 'rig' });
    out.push({ id, file: a.source, what: 'rig source' });
  }
  return out;
}
// every rig file and rig source in rigs.json, measured by file name (missing files are skipped here and reported by V1.1)
export async function measureRigs(modelsDir, rigs) {
  const out = {};
  for (const { file } of rigFilesOf(rigs)) { const f = path.join(modelsDir, file || ''); if (file && !out[file] && fs.existsSync(f)) out[file] = await measureModel(f); }
  return out;
}

// flat-colour stand-ins allowed for now (ASSET-CATALOG §5, status "rev"), each with the plan item that replaces it. Only shrinks.
export const STAND_INS = {
  sheep: 'ART-PLAN P1-5 / A10: painterly sheep (Meshy or painted procedural, the owner picks); ASSET-CATALOG §5 "the only flat animal"',
  // plot left the register on 2026-10-25 (stage 2 Garden): the painted procedural plot, scripts/assets/plot.mjs
};
// the register's ceiling as frozen on 2026-10-24 (stage 1): STAND_INS may only ever be a subset of this
export const STAND_IN_CEILING = ['sheep', 'plot'];
export const DEPRECATED = {
  grass_tuft: 'ART-PLAN P3-3 / A16: replaced by the plant kit, 0 instances (composition meta only)',
  flower_head: 'ART-PLAN P3-3 / A16: replaced by the plant kit, 0 instances (composition meta only)',
};

// genuine, tracked defects (owner, 2026-10-25), keyed id -> { check: the ART-PLAN item that fixes it }. check: 'density' (a texel
// density below its floor, and the family-spread breach it causes) or 'pivot' (a canopy pivot outside 0.25-0.45 x H). While an
// entry stays, enforcement passes on that one value and the defect is reported; the entry fails as stale the day the defect is
// fixed (delete it in the same change), and the register can never grow past KNOWN_DEFECT_CEILING: fix the asset instead.
export const KNOWN_DEFECTS = {
  outcrop_b: { density: 'ART-PLAN P2-2 / A13: re-texture outcrop_b by resolution, never by flattening; 73 t/u is the lowest of any published model (floor 100) and puts the boulders + outcrops family at 3.95x against the 3x limit' },
  tree_spread: { pivot: 'ART-PLAN P2-4 / A11: re-pivot tree_spread and trim its bark tip inside the crown; the pivot is 0.213 u = 0.111 x H (floor 0.25 x H), so a still trunk tip shows against the swaying crown' },
};
export const KNOWN_DEFECT_CEILING = ['outcrop_b.density', 'tree_spread.pivot'];

// the eight over-budget models the owner accepted by name (2026-10-25; sheep_meshy_sized 2026-10-26, animal-rigs R37): any
// other tris exception fails (the owner adds it)
export const TRIS_EXCEPTION_CEILING = ['farmhouse', 'windmill', 'lighthouse', 'hero_tree', 'dog', 'cart', 'scarecrow', 'sheep_meshy_sized'];

// per-id ceilings written down elsewhere (the source is in each note). Keys: tris, kb, texMax (px), base (expected min y),
// baseTol (u), roughness {material: minimum}. Measured tris: farmhouse 3,646, windmill 3,480, lighthouse 3,028, hero_tree 5,105,
// dog 1,918, cart 1,466, scarecrow 731, sheep_rig.glb 1,568 (the ceilings below add a margin of 0-69). sheep_meshy_sized is a rig
// source, not a manifest entry: its exception caps the sheep's rig (V1.5's rig budget, R37).
export const EXCEPTIONS = {
  farmhouse: { tris: 3646, kb: 600, texMax: 1024, roughness: { PorchLamp: 0.85 }, note: 'hero: ASSET-RULES §5 tri exception (3,646, one of the three building exceptions), ART-BIBLE §D.3 1024², §D.5 hero <= 600 KB; PorchLamp housing r 0.85 (the porch-lamp polish, models.test P7)' },
  windmill: { tris: 3480, kb: 600, texMax: 1024, note: 'hero: ASSET-RULES §5 tri exception (3,480), ART-BIBLE §D.3 1024², §D.5 hero <= 600 KB' },
  hero_tree: { tris: 5105, note: 'the Meshy hero tree: 5,105 tris (ASSET-CATALOG §1), over the 3,500 broadleaf cap; ASSET-RULES §3 names it as the single hero-tree exception' },
  lighthouse: { tris: 3030, note: '3,028 tris, 1 % over the building cap (models.test P12 budget 3,030; ASSET-CATALOG §1); ASSET-RULES §5 names it beside the farmhouse and windmill' },
  dog: { tris: 1950, note: 'ASSET-RULES §9 "dog 1,918 accepted" (models.test P12 budget 1,950)' },
  sheep_meshy_sized: { tris: 1568, note: 'owner, 2026-10-26 (animal-rigs R37): the Meshy sheep the owner picked (1,544 tris) + 24 eyelid tris = sheep_rig.glb 1,568. A rig source (rigs.json), not a manifest entry: it caps the rig in V1.5\'s rig budget' },
  cart: { tris: 1500, note: 'ASSET-RULES §6 "Meshy props accepted up to 1,500 case by case": cart 1,466' },
  scarecrow: { tris: 800, note: '731 tris: ASSET-RULES §6 names it beside the cart (models.test P12 budget 800; ASSET-CATALOG "over the prop cap")' },
  piece_highland: { kb: 295, note: 'ASSET-RULES §1 "<= 280 KB per piece file (highland <= 295)"' },
  duck: { base: -0.05, note: 'y 0 = the waterline, the hull dips 0.05 (models.test P14)' },
  wetland_jetty: { base: -0.3, baseTol: 0.02, note: 'y 0 = the waterline, piles to -0.3 (models.test P19)' },
  tower_ruin: { baseTol: 0.05, note: 'dry-stone blocks bedded up to 0.05 into the ground (models.test P22)' },
  crop_radish_3: { base: -0.12, note: 'owner, 2026-10-25: radish and carrot roots sit partly below the soil (y 0 = the soil; the root 0.12 below it: finish --lower; crops.test G3)' },
  crop_carrot_3: { base: -0.13, note: 'owner, 2026-10-25: radish and carrot roots sit partly below the soil (y 0 = the soil; the root 0.13 below it: finish --lower; crops.test G3)' },
};

// ART-BIBLE §D.2 special material names a Meshy model may carry beside its one painted atlas
export const SPECIAL_MATERIALS = new Set(['Glow', 'Roof', 'Blades', 'PorchLamp', 'Glass', 'Water', 'Tint', 'Fruit']);

// ---- MEASURE ----------------------------------------------------------------------------------------------------------------
const io = new NodeIO();
const pow2 = (n) => n > 0 && (n & (n - 1)) === 0;

// one GLB -> plain numbers (no gltf-transform objects leave this function)
export async function measureModel(file) {
  const bytes = fs.readFileSync(file), doc = await io.readBinary(new Uint8Array(bytes)), R = doc.getRoot();
  const parent = new Map();
  for (const n of R.listNodes()) for (const c of n.listChildren()) parent.set(c, n);
  const nodes = R.listNodes().map((n) => ({ name: n.getName(), parent: parent.get(n) ? parent.get(n).getName() : null, mesh: !!n.getMesh() }));
  const texInfo = (t) => (t ? { mime: t.getMimeType(), size: t.getSize() || [0, 0], sha: crypto.createHash('sha256').update(t.getImage() || new Uint8Array()).digest('hex') } : null);
  const mats = new Map(), matOf = (m) => {
    if (!mats.has(m)) mats.set(m, { name: m.getName(), alpha: m.getAlphaMode(), rough: m.getRoughnessFactor(), metal: m.getMetallicFactor(), doubleSided: m.getDoubleSided(),
      tex: texInfo(m.getBaseColorTexture()), emissiveTex: !!m.getEmissiveTexture(), normalTex: !!m.getNormalTexture(), occlusionTex: !!m.getOcclusionTexture(),
      mrTex: !!m.getMetallicRoughnessTexture(), tris: 0, prims: 0, color0Prims: 0, area: 0, uvArea: 0 });
    return mats.get(m);
  };
  let tris = 0, minY = Infinity, maxY = -Infinity, canopyY = null, prims = 0, noMat = 0, nonTri = 0;
  const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], U = [[0, 0], [0, 0], [0, 0]], v = [0, 0, 0];
  for (const scene of R.listScenes()) scene.traverse((node) => {
    if (canopyY == null && node.getName() === 'Canopy') canopyY = node.getWorldMatrix()[13];   // the canopy pivot's world y
    const mesh = node.getMesh(); if (!mesh) return;
    const w = node.getWorldMatrix(), X = (e, o) => { o[0] = w[0] * e[0] + w[4] * e[1] + w[8] * e[2] + w[12]; o[1] = w[1] * e[0] + w[5] * e[1] + w[9] * e[2] + w[13]; o[2] = w[2] * e[0] + w[6] * e[1] + w[10] * e[2] + w[14]; };
    for (const p of mesh.listPrimitives()) {
      prims++;
      if (p.getMode() !== 4) nonTri++;
      const pos = p.getAttribute('POSITION'), idx = p.getIndices(), uv = p.getAttribute('TEXCOORD_0'), n = idx ? idx.getCount() : pos.getCount(), at = (k) => (idx ? idx.getScalar(k) : k);
      for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); X(v, P[0]); if (P[0][1] < minY) minY = P[0][1]; if (P[0][1] > maxY) maxY = P[0][1]; }
      const m = p.getMaterial(); if (!m) { noMat++; tris += Math.floor(n / 3); continue; }
      const M = matOf(m); M.prims++; if (p.getAttribute('COLOR_0')) M.color0Prims++;
      for (let t = 0; t + 2 < n; t += 3) {
        for (let j = 0; j < 3; j++) { pos.getElement(at(t + j), v); X(v, P[j]); if (uv) uv.getElement(at(t + j), U[j]); }
        const a = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], b = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        M.area += Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2;
        if (uv) M.uvArea += Math.abs((U[1][0] - U[0][0]) * (U[2][1] - U[0][1]) - (U[2][0] - U[0][0]) * (U[1][1] - U[0][1])) / 2;
      }
      M.tris += Math.floor(n / 3); tris += Math.floor(n / 3);
    }
  });
  const materials = [...mats.values()].map((M) => ({ ...M, density: M.tex && M.area > 0 ? Math.sqrt((M.uvArea * M.tex.size[0] * M.tex.size[1]) / M.area) : null }));
  const textures = R.listTextures().map((t) => texInfo(t));
  return { kb: bytes.length / 1024, tris, minY: Number.isFinite(minY) ? minY : 0, maxY: Number.isFinite(maxY) ? maxY : 0, canopyY, prims, noMat, nonTri, nodes, materials, textures,
    extensions: R.listExtensionsUsed().map((e) => e.extensionName), textured: materials.some((M) => M.tex) };
}

// every model of a manifest, measured (missing files are skipped here and reported by the manifest check)
export async function measureAll(modelsDir, manifest) {
  const out = {};
  for (const [id, e] of Object.entries(manifest.assets || {})) { const f = path.join(modelsDir, e.file || ''); if (e.file && fs.existsSync(f)) out[id] = await measureModel(f); }
  return out;
}

// ---- RULES ------------------------------------------------------------------------------------------------------------------
const r3 = (x) => Math.round(x * 1000) / 1000;
const isFlat = (s) => !s.textured;
const inBand = (x, [lo, hi]) => (lo == null || x >= lo) && (hi == null || x <= hi);
const bandStr = ([lo, hi]) => (hi == null ? `>= ${lo}` : lo == null ? `<= ${hi}` : `${lo}-${hi}`);

// which approach letter a measured model matches, of the allowed ones: { letter } or { errors }
function approachOf(id, cls, s) {
  const M = s.materials, tex = M.filter((m) => m.tex), errs = {};
  const jpeg = (m) => m.tex && m.tex.mime === 'image/jpeg', png = (m) => m.tex && m.tex.mime === 'image/png';
  const tryA = () => { const main = M.filter((m) => !SPECIAL_MATERIALS.has(m.name)), e = [];
    if (main.length !== 1) e.push(`${main.length} non-special materials (${main.map((m) => m.name).join(', ')})`);
    else { if (!jpeg(main[0])) e.push(`atlas ${main[0].name} not a JPEG texture`); if (main[0].alpha !== 'OPAQUE') e.push(`atlas ${main[0].alpha}`);
      if (main[0].color0Prims) e.push(`atlas ${main[0].name} carries baked COLOR_0 shade (the painted procedural signature)`); }
    return e; };
  const tryB = () => { const e = [];
    if (M.length !== 1) e.push(`${M.length} materials`);
    else { const m = M[0]; if (!jpeg(m)) e.push('not a JPEG atlas'); if (m.alpha !== 'OPAQUE') e.push(m.alpha); if (m.color0Prims !== m.prims) e.push('no baked shade (COLOR_0)'); }
    return e; };
  const tryC = () => { const e = [], base = nearOf(id);
    if (cls === 'bush') {
      for (const m of M) { const ok = (m.name === id || m.name === `${id}_overlay`) && png(m) && m.alpha === 'MASK'; if (!ok) e.push(`${m.name}: want ${id} / ${id}_overlay, PNG MASK`); }
      if (!M.some((m) => m.name === id)) e.push(`no ${id} leaves material`);
    } else {
      for (const m of M) {
        if (m.name === `${base}_bark`) { if (!jpeg(m) || m.alpha !== 'OPAQUE') e.push(`${m.name}: want JPEG OPAQUE`); }
        else if (m.name === `${base}_leaves` || m.name === `${base}_overlay`) { if (!png(m) || m.alpha !== 'MASK') e.push(`${m.name}: want PNG MASK`); }
        else e.push(`unexpected material ${m.name}`);
      }
      if (!M.some((m) => m.name === `${base}_bark`)) e.push(`no ${base}_bark`);
      if (!M.some((m) => m.name === `${base}_leaves`)) e.push(`no ${base}_leaves`);
    }
    return e; };
  const tryD = () => { const e = [], cards = M.filter((m) => m.tex), soil = M.filter((m) => !m.tex);
    if (cards.length !== 1) e.push(`${cards.length} card materials`);
    for (const m of cards) if (!png(m) || m.alpha !== 'MASK') e.push(`${m.name}: want PNG MASK`);
    if (soil.length && !(cls === 'flowerbed' && soil.length === 1 && soil[0].color0Prims === soil[0].prims)) e.push(`untextured ${soil.map((m) => m.name).join(', ')}`);
    return e; };
  const tryE = () => { const e = [];
    if (tex.length) e.push(`${tex.length} textured materials`);
    for (const m of M) { if (m.color0Prims !== m.prims) e.push(`${m.name}: no COLOR_0`); }
    return e; };
  const tryW = () => { const e = [];
    if (tex.length) e.push(`${tex.length} textured materials (baked data: no texture)`);
    if (M.length !== 1 || M[0].name !== 'Water') e.push(`materials ${M.map((m) => m.name).join(', ') || 'none'} (want the one 'Water' placeholder)`);
    return e; };
  const tries = { A: tryA, B: tryB, C: tryC, D: tryD, E: tryE, W: tryW };
  for (const L of CLASSES[cls].approach) { const e = tries[L](); if (!e.length) return { letter: L }; errs[L] = e; }
  return { errors: errs };
}

// the one-material rule per approach (ASSET-CATALOG §1-§4, ASSET-RULES §6 "one material on the shared atlas"): a list of problems
function oneMaterial(letter, cls, s) {
  const M = s.materials;
  if (letter === 'A') { const main = M.filter((m) => !SPECIAL_MATERIALS.has(m.name)); return main.length === 1 ? [] : [`${main.length} painted materials beside the D.2 special names (${main.map((m) => m.name).join(', ')})`]; }
  if (letter === 'B') return M.length === 1 ? [] : [`${M.length} materials (one on the shared atlas)`];
  if (letter === 'W') return M.length === 1 ? [] : [`${M.length} materials (one 'Water' placeholder)`];
  if (letter === 'D') { const cards = M.filter((m) => m.tex), extra = M.length - cards.length - (cls === 'flowerbed' ? 1 : 0); return cards.length === 1 && extra <= 0 ? [] : [`${cards.length} card materials + ${M.length - cards.length} others`]; }
  if (letter === 'C') { const kinds = M.map((m) => m.name.replace(/^.*_(bark|leaves|overlay)$/, '$1')); const dup = kinds.filter((k, i) => kinds.indexOf(k) !== i); return dup.length ? [`duplicate ${dup.join(', ')} materials`] : []; }
  return [];
}

// evaluate(manifest, stats, opts) -> { checks: {key: {name, errors[], info[]}}, density: rows[] }
//   opts.modelsDir      for the manifest <-> files check (orphans, missing files); omit to skip the file listing
//   opts.classes        id -> class table (default ASSET_CLASS); opts.standIns / deprecated / exceptions / ceiling: the registers
//   opts.requiredNodes  id -> [node names the game looks up] (from publish-models.mjs MODELS)
//   opts.defects / defectCeiling / heroWalls / triCeiling  the other registers (KNOWN_DEFECTS, HERO_WALLS, TRIS_EXCEPTION_CEILING)
//   opts.enforceProposed  make the approved density, canopy-pivot and neighbour checks blocking (lib/qa-proposed.mjs ENFORCE_PROPOSED)
//   opts.rigs           the rigs.json document (default: read from opts.modelsDir; null = no rigs); opts.rigStats: file -> measurements
//                       (measureRigs; checkModels passes them). The rig budgets in V1.5 need rigStats; V1.1 needs only the document.
export function evaluate(manifest, stats, opts = {}) {
  const table = opts.classes || ASSET_CLASS, standIns = opts.standIns || STAND_INS, deprecated = opts.deprecated || DEPRECATED;
  const exceptions = opts.exceptions || EXCEPTIONS, ceiling = opts.ceiling || STAND_IN_CEILING, required = opts.requiredNodes || {};
  const defects = opts.defects || KNOWN_DEFECTS, defectCeiling = opts.defectCeiling || KNOWN_DEFECT_CEILING, heroWalls = opts.heroWalls || HERO_WALLS, triCeiling = opts.triCeiling || TRIS_EXCEPTION_CEILING;
  const seen = new Set();   // known defects still real (V1.11-V1.13 add to it, V1.14 checks the register against it)
  const A = manifest.assets || {}, ids = Object.keys(A);
  const checks = {}, C = (key, name) => (checks[key] = { name, errors: [], info: [] });
  const cls = Object.fromEntries(ids.map((id) => [id, classOf(id, table)]));
  const rigs = opts.rigs !== undefined ? opts.rigs : opts.modelsDir ? readRigs(opts.modelsDir) : null, rigFiles = rigFilesOf(rigs), rigStats = opts.rigStats || {};

  // V1.1 manifest <-> files
  { const c = C('V1.1', 'manifest <-> files: version 1, every entry ready with its file (and height grid / water maps / rigs.json rigs and sources), tris match, no orphan file');
    const gone = new Set();   // data files already reported missing (water_noise.bin is shared by every water piece)
    if (manifest.version !== 1) c.errors.push(`manifest version ${manifest.version}`);
    for (const id of ids) { const e = A[id];
      if (e.status !== 'ready') c.errors.push(`${id}: status ${e.status}`);
      if (e.file !== `${id}.glb`) c.errors.push(`${id}: file ${e.file} (want ${id}.glb)`);
      if (!stats[id]) c.errors.push(`${id}: file ${e.file} missing`);
      else if (e.tris !== stats[id].tris) c.errors.push(`${id}: manifest tris ${e.tris} != file ${stats[id].tris}`);
      if (opts.modelsDir) for (const d of dataFilesOf(id, e, cls[id])) if (!gone.has(d.file) && !fs.existsSync(path.join(opts.modelsDir, d.file))) { gone.add(d.file); c.errors.push(`${id}: ${d.what} ${d.file} missing`); } }
    if (opts.modelsDir) for (const d of rigFiles) {
      if (!d.file) c.errors.push(`rigs.json ${d.id}: no ${d.what} file named`);
      else if (!gone.has(d.file) && !fs.existsSync(path.join(opts.modelsDir, d.file))) { gone.add(d.file); c.errors.push(`rigs.json ${d.id}: ${d.what} ${d.file} missing`); } }
    if (opts.modelsDir) { const known = new Set([...ids.flatMap((id) => [A[id].file, ...dataFilesOf(id, A[id], cls[id]).map((d) => d.file)]), ...rigFiles.map((d) => d.file)].filter(Boolean));
      for (const f of fs.readdirSync(opts.modelsDir)) if (/\.(glb|bin)$/.test(f) && !known.has(f)) c.errors.push(`orphan file ${f} (no manifest entry, not in ${RIGS_FILE})`); }
    c.info.push(`${ids.length} entries`);
    if (rigs) c.info.push(`${Object.keys(rigs.animals || {}).length} rigs in ${RIGS_FILE}`); }

  // V1.2 classified
  { const c = C('V1.2', 'every model has a category (lib/asset-contract.mjs ASSET_CLASS or a family pattern)');
    for (const id of ids) if (!cls[id]) c.errors.push(`${id}: unclassified (add it to ASSET_CLASS with its ASSET-RULES category)`);
    const n = {}; for (const id of ids) if (cls[id]) n[cls[id]] = (n[cls[id]] || 0) + 1;
    c.info.push(Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', ')); }

  // V1.3 flat colour: only by design (approach E classes), the stand-in register, or deprecated
  { const c = C('V1.3', 'flat colour only by design (terrain, paths, water), on the stand-in register, or deprecated; the register only shrinks');
    for (const id of ids) { const s = stats[id]; if (!s || !cls[id]) continue;
      const byDesign = CLASSES[cls[id]].approach.some((L) => L === 'E' || L === 'W');   // E flat colour, W baked data (water)
      if (isFlat(s) && !byDesign && !standIns[id] && !deprecated[id]) c.errors.push(`${id}: flat colour (no baseColor texture) and not on the stand-in register`); }
    for (const id of Object.keys(standIns)) {
      if (!ceiling.includes(id)) c.errors.push(`stand-in register grew: ${id} is not in the 2026-10-24 ceiling (${ceiling.join(', ')}); give it a texture instead`);
      if (!A[id]) c.errors.push(`stale stand-in ${id}: not in the manifest (remove it from STAND_INS)`);
      else if (stats[id] && !isFlat(stats[id])) c.errors.push(`stale stand-in ${id}: now textured (remove it from STAND_INS)`); }
    for (const id of Object.keys(deprecated)) if (!A[id]) c.errors.push(`stale deprecated ${id}: no longer published (remove it from DEPRECATED)`);
    c.info.push(`stand-ins: ${Object.keys(standIns).join(', ') || 'none'}; deprecated (flagged): ${Object.keys(deprecated).filter((d) => A[d]).join(', ') || 'none'}`);
    const partial = ids.filter((id) => stats[id] && stats[id].textured).map((id) => { const s = stats[id], u = s.materials.filter((m) => !m.tex).reduce((a, m) => a + m.tris, 0); return [id, u / s.tris]; }).filter(([, f]) => f > 0);
    if (partial.length) c.info.push('textured models with flat parts (untextured share of tris): ' + partial.map(([id, f]) => `${id} ${Math.round(f * 100)} %`).join(', ')); }

  // V1.4 texture approach
  const letter = {};
  { const c = C('V1.4', 'texture approach matches the category (ART-BIBLE §D.3: A Meshy atlas, B shared painted atlas, C ramp reskin, D cards, E flat; W baked data: the water placeholder)');
    const atlases = new Map();
    for (const id of ids) { const s = stats[id]; if (!s || !cls[id]) continue;
      if (standIns[id] && isFlat(s)) { letter[id] = 'E'; continue; }
      const r = approachOf(id, cls[id], s);
      if (r.letter) { letter[id] = r.letter; if (r.letter === 'B') { const sha = s.materials[0].tex.sha; atlases.set(sha, [...(atlases.get(sha) || []), id]); } }
      else c.errors.push(`${id} (${cls[id]}): ${Object.entries(r.errors).map(([L, e]) => `not ${L} (${e.join('; ')})`).join(' | ')}`); }
    if (atlases.size > 1) c.errors.push(`approach B models do not share one painted atlas: ${[...atlases.values()].map((v) => v.join('+')).join(' vs ')}`);
    const n = {}; for (const L of Object.values(letter)) n[L] = (n[L] || 0) + 1;
    c.info.push(Object.entries(n).sort().map(([k, v]) => `${k} ${v}`).join(', ') + (atlases.size === 1 ? `; one shared atlas (${[...atlases.values()][0].length} models)` : '')); }

  // V1.5 budgets
  const used = new Set();
  { const c = C('V1.5', 'budgets: tris, file size, texture size (power of two) per category, or a written per-id exception');
    for (const id of ids) { const s = stats[id], k = cls[id]; if (!s || !k) continue;
      const K = CLASSES[k], X = exceptions[id] || {};
      let triCap = K.tris; if (k === 'tree_far') { const nc = cls[nearOf(id)]; triCap = nc && CLASSES[nc].far; }
      const cap = (key, base) => { if (X[key] != null) { used.add(`${id}.${key}`); return X[key]; } return base; };
      const tc = cap('tris', triCap), kc = cap('kb', K.kb), xc = cap('texMax', K.texMax);
      if (tc != null && s.tris > tc) c.errors.push(`${id}: ${s.tris} tris > ${tc} (${k})`);
      if (kc != null && s.kb > kc) c.errors.push(`${id}: ${Math.round(s.kb)} KB > ${kc} (${k})`);
      for (const t of s.textures) { if (!t) continue; const [w, h] = t.size;
        if (xc != null && Math.max(w, h) > xc) c.errors.push(`${id}: ${w}x${h} texture > ${xc} (${k})`);
        if (!pow2(w) || !pow2(h)) c.errors.push(`${id}: ${w}x${h} texture not a power of two`); }
      // stale exceptions: the class budget alone would pass
      for (const key of ['tris', 'kb', 'texMax']) if (X[key] != null) {
        const base = key === 'tris' ? triCap : K[key], val = key === 'tris' ? s.tris : key === 'kb' ? s.kb : Math.max(0, ...s.textures.filter(Boolean).map((t) => Math.max(...t.size)));
        if (base != null && val <= base) c.errors.push(`stale exception ${id}.${key} = ${X[key]}: ${Math.round(val)} is within the ${k} budget ${base} (remove it from EXCEPTIONS)`); } }
    for (const [id, X] of Object.entries(exceptions)) if (X.tris != null && !triCeiling.includes(id))
      c.errors.push(`${id}: tris exception ${X.tris} is not on the owner's list (${triCeiling.join(', ')}); a new over-cap model needs the owner to add it`);
    // the rigs (R36, R37): against their source (tris + RIG_EXTRA_TRIS), RIG_KB and the animal category's tris cap. A rig over the
    // cap needs a written tris exception for its source id (the owner's list: the dog's 1,950, the sheep's 1,568); an exception
    // whose rig is within the cap is stale, as a model's is
    for (const [id, a] of Object.entries((rigs && rigs.animals) || {})) { const s = rigStats[a.file], src = rigStats[a.source]; if (!s) continue;
      if (!src) { if (opts.rigStats) c.errors.push(`rig ${id}: source ${a.source} not measured`); continue; }
      if (s.tris > src.tris + RIG_EXTRA_TRIS) c.errors.push(`rig ${id}: ${a.file} ${s.tris} tris > its source ${a.source} ${src.tris} + ${RIG_EXTRA_TRIS}`);
      if (s.kb > RIG_KB) c.errors.push(`rig ${id}: ${a.file} ${Math.round(s.kb)} KB > ${RIG_KB} (R13)`);
      const srcId = a.source.replace(/\.glb$/, ''), X = exceptions[srcId] || {}, base = CLASSES.animal.tris;
      if (X.tris == null) { if (s.tris > base) c.errors.push(`rig ${id}: ${a.file} ${s.tris} tris > the animal cap ${base}, and no written tris exception for its source ${srcId} (the owner adds it)`); continue; }
      used.add(`${srcId}.tris`);
      if (s.tris > X.tris) c.errors.push(`rig ${id}: ${a.file} ${s.tris} tris > its source's written exception ${srcId}.tris = ${X.tris}`);
      if (s.tris <= base) c.errors.push(`stale exception ${srcId}.tris = ${X.tris}: rig ${id} ${a.file} ${s.tris} tris is within the animal cap ${base} (remove it from EXCEPTIONS)`); }
    if (rigs && opts.rigStats) c.info.push(`${Object.keys(rigs.animals || {}).length} rigs within their source's tris + ${RIG_EXTRA_TRIS}, ${RIG_KB} KB and the animal cap (or a written exception)`);
    c.info.push(`${used.size} written exceptions in use (${[...used].join(', ')})`); }

  // V1.6 materials
  { const c = C('V1.6', 'materials: metalness 0, roughness >= 0.9, baseColor (+ Glow emissive) only, MASK only on cards / leaves, BLEND only on ribbons, core glTF');
    const CARD_CLASSES = new Set(['card_shrub', 'grass', 'pebble', 'wildflower', 'perennial', 'crop', 'flowerbed', 'bush', ...TREE_CLASSES, 'tree_far']);
    for (const id of ids) { const s = stats[id], k = cls[id]; if (!s || !k) continue; const X = exceptions[id] || {};
      if (s.extensions.length) c.errors.push(`${id}: glTF extensions ${s.extensions.join(', ')} (no Draco/meshopt, core glTF only)`);
      if (s.noMat) c.errors.push(`${id}: ${s.noMat} primitives without a material`);
      if (s.nonTri) c.errors.push(`${id}: ${s.nonTri} non-triangle primitives`);
      for (const m of s.materials) {
        if (m.metal !== 0) c.errors.push(`${id}.${m.name}: metalness ${m.metal}`);
        const glowSwap = m.name === 'Glow' && !m.tex;   // the game swaps an untextured Glow for its own glow material (models.test P7)
        const minR = X.roughness && X.roughness[m.name] != null ? X.roughness[m.name] : 0.9;
        if (X.roughness && X.roughness[m.name] != null) { used.add(`${id}.roughness.${m.name}`); if (m.rough >= 0.9) c.errors.push(`stale exception ${id}.roughness.${m.name}: roughness ${r3(m.rough)} >= 0.9`); }
        if (!glowSwap && m.rough < minR - 1e-6) c.errors.push(`${id}.${m.name}: roughness ${r3(m.rough)} < ${minR}`);
        if (m.normalTex) c.errors.push(`${id}.${m.name}: normal map`);
        if (m.occlusionTex) c.errors.push(`${id}.${m.name}: occlusion map`);
        if (m.mrTex) c.errors.push(`${id}.${m.name}: metallic-roughness map`);
        if (m.emissiveTex && m.name !== 'Glow') c.errors.push(`${id}.${m.name}: emissive map outside Glow`);
        if (m.alpha === 'MASK' && !CARD_CLASSES.has(k)) c.errors.push(`${id}.${m.name}: MASK on a ${k} (cards and leaves only)`);
        if (m.alpha === 'BLEND' && k !== 'path_ribbon') c.errors.push(`${id}.${m.name}: BLEND on a ${k} (ribbons and water only)`);
        if (k === 'path_ribbon' && m.alpha !== 'BLEND') c.errors.push(`${id}.${m.name}: a path ribbon must BLEND (soft edges)`);
      } }
    c.info.push(`${ids.reduce((a, id) => a + (stats[id] ? stats[id].materials.length : 0), 0)} materials`); }

  // V1.7 one material
  { const c = C('V1.7', 'one material: A one painted atlas (+ D.2 special names), B one material on the shared atlas, C one bark + one leaves (+ overlay), D one card material (+ the bed\'s soil)');
    // (a model that matched no approach in V1.4 is held to its category's first approach here, so it is not let off)
    for (const id of ids) { const s = stats[id]; if (!s || !cls[id]) continue; const L = letter[id] || CLASSES[cls[id]].approach[0];
      for (const e of oneMaterial(L, cls[id], s)) c.errors.push(`${id}: ${e}`); } }

  // V1.8 nodes
  { const c = C('V1.8', 'nodes: the category\'s (Canopy; conifers Crown > Canopy) and every node the game looks up; every tree has a far version with the same nodes');
    for (const id of ids) { const s = stats[id], k = cls[id]; if (!s || !k) continue;
      const names = new Set(s.nodes.map((n) => n.name));
      const need = [...(CLASSES[k].nodes || []), ...(required[id] || [])];
      if (k === 'tree_far') { const near = stats[nearOf(id)]; if (near) for (const n of ['Crown', 'Canopy']) if (near.nodes.some((x) => x.name === n)) need.push(n); }
      for (const n of new Set(need)) if (!names.has(n)) c.errors.push(`${id}: no ${n} node`);
      const can = s.nodes.find((n) => n.name === 'Canopy');
      if (names.has('Crown') && can && can.parent !== 'Crown') c.errors.push(`${id}: Canopy's parent is ${can.parent}, not Crown`);
      if (TREE_CLASSES.has(k) && !A[`${id}_far`]) c.errors.push(`${id}: no far version ${id}_far (ASSET-RULES §3 R20: mandatory for every tree)`); } }

  // V1.9 base at y 0
  { const c = C('V1.9', 'origin at the base: min y = 0 (water models: y 0 = the waterline), terrain, ribbons and water surfaces excepted');
    for (const id of ids) { const s = stats[id], k = cls[id]; if (!s || !k || CLASSES[k].base === false) continue; const X = exceptions[id] || {};
      const want = X.base != null ? X.base : 0, tol = X.baseTol != null ? X.baseTol : 1e-3;
      if (X.base != null) used.add(`${id}.base`); if (X.baseTol != null) used.add(`${id}.baseTol`);
      if (Math.abs(s.minY - want) > tol) c.errors.push(`${id}: min y ${r3(s.minY)} (want ${want} +- ${tol})`); } }

  // V1.10 the registers themselves: every exception key names a published id and a real key
  { const c = C('V1.10', 'registers are tidy: every exception belongs to a published model (or a rigs.json rig source) and is in use');
    const rigSources = new Set(rigFiles.filter((d) => d.what === 'rig source' && d.file).map((d) => d.file.replace(/\.glb$/, '')));
    for (const [id, X] of Object.entries(exceptions)) {
      if (!A[id] && !rigSources.has(id)) { c.errors.push(`stale exception ${id}: not in the manifest, nor a rig source in ${RIGS_FILE}`); continue; }
      if (!A[id] && !opts.rigStats) continue;   // a rig source's exception is used by V1.5's rig budget, which needs the rigs measured
      for (const key of Object.keys(X)) { if (key === 'note') continue;
        if (key === 'roughness') { for (const m of Object.keys(X.roughness)) if (!used.has(`${id}.roughness.${m}`)) c.errors.push(`exception ${id}.roughness.${m}: no such material`); }
        else if (!used.has(`${id}.${key}`)) c.errors.push(`exception ${id}.${key}: not used by any check`); } } }

  // V1.11 texel density inside the approved bands (owner 2026-10-25): blocking with enforceProposed; the farmhouse walls are a
  // named exception (HERO_WALLS), outcrop_b a tracked known defect (KNOWN_DEFECTS)
  const density = [], enforce = !!opts.enforceProposed, flag = (c, msg) => (enforce ? c.errors : c.info).push(msg);
  const HERO_CLASSES = new Set(['building', 'landmark', 'structure']), mainTex = (s) => s.materials.find((m) => m.tex && m.density != null && !SPECIAL_MATERIALS.has(m.name));
  { const c = C('V1.11', 'texel density inside the approved category band (ART-BIBLE §D.3); the farmhouse walls are a named exception, known defects are tracked');
    for (const id of ids) { const s = stats[id], k = cls[id]; if (!s || !k || !s.textured) continue;
      let band = CLASSES[k].density; if (band && !Array.isArray(band)) band = band[letter[id]] || null;
      const hero = ((exceptions[id] || {}).texMax || 0) >= 1024 && HERO_CLASSES.has(k);   // a 1024 px building is a hero: >= 128 t/u unless named
      if (heroWalls[id]) band = heroWalls[id].band; else if (hero) band = HERO_WALL_TARGET;
      for (const m of s.materials) { if (!m.tex || m.density == null || m.name === 'Glow') continue;
        let b = band;
        if (m.name === 'Roof') b = ROOF_BAND;
        else if (letter[id] === 'A' && SPECIAL_MATERIALS.has(m.name)) continue;
        if (!b) continue;
        const ok = inBand(m.density, b), known = !ok && !!(defects[id] && defects[id].density), msg = `${id}.${m.name} ${Math.round(m.density)} t/u outside ${bandStr(b)} (${k})`;
        if (known) seen.add(`${id}.density`);
        density.push({ id, cls: k, material: m.name, density: Math.round(m.density), band: bandStr(b), ok, known });
        if (known) c.info.push(`${msg}: KNOWN DEFECT, ${defects[id].density}`); else if (!ok) flag(c, msg); } }
    // a named hero exception whose walls now reach the target, or that is no longer published, is stale: delete it
    for (const id of Object.keys(heroWalls)) {
      if (!A[id]) { c.errors.push(`stale hero-wall exception ${id}: not in the manifest (remove it from HERO_WALLS)`); continue; }
      const m = stats[id] && mainTex(stats[id]);
      if (m && inBand(m.density, HERO_WALL_TARGET)) c.errors.push(`stale hero-wall exception ${id}: walls ${Math.round(m.density)} t/u now meet the ${bandStr(HERO_WALL_TARGET)} target (remove it from HERO_WALLS)`); } }

  // V1.12 canopy pivot (ASSET-RULES §3): 0.25-0.45 x height on broadleaf, birch, sapling and the hero tree; tree_spread is tracked
  { const c = C('V1.12', 'canopy pivot at 0.25-0.45 x the tree\'s height (broadleaf, birch, sapling, hero tree; conifers excepted); known defects are tracked');
    let n = 0;
    for (const id of ids) { const s = stats[id], k = cls[id]; if (!s || !PIVOT_CLASSES.has(k) || s.canopyY == null || !(s.maxY > 0)) continue;
      n++; const r = s.canopyY / s.maxY; if (inBand(r, PIVOT_BAND)) continue;
      const msg = `${id}: canopy pivot ${r3(s.canopyY)} u = ${r3(r)} x H (${r3(s.maxY)} u), outside ${bandStr(PIVOT_BAND)} x H`;
      if (defects[id] && defects[id].pivot) { seen.add(`${id}.pivot`); c.info.push(`${msg}: KNOWN DEFECT, ${defects[id].pivot}`); } else flag(c, msg); }
    c.info.push(`${n} trees measured`); }

  // V1.13 neighbours: inside a family of similar models texel density stays within 3x; across families it only reports
  { const c = C('V1.13', `neighbours: inside a family of similar models texel density stays within ${NEIGHBOUR_MAX}x (across families: reported, not gated); known defects are tracked`);
    const groups = {}, all = [];
    for (const id of ids) { const s = stats[id], k = cls[id]; if (!s || !k || !s.textured) continue;
      const m = mainTex(s), fam = FAMILY_OF(k, letter[id]); if (!m || !fam) continue;
      const row = { id, d: m.density }; if (!(defects[id] && defects[id].density)) all.push(row); (groups[fam] = groups[fam] || []).push(row); }
    const spread = (a) => Math.max(...a.map((x) => x.d)) / Math.min(...a.map((x) => x.d));
    const fmt = (a) => { const lo = a.reduce((p, q) => (q.d < p.d ? q : p)), hi = a.reduce((p, q) => (q.d > p.d ? q : p)); return `${lo.id} ${Math.round(lo.d)} to ${hi.id} ${Math.round(hi.d)} t/u = ${spread(a).toFixed(2)}x`; };
    for (const [fam, mem] of Object.entries(groups)) { if (mem.length < 2) continue;
      if (spread(mem) <= NEIGHBOUR_MAX) { c.info.push(`${fam}: ${fmt(mem)}`); continue; }
      const known = mem.filter((x) => defects[x.id] && defects[x.id].density), rest = mem.filter((x) => !known.includes(x));
      if (known.length && rest.length > 1 && spread(rest) <= NEIGHBOUR_MAX) {
        known.forEach((x) => seen.add(`${x.id}.density`));
        c.info.push(`${fam}: ${fmt(mem)}, only because of the known defect ${known.map((x) => x.id).join(', ')}; without it ${fmt(rest)}`); }
      else flag(c, `${fam}: densities span ${fmt(mem)} (the limit is ${NEIGHBOUR_MAX}x inside a family)`); }
    if (all.length > 1) c.info.push(`across families, report only (VISUAL-AUDIT #7, ART-PLAN P2-2): ${fmt(all)}`); }

  // V1.14 the known-defects register: ties each defect to its ART-PLAN item; only genuine defects stay; it only shrinks
  { const c = C('V1.14', 'known-defects register: each entry names its ART-PLAN item, is still a real defect, and the register never grows past its 2026-10-25 ceiling');
    const keys = Object.entries(defects).flatMap(([id, d]) => Object.keys(d).map((k) => `${id}.${k}`));
    for (const key of keys) { const id = key.slice(0, key.indexOf('.')), kind = key.slice(id.length + 1);
      if (!defectCeiling.includes(key)) c.errors.push(`known-defects register grew: ${key} is not in the 2026-10-25 ceiling (${defectCeiling.join(', ')}); fix the asset instead`);
      if (!/ART-PLAN P\d-\d/.test(defects[id][kind])) c.errors.push(`${key}: a known defect must name the ART-PLAN item that fixes it`);
      if (!A[id]) c.errors.push(`stale known defect ${key}: not in the manifest (remove it from KNOWN_DEFECTS)`);
      else if (!seen.has(key)) c.errors.push(`stale known defect ${key}: no longer a defect (remove it from KNOWN_DEFECTS)`); }
    c.info.push(`known defects: ${keys.join(', ') || 'none'}`); }

  return { checks, density, classes: cls, approach: letter };
}

// a convenience for the test: the manifest, its measurements and the evaluation in one call
export async function checkModels(modelsDir, opts = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(modelsDir, 'manifest.json'), 'utf8'));
  const stats = await measureAll(modelsDir, manifest);
  const rigs = opts.rigs !== undefined ? opts.rigs : readRigs(modelsDir), rigStats = await measureRigs(modelsDir, rigs);
  return { manifest, stats, rigs, rigStats, ...evaluate(manifest, stats, { modelsDir, ...opts, rigs, rigStats }) };
}
