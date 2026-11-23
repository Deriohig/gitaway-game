// barnaby -- Barnaby Wick, the wizard (character, <= 1,500 tris; t6-brief.md, barnaby-request.md section 1). PAINTED procedural on the
// shared painted atlas (lib/paintedAtlas.mjs), the woodshed's family: one textured material, one rigid mesh on the single root node
// 'barnaby' (the game rocks the whole figure ~0.03 rad). Origin at his feet on y 0, facing +Z, 1.063 u tall, every vertex within 0.26 u
// of the y axis (the robe's hem is the widest point, 0.256; well inside the game's tap ball, 0.5 u, centred 0.55 up).
// Canon (docs/lore CAST / VOICES): "a man in a pointed hat"; Barnaby WICK (candles, lanterns); curious, measures things, writes field
// notes. Age and looks open, so: a cheerful, slightly rumpled scholar. A tall pointed hat whose tip flops over to his left (+X): the
// silhouette that reads at game distance; a brass band. A dusty slate-teal robe (not purple, no long white beard: CAST "Two traps"),
// a darker hem, a belt, a knitted rust scarf with a tail. Simple warm face: two dark eye dots, a round nose, a short neat brown beard,
// no mouth. Hands clasped in front. A small brass lantern hangs at his left hip; a satchel stuffed with papers at his right hip, its
// strap across his chest.
// Cells per part from look.config.mjs -> assetMaterials.barnaby.

import { LatheGeometry, SphereGeometry, TorusGeometry, CylinderGeometry, BufferGeometry, Float32BufferAttribute, Vector2, Vector3, Matrix4 } from 'three';
import { box, cyl, cone, ico } from '../lib/geometry.mjs';
import { atlasTexture, placer, sm } from '../lib/paintedAtlas.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.barnaby;
const ID = 'barnaby';

// the robe's profile (radius, y): a flared hem, a soft middle, narrow shoulders
const ROBE = [[0.212, 0], [0.204, 0.06], [0.163, 0.25], [0.137, 0.38], [0.106, 0.46], [0.058, 0.492]];
const robeR = (y) => { for (let i = 0; i + 1 < ROBE.length; i++) { const [r0, y0] = ROBE[i], [r1, y1] = ROBE[i + 1]; if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0); } return ROBE[ROBE.length - 1][0]; };
// the hat's spine: up from the brim, the tip flopping over to his left (+X) and a little back
const HAT = [[0, 0.672, 0, 0.112], [0, 0.78, -0.006, 0.087], [0.004, 0.885, -0.012, 0.063], [0.018, 0.97, -0.018, 0.043], [0.058, 1.026, -0.026, 0.028], [0.11, 1.047, -0.034, 0.016], [0.158, 1.028, -0.042, 0]];

export const BARNABY = { robe: ROBE, hat: HAT, head: { c: [0, 0.565, 0.01], r: 0.1 } };

