// node meshy/gallery.mjs <out.png> <title> <model.glb> ... [--cols 6]
// One cell per model from the game's camera angle (azimuth 45, 29 deg up), auto-framed, captioned with its id, its style (TEXTURED =
// a baseColor map, the painterly Meshy look; FLAT = colours only, the procedural look), triangle count and height: a style audit.
import { requirePlaywright } from '../lib/playwright.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pw = requirePlaywright();
const here = path.dirname(fileURLToPath(import.meta.url)), three = path.join(here, '..', 'node_modules', 'three');
const args = process.argv.slice(2), ci = args.indexOf('--cols'), COLS = ci >= 0 ? +args.splice(ci, 2)[1] : 6;
const [out, title, ...glbs] = args;
const files = new Map(glbs.map((g, i) => [`/m${i}.glb`, g]));
const page0 = `<!doctype html><meta charset=utf8><style>body{margin:0;background:#1d1a22;color:#efe7da;font:14px system-ui,sans-serif;width:1680px;padding:10px;box-sizing:border-box}
h1{font-size:18px;margin:2px 4px 8px}#g{display:grid;grid-template-columns:repeat(${COLS},1fr);gap:6px}figure{margin:0}img{width:100%;aspect-ratio:1;display:block;border-radius:5px;background:#d2d2d2}
figcaption{padding:3px 2px;font-size:12px;color:#cfc4b4}b.t{color:#e8b86a}b.f{color:#8fc0e0}</style><h1 id=t></h1><div id=g></div>
<script type=importmap>{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type=module>
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const items = ${JSON.stringify(glbs.map((g, i) => ({ id: path.basename(g, '.glb'), glb: `/m${i}.glb` })))};
document.getElementById('t').textContent = ${JSON.stringify(title)};
const S = 420, ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setSize(S, S); ren.outputColorSpace = THREE.SRGBColorSpace;
for (const it of items) {
  const gltf = await new GLTFLoader().loadAsync(it.glb), root = gltf.scene, scene = new THREE.Scene(); scene.background = new THREE.Color(0xd2d2d2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a6, 1.6)); const sun = new THREE.DirectionalLight(0xfff2dc, 1.5); sun.position.set(-3, 5, 4); scene.add(sun);
  scene.add(root); let tris = 0, textured = false;
  root.traverse((o) => { if (!o.isMesh) return; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; for (const m of [].concat(o.material)) if (m.map) textured = true; });
  const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), rad = sz.length() / 2;
  const cam = new THREE.PerspectiveCamera(30, 1, rad / 50, rad * 50), d = rad / Math.sin(15 * Math.PI / 180) * 1.02, a = 45 * Math.PI / 180, e = 29 * Math.PI / 180;
  cam.position.set(c.x + d * Math.cos(e) * Math.sin(a), c.y + d * Math.sin(e), c.z + d * Math.cos(e) * Math.cos(a)); cam.lookAt(c);
  ren.render(scene, cam); const im = new Image(); im.src = ren.domElement.toDataURL('image/png'); await im.decode();
  const f = document.createElement('figure'); f.appendChild(im); const cap = document.createElement('figcaption');
  cap.innerHTML = '<b>' + it.id + '</b> &middot; ' + (textured ? '<b class=t>TEXTURED</b>' : '<b class=f>FLAT</b>') + ' &middot; ' + Math.round(tris) + ' tris &middot; ' + sz.y.toFixed(2) + ' u tall';
  f.appendChild(cap); document.getElementById('g').appendChild(f);
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
await page.goto(`http://127.0.0.1:${srv.address().port}/`); await page.waitForFunction(() => window.__done === true, null, { timeout: 600000 });
await page.screenshot({ path: out, fullPage: true }); await browser.close(); srv.close();
if (errs.length) console.log('errors:\n' + errs.slice(0, 8).join('\n'));
console.log('wrote', out);
