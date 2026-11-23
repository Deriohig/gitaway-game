// species.test.mjs -- the painterly trees (art/specs/2026-10-22-painterly-trees-design.md, plan Task 8): composeBlueprint gives every
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';
import { SPECIES, AUTUMN } from '../lib/species.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const GT = (await import(pathToFileURL(process.env.TERRAIN ? path.resolve(process.env.TERRAIN) : path.join(here, '..', 'lib', 'terrain.mjs')).href)).default;
const FIXTURE = path.join(here, 'fixtures', 'trees.positions.json');
const A = W3.archipelago, SEEDS = [['default', A.seeds.default >>> 0], ['alt', A.seeds.alt >>> 0]];
const TREE_IDS = SPECIES.filter((s) => s.kind !== 'bush').map((s) => s.id), BUSH_IDS = SPECIES.filter((s) => s.kind === 'bush').map((s) => s.id);
const AUTUMN_IDS = AUTUMN.map((a) => a.id), PINES = ['tree_pine_a', 'tree_pine_b'], SHRUB_IDS = ['shrub_low', 'shrub_mound', 'shrub_heather'];
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const pct = (v) => (100 * v).toFixed(1) + ' %';
const r3 = (v) => +v.toFixed(3);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const positions = (bp, comp) => Object.fromEntries(bp.order.map((id) => { const O = comp.pieces[id];
  return [id, { trees: O.trees.map((t) => [r3(t.x), r3(t.z), r3(t.scale * (t.vscale || 1))]).sort(cmp), shrubs: (O.shrubs || []).map((s) => [r3(s.x), r3(s.z), r3(s.scale)]).sort(cmp),
    bushes: O.bushes.map((b) => [r3(b.x), r3(b.z), r3(b.scale)]).sort(cmp) }]; }));
