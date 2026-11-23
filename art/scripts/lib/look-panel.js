// look-panel.js -- the LOOK panel of the proof page (lil-gui from cdn.jsdelivr.net/npm, pinned in viewer.mjs's importmap).
// Inlined by build.mjs as its own module script after the scene. Generated from window.__LOOK_SCHEMA__
// (art/config/lookPresets.schema.json): one folder per section, every parameter, live via window.__look.apply().
// Parameters a later phase introduces ('wired: false') are listed, disabled, and tagged with their phase.
//   preset dropdown            = the active presets of lookPresets.json (+ a loaded / ?hour= one)
//   folder "Save & share"      (logic in lib/look-save.mjs -> window.__LOOK_SAVE__, node-tested against fakes)
//     save as                  = the name (defaults to the preset name; "<name> (tuned)" where the page can store it)
//     Save preset (download + copy)  = LOCAL page: download <name>.look.json AND copy the same JSON to the clipboard
//     Load preset (file)...    = file picker: a saved .look.json, a raw preset object, or a whole lookPresets.json
//     Revert edits             = back to the preset as it was selected
//   as a claude.ai artifact (window.claude.use resolves 'db' / 'downloads'; the plain link + clipboard are blocked there), these
//   light up when the capability answers, and stay hidden / unchanged on a local page:
//     Save to page             = looks/<slug> = { name, savedAt, preset } in the page's db
//     saved looks / Refresh / Delete saved look = the db's list (schema-validated before it is applied); Delete asks first
//     Download JSON            = the same file through the viewer's downloads capability
// Collapsed by default; not created with ?ui=0, ?shot=1 or ?capture= (captures read the canvas, never the DOM).
(async function lookPanel() {
  const QS = new URLSearchParams(location.search);
  if (!window.__ARCH__ || QS.get('ui') === '0' || QS.get('shot') === '1' || QS.get('capture')) return;
  for (let i = 0; i < 400 && !window.__look; i++) await new Promise((r) => setTimeout(r, 25));
  const LK = window.__look; if (!LK || !LK.schema) return;
  const LS = window.__LOOK_SAVE__; if (!LS) { console.warn('[look-panel] window.__LOOK_SAVE__ is missing (page built without lib/look-save.mjs)'); return; }
  let GUI;
  try { ({ default: GUI } = await import('lil-gui')); } catch (e) { console.warn('[look-panel] lil-gui did not load (offline?):', e.message); return; }
  const SEC = LK.schema.sections, clone = (o) => JSON.parse(JSON.stringify(o));

  // merge a loaded preset onto the default: the schema validator lives in lib/look-save.mjs (shared with Saved looks)
  const fromPayload = (p) => LS.fromPayload(p, LK.presets[LK.defaultName], SEC);

  // ---- the panel ----
  const gui = new GUI({ title: 'Look  (lookPresets.json)', width: 330 });
  gui.domElement.classList.add('look-panel');
  const state = { preset: LK.name };
  let snapshot = clone(LK.preset), params = null, presetCtl = null;
  const names = () => { const n = Object.keys(LK.presets).filter((k) => LK.presets[k].status === 'active'); if (!n.includes(LK.name)) n.unshift(LK.name); return n; };
  function presetDropdown() {
    if (presetCtl) presetCtl.destroy();
    presetCtl = gui.add(state, 'preset', names()).name('preset').onChange((n) => { if (LK.select(n)) { snapshot = clone(LK.preset); share.setSaveAs(share.defaultSaveAs(n)); rebuild(); share.say('selected ' + n); } });
    presetCtl.domElement.title = 'Named presets of lookPresets.json (stubs are not selectable). URL: ?look=<name>';
    gui.children.splice(gui.children.indexOf(presetCtl), 1); gui.children.unshift(presetCtl); gui.$children.prepend(presetCtl.domElement);
  }
  // Save & share: save as / Save to page / Save preset (download + copy) | Download JSON / saved looks / Refresh / Delete / Load / Revert / status
  const folder = gui.addFolder('Save & share');
  const share = LS.buildSaveShare(folder, {
    claude: window.claude,   // undefined on a local page; the artifact runtime offers it (guarded inside: claude.use may resolve null)
    schema: LK.schema,
    getName: () => LK.name, getPreset: () => LK.preset,
    applyLook: (n, p) => adopt([[n, p]]),                                                          // only ever called with a schema-valid preset
    localSave: () => save(),                                                                       // the existing download link + clipboard
    pickFile: () => picker.click(),
    revert: () => { LK.apply(clone(snapshot)); rebuild(); share.say('reverted'); },
  });
  gui.onOpenClose(() => share.onOpenChange());   // bubbles up from every folder: the saved-looks list is fetched when the panel opens
  presetDropdown();
  // LOOK CORE: one time-of-day scalar (the moods are keyframes: lookPresets.json timeOfDay) + quick toggles for the look-core effects
  if (typeof LK.setHour === 'function') {
    const tod = { hour: typeof LK.preset.hour === 'number' ? LK.preset.hour : 16.5 };
    const hc = gui.add(tod, 'hour', 0, 24, 0.25).name('time of day (h)').onChange((h) => { if (LK.setHour(h)) { state.preset = LK.name; presetDropdown(); snapshot = clone(LK.preset); rebuild(); share.say('time ' + h + ' h'); } });
    hc.domElement.title = 'Blends every look value between the neighbouring mood keyframes (' + ((LK.timeOfDay && LK.timeOfDay.keyframes) || []).join(' / ') + '). URL: ?hour=H';
    gui.children.splice(gui.children.indexOf(hc), 1); gui.children.splice(1, 0, hc); presetCtl.domElement.after(hc.domElement);
  }
  const quick = gui.addFolder('Look core toggles'); quick.close();
  function quickToggles() {
    for (const c of [...quick.controllers]) c.destroy();
    const P = LK.preset, T = [['composite (high tier)', P.post && P.post.composite, 'enabled'], ['ink outline', P.post && P.post.ink, 'enabled'], ['bloom', P.post && P.post.bloom, 'enabled'],
      ['grade', P.post && P.post.grade, 'enabled'], ['vignette', P.post && P.post.vignette, 'enabled'], ['cel bands', P.cel, 'enabled'], ['painted sky', P.sky, 'mode']];
    for (const [label, obj, key] of T) { if (!obj || !(key in obj)) continue;
      const c = key === 'mode' ? quick.add(obj, key, ['screen', 'dome', 'painted']) : quick.add(obj, key); c.name(label).onChange(() => LK.apply()); }
  }

  function rebuild() {
    quickToggles();
    if (params) params.destroy();
    params = gui.addFolder('Parameters (hover = help, P# = later phase)');
    const P = LK.preset;
    if (typeof P.hour === 'number') {   // metadata: the day-cycle hour this mood is the keyframe for (saved with the preset)
      const h = params.add(P, 'hour', 0, 24, 0.25).name('day-cycle hour (keyframe)');
      h.domElement.title = (LK.schema.preset && LK.schema.preset.hour && LK.schema.preset.hour.desc) || 'Day-cycle keyframe hour.';
    }
    for (const [sec, def] of Object.entries(SEC)) {
      const f = params.addFolder(def.label + (def.phase ? `  - phase ${def.phase}` : '')); f.close();
      add(f, def.params, P[sec]);
    }
  }
  function add(folder, defs, obj) {
    for (const [k, spec] of Object.entries(defs)) {
      if (spec.type === 'group') { const g = folder.addFolder((spec.label || k) + (spec.phase && !anyWired(spec) ? `  - P${spec.phase}` : '')); g.close(); add(g, spec.params, obj[k]); continue; }
      const c = spec.type === 'color' ? folder.addColor(obj, k) : spec.type === 'bool' ? folder.add(obj, k) : spec.type === 'enum' ? folder.add(obj, k, spec.options) : folder.add(obj, k, spec.min, spec.max, spec.step);
      c.name(k + (spec.wired ? '' : `  (P${spec.phase})`));
      c.domElement.title = (spec.wired ? '' : `Phase ${spec.phase}: defined, not wired yet. `) + (spec.desc || '');
      if (!spec.wired) c.disable(); else c.onChange(() => LK.apply());
    }
  }
  const anyWired = (spec) => Object.values(spec.params).some((s) => (s.type === 'group' ? anyWired(s) : s.wired));
  rebuild();
  gui.close();   // collapsed by default

  // ---- Save (local page): download + clipboard (same JSON; Load accepts it back) ----
  async function save() {
    const name = (share.state.saveAs || LK.name).trim() || 'preset';
    const payload = { format: 'gitaway-look-preset', version: 1, name, savedAt: new Date().toISOString(), from: LK.name, preset: Object.assign(clone(LK.preset), { status: 'active' }) };
    const json = JSON.stringify(payload, null, 1);
    let dl = false, cp = false;
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = name.replace(/[^\w.-]+/g, '_') + '.look.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); dl = true; } catch (e) { console.warn('[look-panel] download failed', e); }
    try { await navigator.clipboard.writeText(json); cp = true; } catch {
      try { const t = Object.assign(document.createElement('textarea'), { value: json }); document.body.appendChild(t); t.select(); cp = document.execCommand('copy'); t.remove(); } catch { /* no clipboard */ } }
    share.say(`${dl ? 'downloaded' : 'no download'} + ${cp ? 'copied' : 'clipboard blocked'}: ${name}`);
    console.log('[look-panel] saved preset "' + name + '"\n' + json);
  }

  // ---- adopt presets (Load from a file, a saved look): merge onto the default, select the first, rebuild the folders ----
  function adopt(items) {
    let first = null;
    for (const [n0, p] of items) {
      const { preset, notes } = fromPayload(p); let n = n0;
      if (LK.presets[n] && JSON.stringify(LK.presets[n]) !== JSON.stringify(preset)) n = n0 + ' (loaded)';
      LK.add(n, preset); first = first || n;
      if (notes.length) console.warn(`[look-panel] ${n}: ${notes.length} note(s)\n  ` + notes.join('\n  '));
    }
    state.preset = first; presetDropdown(); LK.select(first); snapshot = clone(LK.preset); share.setSaveAs(first); rebuild();
    return first;
  }

  // ---- Load: a .look.json payload, a raw preset object, or a full lookPresets.json ----
  const picker = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  picker.style.display = 'none'; document.body.appendChild(picker);
  picker.addEventListener('change', async () => {
    const f = picker.files && picker.files[0]; if (!f) return; picker.value = '';
    let j; try { j = JSON.parse(await f.text()); } catch { share.say('not JSON: ' + f.name); return; }
    const items = [];
    if (j && j.format === 'gitaway-look-preset' && j.preset) items.push([j.name || f.name, j.preset]);
    else if (j && j.presets) { for (const [n, p] of Object.entries(j.presets)) if (p.status === 'active') items.push([n, p]); }
    else if (j && j.sun && j.renderer) items.push([f.name.replace(/(\.look)?\.json$/i, ''), j]);
    if (!items.length) { share.say('no preset in ' + f.name); return; }
    adopt(items);
    share.say(`loaded ${items.length} preset(s) from ${f.name}`);
  });
})();
