// paintedAtlas.mjs -- ONE small painted texture atlas, generated in code, shared by the painted procedural models
// (woodshed, wetland_jetty; the follow-ups reuse it). Owner's choice for these: "painted procedural", so they sit beside the
// Meshy-textured painterly farmhouse instead of reading as flat-shaded colour.
// =============================================================================
// Deterministic: seeded hash noise + mulberry32, no clock, no Math.random; the same bytes every run (jpeg-js is pure JS).
// Colours: palette tokens from art/config/look.config.mjs (assetMaterials.painted_atlas), graded like the flat materials
// (materials.mjs warmedLinear) and painted in sRGB. No hexes here.
//
// Layout (512 x 512 px, glTF uv: u right, v DOWN from the top-left), CELLS below is the source of truth:
//   y   0-160  boards: plank (MutedWood), plank_dark (DarkWood), plank_light (LightWood), plank_grey (weathered) -- 512 x 40 each,
//              one board's face: grain along u, crevice-dark long edges (v), world length 1.2 u along u
//   y 160-224  tiles: one course of terracotta tiles, rounded lower ends at the BOTTOM of the cell (v = 1), 2.0 u along u
//   y 224-256  tiles_trim: TerracottaDark trim / ridge / verge strip, 2.0 u along u
//   y 256-320  bark (DarkWood, furrows along u, 0.5 u) | rings_0..3: four sawn log ends (64 x 64, fit: the circle fills the cell)
//   y 320-448  stone, stone_dark (128 x 128 painted cobbles, 0.6 x 0.6 u) | wet (128 x 64: wet pile timber, u = up the pile, algae
//              band and waterline sheen at u -> 1) | rope (128 x 32, twisted strands along u) | metal (128 x 32, iron band along u)
//              | x 256-512 y 384-448 (the Barnaby trio): cloth (128 x 64, slate-teal robe, folds along u) | canvas (128 x 32,
//              patched tarp) | skin, scarf, blanket, brass (32 x 32 each)
//   y 448-480  the Barnaby trio: block_0..3 (64 x 32, one dry stone's face each, fit), block_moss_0..1 (moss creeping down from the
//              top), moss, paper. The atlas is now full: a new cell means repainting or moving one (and republishing every model)
//   y 480-512  swatches: 12 painted fills of palette tokens, 32 x 32 each (swatch_<Token>), for small parts in any palette colour |
//              x 384-512: soil (128 x 32, the plot's tilled soil: one furrow row across v, seamless along u; 2026-10-25, in the room of
//              four swatches no model used)
//
// API
//   ATLAS_SIZE, CELLS{name: {x, y, w, h, world: [wu|null, wv|null]}}, atlasImage() -> {width, height, data RGBA}, atlasJpeg() -> bytes,
//   atlasTexture(name) -> {name, mimeType, image} for a build()'s `textures`, cellUV(name) -> [u0, v0, u1, v1],
//   mapUV(geometry, spec, {seed, u}) -> NON-INDEXED geometry with atlas uvs (call BEFORE rotating it into place), and
//   shade(geometry, (x, y, z) => k) -> per-vertex colour multiplier (baked ambient occlusion; call AFTER placing it).
//   placer(parts, material, {ao, ground}) -> place(geometry, spec, seed, transform, {u, aoFn, jit}): the five painted models' shared
//   map-place-jitter-shade-push step; sm(a, b, x) the smoothstep they share.
// =============================================================================
import jpeg from 'jpeg-js';
import { Float32BufferAttribute } from 'three';
import LOOK from '../../config/look.config.mjs';
import { mulberry32, jitter } from './jitter.mjs';
import { warmedLinear, PALETTE } from './materials.mjs';

export const ATLAS_SIZE = 512;
export const ATLAS_QUALITY = 90;
// uvs keep INSET px inside a cell. The texture is mipmapped (the game: trilinear, anisotropy 8) and every cell edge is a multiple of
// 8 px, so mip levels 0-2 never read the neighbour; from level 3 (8 px texels) a sample 2 px inside an edge takes ~25 % of the
// neighbouring cell, and from level 4-5 the 32-40 px cells blend with the cells beside them. That is enough for now: those levels
// only show when a model is a few dozen pixels on screen (T4 review: the game-distance panels look fine). A wider inset cannot fix
// level 4+, so when cells are added, put similar colours next to each other (plank_grey sits between plank_light and the tiles)
const S = ATLAS_SIZE, INSET = 2;
const TOK = LOOK.assetMaterials.painted_atlas;

// ---- cells ------------------------------------------------------------------------------------------------------------------
const C = (x, y, w, h, world = [null, null]) => ({ x, y, w, h, world });
export const SWATCHES = TOK.swatches;
export const CELLS = {
  plank: C(0, 0, 512, 40, [1.2, null]),
  plank_dark: C(0, 40, 512, 40, [1.2, null]),
  plank_light: C(0, 80, 512, 40, [1.2, null]),
  plank_grey: C(0, 120, 512, 40, [1.2, null]),
  tiles: C(0, 160, 512, 64, [2.0, null]),
  tiles_trim: C(0, 224, 512, 32, [2.0, null]),
  bark: C(0, 256, 256, 64, [0.5, null]),
  rings_0: C(256, 256, 64, 64), rings_1: C(320, 256, 64, 64), rings_2: C(384, 256, 64, 64), rings_3: C(448, 256, 64, 64),
  stone: C(0, 320, 128, 128, [0.6, 0.6]),
  stone_dark: C(128, 320, 128, 128, [0.6, 0.6]),
  wet: C(256, 320, 128, 64),
  rope: C(384, 320, 128, 32, [0.3, null]),
  metal: C(384, 352, 128, 32, [0.4, null]),
  // the Barnaby trio (wizard, camp, tower ruin), in the space T4 left free
  cloth: C(256, 384, 128, 64),                     // slate-teal robe cloth: fold lines along u (u = up the garment)
  canvas: C(384, 384, 128, 32, [0.7, null]),        // patched tarp canvas, a stitched seam and two patches
  skin: C(384, 416, 32, 32), scarf: C(416, 416, 32, 32), blanket: C(448, 416, 32, 32), brass: C(480, 416, 32, 32),
  block_0: C(0, 448, 64, 32), block_1: C(64, 448, 64, 32), block_2: C(128, 448, 64, 32), block_3: C(192, 448, 64, 32),   // one dry stone each
  block_moss_0: C(256, 448, 64, 32), block_moss_1: C(320, 448, 64, 32),   // a stone face with moss creeping down from its top
  moss: C(384, 448, 64, 32), paper: C(448, 448, 64, 32),
  ...Object.fromEntries(SWATCHES.map((t, i) => [`swatch_${t}`, C(i * 32, 480, 32, 32)])),
  soil: C(384, 480, 128, 32),   // the plot's tilled soil: troughs at v 0 and 1, the crest mid-cell; tiles along u
};

