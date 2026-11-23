// bake.test.mjs -- the baked blueprint pieces: public/models/piece_<id>.glb + .height.bin + manifest entries (made by bake-pieces.mjs
// from lib/bake.mjs). Every check reads the FILES the game loads; the full-resolution core is only the reference. Pure node, ~10 s.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import GT from '../lib/terrain.mjs';
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'), MODELS = path.join(ROOT, 'public', 'models');
const A = W3.archipelago, B = A.blueprint, TAG = GT.TAG;
const IDS = ['main', 'meadow', 'wetland', 'cottage', 'highland', 'orchard', 'grove', 'islet'];
const JP = JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'config', 'blueprint.pieces.json'), 'utf8')).pieces;
const GENTLE = B.gentleSlope, SPACING = 0.25;
const BUDGET = { main: 10000, petal: [3000, 6000], total: 50000 };
const KB_CAP = { highland: 295 };   // highland keeps its v1 top, so its file is ~295 KB (buyable in the alpha)
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
const riseRun = (ny) => Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(1e-9, ny);
const pct = (arr, p) => { if (!arr.length) return NaN; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : String(v));
const srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const cscale = (C) => ({ 5121: 255, 5123: 65535 }[C.getComponentType()] || 1);
const isRock = (m) => m[0] >= m[1] && m[0] - m[2] > 0.03;   // red above green and blue: reads as rock, not grass
const isIdentity = (n) => n.getTranslation().every((v) => v === 0) && n.getRotation().join() === '0,0,0,1' && n.getScale().join() === '1,1,1';
const sumTri = (o) => Object.values(o.skirts).reduce((s, q) => s + (q.nTri || 0), 0);
const triNormal = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
const weld = (P) => { const ids = new Map(), pid = new Int32Array(P.length / 3), up = [];   // positions welded to unique points by exact float32 bits
  for (let v = 0; v < pid.length; v++) { const k = P[v * 3] + ',' + P[v * 3 + 1] + ',' + P[v * 3 + 2]; let i = ids.get(k); if (i === undefined) { i = up.length / 3; ids.set(k, i); up.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } pid[v] = i; }
  return { U: Float64Array.from(up), pid }; };

async function loadPiece(id) {
  const file = path.join(MODELS, `piece_${id}.glb`), hfile = path.join(MODELS, `piece_${id}.height.bin`);
  if (!fs.existsSync(file)) return { id, missing: `no ${path.relative(ROOT, file)}` };
  const bytes = fs.readFileSync(file), doc = await new NodeIO().readBinary(new Uint8Array(bytes)), root = doc.getRoot();
  const meshes = root.listMeshes(), mesh = meshes.find((m) => m.getName() === 'piece_' + id) || meshes[0], prims = mesh ? mesh.listPrimitives() : [], prim = prims[0];
  const pa = prim && prim.getAttribute('POSITION'), ia = prim && prim.getIndices();
  if (!pa || !ia) return { id, missing: 'no POSITION / indices', bytes, doc, meshes, prims };
  const P = pa.getArray(), I = ia.getArray(), nTri = I.length / 3, { U, pid } = weld(P), F = Int32Array.from(I, (v) => pid[v]);
  const extras = mesh.getExtras() || {}, fr = extras.faceRanges || null, tag = new Uint8Array(nTri).fill(255);
  if (fr) for (const [name, [first, count]] of Object.entries(fr)) for (let t = first; t < first + count; t++) tag[t] = TAG[name];
  const fN = new Float64Array(nTri * 4);
  for (let t = 0; t < nTri; t++) {
    const pt = (k) => [U[F[t * 3 + k] * 3], U[F[t * 3 + k] * 3 + 1], U[F[t * 3 + k] * 3 + 2]], n = triNormal(pt(0), pt(1), pt(2)), l = Math.hypot(...n) || 1e-30;
    fN.set([n[0] / l, n[1] / l, n[2] / l, 0.5 * l], t * 4);
  }
  const tops = []; for (let t = 0; t < nTri; t++) if (tag[t] === TAG.top) tops.push(t);
  const pc = { id, file, hfile, bytes, doc, root, meshes, mesh, prims, prim, P, I, nTri, U, F, tag, fN, tops, extras, pivot: JP[id].dockedPosition };
  pc.sample = makeSampler(U, F, tops);
  if (fs.existsSync(hfile)) { const hb = fs.readFileSync(hfile); pc.hbytes = hb; pc.grid = new Float32Array(hb.buffer.slice(hb.byteOffset, hb.byteOffset + hb.byteLength)); }
  pc.node = root.listNodes().find((n) => n.getMesh() === mesh) || null;
  pc.skirts = {};   // open-seam skirts: child nodes skirt_<neighbourId> of the piece node, each with its own mesh
  for (const ch of pc.node ? pc.node.listChildren() : []) {
    if (!/^skirt_/.test(ch.getName())) continue;
    const sm = ch.getMesh(), sp = sm && sm.listPrimitives()[0], name = ch.getName().slice(6);
    if (!sp || !sp.getAttribute('POSITION') || !sp.getIndices()) { pc.skirts[name] = { node: ch, mesh: sm, broken: true }; continue; }
    const SI = sp.getIndices().getArray(), SN = sp.getAttribute('NORMAL');
    pc.skirts[name] = { node: ch, mesh: sm, prim: sp, P: sp.getAttribute('POSITION').getArray(), I: SI, N: SN && SN.getArray(), C: sp.getAttribute('COLOR_0'), nTri: SI.length / 3 };
  }
  return pc;
}
// exact sampler on a set of faces: (x, z) -> { y, t } (barycentric on the covering face) or null outside
function makeSampler(U, F, list) {
  const bbox = (t) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let k = 0; k < 3; k++) { const i = F[t * 3 + k] * 3; x0 = Math.min(x0, U[i]); x1 = Math.max(x1, U[i]); z0 = Math.min(z0, U[i + 2]); z1 = Math.max(z1, U[i + 2]); } return [x0, x1, z0, z1]; };
  let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
  for (const t of list) { const [x0, x1, z0, z1] = bbox(t); minx = Math.min(minx, x0); maxx = Math.max(maxx, x1); minz = Math.min(minz, z0); maxz = Math.max(maxz, z1); }
  const cs = 0.5, nx = Math.max(1, Math.ceil((maxx - minx) / cs) + 1), nz = Math.max(1, Math.ceil((maxz - minz) / cs) + 1), cells = new Array(nx * nz);
  for (const t of list) { const [x0, x1, z0, z1] = bbox(t);
    for (let gx = Math.floor((x0 - minx) / cs); gx <= Math.floor((x1 - minx) / cs); gx++) for (let gz = Math.floor((z0 - minz) / cs); gz <= Math.floor((z1 - minz) / cs); gz++) (cells[gz * nx + gx] || (cells[gz * nx + gx] = [])).push(t); }
  const fn = (x, z) => {
    const gx = Math.floor((x - minx) / cs), gz = Math.floor((z - minz) / cs);
    if (gx < 0 || gz < 0 || gx >= nx || gz >= nz) return null;
    const cl = cells[gz * nx + gx]; if (!cl) return null;
    let best = null, bestMin = -1e9;
    for (const t of cl) {
      const a = F[t * 3] * 3, b = F[t * 3 + 1] * 3, c = F[t * 3 + 2] * 3, x0 = U[a], z0 = U[a + 2], x1 = U[b], z1 = U[b + 2], x2 = U[c], z2 = U[c + 2];
      const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2); if (Math.abs(det) < 1e-14) continue;
      const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / det, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / det, l2 = 1 - l0 - l1, mn = Math.min(l0, l1, l2);
      if (mn > bestMin) { bestMin = mn; best = { y: l0 * U[a + 1] + l1 * U[b + 1] + l2 * U[c + 1], t }; if (mn >= 0) break; }
    }
    return bestMin >= -1e-9 ? best : null;
  };
  fn.bounds = [minx, minz, maxx, maxz];
  return fn;
}
// directed top-boundary edges [a, b] (unique-position ids) of a piece
function topBoundary(pc) {
  const cnt = new Map(), key = (a, b) => (a < b ? a + '_' + b : b + '_' + a), edges = [];
  for (const t of pc.tops) for (let k = 0; k < 3; k++) { const a = pc.F[t * 3 + k], b = pc.F[t * 3 + (k + 1) % 3]; cnt.set(key(a, b), (cnt.get(key(a, b)) || 0) + 1); edges.push([a, b]); }
  return edges.filter(([a, b]) => cnt.get(key(a, b)) === 1);
}
// world-space point lookup with tolerance (spatial hash, 0.01 u buckets)
function pointIndex(pts) {
  const m = new Map(), cs = 0.01, key = (i, j, k) => i + ',' + j + ',' + k;
  pts.forEach((p, n) => { const k = key(Math.floor(p[0] / cs), Math.floor(p[1] / cs), Math.floor(p[2] / cs)); (m.get(k) || m.set(k, []).get(k)).push(n); });
  return (p, tol) => {
    const i0 = Math.floor(p[0] / cs), j0 = Math.floor(p[1] / cs), k0 = Math.floor(p[2] / cs); let best = -1, bd = tol;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const n of m.get(key(i0 + a, j0 + b, k0 + c)) || []) { const q = pts[n], d = Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]), Math.abs(q[2] - p[2])); if (d <= bd) { bd = d; best = n; } }
    return best < 0 ? null : { n: best, d: bd };
  };
}
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-18, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
const polyDist = (x, z, pl) => { let d = 1e18; for (let i = 0; i < pl.length - 1; i++) d = Math.min(d, segDist(x, z, pl[i], pl[i + 1])); return d; };
// signed horizontal distance to a polyline (sign: left (+) / right (-) of its direction)
function sideOf(pl, x, z) {
  let best = 1e18, sgn = 1;
  for (let i = 0; i < pl.length - 1; i++) { const a = pl[i], b = pl[i + 1], d = segDist(x, z, a, b); if (d < best) { best = d; sgn = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) >= 0 ? 1 : -1; } }
  return best * sgn;
}
// outermost ray hit from the local origin at angle th on a closed polygon [[x, z]...]
function rayR(loop, th) {
  const dx = Math.cos(th), dz = Math.sin(th); let best = null;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length], ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex; if (Math.abs(den) < 1e-14) continue;
    const r = (a[0] * ez - a[1] * ex) / den, s = Math.abs(ex) > Math.abs(ez) ? (r * dx - a[0]) / ex : (r * dz - a[1]) / ez;
    if (r > 0 && s >= -1e-9 && s <= 1 + 1e-9 && (best == null || r > best)) best = r;
  }
  return best;
}
// deterministic sample points on a piece's top faces: every centroid + 2 random barycentric points per face
function topPoints(pc, seed) {
  const rng = GT.mulberry32(seed), out = [], U = pc.U;
  for (const t of pc.tops) {
    const a = pc.F[t * 3] * 3, b = pc.F[t * 3 + 1] * 3, c = pc.F[t * 3 + 2] * 3;
    for (let s = 0; s < 3; s++) { let u, v; if (s === 0) { u = v = 1 / 3; } else { u = rng(); v = rng(); if (u + v > 1) { u = 1 - u; v = 1 - v; } } const w = 1 - u - v;
      out.push({ x: U[a] * w + U[b] * u + U[c] * v, z: U[a + 2] * w + U[b + 2] * u + U[c + 2] * v, y: U[a + 1] * w + U[b + 1] * u + U[c + 1] * v, t }); }
  }
  return out;
}
const worldOf = (pc, i) => [pc.U[i * 3] + pc.pivot[0], pc.U[i * 3 + 1] + pc.pivot[1], pc.U[i * 3 + 2] + pc.pivot[2]];
const worldPts = (P, pv) => { const pts = []; for (let i = 0; i < P.length; i += 3) pts.push([P[i] + pv[0], P[i + 1] + pv[1], P[i + 2] + pv[2]]); return pts; };
// a game camera (fov 30, looking at tgt from azimuth az and polar pol) -> NDC projector
function project(dist, w, h, pol = 1.07, az = Math.PI / 4, tgt = [0, -0.6, 0]) {
  const eye = [tgt[0] + dist * Math.sin(pol) * Math.sin(az), tgt[1] + dist * Math.cos(pol), tgt[2] + dist * Math.sin(pol) * Math.cos(az)];
  const f = [tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]], fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
  const r = [-f[2], 0, f[0]], rl = Math.hypot(...r); r[0] /= rl; r[1] /= rl; r[2] /= rl;
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]], ty = Math.tan(15 * Math.PI / 180), tx = ty * w / h;
  return (p) => { const d = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]; return [(d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (z * tx), (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (z * ty)]; };
}

