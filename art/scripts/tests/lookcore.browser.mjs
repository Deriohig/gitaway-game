// lookcore.browser.mjs  --  WORLDSEED-BRIEF look-core RUNTIME criteria on the live proof page (headless Chromium, SwiftShader).
// =============================================================================
// Usage:  node tests/lookcore.browser.mjs [--page index.html] [--port 8187]
// Same harness as phase1/phase2.browser.mjs (three's __THREE_DEVTOOLS__ 'observe' + Scene.onBeforeRender, accepting the composite's
// own scene target), so it runs against an older build (--page index_609.html) for the red evidence.
//   K1 sky        Golden afternoon: the dome is visible with uPainted = 1 and its compiled program has NO sampler uniform (procedural,
//                 texture-free); no icosphere cloud puff and no deck disc is visible (traverseVisible); Game (current): the puffs
//                 and the screen-space quad are back (painted off)
//   K2 cel        every opaque Lambert material in the scene compiled the cel patch EXACTLY ONCE (one celBand definition, one
//                 banded N.L) and nothing fell back; a material whose anchor is doubled gets plain Lambert (the guard refuses, the
//                 program compiles, a frame renders without GL errors)
//   K3 composite  Golden afternoon (high tier): composite on, scene target HalfFloat + 4x MSAA + DepthTexture, the composite
//                 material is toneMapped:false, the scene's programs compiled for the target carry no TONE_MAPPING define (three
//                 never tone-maps into a non-XR target) -> tone mapping happens once, in the composite; and BEHAVIOURALLY: with
//                 ink / bloom / grade / vignette / dither off, the composite frame equals the plain-path frame (mean |d| <= 1.0 /
//                 255, no channel bias, p99 <= 16: transparent layers blend in linear vs sRGB) - a simulated second tone map +
//                 encode (control) moves every pixel by several times that
//   K4 effects    ink on vs off and bloom on vs off change pixels (farm / full); bloom never makes the GRASS glow: no ground-mask pixel
//                 is a bloom source (display luma below the knee start), and every grass pixel farther than the chain's reach (72 px)
//                 from a source is bit-identical with bloom off (the bloom of a non-source is exactly 0)
//   K5 low tier   ?quality=low: no composite (no post passes, the plain path; renderer tone mapping = the preset's Neutral)
//   K6 time       __look.atHour(12): sun elevation and sky zenith between the 8.5 h and 16.5 h keyframes; setHour(12) applies it;
//                 ?hour=12 loads the same blend
//   K7 albedo     materials.minAlbedo: with it on no GLB material is darker (luma) than the minimum; Game (current) restores the
//                 authored colours
// Headless SwiftShader: fine for structure and colours, never for timing.
// =============================================================================
import { requirePlaywright } from '../lib/playwright.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import W3 from '../../config/world.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LP = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config/lookPresets.json'), 'utf8'));
const A = W3.archipelago;
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

function loadPlaywright() { return requirePlaywright(); }   // lib/playwright.mjs: PLAYWRIGHT_ROOT, the repo root, the main checkout
async function serverUp(port) { try { return (await fetch(`http://127.0.0.1:${port}/__shots`)).ok; } catch { return false; } }
function pageInit() {
  const t = new EventTarget(); window.__THREE_DEVTOOLS__ = t; window.__t = { scenes: [] };
  t.addEventListener('observe', (e) => { const o = e.detail; if (o && o.isScene) { window.__t.scenes.push(o);
    const prev = o.onBeforeRender; o.onBeforeRender = function (renderer, scene, camera, rt) { if ((!rt || rt.isGitawayComposite) && camera.isPerspectiveCamera) { window.__t.renderer = renderer; window.__t.camera = camera; } return prev.apply(this, arguments); }; } });
}

