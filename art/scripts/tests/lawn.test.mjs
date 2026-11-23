// lawn.test.mjs -- the living-ground lawn (art/specs/2026-10-22-flowers-living-ground-design.md): what paintBlueprint paints under
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';
import { hsv as hsvOf } from '../lib/palette-bands.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), ART = path.resolve(here, '../..');
const GT = (await import(pathToFileURL(process.env.TERRAIN ? path.resolve(process.env.TERRAIN) : path.join(here, '..', 'lib', 'terrain.mjs')).href)).default;
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const P = JSON.parse(fs.readFileSync(path.join(ART, 'config', 'lookPresets.json'), 'utf8')).presets['Golden afternoon'];
const A = W3.archipelago, TAG = GT.TAG, toS = GT.linearToSrgb;
const hue = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 1e-9) return 0; let h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4); return h < 0 ? h + 360 : h; };
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const bp = GT.buildBlueprint(A, L, { seed: A.seeds.default >>> 0 }), comp = GT.composeBlueprint(bp, L), painted = GT.paintBlueprint(bp, comp, P, L);
// grass vertices: top faces, slope < 0.3, green in the base albedo; colour = mean over their faces (sRGB)
const V = [];
for (const id of bp.order) {
  const pc = bp.pieces[id], Pp = pc.positions, C0 = pc.colors, C = painted[id], pv = pc.pivot, acc = new Map();
  for (let t = 0; t < pc.faceCount; t++) {
    if (pc.tags[t] !== TAG.top) continue; const o = t * 9;
    const ax = Pp[o + 3] - Pp[o], ay = Pp[o + 4] - Pp[o + 1], az = Pp[o + 5] - Pp[o + 2], bx = Pp[o + 6] - Pp[o], by = Pp[o + 7] - Pp[o + 1], bz = Pp[o + 8] - Pp[o + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; if (1 - Math.abs(ny) / (Math.hypot(nx, ny, nz) || 1) >= 0.3) continue;
    const c0 = [0, 1, 2].map((k) => toS((C0[o + k] + C0[o + 3 + k] + C0[o + 6 + k]) / 3)), h0 = hue(...c0); if (!(h0 >= 58 && h0 < 170)) continue;
    for (let q = 0; q < 3; q++) { const vi = pc.faces[t * 3 + q], a = acc.get(vi) || acc.set(vi, { x: Pp[o + q * 3] + pv[0], z: Pp[o + q * 3 + 2] + pv[2], c: [0, 0, 0], n: 0 }).get(vi);
      for (let k = 0; k < 3; k++) a.c[k] += C[o + q * 3 + k]; a.n++; }
  }
  for (const [vi, a] of acc) { const c = a.c.map((v) => toS(v / a.n)); V.push({ id, vi, x: a.x, z: a.z, c, Y: luma(c), h: hue(...c) }); }
}
// OPEN lawn: >= 3 u from every tree and >= 4 u from water (the forest-edge shade and the lush grass by water already varied the
const TR = bp.order.flatMap((id) => comp.pieces[id].trees.map((t) => [t.x, t.z])), W = comp.water, wsegs = [], wcirc = W.main.pond.r == null ? [] : [[W.main.pond.at[0], W.main.pond.at[1], W.main.pond.r]];
for (const pts of [W.main.stream.line || W.main.stream.points, W.wetland.river.points, W.wetland.outflow.points]) for (let i = 0; i < pts.length - 1; i++) wsegs.push([pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, (pts[i].width || 0.5) / 2]);
for (const poly of [...(W.main.pond.r == null ? [W.main.pond.outline] : []), W.wetland.lake.outline, W.highland.tarn.outline, W.highland.hotSpring.outline]) for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; wsegs.push([a[0], a[1], b[0], b[1], 0]); }
const segDist = (x, z, [ax, az, bx, bz, hw]) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * t, z - az - dz * t) - hw; };
const open = (p) => p.open ??= TR.every(([x, z]) => Math.abs(x - p.x) > 3 || Math.abs(z - p.z) > 3 || Math.hypot(x - p.x, z - p.z) >= 3)
  && wcirc.every(([x, z, r]) => Math.hypot(x - p.x, z - p.z) - r >= 4) && wsegs.every((s) => segDist(p.x, p.z, s) >= 4);
