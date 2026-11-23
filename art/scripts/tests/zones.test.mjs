// zones.test.mjs -- the ground zone field (lib/terrain.mjs groundZones; art/specs/2026-10-25-ground-vegetation-design.md §3, plan
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';
import { zoneGrid, zoneAreas, currentSpots, stonePathsNow } from '../lib/ground-measure.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const GT = (await import(pathToFileURL(process.env.TERRAIN ? path.resolve(process.env.TERRAIN) : path.join(here, '..', 'lib', 'terrain.mjs')).href)).default;
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const A = W3.archipelago, f2 = (v) => (+v).toFixed(2);
const segD = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)) : 0;
  return [Math.hypot(x - ax - dx * t, z - az - dz * t), t]; };
const same = (a, b) => (Array.isArray(a) ? Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]))
  : a && typeof a === 'object' ? b && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => same(a[k], b[k])) : a === b);
// Z0 the brief's pinned values (plan Task 1 Step 3), as literals: the core's merged GROUND must hold them
const PINNED = { zone: { E: 0.7, wet: 0.35, D: 1.25, C: 0.35, B: 0.5 }, halo: { house: 0.8, fence: 0.6, building: 0.4, slot: 0.3, wildZone: 0.4, jetty: 0.3 },
  W: { rim: [1.0, 2.6], corner: [2.0, 3.5], wild: [0.6, 0.4] },
  pools: { broadleaf: 0.75, conifer: 1.05, hero: 1.6, size: [0.6, 1.1], noise: 1.2, shift: 0.25, away: [0.993, -0.122], edge: [0.75, 1], trunk: 0.35 }, still: 0.06 };
const GC = typeof GT.groundConfig === 'function' ? GT.groundConfig(A) : { ...GT.GROUND, ...(A.composition.ground || {}) }, off0 = Object.keys(PINNED).filter((k) => !same(GC[k], PINNED[k]));
const part = typeof GT.groundConfig === 'function' ? GT.groundConfig({ composition: { ground: { halo: { slot: 0.31 } } } }).halo : null;
ok(`Z0 the merged GROUND holds the brief's pinned zone, halo, W, pool and still-water values; a partial halo override keeps the rest`,
  typeof GT.groundConfig === 'function' && !off0.length && same(part, { ...PINNED.halo, slot: 0.31 }),
  typeof GT.groundConfig !== 'function' ? 'no GT.groundConfig' : off0.map((k) => `${k} ${JSON.stringify(GC[k])}`).join('; '));