export function cellUV(name) {
  const c = CELLS[name]; if (!c) throw new Error(`paintedAtlas: no cell '${name}'`);
  return [(c.x + INSET) / S, (c.y + INSET) / S, (c.x + c.w - INSET) / S, (c.y + c.h - INSET) / S];
}

// ---- colour -----------------------------------------------------------------------------------------------------------------
const lin2s = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const tokRGB = (k) => warmedLinear(PALETTE[k], k).map(lin2s);
// a token, or [tokenA, tokenB, t]: a mix of two (e.g. the weathered grey-brown = MutedWood toward DarkStone)
export function colour(spec) { if (typeof spec === 'string') return tokRGB(spec); const [a, b, t] = spec; return mix(colour(a), colour(b), t); }   // a mix may nest
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a painter's variation: lightness +-amt and a small warm/cool hue drift
const vary = (c, r, amt) => { const k = 1 + (r() - 0.5) * 2 * amt, w = (r() - 0.5) * amt * 0.6; return [c[0] * k * (1 + w), c[1] * k, c[2] * k * (1 - w)]; };

// ---- noise ------------------------------------------------------------------------------------------------------------------
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16; return (h >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x, y, seed, oct = 3) { let v = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { v += a * vnoise(x * f, y * f, seed + o * 31); n += a; a *= 0.5; f *= 2; } return v / n; }

// ---- the painter: a float sRGB canvas, writes clipped to one cell ----------------------------------------------------------
function painter(B) {
  const idx = (c, x, y) => ((c.y + y) * S + c.x + x) * 3;
  const put = (i, col, a) => { B[i] += (col[0] - B[i]) * a; B[i + 1] += (col[1] - B[i + 1]) * a; B[i + 2] += (col[2] - B[i + 2]) * a; };
  return {
    fill(c, fn) { for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const v = fn(x, y), i = idx(c, x, y); B[i] = v[0]; B[i + 1] = v[1]; B[i + 2] = v[2]; } },
    scale(c, fn) { for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const k = fn(x, y), i = idx(c, x, y); B[i] *= k; B[i + 1] *= k; B[i + 2] *= k; } },
    // a soft elliptical brush dab (rx along the angle, ry across it)
    dab(c, cx, cy, rx, ry, ang, col, a) {
      const R = Math.max(rx, ry) + 1, co = Math.cos(ang), si = Math.sin(ang);
      for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(c.h - 1, Math.ceil(cy + R)); y++)
        for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(c.w - 1, Math.ceil(cx + R)); x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, u = (dx * co + dy * si) / rx, v = (-dx * si + dy * co) / ry, t = Math.sqrt(u * u + v * v);
          if (t < 1) put(idx(c, x, y), col, a * (1 - smooth(0.4, 1, t)));
        }
    },
    // strokes go into a mask first (max, not summed), then one blend: a line never darkens where it crosses itself
    mask(c) { return new Float32Array(c.w * c.h); },
    line(M, c, pts, r, a, keep = null) {
      for (let k = 0; k + 1 < pts.length; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; if (keep && !keep((x0 + x1) / 2, (y0 + y1) / 2)) continue;
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
        for (let y = Math.max(0, Math.floor(Math.min(y0, y1) - r - 1)); y <= Math.min(c.h - 1, Math.ceil(Math.max(y0, y1) + r + 1)); y++)
          for (let x = Math.max(0, Math.floor(Math.min(x0, x1) - r - 1)); x <= Math.min(c.w - 1, Math.ceil(Math.max(x0, x1) + r + 1)); x++) {
            const px = x + 0.5, py = y + 0.5, t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2)), d = Math.hypot(px - x0 - t * dx, py - y0 - t * dy);
            if (d < r) { const w = a * (1 - smooth(r * 0.35, r, d)), j = y * c.w + x; if (w > M[j]) M[j] = w; }
          }
      }
    },
    apply(c, M, col) { for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const a = M[y * c.w + x]; if (a > 0) put(idx(c, x, y), col, a); } },
    // soften (3 x 3 box, half strength): painterly, and kinder to the JPEG
    soften(c, s = 0.5) {
      const o = new Float32Array(c.w * c.h * 3);
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) for (let q = 0; q < 3; q++) {
        let v = 0, n = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= c.w || yy >= c.h) continue; v += B[idx(c, xx, yy) + q]; n++; }
        o[(y * c.w + x) * 3 + q] = v / n;
      }
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) for (let q = 0; q < 3; q++) { const i = idx(c, x, y) + q; B[i] += (o[(y * c.w + x) * 3 + q] - B[i]) * s; }
    },
  };
}