// L1: pairs ~4 u apart (a random vertex + the nearest vertex to a point 4 u away), per group
const G = new Map(), gc = 0.5; V.forEach((p, i) => { const k = Math.floor(p.x / gc) + ',' + Math.floor(p.z / gc); (G.get(k) || G.set(k, []).get(k)).push(i); });
const near = (x, z) => { let best = -1, bd = 0.35; const cx = Math.floor(x / gc), cz = Math.floor(z / gc); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of G.get((cx + a) + ',' + (cz + b)) || []) { const d = Math.hypot(V[i].x - x, V[i].z - z); if (d < bd) { bd = d; best = i; } } return best; };
const dAt = (sel, d) => { const idx = V.map((p, i) => (sel(p) ? i : -1)).filter((i) => i >= 0), rng = GT.mulberry32(41), out = [];
  for (let k = 0; k < 60000 && out.length < 6000; k++) { const i = idx[Math.floor(rng() * idx.length)], a = rng() * Math.PI * 2, j = near(V[i].x + Math.cos(a) * d, V[i].z + Math.sin(a) * d); if (j < 0 || !sel(V[j])) continue; out.push(Math.abs(V[i].Y - V[j].Y)); }
  return mean(out); };
const farmD = dAt((p) => p.id === 'main' && open(p), 2), wildD = dAt((p) => p.id !== 'main' && open(p), 2);
ok('L1 variety at the patch scale on the OPEN lawn: grass 2 u apart differs (mean |d luma|) >= 0.03 on the farm, >= 0.025 on the wild isles', farmD >= 0.03 && wildD >= 0.025, `farm ${farmD.toFixed(4)}, wild isles ${wildD.toFixed(4)} (the 15 u blend alone: ~0.022 / ~0.017)`);
// L2 / L4: under the cover field's patches (the scatter's own field)
const cov = (p) => GT.coverField ? GT.coverField(bp.noise, p.x, p.z, p.id !== 'main') : { clover: 0, tall: 0 };
const farm = V.filter((p) => p.id === 'main'), cl = farm.filter((p) => cov(p).clover > 0.7), rest = farm.filter((p) => cov(p).clover < 0.2);
const rCl = mean(cl.map((p) => p.Y)) / mean(rest.map((p) => p.Y));
ok('L2 the farm\'s clover patches stand on darker grass (<= 0.985 x the luma of the rest; untinted they are ~1.03, sunnier ground)', cl.length > 50 && rCl <= 0.985, `${cl.length} vertices under clover, luma ratio ${rCl.toFixed(3)}`);
// L3: the worn band itself, against the SAME lawn painted without it (the path edges were already lighter from the base's soil
const segs = []; for (const q of comp.pieces.main.paths) for (let i = 0; i < q.pts.length - 1; i++) segs.push([q.pts[i][0], q.pts[i][1], q.pts[i + 1][0], q.pts[i + 1][1], (q.widths ? Math.max(q.widths[i], q.widths[i + 1]) : q.width) / 2]);
const edgeD = (x, z) => { let d = 1e9; for (const s of segs) d = Math.min(d, segDist(x, z, s)); return d; };
let rIn = NaN, rOut = NaN, nIn = 0;
if (GT.LAWN) {
  const keep = GT.LAWN.wornMix; GT.LAWN.wornMix = 0; const bare = GT.paintBlueprint(bp, comp, P, L).main; GT.LAWN.wornMix = keep;
  const pc = bp.pieces.main, Pp = pc.positions, pv = pc.pivot, C = painted.main, sIn = [0, 0], sOut = [0, 0];
  for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue; const o = t * 9, d = edgeD(Pp[o] + pv[0], Pp[o + 2] + pv[2]);
    const y1 = luma([0, 1, 2].map((k) => toS(C[o + k]))), y0 = luma([0, 1, 2].map((k) => toS(bare[o + k])));
    if (d > 0 && d < 0.35) { sIn[0] += y1; sIn[1] += y0; nIn++; } else if (d > 0.9 && d < 1.4) { sOut[0] += y1; sOut[1] += y0; } }
  rIn = sIn[0] / sIn[1]; rOut = sOut[0] / sOut[1];
}
ok('L3 worn grass along the farm\'s paths: the worn band lifts the grass within 0.35 u of an edge >= 2 % (vs the same lawn without it), not the grass 0.9-1.4 u out',
  nIn > 30 && rIn >= 1.02 && Math.abs(rOut - 1) <= 0.002, `${nIn} corners by the paths: x ${rIn.toFixed(3)}; 0.9-1.4 u out: x ${rOut.toFixed(4)}`);
