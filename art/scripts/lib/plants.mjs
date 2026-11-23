// plants.mjs -- WORLDSEED-BRIEF "plants & shapes": procedural, deterministic vegetation geometry (tree variants + shrubs).
// Pure (no three, no DOM): tests/plants.test.mjs runs it in node; build.mjs hands it to viewer.mjs, which strips the `export`s
// and inlines it as window.__PLANTS__; arch-scene.js turns each variant into ONE BufferGeometry (trunk + crown merged, so one
// InstancedMesh per variant per piece). Which variant stands where = lib/terrain.mjs composeBlueprint (positions unchanged).
// CROWNS (own code; the technique follows the Worldseed study's fallback crown): several stretched low-poly blobs per crown
// with DOMED normals = the lobe's ellipsoid normal blended with the crown envelope's, so every lobe shades like a soft puff under
// the cel bands while the crown still reads as one mass. CONIFERS: stacked jagged tiers (rim points alternate out / in and droop),
// a bell profile for the stout pine. Per vertex: position, normal, colour (trunk: dark root -> trunk colour; leaves: a per-lobe
// value jitter around 1, the shader's 4-stop ramp multiplies it), aTreeH (0 = the lowest leaf vertex .. 1 = the top, -1 = trunk:
// no ramp / tint; the Phase-5 wind bends by it). Trees are about tree_round_a's size at scale 1, so the composition's scales hold.
const TAU = Math.PI * 2;
const hash = (a, b, c) => { let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const rngOf = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// unit icosphere (three's IcosahedronGeometry vertex / face order, CCW outward), subdivided `detail` times
function icosphere(detail) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => { const k = a < b ? a * 4096 + b : b * 4096 + a; let i = cache.get(k); if (i === undefined) { v.push(norm([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2])); i = v.length - 1; cache.set(k, i); } return i; };
    for (const [a, b, c] of f) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    f = nf;
  }
  return { v, f };
}
const ICO = [icosphere(0), icosphere(1)];

// geometry accumulator; tri() orients every triangle against an outward hint (robust winding for FrontSide rendering)
function geo() { return { p: [], n: [], c: [], h: [], i: [] }; }
function vert(G, p, n, c, h) { G.p.push(p[0], p[1], p[2]); const q = norm(n); G.n.push(q[0], q[1], q[2]); G.c.push(c[0], c[1], c[2]); G.h.push(h); return G.h.length - 1; }
function tri(G, a, b, c, hint) {
  const P = G.p, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
  const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) G.i.push(a, c, b); else G.i.push(a, b, c);
}

// a stretched, lumpy blob: o = { c, r: [rx, ry, rz], detail, seed, jit, value, crown: { c, r }, dome }
function lobe(G, o) {
  const S = ICO[o.detail], base = G.h.length, C = o.crown, val = [o.value, o.value, o.value];
  for (let i = 0; i < S.v.length; i++) {
    const u = S.v[i], j = 1 + o.jit * (hash(i, o.seed, 7) * 2 - 1), sq = u[1] < 0 ? 1 - 0.28 * -u[1] : 1;   // lumps; a flatter underside
    const p = [o.c[0] + u[0] * o.r[0] * j, o.c[1] + u[1] * o.r[1] * j * sq, o.c[2] + u[2] * o.r[2] * j];
    const nl = norm([u[0] / o.r[0], u[1] / o.r[1], u[2] / o.r[2]]);
    const nc = norm([(p[0] - C.c[0]) / (C.r[0] * C.r[0]), (p[1] - C.c[1]) / (C.r[1] * C.r[1]), (p[2] - C.c[2]) / (C.r[2] * C.r[2])]);
    vert(G, p, [nl[0] * (1 - o.dome) + nc[0] * o.dome, nl[1] * (1 - o.dome) + nc[1] * o.dome, nl[2] * (1 - o.dome) + nc[2] * o.dome], val, p[1]);
  }
  for (const [a, b, c] of S.f) { const m = [(S.v[a][0] + S.v[b][0] + S.v[c][0]), (S.v[a][1] + S.v[b][1] + S.v[c][1]), (S.v[a][2] + S.v[b][2] + S.v[c][2])]; tri(G, base + a, base + b, base + c, m); }
}

