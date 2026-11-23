// palette-bands.mjs -- VISUAL-QA V2, the palette bands (ART-PLAN A2, stage 1 "QA rails"). ART-BIBLE §B.1's saturation, value and
// temperature rules per colour family, the family of every named colour, and the detector. tests/palette.test.mjs runs it over
// art/config/look.config.mjs `palette`, art/config/lookPresets.json, and colours sampled from textured assets: the painted atlas
// cells (read from the published file), the Meshy rock / outcrop albedos, and the approved concept ramps frozen in
// art/reskin/concept-stats.json.
//
// Every band here is APPROVED by the owner (2026-10-25, "Accept all recommendations" on the rules review; ART-BIBLE §B.1) and
// BLOCKS (lib/qa-proposed.mjs ENFORCE_PROPOSED = true). The retune from the first report: stone <= 0.30, roof its own family
// 0.45-0.80, timber floor 0.35, dark-green floor 0.30, water 0.15-0.55. The legacy colours that still break a band are NAMED
// exceptions with a reason (LEGACY below), never wider bands. Its own detector test (a deliberately out-of-band fixture) blocks too.
//
// Measures (the proof's metrics.mjs conventions): HSV saturation s = (max - min) / max and hue in degrees on the sRGB values;
// luma = 0.2126 R' + 0.7152 G' + 0.0722 B' (Rec.709 on sRGB values, STYLE P1).
//   saturation: the §B.1 table, compared at the two decimals the bands are written in (a measured 0.551 is 0.55; the draft water
//               stop #4FA7B0 is 0.551 and #BEDFD2 is 0.148, both inside the approved 0.15-0.55)
//   value:      "no black, no white" for albedo: luma >= 0.08 (STYLE P1's floor) and <= 0.96 (just above the lightest albedos,
//               SoftCream #FBF1DA 0.947 and foam #F4F4EB 0.954); shade tints: luma >= 0.05 (never black)
//   temperature (hue windows are derived from §B.1's prose and the approved tokens, noted per family): warm materials (timber,
//               roof, cream walls, soil, path, ink) warm; paths tan 20-45° (STYLE P3); stone near-neutral warm grey; water cool;
//               greens green; shade tints cool and never grey ("warm key light, cool shade"); key lights warm. Margins to watch:
//               the birch lit stop (57°) and the fir shade stop (170°) sit 2° and 5° inside the green windows; widen to 50-180 if
//               a ramp is re-sampled.
import fs from 'node:fs';
import jpeg from 'jpeg-js';
import { NodeIO } from '@gltf-transform/core';