const pieces = {};
for (const id of IDS) { try { pieces[id] = await loadPiece(id); } catch (e) { pieces[id] = { id, missing: 'unreadable: ' + e.message }; } }
const missing = IDS.filter((id) => pieces[id].missing);
const hasRanges = (id) => !pieces[id].missing && pieces[id].extras && pieces[id].extras.faceRanges;
const have = (ids) => ids.every(hasRanges);
const why = (ids) => ids.filter((id) => !hasRanges(id)).map((id) => `${id}: ${pieces[id].missing || 'no extras.faceRanges'}`).join('; ');
const bp = GT.buildBlueprint(A, L, {});   // full-resolution reference (zones, heights)
const fullH = (id) => (x, z) => { try { return bp.pieces[id].heightStrict(x, z); } catch { return null; } };
// a check that needs every listed piece loaded: fail with the reason if not, else run body() -> { pass, detail }
const check = (name, ids, body) => { if (!have(ids)) return ok(name, false, why(ids)); const r = body(); ok(name, r.pass, r.detail); };
const failList = (bad) => ({ pass: !bad.length, detail: bad.join(' | ') });

// B1. each GLB parses: node + mesh piece_<id> (1 primitive) + one skirt_<petal neighbour> child per PETAL neighbour (none on MAIN-facing
//     sides), one OPAQUE material, COLOR_0 + NORMAL, no textures, pivot at the origin
const skirtIds = (id) => (id === 'main' ? [] : JP[id].seams.map((s) => s.with).filter((w) => w !== 'main').sort());
{
  const bad = [];
  for (const id of IDS) {
    const pc = pieces[id]; if (pc.missing) { bad.push(`${id}: ${pc.missing}`); continue; }
    const r = pc.root, mats = r.listMaterials(), tex = r.listTextures(), node = r.listNodes().find((n) => n.getMesh() === pc.mesh), prim = pc.prim, errs = [], want = skirtIds(id), got = Object.keys(pc.skirts).sort();
    if (pc.prims.length !== 1 || pc.meshes.length !== 1 + want.length) errs.push(`meshes=${pc.meshes.length} (want ${1 + want.length}) prims=${pc.prims.length}`);
    if (got.join() !== want.join()) errs.push(`skirts [${got}] want [${want}]`);
    for (const [nb, s] of Object.entries(pc.skirts)) {
      if (s.broken || s.mesh.listPrimitives().length !== 1 || s.mesh.getName() !== 'skirt_' + nb || s.prim.getMaterial() !== mats[0] || !s.C || !s.N || s.prim.getAttribute('TEXCOORD_0')) errs.push(`skirt_${nb} shape`);
      if (!isIdentity(s.node)) errs.push(`skirt_${nb} TRS`);
    }
    if (mats.length !== 1 || prim.getMaterial() !== mats[0] || mats[0].getAlphaMode() !== 'OPAQUE') errs.push(`materials=${mats.length}`);
    if (tex.length || (mats[0] && (mats[0].getBaseColorTexture() || mats[0].getNormalTexture()))) errs.push(`textures=${tex.length}`);
    if (!prim.getAttribute('COLOR_0') || !prim.getAttribute('NORMAL')) errs.push('COLOR_0 / NORMAL missing');
    if (prim.listAttributes().some((a) => a.getType() === 'VEC2')) errs.push('has TEXCOORD');
    if (!node || node.getName() !== 'piece_' + id || pc.mesh.getName() !== 'piece_' + id) errs.push('node/mesh name');
    if (!r.listScenes().length || !r.listScenes()[0].listChildren().includes(node)) errs.push('node not a scene root');
    if (!node || !isIdentity(node)) errs.push('node TRS');
    const h0 = pc.sample(0, 0); if (!h0 || Math.abs(h0.y) > 1e-4) errs.push(`top at (0,0) = ${h0 && h0.y}`);
    if (errs.length) bad.push(`${id}: ${errs.join(', ')}`);
  }
  ok('B1 GLB: piece_<id> mesh + skirt_<petal neighbour> nodes, 1 material, COLOR_0, no textures, pivot at local origin', !bad.length, bad.join(' | '));
}

