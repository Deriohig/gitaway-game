// ground-measure.mjs -- measurement helpers shared by the ground-vegetation tests (art/specs/2026-10-25-ground-vegetation-plan.md;
// the zone field is lib/terrain.mjs groundZones, spec art/specs/2026-10-25-ground-vegetation-design.md §3). Import-free: the core
// comes in as an argument, so a test's TERRAIN= override reaches these too.
//   zoneGrid(field, bp, id, cell = 0.1) -> { cell, cells: [{ x, z, zone, U, dPath, dWater }] }: the centres of a `cell` grid over the
//      piece's outline box (snapped to multiples of `cell`), the ones with a non-null zone
//   zoneAreas(grid) -> { A, B, C, D, E, lawn }: each zone's area (u^2)
//   currentSpots(A, GT) -> [{ what, x, z, r, halo } | { what, rect, halo }]: MAIN's spots where the game stands them NOW, worked out
//      from the config on its own (the test-side list; zones Z1, cover V13): the layout.ts SLOT_DISCS slots at game.* with COVER.moved
//      in place of the slots the game moved aside for the ribbons, flowerbed 8 at its new spot, the keep-clear camp, camp stand,
//      woodshed and bush_1 (in place of BUSHES[1]); the house, windmill, greenhouse and well (BLOCKERS r) and the garden fence's
//      rectangle. Halos: the brief's pinned values as literals (plan Task 1, Z1), never read from GT.GROUND, so a collapsed halo in the
//      core shows up as B / C / lawn round the spots. NOW (ruling GR9): the slots the game moved for good after the v3 snapshot, as
//      literals (the core's own copy is GROUND.now; the zones and cover tests catch a disagreement)
//   stonePathsNow(G) -> G.STONE_PATHS where the game lays them now (NOW.stonePaths over the frozen snapshot)
//   densityIn(grid, items, sel) -> items whose 0.1 u cell (zoneGrid's) matches sel, per u^2 of the cells that match sel
//   openShare(grid, items, sel, r) -> the share of the cells matching sel with no item within r of the cell centre
//   patchShare(grid, items, sel, k = 3, r = 0.35) -> the share of the cells matching sel with >= k items within r of the cell centre
//   clarkEvans(points, area) -> the Clark-Evans index R (mean nearest-neighbour distance / the 0.5 / sqrt(n / area) of a random
//      pattern): 1 random, < 1 clustered, > 1 even
//   bearingSpan(items, [tx, tz], r0, r1) -> degrees: 360 - the largest empty gap between the bearings of the items r0..r1 from (tx, tz)
//      (0 with fewer than 2)
//   async kitHeights() -> { [asset]: number }: the highest y of each built kit GLB (lib/plantkit.mjs KIT, at scale 1)
//   polyEdgeDist(poly, x, z) -> number: the distance from (x, z) to the polygon's nearest edge (closed: the last point joins the first),
//      unsigned (inLoop says which side); polyEdgeNearest(poly, x, z) -> { d, i }: that distance and the edge's index (poly[i] to
//      poly[(i + 1) % n]; the first of equals). Plan Task 10: the pond's stretches and reeds on the teardrop (cover V17, RF2)

export function polyEdgeNearest(poly, x, z) {
  const n = poly.length; let d = Infinity, k = -1;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
    const e = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (e < d) { d = e; k = i; }
  }
  return { d, i: k };
}
export const polyEdgeDist = (poly, x, z) => polyEdgeNearest(poly, x, z).d;

export function zoneGrid(field, bp, id, cell = 0.1) {
  const loop = bp.pieces[id].loopWorld; let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of loop) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const i0 = Math.floor(x0 / cell), i1 = Math.ceil(x1 / cell), j0 = Math.floor(z0 / cell), j1 = Math.ceil(z1 / cell), cells = [];
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const x = (i + 0.5) * cell, z = (j + 0.5) * cell, q = field.at(id, x, z);
    if (q && q.zone) cells.push({ x, z, zone: q.zone, U: q.U, dPath: q.dPath, dWater: q.dWater });
  }
  return { cell, cells };
}

export function zoneAreas(grid) {
  const out = { A: 0, B: 0, C: 0, D: 0, E: 0, lawn: 0 }, a = grid.cell * grid.cell;
  for (const c of grid.cells) out[c.zone] += a;
  for (const k of Object.keys(out)) out[k] = +out[k].toFixed(2);
  return out;
}

