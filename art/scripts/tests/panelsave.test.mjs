// panelsave.test.mjs -- the LOOK panel's "Save & share" logic (lib/look-save.mjs) against fakes (claude.use with an in-memory db, downloads, a lil-gui folder). Pure node.
//   S1 slug   S2 saved doc shape   S3 name field   S4 no writes on load   S5 saved looks apply only schema-valid presets   S6 downloads (declined / rate_limited / other)
//   S7 null db hides the page-save controls (local page unchanged)   S8 robustness: retry, one write at a time, list on open, delete confirms   S9 viewer inlines the module   S10 no unhandled rejections
// Usage:  node tests/panelsave.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(__dirname, '../../config'), LIB = path.resolve(__dirname, '../lib');
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
const all = (name, checks, detail = '') => { const bad = Object.keys(checks).filter((k) => !checks[k]); ok(name, !bad.length, (bad.length ? 'failed: ' + bad.join('; ') + ' | ' : '') + detail); };   // one result per subject
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const LP = readJSON(path.join(CONFIG, 'lookPresets.json')), SCHEMA = readJSON(path.join(CONFIG, 'lookPresets.schema.json'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const GOLD = clone(LP.presets['Golden afternoon']), GOLD_JSON = JSON.stringify(GOLD);
const tick = () => new Promise((r) => setImmediate(r));
const unhandled = []; process.on('unhandledRejection', (e) => unhandled.push(e && e.message ? e.message : JSON.stringify(e)));   // a click handler must never reject

let LS = null, loadErr = '';
try { LS = await import('../lib/look-save.mjs'); } catch (e) { loadErr = e.message.split('\n')[0]; }

// ---------------------------------------------------------------------------------------------
// fakes
const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;   // the db's path-segment rule
function fakeDb(opts = {}) {
  const store = new Map(), log = { writes: [], reads: [], queries: [], calls: 0 }, fail = opts.fail || [];   // fail: queue of rejections for the next write/read calls
  const gate = async () => { log.calls++; if (fail.length) { const e = fail.shift(); if (e) throw e; } };
  const seg = (s) => { if (!SEG.test(s)) throw { code: 'invalid-argument', message: 'bad path segment ' + JSON.stringify(s) }; return s; };
  const coll = (c) => ({
    doc: (id) => { seg(c); seg(id); return {
      async set(obj) { await gate(); const body = JSON.stringify(obj); if (body.length > 256 * 1024) throw { code: 'too-large', message: 'body too large' };
        log.writes.push({ op: 'set', collection: c, id, data: clone(obj) }); store.set(c + '/' + id, clone(obj)); await (opts.writeLatency ? new Promise((r) => setTimeout(r, opts.writeLatency)) : null); },
      async get() { await gate(); log.reads.push({ collection: c, id }); const v = store.get(c + '/' + id); return { exists: v !== undefined, data: () => clone(v) }; },
      async delete() { await gate(); log.writes.push({ op: 'delete', collection: c, id }); store.delete(c + '/' + id); },
    }; },
    orderBy: (field, dir) => ({ limit: (n) => ({ async get() { await gate(); log.queries.push({ collection: c, field, dir, limit: n });
      const docs = [...store.entries()].filter(([k]) => k.startsWith(c + '/')).map(([k, v]) => ({ id: k.slice(c.length + 1), exists: true, data: () => clone(v) }));
      docs.sort((a, b) => (a.data()[field] < b.data()[field] ? 1 : -1) * (dir === 'desc' ? 1 : -1)); return { docs: docs.slice(0, n) }; } }) }),
  });
  return { collection: coll, store, log, seed(id, data) { store.set('looks/' + id, clone(data)); } };
}
function fakeDownloads(rejection) { const saved = []; return { saved, async save(a) { saved.push(a); if (rejection) throw rejection; } }; }
function fakeClaude(map) { const asked = []; return { asked, use(name) { asked.push(name); return Promise.resolve(Object.prototype.hasOwnProperty.call(map, name) ? map[name] : null); } }; }
function fakeFolder(closed = false) {   // the slice of lil-gui the panel uses: add / name / show / hide / disable / onChange / options / updateDisplay, _closed, parent
  const f = { _closed: closed, parent: null, controllers: [], add(obj, prop, opts) {
    const c = { obj, prop, opts, label: prop, hidden: false, disabled: false, handlers: [],
      name(s) { this.label = s; return this; }, show(b = true) { this.hidden = !b; return this; }, hide() { return this.show(false); }, disable() { this.disabled = true; return this; },
      onChange(fn) { this.handlers.push(fn); return this; }, options(o) { this.opts = o; return this; }, updateDisplay() { return this; },
      setValue(v) { this.obj[this.prop] = v; for (const h of this.handlers) h(v); return this; }, click() { return this.obj[this.prop](); } };
    f.controllers.push(c); return c; } };
  return f;
}
const optionNames = (c) => Object.keys(c.opts || {});

// a panel wired to fakes; `claude` = the fake window.claude (or undefined for a local page). The panel starts COLLAPSED (root._closed),
// like the real one: p.open() opens it and fires the open/close callback the root lil-gui would bubble up.
function makePanel({ claude, name = 'Golden afternoon', preset = GOLD, extra = {} } = {}) {
  const root = fakeFolder(true), folder = fakeFolder(false), calls = { local: 0, applied: [], picked: 0, reverted: 0 }, timers = [];
  folder.parent = root;
  const share = LS.buildSaveShare(folder, {
    claude, schema: SCHEMA, getName: () => name, getPreset: () => preset,
    applyLook: (n, p) => { calls.applied.push([n, p === undefined ? p : clone(p)]); }, localSave: async () => { calls.local++; }, pickFile: () => { calls.picked++; }, revert: () => { calls.reverted++; },
    now: () => new Date('2026-10-18T12:34:56.789Z'), delay: async () => { await tick(); },
    timers: { set: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clear: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; } }, ...extra });
  return { root, folder, share, calls, timers, C: share.controls,
    open() { root._closed = false; share.onOpenChange(); }, close() { root._closed = true; share.onOpenChange(); } };
}
const statusOf = (p) => String(p.share.state.status);
async function test(name, fn) { try { await fn(); } catch (e) { ok(name + ' (threw)', false, (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : JSON.stringify(e))); } }

const dusk = () => Object.assign(clone(LP.presets.Dusk), { status: 'active' }), duskDoc = { name: 'Dusk', savedAt: '2026-10-01T00:00:00.000Z', preset: dusk() };
const panelWith = async (claude, extra) => { const p = makePanel({ claude, ...extra }); await p.share.ready; return p; };
const lateDb = (db) => { let release; const gate = new Promise((r) => { release = r; }); return { release, claude: { use: (n) => (n === 'db' ? gate.then(() => db) : Promise.resolve(null)) } }; };   // a db that answers when released

if (!LS) {
  ok('S0 lib/look-save.mjs loads', false, loadErr);
  for (const n of ['S1 slug rules', 'S2 saved doc shape', 'S3 name field default', 'S4 nothing writes on load', 'S5 saved looks apply only schema-valid presets', 'S6 downloads', 'S7 null db hides the page-save controls',
    'S8 retry / one write at a time / delete confirms', 'S9 viewer inlines the module']) ok(n, false, 'module missing');
} else {
  ok('S0 lib/look-save.mjs loads', typeof LS.buildSaveShare === 'function' && typeof LS.slugify === 'function', Object.keys(LS).join(', '));

  await test('S1', async () => {
    const { slugify } = LS;
    const cases = [['Golden afternoon (tuned)', 'golden-afternoon--tuned-'], ['Dusk', 'dusk'], ['a_b.c-d', 'a_b.c-d'], ['ÄÖ x/y', '---x-y'], ['', 'look'], [null, 'look'], [undefined, 'look'], ['  ', '--'], ['..', 'look-..'], ['.', 'look-.']];
    const bad = cases.filter(([i, want]) => slugify(i) !== want).map(([i, want]) => `${JSON.stringify(i)} -> ${JSON.stringify(slugify(i))} (want ${want})`);
    let wrong = 0, seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 2000; i++) { let s = ''; for (let k = Math.floor(rnd() * 120); k > 0; k--) s += String.fromCharCode(Math.floor(rnd() * 0x300)); const g = slugify(s); if (!/^[a-z0-9_.-]{1,80}$/.test(g) || /^\.+$/.test(g)) wrong++; }
    all('S1 slug: lowercase, chars outside [a-z0-9_.-] -> "-", empty -> "look", bare dots guarded, <= 80 chars, fuzz always a valid db segment; filename <slug>.look.json',
      { cases: !bad.length, 'max 80 chars': slugify('x'.repeat(200)).length === 80 && /^-{80}$/.test(slugify('é'.repeat(200))), 'fuzz (2000 random names)': wrong === 0, filename: LS.lookFilename('Soft Morning!') === 'soft-morning-.look.json' }, bad.join('; '));
  });

  await test('S2', async () => {
    const db = fakeDb(), p = await panelWith(fakeClaude({ db, downloads: null })), defName = p.share.state.saveAs; await p.C.saveToPage.click();
    const w = db.log.writes, one = w.length, d = w[0] && w[0].data, errs = d ? LS.validatePreset(d.preset, SCHEMA) : ['no doc'], full = Object.assign(clone(GOLD), { status: 'active' }), st = statusOf(p);
    p.share.state.saveAs = 'My Dusk v2'; await p.C.saveToPage.click(); p.share.state.saveAs = '   '; await p.C.saveToPage.click();
    const act = Object.entries(LP.presets).filter(([, q]) => q.status === 'active'), rejected = act.filter(([, q]) => LS.validatePreset(Object.assign(clone(q), { status: 'active' }), SCHEMA).length).map(([k]) => k);
    const broken = clone(GOLD); broken.sun.intensity = 99; const pb = await panelWith(fakeClaude({ db: fakeDb(), downloads: null }), { preset: broken }); await pb.C.saveToPage.click();
    all('S2 save to page: one set looks/<slug> of { name, savedAt, preset } with the full valid preset; names; validator; invalid refused', {
      'name field defaults to "<preset> (tuned)" with a db': defName === 'Golden afternoon (tuned)',
      'one click = exactly one set looks/<slug>': one === 1 && w[0].op === 'set' && w[0].collection === 'looks' && w[0].id === 'golden-afternoon--tuned-',
      'doc is { name, savedAt, preset } only': !!d && JSON.stringify(Object.keys(d).sort()) === '["name","preset","savedAt"]',
      'name = typed name, savedAt ISO': !!d && d.name === 'Golden afternoon (tuned)' && d.savedAt === '2026-10-18T12:34:56.789Z' && new Date(d.savedAt).toISOString() === d.savedAt,
      'preset is the full schema-valid live preset, status active': !!d && !errs.length && JSON.stringify(d.preset) === JSON.stringify(full),
      'status "Saved to page ✓"': st === 'Saved to page ✓', 'input preset not mutated': JSON.stringify(GOLD) === GOLD_JSON,
      'typed name -> its own doc; blank -> default name': w.length === 3 && w[1].id === 'my-dusk-v2' && w[1].data.name === 'My Dusk v2' && w[2].data.name === 'Golden afternoon (tuned)',
      'validator accepts every active preset': act.length >= 3 && !rejected.length,
      'schema-invalid live preset not written, status says why': pb.share.state.status.startsWith('Not saved') && pb.share.state.status.includes('sun.intensity') }, `${errs.slice(0, 3).join('; ')} ${rejected.join(', ')} ${statusOf(pb)}`);
  });

  await test('S3', async () => {
    const pl = await panelWith(undefined), pn = await panelWith(fakeClaude({ db: null, downloads: null }));
    const pd = makePanel({ claude: fakeClaude({ db: fakeDb() }) }), early = pd.share.defaultSaveAs('Dusk'); await pd.share.ready;
    const late = lateDb(fakeDb()), pe = makePanel({ claude: late.claude }); pe.share.state.saveAs = 'my own name'; late.release(); await pe.share.ready;
    all('S3 name field: plain preset name without a db (local page, db null); "(tuned)" once the db answers; an edited name survives a late db', {
      'local page': pl.share.state.saveAs === 'Golden afternoon', 'db null': pn.share.state.saveAs === 'Golden afternoon',
      'defaultSaveAs follows the db': early === 'Dusk' && pd.share.defaultSaveAs('Dusk') === 'Dusk (tuned)', 'edited name survives': pe.share.state.saveAs === 'my own name' }, pe.share.state.saveAs);
  });

  await test('S4', async () => {
    const db = fakeDb(); db.seed('dusk', duskDoc);
    const dl = fakeDownloads(), claude = fakeClaude({ db, downloads: dl }), p = makePanel({ claude }); await p.share.ready; await tick();
    const quiet = db.log.writes.length === 0 && db.log.calls === 0 && dl.saved.length === 0;
    p.open(); await tick(); await tick(); await p.share.refresh('button'); p.C.saved.setValue('dusk'); await tick();
    all('S4 nothing writes on load; opening, listing and picking write nothing; capabilities come through claude.use only ("db", "downloads")', {
      'no write and no db call while created / collapsed': quiet, 'opening, refreshing and picking write nothing': db.log.writes.length === 0 && dl.saved.length === 0 && p.calls.local === 0 && db.log.queries.length >= 1,
      'claude.use asked for db and downloads': JSON.stringify([...claude.asked].sort()) === '["db","downloads"]' }, claude.asked.join(','));
  });

  await test('S5', async () => {
    const db = fakeDb(), good = dusk(), stamp = (n) => `2026-10-${String(n).padStart(2, '0')}T00:00:00.000Z`;
    const mut = (f) => { const c = clone(good); f(c); return c; }, oob = mut((c) => { c.sun.intensity = 99; });
    db.seed('dusk', { name: 'Dusk (mine)', savedAt: stamp(5), preset: good }); db.seed('too-bright', { name: 'Too bright', savedAt: stamp(4), preset: oob });
    db.seed('no-fog', { name: 'No fog', savedAt: stamp(3), preset: mut((c) => { delete c.fog; }) }); db.seed('bad-enum', { name: 'Bad enum', savedAt: stamp(2), preset: mut((c) => { c.renderer.toneMapping = 'Filmic9000'; }) });
    db.seed('bad-colour', { name: 'Bad colour', savedAt: stamp(1), preset: mut((c) => { c.sun.color = 'orange'; }) }); db.seed('rogue-key', { name: 'Rogue key', savedAt: stamp(6), preset: mut((c) => { c.sun.rogue = 1; }) });
    db.seed('no-preset', { name: 'No preset', savedAt: stamp(7) }); db.seed('garbage', { name: 'Garbage', savedAt: stamp(8), preset: 'lol' });
    const p = await panelWith(fakeClaude({ db, downloads: null })); await p.share.refresh('button');
    const q = db.log.queries[db.log.queries.length - 1], names = optionNames(p.C.saved); p.C.saved.setValue('dusk');
    const applied = p.calls.applied.length === 1 && p.calls.applied[0][0] === 'Dusk (mine)' && JSON.stringify(p.calls.applied[0][1]) === JSON.stringify(good), before = p.calls.applied.length, msgs = [];
    for (const id of ['too-bright', 'no-fog', 'bad-enum', 'bad-colour', 'rogue-key', 'no-preset', 'garbage']) { p.C.saved.setValue(id); msgs.push(id + ': ' + statusOf(p)); }
    const none = p.calls.applied.length === before; p.C.saved.setValue('');
    const lp = LS.fromPayload(oob, GOLD, SCHEMA.sections);
    all('S5 saved looks: orderBy savedAt desc limit 50; newest first; only a schema-valid look applies, refusals are named; placeholder applies nothing; fromPayload shares the validator', {
      query: !!q && q.collection === 'looks' && q.field === 'savedAt' && q.dir === 'desc' && q.limit === 50,
      'dropdown by name, newest first, after a placeholder': names.length === 9 && names[0].startsWith('(') && names[1] === 'Garbage' && names[2] === 'No preset' && names[3] === 'Rogue key' && names.includes('Dusk (mine)'),
      'valid look applied (name + full preset)': applied, 'no invalid look applied (range, missing section, enum, colour, unknown key, no preset, not an object)': none,
      'each refusal says "not applied"': msgs.every((m) => /not applied/i.test(m)), 'first problem named': /sun\.intensity/.test(msgs[0]) && /fog/.test(msgs[1]) && /toneMapping/.test(msgs[2]) && /sun\.color/.test(msgs[3]),
      'placeholder applies nothing': p.calls.applied.length === before, 'fromPayload keeps the default for an out-of-range value, with a note': lp.preset.sun.intensity === GOLD.sun.intensity && lp.notes.some((n) => /sun\.intensity/.test(n)) }, msgs.join(' | '));
  });

  await test('S6', async () => {
    const dl = fakeDownloads(), p = await panelWith(fakeClaude({ db: fakeDb(), downloads: dl })), label = p.C.download.label;
    p.share.state.saveAs = 'Golden afternoon (tuned)'; await p.C.download.click();
    const a = dl.saved[0], payload = a && JSON.parse(a.data);
    all('S6 downloads: <slug>.look.json with the loadable preset (indent 2), no local path; declined = no error and no retry; rate_limited = try later; other = short status', {
      'button reads "Download JSON"': label === 'Download JSON', 'dl.save({ filename, data string })': dl.saved.length === 1 && a.filename === 'golden-afternoon--tuned-.look.json' && typeof a.data === 'string',
      'file is format gitaway-look-preset, name, full valid preset': !!payload && payload.format === 'gitaway-look-preset' && payload.name === 'Golden afternoon (tuned)' && !LS.validatePreset(payload.preset, SCHEMA).length && a.data.includes('\n  "format"'),
      'local path unused': p.calls.local === 0, 'status: saved <filename>': /golden-afternoon--tuned-\.look\.json/.test(statusOf(p)) && !/fail|error/i.test(statusOf(p)) }, a && a.filename);
    const fails = {};
    for (const [k, rej] of [['declined', { code: 'declined', message: 'viewer declined' }], ['rate', { code: 'rate_limited' }], ['other', { code: 'internal', message: 'disk exploded' }]]) {
      const d = fakeDownloads(rej), q = await panelWith(fakeClaude({ db: fakeDb(), downloads: d })); let threw = null; try { await q.C.download.click(); } catch (e) { threw = e; } fails[k] = { calls: d.saved.length, threw, st: statusOf(q) }; }
    all('S6 failures', { 'declined: no throw, no error status, no retry': !fails.declined.threw && fails.declined.calls === 1 && !/error|fail|denied|declined|could not|rate/i.test(fails.declined.st),
      'rate_limited: try-later status, one attempt': fails.rate.calls === 1 && /later|rate/i.test(fails.rate.st), 'other: "download failed" short status': fails.other.calls === 1 && /download failed/i.test(fails.other.st) && fails.other.st.length <= 140 }, JSON.stringify(fails));
  });

  await test('S7', async () => {
    const hiddenSet = (p) => ['saveToPage', 'saved', 'refresh', 'del'].map((k) => [k, p.C[k].hidden]), LOCAL = 'Save preset (download + copy)';
    for (const [label, claude] of [['no window.claude (local page)', undefined], ['claude.use resolves null for db (signed out)', fakeClaude({ db: null, downloads: null })],
      ['claude without use()', {}], ['claude.use rejects', { use: () => Promise.reject(new Error('nope')) }], ['claude.use throws', { use: () => { throw new Error('boom'); } }]]) {
      const p = await panelWith(claude); await tick(); const h = hiddenSet(p), labels = [p.C.download, p.C.load, p.C.revert].map((c) => c.label);
      await p.C.download.click(); await p.C.load.click(); await p.C.revert.click(); await p.C.saveToPage.click();
      all(`S7 db null (${label}): page-save controls hidden; Save / Load / Revert stay with their old labels and paths; no page-save`, {
        'Save-to-page, Saved looks, Refresh, Delete hidden': h.every(([, v]) => v === true),
        'old labels': !p.C.download.hidden && !p.C.load.hidden && !p.C.revert.hidden && !p.C.saveAs.hidden && labels.join('|') === `${LOCAL}|Load preset (file)...|Revert edits`,
        'Save = local download + clipboard, Load = picker, Revert = revert': p.calls.local === 1 && p.calls.picked === 1 && p.calls.reverted === 1 && p.calls.applied.length === 0 }, JSON.stringify(h));
    }
    const late = lateDb(fakeDb()), p = makePanel({ claude: late.claude });
    const before = hiddenSet(p).every(([, v]) => v === true), earlyLabel = p.C.download.label; late.release(); await p.share.ready;
    const pn = await panelWith(fakeClaude({ db: fakeDb(), downloads: null })); await pn.C.download.click();
    all('S7 the controls are hidden from the first render and light up when db resolves; db without downloads keeps the local label and path', {
      'hidden before, shown after': before && hiddenSet(p).every(([, v]) => v === false) && earlyLabel === LOCAL, 'db but no downloads: local label and path': pn.C.download.label === LOCAL && pn.calls.local === 1 });
  });

  await test('S8', async () => {
    const saveWith = async (opts) => { const db = fakeDb(opts), p = await panelWith(fakeClaude({ db, downloads: null })); await p.C.saveToPage.click(); return { db, p, st: statusOf(p) }; };
    const a = await saveWith({ fail: [{ code: 'unavailable', message: 'try again' }] }), b = await saveWith({ fail: [{ code: 'unavailable' }, { code: 'unavailable', message: 'still down' }] });
    const c = await saveWith({ fail: [{ code: 'permission-denied', message: 'sign in first' }] });
    const q = fakeDb({ writeLatency: 20 }), pq = await panelWith(fakeClaude({ db: q, downloads: null }));
    await Promise.all([pq.C.saveToPage.click(), pq.C.saveToPage.click(), pq.C.saveToPage.click()]); const rapid = q.log.writes.length; await pq.C.saveToPage.click();
    const db5 = fakeDb({ fail: [{ code: 'internal', message: 'index missing' }] }), p5 = await panelWith(fakeClaude({ db: db5, downloads: null })); await p5.share.refresh('button');
    all('S8 robustness: retry once on `unavailable`, other codes fail at once with a short status; one write at a time; a failing list leaves the controls usable', {
      '`unavailable` retried once then succeeds': a.db.log.writes.length === 1 && a.st === 'Saved to page ✓',
      'second `unavailable` -> failure status': b.db.log.writes.length === 0 && b.db.log.calls === 2 && /save failed/i.test(b.st) && /still down/.test(b.st),
      'other code: no retry, short status': c.db.log.calls === 1 && /save failed.*sign in first/i.test(c.st) && c.st.length <= 140,
      'three rapid clicks = one write, the next idle click writes again': rapid === 1 && q.log.writes.length === 2,
      'failing query: "Could not list saved looks: ..."': /could not list saved looks.*index missing/i.test(statusOf(p5)) && db5.log.writes.length === 0 }, `${a.st} | ${b.st} | ${c.st} | ${statusOf(p5)}`);
    const db6 = fakeDb(); db6.seed('dusk', duskDoc);
    const p6 = await panelWith(fakeClaude({ db: db6, downloads: null })); await tick(); const q0 = db6.log.queries.length; p6.open(); await tick(); await tick();
    const q1 = db6.log.queries.length, listed = optionNames(p6.C.saved).includes('Dusk'); p6.share.onOpenChange(); await tick(); const q2 = db6.log.queries.length; p6.close(); p6.open(); await tick(); await tick();
    const db6b = fakeDb(), p6b = await panelWith(fakeClaude({ db: db6b, downloads: null })); p6b.root._closed = false; p6b.folder._closed = true; p6b.share.onOpenChange(); await tick(); await tick();
    const n0 = db6b.log.queries.length; p6b.folder._closed = false; p6b.share.onOpenChange(); await tick(); await tick();
    const db6c = fakeDb(), late = lateDb(db6c), p6c = makePanel({ claude: late.claude }); p6c.root._closed = false; late.release(); await p6c.share.ready; await tick(); await tick();
    all('S8 the list is fetched when the panel opens (not collapsed, not again while open, again on the next open), when the Save & share folder opens, and when the db answers while open', {
      'on open': q0 === 0 && q1 === 1 && listed, 'not again while open': q2 === 1, 'again on the next open': db6.log.queries.length === 2,
      'closed folder in an open panel does not list; opening it does': n0 === 0 && db6b.log.queries.length === 1, 'db answering while open lists at once': db6c.log.queries.length === 1 });
    const db7 = fakeDb(); db7.seed('dusk', duskDoc); const p7 = await panelWith(fakeClaude({ db: db7, downloads: null })); await p7.share.refresh('button');
    await p7.C.del.click(); const none = db7.log.writes.length === 0 && /choose/i.test(statusOf(p7)); p7.C.saved.setValue('dusk'); await p7.C.del.click();
    const armed = none && db7.log.writes.length === 0 && /click .*again|confirm/i.test(statusOf(p7)) && /really delete/i.test(p7.C.del.label) && db7.store.has('looks/dusk');
    p7.timers[p7.timers.length - 1].fn(); const disarmed = p7.C.del.label === 'Delete saved look'; await p7.C.del.click();
    const rearmed = disarmed && db7.log.writes.length === 0 && /really delete/i.test(p7.C.del.label); await p7.C.del.click();
    const p8 = await panelWith(fakeClaude({ db: fakeDb(), downloads: null })); await p8.C.saveToPage.click();
    all('S8 delete confirms first (nothing selected = nothing; first click asks; the confirmation expires by timer; second click deletes, relists, resets the dropdown); a save refreshes the list and keeps its status', {
      'first click only asks': armed, 'confirmation expires and asks again': rearmed,
      'second click deletes looks/<id>': db7.log.writes.length === 1 && db7.log.writes[0].op === 'delete' && db7.log.writes[0].id === 'dusk' && !db7.store.has('looks/dusk') && optionNames(p7.C.saved).length === 1 && p7.share.state.saved === '' && p7.C.del.label === 'Delete saved look',
      'save refreshes the list and keeps "Saved to page ✓"': optionNames(p8.C.saved).includes('Golden afternoon (tuned)') && statusOf(p8) === 'Saved to page ✓' }, `${JSON.stringify(db7.log.writes)}; ${statusOf(p7)}`);
  });

  await test('S9', async () => {
    const { viewerHtml } = await import('../lib/viewer.mjs'), src = fs.readFileSync(path.join(LIB, 'look-save.mjs'), 'utf8');
    const html = viewerHtml({ assets: [] }, {}, {}, '', {}, '', '', { lookPresets: LP, lookSchema: SCHEMA, panelSource: '', saveSource: src });
    const m = html.match(/<script>\/\* lib\/look-save\.mjs inlined[^]*?<\/script>/); let g = null, err = '';
    if (m) { const win = {}; try { vm.runInNewContext(m[0].replace(/^<script>/, '').replace(/<\/script>$/, ''), { window: win, console, setTimeout, clearTimeout, TextEncoder }); g = win.__LOOK_SAVE__; } catch (e) { err = e.message; } }
    const none = viewerHtml({ assets: [] }, {}, {}, '', {}, '', '', { lookPresets: LP, lookSchema: SCHEMA, panelSource: '' });
    all('S9 viewer.mjs inlines lib/look-save.mjs as a classic script before the panel, it runs standalone as window.__LOOK_SAVE__, and the page builds without saveSource', {
      'inlined before the panel': !!m && html.indexOf(m[0]) < html.indexOf('the LOOK panel'),
      'runs standalone, exposes __LOOK_SAVE__': !!g && typeof g.buildSaveShare === 'function' && g.slugify('A b') === 'a-b' && Object.keys(g).sort().join() === Object.keys(LS.default || {}).sort().join(), 'no module syntax inside': !/^\s*(import|export)\s/m.test(m ? m[0] : 'x'),
      'builds without saveSource': typeof none === 'string' && none.length > 1000 }, err);
  });
}

// ---------------------------------------------------------------------------------------------
await tick(); await tick();
if (LS) ok('S10 no unhandled promise rejections anywhere above (every click handler catches its own errors)', !unhandled.length, unhandled.slice(0, 3).join(' | ') || 'none');
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n); let fails = 0;
console.log('\n  LOOK PANEL  SAVE & SHARE  (lib/look-save.mjs against fake claude.use / db / downloads / lil-gui)'); console.log('  ' + '-'.repeat(100));
for (const x of results) { if (!x.pass) fails++; console.log('  ' + (x.pass ? 'PASS' : 'FAIL') + '  ' + pad(x.name, 96) + '\n        ' + x.detail); }
console.log('  ' + '-'.repeat(100)); console.log(`  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
process.exit(fails ? 1 : 0);
