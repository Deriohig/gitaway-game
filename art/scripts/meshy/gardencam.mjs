// node meshy/gardencam.mjs <outPrefix> [modelsDir]
// The garden from the GAME's camera (ART-BIBLE §F camera table): every crop at every stage on the published plot, one crop per column
// (radish ... cranberry, then sunflower and lavender) and one stage per row (1 sprout at the back, 3 ready at the front), at the game's
// plot spacing (layout.ts GARDEN cell 1.12) around the real garden's centre (2.69, 0.64); each crop at the plot origin + 0.16, as
// Garden.tsx draws it. A flat lawn (lawn.mid), the game's 13 h lights (sun #FFF5E4 x 1.9, hemisphere #E2EDF0 / #80705A x 1.1), no tone
// mapping, sRGB out, textures at anisotropy 8. The game's UI overlays, as Garden.tsx draws them (--no-ui leaves them out): the selection
// Outline on every plot (four bars 0.04 wide, 0.5 out from the centre, at y 0.17; cream #FFF8EC, gold #E8BD72 when the crop is ready) and
// the ReadyMarker over each ready plot (the gold octahedron at y 0.85, mid-bob). Writes:
//   <outPrefix>_desk.png         CAM-DESK: 1440 x 900, target (0, -0.6, 0), azimuth pi/4, polar 1.0668, fov 30, distance 35.45 (the default)
//   <outPrefix>_desk_garden.png  the same zoom aimed at the garden
//   <outPrefix>_close.png        CAM-CLOSE: distance 14 (the closest zoom) aimed at the garden, crop names under the front (ready) row
//   <outPrefix>_phone.png        CAM-PHONE: 390 x 844 @2 portrait, distance 103.6 (the phone default, MAIN framed), target (0, -0.6, 0)
import { requirePlaywright } from '../lib/playwright.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pw = requirePlaywright();
const here = path.dirname(fileURLToPath(import.meta.url)), three = path.join(here, '..', 'node_modules', 'three');
const argv = process.argv.slice(2), UI = !argv.includes('--no-ui'), [prefix, dirArg] = argv.filter((a) => a !== '--no-ui'), dir = dirArg || path.join(here, '..', '..', '..', 'public', 'models');
const CROPS = ['radish', 'carrot', 'wheat', 'lettuce', 'tomato', 'pumpkin', 'blueberry', 'cranberry', 'sunflower', 'lavender'];
const ids = ['plot', ...CROPS.flatMap((c) => [1, 2, 3].map((s) => `crop_${c}_${s}`))];
const page0 = `<!doctype html><meta charset=utf8><body style="margin:0;background:#1d1a22">
<script type=importmap>{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type=module>
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const CROPS = ${JSON.stringify(CROPS)}, CELL = 1.12, C0 = [2.69, 0.64], loader = new GLTFLoader(), cache = {};
const load = async (id) => (cache[id] ??= (await loader.loadAsync('/m/' + id + '.glb')).scene);
const s = new THREE.Scene(); s.background = new THREE.Color(0xc9dfe3);
s.add(new THREE.HemisphereLight(0xe2edf0, 0x80705a, 1.1)); const sun = new THREE.DirectionalLight(0xfff5e4, 1.9); sun.position.set(-6, 10, 5); s.add(sun);
const g = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshLambertMaterial({ color: 0x7aae72 })); g.rotation.x = -Math.PI / 2; g.position.y = -0.02; s.add(g);
const cols = [];
// Garden.tsx's overlays: Outline (half = GARDEN.plot / 2 + 0.03, group at y 0.17, bars scaled [w, 0.02, d]; ringMat, or gold when ready) and
// ReadyMarker (sparkleGeo / sparkleMat at y 0.85 +- 0.06, scale [0.07, 0.11, 0.07])
const UI = ${UI}, HALF = 0.94 / 2 + 0.03, BOX = new THREE.BoxGeometry(1, 1, 1), OCT = new THREE.OctahedronGeometry(1, 0);
const ring = new THREE.MeshBasicMaterial({ color: '#FFF8EC', transparent: true, opacity: 0.85 }), gold = new THREE.MeshBasicMaterial({ color: '#E8BD72', transparent: true, opacity: 0.9 });
const spark = new THREE.MeshLambertMaterial({ color: '#F6E3B4', emissive: new THREE.Color('#E8BD72'), emissiveIntensity: 0.6, flatShading: true });
for (const [ci, crop] of CROPS.entries()) for (const st of [1, 2, 3]) {
  const x = C0[0] + (ci - (CROPS.length - 1) / 2) * CELL, z = C0[1] + (st - 2) * CELL, grp = new THREE.Group(); grp.position.set(x, -0.02, z);
  grp.add((await load('plot')).clone()); const c = (await load('crop_' + crop + '_' + st)).clone(); c.position.y = 0.16; grp.add(c); s.add(grp);
  if (UI) { const og = new THREE.Group(); og.position.y = 0.17; grp.add(og);
    for (const [bx, bz, w, d] of [[0, HALF, 2 * HALF, 0.04], [0, -HALF, 2 * HALF, 0.04], [HALF, 0, 0.04, 2 * HALF], [-HALF, 0, 0.04, 2 * HALF]]) { const b = new THREE.Mesh(BOX, st === 3 ? gold : ring); b.position.set(bx, 0, bz); b.scale.set(w, 0.02, d); og.add(b); }
    if (st === 3) { const mk = new THREE.Mesh(OCT, spark); mk.position.y = 0.85; mk.scale.set(0.07, 0.11, 0.07); grp.add(mk); } }
  if (st === 3) cols.push([crop, x, z]); }
s.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m.map) { m.map.anisotropy = 8; m.map.needsUpdate = true; } });
const shot = (W, H, dpr, t, d, labels) => {
  const ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setPixelRatio(dpr); ren.setSize(W, H); ren.outputColorSpace = THREE.SRGBColorSpace;
  const c = new THREE.PerspectiveCamera(30, W / H, 0.5, 600), az = Math.PI / 4, po = 1.0668;
  c.position.set(t[0] + d * Math.sin(po) * Math.sin(az), t[1] + d * Math.cos(po), t[2] + d * Math.sin(po) * Math.cos(az)); c.lookAt(...t); c.updateMatrixWorld();
  ren.render(s, c);
  const cv = document.createElement('canvas'); cv.width = W * dpr; cv.height = H * dpr; const x2 = cv.getContext('2d'); x2.drawImage(ren.domElement, 0, 0);
  if (labels) { x2.font = (15 * dpr) + 'px system-ui, sans-serif'; x2.textAlign = 'center';
    for (const [name, x, z] of cols) { const p = new THREE.Vector3(x + 0.51, 0, z + 0.51).project(c), px = (p.x + 1) / 2 * W * dpr, py = (1 - p.y) / 2 * H * dpr + 22 * dpr;   // under the plot's front corner
      x2.fillStyle = 'rgba(29,26,34,0.72)'; const w = x2.measureText(name).width + 12 * dpr; x2.fillRect(px - w / 2, py - 15 * dpr, w, 20 * dpr); x2.fillStyle = '#efe7da'; x2.fillText(name, px, py); } }
  ren.dispose(); return cv.toDataURL('image/png'); };
const G = [C0[0], 0.3, C0[1]];
window.__shots = { desk: shot(1440, 900, 1, [0, -0.6, 0], 35.45), desk_garden: shot(1440, 900, 1, G, 35.45), close: shot(1440, 900, 1, G, 14, true), phone: shot(390, 844, 2, [0, -0.6, 0], 103.6) };
window.__done = true;
</script>`;
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(page0); }
  let f = null; if (u.startsWith('/m/') && ids.includes(path.basename(u, '.glb'))) f = path.join(dir, path.basename(u)); else if (u.startsWith('/three/')) f = path.join(three, u.slice(7));
  if (!f || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errs = [];
page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/`); await page.waitForFunction(() => window.__done === true, null, { timeout: 900000 });
const shots = await page.evaluate(() => window.__shots);
for (const [name, url] of Object.entries(shots)) { fs.writeFileSync(`${prefix}_${name}.png`, Buffer.from(url.split(',')[1], 'base64')); console.log('wrote', `${prefix}_${name}.png`); }
await browser.close(); srv.close();
if (errs.length) console.log('errors:\n' + errs.slice(0, 8).join('\n'));
