// look-sheet.mjs  --  side-by-side contact sheets of the 7 fixed views between ANY two phase folders (NO deps).
// =============================================================================
// Usage:  node look-sheet.mjs <before> <after> [--out <phase>] [--views full,farm] [--max-mb 1.45]
//   e.g.  node look-sheet.mjs baseline_r160 baseline      (the r160 -> r186 upgrade check)
//         node look-sheet.mjs baseline phase1
// Reads art/screenshots/<before>/raw/<view>.png and art/screenshots/<after>/raw/<view>.png (look-capture.mjs) and
// writes into art/screenshots/<out = after>/:
//   sheet_<view>.png   BEFORE | AFTER, labelled, + metrics footer (one per view)
//   sheet_all.png      all views, one row each (BEFORE | AFTER)
//   sheets.md/.json    per view: metrics.mjs image metrics before/after (masked when <view>_mask.png exists) and a
//                      pixel diff (mean |d| per channel, share of pixels changed by > 2 / 8 / 32 levels)
// Sheets are committed, so each is downscaled until it is <= --max-mb (default 1.45 MB; opaque RGB PNG).
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { readPNG, encodePNG, blank, resizeBilinear, blit } from './lib/png.mjs';
import { drawText } from './lib/label.mjs';
import { imageMetrics } from './metrics.mjs';
import { ART_DIR } from './lib/paths.mjs';
import W3 from '../config/world.config.mjs';

const SCREENSHOTS = path.join(ART_DIR, 'screenshots');
const BG = [38, 36, 34, 255], C_BEFORE = [205, 205, 205], C_AFTER = [170, 230, 150], C_TEXT = [225, 220, 205];

export function diffStats(a, b, mask = null) {
  const N = a.width * a.height; let sum = 0, gt2 = 0, gt8 = 0, gt32 = 0; const cls = {};
  for (let i = 0; i < N; i++) {
    const o = i * 4, d0 = Math.abs(a.data[o] - b.data[o]), d1 = Math.abs(a.data[o + 1] - b.data[o + 1]), d2 = Math.abs(a.data[o + 2] - b.data[o + 2]), mx = Math.max(d0, d1, d2);
    sum += d0 + d1 + d2; if (mx > 2) gt2++; if (mx > 8) gt8++; if (mx > 32) gt32++;
    if (mask) { const R = mask.data[o] > 127, Gm = mask.data[o + 1] > 127, B = mask.data[o + 2] > 127;
      const k = Gm && !R && !B ? 'ground' : R && Gm && !B ? 'riser' : R && !Gm && !B ? 'wall' : B && !R && !Gm ? 'object' : 'bg';
      const c = cls[k] || (cls[k] = { n: 0, sum: 0 }); c.n++; c.sum += (d0 + d1 + d2) / 3; }
  }
  const out = { meanAbs: sum / (3 * N), changedGt2: gt2 / N, changedGt8: gt8 / N, changedGt32: gt32 / N, identical: sum === 0 };
  if (mask) out.byClass = Object.fromEntries(Object.entries(cls).map(([k, c]) => [k, { share: c.n / N, meanAbs: c.sum / c.n }]));
  return out;
}

const f3 = (v) => (v == null ? 'n/a' : v.toFixed(3)), pc = (v) => (v == null ? 'n/a' : (v * 100).toFixed(1) + '%');
const short = (m) => (m ? `SAT ${m.terrainSat.toFixed(3)} LUM ${m.meanLum.toFixed(3)} SD ${m.lumStd.toFixed(3)} DARK ${m.darkest.toFixed(3)}` : '');

// write an opaque PNG no larger than maxBytes: build(scale) for scale = 1, 0.92, 0.85, ... until it fits
function fitWrite(file, build, maxBytes) {
  let s = 1, buf = null, img = null;
  for (let k = 0; k < 14; k++) { img = build(s); buf = encodePNG(img, { rgb: true, level: 9 }); if (buf.length <= maxBytes) break; s *= 0.92; }
  fs.writeFileSync(file, buf);
  return { w: img.width, h: img.height, bytes: buf.length };
}

