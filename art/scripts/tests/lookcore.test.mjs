// lookcore.test.mjs  --  WORLDSEED-BRIEF look-core criteria that need no browser (art/config/WORLDSEED-BRIEF.md). Pure node.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GT from '../lib/terrain.mjs';
import { readPNG } from '../lib/png.mjs';
import L from '../../config/look.config.mjs';
import W3 from '../../config/world.config.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(__dirname, '../..'), SHOTS = path.join(ART, 'screenshots'), A = W3.archipelago, TAG = GT.TAG;
const LP = JSON.parse(fs.readFileSync(path.join(ART, 'config', 'lookPresets.json'), 'utf8'));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ART, 'config', 'lookPresets.schema.json'), 'utf8'));
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'three-r186-lambert.json'), 'utf8'));
let LC = null; try { LC = (await import('../lib/look-core.mjs')).default; } catch (e) { LC = null; }
let LS = null; try { LS = (await import('../lib/look-save.mjs')).default; } catch { LS = null; }
const argv = process.argv.slice(2); let shots = 'look_core';
for (let i = 0; i < argv.length; i++) if (argv[i] === '--shots') shots = argv[++i];
const results = [];
const ok = (name, pass, detail, skip = false) => results.push({ name, pass: !!pass, detail, skip });
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v)), f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : String(v));
function hsv(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 1e-9) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); if (h < 0) h += 360; } return [h, mx > 0 ? d / mx : 0, mx]; }
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const pctl = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const circ = (hs) => { let sx = 0, sy = 0; for (const h of hs) { sx += Math.cos(h * Math.PI / 180); sy += Math.sin(h * Math.PI / 180); } let m = Math.atan2(sy, sx) * 180 / Math.PI; if (m < 0) m += 360; return m; };
const G = LP.presets['Golden afternoon'];
// W1. LAWN ALBEDO
const bp = GT.buildBlueprint(A, L, {}), comp = GT.composeBlueprint(bp, L);
{
  const painted = GT.paintBlueprint(bp, comp, G, L), toS = GT.linearToSrgb, all = [], meadow = [];
  for (const id of bp.order) { const pc = bp.pieces[id], P = pc.positions, C = painted[id], C0 = pc.colors, pv = pc.pivot;
    for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top || pc.paint.rk[t] > 0.01) continue; const o = t * 9;
      const b0 = [0, 1, 2].map((k) => toS((C0[o + k] + C0[o + 3 + k] + C0[o + 6 + k]) / 3)); if (hsv(...b0)[0] < 58 || hsv(...b0)[0] > 170) continue;
      const c = [0, 1, 2].map((k) => toS((C[o + k] + C[o + 3 + k] + C[o + 6 + k]) / 3)), h = hsv(...c), y = (P[o + 1] + P[o + 4] + P[o + 7]) / 3 + pv[1];
      all.push(h); if (y > -0.6 && y < 0.8 && pc.paint.sw[t] < 0.05) meadow.push(h); } }
  const mh = circ(meadow.map((x) => x[0])), ms = mean(meadow.map((x) => x[1])), mv = mean(meadow.map((x) => x[2])), p90 = pctl(all.map((x) => x[0]), 0.9);
  ok('W1 lawn albedo = the Worldseed lawn family (not grey-sage): meadow sat 0.30-0.46, hue 92-118, value >= 0.55; no teal (P90 hue <= 135)', ms >= 0.30 && ms <= 0.46 && mh >= 92 && mh <= 118 && mv >= 0.55 && p90 <= 135,
    `${meadow.length} meadow faces: hue ${f2(mh)}, sat ${f3(ms)}, value ${f3(mv)}; ${all.length} grass faces P90 hue ${f2(p90)} (grass warm ${G.grass.warm} mid ${G.grass.mid} cool ${G.grass.cool})`);
}
// W2. LIT LAWN ON THE CAPTURES
{
  // (the gameplay views live in <shots>/raw, or <shots>_gameplay/raw[/golden] in the older phase layout)
  const dirs = [path.join(SHOTS, shots, 'raw'), path.join(SHOTS, shots + '_gameplay', 'raw'), path.join(SHOTS, shots + '_gameplay', 'raw', 'golden')];
  const sets = ['full', 'farm', 'junction', 'woodland', 'default_mobile', 'default_desktop'].map((v) => { const d = dirs.find((x) => fs.existsSync(path.join(x, v + '.png')) && fs.existsSync(path.join(x, v + '_mask.png')));
    return d ? [v, path.join(d, v + '.png'), path.join(d, v + '_mask.png')] : null; }).filter(Boolean);
  if (!sets.length) ok(`W2 lit lawn hue 85-105 / sat 0.40-0.50, shade still green (${shots})`, true, 'SKIP (no captures)', true);
  else { const rows = [], bad = [];
    for (const [v, f, m] of sets) { const img = readPNG(f), mk = readPNG(m), px = [];
      for (let i = 0; i < img.data.length; i += 4) { if (!(mk.data[i + 1] > 127 && mk.data[i] <= 127 && mk.data[i + 2] <= 127)) continue;
        const h = hsv(img.data[i] / 255, img.data[i + 1] / 255, img.data[i + 2] / 255); if (h[0] < 40 || h[0] > 200) continue; px.push(h); }
      px.sort((a, b) => a[2] - b[2]); const lit = px.slice(px.length >> 1), shade = px.slice(0, px.length >> 2);
      const lh = circ(lit.map((x) => x[0])), ls = mean(lit.map((x) => x[1])), sh = circ(shade.map((x) => x[0]));
      const good = lh >= 85 && lh <= 105 && ls >= 0.40 && ls <= 0.50 && sh <= 140; if (!good) bad.push(v);
      rows.push(`${v} lit h${f2(lh)} s${f3(ls)}, shade h${f2(sh)}`); }
    ok(`W2 lit lawn: lit half hue 85-105, sat 0.40-0.50; shade quarter hue <= 140 (green, not teal) in ${sets.map((s) => s[0]).join(' / ')} (${shots})`, sets.length >= 4 && !bad.length, (bad.length ? 'OUT: ' + bad.join(', ') + ' | ' : '') + rows.join('; ')); }
}
// W3. THE PAINTED SKY
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'arch-scene.js'), 'utf8'), FS = LC ? LC.SKY_FS : '';
  const noTex = !!FS && !/sampler(2D|Cube|3D)|texture(2D)?\s*\(/.test(FS);
  const puffs = /vec3 skyPuffs\(/.test(FS) && /floor\( p \)/.test(FS) && /exp\( K \* hg \)/.test(FS) && /log\( 1\.0 \+ acc \)/.test(FS) && /fwidth\(/.test(FS);
  const sea = /uSea\.z/.test(FS) && /cameraPosition\.y - uSea\.z/.test(FS) && /uLow/.test(FS) && /uScreenTint/.test(FS);
  ok('W3a the painted sky shader is procedural + texture-free: puff-union clouds (jittered cells, log-sum-exp, gradient normals, fwidth AA), a cloud sea on a world plane, low-detail switch, the gameplay screen tint',
    noTex && puffs && sea, LC ? `no texture ${noTex}, puff union ${puffs}, sea / low / tint ${sea}` : 'no lib/look-core.mjs');
  const wired = /LC\.SKY_FS/.test(src) && /seaGroup\.visible = !painted/.test(src) && /driftGroup\.visible = !painted/.test(src) && /deckMesh\.visible = !painted/.test(src);
  const modes = ['Golden afternoon', 'Soft morning', 'Dusk'].every((n) => LP.presets[n].sky.mode === 'painted') && LP.presets['Game (current)'].sky.mode === 'screen';
  ok("W3b arch-scene.js draws the dome with it and hides the icosphere puffs + the deck in sky.mode 'painted'; the three moods are 'painted', Game (current) stays 'screen'", wired && modes, `wired ${wired}, modes ${modes}`);
}
// W4. THE CEL PATCH: exactly once, guarded, fallback
{
  if (!LC) ok('W4a cel patch on the r186 Lambert source: every anchor once, one band / shade / rim each', false, 'no lib/look-core.mjs');
  else {
    const r = LC.celPatchLambert(FX.meshlambert_fragment, FX.lights_lambert_pars_fragment), s = r.src, n = (x) => LC.countOf(s, x);
    const counts = { def: n('float celBand('), band: n('celBand( dot( geometryNormal, directLight.direction ) )'), shadeDef: n('vec3 celShade('), shade: n('celShade( irradiance )'), rimDef: n('float celRim('), rim: n('celRim( geometryNormal'), oldDot: n('saturate( dot( geometryNormal, directLight.direction ) )'), include: n('#include <lights_lambert_pars_fragment>') };
    ok(`W4a cel patch on three ${FX.three}'s Lambert source: applied; exactly one band / shade / rim definition and use; the include replaced once`, r.applied && Object.entries(counts).every(([k, v]) => (k === 'oldDot' || k === 'include' ? v === 0 : v === 1)), JSON.stringify(counts) + (r.misses.length ? ' misses ' + r.misses : ''));
    const miss1 = LC.celPatchLambert(FX.meshlambert_fragment, FX.lights_lambert_pars_fragment.replace('float dotNL = saturate( dot( geometryNormal, directLight.direction ) );', 'float dotNL = max( 0.0, dot( geometryNormal, directLight.direction ) );'));
    const miss2 = LC.celPatchLambert(FX.meshlambert_fragment.replace('#include <lights_lambert_pars_fragment>', '#include <lights_lambert_pars_fragment>\n#include <lights_lambert_pars_fragment>'), FX.lights_lambert_pars_fragment);
    const miss3 = LC.celPatchLambert(r.src, FX.lights_lambert_pars_fragment);
    const fb = [miss1, miss2, miss3].every((m, i) => !m.applied && m.src === [FX.meshlambert_fragment, FX.meshlambert_fragment.replace('#include <lights_lambert_pars_fragment>', '#include <lights_lambert_pars_fragment>\n#include <lights_lambert_pars_fragment>'), r.src][i] && m.misses.length > 0);
    ok('W4b guarded: a missing anchor, a doubled anchor and a second application each return the shader UNCHANGED (plain Lambert) with the misses listed', fb,
      `missing dotNL -> ${miss1.applied ? 'APPLIED' : 'fallback'} [${miss1.misses}]; doubled include -> ${miss2.applied ? 'APPLIED' : 'fallback'} [${miss2.misses}]; re-patch -> ${miss3.applied ? 'APPLIED' : 'fallback'} [${miss3.misses}]`);
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'arch-scene.js'), 'utf8');
    const chain = /function addPatch\(m, key, fn\)/.test(src) && /addPatch\(m, 'cel'/.test(src) && !/\.onBeforeCompile = \(sh\)/.test(src) && /customProgramCacheKey = \(\) => list\.map/.test(src);
    ok('W4c arch-scene.js chains every shader patch through addPatch (no material.onBeforeCompile overwritten; one cache key per patch list); cel is one of them', chain, `chained ${chain}`);
  }
}
// W5. TIME OF DAY
{
  if (!LC || !LC.presetAtHour) ok('W5 hour blend at 12 h between the 8.5 h and 16.5 h keyframes', false, 'no lib/look-core.mjs presetAtHour');
  else {
    const M = LP.presets['Soft morning'], Ga = LP.presets['Golden afternoon'], P12 = LC.presetAtHour(LP, 12).preset;
    const lumL = (h) => LC.lumaOf(LC.hexToLinear(h)), btw = (x, a, b) => x >= Math.min(a, b) - 1e-9 && x <= Math.max(a, b) + 1e-9;
    const el = btw(P12.sun.elevationDeg, M.sun.elevationDeg, Ga.sun.elevationDeg) && P12.sun.elevationDeg !== M.sun.elevationDeg && P12.sun.elevationDeg !== Ga.sun.elevationDeg;
    const zl = LC.hexToLinear(P12.sky.zenith), zm = LC.hexToLinear(M.sky.zenith), zg = LC.hexToLinear(Ga.sky.zenith);
    const zen = btw(lumL(P12.sky.zenith), lumL(M.sky.zenith), lumL(Ga.sky.zenith)) && zl.every((v, i) => btw(v, zm[i], zg[i]) || Math.abs(v - zm[i]) < 2e-3 || Math.abs(v - zg[i]) < 2e-3);
    ok(`W5a hour 12: sun elevation (${f2(P12.sun.elevationDeg)}) and sky zenith (${P12.sky.zenith}) lie between Soft morning @ ${M.hour} h (${M.sun.elevationDeg}, ${M.sky.zenith}) and Golden afternoon @ ${Ga.hour} h (${Ga.sun.elevationDeg}, ${Ga.sky.zenith})`,
      el && zen, `elevation between ${el}, zenith between (linear luma + channels) ${zen}`);
    const P165 = LC.presetAtHour(LP, 16.5).preset, strip = (p) => { const q = JSON.parse(JSON.stringify(p)); delete q.description; delete q.hour; delete q.phase; delete q.status; return JSON.stringify(q); };
    const az = P12.sun.azimuthDeg, short = Math.abs(az) > 90;   // 70 -> -115: the shorter arc runs through +/-180
    const wrap = LC.presetAtHour(LP, 2).preset, wrapOk = btw(wrap.sun.elevationDeg, LP.presets.Dusk.sun.elevationDeg, M.sun.elevationDeg);
    const errs = LS ? LS.validatePreset(P12, SCHEMA) : ['no look-save'];
    ok('W5b 16.5 h = Golden afternoon exactly; the azimuth takes the shorter arc (70 -> -115 via 180); 2 h blends Dusk -> Soft morning (wrap); the blended preset validates', strip(P165) === strip(Ga) && short && wrapOk && !errs.length,
      `16.5 h identical ${strip(P165) === strip(Ga)}; 12 h azimuth ${f2(az)}; 2 h elevation ${f2(wrap.sun.elevationDeg)}; schema ${errs.slice(0, 3).join('; ') || 'valid'}`);
  }
}
// W6. SEAM LIPS
{
  const LIP = new Set([TAG.seam, TAG.inner, TAG.cone]);
  const N = typeof GT.seamLipNormals === 'function' ? GT.seamLipNormals(bp) : null, angles = [];
  for (const id of bp.order) { const pc = bp.pieces[id], arr = N ? N[id] : pc.normals, FC = pc.faces, top = new Map();
    for (let t = 0; t < pc.faceCount; t++) if (pc.tags[t] === TAG.top) for (let q = 0; q < 3; q++) { const vi = FC[t * 3 + q], o = t * 9 + q * 3, a = top.get(vi) || [0, 0, 0]; a[0] += pc.normals[o]; a[1] += pc.normals[o + 1]; a[2] += pc.normals[o + 2]; top.set(vi, a); }
    for (let t = 0; t < pc.faceCount; t++) { if (!LIP.has(pc.tags[t])) continue;
      for (let q = 0; q < 3; q++) { const a = top.get(FC[t * 3 + q]); if (!a) continue; const l = Math.hypot(...a), o = t * 9 + q * 3, n = [arr[o], arr[o + 1], arr[o + 2]], ln = Math.hypot(...n) || 1;
        angles.push(Math.acos(Math.min(1, Math.max(-1, (a[0] * n[0] + a[1] * n[1] + a[2] * n[2]) / (l * ln)))) * 180 / Math.PI); } } }
  ok('W6a seam lips: every seam / inner / cone rim corner shares the parent top normal (<= 1 deg) [GT.seamLipNormals]', N && angles.length > 100 && Math.max(...angles) <= 1,
    `${angles.length} rim corners: max ${f2(Math.max(...angles))} deg, median ${f2(pctl(angles, 0.5))} deg${N ? '' : ' (no GT.seamLipNormals: the raw wall normals)'}`);
  const P = JSON.parse(JSON.stringify(G)); P.grass.seamMatch = true; const C = GT.paintBlueprint(bp, comp, P, L); let worst = 0, n = 0;
  for (const id of bp.order) { const pc = bp.pieces[id], FC = pc.faces, top = new Map(), col = C[id];
    for (let t = 0; t < pc.faceCount; t++) if (pc.tags[t] === TAG.top) for (let q = 0; q < 3; q++) { const vi = FC[t * 3 + q], o = t * 9 + q * 3, a = top.get(vi) || [0, 0, 0, 0]; a[0] += col[o]; a[1] += col[o + 1]; a[2] += col[o + 2]; a[3]++; top.set(vi, a); }
    for (let t = 0; t < pc.faceCount; t++) { if (!LIP.has(pc.tags[t])) continue;
      for (let q = 0; q < 3; q++) { const a = top.get(FC[t * 3 + q]); if (!a) continue; const o = t * 9 + q * 3; n++; for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(col[o + k] - a[k] / a[3])); } } }
  ok('W6b with grass.seamMatch the paint gives every rim corner the top colour at that vertex (|d| <= 1e-6, linear); the moods enable it, Game (current) does not',
    n > 100 && worst <= 1e-6 && G.grass.seamMatch === true && LP.presets['Game (current)'].grass.seamMatch !== true, `${n} rim corners, max |d| ${worst.toExponential(2)}; Golden seamMatch ${G.grass.seamMatch}, Game ${LP.presets['Game (current)'].grass.seamMatch}`);
}
// W7. INVERSE TONE MAP (display-referred colours on the composite path)
{
  if (!LC) ok('W7 neutral(invNeutral(c)) = c', false, 'no lib/look-core.mjs');
  else { let worst = 0; const rng = GT.mulberry32(5);
    // every colour Neutral can PRODUCE (y = neutral(x) for scene-linear x up to 4, i.e. display values up to ~0.97) round-trips
    for (let k = 0; k < 4000; k++) { const x = [rng() ** 2 * 4, rng() ** 2 * 4, rng() ** 2 * 4], e = 0.8 + rng() * 0.6, y = LC.neutral(x, e), r = LC.neutral(LC.invNeutral(y, e), e); for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(r[i] - y[i])); }
    ok('W7 the composite path\'s inverse Neutral (closed form): neutral(invNeutral(y, e), e) = y within 2e-4 for 4000 displayable colours y = neutral(x), exposure 0.8-1.4', worst <= 2e-4, `max |d| ${worst.toExponential(2)}`); }
}
function report() {
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
  console.log('\n  WORLDSEED LOOK CORE CRITERIA (node)');
  console.log('  ' + '-'.repeat(100));
  for (const r of results) { if (!r.pass) fails++; console.log('  ' + (r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL') + '  ' + pad(r.name, 96) + '\n        ' + r.detail); }
  console.log('  ' + '-'.repeat(100)); console.log(`  ${results.length - fails}/${results.length} passed (${results.filter((r) => r.skip).length} skipped), ${fails} failed\n`);
}
report();
process.exit(results.every((r) => r.pass) ? 0 : 1);