const wild = V.filter((p) => p.id !== 'main'), tall = wild.filter((p) => cov(p).tall > 0.7), else_ = wild.filter((p) => cov(p).tall < 0.2), dH = mean(tall.map((p) => p.h)) - mean(else_.map((p) => p.h));
ok('L4 the wild isles\' tall-grass patches stand on warmer ground (hue <= the rest - 1 deg)', tall.length > 100 && dH <= -1, `${tall.length} vertices under tall grass, hue difference ${dH.toFixed(2)} deg`);
// ---- the zone paint (art/specs/2026-10-25-ground-vegetation-design.md §6; plan Task 6, rulings GR20 and GR24-lite): MAIN, the default seed, read
const Z = GT.groundZones(bp, comp, comp.water);
for (const p of farm) p.q = Z.at('main', p.x, p.z);
const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
// the trunks with a shade pool on MAIN, and the open ring 1.5-3 u from them where U < 0.1 (L5, RF3)
const pools = Z.pools('main'), inPool = farm.filter((p) => p.q.U > 0.5);
const poolTrees = pools.filter((t) => inPool.some((p) => dist2(p.x, p.z, t.tx, t.tz) < 2.5 * t.r + 1));
const ring = farm.filter((p) => p.q.U < 0.1 && poolTrees.some((t) => { const d = dist2(p.x, p.z, t.tx, t.tz); return d >= 1.5 && d <= 3; }));
const ringY = mean(ring.map((p) => p.Y)), poolY = mean(inPool.map((p) => p.Y));
// L5: the shade pools under the lone farm trees, and under MAIN's C clovers (clover_patch where U > 0.35; GR16 puts >= 6 there), are
const cClover = comp.pieces.main.cover.filter((c) => c.asset === 'clover_patch' && Z.at('main', c.x, c.z).U > 0.35);
const underCl = farm.filter((p) => cClover.some((c) => dist2(p.x, p.z, c.x, c.z) < 0.35)), clY = mean(underCl.map((p) => p.Y));
ok('L5 the shade pools: the grass where U > 0.5 <= 0.97 x the ring 1.5-3 u from the same trunks (U < 0.1); under the C clovers too',
  inPool.length > 50 && ring.length > 100 && cClover.length >= 6 && underCl.length > 10 && poolY <= 0.97 * ringY && clY <= 0.97 * ringY,
  `${poolTrees.length} trunks: ${inPool.length} pool vertices ${poolY.toFixed(4)} vs ring (${ring.length}) ${ringY.toFixed(4)}: x ${(poolY / ringY).toFixed(4)}; ` +
  `${cClover.length} C clovers, ${underCl.length} vertices under them ${clY.toFixed(4)}: x ${(clY / ringY).toFixed(4)} (<= 0.97)`);
// L6: A (the tidy lawn under the play) is quieter: L1's mean |d luma| at 2 u with both ends in A <= 0.8 x both ends outside A (zoned)
const inA = (p) => p.id === 'main' && p.q && p.q.zone === 'A', outA = (p) => p.id === 'main' && p.q && p.q.zone && p.q.zone !== 'A';
const dA = dAt(inA, 2), dOut = dAt(outA, 2);
ok('L6 A is quieter: mean |d luma| at 2 u with both ends in A <= 0.8 x the same with both ends outside A', dA <= 0.8 * dOut,
  `in A ${dA.toFixed(4)}, outside A ${dOut.toFixed(4)}: x ${(dA / dOut).toFixed(3)} (<= 0.8)`);
