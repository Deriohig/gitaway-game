// wetland_jetty -- a little fishing jetty for the wetland lake (prop, <= 500 tris; design 2026-10-23 section 4, art/ASSETS.md
// `jetty` entry: the wetland jetty, built by the Pond Jetty restoration). PAINTED procedural, on the shared painted atlas (lib/paintedAtlas.mjs), the woodshed's family: one textured material.
// y 0 = the waterline (the game sets it on the lake level). Runs along Z, centred on the origin: 0.7 x 1.7, the SHORE end at -Z
// (z -0.85, a sill log under it for the bank), the far end at +Z (z +0.85). Deck: 13 weathered grey-brown boards across X, top at
// y 0.2 (one fresher replacement board), on two stringers and four piles (x +-0.27, z -0.62 / +0.58) down to y -0.3, dark and wet
// below the waterline with an algae band at it. A mooring post (to y 0.45) with a rope loop at the far right corner; a bucket and a
// three-legged stool on the far end. Baked shade: the underside and the wet timber darker.
// Cells per part from look.config.mjs -> assetMaterials.wetland_jetty.

import { CylinderGeometry, CircleGeometry, TorusGeometry } from 'three';
import { box, cyl } from '../lib/geometry.mjs';
import { mulberry32 } from '../lib/jitter.mjs';
import { atlasTexture, placer, sm } from '../lib/paintedAtlas.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.wetland_jetty;
const ID = 'wetland_jetty';

export const JETTY = {
  width: 0.7, length: 1.7, deckTop: 0.2, plank: { n: 13, gap: 0.012, t: 0.03 }, patched: [8],
  stringer: { x: 0.24, h: 0.05 }, piles: { x: 0.27, z: [-0.62, 0.58], r: 0.04, bottom: -0.3 },
  post: { x: 0.3, z: 0.74, r: 0.045, top: 0.45 }, shoreZ: -0.85,
};

export default {
  id: ID,
  category: 'prop',
  status: 'ready',
  build() {
    const parts = [], r = mulberry32(1706);
    const J = JETTY, top = J.deckTop, pw = (J.length - (J.plank.n - 1) * J.plank.gap) / J.plank.n;
    const ao = (x, y) => (y < 0 ? 0.72 : 1) * (0.66 + 0.34 * sm(0.1, 0.2, y));
    const place = placer(parts, ID, { ao });

    // ---- deck: boards across X, a little uneven ----
    for (let i = 0; i < J.plank.n; i++) {
      const z = J.shoreZ + pw / 2 + i * (pw + J.plank.gap), len = J.width - 0.02 - r() * 0.03, dx = (r() - 0.5) * 0.016;
      const cell = J.patched.includes(i) ? M.deckPatch : M.deck;
      place(box(len, J.plank.t, pw), cell, 10 + i, (g) => g.rotateY((r() - 0.5) * 0.03).translate(dx, top - J.plank.t / 2 - r() * 0.004, z), { u: 'x', jit: 0.0025 });
    }
    for (const sx of [-1, 1]) place(box(0.06, J.stringer.h, J.length - 0.04), M.stringers, 30 + sx, (g) => g.translate(sx * J.stringer.x, top - J.plank.t - 0.006 - J.stringer.h / 2, 0), { u: 'z' });

    // ---- piles: dry timber above the waterline, wet below; and the sill log the shore end rests on ----
    let s = 40;
    const pileTop = top - J.plank.t - 0.008;
    for (const sx of [-1, 1]) for (const z of J.piles.z) {
      const x = sx * J.piles.x + (r() - 0.5) * 0.01, lean = (r() - 0.5) * 0.03;
      place(cyl(J.piles.r, J.piles.r * 1.05, pileTop, 5, true), M.piles, s++, (g) => g.rotateY(r() * 6.28).translate(x, pileTop / 2, z), { u: 'y' });
      place(cyl(J.piles.r * 1.05, J.piles.r * 1.1, -J.piles.bottom, 5, true), M.wet, s++, (g) => g.rotateY(r() * 6.28).rotateZ(lean * 0.3).translate(x, J.piles.bottom / 2, z), { u: 'y', aoFn: () => 0.85 });
    }
    place(cyl(0.05, 0.05, J.width - 0.02, 6), { y: M.sillEnds, rest: M.sill }, s++, (g) => g.rotateZ(Math.PI / 2).translate(0, pileTop - 0.05, J.shoreZ + 0.055), { u: 'y', aoFn: () => 0.78 });

    // ---- mooring post with a rope loop ----
    const P = J.post;
    place(cyl(P.r, P.r * 1.08, -J.piles.bottom, 6, true), M.wet, 60, (g) => g.translate(P.x, J.piles.bottom / 2, P.z), { u: 'y', aoFn: () => 0.85 });
    place(cyl(P.r * 0.92, P.r, P.top, 6), { y: M.postTop, rest: M.post }, 61, (g) => g.rotateY(0.3).translate(P.x, P.top / 2, P.z), { u: 'y', aoFn: (x, y) => 0.8 + 0.2 * sm(0.1, 0.35, y) });
    place(new TorusGeometry(P.r + 0.014, 0.012, 3, 7), M.rope, 62, (g) => g.rotateX(Math.PI / 2).rotateZ(0.18).translate(P.x, 0.33, P.z), { u: 'x', aoFn: () => 1 });

    // ---- a bucket (staves, an iron hoop, water inside) and a three-legged stool on the far end ----
    const bk = [0.06, top, 0.66];
    place(new CylinderGeometry(0.062, 0.05, 0.11, 8, 1, true), M.bucket, 70, (g) => g.translate(bk[0], top + 0.055, bk[2]), { u: 'y', aoFn: (x, y) => 0.8 + 0.2 * sm(top, top + 0.08, y) });
    place(new CylinderGeometry(0.0605, 0.058, 0.016, 8, 1, true), M.hoops, 71, (g) => g.translate(bk[0], top + 0.08, bk[2]), { u: 'x', aoFn: () => 1 });
    place(new CircleGeometry(0.057, 8), M.water, 72, (g) => g.rotateX(-Math.PI / 2).translate(bk[0], top + 0.085, bk[2]), { aoFn: () => 0.8 });
    const st = [-0.15, 0.6], seatY = top + 0.13;
    place(cyl(0.072, 0.07, 0.024, 6), M.stool, 80, (g) => g.rotateY(0.4).translate(st[0], seatY + 0.012, st[1]), { u: 'x', aoFn: () => 1 });
    for (let k = 0; k < 3; k++) {
      const a = 0.4 + k * 2.094, fx = st[0] + Math.cos(a) * 0.07, fz = st[1] + Math.sin(a) * 0.07;   // feet splayed out, tops in under the seat
      place(cyl(0.011, 0.013, 0.135, 4, true), M.stool, 81 + k, (g) => g.translate(0, 0.0675, 0).rotateX(-Math.sin(a) * 0.22).rotateZ(Math.cos(a) * 0.22).translate(fx, top - 0.0025, fz),
        { u: 'y', aoFn: (x, y) => 0.75 + 0.25 * sm(top, top + 0.12, y) });
    }

    return { parts, textures: { [ID]: atlasTexture(`${ID}_albedo`) } };
  },
};
