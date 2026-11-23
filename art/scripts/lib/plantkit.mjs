// plantkit.mjs -- the painterly ground-cover kit (art/specs/2026-10-22-flowers-living-ground-design.md): 12 plants built as crossed cards,
// and the pebbles (plan Task 8: four stones on flat cards)
// carrying cut-out textures painted here in code (the roof-tile method: soft gradients, a lit and a shaded side to every blade and
// petal, brush texture, grain), replacing the flat grass_tuft and the flower_head blob.
//   * every card is two-sided by DUPLICATED faces with normals leaning up (a single-sided material: DoubleSide would flip the back
//     face's normal and shade it dark), so a clump lights like the ground it stands on;
//   * glTF alphaMode MASK (cutoff 0.4: a little low, so thin blades survive the game's mipmaps at the default camera distance);
//   * the colour under the cut-out bleeds outward (no dark halos when the mipmaps average edge texels);
//   * deterministic: a plant's seed is its id, so the same code gives the same GLB bytes.
// buildPlant(id) -> GLB bytes; paintPlant(id) -> { w, h, data } (the texture, for review sheets).
import { Document, NodeIO } from '@gltf-transform/core';
import { encodePNG } from './png.mjs';

// ---- seeded randomness and smooth noise ----
const seedOf = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash2 = (x, y, s) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x, y, s) => { const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  return (hash2(x0, y0, s) * (1 - sx) + hash2(x0 + 1, y0, s) * sx) * (1 - sy) + (hash2(x0, y0 + 1, s) * (1 - sx) + hash2(x0 + 1, y0 + 1, s) * sx) * sy; };
const lerp3 = (a, b, t) => [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);
const mul = (c, k) => c.map((v) => Math.min(1, v * k));
const jit = (c, R, amt = 0.06) => { const k = 1 + (R() - 0.5) * 2 * amt, h = (R() - 0.5) * amt; return [Math.min(1, c[0] * k + h * 0.5), Math.min(1, c[1] * k), Math.min(1, c[2] * k - h * 0.5)].map((v) => Math.max(0, v)); };
const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);

// ---- the painter: premultiplied RGBA at SS x SS supersampling; convex polygons composited "over" (texture px, y down) ----
const SS = 3;
class Paint {
  constructor(w, h) { this.w = w; this.h = h; this.W = w * SS; this.H = h * SS; this.px = new Float32Array(this.W * this.H * 4); this.ox = 0; this.oy = 0; }
  at(ox, oy) { this.ox = ox; this.oy = oy; return this; }   // paint into a region of an atlas: every point offset by (ox, oy) px
  poly(pts, col, a = 1) {
    const { W, H, px } = this, P = pts.map(([x, y]) => [(x + this.ox) * SS, (y + this.oy) * SS]);
    let y0 = Infinity, y1 = -Infinity; for (const p of P) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.ceil(y0 - 0.5)); y <= Math.min(H - 1, Math.floor(y1 - 0.5)); y++) {
      const yc = y + 0.5; let xl = Infinity, xr = -Infinity;
      for (let i = 0; i < P.length; i++) { const A = P[i], B = P[(i + 1) % P.length]; if ((A[1] <= yc) === (B[1] <= yc)) continue;
        const x = A[0] + (yc - A[1]) / (B[1] - A[1]) * (B[0] - A[0]); if (x < xl) xl = x; if (x > xr) xr = x; }
      if (!(xr > xl)) continue;
      for (let x = Math.max(0, Math.ceil(xl - 0.5)); x <= Math.min(W - 1, Math.floor(xr - 0.5)); x++) { const o = (y * W + x) * 4, k = 1 - a;
        px[o] = col[0] * a + px[o] * k; px[o + 1] = col[1] * a + px[o + 1] * k; px[o + 2] = col[2] * a + px[o + 2] * k; px[o + 3] = a + px[o + 3] * k; }
    }
  }
  ell(cx, cy, rx, ry, rot, col, a = 1) { const c = Math.cos(rot), s = Math.sin(rot), pts = [];
    for (let i = 0; i < 20; i++) { const t = i / 20 * Math.PI * 2, x = Math.cos(t) * rx, y = Math.sin(t) * ry; pts.push([cx + x * c - y * s, cy + x * s + y * c]); }
    this.poly(pts, col, a); }
  // an ellipse lit from the upper left: a shaded body, then a lit cap offset toward the light
  blob(cx, cy, rx, ry, rot, col, lit = 1.14, dark = 0.84) { this.ell(cx, cy, rx, ry, rot, mul(col, dark)); this.ell(cx - rx * 0.12, cy - ry * 0.14, rx * 0.84, ry * 0.8, rot, col); this.ell(cx - rx * 0.28, cy - ry * 0.3, rx * 0.42, ry * 0.36, rot, mul(col, lit)); }
  // a blade from (x, y) along `ang` (0 = straight up, + leans right) for `len` px, its tip bending sideways by `bend` x len, `w` px
  // wide at the root tapering to the tip; colour root -> tip; the left half lit and the right half shaded (light from the upper left)
  blade(x, y, ang, len, w, bend, cRoot, cTip, o = {}) {
    const n = Math.max(6, Math.round(len / 7)), d = [Math.sin(ang), -Math.cos(ang)], p = [Math.cos(ang), Math.sin(ang)], taper = o.taper ?? 1.3, tipW = o.tipW ?? 0.08;
    const at = (t) => [x + d[0] * len * t + p[0] * bend * len * t * t, y + d[1] * len * t + p[1] * bend * len * t * t];
    const nrm = (t) => { const v = [d[0] * len + p[0] * 2 * bend * len * t, d[1] * len + p[1] * 2 * bend * len * t], l = Math.hypot(...v); return [-v[1] / l, v[0] / l]; };   // toward the blade's right
    const wid = (t) => w * Math.max(tipW, 1 - Math.pow(t, taper)) * (o.belly ? 0.6 + 0.8 * Math.sin(Math.PI * Math.min(1, t * 1.1)) : 1);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, p0 = at(t0), p1 = at(t1), n0 = nrm(t0), n1 = nrm(t1), w0 = wid(t0) / 2, w1 = wid(t1) / 2;
      const c = lerp3(cRoot, cTip, Math.pow((t0 + t1) / 2, o.gamma ?? 0.85));
      this.poly([p0, p1, [p1[0] - n1[0] * w1, p1[1] - n1[1] * w1], [p0[0] - n0[0] * w0, p0[1] - n0[1] * w0]], mul(c, o.lit ?? 1.1));
      this.poly([p0, [p0[0] + n0[0] * w0, p0[1] + n0[1] * w0], [p1[0] + n1[0] * w1, p1[1] + n1[1] * w1], p1], mul(c, o.dark ?? 0.86));
    }
    return at(1);
  }
  // the texture: brush noise + grain on the paint, downsampled, the colour bled outward under the clear texels. `soften` (a gaussian
  // sigma in texels; 0 = off, the default) blurs the colour before the noise and grain go on: every painted edge inside the cut-out goes
  // soft, as in Meshy paint, while the grain stays sharp. The blur is alpha-weighted (premultiplied), so clear texels lend no dark; the
  // alpha itself is kept as painted, since MASK cuts it hard at 0.4 anyway (blurring it would only move the cut line)
  toRGBA(seed, brush = 0.09, grain = 0.04, soften = 0) {
    const { W, w, h, px } = this, n = SS * SS, col = new Float32Array(w * h * 3), alp = new Float32Array(w * h), soft = soften > 0 ? this.softColour(soften) : null;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { const o = ((y * SS + sy) * W + x * SS + sx) * 4; r += px[o]; g += px[o + 1]; b += px[o + 2]; a += px[o + 3]; }
      const i = y * w + x; a /= n; alp[i] = a; if (a <= 0) continue;
      const k = (1 + (vnoise(x / 4, y / 4, seed) - 0.5) * 2 * brush + (vnoise(x / 13, y / 13, seed + 3) - 0.5) * brush) * (1 + (hash2(x, y, seed + 7) - 0.5) * 2 * grain);
      if (soft) { col[i * 3] = soft[i * 3] * k; col[i * 3 + 1] = soft[i * 3 + 1] * k; col[i * 3 + 2] = soft[i * 3 + 2] * k; }
      else { col[i * 3] = r / n / a * k; col[i * 3 + 1] = g / n / a * k; col[i * 3 + 2] = b / n / a * k; }
    }
    const done = new Uint8Array(w * h); let todo = []; for (let i = 0; i < w * h; i++) if (alp[i] >= 0.02) done[i] = 1; else todo.push(i);
    for (let pass = 0; pass < 24 && todo.length; pass++) {   // grow the colour outward, one ring a pass
      const next = [], fill = [];
      for (const i of todo) { const x = i % w, y = (i / w) | 0; let r = 0, g = 0, b = 0, m = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (!done[j]) continue; r += col[j * 3]; g += col[j * 3 + 1]; b += col[j * 3 + 2]; m++; }
        if (m) fill.push([i, r / m, g / m, b / m]); else next.push(i); }
      for (const [i, r, g, b] of fill) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; done[i] = 1; }
      todo = next; }
    if (todo.length) { let r = 0, g = 0, b = 0, m = 0; for (let i = 0; i < w * h; i++) if (alp[i] >= 0.5) { r += col[i * 3]; g += col[i * 3 + 1]; b += col[i * 3 + 2]; m++; }
      for (const i of todo) { col[i * 3] = r / (m || 1); col[i * 3 + 1] = g / (m || 1); col[i * 3 + 2] = b / (m || 1); } }
    const out = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.max(0, Math.min(255, Math.round(col[i * 3 + k] * 255))); out[i * 4 + 3] = Math.round(alp[i] * 255); }
    return { width: w, height: h, data: out };
  }
  // the paint's straight colour per texel after a separable gaussian blur (sigma px) of the premultiplied colour and coverage (clear
  // beyond the edges), for toRGBA's `soften`
  softColour(sigma) {
    const { W, w, h, px } = this, n = SS * SS, R = Math.ceil(sigma * 2.5), kern = Array.from({ length: 2 * R + 1 }, (_, j) => Math.exp(-((j - R) ** 2) / (2 * sigma * sigma)));
    const ks = kern.reduce((s, v) => s + v, 0), pm = new Float32Array(w * h * 4), tmp = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { const o = ((y * SS + sy) * W + x * SS + sx) * 4; for (let c = 0; c < 4; c++) pm[(y * w + x) * 4 + c] += px[o + c] / n; }
    for (const [src, dst, dx, dy] of [[pm, tmp, 1, 0], [tmp, pm, 0, 1]]) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) { let s = 0;
      for (let j = -R; j <= R; j++) { const xx = x + j * dx, yy = y + j * dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) s += src[(yy * w + xx) * 4 + c] * kern[j + R]; }
      dst[(y * w + x) * 4 + c] = s / ks; }
    const out = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { const a = pm[i * 4 + 3]; if (a > 1e-6) for (let c = 0; c < 3; c++) out[i * 3 + c] = pm[i * 4 + c] / a; }
    return out;
  }
}

