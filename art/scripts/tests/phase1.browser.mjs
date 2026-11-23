// phase1.browser.mjs  --  LOOK-BRIEF Phase 1 RUNTIME criteria, checked on the live proof page (headless Chromium).
// =============================================================================
// Usage:  node tests/phase1.browser.mjs [--page index.html] [--port 8187]
// Loads <page>?ui=0&shot=1 from the shot server (shots.mjs; started here if it is not listening) and inspects the
// real three.js objects. The scene and renderer are reached WITHOUT any test hook in the scene code: three dispatches
// an 'observe' event for every Scene to window.__THREE_DEVTOOLS__ (installed before the page scripts run), and
// Scene.onBeforeRender hands over the renderer + camera on the next frame. So the same test runs, unchanged, against
// any build (e.g. an old commit's index.html via --page) -> red/green evidence.
//   B1 speckle    no material samples a mipmapped sRGB texture of any kind (the iOS rainbow speckle: Apple GPUs corrupt
//                 the generated mip chain of sRGB storage; first seen on the cloud-deck / contact-blob canvas textures;
//                 GLB image maps are stored linear and decoded in the shader instead, B1d); the cloud deck is
//                 texture-free with the old falloff (alpha 1 @ r 0, 0.85 @ r 0.6, 0 @ r 1) and keeps the preset colour /
//                 opacity / fog; the contact blobs are texture-free and keep the preset colour / alpha
//   B2 materials  the game's material model: no MeshStandardMaterial / MeshPhysicalMaterial on scene geometry (Glass may
//                 stay Standard: transparent, wants specular); island meshes are vertex-coloured Lambert without forced
//                 flat shading; GLB materials are converted to Lambert on load keeping name / colour / flags, Glow keeps
//                 its emissive
//   B3 look       per mood (Golden afternoon = the page default, Soft morning, Dusk): AmbientLight ~0, exactly one shadow
//                 light (the DirectionalLight sun); Golden afternoon sun elevation 25-35 deg from the back-left of the
//                 full view; renderer tone mapping AgX / Neutral at ~1.0; the shadow camera contains every visible island
//                 mesh's world box projected along the sun and is tight around it; the sky is a world-space dome with
//                 the dither on (the screen-space quad hidden); the fog colour = the dome's horizon colour in the camera's
//                 view direction (fog.skyMatch 'view') or sky.horizon ('horizon')
// Headless SwiftShader: fine for structure, never for timing.
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

