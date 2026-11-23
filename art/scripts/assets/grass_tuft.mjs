// grass_tuft -- a few blades, ~0.22 tall, pivot at base (prop, <= 600 tris)
// Single mesh / single material so the engine can sway the top verts.
// Blade colour from look.config.mjs -> assetMaterials.grass_tuft.

import { cone } from '../lib/geometry.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.grass_tuft;

export default {
  id: 'grass_tuft',
  category: 'prop',
  status: 'ready',
  build() {
    const parts = [];
    const blades = 5;
    for (let i = 0; i < blades; i++) {
      const a = (i / blades) * Math.PI * 2 + 0.6;
      const g = cone(0.03, 0.2 + (i % 2) * 0.06, 4).translate(0, 0.1 + (i % 2) * 0.03, 0);
      g.rotateX(Math.sin(a) * 0.34);
      g.rotateZ(Math.cos(a) * 0.34);
      g.translate(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
      parts.push({ material: M.blade, geometry: g });
    }
    return { parts };
  },
};