export default {
  id: ID,
  category: 'character',
  status: 'ready',
  build() {
    const parts = [];
    const place = placer(parts, ID, { ground: true });
    const robeAO = (x, y) => 0.7 + 0.3 * sm(0.0, 0.32, y);

    // ---- robe: a lathe, a little rumpled; a darker hem band; a belt ----
    place(new LatheGeometry(ROBE.map(([r, y]) => new Vector2(r, y)), 10), M.robe, 1, () => {}, { u: 'y', jit: 0.006, aoFn: robeAO });
    place(cyl(0.216, 0.219, 0.036, 10, true), M.robe, 2, (g) => g.translate(0, 0.018, 0), { u: 'x', aoFn: () => 0.55 });
    place(cyl(robeR(0.3) + 0.006, robeR(0.3) + 0.008, 0.026, 10, true), M.strap, 3, (g) => g.translate(0, 0.3, 0), { u: 'x', aoFn: () => 0.9 });
    // boots peeking out under the hem
    for (const sx of [-1, 1]) place(box(0.075, 0.05, 0.11), M.boots, 4 + sx, (g) => g.rotateY(sx * 0.15).translate(sx * 0.068, 0.025, 0.165), { aoFn: (x, y) => 0.75 + 0.25 * sm(0, 0.05, y) });

    // ---- scarf: a knitted ring round the neck and a tail down his front ----
    place(new TorusGeometry(0.074, 0.033, 5, 10), M.scarf, 6, (g) => g.rotateX(Math.PI / 2).translate(0, 0.472, 0.004), { u: 'x', aoFn: () => 0.95 });
    place(box(0.056, 0.17, 0.026), M.scarf, 7, (g) => g.rotateX(-0.27).rotateZ(0.08).translate(-0.045, 0.375, robeR(0.375) + 0.01), { u: 'y', aoFn: (x, y) => 0.85 + 0.15 * sm(0.3, 0.45, y) });

    // ---- arms: wide sleeves to hands clasped in front ----
    for (const sx of [-1, 1]) {
      const a = [sx * 0.104, 0.44, 0.0], b = [sx * 0.052, 0.292, 0.15];
      place(cyl(0.038, 0.06, dist(a, b), 8), M.robe, 8 + sx, (g) => orient(g, b, a), { u: 'y', aoFn: (x, y) => 0.78 + 0.22 * sm(0.28, 0.44, y) });
    }
    place(ico(0.042, 0), M.skin, 11, (g) => g.scale(1.25, 0.9, 1).translate(0, 0.282, 0.178), {});

    // ---- head: warm skin, two eye dots, a round nose, a short neat beard, a tuft of hair at the back under the brim ----
    const H = BARNABY.head;
    place(new SphereGeometry(H.r, 10, 7), M.skin, 12, (g) => g.translate(...H.c), {});
    place(new SphereGeometry(0.023, 6, 4), M.skin, 13, (g) => g.translate(0, 0.553, 0.106), {});   // a round button nose
    for (const sx of [-1, 1]) place(new SphereGeometry(0.0115, 6, 4), M.eyes, 14 + sx, (g) => g.scale(1, 1.15, 0.55).translate(sx * 0.036, 0.58, 0.1), {});
    place(new SphereGeometry(0.075, 8, 5), M.beard, 17, (g) => g.scale(0.92, 0.42, 0.78).translate(0, 0.493, 0.05), { jit: 0.003, aoFn: () => 0.95 });
    for (const [x, y, z, s] of [[0, 0.6, -0.07, 0.058]]) {   // hair at the back, under the brim
      place(ico(s, 0), M.beard, 18 + Math.round(x * 100), (g) => g.scale(1, 0.8, 1).translate(x, y, z), { aoFn: () => 0.85 });
    }

    // ---- the hat: a brim tipped up a little at the front, a brass band, the tall crown with its flopped tip ----
    place(new CylinderGeometry(0.168, 0.172, 0.016, 12), M.hat, 20, (g) => g.rotateX(-0.08).translate(0, 0.668, 0), { u: 'x', aoFn: () => 0.66 });
    place(cyl(0.112, 0.117, 0.036, 10, true), M.band, 21, (g) => g.translate(0, 0.694, 0), { u: 'x', aoFn: () => 0.95 });
    place(tube(HAT, 9), M.hat, 22, () => {}, { u: 'y', aoFn: (x, y) => 0.64 + 0.12 * sm(0.7, 1.05, y) });   // a deeper slate than the robe: the silhouette

    // ---- a small brass lantern at his left hip (+X), hung from the belt ----
    const L = [0.205, 0.198, 0.03];
    place(new TorusGeometry(0.016, 0.0045, 3, 6), M.lantern, 30, (g) => g.translate(L[0] - 0.012, 0.287, L[2]), { u: 'x' });
    place(cone(0.04, 0.034, 6), M.lantern, 31, (g) => g.translate(L[0], L[1] + 0.058, L[2]), { aoFn: () => 0.95 });
    place(cyl(0.028, 0.028, 0.062, 6, true), M.lanternGlass, 32, (g) => g.translate(L[0], L[1] + 0.01, L[2]), { u: 'y' });
    for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.3; place(box(0.008, 0.066, 0.008), M.lantern, 33 + k, (g) => g.translate(L[0] + Math.sin(a) * 0.03, L[1] + 0.01, L[2] + Math.cos(a) * 0.03), { u: 'y' }); }
    place(cyl(0.036, 0.032, 0.018, 6), M.lantern, 36, (g) => g.translate(L[0], L[1] - 0.03, L[2]), { u: 'x', aoFn: () => 0.85 });

    // ---- a satchel at his right hip (-X), stuffed with papers, the strap across his chest to his left shoulder ----
    const Sx = -0.205, Sy = 0.215;
    place(box(0.052, 0.105, 0.135), M.satchel, 40, (g) => g.rotateZ(-0.12).translate(Sx, Sy, 0.01), { aoFn: (x, y) => 0.8 + 0.2 * sm(0.17, 0.26, y) });
    place(box(0.058, 0.05, 0.14), M.satchel, 41, (g) => g.rotateZ(-0.12).translate(Sx - 0.006, Sy + 0.035, 0.01), { aoFn: () => 0.75 });
    for (const [dz, tilt, h] of [[-0.042, 0.16, 0.1], [0.0, -0.1, 0.12], [0.038, 0.24, 0.095]]) {
      place(box(0.012, h, 0.06), M.papers, 42 + Math.round(dz * 100), (g) => g.rotateX(tilt).rotateZ(-0.12).translate(Sx + 0.012, Sy + 0.05 + h / 2 - 0.02, 0.01 + dz), { u: 'y' });
    }
    const strap = []; for (let i = 0; i <= 4; i++) { const t = i / 4, phi = (-82 + 120 * t) * Math.PI / 180, y = 0.275 + 0.18 * t, r = robeR(y) + 0.012; strap.push([Math.sin(phi) * r, y, Math.cos(phi) * r, phi]); }
    for (let i = 0; i < 4; i++) { const a = strap[i], b = strap[i + 1], ph = (a[3] + b[3]) / 2;
      place(box(0.026, dist(a, b) + 0.012, 0.008), M.strap, 50 + i, (g) => orient(g, a, b, [Math.sin(ph), 0, Math.cos(ph)]), { u: 'y', aoFn: () => 0.9 }); }

    return { parts, textures: { [ID]: atlasTexture(`${ID}_albedo`) } };
  },
};

