// rock_a -- chunky faceted stone fitting a 1 x 0.7 x 1 box (prop, <= 600 tris)
// Colour from look.config.mjs -> assetMaterials.rock_a.

import { ico } from '../lib/geometry.mjs';
import { jitter } from '../lib/jitter.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.rock_a;

export default {
  id: 'rock_a',
  category: 'prop',
  status: 'ready',
  build() {
    const g = ico(0.5, 1).scale(1.0, 0.68, 0.96).translate(0, 0.34, 0);
    jitter(g, 0.08, 401);
    return { parts: [{ material: M.body, geometry: g }] };
  },
};