// ---- colours (sRGB): the lawn's family (lookPresets grass: #609262 / #7AAE72 / #98C47E) and the concepts' flower hues ----
const C = {
  root: hex('#3E6236'), blade: hex('#5F8C45'), tip: hex('#A7BE6A'), tallRoot: hex('#36583A'), tallTip: hex('#93AE60'), straw: hex('#CDBA78'), plume: hex('#E9D69A'),
  clover: hex('#3F6E3A'), cloverLit: hex('#86A866'), cloverHead: hex('#F4EFE6'), cloverPink: hex('#E3B9C6'),
  stem: hex('#4F7A3E'), stemTip: hex('#6E9550'), leaf: hex('#4C7A3C'), leafTip: hex('#7FA45A'),
  daisy: hex('#F8F5EC'), daisyBack: hex('#D9D6CF'), eye: hex('#F2C230'), butter: hex('#F7CC2E'), poppy: hex('#D9452F'), poppyDark: hex('#2C1E1A'), corn: hex('#4F72D6'), cornLit: hex('#7D9BEB'),
  lavLeaf: hex('#5C7558'), lavLeafTip: hex('#94AA86'), lav: hex('#7C66B4'), lavLit: hex('#A994D6'), fox: hex('#C9729F'), foxLit: hex('#E6A8C6'), foxLeaf: hex('#40683A'),
  fern: hex('#3A6A34'), fernTip: hex('#7DA251'),
  // the pebbles (ART-BIBLE B.2 tokens): stone.prop #C3B49A, stone.propDark #9C8C74, and moss in lawn.deep #56844F
  stone: hex('#C3B49A'), stoneDark: hex('#9C8C74'), moss: hex('#56844F'),
  // the card shrubs: leaf greens from the Meshy leafy bush (dark teal shade -> yellow-green light), bracken with russet tips, heather
  // foliage and bloom (near the game's mauve heather tints)
  shrubDeep: hex('#2B4A35'), shrub: hex('#4C7A3C'), shrubLit: hex('#86A949'), shrubTop: hex('#B0C25E'),
  bracken: hex('#55803A'), brackenLit: hex('#97B052'), russet: hex('#B4683A'), russetDark: hex('#86492D'),
  heath: hex('#3A573C'), heathTip: hex('#7E9562'), bloom: hex('#A06A9E'), bloomLit: hex('#C28EBC'),
};

// ---- the 12 plants: a texture (w x h, painted by `paint`) and the cards that carry it (uv = [u0, v0, u1, v1], v0 = the top) ----
const crossed = (n, w, h, uvs, R, phase = 0) => Array.from({ length: n }, (_, i) => ({ rot: phase + i * Math.PI / n + (R() - 0.5) * 0.25, w, h, uv: uvs[i % uvs.length] }));
const halves = [[0, 0, 0.5, 1], [0.5, 0, 1, 1]], whole = [[0, 0, 1, 1]];
// a pebble seen from above in the 64 px cell whose centre is (cx, cy): a slightly lumpy oval (rx x ry px, turned by rot) in four layers,
// the contact shade first (the whole outline, dark: where the stone meets the ground; ruling GR26, plan Task 9: darker (0.68 -> 0.42 x
// stone.propDark) and wider, a heavier edge to the lower right), then the stone from the lit upper left (a shaded body inset from the
// shade, a lit side, a pale cap), flecks of grain, and moss (lawn.deep) on the upper right of those that wear it
function pebble(p, R, cx, cy, rx, ry, rot, col, moss) {
  const c = Math.cos(rot), s = Math.sin(rot), N = 18, lump = Array.from({ length: N }, () => 0.95 + R() * 0.1);
  const oval = (sx, sy, ox, oy) => lump.map((l, i) => { const t = i / N * Math.PI * 2, x = Math.cos(t) * rx * sx * l, y = Math.sin(t) * ry * sy * l; return [cx + ox + x * c - y * s, cy + oy + x * s + y * c]; });
  p.poly(oval(1, 1, 0, 0), mul(C.stoneDark, 0.42));
  p.poly(oval((rx - 4.2) / rx, (ry - 4.2) / ry, -1.2, -2), mul(col, 0.8));
  p.poly(oval((rx - 6) / rx, (ry - 6) / ry, -2.2, -3.2), col);
  p.poly(oval(0.5, 0.45, -5.5, -6), mul(col, 1.15));
  for (let i = 0; i < 12; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * 0.68, x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d - 1;
    p.ell(x, y, 1 + R() * 1.6, 0.8 + R() * 1.1, R() * 3.1, mul(col, R() < 0.5 ? 0.78 : 1.12), 0.55); }
  if (moss) for (let i = 0; i < moss; i++) { const a = -0.9 + (R() - 0.5) * 1.5, d = 0.34 + R() * 0.22, x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d, k = 3.4 + R() * 2.4;
    p.blob(x, y, k * 1.15, k * 0.9, R() * 3.1, jit(C.moss, R, 0.08), 1.2, 0.78); }
}
const PEBBLE_CELLS = [[0, 0], [1, 0], [0, 1], [1, 1]];   // the 2 x 2 cells of the 128 px texture, one pebble each

function grassTuft(p, R, x0, W, H, o) {   // a fan of blades from a root at the bottom centre of a W x H region
  const cx = x0 + W / 2, n = o.n[0] + Math.floor(R() * (o.n[1] - o.n[0] + 1));
  for (let i = 0; i < n; i++) { const ang = (R() - 0.5) * o.spread, len = H * (o.len[0] + R() * (o.len[1] - o.len[0]));
    const tip = o.strawTips && R() < o.strawTips ? C.straw : o.tip;
    p.blade(cx + (R() - 0.5) * W * 0.18, H - 2, ang, len, o.w[0] + R() * (o.w[1] - o.w[0]), (R() - 0.5) * o.bend + Math.sign(ang) * o.bend * 0.4, jit(o.root, R), jit(tip, R)); }
}
function flowerHead(p, kind, x, y, r, R) {   // a head at (x, y), radius r px, seen from the game's raised three-quarter view
  if (kind === 'daisy') {
    const n = 12, sq = 0.5 + R() * 0.15;
    for (const back of [true, false]) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + R() * 0.2, sn = Math.sin(a); if ((sn < 0) !== back) continue;
      p.ell(x + Math.cos(a) * r * 0.55, y + sn * r * 0.55 * sq, r * 0.5, r * 0.16, Math.atan2(sn * sq, Math.cos(a)), jit(back ? C.daisyBack : C.daisy, R, 0.04)); }
    p.blob(x, y - r * 0.04, r * 0.32, r * 0.24, 0, C.eye);
  } else if (kind === 'buttercup') {
    for (const [dx, dy, s] of [[-0.45, -0.1, 0.8], [0.45, -0.1, 0.8], [0, -0.25, 0.85], [-0.25, 0.15, 0.9], [0.25, 0.15, 0.9]]) p.blob(x + dx * r, y + dy * r, r * 0.42 * s, r * 0.5 * s, dx * 0.6, jit(C.butter, R, 0.04), 1.22, 0.8);
    p.ell(x - r * 0.15, y - r * 0.05, r * 0.12, r * 0.1, 0, [1, 0.97, 0.8]);
  } else if (kind === 'poppy') {
    for (const [dx, dy, s, k] of [[-0.4, -0.2, 0.95, 0.78], [0.4, -0.2, 0.95, 0.78], [-0.3, 0.12, 1, 1], [0.3, 0.12, 1, 1]]) p.blob(x + dx * r, y + dy * r, r * 0.55 * s, r * 0.5 * s, dx, mul(jit(C.poppy, R, 0.05), k), 1.15, 0.78);
    p.ell(x, y - r * 0.05, r * 0.22, r * 0.16, 0, C.poppyDark);
  } else {   // cornflower: ragged florets fanning out
    for (let i = 0; i < 11; i++) { const a = -1.3 + i / 10 * 2.6 + (R() - 0.5) * 0.2; p.blade(x, y + r * 0.25, a, r * (0.8 + R() * 0.3), r * 0.38, 0, jit(C.corn, R), jit(C.cornLit, R), { taper: 0.6, tipW: 0.4 }); }
    p.blob(x, y, r * 0.3, r * 0.22, 0, mul(C.corn, 0.7));
  }
}
function wildflower(p, R, kind, W, H, stemLen, headR) {   // a leafy base (so a drift reads as plants, not sticks), 5-7 stems, a head on each
  for (let i = 0; i < 11; i++) p.blade(W / 2 + (R() - 0.5) * W * 0.42, H - 1, (R() - 0.5) * 2.4, H * (0.18 + R() * 0.17), 7 + R() * 4, (R() - 0.5) * 0.7, jit(C.leaf, R), jit(C.leafTip, R), { belly: true });
  const heads = [];
  const n = 5 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) { const ang = (i - (n - 1) / 2) * 0.22 + (R() - 0.5) * 0.15, len = H * (stemLen[0] + R() * (stemLen[1] - stemLen[0]));
    const maxA = Math.asin(Math.max(0, Math.min(1, (W / 2 - headR * 1.5 - 4 - 0.06 * len) / len))), a = Math.max(-maxA, Math.min(maxA, ang));   // every head inside the frame
    heads.push(p.blade(W / 2 + (R() - 0.5) * 8, H - 1, a, len, kind === 'poppy' ? 3.2 : 2.6, (R() - 0.5) * 0.12, jit(C.stem, R), jit(C.stemTip, R), { taper: 0.3, tipW: 0.6 })); }
  heads.sort((a, b) => a[1] - b[1]).forEach(([x, y]) => flowerHead(p, kind, x, y, headR * (0.85 + R() * 0.3), R));
}

