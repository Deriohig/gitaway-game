// rock_b -- a lumpier two-lobe stone, fits a 1 x 0.7 x 1 box (prop, <= 600 tris)
// Colours from look.config.mjs -> assetMaterials.rock_b.

import { ico } from '../lib/geometry.mjs';
import { jitter } from '../lib/jitter.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.rock_b;

export default {
  id: 'rock_b',
  category: 'prop',
  status: 'ready',
  build() {
    const parts = [];
    const main = ico(0.42, 1).scale(1.05, 0.7, 0.9).translate(0.06, 0.3, 0);
    jitter(main, 0.075, 411);
    parts.push({ material: M.body, geometry: main });

    const lobe = ico(0.26, 1).scale(1.0, 0.8, 1.0).translate(-0.3, 0.2, 0.08);
    jitter(lobe, 0.06, 412);
    parts.push({ material: M.accent, geometry: lobe });

    return { parts };
  },
};
