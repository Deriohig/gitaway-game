// look-gates.mjs  --  the IMAGE criteria of the v4 look pass, measured on captured renders (NO deps).
// =============================================================================
// Usage:  node look-gates.mjs --prefix v4 [--probe <scene-probe.json>] [--base v3 --base-probe <json>]
// Reads proof/_shots/<prefix>_<preset>[_seed42].png (capture.mjs) + a scene-probe.mjs JSON (draw calls,
// tree-pixel share) and checks:
//   G1 highland: rock band >= 8% (concept 12.6%)                                   both seeds
//   G2 rim_edge: rock band >= 2x and 'other' (dark brown) <= 0.5x the base prefix (v3)
//   G3 island_wide: tree pixels >= 25% of the island's pixels (scene-probe mask)
//   G4 island_wide: path band >= 8% (concept 14%)                                  both seeds
//   G5 gameplay presets: terrainSat within +/-15% of the concept; every preset darkest >= 0.08 (STYLE P1)
//   G6 gameplay presets: yellow-green share of all grass >= 40% (concept ~70-80%)
//   G7 island_wide draw calls <= the base build's (instancing keeps the denser scene cheap)
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { metricsOf } from './metrics.mjs';
import { SHOTS_DIR, CONCEPT_DIR } from './lib/paths.mjs';
import W3 from '../config/world.config.mjs';

const a = process.argv.slice(2);
let prefix = 'v4', base = 'v3', probe = null, baseProbe = null, shots = SHOTS_DIR;
for (let i = 0; i < a.length; i++) {
  if (a[i] === '--prefix') prefix = a[++i]; else if (a[i] === '--base') base = a[++i]; else if (a[i] === '--probe') probe = a[++i];
  else if (a[i] === '--base-probe') baseProbe = a[++i]; else if (a[i] === '--shots') shots = a[++i];
}
const A = W3.archipelago, alt = A.seeds.alt, CAMS = A.cameras;
const M = (p, preset, seed42 = false) => { const f = path.join(shots, `${p}_${preset}${seed42 ? '_seed' + alt : ''}.png`); return fs.existsSync(f) ? metricsOf(f) : null; };
const C = (preset) => { const f = path.join(CONCEPT_DIR, `${preset}.png`); return fs.existsSync(f) ? metricsOf(f) : null; };
const J = (f) => (f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const pc = (v) => (v == null ? 'n/a' : (v * 100).toFixed(1) + '%');
const res = [];
const gate = (name, pass, detail) => res.push({ name, pass: !!pass, detail });

{ const r = [M(prefix, 'highland'), M(prefix, 'highland', true)];
  gate('G1 highland rock band >= 8% (both seeds)', r.every((m) => m && m.bands.rock >= 0.08), `rock ${r.map((m) => pc(m && m.bands.rock)).join(' / ')} (concept ${pc(C('highland').bands.rock)})`); }
{ const r = M(prefix, 'rim_edge'), b = M(base, 'rim_edge'), c = C('rim_edge');
  gate(`G2 rim_edge rock >= 2x ${base}, other <= 0.5x ${base}`, r && b && r.bands.rock >= 2 * b.bands.rock && r.bands.other <= 0.5 * b.bands.other,
    `rock ${pc(r && r.bands.rock)} vs ${base} ${pc(b && b.bands.rock)} (concept ${pc(c.bands.rock)}); other ${pc(r && r.bands.other)} vs ${base} ${pc(b && b.bands.other)} (concept ${pc(c.bands.other)})`); }
{ const p = J(probe), bp = J(baseProbe), t = p && p.island_wide;
  gate('G3 island_wide tree pixels >= 25% of the island', t && t.treeShare >= 0.25, `tree share ${pc(t && t.treeShare)}${bp && bp.island_wide ? ` (${base} ${pc(bp.island_wide.treeShare)})` : ''}`);
  gate(`G7 island_wide draw calls <= ${base}`, t && bp && bp.island_wide && t.calls <= bp.island_wide.calls, `draw calls ${t ? t.calls : 'n/a'} vs ${base} ${bp && bp.island_wide ? bp.island_wide.calls : 'n/a'}`); }
{ const r = [M(prefix, 'island_wide'), M(prefix, 'island_wide', true)];
  gate('G4 island_wide path band >= 8% (both seeds)', r.every((m) => m && m.bands.path >= 0.08), `path ${r.map((m) => pc(m && m.bands.path)).join(' / ')} (concept ${pc(C('island_wide').bands.path)})`); }
{ const gp = Object.keys(CAMS).filter((n) => CAMS[n].mode === 'gameplay'), rows = [], dark = [];
  let satOk = true, ygOk = true;
  for (const n of gp) { const r = M(prefix, n), c = C(n); if (!r || !c) { satOk = ygOk = false; rows.push(n + ' missing'); continue; }
    const d = (r.terrainSat - c.terrainSat) / c.terrainSat, yg = r.bands.yellowGreen / Math.max(1e-9, r.bands.yellowGreen + r.bands.grass);
    if (Math.abs(d) > 0.15) satOk = false; if (yg < 0.4) ygOk = false;
    rows.push(`${n} sat ${r.terrainSat.toFixed(3)}/${c.terrainSat.toFixed(3)} (${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}%) yg ${pc(yg)}`); }
  for (const n of Object.keys(CAMS)) for (const s of [false, true]) { const r = M(prefix, n, s); if (r && r.darkest < 0.08) dark.push(`${n}${s ? '@' + alt : ''} ${r.darkest.toFixed(3)}`); }
  gate('G5 gameplay terrainSat within +/-15% of the concept; darkest >= 0.08 everywhere', satOk && !dark.length, rows.map((q) => q.split(' yg')[0]).join('; ') + (dark.length ? ' | DARK ' + dark.join(', ') : ' | darkest ok'));
  gate('G6 gameplay yellow-green share of grass >= 40%', ygOk, rows.map((q) => q.split(' (')[0].split(' sat')[0] + ' yg ' + q.split(' yg ')[1]).join('; ')); }

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
console.log(`\n  LOOK IMAGE GATES  prefix=${prefix} base=${base}`);
console.log('  ' + '-'.repeat(96));
for (const r of res) { if (!r.pass) fails++; console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + pad(r.name, 90) + '\n        ' + r.detail); }
console.log('  ' + '-'.repeat(96)); console.log(`  ${res.length - fails}/${res.length} passed, ${fails} failed\n`);
process.exit(fails ? 1 : 0);
