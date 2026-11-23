// plants.browser.mjs  --  WORLDSEED-BRIEF "plants & shapes" RUNTIME criteria on the live proof page (headless Chromium).
// =============================================================================
// Usage:  node tests/plants.browser.mjs [--page index.html] [--port 8187]
// Same harness as phase2.browser.mjs (scene reached through three's __THREE_DEVTOOLS__ 'observe' event, no test hook), so it runs
// against an older build (--page) for the red / green evidence.
//   B1 sets      Golden afternoon: >= 6 visible painterly tree models (tree:<asset>), the shrubs visible, the living-ground cover kit
//                (cover:<kit model>, part 1's ground cover, which replaced the flower drifts) drawn with >= 6 kit models, every cover
//                mesh visible, the old pine / tree_round_a / speckle flowers hidden; Game (current): the trees and shrubs hidden, the
//                old pine / tree_round_a / speckle flowers visible. (The cover is not a preset set: the proof draws it in every
//                preset, Game (current) too, so B1 reports its Game (current) count without asserting it)
//   B2 retired   the old crown-ramp hue bands (see the comment where it stood in main()); "crowns never black" is phase2.browser T2a / T2b
//   B3 farm      the farmhouse window emissive (luma x intensity) at 19.5 h >= 2 x its 16.5 h value and <= 0.5 by day (no bloom
//                on walls); the porch light is in the scene only at 19.5 h
//   B4 strata    edge view: vertical luma-gradient energy on the coast walls (the upper 30 % of the wall / underside mask) >= 1.3 x with stone.strata on vs off
//   B5 budget    scene draw calls (incl. the shadow pass) <= 920 in full, farm, default_mobile, default_desktop. Re-baselined from 900
//                by ruling R21 (the painterly trees, 2026-10-23): the base was already 903 before them (full view), their two
//                primitives per tree add batches (measured 914 / 865 / 904 here), the task 11 probe measured desktop +0.2 ms per frame
//                on a real GPU (GTX 1660 S), and the binding gate is the frame time, not the call count (art/config/TUNING.md)
// Headless SwiftShader: fine for structure and colours, never for timing.
// =============================================================================
import { requirePlaywright } from '../lib/playwright.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from '../lib/png.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CALLS = 920;   // B5's draw-call budget (ruling R21; see the header)
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));

function loadPlaywright() { return requirePlaywright(); }   // lib/playwright.mjs: PLAYWRIGHT_ROOT, the repo root, the main checkout
async function serverUp(port) { try { return (await fetch(`http://127.0.0.1:${port}/__shots`)).ok; } catch { return false; } }

function pageInit() {
  const t = new EventTarget(); window.__THREE_DEVTOOLS__ = t; window.__t = { scenes: [] };
  t.addEventListener('observe', (e) => { const o = e.detail; if (o && o.isScene) { window.__t.scenes.push(o);
    const prev = o.onBeforeRender; o.onBeforeRender = function (renderer, scene, camera, rt) { if ((!rt || rt.isGitawayComposite) && camera.isPerspectiveCamera) { window.__t.renderer = renderer; window.__t.camera = camera; } return prev.apply(this, arguments); }; } });
}
function setsState() {
  const scene = window.__t.scenes.find((s) => s.children.some((c) => c.name === 'piece:main')), vis = (o) => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };
  const out = { variants: new Set(), treeVis: 0, legacyVis: 0, legacy: 0, shrubVis: 0, cover: 0, coverVis: 0, coverModels: new Set(), speckleVis: 0, speckle: 0 };
  scene.traverse((o) => { if (!o.isInstancedMesh) return; const n = o.name, v = vis(o);
    if (/^tree:/.test(n)) { if (v) { out.treeVis++; out.variants.add(n.split(':')[1]); } }
    else if (/^(pine|tree_round_a):/.test(n)) { out.legacy++; if (v) out.legacyVis++; }
    else if (/^shrub:/.test(n)) { if (v) out.shrubVis++; }
    else if (/^cover:/.test(n)) { out.cover++; if (v) { out.coverVis++; out.coverModels.add(n.split(':')[1]); } }
    else if (/^flowers:/.test(n)) { out.speckle++; if (v) out.speckleVis++; } });
  out.variants = [...out.variants].sort(); out.coverModels = [...out.coverModels].sort(); return out;
}
function farmState() { const P = window.__plants; if (!P || !P.glow.mat) return null; const m = P.glow.mat, e = m.emissive;
  return { glow: (0.2126 * e.r + 0.7152 * e.g + 0.0722 * e.b) * m.emissiveIntensity, porch: !!(P.porch.parent && P.porch.visible), porchI: P.porch.intensity }; }

