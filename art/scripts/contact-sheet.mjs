// contact-sheet.mjs  --  render-vs-concept contact sheets + metrics.md (NO deps).
// =============================================================================
// Usage:
//   node contact-sheet.mjs --prefix passA [--before parity] [--shots <dir>]
//
// For every camera preset in world.config.mjs it composes ONE PNG:
//   [ <before>_<preset> ]  [ <prefix>_<preset> ]  [ concept crop ]
// bilinear-resized to equal height, labelled with a built-in 5x7 bitmap font,
// written to <shots>/contact_<preset>.png. It then writes <shots>/metrics.md (+
// metrics.json): per preset, concept vs before vs render (+ seed-42 render) with
// render-minus-concept deltas, and the STYLE C4 clumping index read from
// <shots>/placements*.json (dumped by capture.mjs).
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { readPNG, writePNG, blank, resizeBilinear, blit } from './lib/png.mjs';
import { imageMetrics, BANDS } from './metrics.mjs';
import { clumpingFromFile, clumpingByPiece } from './clumping.mjs';
import { SHOTS_DIR, CONCEPT_DIR } from './lib/paths.mjs';
import W3 from '../config/world.config.mjs';

// ---- 5x7 bitmap font (rows as 5-bit masks) ----
const G = {
  A:[14,17,17,31,17,17,17], B:[30,17,17,30,17,17,30], C:[14,17,16,16,16,17,14], D:[30,17,17,17,17,17,30],
  E:[31,16,16,30,16,16,31], F:[31,16,16,30,16,16,16], G:[14,17,16,23,17,17,15], H:[17,17,17,31,17,17,17],
  I:[14,4,4,4,4,4,14], J:[7,2,2,2,2,18,12], K:[17,18,20,24,20,18,17], L:[16,16,16,16,16,16,31],
  M:[17,27,21,21,17,17,17], N:[17,17,25,21,19,17,17], O:[14,17,17,17,17,17,14], P:[30,17,17,30,16,16,16],
  Q:[14,17,17,17,21,18,13], R:[30,17,17,30,20,18,17], S:[15,16,16,14,1,1,30], T:[31,4,4,4,4,4,4],
  U:[17,17,17,17,17,17,14], V:[17,17,17,17,17,10,4], W:[17,17,17,21,21,21,10], X:[17,17,10,4,10,17,17],
  Y:[17,17,17,10,4,4,4], Z:[31,1,2,4,8,16,31],
  0:[14,17,19,21,25,17,14], 1:[4,12,4,4,4,4,14], 2:[14,17,1,2,4,8,31], 3:[31,2,4,2,1,17,14],
  4:[2,6,10,18,31,2,2], 5:[31,16,30,1,1,17,14], 6:[6,8,16,30,17,17,14], 7:[31,1,2,4,8,8,8],
  8:[14,17,17,14,17,17,14], 9:[14,17,17,15,1,2,12],
  '_':[0,0,0,0,0,0,31], '-':[0,0,0,31,0,0,0], '.':[0,0,0,0,0,12,12], ':':[0,12,12,0,12,12,0],
  '/':[1,1,2,4,8,16,16], '%':[24,25,2,4,8,19,3], '+':[0,4,4,31,4,4,0], '(':[2,4,8,8,8,4,2],
  ')':[8,4,2,2,2,4,8], '=':[0,0,31,0,31,0,0], '>':[8,4,2,1,2,4,8], ' ':[0,0,0,0,0,0,0],
};
function text(img, x, y, str, scale = 2, rgb = [245, 240, 225]) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const g = G[ch] || G[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r] & (1 << (4 - c))) {
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const X = cx + c * scale + dx, Y = y + r * scale + dy;
        if (X < 0 || Y < 0 || X >= img.width || Y >= img.height) continue;
        const i = (Y * img.width + X) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
      }
    }
    cx += 6 * scale;
  }
}

const f3 = (v) => (v == null ? 'n/a' : v.toFixed(3));
const pc = (v) => (v == null ? 'n/a' : (v * 100).toFixed(1) + '%');
const short = (m) => m ? [`SAT ${m.terrainSat.toFixed(2)}  LUM ${m.meanLum.toFixed(2)}  SD ${m.lumStd.toFixed(2)}`,
  `GRASS ${(100 * (m.bands.grass + m.bands.yellowGreen)).toFixed(0)}%  PATH ${(100 * m.bands.path).toFixed(1)}%  ROCK ${(100 * m.bands.rock).toFixed(1)}%`] : ['', ''];

