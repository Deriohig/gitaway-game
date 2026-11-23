// blueprint.test.mjs -- spec v3.1 invariants: the island core + the blueprint pieces (pure node). Usage: node tests/blueprint.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import GT from '../lib/terrain.mjs';
import { buildIslandGeometry, pieceGroup } from '../lib/islandAdapter.mjs';
import { gameBottoms } from '../lib/bake.mjs';   // (the JSON's depth / bottomLocal come from the bake-resolution build, as build.mjs writes them)
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const A = W3.archipelago, B = A.blueprint, G = A.game, FB = L.terrain.colour.faceBands, TAG = GT.TAG;
const GENTLE = B.gentleSlope;                       // tan 15 deg rise/run
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
const riseRun = (ny) => Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(1e-9, ny);
const faceN = (P, o) => { const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2], vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1e-12; return [nx / l, ny / l, nz / l, 0.5 * l]; };

// the game's makeIsland (src/world/terrain.ts), positions only, ported verbatim: C compares MAIN's outline with it
function gameMakeIslandTop(spec) {
  const random = GT.gameRng(spec.seed), H = [2, 3, 5, 7], Am = [0.06, 0.045, 0.025, 0.014];
  const phases = H.map(() => random() * Math.PI * 2), hp = [random(), random(), random(), random()].map((v) => v * Math.PI * 2), flat = spec.flatCenter ?? 0.45;
  const outline = (t) => spec.radius * (1 + H.reduce((s, k, i) => s + Am[i] * Math.sin(k * t + phases[i]), 0));
  const smooth = GT.smoothstep;
  const height = (x, z) => { const f = Math.hypot(x, z) / outline(Math.atan2(z, x)), rim = 1 - smooth(0.86, 1.0, f), amp = spec.hills * (0.18 + 0.82 * smooth(flat, 0.85, f)) * rim;
    const n = Math.sin(0.42 * x + hp[0]) * Math.cos(0.37 * z + hp[1]) * 0.6 + Math.sin(0.8 * x - 0.6 * z + hp[2]) * 0.4; let h = amp * (n * 0.5 + 0.5);
    for (const m of spec.mounds ?? []) { const d = Math.hypot(x - m.x, z - m.z) / m.r; if (d < 1) h += m.h * (0.5 + 0.5 * Math.cos(d * Math.PI)) * rim; } return h; };
  const segments = Math.max(24, Math.round(spec.radius * 6.5)), rings = Math.max(4, Math.round(spec.radius * 0.8)), top = [];
  for (let k = 1; k <= rings; k++) { const ring = [], f = k / rings;
    for (let j = 0; j < segments; j++) { const t = ((j + (k % 2) * 0.5) / segments) * Math.PI * 2, jit = k < rings ? (random() - 0.5) * 0.06 : 0, r = (f + jit) * outline(t), x = Math.cos(t) * r, z = Math.sin(t) * r;
      ring.push([x, k === rings ? height(x, z) * 0.3 : height(x, z), z]); } top.push(ring); }
  const tris = [], c = [0, height(0, 0), 0];
  for (let j = 0; j < segments; j++) tris.push([c, top[0][j], top[0][(j + 1) % segments]]);
  for (let k = 1; k < rings; k++) for (let j = 0; j < segments; j++) { const j2 = (j + 1) % segments; tris.push([top[k - 1][j], top[k][j], top[k][j2]], [top[k - 1][j], top[k][j2], top[k - 1][j2]]); }
  return { tris, height, outline };
}
function meshHeightAt(tris, x, z) {
  for (const [a, b, c] of tris) { const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(det) < 1e-14) continue;
    const l0 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det, l1 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det, l2 = 1 - l0 - l1;
    if (l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9) return l0 * a[1] + l1 * b[1] + l2 * c[1]; }
  return null;
}

const seeds = [A.seeds.default, A.seeds.alt];
const builds = seeds.map((s) => GT.buildBlueprint(A, L, { seed: s }));
const bp = builds[0], comp = GT.composeBlueprint(bp, L);

