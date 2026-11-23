// terrain.test.mjs -- regression invariants for the Gitaway terrain rebuild. Pure node, array-in/array-out, no WebGL.
// The rebuilt architecture: one watertight heightfield, |dTier| <= 1, a triangle-exact sampler, per-face rock. The legacy analytic sampler is kept as one RED check.
// Usage:  node tests/terrain.test.mjs
import GT from '../lib/terrain.mjs';
import L from '../../config/look.config.mjs';
import MOD from '../../config/modules.config.mjs';
import W3 from '../../config/world.config.mjs';

const W = MOD.world, TS = W.testSeed, B = L.terrain.colour.faceBands, results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
// one result per subject: `checks` maps label -> condition, the failing labels lead the detail
const all = (name, checks, detail = '') => { const bad = Object.keys(checks).filter((k) => !checks[k]); ok(name, !bad.length, (bad.length ? `failed: ${bad.join('; ')} | ` : '') + detail); };

const noise = GT.makeNoise(L.terrain.elevation.seed), fixedWorld = GT.buildWorld(L, MOD, { seed: TS, testMode: true });
const gridFixed = GT.buildHeightGrid(L, fixedWorld.world, fixedWorld.built, noise), trisFixed = GT.gridTriangles(gridFixed);

// independent 3-point plane interpolation (ground truth for the mesh surface), the same split as gridTriangles
function planeInterp(grid, x, z) {
  const { seg, n, X0, Z0, dx, dz, h } = grid, fx = (x - X0) / dx, fz = (z - Z0) / dz;
  const gi = Math.min(Math.floor(fx), seg - 1), gj = Math.min(Math.floor(fz), seg - 1), u = fx - gi, v = fz - gj, P = (ii, jj) => [X0 + ii * dx, h[jj * n + ii], Z0 + jj * dz];
  const [p0, p1, p2] = u >= v ? [P(gi, gj), P(gi + 1, gj + 1), P(gi + 1, gj)] : [P(gi, gj), P(gi, gj + 1), P(gi + 1, gj + 1)];
  const det = (p1[2] - p2[2]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[2] - p2[2]), a = ((p1[2] - p2[2]) * (x - p2[0]) + (p2[0] - p1[0]) * (z - p2[2])) / det, b = ((p2[2] - p0[2]) * (x - p2[0]) + (p0[0] - p2[0]) * (z - p2[2])) / det;
  return a * p0[1] + b * p1[1] + (1 - a - b) * p2[1];
}
// raw (unflipped) face normal + slope for a triangle of grid indices
function faceInfo(grid, tri) {
  const v = tri.map((i) => GT.nodeXYZ(grid, i)), u = [0, 1, 2].map((k) => v[1][k] - v[0][k]), w = [0, 1, 2].map((k) => v[2][k] - v[0][k]);
  const nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0], len = Math.hypot(nx, ny, nz) || 1e-9;
  return { rawNy: ny, area: 0.5 * len, slope: 1 - (ny / len) * (ny < 0 ? -1 : 1), cy: (v[0][1] + v[1][1] + v[2][1]) / 3, cx: (v[0][0] + v[1][0] + v[2][0]) / 3, cz: (v[0][2] + v[1][2] + v[2][2]) / 3 };
}
const infos = trisFixed.map((t) => faceInfo(gridFixed, t)), throws = (fn) => { try { fn(); return false; } catch { return true; } };
const rndPoints = (g, seed, n) => { const rng = GT.mulberry32(seed), out = []; for (let t = 0; t < n; t++) out.push([g.X0 + (0.5 + rng() * (g.seg - 1)) * g.dx, g.Z0 + (0.5 + rng() * (g.seg - 1)) * g.dz]); return out; };   // quad centres + edge midpoints, where a curved field diverges from the plane

// A. |dTier| <= 1 across all neighbours, many seeds
{ let worst = 0, worstSeed = 0;
  for (let s = 1; s <= 40; s++) { const d = GT.maxNeighbourTierDelta(GT.buildWorld(L, MOD, { seed: s, testMode: false }).built); if (d > worst) { worst = d; worstSeed = s; } }
  ok('tierDelta<=1 (seeds 1..40)', worst <= 1, `max |dTier|=${worst} (seed ${worstSeed})`); }