// a tapered tube along a polyline of rings [{ y | at: [x, y, z], r }], `sides` facets, smooth radial normals, trunk colours
function tube(G, rings, sides, colAt, seed) {
  const base = G.h.length, a0 = hash(seed, 3, 5) * TAU;
  for (let k = 0; k < rings.length; k++) {
    const R = rings[k], at = R.at || [0, R.y, 0], nx = rings[Math.min(k + 1, rings.length - 1)], pv = rings[Math.max(k - 1, 0)];
    const A = pv.at || [0, pv.y, 0], B = nx.at || [0, nx.y, 0], ax = norm([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
    const ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = norm([ax[1] * ref[2] - ax[2] * ref[1], ax[2] * ref[0] - ax[0] * ref[2], ax[0] * ref[1] - ax[1] * ref[0]]);
    const e2 = [ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0]];
    for (let s = 0; s < sides; s++) { const t = a0 + s / sides * TAU, d = [e1[0] * Math.cos(t) + e2[0] * Math.sin(t), e1[1] * Math.cos(t) + e2[1] * Math.sin(t), e1[2] * Math.cos(t) + e2[2] * Math.sin(t)];
      vert(G, [at[0] + d[0] * R.r, at[1] + d[1] * R.r, at[2] + d[2] * R.r], d, colAt(k / (rings.length - 1)), -1); }
  }
  for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < sides; s++) {
    const a = base + k * sides + s, b = base + k * sides + (s + 1) % sides, c = a + sides, d = b + sides, P = G.p;
    // outward hint = the quad centre minus the axis point at its height
    const ak = rings[k].at || [0, rings[k].y, 0], bk = rings[k + 1].at || [0, rings[k + 1].y, 0];
    const cx = (P[a * 3] + P[d * 3] - ak[0] - bk[0]) / 2, cy = (P[a * 3 + 1] + P[d * 3 + 1] - ak[1] - bk[1]) / 2, cz = (P[a * 3 + 2] + P[d * 3 + 2] - ak[2] - bk[2]) / 2;
    tri(G, a, b, c, [cx, cy, cz]); tri(G, b, d, c, [cx, cy, cz]);
  }
}

// one conifer tier: jagged drooping rim at y0, apex at y0 + h; bell > 0 adds a mid ring (rounded stout tier); underside closed
function tier(G, o) {
  const n = o.n * 2, rim = [], mid = [], under = [], val = [o.value, o.value, o.value], cy = o.y0 + o.h * 0.32;
  const dn = (p, side) => { const dx = p[0], dz = p[2], l = Math.hypot(dx, dz) || 1; const cone = norm([dx / l * o.h, o.R, dz / l * o.h]), dome = norm([p[0] / o.R, (p[1] - cy) / (o.h * 0.8), p[2] / o.R]);
    return side ? [cone[0] * 0.55 + dome[0] * 0.45, cone[1] * 0.55 + dome[1] * 0.45, cone[2] * 0.55 + dome[2] * 0.45] : [0, -1, 0]; };
  for (let s = 0; s < n; s++) {
    const t = o.rot + s / n * TAU, out = s % 2 === 0, j = 1 + 0.12 * (hash(s, o.seed, 11) * 2 - 1), r = o.R * (out ? 1 : o.inner) * j, y = o.y0 + (out ? -o.droop : o.droop * 0.4);
    const p = [Math.cos(t) * r, y, Math.sin(t) * r]; rim.push(vert(G, p, dn(p, true), val, y)); under.push(vert(G, p, [p[0] * 0.3, -1, p[2] * 0.3], val, y));
    if (o.bell) { const rm = o.R * o.bell * (out ? 1 : 0.93) * j, ym = o.y0 + o.h * 0.38, q = [Math.cos(t) * rm, ym, Math.sin(t) * rm]; mid.push(vert(G, q, dn(q, true), val, ym)); }
  }
  const apex = vert(G, [0, o.y0 + o.h, 0], [0, 1, 0], val, o.y0 + o.h), uc = vert(G, [0, o.y0 + o.h * 0.16, 0], [0, -1, 0], val, o.y0 + o.h * 0.16);
  const P = G.p, hintOut = (a, b) => [(P[a * 3] + P[b * 3]) / 2, 0.35 * o.R, (P[a * 3 + 2] + P[b * 3 + 2]) / 2];
  const ring = o.bell ? mid : rim;
  for (let s = 0; s < n; s++) { const a = ring[s], b = ring[(s + 1) % n]; tri(G, apex, a, b, hintOut(a, b)); }
  if (o.bell) for (let s = 0; s < n; s++) { const a = mid[s], b = mid[(s + 1) % n], c = rim[s], d = rim[(s + 1) % n]; tri(G, a, c, b, hintOut(c, d)); tri(G, b, c, d, hintOut(c, d)); }
  for (let s = 0; s < n; s++) tri(G, uc, under[s], under[(s + 1) % n], [0, -1, 0]);
}

