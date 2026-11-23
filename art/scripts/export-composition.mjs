// export-composition.mjs -- writes the V21 proof's per-piece composition for the game + the plant models and path ribbons it uses.
//   node export-composition.mjs
// Writes ONLY: art/config/composition.pieces.json; public/models/<id>.glb for its plant assets: the 14 painterly trees and bushes
// (lib/species.mjs SPECIES + AUTUMN: art/reskin/<id>.glb, copied byte for byte) and the 11 trees' far versions (<id>_far.glb, task
// 11b: assets[id].far, manifest id <id>_far), the 3 card shrubs (lib/plantkit.mjs SHRUBS),
// grass_tuft and flower_head (lib/composition.mjs plantAssets) and the 12 ground-cover kit models (lib/plantkit.mjs KIT); one
// paths_<piece>.glb per piece with paths; and those entries in public/models/manifest.json (every other manifest entry is kept
// untouched). Deterministic: same seed, the same art/reskin files and the same baked pieces (public/models/piece_<id>.glb, which the
// ribbons sit on), same bytes.
// Logic: lib/composition.mjs (the proof's own composeBlueprint output, filtered and transformed exactly like lib/arch-scene.js
// draws it). Tests: tests/composition.test.mjs. Proof agreement + sheets: composition-check.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import GT from './lib/terrain.mjs';
import { compositionData, serialize, plantAssets, bakedTopSampler, bakedRim, seamEnds, pathRibbon, reskinFrom, PROOF_LOOK, PATH_LIFT, KIT_CATEGORY, GAME_PLACED } from './lib/composition.mjs';
import { buildPlant, SHRUBS } from './lib/plantkit.mjs';
import { SPECIES, AUTUMN } from './lib/species.mjs';
import L from '../config/look.config.mjs';
import W3 from '../config/world.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(__dirname, '..'), ROOT = path.resolve(ART, '..');
export const OUT = { json: path.join(ART, 'config', 'composition.pieces.json'), models: path.join(ROOT, 'public', 'models'), manifest: path.join(ROOT, 'public', 'models', 'manifest.json') };
export const RESKIN = path.join(ART, 'reskin');   // the finished painterly GLBs (reskin.mjs; art/reskin/SOURCES.md)
const trisOf = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

// the manifest note of a painterly tree / bush: what it is, where it comes from, how it is built and drawn
function reskinNote(id) {
  const a = AUTUMN.find((x) => x.id === id), s = SPECIES.find((x) => x.id === (a ? a.from : id));
  const what = a ? `autumn accent (${a.from} recoloured)` : s.kind === 'bush' ? 'painterly bush' : `painterly ${s.kind === 'conifer' ? 'conifer (rebuilt round a straight trunk, its fronds evenly round it: reskin.mjs step 3c)' : 'broadleaf'}`;
  const parts = s.kind === 'bush' ? `one node: leaves (PNG, alphaMode MASK)${s.overlay ? ` + the berries (${id}_overlay, MASK)` : ''}`
    : `bark (${id}_bark, JPEG, opaque) on the root, leaves (${id}_leaves, PNG, alphaMode MASK) in node ${s.kind === 'conifer' ? 'Crown > Canopy' : 'Canopy'}${s.overlay ? ` + the apples (${id}_overlay, MASK)` : ''}`;
  const tint = s.kind === 'bush' || GAME_PLACED.has(id) ? 'untinted' : 'per-instance near-white crown tint in composition.pieces.json';
  return `${what}: ${reskinFrom(id)}, copied unchanged (art/reskin/SOURCES.md); ${parts}; ${tint}` + (GAME_PLACED.has(id) ? '; not placed by the composition (the game\'s fruit-tree slots)' : '');
}
// the manifest note of a tree's far version (task 11b)
function farNote(id) {
  const a = AUTUMN.find((x) => x.id === id), s = SPECIES.find((x) => x.id === (a ? a.from : id)), conifer = s.kind === 'conifer';
  return `far version of ${id} for distant / low-power draws (assets.${id}.far): art/reskin/${id}_far.glb (reskin.mjs, from the same build), copied unchanged; `
    + `${conifer ? 'the trunk a six-sided tube along the straight near trunk; every frond kept, each simplified (none below 6 triangles)' : 'the trunk alone, simplified; the leaf cards thinned (the least seen first) and grown into the crown'}${s.overlay ? ', 6 apples' : ''}; `
    + `the same material names, alpha modes and samplers as ${id}.glb (bind by name), its own textures downsampled to 256 px; `
    + `the same node structure and Canopy pivot (root ${id}_far > ${conifer ? 'Crown > Canopy' : 'Canopy'})`;
}

