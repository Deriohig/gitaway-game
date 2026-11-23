// clumping.mjs  --  STYLE C4 clumping index from the viewer's tree placements (NO deps).
// =============================================================================
// Usage:  node clumping.mjs <placements.json> [--radius 6] [--min 5]
// placements.json is dumped by capture.mjs from window.__placements:
//   { seed, trees:[{x,z,species}], ... }   (fixed farm-cluster trees excluded)
//
// clumpShare = share of scattered trees that belong to a clump, where a tree is
// "in a clump" when at least (min-1) OTHER trees stand within `radius` u of it
// (i.e. >= min trees inside a radius-u circle centred on it). STYLE C4 target:
// >= 70% with radius ~6, min 5. Also reports single-linkage groups (link = radius/2)
// so the 5-20 clump-size rule can be read.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function clumpingIndex(trees, { radius = 6, min = 5 } = {}) {
  const n = trees.length, r2 = radius * radius;
  if (!n) return { trees: 0, clumped: 0, share: 0, groups: {} };
  // spatial hash for neighbour counts
  const cell = radius, grid = new Map(), key = (a, b) => a + ',' + b;
  trees.forEach((t, i) => { const k = key(Math.floor(t.x / cell), Math.floor(t.z / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  const near = (i, rr) => {
    const t = trees[i], cx = Math.floor(t.x / cell), cz = Math.floor(t.z / cell), out = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of grid.get(key(cx + dx, cz + dz)) || []) {
      if (j === i) continue; const ddx = trees[j].x - t.x, ddz = trees[j].z - t.z; if (ddx * ddx + ddz * ddz <= rr) out.push(j);
    }
    return out;
  };
  let clumped = 0;
  for (let i = 0; i < n; i++) if (near(i, r2).length >= min - 1) clumped++;
  // single-linkage groups at link = radius/2 (canopy-adjacent trees)
  const link = radius / 2, parent = trees.map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < n; i++) for (const j of near(i, link * link)) { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
  const sizes = new Map(); for (let i = 0; i < n; i++) { const r = find(i); sizes.set(r, (sizes.get(r) || 0) + 1); }
  const groups = { singles: 0, '2-4': 0, '5-20': 0, '21+': 0, largest: 0, inGroups5plus: 0 };
  for (const s of sizes.values()) {
    if (s === 1) groups.singles++; else if (s <= 4) groups['2-4']++; else if (s <= 20) groups['5-20']++; else groups['21+']++;
    if (s >= 5) groups.inGroups5plus += s; if (s > groups.largest) groups.largest = s;
  }
  groups.inGroups5plusShare = groups.inGroups5plus / n;
  return { trees: n, clumped, share: clumped / n, radius, min, link, groups };
}

export function clumpingFromFile(file, opts) {
  const P = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { seed: P.seed, ...clumpingIndex(P.trees || [], opts) };
}

// spec v3.1: per PIECE, with the rescaled radius/min from world.config archipelago.composition.clumping
export function clumpingByPiece(file, rules) {
  const P = JSON.parse(fs.readFileSync(file, 'utf8')), out = {};
  for (const [id, r] of Object.entries(rules)) { const trees = (P.trees || []).filter((t) => t.piece === id); out[id] = { ...clumpingIndex(trees, r), rule: r }; }
  const all = Object.values(out), n = all.reduce((s, r) => s + r.trees, 0), c = all.reduce((s, r) => s + r.clumped, 0);
  return { seed: P.seed, pieces: out, total: { trees: n, clumped: c, share: n ? c / n : 0 } };
}

function main() {
  const a = process.argv.slice(2), files = [], opts = {};
  for (let i = 0; i < a.length; i++) { if (a[i] === '--radius') opts.radius = +a[++i]; else if (a[i] === '--min') opts.min = +a[++i]; else files.push(a[i]); }
  if (!files.length) { console.error('usage: node clumping.mjs <placements.json ...> [--radius 6] [--min 5]'); process.exit(2); }
  for (const f of files) {
    const r = clumpingFromFile(f, opts);
    console.log(`  ${path.basename(f)}  seed=${r.seed}  trees=${r.trees}  clumped=${r.clumped}  clumpShare=${(r.share * 100).toFixed(1)}%  ` +
      `(>=${r.min} within ${r.radius}u; STYLE C4 target >=70%)  groups@${r.link}u: ${JSON.stringify(r.groups)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