// B2. triangle budgets (unlock pieces 3-6k, MAIN <= 10k, skirts included, skirts 250-460 each) and file size <= 280 KB (v1 + 15%)
{
  const bad = []; let total = 0;
  for (const id of IDS) {
    const pc = pieces[id]; if (pc.missing) { bad.push(`${id}: ${pc.missing}`); continue; }
    const tris = pc.nTri + sumTri(pc), kb = pc.bytes.length / 1024; total += tris;
    const inBudget = id === 'main' ? tris <= BUDGET.main : tris >= BUDGET.petal[0] && tris <= BUDGET.petal[1];
    if (!inBudget || kb > (KB_CAP[id] || 280) || !Object.values(pc.skirts).every((q) => q.nTri >= 250 && q.nTri <= 460)) bad.push(`${id} ${tris} tris ${kb.toFixed(1)} KB`);
  }
  if (!missing.length && total > BUDGET.total) bad.push(`total ${total}`);
  ok('B2 budgets: unlock 3-6k, MAIN <= 10k, total <= 50k tris; skirts 250-460; <= 280 KB a file (highland <= 295)', !bad.length, bad.join(', '));
}

// B3. each piece closed + watertight (every edge in exactly 2 faces, opposite winding), outward, no degenerate / NaN / untagged faces
{
  const bad = [];
  for (const id of IDS) {
    const pc = pieces[id]; if (pc.missing) { bad.push(`${id}: ${pc.missing}`); continue; }
    const E = new Map(), U = pc.U; let degen = 0, vol = 0, topInv = 0, underInv = 0, untagged = 0;
    const nan = Array.from(pc.P).filter((v) => !Number.isFinite(v)).length;
    for (let t = 0; t < pc.nTri; t++) {
      const a = pc.F[t * 3], b = pc.F[t * 3 + 1], c = pc.F[t * 3 + 2];
      if (a === b || b === c || a === c || pc.fN[t * 4 + 3] < 1e-8) { degen++; continue; }
      if (pc.tag[t] === 255) untagged++;
      if (pc.tag[t] === TAG.top && pc.fN[t * 4 + 1] <= 0) topInv++;
      if (pc.tag[t] === TAG.under && pc.fN[t * 4 + 1] >= 0) underInv++;
      for (const [u, v] of [[a, b], [b, c], [c, a]]) E.set(u + '>' + v, (E.get(u + '>' + v) || 0) + 1);
      const q = (i) => [U[i * 3], U[i * 3 + 1], U[i * 3 + 2]], [x0, y0, z0] = q(a), B3 = q(b), C3 = q(c);
      vol += (x0 * (B3[1] * C3[2] - B3[2] * C3[1]) - y0 * (B3[0] * C3[2] - B3[2] * C3[0]) + z0 * (B3[0] * C3[1] - B3[1] * C3[0])) / 6;
    }
    let open = 0, dup = 0; for (const [k, n] of E) { if (n > 1) dup++; const [u, v] = k.split('>'); if (!E.has(v + '>' + u)) open++; }
    if (open || dup || degen || nan || vol <= 0 || topInv || underInv || untagged) bad.push(`${id} open=${open} dup=${dup} degen=${degen} nan=${nan} vol=${vol.toFixed(1)} topInv=${topInv} underInv=${underInv} untagged=${untagged}`);
  }
  ok('B3 every baked piece closed + watertight, outward, no degenerate faces', !bad.length, bad.join(' | '));
}

// B4. seams EXACT when docked (world = local + dockedPosition): every MAIN-petal and petal-petal seam vertex matches within 1e-4,
//     every seam edge has its reversed twin on the other side; seam walls / inner walls back to back
check('B4 seams exact (MAIN-petal + petal-petal): |dP| <= 1e-4, every seam edge twinned, walls back to back', IDS, () => {
  const W = {}, idx = {}, bnd = {}, fails = []; let maxD = 0;
  for (const id of IDS) { const pc = pieces[id]; W[id] = worldPts(pc.U, pc.pivot); idx[id] = pointIndex(W[id]); bnd[id] = topBoundary(pc); }
  const twinEdges = (a, b, pl) => {   // top-boundary edges of `a` lying on the border polyline must have their reversed twin in `b`
    const mine = bnd[a].filter(([u, v]) => { const p = W[a][u], q = W[a][v]; return polyDist(p[0], p[2], pl) < 0.02 && polyDist(q[0], q[2], pl) < 0.02 && polyDist((p[0] + q[0]) / 2, (p[2] + q[2]) / 2, pl) < 0.02; });
    const theirs = new Set(bnd[b].map(([u, v]) => u + '>' + v)); let miss = 0;
    for (const [u, v] of mine) {
      const hu = idx[b](W[a][u], 1e-4), hv = idx[b](W[a][v], 1e-4);
      if (hu) maxD = Math.max(maxD, hu.d); if (hv) maxD = Math.max(maxD, hv.d);
      if (!hu || !hv || !theirs.has(hv.n + '>' + hu.n)) miss++;
    }
    return { n: mine.length, miss };
  };
  const twinFaces = (a, ta, b, tbs) => {   // faces of `a` tagged ta each need a reversed twin among the faces of `b` tagged tbs
    const pa = pieces[a], pb = pieces[b], set = new Set(); let n = 0, miss = 0;
    for (let t = 0; t < pb.nTri; t++) if (tbs.includes(pb.tag[t])) set.add([0, 1, 2].map((k) => pb.F[t * 3 + k]).join('>'));
    for (let t = 0; t < pa.nTri; t++) { if (pa.tag[t] !== ta) continue;
      const h = [0, 1, 2].map((k) => idx[b](W[a][pa.F[t * 3 + k]], 1e-4)); if (h.some((x) => !x)) continue;   // (the other seam's faces)
      n++; const r = [h[0].n, h[2].n, h[1].n]; if (![r, [r[1], r[2], r[0]], [r[2], r[0], r[1]]].some((c) => set.has(c.join('>')))) miss++; }
    return { n, miss };
  };
  for (const id of IDS) {
    if (id === 'main') continue; const J = JP[id];
    const arc = J.mainArc.world, e1 = twinEdges(id, 'main', arc), e2 = twinEdges('main', id, arc), fi = twinFaces(id, TAG.inner, 'main', [TAG.cone]);   // petal's inner wall == MAIN's cone reversed
    if (e1.miss || e2.miss || fi.miss || !e1.n || e1.n !== e2.n || !fi.n) fails.push(`main-${id} edges ${e1.n}(${e1.miss})/${e2.n}(${e2.miss}) inner ${fi.n}(${fi.miss})`);
    const s = J.seams.find((q) => q.side === 'high-theta'), nb = s.with, e3 = twinEdges(id, nb, s.world), e4 = twinEdges(nb, id, s.world), fw = twinFaces(id, TAG.seam, nb, [TAG.seam]), fw2 = twinFaces(nb, TAG.seam, id, [TAG.seam]);   // each pair once
    if (e3.miss || e4.miss || !e3.n || e3.n !== e4.n || fw.miss || fw2.miss || !fw.n) fails.push(`${id}-${nb} edges ${e3.n}(${e3.miss})/${e4.n}(${e4.miss}) walls ${fw.n}(${fw.miss})/${fw2.n}(${fw2.miss})`);
  }
  if (maxD > 1e-4) fails.push(`max |dP| ${maxD}`);
  return failList(fails);
});

