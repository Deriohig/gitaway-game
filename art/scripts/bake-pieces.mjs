// bake-pieces.mjs -- bakes the 8 island-blueprint pieces into game-ready files (see lib/bake.mjs for the format):
//   public/models/piece_<id>.glb + piece_<id>.height.bin, and the piece_<id> entries of public/models/manifest.json.
// Writes ONLY piece_* files and merges ONLY the piece_* manifest entries (every other entry is left as it is).
// Deterministic (a re-bake gives byte-identical files; tests/bake.test.mjs B10).
//   node bake-pieces.mjs            (in art/scripts; ~5 s)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bakePieces, PROFILE } from './lib/bake.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.resolve(__dirname, '../../public/models'), manifestPath = path.join(modelsDir, 'manifest.json');

const t0 = Date.now();
const out = await bakePieces();
await fs.mkdir(modelsDir, { recursive: true });
let manifest = { version: 1, assets: {} };
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { /* none yet */ }
manifest.version = manifest.version || 1; manifest.assets = manifest.assets || {};
for (const k of Object.keys(manifest.assets)) if (k.startsWith('piece_') && !out.order.includes(k.slice(6))) delete manifest.assets[k];   // a piece that no longer exists
const rows = []; let tris = 0, kb = 0;
for (const id of out.order) {
  const p = out.pieces[id];
  await fs.writeFile(path.join(modelsDir, p.entry.file), p.glb);
  await fs.writeFile(path.join(modelsDir, p.entry.height.file), p.height);
  manifest.assets['piece_' + id] = p.entry;
  tris += p.stats.tris; kb += p.stats.kb;
  rows.push('  ' + id.padEnd(10) + String(p.stats.tris).padStart(6) + String(p.stats.verts).padStart(8) + p.stats.kb.toFixed(1).padStart(9) +
    `   ${p.stats.grid[0]}x${p.stats.grid[1]} @ [${p.entry.height.origin.join(', ')}] (${(p.height.length / 1024).toFixed(1)} KB)`);
}
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n  baked ${out.order.length} pieces (profile ${JSON.stringify(PROFILE)}, look "${out.presetName}") in ${Date.now() - t0} ms`);
console.log('  piece       tris   verts       KB   height grid');
console.log('  ' + '-'.repeat(76));
console.log(rows.join('\n'));
console.log('  ' + '-'.repeat(76));
console.log(`  total ${String(tris).padStart(9)} ${kb.toFixed(1).padStart(16)}`);
console.log(`  -> ${modelsDir} (+ manifest.json, piece_* entries only)\n`);
