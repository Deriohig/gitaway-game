// composition.test.mjs -- the per-piece composition export for the game (config/composition.pieces.json + the plant GLBs in public/models).
// Pure node; reads the committed files and re-runs the export in memory. COMPOSITION_FILE=<file> reads another composition JSON (red runs).
//   C1-C3 pieces, assets, outline   C4 clearance (slots, zones, water; withheld items really hit one)   C5 counts vs the proof fixture
//   C6 determinism   C7-C8 GLB structure and triangle caps   C9 manifest merge   C10-C11 path centrelines, ribbons, reroutes
//   C12-C15 ground-cover kit, species, tints, far versions   C16 seams   C17-C21 keep-clear discs (woodshed, jetty, bush, camp, hero tree)   C22 reeds
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import GT from '../lib/terrain.mjs';
import { KIT, SHRUBS } from '../lib/plantkit.mjs';
import { KIT_CATEGORY } from '../lib/composition.mjs';
import { SPECIES, AUTUMN } from '../lib/species.mjs';
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(__dirname, '../..'), ROOT = path.resolve(ART, '..'), MODELS = path.join(ROOT, 'public', 'models');
const COMP_FILE = process.env.COMPOSITION_FILE ? path.resolve(process.env.COMPOSITION_FILE) : path.join(ART, 'config', 'composition.pieces.json');
const CATS = ['trees', 'shrubs', 'rocks', 'flowers', 'grass'];
const MODELS_PR_IDS = ['farmhouse', 'windmill', 'well', 'bench', 'haystack', 'cart', 'hero_tree', 'rock_a', 'rock_b', 'rock_c', 'outcrop_a', 'outcrop_b', 'sheep', 'plot'];   // files + manifest entries come from the models PR
const specOf = (id) => SPECIES.find((s) => s.id === id) || SPECIES.find((s) => s.id === (AUTUMN.find((a) => a.id === id) || {}).from);
const TREE_IDS = [...SPECIES.filter((s) => s.kind !== 'bush').map((s) => s.id), ...AUTUMN.map((a) => a.id)];
const CONIFER_IDS = TREE_IDS.filter((id) => specOf(id).kind === 'conifer');
const BUSH_IDS = SPECIES.filter((s) => s.kind === 'bush').map((s) => s.id);
const SHRUB_IDS = Object.keys(SHRUBS);
const PAINTED_IDS = [...TREE_IDS, ...BUSH_IDS, ...SHRUB_IDS];   // textured
const OWN_IDS = [...PAINTED_IDS, 'flower_head', 'grass_tuft'];   // this export's plant models (the last two are flat, unplaced)
const KIT_IDS = Object.keys(KIT);   // the painterly ground-cover kit (textured)
const GAME_PLACED = ['tree_fruit'];   // shipped, not placed (the game's fruit-tree slots)
const CAP = { tree_pine_a: 1200, tree_pine_b: 1200, tree_round_a: 3500, tree_round_b: 3500, tree_spread: 3500, tree_fruit: 3500, tree_birch: 3000, tree_sapling: 1500, bush_a: 600, bush_flowering: 600, bush_berry: 600 };
for (const a of AUTUMN) CAP[a.id] = CAP[a.from];   // autumn recolours share their `from`'s geometry
for (const id of SHRUB_IDS) CAP[id] = 120;
const TINT = [0.92, 1.08], TINT_VARIETY = 10;
const A = W3.archipelago, KC = (A.blueprint || {}).keepClear || [], PAD = 0.15;
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail: Array.isArray(detail) ? detail.slice(0, 6).join('; ') : detail });
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));
const keys = (o) => JSON.stringify(Object.keys(o).sort());
const segClosest = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return [Math.hypot(x - ax - dx * t, z - az - dz * t), t]; };
const segD = (...a) => segClosest(...a)[0];
const loopDist = (loop, x, z) => { let m = Infinity; for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) m = Math.min(m, segD(x, z, loop[j][0], loop[j][1], loop[i][0], loop[i][1])); return m; };
const isTint = (t) => Array.isArray(t) && t.length === 3 && t.every(Number.isFinite);
const dist2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const show = (l) => l.slice(0, 4).map((it) => `${it.cat}/${it.asset}@${f3(it.x)},${f3(it.z)}`).join(' ');
const triCount = (root) => root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const isKitMat = (root) => { const m = root.listMaterials()[0], t = m && m.getBaseColorTexture(); return root.listMaterials().length === 1 && m.getAlphaMode() === 'MASK' && t && t.getMimeType() === 'image/png'; };   // one MASK material with a PNG map

const J = readJson(path.join(ART, 'config', 'blueprint.pieces.json')), C = readJson(COMP_FILE), FX = readJson(path.join(__dirname, 'fixtures', 'composition.proof.json')), MF = readJson(path.join(MODELS, 'manifest.json')) || { assets: {} };
const order = J ? J.order : [];
const RIBBONS = (C && C.paths && C.paths.ribbons) || {}, RIBBON_IDS = Object.values(RIBBONS).map((r) => r.file.replace(/\.glb$/, ''));
const items = (id) => (C && C.pieces && C.pieces[id] ? CATS.flatMap((c) => (C.pieces[id][c] || []).map((it) => ({ ...it, cat: c }))) : []);
const allItems = () => order.flatMap((id) => items(id).map((it) => ({ ...it, piece: id })));
const withheld = () => (C && C.withheld && C.withheld.items) || [];
const near = (id, [x, z], r) => items(id).filter((it) => Math.hypot(it.x - x, it.z - z) < r);   // composed items within r of a spot (piece-local)
const discOff = (d, at) => (d ? dist2(d.at, at) : Infinity);
const io = new NodeIO();

// C1 every piece present with all five category lists
{ const miss = [];
  for (const id of order) { const P = C && C.pieces && C.pieces[id]; if (!P) { miss.push(id); continue; } for (const c of CATS) if (!Array.isArray(P[c])) miss.push(id + '.' + c); }
  ok('C1 every piece present with trees / shrubs / rocks / flowers / grass lists', C && order.length === 8 && !miss.length, C ? 'missing: ' + miss.join(', ') : 'no composition file'); }

// C2 every asset has a ready manifest entry + file (ours or a models-PR id), an assets{} entry, finite numbers
{ const bad = new Set(), used = new Set(); let badNum = 0;
  for (const it of allItems()) {
    used.add(it.asset);
    if (![it.x, it.z, it.rotY, it.scale].every(Number.isFinite) || !(it.scale > 0)) badNum++;
    const e = MF.assets[it.asset];   // models-PR entries: presence, readiness and the file only
    if (!e || e.status !== 'ready' || !e.file || !fs.existsSync(path.join(MODELS, e.file))) bad.add(it.asset);
    if (MODELS_PR_IDS.includes(it.asset) === (OWN_IDS.includes(it.asset) || KIT_IDS.includes(it.asset))) bad.add(it.asset + ' (neither ours nor models-PR)');
  }
  const wrong = C && C.assets ? [...used].filter((a) => !C.assets[a] || (MODELS_PR_IDS.includes(a) ? !/models PR/.test(C.assets[a].provider) : C.assets[a].provider !== 'export-composition')) : [...used];
  ok('C2 every asset id has a ready manifest entry + file and an assets{} entry; numbers finite', C && used.size && !bad.size && !wrong.length && !badNum, `missing/unready: ${[...bad]}; assets{} wrong: ${wrong}; bad numbers: ${badNum}`); }

// C3 every item lies inside its piece outline (piece-local)
{ const out = allItems().filter((it) => !GT.inLoop(J.pieces[it.piece].outline, it.x, it.z));
  ok('C3 every item lies inside its piece outline', C && allItems().length && !out.length, show(out)); }