// B5. baked MAIN: every layout flat zone is flat (slope ~0) at y = 0 +/- 0.05
const MZ = bp.zones.slice(0, bp.mainZoneCount);
const inZone = (z, x, y) => {
  if (z.type === 'disc') return Math.hypot(x - z.x, y - z.z) <= z.r;
  if (z.type === 'capsule') return segDist(x, y, [z.ax, z.az], [z.bx, z.bz]) <= z.r;
  return x >= z.x0 && x <= z.x1 && y >= z.z0 && y <= z.z1;
};
check('B5 baked MAIN: every layout flat zone flat (slope ~0) at y = 0 +/- 0.05', ['main'], () => {
  const pc = pieces.main; let zSlope = 0, zAbs = 0, zFaces = 0;
  for (const t of pc.tops) {
    const a = pc.F[t * 3] * 3, b = pc.F[t * 3 + 1] * 3, c = pc.F[t * 3 + 2] * 3, cx = (pc.U[a] + pc.U[b] + pc.U[c]) / 3, cz = (pc.U[a + 2] + pc.U[b + 2] + pc.U[c + 2]) / 3;
    if (!MZ.some((z) => inZone(z, cx, cz))) continue; zFaces++;
    zSlope = Math.max(zSlope, riseRun(pc.fN[t * 4 + 1]));
    for (const v of [a, b, c]) zAbs = Math.max(zAbs, Math.abs(pc.U[v + 1]));
  }
  return { pass: zFaces > 0 && zSlope < 0.01 && zAbs <= 0.05, detail: `${zFaces} faces: slope ${zSlope} max |h| ${zAbs}` };
});

// B6. height grid == its metadata + the baked top: nodes exact (NaN off the top), bilinear vs mesh <= 1e-3 in flat zones, <= 0.05 u on gentle ground
let MAN = null; try { MAN = JSON.parse(fs.readFileSync(path.join(MODELS, 'manifest.json'), 'utf8')); } catch { /* none */ }
const pieceZones = (id) => (id === 'main' ? MZ.map((z) => ({ in: (x, y) => inZone(z, x, y) })) : (JP[id].flatZones || []).filter((z) => z.flat).map((z) => ({ in: (x, y) => Math.hypot(x - z.at[0], y - z.at[1]) <= z.r })));
const SAMPLES = {};
{
  const bad = [];
  for (const id of IDS) {
    const pc = pieces[id], e = MAN && MAN.assets && MAN.assets['piece_' + id];
    if (!have([id]) || !pc.grid || !e || !e.height) { bad.push(`${id}: ${pc.missing || (!pc.grid ? 'no height.bin' : 'no manifest height entry')}`); continue; }
    const hm = e.height, [x0, z0] = hm.origin, [nx, nz] = hm.size, s = hm.spacing;
    if (s !== SPACING || pc.grid.length !== nx * nz || hm.file !== `piece_${id}.height.bin`) { bad.push(`${id}: metadata spacing=${s} size=${nx}x${nz} vs ${pc.grid.length} floats`); continue; }
    const [bx0, bz0, bx1, bz1] = pc.sample.bounds;   // the grid spans the top's x/z bounds
    if (x0 > bx0 + 1e-6 || z0 > bz0 + 1e-6 || x0 + (nx - 1) * s < bx1 - 1e-6 || z0 + (nz - 1) * s < bz1 - 1e-6) bad.push(`${id}: grid does not cover the top bounds`);
    let nodeErr = 0, nanWrong = 0;   // nodes: finite exactly where the top is, == the mesh there
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const g = pc.grid[j * nx + i], h = pc.sample(x0 + i * s, z0 + j * s);
      if (h == null ? !Number.isNaN(g) : !Number.isFinite(g)) nanWrong++; else if (h) nodeErr = Math.max(nodeErr, Math.abs(g - h.y)); }
    // bilinear vs the mesh at dense top points. A flat-zone point: inside a zone's r AND its whole bilinear cell on ground the FULL-RES layout keeps
    // flat (range <= 1e-4); zone edges / zones the layout does not keep flat are not judged at 1e-3
    const zs = pieceZones(id), pts = topPoints(pc, 1000 + id.length), fh = fullH(id), slopeAt = (t) => riseRun(pc.fN[t * 4 + 1]); SAMPLES[id] = pts;
    let zMax = 0, gentleMax = 0;
    for (const p of pts) {
      const gx = (p.x - x0) / s, gz = (p.z - z0) / s, i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j;
      if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) continue;
      const g00 = pc.grid[j * nx + i], g10 = pc.grid[j * nx + i + 1], g01 = pc.grid[(j + 1) * nx + i], g11 = pc.grid[(j + 1) * nx + i + 1];
      if (![g00, g10, g01, g11].every(Number.isFinite)) continue;
      const err = Math.abs((g00 * (1 - u) + g10 * u) * (1 - v) + (g01 * (1 - u) + g11 * u) * v - p.y);
      if (zs.some((z) => z.in(p.x, p.z))) {
        let lo = 1e9, hi = -1e9;
        for (const [qx, qz] of [[p.x, p.z], [x0 + i * s, z0 + j * s], [x0 + (i + 1) * s, z0 + j * s], [x0 + i * s, z0 + (j + 1) * s], [x0 + (i + 1) * s, z0 + (j + 1) * s]]) { const h = fh(qx, qz); if (h == null) { lo = -1e9; break; } lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (hi - lo <= 1e-4) zMax = Math.max(zMax, err);
      }
      // gentle: the point's face and the faces under the 4 cell corners all <= GENTLE
      const gentle = slopeAt(p.t) <= GENTLE && [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].every(([ci, cj]) => { const h = pc.sample(x0 + ci * s, z0 + cj * s); return h && slopeAt(h.t) <= GENTLE; });
      if (gentle) gentleMax = Math.max(gentleMax, err);
    }
    if (nodeErr > 1e-5 || nanWrong || zMax > 1e-3 || gentleMax > 0.05) bad.push(`${id} node=${nodeErr.toExponential(1)} nanWrong=${nanWrong} zones=${zMax.toExponential(1)} gentle=${f4(gentleMax)}`);
  }
  ok('B6 height grid: metadata, nodes exact (NaN off top), bilinear <= 1e-3 in flat zones, <= 0.05 u on gentle ground', !bad.length, bad.join(' | '));
}

// B7. baked top rim vs the JSON outline: max radial deviation (both directions) <= 0.15 u
{
  const bad = [];
  for (const id of IDS) {
    if (!have([id])) { bad.push(`${id}: ${why([id])}`); continue; }
    const pc = pieces[id], edges = topBoundary(pc), next = new Map(edges.map(([a, b]) => [a, b])), loop = []; let cur = edges[0][0], guard = 0;
    do { loop.push([pc.U[cur * 3], pc.U[cur * 3 + 2]]); cur = next.get(cur); } while (cur !== edges[0][0] && cur !== undefined && ++guard < 1e6);
    const closed = cur === edges[0][0] && loop.length === edges.length, J = JP[id].outline; let dev = 0;
    for (const [src, tgt] of [[loop, J], [J, loop]]) for (const [x, z] of src) { const r = rayR(tgt, Math.atan2(z, x)); dev = Math.max(dev, r == null ? 1e9 : Math.abs(r - Math.hypot(x, z))); }
    if (!closed || dev > 0.15) bad.push(`${id} closed=${closed} dev=${f4(dev)}`);
  }
  ok('B7 baked top rim == JSON outline (max radial deviation <= 0.15 u)', !bad.length, bad.join(', '));
}