// A. watertight per piece (closed 2-manifold, consistent winding, outward, no degenerate / NaN)
{
  let worst = '', bad = 0, details = [];
  for (const [si, b] of builds.entries()) for (const id of b.order) {
    const pc = b.pieces[id], P = pc.positions, q = (v) => Math.round(v * 1e6), ids = new Map();
    const vid = (o) => { const k = q(P[o]) + ',' + q(P[o + 1]) + ',' + q(P[o + 2]); let i = ids.get(k); if (i === undefined) { i = ids.size; ids.set(k, i); } return i; };
    const E = new Map(); let degen = 0, vol = 0, nan = 0, topInv = 0, underInv = 0;
    for (let t = 0; t < pc.faceCount; t++) {
      const o = t * 9; for (let k = 0; k < 9; k++) if (!Number.isFinite(P[o + k])) nan++;
      const a = vid(o), b2 = vid(o + 3), c = vid(o + 6); if (a === b2 || b2 === c || a === c) { degen++; continue; }
      const n = faceN(P, o); if (n[3] < 1e-8) degen++;
      if (pc.tags[t] === TAG.top && n[1] <= 0) topInv++; if (pc.tags[t] === TAG.under && n[1] >= 0) underInv++;
      for (const [u, v] of [[a, b2], [b2, c], [c, a]]) E.set(u + '>' + v, (E.get(u + '>' + v) || 0) + 1);
      vol += (P[o] * (P[o + 4] * P[o + 8] - P[o + 5] * P[o + 7]) - P[o + 1] * (P[o + 3] * P[o + 8] - P[o + 5] * P[o + 6]) + P[o + 2] * (P[o + 3] * P[o + 7] - P[o + 4] * P[o + 6])) / 6;
    }
    let open = 0, dup = 0; for (const [k, cnt] of E) { if (cnt > 1) dup++; const [u, v] = k.split('>'); if (!E.has(v + '>' + u)) open++; }
    const fail = open || dup || degen || nan || vol <= 0 || topInv || underInv;
    if (fail) { bad++; worst = `${id}@${seeds[si]} open=${open} dup=${dup} degen=${degen} nan=${nan} vol=${vol.toFixed(1)} topInv=${topInv} underInv=${underInv}`; }
    if (si === 0) details.push(`${id}:${pc.faceCount}f/${vol.toFixed(0)}u3`);
  }
  ok('every piece one closed watertight mesh (both seeds)', bad === 0, bad ? worst : details.join(' '));
}

// B. height(x,z) triangle-exact on the top (vs an independent brute-force search), exact at vertices
{
  let maxErr = 0, nodeErr = 0, n = 0;
  for (const id of bp.order) {
    const pc = bp.pieces[id], P = pc.positions, tops = [];
    for (let t = 0; t < pc.faceCount; t++) if (pc.tags[t] === TAG.top) { const o = t * 9; tops.push([[P[o], P[o + 1], P[o + 2]], [P[o + 3], P[o + 4], P[o + 5]], [P[o + 6], P[o + 7], P[o + 8]]]); }
    const rng = GT.mulberry32(id.length * 31);
    for (let i = 0; i < 60; i++) { const tri = tops[Math.floor(rng() * tops.length)], u = rng(), v = rng() * (1 - u), w = 1 - u - v;
      const x = tri[0][0] * u + tri[1][0] * v + tri[2][0] * w, z = tri[0][2] * u + tri[1][2] * v + tri[2][2] * w, truth = meshHeightAt(tops, x, z);
      if (truth == null) continue; n++; maxErr = Math.max(maxErr, Math.abs(pc.height(x, z) - truth)); }
    for (let i = 0; i < 30; i++) { const tri = tops[Math.floor(rng() * tops.length)]; nodeErr = Math.max(nodeErr, Math.abs(pc.height(tri[0][0], tri[0][2]) - tri[0][1])); }
  }
  ok('height(x,z) == rendered top (triangle-exact, every piece)', maxErr < 1e-9 && nodeErr < 1e-9, `max off-vertex err=${maxErr.toExponential(1)} (${n} pts), node err=${nodeErr.toExponential(1)}`);
}

