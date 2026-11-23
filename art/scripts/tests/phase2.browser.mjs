// phase2.browser.mjs  --  LOOK-BRIEF Phase 2 RUNTIME criteria, checked on the live proof page (headless Chromium).
// =============================================================================
// Usage:  node tests/phase2.browser.mjs [--page index.html] [--port 8187] [--break black|darkmap|flip]
//         (--break: the RED run, T2a / T2b must fail, see T2 below; a missing or unknown --break value, or any other unknown
//         argument, exits 2 with this usage before anything runs)
// Same harness as phase1.browser.mjs: the scene / renderer / camera are reached WITHOUT a test hook in the scene code (three's
// __THREE_DEVTOOLS__ 'observe' event + Scene.onBeforeRender), so the same test runs against an older build (--page) for the
// red / green evidence. Compiled shader sources are read back from GL (renderer.properties -> program -> getShaderSource).
//   T1 canopies   (Golden afternoon) every tree canopy InstancedMesh (pine / tree_round_a, leafy material): a per-vertex
//                 height-within-the-tree attribute aTreeH spanning 0..1, a fragment shader that uses it (vTreeH), a gradient that
//                 is on (strength > 0) with a darker, cooler bottom than top; per-instance tints (instanceColor) that vary and stay
//                 within +/-6 % of the wheel in hue and +/-6 % in value on the lobe colour
//   T2 crowns     "crowns never black": luminance probe in the woodland / full / lake views (live renderer, Golden afternoon) on the PAINTED
//                 crowns of the painterly trees (a mesh whose material name ends in _leaves, or anything under a node named Canopy), their
//                 leaf pixels only (the MASK cards' cut-out is kept), eroded 1 px. It guards the crowns rendering black: a cel / tint patch,
//                 an undecoded or twice-decoded sRGB map, flipped normals on the back faces (the retired Phase 1 / 2 form: every shadowed
//                 facet one flat value, the lower DeepFoliage lobes black; its green-hue and flat-level tests described the old ramp, which
//                 painted textured crowns replaced)
//                 a) conifer crowns (the tree_pine_* leaves): median luma >= 0.12 and <= 3 % of the pixels below luma 0.06
//                 b) broadleaf crowns (every other crown, the hero tree's included): median luma >= 0.20 and <= 3 % below luma 0.06
//                 (the measured passing values and the margins: the CROWN constant below). `--break black|darkmap|flip` breaks the crowns on
//                 purpose (the leaf colour forced to black / the albedo decoded twice / the normals negated) for the red run: T2a / T2b must fail.
//   C1 clouds     visible puffs (non-zero instance scale) <= 50 % of Game (current)'s, and none IN FRAME and IN THE FOREGROUND
//                 (horizontally nearer the camera than its target) of the gameplay cameras (default_mobile 720x1560,
//                 default_desktop 1600x900) or the full view
//   K1 sky        gameplay camera (the live page): the sky dome's screen tint uniform is on (= sky.screenTint.strength); the full
//                 view (photo, __viewShot) keeps the true dome: its top rows are NOT the zenith blue
//   G0 revert     Game (current): the terrain colour attribute is exactly the core's base colours, every Phase-2 uniform is
//                 neutral (canopy gradient / saturation / lift / backlight, cloud shading, island haze + rock bounce) and every canopy
//                 instance tint is white
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
// T2 thresholds: painted-crown leaf pixels, luma 0..1 of the final sRGB frame (0.2126 R + 0.7152 G + 0.0722 B on the 0..255 values).
// Measured on the passing proof (Golden afternoon; 29-71k conifer and 7-30k broadleaf px per view; run to run the counts move ~0.1 %, the leaves sway):
//   conifer   median 0.154 / 0.172 / 0.162 (woodland / full / lake), 0.5 / 0.0 / 0.0 % of the pixels below 0.06
//   broadleaf median 0.258 / 0.267 / 0.298,                          0.6 / 0.1 / 0.3 % below 0.06
// Broken on purpose (--break): black = median 0.000, 100 % below 0.06; darkmap = median 0.03-0.05, 57-83 % below; flip = conifer median 0.081-0.093
// (15-23 % below), broadleaf 0.162-0.188 (0.7-3.0 % below). The floors sit ~22 % under the lowest passing median, the dark share 5x over the highest passing one.
const CROWN = { n: 1000, black: 0.06, dark: 0.03, medConifer: 0.12, medBroad: 0.20 };
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