// B8. baked height vs the full-resolution core height at dense top points: gentle-ground p99 <= 0.05 u
{
  const bad = [];
  for (const id of IDS) {
    if (!have([id])) { bad.push(`${id}: ${why([id])}`); continue; }
    const pc = pieces[id], pts = SAMPLES[id] || topPoints(pc, 1000 + id.length), fh = fullH(id), gerrs = [];
    for (const p of pts) {
      const y = fh(p.x, p.z); if (y == null) continue;
      const e2 = 0.1, hx0 = fh(p.x - e2, p.z), hx1 = fh(p.x + e2, p.z), hz0 = fh(p.x, p.z - e2), hz1 = fh(p.x, p.z + e2);
      const fullGentle = [hx0, hx1, hz0, hz1].every((h) => h != null) && Math.hypot(hx1 - hx0, hz1 - hz0) / (2 * e2) <= GENTLE;
      if (fullGentle && riseRun(pc.fN[p.t * 4 + 1]) <= GENTLE) gerrs.push(Math.abs(p.y - y));
    }
    if (!(pct(gerrs, 0.99) <= 0.05)) bad.push(`${id} gentle p99 ${f4(pct(gerrs, 0.99))}`);
  }
  ok('B8 baked vs full-res core height: gentle-ground p99 <= 0.05 u', !bad.length, bad.join(', '));
}

// B9. manifest: exactly the piece_* entries; files exist; tris match the GLBs; height metadata == the files
{
  const bad = [], want = IDS.map((id) => 'piece_' + id);
  if (!MAN || !MAN.assets) bad.push('no manifest.json');
  else {
    const keys = Object.keys(MAN.assets), extra = keys.filter((k) => k.startsWith('piece_') && !want.includes(k)), lack = want.filter((k) => !keys.includes(k));
    if (extra.length || lack.length) bad.push(`extra=[${extra}] missing=[${lack}]`);
    for (const id of IDS) { const e = MAN.assets['piece_' + id], pc = pieces[id]; if (!e) continue;
      if (e.file !== `piece_${id}.glb` || !fs.existsSync(path.join(MODELS, e.file)) || e.status !== 'ready' || typeof e.notes !== 'string') bad.push(`${id}: file/status/notes`);
      if (!pc.missing && e.tris !== pc.nTri + sumTri(pc)) bad.push(`${id}: tris ${e.tris} vs glb ${pc.nTri + sumTri(pc)}`);   // the piece + its skirts
      const h = e.height; if (!h || !fs.existsSync(path.join(MODELS, h.file)) || fs.statSync(path.join(MODELS, h.file)).size !== h.size[0] * h.size[1] * 4 || h.spacing !== SPACING || h.origin.length !== 2) bad.push(`${id}: height entry`); }
  }
  ok('B9 manifest: exactly the 8 piece_* entries, files exist, tris + height metadata match', !bad.length, bad.join(' | '));
}

// B10. deterministic: a fresh in-process bake (lib/bake.mjs) == the files on disk, byte for byte
{
  let detail = '', pass = false;
  try {
    const { bakePieces } = await import('../lib/bake.mjs'), out = await bakePieces(), diff = [];
    for (const id of IDS) { const o = out.pieces[id], pc = pieces[id];
      if (pc.missing || !Buffer.from(o.glb).equals(pc.bytes)) diff.push(id + '.glb');
      if (!pc.hbytes || !Buffer.from(o.height).equals(pc.hbytes)) diff.push(id + '.height.bin');
      if (!MAN || JSON.stringify(MAN.assets['piece_' + id]) !== JSON.stringify(o.entry)) diff.push(id + ' manifest entry'); }
    pass = !diff.length; detail = 'differs: ' + diff.join(', ');
  } catch (e) { detail = 'bake failed: ' + e.message.split('\n')[0]; }
  ok('B10 deterministic: a re-bake gives byte-identical files', pass, detail);
}

// B11. open-seam skirts (shown while petal X is undocked): each sits on the NEIGHBOUR's side of the seam within 1 u, runs the whole seam,
//      hangs down to the seam wall's bottom, faces outward, and reads as rock below its grass lip
check('B11 skirts: outside the seam (<= 1 u), whole seam, down to the wall bottom, outward, rock', IDS, () => {
  const bad = [];
  for (const id of IDS) { if (id === 'main') continue;
    const pc = pieces[id];
    for (const s of JP[id].seams) { if (s.with === 'main') continue;
      const sk = pc.skirts[s.with]; if (!sk || sk.broken) { bad.push(`${id}: no skirt_${s.with}`); continue; }
      const pl = s.world, nbSide = Math.sign(sideOf(pl, JP[s.with].dockedPosition[0], JP[s.with].dockedPosition[2])), pts = worldPts(sk.P, pc.pivot);
      let wrong = 0, far = 0, ymin = 1e9; for (const p of pts) { const d = sideOf(pl, p[0], p[2]); if (d * nbSide < -2e-3) wrong++; if (Math.abs(d) > 1.0) far++; ymin = Math.min(ymin, p[1]); }
      const onPl = pts.filter((p) => Math.abs(sideOf(pl, p[0], p[2])) < 0.02), nearEnd = (q) => onPl.some((p) => Math.hypot(p[0] - q[0], p[2] - q[1]) < 0.05), whole = nearEnd(pl[0]) && nearEnd(pl[pl.length - 1]);
      let wmin = 1e9; for (let t = 0; t < pc.nTri; t++) if (pc.tag[t] === TAG.seam) for (let k = 0; k < 3; k++) { const p = worldOf(pc, pc.F[t * 3 + k]); if (Math.abs(sideOf(pl, p[0], p[2])) < 0.05) wmin = Math.min(wmin, p[1]); }   // the piece's own seam-wall bottom
      // outward: area-weighted horizontal normal toward the neighbour; rock: mean sRGB colour of vertices > 0.5 u below the seam top
      let out = 0, area = 0; const rgb = [0, 0, 0]; let nrgb = 0; const C = sk.C.getArray(), cs = cscale(sk.C);
      for (let t = 0; t < sk.nTri; t++) { const [a, b, c] = [0, 1, 2].map((k) => pts[sk.I[t * 3 + k]]), [nx, ny, nz] = triNormal(a, b, c), l = Math.hypot(nx, ny, nz) || 1e-30;
        if (Math.abs(ny / l) > 0.7) continue; const m = [(a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3], e = 0.05, dir = Math.sign(sideOf(pl, m[0] + nx / l * e, m[1] + nz / l * e) - sideOf(pl, m[0], m[1]));
        out += dir * nbSide * Math.hypot(nx, nz); area += l; }
      for (let v = 0; v < pts.length; v++) {   // depth below the seam top (the nearest seam point's height)
        let bk = 0, bd = 1e9; pl.forEach(([x, z], k) => { const d = Math.hypot(x - pts[v][0], z - pts[v][2]); if (d < bd) { bd = d; bk = k; } });
        if (s.heights[bk] - pts[v][1] < 0.5) continue; for (let c = 0; c < 3; c++) rgb[c] += srgb(C[v * 3 + c] / cs); nrgb++; }
      const mean = rgb.map((c) => c / Math.max(1, nrgb));
      if (wrong || far || !whole || ymin > wmin + 0.05 || !(area > 0 && out / area > 0.5) || !isRock(mean)) bad.push(`${id}/skirt_${s.with} wrongSide=${wrong} far=${far} whole=${whole} bottom=${ymin.toFixed(2)} wall=${wmin.toFixed(2)} outward=${(out / (area || 1)).toFixed(2)} rgb=${mean.map((c) => c.toFixed(2))}`);
    }
  }
  return failList(bad);
});

// B12. seam normals: at every seam top vertex the top-surface normals are identical in every piece that shares it AND equal the joined
//      surface's normal (area-weighted over the top faces of all those pieces): <= 1e-3 rad
check('B12 seam normals shared across pieces (== joined-surface normal) <= 1e-3 rad', IDS, () => {
  const borders = []; for (const id of IDS) if (id !== 'main') { borders.push(JP[id].mainArc.world); for (const s of JP[id].seams) borders.push(s.world); }
  const onBorder = (x, z) => borders.some((pl) => Math.abs(sideOf(pl, x, z)) < 0.02), corners = new Map(), joined = new Map(), key = (p) => p.map((c) => c.toFixed(4)).join(',');
  for (const id of IDS) {
    const pc = pieces[id], N = pc.prim.getAttribute('NORMAL').getArray();
    for (const t of pc.tops) {
      const vs = [0, 1, 2].map((k) => pc.I[t * 3 + k]), ps = vs.map((v) => [pc.P[v * 3] + pc.pivot[0], pc.P[v * 3 + 1] + pc.pivot[1], pc.P[v * 3 + 2] + pc.pivot[2]]), fn = triNormal(...ps);
      for (let k = 0; k < 3; k++) { if (!onBorder(ps[k][0], ps[k][2])) continue; const kk = key(ps[k]);
        (corners.get(kk) || corners.set(kk, []).get(kk)).push({ id, n: [N[vs[k] * 3], N[vs[k] * 3 + 1], N[vs[k] * 3 + 2]] });
        const j = joined.get(kk) || joined.set(kk, [0, 0, 0]).get(kk); j[0] += fn[0]; j[1] += fn[1]; j[2] += fn[2]; }
    }
  }
  const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)))));
  let cross = 0, vsJ = 0, n = 0;
  for (const [kk, list] of corners) { if (new Set(list.map((q) => q.id)).size < 2) continue; n++;
    for (const a of list) { for (const b of list) if (a.id !== b.id) cross = Math.max(cross, ang(a.n, b.n)); vsJ = Math.max(vsJ, ang(a.n, joined.get(kk))); } }
  return { pass: n > 0 && cross <= 1e-3 && vsJ <= 1e-3, detail: `${n} shared vertices: across pieces ${cross} rad, vs joined ${vsJ} rad` };
});