// ---- in-page probes ----
function inspectSky() {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), R = T.renderer, gl = R.getContext();
  let dome = null, quad = null; scene.traverse((o) => { if (o.isMesh && o.material && o.material.isShaderMaterial) { if (o.geometry.type === 'SphereGeometry' && o.material.side === 1) dome = o; else if (o.geometry.type === 'PlaneGeometry' && o.renderOrder === -100) quad = o; } });
  const vis = (o) => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };
  let samplers = null; if (dome) { const mp = R.properties.get(dome.material), prog = mp && mp.currentProgram && mp.currentProgram.program;
    if (prog) { samplers = 0; const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(prog, i); if ([gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_3D, gl.SAMPLER_2D_ARRAY].includes(u.type)) samplers++; } } }
  let puffs = 0, deck = false; scene.traverse((o) => { if (o.isInstancedMesh && o.geometry.type === 'IcosahedronGeometry' && o.geometry.parameters.radius === 1 && o.geometry.parameters.detail === 2 && vis(o) && o.count > 0) puffs += o.count; if (o.name === 'cloudDeck' && vis(o)) deck = true; });
  return { dome: !!dome, domeVisible: dome ? vis(dome) : false, painted: dome && dome.material.uniforms.uPainted ? dome.material.uniforms.uPainted.value : null, samplers, puffs, deck, quadVisible: quad ? vis(quad) : null };
}
function inspectCel() {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), R = T.renderer, gl = R.getContext(), seen = new Set(), rows = [];
  scene.traverse((o) => { if (!o.isMesh || !o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
    if (!m.isMeshLambertMaterial || seen.has(m) || m.userData.celKind === 'none') continue; seen.add(m);
    const mp = R.properties.get(m), prog = mp && mp.currentProgram && mp.currentProgram.program; if (!prog) { rows.push({ name: m.name, compiled: false }); continue; }
    const fs = gl.getAttachedShaders(prog).map((s) => [gl.getShaderParameter(s, gl.SHADER_TYPE), gl.getShaderSource(s)]).find(([t]) => t === gl.FRAGMENT_SHADER)[1];
    const cnt = (x) => fs.split(x).length - 1; rows.push({ name: m.name || m.type, kind: m.userData.celKind, compiled: true, def: cnt('float celBand('), use: cnt('celBand( dot( geometryNormal, directLight.direction ) )'), shade: cnt('celShade( irradiance )') }); } });
  return { rows, core: window.__lookCore ? window.__lookCore.cel : null };
}
function celFallbackProbe() {   // a material whose anchor is doubled: the guard must refuse and the program must still compile
  const T = window.__t, R = T.renderer, scene0 = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), LC = window.__LOOK_CORE__;
  let Lam = null, Mesh = null; scene0.traverse((o) => { if (!Lam && o.material && o.material.isMeshLambertMaterial) Lam = o.material.constructor; if (!Mesh && o.isMesh && !o.isInstancedMesh) Mesh = o.constructor; });
  const Sc = scene0.constructor;
  if (!LC || !Lam) return { ok: false, why: !LC ? 'no window.__LOOK_CORE__' : 'no Lambert' };
  // (the same call the scene's cel patch makes, on a material that already customised its Lambert chunk the way the cloud material
  //  does - the include is expanded with a wrapped N.L - so the anchor is gone; three r186's chunk = the test fixture)
  const CH = window.__THREE_CHUNK__ || '';
  let res = null; const m = new Lam(); m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_lambert_pars_fragment>', CH.replace('saturate( dot( geometryNormal, directLight.direction ) )', 'saturate( 0.5 + 0.5 * dot( geometryNormal, directLight.direction ) )'));
    res = LC.celPatchLambert(sh.fragmentShader, CH); if (res.applied) sh.fragmentShader = res.src; };
  m.customProgramCacheKey = () => 'celFallbackProbe';
  const s = new Sc(), g = scene0.getObjectByName('island:main').geometry, mesh = new Mesh(g, m); s.add(mesh);
  const gl = R.getContext(); while (gl.getError() !== gl.NO_ERROR) { /* drain */ }
  R.render(s, T.camera); const err = gl.getError(), mp = R.properties.get(m), prog = mp && mp.currentProgram;
  return { ok: true, applied: res ? res.applied : null, misses: res ? res.misses : null, glError: err, programValid: !!(prog && prog.program && gl.getProgramParameter(prog.program, gl.LINK_STATUS)) };
}
function compositeState() {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), R = T.renderer, gl = R.getContext();
  const LCo = window.__lookCore; if (!LCo) return { core: false };
  const PG = window.__pieceGroups, m = PG.main.mesh.material, mp = R.properties.get(m), prog = mp && mp.currentProgram && mp.currentProgram.program;
  const fsrc = prog ? gl.getAttachedShaders(prog).map((s) => gl.getShaderSource(s)).join('\n') : '';
  return { core: true, c: LCo.composite, info: LCo.info, islandProgramToneMapping: /#define TONE_MAPPING/.test(fsrc), islandOutputLinear: /LinearTransferOETF|return value;/.test(fsrc.split('linearToOutputTexel')[1] || ''), rendererTM: R.toneMapping };
}
async function shotDiff(cfg) {   // render a view twice with two preset edits; compare (optionally on a mask class)
  const setPath = (o, p, v) => { const k = p.split('.'); let x = o; for (let i = 0; i < k.length - 1; i++) x = x[k[i]] = x[k[i]] || {}; x[k[k.length - 1]] = v; };
  const base = JSON.parse(JSON.stringify(window.__look.preset)), dec = async (url) => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
  const run = async (edits) => { const p = JSON.parse(JSON.stringify(base)); for (const [k, v] of Object.entries(edits)) setPath(p, k, v); window.__look.apply(p, true); const r = window.__viewShot(cfg.view, { mask: !!cfg.mask }); return { px: await dec(r.url), mask: r.mask ? await dec(r.mask) : null }; };
  const a = await run(cfg.a), b = await run(cfg.b); window.__look.apply(base, true);
  const W = a.mask ? Math.round(Math.sqrt(a.px.length / 4 * 16 / 9)) : 0, lumA = (px, i) => (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
  // bloom sources (cfg.srcLuma): grass pixels of frame b (bloom off) at or above the bloom start luma are counted (must be none);
  // for the distance map every non-sky pixel within 0.06 of it counts (the prefilter sees the colour before the grade / vignette)
  let near = null, srcGround = 0;
  if (cfg.srcLuma != null && a.mask) { const H = a.px.length / 4 / W, R = cfg.radius, src = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < a.px.length; i += 4, p++) { const M = a.mask, bg = !(M[i] > 127 || M[i + 1] > 127 || M[i + 2] > 127), y = lumA(b.px, i);
      if (!bg && y >= cfg.srcLuma - 0.06) src[p] = 1; if (y >= cfg.srcLuma && M[i + 1] > 127 && M[i] <= 127 && M[i + 2] <= 127) srcGround++; }
    near = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (src[y * W + x]) for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) near[Y * W + X] = 1; } }
  let n = 0, changed = 0, sum = 0, ident = 0, within2 = 0, bias = [0, 0, 0], far = 0, farIdent = 0; const ds = [];
  for (let i = 0, p = 0; i < a.px.length; i += 4, p++) { const M = a.mask; if (cfg.mask && !(M[i + 1] > 127 && M[i] <= 127 && M[i + 2] <= 127)) continue;
    const d = Math.max(Math.abs(a.px[i] - b.px[i]), Math.abs(a.px[i + 1] - b.px[i + 1]), Math.abs(a.px[i + 2] - b.px[i + 2])); n++; sum += (Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2])) / 3;
    for (let k = 0; k < 3; k++) bias[k] += a.px[i + k] - b.px[i + k];
    if (d) changed++; else ident++; if (d <= 2) within2++; if (n % 7 === 0) ds.push(d);
    if (near && !near[p]) { far++; if (!d) farIdent++; } }
  ds.sort((x, y) => x - y);
  // control: what a SECOND Neutral tone map + sRGB encode would do to frame b (decode sRGB -> linear -> Neutral -> encode)
  let control = null; if (cfg.control && window.__LOOK_CORE__) { const LCm = window.__LOOK_CORE__, dec = (v) => LCm.srgbToLinear(v / 255), enc = (v) => Math.round(LCm.linearToSrgb(Math.min(1, Math.max(0, v))) * 255); let s = 0, m = 0;
    for (let i = 0; i < b.px.length; i += 4 * 13) { const c = LCm.neutral([dec(b.px[i]), dec(b.px[i + 1]), dec(b.px[i + 2])], cfg.exposure || 1); s += (Math.abs(enc(c[0]) - b.px[i]) + Math.abs(enc(c[1]) - b.px[i + 1]) + Math.abs(enc(c[2]) - b.px[i + 2])) / 3; m++; } control = s / m; }
  return { n, changedShare: changed / Math.max(1, n), identShare: ident / Math.max(1, n), within2Share: within2 / Math.max(1, n), mean: sum / Math.max(1, n), bias: bias.map((v) => v / Math.max(1, n)),
    p99: ds[Math.floor(ds.length * 0.99)] || 0, max: ds[ds.length - 1] || 0, control, far, farIdentShare: far ? farIdent / far : null, srcGround };
}
function albedoState() {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), seen = new Set(), out = [];
  scene.traverse((o) => { if (!o.isMesh || !o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (seen.has(m) || !m.userData || !m.userData.fromStandard) continue; seen.add(m);
    out.push({ name: m.name, luma: 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b }); } });
  return out;
}

