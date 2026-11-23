// build.mjs
// Builds the proof's procedural assets into a git-ignored build dir (art/scripts/.build/models, with its own manifest.json),
// then rebuilds the proof/ folder from there: a lean relative-loading viewer plus a .wasm copy of every model it loads (the
// artifact server only serves certain extensions; GLTFLoader sniffs the GLB magic, so .wasm is fine). Verifies each .glb
// re-parses and prints a tri/budget/size table. It never touches the game's public/models unless asked:
//   node build.mjs                          proof + art/config/blueprint.pieces.json; procedural GLBs in .build/models
//   node build.mjs --publish-procedural     also (the old default) writes the 10 procedural GLBs + their manifest entries into
//                                           public/models, where export-composition / publish-models / bake-pieces own those ids
//   MODELS_DIR=<dir> overrides where the procedural GLBs go; PROOF_DIR=<dir> where the proof goes (default
//                                           art/scripts/.build/proof, git-ignored; see lib/paths.mjs, GITAWAY_PROOF also works)

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

import { NodeIO } from '@gltf-transform/core';
import { buildAsset, inspectGlb } from './lib/builder.mjs';
import { KIT, SHRUBS, buildPlant } from './lib/plantkit.mjs';
import { SPECIES, AUTUMN } from './lib/species.mjs';
import { viewerHtml } from './lib/viewer.mjs';
import GT from './lib/terrain.mjs';
import { gameBottoms } from './lib/bake.mjs';
import { assetTable } from './lib/composition.mjs';
import { PROOF_DIR } from './lib/paths.mjs';
import LOOK from '../config/look.config.mjs';
import MODULES from '../config/modules.config.mjs';
import WORLD3 from '../config/world.config.mjs';

import farmhouse from './assets/farmhouse.mjs';
import tree_round_a from './assets/tree_round_a.mjs';
import fence from './assets/fence.mjs';
import bush_a from './assets/bush_a.mjs';
import bush_flowering from './assets/bush_flowering.mjs';
import grass_tuft from './assets/grass_tuft.mjs';
import rock_a from './assets/rock_a.mjs';
import rock_b from './assets/rock_b.mjs';
import flowerbed from './assets/flowerbed.mjs';
import plot from './assets/plot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const gameModelsDir = path.join(projectRoot, 'public', 'models');
// where the procedural GLBs + their manifest entries go: the git-ignored build dir by default, public/models only with
// --publish-procedural; MODELS_DIR overrides both. PROOF_DIR (lib/paths.mjs) = where the proof viewer is written.
const PUBLISH = process.argv.includes('--publish-procedural');
const modelsDir = process.env.MODELS_DIR ? path.resolve(process.env.MODELS_DIR) : PUBLISH ? gameModelsDir : path.join(__dirname, '.build', 'models');
const manifestPath = path.join(modelsDir, 'manifest.json');

const BUDGETS = { building: 3000, animal: 1500, plant: 600, prop: 600, crop: 400 };
const MAX_BYTES = 200 * 1024;