// ---- cell painters ----------------------------------------------------------------------------------------------------------
// one board: soft blotches stretched along the grain, brush strokes, broken dark grain lines, a knot or two, crevice-dark edges
function paintBoard(P, c, base, seed, { knots = 2, cracks = 0, dry = 0 } = {}) {
  const r = mulberry32(seed);
  P.fill(c, (x, y) => mul(base, 0.84 + 0.22 * fbm(x / 46, y / 6, seed, 3) + 0.12 * (fbm(x / 150, y / 40, seed + 5, 2) - 0.5)));
  for (let i = 0; i < (c.w * c.h) / 70; i++) P.dab(c, r() * c.w, r() * c.h, 8 + r() * 30, 1.2 + r() * 2.2, (r() - 0.5) * 0.08, vary(base, r, 0.12), 0.1 + r() * 0.2);
  for (let i = 0; i < dry; i++) P.dab(c, r() * c.w, c.h * (0.2 + r() * 0.6), 20 + r() * 40, 1 + r() * 1.5, 0, mix(base, [0.85, 0.82, 0.76], 0.35), 0.35);
  const M = P.mask(c), n = Math.round(c.h / 5.5);
  for (let k = 0; k < n; k++) {
    const y0 = (k + 0.25 + r() * 0.5) * (c.h / n), amp = 0.5 + r() * 1.5, f = 0.008 + r() * 0.025, ph = r() * 6.283, pts = [];
    for (let x = -6; x <= c.w + 6; x += 5) pts.push([x, y0 + amp * Math.sin(x * f + ph) + (fbm(x / 28, k * 1.7, seed + 9, 2) - 0.5) * 2.5]);
    P.line(M, c, pts, 0.65 + r() * 0.55, 0.3 + r() * 0.35, (x) => fbm(x / 36, k * 3.1, seed + 11, 2) > 0.36);
  }
  P.apply(c, M, mul(base, 0.52));
  for (let k = 0; k < cracks; k++) { const M2 = P.mask(c), x0 = r() * c.w, y0 = c.h * (0.3 + r() * 0.4), L = 30 + r() * 70, pts = [];
    for (let t = 0; t <= 1.0001; t += 0.1) pts.push([x0 + t * L, y0 + (r() - 0.5) * 1.6]); P.line(M2, c, pts, 0.9, 0.75); P.apply(c, M2, mul(base, 0.38)); }
  for (let k = 0; k < knots; k++) { const cx = 20 + r() * (c.w - 40), cy = c.h * (0.32 + r() * 0.36), s = 2 + r() * 2.2;
    P.dab(c, cx, cy, s * 2.4, s * 1.25, 0, mul(base, 0.62), 0.7); P.dab(c, cx, cy, s * 1.1, s * 0.65, 0, mul(base, 0.36), 0.9); }
  // the long edges: a crevice shadow on both, deeper on the lower; a painted bevel highlight just inside the upper one
  P.scale(c, (x, y) => { const top = y + 0.5, bot = c.h - y - 0.5; let k = 1;
    k *= 0.6 + 0.4 * smooth(0, 4.5, top); k *= 0.52 + 0.48 * smooth(0, 6, bot); if (top > 2.5 && top < 5.5) k *= 1.08; return k; });
  P.soften(c, 0.45);
}

// one course of tiles: individually varied tiles with rounded lower ends over the shadowed course below
function paintTiles(P, c, base, dark, seed) {
  const r = mulberry32(seed), tiles = [];
  for (let x = 0; x < c.w;) { const w = 26 + r() * 10; tiles.push({ x0: x, x1: Math.min(c.w, x + w), bot: c.h - 5 - r() * 6, col: vary(base, r, 0.13), lean: (r() - 0.5) * 0.08 }); x += w; }
  const col = new Int16Array(c.w); tiles.forEach((t, i) => { for (let x = Math.floor(t.x0); x < Math.min(c.w, Math.ceil(t.x1)); x++) col[x] = i; });
  const RR = 8;
  P.fill(c, (x, y) => {
    const t = tiles[col[x]], lx = x + 0.5 - t.x0, w = t.x1 - t.x0, rx = Math.min(lx, w - lx) - 1.2;   // px from the tile's side gap
    const bot = t.bot + t.lean * (lx - w / 2);
    let inside = rx > 0 && y + 0.5 < bot, edge = Math.min(rx, bot - y - 0.5);
    if (inside && y + 0.5 > bot - RR && rx < RR) { const d = Math.hypot(RR - rx, y + 0.5 - (bot - RR)); inside = d < RR; edge = Math.min(edge, RR - d); }
    if (!inside) { const below = y + 0.5 - bot; return mul(dark, (0.58 + 0.1 * fbm(x / 9, y / 4, seed + 1, 2)) * (below > 0 && below < 5 ? 0.78 + 0.22 * below / 5 : 1)); }
    const v = (y + 0.5) / bot, s = lx / w;
    let k = 0.76 + 0.3 * smooth(0.0, 0.5, v) + 0.06 * smooth(0.55, 0.85, v);   // the top in the course above's shadow, the lower half lit
    k *= 1.05 - 0.16 * (s - 0.35) * (s - 0.35);                                  // a curved tile: lit on its left, turning away on its right
    k *= 0.93 + 0.14 * fbm(x / 10, y / 14, seed + 2, 3);
    if (edge < 1.6) k *= 0.72 + 0.28 * (edge / 1.6);                              // a painted dark rim
    return mul(t.col, k);
  });
  for (let i = 0; i < (c.w * c.h) / 60; i++) { const x = r() * c.w, y = r() * c.h * 0.9, t = tiles[col[Math.min(c.w - 1, Math.floor(x))]];
    if (y > t.bot - 3) continue; P.dab(c, x, y, 1.2 + r() * 2, 3 + r() * 6, 0, vary(t.col, r, 0.1), 0.12 + r() * 0.16); }
  P.soften(c, 0.35);
}

