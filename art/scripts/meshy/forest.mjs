// node meshy/forest.mjs <out.png> "<title>" "<panel title>=<a.glb>,<b.glb>,<fir.glb>" ["<panel title>=..."] ... [--dupLeaves] [--spacing u]
// (--dupLeaves, an experiment: the a / b models' alpha-cut leaves made two-sided by duplicated faces on a single-sided material, in the
// page, to see what reskin.mjs's dupLeaves would do to a doubleSided model; it showed round 1's dark speckle was the flipped back faces)
// A group-read sheet: per panel, 6 instances of each broadleaf model (a, b) and 4 firs, at seeded random yaw and scale 0.6-0.9 (the
// same spots and turns in every panel), on a flat meadow, seen from the game's own camera direction (Canvas camera [30, 28, 30], fov 30)
// under the game's midday light (skyPalette.ts noon key: sun #FFF5E4 x 1.9 from the day cycle's noon direction, hemisphere #E2EDF0 /
// #80705A x 1.1), with its shadows, no tone mapping and sRGB output (R3F `flat`). Each panel three times: framing the group, farther
// (about an 18 u wide view: closer to how small they read in play) and a close-up. Headless SwiftShader; three from art/scripts/node_modules.
import { requirePlaywright } from '../lib/playwright.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const pw = requirePlaywright();
const here = path.dirname(fileURLToPath(import.meta.url)), three = path.join(here, '..', 'node_modules', 'three');
// A panel of any other number of models (R1's mixed forest and bush rows): 25 spots on a jittered 5 x 5 grid (--spacing u apart,
// default 2.2), the models dealt round-robin over a seeded shuffle of the spots, so every model stands several times among the others.
const argv = process.argv.slice(2), di = argv.indexOf('--dupLeaves'), DUP = di >= 0 && !!argv.splice(di, 1);   // experiment: leaf cards two-sided by duplicated faces
const si = argv.indexOf('--spacing'), SPACING = si >= 0 ? +argv.splice(si, 2)[1] : 2.2;
const [out, title, ...specs] = argv;
const panels = specs.map((s) => { const i = s.indexOf('='); return { name: s.slice(0, i), glbs: s.slice(i + 1).split(',') }; });
const files = new Map(); panels.forEach((p, i) => p.glbs.forEach((g, j) => files.set(`/p${i}_${j}.glb`, g)));
const page0 = `<!doctype html><meta charset=utf8><style>body{margin:0;background:#1d1a22;color:#efe7da;font:14px system-ui,sans-serif;width:1680px;padding:10px;box-sizing:border-box}
h1{font-size:18px;margin:2px 4px 8px}.r{display:grid;grid-template-columns:repeat(${panels.length},1fr);gap:6px;margin-bottom:6px}figure{margin:0}img{width:100%;display:block;border-radius:5px}
figcaption{padding:3px 2px;color:#cfc4b4;font-size:12px}</style><h1 id=t></h1><div id=g></div>
<script type=importmap>{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type=module>
import * as THREE from 'three'; import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const panels = ${JSON.stringify(panels.map((p, i) => ({ name: p.name, glbs: p.glbs.map((_, j) => `/p${i}_${j}.glb`) })))};
document.getElementById('t').textContent = ${JSON.stringify(title)};
const W = Math.floor((1660 - 6 * (panels.length - 1)) / panels.length), H = Math.round(W * 0.72);
const ren = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); ren.setSize(W, H); ren.outputColorSpace = THREE.SRGBColorSpace;
ren.toneMapping = THREE.NoToneMapping; ren.shadowMap.enabled = true; ren.shadowMap.type = THREE.PCFShadowMap;
// the same 16 spots for every panel: a jittered 4 x 4 grid, 2.2 u apart; kinds a/b/fir interleaved; seeded yaw and scale
let s = 7; const R = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const kinds = ['a', 'b', 'f', 'a', 'b', 'a', 'f', 'b', 'a', 'b', 'f', 'a', 'b', 'a', 'f', 'b'];
const spots = kinds.map((k, i) => ({ k, x: ((i % 4) - 1.5) * 2.2 + (R() - 0.5) * 1.1, z: (Math.floor(i / 4) - 1.5) * 2.2 + (R() - 0.5) * 1.1, yaw: R() * Math.PI * 2, s: 0.6 + R() * 0.3 }));
// (any other count: 25 spots, the models dealt round-robin over a shuffled order)
const SP = ${SPACING}, order = Array.from({ length: 25 }, (_, i) => i); let s2 = 11; const R2 = () => { s2 = (s2 * 16807) % 2147483647; return (s2 - 1) / 2147483646; };
for (let i = 24; i > 0; i--) { const j = Math.floor(R2() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
const spotsN = order.map((g, n) => ({ k: n, x: ((g % 5) - 2) * SP + (R2() - 0.5) * SP * 0.5, z: (Math.floor(g / 5) - 2) * SP + (R2() - 0.5) * SP * 0.5, yaw: R2() * Math.PI * 2, s: 0.6 + R2() * 0.3 }));
const noon = (() => { const day = 0.5, az = -1.05 + day * 3.5, el = 0.28 + Math.sin(Math.PI * day) * 0.85; return new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize(); })();
const loader = new GLTFLoader(), rows = [document.createElement('div'), document.createElement('div'), document.createElement('div')];
rows.forEach((r) => { r.className = 'r'; document.getElementById('g').appendChild(r); });
for (const p of panels) {
  const models = await Promise.all(p.glbs.map((u) => loader.loadAsync(u).then((g) => g.scene))), [a, b, f] = models, three3 = models.length === 3;
  if (${DUP}) for (const sc of [a, b]) sc.traverse((o) => { if (!o.isMesh || !(o.material.alphaTest > 0)) return;   // the back of each card: its own faces, same normals
    const ix = o.geometry.index.array, d = new (ix.constructor)(ix.length * 2); d.set(ix); for (let t = 0; t < ix.length; t += 3) { d[ix.length + t] = ix[t]; d[ix.length + t + 1] = ix[t + 2]; d[ix.length + t + 2] = ix[t + 1]; }
    o.geometry.setIndex(new THREE.BufferAttribute(d, 1)); o.material.side = THREE.FrontSide; o.material.needsUpdate = true; });
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xd9e6ea);
  scene.add(new THREE.HemisphereLight(0xe2edf0, 0x80705a, 1.1));
  const sun = new THREE.DirectionalLight(0xfff5e4, 1.9); sun.position.copy(noon).multiplyScalar(40); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 90 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x78a05c, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  for (const sp of three3 ? spots : spotsN) { const m = (three3 ? { a, b, f }[sp.k] : models[sp.k % models.length]).clone(true); m.position.set(sp.x, 0, sp.z); m.rotation.y = sp.yaw; m.scale.setScalar(sp.s);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(m); }
  const dir = new THREE.Vector3(30, 28, 30).normalize();
  for (const [ri, dist, cap, at] of [[0, 19, 'group', [0, 0.8, 0]], [1, 34, 'farther (about a 18 u wide view)', [0, 0.8, 0]], [2, 8, 'close-up', [-1.4, 0.9, -1.2]]]) {
    const look = new THREE.Vector3(...at), cam = new THREE.PerspectiveCamera(30, W / H, 0.5, 600); cam.position.copy(dir).multiplyScalar(dist).add(look); cam.lookAt(look);
    ren.render(scene, cam); const im = new Image(); im.src = ren.domElement.toDataURL('image/png'); await im.decode();
    const fig = document.createElement('figure'); fig.appendChild(im); const c = document.createElement('figcaption'); c.textContent = p.name + ' - ' + cap; fig.appendChild(c); rows[ri].appendChild(fig);
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
await page.goto(`http://127.0.0.1:${srv.address().port}/`); await page.waitForFunction(() => window.__done === true, null, { timeout: 600000 });
await page.screenshot({ path: out, fullPage: true }); await browser.close(); srv.close();
if (errs.length) console.log('errors:\n' + errs.slice(0, 8).join('\n'));
console.log('wrote', out);
