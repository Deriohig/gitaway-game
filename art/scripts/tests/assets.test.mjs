// assets.test.mjs -- VISUAL-QA V1, the asset contract (ART-PLAN A2, stage 1 "QA rails"). Every model in public/models/manifest.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ASSET_CLASS, EXCEPTIONS, HERO_WALLS, KNOWN_DEFECTS, STAND_INS, checkModels, evaluate, measureModel } from '../lib/asset-contract.mjs';
import { ENFORCE_PROPOSED, PENDING } from '../lib/qa-proposed.mjs';
import { MODELS, projectRoot } from '../publish-models.mjs';
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const modelsDir = path.join(projectRoot, 'public', 'models');
const requiredNodes = Object.fromEntries(MODELS.filter((M) => M.nodes.length).map((M) => [M.id, M.nodes]));
const lines = (a) => a.join('\n        ');
// ---- the published models ----
const real = await checkModels(modelsDir, { requiredNodes, enforceProposed: ENFORCE_PROPOSED });
const KEYS = ['V1.1', 'V1.2', 'V1.3', 'V1.4', 'V1.5', 'V1.6', 'V1.7', 'V1.8', 'V1.9', 'V1.10'];
KEYS.forEach((k, i) => { const c = real.checks[k]; ok(`A${i + 1} ${c.name}`, !c.errors.length, c.errors.length ? lines(c.errors) : c.info.join('; ')); });
const label = ENFORCE_PROPOSED ? 'BLOCKING' : `REPORT ONLY, ${PENDING}`;
{ const c = real.checks['V1.11'], out = real.density.filter((r) => !r.ok && !r.known), known = real.density.filter((r) => r.known);
  ok(`A11 ${c.name} [${label}]`, !c.errors.length,
    `${real.density.length - out.length - known.length} of ${real.density.length} textured materials in band; known defects: ${known.length ? known.map((r) => `${r.id}.${r.material} ${r.density} t/u (band ${r.band})`).join(', ') : 'none'}; outside:\n        ` +
    (out.length ? lines(out.map((r) => `${r.id}.${r.material} (${r.cls}) ${r.density} t/u, band ${r.band}`)) : 'none') + (c.errors.length ? '\n        ' + lines(c.errors) : '')); }
for (const [i, k] of ['V1.12', 'V1.13', 'V1.14'].entries()) { const c = real.checks[k];
  ok(`A${12 + i} ${c.name}${i < 2 ? ` [${label}]` : ''}`, !c.errors.length, c.errors.length ? lines(c.errors) : lines(c.info)); }
// ---- the contract on mutated manifests ----
const io = new NodeIO();
const tmps = [];
// a temp models folder: entries [{id, from, edit?}] copied (or rewritten) from public/models with honest manifest tris
async function folder(entries, { extra = [], edit } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v1-mut-')); tmps.push(dir);
  const manifest = { version: 1, assets: {} };
  for (const e of entries) {
    const dst = path.join(dir, `${e.id}.glb`);
    if (e.edit) { const doc = await io.read(path.join(modelsDir, e.from)); e.edit(doc); await io.write(dst, doc); } else fs.copyFileSync(path.join(modelsDir, e.from), dst);
    manifest.assets[e.id] = { file: `${e.id}.glb`, status: 'ready', tris: (await measureModel(dst)).tris };
  }
  for (const x of extra) fs.copyFileSync(path.join(modelsDir, x.from), path.join(dir, x.name));
  if (edit) edit(manifest);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return dir;
}
const bare = { requiredNodes, standIns: {}, deprecated: {}, exceptions: {}, defects: {}, heroWalls: {} };   // registers empty unless a case is about them
const has = (res, key, ...subs) => { const e = res.checks[key].errors; const miss = subs.filter((s) => !e.some((x) => x.includes(s))); return { pass: !miss.length, detail: miss.length ? `missing ${miss.join(' / ')} in ${key}: ${e.join(' | ') || 'no errors'}` : `${key}: ${e.filter((x) => subs.some((s) => x.includes(s))).join(' | ')}` }; };
const ENF = { modelsDir, requiredNodes, enforceProposed: true };   // the approved checks on, whatever ENFORCE_PROPOSED says
// M1 the plan's claim: with an empty stand-in register the published set is red on exactly the flat stand-ins left (sheep; the plot
{ const r = evaluate(real.manifest, real.stats, { modelsDir, requiredNodes, standIns: {} }), e = r.checks['V1.3'].errors;
  const ids = e.map((x) => x.split(':')[0]).sort();
  ok('M1 stand-in register emptied: the published set goes red on exactly sheep', JSON.stringify(ids) === JSON.stringify(['sheep']), e.join(' | ')); }