// B13. undersides: (a) JSON depth / bottomLocal describe the baked pieces (bottom == GLB min y within 0.3 u, depth = -bottom / 5.5);
//      (b) game cameras (default_mobile, phone 412x915, desktop 1440x900, and a phone camera pulled back until the docked alpha set fits):
//      the underside below the island <= 20% of the screen height; (c) every petal's underside under MAIN's footprint is >= 0.2 u below
//      MAIN's cone; (d) every petal hangs <= 75% as deep as v1, measured docked
check('B13 undersides: JSON depth/bottom == baked, portrait views <= 20% underside, petal undersides below MAIN cone', IDS, () => {
  const bad = [];
  for (const id of IDS) { const pc = pieces[id]; let y = 1e9; for (let i = 1; i < pc.U.length; i += 3) y = Math.min(y, pc.U[i]); for (const s of Object.values(pc.skirts)) for (let i = 1; i < s.P.length; i += 3) y = Math.min(y, s.P[i]);
    const J = JP[id]; if (Math.abs(J.bottomLocal - y) > 0.3 || Math.abs(J.depth + J.bottomLocal / 5.5) > 1e-3) bad.push(`${id} JSON bottom ${J.bottomLocal} depth ${J.depth} vs GLB ${y.toFixed(3)}`); }
  const alpha = ['main', 'meadow', 'grove', 'islet'], DM = A.cameras.default_mobile, V = A.render.view, tq = Math.tan(15 * Math.PI / 180);
  const dmDist = Math.min(V.maxDistance, Math.max(V.floor, V.mainFrame[0] / (2 * tq * (DM.w / DM.h)) * V.fill, V.mainFrame[1] / (2 * tq)));
  const allPts = alpha.flatMap((id) => worldPts(pieces[id].U, pieces[id].pivot));
  let lo = 20, hi = 600; for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2, pr = project(mid, 412, 915); if (allPts.every((p) => { const q = pr(p); return Math.abs(q[0]) <= 1 && Math.abs(q[1]) <= 1; })) hi = mid; else lo = mid; }
  const cams = [['default_mobile', project(dmDist, DM.w, DM.h, Math.PI / 2 - DM.el * Math.PI / 180, DM.az * Math.PI / 180, DM.tgt)], ['phone130', project(130, 412, 915, 1.0668, 0.7854)], ['desktop35.5', project(35.5, 1440, 900, 1.0668, 0.7854)], ['fit', project(hi, 412, 915)]];
  for (const [name, pr] of cams) {   // per screen column (64 bins): how far the island hangs below its own top surface, as a share of the screen height
    const NB = 64, topLow = new Float64Array(NB).fill(9), allLow = new Float64Array(NB).fill(9);
    const tri = (ps, isTop) => { const q = ps.map(pr), x0 = Math.min(...q.map((v) => v[0])), x1 = Math.max(...q.map((v) => v[0])); if (x1 < -1 || x0 > 1) return;
      const y = Math.max(-1, Math.min(...q.map((v) => v[1]))); for (let b = Math.max(0, Math.floor((x0 + 1) / 2 * NB)); b <= Math.min(NB - 1, Math.floor((x1 + 1) / 2 * NB)); b++) { allLow[b] = Math.min(allLow[b], y); if (isTop) topLow[b] = Math.min(topLow[b], y); } };
    for (const id of alpha) { const pc = pieces[id];
      for (let t = 0; t < pc.nTri; t++) tri([0, 1, 2].map((k) => worldOf(pc, pc.F[t * 3 + k])), pc.tag[t] === TAG.top);
      for (const [nb, s] of Object.entries(pc.skirts)) { if (alpha.includes(nb)) continue;   // a skirt shows while its neighbour is undocked
        const sp = worldPts(s.P, pc.pivot); for (let t = 0; t < s.nTri; t++) tri([0, 1, 2].map((k) => sp[s.I[t * 3 + k]]), false); } }
    let m = 0; for (let b = 0; b < NB; b++) if (topLow[b] < 9) m = Math.max(m, (topLow[b] - allLow[b]) / 2);
    if (m > 0.2) bad.push(`underside share ${name} ${(100 * m).toFixed(1)}%`);
  }
  const M = pieces.main, cones = []; for (let t = 0; t < M.nTri; t++) if (M.tag[t] === TAG.cone) cones.push(t);
  const coneAt = makeSampler(M.U, M.F, cones); let minGap = 1e9;
  for (const id of IDS) { if (id === 'main') continue; const pc = pieces[id];
    for (let t = 0; t < pc.nTri; t++) { if (pc.tag[t] !== TAG.under) continue;
      for (let k = 0; k < 3; k++) { const p = worldOf(pc, pc.F[t * 3 + k]), c = coneAt(p[0], p[2]); if (c) minGap = Math.min(minGap, c.y - p[1]); } } }
  if (!(minGap >= 0.2)) bad.push(`petal underside ${minGap.toFixed(2)} u below MAIN's cone`);
  const V1B = { meadow: -25.98, wetland: -26.60, cottage: -26.65, highland: -29.29, orchard: -26.26, grove: -26.58, islet: -26.31 };   // v1 bottoms (the highland's pivot sits 3 u up, hence docked)
  for (const [id, b] of Object.entries(V1B)) { const py = pieces[id].pivot[1]; let y = 1e9; for (let i = 1; i < pieces[id].U.length; i += 3) y = Math.min(y, pieces[id].U[i] + py);
    if (y < 0.75 * (b + py)) bad.push(`${id} hangs to ${y.toFixed(2)} world (v1 ${(b + py).toFixed(2)})`); }
  return failList(bad);
});