// ---- in-page helpers (serialised into the page) ----
function pageInit() {
  const t = new EventTarget(); window.__THREE_DEVTOOLS__ = t; window.__t = { scenes: [] };
  t.addEventListener('observe', (e) => { const o = e.detail; if (o && o.isScene) { window.__t.scenes.push(o);
    const prev = o.onBeforeRender; o.onBeforeRender = function (renderer, scene, camera, rt) { if ((!rt || rt.isGitawayComposite) && camera.isPerspectiveCamera) { window.__t.renderer = renderer; window.__t.camera = camera; } return prev.apply(this, arguments); }; } });
}
function inspectB1(cfg) {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main'));
  const out = { found: !!scene, badTextures: [], linearMaps: 0, undecoded: [], deck: null, contacts: [] };
  if (!scene) return out;
  const TEXKEYS = ['map', 'alphaMap', 'emissiveMap', 'aoMap', 'lightMap', 'bumpMap', 'normalMap', 'displacementMap', 'roughnessMap', 'metalnessMap', 'specularMap', 'gradientMap', 'envMap', 'matcap'];
  const MIP = new Set([1004, 1005, 1007, 1008]);   // Nearest/Linear MipmapNearest/Linear (three constants)
  const texOf = (m) => { const t = []; for (const k of TEXKEYS) if (m[k] && m[k].isTexture) t.push([k, m[k]]);
    if (m.uniforms) for (const [k, u] of Object.entries(m.uniforms)) if (u && u.value && u.value.isTexture) t.push(['uniform:' + k, u.value]); return t; };
  scene.traverse((o) => { if (!o.material) return; for (const m of [].concat(o.material)) for (const [k, t] of texOf(m)) {
    // ANY texture (canvas, data, or a GLB image): the corruption is in the GPU-generated mip chain of sRGB storage
    const mip = t.generateMipmaps && MIP.has(t.minFilter);
    if (t.colorSpace === 'srgb' && mip) out.badTextures.push(`${o.name || o.type}.${m.type}.${k}`);
    // a map stored linear must be decoded in the shader (else the colours wash out): the srgbDecode patch
    if (k === 'map' && t.colorSpace !== 'srgb' && m.userData && m.userData.fromStandard) { out.linearMaps++; if (!(window.__patchKeys && window.__patchKeys(m).includes('srgbDecode'))) out.undecoded.push(`${o.name || o.type}.${m.name || m.type}`); } } });
  // the cloud deck: the big horizontal disc at the deck level (radius = sea.deck.radius)
  let deck = null; const wp = { x: 0, y: 0, z: 0 };
  scene.traverse((o) => { if (deck || !o.isMesh || !o.geometry) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    const s = new o.matrixWorld.constructor().copy(o.matrixWorld); const y = s.elements[13];
    if (Math.abs(g.boundingSphere.radius - cfg.deck.radius) < cfg.deck.radius * 0.02 && Math.abs(y - cfg.deck.y) < 0.05) deck = o; });
  if (deck) {
    const m = deck.material, g = deck.geometry, c = g.attributes.color, p = g.attributes.position, prof = [];
    if (c && c.itemSize === 4) for (const r of [0, 0.6, 1]) { let best = null, bd = 1e9;
      for (let i = 0; i < p.count; i++) { const d = Math.abs(Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) / cfg.deck.radius - r); if (d < bd) { bd = d; best = c.getW(i); } } prof.push(+best.toFixed(4)); }
    out.deck = { name: deck.name, type: m.type, map: !!m.map, alphaMap: !!m.alphaMap, vertexColors: m.vertexColors, colorItemSize: c ? c.itemSize : 0, profile: prof,
      opacity: m.opacity, color: '#' + m.color.getHexString(), fog: m.fog, transparent: m.transparent, depthWrite: m.depthWrite };
  }
  out.fog = scene.fog ? '#' + scene.fog.color.getHexString() : null;
  scene.traverse((o) => { if (o.isMesh && /^contacts:/.test(o.name)) { const m = o.material;
    out.contacts.push({ name: o.name, type: m.type, map: !!m.map, alphaMap: !!m.alphaMap, color: '#' + m.color.getHexString(), opacity: m.opacity, fog: m.fog }); } });
  return out;
}