// C4 clearance: nothing inside a layout slot / piece zone (open-ground core, pasture, wildflowers excepted) or in open water; every withheld item hits one
const bp = GT.buildBlueprint(A, L, { seed: A.seeds.default >>> 0 });
{ const OPEN = (z) => (z.kind || z.what) === 'core' || z.kind === 'animals' || z.id === 'wildflowers', zones = [];
  for (const id of order) { const d = J.pieces[id].dockedPosition; for (const z of J.pieces[id].flatZones) if (!OPEN(z)) zones.push({ ...z, piece: id, dx: d[0], dz: d[2] }); }
  const inZone = (z, wx, wz) => { const x = wx - z.dx, y = wz - z.dz;   // zone frame = its piece's local frame
    if (z.type === 'rect') return x > z.min[0] && x < z.max[0] && y > z.min[1] && y < z.max[1];
    if (z.type === 'capsule') return segD(x, y, z.a[0], z.a[1], z.b[0], z.b[1]) < z.r;
    return Math.hypot(x - z.at[0], y - z.at[1]) < z.r; };
  const W = { main: J.pieces.main.water, wetland: J.pieces.wetland.water, highland: J.pieces.highland.water };
  const lines = [W.main.stream.line || [], W.wetland.river.points, W.wetland.outflow.points], pools = [W.wetland.lake, W.highland.tarn, W.highland.hotSpring];   // the pond is the art-owned teardrop outline
  const inWater = (wx, wz) => {
    if (GT.inLoop(W.main.pond.outline, wx, wz)) return 'pond';
    for (const pts of lines) for (let i = 0; i < pts.length - 1; i++) if (segD(wx, wz, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z) < Math.max(pts[i].width, pts[i + 1].width) / 2) return 'stream/river';
    for (const p of pools) if (GT.inLoop(p.outline, wx, wz) && bp.H(wx, wz) < p.level + 0.06) return 'lake/tarn/spring';   // open water: inside the shore and below level + 0.06
    return null; };
  const hitOf = (piece, x, z) => { const d = J.pieces[piece].dockedPosition, wx = x + d[0], wz = z + d[2], q = zones.find((zz) => inZone(zz, wx, wz)); return q ? (q.what || q.id) : inWater(wx, wz); };
  const hits = allItems().filter((it) => hitOf(it.piece, it.x, it.z)), idle = withheld().filter((w) => !hitOf(w.piece, w.item.x, w.item.z));
  ok('C4 nothing inside a layout slot / piece zone or in water; every withheld item hits one', C && allItems().length && !hits.length && !idle.length, `${hits.length} hits ${show(hits)}; ${idle.length} withheld without cause`); }

// C5 counts per piece / category / asset == the V21 proof minus game-placed items; placement moments match
{ const bad = [];
  if (FX && C) for (const id of order) for (const c of CATS) {
    const kept = C.pieces[id][c], wh = withheld().filter((w) => w.piece === id && w.category === c).map((w) => w.item), fx = FX.pieces[id] && FX.pieces[id][c];
    if (!fx) { bad.push(`${id}.${c}: no fixture`); continue; }
    const vol = (l) => (c === 'rocks' ? l.filter((it) => !KIT_IDS.includes(it.asset)) : l), list = vol(kept).concat(vol(wh));   // the pebbles (in MAIN's rocks) are ground cover: the proof's rocks are boulders only
    if (list.length !== fx.count || fx.count !== fx.drawn - fx.gamePlaced) bad.push(`${id}.${c}: ${kept.length} + ${wh.length} withheld vs proof ${fx.drawn} - ${fx.gamePlaced} game-placed`);
    if (!C.counts || !C.counts[id] || C.counts[id][c] !== kept.length) bad.push(`${id}.${c}: counts block != ${kept.length}`);
    const by = {}; for (const it of list) by[it.asset] = (by[it.asset] || 0) + 1;
    if (JSON.stringify(Object.entries(by).sort()) !== JSON.stringify(Object.entries(fx.byAsset).sort())) bad.push(`${id}.${c}: per-asset ${JSON.stringify(by)} vs proof ${JSON.stringify(fx.byAsset)}`);
    const m = { sx: 0, sz: 0, ss: 0, sc: 0, sn: 0 }; for (const it of list) { m.sx += it.x; m.sz += it.z; m.ss += it.scale; m.sc += Math.cos(it.rotY); m.sn += Math.sin(it.rotY); }
    for (const k of Object.keys(m)) if (!(Math.abs(m[k] - fx.moments[k]) <= 1e-3 * Math.max(1, list.length))) bad.push(`${id}.${c}: moment ${k} ${f3(m[k])} vs proof ${f3(fx.moments[k])}`);
  }
  ok('C5 counts per piece / category / asset == the V21 proof minus game-placed items; placement moments match', FX && C && !bad.length, !FX ? 'no fixture' : !C ? 'no composition file' : bad); }

// C6 deterministic: a fresh in-memory export == the committed JSON, GLBs and manifest entries
let EX = null, exErr = null, fresh = null;
try { EX = await import(pathToFileURL(path.join(__dirname, '..', 'export-composition.mjs')).href); } catch (e) { exErr = e.message; }
if (EX && EX.buildExport) { try { fresh = await EX.buildExport(); } catch (e) { exErr = e.message; } }
{ const diffs = [];
  if (fresh) {
    if (!fs.existsSync(COMP_FILE) || fs.readFileSync(COMP_FILE, 'utf8') !== fresh.json) diffs.push('composition.pieces.json');
    for (const [id, a] of Object.entries(fresh.assets)) { const f = path.join(MODELS, a.file); if (!fs.existsSync(f) || !Buffer.from(a.bytes).equals(fs.readFileSync(f))) diffs.push(a.file);
      if (JSON.stringify(MF.assets[id]) !== JSON.stringify(a.entry)) diffs.push('manifest:' + id); }
    const again = await EX.buildExport();
    if (again.json !== fresh.json || Object.keys(again.assets).some((id) => !Buffer.from(again.assets[id].bytes).equals(Buffer.from(fresh.assets[id].bytes)))) diffs.push('two in-memory exports differ');
  }
  ok('C6 deterministic: a fresh export == the committed JSON, GLBs and manifest entries', fresh && !diffs.length, fresh ? 'differs: ' + diffs.join(', ') : 'no export: ' + (exErr || 'buildExport missing')); }