// C. outline(theta) consistent with the top's rim; MAIN = the game's outline bit-for-bit; star-shaped
{
  const gm = gameMakeIslandTop(G.MAIN); let mainDiff = 0, rimErr = 0, inOut = 0, notStar = [];
  for (let i = 0; i < 720; i++) { const t = i / 720 * Math.PI * 2 - Math.PI; mainDiff = Math.max(mainDiff, Math.abs(bp.pieces.main.outline(t) - gm.outline(t))); }
  for (const id of bp.order) {
    const pc = bp.pieces[id]; if (!pc.starShaped) notStar.push(id);
    for (const [x, z] of pc.loopLocal) rimErr = Math.max(rimErr, Math.abs(pc.outline(Math.atan2(z, x)) - Math.hypot(x, z)) * (id === 'main' ? 0 : 1));
    for (let i = 0; i < 90; i++) { const t = i / 90 * Math.PI * 2, r = pc.outline(t);
      let inside = true, outside = true; try { pc.heightStrict(Math.cos(t) * r * 0.995, Math.sin(t) * r * 0.995); } catch { inside = false; }
      try { pc.heightStrict(Math.cos(t) * r * 1.01 + Math.cos(t) * 0.02, Math.sin(t) * r * 1.01 + Math.sin(t) * 0.02); } catch { outside = false; }
      if (!inside || outside) inOut++; }
  }
  for (const [x, z] of bp.pieces.main.loopLocal) rimErr = Math.max(rimErr, Math.abs(bp.pieces.main.outline(Math.atan2(z, x)) - Math.hypot(x, z)));
  ok('outline(theta) == top rim; MAIN outline == game (bit-identical); star-shaped', mainDiff === 0 && rimErr < 1e-9 && inOut === 0 && !notStar.length,
    `MAIN vs game max diff=${mainDiff} rim err=${rimErr.toExponential(1)} in/out mismatches=${inOut} notStar=[${notStar}]`);
}

// D. pivot at the local origin, flat ground at y = 0, mesh hangs to -5.5 x depth
{
  let bad = []; for (const id of bp.order) { const pc = bp.pieces[id], h0 = pc.height(0, 0);
    if (Math.abs(h0) > 1e-6 || Math.abs(pc.pivot[1] - bp.Hpre(pc.pivot[0], pc.pivot[2])) > 1e-9 || Math.abs(pc.bottom + 5.5 * pc.depth) > 1e-9) bad.push(`${id}: h(0,0)=${h0.toFixed(4)}`); }
  ok('pivot = local origin at flat-ground level (height(0,0)=0)', !bad.length, bad.length ? bad.join('; ') : bp.order.map((id) => `${id} y=${bp.pieces[id].pivot[1].toFixed(2)} depth=${bp.pieces[id].depth.toFixed(2)}`).join(' '));
}

// E. every piece keeps its flat core (spec v3.1 radii; the islet's is at the lighthouse)
{
  let bad = [], rep = [];
  for (const [pid, list] of Object.entries(B.zones)) {
    const core = list.find((z) => z.kind === 'core'), pc = bp.pieces[pid], P = pc.positions; let mx = 0, lo = 1e9, hi = -1e9;
    for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue; const o = t * 9, cx = (P[o] + P[o + 3] + P[o + 6]) / 3 + pc.pivot[0], cz = (P[o + 2] + P[o + 5] + P[o + 8]) / 3 + pc.pivot[2];
      if (Math.hypot(cx - core.at[0], cz - core.at[1]) > core.r) continue; const n = faceN(P, o); mx = Math.max(mx, riseRun(n[1])); for (const k of [1, 4, 7]) { lo = Math.min(lo, P[o + k]); hi = Math.max(hi, P[o + k]); } }
    rep.push(`${pid} r${core.r}: slope ${mx.toFixed(3)} range ${(hi - lo).toFixed(3)}`);
    if (mx > GENTLE * 0.25 || hi - lo > 0.1) bad.push(pid);
  }
  ok('flat cores (meadow 2.6, wetland 2.4, cottage 1.8, highland 2.8, orchard 1.8, grove 2.4, islet 1.6)', !bad.length, (bad.length ? 'FAIL ' + bad.join(',') + ' | ' : '') + rep.join('; '));
}

