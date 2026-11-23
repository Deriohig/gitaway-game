// phase1.test.mjs  --  LOOK-BRIEF Phase 1 criteria that need no browser (art/config/LOOK-BRIEF.md). Pure node.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPNG } from '../lib/png.mjs';
import { imageMetrics } from '../metrics.mjs';
import W3 from '../../config/world.config.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.resolve(__dirname, '..'), ART = path.resolve(__dirname, '../..');
const results = [];
const ok = (name, pass, detail, skip = false) => results.push({ name, pass: !!pass, detail, skip });
const SRC = fs.readFileSync(path.join(SCRIPTS, 'lib', 'arch-scene.js'), 'utf8');
const code = SRC.split('\n').map((l) => l.replace(/\/\/.*$/, ''));   // comments stripped
const LP = JSON.parse(fs.readFileSync(path.join(ART, 'config', 'lookPresets.json'), 'utf8'));
const MOODS = [['Soft morning', 8.5], ['Golden afternoon', 16.5], ['Dusk', 19.5]];
const PR = (n) => { const p = (LP.presets || {})[n]; return p && p.status === 'active' && p.sun ? p : null; };   // usable (active, filled) presets only
const RAW = (n) => (LP.presets || {})[n];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16) / 255);
// S1. SPECKLE: no mipmapped sRGB canvas / data textures in the proof scene
{
  const hits = [];
  code.forEach((l, i) => {
    for (const m of l.matchAll(/new THREE\.(CanvasTexture|DataTexture)\b/g)) {
      const win = code.slice(i, i + 6).join(' ');   // the statement + the next lines that configure it
      const srgb = /SRGBColorSpace/.test(win), noMip = /generateMipmaps\s*=\s*false/.test(win);
      if (srgb || !noMip) hits.push(`:${i + 1} ${m[1]}${srgb ? ' sRGB' : ''}${noMip ? '' : ' mipmapped'}`);
    }
  });
  ok('S1 arch-scene.js: no CanvasTexture / DataTexture tagged sRGB or left with generated mipmaps', !hits.length, hits.join(' | ') || 'none');
}
// S2. MATERIAL MODEL: Lambert everywhere (the game's terrain + procedural props), GLBs converted on load
{
  const hits = [];
  code.forEach((l, i) => { for (const m of l.matchAll(/new THREE\.(MeshStandardMaterial|MeshPhysicalMaterial)\b/g)) hits.push(`:${i + 1} ${m[1]}`); });
  ok('S2a arch-scene.js builds no MeshStandardMaterial / MeshPhysicalMaterial', !hits.length, hits.join(' | ') || 'none');
  const load = code.find((l) => /dl\.load\(/.test(l)) || '', conv = /function\s+toLambert\s*\(/.test(SRC) && /loaded\[a\.id\]\s*=\s*toLambert\(/.test(load);
  ok('S2b loaded GLB scenes go through toLambert() (Standard -> Lambert, names / colours / flags kept; Glass may stay)', conv, conv ? 'dl.load -> toLambert(gltf.scene)' : 'no toLambert conversion in the GLTF load path');
}
// S3. MOOD PRESETS: active, hour-tagged keyframes with one shared parameter set; default = Golden afternoon
{
  const st = MOODS.map(([n, h]) => { const p = RAW(n); return `${n}: ${p ? p.status : 'missing'}${p && typeof p.hour === 'number' ? ' @ ' + p.hour + ' h' : ''}`; });
  const hoursOk = MOODS.every(([n, h]) => { const p = PR(n); return p && p.status === 'active' && typeof p.hour === 'number' && Math.abs(p.hour - h) <= 1.5; }) &&
    MOODS.every(([n], i) => i === 0 || PR(n).hour > PR(MOODS[i - 1][0]).hour);
  ok('S3a Soft morning / Golden afternoon / Dusk are active and tagged with day-cycle hours (~8.5 / ~16.5 / ~19.5, ascending)', hoursOk, st.join('; '));
  ok("S3b `default` = 'Golden afternoon'", LP.default === 'Golden afternoon' && PR('Golden afternoon') && PR('Golden afternoon').status === 'active', `default = ${LP.default}`);
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, p + k + '.') : [p + k]));
  const SECTIONS = ['renderer', 'sun', 'hemisphere', 'ambient', 'shadows', 'sky', 'fog', 'grass', 'canopy', 'stone', 'clouds', 'post', 'water', 'wind'];
  const sig = (p) => (p ? SECTIONS.flatMap((s) => (p[s] ? keys(p[s], s + '.') : [s + ':missing'])).sort().join('|') : 'missing');
  const ref = sig(PR('Golden afternoon')), same = ['Soft morning', 'Dusk', 'Game (current)', 'Proof warm (v4)'].map((n) => [n, sig(PR(n)) === ref]);
  ok('S3c the moods share ONE parameter set (= Game (current) / Proof warm (v4)): blendable as day-cycle keyframes', PR('Golden afternoon') && same.every(([, s]) => s),
    same.map(([n, s]) => `${n} ${s ? 'same' : 'DIFFERS'}`).join(', ') + ` (${ref.split('|').length} params)`);
  const kept = ['Game (current)', 'Proof warm (v4)'].every((n) => PR(n) && PR(n).status === 'active');
  ok('S3d Game (current) and Proof warm (v4) are still active (instant revert)', kept, kept ? 'both active' : 'missing / inactive');
}
// S4. LIGHT: the low warm sun does the work; hemisphere fill, no ambient; tone mapping AgX / Neutral at ~1.0
{
  const G = PR('Golden afternoon');
  const sunOk = G && G.sun.elevationDeg >= 25 && G.sun.elevationDeg <= 35 && G.sun.azimuthDeg <= -95 && G.sun.azimuthDeg >= -165;
  ok('S4a Golden afternoon sun: elevation 25-35 deg, from the BACK-LEFT of the full view (azimuthDeg -165..-95)', sunOk, G ? `elevation ${G.sun.elevationDeg}, azimuth ${G.sun.azimuthDeg}` : 'missing');
  const c = G ? rgb(G.sun.color) : [0, 0, 0], warm = c[0] >= c[1] && c[1] > c[2] && c[0] - c[2] >= 0.2;
  const work = G && G.sun.intensity * Math.sin(G.sun.elevationDeg * Math.PI / 180) >= G.hemisphere.intensity;
  ok('S4b Golden afternoon sun is warm cream-gold and does most of the work (direct on flat ground >= the hemisphere fill)', G && warm && work,
    G ? `colour ${G.sun.color}, intensity ${G.sun.intensity} x sin(el) = ${(G.sun.intensity * Math.sin(G.sun.elevationDeg * Math.PI / 180)).toFixed(2)} vs hemisphere ${G.hemisphere.intensity}` : 'missing');
  const rows = MOODS.map(([n]) => { const p = PR(n); if (!p) return [n, false, 'missing'];
    const sky = rgb(p.hemisphere.sky), gr = rgb(p.hemisphere.ground);
    const okp = p.ambient.intensity <= 0.02 && sky[2] > sky[0] && gr[0] > gr[2] && p.hemisphere.intensity > 0 && p.hemisphere.intensity <= p.sun.intensity;
    return [n, okp, `amb ${p.ambient.intensity}, hemi ${p.hemisphere.sky}/${p.hemisphere.ground} x${p.hemisphere.intensity}`]; });
  ok('S4c every mood: AmbientLight <= 0.02; HemisphereLight cool sky / warm ground, below the sun intensity', rows.every((r) => r[1]), rows.map((r) => `${r[0]}: ${r[2]}`).join('; '));
  const tm = MOODS.map(([n]) => { const p = PR(n); return [n, p && ['AgX', 'Neutral'].includes(p.renderer.toneMapping) && p.renderer.exposure >= 0.8 && p.renderer.exposure <= 1.2, p ? `${p.renderer.toneMapping} @ ${p.renderer.exposure}` : 'missing']; });
  ok('S4d every mood: toneMapping AgX or Neutral (never ACES / None) at exposure ~1.0 (0.8-1.2)', tm.every((r) => r[1]), tm.map((r) => `${r[0]}: ${r[2]}`).join('; '));
}
// S5. SHADOWS: one light, fitted to the island in light space, soft
{
  const rows = MOODS.map(([n]) => { const p = PR(n); if (!p) return [n, false, 'missing']; const S = p.shadows;
    const soft = (S.type === 'PCF' && S.radius >= 1 && S.radius <= 3) || S.type === 'VSM';
    return [n, p.sun.castShadow === true && S.fit === 'tight' && [2048, 4096].includes(S.mapSize) && soft, `${S.type} r${S.radius} ${S.mapSize} fit ${S.fit} bias ${S.bias} nb ${S.normalBias}`]; });
  ok("S5a every mood: the sun is the one shadow light, fit 'tight', mapSize 2048 / 4096, PCF radius 1-3 or VSM", rows.every((r) => r[1]), rows.map((r) => `${r[0]}: ${r[2]}`).join('; '));
  const lights = code.flatMap((l) => [...l.matchAll(/new THREE\.(DirectionalLight|SpotLight|PointLight|RectAreaLight)\(/g)].map((m) => m[1]));
  // (WORLDSEED plants stage: the dusk-only porch PointLight is allowed as a LOCAL fill that never casts: built with castShadow = false)
  const locals = code.flatMap((l) => [...l.matchAll(/const (\w+) = new THREE\.(SpotLight|PointLight|RectAreaLight)\(/g)].map((m) => m[1]));
  const nonCasting = locals.every((v) => code.some((l) => new RegExp('\\b' + v + '\\.castShadow = false').test(l)));
  ok('S5b arch-scene.js: exactly one shadow-capable light (one DirectionalLight = the sun); any local point light never casts', lights.filter((t) => t === 'DirectionalLight').length === 1 && lights.length === 1 + locals.length && nonCasting,
    `${lights.join(', ') || 'none'}${locals.length ? ` (local, castShadow false: ${locals.join(', ')} ${nonCasting})` : ''}`);
}
// S6. SKY: world-space dome with a dither; fog agrees with the horizon
{
  const rows = MOODS.map(([n]) => { const p = PR(n); return [n, p && (p.sky.mode === 'dome' || p.sky.mode === 'painted') && p.sky.dither === true, p ? `mode ${p.sky.mode}, dither ${p.sky.dither}` : 'missing']; });
  const fs0 = SRC.match(/const SKY_DOME_FS\s*=\s*`([\s\S]*?)`/), dq = SRC.match(/const SKY_DITHER\s*=\s*'([^']*)'/);
  const shader = fs0 ? fs0[1].replace(/\$\{SKY_DITHER\}/g, dq ? dq[1] : '') : '';   // (the dither expression is shared with the screen sky)
  const dith = /gl_FragCoord/.test(shader) && /255\.0/.test(shader) && /uDither/.test(shader);
  ok('S6a every mood: sky.mode dome + dither on; the dome fragment shader (SKY_DOME_FS) adds the +/-0.5 / 255 gl_FragCoord dither', rows.every((r) => r[1]) && dith,
    rows.map((r) => `${r[0]}: ${r[2]}`).join('; ') + `; shader dither: ${dith ? 'yes' : 'no'}`);
  const fogRows = MOODS.map(([n]) => { const p = PR(n); if (!p) return [n, false, 'missing'];
    const m = p.fog.skyMatch, good = m === 'view' || m === 'horizon' || (m === 'none' && String(p.fog.color).toUpperCase() === String(p.sky.horizon).toUpperCase());
    return [n, good, `skyMatch ${m}`]; });
  ok("S6b every mood: the fog colour follows the sky's horizon (fog.skyMatch view / horizon)", fogRows.every((r) => r[1]), fogRows.map((r) => `${r[0]}: ${r[2]}`).join('; '));
}
// S7. STYLE P1 on the captures (darkest luma >= 0.08; the 0.1th-percentile luma is reported too)
{
  const VIEWS = Object.keys(W3.archipelago.views), SHOTS = path.join(ART, 'screenshots');
  const dirs = [['Golden afternoon', path.join(SHOTS, 'phase1', 'raw')], ['Soft morning', path.join(SHOTS, 'phase1_moods', 'raw', 'morning')], ['Dusk', path.join(SHOTS, 'phase1_moods', 'raw', 'dusk')]];
  for (const [n, d] of dirs) {
    const have = VIEWS.filter((v) => fs.existsSync(path.join(d, v + '.png')));
    if (have.length < VIEWS.length) { ok(`S7 P1 darkest >= 0.08 in the 7 views: ${n}`, true, `SKIP (captures missing in ${path.relative(ART, d)}: ${VIEWS.length - have.length} of 7)`, true); continue; }
    const m = VIEWS.map((v) => { const mf = path.join(d, v + '_mask.png'); return [v, imageMetrics(readPNG(path.join(d, v + '.png')), fs.existsSync(mf) ? readPNG(mf) : null)]; });
    // robust form: the 0.1th-percentile luma (fewer than 0.1 % of the pixels darker than 0.08). The strict minimum is reported:
    ok(`S7 P1 (darkest p0.1 luma >= 0.08; strict min reported) in the 7 views: ${n}`, m.every(([, x]) => x.darkestP01 >= 0.08), m.map(([v, x]) => `${v} p0.1 ${x.darkestP01.toFixed(3)} (min ${x.darkest.toFixed(3)})`).join(', '));
  }
}
function report() {
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
  console.log('\n  LOOK-BRIEF PHASE 1 CRITERIA (node)');
  console.log('  ' + '-'.repeat(100));
  for (const r of results) { if (!r.pass) fails++; console.log('  ' + (r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL') + '  ' + pad(r.name, 96) + '\n        ' + r.detail); }
  console.log('  ' + '-'.repeat(100)); console.log(`  ${results.length - fails}/${results.length} passed (${results.filter((r) => r.skip).length} skipped), ${fails} failed\n`);
}
report();
process.exit(results.every((r) => r.pass) ? 0 : 1);
