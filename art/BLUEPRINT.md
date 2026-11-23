# Island blueprint: how the pieces connect (for the game)

> **Pointer (2026-10-24).** Pieces, composition, ribbons and the jetty anchor stay specified here. Look and asset rules live in [ART-BIBLE.md](ART-BIBLE.md) and [ASSET-RULES.md](ASSET-RULES.md); the inventory in [ASSET-CATALOG.md](ASSET-CATALOG.md).

The art session wrote this for the game session on 2026-10-19. It covers where the island blueprint stands and how the game connects the unlock pieces to the farm. The full design is in [config/world-layout.spec.md](config/world-layout.spec.md) (v3.1). This page is the short version plus the current state.

## The idea in one paragraph

The world is one island cut into 8 pieces. The centre piece is the game's `MAIN`, with every layout.ts coordinate unchanged. Each of the 7 unlock pieces rises from the cloud sea and docks directly against MAIN along its own stretch of MAIN's rim. Neighbouring pieces have identical ground heights along every seam, so no bridge is needed and there is no step or gap. With everything unlocked, the pieces form one continuous round island about 55 u across. The layout follows the user's concept images in [reference/concept/](reference/concept/). The user decided this on 2026-10-18. It replaces the separate floating isles (`ISLES` in layout.ts) and the `SkyBridge`.

## Status

- **Approved and frozen.** The user approved the layout and froze it. Piece ids, docked positions, seam ranges, outlines and the JSON format are pinned by `scripts/tests/blueprint.test.mjs` (22 checks, all passing).
- **Built from the game's numbers.** The source is `src/world/layout.ts`, `terrain.ts`, `Isles.tsx` and `Water.tsx` at `01449a2` (feat/idle-loop). Since then main has changed only `framing.ts`, to hide isles of switched-off features. MAIN, the slots and the blockers still match.
- **Checked.** For both seeds, every piece is a closed, watertight mesh. Seam height differences are at most 1e-5 u, and the ground within 0.6 u of every seam is walkable (≤ 15°). All 128 unlock subsets dock coherently, and no docked piece hides the farm from the gameplay cameras.

## The pieces

θ is `Math.atan2(z, x)` in degrees, the terrain.ts convention. "MAIN rim" is the stretch of MAIN's rim the piece docks along. The unlock column repeats what the JSON records; game config is the authority.

| piece | unlock | docked position (x, y, z) | MAIN rim θ | flat core r | water / extras |
|---|---|---|---|---|---|
| main | start | 0, 0, 0 | — | per layout.ts (111 flat zones) | pond, stream |
| meadow | any order (land price) | 10.9, 0, 11.7 | 4.5° – 90° (near side) | 2.6 | |
| wetland | any order + 4 restorations | −12.6, 0, 11.4 | 90° – 159.75° | 2.4 | lake, river, outflow, waterfall; jetty anchor `wetland_jetty` |
| cottage | any order (land price) | −19.47, 0, 1.02 | 159.75° – 195.75° | 1.8 | |
| highland | any order + 9 restorations | −16.37, 3, −17.55 | 195.75° – 264.375° (far side) | 2.8 | tarn, hot spring |
| orchard | any order (land price) | 2.8, 0, −15.8 | 264.375° – 295.875° | 1.8 | |
| grove | any order (land price) | 11, 0, −12.3 | 295.875° – 330.75° | 2.4 | |
| islet | any order (land price) | 18.8, 0, −4.2 | 330.75° – 4.5° (wraps) | 1.6 | 5 open-coast anchors: harbour mooring, cloud fishing, signal fire, lighthouse, keeper's cottage |

All land is claimed at level 1, in any order, at one price that rises with each piece already owned (`LAND` in `src/game/config.ts`). The wetland also needs 4 restorations and the highland 9; the other five are plain land.