export const KIT = {
  grass_short: { group: 'grass', tex: [256, 128], paint: (p, R) => halves.forEach((_, v) => grassTuft(p, R, v * 128, 128, 128, { n: [12, 15], spread: 1.5, len: [0.45, 0.9], w: [7, 10], bend: 0.45, root: C.root, tip: C.tip })),
    cards: (R) => crossed(3, 0.2, 0.15, halves, R) },
  grass_tall: { group: 'grass', tex: [256, 256], paint: (p, R) => halves.forEach((_, v) => grassTuft(p, R, v * 128, 128, 256, { n: [10, 13], spread: 1.1, len: [0.55, 0.96], w: [8, 11], bend: 0.6, root: C.tallRoot, tip: C.tallTip, strawTips: 0.25 })),
    cards: (R) => crossed(3, 0.26, 0.42, halves, R) },
  grass_seedhead: { group: 'grass', tex: [256, 256], paint: (p, R) => halves.forEach((_, v) => {
      grassTuft(p, R, v * 128, 128, 256, { n: [6, 8], spread: 1.3, len: [0.3, 0.6], w: [7, 9], bend: 0.5, root: C.tallRoot, tip: C.tallTip, strawTips: 0.4 });
      for (let s = 0; s < 4; s++) { const ang = (s - 1.5) * 0.16 + (R() - 0.5) * 0.12, len = 256 * (0.78 + R() * 0.18), cx = v * 128 + 64 + (R() - 0.5) * 10;
        const tip = p.blade(cx, 254, ang, len, 3, (R() - 0.5) * 0.2, jit(C.straw, R), jit(C.plume, R), { taper: 0.2, tipW: 0.5 });
        for (let k = 0; k < 9; k++) { const side = k % 2 ? 1 : -1, yy = tip[1] + k * 7 + 3, xx = tip[0] - Math.sin(ang) * k * 7;
          p.blob(xx + side * 4, yy, 2.6, 6.5, side * 0.5 + ang, jit(C.plume, R, 0.05), 1.12, 0.82); } } }),
    cards: (R) => crossed(3, 0.26, 0.55, halves, R) },
  clover_patch: { group: 'grass', tex: [256, 128], paint: (p, R) => {
      for (let i = 0; i < 12; i++) { const x = 18 + R() * 92, y = 18 + R() * 92, s = 0.8 + R() * 0.45, a0 = R() * 6.3, c = jit(C.clover, R);   // top-down trefoils
        for (let k = 0; k < 3; k++) { const a = a0 + k * 2.094; p.blob(x + Math.cos(a) * 8 * s, y + Math.sin(a) * 8 * s, 8 * s, 6.5 * s, a, c, 1.12, 0.82); p.ell(x + Math.cos(a) * 7 * s, y + Math.sin(a) * 7 * s, 3.4 * s, 1.4 * s, a + 1.57, C.cloverLit, 0.8); } }
      for (let i = 0; i < 4; i++) { const x = 25 + R() * 78, y = 25 + R() * 78; p.blob(x, y, 7, 7, 0, C.cloverPink, 1.05, 0.9); p.blob(x - 1, y - 1.5, 6, 5.5, 0, C.cloverHead, 1.05, 0.9); }
      for (let i = 0; i < 3; i++) { const tip = p.blade(192 + (i - 1) * 22 + (R() - 0.5) * 8, 127, (i - 1) * 0.3, 55 + R() * 30, 3, (R() - 0.5) * 0.3, C.stem, C.stemTip, { taper: 0.3, tipW: 0.6 });   // side view: heads on stems
        p.blob(tip[0], tip[1], 8, 7, 0, C.cloverPink, 1.05, 0.88); p.blob(tip[0] - 0.5, tip[1] - 2, 7, 6, 0, C.cloverHead, 1.05, 0.88); }
      for (let i = 0; i < 4; i++) p.blob(160 + R() * 64, 108 + R() * 14, 9, 4, (R() - 0.5) * 0.4, jit(C.clover, R), 1.12, 0.82);
    },
    cards: (R) => [{ flat: true, w: 0.34, d: 0.34, y: 0.012, rot: R() * 6.28, uv: [0, 0, 0.5, 1] }, ...crossed(2, 0.14, 0.09, [[0.5, 0, 1, 1]], R)] },
  flower_daisy: { group: 'wildflower', tex: [128, 128], paint: (p, R) => wildflower(p, R, 'daisy', 128, 128, [0.5, 0.8], 12), cards: (R) => crossed(2, 0.17, 0.22, whole, R) },
  flower_buttercup: { group: 'wildflower', tex: [128, 128], paint: (p, R) => wildflower(p, R, 'buttercup', 128, 128, [0.45, 0.76], 11), cards: (R) => crossed(2, 0.16, 0.2, whole, R) },
  flower_poppy: { group: 'wildflower', tex: [128, 128], paint: (p, R) => wildflower(p, R, 'poppy', 128, 128, [0.55, 0.82], 13), cards: (R) => crossed(2, 0.2, 0.3, whole, R) },
  flower_cornflower: { group: 'wildflower', tex: [128, 128], paint: (p, R) => wildflower(p, R, 'cornflower', 128, 128, [0.5, 0.8], 11), cards: (R) => crossed(2, 0.18, 0.27, whole, R) },
  perennial_lavender: { group: 'perennial', tex: [256, 256], paint: (p, R) => {
      for (let i = 0; i < 90; i++) p.blade(60 + R() * 136, 254, (R() - 0.5) * 2.5, 26 + R() * 36, 6.5, (R() - 0.5) * 0.4, jit(C.lavLeaf, R), jit(C.lavLeafTip, R));
      const spikes = [];
      for (let i = 0; i < 26; i++) { const ang = (R() - 0.5) * 1.1, len = 120 + R() * 110; spikes.push(p.blade(96 + R() * 64, 250, ang, len, 2.6, (R() - 0.5) * 0.25, jit(C.lavLeaf, R), jit(C.lavLeafTip, R), { taper: 0.3, tipW: 0.6 }).concat(ang)); }
      for (const [x, y, ang] of spikes) for (let k = 0; k < 10; k++) { const yy = y + k * 4.2, xx = x - Math.sin(ang) * k * 4.2; p.blob(xx + (k % 2 ? 1.6 : -1.6), yy, 3.6 - k * 0.12, 3.1, 0, lerp3(C.lavLit, C.lav, k / 10), 1.12, 0.8); } },
    cards: (R) => crossed(4, 0.42, 0.38, whole, R) },
  perennial_foxglove: { group: 'perennial', tex: [128, 256], paint: (p, R) => {
      for (let i = 0; i < 11; i++) p.blade(64 + (R() - 0.5) * 36, 254, (R() - 0.5) * 2.7, 50 + R() * 24, 18 + R() * 6, (R() - 0.5) * 0.5, jit(C.foxLeaf, R), jit(C.leafTip, R), { belly: true });
      for (let s = 0; s < 3; s++) { const ang = (s - 1) * 0.16 + (R() - 0.5) * 0.08, len = 180 + R() * 60, tip = p.blade(64 + (s - 1) * 12, 252, ang, len, 3.6, (R() - 0.5) * 0.15, C.stem, C.stemTip, { taper: 0.25, tipW: 0.5 });
        for (let k = 11; k >= 0; k--) { const yy = tip[1] + 10 + k * 9, xx = tip[0] - Math.sin(ang) * (10 + k * 9) + (k % 2 ? 5 : -5), c = lerp3(C.foxLit, C.fox, Math.min(1, k / 7));
          if (k < 3) p.blob(xx, yy, 3.5, 4.5, 0, lerp3(C.stemTip, C.fox, k / 3), 1.1, 0.85); else { p.blob(xx, yy, 6, 8.5, (k % 2 ? 0.25 : -0.25), c, 1.15, 0.8); p.ell(xx + (k % 2 ? 1 : -1), yy + 5, 3, 2.2, 0, mul(c, 0.55)); } } } },
    cards: (R) => crossed(3, 0.28, 0.72, whole, R) },
  perennial_oxeye: { group: 'perennial', tex: [256, 256], paint: (p, R) => {
      for (let i = 0; i < 22; i++) p.blade(80 + R() * 96, 254, (R() - 0.5) * 2.5, 40 + R() * 36, 9, (R() - 0.5) * 0.5, jit(C.leaf, R), jit(C.leafTip, R), { belly: true });
      const heads = []; for (let i = 0; i < 13; i++) heads.push(p.blade(108 + R() * 40, 252, (R() - 0.5) * 1.3, 130 + R() * 100, 2.8, (R() - 0.5) * 0.3, jit(C.stem, R), jit(C.stemTip, R), { taper: 0.3, tipW: 0.6 }));
      heads.sort((a, b) => a[1] - b[1]).forEach(([x, y]) => flowerHead(p, 'daisy', x, y, 12 + R() * 4, R)); },
    cards: (R) => crossed(3, 0.38, 0.45, whole, R) },
  fern_clump: { group: 'perennial', tex: [128, 256], paint: (p, R) => {   // one frond, base at the bottom: a rachis with tapering leaflets
      const len = 244, ang = 0.04, bend = 0.08, at = (t) => [64 + Math.sin(ang) * len * t + bend * len * t * t, 254 - Math.cos(ang) * len * t];
      for (let k = 2; k < 26; k++) { const t = k / 26, [x, y] = at(t), size = Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - t * 0.45), c0 = lerp3(C.fern, C.fernTip, t);
        for (const side of [-1, 1]) p.blade(x, y, side * (1.05 - t * 0.35), 46 * size + 6, 9 * size + 2.5, side * 0.25, jit(c0, R, 0.05), jit(lerp3(c0, C.fernTip, 0.5), R, 0.05), { belly: true }); }
      p.blade(64, 254, ang, len, 3.2, bend, mul(C.fern, 0.8), C.fernTip, { taper: 0.4, tipW: 0.4 }); },
    cards: (R) => Array.from({ length: 9 }, (_, i) => ({ rot: i / 9 * Math.PI * 2 + (R() - 0.5) * 0.35, w: 0.15, h: 0.42, tilt: 0.42 + R() * 0.3, uv: [0, 0, 1, 1] })) },
  // the pebbles (ground-vegetation plan Task 8, the owner's "shade, clover and pebbles" under the trees): four stones, each painted
  // top-down in its own 64 px cell (the contact shade in the paint, two of them mossy) on a small flat card 0.097 u square, the four laid
  // out in a 0.13 u circle at four heights (y 0-0.018: the lowest on the ground, the others stack a little; the composition lifts the model
  // 0.006 u, `yOffset`, where the plants sink 0.01), so the group reads as stones standing in the grass from the game's raised view and
  // never stands over 0.045 u. Group 'stone' (composition category rocks: they stand still in the wind)
  pebbles: { group: 'stone', yOffset: 0.006, grain: 0.05, tex: [128, 128], paint: (p, R) => PEBBLE_CELLS.forEach(([c, r], i) => {
      p.at(c * 64, r * 64); pebble(p, R, 32 + (R() - 0.5) * 3, 32 + (R() - 0.5) * 3, 24.5 + R() * 4, 19 + R() * 4, R() * 3.14, lerp3(mul(C.stoneDark, 0.8), C.stone, [0.8, 0.25, 0.6, 0][i]), i === 0 || i === 3 ? 3 : 0); p.at(0, 0); }),   // (GR26: bigger stones in the cell, from stone.propDark x 0.8 to stone.prop: the four differ in tone)
    cards: (R) => { const ys = [0, 0.006, 0.012, 0.018]; for (let i = 3; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [ys[i], ys[j]] = [ys[j], ys[i]]; }   // (a seeded shuffle)
      return PEBBLE_CELLS.map(([c, r], i) => ({ flat: true, x: (c ? 1 : -1) * (0.036 + R() * 0.008), z: (r ? 1 : -1) * (0.036 + R() * 0.008), y: ys[i], w: 0.097, d: 0.097, rot: R() * 6.28, uv: [c * 0.5, r * 0.5, (c + 1) * 0.5, (r + 1) * 0.5] })); } },
};

