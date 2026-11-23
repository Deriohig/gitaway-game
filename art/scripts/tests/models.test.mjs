// models.test.mjs -- the models published into public/models under the game's asset ids (scripts/publish-models.mjs).
//   node tests/models.test.mjs
// P1-P6 publishing; P7-P17 polish (porch lamp, sizes, file size, texture quality, roof); P12-P15 batch 2 (animals, lighthouse, lantern, cuts);
// P18-P23 the painted procedural models (woodshed, wetland_jetty, barnaby, tower_ruin, barnaby_camp) on one shared atlas; M-SH the meadow
// shelter (and sheep_shelter as the identical file); M-HA the brown hare (visitor_hare, Meshy, unrigged)
import path from 'node:path';
import jpeg from 'jpeg-js';
import fs from 'node:fs';
import os from 'node:os';
import { NodeIO } from '@gltf-transform/core';
import { buildAsset, inspectGlb } from '../lib/builder.mjs';
import { MODELS, meshySource, projectRoot, publishModels } from '../publish-models.mjs';
import W3 from '../../config/world.config.mjs';
import LOOK from '../../config/look.config.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? '\n        ' + detail : ''}`); };
const done = (name, e) => ok(name, !e.length, e.join(', '));   // pass when the list of problems is empty
const modelsDir = path.join(projectRoot, 'public', 'models'), glbPath = (id) => path.join(modelsDir, `${id}.glb`);
let manifest = { assets: {} };
try { manifest = JSON.parse(fs.readFileSync(path.join(modelsDir, 'manifest.json'), 'utf8')); } catch { /* missing */ }
const A = manifest.assets || {};
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v)), f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));
const inr = (v, lo, hi) => v >= lo && v <= hi;
const near0 = (v, tol) => Math.abs(v) <= tol;
const ident = (n) => n.getRotation().every((v, k) => Math.abs(v - [0, 0, 0, 1][k]) < 1e-6);
const isGlow = (p) => p.mat && p.mat.getName() === 'Glow';

// P1: every id has its file and a ready manifest entry pointing at it
{ const bad = MODELS.filter((M) => !fs.existsSync(glbPath(M.id)) || !A[M.id] || A[M.id].status !== 'ready' || A[M.id].file !== `${M.id}.glb`).map((M) => M.id);
  done('P1 every model is in public/models with a "ready" manifest entry', bad.map((id) => 'missing/not ready: ' + id)); }

// P2: Meshy-sourced files are byte-identical to the finished models in art/meshy
{ const bad = MODELS.filter((M) => M.meshy && (!fs.existsSync(glbPath(M.id)) || Buffer.compare(fs.readFileSync(glbPath(M.id)), fs.readFileSync(meshySource(M.meshy))) !== 0)).map((M) => M.id);
  done('P2 Meshy models are byte-identical to art/meshy (the V21 files)', bad.map((id) => 'differs: ' + id)); }

// P3: the nodes the game animates are there (windmill Blades, farmhouse Smoke, sheep Head, trees Canopy); P4: manifest tris match the files
const info = {};
for (const M of MODELS) if (fs.existsSync(glbPath(M.id))) info[M.id] = await inspectGlb(glbPath(M.id));
done('P3 named nodes the game looks up are present', MODELS.flatMap((M) => M.nodes.filter((n) => !info[M.id] || !info[M.id].nodes.includes(n)).map((n) => `${M.id}.${n}`)));
{ const bad = MODELS.filter((M) => info[M.id] && A[M.id] && A[M.id].tris !== info[M.id].tris).map((M) => `${M.id} ${A[M.id].tris}!=${info[M.id].tris}`);
  ok('P4 manifest tris match the files', !bad.length && Object.keys(info).length === MODELS.length, bad.join(', ')); }

// P5: publishing touches only its own ids and is deterministic (run twice into a temp dir seeded with a foreign entry)
{ const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pubmodels-')), foreign = { file: 'piece_main.glb', status: 'ready', tris: 1, height: { file: 'piece_main.height.bin' } };
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({ version: 1, assets: { piece_main: foreign } }));
  await publishModels({ modelsDir: tmp, log: () => {} });
  const snap = () => Object.fromEntries(fs.readdirSync(tmp).sort().map((f) => [f, fs.readFileSync(path.join(tmp, f))]));
  const first = snap(); await publishModels({ modelsDir: tmp, log: () => {} }); const second = snap();
  const same = Object.keys(first).length === Object.keys(second).length && Object.keys(first).every((f) => second[f] && Buffer.compare(first[f], second[f]) === 0);
  const kept = JSON.stringify(JSON.parse(first['manifest.json']).assets.piece_main) === JSON.stringify(foreign);
  ok('P5 publish keeps other manifest entries and is deterministic', same && kept, `foreign entry kept=${kept}, second run byte-identical=${same}`);
  fs.rmSync(tmp, { recursive: true, force: true }); }

// P6: the held-back underside is not published
ok('P6 the Meshy underside stays held back', !A.underside && !fs.existsSync(glbPath('underside')));

// ---- geometry helpers ----
const io = new NodeIO();
const ev = (w, e) => [w[0] * e[0] + w[4] * e[1] + w[8] * e[2] + w[12], w[1] * e[0] + w[5] * e[1] + w[9] * e[2] + w[13], w[2] * e[0] + w[6] * e[1] + w[10] * e[2] + w[14]];
const box = (P) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (const p of P) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  return { mn, mx, size: mx.map((v, k) => v - mn[k]), c: mx.map((v, k) => (v + mn[k]) / 2) }; };
async function geo(id) {   // the published file: every primitive with its material and world-space points, the named nodes, the bbox
  if (!fs.existsSync(glbPath(id))) return null;
  const R = (await io.read(glbPath(id))).getRoot(), prims = [], e = [0, 0, 0], all = [];
  for (const n of R.listNodes()) { const m = n.getMesh(); if (!m) continue; const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { const Pa = p.getAttribute('POSITION'), pts = []; for (let i = 0; i < Pa.getCount(); i++) { Pa.getElement(i, e); pts.push(ev(w, e)); }
      const ix = p.getIndices(), upts = ix ? [...new Set(ix.getArray())].map((i) => pts[i]) : pts;   // upts: only the vertices this primitive's faces use (a Meshy Glow primitive shares the body's whole vertex list)
      prims.push({ node: n.getName(), mat: p.getMaterial(), pts, upts }); all.push(...pts); } }
  const nodes = Object.fromEntries(R.listNodes().map((n) => [n.getName(), { t: ev(n.getWorldMatrix(), [0, 0, 0]), mesh: !!n.getMesh() }]));
  return { R, prims, nodes, box: box(all), kb: fs.statSync(glbPath(id)).size / 1024 };
}
const ptsOf = (g, node) => g.prims.filter((p) => p.node === node).flatMap((p) => p.pts);

// P7: farmhouse porch lamp: the game keeps a TEXTURED `Glow` (walls + window mask) and swaps an UNTEXTURED `Glow` for its emissive glowMat, so the lamp glass is its
// own untextured `Glow` on a mesh at the PorchLight empty (<= 0.3 u, glass <= 0.2 across); the empty stays at (-0.38, 0.80, 1.45); the textured Glow is still there
{ const g = await geo('farmhouse'), e = [];
  if (!g) e.push('missing');
  else { const PL = g.nodes.PorchLight && g.nodes.PorchLight.t;
    if (!PL) e.push('no PorchLight empty'); else if (Math.hypot(PL[0] + 0.38, PL[1] - 0.8, PL[2] - 1.45) > 0.01) e.push(`PorchLight moved to ${PL.map(f2)}`);
    if (!g.prims.some((p) => isGlow(p) && p.mat.getBaseColorTexture())) e.push('the textured Glow (walls + window mask) is gone');
    const lamp = g.prims.filter((p) => isGlow(p) && !p.mat.getBaseColorTexture());
    if (!lamp.length) e.push('no untextured Glow (lamp glass)');
    else if (PL) { const c = box(lamp.flatMap((p) => p.pts)), d = Math.hypot(c.c[0] - PL[0], c.c[1] - PL[1], c.c[2] - PL[2]);
      if (d > 0.3) e.push(`lamp glass ${f2(d)} u from the PorchLight empty`);
      if (Math.max(...c.size) > 0.2) e.push(`lamp glass ${f2(Math.max(...c.size))} u across (too big)`); } }
  done('P7 farmhouse: an untextured Glow (lamp glass) on a lamp mesh <= 0.3 u from the PorchLight empty; textured Glow + empty kept', e); }