// C7 painterly GLB structure (trees: <id> (bark JPEG, OPAQUE) > [Crown >] Canopy (leaves PNG, MASK; tree_fruit + apple overlay), bushes: one node of MASK PNG primitives
// (bush_berry + its overlay), card shrubs: the kit rules, all NORMAL + TEXCOORD_0; flat GLBs and path ribbons: 1 material, COLOR_0 + NORMAL, no textures); C8 triangle caps
const own = [...OWN_IDS, ...RIBBON_IDS].filter((id) => MF.assets[id]).map((id) => [id, MF.assets[id]]), rows = [];
{ const bad = [];
  const matOf = (p) => { const m = p.getMaterial(), t = m && m.getBaseColorTexture(); return { name: m ? m.getName() : '', alpha: m ? m.getAlphaMode() : '', mime: t ? t.getMimeType() : '-' }; };
  const isLeafy = (q) => q.alpha === 'MASK' && q.mime === 'image/png', isBark = (q) => q.alpha === 'OPAQUE' && q.mime === 'image/jpeg';
  const desc = (ps) => ps.map((p) => { const q = matOf(p); return `${q.name} ${q.alpha} ${q.mime}`; }).join(' | ') || 'none';
  const nodeNames = (nodes) => nodes.map((n) => n.getName() + (n.getMesh() ? '[mesh]' : '')).join(' ');
  for (const id of [...OWN_IDS, ...RIBBON_IDS]) if (!MF.assets[id]) bad.push(id + ': no manifest entry');
  for (const [id, e] of own) {
    if (keys(e) !== JSON.stringify(['file', 'notes', 'status', 'tris'])) bad.push(`${id}: entry keys ${Object.keys(e)}`);
    const f = path.join(MODELS, e.file); if (!fs.existsSync(f)) { bad.push(id + ': no file'); continue; }
    const root = (await io.read(f)).getRoot(), nodes = root.listNodes(), all = root.listMeshes().flatMap((m) => m.listPrimitives());
    rows.push({ id, tris: Math.round(triCount(root)), mtris: e.tris });
    if (!PAINTED_IDS.includes(id)) {   // flat: grass_tuft, flower_head, the path ribbons
      if (root.listMaterials().length !== 1 || root.listTextures().length) bad.push(`${id}: ${root.listMaterials().length} materials, ${root.listTextures().length} textures`);
      if (all.some((p) => !p.getAttribute('COLOR_0') || !p.getAttribute('NORMAL'))) bad.push(`${id}: a primitive without COLOR_0 / NORMAL`);
      continue;
    }
    if (all.some((p) => !p.getAttribute('NORMAL') || !p.getAttribute('TEXCOORD_0'))) bad.push(`${id}: a primitive without NORMAL / TEXCOORD_0`);
    if (SHRUB_IDS.includes(id)) { if (!isKitMat(root)) bad.push(`${id}: not one MASK material with a PNG map (${desc(all)})`); continue; }
    const top = root.listScenes()[0].listChildren(), main = top[0], overlay = specOf(id).overlay;
    if (top.length !== 1 || !main || main.getName() !== id || !main.getMesh()) { bad.push(`${id}: root nodes [${nodeNames(top)}] (want one '${id}' with a mesh)`); continue; }
    const rootPrims = main.getMesh().listPrimitives();
    if (BUSH_IDS.includes(id)) {   // one node: the leaves (+ bush_berry's berries)
      const want = 1 + (overlay ? 1 : 0);
      if (nodes.length !== 1 || rootPrims.length !== want || !rootPrims.every((p) => isLeafy(matOf(p))) || rootPrims.filter((p) => matOf(p).name === id + '_overlay').length !== (overlay ? 1 : 0)) bad.push(`${id}: ${nodes.length} nodes, root primitives ${desc(rootPrims)} (want one node, ${want} MASK PNG primitive(s))`);
      continue;
    }
    const conifer = CONIFER_IDS.includes(id), kids = main.listChildren(), crown = conifer ? kids[0] : null, canopy = conifer ? crown && crown.listChildren()[0] : kids[0];   // a tree: <id> > [Crown >] Canopy
    const shape = conifer ? kids.length === 1 && crown.getName() === 'Crown' && !crown.getMesh() && crown.listChildren().length === 1 : kids.length === 1;
    if (!shape || !canopy || canopy.getName() !== 'Canopy' || !canopy.getMesh() || canopy.listChildren().length || nodes.length !== (conifer ? 3 : 2)) { bad.push(`${id}: nodes ${nodeNames(nodes)} (want ${id} > ${conifer ? 'Crown > ' : ''}Canopy)`); continue; }
    if (rootPrims.length !== 1 || matOf(rootPrims[0]).name !== id + '_bark' || !isBark(matOf(rootPrims[0]))) bad.push(`${id}: root primitives ${desc(rootPrims)} (want one ${id}_bark OPAQUE image/jpeg)`);
    const cp = canopy.getMesh().listPrimitives(), names = cp.map((p) => matOf(p).name).sort(), wantNames = [id + '_leaves', ...(overlay === 'apple' ? [id + '_overlay'] : [])].sort();
    if (JSON.stringify(names) !== JSON.stringify(wantNames) || !cp.every((p) => isLeafy(matOf(p)))) bad.push(`${id}: Canopy primitives ${desc(cp)} (want ${wantNames.join(' + ')}, MASK image/png)`);
  }
  ok('C7 painterly GLBs: trees, bushes, card shrubs, flat GLBs and ribbons have the expected node / material structure', own.length && !bad.length, own.length ? bad : 'no exported assets in the manifest');
  const tb = rows.filter((r) => r.tris !== r.mtris).map((r) => `${r.id} ${r.tris} vs manifest ${r.mtris}`);
  const over = PAINTED_IDS.map((id) => [id, rows.find((r) => r.id === id)]).filter(([id, r]) => !r || !(CAP[id] > 0) || r.tris > CAP[id]).map(([id, r]) => `${id} ${r ? r.tris : 'no GLB'} > cap ${CAP[id] ?? 'none'}`);
  ok('C8 triangles: manifest tris == GLB; caps: pines 1,200, round / spread / fruit 3,500, birch 3,000, sapling 1,500, autumn as their `from`, bushes 600, card shrubs 120', rows.length && !tb.length && !over.length, tb.concat(over)); }

// C9 the exporter merges only its own manifest entries
{ let pass = false, detail = 'no mergeManifest export';
  if (EX && EX.mergeManifest) { const base = { version: 1, assets: { farmhouse: { file: 'farmhouse.glb', status: 'ready', tris: 2900, notes: 'models PR' }, tree_round_a: { file: 'old.glb', status: 'draft', tris: 1, notes: '' } } };
    const m = EX.mergeManifest(JSON.parse(JSON.stringify(base)), { tree_round_a: { file: 'tree_round_a.glb', status: 'ready', tris: 568, notes: 'x' } });
    pass = JSON.stringify(m.assets.farmhouse) === JSON.stringify(base.assets.farmhouse) && m.assets.tree_round_a.file === 'tree_round_a.glb' && m.version === 1 && Object.keys(m.assets).length === 2; detail = JSON.stringify(m); }
  ok('C9 the exporter merges only its own manifest entries (foreign entries survive untouched)', pass, detail); }

// the baked pieces' top rims (C10, C16): edges used by one top face (piece_<id>.glb faceRanges.top), world x, z; a ribbon vertex within SEAM_TOL
// of its piece's rim is ON the rim (a seam row), where float rounding may leave it a hair off the top
const SEAM_TOL = 1e-4, rims = {};
for (const id of order) { const f = path.join(MODELS, `piece_${id}.glb`); if (!fs.existsSync(f)) continue;
  const mesh = (await io.read(f)).getRoot().listMeshes()[0], prim = mesh.listPrimitives()[0], P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray(), [t0, tn] = mesh.getExtras().faceRanges.top, d = J.pieces[id].dockedPosition;
  const ec = new Map(); for (let t = t0; t < t0 + tn; t++) for (let k = 0; k < 3; k++) { const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3], key = Math.min(a, b) * 1e6 + Math.max(a, b); ec.set(key, (ec.get(key) || 0) + 1); }
  rims[id] = [...ec].filter(([, n]) => n === 1).map(([key]) => { const a = Math.floor(key / 1e6), b = key % 1e6; return [P[a * 3] + d[0], P[a * 3 + 2] + d[2], P[b * 3] + d[0], P[b * 3 + 2] + d[2]]; }); }
const rimDist = (id, x, z) => { let m = Infinity; for (const [ax, az, bx, bz] of rims[id] || []) m = Math.min(m, segD(x, z, ax, az, bx, bz)); return m; };   // (world x, z)

// the BAKED piece top, triangle-exact (piece_<id>.glb); top.rim(x, z): a point on the rim -> the height at the closest point of that edge
function bakedTop(doc) {
  const mesh = doc.getRoot().listMeshes()[0], prim = mesh.listPrimitives()[0], P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray(), [t0, tn] = mesh.getExtras().faceRanges.top;
  const cell = new Map(), K = (x, z) => Math.floor(x) * 4099 + Math.floor(z);
  for (let t = t0; t < t0 + tn; t++) { const v = [0, 1, 2].map((k) => I[t * 3 + k]), xs = v.map((q) => P[q * 3]), zs = v.map((q) => P[q * 3 + 2]);
    for (let x = Math.floor(Math.min(...xs)); x <= Math.floor(Math.max(...xs)); x++) for (let z = Math.floor(Math.min(...zs)); z <= Math.floor(Math.max(...zs)); z++) { const k = x * 4099 + z; (cell.get(k) || cell.set(k, []).get(k)).push(v); } }
  const top = (x, z) => { let y = null;
    for (const [a, b, c] of cell.get(K(x, z)) || []) { const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2], det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-12) continue; const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, w = 1 - u - v;
      if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue; const h = u * P[a * 3 + 1] + v * P[b * 3 + 1] + w * P[c * 3 + 1]; if (y === null || h > y) y = h; }
    return y; };
  top.rim = (x, z) => { let y = null, bd = SEAM_TOL;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const v of cell.get(K(x + i, z + j)) || []) for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3], [d, t] = segClosest(x, z, P[a * 3], P[a * 3 + 2], P[b * 3], P[b * 3 + 2]);
      if (d <= bd) { bd = d; y = P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * t; } }
    return y; };
  return top;
}
const bakedTopOf = async (id) => bakedTop(await io.read(path.join(MODELS, `piece_${id}.glb`)));
const seqOf = {};   // the pieces each path runs through, in order (its control polyline through pieceAt)
for (const P of A.blueprint.paths) { const seq = []; for (const [x, z] of GT.resamplePolyline(GT.catmullRomCentripetal(P.pts, 5), 0.25)) { const pc = GT.pieceAt(bp, x, z); if (pc && seq[seq.length - 1] !== pc) seq.push(pc); } seqOf[P.id] = seq; }

