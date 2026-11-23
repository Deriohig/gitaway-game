// plants.test.mjs  --  WORLDSEED-BRIEF "plants & shapes" stage: the criteria that need no browser. Pure node.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import GT from '../lib/terrain.mjs';
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(__dirname, '../..');
const LP = JSON.parse(fs.readFileSync(path.join(ART, 'config', 'lookPresets.json'), 'utf8'));
const A = W3.archipelago;
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
let PL = null; try { PL = (await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'plants.mjs')).href)).default; } catch (e) { PL = { __error: e.message }; }
let LC = null; try { LC = await import(pathToFileURL(path.join(__dirname, '..', 'lib', 'look-core.mjs')).href); } catch { LC = null; }
const hex01 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
function hsv([r, g, b]) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 1e-9) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); if (h < 0) h += 360; } return [h, mx > 0 ? d / mx : 0, mx]; }
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lumaLin = (h) => { const c = hex01(h).map(lin); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const bp = GT.buildBlueprint(A, L, {}), comp = GT.composeBlueprint(bp, L), comp2 = GT.composeBlueprint(GT.buildBlueprint(A, L, {}), L);
const allTrees = bp.order.flatMap((id) => comp.pieces[id].trees.map((t) => ({ ...t, piece: id })));
// ---- V1 variants ----
{
  const TREES = ['oak', 'ovate', 'spread', 'sapling', 'fir', 'pine'], errs = [], dims = {};
  let built = null;
  if (PL && PL.buildVariants) { built = PL.buildVariants({ trunk: [0.3, 0.18, 0.1], trunkDark: [0.2, 0.12, 0.07] });
    for (const [id, v] of Object.entries(built)) {
      const n = v.positions.length / 3, idx = v.index, tris = idx.length / 3;
      if (v.normals.length !== n * 3 || v.colors.length !== n * 3 || v.treeH.length !== n) errs.push(id + ': attribute lengths');
      for (let i = 0; i < v.positions.length; i++) if (!Number.isFinite(v.positions[i])) { errs.push(id + ': non-finite position'); break; }
      for (let i = 0; i < n; i++) { const l = Math.hypot(v.normals[i * 3], v.normals[i * 3 + 1], v.normals[i * 3 + 2]); if (Math.abs(l - 1) > 1e-3) { errs.push(id + ': normal not unit'); break; } }
      for (let i = 0; i < n; i++) { const h = v.treeH[i]; if (!(h === -1 || (h >= 0 && h <= 1))) { errs.push(id + ': aTreeH ' + h); break; } }
      for (let i = 0; i < idx.length; i++) if (idx[i] >= n) { errs.push(id + ': index out of range'); break; }
      const cap = v.kind === 'shrub' ? 140 : 700; if (tris > cap) errs.push(`${id}: ${tris} tris > ${cap}`);
      if (v.kind !== 'shrub' && !v.treeH.some((h) => h === -1)) errs.push(id + ': no trunk');
      dims[id] = { kind: v.kind, h: v.height, w: v.width, r: v.height / v.width, tris };
    } }
  const kinds = TREES.map((id) => dims[id] && dims[id].kind);
  const broad = TREES.filter((id) => dims[id] && dims[id].kind === 'broad').length, con = TREES.filter((id) => dims[id] && dims[id].kind === 'conifer').length;
  let minRel = Infinity; for (let i = 0; i < TREES.length; i++) for (let j = i + 1; j < TREES.length; j++) { const a = dims[TREES[i]], b = dims[TREES[j]]; if (a && b) minRel = Math.min(minRel, Math.abs(a.r - b.r) / Math.max(a.r, b.r) + Math.abs(a.h - b.h) / Math.max(a.h, b.h)); }
  ok('V1a lib/plants.mjs builds 4 broadleaf + 2 conifer tree variants (+ shrubs): valid geometry, aTreeH 0..1 / -1 trunk, tri caps, distinct silhouettes',
    built && broad >= 4 && con >= 2 && !errs.length && minRel >= 0.1,
    built ? `${Object.entries(dims).map(([k, d]) => `${k} ${d.kind} ${f2(d.h)}x${f2(d.w)} ${d.tris}t`).join(', ')}; min silhouette diff ${f2(minRel)}; ${errs.slice(0, 4).join('; ') || 'no errors'}` : 'no plants.mjs: ' + (PL && PL.__error));
  const used = new Set(allTrees.map((t) => t.variant).filter(Boolean)), missing = allTrees.filter((t) => !TREES.includes(t.variant)).length;
  ok('V1b every placed tree carries a variant; >= 6 variants used', !missing && used.size >= 6, `${allTrees.length} trees, ${missing} without; used: ${[...used].map((u) => u + ' ' + allTrees.filter((t) => t.variant === u).length).join(', ')}; kinds ${kinds.join(',')}`);
}
// ---- V2 layout unchanged + deterministic ----
{
  // the hash covers positions and final scales only, [x, z, scale x vscale] (r3, sorted per piece): the species now come from `asset`
  const r3 = (v) => +v.toFixed(3), cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const sigOf = (lists) => crypto.createHash('sha1').update(JSON.stringify(lists)).digest('hex');
  const sig = (c) => sigOf(bp.order.map((id) => c.pieces[id].trees.map((t) => [r3(t.x), r3(t.z), r3(t.scale * (t.vscale || 1))]).sort(cmp)));
  const FX = path.join(__dirname, 'fixtures', 'trees.4f2dd09.json'); let fx = null; try { fx = JSON.parse(fs.readFileSync(FX, 'utf8')); } catch { /* none */ }
  if (process.argv.includes('--write-fixture')) { const frozen = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'trees.positions.json'), 'utf8')).seeds.default, T = bp.order.map((id) => frozen.pieces[id].trees);
    fs.writeFileSync(FX, JSON.stringify({ sha1: sigOf(T), trees: T.reduce((s, l) => s + l.length, 0), bushes: bp.order.reduce((s, id) => s + comp.pieces[id].bushes.length, 0), flowers: Object.fromEntries(bp.order.map((id) => [id, comp.pieces[id].flowers.length])) }) + '\n'); console.log('wrote ' + FX); fx = JSON.parse(fs.readFileSync(FX, 'utf8')); }
  // the frozen positions must still hash to the pinned sha1; the live trees = those minus the ones in a keep-clear area added after the
  const frozenT = (() => { try { const f = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'trees.positions.json'), 'utf8')).seeds.default; return bp.order.map((id) => f.pieces[id].trees); } catch { return null; } })();
  const kc = GT.keepClearHit(bp, comp.water) || (() => false), wantT = frozenT && frozenT.map((l, i) => { const lay = new Set(comp.pieces[bp.order[i]].trees.filter((t) => t.layout).map((t) => r3(t.x) + ',' + r3(t.z))); return l.filter(([x, z]) => lay.has(x + ',' + z) || !kc(x, z, 'trees')); }), nWant = wantT ? wantT.reduce((s, l) => s + l.length, 0) : -1;
  ok('V2a tree positions / final scales = the 4f2dd09 composition (fixture hash, pinned from fixtures/trees.positions.json; minus the keep-clear areas)', fx && frozenT && fx.sha1 === sigOf(frozenT) && sigOf(wantT) === sig(comp) && nWant === allTrees.length,
    fx && frozenT ? `${sig(comp).slice(0, 12)} vs frozen minus keep-clear ${sigOf(wantT).slice(0, 12)} (frozen ${sigOf(frozenT).slice(0, 12)}, pinned ${fx.sha1.slice(0, 12)}), ${allTrees.length} trees vs ${nWant} (${fx.trees} frozen)` : 'no fixture');
  const vs = (c) => JSON.stringify(bp.order.map((id) => c.pieces[id].trees.map((t) => [t.variant, t.vscale, t.vyaw])));
  ok('V2b the variant assignment is deterministic', allTrees.some((t) => t.variant) && vs(comp) === vs(comp2), allTrees.some((t) => t.variant) ? 'two compositions ' + (vs(comp) === vs(comp2) ? 'agree' : 'DIFFER') : 'no variants');
}
// ---- V3 no clones among neighbours ----
{
  // species = the tree's `asset`; a layout tree has none (the game places it), so its variant's model (composeBlueprint's BASE)
  const BASE = { oak: 'tree_round_a', ovate: 'tree_round_b', spread: 'tree_spread', sapling: 'tree_sapling', fir: 'tree_pine_a', pine: 'tree_pine_b' }, sp = (t) => t.asset || (t.layout && BASE[t.variant]);
  let pairs = 0, clones = 0; const ex = [];
  for (let i = 0; i < allTrees.length; i++) for (let j = i + 1; j < allTrees.length; j++) {
    const a = allTrees[i], b = allTrees[j]; if (Math.abs(a.x - b.x) > 1.5 || Math.abs(a.z - b.z) > 1.5 || Math.hypot(a.x - b.x, a.z - b.z) > 1.5) continue; pairs++;
    const sa = a.scale * (a.vscale || 1), sb = b.scale * (b.vscale || 1), ya = a.rot + (a.vyaw || 0), yb = b.rot + (b.vyaw || 0), dy = Math.abs(Math.atan2(Math.sin(ya - yb), Math.cos(ya - yb)));
    if (sp(a) === sp(b) && Math.abs(sa - sb) < 0.02 && dy < 0.15) { clones++; if (ex.length < 3) ex.push(`${sp(a)} @${f2(a.x)},${f2(a.z)}`); }
  }
  const all = allTrees.every((t) => sp(t));
  ok('V3 no two trees within 1.5 u share species (asset) + scale (+/- 0.02) + yaw (+/- 0.15 rad)', all && clones === 0, `${pairs} neighbour pairs, ${clones} clones ${ex.join(' ')}${all ? '' : ` (${allTrees.filter((t) => !sp(t)).length} trees without a species)`}`);
}
// ---- V4 canopy ramp (Golden afternoon) ----
{
  const P = LP.presets['Golden afternoon'].plants;
  if (P) { const R = P.ramp, C = P.conifer, lit = hsv(hex01(R.lit)), cl = hsv(hex01(C.lit));
    const order = lumaLin(R.shade) < lumaLin(R.mid) && lumaLin(R.mid) < lumaLin(R.lit) && lumaLin(C.shade) < lumaLin(C.mid) && lumaLin(C.mid) < lumaLin(C.lit);
    ok('V4 canopy ramp: lit hue 75-115 / sat 0.30-0.60 / value <= 0.70; shade < mid < lit; conifer lit hue 90-150, conifer shade not black',
      lit[0] >= 75 && lit[0] <= 115 && lit[1] >= 0.3 && lit[1] <= 0.6 && lit[2] <= 0.7 && order && cl[0] >= 90 && cl[0] <= 150 && lumaLin(C.shade) >= 0.02,
      `lit ${R.lit} h ${f2(lit[0])} s ${f2(lit[1])} v ${f2(lit[2])}; conifer lit ${C.lit} h ${f2(cl[0])}; conifer shade luma ${lumaLin(C.shade).toFixed(3)}; order ${order}`);
  } else ok('V4 canopy ramp (Golden afternoon plants.ramp)', false, 'no plants section');
}
// ---- F1 flowers ----
{
  const fl = bp.order.flatMap((id) => (comp.pieces[id].flowerPatches || []).map((f) => ({ ...f, piece: id })));
  const patches = bp.order.flatMap((id) => comp.pieces[id].patches || []), schemes = new Set(patches.map((p) => p.scheme));
  let coh = 0, crowd = 0; const grid = new Map(), key = (x, z) => Math.floor(x / 0.6) + ',' + Math.floor(z / 0.6);
  for (const f of fl) (grid.get(key(f.x, f.z)) || grid.set(key(f.x, f.z), []).get(key(f.x, f.z))).push(f);
  for (const f of fl) { const near = []; const cx = Math.floor(f.x / 0.6), cz = Math.floor(f.z / 0.6);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const g of grid.get((cx + a) + ',' + (cz + b)) || []) if (g !== f) near.push([Math.hypot(g.x - f.x, g.z - f.z), g]);
    near.sort((p, q) => p[0] - q[0]); const k4 = near.slice(0, 4); coh += k4.length ? k4.filter(([, g]) => g.color === f.color).length / k4.length : 0;
    if (near.filter(([d]) => d <= 0.6).length >= 3) crowd++; }
  const old = bp.order.reduce((s, id) => s + (A.composition.flowers[id] || 0), 0), cohM = fl.length ? coh / fl.length : 0, crowdS = fl.length ? crowd / fl.length : 0;
  ok('F1 flowers in composed drifts: >= 3 schemes, colour coherence >= 0.6, >= 90 % crowded (no speckle), count within 15 % of the old totals',
    fl.length && schemes.size >= 3 && cohM >= 0.6 && crowdS >= 0.9 && Math.abs(fl.length - old) <= 0.15 * old,
    `${fl.length} flowers in ${patches.length} patches (old ${old}); schemes ${[...schemes].join(', ') || 'none'}; coherence ${f2(cohM)}; crowded ${f2(crowdS)}`);
}
// ---- S1 shrubs ----
{
  const sh = bp.order.flatMap((id) => comp.pieces[id].shrubs || []);
  const TG = new Map(), tk = (x, z) => Math.floor(x / 2) + ',' + Math.floor(z / 2);
  for (const t of allTrees) (TG.get(tk(t.x, t.z)) || TG.set(tk(t.x, t.z), []).get(tk(t.x, t.z))).push(t);
  const treesNear = (x, z, r) => { const out = []; const cx = Math.floor(x / 2), cz = Math.floor(z / 2); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (const t of TG.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(t.x - x, t.z - z) < r) out.push(t); return out; };
  let edge = 0, covered = 0, onTrunk = 0;
  for (const t of allTrees) {
    if (treesNear(t.x, t.z, 2.6).length < 4) continue;   // (itself + >= 3)
    let open = 0; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, x = t.x + Math.cos(a) * 1.6, z = t.z + Math.sin(a) * 1.6; if (GT.pieceAt(bp, x, z) && !treesNear(x, z, 0.9).length) open++; }
    if (open < 3 || open > 6) continue; edge++;
    if (sh.some((s) => Math.abs(s.x - t.x) < 2 && Math.abs(s.z - t.z) < 2 && Math.hypot(s.x - t.x, s.z - t.z) < 2)) covered++;
  }
  for (const s of sh) if (treesNear(s.x, s.z, 0.35).length) onTrunk++;
  ok('S1 woodland edge: >= 200 shrubs, >= 55 % of the forest-edge trees have one within 2 u, none within 0.35 u of a trunk',
    sh.length >= 200 && edge && covered / edge >= 0.55 && !onTrunk, `${sh.length} shrubs; ${covered}/${edge} edge trees covered (${f2(edge ? covered / edge : 0)}); ${onTrunk} on a trunk`);
}
// ---- P1 paths, W1 farm, G1 revert ----
{
  const G = LP.presets['Golden afternoon'], pc = G.paths && G.paths.color, h = pc ? hsv(hex01(pc)) : null;
  ok('P1 Golden afternoon paths.color = muted warm tan (hue 25-45, sat 0.18-0.36, value 0.5-0.8), paths enabled', h && G.paths.enabled && h[0] >= 25 && h[0] <= 45 && h[1] >= 0.18 && h[1] <= 0.36 && h[2] >= 0.5 && h[2] <= 0.8,
    h ? `${pc} h ${f2(h[0])} s ${f2(h[1])} v ${f2(h[2])}` : 'no paths section');
  const at = (hr) => (LC && LC.presetAtHour ? LC.presetAtHour(LP, hr).preset : null), d = at(16.5), n = at(19.5);
  const wd = d && d.farm ? d.farm.windowGlow : NaN, wn = n && n.farm ? n.farm.windowGlow : NaN, pd = d && d.farm ? d.farm.porchLight : NaN, pn = n && n.farm ? n.farm.porchLight : NaN;
  ok('W1 farm.windowGlow at 19.5 h >= 2 x 16.5 h; porch light 0 at 16.5 h, > 0 at 19.5 h', wn >= 2 * wd && wd > 0 && pd === 0 && pn > 0, `window ${f2(wd)} -> ${f2(wn)}; porch ${f2(pd)} -> ${f2(pn)}`);
  const off = ['Game (current)', 'Proof warm (v4)'].map((k) => { const p = LP.presets[k]; return [k, !!(p.plants && !p.plants.enabled && p.farm && !p.farm.enabled && p.paths && !p.paths.enabled && p.stone.strata && !p.stone.strata.enabled)]; });
  ok('G1 Game (current) + Proof warm (v4): plants / farm / paths / stone.strata disabled', off.every(([, v]) => v), off.map(([k, v]) => `${k} ${v ? 'off' : 'NOT off'}`).join('; '));
}
let fail = 0;
for (const r of results) { console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`); if (!r.pass) fail++; }
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
