// phase2.test.mjs  --  LOOK-BRIEF Phase 2 (materials) criteria that need no browser (art/config/LOOK-BRIEF.md). Pure node.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GT from '../lib/terrain.mjs';
import { readPNG } from '../lib/png.mjs';
import { imageMetrics } from '../metrics.mjs';
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(__dirname, '../..'), SHOTS = path.join(ART, 'screenshots');
const A = W3.archipelago, TAG = GT.TAG;
const LP = JSON.parse(fs.readFileSync(path.join(ART, 'config', 'lookPresets.json'), 'utf8'));
const P = LP.presets['Golden afternoon'];
const argv = process.argv.slice(2);
let shots = 'phase2', gameDirs = [path.join(SHOTS, 'phase2_game', 'raw', 'before'), path.join(SHOTS, 'phase2_game', 'raw', 'after')];
for (let i = 0; i < argv.length; i++) { if (argv[i] === '--shots') shots = argv[++i]; else if (argv[i] === '--game') gameDirs = argv[++i].split(',').map((d) => path.resolve(d)); }
const results = [];
const ok = (name, pass, detail, skip = false) => results.push({ name, pass: !!pass, detail, skip });
// ---- colour helpers (sRGB 0..1) ----
const toS = GT.linearToSrgb;
function hsv(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 1e-9) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); if (h < 0) h += 360; }
  return [h, mx > 0 ? d / mx : 0, mx]; }
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const hex01 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const pctl = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const meanCol = (list) => { const s = [0, 0, 0]; for (const c of list) for (let k = 0; k < 3; k++) s[k] += c[k]; return s.map((v) => v / Math.max(1, list.length)); };
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v)), f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));
// ---- the island + what the proof paints under Golden afternoon ----
const T0 = Date.now();
const bp = GT.buildBlueprint(A, L, {}), comp = GT.composeBlueprint(bp, L);
const painted = typeof GT.paintBlueprint === 'function' ? GT.paintBlueprint(bp, comp, P, L) : null;
const colsOf = (id) => (painted && painted[id]) || bp.pieces[id].colors;
const SOURCE = painted ? 'GT.paintBlueprint(Golden afternoon)' : 'base core colours (no GT.paintBlueprint)';
// face normal (local positions, 9 floats per face)
function faceN(Pp, o) { const ax = Pp[o + 3] - Pp[o], ay = Pp[o + 4] - Pp[o + 1], az = Pp[o + 5] - Pp[o + 2], bx = Pp[o + 6] - Pp[o], by = Pp[o + 7] - Pp[o + 1], bz = Pp[o + 8] - Pp[o + 2];
  const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l, l / 2]; }
// base albedo class (look.test albedoClass): green faces are grass, warm low-sat faces stone
function baseClass(C, o) { const c = [0, 1, 2].map((k) => toS((C[o + k] + C[o + 3 + k] + C[o + 6 + k]) / 3)), [h, s, v] = hsv(...c);
  if (h >= 12 && h < 58 && s < 0.34 && v >= 0.3) return 'stone'; if (h >= 15 && h < 50 && s >= 0.34) return 'soil'; if (h >= 58 && h < 170) return 'green'; return 'other'; }
// ---- spatial helpers: top-surface height grid (max / min of every top vertex), trees, water ----
const CELL = 0.25, gk = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
const topMax = new Map(), topMin = new Map();
for (const id of bp.order) { const pc = bp.pieces[id], Pp = pc.positions, pv = pc.pivot;
  for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue;
    for (let q = 0; q < 3; q++) { const o = t * 9 + q * 3, x = Pp[o] + pv[0], y = Pp[o + 1] + pv[1], z = Pp[o + 2] + pv[2], k = gk(x, z);
      if (!(topMax.get(k) >= y)) topMax.set(k, y); if (!(topMin.get(k) <= y)) topMin.set(k, y); } } }
