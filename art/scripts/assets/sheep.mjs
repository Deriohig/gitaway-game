// sheep -- lumpy wool animal (animal, budget <= 1500 tris)
// Lumpy ivory wool body from overlapping jittered icospheres, 4 short dark legs with feet on y=0, and a dark `Head` (face, cream
// snout, ears) under a `Head` node pivoted at the neck. Faces +Z. At the brief's size (ASSETS.md: ~0.75 tall, ~0.8 long): a compact
// wool ball with the face half sunk into the front of the fleece (it was 0.88 x 1.18, a long body with the head out on a neck).

import { cyl, ico } from '../lib/geometry.mjs';
import { jitter } from '../lib/jitter.mjs';

const K = 0.88;   // the parts are authored at 1 / K (the old part sizes and jitter) and scaled by K at the end

export default {
  id: 'sheep',
  category: 'animal',
  build() {
    const parts = [];

    // --- Legs (base) --- 4 short dark cylinders, feet on y=0, meeting the body.
    const legH = 0.3;
    const legPos = [
      [0.16, 0.15], [-0.16, 0.15], // front (+Z)
      [0.16, -0.15], [-0.16, -0.15], // back (-Z)
    ];
    for (const [x, z] of legPos) {
      const leg = cyl(0.055, 0.07, legH, 5).translate(x, legH / 2, z);
      parts.push({ material: 'DeepWarmInk', geometry: leg });
    }

    // --- Wool body (base) --- overlapping jittered icospheres, ivory.
    // Main ellipsoid: a near-round fleece (slightly flattened in X).
    const body = ico(0.3, 1);
    body.scale(0.92, 0.9, 1.0).translate(0, 0.5, 0);
    jitter(body, 0.05, 101);
    parts.push({ material: 'WarmIvory', geometry: body });

    const lumps = [
      { r: 0.22, pos: [0.0, 0.62, -0.05], seed: 102 },
      { r: 0.2, pos: [-0.17, 0.52, 0.06], seed: 103 },
      { r: 0.2, pos: [0.17, 0.52, 0.06], seed: 104 },
      { r: 0.18, pos: [0.0, 0.5, -0.17], seed: 105 }, // rump
    ];
    for (const l of lumps) {
      const g = ico(l.r, 1).translate(l.pos[0], l.pos[1], l.pos[2]);
      jitter(g, 0.05, l.seed);
      parts.push({ material: 'WarmIvory', geometry: g });
    }

    // --- Head (under `Head` node, pivot at the neck) --- authored in world space.
    // Dark face, cream snout, dark ears; the face sits half in the front of the fleece.
    const face = ico(0.17, 1).translate(0, 0.56, 0.33);
    jitter(face, 0.02, 201);
    parts.push({ node: 'Head', material: 'DeepWarmInk', geometry: face });

    const snout = ico(0.09, 0).scale(1, 0.9, 1.2).translate(0, 0.5, 0.46);
    parts.push({ node: 'Head', material: 'SoftCream', geometry: snout });

    for (const ex of [0.11, -0.11]) {
      const ear = ico(0.06, 0).scale(1.3, 0.7, 0.8).translate(ex, 0.66, 0.29);
      parts.push({ node: 'Head', material: 'DeepWarmInk', geometry: ear });
    }

    for (const p of parts) p.geometry.scale(K, K, K);
    return {
      parts,
      nodes: {
        // Pivot at the neck (front-top of the body, where the face meets the fleece) so the engine can tilt the head down to
        // graze/peck on X.
        Head: { translation: [0, 0.55 * K, 0.2 * K] },
      },
    };
  },
};