// side-by-side comparison of several capture prefixes (e.g. proof vs game light) + the concept crop
function compareSheets(prefixes, shots, CAMS, crops, tag) {
  const H = 420, PAD = 12, LABEL = 26, FOOT = 40, md = [`# Lighting / state comparison: ${prefixes.join(' | ')}`, '',
    '| preset | ' + prefixes.map((p) => `${p} terrainSat / meanLum / lumStd / darkest`).join(' | ') + ' | concept terrainSat / meanLum | sheet |', '|---|' + prefixes.map(() => '---').join('|') + '|---|---|'];
  for (const preset of Object.keys(CAMS)) {
    const imgs = prefixes.map((p) => { const f = path.join(shots, `${p}_${preset}.png`); return fs.existsSync(f) ? { p, img: readPNG(f) } : null; }).filter(Boolean);
    if (!imgs.length) continue;
    const cf = path.join(CONCEPT_DIR, `${preset}.png`), c = fs.existsSync(cf) ? readPNG(cf) : null;
    const panels = imgs.map((q) => ({ img: q.img, label: q.p + '  ' + preset, m: imageMetrics(q.img), col: [170, 230, 150] }));
    if (c) panels.push({ img: c, label: 'concept ' + ((crops[preset] && crops[preset].panel) || preset), m: imageMetrics(c), col: [240, 210, 140] });
    const scaled = panels.map((p) => ({ ...p, s: resizeBilinear(p.img, p.img.width * H / p.img.height, H) }));
    const sheet = blank(PAD + scaled.reduce((s, p) => s + p.s.width + PAD, 0), H + LABEL + FOOT + PAD * 2, [38, 36, 34, 255]);
    let x = PAD;
    for (const p of scaled) { const maxCh = Math.max(8, Math.floor(p.s.width / 12)); text(sheet, x, PAD, p.label.slice(0, maxCh), 2, p.col); blit(sheet, p.s, x, PAD + LABEL);
      const l = short(p.m); text(sheet, x, PAD + LABEL + H + 6, l[0].slice(0, maxCh), 2, [225, 220, 205]); text(sheet, x, PAD + LABEL + H + 24, l[1].slice(0, maxCh), 2, [225, 220, 205]); x += p.s.width + PAD; }
    const out = path.join(shots, `${tag}_${preset}.png`); writePNG(out, sheet); console.log('  wrote ' + out);
    const cm = c ? imageMetrics(c) : null;
    md.push(`| ${preset} | ` + panels.slice(0, imgs.length).map((p) => `${f3(p.m.terrainSat)} / ${f3(p.m.meanLum)} / ${f3(p.m.lumStd)} / ${f3(p.m.darkest)}`).join(' | ') + ` | ${cm ? f3(cm.terrainSat) + ' / ' + f3(cm.meanLum) : 'n/a'} | ${tag}_${preset}.png |`);
  }
  fs.writeFileSync(path.join(shots, `${tag}.md`), md.join('\n') + '\n'); console.log('  wrote ' + path.join(shots, `${tag}.md`));
}

