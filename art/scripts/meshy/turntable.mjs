// node meshy/turntable.mjs <out.png> <title> <model.glb>[,concept.png] ... [--pose Head:x0.7,Tail:y0.5]
// One row per model: its concept image, then the model from the concept's angle (front-left, elevated), front-right, back-right
// and back-left, plus a posed shot (named nodes rotated as the game animates them: Head x = peck, Tail y = wag) and the game's
// own camera angle (polar 1.0668 = 29 deg above the horizon, from the front-left). Soft neutral light on the concepts' light grey,
// so a model can be judged against its concept. Headless SwiftShader; three from art/scripts/node_modules.
import { requirePlaywright } from '../lib/playwright.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pw = requirePlaywright();
const here = path.dirname(fileURLToPath(import.meta.url)), three = path.join(here, '..', 'node_modules', 'three');
const args = process.argv.slice(2), pi = args.indexOf('--pose'), POSE = pi >= 0 ? args.splice(pi, 2)[1] : 'Head:x0.7,Tail:y0.5';
const fi = args.indexOf('--focus'), FOCUS = fi >= 0 ? args.splice(fi, 2)[1] : '';   // --focus Head: frame that node (a close-up of the cut)
const api = args.indexOf('--allPosed'), ALLPOSED = api >= 0 && !!args.splice(api, 1);   // every view posed (close-ups of a moved part)
const ci = args.indexOf('--cols'), COLS = ci >= 0 ? +args.splice(ci, 2)[1] : 7;   // fewer columns = bigger cells (close-up review)
const [out, title, ...items] = args;
const rows = items.map((s) => { const [glb, concept] = s.split(','); return { glb, concept, id: path.basename(glb, '.glb') }; });
const files = new Map(rows.flatMap((r, i) => [[`/m${i}.glb`, r.glb], ...(r.concept ? [[`/c${i}.png`, r.concept]] : [])]));
const page0 = `<!doctype html><meta charset=utf8><style>body{margin:0;background:#1d1a22;color:#efe7da;font:14px system-ui,sans-serif;width:1680px;padding:10px;box-sizing:border-box}
h1{font-size:18px;margin:2px 4px 8px}.r{display:grid;grid-template-columns:repeat(${COLS},1fr);gap:6px;margin-bottom:8px}figure{margin:0}img,canvas{width:100%;aspect-ratio:1;display:block;border-radius:5px;background:#d2d2d2;object-fit:contain}
figcaption{padding:3px 2px;color:#cfc4b4;font-size:12px}</style><h1 id=t></h1><div id=g></div>
<script type=importmap>{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type=module>
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const rows = ${JSON.stringify(rows.map((r, i) => ({ id: r.id, glb: `/m${i}.glb`, concept: r.concept ? `/c${i}.png` : null })))}, POSE = ${JSON.stringify(POSE)}, FOCUS = ${JSON.stringify(FOCUS)}, ALLPOSED = ${ALLPOSED};
document.getElementById('t').textContent = ${JSON.stringify(title)};
const S = ${COLS < 7 ? 640 : 400}, ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setSize(S, S); ren.outputColorSpace = THREE.SRGBColorSpace;
// azimuth from +Z toward +X; the game camera sits at azimuth 0.7854 (+X +Z side), polar 1.0668
const views = [['front-left (concept angle)', -45, 24], ['front-right', 45, 24], ['back-right', 135, 24], ['back-left', -135, 24], ['posed: ' + POSE, -45, 24, true], ['game camera (az 45, 29 deg)', 45, 29]];
for (const r of rows) {
  const row = document.createElement('div'); row.className = 'r'; document.getElementById('g').appendChild(row);
  const fig = (el, cap) => { const f = document.createElement('figure'); f.appendChild(el); const c = document.createElement('figcaption'); c.textContent = cap; f.appendChild(c); row.appendChild(f); };
  if (r.concept) { const im = new Image(); im.src = r.concept; await im.decode(); fig(im, r.id + ': concept'); } else fig(document.createElement('canvas'), r.id + ': no concept');
  const gltf = await new GLTFLoader().loadAsync(r.glb), root = gltf.scene, scene = new THREE.Scene(); scene.background = new THREE.Color(0xd2d2d2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a6, 1.6)); const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-2, 4, 3); scene.add(sun);
  scene.add(root); const nodes = {}; root.traverse((o) => { nodes[o.name] = o; });
  const fo = FOCUS && nodes[FOCUS], box = new THREE.Box3().setFromObject(fo || root), c = box.getCenter(new THREE.Vector3()), rad = box.getSize(new THREE.Vector3()).length() / 2 * (fo ? 1.5 : 1);
  const base = Object.fromEntries(Object.entries(nodes).map(([k, o]) => [k, [o.rotation.clone(), o.position.clone()]]));
  for (const [cap, az, el, posed] of views) {
    for (const [k, o] of Object.entries(nodes)) { o.rotation.copy(base[k][0]); o.position.copy(base[k][1]); }
    // pose: Node:x0.7 sets rotation.x; Node:ty0.07 adds 0.07 to position.y (the cat's head lift)
    if (posed || ALLPOSED) for (const p of POSE.split(',')) { const [n, v] = p.split(':'); if (!nodes[n]) continue; if (v[0] === 't') nodes[n].position[v[1]] += +v.slice(2); else nodes[n].rotation[v[0]] = +v.slice(1); }
    const cam = new THREE.PerspectiveCamera(30, 1, rad / 50, rad * 50), d = rad / Math.sin(15 * Math.PI / 180) * 1.02, a = az * Math.PI / 180, e = el * Math.PI / 180;
    cam.position.set(c.x + d * Math.cos(e) * Math.sin(a), c.y + d * Math.sin(e), c.z + d * Math.cos(e) * Math.cos(a)); cam.lookAt(c);
    ren.render(scene, cam); const im = new Image(); im.src = ren.domElement.toDataURL('image/png'); await im.decode();
    fig(im, cap + (posed && !Object.keys(nodes).some((n) => POSE.includes(n + ':')) ? ' (no such nodes)' : ''));
  }
}
window.__done = true;
</script>`;
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') { res.setHeader('content-type', 'text/html'); return res.end(page0); }
  let f = files.get(u); if (!f && u.startsWith('/three/')) f = path.join(three, u.slice(7));
  if (!f || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream'); fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 900 } }); const errs = [];
page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/`); await page.waitForFunction(() => window.__done === true, null, { timeout: 600000 });
await page.screenshot({ path: out, fullPage: true }); await browser.close(); srv.close();
if (errs.length) console.log('errors:\n' + errs.slice(0, 8).join('\n'));
console.log('wrote', out);
