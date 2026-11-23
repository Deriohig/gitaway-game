// lookpresets.test.mjs  --  Phase 0 of the Lighting, Colour & Atmosphere brief (art/config/LOOK-BRIEF.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import W3 from '../../config/world.config.mjs';
import L from '../../config/look.config.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(__dirname, '../../config'), SCRIPTS = path.resolve(__dirname, '..');
const A = W3.archipelago, DEG = Math.PI / 180;
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { __error: e.message }; } };
const LP = readJSON(path.join(CONFIG, 'lookPresets.json')), SCHEMA = readJSON(path.join(CONFIG, 'lookPresets.schema.json'));
const FX = readJSON(path.join(__dirname, 'fixtures', 'look.87c830a.json'));
const HEX = /^#[0-9A-Fa-f]{6}$/;
const upper = (s) => (typeof s === 'string' ? s.toUpperCase() : s);
// P1. SCHEMA
const SECTIONS = ['renderer', 'sun', 'hemisphere', 'ambient', 'shadows', 'sky', 'fog', 'grass', 'canopy', 'stone', 'cel', 'materials', 'clouds', 'post', 'water', 'wind'];   // (+ cel, materials: WORLDSEED look core)
function validate(node, spec, at, errs) {        // spec = { type: group, params } | leaf
  if (spec.type === 'group') {
    if (!node || typeof node !== 'object' || Array.isArray(node)) { errs.push(`${at}: missing group`); return; }
    for (const [k, s] of Object.entries(spec.params)) validate(node[k], s, at + '.' + k, errs);
    for (const k of Object.keys(node)) if (!(k in spec.params)) errs.push(`${at}.${k}: not in the schema`);
    return;
  }
  if (spec.type === 'color') { if (!HEX.test(node || '')) errs.push(`${at}: '${node}' is not #RRGGBB`); return; }
  if (spec.type === 'bool') { if (typeof node !== 'boolean') errs.push(`${at}: not a boolean`); return; }
  if (spec.type === 'enum') { if (!spec.options.includes(node)) errs.push(`${at}: '${node}' not in [${spec.options}]`); return; }
  if (spec.type === 'number' || spec.type === 'int') {
    if (typeof node !== 'number' || !Number.isFinite(node)) { errs.push(`${at}: not a number`); return; }
    if (node < spec.min || node > spec.max) errs.push(`${at}: ${node} outside [${spec.min}, ${spec.max}]`);
    if (spec.type === 'int' && !Number.isInteger(node)) errs.push(`${at}: not an integer`);
    return;
  }
  errs.push(`${at}: unknown schema type ${spec.type}`);
}
{
  const parsed = !LP.__error && !SCHEMA.__error;
  ok('P1a lookPresets.json + lookPresets.schema.json exist and parse', parsed, parsed ? `${Object.keys(LP.presets || {}).length} presets` : `${LP.__error || ''} ${SCHEMA.__error || ''}`);
  const S = (SCHEMA && SCHEMA.sections) || {}, missing = SECTIONS.filter((s) => !S[s]);
  ok('P1b the schema covers every Phase 0-5 section', parsed && !missing.length, `missing: ${missing.join(', ') || 'none'}`);
  const active = Object.entries((LP && LP.presets) || {}).filter(([, p]) => p.status === 'active'), errs = [];
  const ALL = [...new Set([...SECTIONS, ...Object.keys(S)])];   // the Phase 0-5 sections + any later schema section (plants stage: plants / farm / paths)
  for (const [name, p] of active) {
    for (const s of ALL) { if (!S[s]) continue; validate(p[s], { type: 'group', params: S[s].params }, `${name}.${s}`, errs); }
    for (const k of Object.keys(p)) if (!['status', 'description', 'phase', 'hour', ...ALL].includes(k)) errs.push(`${name}.${k}: unknown top-level key`);
    if ('hour' in p) validate(p.hour, (SCHEMA.preset && SCHEMA.preset.hour) || { type: 'number', min: 0, max: 24 }, `${name}.hour`, errs);   // day-cycle keyframe time
  }
  ok('P1c every active preset validates (all sections, #RRGGBB colours, numbers in range, enums)', parsed && active.length >= 1 && !errs.length, `${active.length} active; ${errs.slice(0, 6).join('; ') || 'no errors'}${errs.length > 6 ? ` (+${errs.length - 6})` : ''}`);
  const def = LP && LP.presets && LP.presets[LP.default];
  ok("P1d `default` names an active preset (Phase 1: 'Golden afternoon')", def && def.status === 'active' && LP.default === 'Golden afternoon', `default = ${LP && LP.default}`);
  const moods = ['Golden afternoon', 'Soft morning', 'Dusk'].map((n) => [n, LP && LP.presets && LP.presets[n]]);
  ok('P1e the mood presets are active, phase >= 1 (Phase 1 made them, Phase 2 extends them), with a day-cycle hour (keyframes)', moods.every(([, p]) => p && p.status === 'active' && p.phase >= 1 && typeof p.hour === 'number'),
    moods.map(([n, p]) => `${n}: ${p ? p.status + '/phase ' + p.phase + (typeof p.hour === 'number' ? ' @ ' + p.hour + ' h' : ' (no hour)') : 'missing'}`).join('; '));
}
// P2. GAME (CURRENT) == 87c830a
{
  const G = LP && LP.presets && LP.presets['Game (current)'], diffs = [], near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
  const eq = (label, got, want) => { if (upper(got) !== upper(want)) diffs.push(`${label}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`); };
  if (G && !FX.__error) {
    eq('renderer.toneMapping', G.renderer.toneMapping, FX.renderer.toneMapping); eq('renderer.exposure', G.renderer.exposure, FX.renderer.exposure);
    eq('sun.color', G.sun.color, FX.sun.color); eq('sun.intensity', G.sun.intensity, FX.sun.intensity); eq('sun.distance', G.sun.distance, FX.sun.distance); eq('sun.castShadow', G.sun.castShadow, true);
    // sun direction: elevation + azimuth relative to the `full` view's camera azimuth (bearing from +z toward +x)
    const full = A.views && A.views.full;
    if (full) { const b = (full.az + G.sun.azimuthDeg) * DEG, e = G.sun.elevationDeg * DEG, d = [Math.sin(b) * Math.cos(e), Math.sin(e), Math.cos(b) * Math.cos(e)];
      if (!d.every((v, i) => near(v, FX.sun.dir[i]))) diffs.push(`sun dir ${d.map((v) => v.toFixed(6))} != ${FX.sun.dir.map((v) => v.toFixed(6))}`); } else diffs.push('no views.full to resolve the sun azimuth');
    eq('hemisphere.sky', G.hemisphere.sky, FX.hemisphere.sky); eq('hemisphere.ground', G.hemisphere.ground, FX.hemisphere.ground); eq('hemisphere.intensity', G.hemisphere.intensity, FX.hemisphere.intensity);
    eq('ambient.color', G.ambient.color, FX.ambient.color); eq('ambient.intensity', G.ambient.intensity, FX.ambient.intensity);
    for (const k of ['type', 'mapSize', 'bias', 'normalBias', 'radius', 'near', 'farPad']) eq('shadows.' + k, G.shadows[k], FX.shadows[k]);
    eq('shadows.fit', G.shadows.fit, 'fixed'); eq('shadows.frustum.main', G.shadows.frustum.main, FX.shadows.frustum.main); eq('shadows.frustum.all', G.shadows.frustum.all, FX.shadows.frustum.all);
    eq('shadows.contact.color', G.shadows.contact.color, FX.shadows.contact.color); eq('shadows.contact.innerAlpha', G.shadows.contact.innerAlpha, FX.shadows.contact.innerAlpha);
    eq('sky.mode', G.sky.mode, 'screen'); for (const k of ['zenith', 'horizon', 'below']) eq('sky.' + k, G.sky[k], FX.sky[k]);
    for (const k of ['below', 'horizon', 'zenith']) eq('sky.stops.' + k, G.sky.stops[k], FX.sky.stops[k]);
    for (const k of ['type', 'color', 'nearOffset', 'farOffset', 'anchor']) eq('fog.' + k, G.fog[k], FX.fog[k]);
    for (const k of ['color', 'colorScale', 'emissive', 'emissiveIntensity']) eq('clouds.' + k, G.clouds[k], FX.clouds[k]);
    for (const k of ['color', 'fogMix', 'opacity']) eq('clouds.deck.' + k, G.clouds.deck[k], FX.clouds.deck[k]);
    for (const k of ['shallow', 'deep', 'foam']) eq('water.' + k, G.water[k], FX.water[k]);
    for (const k of Object.keys(FX.wind.grassSway)) eq('wind.grassSway.' + k, G.wind.grassSway[k], FX.wind.grassSway[k]);
    if (!near(G.wind.clouds.seaSpin, FX.wind.seaSpin, 1e-15)) diffs.push(`wind.clouds.seaSpin ${G.wind.clouds.seaSpin} != ${FX.wind.seaSpin}`);
    eq('wind.clouds.driftAmp', G.wind.clouds.driftAmp, FX.wind.driftAmp); eq('wind.clouds.driftSpeed', G.wind.clouds.driftSpeed, FX.wind.driftSpeed);
    // every later-phase effect is OFF in the parity preset
    const on = []; const walk = (o, p) => { for (const [k, v] of Object.entries(o || {})) { if (k === 'enabled' && v === true) on.push(p); else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p + '.' + k); } };
    for (const s of ['grass', 'canopy', 'stone', 'post']) walk(G[s], s); walk(G.clouds.lit, 'clouds.lit'); walk(G.fog.height, 'fog.height'); walk(G.wind.shared, 'wind.shared');
    if (on.length) diffs.push('later-phase effects enabled: ' + on.join(', '));
  }
  ok('P2a Game (current) == the 87c830a render values (game light @ 13h, NoToneMapping, sky, fog, shadows, clouds, water)', G && !FX.__error && !diffs.length,
    G ? (diffs.slice(0, 5).join('; ') || 'all equal') : 'no Game (current) preset');
  const DC = LP && LP.dayCycle, dcOk = DC && JSON.stringify(DC.keys) === JSON.stringify(FX.dayCycle.keys) && JSON.stringify(DC.night) === JSON.stringify(FX.dayCycle.night) && DC.sunDistance === FX.dayCycle.sunDistance;
  ok('P2b dayCycle (skyPalette.ts KEYS, the Game (current) source data) is verbatim', dcOk, dcOk ? `${DC.keys.length} keys` : 'missing or differs');
  // the old ?light=proof look survives as a preset with the 87c830a look.config proof values
  const PW = LP && LP.presets && LP.presets['Proof warm (v4)'], pd = [];
  if (PW) { const F = FX.proofLight;
    const e2 = (l, g, w) => { if (upper(g) !== upper(w)) pd.push(`${l} ${g} != ${w}`); };
    e2('sun.color', PW.sun.color, F.sun.color); e2('sun.intensity', PW.sun.intensity, F.sun.intensity); e2('sun.elevationDeg', PW.sun.elevationDeg, F.sun.elevationDeg);
    if (A.views && A.views.full && Math.abs(A.views.full.az + PW.sun.azimuthDeg - F.sun.azimuthDeg) > 1e-9) pd.push('sun azimuth (world) != ' + F.sun.azimuthDeg);
    for (const s of ['hemisphere', 'ambient', 'sky', 'fog', 'clouds']) for (const [k, v] of Object.entries(F[s])) e2(`${s}.${k}`, PW[s][k], v); }
  ok('P2c Proof warm (v4) == the 87c830a ?light=proof values', PW && !pd.length, PW ? (pd.join('; ') || 'all equal') : 'missing');
}
// P3. NO LITERAL LOOK VALUES IN THE SCENE CODE (practical source scan of arch-scene.js)
{
  const src = fs.readFileSync(path.join(SCRIPTS, 'lib', 'arch-scene.js'), 'utf8');
  const lines = src.split('\n'), hits = [];
  const exempt = (l) => /look-scan:\s*allow/.test(l);   // e.g. debug-overlay / measurement-mask colours (never part of the look)
  lines.forEach((l, i) => {
    if (exempt(l)) return;
    const code = l.replace(/\/\/.*$/, '');
    for (const m of code.matchAll(/new THREE\.(\w*Light)\(([^)]*)\)/g)) if (m[2].trim()) hits.push(`:${i + 1} new THREE.${m[1]}(${m[2]})`);
    if (/(['"`])#[0-9A-Fa-f]{6}\1|\b0x[0-9A-Fa-f]{6}\b/.test(code)) hits.push(`:${i + 1} colour literal: ${code.trim().slice(0, 70)}`);
    if (/\b(i|emissiveI)ntensity\s*[:=]\s*-?\d/i.test(code)) hits.push(`:${i + 1} intensity literal: ${code.trim().slice(0, 70)}`);
    if (/shadow\.(bias|normalBias|radius)\s*=\s*-?\d/.test(code) || /mapSize\.set\(\s*\d/.test(code)) hits.push(`:${i + 1} shadow literal: ${code.trim().slice(0, 70)}`);
    if (/new THREE\.Fog(Exp2)?\([^)]*\d/.test(code) || /fog\.(near|far|density)\s*=\s*\d/.test(code)) hits.push(`:${i + 1} fog literal: ${code.trim().slice(0, 70)}`);
    if (/toneMapping(Exposure)?\s*=\s*(\d|THREE\.\w+ToneMapping\b)/.test(code) && !/TONE\[/.test(code)) hits.push(`:${i + 1} tone-mapping literal: ${code.trim().slice(0, 70)}`);
    if (/shadowMap\.type\s*=\s*THREE\./.test(code)) hits.push(`:${i + 1} shadow-type literal: ${code.trim().slice(0, 70)}`);
  });
  ok('P3a arch-scene.js: no light built with literal args, no literal colour / intensity / shadow / fog / tone-mapping value', !hits.length, hits.slice(0, 6).join(' | ') || 'clean');
  const reads = ['__LOOK_PRESETS__', "QS.get('look')", '__frameStats'].filter((s) => !src.includes(s));
  ok('P3b the scene reads window.__LOOK_PRESETS__, honours ?look=, exposes window.__frameStats', !reads.length, `missing: ${reads.join(', ') || 'none'}`);
}
// P4. THE 7 FIXED VIEWS
{
  const V = A.views || {}, want = ['full', 'farm', 'lake', 'waterfall', 'junction', 'woodland', 'edge'], bad = [];
  for (const n of want) { const c = V[n];
    if (!c) { bad.push(n + ' missing'); continue; }
    if (!(typeof c.az === 'number' && typeof c.el === 'number' && typeof c.dist === 'number' && Array.isArray(c.tgt) && c.tgt.length === 3)) bad.push(n + ' camera');
    if (c.w !== 1600 || c.h !== 900) bad.push(`${n} ${c.w}x${c.h}`);
    if (c.mode !== 'photo') bad.push(n + ' mode ' + c.mode);
    if (c.unlocked && c.unlocked !== 'all') bad.push(n + ' not fully unlocked'); }
  const extra = Object.keys(V).filter((n) => !want.includes(n));
  ok('P4 the 7 comparison views exist in world.config archipelago.views (photo, 1600x900, all unlocked)', !bad.length && !extra.length, `${bad.join(', ') || 'all 7 ok'}${extra.length ? '; extra: ' + extra : ''}`);
}
// P5. THE PROOF LOADS three 0.186.1 (+ lil-gui pinned) AND INLINES lookPresets.json
{
  let html = '';
  try { const { viewerHtml } = await import('../lib/viewer.mjs'); html = viewerHtml({ assets: [] }, L, {}, '', W3, '', '', { lookPresets: LP, lookSchema: SCHEMA, panelSource: '' }); } catch (e) { html = 'ERR ' + e.message; }
  const threes = [...html.matchAll(/three@([0-9.]+)/g)].map((m) => m[1]), lil = [...html.matchAll(/lil-gui@([0-9.]+)/g)].map((m) => m[1]);
  ok('P5a importmap: three@0.186.1 (build + examples/jsm), no other three version', threes.length >= 2 && threes.every((v) => v === '0.186.1') &&
    html.includes('https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js') && html.includes('https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/'), `three versions: ${[...new Set(threes)].join(', ') || 'none'}`);
  ok('P5b lil-gui pinned to an exact version on cdn.jsdelivr.net/npm', lil.length >= 1 && lil.every((v) => /^\d+\.\d+\.\d+$/.test(v)) && html.includes('https://cdn.jsdelivr.net/npm/lil-gui@'), `lil-gui: ${[...new Set(lil)].join(', ') || 'none'}`);
  ok('P5c the page inlines lookPresets.json (+ schema) as window.__LOOK_PRESETS__ / __LOOK_SCHEMA__', html.includes('window.__LOOK_PRESETS__ = {') && html.includes('window.__LOOK_SCHEMA__ = {') && html.includes('"Game (current)"'), html.startsWith('ERR') ? html : 'checked');
}
// P6 (water revamp W9, art/specs/2026-10-23-water-revamp-design.md 4.1): the water keys are wired; the water section is identical
{
  const { PALETTES } = await import('../lib/water-core.mjs');
  const P = Object.entries((LP && LP.presets) || {}).filter(([, p]) => p.water), strip = (w) => { const c = JSON.parse(JSON.stringify(w)); delete c.bakedDepth; return JSON.stringify(c); };
  const ref = P.length ? strip(P[0][1].water) : '', odd = P.filter(([, p]) => strip(p.water) !== ref).map(([n]) => n);
  const bd = P.map(([n, p]) => `${n}=${p.water.bakedDepth}`), bdOk = P.every(([n, p]) => p.water.bakedDepth === (n !== 'Game (current)'));
  ok('P6a (W9) the water section is identical in every mood; bakedDepth true everywhere but `Game (current)` (false: the revert)', P.length >= 5 && !odd.length && bdOk, `${odd.length ? 'differ: ' + odd.join(', ') + '; ' : ''}${bd.join(', ')}`);
  const WS = (SCHEMA.sections && SCHEMA.sections.water && SCHEMA.sections.water.params) || {}, want = ['bakedDepth', 'bands', 'bandSoft', 'shoreBand', 'foamLine', 'normalSpeed', 'glint', 'caustics', 'riverFlowSpeed', 'fallStreakSpeed', 'fallMist', 'skyMix', 'bodies'];
  const allWired = (s) => (s.type === 'group' ? Object.values(s.params).every(allWired) : s.wired === true);
  const unwired = want.filter((k) => !WS[k] || !allWired(WS[k])), gone = ['shallowDepth', 'deepDepth'].filter((k) => WS[k]);
  ok('P6b (W9) the schema marks the water keys wired (bands, bandSoft, bodies.* new; shallowDepth / deepDepth replaced)', !unwired.length && !gone.length, `unwired: ${unwired.join(', ') || 'none'}; still there: ${gone.join(', ') || 'none'}`);
  const w = (P.find(([n]) => n === LP.default) || P[0] || [, {}])[1].water || {}, exp = { bandSoft: 0.015, shoreBand: 0.35, foamLine: 0.5, normalSpeed: 0.3, glint: 0.6, caustics: 0.35, riverFlowSpeed: 1, fallStreakSpeed: 1.2, fallMist: true, skyMix: 0.25 };
  const vbad = Object.entries(exp).filter(([k, v]) => w[k] !== v).map(([k, v]) => `${k} ${w[k]} != ${v}`);
  if (!w.bands || w.bands.shallow !== 0.08 || w.bands.deep !== 0.22) vbad.push('bands != 0.08 / 0.22');
  const norm = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, upper(v)])));
  const pal = Object.entries(PALETTES).filter(([b, c]) => !w.bodies || norm(w.bodies[b]) !== norm(c)).map(([b]) => b);
  ok('P6c (W9) the revamp values (section 4.1 table) and water.bodies = water-core PALETTES (section 3.3)', !vbad.length && !pal.length, `${vbad.join('; ') || 'values ok'}; palettes ${pal.length ? 'differ: ' + pal.join(', ') : 'match'}`);
  // P6d (review I3): the wired keys are read. A panel edit of water.bodies.<b>.<k> reaches that body's material uniform (the proof
  const WCm = await import('../lib/water-core.mjs'), wj = { palettes: PALETTES }, det = [];
  let p6d = typeof WCm.bodyColours === 'function';
  if (p6d) {
    const edited = JSON.parse(JSON.stringify(w)); edited.bodies.lake.deep = '#123456';
    const got = WCm.bodyColours(edited, wj, 'lake'), fb = WCm.bodyColours({}, wj, 'lake'), fb2 = WCm.bodyColours({ bodies: {} }, wj, 'pond');
    const okE = got.deep === '#123456' && got.mid === PALETTES.lake.mid, okF = fb.deep === PALETTES.lake.deep && fb2.deep === PALETTES.pond.deep;
    det.push(`panel edit reaches the resolver ${okE}, water.json fallback ${okF}`); p6d = okE && okF;
  } else det.push('water-core bodyColours missing');
  const asrc = fs.readFileSync(path.join(SCRIPTS, 'lib', 'arch-scene.js'), 'utf8'), fnAt = asrc.indexOf('function waterV2Uniforms'), fn = fnAt >= 0 ? asrc.slice(fnAt, asrc.indexOf('\n  }\n', fnAt)) : '';
  const perFrame = /bodyColours\(\s*Wp\s*,/.test(fn) && ['uShallow', 'uMid', 'uDeep', 'uFoamCol', 'uBed'].every((u) => new RegExp(u + '\\.value\\.set\\(').test(fn));
  const modeFromPreset = /WATER_MODE\s*=[^;]*bakedDepth/.test(asrc) && /QS\.get\('water'\)\s*[!=]==\s*'legacy'/.test(asrc);
  det.push(`waterV2Uniforms sets the 5 colour uniforms from bodyColours(Wp, ..) ${perFrame}; WATER_MODE from bakedDepth with ?water= override ${modeFromPreset}`);
  ok('P6d (W9, review I3) panel body colours reach the material uniforms every frame; bakedDepth picks v2 by default', p6d && perFrame && modeFromPreset, det.join('; '));
}
function report() {
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
  console.log('\n  LOOK PRESETS / PHASE 0 CRITERIA');
  console.log('  ' + '-'.repeat(100));
  for (const r of results) { if (!r.pass) fails++; console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + pad(r.name, 96) + '\n        ' + r.detail); }
  console.log('  ' + '-'.repeat(100)); console.log(`  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
}
report();
process.exit(results.every((r) => r.pass) ? 0 : 1);
