// panelsave.browser.mjs  --  the LOOK panel's "Save & share" folder, END TO END in headless Chromium (the real lil-gui, the real page).
// =============================================================================
// Usage:  node tests/panelsave.browser.mjs [--page index.html] [--port 8187]
// Loads <page> from the shot server (shots.mjs; started here if it is not listening) several times:
//   L  LOCAL page (no window.claude): the page-save controls are hidden; Save = a real download of <name>.look.json, Load round-trips it,
//      Revert works; nothing else changed
//   A  ARTIFACT page: an init script installs a fake window.claude whose claude.use('db' | 'downloads') resolves later (like the runtime)
//      with an in-memory db: nothing is written on load, Save to page writes looks/<slug> = { name, savedAt, preset }, Saved looks
//      lists + applies (schema-valid only), Delete asks first, Download JSON goes through dl.save, `declined` is no error
//   S  SIGNED OUT: claude.use('db') resolves null -> the page-save controls stay hidden, downloads still work
//   C  CAPTURE URLs (?ui=0 / ?shot=1): no panel exists at all
// tests/panelsave.test.mjs covers the logic against fakes; this one proves the lil-gui wiring (hide / show, options, open/close
// bubbling, the real Load path) on the built page. Needs the CDN (three + lil-gui), like phase1.browser.mjs.
// =============================================================================
import { requirePlaywright } from '../lib/playwright.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });

function loadPlaywright() { return requirePlaywright(); }   // lib/playwright.mjs: PLAYWRIGHT_ROOT, the repo root, the main checkout
async function serverUp(port) { try { return (await fetch(`http://127.0.0.1:${port}/__shots`)).ok; } catch { return false; } }

// ---- in-page: the fake artifact runtime (serialised into the page before its scripts run) ----
function fakeRuntime(cfg) {
  const store = new Map(), log = { writes: [], queries: 0, downloads: [], asked: [] }, cp = (o) => JSON.parse(JSON.stringify(o));
  const db = { collection: (c) => ({
    doc: (id) => ({
      set: async (o) => { log.writes.push(['set', c, id]); store.set(c + '/' + id, cp(o)); },
      get: async () => { const v = store.get(c + '/' + id); return { exists: v !== undefined, data: () => cp(v) }; },
      delete: async () => { log.writes.push(['delete', c, id]); store.delete(c + '/' + id); } }),
    orderBy: (f, dir) => ({ limit: (n) => ({ get: async () => { log.queries++;
      const docs = [...store.entries()].filter(([k]) => k.startsWith(c + '/')).map(([k, v]) => ({ id: k.slice(c.length + 1), exists: true, data: () => cp(v) }));
      docs.sort((a, b) => (a.data()[f] < b.data()[f] ? 1 : -1) * (dir === 'desc' ? 1 : -1)); return { docs: docs.slice(0, n) }; } }) }) }) };
  const dl = { save: async (a) => { if (cfg.decline) throw { code: 'declined', message: 'the viewer said no' }; log.downloads.push(a); } };
  window.__fake = { store, log, seed: (id, o) => store.set('looks/' + id, cp(o)) };
  // resolves LATER (never during the first script run), like the real runtime
  window.claude = { use: (name) => { log.asked.push(name); return new Promise((r) => setTimeout(() => r(name === 'db' ? (cfg.db ? db : null) : name === 'downloads' ? (cfg.downloads ? dl : null) : null), 150)); } };
}