// P8: sheep ~0.75 tall x ~0.8 long (+-0.05 u), Head (a mesh) pivoted at the neck: above the body middle, between the body centre and the face
{ const g = await geo('sheep'), e = [];
  if (!g) e.push('missing');
  else { const [, h, l] = g.box.size, H = g.nodes.Head;
    if (Math.abs(h - 0.75) > 0.05) e.push(`height ${f3(h)}`);
    if (Math.abs(l - 0.8) > 0.05) e.push(`length ${f3(l)}`);
    if (!H || !H.mesh) e.push('no Head mesh node');
    else { const hb = box(ptsOf(g, 'Head')); if (H.t[1] < 0.5 * h || H.t[1] > 0.85 * h || H.t[2] <= 0 || H.t[2] >= hb.c[2]) e.push(`Head pivot ${H.t.map(f2)} not at the neck (head centre z ${f2(hb.c[2])})`); } }
  done('P8 sheep ~0.75 tall x ~0.8 long (+-0.05 u), Head pivot at the neck', e); }

// P9: haystack <= 0.92 wide, and the proof's meadow pair (zones haystack_a / _b, rot 0.35 / 2.2, scale 1) do not touch: the gap between their footprints (convex hulls) > 0
function hull(P) {   // 2D convex hull (monotone chain), counter-clockwise
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1)); }
function polyGap(P1, P2) {   // > 0: the distance between two convex polygons; 0: they overlap (or touch)
  const sep = (P, Q) => P.some((a, i) => { const b = P[(i + 1) % P.length], nx = b[1] - a[1], ny = a[0] - b[0]; return Q.every((q) => (q[0] - a[0]) * nx + (q[1] - a[1]) * ny > 0); });
  if (!sep(P1, P2) && !sep(P2, P1)) return 0;
  const segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  let d = Infinity; for (const [P, Q] of [[P1, P2], [P2, P1]]) for (const p of P) for (let i = 0; i < Q.length; i++) d = Math.min(d, segD(p, Q[i], Q[(i + 1) % Q.length]));
  return d; }
{ const g = await geo('haystack'), e = [];
  if (!g) e.push('missing');
  else { const wd = Math.max(g.box.size[0], g.box.size[2]); if (wd > 0.92) e.push(`width ${f3(wd)}`);
    const Z = W3.archipelago.blueprint.zones.meadow, pair = [['haystack_a', 0.35], ['haystack_b', 2.2]].map(([id, rot]) => { const at = Z.find((z) => z.id === id).at, c = Math.cos(rot), s = Math.sin(rot);
      return hull(g.prims.flatMap((p) => p.pts).map(([x, , z]) => [at[0] + x * c + z * s, at[1] - x * s + z * c])); });
    const gap = polyGap(pair[0], pair[1]); if (!(gap > 0)) e.push(`the meadow pair touches (gap ${f3(gap)})`); }
  done('P9 haystack <= 0.92 wide; the meadow pair (haystack_a / _b) does not touch', e); }

// P10: every published Meshy model <= 200 KB (the game rule), or a documented per-id exception: the geometry (hero farmhouse) or the owner's texture review
// (1024 px albedos; the farmhouse's atlas back at 1024 px q85 with its own roof tile, ~587 KB) set the floor
const SIZE_EXCEPTIONS = { farmhouse: 620, hero_tree: 520, windmill: 520 };
{ const bad = [];
  for (const M of MODELS.filter((x) => x.meshy)) { if (!fs.existsSync(glbPath(M.id))) { bad.push(M.id + ' missing'); continue; }
    const kb = fs.statSync(glbPath(M.id)).size / 1024, cap = SIZE_EXCEPTIONS[M.id] || 200; if (kb > cap) bad.push(`${M.id} ${Math.round(kb)} KB > ${cap}`); }
  done('P10 every published Meshy model <= 200 KB (or its documented exception)', bad); }

// P11: hero_tree re-finished at ~3.4 u (3.3-3.5) so it stays in the game's default view behind the farmhouse
{ const g = await geo('hero_tree'), h = g ? g.box.size[1] : NaN;
  ok('P11 hero_tree height 3.3-3.5 u', inr(h, 3.3, 3.5), `height ${f3(h)}${g && g.nodes.Canopy ? ', Canopy kept' : ', NO Canopy'}`); }

// P16: the owner's texture review: hero_tree, windmill and farmhouse albedos are 1024 x 1024 JPEGs at quality >= 85 (luma quantisation table mean <= 17.6 at q85; 20.7 at q82, 34.6 at q70)
{ const lumaQ = (b) => { for (let i = 2; i < b.length - 4; i++) if (b[i] === 0xff && b[i + 1] === 0xdb) { let s = 0; for (let k = 0; k < 64; k++) s += b[i + 5 + k]; return s / 64; } return NaN; };
  const bad = [];
  for (const id of ['farmhouse', 'hero_tree', 'windmill']) { const g = await geo(id); if (!g) { bad.push(id + ' missing'); continue; }
    const t = g.R.listTextures().find((x) => /_albedo$/.test(x.getName())), sz = t && t.getSize(), q = t ? lumaQ(t.getImage()) : NaN;
    if (!sz || sz[0] !== 1024 || sz[1] !== 1024) bad.push(`${id} albedo ${sz ? sz.join('x') : 'none'} (want 1024)`);
    if (!(q <= 17.6)) bad.push(`${id} JPEG quality below 85 (q-table mean ${f2(q)})`); }
  done('P16 farmhouse, hero_tree and windmill: 1024 px albedos at JPEG quality >= 85', bad); }

// P17: the farmhouse roof has its own `Roof` primitive with a tiling tile texture (the atlas gave the roof ~95 texels/u and smeared): >= 8 u^2 of slope, >= 250 texels/u, REPEAT
// both ways, tile rows level (v changes only up the slope) on >= 90 % of the roof area; the texture is not named *_albedo (P16 reads the first *_albedo as the atlas)
{ const R = (await io.read(glbPath('farmhouse'))).getRoot(), bad = [], rp = R.listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial() && p.getMaterial().getName() === 'Roof');
  if (!rp) bad.push('no Roof primitive (the slopes still sample the atlas)');
  else {
    const mat = rp.getMaterial(), t = mat.getBaseColorTexture(), ti = mat.getBaseColorTextureInfo(), sz = t ? t.getSize() : null;
    const Pa = rp.getAttribute('POSITION').getArray(), Ua = rp.getAttribute('TEXCOORD_0').getArray(), Na = rp.getAttribute('NORMAL').getArray(), Ix = rp.getIndices().getArray();
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    let Ar = 0, Auv = 0, levelA = 0;
    for (let k = 0; k < Ix.length; k += 3) {
      const p = [0, 1, 2].map((j) => [Pa[Ix[k + j] * 3], Pa[Ix[k + j] * 3 + 1], Pa[Ix[k + j] * 3 + 2]]), u = [0, 1, 2].map((j) => [Ua[Ix[k + j] * 2], Ua[Ix[k + j] * 2 + 1]]);
      const e1 = sub(p[1], p[0]), e2 = sub(p[2], p[0]), n = cross(e1, e2), n2 = n[0] ** 2 + n[1] ** 2 + n[2] ** 2, a = Math.sqrt(n2) / 2; if (!(a > 1e-9)) continue;
      // a step face at a verge seam stands across its slope (its vertices carry the slope's normal): it belongs to the roof but has no rows of its own
      const vn = [Na[Ix[k] * 3], Na[Ix[k] * 3 + 1], Na[Ix[k] * 3 + 2]];
      if (Math.abs(n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2]) / (2 * a) < 0.9) continue;
      Ar += a; Auv += Math.abs((u[1][0] - u[0][0]) * (u[2][1] - u[0][1]) - (u[2][0] - u[0][0]) * (u[1][1] - u[0][1])) / 2;
      const ga = cross(e2, n), gb = cross(n, e1), g = [0, 1, 2].map((q) => ((u[1][1] - u[0][1]) * ga[q] + (u[2][1] - u[0][1]) * gb[q]) / n2);   // the surface gradient of v vs the face's horizontal direction: 0 when the rows run level
      const hl = Math.hypot(n[2], n[0]), th = [n[2] / hl, 0, -n[0] / hl], gl = Math.hypot(...g);
      if (gl > 0 && Math.abs(g[0] * th[0] + g[2] * th[2]) / gl < 0.12) levelA += a;
    }
    const tpu = sz ? Math.sqrt((Auv * sz[0] * sz[1]) / Ar) : 0;
    if (!(Ar >= 8)) bad.push(`roof area ${f2(Ar)} u^2 < 8`);
    if (!(tpu >= 250)) bad.push(`${Math.round(tpu)} texels per unit < 250`);
    if (!ti || ti.getWrapS() !== 10497 || ti.getWrapT() !== 10497) bad.push('not REPEAT');
    if (!(levelA >= 0.9 * Ar)) bad.push(`rows level on only ${Math.round(100 * levelA / Ar)} % of the roof`);
    if (t && /_albedo$/.test(t.getName())) bad.push('the roof texture is named *_albedo');
  }
  done('P17 farmhouse roof: its own Roof primitive + tiling texture (>= 8 u^2, >= 250 texels/u, REPEAT, rows level)', bad); }