function inspectCanopy() {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), R = T.renderer, gl = R.getContext();
  const toS = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
    if (d > 1e-9) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); if (h < 0) h += 360; } return [h, mx > 0 ? d / mx : 0, mx]; };
  const out = { meshes: 0, kinds: {}, withAttr: 0, range: [Infinity, -Infinity], shaderUses: 0, uniforms: null, tinted: 0, untinted: 0, dh: [], dv: [] };
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !/^(pine|tree_round_a):/.test(o.name)) return;
    const m = o.material, c = m && m.color; if (!(c && c.g > c.r * 1.05 && c.g > c.b)) return;   // leafy = canopy
    out.meshes++; const kind = o.name.split(':')[0]; out.kinds[kind] = (out.kinds[kind] || 0) + 1;
    const a = o.geometry.attributes.aTreeH;
    if (a) { out.withAttr++; for (let i = 0; i < a.count; i++) { const v = a.getX(i); out.range[0] = Math.min(out.range[0], v); out.range[1] = Math.max(out.range[1], v); } }
    const mp = R.properties.get(m), prog = mp && mp.currentProgram;
    if (prog && prog.program) { const src = gl.getAttachedShaders(prog.program).map((s) => gl.getShaderSource(s)).join('\n'); if (/vTreeH/.test(src)) out.shaderUses++; }
    if (mp && mp.uniforms && !out.uniforms) { const U = mp.uniforms, g = (k) => (U[k] ? (U[k].value && U[k].value.toArray ? U[k].value.toArray() : U[k].value) : null);
      out.uniforms = { grad: g('uCanopyGrad'), bottom: g('uCanopyBottom'), top: g('uCanopyTop'), lift: g('uCanopyLift'), back: g('uCanopyBack') }; }
    if (o.instanceColor) { out.tinted++; const ref = [c.r, c.g, c.b].map(toS), [h0, , v0] = hsv(...ref), ic = o.instanceColor.array;
      for (let i = 0; i < o.count; i++) { const s = [c.r * ic[i * 3], c.g * ic[i * 3 + 1], c.b * ic[i * 3 + 2]].map(toS), [h, , v] = hsv(...s); let dh = Math.abs(h - h0); if (dh > 180) dh = 360 - dh; out.dh.push(dh / 360); out.dv.push((v - v0) / v0); } }
    else out.untinted++;
  });
  const st = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = a.reduce((p, q) => p + q, 0) / a.length; return { n: a.length, min: s[0], max: s[s.length - 1], mean: m, std: Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / a.length) }; };
  out.dhS = st(out.dh); out.dvS = st(out.dv); delete out.dh; delete out.dv;
  return out;
}

