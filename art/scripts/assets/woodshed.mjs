// woodshed -- a lean-to log store (building, <= 1,500 tris; design 2026-10-23 section 3). PAINTED procedural: built in code and
// UV-mapped onto the shared painted atlas (lib/paintedAtlas.mjs), one textured material, so it sits beside the Meshy-textured
// farmhouse. Origin at the base centre on y 0; the open front faces +Z (the game: layout.ts WOODSHED, turned HOUSE.rot, front to the
// camera). Posts 1.0 x 0.6; the roof (terracotta tile courses framed by a darker trim) slopes from ~0.84 over the back posts to
// ~0.65 over the front ones and overhangs to 1.16 x 0.76 (the whole model is 1.16 x 0.79: the axe head pokes 2 cm past the roof's
// front edge; 1.16 is the design's cap, so there is no width headroom); under 0.9 tall so the farmhouse's left window shows over it. A stone
// footing with corner stones, a back wall of boards, and 22 logs in rows of 6/5/6/5 (the game's stand-in) with painted ring ends on
// +Z. An axe leans on the front-left post. Baked shade: darker low down and deeper under the roof.
// Cells per part from look.config.mjs -> assetMaterials.woodshed.

import { box, cyl } from '../lib/geometry.mjs';
import { mulberry32 } from '../lib/jitter.mjs';
import { atlasTexture, placer, sm } from '../lib/paintedAtlas.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.woodshed;
const ID = 'woodshed';

export const SHED = {
  post: { x: 0.46, z: 0.26, w: 0.08 },        // post centres; outer faces 1.0 x 0.6
  plinth: { w: 1.04, d: 0.64, h: 0.05 },
  roof: { x: 0.58, back: -0.36, front: 0.40 }, // overhang: 1.16 x 0.76 (the axe head reaches z 0.42, so the model is 1.16 x 0.79)
  plane: { y0: 0.705, slope: 0.385 },         // top of the rafters: y = y0 - slope * z (0.805 over the back posts, 0.605 over the front)
  rafter: 0.045, courses: 5, course: { len: 0.2, t: 0.022 },
  log: { r: 0.056, rows: [6, 5, 6, 5] },
};

