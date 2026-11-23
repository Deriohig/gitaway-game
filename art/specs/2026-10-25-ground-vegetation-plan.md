# Ground Vegetation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make the islands' grass read as a composed storybook meadow (a tidy farm lawn, tuft patches at the margins, the wild
edges and between trees, shade pools under trees, soft path and pond edges) through zoned, clustered cover and zone-driven ground
paint, at about the same item count and draw calls.

**Architecture:**
- One zone field, `groundZones`, in the shared core `lib/terrain.mjs`, classifies every point of every piece as A, B, C, D, E or
  lawn.
- The cover scatter becomes a cluster model that reads the field (MAIN first, the wild pieces in P4). The baked lawn paint reads the
  same field, so plants and paint agree.
- `compositionData` exports the tinted cover and the pond's reed positions. The game draws them with its existing instancing.

**Tech Stack:**
- Node 22 ESM; `@gltf-transform/core`; three 0.160, art-side.
- The art proof (`build.mjs`, `lib/arch-scene.js`) and Playwright from the game checkout, for renders.
- No new dependency and no runtime shader.

**Spec:** `art/specs/2026-10-25-ground-vegetation-design.md`. Read its "Owner review, 2026-10-25" section first: it overrides the
draft numbers.

## Global Constraints

- **Where:** worktree `/home/me/Projects/gitaway-art-groundveg`, branch `art/ground-vegetation`. Touch only `art/` and
  `public/models/`. `src/` is game-owned: a game change becomes a G-item (GV1–GV4, G5) for the game session. Never touch `main` or
  another worktree.
- **WSL:**
  - Write each shell script to the session scratchpad `$S` and run it with a unique /tmp name:
    `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-24.04 --cd "~" -- bash -c "tr -d '\r' < $S/x.sh > /tmp/groundveg-x.sh; bash /tmp/groundveg-x.sh"`.
  - Node: `export PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH`. gh: `~/.local/bin/gh`.
  - Tests run from `art/scripts`.
  - Files written through `\\wsl.localhost` come out root-owned: `wsl.exe -d Ubuntu-24.04 -u root -- chown -R $USER:$USER /home/me/Projects/gitaway-art-groundveg` before node writes or a commit.
