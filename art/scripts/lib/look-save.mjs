// look-save.mjs -- the LOOK panel's "Save & share" logic. Pure: no DOM, no lil-gui import (the panel passes its folder in), so
// tests/panelsave.test.mjs runs it in node against fakes. build.mjs hands this file to viewer.mjs, which strips the `export`s and
// inlines it as window.__LOOK_SAVE__ (the terrain.mjs pattern) ahead of lib/look-panel.js.
//
// Why: the proof page is also published as a claude.ai artifact, where the plain download link and the clipboard are blocked. The
// artifact runtime offers capabilities through `window.claude.use(name)`: a Promise of the namespace, or null when this view can
// not run it (a local page has no window.claude at all; it also resolves null after ~10 s if no viewer answers). So the panel
// renders at once, with the page-save controls hidden, and lights them up when the promise resolves:
//   db         claude.use('db')          Save to page -> looks/<slug of the name> = { name, savedAt, preset };  Saved looks
//                                        (orderBy savedAt desc, limit 50) -> validate against the schema -> apply;  Delete (confirms)
//   downloads  claude.use('downloads')   Download JSON -> dl.save({ filename: <slug>.look.json, data })
// With neither (the local 127.0.0.1 page) nothing changes: Save = download link + clipboard, Load = file picker, Revert.
// Rules: one db write at a time, only on a click (never on load); retry once on `unavailable`; `declined` (the viewer said no)
// is not an error; other failures show a short status line.

const HEX = /^#[0-9A-Fa-f]{6}$/;
export const COLLECTION = 'looks';
export const LIST_LIMIT = 50;
export const MAX_DOC_BYTES = 256 * 1024;
export const FORMAT = 'gitaway-look-preset';
const LOCAL_LABEL = 'Save preset (download + copy)', DL_LABEL = 'Download JSON', DEL_LABEL = 'Delete saved look', CHOOSE = '(choose a saved look)';
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---- names ----
// slug = a valid db path segment AND a safe file name: lowercase, every char outside [a-z0-9_.-] -> '-', <= 80 chars, never empty.
// (A bare '.' / '..' is not a safe path segment: 'look-' goes in front.)
export function slugify(name) {
  let s = Array.from(String(name == null ? '' : name).toLowerCase(), (ch) => (/^[a-z0-9_.-]$/.test(ch) ? ch : '-')).join('').slice(0, 80);
  if (!s) s = 'look';
  if (/^\.+$/.test(s)) s = ('look-' + s).slice(0, 80);
  return s;
}
export const lookFilename = (name) => slugify(name) + '.look.json';

// ---- documents ----
export const presetForSave = (preset) => Object.assign(clone(preset), { status: 'active' });   // the full lookPresets.json shape
export function makeLookDoc(name, preset, now = new Date()) { return { name, savedAt: new Date(now).toISOString(), preset: presetForSave(preset) }; }
// the file a download carries: the same payload the local Save writes (Load accepts it back, name included)
export function makeFilePayload(name, from, preset, now = new Date()) { return { format: FORMAT, version: 1, name, savedAt: new Date(now).toISOString(), from, preset: presetForSave(preset) }; }