// ---- colour maths -----------------------------------------------------------------------------------------------------------
export const rgbOf = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const hexOf = (rgb) => '#' + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('').toUpperCase();
export function hsv(hex) {
  const [r, g, b] = rgbOf(hex).map((c) => c / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s: mx > 0 ? d / mx : 0, v: mx };
}
export const luma = (hex) => { const [r, g, b] = rgbOf(hex).map((c) => c / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const inHue = (h, ranges) => ranges.some(([a, b]) => h >= a && h <= b);

// ---- families (ART-BIBLE §B.1) ------------------------------------------------------------------------------------------------
// sat: [lo, hi] (null = open); shadeSat: the stricter band for role 'shade'; hue: allowed windows in degrees, checked only when
// s >= hueMinSat (a near-neutral colour has no meaningful hue); value: 'albedo' | 'shade' | null
const WARM = [[0, 60], [330, 360]];
export const FAMILIES = {
  lawn: { sat: [0.25, 0.45], hue: [[55, 160]], value: 'albedo', why: 'lawn, path, soil 0.25-0.45; greens (derived window: the approved lawn hues run 72-141°)' },
  earth: { sat: [0.25, 0.45], hue: [[20, 45]], value: 'albedo', why: 'lawn, path, soil 0.25-0.45; paths tan 20-45° (STYLE P3)' },
  foliage: { sat: [null, 0.7], shadeSat: [0.3, 0.6], hue: [[55, 175]], value: 'albedo', why: 'foliage: shade 0.30-0.60 (dark greens desaturate; lowest approved 0.31), sunlit top <= 0.70; greens (derived window: the concept ramps run 57-170°)' },
  stone: { sat: [null, 0.3], hue: WARM, hueMinSat: 0.05, value: 'albedo', why: 'stone, cliff, underside <= 0.30 (weathered prop stone and Meshy rocks run 0.20-0.28; terrain rock stays <= 0.20); near-neutral warm grey, never grey-blue (STYLE P4)' },
  timber: { sat: [0.35, 0.6], hue: [[5, 50]], value: 'albedo', why: 'timber and bark 0.35-0.60 (weathered grey plank 0.36 is meant to be duller); warm materials at the farm' },
  roof: { sat: [0.45, 0.8], hue: [[5, 50]], value: 'albedo', why: 'clay roof tiles 0.45-0.80, its own family: the owner-approved farmhouse roof texture is 0.76, atlas tiles 0.62-0.66' },
  wall: { sat: [null, 0.3], hue: [[20, 60]], hueMinSat: 0.05, value: 'albedo', why: 'walls, cream, cloth <= 0.30; cream is warm' },
  cloth: { sat: [null, 0.3], value: 'albedo', why: 'walls, cream, cloth <= 0.30 (Barnaby cloth is slate-teal: no temperature rule)' },
  water: { sat: [0.15, 0.55], hue: [[150, 230]], value: 'albedo', why: 'water 0.15-0.55, matching the per-body palettes of ART-BIBLE §B.2 (pale river / tarn / spring shallows 0.15, spring deep 0.55); water is cool and cools by altitude' },
  foam: { sat: [null, 0.1], value: 'albedo', why: 'foam is a near-white cream, the lightest albedo' },
  accent: { sat: [null, 0.7], value: 'albedo', why: 'flowers, accents <= 0.70' },
  // the NAMED exception to the accents' 0.70 (owner, 2026-10-25): a crop's produce (fruit, roots, heads, berries) may reach 0.85 so it
  // pops against the soil; the crop's leaves and stems stay in the foliage band. Judged on the Meshy crops (PB12, cropColours)
  produce: { sat: [null, 0.85], value: 'albedo', why: 'crop produce (fruit, roots, heads, berries) <= 0.85, a named exception to the accents <= 0.70 (owner, 2026-10-25): it pops against the soil; leaves and stems stay in the foliage band' },
  glow: { sat: [null, 0.7], hue: [[20, 60]], why: 'accents <= 0.70; magic and lamps are warm light (glow.window family)' },
  ink: { sat: [null, 0.7], hue: WARM, hueMinSat: 0.05, value: 'albedo', why: 'the darkest model colour is a warm ink, never black' },
  shade: { sat: [0.1, null], hue: [[180, 320]], value: 'shade', why: 'shadows are never grey or black; cool shade (cel #A496D8, grade #7C86C8)' },
  keylight: { hue: [[10, 60]], hueMinSat: 0.05, why: 'warm key light' },
};

// the family of every look.config.mjs palette token (null = no §B.1 band: sky, haze, hills, clouds, smoke, light tints, glass).
// [family, role] where the role matters (foliage shade stops take the stricter band).
export const PALETTE_FAMILY = {
  WarmIvory: 'wall', SoftCream: 'wall', WallShade: 'wall',
  DeepFoliage: ['foliage', 'shade'], ForestGreen: ['foliage', 'shade'], MeadowGreen: 'foliage', SageGreen: 'foliage', FreshFoliage: 'foliage',
  Grass: 'lawn', GrassDark: 'lawn', MeadowLight: 'lawn', TerrainGrass: 'lawn', TerrainMeadow: 'lawn', TerrainGrassDark: 'lawn',
  Soil: 'earth', DarkSoil: 'earth', Path: 'earth', Dirt: 'earth', SoilBed: 'earth', SoilShade: 'earth', SoilDry: 'earth',
  MutedWood: 'timber', DarkWood: 'timber', LightWood: 'timber', Terracotta: 'roof', TerracottaDark: 'roof',
  Stone: 'stone', DarkStone: 'stone', CliffStone: 'stone', CliffStoneDark: 'stone', UnderStone: 'stone', UnderStoneDark: 'stone',
  Coral: 'accent', Wildflower: 'accent', Blossom: 'accent', SoftPink: 'accent', GoldenYellow: 'accent', GoldenSunlight: 'accent', Lavender: 'accent',
  DeepWarmInk: 'ink', Glow: 'glow', Water: 'water', ContactShadow: 'shade', Sun: 'keylight',
  Glass: null, SkyTop: null, Haze: null, FogHaze: null, Hill0: null, Hill1: null, Hill2: null, Cloud: null, Smoke: null,
  HemiSky: null, HemiGround: null, AmbientFill: null,
};

// lookPresets.json: which colour paths of a preset have a family (the rest are sky, fog, clouds, hemisphere / ambient light,
// multipliers such as stone.strata, canopy.gradient and coniferTint, or the minAlbedo floor itself: no §B.1 band)
export const PRESET_PATHS = [
  [/^grass\.(warm|mid|cool|lush|dry)$/, 'lawn'],
  [/^stone\.(top|face|dark|under|deep)$/, 'stone'],
  [/^paths\.color$/, 'earth'],
  [/^water\.(shallow|deep)$/, 'water'], [/^water\.foam$/, 'foam'],
  [/^plants\.(ramp|conifer)\.shade$/, ['foliage', 'shade']], [/^plants\.(ramp|conifer)\.(mid|lit)$/, 'foliage'],
  [/^plants\.conifer\.accent$/, 'foliage'], [/^plants\.ramp\.accent$/, 'accent'],
  [/^farm\.(windowColor|porchColor)$/, 'glow'],
  [/^(cel\.shadeTint|shadows\.contact\.color|post\.ink\.(color|violet)|post\.grade\.shadowTint)$/, 'shade'],
  [/^(sun\.color|cel\.rim\.color|post\.grade\.highlightTint)$/, 'keylight'],
];

// painted atlas cells (lib/paintedAtlas.mjs CELLS) -> family; swatch_<Token> takes the token's family. null = mixed (wet pile
// timber with algae, rope, iron, the check blanket, moss creeping over stone): no single band
export const CELL_FAMILY = {
  plank: 'timber', plank_dark: 'timber', plank_light: 'timber', plank_grey: 'timber', tiles: 'roof', tiles_trim: 'roof', bark: 'timber',
  rings_0: 'timber', rings_1: 'timber', rings_2: 'timber', rings_3: 'timber',
  stone: 'stone', stone_dark: 'stone', block_0: 'stone', block_1: 'stone', block_2: 'stone', block_3: 'stone',
  moss: 'lawn', cloth: 'cloth', canvas: 'cloth', paper: 'wall', skin: 'accent', scarf: 'accent', brass: 'accent', soil: 'earth',
  wet: null, rope: null, metal: null, blanket: null, block_moss_0: null, block_moss_1: null,
};
export const familyOfCell = (name) => (name.startsWith('swatch_') ? PALETTE_FAMILY[name.slice(7)] ?? null : CELL_FAMILY[name]);

// ---- the detector -------------------------------------------------------------------------------------------------------------
// checkColour({hex, family, role}) -> [] when inside every band of its family, else one reason per broken rule, each starting with
// the rule's name: 'saturation', 'value' or 'temperature'
export function checkColour({ hex, family, role }) {
  const F = FAMILIES[family]; if (!F) return [`family: unknown family ${family}`];
  const { h, s } = hsv(hex), y = luma(hex), out = [], f2 = (x) => x.toFixed(2), s2 = Math.round(s * 100) / 100;   // bands are written to two decimals
  const sat = role === 'shade' && F.shadeSat ? F.shadeSat : F.sat;
  if (sat && ((sat[0] != null && s2 < sat[0] - 1e-9) || (sat[1] != null && s2 > sat[1] + 1e-9)))
    out.push(`saturation ${f2(s)} outside ${sat[0] ?? 0}-${sat[1] ?? 1} (${family}${role === 'shade' ? ' shade' : ''})`);
  if (F.value === 'albedo' && (y < 0.08 || y > 0.96)) out.push(`value: luma ${f2(y)} outside 0.08-0.96 (${y < 0.08 ? 'black' : 'white'})`);
  if (F.value === 'shade' && y < 0.05) out.push(`value: luma ${f2(y)} < 0.05 (black)`);
  if (family === 'shade' && s < 0.1) out.push(`temperature: grey (saturation ${f2(s)} < 0.10)`);
  else if (F.hue && s >= (F.hueMinSat ?? 0) && !inHue(h, F.hue)) out.push(`temperature: hue ${Math.round(h)}° outside ${F.hue.map(([a, b]) => `${a}-${b}°`).join(' / ')} (${family})`);
  return out;
}

// ---- sources ------------------------------------------------------------------------------------------------------------------
const famRole = (v) => (Array.isArray(v) ? { family: v[0], role: v[1] } : { family: v, role: null });
const HEX = /^#[0-9A-Fa-f]{6}$/;

// look.config.mjs palette -> entries; tokens missing from PALETTE_FAMILY come back with family undefined (unclassified)
export function paletteEntries(palette) {
  return Object.entries(palette).map(([name, hex]) => ({ source: 'look.config palette', name, hex, ...(name in PALETTE_FAMILY ? (PALETTE_FAMILY[name] ? famRole(PALETTE_FAMILY[name]) : { family: null }) : { family: undefined }) }));
}

// lookPresets.json -> entries for every #RRGGBB in every preset (family null when its path has no band); dayCycle is the game's
// skyPalette.ts table copied verbatim (sky and light only) and is counted as unbanded
export function presetEntries(LP) {
  const out = [];
  const walk = (preset, o, pre) => { for (const [k, v] of Object.entries(o)) { const p = pre ? `${pre}.${k}` : k;
    if (typeof v === 'string' && HEX.test(v)) { const hit = PRESET_PATHS.find(([re]) => re.test(p)); out.push({ source: 'lookPresets', name: `${preset}: ${p}`, path: p, preset, hex: v.toUpperCase(), ...(hit ? famRole(hit[1]) : { family: null }) }); }
    else if (v && typeof v === 'object' && !Array.isArray(v)) walk(preset, v, p); } };
  for (const [name, preset] of Object.entries(LP.presets || {})) walk(name, preset, '');
  let day = 0; JSON.stringify(LP.dayCycle || {}).replace(/"#[0-9A-Fa-f]{6}"/g, () => { day++; return ''; });
  return { entries: out, dayCycleColours: day };
}

// the painted atlas, sampled from a published approach-B file: the mean sRGB colour of every cell (2 px inset) -> entries
export async function atlasEntries(glbFile, CELLS) {
  const doc = await new NodeIO().read(glbFile), tex = doc.getRoot().listTextures()[0];
  const img = jpeg.decode(Buffer.from(tex.getImage()), { useTArray: true, formatAsRGBA: true });
  return Object.entries(CELLS).map(([name, c]) => {
    const sum = [0, 0, 0]; let n = 0;
    for (let y = c.y + 2; y < c.y + c.h - 2; y++) for (let x = c.x + 2; x < c.x + c.w - 2; x++) { const i = (y * img.width + x) * 4; sum[0] += img.data[i]; sum[1] += img.data[i + 1]; sum[2] += img.data[i + 2]; n++; }
    const fam = familyOfCell(name);
    return { source: 'painted atlas (sampled)', name, hex: hexOf(sum.map((v) => v / n)), ...(fam ? famRole(fam) : { family: null }) };
  });
}

// a Meshy model's painted surface colour: the area-weighted mean of the albedo texel under every triangle's uv centroid (the
// largest textured material, or the one named `only`, e.g. the farmhouse 'Roof'). Averages sRGB values, like the catalog's cell colours.
export async function surfaceColour(glbFile, only) {
  const R = (await new NodeIO().read(glbFile)).getRoot(), byMat = new Map();
  for (const mesh of R.listMeshes()) for (const p of mesh.listPrimitives()) { const m = p.getMaterial(); if (m && m.getBaseColorTexture() && p.getAttribute('TEXCOORD_0') && (!only || m.getName() === only)) byMat.set(m, [...(byMat.get(m) || []), p]); }
  let best = null, bestA = -1, acc = null;
  for (const [m, prims] of byMat) {
    const img = jpeg.decode(Buffer.from(m.getBaseColorTexture().getImage()), { useTArray: true, formatAsRGBA: true }), sum = [0, 0, 0]; let A = 0;
    for (const p of prims) {
      const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0'), idx = p.getIndices(), n = idx ? idx.getCount() : pos.getCount(), at = (k) => (idx ? idx.getScalar(k) : k);
      const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], U = [[0, 0], [0, 0], [0, 0]];
      for (let t = 0; t + 2 < n; t += 3) {
        for (let j = 0; j < 3; j++) { pos.getElement(at(t + j), P[j]); uv.getElement(at(t + j), U[j]); }
        const a = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], b = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        const area = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2; if (!(area > 0)) continue;
        const fr = (x) => x - Math.floor(x), u = fr((U[0][0] + U[1][0] + U[2][0]) / 3), v = fr((U[0][1] + U[1][1] + U[2][1]) / 3);
        const x = Math.min(img.width - 1, Math.floor(u * img.width)), y = Math.min(img.height - 1, Math.floor(v * img.height)), i = (y * img.width + x) * 4;
        sum[0] += img.data[i] * area; sum[1] += img.data[i + 1] * area; sum[2] += img.data[i + 2] * area; A += area;
      }
    }
    if (A > bestA) { bestA = A; best = m.getName(); acc = sum.map((s) => s / A); }
  }
  return acc ? { material: best, hex: hexOf(acc) } : null;
}