function inspectB2() {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main'));
  const out = { types: {}, standard: [], island: [], glow: [], glbNames: {} };
  if (!scene) return out;
  scene.traverse((o) => { if (!(o.isMesh || o.isInstancedMesh) || !o.material) return;
    for (const m of [].concat(o.material)) {
      out.types[m.type] = (out.types[m.type] || 0) + 1;
      if ((m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && m.name !== 'Glass') out.standard.push(`${o.name || o.parent?.name || o.type}:${m.name || m.type}`);
      if (/^island:/.test(o.name)) out.island.push({ name: o.name, type: m.type, vertexColors: m.vertexColors, flatShading: m.flatShading });
      if (m.name === 'Glow') out.glow.push({ type: m.type, emissive: m.emissive ? m.emissive.r + m.emissive.g + m.emissive.b : 0, ei: m.emissiveIntensity });
      if (m.name) out.glbNames[m.name] = m.type;
    } });
  out.standard = [...new Set(out.standard)];
  return out;
}

function inspectB3(cfg) {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), R = T.renderer, cam = T.camera;
  const lights = []; scene.traverse((o) => { if (o.isLight) lights.push(o); });
  const sun = lights.find((l) => l.isDirectionalLight), V3 = sun.position.constructor;
  const casters = lights.filter((l) => l.castShadow && l.visible !== false);
  const amb = lights.filter((l) => l.isAmbientLight && l.visible !== false).reduce((s, l) => s + l.intensity, 0);
  const d = new V3().copy(sun.position).sub(sun.target.position).normalize(), DEG = Math.PI / 180;
  const el = Math.asin(d.y) / DEG, rel = ((Math.atan2(d.x, d.z) / DEG - cfg.fullAz + 540) % 360) - 180;
  // shadow camera vs the world box of every visible mesh on a visible piece (casters + receivers), projected along the sun
  const sc = sun.shadow.camera, M = new sc.matrixWorld.constructor().multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse);
  const visible = (o) => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };
  let Box3 = null; scene.traverse((o) => { if (!Box3 && o.geometry && o.geometry.boundingBox) Box3 = o.geometry.boundingBox.constructor; });
  const b = new Box3(), p = new V3(), lv = new V3(), lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  let n = 0, bad = 0, worst = 0;
  for (const g of scene.children) { if (!/^piece:/.test(g.name) || /^piece:isle\d/.test(g.name) || g.visible === false) continue;
    g.traverse((o) => { if (!(o.isMesh && (o.castShadow || o.receiveShadow) && visible(o))) return; b.makeEmpty().expandByObject(o); if (b.isEmpty()) return;
      for (let k = 0; k < 8; k++) { p.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z);
        lv.copy(p).applyMatrix4(sc.matrixWorldInverse); lo[0] = Math.min(lo[0], lv.x); lo[1] = Math.min(lo[1], lv.y); hi[0] = Math.max(hi[0], lv.x); hi[1] = Math.max(hi[1], lv.y);
        p.applyMatrix4(M); n++; const e = Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)); worst = Math.max(worst, e); if (e > 1 + 1e-4) bad++; } }); }
  const slack = [(sc.right - sc.left) - (hi[0] - lo[0]), (sc.top - sc.bottom) - (hi[1] - lo[1])];
  // sky: the world-space dome (BackSide sphere ShaderMaterial) vs the old screen quad (PlaneGeometry ShaderMaterial, renderOrder -100)
  let dome = null, quad = null;
  scene.traverse((o) => { if (!o.isMesh || !o.material || !o.material.isShaderMaterial) return;
    if (o.geometry.type === 'SphereGeometry' && o.material.side === 1) dome = o; else if (o.geometry.type === 'PlaneGeometry' && o.renderOrder === -100) quad = o; });
  const fwd = cam.getWorldDirection(new V3());
  return { toneMapping: R.toneMapping, exposure: R.toneMappingExposure, amb, casters: casters.length, casterType: casters[0] ? casters[0].type : null, el, rel,
    contain: { n, bad, worst }, slack, frustum: [sc.right - sc.left, sc.top - sc.bottom, sc.far - sc.near], mapSize: sun.shadow.mapSize.x, shadowType: R.shadowMap.type, radius: sun.shadow.radius,
    dome: dome ? { visible: visible(dome), dither: /gl_FragCoord/.test(dome.material.fragmentShader) && /255\.0/.test(dome.material.fragmentShader), uDither: dome.material.uniforms.uDither ? dome.material.uniforms.uDither.value : null } : null,
    quadVisible: quad ? visible(quad) : null, fog: scene.fog ? '#' + scene.fog.color.getHexString() : null, fwd: [fwd.x, fwd.y, fwd.z], sunDir: [d.x, d.y, d.z] };
}
// the sky dome's horizon colour (sRGB 0..1) seen along a view direction: sky.horizon -> sky.sunSideHorizon within
// sky.sunSideSpreadDeg of the sun's azimuth (smoothstep), = SKY_DOME_FS at elevation 0 and = the 'view' fog colour
const DEG = Math.PI / 180, hex01 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function horizonAlong(P, fwd, sunDir) {
  const hl = Math.hypot(fwd[0], fwd[2]), sl = Math.hypot(sunDir[0], sunDir[2]);
  const ca = hl > 1e-5 && sl > 1e-6 ? (fwd[0] * sunDir[0] + fwd[2] * sunDir[2]) / (hl * sl) : -1, az = Math.acos(Math.min(1, Math.max(-1, ca)));
  const w = 1 - smooth(0, P.sky.sunSideSpreadDeg * DEG, az), a = hex01(P.sky.horizon), b = hex01(P.sky.sunSideHorizon);
  return a.map((v, i) => v + (b[i] - v) * w);
}