// M2 a new flat model off the register
{ const r = await checkModels(await folder([{ id: 'crate', from: 'sheep.glb' }]), { ...bare, classes: { ...ASSET_CLASS, crate: 'prop' } }), h = has(r, 'V1.3', 'crate: flat colour');
  ok('M2 a new flat-colour prop (sheep.glb as "crate") off the register is red', h.pass, h.detail); }
// M3 file drift
{ const dir = await folder([{ id: 'bench', from: 'bench.glb' }], { extra: [{ from: 'rock_a.glb', name: 'stray.glb' }], edit: (m) => { m.assets.ghost = { file: 'ghost.glb', status: 'ready', tris: 1 }; m.assets.bench.tris += 7; } });
  const h = has(await checkModels(dir, bare), 'V1.1', 'ghost: file ghost.glb missing', 'orphan file stray.glb', 'bench: manifest tris');
  ok('M3 manifest drift (entry without a file, orphan file, wrong tris) is red', h.pass, h.detail); }
// M4 an unclassified id
{ const h = has(await checkModels(await folder([{ id: 'mystery', from: 'bench.glb' }]), bare), 'V1.2', 'mystery: unclassified');
  ok('M4 an id with no category is red', h.pass, h.detail); }
// M5 a budget breach: the farmhouse published as a prop
{ const h = has(await checkModels(await folder([{ id: 'bench', from: 'farmhouse.glb' }]), bare), 'V1.5', 'bench: 3646 tris > 600', 'KB > 200', 'texture > 512');
  ok('M5 the farmhouse under a prop id breaks the prop budgets (tris, KB, texture size)', h.pass, h.detail); }
// M6 material breaches on a Meshy prop
{ const dir = await folder([{ id: 'bench', from: 'bench.glb', edit: (doc) => { const m = doc.getRoot().listMaterials()[0]; m.setMetallicFactor(1).setRoughnessFactor(0.4).setAlphaMode('BLEND').setNormalTexture(m.getBaseColorTexture()); } }]);
  const h = has(await checkModels(dir, bare), 'V1.6', 'metalness 1', 'roughness 0.4', 'normal map', 'BLEND on a prop');
  ok('M6 metalness, low roughness, a normal map and BLEND on an opaque prop are red', h.pass, h.detail); }
// M7 nodes: a broadleaf published as a conifer, without a far version
{ const h = has(await checkModels(await folder([{ id: 'tree_pine_a', from: 'tree_round_a.glb' }]), bare), 'V1.8', 'tree_pine_a: no Crown node', 'no far version tree_pine_a_far');
  ok('M7 a conifer without Crown and a tree without its far version are red', h.pass, h.detail); }
// M8 the register only shrinks: a textured entry is stale, a newcomer breaks the ceiling
{ const a = evaluate(real.manifest, real.stats, { modelsDir, requiredNodes, standIns: { ...STAND_INS, bench: 'test' } });
  const b = await checkModels(await folder([{ id: 'crate', from: 'sheep.glb' }]), { ...bare, classes: { ...ASSET_CLASS, crate: 'prop' }, standIns: { crate: 'test' } });
  const h1 = has(a, 'V1.3', 'stale stand-in bench: now textured'), h2 = has(b, 'V1.3', 'stand-in register grew: crate');
  ok('M8 stand-in register: a textured entry is stale, an entry outside the ceiling is red', h1.pass && h2.pass, `${h1.detail} || ${h2.detail}`); }
