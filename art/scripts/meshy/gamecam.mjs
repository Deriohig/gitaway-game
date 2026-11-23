// node meshy/gamecam.mjs <outPrefix> <labelA> <dirA> <labelB> <dirB>
// Before / after sheets of the farmhouse, hero_tree and windmill from the GAME's camera: each model at its game slot (layout.ts:
// HOUSE (-4, -2) rot pi/4, STATIC_TREES[0] hero (-6.4, -3.6) rot HERO_ROT pi/4, WINDMILL (0.7, -5.5) rot 0.124) on a flat meadow,
// textures at anisotropy 8 (what the game will set). One PNG per view, A left and B right, each 1440 x 900:
//   <outPrefix>_default.png  target (0, -0.6, 0), azimuth pi/4, polar 1.0668, fov 30, distance 35.5 (the game's desktop default)
//   <outPrefix>_d14.png      the same at distance 14 (zoomed in); _d14framed.png at 14 aimed at the three models (-3.2, 0.8, -3.7)
//   <outPrefix>_roof.png     the farmhouse alone, its roof from 4.5 u (same angles)
//   <outPrefix>_bark.png     the hero tree alone, its trunk from 3 u (same angles)
// Neutral light (hemisphere + a warm sun), identical for both sides: a comparison of the textures, not the game's day cycle.
import { requirePlaywright } from '../lib/playwright.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pw = requirePlaywright();
const here = path.dirname(fileURLToPath(import.meta.url)), three = path.join(here, '..', 'node_modules', 'three');
const [prefix, labelA, dirA, labelB, dirB] = process.argv.slice(2);
const IDS = ['farmhouse', 'hero_tree', 'windmill'], files = new Map();
for (const [s, d] of [['a', dirA], ['b', dirB]]) for (const id of IDS) files.set(`/${s}/${id}.glb`, path.join(d, `${id}.glb`));
const page0 = `<!doctype html><meta charset=utf8><body style="margin:0;background:#1d1a22">
<script type=importmap>{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type=module>
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const W = 1440, H = 900, ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setSize(W, H); ren.outputColorSpace = THREE.SRGBColorSpace;
const SLOT = { farmhouse: [-4, 0, -2, Math.PI / 4], hero_tree: [-6.4, -0.05, -3.6, Math.PI / 4], windmill: [0.7, 0, -5.5, 0.124] };
async function scene(set, only) {
  const s = new THREE.Scene(); s.background = new THREE.Color(0xbfd7de);
  s.add(new THREE.HemisphereLight(0xeef3f5, 0x6f6a52, 1.25)); const sun = new THREE.DirectionalLight(0xfff0d8, 1.9); sun.position.set(-6, 10, 5); s.add(sun);
  const g = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x7d9b70, roughness: 1 })); g.rotation.x = -Math.PI / 2; s.add(g);
  for (const id of ${JSON.stringify(IDS)}) { if (only && id !== only) continue;
    const r = (await new GLTFLoader().loadAsync('/' + set + '/' + id + '.glb')).scene, [x, y, z, ry] = SLOT[id];
    r.position.set(x, y, z); r.rotation.y = ry;
    r.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) for (const k of ['map', 'emissiveMap']) if (m[k]) { m[k].anisotropy = 8; m[k].needsUpdate = true; } });
    s.add(r); }
  return s; }
const cam = (t, d) => { const c = new THREE.PerspectiveCamera(30, W / H, 0.05, 400), az = Math.PI / 4, po = 1.0668;
  c.position.set(t[0] + d * Math.sin(po) * Math.sin(az), t[1] + d * Math.cos(po), t[2] + d * Math.sin(po) * Math.cos(az)); c.lookAt(...t); return c; };
const VIEWS = { default: [null, [0, -0.6, 0], 35.5], d14: [null, [0, -0.6, 0], 14], d14framed: [null, [-3.2, 0.8, -3.7], 14], roof: ['farmhouse', [-4, 2.0, -2], 4.5], bark: ['hero_tree', [-6.4, 0.75, -3.6], 3] };
window.__shots = {};
for (const [name, [only, t, d]] of Object.entries(VIEWS)) for (const set of ['a', 'b']) {
  const s = await scene(set, only); ren.render(s, cam(t, d)); window.__shots[name + '_' + set] = ren.domElement.toDataURL('image/png'); }
window.__done = true;
</script>`;
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(page0); }
  let f = files.get(u); if (!f && u.startsWith('/three/')) f = path.join(three, u.slice(7));
  if (!f || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errs = [];
page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/`); await page.waitForFunction(() => window.__done === true, null, { timeout: 900000 });
const shots = await page.evaluate(() => window.__shots);
// compose each view: A | B with labels
for (const name of ['default', 'd14', 'd14framed', 'roof', 'bark']) {
  const html = `<!doctype html><meta charset=utf8><style>body{margin:0;background:#1d1a22;color:#efe7da;font:22px system-ui,sans-serif;width:2900px;padding:8px;box-sizing:border-box}
  .g{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:1440px;height:900px;display:block}p{margin:4px 2px 8px}</style>
  <div class=g><div><p>${labelA} &mdash; ${name}</p><img src="${shots[name + '_a']}"></div><div><p>${labelB} &mdash; ${name}</p><img src="${shots[name + '_b']}"></div></div>`;
  const p2 = await browser.newPage({ viewport: { width: 2900, height: 960 } }); await p2.setContent(html); await p2.waitForTimeout(200);
  await p2.screenshot({ path: `${prefix}_${name}.png`, fullPage: true }); await p2.close(); console.log('wrote', `${prefix}_${name}.png`); }
await browser.close(); srv.close();
if (errs.length) console.log('errors:\n' + errs.slice(0, 8).join('\n'));
