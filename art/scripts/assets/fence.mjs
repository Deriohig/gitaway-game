// fence -- one classic chunky wood fence segment (prop, <= 600 tris)
// 0.62 long along Z, posts 0.46 tall at both ends, rails at 0.16 and 0.34.
// Timber colour from look.config.mjs -> assetMaterials.fence.

import { box } from '../lib/geometry.mjs';
import { jitter } from '../lib/jitter.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.fence;

export default {
  id: 'fence',
  category: 'prop',
  status: 'ready',
  build() {
    const parts = [];
    const SEG = 0.62;
    for (const z of [SEG / 2, -SEG / 2]) {
      parts.push({ material: M.timber, geometry: box(0.1, 0.46, 0.1).translate(0, 0.23, z) });
      parts.push({ material: M.timber, geometry: box(0.13, 0.05, 0.13).translate(0, 0.455, z) });
    }
    for (const y of [0.16, 0.34]) {
      const rail = box(0.06, 0.07, SEG).translate(0, y, 0);
      jitter(rail, 0.012, y === 0.16 ? 5 : 6);
      parts.push({ material: M.timber, geometry: rail });
    }
    return { parts };
  },
};
