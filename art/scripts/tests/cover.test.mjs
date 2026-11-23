// cover.test.mjs -- the living-ground scatter (composeBlueprint's `cover`): the painterly kit in patches by area, both seeds.
//   V1 sane payload (5,000-12,000 items in all, each piece <= 8,000 items / 80,000 kit tris)   V2 only kit assets   V8 deterministic
//   V3 the farm is low and tidy (grass, clover, daisy, pebbles; >= 300 plants)   V4 never on a trunk (0.3 u) or a slope > 0.6
//   V5 patches, not a sprinkle (wild isles: nearest neighbour shares the item's group >= 1.6 x a random relabelling)   V6 drift flowers mixed (each kind >= 8 %)
//   V7 perennials on every wild isle (>= 10), ferns in the shade of 2+ trees   V9 the farm's cover clear of the slots the game moved aside (layout.ts aside(), BUSHES[6])
//   V10-V12 MAIN's zoned clusters (groundZones, lib/ground-measure.mjs): every item names its cluster; densities per zone A / lawn / C / B / D / E; short grass
//      clustered (Clark-Evans), clusters of 3-7, tuft patches >= 4
//   V13 clearance from geometry alone (spots, path edges, pond teardrop, legacy blob, stream, animal yards, near side) and the pond's camera-facing shore (low, reeds far side);
//      V13b zone height rules (pebbles in C / E only); V13p path-edge pebble runs; V13c pebbles not tiny
//   V14 grounded (game height grid vs baked top <= 0.02 u, footprint <= 0.04 u, gameGround == piece_<id>.height.bin, kit yOffset -0.01)   V15 no ring round always-there trees
//   V16 no clones; cover tints (near-white, darker clover in shade pools)   V17 the pond's reeds (<= 35 % of the shore, 2-3 stretches >= 1.0 u apart, clumps of 3-5)
//   V18 every cover kind >= 12 items on its piece, kind counts near the baseline (fixtures/cover.base.json)   RF1 no tuft patch spills into A   RF2 pond edge follows the teardrop
//   RF4 pebbles sit on the ground   RF5 no two clusters of one kind within 4 u share a layout
//   node tests/cover.test.mjs          (TERRAIN=path/to/terrain.mjs to test another core)
//   node tests/cover.test.mjs --freeze   also writes tests/fixtures/cover.base.json (the V18 baseline) when every check passes; run once on the base commit only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';
import { KIT, buildPlant } from '../lib/plantkit.mjs';
import { zoneGrid, currentSpots, stonePathsNow, densityIn, openShare, patchShare, clarkEvans, bearingSpan, kitHeights, polyEdgeDist, polyEdgeNearest } from '../lib/ground-measure.mjs';
import { assetTable, bakedTopSampler } from '../lib/composition.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const GT = (await import(pathToFileURL(process.env.TERRAIN ? path.resolve(process.env.TERRAIN) : path.join(here, '..', 'lib', 'terrain.mjs')).href)).default;
let pass = 0, fail = 0;
const FREEZE = process.argv.includes('--freeze'), frozen = {};
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const io = new NodeIO(), TRIS = {};
for (const id of Object.keys(KIT)) TRIS[id] = (await io.readBinary(await buildPlant(id))).getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3;
const GROUP = (a) => a === 'grass_short' ? 'short' : a === 'grass_tall' || a === 'grass_seedhead' ? 'tall' : a === 'clover_patch' ? 'clover' : a.startsWith('flower_') ? 'wild' : 'perennial';
const FARM_OK = new Set(['grass_short', 'clover_patch', 'flower_daisy', 'weed_rosette', 'pebbles']);
const BASE = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'cover.base.json'), 'utf8'));
const A = W3.archipelago, f2 = (v) => (+v).toFixed(2), f4 = (v) => (+v).toFixed(3), KH = await kitHeights();
const sameDeep = (a, b) => (Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((v, i) => sameDeep(v, b[i]))
  : a && typeof a === 'object' ? b && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => sameDeep(a[k], b[k])) : a === b);
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
  return [Math.hypot(x - ax - dx * t, z - az - dz * t), t]; };
const wrap = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
// the moved slots where the game stands them now (layout.ts) with its keep-clear radii; BUSHES[6] moved off the hero tree's root flare for good
const MOVED = [['FRUIT_TREES[0]', 5.77, -2.3, 0.55], ['FRUIT_TREES[5]', 0.95, 6.95, 0.55], ['FLOWERBEDS[0]', -5.0, 1.22, 0.6], ['FLOWERBEDS[1]', -1.33, -5.6, 0.6],
  ['LANTERNS[3]', 0.45, 4.6, 0.3], ['BENCH', 0.2, 5.77, 0.6], ['BUSHES[2]', 1.3, -6.8, 0.45], ['STATIC_TREES[2]', -2.08, -6.63, 0.3 + 0.2 * 1.35],
  ['STATIC_TREES[4]', -0.88, -4.55, 0.3 + 0.2 * 0.95], ['STATIC_TREES[6]', 3.47, -6.43, 0.3 + 0.2 * 1.15], ['STATIC_TREES[7]', 6.85, -3.7, 0.3 + 0.2 * 0.95],
  ['ROCKS[0]', -7.45, 1.35, 0.4], ['ROCKS[3]', 1.72, 7.52, 0.4], ['BUSHES[6]', -5.91, -5.33, 0.45]];
