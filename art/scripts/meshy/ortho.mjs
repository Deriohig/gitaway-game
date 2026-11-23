// node meshy/ortho.mjs <out.png> <title> <model.glb> ... : one row per model, orthographic views with a world grid, for placing
// --part boxes and pivots: side (camera on +X, looking -X: z to the left... see the axis labels), front (camera on +Z), top
// (camera on +Y, +Z down the page). Grid every 0.05 u (0.1 u lines darker, labelled); named nodes drawn as red crosses.
import { requirePlaywright } from '../lib/playwright.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pw = requirePlaywright();
const here = path.dirname(fileURLToPath(import.meta.url)), three = path.join(here, '..', 'node_modules', 'three');
const [out, title, ...glbs] = process.argv.slice(2);
const files = new Map(glbs.map((g, i) => [`/m${i}.glb`, g]));
const page0 = `<!doctype html><meta charset=utf8><style>body{margin:0;background:#1d1a22;color:#efe7da;font:13px system-ui,sans-serif;width:1500px;padding:10px;box-sizing:border-box}
h1{font-size:17px;margin:2px 4px 8px}.r{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px}figure{margin:0}canvas{width:100%;display:block;border-radius:5px}figcaption{padding:3px 2px;color:#cfc4b4}</style>
<h1 id=t></h1><div id=g></div>
<script type=importmap>{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type=module>
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const glbs = ${JSON.stringify(glbs.map((g, i) => ({ id: path.basename(g, '.glb'), url: `/m${i}.glb` })))};
document.getElementById('t').textContent = ${JSON.stringify(title)};
const S = 480, ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setSize(S, S); ren.outputColorSpace = THREE.SRGBColorSpace;
// [caption, camera dir, up, horizontal axis index + sign, vertical axis index + sign]
const views = [['side: camera on +X (page right = -Z)', [1, 0, 0], [0, 1, 0], [2, -1], [1, 1]], ['front: camera on +Z (page right = +X)', [0, 0, 1], [0, 1, 0], [0, 1], [1, 1]], ['top: camera on +Y (page right = +X, down = +Z)', [0, 1, 0], [0, 0, -1], [0, 1], [2, -1]]];
const AX = 'xyz';
for (const m of glbs) {
  const row = document.createElement('div'); row.className = 'r'; document.getElementById('g').appendChild(row);
  const root = (await new GLTFLoader().loadAsync(m.url)).scene, scene = new THREE.Scene(); scene.background = new THREE.Color(0xd2d2d2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a6, 1.7)); const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(2, 4, 3); scene.add(sun); scene.add(root);
  root.traverse((o) => { if (!o.isMesh) return; for (let p = o; p; p = p.parent) if (p.name === 'Head' || p.name === 'Tail') { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0x7a0000); break; } });   // parts tinted red
  root.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), half = Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 0.6;
  const named = []; root.traverse((o) => { if (o.name && o !== root && !o.isMesh && o.parent) named.push([o.name, o.getWorldPosition(new THREE.Vector3())]); });
  for (const [cap, dir, up, hA, vA] of views) {
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.001, 100); cam.up.set(...up);
    cam.position.set(c.x + dir[0] * 20, c.y + dir[1] * 20, c.z + dir[2] * 20); cam.lookAt(c); ren.render(scene, cam);
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); g.drawImage(ren.domElement, 0, 0);
    const ch = c.toArray()[hA[0]], cvv = c.toArray()[vA[0]], px = (w) => S / 2 + hA[1] * (w - ch) / half * S / 2, py = (w) => S / 2 - vA[1] * (w - cvv) / half * S / 2;
    g.font = '11px sans-serif';
    for (const [a, toPx, isH] of [[hA, px, true], [vA, py, false]]) { const cc = c.toArray()[a[0]], lo = Math.ceil((cc - half) / 0.05), hi = Math.floor((cc + half) / 0.05);
      for (let k = lo; k <= hi; k++) { const w = k * 0.05, p = toPx(w), major = k % 2 === 0; g.strokeStyle = major ? 'rgba(40,40,60,0.45)' : 'rgba(40,40,60,0.15)'; g.lineWidth = Math.abs(w) < 1e-9 ? 2 : 1;
        g.beginPath(); if (isH) { g.moveTo(p, 0); g.lineTo(p, S); } else { g.moveTo(0, p); g.lineTo(S, p); } g.stroke();
        if (major) { g.fillStyle = '#223'; const t = AX[a[0]] + '=' + w.toFixed(1); if (isH) g.fillText(t, p + 2, S - 4); else g.fillText(t, 2, p - 2); } } }
    for (const [n, p] of named) { const h = px(p.toArray()[hA[0]]), v = py(p.toArray()[vA[0]]); g.strokeStyle = '#d00'; g.lineWidth = 2; g.beginPath(); g.moveTo(h - 7, v); g.lineTo(h + 7, v); g.moveTo(h, v - 7); g.lineTo(h, v + 7); g.stroke(); g.fillStyle = '#d00'; g.fillText(n, h + 6, v - 6); }
    const f = document.createElement('figure'); f.appendChild(cv); const fc = document.createElement('figcaption'); fc.textContent = m.id + ': ' + cap; f.appendChild(fc); row.appendChild(f);
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
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } }); const errs = [];
page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/`); await page.waitForFunction(() => window.__done === true, null, { timeout: 600000 });
await page.screenshot({ path: out, fullPage: true }); await browser.close(); srv.close();
if (errs.length) console.log('errors:\n' + errs.slice(0, 8).join('\n'));
console.log('wrote', out);