// C10 paths: piece-local centrelines inside the outline = the proof's ribbons; ribbon GLBs: one BLEND material, COLOR_0 rgba, every vertex inside the outline (or on the baked
// rim) at the baked top + lift (higher only over a crest), clear in the interior; one named node per run (path_<id>) whose extras leadsTo / needs equal the JSON's and the pieces it runs through
{ const bad = []; let nPaths = 0;
  const lift = C && C.paths && Object.values(RIBBONS)[0] ? Object.values(RIBBONS)[0].lift : NaN;
  if (!C || !C.paths) bad.push('no paths block in the composition file');
  else for (const id of order) {
    const paths = C.pieces[id].paths, out = J.pieces[id].outline;
    if (!Array.isArray(paths)) { bad.push(id + ': no paths list'); continue; }
    for (const P of paths) { nPaths++;
      if (!(P.width > 0) || P.pts.length < 2 || !P.id) bad.push(`${id}/${P.id}: width / points`);
      const off = P.pts.filter(([x, z]) => !GT.inLoop(out, x, z) && loopDist(out, x, z) > 0.02).length; if (off) bad.push(`${id}/${P.id}: ${off} centreline points off the piece`); }
    // every exported path = one proof ribbon (same point count, same ends); MAIN's layout dirt paths are the only ribbons not exported
    const fx = FX && FX.pieces[id] && FX.pieces[id].paths, dirt = (C.excluded || []).filter((e) => e.piece === id && /DIRT_PATHS/.test(e.what)).reduce((s, e) => s + e.count, 0);
    if (!fx) bad.push(id + ': no proof paths in the fixture');
    else { if (fx.drawn !== paths.length + dirt) bad.push(`${id}: ${paths.length} paths + ${dirt} game-drawn vs ${fx.drawn} proof ribbons`);
      for (const P of paths) { const a = P.pts[0], b = P.pts[P.pts.length - 1];
        if (!fx.runs.some((r) => r[0] === P.pts.length && dist2([r[1], r[2]], a) < 2e-3 && dist2([r[3], r[4]], b) < 2e-3)) bad.push(`${id}/${P.id}: no matching proof ribbon`); } }
    if (paths.length && !RIBBONS[id]) bad.push(id + ': paths but no ribbon GLB');
  }
  const want = (pid, piece) => { const seq = seqOf[pid] || [], k = seq.indexOf(piece), nb = [seq[k - 1], seq[k + 1]].filter((q) => q && q !== 'main' && q !== piece);
    return { leadsTo: nb.length ? nb[0] : null, needs: [...new Set(seq.filter((q) => q !== 'main' && q !== piece))].sort() }; };
  if (C && C.paths) for (const id of order) for (const P of C.pieces[id].paths) { const w = want(P.id, id);
    if (P.leadsTo !== w.leadsTo || JSON.stringify([...(P.needs || [])].sort()) !== JSON.stringify(w.needs)) bad.push(`${id}/${P.id}: leadsTo ${P.leadsTo} needs [${P.needs}] vs ${w.leadsTo} [${w.needs}]`); }
  for (const [id, R] of Object.entries(RIBBONS)) {
    const rid = R.file.replace(/\.glb$/, ''), e = MF.assets[rid], f = path.join(MODELS, R.file);
    if (!e || e.status !== 'ready' || e.file !== R.file || !fs.existsSync(f)) { bad.push(rid + ': manifest / file'); continue; }
    const root = (await io.read(f)).getRoot(), mats = root.listMaterials(), prims = root.listMeshes().flatMap((m) => m.listPrimitives());
    if (mats.length !== 1 || mats[0].getAlphaMode() !== 'BLEND' || root.listTextures().length || prims.some((p) => p.getMaterial() !== mats[0])) { bad.push(rid + ': not one shared BLEND material / no textures'); continue; }
    const runs = C.pieces[id].paths, kids = root.listNodes().filter((n) => n.getMesh()), names = kids.map((n) => n.getName()).sort(), wantNames = runs.map((q) => 'path_' + q.id).sort();   // ONE named node per run
    if (JSON.stringify(names) !== JSON.stringify(wantNames)) bad.push(`${rid}: run nodes [${names}] vs [${wantNames}]`);
    for (const n of kids) { const m = n.getMesh(), q = runs.find((r) => 'path_' + r.id === n.getName()), x = m.getExtras() || {};
      if (m.getName() !== n.getName() || m.listPrimitives().length !== 1) bad.push(`${rid}/${n.getName()}: mesh name / primitives`);
      if (q && (x.leadsTo !== q.leadsTo || JSON.stringify(x.needs) !== JSON.stringify(q.needs))) bad.push(`${rid}/${n.getName()}: extras leadsTo / needs differ from the JSON`); }
    const top = await bakedTopOf(id), out = J.pieces[id].outline, dk = J.pieces[id].dockedPosition;
    let outside = 0, off = 0, below = 0, mr = 0, mc = Infinity, rgba = true;
    for (const prim of prims) {
      const col = prim.getAttribute('COLOR_0'); if (!col || col.getElementSize() !== 4) rgba = false;
      const P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray();
      for (let v = 0; v < P.length; v += 3) { const onRim = rimDist(id, P[v] + dk[0], P[v + 2] + dk[2]) <= SEAM_TOL;   // a seam row vertex: on the baked rim (C16)
        if (!GT.inLoop(out, P[v], P[v + 2]) && !onRim) outside++; const h = top(P[v], P[v + 2]) ?? (onRim ? top.rim(P[v], P[v + 2]) : null); if (h === null) { off++; continue; }
        const d = P[v + 1] - h - lift; if (d < -1e-4) below++; mr = Math.max(mr, d); }
      for (let t = 0; t < I.length; t += 3) for (const w of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) {
        const q = [I[t], I[t + 1], I[t + 2]], at = (o) => w[0] * P[q[0] * 3 + o] + w[1] * P[q[1] * 3 + o] + w[2] * P[q[2] * 3 + o], h = top(at(0), at(2)); if (h !== null) mc = Math.min(mc, at(1) - h); }
    }
    if (!rgba) bad.push(rid + ': COLOR_0 is not rgba');
    if (outside || off || below) bad.push(`${rid}: ${outside} vertices outside the outline, ${off} off the baked top, ${below} below top + lift`);
    if (!(mc >= lift / 2 - 1e-4)) bad.push(`${rid}: interior clearance ${f3(mc)} < ${f3(lift / 2)}`);   // every edge midpoint / triangle centroid >= half the lift above the top
    if (mr > 0.15) bad.push(`${rid}: a vertex raised ${f3(mr)} > 0.15 over a crest`);
  }
  ok('C10 paths: centrelines inside the outline = the proof\'s ribbons; ribbon GLBs on the baked top + lift, one named node per run with the right leadsTo / needs', C && C.paths && nPaths && !bad.length, bad); }

