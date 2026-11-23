// bush_a -- rounded shrub with depth-graded greens (prop, <= 600 tris)
// Lobe tokens from look.config.mjs -> assetMaterials.bush_a.

import { ico } from '../lib/geometry.mjs';
import { jitter } from '../lib/jitter.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.bush_a;

export default {
  id: 'bush_a',
  category: 'prop',
  status: 'ready',
  build() {
    const parts = [];
    const lumps = [
      { r: 0.28, pos: [0.0, 0.26, 0.0], seed: 301 },
      { r: 0.22, pos: [-0.18, 0.2, 0.08], seed: 302 },
      { r: 0.22, pos: [0.19, 0.22, -0.05], seed: 303 },
      { r: 0.19, pos: [0.02, 0.4, 0.04], seed: 304 },
    ];
    lumps.forEach((l, i) => {
      const g = ico(l.r, 1).translate(l.pos[0], l.pos[1], l.pos[2]);
      jitter(g, 0.045, l.seed);
      parts.push({ material: M.lobes[i % M.lobes.length], geometry: g });
    });
    return { parts };
  },
};
