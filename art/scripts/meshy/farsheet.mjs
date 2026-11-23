// node meshy/farsheet.mjs <out.png> <dir> <id> [<id> ...]   (task 11b: the far versions' look check)
// Near vs far, side by side: per id a row of three distance pairs (20, 40 and 60 u from the look point), each pair the near version
// (<dir>/<id>.glb) then the far one (<dir>/<id>_far.glb), a cluster of three (the same spots, turns and scales 0.7-0.9 in both), seen
// along the game's own camera direction (Canvas camera [30, 28, 30], fov 30) under the game's midday light (as meshy/forest.mjs:
// skyPalette.ts noon sun #FFF5E4 x 1.9, hemisphere #E2EDF0 / #80705A x 1.1, shadows, no tone mapping, sRGB). Every panel is rendered at
// the GAME's pixel density (a 900 px tall 1440 x 900 frame: the panel is that frame's crop around the cluster, a narrower fov), then
// shown enlarged with square pixels, so what reads (or not) is what the game's pixels hold at that distance. Headless SwiftShader;
// three from art/scripts/node_modules.
import { requirePlaywright } from '../lib/playwright.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pw = requirePlaywright();
const here = path.dirname(fileURLToPath(import.meta.url)), three = path.join(here, '..', 'node_modules', 'three');
const [out, dir, ...ids] = process.argv.slice(2);
if (!out || !dir || !ids.length) throw new Error('usage: node meshy/farsheet.mjs <out.png> <dir> <id> [<id> ...]');
const files = new Map(); ids.forEach((id) => { files.set(`/${id}.glb`, path.join(dir, id + '.glb')); files.set(`/${id}_far.glb`, path.join(dir, id + '_far.glb')); });
const page0 = `<!doctype html><meta charset=utf8><style>body{margin:0;background:#1d1a22;color:#efe7da;font:13px system-ui,sans-serif;width:1680px;padding:10px;box-sizing:border-box}
h1{font-size:18px;margin:2px 4px 4px}p{margin:0 4px 8px;color:#cfc4b4}.r{display:grid;grid-template-columns:120px repeat(6,1fr);gap:5px;margin-bottom:5px;align-items:center}
.h{color:#cfc4b4;font-size:12px;text-align:center}.id{font-size:12px;color:#efe7da;word-break:break-all}figure{margin:0}img{width:100%;display:block;border-radius:4px;image-rendering:pixelated}
figcaption{padding:2px;color:#cfc4b4;font-size:11px}</style><h1>Near vs far versions (task 11b)</h1>
<p>Each pair: near, then far; a cluster of three at the game camera's direction and noon light. Every panel holds the game's own pixels at that distance (a crop of a 1440 x 900 frame), enlarged.</p><div id=g></div>
<script type=importmap>{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type=module>
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const ids = ${JSON.stringify(ids)}, D = [20, 40, 60], GAME_H = 900, FOV = 30;
const ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setPixelRatio(1); ren.outputColorSpace = THREE.SRGBColorSpace;
ren.toneMapping = THREE.NoToneMapping; ren.shadowMap.enabled = true; ren.shadowMap.type = THREE.PCFShadowMap;
const spots = [{ x: -1.25, z: 0.35, yaw: 0.6, s: 0.8 }, { x: 1.05, z: -0.45, yaw: 2.4, s: 0.9 }, { x: 0.15, z: 1.35, yaw: 4.3, s: 0.7 }];
const noon = (() => { const day = 0.5, az = -1.05 + day * 3.5, el = 0.28 + Math.sin(Math.PI * day) * 0.85; return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize(); })();
const loader = new GLTFLoader(), g = document.getElementById('g');
const head = document.createElement('div'); head.className = 'r'; head.innerHTML = '<div></div>' + D.map((d) => '<div class=h>' + d + ' u near</div><div class=h>' + d + ' u far</div>').join(''); g.appendChild(head);
const tris = (sc) => { let n = 0; sc.traverse((o) => { if (o.isMesh) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; }); return n; };
for (const id of ids) {
  const [near, far] = await Promise.all([loader.loadAsync('/' + id + '.glb'), loader.loadAsync('/' + id + '_far.glb')]).then((r) => r.map((x) => x.scene));
  const row = document.createElement('div'); row.className = 'r'; row.innerHTML = '<div class=id>' + id + '</div>'; g.appendChild(row);
  const scenes = [near, far].map((model) => {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd9e6ea);
    scene.add(new THREE.HemisphereLight(0xe2edf0, 0x80705a, 1.1));
    const sun = new THREE.DirectionalLight(0xfff5e4, 1.9); sun.position.copy(noon).multiplyScalar(40); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 90 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
    scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x78a05c, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    for (const sp of spots) { const m = model.clone(true); m.position.set(sp.x, 0, sp.z); m.rotation.y = sp.yaw; m.scale.setScalar(sp.s); m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(m); }
    return scene; });
  const nt = [tris(near), tris(far)];
  for (const d of D) for (let k = 0; k < 2; k++) {
    // the game's pixels per unit at distance d (a 900 px tall frame, fov 30), the cluster's ~4.6 x 3.4 u around the look point
    const ppu = GAME_H / (2 * d * Math.tan(FOV / 2 * Math.PI / 180)), w = Math.round(4.6 * ppu), h = Math.round(3.4 * ppu);
    ren.setSize(w, h); const fov = 2 * Math.atan(h / GAME_H * Math.tan(FOV / 2 * Math.PI / 180)) * 180 / Math.PI;
    const look = new THREE.Vector3(0, 0.9, 0.35), cam = new THREE.PerspectiveCamera(fov, w / h, 0.5, 600); cam.position.copy(new THREE.Vector3(30, 28, 30).normalize()).multiplyScalar(d).add(look); cam.lookAt(look);
    ren.render(scenes[k], cam); const im = new Image(); im.src = ren.domElement.toDataURL('image/png'); await im.decode();
    const fig = document.createElement('figure'); fig.appendChild(im); const c = document.createElement('figcaption'); c.textContent = (k ? 'far ' : 'near ') + nt[k] + ' tris, ' + w + 'x' + h + ' px'; fig.appendChild(c); row.appendChild(fig);
  }
}
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
const page = await browser.newPage({ viewport: { width: 1680, height: 900 } }); const errs = [];
page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/`); await page.waitForFunction(() => window.__done === true, null, { timeout: 900000 });
await page.screenshot({ path: out, fullPage: true }); await browser.close(); srv.close();
if (errs.length) console.log('errors:\n' + errs.slice(0, 8).join('\n'));
console.log('wrote', out);