// L7: MAIN's lush band is <= 2.5 u, measured from the teardrop (Review Focus 2: not the legacy blob). The same lawn painted with
const tdrop = Z.shore('main').find((s) => s.what === 'teardrop');
const tdD = (x, z) => { let d = 1e9; for (let i = 0; i < tdrop.length - 1; i++) d = Math.min(d, segDist(x, z, [tdrop[i][0], tdrop[i][1], tdrop[i + 1][0], tdrop[i + 1][1], 0])); return d; };
const noLush = GT.paintBlueprint(bp, comp, { ...P, grass: { ...P.grass, waterLush: 0 } }, L).main;
const lumaAt = (Carr) => { const pc = bp.pieces.main, acc = new Map();
  for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue; for (let q = 0; q < 3; q++) { const vi = pc.faces[t * 3 + q], o = t * 9 + q * 3, a = acc.get(vi) || acc.set(vi, [0, 0, 0, 0]).get(vi); for (let k = 0; k < 3; k++) a[k] += Carr[o + k]; a[3]++; } }
  return (vi) => { const a = acc.get(vi); return luma([0, 1, 2].map((k) => toS(a[k] / a[3]))); }; };
const bareY = lumaAt(noLush); for (const p of farm) p.dT = tdD(p.x, p.z);
const band = (s) => ({ n: s.length, r: s.reduce((a, p) => a + bareY(p.vi), 0) / s.reduce((a, p) => a + p.Y, 0) });
const far = band(farm.filter((p) => p.dT >= 2.5 && p.dT <= 5 && p.q.dWater >= 2.5)), nearB = band(farm.filter((p) => p.dT >= 0.35 && p.dT <= 1.5 && Math.abs(p.q.dWater - p.dT) < 0.02));
ok('L7 MAIN\'s lush band <= 2.5 u from the teardrop: vs waterLush 0, 2.5-5 u within 1 +/- 0.002; 0.35-1.5 u >= 2 % darker',
  far.n > 50 && nearB.n > 50 && Math.abs(far.r - 1) <= 0.002 && nearB.r >= 1.02,
  `2.5-5 u (${far.n}): no-lush / painted ${far.r.toFixed(4)}; 0.35-1.5 u (${nearB.n}): ${nearB.r.toFixed(4)}`);
// ---- the zone terms, each against the same lawn painted without it (review fix round 1: L5 and RF3 also see the forest-edge AO
const colAt = (Carr) => { const pc = bp.pieces.main, acc = new Map();
  for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue; for (let q = 0; q < 3; q++) { const vi = pc.faces[t * 3 + q], o = t * 9 + q * 3, a = acc.get(vi) || acc.set(vi, [0, 0, 0, 0]).get(vi); for (let k = 0; k < 3; k++) a[k] += Carr[o + k]; a[3]++; } }
  return (vi) => { const a = acc.get(vi); return [0, 1, 2].map((k) => toS(a[k] / a[3])); }; };
const paintWithout = (key) => { const keep = GT.LAWN[key]; GT.LAWN[key] = 0; const r = GT.paintBlueprint(bp, comp, P, L).main; GT.LAWN[key] = keep; return colAt(r); };
// L7b: the lush band follows the teardrop, not the legacy blob (Review Focus 2): at the grass 0.35-1.5 u from the teardrop (its
const lgP = comp.water.main.pond.legacy || comp.water.main.pond, lgD = (x, z) => Math.hypot(x - lgP.at[0], z - lgP.at[1]) - lgP.r;
const nearT = band(farm.filter((p) => p.dT >= 0.35 && p.dT <= 1.5 && Math.abs(p.q.dWater - p.dT) < 0.02 && lgD(p.x, p.z) >= 1.5));
ok('L7b the lush band follows the teardrop: 0.35-1.5 u from it and >= 1.5 u from the legacy blob, no-lush / painted >= 1.02', nearT.n > 50 && nearT.r >= 1.02,
  `${nearT.n} vertices: no-lush / painted ${nearT.r.toFixed(4)} (legacy blob r ${lgP.r} at (${lgP.at.join(', ')}))`);
// L5b: the C term itself: the pools (U > 0.5) <= 0.97 x the same lawn painted with cDeep 0
const noC = paintWithout('cDeep'), cR = inPool.reduce((s, p) => s + p.Y, 0) / inPool.reduce((s, p) => s + luma(noC(p.vi)), 0);
ok('L5b the shade-pool term: the grass where U > 0.5 <= 0.97 x the same lawn painted with cDeep 0', inPool.length > 50 && cR <= 0.97, `${inPool.length} pool vertices: x ${cR.toFixed(4)}`);
// L3b: the E term itself: the grass 0-0.3 u from a path edge (Z.at dPath) is drier than the same lawn painted with dryMix 0: mean hue
const noE = paintWithout('dryMix'), edge = farm.filter((p) => p.q.dPath >= 0 && p.q.dPath < 0.3), satOf = (c) => { const mx = Math.max(...c); return mx > 0 ? (mx - Math.min(...c)) / mx : 0; };
const eH = mean(edge.map((p) => p.h - hue(...noE(p.vi)))), eS = mean(edge.map((p) => satOf(p.c) - satOf(noE(p.vi))));
ok('L3b the dry path edge: grass 0-0.3 u from a path edge vs dryMix 0: hue <= -1.5 deg or saturation <= -0.006', edge.length > 100 && (eH <= -1.5 || eS <= -0.006),
  `${edge.length} vertices: hue ${eH.toFixed(2)} deg, saturation ${eS.toFixed(4)}`);
