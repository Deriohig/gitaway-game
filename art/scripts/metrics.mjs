// metrics.mjs  --  image metrics for the visual-verification toolkit (NO deps).
// =============================================================================
// Usage:
//   node metrics.mjs <a.png> [b.png ...] [--json out.json]
//   node metrics.mjs --dir <shotsDir> --prefix passA_ [--json out.json]
//
// Per image (pixels decoded with lib/png.mjs, values are sRGB-encoded 0..1):
//   meanSat       mean HSV saturation over ALL pixels
//   terrainSat    mean HSV saturation over ISLAND pixels when the shot has a <shot>_mask.png (v5: ground + riser +
//                 object classes, non-cool -> never sky, clouds or the underside); else over non-cool pixels
//                 (excl. sky/haze/water; concept crops have no mask)
//   stone.wall / stone.riser   mean hue (circular) / sat / value of the coast-wall+underside / riser pixels (mask)
//   pathPx        mean hue / sat / value of path-band pixels on the island
//   meanLum       mean luma  Y = 0.2126R' + 0.7152G' + 0.0722B'  (Rec.709 on sRGB values)
//   lumStd        luma standard deviation (global contrast)
//   darkest       min luma (STYLE P1 floor 0.08);  darkestP01 = 0.1th-percentile luma
//                 (robust to single anti-aliased pixels)
//   bands (share of all pixels, hue in degrees):
//     grass        70 <= h < 110, s >= 0.15, v >= 0.20
//     yellowGreen  45 <= h < 70,  s >= 0.20, v >= 0.25   (sun-lit warm meadow)
//     foliage      110 <= h < 165, s >= 0.12              (deep greens / conifers)
//     path         20 <= h < 45,  0.30 <= s <= 0.75, v >= 0.45   (warm tan/orange dirt)
//     rock         15 <= h < 60,  0.06 <= s < 0.30, 0.30 <= v <= 0.90 (warm low-sat stone)
//     cool         (160 <= h < 260 and s >= 0.06) or (s < 0.08 and v >= 0.75)  (sky/haze/water)
//     other        everything else (roofs, flowers, shadows, ...)
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPNG } from './lib/png.mjs';

export const BANDS = ['grass', 'yellowGreen', 'foliage', 'path', 'rock', 'cool', 'other'];

export function classify(h, s, v) {
  if ((h >= 160 && h < 260 && s >= 0.06) || (s < 0.08 && v >= 0.75)) return 'cool';
  if (h >= 70 && h < 110 && s >= 0.15 && v >= 0.20) return 'grass';
  if (h >= 45 && h < 70 && s >= 0.20 && v >= 0.25) return 'yellowGreen';
  if (h >= 110 && h < 165 && s >= 0.12) return 'foliage';
  if (h >= 20 && h < 45 && s >= 0.30 && s <= 0.75 && v >= 0.45) return 'path';
  if (h >= 15 && h < 60 && s >= 0.06 && s < 0.30 && v >= 0.30 && v <= 0.90) return 'rock';
  return 'other';
}

export function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-9) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}

// v5 MEASUREMENT MASK (arch-scene.js ?masks=1 -> <shot>_mask.png): per-pixel class in pure RGB
//   island = top ground (green) | top stone / risers (yellow) | objects on a piece (blue)
//   wall   = coast wall / underside / seam / cone (red);  background (black) = sky, clouds, backdrop isles
export const MASK_CLASSES = ['ground', 'riser', 'wall', 'object', 'bg'];
export function maskClass(r, g, b) {
  const R = r > 127, G = g > 127, B = b > 127;
  if (G && !R && !B) return 'ground'; if (R && G && !B) return 'riser'; if (R && !G && !B) return 'wall'; if (B && !R && !G) return 'object'; return 'bg';
}
function statAcc() { return { n: 0, sx: 0, sy: 0, s: 0, v: 0 }; }
function statAdd(a, h, s, v) { a.n++; a.sx += Math.cos(h * Math.PI / 180) * s; a.sy += Math.sin(h * Math.PI / 180) * s; a.s += s; a.v += v; }
function statOut(a, N) { if (!a.n) return null; let h = Math.atan2(a.sy, a.sx) * 180 / Math.PI; if (h < 0) h += 360; return { share: a.n / N, hue: h, sat: a.s / a.n, val: a.v / a.n }; }