function main() {
  const a = process.argv.slice(2);
  let prefix = 'passA', before = null, shots = SHOTS_DIR, compare = null, tag = 'lighting';
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--prefix') prefix = a[++i]; else if (a[i] === '--before') before = a[++i]; else if (a[i] === '--shots') shots = a[++i];
    else if (a[i] === '--compare') compare = a[++i].split(','); else if (a[i] === '--tag') tag = a[++i];
  }
  // spec v3.1: the archipelago (blueprint island) presets by default; --legacy = the old single island
  const LEGACY = a.includes('--legacy'), CAMS = LEGACY ? W3.cameras : W3.archipelago.cameras;
  const crops = (() => { try { return JSON.parse(fs.readFileSync(path.join(CONCEPT_DIR, 'crops.json'), 'utf8')); } catch { return {}; } })();
  if (compare) return compareSheets(compare, shots, CAMS, crops, tag);
  const altSeed = LEGACY ? (W3.seeds && W3.seeds.alt) : W3.archipelago.seeds.alt;
  const H = 520, PAD = 12, LABEL = 26, FOOT = 40;
  const report = {}, md = [];
  const load = (f) => (fs.existsSync(f) ? readPNG(f) : null);

  for (const preset of Object.keys(CAMS)) {
    const cam = CAMS[preset];
    const rImg = load(path.join(shots, `${prefix}_${preset}.png`));
    if (!rImg) { console.log('  skip ' + preset + ' (no ' + prefix + ' render)'); continue; }
    const r42 = altSeed ? load(path.join(shots, `${prefix}_${preset}_seed${altSeed}.png`)) : null;
    const bImg = before ? load(path.join(shots, `${before}_${preset}.png`)) : null;
    const cImg = load(path.join(CONCEPT_DIR, `${preset}.png`));
    const M = { render: imageMetrics(rImg), render42: r42 ? imageMetrics(r42) : null,
      before: bImg ? imageMetrics(bImg) : null, concept: cImg ? imageMetrics(cImg) : null };
    report[preset] = M;

    // ---- compose ----
    const panels = [];
    if (bImg) panels.push({ img: bImg, label: `${before}  ${preset}`, m: M.before, col: [200, 200, 200] });
    panels.push({ img: rImg, label: `${prefix}  ${preset}  (${cam.mode || 'photo'})`, m: M.render, col: [170, 230, 150] });
    if (cImg) panels.push({ img: cImg, label: `concept  ${(crops[preset] && crops[preset].panel) || preset}`.slice(0, 64), m: M.concept, col: [240, 210, 140] });
    const scaled = panels.map(p => ({ ...p, s: resizeBilinear(p.img, p.img.width * H / p.img.height, H) }));
    const Wt = PAD + scaled.reduce((s, p) => s + p.s.width + PAD, 0);
    const sheet = blank(Wt, H + LABEL + FOOT + PAD * 2, [38, 36, 34, 255]);
    let x = PAD;
    for (const p of scaled) {
      const maxCh = Math.max(8, Math.floor(p.s.width / 12));          // 5x7 glyphs at scale 2 = 12px advance
      text(sheet, x, PAD, p.label.slice(0, maxCh), 2, p.col);
      blit(sheet, p.s, x, PAD + LABEL);
      const lines = short(p.m);
      text(sheet, x, PAD + LABEL + H + 6, lines[0].slice(0, maxCh), 2, [225, 220, 205]);
      text(sheet, x, PAD + LABEL + H + 24, lines[1].slice(0, maxCh), 2, [225, 220, 205]);
      x += p.s.width + PAD;
    }
    const out = path.join(shots, `contact_${preset}.png`);
    writePNG(out, sheet);
    console.log('  wrote ' + out);
  }

  // ---- metrics.md ----
  const rows = [['meanSat', m => m.meanSat, f3], ['terrainSat', m => m.terrainSat, f3], ['meanLum', m => m.meanLum, f3],
    ['lumStd (contrast)', m => m.lumStd, f3], ['darkest', m => m.darkest, f3], ['darkestP01', m => m.darkestP01, f3],
    ...BANDS.map(b => [`band ${b}`, m => m.bands[b], pc])];
  md.push(`# Gitaway proof metrics - ${prefix} vs concept${before ? ' (and ' + before + ' baseline)' : ''}`, '');
  md.push(`Generated ${new Date().toISOString()} by \`art/scripts/contact-sheet.mjs\` (metrics from \`metrics.mjs\`).`,
    'Values are measured on sRGB-encoded pixels. Luma = Rec.709 on sRGB values. Bands are pixel shares by HSV hue/sat/value',
    '(grass 70-110deg, yellowGreen 45-70deg, foliage 110-165deg, path 20-45deg mid-sat, rock warm low-sat, cool = sky/haze/water).',
    'Concept crops are cut from the 3 blueprint sheets (`art/reference/concept/crops.json`); they contain water, labels and painted',
    'detail the proof does not have yet, so band shares are a direction, not an exact target. STYLE P1: darkest >= 0.08.', '');
  md.push('## Summary (render vs concept)', '',
    '| preset | mode | terrainSat render / concept (d%) | meanLum render / concept (d%) | lumStd render / concept | darkest (P1>=0.08) | path share | contact sheet |',
    '|---|---|---|---|---|---|---|---|');
  const dp = (r, c) => (r == null || c == null || !c) ? 'n/a' : ((r - c) / c * 100 >= 0 ? '+' : '') + ((r - c) / c * 100).toFixed(0) + '%';
  for (const [p, M] of Object.entries(report)) {
    const r = M.render, c = M.concept;
    md.push(`| ${p} | ${CAMS[p].mode || 'photo'} | ${f3(r.terrainSat)} / ${c ? f3(c.terrainSat) : 'n/a'} (${c ? dp(r.terrainSat, c.terrainSat) : 'n/a'}) | ` +
      `${f3(r.meanLum)} / ${c ? f3(c.meanLum) : 'n/a'} (${c ? dp(r.meanLum, c.meanLum) : 'n/a'}) | ${f3(r.lumStd)} / ${c ? f3(c.lumStd) : 'n/a'} | ` +
      `${f3(r.darkest)} ${r.darkest >= 0.08 ? 'ok' : 'LOW'} | ${pc(r.bands.path)} | contact_${p}.png |`);
  }
  md.push('');
  for (const [p, M] of Object.entries(report)) {
    md.push(`## ${p}`, '');
    const cols = ['concept', ...(M.before ? [before] : []), prefix, ...(M.render42 ? [`${prefix} seed${altSeed}`] : []), `d ${prefix}-concept`, 'd%', ...(M.before ? [`d ${prefix}-${before}`] : [])];
    md.push('| metric | ' + cols.join(' | ') + ' |', '|---|' + cols.map(() => '---').join('|') + '|');
    for (const [name, get, fmt] of rows) {
      const c = M.concept ? get(M.concept) : null, r = get(M.render), b = M.before ? get(M.before) : null, r42 = M.render42 ? get(M.render42) : null;
      const d = c == null ? null : r - c, dpc = (c == null || !c) ? 'n/a' : ((d / c) * 100 >= 0 ? '+' : '') + ((d / c) * 100).toFixed(0) + '%';
      const cells = [fmt(c), ...(M.before ? [fmt(b)] : []), fmt(r), ...(M.render42 ? [fmt(r42)] : []),
        d == null ? 'n/a' : (d >= 0 ? '+' : '') + (fmt === pc ? (d * 100).toFixed(1) + 'pp' : d.toFixed(3)), dpc,
        ...(M.before ? [(r - b >= 0 ? '+' : '') + (fmt === pc ? ((r - b) * 100).toFixed(1) + 'pp' : (r - b).toFixed(3))] : [])];
      md.push(`| ${name} | ${cells.join(' | ')} |`);
    }
    md.push('');
  }
  // ---- clumping (spec v3.1: per piece, rescaled radius/min) ----
  const bpFiles = LEGACY ? [] : fs.readdirSync(shots).filter(f => f.startsWith(`placements_${prefix}`) && f.endsWith('.json')).sort();
  if (bpFiles.length) {
    const rules = W3.archipelago.composition.clumping;
    md.push('## Clumping index per piece (STYLE C4 rescaled: >= min trees within radius u; target >= 70%)', '',
      '| file | ' + Object.keys(rules).map((id) => `${id} (${rules[id].min}@${rules[id].radius}u)`).join(' | ') + ' | all |', '|---|' + Object.keys(rules).map(() => '---').join('|') + '|---|');
    for (const f of bpFiles) { const r = clumpingByPiece(path.join(shots, f), rules); report['clumping:' + f] = r;
      md.push(`| ${f} | ` + Object.keys(rules).map((id) => { const q = r.pieces[id]; return q.trees ? `${q.clumped}/${q.trees} = ${pc(q.share)}` : 'no trees'; }).join(' | ') + ` | ${r.total.clumped}/${r.total.trees} = ${pc(r.total.share)} |`); }
    md.push('');
  }
  const pfiles = LEGACY ? fs.readdirSync(shots).filter(f => /^placements.*\.json$/.test(f) && !f.startsWith('placements_')).sort() : [];
  if (pfiles.length) {
    md.push('## Clumping index (STYLE C4: >= 70% of trees in a clump of >= 5 within ~6u)', '',
      '| file | seed | trees | clumped | clumpShare | groups (single-link 3u): singles / 2-4 / 5-20 / 21+ / largest |', '|---|---|---|---|---|---|');
    for (const f of pfiles) {
      const r = clumpingFromFile(path.join(shots, f));
      report['clumping:' + f] = r;
      md.push(`| ${f} | ${r.seed} | ${r.trees} | ${r.clumped} | ${pc(r.share)} | ${r.groups.singles} / ${r.groups['2-4']} / ${r.groups['5-20']} / ${r.groups['21+']} / ${r.groups.largest} |`);
    }
    md.push('');
  }
  fs.writeFileSync(path.join(shots, 'metrics.md'), md.join('\n') + '\n');
  fs.writeFileSync(path.join(shots, 'metrics.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('  wrote ' + path.join(shots, 'metrics.md'));
}

main();