// ---- the flower crops (art/ASSETS.md section 3: the whole contents of one 0.94 x 0.94 plot, y = 0 at the soil; crop_<id>_1 sprout,
//      _2 growing, _3 ready), painted like the kit. The owner's "match them" (2026-10-25, with the garden batch): the ripe stage fills
//      the plot (three plants inside the soil's inner edge, under 1.2 u), stage 1 is a seedling cluster (`cluster`, below), stage 2 the
//      three plants half-grown. The three stand side by side for the default camera (azimuth 45 deg): two in front, one behind between
//      them (the old two stood almost in line with that camera, so their stalks and heads merged on screen) ----
const CAM_U = [Math.SQRT1_2, -Math.SQRT1_2], CAM_V = [Math.SQRT1_2, Math.SQRT1_2];   // across the default view, and toward its camera
const onView = (u, v) => [u * CAM_U[0] + v * CAM_V[0], u * CAM_U[1] + v * CAM_V[1]];
const TRIO = [onView(-0.2, 0.1), onView(0.2, 0.1), onView(0, -0.15)], TRIO_K = [0.94, 0.9, 1];   // front left, front right, back (the tallest)
// a lavender bush in a W x H region whose bottom centre is (cx, H): grey-green leaves, then spikes (none / pale buds / purple)
function lavenderBush(p, R, cx, W, H, o) {
  for (let i = 0; i < o.leaves; i++) p.blade(cx + (R() - 0.5) * W * 0.62, H - 1, (R() - 0.5) * 2.5, H * (0.12 + R() * 0.16) * o.leafLen, W * 0.026, (R() - 0.5) * 0.4, jit(C.lavLeaf, R), jit(C.lavLeafTip, R));
  const spikes = [];
  for (let i = 0; i < o.spikes; i++) { const ang = (R() - 0.5) * 1.1, len = H * (0.5 + R() * 0.4); spikes.push(p.blade(cx + (R() - 0.5) * W * 0.28, H - 2, ang, len, W * 0.011 + 1, (R() - 0.5) * 0.25, jit(C.lavLeaf, R), jit(C.lavLeafTip, R), { taper: 0.3, tipW: 0.6 }).concat(ang)); }
  if (o.bloom) for (const [x, y, ang] of spikes) for (let k = 0; k < 10; k++) { const st = H * 0.016, yy = y + k * st, xx = x - Math.sin(ang) * k * st, c = o.bloom === 'bud' ? lerp3(C.lavLeafTip, C.lavLit, 0.35) : lerp3(C.lavLit, C.lav, k / 10);
    p.blob(xx + (k % 2 ? 1 : -1) * st * 0.38, yy, st * (0.86 - k * 0.03), st * 0.74, 0, c, 1.12, 0.8); }
}
// a sunflower in a W x H region (bottom centre (cx, H)): stage 1 a seedling, 2 a leafy stem with a green bud, 3 the leafy stem up to the
// head's neck (the head is its own card: sunHead). The stem fills the card's height, so no clear card rises above the plant
function sunflower(p, R, cx, W, H, stage) {
  const stem = C.stem, leaf = hex('#4E7A3A'), leafTip = hex('#7FA55A');
  if (stage === 1) {   // two round seed leaves and a first pair of true leaves on a short stem
    const top = p.blade(cx, H - 1, 0, H * 0.45, W * 0.07, 0, stem, C.stemTip, { taper: 0.3, tipW: 0.6 });
    for (const s of [-1, 1]) { p.blob(top[0] + s * W * 0.17, top[1] + H * 0.05, W * 0.15, H * 0.08, s * 0.35, jit(hex('#8DB45E'), R), 1.12, 0.84);
      p.blade(top[0], top[1], s * 0.75, H * 0.35, W * 0.16, -s * 0.1, jit(leaf, R), jit(leafTip, R), { belly: true }); }
    return;
  }
  const len = H * (stage === 2 ? 0.86 : 0.96), top = p.blade(cx, H - 1, (R() - 0.5) * 0.03, len, W * (stage === 2 ? 0.065 : 0.06), (R() - 0.5) * 0.03, stem, C.stemTip, { taper: 0.25, tipW: 0.7 });
  const nL = stage === 2 ? 5 : 7;
  for (let k = 0; k < nL; k++) { const t = 0.12 + 0.72 * k / nL, y = H - 1 - len * t, s = k % 2 ? 1 : -1, size = (1 - t * 0.55) * (stage === 2 ? 1 : 0.9);   // broad leaves, alternating
    p.blade(cx + s * W * 0.02, y, s * (1.15 - t * 0.3), W * 0.36 * size, W * 0.2 * size, -s * 0.18, jit(leaf, R), jit(leafTip, R), { belly: true, taper: 1.6 }); }
  if (stage === 2) { p.blob(top[0], top[1] + 4, W * 0.08, W * 0.08, 0, hex('#6E9A48'), 1.1, 0.85); for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.45; p.blade(top[0], top[1] + 4, a + Math.PI / 2, W * 0.09, W * 0.04, 0, hex('#5E8A3E'), hex('#86AE5C'), { taper: 1 }); } }
}
// a sunflower head for its own card, centred (hx, hy), radius r px: face-on, a double ring of gold petals round the brown seed disc; `back`:
// the green back of the head (a ring of sepals, the petal tips round the rim), for the card just behind it
function sunHead(p, R, hx, hy, r, back) {
  const gold = hex('#F2B53A'), goldTip = hex('#F8D46A'), disc = hex('#6A4225'), green = hex('#6E9A48'), out = (a) => Math.atan2(Math.cos(a), -Math.sin(a));
  if (back) {
    for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2; p.blade(hx + Math.cos(a) * r * 0.5, hy + Math.sin(a) * r * 0.5, out(a), r * 0.55, r * 0.22, 0, jit(mul(gold, 0.8), R, 0.04), jit(goldTip, R, 0.04), { belly: true, taper: 1.2 }); }
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2 + 0.11; p.blade(hx + Math.cos(a) * r * 0.3, hy + Math.sin(a) * r * 0.3, out(a), r * 0.42, r * 0.2, 0, jit(mul(green, 0.85), R), jit(green, R), { belly: true }); }
    p.blob(hx, hy, r * 0.5, r * 0.5, 0, green, 1.1, 0.82); return;
  }
  for (const b of [true, false]) for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2 + (b ? 0.14 : 0);
    p.blade(hx + Math.cos(a) * r * 0.45, hy + Math.sin(a) * r * 0.45, out(a), r * 0.62, r * 0.24, 0, jit(b ? mul(gold, 0.82) : gold, R, 0.04), jit(goldTip, R, 0.04), { belly: true, taper: 1.2 }); }
  p.blob(hx, hy, r * 0.5, r * 0.48, 0, disc, 1.18, 0.82);
  for (let k = 0; k < 60; k++) { const a = k * 2.399, d = Math.sqrt(k / 60) * r * 0.44; p.ell(hx + Math.cos(a) * d, hy + Math.sin(a) * d, r * 0.032, r * 0.027, 0, mul(disc, 0.7 + 0.5 * R())); }
}
// stage 2: per plant two crossed stem cards (the two painted variants); stage 3 adds the head: a square card facing the default camera's
// azimuth (45 deg: balanced across the game's orbit, 45 +- 49 deg; facing +Z it went nearly edge-on at the orbit's end), tilted back 0.3 rad
// toward the raised camera, centred on the stem top, and a one-sided card just behind it with the head's green back (so the
// head reads as one disc from every side: the old crossed face-on + profile cards sliced each other's head)
const SUN_FACE = [0.5, 0, 0.75, 0.25], SUN_BACK = [0.75, 0, 1, 0.25], SUN_STEMS = [[0, 0, 0.25, 1], [0.25, 0, 0.5, 1]];
const sunStems = (w, h, uvs) => (R) => TRIO.flatMap(([x, z], i) => [0, 1].map((k) => ({ x, z, rot: k * Math.PI / 2, w: w * TRIO_K[i], h: h * TRIO_K[i], uv: uvs[(i + k) % 2] })));
const SUN_AZ = Math.PI / 4;   // the default camera's azimuth
const sunHeads = (h, hw) => (R) => TRIO.flatMap(([x, z], i) => { const t = 0.3, f = [Math.sin(SUN_AZ), Math.cos(SUN_AZ)], yc = h * TRIO_K[i] * 0.96;
  const c = [x + f[0] * 0.02, yc, z + f[1] * 0.02], up = [-f[0] * Math.sin(t), Math.cos(t), -f[1] * Math.sin(t)], n = [f[0] * Math.cos(t), Math.sin(t), f[1] * Math.cos(t)];
  const o = c.map((v, k) => v - up[k] * hw / 2);
  return [{ x: o[0], y: o[1], z: o[2], rot: SUN_AZ, tilt: -t, w: hw, h: hw, uv: SUN_FACE, oneSided: true },
    { x: o[0] - n[0] * 0.004, y: o[1] - n[1] * 0.004, z: o[2] - n[2] * 0.004, rot: SUN_AZ + Math.PI, tilt: t, w: hw, h: hw, uv: SUN_BACK, oneSided: true }]; });
const bushes = (n, w, h) => (R) => TRIO.flatMap(([x, z], i) => Array.from({ length: n }, (_, k) => ({ x, z, rot: k * Math.PI / n + i * 0.4 + (R() - 0.5) * 0.2, w: w * TRIO_K[i], h: h * TRIO_K[i], uv: [k % 2 ? 0.5 : 0, 0, k % 2 ? 1 : 0.5, 1] })));
export const CROPS = {
  crop_sunflower_1: { group: 'crop', grain: 0.012, tex: [128, 64], paint: (p, R) => { sunflower(p, R, 32, 64, 64, 1); sunflower(p, R, 96, 64, 64, 1); }, cards: (R) => cluster(0.2, 0.2)(R) },
  crop_sunflower_2: { group: 'crop', grain: 0.012, tex: [256, 256], paint: (p, R) => { sunflower(p, R, 64, 128, 256, 2); sunflower(p, R, 192, 128, 256, 2); }, cards: (R) => sunStems(0.32, 0.64, H2)(R) },
  // the stems painted in true proportion (0.44 x 1.04 u, 216 x 512 px) squashed into 128 px cells; the head cells 128 x 128 (0.36 u)
  crop_sunflower_3: { group: 'crop', grain: 0.012, tex: [512, 512], paint: (p, R) => { const q = squash(p, 128 / 216);
      sunflower(q, R, 108, 216, 512, 3); p.at(128, 0); sunflower(q, R, 108, 216, 512, 3); p.at(0, 0); sunHead(p, R, 320, 64, 59, false); sunHead(p, R, 448, 64, 59, true); },
    cards: (R) => [...sunStems(0.44, 1.04, SUN_STEMS)(R), ...sunHeads(1.04, 0.36)(R)] },
  crop_lavender_1: { group: 'crop', grain: 0.012, tex: [128, 64], paint: (p, R) => { for (const cx of [32, 96]) lavenderBush(p, R, cx, 64, 64, { leaves: 16, leafLen: 2.4, spikes: 0 }); }, cards: (R) => cluster(0.18, 0.18)(R) },
  crop_lavender_2: { group: 'crop', grain: 0.012, tex: [256, 128], paint: (p, R) => { for (const cx of [64, 192]) lavenderBush(p, R, cx, 128, 128, { leaves: 50, leafLen: 1.6, spikes: 12, bloom: 'bud' }); }, cards: bushes(3, 0.3, 0.3) },
  crop_lavender_3: { group: 'crop', grain: 0.012, tex: [512, 256], paint: (p, R) => { for (const cx of [128, 384]) lavenderBush(p, R, cx, 256, 256, { leaves: 64, leafLen: 1.2, spikes: 24, bloom: true }); }, cards: bushes(3, 0.52, 0.52) },
};