for (const [label, seed] of [['default', A.seeds.default], ['alt', A.seeds.alt]]) {
  console.log(`-- ${label} seed (${seed})`);
  const bp = GT.buildBlueprint(A, L, { seed: seed >>> 0 }), comp = GT.composeBlueprint(bp, L);
  const Z = GT.groundZones(bp, comp, comp.water), at = (x, z) => Z.at('main', x, z);
  // Z1 A at the game's CURRENT spots: SLOT_DISCS radii (fruit tree 0.55, bed 0.6, lantern 0.3, hive 0.35, bush 0.45, static tree
  const bad = []; let nA = 0, nP = 0;   // (nA: probes that are A -- a halo collapsed to nothing would leave only null probes)
  const ring = ([cx, cz, r], inset) => Array.from({ length: 8 }, (_, k) => [cx + Math.cos(k * Math.PI / 4) * (r - inset), cz + Math.sin(k * Math.PI / 4) * (r - inset)]);
  // GR5: a point whose zone is null (on a path, in another spot, in the wet band, off MAIN) grows nothing, so it is skipped, not failed
  const expectZone = (q, zones) => { nP++; if (q && q.zone === 'A') nA++; if (q && q.zone && !zones.includes(q.zone)) bad.push(`yard (${q.zone})`); };
  const spots = currentSpots(A, GT).filter((s) => !s.rect);   // (halos: the brief's literals, ground-measure.mjs; never the core's)
  for (const s of spots) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, d = s.r + s.halo - 0.1, q = at(s.x + Math.cos(a) * d, s.z + Math.sin(a) * d);
    nP++; if (q && q.zone === 'A') nA++;
    if (q && q.zone && !['A', 'E', 'D'].includes(q.zone)) bad.push(s.what); }
  for (const s of currentSpots(A, GT).filter((q) => q.rect)) { const [x0, z0, x1, z1] = s.rect, o = 0.5;   // the rectangle: every 0.25 u of its edge + 0.5 u
    for (let t = 0; t <= 1 + 1e-9; t += 0.25 / Math.max(x1 - x0, z1 - z0)) for (const [u, v] of [[x0 + (x1 - x0) * t, z0 - o], [x0 + (x1 - x0) * t, z1 + o], [x0 - o, z0 + (z1 - z0) * t], [x1 + o, z0 + (z1 - z0) * t]]) {
      const q = at(u, v); nP++; if (q && q.zone === 'A') nA++; if (q && q.zone && !['A', 'E', 'D'].includes(q.zone)) bad.push(`${s.what} (${f2(u)}, ${f2(v)}) ${q.zone}`); } }
  for (const y of [[-1.5, -1.7, 1.5], [-3.0, 1.6, 1.0], [-1.2, 1.5, 1.3]]) /* CHICKEN_YARDS, DOG_YARD: tidy inside */ for (const [u, v] of ring(y, 0.5)) expectZone(at(u, v), ['A', 'E', 'D']);
  // GR9: BUSHES[6] stands where the game moved it: 0.35 u past its new centre, straight away from its frozen spot, is inside its
  { const b6 = currentSpots(A, GT).find((s) => s.what === 'BUSHES:6'), was = A.game.BUSHES[6], L6 = Math.hypot(b6.x - was[0], b6.z - was[1]), ux = (b6.x - was[0]) / L6, uz = (b6.z - was[1]) / L6;
    const qIn = at(b6.x + ux * 0.35, b6.z + uz * 0.35), qOut = at(was[0] - ux * 0.35, was[1] - uz * 0.35);
    if (!(qIn.zone === null && qIn.dSpot < 0)) bad.push(`BUSHES:6 new spot +0.35 ${qIn.zone} (dSpot ${f2(qIn.dSpot)})`);
    if (!(qOut.dSpot > 0)) bad.push(`BUSHES:6 frozen spot -0.35 inside a footprint (dSpot ${f2(qOut.dSpot)})`); }
  if (bad.length) console.log(`        not A / E / D: ${[...new Set(bad)].slice(0, 12).join(', ')} (${bad.length} points)`);
  ok(`Z1 A round every spot where the game stands it now (+ halo), and inside the yards (${nA} of ${nP} probes A, >= 160); BUSHES[6] at its new spot`, !bad.length && nA >= 160);
  // Z2 E first: 0.3 u past each path edge (MAIN runs incl. the layout dirt paths with their widths, STONE_PATHS) is E, even inside a
  const SW = GC.stonePath, runs = [];
  for (const id of bp.order) for (const p of comp.pieces[id].paths) runs.push({ main: id === 'main', id: p.id, pts: p.pts, hw: (i) => (p.widths ? p.widths[i] : p.width) / 2 });
  for (const p of stonePathsNow(A.game)) runs.push({ main: true, id: 'stones', pts: GT.resamplePolyline(GT.catmullRomCentripetal(p, 6), 0.2), hw: () => SW / 2 });
  const edgeD = (x, z) => { let m = Infinity; for (const r of runs) for (let i = 0; i < r.pts.length - 1; i++) { const a = r.pts[i], b = r.pts[i + 1];
    if (Math.abs(a[0] - x) > 3 || Math.abs(a[1] - z) > 3) continue; const [d, t] = segD(x, z, a[0], a[1], b[0], b[1]); m = Math.min(m, d - (r.hw(i) + (r.hw(i + 1) - r.hw(i)) * t)); } return m; };
  let e3 = 0, e3Halo = 0, e9 = 0; const bad2 = [];
  for (const r of runs.filter((q) => q.main)) for (let i = 0; i < r.pts.length - 1; i++) {
    const a = r.pts[i], b = r.pts[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-6) continue;
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len, hw = (r.hw(i) + r.hw(i + 1)) / 2;
    for (const side of [1, -1]) {
      const p3 = [mx + nx * side * (hw + 0.3), mz + nz * side * (hw + 0.3)], q3 = at(...p3);
      if (q3.zone !== null && Math.abs(edgeD(...p3) - 0.3) < 0.02) { if (q3.zone === 'E') { e3++; if (q3.aHalo > 0) e3Halo++; } else bad2.push(`${r.id} +0.3 (${f2(p3[0])}, ${f2(p3[1])}) ${q3.zone}`); }
      const p9 = [mx + nx * side * (hw + 0.9), mz + nz * side * (hw + 0.9)], q9 = at(...p9);
      if (q9.zone !== null && edgeD(...p9) >= 0.75) { e9++; if (q9.zone === 'E') bad2.push(`${r.id} +0.9 (${f2(p9[0])}, ${f2(p9[1])}) E`); }
    }
  }
  // GR9: the end STONE_PATHS[1] no longer has while the composition is drawn is off every path (the frozen snapshot's last point)
  const cut = A.game.STONE_PATHS[1].at(-1), qCut = at(cut[0], cut[1]); if (!(qCut.dPath > 0)) bad2.push(`STONE_PATHS[1]'s dropped end (${cut.join(', ')}) dPath ${f2(qCut.dPath)}`);
  ok(`Z2 E first: 0.3 u past a path edge is E (${e3} points, ${e3Halo} of them inside a halo), 0.9 u past is not (${e9} points); STONE_PATHS[1] stops at its bend`, e3 >= 100 && e3Halo > 0 && e9 >= 100 && !bad2.length, bad2.slice(0, 6).join(', '));
  // Z3 D on the teardrop: every 8th outline point pushed 0.6 u outward is D (or E / null on a path or spot); pushed 0.2 u it is null (wet band)
  const lg = comp.water.main.pond.legacy, lgBank = lg.r + A.waterTs.pondBank, sl = comp.water.main.stream.line.map((p) => [p.x, p.z, p.width]);
  const lsp = comp.water.main.stream.legacy.points, lsd = GT.resamplePolyline(GT.catmullRomCentripetal(lsp.map((p) => [p.x, p.z]), 10), 0.1), cum = [0];
  for (let i = 1; i < lsd.length; i++) cum.push(cum[i - 1] + Math.hypot(lsd[i][0] - lsd[i - 1][0], lsd[i][1] - lsd[i - 1][1]));
  const ls = lsd.map(([x, z], i) => [x, z, lsp[0].width + (lsp.at(-1).width - lsp[0].width) * cum[i] / cum.at(-1)]);
  const joinedD = (x, z) => { let m = Math.hypot(x - lg.at[0], z - lg.at[1]) - lgBank;
    for (const R of [sl, ls]) for (let i = 0; i < R.length - 1; i++) { const [d, t] = segD(x, z, R[i][0], R[i][1], R[i + 1][0], R[i + 1][1]); m = Math.min(m, d - (R[i][2] + (R[i + 1][2] - R[i][2]) * t) / 2); }
    return m; };
  const po = comp.water.main.pond.outline, bad3 = []; let d6 = 0, n6 = 0, nJoined = 0;
  for (let i = 0; i < po.length; i += 8) {
    const a = po[(i - 1 + po.length) % po.length], b = po[(i + 1) % po.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len; if (GT.inLoop(po, po[i][0] + nx * 0.05, po[i][1] + nz * 0.05)) { nx = -nx; nz = -nz; }
    const q2 = at(po[i][0] + nx * 0.2, po[i][1] + nz * 0.2), q6 = at(po[i][0] + nx * 0.6, po[i][1] + nz * 0.6), j6 = joinedD(po[i][0] + nx * 0.6, po[i][1] + nz * 0.6); n6++;
    if (q2.zone !== null) bad3.push(`[${i}] +0.2 ${q2.zone}`);
    if (q6.zone === 'D') d6++;
    else if (q6.zone === null && !(q6.dPath < 0 || q6.dSpot < 0) && j6 < GT.GROUND.zone.wet) nJoined++;   // (GR6: in the joined legacy water's wet band)
    else if (q6.zone === null ? !(q6.dPath < 0 || q6.dSpot < 0) : q6.zone !== 'E') bad3.push(`[${i}] +0.6 ${q6.zone} (dWater ${f2(q6.dWater)}, joined ${f2(j6)})`);
  }
  const tear = Z.shore('main').filter((pl) => pl.what === 'teardrop');   // (Task 10 takes the teardrop's shore alone)
  if (tear.length !== 1 || !same(tear[0], [...po, po[0]])) bad3.push(`shore('main') has ${tear.length} polylines named teardrop, not the closed outline`);
  ok(`Z3 D on the teardrop's shore (${d6} of ${n6} points 0.6 u out are D, ${nJoined} in the joined legacy water's band, the rest E or null on a path or spot), its 0.2 u wet band null`,
    n6 > 0 && d6 > 0 && !bad3.length, bad3.slice(0, 8).join(', '));
  // Z4 pools: for every tree that is always there (STATIC_TREES on MAIN's top + composed MAIN trees; never FRUIT_TREES):
  const trees = [...currentSpots(A, GT).filter((s) => s.what.startsWith('STATIC_TREES')).map((s) => ({ x: s.x, z: s.z })),
    ...comp.pieces.main.trees.filter((t) => !t.layout && GT.pieceAt(bp, t.x, t.z) === 'main')], pools = Z.pools('main'), bad4 = [];
  for (const t of trees) {
    const p = pools.find((q) => Math.hypot(q.tx - t.x, q.tz - t.z) < 1e-6), w = `(${f2(t.x)}, ${f2(t.z)})`;
    if (!p) { bad4.push(`${w} no pool`); continue; }
    if (Math.hypot(p.x - (t.x + 0.25 * p.r * 0.993), p.z - (t.z - 0.25 * p.r * 0.122)) > 0.01) bad4.push(`${w} centre`);
    // GR7: the 0.25 R centre lies inside the 0.35 u trunk clearing for every tree but the hero, so the pool is read past it on the shade side
    const s4 = Math.max(0.25 * p.r, 0.4), u = at(t.x + 0.993 * s4, t.z - 0.122 * s4).U; if (!(u > 0.35)) bad4.push(`${w} R ${f2(p.r)}: U ${f2(u)} ${f2(s4)} u out on the shade side`);
    for (let k = 0; k < 8; k++) { const v = at(t.x + Math.cos(k * Math.PI / 4) * 0.3, t.z + Math.sin(k * Math.PI / 4) * 0.3).U; if (v > 0.35) bad4.push(`${w} U ${f2(v)} at 0.3 u, bearing ${k * 45}`); }
  }
  ok(`Z4 a shade pool for each of MAIN's ${trees.length} trees that are always there, away from the sun, its trunk clear`, trees.length >= 9 && pools.length === trees.length && !bad4.length, bad4.slice(0, 9).join('; '));
  // Z5 MAIN's rim is its own outline: every point 0.5 u inside bp.pieces.main.loopWorld (every 0.5 u along it) that is not E, D, A or C is B
  const lw = bp.pieces.main.loopWorld, bad5 = []; let nB = 0, n5 = 0, s = 0;
  for (let i = 0; i < lw.length; i++) {
    const a = lw[i], b = lw[(i + 1) % lw.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 1e-9) continue;
    for (; s < len; s += 0.5) {
      const x = a[0] + (b[0] - a[0]) * s / len, z = a[1] + (b[1] - a[1]) * s / len; let nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len;
      if (!GT.inLoop(lw, x + nx * 0.5, z + nz * 0.5)) { nx = -nx; nz = -nz; }
      const q = at(x + nx * 0.5, z + nz * 0.5); n5++;
      if (q.zone === 'B') nB++; else if (q.zone !== null && !['E', 'D', 'A', 'C'].includes(q.zone)) bad5.push(`(${f2(x + nx * 0.5)}, ${f2(z + nz * 0.5)}) ${q.zone} dRim ${f2(q.dRim)}`);
    }
    s -= len;
  }
  ok(`Z5 MAIN's rim is B wherever it is not E, D, A or C (${nB} of ${n5} points 0.5 u in)`, nB > 0 && !bad5.length, bad5.slice(0, 6).join(', '));
  // Z6 deterministic: a second groundZones on a fresh composeBlueprint agrees (zone, U) on zoneGrid(..., 0.1) of all 8 pieces; MAIN's
  const comp2 = GT.composeBlueprint(bp, L), Z2 = GT.groundZones(bp, comp2, comp2.water); let cells = 0, diff = 0;
  for (const id of bp.order) { const g1 = zoneGrid(Z, bp, id), g2 = zoneGrid(Z2, bp, id); cells += g1.cells.length;
    if (g1.cells.length !== g2.cells.length) { diff += Math.abs(g1.cells.length - g2.cells.length) || 1; continue; }
    g1.cells.forEach((c, k) => { const o = g2.cells[k]; if (c.x !== o.x || c.z !== o.z || c.zone !== o.zone || c.U !== o.U) diff++; }); }
  const areas = zoneAreas(zoneGrid(Z, bp, 'main'));
  console.log(`        MAIN zone areas (${label}, u^2): ${Object.entries(areas).map(([k, v]) => `${k} ${v}`).join(', ')} (${f2(Object.values(areas).reduce((s, v) => s + v, 0))} in all)`);
  ok(`Z6 deterministic: a fresh composition gives the same zones and U on all 8 pieces (${cells} cells, ${diff} differ); MAIN has every zone`, Z2 !== Z && cells > 0 && !diff && Object.values(areas).every((v) => v > 0));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