// C/D. the sampler is triangle-exact against the rendered mesh (off-vertex and at every node) and throws on bad input (never silently 0)
{ const g = gridFixed; let maxErr = 0, nodeErr = 0;
  for (const [x, z] of rndPoints(g, 99, 400)) maxErr = Math.max(maxErr, Math.abs(GT.sampleTerrain(x, z, g) - planeInterp(g, x, z)));
  for (let i = 0; i < g.n * g.n; i += 7) { const [x, , z] = GT.nodeXYZ(g, i); nodeErr = Math.max(nodeErr, Math.abs(GT.sampleTerrain(x, z, g) - g.h[i])); }
  const finite = (x, z) => { if (!Number.isFinite(GT.sampleTerrain(x, z, g))) throw new Error('not finite'); };
  all('sampler == mesh (triangle-exact), throws on NaN / out-of-range', { exact: maxErr < 1e-6 && nodeErr < 1e-6, 'NaN throws': throws(() => finite(NaN, 0)), 'out of range throws': throws(() => finite(99999, 0)) },
    `max off-vertex err=${maxErr.toExponential(2)}, node err=${nodeErr.toExponential(2)}`); }

// RED evidence: the legacy analytic sampler is NOT triangle-exact and has no bounds (the reason for the rebuild)
{ const g = gridFixed; let err = 0;
  for (const [x, z] of rndPoints(g, 99, 400)) err = Math.max(err, Math.abs(GT.terrainHeight(x, z, L, fixedWorld.world, fixedWorld.built, noise) - planeInterp(g, x, z)));
  all('legacy analytic sampler: off the mesh surface, finite out of range', { 'not triangle-exact': err > 1e-3, 'no bounds (finite at 99999)': Number.isFinite(GT.terrainHeight(99999, 0, L, fixedWorld.world, fixedWorld.built, noise)) }, `max err ${err.toFixed(3)}`); }

// E/F. no degenerate triangles; every heightfield face winds +Y
all('mesh: no degenerate triangles, every face winds +Y', { 'no degenerate': infos.every((f) => f.area >= 1e-5), 'winds +Y': infos.every((f) => f.rawNy > 0) }, `${infos.filter((f) => f.area < 1e-5).length} degenerate, ${infos.filter((f) => f.rawNy <= 0).length} inverted of ${infos.length}`);

// G/H. the steepest face is rock, a flat face in the farm clearing is grass (per-face slope colouring); the cliff is baked into the heightfield at the -x/-z corner; the clearing is flat
{ const steep = infos.reduce((a, f) => (!a || f.slope > a.slope ? f : a), null), inFarm = infos.filter((f) => Math.hypot(f.cx, f.cz) < W.farmFlat.inner), flat = inFarm.reduce((a, f) => (!a || f.slope < a.slope ? f : a), null);
  const rockW = GT.faceBlend(steep.cy, steep.slope, B).rock, grassW = GT.faceBlend(flat.cy, flat.slope, B).grass;
  const corner = Math.max(0, ...infos.filter((f) => f.cx < -7 && f.cz < -7).map((f) => f.slope)), farm = Math.max(0, ...inFarm.map((f) => f.slope));
  all('steep face -> rock, flat face -> grass; cliff baked into the heightfield at the corner; farm clearing flat (slope < 0.12)', { rock: rockW > 0.5, grass: grassW > 0.8, 'cliff corner steep': corner >= B.slopeRock1, 'farm flat': farm < 0.12 },
    `steep slope=${steep.slope.toFixed(2)} rockW=${rockW.toFixed(2)}; grassW=${grassW.toFixed(2)}; corner slope=${corner.toFixed(2)} (rock threshold ${B.slopeRock1}); farm slope=${farm.toFixed(3)}`); }