function paintTrim(P, c, base, seed) {
  const r = mulberry32(seed);
  P.fill(c, (x, y) => mul(base, 0.86 + 0.2 * fbm(x / 22, y / 8, seed, 3)));
  for (let i = 0; i < (c.w * c.h) / 50; i++) P.dab(c, r() * c.w, r() * c.h, 3 + r() * 9, 1.5 + r() * 2.5, 0, vary(base, r, 0.12), 0.15 + r() * 0.15);
  let x = 0; const M = P.mask(c); while (x < c.w) { x += 34 + r() * 14; P.line(M, c, [[x, 0], [x + (r() - 0.5) * 2, c.h]], 0.9, 0.7); }
  P.apply(c, M, mul(base, 0.55));
  P.scale(c, (x, y) => { const top = y + 0.5, bot = c.h - y - 0.5; return (0.62 + 0.38 * smooth(0, 4, top)) * (0.55 + 0.45 * smooth(0, 5, bot)) * (top > 2 && top < 6 ? 1.1 : 1); });
  P.soften(c, 0.4);
}

function paintBark(P, c, base, seed) {
  const r = mulberry32(seed);
  P.fill(c, (x, y) => { const f = fbm(x / 70, y / 2.6, seed + 3, 3); let k = 0.8 + 0.34 * fbm(x / 26, y / 4, seed, 3);
    if (f < 0.4) k *= 0.62 + 0.38 * smooth(0.28, 0.4, f); if (f > 0.62) k *= 1 + 0.2 * smooth(0.62, 0.78, f); return mul(base, k); });
  for (let i = 0; i < (c.w * c.h) / 45; i++) P.dab(c, r() * c.w, r() * c.h, 5 + r() * 16, 1 + r() * 1.8, (r() - 0.5) * 0.1, vary(base, r, 0.16), 0.12 + r() * 0.18);
  for (let i = 0; i < 40; i++) P.dab(c, r() * c.w, r() * c.h, 2 + r() * 4, 1, 0, mul(base, 1.35), 0.3);   // lichen-pale flecks
  P.soften(c, 0.35);
}

function paintRings(P, c, wood, bark, seed, crack) {
  const r = mulberry32(seed), cx = c.w / 2 + (r() - 0.5) * 7, cy = c.h / 2 + (r() - 0.5) * 7, R = c.w / 2, sp = 3.6 + r() * 1.2, ph = r() * 6.283, ca = r() * 6.283;
  const sap = mul(wood, 1.08), heart = mix(wood, bark, 0.18);
  P.fill(c, (x, y) => {
    const px = x + 0.5, py = y + 0.5, rr = Math.hypot(px - c.w / 2, py - c.h / 2), th = Math.atan2(py - c.h / 2, px - c.w / 2);
    const wob = 1 + 0.05 * Math.sin(3 * th + ph) + 0.06 * (fbm(Math.cos(th) * 2 + 5, Math.sin(th) * 2 + 5, seed, 2) - 0.5);
    if (rr * wob > R * 0.83) return mul(bark, 0.72 + 0.3 * fbm(px / 3, py / 3, seed + 4, 2));                  // bark rim
    if (rr * wob > R * 0.76) return mul(mix(wood, bark, 0.55), 0.85);                                          // cambium
    const dp = Math.hypot(px - cx, py - cy), d2 = dp * (1 + 0.07 * Math.sin(2 * Math.atan2(py - cy, px - cx) + ph));
    let col = mix(heart, sap, smooth(R * 0.25, R * 0.7, dp));
    const ring = 0.5 + 0.5 * Math.cos((d2 / sp) * 6.283);
    let k = (1 - 0.28 * smooth(0.72, 0.98, ring)) * (0.92 + 0.1 * fbm(px / 5, py / 5, seed + 6, 2)) * (1.04 - 0.14 * smooth(R * 0.45, R * 0.78, rr));
    if (crack) { let da = Math.abs(Math.atan2(py - cy, px - cx) - ca); if (da > Math.PI) da = 2 * Math.PI - da; if (dp > 3 && dp < R * 0.72 && da * dp < 0.9 + dp * 0.03) k *= 0.45; }
    if (dp < 1.8) k *= 0.55;
    return mul(col, k);
  });
  for (let i = 0; i < 26; i++) { const a = r() * 6.283, d = r() * R * 0.7; P.dab(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + r() * 4, 1.5 + r() * 2, a + 1.57, vary(wood, r, 0.1), 0.18); }
  P.soften(c, 0.4);
}

function paintStone(P, c, base, seed) {
  const r = mulberry32(seed), g = 4, pts = [];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) pts.push({ x: (i + 0.2 + r() * 0.6) * (c.w / g), y: (j + 0.2 + r() * 0.6) * (c.h / g), col: vary(base, r, 0.12) });
  const mortar = mul(base, 0.6);
  P.fill(c, (x, y) => {
    const px = x + 0.5, py = y + 0.5; let d1 = 1e9, d2 = 1e9, n1 = null;
    for (const p of pts) { const d = Math.hypot(px - p.x, (py - p.y) * 1.25); if (d < d1) { d2 = d1; d1 = d; n1 = p; } else if (d < d2) d2 = d; }
    const edge = (d2 - d1) / 2;
    if (edge < 1.3) return mul(mortar, 0.9 + 0.2 * fbm(px / 4, py / 4, seed + 1, 2));
    const lit = (-(px - n1.x) * 0.6 - (py - n1.y) * 0.8) / 14;                       // each stone lit from the upper left
    const k = (0.72 + 0.28 * smooth(1.3, 7, edge)) * (1 + 0.1 * Math.max(-1, Math.min(1, lit))) * (0.93 + 0.14 * fbm(px / 7, py / 7, seed + 2, 3));
    return mul(n1.col, k);
  });
  for (let i = 0; i < (c.w * c.h) / 40; i++) P.dab(c, r() * c.w, r() * c.h, 2 + r() * 5, 2 + r() * 4, r() * 3, vary(base, r, 0.1), 0.12);
  P.soften(c, 0.4);
}

