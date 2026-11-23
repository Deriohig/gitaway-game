// look.test.mjs  --  the v4 LOOK pass criteria (make the joined blueprint island read like the concept).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import GT from '../lib/terrain.mjs';
import { clumpingIndex } from '../clumping.mjs';
import { stableSubset, firstDiff, FIXTURE } from './stable.mjs';
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const A = W3.archipelago, B = A.blueprint, CP = A.composition, TAG = GT.TAG, FB = L.terrain.colour.faceBands, DEG = Math.PI / 180;
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
const pct = (v) => (v * 100).toFixed(1) + '%';
const faceN = (P, o) => { const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2], vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1e-12; return [nx / l, ny / l, nz / l, 0.5 * l]; };
const angleOf = (ny) => Math.acos(Math.min(1, Math.abs(ny))) / DEG;          // face angle from horizontal (deg)
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function hsvOf(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 1e-9) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); if (h < 0) h += 360; } return [h, mx > 0 ? d / mx : 0, mx]; }
// albedo class of a face (mean of its 3 linear vertex colours -> sRGB): 'stone' = warm weathered stone (P4)
function albedoClass(C, o) { const r = toSrgb((C[o] + C[o + 3] + C[o + 6]) / 3), g = toSrgb((C[o + 1] + C[o + 4] + C[o + 7]) / 3), b = toSrgb((C[o + 2] + C[o + 5] + C[o + 8]) / 3);
  const [h, s, v] = hsvOf(r, g, b); if (h >= 12 && h < 58 && s < 0.34 && v >= 0.3) return 'stone'; if (h >= 15 && h < 50 && s >= 0.34) return 'soil'; if (h >= 58 && h < 170) return 'green'; return 'other'; }