// the painted crowns (the painterly trees): a crown = a mesh whose material name ends in `_leaves`, or anything under a node named `Canopy`
// (the proof draws a tree as one InstancedMesh per model part, so the Canopy node itself is gone for those; the material name is what is left).
// Class 1 = conifer crowns (tree_pine_*), class 2 = every other (broadleaf) crown. The mask pass redraws each crown as a FLAT colour but keeps the
// cut-out of its MASK cards (map + alphaTest), so the mask is the leaf pixels, not the card rectangles. cfg.brk (--break) deliberately breaks the
// crowns first (the RED run): black = the leaf colour forced to 0, darkmap = the albedo decoded twice (sRGB -> linear -> used as sRGB), flip = the
// normals negated (the back faces of the two-sided crowns face the wrong way).
function crownProbe(cfg) {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), R = T.renderer, cam = T.camera, gl = R.getContext();
  let Basic = null; scene.traverse((o) => { if (!Basic && o.material && o.material.type === 'MeshBasicMaterial') Basic = o.material.constructor; });
  const matName = (o) => (o.material && o.material.name) || '';
  const isCrown = (o) => { if (!o.isMesh || !o.material) return false; if (/_leaves$/.test(matName(o))) return true; for (let q = o; q; q = q.parent) if (q.name === 'Canopy') return true; return false; };
  const isCon = (o) => /(^|_)(pine|fir)(_|$)/.test(matName(o));
  const black = new Basic(); black.color.setRGB(0, 0, 0); black.fog = false; black.toneMapped = false;
  const flats = new Map();   // a flat-colour MeshBasicMaterial per source material (the cut-out kept) and colour
  const flat = (src, rgb) => { const key = src.uuid + rgb; let m = flats.get(key); if (m) return m;
    m = new Basic({ map: src.map || null, alphaTest: src.alphaTest || 0, side: src.side }); m.fog = false; m.toneMapped = false;
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\ndiffuseColor.rgb = vec3(' + rgb + ');'); };
    m.customProgramCacheKey = () => 'crownmask' + rgb; flats.set(key, m); return m; };
  const undo = [], mats = new Set(), geos = new Set(); scene.traverse((o) => { if (isCrown(o)) { mats.add(o.material); geos.add(o.geometry); } });
  if (cfg.brk === 'black') for (const m of mats) { const c = m.color.clone(); undo.push(() => m.color.copy(c)); m.color.setRGB(0, 0, 0); }
  if (cfg.brk === 'darkmap') for (const m of mats) { if (!m.map || !m.map.image) continue; const im = m.map.image, cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const g = cv.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height); for (let i = 0; i < d.data.length; i += 4) for (let k = 0; k < 3; k++) d.data[i + k] = 255 * Math.pow(d.data[i + k] / 255, 2.2);
    g.putImageData(d, 0, 0); const t = new m.map.constructor(cv); t.colorSpace = m.map.colorSpace; t.flipY = m.map.flipY; t.wrapS = m.map.wrapS; t.wrapT = m.map.wrapT; t.needsUpdate = true;
    const old = m.map; undo.push(() => { m.map = old; }); m.map = t; }
  if (cfg.brk === 'flip') for (const geo of geos) { const a = geo.attributes.normal; if (!a) continue; const neg = () => { for (let i = 0; i < a.count; i++) a.setXYZ(i, -a.getX(i), -a.getY(i), -a.getZ(i)); a.needsUpdate = true; }; neg(); undo.push(neg); }
  const sv = { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect, fog: scene.fog ? [scene.fog.near, scene.fog.far] : null };
  const res = {};
  for (const [name, c] of Object.entries(cfg.views)) {
    const w = Math.round(c.w / 2), h = Math.round(c.h / 2), e = c.el * Math.PI / 180, a = c.az * Math.PI / 180;
    R.setSize(w, h, false); cam.fov = cfg.fov; cam.aspect = w / h;
    cam.position.set(c.tgt[0] + Math.cos(e) * Math.sin(a) * c.dist, c.tgt[1] + Math.sin(e) * c.dist, c.tgt[2] + Math.cos(e) * Math.cos(a) * c.dist);
    cam.lookAt(c.tgt[0], c.tgt[1], c.tgt[2]); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    if (scene.fog && scene.fog.isFog && cfg.fog && cfg.fog.anchor === 'cameraTarget') { scene.fog.near = c.dist + cfg.fog.nearOffset; scene.fog.far = c.dist + cfg.fog.farOffset; }
    R.setRenderTarget(null); R.render(scene, cam); const img = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, img);
    const saved = [], bg = scene.background, fog = scene.fog, sm = R.shadowMap.enabled;
    scene.traverse((o) => { if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return; saved.push([o, o.material, o.visible]);
      if (!o.isMesh || (o.material && o.material.isShaderMaterial)) { o.visible = false; return; }
      const src = o.material, cut = src.alphaTest > 0 && src.map;   // (every other cut-out card stays a cut-out, in black)
      o.material = isCrown(o) ? flat(src, isCon(o) ? '1.0' : '1.0, 0.0, 0.0') : cut ? flat(src, '0.0') : black; });
    scene.background = null; scene.fog = null; R.shadowMap.enabled = false;
    R.render(scene, cam); const mk = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, mk);
    for (const [o, m, v] of saved) { o.material = m; o.visible = v; }
    scene.background = bg; scene.fog = fog; R.shadowMap.enabled = sm;
    // classes: conifer crown = white, broadleaf crown = red; eroded by 1 px (no anti-aliased edges)
    const W4 = w * 4, cls = (j) => (mk[j] > 200 ? (mk[j + 1] > 200 ? 1 : mk[j + 1] < 60 ? 2 : 0) : 0), px = { 1: [], 2: [] };
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = (y * w + x) * 4, k = cls(i); if (!k || cls(i - 4) !== k || cls(i + 4) !== k || cls(i - W4) !== k || cls(i + W4) !== k) continue;
      px[k].push((0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2]) / 255); }
    const stat = (list) => { if (!list.length) return { n: 0 }; list.sort((p, q) => p - q); const n = list.length, Lq = (p) => list[Math.min(n - 1, Math.floor(n * p))];
      return { n, min: list[0], p05: Lq(0.05), med: Lq(0.5), p95: Lq(0.95), dark: list.filter((v) => v < cfg.black).length / n }; };
    res[name] = { conifer: stat(px[1]), broad: stat(px[2]) };
  }
  for (let i = undo.length - 1; i >= 0; i--) undo[i]();
  cam.position.copy(sv.pos); cam.quaternion.copy(sv.q); cam.fov = sv.fov; cam.aspect = sv.aspect; cam.updateProjectionMatrix();
  if (sv.fog && scene.fog) { scene.fog.near = sv.fog[0]; scene.fog.far = sv.fog[1]; }
  R.setSize(window.innerWidth, window.innerHeight, false);
  return res;
}

