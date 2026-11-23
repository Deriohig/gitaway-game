// tower_ruin -- an ordinary dry-stone ruin (Barnaby calls it 'perfectly ordinary') on the highland plateau (building, <= 3,000 tris; t6-brief.md, barnaby-request.md section 3).
// PAINTED procedural on the shared painted atlas (lib/paintedAtlas.mjs), the woodshed's family: one textured material, root node only.
// The broken base of a round dry-stone tower, centred on the origin, ~2.0 u across, <= 1.4 u tall. Courses of wedge-cut stones (one
// painted stone per face: block_0..3, moss creeping over the top stones) on a ring: outer radius 0.96, inner 0.73 (walls 0.23 thick).
// Tallest at the back (-Z, ~1.3), falling unevenly to knee height at the sides and fully open at the front (+Z: nothing above the
// lowest foundation stones within 40 degrees of +Z). One empty window with an old wooden lintel in the tall back section, off-centre to
// his right (-X) so he never hides it; fallen blocks and rubble round the outside and along the inner foot of the side walls, the
// middle left open. Barnaby's spot: (0, -0.40), 0.33 u in from the back wall's inner face; the stones keep off his hem (RUIN.hem 0.27). No symbols, runes or clues to an owner.
// The game turns it so +Z points along piece-local (0.41, 0.91): rotation.y = atan2(0.41, 0.91) ~ 0.423 rad.
// Cells per part from look.config.mjs -> assetMaterials.tower_ruin.

import { box } from '../lib/geometry.mjs';
import { mulberry32 } from '../lib/jitter.mjs';
import { atlasTexture, placer, sm } from '../lib/paintedAtlas.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.tower_ruin;
const ID = 'tower_ruin';
const D = Math.PI / 180;

export const RUIN = {
  rIn: 0.73, rOut: 0.96, maxH: 1.4, open: 40,   // the open front: |theta| < 40 degrees from +Z
  courses: [0.15, 0.14, 0.15, 0.13, 0.14, 0.15, 0.13, 0.14, 0.15],
  // the broken top: wall height by angle (degrees from +Z toward +X; -180/180 = the back), uneven on purpose
  profile: [[-180, 1.34], [-160, 1.3], [-140, 1.14], [-125, 0.84], [-110, 0.56], [-95, 0.38], [-75, 0.3], [-58, 0.2], [-46, 0.1], [-40, 0],
    [40, 0], [46, 0.1], [60, 0.28], [80, 0.24], [100, 0.4], [118, 0.64], [132, 0.97], [150, 1.22], [165, 1.36], [180, 1.34]],
  window: { theta: -154, w: 0.17, y0: 0.57, y1: 0.86 },   // centre angle (his right of the back), width at the mid radius, sill / head
  spot: [0, -0.4],
  hem: 0.27,   // Barnaby's robe reaches 0.256 u from his axis at ankle height: nothing taller than ~0.02 u stands inside this circle round the spot
};