function dist(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
// turn a Y-aligned part (centred) so its +Y runs from a to b, its +Z toward `out` (default: away from the y axis), and centre it between them
function orient(g, a, b, out) {
  const Y = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(), mid = new Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  const Z = (out ? new Vector3(...out) : new Vector3(mid.x, 0, mid.z)).normalize(); Z.addScaledVector(Y, -Z.dot(Y)).normalize();
  const X = new Vector3().crossVectors(Y, Z);
  return g.applyMatrix4(new Matrix4().makeBasis(X, Y, Z).setPosition(mid));
}
// a tube along a spine of [x, y, z, r] points (r 0 = a point at the tip), N sides, open at the bottom
function tube(spine, N) {
  const pos = [], rings = [];
  let prevN = new Vector3(1, 0, 0);
  for (let i = 0; i < spine.length; i++) {
    const p = new Vector3(...spine[i]), q = new Vector3(...spine[Math.min(spine.length - 1, i + 1)]), o = new Vector3(...spine[Math.max(0, i - 1)]);
    const T = q.clone().sub(o).normalize(), Nn = prevN.clone().addScaledVector(T, -prevN.dot(T)).normalize(), Bn = new Vector3().crossVectors(T, Nn);
    prevN = Nn; const r = spine[i][3], ring = [];
    for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; ring.push(p.clone().addScaledVector(Nn, Math.cos(a) * r).addScaledVector(Bn, -Math.sin(a) * r)); }
    rings.push(ring);
  }
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < N; k++) {
    const a = rings[i][k], b = rings[i][(k + 1) % N], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % N];
    if (spine[i + 1][3] === 0) tri(a, c, b); else { tri(a, d, b); tri(a, c, d); }   // wound outward
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); return g;
}