const YARDS = [[-1.5, -1.7, 1.5], [-3.0, 1.6, 1.0], [-1.2, 1.5, 1.3]];
const MODELS = path.resolve(here, '../../../public/models'), BPJ = JSON.parse(fs.readFileSync(path.resolve(here, '../../config/blueprint.pieces.json'), 'utf8')).pieces;
const MAN = JSON.parse(fs.readFileSync(path.join(MODELS, 'manifest.json'), 'utf8')), BAKED = {};
for (const id of Object.keys(BPJ)) { const e = MAN.assets['piece_' + id], hb = fs.readFileSync(path.join(MODELS, `piece_${id}.height.bin`));
  BAKED[id] = { top: bakedTopSampler(await io.read(path.join(MODELS, `piece_${id}.glb`))), grid: new Float32Array(hb.buffer.slice(hb.byteOffset, hb.byteOffset + hb.byteLength)), hm: e.height, pivot: BPJ[id].dockedPosition }; }
{ let GG = null, err = ''; try { GG = GT.gameGround ? GT.gameGround(A, L) : null; } catch (e) { err = e.message.split('\n')[0]; }
  const bad = []; if (!GG) bad.push(err || 'no terrain.mjs gameGround');
  else for (const id of Object.keys(BPJ)) { const g = GG.pieces[id], B = BAKED[id];
    if (!g) { bad.push(`${id}: none`); continue; }
    const same = g.grid.length === B.grid.length && Buffer.from(g.grid.buffer, g.grid.byteOffset, g.grid.byteLength).equals(Buffer.from(B.grid.buffer, B.grid.byteOffset, B.grid.byteLength));
    if (!same || g.origin.join() !== B.hm.origin.join() || g.size.join() !== B.hm.size.join() || g.spacing !== B.hm.spacing) bad.push(`${id}: ${same ? 'metadata' : 'grid bytes'} differ`); }
  ok(`V14b the core's game ground (gameGround) == every piece_<id>.height.bin, byte for byte`, !bad.length, bad.join(', ')); }
const gridAt = (B, x, z) => { const [x0, z0] = B.hm.origin, [nx, nz] = B.hm.size, s = B.hm.spacing, gx = (x - x0) / s, gz = (z - z0) / s, i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j;
  if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return null;
  const g00 = B.grid[j * nx + i], g10 = B.grid[j * nx + i + 1], g01 = B.grid[(j + 1) * nx + i], g11 = B.grid[(j + 1) * nx + i + 1];
  if (!(Number.isFinite(g00) && Number.isFinite(g10) && Number.isFinite(g01) && Number.isFinite(g11))) return null;
  return (g00 * (1 - u) + g10 * u) * (1 - v) + (g01 * (1 - u) + g11 * u) * v; };

