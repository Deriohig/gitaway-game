// water-bake.mjs -- THE WATER BAKE for the game (used by bake-water.mjs and tests/water.test.mjs).
// Spec: art/specs/2026-10-23-water-revamp-design.md, section 4.1. Encodings and constants: lib/water-core.mjs.
// =============================================================================
// One water map per wet piece (main, wetland, highland), piece-local, from the BAKED height grid (piece_<id>.height.bin, the
// NaN-aware bilinear lookup the game and the proof's ?baked=1 use), so the shore matches the terrain the game renders:
//   R depth        carved bodies: clamp(level - ground, 0, 1); the farm pond + stream are virtual (MAIN stays flat there): the
//                  pond's depth comes from the shore distance (0.25 u shallow rim, 0.35 u mid band, up to 0.45 u, wobbled), the
//                  stream's is a 0.18 u V across it
//   G shore        an exact Euclidean distance transform (Felzenszwalb) on a 4x supersampled water mask (so an islet comes out
//                  right), averaged back to the texels and blurred (sigma 0.06 u)
//   BA flow        lake: a Laplace solve on its water (river mouth = source, outflow = sink), so the current bends round the
//                  islet; pond: spring-fed, draining to the stream; hot spring: a slow radial welling; ribbons + tarn: none
// water_noise.bin: 128 x 128 RG8 tileable value noise (two decorrelated channels).
// Deterministic: same inputs -> byte-identical files.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import GT from './terrain.mjs';
import LOOK from '../../config/look.config.mjs';
import WORLD3 from '../../config/world.config.mjs';
import WC from './water-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MODELS = path.resolve(__dirname, '../../../public/models');
export const WATER_PIECES = ['main', 'wetland', 'highland'];
// a carved ribbon holds water at most this far (u) past its half width, even where the ground beside it is lower than its level
// (the river's head at the MAIN seam), so the water's edge always lies inside the ribbon mesh (0.2 u wider a side)
export const RIBBON_REACH = 0.15;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---- the baked height grid (public/models manifest entry piece_<id>.height) and its game-side lookup ----
export function loadGrid(id, modelsDir = MODELS) {
  const man = JSON.parse(fs.readFileSync(path.join(modelsDir, 'manifest.json'), 'utf8')), e = man.assets['piece_' + id].height;
  const b = fs.readFileSync(path.join(modelsDir, e.file));
  return { ...e, data: new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) };
}
// bilinear over the 4 cell corners, NaN corners (off the top) dropped and the weights renormalised; none finite -> NaN
export function gridHeight(g, x, z) {
  const [x0, z0] = g.origin, s = g.spacing, [nx, nz] = g.size, gx = (x - x0) / s, gz = (z - z0) / s, i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j;
  let sw = 0, sh = 0;
  const add = (ii, jj, w) => { if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || w <= 0) return; const h = g.data[jj * nx + ii]; if (Number.isFinite(h)) { sw += w; sh += w * h; } };
  add(i, j, (1 - u) * (1 - v)); add(i + 1, j, u * (1 - v)); add(i, j + 1, (1 - u) * v); add(i + 1, j + 1, u * v);
  return sw > 1e-9 ? sh / sw : NaN;
}

// ---- geometry helpers ----
export function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// nearest point on a polyline of { x, z, y, s, w } rows (attributes linear along each segment): { d, s, y, w, t }
export function nearestOnLine(line, x, z) {
  let best = { d: Infinity, s: 0, y: 0, w: 0, k: 0, t: 0 };
  for (let k = 0; k < line.length - 1; k++) {
    const a = line[k], b = line[k + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-12;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1), d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
    if (d < best.d) best = { d, s: a.s + (b.s - a.s) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, k, t };
  }
  return best;
}
const bboxOf = (pts) => pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);

// the game's stream: Water.tsx Stream() -> ribbon(): THREE.CatmullRomCurve3 (centripetal, the default) through the exported points
// (x, level, z), sampled by arc length (getPointAt); width 0.42 + 0.12 t
export function streamCurve(points) {
  return new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, p.level, p.z)));
}
// rows every `ds` world units along a curve / polyline: [{ x, z, y, s, w }] (s = arc length from the start, xz + y)
function curveRows(curve, ds, widthAt) {
  const L0 = curve.getLength(), n = Math.max(2, Math.ceil(L0 / ds)), rows = [];
  let s = 0, prev = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t);
    if (prev) s += p.distanceTo(prev);
    rows.push({ x: p.x, z: p.z, y: p.y, s, w: widthAt(t) }); prev = p;
  }
  return rows;
}
// exported ribbon points [{ x, z, level, width }] -> rows every ds (linear in between)
function polyRows(points, ds) {
  const P = points.map((p) => ({ x: p.x, z: p.z, y: p.level, w: p.width })), cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y, P[i].z - P[i - 1].z));
  const S = cum[cum.length - 1], n = Math.max(2, Math.ceil(S / ds)), rows = [];
  let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = (S * i) / n; while (k < P.length - 2 && cum[k + 1] < s) k++;
    const t = clamp((s - cum[k]) / (cum[k + 1] - cum[k] || 1), 0, 1), a = P[k], b = P[k + 1];
    rows.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, s, w: a.w + (b.w - a.w) * t });
  }
  return rows;
}

// (water rev 1, spec Revision 1 R1.2) the ART-OWNED farm stream's rows every ~ds u (world): GT.farmStreamLine through the exported
// points + steer (the game's THREE.CatmullRomCurve3 curve, from points[0] to the rim exit, width per point) -> [{ x, z, y, s, w }]
// (s = arc length in xz + y, like curveRows)
export function farmStreamRows(st, ds) {
  const ctrl = [...st.points, { ...st.steer, width: st.points[st.points.length - 1].width }];
  return restation(GT.farmStreamLine(ctrl, ds, 2000).map((p) => ({ x: p.x, z: p.z, y: p.level, s: 0, w: p.width })));
}

// exported ribbon points cut at arc length sB (as polyRows measures it: xz + level), the last point interpolated there
function clipPoints(points, sB) {
  const out = [points[0]]; let cum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], d = Math.hypot(b.x - a.x, b.level - a.level, b.z - a.z);
    if (cum + d >= sB) { const t = (sB - cum) / (d || 1); out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, level: a.level + (b.level - a.level) * t, width: a.width + (b.width - a.width) * t }); return out; }
    cum += d; out.push(b);
  }
  return out;
}