// ---- the flower bed (the game's FlowerBed: a raised oval bed of wildflowers, ~1.1 x 0.8; the layout keeps a 0.6 u disc clear):
//      a stone-edged soil mound (its own vertex-coloured material) planted with kit flower clumps from one atlas ----
const BED = { rx: 0.5, rz: 0.36, h: 0.11 };
const bedCell = (c, r) => [c * 0.25, r * 0.5, (c + 1) * 0.25, (r + 1) * 0.5];   // 4 x 2 atlas cells of 128 x 128
const BED_PLANTS = [   // [atlas cell, x, z, card height, card width]
  [[0, 0], -0.22, -0.08, 0.26, 0.2], [[0, 0], 0.18, 0.12, 0.24, 0.19], [[1, 0], 0.02, -0.16, 0.22, 0.18], [[2, 0], -0.06, 0.1, 0.3, 0.22], [[2, 0], 0.3, -0.04, 0.27, 0.2],
  [[3, 0], -0.32, 0.08, 0.26, 0.2], [[0, 1], 0.08, 0.0, 0.34, 0.3], [[1, 1], -0.14, 0.18, 0.3, 0.24], [[1, 0], 0.26, 0.2, 0.2, 0.17], [[3, 0], 0.14, -0.2, 0.25, 0.19],
  [[2, 1], -0.3, -0.12, 0.15, 0.24], [[2, 1], 0.36, 0.08, 0.14, 0.22], [[2, 1], -0.02, 0.24, 0.15, 0.24], [[2, 1], 0.0, -0.26, 0.14, 0.22], [[3, 1], 0.2, -0.08, 0.14, 0.26],
  [[2, 1], -0.18, -0.2, 0.15, 0.24], [[2, 1], 0.22, -0.22, 0.14, 0.22], [[2, 1], -0.38, 0.0, 0.13, 0.2], [[2, 1], 0.4, -0.12, 0.13, 0.2], [[2, 1], 0.12, 0.26, 0.14, 0.22],
  [[2, 1], -0.24, 0.24, 0.13, 0.2], [[3, 1], -0.16, 0.02, 0.14, 0.28], [[3, 1], 0.3, 0.16, 0.14, 0.22],   // leafy ground and clover between (no bare soil)
  [[3, 1], 0, 0, 0, 0.84],   // a leaf carpet over the whole mound (flat; d = 0.74 w)
];
export const BEDS = {
  flowerbed: { group: 'bed', grain: 0.012, tex: [512, 256], paint: (p, R) => {
      const cell = (c, r) => p.at(c * 128, r * 128);
      cell(0, 0); wildflower(p, R, 'daisy', 128, 128, [0.5, 0.8], 12); cell(1, 0); wildflower(p, R, 'buttercup', 128, 128, [0.45, 0.76], 11);
      cell(2, 0); wildflower(p, R, 'poppy', 128, 128, [0.55, 0.82], 13); cell(3, 0); wildflower(p, R, 'cornflower', 128, 128, [0.5, 0.8], 11);
      cell(0, 1); lavenderBush(p, R, 64, 128, 128, { leaves: 46, leafLen: 1.3, spikes: 16, bloom: true }); cell(1, 1);
      for (let i = 0; i < 8; i++) p.blade(64 + (R() - 0.5) * 50, 127, (R() - 0.5) * 2.2, 26 + R() * 22, 8, (R() - 0.5) * 0.5, jit(C.leaf, R), jit(C.leafTip, R), { belly: true });
      const heads = []; for (let i = 0; i < 9; i++) heads.push(p.blade(64 + (R() - 0.5) * 14, 126, (R() - 0.5) * 1.2, 66 + R() * 46, 2.4, (R() - 0.5) * 0.3, jit(C.stem, R), jit(C.stemTip, R), { taper: 0.3, tipW: 0.6 }));
      heads.sort((a, b) => a[1] - b[1]).forEach(([x, y]) => flowerHead(p, 'daisy', x, y, 9 + R() * 3, R));   // an ox-eye clump
      cell(2, 1); grassTuft(p, R, 0, 128, 128, { n: [12, 15], spread: 1.6, len: [0.4, 0.8], w: [7, 10], bend: 0.45, root: C.root, tip: C.tip });   // leafy ground between
      cell(3, 1); for (let i = 0; i < 10; i++) { const x = 16 + R() * 96, y = 20 + R() * 90, s = 0.9 + R() * 0.4, a0 = R() * 6.3; for (let k = 0; k < 3; k++) { const a = a0 + k * 2.094; p.blob(x + Math.cos(a) * 8 * s, y + Math.sin(a) * 8 * s, 8 * s, 6.5 * s, a, jit(C.clover, R), 1.12, 0.82); } }
      p.at(0, 0); },
    cards: (R) => BED_PLANTS.flatMap(([[c, r], x, z, h, w]) => c === 3 && r === 1 ? [{ flat: true, x, z, w, d: w * (h ? 0.8 : 0.74), y: BED.h + (h ? 0.03 : 0.024), rot: h ? R() * 6.28 : 0, uv: bedCell(c, r) }]   // (h 0: the carpet, under the clumps)
      : [0, 1].map((k) => ({ x, z, y: BED.h - 0.01, rot: k * Math.PI / 2 + R() * 0.6, w, h, uv: bedCell(c, r) }))),
    // the bed: a soil mound (oval, domed) inside a ring of mossy edging stones; COLOR_0, smooth normals
    solid: (R) => {
      const g = { p: [], c: [], i: [] }, soil = hex('#6E5444'), soilLit = hex('#8A6B52'), stone = hex('#ABA090'), moss = hex('#93AF72');
      const ring = 18, ex = (a, k) => [Math.cos(a) * BED.rx * k, Math.sin(a) * BED.rz * k];
      const c0 = g.p.length / 3; g.p.push(0, BED.h + 0.03, 0); g.c.push(...soilLit);
      for (const [k, y] of [[0.55, BED.h + 0.02], [0.92, BED.h]]) for (let s = 0; s < ring; s++) { const [x, z] = ex(s / ring * Math.PI * 2, k); g.p.push(x, y, z); g.c.push(...lerp3(soilLit, soil, k)); }
      for (let s = 0; s < ring; s++) { const a = c0 + 1 + s, b = c0 + 1 + (s + 1) % ring, a2 = a + ring, b2 = b + ring; g.i.push(c0, b, a, a, b, b2, a, b2, a2); }
      g.n = []; for (let k = 0; k < g.p.length / 3; k++) g.n.push(0, 1, 0);   // (the soil mound: lit like the ground)
      for (let s = 0; s < 15; s++) {   // edging stones: rounded pebbles round the rim (normals from the ellipsoid: soft, lit), each its own shade, some mossy
        const a = s / 15 * Math.PI * 2 + (R() - 0.5) * 0.12, [x, z] = ex(a, 1.04), rx = 0.07 + R() * 0.02, ry = 0.055 + R() * 0.025, rz = 0.055, ca = Math.cos(a), sa = Math.sin(a);
        const top = R() < 0.55 ? moss : lerp3(stone, hex('#B3A898'), 0.5), side = lerp3(stone, hex('#968B7E'), R()), b = g.p.length / 3, N = 7;
        const put = (u, v) => { const lx = Math.cos(u) * Math.cos(v) * rx, ly = Math.sin(v) * ry, lz = Math.sin(u) * Math.cos(v) * rz;   // v: -pi/2 bottom .. pi/2 top
          g.p.push(x + lx * -sa + lz * ca, Math.max(0, ly + ry * 0.35), z + lx * ca + lz * sa);
          const nl = norm([lx / (rx * rx), ly / (ry * ry), lz / (rz * rz)]); g.n.push(nl[0] * -sa + nl[2] * ca, nl[1], nl[0] * ca + nl[2] * sa); g.c.push(...(v > 0.6 ? top : v > 0 ? lerp3(side, top, 0.4) : mul(side, 0.85))); };
        for (const v of [-0.55, 0.45]) for (let k = 0; k < N; k++) put(k / N * Math.PI * 2, v);
        put(0, Math.PI / 2);
        // (the local -> world map above is a mirror, so the faces are wound clockwise in the local frame: outward in the world)
        for (let k = 0; k < N; k++) { const a0 = b + k, a1 = b + (k + 1) % N; g.i.push(a0, a1, a1 + N, a0, a1 + N, a0 + N); }
        for (let k = 0; k < N; k++) g.i.push(b + N + k, b + N + (k + 1) % N, b + 2 * N); }
      return g; } },
};

// ---- the card shrubs (art/specs/2026-10-22-painterly-trees-design.md): the forest-edge belt's low tier (~700 of them), painted like the
//      kit but softer and grainier (more brush and grain, soft dabs over the leaves) to sit beside the painterly trees' paint (the
//      repainted MegaKit set, reskin.mjs) ----
// a painter whose x is scaled by k (shapes painted in world proportions on a card whose texture has fewer px per unit across than up)
const squash = (p, k) => { const q = Object.create(p); q.poly = (pts, col, a) => p.poly(pts.map(([x, y]) => [x * k, y]), col, a); return q; };
// a leaf: a soft oval (the Meshy leafy bush's leaves) from (x, y) along `ang` (0 = up) for `len` px, folded on its midrib: the half
// facing the upper left lit (c1), the other a little darker, the colour deepening toward the stalk (c0)
function leaf(p, R, x, y, ang, len, c0, c1) {
  const d = [Math.sin(ang), -Math.cos(ang)], nr = [-d[1], d[0]], a = jit(c0, R, 0.06), b = jit(c1, R, 0.06), litLeft = nr[0] + nr[1] > 0, n = 6;
  const ax = (t) => [x + d[0] * len * t, y + d[1] * len * t], edge = (t, s) => { const [px, py] = ax(t), h = len * 0.32 * Math.pow(Math.sin(Math.PI * t), 0.55) * s; return [px + nr[0] * h, py + nr[1] * h]; };
  for (const s of [-1, 1]) { const c = (s < 0) === litLeft ? b : lerp3(a, b, 0.55);
    for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; p.poly([ax(t0), edge(t0, s), edge(t1, s), ax(t1)], lerp3(a, c, Math.min(1, 0.5 + (t0 + t1) * 0.5))); } }
}
// a rosette: 4-6 leaves fanning about `ang` from (x, y), the side ones first (behind), the middle one last; returns its heart (for dabs)
function rosette(p, R, x, y, ang, len, c0, c1) {
  const n = 4 + Math.floor(R() * 3), offs = Array.from({ length: n }, (_, k) => (k / (n - 1) - 0.5) * 2.5 + (R() - 0.5) * 0.3).sort((u, v) => Math.abs(v) - Math.abs(u));
  for (const o of offs) leaf(p, R, x, y, ang + o, len * (0.85 + R() * 0.25) * (1 - Math.abs(o) * 0.12), c0, c1);
  return [x + Math.sin(ang) * len * 0.4, y - Math.cos(ang) * len * 0.4];
}
// points on a jittered dx x dy px grid under a dome's outline (y >= top(x) + m, inside |x - cx| <= hw), the bottom row first (painted
// first, so the higher ones overlap them): even cover, no bald patches
function domeGrid(R, cx, hw, H, top, dx, dy, m) {
  const pts = [];
  for (let y = H - 2; y > 0; y -= dy) for (let x = cx - hw; x <= cx + hw; x += dx) { const px = x + (R() - 0.5) * dx * 0.8, py = y + (R() - 0.5) * dy * 0.8; if (Math.abs(px - cx) <= hw && py >= top(px) + m && py <= H - 1) pts.push([px, py]); }
  return pts.sort((a, b) => b[1] - a[1]);
}
// shrub_low: a low dome of leaf rosettes in a W x H region (the root at the bottom centre): rosettes on a grid from the base up, each
// fanning out from the dome's heart, deep teal low and yellow-green on top; then soft dabs of colour over them (never over clear texels)
function leafDome(p, R, W, H) {
  const cx = W / 2, hw = W * 0.45, top = (x) => H - 1 - (H - 30) * Math.pow(Math.max(0, 1 - ((x - cx) / hw) ** 2), 0.6), lit = (y) => Math.max(0, Math.min(1, 1 - (y - 30) / (H - 40))), hearts = [];
  const grid = domeGrid(R, cx, Math.min(hw * 0.85, W / 2 - 30), H, top, 18, 14, 8);   // (no lone rosettes at the low ends; the sideways leaves stay inside the cell)
  for (const [x, y] of grid) { const f = lit(y), ang = Math.atan2(x - cx, H + 80 - y) * 1.3 + (R() - 0.5) * 0.5;
    hearts.push([...rosette(p, R, x, y, ang, 17 + R() * 7, lerp3(C.shrubDeep, C.shrub, Math.min(1, 0.1 + f * 1.2)), f < 0.5 ? lerp3(C.shrub, C.shrubLit, f * 2) : lerp3(C.shrubLit, C.shrubTop, f * 2 - 1)), f]); }
  for (const [x, y, f] of hearts) for (let k = 0; k < 2; k++) p.ell(x + (R() - 0.5) * 6, y + (R() - 0.5) * 6, 2.5 + R() * 3, 1.8 + R() * 2, R() * 3.1, jit(f > 0.45 ? C.shrubTop : C.shrubDeep, R), 0.14 + R() * 0.14);
}
// a bracken pinna: a midrib from (x, y) along `ang` for L px (bending by `bend`) with close-set pinnules down both sides (one leaflet when
// it is small); green c0 -> c1 toward its tip, then russet by `rust` at the tip
function pinna(p, R, x, y, ang, L, bend, c0, c1, rust) {
  const col = (s) => lerp3(lerp3(c0, c1, s), C.russet, Math.min(1, rust * s * s * 1.3));
  if (L < 12) { p.blade(x, y, ang, L + 2, L * 0.55, bend, jit(col(0.3), R, 0.05), jit(col(1), R, 0.05), { belly: true }); return; }
  const d = [Math.sin(ang), -Math.cos(ang)], q = [Math.cos(ang), Math.sin(ang)], at = (s) => [x + d[0] * L * s + q[0] * bend * L * s * s, y + d[1] * L * s + q[1] * bend * L * s * s];
  const m = Math.round(L / 4.2);
  for (let j = 0; j < m; j++) { const s = (j + 0.5) / m, [px, py] = at(s), a = ang + Math.atan(2 * bend * s), l0 = L * 0.25 * (1 - 0.6 * s) + 2.5, c = col(s);
    for (const side of [-1, 1]) { const l = l0 * (0.8 + R() * 0.4);   // (each pinnule its own length and angle: a hand-painted edge, not a saw)
      p.blade(px, py, a + side * (0.95 - 0.3 * s) + (R() - 0.5) * 0.3, l, l * 0.72, -side * 0.12, jit(mul(c, 0.92), R, 0.05), jit(col(Math.min(1, s + 0.15)), R, 0.05), { belly: true, taper: 1.8, tipW: 0.25 }); } }
  p.blade(x, y, ang, L, 1.6, bend, mul(c0, 0.8), col(1), { taper: 0.6, tipW: 0.4 });
}
// shrub_mound (bracken): one frond in a W x H region from x0 (base at the bottom centre): a bare stipe, then a broad triangle of 12 pinna
// pairs (longest at the base, held out nearly level), russet by `rust` at the pinna tips, more toward the frond's top
function brackenFrond(p, R, x0, W, H, rust) {
  const len = H - 10, ang = (R() - 0.5) * 0.06, bend = (R() - 0.5) * 0.1, cx = x0 + W / 2, at = (t) => [cx + Math.sin(ang) * len * t + bend * len * t * t, H - 2 - Math.cos(ang) * len * t];
  p.blade(cx, H - 2, ang, len, 3.2, bend, mul(C.bracken, 0.7), lerp3(C.brackenLit, C.russetDark, rust * 0.6), { taper: 0.4, tipW: 0.35 });
  for (let k = 0; k < 12; k++) { const u = k / 12, L = W * 0.4 * Math.pow(1 - u, 0.8) + 4;
    for (const side of [-1, 1]) { const [x, y] = at(0.18 + 0.8 * (u + (side > 0 ? 0.3 : 0) / 12));
      pinna(p, R, x, y, side * (1.32 - u * 0.5) + (R() - 0.5) * 0.12, L * (0.92 + R() * 0.12), -side * 0.08, lerp3(C.bracken, C.brackenLit, u * 0.5), C.brackenLit, rust * (0.1 + 1.1 * Math.pow(u, 1.5))); } }
}
// shrub_heather: a cushion of green tufts in a W x H region about the root at (cx, H): a fuzz of tiny dark leaves filling it, fans of
// short fine shoots from the base up (deep green low, olive-tipped on top), then purple-pink bloom dots at the shoot tips, the higher
// ones likelier
function heatherMat(p, R, cx, W, H, o) {
  const hw = W * 0.46, top = (x) => H - 1 - (H - 18) * Math.pow(Math.max(0, 1 - ((x - cx) / hw) ** 2), 0.4), lit = (y) => Math.max(0, Math.min(1, 1 - (y - 18) / (H - 24)));
  const tufts = domeGrid(R, cx, Math.min(hw * 0.88, W / 2 - 24), H, top, 12, 10, 12), tips = [];   // (the shoots and bloom stay inside the cell)
  for (let i = 0; i < tufts.length * 3; i++) { const x = cx + (R() * 2 - 1) * hw * 0.9, t = top(x), y = t + 14 + (H - t - 14) * R(), f = lit(y);   // the fuzz
    p.ell(x, y, 2.2 + R() * 1.4, 1.4 + R() * 0.8, (R() - 0.5) * 2.4, jit(lerp3(mul(C.heath, 0.85), C.heath, f), R, 0.08)); }
  for (const [x, y] of tufts) { const f = lit(y), u = (x - cx) / hw, n = 6 + Math.floor(R() * 4), sz = 10 + R() * 7;
    for (let k = 0; k < n; k++) { const ang = u * 0.5 + (k / (n - 1) - 0.5) * 1.8 + (R() - 0.5) * 0.3;
      tips.push([...p.blade(x + (R() - 0.5) * 4, y, ang, sz * (0.7 + R() * 0.3), 2.6 + R() * 0.8, (R() - 0.5) * 0.4, jit(lerp3(mul(C.heath, 0.9), C.heath, f), R), jit(lerp3(C.heath, C.heathTip, f), R), { taper: 1, tipW: 0.3 }), f]); } }
  for (const [x, y, f] of tips) { if (R() > o.bloom * (0.25 + f)) continue;
    for (let k = 0; k < 2 + Math.floor(R() * 2); k++) p.blob(x + (R() - 0.5) * 5, y + k * 3 + (R() - 0.5) * 2, 2.2 + R() * 0.8, 2 + R() * 0.6, 0, jit(lerp3(C.bloom, C.bloomLit, f * R()), R, 0.04), 1.12, 0.8); }
}
// a ring of n cards leaning out (tilt from upright) from `out` u off the centre, alternating uvs; at phase 0 they lean between the arms
// of crossed(3, ...) cards (a card leans along its facing normal, a quarter turn from its width)
const tiltRing = (n, w, h, tilt, out, uvs) => (R) => Array.from({ length: n }, (_, i) => { const rot = i / n * Math.PI * 2 + (R() - 0.5) * 0.3;
  return { rot, x: Math.sin(rot) * out, z: Math.cos(rot) * out, w, h, tilt: tilt[0] + R() * (tilt[1] - tilt[0]), uv: uvs[i % uvs.length] }; });
