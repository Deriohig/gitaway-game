// node plantkit.mjs <outDir> [id ...]  -- writes painterly kit models (lib/plantkit.mjs): <id>.glb for each (default: the 12 ground-cover
// plants; any crop_*, flowerbed or shrub_* id too) and kit_textures.png, every texture over a grey ground (for review). Prints tris and size.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KIT, CROPS, BEDS, SHRUBS, buildPlant, paintPlant } from './lib/plantkit.mjs';
import { encodePNG } from './lib/png.mjs';

const [out, ...only] = process.argv.slice(2);
if (!out) { console.error('usage: node plantkit.mjs <outDir> [id ...]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const ids = only.length ? only : Object.keys(KIT), io = new NodeIO(), imgs = [];
for (const id of ids) {
  const bytes = await buildPlant(id), f = path.join(out, id + '.glb'); fs.writeFileSync(f, bytes);
  const K = KIT[id] || CROPS[id] || BEDS[id] || SHRUBS[id], tris = (await io.readBinary(bytes)).getRoot().listMeshes()[0].listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0);
  console.log(id.padEnd(20), K.group.padEnd(11), String(tris).padStart(4), 'tris', (bytes.length / 1024).toFixed(1).padStart(6), 'KB', K.tex.join('x'));
  imgs.push([id, paintPlant(id)]);
}
// the review sheet: each texture composited over grey, in a row-wrapped grid of 256 px cells
const cell = 272, cols = 4, rows = Math.ceil(imgs.length / cols), W = cell * cols, H = cell * rows, sheet = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) sheet.set([150, 150, 146, 255], i * 4);
imgs.forEach(([, im], k) => { const s = Math.min(256 / im.width, 256 / im.height), ox = (k % cols) * cell + 8, oy = Math.floor(k / cols) * cell + 8;
  for (let y = 0; y < Math.round(im.height * s); y++) for (let x = 0; x < Math.round(im.width * s); x++) {
    const j = (Math.min(im.height - 1, Math.floor(y / s)) * im.width + Math.min(im.width - 1, Math.floor(x / s))) * 4, a = im.data[j + 3] / 255, o = ((oy + y) * W + ox + x) * 4;
    for (let c = 0; c < 3; c++) sheet[o + c] = Math.round(im.data[j + c] * a + sheet[o + c] * (1 - a)); } });
fs.writeFileSync(path.join(out, 'kit_textures.png'), encodePNG({ width: W, height: H, data: sheet }));
console.log('wrote', ids.length, 'plants and kit_textures.png to', out);