async function main() {
  const a = process.argv.slice(2);
  let page0 = 'index.html', port = 8187;
  for (let i = 0; i < a.length; i++) { if (a[i] === '--page') page0 = a[++i]; else if (a[i] === '--port') port = +a[++i]; }
  let child = null;
  if (!(await serverUp(port))) {
    child = spawn(process.execPath, [path.resolve(__dirname, '../shots.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await serverUp(port)); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('error: ' + m.text()); });
    await page.addInitScript(pageInit);
    await page.goto(`http://127.0.0.1:${port}/${page0}?ui=0&shot=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true && window.__t && window.__t.renderer, null, { timeout: 600000, polling: 250 });
    const lookName = await page.evaluate(() => (window.__look ? window.__look.name : null));
    const P = LP.presets[lookName] || LP.presets[LP.default];

    // ---- B1 speckle ----
    const r = await page.evaluate(inspectB1, { deck: A.sea.deck });
    ok('B1a no material samples a mipmapped sRGB texture: canvas, data or GLB image (iOS speckle)', r.found && !r.badTextures.length, r.found ? (r.badTextures.join(', ') || 'none') : 'scene not found');
    ok('B1d GLB maps stored linear are decoded sRGB -> linear in the shader (srgbDecode patch)', r.found && !r.undecoded.length, `${r.linearMaps} linear GLB maps; undecoded: ${r.undecoded.join(', ') || 'none'}`);
    const D = r.deck, want = [1, 0.85, 0];
    const deckCol = (() => { const h = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16) / 255), lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)), srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
      const a0 = h(P.clouds.deck.color).map(lin), b0 = h(r.fog || P.fog.color).map(lin), t = P.clouds.deck.fogMix; /* the LIVE fog colour (it can follow the view) */ return a0.map((v, i) => srgb(v + (b0[i] - v) * t)); })();
    const colOk = D && (() => { const g = [1, 3, 5].map((i) => parseInt(D.color.slice(i, i + 2), 16) / 255); return g.every((v, i) => Math.abs(v - deckCol[i]) <= 1.5 / 255); })();
    ok('B1b cloud deck: texture-free (vertex alpha), falloff 1 / 0.85 / 0 at r 0 / 0.6 / 1, preset colour + opacity, fogged, transparent',
      D && !D.map && !D.alphaMap && D.vertexColors && D.colorItemSize === 4 && D.profile.length === 3 && D.profile.every((v, i) => Math.abs(v - want[i]) <= 0.01) &&
      Math.abs(D.opacity - P.clouds.deck.opacity) < 1e-6 && colOk && D.fog && D.transparent && !D.depthWrite,
      D ? `${D.type} map=${D.map} vertexColors=${D.vertexColors} colour attr ${D.colorItemSize}-comp, profile [${D.profile}], opacity ${D.opacity}, colour ${D.color}, fog ${D.fog}` : 'deck not found');
    const C = r.contacts, cc = P.shadows.contact;
    ok('B1c contact blobs: texture-free, preset colour + inner alpha, fogged', C.length > 0 && C.every((c) => !c.map && !c.alphaMap && c.color.toUpperCase() === cc.color.toUpperCase() && Math.abs(c.opacity - cc.innerAlpha) < 1e-6 && c.fog),
      C.length ? `${C.length} instanced sets; ${C[0].type} map=${C[0].map} colour ${C[0].color} opacity ${C[0].opacity}` : 'no contacts:* meshes');

    // ---- B2 material model ----
    const m2 = await page.evaluate(inspectB2);
    ok('B2a no MeshStandardMaterial / MeshPhysicalMaterial on scene geometry (Glass excepted)', Object.keys(m2.types).length && !m2.standard.length,
      `types: ${Object.entries(m2.types).map(([k, v]) => k + ' x' + v).join(', ')}${m2.standard.length ? ' | Standard: ' + m2.standard.slice(0, 8).join(', ') + (m2.standard.length > 8 ? ` (+${m2.standard.length - 8})` : '') : ''}`);
    ok('B2b island meshes: vertex-coloured MeshLambertMaterial, no forced flat shading (authored normals)', m2.island.length >= 8 && m2.island.every((x) => x.type === 'MeshLambertMaterial' && x.vertexColors && !x.flatShading),
      `${m2.island.length} island meshes: ${[...new Set(m2.island.map((x) => `${x.type} vc=${x.vertexColors} flat=${x.flatShading}`))].join('; ')}`);
    ok('B2c GLB materials converted to Lambert on load; Glow keeps its emissive', m2.glow.length > 0 && m2.glow.every((g) => g.type === 'MeshLambertMaterial' && g.emissive * g.ei > 0) &&
      Object.entries(m2.glbNames).filter(([n]) => n !== 'Glass').every(([, t]) => t !== 'MeshStandardMaterial'),
      `Glow: ${m2.glow.length ? m2.glow[0].type + ' emissive ' + (m2.glow[0].emissive * m2.glow[0].ei).toFixed(3) : 'none'}; named: ${Object.entries(m2.glbNames).map(([n, t]) => n + '=' + t.replace('Material', '').replace('Mesh', '')).join(' ')}`);

    // ---- B3 the Phase 1 look, per mood ----
    ok('B3a the page starts in Golden afternoon (lookPresets.json default)', lookName === 'Golden afternoon', `page default: ${lookName}`);
    const TM = { 6: 'AgX', 7: 'Neutral' };
    for (const mood of ['Golden afternoon', 'Soft morning', 'Dusk']) {
      const MP = LP.presets[mood];
      const sel = await page.evaluate((nm) => !!(window.__look && window.__look.select(nm)), mood);
      if (!sel || !MP) { ok(`B3 ${mood}: selectable`, false, 'window.__look.select() refused it (missing / not active)'); continue; }
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const x = await page.evaluate(inspectB3, { fullAz: A.views.full.az });
      ok(`B3b ${mood}: AmbientLight <= 0.02; exactly one shadow light, a DirectionalLight`, x.amb <= 0.02 && x.casters === 1 && x.casterType === 'DirectionalLight',
        `ambient ${x.amb}, shadow lights ${x.casters} (${x.casterType})`);
      if (mood === 'Golden afternoon') ok('B3c Golden afternoon sun: elevation 25-35 deg, from the back-left of the full view (relative azimuth -165..-95)',
        x.el >= 25 - 1e-6 && x.el <= 35 + 1e-6 && x.rel <= -95 && x.rel >= -165, `elevation ${x.el.toFixed(2)}, relative azimuth ${x.rel.toFixed(2)}`);
      ok(`B3d ${mood}: renderer tone mapping AgX / Neutral at exposure 0.8-1.2`, TM[x.toneMapping] && x.exposure >= 0.8 && x.exposure <= 1.2, `${TM[x.toneMapping] || 'constant ' + x.toneMapping} @ ${x.exposure}`);
      const m = MP.shadows.fitMargin, tight = x.slack.every((s) => s <= 2 * m + 0.05);
      ok(`B3e ${mood}: shadow camera contains every visible island mesh box projected along the sun, and is tight`, x.contain.n > 0 && !x.contain.bad && tight,
        `${x.contain.n} corners, ${x.contain.bad} outside (worst |ndc| ${x.contain.worst.toFixed(4)}); frustum ${x.frustum.map((v) => v.toFixed(1)).join(' x ')} u, slack ${x.slack.map((v) => v.toFixed(2)).join(' / ')} u (margin ${m}); map ${x.mapSize}, radius ${x.radius}`);
      ok(`B3f ${mood}: world-space sky dome visible with the dither on; screen-space quad hidden`, x.dome && x.dome.visible && x.dome.dither && x.dome.uDither > 0 && x.quadVisible !== true,
        x.dome ? `dome visible ${x.dome.visible}, shader dither ${x.dome.dither}, uDither ${x.dome.uDither}; quad visible ${x.quadVisible}` : 'no dome');
      const want = MP.fog.skyMatch === 'horizon' ? hex01(MP.sky.horizon) : horizonAlong(MP, x.fwd, x.sunDir), got = x.fog ? hex01(x.fog) : null;
      ok(`B3g ${mood}: fog colour = the sky horizon colour along the view (fog.skyMatch ${MP.fog.skyMatch})`, got && ['view', 'horizon'].includes(MP.fog.skyMatch) && got.every((v, i) => Math.abs(v - want[i]) <= 1.5 / 255),
        `fog ${x.fog}, horizon along the view #${want.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`);
    }
  } finally {
    await browser.close();
    if (child) child.kill();
  }
  ok('B0 no page errors', !errors.length, errors.slice(0, 4).join(' | ') || 'none');
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
  console.log(`\n  LOOK-BRIEF PHASE 1 RUNTIME CRITERIA (${page0})`); console.log('  ' + '-'.repeat(100));
  for (const x of results) { if (!x.pass) fails++; console.log('  ' + (x.pass ? 'PASS' : 'FAIL') + '  ' + pad(x.name, 96) + '\n        ' + x.detail); }
  console.log('  ' + '-'.repeat(100)); console.log(`  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