// C11 the v2 reroutes clear the game's drawn footprints by the stated margins; every regenerated conflict carries a resolution (none open)
{ const bad = [], run = (piece, pid) => C && C.paths && C.pieces[piece].paths.find((q) => q.id === pid);
  const wAt = (R, i) => (R.widths ? Math.max(R.widths[i], R.widths[i + 1]) : R.width);
  // least of (distance from the centreline to the feature) - (local half width + r), skipping the first `from` u (a doorstep)
  const clear = (R, dist, r, from = 0) => { let s = 0, m = Infinity; for (let i = 0; i < R.pts.length - 1; i++) { const [ax, az] = R.pts[i], [bx, bz] = R.pts[i + 1], Ln = Math.hypot(bx - ax, bz - az);
    if (s + Ln > from) m = Math.min(m, dist(ax, az, bx, bz) - (wAt(R, i) / 2 + r)); s += Ln; } return m; };
  const toPt = (px, pz) => (ax, az, bx, bz) => segD(px, pz, ax, az, bx, bz);
  const box = (cx, cz, hx, hz, rot) => (ax, az, bx, bz) => { let m = Infinity; for (let t = 0; t <= 1.0001; t += 0.05) { const x = ax + (bx - ax) * t - cx, z = az + (bz - az) * t - cz, c = Math.cos(rot), s = Math.sin(rot);
    const lx = c * x - s * z, lz = s * x + c * z; m = Math.min(m, Math.hypot(Math.max(Math.abs(lx) - hx, 0), Math.max(Math.abs(lz) - hz, 0))); } return m; };   // three rotation.y = rot
  const near2 = (p, q) => p && dist2(p, q) <= 0.02;
  const co = run('main', 'to_cottage'), or = run('main', 'to_orchard'), il = run('main', 'to_islet'), ie = run('islet', 'to_islet');
  if (!co || !or || !il || !ie) bad.push('runs missing');
  else {
    const checks = [
      ['to_cottage starts at the shortened STONE_PATHS[1] end (-5.25, 0.05)', near2(co.pts[0], [-5.25, 0.05])],
      ['to_cottage x well plinth (-6.10, 0.90) r 0.5 drawn', clear(co, toPt(-6.10, 0.90), 0.5), 0],
      ['to_cottage width past the lean-to / well gap (centreline within 1.2 u of the well) <= 0.95', Math.max(...co.pts.map((p, i) => (Math.hypot(p[0] + 6.1, p[1] - 0.9) < 1.2 ? (co.widths ? co.widths[i] : co.width) : 0))) <= 0.95],
      ['to_orchard starts at the windmill door (0.85, -4.30)', near2(or.pts[0], [0.85, -4.30])],
      ['to_orchard x windmill plinth (0.70, -5.50) r 0.9 drawn, past the 0.8 u doorstep', clear(or, toPt(0.70, -5.50), 0.9, 0.8), 0.05],
      ['to_orchard x greenhouse NW corner (2.87, -5.11)', clear(or, toPt(2.87, -5.11), 0), 0.10],
      ['to_orchard x greenhouse box 2.05 x 1.48 at (3.80, -4.25), turned -0.12', clear(or, box(3.80, -4.25, 1.025, 0.74, -0.12), 0), 0.10],
      ['to_islet (main) starts at (6.15, -0.98), 0.8 u trimmed', near2(il.pts[0], [6.15, -0.98])],
      ['to_islet (main) x garden east fence x 5.21, z -1.88..3.16', clear(il, (ax, az, bx, bz) => Math.min(...[-1.88, -1.5, -1, -0.5, 0, 0.5, 1, 2, 3.16].map((z) => segD(5.21, z, ax, az, bx, bz))), 0), 0.35],
      ['islet:to_islet ends 0.3 u short of the lighthouse door, world (24.61, -5.33)', near2(ie.pts[ie.pts.length - 1], [24.61 - 18.8, -5.33 + 4.2])],
    ];
    for (const [name, v, min] of checks) { if (typeof v === 'boolean') { if (!v) bad.push(name); } else if (!(v >= min)) bad.push(`${name}: ${f3(v)} < ${min}`); }
  }
  const conf = (C && C.conflicts && C.conflicts.items) || [];   // every conflict is explained; the game's three reroute rows are no longer drawn-footprint overlaps
  if (!C || !C.conflicts) bad.push('no conflicts block'); for (const c of conf.filter((c) => !c.resolution || c.open)) bad.push(`open conflict ${c.path} x ${c.slot}`);
  if (conf.some((c) => c.path === 'to_islet' && c.slot === 'garden')) bad.push('to_islet x garden still listed');
  for (const [p, s] of [['to_cottage', 'well'], ['to_orchard', 'windmill'], ['to_orchard', 'greenhouse']]) { const c = conf.find((q) => q.path === p && q.slot === s); if (c && !(c.drawnClear >= 0)) bad.push(`${p} x ${s}: drawn footprint overlapped (${c.drawnClear})`); }
  ok('C11 the v2 reroutes clear the game\'s drawn slots (well / windmill plinth, greenhouse, garden fence); every listed conflict is explained', C && !bad.length, bad); }

// C12 the ground-cover kit: 13 ready textured models (12 plants + the pebbles, KIT_CATEGORY puts the pebbles in 'rocks'), each placed in its category, never painted (color),
// yOffset -0.01 unless its own, TINTED NEAR-WHITE (instanceColor 'tint'; each channel in [0.92, 1.08] but MAIN's shade-pool clover reaches 0.754)
{ const bad = [], used = new Set(allItems().map((it) => it.asset)), onTop = [], noTint = [], offBand = [], wrongCat = [];
  for (const id of KIT_IDS) {
    const e = MF.assets[id], a = C && C.assets && C.assets[id];
    if (!e || e.status !== 'ready') { bad.push(id + ': no ready manifest entry'); continue; }
    if (keys(e) !== JSON.stringify(['file', 'notes', 'status', 'tris'])) bad.push(`${id}: entry keys ${Object.keys(e)}`);
    if (!a || a.provider !== 'export-composition' || a.category !== KIT_CATEGORY[id] || a.yOffset !== (KIT[id].yOffset ?? -0.01) || a.instanceColor !== 'tint') bad.push(`${id}: assets{} entry ${JSON.stringify(a)} (want instanceColor 'tint')`);
    const f = path.join(MODELS, e.file); if (!fs.existsSync(f)) { bad.push(id + ': no file'); continue; }
    const root = (await io.read(f)).getRoot();
    if (!isKitMat(root)) bad.push(`${id}: not one MASK material with a PNG map`);
    if (root.listMeshes().some((m) => m.listPrimitives().some((p) => !p.getAttribute('NORMAL') || !p.getAttribute('TEXCOORD_0')))) bad.push(`${id}: a primitive without NORMAL / TEXCOORD_0`);
    if (triCount(root) !== e.tris) bad.push(`${id}: ${triCount(root)} tris vs manifest ${e.tris}`);
    if (!used.has(id)) bad.push(`${id}: placed nowhere`);
  }
  if (!KIT_IDS.includes('pebbles') || KIT_CATEGORY.pebbles !== 'rocks') bad.push("pebbles: not in the kit with KIT_CATEGORY 'rocks'");
  for (const it of allItems()) if (KIT_IDS.includes(it.asset)) {
    if (it.cat !== KIT_CATEGORY[it.asset]) wrongCat.push(it.piece + ':' + it.asset + ' in ' + it.cat);
    if (it.color) onTop.push(it.asset);
    if (!isTint(it.tint)) { noTint.push(`${it.piece}:${it.asset}`); continue; }
    const lo = it.asset === 'clover_patch' && it.piece === 'main' ? 0.754 : TINT[0];
    if (it.tint.some((v) => v < lo - 1e-9 || v > TINT[1] + 1e-9)) offBand.push(`${it.piece}:${it.asset} ${it.tint}`);
  }
  ok('C12 the ground-cover kit: ready textured models, each placed in its KIT_CATEGORY list, never painted, tinted near-white', C && !bad.length && !onTop.length && !noTint.length && !offBand.length && !wrongCat.length,
    bad.concat(wrongCat.map((w) => 'wrong category ' + w), onTop.map((a) => 'carries a color: ' + a), noTint.map((a) => 'no tint: ' + a), offBand.map((a) => 'off the tint band: ' + a))); }