export default {
  id: ID,
  category: 'building',
  status: 'ready',
  build() {
    const parts = [], r = mulberry32(1871);
    const { rIn, rOut, maxH, courses, profile, window: W } = RUIN, rm = (rIn + rOut) / 2, t = rOut - rIn;
    const H = (th) => { let d = th / D; while (d > 180) d -= 360; while (d < -180) d += 360;
      for (let i = 0; i + 1 < profile.length; i++) { const [a0, h0] = profile[i], [a1, h1] = profile[i + 1]; if (d <= a1) return h0 + ((h1 - h0) * (d - a0)) / (a1 - a0); } return profile[profile.length - 1][1]; };
    const ao = (x, y, z) => (0.7 + 0.3 * sm(0, 0.4, y)) * (Math.hypot(x, z) < rm - 0.02 ? 0.86 : 1);
    const place = placer(parts, ID, { ao });
    // a wedge-cut stone on the ring: length L along the wall, height h, its centre at angle th, bottom at y0; local +Z = outward
    const stone = (th, L, h, y0, spec, seed, { out = 0, depth = t } = {}) => place(box(L, h, depth), spec, seed, (g) => {
      const p = g.attributes.position.array; for (let i = 0; i < p.length; i += 3) p[i] *= (rm + out + p[i + 2]) / rm;   // the ends follow the radii
      g.rotateY((r() - 0.5) * 0.03).rotateY(th).translate(Math.sin(th) * (rm + out), y0 + h / 2, Math.cos(th) * (rm + out));
    }, { u: 'x' });

    // ---- the courses: running bond, each stone kept only where the broken top allows; the window opening left in the back ----
    const wTh = W.theta * D, wHalf = W.w / 2 / rm, noise = (k, th) => (mulberry32(Math.round(th * 1000) * 31 + k * 977)() - 0.5) * 0.1;
    const keep = (k, top, th) => top <= Math.min(maxH, H(th) + noise(k, th));
    let y0 = 0, s = 100;
    courses.forEach((h, k) => {
      const top = y0 + h, inWin = y0 + 1e-3 >= W.y0 && top <= W.y1 + 1e-3;
      // walk the ring from a staggered start; a course through the window starts and ends at its jambs
      const start = inWin ? wTh + wHalf : -Math.PI + (k % 2 ? 0.09 : 0) + r() * 0.05, end = inWin ? wTh - wHalf + 2 * Math.PI : start + 2 * Math.PI;
      let th = start;
      while (th < end - 1e-4) {
        let L = 0.17 + r() * 0.11, dth = L / rm; if (end - th - dth < 0.13 / rm) dth = end - th; L = dth * rm;
        const c = th + dth / 2, hh = h * (0.9 + r() * 0.08);
        if (keep(k, top, c)) {
          const above = k + 1 < courses.length && keep(k + 1, top + courses[k + 1], c), q = Math.floor(r() * 4);
          const mossy = !above ? r() < 0.38 : r() < 0.1;
          const spec = !above ? (mossy ? { y: M.moss, rest: M.mossy[q % 2] } : M.blocks[q]) : mossy ? M.mossy[q % 2] : M.blocks[q];
          stone(c, L - 0.012, hh, y0, spec, s++, { out: (r() - 0.5) * 0.03 });
        }
        th += dth;
      }
      y0 = top;
    });
    // the window's old wooden lintel, through the wall over the opening
    { const g = box(W.w + 0.16, 0.06, t + 0.02); place(g, M.lintel, 90, (m) => m.rotateY(wTh).translate(Math.sin(wTh) * rm, W.y1 + 0.03, Math.cos(wTh) * rm), { u: 'x', aoFn: () => 0.85 }); }

    // ---- foundation stones across the open front (the ring's footprint, nothing above y ~0.1) ----
    for (let th = -36 * D; th < 36 * D; th += 0.2 / rm) {
      if (r() < 0.35) { r(); r(); continue; }
      const L = 0.15 + r() * 0.08, h = 0.05 + r() * 0.05;
      stone(th, L, h, -0.02, M.blocks[Math.floor(r() * 4)], s++, { depth: t * (0.7 + r() * 0.3) });
    }

    // ---- fallen blocks and rubble: round the outside (inside r 1.05: the zone is flat to radius 1) and along the inner foot of the side
    // walls; the middle and his spot stay clear ----
    // A stone that would stand inside the circle his hem sweeps (RUIN.hem round the spot) slides straight out from the spot until its reach
    // (its half diagonal, whatever its turn) clears it; it takes no random draw, so every other stone is where it was
    const rubble = (x, z, L, h, d, seed) => { const yaw = r() * 6.28, tilt = (r() - 0.5) * 0.5, roll = (r() - 0.5) * 0.4, q = Math.floor(r() * 4);
      { const [sx, sz] = RUIN.spot, dx = x - sx, dz = z - sz, dist = Math.hypot(dx, dz), need = RUIN.hem + Math.hypot(L, h, d) / 2;
        if (dist < need) { x = sx + (dx / dist) * need; z = sz + (dz / dist) * need; } }
      place(box(L, h, d), r() < 0.35 ? { y: M.moss, rest: M.blocks[q] } : M.blocks[q], seed, (g) => g.rotateX(tilt).rotateZ(roll).rotateY(yaw).translate(x, h * 0.32, z)); };
    const outside = [[-118, 1.0], [-100, 1.01], [-84, 0.99], [-66, 1.0], [-140, 1.0], [104, 1.0], [122, 1.01], [90, 0.99], [70, 1.0], [140, 1.0], [-30, 1.0], [24, 0.98], [175, 1.0]];
    outside.forEach(([a, r0], i) => { const L = 0.13 + r() * 0.1, rr = Math.min(r0, 1.02 - L / 2); rubble(Math.sin(a * D) * rr, Math.cos(a * D) * rr, L, 0.07 + r() * 0.05, 0.09 + r() * 0.07, 200 + i); });
    const inside = [[-112, 0.62], [-96, 0.6], [-80, 0.64], [92, 0.62], [108, 0.6], [124, 0.63]];
    inside.forEach(([a, rr], i) => { const L = 0.11 + r() * 0.08; rubble(Math.sin(a * D) * rr, Math.cos(a * D) * rr, L, 0.06 + r() * 0.04, 0.08 + r() * 0.06, 230 + i); });
    // small stones scattered at the foot (half sunk)
    for (let i = 0; i < 14; i++) { const a = (r() < 0.5 ? -1 : 1) * (55 + r() * 120) * D, rr = r() < 0.6 ? 0.97 + r() * 0.03 : 0.6 + r() * 0.07, sz = 0.05 + r() * 0.04;
      rubble(Math.sin(a) * rr, Math.cos(a) * rr, sz, sz * 0.7, sz * 0.9, 260 + i); }

    return { parts, textures: { [ID]: atlasTexture(`${ID}_albedo`) } };
  },
};