async function main() {
  const a = process.argv.slice(2);
  let page0 = 'index.html', port = 8187;
  for (let i = 0; i < a.length; i++) { if (a[i] === '--page') page0 = a[++i]; else if (a[i] === '--port') port = +a[++i]; }
  let child = null;
  if (!(await serverUp(port))) { child = spawn(process.execPath, [path.resolve(__dirname, '../shots.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await serverUp(port)); i++) await new Promise((r) => setTimeout(r, 100)); }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const open = async (q) => { const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('error: ' + m.text()); });
    await page.addInitScript(pageInit); await page.goto(`http://127.0.0.1:${port}/${page0}?ui=0&shot=1${q || ''}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true && window.__t && window.__t.renderer, null, { timeout: 600000, polling: 250 }); await frames(page); return page; };
  const GA = LP.presets['Golden afternoon'], MO = LP.presets['Soft morning'];
  try {
    const page = await open('');
    const sel = async (n) => { const s = await page.evaluate((nm) => !!(window.__look && window.__look.select(nm)), n); await frames(page); return s; };
    // ---- K1 sky ----
    const sky = await page.evaluate(inspectSky);
    ok('K1a Golden afternoon: painted sky dome visible (uPainted 1), its program has NO sampler uniform; no icosphere cloud puff and no deck disc visible',
      sky.dome && sky.domeVisible && sky.painted === 1 && sky.samplers === 0 && sky.puffs === 0 && !sky.deck, JSON.stringify(sky));
    // ---- K2 cel ----
    const cel = await page.evaluate(inspectCel), bad = cel.rows.filter((r) => !(r.compiled && r.def === 1 && r.use === 1 && r.shade === 1));
    ok('K2a every opaque Lambert material compiled the cel patch exactly once (one celBand definition, one banded N.L, one tinted indirect); no fallback',
      cel.rows.length > 10 && !bad.length && cel.core && cel.core.fallback === 0, `${cel.rows.length} materials (${[...new Set(cel.rows.map((r) => r.kind))].join('/')}); bad ${bad.length ? JSON.stringify(bad.slice(0, 3)) : 'none'}; core ${JSON.stringify(cel.core)}`);
    const chunkText = fs.readFileSync(path.join(__dirname, 'fixtures', 'three-r186-lambert.json'), 'utf8');
    await page.evaluate((j) => { window.__THREE_CHUNK__ = JSON.parse(j).lights_lambert_pars_fragment; }, chunkText);
    const fb = await page.evaluate(celFallbackProbe);
    ok('K2b a doubled anchor: the guard refuses (applied false, misses listed), the plain-Lambert program links and renders without a GL error', fb.ok && fb.applied === false && fb.misses && fb.misses.length && fb.programValid && fb.glError === 0, JSON.stringify(fb));
    // ---- K3 composite ----
    const cs = await page.evaluate(compositeState);
    ok('K3a high tier: composite on; scene target HalfFloat (1016) + 4x MSAA + DepthTexture; composite material toneMapped:false; the island program compiled for the target has no TONE_MAPPING (three only tone-maps the canvas)',
      cs.core && cs.c.on && cs.c.targetType === 1016 && cs.c.samples === 4 && cs.c.hasDepthTexture && cs.c.toneMappedMaterial === false && cs.islandProgramToneMapping === false, JSON.stringify(cs));
    const once = await page.evaluate(shotDiff, { view: 'farm', control: true, exposure: GA.renderer.exposure, a: { 'post.ink.enabled': false, 'post.bloom.enabled': false, 'post.grade.enabled': false, 'post.vignette.enabled': false, 'post.composite.dither': false }, b: { 'post.composite.enabled': false } });
    // (transparent layers - path edges, contact blobs, water - blend in LINEAR on the composite target and in sRGB on the canvas, so a
    //  few edge pixels differ; a second tone map / encode would move EVERY pixel: the control column)
    ok('K3b tone mapping + sRGB applied exactly once: the composite frame with ink / bloom / grade / vignette / dither off = the plain-path frame (farm: mean |d| <= 1.0, no channel bias > 1 level, p99 <= 16), vs a simulated second Neutral pass (control)',
      once.mean <= 1.0 && once.bias.every((v) => Math.abs(v) <= 1.0) && once.p99 <= 16 && once.control > 4 * once.mean,
      `mean |d| ${once.mean.toFixed(3)}, bias [${once.bias.map((v) => v.toFixed(2))}], p99 ${once.p99}, max ${once.max}, changed ${(once.changedShare * 100).toFixed(1)} %; a second Neutral + encode would give mean |d| ${once.control != null ? once.control.toFixed(2) : '-'}`);
    // ---- K4 effects ----
    const B = GA.post.bloom, start = B ? B.threshold - B.knee : 0.9;
    const ink = await page.evaluate(shotDiff, { view: 'farm', a: {}, b: { 'post.ink.enabled': false } });
    const bloomF = await page.evaluate(shotDiff, { view: 'full', a: {}, b: { 'post.bloom.enabled': false } });
    const bloomG = await page.evaluate(shotDiff, { view: 'full', a: {}, b: { 'post.bloom.enabled': false }, mask: true, srcLuma: start, radius: 72 });
    ok('K4a ink on vs off changes pixels (farm >= 0.3 %); bloom on vs off changes pixels (full > 0)', ink.changedShare >= 0.003 && bloomF.changedShare > 0, `ink ${(ink.changedShare * 100).toFixed(2)} % changed; bloom ${(bloomF.changedShare * 100).toFixed(3)} % changed (max ${bloomF.max})`);
    ok(`K4b bloom never makes grass glow (full): no grass pixel is a bloom source (display luma >= ${start.toFixed(2)}), and every grass pixel farther than 72 px from a source is bit-identical with bloom off`,
      bloomG.srcGround === 0 && bloomG.farIdentShare === 1, `${bloomG.n} grass px: grass sources ${bloomG.srcGround}; ${bloomG.far} grass px away from sources, identical ${bloomG.farIdentShare != null ? (bloomG.farIdentShare * 100).toFixed(3) : '-'} %; overall identical ${(bloomG.identShare * 100).toFixed(3)} % (max d ${bloomG.max})`);
    // ---- K6 time of day ----
    const tod = await page.evaluate(() => { const L = window.__look; if (!L.atHour) return null; const p = L.atHour(12); const ok2 = L.setHour(12); return { el: p.sun.elevationDeg, zen: p.sky.zenith, applied: ok2, name: L.name, presetEl: L.preset.sun.elevationDeg }; });
    const lin = (h) => [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }), lum = (h) => { const c = lin(h); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const btw = (x, p, q) => x >= Math.min(p, q) && x <= Math.max(p, q);
    ok(`K6a __look.atHour(12): sun elevation + sky zenith between Soft morning (${MO.sun.elevationDeg}, ${MO.sky.zenith}) and Golden afternoon (${GA.sun.elevationDeg}, ${GA.sky.zenith}); setHour(12) applies it`,
      tod && btw(tod.el, MO.sun.elevationDeg, GA.sun.elevationDeg) && btw(lum(tod.zen), lum(MO.sky.zenith), lum(GA.sky.zenith)) && tod.applied && tod.name === 'Time 12.00 h' && Math.abs(tod.presetEl - tod.el) < 1e-9, JSON.stringify(tod));
    // ---- K7 min albedo ----
    await sel('Golden afternoon'); const alb = await page.evaluate(albedoState); await sel('Game (current)'); const albG = await page.evaluate(albedoState);
    const lmin = (() => { const c = lin(GA.materials ? GA.materials.minAlbedo : '#000000'); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; })();
    const darkG = albG.filter((x) => x.luma < lmin - 1e-6), darkGA = alb.filter((x) => x.luma < lmin - 1e-6);
    ok('K7 materials.minAlbedo: Golden afternoon has no GLB material darker than the minimum; Game (current) keeps the authored (darker) colours', GA.materials && GA.materials.enabled && !darkGA.length && darkG.length > 0,
      `minimum luma ${lmin.toFixed(4)}; below it: Golden ${darkGA.length}, Game ${darkG.length} (${darkG.map((x) => x.name).join(', ')})`);
    // Game (current) sky: painted off, puffs back
    const skyG = await page.evaluate(inspectSky);
    ok('K1b Game (current): painted off (uPainted 0), the icosphere puffs and the screen-space quad are back', skyG.painted === 0 && skyG.puffs > 0 && skyG.quadVisible === true, JSON.stringify(skyG));
    await page.close();
    // ---- K5 low tier + ?hour= ----
    const low = await open('&quality=low'); const ls = await low.evaluate(compositeState); await low.close();
    ok('K5 ?quality=low: no composite (no post passes; the renderer tone-maps directly with the preset curve)', ls.core && !ls.c.on && ls.info.postCalls === 0 && ls.rendererTM === 7, JSON.stringify({ c: ls.c, info: ls.info, tm: ls.rendererTM }));
    const hp = await open('&hour=12'); const hn = await hp.evaluate(() => ({ name: window.__look.name, el: window.__look.preset.sun.elevationDeg })); await hp.close();
    ok('K6b ?hour=12 loads the same blend (name "Time 12.00 h", same sun elevation)', tod && hn.name === 'Time 12.00 h' && Math.abs(hn.el - tod.el) < 1e-9, JSON.stringify(hn));
  } finally {
    await browser.close();
    if (child) child.kill();
  }
  ok('B0 no page errors', !errors.length, errors.slice(0, 4).join(' | ') || 'none');
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
  console.log(`\n  WORLDSEED LOOK CORE RUNTIME CRITERIA (${page0})`); console.log('  ' + '-'.repeat(100));
  for (const x of results) { if (!x.pass) fails++; console.log('  ' + (x.pass ? 'PASS' : 'FAIL') + '  ' + pad(x.name, 96) + '\n        ' + x.detail); }
  console.log('  ' + '-'.repeat(100)); console.log(`  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