function extremeWithin(map, x, z, r, useMax) { const n = Math.ceil(r / CELL), cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); let best = useMax ? -Infinity : Infinity;
  for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) { if ((a * a + b * b) * CELL * CELL > r * r) continue; const v = map.get((cx + a) + ',' + (cz + b)); if (v === undefined) continue; best = useMax ? Math.max(best, v) : Math.min(best, v); }
  return best; }
const trees = []; for (const id of bp.order) for (const t of comp.pieces[id].trees) trees.push([t.x, t.z]);
const TC = 2, treeGrid = new Map(); for (const [x, z] of trees) { const k = Math.floor(x / TC) + ',' + Math.floor(z / TC); (treeGrid.get(k) || treeGrid.set(k, []).get(k)).push([x, z]); }
function treesWithin(x, z, r) { let n = 0; const cx = Math.floor(x / TC), cz = Math.floor(z / TC), m = Math.ceil(r / TC);
  for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) for (const [tx, tz] of treeGrid.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(tx - x, tz - z) < r) n++; return n; }
// distance OUTSIDE the nearest water edge (< 0 = in the water)
const W = comp.water, segs = [], circles = W.main.pond.r == null ? [] : [[W.main.pond.at[0], W.main.pond.at[1], W.main.pond.r]], polys = [];
const ribbonSegs = (pts) => { for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, (pts[i].width || 0.5) / 2, (pts[i + 1].width || 0.5) / 2]); };
ribbonSegs(W.main.stream.line || W.main.stream.points); ribbonSegs(W.wetland.river.points); ribbonSegs(W.wetland.outflow.points);
for (const [poly, level] of [...(W.main.pond.r == null ? [[W.main.pond.outline, W.main.pond.level]] : []), [W.wetland.lake.outline, W.wetland.lake.level], [W.highland.tarn.outline, W.highland.tarn.level], [W.highland.hotSpring.outline, W.highland.hotSpring.level]]) {
  polys.push([poly, level]); for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; segs.push([a[0], a[1], b[0], b[1], 0, 0]); } }