// B14. every exported flat zone centre is on its piece's baked top (off-top zones are dropped; e.g. MAIN's staticTree at (-6.2, -5.6))
{
  const bad = [], centre = (z) => (z.at ? z.at : z.a ? [(z.a[0] + z.b[0]) / 2, (z.a[1] + z.b[1]) / 2] : [(z.min[0] + z.max[0]) / 2, (z.min[1] + z.max[1]) / 2]);
  for (const id of IDS) for (const z of JP[id].flatZones || []) { const [x, zz] = centre(z), onFull = fullH(id)(x, zz) !== null, onBaked = !pieces[id].missing && !!pieces[id].sample(x, zz);
    if (!onFull || !onBaked) bad.push(`${id}:${z.id || z.what}@(${x},${zz}) full=${onFull} baked=${onBaked}`); }
  if ((JP.main.flatZones || []).some((z) => z.at && Math.abs(z.at[0] + 6.2) < 1e-6 && Math.abs(z.at[1] + 5.6) < 1e-6)) bad.push('MAIN staticTree (-6.2, -5.6) still exported');
  ok('B14 every exported flat zone centre is on its piece top (off-top zones dropped)', !bad.length, bad.slice(0, 6).join(', '));
}

// B15. the flat seam wall reads as rock while a skirt is hidden: rows <= 1.2 u apart in its top 3.2 u (strata in the vertex colours) and stone-coloured
check('B15 seam walls: rows <= 1.2 u apart in the top 3.2 u, stone-coloured', IDS, () => {
  const bad = []; let cols = 0;
  for (const id of IDS) { if (id === 'main') continue; const pc = pieces[id], C = pc.prim.getAttribute('COLOR_0'), CA = C.getArray(), cs = cscale(C);
    for (const s of JP[id].seams) { if (s.with === 'main') continue;
      const tops = s.world.map(([x, z], k) => ({ x, z, y: s.heights[k], ys: [] })), rgb = [0, 0, 0]; let nc = 0;   // the piece's seam-wall vertices grouped by seam column
      for (let t = 0; t < pc.nTri; t++) { if (pc.tag[t] !== TAG.seam) continue;
        for (let k = 0; k < 3; k++) { const vi = pc.I[t * 3 + k], p = worldOf(pc, pc.F[t * 3 + k]); for (const q of tops) if (Math.hypot(p[0] - q.x, p[2] - q.z) < 0.02) { q.ys.push(q.y - p[1]); if (q.y - p[1] > 0.5) { for (let c = 0; c < 3; c++) rgb[c] += srgb(CA[vi * 3 + c] / cs); nc++; } } } }
      for (const q of tops) { const ds = [...new Set(q.ys.map((d) => +d.toFixed(3)))].sort((a, b) => a - b); if (ds.length < 2) continue; cols++;
        let gap = 0; for (let i = 1; i < ds.length && ds[i - 1] < 3.2; i++) gap = Math.max(gap, Math.min(ds[i], 3.2) - ds[i - 1]);
        if (gap > 1.2) { bad.push(`${id}->${s.with} column gap ${gap.toFixed(2)} u`); break; } }
      if (!isRock(rgb.map((c) => c / Math.max(1, nc)))) bad.push(`${id}->${s.with} colour not stone`);
    } }
  return { pass: !bad.length && cols > 0, detail: bad.slice(0, 8).join(' | ') };
});

// B16. the piece TOPS are frozen: every height grid is byte-identical to the shipped one (the game places props from these grids, so
//      a coarsened top would float or sink props). Changing a top on purpose means updating these hashes AND telling the game session.
{
  const FROZEN = { main: '1ec89f3cf642cb1f', meadow: 'bda491f8c99e786b', wetland: '17a68c826f8b61da', cottage: '20cd20c74def4125', highland: '53ffa71548992ca2', orchard: '1a7c373bde8c2182', grove: 'da28fbe3a0345c15', islet: '902d0e0c719884f3' };
  const bad = IDS.map((id) => { const f = path.join(MODELS, `piece_${id}.height.bin`), h = fs.existsSync(f) ? createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16) : 'missing'; return h !== FROZEN[id] && `${id} ${h} != ${FROZEN[id]}`; }).filter(Boolean);
  ok('B16 piece tops frozen: every height grid byte-identical to the shipped one', !bad.length, bad.join(' | '));
}

// B17. a lone petal hangs like its own rock, not a slab: each petal docked ALONE with MAIN (both skirts showing), seen from sampled game-camera
//      azimuths and polars: visible seam wall (seam faces + skirts) over visible top, above the cloud top, via an orthographic z-buffer over the
//      baked triangles (back faces culled). Worst view <= 0.6 at the default polar, <= 0.8 at az 45/-4/94, <= 0.83 at the halfway azimuths;
//      the meadow (mostly top already) no worse than before the taper (0.288)
const lonePetalViews = (() => {
  const GP = A.render.gameplay, CLOUD = A.sea.cloudY[1], PX = 0.08, DEFAULT_POL = Math.PI / 2 - A.cameras.default_desktop.el * Math.PI / 180;
  const AZ = [GP.azimuthCenter, GP.azimuthCenter - GP.azimuthRange, GP.azimuthCenter + GP.azimuthRange, GP.azimuthCenter - GP.azimuthRange / 2, GP.azimuthCenter + GP.azimuthRange / 2], POL = [GP.minPolar, 0.77, 0.92, DEFAULT_POL, GP.maxPolar];
  function scene(id) {   // world triangles + a class each: 1 = the petal's top, 2 = its seam wall, 3 = its skirt, 0 = anything else
    const T = [], C = [], push = (pc, P, I, cls) => { const pv = pc.pivot;
      for (let t = 0; t < I.length / 3; t++) { for (let k = 0; k < 3; k++) { const v = I[t * 3 + k] * 3; T.push(P[v] + pv[0], P[v + 1] + pv[1], P[v + 2] + pv[2]); } C.push(cls(t)); } };
    push(pieces.main, pieces.main.P, pieces.main.I, () => 0);
    const pc = pieces[id]; push(pc, pc.P, pc.I, (t) => (pc.tag[t] === TAG.top ? 1 : pc.tag[t] === TAG.seam ? 2 : 0));
    for (const s of Object.values(pc.skirts)) if (!s.broken) push(pc, s.P, s.I, () => 3);
    return { T: Float64Array.from(T), C: Uint8Array.from(C) };
  }
  function view(sc, az, pol) {   // visible pixels per class above the cloud top
    const f = [-Math.sin(pol) * Math.sin(az), -Math.cos(pol), -Math.sin(pol) * Math.cos(az)], rl = Math.hypot(f[2], f[0]), r = [-f[2] / rl, 0, f[0] / rl];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]], T = sc.T, nT = T.length / 9, S = new Float64Array(T.length);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < T.length; i += 3) { const sx = T[i] * r[0] + T[i + 2] * r[2], sy = T[i] * u[0] + T[i + 1] * u[1] + T[i + 2] * u[2];
      S[i] = sx; S[i + 1] = sy; S[i + 2] = T[i] * f[0] + T[i + 1] * f[1] + T[i + 2] * f[2]; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    const W = Math.ceil((x1 - x0) / PX) + 2, Hh = Math.ceil((y1 - y0) / PX) + 2, Z = new Float64Array(W * Hh).fill(Infinity), K = new Uint8Array(W * Hh), Y = new Float32Array(W * Hh);
    for (let t = 0; t < nT; t++) {
      const o = t * 9, ax = S[o], ay = S[o + 1], bx = S[o + 3], by = S[o + 4], cx = S[o + 6], cy = S[o + 7], area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area <= 1e-12) continue;   // facing away
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / PX - 0.5)), i1 = Math.min(W - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / PX - 0.5));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / PX - 0.5)), j1 = Math.min(Hh - 1, Math.ceil((Math.max(ay, by, cy) - y0) / PX - 0.5));
      for (let j = j0; j <= j1; j++) { const py = y0 + (j + 0.5) * PX;
        for (let i = i0; i <= i1; i++) { const px = x0 + (i + 0.5) * PX;
          const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area, w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area, w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const d = w0 * S[o + 2] + w1 * S[o + 5] + w2 * S[o + 8], q = j * W + i; if (d >= Z[q]) continue;
          Z[q] = d; K[q] = sc.C[t]; Y[q] = w0 * T[o + 1] + w1 * T[o + 4] + w2 * T[o + 7]; } }
    }
    const n = [0, 0, 0, 0]; for (let q = 0; q < W * Hh; q++) if (Z[q] < Infinity && Y[q] > CLOUD) n[K[q]]++;
    return n;
  }
  return (id) => { const sc = scene(id), views = [];
    for (const az of AZ) for (const pol of POL) { const n = view(sc, az, pol); views.push({ az, pol, ratio: (n[2] + n[3]) / Math.max(1, n[1]) }); }
    return { views, DEFAULT_POL, AZ };
  };
})();
check('B17 lone petal hangs like its own rock: seam wall / top <= 0.6 at the default polar, <= 0.8 at the sampled azimuths (0.83 between); meadow no worse', IDS, () => {
  const bad = [], maxOf = (vs) => Math.max(...vs.map((v) => v.ratio));
  for (const id of IDS) { if (id === 'main') continue;
    const { views, DEFAULT_POL, AZ } = lonePetalViews(id), atDef = maxOf(views.filter((v) => v.pol === DEFAULT_POL)), ends = maxOf(views.filter((v) => AZ.indexOf(v.az) < 3)), mid = maxOf(views.filter((v) => AZ.indexOf(v.az) >= 3));
    if (atDef > 0.6) bad.push(`${id} default-polar worst ${atDef.toFixed(2)} > 0.6`);
    if (ends > 0.8) bad.push(`${id} worst at az 45/-4/94 ${ends.toFixed(2)} > 0.8`);
    if (mid > 0.83) bad.push(`${id} worst at az 21/69 ${mid.toFixed(2)} > 0.83`);
    if (id === 'meadow' && maxOf(views) > 0.288) bad.push(`meadow ${maxOf(views).toFixed(2)} > 0.288 (before the taper)`);
  }
  return failList(bad);
});