export default {
  id: ID,
  category: 'building',
  status: 'ready',
  build() {
    const parts = [], r = mulberry32(2026);
    const { post, plinth, roof, plane, rafter, course, log } = SHED;
    const th = Math.atan(plane.slope), yP = (z) => plane.y0 - plane.slope * z;
    // baked shade: deeper under the roof toward the back wall, darker toward the ground
    const ao = (x, y, z) => (0.7 + 0.3 * sm(-0.32, 0.3, z)) * (0.74 + 0.26 * sm(0.0, 0.3, y));
    // map the part's uvs in its own frame, place it, nudge it a little by hand (never below the ground), bake its shade
    const place = placer(parts, ID, { ao, ground: true });

    // ---- stone footing: a low plinth and a chunky stone under each post ----
    place(box(plinth.w, plinth.h, plinth.d, 4, 1, 2), M.footing, 1, (g) => g.translate(0, plinth.h / 2, 0), { jit: 0.006, aoFn: (x, y, z) => 0.8 + 0.2 * sm(-0.3, 0.3, z) });
    let s = 10;
    for (const x of [-post.x, post.x]) for (const z of [-post.z, post.z]) {
      place(box(0.14, 0.08, 0.13), M.pads, s++, (g) => g.rotateY((r() - 0.5) * 0.3).translate(x, 0.04, z), { jit: 0.012, aoFn: (x2, y) => 0.82 + 0.18 * sm(0, 0.08, y) });
    }

    // ---- posts, beams, rafters ----
    const rafterUnder = (z) => yP(z) - rafter / Math.cos(th);
    const backTop = rafterUnder(-post.z), frontTop = rafterUnder(post.z);
    for (const x of [-post.x, post.x]) for (const [z, top] of [[-post.z, backTop], [post.z, frontTop]]) {
      const h = top - 0.08;
      place(box(post.w, h, post.w), M.posts, s++, (g) => g.translate(x, 0.08 + h / 2, z), { u: 'y' });
    }
    for (const [z, top] of [[-post.z, backTop], [post.z, frontTop]]) {
      place(box(2 * post.x + post.w + 0.02, 0.06, 0.075), M.beams, s++, (g) => g.translate(0, top - 0.03, z), { u: 'x' });
    }
    const along = (roof.front - roof.back) / Math.cos(th), O = [0, yP(roof.back), roof.back];
    const dn = [0, -Math.sin(th), Math.cos(th)], up = [0, Math.cos(th), Math.sin(th)];
    const at = (sl, n) => [O[0] + sl * dn[0] + n * up[0], O[1] + sl * dn[1] + n * up[1], O[2] + sl * dn[2] + n * up[2]];
    for (const x of [-post.x, 0, post.x]) {
      const c = at(along / 2, -rafter / 2);
      place(box(0.05, rafter, along - 0.02), M.beams, s++, (g) => g.rotateX(th).translate(x, c[1], c[2]), { u: 'z' });
    }
    // knee braces in the front opening, and a rail along each open side
    for (const sx of [-1, 1]) {
      const a = [sx * (post.x - 0.04), frontTop - 0.2], b = [sx * (post.x - 0.17), frontTop - 0.06], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      place(box(L + 0.03, 0.035, 0.035), M.beams, s++, (g) => g.rotateZ(Math.atan2(b[1] - a[1], b[0] - a[0])).translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, post.z), { u: 'x' });
      place(box(0.045, 0.05, 2 * post.z), M.beams, s++, (g) => g.translate(sx * post.x, 0.47, 0), { u: 'z' });
    }

    // ---- roof: tile courses stepping down the slope, each resting on the one below; dark trim along the verges and the back ----
    const T = course.t, L = course.len, step = (along - L) / (SHED.courses - 1), al = Math.atan(T / L), ph = th - al;
    const cd = [0, -Math.sin(ph), Math.cos(ph)], cn = [0, Math.cos(ph), Math.sin(ph)];
    for (let i = 0; i < SHED.courses; i++) {
      const B = at(i * step, 0), c = [0, B[1] + (L / 2) * cd[1] + (T / 2) * cn[1], B[2] + (L / 2) * cd[2] + (T / 2) * cn[2]];
      place(box(2 * roof.x - 0.03, T, L, 3, 1, 1), { y: M.roof, rest: M.roofTrim }, 40 + i, (g) => g.rotateX(ph).translate(0, c[1], c[2]),
        { u: 'x', jit: 0.004, aoFn: () => 1 });
    }
    for (const sx of [-1, 1]) {
      const c = at(along / 2, 0.022);
      place(box(0.04, 0.05, along + 0.01), M.roofTrim, 50 + sx, (g) => g.rotateX(th).translate(sx * (roof.x - 0.02), c[1], c[2]), { u: 'z', aoFn: () => 0.95 });
    }
    { const c = at(0.018, 0.012); place(box(2 * roof.x, 0.052, 0.036), M.roofTrim, 53, (g) => g.rotateX(th).translate(0, c[1], c[2]), { u: 'x', aoFn: () => 0.95 }); }

    // ---- back wall: eight upright boards, a little uneven ----
    const nb = 8, bw = (2 * post.x) / nb;
    for (let i = 0; i < nb; i++) {
      const x = -post.x + (i + 0.5) * bw, top = rafterUnder(-0.285) - 0.005 - r() * 0.02, h = top - plinth.h;
      place(box(bw - 0.006, h, 0.02), M.wall, 60 + i, (g) => g.rotateZ((r() - 0.5) * 0.02).translate(x, plinth.h + h / 2, -0.285), { u: 'y', jit: 0.002 });
    }

    // ---- the log stack: two sleepers, 22 logs (rows 6/5/6/5), ring ends out to +Z ----
    for (const z of [-0.14, 0.12]) place(box(0.86, 0.025, 0.06), M.sleepers, 70 + (z > 0 ? 1 : 0), (g) => g.translate(0, plinth.h + 0.0125, z), { u: 'x' });
    const y0 = plinth.h + 0.025;
    let k = 0;
    log.rows.forEach((n, row) => {
      for (let i = 0; i < n; i++, k++) {
        const x = (i - (n - 1) / 2) * 2 * log.r + (r() - 0.5) * 0.006, y = y0 + log.r + row * Math.sqrt(3) * log.r;
        const rr = log.r * (0.9 + r() * 0.09), len = 0.44 + r() * 0.04, zf = 0.235 - r() * 0.03;
        place(cyl(rr, rr, len, 7), { y: M.logEnds[(k * 3 + row) % 4], rest: M.logs }, 100 + k,
          (g) => g.rotateY(r() * 6.283).rotateX(Math.PI / 2).rotateY((r() - 0.5) * 0.06).translate(x, y - (log.r - rr), zf - len / 2), { u: 'y' });
      }
    });

    // ---- an axe leaning on the front-left post's outer face, head down ----
    { const base = [-0.535, 0, 0.34], topP = [-0.515, 0.27, 0.3], L2 = Math.hypot(topP[0] - base[0], topP[1] - base[1], topP[2] - base[2]);
      const tilt = Math.atan2(topP[2] - base[2], topP[1] - base[1]), roll = Math.atan2(topP[0] - base[0], topP[1] - base[1]);
      place(box(0.022, L2, 0.022), M.handle, 90, (g) => g.translate(0, L2 / 2 + 0.02, 0).rotateX(tilt).rotateZ(-roll).translate(...base), { u: 'y', aoFn: (x, y) => 0.8 + 0.2 * sm(0, 0.3, y) });
      place(box(0.02, 0.05, 0.1), M.axeHead, 91, (g) => g.translate(0, 0.045, 0.025).rotateX(tilt).rotateZ(-roll).translate(...base), { u: 'z', aoFn: () => 0.9 });
    }

    return { parts, textures: { [ID]: atlasTexture(`${ID}_albedo`) } };
  },
};
