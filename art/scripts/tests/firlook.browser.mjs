// firlook.browser.mjs -- the firs are calm, not blotchy (the owner, 2026-10-25: "The fir trees look weird and blotchy and unnatural"),
// in headless Chromium (SwiftShader) with the game's three.js.
// =============================================================================
// Usage:  node tests/firlook.browser.mjs   (FIRLOOK_RECEIVES / FIRLOOK_BACKLIT=true|false: the game's canopy rules overridden, for measuring)
// Each fir (tree_pine_a, tree_pine_b: art/reskin/<id>.glb) alone, as the game draws it: the game camera's slant (azimuth 45 deg,
// elevation 29 deg), its afternoon light (skyPalette.ts at 14.5 h: sun and hemisphere), PCF shadows, the canopy lit as
// src/world/composedLight.ts says for a conifer's canopy (receivesShadow: whether it takes shadows; backLitAsFront: its fronds' backs
// lit with their front's normal, assetMaterials.ts backLit; where the file is absent, the game before the fix: shadows taken, backs
// turned round), at rotY 0 / 90 / 180 / 270. Against the same render of the firs as they were (BASE: art/reskin at commit 2da37fd, lit
// as Composed.tsx drew every mesh then).
//   F1 patchSd (the fir diagnosis's blotch measure): over the crown's pixels, the luminance after a 9 px box blur minus its own row's
//      mean (the top-to-bottom shade-to-sun gradient taken out), its standard deviation: what is left is patches. Per fir, the mean
//      over the four turns is <= 0.75 x BASE's (at least 25 % calmer)
//   F2 not darker for it: the share of very dark crown pixels (luminance < 0.12) is no more than BASE's, and the crown's mean
//      luminance within 15 % of BASE's (calmer by painting, not by drowning the crown in shade or washing it out)
// =============================================================================
import { requirePlaywright, REPO_ROOT } from '../lib/playwright.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BASE_COMMIT = '2da37fd';
const IDS = ['tree_pine_a', 'tree_pine_b'], ROTS = [0, 90, 180, 270], SIZE = 320;
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

// the game's rules for a conifer's canopy (src/world/composedLight.ts; Node strips its types)
let receives = true, backlit = false, rule = 'absent: shadows taken, frond backs turned round (the game before the fix)';
const RULE = path.join(REPO_ROOT, 'src', 'world', 'composedLight.ts');
if (fs.existsSync(RULE)) { const m = await import(pathToFileURL(RULE).href); receives = m.receivesShadow('trees', true, true); backlit = !!m.backLitAsFront?.('trees', true, true);
  rule = `receivesShadow = ${receives}, backLitAsFront = ${backlit}`; }
// (FIRLOOK_RECEIVES / FIRLOOK_BACKLIT=true|false override them: to measure the models' share of the change apart from the game's)
if (process.env.FIRLOOK_RECEIVES) { receives = process.env.FIRLOOK_RECEIVES === 'true'; rule += `; FIRLOOK_RECEIVES=${receives}`; }
if (process.env.FIRLOOK_BACKLIT) { backlit = process.env.FIRLOOK_BACKLIT === 'true'; rule += `; FIRLOOK_BACKLIT=${backlit}`; }

// the models: today's (art/reskin) and BASE's (git show)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'firlook-'));
for (const id of IDS) {
  fs.mkdirSync(path.join(tmp, 'base'), { recursive: true });
  try { fs.writeFileSync(path.join(tmp, 'base', id + '.glb'), execFileSync('git', ['show', `${BASE_COMMIT}:art/reskin/${id}.glb`], { cwd: REPO_ROOT, maxBuffer: 1 << 26 })); }
  catch (e) { console.log(`  FAIL  fixtures: art/reskin/${id}.glb at ${BASE_COMMIT} (git show): ${String(e.message).split('\n')[0]}`); process.exit(1); }
}
const NOW = path.join(REPO_ROOT, 'art', 'reskin'), THREE_DIR = path.join(REPO_ROOT, 'node_modules', 'three');
if (!fs.existsSync(path.join(THREE_DIR, 'build', 'three.module.js'))) { console.log(`  FAIL  fixtures: the game's three.js (${THREE_DIR}; npm ci at the repo root)`); process.exit(1); }