function finish(G, kind) {
  let lo = Infinity, hi = -Infinity; for (const h of G.h) if (h !== -1) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const treeH = new Float32Array(G.h.length); G.h.forEach((h, i) => { treeH[i] = h === -1 ? -1 : (h - lo) / Math.max(1e-6, hi - lo); });
  let height = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < G.p.length; i += 3) { height = Math.max(height, G.p[i + 1]); x0 = Math.min(x0, G.p[i]); x1 = Math.max(x1, G.p[i]); z0 = Math.min(z0, G.p[i + 2]); z1 = Math.max(z1, G.p[i + 2]); }
  const nv = G.h.length;
  return { kind, positions: new Float32Array(G.p), normals: new Float32Array(G.n), colors: new Float32Array(G.c), treeH, index: nv > 65535 ? new Uint32Array(G.i) : new Uint16Array(G.i),
    tris: G.i.length / 3, height, width: Math.max(x1 - x0, z1 - z0), crown: [lo, hi] };
}

export const TREE_VARIANTS = ['oak', 'ovate', 'spread', 'sapling', 'fir', 'pine'];
export const BROADLEAF = ['oak', 'ovate', 'spread', 'sapling'], CONIFERS = ['fir', 'pine'], SHRUBS = ['mound', 'low'];

// a ring of n crown lobes round the axis at height y (jittered angle / distance / size from its own seed)
const ring = (n, rad, y, rr, seed, a0 = 0, ys = 0.82, dy = 0.14) => { const r = rngOf(seed), L = [];
  for (let k = 0; k < n; k++) { const a = a0 + k / n * TAU + (r() - 0.5) * 0.45, d = rad * (0.9 + 0.2 * r()), s = rr * (0.88 + 0.24 * r());
    L.push({ c: [Math.cos(a) * d, y + (r() - 0.5) * 2 * dy, Math.sin(a) * d], r: [s * 1.06, s * ys, s] }); } return L; };
const trunkColour = (colors) => { const T = colors.trunk, D = colors.trunkDark;
  return (k) => [D[0] + (T[0] - D[0]) * Math.min(1, k * 1.6), D[1] + (T[1] - D[1]) * Math.min(1, k * 1.6), D[2] + (T[2] - D[2]) * Math.min(1, k * 1.6)]; };

