// palette.test.mjs -- the approved palette bands (lib/palette-bands.mjs) over the art config's named colours and colours sampled from
// textured assets. ENFORCE_PROPOSED (lib/qa-proposed.mjs) makes them blocking; the legacy colours that still break a band are named
// exceptions with a reason (LEGACY), never wider bands. PB1, PB10 and PB11 block whatever the switch says. Pure node, read-only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import LOOK from '../../config/look.config.mjs';
import { CELLS } from '../lib/paintedAtlas.mjs';
import { ENFORCE_PROPOSED } from '../lib/qa-proposed.mjs';
import { CROP_PRODUCE, LEGACY, LEGACY_CEILING, atlasEntries, checkColour, conceptEntries, cropColours, hsv, judge, legacyKey, outOfBand, paletteEntries, presetEntries, readJSON, surfaceColour } from '../lib/palette-bands.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ART = path.resolve(HERE, '../..'), MODELS = path.resolve(ART, '../public/models');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? '\n        ' + detail : ''}`); };
const gate = (out, enforce = ENFORCE_PROPOSED) => (enforce ? !out.length : true);   // the one place the switch acts
const excusedAll = [], staleAll = [], outs = [];
const fixture = readJSON(path.join(HERE, 'fixtures', 'palette.out-of-band.json')).colours;
const sampled = (name, hex, family, role = null) => ({ source: 'Meshy albedo (sampled)', name, hex, family, role });

// a source's out-of-band colours fail (when enforced); named legacy colours are counted as excused
function report(label, entries) {
  const { out, excused, stale } = judge(entries);
  excusedAll.push(...excused); staleAll.push(...stale); outs.push(...out);
  ok(label, gate(out), out.map((e) => `${e.path || e.name} ${e.hex} [${e.family}${e.role ? ' ' + e.role : ''}${e.preset ? ' in ' + e.preset : ''}]: ${e.reasons.join('; ')} (h ${Math.round(hsv(e.hex).h)})`).join('\n        '));
}

// PB1 the detector flags every out-of-band fixture colour for each of its rules and none of the in-band controls
{ const bad = [];
  for (const c of fixture) { const r = checkColour(c);
    if (c.expect !== 'out') { if (r.length) bad.push(`control ${c.name} ${c.hex} flagged: ${r.join('; ')}`); continue; }
    const miss = c.rules.filter((rule) => !r.some((x) => x.startsWith(rule)));
    if (!r.length || miss.length) bad.push(`${c.name} ${c.hex}: ${miss.join(', ') || 'not detected'} (got: ${r.join('; ')})`); }
  ok('PB1 detector flags all out-of-band fixture colours for their rules and none of the in-band controls', !bad.length, bad.join('\n        ')); }

// PB2 every palette token has a family (or is explicitly unbanded)
const pal = paletteEntries(LOOK.palette), palBanded = pal.filter((e) => e.family !== undefined);
{ const un = pal.filter((e) => e.family === undefined).map((e) => e.name);
  ok('PB2 every look.config.mjs palette token has a family or is explicitly unbanded', gate(un), 'NO FAMILY: ' + un.join(', ')); }

report('PB3 look.config.mjs palette tokens in their family bands', palBanded);
const LP = readJSON(path.join(ART, 'config', 'lookPresets.json')), { entries: presetEnts } = presetEntries(LP);
report('PB4 lookPresets.json colours in band', presetEnts);
report('PB5 painted atlas cells (sampled from public/models/woodshed.glb) in band', await atlasEntries(path.join(MODELS, 'woodshed.glb'), CELLS));
{ const rocks = [];
  for (const id of ['rock_a', 'rock_b', 'rock_c', 'outcrop_a', 'outcrop_b']) { const c = await surfaceColour(path.join(MODELS, `${id}.glb`)); if (c) rocks.push(sampled(`${id}.${c.material}`, c.hex, 'stone')); }
  report('PB6 Meshy rock and outcrop surface colours in the stone band', rocks); }
report('PB7 approved concept ramps (art/reskin/concept-stats.json) in band', conceptEntries(readJSON(path.join(ART, 'reskin', 'concept-stats.json'))));
{ const r = await surfaceColour(path.join(MODELS, 'farmhouse.glb'), 'Roof');
  report('PB8 the farmhouse Roof texture (owner-approved reference roof) in the roof band', [r ? sampled('farmhouse.Roof', r.hex, 'roof') : sampled('farmhouse.Roof (missing)', '#000000', 'roof')]); }

// PB12 the Meshy crop ready stages: produce in the produce band, leaves in foliage and its shade (a class under 2 % / 5 % of the
// surface is not judged: the wheat is all ear and straw, the blueberry's berries are a few dots)
{ const crops = [], S = (name, hex, family, role) => ({ ...sampled(name, hex, family, role), source: 'Meshy crop (sampled)' });
  for (const [id, pr] of Object.entries(CROP_PRODUCE)) { const f = path.join(MODELS, `${id}.glb`);
    if (!fs.existsSync(f)) { crops.push(S(`${id} (missing)`, '#000000', 'foliage')); continue; }
    const c = await cropColours(f, pr);
    if (c.produce && c.produce.share >= 0.02) crops.push(S(`${id} produce`, c.produce.hex, 'produce'));
    if (c.plant && c.plant.share >= 0.05) crops.push(S(`${id} leaves`, c.plant.hex, 'foliage'), S(`${id} leaf shade`, c.plantShade.hex, 'foliage', 'shade')); }
  report('PB12 Meshy crop ready stages: produce in the produce band, leaves and shade in the foliage bands', crops); }

// PB9 the switch: enforced, any reported colour fails its check; not enforced, none does (and the fixture's colours would fail)
{ const fixtureOut = outOfBand(fixture);
  ok('PB9 ENFORCE_PROPOSED is the one switch', gate(outs, true) === (outs.length === 0) && gate(outs, false) === true && gate(fixtureOut, true) === false && gate([], true) === true); }

// PB10 the legacy register is tidy: each entry has a rule and a reason, inside the ceiling, none stale
{ const keys = Object.keys(LEGACY), over = keys.filter((k) => !LEGACY_CEILING.includes(k)), thin = keys.filter((k) => !LEGACY[k].reason || !LEGACY[k].rules.length);
  const unused = keys.filter((k) => !excusedAll.some((e) => legacyKey(e) === k));
  ok('PB10 legacy register: each entry has a rule and a reason, inside the ceiling, none stale', !over.length && !thin.length && !staleAll.length && !unused.length && excusedAll.length === keys.length,
    `grew: ${over}; no rule or reason: ${thin}; stale: ${[...new Set([...staleAll, ...unused])]}`); }

// PB11 the register bites: emptied, PB3 + PB4 go red on exactly the legacy colours
{ const got = [...judge(palBanded, {}).out, ...judge(presetEnts, {}).out].map(legacyKey).sort();
  ok('PB11 legacy register emptied: PB3 + PB4 go red on exactly the legacy colours', JSON.stringify(got) === JSON.stringify([...LEGACY_CEILING].sort()), `got ${got.length}: ${got.join(', ')}`); }

console.log(`\n  ${pass}/${pass + fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