// ---- the water bodies of a piece, piece-local (x, z, y - pivot) ----
export function waterBodies(W, id, pivot) {
  const lx = (x) => x - pivot[0], lz = (z) => z - pivot[2], ly = (y) => y - pivot[1];
  const locPoly = (pts) => pts.map(([x, z]) => [lx(x), lz(z)]);
  const locRows = (rows) => rows.map((r) => ({ ...r, x: lx(r.x), z: lz(r.z), y: ly(r.y) }));
  const B = WORLD3.archipelago.blueprint.water;
  if (id === 'main' && W.main.stream.steer) {   // (water rev 1) the art-owned teardrop + its stream, ONE surface (spec Revision 1 R1.3)
    const pond = W.main.pond, st = W.main.stream, cap = pond.cap, mid = [(cap[0][0] + cap[1][0]) / 2, (cap[0][1] + cap[1][1]) / 2];
    return [
      { name: 'pond', kind: 'still', virtual: true, seam: true, poly: locPoly(pond.outline), level: ly(pond.level), flowSrc: [lx(pond.flowSpring[0]), lz(pond.flowSpring[1])], capAt: [lx(mid[0]), lz(mid[1])] },
      // (taper: the stream's V-channel deepens over its first 0.9 u, so there is no abrupt dark scour where the ribbon starts in the neck)
      { name: 'stream', kind: 'ribbon', virtual: true, seam: true, bank: 0, line: locRows(farmStreamRows(st, 0.05)), rowsAt: (ds) => farmStreamRows(st, ds), taper: 0.9 },
      seamRiverGhost(W, locRows, pivot),
    ];
  }
  if (id === 'main') {
    const pond = W.main.pond, st = W.main.stream;
    const curve = streamCurve(st.points);
    return [
      { name: 'pond', kind: 'still', virtual: true, poly: locPoly(pond.outline), level: ly(pond.level), at: [lx(pond.at[0]), lz(pond.at[1])], r: pond.r, theta: st.rimExit.theta },
      { name: 'stream', kind: 'ribbon', virtual: true, bank: 0, line: locRows(curveRows(curve, 0.05, (t) => 0.42 + 0.12 * t)), curve },
    ];
  }
  if (id === 'wetland') {
    const w = W.wetland;
    return [
      { name: 'lake', kind: 'still', virtual: false, poly: locPoly(w.lake.outline), level: ly(w.lake.level) },
      { name: 'river', kind: 'ribbon', virtual: false, bank: B.river.bank, line: locRows(polyRows(w.river.points, 0.05)), srcPoints: w.river.points, ...seamRiverHead(W, pivot, locRows) },
      { name: 'outflow', kind: 'ribbon', virtual: false, bank: B.outflow.bank, line: locRows(polyRows(w.outflow.points, 0.05)), srcPoints: w.outflow.points },
      ...seamStreamGhost(W, locRows, pivot),
    ];
  }
  if (id === 'highland') {
    const h = W.highland, pc = (pts) => { const b = bboxOf(pts); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
    const sp = locPoly(h.hotSpring.outline);
    return [
      { name: 'tarn', kind: 'still', virtual: false, poly: locPoly(h.tarn.outline), level: ly(h.tarn.level) },
      { name: 'spring', kind: 'still', virtual: false, poly: sp, level: ly(h.hotSpring.level), at: pc(sp) },
    ];
  }
  return [];
}
// region test: does body b claim (x, z)? (still: inside its outline; ribbon: within half its width (+ the carved bank))
function claims(b, x, z) {
  if (b.kind === 'still') { if (x < b.bb[0] || z < b.bb[1] || x > b.bb[2] || z > b.bb[3]) return null; return inPoly(b.poly, x, z) ? { level: b.level } : null; }
  if (x < b.bb[0] || z < b.bb[1] || x > b.bb[2] || z > b.bb[3]) return null;
  const n = nearestOnLine(b.line, x, z);
  // (water rev 1, the river's virtual head at the MAIN seam: within its width it holds water without the ground test, and its carved
  //  reach eases in over the head's last 0.8 u)
  if (b.vhead && n.s < b.vhead.len && n.d <= n.w / 2) return { level: n.y, d: n.d, hw: n.w / 2, s: n.s, vh: true };
  // (water rev 1, R1.4: past its brink a channel's water runs on over the edge for 0.4 u, within its width, with no ground under it, so
  //  the shore field never draws a contact line across the lip; `lat` = the signed offset left of the centreline)
  if (b.brinkS != null && n.s > b.brinkS && n.s <= b.brinkS + 0.4 && n.d <= n.w / 2) {
    const a = b.line[n.k], c = b.line[n.k + 1], tx = c.x - a.x, tz = c.z - a.z, tl = Math.hypot(tx, tz) || 1, fx = a.x + tx * n.t, fz = a.z + tz * n.t;
    return { level: n.y, d: n.d, hw: n.w / 2, s: n.s, vh: true, past: true, lat: ((x - fx) * -tz + (z - fz) * tx) / tl };
  }
  const reach = Math.min(b.bank, RIBBON_REACH) * (b.vhead ? smooth(b.vhead.len - 0.8, b.vhead.len, n.s) : 1);
  return n.d <= n.w / 2 + reach ? { level: n.y, d: n.d, hw: n.w / 2, s: n.s } : null;
}
// a line (rows { x, z, y, s, w }) at arc length s: the point, its level, width and unit tangent (xz)
function lineAt(line, s) {
  let k = 0; while (k < line.length - 2 && line[k + 1].s < s) k++;
  const a = line[k], b = line[k + 1], t = clamp((s - a.s) / (b.s - a.s || 1), 0, 1), tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
  return { x: a.x + tx * t, z: a.z + tz * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, tx: tx / tl, tz: tz / tl };
}
// past a channel's brink: the depth its brink cross-section has at the same signed offset (the carve stops at the cliff; the water
// curling over keeps the lip's depth)
function brinkDepth(b, c, grid) {
  const B = lineAt(b.line, b.brinkS - 0.02), x = B.x - B.tz * c.lat, z = B.z + B.tx * c.lat, g = gridHeight(grid, x, z);
  return Number.isFinite(g) ? Math.max(0, B.y - g) : 0;
}
function prepBodies(bodies) {
  for (const b of bodies) {
    if (b.kind === 'still') b.bb = bboxOf(b.poly);
    else { const wmax = Math.max(...b.line.map((r) => r.w)) / 2 + b.bank; const bb = bboxOf(b.line.map((r) => [r.x, r.z])); b.bb = [bb[0] - wmax, bb[1] - wmax, bb[2] + wmax, bb[3] + wmax]; }
  }
  return bodies;
}

// ---- exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher), in cells ----
const INF = 1e20;
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
// squared distance (cells) from every cell to the nearest cell with mask === target
function edt2d(mask, W, H, target) {
  const out = new Float64Array(W * H), n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = mask[y * W + x] === target ? 0 : INF; edt1d(f, H, d, v, z); for (let y = 0; y < H; y++) out[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = out[y * W + x]; edt1d(f, W, d, v, z); for (let x = 0; x < W; x++) out[y * W + x] = d[x]; }
  return out;
}
function blur(src, W, H, sigma) {
  const r = Math.ceil(sigma * 3), k = []; let ks = 0;
  for (let i = -r; i <= r; i++) { const w = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(w); ks += w; }
  for (let i = 0; i < k.length; i++) k[i] /= ks;
  const tmp = new Float64Array(W * H), out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * src[y * W + clamp(x + i, 0, W - 1)]; tmp[y * W + x] = s; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * tmp[clamp(y + i, 0, H - 1) * W + x]; out[y * W + x] = s; }
  return out;
}
// small deterministic value noise (lattice hash = GT.hash3), for the virtual depth wobble
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const h = (a, b) => GT.hash3(a, b, seed);
  return (h(ix, iz) * (1 - sx) + h(ix + 1, iz) * sx) * (1 - sz) + (h(ix, iz + 1) * (1 - sx) + h(ix + 1, iz + 1) * sx) * sz;
}

// ---- flow: Laplace potential on a body's cells (SOR, fixed iterations: deterministic), v = -grad(phi), rescaled ----
function laplaceFlow(cells, W, H, src, snk, iters = 1500, omega = 1.9) {
  const phi = new Float64Array(W * H).fill(0.5), list = [];
  for (let q = 0; q < W * H; q++) if (cells[q]) { list.push(q); if (src[q]) phi[q] = 1; if (snk[q]) phi[q] = 0; }
  for (let it = 0; it < iters; it++) {
    for (const q of list) {
      if (src[q] || snk[q]) continue;
      const x = q % W, y = (q - x) / W; let s = 0, n = 0;
      if (x > 0 && cells[q - 1]) { s += phi[q - 1]; n++; } if (x < W - 1 && cells[q + 1]) { s += phi[q + 1]; n++; }
      if (y > 0 && cells[q - W]) { s += phi[q - W]; n++; } if (y < H - 1 && cells[q + W]) { s += phi[q + W]; n++; }
      if (n) phi[q] = (1 - omega) * phi[q] + (omega * s) / n;
    }
  }
  const vx = new Float64Array(W * H), vz = new Float64Array(W * H);
  for (const q of list) {
    const x = q % W, y = (q - x) / W, at = (qq, ok) => (ok && cells[qq] ? phi[qq] : null);
    const xm = at(q - 1, x > 0), xp = at(q + 1, x < W - 1), zm = at(q - W, y > 0), zp = at(q + W, y < H - 1);
    const gx = xm != null && xp != null ? (xp - xm) / 2 : xp != null ? xp - phi[q] : xm != null ? phi[q] - xm : 0;
    const gz = zm != null && zp != null ? (zp - zm) / 2 : zp != null ? zp - phi[q] : zm != null ? phi[q] - zm : 0;
    vx[q] = -gx; vz[q] = -gz;
  }
  return { vx, vz, list, phi };
}
function rescaleFlow(F, p90, vmax) {
  const sp = F.list.map((q) => Math.hypot(F.vx[q], F.vz[q])).sort((a, b) => a - b), ref = sp[Math.floor(sp.length * 0.9)] || 1e-9, k = p90 / ref;
  for (const q of F.list) { let x = F.vx[q] * k, z = F.vz[q] * k; const m = Math.hypot(x, z); if (m > vmax) { x *= vmax / m; z *= vmax / m; } F.vx[q] = x; F.vz[q] = z; }
  return F;
}
// cells of `cells` nearest a point: those within r, growing r until at least `min` are found
function nearCells(cells, W, H, origin, texel, px, pz, r0, min = 6) {
  for (let r = r0; r < 5; r += 0.1) {
    const out = new Uint8Array(W * H); let n = 0;
    for (let q = 0; q < W * H; q++) { if (!cells[q]) continue; const x = q % W, y = (q - x) / W, cx = origin[0] + (x + 0.5) * texel, cz = origin[1] + (y + 0.5) * texel; if (Math.hypot(cx - px, cz - pz) <= r) { out[q] = 1; n++; } }
    if (n >= min) return out;
  }
  return new Uint8Array(W * H);
}

// ---- the virtual depth profiles (section 3.2 L1: the pond shows a 0.25 u shallow rim and a 0.35 u mid band) ----
export function pondDepth(sd, x, z) {
  const wob = sd > 0.12 ? 0.07 * (vnoise(x / 0.9, z / 0.9, 913) * 2 - 1) : 0, s = Math.max(0, sd + wob);
  if (s <= 0.25) return WC.BANDS[0] * (s / 0.25);
  if (s <= 0.6) return WC.BANDS[0] + (WC.BANDS[1] - WC.BANDS[0]) * ((s - 0.25) / 0.35);
  return WC.BANDS[1] + (0.45 - WC.BANDS[1]) * smooth(0.6, 1.25, s);
}
export function streamDepth(d, hw, x, z) {
  const wob = 1 + 0.12 * (vnoise(x / 0.7, z / 0.7, 517) * 2 - 1);
  return 0.18 * clamp(1 - d / hw, 0, 1) * wob;
}

