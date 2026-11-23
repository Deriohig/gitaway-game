// flowerbed -- oval bed ~1.1 x 0.8 with ~11 flowers (prop, <= 600 tris)
// Tokens from look.config.mjs -> assetMaterials.flowerbed.

import { ico } from '../lib/geometry.mjs';
import { jitter } from '../lib/jitter.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.flowerbed;

export default {
  id: 'flowerbed',
  category: 'prop',
  status: 'ready',
  build() {
    const parts = [];
    const soil = ico(0.52, 1).scale(1.05, 0.22, 0.78).translate(0, 0.1, 0);
    jitter(soil, 0.025, 501);
    parts.push({ material: M.soil, geometry: soil });

    const green = ico(0.46, 1).scale(1.0, 0.28, 0.76).translate(0, 0.16, 0);
    jitter(green, 0.03, 502);
    parts.push({ material: M.foliage, geometry: green });

    const spots = [
      [0.0, 0.3], [0.24, 0.12], [-0.26, 0.1], [0.12, -0.18], [-0.14, -0.16],
      [0.36, -0.04], [-0.38, -0.02], [0.02, 0.2], [0.2, 0.26], [-0.2, 0.24], [-0.02, -0.26],
    ];
    spots.forEach(([x, z], i) => {
      const y = 0.27 + (i % 3) * 0.02;
      parts.push({ material: M.flowers[i % M.flowers.length], geometry: ico(0.055, 0).translate(x, y, z) });
    });
    return { parts };
  },
};
