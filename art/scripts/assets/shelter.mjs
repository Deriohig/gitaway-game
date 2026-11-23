// shelter -- the meadow's open sheep lean-to (structure, <= 600 tris; art/specs/2026-10-25-shelter-hare-design.md section 2, ASSETS.md
// `shelter`: "open sheep lean-to, 1.4 x 1.1 and ~1.35 tall, with a terracotta roof and a hay bale"). Published twice, as `shelter` and,
// byte for byte, as `sheep_shelter` (ASSETS.md: "ship the identical file under this id too"). PAINTED procedural on the shared painted
// atlas (lib/paintedAtlas.mjs), the woodshed's and Barnaby's camp's family: one textured material, root node only. Origin at the base
// centre on y 0; the open front faces +Z (the game: Isles.tsx MEADOW.shelter, rotation 0.7, front to the default camera, like the
// stand-in). Posts 1.24 x 0.90 (outer faces); a single-pitch terracotta tile roof, HIGH at the open front (~1.35) and low at the back
// (eave ~0.74: the roof is the top ~45 % of the height), overhanging to 1.40 x 1.10 (the whole model's footprint). Under it: plank
// sheathing on three rafters (what the default camera sees, looking up under the front edge), a stone footing under the back and the
// sides, a plank back wall and low plank side walls (~0.56, about half height) on the outside of the posts, two front posts on dark
// pad stones; inside, one small square bale with chamfered edges, tied with two twine bands, against the back wall, and three little
// drifts of loose straw stalks on the floor (<= 0.04 u). Baked shade: darker low down and deeper under the roof toward the back wall;
// the walls' outer faces stay lighter; the bale also carries a painted form shade per face (top lit, ends and underside darker).
// Hay (fix round, after the owner kept the roof, ruling SH2): the atlas is full, so the straw is an existing PAINTED cell, paper, whose
// fine rows of strokes read as compressed straw along the bale, tinted to the haystack's hay gold through COLOR_0 (HAY_TINT: the Meshy
// haystack's hue at saturation ~0.66, inside the accent band). It replaced swatch_GoldenYellow, a flat fill that read as a saturated
// yellow box (and plank_light, tried first, whose knots and grain read as a wooden chest).
// Cells per part from look.config.mjs -> assetMaterials.shelter.

import { BufferGeometry, Float32BufferAttribute } from 'three';
import { box } from '../lib/geometry.mjs';
import { mulberry32 } from '../lib/jitter.mjs';
import { atlasTexture, placer, sm } from '../lib/paintedAtlas.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.shelter;
const ID = 'shelter';

export const SHELTER = {
  post: { x: 0.58, front: 0.40, back: -0.42, w: 0.08 },   // post centres; outer faces 1.24 x 0.90
  footing: { h: 0.08, d: 0.13 },
  roof: { x: 0.70, back: -0.527, front: 0.527 },             // overhang: 1.40 x 1.054 (+ the tiles' and trims' thickness: 1.40 x ~1.10)
  plane: { y0: 1.0204, slope: 0.54 },                        // top of the tiles' bed: y = y0 + slope * z (1.305 at the front edge, 0.736 at the back)
  rafter: 0.05, sheath: 0.016, courses: 5, course: { len: 0.27, t: 0.024 },
  wall: { boards: 7, t: 0.02 }, side: { top: 0.555 },
  bale: { at: [0.13, -0.185], w: 0.62, h: 0.27, d: 0.33, c: 0.04, yaw: 0.06 },   // a small square bale (sheep 0.74 tall): 0.62 x 0.27 x 0.33, edges chamfered 0.04
};