// C13 every SPECIES id but the game-placed tree_fruit, every AUTUMN and SHRUBS id is placed; all have a ready manifest entry, a file and an assets{} record
// (trees 'trees' with instanceColor 'tint', tree_fruit untinted; bushes and card shrubs 'shrubs', no instanceColor); the lists hold only that set
{ const bad = [], n = {};
  for (const it of allItems()) n[it.asset] = (n[it.asset] || 0) + 1;
  for (const id of PAINTED_IDS) {
    if (!GAME_PLACED.includes(id) && !n[id]) bad.push(`${id}: placed nowhere`);
    const e = MF.assets[id], a = C && C.assets && C.assets[id];
    if (!e || e.status !== 'ready' || e.file !== id + '.glb' || !fs.existsSync(path.join(MODELS, e.file))) bad.push(`${id}: no ready manifest entry + file`);
    const tree = TREE_IDS.includes(id), tint = tree && !GAME_PLACED.includes(id) ? 'tint' : undefined;
    if (!a || a.category !== (tree ? 'trees' : 'shrubs') || a.file !== id + '.glb' || a.provider !== 'export-composition' || a.yOffset !== 0 || a.instanceColor !== tint) bad.push(`${id}: assets{} ${JSON.stringify(a)} (want category ${tree ? 'trees' : 'shrubs'}, instanceColor ${tint || 'none'})`);
  }
  const strays = new Set(); if (C) for (const id of order) { for (const t of C.pieces[id].trees) if (!TREE_IDS.includes(t.asset)) strays.add('trees:' + t.asset);
    for (const s of C.pieces[id].shrubs) if (!BUSH_IDS.includes(s.asset) && !SHRUB_IDS.includes(s.asset)) strays.add('shrubs:' + s.asset); }
  if (strays.size) bad.push(`not in the painterly set: ${[...strays]}`);
  ok('C13 every species / autumn / card-shrub id placed (but tree_fruit) with a ready manifest entry, file and assets{} record; lists hold only that set', C && !bad.length, bad); }

// C14 the near-white crown tint on every tree item, never on a shrub; the tints vary (more than 10 distinct); C14s: a constant tint fails the variety rule
{ let trees = 0, untinted = 0, out = 0; const shrubTint = [], tints = [];
  for (const it of allItems()) {
    if (it.cat === 'shrubs' && 'tint' in it) shrubTint.push(it.asset);
    if (it.cat !== 'trees') continue; trees++;
    if (!isTint(it.tint)) { untinted++; continue; }
    tints.push(it.tint); if (it.tint.some((c) => c < TINT[0] || c > TINT[1])) out++;
  }
  const variety = (list) => new Set(list.map((t) => t.join(','))).size, constant = tints.map(() => tints[0] || [1, 1, 1]);
  ok(`C14 every tree item's tint channels in [${TINT}] (near white), > ${TINT_VARIETY} distinct tints; no shrub item carries a tint`, C && trees && !untinted && !out && !shrubTint.length && variety(tints) > TINT_VARIETY, `${untinted} untinted, ${out} outside, ${variety(tints)} distinct, ${shrubTint.length} shrub tints`);
  ok('C14s the variety rule catches a constant tint', tints.length > 0 && !(variety(constant) > TINT_VARIETY)); }

// C15 far versions: every tree record (tree_fruit too) has far '<id>_far.glb', that file and a ready manifest entry with the GLB's tris; no other record has one; draw.far mentions "far"
{ const bad = [];
  for (const id of TREE_IDS) {
    const a = C && C.assets && C.assets[id], want = id + '_far.glb', e = MF.assets[id + '_far'], f = path.join(MODELS, want);
    if (!a || a.far !== want) { bad.push(`${id}: assets{} far ${a ? JSON.stringify(a.far) : '(no record)'} (want ${want})`); continue; }
    if (!e || e.status !== 'ready' || e.file !== want || !fs.existsSync(f)) { bad.push(`${id}: no ready manifest entry ${id}_far + file ${want}`); continue; }
    if (keys(e) !== JSON.stringify(['file', 'notes', 'status', 'tris'])) bad.push(`${id}_far: entry keys ${Object.keys(e)}`);
    const tris = triCount((await io.read(f)).getRoot()); if (tris !== e.tris) bad.push(`${id}_far: ${tris} tris vs manifest ${e.tris}`);
  }
  const others = C && C.assets ? Object.entries(C.assets).filter(([id, a]) => !TREE_IDS.includes(id) && 'far' in a).map(([id]) => id) : [];
  if (others.length) bad.push(`not a tree, but with a far: ${others}`);
  if (!C || !C.draw || typeof C.draw.far !== 'string' || !/\bfar\b/i.test(C.draw.far)) bad.push('draw.far missing or does not mention "far"');
  ok('C15 far versions: every tree record has far \'<id>_far.glb\' with a ready manifest entry; no other record has one; draw.far mentions "far"', C && !bad.length, bad); }

// C16 paths across seams: where a path runs from one piece onto the next, the two runs' ribbon end rows coincide vertex for vertex (heights too) and lie ON the seam
// (the boundary of both pieces' baked tops); as many run pairs as the paths cross seams
{ const bad = [];
  if (Object.keys(rims).length !== order.length) bad.push('a baked piece is missing');
  let want = 0; for (const P of A.blueprint.paths) { let last = null;
    for (const [x, z] of GT.resamplePolyline(GT.catmullRomCentripetal(P.pts, 5), 0.25)) { const pc = GT.pieceAt(bp, x, z); if (pc && last && pc !== last) want++; if (pc) last = pc; } }
  const runs = C && C.paths ? order.flatMap((id) => C.pieces[id].paths.map((P) => ({ piece: id, P, d: J.pieces[id].dockedPosition }))) : [], pairs = [];
  const W = (r, p) => [p[0] + r.d[0], p[1] + r.d[2]];
  for (const a of runs) for (const b of runs) if (a.P.id === b.P.id && a.piece !== b.piece && dist2(W(a, a.P.pts[a.P.pts.length - 1]), W(b, b.P.pts[0])) < 5e-3) pairs.push([a, b]);
  if (pairs.length !== want) bad.push(`${pairs.length} run pairs meet at a seam, the paths cross ${want} seams`);
  const rowsOf = {};   // ribbon rows (world x, y, z): first / last 7 vertices of node path_<runId>
  for (const id of Object.keys(RIBBONS)) { const f = path.join(MODELS, RIBBONS[id].file); if (!fs.existsSync(f)) continue; const d = J.pieces[id].dockedPosition;
    for (const n of (await io.read(f)).getRoot().listNodes().filter((q) => q.getMesh())) { const P = n.getMesh().listPrimitives()[0].getAttribute('POSITION').getArray(), nv = P.length / 3;
      const row = (r0) => Array.from({ length: 7 }, (_, k) => [P[(r0 + k) * 3] + d[0], P[(r0 + k) * 3 + 1] + d[1], P[(r0 + k) * 3 + 2] + d[2]]);
      rowsOf[id + '/' + n.getName()] = { first: row(0), last: row(nv - 7) }; } }
  for (const [a, b] of pairs) {
    const ra = rowsOf[a.piece + '/path_' + a.P.id], rb = rowsOf[b.piece + '/path_' + b.P.id], tag = `${a.P.id} ${a.piece}>${b.piece}`;
    if (!ra || !rb) { bad.push(`${tag}: no ribbon node`); continue; }
    const E = ra.last, S = rb.first, gap = Math.max(...E.map((v, k) => Math.hypot(v[0] - S[k][0], v[1] - S[k][1], v[2] - S[k][2])));
    const off = Math.max(...E.concat(S).map(([x, , z]) => Math.max(rimDist(a.piece, x, z), rimDist(b.piece, x, z))));
    if (!(gap <= SEAM_TOL) || !(off <= SEAM_TOL)) bad.push(`${tag}: end rows ${f3(gap)} apart, ${f3(off)} off the seam`);
  }
  ok(`C16 paths across seams: the two runs' end rows coincide (<= ${SEAM_TOL} u, heights too) and lie on the seam`, C && pairs.length && !bad.length, bad); }