// ---- one piece's map ----
export function bakeMap(id, bodies, grid) {
  prepBodies(bodies);
  const T = WC.TEXEL, SS = WC.SUPERSAMPLE, h = T / SS;
  let bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const b of bodies) bb = [Math.min(bb[0], b.bb[0]), Math.min(bb[1], b.bb[1]), Math.max(bb[2], b.bb[2]), Math.max(bb[3], b.bb[3])];
  // texel centres on the height grid's lattice (every 5th texel centre is a grid node), so the depth's extremes are exact
  const gx0 = grid.origin[0], gz0 = grid.origin[1];
  const ox = gx0 + Math.floor((bb[0] - WC.MARGIN - gx0) / grid.spacing) * grid.spacing - T / 2, oz = gz0 + Math.floor((bb[1] - WC.MARGIN - gz0) / grid.spacing) * grid.spacing - T / 2;
  const W = Math.ceil((bb[2] + WC.MARGIN - ox) / T / WC.SIZE_STEP) * WC.SIZE_STEP, H = Math.ceil((bb[3] + WC.MARGIN - oz) / T / WC.SIZE_STEP) * WC.SIZE_STEP;
  const origin = [+ox.toFixed(6), +oz.toFixed(6)];
  // 4x supersampled mask
  const SW = W * SS, SH = H * SS, mask = new Uint8Array(SW * SH);
  for (let j = 0; j < SH; j++) {
    const z = origin[1] + (j + 0.5) * h;
    for (let i = 0; i < SW; i++) {
      const x = origin[0] + (i + 0.5) * h;
      for (const b of bodies) {
        const c = claims(b, x, z); if (!c) continue;
        if (b.virtual || c.vh) { mask[j * SW + i] = 1; break; }
        const g = gridHeight(grid, x, z); if (Number.isFinite(g) && g < c.level) { mask[j * SW + i] = 1; break; }
      }
    }
  }
  const dIn = edt2d(mask, SW, SH, 0), dOut = edt2d(mask, SW, SH, 1), sdSub = new Float64Array(SW * SH);
  for (let q = 0; q < SW * SH; q++) sdSub[q] = mask[q] ? (Math.sqrt(dIn[q]) - 0.5) * h : -(Math.sqrt(dOut[q]) - 0.5) * h;
  const sd0 = new Float64Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let s = 0; for (let b = 0; b < SS; b++) for (let a = 0; a < SS; a++) s += sdSub[(j * SS + b) * SW + i * SS + a]; sd0[j * W + i] = s / (SS * SS); }
  const sd = blur(sd0, W, H, WC.SD_BLUR / T);
  // depth + body ownership at the texel centres
  const depth = new Float64Array(W * H), owner = new Int8Array(W * H).fill(-1), sOf = new Float64Array(W * H).fill(-1);
  for (let j = 0; j < H; j++) {
    const z = origin[1] + (j + 0.5) * T;
    for (let i = 0; i < W; i++) {
      const x = origin[0] + (i + 0.5) * T, q = j * W + i; let best = 0, who = -1;
      bodies.forEach((b, bi) => {
        const c = claims(b, x, z); if (!c) return;
        let d;
        if (b.seam && b.kind === 'ribbon') sOf[q] = c.s;
        // (water rev 1, R1.3: the seam stream's V comes from the UNION shore distance, so the pond's bands taper straight into it)
        if (b.virtual) d = b.kind === 'still' ? pondDepth(sd[q], x, z) : b.seam ? seamStreamDepth(sd[q], c.hw, x, z) : streamDepth(c.d, c.hw, x, z);
        else if (c.past) d = brinkDepth(b, c, grid);   // (past the brink: the depth of the brink's own cross-section, carried on)
        else { const g = gridHeight(grid, x, z); d = Number.isFinite(g) ? c.level - g : 0; }
        if (b.ghost) d = seamStreamDepth(sd[q], c.hw, x + b.pv[0], z + b.pv[1]);   // (a mask-only twin across the MAIN seam: the other side's depth)
        if (b.vhead) { const k = smooth(0.2, b.vhead.len, c.s); d = (1 - k) * seamStreamDepth(sd[q], c.hw, x + b.pv[0], z + b.pv[1]) + k * Math.max(0, d); }   // (the river's virtual head eases into its carve)
        if (b.taper && b.kind === 'ribbon') d *= smooth(0, b.taper, c.s);
        // depth = the deepest claim; the owner (whose flow the texel carries) = a still body over a ribbon (the ribbon tucks under
        // it there), else the deeper claim; a ghost never owns a texel another body claims
        if (b.ghost && who >= 0) { best = Math.max(best, d); return; }
        const wk = who >= 0 ? bodies[who].kind : null;
        if (who < 0 || (b.kind === 'still' && wk !== 'still') || (b.kind === wk && d > best)) who = bi;
        best = Math.max(best, d);
      });
      if (who >= 0 && bodies[who].seam && bodies[who].kind === 'ribbon') who = bodies.findIndex((bb) => bb.seam && bb.kind === 'still');   // (one surface: the pond owns the seam stream)
      if (WC.encode.sd(sd[q]) > 128 && who >= 0) { depth[q] = Math.max(0, best); owner[q] = who; }   // (wet = G > 128 after encoding: flow never leaks onto a G = 128 texel)
    }
  }
  // flow
  const vx = new Float64Array(W * H), vz = new Float64Array(W * H);
  bodies.forEach((b, bi) => {
    if (b.ghost) return;
    const cells = new Uint8Array(W * H); let n = 0; for (let q = 0; q < W * H; q++) if (owner[q] === bi) { cells[q] = 1; n++; }
    if (!n) return;
    let F = null;
    if (b.name === 'pond' && b.seam) F = seamFlow(cells, W, H, origin, T, b, bodies, sOf);   // (water rev 1: one solve over pond + stream)
    else if (b.name === 'pond') {
      const ux = Math.cos(b.theta), uz = Math.sin(b.theta);
      const src = nearCells(cells, W, H, origin, T, b.at[0] - ux * b.r * 0.55, b.at[1] - uz * b.r * 0.55, 0.35);
      const snk = nearCells(cells, W, H, origin, T, b.at[0] + ux * b.r * 0.85, b.at[1] + uz * b.r * 0.85, 0.3);
      F = rescaleFlow(laplaceFlow(cells, W, H, src, snk), 0.035, 0.08);
    } else if (b.name === 'lake' && b.mouth && b.exit) {
      const src = nearCells(cells, W, H, origin, T, b.mouth[0], b.mouth[1], 0.6), snk = nearCells(cells, W, H, origin, T, b.exit[0], b.exit[1], 0.6);
      F = rescaleFlow(laplaceFlow(cells, W, H, src, snk), 0.05, 0.15);
    } else if (b.name === 'spring') {
      F = { vx: new Float64Array(W * H), vz: new Float64Array(W * H), list: [] };
      for (let q = 0; q < W * H; q++) if (cells[q]) { const x = origin[0] + ((q % W) + 0.5) * T, z = origin[1] + (Math.floor(q / W) + 0.5) * T, dx = x - b.at[0], dz = z - b.at[1], r = Math.hypot(dx, dz) || 1e-9, m = 0.03 * smooth(0, 0.15, r);
        F.vx[q] = (dx / r) * m; F.vz[q] = (dz / r) * m; F.list.push(q); }
    }
    if (F) for (const q of F.list) { vx[q] = F.vx[q]; vz[q] = F.vz[q]; }
  });
  const bytes = Buffer.alloc(W * H * 4);
  for (let q = 0; q < W * H; q++) {
    bytes[q * 4] = WC.encode.depth(depth[q]); bytes[q * 4 + 1] = WC.encode.sd(clamp(sd[q], -1, 1));
    bytes[q * 4 + 2] = WC.encode.flow(vx[q]); bytes[q * 4 + 3] = WC.encode.flow(vz[q]);
  }
  return { id, bytes, origin, texel: T, size: [W, H], stats: { wet: sd.reduce((n, s) => n + (s > 0 ? 1 : 0), 0), maxDepth: Math.max(...depth) } };
}

// ---- the tileable noise: 128 x 128 RG8, value-noise fbm on periodic lattices (8, 16, 32 cells across) ----
export function bakeNoise() {
  const S = WC.NOISE_SIZE, out = Buffer.alloc(S * S * 2), OCT = [[8, 0.6], [16, 0.28], [32, 0.12]];
  for (let c = 0; c < 2; c++) {
    const v = new Float64Array(S * S); let mn = Infinity, mx = -Infinity;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let s = 0;
      OCT.forEach(([P, w], o) => {
        // (each octave's lattice is offset by a non-integer number of pixels, so no octave's flat lattice lines coincide)
        const off = 0.5 + o * 5.37, fx = ((x + off) / S) * P, fy = ((y + off * 1.31) / S) * P, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const qx = tx * tx * tx * (tx * (tx * 6 - 15) + 10), qy = ty * ty * ty * (ty * (ty * 6 - 15) + 10), seed = 7001 + o * 131 + c * 7919;
        const hh = (a, b) => GT.hash3(((a % P) + P) % P, ((b % P) + P) % P, seed);
        s += w * ((hh(ix, iy) * (1 - qx) + hh(ix + 1, iy) * qx) * (1 - qy) + (hh(ix, iy + 1) * (1 - qx) + hh(ix + 1, iy + 1) * qx) * qy);
      });
      v[y * S + x] = s; mn = Math.min(mn, s); mx = Math.max(mx, s);
    }
    for (let q = 0; q < S * S; q++) out[q * 2 + c] = Math.round(((v[q] - mn) / (mx - mn)) * 255);
  }
  return out;
}