// a 256 x 256 atlas: one wide cell on top (its card's bottom edge at the ground), two below; the lower cards start 8 px down, in their
// cells' clear top margin, so the upper cell's opaque bottom row never filters onto their outer edge (a ring of dark specks)
const upper = [[0, 0, 1, 0.5]], lowerHalves = [[0, 136 / 256, 0.5, 1], [0.5, 136 / 256, 1, 1]];
export const SHRUBS = {
  // 3 crossed dome cards (the side view) and 6 leaf-mound cards leaning out between their arms (the raised view: no 6-armed star)
  shrub_low: { group: 'shrub', brush: 0.13, grain: 0.06, soften: 1.6, tex: [256, 256], paint: (p, R) => {
      leafDome(squash(p, 0.6957), R, 368, 128);   // the crossed cards: 0.92 x 0.32 u on 256 x 128 px
      const q = squash(p, 0.81); p.at(0, 128); leafDome(q, R, 158, 128); p.at(128, 128); leafDome(q, R, 158, 128); p.at(0, 0); },   // the ring: 0.42 x 0.34 u per 128 px
    cards: (R) => [...crossed(3, 0.92, 0.32, upper, R), ...tiltRing(6, 0.42, 0.32, [1.0, 1.2], 0.05, lowerHalves)(R)] },   // (0.32: the 120 px below the gutter)
  // 6 frond cards leaning out like fern_clump's (0.3 x 0.6 u per 128 x 256 px), a greener and a more russet frond
  shrub_mound: { group: 'shrub', brush: 0.13, grain: 0.06, soften: 1.6, tex: [256, 256], paint: (p, R) => { brackenFrond(p, R, 0, 128, 256, 0.45); brackenFrond(p, R, 128, 128, 256, 0.9); },
    cards: tiltRing(6, 0.3, 0.6, [0.8, 1.05], 0, halves) },
  // 3 crossed mat cards and 6 tufted cards leaning out round them, a little past the crossed cards' low ends
  shrub_heather: { group: 'shrub', brush: 0.13, grain: 0.06, soften: 1.4, tex: [256, 256], paint: (p, R) => {
      heatherMat(squash(p, 0.694), R, 184.5, 369, 128, { bloom: 0.21 });   // the crossed cards: 0.72 x 0.25 u
      const q = squash(p, 0.889); p.at(0, 128); heatherMat(q, R, 72, 144, 128, { bloom: 0.21 }); p.at(128, 128); heatherMat(q, R, 72, 144, 128, { bloom: 0.21 }); p.at(0, 0); },   // the ring: 0.36 x 0.32 u per 128 px
    cards: (R) => [...crossed(3, 0.72, 0.25, upper, R), ...tiltRing(6, 0.36, 0.3, [1.0, 1.2], 0.08, lowerHalves)(R)] },   // (0.3: the 120 px below the gutter)
};

// ---- the garden crops' young stages (owner 2026-10-25, "crops, mature on Meshy"): crop_<id>_1 (sprout) and crop_<id>_2 (growing) for
//      the eight crops whose ready stage is a Meshy model (art/meshy/crop_<id>_3). Stage 1 a sprout cluster across the plot, stage 2 ONE
//      plant in the middle about half the ready model's size (the owner, 2026-10-25: "bigger, fit the plot"),
//      painted in its own leaf greens: [shade, mid, lit], sampled from each finished ready-stage albedo (its leaf texels by luma band,
//      0-30 / 35-65 / 75-100 %) and frozen here. The wheat ripens gold, so its young greens are the kit's grass ----
const YG = Object.fromEntries(Object.entries({
  radish: ['#6C8939', '#859F46', '#B0BF6E'], carrot: ['#7A9450', '#85A35B', '#95B266'], wheat: ['#5F8C45', '#7E9E52', '#A7BE6A'],
  lettuce: ['#88963E', '#9AA751', '#CCD488'], tomato: ['#6A8147', '#708A4C', '#7C9351'], pumpkin: ['#5E6335', '#757E46', '#8F9B55'],
  blueberry: ['#647740', '#657F46', '#6F8656'], cranberry: ['#84924D', '#87A04F', '#95AF59'],
}).map(([k, v]) => [k, v.map(hex)]));
const YC = { radish: hex('#CF7378'), carrot: hex('#D98A4E'), tomatoGreen: hex('#A3B36B'), flower: hex('#EFC25A'), flowerEye: hex('#B9862F'), bell: hex('#F4ECDD'),
  berryGreen: hex('#9DB08C'), blossom: hex('#E7A6AE'), stake: hex('#A07A52'), stakeLit: hex('#BE9A6C'), twig: hex('#7A5A44'), runner: hex('#7A5E44'), ear: hex('#B9C07A') };