function paintWet(P, c, base, algae, seed) {   // u (x) runs UP the pile: x = 0 at the bottom, x = w at the waterline
  const r = mulberry32(seed);
  P.fill(c, (x, y) => { const u = (x + 0.5) / c.w; let col = mul(base, 0.78 + 0.3 * fbm(x / 34, y / 3, seed, 3));
    col = mix(col, mul(algae, 0.85 + 0.25 * fbm(x / 6, y / 6, seed + 2, 2)), 0.75 * smooth(0.66, 0.84, u) * (1 - smooth(0.9, 0.96, u)));
    if (u > 0.95) col = mul(col, 1.18); return mul(col, 0.8 + 0.2 * u); });
  for (let i = 0; i < 60; i++) P.dab(c, r() * c.w, r() * c.h, 6 + r() * 14, 1 + r() * 1.5, 0, vary(base, r, 0.15), 0.18);
  P.soften(c, 0.4);
}

function paintRope(P, c, base, seed) {
  P.fill(c, (x, y) => { const s = (x + y * 0.9) / 7.5, t = s - Math.floor(s);
    let k = 0.7 + 0.38 * Math.sin(Math.PI * t); if (t < 0.1) k *= 0.6; k *= 0.92 + 0.14 * fbm(x / 3, y / 3, seed, 2);
    const e = Math.min(y + 0.5, c.h - y - 0.5); k *= 0.7 + 0.3 * smooth(0, 6, e); return mul(base, k); });
  P.soften(c, 0.3);
}

function paintMetal(P, c, base, rust, seed) {
  const r = mulberry32(seed);
  P.fill(c, (x, y) => { const v = (y + 0.5) / c.h; let k = 0.82 + 0.5 * Math.exp(-(((v - 0.32) / 0.16) ** 2)) - 0.18 * smooth(0.75, 1, v);
    k *= 0.92 + 0.14 * fbm(x / 20, y / 3, seed, 3); return mul(base, k); });
  for (let i = 0; i < 18; i++) P.dab(c, r() * c.w, r() * c.h, 3 + r() * 8, 2 + r() * 3, 0, rust, 0.22);
  for (let x = 14; x < c.w; x += 36) { P.dab(c, x, c.h * 0.5, 2.4, 2.4, 0, mul(base, 0.6), 0.9); P.dab(c, x - 0.6, c.h * 0.5 - 0.6, 1.1, 1.1, 0, mul(base, 1.7), 0.8); }
  P.soften(c, 0.35);
}

function paintSwatch(P, c, base, seed) {
  const r = mulberry32(seed);
  P.fill(c, (x, y) => mul(base, 0.9 + 0.16 * fbm(x / 9, y / 9, seed, 3)));
  for (let i = 0; i < 22; i++) P.dab(c, r() * c.w, r() * c.h, 3 + r() * 6, 2 + r() * 4, r() * 3, vary(base, r, 0.1), 0.2);
  P.scale(c, (x, y) => { const e = Math.min(x + 0.5, y + 0.5, c.w - x - 0.5, c.h - y - 0.5); return 0.84 + 0.16 * smooth(0, 3, e); });
  P.soften(c, 0.4);
}

