// topmap.mjs  --  a top-down DESIGN MAP of the blueprint island (NO deps): hillshade + rock, pieces + seams, flat
// zones, water, stairs, trees and the path network, with a 5 u world grid. Used to lay out paths, tree gaps and
// zones against the real heightfield instead of guessing.
// Usage:  node topmap.mjs [--seed 11] [--out <png>] [--scale 18] [--labels 1]
// Orientation = the gameplay camera's: the FAR side (-x/-z) is up, the near side (+x/+z) down, +x/-z to the right.
import path from 'node:path';
import GT from './lib/terrain.mjs';
import { blank, writePNG } from './lib/png.mjs';
import { SHOTS_DIR } from './lib/paths.mjs';
import L from '../config/look.config.mjs';
import W3 from '../config/world.config.mjs';

const FONT = { A:[14,17,17,31,17,17,17], B:[30,17,17,30,17,17,30], C:[14,17,16,16,16,17,14], D:[30,17,17,17,17,17,30], E:[31,16,16,30,16,16,31], F:[31,16,16,30,16,16,16],
  G:[14,17,16,23,17,17,15], H:[17,17,17,31,17,17,17], I:[14,4,4,4,4,4,14], J:[7,2,2,2,2,18,12], K:[17,18,20,24,20,18,17], L:[16,16,16,16,16,16,31], M:[17,27,21,21,17,17,17],
  N:[17,17,25,21,19,17,17], O:[14,17,17,17,17,17,14], P:[30,17,17,30,16,16,16], Q:[14,17,17,17,21,18,13], R:[30,17,17,30,20,18,17], S:[15,16,16,14,1,1,30], T:[31,4,4,4,4,4,4],
  U:[17,17,17,17,17,17,14], V:[17,17,17,17,17,10,4], W:[17,17,17,21,21,21,10], X:[17,17,10,4,10,17,17], Y:[17,17,17,10,4,4,4], Z:[31,1,2,4,8,16,31],
  0:[14,17,19,21,25,17,14], 1:[4,12,4,4,4,4,14], 2:[14,17,1,2,4,8,31], 3:[31,2,4,2,1,17,14], 4:[2,6,10,18,31,2,2], 5:[31,16,30,1,1,17,14], 6:[6,8,16,30,17,17,14],
  7:[31,1,2,4,8,8,8], 8:[14,17,17,14,17,17,14], 9:[14,17,17,15,1,2,12], '_':[0,0,0,0,0,0,31], '-':[0,0,0,31,0,0,0], '.':[0,0,0,0,0,12,12], ',':[0,0,0,0,12,4,8], ' ':[0,0,0,0,0,0,0] };

const a = process.argv.slice(2);
let seed = W3.archipelago.seeds.default, out = path.join(SHOTS_DIR, 'topmap.png'), S = 18, labels = true;
for (let i = 0; i < a.length; i++) { if (a[i] === '--seed') seed = +a[++i]; else if (a[i] === '--out') out = a[++i]; else if (a[i] === '--scale') S = +a[++i]; else if (a[i] === '--labels') labels = a[++i] !== '0'; }
const A = W3.archipelago, bp = GT.buildBlueprint(A, L, { seed }), comp = GT.composeBlueprint(bp, L);
const R = Math.ceil(bp.maxRc + 2), Wpx = Math.ceil(2 * R * Math.SQRT2 * S * 0.82), img = blank(Wpx, Wpx, [150, 190, 215, 255]), C = Wpx / 2, r2 = Math.SQRT1_2;
const toPx = (x, z) => [C + (x - z) * r2 * S, C + (x + z) * r2 * S];
const toW = (X, Y) => { const u = (X - C) / S, w = (Y - C) / S; return [(u + w) * r2, (w - u) * r2]; };
const put = (X, Y, c, al = 1) => { X = Math.round(X); Y = Math.round(Y); if (X < 0 || Y < 0 || X >= Wpx || Y >= Wpx) return; const i = (Y * Wpx + X) * 4; for (let k = 0; k < 3; k++) img.data[i + k] = Math.round(img.data[i + k] * (1 - al) + c[k] * al); };
const disc = (x, z, r, c, al = 1) => { const [X, Y] = toPx(x, z), rp = r * S; for (let dy = -rp; dy <= rp; dy++) for (let dx = -rp; dx <= rp; dx++) if (dx * dx + dy * dy <= rp * rp) put(X + dx, Y + dy, c, al); };
const line = (p, q, c, w = 1, al = 1) => { const [X0, Y0] = toPx(p[0], p[1]), [X1, Y1] = toPx(q[0], q[1]), n = Math.ceil(Math.hypot(X1 - X0, Y1 - Y0)) + 1;
  for (let i = 0; i <= n; i++) { const X = X0 + (X1 - X0) * i / n, Y = Y0 + (Y1 - Y0) * i / n; for (let dy = -w + 1; dy < w; dy++) for (let dx = -w + 1; dx < w; dx++) put(X + dx, Y + dy, c, al); } };
const poly = (pts, c, w = 1, closed = false, al = 1) => { for (let i = 0; i < pts.length - 1; i++) line(pts[i], pts[i + 1], c, w, al); if (closed) line(pts[pts.length - 1], pts[0], c, w, al); };
const text = (X, Y, str, c = [255, 255, 255], sc = 1) => { let cx = X; for (const ch of String(str).toUpperCase()) { const g = FONT[ch] || FONT[' '];
  for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) if (g[r] & (1 << (4 - k))) for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) put(cx + k * sc + dx, Y + r * sc + dy, c); cx += 6 * sc; } };

