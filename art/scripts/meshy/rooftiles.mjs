// rooftiles.mjs -- a seamless (tiling both ways) texture of hand-painted plain clay roof tiles in the farmhouse concept's style, for
// finish.mjs --roof: staggered rows of chunky tiles (rounded lower corners, a little jitter in width / height / angle), each tile's lower
// edge a lit bevel over a dark thickness face that casts a soft shadow on the row below, the side gaps showing the tile underneath,
// per-tile colour (a few weathered, a few brighter), a soft painterly mottle with brush streaks down each tile and a fine grain, then a
// light blur (--soften passes of [1 2 1], wrapping) so the tiles sit beside Meshy's painted ridge cap and walls instead of looking
// sharper than them. Rows run along the image's x; the tiles' lower edges face +y (the eave = the image bottom); the bottom of the last
// row is the image's bottom edge (finish puts the eave on v = 0 = 1). Every noise layer wraps at the texture size (tests/rooftiles).
//
// node meshy/rooftiles.mjs <out.jpg> [--px 1024] [--rows 8] [--cols 7] [--seed 7] [--soften 2] [--grain 1] [--q 95]
import jpeg from 'jpeg-js';
import fs from 'node:fs';

const a = process.argv.slice(2), OUT = a[0], opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const PX = +opt('px', 1024), SS = 2, S = PX * SS, R = +opt('rows', 8), C = +opt('cols', 7), SEED = +opt('seed', 7), GRAIN = +opt('grain', 1);
if (R % 2) throw new Error('--rows must be even (the half-tile stagger repeats every 2 rows)');
const rh = S / R, cw = S / C;
const hash = (...k) => { let h = (SEED * 374761393) >>> 0; for (const v of k) { h = Math.imul(h ^ (v | 0), 668265263) >>> 0; h = (h ^ (h >>> 13)) >>> 0; } h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0; return (h >>> 0) / 4294967296; };
// value noise on a lattice of cx x cy cells over the texture, wrapping at its edges (seamless); cx != cy stretches it (brush streaks).
// Never scale x or y before calling: a lattice that does not end on a whole cell at the edge leaves a seam
const noise = (x, y, cx, cy, salt) => {
  const fx = (x / S) * cx, fy = (y / S) * cy, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const g = (i, j) => hash(((i % cx) + cx) % cx, ((j % cy) + cy) % cy, salt);
  return (g(x0, y0) * (1 - sx) + g(x0 + 1, y0) * sx) * (1 - sy) + (g(x0, y0 + 1) * (1 - sx) + g(x0 + 1, y0 + 1) * sx) * sy; };
const hsv2rgb = (h, s, v) => { const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; };
const mod = (n, m) => ((n % m) + m) % m;

// one tile = row r (unwrapped), column c (unwrapped); its parameters keyed by (r mod R, c mod C) so the texture wraps
const OV = 0.05 * rh, TH = 0.1 * rh, RC = 0.16 * rh, GAP = 0.016 * cw;   // overhang onto the row below, thickness face, corner radius, side gap
const tileCache = new Map();
function tile(r, c) {
  const k = r * 4096 + c; let t = tileCache.get(k); if (t) return t;
  const rr = mod(r, R), cc = mod(c, C), h = (i) => hash(rr, cc, i);
  const cx = c * cw + (mod(r, 2) ? cw / 2 : 0) + (h(1) - 0.5) * 0.05 * cw, hw = (cw * (0.95 + 0.05 * h(2))) / 2 - GAP;
  const yb = (r + 1) * rh + OV + (h(3) - 0.5) * 0.05 * rh, ang = (h(4) - 0.5) * 0.04;
  let hue = 9 + 5 * h(5), sat = 0.62 + 0.08 * h(6), val = 0.68 + 0.07 * h(7);   // (finish matches the mean: the value here sets the headroom)
  const kind = h(8); if (kind < 0.1) { val *= 0.86; hue -= 2; sat += 0.03; } else if (kind > 0.93) { val = Math.min(0.95, val * 1.05); hue += 2; }
  t = { cx, hw, yb, yt: yb - 2.15 * rh, ang, cos: Math.cos(ang), sin: Math.sin(ang), base: hsv2rgb(hue, sat, val), salt: rr * 64 + cc };
  tileCache.set(k, t); return t;
}
// signed distance (px, < 0 inside) to the tile's top surface (a rect, bottom corners rounded) in the tile's own rotated frame
function local(t, x, y) { const dx = x - t.cx, dy = y - t.yb; return [t.cos * dx + t.sin * dy, -t.sin * dx + t.cos * dy]; }   // (0, 0) = bottom centre
function sdTop(lx, ly, t, ext = 0) {   // ly < 0 is up (toward the ridge); the rect spans ly in [yt - yb, ext]
  const top = t.yt - t.yb, bx = t.hw, qx = Math.abs(lx) - (bx - RC), qy = ly - (ext - RC);
  if (ly < top) return top - ly;   // (above: hidden under the rows above anyway)
  if (qy > 0 && qx > 0) return Math.hypot(qx, qy) - RC;
  return Math.max(Math.abs(lx) - bx, ly - ext); }