// M9 one material: a second painted material beside the farmhouse atlas
{ const dir = await folder([{ id: 'farmhouse', from: 'farmhouse.glb', edit: (doc) => doc.getRoot().listMaterials().find((m) => m.getName() === 'Roof').setName('Shingles') }]);
  const h = has(await checkModels(dir, { ...bare, requiredNodes: {}, exceptions: { farmhouse: EXCEPTIONS.farmhouse } }), 'V1.7', 'farmhouse: 2 painted materials');
  ok('M9 two painted materials on a Meshy model (Roof renamed Shingles) are red', h.pass, h.detail); }
// M10 a stale exception, and the enforcement switch (with the known-defects register emptied, outcrop_b is the one density breach)
{ const a = evaluate(real.manifest, real.stats, { modelsDir, requiredNodes, exceptions: { ...EXCEPTIONS, bench: { tris: 900, note: 'test' } } });
  const on = evaluate(real.manifest, real.stats, { ...ENF, defects: {} }), off = evaluate(real.manifest, real.stats, { modelsDir, requiredNodes, defects: {}, enforceProposed: false });
  const h = has(a, 'V1.5', 'stale exception bench.tris'), n = on.checks['V1.11'].errors.length;
  const sw = n >= 1 && off.checks['V1.11'].errors.length === 0 && off.checks['V1.11'].info.length === n && on.checks['V1.12'].errors.length >= 1 && off.checks['V1.12'].errors.length === 0 && off.checks['V1.13'].errors.length === 0;
  ok('M10 an unneeded exception is red; enforceProposed turns every out-of-band density, pivot and neighbour breach into an error (and only then)', h.pass && sw,
    `${h.detail}; with the known-defects register emptied: density breaches ${n}, pivot ${on.checks['V1.12'].errors.length}, neighbours ${on.checks['V1.13'].errors.length} as errors with the switch on; off: ${off.checks['V1.11'].errors.length} / ${off.checks['V1.12'].errors.length} / ${off.checks['V1.13'].errors.length}`); }
// M11 the known-defects register: emptied, the set is red on exactly outcrop_b and tree_spread; a new, stale or plan-less entry is red
{ const a = evaluate(real.manifest, real.stats, { ...ENF, defects: {} }), e = (k) => a.checks[k].errors;
  const h = has(a, 'V1.11', 'outcrop_b.outcrop_b 73 t/u outside >= 100'), h2 = has(a, 'V1.12', 'tree_spread: canopy pivot 0.213 u = 0.111 x H'), h3 = has(a, 'V1.13', 'boulders + outcrops: densities span');
  const exact = e('V1.11').length === 1 && e('V1.12').length === 1 && e('V1.13').length === 1;
  const b = evaluate(real.manifest, real.stats, { ...ENF, defects: { ...KNOWN_DEFECTS, bench: { density: 'ART-PLAN P2-2 / test' }, rock_a: { pivot: 'no plan item' } } });
  const h4 = has(b, 'V1.14', 'known-defects register grew: bench.density', 'stale known defect bench.density', 'rock_a.pivot: a known defect must name the ART-PLAN item');
  ok('M11 known-defects register emptied: red on exactly outcrop_b (density, family spread) and tree_spread (pivot); a newcomer, a stale entry and a plan-less entry are red', h.pass && h2.pass && h3.pass && exact && h4.pass,
    `${h.detail} || ${h2.detail} || ${h3.detail} || errors ${e('V1.11').length}/${e('V1.12').length}/${e('V1.13').length} || ${h4.detail}`); }