// buildVariants({ trunk, trunkDark }) -> { oak, ovate, spread, sapling, fir, pine, mound, low } (colours linear [r, g, b])
export function buildVariants(colors) {
  const tcol = trunkColour(colors);
  const out = {};
  const crownTree = (id, seed, trunk, branches, crown, lobes, sides = 7) => {
    const G = geo(), r = rngOf(seed);
    tube(G, trunk, sides, tcol, seed);
    branches.forEach(([a, b, ra, rb], k) => tube(G, [{ at: a, r: ra }, { at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: (ra + rb) / 2 }, { at: b, r: rb }], 5, (q) => tcol(0.6 + 0.4 * q), seed + 17 * (k + 1)));
    // (small inner lobes, max radius < 0.36, use the 20-tri icosahedron; the core + the silhouette lobes the 80-tri one)
    lobes.forEach((l, k) => lobe(G, { c: l.c, r: l.r, detail: l.detail ?? (k > 0 && Math.max(l.r[0], l.r[1], l.r[2]) < 0.36 ? 0 : 1), seed: seed * 31 + k, jit: l.jit ?? 0.1, value: 0.9 + 0.16 * r(), crown, dome: 0.45 }));
    out[id] = finish(G, 'broad');
  };
  // round oak: a full dome of lobes on a sturdy trunk with two limbs
  crownTree('oak', 101, [{ y: 0, r: 0.2 }, { y: 0.14, r: 0.13 }, { y: 0.95, r: 0.09 }],
    [[[0, 0.72, 0], [0.34, 1.2, 0.12], 0.06, 0.035], [[0, 0.78, 0], [-0.3, 1.24, -0.16], 0.055, 0.03]],
    { c: [0, 1.52, 0], r: [1.0, 0.78, 1.0] },
    [{ c: [0, 1.5, 0], r: [0.62, 0.52, 0.62] }, ...ring(4, 0.56, 1.36, 0.46, 7, 0.4), { c: [0.14, 1.92, -0.06], r: [0.42, 0.36, 0.42] }, { c: [-0.24, 1.84, 0.22], r: [0.34, 0.3, 0.34] }]);
  // tall ovate: a stacked, narrow crown (beech / poplar family) on a straight trunk
  crownTree('ovate', 202, [{ y: 0, r: 0.16 }, { y: 0.12, r: 0.1 }, { y: 0.85, r: 0.075 }], [],
    { c: [0, 1.75, 0], r: [0.62, 1.15, 0.62] },
    [{ c: [0.04, 1.06, 0.02], r: [0.46, 0.42, 0.46] }, { c: [-0.1, 1.46, 0.08], r: [0.5, 0.48, 0.5] }, { c: [0.1, 1.88, -0.06], r: [0.44, 0.46, 0.44] },
      { c: [-0.04, 2.26, 0.04], r: [0.33, 0.38, 0.33] }, { c: [0.34, 1.34, -0.14], r: [0.3, 0.32, 0.3] }, { c: [-0.3, 1.76, -0.2], r: [0.28, 0.3, 0.28] }]);
  // wide spreading: a low, flat, shelved canopy on a forked trunk (the storybook shade tree)
  crownTree('spread', 303, [{ y: 0, r: 0.2 }, { y: 0.14, r: 0.12 }, { y: 0.72, r: 0.095 }],
    [[[0, 0.6, 0], [0.58, 1.08, 0.12], 0.07, 0.04], [[0, 0.62, 0], [-0.46, 1.04, 0.38], 0.065, 0.038], [[0, 0.64, 0], [-0.1, 1.1, -0.52], 0.06, 0.035]],
    { c: [0, 1.3, 0], r: [1.3, 0.55, 1.3] },
    [...ring(5, 0.74, 1.18, 0.46, 9, 0.2, 0.62, 0.06), { c: [0, 1.42, 0], r: [0.64, 0.36, 0.64] }, { c: [0.16, 1.66, 0.1], r: [0.38, 0.27, 0.38] }]);
  // young tree / sapling: a thin stem and three small lobes (also the growth stage before the oak)
  crownTree('sapling', 404, [{ y: 0, r: 0.07 }, { y: 0.1, r: 0.05 }, { y: 0.66, r: 0.035 }], [],
    { c: [0, 1.0, 0], r: [0.42, 0.4, 0.42] },
    [{ c: [0, 0.94, 0], r: [0.3, 0.28, 0.3] }, { c: [0.12, 1.16, 0.04], r: [0.22, 0.22, 0.22] }, { c: [-0.14, 0.86, -0.07], r: [0.2, 0.19, 0.2] }], 5);
  // conifers: tall narrow fir (5 jagged tiers), stout pine (3 bell tiers)
  const conifer = (id, seed, trunk, tiers) => { const G = geo(), r = rngOf(seed); tube(G, trunk, 6, tcol, seed);
    tiers.forEach((t, k) => tier(G, { y0: t[0], h: t[1], R: t[2], bell: t[3] || 0, n: 8, inner: 0.8, droop: 0.06, rot: r() * TAU, seed: seed + k, value: 0.92 + 0.12 * r() }));
    out[id] = finish(G, 'conifer'); };
  conifer('fir', 505, [{ y: 0, r: 0.12 }, { y: 0.1, r: 0.075 }, { y: 0.5, r: 0.06 }], [[0.32, 0.86, 0.56], [0.78, 0.78, 0.47], [1.2, 0.72, 0.38], [1.6, 0.66, 0.29], [1.95, 0.6, 0.19]]);
  conifer('pine', 606, [{ y: 0, r: 0.15 }, { y: 0.1, r: 0.095 }, { y: 0.45, r: 0.08 }], [[0.3, 0.92, 0.76, 0.84], [0.8, 0.82, 0.6, 0.84], [1.25, 0.72, 0.42, 0.82]]);
  // shrubs (woodland edge): low lumpy mounds, icosahedron lobes (20 tris) with domed normals; no trunk
  const shrub = (id, seed, crown, lobes) => { const G = geo(), r = rngOf(seed);
    lobes.forEach((l, k) => lobe(G, { c: l.c, r: l.r, detail: 0, seed: seed * 31 + k, jit: 0.08, value: 0.9 + 0.16 * r(), crown, dome: 0.5 })); out[id] = finish(G, 'shrub'); };
  shrub('mound', 707, { c: [0, 0.2, 0], r: [0.5, 0.3, 0.5] }, [{ c: [0, 0.24, 0], r: [0.34, 0.28, 0.34] }, { c: [0.25, 0.17, 0.08], r: [0.24, 0.2, 0.24] }, { c: [-0.21, 0.16, 0.14], r: [0.23, 0.19, 0.23] }, { c: [0.02, 0.15, -0.25], r: [0.22, 0.18, 0.22] }]);
  shrub('low', 808, { c: [0, 0.12, 0], r: [0.6, 0.22, 0.4] }, [{ c: [-0.33, 0.13, 0], r: [0.19, 0.15, 0.18] }, { c: [-0.1, 0.17, 0.05], r: [0.23, 0.18, 0.22] }, { c: [0.15, 0.16, -0.04], r: [0.22, 0.17, 0.21] },
    { c: [0.37, 0.12, 0.03], r: [0.17, 0.13, 0.17] }, { c: [0.02, 0.12, 0.21], r: [0.17, 0.13, 0.17] }]);
  return out;
}