// ---- the Barnaby trio's cells -----------------------------------------------------------------------------------------------
// robe cloth: soft fold lines running along u (up the garment), lit ridges and shadowed hollows, brush strokes along them
function paintCloth(P, c, base, seed) {
  const r = mulberry32(seed);
  P.fill(c, (x, y) => { const f = Math.sin((y / c.h) * 6.283 * 3.2 + 2.2 * fbm(x / 40, y / 18, seed, 2)) ;
    return mul(base, (0.9 + 0.12 * f) * (0.92 + 0.14 * fbm(x / 22, y / 7, seed + 3, 3))); });
  for (let i = 0; i < (c.w * c.h) / 40; i++) P.dab(c, r() * c.w, r() * c.h, 6 + r() * 16, 1 + r() * 1.6, (r() - 0.5) * 0.12, vary(base, r, 0.12), 0.14 + r() * 0.16);
  const M = P.mask(c); for (let k = 0; k < 5; k++) { const y0 = (k + 0.3 + r() * 0.4) * (c.h / 5), pts = []; for (let x = -4; x <= c.w + 4; x += 6) pts.push([x, y0 + 1.6 * Math.sin(x * 0.03 + k) + (fbm(x / 20, k, seed + 7, 2) - 0.5) * 3]);
    P.line(M, c, pts, 0.9, 0.35, (x) => fbm(x / 30, k * 2.3, seed + 9, 2) > 0.4); }
  P.apply(c, M, mul(base, 0.62));
  P.soften(c, 0.45);
}
// tarp canvas: a faint weave, water stains, a stitched seam across and two sewn-on patches
function paintCanvas(P, c, base, patch, seed) {
  const r = mulberry32(seed);
  P.fill(c, (x, y) => mul(base, (0.9 + 0.12 * fbm(x / 30, y / 10, seed, 3)) * (0.97 + 0.03 * ((x + y) % 3 === 0 ? 1 : 0)) * (0.96 + 0.06 * ((x * 3 + y) % 4 === 0 ? 1 : 0))));
  for (let i = 0; i < 26; i++) P.dab(c, r() * c.w, r() * c.h, 6 + r() * 14, 3 + r() * 6, r() * 3, mul(base, 0.84), 0.18);
  for (const [px, pw2, py, ph] of [[22, 26, 6, 15], [80, 22, 14, 14]]) {
    P.fill({ x: c.x + px, y: c.y + py, w: pw2, h: ph }, (x, y) => mul(patch, 0.9 + 0.14 * fbm(x / 6, y / 6, seed + px, 2)));
    const M = P.mask(c); for (let k = 0; k < pw2; k += 3) { P.line(M, c, [[px + k, py + 1], [px + k + 1.4, py + 1]], 0.55, 0.8); P.line(M, c, [[px + k, py + ph - 1], [px + k + 1.4, py + ph - 1]], 0.55, 0.8); }
    for (let k = 0; k < ph; k += 3) { P.line(M, c, [[px + 1, py + k], [px + 1, py + k + 1.4]], 0.55, 0.8); P.line(M, c, [[px + pw2 - 1, py + k], [px + pw2 - 1, py + k + 1.4]], 0.55, 0.8); }
    P.apply(c, M, mul(patch, 0.5)); }
  const M = P.mask(c); P.line(M, c, [[-2, 23], [c.w + 2, 24]], 0.8, 0.55); P.apply(c, M, mul(base, 0.6));
  P.scale(c, (x, y) => 0.8 + 0.2 * smooth(0, 3, Math.min(y + 0.5, c.h - y - 0.5)));
  P.soften(c, 0.4);
}
// knitted scarf: rust with two golden stripes across it, knit rows along v
function paintScarf(P, c, base, stripe, seed) {
  P.fill(c, (x, y) => { const sx = (x + 0.5) / c.w, st = (sx > 0.22 && sx < 0.34) || (sx > 0.62 && sx < 0.74);
    const knit = 0.86 + 0.16 * Math.abs(Math.sin((y + (x % 4 < 2 ? 0 : 1.5)) * 1.05)); return mul(st ? stripe : base, knit * (0.93 + 0.12 * fbm(x / 5, y / 5, seed, 2))); });
  P.soften(c, 0.35);
}
// a check wool blanket: dark green ground, warm crossing bands
function paintBlanket(P, c, base, check, seed) {
  P.fill(c, (x, y) => { const bx = (x % 16) < 4, by = (y % 16) < 4, t = (bx ? 0.5 : 0) + (by ? 0.5 : 0);
    const col = mix(base, check, t * 0.9); return mul(col, 0.9 + 0.14 * fbm(x / 4, y / 4, seed, 2)); });
  P.soften(c, 0.3);
}
// brass: a warm polished band, a bright highlight high up, darker toward the edges
function paintBrass(P, c, base, seed) {
  P.fill(c, (x, y) => { const v = (y + 0.5) / c.h; return mul(base, (0.8 + 0.55 * Math.exp(-(((v - 0.3) / 0.14) ** 2)) - 0.2 * smooth(0.7, 1, v)) * (0.94 + 0.1 * fbm(x / 6, y / 6, seed, 2))); });
  P.soften(c, 0.3);
}
function paintSkin(P, c, base, seed) {
  const r = mulberry32(seed);
  P.fill(c, (x, y) => mul(base, 0.95 + 0.08 * fbm(x / 10, y / 10, seed, 2)));
  for (let i = 0; i < 10; i++) P.dab(c, r() * c.w, r() * c.h, 4 + r() * 6, 3 + r() * 4, r() * 3, vary(base, r, 0.06), 0.2);
  P.soften(c, 0.4);
}
// one dry stone's face: a rounded slab with a dark gap round it, lit from the upper left, cracks, lichen spots; moss = 0 | 1 creeps
// moss down from the top (image up = world up on standing faces)
function paintBlock(P, c, base, mossCol, lichen, seed, moss = 0) {
  const r = mulberry32(seed), R = 7, inset = 1.6 + r() * 0.8, gap = mul(base, 0.42), ox = (r() - 0.5) * 2, oy = (r() - 0.5) * 1.5;
  P.fill(c, (x, y) => {
    const px = x + 0.5, py = y + 0.5, hx = c.w / 2 - inset, hy = c.h / 2 - inset, dx = Math.max(0, Math.abs(px - c.w / 2 - ox * 0.3) - (hx - R)), dy = Math.max(0, Math.abs(py - c.h / 2 - oy * 0.3) - (hy - R));
    const d = Math.hypot(dx, dy) - R + 1.2 * (fbm(px / 5, py / 5, seed + 2, 2) - 0.5) * 2;
    if (d > 0) return mul(gap, 0.9 + 0.2 * fbm(px / 3, py / 3, seed + 1, 2));
    const e = -d, lit = (-(px - c.w / 2) / c.w) * 0.12 - ((py - c.h / 2) / c.h) * 0.22;
    return mul(base, (0.74 + 0.26 * smooth(0, 4.5, e)) * (1 + lit) * (0.88 + 0.22 * fbm(px / 9, py / 6, seed + 3, 3)));
  });
  for (let i = 0; i < 40; i++) P.dab(c, r() * c.w, r() * c.h, 2 + r() * 6, 1.5 + r() * 3, r() * 3, vary(base, r, 0.1), 0.16);
  const M = P.mask(c); if (r() < 0.7) { const x0 = 10 + r() * (c.w - 20), pts = []; for (let t = 0; t <= 1.0001; t += 0.2) pts.push([x0 + t * (r() - 0.3) * 12, 4 + t * (c.h - 10)]); P.line(M, c, pts, 0.7, 0.6); }
  P.apply(c, M, mul(base, 0.45));
  for (let i = 0; i < 9; i++) { const lx = 6 + r() * (c.w - 12), ly = 5 + r() * (c.h - 10), s = 1.2 + r() * 2.2; P.dab(c, lx, ly, s, s * 0.8, r() * 3, vary(lichen, r, 0.12), 0.75); }
  if (moss) P.fill(c, (x, y) => { const i = ((c.y + y) * S + c.x + x) * 3, cur = [B_[i], B_[i + 1], B_[i + 2]];
    const edge = 9 + 6 * fbm(x / 7, 3, seed + 5, 2) + (fbm(x / 2.5, 9, seed + 6, 1) > 0.7 ? 5 : 0), a = 1 - smooth(edge - 2, edge + 1.5, y + 0.5);
    return a > 0 ? mix(cur, mul(mossCol, 0.82 + 0.3 * fbm(x / 3, y / 3, seed + 8, 2)), a) : cur; });
  P.soften(c, 0.35);
}
let B_ = null;   // the canvas, for painters that read back (the moss over a stone)
function paintMoss(P, c, base, stone, seed) {
  const r = mulberry32(seed);
  P.fill(c, (x, y) => { const f = fbm(x / 8, y / 8, seed, 3); return f < 0.3 ? mul(stone, 0.8 + 0.2 * f) : mul(base, 0.75 + 0.45 * fbm(x / 3, y / 3, seed + 2, 2)); });
  for (let i = 0; i < 60; i++) P.dab(c, r() * c.w, r() * c.h, 1.5 + r() * 3, 1.5 + r() * 3, 0, mul(base, 1.15 + r() * 0.2), 0.4);
  P.soften(c, 0.35);
}
// paper: page edges, fine lines along u, a little foxing
function paintPaper(P, c, base, seed) {
  const r = mulberry32(seed);
  P.fill(c, (x, y) => mul(base, (0.93 + 0.06 * fbm(x / 12, y / 4, seed, 2)) * (y % 3 === 0 ? 0.9 : 1)));
  for (let i = 0; i < 6; i++) P.dab(c, r() * c.w, r() * c.h, 3 + r() * 5, 2 + r() * 3, 0, mul(base, 0.85), 0.25);
  P.soften(c, 0.25);
}

