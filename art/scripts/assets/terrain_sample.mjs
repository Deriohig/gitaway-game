// terrain_sample -- GROUND STYLE SAMPLE (draft; in-game terrain is procedural).
// A low grass ground tile (~5 x 4) with a slightly uneven faceted top in the
// warmed grass green, a small warm dirt/path patch for colour contrast, and a
// few grass tufts. Base centre on y=0; the grass surface sits at ~y=0.20 so the
// diorama objects can nestle on top of it in the viewer.

import { box, cone } from '../lib/geometry.mjs';
import { jitter } from '../lib/jitter.mjs';

const TOP = 0.2; // nominal grass surface height

// A single splayed grass tuft (3-4 thin blades) sitting on the surface.
function tuft(parts, x, z, seed, mat = 'Grass') {
  const blades = 4;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + seed;
    const g = cone(0.028, 0.22 + (i % 2) * 0.05, 4).translate(0, 0.12, 0);
    g.rotateX(Math.sin(a) * 0.32);
    g.rotateZ(Math.cos(a) * 0.32);
    g.translate(x + Math.cos(a) * 0.04, TOP, z + Math.sin(a) * 0.04);
    parts.push({ material: i % 3 === 0 ? 'SageGreen' : mat, geometry: g });
  }
}

export default {
  id: 'terrain_sample',
  category: 'terrain',
  status: 'draft',
  build() {
    const parts = [];

    // --- Grass tile --- faceted slab, 5 x 4, 0.2 tall. Jitter ONLY the top
    // surface (y near 0.2) so the ground reads gently uneven; keep the base flat
    // on y=0 and the seams welded (position-coherent jitter).
    const tile = box(5, 0.2, 4, 10, 1, 8).translate(0, 0.1, 0);
    jitter(tile, 0.07, 71, { filter: (x, y) => y > 0.06, axisScale: [0.2, 1, 0.2] });
    parts.push({ material: 'Grass', geometry: tile });

    // --- Dirt/path patch --- warm soil, front-centre (leads to the house door),
    // embedded a touch into the grass to avoid z-fighting.
    const path = box(0.85, 0.09, 1.8, 3, 1, 5).translate(0.3, TOP, 0.85);
    jitter(path, 0.03, 72, { filter: (x, y) => y > TOP, axisScale: [0.4, 1, 0.4] });
    parts.push({ material: 'Dirt', geometry: path });

    // --- Grass tufts --- scattered, clear of the house/tree/path footprints.
    const spots = [
      [-0.7, 1.55, 81], [1.95, -1.3, 82], [-2.1, -1.0, 83],
      [-1.15, 1.5, 84], [2.1, 1.25, 85], [-2.25, 0.85, 86],
    ];
    for (const [x, z, s] of spots) tuft(parts, x, z, s);

    return { parts };
  },
};