for (const [label, seed] of [['default', A.seeds.default], ['alt', A.seeds.alt]]) {
  const bp = GT.buildBlueprint(A, L, { seed: seed >>> 0 }), comp = GT.composeBlueprint(bp, L), P = comp.pieces;
  const slope = (x, z) => { const e = 0.3; return Math.hypot(bp.H(x + e, z) - bp.H(x - e, z), bp.H(x, z + e) - bp.H(x, z - e)) / (2 * e); };
  const sizes = bp.order.map((id) => (P[id].cover || []).length), total = sizes.reduce((s, n) => s + n, 0);
  const tris = bp.order.map((id) => (P[id].cover || []).reduce((s, c) => s + (TRIS[c.asset] || 0), 0));
  if (FREEZE) { frozen[label] = {};
    for (const id of bp.order) { const kinds = {}; for (const c of P[id].cover || []) kinds[c.asset] = (kinds[c.asset] || 0) + 1;
      frozen[label][id] = { n: (P[id].cover || []).length, kinds: Object.fromEntries(Object.entries(kinds).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) }; } }
  ok(`V1 ${label}: cover on every piece, total ${total} in 5,000-12,000, each piece <= 8,000 items / 80,000 tris`, sizes.every((n) => n > 0) && total >= 5000 && total <= 12000 && sizes.every((n) => n <= 8000) && tris.every((t) => t <= 80000),
    bp.order.map((id, i) => `${id} ${sizes[i]} (${tris[i]} tris)`).join(', '));
  const bad = []; for (const id of bp.order) for (const c of P[id].cover || []) if (!KIT[c.asset]) bad.push(`${id} ${c.asset}`);
  ok(`V2 ${label}: only kit assets`, total > 0 && !bad.length, bad.slice(0, 5).join(', '));
  const farm = P.main.cover || [], plants = farm.filter((c) => c.asset !== 'pebbles'), off = farm.filter((c) => !FARM_OK.has(c.asset));
  ok(`V3 ${label}: the farm is low and tidy (${plants.length} plants >= 300)`, plants.length >= 300 && farm.every((c) => FARM_OK.has(c.asset)),
    off.length ? `not farm kinds: ${[...new Set(off.map((c) => c.asset))].join(', ')} (${off.length})` : '');
  const trees = bp.order.flatMap((id) => P[id].trees); let onTrunk = 0, steep = 0;
  for (const id of bp.order) for (const c of P[id].cover || []) { if (trees.some((t) => Math.abs(t.x - c.x) < 0.3 && Math.abs(t.z - c.z) < 0.3 && Math.hypot(t.x - c.x, t.z - c.z) < 0.3)) onTrunk++; if (slope(c.x, c.z) > 0.6 + 1e-6) steep++; }
  ok(`V4 ${label}: none on a trunk (${onTrunk}) or a steep slope (${steep})`, total > 0 && !onTrunk && !steep);
  let same = 0, pairs = 0; const share = {};
  for (const id of bp.order) { if (id === 'main') continue; const C = P[id].cover || [], g = new Map(), key = (x, z) => Math.floor(x / 0.6) + ',' + Math.floor(z / 0.6);
    for (const c of C) { (g.get(key(c.x, c.z)) || g.set(key(c.x, c.z), []).get(key(c.x, c.z))).push(c); share[GROUP(c.asset)] = (share[GROUP(c.asset)] || 0) + 1; }
    for (const c of C) { let best = null, bd = 0.6; const cx = Math.floor(c.x / 0.6), cz = Math.floor(c.z / 0.6);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of g.get((cx + a) + ',' + (cz + b)) || []) { if (o === c) continue; const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd) { bd = d; best = o; } }
      if (best) { pairs++; if (GROUP(best.asset) === GROUP(c.asset)) same++; } } }
  const n = Object.values(share).reduce((s, v) => s + v, 0), expect = Object.values(share).reduce((s, v) => s + (v / n) ** 2, 0), obs = pairs ? same / pairs : 0;
  ok(`V5 ${label}: patches, not a sprinkle (same-group nearest neighbours ${(100 * obs).toFixed(0)} % vs ${(100 * expect).toFixed(0)} % at random, >= 1.6 x)`, pairs > 0 && obs >= 1.6 * expect);
  const wf = {}; let nw = 0; for (const id of bp.order) for (const c of P[id].cover || []) if (c.asset.startsWith('flower_')) { wf[c.asset] = (wf[c.asset] || 0) + 1; nw++; }
  ok(`V6 ${label}: the drift flowers are mixed (each kind >= 8 %)`, ['flower_daisy', 'flower_buttercup', 'flower_poppy', 'flower_cornflower'].every((k) => (wf[k] || 0) >= 0.08 * nw),
    Object.entries(wf).map(([k, v]) => `${k.slice(7)} ${(100 * v / nw).toFixed(0)} %`).join(', '));
  const perN = bp.order.filter((id) => id !== 'main').map((id) => [id, (P[id].cover || []).filter((c) => c.asset.startsWith('perennial_')).length]);
  let fernBad = 0; for (const id of bp.order) for (const c of P[id].cover || []) if (c.asset === 'fern_clump' && trees.filter((t) => Math.hypot(t.x - c.x, t.z - c.z) < 1.7).length < 2) fernBad++;
  ok(`V7 ${label}: perennials gather on every wild isle (>= 10), ferns only in tree shade (${fernBad} not)`, perN.every(([, k]) => k >= 10) && !fernBad, perN.map(([id, k]) => `${id} ${k}`).join(', '));
  const onMoved = {}; for (const c of farm) for (const [what, mx, mz, r] of MOVED) if (Math.hypot(c.x - mx, c.z - mz) < r) onMoved[what] = (onMoved[what] || 0) + 1;
  ok(`V9 ${label}: the farm's cover keeps clear of the moved slots (${Object.values(onMoved).reduce((s, v) => s + v, 0)} on them)`, farm.length > 0 && !Object.keys(onMoved).length,
    Object.entries(onMoved).map(([k, v]) => `${k} ${v}`).join(', '));
  const again = GT.composeBlueprint(bp, L).pieces;
  if (label === 'default') ok('V8 deterministic: composing again gives the same cover', total > 0 && bp.order.every((id) => JSON.stringify(again[id].cover) === JSON.stringify(P[id].cover)));

  const K = P.main.coverClusters || [], members = K.map(() => []);
  for (const c of farm) if (K[c.cl]) members[c.cl].push(c);
  ok(`V10 ${label}: every MAIN item names its cluster (${K.length} clusters); composing again gives the same items and clusters`,
    farm.every((c) => K[c.cl]) && K.every((k, i) => k.n === members[i].length) && sameDeep(again.main.cover, farm) && sameDeep(again.main.coverClusters, K),
    `${farm.filter((c) => !K[c.cl]).length} items without one, ${K.filter((k, i) => k.n !== members[i].length).length} clusters whose n is not their members' count`);
  const Z = GT.groundZones(bp, comp, comp.water), g = zoneGrid(Z, bp, 'main'), d = (zn) => densityIn(g, plants, (c) => c.zone === zn), inR = (v, a, b) => v >= a && v <= b;
  // the pond: the teardrop, its outward normals n, n . c with the camera's ground direction c = (sin 45, cos 45), the cap line, the stretches' ground (inSt -> k, or -1)
  const TP = comp.water.main.pond.outline, nT = TP.length, capA = TP[nT - 1], capB = TP[0], CAMG = [Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)];
  let tArea = 0; for (let i = 0; i < nT; i++) tArea += TP[i][0] * TP[(i + 1) % nT][1] - TP[(i + 1) % nT][0] * TP[i][1];
  const tNc = TP.map((p, i) => { const a = TP[(i - 1 + nT) % nT], b = TP[(i + 1) % nT], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, sg = tArea < 0 ? -1 : 1;
    return (sg * dz / l) * CAMG[0] + (-sg * dx / l) * CAMG[1]; });
  const capD = (x, z) => segD(x, z, capA[0], capA[1], capB[0], capB[1])[0], STR = P.main.pondStretches || [], REEDS = P.main.reeds || [];
  const inSt = (x, z) => { if (GT.inLoop(TP, x, z) || capD(x, z) < 1.0) return -1; const { d: e, i } = polyEdgeNearest(TP, x, z); if (e < 0.35 || e > 1.25) return -1;
    const s = STR.find((q) => i >= q.i0 && i <= q.i1); return s ? s.k : -1; };
  const camShore = TP.filter((p, i) => tNc[i] > 0.2), nearCam = (x, z) => camShore.some((p) => Math.hypot(p[0] - x, p[1] - z) < 1.25);
  const nearestPt = (x, z) => { let m = Infinity, k = -1; TP.forEach((p, i) => { const e = Math.hypot(p[0] - x, p[1] - z); if (e < m) { m = e; k = i; } }); return k; };
  const dDs = densityIn(g, plants, (c) => c.zone === 'D' && inSt(c.x, c.z) >= 0), dDr = densityIn(g, plants, (c) => c.zone === 'D' && inSt(c.x, c.z) < 0);
  // B's patches at r 0.5 (k 3) are a density-shape check (a uniform sprinkle scores ~0.75 there); V12's Clark-Evans tells patches from a sprinkle
  const dE = densityIn(g, plants, (c) => c.zone === 'E' && c.dPath >= 0.25), openA = openShare(g, plants, (c) => c.zone === 'A', 0.3), patchB = patchShare(g, plants, (c) => c.zone === 'B', 3, 0.5);
  ok(`V11 ${label} MAIN: A 0.8-1.5 and >= 70 % open at 0.3 u; lawn 3-4; C 3-5; B 5-7, >= 2.5 x A, patches (3 within 0.5 u) over 60-75 %; D 4-6 on the stretches (${f2(dDs)}), 1.5-2.5 elsewhere (${f2(dDr)}), >= 2 stretches (${STR.length}); E 0.25-0.7 u <= 0.5 x lawn`,
    inR(d('A'), 0.8, 1.5) && openA >= 0.7 && inR(d('lawn'), 3, 4) && inR(d('C'), 3, 5) && inR(d('B'), 5, 7) && d('B') >= 2.5 * d('A')
    && inR(patchB, 0.6, 0.75) && STR.length >= 2 && inR(dDs, 4, 6) && inR(dDr, 1.5, 2.5) && dE <= 0.5 * d('lawn'));
  const R = clarkEvans(farm.filter((c) => c.asset === 'grass_short'), g.cells.length * 0.01), k37 = K.filter((k) => k.n >= 3 && k.n <= 7).length, t3 = K.filter((k) => k.kind === 'tuft' && k.n < 4).length;
  ok(`V12 ${label}: short grass clustered (Clark-Evans ${f2(R)} <= 0.8); >= 80 % of clusters have 3-7 members (${k37} of ${K.length}); every tuft patch has >= 4 (${t3} under)`, R <= 0.8 && k37 >= 0.8 * K.length && !t3);

  const CV = { ...GT.COVER, ...(A.composition.cover || {}) }, padOf = (a) => CV.pad[a] ?? CV.pad.default, spots = currentSpots(A, GT), GC = GT.groundConfig(A);
  const spotD = (s, x, z) => { if (!s.rect) return Math.hypot(x - s.x, z - s.z) - s.r; const [x0, z0, x1, z1] = s.rect, ox = Math.max(x0 - x, 0, x - x1), oz = Math.max(z0 - z, 0, z - z1);
    return ox > 0 || oz > 0 ? Math.hypot(ox, oz) : -Math.min(x - x0, x1 - x, z - z0, z1 - z); };
  const runs = []; for (const id of bp.order) for (const p of P[id].paths) runs.push({ pts: p.pts, hw: (i) => (p.widths ? p.widths[i] : p.width) / 2 });
  for (const p of stonePathsNow(A.game)) runs.push({ pts: GT.resamplePolyline(GT.catmullRomCentripetal(p, 6), 0.2), hw: () => GC.stonePath / 2 });
  const edgeD = (x, z) => { let m = Infinity; for (const r of runs) for (let i = 0; i < r.pts.length - 1; i++) { const a = r.pts[i], b = r.pts[i + 1];
    if (Math.abs(a[0] - x) > 3 || Math.abs(a[1] - z) > 3) continue; const [dd, t] = segD(x, z, a[0], a[1], b[0], b[1]); m = Math.min(m, dd - (r.hw(i) + (r.hw(i + 1) - r.hw(i)) * t)); } return m; };
  const po = comp.water.main.pond.outline, lg = comp.water.main.pond.legacy, sl = comp.water.main.stream.line;
  const tearD = (x, z) => { let m = Infinity; for (let i = 0; i < po.length; i++) { const a = po[i], b = po[(i + 1) % po.length]; m = Math.min(m, segD(x, z, a[0], a[1], b[0], b[1])[0]); } return m; };
  const streamD = (x, z) => { let m = Infinity; for (let i = 0; i < sl.length - 1; i++) { const [dd, t] = segD(x, z, sl[i].x, sl[i].z, sl[i + 1].x, sl[i + 1].z); m = Math.min(m, dd - (sl[i].width + (sl[i + 1].width - sl[i].width) * t) / 2); } return m; };
  const near = (x, z) => { const th = ((Math.atan2(z, x) * 180 / Math.PI) + 360) % 360; return th > 22 && th < 68 && Math.hypot(x, z) < 16; };
  const b13 = { spot: [], path: [], water: [], yard: [], near: [] };
  for (const c of farm) {
    const at = `${c.asset} (${f2(c.x)}, ${f2(c.z)})`, h = (KH[c.asset] ?? Infinity) * c.scale;
    for (const s of spots) { const dd = spotD(s, c.x, c.z); if (dd < padOf(c.asset)) { b13.spot.push(`${at} ${f2(dd)} u from ${s.what}`); break; } }
    const de = edgeD(c.x, c.z); if (de < 0.25) b13.path.push(`${at} ${f2(de)} u from a path edge`);
    if (GT.inLoop(po, c.x, c.z) || tearD(c.x, c.z) < 0.35) b13.water.push(`${at} teardrop`);
    else if (Math.hypot(c.x - lg.at[0], c.z - lg.at[1]) - lg.r < 0.35) b13.water.push(`${at} legacy blob`);
    else if (streamD(c.x, c.z) < 0.35) b13.water.push(`${at} stream`);
    if (YARDS.some(([x, z, r]) => Math.hypot(c.x - x, c.z - z) < r) && h > 0.2 + 1e-9) b13.yard.push(`${at} ${f2(h)} u tall in a yard`);
    if (near(c.x, c.z) && h > 0.3 + 1e-9) b13.near.push(`${at} ${f2(h)} u tall on the near side`);
  }
  ok(`V13 ${label}: clearance (spots ${b13.spot.length}, paths ${b13.path.length}, water ${b13.water.length}, too tall in a yard ${b13.yard.length} / on the near side ${b13.near.length}; legacy r ${f2(lg.r)})`,
    farm.length > 0 && Object.values(b13).every((l) => !l.length), Object.values(b13).flatMap((l) => l.slice(0, 2)).join('; '));

  const sh = { reed: [], tall: [], side: [] };
  for (const r of REEDS) { const at = `reed (${f2(r.x)}, ${f2(r.z)})`; if (nearCam(r.x, r.z)) sh.reed.push(`${at} by the camera-facing shore`);
    const k = nearestPt(r.x, r.z); if (!(tNc[k] < -0.2)) sh.side.push(`${at} nearest outline point ${k} n.c ${f2(tNc[k])}`); }
  for (const c of farm) { const h = (KH[c.asset] ?? Infinity) * c.scale; if (h > 0.2 + 1e-9 && nearCam(c.x, c.z)) sh.tall.push(`${c.asset} (${f2(c.x)}, ${f2(c.z)}) ${f2(h)} u`); }
  ok(`V13 shore ${label}: within 1.25 u of the teardrop's camera-facing shore (${camShore.length} outline points with n.c > 0.2): reeds ${sh.reed.length}, over 0.2 u ${sh.tall.length}; ${REEDS.length} reeds, ${sh.side.length} not on the far side (n.c < -0.2)`,
    REEDS.length > 0 && camShore.length > 0 && Object.values(sh).every((l) => !l.length), Object.values(sh).flatMap((l) => l.slice(0, 3)).join('; '));

  const b13b = { A: [], ED: [], D: [], P: [] };
  for (const c of farm) { const zn = Z.at('main', c.x, c.z)?.zone, h = (KH[c.asset] ?? Infinity) * c.scale, at = `${c.asset} (${f2(c.x)}, ${f2(c.z)}) ${f2(h)} u`, st = zn === 'D' && inSt(c.x, c.z) >= 0;
    if (zn === 'A' && (!(c.asset === 'grass_short' || c.asset === 'clover_patch') || h > 0.15 + 1e-9)) b13b.A.push(at);
    if ((zn === 'E' || zn === 'D') && c.asset !== 'grass_short' && !(zn === 'E' && c.asset === 'pebbles') && !(st && c.asset === 'clover_patch')) b13b.ED.push(`${at} in ${zn}`);   // (GR13, Task 9: pebbles may stand in E; Task 10: clover on D's stretches)
    if (zn === 'D' && h > 0.2 + 1e-9) b13b.D.push(at);
    if (c.asset === 'pebbles' && ((zn !== 'C' && zn !== 'E') || h > 0.045 + 1e-9)) b13b.P.push(`${at} in ${zn}`); }   // (GR13: pebbles stand in C and E only, <= 0.045 u; none on D's stretches, GR29)
  ok(`V13b ${label}: the farm stays low by zone (A not short grass / clover or over 0.15 u: ${b13b.A.length}; not short grass in E / D (pebbles in E, clover on D's stretches excepted): ${b13b.ED.length}; over 0.2 u in D: ${b13b.D.length}; pebbles outside C / E or over 0.045 u: ${b13b.P.length})`,
    farm.length > 0 && Object.values(b13b).every((l) => !l.length), Object.values(b13b).flatMap((l) => l.slice(0, 2)).join('; '));

  const segL = TP.map((p, i) => Math.hypot(TP[(i + 1) % nT][0] - p[0], TP[(i + 1) % nT][1] - p[1])), perim = segL.reduce((s, v) => s + v, 0);
  const cov = TP.map((p) => REEDS.some((r) => Math.hypot(r.x - p[0], r.z - p[1]) <= 1.0)), wt = (i) => (segL[i] + segL[(i - 1 + nT) % nT]) / 2;
  const reedShare = cov.reduce((s, v, i) => s + (v ? wt(i) : 0), 0) / perim;
  const stOfReed = (r) => { const { i } = polyEdgeNearest(TP, r.x, r.z), q = STR.find((S) => i >= S.i0 && i <= S.i1); return q ? q.k : -1; };
  const byStr = new Map(), offStr = []; for (const r of REEDS) { const k = stOfReed(r); if (k < 0) offStr.push(r); else (byStr.get(k) || byStr.set(k, []).get(k)).push(r); }
  let apartMin = Infinity; const ks = [...byStr.keys()];
  for (let p = 0; p < ks.length; p++) for (let q = p + 1; q < ks.length; q++) for (const u of byStr.get(ks[p])) for (const w of byStr.get(ks[q])) apartMin = Math.min(apartMin, Math.hypot(u.x - w.x, u.z - w.z));
  const clumps = new Map(); for (const r of REEDS) clumps.set(r.cl, (clumps.get(r.cl) || 0) + 1);
  const badClump = [...clumps].filter(([, n]) => n < 3 || n > 5), badH = REEDS.filter((r) => !(r.height >= 0.8 && r.height <= 1.25));
  ok(`V17 ${label}: the reeds cover ${(100 * reedShare).toFixed(1)} % of the teardrop's shore (<= 35 %); on ${byStr.size} of ${STR.length} stretches (2-3; ${offStr.length} reeds off them), the nearest reeds of two stretches ${f2(apartMin)} u apart (>= 1.0, GR28); clumps of 3-5 (${badClump.length} not), height 0.8-1.25 (${badH.length} not)`,
    REEDS.length > 0 && reedShare <= 0.35 + 1e-9 && STR.length >= 2 && STR.length <= 3 && byStr.size === STR.length && !offStr.length && apartMin >= 1.0 - 1e-9 && !badClump.length && !badH.length);

  const rf2 = [], chk = (what, x, z, lo, hi) => { const e = polyEdgeDist(TP, x, z), sd = GT.inLoop(TP, x, z) ? -e : e;   // (signed: < 0 in the water)
    if (sd < lo - 1e-9 || sd > hi + 1e-9 || capD(x, z) < 1.0 - 1e-9) rf2.push(`${what} (${f2(x)}, ${f2(z)}) ${f2(sd)} u out, ${f2(capD(x, z))} u from the cap line`); };
  for (const r of REEDS) chk('reed', r.x, r.z, -0.25, 0.4);   // (GR30: the waterline)
  const stItems = farm.filter((c) => c.stretch !== undefined); for (const c of stItems) chk(c.asset, c.x, c.z, 0.35, 1.25);
  const untagged = farm.filter((c) => Z.at('main', c.x, c.z)?.zone === 'D' && inSt(c.x, c.z) >= 0 && c.stretch !== inSt(c.x, c.z));
  ok(`RF2 ${label}: the pond edge follows the teardrop: ${REEDS.length} reeds 0.25 u in to 0.4 u out (GR30) and ${stItems.length} stretch items 0.35-1.25 u out, >= 1.0 u from the cap line (${rf2.length} not); ${untagged.length} D items on a stretch without its k`,
    REEDS.length > 0 && stItems.length > 0 && !rf2.length && !untagged.length, [...rf2.slice(0, 4), ...untagged.slice(0, 2).map((c) => `${c.asset} (${f2(c.x)}, ${f2(c.z)}) untagged`)].join('; '));

  // V13p: a run = its points with the half width at each and the arc length to each; foot(x, z) -> { s, e, side }: arc length of the nearest point, distance to the run's edge there, side (+1 left, -1 right)
  const mainRuns = P.main.paths.map((p) => ({ id: p.id, pts: p.pts, hw: (i) => (p.widths ? p.widths[i] : p.width) / 2 }));
  stonePathsNow(A.game).forEach((p, k) => mainRuns.push({ id: 'stone' + k, pts: GT.resamplePolyline(GT.catmullRomCentripetal(p, 6), 0.2), hw: () => GC.stonePath / 2 }));
  for (const r of mainRuns) { r.cum = [0]; for (let i = 1; i < r.pts.length; i++) r.cum.push(r.cum[i - 1] + Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1])); r.L = r.cum[r.cum.length - 1]; }
  const foot = (r, x, z) => { let best = null;
    for (let i = 0; i < r.pts.length - 1; i++) { const a = r.pts[i], b = r.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
      const dd = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (!best || dd < best.dd) best = { dd, i, t, side: (dx * (z - a[1]) - dz * (x - a[0])) >= 0 ? 1 : -1, s: r.cum[i] + t * Math.sqrt(L2) }; }
    return { s: best.s, side: best.side, e: best.dd - (r.hw(best.i) + (r.hw(best.i + 1) - r.hw(best.i)) * best.t) }; };
  const peb = K.map((k, cl) => ({ k, cl })).filter(({ k }) => k.kind === 'pebble' && Z.at('main', k.x, k.z)?.zone === 'E');
  const longRuns = mainRuns.filter((r) => r.L >= 2), byRun = {}; let covered = 0, runLen = 0, swPairs = 0, swDone = 0, apart = 0;
  for (const r of longRuns) { const iv = [], mine = [];
    for (const { k } of peb) { const f = foot(r, k.x, k.z); if (f.e < 0.25 - 1e-9 || f.e > 0.7 + 1e-9) continue; iv.push([Math.max(0, f.s - 0.4), Math.min(r.L, f.s + 0.4)]); mine.push({ s: f.s, side: f.side }); }
    iv.sort((p, q) => p[0] - q[0]); let len = 0, end = -Infinity;   // (the union of the covered stretches)
    for (const [a, b] of iv) { if (b <= end) continue; len += b - Math.max(a, end); end = b; }
    byRun[r.id] = { share: len / r.L, n: mine.length, L: r.L }; covered += len; runLen += r.L;
    mine.sort((p, q) => p.s - q.s); for (let i = 1; i < mine.length; i++) { swPairs++; if (mine[i].side !== mine[i - 1].side) swDone++; else if (mine[i].s - mine[i - 1].s >= 1.5) apart++; } }
  const shareAll = runLen ? covered / runLen : 0, offRun = Object.entries(byRun).filter(([, c]) => Math.abs(c.share - 0.30) > 0.05 + 0.4 / c.L + 1e-9).map(([id, c]) => `${id} ${f2(c.share)} (${f2(c.L)} u)`);
  const pebEdge = P.main.cover.filter((c) => c.asset === 'pebbles').map((c) => edgeD(c.x, c.z)), minEdge = pebEdge.length ? Math.min(...pebEdge) : NaN;
  ok(`V13p ${label}: path-edge pebble runs: ${(100 * shareAll).toFixed(1)} % of the runs' length (0.25-0.35); each run near 0.30 (${offRun.length} off); consecutive clusters switch sides or stand >= 1.5 u apart: ${swDone + apart} of ${swPairs} (>= 70 %); no pebble < 0.25 u from an edge (nearest ${f2(minEdge)} u)`,
    peb.length > 0 && shareAll >= 0.25 - 1e-9 && shareAll <= 0.35 + 1e-9 && !offRun.length && swPairs > 0 && swDone + apart >= 0.7 * swPairs && minEdge >= 0.25 - 1e-9, offRun.join(', '));

  const pebList = farm.filter((c) => c.asset === 'pebbles'), pebH = pebList.map((c) => KH.pebbles * c.scale), meanH = pebH.length ? pebH.reduce((s, v) => s + v, 0) / pebH.length : 0;
  ok(`V13c ${label}: the pebbles read: mean standing height ${f4(meanH)} u >= 0.030 (the game found them tiny), none over the 0.045 u cap (max ${f4(Math.max(...pebH))})`, pebList.length > 0 && meanH >= 0.030 && Math.max(...pebH) <= 0.045 + 1e-9);

  const rf4 = [], B4 = BAKED.main; let worstSpan = 0, worstGap = 0, noGap = 0;
  for (const c of pebList) { const ys = [bp.H(c.x, c.z)]; for (let k = 0; k < 8; k++) ys.push(bp.H(c.x + 0.125 * Math.cos(k * Math.PI / 4), c.z + 0.125 * Math.sin(k * Math.PI / 4)));
    const span = Math.max(...ys) - Math.min(...ys), lx = c.x - B4.pivot[0], lz = c.z - B4.pivot[2], gy = gridAt(B4, lx, lz), ty = B4.top(lx, lz), gap = gy === null || ty === null ? 0 : Math.abs(gy - ty);   // (a hole's edge, where either is missing, is skipped: as V14)
    if (gy === null || ty === null) noGap++;
    worstSpan = Math.max(worstSpan, span); worstGap = Math.max(worstGap, gap);
    if (span > 0.015 + 1e-9 || gap > 0.01 + 1e-9) rf4.push(`(${f2(c.x)}, ${f2(c.z)}) span ${span.toFixed(4)} gap ${gap.toFixed(4)}`); }
  ok(`RF4 ${label}: every pebble sits on the ground: ${pebList.length} pebbles, the ground under 0.125 u spans <= 0.015 u (worst ${worstSpan.toFixed(4)}), the grid and the baked top agree to 0.01 u (worst ${worstGap.toFixed(4)}; ${noGap} on a hole's edge skipped); ${rf4.length} over`,
    pebList.length > 0 && !rf4.length, rf4.slice(0, 4).join('; '));

  const always = [...spots.filter((s) => s.what.startsWith('STATIC_TREES')).map((s) => ({ x: s.x, z: s.z })),
    ...P.main.trees.filter((t) => !t.layout && GT.pieceAt(bp, t.x, t.z) === 'main')];
  const b15 = []; let rings = 0;
  for (const t of always) { const nIn = farm.filter((c) => { const dd = Math.hypot(c.x - t.x, c.z - t.z); return dd >= 0.4 && dd <= 1.4; }).length; if (nIn < 3) continue;
    rings++; const sp = bearingSpan(farm, [t.x, t.z], 0.4, 1.4); if (sp > 240) b15.push(`(${f2(t.x)}, ${f2(t.z)}) ${sp.toFixed(0)} deg (${nIn} items)`); }
  ok(`V15 ${label}: no tree that is always there is ringed (<= 240 deg; ${rings} of ${always.length} trees with >= 3 items in the 0.4-1.4 u ring)`, always.length > 0 && !b15.length, b15.slice(0, 6).join(', '));

  const cg = new Map(), ck = (x, z) => Math.floor(x / 0.5) + ',' + Math.floor(z / 0.5);
  for (const c of farm) { const k = ck(c.x, c.z); (cg.get(k) || cg.set(k, []).get(k)).push(c); }
  const b16 = []; for (const c of farm) { if (!(c.scale > 0)) b16.push(`${c.asset} scale ${c.scale}`);
    const ix = Math.floor(c.x / 0.5), iz = Math.floor(c.z / 0.5);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of cg.get((ix + a) + ',' + (iz + b)) || []) {
      if (o === c || o.asset !== c.asset || Math.hypot(o.x - c.x, o.z - c.z) > 0.5 || farm.indexOf(o) < farm.indexOf(c)) continue;
      if (Math.abs(o.scale - c.scale) <= 0.03 && wrap(o.rot - c.rot) <= 0.2) b16.push(`${c.asset} (${f2(c.x)}, ${f2(c.z)}) ~ (${f2(o.x)}, ${f2(o.z)})`); } }
  ok(`V16 ${label}: no clones within 0.5 u (same asset, scale +/- 0.03, yaw +/- 0.2 rad: ${b16.length}); every scale > 0`, farm.length > 0 && !b16.length, b16.slice(0, 4).join(', '));

  // V16 (tint clause, plan Task 4): near-white tints, darker clover in the shade pools (U > 0.35, measured at the item)
  const tn = { none: 0, outBand: [], cloverN: 0, cloverBad: [], darkOut: [], formula: [] }, distinctTints = new Set(), cm = [], hiAll = [], loAll = [];
  const meanOf = (t) => (t[0] + t[1] + t[2]) / 3, isT = (t) => Array.isArray(t) && t.length === 3 && t.every(Number.isFinite);
  for (const c of farm) {
    if (!isT(c.tint)) { tn.none++; continue; }
    distinctTints.add(c.tint.join(','));
    const U = Z.at('main', c.x, c.z).U, shade = c.asset === 'clover_patch' && U > 0.35, m = meanOf(c.tint), at = `${c.asset} (${f2(c.x)}, ${f2(c.z)}) U ${f2(U)} tint ${c.tint.join(',')}`;
    if (shade) { tn.cloverN++; cm.push(m); if (m < 0.754 - 1e-9 || m > 0.972 + 1e-9) tn.cloverBad.push(at);
      const base = GT.texturedTint(c.x, c.z, { enabled: true, seed: GC.tint.seed }), k = GC.tint.clover[0] + GC.tint.clover[1] * GT.hash3(Math.round(c.x * 100), Math.round(c.z * 100), 7307);
      if (GC.tint.seed !== 29 || base.some((v, i) => Math.abs(v * k - c.tint[i]) > 2e-4)) tn.formula.push(at); }
    else { hiAll.push(Math.max(...c.tint)); loAll.push(Math.min(...c.tint)); if (c.tint.some((v) => v < 0.92 - 1e-9 || v > 1.08 + 1e-9)) tn.outBand.push(at); }
    if (m < 0.9 && !(U > 0.35)) tn.darkOut.push(at);
  }
  ok(`V16 ${label}: cover tint: every MAIN item tinted (${tn.none} without); others in [0.92, 1.08] (${tn.outBand.length} out); shade-pool clover (U > 0.35): ${tn.cloverN} >= 6, mean in [0.754, 0.972] (${tn.cloverBad.length} out); a mean under 0.9 only where U > 0.35 (${tn.darkOut.length} elsewhere); ${distinctTints.size} distinct tints > 20`,
    farm.length > 0 && !tn.none && !tn.outBand.length && tn.cloverN >= 6 && !tn.cloverBad.length && !tn.formula.length && !tn.darkOut.length && distinctTints.size > 20,
    [...tn.outBand.slice(0, 2), ...tn.cloverBad.slice(0, 2), ...tn.formula.slice(0, 2), ...tn.darkOut.slice(0, 2)].join('; '));

  const inA = farm.filter((c) => Z.at('main', c.x, c.z)?.zone === 'A');
  ok(`RF1 ${label}: no tuft patch spills into A (${inA.length} items in A)`, inA.length > 0 && inA.every((c) => (c.asset === 'grass_short' || c.asset === 'clover_patch') && K[c.cl] && Z.at('main', K[c.cl].x, K[c.cl].z)?.zone === 'A'));

  const layout = members.map((m, k) => `${m.length}:${m.map((c) => Math.round(Math.hypot(c.x - K[k].x, c.z - K[k].z) / 0.02)).sort((p, q) => p - q).join(',')}`), b5 = [];
  for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) if (K[i].kind === K[j].kind && Math.hypot(K[i].x - K[j].x, K[i].z - K[j].z) < 4 && layout[i] === layout[j]) b5.push(`${K[i].kind} ${i} / ${j} (${layout[i]})`);
  ok(`RF5 ${label}: no two clusters of one kind within 4 u share a layout (${b5.length} pairs)`, K.length > 0 && !b5.length, b5.slice(0, 4).join(', '));

  let maxGap = 0, offGrid = 0, overFoot = 0, worstFoot = 0; const perPiece = {}, gapOver = {}, worstAt = {};
  for (const id of bp.order) { const B = BAKED[id]; let fo = 0;
    for (const c of P[id].cover || []) {
      const lx = c.x - B.pivot[0], lz = c.z - B.pivot[2], gy = gridAt(B, lx, lz), ty = B.top(lx, lz);
      if (gy === null || ty === null) offGrid++;
      else { const gap = Math.abs(gy - ty); if (gap > 0.02) gapOver[id] = (gapOver[id] || 0) + 1; worstAt[id] = Math.max(worstAt[id] || 0, gap); maxGap = Math.max(maxGap, gap); }
      let lo = Infinity, hi = -Infinity; for (const dx of [-0.1, 0, 0.1]) for (const dz of [-0.1, 0, 0.1]) { const h = bp.H(c.x + dx, c.z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      worstFoot = Math.max(worstFoot, hi - lo); if (hi - lo > 0.04 + 1e-9) { overFoot++; fo++; } }
    if (fo) perPiece[id] = fo; }
  const kitIds = Object.keys(KIT), AT = assetTable(bp.config), offsets = kitIds.filter((k) => AT[k].yOffset !== (KIT[k].yOffset ?? -0.01));
  ok(`V14 ${label}: grounded: grid vs baked top <= 0.02 u on every piece (max ${maxGap.toFixed(4)}; ${offGrid} items on a hole's edge skipped); footprint varies <= 0.04 u (${overFoot} over, worst ${worstFoot.toFixed(3)}); kit yOffset -0.01 (${offsets.length} of ${kitIds.length} not)`,
    maxGap <= 0.02 && overFoot === 0 && offsets.length === 0, Object.entries(perPiece).map(([k, v]) => `${k} ${v}`).join(', '));

  const kindsOf = (id) => { const k = {}; for (const c of P[id].cover || []) k[c.asset] = (k[c.asset] || 0) + 1; return k; }, base = BASE[label];
  const small = [], over = []; let nNow = 0, nBase = 0;
  for (const id of bp.order) { const k = kindsOf(id), n = Object.keys(k).length, nb = Object.keys(base[id].kinds).length; nNow += n; nBase += nb;
    for (const [a, v] of Object.entries(k)) if (v < 12) small.push(`${id} ${a} ${v}`);
    if (n > nb + 2) over.push(`${id} ${n} kinds vs ${nb}`); }
  const pebs = farm.filter((c) => c.asset === 'pebbles'), pebsOut = pebs.filter((c) => { const zn = Z.at('main', c.x, c.z)?.zone; return !['C', 'E'].includes(zn); });   // (plan Task 9: C and E; none on D's stretches, GR29)
  ok(`V18 ${label}: every cover kind >= 12 items on its piece (${small.length} under); no piece > base + 2 kinds (${over.length}); ${nNow} kinds in all <= base ${nBase} + 8; MAIN's pebbles ${pebs.length} >= 12, ${pebsOut.length} outside C / E`,
    small.length === 0 && over.length === 0 && nNow <= nBase + 8 && pebs.length >= 12 && pebsOut.length === 0, [...small.slice(0, 6), ...over.slice(0, 2)].join(', '));
}
if (FREEZE) {
  if (fail) console.log('\n--freeze: NOT written, a check above fails');
  else { const out = path.join(here, 'fixtures', 'cover.base.json');
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(frozen, null, 2) + '\n');
    console.log(`\n--freeze: wrote ${path.relative(process.cwd(), out)} (${Object.entries(frozen).map(([l, ps]) => `${l}: ${Object.keys(ps).length} pieces, ${Object.values(ps).reduce((s, p) => s + p.n, 0)} items`).join('; ')})`); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