const seeds = [A.seeds.default, A.seeds.alt];
const builds = seeds.map((s) => GT.buildBlueprint(A, L, { seed: s }));
const bp = builds[0], comps = builds.map((b) => GT.composeBlueprint(b, L)), comp = comps[0];
// L0. stability: ids, docked positions, MAIN theta ranges, seams (+ heights), MAIN arc + layout.ts flat zones,
{
  const fresh = stableSubset(JSON.parse(JSON.stringify(GT.exportBlueprint(bp, comp)))), frozen = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const d = firstDiff(frozen, fresh);
  ok('L0 stable export subset == v3 freeze (ids, docked positions, theta ranges, seams, MAIN zones, outlines, shape)', !d, d || `${Object.keys(fresh.pieces).length} pieces identical`);
}
// L1. HIGHLAND: a flat-topped plateau with distinct ledges and tall near-vertical warm-stone risers
const hl = bp.pieces.highland;
function slopeClasses(pc) {
  const P = pc.positions; let tot = 0; const cls = { flat: 0, gentle: 0, ramp: 0, steep: 0, cliff: 0 };
  for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue; const n = faceN(P, t * 9), a = angleOf(n[1]), w = n[3]; tot += w;
    if (a < 10) cls.flat += w; else if (a < 15) cls.gentle += w; else if (a <= 50) cls.ramp += w; else if (a <= 55) cls.steep += w; else cls.cliff += w; }
  for (const k in cls) cls[k] /= tot; return cls;
}
function ledgeLevels(pc) {   // flat-face area by height (0.1 u bins) -> distinct levels holding >= 4% of the flat area each
  const P = pc.positions, bins = new Map(); let tot = 0;
  for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue; const o = t * 9, n = faceN(P, o); if (angleOf(n[1]) >= 10) continue;
    const y = (P[o + 1] + P[o + 4] + P[o + 7]) / 3 + pc.pivot[1], k = Math.round(y * 10); bins.set(k, (bins.get(k) || 0) + n[3]); tot += n[3]; }
  const ks = [...bins.keys()].sort((a, b) => a - b), groups = [];
  for (const k of ks) { const g = groups[groups.length - 1]; if (g && k - g.k1 <= 3) { g.k1 = k; g.a += bins.get(k); if (bins.get(k) > g.peakA) { g.peakA = bins.get(k); g.peak = k; } } else groups.push({ k0: k, k1: k, a: bins.get(k), peak: k, peakA: bins.get(k) }); }
  return groups.filter((g) => g.a / tot >= 0.04).map((g) => ({ y: g.peak / 10, share: g.a / tot, span: [g.k0 / 10, g.k1 / 10] }));
}
{
  const sc = builds.map((b) => slopeClasses(b.pieces.highland));
  ok('L1a highland: mostly flat (<10 deg) or cliff (>55 deg); smooth 15-50 deg ramp <= 8% (both seeds)', sc.every((c) => c.ramp <= 0.08 && c.flat + c.cliff >= 0.85),
    sc.map((c, i) => `seed ${seeds[i]}: flat ${pct(c.flat)} gentle ${pct(c.gentle)} RAMP ${pct(c.ramp)} steep ${pct(c.steep)} cliff ${pct(c.cliff)}`).join(' | '));
  const lv = builds.map((b) => ledgeLevels(b.pieces.highland));
  const good = lv.map((l) => { if (l.length < 3) return false; for (let i = 1; i < l.length; i++) if (l[i].y - l[i - 1].y < 1.2) return false; return true; });
  ok('L1b highland: base + 2-3 raised ledges, each riser >= 1.2 u tall (flat-area levels, both seeds)', good.every(Boolean),
    lv.map((l, i) => `seed ${seeds[i]}: ` + l.map((q) => `y${q.y.toFixed(2)}(${pct(q.share)})`).join(' ')).join(' | '));
  // the top: every flat face within the top level's span stays within +/-0.3 u of it (cairn knoll / tarn excluded by the flat test)
  const top = lv[0][lv[0].length - 1]; let worst = 0;
  if (top) { const P = hl.positions; for (let t = 0; t < hl.faceCount; t++) { if (hl.tags[t] !== TAG.top) continue; const o = t * 9, n = faceN(P, o); if (angleOf(n[1]) >= 10) continue;
    const y = (P[o + 1] + P[o + 4] + P[o + 7]) / 3 + hl.pivot[1]; if (Math.abs(y - top.y) < 0.6) worst = Math.max(worst, Math.abs(y - top.y)); } }
  ok('L1c highland: flat top (+/-0.3 u) at the docked plateau level', top && worst <= 0.3 && Math.abs(top.y - hl.pivot[1]) <= 0.15, top ? `top level y=${top.y} (pivot y=${hl.pivot[1].toFixed(2)}), max dev of near-top flat faces ${worst.toFixed(3)} u` : 'no top level');
  // risers are warm stone (P4): cliff-grade faces coloured stone
  const P = hl.positions, Cc = hl.colors; let cliffA = 0, stoneA = 0;
  for (let t = 0; t < hl.faceCount; t++) { if (hl.tags[t] !== TAG.top) continue; const o = t * 9, n = faceN(P, o); if (angleOf(n[1]) <= 55) continue; cliffA += n[3]; if (albedoClass(Cc, o) === 'stone') stoneA += n[3]; }
  ok('L1d highland: cliff faces (>55 deg) are warm stone (>= 90% of their area)', cliffA > 0 && stoneA / cliffA >= 0.9, `cliff area ${cliffA.toFixed(1)} u2, stone ${pct(cliffA ? stoneA / cliffA : 0)}`);
  // projected rock share from the highland camera (no occlusion): sum(area * max(0, n.v)) over stone vs all visible faces
  const cam = A.cameras.highland, e = cam.el * DEG, az = cam.az * DEG, v = [Math.cos(e) * Math.sin(az), Math.sin(e), Math.cos(e) * Math.cos(az)];
  let all = 0, rock = 0;
  for (const id of ['highland']) { const pc = bp.pieces[id], P2 = pc.positions, C2 = pc.colors;
    for (let t = 0; t < pc.faceCount; t++) { const tg = pc.tags[t]; if (tg !== TAG.top && tg !== TAG.coast) continue; const o = t * 9, n = faceN(P2, o), w = n[3] * Math.max(0, n[0] * v[0] + n[1] * v[1] + n[2] * v[2]);
      all += w; if (albedoClass(C2, o) === 'stone') rock += w; } }
  ok('L1e highland: projected warm-stone share from the highland camera >= 12%', rock / all >= 0.12, `projected stone share ${pct(rock / all)}`);
}
// L2. OUTER CLIFF BAND: every petal's outer coast = a warm-stone wall 1.5-2.6 u tall; MAIN's rim wall; rock underside
{
  const rows = [];
  let lo = 1e9, hi = -1e9;
  for (const b of builds) for (const id of b.order) { if (id === 'main') continue; const pc = b.pieces[id], idx = new Map(); pc.keys.forEach((k, i) => idx.set(k, i));
    const P = pc.localP, hs = [];
    for (const [k, i] of idx) { const m = /^t:([a-z]+):(\d+):(\d+)$/.exec(k); if (!m || +m[2] !== b.K) continue; const j = idx.get('tu:' + m[1] + ':' + m[3]); if (j === undefined) continue; hs.push(P[i * 3 + 1] - P[j * 3 + 1]); }
    const mn = Math.min(...hs), mx = Math.max(...hs), mean = hs.reduce((s, v) => s + v, 0) / hs.length; lo = Math.min(lo, mn); hi = Math.max(hi, mx);
    if (b === bp) rows.push(`${id} ${mn.toFixed(2)}-${mx.toFixed(2)} (mean ${mean.toFixed(2)})`); }
  ok('L2a outer coast wall 1.5-2.6 u tall on every petal (both seeds)', lo >= 1.5 && hi <= 2.6, `wall height range ${lo.toFixed(2)}..${hi.toFixed(2)} u; ` + rows.join(', '));
  // MAIN's rim (when nothing is docked): a near-vertical wall >= 1.5 u under the rim
  const M = bp.pieces.main, P = M.positions; let minAng = 90, deep = 0;
  for (let t = 0; t < M.faceCount; t++) { if (M.tags[t] !== TAG.cone) continue; const o = t * 9; if (P[o + 1] < -1.5 || P[o + 4] < -1.5 || P[o + 7] < -1.5) continue; minAng = Math.min(minAng, angleOf(faceN(P, o)[1])); }
  M.keys.forEach((k, i) => { if (!/^c:\d+:\d+$/.test(k)) return; const x = M.localP[i * 3], y = M.localP[i * 3 + 1], z = M.localP[i * 3 + 2]; if (Math.hypot(x, z) >= 0.97 * M.outline(Math.atan2(z, x))) deep = Math.min(deep, y); });
  ok('L2b MAIN rim: near-vertical wall (>= 70 deg) reaching >= 1.5 u below the rim', minAng >= 70 && deep <= -1.5, `min cone face angle above y=-1.5: ${minAng.toFixed(1)} deg; wall (r >= 0.97 R) reaches y=${deep.toFixed(2)}`);
  // curtain + underside albedo = warm stone; underside steep enough to read as a rock cone, not a shallow bowl
  let cA = 0, cS = 0, uA = 0, uS = 0, uAng = 0;
  for (const id of bp.order) { if (id === 'main') continue; const pc = bp.pieces[id], P2 = pc.positions, C2 = pc.colors;
    for (let t = 0; t < pc.faceCount; t++) { const o = t * 9, tg = pc.tags[t]; if (tg !== TAG.coast && tg !== TAG.under) continue; const n = faceN(P2, o), st = albedoClass(C2, o) === 'stone';
      if (tg === TAG.coast) { cA += n[3]; if (st) cS += n[3]; } else { uA += n[3]; if (st) uS += n[3]; uAng += n[3] * angleOf(n[1]); } } }
  ok('L2c coast walls + underside are warm stone (>= 85% / >= 90% of their area)', cS / cA >= 0.85 && uS / uA >= 0.9, `coast wall stone ${pct(cS / cA)}, underside stone ${pct(uS / uA)}`);
  ok('L2d underside reads as a rock cone, not a bowl: area-weighted mean face angle >= 50 deg', uAng / uA >= 50, `underside mean face angle ${(uAng / uA).toFixed(1)} deg`);
}
// L3. WOODLAND: dense forest on the petals (MAIN interior + the near-side meadow stay open), clumped
const v3MainTrees = 12;   // layout.ts STATIC_TREES (9) + the v3 far-side MAIN clumps (3): MAIN must not gain trees
{
  const per = Object.fromEntries(bp.order.map((id) => [id, comp.pieces[id].trees.length]));
  const need = { grove: 95, highland: 130, wetland: 80, cottage: 50, orchard: 40, islet: 20, meadow: 15 };
  const short = Object.entries(need).filter(([id, n]) => per[id] < n).map(([id, n]) => `${id} ${per[id]}<${n}`);
  const petals = bp.order.filter((id) => id !== 'main').reduce((s, id) => s + per[id], 0);
  ok('L3a dense woodland: >= 650 petal trees, per-piece minimums; MAIN gains none', petals >= 650 && !short.length && per.main <= v3MainTrees,
    `petal trees ${petals}; ` + bp.order.map((id) => `${id} ${per[id]}`).join(', ') + (short.length ? ' | SHORT ' + short.join(', ') : ''));
  const cl = comps.map((c) => { let n = 0, k = 0; for (const [id, r] of Object.entries(CP.clumping)) { const q = clumpingIndex(c.pieces[id].trees, r); n += q.trees; k += q.clumped; } return n ? k / n : 0; });
  ok('L3b clumping >= 70% overall (STYLE C4 per-piece rules, both seeds)', cl.every((v) => v >= 0.7), cl.map((v, i) => `seed ${seeds[i]} ${pct(v)}`).join(', '));
  // tree lines: outer rim (outside the meadow's sight line) and the lakeshore
  const all = bp.order.flatMap((id) => comp.pieces[id].trees);
  const near = (x, z, r) => all.some((t) => Math.abs(t.x - x) < r && Math.abs(t.z - z) < r && Math.hypot(t.x - x, t.z - z) < r);
  let rimN = 0, rimHit = 0;
  for (let i = 0; i < 360; i++) { const th = i * DEG, thd = i; if (thd > 0 && thd < 95) continue;   // the meadow + near rim stay open (camera side)
    const r = bp.Rc(th) - 1.6, x = Math.cos(th) * r, z = Math.sin(th) * r; rimN++; if (near(x, z, 2.2)) rimHit++; }
  const lake = comp.water.wetland.lake.outline; let lkHit = 0; for (const [x, z] of lake) if (near(x, z, 2.4)) lkHit++;
  ok('L3c tree lines: >= 55% of the outer rim (95-360 deg) and >= 50% of the lakeshore have a tree within ~2.3 u', rimHit / rimN >= 0.55 && lkHit / lake.length >= 0.5,
    `rim ${pct(rimHit / rimN)}, lakeshore ${pct(lkHit / lake.length)}`);
  const grove = comp.pieces.grove.trees, gpc = bp.pieces.grove, core = B.zones.grove.find((z) => z.kind === 'core');
  let area = 0; { const lp = gpc.loopWorld; for (let i = 0, j = lp.length - 1; i < lp.length; j = i++) area += (lp[j][0] + lp[i][0]) * (lp[j][1] - lp[i][1]); area = Math.abs(area) / 2; }
  const clear = Math.PI * (core.r + 1.2) ** 2, dens = grove.filter((t) => Math.hypot(t.x - core.at[0], t.z - core.at[1]) > core.r + 1.2).length / (area - clear);
  const inClear = grove.filter((t) => Math.hypot(t.x - core.at[0], t.z - core.at[1]) < core.r).length;
  ok('L3d grove = a forest around an open clearing (>= 0.4 trees/u2 outside it, none inside the core)', dens >= 0.4 && inClear === 0, `grove density ${dens.toFixed(3)} trees/u2 over ${(area - clear).toFixed(0)} u2; trees in the clearing core ${inClear}`);
}
// L4. WETLAND: a real lake (rock-lined, a treed islet), a visible river, a waterfall off the outer cliff, game water colours
const polyArea = (p) => { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(s) / 2; };
{
  const W = comp.water.wetland, lake = W.lake.outline, area = polyArea(lake);
  ok('L4a lake area >= 45 u2 (v3: ~27)', area >= 45, `lake area ${area.toFixed(1)} u2, ${lake.length} outline pts`);
  const inside = (d) => { for (let i = 0; i < 16; i++) { const t = i / 16 * Math.PI * 2; if (!GT.inLoop(lake, d.at[0] + Math.cos(t) * d.r, d.at[1] + Math.sin(t) * d.r)) return false; } return GT.inLoop(lake, d.at[0], d.at[1]); };
  const bw = B.water.lake.boardwalkLoop, bell = B.water.lake.sunkenBell;
  ok('L4b boardwalk-loop + sunken-bell spots lie inside the lake', inside(bw) && inside(bell), `boardwalk ${JSON.stringify(bw)} ${inside(bw)}; bell ${JSON.stringify(bell)} ${inside(bell)}`);
  const lkF = B.features.find((f) => f.id === B.water.lake.feature), trees = comp.pieces.wetland.trees;
  const isl = trees.filter((t) => { const dx = t.x - lkF.at[0], dz = t.z - lkF.at[1], c = Math.cos(lkF.rot * DEG), s = Math.sin(lkF.rot * DEG), ax = c * dx + s * dz, az = -s * dx + c * dz;
    return Math.hypot(ax / lkF.r, az / (lkF.rz || lkF.r)) < 0.92 && bp.H(t.x, t.z) > W.lake.level + 0.1; });
  ok('L4c a small treed islet in the lake (>= 3 trees on land inside the basin)', isl.length >= 3, `islet trees ${isl.length}`);
  const rocks = comp.pieces.wetland.rocks; let shore = 0;
  for (const r of rocks) { let d = 1e9; for (const [x, z] of lake) d = Math.min(d, Math.hypot(x - r.x, z - r.z)); if (d < 1.1) shore++; }
  ok('L4d rock-lined shore: >= 14 boulders within 1.1 u of the waterline', shore >= 14, `shore rocks ${shore} of ${rocks.length} wetland rocks`);
  const rv = W.river.points, w0 = rv[0].width, w1 = rv[rv.length - 1].width;
  ok('L4e river widens to >= 0.9 u (>= 1.6x its start) at the lake', w1 >= 0.9 && w1 >= 1.6 * w0, `river width ${w0} -> ${w1}`);
  // waterfall visible from island_wide and wetland_edge: lip faces the camera + clear line of sight to the fall
  const fall = W.waterfall.points, top = fall[0], yMid = top[1] - 2.2; let mid = fall[fall.length - 1];
  for (let i = 1; i < fall.length; i++) if (fall[i][1] <= yMid) { const a = fall[i - 1], b = fall[i], t = (a[1] - yMid) / (a[1] - b[1]); mid = [a[0] + (b[0] - a[0]) * t, yMid, a[2] + (b[2] - a[2]) * t]; break; }
  const th = Math.atan2(top[2], top[0]), nrm = [Math.cos(th), 0, Math.sin(th)];
  const tris = []; for (const id of bp.order) { const pc = bp.pieces[id], P = pc.positions, pv = pc.pivot; for (let t = 0; t < pc.faceCount; t++) { const tg = pc.tags[t]; if (tg !== TAG.top && tg !== TAG.coast && tg !== TAG.cone) continue; const o = t * 9; tris.push([P[o] + pv[0], P[o + 1] + pv[1], P[o + 2] + pv[2], P[o + 3] + pv[0], P[o + 4] + pv[1], P[o + 5] + pv[2], P[o + 6] + pv[0], P[o + 7] + pv[1], P[o + 8] + pv[2]]); } }
  const rayHit = (o, p) => { const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]], Ld = Math.hypot(...d); d[0] /= Ld; d[1] /= Ld; d[2] /= Ld;
    for (const T of tris) { const e1 = [T[3] - T[0], T[4] - T[1], T[5] - T[2]], e2 = [T[6] - T[0], T[7] - T[1], T[8] - T[2]], q = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * q[0] + e1[1] * q[1] + e1[2] * q[2];
      if (Math.abs(det) < 1e-12) continue; const inv = 1 / det, s = [o[0] - T[0], o[1] - T[1], o[2] - T[2]], u = (s[0] * q[0] + s[1] * q[1] + s[2] * q[2]) * inv; if (u < 0 || u > 1) continue;
      const r2 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * r2[0] + d[1] * r2[1] + d[2] * r2[2]) * inv; if (v < 0 || u + v > 1) continue;
      const tt = (e2[0] * r2[0] + e2[1] * r2[1] + e2[2] * r2[2]) * inv; if (tt > 0.05 && tt < Ld - 0.3) return true; } return false; };
  const vis = ['island_wide', 'wetland_edge'].map((n) => { const c = A.cameras[n], e = c.el * DEG, a = c.az * DEG, cam = [c.tgt[0] + Math.cos(e) * Math.sin(a) * c.dist, c.tgt[1] + Math.sin(e) * c.dist, c.tgt[2] + Math.cos(e) * Math.cos(a) * c.dist];
    const tc = [cam[0] - top[0], cam[1] - top[1], cam[2] - top[2]], l = Math.hypot(...tc), facing = (tc[0] * nrm[0] + tc[2] * nrm[2]) / l; return { n, facing, blocked: rayHit(cam, mid) }; });
  ok('L4f waterfall faces + is in clear view of island_wide and wetland_edge', vis.every((q) => q.facing >= 0.25 && !q.blocked), vis.map((q) => `${q.n}: facing ${q.facing.toFixed(2)} blocked=${q.blocked}`).join('; '));
  // placeholder water = the game's water colours (palette.ts on feat/idle-loop). LOOK-BRIEF Phase 0 moved the colours from
  const LPW = (() => { try { return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config/lookPresets.json'), 'utf8')).presets['Game (current)'].water; } catch { return null; } })();
  const want = { water: '#91B7C8', waterDeep: '#6E9AB0', foam: '#E8F1F0' }, got = LPW ? { water: LPW.shallow, waterDeep: LPW.deep, foam: LPW.foam } : ((A.look && A.look.water) || {});
  let gitOk = 'git n/a';
  try { const src = execFileSync('git', ['show', 'feat/idle-loop:src/world/palette.ts'], { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    gitOk = Object.entries(want).every(([k, v]) => new RegExp(`\\b${k}: '${v}'`).test(src)) ? 'matches palette.ts' : 'palette.ts DIFFERS'; } catch { /* no git */ }
  ok("L4g placeholder water uses the game's water colours (water / waterDeep / foam)", Object.entries(want).every(([k, v]) => (got[k] || '').toUpperCase() === v) && gitOk !== 'palette.ts DIFFERS', `${LPW ? 'lookPresets' : 'config'} ${JSON.stringify(got)}; ${gitOk}`);
}
// L5. PATHS: connected network from the porch to every piece core, no cliff crossings except via stairs
{
  const G = A.game, nets = [];
  const dense = (pts) => GT.resamplePolyline(GT.catmullRomCentripetal(pts, 5), 0.25);
  for (const p of G.DIRT_PATHS) nets.push({ id: 'dirt', w: 0.5, pts: dense(p) });
  for (const p of G.STONE_PATHS) nets.push({ id: 'stone', w: 0.4, pts: dense(p) });
  for (const p of B.paths) nets.push({ id: p.id, w: p.width, pts: dense(p.pts) });
  // union-find over paths: two paths join where any samples come within 0.45 u
  const par = nets.map((_, i) => i), find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  for (let i = 0; i < nets.length; i++) for (let j = i + 1; j < nets.length; j++) { let join = false;
    for (const a of nets[i].pts) { for (const b of nets[j].pts) if (Math.abs(a[0] - b[0]) < 0.45 && Math.abs(a[1] - b[1]) < 0.45 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.45) { join = true; break; } if (join) break; }
    if (join) par[find(i)] = find(j); }
  // the FARM HUB = the porch's own layout.ts paths (dirt + stepping stones) and the fenced garden they lead round:
  const GA = G.GARDEN, gx0 = GA.x0 - 0.28 - 0.8, gx1 = GA.x0 + GA.cell * 4 + 0.28 + 0.8, gz0 = GA.z0 - 0.28 - 0.8, gz1 = GA.z0 + GA.cell * 4 + 0.28 + 0.8;
  nets.forEach((n, i) => { if (n.id === 'dirt' || n.id === 'stone' || n.pts.some(([x, z]) => x > gx0 && x < gx1 && z > gz0 && z < gz1)) par[find(i)] = find(0); });
  const porch = nets.findIndex((n) => n.pts.some((p) => Math.hypot(p[0] - G.PORCH[0], p[1] - G.PORCH[1]) < 0.6)), root = porch >= 0 ? find(porch) : -1;
  const miss = [];
  for (const [pid, list] of Object.entries(B.zones)) { const core = list.find((z) => z.kind === 'core');
    const reach = nets.some((n, i) => find(i) === root && n.pts.some((p) => Math.hypot(p[0] - core.at[0], p[1] - core.at[1]) <= core.r + 0.8)); if (!reach) miss.push(pid); }
  ok('L5a one connected path network: porch -> every piece core (within r + 0.8 u)', root >= 0 && !miss.length, `${nets.length} paths; unreached cores: ${miss.join(', ') || 'none'}`);
  // grade + rock: outside stairs <= 0.6 rise/run and never on a rock face; inside stairs <= 1.0
  const stairs = B.stairs || [];
  const stairAt = (x, z) => stairs.findIndex((s) => { const dx = s.to[0] - s.from[0], dz = s.to[1] - s.from[1], L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((x - s.from[0]) * dx + (z - s.from[1]) * dz) / L2));
    return Math.hypot(x - s.from[0] - dx * t, z - s.from[1] - dz * t) < s.width / 2 + 0.3; });
  const slope = (x, z) => { const e = 0.2; return Math.hypot(bp.H(x + e, z) - bp.H(x - e, z), bp.H(x, z + e) - bp.H(x, z - e)) / (2 * e); };
  let worst = 0, worstAt = '', rockN = 0, stairMax = 0; const usedStairs = new Set();
  for (const n of B.paths) { const pts = dense(n.pts);
    for (let i = 1; i < pts.length; i++) { const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], ds = Math.hypot(x1 - x0, z1 - z0) || 1e-9, g = Math.abs(bp.H(x1, z1) - bp.H(x0, z0)) / ds, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const si = stairAt(mx, mz); if (si >= 0) { stairMax = Math.max(stairMax, g); usedStairs.add(si); continue; }
      if (g > worst) { worst = g; worstAt = `${n.id}@(${mx.toFixed(1)},${mz.toFixed(1)})`; }
      if (1 - 1 / Math.sqrt(1 + slope(mx, mz) ** 2) >= FB.slopeRock0) rockN++; } }
  ok('L5b paths never climb a cliff except via stairs (grade <= 0.6 off-stair, <= 1.0 on stairs, no rock faces)', worst <= 0.6 && rockN === 0 && stairMax <= 1.0,
    `max off-stair grade ${worst.toFixed(2)} (${worstAt}); samples on rock faces ${rockN}; max stair grade ${stairMax.toFixed(2)}`);
  ok('L5c the highland path climbs to the plateau top over >= 2 stairs (every stair used)', stairs.length >= 2 && usedStairs.size === stairs.length &&
    B.paths.some((p) => dense(p.pts).some(([x, z]) => bp.H(x, z) >= hl.pivot[1] - 0.1)), `stairs ${stairs.length}, used ${usedStairs.size}`);
  const avoid = []; for (const [pid, list] of Object.entries(B.zones)) for (const z of list) if (z.kind === 'building' || z.kind === 'restoration') avoid.push({ pid, ...z });
  const lake = comp.water.wetland.lake.outline, tarn = comp.water.highland.tarn.outline; let hits = [];
  for (const n of B.paths) for (const [x, z] of dense(n.pts)) { for (const z0 of avoid) if (Math.hypot(x - z0.at[0], z - z0.at[1]) < z0.r - 0.05) hits.push(`${n.id}x${z0.id}`); if (GT.inLoop(lake, x, z) || GT.inLoop(tarn, x, z)) hits.push(n.id + 'xwater'); }
  hits = [...new Set(hits)];
  ok('L5d paths stay off building/restoration pads and out of the lake/tarn', !hits.length, hits.join(', ') || 'clear');
  const len = B.paths.reduce((s, p) => { const d = dense(p.pts); let l = 0; for (let i = 1; i < d.length; i++) l += Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]); return s + l * p.width; }, 0);
  ok('L5e network area >= 110 u2 (length x width; the concept is path-rich)', len >= 110, `connector path area ${len.toFixed(0)} u2 over ${B.paths.length} paths`);
}
// L6. ROCKS: boulders at cliff feet, on the islet, clustered (STYLE C5)
{
  const slope = (x, z) => { const e = 0.25; return Math.hypot(bp.H(x + e, z) - bp.H(x - e, z), bp.H(x, z + e) - bp.H(x, z - e)) / (2 * e); };
  const cliffFoot = (x, z) => { for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; for (const d of [0.6, 1.0, 1.5]) if (slope(x + Math.cos(a) * d, z + Math.sin(a) * d) > 1.6) return true; } return false; };
  const hr = comp.pieces.highland.rocks, foot = hr.filter((r) => cliffFoot(r.x, r.z)).length, isl = comp.pieces.islet.rocks.length;
  const all = bp.order.filter((id) => id !== 'main').flatMap((id) => comp.pieces[id].rocks);
  const clustered = all.filter((r) => all.some((q) => q !== r && Math.hypot(q.x - r.x, q.z - r.z) < 1.3)).length / all.length;
  ok('L6 boulders: >= 24 at highland cliff feet, >= 24 on the islet, >= 70% clustered', foot >= 24 && isl >= 24 && clustered >= 0.7, `highland cliff-foot ${foot}/${hr.length}, islet ${isl}, clustered ${pct(clustered)} of ${all.length}`);
}
// L7. FRAMING: island_wide + docking fill >= 60% of the frame width; gameplay presets = the game clamp, unchanged
{
  const proj = (c) => { const e = c.el * DEG, a = c.az * DEG, cam = [c.tgt[0] + Math.cos(e) * Math.sin(a) * c.dist, c.tgt[1] + Math.sin(e) * c.dist, c.tgt[2] + Math.cos(e) * Math.cos(a) * c.dist];
    const f = [c.tgt[0] - cam[0], c.tgt[1] - cam[1], c.tgt[2] - cam[2]], fl = Math.hypot(...f); f[0] /= fl; f[1] /= fl; f[2] /= fl;
    const r = [f[2] * 0 - f[1] * 0, 0, 0]; r[0] = -f[2]; r[2] = f[0]; const rl = Math.hypot(r[0], r[2]); r[0] /= rl; r[2] /= rl;   // right = f x up
    const t = Math.tan(A.render.camera.fov / 2 * DEG), asp = c.w / c.h; let mn = 1e9, mx = -1e9;
    for (let i = 0; i < 360; i++) { const th = i * DEG, R = bp.Rc(th), x = Math.cos(th) * R, z = Math.sin(th) * R, y = bp.H(x * 0.995, z * 0.995);
      const p = [x - cam[0], y - cam[1], z - cam[2]], dz = p[0] * f[0] + p[1] * f[1] + p[2] * f[2], dx = p[0] * r[0] + p[2] * r[2], nx = dx / dz / (t * asp); mn = Math.min(mn, nx); mx = Math.max(mx, nx); }
    return (Math.min(1, mx) - Math.max(-1, mn)) / 2; };
  const fr = ['island_wide', 'docking'].map((n) => [n, proj(A.cameras[n])]);
  ok('L7a island_wide + docking: the island fills >= 60% of the frame width', fr.every(([, w]) => w >= 0.6), fr.map(([n, w]) => `${n} ${pct(w)}`).join(', '));
  const v3 = { default_mobile: [45, 28.88, 'frame', [0, -0.6, 0], 720, 1560], default_desktop: [45, 28.88, 'frame', [0, -0.6, 0], 1600, 900], farm_to_meadow: [30, 21, 27, [0, -0.6, 0], 1600, 900],
    max_zoom_all: [45, 28.88, 140, [0, -0.6, 0], 1600, 900], max_zoom_portrait: [45, 28.88, 140, [0, -0.6, 0], 720, 1560] };
  const bad = Object.entries(v3).filter(([n, v]) => { const c = A.cameras[n]; return !c || c.mode !== 'gameplay' || JSON.stringify([c.az, c.el, c.dist, c.tgt, c.w, c.h]) !== JSON.stringify(v); });
  const GP = A.render.gameplay, clampOk = GP.minDistance === 14 && GP.maxDistance === 140 && GP.minPolar === 0.62 && GP.maxPolar === 1.22 && GP.azimuthCenter === 0.7853981634 && GP.azimuthRange === 0.85 && A.render.camera.fov === 30;
  ok('L7b gameplay presets + clamp unchanged (fov 30, 14-140, polar 0.62-1.22, az pi/4 +/- 0.85)', !bad.length && clampOk, `changed: ${bad.map(([n]) => n).join(',') || 'none'}; clamp ${clampOk ? 'unchanged' : 'CHANGED'}`);
}
function report() {
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
  console.log('\n  LOOK PASS CRITERIA (v4)');
  console.log('  ' + '-'.repeat(96));
  for (const r of results) { if (!r.pass) fails++; console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + pad(r.name, 92) + '\n        ' + r.detail); }
  console.log('  ' + '-'.repeat(96)); console.log(`  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
}
report();
process.exit(results.every((r) => r.pass) ? 0 : 1);