// P12: batch 2 sizes (the brief's, at the concept's proportions), triangle budgets and the nodes the game animates: Head / Tail meshes at identity rotation, Head pivot at the neck,
// Tail pivot behind the body centre. Documented differences: cat_sleeping faces +X (the game yaws it); greenhouse v2 1.50 tall x 1.21 deep; scarecrow arms 1.25 across;
// dog 1,918 tris and lighthouse 3,028 are slightly over their raw smart-topology budgets
const B2 = {
  chicken: { h: [0.4, 0.5], tris: 1500, head: true },
  duck: { h: [0.26, 0.34], tris: 1500, dip: [-0.06, -0.02] },
  dog: { h: [0.5, 0.6], len: ['z', 0.6, 0.75], tris: 1950, head: true, tail: true },
  cat_sleeping: { h: [0.2, 0.3], len: ['max', 0.45, 0.56], tris: 1500, head: true, headX: true },
  goat: { h: [0.6, 0.7], len: ['z', 0.72, 0.88], tris: 1500, head: true },
  greenhouse: { h: [1.45, 1.55], len: ['x', 2.0, 2.1], dep: [1.15, 1.27], tris: 3000 },
  lighthouse: { h: [3.6, 3.85], tris: 3030 },
  beehive: { h: [0.65, 0.76], foot: 0.52, tris: 600 },
  lantern: { h: [0.85, 0.95], tris: 600 },
  scarecrow: { h: [1.4, 1.5], len: ['x', 1.15, 1.32], tris: 800 },
};
{ const bad = [];
  for (const [id, S] of Object.entries(B2)) {
    const g = await geo(id); if (!g) { bad.push(id + ' missing'); continue; }
    const [w, h, d] = g.box.size, t = info[id] ? info[id].tris : NaN, e = [];
    if (!inr(h, ...S.h)) e.push(`height ${f3(h)} not in ${S.h.join('-')}`);
    if (S.len) { const Ln = S.len[0] === 'x' ? w : S.len[0] === 'z' ? d : Math.max(w, d); if (!inr(Ln, S.len[1], S.len[2])) e.push(`${S.len[0]} length ${f3(Ln)} not in ${S.len[1]}-${S.len[2]}`); }
    if (S.dep && !inr(d, ...S.dep)) e.push(`depth ${f3(d)} not in ${S.dep.join('-')}`);
    if (S.foot && Math.max(w, d) > S.foot) e.push(`footprint ${f3(Math.max(w, d))} > ${S.foot}`);
    if (S.dip && !inr(g.box.mn[1], ...S.dip)) e.push(`hull bottom y ${f3(g.box.mn[1])} not in ${S.dip.join('..')}`);
    if (!(t <= S.tris)) e.push(`${t} tris > ${S.tris}`);
    for (const [want, name] of [[S.head, 'Head'], [S.tail, 'Tail']]) { if (!want) continue; const n = g.R.listNodes().find((x) => x.getName() === name);
      if (!n || !n.getMesh()) { e.push(`no ${name} mesh node`); continue; } if (!ident(n)) e.push(`${name} rotated`);
      const pv = g.nodes[name].t, pb = box(ptsOf(g, name));
      // (the cat's pivot is at the back-top of its head instead: a chin-up tilt turns about it)
      if (name === 'Head' && !S.headX && (pv[1] < 0.25 * h || pb.c[1] < pv[1] - 0.02)) e.push(`Head pivot ${pv.map(f2)} not at the neck (head centre y ${f2(pb.c[1])})`);
      if (name === 'Head' && S.headX && pb.c[0] <= g.box.c[0]) e.push(`cat head at x ${f2(pb.c[0])}: not toward +X`);
      if (name === 'Head' && !S.headX && pb.c[2] <= g.box.c[2]) e.push(`head at z ${f2(pb.c[2])}: not toward +Z`);
      if (name === 'Tail' && pv[2] >= g.box.c[2]) e.push(`Tail pivot z ${f2(pv[2])} not behind the body centre`); }
    if (e.length) bad.push(`${id}: ${e.join('; ')}`);
  }
  ok('P12 batch 2: brief sizes, triangle budgets, Head / Tail nodes (identity rotation, neck / tail-base pivots, facing)', !bad.length, bad.join(' | ')); }

// P13: the lighthouse `Beam` empty is a direct child of the scene root inside the lamp room (the box of its Glow faces, on the tower axis) and the lamp glass is a `Glow` above 60 % of the
// height; the lantern's `Glow` hangs on the +X arm with the post on the origin (the game's moth perches at lantern-local (0.18, 0.885))
{ const e = [], L = await geo('lighthouse'), N = await geo('lantern');
  if (!L) e.push('lighthouse missing');
  else { const beam = L.R.listScenes()[0].listChildren().find((n) => n.getName() === 'Beam'), gl = L.prims.filter(isGlow);
    if (!gl.length) e.push('lighthouse: no Glow');
    const gb = gl.length ? box(gl.flatMap((p) => p.upts)) : null;
    if (gb && gb.mn[1] < 0.6 * L.box.size[1]) e.push(`lighthouse Glow reaches down to y ${f2(gb.mn[1])}`);   // the door window (~1.3) stays out
    if (!beam || beam.getMesh()) e.push('no Beam empty at the scene root');
    else if (gb) { const b = beam.getTranslation(); if (Math.hypot(b[0], b[2]) > 0.2 || b.some((v, k) => v < gb.mn[k] || v > gb.mx[k])) e.push(`Beam at ${b.map(f2)} outside the lamp room`); } }
  if (!N) e.push('lantern missing');
  else { const gl = N.prims.filter(isGlow), foot = box(N.prims.flatMap((p) => p.upts).filter((p) => p[1] < 0.15));   // the post's centre = its foot block's (the post itself has vertices only at its ends)
    if (!gl.length) e.push('lantern: no Glow');
    else { const g = box(gl.flatMap((p) => p.upts)); if (g.mn[0] < 0.1 || g.c[0] > 0.35 || g.c[1] < 0.4 || g.mx[1] > 0.8 || Math.abs(g.c[2]) > 0.08) e.push(`lantern glow x ${f2(g.mn[0])}..${f2(g.mx[0])} y ${f2(g.mn[1])}..${f2(g.mx[1])}`); }
    if (Math.hypot(foot.c[0], foot.c[2]) > 0.02) e.push(`lantern post centre at ${f2(foot.c[0])},${f2(foot.c[2])}`); }
  done('P13 lighthouse Beam in the lamp room (scene root) + Glow; lantern Glow on the +X arm, post on the origin', e); }

// P14: batch 2 files are clean: one JPEG albedo <= 512 px, the body material named after the id (metallic 0), core glTF (no extensions), every normal unit length (a zero normal renders
// as a black sliver), base on y 0 (the duck's hull dips 0.05 below the waterline)
{ const bad = [];
  for (const id of Object.keys(B2)) { const g = await geo(id); if (!g) { bad.push(id + ' missing'); continue; }
    const R = g.R, e = [], al = R.listTextures().find((t) => /_albedo$/.test(t.getName())), sz = al && al.getSize(), body = R.listMaterials().find((m) => m.getName() === id);
    if (!al || al.getMimeType() !== 'image/jpeg' || Math.max(...sz) > 512) e.push('albedo ' + (sz ? sz.join('x') : 'none'));
    if (!body || body.getMetallicFactor() !== 0) e.push('body material');
    if (R.listExtensionsUsed().length) e.push('extensions');
    let badN = 0; for (const m of R.listMeshes()) for (const p of m.listPrimitives()) { const Nn = p.getAttribute('NORMAL').getArray(); for (let i = 0; i < Nn.length; i += 3) if (!(Math.abs(Math.hypot(Nn[i], Nn[i + 1], Nn[i + 2]) - 1) < 0.01)) badN++; }
    if (badN) e.push(`${badN} bad normals`);
    if (!near0(g.box.mn[1] - (id === 'duck' ? -0.05 : 0), 1e-3)) e.push(`base y ${f3(g.box.mn[1])}`);
    if (e.length) bad.push(`${id}: ${e.join(', ')}`); }
  ok('P14 batch 2 files: JPEG albedo <= 512, body material = id, no extensions, unit normals, base on y 0 (duck -0.05)', !bad.length, bad.join(' | ')); }

