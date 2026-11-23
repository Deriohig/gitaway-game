// composition-check.mjs -- proves config/composition.pieces.json is what the V21 proof draws, and renders game-style sheets.
// Needs a static server whose root holds proof/ (a proof built by build.mjs, e.g. PROOF_DIR=<scratch>/proof) and art/ + public/
// (this checkout), e.g. symlinks in a scratch dir served by `python3 -m http.server`. Playwright: lib/playwright.mjs (PLAYWRIGHT_ROOT, ../../,
// the main checkout). Headless Chromium on SwiftShader.
//   node composition-check.mjs --port N --out DIR --extract   read every instance matrix / colour the live proof draws (trees,
//        shrubs, bushes, rocks, flower drifts, grass), plus its composeBlueprint output -> DIR/proof-extract.json and the test
//        fixture tests/fixtures/composition.proof.json (counts, game-placed counts, per-asset counts, placement moments)
//   node composition-check.mjs --port N --out DIR --agree     item-by-item: the JSON (kept + withheld) vs the extracted matrices
//        (position, yaw, scale, y offset, tint / colour), and the node composeBlueprint == the browser's -> DIR/agree.json
//   node composition-check.mjs --port N --out DIR --sheets    proof | composition-check.html side by side at the gameplay cameras,
//        the game's provisional camera (phone + desktop, main + meadow + grove + islet docked), 3 orbits and close-ups
//        -> DIR/sheets/*.png  (--only a,b picks shots; --check-query q is appended to the check page URL)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requirePlaywright } from './lib/playwright.mjs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import GT from './lib/terrain.mjs';
import { KIT_CATEGORY } from './lib/composition.mjs';
import { SHRUBS } from './lib/plantkit.mjs';
import { SPECIES, AUTUMN } from './lib/species.mjs';
import L from '../config/look.config.mjs';
import W3 from '../config/world.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(__dirname, '..'), A = W3.archipelago;
const FIXTURE = path.join(__dirname, 'tests', 'fixtures', 'composition.proof.json'), COMP_FILE = path.join(ART, 'config', 'composition.pieces.json');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; }, has = (k) => process.argv.includes(k);
const PORT = +arg('--port', 0), OUT = path.resolve(arg('--out', '.')), BASE = `http://127.0.0.1:${PORT}`;
const PROOF_URL = `${BASE}/proof/index.html?unlocked=all&ui=0`, CHECK_URL = `${BASE}/art/scripts/composition-check.html`;
// proof InstancedMesh kind -> [category, asset]: tree:<asset> = a painterly tree, shrub:<asset> = a card shrub or a bush (arch-scene
// populate() names each set by its model), the rocks, cover:<kit model> = the living-ground cover
const KIND = (k) => { const [h, a] = k.split(':');
  return h === 'tree' ? ['trees', a] : h === 'shrub' ? ['shrubs', a] : h === 'cover' ? [KIT_CATEGORY[a], a] : k === 'rock_a' || k === 'rock_b' ? ['rocks', k] : k === 'boulder_c' ? ['rocks', 'rock_c']
    : k === 'flowerPatches' ? ['flowers', 'flower_head'] : k === 'grass' ? ['grass', 'grass_tuft'] : null; };
// the models a tree: / shrub: set may name (lib/species.mjs SPECIES + AUTUMN, lib/plantkit.mjs SHRUBS); anything else (a plants.mjs
// variant, drawn only where a painterly GLB failed to load) is reported as a problem
const TREE_IDS = new Set([...SPECIES.filter((s) => s.kind !== 'bush').map((s) => s.id), ...AUTUMN.map((a) => a.id)]);
const SHRUB_IDS = new Set([...SPECIES.filter((s) => s.kind === 'bush').map((s) => s.id), ...Object.keys(SHRUBS)]);
const CATS = ['trees', 'shrubs', 'rocks', 'flowers', 'grass'];

function playwright() { return requirePlaywright(); }   // lib/playwright.mjs: PLAYWRIGHT_ROOT, the repo root, the main checkout
async function openPage(browser, url, vp = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 }), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  try { await page.waitForFunction(() => window.__ready === true, null, { timeout: 900000, polling: 500 }); } catch (e) { throw new Error(`${url} never ready: ${errors.join(' | ')}`); }
  return { page, errors };
}