function main() {
  const a = process.argv.slice(2);
  const pos = a.filter((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--')));
  const [before, after] = pos;
  if (!before || !after) { console.error('usage: node look-sheet.mjs <before> <after> [--out <phase>] [--views a,b] [--max-mb 1.45]'); process.exit(2); }
  let out = after, views = Object.keys(W3.archipelago.views), maxMB = 1.45;
  for (let i = 0; i < a.length; i++) { if (a[i] === '--out') out = a[++i]; else if (a[i] === '--views') views = a[++i].split(','); else if (a[i] === '--max-mb') maxMB = +a[++i]; }
  const dirB = path.join(SCREENSHOTS, before, 'raw'), dirA = path.join(SCREENSHOTS, after, 'raw'), outDir = path.join(SCREENSHOTS, out);
  fs.mkdirSync(outDir, { recursive: true });
  const load = (d, f) => { const p = path.join(d, f); return fs.existsSync(p) ? readPNG(p) : null; };
  const metaOf = (d) => { try { return JSON.parse(fs.readFileSync(path.join(d, 'capture.json'), 'utf8')); } catch { return {}; } };
  const mB = metaOf(dirB), mA = metaOf(dirA);
  const tagB = `${before}${mB.three ? ' R' + mB.three : ''}`, tagA = `${after}${mA.three ? ' R' + mA.three : ''}`;
  const rows = [], report = { before, after, threeBefore: mB.three || null, threeAfter: mA.three || null, lookBefore: mB.look || null, lookAfter: mA.look || null, views: {} };
  const maxBytes = Math.round(maxMB * 1024 * 1024);
  for (const v of views) {
    const ib = load(dirB, v + '.png'), ia = load(dirA, v + '.png');
    if (!ib || !ia) { console.log(`  skip ${v} (missing ${!ib ? before : after} capture)`); continue; }
    const kb = load(dirB, v + '_mask.png'), ka = load(dirA, v + '_mask.png');
    const M = { before: imageMetrics(ib, kb), after: imageMetrics(ia, ka), diff: ib.width === ia.width && ib.height === ia.height ? diffStats(ib, ia, ka || kb) : null };
    report.views[v] = M; rows.push({ v, ib, ia, M });
    const PAD = 12, LABEL = 28, FOOT = 46;
    const res = fitWrite(path.join(outDir, `sheet_${v}.png`), (s) => {
      const W = Math.round(800 * s), H = Math.round(W * ib.height / ib.width);
      const sheet = blank(PAD * 3 + W * 2, PAD * 2 + LABEL + H + FOOT, BG);
      [[ib, 'BEFORE ' + tagB, C_BEFORE, M.before], [ia, 'AFTER  ' + tagA, C_AFTER, M.after]].forEach(([img, lab, col, m], k) => {
        const x = PAD + k * (W + PAD), maxCh = Math.floor(W / 12);
        drawText(sheet, x, PAD, `${lab}  ${v}`.slice(0, maxCh), 2, col);
        blit(sheet, resizeBilinear(img, W, H), x, PAD + LABEL);
        drawText(sheet, x, PAD + LABEL + H + 8, short(m).slice(0, maxCh), 2, C_TEXT);
        if (k === 1 && M.diff) drawText(sheet, x, PAD + LABEL + H + 26, `DIFF MEAN ${M.diff.meanAbs.toFixed(2)}  >8: ${pc(M.diff.changedGt8)}  >32: ${pc(M.diff.changedGt32)}`.slice(0, maxCh), 2, C_TEXT);
      });
      return sheet;
    }, maxBytes);
    console.log(`  sheet_${v}.png ${res.w}x${res.h} ${(res.bytes / 1048576).toFixed(2)} MB` + (M.diff ? `  diff mean ${M.diff.meanAbs.toFixed(2)}, >8 ${pc(M.diff.changedGt8)}` : ''));
  }
  if (rows.length) {
    const res = fitWrite(path.join(outDir, 'sheet_all.png'), (s) => {
      const PAD = 10, HEAD = 30, RL = 20, W = Math.round(560 * s), H = Math.round(W * rows[0].ib.height / rows[0].ib.width);
      const sheet = blank(PAD * 3 + W * 2, HEAD + rows.length * (RL + H + PAD) + PAD, BG);
      drawText(sheet, PAD, 9, ('BEFORE ' + tagB).slice(0, Math.floor(W / 12)), 2, C_BEFORE); drawText(sheet, PAD * 2 + W, 9, ('AFTER ' + tagA).slice(0, Math.floor(W / 12)), 2, C_AFTER);
      rows.forEach((r, i) => { const y = HEAD + i * (RL + H + PAD);
        drawText(sheet, PAD, y + 3, r.v + (r.M.diff ? `   DIFF MEAN ${r.M.diff.meanAbs.toFixed(2)}  >8: ${pc(r.M.diff.changedGt8)}` : ''), 2, C_TEXT);
        blit(sheet, resizeBilinear(r.ib, W, H), PAD, y + RL); blit(sheet, resizeBilinear(r.ia, W, H), PAD * 2 + W, y + RL); });
      return sheet;
    }, maxBytes);
    console.log(`  sheet_all.png ${res.w}x${res.h} ${(res.bytes / 1048576).toFixed(2)} MB`);
  }
  // ---- report ----
  const md = [`# ${before} -> ${after}: fixed-view comparison`, '',
    `Generated by \`art/scripts/look-sheet.mjs ${before} ${after}\`. three: ${report.threeBefore || '?'} -> ${report.threeAfter || '?'}; look: ${report.lookBefore || '?'} -> ${report.lookAfter || '?'}.`,
    'Metrics from `metrics.mjs` on sRGB pixels (terrainSat = island pixels when a mask exists). Diff = |after - before| per channel (0-255).', '',
    '| view | terrainSat b / a | meanLum b / a | lumStd b / a | darkest b / a | diff mean | > 2 | > 8 | > 32 | sheet |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const [v, M] of Object.entries(report.views)) {
    const b = M.before, af = M.after, d = M.diff;
    md.push(`| ${v} | ${f3(b.terrainSat)} / ${f3(af.terrainSat)} | ${f3(b.meanLum)} / ${f3(af.meanLum)} | ${f3(b.lumStd)} / ${f3(af.lumStd)} | ${f3(b.darkest)} / ${f3(af.darkest)} | ` +
      (d ? `${d.meanAbs.toFixed(2)} | ${pc(d.changedGt2)} | ${pc(d.changedGt8)} | ${pc(d.changedGt32)}` : 'n/a | | |') + ` | sheet_${v}.png |`);
  }
  const anyClass = Object.values(report.views).some((M) => M.diff && M.diff.byClass);
  if (anyClass) {
    md.push('', '## Diff by mask class (mean |d| per channel)', '', '| view | ground | riser | wall/underside | object | sky/bg |', '|---|---|---|---|---|---|');
    for (const [v, M] of Object.entries(report.views)) { const c = (M.diff && M.diff.byClass) || {}; const cell = (k) => (c[k] ? `${c[k].meanAbs.toFixed(2)} (${pc(c[k].share)})` : 'n/a');
      md.push(`| ${v} | ${cell('ground')} | ${cell('riser')} | ${cell('wall')} | ${cell('object')} | ${cell('bg')} |`); }
  }
  fs.writeFileSync(path.join(outDir, 'sheets.md'), md.join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'sheets.json'), JSON.stringify(report, null, 1) + '\n');
  console.log('  wrote ' + path.join(outDir, 'sheets.md'));
}

main();