function inspectClouds(cfg) {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), Cam = T.camera.constructor, V3 = T.camera.position.constructor;
  const cl = []; scene.traverse((o) => { if (o.isInstancedMesh && o.geometry.type === 'IcosahedronGeometry' && o.geometry.parameters.radius === 1 && o.geometry.parameters.detail === 2) cl.push(o); });
  const pts = [], M4 = scene.matrixWorld.constructor, mw = new M4();
  for (const m of cl) { let shown = true; for (let q = m; q; q = q.parent) if (q.visible === false) shown = false; if (!shown) continue; m.updateMatrixWorld(true);   // (only puffs actually drawn: the painted sky hides the fields)
    for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, mw); const e = mw.elements, sc = Math.hypot(e[0], e[1], e[2]); if (sc < 1e-3) continue;
    const p = new V3(e[12], e[13], e[14]).applyMatrix4(m.matrixWorld); pts.push([p.x, p.y, p.z]); } }
  const out = { meshes: cl.length, visible: pts.length, cams: {} };
  for (const c of cfg.cams) {
    const aspect = c.w / c.h, d = c.dist === 'frame' ? window.__frameDistance(aspect) : c.dist, cam = new Cam(cfg.fov, aspect, 0.5, 3000), e = c.el * Math.PI / 180, a = c.az * Math.PI / 180;
    cam.position.set(c.tgt[0] + Math.cos(e) * Math.sin(a) * d, c.tgt[1] + Math.sin(e) * d, c.tgt[2] + Math.cos(e) * Math.cos(a) * d); cam.lookAt(c.tgt[0], c.tgt[1], c.tgt[2]); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    const hT = Math.hypot(c.tgt[0] - cam.position.x, c.tgt[2] - cam.position.z); let inFrame = 0, fg = 0; const ex = [];
    for (const [x, y, z] of pts) { const v = new V3(x, y, z).project(cam); if (Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 || v.z < -1 || v.z > 1) continue; inFrame++;
      if (Math.hypot(x - cam.position.x, z - cam.position.z) < hT) { fg++; if (ex.length < 3) ex.push([x, y, z].map((q) => +q.toFixed(1))); } }
    out.cams[c.name] = { dist: +d.toFixed(1), inFrame, fg, ex };
  }
  return out;
}