export default {
  id: ID,
  category: 'building',
  status: 'ready',
  build() {
    const parts = [], r = mulberry32(1025);
    const { post, footing, roof, plane, rafter, sheath, course, wall, side, bale } = SHELTER;
    const th = Math.atan(plane.slope), yP = (z) => plane.y0 + plane.slope * z;
    // baked shade: deeper under the roof toward the back wall, darker toward the ground
    // (gentler than the woodshed's: the default camera looks straight into this one, and a deep shade read as a dark hole at game distance)
    const ao = (x, y, z) => (0.76 + 0.24 * sm(-0.45, 0.5, z)) * (0.76 + 0.24 * sm(0.0, 0.35, y));
    // a wall board's outer face is out in the light: only the ground darkens it
    const outside = (x, y) => 0.8 + 0.18 * sm(0.0, 0.4, y);
    const place = placer(parts, ID, { ao, ground: true });

    // ---- the roof frame: everything measured from the high front edge down the slope (toward -Z) ----
    const along = (roof.front - roof.back) / Math.cos(th), O = [0, yP(roof.front), roof.front];
    const dn = [0, -Math.sin(th), -Math.cos(th)], up = [0, Math.cos(th), -Math.sin(th)];
    const at = (sl, n) => [O[0] + sl * dn[0] + n * up[0], O[1] + sl * dn[1] + n * up[1], O[2] + sl * dn[2] + n * up[2]];
    const under = (z) => yP(z) - (sheath + rafter) / Math.cos(th);   // the rafters' underside over z
    const frontTop = under(post.front), backTop = under(post.back);

    // ---- stone footing: a strip under the back wall and one under each side wall; a dark pad stone under each front post ----
    const fd = footing.d, fh = footing.h, zb = post.back - 0.02;
    place(box(2 * post.x + 0.14, fh, fd + 0.01, 3, 1, 1), M.footing, 1, (g) => g.translate(0, fh / 2, zb), { jit: 0.006, aoFn: (x, y) => 0.8 + 0.2 * sm(0, fh, y) });
    const sz0 = zb + (fd + 0.01) / 2, sz1 = post.front - 0.07;
    for (const sx of [-1, 1]) {
      place(box(fd, fh, sz1 - sz0), M.footing, 2 + sx, (g) => g.translate(sx * (post.x + 0.02), fh / 2, (sz0 + sz1) / 2), { jit: 0.006, aoFn: (x, y) => 0.8 + 0.2 * sm(0, fh, y) });
      place(box(0.15, fh + 0.01, 0.14), M.pads, 5 + sx, (g) => g.rotateY((r() - 0.5) * 0.3).translate(sx * post.x, (fh + 0.01) / 2, post.front), { jit: 0.01, aoFn: (x, y) => 0.82 + 0.18 * sm(0, fh, y) });
    }

    // ---- posts (two at the front on the pads, two at the back on the footing) and the beams the rafters rest on ----
    let s = 10;
    for (const sx of [-1, 1]) for (const [z, top] of [[post.back, backTop], [post.front, frontTop]]) {
      const h = top - fh;
      place(box(post.w, h, post.w), M.posts, s++, (g) => g.translate(sx * post.x, fh + h / 2, z), { u: 'y' });
    }
    for (const [z, top] of [[post.back, backTop], [post.front, frontTop]]) {
      place(box(2 * post.x + post.w + 0.02, 0.07, 0.08), M.beams, s++, (g) => g.translate(0, top - 0.035, z), { u: 'x' });
    }
    // three rafters from the back eave to the front edge, under the sheathing
    for (const x of [-post.x, 0, post.x]) {
      const c = at(along / 2, -sheath - rafter / 2);
      place(box(0.05, rafter, along - 0.02), M.rafters, s++, (g) => g.rotateX(-th).translate(x, c[1], c[2]), { u: 'z', aoFn: (x2, y, z) => 0.62 + 0.3 * sm(-0.5, 0.55, z) });
    }
    // sheathing: four boards across the rafters (their undersides are what the camera sees, looking in under the front edge)
    for (let j = 0; j < 4; j++) {
      const c = at((j + 0.5) * (along / 4), -sheath / 2);
      place(box(2 * roof.x - 0.06, sheath, along / 4 - 0.006), M.sheathing, 20 + j, (g) => g.rotateX(-th).translate(0, c[1], c[2]),
        { u: 'x', aoFn: (x, y, z) => 0.74 + 0.24 * sm(-0.5, 0.55, z) });
    }

    // ---- roof: tile courses stepping down the slope from the front edge to the back eave, each resting on the one below (the tiles'
    // rounded ends point down the slope, to -Z); dark trim along the verges and the high front edge ----
    const T = course.t, L = course.len, step = (along - L) / (SHELTER.courses - 1), al = Math.atan(T / L), ph = th - al;
    const cd = [0, -Math.sin(ph), -Math.cos(ph)], cn = [0, Math.cos(ph), -Math.sin(ph)];
    for (let i = 0; i < SHELTER.courses; i++) {
      const B = at(i * step, 0), c = [0, B[1] + (L / 2) * cd[1] + (T / 2) * cn[1], B[2] + (L / 2) * cd[2] + (T / 2) * cn[2]];
      // rotateY(pi) first: the cell's rounded tile ends (the box's +z, v = 1) then point to -Z, down this roof's slope
      place(box(2 * roof.x - 0.03, T, L, 2, 1, 1), { y: M.roof, rest: M.roofTrim }, 40 + i, (g) => g.rotateY(Math.PI).rotateX(-ph).translate(0, c[1], c[2]),
        { u: 'x', jit: 0.004, aoFn: () => 1 });
    }
    for (const sx of [-1, 1]) {
      const c = at(along / 2, 0.022);
      place(box(0.04, 0.05, along + 0.01), M.roofTrim, 50 + sx, (g) => g.rotateX(-th).translate(sx * (roof.x - 0.02), c[1], c[2]), { u: 'z', aoFn: () => 0.95 });
    }
    { const c = at(0.018, 0.012); place(box(2 * roof.x, 0.052, 0.036), M.roofTrim, 53, (g) => g.rotateX(-th).translate(0, c[1], c[2]), { u: 'x', aoFn: () => 0.95 }); }

    // ---- back wall: seven upright boards behind the back posts, a little uneven, up under the roof ----
    const zw = post.back - post.w / 2 - wall.t / 2 - 0.002, xw = post.x + post.w / 2, bw = (2 * xw) / wall.boards;
    const inWall = (x, y, z) => (z > zw ? ao(x, y, z) : outside(x, y));
    for (let i = 0; i < wall.boards; i++) {
      const x = -xw + (i + 0.5) * bw, top = under(zw) - 0.004 - r() * 0.02, h = top - fh;
      place(box(bw - 0.006, h, wall.t), M.wall, 60 + i, (g) => g.rotateZ((r() - 0.5) * 0.02).translate(x, fh + h / 2, zw), { u: 'y', jit: 0.002, aoFn: inWall });
    }
    // ---- low side walls: two horizontal boards a side, outside the posts, from the back wall to the front posts ----
    const za = zw - wall.t / 2, zf = post.front + post.w / 2, bh = (side.top - fh) / 2;
    for (const sx of [-1, 1]) {
      const xs = sx * (post.x + post.w / 2 + wall.t / 2 + 0.002), inSide = (x, y, z) => (Math.abs(x) < Math.abs(xs) ? ao(x, y, z) : outside(x, y));
      for (let k = 0; k < 2; k++) {
        const y = fh + (k + 0.5) * bh;
        place(box(wall.t, bh - 0.008, zf - za), M.sides, 70 + 2 * k + (sx > 0 ? 1 : 0), (g) => g.rotateX((r() - 0.5) * 0.015).translate(xs, y, (za + zf) / 2), { u: 'z', jit: 0.002, aoFn: inSide });
      }
    }

    // ---- inside: a hay bale against the back wall, tied with two twine bands; loose straw tufts on the floor ----
    // The straw is the paper cell (its fine painted rows = compressed straw running along the bale) tinted to hay gold through COLOR_0
    // (HAY_TINT, below). Shade like the woodshed (darker low down, deeper toward the back wall), plus a painted form shade per face:
    // the top lit, the front a little darker, the ends and chamfers darker again, so the bale reads as a soft-edged block of straw.
    const [bx, bz] = bale.at, hayAo = (x, y, z) => ao(x, y, z) * (0.78 + 0.22 * sm(0.0, 0.24, y));
    const form = (n) => (n[1] > 0.9 ? 1.0 : n[1] > 0.3 ? 0.94 : n[1] < -0.3 ? 0.7 : Math.abs(n[0]) > 0.7 ? 0.8 : n[2] > 0 ? 0.9 : 0.78);
    const prof = bevel(bale.h, bale.d, bale.c);
    hay(place(prism(bale.w, prof, true), M.hay, 80, (g) => g.rotateY(bale.yaw).translate(bx, bale.h / 2, bz), { u: 'x', jit: 0.004, aoFn: hayAo }), form);
    // twine: two thin octagonal rings round the bale (no caps; their undersides sit on the ground, flush with the bale's bottom)
    const ring = prof.map(([y, z]) => [Math.max(-bale.h / 2, y * (1 + 0.012 / (bale.h / 2))), z * (1 + 0.012 / (bale.d / 2))]);
    for (const k of [-1, 1]) {
      place(prism(0.022, ring, false), M.twine, 81 + k, (g) => g.translate(k * bale.w * 0.27, 0, 0).rotateY(bale.yaw).translate(bx, bale.h / 2, bz), { aoFn: (x, y, z) => hayAo(x, y, z) * 0.92 });
    }
    // loose straw: three little drifts of scattered stalks (one thin sliver each, lying at random angles, one end lifted), all under
    // 0.04 u; each stalk a little lighter or darker than the next
    for (const [x, z, rr, n, h, seed] of [[-0.33, -0.2, 0.16, 12, 0.04, 85], [0.0, 0.06, 0.13, 10, 0.03, 86], [-0.2, 0.2, 0.09, 8, 0.022, 87]]) {
      const q = mulberry32(seed * 7);
      hay(place(straws(rr, n, h, seed), M.hay, seed, (g) => g.translate(x, 0, z), { aoFn: ao }), () => 0.95 + 0.25 * q());
    }

    return { parts, textures: { [ID]: atlasTexture(`${ID}_albedo`) } };
  },
};