// J/K. every cell gets a tier-valid module (domain never empty), several seeds; the farmhouse footprint is reserved from vegetation
{ let bad = 0, cells = 0;
  for (const s of [W.seed, 1, 7, 42, 2024]) for (const c of GT.buildWorld(L, MOD, { seed: s, testMode: false }).built.cells) { cells++;
    if (!c.module) { bad++; continue; } if (c.isCenter) continue;
    const m = MOD.modules[c.module]; if (!m) { bad++; continue; } const tr = m.tierRange || [m.tier || 0, m.tier || 0]; if (c.tier < tr[0] || c.tier > tr[1]) bad++; }
  const fc = L.composition.cluster.farmhouse[0], footR = Math.hypot(fc.x, fc.z) + 3.2;   // the house half-extent is ~3.2 u
  all('assembly: tier-valid module per cell (no empty domain); farm footprint reserved (exclusion covers the house)', { 'tier-valid modules': bad === 0, 'footprint reserved': L.vegetation.farmExclusion >= footR }, `${bad} bad of ${cells} cells; farmExclusion=${L.vegetation.farmExclusion} >= footprint R=${footR.toFixed(2)}`); }

// ISLAND (world3): one self-contained watertight island, both locked seeds
{ let dMax = 0, padSlope = 0, padAbs = 0, centreAbs = 0, inverted = 0, degenerate = 0, samplerErr = 0, nanCount = 0, cornersExposed = 0, maxH = -1e9, minH = 1e9, emptyMod = 0;
  const mistFloor = W3.island.mistFloor;
  for (const seed of [W3.seeds.default, W3.seeds.alt]) {
    const bw = GT.buildWorld(L, MOD, { seed, testMode: false, world3: W3 });
    dMax = Math.max(dMax, GT.maxNeighbourTierDelta(bw.built));
    for (const c of bw.built.cells) if (!c.module) emptyMod++;
    const grid = GT.buildHeightGrid(L, MOD.world, bw.built, bw.noise, W3);   // throws on NaN
    for (let k = 0; k < grid.h.length; k++) { if (!Number.isFinite(grid.h[k])) nanCount++; maxH = Math.max(maxH, grid.h[k]); minH = Math.min(minH, grid.h[k]); }
    for (const tri of GT.gridTriangles(grid)) { const fi = faceInfo(grid, tri);
      if (fi.rawNy <= 0) inverted++; if (fi.area < 1e-5) degenerate++;
      if (Math.hypot(fi.cx, fi.cz) < 5) { padSlope = Math.max(padSlope, fi.slope); padAbs = Math.max(padAbs, Math.abs(fi.cy)); } }
    for (const [x, z] of rndPoints(grid, 2024, 300)) samplerErr = Math.max(samplerErr, Math.abs(GT.sampleTerrain(x, z, grid) - planeInterp(grid, x, z)));
    centreAbs = Math.max(centreAbs, Math.abs(GT.sampleTerrain(0, 0, grid)));
    // every plane corner is sunk in the mist basin (no exposed raised land / hard edge)
    for (const [sx, sz] of [[grid.X0 + 2, grid.Z0 + 2], [grid.X0 + 2, -grid.Z0 - 2], [-grid.X0 - 2, grid.Z0 + 2], [-grid.X0 - 2, -grid.Z0 - 2]]) if (GT.sampleTerrain(sx, sz, grid) > mistFloor + 2) cornersExposed++;
  }
  all('island: |dTier|<=1 + module per cell; farm pad flat at height 0; one watertight mesh (winding, no degenerate, sampler-exact, no NaN); rim sinks into mist',
    { 'tier + modules': dMax <= 1 && emptyMod === 0, 'farm pad flat at 0': padSlope < 0.12 && padAbs < 0.05 && centreAbs < 0.02, watertight: inverted === 0 && degenerate === 0 && samplerErr < 1e-6 && nanCount === 0, 'rim sinks into mist': cornersExposed === 0 && maxH < 12 && minH <= mistFloor + 0.01 },
    `maxD=${dMax} emptyModules=${emptyMod} padSlope=${padSlope.toFixed(3)} padAbs=${padAbs.toFixed(3)} centre=${centreAbs.toFixed(3)} inverted=${inverted} degenerate=${degenerate} samplerErr=${samplerErr.toExponential(1)} nan=${nanCount} cornersExposed=${cornersExposed} maxH=${maxH.toFixed(1)} minH=${minH.toFixed(1)} (mistFloor=${mistFloor})`); }

console.log('\n  TERRAIN REGRESSION\n  ' + '-'.repeat(76));
let fails = 0;
for (const r of results) { if (!r.pass) fails++; console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name + '\n        ' + r.detail); }
console.log('  ' + '-'.repeat(76) + `\n  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
process.exit(fails ? 1 : 0);