// M12 density floors: the farmhouse unnamed is below the hero target, a stale hero exception is red, an outcrop texture on a boulder id is below the boulder floor
{ const a = evaluate(real.manifest, real.stats, { ...ENF, heroWalls: {} }), b = evaluate(real.manifest, real.stats, { ...ENF, heroWalls: { ...HERO_WALLS, windmill: { band: [75, null], why: 'test' } } });
  const c = await checkModels(await folder([{ id: 'rock_a', from: 'outcrop_a.glb' }]), { ...bare, ...ENF, defects: {}, exceptions: {} });
  const h1 = has(a, 'V1.11', 'farmhouse.farmhouse 79 t/u outside >= 128'), h2 = has(b, 'V1.11', 'stale hero-wall exception windmill'), h3 = has(c, 'V1.11', 'rock_a.outcrop_a 106 t/u outside 200-500');
  ok('M12 density floors bite: the farmhouse without its named exception (79 < 128), a stale hero exception (windmill 133), and an outcrop texture on a boulder (106 < 200) are red', h1.pass && h2.pass && h3.pass, `${h1.detail} || ${h2.detail} || ${h3.detail}`); }
// M13 the tris exception list is the owner's eight: a ninth is red
{ const h = has(evaluate(real.manifest, real.stats, { modelsDir, requiredNodes, exceptions: { ...EXCEPTIONS, rock_a: { tris: 700, note: 'test' } } }), 'V1.5', 'rock_a: tris exception 700 is not on the owner');
  ok('M13 a ninth tris exception (rock_a: 700) is red: the owner adds new over-cap models', h.pass, h.detail); }
// M14 the canopy pivot: tree_round_a with its Canopy dropped to the ground
{ const dir = await folder([{ id: 'tree_round_a', from: 'tree_round_a.glb', edit: (doc) => { const n = doc.getRoot().listNodes().find((x) => x.getName() === 'Canopy'), t = n.getTranslation(); n.setTranslation([t[0], 0.05, t[2]]); } }]);
  const h = has(await checkModels(dir, { ...bare, ...ENF, requiredNodes: {} }), 'V1.12', 'tree_round_a: canopy pivot');
  ok('M14 a broadleaf whose Canopy pivot sits on the ground (below 0.25 x H) is red', h.pass, h.detail); }
// M15 the water bake: water_main with its map and the shared noise beside it is clean (V1.1-V1.10); without the map and noise, with a
{ const W = { id: 'water_main', from: 'water_main.glb' }, data = [{ from: 'water_main.map.bin', name: 'water_main.map.bin' }, { from: 'water_noise.bin', name: 'water_noise.bin' }];
  const clean = await checkModels(await folder([W], { extra: data }), bare), dirty = Object.keys(clean.checks).slice(0, 10).filter((k) => clean.checks[k].errors.length);
  const miss = has(await checkModels(await folder([W]), bare), 'V1.1', 'water_main: baked map water_main.map.bin missing', 'water_main: shared noise water_noise.bin missing');
  const stray = has(await checkModels(await folder([W], { extra: [...data, { from: 'water_main.map.bin', name: 'water_wetland.map.bin' }] }), bare), 'V1.1', 'orphan file water_wetland.map.bin');
  const farm = await checkModels(await folder([{ id: 'water_main', from: 'farmhouse.glb' }], { extra: data }), bare);
  const h1 = has(farm, 'V1.5', 'water_main: 3646 tris > 1500 (water_surface)', 'KB > 200 (water_surface)'), h2 = has(farm, 'V1.4', 'water_main (water_surface): not W (', 'textured materials (baked data: no texture)');
  ok('M15 the water bake: its map and noise beside the GLB are clean; a missing map or noise, an orphan map and a textured 3,646-tri model under a water id are red',
    !dirty.length && miss.pass && stray.pass && h1.pass && h2.pass, `${dirty.length ? 'errors in ' + dirty.join(', ') : 'clean'} || ${miss.detail} || ${stray.detail} || ${h1.detail} || ${h2.detail}`); }