Only low pieces sit on the near side (+x/+z, the camera's line of sight to the farm). The tall pieces (highland, cottage, orchard) sit on the sides and the far side.

## Connecting a piece (the docking recipe)

1. **Position.** Put the piece's group at its `dockedPosition`. Its pivot is its local origin at flat-ground level (`height(0, 0) = 0`), so the existing `Rising` works unchanged: it starts 9 u below and eases up over 4.5 s.
2. **Seams.** The piece meets MAIN, and any docked neighbour, exactly, so no bridge is needed. Each piece is also closed on its own, so it can rise alone. Once it docks, the seam walls sit back to back inside the island and can't be seen.
3. **MAIN's rim.** While a piece is docked, hide MAIN's rim-only effects inside that piece's θ range. The stream's waterfall at θ 2.42 rad (138.7°) falls inside the wetland's range. Keep slots off the seams.
4. **Placing things.** Use the piece's local x/z plus `height(x, z)`, never an absolute y. Each piece's flat zones (buildings, animals, spots, each with `at`, `r`, `level`) are in the JSON.
5. **Water.** The game draws the water and the terrain carves it. The JSON gives the lake and tarn outlines plus levels, the river polyline plus width and level, and the waterfall points. These are in world x/z and world y (subtract `dockedPosition` for local). The river starts exactly where MAIN's stream meets the rim and matches its width and level.
6. **The wetland jetty.** The wetland's `openCoastAnchors` holds `wetland_jetty`, the spot for the `wetland_jetty` model. The model is 0.716 × 1.707 u, runs along its +Z with its origin at the deck centre and its shore-end sill at local z −0.85 (top y 0.162); y = 0 is the waterline and the piles reach −0.3. It sits on the lake's farm-side shore, on the +x side of reed bed b and the −z side of the eastern lily pads, and points into the lake towards −x / +z, side-on to the default camera. It is Fin's jetty on the wetland lake, built by the Pond Jetty restoration (game id `pondJetty`); before the wetland has docked, Fin sits by the farm pond, with no jetty there.
   - **Placing it.** Put the model's origin at local (`at[0]`, `level`, `at[1]`) and turn it by `rotation.y = yaw`. The yaw turns the model's +Z onto `outward`, out over the water (`outward = [sin yaw, cos yaw]`).
     - `at` (the deck centre) is local (7.609, 4.241), world (−4.991, 15.641).
     - `yaw` is −0.763 rad (−43.7°).
     - `level` = `y` = −0.32, the lake level.
     - `shoreEnd` is the sill, 0.85 u behind `at`, at local (8.196, 3.626). The baked top there is 0.130 u above the level, inside the 0.11–0.16 the sill wants. `shoreEnd.bank` is the core's estimate, 0.151; the baked top runs about 0.02 below it.
   - **Shed patch.** `shedPatch` is a disc of r 0.6 beside the shore end, at local (7.808, 2.425), on dry, flat ground (`y` = its ground height). It is kept clear for Fin's small shed (lore BIBLE Q4; art item A18 in ART-PLAN).
   - **Kept clear.** The deck clears the heron hide, both reed beds, the game's lily pads and shore-reed clumps (`isleSpots.ts`) and the river and outflow. The composition places nothing on the deck (+ 0.15 u) or the shed patch (+ 0.15 u). The other keep-clear discs (the woodshed, a bush, Barnaby's camp and stand, the hero tree's roots) are under **Kept clear** in the composition section.
   - **How it is chosen.** `lakeJetty()` in `lib/terrain.mjs` tries every lake outline point and deck direction (config `blueprint.coastAnchors.wetland[].jetty`). It puts the shore end where the bank, as the baked top smooths it (H averaged over ±0.35 u along the deck), is 0.15 u above the level, then scores side-on to the default camera, a flat shed patch, nearness to the farm-side shore point (4.71, 2.09) and the depth under the far piles. `tests/composition.test.mjs` C17 and C18 check the result against the baked `piece_wetland.glb`.
   - **Game side.** `scripts/blueprint.mjs` already copies `at`, `outward` and `y` into `blueprint.data.ts` (`anchor('wetland', 'wetland_jetty')`), so yaw = `Math.atan2(outward[0], outward[1])`. `yaw`, `level`, `shoreEnd`, `deck` and `shedPatch` are only in the JSON until that script copies them too.

## Files

| file | what it is |
|---|---|
| `config/blueprint.pieces.json` | **The piece data for the game** (format `gitaway.blueprint-pieces/1`). Per piece it holds the docked position, outline (local), MAIN θ range, seams with each neighbour (local, world and heights), flat zones, water and anchors. It is generated by `scripts/build.mjs`, so don't hand-edit it. |
| `config/world-layout.spec.md` | The design spec (v3.1), including §10, the JSON contract. |
| `config/world.config.mjs` | Every layout number. `archipelago.game` is the transcribed MAIN, slots and blockers, citing the commit. `archipelago.blueprint` is the parent island and pieces. |
| `scripts/lib/terrain.mjs` | The island core, with no three.js dependency (typed arrays plus functions, node-tested). `buildBlueprint(world.archipelago, look)` returns every piece with `positions`, `normals`, `colors`, `pivot`, `height(x, z)`, `outline(θ)` and `random()`. |
| `scripts/lib/islandAdapter.mjs` | A thin three.js adapter. THREE is passed in, so nothing is imported. `islandContract(THREE, piece)` returns the game's `Island` shape (`geometry`, `height`, `outline`, `random`). `pieceGroup(THREE, piece, material)` returns a Group at the piece's pivot. |
| `scripts/tests/blueprint.test.mjs` | The 24 checks above, including V and V2: the JSON's unlock strings and this file's piece-table unlock column. `TARGET=gameref` also runs the check that the game's current `makeIsland` fails (see Known issues). |
| `reference/concept/*.png` | The user's concept images: the whole island plus one per region. They govern layout and style. |
| `config/WORLDSEED-BRIEF.md`, `config/lookPresets.json`, `meshy/` | The look work: the Worldseed art direction, time-of-day presets and the AI-made models. This isn't needed for docking, and adopting the look comes later. |
| [`LOOK-PORT.md`](LOOK-PORT.md) | How the game adopts the proof's Worldseed look, step by step: lights, cel bands, sky, cloud sea, plants, composite pass and day-cycle keyframes. |

## Getting the geometry into the game: a decision to make

- **Runtime build.** Import `terrain.mjs` and `islandAdapter.mjs`, and call `buildBlueprint` once. It is exact, but it takes **about 1.9 s in node** and yields about **143k triangles** for all 8 pieces (main 17.6k, highland 28.3k, the others 12.5k–21.2k). That is probably too slow and too heavy on a phone. TypeScript also needs a `.d.ts` for the `.mjs` files.
- **Baked pieces (my recommendation).** The art session exports each piece's mesh (positions, normals, linear vertex colours) and a height grid to files the game loads. The art session can also cut the triangle count. This is now done; see [Baked pieces](#baked-pieces) below.

Rendering notes:
- Vertex colours are linear.
- Normals are smooth on grass and flat on rock, so don't force `flatShading`.

## Baked pieces

The baked option now exists: `public/models/piece_<id>.glb` and `piece_<id>.height.bin` for main, meadow, wetland, cottage, highland, orchard, grove and islet, plus one `piece_<id>` entry each in `public/models/manifest.json`.

- **Mesh.** The node and mesh `piece_<id>`, with one primitive and one opaque material. It has float32 `POSITION` and `NORMAL`, `COLOR_0` as linear normalized UNSIGNED_BYTE vec3 (use `vertexColors`), uint16 indices and no textures. Coordinates are piece-local: put the node at the piece's `dockedPosition` in `config/blueprint.pieces.json`, and `Rising` works unchanged. Faces are sorted with the top surface first. The mesh extras (`mesh.userData` in three.js) carry `faceRanges = { top: [firstTri, count], coast, under, seam, inner, cone }`. The colours are the default look preset's terrain paint ("Golden afternoon").
- **Open-seam skirts (v2).** Each petal's node has one child node per petal neighbour, named `skirt_<neighbourId>`, each with its own mesh of the same name and the same material. MAIN-facing sides have none, and MAIN has none.
  - meadow: `skirt_wetland`, `skirt_islet`
  - wetland: `skirt_meadow`, `skirt_cottage`
  - cottage: `skirt_wetland`, `skirt_highland`
  - highland: `skirt_cottage`, `skirt_orchard`
  - orchard: `skirt_highland`, `skirt_grove`
  - grove: `skirt_orchard`, `skirt_islet`
  - islet: `skirt_grove`, `skirt_meadow`

  A skirt is a decorative cliff in the coast-wall style. It sits on the neighbour's side of the seam, from MAIN's rim to the coast. It has a column at every seam ring (about 0.5–0.75 u apart) with vertical slab facets: one outward offset per ~1.15 u block, 0.4 u ± 0.3 u, held down the face. A rim lip stands 0.12 u proud of its block at the top. A mid-depth row on its own coarser blocks breaks up the lower face, and the skirt tucks onto the seam wall's bottom edge, so its lower edge follows the underside. Each skirt is 294 triangles, with strata colours. **Show `skirt_X` while X is not docked, and hide it when X starts rising.** The flat seam wall stays in the piece mesh, so the piece stays closed and the seams exact. It has rows at 0.9, 1.7 and 2.6 u below its top (where the wall is that tall) that carry the rock strata, so it reads as rock while the skirt is hidden.
- **Manifest entry.** `{ file, status: "ready", tris, notes, height: { file, origin: [x0, z0], spacing: 0.25, size: [nx, nz] } }`. `tris` counts the piece mesh plus its skirts.
- **Height grid.** Float32 little-endian, `nx * nz` values, row-major with x fastest: `h(i, j) = grid[j * nx + i]` at local `(x0 + 0.25 i, z0 + 0.25 j)`. It is sampled from the baked mesh's top faces, so props sit on what is rendered. Cells off the top are **NaN**. Look up heights bilinearly; at the rim, drop the NaN corners and renormalise the weights (`gridHeight` in `scripts/lib/arch-scene.js` does this). No finite corner means the point is off the piece. v2 left the grids byte-identical, because the top did not change.
- **Depth.** `depth` and `bottomLocal` in `config/blueprint.pieces.json` describe the baked pieces, read from the bake-resolution build (`gameBottoms()` in `scripts/lib/bake.mjs`), so they match the GLBs exactly. Since v2, the cone below the 2 u coast wall is squashed by `underside.gameScale = 0.7` in `world.config` (the bake profile's `underScale`). MAIN's own cone (−6.9) is unchanged. The full-resolution proof keeps scale 1.
- **Underside taper (v5, 2026-10-23).**
  - **What it does.** Each petal's underside also falls toward its two seams, as if they were coasts (`underside.seamTaper` in `world.config`, `Uat` in the core). The effect is strongest inland, near MAIN's rim and axis, and fades out over the 6 u nearest the outer coast.
  - **A lone petal.** It hangs like its own rock: a 2 u lip on its seams, then its own cone, instead of a radial slab.
  - **Under MAIN.** A petal's underside keeps 0.6 u below MAIN's cone.
  - **The joined island.** Its default view is visually unchanged. At low tilt its underside reads as hanging lobes, which ruling R1 accepts.
  - **New depths.** The petals now hang to −7.9 … −10.8 local (highland −14.0), so `depth` runs 1.43–2.54 (was about 3.4–4.0).
  - **Game: don't scale offsets below the rim by `depth`.** The game's rising-cloud ring (`Rising.tsx`, `min(1.6, 0.55 × depth)`) would shrink to 0.79–1.40 u, and its puffs would poke through the coast grass. Keep that offset a constant 1.6 u: every outer coast is still a full 2 u wall, because the taper fades to nothing at the coast.
  - **Check.** `tests/bake.test.mjs` B17 measures a lone petal's visible seam wall against its visible top from sampled azimuths of the game orbit (45°, −4° and 94°, plus the halfway 21° and 69°; polar 0.62–1.22), not the whole orbit: ≤ 0.6 at the default tilt, ≤ 0.8 at 45° / −4° / 94° and ≤ 0.83 at the halfway azimuths. The orchard is the worst: 0.55 at the default tilt, 0.77 at 45° / −4° / 94°, and 0.81 at 69° and polar 1.22, which ruling R5 accepts. It was 2.04 / 3.14.
- **Flat zones.** A zone whose centre is off its piece's top is no longer exported. That drops MAIN's staticTree at (−6.2, −5.6) and leaves 143 zones.

| piece | tris v5 (skirts) | KB v5 | v1 tris / KB | grid |
|---|---|---|---|---|
| main | 7,058 (0) | 232 | 7,058 / 232 | 75 x 73 |
| meadow | 5,024 (588) | 262 | 4,834 / 238 | 101 x 95 |
| wetland | 4,760 (588) | 268 | 4,410 / 231 | 102 x 86 |
| cottage | 3,724 (588) | 211 | 3,390 / 175 | 72 x 59 |
| highland | 5,088 (588) | 286 | 4,762 / 249 | 101 x 101 |
| orchard | 3,436 (588) | 199 | 3,122 / 163 | 51 x 78 |
| grove | 3,888 (588) | 218 | 3,560 / 184 | 76 x 78 |
| islet | 4,548 (588) | 253 | 4,176 / 214 | 86 x 60 |
| all 8 | 37,526 | 1,929 | 35,312 / 1,686 | |

The v5 numbers are the current GLBs (the underside taper, plus the wetland's repaint for the jetty keep-clear). The two skirts are 294 triangles each.

**How the pieces are made.** `scripts/lib/bake.mjs` builds the core at a lower resolution: `buildBlueprint(A, L, { res: PROFILE })`. The default build is bit-identical.
- **Sampling.** MAIN's rim and cone use every 4th of the 320 rim vertices plus the 7 seam starts. The petals use every 3rd ring, so seam points are a subset of the JSON seam polylines, with coarser arc, underside and wall-row steps per piece.
- **Seams.** Neighbours still share every seam vertex from one store, so the seams are exact by construction.
- **Flat pads.** The core bisects any top edge that would tilt a flat pad by more than 2 mm (pads next to risers), with the top boundary locked. Overlapping pads at different levels (the highland core at 3.0000 and the standing stones at 3.0094) leave a 9 mm step in the layout itself, so the highland arc step was picked where no coarse triangle straddles that step.
- **v2 additions.**
  - `sharedSeamNormals`: every rim and seam vertex takes the area-weighted normal of all the pieces' top faces around it, which removes the shading line along the seams.
  - `seamBulge: 0` and `seamTopRows`: flat seam walls with strata rows.
  - `skirts`.
  - `underScale`. The underside paint ramps by the depth a vertex would have at scale 1, so the shallow cone still shades into the haze. In the proof, `?baked=1` shrinks the preset's shader fade (`stone.fade`, world y) the same way.

**Measured errors** (`node tests/bake.test.mjs`, 17 checks):
- **Seams.** Docked world positions match within 7.6e-7 u on every MAIN–petal and petal–petal seam, and every seam edge and back-to-back wall face has its twin.
- **Seam normals (B12).** Across pieces they match within 3e-8 rad, and against the joined surface within 2e-7 rad. v1: 0.11 rad, which was the shading line.
- **MAIN.** All 111 layout.ts flat zones are flat at y = 0.
- **Height grid (B6).** Bilinear lookup against the mesh is within 1.3e-4 u in flat zones and 0.013 u on gentle ground. Over the whole top it is p99 0.057 u and max 0.38 u, the max on islet and highland risers.
- **Outline (B7).** The baked rim is within 0.086 u of the JSON outline.
- **Against the full-resolution core (B8).** On gentle ground: p99 0.013 u, max 0.08 u. Overall: p99 0.26 u, max 1.0 u. The large errors come from mesa and headland risers, which move by up to about half a cell.
- **Underside share of the screen (B13)**, at the game's final cameras (target (0, −0.6, 0), azimuth 0.7854, fov 30):

  | camera | v1 | 0.45 | 0.7 (committed) |
  |---|---|---|---|
  | phone 412×915 at 106.3, MAIN alone | 4.9% | 4.9% | 4.9% |
  | phone at 130, MAIN + meadow + grove + islet | 13.9% | 4.6% | 8.0% |
  | desktop 1440×900 at 35.5, the same set | 0% | 0% | 0% |
  | lowest tilt (polar 1.22), phone at 130 | 21.3% | 6.1% | 12.7% |
  | lowest tilt (polar 1.22), desktop at 35.5 | 0% | 0% | 0% |

  At the polar 1.0668 cameras the phone and desktop shares must stay ≤ 20%; the lowest-tilt shares are reported only. At desktop 35.5 the near coast is below the frame.
- **Against today's makeIsland (report only).** Baked MAIN differs from `makeIsland` by up to 0.79 u at the layout.ts slots (static tree 1), and by 0.71 u from its rendered mesh.

**Trade-off.** File size is the binding limit. Core glTF needs float32 normals, so a vertex costs 28 B, and every flat-shaded rock face needs its own 3 vertices (about 90 B per face). That is why the total is about 37.5k triangles instead of 40–50k, and each file is kept ≤ 280 KB (the highland ≤ 295 KB; it is 286). It is also why the highland has softer mesa risers (a riser spans one cell of about 0.6–0.8 u instead of about 0.25 u) and a smoother far-side underside without the rock ribs. These differences show in the photo orbits (`orbit_back`, `highland`), not in the gameplay presets. The skirts and the deeper 0.7 walls add 24–39 KB per petal over v1 (v5 sizes). To fit, the highland's arc step is coarser (2.7×), and meadow and wetland have coarser underside arcs. Two alternatives:
- `KHR_mesh_quantization` int8 normals, which three's GLTFLoader reads natively: 20 B a vertex, about 30% smaller files.
- A larger size budget.

**Re-bake.** In `art/scripts`, run `node bake-pieces.mjs`, then `node tests/bake.test.mjs`. The bake writes only `piece_*` files and merges only the `piece_*` manifest entries; it is deterministic. `node build.mjs` regenerates `config/blueprint.pieces.json`, including the game depths. To review against full resolution, run `PROOF_DIR=<dir> node build.mjs` and open the proof with `?baked=1`; the skirts follow the contract there.

## Water bake (the water revamp, PR 1)

Spec: `specs/2026-10-23-water-revamp-design.md`. In `art/scripts`, run `node bake-water.mjs` (after `bake-pieces.mjs` if the terrain changed), then `node tests/water.test.mjs` (W1-W16; W9 is in `lookpresets.test.mjs`). It writes `public/models/water_<piece>.map.bin` (main, wetland, highland), `water_noise.bin`, `water_<piece>.glb`, `water.json` and the `water_<piece>` manifest entries; it is deterministic. Encodings, GLSL and `patchWaterLambert()`: `scripts/lib/water-core.mjs`.

Proof switches: `?water=v2|legacy` (v2 = the baked water with the patched Lambert material; default legacy), `?waterdebug=depth|shore|flow|bands` (false colour on the water), `?waterTier=phone|mid`, and the fixed view `?view=pond` (`archipelago.waterViews`). Review with `?baked=1`, so the waterline matches the game's terrain.

**Revision 1 (owner, 2026-10-24; the spec's Revision 1).**
- **The farm pond and stream are art-owned.** The pond is shape A, the Teardrop: 191 points, 9.32 u² (+43%), level 0.06, in `world.config.mjs` → `archipelago.farmWater`. The stream's points and widths are there too. It leaves the pond at pond level and ends at the pinned rim exit (−6.8147, 5.9962; level 0.02, width 0.54). W8a and W8c check the bake against this outline and curve, not the game's blob.
- **One surface.** `water_pond` is the pond polygon plus the stream ribbon, sharing the cap corners; there is no `water_stream` node. One depth and shore field covers the union. The stream keeps the pond palette and blends to the river's over its last 1.0 u, and a 1.5 u flow ramp follows the junction (`water.json` `join`).
- **Falls start on the brink.** Each fall's top row is its channel's last row, on the cliff edge of the baked ground, and the channel stops there. The sheet's first 0.075 u is drawn as the channel's surface (`brink`), then a broken foam lip. `water_fall_skirt` is depth-only: it runs from the fall's top row down the cliff face, inside the rock or within 0.03 u of it, and the game draws it with `colorWrite: false` and no polygon offset. Docked, no farm fall is drawn, and the river's head continues the stream with C1 (`vhead`).
- **Ripples (L11, `WATER_RIPPLE`).**
  - Still water gets rings: the pond moderate, the lake more toward its shore, the tarn sparse, the spring none. Phone draws one layer, mid two.
  - Streams get V wakes, plus streaks on mid.
  - Everything comes from a hash of the cell and the epoch, with CPU-wrapped phases (W16).
  - `water.json` carries each body's `ripples` and the `ripple` constants.
  - `uRipple[4]` is the hook for the game's duck and heron rings (PR 4); nothing writes it yet.
  - Proof: `?ripples=0` turns them off, and `__saveShot(name, { t })` renders the water at time t.
- **Game follow-ups: done** (by the game session, on this branch at 3a305be and 845e0d9):
  - `layout.ts` reads the Teardrop's shore (`POND_SHORE`, 191 points) and `STREAM_LINE` from the blueprint. `POND` is (−1.75, 4.57) r 1.35, the widest circle inside the Teardrop. The ducks ride rings inside the still-drawn legacy pond, and `WATER_BLOCKERS` (4 pond and 10 stream discs) replaces the r 1.75 blocker. The heron and the kingfisher stake were cut with the visitors, so there was nothing to move.
  - `FLOWERBEDS[7]` is at (−1.50, 7.75). The composition copy in `src` is regenerated: MAIN has 387 items.

## Composition data (trees, shrubs, rocks, flowers, grass, paths)

`config/composition.pieces.json` (format `gitaway.composition-pieces/1`) is the approved V21 proof's scatter and paths, item for item, for the game to draw with instancing. The plant models and the path ribbons are in `public/models` with `ready` manifest entries.

- **Format.** `pieces.<id>.{trees, shrubs, rocks, flowers, grass}` are lists of `{ asset, x, z, rotY, scale }` in **piece-local** x/z (world minus the piece's `dockedPosition`). There is no y: sample the piece's height grid (`piece_<id>.height.bin`, see [Baked pieces](#baked-pieces)) or `Island.height(x, z)`. Optional fields are `tint` on trees (a near-white linear RGB multiplier, the per-tree crown variation: ±6 % value with a slight warm / cool shift, each channel in [0.92, 1.08]), `color` on flowers (sRGB hex) and `scaleY` (absolute y scale; no current item has one). `assets.<id>` gives each id's file, provider and `yOffset`, and `counts` gives the list lengths. Totals: 656 trees, 771 shrubs, 154 rocks, 2840 flowers, 4206 grass and 26 paths.
- **Drawing it.** Make one `InstancedMesh` per asset per piece (per mesh primitive for GLBs with child nodes or several materials) with instance matrix `translate(x, height(x, z) + yOffset, z) · rotateY(rotY) · scale(scale)` times the node's matrix relative to the GLB root. Set `setColorAt(i, new Color(color))` for flowers. Only trees cast shadows in the proof.
- **Tint the canopy only.** For trees, instance the bark mesh (the GLB root) and the `Canopy` mesh as separate InstancedMeshes, and call `setColorAt(i, new Color().setRGB(...tint))` on the canopy one only. The bark stays untinted, and so do `tree_fruit`, the bushes and the card shrubs (their items carry no `tint`).
- **Asset ids** (the painterly trees, `art/specs/2026-10-22-painterly-trees-design.md` "Revision 2"; `lib/species.mjs` and `lib/plantkit.mjs` `SHRUBS`):
  - **Trees** (`t.asset`): `tree_pine_a` (fir), `tree_pine_b` (a slender spire on a long bare trunk: the MegaKit's `Pine_1`, painted with the fir's ramp), `tree_round_a` (oak), `tree_round_b` (beech), `tree_spread` (maple), `tree_sapling` and `tree_birch`, plus the autumn accents `tree_oak_autumn`, `tree_beech_autumn` and `tree_birch_autumn`.
  - **Shrubs.** The bushes are `bush_a`, `bush_flowering` and `bush_berry`. The woodland-edge card shrubs are `shrub_low`, `shrub_mound` (bracken) and `shrub_heather`.
  - **Also published.** `tree_fruit` (an apple tree, for the game's fruit-tree slots) is shipped but not placed, and so are `flower_head` and `grass_tuft`.
  - **Rocks.** `rock_a`, `rock_b` and `rock_c` are the Meshy boulders from the models PR (#10); their `yOffset` is −0.04, −0.04 and −0.02.
- **The plant GLBs.** The origin is at the base, y is up and the scale is the proof's.
  - **Trees and bushes** are `art/reskin/<id>.glb`: CC0 MegaKit models repainted by `reskin.mjs`, copied unchanged (`art/reskin/SOURCES.md`). They have painted textures, not vertex colours.
    - A tree is a root node `<id>` holding the bark (`<id>_bark`, JPEG, opaque). Its child node `Canopy` holds the leaves (`<id>_leaves`, PNG, alphaMode MASK).
    - Conifers wrap `Canopy` in `Crown`, because `Nature.tsx` sways `Crown` on pines.
    - A bush is one node with MASK PNG materials.
    - `tree_fruit`'s apples and `bush_berry`'s berries are an extra `<id>_overlay` MASK primitive, in `Canopy` and on the bush respectively.
  - **Far versions** (`art/reskin/<id>_far.glb`, made by `reskin.mjs` from the same build as `<id>.glb`, copied unchanged). They are light copies of the trees, for distant trees and low-power draws.
    - **Where.** `assets.<id>.far` names `<id>_far.glb` for every tree id, `tree_fruit` and the autumn accents included, and each has its own `ready` manifest entry `<id>_far`. Bushes, card shrubs, rocks and the ground cover have none.
    - **Nodes.** The root node is `<id>_far` with mesh `<id>_far` (the bark: the trunk alone, simplified). Its child `Canopy` holds mesh `<id>_far_canopy` (the leaves, plus `tree_fruit`'s 6 apples). Conifers wrap `Canopy` in `Crown`, as the near model does.
    - **Same structure and pivot.** The `Crown` / `Canopy` nodes and the `Canopy` pivot are identical to `<id>.glb`, so the crown sways the same way. Only the root and mesh names differ.
    - **Bind by material name.** The far materials keep the near names (`<id>_bark`, `<id>_leaves`, `<id>_overlay`), with the same alpha mode, cutoff, sides and sampler. The game may bind the near model's materials onto the far meshes by name.
    - **Triangles.** Broadleaf ≤ 1,000; `tree_sapling` and the conifers ≤ 500. `reskin.mjs` refuses to write a far version over its target (`tests/trees.test.mjs` T9a).
    - **Textures** (ruling R20). Each far GLB is self-contained: its images are the near images box-downsampled to 256² (leaves PNG with alpha, bark JPEG at the same quality; the 256² apple atlas unchanged). A far tree drawn with its own materials costs about a quarter of the near's texture memory, and 256² is ample at 35 u and beyond.
    - **The intended switch** (game side). Per piece batch, by camera distance: the far version at ≥ 35 u, with hysteresis so a batch near the threshold does not flicker between the two, and the far version everywhere on phones.
  - **The card shrubs** are `lib/plantkit.mjs` crossed and tilted cards: one MASK material with a PNG map.
  - **Triangles.** Firs about 1,200, broadleaf 1,100–3,500, bushes 600, card shrubs ≤ 36.
  - **Retired.** The flat `plants.mjs` GLBs with their baked crown ramp, canopy-lift gain and live-ramp attributes (`_ATREEH`, `_COLOR_RAW`) are gone, and their test `tests/plants-export.test.mjs` with them. `tests/composition.test.mjs` C7, C8, C13, C14 and C15 check the new set.
- **Excluded.** These are things the game places itself: MAIN's layout.ts trees (including the slot the Meshy hero tree takes), bushes and MainIsland.tsx rocks; the farm props; the orchard repo-tree stand-ins; the sheep; and the Meshy set pieces. Proof-only items are excluded too: contact-shadow blobs, the two porch bushes and the old speckle flowers. The JSON's `excluded` block lists each group with its count.
- **Kept clear.** `world.config` `blueprint.keepClear` lists the game spots added after V21 that the composition leaves bare, in world x, z. A disc keeps composed items off its `r` + `pad` (default 0.15 u). It is applied at the end of `composeBlueprint`, so every other placement keeps its RNG stream, and it never drops the game's own (layout) items. `tests/composition.test.mjs` C17 and C19–C21 pin the discs. The ground zones (`game.BUSHES` and the rest of `game`, `blueprint.pieces.json` `flatZones`, the baked tops) are the frozen v3 snapshot (`look.test.mjs` L0, `bake.test.mjs` B16), so a slot the game moves or adds is mirrored here, not there.
  - **Woodshed** (`woodshed`, r 0.65). Spot B, `byHouse(2.0, -1.2)` = world (−3.434, −4.263): back-right of the farmhouse, beside its log stack (the owner's choice on 2026-10-24; it stood front-left of the porch, `byHouse(-1.3, 2.25)`, before). C17 derives the spot from `HOUSE` and checks the disc is on it.
  - **Second bush** (`bush_1`, r 0.45, the bush slot's radius). The game moved layout.ts `BUSHES[1]` from (−3.5, −4.2), which the woodshed now covers, to (−4.9, −4.4) (game commit 38059d2), then to (−4.76, −4.48), off the big tree's root flare (game commit 511aa4a), between the woodshed and the big tree. `game.BUSHES` keeps the old spot for the frozen ground; the old slot's disc lies 0.26 u inside the woodshed's. C19.
  - **Barnaby's camp and stand** (`camp` r 0.65, `camp_stand` r 0.3). The camp (`barnaby_camp`) is at (−0.85, −0.85), turned π/4. The game moved his stand to 0.75 u out from it, on the bearing −0.61 rad from the camp's +Z: world (−0.719, −0.111), facing the farmhouse. It is mirrored exactly as the game gives it (`gameSince.CAMP_STAND`) and never nudged, because the game's placement keeps thin margins there (0.011 u to the dirt path, 0.041 to the garden blocker). No clover or other cover shows through the bedroll or under his hem; four `clover_patch` stood within 0.8 u of the camp before. C20.
  - **Hero tree's roots** (`hero_tree`, r 1.47, `kinds`: trees, bushes, shrubs, rocks). The tree (`STATIC_TREES[0]`, the Meshy `hero_tree` model at scale 1 on (−6.4, −3.6)) has roots that reach 1.461 u from its origin (the lowest vertices of `hero_tree.glb`, the game's own definition of its roots). No composed volume stands on them; grass and flowers may still grow between them. The game's own flowering bush `BUSHES[6]` at (−6.0, −5.0) stands 1.456 u out, on the flare. It is a game slot, so a keep-clear cannot move it. C21 prints it.
- **Paths.** `pieces.<id>.paths` is `[{ id, width, widths?, leadsTo, needs, pts: [[x, z], ...] }]`, the proof's trunk paths as piece-local centrelines. They are split at the seams the way `composeBlueprint` splits them, so a run ends exactly on the seam. There are 26 runs: main 7, meadow 4, wetland 2, cottage 2, highland 3, orchard 3, grove 2 and islet 3. MAIN's layout.ts dirt and stone paths are not included, because `MainIsland.tsx` draws them.
  - `widths` (optional) gives the width at each point where a run is narrowed. Today only `to_cottage` has it: 0.9 u past the lean-to and well gap, widening to 1.1 u.
  - `leadsTo` is the non-main piece the run runs into at an end, or null if the run meets only MAIN or ends free.
  - `needs` lists every other non-main piece the whole path crosses. Show a run once all of its `needs` are docked. Examples: MAIN's `to_cottage` needs `cottage`; MAIN's `to_wetland` needs `cottage` and `wetland`, because the path crosses the cottage; MAIN's `to_grove` needs `islet` and `grove`.
  - `pathColor` is the palette Path. `pathTone` is what V21 actually draws: `paths.color` with a ±10 % world-space noise.
- **Path ribbons.** `public/models/paths_<id>.glb` is one per piece with paths (`paths.ribbons` in the JSON). Each is piece-local and sits on the **baked** top of `piece_<id>.glb`, so the game adds it to the piece group. Its root node `paths_<id>` holds **one node per run**: node and mesh are both named `path_<runId>`, and the mesh extras carry `{ leadsTo, needs }`. Set a run node visible only once its `needs` are docked, so the `to_cottage` and `to_orchard` stubs stay hidden until those pieces arrive. All runs share one `alphaMode: BLEND` material, with `COLOR_0` RGBA (the V21 tone, with the proof's soft edges as alpha 0 at the outer edge). Give it a `renderOrder` above the terrain, plus a `polygonOffset` if wanted.
  - **Z offset.** Every vertex is 0.035 u above the baked top, the proof's own ribbon lift. On the highland and islet stair ramps, 108 of the 4,529 vertices are raised further, by up to 0.091 u, where the ribbon crosses a riser crest. Every edge midpoint and triangle centroid clears the top by at least 0.0175 u.
  - **Seams.** Where a path crosses from one piece onto the next (13 crossings), the run on each side ends with a row laid along the seam, on the rim the two baked tops share. The two rows are the same 7 points, heights included (within 1e-6 u), so the ribbons meet with no grass sliver and no overlap. Each side is built from the same crossing point, path direction and shared rim (`seamEnds` in `lib/composition.mjs`); rows that would reach past the seam row are dropped, and the seam rows are never raised. `tests/composition.test.mjs` C16 checks every crossing.
  - **Size.** 7,452 triangles and 244 KB in total. `paths_meadow` is the largest at 1,524 triangles and 48 KB.
- **Paths v2 (2026-10-19).** The game session checked the 23 conflicts (its `composition-conflicts.md`). It is moving 14 of its own slots, and three runs changed in `world.config` `blueprint.paths`, the one source both the proof and the export read. Distances below are to the game's **drawn** footprints, which is what C11 tests:
  - **to_cottage** starts at the shortened `STONE_PATHS[1]` end (−5.25, 0.05). It runs north of the well, 0.9 u wide past the lean-to: 0.046 u clear of the well plinth.
  - **to_orchard** leaves the windmill door heading east and turns north after x 2.2: 0.057 u clear of the windmill plinth past the 0.8 u doorstep, and 0.125 u clear of the greenhouse.
  - **to_islet** starts 0.8 u later, 0.39 u clear of the garden's east fence. It now ends 0.3 u short of the lighthouse door, 0.046 u clear of its base.
  - **Composition unchanged.** The scatter still clears the V21 routes (`scatterPaths`), so every RNG stream stays put. Only the scatter the new routes now cover is dropped: 17 flowers and 4 grass tufts on MAIN. Every other item is identical.
- **Slot conflicts.** `conflicts.items` lists 22 overlaps of a ribbon with a slot or zone; overlap = the local half width minus the distance from the centreline to the slot edge, measured against our layout.ts snapshot. Each carries a `resolution`, and none is open:
  - **14: the game moves the slot.** The overlap is still computed at the old spot.
  - **4: keep-clear disc only.** The well, windmill, greenhouse and lighthouse BLOCKERS discs overstate what is drawn; `drawnClear` gives the real clearance.
  - **2: trailhead.** `to_highland` starts at the porch steps.
  - **2: nothing drawn in the alpha.** These are the highland ruins and a slot whose resident the lore cut (lore C4).

  The garden fence conflict is gone.
- **Withheld.** These 12 items are drawn by the proof but break the game's clearance rule. They are listed under `withheld.items` in the same item format; add them back to get the proof's rock-lined lake shore.
  - In the wetland lake: rock_b (9.50, 5.71), rock_c (9.68, 8.32), rock_a (5.25, 9.49) and rock_c (1.89, 3.43).
  - On the outflow: rock_a (5.50, 9.66).
  - On the river: rock_b (4.62, −3.44).
  - In reed_bed_a: rock_a (1.60, 7.24).
  - In reed_bed_b: rock_b (5.74, 3.01), rock_c (5.67, 2.46) and rock_a (5.98, 2.58).
  - On the highland hot spring rim: 2 grass tufts at (5.05, −3.66) and (5.02, −2.86).
- **Re-export.** Run `node export-composition.mjs` in `art/scripts`. It writes only the JSON, the 13 plant GLBs, the 8 path ribbons and their 21 manifest entries. The output is deterministic as long as the baked pieces stay the same; re-export after a re-bake. `tests/composition.test.mjs` checks pieces, assets, outlines, clearance, counts against the proof, determinism, GLB structure and triangles. It also checks that the paths match the proof's ribbons, that each ribbon lies inside its piece on the baked top, and that the two runs meet row for row on every seam a path crosses. `composition-check.mjs --extract / --agree / --sheets` re-reads the live proof's instance matrices, compares them item by item and renders game-style side-by-side sheets with `composition-check.html`.

## Known issues on the game side

1. **Height mismatch.** The game's `makeIsland` `height()` differs from its own rendered mesh by up to about 0.196 u, so props float or sink by that much. The blueprint core is triangle-exact, and `TARGET=gameref node tests/blueprint.test.mjs` shows the red case.
2. **Slots at the rim.** The static tree at (−6.2, −5.6) is outside MAIN's outline, so its flat zone is no longer exported (pieces v2), and the bush at (7.4, 1.8) hugs the rim.
3. **Superseded numbers.** layout.ts `ISLES` positions and the `SkyBridge` are replaced by the docked positions above. Camera framing (`framing.ts`) should fit the docked pieces.
4. **Paths under slots.** Paths v2 reroutes `to_cottage`, `to_orchard` and `to_islet` around the well, windmill, greenhouse and garden fence, and the game moves 14 of its own slots. The remaining overlaps are listed under `conflicts` with their resolutions (see [Composition data](#composition-data-trees-shrubs-rocks-flowers-grass-paths)).

## Seeing it

- **Proof viewer.** The art session runs it locally, and the user has a published copy. URL switches:
  - `?unlocked=main|all|meadow,grove` chooses the unlock state;
  - `?dock=<piece>&t=0..1` previews a piece mid-rise;
  - `?debug=1` shows reserved footprints;
  - `?preset=default_mobile` and the like pick a camera.
- **Review sheets** (before/after renders) are not on main because of their size (74 MB). They are in the art worktree at `/home/me/Projects/gitaway-assets/art/screenshots/` (branch `assets-work`, local only).
- **`scripts/build.mjs` leaves `public/models` alone by default.** It writes its 10 procedural GLBs and their manifest to the git-ignored `art/scripts/.build/models` and copies them into the proof from there. Only `--publish-procedural` writes them into `public/models`; don't use it in a game checkout, because it would replace the exported plant models. It writes the proof into the git-ignored `art/scripts/.build/proof` (or `PROOF_DIR`). The JSON is committed, so reading it needs no build. The node tests (`node tests/<name>.test.mjs` in `art/scripts`, after `npm ci` there) only read.

## Who changes what

- **The art session owns `art/`**, including the piece JSON and the core. The game session owns `src/`.
- **Changing MAIN's numbers.** If MAIN, the slots or the blockers change in layout.ts, message the art session. The pieces are cut around MAIN.
- **Changing piece numbers.** For a different docked position, seam or flat zone, ask the art session rather than editing `art/`, so the JSON, the core and the tests stay in step.
- **What isn't on main yet.** `public/models` on main is unchanged, so the game still uses its own models. Switching to the art models, or to the textured AI-made ones in `art/meshy/`, is a separate step. See `meshy/README.md` for the texture rules, including iOS.
