// scene-probe.mjs  --  draw calls + tree-pixel share of the proof scene, measured the SAME way for any build.
// =============================================================================
// Usage:  node scene-probe.mjs [--page index.html] [--presets island_wide,default_desktop] [--seed 11]
//                              [--extra "light=game"] [--json out.json] [--masks <dir>]
// Serves proof/ through shots.mjs (started here if needed) and opens <page>?preset=<p>&ui=0 at the preset's
// own size. three.js is patched IN TRANSIT (page.route on the CDN module: a render hook appended to the
// module) so it also works on builds that predate this tool (e.g. a saved v3 index_v3.html):
//   calls     renderer.info.render.calls of one frame (shadow pass + main pass), triangles too
//   treeShare tree pixels / island pixels at that preset: one extra render with every tree mesh flat red,
//             every other mesh under a piece group flat blue, sky/clouds/backdrop hidden, white background
//             (trees = userData.tree, nodes named tree_round_a, the pine cones/trunk groups)
// =============================================================================
import { requirePlaywright } from './lib/playwright.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import W3 from '../config/world.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadPlaywright() { return requirePlaywright(); }   // lib/playwright.mjs: PLAYWRIGHT_ROOT, the repo root, the main checkout
const serverUp = async (port) => { try { return (await fetch(`http://127.0.0.1:${port}/__shots`)).ok; } catch { return false; } };

// (WebGLRenderer defines render() inside its constructor, so the hook rides Scene.onAfterRender, which
// render() calls at its very end with the frame's info counters complete)
const HOOK = `
;(function(){
  Scene.prototype.onAfterRender = function (r, s, c) {
    window.__probe = { scene: s, camera: c, renderer: r, calls: r.info.render.calls, tris: r.info.render.triangles, frame: (window.__probe ? window.__probe.frame : 0) + 1 }; };
  window.__probeTHREE = { MeshBasicMaterial, Color };
})();
`;

async function main() {
  const a = process.argv.slice(2);
  let page0 = 'index.html', presets = ['island_wide', 'default_desktop'], seed = W3.archipelago.seeds.default, extra = '', json = null, masks = null, port = 8187;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--page') page0 = a[++i]; else if (a[i] === '--presets') presets = a[++i].split(','); else if (a[i] === '--seed') seed = +a[++i];
    else if (a[i] === '--extra') extra = a[++i]; else if (a[i] === '--json') json = a[++i]; else if (a[i] === '--masks') masks = a[++i]; else if (a[i] === '--port') port = +a[++i];
  }
  let child = null;
  if (!(await serverUp(port))) {
    child = spawn(process.execPath, [path.join(__dirname, 'shots.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await serverUp(port)); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const out = {};
  try {
    for (const name of presets) {
      const cam = W3.archipelago.cameras[name]; if (!cam) { console.log('  no preset ' + name); continue; }
      const page = await browser.newPage({ viewport: { width: cam.w, height: cam.h }, deviceScaleFactor: 1 });
      // three r171+ splits the build: the classes live in three.core.js (three.module.js only re-exports them), so the
      // hook goes into whichever file DEFINES Scene (core on r171+, module on older builds such as r160)
      await page.route(/three@[^/]+\/build\/three\.(module|core)\.js$/, async (route) => {
        const resp = await route.fetch(); const body = await resp.text();
        await route.fulfill({ response: resp, body: /\bclass Scene extends\b/.test(body) ? body + HOOK : body, headers: { ...resp.headers(), 'content-type': 'text/javascript' } });
      });
      const errs = []; page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(`http://127.0.0.1:${port}/${page0}?preset=${name}&ui=0&seed=${seed}${extra ? '&' + extra : ''}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__ready && window.__probe && window.__probe.frame > 3, null, { timeout: 300000, polling: 250 });
      await page.waitForTimeout(500);
      const res = await page.evaluate(async () => {
        const P = window.__probe, f0 = P.frame; await new Promise((r) => { const w = () => (window.__probe.frame > f0 + 1 ? r() : requestAnimationFrame(w)); w(); });
        const calls = window.__probe.calls, tris = window.__probe.tris;
        // ---- mask render ----
        const { scene, camera, renderer } = window.__probe, T = window.__probeTHREE;
        const red = new T.MeshBasicMaterial({ color: 0xff0000, fog: false }), blue = new T.MeshBasicMaterial({ color: 0x0000ff, fog: false });
        const isTree = (o) => { for (let q = o; q; q = q.parent) { if (q.userData && q.userData.tree) return true; if (q.name === 'tree_round_a') return true;
          if (q.isGroup && q.children.length <= 5 && !(q.name || '').startsWith('piece:') && q.children.some((c) => c.geometry && c.geometry.type === 'ConeGeometry')) return true; } return false; };   // v3 pine clones
        // backdrop isles (piece:isle<seed>) excluded; v5 fix: the old startsWith('piece:isle') also dropped the islet PIECE
        const inPiece = (o) => { for (let q = o; q; q = q.parent) if (q.name && q.name.startsWith('piece:')) return !/^piece:isle\d/.test(q.name); return false; };
        const saved = []; const bg = scene.background, fog = scene.fog;
        scene.traverse((o) => { if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return; saved.push([o, o.material, o.visible, o.instanceColor || null]);
          if (o.instanceColor) o.instanceColor = null;     // flat mask colour, not tinted per instance
          if (inPiece(o) && o.visible) o.material = isTree(o) ? red : blue; else o.visible = false; });
        scene.background = new T.Color(0xffffff); scene.fog = null;
        const sm = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
        renderer.render(scene, camera);
        const cv = renderer.domElement, W = cv.width, H = cv.height, c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
        const g = c2.getContext('2d'); g.drawImage(cv, 0, 0); const d = g.getImageData(0, 0, W, H).data;
        let tree = 0, island = 0, minX = W, maxX = -1;
        for (let i = 0; i < W * H; i++) { const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
          const isT = r > 160 && gg < 90 && b < 90, isI = b > 160 && r < 90 && gg < 90;
          if (isT) tree++; if (isT || isI) { island++; const x = i % W; if (x < minX) minX = x; if (x > maxX) maxX = x; } }
        const url = cv.toDataURL('image/png');
        for (const [o, m, v, ic] of saved) { o.material = m; o.visible = v; if (ic) o.instanceColor = ic; } scene.background = bg; scene.fog = fog; renderer.shadowMap.enabled = sm;
        return { calls, tris, W, H, treePx: tree, islandPx: island, treeShare: island ? tree / island : 0, islandFrac: island / (W * H), islandWidthFrac: maxX >= minX ? (maxX - minX + 1) / W : 0, mask: url };
      });
      if (masks) { fs.mkdirSync(masks, { recursive: true }); fs.writeFileSync(path.join(masks, `mask_${page0.replace(/\W+/g, '_')}_${name}_s${seed}.png`), Buffer.from(res.mask.split(',')[1], 'base64')); }
      delete res.mask; out[name] = res;
      console.log(`  ${page0} ${name} seed ${seed}: drawCalls=${res.calls} tris=${res.tris} treeShare=${(res.treeShare * 100).toFixed(1)}% islandFrame=${(res.islandFrac * 100).toFixed(1)}% islandWidth=${(res.islandWidthFrac * 100).toFixed(1)}%` + (errs.length ? '  ERR ' + errs.slice(0, 3).join(' | ') : ''));
      await page.close();
    }
  } finally { await browser.close(); if (child) child.kill(); }
  if (json) fs.writeFileSync(json, JSON.stringify(out, null, 2) + '\n');
}
main().catch((e) => { console.error(e); process.exit(1); });