// P15: the animals' Head / Tail cuts are clean (close-up review: a goat horn piece floating on the body, a second half-face on the cat's body, jagged shard caps). From each recipe
// (art/meshy/<id>/finish_args.txt): every part has --cut planes; no body vertex lies inside the part's region on the + side of all its planes; no body piece cut off from the body touches a
// part (a stranded horn); every vertex the part shares with the body lies on one of its planes (a flat cut, not a zigzag of whole triangles)
{ const PARTS_OF = { chicken: ['Head'], dog: ['Head', 'Tail'], cat_sleeping: ['Head'], goat: ['Head'] }, bad = [];
  const recipe = (id) => { const s = fs.readFileSync(path.join(projectRoot, 'art', 'meshy', id, 'finish_args.txt'), 'utf8').trim().split(/\s+/), parts = {};
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '--part') { const [name, bx, pv] = s[i + 1].split(':'); (parts[name] ??= { boxes: [], cuts: [], pivot: pv.split(',').map(Number) }).boxes.push(bx.split(',').map(Number)); }
      if (s[i] === '--cut') { const [name, nv, qv] = s[i + 1].split(':'), p = parts[name], n = nv.split(',').map(Number), l = Math.hypot(...n); if (p) p.cuts.push({ n: n.map((v) => v / l), q: qv ? qv.split(',').map(Number) : p.pivot }); } }
    return parts; };
  const k4 = (p) => p.map((v) => Math.round(v * 1e4)).join(',');
  for (const [id, names] of Object.entries(PARTS_OF)) {
    const g = await geo(id); if (!g) { bad.push(id + ' missing'); continue; }
    const R = recipe(id), e = [], BP = g.prims.find((p) => p.node === id).pts, BI = g.R.listNodes().find((n) => n.getName() === id).getMesh().listPrimitives()[0].getIndices().getArray(), partKeys = new Set();
    for (const name of names) for (const p of g.prims.filter((q) => q.node === name)) for (const v of p.upts) partKeys.add(k4(v));
    for (const name of names) {
      const r = R[name]; if (!r || !r.cuts.length) { e.push(`${name}: no --cut plane in the recipe`); continue; }
      const d = (v, c) => c.n[0] * (v[0] - c.q[0]) + c.n[1] * (v[1] - c.q[1]) + c.n[2] * (v[2] - c.q[2]);
      const inReg = (v) => r.boxes.some((b) => v[0] >= b[0] && v[0] <= b[1] && v[1] >= b[2] && v[1] <= b[3] && v[2] >= b[4] && v[2] <= b[5]);
      // tolerances: the stranded-piece pass legitimately leaves a few vertices (a paw-top sliver, a tiny shell below the chin); the defects were ~100 each (goat horn 105, cat half-face 99)
      const left = BP.filter((v) => inReg(v) && r.cuts.every((c) => d(v, c) > 1e-3)).length;
      if (left > 12) e.push(`${name}: ${left} body vertices on the part's side of its cut`);
      const bodyKeys = new Set(BP.map(k4)), ring = g.prims.filter((q) => q.node === name).flatMap((q) => q.upts).filter((v) => bodyKeys.has(k4(v))), off = ring.filter((v) => !r.cuts.some((c) => Math.abs(d(v, c)) < 1e-3)).length;
      if (!ring.length) e.push(`${name}: shares no vertex with the body (no cut ring?)`); else if (off > 0.1 * ring.length) e.push(`${name}: ${off} of ${ring.length} cut-ring vertices off its planes (a zigzag cut)`); }
    // stranded body pieces: welded components of the body other than the largest that touch a part
    const wid = new Map(), id2 = (i) => { const k = k4(BP[i]); if (!wid.has(k)) wid.set(k, wid.size); return wid.get(k); }, par = [];
    const find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    for (let i = 0; i < BP.length; i++) { const w = id2(i); par[w] ??= w; }
    for (let t = 0; t < BI.length; t += 3) { const a = find(id2(BI[t])), b = find(id2(BI[t + 1])), c = find(id2(BI[t + 2])); par[b] = a; par[find(c)] = a; }
    const comp = new Map(); for (const [k, w] of wid) { const r = find(w); (comp.get(r) ?? comp.set(r, []).get(r)).push(k); }
    const stranded = [...comp.values()].sort((x, y) => y.length - x.length).slice(1).filter((c) => c.some((k) => partKeys.has(k)));
    if (stranded.length) e.push(`${stranded.length} body piece(s) cut off from the body touching a part (${stranded.map((c) => c.length)} vertices)`);
    if (e.length) bad.push(`${id}: ${e.join('; ')}`);
  }
  ok('P15 Head / Tail cuts are clean: cut planes, nothing of the part left on the body, no stranded pieces, a flat cut ring', !bad.length, bad.join(' | ')); }

// ---- the painted procedural models (scripts/assets/<id>.mjs) share one small painted atlas generated in code (lib/paintedAtlas.mjs), UV-mapped ----
let ATLAS = null; try { ATLAS = await import('../lib/paintedAtlas.mjs'); } catch (e) { ATLAS = { error: String(e.message || e).split('\n')[0] }; }
async function painted(id) {   // the published file as triangles: world points, uvs, face normal, material
  if (!fs.existsSync(glbPath(id))) return null;
  const R = (await io.read(glbPath(id))).getRoot(), T = [];
  for (const n of R.listNodes()) { const m = n.getMesh(); if (!m) continue; const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { const Pa = p.getAttribute('POSITION'), U = p.getAttribute('TEXCOORD_0'), ix = p.getIndices(), cnt = ix ? ix.getCount() : Pa.getCount();
      for (let k = 0; k + 2 < cnt; k += 3) { const t = { mat: p.getMaterial(), prim: p, p: [], uv: [] };
        for (let j = 0; j < 3; j++) { const i = ix ? ix.getScalar(k + j) : k + j; t.p.push(ev(w, Pa.getElement(i, [0, 0, 0]))); t.uv.push(U ? U.getElement(i, [0, 0]) : null); }
        const [a, b, c] = t.p, e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...nn) || 1;
        t.n = nn.map((v) => v / l); t.c = [0, 1, 2].map((q) => (a[q] + b[q] + c[q]) / 3); T.push(t); } } }
  return { f: glbPath(id), R, T, nodes: R.listNodes().map((n) => n.getName()), box: box(T.flatMap((t) => t.p)), kb: fs.statSync(glbPath(id)).size / 1024 };
}
const sliceAt = (T, h) => { const P = []; for (const t of T) for (let j = 0; j < 3; j++) { const a = t.p[j], b = t.p[(j + 1) % 3];   // where the faces cross y = h, in plan
  if ((a[1] - h) * (b[1] - h) < 0) { const s = (h - a[1]) / (b[1] - a[1]); P.push([a[0] + s * (b[0] - a[0]), a[2] + s * (b[2] - a[2])]); } } return P; };
const heightAt = (T, x, z) => { let top = -Infinity; for (const t of T) { const [a, b, c] = t.p, d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-9) continue;
  const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, l3 = 1 - l1 - l2;
  if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) top = Math.max(top, l1 * a[1] + l2 * b[1] + l3 * c[1]); } return top; };
const pieces = (T) => {   // faces joined by a shared corner: one piece each (e.g. one log end)
  const key = (p) => p.map((v) => Math.round(v * 1e4)).join(','), par = T.map((_, i) => i), at = new Map(), find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  T.forEach((t, i) => t.p.forEach((p) => { const k = key(p); if (at.has(k)) par[find(i)] = find(at.get(k)); else at.set(k, i); }));
  return [...new Set(T.map((_, i) => find(i)))]; };
const clusters = (P, r) => { const C = []; for (const q of P) if (!C.find((k) => Math.hypot(k[0] - q[0], k[1] - q[1]) < r)) C.push([q[0], q[1]]); return C; };
const PAINTED = ['woodshed', 'wetland_jetty', 'barnaby', 'tower_ruin', 'barnaby_camp', 'shelter'];
const published = (id) => { const M = MODELS.find((x) => x.id === id), e = [];
  if (!M) e.push('not in publish-models MODELS'); if (!fs.existsSync(glbPath(id))) e.push('no file'); if (!A[id] || A[id].status !== 'ready') e.push('manifest entry not ready'); return e; };