// the approved concepts' frozen ramps (art/reskin/concept-stats.json): foliage stops 10 / 50 / 90 % = shade / mid / lit; the
// flowering bush's pink and cream blossom stops are accents
export function conceptEntries(stats) {
  const out = [];
  for (const [folder, f] of Object.entries(stats.folders || {})) {
    if (f.foliage) f.foliage.stops.forEach((rgb, i) => out.push({ source: 'concept ramps (frozen)', name: `${folder}.foliage[${['shade', 'mid', 'lit'][i]}]`, hex: hexOf(rgb), family: 'foliage', role: ['shade', 'mid', 'lit'][i] }));
    for (const k of ['pink', 'cream']) if (f[k]) f[k].stops.forEach((rgb, i) => out.push({ source: 'concept ramps (frozen)', name: `${folder}.${k}[${i}]`, hex: hexOf(rgb), family: 'accent', role: null }));
  }
  return out;
}

// entries -> the ones outside their band, with reasons (unbanded entries skipped)
export const outOfBand = (entries) => entries.filter((e) => e.family).map((e) => ({ ...e, reasons: checkColour(e) })).filter((e) => e.reasons.length);

// ---- the legacy colours: NAMED exceptions with a reason, not wider bands (owner decision 2026-10-25) ----------------------------
// 15 colours of the pre-port look still break a band: nine look.config.mjs tokens, and three paths in each of the two retired
// presets ("Game (current)" = today's game look, "Proof warm (v4)" = the v4 proof look; the approved Golden afternoon replaces
// both, LOOK-PORT). VISUAL-QA §3a lists them. Each entry is excused from the ONE rule it names (any other rule still applies);
// it goes stale, and fails, the day its colour is retired or fixed; the register can never grow past LEGACY_CEILING.
// Keys: token:<look.config palette token> | preset:<preset name>|<colour path>.
const R_LAWN = 'legacy flat lawn green of the pre-port look (0.46-0.56 against the 0.25-0.45 lawn band); the baked lawn is the Golden-afternoon lawn.* presets plus the LAWN patches (ART-BIBLE §B.2)';
const R_EARTH = 'legacy orange-brown earth (0.48-0.52 against the 0.25-0.45 earth band), retired by the bible: paths are #A89478 (LP paths.color), tilled soil #6E5444';
const R_TERRAIN = 'v4 terrain-only yellow-green (0.48-0.56 against the lawn band), used by the proof\'s flat terrain paint; the baked pieces use the Golden-afternoon lawn';
const R_SHADOW = 'legacy warm contact shadow #372A1C (hue 31°; shade is cool); the Golden afternoon uses #2A3A3C (LP shadows.contact)';
const R_DRY = 'pre-port dry-grass tint #BCC09C (0.19 under the 0.25 lawn floor); the Golden afternoon uses #AAB888';
const R_PATH = 'legacy orange-brown path #C2935E (0.52 against the 0.25-0.45 earth band); the Golden afternoon uses #A89478';
const PRESET_LEGACY = { 'grass.dry': [['saturation'], R_DRY], 'paths.color': [['saturation'], R_PATH], 'shadows.contact.color': [['temperature'], R_SHADOW] };
export const LEGACY = {
  'token:Grass': { rules: ['saturation'], reason: R_LAWN }, 'token:GrassDark': { rules: ['saturation'], reason: R_LAWN },
  'token:Soil': { rules: ['saturation'], reason: R_EARTH }, 'token:DarkSoil': { rules: ['saturation'], reason: R_EARTH }, 'token:Path': { rules: ['saturation'], reason: R_EARTH },
  'token:TerrainGrass': { rules: ['saturation'], reason: R_TERRAIN }, 'token:TerrainMeadow': { rules: ['saturation'], reason: R_TERRAIN }, 'token:TerrainGrassDark': { rules: ['saturation'], reason: R_TERRAIN },
  'token:ContactShadow': { rules: ['temperature'], reason: R_SHADOW },
  ...Object.fromEntries(['Game (current)', 'Proof warm (v4)'].flatMap((p) => Object.entries(PRESET_LEGACY).map(([path, [rules, reason]]) => [`preset:${p}|${path}`, { rules, reason }]))),
};
// the register's ceiling as frozen on 2026-10-25 (the owner's approval): LEGACY may only ever be a subset of this
export const LEGACY_CEILING = [
  'token:Grass', 'token:GrassDark', 'token:Soil', 'token:DarkSoil', 'token:Path', 'token:TerrainGrass', 'token:TerrainMeadow', 'token:TerrainGrassDark', 'token:ContactShadow',
  ...['Game (current)', 'Proof warm (v4)'].flatMap((p) => ['grass.dry', 'paths.color', 'shadows.contact.color'].map((path) => `preset:${p}|${path}`)),
];
export const legacyKey = (e) => (e.source === 'look.config palette' ? `token:${e.name}` : e.source === 'lookPresets' ? `preset:${e.preset}|${e.path}` : null);
const ruleOf = (reason) => reason.match(/^[a-z]+/)[0];   // 'saturation' | 'value' | 'temperature' | 'family'