// B18. the zone paint is baked into piece_main.glb's COLOR_0: the grass vertices of its top (gentle faces, hue 58-170), the shade pools
//      (U > 0.5, the core's groundZones) <= 0.97 x the open ring 1.5-3 u from the same trunks (U < 0.1). B18b: the same pool vertices
//      <= 0.97 x a scratch bake painted with cDeep 0 (in memory), so the check can fail on the pool term itself
{
  const lumaOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const hueOf = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 1e-9) return 0; const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); return h < 0 ? h + 360 : h; };
  const grassOf = (U, F, I, fN, tops, CA, cs) => { const acc = new Map();   // Map(position key -> { x, z, Y }) of the green gentle top vertices, corners averaged
    for (const t of tops) { if (fN[t * 4 + 1] <= 0.7) continue;
      for (let k = 0; k < 3; k++) { const u = F[t * 3 + k], v = I[t * 3 + k], a = acc.get(u) || acc.set(u, [0, 0, 0, 0]).get(u); for (let c = 0; c < 3; c++) a[c] += CA[v * 3 + c] / cs; a[3]++; } }
    const out = new Map();
    for (const [u, a] of acc) { const c = [0, 1, 2].map((k) => srgb(a[k] / a[3])), h = hueOf(...c); if (!(h >= 58 && h < 170)) continue; out.set(U[u * 3] + ',' + U[u * 3 + 2], { x: U[u * 3], z: U[u * 3 + 2], Y: lumaOf(c) }); }
    return out; };
  const colOf = (prim) => { const C = prim.getAttribute('COLOR_0'); return [C.getArray(), cscale(C)]; };
  const n18 = 'B18 the zone paint is baked: MAIN\'s shade pools (U > 0.5) <= 0.97 x the 1.5-3 u ring round the same trunks (U < 0.1)', n18b = 'B18b the shade-pool term is baked: the pools <= 0.97 x a scratch bake painted with cDeep 0';
  if (!have(['main'])) { ok(n18, false, why(['main'])); ok(n18b, false, why(['main'])); }
  else {
    const pc = pieces.main, comp = GT.composeBlueprint(bp, L), Z = GT.groundZones(bp, comp, comp.water), [CA, cs] = colOf(pc.prim);
    const grass = [...grassOf(pc.U, pc.F, pc.I, pc.fN, pc.tops, CA, cs).entries()].map(([key, p]) => ({ key, ...p, U: Z.at('main', p.x, p.z).U }));
    const inPool = grass.filter((p) => p.U > 0.5), poolTrees = Z.pools('main').filter((t) => inPool.some((p) => Math.hypot(p.x - t.tx, p.z - t.tz) < 2.5 * t.r + 1));
    const ring = grass.filter((p) => p.U < 0.1 && poolTrees.some((t) => { const d = Math.hypot(p.x - t.tx, p.z - t.tz); return d >= 1.5 && d <= 3; }));
    const mean = (a) => a.reduce((s, p) => s + p.Y, 0) / Math.max(1, a.length), poolY = mean(inPool), ringY = mean(ring);
    ok(n18, inPool.length > 20 && ring.length > 50 && poolY <= 0.97 * ringY, `${inPool.length} pool / ${ring.length} ring vertices, x ${(poolY / ringY).toFixed(4)}`);
    let detail = '', pass = false;
    try {
      const { bakePieces } = await import('../lib/bake.mjs');
      const keep = GT.LAWN.cDeep; GT.LAWN.cDeep = 0; let out; try { out = await bakePieces(); } finally { GT.LAWN.cDeep = keep; }
      const doc = await new NodeIO().readBinary(new Uint8Array(out.pieces.main.glb)), mesh = doc.getRoot().listMeshes().find((m) => m.getName() === 'piece_main'), prim = mesh.listPrimitives()[0];
      const P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray(), [t0, tn] = mesh.getExtras().faceRanges.top, [CB, cb] = colOf(prim);
      const { U: U2, pid } = weld(P), F2 = Int32Array.from(I, (v) => pid[v]), fN2 = new Float64Array(I.length / 3 * 4), tops2 = [];   // the scratch bake shares every top position with the file's
      for (let t = t0; t < t0 + tn; t++) { tops2.push(t); const q = (k) => [U2[F2[t * 3 + k] * 3], U2[F2[t * 3 + k] * 3 + 1], U2[F2[t * 3 + k] * 3 + 2]], n = triNormal(q(0), q(1), q(2)); fN2[t * 4 + 1] = n[1] / (Math.hypot(...n) || 1e-30); }
      const noC = grassOf(U2, F2, I, fN2, tops2, CB, cb), both = inPool.filter((p) => noC.has(p.key));
      const r = both.reduce((s, p) => s + p.Y, 0) / Math.max(1e-9, both.reduce((s, p) => s + noC.get(p.key).Y, 0));
      pass = both.length > 20 && both.length === inPool.length && r <= 0.97; detail = `${both.length} of ${inPool.length} pool vertices, x ${r.toFixed(4)}`;
    } catch (e) { detail = 'scratch bake failed: ' + e.message.split('\n')[0]; }
    ok(n18b, pass, detail);
  }
}

let fails = 0;
for (const r of results) { if (!r.pass) fails++; console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass || !r.detail ? '' : '\n        ' + r.detail}`); }
console.log(`  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
process.exit(fails ? 1 : 0);
