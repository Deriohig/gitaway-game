// farmhouse -- storybook cottage (building, budget <= 3000 tris)
// Part colours come from look.config.mjs -> assetMaterials.farmhouse.

import { box, cyl, gablePrism, ico } from '../lib/geometry.mjs';
import LOOK from '../../config/look.config.mjs';

const M = LOOK.assetMaterials.farmhouse;

export default {
  id: 'farmhouse',
  category: 'building',
  status: 'ready',
  build() {
    const parts = [];
    const add = (material, geometry, node) => parts.push({ material, geometry, node });

    // --- Foundation --- stone, 2.3 x 1.9 footprint, base on y=0.
    add(M.foundation, box(2.3, 0.3, 1.9).translate(0, 0.15, 0));

    // --- Walls --- cream, 2.1 x 1.7 footprint, 1.3 tall, sat on the foundation.
    add(M.walls, box(2.1, 1.3, 1.7).translate(0, 0.95, 0));

    // --- Timber corner posts ---
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        add(M.posts, box(0.12, 1.3, 0.12).translate(sx * 1.0, 0.95, sz * 0.8));
      }
    }

    // --- Gable roof --- ridge along X, peak ~2.55, eaves overhang.
    add(M.roof, gablePrism(1.9, 0.95, 2.3).translate(0, 1.6, 0));
    // roof depth: ridge cap, eave fascia, and a couple of tile bands per slope.
    add(M.roofTrim, box(2.44, 0.1, 0.16).translate(0, 2.56, 0));            // ridge cap
    add(M.roofTrim, box(2.44, 0.12, 0.1).translate(0, 1.6, 0.95));          // +Z eave fascia
    add(M.roofTrim, box(2.44, 0.12, 0.1).translate(0, 1.6, -0.95));         // -Z eave fascia
    for (const t of [0.34, 0.66]) {
      const z = 0.95 * (1 - t), y = 1.6 + 0.95 * t;
      add(M.roofTrim, box(2.36, 0.03, 0.09).rotateX(-Math.PI / 4).translate(0, y, z));  // +Z tiles
      add(M.roofTrim, box(2.36, 0.03, 0.09).rotateX(Math.PI / 4).translate(0, y, -z));  // -Z tiles
    }

    // --- Door (front +Z) + step ---
    add(M.door, box(0.5, 0.85, 0.08).translate(0, 0.725, 0.9));
    add(M.step, box(0.62, 0.12, 0.22).translate(0, 0.07, 1.05));

    // --- Front windows (Glow) + flower boxes + flowers ---
    for (const sx of [1, -1]) {
      const x = sx * 0.62;
      add(M.windows, box(0.42, 0.42, 0.06).translate(x, 1.02, 0.87));
      add(M.flowerBox, box(0.48, 0.1, 0.14).translate(x, 0.8, 0.92)); // flower box
      [-0.14, 0, 0.14].forEach((dx, i) => {
        add(M.flowers[i % M.flowers.length], ico(0.05, 0).translate(x + dx, 0.88, 0.94));
      });
    }

    // --- Porch (front) --- deck + 2 posts + little awning.
    add(M.porch, box(1.4, 0.1, 0.66).translate(0, 0.33, 1.2)); // deck
    for (const sx of [1, -1]) {
      add(M.porch, box(0.1, 0.95, 0.1).translate(sx * 0.6, 0.85, 1.48)); // posts
    }
    add(M.awning, gablePrism(0.9, 0.28, 1.5).translate(0, 1.3, 1.25)); // awning

    // --- Side windows (Glow), one each side ---
    for (const sx of [1, -1]) {
      add(M.windows, box(0.06, 0.42, 0.42).translate(sx * 1.08, 1.0, 0));
    }

    // --- Lean-to shed on -X ---
    add(M.shed, box(0.9, 0.8, 1.0).translate(-1.5, 0.4, 0));
    add(M.shedRoof, box(1.02, 0.08, 1.1).rotateZ(0.2).translate(-1.5, 0.9, 0)); // mono-pitch roof

    // --- Firewood stack on +X at the back (-Z) --- logs lying along Z.
    const logXY = [[1.2, 0.08], [1.36, 0.08], [1.52, 0.08], [1.28, 0.22], [1.44, 0.22]];
    for (const [x, y] of logXY) {
      add(M.firewood, cyl(0.08, 0.08, 0.5, 6).rotateX(Math.PI / 2).translate(x, y, -0.55));
    }

    // --- Chimney (back-right: +X, -Z) rising through the roof ---
    add(M.chimney, box(0.3, 1.75, 0.3).translate(0.72, 1.82, -0.5));

    return { parts, nodes: { Smoke: { translation: [0.72, 2.75, -0.5], empty: true } } };
  },
};