function dWater(x, z) {
  for (const [poly, level] of polys) if (GT.inLoop(poly, x, z) && bp.H(x, z) < level + 0.06) return -1;
  let d = 1e9; for (const [cx, cz, r] of circles) d = Math.min(d, Math.hypot(x - cx, z - cz) - r);
  for (const [ax, az, bx, bz, ha, hb] of segs) { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-12, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t) - (ha + (hb - ha) * t)); }
  return d;
}
// ---- grass vertices: top faces, gentle (slope < 0.30), green in the base albedo; colour = mean over their grass faces ----
const V = [];   // { id, x, y, z, c: sRGB, h, s, v, Y }
const gface = {};   // id -> Map(face -> [h, Y]) for the adjacency check
for (const id of bp.order) {
  const pc = bp.pieces[id], Pp = pc.positions, C0 = pc.colors, C = colsOf(id), pv = pc.pivot, acc = new Map(), fm = new Map();
  for (let t = 0; t < pc.faceCount; t++) {
    if (pc.tags[t] !== TAG.top) continue; const o = t * 9, n = faceN(Pp, o);
    if (1 - n[1] >= 0.30 || baseClass(C0, o) !== 'green') continue;
    const fc = [0, 1, 2].map((k) => toS((C[o + k] + C[o + 3 + k] + C[o + 6 + k]) / 3)); fm.set(t, [hsv(...fc)[0], luma(fc)]);
    for (let q = 0; q < 3; q++) { const vi = pc.faces[t * 3 + q], a = acc.get(vi) || acc.set(vi, { x: Pp[o + q * 3] + pv[0], y: Pp[o + q * 3 + 1] + pv[1], z: Pp[o + q * 3 + 2] + pv[2], c: [0, 0, 0], n: 0 }).get(vi);
      for (let k = 0; k < 3; k++) a.c[k] += C[o + q * 3 + k]; a.n++; }
  }
  gface[id] = fm;
  for (const a of acc.values()) { const c = a.c.map((v) => toS(v / a.n)), [h, s, v] = hsv(...c); V.push({ id, x: a.x, y: a.y, z: a.z, c, h, s, v, Y: luma(c) }); }
}
for (const p of V) { p.dw = dWater(p.x, p.z); p.rise1 = extremeWithin(topMax, p.x, p.z, 1.0, true) - p.y; p.rise3 = extremeWithin(topMax, p.x, p.z, 3.0, true) - p.y; p.t16 = treesWithin(p.x, p.z, 1.6); p.t3 = treesWithin(p.x, p.z, 3.0); }
const isOpen = (p) => (p.dw > 5) && p.y > -0.6 && p.y < 0.8 && p.rise3 < 0.3 && p.t3 === 0;
const meadow = V.filter(isOpen);
const M = { h: mean(meadow.map((p) => p.h)), s: mean(meadow.map((p) => p.s)), Y: mean(meadow.map((p) => p.Y)) };
const prep = `${V.length} grass vertices, ${meadow.length} open meadow (hue ${f2(M.h)}, sat ${f3(M.s)}, luma ${f3(M.Y)}); source: ${SOURCE}; ${((Date.now() - T0) / 1000).toFixed(1)} s`;
// G1. LOW-FREQUENCY THREE-GREEN VARIATION, no per-triangle noise
{
  const hs = V.map((p) => p.h), spread = pctl(hs, 0.9) - pctl(hs, 0.1);
  // pairs at ~d u: a random grass vertex + the nearest grass vertex to a point d away (deterministic)
  const G = new Map(), gc = 0.5; for (let i = 0; i < V.length; i++) { const k = Math.floor(V[i].x / gc) + ',' + Math.floor(V[i].z / gc); (G.get(k) || G.set(k, []).get(k)).push(i); }
  const near = (x, z) => { let best = -1, bd = 0.35; const cx = Math.floor(x / gc), cz = Math.floor(z / gc); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of G.get((cx + a) + ',' + (cz + b)) || []) { const d = Math.hypot(V[i].x - x, V[i].z - z); if (d < bd) { bd = d; best = i; } } return best; };
  const corr = (d) => { const rng = GT.mulberry32(7 + Math.round(d)), xs = [], ys = [];
    for (let k = 0; k < 40000 && xs.length < 6000; k++) { const i = Math.floor(rng() * V.length), a = rng() * Math.PI * 2, j = near(V[i].x + Math.cos(a) * d, V[i].z + Math.sin(a) * d); if (j < 0) continue; xs.push(V[i].h); ys.push(V[j].h); }
    const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0; for (let k = 0; k < xs.length; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; syy += (ys[k] - my) ** 2; }
    return { r: sxy / Math.sqrt(sxx * syy || 1), n: xs.length }; };
  const c2 = corr(2), c20 = corr(20);
  ok('G1a grass = a world-space blend of three greens: hue spread P90 - P10 >= 12 deg', spread >= 12, `hue P10 ${f2(pctl(hs, 0.1))} / P50 ${f2(pctl(hs, 0.5))} / P90 ${f2(pctl(hs, 0.9))} -> spread ${f2(spread)} deg; ${prep}`);
  ok('G1b low frequency: hue autocorrelation >= 0.75 over 2 u, dropping by >= 0.3 over 20 u', c2.r >= 0.75 && c20.r <= c2.r - 0.3, `r(2 u) ${f3(c2.r)} (${c2.n} pairs), r(20 u) ${f3(c20.r)} (${c20.n} pairs)`);
  // G1c (ruling GR21, ground-vegetation plan Task 6): per-triangle NOISE is a face that differs from its own neighbours, so the hue
  const dh = [], dY = [], rh = [], wrap = (d) => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);
  for (const id of bp.order) { const pc = bp.pieces[id], fm = gface[id], edges = new Map(), nb = new Map();
    for (const t of fm.keys()) for (let q = 0; q < 3; q++) { const a = pc.faces[t * 3 + q], b = pc.faces[t * 3 + (q + 1) % 3], k = a < b ? a * 4194304 + b : b * 4194304 + a; (edges.get(k) || edges.set(k, []).get(k)).push(t); }
    for (const fs2 of edges.values()) if (fs2.length === 2) { const A1 = fm.get(fs2[0]), B1 = fm.get(fs2[1]); let d = Math.abs(A1[0] - B1[0]); if (d > 180) d = 360 - d; dh.push(d); dY.push(Math.abs(A1[1] - B1[1]));
      (nb.get(fs2[0]) || nb.set(fs2[0], []).get(fs2[0])).push(fs2[1]); (nb.get(fs2[1]) || nb.set(fs2[1], []).get(fs2[1])).push(fs2[0]); }
    for (const [t, ns] of nb) { if (ns.length < 2) continue; const h = fm.get(t)[0]; rh.push(Math.abs(ns.reduce((s, u) => s + wrap(h - fm.get(u)[0]), 0) / ns.length)); } }
  ok('G1c no per-triangle noise (GR21): grass faces vs the mean of their neighbours P95 |d hue| <= 0.5 deg; neighbouring faces P95 |d luma| <= 0.015', pctl(rh, 0.95) <= 0.5 && pctl(dY, 0.95) <= 0.015,
    `${rh.length} faces: P95 |hue - neighbour mean| ${f3(pctl(rh, 0.95))} deg; ${dh.length} shared edges: P95 |d luma| ${f3(pctl(dY, 0.95))} (P95 |d hue| ${f3(pctl(dh, 0.95))} deg, the pre-GR21 measure)`);
}
// G2-G6. MEANINGFUL VARIATION: water, high ground, cliff-base + forest-edge AO, calm saturation
{
  const wet = V.filter((p) => p.dw >= 0 && p.dw <= 1.2 && p.rise1 < 0.9 && p.t16 < 2);
  const Wm = { h: mean(wet.map((p) => p.h)), s: mean(wet.map((p) => p.s)), Y: mean(wet.map((p) => p.Y)) };
  ok('G2 near water (<= 1.2 u): cooler (hue >= meadow + 5 deg) and lusher (luma <= meadow)', wet.length > 50 && Wm.h >= M.h + 5 && Wm.Y <= M.Y,
    `${wet.length} vertices: hue ${f2(Wm.h)} (meadow ${f2(M.h)}, d ${f2(Wm.h - M.h)}), luma ${f3(Wm.Y)} (meadow ${f3(M.Y)}), sat ${f3(Wm.s)}`);
  const high = V.filter((p) => p.y >= 2.6 && p.rise1 < 0.9 && p.t16 < 2);
  const Hm = { h: mean(high.map((p) => p.h)), s: mean(high.map((p) => p.s)), Y: mean(high.map((p) => p.Y)) };
  ok('G3 plateau tops (y >= 2.6): warmer (hue <= meadow - 4 deg) and drier (sat <= meadow - 0.02)', high.length > 50 && Hm.h <= M.h - 4 && Hm.s <= M.s - 0.02,
    `${high.length} vertices: hue ${f2(Hm.h)} (d ${f2(Hm.h - M.h)}), sat ${f3(Hm.s)} (d ${f3(Hm.s - M.s)}), luma ${f3(Hm.Y)}`);
  // AO bands vs LOCAL open grass: each band vertex against the open grass 3-8 u away at a similar height (same broad colour
  const OG = new Map(), og = 2; for (const p of V) if (p.t3 === 0 && p.rise3 < 0.3 && p.dw > 3) { const k = Math.floor(p.x / og) + ',' + Math.floor(p.z / og); (OG.get(k) || OG.set(k, []).get(k)).push(p); }
  const ratio = (sel) => { let num = 0, den = 0, n = 0; for (const p of V) { if (!sel(p)) continue; let s = 0, c = 0; const cx = Math.floor(p.x / og), cz = Math.floor(p.z / og);
      for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) for (const q of OG.get((cx + a) + ',' + (cz + b)) || []) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d >= 3 && d <= 8 && Math.abs(q.y - p.y) < 0.5) { s += q.Y; c++; } }
      if (c < 5) continue; num += p.Y; den += s / c; n++; }
    return { r: den ? num / den : NaN, n }; };
  const cliff = ratio((p) => p.rise1 >= 0.9 && p.dw > 1.5 && p.t16 === 0);
  ok('G4 cliff-base band: grass at the foot of a riser (>= 0.9 u higher within 1 u) <= 0.92 x the luma of local open grass', cliff.n > 50 && cliff.r <= 0.92, `${cliff.n} vertices, luma ratio ${f3(cliff.r)}`);
  const forest = ratio((p) => p.t16 >= 2 && p.rise1 < 0.9 && p.dw > 1.5);
  ok('G5 forest edge: grass with >= 2 trees within 1.6 u <= 0.92 x the luma of local open grass', forest.n > 50 && forest.r <= 0.92, `${forest.n} vertices, luma ratio ${f3(forest.r)}`);
  ok('G6 calm grass: open-meadow mean saturation 0.25-0.46 (depth from light, not saturation)', M.s >= 0.25 && M.s <= 0.46, `meadow sat ${f3(M.s)}, value ${f3(mean(meadow.map((p) => p.v)))}, hue ${f2(M.h)}`);
}
// S1-S3. STONE: warm taupe / ochre, lighter top edges, darker feet; the underside fades toward the haze
{
  const riser = [], wallTop = [], wallBase = [], wallAll = [], rTop = [], rFoot = [], uUp = [], uDeep = [];
  for (const id of bp.order) { const pc = bp.pieces[id], Pp = pc.positions, C0 = pc.colors, C = colsOf(id), pv = pc.pivot;
    for (let t = 0; t < pc.faceCount; t++) { const tg = pc.tags[t], o = t * 9;
      if (tg === TAG.top) { const n = faceN(Pp, o); if (1 - n[1] < 0.5 || baseClass(C0, o) !== 'stone') continue;
        for (let q = 0; q < 3; q++) { const oo = o + q * 3, c = [0, 1, 2].map((k) => toS(C[oo + k])); riser.push(c);
          const x = Pp[oo] + pv[0], y = Pp[oo + 1] + pv[1], z = Pp[oo + 2] + pv[2], hi = extremeWithin(topMax, x, z, 1.5, true), lo = extremeWithin(topMin, x, z, 1.5, false);
          if (hi - lo > 0.8) { const u = (y - lo) / (hi - lo); if (u > 0.75) rTop.push(luma(c)); else if (u < 0.25) rFoot.push(luma(c)); } }
        continue; }
      if (tg !== TAG.coast && tg !== TAG.under) continue;
      for (let q = 0; q < 3; q++) { const oo = o + q * 3, x = Pp[oo] + pv[0], y = Pp[oo + 1] + pv[1], z = Pp[oo + 2] + pv[2], hr = bp.H(x, z) - y, c = [0, 1, 2].map((k) => toS(C[oo + k]));
        if (tg === TAG.coast) { if (hr >= 0.3 && hr <= 2.2) wallAll.push(c); if (hr >= 0.3 && hr <= 0.7) wallTop.push(luma(c)); else if (hr >= 1.4 && hr <= 2.1) wallBase.push(luma(c)); }
        else if (hr >= 2.5 && hr <= 5) uUp.push(c); else if (hr >= 10) uDeep.push(c); } } }
  const st = meanCol([...riser, ...wallAll]), [sh, ss, sv] = hsv(...st);
  ok('S1 risers + coast walls are warm red-brown taupe stone (Worldseed family): hue 5-30 deg, saturation 0.14-0.30', sh >= 5 && sh <= 30 && ss >= 0.14 && ss <= 0.30,
    `${riser.length + wallAll.length} corners, mean sRGB (${st.map((v) => Math.round(v * 255)).join(', ')}) -> hue ${f2(sh)}, sat ${f3(ss)}, value ${f3(sv)}`);
  const wr = mean(wallTop) / mean(wallBase), rr = mean(rTop) / mean(rFoot);
  ok('S2 lighter top edges, darker feet: coast wall top / base >= 1.08 x luma; riser top / foot quarter >= 1.08 x', wr >= 1.08 && rr >= 1.08,
    `wall ${f3(mean(wallTop))} / ${f3(mean(wallBase))} = ${f3(wr)} (${wallTop.length} / ${wallBase.length}); riser ${f3(mean(rTop))} / ${f3(mean(rFoot))} = ${f3(rr)} (${rTop.length} / ${rFoot.length})`);
  const up = meanCol(uUp), dp = meanCol(uDeep), haze = hex01(P.sky.below), dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const lr = luma(dp) / luma(up), du = dist(up, haze), dd = dist(dp, haze);
  ok('S3 the underside does not darken toward the tip (deep / upper luma >= 1.0) and its deep part is closer to the haze (sky.below)', lr >= 1.0 && dd <= du - 0.02,
    `upper (${up.map((v) => Math.round(v * 255)).join(',')}) deep (${dp.map((v) => Math.round(v * 255)).join(',')}): luma ratio ${f3(lr)}; distance to ${P.sky.below}: upper ${f3(du)}, deep ${f3(dd)}`);
}
// R1-R5. ON THE CAPTURES
{
  const dir = path.join(SHOTS, shots, 'raw'), have = (v) => fs.existsSync(path.join(dir, v + '.png'));
  const met = (d, v) => { const mf = path.join(d, v + '_mask.png'); return imageMetrics(readPNG(path.join(d, v + '.png')), fs.existsSync(mf) ? readPNG(mf) : null); };
  // the gameplay views: <shots>_gameplay/raw/golden (phase layout) or, from the look core on, <shots>/raw next to the 7 views
  const gdir = [path.join(SHOTS, shots + '_gameplay', 'raw', 'golden'), dir].find((d) => fs.existsSync(path.join(d, 'default_mobile.png'))) || path.join(SHOTS, shots + '_gameplay', 'raw', 'golden');
  { const sets = [['farm', path.join(dir, 'farm.png')], ['default_mobile', path.join(gdir, 'default_mobile.png')], ['default_desktop', path.join(gdir, 'default_desktop.png')]].filter(([, f]) => fs.existsSync(f));
    if (!sets.length) ok(`R1 terrainSat 0.30-0.45 in the farm + gameplay views (${shots})`, true, 'SKIP (no captures)', true);
    else { const rows = sets.map(([n, f]) => { const mf = f.replace(/\.png$/, '_mask.png'), m = imageMetrics(readPNG(f), fs.existsSync(mf) ? readPNG(mf) : null); return [n, m]; });
      const full = have('full') ? met(dir, 'full') : null;
      ok(`R1 moderate saturation: terrainSat (island pixels) 0.30-0.50 in default_mobile / default_desktop, 0.30-0.52 in farm (Phase 1: 0.59-0.63; look core: the warmer, greener lawn) (${shots})`,
        rows.length === 3 && rows.every(([n, m]) => m.masked && m.terrainSat >= 0.30 && m.terrainSat <= (n === 'farm' ? 0.52 : 0.50)),
        rows.map(([n, m]) => `${n} ${f3(m.terrainSat)}${m.masked ? '' : ' (NO MASK)'} (meanSat ${f3(m.meanSat)})`).join(', ') + (full ? `; full ${f3(full.terrainSat)}` : '')); } }
  const views = Object.keys(A.views).filter(have);
  if (!views.length) ok(`R2 stone renders in the warm red-brown taupe family (${shots})`, true, 'SKIP (no captures)', true);
  else { const rows = [], bad = [];
    for (const v of views) {   // wall + riser pixels (mask): the LIT half (brighter half by value) carries the stone colour; the shade half only must not be black
      const img = readPNG(path.join(dir, v + '.png')), mk = readPNG(path.join(dir, v + '_mask.png')), px = [];
      for (let i = 0; i < img.data.length; i += 4) { const R = mk.data[i] > 127, Gm = mk.data[i + 1] > 127, Bm = mk.data[i + 2] > 127; if (!(R && !Bm)) continue;
        const c = [img.data[i] / 255, img.data[i + 1] / 255, img.data[i + 2] / 255]; px.push([...hsv(...c), luma(c)]); }
      if (px.length < img.width * img.height * 0.002) continue;
      px.sort((a, b) => a[2] - b[2]); const lit = px.slice(px.length >> 1), shade = px.slice(0, px.length >> 1);
      let sx = 0, sy = 0, ssum = 0; for (const [h, s] of lit) { sx += Math.cos(h * Math.PI / 180) * s; sy += Math.sin(h * Math.PI / 180) * s; ssum += s; }
      let hue = Math.atan2(sy, sx) * 180 / Math.PI; if (hue > 180) hue -= 360; const sat = ssum / lit.length, shL = shade[shade.length >> 1][3];
      const good = hue >= -60 && hue <= 35 && sat >= 0.08 && sat <= 0.35 && shL >= 0.12; rows.push(`${v} lit h${f2(hue)} s${f3(sat)}, shade median luma ${f3(shL)}`); if (!good) bad.push(v); }
    ok(`R2 stone (wall + riser pixels) in the warm red-brown taupe family: lit half hue -60..35 (violet-brown .. red-brown .. taupe; not ochre, not grey-blue), sat 0.08-0.35; shade half not black (median luma >= 0.12) (${shots})`, rows.length && !bad.length, (bad.length ? 'OUT: ' + bad.join(', ') + ' | ' : '') + rows.join('; ')); }
  if (!have('edge')) ok(`R3 underside melts into the haze (${shots})`, true, 'SKIP (no edge capture)', true);
  else { const img = readPNG(path.join(dir, 'edge.png')), mk = readPNG(path.join(dir, 'edge_mask.png')), Wd = img.width, Hd = img.height, rows = new Float64Array(Hd), rn = new Float64Array(Hd); let y0 = Hd, y1 = 0;
    for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) { const i = (y * Wd + x) * 4; if (!(mk.data[i] > 127 && mk.data[i + 1] <= 127 && mk.data[i + 2] <= 127)) continue;
      rows[y] += luma([img.data[i] / 255, img.data[i + 1] / 255, img.data[i + 2] / 255]); rn[y]++; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const bands = []; for (let k = 0; k < 8; k++) { let s = 0, n = 0; for (let y = Math.floor(y0 + (y1 - y0) * k / 8); y < Math.floor(y0 + (y1 - y0) * (k + 1) / 8); y++) { s += rows[y]; n += rn[y]; } bands.push(n > 500 ? s / n : null); }
    const b = bands.filter((x) => x != null), drop = Math.max(...b.map((x) => 1 - x / b[0]));
    ok(`R3 underside (edge view): no band > 10 % darker than the top band; lowest band >= 0.55 (${shots})`, b.length >= 4 && drop <= 0.10 && b[b.length - 1] >= 0.55,
      `bands ${bands.map((x) => (x == null ? '-' : f3(x))).join(' ')}; max drop ${(drop * 100).toFixed(1)} %`); }
  const Z = hex01(P.sky.zenith).map((v) => v * 255);
  const topBand = (file, maskFile) => { const img = readPNG(file), mk = fs.existsSync(maskFile) ? readPNG(maskFile) : null, Wd = img.width, n = Math.max(3, Math.round(img.height * 0.03)), px = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < Wd; x++) { const i = (y * Wd + x) * 4; if (mk && (mk.data[i] > 127 || mk.data[i + 1] > 127 || mk.data[i + 2] > 127)) continue; px.push([img.data[i], img.data[i + 1], img.data[i + 2]]); } return px; };
  const med = (px) => [0, 1, 2].map((k) => pctl(px.map((p) => p[k]), 0.5));
  if (!fs.existsSync(path.join(gdir, 'default_mobile.png'))) ok(`R4 gameplay sky top = sky.zenith (${shots})`, true, `SKIP (no ${path.relative(ART, gdir)})`, true);
  else {
    const mob = topBand(path.join(gdir, 'default_mobile.png'), path.join(gdir, 'default_mobile_mask.png')), mm = med(mob), dm = Math.max(...mm.map((v, k) => Math.abs(v - Z[k])));
    let dDesk = Infinity, share = 0, dmd = [NaN, NaN, NaN];
    if (fs.existsSync(path.join(gdir, 'default_desktop.png'))) { const d = topBand(path.join(gdir, 'default_desktop.png'), path.join(gdir, 'default_desktop_mask.png'));
      const blue = d.filter((p) => { const [h, s] = hsv(p[0] / 255, p[1] / 255, p[2] / 255); return h >= 190 && h <= 230 && s >= 0.2; }); share = blue.length / Math.max(1, d.length);
      if (blue.length) { dmd = med(blue); dDesk = Math.max(...dmd.map((v, k) => Math.abs(v - Z[k]))); } }
    ok(`R4 gameplay sky (screen tint): default_mobile top band ~ zenith ${P.sky.zenith} (<= 14/255); default_desktop sky-blue top pixels ~ zenith (${shots})`, dm <= 14 && share >= 0.05 && dDesk <= 14,
      `mobile top median (${mm.map((v) => Math.round(v)).join(',')}) max |d| ${f2(dm)}; desktop: ${(share * 100).toFixed(1)} % sky-blue, median (${dmd.map((v) => Math.round(v)).join(',')}) max |d| ${f2(dDesk)}`); }
  const [gb, ga] = gameDirs, views5 = Object.keys(A.views).filter((v) => fs.existsSync(path.join(gb, v + '.png')) && fs.existsSync(path.join(ga, v + '.png')));
  if (!views5.length) ok('R5 Game (current) unchanged vs 4956921', true, `SKIP (no captures in ${path.relative(ART, gb)} + ${path.relative(ART, ga)})`, true);
  else { const rows = []; let worst = 0, any8 = 0;
    for (const v of views5) { const a = readPNG(path.join(gb, v + '.png')), b = readPNG(path.join(ga, v + '.png')); let s = 0, n8 = 0;
      for (let i = 0; i < a.data.length; i += 4) { const d0 = Math.abs(a.data[i] - b.data[i]), d1 = Math.abs(a.data[i + 1] - b.data[i + 1]), d2 = Math.abs(a.data[i + 2] - b.data[i + 2]); s += d0 + d1 + d2; if (Math.max(d0, d1, d2) > 8) n8++; }
      const m = s / (3 * a.width * a.height); worst = Math.max(worst, m); any8 += n8; rows.push(`${v} ${m.toFixed(3)}${n8 ? ' (' + n8 + ' px > 8)' : ''}`); }
    ok('R5 Game (current) unchanged: every view mean |diff| <= 0.05 / 255, no pixel > 8 levels (4956921 vs now)', worst <= 0.05 && !any8, rows.join(', ')); }
}
function report() {
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
  console.log('\n  LOOK-BRIEF PHASE 2 CRITERIA (node)');
  console.log('  ' + '-'.repeat(100));
  for (const r of results) { if (!r.pass) fails++; console.log('  ' + (r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL') + '  ' + pad(r.name, 96) + '\n        ' + r.detail); }
  console.log('  ' + '-'.repeat(100)); console.log(`  ${results.length - fails}/${results.length} passed (${results.filter((r) => r.skip).length} skipped), ${fails} failed\n`);
}
report();
process.exit(results.every((r) => r.pass) ? 0 : 1);