const PAGE = `
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const Q = new URLSearchParams(location.search), SIZE = +Q.get('size'), RECEIVES = Q.get('receives') === 'true', BACKLIT = Q.get('backlit') === 'true';
// the game's afternoon light (skyPalette.ts at 14.5 h, keys 13 -> 16.6, smoothstep)
function sky(hour) {
  const a = { sun: '#FFF5E4', sunI: 1.9, hemiSky: '#E2EDF0', hemiGround: '#80705A', hemiI: 1.1 }, b = { sun: '#FFE3B5', sunI: 1.75, hemiSky: '#E6E2DA', hemiGround: '#806A55', hemiI: 1.0 };
  const raw = (hour - 13) / 3.6, t = raw * raw * (3 - 2 * raw), mix = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), t), num = (k) => a[k] + (b[k] - a[k]) * t;
  const day = Math.min(1, Math.max(0, (hour - 6) / 14)), az = -1.05 + day * 3.5, el = 0.28 + Math.sin(Math.PI * day) * 0.85;
  return { sun: mix(a.sun, b.sun), sunI: num('sunI'), hemiSky: mix(a.hemiSky, b.hemiSky), hemiGround: mix(a.hemiGround, b.hemiGround), hemiI: num('hemiI'),
    dir: new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize() };
}
const BG = [0xd9, 0xe6, 0xea];
const ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setPixelRatio(1); ren.setSize(SIZE, SIZE);
ren.outputColorSpace = THREE.SRGBColorSpace; ren.toneMapping = THREE.NoToneMapping; ren.shadowMap.enabled = true; ren.shadowMap.type = THREE.PCFShadowMap;
function shot(model, rotY) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('rgb(' + BG.join(',') + ')');
  const k = sky(14.5); scene.add(new THREE.HemisphereLight(k.hemiSky, k.hemiGround, k.hemiI));
  const sun = new THREE.DirectionalLight(k.sun, k.sunI); sun.position.copy(k.dir).multiplyScalar(40); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; scene.add(sun, sun.target);
  const holder = new THREE.Group(); holder.add(model); holder.rotation.y = rotY * Math.PI / 180; scene.add(holder);
  const box = new THREE.Box3().setFromObject(model), h = box.getSize(new THREE.Vector3()), rad = Math.max(h.x, h.y, h.z) * 0.62, d = rad / Math.sin(15 * Math.PI / 180);
  const a = 45 * Math.PI / 180, e = 29 * Math.PI / 180, cam = new THREE.PerspectiveCamera(30, 1, 0.05, 200), tgt = new THREE.Vector3(0, h.y / 2 + box.min.y, 0);
  cam.position.set(d * Math.cos(e) * Math.sin(a), tgt.y + d * Math.sin(e), d * Math.cos(e) * Math.cos(a)); cam.lookAt(tgt);
  ren.render(scene, cam); holder.remove(model);
  const c2 = document.createElement('canvas'); c2.width = SIZE; c2.height = SIZE; const g = c2.getContext('2d'); g.drawImage(ren.domElement, 0, 0);
  return g.getImageData(0, 0, SIZE, SIZE).data;
}
// the fir diagnosis's measure: crown pixels = greenish and not the background
function metrics(d, W, H) {
  const L = new Float32Array(W * H), M = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2]; L[i] = (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
    M[i] = Math.abs(r - BG[0]) + Math.abs(gg - BG[1]) + Math.abs(b - BG[2]) > 24 && gg >= r * 0.8 ? 1 : 0; }
  const R = 4, rows = []; let n = 0, ls = 0, dark = 0;
  for (let y = R; y < H - R; y += 2) for (let x = R; x < W - R; x += 2) { const i = y * W + x; if (!M[i]) continue; let a = 0, m = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const j = i + dy * W + dx; if (M[j]) { a += L[j]; m++; } }
    n++; ls += L[i]; if (L[i] < 0.12) dark++; rows.push([y, a / m]); }
  const rm = new Map(); for (const [y, v] of rows) { const e = rm.get(y) || [0, 0]; e[0] += v; e[1]++; rm.set(y, e); }
  let ps2 = 0; for (const [y, v] of rows) { const e = rm.get(y); ps2 += (v - e[0] / e[1]) ** 2; }
  return { px: n, patchSd: Math.sqrt(ps2 / n), meanL: ls / n, darkShare: dark / n };
}
const loader = new GLTFLoader(), out = [];
for (const v of ['base', 'now']) for (const id of Q.get('ids').split(',')) {
  const g = await loader.loadAsync('/models/' + v + '/' + id + '.glb'), root = g.scene;
  root.traverse((o) => { if (!o.isMesh) return; o.castShadow = true; let canopy = false; for (let p = o; p; p = p.parent) if (p.name === 'Canopy') canopy = true;
    const fir = canopy && !!root.getObjectByName('Crown'); o.receiveShadow = fir ? (v === 'base' ? true : RECEIVES) : true;
    // (assetMaterials.ts backLit: the normal turned back to the front's on a face seen from behind)
    if (fir && v === 'now' && BACKLIT) { const m = o.material, before = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { before.call(m, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\\n#if defined( DOUBLE_SIDED ) && !defined( FLAT_SHADED )\\n  normal *= faceDirection;\\n#endif'); };
      m.customProgramCacheKey = () => 'back-lit'; m.needsUpdate = true; }
    for (const m of [o.material].flat()) if (m.map) { m.map.anisotropy = 8; m.map.needsUpdate = true; } });
  for (const rot of Q.get('rots').split(',').map(Number)) out.push({ v, id, rot, ...metrics(shot(root, rot), SIZE, SIZE) });
}
window.__out = out; window.__done = true;
`;
const html = `<!doctype html><meta charset=utf8><script type=importmap>{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script><script type=module src="/page.js"></script>`;
const srv = http.createServer((rq, res) => {
  const u = decodeURIComponent(rq.url.split('?')[0]); let f = null;
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(html); }
  if (u === '/page.js') { res.setHeader('content-type', 'text/javascript'); return res.end(PAGE); }
  if (u.startsWith('/three/')) f = path.join(THREE_DIR, u.slice(7));
  else if (u.startsWith('/models/base/')) f = path.join(tmp, 'base', path.basename(u));
  else if (u.startsWith('/models/now/')) f = path.join(NOW, path.basename(u));
  if (!f || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const pw = requirePlaywright();
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let out = null;
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } }), errs = [];
  page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${srv.address().port}/?size=${SIZE}&ids=${IDS.join(',')}&rots=${ROTS.join(',')}&receives=${receives}&backlit=${backlit}`);
  // (a page error fails at once: the page never finishes)
  await Promise.race([page.waitForFunction(() => window.__done === true, null, { timeout: 900000, polling: 500 }), new Promise((_, no) => page.on('pageerror', (e) => no(e)))]);
  out = await page.evaluate(() => window.__out);
  if (errs.length) console.log('  page errors: ' + errs.slice(0, 3).join(' | '));
} finally { await browser.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); }

console.log(`  the game's rules for a conifer's canopy: ${rule}`);
const mean = (v, id, k) => { const a = out.filter((c) => c.v === v && c.id === id); return a.reduce((s, c) => s + c[k], 0) / a.length; };
for (const id of IDS) {
  const b = mean('base', id, 'patchSd'), n = mean('now', id, 'patchSd'), per = (v) => out.filter((c) => c.v === v && c.id === id).map((c) => c.patchSd.toFixed(4)).join(' ');
  ok(`F1 ${id}: patchSd (the crown's patches at the game camera, mean of rotY ${ROTS.join(' / ')}) <= 0.75 x ${BASE_COMMIT}'s`, n <= 0.75 * b,
    `now ${n.toFixed(4)} (${per('now')}), ${BASE_COMMIT} ${b.toFixed(4)} (${per('base')}): ${(100 * (n / b - 1)).toFixed(1)} %`);
  const db = mean('base', id, 'darkShare'), dn = mean('now', id, 'darkShare'), lb = mean('base', id, 'meanL'), ln = mean('now', id, 'meanL');
  ok(`F2 ${id}: no more very dark crown pixels than ${BASE_COMMIT}, the crown's mean luminance within 15 % of its`, dn <= db + 1e-9 && Math.abs(ln / lb - 1) <= 0.15,
    `dark share ${(100 * dn).toFixed(2)} % vs ${(100 * db).toFixed(2)} %; mean luminance ${ln.toFixed(3)} vs ${lb.toFixed(3)}`);
}
let fail = 0; for (const r of results) { if (!r.pass) fail++; console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n        ${r.detail}`); }
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