// a seedling at the bottom centre (cx, H) of a W x H region: a short stem and two round seed leaves; returns the stem top
function sprout(p, R, cx, W, H, g, o = {}) {
  const top = p.blade(cx, H - 1, (R() - 0.5) * 0.12, H * (o.stem ?? 0.42), Math.max(2, W * 0.045), 0, mul(g[0], 0.9), g[1], { taper: 0.3, tipW: 0.6 });
  for (const s of [-1, 1]) p.blob(top[0] + s * W * 0.14 * (o.coty ?? 1), top[1] + H * 0.02, W * 0.13 * (o.coty ?? 1), H * 0.07 * (o.coty ?? 1), s * 0.35, jit(g[2], R), 1.1, 0.84);
  return top;
}
// a leaf on a stalk: the stalk from (x, y) along `ang` for `st` px, then the kit's soft folded leaf, `len` px
function stalkLeaf(p, R, x, y, ang, st, len, g, sw = 2.4) {
  const tip = st > 0 ? p.blade(x, y, ang, st, sw, 0, mul(g[0], 0.9), g[1], { taper: 0.4, tipW: 0.6 }) : [x, y];
  leaf(p, R, tip[0], tip[1], ang, len, g[0], g[2]); return tip;
}
// a palmate leaf (pumpkin): five broad lobes fanned about `ang` from (x, y), pale veins
function lobedLeaf(p, R, x, y, ang, len, g) {
  for (const o of [-1.05, 1.05, -0.52, 0.52, 0]) leaf(p, R, x, y, ang + o, len * (1 - Math.abs(o) * 0.24), g[0], o ? g[1] : g[2]);
  for (const o of [-0.52, 0, 0.52]) p.blade(x, y, ang + o, len * 0.72, 1.3, 0, mul(g[2], 1.08), mul(g[2], 1.15), { taper: 0.6, tipW: 0.3 });
}
// a compound leaf (tomato): a midrib with two leaflet pairs and an end leaflet
function compoundLeaf(p, R, x, y, ang, len, g) {
  const d = [Math.sin(ang), -Math.cos(ang)];
  p.blade(x, y, ang, len, 1.8, 0.08, mul(g[0], 0.9), g[1], { taper: 0.5, tipW: 0.5 });
  for (const t of [0.38, 0.68]) for (const s of [-1, 1]) leaf(p, R, x + d[0] * len * t, y + d[1] * len * t, ang + s * 1.0, len * 0.36, g[0], g[2]);
  leaf(p, R, x + d[0] * len * 0.9, y + d[1] * len * 0.9, ang, len * 0.4, g[0], g[2]);
}
// a feathery frond (carrot): a thin stalk from (x, y) along `ang` for L px, small spaced leaflets down both sides, smaller toward the tip
function frond(p, R, x, y, ang, L, g) {
  const d = [Math.sin(ang), -Math.cos(ang)];
  p.blade(x, y, ang, L, 1.8, (R() - 0.5) * 0.1, mul(g[0], 0.9), g[1], { taper: 0.5, tipW: 0.5 });
  for (let t = 0.3; t <= 0.98; t += 0.1) { const px = x + d[0] * L * t, py = y + d[1] * L * t, l = L * 0.2 * (1 - t * 0.5) + 2;
    for (const s of [-1, 1]) p.blade(px, py, ang + s * (0.95 - t * 0.3) + (R() - 0.5) * 0.2, l, l * 0.5, -s * 0.15, jit(g[0], R, 0.05), jit(t > 0.6 ? g[2] : g[1], R, 0.05), { belly: true, taper: 1.4, tipW: 0.2 }); }
}
// a small five-petal flower at (x, y), radius r (tomato and pumpkin yellow, cranberry pink)
function bloom(p, R, x, y, r, col, eye) { for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + R() * 0.3; p.ell(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.45, r * 0.55, r * 0.32, a, jit(col, R, 0.04)); } p.ell(x, y, r * 0.3, r * 0.26, 0, eye); }
const H2 = [[0, 0, 0.5, 1], [0.5, 0, 1, 1]];   // two plants painted side by side: the crossed cards alternate them
// stage 1 is a sprout CLUSTER (the owner, 2026-10-25: readable at the default camera): seven seedlings across the plot, one in the
// middle and six round it at 0.27 u, each a crossed pair of the two painted variants, a little jittered in place, size and turn
const SPROUT_SPOTS = [[0, 0], ...Array.from({ length: 6 }, (_, k) => [0.27 * Math.cos(k * Math.PI / 3 + 0.5), 0.27 * Math.sin(k * Math.PI / 3 + 0.5)])];
const cluster = (w, h) => (R) => SPROUT_SPOTS.flatMap(([x, z], i) => { const s = 0.85 + R() * 0.3, r0 = R() * Math.PI, jx = (R() - 0.5) * 0.06, jz = (R() - 0.5) * 0.06;
  return [0, 1].map((k) => ({ x: x + jx, z: z + jz, rot: r0 + k * Math.PI / 2, w: w * s, h: h * s, uv: H2[(i + k) % 2] })); });
const YOUNG = {
  // radish: two heart-shaped seed leaves and a first spoon leaf; then a rosette of spoon leaves over a pink shoulder
  crop_radish_1: { group: 'crop', grain: 0.012, tex: [128, 64], paint: (p, R) => { for (const cx of [32, 96]) { const t = sprout(p, R, cx, 64, 64, YG.radish, { stem: 0.34, coty: 1.25 }); stalkLeaf(p, R, t[0], t[1], (R() - 0.5) * 0.5, 4, 15, YG.radish); } }, cards: cluster(0.2, 0.2) },
  crop_radish_2: { group: 'crop', grain: 0.012, tex: [256, 128], paint: (p, R) => { for (const cx of [64, 192]) { p.blob(cx, 118, 13, 10, 0, YC.radish, 1.14, 0.82);
      for (let k = 0; k < 7; k++) stalkLeaf(p, R, cx + (R() - 0.5) * 6, 112, (k / 6 - 0.5) * 2.3 + (R() - 0.5) * 0.15, 16 + R() * 10, 34 + R() * 14, YG.radish); } }, cards: (R) => crossed(3, 0.48, 0.48, H2, R) },
  // carrot: two grass-like seed leaves and a first feathery leaf; then a fan of feathery fronds over a small orange top
  crop_carrot_1: { group: 'crop', grain: 0.012, tex: [128, 64], paint: (p, R) => { for (const cx of [32, 96]) { const g = YG.carrot;
      for (const s of [-1, 1]) p.blade(cx, 63, s * 0.45, 30, 3, -s * 0.1, mul(g[0], 0.9), g[2], { taper: 0.8 });
      frond(p, R, cx, 62, (R() - 0.5) * 0.3, 52, g); } }, cards: cluster(0.2, 0.2) },
  crop_carrot_2: { group: 'crop', grain: 0.012, tex: [256, 128], paint: (p, R) => { for (const cx of [64, 192]) { const g = YG.carrot;
      for (let k = 0; k < 7; k++) frond(p, R, cx + (R() - 0.5) * 6, 120, (k / 6 - 0.5) * 1.7 + (R() - 0.5) * 0.12, 82 + R() * 30, g);
      p.blob(cx, 122, 8, 6, 0, YC.carrot, 1.14, 0.82); } }, cards: (R) => crossed(3, 0.46, 0.5, H2, R) },
  // wheat: a few grass blades; then a green tillered clump with slim green ears on its tallest stems
  crop_wheat_1: { group: 'crop', grain: 0.012, tex: [128, 64], paint: (p, R) => { for (const v of [0, 1]) grassTuft(p, R, v * 64, 64, 64, { n: [4, 5], spread: 0.8, len: [0.6, 0.95], w: [3, 4], bend: 0.3, root: mul(YG.wheat[0], 0.9), tip: YG.wheat[2] }); }, cards: cluster(0.2, 0.2) },
  crop_wheat_2: { group: 'crop', grain: 0.012, tex: [256, 256], paint: (p, R) => { for (const v of [0, 1]) { const g = YG.wheat, cx = v * 128 + 64;
      grassTuft(p, R, v * 128, 128, 256, { n: [16, 19], spread: 1.0, len: [0.45, 0.85], w: [4, 6], bend: 0.35, root: mul(g[0], 0.9), tip: g[2] });
      for (let s = 0; s < 5; s++) { const ang = (s - 2) * 0.12 + (R() - 0.5) * 0.08, tip = p.blade(cx + (s - 2) * 4, 254, ang, 200 + R() * 46, 2.6, (R() - 0.5) * 0.1, g[0], g[1], { taper: 0.2, tipW: 0.6 });
        for (let k = 0; k < 8; k++) { const yy = tip[1] + k * 4.2, xx = tip[0] - Math.sin(ang) * k * 4.2; p.blob(xx + (k % 2 ? 2 : -2), yy, 2.6, 4.2, (k % 2 ? 0.4 : -0.4) + ang, jit(YC.ear, R, 0.05), 1.12, 0.84); } } } }, cards: (R) => crossed(3, 0.5, 0.72, H2, R) },
  // lettuce: a tiny rosette of round leaves; then an open rosette, low and wide (crossed side cards + a ring leaning out for the raised view)
  crop_lettuce_1: { group: 'crop', grain: 0.012, tex: [128, 32], paint: (p, R) => { for (const cx of [32, 96]) for (const a of [-1.25, 1.25, -0.5, 0.5]) leaf(p, R, cx + a * 2, 31, a, 26 - Math.abs(a) * 5, YG.lettuce[0], YG.lettuce[2]); }, cards: cluster(0.24, 0.12) },
  crop_lettuce_2: { group: 'crop', grain: 0.012, tex: [256, 256], paint: (p, R) => { const g = YG.lettuce;
      for (let k = 0; k < 11; k++) { const a = (k / 10 - 0.5) * 2.9 + (R() - 0.5) * 0.12; leaf(p, R, 128 + a * 6, 126, a, 112 - Math.abs(a) * 26 + R() * 10, g[0], k % 2 ? g[1] : g[2]); }
      for (const ox of [0, 128]) { p.at(ox, 136); for (let k = 0; k < 5; k++) { const a = (k / 4 - 0.5) * 2.2; leaf(p, R, 64 + a * 4, 118, a, 92 - Math.abs(a) * 18, g[0], k % 2 ? g[2] : g[1]); } } p.at(0, 0); },
    cards: (R) => [...crossed(3, 0.66, 0.3, [[0, 0, 1, 0.5]], R), ...tiltRing(5, 0.34, 0.28, [0.6, 0.85], 0.1, [[0, 136 / 256, 0.5, 1], [0.5, 136 / 256, 1, 1]])(R)] },
  // tomato: a seedling with a first compound leaf; then a young plant at its stake, yellow flowers and two small green tomatoes
  crop_tomato_1: { group: 'crop', grain: 0.012, tex: [128, 64], paint: (p, R) => { for (const cx of [32, 96]) { const t = sprout(p, R, cx, 64, 64, YG.tomato, { stem: 0.4 }); compoundLeaf(p, R, t[0], t[1], (R() - 0.5) * 0.4, 22, YG.tomato); } }, cards: cluster(0.2, 0.2) },
  crop_tomato_2: { group: 'crop', grain: 0.012, tex: [256, 256], paint: (p, R) => { for (const cx of [64, 192]) { const g = YG.tomato;
      p.blade(cx + 6, 255, 0, 250, 5, 0, YC.stake, YC.stakeLit, { taper: 0, tipW: 1, lit: 1.08, dark: 0.84 });
      const top = p.blade(cx - 2, 255, -0.02, 228, 3.4, 0.04, mul(g[0], 0.9), g[1], { taper: 0.4, tipW: 0.6 });
      for (let k = 0; k < 9; k++) { const t = 0.14 + 0.095 * k, y = 255 - 228 * t, s = k % 2 ? 1 : -1; compoundLeaf(p, R, cx - 2 + s * 1.5, y, s * (1.05 - t * 0.3) + (R() - 0.5) * 0.15, 64 - t * 20, g); }
      p.ell(cx + 4, 150, 5, 2.2, 0.2, YC.bell);   // the twine
      for (const [x, y] of [[cx + 16, 70], [cx - 22, 104]]) bloom(p, R, x, y, 7, YC.flower, YC.flowerEye);
      for (const [x, y] of [[cx - 16, 150], [cx + 18, 132]]) p.blob(x, y, 7, 7, 0, jit(YC.tomatoGreen, R), 1.14, 0.84);
      p.blob(top[0], top[1] + 4, 6, 6, 0, g[2], 1.1, 0.85); } }, cards: (R) => crossed(2, 0.44, 0.68, H2, R) },
  // pumpkin: two big seed leaves and a first lobed leaf; then a low spread of lobed leaves on a vine with a yellow trumpet flower
  crop_pumpkin_1: { group: 'crop', grain: 0.012, tex: [128, 64], paint: (p, R) => { for (const cx of [32, 96]) { const t = sprout(p, R, cx, 64, 64, YG.pumpkin, { stem: 0.3, coty: 1.5 }); lobedLeaf(p, R, t[0], t[1] - 2, (R() - 0.5) * 0.4, 16, YG.pumpkin); } }, cards: cluster(0.14, 0.14) },
  crop_pumpkin_2: { group: 'crop', grain: 0.012, tex: [256, 256], paint: (p, R) => { const g = YG.pumpkin;
      p.blade(30, 120, 1.45, 196, 4, -0.04, mul(g[0], 0.85), g[1], { taper: 0.2, tipW: 0.7 });   // the vine along the ground
      for (const [x, a, l] of [[62, -0.55, 58], [128, 0.05, 66], [196, 0.6, 56]]) { const t = p.blade(x, 118, a, 34, 2.6, 0, mul(g[0], 0.9), g[1], { taper: 0.3, tipW: 0.7 }); lobedLeaf(p, R, t[0], t[1], a, l, g); }
      bloom(p, R, 160, 92, 11, YC.flower, YC.flowerEye);
      for (const [ox, a] of [[0, -0.2], [128, 0.25]]) { p.at(ox, 136); const t = p.blade(64, 118, a, 28, 2.6, 0, mul(g[0], 0.9), g[1], { taper: 0.3, tipW: 0.7 }); lobedLeaf(p, R, t[0], t[1], a, 52, g); if (ox) bloom(p, R, 36, 92, 9, YC.flower, YC.flowerEye); }
      p.at(0, 0); },
    cards: (R) => [...crossed(2, 0.78, 0.26, [[0, 0, 1, 0.5]], R), ...tiltRing(4, 0.4, 0.26, [0.65, 0.9], 0.1, [[0, 136 / 256, 0.5, 1], [0.5, 136 / 256, 1, 1]])(R)] },
  // blueberry: a woody sprig of small oval leaves; then a small bush of twigs and leaves, white bells and pale green berries
  crop_blueberry_1: { group: 'crop', grain: 0.012, tex: [128, 64], paint: (p, R) => { for (const cx of [32, 96]) { const g = YG.blueberry, top = p.blade(cx, 63, (R() - 0.5) * 0.2, 42, 3, 0.05, YC.twig, mul(YC.twig, 1.15), { taper: 0.4, tipW: 0.6 });
      for (let k = 0; k < 5; k++) { const t = 0.3 + k * 0.16, y = 63 - 42 * t, s = k % 2 ? 1 : -1; leaf(p, R, cx + s, y, s * 1.0, 13, g[0], g[2]); } leaf(p, R, top[0], top[1], 0, 12, g[0], g[2]); } }, cards: cluster(0.2, 0.2) },
  crop_blueberry_2: { group: 'crop', grain: 0.012, tex: [256, 128], paint: (p, R) => { for (const cx of [64, 192]) { const g = YG.blueberry, tips = [];
      for (let k = 0; k < 4; k++) { const a = (k / 3 - 0.5) * 1.3 + (R() - 0.5) * 0.15; tips.push([p.blade(cx + (k - 1.5) * 3, 127, a, 92 + R() * 18, 3, (R() - 0.5) * 0.2, YC.twig, mul(YC.twig, 1.15), { taper: 0.4, tipW: 0.6 }), a]); }
      for (const [, a] of tips) for (let k = 0; k < 7; k++) { const t = 0.3 + k * 0.1, y = 127 - 100 * t * Math.cos(a), x = cx + Math.sin(a) * 100 * t, s = k % 2 ? 1 : -1; leaf(p, R, x, y, a + s * 1.0, 15 + R() * 4, g[0], k % 3 ? g[1] : g[2]); }
      for (let k = 0; k < 4; k++) { const [[x, y]] = tips[k]; p.ell(x + (R() - 0.5) * 8, y + 12, 3.2, 4, 0, YC.bell); p.blob(x + (R() - 0.5) * 18, y + 26 + R() * 10, 4.5, 4.5, 0, jit(YC.berryGreen, R), 1.12, 0.84); } } }, cards: (R) => crossed(3, 0.46, 0.44, H2, R) },
  // cranberry: a low tuft of runners; then a low mat of runners and upright shoots, pink flowers
  crop_cranberry_1: { group: 'crop', grain: 0.012, tex: [128, 32], paint: (p, R) => { for (const cx of [32, 96]) { const g = YG.cranberry;
      for (const s of [-1, 1]) { const tip = p.blade(cx, 30, s * 1.3, 26, 2.2, -s * 0.05, YC.runner, g[0], { taper: 0.3, tipW: 0.6 }); for (const t of [0.4, 0.75, 1]) p.blob(cx + (tip[0] - cx) * t, 30 + (tip[1] - 30) * t - 2, 3.2, 2.2, s * 0.4, jit(g[2], R), 1.1, 0.85); }
      for (let k = 0; k < 3; k++) { const t = p.blade(cx + (k - 1) * 5, 31, (k - 1) * 0.3, 18 + R() * 6, 2, 0, mul(g[0], 0.9), g[1], { taper: 0.3, tipW: 0.6 }); p.blob(t[0], t[1] + 1, 3, 2.4, 0, g[2], 1.1, 0.85); } } }, cards: cluster(0.24, 0.12) },
  crop_cranberry_2: { group: 'crop', grain: 0.012, tex: [256, 128], paint: (p, R) => { const g = YG.cranberry;
      const mat = (cx, W, H, n) => { for (let k = 0; k < n; k++) { const s = k % 2 ? 1 : -1, tip = p.blade(cx + (R() - 0.5) * 10, H - 2, s * (1.1 + R() * 0.35), W * (0.28 + R() * 0.18), 2.4, -s * 0.06, YC.runner, g[0], { taper: 0.3, tipW: 0.6 });
          for (let q = 1; q <= 5; q++) p.blob(cx + (tip[0] - cx) * q / 5, H - 2 + (tip[1] - H + 2) * q / 5 - 2.5, 4.6, 3.2, s * 0.4, jit(q % 2 ? g[2] : g[1], R), 1.1, 0.85); }
        for (let k = 0; k < n; k++) { const t = p.blade(cx + (R() - 0.5) * W * 0.55, H - 1, (R() - 0.5) * 0.7, H * (0.4 + R() * 0.45), 2.2, 0, mul(g[0], 0.9), g[1], { taper: 0.3, tipW: 0.6 });
          for (let q = 0; q < 3; q++) p.blob(t[0] + (R() - 0.5) * 7, t[1] + 2 + q * 4, 4.2, 3, (R() - 0.5), jit(q ? g[1] : g[2], R), 1.1, 0.85); if (k % 3 === 1) bloom(p, R, t[0] + 2, t[1] - 1, 4.5, YC.blossom, mul(YC.blossom, 0.7)); } };
      mat(128, 256, 64, 18); p.at(0, 72); mat(64, 128, 56, 9); p.at(128, 72); mat(64, 128, 56, 9); p.at(0, 0); },
    cards: (R) => [...crossed(3, 0.7, 0.18, [[0, 0, 1, 0.5]], R), ...tiltRing(6, 0.36, 0.17, [0.6, 0.85], 0.1, [[0, 72 / 128, 0.5, 1], [0.5, 72 / 128, 1, 1]])(R)] },
};
Object.assign(CROPS, YOUNG);