// M16 the Meshy-crop exception is named (owner, 2026-10-25): the eight ready stages in MESHY_CROPS only. The same Meshy model published
{ const dir = await folder([{ id: 'crop_beet_3', from: 'crop_pumpkin_3.glb' }, { id: 'crop_pumpkin_3', from: 'crop_pumpkin_3.glb' }]);
  const r = await checkModels(dir, { ...bare, requiredNodes: {} }), h = has(r, 'V1.5', 'crop_beet_3: 2476 tris > 400'), named = !r.checks['V1.5'].errors.some((e) => e.startsWith('crop_pumpkin_3')) && !r.checks['V1.4'].errors.some((e) => e.startsWith('crop_pumpkin_3'));
  ok('M16 the Meshy-crop exception is named: an unlisted crop id (crop_beet_3) is held to the 400-tri kit budget, the listed crop_pumpkin_3 passes', h.pass && named, h.detail + (named ? '' : ' | crop_pumpkin_3 failed its own contract')); }
// M17 the rigs (animal-rigs R36): goat_rig.glb beside goat.glb with rigs.json naming both is clean (V1.1, V1.5); without rigs.json the
{ const G = [{ id: 'goat', from: 'goat.glb' }], rig = [{ from: 'goat_rig.glb', name: 'goat_rig.glb' }], opt = { ...bare, requiredNodes: {} };
  const withRigs = async (extra, animals) => { const dir = await folder(G, { extra }); fs.writeFileSync(path.join(dir, 'rigs.json'), JSON.stringify({ version: 1, animals })); return dir; };
  const clean = await checkModels(await withRigs(rig, { goat: { file: 'goat_rig.glb', source: 'goat.glb' } }), opt), dirty = ['V1.1', 'V1.5'].filter((k) => clean.checks[k].errors.length);
  const orphan = has(await checkModels(await folder(G, { extra: rig }), opt), 'V1.1', 'orphan file goat_rig.glb');
  const miss = has(await checkModels(await withRigs([], { goat: { file: 'goat_rig.glb', source: 'goat.glb' } }), opt), 'V1.1', 'rigs.json goat: rig goat_rig.glb missing');
  const big = has(await checkModels(await withRigs([...rig, { from: 'bench.glb', name: 'bench.glb' }], { goat: { file: 'goat_rig.glb', source: 'bench.glb' } }), opt), 'V1.5', 'rig goat: goat_rig.glb', 'tris > its source bench.glb');
  const rs = clean.rigStats || {}, heavy = has(evaluate(clean.manifest, clean.stats, { ...opt, rigs: clean.rigs, rigStats: { ...rs, 'goat_rig.glb': { ...rs['goat_rig.glb'], kb: 401 } } }), 'V1.5', 'goat_rig.glb 401 KB > 400');
  const capped = has(evaluate(clean.manifest, clean.stats, { ...opt, rigs: clean.rigs, rigStats: { ...rs, 'goat_rig.glb': { ...rs['goat_rig.glb'], tris: 1501 }, 'goat.glb': { ...rs['goat.glb'], tris: 1480 } } }), 'V1.5', 'goat_rig.glb 1501 tris > the animal cap 1500');
  const stale = has(evaluate(clean.manifest, clean.stats, { ...opt, rigs: clean.rigs, rigStats: rs, exceptions: { goat: { tris: 1600, note: 'test' } }, triCeiling: ['goat'] }), 'V1.5', 'stale exception goat.tris = 1600: rig goat');
  ok('M17 the rigs: a rig and its source named in rigs.json are clean; without rigs.json the rig is an orphan; a named rig that is not there, a rig over its source\'s tris + 40, a rig over 400 KB, a rig over the animal cap with no exception (goat_rig.glb at 1501) and a stale rig exception are red',
    !dirty.length && orphan.pass && miss.pass && big.pass && heavy.pass && capped.pass && stale.pass,
    `${dirty.length ? 'errors in ' + dirty.map((k) => clean.checks[k].errors.join(' | ')).join(' || ') : 'clean'} || ${orphan.detail} || ${miss.detail} || ${big.detail} || ${heavy.detail} || ${capped.detail} || ${stale.detail}`); }
for (const d of tmps) fs.rmSync(d, { recursive: true, force: true });
console.log(`\n  ${'-'.repeat(60)}\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