// ---- schema (art/config/lookPresets.schema.json): the ONE validator behind Load-from-file (merge) and Saved looks (validatePreset) ----
// strict (Saved looks, Save to page): also rejects keys the schema does not have and non-integers for `int`, like tests/lookpresets.test.mjs.
export function validate(node, spec, at, errs, strict = false) {
  if (strict && !['group', 'color', 'bool', 'enum', 'number', 'int'].includes(spec.type)) { errs.push(`${at}: unknown schema type ${spec.type}`); return; }
  if (spec.type === 'group') {
    if (!node || typeof node !== 'object' || (strict && Array.isArray(node))) { errs.push(at + ': missing'); return; }
    for (const [k, s] of Object.entries(spec.params)) validate(node[k], s, at + '.' + k, errs, strict);
    if (strict) for (const k of Object.keys(node)) if (!(k in spec.params)) errs.push(`${at}.${k}: not in the schema`);
    return;
  }
  if (spec.type === 'color') { if (!HEX.test(node || '')) errs.push(`${at}: not #RRGGBB`); }
  else if (spec.type === 'bool') { if (typeof node !== 'boolean') errs.push(`${at}: not a boolean`); }
  else if (spec.type === 'enum') { if (!spec.options.includes(node)) errs.push(`${at}: not one of ${spec.options}`); }
  else if (typeof node !== 'number' || !Number.isFinite(node) || node < spec.min || node > spec.max) errs.push(`${at}: outside [${spec.min}, ${spec.max}]`);
  else if (strict && spec.type === 'int' && !Number.isInteger(node)) errs.push(`${at}: not an integer`);
}
// a whole preset: every section, every parameter, no strangers. Returns the list of problems ([] = valid).
export function validatePreset(preset, schema) {
  const S = (schema && schema.sections) || {}, errs = [];
  if (!preset || typeof preset !== 'object' || Array.isArray(preset)) return ['preset: not an object'];
  if (!Object.keys(S).length) return ['schema: no sections'];
  for (const [s, def] of Object.entries(S)) validate(preset[s], { type: 'group', params: def.params }, s, errs, true);
  const allowed = new Set(['status', 'description', 'phase', 'hour', ...Object.keys(S)]);
  for (const k of Object.keys(preset)) if (!allowed.has(k)) errs.push(`${k}: not in the schema`);
  if ('hour' in preset) validate(preset.hour, (schema.preset && schema.preset.hour) || { type: 'number', min: 0, max: 24 }, 'hour', errs, true);
  return errs;
}
// Load from a file: keep only schema keys; take a loaded value when it is valid, else keep the base (with a note)
export function merge(base, over, params, at, notes) {
  for (const [k, spec] of Object.entries(params)) {
    if (!over || !(k in over)) { notes.push(`${at}${k}: missing, kept default`); continue; }
    if (spec.type === 'group') { merge(base[k], over[k], spec.params, `${at}${k}.`, notes); continue; }
    const e = []; validate(over[k], spec, at + k, e);
    if (e.length) notes.push(e[0] + ' (kept default)'); else base[k] = over[k];
  }
  return base;
}
export function fromPayload(p, base, sections) {
  p = p && typeof p === 'object' ? p : {};
  const out = clone(base), notes = [];
  for (const [s, def] of Object.entries(sections)) merge(out[s], p[s], def.params, s + '.', notes);
  out.status = 'active'; out.description = p.description || 'loaded preset';
  if (typeof p.hour === 'number' && p.hour >= 0 && p.hour <= 24) out.hour = p.hour; else delete out.hour;   // day-cycle keyframe hour (optional)
  return { preset: out, notes };
}

// ---- the artifact runtime ----
export function useCapability(claude, name) {   // never rejects: null = this view can not run it
  try {
    if (!claude || typeof claude.use !== 'function') return Promise.resolve(null);
    return Promise.resolve(claude.use(name)).then((ns) => ns || null, () => null);
  } catch { return Promise.resolve(null); }
}
export async function withRetry(fn, delay, ms = 400) {   // one retry, only for `unavailable`
  try { return await fn(); }
  catch (e) { if (e && e.code === 'unavailable') { await delay(ms); return await fn(); } throw e; }
}
export function errText(e, what) {   // one short line
  const code = e && typeof e === 'object' && e.code ? String(e.code) : '';
  let msg = e && typeof e === 'object' && e.message ? String(e.message) : (typeof e === 'string' ? e : '');
  if (!msg) msg = code || 'unknown error'; else if (code && !msg.includes(code)) msg += ` (${code})`;
  const s = `${what}: ${msg}`.replace(/\s+/g, ' ');
  return s.length > 140 ? s.slice(0, 137) + '...' : s;
}
const byteLength = (s) => new TextEncoder().encode(s).length;