const inCell = (name) => { const c = ATLAS && ATLAS.CELLS && ATLAS.CELLS[name], S2 = ATLAS && ATLAS.ATLAS_SIZE; return (uv) => !!(c && uv && uv[0] * S2 >= c.x - 0.5 && uv[0] * S2 <= c.x + c.w + 0.5 && uv[1] * S2 >= c.y - 0.5 && uv[1] * S2 <= c.y + c.h + 0.5); };
const painter = (T) => (cell) => T.filter((q) => q.uv.every(inCell(cell)));   // the faces painted with one atlas cell (one part family)
const nearAny = (P, [x, z], r) => P.some((p) => Math.hypot(p[0] - x, p[1] - z) < r);
const PART = LOOK.assetMaterials;   // each part is found by its atlas cell (look.config.mjs assetMaterials) and its spot
const centred = (g, tx, tz) => Math.abs(g.box.c[0]) > tx || Math.abs(g.box.c[2]) > tz;
// the checks every painted model shares: published, base on y 0, <= maxTris, the root node alone (no animated parts: one mesh)
const common = (g, e, id, maxTris, baseTol = 1e-3) => { if (!g) return;
  if (Math.abs(g.box.mn[1]) > baseTol) e.push(`base y ${f3(g.box.mn[1])}`);
  if (g.T.length > maxTris) e.push(`${g.T.length} tris > ${maxTris}`);
  if (g.nodes.join() !== id) e.push(`nodes ${g.nodes} (want the root alone)`); };

// P18: woodshed: a lean-to, origin at the base centre on y 0, front +Z. Posts 1.0 x 0.6 (the section at y 0.3), the whole model <= 1.16 x 0.8 and <= 0.9 tall; the roof slopes down to
// the front (back ~0.82, front ~0.62); 22 ring-painted log ends face +Z; <= 1,500 tris
{ const g = await painted('woodshed'), e = published('woodshed');
  if (g) { const [w, h, d] = g.box.size;
    if (w > 1.16 + 1e-3 || d > 0.8 + 1e-3) e.push(`footprint ${f3(w)} x ${f3(d)} > 1.16 x 0.8`);
    if (h > 0.9 + 1e-3) e.push(`height ${f3(h)} > 0.9`);
    const S = box(sliceAt(g.T, 0.3).map(([x, z]) => [x, 0, z]));
    if (Math.abs(S.size[0] - 1.0) > 0.02 || Math.abs(S.size[2] - 0.6) > 0.02) e.push(`posts ${f3(S.size[0])} x ${f3(S.size[2])} (want 1.0 x 0.6)`);
    if (Math.abs(S.c[0]) > 0.02 || Math.abs(S.c[2]) > 0.02) e.push(`posts centred at ${f3(S.c[0])}, ${f3(S.c[2])} (want the origin)`);
    const back = heightAt(g.T, 0, -0.26), front = heightAt(g.T, 0, 0.26);
    if (!inr(back, 0.78, 0.9) || !inr(front, 0.58, 0.74) || !(back - front >= 0.12)) e.push(`roof ${f3(back)} at the back posts, ${f3(front)} at the front (want ~0.82 / ~0.62)`);
    const rings = Object.keys((ATLAS && ATLAS.CELLS) || {}).filter((k) => /^rings/.test(k)).map(inCell), ends = pieces(g.T.filter((q) => q.n[2] > 0.9 && q.c[2] > 0.1 && q.uv.every((uv) => rings.some((r) => r(uv)))));
    if (ends.length !== 22) e.push(`${ends.length} ring-painted log ends facing +Z (want 22)`);
    common(g, e, 'woodshed', 1500); }
  done('P18 woodshed: published, root node only, posts 1.0 x 0.6, <= 1.16 x 0.8 x 0.9, roof to the front, 22 ring ends on +Z, <= 1,500 tris', e); }

// P18b: the woodshed's parts (found by atlas cell and spot): four posts (one at each corner of the frame, in the y 0.3 section), the stone footing (a low plinth under the whole frame and
// a dark stone pad under each post), the back wall (boards along the back, ~full width, up under the roof) and the axe (handle + head) leaning on the front-left post
{ const g = await painted('woodshed'), e = [];
  if (!g) e.push('missing');
  else { const W = PART.woodshed, of = painter(g.T), corners = [[-0.46, -0.26], [0.46, -0.26], [-0.46, 0.26], [0.46, 0.26]], at = (cs) => cs.map((c) => c.join(',')).join(' / ');
    const postSec = sliceAt(of(W.posts), 0.3), nPost = clusters(postSec, 0.12).length, noPost = corners.filter((c) => !nearAny(postSec, c, 0.06));
    if (nPost !== 4 || noPost.length) e.push(`${nPost} posts at y 0.3 (want 4)${noPost.length ? ', none at ' + at(noPost) : ''}`);
    const plinth = of(W.footing).flatMap((q) => q.p), pb = plinth.length ? box(plinth) : null;
    if (!pb || pb.mx[1] > 0.08 || pb.size[0] < 1.0 || pb.size[2] < 0.6) e.push('footing missing or not >= 1.0 x 0.6 and low');
    const pads = of(W.pads).map((q) => [q.c[0], q.c[2]]), noPad = corners.filter((c) => !nearAny(pads, c, 0.08));
    if (noPad.length) e.push(`no footing stone under the post at ${at(noPad)}`);
    const wall = of(W.wall).flatMap((q) => q.p).filter((p) => p[2] < -0.25), wb = wall.length ? box(wall) : null;
    if (!wb || wb.size[0] < 0.85 || wb.mx[1] < 0.7) e.push('back wall missing or not >= 0.85 wide up under the roof');
    const head = of(W.axeHead).map((q) => q.c), handle = of(W.handle).map((q) => q.c);
    if (!head.length || !handle.length || ![...head, ...handle].every((c) => c[0] < -0.4 && c[2] > 0.2)) e.push(`axe: ${head.length} head / ${handle.length} handle faces (want both, by the front-left post)`); }
  done('P18b woodshed parts: four corner posts, stone footing + a pad under each post, back wall, axe by the front-left post', e); }

// P19: wetland_jetty (y 0 = the waterline): about 0.7 x 1.7 along Z, centred, shore end at -Z; deck top y 0.2, piles down to -0.3 (the y -0.15 section shows all four AND the mooring post, each
// at its spot), mooring post to 0.45; everything standing on the deck (post, bucket, stool) on the far (+Z) half; <= 500 tris
{ const g = await painted('wetland_jetty'), e = published('wetland_jetty');
  if (g) { const [w, , d] = g.box.size;
    if (Math.abs(w - 0.7) > 0.05 || Math.abs(d - 1.7) > 0.05) e.push(`plan ${f3(w)} x ${f3(d)} (want ~0.7 x 1.7)`);
    if (centred(g, 0.02, 0.05)) e.push(`not centred (${f3(g.box.c[0])}, ${f3(g.box.c[2])})`);
    if (Math.abs(g.box.mn[1] + 0.3) > 0.02) e.push(`piles reach y ${f3(g.box.mn[1])} (want -0.3)`);
    if (Math.abs(g.box.mx[1] - 0.45) > 0.02) e.push(`top y ${f3(g.box.mx[1])} (want the mooring post at 0.45)`);
    const hs = []; for (const x of [-0.2, 0, 0.2]) for (let k = 0; k < 12; k++) hs.push(heightAt(g.T, x, -0.75 + k * 0.095));
    const onDeck = hs.filter((y) => inr(y, 0.18, 0.215)).length;
    if (onDeck < 0.8 * hs.length) e.push(`deck top at 0.2 on only ${onDeck} of ${hs.length} samples`);
    const sec = sliceAt(g.T, -0.15), want = [[-0.27, -0.62], [0.27, -0.62], [-0.27, 0.58], [0.27, 0.58], [0.3, 0.74]], gone = want.filter(([x, z]) => !sec.some((p) => Math.hypot(p[0] - x, p[1] - z) < 0.07));
    if (clusters(sec, 0.12).length < 5 || gone.length) e.push(`piles below the water: none at ${gone.map((p) => p.join(',')).join(' / ')} (want 4 piles + the mooring post)`);
    const up = g.T.flatMap((q) => q.p).filter((p) => p[1] > 0.25);
    if (!up.length || up.some((p) => p[2] < 0)) e.push('things on the deck reach into the near (-Z) half');
    common(g, e, 'wetland_jetty', 500, Infinity); }
  done('P19 wetland_jetty: published, root only, ~0.7 x 1.7 centred, deck top 0.2, piles to -0.3, post 0.45, props on the +Z half, <= 500 tris', e); }