// ---- MESHES: water_<piece>.glb (piece-local, one opaque placeholder material `Water` the game replaces) ----
function polyEdgeDist(poly, x, z) {
  let d = Infinity;
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1e-12), 0, 1);
    d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return d;
}
// where a ribbon meets a still body it dips 0.01 u under that body's surface (inside it, easing back over 0.5 u outside), so the
// still body (drawn first, writing depth) covers the join and nothing is blended twice
function tuckRows(rows, stills) {
  for (const r of rows) for (const b of stills) {
    const target = b.level - 0.01;
    if (inPoly(b.poly, r.x, r.z)) r.y = Math.min(r.y, target);
    else { const d = polyEdgeDist(b.poly, r.x, r.z); if (d < 0.5) r.y = Math.min(r.y, target + (r.y - target) * smooth(0, 0.5, d)); }
  }
  return rows;
}
const restation = (rows) => { let s = 0; rows.forEach((r, i) => { if (i) s += Math.hypot(r.x - rows[i - 1].x, r.y - rows[i - 1].y, r.z - rows[i - 1].z); r.s = s; }); return rows; };
function orientUp(pos, idx) {   // every triangle faces +y
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vz = pos[c + 2] - pos[a + 2];
    if (uz * vx - ux * vz < 0) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
  }
  return idx;
}
function stillMesh(b) {
  const contour = b.poly.map(([x, z]) => new THREE.Vector2(x, z)), faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = [], nor = [], uv = [];
  for (const [x, z] of b.poly) { pos.push(x, b.level, z); nor.push(0, 1, 0); uv.push(x, z); }
  return { pos, nor, uv, idx: orientUp(pos, faces.flat()) };
}
// ribbon: a vertex pair per row (v = 0 left, 1 right), u = u0 + arc length (world units)
function ribbonMesh(rows, u0, extra, extraAt = null) {   // (extraAt(row): a per-row extra width instead of `extra`; a row with ax / az / hw keeps that across + half width)
  const pos = [], nor = [], uv = [], idx = [];
  rows.forEach((r, i) => {
    const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
    const nx = r.ax != null ? r.ax : -tz / tl, nz = r.ax != null ? r.az : tx / tl, hw = r.hw != null ? r.hw : r.w / 2 + (extraAt ? extraAt(r) : extra);
    pos.push(r.x + nx * hw, r.y, r.z + nz * hw, r.x - nx * hw, r.y, r.z - nz * hw); nor.push(0, 1, 0, 0, 1, 0); uv.push(u0 + r.s, 0, u0 + r.s, 1);
    if (i) { const q = (i - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  });
  return { pos, nor, uv, idx: orientUp(pos, idx) };
}
// the baked rock (piece_<id>.glb's own mesh), bucketed in xz: distance + inside (vertical ray parity) queries
export async function loadRock(id, modelsDir = MODELS) {
  const { NodeIO } = await import('@gltf-transform/core');
  const doc = await new NodeIO().read(path.join(modelsDir, `piece_${id}.glb`)), mesh = doc.getRoot().listMeshes().find((m) => m.getName() === 'piece_' + id), pr = mesh.listPrimitives()[0];
  const P = pr.getAttribute('POSITION').getArray(), I = pr.getIndices().getArray(), CS = 0.5, cells = new Map(), tris = [];
  for (let t = 0; t < I.length; t += 3) {
    const tri = [0, 1, 2].map((k) => [P[I[t + k] * 3], P[I[t + k] * 3 + 1], P[I[t + k] * 3 + 2]]); tris.push(tri);
    const x0 = Math.floor(Math.min(tri[0][0], tri[1][0], tri[2][0]) / CS), x1 = Math.floor(Math.max(tri[0][0], tri[1][0], tri[2][0]) / CS);
    const z0 = Math.floor(Math.min(tri[0][2], tri[1][2], tri[2][2]) / CS), z1 = Math.floor(Math.max(tri[0][2], tri[1][2], tri[2][2]) / CS);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx + ',' + gz; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(tris.length - 1); }
  }
  const near = (x, z, r) => { const s = new Set(); for (let gx = Math.floor((x - r) / CS); gx <= Math.floor((x + r) / CS); gx++) for (let gz = Math.floor((z - r) / CS); gz <= Math.floor((z + r) / CS); gz++) for (const t of cells.get(gx + ',' + gz) || []) s.add(t); return s; };
  return {
    dist(p) { let d2 = Infinity; for (const t of near(p[0], p[2], 0.6)) d2 = Math.min(d2, pointTri2(p, ...tris[t])); return Math.sqrt(d2); },
    inside(p) { let n = 0; for (const t of near(p[0], p[2], 0)) { const [a, b, c] = tris[t], det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]); if (Math.abs(det) < 1e-12) continue;
      const l1 = ((p[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (p[2] - a[2])) / det, l2 = ((b[0] - a[0]) * (p[2] - a[2]) - (p[0] - a[0]) * (b[2] - a[2])) / det;
      if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1 && a[1] + l1 * (b[1] - a[1]) + l2 * (c[1] - a[1]) > p[1]) n++; } return n % 2 === 1; },
  };
}
// (water rev 1, R1.4) the piece's rendered top: the highest surface of ANY of the piece GLB's meshes (the top + its skirts) over (x, z),
// piece-local; -Infinity off the piece. A fall's brink is where it ends along the channel.
export async function loadTop(id, modelsDir = MODELS) {
  const { NodeIO } = await import('@gltf-transform/core');
  const doc = await new NodeIO().read(path.join(modelsDir, `piece_${id}.glb`)), CS = 0.5, cells = new Map(), tris = [];
  for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) {
    const P = pr.getAttribute('POSITION').getArray(), I = pr.getIndices().getArray();
    for (let t = 0; t < I.length; t += 3) {
      const tri = [0, 1, 2].map((k) => [P[I[t + k] * 3], P[I[t + k] * 3 + 1], P[I[t + k] * 3 + 2]]); tris.push(tri);
      for (let gx = Math.floor(Math.min(tri[0][0], tri[1][0], tri[2][0]) / CS); gx <= Math.floor(Math.max(tri[0][0], tri[1][0], tri[2][0]) / CS); gx++)
        for (let gz = Math.floor(Math.min(tri[0][2], tri[1][2], tri[2][2]) / CS); gz <= Math.floor(Math.max(tri[0][2], tri[1][2], tri[2][2]) / CS); gz++) { const k = gx + ',' + gz; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(tris.length - 1); }
    }
  }
  return (x, z) => { let best = -Infinity; for (const t of cells.get(Math.floor(x / CS) + ',' + Math.floor(z / CS)) || []) { const [a, b, c] = tris[t], det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]); if (Math.abs(det) < 1e-12) continue;
    const l1 = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / det, l2 = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / det;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l1 + l2 <= 1 + 1e-9) best = Math.max(best, a[1] + l1 * (b[1] - a[1]) + l2 * (c[1] - a[1])); } return best; };
}
// the brink on a channel's line (piece-local rows { x, z, y, s }): the arc length where the piece's top stops being under the water
// (the highest surface within 0.8 u below the level), found by bisection to 1e-4 u; null if the channel never leaves the piece
export function channelBrink(line, top) {
  const at = (s) => { let k = 0; while (k < line.length - 2 && line[k + 1].s < s) k++; const a = line[k], b = line[k + 1], t = clamp((s - a.s) / (b.s - a.s || 1), 0, 1); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t }; };
  const land = (s) => { const p = at(s); return top(p.x, p.z) >= p.y - 0.8; }, S = line[line.length - 1].s;
  if (land(S)) return null;
  let lo = S; while (lo > 0 && !land(lo)) lo -= 0.05; if (lo <= 0) return null;
  let hi = lo + 0.05; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (land(m)) lo = m; else hi = m; }
  return +lo.toFixed(5);
}
// the brink's frame on a channel body (piece-local): the cliff edge where the channel crosses it, found on the two lines parallel to the
// centreline at its edges (+/- half width): Lc, Rc (the edge's crossings, left / right), M their middle, e the edge's tangent (left +),
// nC the edge's outward normal, t the channel's tangent at the brink, s1 the arc length where the first of its edges reaches the cliff
// (the channel is drawn with square rows up to s1, then ONE row along the edge itself, from Rc to Lc: an oblique cliff cuts the channel
// obliquely, so no part of the water's last row hangs past the edge or stops short of it)
export function brinkFrame(b, top) {
  const sB = b.brinkS, C = lineAt(b.line, sB), t = [C.tx, C.tz], n = [-C.tz, C.tx], hw = C.w / 2, land = (x, z) => top(x, z) >= C.y - 0.8;
  const edgeAt = (l) => {   // the land's end along the line parallel to the centreline at lateral offset l (arc from the brink, bisected)
    const P = (s) => [C.x + n[0] * l + t[0] * s, C.z + n[1] * l + t[1] * s];
    let s = 1.5; while (s > -1.5 && !land(...P(s))) s -= 0.05;
    let lo = s, hi = s + 0.05; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (land(...P(m))) lo = m; else hi = m; }
    return lo;
  };
  const sL = edgeAt(hw), sR = edgeAt(-hw), Lc = [C.x + n[0] * hw + t[0] * sL, C.z + n[1] * hw + t[1] * sL], Rc = [C.x - n[0] * hw + t[0] * sR, C.z - n[1] * hw + t[1] * sR];
  const el = Math.hypot(Lc[0] - Rc[0], Lc[1] - Rc[1]) || 1, e = [(Lc[0] - Rc[0]) / el, (Lc[1] - Rc[1]) / el];
  let nC = [e[1], -e[0]]; if (nC[0] * t[0] + nC[1] * t[1] < 0) nC = [-nC[0], -nC[1]];
  return { sB, s1: Math.min(sB + Math.min(sL, sR), sB - 0.1), t, n, nC, e, Lc, Rc, M: [(Lc[0] + Rc[0]) / 2, (Lc[1] + Rc[1]) / 2], hwEnd: el / 2, y: C.y, oblique: Math.acos(Math.min(1, Math.abs(e[0] * n[0] + e[1] * n[1]))) * 180 / Math.PI };
}
function pointTri2(p, a, b, c) {   // squared distance point -> triangle (Ericson, Real-Time Collision Detection 5.1.5)
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], at = (o, d, s) => [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); let q;
  if (d1 <= 0 && d2 <= 0) q = a;
  else { const bp2 = sub(p, b), d3 = dot(ab, bp2), d4 = dot(ac, bp2);
    if (d3 >= 0 && d4 <= d3) q = b;
    else { const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) q = at(a, ab, d1 / (d1 - d3));
      else { const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) q = c;
        else { const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) q = at(a, ac, d2 / (d2 - d6));
          else { const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) q = at(b, sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
            else { const den = 1 / (va + vb + vc); q = at(at(a, ab, vb * den), ac, vc * den); } } } } } }
  const d = sub(p, q); return dot(d, d);
}
// a waterfall WITH A BRINK (water rev 1, R1.4): from its channel's last row E (on the brink; `aStart` = that row's across, left +,
// `wCh` = its width). Horizontally it leaves along the channel's tangent dirs.t and turns to the cliff edge's outward normal dirs.nC over
// its first 0.3 u (the outflow meets its cliff ~48 deg off square). The outward travel as a function of the drop d is max(the exported
// profile, a ballistic arc K sqrt(d D / (d + D)), D = 1.5 u): the arc leaves the brink LEVEL (a horizontal tangent: the water curls
// over, ~0.13 u out at 0.05 u down at the least K), then steepens and saturates, so the sheet hangs near vertically below. K is the
// least (>= 0.6) for which every row more than 0.1 u below the lip clears the baked rock by FALL_CLEAR u, so where the cliff stands
// proud the water arcs out further (never a rigid push that turns the curl into a level shelf). Rows dense at the top; width 1.0x ->
// 1.5x the channel's (the top row IS the channel's last row); the across turns from the channel's to perpendicular-to-nC over 0.3 u
const FALL_CLEAR = 0.13, FALL_ARC_D = 1.5, FALL_ARC_KMIN = 0.6;
export function fallRowsBrink(E, dirs, profile, wCh, rock, aStart) {
  const P = profile.map(([o, dy]) => [o, -dy]), Dmax = P[P.length - 1][1];   // (offset, drop)
  const oAt = (d) => { let k = 0; while (k < P.length - 2 && P[k + 1][1] < d) k++; const a = P[k], b = P[k + 1], t = clamp((d - a[1]) / (b[1] - a[1] || 1), 0, 1); return a[0] + (b[0] - a[0]) * t; };
  const { t: T, nC } = dirs; let n = [-nC[1], nC[0]]; if (n[0] * aStart[0] + n[1] * aStart[1] < 0) n = [-n[0], -n[1]];
  // the horizontal path: travel o along a direction turning from T to nC over the first 0.3 u -> [x, z] offset (a table every 0.005 u)
  const HS = 0.005, H = [[0, 0]]; for (let i = 1; i <= 1200; i++) { const o = (i - 0.5) * HS, k = smooth(0, 0.3, o), dx = T[0] * (1 - k) + nC[0] * k, dz = T[1] * (1 - k) + nC[1] * k, dl = Math.hypot(dx, dz) || 1; H.push([H[i - 1][0] + (dx / dl) * HS, H[i - 1][1] + (dz / dl) * HS]); }
  const hAt = (o) => { const f = Math.min(H.length - 2, o / HS), i = Math.floor(f), t = f - i; if (o / HS > H.length - 1) { const e = H[H.length - 1], x = o - (H.length - 1) * HS; return [e[0] + nC[0] * x, e[1] + nC[1] * x]; } return [H[i][0] + (H[i + 1][0] - H[i][0]) * t, H[i][1] + (H[i + 1][1] - H[i][1]) * t]; };
  const ss0 = [0, 0.02, 0.045, 0.075, 0.1, 0.125, 0.15, 0.175, 0.2, 0.235, 0.27, 0.31, 0.35];
  const build = (K) => {
    const f = (d) => Math.max(oAt(d), K * Math.sqrt((d * FALL_ARC_D) / (d + FALL_ARC_D))), N = 1600, pts = [], cum = [0];
    for (let j = 0; j <= N; j++) { const d = Dmax * (j / N) ** 2; pts.push([f(d), d]); if (j) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1])); }
    const L0 = cum[N], ss = ss0.slice(); for (let s = 0.55; s < L0 - 0.1; s += 0.2) ss.push(s); ss.push(L0);
    let k = 0;
    return ss.map((s) => { while (k < N - 1 && cum[k + 1] < s) k++; const t = clamp((s - cum[k]) / (cum[k + 1] - cum[k] || 1), 0, 1), o = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, d = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t, h = hAt(o);
      const kk = smooth(0, 0.3, s), ax = aStart[0] * (1 - kk) + n[0] * kk, az = aStart[1] * (1 - kk) + n[1] * kk, al = Math.hypot(ax, az);
      return { x: E.x + h[0], y: E.y - d, z: E.z + h[1], w: wCh * (1 + 0.5 * (s / L0)), ax: ax / al, az: az / al, drop: d }; });
  };
  const clear = (r) => { const hw = r.w / 2; return [0, hw, -hw].every((sd) => { const p = [r.x + r.ax * sd, r.y, r.z + r.az * sd]; return !rock.inside(p) && rock.dist(p) >= FALL_CLEAR; }); };
  let K = FALL_ARC_KMIN, rows = build(K);
  for (let g = 0; g < 200 && !rows.every((r) => r.drop <= 0.1 || clear(r)); g++) rows = build((K += 0.02));
  rows[0].x = E.x; rows[0].y = E.y; rows[0].z = E.z; rows[0].ax = aStart[0]; rows[0].az = aStart[1];
  console.log(`  fall: ballistic K ${K.toFixed(2)}, out ${rows.find((r) => r.drop >= 0.5) ? Math.hypot(rows.find((r) => r.drop >= 0.5).x - E.x, rows.find((r) => r.drop >= 0.5).z - E.z).toFixed(2) : '-'} u at 0.5 u down, ${rows.length} rows`);
  return restation(rows);
}
// the sheet's mesh: triangles wound to face out / up (the geometric side); normals up on its first (shared) row like the channel's
// surface, easing over 0.35 u to the old sheet's effective normal (its outside was drawn as a back face, i.e. lit with the inward
// normal), so below the brink it shades as before
export function fallMeshBrink(rows, u0, out) {
  const pos = [], nor = [], uv = [], idx = [], geo = [], sK = rows[0].s;
  rows.forEach((r, i) => {
    const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)], t = [b.x - a.x, b.y - a.y, b.z - a.z];
    let g = [-r.az * t[1], r.az * t[0] - r.ax * t[2], r.ax * t[1]]; const l = Math.hypot(...g) || 1; g = g.map((q) => q / l); if (g[0] * out[0] + g[1] + g[2] * out[1] < 0) g = g.map((q) => -q);
    const k = i === 0 ? 0 : smooth(sK, sK + 0.35, r.s); let nn = [-g[0] * k, (1 - k) - g[1] * k, -g[2] * k]; const nl = Math.hypot(...nn) || 1; nn = nn.map((q) => q / nl);
    geo.push(...g, ...g);
    const hw = r.w / 2; pos.push(r.x + r.ax * hw, r.y, r.z + r.az * hw, r.x - r.ax * hw, r.y, r.z - r.az * hw); nor.push(...nn, ...nn); uv.push(u0 + r.s, 0, u0 + r.s, 1);
    if (i) { const q = (i - 1) * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  });
  for (let t = 0; t < idx.length; t += 3) {
    const A = idx[t] * 3, B = idx[t + 1] * 3, C = idx[t + 2] * 3, u = [pos[B] - pos[A], pos[B + 1] - pos[A + 1], pos[B + 2] - pos[A + 2]], v = [pos[C] - pos[A], pos[C + 1] - pos[A + 1], pos[C + 2] - pos[A + 2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], gn = [geo[A] + geo[B] + geo[C], geo[A + 1] + geo[B + 1] + geo[C + 1], geo[A + 2] + geo[B + 2] + geo[C + 2]];
    if (f[0] * gn[0] + f[1] * gn[1] + f[2] * gn[2] < 0) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
  }
  return { pos, nor, uv, idx };
}
// the depth-only skirt: from the sheet's top row (the channel's last row, on the brink) it drops down the cliff face, each vertex pulled
// back along -out until it is inside the baked rock or within SKIRT_HUG u of it (never back out again), and its last row lies inside the
// rock. So the depth surface turns down at the brink like the terrain's own cliff edge (no step under the water's last row), and no
// skirt edge stands proud of the cliff. (Review of the evidence renders: following the sheet down the curl, its sides hung up to 0.25 u
// in front of the rock, and the ink pass outlined them as a floating box round the curl.)
const SKIRT_HUG = 0.03, SKIRT_DROPS = [0.03, 0.08, 0.16, 0.3, 0.5];
export function fallSkirt(rows, out, rock) {
  const E0 = rows[0], h = E0.w / 2, top = [[E0.x + E0.ax * h, E0.y, E0.z + E0.az * h], [E0.x - E0.ax * h, E0.y, E0.z - E0.az * h]], sk = [top], b = [0, 0];
  const at = (p, d, bb) => [p[0] - out[0] * bb, p[1] - d, p[2] - out[1] * bb];
  SKIRT_DROPS.forEach((d, i) => {
    const last = i === SKIRT_DROPS.length - 1;
    sk.push(top.map((p, j) => { while (b[j] < 1.5) { const q = at(p, d, b[j]); if (rock.inside(q) || (!last && rock.dist(q) <= SKIRT_HUG)) break; b[j] += 0.005; } return at(p, d, b[j]); }));
  });
  const pos = [], idx = []; sk.forEach((pr, i) => { pos.push(...pr[0], ...pr[1]); if (i) { const q = (i - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); } });
  return { pos, nor: pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), uv: new Array((pos.length / 3) * 2).fill(0), idx };
}
const hexLin = (hex) => [1, 3, 5].map((k) => { const c = parseInt(hex.slice(k, k + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
async function writeGlb(id, parts, colour) {
  const { Document, NodeIO } = await import('@gltf-transform/core');
  const doc = new Document(); doc.getRoot().getAsset().generator = 'gitaway-art-pipeline bake-water';
  const buf = doc.createBuffer(), mat = doc.createMaterial('Water').setBaseColorFactor([...hexLin(colour), 1]).setMetallicFactor(0).setRoughnessFactor(1).setAlphaMode('OPAQUE').setDoubleSided(false);
  const scene = doc.createScene('water_' + id);
  for (const p of parts) {
    const node = doc.createNode(p.name);
    if (p.empty) node.setTranslation(p.at.map((v) => +v.toFixed(5))).setExtras(p.extras || {});
    else {
      const prim = doc.createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(p.pos)).setBuffer(buf))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(Float32Array.from(p.nor)).setBuffer(buf))
        .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(Float32Array.from(p.uv)).setBuffer(buf))
        .setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(p.idx)).setBuffer(buf)).setMaterial(mat);
      node.setMesh(doc.createMesh(p.name).addPrimitive(prim).setExtras(p.extras || {}));
    }
    scene.addChild(node);
  }
  doc.getRoot().setDefaultScene(scene);
  return Buffer.from(await new NodeIO().writeBinary(doc));
}
const r4 = (v) => +(+v).toFixed(4);
// one piece's meshes + its water.json bodies
export async function bakeMeshes(id, bodies, W, pivot, uState, modelsDir = MODELS) {
  const parts = [], json = [], stills = bodies.filter((b) => b.kind === 'still'), tris = (m) => m.idx.length / 3;
  let nTris = 0;
  const add = (name, mesh, extras, body) => { parts.push({ name, ...mesh, extras }); nTris += tris(mesh); json.push(body); };
  for (const b of stills.filter((q) => !q.seam)) add('water_' + b.name, stillMesh(b), { body: b.name, kind: 'still', level: r4(b.level) },
    { node: 'water_' + b.name, kind: 'still', palette: WC.BODY_PALETTE[b.name], level: r4(b.level), virtual: !!b.virtual, flow: b.name !== 'tarn', length: null, fillFrom: null, ripples: WC.RIPPLE_BODIES[b.name] || null });
  const ribbons = {};
  for (const b of bodies.filter((q) => q.kind === 'ribbon' && !q.ghost)) {
    // (water rev 1, R1.4: a channel with a brink is drawn only up to it; its carved extra width narrows to the water's own over its last
    //  0.4 u, so its last row is exactly the fall's top row)
    const BF = b.brinkS != null ? brinkFrame(b, await loadTop(id, modelsDir)) : null;   // (square rows to BF.s1, then one row along the cliff edge)
    let rows = b.rowsAt ? b.rowsAt(0.2) : b.name === 'stream' ? curveRows(b.curve, 0.2, (t) => 0.42 + 0.12 * t) : polyRows(BF ? clipPoints(b.srcPoints, BF.s1) : b.srcPoints, 0.2);
    rows = rows.map((r) => ({ ...r, x: r.x - pivot[0], z: r.z - pivot[2], y: r.y - pivot[1] }));
    if (BF) rows.push({ x: BF.M[0], z: BF.M[1], y: BF.y, s: 0, w: 2 * BF.hwEnd, ax: BF.e[0], az: BF.e[1], hw: BF.hwEnd, edge: true });
    rows = b.seam ? restation(rows) : restation(tuckRows(rows, stills));   // (the seam stream shares the pond's cap row: no tuck)
    const u0 = b.name === 'stream' ? 0 : b.name === 'river' ? uState.stream : uState.riverEnd, L = rows[rows.length - 1].s, L1 = BF ? rows[rows.length - 2].s : L;
    const extraAt = BF ? (r) => 0.2 * (1 - smooth(L1 - 0.45, L1 - 0.02, r.s)) : null;
    const mesh = b.vhead ? ribbonMeshTwist(rows, u0, 0.2, b.vhead.aStart, b.vhead.twist) : ribbonMesh(rows, u0, b.virtual ? 0 : 0.2, extraAt);
    // the channel's last row as its mesh draws it: the across (left +) and the half width (the fall's top row is exactly this row)
    const eA = b.seam ? lineAt(b.line, b.line[b.line.length - 1].s) : (() => { const a = rows[rows.length - 2], c = rows[rows.length - 1], tl = Math.hypot(c.x - a.x, c.z - a.z) || 1; return { tx: (c.x - a.x) / tl, tz: (c.z - a.z) / tl }; })();
    const rE = rows[rows.length - 1];
    ribbons[b.name] = { rows, u0, L, BF, endAcross: rE.ax != null ? [rE.ax, rE.az] : [-eA.tz, eA.tx], endHw: rE.hw != null ? rE.hw : rE.w / 2 + (b.seam || b.virtual ? 0 : extraAt ? extraAt(rE) : 0.2) };
    if (b.name === 'stream') uState.stream = L; if (b.name === 'river') uState.riverEnd = u0 + L;
    if (b.seam) {   // (water rev 1, R1.3) ONE surface: water_pond = the pond polygon + this ribbon from its cap row to the rim exit
      const pb = stills.find((q) => q.seam), mm = seamMesh(pb, b, rows);
      add('water_' + pb.name, mm.mesh, { body: pb.name, kind: 'still', level: r4(pb.level) },
        { node: 'water_' + pb.name, kind: 'still', palette: WC.BODY_PALETTE[pb.name], level: r4(pb.level), virtual: true, flow: true, uStart: 0, length: r4(L), fillFrom: null,
          join: { u0: r4(mm.uJ), ramp: 1.5, uEnd: r4(L), handover: 1.0, to: 'river' }, ripples: WC.RIPPLE_BODIES[pb.name] || null, note: 'the farm pond AND its stream: one surface (spec Revision 1 R1.3); uv = (stream arc length, 0 / 1 across) on the ribbon, (join.u0, 0.5) on the polygon' });
      continue;
    }
    add('water_' + b.name, mesh, { body: b.name, kind: 'ribbon', uStart: r4(u0), length: r4(L) },
      { node: 'water_' + b.name, kind: 'ribbon', palette: WC.BODY_PALETTE[b.name], level: null, virtual: !!b.virtual, flow: false, uStart: r4(u0), length: r4(L), ripples: WC.RIPPLE_BODIES[b.name] || null, ...(b.vhead ? { vhead: [r4(u0 + 0.2), r4(u0 + b.vhead.len)] } : {}),
        fillFrom: b.name === 'river' ? { after: 'dock', from: 'u start (the MAIN seam)', seconds: 2.5 } : b.name === 'outflow' ? { after: 'water_river', seconds: 1 } : null });
  }
  // the fall: from the channel that feeds it, the exported profile
  const ch = id === 'main' ? ribbons.stream : id === 'wetland' ? ribbons.outflow : null;
  if (ch) {
    const fp = id === 'main' ? W.main.waterfall.points : W.wetland.waterfall.points, f0 = fp[0];
    const profile = fp.map((p) => [Math.hypot(p[0] - f0[0], p[2] - f0[2]), p[1] - f0[1]]);
    // (water rev 1, R1.4) the fall starts EXACTLY at its channel's last row (same vertices: same width, same across), which lies on the
    // brink, and curls over: it leaves along the channel's tangent and turns to the cliff edge's outward normal over its first 0.3 u
    // (the farm: the stream's pinned rim exit, ~0.05 u past MAIN's top edge; the outflow: its row along the cliff edge); its first rows
    // draw the channel's own surface (WATER_BRINK), then a broken foam lip, then the sheet
    const E = ch.rows[ch.rows.length - 1], Ep = ch.rows[ch.rows.length - 2], rock = await loadRock(id, modelsDir), fill = id === 'main' ? { shownWhile: 'wetland undocked', retreat: 1 } : { after: 'water_outflow', seconds: 1 };
    const sbody = bodies.find((q) => q.name === (id === 'main' ? 'stream' : 'outflow'));
    let BF = ch.BF; if (!BF) { const top = await loadTop(id, modelsDir), sB = channelBrink(sbody.line, top); BF = sB == null ? null : brinkFrame({ ...sbody, brinkS: sB }, top); }   // (the farm: MAIN's rim edge, for its normal)
    const tl = Math.hypot(E.x - Ep.x, E.z - Ep.z) || 1, tE = [(E.x - Ep.x) / tl, (E.z - Ep.z) / tl], nC = BF ? BF.nC : tE, out = nC;
    const rows = fallRowsBrink({ x: E.x, y: E.y, z: E.z }, { t: tE, nC }, profile, 2 * ch.endHw, rock, ch.endAcross), u0 = ch.u0 + ch.L, L = rows[rows.length - 1].s;
    console.log(`  ${id} fall: brink ${BF ? 'edge ' + BF.oblique.toFixed(1) + ' deg off square' : 'none'}; leaves at ${(Math.atan2(tE[1], tE[0]) * 180 / Math.PI).toFixed(1)} deg, turns to ${(Math.atan2(nC[1], nC[0]) * 180 / Math.PI).toFixed(1)} deg`);
    add('water_fall', fallMeshBrink(rows, u0, out), { body: 'fall', kind: 'fall', uStart: r4(u0), length: r4(L), dissolveFrom: 0.55, brink: [0.075, 0.16] },
      { node: 'water_fall', kind: 'fall', palette: 'fall', level: null, virtual: false, flow: false, uStart: r4(u0), length: r4(L), dissolveFrom: 0.55,
        brink: { start: 0.075, len: 0.16, to: 'river' }, fillFrom: fill });
    add('water_fall_skirt', fallSkirt(rows, out, rock), { body: 'fall', kind: 'skirt' },
      { node: 'water_fall_skirt', kind: 'skirt', palette: null, level: null, virtual: false, flow: false, fillFrom: fill, note: 'depth only, no colour: from the fall\'s top row (on the brink) down the cliff face, hugging the rock (inside it or within 0.03 u), so the depth surface turns down at the brink like the cliff edge and no skirt edge stands proud of the rock (outline / ink passes)' });
    const k = rows.findIndex((r) => r.s >= 0.775 * L), m = rows[Math.max(0, k)];
    parts.push({ name: 'mist_fall', empty: true, at: [m.x + out[0] * 0.25, m.y, m.z + out[1] * 0.25], extras: { kind: 'mist', puffs: { mid: WC.TIERS.mid.mistPuffs, phone: WC.TIERS.phone.mistPuffs }, size: [0.6, 1.6], speed: 0.3, loop: 6, alphaMax: 0.55, covers: [0.55, 1], out: out.map(r4) } });
    json.push({ node: 'mist_fall', kind: 'mist', palette: 'fall' });
  }
  const spring = bodies.find((b) => b.name === 'spring');
  if (spring) { parts.push({ name: 'steam_spring', empty: true, at: [spring.at[0], spring.level + 0.05, spring.at[1]], extras: { kind: 'steam', puffs: { mid: WC.TIERS.mid.steamPuffs, phone: WC.TIERS.phone.steamPuffs }, size: [0.3, 0.9], rise: 0.25, loop: 7, alphaMax: 0.35 } });
    json.push({ node: 'steam_spring', kind: 'steam', palette: 'spring' }); }
  const glb = await writeGlb(id, parts, WC.PALETTES[WC.BODY_PALETTE[bodies[0].name]].mid);
  return { glb, bodies: json, tris: nTris, ribbons };
}