// which game.* slot each COVER.moved entry stands in for (layout.ts aside(): the moved slots, in COVER.moved's order; the cover test's
// MOVED list names them by the game's own indices: its STATIC_TREES has 8, game.* the snapshot's 9)
const MOVED = ['FRUIT_TREES:0', 'FRUIT_TREES:5', 'FLOWERBEDS:0', 'FLOWERBEDS:1', 'LANTERNS:3', 'BENCH', 'BUSHES:2', 'STATIC_TREES:2', 'STATIC_TREES:5',
  'STATIC_TREES:7', 'STATIC_TREES:8', 'ROCKS:0', 'ROCKS:3'];
// gone from the game: game.STATIC_TREES[4], the pine at (-6.2, -5.6), past the baked island's rim (layout.ts STATIC_TREES)
const GONE = new Set(['STATIC_TREES:4']);
// keep-clear discs that stand in for a game.* slot the game moved (world.config blueprint.keepClear notes)
const REPLACES = { bush_1: 'BUSHES:1' };
// the brief's halos (plan Task 1, Z1): slots and keep-clear discs 0.3, the house 0.8, the windmill / greenhouse / well 0.4, the fence 0.6
const H = { slot: 0.3, house: 0.8, building: 0.4, fence: 0.6 };
// (ruling GR9) where the game stands these now, read from src/world/layout.ts (main at 26c5a3d; origin/main ce165a4 agrees): BUSHES[6]
// moved off the hero tree's root flare (511aa4a: "the seventh stood on the roots at (-6.0, -5.0)"); STONE_PATHS[1] stops at its bend
// while the composition is drawn (aside(): the art's to_cottage ribbon starts there)
export const NOW = { slots: { 'BUSHES:6': [-5.91, -5.33] }, stonePaths: { 1: [[-4.6, -0.55], [-5.25, 0.05]] } };
export const stonePathsNow = (G) => G.STONE_PATHS.map((p, i) => NOW.stonePaths[i] || p);

export function currentSpots(A, GT) {
  const G = A.game, ZR = A.mainZones.radii;
  const moved = { ...GT.COVER, ...((A.composition || {}).cover || {}) }.moved;
  if (moved.length !== MOVED.length) throw new Error(`currentSpots: COVER.moved has ${moved.length} entries, the slot names ${MOVED.length}`);
  const slots = new Map(), put = (key, [x, z], r) => slots.set(key, { what: key, x, z, r, halo: H.slot });
  G.FRUIT_TREES.forEach((p, i) => put(`FRUIT_TREES:${i}`, p, ZR.fruitTree));
  G.FLOWERBEDS.forEach((p, i) => put(`FLOWERBEDS:${i}`, p, ZR.flowerbed));   // [7] is flowerbed 8's new spot (-1.5, 7.75) already
  G.LANTERNS.forEach((p, i) => put(`LANTERNS:${i}`, p, ZR.lantern));
  G.BEEHIVES.forEach((p, i) => put(`BEEHIVES:${i}`, p, ZR.beehive));
  G.BUSHES.forEach((p, i) => put(`BUSHES:${i}`, p, ZR.bush));
  G.STATIC_TREES.forEach((t, i) => put(`STATIC_TREES:${i}`, t.at, ZR.treeBase + ZR.treePerScale * t.s));
  A.mainIslandTsx.ROCKS.forEach((k, i) => put(`ROCKS:${i}`, k.at, ZR.rock));
  put('BENCH', [G.BENCH.x, G.BENCH.z], ZR.bench); put('SCARECROW', G.SCARECROW, ZR.scarecrow);
  MOVED.forEach((key, k) => { const s = slots.get(key); s.x = moved[k][0]; s.z = moved[k][1]; s.r = moved[k][2]; });
  for (const [key, [x, z]] of Object.entries(NOW.slots)) { const s = slots.get(key); s.x = x; s.z = z; }
  for (const key of GONE) slots.delete(key);
  for (const kc of A.blueprint.keepClear || []) { if (kc.kinds) continue;   // (the hero tree's root flare keeps volumes off only)
    if (REPLACES[kc.id]) slots.delete(REPLACES[kc.id]);
    slots.set(kc.id, { what: kc.id, x: kc.at[0], z: kc.at[1], r: kc.r, halo: H.slot }); }
  const blk = (w) => G.BLOCKERS.find((b) => b.what === w), out = [];
  out.push({ what: 'house', x: blk('house').at[0], z: blk('house').at[1], r: blk('house').r, halo: H.house });
  for (const w of ['windmill', 'greenhouse', 'well']) out.push({ what: w, x: blk(w).at[0], z: blk(w).at[1], r: blk(w).r, halo: H.building });
  let rx0 = Infinity, rz0 = Infinity, rx1 = -Infinity, rz1 = -Infinity;
  for (const run of G.FENCE_RUNS) for (const [x, z] of run) { rx0 = Math.min(rx0, x); rx1 = Math.max(rx1, x); rz0 = Math.min(rz0, z); rz1 = Math.max(rz1, z); }
  out.push({ what: 'garden fence', rect: [rx0, rz0, rx1, rz1], halo: H.fence });
  return out.concat([...slots.values()]);
}