// tilled soil (the plot): one furrow row across v, the troughs at the top and bottom edges in the shade colour, the crest along the
// middle toward the dry colour, crumbly clods lit on top and shaded below, a few pebbles; seamless along u (the plot repeats it)
function paintSoil(P, c, bed, shadeCol, dry, seed) {
  const r = mulberry32(seed), W = c.w;
  const wrapN = (x, y) => ((W - x) * fbm(x / 9, y / 5, seed, 3) + x * fbm((x - W) / 9, y / 5, seed, 3)) / W;   // seamless across the u wrap
  P.fill(c, (x, y) => { const crest = Math.sin(Math.PI * (y + 0.5) / c.h);
    return mul(mix(mix(shadeCol, bed, smooth(0, 0.55, crest)), dry, 0.7 * smooth(0.6, 1, crest)), 0.86 + 0.26 * wrapN(x, y)); });
  const clod = (x, y, rx, ry, col, a) => { for (const ox of [0, -W, W]) if (x + ox > -rx - 2 && x + ox < W + rx + 2) P.dab(c, x + ox, y, rx, ry, 0, col, a); };
  for (let i = 0; i < 140; i++) { const x = r() * W, y = r() * c.h, crest = Math.sin(Math.PI * (y + 0.5) / c.h);
    clod(x, y, 1.6 + r() * 2.6, 1.1 + r() * 1.6, vary(mix(shadeCol, dry, crest * 0.8 + r() * 0.2), r, 0.1), 0.35 + r() * 0.35); }
  for (let i = 0; i < 26; i++) { const x = r() * W, y = c.h * (0.3 + r() * 0.4); clod(x, y - 0.6, 1.2, 0.7, mul(dry, 1.12), 0.45); clod(x, y + 0.7, 1.3, 0.7, mul(shadeCol, 0.85), 0.35); }
  for (let i = 0; i < 6; i++) clod(r() * W, r() * c.h, 0.9 + r() * 0.6, 0.7, mix(dry, [0.8, 0.76, 0.68], 0.5), 0.7);
  P.soften(c, 0.35);
}

// ---- the atlas --------------------------------------------------------------------------------------------------------------
let IMAGE = null, JPEG = null;
export function atlasImage() {
  if (IMAGE) return IMAGE;
  const B = new Float32Array(S * S * 3).fill(0.5), P = painter(B), K = (n) => colour(TOK[n]);
  paintBoard(P, CELLS.plank, K('plank'), 101, { knots: 2, cracks: 1 });
  paintBoard(P, CELLS.plank_dark, K('plankDark'), 102, { knots: 2, cracks: 1 });
  paintBoard(P, CELLS.plank_light, K('plankLight'), 103, { knots: 1 });
  paintBoard(P, CELLS.plank_grey, K('plankGrey'), 104, { knots: 2, cracks: 3, dry: 6 });
  paintTiles(P, CELLS.tiles, K('tiles'), K('tilesTrim'), 201);
  paintTrim(P, CELLS.tiles_trim, K('tilesTrim'), 202);
  paintBark(P, CELLS.bark, K('bark'), 301);
  for (let i = 0; i < 4; i++) paintRings(P, CELLS[`rings_${i}`], K('rings'), K('bark'), 310 + i, i % 2 === 1);
  paintStone(P, CELLS.stone, K('stone'), 401);
  paintStone(P, CELLS.stone_dark, K('stoneDark'), 402);
  paintWet(P, CELLS.wet, K('wet'), K('algae'), 501);
  paintRope(P, CELLS.rope, K('rope'), 601);
  paintMetal(P, CELLS.metal, K('metal'), K('rust'), 701);
  B_ = B;
  paintCloth(P, CELLS.cloth, K('cloth'), 901);
  paintCanvas(P, CELLS.canvas, K('canvas'), K('canvasPatch'), 902);
  paintSkin(P, CELLS.skin, K('skin'), 903);
  paintScarf(P, CELLS.scarf, K('scarf'), K('scarfStripe'), 904);
  paintBlanket(P, CELLS.blanket, K('blanket'), K('blanketCheck'), 905);
  paintBrass(P, CELLS.brass, K('brass'), 906);
  for (let i = 0; i < 4; i++) paintBlock(P, CELLS[`block_${i}`], i < 2 ? mix(K('block'), K('blockDark'), i * 0.35) : mix(K('blockDark'), K('block'), (i - 2) * 0.3), K('moss'), K('lichen'), 910 + i);
  for (let i = 0; i < 2; i++) paintBlock(P, CELLS[`block_moss_${i}`], mix(K('block'), K('blockDark'), 0.3 + i * 0.4), K('moss'), K('lichen'), 920 + i, 1);
  paintMoss(P, CELLS.moss, K('moss'), K('blockDark'), 930);
  paintPaper(P, CELLS.paper, K('paper'), 931);
  paintSoil(P, CELLS.soil, K('soil'), K('soilShade'), K('soilDry'), 940);
  B_ = null;
  SWATCHES.forEach((t, i) => paintSwatch(P, CELLS[`swatch_${t}`], colour(t), 800 + i));
  const data = new Uint8Array(S * S * 4);
  for (let i = 0, j = 0; i < S * S * 3; i += 3, j += 4) { for (let q = 0; q < 3; q++) data[j + q] = Math.max(0, Math.min(255, Math.round(B[i + q] * 255))); data[j + 3] = 255; }
  return (IMAGE = { width: S, height: S, data });
}
export function atlasJpeg() { return (JPEG ??= new Uint8Array(jpeg.encode(atlasImage(), ATLAS_QUALITY).data)); }
// for a build()'s `textures`: { <material name>: atlasTexture(`${id}_albedo`) } (lib/builder.mjs makes it one textured material)
export function atlasTexture(name) { return { name, mimeType: 'image/jpeg', image: atlasJpeg() }; }