async function main() {
  const a = process.argv.slice(2); let page0 = 'index.html', port = 8187;
  for (let i = 0; i < a.length; i++) { if (a[i] === '--page') page0 = a[++i]; else if (a[i] === '--port') port = +a[++i]; }
  let child = null;
  if (!(await serverUp(port))) { child = spawn(process.execPath, [path.join(__dirname, '..', 'shots.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await serverUp(port)); i++) await new Promise((r) => setTimeout(r, 100)); }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(pageInit);
    await page.goto(`http://127.0.0.1:${port}/${page0}?ui=0&shot=1`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true && window.__t && window.__t.renderer, null, { timeout: 600000, polling: 250 });
    await page.waitForTimeout(300);
    const sel = (n) => page.evaluate((x) => window.__look.select(x), n);
    // ---- B1 ----
    await sel('Golden afternoon'); const sG = await page.evaluate(setsState); await sel('Game (current)'); const sC = await page.evaluate(setsState); await sel('Golden afternoon');
    ok('B1 Golden afternoon draws >= 6 painterly tree models + the shrubs + the cover kit (>= 6 kit models, every cover mesh visible), the old trees / speckle hidden; Game (current): trees and shrubs hidden, the old trees / speckle visible',
      sG.variants.length >= 6 && sG.shrubVis > 0 && sG.cover > 0 && sG.coverVis === sG.cover && sG.coverModels.length >= 6 && sG.legacy > 0 && !sG.legacyVis && !sG.speckleVis
        && !sC.treeVis && !sC.shrubVis && sC.legacyVis === sC.legacy && sC.speckleVis === sC.speckle,
      `golden: trees ${sG.variants.join(',') || 'none'} (${sG.treeVis} meshes), shrubs ${sG.shrubVis}, cover ${sG.coverVis}/${sG.cover} meshes of ${sG.coverModels.length} kit models (${sG.coverModels.join(',')}), old trees visible ${sG.legacyVis}/${sG.legacy}, speckle ${sG.speckleVis}/${sG.speckle}; `
        + `game: trees ${sC.treeVis}, shrubs ${sC.shrubVis}, old ${sC.legacyVis}/${sC.legacy}, speckle ${sC.speckleVis}/${sC.speckle}, cover ${sC.coverVis}/${sC.cover} (not a preset set: reported only)`);
    // ---- B2 retired: its green-hue bands described the old plants.mjs crown ramp; the crowns have been painted textured GLBs since the reskin route (spec revision 2). "Crowns never black" is phase2.browser T2a / T2b. ----
    // ---- B3 ----
    const fD = await page.evaluate(() => { window.__look.setHour(16.5); return null; }).then(() => page.evaluate(farmState));
    const fN = await page.evaluate(() => { window.__look.setHour(19.5); return null; }).then(() => page.evaluate(farmState));
    await sel('Golden afternoon');
    ok('B3 farm: window glow at 19.5 h >= 2 x 16.5 h, <= 0.5 by day; porch light only at 19.5 h', fD && fN && fN.glow >= 2 * fD.glow && fD.glow <= 0.5 && fN.porch && !fD.porch,
      fD && fN ? `glow ${f2(fD.glow)} -> ${f2(fN.glow)}; porch ${fD.porch}/${f2(fD.porchI)} -> ${fN.porch}/${f2(fN.porchI)}` : 'no farm glow state (window.__plants)');
    // ---- B4 ----
    const edge = async (on) => page.evaluate((o) => { const L = window.__look, p = JSON.parse(JSON.stringify(L.preset)); if (p.stone.strata) p.stone.strata.enabled = o; L.apply(p, true); return window.__viewShot('edge', { mask: true, w: 800, h: 450 }); }, on);
    const energy = (r) => { const im = decodePNG(Buffer.from(r.url.split(',')[1], 'base64')), mk = decodePNG(Buffer.from(r.mask.split(',')[1], 'base64')), W = im.width, H = im.height, d = im.data, m = mk.data;
      const red = (i) => m[i] > 200 && m[i + 1] < 60 && m[i + 2] < 60, L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; let s = 0, n = 0, y0 = H, y1 = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (red((y * W + x) * 4)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let y = Math.max(2, y0); y < Math.min(H - 2, y0 + 0.3 * (y1 - y0)); y++) for (let x = 0; x < W; x++) {   // the upper 30 % of the mask = the coast walls
        const i = (y * W + x) * 4, u = i - 2 * W * 4, v = i + 2 * W * 4; if (!red(i) || !red(u) || !red(v)) continue; s += Math.abs(L(v) - L(u)); n++; }
      return n ? s / n : NaN; };
    const eOn = energy(await edge(true)), eOff = energy(await edge(false)); await sel('Golden afternoon');
    ok('B4 strata: the coast-wall vertical luma-gradient energy >= 1.3 x with stone.strata on vs off', eOn >= 1.3 * eOff, `on ${f2(eOn)} vs off ${f2(eOff)} (x${f2(eOn / eOff)})`);
    // ---- B5 ----
    const calls = await page.evaluate(async () => { const A = window.__WORLD3__.archipelago, out = {};
      for (const v of ['full', 'farm']) out[v] = window.__viewShot(v, { w: 800, h: 450 }).stats.scene;
      for (const c of ['default_mobile', 'default_desktop']) { const C = A.cameras[c]; out[c] = (await window.__saveShot(c, { ...C, w: Math.round(C.w / 2), h: Math.round(C.h / 2), unlocked: C.unlocked || A.defaultUnlocked, dock: C.dock || null, returnUrl: true })).stats.scene; }
      return out; });
    ok(`B5 draw calls (incl. the shadow pass) <= ${CALLS} (ruling R21) in full / farm / default_mobile / default_desktop`, Object.values(calls).every((s) => s.calls <= CALLS),
      Object.entries(calls).map(([k, s]) => `${k} ${s.calls} calls ${(s.triangles / 1000).toFixed(0)}k tris`).join('; '));
  } finally { await browser.close(); if (child) child.kill(); }
  let fail = 0;
  for (const r of results) { console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`); if (!r.pass) fail++; }
  if (errors.length) console.log('page errors: ' + errors.slice(0, 5).join(' | '));
  console.log(`\n${results.length - fail}/${results.length} passed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