// P19b: the jetty's props: a bucket (staves + an iron hoop) and a three-legged stool standing on the far (+Z) half of the deck, and the rope loop round the mooring post (0.30, 0.74)
{ const g = await painted('wetland_jetty'), e = [];
  if (!g) e.push('missing');
  else { const J = PART.wetland_jetty, of = painter(g.T), hiY = (q) => Math.max(q.p[0][1], q.p[1][1], q.p[2][1]);
    const staves = of(J.bucket).filter((q) => hiY(q) > 0.25), hoop = of(J.hoops), stool = of(J.stool), rope = of(J.rope);   // (the deck patch shares the bucket's cell, at deck height)
    const onFar = (F) => F.length > 0 && F.every((q) => q.c[2] > 0 && q.c[1] > 0.15);
    if (staves.length < 8 || !onFar(staves) || !onFar(hoop)) e.push(`bucket: ${staves.length} stave / ${hoop.length} hoop faces (want both, on the deck's +Z half)`);
    const sb = stool.length ? box(stool.flatMap((q) => q.p)) : null, seat = stool.filter((q) => q.n[1] > 0.9 && q.c[1] > 0.28);   // (the legs have no caps)
    if (!sb || !onFar(stool) || sb.size[1] < 0.12 || seat.length < 3) e.push(`stool: ${stool.length} faces, ${seat.length} seat-top faces (want a seat on legs on the deck's +Z half)`);
    if (!rope.length || !rope.every((q) => Math.hypot(q.c[0] - 0.3, q.c[2] - 0.74) < 0.12)) e.push(`rope: ${rope.length} faces (want a loop round the mooring post at 0.30, 0.74)`); }
  done('P19b wetland_jetty props: a bucket with its hoop and a stool on the +Z half, a rope loop round the mooring post', e); }

// P20: the painted atlas: each painted model has one material with one embedded colour texture <= 512 px (the same atlas bytes in all: one shared generator), every primitive UV-mapped
// inside it; <= 200 KB; and a rebuild from scripts/assets is byte-identical to the published file (deterministic: seeded, no clock)
{ const bad = [], imgs = [];
  if (!ATLAS || ATLAS.error) bad.push(`lib/paintedAtlas.mjs: ${ATLAS ? ATLAS.error : 'missing'}`);
  for (const id of PAINTED) { const g = await painted(id); if (!g) { bad.push(id + ' missing'); continue; }
    const tx = g.R.listTextures(), mats = g.R.listMaterials(), e = [], sz = tx[0] && tx[0].getSize();
    if (tx.length !== 1) e.push(`${tx.length} textures`);
    if (!sz || Math.max(...sz) > 512) e.push(`texture ${sz ? sz.join('x') : 'none'}`); if (tx[0]) imgs.push(tx[0].getImage());
    if (mats.length !== 1 || !mats[0].getBaseColorTexture()) e.push(`${mats.length} materials (want one, textured)`);
    if (mats.some((m) => /^(Glow|Glass)$/.test(m.getName()))) e.push('a Glow / Glass material (the game would swap it)');
    const uvBad = g.T.filter((q) => q.uv.some((u) => !u || u[0] < 0 || u[0] > 1 || u[1] < 0 || u[1] > 1)).length; if (uvBad) e.push(`${uvBad} faces without uvs in 0..1`);
    if (g.kb > 200) e.push(`${Math.round(g.kb)} KB > 200`);
    try { const mod = (await import(`../assets/${id}.mjs`)).default, tmp = path.join(os.tmpdir(), `painted-${id}-${process.pid}.glb`);
      await buildAsset(mod, tmp); const same = Buffer.compare(fs.readFileSync(tmp), fs.readFileSync(g.f)) === 0; fs.rmSync(tmp, { force: true });
      if (!same) e.push('a rebuild differs from the published file'); } catch (err) { e.push(`rebuild failed: ${String(err.message || err).split('\n')[0]}`); }
    if (e.length) bad.push(`${id}: ${e.join(', ')}`); }
  if (imgs.some((im) => Buffer.compare(Buffer.from(imgs[0]), Buffer.from(im)) !== 0)) bad.push('the painted models carry different atlases');
  ok('P20 painted atlas: one textured material, one shared texture <= 512 px, uvs in it, <= 200 KB, rebuild byte-identical', !bad.length, bad.join(' | ')); }

// P21: barnaby: ~1.0 u tall (0.95-1.1), origin at his feet, one rigid mesh on a single root node (the game rocks the whole figure), every vertex within 0.5 u of the y axis (the tap ball /
// silhouette rule), his eyes (the only DeepWarmInk) high on the centre line toward +Z, <= 1,500 tris
{ const g = await painted('barnaby'), e = published('barnaby');
  if (g) { const h = g.box.size[1], rMax = Math.max(...g.T.flatMap((q) => q.p).map((p) => Math.hypot(p[0], p[2])));
    if (!inr(h, 0.95, 1.1)) e.push(`height ${f3(h)} not in 0.95-1.1`);
    if (rMax > 0.5) e.push(`a vertex ${f3(rMax)} u from the y axis (> 0.5)`);
    const eyes = g.T.filter((q) => q.uv.every(inCell('swatch_DeepWarmInk'))), sc = eyes.length ? box(eyes.flatMap((q) => q.p)).c : null;
    if (!sc || sc[2] <= 0.05 || sc[1] < 0.55 || Math.abs(sc[0]) > 0.03) e.push(`eyes (the DeepWarmInk dots) ${sc ? 'at ' + sc.map(f2) : 'missing'} (want high up, on the centre line, toward +Z)`);
    common(g, e, 'barnaby', 1500); }
  done('P21 barnaby: published, single root node, 0.95-1.1 tall on y 0, within 0.5 u of the y axis, eyes toward +Z, <= 1,500 tris', e); }

// P21b: the manifest note states how far from his axis Barnaby reaches, and that is the number the game places him by: the real widest point rounded up to the hundredth (not tighter than
// the model, nor more than 0.01 u looser), and the manifest carries the note publish-models.mjs states
{ const g = await painted('barnaby'), M = MODELS.find((x) => x.id === 'barnaby'), e = [], note = (A.barnaby && A.barnaby.notes) || '', m = /within ([0-9.]+) u of the y axis/.exec(note), said = m ? +m[1] : NaN;
  if (g) { const rMax = Math.max(...g.T.flatMap((q) => q.p).map((p) => Math.hypot(p[0], p[2])));
    if (!m) e.push('the manifest note names no reach ("within X u of the y axis")');
    else if (!(said >= rMax - 1e-9 && said - rMax <= 0.01 + 1e-9)) e.push(`the manifest note says within ${said} u of the y axis; the model's widest point is ${f3(rMax)} (want ${(Math.ceil(rMax * 100 - 1e-9) / 100).toFixed(2)})`);
    if (!M || M.notes !== note) e.push('the manifest note differs from the MODELS note in publish-models.mjs'); }
  ok('P21b barnaby: the manifest note states his real reach from the y axis (to the hundredth) and is publish-models.mjs\'s note', g && !e.length, e.join(', ')); }