// ---- uv mapping -------------------------------------------------------------------------------------------------------------
// Per triangle: its dominant LOCAL axis picks the cell (spec = a cell name, or {x, y, z, rest} by that axis) and the projection
// (the other two axes). u runs along the longer of those two axes of the WHOLE part (opts.u: 'x' | 'y' | 'z' forces it when it is
// one of them), so grain runs along a board and bark along a log. Each axis then spans the part's extent: the whole cell when the
// cell's world size on that axis is null ("fit"), else a window of extent / world of it at a seeded offset (constant texel
// density, and every board shows a different stretch of grain). A face standing up gets the image's top at its top.
const AX = { x: 0, y: 1, z: 2 };
export function mapUV(geometry, spec, opts = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const P = g.attributes.position.array, n = P.length / 3, uv = new Float32Array(n * 2);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let q = 0; q < 3; q++) { mn[q] = Math.min(mn[q], P[i * 3 + q]); mx[q] = Math.max(mx[q], P[i * 3 + q]); }
  const ext = mx.map((v, q) => Math.max(1e-6, v - mn[q])), r = mulberry32((opts.seed ?? 1) * 7919 + 13), offs = new Map(), fu = opts.u != null ? AX[opts.u] : -1;
  for (let t = 0; t < n; t += 3) {
    const a = t * 3, e1 = [P[a + 3] - P[a], P[a + 4] - P[a + 1], P[a + 5] - P[a + 2]], e2 = [P[a + 6] - P[a], P[a + 7] - P[a + 1], P[a + 8] - P[a + 2]];
    const nn = [Math.abs(e1[1] * e2[2] - e1[2] * e2[1]), Math.abs(e1[2] * e2[0] - e1[0] * e2[2]), Math.abs(e1[0] * e2[1] - e1[1] * e2[0])];
    const d = nn[0] >= nn[1] && nn[0] >= nn[2] ? 0 : nn[1] >= nn[2] ? 1 : 2, key = 'xyz'[d];
    const name = typeof spec === 'string' ? spec : spec[key] ?? spec.rest, cell = CELLS[name];
    if (!cell) throw new Error(`paintedAtlas.mapUV: no cell '${name}' (${key} faces)`);
    const oth = [0, 1, 2].filter((q) => q !== d), ua = oth.includes(fu) ? fu : ext[oth[0]] >= ext[oth[1]] ? oth[0] : oth[1], va = oth.find((q) => q !== ua);
    const wu = cell.world[0] ? Math.min(1, ext[ua] / cell.world[0]) : 1, wv = cell.world[1] ? Math.min(1, ext[va] / cell.world[1]) : 1;
    const ok = `${name}|${d}`; if (!offs.has(ok)) offs.set(ok, [r() * (1 - wu), r() * (1 - wv)]); const [ou, ov] = offs.get(ok);
    const [u0, v0, u1, v1] = cellUV(name);
    for (let k = 0; k < 3; k++) {
      const i = t + k; let su = (P[i * 3 + ua] - mn[ua]) / ext[ua], sv = (P[i * 3 + va] - mn[va]) / ext[va];
      if (va === 1) sv = 1 - sv;   // standing faces: image up = world up
      uv[i * 2] = u0 + (ou + su * wu) * (u1 - u0); uv[i * 2 + 1] = v0 + (ov + sv * wv) * (v1 - v0);
    }
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.userData.atlas = true;
  return g;
}

// baked ambient occlusion: a grey per-vertex multiplier from the vertex's PLACED position (glTF COLOR_0 multiplies the texture)
export function shade(geometry, fn) {
  const P = geometry.attributes.position.array, n = P.length / 3, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = Math.max(0, Math.min(1, fn(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]))); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
  geometry.setAttribute('color', new Float32BufferAttribute(col, 3));
  return geometry;
}

// ---- shared by the painted models -------------------------------------------------------------------------------------------
// smoothstep
export function sm(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
// place(geometry, spec, seed, transform, {u, aoFn, jit}): map the part's uvs in its own frame, place it (transform may return a new
// geometry), nudge it a little by hand (jitter; with `ground`, never below the ground), bake its shade (aoFn, default `ao`) and push
// it onto `parts` with the one painted material
export function placer(parts, material, { ao = () => 1, ground = false } = {}) {
  const jopts = ground ? { filter: (x, y) => y > 1e-4 } : undefined;
  return (g, spec, seed, fn, { u, aoFn = ao, jit = 0 } = {}) => {
    let m = mapUV(g, spec, { seed, u }); m = fn(m) || m;
    if (jit) jitter(m, jit, seed, jopts);
    shade(m, aoFn); parts.push({ material, geometry: m }); return m;
  };
}

export default { ATLAS_SIZE, CELLS, SWATCHES, cellUV, colour, atlasImage, atlasJpeg, atlasTexture, mapUV, shade, sm, placer };