const ASSETS = [
  farmhouse, tree_round_a, fence,
  bush_a, bush_flowering, grass_tuft, rock_a, rock_b, flowerbed, plot,
];
const PRESERVED = ['sheep'];   // existing GLBs (not rebuilt by this script) the proof scene also loads
// PROOF-ONLY model overrides: finished Meshy remakes under review (art/meshy/<id>/<id>.glb, made by scripts/meshy/finish.mjs).
// The proof loads these instead of the procedural GLB; public/models (the game's files) stay procedural until the
// texture rule is decided (the remakes carry one painted texture, ASSETS.md says flat colours only).
const meshyGlb = (id) => path.join(projectRoot, 'art', 'meshy', id, `${id}.glb`);
const PROOF_OVERRIDES = { farmhouse: meshyGlb('farmhouse'), rock_a: meshyGlb('boulder_a'), rock_b: meshyGlb('boulder_b') };
// PROOF-ONLY extras: Meshy set pieces with no procedural counterpart, shipped as <id>.wasm and placed by the "Meshy set pieces"
// block of lib/arch-scene.js (game slots / an existing tree / the rock instances / verified free spots; the layout is untouched)
// (the finished underside, art/meshy/underside, is HELD BACK: inside MAIN's cone it pokes through as patchy fragments; it has to
//  replace the cone's tip instead. Add 'underside' back here once that fit exists; arch-scene places it whenever it is loaded)
const PROOF_EXTRAS = ['boulder_c', 'outcrop_a', 'outcrop_b', 'hero_tree', 'windmill', 'well', 'bench', 'cart', 'haystack'];
// THE PAINTERLY PLANTS (art/specs/2026-10-22-painterly-trees-design.md "Revision 2", plan Task 10): every lib/species.mjs SPECIES and
// AUTUMN model (art/reskin/<id>.glb, the files export-composition copies into public/models unchanged) and every lib/plantkit.mjs
// SHRUBS card shrub (built like the kit), shipped as <id>.wasm; lib/arch-scene.js populate() draws them as tree:<id> / shrub:<id> (its
// GLB_KIND lists them as foliage). tree_round_a, bush_a and bush_flowering are procedural ASSETS ids too: the proof loads the painterly
// file for them (as the game's public/models now holds), the procedural build stays in the build dir and the table below.
const reskinGlb = (id) => path.join(projectRoot, 'art', 'reskin', `${id}.glb`);
const PAINTERLY = [...SPECIES.map((s) => [s.id, reskinGlb(s.id)]), ...AUTUMN.map((a) => [a.id, reskinGlb(a.id)]), ...Object.keys(SHRUBS).map((id) => [id, null])];

// Composition (cluster placement) now lives in look.config.mjs and is read by
// the viewer from window.__LOOK__.