// ---- in the proof page: every drawn instance, decomposed back into the piece-local item transform ----
async function extractInPage() {
  const THREE = await import('three'), { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const PG = window.__pieceGroups, BP = window.__blueprint, COMP = window.__composition, rels = {};
  const M = new THREE.Matrix4(), Ri = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color(), out = { pieces: {}, layout: {}, problems: [] };
  // the GLB parts' node matrices (instanced() multiplies them in), from the model the set is named by: <asset>.wasm for tree:<asset> /
  // shrub:<asset> (a painterly tree: bark on the root, the Canopy parts offset), the rocks' own files
  const relsOf = async (kind) => {
    if (kind in rels) return rels[kind]; rels[kind] = null;
    const f = /^(tree|shrub):/.test(kind) ? kind.split(':')[1] : ['rock_a', 'rock_b', 'boulder_c'].includes(kind) ? kind : null; if (!f) return null;
    try { const g = await new GLTFLoader().loadAsync(f + '.wasm'); g.scene.updateMatrixWorld(true); const inv = g.scene.matrixWorld.clone().invert(), list = [];
      g.scene.traverse((o) => { if (o.isMesh) list.push({ n: o.geometry.attributes.position.count, rel: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) }); }); rels[kind] = list; }
    catch (e) { out.problems.push(`${kind}: no model ${f}.wasm (${e.message})`); }
    return rels[kind];
  };
  for (const id of BP.order) {
    const pc = BP.pieces[id], part = {}, first = {}, ims = []; out.pieces[id] = ims;
    for (const o of PG[id].group.children) {
      if (!o.isInstancedMesh || o.visible === false) continue;
      const nm = o.name || '', head = nm.split(':')[0];
      const kind = head === 'tree' || head === 'shrub' || head === 'cover' ? head + ':' + nm.split(':')[1] : ['rock_a', 'rock_b', 'boulder_c', 'flowerPatches'].includes(head) ? head
        : (window.__patchKeys(o.material) || []).includes('grassSway') ? 'grass' : null;
      if (!kind) continue;
      const k = part[kind] = (part[kind] == null ? 0 : part[kind] + 1), RL = await relsOf(kind), R = RL ? RL[k] : null;
      if (RL && (!R || R.n !== o.geometry.attributes.position.count)) out.problems.push(`${id} ${kind} part ${k}: no matching GLB part`);
      Ri.copy(R ? R.rel : new THREE.Matrix4()).invert();
      const list = [];
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, M); M.multiply(Ri); M.decompose(p, q, s);
        const e = [p.x, p.z, p.y - pc.height(p.x, p.z), 2 * Math.atan2(q.y, q.w), s.x, s.y, s.z, Math.hypot(q.x, q.z)];
        if (o.instanceColor) { o.getColorAt(i, c); e.push(c.r, c.g, c.b); }
        list.push(e);
      }
      // every part of a model carries the same instances: its first instance (node matrix removed) == part 0's, same count
      if (k === 0) first[kind] = { list, count: o.count };
      else { const F = first[kind], a = F && F.list[0], b = list[0];
        const d = (j) => (j === 3 ? Math.abs(Math.atan2(Math.sin(a[j] - b[j]), Math.cos(a[j] - b[j]))) : Math.abs(a[j] - b[j]));   // (yaw: wrapped)
        if (!F || F.count !== o.count || (a && b && [0, 1, 2, 3, 4, 5, 6].some((j) => d(j) > 1e-4))) out.problems.push(`${id} ${kind} part ${k}: not on part 0's instances`);
        // a painterly tree's tint lives on its Canopy part(s), not the bark (part 0): carry it to the instance's entry (--agree compares it)
        else if (o.instanceColor) F.list.forEach((e0, i) => { if (e0.length === 8) e0.push(...list[i].slice(8)); }); }
      ims.push({ kind, part: k, name: nm, count: o.count, list: k === 0 ? list : null, firstOfPart: list[0] || null });
    }
    const O = COMP.pieces[id], pv = pc.pivot, lp = (l) => l.filter((t) => t.layout).map((t) => [t.x - pv[0], t.z - pv[2]]);
    out.layout[id] = { trees: lp(O.trees), shrubs: lp(O.bushes), rocks: lp(O.rocks) };
    // path ribbons (plain meshes with the pathTone patch): the centre vertex of each 7-vertex cross-section = the centreline point
    out.paths = out.paths || {}; out.paths[id] = [];
    for (const o of PG[id].group.children) { if (!o.isMesh || o.isInstancedMesh || !(window.__patchKeys(o.material) || []).includes('pathTone')) continue;
      const pa = o.geometry.attributes.position, pts = []; for (let i = 3; i < pa.count; i += 7) pts.push([pa.getX(i), pa.getZ(i)]); out.paths[id].push(pts); }
  }
  out.hero = window.__meshy && window.__meshy.hero ? [window.__meshy.hero.x, window.__meshy.hero.z] : null;
  out.compJson = JSON.stringify(BP.order.map((id) => { const O = COMP.pieces[id]; return [id, O.trees, O.shrubs, O.bushes, O.rocks, O.flowerPatches, O.grass, O.paths]; }));
  out.three = THREE.REVISION; out.seed = window.__placements && window.__placements.seed; out.look = (document.title || '');
  return out;
}