- **Colour (ART-BIBLE §B.1):**
  - Saturation bands: lawn, path and soil 0.25–0.45; foliage shade 0.30–0.60, sunlit ≤ 0.70; stone ≤ 0.30; flowers ≤ 0.70.
  - Hue windows: greens 55–175°, stone 0–60° or 330–360°.
  - Darkest on-screen luma ≥ 0.08.
  - Greens ≥ 45 % of the `CAM-DESK` island pixels (V6's rule; measure it on a mask until V6 exists).
  - Only existing tokens (ART-BIBLE §B.2).
- **Draw calls:** the proof gate is ≤ 920 (`plants.browser.mjs` B5: full, farm, default_mobile, default_desktop). The owner accepted
  about +8 net and +18 worst case. Frame time binds: +0.3 ms desktop, +1.0 ms mobile profile, measured by the game session.
- **Determinism:**
  - The cluster scatter draws from its own stream, `rngOf(id, 'cluster')`, plus position hashes `ph(x, z, salt)`.
  - Trees, shrubs, bushes, rocks, paths and the wild pieces' tall patches, drifts, perennials and ferns keep their streams, item for
    item (species.test S1, composition C5 for the other lists).
  - Composing twice gives the same cover. The export (C6) and the bake (B10) are byte-identical on re-run, and the height grids stay
    byte-identical (B16).
- **The farm stays low (owner answer 3):**
  - On MAIN: no `grass_tall`, `grass_seedhead`, `fern_clump` or `perennial_*`.
  - Nothing over 0.3 u on MAIN's near side (θ 22–68°, r < 16), nothing over 0.2 u in the animal yards or on the pond's
    camera-facing shore.
- **The farm's count:** target about **320 plants** (300–340) on both seeds, pebbles not counted. V3's floor is **270**. If the zone
  areas measured in Task 1 put 300–340 out of reach inside the §4 targets, stop and report; never widen a target.
- **Budgets:** ≤ 8,000 plants and ≤ 80,000 kit triangles per piece (cover V1). Kit cards: grass ≤ 24 tris, `pebbles` ≤ 24,
  `weed_rosette` ≤ 16. Textures power-of-two, MASK.
- **Red-green:** write every new or changed test first and run it on the code before its change; it must FAIL there. Record the
  RED and GREEN lines in the commit message. The one exception is a guard that already holds on the old code (each such case is
  named in its step). Report it as "green on arrival", with its numbers; never weaken a test to force it red.
- **Renders:** check `CAM-DESK`, `CAM-ORBIT-W`, `CAM-ORBIT-E`, `CAM-CLOSE` and `CAM-PHONE` (plus `CAM-LOW` for the rim) yourself
  before anyone sees a sheet: at least 3 angles plus the default desktop camera and the phone framing, never one hero shot.
- **Commits:** every message ends with `[skip ci]` (art and models only) and the session's attribution trailer.

## Review Focus

1. **Tuft patches spilling into the clear lawn.** The larger, more frequent tuft patches are seeded at a B, C or lawn edge but put
   members into A: round the house, the plots, the paths and the interactables, or onto a slot where the game stands it *now*
   (moved slots, flowerbed 8's new spot, the camp) rather than its frozen zone. Expected: A stays clear, and each member is judged by
   the zone it lands in. → **RF1**, Task 2 (with Z1, Task 1).
2. **The shore band on the legacy pond, not the teardrop.** D's stretches, reeds and pebbles, or the narrowed lush paint, are
   measured from the game's blob (r 1.45 at (−1.7, 4.3)). That leaves reeds on dry lawn or in the teardrop's water. Expected:
   everything at the pond follows `comp.water.main.pond.outline`. → **RF2**, Task 10 (and L7, Task 6).
3. **Phone readability.** At ≈ 15 px/u a tuft is 2 px. If the zone paint differs only below ~1 u, the lawn reads as one green
   again. Expected: B warmer than A and C darker than the open lawn survive a 1 u blur. → **RF3**, Task 6.
4. **Low-relief kinds floating or sinking.** Pebbles (≤ 0.04 u) and rosettes (0.06 u) are thinner than V14's 0.04 u footprint
   allowance, so on slopes, tier edges and path bevels they hover or vanish. Expected: they sit on the ground wherever they appear.
   → **RF4**, Task 9 (pebbles) and Task 13 (rosettes).
5. **Cluster stamps repeating at the default camera.** V16 looks only at neighbours within 0.5 u. A member layout drawn from a
   coarse hash can repeat cluster after cluster, a visible stamp at 47 px/u. Expected: no two nearby clusters share a layout.
   → **RF5**, Task 2.

---

## File map

| File | Responsibility |
|---|---|
| `art/scripts/lib/terrain.mjs` | `GROUND` defaults, `groundZones`, the cluster scatter in `composeBlueprint`'s cover block, the cover tint, the reed stretches, `LAWN` + zone paint in `paintBlueprint` |
| `art/config/world.config.mjs` | `composition.ground`: per-zone densities, cluster sizes, halos, `spots` (the animal yards; the wild pieces' `KEPT_CLEAR` mirrors) |
| `art/scripts/lib/ground-measure.mjs` (new) | measurement helpers shared by the tests: zone grids, densities, Clark–Evans, bearing spans, kit heights |
| `art/scripts/lib/plantkit.mjs` | `KIT.pebbles`, `KIT.weed_rosette`, the calmer `grass_tall` / `grass_seedhead` paint |
| `art/scripts/lib/composition.mjs` | kit `yOffset` −0.01 and `instanceColor: 'tint'`, cover `tint`, `pieces.main.reeds`, `KIT_CATEGORY` for stones |
| `art/scripts/lib/arch-scene.js` | the proof draws the cover tints and reed stand-ins |
| `art/scripts/tests/zones.test.mjs` (new) | Z1–Z6, the zone field |
| `art/scripts/tests/cover.test.mjs` | V3 (changed), V10–V18, RF1, RF2, RF4, RF5, `--freeze` |
| `art/scripts/tests/lawn.test.mjs` | L5–L7, LB (band), RF3 |
| `art/scripts/tests/composition.test.mjs`, `plantkit.test.mjs`, `bake.test.mjs` | C12 (changed), C22; K10–K12; B18 |
| `art/specs/2026-10-25-ground-vegetation-handoff.md` (new, Task 14) | the game session's items |

## Phase gate (the last task of each phase runs it)

- [ ] **Export:** `node export-composition.mjs` (after `node bake-pieces.mjs` when the phase changed the paint). Expected: these all
  PASS: `composition`, `cover`, `lawn`, `zones`, `plantkit`, `assets` (V1), `palette` (V2), `species`, `water`, `terrain`, and
  `bake` when re-baked.
- [ ] **Proof:**
  - `node build.mjs`, then `node tests/plants.browser.mjs`: B5 ≤ 920 in all four views (record the numbers).
  - `node composition-check.mjs --port N --out $S/<phase> --agree` (served as its header says): PASS.
- [ ] **Renders:**
  - Proof `?baked=1&look=Game (current)&hour=14.5`, with `__saveShot` (VISUAL-QA §2) at:
    - `CAM-DESK`: `{ mode: 'gameplay', az: 45, el: 28.88, dist: 35.5, tgt: [0, -0.6, 0], w: 1440, h: 900, unlocked: 'main,meadow,grove,islet' }`;
    - `CAM-ORBIT-W` (az 16.35) and `CAM-ORBIT-E` (az 73.65);
    - `CAM-CLOSE` (dist 14), `CAM-PHONE` (dist 130, 824 × 1830) and `CAM-LOW` (el 20.1).
  - The same shots at the base commit. Side by side with `node look-sheet.mjs`; sheets ≤ 1.45 MB go to
    `art/screenshots/ground-<phase>/`.
  - In the game: `npm run composition` locally (never committed) and VISUAL-QA §2's build, at `CAM-DESK` and `CAM-PHONE`.
  - Report the `CAM-DESK` green share (≥ 45 %).
- [ ] **PR:** push and run `gh pr create --base main`. The body gives the RED/GREEN lines, the B5 numbers, the sheets and the phase's
  G-items, and ends with the attribution line.
  - P1 goes from `art/ground-vegetation`. Each later phase starts from the merged `main` on `art/ground-veg-p<N>`, or is stacked on
    the open one, which the PR then says.
- [ ] **Hand-offs:** the controller shows the owner the sheets. After the owner's yes, the game session runs GV1 plus the phase's
  items.

---

### Task 0: Base branch

**Files:** `art/scripts/tests/cover.test.mjs` (a `--freeze` mode); create `art/scripts/tests/fixtures/cover.base.json`.

**Interfaces:** produces `cover.base.json`, `{ [seedLabel]: { [piece]: { n, kinds: { [asset]: count } } } }`, the V18 baseline.

- [ ] **Step 1: Check the base.**
  `git fetch origin && git merge-base --is-ancestor origin/art/art-bible origin/main && git merge-base --is-ancestor origin/art/water-design origin/main`.
  - Expected: both exit 0 (checked 2026-10-25: `main` 1b9feb3 holds #60 at 3354a4a and #65 at cfdc571).
  - If either fails, **stop** and report that PR #60 or #65 is not merged yet. The pond edge follows the teardrop, and both PRs
    touch the composition.
- [ ] **Step 2: Rebase:** `git rebase origin/main`. The branch holds only the spec and plan commits, so expect it to be clean.
- [ ] **Step 3: Baseline.** Run the Phase gate's export test list (bake included) on the rebased branch. Expected: all PASS, and
  `cover` V3 reads 362 items (default) and 337 (alt) on MAIN. If anything fails on the base, stop and report: it is not this plan's
  to fix.
- [ ] **Step 4: Freeze:** add `--freeze` to `cover.test.mjs` to write `fixtures/cover.base.json` from the current composition (both
  seeds). Run it.
- [ ] **Step 5: Commit** the fixture and the mode: "Ground: freeze the cover baseline on main (V18) [skip ci]".

## P1: zones and clusters on MAIN (existing kit)

### Task 1: The zone field

**Files:**
- Modify: `art/scripts/lib/terrain.mjs` (`GROUND`, `groundZones`, both on `GT`).
- Modify: `art/config/world.config.mjs` (`composition.ground`, with `spots.main`).
- Create: `art/scripts/lib/ground-measure.mjs`, `art/scripts/tests/zones.test.mjs`.

**Interfaces:**
- Produces:
  - `GT.GROUND`: the defaults; `A.composition.ground` overrides them key by key.
  - `GT.groundZones(bp, comp, water) -> ZoneField`, cached per `(bp, comp)`. `comp` is `{ pieces }` with trees and paths placed;
    `composeBlueprint`'s own `out` works.
  - `ZoneField.at(id, x, z) -> { zone, dPath, dWater, dSpot, aHalo, U, W, dRim }` (world x, z). `zone` is `'A' | 'B' | 'C' | 'D' |
    'E' | 'lawn' | null`; null means off the piece, in water or its 0.35 u wet band, on a path, or inside a spot's footprint.
    `aHalo` > 0 inside an A halo.
  - `ZoneField.pools(id) -> [{ x, z, r, tx, tz }]`: each shade pool's centre and base radius, and its trunk.
  - `ZoneField.spots(id) -> [{ what, keep: 'clear' | 'tidy', halo, x, z, r } | { what, keep, halo, ax, az, bx, bz, r } | { what, keep, halo, rect: [x0, z0, x1, z1] }]`.
  - `ZoneField.shore(id) -> [[x, z], ...][]`: the polylines `dWater` is measured from.
  - `ground-measure.mjs`:
    - `zoneGrid(field, bp, id, cell = 0.1) -> { cell, cells: [{ x, z, zone, U, dPath, dWater }] }` (cells with a non-null zone);
    - `zoneAreas(grid) -> { A, B, C, D, E, lawn }` (u²);
    - `currentSpots(A, GT) -> [{ what, x, z, r, halo } | { what, rect, halo }]`: the test-side list of MAIN's spots where the game
      stands them now (Z1's list, reused by V13).

- [ ] **Step 1: Write `tests/zones.test.mjs`** (both seeds, `TERRAIN=` override like `cover.test`):

```js
const Z = GT.groundZones(bp, comp, comp.water), at = (x, z) => Z.at('main', x, z);
// Z1 A at the game's CURRENT spots: SLOT_DISCS radii (fruit tree 0.55, bed 0.6, lantern 0.3, hive 0.35, bush 0.45, static tree
//    0.3 + 0.2 s, rock 0.4, bench 0.6, scarecrow 0.4) at game.* with COVER.moved replacing the moved slots, flowerbed 8 at
//    (-1.5, 7.75), keepClear camp / camp_stand / woodshed / bush_1; halo 0.3. House r 1.9 halo 0.8; windmill / greenhouse / well
//    (BLOCKERS r) halo 0.4; the garden fence rectangle [0.17, -1.88, 5.21, 3.16] halo 0.6. (currentSpots; rect checked at its edge + 0.5)
const spots = currentSpots(A, GT).filter((s) => !s.rect);
for (const s of spots) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, d = s.r + s.halo - 0.1, q = at(s.x + Math.cos(a) * d, s.z + Math.sin(a) * d);
  if (q && !['A', 'E', 'D'].includes(q.zone)) bad.push(s.what); }
for (const y of [[-1.5, -1.7, 1.5], [-3.0, 1.6, 1.0], [-1.2, 1.5, 1.3]]) /* CHICKEN_YARDS, DOG_YARD: tidy inside */ for (const [u, v] of ring(y, 0.5)) expectZone(at(u, v), ['A', 'E', 'D']);
ok('Z1 A round every spot where the game stands it now (+ halo), and inside the yards', !bad.length);
// Z2 E first: 0.3 u past each path edge (MAIN runs incl. the layout dirt paths with their widths, STONE_PATHS) is E, even inside a halo; 0.9 u past is not E
// Z3 D on the teardrop: every 8th outline point pushed 0.6 u outward is D (or E / null on a path or spot); pushed 0.2 u it is null (wet band)
// Z4 pools: for every tree that is always there (STATIC_TREES on MAIN's top + composed MAIN trees; never FRUIT_TREES):
//    |pool centre - (trunk + 0.25 R (0.993, -0.122))| <= 0.01; at(pool centre).U > 0.35; U <= 0.35 at 0.3 u from the trunk on 8 bearings
// Z5 MAIN's rim is its own outline: every point 0.5 u inside bp.pieces.main.loopWorld (every 0.5 u along it) that is not E, D, A or C is B
// Z6 deterministic: a second groundZones on a fresh composeBlueprint agrees (zone, U) on zoneGrid(…, 0.1) of all 8 pieces; MAIN's
//    zoneAreas printed, each > 0
```

- [ ] **Step 2: Run** `node tests/zones.test.mjs`. Expected: FAIL (`GT.groundZones` is not a function).
- [ ] **Step 3: Implement `groundZones(bp, comp, water)`** as spec §3, with exact distances from per-piece 1 u bucket grids of
  segments and discs (no raster). The values are pinned in `GROUND`:
  - **Zones:** E `dPath` < 0.7; D 0.35 ≤ `dWater` < 1.25; A `aHalo` > 0; C `U` > 0.35; B `W` > 0.5; otherwise lawn.
  - **Halos:** house 0.8, fence 0.6, building 0.4, slot 0.3, wild zone 0.4, jetty 0.3. A `tidy` spot (the yards) is A inside,
    with no halo.
  - **`W`:** on MAIN the larger of `1 − smoothstep(1.0, 2.6, dRim)` and `smoothstep(2.0, 3.5, min(dSpot, dPath))`, with `dRim` from
    `bp.pieces.main.loopWorld`. On the wild pieces `0.6 + 0.4 × (1 − smoothstep(1.0, 2.6, bp.dcAt))`.
  - **Pools:**
    - `R` = 0.75 × scale (broadleaf), 1.05 × scale (conifer), 1.6 at the hero tree's spot. These were measured from
      `tree_round_a` / `tree_pine_a` / `hero_tree.glb` crowns.
    - `rp = R × lerp(0.6, 1.1, n)`, with `n` from a 1.2 u `bp.noise.fbm`.
    - The centre is shifted 0.25 R along (0.993, −0.122): away from the "Golden afternoon" sun, whose bearing is
      `views.full.az + sun.azimuthDeg` = 32 − 115 = −83°, as in `arch-scene.js:1339`.
    - `U = 1 − smoothstep(0.75, 1, d / rp)`, and 0 within 0.35 u of any trunk.
  - **Shore:** MAIN's `dWater` is the min over the teardrop outline, the stream `line` (half width), the legacy blob
    (`main.pond.legacy`, bank r 1.77) and the legacy stream. Elsewhere it uses `blueprintWater` (lake, tarn and hot spring below
    level + 0.06; river and outflow).
  - **`spots.main`** in `world.config.mjs`: the two `CHICKEN_YARDS` and `DOG_YARD` as `tidy` discs, each with a note citing
    `layout.ts:86-91`.
- [ ] **Step 4: Run** `node tests/zones.test.mjs` (Z1–Z6 PASS), then `cover`, `lawn` and `composition`: unchanged, PASS.
- [ ] **Step 5: Commit:** "Ground: the zone field (groundZones, composition.ground) [skip ci]".

### Task 2: The cluster scatter on MAIN

**Files:**
- Modify: `art/scripts/lib/terrain.mjs`, the cover block: MAIN uses a new internal `clusterCover(bp, id, field, rng, ctx)`; the wild
  pieces keep the cell draw until Task 12.
- Modify: `art/config/world.config.mjs` (`composition.ground.density`, `.cluster`).
- Modify: `art/scripts/lib/ground-measure.mjs`, adding `densityIn`, `openShare`, `patchShare`, `clarkEvans`, `bearingSpan`,
  `kitHeights`.
- Test: `art/scripts/tests/cover.test.mjs` (V3 changed; V10–V13, V15, V16; RF1, RF5).

**Interfaces:**
- Consumes `ZoneField` (Task 1).
- Produces:
  - `comp.pieces.main.cover[i] = { asset, x, z, rot, scale, cl }`;
  - `comp.pieces.main.coverClusters[k] = { x, z, kind, zone, n, scale, heading }` (`n` = the accepted members; `cl` indexes this
    list). Both stay internal: `compositionData` exports only asset, x, z, rotY, scale (and tint, Task 4).
  - `ground-measure.mjs`:
    - `densityIn(grid, items, sel) -> number`: items whose cell matches `sel`, per u²;
    - `openShare(grid, items, sel, r) -> number`;
    - `patchShare(grid, items, sel, k = 3, r = 0.35) -> number`: the share of cells with ≥ k items within r;
    - `clarkEvans(points, area) -> number`;
    - `bearingSpan(items, [tx, tz], r0, r1) -> degrees`: 360 − the largest empty bearing gap;
    - `async kitHeights() -> { [asset]: number }`: the max y of each built kit GLB.

- [ ] **Step 1: Write the tests** in `cover.test.mjs`, both seeds:

```js
const FARM_OK = new Set(['grass_short', 'clover_patch', 'flower_daisy', 'weed_rosette', 'pebbles']), plants = farm.filter((c) => c.asset !== 'pebbles');
ok(`V3 ${label}: the farm is low and tidy (${plants.length} plants >= 270)`, plants.length >= 270 && farm.every((c) => FARM_OK.has(c.asset)));
const K = P.main.coverClusters || [];
ok('V10 every MAIN item names its cluster; composing again gives the same items and clusters', farm.every((c) => K[c.cl]) && same(again.main.cover, farm) && same(again.main.coverClusters, K));
const g = zoneGrid(Z, bp, 'main'), d = (zn) => densityIn(g, farm, (c) => c.zone === zn), inR = (v, a, b) => v >= a && v <= b;
ok('V11 MAIN: A 0.8-1.5 and >= 70 % open at 0.3 u; lawn 3-4; C 3-5; B 5-7, >= 2.5 x A, patches over 60-75 %; D 1.5-2.5 (until Task 10); E 0.25-0.7 u <= 0.5 x lawn',
  inR(d('A'), 0.8, 1.5) && openShare(g, farm, (c) => c.zone === 'A', 0.3) >= 0.7 && inR(d('lawn'), 3, 4) && inR(d('C'), 3, 5) && inR(d('B'), 5, 7) && d('B') >= 2.5 * d('A')
  && inR(patchShare(g, farm, (c) => c.zone === 'B'), 0.6, 0.75) && inR(d('D'), 1.5, 2.5) && densityIn(g, farm, (c) => c.zone === 'E' && c.dPath >= 0.25) <= 0.5 * d('lawn'));
ok('V12 short grass clustered (Clark-Evans <= 0.8); >= 80 % of clusters have 3-7 members', clarkEvans(farm.filter((c) => c.asset === 'grass_short'), g.cells.length * 0.01) <= 0.8 && K.filter((k) => k.n >= 3 && k.n <= 7).length >= 0.8 * K.length);
// V13 clearance, geometry only (not the field): none within its COVER.pad of a current spot (currentSpots); none < 0.25 u from a path edge;
//     none inside the teardrop or < 0.35 u from it, the legacy blob (r 1.45) or the stream line (half width); kit height x scale <= 0.2 in
//     the yards and <= 0.3 on the near side (theta 22-68 deg, r < 16)
// V15 every tree that is always there: bearingSpan(farm, trunk, 0.4, 1.4) <= 240 where >= 3 items are in that ring
// V16 no neighbour within 0.5 u with the same asset, |d scale| <= 0.03 and |d yaw| <= 0.2 rad; every scale > 0
// RF1 an item inside A is grass_short or clover_patch, and its cluster's seed is in A too (a patch seeded outside never reaches in)
const inA = farm.filter((c) => Z.at('main', c.x, c.z)?.zone === 'A');
ok('RF1 no tuft patch spills into A', inA.length > 0 && inA.every((c) => (c.asset === 'grass_short' || c.asset === 'clover_patch') && Z.at('main', K[c.cl].x, K[c.cl].z)?.zone === 'A'));
// RF5 no two clusters of one kind within 4 u share a layout: member count + sorted member distances from the seed (rounded to 0.02 u)
```

- [ ] **Step 2: Run** `node tests/cover.test.mjs`. Expected: V3 FAILS (buttercups), V10 and V12 FAIL (no `cl`, R 1.19), V11 FAILS
  (A 3.3), V13 FAILS (0.07 u from a path), RF1 and RF5 FAIL (no clusters). V15 and V16 should FAIL on the sprinkle; either may be
  green on arrival (Global Constraints).
- [ ] **Step 3: Implement `clusterCover(bp, id, field, rng, ctx) -> { items, clusters }`** and call it for MAIN from the cover block:
  - **Seeds:** a jittered 0.7 u grid. A seed is kept with probability `density(zone) / ((1 / 0.49) × meanMembers)` × a 2.5 u noise
    gate, normalised so that each zone's mean hits its target.
  - **Targets:** A 1.1, lawn 3.5, C 4, B 6, D 2, E (0.25–0.7 u) ≤ ½ lawn.
  - **Kind:** clover (with daisies paired on 25 % of clover seeds) where `coverField(bp.noise, x, z, false).clover` > 0.5, else a
    tuft patch. In A only `grass_short` / `clover_patch`, with scale capped so the height is ≤ 0.15 u. E and D take short grass only.
  - **Members:**
    - from position hashes: tuft patches 4–7 within 0.2–0.35 u, clover 3–7 within 0.15–0.3 u, daisies 3–5 within 0.15–0.25 u;
    - members follow √u radial spacing and a hashed angle, with no shared offset table (RF5);
    - each member goes through the old `ok()` checks (slope, `dcAt`, trunk 0.3, `blocked` + pad, `COVER.moved`), a non-null zone
      at its own position, and RF1's rule;
    - the V13 height limits apply;
    - no clones (V16): a match turns the member +0.9 rad.
  - **Scale and yaw:** the cluster scale comes from `COVER.scale`, each member ×0.78–1.25. Round kinds take a free yaw; daisies
    follow the heading ±0.6 rad.
  - **Rings:** a member that would push its tree's 0.4–1.4 u ring past 240° is dropped (V15).
  - **Streams:** `rngOf('main', 'cluster')`; the old MAIN cell draw goes, and nothing else moves.
- [ ] **Step 4: Run** `cover.test.mjs`. Expected: all PASS, V1–V9 included. Then read V3's line: **both seeds 300–340 plants**. If
  not, tune `composition.ground.density` within the §4 windows and re-run (stop rule in Global Constraints). Run `zones`, `lawn` and
  `species`: PASS.
- [ ] **Step 5: Commit:** "Ground: MAIN's cover as zoned clusters with tuft patches (V3, V10-V13, V15, V16, RF1, RF5) [skip ci]",
  with the RED and GREEN lines.

### Task 3: Grounding

**Files:** `art/scripts/lib/terrain.mjs` (the footprint check, every piece's cover), `art/scripts/lib/composition.mjs` (kit
`yOffset` −0.01), `art/scripts/tests/cover.test.mjs` (V14), `art/scripts/tests/composition.test.mjs` (C12's yOffset).

**Interfaces:**
- Produces: `assets[kitId].yOffset === -0.01`.
- No cover item stands where the ground under its ±0.1 u footprint varies > 0.04 u. The item goes: the export carries no per-item y
  to sink it by.

- [ ] **Step 1: Write V14** (every piece, both seeds):

```js
// the game's height: piece_<id>.height.bin, bilinear (read as bake.test B6 does); the baked top: composition.mjs bakedTopSampler
ok('V14 grounded: grid vs baked top <= 0.02 u at every item; footprint (9 samples of bp.H at +/-0.1 u) varies <= 0.04 u; kit yOffset -0.01',
  maxGridGap <= 0.02 && overFootprint === 0 && KIT_IDS.every((id) => C.assets[id].yOffset === -0.01));
```

  In C12, change `a.yOffset !== 0` to `a.yOffset !== -0.01`.
- [ ] **Step 2: Run** `cover` and `composition`. Expected: V14 FAILS (39 meadow and grove items over 0.04 u; yOffset 0) and C12 FAILS.
- [ ] **Step 3: Implement.** Add the footprint check to the cover acceptance: the old cell draw keeps its draws and only drops the
  item. In `assetTable`, kit records get `yOffset: -0.01`.
- [ ] **Step 4: Run** `cover`, `composition` and `species`. Expected: PASS; V5–V7 still pass on the wild pieces.
- [ ] **Step 5: Commit:** "Ground: cover sits on the ground (V14, kit yOffset -0.01) [skip ci]".

### Task 4: The cover tint

**Files:** `art/scripts/lib/terrain.mjs` (the member tint), `art/scripts/lib/composition.mjs` (cover `tint`, kit
`instanceColor`), `art/scripts/lib/arch-scene.js` (the proof draws it), `cover.test.mjs` (V16 tint clause),
`composition.test.mjs` (C12).

**Interfaces:**
- Consumes `ZoneField.at(...).U`.
- Produces:
  - `cover[i].tint = [r, g, b]`: a linear multiplier, `texturedTint(x, z, { enabled: true, seed: GROUND.tint.seed })` with seed 29
    (its own, not the canopy's 11);
  - C clover (`U` > 0.35) multiplied by `0.82 + 0.08 × ph(x, z, 7307)`;
  - kit records with `instanceColor: 'tint'`;
  - the export's cover items carry `tint`. The game's `paintOf` already turns that into `'tint'` (GV2 adds its vitest).

- [ ] **Step 1: Write the tests.**
  - **V16** gains: every MAIN item carries a tint; items other than C clover have each channel in [0.92, 1.08]; C clover
    (`clover_patch` where `U` > 0.35) has a mean channel in [0.754, 0.972] (= [0.82 × 0.92, 0.9 × 1.08]); a tint with a mean < 0.9
    appears only where `U` > 0.35; more than 20 distinct tints.
  - **C12** becomes "tinted near-white": every kit item has a `tint` (same bands), and the kit records have
    `instanceColor: 'tint'`.
- [ ] **Step 2: Run.** Expected: V16 and C12 FAIL (no tint; C12 asserts "unpainted").
- [ ] **Step 3: Implement** the member tint in `clusterCover`; the wild cell-draw items get the near-white tint the same way. In
  `compositionData`, cover keeps `tint`. In `arch-scene.js`, the cover `instanced(...)` calls `setColorAt` with the tint, as the
  trees do.
- [ ] **Step 4: Run** `cover` and `composition` (PASS). Then run `node build.mjs`, then
  `composition-check.mjs --port N --out $S/tint --agree`: the tints agree.
- [ ] **Step 5: Commit:** "Ground: near-white cover tints, dark clover in the shade pools (V16, C12) [skip ci]".

### Task 5: Batch consolidation, then the P1 gate

**Files:** `art/scripts/lib/terrain.mjs` (a consolidation pass at the end of the cover block), `cover.test.mjs` (V18),
`art/scripts/tests/fixtures/composition.proof.json` (re-measured), `art/config/composition.pieces.json`, `public/models/*`.

**Interfaces:**
- Consumes `cover.base.json` (Task 0).
- Produces: on every piece, every cover kind has ≥ 12 items. Smaller kinds become the piece's main kind of the same group (MAIN's
  buttercups become daisies; perennials take their piece's largest perennial), or go if their group has no kind with ≥ 12.

- [ ] **Step 1: Write V18:**

```js
const kinds = (id) => new Set((P[id].cover || []).map((c) => c.asset)), base = BASE[label];
ok('V18 batches: every cover kind >= 12 items on its piece; no piece > base + 2 kinds; all pieces <= base + 8 kinds',
  bp.order.every((id) => [...kinds(id)].every((a) => P[id].cover.filter((c) => c.asset === a).length >= 12))
  && bp.order.every((id) => kinds(id).size <= Object.keys(base[id].kinds).length + 2)
  && bp.order.reduce((s, id) => s + kinds(id).size, 0) <= bp.order.reduce((s, id) => s + Object.keys(base[id].kinds).length, 0) + 8);
```

- [ ] **Step 2: Run.** Expected: V18 FAILS (MAIN's 4 buttercups and 6 daisies; small perennial kinds on the wild pieces).
- [ ] **Step 3: Implement the consolidation pass.** It relabels items and draws no RNG. If MAIN's daisies stay under 12 on a seed,
  raise the clover–daisy pair share (Task 2) rather than relabel.
- [ ] **Step 4: Run** `cover` (PASS), `composition` and `species`.
  - Re-measure C5's fixture: `node build.mjs`, then `composition-check.mjs --port N --out $S/p1 --extract`. It rewrites
    `tests/fixtures/composition.proof.json`.
  - C5 then PASSES. The only lists that change are `flowers` and `grass` (and their withheld items).
- [ ] **Step 5: Commit:** "Ground: every cover kind earns its batch (V18), C5 re-measured [skip ci]".
- [ ] **Step 6: Phase gate P1.** MAIN sheets at the five cameras. G-items: GV1, and GV2 (a vitest that grass and flowers take
  `tint`).

## P2: the ground paint

### Task 6: The zone paint

**Files:** `art/scripts/lib/terrain.mjs` (`LAWN`, `paintBlueprint`'s `grassAt`), `art/scripts/tests/lawn.test.mjs` (L5–L7, LB,
RF3).

**Interfaces:**
- Consumes `GT.groundZones(bp, comp, comp.water)`; `paintBlueprint` builds it once per call.
- Produces new `LAWN` keys:
  - `aMeso: 0.6` (the meso term ×0.6 in A) and `aNudge: 0.15` (towards `lawn.mid` / `lawn.warm`);
  - `bYellow: 0.3` (`lawn.yellow` in B, within 0.25–0.35);
  - `cDeep: 0.4` (`lawn.deep` × `U`, within 0.35–0.45);
  - `mainLushReach: 2.0` (MAIN's lush band, from `dWater`);
  - `dry: '#AAB888'`, `dryMix: 0.35`, `dryReach: 0.3`.

- [ ] **Step 1: Write the tests** in `lawn.test.mjs` (MAIN, default seed, "Golden afternoon"):
  - **L5:** under the lone farm trees, the mean grass luma where `U` > 0.5 is ≤ 0.97 × the luma 1.5–3 u from the same trunks where
    `U` < 0.1. Under MAIN's C clovers (`clover_patch` where `U` > 0.35; there are ≥ 6), the mean luma is ≤ 0.97 × that ring.
  - **L6:** A is quieter: L1's mean |ΔY| at 2 u with both ends in A is ≤ 0.8 × the same with both ends outside A.
  - **L7:** MAIN's lush band is ≤ 2.5 u. Paint again with `waterLush` 0 and compare by `dWater` from the teardrop (`Z.at`): at
    2.5–5 u the luma ratio is within 1 ± 0.002; at 0.35–1.5 u it is ≥ 1.02.
  - **LB:** every `LAWN` token is inside the lawn band (saturation 0.25–0.45, hue 55–175°). The painted grass vertices' saturation
    p1–p99 is inside 0.25–0.45.
  - **RF3:** after a 1 u blur (each grass vertex takes the mean of the grass vertices within 1 u), B's mean luma is ≥ 1.03 × A's,
    or B's mean hue is ≤ A's − 3°. And the blurred `U` > 0.5 luma is ≤ 0.97 × the blurred 1.5–3 u ring.
- [ ] **Step 2: Run** `node tests/lawn.test.mjs`. Expected: L5 FAILS (0.616 against 0.611: lighter), L6 FAILS, L7 FAILS (the 5 u
  band), RF3 FAILS (no pools). L1–L4 PASS; LB may be green on arrival.
- [ ] **Step 3: Implement the zone terms in `grassAt`** (spec §6):
  - A: the meso noise ×`aMeso`, nudged by `aNudge`.
  - B: `lawn.yellow` at `bYellow`. `lawn.tall` stays on the wild pieces only.
  - C: `lawn.deep` at `cDeep × U`.
  - D: on MAIN the lush mix uses `1 − smoothstep(0.35, mainLushReach, dWater)` instead of `GS.waterRadius`.
  - E: `lawn.dry` at `dryMix × (1 − smoothstep(0, dryReach, dPath))`, under the kept worn band.
  - Edges are soft: a ≥ 2.5 u patch scale, so nothing is finer than the mesh.
- [ ] **Step 4: Run** `lawn` (L1–L7, LB, RF3 PASS), then `look`, `phase2` and `terrain` (PASS).
- [ ] **Step 5: Commit:** "Ground: zone-driven lawn paint (L5-L7, LB, RF3) [skip ci]".

### Task 7: The re-bake, then the P2 gate

**Files:** `public/models/piece_*.glb` and `.height.bin` (re-baked), `art/scripts/tests/bake.test.mjs` (B18), then the
re-exported composition.

**Interfaces:** consumes Task 6's paint. The height grids stay byte-identical (B16).

- [ ] **Step 1: Write B18:** in `piece_main.glb`'s COLOR_0, the mean top-face luma where `U` > 0.5 (the core's `groundZones`) is
  ≤ 0.97 × the 1.5–3 u ring where `U` < 0.1.
- [ ] **Step 2: Run** `node tests/bake.test.mjs`. Expected: B18 FAILS on the shipped pieces; B1–B17 PASS.
- [ ] **Step 3: Re-bake:** `node bake-pieces.mjs`.
- [ ] **Step 4: Run** `bake` (B1–B18 PASS: B16 byte-identical grids, B2 ≤ 280 KB with highland ≤ 295, B10 deterministic), then
  `export-composition.mjs` and `composition` (C6). The ribbons are unchanged, because the heights are.
- [ ] **Step 5: Commit:** "Ground: re-bake the pieces with the zone paint (B18) [skip ci]".
- [ ] **Step 6: Phase gate P2.** Sheets at the same cameras, paint on and off (`LAWN` zone terms zeroed in a scratch build). G-items:
  GV1. Ask whether GV4 is needed only if `CAM-CLOSE` shows the mesh failing at a path edge.

## P3: the edges

### Task 8: `pebbles` in the kit and the understory

**Files:** `art/scripts/lib/plantkit.mjs` (`KIT.pebbles`, group `'stone'`), `art/scripts/lib/composition.mjs` (`KIT_CATEGORY`:
`'stone'` → `'rocks'`, so pebbles stand still in the wind), `terrain.mjs` (C pebble clusters on MAIN), `plantkit.test.mjs`
(K10), `composition.test.mjs` (C12 per category). In `lib/asset-contract.mjs` (V1's register), add a `pebble` class (approach `['D']`,
tris 24, kb null, texMax 512, density CARDS, rules "ASSET-RULES §2 (plantkit.test K10)") and map `pebbles: 'pebble'`.

**Interfaces:**
- Produces `KIT.pebbles`: 3–5 painted pebbles on low cards, ≤ 0.04 u tall, ≤ 0.25 u across, ≤ 24 tris, 128² MASK PNG, with the
  contact shade painted in.
- Colours: `stone.prop #C3B49A`, `stone.propDark #9C8C74`, moss `lawn.deep #56844F`.
- Placed by Tasks 8–10 and 12.

- [ ] **Step 1: Write the tests.**
  - In `plantkit.test`, add `pebbles: [0.015, 0.045]` to `HEIGHT` and `stone: 24` to `BUDGET` (K1–K8 cover it).
  - **K10:** ≤ 24 tris, max y ≤ 0.045, footprint radius ≤ 0.13 u, a 128 × 128 MASK PNG.
    - Contact shade: opaque texels within 2 px of a clear one have a mean luma ≤ 0.85 × those ≥ 4 px in.
    - ≥ 70 % of the opaque texels sit in the stone band (saturation ≤ 0.30, hue 0–60°); the rest are greens.
  - **C12:** the category comes from `KIT_CATEGORY` (`pebbles` → `rocks`).
  - **cover V18:** MAIN's pebbles are ≥ 12; all in C (Task 9 adds E).
- [ ] **Step 2: Run** `plantkit`, `composition` and `cover`. Expected: FAIL (no `pebbles`).
- [ ] **Step 3: Implement** the card painter in `plantkit.mjs`'s style (seeded, alpha bled), and 3–5 C clusters of 3–5 pebbles on
  MAIN through `clusterCover`.
- [ ] **Step 4: Run** `plantkit`, `assets` (V1), `palette` (V2), `composition` and `cover`. Expected: PASS.
- [ ] **Step 5: Commit:** "Ground: pebbles in the kit and under MAIN's trees (K10) [skip ci]".

### Task 9: Path edges

**Files:** `terrain.mjs` (E pebble runs), `cover.test.mjs` (V13 pebble clause, RF4).

**Interfaces:** consumes `ZoneField.at(...).dPath` and MAIN's path runs (`comp.pieces.main.paths`, layout dirt paths included,
with `STONE_PATHS`).

- [ ] **Step 1: Write the tests.**
  - **V13p:** for each MAIN run ≥ 2 u long, the share of its length that has a pebble cluster 0.25–0.7 u off its edge is 0.25–0.35.
    Consecutive clusters along a run switch sides ≥ 70 % of the time. No pebble lies < 0.25 u from an edge.
  - **RF4:** for every `pebbles` item, 9 samples of `bp.H` within its 0.125 u radius span ≤ 0.015 u, and `|grid − baked top|` ≤ 0.01.
- [ ] **Step 2: Run** `cover`. Expected: V13p FAILS (no E pebbles); RF4 reports Task 8's C pebbles.
- [ ] **Step 3: Implement** pebble clusters (3–5) along each run. Walk the run at 0.8 u steps, pick 25–35 % of the steps by
  `ph(x, z, 9907)`, and alternate the side. RF4 rejects a spot whose footprint is not flat; the walk then tries the next step.
- [ ] **Step 4: Run** `cover` (PASS) and `composition`.
- [ ] **Step 5: Commit:** "Ground: pebble runs along the path edges (V13p, RF4) [skip ci]".

### Task 10: The pond edge on the teardrop, then the P3 gate

**Files:** `terrain.mjs` (D stretches, `comp.pieces.main.reeds`), `composition.mjs` (`pieces.main.reeds` and a `draw.reeds` note;
`serialize` writes it), `arch-scene.js` (reed stand-ins for the proof's renders), `ground-measure.mjs` (`polyEdgeDist`),
`cover.test.mjs` (V11 D, V13 shore, V17, RF2), `composition.test.mjs` (C22).

**Interfaces:**
- Consumes `comp.water.main.pond.outline` (191 points; the first and last are the cap corners, where the stream leaves).
- Produces:
  - `comp.pieces.main.reeds = [{ x, z, height, head, cl }]`, exported piece-local as `pieces.main.reeds = [{ x, z, height, head }]`.
    It sits outside `CATEGORIES`, so the counts do not move. It maps 1:1 to the game's `Reed { at, height, head }`.
  - D-stretch cover items carry `stretch: k` (internal).
  - `polyEdgeDist(poly, x, z) -> number` in `ground-measure.mjs`: the distance to the polygon's nearest edge.

- [ ] **Step 1: Write the tests** (the camera's ground direction is (sin 45°, cos 45°) = (0.707, 0.707), as `lakeJetty` computes it;
  the outward normal is `n`):
  - **V11 D:** 4–6 per u² inside the stretches; the rest of D 1.5–2.5.
  - **V13 shore:** within 1.25 u of outline points with `n · c` > 0.2 (the camera-facing shore), no reeds and nothing with kit
    height × scale > 0.2.
  - **V17:** reeds cover ≤ 35 % of the teardrop's perimeter (outline points within 1.0 u of a reed), in ≥ 2 runs separated by
    ≥ 1.0 u; clumps of 3–5 (by `cl`).
  - **RF2:** every reed and every stretch item lies 0.35–1.25 u outside the teardrop polygon (`polyEdgeDist`, outside `inLoop`),
    never by the legacy blob alone. None is within 1.0 u of the cap line.
  - **C22:** `pieces.main.reeds` has ≥ 6 entries, each with height in [0.8, 1.25] and a boolean head, piece-local; RF2 holds on the
    exported values; `draw.reeds` names the game's `Reeds` and GV3.
- [ ] **Step 2: Run** `cover` and `composition`. Expected: V17, RF2, C22 and V11 D FAIL (no reeds, no stretches).
- [ ] **Step 3: Implement** the stretches:
  - 2–3 arcs on the far side (`n · c` < −0.2), clear of the cap by 1.0 u, ≤ 35 % of the perimeter, chosen by `ph`.
  - Reed clumps of 3–5 at 0.4–0.9 u out, height 0.8–1.25, head share 0.45 (the game's `reedsIn` numbers).
  - Clover and short grass at 4–6 per u² on the stretches; pebbles on 1–2 of them.
  - On MAIN: no `grass_tall`. The wild pieces keep their own D (Task 12).
  - `arch-scene.js` draws one thin cone per reed in `REED_TINTS`, named `reeds:stand-in`. It is proof only.
- [ ] **Step 4: Run** `cover`, `composition`, `zones` and `lawn`. Expected: PASS.
- [ ] **Step 5: Commit:** "Ground: reeds and stones on stretches of the teardrop's far shore (V17, RF2, C22) [skip ci]".
- [ ] **Step 6: Phase gate P3**, plus pond and path close-ups: `CAM-CLOSE` aimed at the pond and at each dirt path, at az 16.35,
  45 and 73.65. G-items: GV1, GV3 (the game's `Reeds` at `pieces.main.reeds`; drop the 7 spike reeds and the ring of 11 stones),
  G5 (MAIN's dirt paths as art ribbons).

## P4: the wild pieces

### Task 11: Calmer tall grass

**Files:** `plantkit.mjs` (`grass_tall` and `grass_seedhead` paint colours), `plantkit.test.mjs` (K11).

**Interfaces:** the same ids, geometry and budgets; only the textures change.

- [ ] **Step 1: Write K11.** The opaque texels in the top third of each card's height have a mean sRGB luma ≤ 1.15 × 0.54 = 0.621
  (the meadow lawn's median, spec §2), for both kinds. `grass_seedhead`'s cream heads (saturation ≤ 0.35, luma ≥ 0.65) are 2–8 % of
  its opaque texels.
- [ ] **Step 2: Run** `plantkit`. Expected: K11 FAILS (0.63 and 0.80).
- [ ] **Step 3: Implement:** darken and warm `C.tallTip` and the seedhead stems toward `lawn.tall #A2B06A` / `lawn.mid`; keep the
  heads small.
- [ ] **Step 4: Run** `plantkit` (K1–K11 PASS) and `palette` (V2).
- [ ] **Step 5: Commit:** "Ground: calmer tall grass (K11) [skip ci]".

### Task 12: The field on the wild pieces

**Files:** `terrain.mjs` (`clusterCover` on every piece; the zone rules on the cell draw), `world.config.mjs`
(`composition.ground.spots` for meadow, grove, islet and wetland), `cover.test.mjs` (V11 meadow; V12–V16 on every piece).

**Interfaces:**
- Consumes `ZoneField` and Tasks 2–10.
- Produces:
  - `comp.pieces[id].cover` / `.coverClusters` on every piece;
  - `composition.ground.spots[id]`: `isleSpots.ts KEPT_CLEAR` mirrored at world = piece-local + `dockedPosition`:
    - the meadow rock (r 0.35);
    - the grove log (a capsule along its 0.52 half-length, r 0.2);
    - the islet rocks (r = s[0] × 0.95);
    - the wetland cranberry bed (half + 0.15, as a capsule);
    - all `keep: 'clear'`, halo 0.3, with notes citing `isleSpots.ts:356-368`.

- [ ] **Step 1: Write the tests.**
  - **V11 meadow:** A 0.8–1.5 and ≥ 70 % open at 0.3 u; C 3–5; E (0.25–0.7 u) ≤ ½ the lawn; B ≥ 2.5 × A.
  - **V12** on every piece (Clark–Evans ≤ 0.8; ≥ 80 % of clusters 3–7). **V13–V16** on every piece, with V13 adding the wild spots,
    `B.paths` runs and the lake, tarn, river, outflow and hot spring.
  - V5–V7 stay.
- [ ] **Step 2: Run** `cover`. Expected: V11 meadow and V12 FAIL (R 0.96–1.08 on the wild short grass).
- [ ] **Step 3: Implement.**
  - Wild short grass and clover come from `clusterCover`. The cell draw keeps every draw, but a pick of `grass_short` or
    `clover_patch` is skipped, so the tall patches, drifts, perennials and ferns stay item for item.
  - Zone rules drop a cell-draw item that lands in A (unless short or clover), in E with a height over 0.15 u, or on a null zone.
  - D at the lake and the tarn: stretches with `grass_tall` ×0.6, clover and pebbles. No composition reeds there: the wetland's reed
    beds are the game's.
  - C: dark clover, pebbles; the ferns as they are.
- [ ] **Step 4: Run** `cover` (PASS, V5–V7 included), `species`, `composition` and `zones`.
- [ ] **Step 5: Commit:** "Ground: the zone field and clusters on the wild pieces (V11-V16) [skip ci]".

### Task 13: `weed_rosette`

**Files:** `plantkit.mjs` (`KIT.weed_rosette`, group `'grass'`), `lib/asset-contract.mjs` (`weed_rosette: 'grass'`), `terrain.mjs`
(in B's drift mix on every piece), `plantkit.test.mjs` (K12), `cover.test.mjs` (RF4 for rosettes, V18).

**Interfaces:**
- Produces `KIT.weed_rosette`: a flat star of broad leaves, ≤ 16 tris, ≤ 0.06 u tall, ≤ 0.25 u across, 128² MASK. Colours
  `lawn.clover #4E7C4A` → `lawn.yellow #A9C377`.
- Placed in B drifts: 15 % of drift seeds, MAIN included; ≥ 12 on each piece where it appears.

- [ ] **Step 1: Write the tests.**
  - In `plantkit.test`, add `weed_rosette: [0.03, 0.07]` to `HEIGHT`, at the grass budget of 24 (K12 tightens it).
  - **K12:** ≤ 16 tris, footprint radius ≤ 0.13 u, 128² MASK. The opaque texels have a mean luma ≥ 0.85 × 0.611 = 0.52 (MAIN's
    lawn median, so no dark speckle), hue 70–110° and saturation 0.30–0.60.
  - **RF4** extends to `weed_rosette`. **V18** keeps every piece within budget.
- [ ] **Step 2: Run** `plantkit` and `cover`. Expected: FAIL (no `weed_rosette`).
- [ ] **Step 3: Implement** the painter and the B placement.
- [ ] **Step 4: Run** `plantkit`, `assets`, `palette`, `cover` and `composition`. Expected: PASS; V3's line still shows 300–340
  plants on MAIN.
- [ ] **Step 5: Commit:** "Ground: weed rosettes in the wild drifts (K12, RF4) [skip ci]".

### Task 14: The P4 gate, before/after renders and the game handoff

**Files:** create `art/specs/2026-10-25-ground-vegetation-handoff.md`; modify `art/ASSET-RULES.md` §2 (the Detail density,
Variation and Technical rows: zones, tuft patches, `pebbles` and `weed_rosette` budgets); add `art/screenshots/ground-final/`.

**Interfaces:** consumes everything above.

- [ ] **Step 1: Phase gate P4**, with close-ups of each wild piece (meadow and grove first) and mid-game.
- [ ] **Step 2: Make the final before/after set:** the base commit against the branch, fresh and mid-game, at `CAM-DESK`,
  `CAM-ORBIT-W`, `CAM-ORBIT-E`, `CAM-CLOSE`, `CAM-PHONE` and `CAM-LOW`, plus the meadow and grove close-ups. Check every view
  yourself. Report the green share and the B5 numbers.
- [ ] **Step 3: Write the handoff note:**
  - **GV1:** run `npm run composition` and copy in the regenerated `public/models` and pieces; `src/world/composition.test.ts` must
    agree.
  - **GV2:** the tint vitest.
  - **GV3:** `Reeds` at `pieces.main.reeds`; drop the spike reeds and the ring stones.
  - **G5:** MAIN's game-drawn `DirtPath` still has the hard edge; until G5 makes them art ribbons, E on MAIN is cover and paint only.
  - **GV4:** only if the renders showed the mesh failing.
  - **Frame time:** the asks (+0.3 ms desktop and +1.0 ms mobile-profile medians, all pieces docked), with the B5 numbers.
- [ ] **Step 4: Update** ASSET-RULES §2 to the shipped rules. Run `assets` and `palette` (PASS).
- [ ] **Step 5: Commit:** "Ground: before/after sheets, game handoff, ASSET-RULES §2 [skip ci]". Push. The controller sends the
  note to the game session.

---

## Self-review (2026-10-25)

- **Spec coverage:**
  - §3 field → Task 1; cluster model → Task 2; tint → Task 4.
  - §4 zones: A, lawn, B, C → Task 2; E → Tasks 2 and 9; D → Task 10.
  - Wild pieces → Task 12. §5 kinds → Tasks 8, 11 and 13; consolidation and budget → Task 5.
  - §6 → Tasks 6–7. §7 → Tasks 9–10 (G5 handed off). §8 G-items → the phase gates and Task 14.
  - §10: V3 and V10–V18 → Tasks 2–5, 9, 10 and 12; L5–L7 → Task 6; K → Tasks 8, 11 and 13; C12 → Tasks 3, 4 and 8; C5 → Task 5;
    B5, renders and green share → the Phase gate.
- **Names:**
  - The field: `groundZones`, `ZoneField.at/pools/spots/shore`, `GROUND`.
  - Cover: `coverClusters`, `cl`, `tint`, `reeds`.
  - Helpers: `zoneGrid`, `zoneAreas` and `currentSpots` (Task 1); `densityIn`, `openShare`, `patchShare`, `clarkEvans`,
    `bearingSpan` and `kitHeights` (Task 2); `polyEdgeDist` (Task 10). All live in `ground-measure.mjs`.
- **Guard tests that may be green on arrival:** V15, V16 (Task 2), and LB (Task 6). The step says so each time.
- **Proportion:** about 1.7× the spec's lines, most of it test assertions and pinned values. No function bodies.