function inspectSky() {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main'));
  let dome = null; scene.traverse((o) => { if (o.isMesh && o.material && o.material.isShaderMaterial && o.geometry.type === 'SphereGeometry' && o.material.side === 1) dome = o; });
  if (!dome) return { dome: false };
  const U = dome.material.uniforms; return { dome: true, visible: dome.visible, tint: U.uScreenTint ? U.uScreenTint.value : null, src: /vScreen|gl_FragCoord\.y|vClip/.test(dome.material.fragmentShader) };
}
async function viewTop(name) {   // top 2 % rows of a __viewShot capture: median sRGB 0..255
  const r = window.__viewShot(name, {}), img = new Image(); img.src = r.url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const n = Math.max(2, Math.round(img.height * 0.02)), d = g.getImageData(0, 0, img.width, n).data, ch = [[], [], []];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) ch[k].push(d[i + k]);
  return ch.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; });
}

function inspectNeutral() {
  const T = window.__t, scene = T.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), R = T.renderer, PG = window.__pieceGroups;
  let diff = 0, n = 0; for (const id of Object.keys(PG)) { const a = PG[id].mesh.geometry.attributes.color.array, b = PG[id].pc.colors; n += b.length; for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) diff++; }
  const vals = {}, put = (k, v) => { if (v == null) return; (vals[k] = vals[k] || new Set()).add(JSON.stringify(v)); };
  let nonWhite = 0;
  scene.traverse((o) => { if (!o.isMesh || !o.material) return; const mp = R.properties.get(o.material), U = mp && mp.uniforms; if (!U) return;
    const g = (k) => (U[k] ? (U[k].value && U[k].value.toArray ? U[k].value.toArray() : U[k].value) : null);
    put('canopyGrad', g('uCanopyGrad')); put('canopySat', g('uCanopySat')); put('canopyLift', g('uCanopyLift')); put('canopyBack', g('uCanopyBack')); put('cloudLit', g('uCloudLit')); put('haze', g('uHaze')); put('bounce', g('uBounce'));
    if (o.isInstancedMesh && o.instanceColor && /^(pine|tree_round_a):/.test(o.name)) { const a = o.instanceColor.array; for (let i = 0; i < o.count * 3; i++) if (a[i] !== 1) { nonWhite++; break; } } });
  return { diff, n, vals: Object.fromEntries(Object.entries(vals).map(([k, s]) => [k, [...s]])), nonWhite };
}