const r4 = (v) => Math.round(v * 10000) / 10000;
function summarise(X) {   // the extraction -> per piece / category: drawn, game-placed, per-asset counts, moments (of the non-game-placed)
  const pieces = {}, rows = {};
  for (const [id, ims] of Object.entries(X.pieces)) {
    pieces[id] = Object.fromEntries(CATS.map((c) => [c, { drawn: 0, gamePlaced: 0, count: 0, byAsset: {}, moments: { sx: 0, sz: 0, ss: 0, sc: 0, sn: 0 } }])); rows[id] = [];
    for (const im of ims) { if (im.part !== 0) continue; const [cat, asset] = KIND(im.kind), F = pieces[id][cat], lay = X.layout[id][cat] || [];
      // (the pebbles, cover:pebbles in MAIN's rocks, are ground cover: the fixture counts the proof's volumes only, as composition.test C5
      //  does; plan Task 10 found the Task 8 / 9 fixture had never been re-extracted with them drawn. --agree still matches them, by rows)
      const vol = !(cat === 'rocks' && KIT_CATEGORY[asset]);
      for (const e of im.list) { if (vol) F.drawn++;
        if (lay.some(([x, z]) => Math.abs(x - e[0]) < 1e-3 && Math.abs(z - e[1]) < 1e-3)) { if (vol) F.gamePlaced++; continue; }
        if (vol) { F.count++; F.byAsset[asset] = (F.byAsset[asset] || 0) + 1; F.moments.sx += e[0]; F.moments.sz += e[1]; F.moments.ss += e[4]; F.moments.sc += Math.cos(e[3]); F.moments.sn += Math.sin(e[3]); }
        rows[id].push({ cat, asset, e }); } }
    for (const c of CATS) for (const k of Object.keys(pieces[id][c].moments)) pieces[id][c].moments[k] = r4(pieces[id][c].moments[k]);
    const runs = (X.paths && X.paths[id]) || [], r3 = (v) => Math.round(v * 1000) / 1000;   // per ribbon: [points, first x, z, last x, z]
    pieces[id].paths = { drawn: runs.length, points: runs.reduce((s, r) => s + r.length, 0), runs: runs.map((r) => [r.length, ...r[0], ...r[r.length - 1]].map(r3)) };
  }
  return { pieces, rows };
}

