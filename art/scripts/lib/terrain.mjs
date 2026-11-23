// terrain.mjs  --  GITAWAY TERRAIN CORE (pure, deterministic, no THREE, no WebGL)
// =============================================================================
// The single source of truth for the terrain MATH. It is imported directly by
// the node regression tests (array-in / array-out) AND inlined into the browser
// viewer by build.mjs (the `export` keywords are stripped and the namespace is
// hung on window.__GT__). Nothing here touches three.js or the DOM, so every
// invariant can be checked headlessly.
//
// ARCHITECTURE (re-build, 2026-10):
//   * ONE continuous watertight heightfield. Elevation = a TIER FIELD solved
//     over the jittered cell grid with a hard |Δtier| <= 1 neighbour constraint,
//     stamped as FLAT-CORE / EASED-FEATHER plateaus combined by an
//     order-independent p-norm soft-max (absolute-height semantics). A cell's
//     feather WIDTH decides the look of its drops: TIGHT feather => a cliff edge,
//     WIDE feather => a gentle slope. Stamp modes: 'set' (plateau), 'add' (bump),
//     'sub' (pond/valley).
//   * CLIFFS are steep regions of that ONE heightfield, coloured ROCK by PER-FACE
//     SLOPE on a non-indexed mesh (see faceColour). No separate cliff meshes =>
//     nothing can float.
//   * A triangle-exact height SAMPLER (sampleTerrain) returns the EXACT mesh
//     height so props/vegetation sit on the rendered surface. It THROWS on bad
//     input (never silently returns 0).
//   * Edge-compatible MODULAR assembly: each cell's edge-profile signature is
//     derived from its own + neighbours' tiers; modules are chosen per-cell with
//     a per-cell sub-seed hash(seed,i,j), weighted by biome/tier, always with a
//     guaranteed filler so a cell's domain can never empty.
//
// Adapted from THREE.Terrain (MIT, https://github.com/IceCreamYou/THREE.Terrain):
//   - the influence-stamp idea (a feature stamps a height with a smooth falloff)
//   - the slope+height blended-material WEIGHTS (smoothstep height bands + a slope
//     term), ported from its generateBlendedMaterial GLSL to CPU per-face here.
//   NOT adopted: Clamp/Normalize (destroys absolute heights, NaN on flat), Mesa
//   easing, Step, its order-dependent blend, Smooth/SmoothConservative,
//   DiamondSquare. Soft-max combiner, |Δtier| solver and per-cell feather are our
//   own. Edge-compatibility is borrowed AS AN IDEA from WFC-3D (no code).
// =============================================================================

// ----------------------------------------------------------------------------
// deterministic RNG + hashing (identical stream to the old viewer so the base
// meadow noise is unchanged)
// ----------------------------------------------------------------------------
export const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export function strSeed(base, salt) {
  let h = ((base | 0) ^ 0x9e3779b1) >>> 0;
  for (let i = 0; i < salt.length; i++) h = Math.imul(h ^ salt.charCodeAt(i), 2654435761) >>> 0;
  return h >>> 0;
}
// per-cell sub-seed: stable, local (changing one cell does NOT shift others)
export function cellSeed(base, i, j) {
  let h = ((base | 0) ^ 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (i + 0x1000), 2654435761) >>> 0;
  h = Math.imul(h ^ (j + 0x2000), 2246822519) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

// value-noise fBm factory (seeded). Returns { vnoise, fbm } pure closures.
export function makeNoise(seed) {
  function hash2(ix, iz) {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 0x9E3779B1)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const sm = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function vnoise(x, z) {
    const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0;
    const a = hash2(x0, z0), b = hash2(x0 + 1, z0), c = hash2(x0, z0 + 1), d = hash2(x0 + 1, z0 + 1);
    const u = sm(fx), v = sm(fz);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, z, oct, lac, gain) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * (vnoise(x * freq, z * freq) * 2 - 1); norm += amp; amp *= gain; freq *= lac; }
    return sum / norm;
  }
  return { vnoise, fbm };
}

// ----------------------------------------------------------------------------
// smooth helpers
// ----------------------------------------------------------------------------
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const smootherstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
export const lerp = (a, b, t) => a + (b - a) * t;

// ----------------------------------------------------------------------------
// TIER FIELD
// ----------------------------------------------------------------------------
// Build the jittered cell grid + a RAW tier per cell (seeded sine regions, or the
// fixed testTiers staircase). Centre cell = farm, forced to its own tier.
// ----------------------------------------------------------------------------
// ISLAND MODE (world3)  -- an explicit region-mapped, self-contained island.
// Cells come from world3.island (grid/cellSize/jitter); each cell's REGION letter
// (world3.regionMap) drives its elevation TIER and composition palette. The
// |Δtier|<=1 constraint is enforced by a RAISE-skirt (lift the lower neighbour)
// so landmark highs (F upper-plateau) are preserved as broad gentle rises. The
// irregular coastline + descent into mist live in terrainHeight (island mask).
// ----------------------------------------------------------------------------
export function buildIslandCells(world3, { seed }) {
  const I = world3.island, g = I.grid, cs = I.cellSize, half = (g - 1) / 2;
  const EP = world3.elevation, regions = world3.regions, RM = world3.regionMap;
  const rng = mulberry32(strSeed(seed, 'island'));
  const rph = mulberry32(strSeed(seed, 'roll')); const rp1 = rph() * 6.283, rp2 = rph() * 6.283;
  const ci = Math.round(half), cj = Math.round(half), cells = [];
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) {
    const isCenter = (i === ci && j === cj);
    const baseX = (i - half) * cs, baseZ = (j - half) * cs;
    const cx = isCenter ? 0 : baseX + (rng() * 2 - 1) * I.jitter;
    const cz = isCenter ? 0 : baseZ + (rng() * 2 - 1) * I.jitter;
    let letter = isCenter ? 'A' : ((RM[i] && RM[i][j]) || 'C');
    if (!isCenter && Math.hypot(cx, cz) > I.coreR) letter = 'H';   // mask -> rim
    const reg = regions[letter] || regions.C;
    let tier = reg.tier | 0;
    if (reg.roll && !isCenter) {
      const f = EP.rollField.f, fieldv = Math.sin(cx * f + rp1) * Math.cos(cz * f + rp2);
      if (fieldv > (0.5 - EP.rollChance)) tier += 1;               // coherent rolling rises
    }
    tier = clamp(tier, 0, EP.maxTier);
    cells.push({ i, j, isCenter, cx, cz, region: letter, tier, isRim: letter === 'H', cliff: false, mode: 'set' });
  }
  const calmR = EP.calmRadius != null ? EP.calmRadius : 30, calmT = EP.calmTier != null ? EP.calmTier : 1;
  for (const c of cells) if (!c.isCenter && Math.hypot(c.cx, c.cz) < calmR) c.tier = Math.min(c.tier, calmT); // calm farm ring
  const center = cells.find(c => c.isCenter); if (center) center.tier = 0;
  // RAISE-skirt to a fixpoint: lift any cell more than 1 below its highest
  // neighbour (preserves highs; |Δtier|<=1 afterwards). Centre pinned at 0.
  const idx = new Map(); for (const c of cells) idx.set(c.i + '_' + c.j, c);
  const nb = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => idx.get((c.i + di) + '_' + (c.j + dj))).filter(Boolean);
  let changed = true, guard = 0;
  while (changed && guard++ < 10 * g * g) {
    changed = false;
    for (const c of cells) {
      if (c.isCenter) continue;
      let maxN = -1; for (const n of nb(c)) maxN = Math.max(maxN, n.tier);
      if (c.tier < maxN - 1) { c.tier = maxN - 1; changed = true; }
    }
  }
  return { cells, center, g, half };
}

export function assignIslandStamps(world3, built, { seed }) {
  const EP = world3.elevation, slopeW = EP.feather.slope, cliffW = EP.feather.cliff;
  const regions = world3.regions || {}, rockClear = EP.rockFarmClear != null ? EP.rockFarmClear : 0;
  for (const c of built.cells) {
    c.mode = 'set';
    if (c.isCenter || c.tier <= 0) { c.feather = slopeW; c.cliff = false; continue; }
    const reg = regions[c.region] || {};
    const cc = reg.cliffChance != null ? reg.cliffChance : (EP.cliffChance || 0);
    const nearFarm = Math.hypot(c.cx, c.cz) < rockClear;   // interior/near-farm stays grassy (no rock)
    const isCliff = (cc > 0 && !nearFarm) ? (mulberry32(cellSeed(seed, c.i, c.j) ^ 0xC11FF)() <= cc) : false;
    c.cliff = isCliff; c.feather = isCliff ? cliffW : slopeW;
  }
  built.extraStamps = [];
  return built;
}

export function assembleIslandModules(world3, built, modules, { seed }) {
  const regions = world3.regions;
  for (const c of built.cells) {
    c.prof = edgeProfile(c, built);
    if (c.isCenter) { c.module = 'landmark_farm'; c.ring = c.region || 'A'; continue; }
    c.ring = c.region;
    const reg = regions[c.region] || regions.C, weights = reg.modules || {}, opts = [];
    for (const [id, w0] of Object.entries(weights)) {
      if (id === 'landmark_farm') continue;
      const m = modules.modules[id]; if (!m) continue;
      const tr = m.tierRange || [m.tier || 0, m.tier || 0];
      if (c.tier < tr[0] || c.tier > tr[1]) continue;
      opts.push([id, w0]);
    }
    const rng = mulberry32(cellSeed(seed, c.i, c.j));
    if (!opts.length) { c.module = (c.tier >= 2) ? 'comp_grove' : 'comp_meadow'; }
    else {
      let tot = 0; for (const o of opts) tot += o[1];
      let r = rng() * tot, pick = opts[opts.length - 1][0];
      for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
      c.module = pick;
    }
  }
  return built;
}

export function buildCells(world, modules, { seed, testMode, world3 }) {
  if (world3 && world3.island && world3.island.enabled && !testMode) return buildIslandCells(world3, { seed });
  const g = world.grid, half = (g - 1) / 2;
  const rng = mulberry32(strSeed(seed, 'world'));
  const cells = [];
  const ci = Math.round(half), cj = Math.round(half);
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) {
    const isCenter = (i === ci && j === cj);
    const baseX = (i - half) * world.cellSize, baseZ = (j - half) * world.cellSize;
    cells.push({
      i, j, isCenter,
      cx: isCenter ? 0 : baseX + (rng() * 2 - 1) * world.jitter,
      cz: isCenter ? 0 : baseZ + (rng() * 2 - 1) * world.jitter,
    });
  }
  if (testMode && modules.testTiers) {
    for (const c of cells) { const row = modules.testTiers[c.i] || []; c.tier = clamp((row[c.j] | 0), 0, world.maxTier); }
  } else {
    const tf = modules.tierField, tph = mulberry32(strSeed(seed, 'tiers'));
    const p1 = tph() * 6.283, p2 = tph() * 6.283, p3 = tph() * 6.283;
    // `bias` shifts the whole field DOWN so most cells settle at tier 0 (broad
    // meadow) with only a connected band rolling to tier 1 and rare tier-2 pockets.
    const bias = tf.bias || 0;
    for (const c of cells) {
      const field = 0.5 - bias + tf.contrast * (0.4 * Math.sin(c.cx * tf.f1 + p1) + 0.4 * Math.cos(c.cz * tf.f2 + p2) + 0.2 * Math.sin((c.cx + c.cz) * tf.f3 + p3));
      c.tier = clamp(Math.round(field * world.maxTier), 0, world.maxTier);
    }
    // Keep the immediate farm surroundings calm: cap tiers near the origin so no
    // tall terrace sits beside the house (the |Δtier| solve below still runs).
    const fc = world.farmCalm;
    if (fc) for (const c of cells) {
      if (!c.isCenter && Math.hypot(c.cx, c.cz) < fc.radius) c.tier = Math.min(c.tier, fc.maxTier);
    }
  }
  const center = cells.find(c => c.isCenter);
  const farmTier = (world.farmTier != null) ? world.farmTier : 0;
  if (center) center.tier = farmTier;
  return { cells, center, g, half };
}

// Enforce |Δtier| <= 1 across 4-neighbours (guarantees no impossible vertical
// jumps). Relaxation to a fixpoint: repeatedly lower the higher side of any
// over-steep neighbour pair. Monotonic decrease, bounded below by 0 -> always
// terminates. The farm centre is pinned (lowered only if it itself is too high
// vs a neighbour, which cannot happen because neighbours are lowered first).
export function solveTierConstraint(world, built, maxDelta = 1) {
  const { cells, g } = built;
  const idx = new Map(); for (const c of cells) idx.set(c.i + '_' + c.j, c);
  const nb = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => idx.get((c.i + di) + '_' + (c.j + dj))).filter(Boolean);
  // keep the farm ring calm: within 1 of the centre by construction of the solve
  let changed = true, guard = 0;
  while (changed && guard++ < 10 * g * g) {
    changed = false;
    for (const c of cells) {
      if (c.isCenter) continue;           // pin centre; neighbours yield to it
      let minN = Infinity;
      for (const n of nb(c)) minN = Math.min(minN, n.tier);
      if (c.tier > minN + maxDelta) { c.tier = minN + maxDelta; changed = true; }
    }
  }
  return built;
}

// Max |Δtier| over 4-neighbours (for the invariant test).
export function maxNeighbourTierDelta(built) {
  const { cells } = built;
  const idx = new Map(); for (const c of cells) idx.set(c.i + '_' + c.j, c);
  let m = 0;
  for (const c of cells) for (const [di, dj] of [[1, 0], [0, 1]]) {
    const n = idx.get((c.i + di) + '_' + (c.j + dj)); if (!n) continue;
    m = Math.max(m, Math.abs(c.tier - n.tier));
  }
  return m;
}

// ----------------------------------------------------------------------------
// PER-CELL FEATHER + STAMP MODE
// ----------------------------------------------------------------------------
// A cell that owns a drop decides whether that drop is a CLIFF (tight feather ->
// steep rock face) or a SLOPE (wide feather -> gentle grass). Deterministic:
// hash(seed,i,j) gated by world.cliffChance, unless testMode pins it from
// modules.testCliffCells. Feather is in WORLD UNITS (riser run).
export function assignCellStamps(world, built, modules, { seed, testMode, world3 }) {
  if (world3 && world3.island && world3.island.enabled && !testMode) return assignIslandStamps(world3, built, { seed });
  const CF = world.feather || {};
  const cliffW = (CF.cliff != null) ? CF.cliff : 1.3;   // tight  -> steep
  const slopeW = (CF.slope != null) ? CF.slope : 4.2;   // wide   -> gentle
  const testCliff = (testMode && modules.testCliffCells) ? new Set(modules.testCliffCells.map(a => a.join('_'))) : null;
  // REBALANCE: in assembled worlds, cells near the farm are never rocky cliffs, so
  // no exposed rock face crowds the house (the ?view=test pins are left untouched).
  const fc = world.farmCalm;
  for (const c of built.cells) {
    c.mode = 'set';
    if (c.isCenter || c.tier <= 0) { c.feather = slopeW; c.cliff = false; continue; }
    let isCliff;
    if (testCliff) isCliff = testCliff.has(c.i + '_' + c.j);
    else if (fc && Math.hypot(c.cx, c.cz) < fc.radius) isCliff = false;  // calm farm ring -> slope
    else isCliff = mulberry32(cellSeed(seed, c.i, c.j) ^ 0xC11FF)() <= (world.cliffChance != null ? world.cliffChance : 0.5);
    c.cliff = isCliff;
    c.feather = isCliff ? cliffW : slopeW;
  }
  // optional extra stamps (bumps / ponds) for the vertical slice; pure data.
  built.extraStamps = (testMode && modules.testStamps) ? modules.testStamps.slice() : [];
  return built;
}

// ----------------------------------------------------------------------------
// HEIGHTFIELD
// ----------------------------------------------------------------------------
// plateauHeight: soft-max p-norm of per-cell FLAT-CORE / EASED-FEATHER stamps,
// plus additive/subtractive extra stamps. Absolute-height semantics: a cell's
// core sits at tier*tierStep. Domain-warped outlines (no concentric rings). Farm
// core held flat.
export function plateauHeight(x, z, world, built, noise, world3) {
  const { cells, center } = built;
  if (!cells.length) return 0;
  const isl = world3 && world3.island && world3.island.enabled;
  const EP = isl ? world3.elevation : world;
  const cs = isl ? world3.island.cellSize : world.cellSize, k = EP.pNorm;
  const tierStep = isl ? EP.tierStep : world.tierStep;
  const coreR = cs * EP.stampInner;                     // flat plateau-top radius
  const ww = EP.outlineWarp;
  const wx = x + ww * noise.fbm(x * 0.08 + 3.1, z * 0.08 + 1.7, 2, 2, 0.5);
  const wz = z + ww * noise.fbm(x * 0.08 - 2.3, z * 0.08 + 5.9, 2, 2, 0.5);
  let acc = 0;
  for (const c of cells) {
    if (c.tier <= 0) continue;
    const R = coreR + (c.feather != null ? c.feather : cs * 0.4);  // outer edge = core + feather
    const d = Math.hypot(wx - c.cx, wz - c.cz);
    const fall = 1 - smootherstep(coreR, R, d);            // 1 inside core -> 0 at R
    if (fall <= 0) continue;
    const h = c.tier * tierStep * fall;
    acc += Math.pow(h, k);
  }
  let H = acc > 0 ? Math.pow(acc, 1 / k) : 0;
  // additive bumps / subtractive ponds (absolute-height deltas, smooth falloff)
  if (built.extraStamps) for (const s of built.extraStamps) {
    const d = Math.hypot(x - s.x, z - s.z);
    const fall = 1 - smootherstep(s.r0 != null ? s.r0 : 0, s.r, d);
    if (fall <= 0) continue;
    if (s.mode === 'sub') H -= s.amp * fall;
    else if (s.mode === 'add') H += s.amp * fall;
  }
  const farmH = (center ? center.tier : 0) * tierStep;
  const fFlat = isl ? world3.clearing : world.farmFlat;
  const fIn = isl ? fFlat.flatInner : fFlat.inner, fOut = isl ? fFlat.flatOuter : fFlat.outer;
  const g = smoothstep(fIn, fOut, Math.hypot(x, z));
  return lerp(farmH, H, g);
}

// terrainHeight: gentle meadow base roll + plateau/tier field. ONE function used
// both to BUILD the mesh grid and (via the grid) to place things.
export function terrainHeight(x, z, L, world, built, noise, world3) {
  const isl = world3 && world3.island && world3.island.enabled;
  const E = L.terrain.elevation;
  const wf = E.warp.freq, wa = E.warp.amp;
  const wx = x + wa * noise.fbm(x * wf + 11.3, z * wf + 5.7, 2, 2, 0.5);
  const wz = z + wa * noise.fbm(x * wf - 7.1, z * wf + 9.2, 2, 2, 0.5);
  const bAmp = isl ? world3.meadow.broadAmp : E.broad.amp;
  const mAmp = isl ? world3.meadow.mediumAmp : E.medium.amp;
  const fAmp = isl ? world3.meadow.fineAmp : E.fine.amp;
  const fIn = isl ? world3.meadow.flattenInner : E.flattenInner;
  const fOut = isl ? world3.meadow.flattenOuter : E.flattenOuter;
  const broad = noise.fbm(wx * E.broad.freq, wz * E.broad.freq, E.broad.octaves, E.broad.lacunarity, E.broad.gain) * bAmp;
  const medium = noise.fbm(wx * E.medium.freq + 31.4, wz * E.medium.freq + 27.2, E.medium.octaves, E.medium.lacunarity, E.medium.gain) * mAmp;
  const fine = noise.fbm(x * E.fine.freq + 51.2, z * E.fine.freq + 67.9, 1, 2, 0.5) * fAmp;
  const base = (broad + medium + fine) * smoothstep(fIn, fOut, Math.hypot(x, z));
  const landH = base + plateauHeight(x, z, world, built, noise, world3);
  if (!isl) return landH;
  // ISLAND MASK: an irregular (domain-warped) coastline; land is full inside
  // coreR, rolls gently DOWN into the mist across coreR..rimR, flat mist basin
  // beyond. One continuous watertight heightfield -- no cutoff, no exposed edge.
  const I = world3.island;
  const w1 = noise.fbm(x * I.warpFreq + 9.1, z * I.warpFreq - 4.3, 2, 2, 0.5);
  const w2 = noise.fbm(x * I.warpFreq2 - 2.7, z * I.warpFreq2 + 6.1, 2, 2, 0.5);
  const rEff = Math.hypot(x, z) - I.warpAmp * w1 - I.warp2Amp * w2;
  const mask = 1 - smootherstep(I.coreR, I.rimR, rEff);
  let H = lerp(I.mistFloor, landH, mask);
  H += I.rimLip * smoothstep(0.35, 0.62, mask) * (1 - smoothstep(0.62, 0.9, mask)); // soft coastal lip
  return H;
}

// ----------------------------------------------------------------------------
// MESH GRID (the exact vertices the viewer renders) + triangle-exact SAMPLER
// ----------------------------------------------------------------------------
// Build a (seg+1)x(seg+1) world-space grid of heights. Node layout:
//   node(gi,gj): x = X0 + gi*dx,  z = Z0 + gj*dz,  h = terrainHeight(x,z)
// This is also what the viewer uses to build its non-indexed mesh, so the
// sampler is EXACT against the rendered surface.
export function buildHeightGrid(L, world, built, noise, world3) {
  const isl = world3 && world3.island && world3.island.enabled;
  const size = isl ? world3.island.planeSize : L.terrain.size, seg = isl ? world3.island.planeSegments : L.terrain.segments;
  const X0 = -size / 2, Z0 = -size / 2, dx = size / seg, dz = size / seg;
  const n = seg + 1;
  const h = new Float64Array(n * n);
  for (let gj = 0; gj < n; gj++) for (let gi = 0; gi < n; gi++) {
    const x = X0 + gi * dx, z = Z0 + gj * dz;
    const y = terrainHeight(x, z, L, world, built, noise, world3);
    if (!Number.isFinite(y)) throw new Error(`terrainHeight NaN at (${x},${z})`);
    h[gj * n + gi] = y;
  }
  return { size, seg, X0, Z0, dx, dz, n, h };
}

// Each quad -> two triangles with the diagonal v00-v11 (so the viewer and the
// sampler agree exactly). Returns flat vertex-index triples into the grid nodes.
// Winding is chosen so the geometric face normal points +Y (verified by test).
export function gridTriangles(grid) {
  const { seg, n } = grid, tris = [];
  for (let gj = 0; gj < seg; gj++) for (let gi = 0; gi < seg; gi++) {
    const v00 = gj * n + gi, v10 = gj * n + (gi + 1), v01 = (gj + 1) * n + gi, v11 = (gj + 1) * n + (gi + 1);
    // triangle A: v00, v01, v11   triangle B: v00, v11, v10   (CCW from above -> +Y)
    tris.push([v00, v01, v11], [v00, v11, v10]);
  }
  return tris;
}
export function nodeXYZ(grid, idx) {
  const gi = idx % grid.n, gj = (idx - gi) / grid.n;
  return [grid.X0 + gi * grid.dx, grid.h[idx], grid.Z0 + gj * grid.dz];
}

// Triangle-exact height at (x,z): find the grid cell, pick the sub-triangle by
// the v00-v11 diagonal, barycentric-interpolate the three node heights. THROWS on
// NaN / out-of-range input (never silently returns 0).
export function sampleTerrain(x, z, grid) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`sampleTerrain: non-finite input (${x},${z})`);
  const { seg, n, X0, Z0, dx, dz, h } = grid;
  const fx = (x - X0) / dx, fz = (z - Z0) / dz;
  if (fx < 0 || fz < 0 || fx > seg || fz > seg) throw new Error(`sampleTerrain: (${x},${z}) outside terrain grid`);
  let gi = Math.floor(fx), gj = Math.floor(fz);
  if (gi >= seg) gi = seg - 1; if (gj >= seg) gj = seg - 1;
  const u = fx - gi, v = fz - gj;                 // local 0..1 within the quad
  const H00 = h[gj * n + gi], H10 = h[gj * n + gi + 1], H01 = h[(gj + 1) * n + gi], H11 = h[(gj + 1) * n + gi + 1];
  // The quad is split by the diagonal v00-v11 (the line u == v), matching
  // gridTriangles([v00,v01,v11],[v00,v11,v10]). Pick the sub-triangle and
  // barycentric-interpolate. Returns the EXACT node height at any node.
  let H;
  if (u >= v) {
    // lower-right tri (v00,v10,v11): H = H00 + u*(H10-H00) + v*(H11-H10)
    H = H00 + u * (H10 - H00) + v * (H11 - H10);
  } else {
    // upper-left tri (v00,v11,v01): H = H00 + v*(H01-H00) + u*(H11-H01)
    H = H00 + v * (H01 - H00) + u * (H11 - H01);
  }
  if (!Number.isFinite(H)) throw new Error(`sampleTerrain: NaN result at (${x},${z})`);
  return H;
}

// ----------------------------------------------------------------------------
// PER-FACE SLOPE + HEIGHT -> COLOUR WEIGHTS  (ported from THREE.Terrain MIT)
// ----------------------------------------------------------------------------
// Face normal from the three vertices (cross product), slope = 1 - nUp.
export function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1e-9; nx /= len; ny /= len; nz /= len;
  if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }   // upward-facing for slope calc
  return [nx, ny, nz];
}
export function triArea2(a, b, c) { // squared-ish area signal for degeneracy test
  const n = [
    (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
    (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
  ];
  return 0.5 * Math.hypot(n[0], n[1], n[2]);
}
// Blend weights for grass / soil / rock from face centroid height + slope.
// slope in [0,1] (=1-normal.y). bands from look.config terrain.colour.faceBands.
export function faceBlend(h, slope, B) {
  const rock = smoothstep(B.slopeRock0, B.slopeRock1, slope);                 // steep -> rock
  const soilBand = smoothstep(B.soilH0, B.soilH1, h) - smoothstep(B.soilH2, B.soilH3, h); // mid-height earthy band
  const soilSlope = smoothstep(B.slopeSoil0, B.slopeSoil1, slope);            // moderate slope -> some soil
  let soil = (1 - rock) * clamp(Math.max(soilBand * B.soilBandW, soilSlope * B.soilSlopeW), 0, 1);
  let grass = 1 - rock - soil;
  if (grass < 0) { soil += grass; grass = 0; }
  return { grass: clamp(grass, 0, 1), soil: clamp(soil, 0, 1), rock: clamp(rock, 0, 1) };
}

// ----------------------------------------------------------------------------
// EDGE-COMPATIBLE MODULAR ASSEMBLY
// ----------------------------------------------------------------------------
// Each cell's edge profile: per side, the relation to the neighbour tier.
//   'flat'  same tier       'up' neighbour higher
//   'cliff' neighbour lower AND this cell is a cliff cell
//   'slope' neighbour lower AND this cell is a slope cell
//   'edge'  no neighbour (world border)
export function edgeProfile(c, built) {
  const idx = built._idx || (built._idx = (() => { const m = new Map(); for (const k of built.cells) m.set(k.i + '_' + k.j, k); return m; })());
  const rel = (di, dj) => {
    const n = idx.get((c.i + di) + '_' + (c.j + dj));
    if (!n) return 'edge';
    if (n.tier === c.tier) return 'flat';
    if (n.tier > c.tier) return 'up';
    return c.cliff ? 'cliff' : 'slope';
  };
  return { N: rel(0, 1), E: rel(1, 0), S: rel(0, -1), W: rel(-1, 0) };
}

// Choose a composition module per cell with a per-cell sub-seed, weighted by
// biome ring + constrained by tierRange, and biased by edge profile. A FILLER is
// always eligible, so a cell's domain can never be empty (solvable by
// construction). The farm centre is reserved.
export function assembleModules(world, built, modules, { seed, testMode, world3 }) {
  if (world3 && world3.island && world3.island.enabled && !testMode) return assembleIslandModules(world3, built, modules, { seed });
  const biome = world.biome;
  const filler = world.filler || 'comp_meadow';
  for (const c of built.cells) {
    c.prof = edgeProfile(c, built);
    if (c.isCenter) { c.module = 'landmark_farm'; c.ring = 'farm'; continue; }
    const d = Math.hypot(c.cx, c.cz);
    c.ring = d < biome.farmRadius ? 'near' : d < biome.midRadius ? 'mid' : 'far';
    if (testMode) {
      const hasCliff = Object.values(c.prof).includes('cliff');
      c.module = hasCliff || c.cliff ? 'comp_rocky'
        : c.tier >= 2 ? 'comp_rocky'
          : c.tier === 1 ? 'comp_grove'
            : (d < biome.farmRadius ? 'comp_cultivated' : 'comp_meadow');
      continue;
    }
    const rng = mulberry32(cellSeed(seed, c.i, c.j));
    const weights = modules.selection[c.ring] || {};
    const opts = [];
    for (const [id, w0] of Object.entries(weights)) {
      const m = modules.modules[id]; if (!m) continue;
      const tr = m.tierRange || [m.tier || 0, m.tier || 0];
      if (c.tier < tr[0] || c.tier > tr[1]) continue;        // tier compatibility
      let w = w0;
      // edge-profile bias: cliff edges favour rocky; flat/slope favour open fills
      const hasCliff = Object.values(c.prof).includes('cliff');
      if (hasCliff && (m.biome || []).includes('rocky')) w *= 2.5;
      if (!hasCliff && id === 'comp_rocky') w *= 0.4;
      opts.push([id, w]);
    }
    // guaranteed filler so the domain is never empty
    const fm = modules.modules[filler], ftr = fm.tierRange || [0, 0];
    if (!opts.length) {
      c.module = (c.tier >= ftr[0] && c.tier <= ftr[1]) ? filler : 'comp_grove';
    } else {
      let tot = 0; for (const o of opts) tot += o[1];
      let r = rng() * tot, pick = opts[opts.length - 1][0];
      for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
      c.module = pick;
    }
  }
  return built;
}

// ----------------------------------------------------------------------------
// ONE-CALL WORLD BUILD (used by viewer + tests)
// ----------------------------------------------------------------------------
export function buildWorld(L, modules, { seed, testMode, world3 }) {
  const world = modules.world;
  const noise = makeNoise(L.terrain.elevation.seed);
  const s = testMode ? (world.testSeed || 777) : (seed >>> 0);
  const built = buildCells(world, modules, { seed: s, testMode, world3 });
  solveTierConstraint(world, built, world.maxTierDelta != null ? world.maxTierDelta : 1);
  assignCellStamps(world, built, modules, { seed: s, testMode, world3 });
  assembleModules(world, built, modules, { seed: s, testMode, world3 });
  return { world, modules, noise, built, L, world3 };
}

// ============================================================================
// PASS A: TERRAIN COLOURS (pure; the viewer renders EXACTLY these vertex colours,
// so the colour invariants are node-testable)
// ============================================================================
// sRGB hex -> linear working space, identical to THREE.Color.set(hex) with
// ColorManagement enabled (r152+). linearToSrgb = the single output encode.
export function hexToLinear(hex) {
  const h = String(hex).replace('#', '');
  return [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
  });
}
export function linearToSrgb(c) { return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

// Ground colour is computed PER GRID NODE from smooth fields (grass->meadow noise,
// height lightening/darkening, smooth node slope, soil patches, the earthy height
// band) and interpolated across faces -> meadows are one continuous colour sheet
// (STYLE T8) with no per-face / per-quad colour steps. ROCK (and the soil band at
// cliff feet) stays PER FACE from the face slope, so steep drama keeps its crisp
// faceted strata. The old per-quad colouring quantised every term to the 1.2u grid,
// which (with the Stage-2 per-quad path bake) produced the blocky tan/green squares.
// In island mode `world3.colour.soilBandScale` scales the legacy ABSOLUTE-HEIGHT
// earthy band (faceBands.soilH0..3): the island's ordinary rolling meadows live in
// exactly that 0.6..4.4m range, so at full weight it painted gentle rises tan.
// Returns { colours: Float32Array(tris*9) linear RGB, basin: Uint8Array(tris) }.
export function terrainColours(L, world3, grid, opts = {}) {
  const P = L.palette, TC = L.terrain.colour, FB = TC.faceBands;
  const isl = !!(world3 && world3.island && world3.island.enabled);
  const IC = (isl && world3.colour) || {};
  const bandScale = IC.soilBandScale != null ? IC.soilBandScale : 1;
  const lin = (tok) => hexToLinear(P[tok]);
  const grass = lin(TC.grassToken), meadow = lin(TC.meadowToken), dark = lin(TC.darkToken),
    soil = lin(TC.soilToken), rock = lin(TC.rockToken), rockDark = lin(TC.rockDarkToken);
  const M = isl ? world3.mist : null, mist = M ? lin(M.colorToken) : null;
  const MISTTOP = M ? M.top : 0;
  const SUBTOP = M ? (M.submergeTop != null ? M.submergeTop : MISTTOP + 2) : 0;
  const SUBBOT = M ? (M.submergeBottom != null ? M.submergeBottom : MISTTOP - 9) : 0;
  const { n, seg, dx, dz, h } = grid, tris = opts.tris || gridTriangles(grid);
  // ---- per NODE smooth ground colour ----
  const ground = new Float32Array(n * n * 3), c = [0, 0, 0];
  const mixc = (a, t) => { c[0] += (a[0] - c[0]) * t; c[1] += (a[1] - c[1]) * t; c[2] += (a[2] - c[2]) * t; };
  for (let gj = 0; gj < n; gj++) for (let gi = 0; gi < n; gi++) {
    const k = gj * n + gi, x = grid.X0 + gi * dx, z = grid.Z0 + gj * dz, y = h[k];
    const i0 = Math.max(0, gi - 1), i1 = Math.min(seg, gi + 1), j0 = Math.max(0, gj - 1), j1 = Math.min(seg, gj + 1);
    const sx = (h[gj * n + i1] - h[gj * n + i0]) / ((i1 - i0) * dx), sz = (h[j1 * n + gi] - h[j0 * n + gi]) / ((j1 - j0) * dz);
    const slope = 1 - 1 / Math.sqrt(1 + sx * sx + sz * sz);          // 1 - normal.y of the smooth node normal
    const nz = 0.5 + 0.5 * Math.sin(x * TC.nFreqX + 1.1) * Math.cos(z * TC.nFreqZ) + 0.25 * Math.sin((x - z) * TC.nFreqDiag);
    c[0] = grass[0]; c[1] = grass[1]; c[2] = grass[2];
    mixc(meadow, clamp(nz * TC.meadowWeight + y * TC.heightToMeadow, 0, 1));
    mixc(dark, clamp(-y * TC.heightToDark + slope * TC.slopeToDark, 0, TC.darkMax));
    for (const sp of TC.soilPatches) mixc(soil, clamp(sp.strength - Math.hypot(x - sp.x, z - sp.z) * sp.falloff, 0, sp.max));
    ground[k * 3] = c[0]; ground[k * 3 + 1] = c[1]; ground[k * 3 + 2] = c[2];
  }
  // ---- per FACE rock / cliff-foot soil weights, per VERTEX ground + mist fade ----
  const colours = new Float32Array(tris.length * 9), basin = new Uint8Array(tris.length);
  let rockFaces = 0, maxSlope = 0;
  for (let t = 0; t < tris.length; t++) {
    const tri = tris[t], a = nodeXYZ(grid, tri[0]), b = nodeXYZ(grid, tri[1]), d = nodeXYZ(grid, tri[2]);
    const slope = 1 - faceNormal(a, b, d)[1];
    if (slope > maxSlope) maxSlope = slope;
    const rk = smoothstep(FB.slopeRock0, FB.slopeRock1, slope);
    if (rk > 0.5) rockFaces++;
    const sSlope = smoothstep(FB.slopeSoil0, FB.slopeSoil1, slope) * FB.soilSlopeW;
    const rs = clamp(slope * FB.rockDarkBySlope, 0, 1);
    const rc0 = rock[0] + (rockDark[0] - rock[0]) * rs, rc1 = rock[1] + (rockDark[1] - rock[1]) * rs, rc2 = rock[2] + (rockDark[2] - rock[2]) * rs;
    let maxY = -Infinity;
    for (let v = 0; v < 3; v++) {
      const k = tri[v], y = h[k]; if (y > maxY) maxY = y;
      const band = (smoothstep(FB.soilH0, FB.soilH1, y) - smoothstep(FB.soilH2, FB.soilH3, y)) * FB.soilBandW * bandScale;
      let sw = (1 - rk) * clamp(Math.max(band, sSlope), 0, 1), gw = 1 - rk - sw;
      if (gw < 0) { sw += gw; gw = 0; }
      let R = ground[k * 3] * gw + soil[0] * sw + rc0 * rk;
      let G = ground[k * 3 + 1] * gw + soil[1] * sw + rc1 * rk;
      let B = ground[k * 3 + 2] * gw + soil[2] * sw + rc2 * rk;
      if (mist) { const fd = smoothstep(SUBTOP, SUBBOT, y) * 0.97; R += (mist[0] - R) * fd; G += (mist[1] - G) * fd; B += (mist[2] - B) * fd; }
      const o = t * 9 + v * 3; colours[o] = R; colours[o + 1] = G; colours[o + 2] = B;
    }
    basin[t] = (mist && maxY <= SUBBOT) ? 1 : 0;
  }
  return { colours, basin, rockFaces, maxSlope };
}

// ============================================================================
// PASS A: PATH NETWORK -- least-cost routing over the heightfield + smoothing
// ============================================================================
// Replaces the Stage-2 hand-placed straight spokes (an X of four ruler-straight
// branches meeting at the porch). ONE main route leaves the porch through a fixed
// lead-out between the farm props; every other destination is a BRANCH that is
// routed back into the existing network and joins it OUTSIDE the farm clearing
// (junctionMinR), so the clearing carries only the farm's own small path and the
// branch angles vary naturally (no X). Routing is a deterministic Dijkstra on a
// lattice over the SAME heightfield the mesh uses: steep ground (local slope over
// the path corridor > maxGrade -> every cliff face) and the mist rim are impassable,
// grade is penalised (paths follow contours), and a low-frequency wiggle field
// (seeded) makes them wind organically on flat ground. The lattice polyline is
// decimated to control points, re-splined (centripetal Catmull-Rom) and
// arc-length resampled; a smoothing level is accepted only if the smoothed curve
// still respects the grade/corridor limits. Widths taper gently along each route.
class MinHeap {
  constructor() { this.c = []; this.k = []; }
  get size() { return this.c.length; }
  push(cost, key) {
    const c = this.c, k = this.k; let i = c.length; c.push(cost); k.push(key);
    while (i > 0) { const p = (i - 1) >> 1; if (c[p] < cost || (c[p] === cost && k[p] <= key)) break; c[i] = c[p]; k[i] = k[p]; i = p; }
    c[i] = cost; k[i] = key;
  }
  pop() {
    const c = this.c, k = this.k, topC = c[0], topK = k[0], lc = c.pop(), lk = k.pop(), n = c.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i, mc = lc, mk = lk;
        if (l < n && (c[l] < mc || (c[l] === mc && k[l] < mk))) { m = l; mc = c[l]; mk = k[l]; }
        if (r < n && (c[r] < mc || (c[r] === mc && k[r] < mk))) { m = r; mc = c[r]; mk = k[r]; }
        if (m === i) break;
        c[i] = c[m]; k[i] = k[m]; i = m;
      }
      c[i] = lc; k[i] = lk;
    }
    return [topC, topK];
  }
}

// centripetal Catmull-Rom through control points, returned as a dense polyline
export function catmullRomCentripetal(ctrl, perUnit = 4) {
  if (ctrl.length < 2) return ctrl.slice();
  const P = [[2 * ctrl[0][0] - ctrl[1][0], 2 * ctrl[0][1] - ctrl[1][1]], ...ctrl,
    [2 * ctrl[ctrl.length - 1][0] - ctrl[ctrl.length - 2][0], 2 * ctrl[ctrl.length - 1][1] - ctrl[ctrl.length - 2][1]]];
  const out = [];
  const tj = (ti, a, b) => ti + Math.max(1e-6, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let s = 1; s < P.length - 2; s++) {
    const p0 = P[s - 1], p1 = P[s], p2 = P[s + 1], p3 = P[s + 2];
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    const steps = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * perUnit));
    for (let q = 0; q < steps; q++) {
      const t = t1 + (t2 - t1) * (q / steps), r = [0, 0];
      for (let e = 0; e < 2; e++) {
        const A1 = (t1 - t) / (t1 - t0) * p0[e] + (t - t0) / (t1 - t0) * p1[e];
        const A2 = (t2 - t) / (t2 - t1) * p1[e] + (t - t1) / (t2 - t1) * p2[e];
        const A3 = (t3 - t) / (t3 - t2) * p2[e] + (t - t2) / (t3 - t2) * p3[e];
        const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2;
        const B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
        r[e] = (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      }
      out.push(r);
    }
  }
  out.push(ctrl[ctrl.length - 1].slice());
  return out;
}
// (water rev 1, spec Revision 1 R1.2) the ART-OWNED farm stream's control points: world.config farmWater's 3 + the pinned rim exit
// `rim` { x, z, level, width } + the steer point farmWater.stream.steer u past it along the wetland river's first segment r0 -> r1
// ({ x, z, level }; its level follows that segment's slope)
export function farmStreamCtrl(FW, rim, r0, r1) {
  const dx = r1.x - r0.x, dz = r1.z - r0.z, dl = Math.hypot(dx, dz) || 1, len = FW.stream.steer;
  return [...FW.stream.points.map((p) => ({ ...p })), { ...rim }, { x: rim.x + (dx / dl) * len, z: rim.z + (dz / dl) * len, level: rim.level + ((r1.level - r0.level) / dl) * len, width: rim.width }];
}
// the farm stream's dense line from ctrl (farmStreamCtrl): centripetal Catmull-Rom (Barry-Goldman, knots on the 3D distance in
// (x, level, z): the same curve and segment parameter as the game's THREE.CatmullRomCurve3, start extrapolated) through every point,
// sampled from P0 to the rim exit only (the steer point shapes the last segment's end tangent), width linear in each segment's
// parameter; resampled every ~ds u of xz arc length -> [{ x, z, level, width, s }] (first = P0, last = the rim exit, exactly)
export function farmStreamLine(ctrl, ds = 0.1, fine = 400) {
  const P = ctrl.map((p) => [p.x, p.level, p.z, p.width]), Q = [P[0].map((v, k) => 2 * v - P[1][k]), ...P], raw = [];
  const kn = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
  for (let s = 1; s <= Q.length - 3; s++) {
    const p0 = Q[s - 1], p1 = Q[s], p2 = Q[s + 1], p3 = Q[s + 2], t0 = 0, t1 = kn(p0, p1), t2 = t1 + kn(p1, p2), t3 = t2 + kn(p2, p3);
    for (let q = 0; q < fine; q++) {
      const u = q / fine, t = t1 + (t2 - t1) * u, r = [0, 0, 0];
      for (let e = 0; e < 3; e++) {
        const A1 = (t1 - t) / (t1 - t0) * p0[e] + (t - t0) / (t1 - t0) * p1[e], A2 = (t2 - t) / (t2 - t1) * p1[e] + (t - t1) / (t2 - t1) * p2[e], A3 = (t3 - t) / (t3 - t2) * p2[e] + (t - t2) / (t3 - t2) * p3[e];
        const B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2, B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3;
        r[e] = (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2;
      }
      raw.push([r[0], r[1], r[2], p1[3] + (p2[3] - p1[3]) * u]);
    }
  }
  raw.push(P[P.length - 2].slice());   // the rim exit, exactly
  const cum = [0]; for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][2] - raw[i - 1][2]));
  const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L / ds)), out = []; let k = 0;
  for (let j = 0; j <= n; j++) {
    const s = (L * j) / n; while (k < raw.length - 2 && cum[k + 1] < s) k++;
    const f = clamp((s - cum[k]) / (cum[k + 1] - cum[k] || 1), 0, 1), a = raw[k], b = raw[k + 1];
    out.push({ x: a[0] + (b[0] - a[0]) * f, z: a[2] + (b[2] - a[2]) * f, level: a[1] + (b[1] - a[1]) * f, width: a[3] + (b[3] - a[3]) * f, s });
  }
  return out;
}
// arc-length resample a polyline every `ds` world units (endpoints kept exactly)
export function resamplePolyline(pts, ds) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0].slice()]; let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let pos = ds - carry;
    while (pos <= L) { const t = pos / L; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); pos += ds; }
    carry = L - (pos - ds);
  }
  const last = pts[pts.length - 1], tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > ds * 0.35) out.push(last.slice()); else out[out.length - 1] = last.slice();
  return out;
}

export function buildPathNetwork(world3, grid, noise, opts = {}) {
  const P = world3 && world3.paths;
  if (!P || !P.enabled || !P.main) return { routes: [], samples: [], notes: ['paths disabled'] };
  const R = P.routing || {}, seed = (opts.seed >>> 0) || 0, notes = [];
  const step = R.step || 1.5, ext = R.extent || 110, n = Math.floor((2 * ext) / step) + 1, X0 = -ext, N = n * n;
  const maxG = R.maxGrade || 0.36, W0 = P.width || 1.1, hw = W0 / 2 + (P.soft || 0.4);
  const mistTop = world3.mist ? world3.mist.top : -1e9, mistM = R.mistMargin != null ? R.mistMargin : 2.5;
  const TH = (x, z) => sampleTerrain(x, z, grid);
  const slopeAt = (x, z) => { const e = 0.6; return Math.hypot(TH(x + e, z) - TH(x - e, z), TH(x, z + e) - TH(x, z - e)) / (2 * e); };
  // corridor slope = steepest local slope across the path's full (soft-edged) width
  const corridorSlope = (x, z) => { let s = slopeAt(x, z); for (const [ox, oz] of [[hw, 0], [-hw, 0], [0, hw], [0, -hw]]) s = Math.max(s, slopeAt(x + ox, z + oz)); return s; };
  const H = new Float64Array(N), S = new Float64Array(N), Wg = new Float64Array(N), blocked = new Uint8Array(N);
  const wf = R.wiggleFreq || 0.045, wa = R.wiggle || 0, so = (seed % 997) * 0.731;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = X0 + i * step, z = X0 + j * step;
    H[k] = TH(x, z); S[k] = corridorSlope(x, z);
    Wg[k] = Math.max(0.15, 1 + wa * noise.fbm(x * wf + so + 17.3, z * wf - so - 4.9, 2, 2, 0.5));
    if (S[k] > maxG || H[k] < mistTop + mistM || Math.hypot(x, z) < (R.farmBlockR || 0)) blocked[k] = 1;
  }
  const XY = (k) => [X0 + (k % n) * step, X0 + Math.floor(k / n) * step];
  const nodeOf = (x, z) => { const i = clamp(Math.round((x - X0) / step), 0, n - 1), j = clamp(Math.round((z - X0) / step), 0, n - 1); return j * n + i; };
  const nearestOpen = (k) => {
    if (!blocked[k]) return k;
    const i0 = k % n, j0 = Math.floor(k / n);
    for (let r = 1; r <= 16; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const kk = j * n + i, d = di * di + dj * dj; if (!blocked[kk] && d < bd) { bd = d; best = kk; }
      }
      if (best >= 0) return best;
    }
    return -1;
  };
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  const clearR = R.clearR || 0, clearCost = R.clearCost || 1;
  function dijkstra(start, isTarget, avoidClearing) {
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N), heap = new MinHeap();
    dist[start] = 0; heap.push(0, start);
    while (heap.size) {
      const [d, k] = heap.pop(); if (done[k]) continue; done[k] = 1;
      if (isTarget(k)) { const out = [k]; let q = k; while (prev[q] >= 0) { q = prev[q]; out.push(q); } return out.reverse(); }
      const i = k % n, j = (k - i) / n;
      for (const [di, dj, len] of NB) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const kk = jj * n + ii; if (blocked[kk] || done[kk]) continue;
        if (di && dj && (blocked[j * n + ii] || blocked[jj * n + i])) continue;   // no corner-cutting past a blocked node
        const dl = len * step, g = Math.abs(H[kk] - H[k]) / dl;
        let cst = dl * (1 + (R.gradeCost || 4) * (g / maxG) ** 2 + (R.slopeCost || 1.5) * (S[kk] / maxG) ** 2) * Wg[kk];
        if (avoidClearing) { const xy = XY(kk); if (Math.hypot(xy[0], xy[1]) < clearR) cst *= clearCost; }
        const nd = d + cst; if (nd < dist[kk]) { dist[kk] = nd; prev[kk] = k; heap.push(nd, kk); }
      }
    }
    return null;
  }
  const tol = R.smoothTolerance || 1.25, ds = R.sample || 0.5;
  const sampleOk = (x, z) => { let hs; try { hs = TH(x, z); } catch { return false; } return hs >= mistTop + mistM * 0.5 && corridorSlope(x, z) <= maxG * tol; };
  // smooth a lattice route: head = exact leading points (lead-out / junction), then
  // every `ev`-th lattice node as a control point; accept the coarsest valid level.
  function smooth(head, nodes, skipFirst) {
    const pts = nodes.map(XY);
    for (let ev = R.ctrlEvery || 4; ev >= 1; ev--) {
      const ctrl = head.map(p => p.slice());
      for (let q = skipFirst ? ev : 0; q < pts.length - 1; q += ev) {
        const prevP = ctrl[ctrl.length - 1]; if (Math.hypot(pts[q][0] - prevP[0], pts[q][1] - prevP[1]) > step * 0.6) ctrl.push(pts[q]);
      }
      ctrl.push(pts[pts.length - 1]);
      const samp = resamplePolyline(catmullRomCentripetal(ctrl), ds);
      let ok = true;
      for (let s = head.length > 1 ? Math.ceil(4 / ds) : 0; s < samp.length && ok; s++) if (!sampleOk(samp[s][0], samp[s][1])) ok = false;
      if (ok || ev === 1) { if (!ok) notes.push('smoothing fell back to every lattice node'); return { samples: samp, every: ev }; }
    }
    return null;
  }
  function widths(samp, w0, w1, salt) {
    const acc = [0]; for (let i = 1; i < samp.length; i++) acc.push(acc[i - 1] + Math.hypot(samp[i][0] - samp[i - 1][0], samp[i][1] - samp[i - 1][1]));
    const Ltot = acc[acc.length - 1] || 1, jit = R.widthJitter || 0;
    return samp.map((p, i) => (w0 + (w1 - w0) * smoothstep(0, 1, acc[i] / Ltot)) * (1 + jit * (noise.vnoise(acc[i] * 0.21 + salt, salt * 1.37) * 2 - 1)));
  }
  const routes = [], netRoute = new Int32Array(N).fill(-1), netSample = new Int32Array(N).fill(-1);
  const register = (ri) => { const rt = routes[ri]; rt.samples.forEach((p, si) => { const k = nodeOf(p[0], p[1]); if (netRoute[k] < 0) { netRoute[k] = ri; netSample[k] = si; } }); };
  // ---- MAIN route: porch lead-out -> main destination ----
  const lead = (P.leadOut && P.leadOut.length) ? P.leadOut : [P.porch];
  const startK = nearestOpen(nodeOf(lead[lead.length - 1][0], lead[lead.length - 1][1]));
  const mainK = nearestOpen(nodeOf(P.main.at[0], P.main.at[1]));
  const mainNodes = (startK >= 0 && mainK >= 0) ? dijkstra(startK, (k) => k === mainK, false) : null;
  if (!mainNodes) {
    let open = 0; for (let k = 0; k < N; k++) if (!blocked[k]) open++;
    return { routes: [], samples: [], notes: [`main route unreachable (start ${startK} ${startK >= 0 ? XY(startK) : ''}, dest ${mainK} ${mainK >= 0 ? XY(mainK) : ''}, open ${open}/${N}, S@start ${startK >= 0 ? S[startK].toFixed(3) : '-'})`] };
  }
  const ms = smooth(lead, mainNodes, true);
  routes.push({ name: P.main.to || 'main', kind: 'main', parent: -1, junction: null, dest: XY(mainK), samples: ms.samples, every: ms.every,
    widths: widths(ms.samples, W0, W0 * (P.taper != null ? P.taper : 0.8), 3.1) });
  register(0);
  // ---- BRANCHES: each routed from its destination back INTO the network ----
  const jMin = R.junctionMinR || 0, jSep = R.junctionSep || 0, junctions = [lead[lead.length - 1]];
  const farFromJunctions = (k) => { const p = XY(k); for (const J of junctions) if (Math.hypot(p[0] - J[0], p[1] - J[1]) < jSep) return false; return true; };
  (P.branches || []).forEach((b, bi) => {
    const dK = nearestOpen(nodeOf(b.at[0], b.at[1]));
    if (dK < 0) { notes.push('branch ' + b.to + ': destination blocked'); return; }
    let nodes = dijkstra(dK, (k) => netRoute[k] >= 0 && Math.hypot(...XY(k)) >= jMin && farFromJunctions(k), true);
    if (!nodes) { notes.push('branch ' + b.to + ': no junction beyond junctionMinR, relaxed'); nodes = dijkstra(dK, (k) => netRoute[k] >= 0, true); }
    if (!nodes) { notes.push('branch ' + b.to + ': unreachable'); return; }
    nodes.reverse();                                            // junction -> destination
    const jk = nodes[0], pr = netRoute[jk], psi = netSample[jk], jp = routes[pr].samples[psi];
    junctions.push(jp);
    const bs = smooth([jp], nodes, true);
    const wj = routes[pr].widths[psi] * (P.branchScale != null ? P.branchScale : 0.92);
    routes.push({ name: b.to, kind: 'branch', parent: pr, junction: jp.slice(), junctionSample: psi, dest: XY(dK), samples: bs.samples, every: bs.every,
      widths: widths(bs.samples, wj, W0 * (P.taper != null ? P.taper : 0.8) * (P.branchScale != null ? P.branchScale : 0.92), 7.7 + bi * 2.3) });
    register(routes.length - 1);
  });
  const samples = []; for (const rt of routes) rt.samples.forEach((p, i) => samples.push([p[0], p[1], rt.widths[i]]));
  return { routes, samples, notes, lattice: { step, n, ext } };
}

// ============================================================================
// LEGACY REPRODUCTIONS (for the RED regression evidence ONLY). These reproduce
// the pre-rebuild behaviour that caused the floating brown panels + missing
// constraint, so the regression tests can be shown failing against them before
// the fix. Not used by the viewer.
// ============================================================================
export function legacyRawTierField(world, modules, { seed, testMode }) {
  // old buildCells WITHOUT the |Δtier|<=1 solve, plus the old center-ring clamp.
  const g = world.grid, half = (g - 1) / 2;
  const rng = mulberry32(strSeed(seed, 'world')), cells = [];
  const ci = Math.round(half), cj = Math.round(half);
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) {
    const isCenter = (i === ci && j === cj);
    const baseX = (i - half) * world.cellSize, baseZ = (j - half) * world.cellSize;
    cells.push({ i, j, isCenter, cx: isCenter ? 0 : baseX + (rng() * 2 - 1) * world.jitter, cz: isCenter ? 0 : baseZ + (rng() * 2 - 1) * world.jitter });
  }
  const tf = modules.tierField, tph = mulberry32(strSeed(seed, 'tiers'));
  const p1 = tph() * 6.283, p2 = tph() * 6.283, p3 = tph() * 6.283;
  for (const c of cells) {
    const field = 0.5 + tf.contrast * (0.4 * Math.sin(c.cx * tf.f1 + p1) + 0.4 * Math.cos(c.cz * tf.f2 + p2) + 0.2 * Math.sin((c.cx + c.cz) * tf.f3 + p3));
    c.tier = clamp(Math.round(field * world.maxTier), 0, world.maxTier);
  }
  const center = cells.find(c => c.isCenter); if (center) center.tier = 0;
  for (const c of cells) if (!c.isCenter && center && Math.abs(c.i - center.i) <= 1 && Math.abs(c.j - center.j) <= 1) c.tier = Math.min(c.tier, 1);
  return { cells, center, g, half };
}

// Faithful reproduction of the old viewer.buildCliffs curtain geometry -> the
// SEPARATE strip meshes that floated. Returns an array of world-space triangles
// [[x,y,z],[x,y,z],[x,y,z]]. (Deterministic subset sufficient to exhibit the
// floating-panel defect; uses the same corner-lattice + sink + run heuristics.)
export function legacyCliffCurtains(L, world, modules, built, noise, { seed, testMode }) {
  const CFG = world.cliff || {}, g = world.grid, half = (g - 1) / 2;
  const chance = testMode ? 1 : world.cliffChance;
  const cliffSeed = testMode ? (world.testSeed || 777) : seed;
  const cell = {}; for (const c of built.cells) cell[c.i + '_' + c.j] = c;
  const clampI = (v) => Math.max(0, Math.min(g - 1, v));
  const centerAt = (i, j) => { const c = cell[clampI(i) + '_' + clampI(j)]; return c ? [c.cx, c.cz] : [(clampI(i) - half) * world.cellSize, (clampI(j) - half) * world.cellSize]; };
  const cornerXZ = (p, q) => { let sx = 0, sz = 0; for (const [di, dj] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const c = centerAt(p + di, q + dj); sx += c[0]; sz += c[1]; } return [sx / 4, sz / 4]; };
  const TH = (x, z) => terrainHeight(x, z, L, world, built, noise);
  const isCliffCell = (c) => mulberry32(strSeed(cliffSeed, 'cc' + c.i + '_' + c.j))() <= chance;
  const NB = [[1, 0, (ci, cj) => [[ci + 1, cj], [ci + 1, cj + 1]]], [-1, 0, (ci, cj) => [[ci, cj], [ci, cj + 1]]], [0, 1, (ci, cj) => [[ci, cj + 1], [ci + 1, cj + 1]]], [0, -1, (ci, cj) => [[ci, cj], [ci + 1, cj]]]];
  const CT = world.cliffTierDiff || 1;
  const segs = [];
  for (const c of built.cells) {
    if (!isCliffCell(c)) continue;
    for (const [di, dj, ce] of NB) {
      const nb = cell[(c.i + di) + '_' + (c.j + dj)]; if (!nb) continue;
      if (c.tier - nb.tier < CT) continue;
      const [e0, e1] = ce(c.i, c.j);
      const [ax, az] = cornerXZ(e0[0], e0[1]), [bx, bz] = cornerXZ(e1[0], e1[1]);
      const Mx = (ax + bx) / 2, Mz = (az + bz) / 2;
      if (Math.hypot(Mx, Mz) < (world.cliffFarmClear || 6)) continue;
      segs.push({ ax, az, bx, bz, hx: c.cx, hz: c.cz, lx: nb.cx, lz: nb.cz, drop: c.tier - nb.tier });
    }
  }
  const runScale = CFG.faceRunScale ?? 0.55, runMin = CFG.faceRunMin ?? 1.4, runMax = CFG.faceRunMax ?? 3.0, minDrop = CFG.minFaceDrop ?? 1.0;
  const topSink = CFG.topSink ?? 0.15, baseSink = CFG.baseSink ?? 0.1, SP = Math.max(1, CFG.spansPerEdge || 3), ROWS = Math.max(1, CFG.rows || 3);
  const silh = CFG.silhouette ?? 0.45, faceN = CFG.faceNoise ?? 0.55;  // the weathered wander that pushed verts off the surface
  const pn = (x, z, s) => noise.fbm(x * 0.2 + s * 1.7, z * 0.2 - s * 2.3, 2, 2.1, 0.55);
  const tris = [];
  for (const s of segs) {
    let gx = s.lx - s.hx, gz = s.lz - s.hz; const glen = Math.hypot(gx, gz) || 1e-6; gx /= glen; gz /= glen;
    const drop = s.drop * world.tierStep, run = Math.max(runMin, Math.min(runMax, drop * runScale));
    const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
    if (TH(mx, mz) - TH(mx + gx * run, mz + gz * run) < minDrop) continue;
    const gridV = [];
    for (let a = 0; a <= SP; a++) {
      const ta = a / SP, sx = s.ax + (s.bx - s.ax) * ta, sz = s.az + (s.bz - s.az) * ta;
      const lipJ = pn(sx, sz, 1.0) * silh;
      const lipY = TH(sx, sz) - topSink + lipJ, footX = sx + gx * run, footZ = sz + gz * run, footY = TH(footX, footZ) - baseSink;
      const colrow = [];
      for (let r = 0; r <= ROWS; r++) {
        const f = r / ROWS, edge = (r === 0 || r === ROWS), amp = edge ? 0.12 : 1.0;
        let px = sx + (footX - sx) * f, py = lipY + (footY - lipY) * f, pz = sz + (footZ - sz) * f;
        px += gx * pn(px * 1.3 + r, pz * 1.3 - r, 3.0) * faceN * amp;
        pz += gz * pn(px * 1.1 - r, pz * 1.1 + r, 4.0) * faceN * amp;
        if (!edge) py += pn(px * 1.7, pz * 1.7, 6.0) * faceN * 0.5;
        colrow.push([px, py, pz]);
      }
      gridV.push(colrow);
    }
    for (let a = 0; a < SP; a++) for (let r = 0; r < ROWS; r++) {
      const v00 = gridV[a][r], v10 = gridV[a + 1][r], v01 = gridV[a][r + 1], v11 = gridV[a + 1][r + 1];
      tris.push([v00, v10, v11], [v00, v11, v01]);
    }
  }
  return tris;
}

// Count triangles that FLOAT: all three vertices sit clearly above the terrain
// surface at their own (x,z). A watertight single heightfield has zero.
export function countFloatingTriangles(tris, grid, eps = 0.25) {
  let n = 0;
  for (const t of tris) {
    let above = 0;
    for (const v of t) {
      let hs; try { hs = sampleTerrain(v[0], v[2], grid); } catch { hs = null; }
      if (hs != null && v[1] - hs > eps) above++;
    }
    if (above === 3) n++;
  }
  return n;
}
// Count DETACHED triangles: all three vertices are off the watertight surface on
// the SAME side (all above OR all below by eps) -> the triangle is a separate mesh
// not seated on the heightfield. A single watertight heightfield has zero.
export function countDetachedTriangles(tris, grid, eps = 0.25) {
  let n = 0;
  for (const t of tris) {
    let above = 0, below = 0;
    for (const v of t) {
      let hs; try { hs = sampleTerrain(v[0], v[2], grid); } catch { hs = null; }
      if (hs == null) continue;
      if (v[1] - hs > eps) above++; else if (hs - v[1] > eps) below++;
    }
    if (above === 3 || below === 3) n++;
  }
  return n;
}

// =============================================================================
// ISLAND CORE + THE BLUEPRINT ISLAND  (spec v3.1, 2026-10-18)
// =============================================================================
// Two ways to make an `Island` (src/world/terrain.ts contract: geometry + height(x,z) +
// outline(theta) + random()), both THREE-FREE (arrays + functions); lib/islandAdapter.mjs
// turns a result into a THREE.BufferGeometry:
//   * buildIsland(spec, opts)   -- an island from its OWN spec: the game's harmonic outline
//     (same rng draws in the same order as makeIsland -> bit-identical outline(theta)), a
//     polar-ring top, the makeIsland cliff-ring cone + tip. opts.heightAt(x,z) may supply the
//     top heights: the MAIN piece passes the parent heightfield, so the farm piece IS this island.
//   * buildBlueprint(A, L, opts) -- ONE parent heightfield H(x,z) (the joined blueprint island)
//     and underside U(x,z) (depth by distance to the parent coast, tapered toward the seams), cut into MAIN + 7 petal
//     pieces along seams. Every vertex two pieces share (MAIN's rim, seam polylines, seam-wall
//     columns, MAIN's cone) is produced ONCE by a deterministic function of world position and
//     cached by key, so docked neighbours meet with bit-identical seam heights. Each piece is
//     CLOSED on its own: top + outer-coast curtain + seam curtains + underside (+ for petals:
//     the slice of MAIN's cone it docks against and the wall under MAIN's skirt).
// theta = Math.atan2(z, x) (terrain.ts convention). World units, y up. Config angles = degrees.
// Face tags: 0 top | 1 outer coast curtain | 2 underside | 3 seam wall | 4 inner wall (MAIN's
// cone slice, inside a petal) | 5 MAIN cone skirt | 6 open-seam cliff skirt (bake profile only: decorative, on the neighbour's
// side of a petal-petal seam; not part of the closed piece).
export const TAG = { top: 0, coast: 1, under: 2, seam: 3, inner: 4, cone: 5, skirt: 6 };
const TAU = Math.PI * 2, DEG = Math.PI / 180;

// src/world/random.ts rng (mulberry32), bit-identical
export function gameRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// src/world/terrain.ts makeIsland outline: the same draws in the same order -> identical outline(theta)
export function gameOutline(spec, terrainTs) {
  const H = (terrainTs && terrainTs.harmonics) || [2, 3, 5, 7], A = (terrainTs && terrainTs.amps) || [0.06, 0.045, 0.025, 0.014];
  const random = gameRng(spec.seed);
  const phases = H.map(() => random() * Math.PI * 2);
  const hp = [random(), random(), random(), random()].map((v) => v * Math.PI * 2);
  const outline = (theta) => spec.radius * (1 + H.reduce((sum, k, i) => sum + A[i] * Math.sin(k * theta + phases[i]), 0));
  return { outline, phases, hp, random };
}
export function hash3(a, b, c) {
  let h = (Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x632BE5AB, 0x85EBCA77) ^ Math.imul((c | 0) + 0x1B873593, 0xC2B2AE3D)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// the per-tree crown tint of the PAINTED crowns (art/specs/2026-10-22-painterly-trees-design.md "per-tree colour variation"): a
// near-white linear multiplier, value +/- 6 % with a slight warm / cool shift (+/- 3 %), seeded by the tree's world position on the
// preset's canopy.instanceTint seed (its hue / value amounts were for the old green crowns and are not used); null when the tint is
// off. Each channel is held to TINT_RANGE (composition.test C14): (1 +/- 0.06)(1 +/- 0.03) reaches 0.912 / 1.092 on r and b where
// both draws peak together; g never leaves it. HERE, in the shared core, so the export (lib/composition.mjs) and the proof
// (lib/arch-scene.js, the tree:<asset> Canopy parts) compute the same tints from one function.
export const TINT_RANGE = [0.92, 1.08];
export function texturedTint(x, z, T) {
  if (!T || !T.enabled) return null;
  const kx = Math.round(x * 100), kz = Math.round(z * 100), dv = (hash3(kx, kz, 7919 + T.seed) * 2 - 1) * 0.06, dw = (hash3(kx, kz, 4001 + T.seed) * 2 - 1) * 0.03;
  return [(1 + dv) * (1 + dw), 1 + dv, (1 + dv) * (1 - dw)].map((c) => Math.round(Math.min(TINT_RANGE[1], Math.max(TINT_RANGE[0], c)) * 10000) / 10000 + 0);
}
export function angDiff(a, b) { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU; return d; }
// 1 inside [a,b] degrees, smooth falloff over `soft` degrees outside; wrap-safe
export function windowDeg(thDeg, a, b, soft) {
  const c = (a + b) / 2, hw = Math.abs(b - a) / 2;
  const d = Math.abs((((thDeg - c) % 360) + 540) % 360 - 180);
  return soft > 0 ? 1 - smoothstep(hw, hw + soft, d) : (d <= hw ? 1 : 0);
}
function easedRamp(u, e) {
  if (u <= 0) return 0; if (u >= 1) return 1;
  if (u < e) return u * u / (2 * e) / (1 - e);
  if (u > 1 - e) { const w = 1 - u; return 1 - w * w / (2 * e) / (1 - e); }
  return (u - e / 2) / (1 - e);
}
function terraceFn(t, w) { const f = Math.floor(t); return f + smoothstep(1 - w, 1, t - f); }
// cone ring wobble, capped at 80% of the gap to the ring above so cone radii stay monotone (no fold;
// makeIsland's +/-7% on rf 1.0 under rf 1.03 can fold -- harmless there, but the walls under MAIN reuse ours)
function coneWobble(rings, L, wobble) { const prev = L === 0 ? 1.0 : rings[L - 1][0], rf = rings[L][0]; return Math.min(wobble, 0.8 * (prev - rf) / rf); }

// ---- an indexed mesh with a vertex cache; triangles are oriented toward `dir` ------------------
function IMesh(store) { this.p = []; this.f = []; this.tag = []; this.idx = new Map(); this.store = store; this.keys = []; }
IMesh.prototype.v = function (key) {   // vertex by global key (positions come from the shared store)
  let i = this.idx.get(key);
  if (i === undefined) { const q = this.store.get(key); if (!q) throw new Error('island core: unknown vertex ' + key); this.p.push(q[0], q[1], q[2]); i = this.p.length / 3 - 1; this.idx.set(key, i); this.keys.push(key); }
  return i;
};
// triangles are pushed with a CONSISTENT winding by construction (zip / quad bands); each band is
// then oriented as a whole toward `dir` (area-weighted vote), so near-perpendicular faces can't flip
IMesh.prototype.tri = function (a, b, c, tag) {
  if (a === b || b === c || a === c) return;
  const P = this.p, a3 = a * 3, b3 = b * 3, c3 = c * 3;
  const ux = P[b3] - P[a3], uy = P[b3 + 1] - P[a3 + 1], uz = P[b3 + 2] - P[a3 + 2];
  const vx = P[c3] - P[a3], vy = P[c3 + 1] - P[a3 + 1], vz = P[c3 + 2] - P[a3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * nx + ny * ny + nz * nz < 1e-18) return;          // coincident chain ends
  this.f.push(a, b, c); this.tag.push(tag);
};
IMesh.prototype.orient = function (from, dir) {          // orient faces [from, end) as one band
  const P = this.p, F = this.f; let vote = 0;
  for (let t = from; t < this.tag.length; t++) {
    const a3 = F[t * 3] * 3, b3 = F[t * 3 + 1] * 3, c3 = F[t * 3 + 2] * 3;
    const ux = P[b3] - P[a3], uy = P[b3 + 1] - P[a3 + 1], uz = P[b3 + 2] - P[a3 + 2], vx = P[c3] - P[a3], vy = P[c3 + 1] - P[a3 + 1], vz = P[c3 + 2] - P[a3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const d = typeof dir === 'function' ? dir((P[a3] + P[b3] + P[c3]) / 3, (P[a3 + 1] + P[b3 + 1] + P[c3 + 1]) / 3, (P[a3 + 2] + P[b3 + 2] + P[c3 + 2]) / 3) : dir;
    const dl = Math.hypot(d[0], d[1], d[2]) || 1; vote += (nx * d[0] + ny * d[1] + nz * d[2]) / dl;
  }
  if (vote < 0) for (let t = from; t < this.tag.length; t++) { const s = F[t * 3 + 1]; F[t * 3 + 1] = F[t * 3 + 2]; F[t * 3 + 2] = s; }
};
// zip two chains [{k: key, p: param}] (params increasing, same direction) into a triangle strip
function zipChains(m, A, B, tag, dir) {
  const from = m.tag.length;
  let i = 0, j = 0;
  const na = A.length - 1, nb = B.length - 1;
  while (i < na || j < nb) {
    let advA;
    if (i >= na) advA = false; else if (j >= nb) advA = true;
    else advA = (A[i].p + A[i + 1].p) <= (B[j].p + B[j + 1].p);
    if (advA) { m.tri(m.v(A[i].k), m.v(B[j].k), m.v(A[i + 1].k), tag); i++; }
    else { m.tri(m.v(A[i].k), m.v(B[j].k), m.v(B[j + 1].k), tag); j++; }
  }
  m.orient(from, dir);
}
// close two angular rings (params = angles) into chains that start together and wrap once
function closeRings(A, B) {
  const a0 = A[0].p;
  const Bu = B.map((b) => ({ k: b.k, p: a0 + (((b.p - a0) % TAU) + TAU) % TAU })).sort((x, y) => x.p - y.p);
  return [A.concat([{ k: A[0].k, p: a0 + TAU }]), Bu.concat([{ k: Bu[0].k, p: Bu[0].p + TAU }])];
}

// ---- per-piece: sampler (triangle-exact on the top faces), outline (ray-cast), normals, colours --
function topSampler(P, F, tag) {
  const tris = []; for (let t = 0; t < tag.length; t++) if (tag[t] === TAG.top) tris.push(t);
  let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
  for (const t of tris) for (let k = 0; k < 3; k++) { const i = F[t * 3 + k] * 3; minx = Math.min(minx, P[i]); maxx = Math.max(maxx, P[i]); minz = Math.min(minz, P[i + 2]); maxz = Math.max(maxz, P[i + 2]); }
  const cs = 0.75, nx = Math.max(1, Math.ceil((maxx - minx) / cs) + 1), nz = Math.max(1, Math.ceil((maxz - minz) / cs) + 1);
  const cells = new Array(nx * nz);
  for (const t of tris) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < 3; k++) { const i = F[t * 3 + k] * 3; x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
    for (let gx = Math.floor((x0 - minx) / cs); gx <= Math.floor((x1 - minx) / cs); gx++) for (let gz = Math.floor((z0 - minz) / cs); gz <= Math.floor((z1 - minz) / cs); gz++) {
      const c = gz * nx + gx; (cells[c] || (cells[c] = [])).push(t);
    }
  }
  // returns the interpolated y at (x,z) on the top faces, or null when (x,z) is outside them
  return function (x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`island height: non-finite input (${x},${z})`);
    const gx = Math.floor((x - minx) / cs), gz = Math.floor((z - minz) / cs);
    if (gx < 0 || gz < 0 || gx >= nx || gz >= nz) return null;
    const list = cells[gz * nx + gx]; if (!list) return null;
    let best = null, bestMin = -1e9;
    for (const t of list) {
      const a = F[t * 3] * 3, b = F[t * 3 + 1] * 3, c = F[t * 3 + 2] * 3;
      const x0 = P[a], z0 = P[a + 2], x1 = P[b], z1 = P[b + 2], x2 = P[c], z2 = P[c + 2];
      const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
      if (Math.abs(det) < 1e-14) continue;
      const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / det, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / det, l2 = 1 - l0 - l1;
      const mn = Math.min(l0, l1, l2);
      if (mn > bestMin) { bestMin = mn; best = l0 * P[a + 1] + l1 * P[b + 1] + l2 * P[c + 1]; if (mn >= 0) break; }
    }
    return bestMin >= -1e-9 ? best : null;
  };
}
// star-shaped boundary loop (local xz) -> outline(theta) by exact ray/edge intersection
function loopOutline(loop) {
  let ang = loop.map(([x, z]) => Math.atan2(z, x));
  const un = [ang[0]]; for (let i = 1; i < ang.length; i++) un.push(un[i - 1] + angDiff(ang[i], ang[i - 1]));
  const total = un[un.length - 1] + angDiff(ang[0], ang[ang.length - 1]) - un[0];
  let pts = loop.slice(), u = un;
  if (total < 0) { pts = loop.slice().reverse(); ang = pts.map(([x, z]) => Math.atan2(z, x)); u = [ang[0]]; for (let i = 1; i < ang.length; i++) u.push(u[i - 1] + angDiff(ang[i], ang[i - 1])); }
  let monotone = true; for (let i = 1; i < u.length; i++) if (u[i] <= u[i - 1]) { monotone = false; break; }
  const n = pts.length, base = u[0];
  function outline(theta) {
    const t = base + (((theta - base) % TAU) + TAU) % TAU;
    let lo = 0, hi = n;                          // edge i = pts[i] -> pts[(i+1)%n], spanning u[i] .. u[i+1] (u[n] = base + TAU)
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (u[mid] <= t) lo = mid; else hi = mid; }
    const a = pts[lo], b = pts[(lo + 1) % n], dx = Math.cos(theta), dz = Math.sin(theta);
    const ex = b[0] - a[0], ez = b[1] - a[1], den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-14) return Math.hypot(a[0], a[1]);
    return (a[0] * ez - a[1] * ex) / den;
  }
  return { outline, monotone, loop: pts };
}
function faceNormalOf(P, a, b, c) {
  const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1e-12;
  return [nx / l, ny / l, nz / l, 0.5 * l];
}

// =============================================================================
// buildIsland(spec, opts): an island from its OWN spec (game outline + polar top + cliff cone)
// =============================================================================
// spec = { seed, radius, hills, depth, flatCenter } (makeIsland's IslandSpec). opts: heightAt(x,z),
// ring (top ring spacing), rimN, cone (rings [[rf, y]], tipY, wobble, yJitter), terrainTs,
// rimJ (bake profile: the SUBSET of rim indices 0..rimN-1 the rim + cone use, ascending; default all).
// Default heights follow makeIsland's rolling field so own-spec islands match the game's look.
export function buildIsland(spec, opts = {}) {
  const MO = gameOutline(spec, opts.terrainTs), O = MO.outline;
  const flat = spec.flatCenter != null ? spec.flatCenter : 0.45;
  const heightAt = opts.heightAt || ((x, z) => {
    const f = Math.hypot(x, z) / O(Math.atan2(z, x)), rim = 1 - smoothstep(0.86, 1.0, f);
    const amp = spec.hills * (0.18 + 0.82 * smoothstep(flat, 0.85, f)) * rim, hp = MO.hp;
    const n = Math.sin(0.42 * x + hp[0]) * Math.cos(0.37 * z + hp[1]) * 0.6 + Math.sin(0.8 * x - 0.6 * z + hp[2]) * 0.4;
    let h = amp * (n * 0.5 + 0.5);
    for (const m of spec.mounds || []) { const d = Math.hypot(x - m.x, z - m.z) / m.r; if (d < 1) h += m.h * (0.5 + 0.5 * Math.cos(d * Math.PI)) * rim; }
    return h;
  });
  const ring = opts.ring || Math.max(0.2, spec.radius / 10), rimN = opts.rimN || Math.max(24, Math.round(TAU * spec.radius / ring));
  const cone = opts.cone || { rings: [[0.985, -0.5], [0.95, -1.25], [0.84, -2.2], [0.67, -3.2], [0.45, -4.1], [0.2, -4.9]], tipY: -5.5, wobble: 0.12, yJitter: 0.3 };
  const salt = opts.salt || 0, jit = opts.jitter != null ? opts.jitter : 0.25;
  const store = opts.store || new Map(), pre = opts.keyPrefix || ('i' + spec.seed + ':');
  const rimKey = opts.rimKey || ((j) => pre + 'r:' + j), coneKey = opts.coneKey || ((L, j) => pre + 'c:' + L + ':' + j), tipKey = opts.tipKey || (pre + 'tip');
  const rimTheta = (j) => TAU * ((((j % rimN) + rimN) % rimN) / rimN);
  const rimJ = opts.rimJ || null, nR = rimJ ? rimJ.length : rimN, rj = rimJ ? (q) => rimJ[q] : (q) => q;   // rim slot q -> rim index j
  const depth = spec.depth;
  // shared vertex producers (the blueprint passes its own so petals reuse the exact same vertices)
  if (!opts.store) {
    for (let j = 0; j < rimN; j++) { const t = rimTheta(j), r = O(t), x = Math.cos(t) * r, z = Math.sin(t) * r; store.set(rimKey(j), [x, heightAt(x, z), z]); }
    for (let L = 0; L < cone.rings.length; L++) for (let j = 0; j < rimN; j++) {
      const t = rimTheta(j), [rf, yf] = cone.rings[L];
      const wob = L === 0 ? 0 : coneWobble(cone.rings, L, cone.wobble) * (hash3(L, j, 77 + salt) - 0.5), r = rf * O(t) * (1 + wob);
      const y = yf * depth + (L === 0 ? 0 : cone.yJitter * depth * 0.5 * (hash3(L, j, 91 + salt) - 0.5));
      store.set(coneKey(L, j), [Math.cos(t) * r, y, Math.sin(t) * r]);
    }
    store.set(tipKey, [0, cone.tipY * depth, 0]);
  }
  const m = new IMesh(store);
  // top: centre + rings k = 1..Km (Km = the rim)
  const Km = Math.max(3, Math.round(spec.radius / ring));
  const cKey = pre + 'mc'; if (!store.has(cKey)) store.set(cKey, [0, heightAt(0, 0), 0]);
  const rings = [];
  for (let k = 1; k <= Km; k++) {
    const chain = [];
    if (k === Km) { for (let q = 0; q < nR; q++) chain.push({ k: rimKey(rj(q)), p: rimTheta(rj(q)) }); }
    else {
      const n = Math.max(6, Math.round(TAU * (k / Km) * spec.radius / ring));
      for (let i = 0; i < n; i++) {
        const key = pre + 'm:' + k + ':' + i;
        const t = TAU * (i + 0.5 * (k % 2) + jit * (hash3(k, i, 13 + salt) - 0.5)) / n;
        if (!store.has(key)) {
          const f = k / Km + jit * (hash3(k, i, 17 + salt) - 0.5) / Km, r = f * O(t), x = Math.cos(t) * r, z = Math.sin(t) * r;
          store.set(key, [x, heightAt(x, z), z]);
        }
        chain.push({ k: key, p: t });
      }
    }
    rings.push(chain);
  }
  const up = [0, 1, 0];
  { const [A, Bc] = closeRings([{ k: cKey, p: 0 }], rings[0]); zipChains(m, [A[0]], Bc, TAG.top, up); }
  for (let k = 0; k < rings.length - 1; k++) { const [A, Bc] = closeRings(rings[k], rings[k + 1]); zipChains(m, A, Bc, TAG.top, up); }
  // cliff cone (makeIsland ring look) + tip
  const outward = (x, y, z) => [x, -0.35 * Math.hypot(x, z), z];
  const nL = cone.rings.length, coneTag = opts.coneTag != null ? opts.coneTag : TAG.cone;
  for (let L = -1; L < nL; L++) {
    const from = m.tag.length;
    for (let q = 0; q < nR; q++) {
      const j = rj(q), j1 = rj(q + 1 === nR ? 0 : q + 1);
      const a = L < 0 ? rimKey(j) : coneKey(L, j), b = L < 0 ? rimKey(j1) : coneKey(L, j1);
      if (L + 1 === nL) { m.tri(m.v(a), m.v(tipKey), m.v(b), coneTag); continue; }
      const c = coneKey(L + 1, j), d = coneKey(L + 1, j1);
      m.tri(m.v(a), m.v(c), m.v(d), coneTag); m.tri(m.v(a), m.v(d), m.v(b), coneTag);
    }
    m.orient(from, outward);
  }
  return { spec, mesh: m, outline: O, random: MO.random, rimN, Km, depth, heightAt, store, pre };
}

// =============================================================================
// buildBlueprint(A, L, opts): the parent heightfield + MAIN + the petal pieces
// =============================================================================
export function buildBlueprint(A, L, opts = {}) {
  const T0 = Date.now();
  const B = A.blueprint, G = A.game, P = L.palette;
  const seedDefault = A.seeds.default >>> 0, seed = opts.seed != null ? (opts.seed >>> 0) : seedDefault;
  const vary = seed === seedDefault ? 0 : seed;
  const noise = makeNoise(4242 + vary * 7919);
  const MO = gameOutline(G.MAIN, A.terrainTs), Rm = MO.outline;
  // BAKE PROFILE (opts.res, lib/bake.mjs): a LOWER-RESOLUTION build of the same island for the game's baked pieces. Absent = the
  // default resolution, bit-identical. The heightfield, outlines, zones, seams and docked positions are untouched; only the sampling:
  //   rimStride    MAIN's rim + cone use every rimStride-th of the mainRimN rim indices plus every seam index, so theta, the seam
  //                starts and every shared rim / cone vertex keep their default positions and keys (neighbours still share them)
  //   mainRing     MAIN top ring spacing (u)
  //   petalRings   rings from MAIN's rim (g = 0) to the coast (g = 1); a divisor of the default keeps every seam point ON the
  //                default seam polyline (k / K is the same double), so the seams in blueprint.pieces.json stay exact
  //   stepScale    petal arc step multiplier
  //   underAngStep underside arc step (x the arc step); coastRowStep: coast-wall row spacing (u)   (these three: a number or { pieceId: x })
  //   seamRowStep  seam-wall row spacing (u; one value: each seam wall is shared by two pieces)
  //   refineFlat { tol, minEdge } / refineShape { tol, minEdge }: adaptive bisection of the top (refineFlatEdges below)
  const RES = opts.res || null;
  const N = B.mainRimN, K = (RES && RES.petalRings) || B.petalRings, tierStep = B.tierStep, jit = B.jitter;
  const defs = B.pieces, np = defs.length;
  const snapJ = (deg) => (((Math.round(deg / 360 * N)) % N) + N) % N;
  const rimTheta = (j) => TAU * ((((j % N) + N) % N) / N);
  const store = new Map();

  // ---- parent coast Rc(theta) ----
  const C = B.coast, cTargets = C.targets.map(([d, r]) => [d * DEG, r]), cSig = C.sigma * DEG;
  function Rc(th) {
    let ws = 0, rs = 0;
    for (const [t, r] of cTargets) { const d = angDiff(th, t) / cSig, w = Math.exp(-d * d); ws += w; rs += w * r; }
    let R = rs / ws, hsum = 0;
    for (const [k, a, ph] of C.harmonics) hsum += a * Math.sin(k * th + ph + vary * 0.37 * k);
    R *= 1 + hsum;
    if (C.promontory) { const d = angDiff(th, C.promontory.theta * DEG) / (C.promontory.width * DEG); R += C.promontory.gain * Math.exp(-d * d); }
    return R;
  }
  let maxRc = 0; for (let i = 0; i < 720; i++) maxRc = Math.max(maxRc, Rc(i / 720 * TAU));
  const ringR = (th, g) => Rm(th) + g * (Rc(th) - Rm(th));

  // ---- distance-to-coast field (signed: + inside) on a grid, bilinear ----
  const UP = B.underside, dfC = UP.dfCell, dfR = Math.ceil(maxRc + 3), dfn = Math.ceil(2 * dfR / dfC) + 1;
  const cpts = new Float64Array(2880); for (let i = 0; i < 1440; i++) { const t = i / 1440 * TAU, r = Rc(t); cpts[2 * i] = Math.cos(t) * r; cpts[2 * i + 1] = Math.sin(t) * r; }
  const df = new Float32Array(dfn * dfn);
  for (let gj = 0; gj < dfn; gj++) for (let gi = 0; gi < dfn; gi++) {
    const x = -dfR + gi * dfC, z = -dfR + gj * dfC; let mn = 1e18;
    for (let i = 0; i < 2880; i += 2) { const dx = cpts[i] - x, dz = cpts[i + 1] - z, d = dx * dx + dz * dz; if (d < mn) mn = d; }
    const inside = Math.hypot(x, z) < Rc(Math.atan2(z, x));
    df[gj * dfn + gi] = inside ? Math.sqrt(mn) : -Math.sqrt(mn);
  }
  function dcAt(x, z) {
    const fx = (x + dfR) / dfC, fz = (z + dfR) / dfC; let gi = Math.floor(fx), gj = Math.floor(fz);
    if (gi < 0 || gj < 0 || gi >= dfn - 1 || gj >= dfn - 1) return -10;
    const u = fx - gi, v = fz - gj, a = df[gj * dfn + gi], b = df[gj * dfn + gi + 1], c = df[(gj + 1) * dfn + gi], d = df[(gj + 1) * dfn + gi + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }

  // ---- tier design field phi (tiers), heights ----
  // per-feature tier HEIGHT (v4): `tierH` (u per tier) lets the highland mesa use tall 1.5 u risers while the
  // tier lattice (|dTier| <= 1, in TIERS) is unchanged; features without it use the parent tierStep
  const feats = B.features.map((F, i) => ({ ...F, _s: (i + 1) * 7.31 + vary * 0.913, _h: F.tierH || tierStep }));
  const warp = (x, z, amp, s, f = 0.33) => amp ? [x + amp * noise.fbm(x * f + s, z * f - s * 1.7, 2, 2, 0.5), z + amp * noise.fbm(x * f - s * 2.3, z * f + s, 2, 2, 0.5)] : [x, z];
  // mesa level: signed distance (u, + inside) to a sector [theta0, theta1] (deg) beyond r0(theta) (+ harmonic bastions)
  function mesaInside(lv, r, thd) {
    const c = (lv.theta[0] + lv.theta[1]) / 2, hw = (lv.theta[1] - lv.theta[0]) / 2;
    const dTh = hw - Math.abs((((thd - c) % 360) + 540) % 360 - 180);
    let r0 = lv.r0; if (lv.wobble) for (const [k, amp, ph] of lv.wobble) r0 += amp * Math.sin(k * thd * DEG + ph);
    return Math.min(r - r0, dTh * DEG * r);
  }
  function featureTier(F, x, z) {
    if (F.type === 'mesa') {   // nested flat-topped levels, each edged by a TIGHT riser (near-vertical rock)
      const [wx, wz] = warp(x, z, F.warp, F._s, F.warpFreq || 0.33), r = Math.hypot(wx, wz), thd = Math.atan2(wz, wx) / DEG;
      let t = 0; for (const lv of F.levels) { const d = mesaInside(lv, r, thd); if (d > -F.feather) t += smoothstep(-F.feather, F.feather, d); }
      return t;
    }
    if (F.type === 'sector') {
      const [wx, wz] = warp(x, z, F.warp, F._s), thd = Math.atan2(wz, wx) / DEG;
      let W;
      if (F.softU) {   // flank of fixed WIDTH in units (not angle): W = 0 at theta[0]/theta[1], 1 at softU inside
        const c = (F.theta[0] + F.theta[1]) / 2, hw = (F.theta[1] - F.theta[0]) / 2;
        const dd = hw - Math.abs((((thd - c) % 360) + 540) % 360 - 180);
        W = dd <= 0 ? 0 : easedRamp(dd * DEG * Math.hypot(wx, wz) / F.softU, 0.15);
      } else W = windowDeg(thd, F.theta[0], F.theta[1], F.soft);
      if (W <= 0) return 0;
      let t = F.tiers * easedRamp((Math.hypot(wx, wz) - F.r[0]) / (F.r[1] - F.r[0]), F.ease || 0.1) * W;
      if (F.terrace) { const M = windowDeg(thd, F.terrace.theta[0], F.terrace.theta[1], F.terrace.soft); if (M > 0) t += (terraceFn(t, F.terrace.w) - t) * M; }
      return t;
    }
    if (F.type === 'disc') {
      const rx = F.r, rz = F.rz || F.r, reach = Math.max(rx, rz) + (F.warp || 0) * 1.2 + 0.1;
      if (Math.abs(x - F.at[0]) > reach || Math.abs(z - F.at[1]) > reach) return 0;
      const [wx, wz] = warp(x, z, F.warp, F._s);
      let lx = wx - F.at[0], lz = wz - F.at[1];
      if (F.rot) { const c = Math.cos(F.rot * DEG), s = Math.sin(F.rot * DEG), ax = c * lx + s * lz, az = -s * lx + c * lz; lx = ax; lz = az; }
      const e = (Math.hypot(lx / rx, lz / rz) - 1) * 0.5 * (rx + rz);
      return F.tiers * (1 - smoothstep(-F.soft, 0, e));
    }
    return 0;
  }
  function phiAt(x, z) { let t = 0; for (const F of feats) t += featureTier(F, x, z); return t; }
  // piece angular ranges (deg, unwrapped so b > a)
  const seamJ = defs.map((d) => snapJ(d.from));
  const rimStride = (RES && RES.rimStride) || 1, onRim = (j) => rimStride === 1 || j % rimStride === 0 || seamJ.includes(j);
  const ranges = defs.map((d, i) => { const a = 360 * seamJ[i] / N, b0 = 360 * seamJ[(i + 1) % np] / N; return [a, b0 <= a ? b0 + 360 : b0]; });
  const RL = B.roll;
  function rollAmp(x, z) {
    const th = Math.atan2(z, x), thd = th / DEG, r = Math.hypot(x, z);
    let ws = 0, as = 0;
    for (let i = 0; i < np; i++) { const w = windowDeg(thd, ranges[i][0], ranges[i][1], RL.blend) + 1e-9; ws += w; as += w * (RL.pieces[defs[i].id] || 0); }
    let amp = as / ws;
    const tm = smoothstep(Rm(th) - 1.0, Rm(th) + 1.0, r);
    amp = RL.pieces.main + (amp - RL.pieces.main) * tm;
    for (const pc of defs) { const d = Math.hypot(x - pc.pivot[0], z - pc.pivot[1]); if (d < pc.core + RL.coreFade) amp *= smoothstep(pc.core * 0.5, pc.core + RL.coreFade, d); }
    return amp;
  }
  function H0base(x, z) {
    let h = 0; for (const F of feats) { const t = featureTier(F, x, z); if (t) h += t * F._h; }
    for (const mo of B.mounds) { const d = Math.hypot(x - mo.at[0], z - mo.at[1]); if (d < mo.r) h += mo.h * (0.5 + 0.5 * Math.cos(Math.PI * d / mo.r)); }
    const amp = rollAmp(x, z); if (amp > 0) h += amp * noise.fbm(x * RL.freq + 3.3, z * RL.freq - 7.1, 3, 2, 0.5);
    const lp = B.coastLip; if (lp) { const dc = dcAt(x, z); if (dc < lp.width) h -= lp.drop * (1 - smoothstep(0, lp.width, dc)) * windowDeg(Math.atan2(z, x) / DEG, lp.theta[0], lp.theta[1], lp.soft); }
    return h;
  }
  const H0 = H0base;

  // ---- flat zones: every layout.ts spot on MAIN (level 0) + each piece's labelled zones ----
  const zones = [];
  const MZ = A.mainZones, ZR = MZ.radii;
  const zoneBB = (z) => { const pad = z.margin + z.feather + (z.r || 0) + 0.05; return z.type === 'rect' ? [z.x0 - pad, z.z0 - pad, z.x1 + pad, z.z1 + pad]
    : z.type === 'capsule' ? [Math.min(z.ax, z.bx) - pad, Math.min(z.az, z.bz) - pad, Math.max(z.ax, z.bx) + pad, Math.max(z.az, z.bz) + pad] : [z.x - pad, z.z - pad, z.x + pad, z.z + pad]; };
  const addZ = (z) => { z.bb = zoneBB(z); zones.push(z); return z; };
  const mz = (o) => addZ({ level: MZ.level, margin: MZ.margin, feather: MZ.feather, piece: 'main', ...o });
  const disc = (what, at, r) => mz({ type: 'disc', what, x: at[0], z: at[1], r });
  const caps = (what, a, b, r) => mz({ type: 'capsule', what, ax: a[0], az: a[1], bx: b[0], bz: b[1], r });
  const poly = (what, pts, r) => { for (let i = 0; i < pts.length - 1; i++) caps(what, pts[i], pts[i + 1], r); };
  disc('core', [0, 0], MZ.core);
  disc('house', [G.HOUSE.x, G.HOUSE.z], ZR.house); disc('porch', G.PORCH, ZR.porch);
  const GA = G.GARDEN; mz({ type: 'rect', what: 'garden', x0: GA.x0 - 0.28, z0: GA.z0 - 0.28, x1: GA.x0 + GA.cell * 4 + 0.28, z1: GA.z0 + GA.cell * 4 + 0.28, r: 0 });
  G.PLOT_SLOTS.forEach(([c, r]) => disc('plot', [GA.x0 + GA.cell * (c + 0.5), GA.z0 + GA.cell * (r + 0.5)], ZR.plot));
  disc('pond', [G.POND.x, G.POND.z], G.POND.r + ZR.pondBank);
  const WT = A.waterTs.stream;
  const sDir = [Math.cos(G.STREAM_THETA), Math.sin(G.STREAM_THETA)];
  const sStart = [G.POND.x + sDir[0] * G.POND.r * WT.startFrac, G.POND.z + sDir[1] * G.POND.r * WT.startFrac];
  const sEndR = Rm(G.STREAM_THETA) - WT.endInset, sEnd = [sDir[0] * sEndR, sDir[1] * sEndR];   // rimPoint(MAIN, theta, -0.05)
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const sMid1 = lerp2(sStart, sEnd, WT.mid1.t), sMid2 = lerp2(sStart, sEnd, WT.mid2.t);
  sMid1[0] += WT.mid1.off[0]; sMid1[1] += WT.mid1.off[1]; sMid2[0] += WT.mid2.off[0]; sMid2[1] += WT.mid2.off[1];
  const streamPts = [sStart, sMid1, sMid2, sEnd];
  // (water rev 1) MAIN's flat zones are FROZEN with the piece tops (the v3 freeze: look.test L0, bake.test B16), so this corridor stays
  // the game's Water.tsx stream, and flowerbed 8's zone stays at its frozen spot (farmWater.frozen) though the bed itself moves (the
  // art-owned farm water and the new bed spot sit on ground already level within 0.03 u; the composition drops what they cover)
  poly('stream', streamPts, ZR.streamHalf);
  const FW = A.farmWater;
  caps('jetty', A.lanes.JETTY[0], A.lanes.JETTY[1], ZR.jettyHalf);
  disc('windmill', G.WINDMILL, ZR.windmill); disc('greenhouse', [G.GREENHOUSE.x, G.GREENHOUSE.z], ZR.greenhouse);
  disc('well', G.WELL, ZR.well); disc('bench', [G.BENCH.x, G.BENCH.z], ZR.bench); disc('scarecrow', G.SCARECROW, ZR.scarecrow);
  G.LANTERNS.forEach((p) => disc('lantern', p, ZR.lantern));
  G.FLOWERBEDS.forEach((p, i) => disc('flowerbed', (FW && FW.frozen && FW.frozen.flowerbeds[i]) || p, ZR.flowerbed));   // (water rev 1: flowerbed 8's zone stays frozen)
  G.FRUIT_TREES.forEach((p) => disc('fruitTree', p, ZR.fruitTree)); G.BEEHIVES.forEach((p) => disc('beehive', p, ZR.beehive));
  G.STATIC_TREES.forEach((t) => disc('staticTree', t.at, ZR.treeBase + ZR.treePerScale * t.s)); G.BUSHES.forEach((p) => disc('bush', p, ZR.bush));
  A.mainIslandTsx.ROCKS.forEach((r) => disc('rock', r.at, ZR.rock));
  A.mainIslandTsx.HOME_FENCE.forEach(([a, b]) => caps('homeFence', a, b, ZR.fenceHalf)); G.FENCE_RUNS.forEach(([a, b]) => caps('fenceRun', a, b, ZR.fenceHalf));
  G.DIRT_PATHS.forEach((p) => poly('dirtPath', p, ZR.dirtPathHalf)); G.STONE_PATHS.forEach((p) => poly('stonePath', p, ZR.stonePathHalf));
  G.BLOCKERS.forEach((b) => disc('blocker:' + b.what, b.at, b.r));
  const LN = A.lanes;
  disc('noticeBoard', LN.NOTICE_BOARD, ZR.notice); disc('hedgeCottage', [LN.HEDGE_COTTAGE.x, LN.HEDGE_COTTAGE.z], ZR.hedgeCottage); disc('hedgeCottageSpec', LN.HAZEL_SPEC, ZR.hazelSpec);
  disc('mailbox', LN.MAILBOX, ZR.mailbox); disc('hazel', LN.HAZEL, ZR.hazel); disc('burrow', LN.BURROW_DOOR, ZR.burrow); disc('bramble', LN.BRAMBLE, ZR.bramble);
  const mainZoneCount = zones.length;
  for (const zn of zones) zn.pri = 2;
  // piece zones (flat unless flat === false): CORES first (priority 3), then the rest (priority 1); each
  // takes the ground level at its centre AFTER the zones before it, so neighbouring flats agree
  for (const pass of ['core', 'other']) for (const [pid, list] of Object.entries(B.zones)) for (const zn of list) {
    if (zn.flat === false || (pass === 'core') !== (zn.kind === 'core')) continue;
    const level = flatten(zn.at[0], zn.at[1], H0(zn.at[0], zn.at[1]));
    addZ({ type: 'disc', what: zn.id, piece: pid, x: zn.at[0], z: zn.at[1], r: zn.r, margin: zn.kind === 'core' ? 0.45 : 0.3, feather: zn.feather != null ? zn.feather : zn.kind === 'core' ? 1.4 : 1.0, level, pri: zn.kind === 'core' ? 3 : 1 });
  }
  function zoneDist(z, x, y) {
    if (z.type === 'disc') return Math.hypot(x - z.x, y - z.z) - z.r;
    if (z.type === 'capsule') { const dx = z.bx - z.ax, dz = z.bz - z.az, t = clamp(((x - z.ax) * dx + (y - z.az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(x - (z.ax + dx * t), y - (z.az + dz * t)) - z.r; }
    const ex = Math.max(z.x0 - x, x - z.x1), ez = Math.max(z.z0 - y, y - z.z1);
    return (ex > 0 || ez > 0) ? Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) : Math.max(ex, ez);
  }
  // inside a zone's flat radius (r + margin) the ground IS that zone's level (highest priority wins, then the
  // earliest), so no neighbour's feather can tilt a building pad; outside, feathers blend in order
  function flatten(x, z, h) {
    let best = null;
    for (const zn of zones) {
      if (x < zn.bb[0] || z < zn.bb[1] || x > zn.bb[2] || z > zn.bb[3]) continue;
      if (zoneDist(zn, x, z) <= zn.margin && (!best || zn.pri > best.pri)) best = zn;
    }
    if (best) return best.level;
    for (const zn of zones) {
      if (x < zn.bb[0] || z < zn.bb[1] || x > zn.bb[2] || z > zn.bb[3]) continue;
      const d = zoneDist(zn, x, z), w = 1 - smootherstep(zn.margin, zn.margin + zn.feather, d);
      if (w > 0) h += (zn.level - h) * w;
    }
    return h;
  }

  // ---- carved water channels (river from the MAIN stream exit -> lake; lake outflow -> coast) ----
  const WB = B.water, channels = [];
  function makeChannel(id, pts, lvl0, lvl1, w0, w1, depth, bank, rampIn) {
    const dense = resamplePolyline(catmullRomCentripetal(pts, 6), 0.25);
    const s = [0]; for (let i = 1; i < dense.length; i++) s.push(s[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    const S = s[s.length - 1];
    let bb = [1e9, 1e9, -1e9, -1e9]; for (const p of dense) bb = [Math.min(bb[0], p[0]), Math.min(bb[1], p[1]), Math.max(bb[2], p[0]), Math.max(bb[3], p[1])];
    const pad = Math.max(w0, w1) / 2 + bank + 0.2; bb = [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad];
    const ch = { id, pts: dense, s, S, lvl0, lvl1, w0, w1, depth, bank, rampIn, bb,
      level: (t) => lvl0 + (lvl1 - lvl0) * (t / S), width: (t) => w0 + (w1 - w0) * (t / S) };
    channels.push(ch); return ch;
  }
  function carve(x, z, h) {
    for (const ch of channels) {
      if (x < ch.bb[0] || z < ch.bb[1] || x > ch.bb[2] || z > ch.bb[3]) continue;
      let best = 1e9, bs = 0; const P2 = ch.pts;
      for (let i = 0; i < P2.length - 1; i++) {
        const ax = P2[i][0], az = P2[i][1], dx = P2[i + 1][0] - ax, dz = P2[i + 1][1] - az, L2 = dx * dx + dz * dz || 1e-12;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d < best) { best = d; bs = ch.s[i] + t * (ch.s[i + 1] - ch.s[i]); }
      }
      const hw = ch.width(bs) / 2;
      if (best > hw + ch.bank) continue;
      const bed = ch.level(bs) - ch.depth * smoothstep(0, ch.rampIn, bs);
      const target = bed + 0.55 * smoothstep(hw * 0.75, hw + ch.bank, best);   // wide grassy banks, no rock fringe
      if (target < h) h = target;
    }
    return h;
  }
  // STAIRS (v4): a straight ramp corridor cut through a riser (from = lower tread, to = upper tread); the ground
  // inside follows a linear grade between the two (flattened) tread heights, so a nearby zone feather can't bend it;
  // the proof lays stone steps on it. A stair may END on a flat pad's edge (its end cap then sits at the pad level).
  const stairs = (B.stairs || []).map((S) => { const dx = S.to[0] - S.from[0], dz = S.to[1] - S.from[1], len = Math.hypot(dx, dz), f = S.feather != null ? S.feather : 0.25, pad = S.width / 2 + f;
    return { ...S, dx, dz, len, f, h0: flatten(S.from[0], S.from[1], H0(S.from[0], S.from[1])), h1: flatten(S.to[0], S.to[1], H0(S.to[0], S.to[1])),
      bb: [Math.min(S.from[0], S.to[0]) - pad, Math.min(S.from[1], S.to[1]) - pad, Math.max(S.from[0], S.to[0]) + pad, Math.max(S.from[1], S.to[1]) + pad] }; });
  function stairRamp(x, z, h) {
    for (const S of stairs) {
      if (x < S.bb[0] || z < S.bb[1] || x > S.bb[2] || z > S.bb[3]) continue;
      const t = clamp(((x - S.from[0]) * S.dx + (z - S.from[1]) * S.dz) / (S.len * S.len), 0, 1), d = Math.hypot(x - S.from[0] - S.dx * t, z - S.from[1] - S.dz * t);
      const m = 1 - smoothstep(S.width / 2, S.width / 2 + S.f, d); if (m <= 0) continue;
      h += (S.h0 + (S.h1 - S.h0) * t - h) * m;
    }
    return h;
  }
  const Hpre = (x, z) => stairRamp(x, z, flatten(x, z, H0(x, z)));
  const H = (x, z) => carve(x, z, Hpre(x, z));
  // river: starts EXACTLY at the main stream's rim exit (Water.tsx end point), width/level continue it
  const streamEndLevel = Hpre(sEnd[0], sEnd[1]) + WT.endLift, streamEndWidth = WT.width[0] + WT.width[1], streamEndBank = WT.bank[0] + WT.bank[1];
  const lakeLevel = WB.lake.level;
  const river = makeChannel('river', [sEnd, ...WB.river.via, WB.river.toLakeEnd], streamEndLevel, lakeLevel, streamEndWidth, WB.river.endWidth, WB.river.bedDepth, WB.river.bank, 2.6);
  const ofTh = WB.outflow.toCoastTheta * DEG, ofR = Rc(ofTh) + 0.6, ofEnd = [Math.cos(ofTh) * ofR, Math.sin(ofTh) * ofR];
  const outflow = makeChannel('outflow', [WB.outflow.from, ...WB.outflow.via, ofEnd], lakeLevel, lakeLevel - 0.12, WB.outflow.width, WB.outflow.width * 0.9, WB.outflow.bedDepth, WB.outflow.bank, 0.8);

  // ---- underside U(x,z) ----
  // v4 (UP.wallH set): every outer coast is a WALL of warm stone wallH tall below the top (the coast curtain runs
  // from the top edge down to U at the coast), then a craggy rock CONE tapering to a deep tip: U follows the top
  // near the coast (so the wall height is the same everywhere, plateau or meadow) and lets go of it by topBlend,
  // then drops by the (dc, depth) profile. v3 (no wallH): depth by distance to the parent coast, terrain.ts rings.
  const prof = UP.wallH ? UP.profile : [[0, UP.coastLip], [0.05, 1.25], [0.16, 2.2], [0.33, 3.2], [0.55, 4.1], [0.8, 4.9], [1.0, 5.5]];
  const profAt = (d) => { let k = 1; while (k < prof.length - 1 && prof[k][0] < d) k++; const [d0, p0] = prof[k - 1], [d1, p1] = prof[k]; return p0 + (p1 - p0) * clamp((d - d0) / (d1 - d0), 0, 1); };
  // v5 SEAM TAPER (UP.seamTaper): each petal's underside also falls toward its two seams, as if they were coasts, so a petal docked
  // alone hangs like its own rock off the farm (its seam walls shrink to the coast wall's height, wallH) instead of ending in a flat
  // radial slab. The depth below goes by an EFFECTIVE coast distance de = dc - S * max(0, dc - ds): ds = the distance to the nearest
  // seam line (each seam run on radially under MAIN to the axis), S = smoothstep(fade[0], fade[1], dc) = 0 at the outer coast and
  // full inland (MAIN's rim and axis), so the joined island's outer cone (all the game cameras see above the cloud sea) is untouched;
  // where the seams meet, the two lobes leave a groove deep underneath. Under MAIN (`ceil` = MAIN's cone vertex above the point) a
  // petal's underside stays >= `gap` below the cone (B13c). Absent = v4 (de = dc).
  const ST = UP.wallH && UP.seamTaper ? UP.seamTaper : null;
  const seamLines = ST ? defs.map((d, i) => {   // the seam curves (as `seams` below, resolution-free), dense, from the axis out past the coast
    const th0 = rimTheta(seamJ[i]), r0 = Rm(th0), r1 = Rc(th0), sway = (d.sway || 0) * DEG, out = Math.max(r1, maxRc) + 3, pts = [0, 0, Math.cos(th0) * r0, Math.sin(th0) * r0];
    for (let r = r0 + 0.25; r <= out; r += 0.25) { const u = Math.min(1, (r - r0) / (r1 - r0)), th = th0 + sway * u * u * (3 - 2 * u); pts.push(Math.cos(th) * r, Math.sin(th) * r); }
    return Float64Array.from(pts);
  }) : [];
  function seamDist(x, z) {
    let best = Infinity;
    for (const L of seamLines) for (let i = 0; i < L.length - 2; i += 2) {
      const ax = L[i], az = L[i + 1], dx = L[i + 2] - ax, dz = L[i + 3] - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      const ex = x - ax - dx * t, ez = z - az - dz * t, d2 = ex * ex + ez * ez; if (d2 < best) best = d2;
    }
    return Math.sqrt(best);
  }
  // s = the hanging-depth scale (bake profile underScale; 1 = the default): the cone BELOW the coast wall (profile + crags + ribs) is
  // squashed vertically by s; the wall height, the top and every seam stay put. ceil (v5): the y of MAIN's cone above (cone keys only)
  function Uat(x, z, s, ceil) {
    const dc0 = Math.max(0, dcAt(x, z)), S = ST ? smoothstep(ST.fade[0], ST.fade[1], dc0) : 0, dc = S > 0 ? dc0 - S * Math.max(0, dc0 - seamDist(x, z)) : dc0;
    const wallH = UP.wallH;
    let y;
    if (UP.wallH) {
      y = H(x, z) * (1 - smoothstep(0, UP.topBlend, dc)) - wallH - s * profAt(dc);
    } else {
      const u = Math.min(1, dc / UP.reach);
      let k = 1; while (k < prof.length - 1 && prof[k][0] < u) k++;
      const [u0, p0] = prof[k - 1], [u1, p1] = prof[k];
      y = -UP.depth * s * (p0 + (p1 - p0) * clamp((u - u0) / (u1 - u0), 0, 1));
    }
    if (UP.crag) y += s * UP.crag * (noise.fbm(x * UP.cragFreq + 11.1, z * UP.cragFreq - 4.4, 3, 2.1, 0.55) + 0.6 * (Math.abs(noise.fbm(x * UP.cragFreq * 2.3 - 5.2, z * UP.cragFreq * 2.3 + 8.8, 2, 2, 0.5)) - 0.25)) * smoothstep(UP.cragIn != null ? UP.cragIn : 0.4, 2.5, dc);
    if (UP.ribs) {   // v4: buttresses + gullies running down the cone (fast along the coast, slow with depth) -> vertical rock ribs
      const arc = Math.atan2(z, x) * 26, R = UP.ribs;
      y += s * R.amp * (Math.abs(noise.fbm(arc * R.freq + 41.3, dc * 0.1 - 9.7, 2, 2.2, 0.5)) * 2 - 0.5) * smoothstep(R.in, R.in + 2.5, dc);
    }
    // under MAIN: the lobe hangs from just under MAIN's cone (the wall under the cone shrinks to `gap` at the seam), never above it
    if (ST && ceil != null) y = Math.min(y, Math.min(H(x, z) - wallH, ceil - ST.gap) - s * profAt(dc));
    return y;
  }
  // MAIN's cone (ring profile, no wobble / jitter) as the ceiling of a general U(x, z) query inside MAIN's rim (proof helpers only;
  // the store's cone keys pass their own cone vertex)
  const MCr = B.mainCone, coneRings = MCr.rings.map(([rf, yf]) => [rf, yf * MCr.depth]).concat([[0, MCr.tipY * MCr.depth]]);
  const coneCeil = (x, z) => { const f = Math.hypot(x, z) / Rm(Math.atan2(z, x)); if (f >= 1) return undefined;
    for (let k = 0; k < coneRings.length - 1; k++) { const [f0, y0] = coneRings[k], [f1, y1] = coneRings[k + 1]; if (f <= f0 && f >= f1) return y1 + (y0 - y1) * (f - f1) / Math.max(1e-9, f0 - f1); }
    return f > coneRings[0][0] ? 0 : coneRings[coneRings.length - 1][1]; };
  const USC = (RES && RES.underScale) || 1, U = (x, z, ceil) => Uat(x, z, USC, ceil), UWH = UP.wallH || 0;

  // ---- shared vertices: MAIN rim + MAIN cone (the MAIN piece is buildIsland over the parent H) ----
  const MC = B.mainCone, nL = MC.rings.length;
  for (let j = 0; j < N; j++) { const t = rimTheta(j), r = Rm(t), x = Math.cos(t) * r, z = Math.sin(t) * r; store.set('r:' + j, [x, H(x, z), z]); store.set('ru:' + j, [x, U(x, z), z]); }
  for (let Lv = 0; Lv < nL; Lv++) for (let j = 0; j < N; j++) {
    const t = rimTheta(j), [rf, yf] = MC.rings[Lv];
    const wob = Lv === 0 ? 0 : coneWobble(MC.rings, Lv, MC.wobble) * (hash3(Lv, j, 77 + vary) - 0.5), r = rf * Rm(t) * (1 + wob);
    const y = yf * MC.depth + (Lv === 0 ? 0 : MC.yJitter * MC.depth * 0.5 * (hash3(Lv, j, 91 + vary) - 0.5));
    const x = Math.cos(t) * r, z = Math.sin(t) * r;
    store.set('c:' + Lv + ':' + j, [x, y, z]); store.set('cu:' + Lv + ':' + j, [x, U(x, z, y), z]);
  }
  store.set('tip', [0, MC.tipY * MC.depth, 0]); store.set('axu', [0, U(0, 0, MC.tipY * MC.depth), 0]);
  // a store underside vertex at another hanging scale (exportBlueprint's game bottom): cone keys keep their cone vertex as the ceiling
  const Ukey = (key, s) => { const q = store.get(key), pre = key.split(':')[0];
    const ceil = pre === 'cu' ? store.get('c:' + key.slice(3))[1] : pre === 'axu' ? store.get('tip')[1] : undefined; return Uat(q[0], q[2], s, ceil); };

  // ---- seams: start ON a MAIN rim vertex, sway gently toward the coast ----
  const seams = defs.map((d, i) => {
    const j = seamJ[i], th0 = rimTheta(j), r0 = Rm(th0), r1 = Rc(th0), sway = (d.sway || 0) * DEG;
    const thetaAt = (r) => { if (r <= r0) return th0; const u = Math.min(1, (r - r0) / (r1 - r0)); return th0 + sway * u * u * (3 - 2 * u); };
    return { i, j, th0, r0, r1, sway, thetaAt, hi: d.id, lo: defs[(i - 1 + np) % np].id };   // `hi` = piece on its higher-theta side
  });
  function seamXZ(s, k) {
    if (k === 0) { const q = store.get('r:' + s.j); return [q[0], q[2]]; }
    const g = k / K; let lo = s.r0, hi = Math.max(s.r1, Rc(s.th0)) * 1.4 + 3;
    for (let it = 0; it < 70; it++) { const mid = 0.5 * (lo + hi); if (mid - ringR(s.thetaAt(mid), g) < 0) lo = mid; else hi = mid; }
    const r = 0.5 * (lo + hi), th = s.thetaAt(r); return [Math.cos(th) * r, Math.sin(th) * r];
  }
  const SW = B.seamWall, seamRow = (RES && RES.seamRowStep) || SW.rowStep;
  const seamPts = seams.map((s) => { const pts = []; for (let k = 0; k <= K; k++) pts.push(seamXZ(s, k)); return pts; });
  seams.forEach((s, i) => {
    let acc = 0; s.arc = [0];
    for (let k = 1; k <= K; k++) { acc += Math.hypot(seamPts[i][k][0] - seamPts[i][k - 1][0], seamPts[i][k][1] - seamPts[i][k - 1][1]); s.arc.push(acc); }
    for (let k = 1; k <= K; k++) { const [x, z] = seamPts[i][k]; store.set('s:' + i + ':' + k, [x, H(x, z), z]); store.set('su:' + i + ':' + k, [x, U(x, z), z]); }
  });
  const sKey = (i, k) => (k === 0 ? 'r:' + seams[i].j : 's:' + i + ':' + k), suKey = (i, k) => (k === 0 ? 'ru:' + seams[i].j : 'su:' + i + ':' + k);
  // a wall COLUMN: top -> bottom with rows every ~rowStep, interior rows displaced along `dir` (rugged rock)
  // (ampScale tapers the displacement to 0 at shared end columns so neighbouring strips never fold)
  // facet (v4 coast walls): instead of the noise bulge, a BLOCKY offset per ~facetW of coast (vertical facets with
  // crisp edges where neighbouring blocks differ), held constant down the wall (crisp top edge, flaring back to the
  // coast line only over the last `foot` of the height so the underside still starts on the outline)
  // extra (bake profile seamTopRows): additional rows at these depths (u below the top), e.g. so a flat seam wall carries strata in
  // its vertex colours where it is seen; regular rows within 0.45 u of one are dropped
  function column(id, topKey, botKey, dir, along, ampScale = 1, facet = null, extra = null) {
    const t = store.get(topKey), b = store.get(botKey), Ht = t[1] - b[1], M = Math.max(1, Math.ceil(Ht / seamRow));
    if (facet) {
      // rows: a lip row just under the top edge, then every rowStep, then a foot row; all offset by the block's
      // facet offset (+ a small per-vertex jig), so the face is a vertical slab with a crisp top edge
      const vs = [facet.lip / Ht]; for (let u = facet.rowStep; u < Ht - facet.foot - 0.12; u += facet.rowStep) vs.push(u / Ht); vs.push(1 - facet.foot / Ht);
      const chain = [{ k: topKey, p: 0 }], off = facet.offset * ampScale;
      vs.forEach((v, mI) => {
        if (!(v > 0 && v < 1)) return;
        const key = id + ':f' + mI;
        if (!store.has(key)) {
          const y = t[1] + (b[1] - t[1]) * v, jig = facet.jig * (hash3(Math.round(along * 7.3), mI, 4111) - 0.5) * ampScale;
          store.set(key, [t[0] + (b[0] - t[0]) * v + dir[0] * (off + jig), y, t[2] + (b[2] - t[2]) * v + dir[1] * (off + jig)]);
        }
        chain.push({ k: key, p: v });
      });
      chain.push({ k: botKey, p: 1 });
      return chain;
    }
    const chain = [{ k: topKey, p: 0 }];
    if (SW.lipRow && Ht > 2.2 * SW.lipRow) {         // a thin grassy lip row just under the edge (crisp makeIsland-style lip)
      const key = id + ':lip', v = SW.lipRow / Ht;
      if (!store.has(key)) store.set(key, [t[0] + (b[0] - t[0]) * v, t[1] - SW.lipRow, t[2] + (b[2] - t[2]) * v]);
      chain.push({ k: key, p: v * 0.999 });
    }
    const rows = [];
    for (let mI = 1; mI < M; mI++) {
      const v = mI / M;
      if (SW.lipRow && v * Ht < SW.lipRow * 1.6) continue;
      if (extra && extra.some((d) => Math.abs(v * Ht - d) < 0.45)) continue;
      rows.push({ key: id + ':' + mI, v });
    }
    if (extra) { extra.forEach((d, ei) => { if (d > SW.lipRow * 1.6 && d < Ht - 0.2) rows.push({ key: id + ':e' + ei, v: d / Ht }); }); rows.sort((p, q) => p.v - q.v); }
    for (const { key, v } of rows) {
      if (!store.has(key)) {
        const y = t[1] + (b[1] - t[1]) * v, amp = dir ? ampScale * SW.amp * (2 * noise.vnoise(along * SW.freq + 31.7, y * SW.freq * 1.3 + 5.1) - 1) * Math.sin(Math.PI * v) : 0;
        store.set(key, [t[0] + (b[0] - t[0]) * v + (dir ? dir[0] * amp : 0), y, t[2] + (b[2] - t[2]) * v + (dir ? dir[1] * amp : 0)]);
      }
      chain.push({ k: key, p: v });
    }
    chain.push({ k: botKey, p: 1 });
    return chain;
  }
  const seamCol = (i, k) => {
    const pts = seamPts[i], a = pts[Math.max(0, k - 1)], b = pts[Math.min(K, k + 1)], tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
    const s = seams[i], taper = smoothstep(0, 1.6, s.arc[k]) * smoothstep(0, 1.6, s.arc[K] - s.arc[k]);
    // bake profile: seamBulge scales the rugged bulge (0 = a flat wall the skirt can sit just outside), seamTopRows adds strata rows
    return column('sc:' + i + ':' + k, sKey(i, k), suKey(i, k), [-tz / tl, tx / tl], s.arc[k] + i * 17.3, RES && RES.seamBulge != null ? taper * RES.seamBulge : taper, null, (RES && RES.seamTopRows) || null);
  };
  // the wall under MAIN's skirt is only ever seen from below in an empty socket: kept straight
  const halfCol = (i, Lv) => column('hc:' + i + ':' + Lv, 'c:' + Lv + ':' + seams[i].j, 'cu:' + Lv + ':' + seams[i].j, null, 0);
  const axisCol = () => column('ax', 'tip', 'axu', null, 0);

  // ---- MAIN piece = buildIsland(MAIN spec) over the parent heightfield, sharing the store ----
  const rimJ = rimStride > 1 ? Array.from({ length: N }, (_, j) => j).filter(onRim) : undefined;
  const mainIsl = buildIsland({ ...G.MAIN, depth: MC.depth }, { heightAt: H, ring: (RES && RES.mainRing) || B.mainRing, rimN: N, rimJ, cone: MC, terrainTs: A.terrainTs, salt: vary,
    jitter: jit, store, keyPrefix: 'M:', rimKey: (j) => 'r:' + ((j % N + N) % N), coneKey: (Lv, j) => 'c:' + Lv + ':' + ((j % N + N) % N), tipKey: 'tip' });

  // ---- petals ----
  const tang = (th) => [-Math.sin(th), 0, Math.cos(th)];
  const perPiece = (v, id, dflt) => (v == null ? dflt : typeof v === 'number' ? v : (v[id] != null ? v[id] : dflt));   // profile value: number or { pieceId: x }
  const stepScale = (id) => perPiece(RES && RES.stepScale, id, 1);
  const pieces = [];
  for (let pi = 0; pi < np; pi++) {
    const d = defs[pi], sL = seams[pi], sR = seams[(pi + 1) % np], iL = pi, iR = (pi + 1) % np;
    const base = sL.th0, end = sR.th0 + (sR.th0 <= sL.th0 ? TAU : 0), step = d.step * stepScale(d.id);
    const underAng = perPiece(RES && RES.underAngStep, d.id, B.underside.angStep), coastRow = perPiece(RES && RES.coastRowStep, d.id, B.coastWall && B.coastWall.rowStep);
    const m = new IMesh(store);
    const jList = []; for (let j = sL.j; ; j = (j + 1) % N) { if (onRim(j)) jList.push(j); if (j === sR.j) break; }
    const pAt = (t, ref) => ref + angDiff(t, ref);
    const topArcs = [], underArcs = [];
    for (let k = 0; k <= K; k++) {
      if (k === 0) {
        topArcs.push(jList.map((j) => ({ k: 'r:' + j, p: base + ((((rimTheta(j) - base) % TAU) + TAU) % TAU) })));
        underArcs.push(jList.map((j) => ({ k: 'ru:' + j, p: base + ((((rimTheta(j) - base) % TAU) + TAU) % TAU) })));
        topArcs[0][topArcs[0].length - 1].p = end; underArcs[0][underArcs[0].length - 1].p = end;
        continue;
      }
      const lq = seamPts[iL][k], rq = seamPts[iR][k];
      const tL = pAt(Math.atan2(lq[1], lq[0]), base), tR = pAt(Math.atan2(rq[1], rq[0]), end);
      const rmid = ringR((tL + tR) / 2, k / K), n = Math.max(1, Math.round(Math.abs(tR - tL) * rmid / step));
      const arc = [{ k: sKey(iL, k), p: tL }];
      for (let mI = 1; mI < n; mI++) {
        const key = 't:' + d.id + ':' + k + ':' + mI, ja = (k < K ? jit : jit * 0.5) * (hash3(pi * 4099 + k, mI, 5 + vary) - 0.5);
        const t = tL + (tR - tL) * (mI + ja) / n;
        if (!store.has(key)) {
          const g = k / K + (k < K ? jit * (hash3(pi * 4099 + k, mI, 6 + vary) - 0.5) / K : 0), r = ringR(t, g), x = Math.cos(t) * r, z = Math.sin(t) * r;
          store.set(key, [x, H(x, z), z]);
          if (k === K) store.set('tu:' + d.id + ':' + mI, [x, U(x, z), z]);
        }
        arc.push({ k: key, p: t });
      }
      arc.push({ k: sKey(iR, k), p: tR });
      topArcs.push(arc);
      if (k === K) { underArcs.push(arc.map((a, ai) => ({ k: ai === 0 ? suKey(iL, K) : ai === arc.length - 1 ? suKey(iR, K) : 'tu:' + d.id + ':' + ai, p: a.p }))); continue; }
      const nu = Math.max(1, Math.round(Math.abs(tR - tL) * rmid / (step * underAng)));
      const uarc = [{ k: suKey(iL, k), p: tL }];
      for (let mI = 1; mI < nu; mI++) {
        const key = 'u:' + d.id + ':' + k + ':' + mI, t = tL + (tR - tL) * mI / nu;
        if (!store.has(key)) { const r = ringR(t, k / K), x = Math.cos(t) * r, z = Math.sin(t) * r; store.set(key, [x, U(x, z), z]); }
        uarc.push({ k: key, p: t });
      }
      uarc.push({ k: suKey(iR, k), p: tR });
      underArcs.push(uarc);
    }
    for (let k = 0; k < K; k++) { zipChains(m, topArcs[k], topArcs[k + 1], TAG.top, [0, 1, 0]); zipChains(m, underArcs[k], underArcs[k + 1], TAG.under, [0, -1, 0]); }
    // outer coast curtain (columns at the coast vertices; the two end columns belong to the seams)
    const coastArc = topArcs[K], cols = [];
    coastArc.forEach((a, ai) => {
      if (ai === 0) { cols.push(seamCol(iL, K)); return; }
      if (ai === coastArc.length - 1) { cols.push(seamCol(iR, K)); return; }
      const q = store.get(a.k), r = Math.hypot(q[0], q[2]), nA = coastArc.length - 1;
      const taper = smoothstep(0, 1.6, Math.min(ai, nA - ai) * step), CW = B.coastWall;
      let facet = null;
      if (CW) {   // v4: blocky vertical facets ~facetW wide (irregular widths), mostly set back under the grass lip
        const s = a.p * r, blk = Math.floor(s / CW.facetW + 0.45 * noise.vnoise(s * 0.37 + 3.1 * pi, 7.7)), hv = hash3(blk, pi + 1, 9001 + vary);
        facet = { offset: -CW.amp * (hv * (1 + CW.outShare) - CW.outShare), jig: CW.jig, rowStep: coastRow, lip: CW.lip, foot: CW.foot };
      }
      cols.push(column('cc:' + d.id + ':' + ai, a.k, 'tu:' + d.id + ':' + ai, [q[0] / r, q[2] / r], a.p * 25.0, taper, facet));
    });
    for (let c = 0; c < cols.length - 1; c++) zipChains(m, cols[c], cols[c + 1], TAG.coast, (x, y, z) => [x, 0, z]);
    // seam curtains (left: outward = -tangential; right: +tangential), then the walls under MAIN's cone
    for (const [si, sg] of [[iL, -1], [iR, 1]]) {
      const dirF = (x, y, z) => { const t = tang(Math.atan2(z, x)); return [t[0] * sg, 0, t[2] * sg]; };
      for (let k = 0; k < K; k++) zipChains(m, seamCol(si, k), seamCol(si, k + 1), TAG.seam, dirF);
      const tt = tang(seams[si].th0), dirH = [tt[0] * sg, 0, tt[2] * sg];
      const hcols = [seamCol(si, 0)]; for (let Lv = 0; Lv < nL; Lv++) hcols.push(halfCol(si, Lv)); hcols.push(axisCol());
      for (let c = 0; c < hcols.length - 1; c++) zipChains(m, hcols[c], hcols[c + 1], TAG.seam, dirH);
    }
    // inner wall = the slice of MAIN's cone this petal docks against (same vertices/diagonals, reversed)
    const inward = (x, y, z) => [-x, 0.35 * Math.hypot(x, z), -z];
    for (let Lv = -1; Lv < nL; Lv++) {
      const from = m.tag.length;
      for (let q = 0; q < jList.length - 1; q++) {
        const j = jList[q], j1 = jList[q + 1];
        const a = Lv < 0 ? 'r:' + j : 'c:' + Lv + ':' + j, b = Lv < 0 ? 'r:' + j1 : 'c:' + Lv + ':' + j1;
        if (Lv + 1 === nL) { m.tri(m.v(a), m.v('tip'), m.v(b), TAG.inner); continue; }
        const c = 'c:' + (Lv + 1) + ':' + j, e = 'c:' + (Lv + 1) + ':' + j1;
        m.tri(m.v(a), m.v(c), m.v(e), TAG.inner); m.tri(m.v(a), m.v(e), m.v(b), TAG.inner);
      }
      m.orient(from, inward);
    }
    // underside under MAIN's skirt (rim plan -> cone plans -> axis), all at U
    const wRings = [underArcs[0]];
    for (let Lv = 0; Lv < nL; Lv++) wRings.push(jList.map((j, q) => ({ k: 'cu:' + Lv + ':' + j, p: underArcs[0][q].p })));
    for (let w = 0; w < wRings.length - 1; w++) zipChains(m, wRings[w], wRings[w + 1], TAG.under, [0, -1, 0]);
    zipChains(m, wRings[wRings.length - 1], [{ k: 'axu', p: (base + end) / 2 }], TAG.under, [0, -1, 0]);
    // OPEN-SEAM SKIRTS (bake profile `skirts`; tag skirt, decorative, outside the closed piece): along each petal-petal seam, on the
    // NEIGHBOUR's side, a cliff in the coast-wall style: from the seam's top edge a grass lip overhangs by `lipOut`, then a blocky
    // face (blocks ~facetW along the seam, `out` +/- amp/2 outside the flat seam wall, rows at `rows` + every `deepStep`) that tucks
    // back onto the wall's bottom edge (the underside) over the lower part; end caps close it against the wall at MAIN's rim and at
    // the coast. Its strata come from the vertex colours (rock paint by height, like the coast). The game shows skirt_<nb> while
    // `nb` is undocked and hides it when `nb` starts rising; MAIN-facing sides have none.
    const skirts = [];
    if (RES && RES.skirts) {
      const SKc = RES.skirts;
      for (const [si, sg, nb] of [[iL, -1, defs[(pi - 1 + np) % np].id], [iR, 1, defs[(pi + 1) % np].id]]) {
        const pts = seamPts[si], sm = seams[si], from = m.tag.length, ks = [];
        for (let k = 0; k <= K; k += SKc.every) ks.push(k);
        if (ks[ks.length - 1] !== K) ks.push(K);
        const scol = (k) => {
          const a = pts[Math.max(0, k - 1)], b = pts[Math.min(K, k + 1)], tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
          const ox = -tz / tl * sg, oz = tx / tl * sg;   // horizontal, toward the neighbour
          const t = store.get(sKey(si, k)), bt = store.get(suKey(si, k)), Ht = t[1] - bt[1];
          // vertical slab FACETS: one outward offset per ~facetW block along the seam (out +/- amp), held down the wall like the
          // coast's blocks, a lip row lipOut proud of its block, and a second, slower bulge per block pair so long runs aren't planar
          const blk = Math.floor(sm.arc[k] / SKc.facetW + 0.45 * noise.vnoise(sm.arc[k] * 0.37 + 5.3 * si, 2.9 + sg)), salt = 9101 + (sg > 0 ? 7 : 0) + vary;
          const faceOff = SKc.out + SKc.amp * (2 * hash3(blk, si + 1, salt) - 1) + 0.5 * SKc.amp * (2 * hash3(blk >> 1, si + 1, salt + 13) - 1);
          const wallZ = SKc.rows[SKc.rows.length - 1], deps = [SKc.lip, ...SKc.rows];
          for (const f of SKc.deep) deps.push(wallZ + (Ht - wallZ) * f);   // deep rows at fixed fractions: the same count in every column
          const chain = [{ k: sKey(si, k), p: 0 }];
          deps.forEach((dep, r) => {
            if (!(dep < Ht - 0.3)) return;
            const v = dep / Ht, key = 'sk:' + d.id + ':' + si + ':' + k + ':' + r;
            if (!store.has(key)) {
              const jig = SKc.jig * (hash3(k * 31 + si, r, 4127 + (sg > 0 ? 3 : 0)) - 0.5);
              // deep rows: their own, coarser blocks (1.6 x facetW), so the lower face breaks up instead of continuing the upper slabs
              const blkD = Math.floor(sm.arc[k] / (1.6 * SKc.facetW) + 0.6 * noise.vnoise(sm.arc[k] * 0.23 - 2.1 * si, 7.3 + r)), deepOff = SKc.out + 1.5 * SKc.amp * (2 * hash3(blkD, r + 3 * si, salt + 29) - 1);
              const off = Math.max(0.06, r === 0 ? faceOff + SKc.lipOut : r > SKc.rows.length ? deepOff + jig : faceOff + jig) * (1 - smoothstep(0.55, 1, v));   // tucks onto the wall's bottom edge
              store.set(key, [t[0] + (bt[0] - t[0]) * v + ox * off, t[1] - dep, t[2] + (bt[2] - t[2]) * v + oz * off]);
            }
            chain.push({ k: key, p: v });
          });
          chain.push({ k: suKey(si, k), p: 1 });
          return chain;
        };
        const outF = (x, y, z) => { const tt = tang(Math.atan2(z, x)); return [tt[0] * sg, 0, tt[2] * sg]; };
        for (let q = 0; q < ks.length - 1; q++) zipChains(m, scol(ks[q]), scol(ks[q + 1]), TAG.skirt, outF);
        zipChains(m, scol(0), seamCol(si, 0), TAG.skirt, (x, y, z) => [-x, 0, -z]);    // cap at MAIN's rim (faces MAIN)
        zipChains(m, scol(K), seamCol(si, K), TAG.skirt, (x, y, z) => [x, 0, z]);      // cap at the coast (faces out)
        skirts.push({ nb, from, to: m.tag.length });
      }
    }
    // the top boundary loop (world xz): MAIN arc -> right seam -> coast (reversed) -> left seam (reversed)
    const loopW = [];
    for (const a of topArcs[0]) { const q = store.get(a.k); loopW.push([q[0], q[2]]); }
    for (let k = 1; k <= K; k++) loopW.push(seamPts[iR][k]);
    for (let ai = coastArc.length - 2; ai >= 1; ai--) { const q = store.get(coastArc[ai].k); loopW.push([q[0], q[2]]); }
    for (let k = K; k >= 1; k--) loopW.push(seamPts[iL][k]);
    pieces.push({ id: d.id, def: d, index: pi, mesh: m, loopW, jList, seamL: iL, seamR: iR, base, end, topArcs, skirts });
  }

  // ---- per-piece Island contract objects (local coords around the pivot) ----
  const FB = L.terrain.colour.faceBands, lin = (tok) => hexToLinear(P[tok]);
  const TT = (A.look && A.look.terrain) || {};   // v4: terrain-only palette tokens (else the shared asset tokens)
  const COL = { grass: lin(TT.grass || 'Grass'), meadow: lin(TT.meadow || 'MeadowLight'), dark: lin(TT.dark || 'GrassDark'), soil: lin('Soil'), stone: lin(TT.stone || 'Stone'), darkStone: lin(TT.darkStone || 'DarkStone') };
  const regionTint = { meadow: 0.24, wetland: -0.08, grove: -0.2, highland: 0.1, islet: -0.04, cottage: 0.06, orchard: 0.08, main: 0.04 };
  const lake = feats.find((f) => f.id === WB.lake.feature);
  function tintAt(x, z) {
    const thd = Math.atan2(z, x) / DEG, r = Math.hypot(x, z); let ws = 0, ts = 0;
    for (let i = 0; i < np; i++) { const w = windowDeg(thd, ranges[i][0], ranges[i][1], RL.blend) + 1e-9; ws += w; ts += w * (regionTint[defs[i].id] || 0); }
    const tm = smoothstep(Rm(Math.atan2(z, x)) - 1, Rm(Math.atan2(z, x)) + 1, r);
    let t = (ts / ws) * tm;
    if (lake) { const dl = Math.hypot((x - lake.at[0]) / (lake.r + 2.2), (z - lake.at[1]) / ((lake.rz || lake.r) + 2.2)); if (dl < 1) t -= 0.16 * (1 - dl); }
    return t;
  }
  function groundColour(x, z, y, slopeV, out) {
    const nz = 0.5 + 0.5 * Math.sin(x * 0.33 + 1.1) * Math.cos(z * 0.29) + 0.25 * Math.sin((x - z) * 0.17);
    const TC = L.terrain.colour, tnt = tintAt(x, z);
    let c0 = COL.grass[0], c1 = COL.grass[1], c2 = COL.grass[2];
    const mix = (c, k) => { c0 += (c[0] - c0) * k; c1 += (c[1] - c1) * k; c2 += (c[2] - c2) * k; };
    mix(COL.meadow, clamp(nz * TC.meadowWeight + y * 0.06 + Math.max(0, tnt), 0, 1));
    mix(COL.dark, clamp(-y * 0.12 + slopeV * TC.slopeToDark + Math.max(0, -tnt), 0, TC.darkMax + Math.max(0, -tnt)));
    out[0] = c0; out[1] = c1; out[2] = c2; return out;
  }
  // rock strata by POSITION (y bands, noise-warped) so neighbouring faces agree; `salt` = a per-face jitter
  // v4 (B.wallColour): a THIN grass lip + soil band (the walls read as stone right under the edge, concept H) and
  // the underside shades from Stone into a cooler, lighter-reading UnderStone with depth (a rock cone, not a brown bowl)
  const WC = B.wallColour || { lip: [0.15, 0.4], soil: [0.4, 0.9], soilMix: 0.85, under: 0.18 };
  const UND = P.UnderStone ? [lin('UnderStone'), lin('UnderStoneDark')] : null;
  function rockColour(fx, fy, fz, hRel, salt, under, out) {
    const bandF = fy / 0.85 + 0.6 * noise.vnoise(fx * 0.3 + 7.7, fz * 0.3 - 2.2), band = Math.floor(bandF), fr = smoothstep(0.75, 1, bandF - band);
    const kb = (hash3(band, 17, 211) * (1 - fr) + hash3(band + 1, 17, 211) * fr);
    let k = 0.25 + 0.5 * kb + (under ? WC.under : 0);
    k = clamp(k + (0.1 + 0.28 * smoothstep(0.8, 3.0, hRel)) * (hash3(salt, 3, 9) - 0.5), 0, 1);   // facets read deeper down
    for (let c = 0; c < 3; c++) out[c] = COL.stone[c] + (COL.darkStone[c] - COL.stone[c]) * k;
    if (under && UND && WC.underFade) { const u = smoothstep(WC.underFade[0], WC.underFade[1], hRel);
      for (let c = 0; c < 3; c++) out[c] += (UND[0][c] + (UND[1][c] - UND[0][c]) * k - out[c]) * u; }
    if (hRel < WC.soil[1]) {   // the grassy lip + soil band at the top of every curtain / cone (makeIsland look)
      const lipK = 1 - smoothstep(WC.lip[0], WC.lip[1], hRel), soilK = 1 - smoothstep(WC.soil[0], WC.soil[1], hRel);
      for (let c = 0; c < 3; c++) { out[c] += (COL.soil[c] - out[c]) * soilK * WC.soilMix; out[c] += (COL.dark[c] - out[c]) * lipK; }
    }
    return out;
  }
  const gradN = (x, z) => { const e = 0.15, hx = (H(x + e, z) - H(x - e, z)) / (2 * e), hz = (H(x, z + e) - H(x, z - e)) / (2 * e), l = Math.hypot(hx, 1, hz); return [-hx / l, 1 / l, -hz / l]; };
  const smoothMax = 0.14;
  // bake profile sharedSeamNormals: the normal at a shared seam / rim vertex = the area-weighted normal of the gentle top faces of
  // EVERY piece around it (filled below, before the pieces are finished), so both sides of a seam shade the same and match their
  // own neighbouring vertices (the default keeps the analytic gradient there)
  const SHN = new Map();
  function finishPiece(src, pivot, kind) {
    const m = src.mesh, Pw = m.p, F = m.f, tg = m.tag, nf = tg.length;
    // smooth top normals: area-weighted gentle neighbours; shared boundary vertices use the analytic gradient
    const vn = new Float64Array(Pw.length), fN = new Float64Array(nf * 4);
    for (let t = 0; t < nf; t++) {
      const n = faceNormalOf(Pw, F[t * 3] * 3, F[t * 3 + 1] * 3, F[t * 3 + 2] * 3); fN.set(n, t * 4);
      if (tg[t] === TAG.top && 1 - n[1] < smoothMax) for (let c = 0; c < 3; c++) { const v = F[t * 3 + c] * 3; vn[v] += n[0] * n[3]; vn[v + 1] += n[1] * n[3]; vn[v + 2] += n[2] * n[3]; }
    }
    // rock band fill: a top face whose 3 vertices all touch rock faces is rock too (a riser one ring wide
    // otherwise alternates rock/grass triangle by triangle); tread faces keep a vertex off the riser -> stay grass
    const fRock = new Float32Array(nf), vRock = new Float32Array(Pw.length / 3);
    for (let t = 0; t < nf; t++) if (tg[t] === TAG.top) { fRock[t] = smoothstep(FB.slopeRock0, FB.slopeRock1, 1 - fN[t * 4 + 1]); for (let c = 0; c < 3; c++) { const v = F[t * 3 + c]; if (fRock[t] > vRock[v]) vRock[v] = fRock[t]; } }
    const pos = new Float32Array(nf * 9), nor = new Float32Array(nf * 9), col = new Float32Array(nf * 9), out = [0, 0, 0], vH = new Map();
    // LOOK-BRIEF phase 2 (paintBlueprint): the per-face rock / soil weights + slope and the per-vertex depth below the top
    // (non-top faces) that the colours below are made from, so a preset can repaint the piece without rebuilding it
    const pRk = new Float32Array(nf), pSw = new Float32Array(nf), pSl = new Float32Array(nf), pHr = new Float32Array(Pw.length / 3).fill(NaN);
    for (let t = 0; t < nf; t++) {
      const nx = fN[t * 4], ny = fN[t * 4 + 1], nz = fN[t * 4 + 2], slope = 1 - ny;
      const a = F[t * 3] * 3, b = F[t * 3 + 1] * 3, c = F[t * 3 + 2] * 3;
      const cx = (Pw[a] + Pw[b] + Pw[c]) / 3, cy = (Pw[a + 1] + Pw[b + 1] + Pw[c + 1]) / 3, cz = (Pw[a + 2] + Pw[b + 2] + Pw[c + 2]) / 3;
      const isTop = tg[t] === TAG.top;
      const rk = isTop ? Math.max(fRock[t], slope > FB.slopeSoil0 ? Math.min(vRock[F[t * 3]], vRock[F[t * 3 + 1]], vRock[F[t * 3 + 2]]) : 0) : 1;
      const sw = isTop ? (1 - rk) * smoothstep(FB.slopeSoil0, FB.slopeSoil1, slope) * FB.soilSlopeW : 0;
      pRk[t] = rk; pSw[t] = sw; pSl[t] = slope;
      let rc = null;
      if (rk > 0 && isTop) { rc = [0, 0, 0]; const rs = clamp(slope * FB.rockDarkBySlope, 0, 1); for (let q = 0; q < 3; q++) rc[q] = COL.stone[q] + (COL.darkStone[q] - COL.stone[q]) * rs; }
      for (let q = 0; q < 3; q++) {
        const vi = F[t * 3 + q], v = vi * 3, o = t * 9 + q * 3, x = Pw[v], y = Pw[v + 1], z = Pw[v + 2];
        pos[o] = x - pivot[0]; pos[o + 1] = y - pivot[1]; pos[o + 2] = z - pivot[2];
        let n0 = nx, n1 = ny, n2 = nz;
        if (isTop && slope < smoothMax) {
          const key = m.keys[vi];
          if (SHN.has(key)) { const g = SHN.get(key), l = Math.hypot(g[0], g[1], g[2]); n0 = g[0] / l; n1 = g[1] / l; n2 = g[2] / l; }
          else if (key.charCodeAt(0) === 114 /* r */ || key.charCodeAt(0) === 115 /* s */) { const g = gradN(x, z); if (1 - g[1] < smoothMax * 1.4) { n0 = g[0]; n1 = g[1]; n2 = g[2]; } }
          else { const l = Math.hypot(vn[v], vn[v + 1], vn[v + 2]); if (l > 0) { n0 = vn[v] / l; n1 = vn[v + 1] / l; n2 = vn[v + 2] / l; } }
        }
        nor[o] = n0; nor[o + 1] = n1; nor[o + 2] = n2;
        if (isTop) {
          groundColour(x, z, y, slope, out);
          for (let k2 = 0; k2 < 3; k2++) out[k2] = out[k2] * (1 - rk - sw) + COL.soil[k2] * sw + (rc ? rc[k2] * rk : 0);
        } else {
          let hv = vH.get(vi); if (hv === undefined) { hv = H(x, z); vH.set(vi, hv); }
          // (bake underScale: the paint ramps by the depth the vertex would have at scale 1, so a shallower underside keeps the
          //  same colour ramp into the haze instead of stopping in its dark upper band)
          let hr = Math.max(0, hv - y); if (USC !== 1 && hr > UWH) hr = UWH + (hr - UWH) / USC;
          pHr[vi] = hr;
          rockColour(x, y, z, hr, t, tg[t] === TAG.under, out);
        }
        col[o] = out[0]; col[o + 1] = out[1]; col[o + 2] = out[2];
      }
    }
    // the sampler uses EXACTLY the rendered (float32, pivot-local) vertices -> triangle-exact vs the GPU mesh
    const Pl = new Float64Array(Pw.length); for (let i = 0; i < Pw.length; i += 3) { Pl[i] = Math.fround(Pw[i] - pivot[0]); Pl[i + 1] = Math.fround(Pw[i + 1] - pivot[1]); Pl[i + 2] = Math.fround(Pw[i + 2] - pivot[2]); }
    const sample = topSampler(Pl, F, tg);
    return { positions: pos, normals: nor, colors: col, tags: Uint8Array.from(tg), faceCount: nf, sample, localP: Pl, faces: Uint32Array.from(F), keys: m.keys,
      paint: { rk: pRk, sw: pSw, slope: pSl, hRel: pHr } };
  }
  function makeContract(src, id, kind, pivot, loopW, outlineFn, seedRand) {
    const fin = finishPiece(src, pivot, kind);
    const loopL = loopW.map(([x, z]) => [x - pivot[0], z - pivot[2]]);
    const LO = loopOutline(loopL);
    const outline = outlineFn || LO.outline;
    const heightStrict = (x, z) => { const y = fin.sample(x, z); if (y == null) throw new Error(`${id}.height: (${x},${z}) is outside the top`); return y; };
    const height = (x, z) => {
      let y = fin.sample(x, z); if (y != null) return y;
      const th = Math.atan2(z, x), r = outline(th) * (1 - 1e-6); y = fin.sample(Math.cos(th) * r, Math.sin(th) * r);
      if (y != null) return y;
      let best = null, bd = 1e18; for (const [lx, lz] of loopL) { const dd = (lx - x) ** 2 + (lz - z) ** 2; if (dd < bd) { bd = dd; best = [lx, lz]; } }
      const y2 = fin.sample(best[0] * 0.999, best[1] * 0.999); return y2 != null ? y2 : 0;
    };
    let minY = 1e9; for (let i = 1; i < fin.positions.length; i += 3) minY = Math.min(minY, fin.positions[i]);
    return { id, kind, pivot, ...fin, height, heightStrict, outline, random: seedRand, loopLocal: LO.loop, loopWorld: loopW, starShaped: LO.monotone,
      depth: -minY / 5.5, bottom: minY };
  }
  // BAKE PROFILE refineFlat { tol, minEdge }: on a coarse build a top triangle can straddle a flat zone's edge where the ground
  // beyond it drops (a pad next to a riser) and tilt the pad. Conforming longest-edge bisection (Rivara) of the TOP faces: an edge
  // that is off the heightfield by > tol at a point INSIDE a zone's flat radius (r + margin) is bisected at H(midpoint), until its
  // halves would be shorter than minEdge. (refineShape { tol, minEdge }: the same for any top edge off H by > tol; not used by the
  // bake profile, as rock faces on risers cost more bytes than they buy.) Every top-boundary edge (MAIN's rim, seams, coast) is
  // locked, so the shared vertices, the walls and the neighbours are untouched and every piece stays closed. Absent = nothing runs.
  function refineFlatEdges(m, label, R) {
    const F = m.f, P = m.p, tol = R.tol, minE = R.minEdge;
    const ek = (a, b) => (a < b ? a + '_' + b : b + '_' + a), E = new Map();   // edge -> top faces using it
    const addF = (t) => { for (let k = 0; k < 3; k++) { const key = ek(F[t * 3 + k], F[t * 3 + (k + 1) % 3]); let l = E.get(key); if (!l) E.set(key, (l = [])); l.push(t); } };
    const delF = (t) => { for (let k = 0; k < 3; k++) { const key = ek(F[t * 3 + k], F[t * 3 + (k + 1) % 3]), l = E.get(key), q = l.indexOf(t); if (q >= 0) l.splice(q, 1); } };
    for (let t = 0; t < m.tag.length; t++) if (m.tag[t] === TAG.top) addF(t);
    const locked = new Set(); for (const [key, l] of E) if (l.length === 1) locked.add(key);
    const len = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 2] - P[b * 3 + 2]);
    const inFlat = (x, z) => { for (const zn of zones) { if (x < zn.bb[0] || z < zn.bb[1] || x > zn.bb[2] || z > zn.bb[3]) continue; if (zoneDist(zn, x, z) <= zn.margin) return true; } return false; };
    const ok = new Set(); let added = 0;
    const UF = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875], S = R.shape || null;   // refineShape: any top edge off H by > S.tol, down to S.minEdge
    const needs = (a, b) => {   // flat: the edge sags (or rises) by > tol at a point INSIDE a flat radius (the pad is tilted there)
      const key = ek(a, b); if (locked.has(key) || ok.has(key)) return false;
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2], bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2], L0 = len(a, b);
      if (tol > 0 && L0 >= 2 * minE) for (const u of UF) { const x = ax + (bx - ax) * u, z = az + (bz - az) * u; if (inFlat(x, z) && Math.abs(H(x, z) - (ay + (by - ay) * u)) > tol) return true; }
      if (S && L0 >= 2 * S.minEdge) for (const u of [0.25, 0.5, 0.75]) if (Math.abs(H(ax + (bx - ax) * u, az + (bz - az) * u) - (ay + (by - ay) * u)) > S.tol) return true;
      ok.add(key); return false;
    };
    const longest = (t) => { let best = -1, bl = -1; for (let k = 0; k < 3; k++) { const a = F[t * 3 + k], b = F[t * 3 + (k + 1) % 3], l = len(a, b); if (l > bl + 1e-12) { bl = l; best = k; } } return [F[t * 3 + best], F[t * 3 + (best + 1) % 3], bl]; };
    function bisect(a, b) {
      const mx = (P[a * 3] + P[b * 3]) / 2, mz = (P[a * 3 + 2] + P[b * 3 + 2]) / 2, key = 'x:' + label + ':' + added++;
      store.set(key, [mx, H(mx, mz), mz]); const mv = m.v(key);
      for (const t of (E.get(ek(a, b)) || []).slice()) {
        let k = 0; while (!((F[t * 3 + k] === a && F[t * 3 + (k + 1) % 3] === b) || (F[t * 3 + k] === b && F[t * 3 + (k + 1) % 3] === a))) k++;
        const p0 = F[t * 3 + k], p1 = F[t * 3 + (k + 1) % 3], p2 = F[t * 3 + (k + 2) % 3];
        delF(t); F[t * 3] = p0; F[t * 3 + 1] = mv; F[t * 3 + 2] = p2; addF(t);
        F.push(mv, p1, p2); m.tag.push(TAG.top); addF(m.tag.length - 1);
      }
      E.delete(ek(a, b));
    }
    function refine(a, b, depth) {   // Rivara: bisect each adjacent face's longer edge first, so the triangles keep their shape
      for (let guard = 0; guard < 64; guard++) {
        const l = len(a, b); let again = false;
        for (const t of (E.get(ek(a, b)) || []).slice()) { const [c, d, ll] = longest(t);
          if (ll > l + 1e-9 && !locked.has(ek(c, d)) && depth < 24) { refine(c, d, depth + 1); again = true; break; } }
        if (!again) break;
      }
      if (E.has(ek(a, b))) bisect(a, b);
    }
    for (let pass = 0, changed = true; changed && pass < 40; pass++) {
      changed = false; const n = m.tag.length;
      for (let t = 0; t < n; t++) { if (m.tag[t] !== TAG.top) continue;
        for (let k = 0; k < 3; k++) { const a = F[t * 3 + k], b = F[t * 3 + (k + 1) % 3]; if (needs(a, b)) { refine(a, b, 0); changed = true; break; } } }
    }
    return added;
  }
  const REFINED = {};   // vertices added per piece by the refinement
  if (RES && (RES.refineFlat || RES.refineShape)) {
    const RF = { tol: RES.refineFlat ? RES.refineFlat.tol : 0, minEdge: RES.refineFlat ? RES.refineFlat.minEdge : 1e9, shape: RES.refineShape || null };
    REFINED.main = refineFlatEdges(mainIsl.mesh, 'main', RF); for (const pc of pieces) REFINED[pc.id] = refineFlatEdges(pc.mesh, pc.id, RF);
  }
  if (RES && RES.sharedSeamNormals) {   // (see SHN above) every piece's gentle top faces around the shared rim / seam vertices
    for (const m of [mainIsl.mesh, ...pieces.map((p) => p.mesh)]) {
      const Pw = m.p, F = m.f;
      for (let t = 0; t < m.tag.length; t++) {
        if (m.tag[t] !== TAG.top) continue; const n = faceNormalOf(Pw, F[t * 3] * 3, F[t * 3 + 1] * 3, F[t * 3 + 2] * 3); if (!(1 - n[1] < smoothMax)) continue;
        for (let c = 0; c < 3; c++) { const key = m.keys[F[t * 3 + c]], ch = key.charCodeAt(0); if (ch !== 114 && ch !== 115) continue;
          let g = SHN.get(key); if (!g) SHN.set(key, (g = [0, 0, 0])); g[0] += n[0] * n[3]; g[1] += n[1] * n[3]; g[2] += n[2] * n[3]; }
      }
    }
  }
  const result = { config: A, seed, vary, H, Hpre, H0, U: (x, z) => U(x, z, coneCeil(x, z)), Uat, Ukey, phiAt, Rc, Rm, dcAt, maxRc, zones, mainZoneCount, seams, seamPts, ranges, defs, store, K, N,
    streamPts, streamEndLevel, streamEndWidth, streamEndBank, river, outflow, channels, lakeLevel, feats, stairs, pieces: {}, order: ['main'], noise, buildMs: 0, res: RES, refined: REFINED };
  result.pieces.main = makeContract(mainIsl, 'main', 'main', [0, 0, 0], (() => { const l = []; for (let j = 0; j < N; j++) { const q = store.get('r:' + j); l.push([q[0], q[2]]); } return l; })(), Rm, MO.random);
  result.pieces.main.mainTheta = [0, 360];
  for (const pc of pieces) {
    const px = pc.def.pivot[0], pz = pc.def.pivot[1], pivot = [px, Hpre(px, pz), pz];
    const isl = (G.ISLES[pc.id] && G.ISLES[pc.id].seed) || (100 + pc.index);
    const c = makeContract(pc, pc.id, 'petal', pivot, pc.loopW, null, gameRng(isl + vary));
    c.mainTheta = [360 * seams[pc.seamL].j / N, 360 * seams[pc.seamR].j / N];
    c.seamL = pc.seamL; c.seamR = pc.seamR; c.jList = pc.jList; c.def = pc.def;
    if (pc.skirts.length) c.skirts = pc.skirts;   // [{ nb, from, to }] face ranges of the open-seam skirts (bake profile)
    result.pieces[pc.id] = c; result.order.push(pc.id);
  }
  result.buildMs = Date.now() - T0;
  return result;
}

// own-spec island -> finished contract (local arrays + height/outline/random), e.g. backdrop isles
export function ownIslandContract(spec, L, opts = {}) {
  const isl = buildIsland(spec, opts), m = isl.mesh, Pw = m.p, F = m.f, tg = m.tag, nf = tg.length, P = L.palette;
  const lin = (t) => hexToLinear(P[t]), grass = lin('Grass'), meadow = lin('MeadowLight'), dark = lin('GrassDark'), soil = lin('Soil'), stone = lin('Stone'), dstone = lin('DarkStone');
  const pos = new Float32Array(nf * 9), nor = new Float32Array(nf * 9), col = new Float32Array(nf * 9);
  for (let t = 0; t < nf; t++) {
    const n = faceNormalOf(Pw, F[t * 3] * 3, F[t * 3 + 1] * 3, F[t * 3 + 2] * 3), top = tg[t] === TAG.top;
    let cy = 0; for (let q = 0; q < 3; q++) cy += Pw[F[t * 3 + q] * 3 + 1] / 3;
    const k = hash3(t, spec.seed, 3), c = top ? grass.map((v, i) => v + (meadow[i] - v) * 0.35 * k + (dark[i] - v) * 0.15 * (1 - k))
      : cy > -0.4 * spec.depth ? soil.map((v, i) => v + (dark[i] - v) * 0.4) : stone.map((v, i) => v + (dstone[i] - v) * (0.3 + 0.5 * k));
    for (let q = 0; q < 3; q++) { const v = F[t * 3 + q] * 3, o = t * 9 + q * 3; pos[o] = Pw[v]; pos[o + 1] = Pw[v + 1]; pos[o + 2] = Pw[v + 2]; nor[o] = n[0]; nor[o + 1] = n[1]; nor[o + 2] = n[2]; col[o] = c[0]; col[o + 1] = c[1]; col[o + 2] = c[2]; }
  }
  const Pl = Float64Array.from(Pw), sample = topSampler(Pl, F, tg);
  return { id: 'isle' + spec.seed, kind: 'own', pivot: [0, 0, 0], positions: pos, normals: nor, colors: col, tags: Uint8Array.from(tg), faceCount: nf,
    height: (x, z) => { const y = sample(x, z); return y == null ? 0 : y; }, outline: isl.outline, random: isl.random, depth: spec.depth };
}

// tier lattice over the parent (|dTier| <= 1 between 4-neighbours) + the lowering solver as a guard
export function blueprintTiers(bp) {
  const B = bp.config.blueprint, cs = B.latticeCell, R = Math.ceil(bp.maxRc + 2);
  const n = Math.ceil(2 * R / cs) + 1, cells = [], idx = new Map();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -R + i * cs, z = -R + j * cs; if (bp.dcAt(x, z) < cs * 0.5) continue;
    const c = { i, j, x, z, tier: Math.round(bp.phiAt(x, z)), pinned: false };
    for (const zn of bp.zones) if (zn.type === 'disc' && Math.hypot(x - zn.x, z - zn.z) < zn.r) { c.pinned = true; break; }
    cells.push(c); idx.set(i + '_' + j, c);
  }
  const raw = cells.map((c) => c.tier);
  const nb = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => idx.get((c.i + a) + '_' + (c.j + b))).filter(Boolean);
  let changed = true, guard = 0;
  while (changed && guard++ < 4 * n) { changed = false; for (const c of cells) { if (c.pinned) continue; let mn = Infinity; for (const q of nb(c)) mn = Math.min(mn, q.tier); if (c.tier > mn + 1) { c.tier = mn + 1; changed = true; } } }
  let maxD = 0; for (const c of cells) for (const q of nb(c)) maxD = Math.max(maxD, Math.abs(c.tier - q.tier));
  let solverChanges = 0; cells.forEach((c, k) => { if (c.tier !== raw[k]) solverChanges++; });
  const pos = new Map(); cells.forEach((c, k) => pos.set(c, k));
  let rawMax = 0; const violations = [];
  cells.forEach((c, k) => { for (const q of nb(c)) { const dd = Math.abs(raw[k] - raw[pos.get(q)]); rawMax = Math.max(rawMax, dd); if (dd > 1 && violations.length < 12) violations.push([+c.x.toFixed(1), +c.z.toFixed(1), raw[k], raw[pos.get(q)]]); } });
  return { cells: cells.length, maxDelta: maxD, rawMaxDelta: rawMax, solverChanges, cell: cs, tiers: [Math.min(...raw), Math.max(...raw)], violations };
}

// ---- point-in-polygon (world xz loop) ----
export function inLoop(loop, x, z) {
  let c = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, zi] = loop[i], [xj, zj] = loop[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function pieceAt(bp, x, z) {
  if (Math.hypot(x, z) <= bp.Rm(Math.atan2(z, x))) return 'main';
  for (const id of bp.order) if (id !== 'main' && inLoop(bp.pieces[id].loopWorld, x, z)) return id;
  return null;
}

// ---- water features (the game draws water; we export the carved geometry + levels) ----
export function blueprintWater(bp) {
  const A = bp.config, B = A.blueprint, WB = B.water, G = A.game, WT = A.waterTs.stream;
  // shoreline = where the carved ground rises through the water level, capped at the basin's own ellipse
  // (so the outline doesn't run off along the inflow/outflow channels, which the river ribbons carry)
  // (v4: marched INWARD from the cap, so the outline is the OUTER shore and an islet inside the basin is land
  //  standing above the water plane, not a notch cut into the outline)
  const contour = (cx, cz, level, rmax, n = 72, F = null) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / n * TAU, dx = Math.cos(t), dz = Math.sin(t); let cap = rmax;
      if (F) { const tp = t - (F.rot || 0) * DEG, rx = F.r, rz = F.rz || F.r; cap = Math.min(rmax, 1 / Math.sqrt((Math.cos(tp) / rx) ** 2 + (Math.sin(tp) / rz) ** 2) + 0.15); }
      let r = cap; while (r > 0.05 && bp.H(cx + dx * r, cz + dz * r) >= level) r -= 0.04;
      pts.push([+(cx + dx * r).toFixed(4), +(cz + dz * r).toFixed(4)]);
    }
    return pts;
  };
  const lakeF = bp.feats.find((f) => f.id === WB.lake.feature), tarnF = bp.feats.find((f) => f.id === WB.tarn.feature), hsF = bp.feats.find((f) => f.id === WB.hotSpring.feature);
  const ground = (f) => bp.Hpre(f.at[0] + (f.r + 0.9), f.at[1]);
  const tarnLevel = ground(tarnF) - WB.tarn.below, hsLevel = ground(hsF) - WB.hotSpring.below;
  const ribbon = (ch) => ch.pts.map((p, i) => ({ x: +p[0].toFixed(4), z: +p[1].toFixed(4), level: +ch.level(ch.s[i]).toFixed(4), width: +ch.width(ch.s[i]).toFixed(4) }));
  const of = bp.outflow, oe = of.pts[of.pts.length - 1], ob = of.pts[of.pts.length - 2], ol = of.level(of.S);
  const odx = oe[0] - ob[0], odz = oe[1] - ob[1], odl = Math.hypot(odx, odz) || 1, ox = odx / odl, oz = odz / odl;
  // waterfall: from the coast lip straight down past the skirt into the cloud sea
  const ct = Math.atan2(oe[1], oe[0]), cr = bp.Rc(ct), cx = Math.cos(ct) * cr, cz = Math.sin(ct) * cr;
  const FALL_PROFILE = [[0, 0], [0.3, -1.2], [0.55, -3.5], [0.7, -7.0], [0.75, -10.5]];   // (outward offset, drop) from the lip (u)
  const fall = FALL_PROFILE.map(([o, dy]) => [+(cx + ox * o).toFixed(4), +(ol + dy).toFixed(4), +(cz + oz * o).toFixed(4)]);
  const pondLevel = bp.Hpre(G.POND.x, G.POND.z) + A.waterTs.pondWaterLift;
  const sp = bp.streamPts, streamPoints = sp.map((p, i) => ({ x: +p[0].toFixed(4), z: +p[1].toFixed(4),
    level: +(i === 3 ? bp.streamEndLevel : bp.Hpre(p[0], p[1]) + WT.waterLift).toFixed(4), width: +(WT.width[0] + WT.width[1] * (i / 3)).toFixed(4) }));
  // (water revamp v5) the farm pond's outline: Water.tsx blob(POND.r, 3), the same 22 points and mulberry32 draws, laid flat
  // by the mesh's rotation-x -PI/2 (the shape's y -> world -z); and MAIN's waterfall: the wetland fall's profile from the rim exit
  const pr = gameRng(3), pondOutline = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU, rad = G.POND.r * (1 + Math.sin(a * 3 + 1.2) * 0.06 + (pr() - 0.5) * 0.05);
    pondOutline.push([+(G.POND.x + Math.cos(a) * rad).toFixed(4), +(G.POND.z - Math.sin(a) * rad).toFixed(4)]);
  }
  const mox = Math.cos(G.STREAM_THETA), moz = Math.sin(G.STREAM_THETA);
  const mainFall = FALL_PROFILE.map(([o, dy]) => [+(sp[3][0] + mox * o).toFixed(4), +(bp.streamEndLevel + dy).toFixed(4), +(sp[3][1] + moz * o).toFixed(4)]);
  // (water rev 1, spec Revision 1) the farm pond + stream are ART-OWNED (world.config farmWater): the teardrop outline and the stream
  // through its 3 points + the pinned rim exit, steered toward the wetland river; the game's blob / Water.tsx stream = main.*.legacy
  const FW = A.farmWater, rv = bp.river, r4 = (v) => +(+v).toFixed(4), rim = { x: r4(sp[3][0]), z: r4(sp[3][1]), level: r4(bp.streamEndLevel), width: r4(bp.streamEndWidth) };
  const legacyPond = { at: [G.POND.x, G.POND.z], r: G.POND.r, outline: pondOutline, source: 'Water.tsx Pond (game-drawn today); outline = blob(POND.r, 3)' };
  const legacyStream = { points: streamPoints, source: 'Water.tsx streamPath() (game-drawn today)' };
  let pond, stream;
  if (FW) {
    const ctrl = farmStreamCtrl(FW, rim, { x: rv.pts[0][0], z: rv.pts[0][1], level: rv.level(rv.s[0]) }, { x: rv.pts[1][0], z: rv.pts[1][1], level: rv.level(rv.s[1]) });
    const line = farmStreamLine(ctrl, 0.1).map((p) => ({ x: r4(p.x), z: r4(p.z), level: r4(p.level), width: r4(p.width) })), po = FW.pond.outline;
    pond = { at: [G.POND.x, G.POND.z], level: r4(pondLevel), outline: po.map((p) => p.slice()), cap: [po[0].slice(), po[po.length - 1].slice()], flowSpring: FW.pond.flowSpring.slice(),
      source: 'art-owned (world.config archipelago.farmWater; spec Revision 1): shape A, the Teardrop; closes on the cap line (first / last point = the cap corners) where the stream takes over', legacy: legacyPond };
    stream = { points: ctrl.slice(0, 4).map((p) => ({ x: r4(p.x), z: r4(p.z), level: r4(p.level), width: r4(p.width) })), steer: { x: r4(ctrl[4].x), z: r4(ctrl[4].z), level: r4(ctrl[4].level) }, line,
      rimExit: { x: rim.x, z: rim.z, theta: G.STREAM_THETA, level: rim.level, width: bp.streamEndWidth, bank: bp.streamEndBank },
      note: 'art-owned: centripetal Catmull-Rom through points + steer (THREE.CatmullRomCurve3), drawn from points[0] to the rim exit only; width per point, linear in the curve parameter; line = that curve every ~0.1 u. While the wetland is not docked it drops off MAIN as a waterfall at theta 2.42',
      legacy: legacyStream };
  } else {
    pond = { ...legacyPond, level: r4(pondLevel) };
    stream = { points: streamPoints, rimExit: { x: rim.x, z: rim.z, theta: G.STREAM_THETA, level: rim.level, width: bp.streamEndWidth, bank: bp.streamEndBank }, note: 'Water.tsx streamPath(); while the wetland is not docked the game drops it off MAIN as a waterfall at theta 2.42' };
  }
  return {
    main: { pond, stream,
      waterfall: { points: mainFall, note: 'while the wetland is undocked: the wetland fall profile from the stream rim exit, outward at STREAM_THETA, down to y ~ -10.5' } },
    wetland: {
      lake: { outline: contour(lakeF.at[0], lakeF.at[1], bp.lakeLevel, Math.max(lakeF.r, lakeF.rz || 0) + 2, 72, lakeF), level: bp.lakeLevel,
        boardwalkLoop: WB.lake.boardwalkLoop, sunkenBell: WB.lake.sunkenBell },
      river: { points: ribbon(bp.river), startsAt: 'MAIN stream rim exit (rimPoint(MAIN, 2.42, -0.05))', bank: WB.river.bank },
      outflow: { points: ribbon(of) },
      waterfall: { points: fall, note: 'top = wetland outer rim lip; then down the cliff skirt into the cloud sea' },
    },
    highland: {
      tarn: { outline: contour(tarnF.at[0], tarnF.at[1], tarnLevel, tarnF.r + 1.5, 72, tarnF), level: +tarnLevel.toFixed(4) },
      hotSpring: { outline: contour(hsF.at[0], hsF.at[1], hsLevel, hsF.r + 0.8, 36, hsF), level: +hsLevel.toFixed(4) },
    },
  };
}

// ---- composition: everything placed per piece (world xz; the viewer converts to piece-local) ----
// ---- ground cover (the living-ground spec): densities are items per u^2 where a patch is full; pads = the clearance (blocked) ----
export const COVER = {
  cell: 0.2,
  wild: { short: 1.4, tall: 6.5, seed: 3.2, drift: 9, clover: 4.5, perennial: 0.22 },   // perennial: inside drifts and along tall-patch edges
  wetTall: 0.85,   // tall grass along water (within 0.9 u) on the wild isles, as a share of a full tall patch
  perennials: { byRock: 0.7, perArea: 0.03, mix: [0.4, 0.3] },   // lavender / foxglove / (the rest) ox-eye
  kinds: [0.4, 0.5, 0.6],   // the drift flower by the slow field (it centres on 0.5): daisy | buttercup | poppy | cornflower
  fern: 1.2,
  pad: { default: 0.1, grass_short: 0.06, clover_patch: 0.12, grass_tall: 0.14, grass_seedhead: 0.14, perennial: 0.18, fern_clump: 0.16 },
  scale: { default: [0.8, 1.2], grass_short: [0.8, 1.25], clover_patch: [0.8, 1.3], grass_seedhead: [0.85, 1.15], perennial_lavender: [0.85, 1.2], perennial_foxglove: [0.85, 1.15], perennial_oxeye: [0.85, 1.2], fern_clump: [0.8, 1.25], pebbles: [1.7, 2.3] },   // (pebbles: 1.0-1.5 -> 1.7-2.3, ruling GR26: the game found them tiny; the standing height stays under cluster.pebble.cap)
  // the farm slots the game moved aside for the ribbons (layout.ts aside(); composition.mjs SLOT_MOVES), where they stand NOW, with the
  // game's keep-clear radius (x, z, r): the zones still hold the frozen spots, so the farm's cover keeps clear of both (the game
  // leaves out anything it finds on a slot)
  moved: [[5.77, -2.3, 0.55], [0.95, 6.95, 0.55], [-5.0, 1.22, 0.6], [-1.33, -5.6, 0.6], [0.45, 4.6, 0.3], [0.2, 5.77, 0.6], [1.3, -6.8, 0.45],
    [-2.08, -6.63, 0.57], [-0.88, -4.55, 0.49], [3.47, -6.43, 0.53], [6.85, -3.7, 0.49], [-7.45, 1.35, 0.4], [1.72, 7.52, 0.4]],
  // the farm kit's heights at scale 1 (u: the highest vertex of each built GLB, lib/ground-measure.mjs kitHeights; cover V13 measures
  // them from the GLBs): MAIN's cluster scatter keeps height x scale under GROUND.cluster.height
  height: { grass_short: 0.15, clover_patch: 0.09, flower_daisy: 0.22, pebbles: 0.018 },
};
// ---- the lawn under the cover (the living-ground spec): on top of the preset's three greens (a 15 u blend), a ~5 u variation,
//      yellow-green and deep-green patches (~6-7 u), the ground under the cover's patches matched to their plants (clover darker,
//      tall grass warmer) and worn, paler grass along the farm's paths. Albedo: identical in every mood, like the three greens ----
export const LAWN = {
  meso: 0.5, mesoSize: 5.2,                                         // the ~5 u variation, added to the preset's blend position
  yellow: '#A9C377', yellowMix: 0.5, yellowSize: 7,               // yellow-green patches
  deep: '#56844F', deepMix: 0.42, deepSize: 6.5,                     // deep-green patches
  clover: '#4E7C4A', cloverMix: 0.18, farmCloverMix: 0.4, tall: '#A2B06A', tallMix: 0.15,   // under the cover's clover (wild / farm) / tall-grass patches
  worn: '#A6BB86', wornMix: 0.38, wornReach: 0.75,                   // the farm's paths: paler, worn grass within this of their edge
  // (GR24-lite: 0.34 -> 0.38. GR24's stronger dry edge (dryMix 0.55) paled the grass there first, so the worn band lifted it less
  // (lawn L3 x 1.019 < 1.02); GR24-lite keeps dryMix 0.35, where 0.34 gives x 1.022 and 0.38 x 1.025: a margin, 0.9-1.4 u out untouched)
  cliffAO: 1.3,   // x the preset's cliff-foot shade: the 5-7 u patches raise the local contrast, so the band at a riser's foot needs more to read
  // ---- the zone paint on MAIN (the ground-vegetation spec §6, plan Task 6; groundZones' field at each grass vertex; the wild pieces
  //      keep the paint above until their field lands, plan Task 12). Ruling GR24-lite (2026-10-25, owner review, auto-decided):
  //      GR20 had B and C at the top of the spec's draft windows, a tint rather than zones at CAM-DESK. The shade pools (C) and the calm
  //      A lawn go beyond the windows, so the zones read at the default camera; B and E stay near them, because their hue edges cost
  //      phase2 G1b's low-frequency rule (GR24's bYellow 0.6 / dryMix 0.55 read r(2 u) 0.729 < 0.75) and A's nudge costs lawn L1's open-lawn
  //      variety. All inside the lawn band (lawn.test LB) ----
  aMeso: 0.3, aNudge: 0.15,          // A, quieter: the meso term x aMeso, then aNudge towards the preset's lawn mid / warm (their mean)
  aEdge: 1.0,                        // A's weight: smoothstep(-aEdge, 0, aHalo), out of a clear footprint x (1 - smoothstep(0, aEdge, -dClear))
  //                                    (GR24-lite: 0.6 -> 1.0, a wider calm ring whose softer edge also helps G1b)
  bYellow: 0.45, bEdge: [0.2, 0.8],  // B, warmer: `yellow` at bYellow x smoothstep(bEdge, W) x (1 - A's weight) (GR24-lite; draft window 0.25-0.35)
  cDeep: 0.7, cSoft: 0.5,            // C, shade pools: `deep` at cDeep x U (GR24-lite; draft window 0.35-0.45), U blurred by a cSoft u gaussian (soft
  //                                    edges; 0.3 -> 0.5 with the deeper pools, so their edge stays clear of phase2 G1c's edge-luma rule)
  mainLushReach: 2.0,                // D, narrower: the preset's lush mix x (1 - smoothstep(0.35, this, d)) from the teardrop and stream
  dry: '#AAB888', dryMix: 0.35, dryReach: 0.3,   // E, dry edge: `dry` at dryMix x (1 - smoothstep(0, dryReach, dPath)), under the worn band
};
// ---- the ground zones (the ground-vegetation spec art/specs/2026-10-25-ground-vegetation-design.md §3; groundZones below): the
//      defaults, which archipelago.composition.ground overrides key by key, one level deep (groundConfig) ----
export const GROUND = {
  // the first match wins: E dPath < E; D wet <= dWater < D; A aHalo > 0; C U > C; B W > B; else lawn. Null (nothing grows): off the
  // piece, dWater < wet (in the water or its wet band: the water spec's L8), on a path (dPath < 0), inside a clear spot's footprint
  zone: { E: 0.7, wet: 0.35, D: 1.25, C: 0.35, B: 0.5 },
  // A round each kind of spot, u past its footprint (a tidy spot, the animal yards, is A inside, with no halo)
  halo: { house: 0.8, fence: 0.6, building: 0.4, slot: 0.3, wildZone: 0.4, jetty: 0.3 },
  // the wild edge: on MAIN max(1 - smoothstep(rim, dRim), smoothstep(corner, min(dSpot, dPath))); on the wild pieces
  // wild[0] + wild[1] x (1 - smoothstep(rim, bp.dcAt))
  W: { rim: [1.0, 2.6], corner: [2.0, 3.5], wild: [0.6, 0.4] },
  // the shade pools, one per tree that is always there: R = crown radius x the tree's drawn scale (scale x vscale, as the proof and the
  // export draw it -- Task 1's choice, the brief says "scale"; accepted pending review), measured from the tree_round_a / tree_pine_a
  // crowns, or the hero tree's (hero_tree.glb, at its spot). Pool radius
  // rp = R x lerp(size, n), n from a `noise` u fbm (0-1); its centre `shift` R along `away`, away from the "Golden afternoon" sun
  // (bearing views.full.az 32 + sun.azimuthDeg -115 = -83 deg, arch-scene.js:1339: the sun stands at (sin b, cos b) = (-0.993, 0.122));
  // U = 1 - smoothstep(edge, d / rp), the most of any pool, and 0 within `trunk` of any trunk
  pools: { broadleaf: 0.75, conifer: 1.05, hero: 1.6, size: [0.6, 1.1], noise: 1.2, shift: 0.25, away: [0.993, -0.122], edge: [0.75, 1], trunk: 0.35 },
  still: 0.06,     // still water (the lake, tarn and hot spring) is inside its outline where the ground is below level + this (composeBlueprint inWater)
  // STONE_PATHS' width (Structures.tsx SteppingStones: stones r 0.13-0.19 x 1.08, jittered 0.05 u: about 0.25 u either side of the line;
  // Task 1's choice, the brief gives no width; accepted pending review)
  stonePath: 0.5,
  // distances are exact out to this (u; W reads 3.5 at most, the lawn paint's lush band from the shore 5); farther reads as this (Task 1's
  // choice, accepted pending review)
  reach: 6,
  spots: {},       // per piece, spots the zones see and nothing else reads: { what, keep: 'clear' | 'tidy', halo, x, z, r | ax, az, bx, bz, r | rect, note }
  // (ruling GR9) MAIN's game spots where the game has them NOW, over the frozen v3 snapshot (game.*, which the flat zones and the baked
  // tops keep): slots by name (layout.ts BUSHES[6], moved off the hero tree's root flare in 511aa4a) and STONE_PATHS by index ([1] stops
  // at its bend while the composition is drawn, layout.ts aside(): the art's to_cottage ribbon starts there). The zones read these; the
  // composed props and the flat zones keep the snapshot. lib/ground-measure.mjs NOW is the tests' own copy
  now: { slots: { 'BUSHES:6': [-5.91, -5.33] }, stonePaths: { 1: [[-4.6, -0.55], [-5.25, 0.05]] } },
  // MAIN's cover as zoned clusters (plan Task 2; clusterCover). density: the most items per u^2 each zone takes (its area on the 0.1 u zone
  // grid; spec §4 as the owner amended it: A 0.8-1.5, lawn 3-4, C 3-5, B 5-7, D 1.5-2.5 and 4-6 on the pond's stretches (Ds), plan Task 10); E: its 0.25-0.7 u band, as a
  // share of the lawn's density as placed (at most half). archipelago.composition.ground.density tunes these (cover V3, V11)
  // (plan Task 10) Ds: the pond's stretches (D's ground there, cover V11: 4-6); D is the rest of D (1.5-2.5)
  density: { A: 1.1, lawn: 3.5, C: 4, B: 6, D: 2, E: 0.5, Ds: 5.5 },
  // the pond's edge on the teardrop (plan Task 10; cover V11 D, V13 shore, V17, RF2; comp.water.main.pond.outline, 191 points whose first
  // and last are the cap corners, where the stream leaves). n = the outline's outward normal (by its turn, from the neighbours `smooth`
  // points either way; 1 for the camera-facing test, as the cover test takes it), c = `cam`, the camera's ground direction (sin 45, cos 45,
  // as lakeJetty takes it).
  //   Stretches: candidate arcs of `arcLen` u (a position hash picks each length) centred on every outline point where n . c < `far` all
  //      along and every point is >= `cap` u from the cap line, each with its clumps (a one-clump arc also tries the clump nearer either
  //      end); a stretch's ground is the ground `band` u outside the teardrop whose nearest edge is one of its edges, >= `cap` from the cap
  //      line. Of the sets of `arcs` (then 2) non-touching candidates whose reeds stand `sep` apart, the outline points within 1.0 u of a
  //      reed cover <= `share` of the perimeter (with `runGap` set: in one run per arc with >= runGap u of open shore between runs), and
  //      the nearest reeds of two arcs stand >= `apart` u apart (ruling GR28), the one whose position-hash keys sum highest.
  //      runGap null (rulings GR28, GR30): the brief's 1.0 u between covered runs was out of reach on MAIN's far shore (the dog yard, the
  //      dirt path, LANTERNS[2], the mailbox, FRUIT_TREES[6] and the cap line), GR28 replaced it with `apart`; with the reeds at the
  //      waterline (GR30) each clump covers ~2 u of shore and the free shore (~2.7 u) holds no two separate runs at all, so the core no
  //      longer asks for them; `apart` is GR28's measure, with a margin
  //   Reeds (comp.pieces.main.reeds, the game's Reeds: GV3): clumps of reed.n every ~`clumpStep` u along an arc, within reed.r of a
  //      centre reed.centre u out; each reed reed.out u out (signed polyEdgeDist, < 0 in the water: ruling GR30 puts the reeds at the
  //      waterline, 0.25 u in to 0.4 u out; the core keeps a margin), nearest one of its arc's edges, through the cover's checks
  //      blind to the game's legacy farm water (okDry: the blob, its bank and the old stream are not drawn with the Teardrop, which is
  //      when the game draws these reeds), the keep-clear discs (not the farm water's drop: they stand in it), the yards, the clear spots, >= reed.path from a path's edge, in zone D or E (or none,
  //      where only the legacy water nulls it), >= reed.stream off the art stream, `sep` from another reed, > camReach from the
  //      camera-facing shore and with its nearest outline point on the far side; height reed.height, a head where a position hash >
  //      1 - reed.head (WildIsles.tsx reedsIn: 0.8 + 0.45 r, head r > 0.55). Position hashes only: no stream draws.
  //   The camera-facing shore (outline points with n . c > camShore): nothing over shoreCap u within camReach (cover V13 shore: 0.2 /
  //      1.25 u; the core keeps a margin). No pebbles on the stretches (ruling GR29: the stretches' ground is narrow, crossed by the frozen
  //      'stream' zone of the game's old stream and by the mailbox, and no heap of 3 finds room; the game's v2 bank stones carry the stony read)
  pond: { cam: [Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)], smooth: 3, far: -0.25, cap: 1.0, band: [0.35, 1.25], arcs: 3, arcLen: [0.9, 1.4], clumpStep: 1.0,
    share: 0.32, runGap: null, apart: 1.05, camShore: 0.18, camReach: 1.27, shoreCap: 0.2,
    reed: { n: [3, 5], r: [0.08, 0.16], centre: [-0.12, 0.2], out: [-0.23, 0.38], height: [0.8, 1.25], head: 0.45, sep: 0.1, pad: 0.06, stream: 0.35, path: 0.3 } },
  // cell: the seeds' jittered grid (u); gate: the noise that gathers the kept seeds into drifts (u, smoothstepped by gateEdge); members
  // per kind: n (count) and r (radius, u); daisyShare of the clover seeds in the lawn, B and C pair a daisy cluster; cloverAt: clover
  // where coverField's clover is above it; member: each member's scale x the cluster's; heading: the daisies' yaw spread (rad); clone:
  // the turn off a near twin (rad); pathClear: nothing nearer a path edge (u); sep: between any two items (u); ring: [r0, r1, deg] round
  // each tree that is always there; fill: the most extra seeds a zone short of its quota tries at its own cells; height: the most an
  // item stands (u) in A, D, the animal yards and the near side (theta 22-68 deg, r < 16)
  cluster: { cell: 0.7, gate: 2.5, gateEdge: [0.3, 0.7], tuft: { n: [4, 7], r: [0.2, 0.35] }, clover: { n: [3, 7], r: [0.15, 0.3] }, daisy: { n: [3, 5], r: [0.15, 0.25] },
    // pebble (plan Task 8, the owner's "shade, clover and pebbles" under the trees): `clusters` heaps of n kit models each (3-5 of them,
    // radius r), in C (the path-edge runs, pebbleE below, are E's), on ground that varies <= `flat` u under the 0.1 u footprint, at least `apart` u from each other, room (sepK) from any item; placed after every plant, on position hashes only, and
    // outside every zone's quota, so the plants' count and places are exactly what they were without them (ruling GR3: >= 12 on either seed)
    // (plan Task 9, GR26) a member's room between centres: sepK x the two scales from another heap, sepPlant + sepK x its scale from a plant,
    // so two heaps never lie on one another; its footprint (0.125 u, or 0.08 x its scale) varies <= flat under it (RF4: 9 samples of bp.H) and the game's grid and the
    // baked top agree to gap; it stands <= cap u (the V13b cap, never widened)
    pebble: { n: [3, 5], r: [0.15, 0.26], clusters: 5, apart: 2.5, sepK: 0.04, sepPlant: 0, flat: 0.012, gap: 0.008, cap: 0.044 },
    // the path-edge runs (plan Task 9, V13p): along each of MAIN's runs >= 2 u, stepping `step` u, clusters of n heaps (radius r) centred
    // `off` u off the run's edge, alternating sides, enough of them that they cover `share` of the run (a cluster covers its step)
    pebbleE: { n: [3, 5], r: [0.09, 0.17], step: 0.8, share: 0.31, off: [0.42, 0.52], minLen: 2, string: 1.5 },
    daisyShare: 0.65, cloverAt: 0.5, member: [0.78, 1.25], heading: 0.6, clone: 0.9, pathClear: 0.25, sep: 0.08, ring: [0.4, 1.4, 240], fill: 60,
    height: { A: 0.15, D: 0.2, yard: 0.2, near: 0.3 } },
  // the cover's tint (plan Task 4): every cover item takes texturedTint(x, z, { enabled, seed }) -- near white, each channel in TINT_RANGE
  // -- on a seed of its own (the canopy's is 11), so the cover varies by position without sharing the crowns' draw. The clover where the
  // shade pool U is above `shade` (MAIN, measured at the item) is darker, x clover[0] + clover[1] ph(x, z, 7307): 0.82-0.90
  tint: { seed: 29, clover: [0.82, 0.08], shade: 0.35 },
};
// the ground-cover field at (x, z), shared by the scatter (composeBlueprint) and the lawn bake (paintBlueprint): soft 0-1 shares of
// each patch kind. Farm: clover only. Wild: tall grass where P is high (patches ~2.4 u), seed-heads in part of those (Q), wildflower
// drifts in the open (F, ~1.1 u), clover in the low P ground; `kind` (slow, ~5 u) picks a drift's flower
export function coverField(noise, x, z, wild) {
  const P = 0.5 + 0.5 * noise.fbm(x * 0.42 + 31.7, z * 0.42 - 12.9, 3, 2, 0.5), K = 0.5 + 0.5 * noise.fbm(x * 0.21 - 17.7, z * 0.21 + 8.8, 2, 2, 0.5);
  if (!wild) return { tall: 0, seed: 0, drift: 0, clover: smoothstep(0.6, 0.68, P), kind: K, P, F: 0 };
  const Q = 0.5 + 0.5 * noise.fbm(x * 0.63 - 5.3, z * 0.63 + 44.1, 2, 2, 0.5), F = 0.5 + 0.5 * noise.fbm(x * 0.9 + 70.2, z * 0.9 + 3.3, 2, 2, 0.5);
  const tall = smoothstep(0.56, 0.66, P), seed = tall * smoothstep(0.5, 0.62, Q), drift = smoothstep(0.6, 0.7, F) * (1 - tall), clover = smoothstep(0.64, 0.72, 1 - P) * (1 - drift);
  return { tall, seed, drift, clover, kind: K, P, F };   // (P, F raw: the lawn bake draws its own softer edges from them)
}

// ---- the wetland jetty's spot (idle-economy art 4; world.config blueprint.coastAnchors.wetland[].jetty): every lake outline point x
//      every deck direction within +/- 60 deg of the way into the lake (2.5 deg steps); the shore end S walks back from the outline
//      point to where the bank is bankAim above the level; kept when the bank is inside `bank`, the deck past overWater is over open
//      water (inside the outline, the ground 0.03 below the level), it clears the keep-clear zones, the game's pads / shore reeds /
//      rock and the river and outflow, and a dry, flat shed patch fits beside S (either side, a little back toward the land) clear
//      of paths, channels, the rim and all of the above. Best = side-on to the game's default camera, then flat shed ground, then
//      near the farm-side point, a moderate depth under the far piles, the bank nearest bankAim. Returns (world x, z) { at (the
//      shore end), origin (the model's origin, the deck centre: J.origin along dir), dir, length, width, level, bank, shed: { at, r } }
//      or null; cached on bp ----
export function lakeJetty(bp, water) {
  if (bp._lakeJetty !== undefined) return bp._lakeJetty;
  const B = bp.config.blueprint, spec = ((B.coastAnchors || {}).wetland || []).find((a) => a.jetty);
  if (!spec || !bp.pieces.wetland) return (bp._lakeJetty = null);
  const J = spec.jetty, pv = bp.pieces.wetland.pivot, lake = water.wetland.lake, lvl = lake.level, poly = lake.outline, L = J.length, hw = J.width / 2, SH = J.shed;
  const W = ([x, z]) => [x + pv[0], z + pv[2]], cen = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
  const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
  const zones = B.zones.wetland || [], discs = [];
  for (const id of J.keepClear) { const zn = zones.find((q) => q.id === id); if (zn) discs.push([zn.at[0], zn.at[1], zn.r]); }
  for (const p of J.pads.at) discs.push([...W(p), J.pads.r]);
  for (const f of J.shoreReeds.fractions) { const [x, z] = poly[Math.floor(f * poly.length) % poly.length], d = Math.hypot(x - cen[0], z - cen[1]) || 1;   // (isleSpots.ts shore(): on the same outline)
    discs.push([x - (x - cen[0]) / d * J.shoreReeds.inset, z - (z - cen[1]) / d * J.shoreReeds.inset, J.shoreReeds.r]); }
  for (const [x, z, r] of J.rocks) discs.push([...W([x, z]), r]);
  const chans = [water.wetland.river.points, water.wetland.outflow.points];
  const chanD = (x, z) => { let m = Infinity; for (const P of chans) for (let i = 0; i < P.length - 1; i++) m = Math.min(m, segD(x, z, P[i].x, P[i].z, P[i + 1].x, P[i + 1].z) - Math.max(P[i].width, P[i + 1].width) / 2); return m; };
  const paths = B.paths.map((P) => ({ w: P.width, pts: resamplePolyline(catmullRomCentripetal(P.pts, 5), 0.25) }));
  const pathD = (x, z) => { let m = Infinity; for (const P of paths) for (let i = 0; i < P.pts.length - 1; i++) { const a = P.pts[i], b = P.pts[i + 1]; if (Math.abs(a[0] - x) > 3 || Math.abs(a[1] - z) > 3) continue; m = Math.min(m, segD(x, z, a[0], a[1], b[0], b[1]) - P.w / 2); } return m; };
  const rim = bp.pieces.wetland.loopWorld, edgeD = (x, z) => { let m = Infinity; for (let i = 0; i < rim.length; i++) { const a = rim[i], b = rim[(i + 1) % rim.length]; m = Math.min(m, segD(x, z, a[0], a[1], b[0], b[1])); } return m; };
  const CM = J.camera, ce = CM.el * DEG, ca = CM.az * DEG, cam = [CM.tgt[0] + Math.cos(ce) * Math.sin(ca) * CM.dist, CM.tgt[2] + Math.cos(ce) * Math.cos(ca) * CM.dist], near = W(J.near);
  let best = null;
  for (const p of poly) {
    const inward = Math.atan2(cen[1] - p[1], cen[0] - p[0]);
    for (let k = -24; k <= 24; k++) {
      const a = inward + k * 2.5 * DEG, d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]];
      if (discs.some(([x, z, r]) => segD(x, z, p[0], p[1], p[0] + d[0] * L, p[1] + d[1] * L) - hw - r < J.clear - 0.6)) continue;   // (quick reject; S is within 0.6 of p)
      // the bank as the game's terrain has it: the baked top's coarse triangles spread the carved step over ~0.7 u, so the height is
      // the mean of H over +/- J.smooth along the deck axis (the baked top agrees within a few cm; composition.test C18 checks it)
      const Hb = (s) => { let t = 0; for (let q = 0; q < 8; q++) { const o = -J.smooth + (q + 0.5) / 8 * 2 * J.smooth; t += bp.H(p[0] - d[0] * (s - o), p[1] - d[1] * (s - o)); } return t / 8 - lvl; };
      let s1 = null; for (let s = -0.6; s <= 1.5 + 1e-9; s += 0.05) if (Hb(s) >= J.bankAim) { s1 = s; break; }
      if (s1 === null) continue; let s0 = s1 - 0.05;   // (then bisect to 0.05 / 2^5 u)
      for (let it = 0; it < 5; it++) { const m = (s0 + s1) / 2; if (Hb(m) >= J.bankAim) s1 = m; else s0 = m; }
      const S = [p[0] - d[0] * s1, p[1] - d[1] * s1], bank = Hb(s1); if (bank < J.bank[0] || bank > J.bank[1] || bp.H(S[0], S[1]) - lvl < J.bank[0]) continue;
      const E = [S[0] + d[0] * L, S[1] + d[1] * L];
      let clear = Infinity; for (const [x, z, r] of discs) clear = Math.min(clear, segD(x, z, S[0], S[1], E[0], E[1]) - hw - r);
      if (clear < J.clear || Math.min(chanD(S[0], S[1]), chanD(E[0], E[1])) < J.channel) continue;
      let wet = true, far = Infinity;
      for (let u = J.overWater; u <= L + 1e-9 && wet; u += 0.1) for (let v = -hw; v <= hw + 1e-9; v += hw / 2) { const x = S[0] + d[0] * u + n[0] * v, z = S[1] + d[1] * u + n[1] * v, h = bp.H(x, z) - lvl;
        if (h > -0.03 || !inLoop(poly, x, z)) { wet = false; break; } if (u >= L - 0.3) far = Math.min(far, -h); }
      if (!wet) continue;
      let shed = null;
      for (const side of [1, -1]) for (const back of SH.back) { const c = [S[0] - d[0] * back + n[0] * side * (hw + SH.gap + SH.r), S[1] - d[1] * back + n[1] * side * (hw + SH.gap + SH.r)];
        if (pathD(c[0], c[1]) - SH.r < SH.path || chanD(c[0], c[1]) - SH.r < J.channel - 0.3 || edgeD(c[0], c[1]) - SH.r < SH.edge) continue;
        if (discs.some(([x, z, r]) => Math.hypot(c[0] - x, c[1] - z) - r - SH.r < J.clear) || pieceAt(bp, c[0], c[1]) !== 'wetland') continue;   // (centre on the piece, edgeD: all of it)
        let lo = Infinity, hi = -Infinity;
        for (let q = 0; q < 16; q++) for (const rr of [0, SH.r / 2, SH.r]) { const h = bp.H(c[0] + Math.cos(q / 16 * TAU) * rr, c[1] + Math.sin(q / 16 * TAU) * rr) - lvl; lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (lo < SH.dry) continue;
        if (!shed || hi - lo < shed.flat) shed = { at: c, flat: hi - lo }; }
      if (!shed) continue;
      const mx = (S[0] + E[0]) / 2 - cam[0], mz = (S[1] + E[1]) / 2 - cam[1], sideOn = Math.abs(d[0] * mz - d[1] * mx) / Math.hypot(mx, mz);
      const score = 2 * sideOn - 3 * shed.flat - 0.35 * Math.hypot(S[0] - near[0], S[1] - near[1]) + Math.min(clear, 0.6) + Math.min(far, 0.45) - 2 * Math.abs(bank - J.bankAim);
      if (!best || score > best.score) best = { at: S, origin: [S[0] + d[0] * J.origin, S[1] + d[1] * J.origin], dir: d, length: L, width: J.width, level: lvl, bank, shed: { at: shed.at, r: SH.r }, score };
    }
  }
  return (bp._lakeJetty = best);
}

// the keep-clear test composeBlueprint drops scatter with (world x, z [, category] -> true inside): B.keepClear discs + their pad, and the
// wetland jetty's deck (half width + 0.15) and shed patch (r + 0.15); null when there are none. A disc with `kinds` (composition
// categories: trees, bushes, shrubs, rocks, flowers, grass, cover, flowerPatches) only keeps those off, e.g. the hero tree's root flare
// keeps volumes off and lets grass grow between the roots; asked without a category (x, z) every disc applies
export function keepClearHit(bp, water) {
  const KC = (bp.config.blueprint.keepClear || []).map((k) => [k.at[0], k.at[1], k.at[0], k.at[1], k.r + (k.pad ?? 0.15), k.kinds || null]), jetty = lakeJetty(bp, water);
  if (jetty) { const [sx, sz] = jetty.at, [dx, dz] = jetty.dir;
    KC.push([sx, sz, sx + dx * jetty.length, sz + dz * jetty.length, jetty.width / 2 + 0.15, null], [jetty.shed.at[0], jetty.shed.at[1], jetty.shed.at[0], jetty.shed.at[1], jetty.shed.r + 0.15, null]); }
  if (!KC.length) return null;
  return (x, z, kind) => KC.some(([ax, az, bx, bz, r, kinds]) => { if (kind && kinds && !kinds.includes(kind)) return false;
    const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t) < r; });
}

// the water rev 1 drop test composeBlueprint drops MAIN's scatter with (world x, z, category -> true where it goes), or null without
// archipelago.farmWater: the art-owned farm water (the teardrop pond + its stream, with the pond's 0.32 u bank, as pondHit) and
// flowerbed 8's new spot (its keep-clear disc; MAIN's frozen zones keep the old spot), each + the category's own clearance pad (as paths v2)
const FARM_WATER_CATS = ['trees', 'bushes', 'rocks', 'flowers', 'grass', 'shrubs', 'flowerPatches', 'cover'];
export function farmWaterHit(bp, water) {
  const A = bp.config, G = A.game, CP = A.composition;
  if (!A.farmWater || !water.main.stream.line) return null;
  const po = water.main.pond.outline, line = water.main.stream.line, FZ = A.farmWater.frozen.flowerbeds;
  const R1 = G.FLOWERBEDS.map((p, i) => (FZ[i] && (FZ[i][0] !== p[0] || FZ[i][1] !== p[1]) ? { x: p[0], z: p[1], r: A.mainZones.radii.flowerbed } : null)).filter(Boolean);
  const edge = (x, z) => { let d = Infinity; for (let i = 0; i < po.length; i++) { const a = po[i], b = po[(i + 1) % po.length], dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1); d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)); } return d; };
  let fb = [Infinity, Infinity, -Infinity, -Infinity]; for (const [x, z] of po.concat(line.map((p) => [p.x, p.z]))) fb = [Math.min(fb[0], x - 1.5), Math.min(fb[1], z - 1.5), Math.max(fb[2], x + 1.5), Math.max(fb[3], z + 1.5)];
  const farmHit = (x, z, pad) => { if (x < fb[0] || x > fb[2] || z < fb[1] || z > fb[3]) return false; if (inLoop(po, x, z) || edge(x, z) < 0.32 + pad) return true;
    for (let i = 0; i < line.length - 1; i++) { const a = line[i], b = line[i + 1], dx = b.x - a.x, dz = b.z - a.z, t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < (a.width + (b.width - a.width) * t) / 2 + 0.32 + pad) return true; } return false; };
  const r1Hit = (x, z, pad) => R1.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + pad);   // (flowerbed discs only)
  const PAD = { trees: CP.treeAvoid, bushes: 0.35, rocks: 0.2, flowers: 0.15, grass: 0.1, shrubs: 0.28, flowerPatches: 0.12, cover: 0.1 };
  return (x, z, kind) => { const pad = PAD[kind]; return pad != null && (farmHit(x, z, pad) || r1Hit(x, z, pad)); };
}

// ---- THE GAME'S GROUND (plan Task 7, ruling GR14 closed) ----
// The game loads the BAKED pieces (lib/bake.mjs): a lower-resolution build of this island (BAKE_RES, buildBlueprint opts.res) drawn
// as piece_<id>.glb, and a height grid piece_<id>.height.bin sampled from that drawn top every 0.25 u, by which the game stands every
// prop and cover item (bilinear). Where the drawn top folds inside a grid cell (the highland's terraces, the wetland's banks, the
// islet's headland: 0.1-0.4 u off at ~5-15 % of their cells) the two disagree, so an item stood by the grid floats or sinks against the
// ground drawn under it. The grids are game-facing and frozen (bake.test B16), and a top fine enough to follow them costs 40-95 KB a
// piece (over B2's caps), so the COVER keeps off that ground instead: gameGround(A, L) is the core's own copy of what the game loads
// (byte-identical to the files: cover.test V14b) and composeBlueprint's cover stands only where the grid and the drawn top agree within
// GAME_GROUND_TOL (cover V14). Always the default seed's bake (the one the game ships), whatever seed is composed.
// BAKE_RES: the bake profile (lib/bake.mjs PROFILE = bakeProfile(archipelago)). The binding limit is the file size: core glTF needs
// float32 POSITION + NORMAL, so a vertex costs 28 B with u8 colours and every flat-shaded rock face needs its own 3 vertices (~90 B a
// face); smooth grass shares vertices (~20 B a face); target <= 280 KB a file. See art/BLUEPRINT.md "Baked pieces". v2 adds the
// open-seam skirts (child nodes skirt_<neighbour>), shared seam normals, flat seam walls with strata rows and a shallower underside.
const BAKE_RES = {
  rimStride: 4,          // MAIN rim + cone: every 4th of the 320 rim vertices (+ the 7 seam starts): ~0.7 u along the rim, 80+ cliff columns
  mainRing: 0.29,        // MAIN top rings every 0.29 u (default 0.2)
  petalRings: 28,        // 84 / 3: every 3rd default ring -> the seam vertices are a subset of the default seam polylines
  seamRowStep: 4.5,      // seam-wall rows every 4.5 u (default 1.1; the walls are back to back once docked)
  // per piece (the big / dramatic pieces coarser where it costs least, the small ones near the default):
  stepScale:    { meadow: 1.45, wetland: 1.55, cottage: 1.0, highland: 2.1, orchard: 1.0, grove: 1.05, islet: 1.25 },   // arc step x (default 0.28-0.42 u)
  underAngStep: { meadow: 7, wetland: 7, cottage: 5, highland: 12, orchard: 5, grove: 5, islet: 5.5 },                  // underside arc step x the arc step (default 3)
  coastRowStep: { meadow: 0.9, wetland: 0.9, cottage: 0.7, highland: 1.2, orchard: 0.7, grove: 0.7, islet: 0.8 },       // coast-wall rows (u; default 0.55; lip + foot rows stay)
  refineFlat: { tol: 2e-3, minEdge: 0.12 },   // bisect top edges that tilt a flat pad by > 2 mm (pads next to risers: islet headland, highland)
  // ---- pieces v2 ---- (underScale: the hanging depth (cone below the coast wall) x archipelago.blueprint.underside.gameScale, so
  // blueprint.pieces.json depth / bottomLocal agree; added by bakeProfile)
  sharedSeamNormals: true,                    // seam + rim vertex normals = the joined top surface's (identical in every piece: no shading line)
  seamBulge: 0,                               // flat seam walls (the skirt sits just outside them) ...
  seamTopRows: [0.9, 1.7, 2.6],               // ... with rows near the top, so their vertex colours carry the rock strata (v5: two of them
                                              // fit the 2 u seam lip the taper leaves; B15 rows <= 1.2 u apart)
  skirts: { every: 1, lip: 0.07, lipOut: 0.12, rows: [0.5, 1.3], deep: [0.5], out: 0.4, amp: 0.2, facetW: 1.15, jig: 0.05 },   // open-seam skirts: coast-style slab facets (+/- 0.3 u), rim lip, ~300 tris each
};
export function bakeProfile(A) {
  return Object.freeze({ ...BAKE_RES, underScale: A.blueprint.underside.gameScale });
}
export const GAME_GROUND_SPACING = 0.25, GAME_GROUND_TOL = 0.02;
// exact sampler on baked top faces (float32 piece-local positions P, indices F, the faces' list): (x, z) -> y, or null off the top
// (lib/bake.mjs samples the height grid with it)
export function gridTopSampler(P, F, list) {
  let minx = 1e9, minz = 1e9, maxx = -1e9, maxz = -1e9;
  for (const t of list) for (let k = 0; k < 3; k++) { const i = F[t * 3 + k] * 3; minx = Math.min(minx, P[i]); maxx = Math.max(maxx, P[i]); minz = Math.min(minz, P[i + 2]); maxz = Math.max(maxz, P[i + 2]); }
  const cs = 0.5, nx = Math.max(1, Math.ceil((maxx - minx) / cs) + 1), nz = Math.max(1, Math.ceil((maxz - minz) / cs) + 1), cells = new Array(nx * nz);
  for (const t of list) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < 3; k++) { const i = F[t * 3 + k] * 3; x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); z0 = Math.min(z0, P[i + 2]); z1 = Math.max(z1, P[i + 2]); }
    for (let gx = Math.floor((x0 - minx) / cs); gx <= Math.floor((x1 - minx) / cs); gx++) for (let gz = Math.floor((z0 - minz) / cs); gz <= Math.floor((z1 - minz) / cs); gz++) (cells[gz * nx + gx] || (cells[gz * nx + gx] = [])).push(t);
  }
  const fn = (x, z) => {
    const gx = Math.floor((x - minx) / cs), gz = Math.floor((z - minz) / cs);
    if (gx < 0 || gz < 0 || gx >= nx || gz >= nz) return null;
    const cl = cells[gz * nx + gx]; if (!cl) return null;
    let best = null, bestMin = -1e9;
    for (const t of cl) {
      const a = F[t * 3] * 3, b = F[t * 3 + 1] * 3, c = F[t * 3 + 2] * 3, x0 = P[a], z0 = P[a + 2], x1 = P[b], z1 = P[b + 2], x2 = P[c], z2 = P[c + 2];
      const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2); if (Math.abs(det) < 1e-14) continue;
      const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / det, l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / det, l2 = 1 - l0 - l1, mn = Math.min(l0, l1, l2);
      if (mn > bestMin) { bestMin = mn; best = l0 * P[a + 1] + l1 * P[b + 1] + l2 * P[c + 1]; if (mn >= 0) break; }
    }
    return bestMin >= -1e-9 ? best : null;
  };
  fn.bounds = [minx, minz, maxx, maxz];
  return fn;
}
// the height grid of baked top faces (as piece_<id>.height.bin): origin [x0, z0] on the spacing lattice, size [nx, nz], row-major with x
// fastest, NaN off the top
export function heightGridOf(P, F, list, spacing = GAME_GROUND_SPACING) {
  const sample = gridTopSampler(P, F, list), [bx0, bz0, bx1, bz1] = sample.bounds;
  const x0 = Math.floor(bx0 / spacing) * spacing, z0 = Math.floor(bz0 / spacing) * spacing;
  const nx = Math.ceil((bx1 - x0) / spacing - 1e-9) + 1, nz = Math.ceil((bz1 - z0) / spacing - 1e-9) + 1, grid = new Float32Array(nx * nz); let finite = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const y = sample(x0 + i * spacing, z0 + j * spacing); if (y != null) finite++; grid[j * nx + i] = y == null ? NaN : y; }
  return { origin: [x0, z0], size: [nx, nz], spacing, grid, finite, sample };
}
// gameGround(A, L) -> { pieces: { [id]: { origin, size, spacing, grid, pivot } }, gap(id, x, z) }: gap = |the grid (bilinear) - the drawn
// top (the highest top face over the point)| at a world point of piece `id`, or null where either is missing (off the top, a hole's
// edge). Built once per (archipelago, look) and kept (one bake-resolution build, ~1 s)
const GAME_GROUND = new WeakMap();
export function gameGround(A, L) {
  let byL = GAME_GROUND.get(A); if (!byL) GAME_GROUND.set(A, (byL = new Map()));
  if (byL.has(L)) return byL.get(L);
  const bk = buildBlueprint(A, L, { res: bakeProfile(A) }), pieces = {}, at = {};
  for (const id of bk.order) {
    const pc = bk.pieces[id], Pp = pc.positions, tops = []; for (let t = 0; t < pc.faceCount; t++) if (pc.tags[t] === TAG.top) tops.push(t);
    const P = new Float32Array(tops.length * 9), F = new Uint32Array(tops.length * 3), list = tops.map((_, s) => s);
    tops.forEach((t, s) => { for (let k = 0; k < 9; k++) P[s * 9 + k] = Pp[t * 9 + k]; for (let k = 0; k < 3; k++) F[s * 3 + k] = s * 3 + k; });
    const hg = heightGridOf(P, F, list), [gx0, gz0] = hg.origin, [nx, nz] = hg.size, sp = hg.spacing, G2 = hg.grid;
    pieces[id] = { origin: hg.origin, size: hg.size, spacing: sp, grid: G2, pivot: pc.pivot };
    // the drawn top: the highest top face over (x, z) (composition.mjs bakedTopSampler's rule, which cover V14 reads the GLB with)
    const C = 0.5, cells = new Map(), key = (i, j) => i * 100003 + j;
    for (let s = 0; s < tops.length; s++) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < 3; k++) { const o = s * 9 + k * 3; x0 = Math.min(x0, P[o]); x1 = Math.max(x1, P[o]); z0 = Math.min(z0, P[o + 2]); z1 = Math.max(z1, P[o + 2]); }
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) { const k = key(i, j); (cells.get(k) || cells.set(k, []).get(k)).push(s); } }
    const topAt = (x, z) => { let best = null;
      for (const s of cells.get(key(Math.floor(x / C), Math.floor(z / C))) || []) {
        const o = s * 9, ax = P[o], az = P[o + 2], bx = P[o + 3], bz = P[o + 5], cx = P[o + 6], cz = P[o + 8];
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(det) < 1e-12) continue;
        const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l2 = 1 - l0 - l1;
        if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
        const y = l0 * P[o + 1] + l1 * P[o + 4] + l2 * P[o + 7]; if (best === null || y > best) best = y; }
      return best; };
    const gridAt = (x, z) => { const fx = (x - gx0) / sp, fz = (z - gz0) / sp, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return null;
      const g00 = G2[j * nx + i], g10 = G2[j * nx + i + 1], g01 = G2[(j + 1) * nx + i], g11 = G2[(j + 1) * nx + i + 1];
      if (!(Number.isFinite(g00) && Number.isFinite(g10) && Number.isFinite(g01) && Number.isFinite(g11))) return null;
      return (g00 * (1 - u) + g10 * u) * (1 - v) + (g01 * (1 - u) + g11 * u) * v; };
    at[id] = (xw, zw) => { const x = xw - pc.pivot[0], z = zw - pc.pivot[2], gy = gridAt(x, z), ty = topAt(x, z); return gy === null || ty === null ? null : Math.abs(gy - ty); };
  }
  const res = { pieces, gap: (id, x, z) => (at[id] ? at[id](x, z) : null) };
  byL.set(L, res);
  return res;
}

// composeBlueprint waterWithin's ring: the ground cover's six points (the other two diagonals would move the cover's wet grass)
const WATER_RING =[[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]];
export function composeBlueprint(bp, L) {
  const A = bp.config, B = A.blueprint, CP = A.composition, G = A.game, out = {};
  for (const id of bp.order) out[id] = { trees: [], bushes: [], rocks: [], flowers: [], grass: [], sheep: [], props: [], footprints: [], placeholders: [], paths: [] };
  const slope = (x, z) => { const e = 0.3; return Math.hypot(bp.H(x + e, z) - bp.H(x - e, z), bp.H(x, z + e) - bp.H(x, z - e)) / (2 * e); };
  const water = blueprintWater(bp);
  // obstacles: flat zones (buildings etc.), water bodies, path corridors
  const zoneHit = (x, z, pad, skip = null) => { for (const zn of bp.zones) { if (zn.what === 'core' || (skip && skip.has(zn.what)) || x < zn.bb[0] - pad || z < zn.bb[1] - pad || x > zn.bb[2] + pad || z > zn.bb[3] + pad) continue;
    if (zn.type === 'disc' ? Math.hypot(x - zn.x, z - zn.z) < zn.r + pad : zn.type === 'capsule' ? (() => { const dx = zn.bx - zn.ax, dz = zn.bz - zn.az, t = clamp(((x - zn.ax) * dx + (z - zn.az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(x - zn.ax - dx * t, z - zn.az - dz * t) < zn.r + pad; })()
      : (x > zn.x0 - pad && x < zn.x1 + pad && z > zn.z0 - pad && z < zn.z1 + pad)) return zn; } return null; };
  const extraZones = [];
  for (const [pid, list] of Object.entries(B.zones)) for (const zn of list) if (zn.kind !== 'core' && zn.flat === false && zn.kind !== 'animals' && zn.id !== 'wildflowers') extraZones.push({ x: zn.at[0], z: zn.at[1], r: zn.r });
  const lakePoly = water.wetland.lake.outline, tarnPoly = water.highland.tarn.outline;
  const chans = bp.channels;
  const nearChannel = (x, z, pad) => { for (const ch of chans) { if (x < ch.bb[0] - pad || z < ch.bb[1] - pad || x > ch.bb[2] + pad || z > ch.bb[3] + pad) continue; for (const p of ch.pts) if (Math.hypot(p[0] - x, p[1] - z) < ch.width(0) / 2 + ch.bank + pad) return true; } return false; };
  const pondHit = (x, z, pad) => Math.hypot(x - G.POND.x, z - G.POND.z) < G.POND.r + 0.32 + pad;
  // paths: dense world samples split per piece at exact seam crossings. The DRAWN routes are B.paths; the scatter below clears
  // B.scatterPaths (the V21 routes of the paths v2 rerouted) instead, so the V21 composition keeps every RNG stream; the scatter the
  // new routes now cover is dropped at the end (see "paths v2"). A path's optional `widths` (one per control point) narrows it locally:
  // each run then carries `widths` (one per point, interpolated along the control polyline). Runs record the piece they come `from`
  // and go `to` along the path (null at a free end).
  const widthAt = (P) => { if (!P.widths) return null; const C = P.pts;
    return ([x, z]) => { let best = Infinity, w = P.width;
      for (let k = 0; k < C.length - 1; k++) { const [ax, az] = C[k], [bx, bz] = C[k + 1], dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d < best) { best = d; w = P.widths[k] + (P.widths[k + 1] - P.widths[k]) * t; } } return +w.toFixed(4); }; };
  const pathSamples = [], drawnPaths = [];
  for (const P of B.paths) {
    const dense = resamplePolyline(catmullRomCentripetal(P.pts, 5), 0.25), SP = B.scatterPaths && B.scatterPaths[P.id], wOf = widthAt(P);
    pathSamples.push({ id: P.id, width: P.width, pts: SP ? resamplePolyline(catmullRomCentripetal(SP.pts, 5), 0.25) : dense });
    if (SP) drawnPaths.push({ id: P.id, width: P.width, pts: dense, wOf });
    let run = null;
    const flush = (to) => { if (run && run.pts.length > 1) out[run.piece].paths.push({ id: P.id, width: P.width, pts: run.pts, ...(wOf ? { widths: run.pts.map(wOf) } : {}), from: run.from, to: to || null }); };
    for (let i = 0; i < dense.length; i++) {
      const pc = pieceAt(bp, dense[i][0], dense[i][1]);
      if (!run || pc !== run.piece) {
        if (run && i > 0) {     // bisect the crossing so both runs end exactly on the seam
          let a = dense[i - 1], b = dense[i];
          for (let it = 0; it < 30; it++) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (pieceAt(bp, m[0], m[1]) === run.piece) a = m; else b = m; }
          const cross = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; run.pts.push(cross); flush(pc); run = { piece: pc, pts: [cross], from: run.piece };
        } else { flush(pc); run = { piece: pc, pts: [], from: run ? run.piece : null }; }
      }
      if (pc) run.pts.push(dense[i]);
    }
    flush(null);
  }
  const nearPath = (x, z, pad) => { for (const P of pathSamples) for (const p of P.pts) if (Math.abs(p[0] - x) < 2 && Math.abs(p[1] - z) < 2 && Math.hypot(p[0] - x, p[1] - z) < P.width / 2 + pad) return true; return false; };
  // open water = inside the outer shore AND below the level (an islet inside the basin is land)
  const lakeLvl = water.wetland.lake.level, tarnLvl = water.highland.tarn.level;
  const inWater = (x, z) => (inLoop(lakePoly, x, z) && bp.H(x, z) < lakeLvl + 0.06) || (inLoop(tarnPoly, x, z) && bp.H(x, z) < tarnLvl + 0.06);
  // water within r: a channel (bank included), the pond, or open water at one of WATER_RING's points on a ring of radius r (the
  // ground cover's wet test and the wetland's waterside birches)
  const waterWithin = (x, z, r) => nearChannel(x, z, r) || pondHit(x, z, r - 0.32) || WATER_RING.some(([dx, dz]) => inWater(x + dx * r, z + dz * r));
  const blocked = (x, z, pad) => zoneHit(x, z, pad) || nearPath(x, z, pad) || nearChannel(x, z, pad) || pondHit(x, z, pad) || inWater(x, z) ||
    extraZones.some((e) => Math.hypot(x - e.x, z - e.z) < e.r + pad);
  // (plan Task 10) the same, but blind to the game's legacy farm water (its blob, pondHit, and the frozen 'pond' / 'blocker:pond' / 'stream' zones): the
  // pond's reeds are the art Teardrop's dressing, drawn by the game only with that pond (GV3), when the legacy blob and stream are not
  const LEGACY_WATER = new Set(['pond', 'blocker:pond', 'stream']);
  const blockedDry = (x, z, pad) => zoneHit(x, z, pad, LEGACY_WATER) || nearPath(x, z, pad) || nearChannel(x, z, pad) || inWater(x, z) ||
    extraZones.some((e) => Math.hypot(x - e.x, z - e.z) < e.r + pad);
  const edgeDist = (id, x, z) => { const loop = bp.pieces[id].loopWorld; let m = 1e9; for (let i = 0; i < loop.length; i += 2) m = Math.min(m, Math.hypot(loop[i][0] - x, loop[i][1] - z)); return m; };
  const SC = CP.sightCorridor, inSight = (x, z) => { const th = ((Math.atan2(z, x) / DEG) + 360) % 360; return th > SC.theta[0] && th < SC.theta[1] && Math.hypot(x, z) < SC.r; };
  const rngOf = (id, salt) => mulberry32(strSeed(1000 + (bp.vary || 0), id + ':' + salt));
  const ph = (x, z, salt) => hash3(Math.round(x * 100), Math.round(z * 100), salt);   // a position hash (0-1): draws no RNG stream

  // ---- MAIN: the farm at the game's positions (existing GLBs) ----
  const M = out.main, GA = G.GARDEN;
  M.props.push({ asset: 'farmhouse', x: G.HOUSE.x, z: G.HOUSE.z, rot: G.HOUSE.rot, scale: 1, h: 2.7, r: 1.8 });
  G.PLOT_SLOTS.forEach(([c, r], i) => M.props.push({ asset: 'plot', x: GA.x0 + GA.cell * (c + 0.5), z: GA.z0 + GA.cell * (r + 0.5), rot: 0, scale: GA.plot / 1.02, slot: i, h: 0.2 }));
  const fence = (a, b, tag) => { const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), n = Math.max(1, Math.round(len / 0.62));
    for (let i = 0; i < n; i++) M.props.push({ asset: 'fence', x: a[0] + dx * (i + 0.5) / n, z: a[1] + dz * (i + 0.5) / n, rot: Math.atan2(dx, dz), scale: 1, scaleZ: (len / n) / 0.76, tag, h: 0.5 }); };
  A.mainIslandTsx.HOME_FENCE.forEach(([a, b]) => fence(a, b, 'home')); G.FENCE_RUNS.forEach(([a, b]) => fence(a, b, 'garden'));
  G.FLOWERBEDS.forEach((p, i) => M.props.push({ asset: 'flowerbed', x: p[0], z: p[1], rot: (i * 1.3) % 3.14, scale: 0.85, slot: i, h: 0.35 }));
  G.STATIC_TREES.forEach((t, i) => M.trees.push({ x: t.at[0], z: t.at[1], kind: t.kind === 'p' ? 'pine' : 'round', scale: t.kind === 'p' ? t.s * 0.72 : t.s * 0.62, rot: i * 2.1, layout: true }));
  G.BUSHES.forEach((b, i) => M.bushes.push({ x: b[0], z: b[1], kind: i % 2 === 0 ? 'bush_flowering' : 'bush_a', scale: (0.9 + (i % 3) * 0.2) * 0.85, rot: i * 1.7, layout: true }));
  A.mainIslandTsx.ROCKS.forEach((r, i) => M.rocks.push({ x: r.at[0], z: r.at[1], kind: i % 2 ? 'rock_b' : 'rock_a', scale: r.s * 1.9, rot: i * 0.9, layout: true }));
  G.STONE_PATHS.forEach((p, k) => { for (let i = 0; i < p.length - 1; i++) for (let s = 0; s < 3; s++) { const t = (s + 0.5) / 3; M.props.push({ asset: 'rock_a', x: p[i][0] + (p[i + 1][0] - p[i][0]) * t, z: p[i][1] + (p[i + 1][1] - p[i][1]) * t, rot: k + s, scale: 0.2, scaleY: 0.08, tag: 'steppingStone', h: 0.05 }); } });
  G.DIRT_PATHS.forEach((p, i) => M.paths.unshift({ id: 'dirt' + i, width: G.DIRT_PATH_WIDTHS[i], pts: resamplePolyline(catmullRomCentripetal(p, 6), 0.2), layout: true }));
  // missing assets -> reserved footprints (?debug=1)
  const fp = (piece, id, x, z, r, kind, missing = true) => out[piece].footprints.push({ id, x, z, r, kind, missing });
  fp('main', 'windmill', G.WINDMILL[0], G.WINDMILL[1], 1.2, 'building'); fp('main', 'greenhouse', G.GREENHOUSE.x, G.GREENHOUSE.z, 1.6, 'building');
  fp('main', 'well', G.WELL[0], G.WELL[1], 0.8, 'building'); fp('main', 'bench', G.BENCH.x, G.BENCH.z, 0.6, 'prop'); fp('main', 'scarecrow', G.SCARECROW[0], G.SCARECROW[1], 0.4, 'prop');
  G.LANTERNS.forEach((p, i) => fp('main', 'lantern' + i, p[0], p[1], 0.3, 'prop')); G.BEEHIVES.forEach((p, i) => fp('main', 'beehive' + i, p[0], p[1], 0.35, 'prop'));
  G.FRUIT_TREES.forEach((p, i) => fp('main', 'fruitTree' + i, p[0], p[1], 0.55, 'tree'));
  const LN = A.lanes;
  fp('main', 'noticeBoard', LN.NOTICE_BOARD[0], LN.NOTICE_BOARD[1], 0.45, 'restoration'); fp('main', 'jetty', (LN.JETTY[0][0] + LN.JETTY[1][0]) / 2, (LN.JETTY[0][1] + LN.JETTY[1][1]) / 2, 0.6, 'restoration');
  fp('main', 'hedgeCottage', LN.HEDGE_COTTAGE.x, LN.HEDGE_COTTAGE.z, 0.9, 'building'); fp('main', 'mailbox', LN.MAILBOX[0], LN.MAILBOX[1], 0.25, 'prop');
  fp('main', 'burrowDoor', LN.BURROW_DOOR[0], LN.BURROW_DOOR[1], 0.5, 'prop');
  for (const [pid, list] of Object.entries(B.zones)) for (const zn of list) fp(pid, zn.id, zn.at[0], zn.at[1], zn.r, zn.kind, zn.kind !== 'core');
  // orchard: tree_round_a STAND-INS at the 8 repo-tree spots (RepoOrchard.tsx ROWS, piece-local) -- placeholders
  const op = bp.pieces.orchard.pivot, SQ = Math.SQRT1_2;
  LN.ORCHARD_ROWS.forEach(([u, v], i) => out.orchard.placeholders.push({ asset: 'tree_round_a', x: op[0] + (u + v) * SQ, z: op[2] + (v - u) * SQ, scale: 0.42, rot: i * 2.1, h: 0.95, note: 'placeholder for repo_tree_N' }));

  // ---- tree clumps (STYLE C4 rescaled): jittered inside each clump, rejected off zones/water/paths/edges ----
  CP.clumps.forEach((c, ci) => {
    const rng = rngOf(c.piece, 'clump' + ci), list = out[c.piece].trees;
    let placed = 0;
    for (let tries = 0; placed < c.n && tries < c.n * 40; tries++) {
      const a = rng() * TAU, rr = c.spread * Math.sqrt(rng()), x = c.at[0] + Math.cos(a) * rr, z = c.at[1] + Math.sin(a) * rr;
      if (pieceAt(bp, x, z) !== c.piece || blocked(x, z, CP.treeAvoid) || slope(x, z) > 0.75 || edgeDist(c.piece, x, z) < CP.treeEdge) continue;
      if ((c.piece === 'main' || c.piece === 'meadow') && inSight(x, z)) continue;
      if (list.some((t) => Math.hypot(t.x - x, t.z - z) < 0.75)) continue;
      const sp = c.species === 'mix' ? (rng() < 0.5 ? 'pine' : 'round') : c.species, s = c.scale[0] + (c.scale[1] - c.scale[0]) * rng();
      list.push({ x, z, kind: sp, scale: sp === 'pine' ? s * 0.8 : s * 0.62, rot: rng() * TAU, clump: ci }); placed++;
    }
  });
  // ---- FORESTS (v4 LOOK pass): dense woodland by rule (concept: forest fills the grove, lines the rim and the
  //      lakeshore, surrounds the plateau). Jittered-grid candidates per petal, accepted by the strongest rule's
  //      density x a low-frequency CLEARING mask (forest stands separated by glades, STYLE C4), min spacing per
  //      species, the usual avoidance (zones / paths / water / steep / sight line); MAIN is never forested. ----
  const FR = CP.forests;
  if (FR) {
    const seamD = (x, z) => { let m = 1e9; for (const sp of bp.seamPts) for (let i = 0; i < sp.length; i += 2) { const dx = sp[i][0] - x, dz = sp[i][1] - z; if (Math.abs(dx) < m && Math.abs(dz) < m) m = Math.min(m, Math.hypot(dx, dz)); } return m; };
    const lakeD = (x, z) => { let m = 1e9; for (const [px, pz] of lakePoly) m = Math.min(m, Math.hypot(px - x, pz - z)); return m; };
    const cliffNear = (x, z, r) => { for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; for (const d of r) if (slope(x + Math.cos(a) * d, z + Math.sin(a) * d) > 1.5) return true; } return false; };
    const glade = (x, z) => smoothstep(FR.clearing.lo, FR.clearing.hi, 0.5 + 0.5 * bp.noise.fbm(x * FR.clearing.freq + 17.7, z * FR.clearing.freq - 23.1, 3, 2, 0.5));
    const cores = Object.values(B.zones).map((l) => l.find((q) => q.kind === 'core')).filter(Boolean);
    const underCliff = (x, z) => { const h0 = bp.H(x, z); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; for (const d of [0.7, 1.4, FR.footClear]) if (bp.H(x + Math.cos(a) * d, z + Math.sin(a) * d) > h0 + 0.8) return true; } return false; };
    for (const id of bp.order) {
      if (id === 'main') continue;
      const rules = FR.rules.filter((R) => !R.pieces || R.pieces[id] != null);
      if (!rules.length) continue;
      const pc = bp.pieces[id], list = out[id].trees, rng = rngOf(id, 'forest'), grid = new Map(), gk = (x, z) => Math.floor(x / 1.2) + ',' + Math.floor(z / 1.2);
      for (const t of list) { const k = gk(t.x, t.z); (grid.get(k) || grid.set(k, []).get(k)).push(t); }
      const tooClose = (x, z, sep) => { const cx = Math.floor(x / 1.2), cz = Math.floor(z / 1.2); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const t of grid.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(t.x - x, t.z - z) < sep) return true; return false; };
      const loop = pc.loopWorld; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of loop) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const cs = FR.cell;
      for (let gz = z0; gz < z1; gz += cs) for (let gx = x0; gx < x1; gx += cs) {
        const x = gx + cs * rng(), z = gz + cs * rng(), u = rng(), us = rng(), usc = rng();
        if (pieceAt(bp, x, z) !== id) continue;
        let best = null, dens = 0;
        for (const R of rules) {
          let d = 0; const w = R.pieces ? R.pieces[id] : 1;
          if (R.kind === 'coast') { const dc = bp.dcAt(x, z); d = dc < R.dc[0] ? 0 : dc < R.dc[1] ? 1 : 1 - smoothstep(R.dc[1], R.dc[2], dc); }
          else if (R.kind === 'fill') d = 1;
          else if (R.kind === 'lakeshore') { if (inWater(x, z)) d = 0; else { const ld = inLoop(lakePoly, x, z) ? 1.0 : lakeD(x, z); d = ld < R.band[0] ? 0 : 1 - smoothstep(R.band[1], R.band[2], ld); } }   // land inside the shore = the islet
          else if (R.kind === 'cliff') d = slope(x, z) < 0.35 && cliffNear(x, z, R.probe) ? 1 : 0;
          d *= w; if (d > dens) { dens = d; best = R; }
        }
        if (!best || dens <= 0) continue;
        if (!best.noGlades) dens *= glade(x, z);
        if (u > dens) continue;
        if (blocked(x, z, CP.treeAvoid) || slope(x, z) > FR.maxSlope || bp.dcAt(x, z) < FR.coastIn || seamD(x, z) < FR.seamIn) continue;
        if (id === 'meadow' && inSight(x, z)) continue;
        if (best.clear && best.clear.some((c) => Math.hypot(x - c.at[0], z - c.at[1]) < c.r)) continue;
        if (cores.some((c) => Math.hypot(x - c.at[0], z - c.at[1]) < c.r + FR.coreClear)) continue;   // open space round every flat core (spec 6)
        const kind = us < best.pine ? 'pine' : 'round', sep = kind === 'pine' ? FR.sep.pine : FR.sep.round;
        if (tooClose(x, z, sep)) continue;
        if (FR.footClear && underCliff(x, z)) continue;   // cliff FEET stay open so the risers read (trees line the tops)
        const s = best.scale[0] + (best.scale[1] - best.scale[0]) * usc;
        const t = { x, z, kind, scale: kind === 'pine' ? s * 0.8 : s * 0.62, rot: rng() * TAU, forest: best.id || best.kind };
        list.push(t); const k = gk(x, z); (grid.get(k) || grid.set(k, []).get(k)).push(t);
      }
    }
  }
  // ---- per-piece scatter: bushes near clumps/edges, rocks at cliff bases + coast tops, flower drifts, grass, sheep ----
  for (const id of bp.order) {
    const pc = bp.pieces[id], O = out[id], rng = rngOf(id, 'scatter');
    const loop = pc.loopWorld; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of loop) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const pick = (test, n, minSep, tries = 60) => { const res = []; for (let t = 0; t < n * tries && res.length < n; t++) { const x = x0 + (x1 - x0) * rng(), z = z0 + (z1 - z0) * rng();
      if (pieceAt(bp, x, z) !== id) continue; if (!test(x, z)) continue; if (res.some((q) => Math.hypot(q[0] - x, q[1] - z) < minSep)) continue; res.push([x, z]); } return res; };
    if (id !== 'main') {
      const nB = (CP.bushesPerPiece[id] || 0), nR = (CP.rocksPerPiece[id] || 0);
      const nearTrees = (x, z) => O.trees.some((t) => { const d = Math.hypot(t.x - x, t.z - z); return d > 0.7 && d < 2.0; });
      // bush kinds by the position hash h6 (the painterly trees, plan Task 8): mostly flowering in the meadow and the cottage garden,
      // leafy with berries elsewhere. The old kind draw stays, its value unused, so every later draw of this stream keeps its place
      const bushKind = (h6) => (id === 'meadow' || id === 'cottage' ? (h6 < 0.6 ? 'bush_flowering' : h6 < 0.85 ? 'bush_a' : 'bush_berry') : h6 < 0.5 ? 'bush_a' : h6 < 0.85 ? 'bush_berry' : 'bush_flowering');
      for (const [x, z] of pick((x, z) => !blocked(x, z, 0.35) && slope(x, z) < 0.6 && edgeDist(id, x, z) > 0.6 && (nearTrees(x, z) || rng() < 0.25), nB, 0.9)) {
        rng(); O.bushes.push({ x, z, kind: bushKind(ph(x, z, 9623)), scale: 0.7 + 0.4 * rng(), rot: rng() * TAU }); }
      // rocks: seed spots at the foot of steep faces or on the coast top, then 1-3 rocks around each
      const cliffish = (x, z) => { let m = 0; for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]]) m = Math.max(m, slope(x + ox * 1.1, z + oz * 1.1)); return m; };
      const seeds = pick((x, z) => !blocked(x, z, 0.3) && slope(x, z) < 0.55 && (cliffish(x, z) > 1.0 || bp.dcAt(x, z) < 1.6), Math.ceil(nR / 2.2), 2.2, 120);
      for (const [sx, sz] of seeds) { const k = 1 + Math.floor(rng() * 3); for (let q = 0; q < k && O.rocks.length < nR; q++) { const x = sx + (rng() - 0.5) * 1.1, z = sz + (rng() - 0.5) * 1.1;
        if (pieceAt(bp, x, z) !== id || blocked(x, z, 0.2) || slope(x, z) > 0.8 || bp.dcAt(x, z) < 0.45) continue;
        O.rocks.push({ x, z, kind: rng() < 0.5 ? 'rock_b' : 'rock_a', scale: (q === 0 ? 0.55 : 0.32) + 0.35 * rng(), rot: rng() * TAU }); } }
      // v4: SHORE boulders (STYLE C5 "rocks cluster at cliff bases and shores"): clusters along the lake's waterline,
      // round a lake islet and along river banks; CLIFF-FOOT boulders: clusters at the foot of the risers
      const SR = CP.shoreRocks && CP.shoreRocks[id];
      const rockOk = (x, z) => pieceAt(bp, x, z) === id && !zoneHit(x, z, 0.15) && !nearPath(x, z, 0.12) && slope(x, z) < 1.4 && bp.dcAt(x, z) > 0.5;
      const cluster = (cx, cz, n, spread, big) => { for (let q = 0; q < n; q++) { const x = cx + (rng() - 0.5) * spread, z = cz + (rng() - 0.5) * spread; if (!rockOk(x, z)) continue;
        O.rocks.push({ x, z, kind: rng() < 0.5 ? 'rock_b' : 'rock_a', scale: (q === 0 ? big : big * 0.6) + 0.3 * rng(), rot: rng() * TAU, shore: true }); } };
      if (SR) {
        const lkF = bp.feats.find((f) => f.id === B.water.lake.feature);
        if (SR.lake && lkF) for (let j = 0; j < SR.lake; j++) { const i = Math.floor((j + 0.7 * rng()) * lakePoly.length / SR.lake) % lakePoly.length, [px, pz] = lakePoly[i];
          const ox = px - lkF.at[0], oz = pz - lkF.at[1], ol = Math.hypot(ox, oz) || 1, o = SR.band[0] + (SR.band[1] - SR.band[0]) * rng();
          cluster(px + ox / ol * o, pz + oz / ol * o, 1 + Math.floor(rng() * 3), 0.7, 0.5); }
        const isl = SR.islet && bp.feats.find((f) => f.id === SR.islet);
        if (isl) for (let j = 0; j < SR.isletN; j++) { const a = (j + 0.5 * rng()) / SR.isletN * TAU; let r = 0.3; while (r < 3 && bp.H(isl.at[0] + Math.cos(a) * r, isl.at[1] + Math.sin(a) * r) > lakeLvl) r += 0.05;
          cluster(isl.at[0] + Math.cos(a) * (r - 0.1), isl.at[1] + Math.sin(a) * (r - 0.1), 1 + Math.floor(rng() * 2), 0.4, 0.42); }
        if (SR.river) { const ch = bp.river; for (let j = 0; j < SR.river; j++) { const i = Math.floor((0.25 + 0.7 * (j + rng()) / SR.river) * (ch.pts.length - 1)), p = ch.pts[i], q2 = ch.pts[Math.min(ch.pts.length - 1, i + 1)];
          const tx = q2[0] - p[0], tz = q2[1] - p[1], tl = Math.hypot(tx, tz) || 1, side = rng() < 0.5 ? -1 : 1, off = ch.width(ch.s[i]) / 2 + 0.2 + 0.35 * rng();
          cluster(p[0] - tz / tl * off * side, p[1] + tx / tl * off * side, 1 + Math.floor(rng() * 2), 0.5, 0.4); } }
      }
      const CF = CP.cliffRocks && CP.cliffRocks[id];
      if (CF) {   // seed spots at the FOOT of a riser (ground rising > 0.8 u within 1.4 u), clusters of 2-4
        const rise = CF.rise || 0.8, foot = (x, z) => { const h0 = bp.H(x, z); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; for (const d of [0.6, 1.0, 1.4]) if (bp.H(x + Math.cos(a) * d, z + Math.sin(a) * d) > h0 + rise) return true; } return false; };
        const spots = pick((x, z) => !blocked(x, z, 0.3) && slope(x, z) < 0.4 && foot(x, z), CF.clusters, 1.6, 200);
        for (const [sx, sz] of spots) cluster(sx, sz, 2 + Math.floor(rng() * 3), 1.0, 0.6);
      }
    }
    // flower drifts (noise mask), grass tufts
    const drift = (x, z) => { const d = smoothstep(0.55, 0.7, 0.5 + 0.5 * bp.noise.fbm(x * 0.17 + 21.1, z * 0.17 - 3.3, 2, 2, 0.5)); return d * d; };
    const fcols = L.vegetation.groundCover.wildflower.colorTokens;
    for (const [x, z] of pick((x, z) => drift(x, z) > rng() && !blocked(x, z, 0.15) && slope(x, z) < 0.45 && bp.dcAt(x, z) > 0.5, CP.flowers[id] || 0, 0.22, 30))
      O.flowers.push({ x, z, color: fcols[Math.floor(rng() * fcols.length)], scale: 0.7 + 0.6 * rng() });
    for (const [x, z] of pick((x, z) => !blocked(x, z, 0.1) && slope(x, z) < 0.6 && bp.dcAt(x, z) > 0.4, CP.grass[id] || 0, 0.3, 20))
      O.grass.push({ x, z, scale: 0.6 + 0.6 * rng(), rot: rng() * TAU });
  }
  CP.sheep.forEach(([x, z, yaw], i) => out.meadow.sheep.push({ x, z, rot: yaw, scale: 0.55 + 0.06 * (i % 3) }));
  // ---- PLANTS (WORLDSEED-BRIEF plants & shapes): which tree VARIANT stands at each tree position (lib/plants.mjs builds the
  //      shapes), a woodland-edge SHRUB belt and COMPOSED FLOWER DRIFTS. Nothing above moves: these are new per-tree fields
  //      (variant / vscale / vyaw, and the species `asset`) and two new per-piece lists (shrubs, flowerPatches + their patches) that
  //      the moods draw (preset plants.enabled); 'Game (current)' keeps drawing the old trees / flowers. Own RNG streams (rngOf salts)
  //      and position hashes, so the earlier sequences are unchanged. ----
  {
    const PV = CP.plants || {}, allT = []; for (const id of bp.order) for (const t of out[id].trees) allT.push(t);
    const TGc = 2, tg = new Map(); for (const t of allT) { const k = Math.floor(t.x / TGc) + ',' + Math.floor(t.z / TGc); (tg.get(k) || tg.set(k, []).get(k)).push(t); }
    const treesNear = (x, z, r) => { const res = [], cx = Math.floor(x / TGc), cz = Math.floor(z / TGc), m = Math.ceil(r / TGc);
      for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) for (const t of tg.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(t.x - x, t.z - z) < r) res.push(t); return res; };
    const openDirs = (x, z) => { let o = 0; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, px = x + Math.cos(a) * 1.6, pz = z + Math.sin(a) * 1.6; if (pieceAt(bp, px, pz) && !treesNear(px, pz, 0.9).length) o++; } return o; };
    // tree variants by region + position hash: conifers fir (tall narrow) / pine (stout); broadleaf: saplings on the forest EDGE
    // (meadow -> shrubs -> small trees -> forest), spreading + round oaks where open, tall ovates + oaks inside the woods
    const VR = PV.variants || { firShare: { highland: 0.68, grove: 0.62, wetland: 0.3, islet: 0.35 }, firDefault: 0.5, edgeSapling: 0.38 };
    for (const id of bp.order) for (const t of out[id].trees) {
      const h1 = ph(t.x, t.z, 9101), h2 = ph(t.x, t.z, 9203), h3 = ph(t.x, t.z, 9311), nb = treesNear(t.x, t.z, 2.6).length - 1, open = openDirs(t.x, t.z), edge = nb >= 3 && open >= 3 && open <= 6;
      let v;
      if (t.kind === 'pine') v = h1 < (t.forest === 'cliffs' ? 0.72 : t.forest === 'lakeshore' ? 0.25 : (VR.firShare[id] ?? VR.firDefault)) ? 'fir' : 'pine';
      else if (t.layout) v = h1 < 0.5 ? 'oak' : 'spread';
      else if (edge && h1 < VR.edgeSapling) v = 'sapling';
      else if (nb < 3 || edge) v = h2 < 0.42 ? 'spread' : h2 < 0.84 ? 'oak' : 'ovate';
      else v = h2 < 0.46 ? 'ovate' : h2 < 0.86 ? 'oak' : 'spread';
      t.variant = v; t.vscale = +(0.92 + 0.16 * h3).toFixed(3); t.vyaw = +((h2 * 2 - 1) * Math.PI).toFixed(3);
    }
    // SPECIES by biome (the painterly trees, art/specs/2026-10-22-painterly-trees-design.md, plan Task 8): every composed tree gets
    // `asset`, a reskinned model (lib/species.mjs SPECIES / AUTUMN ids; plain strings here, this file stays import-free for the proof).
    // Conifers keep their variant's fir; broadleaf by piece: the highland's are birches on its highest ground (at or above the 70th
    // percentile of its trees' ground height) and firs below; wetland birches by the water (and some away from it); the grove all round
    // oaks / beeches and its saplings; beeches through the orchard; the odd birch in the meadow and the cottage garden. Then autumn
    // accents on the isles: an oak, beech or birch turns (h5 < AUTUMN_T, about 7 % of the isles' broadleaf). Position hashes only (h4
    // species, h5 autumn); the layout trees get none (the game places them)
    const BASE = { oak: 'tree_round_a', ovate: 'tree_round_b', spread: 'tree_spread', sapling: 'tree_sapling', fir: 'tree_pine_a', pine: 'tree_pine_b' };
    const AUTUMN_OF = { tree_round_a: 'tree_oak_autumn', tree_round_b: 'tree_beech_autumn', tree_birch: 'tree_birch_autumn' }, AUTUMN_T = 0.075;
    const speciesOf = (id, t, h4, hiP70) => {
      if (t.variant === 'fir' || t.variant === 'pine') return BASE[t.variant];
      if (id === 'highland') return bp.H(t.x, t.z) >= hiP70 ? 'tree_birch' : h4 < 0.5 ? 'tree_pine_a' : 'tree_pine_b';
      if (id === 'wetland') return waterWithin(t.x, t.z, 1.5) || h4 < 0.35 ? 'tree_birch' : BASE[t.variant];
      if (id === 'grove') return t.variant === 'sapling' ? 'tree_sapling' : h4 < 0.55 ? 'tree_round_a' : 'tree_round_b';
      if (id === 'orchard') return h4 < 0.6 ? 'tree_round_b' : BASE[t.variant];
      if (id === 'meadow' || id === 'cottage') return h4 < 0.1 ? 'tree_birch' : BASE[t.variant];
      return BASE[t.variant];   // islet, main
    };
    for (const id of bp.order) {
      const T = out[id].trees.filter((t) => !t.layout); if (!T.length) continue;
      const hs = T.map((t) => bp.H(t.x, t.z)).sort((a, b) => a - b), hiP70 = hs[Math.floor(0.7 * (hs.length - 1))];
      for (const t of T) { const a = speciesOf(id, t, ph(t.x, t.z, 9419), hiP70); t.asset = id !== 'main' && AUTUMN_OF[a] && ph(t.x, t.z, 9521) < AUTUMN_T ? AUTUMN_OF[a] : a; }
    }
    // no clones: a neighbour (< 1.5 u) with the same species (a layout tree: its variant's), final scale (+/- 0.02) and yaw (+/- 0.15 rad)
    // turns this tree on
    const spOf = (t) => t.asset || BASE[t.variant];
    for (let pass = 0; pass < 3; pass++) for (const t of allT) for (const o of treesNear(t.x, t.z, 1.5)) {
      if (o === t || spOf(o) !== spOf(t) || Math.abs(o.scale * o.vscale - t.scale * t.vscale) >= 0.02) continue;
      const ya = t.rot + t.vyaw, yb = o.rot + o.vyaw; if (Math.abs(Math.atan2(Math.sin(ya - yb), Math.cos(ya - yb))) < 0.15) t.vyaw = +(t.vyaw + 0.9).toFixed(3);
    }
    // woodland-edge shrub belt: jittered grid; partly-open ground (2-6 of 8 directions open at 1.6 u) within reach of trees =
    // forest edges and clearing rims; bigger mounds nearer the trees, low shrubs further out; noise gaps; never on a trunk. `asset`
    // = the card shrub drawn there (lib/plantkit.mjs SHRUBS): heather all over the highland, else the variant's mound / low
    const SB = PV.shrubs || { cell: 0.42, keep: 0.78, minSep: 0.44, trunkClear: 0.42, reach: [0.55, 1.85], scale: [0.6, 1.2], max: 260 };
    for (const id of bp.order) {
      const O = out[id], rng = rngOf(id, 'shrubs'), loop = bp.pieces[id].loopWorld, sg = new Map(), sk = (x, z) => Math.floor(x / SB.minSep) + ',' + Math.floor(z / SB.minSep);
      O.shrubs = []; let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of loop) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let gz = z0; gz < z1 && O.shrubs.length < SB.max; gz += SB.cell) for (let gx = x0; gx < x1 && O.shrubs.length < SB.max; gx += SB.cell) {
        const x = gx + SB.cell * rng(), z = gz + SB.cell * rng(), u = rng(), uv = rng(), us = rng();
        if (pieceAt(bp, x, z) !== id || blocked(x, z, 0.28) || slope(x, z) > 0.6 || edgeDist(id, x, z) < 0.5 || bp.dcAt(x, z) < 0.6) continue;
        const near = treesNear(x, z, SB.reach[1]); if (!near.length) continue;
        let d = 1e9; for (const t of near) d = Math.min(d, Math.hypot(t.x - x, t.z - z)); if (d < SB.trunkClear) continue;
        const open = openDirs(x, z); if (open < 2 || open > 6) continue;
        const gap = smoothstep(-0.25, 0.45, bp.noise.fbm(x * 0.45 + 5.1, z * 0.45 - 7.3, 2, 2, 0.5)); if (u > SB.keep * (0.4 + 0.6 * gap)) continue;
        const cx = Math.floor(x / SB.minSep), cz = Math.floor(z / SB.minSep); let clash = false;
        for (let a = -1; a <= 1 && !clash; a++) for (let b = -1; b <= 1 && !clash; b++) for (const s of sg.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(s.x - x, s.z - z) < SB.minSep) { clash = true; break; }
        if (clash) continue;
        const k = clamp((d - SB.reach[0]) / (SB.reach[1] - SB.reach[0]), 0, 1), sv = d < 1.05 || uv < 0.3 ? 'mound' : 'low';
        const s = { x, z, variant: sv, asset: id === 'highland' ? 'shrub_heather' : sv === 'mound' ? 'shrub_mound' : 'shrub_low', scale: +((SB.scale[1] + (SB.scale[0] - SB.scale[1]) * k) * (0.85 + 0.3 * us)).toFixed(3), rot: +(uv * TAU).toFixed(3) };
        O.shrubs.push(s); const kk = sk(x, z); (sg.get(kk) || sg.set(kk, []).get(kk)).push(s);
      }
    }
    // composed flower drifts: patch centres on open ground (the old drift mask's clumping style), each an elongated drift
    // aligned with a slow noise field, of ONE colour scheme (two palette colours split by a wavy boundary along the drift + a
    // few strays); schemes by place: warm gold / coral by the garden plots, pink + cream round the farmhouse, else per piece
    const FP = PV.flowers || {};
    const plots = out.main.props.filter((p) => p.asset === 'plot'), gardenC = plots.length ? [plots.reduce((s, p) => s + p.x, 0) / plots.length, plots.reduce((s, p) => s + p.z, 0) / plots.length] : [0, 0];
    const nearRules = [{ scheme: 'pink', at: [G.HOUSE.x, G.HOUSE.z], r: FP.houseR || 3.6 }, { scheme: 'warm', at: gardenC, r: FP.gardenR || 5.2 }];
    const drift = (x, z) => smoothstep(0.45, 0.7, 0.5 + 0.5 * bp.noise.fbm(x * 0.17 + 21.1, z * 0.17 - 3.3, 2, 2, 0.5));
    for (const id of bp.order) {
      const O = out[id], rng = rngOf(id, 'fpatch'), want = CP.flowers[id] || 0, loop = bp.pieces[id].loopWorld, fgr = new Map(), fk = (x, z) => Math.floor(x / 0.3) + ',' + Math.floor(z / 0.3);
      O.flowerPatches = []; O.patches = []; if (!want) continue;
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of loop) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const minSep = FP.minSep || 0.13, defaults = (FP.defaults && FP.defaults[id]) || ['whiteViolet', 'gold'];
      const free = (x, z) => { const cx = Math.floor(x / 0.3), cz = Math.floor(z / 0.3); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const f of fgr.get((cx + a) + ',' + (cz + b)) || []) if (Math.hypot(f.x - x, f.z - z) < minSep) return false; return true; };
      for (let tries = 0; tries < 3000 && O.flowerPatches.length < want; tries++) {
        // (MAIN first tries round the farmhouse / garden so their schemes are there; then anywhere on the piece)
        const seeded = id === 'main' && tries < 240, q = seeded ? nearRules[tries % nearRules.length] : null, sa = rng() * TAU, sr = rng();
        const x = seeded ? q.at[0] + Math.cos(sa) * q.r * (0.35 + 0.6 * sr) : x0 + (x1 - x0) * rng(), z = seeded ? q.at[1] + Math.sin(sa) * q.r * (0.35 + 0.6 * sr) : z0 + (z1 - z0) * rng(), gate = seeded ? 0 : rng();
        if (pieceAt(bp, x, z) !== id || blocked(x, z, 0.35) || slope(x, z) > 0.4 || bp.dcAt(x, z) < 0.9 || treesNear(x, z, 0.95).length) continue;
        if (gate > 0.25 + drift(x, z) || O.patches.some((p) => Math.hypot(p.x - x, p.z - z) < (FP.patchSep || 2.4))) continue;
        const rule = nearRules.find((q) => id === 'main' && Math.hypot(q.at[0] - x, q.at[1] - z) < q.r), scheme = rule ? rule.scheme : defaults[Math.floor(rng() * defaults.length) % defaults.length];
        const S = (FP.schemes && FP.schemes[scheme]) || [['SoftCream', 0.5], ['Lavender', 0.5]];
        const th = Math.PI * bp.noise.fbm(x * 0.06 + 9.7, z * 0.06 - 4.4, 2, 2, 0.5) * 2, len = 1.4 + 1.9 * rng(), wid = 0.45 + 0.55 * rng(), ph0 = rng() * TAU;
        const n = Math.min(want - O.flowerPatches.length, Math.round(16 + 20 * rng())), patch = { x: +x.toFixed(3), z: +z.toFixed(3), scheme, len: +len.toFixed(2), wid: +wid.toFixed(2), theta: +th.toFixed(3), n: 0 };
        const cut = 1 - 2 * S[1][1], pf = [];   // cut: the secondary colour's share of the drift (wavy boundary along it)
        for (let k = 0; k < n * 14 && pf.length < n; k++) {
          const u = (rng() + rng() + rng()) / 1.5 - 1, v = rng() + rng() - 1, stray = rng(), sc = rng();
          const px = x + Math.cos(th) * u * len / 2 - Math.sin(th) * v * wid / 2, pz = z + Math.sin(th) * u * len / 2 + Math.cos(th) * v * wid / 2;
          if (pieceAt(bp, px, pz) !== id || blocked(px, pz, 0.12) || slope(px, pz) > 0.45 || bp.dcAt(px, pz) < 0.5 || !free(px, pz) || treesNear(px, pz, 0.34).length) continue;
          let sec = u + 0.45 * Math.sin(v * 2.4 + ph0) > cut; if (stray < 0.06) sec = !sec;
          const f = { x: +px.toFixed(3), z: +pz.toFixed(3), color: S[sec ? 1 : 0][0], scale: +(0.75 + 0.5 * sc).toFixed(3), patch: O.patches.length };
          pf.push(f); const kk = fk(f.x, f.z); (fgr.get(kk) || fgr.set(kk, []).get(kk)).push(f);
        }
        if (pf.length >= 8) { patch.n = pf.length; O.patches.push(patch); for (const f of pf) O.flowerPatches.push(f); }   // a drift, never a few strays
        else for (const f of pf) { const kk = fk(f.x, f.z); fgr.set(kk, fgr.get(kk).filter((q) => q !== f)); }
      }
    }
    // ---- GROUND COVER (the living-ground spec, art/specs/2026-10-22-flowers-living-ground-design.md): the painterly plant kit
    //      (lib/plantkit.mjs) in PATCHES by area, replacing the even grass_tuft sprinkle and the flower_head drifts in the export.
    //      coverField (shared with the lawn bake) splits open ground into soft patches. The farm stays a tidy lawn: sparse short
    //      grass, clover patches with the odd daisy or buttercup. The wild isles get tall-grass and seed-head patches, wildflower
    //      drifts (one kind, two at the edges), clover in the low ground, perennial clumps where plants gather (beside rocks, at
    //      tree edges, along path sides) and ferns in the shade of tree groups; tall grass thickens along water. A jittered grid
    //      draws one type per cell from the field's densities (items per u^2); own RNG stream, so every list above is unchanged.
    //      MAIN (the ground-vegetation plan, Task 2): zoned clusters instead (clusterCover, on the zone field and its own 'cluster'
    //      stream): a tidy lawn round the house, the plots, the paths and the slots, tuft patches and clover at the wild edges and between
    //      the trees. The wild isles keep the cell draw (until plan Task 12). ----
    const CV = { ...COVER, ...(CP.cover || {}) }, WF = ['flower_daisy', 'flower_buttercup', 'flower_poppy', 'flower_cornflower'];
    const scaleOf = (asset, u) => { const [a, b] = CV.scale[asset] || CV.scale.default; return +(a + (b - a) * u).toFixed(3); };
    const fwCover = farmWaterHit(bp, water), kcCover = keepClearHit(bp, water);   // (the drops at the end, which MAIN's clusters keep clear of)
    const GG = gameGround(A, L);   // the game's ground (the shipped bake: grid + drawn top), for the grounding below
    for (const id of bp.order) {
      const O = out[id], rng = rngOf(id, 'cover'), wild = id !== 'main', D = CV.wild, loop = bp.pieces[id].loopWorld, cell = CV.cell, area = cell * cell;
      O.cover = [];
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const [x, z] of loop) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      // GROUNDING (plan Task 3): the export carries no per-item y, so an item stands at height(x, z) + the kit's yOffset (-0.01); on
      // ground that varies more than 0.04 u under its +/-0.1 u footprint (9 samples) one edge hovers or buries. MAIN's members go through
      // it in `ok`, so a rejected member is retried or replaced and the zones' quotas refill. The wild isles' cell draw keeps its every
      // draw (a rejection inside `ok` would move the perennials' counted loop on): their items are dropped after the draw, below.
      // And (plan Task 7, GR14) where the game's height grid and the baked top drawn under the item disagree by more than
      // GAME_GROUND_TOL (gameGround: the highland's terraces, the wetland's banks, the islet's headland), the item would float or sink
      // against the drawn ground whatever its footprint: it goes the same way (a hole's edge, where either is missing, keeps it)
      const flat = (x, z) => { let lo = Infinity, hi = -Infinity;
        for (const dx of [-0.1, 0, 0.1]) for (const dz of [-0.1, 0, 0.1]) { const h = bp.H(x + dx, z + dz); if (h < lo) lo = h; if (h > hi) hi = h; }
        if (hi - lo > 0.04 + 1e-9) return false;
        const g = GG.gap(id, x, z); return g === null || g <= GAME_GROUND_TOL; };
      const ok = (x, z, pad, trunk) => pieceAt(bp, x, z) === id && slope(x, z) < 0.6 && bp.dcAt(x, z) > 0.45 && !treesNear(x, z, trunk).length && !blocked(x, z, pad) &&
        (wild || (!CV.moved.some(([mx, mz, r]) => Math.hypot(x - mx, z - mz) < r + pad) && flat(x, z)));
      const okDry = (x, z, pad, trunk) => pieceAt(bp, x, z) === id && slope(x, z) < 0.6 && bp.dcAt(x, z) > 0.45 && !treesNear(x, z, trunk).length && !blockedDry(x, z, pad) &&
        !CV.moved.some(([mx, mz, r]) => Math.hypot(x - mx, z - mz) < r + pad) && flat(x, z);   // (MAIN's ok, blind to the legacy farm water: the pond's reeds, plan Task 10)
      if (!wild) {   // MAIN: the zone field on this composition (cached on it: the tests and later stages read the same one)
        const zf = groundZones(bp, { pieces: out }, water), GC = groundConfig(A);
        const res = clusterCover(bp, id, zf, rngOf(id, 'cluster'), { ok, ph, CV, GC, inSight, gap: (x, z) => GG.gap(id, x, z),
          drop: (x, z) => !!((fwCover && fwCover(x, z, 'cover')) || (kcCover && kcCover(x, z, 'cover'))),
          pond: water.main.pond.legacy ? { outline: water.main.pond.outline, line: water.main.stream.line || [], ok: okDry, keep: (x, z) => !!(kcCover && kcCover(x, z, 'cover')) } : null });   // (keep: the keep-clear discs alone; the reeds stand at the water's edge, GR30)   // (plan Task 10: the teardrop, when the farm water is the art's)
        for (const it of res.items) it.tint = coverTint(GC, ph, it.asset, it.x, it.z, it.asset === 'clover_patch' ? zf.at(id, it.x, it.z).U : null);   // (the tint, last: no stream moves)
        // (plan Task 10) the pond's reeds ({ x, z, height, head, cl }: the game's Reeds, exported as pieces.main.reeds, GV3) and its stretches
        // ({ k, i0, i1 }: teardrop edges i0..i1; internal, the cover test's)
        O.cover = res.items; O.coverClusters = res.clusters; O.reeds = res.reeds; O.pondStretches = res.stretches; continue;
      }
      const add = (asset, x, z, us, ur) => O.cover.push({ asset, x, z, rot: +(ur * TAU).toFixed(3), scale: scaleOf(asset, us) });
      const r3 = (v) => +v.toFixed(3);   // positions are rounded BEFORE their checks: the stored point is the checked one
      // water within 0.9 u: looked up on a 0.45 u grid made once per piece (a fine-cell test is several polygon walks)
      const WG = 0.45, wcols = Math.ceil((x1 - x0) / WG) + 1, wetG = new Uint8Array(wild ? wcols * (Math.ceil((z1 - z0) / WG) + 1) : 0);
      if (wild) for (let j = 0; j * WG <= z1 - z0 + WG; j++) for (let i = 0; i < wcols; i++) { const x = x0 + i * WG, z = z0 + j * WG; if (j * wcols + i < wetG.length && pieceAt(bp, x, z) === id && waterWithin(x, z, 0.9 + WG * 0.7)) wetG[j * wcols + i] = 1; }
      const wetAt = (x, z) => wild && wetG[Math.round((z - z0) / WG) * wcols + Math.round((x - x0) / WG)] === 1;
      const perOf = (u) => u < CV.perennials.mix[0] ? 'perennial_lavender' : u < CV.perennials.mix[0] + CV.perennials.mix[1] ? 'perennial_foxglove' : 'perennial_oxeye';
      // (the most a cell can hold: no draw above it can place anything, so it skips the field; the draws stay the same)
      const most = area * (D.short + Math.max((D.tall || 0) + (D.seed || 0) + (D.perennial || 0), (D.drift || 0) + (D.perennial || 0), D.clover + (D.cloverFlowers || 0)));
      for (let gz = z0; gz < z1; gz += cell) for (let gx = x0; gx < x1; gx += cell) {
        const x = r3(gx + cell * rng()), z = r3(gz + cell * rng()), u = rng(), us = rng(), ur = rng(), uk = rng();
        if (u >= most || pieceAt(bp, x, z) !== id) continue;
        const f = coverField(bp.noise, x, z, wild), wet = f.tall < 1 && wetAt(x, z) ? CV.wetTall : 0;
        // [asset, items per u^2 here]: the short lawn grass thins out under the patches
        const tallD = (D.tall || 0) * Math.max(f.tall, wet) * (1 - 0.45 * f.seed);
        const opts = [['grass_short', D.short * (1 - Math.max(f.tall, f.drift, f.clover) * 0.7)], ['grass_tall', tallD], ['grass_seedhead', (D.seed || 0) * f.seed],
          ['clover_patch', D.clover * f.clover], [null, (D.drift || 0) * f.drift], [null, (D.cloverFlowers || 0) * f.clover], [null, (D.perennial || 0) * Math.max(f.drift, 4 * f.tall * (1 - f.tall))]];
        let acc = 0, pick = -1; for (let k = 0; k < opts.length; k++) { acc += opts[k][1] * area; if (u < acc) { pick = k; break; } }
        if (pick < 0) continue;
        let asset = opts[pick][0];
        if (pick === 4) { const K = CV.kinds, b = f.kind < K[0] ? 0 : f.kind < K[1] ? 1 : f.kind < K[2] ? 2 : 3; asset = WF[uk < 0.2 ? (b + (uk < 0.1 ? 1 : 3)) % 4 : b]; }   // a drift's kind from the slow field; a fifth from a neighbour
        else if (pick === 5) asset = uk < 0.7 ? 'flower_daisy' : 'flower_buttercup';   // the odd flower in a clover patch
        else if (pick === 6) asset = f.drift > 0.5 ? (uk < 0.6 ? 'perennial_oxeye' : 'perennial_lavender') : perOf(uk);   // ox-eye / lavender among the flowers, any at a tall edge
        if (!ok(x, z, CV.pad[asset] ?? CV.pad.default, 0.3)) continue;
        add(asset, x, z, us, ur);
      }
      if (!wild) continue;
      // perennial clumps where plants gather: beside rocks, at tree edges (1-2 u out, open ground), along path sides; ferns in the
      // shade of tree groups (2+ trees within 1.6 u)
      const per = CV.perennials;
      for (const r of O.rocks) { if (rng() > per.byRock) continue; const a = rng() * TAU, d = 0.45 + 0.45 * rng(), x = r3(r.x + Math.cos(a) * d * (0.6 + r.scale)), z = r3(r.z + Math.sin(a) * d * (0.6 + r.scale)), u = rng(), us = rng(), ur = rng();
        if (ok(x, z, CV.pad.perennial, 0.35)) add(perOf(u), x, z, us, ur); }
      const nP = Math.round(per.perArea * (x1 - x0) * (z1 - z0));
      for (let t = 0, n = 0; t < nP * 30 && n < nP; t++) { const x = r3(x0 + (x1 - x0) * rng()), z = r3(z0 + (z1 - z0) * rng()), u = rng(), us = rng(), ur = rng();
        const near = treesNear(x, z, 2.0), edge = near.length && near.every((q) => Math.hypot(q.x - x, q.z - z) > 1.0) && openDirs(x, z) >= 3, side = nearPath(x, z, 0.7) && !nearPath(x, z, 0.3);
        if (!(edge || side) || !ok(x, z, CV.pad.perennial, 0.35)) continue;
        add(side && u < 0.5 ? 'perennial_lavender' : perOf(u), x, z, us, ur); n++; }
      const fernP = CV.fern * area;
      for (let gz = z0; gz < z1; gz += cell) for (let gx = x0; gx < x1; gx += cell) { const x = r3(gx + cell * rng()), z = r3(gz + cell * rng()), u = rng(), us = rng(), ur = rng();
        if (u > fernP || treesNear(x, z, 1.6).length < 2 || !ok(x, z, CV.pad.fern_clump, 0.32)) continue; add('fern_clump', x, z, us, ur); }
      // grounding: the draws above are untouched, only the item goes. Perennials gather by rocks, tree edges and path sides, which are
      // steep ground: each one that goes is replaced by one more from its own stream (same edge / side rule, flat ground), so a wild isle
      // keeps its perennials (V7 wants >= 10 on every one) and no other stream moves
      const nPer = (l) => l.reduce((s, it) => s + (it.asset.startsWith('perennial_') ? 1 : 0), 0), per0 = nPer(O.cover);
      O.cover = O.cover.filter((it) => flat(it.x, it.z));
      const lost = per0 - nPer(O.cover), rg = rngOf(id, 'ground');
      // (plan Task 5: a piece that has perennials keeps at least BATCH_MIN of them, so they can form one batch: its top-up also covers the
      // shortfall, from the same stream. Every piece but one seed's orchard is already above it, so only that one gets more)
      const want = per0 > 0 ? Math.max(lost, BATCH_MIN - (per0 - lost)) : lost;
      for (let t = 0, n = 0; t < want * 60 && n < want; t++) { const x = r3(x0 + (x1 - x0) * rg()), z = r3(z0 + (z1 - z0) * rg()), u = rg(), us = rg(), ur = rg();
        const near = treesNear(x, z, 2.0), edge = near.length && near.every((q) => Math.hypot(q.x - x, q.z - z) > 1.0) && openDirs(x, z) >= 3, side = nearPath(x, z, 0.7) && !nearPath(x, z, 0.3);
        if (!(edge || side) || !ok(x, z, CV.pad.perennial, 0.35) || !flat(x, z)) continue;
        add(side && u < 0.5 ? 'perennial_lavender' : perOf(u), x, z, us, ur); n++; }
      // the near-white tint on every item (plan Task 4), from position hashes: no stream moves
      const GCw = groundConfig(A); for (const it of O.cover) it.tint = coverTint(GCw, ph, it.asset, it.x, it.z, null);
    }
  }
  // ---- paths v2: drop the V21 scatter the rerouted paths now run over (segment distance to the NEW centreline < local half width + the
  //      category's own clearance pad - 0.03). Where a new route follows its V21 line the items cleared that line by >= their pad
  //      (minus < 0.015 for the 0.25 u sampling), so nothing there is touched; only where a route moved can an item go. ----
  if (drawnPaths.length) {
    const segs = []; for (const D of drawnPaths) for (let i = 0; i < D.pts.length - 1; i++) { const a = D.pts[i], b = D.pts[i + 1];
      segs.push([a[0], a[1], b[0], b[1], D.wOf ? Math.max(D.wOf(a), D.wOf(b)) : D.width]); }
    const onNew = (x, z, pad) => segs.some(([ax, az, bx, bz, w]) => { if (Math.min(ax, bx) - 2 > x || Math.max(ax, bx) + 2 < x || Math.min(az, bz) - 2 > z || Math.max(az, bz) + 2 < z) return false;
      const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t) < w / 2 + pad - 0.03; });
    const PAD = { trees: CP.treeAvoid, bushes: 0.35, rocks: 0.2, flowers: 0.15, grass: 0.1, shrubs: 0.28, flowerPatches: 0.12, cover: 0.1 };
    for (const id of bp.order) { const O = out[id];
      for (const [k, pad] of Object.entries(PAD)) if (O[k]) O[k] = O[k].filter((it) => it.layout || !onNew(it.x, it.z, k === 'rocks' && it.shore ? 0.12 : pad)); }
  }
  // ---- water rev 1: drop the V21 scatter that the art-owned farm water and flowerbed 8's new spot now cover (farmWaterHit). Everything
  //      else stays item for item, every RNG stream V21's. ----
  const fwHit = farmWaterHit(bp, water);
  if (fwHit) { const O = out.main; for (const k of FARM_WATER_CATS) if (O[k]) O[k] = O[k].filter((it) => it.layout || !fwHit(it.x, it.z, k)); }
  // ---- keep-clear (idle-economy art 3 / 4): game spots added after V21 stay bare: B.keepClear discs (the woodshed) and the wetland
  //      jetty's deck and shed patch (lakeJetty), each + its pad; dropped at the end, so every other placement keeps its RNG stream ----
  const hit = keepClearHit(bp, water);
  if (hit) for (const id of bp.order) { const O = out[id]; for (const k of ['trees', 'bushes', 'shrubs', 'rocks', 'flowers', 'grass', 'cover', 'flowerPatches']) if (O[k]) O[k] = O[k].filter((it) => it.layout || !hit(it.x, it.z, k)); }
  // ---- batches (plan Task 5, V18): every cover kind on a piece is one InstancedMesh, so a kind of a handful of items is a draw call that
  //      buys nothing. After every drop above (so the count is the final one); no RNG, no item moves, the tint stays. ----
  for (const id of bp.order) if (out[id].cover) out[id].cover = consolidateBatches(out[id].cover);
  // tree heights for the occlusion check (tree_round_a 2.23 u, pine 1.93 u at scale 1)
  for (const id of bp.order) for (const t of out[id].trees) t.h = (t.kind === 'pine' ? 1.93 : 2.23) * t.scale;
  return { pieces: out, water, pathSamples };
}

// ---- the GROUND ZONES (the ground-vegetation spec art/specs/2026-10-25-ground-vegetation-design.md §3, plan Task 1): one field over
//      every piece. Each point is A (tidy: round the house, the garden, the buildings and every slot where the game stands it now, and
//      inside the animal yards), B (the wild edge), C (the shade pools of the trees that are always there), D (the water's edge), E (the
//      path edge), the open lawn between, or null (nothing grows there: off the piece, in the water or its wet band, on a path, inside
//      a spot's footprint); the first match of E, D, A, C, B wins (GROUND.zone). Distances are exact, from 1 u bucket grids of segments
//      and discs per piece (no raster). MAIN's cover reads it (clusterCover, from composeBlueprint's cover block, which builds the
//      field on its own `out`: so the field caches the trees as they stand at the cover block). ----
// which frozen game.* slot each COVER.moved entry stands in for (layout.ts aside(), in COVER.moved's order; game.* is the v3 snapshot,
// whose STATIC_TREES still has the pine the game dropped, so its tree indices run one past the game's from [4]), and the keep-clear
// discs that stand in for a game.* slot (world.config blueprint.keepClear)
const GROUND_MOVED = ['FRUIT_TREES:0', 'FRUIT_TREES:5', 'FLOWERBEDS:0', 'FLOWERBEDS:1', 'LANTERNS:3', 'BENCH', 'BUSHES:2', 'STATIC_TREES:2',
  'STATIC_TREES:5', 'STATIC_TREES:7', 'STATIC_TREES:8', 'ROCKS:0', 'ROCKS:3'];
const GROUND_REPLACES = { bush_1: 'BUSHES:1' };
// a segment from a to b, ra u thick at a and rb at b (a disc: a = b); its box holds all of it
const gSeg = (ax, az, bx, bz, ra, rb) => { const r = Math.max(ra, rb); return { ax, az, bx, bz, ra, rb, x0: Math.min(ax, bx) - r, z0: Math.min(az, bz) - r, x1: Math.max(ax, bx) + r, z1: Math.max(az, bz) + r }; };
const gSegD = (s, x, z) => { const dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz, t = L2 > 0 ? clamp(((x - s.ax) * dx + (z - s.az) * dz) / L2, 0, 1) : 0;
  return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t) - (s.ra + (s.rb - s.ra) * t); };   // (signed: < 0 inside)
// a spot's signed distance (< 0 inside its footprint): a disc, a capsule or a rectangle
const gSpotD = (s, x, z) => {
  if (s.rect) { const [x0, z0, x1, z1] = s.rect, ox = Math.max(x0 - x, 0, x - x1), oz = Math.max(z0 - z, 0, z - z1); return ox > 0 || oz > 0 ? Math.hypot(ox, oz) : -Math.min(x - x0, x1 - x, z - z0, z1 - z); }
  if (s.ax !== undefined) return gSegD({ ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, ra: s.r, rb: s.r }, x, z);
  return Math.hypot(x - s.x, z - s.z) - s.r;
};
const gSpotBox = (s, h) => (s.rect ? [s.rect[0] - h, s.rect[1] - h, s.rect[2] + h, s.rect[3] + h] : s.ax !== undefined
  ? [Math.min(s.ax, s.bx) - s.r - h, Math.min(s.az, s.bz) - s.r - h, Math.max(s.ax, s.bx) + s.r + h, Math.max(s.az, s.bz) + s.r + h] : [s.x - s.r - h, s.z - s.r - h, s.x + s.r + h, s.z + s.r + h]);
const gBox = (pts) => { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, z0, x1, z1]; };
// a 1 u bucket grid over the box bb. Each item has a box (x0, z0, x1, z1) holding all of it and goes into every cell the box overlaps.
// scan(x, z, fn, done, max): fn(item) for the items in rings of cells round (x, z), ring by ring, until done(k) after ring k (or ring
// max): an item first met in ring k is >= k - 1 u away, so a signed distance (never less than the distance to the item's box) whose
// least so far is within k u is exact. nearest(x, z, dist, max): that least dist(item, x, z), or max. cell(x, z, fn): fn(item) for every
// item whose box overlaps the cell holding (x, z)
function groundBuckets(bb, items) {
  const gx = Math.floor(bb[0]), gz = Math.floor(bb[1]), cols = Math.ceil(bb[2] - gx) + 1, rows = Math.ceil(bb[3] - gz) + 1, cells = new Array(cols * rows);
  let n = 0;
  for (const it of items) {
    if (it.x1 < bb[0] || it.x0 > bb[2] || it.z1 < bb[1] || it.z0 > bb[3]) continue;
    const i0 = Math.max(0, Math.floor(it.x0 - gx)), i1 = Math.min(cols - 1, Math.floor(it.x1 - gx)), j0 = Math.max(0, Math.floor(it.z0 - gz)), j1 = Math.min(rows - 1, Math.floor(it.z1 - gz));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (cells[j * cols + i] || (cells[j * cols + i] = [])).push(it);
    n++;
  }
  const scan = (x, z, fn, done, max) => {
    if (!n) return;
    const ci = Math.floor(x - gx), cj = Math.floor(z - gz);
    const visit = (i, j) => { if (i < 0 || j < 0 || i >= cols || j >= rows) return; const L = cells[j * cols + i]; if (L) for (let q = 0; q < L.length; q++) fn(L[q]); };
    for (let k = 0; ; k++) {
      if (k === 0) visit(ci, cj);
      else { for (let i = ci - k; i <= ci + k; i++) { visit(i, cj - k); visit(i, cj + k); } for (let j = cj - k + 1; j < cj + k; j++) { visit(ci - k, j); visit(ci + k, j); } }
      if (done(k) || k >= max) return;
    }
  };
  return {
    n, scan,
    cell(x, z, fn) { const i = Math.floor(x - gx), j = Math.floor(z - gz); if (i < 0 || j < 0 || i >= cols || j >= rows) return; const L = cells[j * cols + i]; if (L) for (let q = 0; q < L.length; q++) fn(L[q]); },
    nearest(x, z, dist, max) { let best = max; scan(x, z, (it) => { const d = dist(it, x, z); if (d < best) best = d; }, (k) => best <= k, max); return best; },
  };
}
// groundConfig(A) -> GROUND with archipelago.composition.ground over it, key by key and one level deep (a partial `halo` override keeps
// the other halos; arrays and per-piece `spots` lists are replaced whole)
export function groundConfig(A) {
  const O = ((A && A.composition) || {}).ground || {}, out = { ...GROUND }, plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  for (const [k, v] of Object.entries(O)) out[k] = plain(v) && plain(GROUND[k]) ? { ...GROUND[k], ...v } : v;
  return out;
}
// groundZones(bp, comp, water) -> the field (cached per bp and comp.pieces; comp = { pieces } with the trees and paths placed, so
// composeBlueprint's own `out` serves). All in world x, z:
//   at(id, x, z) -> { zone, dPath, dWater, dSpot, aHalo, U, W, dRim, dClear }: zone 'A' | 'B' | 'C' | 'D' | 'E' | 'lawn' | null; dPath to the
//      nearest path edge, dWater to the nearest shore, dSpot to the nearest spot's footprint (each < 0 inside: on the path, in the water,
//      inside the spot, a tidy yard included), aHalo > 0 inside an A halo, U the shade pools (0-1), W the wild edge (0-1), dRim to the
//      piece's own outline on MAIN (< 0 off it), bp.dcAt elsewhere. Exact on the piece out to GROUND.reach. dClear: to the nearest
//      clear spot's footprint (< 0 inside one). Exact only inside a footprint (outside, the scan may stop before the nearest clear
//      spot: an upper bound); the lawn paint's A fade reads it only there (plan Task 6)
//   pools(id) -> [{ x, z, r, tx, tz }]: each shade pool's centre and base radius R (its radius is R x lerp(GROUND.pools.size, n)), and its trunk
//   spots(id) -> [{ what, keep, halo, x, z, r } | { what, keep, halo, ax, az, bx, bz, r } | { what, keep, halo, rect: [x0, z0, x1, z1] }]
//   shore(id) -> [[x, z], ...][]: the shore polylines dWater is measured from (outlines closed; the ribbons' two banks), each array
//      naming its water in `.what`: 'teardrop', 'legacy bank', 'stream', 'legacy stream' on MAIN; 'lake', 'lake islet', 'river',
//      'outflow', 'tarn', 'tarn islet', 'hot spring', 'hot spring islet' elsewhere
// The paths: every piece's runs (with their local widths; MAIN's layout dirt paths among them) and MAIN's STONE_PATHS. The water: on MAIN
// the teardrop and its stream (the art's), joined with the legacy blob (its bank, r + waterTs.pondBank) and the legacy stream until the
// game retires them; elsewhere blueprintWater's lake, tarn and hot spring (in the outline and below level + GROUND.still, so an islet is
// land: its shore is traced too) and the river and outflow. The spots: on MAIN the house, the garden fence's rectangle, the windmill,
// greenhouse and well (BLOCKERS r) and every layout.ts SLOT_DISCS slot where the game stands it now (game.* with COVER.moved and
// GROUND.now, the keep-clear camp, stand, woodshed and bush_1; the static trees on MAIN's top), plus composition.ground.spots (the yards,
// tidy); MAIN's STONE_PATHS as GROUND.now lays them (ruling GR9); on the
// wild pieces their zones (cores tidy; buildings and the other flat zones clear; the animals' ranges and the wildflower spot left as
// they are), the wetland jetty's deck and shed, and composition.ground.spots. Spots and pools count across the seams
export function groundZones(bp, comp, water) {
  const key = comp.pieces || comp, cache = bp._groundZones || (bp._groundZones = new WeakMap());
  if (cache.has(key)) return cache.get(key);
  const A = bp.config, B = A.blueprint, G = A.game, P = comp.pieces, GR = groundConfig(A), R = GR.reach, PL = GR.pools, ZN = GR.zone;
  const W0 = water || comp.water || blueprintWater(bp);
  const chain = (pts, half, out) => { for (let i = 0; i < pts.length - 1; i++) out.push(gSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], half(i), half(i + 1))); return out; };
  const ring = (pts, out) => { for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; out.push(gSeg(a[0], a[1], b[0], b[1], 0, 0)); } return out; };
  const closed = (pts) => [...pts.map((p) => [p[0], p[1]]), [pts[0][0], pts[0][1]]];
  const banks = (pts, half) => { const l = [], r = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / dl, nz = (b[0] - a[0]) / dl, h = half(i);
      l.push([pts[i][0] + nx * h, pts[i][1] + nz * h]); r.push([pts[i][0] - nx * h, pts[i][1] - nz * h]); }
    return [l, r]; };

  // ---- paths ----
  const pathSegs = [];
  for (const id of bp.order) for (const p of P[id].paths || []) chain(p.pts, (i) => (p.widths ? p.widths[i] : p.width) / 2, pathSegs);
  const NOW = GR.now || {};   // (ruling GR9: where the game has its slots and stepping stones now, over the frozen snapshot)
  for (const p of G.STONE_PATHS.map((q, i) => (NOW.stonePaths || {})[i] || q)) chain(resamplePolyline(catmullRomCentripetal(p, 6), 0.2), () => GR.stonePath / 2, pathSegs);

  // each piece's runs, whole: { id, pts, hw(i) (the half width at point i), cum (the arc length to each point), L } (MAIN's STONE_PATHS last, as
  // 'stone<k>': the pebble runs of the cover, plan Task 9, walk them)
  const runsOf = {}, mkRun = (rid, pts, hw) => { const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return { id: rid, pts, hw, cum, L: cum[cum.length - 1] }; };
  for (const id of bp.order) runsOf[id] = (P[id].paths || []).map((p) => mkRun(p.id, p.pts, (i) => (p.widths ? p.widths[i] : p.width) / 2));
  G.STONE_PATHS.map((q, i) => (NOW.stonePaths || {})[i] || q).forEach((p, k) => runsOf.main.push(mkRun('stone' + k, resamplePolyline(catmullRomCentripetal(p, 6), 0.2), () => GR.stonePath / 2)));

  // ---- water: segs (signed: discs and ribbons < 0 inside; outline edges unsigned), bodies (outline polygons: inside = in the water;
  //      still water only below level + still), shore (the polylines) ----
  const lab = (pl, what) => { pl.what = what; return pl; };   // (each shore polyline names its water: shore(id) keeps the name)
  const ribbon = (Wt, pts, half, what) => { chain(pts, half, Wt.segs); Wt.shore.push(...banks(pts, half).map((pl) => lab(pl, what))); };
  const MW = { segs: [], bodies: [], shore: [] }, XW = { segs: [], bodies: [], shore: [] }, mp = W0.main.pond, ms = W0.main.stream, lp = mp.legacy || mp;
  if (mp.legacy) { ring(mp.outline, MW.segs); MW.bodies.push({ poly: mp.outline, bb: gBox(mp.outline), level: null }); MW.shore.push(lab(closed(mp.outline), 'teardrop')); }
  { const bank = lp.r + A.waterTs.pondBank, [cx, cz] = lp.at; MW.segs.push(gSeg(cx, cz, cx, cz, bank, bank));
    MW.shore.push(lab(Array.from({ length: 97 }, (_, k) => [cx + Math.cos(k / 96 * TAU) * bank, cz + Math.sin(k / 96 * TAU) * bank]), 'legacy bank')); }
  if (ms.line) ribbon(MW, ms.line.map((p) => [p.x, p.z]), (i) => ms.line[i].width / 2, 'stream');
  { const lsp = (ms.legacy || ms).points, dense = resamplePolyline(catmullRomCentripetal(lsp.map((p) => [p.x, p.z]), 10), 0.1), cum = [0];   // (Water.tsx: a Catmull-Rom ribbon, width linear along it)
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    const w0 = lsp[0].width, w1 = lsp[lsp.length - 1].width, Lc = cum[cum.length - 1] || 1;
    ribbon(MW, dense, (i) => (w0 + (w1 - w0) * cum[i] / Lc) / 2, 'legacy stream'); }
  // still water's islets: the level + still contour inside the outline (marching squares on a 0.1 u lattice; segments with both ends inside)
  const islets = (o, lvl) => {
    const [x0, z0, x1, z1] = gBox(o), st = 0.1, nx = Math.ceil((x1 - x0) / st) + 1, nz = Math.ceil((z1 - z0) / st) + 1, f = new Float64Array(nx * nz), segs = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) f[j * nx + i] = bp.H(x0 + i * st, z0 + j * st) - lvl;
    const cut = (ia, ja, ib, jb) => { const fa = f[ja * nx + ia], fb = f[jb * nx + ib], t = fa / (fa - fb); return [x0 + (ia + (ib - ia) * t) * st, z0 + (ja + (jb - ja) * t) * st]; };
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = f[j * nx + i] < 0, b = f[j * nx + i + 1] < 0, c = f[(j + 1) * nx + i + 1] < 0, d = f[(j + 1) * nx + i] < 0;
      const E = [a !== b ? cut(i, j, i + 1, j) : null, b !== c ? cut(i + 1, j, i + 1, j + 1) : null, d !== c ? cut(i, j + 1, i + 1, j + 1) : null, a !== d ? cut(i, j, i, j + 1) : null], pts = E.filter(Boolean);
      if (pts.length === 2) segs.push(pts);
      else if (pts.length === 4) { const mid = f[j * nx + i] + f[j * nx + i + 1] + f[(j + 1) * nx + i + 1] + f[(j + 1) * nx + i] < 0;   // (a saddle: paired by the centre)
        if (mid === a) segs.push([E[0], E[1]], [E[2], E[3]]); else segs.push([E[0], E[3]], [E[1], E[2]]); }
    }
    return segs.filter(([p, q]) => inLoop(o, p[0], p[1]) && inLoop(o, q[0], q[1]));
  };
  const still = (o, level, what) => { ring(o, XW.segs); XW.bodies.push({ poly: o, bb: gBox(o), level }); XW.shore.push(lab(closed(o), what));
    for (const sg of islets(o, level + GR.still)) { XW.segs.push(gSeg(sg[0][0], sg[0][1], sg[1][0], sg[1][1], 0, 0)); XW.shore.push(lab(sg, what + ' islet')); } };
  if (W0.wetland) { still(W0.wetland.lake.outline, W0.wetland.lake.level, 'lake');
    for (const [what, ch] of [['river', W0.wetland.river.points], ['outflow', W0.wetland.outflow.points]]) ribbon(XW, ch.map((p) => [p.x, p.z]), (i) => ch[i].width / 2, what); }
  if (W0.highland) { still(W0.highland.tarn.outline, W0.highland.tarn.level, 'tarn'); still(W0.highland.hotSpring.outline, W0.highland.hotSpring.level, 'hot spring'); }

  // ---- spots ----
  const H = GR.halo, ZR = A.mainZones.radii, CV = { ...COVER, ...(A.composition.cover || {}) }, spotsOf = {};
  for (const id of bp.order) spotsOf[id] = [];
  const blk = (w) => G.BLOCKERS.find((b) => b.what === w), disc = (id, what, keep, halo, [x, z], r) => spotsOf[id].push({ what, keep, halo, x, z, r });
  disc('main', 'house', 'clear', H.house, blk('house').at, blk('house').r);
  spotsOf.main.push({ what: 'garden fence', keep: 'clear', halo: H.fence, rect: gBox(G.FENCE_RUNS.flat()) });
  for (const w of ['windmill', 'greenhouse', 'well']) disc('main', w, 'clear', H.building, blk(w).at, blk(w).r);
  const slots = new Map(), put = (k, at, r) => slots.set(k, { what: k, at, r });
  G.FRUIT_TREES.forEach((p, i) => put(`FRUIT_TREES:${i}`, p, ZR.fruitTree)); G.FLOWERBEDS.forEach((p, i) => put(`FLOWERBEDS:${i}`, p, ZR.flowerbed));
  G.LANTERNS.forEach((p, i) => put(`LANTERNS:${i}`, p, ZR.lantern)); G.BEEHIVES.forEach((p, i) => put(`BEEHIVES:${i}`, p, ZR.beehive));
  G.BUSHES.forEach((p, i) => put(`BUSHES:${i}`, p, ZR.bush)); A.mainIslandTsx.ROCKS.forEach((k, i) => put(`ROCKS:${i}`, k.at, ZR.rock));
  G.STATIC_TREES.forEach((t, i) => put(`STATIC_TREES:${i}`, t.at, ZR.treeBase + ZR.treePerScale * t.s));
  put('BENCH', [G.BENCH.x, G.BENCH.z], ZR.bench); put('SCARECROW', G.SCARECROW, ZR.scarecrow);
  if (CV.moved.length !== GROUND_MOVED.length) throw new Error(`groundZones: COVER.moved has ${CV.moved.length} entries, GROUND_MOVED names ${GROUND_MOVED.length}`);
  GROUND_MOVED.forEach((k, i) => { const s = slots.get(k); s.at = [CV.moved[i][0], CV.moved[i][1]]; s.r = CV.moved[i][2]; });
  for (const [k, at] of Object.entries(NOW.slots || {})) { const s = slots.get(k); if (!s) throw new Error(`groundZones: GROUND.now.slots names ${k}, no such slot`); s.at = [at[0], at[1]]; }
  for (const [k, s] of slots) if (k.startsWith('STATIC_TREES') && pieceAt(bp, s.at[0], s.at[1]) !== 'main') slots.delete(k);   // (only those on MAIN's top: the game dropped the other)
  for (const kc of B.keepClear || []) { if (kc.kinds) continue;   // (the hero tree's root flare keeps volumes off, not the ground cover)
    if (GROUND_REPLACES[kc.id]) slots.delete(GROUND_REPLACES[kc.id]);
    const id = pieceAt(bp, kc.at[0], kc.at[1]) || 'main'; if (id === 'main') slots.set(kc.id, { what: kc.id, at: kc.at, r: kc.r }); else disc(id, kc.id, 'clear', H.slot, kc.at, kc.r); }
  for (const s of slots.values()) disc('main', s.what, 'clear', H.slot, s.at, s.r);
  // the wild pieces' zones: a core is tidy (A inside, no halo: a clear one would leave the meadow's 21 u2 core bare), a building or any
  // other flat zone clear with its halo; the animals' ranges and the wildflower spot grow as they are (as composeBlueprint's cover blocks
  // them today). Task 1's choice, the brief is silent; accepted pending review
  for (const [id, list] of Object.entries(B.zones || {})) for (const zn of list) {
    if (!spotsOf[id] || zn.kind === 'animals' || zn.id === 'wildflowers') continue;
    disc(id, zn.id, zn.kind === 'core' ? 'tidy' : 'clear', zn.kind === 'core' ? 0 : zn.kind === 'building' ? H.building : H.wildZone, zn.at, zn.r);
  }
  const jt = lakeJetty(bp, W0);
  if (jt && spotsOf.wetland) { spotsOf.wetland.push({ what: 'jetty', keep: 'clear', halo: H.jetty, ax: jt.at[0], az: jt.at[1], bx: jt.at[0] + jt.dir[0] * jt.length, bz: jt.at[1] + jt.dir[1] * jt.length, r: jt.width / 2 });
    disc('wetland', 'jetty shed', 'clear', H.jetty, jt.shed.at, jt.shed.r); }
  for (const [id, list] of Object.entries(GR.spots || {})) for (const s of list) { if (!spotsOf[id]) continue;
    const keep = s.keep || 'clear', halo = keep === 'tidy' ? 0 : s.halo ?? H.slot;
    spotsOf[id].push(s.rect ? { what: s.what, keep, halo, rect: s.rect.slice() } : s.ax !== undefined ? { what: s.what, keep, halo, ax: s.ax, az: s.az, bx: s.bx, bz: s.bz, r: s.r } : { what: s.what, keep, halo, x: s.x, z: s.z, r: s.r }); }
  const spotItems = [];
  for (const id of bp.order) for (const s of spotsOf[id]) { const h = s.keep === 'tidy' ? 0 : s.halo, [x0, z0, x1, z1] = gSpotBox(s, h); spotItems.push({ s, h, x0, z0, x1, z1 }); }

  // ---- the trees that are always there (on their piece's top; MAIN's fruit trees are slots, not trees) and their shade pools ----
  // (ruling GR10) a layout tree (one of game.STATIC_TREES) stands where the game stands it NOW: layout.ts aside() puts the moved ones at
  // `now` whenever the composition is drawn, which is when the baked paint shows; so its pool and trunk clearing go to its COVER.moved
  // spot (through GROUND_MOVED). The proof still draws the layout trees at the frozen game.* spots (arch-scene.js:1026), left as it is
  const movedAt = new Map(GROUND_MOVED.map((k, i) => [k, CV.moved[i]])), trees = [];
  for (const id of bp.order) for (const t of P[id].trees || []) {
    const gi = t.layout ? G.STATIC_TREES.findIndex((s) => Math.abs(s.at[0] - t.x) < 1e-9 && Math.abs(s.at[1] - t.z) < 1e-9) : -1, mv = gi >= 0 ? movedAt.get(`STATIC_TREES:${gi}`) : null;
    const tx = mv ? mv[0] : t.x, tz = mv ? mv[1] : t.z;
    if (pieceAt(bp, tx, tz) !== id) continue;   // (on its piece's top: the pine the game dropped is not)
    // (R from the drawn scale, scale x vscale: see GROUND.pools; the hero tree is game.STATIC_TREES[0])
    const Rc = gi === 0 ? PL.hero : (t.kind === 'pine' ? PL.conifer : PL.broadleaf) * t.scale * (t.vscale || 1);
    const x = tx + PL.shift * Rc * PL.away[0], z = tz + PL.shift * Rc * PL.away[1], m = Rc * PL.size[1];
    trees.push({ id, tx, tz, x, z, r: Rc, x0: x - m, z0: z - m, x1: x + m, z1: z + m });
  }
  const trunks = trees.map((t) => ({ tx: t.tx, tz: t.tz, x0: t.tx - PL.trunk, z0: t.tz - PL.trunk, x1: t.tx + PL.trunk, z1: t.tz + PL.trunk }));
  const nAt = (x, z) => clamp(0.5 + 0.5 * bp.noise.fbm(x / PL.noise + 53.1, z / PL.noise - 19.7, 2, 2, 0.5), 0, 1);

  // ---- per piece: the bucket grids over its box + reach ----
  const data = {};
  const pieceData = (id) => {
    if (data[id]) return data[id];
    const loop = bp.pieces[id].loopWorld, bb = gBox(loop), gb = [bb[0] - R, bb[1] - R, bb[2] + R, bb[3] + R], Wt = id === 'main' ? MW : XW;
    const over = (b) => b[2] >= gb[0] && b[0] <= gb[2] && b[3] >= gb[1] && b[1] <= gb[3];
    return (data[id] = { paths: groundBuckets(gb, pathSegs), water: groundBuckets(gb, Wt.segs), bodies: Wt.bodies.filter((b) => over(b.bb)), shore: Wt.shore.filter((pl) => over(gBox(pl))),
      spots: groundBuckets(gb, spotItems), pools: groundBuckets(gb, trees), trunks: groundBuckets(gb, trunks), rim: id === 'main' ? groundBuckets(gb, ring(loop, [])) : null });
  };
  // pieceAt, quicker: the same answer, each loop tested only inside its box
  const loops = bp.order.filter((id) => id !== 'main').map((id) => [id, bp.pieces[id].loopWorld, gBox(bp.pieces[id].loopWorld)]);
  const pieceOf = (x, z) => { if (Math.hypot(x, z) <= bp.Rm(Math.atan2(z, x))) return 'main';
    for (const [id, lp, b] of loops) if (x >= b[0] && x <= b[2] && z >= b[1] && z <= b[3] && inLoop(lp, x, z)) return id; return null; };
  const field = {
    at(id, x, z) {
      const D = pieceData(id), on = pieceOf(x, z) === id;
      const dPath = D.paths.nearest(x, z, gSegD, R);
      let dWater = D.water.nearest(x, z, gSegD, R);
      for (const b of D.bodies) if (x >= b.bb[0] && x <= b.bb[2] && z >= b.bb[1] && z <= b.bb[3] && inLoop(b.poly, x, z) && (b.level === null || bp.H(x, z) < b.level + GR.still)) { dWater = -Math.abs(dWater); break; }
      let foot = false, dSpot = R, aH = R, dClear = R;   // (one scan: the footprints, the nearest spot, the nearest halo edge; aHalo = -aH)
      D.spots.scan(x, z, (it) => { const d = gSpotD(it.s, x, z); if (it.s.keep === 'clear') { if (d < 0) foot = true; if (d < dClear) dClear = d; } if (d < dSpot) dSpot = d; if (d - it.h < aH) aH = d - it.h; }, (k) => dSpot <= k && aH <= k, R);
      const aHalo = -aH;
      let U = 0, clear = false; D.trunks.cell(x, z, (t) => { if (!clear && Math.hypot(x - t.tx, z - t.tz) < PL.trunk) clear = true; });
      if (!clear) { let f = -1; D.pools.cell(x, z, (p) => { const d = Math.hypot(x - p.x, z - p.z); if (d >= p.r * PL.size[1]) return;
        if (f < 0) f = lerp(PL.size[0], PL.size[1], nAt(x, z)); const u = 1 - smoothstep(PL.edge[0], PL.edge[1], d / (p.r * f)); if (u > U) U = u; }); }
      const dRim = id === 'main' ? (on ? 1 : -1) * D.rim.nearest(x, z, gSegD, R) : bp.dcAt(x, z), WG = GR.W;
      const W = id === 'main' ? Math.max(1 - smoothstep(WG.rim[0], WG.rim[1], dRim), smoothstep(WG.corner[0], WG.corner[1], Math.min(dSpot, dPath)))
        : WG.wild[0] + WG.wild[1] * (1 - smoothstep(WG.rim[0], WG.rim[1], dRim));
      const zone = !on || dWater < ZN.wet || dPath < 0 || foot ? null : dPath < ZN.E ? 'E' : dWater < ZN.D ? 'D' : aHalo > 0 ? 'A' : U > ZN.C ? 'C' : W > ZN.B ? 'B' : 'lawn';
      return { zone, dPath, dWater, dSpot, aHalo, U, W, dRim, dClear };
    },
    pools: (id) => trees.filter((t) => t.id === id).map((t) => ({ x: t.x, z: t.z, r: t.r, tx: t.tx, tz: t.tz })),
    spots: (id) => (spotsOf[id] || []).map((s) => ({ ...s, ...(s.rect ? { rect: s.rect.slice() } : {}) })),
    shore: (id) => pieceData(id).shore.map((pl) => lab(pl.map((p) => p.slice()), pl.what)),
    runs: (id) => (runsOf[id] || []).slice(),
  };
  cache.set(key, field);
  return field;
}

// ---- MAIN's cover as ZONED CLUSTERS (the ground-vegetation spec art/specs/2026-10-25-ground-vegetation-design.md §3-§4, plan Task 2):
//      clusterCover(bp, id, field, rng, ctx) -> { items: [{ asset, x, z, rot, scale, cl }], clusters: [{ x, z, kind, zone, n, scale,
//      heading }] }: cl indexes clusters, n = its members. field: groundZones; rng: the piece's own 'cluster' stream; ctx: from
//      composeBlueprint, ok (the cover's checks: on the piece, slope, coast, trunks, blocked + pad, COVER.moved), ph (a position hash), CV
//      (COVER), GC (groundConfig), inSight (the near side) and drop (x, z -> true where composeBlueprint's end would drop cover: the farm
//      water, the keep-clear discs). All the knobs are GROUND.density and GROUND.cluster.
//   Quotas: a zone takes at most density x its area on the 0.1 u zone grid (zoneGrid's cells; E its 0.25-0.7 u band) items, counted by
//      the zone of the grid cell an item lands in (its own zone where that cell has none, so the count never undershoots the tests').
//      So each zone's density lands on its target exactly, on either seed: a draw per seed could not hold the lawn's 3-4 on 2.3 u^2.
//   Seeds: a jittered `cell` grid, ranked by u^(1 / gate) (a weighted draw: gate is a `gate` u noise, smoothstepped by gateEdge), so the
//      seeds a zone keeps gather into drifts with gaps between them; each zone takes seeds in that order while it has room. The slivers
//      go first, while the zones round them still have room for a patch's other members: the lawn, then E (its density a share of the
//      lawn's as placed), then C, then A, B and D. A zone still short after its grid seeds takes more at its own grid cells (`fill`).
//   Kind: clover where coverField's clover is above cloverAt, else a tuft patch (short grass); C always clover (GR16: the owner's "shade,
//      clover and pebbles" under the trees); E and D tufts only; daisyShare of the
//      clover seeds in the lawn, B and C pair a daisy cluster (its own entry, at the same seed, placed before its clover).
//   Members: the count and radius R from position hashes; member k at R sqrt((k + h) / n) on a golden-angle spiral from a hashed start,
//      its angle jittered, so no two clusters share an offset table (RF5). Each member passes ok, lands on a zone (never A from a seed
//      outside A: RF1; E and D take short grass only), keeps pathClear off a path edge, its pad off every clear spot and `sep` off every
//      item, fits its zone's room and every tree's ring (<= ring[2] deg of bearing ring[0]-ring[1] u out: V15), and turns `clone` rad
//      off a near twin (V16). Height (COVER.height x scale) stays under `height` (A, D, the yards, the near side). A cluster left with
//      fewer members than its kind's least count (tuft patches 4, clover and daisies 3) gets one more layout, then is dropped whole
//      (the zones' quotas refill from other seeds); so is one with the layout of a same-kind cluster within 4 u.
//   Pebbles (plan Task 8): after all of that, GROUND.cluster.pebble.clusters heaps of 3-5 `pebbles` models at C's roomiest cells (>= `apart` from
//      each other), each member in C, through the same checks; they take no zone quota and draw no stream, so no plant moves.
// a cover item's tint (plan Task 4): the near-white texturedTint on GROUND.tint.seed; `U` (the shade pool value at the item, MAIN only;
// null where there is no field) darkens clover_patch above tint.shade by tint.clover[0] + tint.clover[1] ph(x, z, 7307). Draws no stream.
function coverTint(GC, ph, asset, x, z, U) {
  const T = GC.tint, t = texturedTint(x, z, { enabled: true, seed: T.seed });
  if (asset !== 'clover_patch' || !(U > T.shade)) return t;
  const k = T.clover[0] + T.clover[1] * ph(x, z, 7307);
  return t.map((c) => Math.round(c * k * 10000) / 10000);
}
// consolidateBatches(items, min = BATCH_MIN) -> items: a piece's cover with every kind at `min` items or more (plan Task 5, V18). Kinds that
// are interchangeable make a group: the tall grasses (grass_tall, grass_seedhead), the wildflowers (flower_*), the perennials (perennial_*);
// any other kind is a group of one. In a group, each kind under `min` takes the label of the group's largest kind (ties: the name that
// sorts first); a group whose items together number under `min` goes. Items keep every field but `asset` (the tint included: it depends
// on the kind only for the shade-pool clover, which never changes label); nothing is drawn and nothing moves.
const BATCH_MIN = 12;
function consolidateBatches(items, min = BATCH_MIN) {
  const groupOf = (a) => a === 'grass_tall' || a === 'grass_seedhead' ? 'tall' : a.startsWith('flower_') ? 'flower' : a.startsWith('perennial_') ? 'perennial' : a;
  const groups = new Map();
  for (const it of items) { const g = groupOf(it.asset), k = groups.get(g) || groups.set(g, new Map()).get(g); k.set(it.asset, (k.get(it.asset) || 0) + 1); }
  const to = new Map();   // asset -> its new label, or null (goes)
  for (const kinds of groups.values()) {
    if ([...kinds.values()].every((n) => n >= min)) continue;
    const ranked = [...kinds.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)), total = ranked.reduce((t, [, n]) => t + n, 0);
    for (const [a, n] of ranked) if (n < min) to.set(a, total >= min ? ranked[0][0] : null);
  }
  if (!to.size) return items;
  const out = []; for (const it of items) { if (!to.has(it.asset)) { out.push(it); continue; } const a = to.get(it.asset); if (a) { it.asset = a; out.push(it); } }
  return out;
}
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const CLUSTER_ASSET = { tuft: 'grass_short', clover: 'clover_patch', daisy: 'flower_daisy', pebble: 'pebbles' };
function clusterCover(bp, id, field, rng, ctx) {
  const { ok, ph, CV, GC, inSight, drop, gap } = ctx, CL = GC.cluster, DN = GC.density, cs = 0.1, ca = cs * cs, r3 = (v) => +v.toFixed(3);
  const padOf = (a) => CV.pad[a] ?? CV.pad.default, rotOf = (y) => r3(((y % TAU) + TAU) % TAU), wrap = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  const [x0, z0, x1, z1] = gBox(bp.pieces[id].loopWorld);
  // the zone grid: zoneGrid's cells (centres (i + 0.5) x 0.1 over the outline's box); 'E-' = E within pathClear of a path edge
  const i0 = Math.floor(x0 / cs), i1 = Math.ceil(x1 / cs), j0 = Math.floor(z0 / cs), j1 = Math.ceil(z1 / cs), ni = i1 - i0, nj = j1 - j0, cellZ = new Array(ni * nj).fill(null);
  const nCells = { A: 0, B: 0, C: 0, D: 0, E: 0, lawn: 0, Ds: 0 };
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const q = field.at(id, (i + 0.5) * cs, (j + 0.5) * cs); if (!q.zone) continue;
    const z = q.zone === 'E' && q.dPath < CL.pathClear ? 'E-' : q.zone; cellZ[(j - j0) * ni + (i - i0)] = z; if (z !== 'E-') nCells[z]++; }
  const cellAt = (x, z) => { const i = Math.floor(x / cs) - i0, j = Math.floor(z / cs) - j0; return i >= 0 && j >= 0 && i < ni && j < nj ? cellZ[j * ni + i] : null; };
  const quota = { E: 0 }, used = { A: 0, B: 0, C: 0, D: 0, E: 0, lawn: 0, Ds: 0 }, inCell = { A: 0, B: 0, C: 0, D: 0, E: 0, lawn: 0, Ds: 0 };   // (the quotas: below, once the pond's stretches are known)
  // the seeds, ranked
  const gate = (x, z) => smoothstep(CL.gateEdge[0], CL.gateEdge[1], 0.5 + 0.5 * bp.noise.fbm(x / CL.gate + 61.7, z / CL.gate - 14.3, 2, 2, 0.5));
  const seeds = [];
  for (let gz = z0; gz < z1; gz += CL.cell) for (let gx = x0; gx < x1; gx += CL.cell) {
    const x = r3(gx + CL.cell * rng()), z = r3(gz + CL.cell * rng()), u = rng(), us = rng(), q = field.at(id, x, z);
    if (!q.zone) continue;
    const w = gate(x, z); seeds.push({ x, z, zone: q.zone, us, key: w > 0 ? Math.pow(u, 1 / w) : 0, i: seeds.length });
  }
  seeds.sort((a, b) => b.key - a.key || a.i - b.i);
  // what is placed: items in 0.5 u buckets, the trees' rings, the clear spots, the yards
  const items = [], clusters = [], layouts = [], grid = new Map(), gk = (x, z) => Math.floor(x / 0.5) + ',' + Math.floor(z / 0.5);
  const near = (x, z, r, tmp, fn) => { const ix = Math.floor(x / 0.5), iz = Math.floor(z / 0.5);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const o of grid.get((ix + a) + ',' + (iz + b)) || []) if (Math.hypot(o.x - x, o.z - z) <= r) fn(o);
    for (const o of tmp) if (Math.hypot(o.x - x, o.z - z) <= r) fn(o); };
  const trees = field.pools(id).map((p) => ({ x: p.tx, z: p.tz, b: [] })), [rr0, rr1, rMax] = CL.ring;
  const brg = (t, x, z) => ((Math.atan2(z - t.z, x - t.x) * 180 / Math.PI) + 360) % 360, inRing = (t, x, z) => { const d = Math.hypot(x - t.x, z - t.z); return d >= rr0 && d <= rr1; };
  const span = (b) => { const s = b.slice().sort((p, q) => p - q); let gap = s[0] + 360 - s[s.length - 1]; for (let i = 1; i < s.length; i++) gap = Math.max(gap, s[i] - s[i - 1]); return 360 - gap; };
  const ringOk = (x, z, tmp) => trees.every((t) => { if (!inRing(t, x, z)) return true;
    const b = t.b.concat(tmp.filter((m) => inRing(t, m.x, m.z)).map((m) => brg(t, m.x, m.z)), [brg(t, x, z)]); return b.length < 3 || span(b) <= rMax; });
  const clear = []; for (const pid of bp.order) for (const s of field.spots(pid)) if (s.keep === 'clear') clear.push(s);
  const clearD = (x, z) => { let m = Infinity; for (const s of clear) m = Math.min(m, gSpotD(s, x, z)); return m; };
  const yards = field.spots(id).filter((s) => s.keep === 'tidy'), inYard = (x, z) => yards.some((s) => gSpotD(s, x, z) < 0);
  // ---- the pond's edge on the teardrop (plan Task 10; GROUND.pond): its stretches on the far shore and their reeds, before any plant ----
  const PD = GC.pond, po = ctx.pond && ctx.pond.outline, reeds = [], stretches = [];
  let inSt = () => -1, camNear = () => false;
  if (PD && po && po.length > 3) {
    const n = po.length, segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
    const edgeNear = (x, z) => { let d = Infinity, k = -1; for (let i = 0; i < n; i++) { const e = segD(x, z, po[i], po[(i + 1) % n]); if (e < d) { d = e; k = i; } } return { d, i: k }; };   // (ground-measure polyEdgeNearest)
    const capD = (x, z) => segD(x, z, po[n - 1], po[0]);
    let ar = 0; for (let i = 0; i < n; i++) ar += po[i][0] * po[(i + 1) % n][1] - po[(i + 1) % n][0] * po[i][1];
    const sg = ar < 0 ? -1 : 1, nrm = (i, k) => { const a = po[(i - k + n) % n], b = po[(i + k) % n], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [sg * dz / l, -sg * dx / l]; };
    const ncOf = ([nx, nz]) => nx * PD.cam[0] + nz * PD.cam[1], nc1 = po.map((p, i) => ncOf(nrm(i, 1))), nS = po.map((p, i) => nrm(i, PD.smooth)), ncS = nS.map(ncOf);
    const camPts = po.filter((p, i) => nc1[i] > PD.camShore);
    camNear = (x, z) => camPts.some((p) => Math.hypot(p[0] - x, p[1] - z) < PD.camReach);
    inSt = (x, z) => { if (!stretches.length || inLoop(po, x, z) || capD(x, z) < PD.cap) return -1; const { d, i } = edgeNear(x, z); if (d < PD.band[0] || d > PD.band[1]) return -1;
      for (const S of stretches) if (i >= S.i0 && i <= S.i1) return S.k; return -1; };
    const segL = po.map((p, i) => Math.hypot(po[(i + 1) % n][0] - p[0], po[(i + 1) % n][1] - p[1])), per = segL.reduce((s, v) => s + v, 0), cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + segL[i - 1]);
    const nearestPt = (x, z) => { let m = Infinity, k = -1; for (let i = 0; i < n; i++) { const e = Math.hypot(po[i][0] - x, po[i][1] - z); if (e < m) { m = e; k = i; } } return k; };
    const line = (ctx.pond.line || []), streamD = (x, z) => { let m = Infinity; for (let i = 0; i < line.length - 1; i++) { const a = line[i], b = line[i + 1]; m = Math.min(m, segD(x, z, [a.x, a.z], [b.x, b.z]) - Math.max(a.width, b.width) / 2); } return m; };
    const RD = PD.reed;
    const reedOk = (x, z, S, list) => {
      const { d: e, i } = edgeNear(x, z), d = inLoop(po, x, z) ? -e : e;   // (signed: < 0 in the water; ruling GR30: the reeds stand at the waterline)
      if (d < RD.out[0] || d > RD.out[1] || i < S.i0 || i > S.i1 || capD(x, z) < PD.cap + 0.05 || camNear(x, z) || !(nc1[nearestPt(x, z)] < PD.far)) return false;
      if (!(ctx.pond.ok || ok)(x, z, RD.pad, 0.3) || (ctx.pond.keep ? ctx.pond.keep(x, z) : drop(x, z)) || inYard(x, z) || streamD(x, z) < RD.stream || clearD(x, z) < RD.pad) return false;
      // (D, E by a path's edge, or nothing only where the legacy blob's wet band or its stream lies; >= reed.path u off a path's edge)
      const q = field.at(id, x, z); if ((q.zone !== 'D' && q.zone !== 'E' && q.zone !== null) || q.dPath < RD.path) return false;
      return list.every((r) => Math.hypot(r.x - x, r.z - z) >= RD.sep);
    };
    // the shore a reed list covers (outline points within 1.0 u of a reed, each weighted by half its two edges) and its runs (cyclic)
    const cover = (list) => { const cv = po.map((p) => list.some((r) => Math.hypot(r.x - p[0], r.z - p[1]) <= 1.0)), share = cv.reduce((s, v, i) => s + (v ? (segL[i] + segL[(i - 1 + n) % n]) / 2 : 0), 0) / per;
      const runs = [], u0 = cv.indexOf(false); if (u0 >= 0) { let cur = null; for (let s = 1; s <= n; s++) { const i = (u0 + s) % n; if (cv[i]) { if (cur) cur.b = i; else cur = { a: i, b: i }; } else if (cur) { runs.push(cur); cur = null; } } if (cur) runs.push(cur); }
      const gaps = runs.length > 1 ? runs.map((r, k) => { const nx = runs[(k + 1) % runs.length]; let L = 0; for (let i = r.b; i !== nx.a; i = (i + 1) % n) L += segL[i]; return L; }) : [];
      return { share, runs: runs.length, gap: gaps.length ? Math.min(...gaps) : Infinity }; };
    const r3p = (v) => +v.toFixed(3), clumpAt = (S, sC, base) => {   // one clump on stretch S, round the shore's point sC u along it: 3-5 reeds, or null
      let i = 0; while (i < n - 2 && cum[i + 1] < sC) i++; const t = Math.max(0, Math.min(1, (sC - cum[i]) / (segL[i] || 1))), px = r3p(po[i][0] + (po[i + 1][0] - po[i][0]) * t), pz = r3p(po[i][1] + (po[i + 1][1] - po[i][1]) * t);
      const [nx, nz] = nS[t < 0.5 ? i : i + 1], h = (k) => ph(px, pz, base + k);
      const out0 = RD.centre[0] + (RD.centre[1] - RD.centre[0]) * h(0), cx = px + nx * out0, cz = pz + nz * out0;
      const cnt = RD.n[0] + Math.min(RD.n[1] - RD.n[0], Math.floor(h(1) * (RD.n[1] - RD.n[0] + 1))), R = RD.r[0] + (RD.r[1] - RD.r[0]) * h(2), a0 = h(3) * TAU, got = [];
      for (let m = 0; m < cnt; m++) for (let tr = 0; tr < 4; tr++) {
        const hm = (q) => h(10 + 7 * m + q), rr = R * Math.sqrt((m + hm(0)) / cnt), a = a0 + m * GOLDEN + (hm(1) - 0.5) * 0.6 + tr * 1.9;
        const x = r3p(cx + Math.cos(a) * rr), z = r3p(cz + Math.sin(a) * rr);
        if (reedOk(x, z, S, got)) { got.push({ x, z }); break; } }
      return got.length >= RD.n[0] ? got : null; };
    // every candidate arc (a centre on the far shore, its length by a position hash) with its clumps, built on its own
    const arcsC = [];
    for (let i = 0; i < n; i++) { if (!(ncS[i] < PD.far) || capD(po[i][0], po[i][1]) < PD.cap) continue;
      const La = PD.arcLen[0] + (PD.arcLen[1] - PD.arcLen[0]) * ph(po[i][0], po[i][1], 9701);
      let ja = i, jb = i; while (ja > 0 && cum[i] - cum[ja - 1] <= La / 2) ja--; while (jb < n - 1 && cum[jb + 1] - cum[i] <= La / 2) jb++;
      let fine = true; for (let j = ja; j <= jb; j++) if (!(ncS[j] < PD.far) || capD(po[j][0], po[j][1]) < PD.cap) fine = false;
      if (!fine) continue;
      // its clumps every ~clumpStep u along it; a one-clump arc also tries the clump nearer either end (variants, in this order)
      const S = { i0: ja, i1: jb - 1 }, nC = Math.max(1, Math.round((cum[jb] - cum[ja]) / PD.clumpStep)), key = ph(po[i][0], po[i][1], 9703);
      const fracs = nC === 1 ? [[0.5], [0.3], [0.7], [0.12], [0.88]] : [Array.from({ length: nC }, (_, q) => (q + 0.5) / nC)];
      fracs.forEach((fs, v) => { const mine = [];
        for (const f of fs) { const sC = cum[ja] + f * (cum[jb] - cum[ja]), got = clumpAt(S, sC, 9750) || clumpAt(S, sC, 9850); if (got) mine.push(got); }
        if (mine.length) arcsC.push({ i, v, key, S, mine }); });
    }
    arcsC.sort((a, b) => b.key - a.key || a.i - b.i || a.v - b.v); arcsC.length = Math.min(arcsC.length, 80);
    // the arcs: of the sets of `arcs` (then 2) non-touching candidates whose reeds stand `sep` apart (and two arcs' nearest reeds `apart`,
    // GR28) and cover <= share of the shore in one run each, >= runGap u between runs, the one whose hash keys sum highest (first in rank
    // order on a tie): chosen by position hashes
    const flat1 = (set) => set.flatMap((a) => a.mine.flat()), apartOk = (set) => { const all = flat1(set); for (let p = 0; p < all.length; p++) for (let q = p + 1; q < all.length; q++) if (Math.hypot(all[p].x - all[q].x, all[p].z - all[q].z) < RD.sep) return false;
      for (let p = 0; p < set.length; p++) for (let q = p + 1; q < set.length; q++) for (const u of set[p].mine.flat()) for (const w of set[q].mine.flat()) if (Math.hypot(u.x - w.x, u.z - w.z) < PD.apart) return false; return true; };
    let best = null;
    for (const size of [PD.arcs, 2]) { if (best) break;
      const pick = (from, set) => {
        if (set.length === size) { const sum = set.reduce((s, a) => s + a.key, 0); if (best && sum <= best.sum + 1e-12) return;
          const cv = cover(flat1(set)); if (cv.share <= PD.share + 1e-9 && (PD.runGap == null || (cv.runs === size && cv.gap >= PD.runGap)) && apartOk(set)) best = { sum, set: set.slice() }; return; }
        for (let k = from; k < arcsC.length; k++) { const a = arcsC[k]; if (set.some((b) => a.S.i0 <= b.S.i1 + 2 && a.S.i1 + 2 >= b.S.i0)) continue; set.push(a); pick(k + 1, set); set.pop(); } };
      pick(0, []); }
    if (best) { const set = best.set.slice().sort((a, b) => a.S.i0 - b.S.i0); let cl = 0;   // (along the outline)
      set.forEach((a, k) => { stretches.push({ k, i0: a.S.i0, i1: a.S.i1 }); for (const g of a.mine) { for (const r of g) reeds.push({ ...r, cl }); cl++; } }); }
    for (const r of reeds) { r.height = r3p(RD.height[0] + (RD.height[1] - RD.height[0]) * ph(r.x, r.z, 9743)); r.head = ph(r.x, r.z, 9741) > 1 - RD.head; }
  }
  // the stretches' ground is its own pool (Ds): the zone-grid cells and the seeds in D that lie on a stretch; then the quotas
  for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) if (cellZ[j * ni + i] === 'D' && inSt((i0 + i + 0.5) * cs, (j0 + j + 0.5) * cs) >= 0) { cellZ[j * ni + i] = 'Ds'; nCells.D--; nCells.Ds++; }
  for (const s of seeds) if (s.zone === 'D' && inSt(s.x, s.z) >= 0) s.zone = 'Ds';
  for (const k of ['A', 'B', 'C', 'D', 'lawn', 'Ds']) quota[k] = Math.floor((DN[k] || 0) * nCells[k] * ca + 1e-9);
  for (const r of reeds) { const key = gk(r.x, r.z); (grid.get(key) || grid.set(key, []).get(key)).push({ asset: 'reed', x: r.x, z: r.z, rot: 0, scale: 1 }); }   // (the reeds: room for them, never an item)
  // a member here, of this asset, from a seed in zone sz: its zone sample (with st: its stretch, or -1), or null
  const valid = (x, z, asset, sz, rho = 0) => {
    const pad = padOf(asset); if (!ok(x, z, pad, 0.3) || drop(x, z)) return null;
    const q = field.at(id, x, z); if (!q.zone || q.dPath < CL.pathClear) return null;
    q.st = q.zone === 'D' ? inSt(x, z) : -1; const zq = q.st >= 0 ? 'Ds' : q.zone;
    if (asset === 'pebbles') { if (zq !== sz) return null;                                       // (the pebbles: the zone of their seed, C's shade pools or E's path edges (plan Task 9); and only    
      const PB = CL.pebble; let lo = Infinity, hi = -Infinity;                                   // on ground flat under their footprint: they are thinner than the 0.04 u the cover allows (RF4:
      const at = (dx, dz) => { const e = bp.H(x + dx, z + dz); lo = Math.min(lo, e); hi = Math.max(hi, e); };   // a stone on a slope hovers or sinks): the 3 x 3 of +/- 0.1 u, the
      for (const dx of [-0.1, 0, 0.1]) for (const dz of [-0.1, 0, 0.1]) at(dx, dz);              // 0.125 u circle V13's RF4 reads, and the member's own footprint circle (rho)
      for (const r of rho > 0.125 ? [0.125, rho] : [0.125]) for (let k = 0; k < 8; k++) at(r * Math.cos(k * Math.PI / 4), r * Math.sin(k * Math.PI / 4));
      if (hi - lo > PB.flat) return null;
      const g = gap ? gap(x, z) : null; if (g !== null && g > PB.gap) return null; }             // (the game's grid vs the baked top drawn under it; null on a hole's edge)
    if (q.zone === 'A' && (sz !== 'A' || asset === 'flower_daisy')) return null;              // RF1: only A's own patches in A
    if ((q.zone === 'E' || q.zone === 'D') && asset !== 'grass_short' && !(asset === 'pebbles' && q.zone === 'E') && !(zq === 'Ds' && asset === 'clover_patch')) return null;   // (D's stretches: clover too, plan Task 10)
    if (q.dSpot < pad && clearD(x, z) < pad) return null;                                       // (a tidy yard reads dSpot < 0 inside)
    return q;
  };
  const build = (s, kind, salt) => {
    const pebble = kind === 'pebble', spec = pebble && s.zone === 'E' ? CL.pebbleE : CL[kind], asset = CLUSTER_ASSET[kind], h = (q) => ph(s.x, s.z, salt + q), kh = CV.height[asset];
    const n = spec.n[0] + Math.min(spec.n[1] - spec.n[0], Math.floor(h(0) * (spec.n[1] - spec.n[0] + 1))), R = spec.r[0] + (spec.r[1] - spec.r[0]) * h(1);
    const a0 = h(2) * TAU, heading = r3(h(3) * TAU), [sa, sb] = CV.scale[asset] || CV.scale.default, sc = r3(sa + (sb - sa) * (kind === 'daisy' || pebble ? h(4) : s.us));
    const tmp = [];
    for (let k = 0; k < n; k++) {
      const hm = (q) => h(10 + 5 * k + q), rr = R * Math.sqrt((k + hm(0)) / n), a = a0 + k * GOLDEN + (hm(1) - 0.5) * 0.6;
      const svRaw = sc * (CL.member[0] + (CL.member[1] - CL.member[0]) * hm(2)), svp = pebble ? Math.min(svRaw, CL.pebble.cap / kh) : 0;   // (the member's scale, before the caps; the pebbles' footprint follows it)
      const x = r3(s.x + Math.cos(a) * rr), z = r3(s.z + Math.sin(a) * rr), q = valid(x, z, asset, s.zone, pebble ? 0.08 * svp : 0); if (!q) continue;
      const cell = cellAt(x, z), pool = cell === 'E-' ? 'E' : cell || q.zone;
      if (!pebble && used[pool] + tmp.filter((m) => m.pool === pool).length >= quota[pool]) continue;   // (the pebbles take no plant quota)
      let close = false;
      if (pebble) near(x, z, 0.5, tmp, (o) => { if (Math.hypot(o.x - x, o.z - z) < (o.asset === 'pebbles' ? CL.pebble.sepK * (svp + o.scale) : CL.pebble.sepPlant + CL.pebble.sepK * svp)) close = true; });
      else near(x, z, CL.sep, tmp, () => { close = true; });
      if (close || !ringOk(x, z, tmp)) continue;
      let cap = Infinity;
      if (s.zone === 'A' || q.zone === 'A') cap = CL.height.A;
      if (q.zone === 'D') cap = Math.min(cap, CL.height.D);
      if (camNear(x, z)) cap = Math.min(cap, PD.shoreCap);   // (the pond's camera-facing shore, plan Task 10)
      if (inYard(x, z)) cap = Math.min(cap, CL.height.yard);
      if (inSight(x, z)) cap = Math.min(cap, CL.height.near);
      if (pebble) cap = Math.min(cap, CL.pebble.cap);
      let sv = svRaw; if (sv * kh > cap) sv = cap / kh * (0.85 + 0.15 * hm(3));
      sv = Math.floor(sv * 1000) / 1000;   // (down: the stored scale is the checked one)
      let yaw = kind === 'daisy' ? heading + (hm(4) - 0.5) * 2 * CL.heading : hm(4) * TAU, rot = rotOf(yaw), turns = 0;
      const twin = () => { let t = false; near(x, z, 0.5, tmp, (o) => { if (o.asset === asset && Math.abs(o.scale - sv) <= 0.03 && wrap(o.rot - rot) <= 0.2) t = true; }); return t; };
      while (twin() && turns < 7) { yaw += CL.clone; rot = rotOf(yaw); turns++; }
      if (turns === 7 && twin()) continue;
      tmp.push({ asset, x, z, rot, scale: sv, pool, cell: cell && cell !== 'E-' ? cell : null, st: q.st });
    }
    if (tmp.length < spec.n[0]) return false;   // (at least its kind's least count: a tuft patch 4, clover and daisies 3)
    const lay = tmp.length + ':' + tmp.map((m) => Math.round(Math.hypot(m.x - s.x, m.z - s.z) / 0.02)).sort((p, q) => p - q).join(',');
    if (clusters.some((c, k) => c.kind === kind && layouts[k] === lay && Math.hypot(c.x - s.x, c.z - s.z) < 4)) return false;   // (RF5)
    const cl = clusters.length; clusters.push({ x: s.x, z: s.z, kind, zone: s.zone, n: tmp.length, scale: sc, heading }); layouts.push(lay);
    for (const m of tmp) {
      const it = { asset: m.asset, x: m.x, z: m.z, rot: m.rot, scale: m.scale, cl, ...(m.st >= 0 ? { stretch: m.st } : {}) }, key = gk(m.x, m.z); items.push(it); (grid.get(key) || grid.set(key, []).get(key)).push(it);   // (stretch: internal, plan Task 10)
      if (m.asset !== 'pebbles') { used[m.pool]++; if (m.cell) inCell[m.cell]++; } for (const t of trees) if (inRing(t, m.x, m.z)) t.b.push(brg(t, m.x, m.z));
    }
    return true;
  };
  const run = (list) => { for (const s of list) {
    if (used[s.zone] >= quota[s.zone]) continue;
    const cf = coverField(bp.noise, s.x, s.z, false).clover, kind = s.zone === 'Ds' ? (ph(s.x, s.z, 7311) < 0.5 ? 'clover' : 'tuft')   // (plan Task 10: the pond's stretches, clover and short grass by a position hash)
      : s.zone === 'E' || s.zone === 'D' || (s.zone !== 'C' && cf <= CL.cloverAt) ? 'tuft' : 'clover';   // (ruling GR16: a seed in the shade pools, C, takes clover whatever the field says)
    // (the daisies first: placed after their clover they would find the middle of the seed taken)
    if (kind === 'clover' && (s.zone === 'lawn' || s.zone === 'B' || s.zone === 'C') && ph(s.x, s.z, 7999) < CL.daisyShare) build(s, 'daisy', 8000);
    if (!build(s, kind, 7000)) build(s, kind, 7500);   // (a dropped cluster gets one more layout)
  } };
  // a zone still short of its quota (the lawn and C are slivers between the others): more seeds at its own grid cells, in a hashed order,
  // each at least half a seed cell from every cluster, at most CL.fill tries
  const fill = (zn) => {
    const cand = [];
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) if (cellZ[j * ni + i] === zn) { const x = r3((i0 + i + 0.5) * cs), z = r3((j0 + j + 0.5) * cs); cand.push({ x, z, k: ph(x, z, 6007) }); }
    cand.sort((a, b) => a.k - b.k || a.x - b.x || a.z - b.z);
    let tries = 0;
    for (const c of cand) { if (used[zn] >= quota[zn] || tries >= CL.fill) break;
      if (clusters.some((k) => Math.hypot(k.x - c.x, k.z - c.z) < CL.cell / 2)) continue;
      tries++; run([{ x: c.x, z: c.z, zone: zn, us: ph(c.x, c.z, 6011) }]); }
  };
  // the slivers first, while the zones round them still have room for a patch's other members: the lawn, then E (its quota a share of
  // the lawn as placed; the lawn only gains after it), then C, then A, B and D
  const zoneSeeds = (zs) => seeds.filter((s) => zs.includes(s.zone));
  run(zoneSeeds(['lawn'])); fill('lawn');
  quota.E = Math.floor(DN.E * (nCells.lawn ? inCell.lawn / (nCells.lawn * ca) : 0) * nCells.E * ca + 1e-9);
  run(zoneSeeds(['E'])); fill('E');
  run(zoneSeeds(['C'])); fill('C');
  run(zoneSeeds(['A', 'B', 'D', 'Ds'])); for (const zn of ['B', 'D', 'A', 'Ds']) fill(zn);   // (Ds, the pond's stretches (plan Task 10): its seeds where D's were, its fill last)
  // the pebbles last (plan Task 8): C's zone-grid cells, the roomiest first (the distance to the nearest item, to 0.5 u, plus a position-
  // hashed jitter: the plants' own seeds sit in the thick of their patches), each at least `apart` from the last pebble cluster, until
  // `clusters` are placed. They draw nothing (position hashes only) and take no quota, so every plant above is where it was
  { const PB = CL.pebble, cand = []; let placed = 0;
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) if (cellZ[j * ni + i] === 'C') { const x = r3((i0 + i + 0.5) * cs), z = r3((j0 + j + 0.5) * cs); let d = 0.5;
      near(x, z, 0.5, [], (o) => { d = Math.min(d, Math.hypot(o.x - x, o.z - z)); }); cand.push({ x, z, k: d + 0.25 * ph(x, z, 9100) }); }
    cand.sort((a, b) => b.k - a.k || a.x - b.x || a.z - b.z);
    for (const c of cand) { if (placed >= PB.clusters) break;
      if (clusters.some((k) => k.kind === 'pebble' && Math.hypot(k.x - c.x, k.z - c.z) < PB.apart)) continue;
      const sd = { x: c.x, z: c.z, zone: 'C', us: ph(c.x, c.z, 9103) };
      if (build(sd, 'pebble', 9000) || build(sd, 'pebble', 9500)) placed++; } }
  // the path-edge pebble runs last of all (plan Task 9, V13p; the owner's "pebbles along the path edges"): each of MAIN's runs of minLen u or
  // more (the longest first), walked at `step` u: enough of its steps, picked by a position hash (ph 9907), take a cluster of pebbles `off`
  // u off the run's edge, on alternating sides (in order along the run), so that the clusters cover `share` of its length (a cluster covers
  // its step: V13p measures it as +/- step / 2 about the cluster's foot, counting the clusters of the other runs near it). A spot that fails
  // (E's zone, the path clearance, the flat ground of RF4, room) tries the run's other side, then the next step. Position hashes only: no
  // stream moves, no plant either
  { const PE = CL.pebbleE, runs = (field.runs ? field.runs(id) : []).filter((r) => r.L >= PE.minLen).sort((a, b) => b.L - a.L || (a.id < b.id ? -1 : 1));
    const footOf = (r, x, z) => { let best = null;   // (the run's nearest point to (x, z): its arc length s, the side of the run's direction (+1 left, as the test's) and the distance e to the run's edge)
      for (let i = 0; i < r.pts.length - 1; i++) { const a = r.pts[i], b = r.pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
        const dd = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (!best || dd < best.dd) best = { dd, i, t, side: (dx * (z - a[1]) - dz * (x - a[0])) >= 0 ? 1 : -1, s: r.cum[i] + t * Math.sqrt(L2) }; }
      return { s: best.s, side: best.side, e: best.dd - (r.hw(best.i) + (r.hw(best.i + 1) - r.hw(best.i)) * best.t) }; };
    const ptAt = (r, sArc) => { let i = 0; while (i < r.pts.length - 2 && r.cum[i + 1] < sArc) i++; const a = r.pts[i], b = r.pts[i + 1], d = r.cum[i + 1] - r.cum[i] || 1, t = Math.max(0, Math.min(1, (sArc - r.cum[i]) / d));
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, nx: -(b[1] - a[1]) / d, nz: (b[0] - a[0]) / d, hw: r.hw(i) + (r.hw(i + 1) - r.hw(i)) * t }; };
    const bad = new Set(), padP = padOf('pebbles');   // (centres that failed: the next run and the next step do not try them again)
    const merge = (iv) => { iv.sort((p, q) => p[0] - q[0]); const out = []; for (const [lo, hi] of iv) { const t = out[out.length - 1]; if (t && lo <= t[1]) t[1] = Math.max(t[1], hi); else out.push([lo, hi]); } return out; };
    const spans = (r) => { const iv = [];   // the stretches of run r the E clusters cover (V13p's measure): +/- step / 2 about each cluster's foot
      for (const k of clusters) { if (k.kind !== 'pebble' || k.zone !== 'E') continue; const f = footOf(r, k.x, k.z); if (f.e < 0.25 - 1e-9 || f.e > 0.7 + 1e-9) continue; iv.push([Math.max(0, f.s - PE.step / 2), Math.min(r.L, f.s + PE.step / 2)]); }
      return merge(iv); };
    let sumL = 0, sumCov = 0;   // (the runs so far: a run lands over or under the share by whole clusters, so the next one aims to bring the total back to it)
    for (const r of runs) {
      const tol = 0.05 + 0.4 / r.L, aim = Math.max(0.3 - 0.8 * tol, Math.min(0.3 + 0.8 * tol, (PE.share * (sumL + r.L) - sumCov) / r.L));   // (V13p: each run within 0.05 + 0.4 / L of 0.30)
      const placed = [], baseSide = ph(r.pts[0][0], r.pts[0][1], 9917) < 0.5 ? 1 : -1;
      const tryAt = (sArc, side) => { const p = ptAt(r, sArc);   // (the cluster's centre `off` off the run's edge, and nearer or farther if that spot fails)
        for (const dof of [0, 0.07, -0.05]) {
          const off = PE.off[0] + (PE.off[1] - PE.off[0]) * ph(p.x, p.z, 9911) + dof, cx = r3(p.x + side * p.nx * (p.hw + off)), cz = r3(p.z + side * p.nz * (p.hw + off)), key = cx.toFixed(2) + ',' + cz.toFixed(2);
          if (bad.has(key)) continue;
          if (field.at(id, cx, cz).zone !== 'E' || !ok(cx, cz, padP, 0.3)) { bad.add(key); continue; }
          const e = footOf(r, cx, cz).e; if (e < 0.27 || e > 0.68) { bad.add(key); continue; }   // (a bend can bring the edge nearer than `off`)
          const sd = { x: cx, z: cz, zone: 'E', us: ph(cx, cz, 9913) }; if ([9300, 9600, 9900, 9950].some((salt) => build(sd, 'pebble', salt))) return true; bad.add(key); }
        return false; };
      for (let round = 0; round < 24; round++) {   // one cluster a round: of the spots along the run, the one that brings its cover nearest the share (and nearer than it is)
        const have = spans(r), cov = have.reduce((t, [lo, hi]) => t + hi - lo, 0) / r.L, cand = [];
        for (let sArc = 0.1; sArc <= r.L - 0.1 + 1e-9; sArc += 0.1) { const a = Math.max(0, sArc - PE.step / 2), b = Math.min(r.L, sArc + PE.step / 2); let g = b - a;
          for (const [lo, hi] of have) g -= Math.max(0, Math.min(b, hi) - Math.max(a, lo));
          if (g < 0.9 * PE.step - 1e-9) continue;   // (a spot that adds under most of a step stands by the last cluster: no string of them on one side)
          const miss = Math.abs(cov + g / r.L - aim); if (miss >= Math.abs(cov - aim) - 1e-9 || cov + g / r.L > 0.3 + tol - 0.02) continue;   // (and never past V13p's own limit for the run)
          const p = ptAt(r, sArc); cand.push({ s: sArc, miss: Math.round(miss * 50), key: ph(p.x, p.z, 9907) }); }
        cand.sort((a, b) => a.miss - b.miss || b.key - a.key || a.s - b.s);
        let done = false;
        const mine = []; for (const k of clusters) { if (k.kind !== 'pebble' || k.zone !== 'E') continue; const f = footOf(r, k.x, k.z); if (f.e >= 0.25 - 1e-9 && f.e <= 0.7 + 1e-9) mine.push({ s: f.s, side: f.side }); }   // (this run's clusters, the other runs' by the junctions among them)
        for (const away of [true, false]) {   // (the side away from the nearest cluster at any spot first, then the same side, but never within `string` of a cluster on it: they alternate wherever the ground allows, and no string of them runs down one side)
          for (const c of cand) { let nb = null; for (const q of mine) if (!nb || Math.abs(q.s - c.s) < Math.abs(nb.s - c.s)) nb = q; const side = (nb ? -nb.side : baseSide) * (away ? 1 : -1);
            if (!away && mine.some((q) => q.side === side && Math.abs(q.s - c.s) < PE.string)) continue;
            if (tryAt(c.s, side)) { placed.push({ s: c.s, side }); done = true; break; } }
          if (done) break; }
        if (!done) break; }
      sumL += r.L; sumCov += spans(r).reduce((t, [lo, hi]) => t + hi - lo, 0);
    }
  }
  return { items, clusters, reeds: reeds.map((r) => ({ x: r.x, z: r.z, height: r.height, head: r.head, cl: r.cl })), stretches: stretches.map((S) => ({ ...S })) };
}

// ---- farm occlusion: rays from a camera to farm sample points vs docked pieces (tops) + tall props ----
export function farmOcclusion(bp, comp, camPos, unlocked) {
  const G = bp.config.game, GA = G.GARDEN, targets = [];
  for (const [dx, dz] of [[0, 0], [1.4, 0], [-1.4, 0], [0, 1.2], [0, -1.2]]) targets.push([G.HOUSE.x + dx, 1.2, G.HOUSE.z + dz]);
  targets.push([G.HOUSE.x, 2.6, G.HOUSE.z]);
  G.PLOT_SLOTS.forEach(([c, r]) => targets.push([GA.x0 + GA.cell * (c + 0.5), 0.12, GA.z0 + GA.cell * (r + 0.5)]));
  targets.push([G.POND.x, 0.06, G.POND.z]);
  const tris = [];
  for (const id of unlocked) {
    if (id === 'main') continue; const pc = bp.pieces[id], P = pc.positions, pv = pc.pivot;
    for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue; const o = t * 9; tris.push([P[o] + pv[0], P[o + 1] + pv[1], P[o + 2] + pv[2], P[o + 3] + pv[0], P[o + 4] + pv[1], P[o + 5] + pv[2], P[o + 6] + pv[0], P[o + 7] + pv[1], P[o + 8] + pv[2]]); }
  }
  const cyl = [];
  for (const id of unlocked) { if (id === 'main') continue; const O = comp.pieces[id];
    for (const t of O.trees) cyl.push({ x: t.x, z: t.z, r: 0.75 * t.scale / 0.62 * 0.62, y0: bp.H(t.x, t.z), y1: bp.H(t.x, t.z) + t.h, what: id + ':tree' });
    for (const p of O.placeholders) cyl.push({ x: p.x, z: p.z, r: 0.4, y0: bp.H(p.x, p.z), y1: bp.H(p.x, p.z) + p.h, what: id + ':placeholder' }); }
  const rayTri = (o, d, T) => { const e1 = [T[3] - T[0], T[4] - T[1], T[5] - T[2]], e2 = [T[6] - T[0], T[7] - T[1], T[8] - T[2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]], det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) return -1; const inv = 1 / det, s = [o[0] - T[0], o[1] - T[1], o[2] - T[2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv; if (u < 0 || u > 1) return -1;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv; if (v < 0 || u + v > 1) return -1;
    return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv; };
  let blockedN = 0; const hits = [];
  for (const tg of targets) {
    const d = [tg[0] - camPos[0], tg[1] - camPos[1], tg[2] - camPos[2]], L = Math.hypot(...d); d[0] /= L; d[1] /= L; d[2] /= L;
    let hit = null;
    for (const T of tris) { const t = rayTri(camPos, d, T); if (t > 0 && t < L - 0.05) { hit = 'terrain'; break; } }
    if (!hit) for (const c of cyl) { // closest approach of the ray to the cylinder axis
      const ox = camPos[0] - c.x, oz = camPos[2] - c.z, a = d[0] * d[0] + d[2] * d[2], b = 2 * (ox * d[0] + oz * d[2]), cc = ox * ox + oz * oz - c.r * c.r, disc = b * b - 4 * a * cc;
      if (disc < 0) continue; const t = (-b - Math.sqrt(disc)) / (2 * a); if (t <= 0 || t > L - 0.05) continue; const y = camPos[1] + d[1] * t; if (y >= c.y0 && y <= c.y1) { hit = c.what; break; } }
    if (hit) { blockedN++; hits.push(hit); }
  }
  return { targets: targets.length, blocked: blockedN, hits };
}

// ---- LOOK-BRIEF PHASE 2: TERRAIN PAINT (grass variation + warm stone) from a lookPresets.json preset ----
// paintBlueprint(bp, comp, look, L) -> { [pieceId]: Float32Array } vertex colours (LINEAR, one row per corner = piece.colors'
// layout). look = a lookPresets.json preset (its `grass` + `stone` sections, colours #RRGGBB sRGB). With both disabled the
// result IS each piece's base colour array (bit-identical: 'Game (current)' / 'Proof warm (v4)' keep rendering as before).
//   grass (top faces, PER VERTEX from world position only, so neighbouring triangles agree: no per-triangle noise):
//     3 greens cool -> mid -> warm blended by a warped low-frequency fBm (patchSize u, contrast, balance); toward `lush`
//     within waterRadius of the exported water (lake / river / outflow / pond / stream / tarn / hot spring); toward `dry`
//     with height (highFrom -> highTo, world y); darkened by a cliff-base band (ground rising above within cliffReach) and
//     a forest-edge band (tree density within forestReach) = fake AO. The soil / rock blends of the base stay per face.
//   stone (risers + coast walls + seams + underside): warm ramp face -> dark strata; lighter `top` toward a riser's top /
//     under a wall's lip (topLight), darker `dark` toward the foot / the wall base (baseDark), per-face facet variation;
//     the underside shades from `under` to `deep` with depth (underFrom -> underTo u below the top) and toward `hazeColor`
//     (undersideHaze), so it lightens into the haze instead of ending as a dark mass. Thin grassy lip + soil band kept.
// Deterministic: bp.noise + positions; the island fields (top-surface heights, water, trees) are cached per (bp, comp).
const PAINT_FIELDS = new WeakMap();
function paintFields(bp, comp) {
  const hit = PAINT_FIELDS.get(bp); if (hit && hit.comp === comp) return hit;
  const R = Math.ceil(bp.maxRc + 3), cs = 0.25, n = Math.ceil(2 * R / cs) + 1;
  const hi = new Float32Array(n * n).fill(-Infinity), lo = new Float32Array(n * n).fill(Infinity);
  for (const id of bp.order) { const pc = bp.pieces[id], P = pc.positions, pv = pc.pivot;
    for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue;
      for (let q = 0; q < 3; q++) { const o = t * 9 + q * 3, y = P[o + 1] + pv[1], i = Math.floor((P[o] + pv[0] + R) / cs), j = Math.floor((P[o + 2] + pv[2] + R) / cs);
        if (i < 0 || j < 0 || i >= n || j >= n) continue; const k = j * n + i; if (y > hi[k]) hi[k] = y; if (y < lo[k]) lo[k] = y; } } }
  // water = the exported shapes (comp.water): circles [x, z, r], ribbon segments [ax, az, bx, bz, halfW a, halfW b], polygons
  // (water rev 1: the farm pond is its art-owned teardrop polygon, the farm stream its dense line; the game's blob circle only without it)
  const W = comp.water, FWP = W.main.pond.r == null, circles = FWP ? [] : [[W.main.pond.at[0], W.main.pond.at[1], W.main.pond.r]], segs = [], polys = [];
  const ribbon = (pts) => { for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z, (pts[i].width || 0.5) / 2, (pts[i + 1].width || 0.5) / 2]); };
  ribbon(W.main.stream.line || W.main.stream.points); ribbon(W.wetland.river.points); ribbon(W.wetland.outflow.points);
  for (const [poly, level] of [...(FWP ? [[W.main.pond.outline, W.main.pond.level]] : []), [W.wetland.lake.outline, W.wetland.lake.level], [W.highland.tarn.outline, W.highland.tarn.level], [W.highland.hotSpring.outline, W.highland.hotSpring.level]]) {
    let bb = [1e9, 1e9, -1e9, -1e9]; for (const [x, z] of poly) bb = [Math.min(bb[0], x), Math.min(bb[1], z), Math.max(bb[2], x), Math.max(bb[3], z)];
    polys.push({ poly, level, bb }); for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; segs.push([a[0], a[1], b[0], b[1], 0, 0]); } }
  const trees = []; for (const id of bp.order) for (const t of comp.pieces[id].trees) trees.push([t.x, t.z, t.kind === 'pine' ? t.scale / 0.8 : t.scale / 0.62]);
  const TG = 2, tgrid = new Map(); for (const t of trees) { const k = Math.floor(t[0] / TG) + ',' + Math.floor(t[1] / TG); (tgrid.get(k) || tgrid.set(k, []).get(k)).push(t); }
  const F = {
    comp, R, cs, n, hi, lo,
    // max / min top-surface height within r of (x, z), and the distance-weighted "how much higher ground is near" (0..1)
    extreme(x, z, r, useMax) { const m = Math.ceil(r / cs), ci = Math.floor((x + R) / cs), cj = Math.floor((z + R) / cs); let best = useMax ? -Infinity : Infinity;
      for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) { if ((a * a + b * b) * cs * cs > r * r) continue; const i = ci + a, j = cj + b; if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const v = useMax ? hi[j * n + i] : lo[j * n + i]; if (useMax ? v > best : v < best) best = v; }
      return best; },
    rise(x, z, y, reach, r0, r1) { const m = Math.ceil(reach / cs), ci = Math.floor((x + R) / cs), cj = Math.floor((z + R) / cs); let best = 0;
      for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) { const i = ci + a, j = cj + b; if (i < 0 || j < 0 || i >= n || j >= n) continue; const h = hi[j * n + i] - y; if (!(h > r0)) continue;
        const d = Math.hypot(a, b) * cs; if (d >= reach) continue; const w = smoothstep(r0, r1, h) * (1 - smoothstep(0, reach, d)); if (w > best) best = w; }
      return best; },
    // distance OUTSIDE the nearest water edge (u); -1 = under water
    water(x, z, y, reach) {
      for (const P of polys) if (x >= P.bb[0] && z >= P.bb[1] && x <= P.bb[2] && z <= P.bb[3] && y < P.level + 0.06 && inLoop(P.poly, x, z)) return -1;
      let d = Infinity;
      for (const [cx, cz, r] of circles) d = Math.min(d, Math.hypot(x - cx, z - cz) - r);
      for (const [ax, az, bx, bz, ha, hb] of segs) {
        if (Math.min(ax, bx) - reach - 1 > x || Math.max(ax, bx) + reach + 1 < x || Math.min(az, bz) - reach - 1 > z || Math.max(az, bz) + reach + 1 < z) continue;
        const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-12, t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
        d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t) - (ha + (hb - ha) * t)); }
      return d; },
    // tree density: sum of a smooth bump (1 - smoothstep(0, reach, d)) x canopy size over the trees within reach
    trees(x, z, reach) { let s = 0; const m = Math.ceil(reach / TG), ci = Math.floor(x / TG), cj = Math.floor(z / TG);
      for (let a = -m; a <= m; a++) for (let b = -m; b <= m; b++) for (const [tx, tz, sc] of tgrid.get((ci + a) + ',' + (cj + b)) || []) { const d = Math.hypot(tx - x, tz - z); if (d < reach) s += (1 - smoothstep(0, reach, d)) * sc; }
      return s; },
  };
  PAINT_FIELDS.set(bp, F); return F;
}
export function paintBlueprint(bp, comp, look, L) {
  const GS = look && look.grass, SS = look && look.stone, gOn = !!(GS && GS.enabled), sOn = !!(SS && SS.enabled), out = {};
  if (!gOn && !sOn) { for (const id of bp.order) out[id] = bp.pieces[id].colors; return out; }
  const F = paintFields(bp, comp), A = bp.config, B = A.blueprint, PL = L.palette, noise = bp.noise, lin = (h) => hexToLinear(h);
  const WC = B.wallColour || { lip: [0.15, 0.4], soil: [0.4, 0.9], soilMix: 0.85, under: 0.18 }, wallH = (B.underside && B.underside.wallH) || 2;
  const soil = lin(PL.Soil), mixIn = (o, c, k) => { o[0] += (c[0] - o[0]) * k; o[1] += (c[1] - o[1]) * k; o[2] += (c[2] - o[2]) * k; };
  const G = gOn ? { warm: lin(GS.warm), mid: lin(GS.mid), cool: lin(GS.cool), lush: lin(GS.lush), dry: lin(GS.dry),
    yellow: lin(LAWN.yellow), deep: lin(LAWN.deep), clover: lin(LAWN.clover), tall: lin(LAWN.tall), worn: lin(LAWN.worn) } : null;
  // the farm's paths (world polylines: the layout's dirt paths and the trunk runs) for the worn grass along them
  const wornSegs = []; for (const q of (comp.pieces && comp.pieces.main && comp.pieces.main.paths) || []) for (let i = 0; i < q.pts.length - 1; i++) { const [ax, az] = q.pts[i], [bx, bz] = q.pts[i + 1];
    wornSegs.push([ax, az, bx, bz, (q.widths ? Math.max(q.widths[i], q.widths[i + 1]) : q.width) / 2]); }
  const wornAt = (x, z) => { let best = 0; for (const [ax, az, bx, bz, hw] of wornSegs) { const r = hw + LAWN.wornReach;
    if (Math.min(ax, bx) - r > x || Math.max(ax, bx) + r < x || Math.min(az, bz) - r > z || Math.max(az, bz) + r < z) continue;
    const dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1), d = Math.hypot(x - ax - dx * t, z - az - dz * t) - hw;
    best = Math.max(best, 1 - smoothstep(0.05, LAWN.wornReach, d)); } return best; };
  // the zone paint (MAIN; LAWN's a* / b* / c* / dry* / mainLushReach): the zone field, built once per call (groundZones caches it per
  // comp.pieces, so composeBlueprint's own serves), and the shade pools' U blurred by a cSoft u gaussian on a lattice over the pools'
  // boxes, so a pool's edge is wider than MAIN's ~0.22 u mesh edges (U's own edge ramp is 0.07-0.44 u)
  const ZF = gOn && bp.pieces.main ? groundZones(bp, comp, comp.water) : null;
  const midWarm = gOn ? [0, 1, 2].map((c) => (G.mid[c] + G.warm[c]) / 2) : null, dryE = gOn ? lin(LAWN.dry) : null;
  let Usoft = () => 0;
  if (ZF) {
    const PLc = groundConfig(A).pools, pl = ZF.pools('main').map((p) => ({ x: p.x, z: p.z, m: p.r * PLc.size[1] })), h = 0.15, sg = LAWN.cSoft / h, kr = Math.ceil(3 * sg), pad = (kr + 1) * h;
    if (pl.length) {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const p of pl) { x0 = Math.min(x0, p.x - p.m - pad); z0 = Math.min(z0, p.z - p.m - pad); x1 = Math.max(x1, p.x + p.m + pad); z1 = Math.max(z1, p.z + p.m + pad); }
      const nx = Math.ceil((x1 - x0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1, raw = new Float32Array(nx * nz), tmp = new Float32Array(nx * nz), Ug = new Float32Array(nx * nz);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * h, z = z0 + j * h;   // (U is 0 outside every pool's reach: no lookup there)
        if (pl.some((p) => Math.abs(x - p.x) < p.m && Math.abs(z - p.z) < p.m)) raw[j * nx + i] = ZF.at('main', x, z).U; }
      const kw = Array.from({ length: 2 * kr + 1 }, (_, k) => Math.exp(-0.5 * ((k - kr) / sg) ** 2)), ks = kw.reduce((s, v) => s + v, 0);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let k = -kr; k <= kr; k++) { const ii = i + k; if (ii >= 0 && ii < nx) s += kw[k + kr] * raw[j * nx + ii]; } tmp[j * nx + i] = s / ks; }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let k = -kr; k <= kr; k++) { const jj = j + k; if (jj >= 0 && jj < nz) s += kw[k + kr] * tmp[jj * nx + i]; } Ug[j * nx + i] = s / ks; }
      Usoft = (x, z) => { const fi = (x - x0) / h, fj = (z - z0) / h; if (!(fi >= 0 && fj >= 0 && fi < nx - 1 && fj < nz - 1)) return 0;
        const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, k = j * nx + i;
        return (Ug[k] * (1 - u) + Ug[k + 1] * u) * (1 - v) + (Ug[k + nx] * (1 - u) + Ug[k + nx + 1] * u) * v; };
    }
  }
  let curWild = false;   // the piece being painted is a wild isle (not the farm): the cover field's kinds
  const S = sOn ? { top: lin(SS.top), face: lin(SS.face), dark: lin(SS.dark), under: lin(SS.under), deep: lin(SS.deep), haze: lin(SS.hazeColor) } : null;
  // grass colour of a world vertex (linear) -> o
  function grassAt(x, y, z, o) {
    // MAIN's zone weights, each continuous in x, z (no zone switch: a step finer than the mesh reads as per-triangle noise, phase2 G1c).
    // A: 1 in its halo rings and the tidy yards, ramping to 0 over aEdge u outside a halo; inside a clear spot's footprint (nothing
    // grows there: it is not A) it fades out over aEdge, so the garden inside its fence, the house and the slots keep the lawn's
    // variety. B: the wild edge W, not in A. U: the blurred shade pools. dPath: the dry edge
    const q = !curWild && ZF ? ZF.at('main', x, z) : null;
    const wA = q ? smoothstep(-LAWN.aEdge, 0, q.aHalo) * (1 - smoothstep(0, LAWN.aEdge, -q.dClear)) : 0;
    const p = GS.patchSize, wx = x + 0.35 * p * noise.fbm(x / (p * 1.7) + 3.1, z / (p * 1.7) - 1.7, 2, 2, 0.5), wz = z + 0.35 * p * noise.fbm(x / (p * 1.7) - 6.3, z / (p * 1.7) + 4.9, 2, 2, 0.5);
    const ms = LAWN.mesoSize, meso = LAWN.meso * (1 - (1 - LAWN.aMeso) * wA);
    const t = clamp(0.5 + GS.contrast * noise.fbm(wx / p + 17.3, wz / p - 9.1, 3, 2, 0.5) + meso * noise.fbm(x / ms + 41.3, z / ms - 7.7, 1, 2, 0.5) + 0.5 * GS.balance, 0, 1);
    const a = t < 0.5 ? G.cool : G.mid, b = t < 0.5 ? G.mid : G.warm, k = t < 0.5 ? t * 2 : t * 2 - 1;
    o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k;
    // the living-ground lawn: yellow-green and deep-green patches, the ground under the cover's patches, worn grass along the farm's paths
    mixIn(o, G.yellow, LAWN.yellowMix * smoothstep(0.5, 0.9, 0.5 + 0.5 * noise.fbm(x / LAWN.yellowSize + 13.1, z / LAWN.yellowSize + 29.4, 2, 2, 0.5)));
    mixIn(o, G.deep, LAWN.deepMix * smoothstep(0.52, 0.9, 0.5 + 0.5 * noise.fbm(x / LAWN.deepSize - 21.2, z / LAWN.deepSize + 5.6, 2, 2, 0.5)));
    if (q) {   // (A and B before the clover ground, so the farm's clover patches keep their darker ground in A and B: L2)
      if (wA > 0) mixIn(o, midWarm, LAWN.aNudge * wA);                                                       // A: an even, fresh lawn under the play
      mixIn(o, G.yellow, LAWN.bYellow * smoothstep(LAWN.bEdge[0], LAWN.bEdge[1], q.W) * (1 - wA));            // B: the warmer wild edge
    }
    // under the cover's patches: coverField's P and F without their finest octaves (the same patches, no fast detail in the ground
    // colour) and with wider edges than the plants' (no hard rim of colour round a patch)
    const Pl = 0.5 + 0.5 * noise.fbm(x * 0.42 + 31.7, z * 0.42 - 12.9, 2, 2, 0.5), Fl = 0.5 + 0.5 * noise.fbm(x * 0.9 + 70.2, z * 0.9 + 3.3, 1, 2, 0.5);
    const clo = curWild ? smoothstep(0.5, 0.86, 1 - Pl) * (1 - smoothstep(0.5, 0.82, Fl)) : smoothstep(0.38, 0.94, Pl);   // (the farm: a stronger tint over a wider edge, so the clover ground reads, smoothly)
    mixIn(o, G.clover, (curWild ? LAWN.cloverMix : LAWN.farmCloverMix) * clo); if (curWild) mixIn(o, G.tall, LAWN.tallMix * smoothstep(0.44, 0.8, Pl));
    if (q) {
      const u = Usoft(x, z); if (u > 0) mixIn(o, G.deep, LAWN.cDeep * u);                                     // C: the shade pools
      mixIn(o, dryE, LAWN.dryMix * (1 - smoothstep(0, LAWN.dryReach, q.dPath)));                              // E: the dry edge, under the worn band
    }
    if (!curWild && wornSegs.length) { const w = wornAt(x, z); if (w) mixIn(o, G.worn, LAWN.wornMix * w); }
    if (GS.waterLush > 0) {
      if (q) { const R2 = LAWN.mainLushReach, d = F.water(x, z, y, R2); if (d < R2) mixIn(o, G.lush, GS.waterLush * (1 - smoothstep(0.35, R2, d))); }   // D: MAIN's narrower band, from the teardrop and stream
      else { const d = F.water(x, z, y, GS.waterRadius); if (d < GS.waterRadius) mixIn(o, G.lush, GS.waterLush * (1 - smoothstep(0, GS.waterRadius, Math.max(0, d)))); }
    }
    if (GS.highDry > 0) mixIn(o, G.dry, GS.highDry * smoothstep(GS.highFrom, GS.highTo, y));
    const aoC = GS.cliffBaseAO > 0 ? GS.cliffBaseAO * LAWN.cliffAO * F.rise(x, z, y, GS.cliffReach, 0.35, 1.0) : 0;
    const aoF = GS.forestEdgeAO > 0 ? GS.forestEdgeAO * smoothstep(0.5, 2.5, F.trees(x, z, GS.forestReach)) : 0;
    const k2 = 1 - (1 - aoC) * (1 - aoF); o[0] *= 1 - k2; o[1] *= 1 - k2; o[2] *= 1 - k2;
    return o;
  }
  const res = {}, g = [0, 0, 0], rc = [0, 0, 0];
  for (const id of bp.order) {
    const pc = bp.pieces[id], base = pc.colors, P = pc.positions, pv = pc.pivot, FC = pc.faces, PT = pc.paint, col = new Float32Array(base);
    curWild = id !== 'main';
    const vG = new Map(), vU = new Map();   // per unique vertex: grass colour, riser position u (0 foot .. 1 top edge)
    for (let t = 0; t < pc.faceCount; t++) {
      const top = pc.tags[t] === TAG.top, rk = PT.rk[t], sw = PT.sw[t];
      if (top && !(gOn && rk < 1) && !(sOn && rk > 0)) continue;   // nothing of this face is repainted
      if (!top && !sOn) continue;   // (seam lips with stone off: seamLipColours below, from the top colours)
      for (let q = 0; q < 3; q++) {
        const o = t * 9 + q * 3, vi = FC[t * 3 + q], x = P[o] + pv[0], y = P[o + 1] + pv[1], z = P[o + 2] + pv[2];
        if (top) {
          // grass part (new or the base's), soil part, rock part (new or the base's)
          let gr = null;
          if (gOn && rk < 1) { gr = vG.get(vi); if (!gr) { gr = grassAt(x, y, z, [0, 0, 0]); vG.set(vi, gr); } }
          if (sOn && rk > 0) {
            let u = vU.get(vi); if (u === undefined) { const h1 = F.extreme(x, z, 1.5, true), h0 = F.extreme(x, z, 1.5, false); u = h1 - h0 > 0.5 ? clamp((y - h0) / (h1 - h0), 0, 1) : 0.5; vU.set(vi, u); }
            for (let c = 0; c < 3; c++) rc[c] = S.face[c];
            mixIn(rc, S.top, SS.topLight * smoothstep(0.6, 1.0, u)); mixIn(rc, S.dark, SS.baseDark * (1 - smoothstep(0.0, 0.45, u)));
            const fct = 1 + SS.facet * (hash3(t, 5, 77 + (bp.vary || 0)) - 0.5) - 0.25 * SS.facet * clamp((PT.slope[t] - 0.5) * 2, 0, 1);   // facets: per-face jitter, steeper a touch darker
            for (let c = 0; c < 3; c++) rc[c] *= fct;
          }
          if (!gr || !(sOn && rk > 0)) {   // one side keeps the base: recover it from the base colour (exact when rk is 0 or 1)
            if (!gr) { if (rk >= 1) { for (let c = 0; c < 3; c++) col[o + c] = rc[c]; continue; } }
            else if (rk <= 0) { for (let c = 0; c < 3; c++) col[o + c] = gr[c] * (1 - sw) + soil[c] * sw; continue; }
          }
          // a blended face (0 < rk < 1): rebuild from parts; a missing part = the base colour's (approximation)
          for (let c = 0; c < 3; c++) { const gc = gr ? gr[c] : base[o + c], kc = sOn ? rc[c] : base[o + c]; col[o + c] = gc * (1 - rk - sw) + soil[c] * sw + kc * rk; }
          continue;
        }
        // walls / seams / underside / cone (stone on)
        const hr = Number.isFinite(PT.hRel[vi]) ? PT.hRel[vi] : 0, under = pc.tags[t] !== TAG.coast && pc.tags[t] !== TAG.seam && pc.tags[t] !== TAG.skirt;
        const bandF = y / 0.85 + 0.6 * noise.vnoise(x * 0.3 + 7.7, z * 0.3 - 2.2), band = Math.floor(bandF), fr = smoothstep(0.75, 1, bandF - band);
        let k = hash3(band, 17, 211) * (1 - fr) + hash3(band + 1, 17, 211) * fr;
        k = clamp(k + SS.facet * (hash3(t, 3, 9) - 0.5) * (0.6 + smoothstep(0.8, 3.0, hr)), 0, 1);
        for (let c = 0; c < 3; c++) rc[c] = S.face[c] + (S.dark[c] - S.face[c]) * 0.5 * k;
        mixIn(rc, S.top, SS.topLight * (1 - smoothstep(0.1, 0.9, hr)));
        mixIn(rc, S.dark, SS.baseDark * smoothstep(0.7, wallH, hr) * (1 - smoothstep(wallH + 0.5, wallH + 3.0, hr)));
        if (under || hr > wallH) { const uk = smoothstep(SS.underFrom, SS.underTo, hr), w = smoothstep(wallH * 0.75, wallH + 1.2, hr);
          for (let c = 0; c < 3; c++) g[c] = S.under[c] + (S.deep[c] - S.under[c]) * uk; mixIn(g, S.haze, SS.undersideHaze * uk); mixIn(rc, g, w); }
        if (hr < WC.soil[1]) {   // the thin grassy lip + soil band at the top of every curtain (as the base)
          const lipK = 1 - smoothstep(WC.lip[0], WC.lip[1], hr), soilK = 1 - smoothstep(WC.soil[0], WC.soil[1], hr), lip = gOn ? G.cool : null;
          mixIn(rc, soil, soilK * WC.soilMix); if (lip) mixIn(rc, lip, lipK); else { const bl = [base[o], base[o + 1], base[o + 2]]; mixIn(rc, bl, lipK); }
        }
        col[o] = rc[0]; col[o + 1] = rc[1]; col[o + 2] = rc[2];
      }
    }
    if (gOn && GS.seamMatch) seamLipColours(pc, col);
    res[id] = col;
  }
  return res;
}

// ---- LOOK CORE: SEAM LIPS (preset grass.seamMatch) ----
// The hairlines across the meadow at piece borders are NOT a normal / colour mismatch on the top surface (both sides of a seam
// share position-derived colours and the analytic-gradient normal): they are the pieces' own seam / inner walls and MAIN's cone
// (needed when a piece rises on its own) seen through sub-pixel cracks between the two top surfaces, which have different pivots,
// so their float32 clip positions differ by ULPs. Through the cracks those walls showed their sideways normal (lit like a cliff)
// and their grassy-lip stone colour = a dashed dark line. Fix without moving anything: the RIM vertices of seam / inner / cone
// faces (the vertex they share with the top surface) take the parent top surface's colour and normal at that vertex, so a crack
// pixel shades exactly like the grass around it. Lower wall vertices are unchanged (the wall still reads as rock when a piece is
// shown alone). Positions, heights and the export are untouched.
const LIP_TAGS = new Set([TAG.seam, TAG.inner, TAG.cone]);
function topCornerMap(pc, arr) {   // vertex index -> mean of the per-corner rows of `arr` over the TOP faces using it
  const acc = new Map(), FC = pc.faces;
  for (let t = 0; t < pc.faceCount; t++) { if (pc.tags[t] !== TAG.top) continue;
    for (let q = 0; q < 3; q++) { const vi = FC[t * 3 + q], o = t * 9 + q * 3; let a = acc.get(vi); if (!a) { a = [0, 0, 0, 0]; acc.set(vi, a); } a[0] += arr[o]; a[1] += arr[o + 1]; a[2] += arr[o + 2]; a[3]++; } }
  return acc;
}
function seamLipColours(pc, col) {
  const top = topCornerMap(pc, col), FC = pc.faces;
  for (let t = 0; t < pc.faceCount; t++) { if (!LIP_TAGS.has(pc.tags[t])) continue;
    for (let q = 0; q < 3; q++) { const a = top.get(FC[t * 3 + q]); if (!a) continue; const o = t * 9 + q * 3; col[o] = a[0] / a[3]; col[o + 1] = a[1] / a[3]; col[o + 2] = a[2] / a[3]; } }
}
// seamLipNormals(bp) -> { [pieceId]: Float32Array } = a copy of each piece's normals with the seam / inner / cone rim corners set to
// the (normalised mean) normal of the top surface at that shared vertex
export function seamLipNormals(bp) {
  const out = {};
  for (const id of bp.order) {
    const pc = bp.pieces[id], N = new Float32Array(pc.normals), top = topCornerMap(pc, pc.normals), FC = pc.faces;
    for (let t = 0; t < pc.faceCount; t++) { if (!LIP_TAGS.has(pc.tags[t])) continue;
      for (let q = 0; q < 3; q++) { const a = top.get(FC[t * 3 + q]); if (!a) continue; const l = Math.hypot(a[0], a[1], a[2]) || 1, o = t * 9 + q * 3; N[o] = a[0] / l; N[o + 1] = a[1] / l; N[o + 2] = a[2] / l; } }
    out[id] = N;
  }
  return out;
}

// ---- spec section 10 export (piece data for the game) ----
// depth / bottomLocal describe the GAME's pieces: the baked ones hang by underside.gameScale (the bake profile's underScale), so the
// lowest point is taken with the underside vertices re-evaluated at that scale (walls only ever interpolate between their top and
// their underside vertex, so they never hold the minimum). v5 (seam taper): a petal's lowest point now sits mid-lobe, where the
// default and the bake resolutions sample the underside differently (up to ~1.3 u apart), so the exporters that write the JSON
// (build.mjs, blueprint.test R) pass opts.gameBottoms = the bake-resolution build's bottoms (lib/bake.mjs gameBottoms()): the JSON
// then matches the baked GLBs exactly (bake.test B13a); without it, the re-evaluated estimate below. flatZones: a zone whose centre
// is off its piece's top is not exported (generic rule; e.g. MAIN's staticTree at (-6.2, -5.6), outside MAIN's outline).
const U_KEYS = new Set(['ru', 'cu', 'su', 'u', 'tu', 'axu']), WALL_KEYS = new Set(['sc', 'hc', 'ax', 'cc', 'sk']);
function gameBottom(bp, pc) {
  const GS = bp.config.blueprint.underside && bp.config.blueprint.underside.gameScale;
  if (GS == null || GS === 1 || !bp.Uat) return pc.bottom;
  let mn = Infinity;
  for (const key of pc.keys) { const pre = key.split(':')[0]; if (WALL_KEYS.has(pre)) continue; const q = bp.store.get(key); mn = Math.min(mn, U_KEYS.has(pre) ? bp.Ukey(key, GS) : q[1]); }
  return mn - pc.pivot[1];
}
export function exportBlueprint(bp, comp, opts = {}) {
  const A = bp.config, B = A.blueprint, r4 = (v) => +(+v).toFixed(4), water = comp.water, GB = opts.gameBottoms || null;
  const pieces = {};
  for (const id of bp.order) {
    const pc = bp.pieces[id], pv = pc.pivot, loc = ([x, z]) => [r4(x - pv[0]), r4(z - pv[2])], gb = GB && GB[id] != null ? GB[id] : gameBottom(bp, pc);
    const onTop = (x, z) => { try { pc.heightStrict(x - pv[0], z - pv[2]); return true; } catch { return false; } };   // (world x, z)
    const seamOf = (si) => { const pts = bp.seamPts[si]; return { world: pts.map(([x, z]) => [r4(x), r4(z)]), local: pts.map(loc), heights: pts.map(([x, z]) => r4(bp.H(x, z))) }; };
    const entry = { id, dockedPosition: pv.map(r4), builtBy: id === 'main' ? 'world.config archipelago.game.MAIN (buildIsland over the parent heightfield)' : `world.config archipelago.blueprint.pieces[${pc.def.id}] (buildBlueprint cut piece)`,
      depth: r4(-gb / 5.5), bottomLocal: r4(gb), outline: pc.loopLocal.filter((_, i) => i % 2 === 0 || pc.loopLocal.length < 400).map(([x, z]) => [r4(x), r4(z)]) };
    if (id === 'main') { entry.outlineFormula = 'terrain.ts makeIsland outline, MAIN spec (seed 11, radius 8.8) - unchanged'; entry.seams = bp.order.filter((q) => q !== 'main').map((q) => ({ with: q, mainTheta: bp.pieces[q].mainTheta.map(r4) })); }
    else {
      const tL = pc.mainTheta[0], tR = pc.mainTheta[1];
      entry.unlock = pc.def.unlock; entry.identity = pc.def.identity; entry.focal = pc.def.focal;
      entry.mainThetaRange = { deg: [r4(tL), r4(tR)], rad: [r4(tL * DEG), r4(tR * DEG)], note: 'MAIN rim arc this piece docks along (CCW, terrain.ts theta)' };
      entry.mainArc = { world: pc.jList.map((j) => { const q = bp.store.get('r:' + j); return [r4(q[0]), r4(q[2])]; }) };
      entry.mainArc.local = entry.mainArc.world.map(loc);
      const lo = bp.seams[pc.seamL], hi = bp.seams[pc.seamR];
      entry.seams = [{ with: lo.lo, side: 'low-theta', ...seamOf(pc.seamL) }, { with: hi.hi, side: 'high-theta', ...seamOf(pc.seamR) }];
      entry.flatCore = { r: pc.def.core, at: [0, 0] };
    }
    entry.flatZones = (B.zones[id] || []).filter((zn) => onTop(zn.at[0], zn.at[1])).map((zn) => ({ id: zn.id, kind: zn.kind, at: loc(zn.at), r: zn.r, flat: zn.flat !== false, level: r4(bp.H(zn.at[0], zn.at[1]) - pv[1]), note: zn.note }));
    const zc = (zn) => (zn.type === 'disc' ? [zn.x, zn.z] : zn.type === 'capsule' ? [(zn.ax + zn.bx) / 2, (zn.az + zn.bz) / 2] : [(zn.x0 + zn.x1) / 2, (zn.z0 + zn.z1) / 2]);
    if (id === 'main') entry.flatZones = bp.zones.slice(0, bp.mainZoneCount).filter((zn) => onTop(...zc(zn))).map((zn) => ({ what: zn.what, type: zn.type, ...(zn.type === 'disc' ? { at: [r4(zn.x), r4(zn.z)], r: r4(zn.r) } : zn.type === 'capsule' ? { a: [r4(zn.ax), r4(zn.az)], b: [r4(zn.bx), r4(zn.bz)], r: r4(zn.r) } : { min: [r4(zn.x0), r4(zn.z0)], max: [r4(zn.x1), r4(zn.z1)] }), level: 0 }));
    const W = water[id]; if (W) { const toL = (o) => JSON.parse(JSON.stringify(o, (k, v) => v));
      entry.water = toL(W); entry.waterFrame = 'world xz + world y (subtract dockedPosition for local)'; }
    const anchors = (B.coastAnchors[id] || []).map((a) => { if (a.near) { const zn = (B.zones[id] || []).find((q) => q.id === a.near); return { id: a.id, world: zn.at.map(r4), local: loc(zn.at) }; }
      if (a.jetty) { const j = lakeJetty(bp, water); if (!j) return null; const yaw = Math.atan2(j.dir[0], j.dir[1]);   // (three rotation.y = yaw turns the model's +Z onto outward)
        return { id: a.id, world: j.origin.map(r4), local: loc(j.origin), outward: j.dir.map(r4), y: r4(j.level - pv[1]), yaw: r4(yaw), level: r4(j.level - pv[1]),
          shoreEnd: { local: loc(j.at), world: j.at.map(r4), bank: r4(j.bank) }, deck: { length: j.length, width: j.width, shoreEndZ: -a.jetty.origin },
          shedPatch: { at: loc(j.shed.at), world: j.shed.at.map(r4), r: j.shed.r, y: r4(bp.H(j.shed.at[0], j.shed.at[1]) - pv[1]) },
          note: 'the wetland_jetty model origin (deck centre): place it at (local x, y, z) = (at[0], level, at[1]) with rotation.y = yaw (its +Z, out over the water, = outward); its shore end (local z -0.85) is on the bank at shoreEnd; shedPatch = ground kept clear for a later small shed' }; }
      const t = a.theta * DEG, r = bp.Rc(t), w = [Math.cos(t) * r, Math.sin(t) * r]; return { id: a.id, world: w.map(r4), local: loc(w), outward: [r4(Math.cos(t)), r4(Math.sin(t))], y: r4(bp.H(w[0] * 0.99, w[1] * 0.99) - pv[1]) }; });
    if (anchors.filter(Boolean).length) entry.openCoastAnchors = anchors.filter(Boolean);
    pieces[id] = entry;
  }
  let across = 0, minAcross = 1e9; for (let i = 0; i < 360; i++) { const t = i / 360 * Math.PI, a = bp.Rc(t) + bp.Rc(t + Math.PI); across = Math.max(across, a); minAcross = Math.min(minAcross, a); }
  return { format: 'gitaway.blueprint-pieces/1', spec: 'art/config/world-layout.spec.md v3.1 section 10', source: A.source, theta: 'Math.atan2(z, x), terrain.ts convention',
    joinedSize: { maxCoastRadius: r4(bp.maxRc), maxAcross: r4(across), minAcross: r4(minAcross) }, order: bp.order, pieces };
}

const GT = {
  mulberry32, strSeed, cellSeed, makeNoise, clamp, smoothstep, smootherstep, lerp,
  buildCells, buildIslandCells, assignIslandStamps, assembleIslandModules,
  solveTierConstraint, maxNeighbourTierDelta, assignCellStamps,
  plateauHeight, terrainHeight, buildHeightGrid, gridTriangles, nodeXYZ, sampleTerrain,
  faceNormal, triArea2, faceBlend, edgeProfile, assembleModules, buildWorld,
  legacyRawTierField, legacyCliffCurtains, countFloatingTriangles, countDetachedTriangles,
  hexToLinear, linearToSrgb, terrainColours, buildPathNetwork, catmullRomCentripetal, resamplePolyline, farmStreamCtrl, farmStreamLine,
  // island core + blueprint (spec v3.1)
  TAG, gameRng, gameOutline, hash3, TINT_RANGE, texturedTint, angDiff, windowDeg, buildIsland, buildBlueprint, blueprintTiers,
  inLoop, pieceAt, blueprintWater, lakeJetty, keepClearHit, farmWaterHit, bakeProfile, GAME_GROUND_SPACING, GAME_GROUND_TOL, gridTopSampler, heightGridOf, gameGround, composeBlueprint,COVER, coverField, LAWN, GROUND, groundConfig, groundZones, farmOcclusion, exportBlueprint, ownIslandContract,
  // LOOK-BRIEF phase 2: preset-driven terrain paint (grass variation + warm stone); look core: seam lips
  paintBlueprint, seamLipNormals,
};
export default GT;
