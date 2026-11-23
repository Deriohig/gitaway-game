// tree_round_a -- full rounded broadleaf (plant, <= 600 tris)
// Clearly visible timber trunk, then overlapping faceted canopy lobes with
// depth-graded greens (tokens from look.config.mjs -> assetMaterials.tree_round_a),
// all under a `Canopy` node pivoted near the trunk top.

import { cyl, ico } from '../lib/geometry.mjs';
import { jitter } from '../lib/jitter.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.tree_round_a;

export default {
  id: 'tree_round_a',
  category: 'plant',
  status: 'ready',
  build() {
    const parts = [];
    parts.push({ material: M.trunk, geometry: cyl(0.11, 0.17, 0.9, 7).translate(0, 0.45, 0) });
    parts.push({ material: M.flare, geometry: cyl(0.17, 0.24, 0.16, 7).translate(0, 0.08, 0) });

    // canopy lobes (world space; offset to the Canopy pivot by the builder)
    const lobes = [
      { r: 0.55, pos: [0.0, 1.35, 0.0], seed: 11 },
      { r: 0.42, pos: [-0.42, 1.2, 0.12], seed: 12 },
      { r: 0.42, pos: [0.42, 1.26, -0.08], seed: 13 },
      { r: 0.5, pos: [0.06, 1.56, 0.08], seed: 14 },
      { r: 0.4, pos: [0.14, 1.86, 0.06], seed: 15 },
      { r: 0.34, pos: [-0.2, 1.72, -0.12], seed: 16 },
    ];
    lobes.forEach((l, i) => {
      const g = ico(l.r, 1).translate(l.pos[0], l.pos[1], l.pos[2]);
      jitter(g, 0.05, l.seed);
      parts.push({ node: 'Canopy', material: M.canopy[i % M.canopy.length], geometry: g });
    });

    return { parts, nodes: { Canopy: { translation: [0, 0.9, 0] } } };
  },
};