// C17 woodshed: nothing composed within 0.65 + 0.15 u of layout WOODSHED = byHouse(2.0, -1.2) (spot B, beside the farmhouse's log stack) on MAIN; the keep-clear disc is on that spot
const byHouse = ([x, z]) => { const H = A.game.HOUSE, c = Math.cos(H.rot), s = Math.sin(H.rot); return [H.x + x * c + z * s, H.z - x * s + z * c]; };   // layout.ts byHouse
const WOODSHED = byHouse([2.0, -1.2]);
{ const on = C ? near('main', WOODSHED, 0.65 + PAD) : [];
  ok('C17 nothing composed on the woodshed\'s ground (0.8 u of layout WOODSHED); the keep-clear disc sits on it', C && !on.length && discOff(KC.find((k) => k.id === 'woodshed'), WOODSHED) < 1e-3, show(on)); }

// C18 wetland_jetty anchor (blueprint.pieces.json wetland openCoastAnchors): origin = deck centre, yaw = outward, level = lake level = y; the shore end 0.85 u behind the origin on the bank
// 0.11 .. 0.16 u above the level (baked top); the 0.7 x 1.7 deck lies over open lake water past its first 0.45 u (baked ground below the level), clear of the heron hide, reed beds, the game's
// lily pads and shore reeds; a dry, flat shed patch (r >= 0.6) beside it; nothing composed on the deck or the patch (+ 0.15 u)
const PADS = [[3.1, 5.3], [3.55, 5.75], [2.95, 5.95], [4.7, 4.3], [5.15, 4.6], [8.6, 5.3], [8.2, 4.85], [4.7, 8.2]];   // isleSpots.ts WETLAND.pads (local)
const JETTY_SHORE_Z = -0.85, JETTY_BANK = [0.11, 0.16];
{ const bad = [], WP = J && J.pieces.wetland, an = WP && (WP.openCoastAnchors || []).find((a) => a.id === 'wetland_jetty');
  if (!an) bad.push('no wetland_jetty anchor in blueprint.pieces.json');
  else {
    const d = WP.dockedPosition, lk = WP.water.lake, level = lk.level - d[1], lake = lk.outline.map(([x, z]) => [x - d[0], z - d[2]]);
    const [ox, oz] = an.local || [], [sx, sz] = (an.shoreEnd && an.shoreEnd.local) || [], [dx, dz] = an.outward || [], nx = -dz, nz = dx, Ld = an.deck && an.deck.length, hw = an.deck && an.deck.width / 2;
    if (![ox, oz, sx, sz, dx, dz, an.yaw, an.level, an.y, Ld, hw].every(Number.isFinite)) bad.push(`fields: ${JSON.stringify(an)}`);
    else {
      if (Math.abs(Math.hypot(dx, dz) - 1) > 1e-3 || Math.abs(Math.sin(an.yaw) - dx) > 1e-3 || Math.abs(Math.cos(an.yaw) - dz) > 1e-3) bad.push(`yaw ${an.yaw} vs outward ${an.outward}`);
      if (Math.abs(an.level - level) > 1e-4 || Math.abs(an.y - level) > 1e-4) bad.push(`level ${an.level} / y ${an.y} vs lake ${level}`);
      if (Math.abs(an.world[0] - ox - d[0]) > 1e-3 || Math.abs(an.world[1] - oz - d[2]) > 1e-3) bad.push('world != local + docked position');
      if (Math.hypot(ox + JETTY_SHORE_Z * dx - sx, oz + JETTY_SHORE_Z * dz - sz) > 2e-3) bad.push(`shore end not ${-JETTY_SHORE_Z} u behind the origin along outward`);
      if (!(Ld >= 1.7 && hw >= 0.358)) bad.push(`deck ${Ld} x ${2 * hw} (the model is 0.716 x 1.707)`);
      const top = await bakedTopOf('wetland');
      let dry = 0; for (let u = 0.45; u <= Ld + 1e-9; u += 0.05) for (let v = -hw; v <= hw + 1e-9; v += hw / 4) { const x = sx + dx * u + nx * v, z = sz + dz * u + nz * v, h = top(x, z);
        if (!GT.inLoop(lake, x, z) || h === null || h >= level - 0.02) dry++; }
      if (dry) bad.push(`${dry} deck points past 0.45 u not over open lake water`);
      const bank = top(sx, sz);
      if (bank === null || bank - level < JETTY_BANK[0] || bank - level > JETTY_BANK[1]) bad.push(`shore end bank ${bank === null ? 'off the top' : f3(bank - level)} above the level (want ${JETTY_BANK.join(' .. ')})`);
      const deckDist = (px, pz) => { const t = Math.max(0, Math.min(Ld, (px - sx) * dx + (pz - sz) * dz)); return Math.hypot(px - sx - dx * t, pz - sz - dz * t); };
      const zone = (id) => WP.flatZones.find((q) => q.id === id), cen = [lake.reduce((s, p) => s + p[0], 0) / lake.length, lake.reduce((s, p) => s + p[1], 0) / lake.length];
      const clump = (f) => { const [x, z] = lake[Math.floor(f * lake.length) % lake.length], r = Math.hypot(x - cen[0], z - cen[1]) || 1; return [x - (x - cen[0]) / r * 0.35, z - (z - cen[1]) / r * 0.35]; };   // isleSpots.ts shore()
      const keep = [...['heron_hide', 'reed_bed_a', 'reed_bed_b'].map((id) => [id, zone(id).at, zone(id).r]), ...PADS.map((p, i) => [`pad ${i}`, p, 0.25]), ...[0.05, 0.3, 0.62, 0.84].map((f) => [`shore reeds ${f}`, clump(f), 0.45])];
      for (const [nm, at, r] of keep) { const c = deckDist(at[0], at[1]) - hw - r; if (c < 0.1) bad.push(`deck ${f3(c)} from ${nm}`); }
      const sp = an.shedPatch;
      if (!sp || !Array.isArray(sp.at) || !(sp.r >= 0.6)) bad.push(`shed patch ${JSON.stringify(sp)}`);
      else { let lo = Infinity, hi = -Infinity; for (let k = 0; k < 24; k++) for (const rr of [0, sp.r / 2, sp.r]) { const h = top(sp.at[0] + Math.cos(k / 24 * 2 * Math.PI) * rr, sp.at[1] + Math.sin(k / 24 * 2 * Math.PI) * rr); if (h === null) { lo = -Infinity; continue; } lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (!(lo >= level + 0.08) || hi - lo > 0.15) bad.push(`shed patch ground ${f3(lo - level)} .. ${f3(hi - level)} above the level (want dry, within 0.15)`);
        if (deckDist(sp.at[0], sp.at[1]) < hw + sp.r) bad.push('shed patch on the deck'); if (Math.hypot(sp.at[0] - sx, sp.at[1] - sz) > 2) bad.push('shed patch not beside the shore end'); }
      const onIt = C ? items('wetland').filter((it) => deckDist(it.x, it.z) < hw + PAD || (sp && Math.hypot(it.x - sp.at[0], it.z - sp.at[1]) < sp.r + PAD)) : [];
      if (onIt.length) bad.push(`${onIt.length} composed items on the deck / shed patch: ${show(onIt)}`);
    }
  }
  ok('C18 wetland_jetty anchor: origin, yaw, level; deck over open lake water, clear of hide / reed beds / pads / shore reeds; shore end on the bank; dry flat shed patch; nothing composed on either', !bad.length, bad); }

// C19 the farm's second bush moved to (-4.76, -4.48) (layout.ts BUSHES[1]) while the ground zones keep the v3 freeze: a keep-clear disc of the slot's radius on it, nothing composed within
// radius + pad; the old spot (-3.5, -4.2) lies inside the woodshed's keep-clear
const BUSH1 = [-4.76, -4.48], BUSH1_WAS = [-3.5, -4.2];
{ const disc = KC.find((k) => k.id === 'bush_1'), shed = KC.find((k) => k.id === 'woodshed'), R = A.mainZones.radii.bush, bad = [];
  if (!disc) bad.push('no keep-clear disc "bush_1" in world.config blueprint.keepClear');
  else { if (!(discOff(disc, BUSH1) < 1e-3)) bad.push('the disc is off the new spot'); if (Math.abs(disc.r - R) > 1e-9) bad.push(`disc r ${disc.r} != the bush slot radius ${R}`); }
  const on = C ? near('main', BUSH1, R + PAD) : [];
  if (on.length) bad.push(`${on.length} composed items within ${R + PAD} u of the new spot: ${show(on)}`);
  const under = shed ? dist2(BUSH1_WAS, shed.at) + R - (shed.r + (shed.pad ?? PAD)) : Infinity;   // <= 0: the old slot disc is inside the woodshed's
  if (!(under <= 0)) bad.push(`the old slot disc is not inside the woodshed's keep-clear (${f3(under)} u over)`);
  ok('C19 the second bush\'s move is mirrored: a keep-clear disc on it, nothing composed within its radius + pad; the old spot lies inside the woodshed\'s keep-clear', C && !bad.length, bad); }

// C20 Barnaby's camp (-0.85, -0.85) and his stand (-0.719, -0.111) are mirrored as the game gives them (world.config gameSince), each with a keep-clear disc (r 0.65 / 0.3); nothing composed within r + pad of either
const STAND_GIVEN = [-0.719, -0.111];
{ const S = A.gameSince || {}, bad = [];
  if (!S.CAMP) bad.push('no world.config gameSince.CAMP mirror');
  else { const a = S.CAMP_ROT + S.STAND_BEARING, derived = [S.CAMP[0] + S.STAND_DIST * Math.sin(a), S.CAMP[1] + S.STAND_DIST * Math.cos(a)];   // places/characters.ts CAMP_STAND
    if (!S.CAMP_STAND || dist2(S.CAMP_STAND, STAND_GIVEN) > 1e-9) bad.push(`gameSince.CAMP_STAND ${S.CAMP_STAND} is not the game's ${STAND_GIVEN}`);
    else if (dist2(derived, S.CAMP_STAND) > 1e-3) bad.push(`the stand from the camp (${derived.map(f3)}) is not the mirrored one`);
    for (const [k, at, r] of [['camp', S.CAMP, S.CAMP_CLEAR], ['camp_stand', STAND_GIVEN, S.STAND_CLEAR]]) { const d = KC.find((q) => q.id === k);
      if (!d) bad.push(`no keep-clear disc "${k}"`); else { if (!(discOff(d, at) < 1e-3)) bad.push(`disc ${k} is off its spot`); if (d.r !== r) bad.push(`disc ${k} r ${d.r} != ${r}`); } } }
  const onCamp = C ? near('main', S.CAMP || [-0.85, -0.85], +((S.CAMP_CLEAR || 0.65) + PAD).toFixed(3)) : [], onStand = C ? near('main', STAND_GIVEN, +((S.STAND_CLEAR || 0.3) + PAD).toFixed(3)) : [];
  if (onCamp.length) bad.push(`${onCamp.length} composed items near the camp: ${show(onCamp)}`);
  if (onStand.length) bad.push(`${onStand.length} composed items near the stand: ${show(onStand)}`);
  ok('C20 Barnaby\'s camp and stand are mirrored as given, each with its keep-clear disc; nothing composed within r + pad of either', C && !bad.length, bad); }

// C21 the hero tree's root flare (hero_tree.glb: its lowest vertices, within 0.05 u of the lowest point, reach FLARE from the tree's spot, STATIC_TREES[0]) is kept clear: a disc of that
// radius (rounded up to the hundredth) keeping trees, bushes, shrubs and rocks off (ground cover may grow between the roots); no composed volume within it + pad
{ const disc = KC.find((k) => k.id === 'hero_tree'), HERO = A.game.STATIC_TREES[0].at, bad = [], pts = [], e = [0, 0, 0];
  for (const n of (await io.read(path.join(MODELS, 'hero_tree.glb'))).getRoot().listNodes()) { const m = n.getMesh(); if (!m) continue; const w = n.getWorldMatrix();
    for (const pr of m.listPrimitives()) { const P = pr.getAttribute('POSITION'); for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); pts.push([w[0] * e[0] + w[4] * e[1] + w[8] * e[2] + w[12], w[1] * e[0] + w[5] * e[1] + w[9] * e[2] + w[13], w[2] * e[0] + w[6] * e[1] + w[10] * e[2] + w[14]]); } } }
  const low = Math.min(...pts.map((q) => q[1])), roots = pts.filter((q) => q[1] < low + 0.05), FLARE = Math.max(...roots.map((q) => Math.hypot(q[0], q[2])));
  if (roots.length < 100) bad.push(`only ${roots.length} root vertices found`);
  if (!disc) bad.push('no keep-clear disc "hero_tree" in world.config blueprint.keepClear');
  else {
    if (!(discOff(disc, HERO) < 1e-3)) bad.push(`the disc is off the tree (${HERO})`);
    if (!(disc.r >= FLARE - 1e-9 && disc.r - FLARE <= 0.01 + 1e-9)) bad.push(`disc r ${disc.r}, the model's root flare reaches ${f3(FLARE)} (want it rounded up to the hundredth)`);
    for (const k of ['trees', 'bushes', 'shrubs', 'rocks']) if (!(disc.kinds || []).includes(k)) bad.push(`the disc does not keep ${k} off`);
    for (const k of ['flowers', 'grass', 'cover', 'flowerPatches']) if ((disc.kinds || []).includes(k)) bad.push(`the disc bares the ground cover (${k})`); }
  const on = C ? near('main', HERO, FLARE + PAD).filter((it) => it.cat !== 'flowers' && it.cat !== 'grass' && !KIT_IDS.includes(it.asset)) : [];
  if (on.length) bad.push(`${on.length} composed volumes within ${f3(FLARE + PAD)} u of the tree: ${show(on)}`);
  ok('C21 the hero tree\'s root flare is kept clear: a disc of that radius; no composed tree, bush, shrub or rock within it + pad', C && !bad.length, bad); }

