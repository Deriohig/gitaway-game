// rooftiles.mjs makes a texture that tiles: the wrap step is no bigger than an ordinary neighbour step, and rows keep the eave convention.
import jpeg from 'jpeg-js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gen = process.env.ROOFTILES || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'meshy', 'rooftiles.mjs');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rooftiles-')), OUT = path.join(tmp, 't.jpg'), PX = 384, ROWS = 6;
execFileSync('node', [gen, OUT, '--px', String(PX), '--rows', String(ROWS), '--cols', '7', '--q', '100']);
const { width: W, height: H, data: d } = jpeg.decode(fs.readFileSync(OUT), { useTArray: true, formatAsRGBA: true });
const lum = (x, y) => { const o = (y * W + x) * 4; return 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]; };
const median = (a) => [...a].sort((p, q) => p - q)[a.length >> 1];
const RH = H / ROWS, wrapX = [], inX = [], wrapY = [], inY = [];
for (let y = 0; y < H; y++) { wrapX.push(Math.abs(lum(W - 1, y) - lum(0, y))); for (let x = 0; x + 1 < W; x += 7) inX.push(Math.abs(lum(x, y) - lum(x + 1, y))); }
// the top/bottom wrap is a row boundary, so it is compared with the interior row boundaries
for (let x = 0; x < W; x++) { wrapY.push(Math.abs(lum(x, H - 1) - lum(x, 0))); for (let k = 1; k < ROWS; k++) inY.push(Math.abs(lum(x, k * RH - 1) - lum(x, k * RH))); }
ok('T1 the texture is the size asked for', W === PX && H === PX);
for (const [name, wrap, inner] of [['T2 seamless left-right', wrapX, inX], ['T3 seamless top-bottom', wrapY, inY]])
  ok(`${name}: wrap step <= 1.25 x interior step + 0.3`, median(wrap) <= 1.25 * median(inner) + 0.3, `${median(wrap).toFixed(2)} vs ${median(inner).toFixed(2)}`);
// eave convention: each row band is darkest in its top 30% (thickness face + shadow)
const rowMean = Array.from({ length: H }, (_, y) => { let s = 0; for (let x = 0; x < W; x++) s += lum(x, y); return s / W; });
let okRows = 0; for (let r = 0; r < ROWS; r++) { let bi = 0, bv = Infinity; for (let y = Math.floor(r * RH); y < Math.floor((r + 1) * RH); y++) if (rowMean[y] < bv) { bv = rowMean[y]; bi = y - r * RH; } if (bi < RH * 0.3) okRows++; }
ok('T4 every row band is darkest just under its top edge', okRows === ROWS, `${okRows} of ${ROWS} rows`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