async function extract() {
  const { chromium } = playwright(), browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    const t0 = Date.now(), { page, errors } = await openPage(browser, PROOF_URL), X = await page.evaluate(extractInPage);
    X.errors = errors; X.at = new Date().toISOString(); X.url = PROOF_URL;
    for (const [id, ims] of Object.entries(X.pieces)) for (const im of ims) { const [cat, a] = KIND(im.kind);   // only the painterly set's models
      if (im.part === 0 && ((cat === 'trees' && !TREE_IDS.has(a)) || (cat === 'shrubs' && !SHRUB_IDS.has(a)))) X.problems.push(`${id} ${im.kind}: not a painterly ${cat === 'trees' ? 'tree' : 'shrub / bush'} model`); }
    fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'proof-extract.json'), JSON.stringify(X));
    const S = summarise(X);
    // the parts of each multi-part model must carry the same instances (checked on the first instance of each part)
    const fx = { about: 'What the V21 proof draws per piece and category (composition-check.mjs --extract, from the live proof\'s instance matrices): drawn, game-placed (layout.ts / MainIsland.tsx items the game places itself), count = drawn - game-placed, per-asset counts and placement moments (sums of x, z, scale, cos / sin yaw, piece-local) of the counted items; paths = its path ribbons (drawn, centreline points, and per ribbon [points, first x, z, last x, z]).',
      extracted: X.at.slice(0, 10), proof: { three: X.three, seed: X.seed, url: '/proof/index.html?unlocked=all (look default = Golden afternoon)' }, pieces: S.pieces };
    fs.writeFileSync(FIXTURE, JSON.stringify(fx, null, 1) + '\n');
    const tot = Object.values(S.pieces).reduce((s, P) => s + CATS.reduce((a, c) => a + P[c].count, 0), 0);
    console.log(`  extracted ${tot} instances (+ ${Object.values(S.pieces).reduce((s, P) => s + CATS.reduce((a, c) => a + P[c].gamePlaced, 0), 0)} game-placed) in ${((Date.now() - t0) / 1000).toFixed(0)} s; problems: ${X.problems.length ? X.problems.join('; ') : 'none'}; page errors: ${errors.length}`);
    console.log(`  -> ${path.relative(ART, FIXTURE)} + ${path.join(OUT, 'proof-extract.json')}`);
  } finally { await browser.close(); }
}