// ---- everything (in memory) ----
export async function bakeWater(opts = {}) {
  const modelsDir = opts.modelsDir || MODELS, A = WORLD3.archipelago;
  const bp = GT.buildBlueprint(A, LOOK, {}), W = GT.blueprintWater(bp);
  const BPJ = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config/blueprint.pieces.json'), 'utf8'));
  const files = {}, maps = {}, json = { format: WC.WATER_FORMAT, about: 'Water revamp bake (art/scripts/bake-water.mjs; spec art/specs/2026-10-23-water-revamp-design.md). Piece-local; the game reads only this file and the files it names.',
    encoding: WC.ENCODING, noise: { file: 'water_noise.bin', size: [WC.NOISE_SIZE, WC.NOISE_SIZE], format: 'RG8', wrap: 'repeat', cell: WC.NOISE_CELL, cellsAcross: 8 }, pieces: {} };
  files['water_noise.bin'] = bakeNoise();
  const uState = { stream: 0, riverEnd: 0 }, manifest = {};
  for (const id of WATER_PIECES) {
    const pivot = BPJ.pieces[id].dockedPosition, grid = loadGrid(id, modelsDir), bodies = waterBodies(W, id, pivot);
    if (id === 'wetland') {   // the lake's source (the river mouth) and sink (the outflow's start)
      const lake = bodies.find((b) => b.name === 'lake'), river = bodies.find((b) => b.name === 'river'), out = bodies.find((b) => b.name === 'outflow');
      lake.mouth = [river.line[river.line.length - 1].x, river.line[river.line.length - 1].z]; lake.exit = [out.line[0].x, out.line[0].z];
      // (water rev 1, R1.4) the outflow ENDS ON THE BRINK: where the wetland's rendered top stops being under it (its carved channel
      // runs on past the coast; the drawn ribbon stops at the edge and the fall starts from its last row)
      out.brinkS = channelBrink(out.line, await loadTop(id, modelsDir));
    }
    const m = bakeMap(id, bodies, grid), file = `water_${id}.map.bin`;
    files[file] = m.bytes; maps[id] = { ...m, bodies, grid, pivot };
    const ms = await bakeMeshes(id, bodies, W, pivot, uState, modelsDir), gfile = `water_${id}.glb`;
    files[gfile] = ms.glb; maps[id].mesh = ms;
    json.pieces[id] = { pivot, glb: gfile, map: { file, origin: m.origin, texel: m.texel, size: m.size, encoding: 'RGBA8 (see encoding)' }, bodies: ms.bodies };
    manifest['water_' + id] = { file: gfile, status: 'ready', tris: ms.tris,
      notes: `water revamp (art/scripts/bake-water.mjs): piece-local water surfaces / ribbons / falls of piece_${id}, one placeholder material 'Water' the game replaces; map + bodies in water.json` };
  }
  json.palettes = WC.PALETTES; json.tiers = WC.TIERS; json.ripple = WC.RIPPLE;   // (rev 1: the L11 constants; each body's `ripples`)
  json.layers = { bands: WC.BANDS, bandSoft: WC.BAND_SOFT, noiseCell: WC.NOISE_CELL, phi: +WC.PHI.toFixed(6), ...(opts.layers || {}) };
  files['water.json'] = Buffer.from(JSON.stringify(json, null, 1) + '\n');
  return { files, json, maps, manifest, W, bp };
}

