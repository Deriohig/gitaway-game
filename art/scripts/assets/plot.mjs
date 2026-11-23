// plot -- the garden plot (ART-PLAN P0-1 / A4, stage 2 Garden; owner 2026-10-25): PAINTED procedural on the shared painted atlas
// (lib/paintedAtlas.mjs), replacing the flat stand-in that read as a wooden board. A soft mound of tilled soil in three furrow rows along
// X (the atlas `soil` cell, painted from ART-BIBLE §B.2 soil.bed #6E5444 / soil.shade #5B4538 / soil.dry #8A6B55): each row's crest at
// y ~0.174 and its troughs at ~0.146, around the crops' y 0.16 (Garden.tsx draws a crop at the plot's origin + 0.16), the rows rounding
// down to 0.146 at their ends, inside a low edging of weathered grey boards (plank_grey: lighter and less red than MutedWood against the
// soil, ART-BIBLE §B.2). The boards stop at y <= 0.155, under the game's selection outline (Garden.tsx Outline: bars 0.48-0.52 out from
// the centre at y 0.16-0.18; the first boards reached 0.188 and buried it), and their outside stays inside +-0.51 (1.02, the old
// footprint). The soil top 0.94 x 0.94; <= 300 tris (ASSET-RULES §5, the plot class). Origin at the base centre on y 0. One textured
// material (the atlas), baked shade in COLOR_0. Cells per part from look.config.mjs -> assetMaterials.plot.
import { PlaneGeometry } from 'three';
import { box } from '../lib/geometry.mjs';
import { atlasTexture, placer, sm } from '../lib/paintedAtlas.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.plot;
const ID = 'plot';
// half: the soil's half-width (0.94 top); board: the edging's thickness; top: the boards' top (+ <= 0.002 hand jitter: <= 0.155, under
// the outline's 0.16); crest / trough: the furrow heights; jit: the boards' hand jitter
export const PLOT = { half: 0.47, board: 0.035, top: 0.152, crest: 0.174, trough: 0.146, rows: 3, jit: 0.002 };

export default {
  id: ID,
  category: 'prop',
  status: 'ready',
  build() {
    const parts = [], { half, board, top, crest, trough, rows, jit } = PLOT, rw = (2 * half) / rows;
    const place = placer(parts, ID, { ground: true });
    // the soil: each row in two tiles (4 x 4 quads), each tile mapping the whole soil cell, so the cell repeats along the row (u = x);
    // across the row (z) the furrow profile, crest mid-row and a trough at each row edge, with a little lumpiness from the world
    // position (continuous across the tiles); along the row its ends round down to the trough height at the boards (no soil stands
    // above the edging); darker toward the boards (the soil lies in their shade)
    const edge = (x, y, z) => 0.74 + 0.26 * sm(0, 0.12, half - Math.max(Math.abs(x), Math.abs(z)));
    for (let k = 0; k < rows; k++) for (const sx of [-1, 1]) {
      const zc = -half + rw * (k + 0.5), xc = sx * half / 2, g = new PlaneGeometry(half, rw, 4, 4).rotateX(-Math.PI / 2), p = g.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) { const v = p[i + 2] / rw + 0.5, wx = p[i] + xc, end = sm(0, 0.12, half - Math.abs(wx));
        p[i + 1] = trough + ((crest - trough) * Math.sin(Math.PI * v) + 0.003 * Math.sin(wx * 23 + k * 1.7) * Math.sin(Math.PI * v)) * end; }
      place(g, M.soil, 60 + k * 2 + (sx > 0 ? 1 : 0), (q) => q.translate(xc, 0, zc), { u: 'x', aoFn: edge });
    }
    // the edging: two long boards along X (lapping the corners) and two between them along Z; hand jitter only, darker low
    const low = (x, y) => 0.7 + 0.3 * sm(0, 0.11, y), o = half + board / 2;
    for (const s of [-1, 1]) {
      place(box(2 * (half + board), top, board), M.edging, 1 + s, (q) => q.translate(0, top / 2, s * o), { u: 'x', aoFn: low, jit });
      place(box(board, top - 0.004, 2 * half), M.edging, 4 + s, (q) => q.translate(s * o, (top - 0.004) / 2, 0), { u: 'z', aoFn: low, jit });
    }
    return { parts, textures: { [ID]: atlasTexture(`${ID}_albedo`) } };
  },
};