// P22: tower_ruin: a round tower's broken base, ~2.0 across, <= 1.4 tall, centred. The back wall (-Z) is the tallest (1.2-1.4 over (0, -0.85)) with its inner face ~0.73 u from the centre, the
// sides fall to knee height (<= 0.6), the front is open: no vertex above y 0.3 within 40 degrees of +Z. Barnaby's spot (0, -0.40) stays clear (nothing above y 0.06 within 0.2 u). <= 3,000 tris
{ const g = await painted('tower_ruin'), e = published('tower_ruin');
  if (g) { const [w, h, d] = g.box.size, pts = g.T.flatMap((q) => q.p), across = Math.max(w, d);
    if (!inr(across, 1.85, 2.15)) e.push(`${f3(across)} across (want ~2.0)`);
    if (h > 1.4 + 1e-3) e.push(`height ${f3(h)} > 1.4`);
    if (Math.abs(g.box.c[0]) > 0.1 || !inr(g.box.mn[2], -1.1, -0.9)) e.push(`not centred: x centre ${f3(g.box.c[0])}, back z ${f3(g.box.mn[2])}`);
    const front = pts.filter((p) => p[1] > 0.3 && Math.hypot(p[0], p[2]) > 0.05 && Math.abs(Math.atan2(p[0], p[2])) < (40 * Math.PI) / 180);
    if (front.length) e.push(`${front.length} vertices above y 0.3 in the open-front sector`);
    const back = heightAt(g.T, 0, -0.85), sides = Math.max(heightAt(g.T, 0.85, 0), heightAt(g.T, -0.85, 0));
    if (!inr(back, 1.2, 1.4)) e.push(`back wall ${f3(back)} tall at (0, -0.85) (want 1.2-1.4)`);
    if (!(sides <= 0.6)) e.push(`sides ${f3(sides)} tall at (+-0.85, 0) (want knee height, <= 0.6)`);
    const inner = Math.max(...sliceAt(g.T, 0.6).filter(([x, z]) => Math.abs(x) < 0.12 && z < 0).map(([, z]) => z));
    if (!inr(inner, -0.78, -0.68)) e.push(`back wall's inner face at z ${f3(inner)} (want ~-0.73)`);
    const spot = []; for (let k = 0; k < 25; k++) { const a = k * 2.4, rr = 0.2 * Math.sqrt(k / 24); spot.push(heightAt(g.T, rr * Math.sin(a), -0.4 + rr * Math.cos(a))); }
    if (Math.max(...spot) > 0.06) e.push(`Barnaby's spot (0, -0.40) not clear (${f3(Math.max(...spot))} high)`);
    common(g, e, 'tower_ruin', 3000, 0.05); }
  done('P22 tower_ruin: published, root only, ~2.0 across, <= 1.4 tall, back wall 1.2-1.4 (inner face ~0.73), knee-high sides, open +Z front, spot clear, <= 3,000 tris', e); }

// P22b: Barnaby's feet: at his stand (RUIN.spot) his robe hem reaches his model's widest point (0.256 u) at ankle height, so no fallen stone may stand higher than 0.02 u inside that
// circle + a finger's width (0.27); the radius is checked against the published barnaby so the guard cannot go stale if his robe grows
{ const g = await painted('tower_ruin'), b = await painted('barnaby'), e = [], R_CLEAR = 0.27, Y_CLEAR = 0.02, { RUIN } = await import('../assets/tower_ruin.mjs');
  if (g && b) { const hem = Math.max(...b.T.flatMap((q) => q.p).map((p) => Math.hypot(p[0], p[2]))), [sx, sz] = RUIN.spot;
    if (!(hem <= R_CLEAR)) e.push(`barnaby reaches ${f3(hem)} u from his axis, past the ${R_CLEAR} u this guard keeps clear`);
    const under = g.T.flatMap((q) => q.p).filter((p) => p[1] > Y_CLEAR && Math.hypot(p[0] - sx, p[2] - sz) < R_CLEAR);
    if (under.length) e.push(`${under.length} ruin vertices above y ${Y_CLEAR} within ${R_CLEAR} u of (${sx}, ${sz}), up to y ${f3(Math.max(...under.map((p) => p[1])))}`); }
  ok(`P22b tower_ruin: no vertex above y ${Y_CLEAR} within ${R_CLEAR} u of Barnaby's spot (his hem clears the stones)`, g && b && !e.length, e.join(', ')); }

// P23: barnaby_camp: a lean-to over a bedroll, ~1.0 x 0.7 u (+-0.08) centred, base on y 0, open front +Z (the tarp slopes down to the back), <= 1.0 tall, <= 1,500 tris
{ const g = await painted('barnaby_camp'), e = published('barnaby_camp');
  if (g) { const [w, h, d] = g.box.size;
    if (Math.abs(w - 1.0) > 0.08 || Math.abs(d - 0.7) > 0.08) e.push(`footprint ${f3(w)} x ${f3(d)} (want ~1.0 x 0.7)`);
    if (centred(g, 0.05, 0.05)) e.push(`not centred (${f3(g.box.c[0])}, ${f3(g.box.c[2])})`);
    if (h > 1.0) e.push(`height ${f3(h)} > 1.0`);
    const hb = heightAt(g.T, 0, -0.25), hf = heightAt(g.T, 0, 0.05);
    if (!(hf - hb >= 0.1)) e.push(`the tarp does not slope to the back (${f3(hf)} at z 0.05, ${f3(hb)} at z -0.25)`);
    common(g, e, 'barnaby_camp', 1500); }
  done('P23 barnaby_camp: published, root only, ~1.0 x 0.7 centred, base y 0, tarp sloping to the back (open +Z), <= 1.0 tall, <= 1,500 tris', e); }

// ---- the meadow shelter: a painted sheep lean-to, published as `shelter` and byte for byte as `sheep_shelter` ----
const missingGlb = (g, id) => (g ? [] : [`missing ${id}.glb`]);

// M-SH1: the bounds: x 1.4 +- 0.08, z 1.1 +- 0.08, height 1.35 +- 0.05, centred on the origin (<= 0.05), base on y 0 (+- 0.005); fits the meadow's flat zone `shelter` (r 1.1)
{ const g = await painted('shelter'), e = [...missingGlb(g, 'shelter'), ...published('shelter')];
  if (g) { const [w, h, d] = g.box.size;
    if (Math.abs(w - 1.4) > 0.08 || Math.abs(d - 1.1) > 0.08) e.push(`footprint ${f3(w)} x ${f3(d)} (want 1.4 x 1.1 +- 0.08)`);
    if (Math.abs(h - 1.35) > 0.05) e.push(`height ${f3(h)} (want 1.35 +- 0.05)`);
    if (centred(g, 0.05, 0.05)) e.push(`not centred (${f3(g.box.c[0])}, ${f3(g.box.c[2])})`);
    if (Math.abs(g.box.mn[1]) > 0.005) e.push(`base y ${f3(g.box.mn[1])} (want 0)`); }
  done('M-SH1 shelter: published, 1.4 x 1.1 (+- 0.08) x 1.35 (+- 0.05) tall, centred on the origin, base on y 0', e); }

// M-SH2: <= 600 tris, exactly one material and it carries the painted atlas texture (the same JPEG bytes lib/paintedAtlas.mjs paints), no Glow material, root node only
{ const g = await painted('shelter'), e = missingGlb(g, 'shelter');
  if (g) { const mats = g.R.listMaterials(), tex = mats[0] && mats[0].getBaseColorTexture();
    if (g.T.length > 600) e.push(`${g.T.length} tris > 600`);
    if (mats.length !== 1) e.push(`${mats.length} materials (want one)`);
    if (!tex) e.push('no baseColor texture');
    else if (!ATLAS || ATLAS.error || Buffer.compare(Buffer.from(tex.getImage()), Buffer.from(ATLAS.atlasJpeg())) !== 0) e.push('the texture is not the painted atlas');
    if (mats.some((m) => m.getName() === 'Glow')) e.push('a Glow material');
    if (g.nodes.join() !== 'shelter') e.push(`nodes ${g.nodes} (want the root alone)`); }
  done('M-SH2 shelter: <= 600 tris, one material carrying the painted atlas, no Glow, root node only', e); }

// M-SH3: the open front is +Z: the roof's highest vertex has z > 0; over the back half (z < -0.3) the geometry rises to >= 0.6 (the back wall); over the front half (z > 0.3, |x| < 0.5) nothing
// lies between y 0.15 and 0.9 (faces sampled, not just their corners); the y 0.7 section over z > 0.3 shows exactly two posts, one each side at |x| > 0.5
{ const g = await painted('shelter'), e = missingGlb(g, 'shelter');
  if (g) { const pts = g.T.flatMap((q) => q.p), top = pts.reduce((a, p) => (p[1] > a[1] ? p : a));
    if (!(top[2] > 0)) e.push(`the roof's highest vertex is at z ${f3(top[2])} (want > 0: high at the open front)`);
    const backTop = Math.max(...pts.filter((p) => p[2] < -0.3).map((p) => p[1]));
    if (!(backTop >= 0.6)) e.push(`the back half rises to y ${f3(backTop)} (want >= 0.6: the back wall)`);
    const inOpen = (p) => p[2] > 0.3 && Math.abs(p[0]) < 0.5 && p[1] > 0.15 && p[1] < 0.9, hits = [];
    for (const q of g.T) { const [a, b, c] = q.p;
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8 - i; j++) { const u = i / 8, v = j / 8, w = 1 - u - v; if (inOpen([0, 1, 2].map((k) => u * a[k] + v * b[k] + w * c[k]))) { hits.push(q); i = 9; break; } } }
    if (hits.length) e.push(`${hits.length} faces in the open front (z > 0.3, |x| < 0.5, y 0.15-0.9)`);
    const posts = clusters(sliceAt(g.T, 0.7).filter(([, z]) => z > 0.3), 0.15);
    if (posts.length !== 2 || !posts.some(([x]) => x < -0.5) || !posts.some(([x]) => x > 0.5)) e.push(`the y 0.7 section over z > 0.3 shows ${posts.length} posts at x ${posts.map(([x]) => f2(x))} (want two, at |x| > 0.5)`); }
  done('M-SH3 shelter: open front +Z: roof highest at the front, back wall >= 0.6, nothing in the opening but the two posts at |x| > 0.5', e); }