async function main() {
  await fs.mkdir(modelsDir, { recursive: true });
  await fs.mkdir(PROOF_DIR, { recursive: true });
  // Drop any stale files from earlier passes (we now ship only .wasm + index.html).
  // Unlink in place rather than removing the dir, so a running static server
  // (whose cwd is this dir) keeps serving.
  for (const f of await fs.readdir(PROOF_DIR).catch(() => [])) {
    if (f.endsWith('.glb') || f === 'terrain_sample.wasm') {
      await fs.unlink(path.join(PROOF_DIR, f)).catch(() => {});
    }
  }

  const rows = [], proofTris = {};
  let allPass = true;

  for (const asset of ASSETS) {
    const outPath = path.join(modelsDir, `${asset.id}.glb`);
    const { tris } = await buildAsset(asset, outPath);

    const bytes = await fs.readFile(outPath);
    const kb = bytes.length / 1024;
    const budget = BUDGETS[asset.category];
    const info = await inspectGlb(outPath);
    const parseOk = info.tris === tris;
    const pass = tris <= budget && bytes.length <= MAX_BYTES && parseOk;
    if (!pass) allPass = false;

    rows.push({ id: asset.id, status: asset.status || 'ready', tris, budget, kb: kb.toFixed(1), pass, parseOk, nodes: info.nodes.join(', ') });

    // .wasm copy (GLB bytes) for the artifact-served viewer.
    await fs.writeFile(path.join(PROOF_DIR, `${asset.id}.wasm`), bytes);
    const ov = PROOF_OVERRIDES[asset.id];
    if (ov) { const ob = await fs.readFile(ov), oi = await inspectGlb(ov); await fs.writeFile(path.join(PROOF_DIR, `${asset.id}.wasm`), ob); proofTris[asset.id] = oi.tris;
      console.log(`  proof override: ${asset.id} <- ${path.relative(projectRoot, ov)} (${oi.tris} tris, ${(ob.length / 1024).toFixed(0)} KB; public/models keeps the procedural one)`); }
  }

  // --- Manifest: merge, preserve version + sheep; drop scene-only terrain ---
  let manifest = { version: 1, assets: {} };
  try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { /* none */ }
  if (!manifest.assets) manifest.assets = {};
  manifest.version = manifest.version || 1;
  delete manifest.assets.terrain_sample; // terrain is procedural / scene-only now
  for (const r of rows) manifest.assets[r.id] = { file: `${r.id}.glb`, status: r.status, tris: r.tris, notes: '' };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  // Remove the now-unused scene-only terrain glb if present.
  try { await fs.unlink(path.join(modelsDir, 'terrain_sample.glb')); } catch { /* ok */ }

  // --- Viewer scene config (relative .wasm paths, no base64) ---
  const sceneAssets = ASSETS.map((a) => {
    const r = rows.find((x) => x.id === a.id);
    return { id: a.id, file: `${a.id}.wasm`, tris: proofTris[a.id] ?? r.tris, status: proofTris[a.id] ? 'meshy-review' : r.status };
  });
  // existing, not rebuilt here (preserved in the manifest): copied READ-ONLY for the meadow flock
  for (const id of PRESERVED) {   // (from the build dir if it holds one, else the game's public/models + its manifest entry)
    try { let src = path.join(modelsDir, `${id}.glb`), tris = manifest.assets[id] && manifest.assets[id].tris;
      if (!(await fs.stat(src).catch(() => null))) { src = path.join(gameModelsDir, `${id}.glb`);
        try { const gm = JSON.parse(await fs.readFile(path.join(gameModelsDir, 'manifest.json'), 'utf8')); tris = gm.assets && gm.assets[id] && gm.assets[id].tris; } catch { /* none */ } }
      const bytes = await fs.readFile(src); await fs.writeFile(path.join(PROOF_DIR, `${id}.wasm`), bytes);
      sceneAssets.push({ id, file: `${id}.wasm`, tris: tris || 0, status: 'existing' }); }
    catch (e) { console.warn(`  (no ${id}.glb to copy: ${e.message})`); }
  }
  for (const id of PROOF_EXTRAS) {   // Meshy set pieces (proof only; public/models and the manifest are untouched)
    const f = meshyGlb(id), bytes = await fs.readFile(f), info = await inspectGlb(f);
    await fs.writeFile(path.join(PROOF_DIR, `${id}.wasm`), bytes);
    sceneAssets.push({ id, file: `${id}.wasm`, tris: info.tris, status: 'meshy-review' });
    console.log(`  proof extra:    ${id} <- ${path.relative(projectRoot, f)} (${info.tris} tris, ${(bytes.length / 1024).toFixed(0)} KB)`);
  }
  for (const id of Object.keys(KIT)) {   // the painterly ground-cover kit (lib/plantkit.mjs), drawn as composeBlueprint's cover
    const bytes = await buildPlant(id);
    await fs.writeFile(path.join(PROOF_DIR, `${id}.wasm`), bytes);
    sceneAssets.push({ id, file: `${id}.wasm`, tris: 0, status: 'ready' });
  }
  const painted = [];
  for (const [id, src] of PAINTERLY) {   // the painterly trees, bushes and card shrubs (see PAINTERLY)
    const bytes = src ? await fs.readFile(src) : await buildPlant(id), doc = await new NodeIO().readBinary(new Uint8Array(bytes));
    let tris = 0; for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
    await fs.writeFile(path.join(PROOF_DIR, `${id}.wasm`), bytes);
    const rec = { id, file: `${id}.wasm`, tris, status: 'painterly' }, e = sceneAssets.find((a) => a.id === id);
    if (e) Object.assign(e, rec); else sceneAssets.push(rec);   // (a procedural id: the painterly file replaces it in the proof)
    painted.push(`${id} ${tris}${e ? ' (replaces the procedural)' : ''}`);
  }
  console.log(`  painterly:      ${painted.length} plant GLBs (tris): ${painted.join(', ')}`);
  // BAKED PIECES (bake-pieces.mjs output, read from public/models): shipped as piece_<id>.wasm + piece_<id>_height.wasm for the
  // proof's ?baked=1 review mode only (arch-scene.js); the default proof never loads them
  const bakedPieces = [];
  let bakedManifest = null; try { bakedManifest = JSON.parse(await fs.readFile(path.join(gameModelsDir, 'manifest.json'), 'utf8')); } catch { /* none */ }
  for (const [key, e] of Object.entries((bakedManifest && bakedManifest.assets) || {})) {
    if (!key.startsWith('piece_') || !e.height) continue;
    try {
      const id = key.slice(6);
      await fs.writeFile(path.join(PROOF_DIR, `${key}.wasm`), await fs.readFile(path.join(gameModelsDir, e.file)));
      await fs.writeFile(path.join(PROOF_DIR, `${key}_height.wasm`), await fs.readFile(path.join(gameModelsDir, e.height.file)));
      bakedPieces.push({ id, file: `${key}.wasm`, height: `${key}_height.wasm`, heightMeta: e.height, tris: e.tris });
    } catch (err) { console.warn(`  (baked piece ${key} not shipped: ${err.message})`); }
  }
  if (bakedPieces.length) console.log(`  baked pieces:   ${bakedPieces.map((b) => `${b.id} ${b.tris}`).join(', ')} tris (?baked=1)`);
  // WATER v2 (bake-water.mjs output, read from public/models): water.json inlined, the GLBs / maps / noise shipped as .wasm, for the
  // proof's ?water=v2 preview only (arch-scene.js); the default proof never loads them
  let water = null;
  try {
    const wj = JSON.parse(await fs.readFile(path.join(gameModelsDir, 'water.json'), 'utf8')), files = {};
    await fs.writeFile(path.join(PROOF_DIR, 'water_noise.wasm'), await fs.readFile(path.join(gameModelsDir, wj.noise.file)));
    for (const [id, p] of Object.entries(wj.pieces)) {
      files[id] = { glb: `water_${id}.wasm`, map: `water_${id}_map.wasm` };
      await fs.writeFile(path.join(PROOF_DIR, files[id].glb), await fs.readFile(path.join(gameModelsDir, p.glb)));
      await fs.writeFile(path.join(PROOF_DIR, files[id].map), await fs.readFile(path.join(gameModelsDir, p.map.file)));
    }
    water = { json: wj, files, noiseFile: 'water_noise.wasm' };
    console.log(`  water v2:       ${Object.keys(files).join(', ')} (?water=v2)`);
  } catch (err) { console.warn(`  (water v2 not shipped: ${err.message})`); }
  const waterSource = await fs.readFile(path.join(__dirname, 'lib', 'water-core.mjs'), 'utf8');   // the water revamp's core (GLSL, patch, phases) -> window.__WATER_CORE__
  // Inline the pure terrain core (lib/terrain.mjs) into the viewer as window.__GT__
  // so the browser and the node tests share ONE source of truth for the math.
  const stripEsm = (src) => src.replace(/^\s*export\s+default\s+[^;]+;?\s*$/m, '').replace(/^export\s+/gm, '');
  const terrainSrc = await fs.readFile(path.join(__dirname, 'lib', 'terrain.mjs'), 'utf8');
  const gtSource = terrainSrc
    .replace(/^\s*export\s+default\s+GT;?\s*$/m, '')   // drop the ESM default export
    .replace(/^export\s+/gm, '');                       // strip `export ` on declarations
  // ARCHIPELAGO: the island adapter (three passed in) + the blueprint scene, inlined as a module script
  const adapterSource = stripEsm(await fs.readFile(path.join(__dirname, 'lib', 'islandAdapter.mjs'), 'utf8'));
  const archSource = await fs.readFile(path.join(__dirname, 'lib', 'arch-scene.js'), 'utf8');
  // LOOK-BRIEF: every look value lives in art/config/lookPresets.json (+ schema); the lil-gui panel is proof-page only
  const readJson = async (f) => JSON.parse(await fs.readFile(path.join(projectRoot, 'art', 'config', f), 'utf8'));
  const lookPresets = await readJson('lookPresets.json'), lookSchema = await readJson('lookPresets.schema.json');
  const panelSource = await fs.readFile(path.join(__dirname, 'lib', 'look-panel.js'), 'utf8');
  const saveSource = await fs.readFile(path.join(__dirname, 'lib', 'look-save.mjs'), 'utf8');   // the panel's Save & share logic (claude.ai artifact db / downloads); viewer.mjs inlines it
  const coreSource = await fs.readFile(path.join(__dirname, 'lib', 'look-core.mjs'), 'utf8');   // WORLDSEED look core (time of day, cel patch, painted sky / composite GLSL) -> window.__LOOK_CORE__
  const plantsSource = await fs.readFile(path.join(__dirname, 'lib', 'plants.mjs'), 'utf8');   // WORLDSEED plants & shapes (procedural tree variants + shrubs) -> window.__PLANTS__
  const ti = process.argv.indexOf('--three'), threeVersion = ti > 0 ? process.argv[ti + 1] : undefined;   // A/B build on another three release
  const bakedUnderScale = WORLD3.archipelago.blueprint.underside.gameScale;   // (the baked pieces' underside scale, for ?baked=1's haze fade)
  // the ground-cover kit's yOffset per kit id, from the same assets table the export writes (lib/composition.mjs assetTable): the proof draws
  // each cover item at height + this, as the game does
  const kitTable = assetTable(WORLD3.archipelago), kitYOffset = Object.fromEntries(Object.keys(KIT).map((id) => [id, kitTable[id].yOffset]));
  const sceneCfg = bakedPieces.length ? { assets: sceneAssets, kitYOffset, bakedPieces, ...(bakedUnderScale != null ? { bakedUnderScale } : {}) } : { assets: sceneAssets, kitYOffset };
  if (water) sceneCfg.water = water;
  await fs.writeFile(path.join(PROOF_DIR, 'index.html'), viewerHtml(sceneCfg, LOOK, MODULES, gtSource, WORLD3, archSource, adapterSource,
    { lookPresets, lookSchema, panelSource, saveSource, coreSource, plantsSource, threeVersion, waterSource }));
  if (threeVersion) console.log(`  NOTE: proof built on three@${threeVersion} (A/B build; the default is the game's version)`);

  // --- spec v3.1 section 10: piece data for the game, next to the config (deterministic) ---
  const A = WORLD3.archipelago;
  const t0 = Date.now();
  const bp = GT.buildBlueprint(A, LOOK, {});
  const comp = GT.composeBlueprint(bp, LOOK);
  const exp = GT.exportBlueprint(bp, comp, { gameBottoms: gameBottoms() });   // (depth / bottomLocal == the baked GLBs)
  const exportPath = path.join(projectRoot, 'art', 'config', 'blueprint.pieces.json');
  await fs.writeFile(exportPath, JSON.stringify(exp, null, 1) + '\n');
  console.log(`  blueprint: ${bp.order.length} pieces, across ${exp.joinedSize.maxAcross} u, built+exported in ${Date.now() - t0} ms -> ${exportPath}`);

  // --- Report ---
  console.log('\n  id                status  tris / budget   pass   KB     parse  nodes');
  console.log('  ' + '-'.repeat(78));
  for (const r of rows) {
    console.log('  ' + r.id.padEnd(18) + r.status.padEnd(8) +
      (`${r.tris} / ${r.budget}`).padEnd(15) + (r.pass ? ' OK  ' : ' FAIL') + '  ' +
      String(r.kb).padStart(6) + '   ' + (r.parseOk ? ' yes ' : ' NO  ') + '  ' + r.nodes);
  }
  const wasm = sceneAssets.map((r) => `./${r.id}.wasm`);
  console.log(`\n  wasm files referenced (${wasm.length}): ${wasm.join(' ')}`);
  console.log(`  manifest:  ${manifestPath}`);
  console.log(`  proof dir: ${PROOF_DIR}`);
  console.log(`  viewer:    ${path.join(PROOF_DIR, 'index.html')}`);
  console.log(allPass ? '\n  ALL PASS\n' : '\n  SOME FAILED\n');
  if (!allPass) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