async function main() {
  const a = process.argv.slice(2), BREAKS = ['black', 'darkmap', 'flip'];
  const USAGE = `usage: node tests/phase2.browser.mjs [--page index.html] [--port 8187] [--break ${BREAKS.join('|')}]`;
  // (M10) every argument is checked before anything runs: a typo must never fail open into an ordinary, passing run
  const bad = (msg) => { console.error(`phase2.browser: ${msg}\n${USAGE}`); process.exit(2); };
  let page0 = 'index.html', port = 8187, brk = null;
  for (let i = 0; i < a.length; i++) {
    const val = () => { const v = a[i + 1]; if (v === undefined || v.startsWith('--')) bad(`${a[i]} needs a value`); i++; return v; };
    if (a[i] === '--page') page0 = val();
    else if (a[i] === '--port') { port = +val(); if (!(Number.isInteger(port) && port > 0 && port < 65536)) bad(`--port takes a port number, got ${a[i]}`); }
    else if (a[i] === '--break') { brk = val(); if (!BREAKS.includes(brk)) bad(`--break takes ${BREAKS.join(' | ')}, got '${brk}'`); }
    else bad(`unknown argument '${a[i]}'`);
  }
  if (brk) console.log(`  *** --break ${brk}: the painted crowns are deliberately broken, T2a / T2b are EXPECTED to fail ***`);
  let child = null;
  if (!(await serverUp(port))) {
    child = spawn(process.execPath, [path.resolve(__dirname, '../shots.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await serverUp(port)); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('error: ' + m.text()); });
    await page.addInitScript(pageInit);
    await page.goto(`http://127.0.0.1:${port}/${page0}?ui=0&shot=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true && window.__t && window.__t.renderer, null, { timeout: 600000, polling: 250 });
    const G = LP.presets['Golden afternoon'];
    const sel = async (n) => { const s = await page.evaluate((nm) => !!(window.__look && window.__look.select(nm)), n); await frames(page); return s; };

    // ---- G0 revert: Game (current) neutral; record its cloud count ----
    await sel('Game (current)');
    const neu = await page.evaluate(inspectNeutral);
    // the strength component of each Phase-2 uniform (vec4 strength-first / colour + strength-last / float)
    const STRENGTH = { canopyGrad: (v) => v[0], canopySat: (v) => v - 1, canopyLift: (v) => v, canopyBack: (v) => v[3], cloudLit: (v) => v[0], haze: (v) => v[3], bounce: (v) => v[0] + v[1] + v[2] };   // (canopySat: 1 = neutral)
    const neutralVals = Object.entries(neu.vals).every(([k, list]) => list.every((s) => STRENGTH[k](JSON.parse(s)) === 0));
    ok('G0 Game (current): terrain colours = the base core colours exactly; Phase-2 uniforms neutral; canopy tints white', neu.diff === 0 && neutralVals && neu.nonWhite === 0,
      `${neu.diff} of ${neu.n} colour floats differ; uniforms ${JSON.stringify(neu.vals)}; non-white tinted meshes ${neu.nonWhite}`);
    const camCfg = { fov: A.render.camera.fov, cams: [{ name: 'default_mobile', ...A.cameras.default_mobile }, { name: 'default_desktop', ...A.cameras.default_desktop }, { name: 'full', ...A.views.full }] };
    const cGame = await page.evaluate(inspectClouds, camCfg);

    // ---- Golden afternoon ----
    await sel('Golden afternoon');
    const cn = await page.evaluate(inspectCanopy), U = cn.uniforms || {}, lum = (c) => (c ? 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] : NaN);
    const gradOn = Array.isArray(U.grad) && U.grad[0] > 0, darkerCooler = U.bottom && U.top && lum(U.bottom) < lum(U.top) && U.bottom[2] / U.bottom[0] > U.top[2] / U.top[0];
    ok('T1a canopies: aTreeH (height within the tree) spans 0..1 on every canopy mesh; the fragment shader uses it; gradient on, bottom darker + cooler than top',
      cn.meshes > 0 && cn.withAttr === cn.meshes && cn.range[0] <= 0.05 && cn.range[1] >= 0.95 && cn.shaderUses === cn.meshes && gradOn && darkerCooler,
      `${cn.meshes} canopy meshes (${JSON.stringify(cn.kinds)}), ${cn.withAttr} with aTreeH [${cn.range.map((v) => (Number.isFinite(v) ? v.toFixed(3) : v)).join(', ')}], shader uses it: ${cn.shaderUses}; uniforms ${JSON.stringify(U)}`);
    const dh = cn.dhS, dv = cn.dvS;
    ok('T1b per-instance tints: every canopy mesh has instanceColor; hue within +/-6 % of the wheel, value within +/-6 %, and they vary',
      cn.meshes > 0 && cn.untinted === 0 && dh && dv && dh.max <= 0.06 && Math.max(Math.abs(dv.min), Math.abs(dv.max)) <= 0.06 && (dv.std > 0.01 || dh.std > 0.005),
      dh ? `${dh.n} instances: |d hue| max ${(dh.max * 100).toFixed(2)} % (mean ${(dh.mean * 100).toFixed(2)} %), d value ${(dv.min * 100).toFixed(2)}..${(dv.max * 100).toFixed(2)} % (std ${(dv.std * 100).toFixed(2)} %)` : `no instance tints (${cn.untinted} untinted canopy meshes)`);
    const probe = await page.evaluate(crownProbe, { fov: A.render.camera.fov, fog: G.fog, brk, black: CROWN.black, views: { woodland: A.views.woodland, full: A.views.full, lake: A.views.lake } });
    const f3 = (v) => (v != null && Number.isFinite(v) ? v.toFixed(3) : '-'), desc = (r) => r.n ? `${r.n} px, median ${f3(r.med)}, p05 ${f3(r.p05)}, min ${f3(r.min)}, ${(r.dark * 100).toFixed(1)} % below ${CROWN.black}` : 'no pixels';
    const crownOk = (r, med) => r.n >= CROWN.n && r.med >= med && r.dark <= CROWN.dark;
    ok(`T2a conifer crowns never black: painted tree_pine_* leaves (eroded) median luma >= ${CROWN.medConifer}, <= ${CROWN.dark * 100} % of the pixels below luma ${CROWN.black}, in woodland / full / lake`,
      Object.values(probe).every(({ conifer: r }) => crownOk(r, CROWN.medConifer)), Object.entries(probe).map(([v, r]) => `${v}: ${desc(r.conifer)}`).join(' | '));
    ok(`T2b broadleaf crowns never black: every other painted crown (eroded) median luma >= ${CROWN.medBroad}, <= ${CROWN.dark * 100} % of the pixels below luma ${CROWN.black}, in woodland / full / lake`,
      Object.values(probe).every(({ broad: r }) => crownOk(r, CROWN.medBroad)), Object.entries(probe).map(([v, r]) => `${v}: ${desc(r.broad)}`).join(' | '));
    const cGold = await page.evaluate(inspectClouds, camCfg), fgAll = Object.values(cGold.cams).reduce((s, c) => s + c.fg, 0);
    ok('C1 clouds: visible puffs <= 50 % of Game (current); none in frame AND in the foreground of default_mobile / default_desktop / full', cGold.visible <= 0.5 * cGame.visible && fgAll === 0,
      `visible ${cGold.visible} vs Game ${cGame.visible} (${(100 * cGold.visible / Math.max(1, cGame.visible)).toFixed(0)} %); ` + Object.entries(cGold.cams).map(([n, c]) => `${n} (d ${c.dist}): ${c.inFrame} in frame, ${c.fg} foreground${c.ex.length ? ' e.g. ' + JSON.stringify(c.ex) : ''}`).join('; '));
    const sky = await page.evaluate(inspectSky), Z = [1, 3, 5].map((i) => parseInt(G.sky.zenith.slice(i, i + 2), 16));
    const top = await page.evaluate(viewTop, 'full'), dTop = Math.max(...top.map((v, k) => Math.abs(v - Z[k])));
    const sky2 = await page.evaluate(inspectSky);
    const want = G.sky.screenTint ? G.sky.screenTint.strength : null;
    ok('K1 sky: gameplay camera -> the dome screen tint is on (= sky.screenTint.strength); the full photo view keeps the true dome (top != zenith)',
      sky.dome && sky.tint != null && want != null && Math.abs(sky.tint - want) < 1e-6 && want > 0 && dTop > 30 && sky2.tint === sky.tint,
      `dome ${sky.dome}, uScreenTint ${sky.tint} (preset ${want}), after __viewShot ${sky2.tint}; full view top median (${top.join(',')}) vs zenith (${Z.join(',')}): max |d| ${dTop}`);
  } finally {
    await browser.close();
    if (child) child.kill();
  }
  ok('B0 no page errors', !errors.length, errors.slice(0, 4).join(' | ') || 'none');
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
  console.log(`\n  LOOK-BRIEF PHASE 2 RUNTIME CRITERIA (${page0})`); console.log('  ' + '-'.repeat(100));
  for (const x of results) { if (!x.pass) fails++; console.log('  ' + (x.pass ? 'PASS' : 'FAIL') + '  ' + pad(x.name, 96) + '\n        ' + x.detail); }
  console.log('  ' + '-'.repeat(100)); console.log(`  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