// what covers (x, y): the row above's overhang, else this row's tile, else the next row's tile through the side gaps, else the underlay
function shade(x, y) {
  const band = Math.floor(y / rh);
  for (const r of [band - 1, band, band + 1]) {
    const off = mod(r, 2) ? cw / 2 : 0, c0 = Math.floor((x - off) / cw);
    for (const c of [c0, c0 - 1, c0 + 1]) {
      const t = tile(r, c), [lx, ly] = local(t, x, y), wob = (noise(x, y, 40, 40, t.salt + 3) - 0.5) * 0.035 * rh;   // hand-made edges
      const dTop = sdTop(lx, ly, t) + wob, dAll = sdTop(lx * 1.015, ly, t, TH) + wob;
      if (dAll > 0) continue;
      let col;
      if (dTop <= 0) {   // the top surface: a rounded bevel (lit facing the eave and a little from the left), slightly convex across
        const bw = 0.16 * rh, e = Math.max(0, 1 - -dTop / bw), eps = 1.5;
        const gx = sdTop(lx + eps, ly, t) - sdTop(lx - eps, ly, t), gy = sdTop(lx, ly + eps, t) - sdTop(lx, ly - eps, t), gl = Math.hypot(gx, gy) || 1;
        const lit = (gx / gl) * -0.35 + (gy / gl) * 0.94;
        const across = lx / t.hw, convex = 1.04 - 0.1 * across * across - 0.03 * across;   // lighter down the middle, the right side a touch darker
        const fall = 0.86 + 0.18 * Math.min(1, Math.max(0, (ly + rh) / rh));   // the upper part of the exposed tile darker, the lower part catches light
        // mottle (broad, per tile), brush streaks down the tile (narrow across, long down), a fine mottle, and the grain (2-4 px)
        const mott = 1 + (noise(x, y, 18, 18, t.salt) - 0.5) * 0.12 + (noise(x, y, 150, 22, t.salt + 7) - 0.5) * 0.09 * GRAIN + (noise(x, y, 150, 150, 3) - 0.5) * 0.05 + grain(x, y);
        const k = fall * convex * mott * (1 + (lit < 0 ? 0.3 * e * e * lit : 0.1 * e * e * lit)), hl = lit > 0 ? 0.3 * e * e * lit : 0;
        col = t.base.map((v, q) => v * k * (1 - hl) + [0.98, 0.78, 0.62][q] * hl);   // the lit bevel turns pale peach, not a hotter orange
      } else col = t.base.map((v) => v * 0.42 * (0.9 + 0.2 * noise(x, y, 90, 90, t.salt) + grain(x, y)));   // the thickness face under the lower edge
      // the shadow the row above casts on this tile (under its lower edge + thickness face), strongest right under the edge
      let sh = 1; { const c2 = Math.floor((x - (mod(r - 1, 2) ? cw / 2 : 0)) / cw); for (const cc of [c2 - 1, c2, c2 + 1]) {
        const u = tile(r - 1, cc), [ux, uy] = local(u, x, y); if (Math.abs(ux) > u.hw + 0.12 * rh) continue;
        const dist = uy - TH, side = Math.min(1, Math.max(0, (u.hw + 0.12 * rh - Math.abs(ux)) / (0.14 * rh)));
        if (dist > 0) sh = Math.min(sh, 1 - side * 0.58 * Math.max(0, 1 - dist / (0.38 * rh)) ** 1.5); } }
      // the tile under a side gap sits in the shadow of its two neighbours
      if (r !== band - 1 && r === band + 1) sh *= 0.62;
      const out = col.map((v) => v * sh), mx = Math.max(...out);
      return mx > 1 ? out.map((v) => v / mx) : out;   // a highlight past white keeps its hue (a per-channel clip turns it yellow)
    }
  }
  const n = 0.85 + 0.3 * noise(x, y, 40, 40, 9); return [0.2 * n, 0.1 * n, 0.075 * n];   // the dark underlay in the gaps
}
// the grain: two fine noise layers (cells of ~4 and ~2 px at 1024), so a tile reads painted like Meshy's ridge cap, not airbrushed
const G4 = Math.max(1, Math.round(PX / 4)), G2 = Math.max(1, Math.round(PX / 2));   // whole cells: the grain wraps too
function grain(x, y) { return GRAIN * ((noise(x, y, G4, G4, 21) - 0.5) * 0.1 + (noise(x, y, G2, G2, 22) - 0.5) * 0.07); }

const img = new Float32Array(PX * PX * 3);
for (let py = 0; py < PX; py++) for (let px = 0; px < PX; px++) {
  const o = (py * PX + px) * 3;
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { const c = shade(px * SS + sx + 0.5, py * SS + sy + 0.5); for (let k = 0; k < 3; k++) img[o + k] += c[k] / (SS * SS); }
}
// soften: [1 2 1] / 4 across then down, --soften times, wrapping (the texture tiles)
for (let pass = 0; pass < +opt('soften', 2); pass++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
  const src = img.slice();
  for (let py = 0; py < PX; py++) for (let px = 0; px < PX; px++) { const o = (py * PX + px) * 3, a0 = ((mod(py - dy, PX)) * PX + mod(px - dx, PX)) * 3, a1 = ((mod(py + dy, PX)) * PX + mod(px + dx, PX)) * 3;
    for (let k = 0; k < 3; k++) img[o + k] = (src[a0 + k] + 2 * src[o + k] + src[a1 + k]) / 4; } }
const out = new Uint8Array(PX * PX * 4);
for (let i = 0; i < PX * PX; i++) { for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.min(255, Math.max(0, Math.round(img[i * 3 + k] * 255))); out[i * 4 + 3] = 255; }
fs.writeFileSync(OUT, jpeg.encode({ data: out, width: PX, height: PX }, +opt('q', 95)).data);
console.log('wrote', OUT, PX + ' px,', R, 'rows x', C, 'tiles');