// mask (optional, same size): when given, terrainSat counts ONLY island pixels (ground + riser + object classes,
// non-cool), never sky / clouds / the underside; `terrainSatColour` keeps the old colour-only definition (non-cool)
export function imageMetrics(img, mask = null) {
  const { width: W, height: H, data } = img, N = W * H;
  if (mask && (mask.width !== W || mask.height !== H)) mask = null;
  let sSum = 0, tsSum = 0, tsN = 0, isSum = 0, isN = 0, ySum = 0, yySum = 0, yMin = 1;
  const hist = new Uint32Array(1001), bands = Object.fromEntries(BANDS.map(b => [b, 0]));
  const st = { wall: statAcc(), riser: statAcc(), path: statAcc(), ground: statAcc() }, mc = Object.fromEntries(MASK_CLASSES.map((k) => [k, 0]));
  for (let i = 0; i < N; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    const [h, s, v] = hsv(r, g, b);
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sSum += s; ySum += y; yySum += y * y; if (y < yMin) yMin = y;
    hist[Math.min(1000, Math.round(y * 1000))]++;
    const c = classify(h, s, v); bands[c]++;
    if (c !== 'cool') { tsSum += s; tsN++; }
    const k = mask ? maskClass(mask.data[i * 4], mask.data[i * 4 + 1], mask.data[i * 4 + 2]) : null;
    if (k) { mc[k]++;
      if ((k === 'ground' || k === 'riser' || k === 'object') && c !== 'cool') { isSum += s; isN++; }
      if (k === 'wall') statAdd(st.wall, h, s, v); else if (k === 'riser') statAdd(st.riser, h, s, v); else if (k === 'ground') statAdd(st.ground, h, s, v); }
    if (c === 'path' && (!k || k === 'object' || k === 'ground')) statAdd(st.path, h, s, v);
  }
  const pct = (p) => { const target = N * p; let acc = 0; for (let k = 0; k <= 1000; k++) { acc += hist[k]; if (acc >= target) return k / 1000; } return 1; };
  const meanLum = ySum / N;
  const out = {
    size: [W, H],
    meanSat: sSum / N,
    terrainSat: mask ? (isN ? isSum / isN : 0) : (tsN ? tsSum / tsN : 0),
    terrainSatColour: tsN ? tsSum / tsN : 0,
    masked: !!mask,
    meanLum,
    lumStd: Math.sqrt(Math.max(0, yySum / N - meanLum * meanLum)),
    darkest: yMin,
    darkestP01: pct(0.001),
    bands: {},
    stone: { wall: statOut(st.wall, N), riser: statOut(st.riser, N) },
    ground: statOut(st.ground, N),
    pathPx: statOut(st.path, N),
    maskShares: mask ? Object.fromEntries(MASK_CLASSES.map((k) => [k, mc[k] / N])) : null,
  };
  for (const b of BANDS) out.bands[b] = bands[b] / N;
  return out;
}

// <shot>.png + its <shot>_mask.png when present (capture.mjs --masks)
export const maskFileOf = (file) => file.replace(/\.png$/, '_mask.png');
export const metricsOf = (file) => { const mf = maskFileOf(file); return imageMetrics(readPNG(file), fs.existsSync(mf) ? readPNG(mf) : null); };

const f3 = (v) => v.toFixed(3);
export function table(rows) {
  // rows: [{ name, m }]
  const head = ['image', 'sat', 'terrSat', 'lum', 'lumSD', 'dark', 'darkP01', ...BANDS];
  const lines = [head.map((h, i) => i ? h.padStart(8) : h.padEnd(34)).join('')];
  for (const { name, m } of rows) {
    lines.push([name.slice(0, 33).padEnd(34), f3(m.meanSat), f3(m.terrainSat), f3(m.meanLum), f3(m.lumStd), f3(m.darkest), f3(m.darkestP01),
      ...BANDS.map(b => (m.bands[b] * 100).toFixed(1) + '%')].map((v, i) => i ? String(v).padStart(8) : v).join(''));
  }
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  let json = null, dir = null, prefix = '';
  const files = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = args[++i];
    else if (args[i] === '--dir') dir = args[++i];
    else if (args[i] === '--prefix') prefix = args[++i];
    else files.push(args[i]);
  }
  if (dir) for (const f of fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith('.png') && !f.endsWith('_mask.png')).sort()) files.push(path.join(dir, f));
  if (!files.length) { console.error('usage: node metrics.mjs <a.png ...> | --dir <d> --prefix <p> [--json out.json]'); process.exit(2); }
  const rows = files.map(f => ({ name: path.basename(f, '.png'), file: f, m: metricsOf(f) }));
  console.log(table(rows));
  if (json) { fs.writeFileSync(json, JSON.stringify(Object.fromEntries(rows.map(r => [r.name, { file: r.file, ...r.m }])), null, 2) + '\n'); console.log('\n  json -> ' + json); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
