// capture.mjs  --  drive the comparison-render harness headlessly (re-runnable).
// =============================================================================
// Usage:  node capture.mjs <prefix> [--seeds default,alt] [--port 8187]
//   e.g.  node capture.mjs passA            -> proof/_shots/passA_<preset>.png
//                                              + passA_<preset>_seed42.png
// Opens /index.html?capture=<prefix>&seed=<N>&ui=0 on the shot server (shots.mjs;
// started here as a child process if it is not already listening), waits for the
// viewer's capture driver to POST every world.config camera preset, then dumps
// window.__placements (scattered tree/rock positions) to
// proof/_shots/placements[_seed<N>].json for clumping.mjs.
//
// Uses an EXISTING Playwright install (no new dependency for art/): resolved by
// lib/playwright.mjs from $PLAYWRIGHT_ROOT, the repo root's node_modules, or the
// main checkout of this worktree (read-only). Headless Chromium renders WebGL via SwiftShader.
// =============================================================================
import { requirePlaywright } from './lib/playwright.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS_DIR } from './lib/paths.mjs';
import W3 from '../config/world.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPlaywright() { return requirePlaywright(); }   // lib/playwright.mjs: PLAYWRIGHT_ROOT, the repo root, the main checkout

async function serverUp(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/__shots`); return r.ok; } catch { return false; }
}

async function main() {
  const a = process.argv.slice(2);
  const prefix = a[0] && !a[0].startsWith('--') ? a[0] : 'shot';
  // ARCHIPELAGO (default): world.config archipelago.cameras/seeds; --legacy = the old single island
  const LEGACY = a.includes('--legacy'), SEEDS = LEGACY ? W3.seeds : W3.archipelago.seeds, CAMS = LEGACY ? W3.cameras : W3.archipelago.cameras;
  let port = 8187, seeds = [SEEDS.default, SEEDS.alt], extra = LEGACY ? 'world=legacy' : '', only = null, setName = null, page0 = 'index.html';
  const add = (q) => { extra += (extra ? '&' : '') + q; };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--port') port = +a[++i];
    if (a[i] === '--page') page0 = a[++i];           // v5: capture a saved build (e.g. index_v4.html) side by side
    if (a[i] === '--masks') add('masks=1');          // v5: + <name>_mask.png per shot (island / wall / object classes for metrics.mjs)
    if (a[i] === '--seeds') seeds = a[++i].split(',').map(s => (s === 'default' ? SEEDS.default : s === 'alt' ? SEEDS.alt : +s));
    if (a[i] === '--extra') add(a[++i]);             // extra query params, e.g. "diag=albedo"
    if (a[i] === '--only') only = a[++i];            // comma list of preset names
    if (a[i] === '--unlocked') add('unlocked=' + a[++i]);   // main | all | a,b,c (presets with their own state keep it)
    if (a[i] === '--light') add('light=' + a[++i]);         // proof | game
    if (a[i] === '--hour') add('hour=' + a[++i]);
    if (a[i] === '--set') { add('set=' + a[++i]); setName = a[i]; }   // orbits = archipelago.orbits (free-orbit check angles)
  }
  if (only) add('only=' + only);
  let child = null;
  if (!(await serverUp(port))) {
    child = spawn(process.execPath, [path.join(__dirname, 'shots.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await serverUp(port)); i++) await new Promise(r => setTimeout(r, 100));
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const nCams = only ? only.split(',').length : Object.keys(setName === 'orbits' && W3.archipelago.orbits ? W3.archipelago.orbits : CAMS).length;
  try {
    for (const seed of seeds) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      const url = `http://127.0.0.1:${port}/${page0}?capture=${encodeURIComponent(prefix)}&seed=${seed}&ui=0${extra ? '&' + extra : ''}`;
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__captureDone != null, null, { timeout: 600000, polling: 500 });
      const done = await page.evaluate(() => window.__captureDone);
      const placements = await page.evaluate(() => window.__placements || null);
      const clamp = await page.evaluate(() => window.__clampViolations || []);
      const suffix = seed === SEEDS.default ? '' : '_seed' + seed;
      if (placements && !only && !setName) fs.writeFileSync(path.join(SHOTS_DIR, LEGACY ? `placements${suffix}.json` : `placements_${prefix}${suffix}.json`), JSON.stringify(placements) + '\n');
      console.log(`  seed ${seed}: ${done}/${nCams} shots in ${((Date.now() - t0) / 1000).toFixed(1)}s` +
        (placements ? `, ${placements.trees.length} trees dumped` : '') + (clamp.length ? `, CLAMP VIOLATIONS: ${clamp.join(',')}` : ''));
      for (const e of errors.slice(0, 12)) console.log('    ' + e);
      await page.close();
    }
  } finally {
    await browser.close();
    if (child) child.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