// ---- in-page: one self-contained helper (page.evaluate serialises it) ----
function H([op, arg]) {
  const gui = document.querySelector('.lil-gui.look-panel');
  if (op === 'closed') return !!gui && gui.classList.contains('closed');
  if (!gui) return null;
  // lil-gui 0.20 (ESM build) class names are unprefixed: .title (a button) / .children / .controller / .name / .widget
  const titleOf = (f) => { const t = f.querySelector(':scope > .title'); return t ? t.textContent.trim() : ''; };
  const folder = [...gui.querySelectorAll('.lil-gui')].find((f) => titleOf(f) === 'Save & share');
  const kids = (el) => (el ? [...el.querySelectorAll(':scope > .children > .controller')] : []);
  const nameOf = (c) => c.querySelector('.name').textContent.trim();
  const info = (c) => { const sel = c.querySelector('select'), inp = c.querySelector('input'), btn = c.querySelector('button');
    return { name: nameOf(c), hidden: getComputedStyle(c).display === 'none', kind: sel ? 'select' : btn ? 'button' : inp ? 'input' : '?', value: sel ? sel.value : inp ? inp.value : null, options: sel ? [...sel.options].map((o) => o.textContent) : null }; };
  const ctrls = kids(folder);
  if (op === 'ctrls') return folder ? ctrls.map(info) : null;
  if (op === 'status') { const c = ctrls.find((x) => nameOf(x) === 'status'); return c ? c.querySelector('input').value : null; }
  if (op === 'click') { const c = ctrls.find((x) => nameOf(x) === arg); if (!c) return false; c.querySelector('button').click(); return true; }
  if (op === 'text') { const c = ctrls.find((x) => nameOf(x) === arg[0]), i = c && c.querySelector('input'); if (!i) return false; i.value = arg[1]; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; }
  if (op === 'pick' || op === 'pickRoot') { const c = (op === 'pick' ? ctrls : kids(gui)).find((x) => nameOf(x) === arg[0]), s = c && c.querySelector('select'); if (!s) return false;
    const i = [...s.options].findIndex((o) => o.textContent === arg[1]); if (i < 0) return false; s.selectedIndex = i; s.dispatchEvent(new Event('change', { bubbles: true })); return true; }
  return null;
}