// ---- the cover measures (plan Task 2: cover V11, V12, V15) ----
// a grid's cells by index (the 0.1 u cell holding (x, z) is floor(x / cell), floor(z / cell), as zoneGrid lays them out)
const IDX = new WeakMap();
function cellIndex(grid) {
  let m = IDX.get(grid); if (m) return m;
  m = new Map(); for (const c of grid.cells) m.set(Math.round(c.x / grid.cell - 0.5) + ',' + Math.round(c.z / grid.cell - 0.5), c);
  IDX.set(grid, m); return m;
}
const cellOf = (grid, x, z) => cellIndex(grid).get(Math.floor(x / grid.cell) + ',' + Math.floor(z / grid.cell));
// items in 0.5 u buckets: near(x, z, r, fn) calls fn(item, d) for every item within r
function buckets(items, B = 0.5) {
  const m = new Map(), k = (i, j) => i + ',' + j;
  for (const it of items) { const key = k(Math.floor(it.x / B), Math.floor(it.z / B)); (m.get(key) || m.set(key, []).get(key)).push(it); }
  return (x, z, r, fn) => { const i0 = Math.floor((x - r) / B), i1 = Math.floor((x + r) / B), j0 = Math.floor((z - r) / B), j1 = Math.floor((z + r) / B);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const it of m.get(k(i, j)) || []) { const d = Math.hypot(it.x - x, it.z - z); if (d <= r) fn(it, d); } };
}

export function densityIn(grid, items, sel) {
  let cells = 0, n = 0;
  for (const c of grid.cells) if (sel(c)) cells++;
  for (const it of items) { const c = cellOf(grid, it.x, it.z); if (c && sel(c)) n++; }
  return cells ? n / (cells * grid.cell * grid.cell) : 0;
}

export function openShare(grid, items, sel, r) {
  const near = buckets(items); let cells = 0, open = 0;
  for (const c of grid.cells) { if (!sel(c)) continue; cells++; let any = false; near(c.x, c.z, r, () => { any = true; }); if (!any) open++; }
  return cells ? open / cells : 0;
}

export function patchShare(grid, items, sel, k = 3, r = 0.35) {
  const near = buckets(items); let cells = 0, full = 0;
  for (const c of grid.cells) { if (!sel(c)) continue; cells++; let n = 0; near(c.x, c.z, r, () => { n++; }); if (n >= k) full++; }
  return cells ? full / cells : 0;
}

export function clarkEvans(points, area) {
  if (points.length < 2 || !(area > 0)) return Infinity;
  const near = buckets(points); let sum = 0;
  for (const p of points) {   // (the nearest neighbour: the search grows until it finds one)
    let best = Infinity;
    for (let r = 0.5; best === Infinity; r *= 2) near(p.x, p.z, r, (o, d) => { if (o !== p && d < best) best = d; });
    sum += best;
  }
  return (sum / points.length) / (0.5 / Math.sqrt(points.length / area));
}

export function bearingSpan(items, [tx, tz], r0, r1) {
  const b = [];
  for (const it of items) { const d = Math.hypot(it.x - tx, it.z - tz); if (d >= r0 && d <= r1) b.push(((Math.atan2(it.z - tz, it.x - tx) * 180 / Math.PI) + 360) % 360); }
  if (b.length < 2) return 0;
  b.sort((p, q) => p - q);
  let gap = b[0] + 360 - b[b.length - 1];
  for (let i = 1; i < b.length; i++) gap = Math.max(gap, b[i] - b[i - 1]);
  return 360 - gap;
}

// (lib/plantkit.mjs and gltf-transform are loaded here, on the first call: the module stays import-free for the TERRAIN= override)
export async function kitHeights() {
  const { KIT, buildPlant } = await import('./plantkit.mjs'), { NodeIO } = await import('@gltf-transform/core'), io = new NodeIO(), out = {};
  for (const id of Object.keys(KIT)) {
    let top = -Infinity;
    for (const mesh of (await io.readBinary(await buildPlant(id))).getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION').getArray(); for (let i = 1; i < P.length; i += 3) top = Math.max(top, P[i]); }
    out[id] = +top.toFixed(4);
  }
  return out;
}
