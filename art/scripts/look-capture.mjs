// look-capture.mjs  --  capture the 7 FIXED COMPARISON VIEWS of the LOOK-BRIEF phases (re-runnable, deterministic).
// =============================================================================
// Usage:  node look-capture.mjs <phase> [--views full,farm] [--masks] [--look "<preset>"] [--extra "k=v&k2=v2"]
//                               [--page index.html] [--port 8187] [--out <dir>] [--cams default_mobile,default_desktop]
//                               [--hour H] [--set "path=value,..."]
//   --cams   also the GAMEPLAY cameras (archipelago.cameras, their own size, gameplay mode + clamp, animation frozen) via
//            window.__saveShot(..., { returnUrl: true }) -> <cam>.png (+ mask); --views none = gameplay only
//   --hour   the time-of-day blend at H (window.__look.setHour) instead of a named preset
//   --set    preset edits applied before the captures (e.g. "post.ink.enabled=false,cel.enabled=false"): toggle sheets
//   e.g.  node look-capture.mjs baseline            -> art/screenshots/baseline/raw/<view>.png (7 views, 1600x900)
//         node look-capture.mjs phase1 --look "Golden afternoon" --masks
// Opens <page>?ui=0&shot=1 (+ look / extra) on the shot server (shots.mjs; started here if it is not already
// listening), waits for the scene, then renders every archipelago.views entry through window.__viewShot (the
// view's camera, everything unlocked, seed 11, animation clock frozen, no UI or panel: the canvas is read
// directly). --masks also writes <view>_mask.png (metrics.mjs classes). Writes raw/capture.json (three revision,
// preset, query, console errors). Raw PNGs are git-ignored; `node look-sheet.mjs <before> <after>` makes the
// committed side-by-side sheets. Headless Chromium renders with SwiftShader: fine for looks, NOT for timing.
// =============================================================================
import { requirePlaywright } from './lib/playwright.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART_DIR } from './lib/paths.mjs';
import W3 from '../config/world.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCREENSHOTS = path.join(ART_DIR, 'screenshots');

function loadPlaywright() { return requirePlaywright(); }   // lib/playwright.mjs: PLAYWRIGHT_ROOT, the repo root, the main checkout
async function serverUp(port) { try { return (await fetch(`http://127.0.0.1:${port}/__shots`)).ok; } catch { return false; } }

async function main() {
  const a = process.argv.slice(2);
  const phase = a[0] && !a[0].startsWith('--') ? a[0] : null;
  if (!phase) { console.error('usage: node look-capture.mjs <phase> [--views a,b] [--masks] [--look <preset>] [--extra q] [--page p] [--port n]'); process.exit(2); }
  const VIEWS = W3.archipelago.views;
  let views = Object.keys(VIEWS), masks = false, look = null, extra = '', page0 = 'index.html', port = 8187, out = null, cams = [], hour = null, sets = [];
  for (let i = 1; i < a.length; i++) {
    if (a[i] === '--views') { views = a[++i] === 'none' ? [] : a[i].split(','); }
    else if (a[i] === '--cams') cams = a[++i].split(',');
    else if (a[i] === '--hour') hour = +a[++i];
    else if (a[i] === '--set') sets = a[++i].split(',').map((kv) => { const k = kv.indexOf('='), v = kv.slice(k + 1); return [kv.slice(0, k), v === 'true' ? true : v === 'false' ? false : /^-?[\d.]+$/.test(v) ? +v : v]; });
    else if (a[i] === '--masks') masks = true;
    else if (a[i] === '--look') look = a[++i];
    else if (a[i] === '--extra') extra = a[++i];
    else if (a[i] === '--page') page0 = a[++i];
    else if (a[i] === '--port') port = +a[++i];
    else if (a[i] === '--out') out = a[++i];
  }
  for (const v of views) if (!VIEWS[v]) { console.error('unknown view ' + v + ' (have: ' + Object.keys(VIEWS).join(', ') + ')'); process.exit(2); }
  for (const c of cams) if (!W3.archipelago.cameras[c]) { console.error('unknown camera ' + c); process.exit(2); }
  const dir = out || path.join(SCREENSHOTS, phase, 'raw');
  fs.mkdirSync(dir, { recursive: true });
  let child = null;
  if (!(await serverUp(port))) {
    child = spawn(process.execPath, [path.join(__dirname, 'shots.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await serverUp(port)); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const q = ['ui=0', 'shot=1', look ? 'look=' + encodeURIComponent(look) : '', extra].filter(Boolean).join('&');
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const t0 = Date.now(), errors = [], meta = { phase, page: page0, query: q, views: {}, at: new Date().toISOString() };
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(`http://127.0.0.1:${port}/${page0}?${q}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true && typeof window.__viewShot === 'function', null, { timeout: 600000, polling: 250 });
    await page.waitForTimeout(400);
    if (hour != null || sets.length) {   // the time-of-day blend and / or preset edits (toggle sheets), applied with an immediate repaint
      meta.edits = await page.evaluate(([h, S]) => { const L = window.__look; if (h != null && L.setHour) L.setHour(h);
        const p = JSON.parse(JSON.stringify(L.preset)); for (const [k, v] of S) { const ks = k.split('.'); let x = p; for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]]; x[ks[ks.length - 1]] = v; }
        L.apply(p, true); return { name: L.name, sets: S }; }, [hour, sets]);
    }
    meta.look = await page.evaluate(() => (window.__look && window.__look.name) || null);
    for (const v of views) {
      const r = await page.evaluate(([n, m]) => window.__viewShot(n, { mask: m }), [v, masks]);
      fs.writeFileSync(path.join(dir, v + '.png'), Buffer.from(r.url.split(',')[1], 'base64'));
      if (r.mask) fs.writeFileSync(path.join(dir, v + '_mask.png'), Buffer.from(r.mask.split(',')[1], 'base64'));
      meta.three = r.three; meta.views[v] = { ...VIEWS[v], stats: r.stats || null };
      console.log(`  ${v.padEnd(10)} -> ${path.join(dir, v + '.png')}${r.mask ? ' (+ mask)' : ''}`);
    }
    for (const c of cams) {
      const r = await page.evaluate(async ([n, m]) => { const A = window.__WORLD3__.archipelago, C = A.cameras[n];
        return window.__saveShot(n, { ...C, unlocked: C.unlocked || A.defaultUnlocked, dock: C.dock || null, mask: m, returnUrl: true }); }, [c, masks]);
      fs.writeFileSync(path.join(dir, c + '.png'), Buffer.from(r.url.split(',')[1], 'base64'));
      if (r.mask) fs.writeFileSync(path.join(dir, c + '_mask.png'), Buffer.from(r.mask.split(',')[1], 'base64'));
      meta.views[c] = { ...W3.archipelago.cameras[c], stats: r.stats || null };
      console.log(`  ${c.padEnd(10)} -> ${path.join(dir, c + '.png')}${r.mask ? ' (+ mask)' : ''}`);
    }
  } finally {
    await browser.close();
    if (child) child.kill();
  }
  meta.errors = errors;
  fs.writeFileSync(path.join(dir, 'capture.json'), JSON.stringify(meta, null, 1) + '\n');
  console.log(`  ${views.length} views, three r${meta.three}, look ${meta.look || '(page default)'}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const e of errors.slice(0, 12)) console.log('    ' + e);
}

main().catch((e) => { console.error(e); process.exit(1); });