// buildFruitTree({ trunk, trunkDark }) -> the game's tree_fruit body (not drawn by the proof): a short trunk and a full, round
// crown (a core lobe + a ring of five, all 80-tri) in the same style as the oak; `lobes` lists the crown lobes so the exporter
// (lib/composition.mjs) can hang fruit on them. Same output shape as a buildVariants entry.
export function buildFruitTree(colors) {
  const G = geo(), seed = 909, r = rngOf(seed), crown = { c: [0, 1.38, 0], r: [0.98, 0.7, 0.98] };
  tube(G, [{ y: 0, r: 0.17 }, { y: 0.12, r: 0.11 }, { y: 0.8, r: 0.08 }], 6, trunkColour(colors), seed);
  const lobes = [{ c: [0, 1.4, 0], r: [0.6, 0.5, 0.6] }, ...ring(5, 0.52, 1.3, 0.4, 19, 0.3)];
  lobes.forEach((l, k) => lobe(G, { c: l.c, r: l.r, detail: 1, seed: seed * 31 + k, jit: 0.1, value: 0.9 + 0.16 * r(), crown, dome: 0.45 }));
  const out = finish(G, 'broad'); out.lobes = lobes; return out;
}

const PL = { TREE_VARIANTS, BROADLEAF, CONIFERS, SHRUBS, buildVariants, buildFruitTree, hash };
export default PL;