// ---- cards -> geometry: every face twice (the back wound the other way), normals leaning up ----
const UP = [0, 1, 0], LEAN = 0.35;
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function addQuad(g, q, n, uv, oneSided = false) {   // q: 4 corners counter-clockwise seen from n; written front and back (oneSided: front only)
  for (const side of oneSided ? [1] : [1, -1]) {
    const b = g.p.length / 3, nn = norm(UP.map((u, k) => u + LEAN * side * n[k]));
    q.forEach((c, i) => { g.p.push(...c); g.n.push(...nn); g.u.push(...uv[i]); });
    if (side > 0) g.i.push(b, b + 1, b + 2, b, b + 2, b + 3); else g.i.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
}
function buildGeometry(cards) {
  const g = { p: [], n: [], u: [], i: [] };
  for (const c of cards) {
    const [u0, v0, u1, v1] = c.uv, uv = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
    if (c.flat) {   // lying on the ground at height y, facing up
      const ax = [Math.cos(c.rot), 0, -Math.sin(c.rot)], az = [Math.sin(c.rot), 0, Math.cos(c.rot)], hw = c.w / 2, hd = c.d / 2;
      const q = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => [(c.x || 0) + ax[0] * sx * hw + az[0] * sz * hd, c.y, (c.z || 0) + ax[2] * sx * hw + az[2] * sz * hd]);
      addQuad(g, q, [0, 1, 0], uv); continue; }
    const ax = [Math.cos(c.rot), 0, -Math.sin(c.rot)], fn = [Math.sin(c.rot), 0, Math.cos(c.rot)], t = c.tilt || 0;
    const up = [fn[0] * Math.sin(t), Math.cos(t), fn[2] * Math.sin(t)], o = [c.x || 0, c.y || 0, c.z || 0], hw = c.w / 2;
    const b0 = [o[0] - ax[0] * hw, o[1], o[2] - ax[2] * hw], b1 = [o[0] + ax[0] * hw, o[1], o[2] + ax[2] * hw];
    const q = [b0, b1, b1.map((v, k) => v + up[k] * c.h), b0.map((v, k) => v + up[k] * c.h)];
    addQuad(g, q, norm(cross3(ax, up)), uv, !!c.oneSided);   // (a sunflower head: its face and its back are two one-sided cards)
  }
  return g;
}

const specOf = (id) => { const K = KIT[id] || CROPS[id] || BEDS[id] || SHRUBS[id]; if (!K) throw new Error('no plant kit model ' + id); return K; };
export function paintPlant(id) {
  const K = specOf(id), R = rng(seedOf(id)), p = new Paint(K.tex[0], K.tex[1]); K.paint(p, R);
  return p.toRGBA(seedOf(id) & 0xffff, K.brush ?? 0.09, K.grain ?? 0.04, K.soften ?? 0);
}

// any kit model (the ground cover, the flower crops, the flower bed, the card shrubs) -> GLB bytes; the bed adds its soil and stones as a second,
// vertex-coloured primitive (smooth normals, double-sided)
export async function buildPlant(id) {
  const K = specOf(id);
  const img = paintPlant(id), g = buildGeometry(K.cards(rng(seedOf(id) ^ 0x9e3779b9)));
  const doc = new Document(), buf = doc.createBuffer(), acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const tex = doc.createTexture(id).setMimeType('image/png').setImage(new Uint8Array(encodePNG(img, { level: 9 })));
  const mat = doc.createMaterial(id).setBaseColorTexture(tex).setAlphaMode('MASK').setAlphaCutoff(0.4).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(false);
  mat.getBaseColorTextureInfo().setWrapS(33071).setWrapT(33071).setMinFilter(9987).setMagFilter(9729);   // clamp: no bleed across card edges
  const prim = doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', acc('VEC3', new Float32Array(g.p))).setAttribute('NORMAL', acc('VEC3', new Float32Array(g.n)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.u))).setIndices(acc('SCALAR', new Uint16Array(g.i)));
  const mesh = doc.createMesh(id).addPrimitive(prim);
  if (K.solid) {
    const s = K.solid(rng(seedOf(id) ^ 0x51ed27)), nrm = new Float32Array(s.n);   // (the solid's own normals: the mound up, the pebbles round)
    const sm = doc.createMaterial(id + '_soil').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(true);
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));   // COLOR_0 is linear
    mesh.addPrimitive(doc.createPrimitive().setMaterial(sm).setAttribute('POSITION', acc('VEC3', new Float32Array(s.p))).setAttribute('NORMAL', acc('VEC3', nrm))
      .setAttribute('COLOR_0', acc('VEC3', new Float32Array(s.c.map(lin)))).setIndices(acc('SCALAR', new Uint16Array(s.i))));
  }
  doc.createScene().addChild(doc.createNode(id).setMesh(mesh));
  return new NodeIO().writeBinary(doc);
}