async function main() {
  const a = process.argv.slice(2);
  let page0 = 'index.html', port = 8187;
  for (let i = 0; i < a.length; i++) { if (a[i] === '--page') page0 = a[++i]; else if (a[i] === '--port') port = +a[++i]; }
  let child = null;
  if (!(await serverUp(port))) {
    child = spawn(process.execPath, [path.resolve(__dirname, '../shots.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await serverUp(port)); i++) await new Promise((r) => setTimeout(r, 100));
  }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  const open = async (query, cfg) => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`pageerror (${query || 'default'}): ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`error (${query || 'default'}): ${m.text()}`); });
    if (cfg) await page.addInitScript(fakeRuntime, cfg);
    await page.goto(`http://127.0.0.1:${port}/${page0}${query}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__ready === true && window.__look, null, { timeout: 600000, polling: 250 });
    return page;
  };
  const wait = (page, ms) => page.waitForTimeout(ms);
  const h = (page, op, arg) => page.evaluate(H, [op, arg]);
  const names = (ctrls) => (ctrls || []).filter((c) => !c.hidden).map((c) => c.name);
  const val = (ctrls, n) => ((ctrls || []).find((x) => x.name === n) || {}).value;
  const PAGE_SAVE = ['Save to page', 'saved looks', 'Refresh saved looks', 'Delete saved look'];
  const openPanel = async (page) => { await page.waitForSelector('.lil-gui.look-panel', { timeout: 60000 }); await wait(page, 700); };
  const toggle = async (page) => { await page.click('.lil-gui.look-panel > .title'); await wait(page, 700); };
  try {
    // ================= L: the LOCAL page =================
    {
      const page = await open('', null); await openPanel(page);
      ok('L0 the panel is collapsed by default', await h(page, 'closed'), '');
      await toggle(page);
      const c = await h(page, 'ctrls'), vis = names(c);
      ok('L1 local page: the "Save & share" folder shows save as / Save preset (download + copy) / Load preset (file)... / Revert edits / status, in that order',
        JSON.stringify(vis) === JSON.stringify(['save as', 'Save preset (download + copy)', 'Load preset (file)...', 'Revert edits', 'status']), vis.join(' | '));
      ok('L2 local page: Save to page / saved looks / Refresh / Delete are hidden', PAGE_SAVE.every((n) => (c || []).find((x) => x.name === n && x.hidden)), PAGE_SAVE.map((n) => n + '=' + ((c || []).find((x) => x.name === n) || {}).hidden).join(' '));
      ok('L3 local page: the name field keeps its old default (the plain preset name)', val(c, 'save as') === 'Golden afternoon', val(c, 'save as'));
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), h(page, 'click', 'Save preset (download + copy)')]);
      let payload = null; const fname = dl ? dl.suggestedFilename() : null;
      if (dl) { try { payload = JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); } catch { /* below */ } }
      await wait(page, 300);
      ok('L4 local Save = the existing download link: Golden_afternoon.look.json, format gitaway-look-preset, full preset', fname === 'Golden_afternoon.look.json' && payload && payload.format === 'gitaway-look-preset' && payload.name === 'Golden afternoon' && payload.preset && payload.preset.sun && payload.preset.renderer, `${fname}; ${payload && Object.keys(payload).join(',')}`);
      ok('L5 ...and the status line reports the download + clipboard outcome', /^downloaded \+ (copied|clipboard blocked): Golden afternoon$/.test(await h(page, 'status')), await h(page, 'status'));
      if (payload) { payload.name = 'Round trip'; payload.preset.sun.intensity = 1.234; }   // Load: round-trip the file under a new name
      await page.setInputFiles('input[type=file]', { name: 'rt.look.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload || {})) }); await wait(page, 900);
      const L = await page.evaluate(() => ({ name: window.__look.name, intensity: window.__look.preset.sun.intensity }));
      ok('L6 local Load from file still works: the file is adopted (name, values) and selected', L.name === 'Round trip' && Math.abs(L.intensity - 1.234) < 1e-9, JSON.stringify(L));
      ok('L7 ...status "loaded 1 preset(s) from rt.look.json"; the name field follows the loaded name', (await h(page, 'status')) === 'loaded 1 preset(s) from rt.look.json' && val(await h(page, 'ctrls'), 'save as') === 'Round trip', await h(page, 'status'));
      await page.evaluate(() => { window.__look.preset.sun.intensity = 9; });
      await h(page, 'click', 'Revert edits'); await wait(page, 300);
      ok('L8 local Revert still works (back to the loaded values)', Math.abs((await page.evaluate(() => window.__look.preset.sun.intensity)) - 1.234) < 1e-9 && (await h(page, 'status')) === 'reverted', await h(page, 'status'));
      const dc = await page.evaluate(() => window.__LOOK_SAVE__.validatePreset(window.__look.dayCyclePreset(13), window.__look.schema));
      ok('L9 the ?hour= day-cycle preset (Game @ 13h) passes the strict schema check (so it can be saved to the page)', Array.isArray(dc) && dc.length === 0, (dc || []).slice(0, 3).join('; '));
      await page.close();
    }

    // ================= A: the ARTIFACT page (fake db + downloads) =================
    {
      const page = await open('', { db: true, downloads: true }); await openPanel(page);
      const quiet = await page.evaluate(() => ({ w: window.__fake.log.writes.length, q: window.__fake.log.queries, asked: window.__fake.log.asked.join() }));
      ok('A0 nothing is written, and the db is not queried, while the page loads with the panel collapsed (db + downloads asked via claude.use)', quiet.w === 0 && quiet.q === 0 && quiet.asked === 'db,downloads' && (await h(page, 'closed')), JSON.stringify(quiet));
      await toggle(page);
      const c = await h(page, 'ctrls'), vis = names(c);
      ok('A1 artifact page: every control is shown (Download JSON replaces the local Save label)', JSON.stringify(vis) === JSON.stringify(['save as', 'Save to page', 'Download JSON', 'saved looks', 'Refresh saved looks', 'Delete saved look', 'Load preset (file)...', 'Revert edits', 'status']), vis.join(' | '));
      ok('A2 the name field defaults to "<preset> (tuned)"', val(c, 'save as') === 'Golden afternoon (tuned)', val(c, 'save as'));
      const opened = await page.evaluate(() => ({ w: window.__fake.log.writes.length, q: window.__fake.log.queries }));
      ok('A3 opening the panel listed the saved looks once (a read); still nothing written', opened.q === 1 && opened.w === 0, JSON.stringify(opened));
      await page.evaluate(() => { window.__look.preset.sun.intensity = 3.21; window.__look.apply(); });   // tune a value, then Save to page
      await h(page, 'text', ['save as', 'Tweaked sun']); await h(page, 'click', 'Save to page'); await wait(page, 600);
      const doc = await page.evaluate(() => window.__fake.store.get('looks/tweaked-sun') || null), st = await h(page, 'status');
      ok('A4 Save to page writes looks/tweaked-sun = { name, savedAt, preset } with the tuned value; status "Saved to page ✓"',
        doc && Object.keys(doc).sort().join() === 'name,preset,savedAt' && doc.name === 'Tweaked sun' && !Number.isNaN(Date.parse(doc.savedAt)) && doc.preset.sun.intensity === 3.21 && doc.preset.status === 'active' && st === 'Saved to page ✓', `${doc && Object.keys(doc)}; status ${st}`);
      const opts1 = ((await h(page, 'ctrls')).find((x) => x.name === 'saved looks') || {}).options || [];
      ok('A5 exactly one write for one click; the list refreshed and shows the new look', (await page.evaluate(() => window.__fake.log.writes.length)) === 1 && opts1.includes('Tweaked sun'), JSON.stringify(opts1));
      await h(page, 'pickRoot', ['preset', 'Dusk']); await wait(page, 400);   // another preset, then apply the saved look
      const dusk = await page.evaluate(() => window.__look.name);
      ok('A6 selecting another preset moves the name field to "Dusk (tuned)"', dusk === 'Dusk' && val(await h(page, 'ctrls'), 'save as') === 'Dusk (tuned)', `${dusk}; ${val(await h(page, 'ctrls'), 'save as')}`);
      await h(page, 'pick', ['saved looks', 'Tweaked sun']); await wait(page, 600);
      const ap = await page.evaluate(() => ({ name: window.__look.name, intensity: window.__look.preset.sun.intensity }));
      ok('A7 choosing a saved look applies it live (name, the tuned value) and says so', ap.name === 'Tweaked sun' && ap.intensity === 3.21 && (await h(page, 'status')) === 'applied saved look "Tweaked sun"', `${JSON.stringify(ap)}; ${await h(page, 'status')}`);
      await page.evaluate(() => { const g = JSON.parse(JSON.stringify(window.__fake.store.get('looks/tweaked-sun'))); g.name = 'Broken'; g.savedAt = '2099-01-01T00:00:00.000Z'; g.preset.sun.intensity = 99; window.__fake.seed('broken', g); });
      await h(page, 'click', 'Refresh saved looks'); await wait(page, 500);   // an invalid saved look is refused
      await h(page, 'pick', ['saved looks', 'Broken']); await wait(page, 500);
      const br = await page.evaluate(() => ({ name: window.__look.name, intensity: window.__look.preset.sun.intensity }));
      ok('A8 a schema-invalid saved look is NOT applied (the scene keeps the previous look); the status names the problem', br.name === 'Tweaked sun' && br.intensity === 3.21 && (await h(page, 'status')) === '"Broken" not applied: sun.intensity: outside [0, 10]', `${JSON.stringify(br)}; ${await h(page, 'status')}`);
      await h(page, 'pick', ['saved looks', 'Tweaked sun']); await wait(page, 400);   // delete asks first
      await h(page, 'click', 'Delete saved look'); await wait(page, 300);
      const armed = names(await h(page, 'ctrls')), there = await page.evaluate(() => window.__fake.store.has('looks/tweaked-sun'));
      ok('A9 Delete saved look asks first: the first click only re-labels the button, nothing is deleted', there && armed.includes('Really delete "Tweaked sun"? Click again'), armed.join(' | '));
      await h(page, 'click', 'Really delete "Tweaked sun"? Click again'); await wait(page, 600);
      const after = await page.evaluate(() => ({ has: window.__fake.store.has('looks/tweaked-sun'), writes: window.__fake.log.writes.map((w) => w.join(':')) })), opts2 = ((await h(page, 'ctrls')).find((x) => x.name === 'saved looks') || {}).options || [];
      ok('A10 the second click deletes looks/tweaked-sun, the list refreshes without it, the button resets', !after.has && after.writes.join() === 'set:looks:tweaked-sun,delete:looks:tweaked-sun' && !opts2.includes('Tweaked sun') && opts2.includes('Broken') && names(await h(page, 'ctrls')).includes('Delete saved look'), `${after.writes.join()}; options ${opts2.join(' | ')}`);
      await h(page, 'text', ['save as', 'My Look!']); await h(page, 'click', 'Download JSON'); await wait(page, 500);   // Download JSON through the downloads capability
      const d = await page.evaluate(() => window.__fake.log.downloads), dj = d[0] && JSON.parse(d[0].data);
      ok('A11 Download JSON = dl.save({ filename: my-look-.look.json, data }) with the Load-compatible payload', d.length === 1 && d[0].filename === 'my-look-.look.json' && dj && dj.format === 'gitaway-look-preset' && dj.name === 'My Look!' && dj.preset.sun, `${d.length} saves; ${d[0] && d[0].filename}; status ${await h(page, 'status')}`);
      await page.close();
    }
    {   // the viewer declines the download
      const page = await open('', { db: true, downloads: true, decline: true }); await openPanel(page); await toggle(page);
      await h(page, 'click', 'Download JSON'); await wait(page, 500);
      const st = await h(page, 'status');
      ok('A12 the viewer declining the download shows no error (status "download cancelled")', st === 'download cancelled' && !errors.some((e) => /declined|viewer said no/.test(e)), st);
      await page.close();
    }

    // ================= S: SIGNED OUT (db null, downloads available) =================
    {
      const page = await open('', { db: false, downloads: true }); await openPanel(page); await toggle(page);
      const c = await h(page, 'ctrls'), vis = names(c);
      ok('S1 signed out (db null, downloads on): page-save + saved-looks controls hidden; Download JSON shown; name = the plain preset name',
        JSON.stringify(vis) === JSON.stringify(['save as', 'Download JSON', 'Load preset (file)...', 'Revert edits', 'status']) && val(c, 'save as') === 'Golden afternoon', vis.join(' | '));
      ok('S2 ...and nothing was read or written', await page.evaluate(() => window.__fake.log.writes.length === 0 && window.__fake.log.queries === 0), '');
      await page.close();
    }

    // ================= C: the capture URLs create no panel =================
    for (const q of ['?ui=0', '?shot=1']) {
      const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
      page.on('pageerror', (e) => errors.push(`pageerror (${q}): ${e.message}`));
      await page.goto(`http://127.0.0.1:${port}/${page0}${q}`, { waitUntil: 'load', timeout: 120000 });
      await page.waitForFunction(() => window.__look, null, { timeout: 300000, polling: 250 }); await wait(page, 2000);
      const n = await page.evaluate(() => document.querySelectorAll('.lil-gui').length);
      ok(`C ${q}: no lil-gui panel is created`, n === 0, `${n} .lil-gui elements`);
      await page.close();
    }
  } finally {
    await browser.close();
    if (child) child.kill();
  }
  ok('B0 no page errors / console errors', !errors.length, errors.slice(0, 4).join(' | ') || 'none');
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
  console.log(`\n  LOOK PANEL  SAVE & SHARE  END TO END (${page0})`); console.log('  ' + '-'.repeat(100));
  for (const x of results) { if (!x.pass) fails++; console.log('  ' + (x.pass ? 'PASS' : 'FAIL') + '  ' + pad(x.name, 96) + '\n        ' + x.detail); }
  console.log('  ' + '-'.repeat(100)); console.log(`  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