async function agree() {
  const X = JSON.parse(fs.readFileSync(path.join(OUT, 'proof-extract.json'), 'utf8')), C = JSON.parse(fs.readFileSync(COMP_FILE, 'utf8')), S = summarise(X);
  const wrap = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  const err = { pos: 0, yaw: 0, scale: 0, y: 0, tint: 0, color: 0, tilt: 0 }, worst = {}, unmatched = [], perCat = {};
  const bump = (k, v, where) => { if (v > err[k]) { err[k] = v; worst[k] = where; } };
  let n = 0;
  for (const id of Object.keys(C.pieces)) for (const cat of CATS) {
    const items = C.pieces[id][cat].concat((C.withheld.items || []).filter((w) => w.piece === id && w.category === cat).map((w) => w.item));
    const pool = S.rows[id].filter((r) => r.cat === cat).map((r) => ({ ...r, used: false }));
    perCat[cat] = (perCat[cat] || 0) + items.length;
    if (pool.length !== items.length) unmatched.push(`${id}.${cat}: ${items.length} JSON vs ${pool.length} proof`);
    for (const it of items) {
      let best = null, bd = Infinity;
      for (const r of pool) { if (r.used || r.asset !== it.asset) continue; const d = Math.hypot(r.e[0] - it.x, r.e[1] - it.z); if (d < bd) { bd = d; best = r; } }
      if (!best || bd > 0.01) { unmatched.push(`${id}.${cat} ${it.asset}@${it.x},${it.z}`); continue; }
      best.used = true; n++; const e = best.e, where = `${id} ${it.asset}@${it.x},${it.z}`, yOff = C.assets[it.asset].yOffset;
      bump('pos', bd, where); bump('yaw', wrap(e[3] - it.rotY), where); bump('scale', Math.abs(e[4] - it.scale), where);
      bump('scale', Math.abs(e[5] - (it.scaleY != null ? it.scaleY : it.scale * (it.asset === 'flower_head' ? 0.8 : 1))), where); bump('y', Math.abs(e[2] - yOff), where); bump('tilt', e[7], where);
      if (it.tint) bump('tint', Math.max(...it.tint.map((v, k) => Math.abs(v - e[8 + k]))), where);
      else if (e.length > 8 && cat !== 'flowers') bump('tint', Math.max(...[0, 1, 2].map((k) => Math.abs(1 - e[8 + k]))), where);
      if (it.color) { const cc = new THREE.Color(it.color); bump('color', Math.max(Math.abs(cc.r - e[8]), Math.abs(cc.g - e[9]), Math.abs(cc.b - e[10])), where); }
    }
  }
  // paths: every JSON centreline == one proof ribbon's centre vertices, point for point
  let pathPts = 0, pathErr = 0; const pathMiss = [];
  for (const id of Object.keys(C.pieces)) { const runs = (X.paths && X.paths[id]) || [], used = new Set();
    for (const P of C.pieces[id].paths || []) {
      const j = runs.findIndex((r, k) => !used.has(k) && r.length === P.pts.length && Math.hypot(r[0][0] - P.pts[0][0], r[0][1] - P.pts[0][1]) < 2e-3);
      if (j < 0) { pathMiss.push(`${id}/${P.id}`); continue; } used.add(j);
      P.pts.forEach(([x, z], i) => { pathErr = Math.max(pathErr, Math.hypot(runs[j][i][0] - x, runs[j][i][1] - z)); pathPts++; }); } }
  if (pathMiss.length || pathErr > 1e-3) unmatched.push(`paths: ${pathMiss.length} unmatched (${pathMiss.join(', ')}), max point error ${pathErr.toExponential(1)}`);
  console.log(`  paths: ${pathPts} centreline points matched to the proof's ribbons, max error ${pathErr.toExponential(1)} u; unmatched ${pathMiss.length}`);
  // the browser's composeBlueprint == node's (same code, two engines): same lists, same keys, same strings, numbers equal to
  // within 1e-9 (Chrome's and node's V8 may differ in the last bit of a transcendental: that never flips a placement here)
  const bp = GT.buildBlueprint(A, L, { seed: A.seeds.default >>> 0 }), comp = GT.composeBlueprint(bp, L);
  const nodeJson = JSON.stringify(bp.order.map((id) => { const O = comp.pieces[id]; return [id, O.trees, O.shrubs, O.bushes, O.rocks, O.flowerPatches, O.grass, O.paths]; }));
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16), same = nodeJson === X.compJson;
  const D = { structural: [], lastBit: 0, maxNum: 0 };
  const cmp = (a, b, p) => { if (typeof a === 'number' && typeof b === 'number') { if (a !== b) { D.lastBit++; D.maxNum = Math.max(D.maxNum, Math.abs(a - b)); } return; }
    if (typeof a !== typeof b || (a && typeof a === 'object') !== (b && typeof b === 'object')) { D.structural.push(p); return; }
    if (a && typeof a === 'object') { const ka = Object.keys(a), kb = Object.keys(b); if (ka.join() !== kb.join()) { D.structural.push(p + ' keys'); return; } for (const k of ka) cmp(a[k], b[k], p + '/' + k); }
    else if (a !== b) D.structural.push(p); };
  cmp(JSON.parse(nodeJson), JSON.parse(X.compJson), '');
  const compOk = !D.structural.length && D.maxNum < 1e-9;
  const TOL = { pos: 1e-3, yaw: 1e-3, scale: 1e-3, y: 1e-4, tint: 2e-3, color: 1e-4, tilt: 1e-5 }, pass = compOk && !unmatched.length && Object.keys(TOL).every((k) => err[k] <= TOL[k]);
  const report = { pass, matched: n, perCategory: perCat, unmatched, maxError: err, tolerance: TOL, worst,
    composeBlueprint: { browser: sha(X.compJson), node: sha(nodeJson), byteIdentical: same, structuralDiffs: D.structural.slice(0, 20), numbersDiffering: D.lastBit, maxNumericDiff: D.maxNum, agree: compOk }, proof: { three: X.three, extracted: X.at, problems: X.problems } };
  fs.writeFileSync(path.join(OUT, 'agree.json'), JSON.stringify(report, null, 1) + '\n');
  console.log(`  ${pass ? 'AGREE' : 'DISAGREE'}: ${n} JSON items matched to proof instances (${Object.entries(perCat).map(([k, v]) => k + ' ' + v).join(', ')}); unmatched ${unmatched.length}${unmatched.length ? ' e.g. ' + unmatched.slice(0, 3).join('; ') : ''}`);
  console.log('  max |error|: ' + Object.entries(err).map(([k, v]) => `${k} ${v.toExponential(1)} (tol ${TOL[k]})`).join(', '));
  console.log(`  composeBlueprint browser vs node: ${same ? 'byte-identical' : `${D.structural.length} structural diffs, ${D.lastBit} numbers differ by <= ${D.maxNum.toExponential(1)}`} -> ${compOk ? 'agree' : 'DISAGREE'}`);
  if (!pass) process.exitCode = 1;
}