// ---- the "Save & share" folder ----
// deps: { claude (window.claude), schema, getName(), getPreset(), applyLook(name, preset) (called only for schema-valid presets),
//         localSave() (the existing download link + clipboard), pickFile(), revert(), now(), delay(ms), timers: { set, clear } }
export function buildSaveShare(folder, deps) {
  const D = Object.assign({ now: () => new Date(), delay: (ms) => new Promise((r) => setTimeout(r, ms)) }, deps);
  const timers = D.timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };
  const caps = { db: null, dl: null }, C = {};
  const state = { saveAs: '', status: 'ready', saved: '' };
  let docs = [], listing = null, busy = false, armed = null, armTimer = null, wasVisible = false;

  const say = (m) => { state.status = String(m); if (C.status) C.status.updateDisplay(); };
  const baseName = () => String(D.getName() || '');
  const defaultSaveAs = (n) => (caps.db ? `${n} (tuned)` : String(n));   // "<preset> (tuned)" only where it can be saved to the page
  const currentName = () => String(state.saveAs || '').trim() || defaultSaveAs(baseName());
  const setSaveAs = (v) => { state.saveAs = String(v); if (C.saveAs) C.saveAs.updateDisplay(); };
  const visible = () => { for (let f = folder; f; f = f.parent) if (f._closed) return false; return true; };   // this folder and every ancestor open
  const button = (label, fn) => { const o = { run: async () => { try { await fn(); } catch (e) { say(errText(e, 'Error')); } } }; return folder.add(o, 'run').name(label); };

  // ---- saved looks (db) ----
  function savedOptions() {
    const o = Object.create(null); o[CHOOSE] = ''; const seen = new Set([CHOOSE]);
    for (const d of docs) { let label = String(d.data.name || d.id); if (seen.has(label)) label += ` [${d.id}]`; seen.add(label); o[label] = d.id; }
    return o;
  }
  function fillSaved() { if (!docs.some((d) => d.id === state.saved)) state.saved = ''; disarm(); C.saved = C.saved.options(savedOptions()); }
  // mode: 'button' (announce the count), 'auto' (on open: silent unless it fails), 'after-write' (keeps the write's status)
  function refresh(mode = 'button') {
    if (!caps.db) return Promise.resolve();
    if (listing) return listing;
    listing = (async () => {
      try {
        const snap = await withRetry(() => caps.db.collection(COLLECTION).orderBy('savedAt', 'desc').limit(LIST_LIMIT).get(), D.delay);
        docs = [];
        for (const d of (snap && snap.docs) || []) {
          if (!d || d.exists === false) continue;
          let data = null; try { data = d.data(); } catch { data = null; }
          docs.push({ id: String(d.id), data: data && typeof data === 'object' ? data : {} });
        }
        fillSaved();
        if (mode === 'button') say(docs.length ? `${docs.length} saved look${docs.length === 1 ? '' : 's'}` : 'no saved looks yet');
      } catch (e) { if (mode !== 'after-write') say(errText(e, 'Could not list saved looks')); }
      finally { listing = null; }
    })();
    return listing;
  }
  function onOpenChange() {   // wired to the ROOT gui's onOpenClose (it bubbles up from every folder): list when the panel + folder open
    const v = visible(); if (v && !wasVisible && caps.db) refresh('auto'); wasVisible = v;
  }
  function pickSaved(id) {
    disarm();
    if (!id) return;
    const d = docs.find((x) => x.id === id);
    if (!d) { say('saved look not found: refresh the list'); return; }
    const label = String(d.data.name || d.id), errs = d.data.preset === undefined ? ['no preset in this saved look'] : validatePreset(d.data.preset, D.schema);
    if (errs.length) { say(`"${label}" not applied: ${errs[0]}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ''}`); return; }   // only schema-valid presets are applied
    D.applyLook(label, d.data.preset);
    say(`applied saved look "${label}"`);
  }

  // ---- writes: one at a time, only from a click ----
  async function saveToPage() {
    if (!caps.db) return;
    if (busy) { say('still working, one moment...'); return; }
    const name = currentName(), preset = D.getPreset(), errs = validatePreset(presetForSave(preset), D.schema);
    if (errs.length) { say(`Not saved: ${errs[0]}`); return; }   // it could never be loaded back
    const doc = makeLookDoc(name, preset, D.now()), id = slugify(name);
    if (byteLength(JSON.stringify(doc)) > MAX_DOC_BYTES) { say('Not saved: the look is larger than 256 KiB'); return; }
    busy = true; say('Saving...');
    try { await withRetry(() => caps.db.collection(COLLECTION).doc(id).set(doc), D.delay); say('Saved to page ✓'); }
    catch (e) { say(errText(e, 'Save failed')); busy = false; return; }
    busy = false;
    await refresh('after-write');
  }
  function disarm() { if (armTimer != null) { timers.clear(armTimer); armTimer = null; } armed = null; if (C.del) C.del.name(DEL_LABEL); }
  async function deleteSaved() {   // asks first: the first click arms (6 s), the second deletes (no window.confirm: sandboxed iframes can block it)
    if (!caps.db) return;
    const id = state.saved; if (!id) { say('choose a saved look to delete first'); return; }
    const d = docs.find((x) => x.id === id), label = String(d && d.data.name || id);
    if (armed !== id) { disarm(); armed = id; C.del.name(`Really delete "${label}"? Click again`); say(`click Delete again to confirm: "${label}"`); armTimer = timers.set(disarm, 6000); return; }
    disarm();
    if (busy) { say('still working, one moment...'); return; }
    busy = true; say('Deleting...');
    try { await withRetry(() => caps.db.collection(COLLECTION).doc(id).delete(), D.delay); say(`deleted "${label}" ✓`); state.saved = ''; }
    catch (e) { say(errText(e, 'Delete failed')); busy = false; return; }
    busy = false;
    await refresh('after-write');
  }

  // ---- download ----
  async function download() {
    if (!caps.dl) { await D.localSave(); return; }   // the existing path: a download link + the clipboard
    const name = currentName(), filename = lookFilename(name);
    try { await caps.dl.save({ filename, data: JSON.stringify(makeFilePayload(name, baseName(), D.getPreset(), D.now()), null, 2) }); say(`saved ${filename}`); }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') say('download cancelled');   // the viewer said no: not an error, no retry
      else if (code === 'rate_limited') say('downloads are rate limited: try again in a moment');
      else say(errText(e, 'Download failed'));
    }
  }

  // ---- the controls (page-save ones start hidden: they light up when claude.use('db') resolves) ----
  C.saveAs = folder.add(state, 'saveAs').name('save as');
  C.saveToPage = button('Save to page', saveToPage).hide();
  C.download = button(LOCAL_LABEL, download);
  C.saved = folder.add(state, 'saved', savedOptions()).name('saved looks').onChange(pickSaved).hide();
  C.refresh = button('Refresh saved looks', () => refresh('button')).hide();
  C.del = button(DEL_LABEL, deleteSaved).hide();
  C.load = button('Load preset (file)...', () => D.pickFile());
  C.revert = button('Revert edits', () => D.revert());
  C.status = folder.add(state, 'status').name('status').disable();
  setSaveAs(defaultSaveAs(baseName()));
  wasVisible = visible();

  function setDb(db) {
    caps.db = db && typeof db.collection === 'function' ? db : null;
    for (const k of ['saveToPage', 'saved', 'refresh', 'del']) C[k].show(!!caps.db);
    if (!caps.db) return;
    if (state.saveAs === baseName()) setSaveAs(defaultSaveAs(baseName()));   // an untouched name becomes "<preset> (tuned)"
    if (visible()) refresh('auto');
    wasVisible = visible();
  }
  function setDl(dl) { caps.dl = dl && typeof dl.save === 'function' ? dl : null; C.download.name(caps.dl ? DL_LABEL : LOCAL_LABEL); }
  const ready = Promise.all([useCapability(D.claude, 'db').then(setDb), useCapability(D.claude, 'downloads').then(setDl)])
    .then(() => undefined, (e) => say(errText(e, 'Save & share')));

  return { controls: C, state, say, setSaveAs, defaultSaveAs, onOpenChange, refresh, saveToPage, download, deleteSaved, pickSaved, ready, get caps() { return caps; } };
}

const LS = { COLLECTION, LIST_LIMIT, MAX_DOC_BYTES, FORMAT, slugify, lookFilename, presetForSave, makeLookDoc, makeFilePayload, validate, validatePreset, merge, fromPayload,
  useCapability, withRetry, errText, buildSaveShare };
export default LS;