// build everything in memory: { json, data, assets: { id: { file, bytes, entry } } }
export async function buildExport() {
  const A = W3.archipelago, seed = A.seeds.default >>> 0;
  const LP = JSON.parse(await fs.readFile(path.join(ART, 'config', 'lookPresets.json'), 'utf8')), look = LP.presets[PROOF_LOOK];
  const BPJ = JSON.parse(await fs.readFile(path.join(ART, 'config', 'blueprint.pieces.json'), 'utf8'));
  const bp = GT.buildBlueprint(A, L, { seed }), comp = GT.composeBlueprint(bp, L);
  const data = compositionData(bp, comp, L, look, { seed });
  const io = new NodeIO(), assets = {};
  // the painterly trees and bushes (lib/species.mjs SPECIES, then the AUTUMN recolours): the finished reskin GLBs, byte for byte; each
  // tree followed by its far version (<id>_far.glb, task 11b)
  for (const id of [...SPECIES.map((s) => s.id), ...AUTUMN.map((a) => a.id)]) {
    const bytes = await fs.readFile(path.join(RESKIN, id + '.glb'));
    assets[id] = { file: id + '.glb', bytes, entry: { file: id + '.glb', status: 'ready', tris: trisOf(await io.readBinary(new Uint8Array(bytes))), notes: reskinNote(id) } };
    if (!data.assets[id].far) continue;
    const fb = await fs.readFile(path.join(RESKIN, data.assets[id].far));
    assets[id + '_far'] = { file: data.assets[id].far, bytes: fb, entry: { file: data.assets[id].far, status: 'ready', tris: trisOf(await io.readBinary(new Uint8Array(fb))), notes: farNote(id) } };
  }
  // the card shrubs (lib/plantkit.mjs SHRUBS): the woodland-edge belt
  for (const id of Object.keys(SHRUBS)) {
    const bytes = await buildPlant(id);
    assets[id] = { file: id + '.glb', bytes, entry: { file: id + '.glb', status: 'ready', tris: trisOf(await io.readBinary(bytes)),
      notes: 'card shrub (woodland-edge belt), lib/plantkit.mjs SHRUBS: crossed and tilted cards with a painted cut-out PNG (alphaMode MASK, two-sided by duplicated faces, normals leaning up); untinted' } };
  }
  for (const [id, a] of Object.entries(plantAssets(L, A))) {
    const bytes = await io.writeBinary(a.doc);
    assets[id] = { file: id + '.glb', bytes, entry: { file: id + '.glb', status: 'ready', tris: a.tris, notes: a.notes } };
  }
  // the painterly ground-cover kit (lib/plantkit.mjs): painted cut-out cards, one PNG texture each (MASK alpha)
  for (const id of Object.keys(KIT_CATEGORY)) {
    const bytes = await buildPlant(id), tris = (await io.readBinary(bytes)).getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3;
    assets[id] = { file: id + '.glb', bytes, entry: { file: id + '.glb', status: 'ready', tris,
      notes: `ground cover (${KIT_CATEGORY[id]}), the painterly kit: crossed cards with a painted cut-out PNG (alphaMode MASK, two-sided by duplicated faces, normals leaning up), lib/plantkit.mjs` } };
  }
  // path ribbons, one GLB per piece with paths, on the BAKED piece top (the game's terrain) + PATH_LIFT; a run that crosses onto the
  // next piece ends on the seam the two baked tops share, row for row with the neighbour's run (seamEnds: lib/composition.mjs)
  const baked = {}, rims = {};
  for (const id of bp.order) { baked[id] = await io.read(path.join(OUT.models, `piece_${id}.glb`)); rims[id] = bakedRim(baked[id], BPJ.pieces[id].dockedPosition); }
  const ends = seamEnds(bp, comp, rims);
  for (const [piece, R] of Object.entries(data.paths.ribbons)) {
    const id = R.file.replace(/\.glb$/, '');
    const r = pathRibbon(id, data.pieces[piece].paths, bakedTopSampler(baked[piece]), BPJ.pieces[piece].outline, BPJ.pieces[piece].dockedPosition, data.pathTone, ends[piece]);
    const bytes = await io.writeBinary(r.doc), ids = data.pieces[piece].paths.map((q) => q.id);
    assets[id] = { file: R.file, bytes, entry: { file: R.file, status: 'ready', tris: r.tris,
      notes: `path ribbons for piece ${piece} (${ids.join(', ')}): piece-local, on the baked top of piece_${piece}.glb + ${PATH_LIFT} u, COLOR_0 rgba = the V21 path tone with soft edges in alpha, one alphaMode BLEND material; add to the piece group` } };
  }
  return { json: serialize(data), data, assets };
}

// merge OUR entries into a manifest object; every other entry (and the version) is left as it is
export function mergeManifest(manifest, entries) {
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  m.version = m.version || 1; m.assets = m.assets || {};
  for (const [id, e] of Object.entries(entries)) m.assets[id] = e;
  return m;
}

async function main() {
  const t0 = Date.now(), ex = await buildExport();
  await fs.writeFile(OUT.json, ex.json);
  await fs.mkdir(OUT.models, { recursive: true });
  for (const a of Object.values(ex.assets)) await fs.writeFile(path.join(OUT.models, a.file), a.bytes);
  let manifest = { version: 1, assets: {} };
  try { manifest = JSON.parse(await fs.readFile(OUT.manifest, 'utf8')); } catch { /* none yet */ }
  mergeManifest(manifest, Object.fromEntries(Object.entries(ex.assets).map(([id, a]) => [id, a.entry])));
  await fs.writeFile(OUT.manifest, JSON.stringify(manifest, null, 2) + '\n');
  const C = ex.data.counts, cats = ['trees', 'shrubs', 'rocks', 'flowers', 'grass', 'paths'];
  console.log(`  composition: ${path.relative(ROOT, OUT.json)} (${(ex.json.length / 1024).toFixed(0)} KB) in ${Date.now() - t0} ms`);
  console.log('  piece     ' + cats.map((c) => c.padStart(c.length + 1)).join(''));
  for (const id of Object.keys(C)) console.log('  ' + id.padEnd(10) + cats.map((c) => String(C[id][c]).padStart(c.length + 1)).join(''));
  console.log('\n  asset                  tris     KB');
  for (const [id, a] of Object.entries(ex.assets)) console.log(`  ${id.padEnd(22)} ${String(a.entry.tris).padStart(5)} ${(a.bytes.length / 1024).toFixed(1).padStart(6)}`);
  console.log(`  conflicts: ${ex.data.conflicts.items.map((c) => `${c.path} x ${c.slot} (${c.overlap})`).join('; ')}`);
  console.log(`  manifest: ${path.relative(ROOT, OUT.manifest)} (${Object.keys(ex.assets).length} entries merged, ${Object.keys(manifest.assets).length} total)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