async function sheets() {
  // the game's FINAL default camera (target (0, -0.6, 0), azimuth 0.7854, polar 1.0668 rad = elevation 28.88 deg, fov 30; phone 412 x 915
  // at distance 130 (rendered at 2x for legibility, same framing), desktop 1440 x 900 at 35.5) with the pieces the game docks today
  const GAME_CAM = { mode: 'gameplay', az: 0.7854 / Math.PI * 180, el: 90 - 1.0668 / Math.PI * 180, tgt: [0, -0.6, 0], unlocked: 'main,meadow,grove,islet' };
  const SHOTS = [['default_mobile', A.cameras.default_mobile], ['game_phone_main_meadow_grove_islet', { ...GAME_CAM, dist: 130, w: 824, h: 1830 }],
    ['game_desktop_main_meadow_grove_islet', { ...GAME_CAM, dist: 35.5, w: 1440, h: 900 }], ['game_desktop_main_only', { ...GAME_CAM, dist: 35.5, w: 1440, h: 900, unlocked: 'main' }],
    ['default_desktop', A.cameras.default_desktop], ['orbit_front', A.orbits.orbit_front], ['orbit_side', A.orbits.orbit_side],
    ['orbit_back', A.orbits.orbit_back], ['farm_closeup', A.views.farm], ['meadow_closeup', A.cameras.meadow], ['woodland_closeup', A.views.woodland]].filter(([n]) => !arg('--only') || arg('--only').split(',').includes(n));
  const { chromium } = playwright(), browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const dir = path.join(OUT, 'sheets'); fs.mkdirSync(dir, { recursive: true });
  try {
    const P = await openPage(browser, PROOF_URL, { width: 1600, height: 900 }), K = await openPage(browser, CHECK_URL + (arg('--check-query') ? '?' + arg('--check-query') : ''), { width: 1600, height: 900 });
    const info = await K.page.evaluate(() => window.__check);
    console.log(`  check page: ${info.items} items, three r${info.three}, light ${JSON.stringify(info.light)}; proof errors ${P.errors.length}, check errors ${K.errors.length}${K.errors.length ? ': ' + K.errors.slice(0, 3).join(' | ') : ''}`);
    const comp = await browser.newPage({ viewport: { width: 800, height: 600 } }); await comp.setContent('<html><body></body></html>');
    for (const [name, cam] of SHOTS) {
      const a = await P.page.evaluate(async ([n, c]) => (await window.__saveShot('comp_' + n, { ...c, unlocked: c.unlocked || 'all', returnUrl: true })).url, [name, cam]);
      const b = await K.page.evaluate((c) => window.__shot(c), cam);
      const sheet = await comp.evaluate(async ([a, b, title]) => {
        const img = (u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = u; }), [A, B] = await Promise.all([img(a), img(b)]);
        const k = Math.min(1, 1200 / A.width), w = Math.round(A.width * k), h = Math.round(A.height * k), bar = 34, cv = document.createElement('canvas'); cv.width = 2 * w + 8; cv.height = h + bar;
        const g = cv.getContext('2d'); g.fillStyle = '#20242a'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(A, 0, bar, w, h); g.drawImage(B, w + 8, bar, w, h);
        g.fillStyle = '#fff'; g.font = '18px sans-serif'; g.fillText(`proof V21 (${title.replace(/^game_(phone|desktop)_main_meadow_grove_islet$/, 'game camera, $1, main+meadow+grove+islet').replace(/^game_desktop_main_only$/, 'game camera, desktop, MAIN only')})`, 10, 23); g.fillText('game-style check: composition.pieces.json + plant GLBs, standard materials, game lights', w + 18, 23);
        return cv.toDataURL('image/png');
      }, [a, b, name]);
      const f = path.join(dir, name + '.png'); fs.writeFileSync(f, Buffer.from(sheet.split(',')[1], 'base64')); console.log('  sheet ' + f);
    }
  } finally { await browser.close(); }
}

if (!PORT) { console.error('usage: node composition-check.mjs --port N --out DIR (--extract | --agree | --sheets)'); process.exit(2); }
if (has('--extract')) await extract();
if (has('--agree')) await agree();
if (has('--sheets')) await sheets();
