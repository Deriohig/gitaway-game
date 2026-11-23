// barnaby_camp -- Barnaby's "for now" camp beside the garden: a lean-to over a bedroll (prop, <= 1,500 tris; t6-brief.md, barnaby-request.md
// section 2). PAINTED procedural on the shared painted atlas (lib/paintedAtlas.mjs), the woodshed's family: one textured material, root
// node only. Origin at the centre of the footprint on y 0, the open front +Z (the game turns it pi/4, front to the default camera, like
// the woodshed); ~1.0 x 0.7 u. Two forked branch poles at the front hold a ridge pole (y ~0.62); a patched canvas tarp sags from it down
// to the ground at the back, pegged, with a guy line from each end of the ridge pole to a peg out front. Under it a bedroll: a canvas
// mat, a check wool blanket and a rolled pillow. Out front: a stack of books with a candle stub, and a tin kettle on three stones over a
// cold fire. Temporary, cosy, improvised: the camp of someone who'd rather be studying.
// Cells per part from look.config.mjs -> assetMaterials.barnaby_camp.

import { TorusGeometry, Vector3, Matrix4 } from 'three';
import { box, cyl, cone } from '../lib/geometry.mjs';
import { mulberry32 } from '../lib/jitter.mjs';
import { mapUV, shade, atlasTexture, placer, sm } from '../lib/paintedAtlas.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.barnaby_camp;
const ID = 'barnaby_camp';

export const CAMP = {
  poles: { x: 0.42, z: 0.12, h: 0.6 }, ridge: { y: 0.618, len: 1.0, r: 0.02 },
  tarp: { w: 0.96, front: [0.165, 0.632], back: [-0.33, 0.024], sag: 0.035 },   // [z, y] of its top and bottom edges
  pegs: { front: [0.47, 0.335], back: [0.44, -0.345] },
};