// M-SH4: sheep_shelter is the identical file (the same bytes as shelter.glb), and the manifest has both ids ready
{ const e = [];
  for (const id of ['shelter', 'sheep_shelter']) for (const p of published(id)) e.push(`${id}: ${p}`);
  if (!e.length && Buffer.compare(fs.readFileSync(glbPath('shelter')), fs.readFileSync(glbPath('sheep_shelter'))) !== 0) e.push('sheep_shelter.glb differs from shelter.glb');
  done('M-SH4 sheep_shelter.glb has the same bytes as shelter.glb, both ids ready in the manifest', e); }

// M-SH5: the hay stays inside the accent band (guard on the model as built). The hay is the atlas's `paper` cell tinted gold through COLOR_0, rendered colour = texel x COLOR_0 in linear light.
// Every triangle whose uvs all lie in the paper cell is sampled at 28 barycentric points (atlas JPEG texel, nearest; sRGB -> linear, x interpolated COLOR_0, -> sRGB -> HSV): the
// area-weighted mean saturation must be <= 0.68 and no sample over 0.70 (accents <= 0.70)
{ const e = [];
  if (!fs.existsSync(glbPath('shelter'))) e.push('missing shelter.glb');
  else {
    const R = (await io.read(glbPath('shelter'))).getRoot(), inPaper = inCell('paper');
    const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4), toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
    let sumA = 0, sumAS = 0, maxS = 0, nTri = 0;
    for (const m of R.listMeshes()) for (const p of m.listPrimitives()) {
      const t = p.getMaterial() && p.getMaterial().getBaseColorTexture(), P = p.getAttribute('POSITION'), U = p.getAttribute('TEXCOORD_0'), C = p.getAttribute('COLOR_0'), ix = p.getIndices();
      if (!t || !U || !C) continue;
      const img = jpeg.decode(Buffer.from(t.getImage()), { useTArray: true, formatAsRGBA: true }), cnt = ix ? ix.getCount() : P.getCount();
      for (let k = 0; k + 2 < cnt; k += 3) {
        const v = [0, 1, 2].map((j) => (ix ? ix.getScalar(k + j) : k + j)), uv = v.map((i) => U.getElement(i, [0, 0]));
        if (!uv.every(inPaper)) continue;
        const pp = v.map((i) => P.getElement(i, [0, 0, 0])), cc = v.map((i) => C.getElement(i, [0, 0, 0, 1]));
        const e1 = [0, 1, 2].map((q) => pp[1][q] - pp[0][q]), e2 = [0, 1, 2].map((q) => pp[2][q] - pp[0][q]);
        const area = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2; if (!(area > 0)) continue;
        let sTri = 0, n = 0;
        for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6 - i; j++) {   // 28 barycentric points (the corners and edges included)
          const w = [i / 6, j / 6, 1 - i / 6 - j / 6], u = w[0] * uv[0][0] + w[1] * uv[1][0] + w[2] * uv[2][0], vv = w[0] * uv[0][1] + w[1] * uv[1][1] + w[2] * uv[2][1];
          const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width))), y = Math.min(img.height - 1, Math.max(0, Math.floor(vv * img.height))), o = (y * img.width + x) * 4;
          const rgb = [0, 1, 2].map((ch) => toSrgb(Math.min(1, toLin(img.data[o + ch] / 255) * (w[0] * cc[0][ch] + w[1] * cc[1][ch] + w[2] * cc[2][ch]))));
          const mx = Math.max(...rgb), s = mx > 0 ? (mx - Math.min(...rgb)) / mx : 0;
          sTri += s; n++; if (s > maxS) maxS = s; }
        sumA += area; sumAS += area * (sTri / n); nTri++; } }
    const mean = sumA ? sumAS / sumA : NaN;
    if (!nTri) e.push('no hay triangles (uvs in the paper cell) found');
    if (!(mean <= 0.68)) e.push(`hay mean saturation ${f3(mean)} > 0.68`);
    if (!(maxS <= 0.70)) e.push(`a hay sample at saturation ${f3(maxS)} > 0.70 (the accent band)`); }
  done('M-SH5 shelter hay (paper cell x COLOR_0, linear): area-weighted mean saturation <= 0.68, no sample over 0.70', e); }

// ---- the brown hare (visitor_hare): Meshy, finished by scripts/meshy/finish.mjs; UNRIGGED here (the animal-rigs toolkit re-skins it later) ----
// M-HA1: sitting up: height 0.45 +- 0.04, length (z) 0.22-0.32, width (x) 0.20-0.30 (the turned ear spreads sideways); the head is at +Z: the top-most vertex (an ear tip) has z > 0
{ const g = await geo('visitor_hare'), e = missingGlb(g, 'visitor_hare');
  if (g) { const [w, h, d] = g.box.size, top = g.prims.flatMap((p) => p.upts).reduce((a, p) => (p[1] > a[1] ? p : a));
    if (!inr(w, 0.20, 0.30)) e.push(`width (x) ${f3(w)} not in 0.20-0.30`);
    if (Math.abs(h - 0.45) > 0.04) e.push(`height ${f3(h)} (want 0.45 +- 0.04)`);
    if (!inr(d, 0.22, 0.32)) e.push(`length (z) ${f3(d)} not in 0.22-0.32`);
    if (!(top[2] > 0)) e.push(`the top-most vertex is at z ${f3(top[2])} (want > 0: the head at +Z)`); }
  done('M-HA1 visitor_hare: width 0.20-0.30, height 0.45 +- 0.04, length 0.22-0.32, head at +Z', e); }

// M-HA2: seated, not balanced: min y = 0 +- 0.005 (nothing below -0.01 u) and at least 30 vertices within 0.01 u of y 0 (the feet and the rump on the ground, not one point)
{ const g = await geo('visitor_hare'), e = missingGlb(g, 'visitor_hare');
  if (g) { const onGround = g.prims.flatMap((p) => p.upts).filter((p) => Math.abs(p[1]) <= 0.01).length;
    if (Math.abs(g.box.mn[1]) > 0.005) e.push(`min y ${f3(g.box.mn[1])} (want 0 +- 0.005)`);
    if (onGround < 30) e.push(`${onGround} vertices within 0.01 u of y 0 (want >= 30)`); }
  done('M-HA2 visitor_hare: base on y 0 (+- 0.005), >= 30 vertices within 0.01 u of the ground', e); }

// M-HA3: the animal class budgets: <= 1,500 tris, <= 200 KB, one material carrying one texture <= 512 px, and no skin, joints or weights (the rig task adds them)
{ const g = await geo('visitor_hare'), e = missingGlb(g, 'visitor_hare');
  if (g) { const t = g.R.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((q, p) => q + p.getIndices().getCount() / 3, 0), 0), mats = g.R.listMaterials(), tex = g.R.listTextures(), sz = tex.map((x) => x.getSize());
    if (!(t <= 1500)) e.push(`${t} tris > 1,500`);
    if (g.kb > 200) e.push(`${Math.round(g.kb)} KB > 200`);
    if (mats.length !== 1) e.push(`${mats.length} materials (want one)`);
    if (tex.length !== 1 || !mats[0] || !mats[0].getBaseColorTexture()) e.push(`${tex.length} textures (want one, the material's baseColor)`);
    if (sz.some((s) => !s || Math.max(...s) > 512)) e.push(`texture ${sz.map((s) => (s ? s.join('x') : '?'))} (want <= 512 px)`);
    if (g.R.listSkins().length || g.R.listMeshes().some((m) => m.listPrimitives().some((p) => p.getAttribute('JOINTS_0') || p.getAttribute('WEIGHTS_0')))) e.push('has a skin / joints (the rig task adds them)'); }
  done('M-HA3 visitor_hare: <= 1,500 tris, <= 200 KB, one material with one texture <= 512 px, no skin or bones', e); }

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