// ---- ground: hillshade (sun from the upper left of the map) x height tint; rock = steep ----
const P = A.blueprint;
for (let Y = 0; Y < Wpx; Y++) for (let X = 0; X < Wpx; X++) {
  const [x, z] = toW(X, Y); if (!GT.pieceAt(bp, x, z)) continue;
  const e = 0.12, h = bp.H(x, z), hx = (bp.H(x + e, z) - bp.H(x - e, z)) / (2 * e), hz = (bp.H(x, z + e) - bp.H(x, z - e)) / (2 * e), sl = Math.hypot(hx, hz);
  const shade = GT.clamp(0.78 - 0.35 * (hx * -0.6 + hz * -0.6) / Math.hypot(1, sl) * 1.6, 0.35, 1.15);
  let c = sl > 1.2 ? [196, 178, 150] : [126 + 18 * h, 168 + 8 * h, 92 + 6 * h];
  if (sl > 0.6 && sl <= 1.2) c = [150, 160, 110];
  put(X, Y, c.map((v) => GT.clamp(v * shade, 0, 255)));
}
// grid every 5 u
for (let g = -40; g <= 40; g += 5) { const col = g === 0 ? [255, 255, 255] : [230, 230, 230]; poly([[g, -40], [g, 40]], col, 1, false, g === 0 ? 0.55 : 0.18); poly([[-40, g], [40, g]], col, 1, false, g === 0 ? 0.55 : 0.18); }
if (labels) for (let g = -30; g <= 30; g += 10) { const [X, Y] = toPx(g, -32); text(X - 6, Y, 'X' + g, [40, 40, 40]); const [X2, Y2] = toPx(32, g); text(X2, Y2 - 3, 'Z' + g, [40, 40, 40]); }
// water
const W = comp.water;
for (const pl of [W.wetland.lake.outline, W.highland.tarn.outline, W.highland.hotSpring.outline]) poly(pl, [60, 120, 210], 2, true);
for (const k of ['river', 'outflow']) poly(W.wetland[k].points.map((p) => [p.x, p.z]), [60, 120, 210], 2);
poly((W.main.stream.line || W.main.stream.points).map((p) => [p.x, p.z]), [60, 120, 210], 2);
if (W.main.pond.r == null) poly(W.main.pond.outline, [60, 120, 210], 2, true); else disc(W.main.pond.at[0], W.main.pond.at[1], W.main.pond.r, [60, 120, 210], 0.6);   // (water rev 1: the art-owned teardrop)
// trees
for (const id of bp.order) for (const t of comp.pieces[id].trees) disc(t.x, t.z, t.kind === 'pine' ? 0.28 : 0.34, t.kind === 'pine' ? [30, 70, 40] : [55, 100, 45], 0.85);
// paths (dense ribbons, the composition's own samples)
for (const id of bp.order) for (const p of comp.pieces[id].paths) { for (let i = 0; i < p.pts.length - 1; i++) { const w = (p.w ? p.w[i] : 1) * p.width; line(p.pts[i], p.pts[i + 1], [222, 186, 128], Math.max(1, Math.round(w * S / 2)), 0.9); } }
for (const id of bp.order) for (const p of comp.pieces[id].paths) if (p.stub) poly(p.stub, [255, 120, 40], 1);
// stairs
for (const s of bp.stairs) line(s.from, s.to, [220, 40, 200], 3);
// seams + MAIN rim + coast
for (const sp of bp.seamPts) poly(sp, [255, 255, 255], 1);
{ const rim = []; for (let j = 0; j < bp.N; j++) { const q = bp.store.get('r:' + j); rim.push([q[0], q[2]]); } poly(rim, [255, 255, 255], 1, true); }
// zones: cores yellow, buildings red, restorations purple, others cyan (rings)
const ring = (x, z, r, c) => { const pts = []; for (let i = 0; i <= 32; i++) { const t = i / 32 * Math.PI * 2; pts.push([x + Math.cos(t) * r, z + Math.sin(t) * r]); } poly(pts, c, 1); };
for (const [pid, list] of Object.entries(P.zones)) for (const zn of list) ring(zn.at[0], zn.at[1], zn.r, zn.kind === 'core' ? [255, 230, 0] : zn.kind === 'building' ? [230, 50, 40] : zn.kind === 'restoration' ? [170, 80, 210] : [40, 210, 210]);
for (const zn of bp.zones.slice(0, bp.mainZoneCount)) if (zn.type === 'disc' && zn.what !== 'core') ring(zn.x, zn.z, zn.r, [230, 50, 40]);
// labels: path ids at their middle, piece ids at their pivots
if (labels) {
  for (const p of P.paths) { const m = p.pts[Math.floor(p.pts.length / 2)], [X, Y] = toPx(m[0], m[1]); text(X + 4, Y - 3, p.id, [90, 40, 10]); }
  for (const id of bp.order) { const pv = bp.pieces[id].pivot, [X, Y] = toPx(pv[0], pv[2]); text(X - 12, Y + 8, id, [255, 255, 255], 2); }
}
writePNG(out, img);
console.log(`topmap seed ${seed} -> ${out} (${Wpx}px, ${S}px/u)`);