// open water within r of (x, z): the lake / tarn / hot spring (inside the shore and below level + 0.06), a channel's half width, the pond
function waterNear(bp) {
  const W = GT.blueprintWater(bp), pond = W.main.pond, lines = [W.main.stream.points, W.wetland.river.points, W.wetland.outflow.points], pools = [W.wetland.lake, W.highland.tarn, W.highland.hotSpring];
  const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
  const open = (x, z) => pools.some((p) => GT.inLoop(p.outline, x, z) && bp.H(x, z) < p.level + 0.06);
  return (x, z, r) => {
    if (Math.hypot(x - pond.at[0], z - pond.at[1]) < pond.r + r) return true;
    for (const pts of lines) for (let i = 0; i < pts.length - 1; i++) if (segD(x, z, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z) < Math.max(pts[i].width, pts[i + 1].width) / 2 + r) return true;
    for (const d of [0, r / 3, 2 * r / 3, r]) for (let k = 0; k < 16; k++) if (open(x + Math.cos(k / 16 * 2 * Math.PI) * d, z + Math.sin(k / 16 * 2 * Math.PI) * d)) return true;
    return false;
  };
}
const runs = SEEDS.map(([label, seed]) => { const bp = GT.buildBlueprint(A, L, { seed }); return { label, seed, bp, comp: GT.composeBlueprint(bp, L) }; });
if (process.argv.includes('--freeze')) {
  // (M9) the fixture must come from the code BEFORE the species pass: once composed trees carry an asset that pass has run, and a
  const tagged = runs.reduce((n, r) => n + r.bp.order.reduce((k, id) => k + r.comp.pieces[id].trees.filter((t) => !t.layout && t.asset).length, 0), 0);
  if (tagged && process.env.FORCE_FREEZE !== '1') {
    console.error(`--freeze refused: ${tagged} composed trees already carry an asset (the species pass has run), so this code cannot give S1's `
      + 'before-the-species-pass fixture. Run it on the code before that pass, or set FORCE_FREEZE=1 to re-baseline on purpose.');
    process.exit(2);
  }
  const fx = { about: 'tests/species.test.mjs S1: per seed and piece, the sorted [x, z, scale x vscale] (r3) of the trees, shrubs and bushes, frozen before the species pass (plan Task 8)',
    seeds: Object.fromEntries(runs.map((r) => [r.label, { seed: r.seed, pieces: positions(r.bp, r.comp) }])) };
  // one line per item: the diffs stay readable
  const body = JSON.stringify(fx, null, 1).replace(/\[\s+(-?[\d.]+),\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '[$1,$2,$3]');
  fs.writeFileSync(FIXTURE, body + '\n'); console.log('wrote ' + path.relative(process.cwd(), FIXTURE)); process.exit(0);
}
let FX = null; try { FX = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')); } catch { /* none */ }
for (const { label, seed, bp, comp } of runs) {
  const P = comp.pieces, composed = (id) => P[id].trees.filter((t) => !t.layout), isles = bp.order.filter((id) => id !== 'main');
  const count = (list, f) => list.filter(f).length;
  // S1
  { const now = positions(bp, comp), fx = FX && FX.seeds[label] && FX.seeds[label].pieces, diff = [], kc = GT.keepClearHit(bp, comp.water) || (() => false); let dropped = 0, droppedW = 0;
    const fw = GT.farmWaterHit(bp, comp.water) || (() => false);
    const layoutAt = (id, c) => new Set((comp.pieces[id][c] || []).filter((it) => it.layout).map((it) => r3(it.x) + ',' + r3(it.z)));
    if (fx) for (const id of bp.order) for (const c of ['trees', 'shrubs', 'bushes']) { const all = (fx[id] && fx[id][c]) || [], lay = layoutAt(id, c);
      const keepKc = all.filter(([x, z]) => lay.has(x + ',' + z) || !kc(x, z, c)), want = keepKc.filter(([x, z]) => id !== 'main' || lay.has(x + ',' + z) || !fw(x, z, c));
      dropped += all.length - keepKc.length; droppedW += keepKc.length - want.length;
      if (!fx[id] || JSON.stringify(now[id][c]) !== JSON.stringify(want)) diff.push(`${id}.${c} ${now[id][c].length} vs ${fx[id] && fx[id][c] ? want.length : 'none'}`); }
    if (dropped) console.log(`        (S1 ${label}: ${dropped} frozen items stand in a keep-clear area and are not expected)`);
    if (droppedW) console.log(`        (S1 ${label}: ${droppedW} frozen items stand on MAIN's water rev 1 drop and are not expected)`);
    ok(`S1 ${label}: trees / shrubs / bushes positions and scales = the frozen fixture`, fx && FX.seeds[label].seed === seed && !diff.length,
      !fx ? 'no fixture ' + path.relative(process.cwd(), FIXTURE) : diff.length ? 'differ: ' + diff.join(', ') : bp.order.map((id) => `${id} ${now[id].trees.length}/${now[id].shrubs.length}/${now[id].bushes.length}`).join(', ')); }
  // S3
  { const T = composed('highland'), n = count(T, (t) => PINES.includes(t.asset));
    ok(`S3 ${label}: the highland's composed trees are >= 70 % tree_pine_a + tree_pine_b`, T.length && n / T.length >= 0.7, `${n}/${T.length} = ${pct(T.length ? n / T.length : 0)}`); }
  // S4
  { const broad = isles.flatMap((id) => composed(id)).filter((t) => t.asset && !PINES.includes(t.asset)), aut = count(broad, (t) => AUTUMN_IDS.includes(t.asset)), onMain = count(P.main.trees, (t) => AUTUMN_IDS.includes(t.asset));
    const share = broad.length ? aut / broad.length : 0;
    ok(`S4 ${label}: autumn = 5-10 % of the isles' composed broadleaf trees, 0 on main`, broad.length && share >= 0.05 && share <= 0.1 && !onMain,
      `${aut}/${broad.length} = ${pct(share)} (${AUTUMN_IDS.map((a) => a.replace('tree_', '') + ' ' + count(broad, (t) => t.asset === a)).join(', ')}); on main ${onMain}`); }
  // S5
  { const used = new Set(bp.order.flatMap((id) => composed(id).map((t) => t.asset))), bushes = new Set(bp.order.flatMap((id) => P[id].bushes.filter((b) => !b.layout).map((b) => b.kind)));
    const want = TREE_IDS.filter((id) => id !== 'tree_fruit').concat(AUTUMN_IDS), miss = want.filter((id) => !used.has(id)).concat(bushes.has('bush_berry') ? [] : ['bush_berry']);
    ok(`S5 ${label}: every SPECIES tree id but tree_fruit, every AUTUMN id and bush_berry are placed`, !miss.length, miss.length ? 'missing: ' + miss.join(', ') : `${want.length} tree ids + bush_berry`); }
  // S6
  { const sig = (c) => JSON.stringify(bp.order.map((id) => [c.pieces[id].trees.map((t) => t.asset || null), (c.pieces[id].shrubs || []).map((s) => s.asset || null), c.pieces[id].bushes.map((b) => b.kind)]));
    const again = GT.composeBlueprint(GT.buildBlueprint(A, L, { seed }), L), all = bp.order.every((id) => composed(id).every((t) => t.asset) && (P[id].shrubs || []).every((s) => s.asset));
    ok(`S6 ${label}: every composed tree / shrub has an asset; composing again gives the same asset / kind fields`, all && sig(comp) === sig(again), `assets ${all ? 'on all' : 'MISSING'}; two compositions ${sig(comp) === sig(again) ? 'agree' : 'DIFFER'}`); }
  // S7
  { const near = waterNear(bp), wb = count(composed('wetland'), (t) => t.asset === 'tree_birch' && near(t.x, t.z, 1.5)), hb = count(composed('highland'), (t) => t.asset === 'tree_birch');
    ok(`S7 ${label}: the wetland >= 8 tree_birch within 1.5 u of water, the highland >= 6 tree_birch`, wb >= 8 && hb >= 6,
      `wetland ${wb} by the water (of ${count(composed('wetland'), (t) => t.asset === 'tree_birch')} birches, ${composed('wetland').length} trees); highland ${hb} (of ${composed('highland').length} trees)`); }
  // S8
  { const off = isles.concat('main').filter((id) => id !== 'highland').flatMap((id) => (P[id].shrubs || []).filter((s) => s.asset === 'shrub_heather').map(() => id)), H = P.highland.shrubs || [], notH = count(H, (s) => s.asset !== 'shrub_heather');
    ok(`S8 ${label}: shrub_heather only on the highland, and every highland shrub is shrub_heather`, H.length && !off.length && !notH,
      `highland ${H.length - notH}/${H.length} heather; heather elsewhere ${off.length}${off.length ? ' (' + [...new Set(off)].join(', ') + ')' : ''}`); }
  // S9
  { const bad = [];
    for (const id of bp.order) { for (const t of P[id].trees) { if (t.layout ? t.asset !== undefined : !TREE_IDS.includes(t.asset) && !AUTUMN_IDS.includes(t.asset)) bad.push(`${id} tree ${t.asset}${t.layout ? ' (layout)' : ''}`); }
      for (const s of P[id].shrubs || []) if (!SHRUB_IDS.includes(s.asset)) bad.push(`${id} shrub ${s.asset}`);
      for (const b of P[id].bushes) if (!BUSH_IDS.includes(b.kind)) bad.push(`${id} bush ${b.kind}`); }
    const tally = {}; for (const id of bp.order) for (const t of composed(id)) tally[t.asset] = (tally[t.asset] || 0) + 1;
    ok(`S9 ${label}: composed trees carry a SPECIES / AUTUMN id, shrubs a card shrub, bushes a SPECIES bush id; layout trees no asset`, !bad.length,
      bad.length ? `${bad.length} wrong: ${[...new Set(bad)].slice(0, 6).join(', ')}` : Object.entries(tally).sort().map(([k, v]) => `${k} ${v}`).join(', ')); }
}
console.log(`\n  ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
