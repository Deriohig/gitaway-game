// bake-water.mjs -- bakes the water revamp's game files (see lib/water-bake.mjs for the format; spec
// art/specs/2026-10-23-water-revamp-design.md section 4.1):
//   public/models/water_<piece>.map.bin (main, wetland, highland), water_noise.bin, water_<piece>.glb, water.json,
//   and the water_<piece> entries of public/models/manifest.json (every other entry is left as it is).
// Reads the baked height grids (run bake-pieces.mjs first if the terrain changed). Deterministic (tests/water.test.mjs W1).
//   node bake-water.mjs            (in art/scripts)
import fs from 'node:fs/promises';
import path from 'node:path';
import { bakeWater, MODELS } from './lib/water-bake.mjs';

const t0 = Date.now();
const out = await bakeWater();
const manifestPath = path.join(MODELS, 'manifest.json');
let manifest = { version: 1, assets: {} };
try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { /* none yet */ }
for (const [name, bytes] of Object.entries(out.files)) await fs.writeFile(path.join(MODELS, name), bytes);
for (const k of Object.keys(manifest.assets)) if (/^water_/.test(k) && !(out.manifest || {})[k]) delete manifest.assets[k];
for (const [k, e] of Object.entries(out.manifest || {})) manifest.assets[k] = e;
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\n  baked water in ${Date.now() - t0} ms -> ${MODELS}`);
for (const [name, bytes] of Object.entries(out.files)) console.log('  ' + name.padEnd(26) + (bytes.length / 1024).toFixed(1).padStart(8) + ' KB');
for (const [id, m] of Object.entries(out.maps)) console.log(`  ${id.padEnd(10)} map ${m.size.join('x')} @ [${m.origin.join(', ')}], wet texels ${m.stats.wet}, deepest ${m.stats.maxDepth.toFixed(3)} u`);
console.log('');