// LB: the lawn band (ART-BIBLE §B.1: lawn saturation 0.25-0.45, greens hue 55-175 deg, HSV) holds for every LAWN token and for the
const hsvS = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx > 0 ? (mx - mn) / mx : 0; };
const tokens = Object.entries(GT.LAWN).filter(([, v]) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v));
const badTok = tokens.filter(([, hx]) => { const { h, s } = hsvOf(hx); return !(s >= 0.25 && s <= 0.45 && h >= 55 && h <= 175); });
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const satAll = V.map((p) => hsvS(p.c)), satMain = farm.map((p) => hsvS(p.c));
const sb = [pct(satAll, 0.01), pct(satAll, 0.99)], sm = [pct(satMain, 0.01), pct(satMain, 0.99)];
ok('LB the lawn band: every LAWN token sat 0.25-0.45, hue 55-175 deg; the painted grass\'s saturation p1-p99 inside 0.25-0.45',
  tokens.length >= 6 && !badTok.length && sb[0] >= 0.25 && sb[1] <= 0.45,
  `${tokens.map(([k, hx]) => { const { h, s } = hsvOf(hx); return `${k} ${hx} (h ${h.toFixed(0)}, s ${s.toFixed(3)})`; }).join(', ')}${badTok.length ? '; OUT: ' + badTok.map(([k]) => k).join(', ') : ''}; ` +
  `grass p1-p99 ${sb[0].toFixed(3)}-${sb[1].toFixed(3)} (MAIN ${sm[0].toFixed(3)}-${sm[1].toFixed(3)})`);
// RF3 (Review Focus 3, phone readability): after a 1 u blur (each MAIN grass vertex takes the mean of the grass vertices within 1 u),
const BG = new Map(); farm.forEach((p, i) => { const k = Math.floor(p.x) + ',' + Math.floor(p.z); (BG.get(k) || BG.set(k, []).get(k)).push(i); });
for (const p of farm) { const s = [0, 0, 0]; let n = 0; const cx = Math.floor(p.x), cz = Math.floor(p.z);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of BG.get((cx + a) + ',' + (cz + b)) || []) { const o = farm[j]; if (dist2(p.x, p.z, o.x, o.z) > 1) continue; for (let k = 0; k < 3; k++) s[k] += o.c[k]; n++; }
  p.cb = s.map((v) => v / n); p.Yb = luma(p.cb); p.hb = hue(...p.cb); }
const zA = farm.filter((p) => p.q.zone === 'A'), zB = farm.filter((p) => p.q.zone === 'B');
const AY = mean(zA.map((p) => p.Yb)), BY = mean(zB.map((p) => p.Yb)), Ah = mean(zA.map((p) => p.hb)), Bh = mean(zB.map((p) => p.hb));
const poolYb = mean(inPool.map((p) => p.Yb)), ringYb = mean(ring.map((p) => p.Yb));
ok('RF3 the zones survive a 1 u blur: B luma >= 1.03 x A or B hue <= A - 3 deg; pools (U > 0.5) <= 0.97 x the 1.5-3 u ring',
  zA.length > 100 && zB.length > 100 && (BY >= 1.03 * AY || Bh <= Ah - 3) && poolYb <= 0.97 * ringYb,
  `B / A luma ${BY.toFixed(4)} / ${AY.toFixed(4)} = x ${(BY / AY).toFixed(4)} (>= 1.03), hue B - A ${(Bh - Ah).toFixed(2)} deg (<= -3); ` +
  `pools ${poolYb.toFixed(4)} / ring ${ringYb.toFixed(4)} = x ${(poolYb / ringYb).toFixed(4)} (<= 0.97)`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