// F/G/H. MAIN: every layout.ts flat zone flat at y = 0; whole interior gentle; no rock on the near side
{
  const pc = bp.pieces.main, P = pc.positions, zones = bp.zones.slice(0, bp.mainZoneCount);
  const inZone = (z, x, y) => (z.type === 'disc' ? Math.hypot(x - z.x, y - z.z) <= z.r : z.type === 'capsule' ? (() => { const dx = z.bx - z.ax, dz = z.bz - z.az, t = Math.max(0, Math.min(1, ((x - z.ax) * dx + (y - z.az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - z.ax - dx * t, y - z.az - dz * t) <= z.r; })() : (x >= z.x0 && x <= z.x1 && y >= z.z0 && y <= z.z1));
  let zSlope = 0, zAbs = 0, zFaces = 0, intSlope = 0, nearRock = 0, worst = '';
  for (let t = 0; t < pc.faceCount; t++) {
    if (pc.tags[t] !== TAG.top) continue; const o = t * 9, cx = (P[o] + P[o + 3] + P[o + 6]) / 3, cz = (P[o + 2] + P[o + 5] + P[o + 8]) / 3, n = faceN(P, o), s = riseRun(n[1]);
    if (zones.some((z) => inZone(z, cx, cz))) { zFaces++; if (s > zSlope) { zSlope = s; worst = `${cx.toFixed(2)},${cz.toFixed(2)}`; } for (const k of [1, 4, 7]) zAbs = Math.max(zAbs, Math.abs(P[o + k])); }
    if (Math.hypot(cx, cz) < pc.outline(Math.atan2(cz, cx)) - 0.6) intSlope = Math.max(intSlope, s);
    if (cx + cz > 0 && 1 - n[1] >= FB.slopeRock0) nearRock++;
  }
  const nearTall = comp.pieces.main.trees.filter((t) => !t.layout && t.x + t.z > 0).length;
  ok('MAIN: every layout.ts flat zone flat (slope ~0) at y = 0 +/- 0.05; whole interior gentle with no rock on the near side; nothing tall added on the near side (+x/+z)', zSlope < 0.01 && zAbs <= 0.05 && intSlope <= GENTLE && nearRock === 0 && nearTall === 0,
    `${zones.length} zones, ${zFaces} faces: max slope=${zSlope.toExponential(1)} (at ${worst}) max |h|=${zAbs.toFixed(4)}; interior rise/run=${intSlope.toFixed(3)} (<= ${GENTLE}) nearSideRockFaces=${nearRock}; near-side scatter trees=${nearTall}`);
}

// I. sampling height() at every layout.ts slot: finite and in range; report slots off MAIN's outline
{
  const pc = bp.pieces.main, slots = [];
  const push = (what, p) => slots.push([what, p[0], p[1]]);
  push('house', [G.HOUSE.x, G.HOUSE.z]); push('porch', G.PORCH); push('pond', [G.POND.x, G.POND.z]); push('windmill', G.WINDMILL); push('greenhouse', [G.GREENHOUSE.x, G.GREENHOUSE.z]);
  push('well', G.WELL); push('bench', [G.BENCH.x, G.BENCH.z]); push('scarecrow', G.SCARECROW);
  G.PLOT_SLOTS.forEach(([c, r], i) => push('plot' + i, [G.GARDEN.x0 + G.GARDEN.cell * (c + 0.5), G.GARDEN.z0 + G.GARDEN.cell * (r + 0.5)]));
  for (const [k, list] of [['lantern', G.LANTERNS], ['flowerbed', G.FLOWERBEDS], ['fruitTree', G.FRUIT_TREES], ['beehive', G.BEEHIVES], ['bush', G.BUSHES]]) list.forEach((p, i) => push(k + i, p));
  G.STATIC_TREES.forEach((t, i) => push('tree' + i, t.at)); G.DIRT_PATHS.flat().forEach((p, i) => push('dirt' + i, p)); G.STONE_PATHS.flat().forEach((p, i) => push('stone' + i, p));
  let bad = [], off = [];
  for (const [w, x, z] of slots) { const h = pc.height(x, z); if (!Number.isFinite(h) || Math.abs(h) > 0.05) bad.push(`${w}=${h}`); const m = pc.outline(Math.atan2(z, x)) - Math.hypot(x, z); if (m < 0.35) off.push(`${w}(${x},${z}) margin ${m.toFixed(2)}`); }
  ok('height() at every layout.ts slot finite + in range (|h| <= 0.05)', !bad.length, `${slots.length} slots${bad.length ? ' BAD ' + bad.join(' ') : ''}; game-side note, slots within 0.35 u of / outside MAIN's rim: ${off.join(', ') || 'none'}`);
}

// J. |dTier| <= 1 (raw design field, no solver changes) on the parent lattice, both seeds
{
  const tr = builds.map((b) => GT.blueprintTiers(b));
  ok('|dTier| <= 1 by design (raw field; solver changes 0), both seeds', tr.every((t) => t.rawMaxDelta <= 1 && t.maxDelta <= 1 && t.solverChanges === 0),
    tr.map((t, i) => `seed ${seeds[i]}: cells=${t.cells} raw=${t.rawMaxDelta} solved=${t.maxDelta} changes=${t.solverChanges} tiers ${t.tiers.join('..')}`).join(' | '));
}

// K. seams: zero height delta (both neighbours share one store vertex per seam point; rendered float32 meshes) and walkable incl. MAIN's rim
{
  let maxD = 0, maxSlope = 0, rockN = 0, where = '', srcMissing = 0;
  for (const b of builds) {
    const keysOf = (id) => new Set(b.pieces[id].keys);
    const K = {}; for (const id of b.order) K[id] = keysOf(id);
    for (const s of b.seams) for (let k = 0; k <= b.K; k++) {
      const key = k === 0 ? 'r:' + s.j : 's:' + s.i + ':' + k;
      if (!K[s.hi].has(key) || !K[s.lo].has(key) || (k === 0 && !K.main.has(key))) srcMissing++;
      const [x, z] = b.seamPts[s.i][k], A1 = b.pieces[s.hi], B1 = b.pieces[s.lo];
      const ya = A1.height(x - A1.pivot[0], z - A1.pivot[2]) + A1.pivot[1], yb = B1.height(x - B1.pivot[0], z - B1.pivot[2]) + B1.pivot[1];
      let ym = null; if (k === 0) { const M = b.pieces.main; ym = M.height(x, z); }
      maxD = Math.max(maxD, Math.abs(ya - yb), ym == null ? 0 : Math.max(Math.abs(ya - ym), Math.abs(yb - ym)));
    }
    for (const id of b.order) if (id !== 'main') for (const j of b.pieces[id].jList) if (!K.main.has('r:' + j)) srcMissing++;
  }
  ok('seams: zero height delta (shared source vertices; rendered float32 |dH| <= 1e-5), both seeds', srcMissing === 0 && maxD <= 1e-5,
    `seam/MAIN-rim points not shared by both neighbours=${srcMissing}; rendered max |dH|=${maxD.toExponential(1)} (float32 local vertices)`);
  let exempt = 0;
  for (const b of builds) for (const id of b.order) for (const pc of [b.pieces[id]]) { // MAIN's rim as seen from MAIN + every petal arc
    const P = pc.positions;
    // the stream -> river crossing at theta 2.42 is WATER (animals walk around it): its carved corridor is exempt
    const inRiver = (x, z) => b.river.pts.some((p, i) => Math.hypot(p[0] - x, p[1] - z) < b.river.width(b.river.s[i]) / 2 + b.river.bank + 0.15);
    for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue; const o = t * 9; let near = false;
      if (inRiver((P[o] + P[o + 3] + P[o + 6]) / 3 + pc.pivot[0], (P[o + 2] + P[o + 5] + P[o + 8]) / 3 + pc.pivot[2])) { exempt++; continue; }
      for (const k of [0, 3, 6]) { const x = P[o + k] + pc.pivot[0], z = P[o + k + 2] + pc.pivot[2], r = Math.hypot(x, z), th = Math.atan2(z, x);
        if (Math.abs(r - b.Rm(th)) < 0.6) near = true; else for (const s of b.seams) { const sp = b.seamPts[s.i]; for (let q = 0; q < sp.length; q += 2) if (Math.abs(sp[q][0] - x) < 0.6 && Math.abs(sp[q][1] - z) < 0.6 && Math.hypot(sp[q][0] - x, sp[q][1] - z) < 0.6) { near = true; break; } if (near) break; } if (near) break; }
      if (!near) continue; const n = faceN(P, o), sl = riseRun(n[1]); if (sl > maxSlope) { maxSlope = sl; where = id; } if (1 - n[1] >= FB.slopeRock0) rockN++; }
  }
  ok('seams walkable: gentle (<= 15 deg) + no rock within 0.6 u of every seam / MAIN rim', maxSlope <= GENTLE && rockN === 0, `max rise/run=${maxSlope.toFixed(3)} (${where}) rockFaces=${rockN}; river-crossing faces exempt=${exempt}`);
}

// L. seam walls back-to-back when docked; every petal inner-wall face is MAIN's cone face reversed
{
  const faceSet = (pc, tag) => { const m = new Map(); for (let t = 0; t < pc.faceCount; t++) if (pc.tags[t] === tag) { const v = [0, 1, 2].map((c) => pc.keys[pc.faces[t * 3 + c]]); m.set([...v].sort().join('|'), v); } return m; };
  const cyc = (v) => [v.join('#'), [v[1], v[2], v[0]].join('#'), [v[2], v[0], v[1]].join('#')];
  let unpaired = 0, sameWinding = 0, total = 0, innerUnpaired = 0, innerTotal = 0;
  const cone = faceSet(bp.pieces.main, TAG.cone);
  for (const id of bp.order) {
    if (id === 'main') continue; const pc = bp.pieces[id], mine = faceSet(pc, TAG.seam);
    const lo = bp.pieces[bp.seams[pc.seamL].lo], hi = bp.pieces[bp.seams[pc.seamR].hi], other = new Map([...faceSet(lo, TAG.seam), ...faceSet(hi, TAG.seam)]);
    for (const [k, v] of mine) { total++; const w = other.get(k); if (!w) { unpaired++; continue; } if (cyc(v).includes(w.join('#'))) sameWinding++; }
    for (const [k, v] of faceSet(pc, TAG.inner)) { innerTotal++; const w = cone.get(k); if (!w || cyc(v).includes(w.join('#'))) innerUnpaired++; }
  }
  ok('seam walls back-to-back (each face has a reversed twin in the neighbour); petal inner walls == MAIN cone faces reversed (hidden when docked)', unpaired === 0 && sameWinding === 0 && total > 0 && innerUnpaired === 0 && innerTotal > 0,
    `${total} seam-wall faces: unpaired=${unpaired} sameWinding=${sameWinding}; ${innerTotal} inner-wall faces, unpaired/same-winding=${innerUnpaired}`);
}

// M. any unlock subset is coherent: every petal docks DIRECTLY to MAIN (petal layout) -> no floating piece
{
  const petals = bp.order.filter((id) => id !== 'main');
  const arcLen = (id) => { const pc = bp.pieces[id]; let s = 0; for (let q = 0; q < pc.jList.length - 1; q++) { const a = bp.store.get('r:' + pc.jList[q]), c = bp.store.get('r:' + pc.jList[q + 1]); s += Math.hypot(a[0] - c[0], a[2] - c[2]); } return s; };
  const arcs = petals.map(arcLen); let bad = 0;
  for (let mask = 0; mask < (1 << petals.length); mask++) { const on = petals.filter((_, i) => mask & (1 << i)); for (const id of on) if (!(arcLen(id) >= 1)) bad++; }
  ok('any unlock subset coherent: every petal docks to MAIN (all 128 subsets)', bad === 0 && arcs.every((a) => a >= 1), petals.map((id, i) => `${id} ${arcs[i].toFixed(1)}u @${bp.pieces[id].mainTheta.map((v) => v.toFixed(1)).join('-')}deg`).join(', '));
}

// N. the farm is never occluded by a docked piece from the gameplay presets
{
  const res = [];
  for (const name of ['default_mobile', 'default_desktop', 'farm_to_meadow', 'max_zoom_all', 'max_zoom_portrait']) {
    const c = A.cameras[name], aspect = c.w / c.h, t = Math.tan(A.render.camera.fov / 2 * Math.PI / 180), V = A.render.view;
    const dist = c.dist === 'frame' ? Math.min(V.maxDistance, Math.max(V.floor, V.mainFrame[0] / (2 * t * aspect) * V.fill, V.mainFrame[1] / (2 * t))) : c.dist;
    const e = c.el * Math.PI / 180, a = c.az * Math.PI / 180, cam = [c.tgt[0] + Math.cos(e) * Math.sin(a) * dist, c.tgt[1] + Math.sin(e) * dist, c.tgt[2] + Math.cos(e) * Math.cos(a) * dist];
    res.push([name, GT.farmOcclusion(bp, comp, cam, bp.order)]);
  }
  ok('farm not occluded by any docked piece (gameplay presets, all docked)', res.every(([, r]) => r.blocked === 0), res.map(([n, r]) => `${n} ${r.blocked}/${r.targets}${r.hits.length ? ' (' + [...new Set(r.hits)].join(',') + ')' : ''}`).join('; '));
}

// O. islet: open outward coast anchors (never on a seam); P. water continues the game's stream
{
  const exp = GT.exportBlueprint(bp, comp), anchors = exp.pieces.islet.openCoastAnchors; let bad = [];
  for (const an of anchors) { const [x, z] = an.world; let dSeam = 1e9; for (const s of bp.seams) for (const p of bp.seamPts[s.i]) dSeam = Math.min(dSeam, Math.hypot(p[0] - x, p[1] - z));
    if (dSeam < 1.5 || GT.pieceAt(bp, x * 0.995, z * 0.995) !== 'islet') bad.push(`${an.id} dSeam=${dSeam.toFixed(2)}`); }
  const coastIds = anchors.filter((a) => a.outward).map((a) => a.id);
  ok('islet: harbour / fishing / signal fire on its OPEN outward coast; lighthouse + keeper inside', !bad.length && coastIds.length === 3, `${anchors.map((a) => a.id).join(', ')}${bad.length ? ' BAD ' + bad.join(' ') : ''}`);
  const W = comp.water, rv = W.wetland.river.points[0], se = W.main.stream.rimExit, M = bp.pieces.main;
  const mainEndY = M.height(se.x, se.z) + A.waterTs.stream.endLift;          // the game: end.y = MAIN.height(end) (+0.02)
  const startOk = Math.hypot(rv.x - se.x, rv.z - se.z) < 1e-3 && Math.abs(rv.level - mainEndY) < 1e-3 && Math.abs(rv.width - se.width) < 1e-6 && Math.abs(se.width - 0.54) < 1e-9;
  const lk = B.features.find((f) => f.id === 'lake'), shoreOk = W.wetland.lake.outline.filter(([x, z]) => Math.abs(bp.H(x, z) - W.wetland.lake.level) < 0.08).length;
  const lakeOk = bp.H(lk.at[0], lk.at[1]) < W.wetland.lake.level - 0.1 && shoreOk >= 0.8 * W.wetland.lake.outline.length;
  const tarnOk = W.highland.tarn.level > 2.0 && W.highland.tarn.outline.length > 10;
  const wf = W.wetland.waterfall.points; const wfOk = Math.abs(bp.dcAt(wf[0][0], wf[0][2])) < 0.4 && wf[wf.length - 1][1] < -9;
  ok('water: river starts at the stream rim exit (same width/level); lake + tarn carved; waterfall off the rim', startOk && lakeOk && tarnOk && wfOk,
    `river start (${rv.x},${rv.z}) lvl ${rv.level} w ${rv.width} vs stream exit (${se.x},${se.z}) lvl ${mainEndY.toFixed(4)} w ${se.width}; lake lvl ${W.wetland.lake.level}; tarn lvl ${W.highland.tarn.level}; fall top dc ${bp.dcAt(wf[0][0], wf[0][2]).toFixed(2)}`);
}

// Q. cameras: gameplay presets inside the game clamp (fov 30); default_* framed like framing.ts
{
  const GP = A.render.gameplay, bad = []; let n = 0;
  for (const [name, c] of Object.entries(A.cameras)) { if (c.mode !== 'gameplay') continue; n++;
    const t = Math.tan(15 * Math.PI / 180), V = A.render.view, asp = c.w / c.h, dist = c.dist === 'frame' ? Math.min(V.maxDistance, Math.max(V.floor, V.mainFrame[0] / (2 * t * asp) * V.fill, V.mainFrame[1] / (2 * t))) : c.dist;
    const pol = Math.PI / 2 - c.el * Math.PI / 180, az = Math.atan2(Math.sin(c.az * Math.PI / 180), Math.cos(c.az * Math.PI / 180));
    if (dist < GP.minDistance || dist > GP.maxDistance || pol < GP.minPolar || pol > GP.maxPolar || az < GP.azimuthCenter - GP.azimuthRange || az > GP.azimuthCenter + GP.azimuthRange || c.tgt.join() !== V.target.join()) bad.push(name); }
  ok('gameplay presets obey the game clamp (target = framing.ts VIEW.target, no pan); fov 30', !bad.length && n >= 4 && A.render.camera.fov === 30, `gameplay=${n} violations=[${bad}] max_zoom dist=${A.cameras.max_zoom_all.dist}`);
}

// R. determinism + export freshness; S. adapter (THREE passed in)
{
  const b2 = GT.buildBlueprint(A, L, {}); let same = true;
  for (const id of bp.order) { const a = bp.pieces[id].positions, c = b2.pieces[id].positions; if (a.length !== c.length) { same = false; break; } for (let i = 0; i < a.length; i += 97) if (a[i] !== c[i]) { same = false; break; } }
  const fresh = JSON.stringify(GT.exportBlueprint(b2, GT.composeBlueprint(b2, L), { gameBottoms: gameBottoms() }), null, 1) + '\n', file = path.resolve(__dirname, '../../config/blueprint.pieces.json');
  const onDisk = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  ok('deterministic build; config/blueprint.pieces.json == a fresh export (section 10)', same && onDisk === fresh, `identical arrays=${same} exportUpToDate=${onDisk === fresh} (${(onDisk.length / 1024).toFixed(0)} KB)`);
  let bad = [];
  for (const id of bp.order) { const pc = bp.pieces[id], g = buildIslandGeometry(THREE, pc), { group } = pieceGroup(THREE, pc, new THREE.MeshBasicMaterial());
    const cov = g.groups.reduce((s, q) => s + q.count, 0);
    if (g.attributes.position.count !== pc.faceCount * 3 || g.attributes.normal.count !== pc.faceCount * 3 || g.attributes.color.count !== pc.faceCount * 3 || cov !== pc.faceCount * 3 || !Number.isFinite(g.boundingSphere.radius) || group.position.x !== pc.pivot[0] || group.position.y !== pc.pivot[1]) bad.push(id); }
  ok('adapter: BufferGeometry (position/normal/color, tag groups) + group pivot = piece pivot', !bad.length, bad.length ? bad.join(',') : `${bp.order.length} pieces OK (three ${THREE.REVISION})`);
}

// U. docs: STYLE.md Path swatch matches the config (was #D4B184 in the doc vs #C2935E in look.config)
{
  const style = fs.readFileSync(path.resolve(__dirname, '../../config/STYLE.md'), 'utf8'), m = style.match(/\| path \/ dirt \| Path \| (#[0-9A-Fa-f]{6}) \|/);
  ok('STYLE.md Path swatch == look.config palette.Path', m && m[1].toUpperCase() === L.palette.Path.toUpperCase(), `STYLE.md ${m ? m[1] : 'n/a'} vs look.config ${L.palette.Path}`);
}

// V. docs: land unlocks. Every piece is claimed at level 1 in any order; only wetland (4 restorations) and highland (9) keep a second gate. The generated JSON must not repeat the old level / XP / commit gates.
{
  const file = path.resolve(__dirname, '../../config/blueprint.pieces.json'), J = JSON.parse(fs.readFileSync(file, 'utf8'));
  const petals = bp.order.filter((id) => id !== 'main'), un = (id) => String(J.pieces[id]?.unlock ?? '');
  const old = petals.filter((id) => /\blevel\b|\blifetime\b|\bxp\b|\bcommits?\b/i.test(un(id)));
  const rest = (id) => { const m = un(id).match(/(\d+)\s+restorations?\b/i); return m ? +m[1] : 0; };
  const want = { wetland: 4, highland: 9 }, wrong = petals.filter((id) => rest(id) !== (want[id] ?? 0));
  const noOrder = petals.filter((id) => !/^any order\b/.test(un(id)));
  ok('land unlock docs: no level / lifetime-XP / commit gate; wetland 4 restorations, highland 9, the rest plain land',
    old.length === 0 && wrong.length === 0 && noOrder.length === 0 && petals.length === 7,
    `${petals.map((id) => `${id}="${un(id)}"`).join('; ')}${old.length ? ` | OLD GATE: ${old.join(',')}` : ''}${wrong.length ? ` | WRONG RESTORATIONS: ${wrong.join(',')}` : ''}${noOrder.length ? ` | NOT "any order": ${noOrder.join(',')}` : ''}`);
}

// V2. docs: the BLUEPRINT.md piece table repeats the JSON unlock strings (one row per piece; MAIN has none: "start")
{
  const md = fs.readFileSync(path.resolve(__dirname, '../../BLUEPRINT.md'), 'utf8').split('\n');
  const J = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config/blueprint.pieces.json'), 'utf8'));
  const h = md.findIndex((l) => /^\|\s*piece\s*\|\s*unlock\s*\|/.test(l)), cells = new Map();
  if (h >= 0) for (let i = h + 2; i < md.length && md[i].startsWith('|'); i++) { const c = md[i].split('|').map((s) => s.trim()); cells.set(c[1], c[2]); }
  const ids = Object.keys(J.pieces), want = (id) => String(J.pieces[id].unlock ?? 'start');
  const bad = ids.filter((id) => cells.get(id) !== want(id)), extra = [...cells.keys()].filter((id) => !J.pieces[id]);
  ok('land unlock docs: the BLUEPRINT.md piece table repeats the JSON unlock cells', h >= 0 && !bad.length && !extra.length && cells.size === ids.length,
    h < 0 ? 'no "| piece | unlock |" table in BLUEPRINT.md' : `${cells.size} rows` + (bad.length ? ` | MISMATCH: ${bad.map((id) => `${id} doc "${cells.get(id) ?? '-'}" vs JSON "${want(id)}"`).join('; ')}` : ', every unlock cell matches')
      + (extra.length ? ` | NOT A PIECE: ${extra.join(',')}` : ''));
}

function report() {
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
  console.log('\n  BLUEPRINT ISLAND INVARIANTS (spec v3.1)' + (process.env.TARGET ? ' TARGET=' + process.env.TARGET : ''));
  console.log('  ' + '-'.repeat(96));
  for (const r of results) { if (!r.pass) fails++; console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + pad(r.name, 70) + '\n        ' + r.detail); }
  console.log('  ' + '-'.repeat(96)); console.log(`  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
}
report();
process.exit(results.every((r) => r.pass) ? 0 : 1);
