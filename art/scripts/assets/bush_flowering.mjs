// bush_flowering -- flowering shrub (prop, <= 600 tris)
// Lobe + flower tokens from look.config.mjs -> assetMaterials.bush_flowering.

import { ico } from '../lib/geometry.mjs';
import { jitter } from '../lib/jitter.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.bush_flowering;

export default {
  id: 'bush_flowering',
  category: 'prop',
  status: 'ready',
  build() {
    const parts = [];
    const lumps = [
      { r: 0.28, pos: [0.0, 0.26, 0.0], seed: 311 },
      { r: 0.22, pos: [-0.16, 0.2, 0.08], seed: 312 },
      { r: 0.21, pos: [0.18, 0.21, -0.05], seed: 313 },
      { r: 0.18, pos: [0.02, 0.4, 0.03], seed: 314 },
    ];
    lumps.forEach((l, i) => {
      const g = ico(l.r, 1).translate(l.pos[0], l.pos[1], l.pos[2]);
      jitter(g, 0.045, l.seed);
      parts.push({ material: M.lobes[i % M.lobes.length], geometry: g });
    });
    const dots = [
      [0.0, 0.5, 0.06], [-0.2, 0.32, 0.16], [0.22, 0.34, 0.1], [0.1, 0.42, -0.2],
      [-0.12, 0.42, -0.14], [0.28, 0.24, -0.08], [-0.26, 0.24, -0.02],
    ];
    dots.forEach(([x, y, z], i) => {
      parts.push({ material: M.flowers[i % M.flowers.length], geometry: ico(0.05, 0).translate(x, y, z) });
    });
    return { parts };
  },
};