export default {
  id: ID,
  category: 'prop',
  status: 'ready',
  build() {
    const parts = [], r = mulberry32(1204);
    const { poles, ridge, tarp, pegs } = CAMP;
    // baked shade: deeper under the tarp toward the back
    const under = (x, y, z) => 0.62 + 0.38 * sm(-0.3, 0.22, z);
    const place = placer(parts, ID, { ground: true });

    // ---- the frame: two forked poles, the ridge pole across the forks ----
    for (const sx of [-1, 1]) {
      const x = sx * poles.x;
      place(cyl(0.017, 0.022, poles.h + 0.02, 6), { y: M.poleEnds, rest: M.poles }, 1 + sx, (g) => g.rotateZ(sx * 0.03).translate(x, (poles.h + 0.02) / 2, poles.z), { u: 'y', aoFn: (x2, y) => 0.8 + 0.2 * sm(0, 0.3, y) });
      for (const side of [-1, 1]) {   // the fork's two prongs above the ridge pole
        const a = [x + side * 0.004, poles.h - 0.02, poles.z], b = [x + side * 0.05, poles.h + 0.085, poles.z + side * 0.006 * sx];
        place(cyl(0.01, 0.014, dist(a, b), 5), { y: M.poleEnds, rest: M.poles }, 4 + sx + side, (g) => orient(g, a, b), { u: 'y' });
      }
    }
    place(cyl(ridge.r, ridge.r * 1.1, ridge.len, 6), { y: M.poleEnds, rest: M.poles }, 8, (g) => g.rotateY(0.4).rotateZ(Math.PI / 2).rotateY(0.015).translate(0, ridge.y, poles.z), { u: 'y' });

    // ---- the tarp: canvas sagging from the ridge pole to the ground at the back ----
    { const [zf, yf] = tarp.front, [zb, yb] = tarp.back, L = Math.hypot(zf - zb, yf - yb), th = Math.atan2(yf - yb, zf - zb);
      const g = mapUV(box(tarp.w, 0.012, L, 5, 1, 4), M.tarp, 10, { u: 'x' }), p = g.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) { const u = p[i] / tarp.w + 0.5, v = p[i + 2] / L + 0.5;   // sag between the pole and the pegs, a little more mid-span
        p[i + 1] -= tarp.sag * Math.sin(Math.PI * v) * (0.7 + 0.3 * Math.sin(Math.PI * u)) + 0.01 * Math.sin(u * 9 + v * 4); }
      g.rotateX(-th).translate(0, (yf + yb) / 2, (zf + zb) / 2);
      shade(g, (x, y, z) => 0.88 + 0.12 * sm(0.2, 0.6, y)); parts.push({ material: ID, geometry: g }); }
    // guy lines from the ridge pole's ends to pegs out front; pegs along the tarp's back edge
    for (const sx of [-1, 1]) {
      const a = [sx * (ridge.len / 2 - 0.02), ridge.y, poles.z], b = [sx * pegs.front[0], 0.03, pegs.front[1]];
      place(box(0.009, dist(a, b), 0.009), M.ropes, 12 + sx, (g) => orient(g, a, b), { u: 'y' });
      place(box(0.018, 0.07, 0.018), M.pegs, 15 + sx, (g) => g.rotateX(0.25).translate(b[0], 0.038, b[1] + 0.006), { u: 'y' });
      place(box(0.018, 0.06, 0.018), M.pegs, 18 + sx, (g) => g.rotateX(-0.25).translate(sx * pegs.back[0], 0.033, pegs.back[1] + 0.012), { u: 'y' });
    }

    // ---- the bedroll under it: a canvas mat, the check blanket over a hump, a rolled pillow ----
    const bz = -0.06;
    place(box(0.66, 0.024, 0.27), M.mat, 20, (g) => g.translate(0.02, 0.012, bz), { u: 'x', jit: 0.004, aoFn: under });
    place(cyl(0.125, 0.125, 0.48, 8), M.bedroll, 21, (g) => g.rotateZ(Math.PI / 2).scale(1, 0.3, 1).translate(0.09, 0.062, bz), { u: 'y', jit: 0.006, aoFn: under });
    place(cyl(0.05, 0.05, 0.25, 7), M.bedroll, 22, (g) => g.rotateX(Math.PI / 2).translate(0.33, 0.05, bz + 0.005), { u: 'y', aoFn: under });   // the rolled foot end
    place(cyl(0.045, 0.045, 0.2, 7), M.pillow, 23, (g) => g.rotateX(Math.PI / 2).scale(1, 0.8, 1).translate(-0.24, 0.058, bz), { u: 'y', aoFn: under });

    // ---- out front, left: a stack of books with a candle stub ----
    const bk = [-0.3, 0, 0.24]; let y = 0;
    [[0.14, 0.032, 0.1, 0.1], [0.125, 0.028, 0.092, -0.18], [0.11, 0.026, 0.085, 0.32]].forEach(([w, h, d, yaw], i) => {
      place(box(w, h, d), { y: M.books[i], rest: M.pages }, 30 + i, (g) => g.rotateY(yaw).translate(bk[0], y + h / 2, bk[2]), { u: 'x', aoFn: () => 0.95 }); y += h; });
    place(cyl(0.017, 0.019, 0.045, 6), M.candle, 34, (g) => g.translate(bk[0] + 0.015, y + 0.0225, bk[2] - 0.01), { u: 'y' });
    place(cone(0.009, 0.026, 5), M.flame, 35, (g) => g.translate(bk[0] + 0.015, y + 0.058, bk[2] - 0.01), {});

    // ---- out front, right: a tin kettle on three stones over a cold fire ----
    const fk = [0.27, 0.22];
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; place(box(0.065, 0.05, 0.055), M.stones, 40 + k, (g) => g.rotateY(a + (r() - 0.5) * 0.4).translate(fk[0] + Math.sin(a) * 0.07, 0.025, fk[1] + Math.cos(a) * 0.07), { jit: 0.006, aoFn: (x, y2) => 0.8 + 0.2 * sm(0, 0.05, y2) }); }
    for (let k = 0; k < 3; k++) place(box(0.012, 0.012, 0.09), M.char, 44 + k, (g) => g.rotateY(k * 1.1 + 0.3).translate(fk[0], 0.008 + k * 0.006, fk[1]), { aoFn: () => 0.7 });
    const ky = 0.05;
    place(cyl(0.042, 0.05, 0.055, 8), M.kettle, 50, (g) => g.translate(fk[0], ky + 0.0275, fk[1]), { u: 'y', aoFn: (x, y2) => 0.8 + 0.2 * sm(ky, ky + 0.05, y2) });
    place(cone(0.04, 0.025, 8), M.kettle, 51, (g) => g.translate(fk[0], ky + 0.067, fk[1]), {});
    place(cyl(0.007, 0.012, 0.055, 5), M.kettle, 52, (g) => orient(g, [fk[0] - 0.04, ky + 0.02, fk[1]], [fk[0] - 0.085, ky + 0.06, fk[1]]), { u: 'y' });
    place(new TorusGeometry(0.03, 0.004, 3, 8, Math.PI), M.kettle, 53, (g) => g.translate(fk[0], ky + 0.075, fk[1]), { u: 'x' });

    return { parts, textures: { [ID]: atlasTexture(`${ID}_albedo`) } };
  },
};

function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
// turn a Y-aligned part (centred) so its +Y runs from a to b (its +Z kept as level as it can be), centred between them
function orient(g, a, b) {
  const Y = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(), mid = new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  const ref = Math.abs(Y.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0), Z = ref.addScaledVector(Y, -ref.dot(Y)).normalize(), X = new Vector3().crossVectors(Y, Z);
  return g.applyMatrix4(new Matrix4().makeBasis(X, Y, Z).setPosition(mid));
}