// entries -> { out: outside a band and not excused, excused: outside a band but named in the legacy register (with its reason),
// stale: register entries for the entries' source that excused nothing (the colour is gone or now in band) }
export function judge(entries, legacy = LEGACY) {
  const used = new Set(), out = [], excused = [];
  for (const e of entries) {
    if (!e.family) continue;
    const reasons = checkColour(e); if (!reasons.length) continue;
    const key = legacyKey(e), L = key && legacy[key], gone = L ? reasons.filter((r) => L.rules.includes(ruleOf(r))) : [], left = reasons.filter((r) => !gone.includes(r));
    if (gone.length) { used.add(key); excused.push({ ...e, reasons: gone, legacy: L.reason }); }
    if (left.length) out.push({ ...e, reasons: left });
  }
  const src = new Set(entries.map((e) => e.source));
  const stale = Object.keys(legacy).filter((k) => ((k.startsWith('token:') && src.has('look.config palette')) || (k.startsWith('preset:') && src.has('lookPresets'))) && !used.has(k));
  return { out, excused, stale };
}

export const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// ---- the Meshy garden crops (the ready stages, owner 2026-10-25) --------------------------------------------------------------
// Each ready-stage albedo is split by hue into the PRODUCE (fruit, roots, heads, berries: the crop's own hue windows, saturation
// >= 0.3) and the PLANT (everything else: leaves, stems, a stake). The lettuce is all leaf (no produce). hue: [[from, to], ...] degrees.
export const CROP_PRODUCE = {
  crop_radish_3: { hue: [[0, 15], [320, 360]] },
  crop_carrot_3: { hue: [[12, 40]] },
  crop_wheat_3: { hue: [[25, 58]] },
  crop_lettuce_3: null,
  crop_tomato_3: { hue: [[0, 18], [340, 360]] },
  crop_pumpkin_3: { hue: [[12, 40]] },
  crop_blueberry_3: { hue: [[190, 260]] },
  crop_cranberry_3: { hue: [[0, 15], [330, 360]] },
};
// area-weighted over the surface (4 texel samples a face: the centroid and the corners pulled a third toward it), the mean colour of
// the produce, of the plant, and of the plant's darker half by luma (its shade). share = the class's part of the surface area.
// -> { produce: {hex, share} | null, plant: {hex, share} | null, plantShade: {hex} | null }
export async function cropColours(glbFile, produce) {
  const R = (await new NodeIO().read(glbFile)).getRoot(), samples = [];
  const inHueW = (h, W) => W.some(([a, b]) => h >= a && h <= b);
  for (const mesh of R.listMeshes()) for (const p of mesh.listPrimitives()) {
    const m = p.getMaterial(); if (!m || !m.getBaseColorTexture() || !p.getAttribute('TEXCOORD_0')) continue;
    const img = jpeg.decode(Buffer.from(m.getBaseColorTexture().getImage()), { useTArray: true, formatAsRGBA: true });
    const pos = p.getAttribute('POSITION'), uv = p.getAttribute('TEXCOORD_0'), idx = p.getIndices(), n = idx ? idx.getCount() : pos.getCount(), at = (k) => (idx ? idx.getScalar(k) : k);
    const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], U = [[0, 0], [0, 0], [0, 0]];
    for (let t = 0; t + 2 < n; t += 3) {
      for (let j = 0; j < 3; j++) { pos.getElement(at(t + j), P[j]); uv.getElement(at(t + j), U[j]); }
      const a = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], b = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
      const area = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2; if (!(area > 0)) continue;
      const cu = (U[0][0] + U[1][0] + U[2][0]) / 3, cv = (U[0][1] + U[1][1] + U[2][1]) / 3;
      for (const [u, v] of [[cu, cv], ...U.map(([x, y]) => [x + (cu - x) / 3, y + (cv - y) / 3])]) {
        const fr = (x) => x - Math.floor(x), x = Math.min(img.width - 1, Math.floor(fr(u) * img.width)), y = Math.min(img.height - 1, Math.floor(fr(v) * img.height)), i = (y * img.width + x) * 4;
        const rgb = [img.data[i], img.data[i + 1], img.data[i + 2]], { h, s } = hsv(hexOf(rgb));
        samples.push({ rgb, w: area / 4, produce: !!produce && s >= 0.3 && inHueW(h, produce.hue), y: 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] });
      }
    }
  }
  const total = samples.reduce((s, x) => s + x.w, 0) || 1;
  const mean = (S) => { const W = S.reduce((s, x) => s + x.w, 0); if (!(W > 0)) return null; const c = [0, 1, 2].map((k) => S.reduce((s, x) => s + x.rgb[k] * x.w, 0) / W); return { hex: hexOf(c), share: W / total }; };
  const plant = samples.filter((x) => !x.produce).sort((p, q) => p.y - q.y);
  let half = 0, acc = 0; const pw = plant.reduce((s, x) => s + x.w, 0); while (half < plant.length && acc < pw / 2) acc += plant[half++].w;
  const sh = mean(plant.slice(0, half));
  return { produce: mean(samples.filter((x) => x.produce)), plant: mean(plant), plantShade: sh ? { hex: sh.hex } : null };
}