// the straw tint, multiplied into COLOR_0 (linear) on the hay parts: the paper cell's painted mean #E2D4B5 -> #BE8A43, the haystack's
// painted hay hue (haystack.glb's area-weighted albedo #C18528, h 36 deg) at saturation ~0.65 (inside the accent band, <= 0.70, with
// margin for the painted strokes; the Meshy haystack itself sits at 0.79) and about its luma (0.57 vs 0.55). Per channel:
// linear(target) / linear(cell mean)
export const HAY_TINT = [0.677, 0.386, 0.122];

// an octagonal bale profile in (y, z), centred: an h x d rectangle with its four long edges chamfered by c
function bevel(h, d, c) {
  const Y = h / 2, Z = d / 2;
  return [[-Y, -Z + c], [-Y, Z - c], [-Y + c, Z], [Y - c, Z], [Y, Z - c], [Y, -Z + c], [Y - c, -Z], [-Y + c, -Z]];
}
// a prism of length L along x over a convex (y, z) profile, centred on the origin; caps closes the ends (a fan per end)
function prism(L, prof, caps) {
  const P = [], n = prof.length, v = (x, [y, z]) => [x, y, z];
  for (let k = 0; k < n; k++) { const a = prof[k], b = prof[(k + 1) % n];
    P.push(v(-L / 2, a), v(L / 2, a), v(L / 2, b), v(-L / 2, a), v(L / 2, b), v(-L / 2, b)); }
  if (caps) for (const x of [-L / 2, L / 2]) for (let i = 1; i < n - 1; i++) P.push(v(x, prof[0]), v(x, prof[i]), v(x, prof[i + 1]));
  return tris(P, (c) => c);   // convex about the origin: each face turned to face away from it
}
// a drift of n loose straw stalks within r of the origin: each a thin sliver (one triangle, 7-19 cm long, 1.2-2.6 cm wide at its
// base), lying at a random angle a few mm off the ground with its tip lifted, none higher than h
function straws(r, n, h, seed) {
  const q = mulberry32(seed), P = [];
  for (let k = 0; k < n; k++) {
    const a = q() * 2 * Math.PI, d = r * Math.sqrt(q()), c = [Math.cos(a) * d, Math.sin(a) * d * 0.8];
    const t = q() * Math.PI, dir = [Math.cos(t), Math.sin(t)], L = 0.07 + 0.12 * q(), w = 0.012 + 0.014 * q();
    const yb = 0.004 + q() * h * 0.35, yt = Math.min(h, yb + 0.006 + q() * h * 0.6);
    const b = [c[0] - (dir[0] * L) / 2, c[1] - (dir[1] * L) / 2], tip = [c[0] + (dir[0] * L) / 2, yt, c[1] + (dir[1] * L) / 2];
    P.push([b[0] - (dir[1] * w) / 2, yb, b[1] + (dir[0] * w) / 2], [b[0] + (dir[1] * w) / 2, yb, b[1] - (dir[0] * w) / 2], tip);
  }
  return tris(P, () => [0, 1, 0]);   // every stalk turned up, to the camera
}
// non-indexed geometry from triangle corners, each triangle wound so its normal faces along out(centroid)
function tris(P, out) {
  const g = new BufferGeometry(), a = new Float32Array(P.length * 3);
  for (let t = 0; t < P.length; t += 3) {
    let [A, B, C] = [P[t], P[t + 1], P[t + 2]]; const e1 = B.map((x, i) => x - A[i]), e2 = C.map((x, i) => x - A[i]);
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], o = out([0, 1, 2].map((i) => (A[i] + B[i] + C[i]) / 3));
    if (nn[0] * o[0] + nn[1] * o[1] + nn[2] * o[2] < 0) [B, C] = [C, B];
    a.set([...A, ...B, ...C], t * 3);
  }
  g.setAttribute('position', new Float32BufferAttribute(a, 3));
  return g;
}
// the hay's colour, after place() baked its shade: a painted form shade per face (form(normal)) and the straw tint
function hay(g, form) {
  const P = g.attributes.position.array, C = g.attributes.color.array;
  for (let t = 0; t < P.length; t += 9) {
    const e1 = [P[t + 3] - P[t], P[t + 4] - P[t + 1], P[t + 5] - P[t + 2]], e2 = [P[t + 6] - P[t], P[t + 7] - P[t + 1], P[t + 8] - P[t + 2]];
    const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...nn) || 1, k = form(nn.map((x) => x / l));
    for (let j = 0; j < 9; j += 3) for (let ch = 0; ch < 3; ch++) C[t + j + ch] = Math.min(1, C[t + j + ch] * k * HAY_TINT[ch]);
  }
  return g;
}