// C22 the pond's reeds: pieces.main.reeds (>= 6 of { x, z, height 0.8-1.25, head boolean }, piece-local), each at the waterline (0.25 u inside to 0.4 u outside the pond outline, world)
// and >= 1.0 u from its cap line (last point to first); draw.reeds names the game's Reeds and GV3
{ const R = (C && C.pieces && C.pieces.main && C.pieces.main.reeds) || null, bad = [], dk = J.pieces.main.dockedPosition, po = J.pieces.main.water.pond.outline;
  const capA = po[po.length - 1], capB = po[0];
  if (!Array.isArray(R)) bad.push('no pieces.main.reeds list');
  else {
    if (R.length < 6) bad.push(`${R.length} reeds (< 6)`);
    for (const r of R) { const at = `(${f3(r.x)}, ${f3(r.z)})`;
      if (keys(r) !== JSON.stringify(['head', 'height', 'x', 'z'])) bad.push(`${at} keys ${Object.keys(r)}`);
      if (!(r.height >= 0.8 && r.height <= 1.25)) bad.push(`${at} height ${r.height}`);
      if (typeof r.head !== 'boolean') bad.push(`${at} head ${r.head}`);
      const wx = r.x + dk[0], wz = r.z + dk[2], e = loopDist(po, wx, wz), cd = segD(wx, wz, capA[0], capA[1], capB[0], capB[1]), sd = GT.inLoop(po, wx, wz) ? -e : e;   // signed: < 0 in the water
      if (sd < -0.25 || sd > 0.4 || cd < 1.0) bad.push(`${at} ${f3(sd)} u out, ${f3(cd)} u from the cap line`); } }
  const note = C && C.draw && C.draw.reeds;
  if (typeof note !== 'string' || !/\bReeds\b/.test(note) || !/\bGV3\b/.test(note)) bad.push('draw.reeds does not name the game\'s Reeds and GV3');
  ok('C22 the pond\'s reeds: >= 6, height 0.8-1.25, head boolean, at the waterline, >= 1.0 u from the cap line; draw.reeds names Reeds and GV3', C && !bad.length, bad); }

let fail = 0;
for (const r of results) { console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass || !r.detail ? '' : '\n        ' + r.detail}`); if (!r.pass) fail++; }
console.log(`  ${results.length - fail}/${results.length} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