// =============================================================================
// WATER REV 1 (spec Revision 1 R1.3): the farm pond + stream as ONE surface, and the seam with the wetland river
// (ported from the owner-approved seamless mockup, scratchpad review/pond_shapes/A_seamless_notes.md)
// =============================================================================
const seamOn = (W) => !!(W && W.main && W.main.stream && W.main.stream.steer);
// the stream's rows every 0.05 u (world) and its end row (the line's last segment, exactly as the merged mesh draws it): { t, a (left +) }
const seamStreamRows = (W) => farmStreamRows(W.main.stream, 0.05);
function seamStreamEnd(W) { const rows = seamStreamRows(W), a = rows[rows.length - 2], b = rows[rows.length - 1], tl = Math.hypot(b.x - a.x, b.z - a.z), t = [(b.x - a.x) / tl, (b.z - a.z) / tl]; return { t, a: [-t[1], t[0]] }; }
// the seam stream's depth from the UNION shore distance (a V of 0.18 u at full width), so the pond's bands taper straight into it
export function seamStreamDepth(sd, hw, x, z) {
  const wob = 1 + 0.12 * (vnoise(x / 0.7, z / 0.7, 517) * 2 - 1);
  return 0.18 * clamp(sd / Math.max(hw, 1e-3), 0, 1) * wob;
}
// the junction's arc length (where the pond polygon's cap line meets the stream) on a stream body's line
export function seamJ(pond, stream) { return nearestOnLine(stream.line, pond.capAt[0], pond.capAt[1]).s; }
// one flow field over pond + stream: the spring -> the rim exit; the pond keeps its drift (p90 0.035 u/s, <= 0.08 u/s), the stream's cap
// ramps to 0.15 u/s over the 1.5 u after the junction
function seamFlow(cells, W, H, origin, T, pond, bodies, sOf) {
  const st = bodies.find((q) => q.kind === 'ribbon' && q.seam), end = st.line[st.line.length - 1], sJ = seamJ(pond, st);
  const src = nearCells(cells, W, H, origin, T, pond.flowSrc[0], pond.flowSrc[1], 0.35), snk = nearCells(cells, W, H, origin, T, end.x, end.z, 0.2);
  const F = laplaceFlow(cells, W, H, src, snk, 4000);
  const sp = F.list.filter((q) => sOf[q] < 0 || sOf[q] < sJ - 0.6).map((q) => Math.hypot(F.vx[q], F.vz[q])).sort((a, b) => a - b), k = 0.035 / (sp[Math.floor(sp.length * 0.9)] || 1e-9);
  for (const q of F.list) { let x = F.vx[q] * k, z = F.vz[q] * k; const m = Math.hypot(x, z), vmax = 0.08 + 0.07 * (sOf[q] < 0 ? 0 : smooth(sJ, sJ + 1.5, sOf[q])); if (m > vmax) { x *= vmax / m; z *= vmax / m; } F.vx[q] = x; F.vz[q] = z; }
  return F;
}
// the merged mesh: the pond polygon (closing on its cap line) + the stream ribbon from that cap line to the rim exit, the cap corners
// shared (one vertex pair: no overlap, no tuck), rows <= 0.2 u apart; the ribbon's y eases from the pond level to the stream's own over
// 0.8 u. uv: the ribbon (u = stream arc length, v 0 left / 1 right); the polygon (uJ, 0.5), its cap corners (uJ, 0) / (uJ, 1)
export function seamMesh(pond, st, rows) {
  const line = st.line, sL = line[line.length - 1].s, L = rows[rows.length - 1].s, sJ = seamJ(pond, st), uJ = sJ * (L / sL);
  const at = (s) => { let k = 0; while (k < line.length - 2 && line[k + 1].s < s) k++; const a = line[k], b = line[k + 1], t = clamp((s - a.s) / (b.s - a.s || 1), 0, 1);
    const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1; return { x: a.x + tx * t, z: a.z + tz * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, tx: tx / tl, tz: tz / tl }; };
  const poly = pond.poly, np = poly.length, pos = [], nor = [], uv = [], idx = [];
  const c0 = poly[0], c1 = poly[np - 1], r0 = at(sJ), L0 = [r0.x - r0.tz * r0.w / 2, r0.z + r0.tx * r0.w / 2];
  const d0 = Math.hypot(c0[0] - L0[0], c0[1] - L0[1]), d1 = Math.hypot(c1[0] - L0[0], c1[1] - L0[1]), iL = d0 < d1 ? 0 : np - 1, iR = d0 < d1 ? np - 1 : 0;
  poly.forEach(([x, z], i) => { pos.push(x, pond.level, z); nor.push(0, 1, 0); uv.push(uJ, i === iL ? 0 : i === iR ? 1 : 0.5); });
  const faces = THREE.ShapeUtils.triangulateShape(poly.map(([x, z]) => new THREE.Vector2(x, z)), []); for (const f of faces) idx.push(...f);
  const n = Math.max(1, Math.ceil((sL - sJ) / 0.2)), y0 = r0.y;
  let pL = iL, pR = iR; const cap = { width: Math.hypot(c0[0] - c1[0], c0[1] - c1[1]), ribbonAtCap: r0.w, cornerMiss: Math.min(d0, d1) };
  for (let k = 1; k <= n; k++) {
    const s = sJ + ((sL - sJ) * k) / n, r = at(s), hw = r.w / 2, y = r.y + (pond.level - y0) * (1 - smooth(sJ, sJ + 0.8, s)), u = s * (L / sL), b = pos.length / 3;
    pos.push(r.x - r.tz * hw, y, r.z + r.tx * hw, r.x + r.tz * hw, y, r.z - r.tx * hw); nor.push(0, 1, 0, 0, 1, 0); uv.push(u, 0, u, 1);
    idx.push(pL, b, pR, pR, b, b + 1); pL = b; pR = b + 1;
  }
  return { mesh: { pos, nor, uv, idx: orientUp(pos, idx) }, uJ, cap };
}
// the river's head centreline: a cubic Hermite from the rim exit, leaving along the STREAM's end tangent (C1 across the seam), back on
// the river's own polyline 1.2 u down (where its carve is still under 0.1 u deep and its look still virtual)
export function seamRiverPoints(W) {
  const rp = W.wetland.river.points, S = 1.2, rows = polyRows(rp, 0.02), k1 = rows.findIndex((r) => r.s >= S), P1 = rows[k1], Pa = rows[k1 - 3], Pb = rows[k1 + 3];
  const t1l = Math.hypot(Pb.x - Pa.x, Pb.z - Pa.z), m1 = [((Pb.x - Pa.x) / t1l) * S, ((Pb.z - Pa.z) / t1l) * S], t0 = seamStreamEnd(W).t, m0 = [t0[0] * S, t0[1] * S], P0 = rp[0];
  const rowAt = (s) => rows[Math.max(0, Math.min(rows.length - 2, rows.findIndex((r) => r.s >= s)))];
  const out = [];
  for (let j = 0; j < 24; j++) { const u = j / 24, h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2, r = rowAt(u * S);
    out.push({ x: h00 * P0.x + h10 * m0[0] + h01 * P1.x + h11 * m1[0], z: h00 * P0.z + h10 * m0[1] + h01 * P1.z + h11 * m1[1], level: j ? r.y : P0.level, width: j ? r.w : P0.width }); }
  out.push({ x: P1.x, z: P1.z, level: P1.y, width: P1.w });
  const cum = [0]; for (let i = 1; i < rp.length; i++) cum.push(cum[i - 1] + Math.hypot(rp[i].x - rp[i - 1].x, rp[i].level - rp[i - 1].level, rp[i].z - rp[i - 1].z));
  for (let i = 0; i < rp.length; i++) if (cum[i] > S + 0.05) out.push(rp[i]);
  return out;
}
// mask-only twins: the river's first 0.85 u in MAIN's map, the stream's last 0.85 u in the wetland's map (not drawn, no flow), so the
// shore field, bands and foam agree on both sides of the seam
export function seamRiverGhost(W, locRows, pivot) {
  const rows = polyRows(seamRiverPoints(W), 0.05).filter((r) => r.s <= 0.85);
  return { name: 'riverGhost', kind: 'ribbon', virtual: true, ghost: true, bank: 0, line: locRows(rows), pv: [pivot[0], pivot[2]] };
}
export function seamStreamGhost(W, locRows, pivot) {
  if (!seamOn(W)) return [];
  const rows = seamStreamRows(W), L = rows[rows.length - 1].s;
  return [{ name: 'streamGhost', kind: 'ribbon', virtual: true, ghost: true, bank: 0, line: locRows(rows.filter((r) => r.s >= L - 0.85)), pv: [pivot[0], pivot[2]] }];
}
// the river's virtual head: 1.6 u of the stream's look, its first 0.2 u of rows turned from the stream's end row
export function seamRiverHead(W, pivot, locRows) {
  if (!seamOn(W)) return {};
  const pts = seamRiverPoints(W);
  return { vhead: { len: 1.6, twist: 0.2, aStart: seamStreamEnd(W).a }, pv: [pivot[0], pivot[2]], line: locRows(polyRows(pts, 0.05)), srcPoints: pts };
}
// the river's head rows: the first row is exactly the stream's end row (its across), and the carved ribbon's extra 0.2 u a side grows in
// only once the head turns carved (0.5 -> 1.6 u), so at the seam both meshes clip the water at the same edge
export function ribbonMeshTwist(rows, u0, extra, aStart, len) {
  const pos = [], nor = [], uv = [], idx = [];
  rows.forEach((r, i) => {
    const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, k = i === 0 ? 0 : smooth(0, len, r.s);
    let nx = aStart[0] * (1 - k) + (-tz / tl) * k, nz = aStart[1] * (1 - k) + (tx / tl) * k; const nl = Math.hypot(nx, nz); nx /= nl; nz /= nl;
    const hw = r.w / 2 + extra * smooth(0.5, 1.6, r.s); pos.push(r.x + nx * hw, r.y, r.z + nz * hw, r.x - nx * hw, r.y, r.z - nz * hw); nor.push(0, 1, 0, 0, 1, 0); uv.push(u0 + r.s, 0, u0 + r.s, 1);
    if (i) { const q = (i - 1) * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
  });
  return { pos, nor, uv, idx: orientUp(pos, idx) };
}

export default { MODELS, WATER_PIECES, loadGrid, gridHeight, inPoly, nearestOnLine, streamCurve, waterBodies, bakeMap, bakeNoise, bakeWater, bakeMeshes, pondDepth, streamDepth, farmStreamRows, seamStreamDepth, seamMesh, seamRiverPoints };
