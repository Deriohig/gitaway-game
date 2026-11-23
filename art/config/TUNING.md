# Gitaway look tuning guide

> **Pointer (2026-10-24).** How to turn the knobs stays here; what the knobs must achieve is [../ART-BIBLE.md](../ART-BIBLE.md), and the tool overview is [../ART-TOOLING.md](../ART-TOOLING.md).

Gitaway's art is driven by **two linked config files** (the single source of truth):
- `art/config/look.config.mjs` — all colours (palette), materials, lighting,
  atmosphere, terrain noise, vegetation, the farm layout, camera and ambient life.
- `art/config/modules.config.mjs` — the **module library + world assembler**: the
  modules (farm landmark, terrain tiers/cliffs, and the grove/meadow/rocky/cultivated
  compositions), their metadata/compatibility, and how the deterministic assembler
  chooses + places them on a cell grid. Colours there are palette TOKENS (names), so
  nothing is duplicated.

Edit values, rebuild once, and the whole world updates (models `.glb` + the scene
`proof/index.html` both read from these files).

## View modes (append to the URL)

- default — the assembled world for `modules.config.mjs` `world.seed`.
- `?seed=N` — re-assemble a different but coherent world (deterministic).
- `?view=gallery` — inspect every module in isolation, in a row.
- `?view=test` — a fixed VALIDATION scene (`modules.config.mjs` `testTiers` +
  `world.testSeed`): a diagonal terrace staircase with 2–3 connected elevation
  levels, several cliff transitions and convex/concave corners around the farm
  clearing. Use it to judge cliff geometry + terrain transitions in isolation.
- `?debug=1` — dev overlay: assembled cell centres coloured by module, tier tags
  (red = cliff cell), the farm-exclusion ring, and a cell table + `maxΔtier` in the
  console.
- `?view=wire` — wireframe overlay of the single terrain mesh; logs face/vertex
  counts, `maxSlope` and `rockFaces` (proves it is ONE watertight mesh).
- Shot helpers: `?cam=az,el,dist` + `?tgt=x,y,z` fix the camera, `?mobile=1` forces
  the portrait framing, `?ui=0` hides the overlays. `window.__saveShot(name,opts)`
  renders one deterministic frame and POSTs the PNG (used for the proof/_shots).

## Terrain structure — ONE watertight heightfield (the 2026-10 rebuild)

The terrain is now ONE continuous watertight heightfield. There are **no separate
cliff meshes** any more — the old curtain system (which produced the floating
brown panels) is gone. All the math lives in `art/scripts/lib/terrain.mjs` (pure,
node-tested) and is inlined into the viewer by `build.mjs` as `window.__GT__`, so
the browser and the regression tests (`art/scripts/tests/terrain.test.mjs`) share
ONE source of truth.

**Tier field.** Each cell gets an elevation TIER, then a solver enforces a HARD
`|Δtier| ≤ maxTierDelta` (=1) between 4-neighbours, so there are no impossible
vertical jumps. The farm centre is pinned to `farmTier` (0).

**Stamps.** Each raised cell stamps a plateau at absolute height `tier*tierStep`
with a FLAT CORE (`stampInner` × cellSize) then an EASED FEATHER, combined by an
order-independent soft-max p-norm (`pNorm`) so same-tier neighbours merge into one
irregular terrace. `outlineWarp` warps the outlines (no concentric rings).
Additive/subtractive extra stamps are supported (`mode:'add'|'sub'`, see
`testStamps` for a demo bump + pond/lower-meadow).

**Feather = cliff vs slope.** A cell's FEATHER WIDTH (world units, `world.feather`)
decides how its drops read, all inside the one heightfield:
- `feather.cliff` (TIGHT, ~1.35) → a steep face → coloured ROCK by per-face slope.
- `feather.slope` (WIDE, ~4.4)   → a gentle grassy slope.
In assembled worlds a raised cell becomes a cliff cell with probability
`cliffChance`; in `?view=test` the cliff cells are pinned by `testCliffCells`.

**Cliffs = steep faces, coloured per FACE.** The terrain is a NON-INDEXED,
flat-shaded mesh. For each triangle the viewer computes the face slope
(`1 - faceNormal.y`) and blends grass/soil/rock via
`look.config terrain.colour.faceBands` (ported from THREE.Terrain's blended
material, MIT): `slopeRock0/1` (rock band), `slopeSoil0/1` + `soilBandW`/
`soilSlopeW` (keep soil subtle so moderate grassy slopes stay GREEN, no orange
checkerboard), `soilH0..3` (mid-height earthy band), `rockDarkBySlope` (steeper
rock darkens toward `rockDarkToken`). Rock tokens (`rockToken` Stone,
`rockDarkToken` DarkStone) are warm weathered stone — keep them warm, NOT
charcoal. Enough grid resolution (`terrain.segments` = 180) resolves the tight
risers cleanly.

**Height sampler.** Props/vegetation/path/contact shadows are placed with
`GT.sampleTerrain` — a triangle-exact barycentric sampler against the SAME grid
the mesh is built from, so nothing floats and nothing sinks. It throws on
NaN/out-of-range input.

**Edge-compatible assembly.** After the tier solve, each cell derives an
edge-profile signature (flat/up/cliff/slope per side) from its own + neighbours'
tiers; modules are chosen per cell with a per-cell sub-seed `hash(seed,i,j)`,
weighted by biome ring + constrained by `tierRange`, biased by the edge profile
(cliff edges favour rocky), with a guaranteed `world.filler` so a cell's domain
can never empty. Vegetation still avoids steep faces via `vegetation.maxVegSlope`.

Key knobs: `tierStep`, `stampInner`, `pNorm`, `outlineWarp`, `feather.cliff/slope`,
`cliffChance`, `maxTierDelta`, `farmTier`, `tierField.contrast`, `tierField.bias`,
`world.farmCalm`, `look.config terrain.segments` + `terrain.colour.faceBands`.
(`world.cliff` / `stampRadius` / `cliffTierDiff` / `cliffFarmClear` are retained
ONLY to reproduce the old curtain behaviour in the RED regression test — not used
by the scene.)

### Countryside rebalance (peaceful-ambient pass)

To keep the world a gentle countryside rather than a dramatic canyon:
- `tierField.bias` (modules.config) shifts the whole tier field DOWN so most cells
  settle at tier 0 (broad meadow); higher = flatter/more open. Pairs with a lower
  `tierField.contrast` (fewer high tiers) for varied-but-calm regions.
- `world.farmCalm { radius, maxTier }` keeps the immediate farm surroundings
  welcoming: cells within `radius` of the origin are capped to `maxTier` and forced
  to gentle SLOPE cells (never rocky cliffs), so nothing tall or rocky crowds the
  house at the default mobile camera.
- Short, steep rock ledges are reserved to a FEW spots via a LOW `cliffChance` plus
  a TIGHT `feather.cliff` (the drop stays crisp/steep → reads as faceted rock),
  while a WIDE `feather.slope` makes every other drop a long grassy slope. A high
  `faceBands.slopeRock0` keeps rock off moderate grassy slopes.
- Grass is coloured PER QUAD in `viewer.mjs` (both triangles of a grid quad share
  one grass base colour from the quad-averaged centroid + slope), so broad meadows
  read as one coherent grass sheet instead of a per-triangle light/dark
  checkerboard. Rock/soil weights + the rock shade stay PER FACE, so intentional
  steep rock keeps its crisp flat-shaded facets and slope strata.

## How to apply a change

```bash
cd art/scripts
node build.mjs
```

That rebuilds the model `.glb` files into `public/models/`, regenerates
`proof/index.html`, and refreshes the `.wasm` copies in `proof/`. Open
`proof/index.html` (served over http) to see the result.

## How to edit safely

- Change **values only** — hex colour strings (`'#B9654B'`), numbers, or the
  items inside the arrays. Keep the quotes, commas and brackets intact.
- **Colours are defined once** in the `palette` block. Everywhere else refers to
  a palette colour by its **name** (a "token"), e.g. `'Terracotta'`. To recolour
  something, either change the hex in `palette`, or point its token somewhere
  else (e.g. `roof: 'Terracotta'` → `roof: 'DarkStone'` for a slate roof).
- Don't add functions or logic — this file is pure data.
- Each value has an inline comment with a sensible range. Staying in range keeps
  things looking natural (pushing past it is allowed, just louder).

## What each section controls

1. **palette** – every named colour (one hex each).
2. **colorGrade** – global tint on the models (saturation / warmth / lightness),
   plus small per-group nudges for greens, flowers, neutrals.
3. **materials** – matte roughness, window-glow strength, glass transparency.
4. **assetMaterials** – which palette colour paints each part of each model
   (roof, walls, trunk, windows, flowers…). Reassign to re-skin a model.
5. **lighting** – sun colour/intensity/angle, ambient + hemisphere fill,
   exposure, and shadow softness.
6. **atmosphere** – sky gradient colours + fog (distance haze).
7. **terrain** – ground size + the **seeded, layered** height field (broad hills +
   medium detail + fine) and how grass/meadow/soil blend by height/slope/noise.
   `terrain.elevation.seed` picks the landscape; the near-flat farm pad is held by
   `flattenInner`/`flattenOuter`. `terrain.groundFlatShading:false` keeps the ground
   smooth/coherent (the chunky low-poly look lives in the assets); `true` facets it.
8. **background** – distant hill bands + clouds.
9. **vegetation** – the plant **distribution system**: `vegetation.seed` picks the
   layout; grove `clusters` + per-type Poisson `minSep` spacing + suitability place
   trees/understory/grass/wildflowers (reusing the existing geometry).
10. **composition** – where each hand-placed model sits (the little-farm layout) + the path.
11. **camera** – default framing (you can still orbit/zoom in the viewer). Portrait
    phones use their own `fovMobile`/`elevationDegMobile`/`distanceMobile`/`targetMobile`
    so the farm fills more of a narrow screen.
12. **ambient** – subtle idle motion (grass sway, clouds, chimney smoke).

**Seeds & worlds:** change `terrain.elevation.seed` for a different landscape, or
`vegetation.seed` for a different plant layout — same seed always rebuilds the same
world. **Dev overlay:** open the viewer with `?debug=1` to see grove centres + the
farm-exclusion ring.

## Three worked examples

### 1. Warmer "golden evening"
- `colorGrade.global.warmth`: `0.0` → `0.12` (pull every model hue toward gold)
- `palette.Sun`: `'#FFD58A'` → `'#FFC06A'` (deeper golden sun + horizon)
- `lighting.sun.elevationDeg`: `44.4` → `26` (low sun = long warm shadows)
- `lighting.exposure`: `1.08` → `1.0` (a touch moodier)
- `palette.Haze`: `'#EAD9B2'` → `'#F0C98C'` (warm evening haze)

### 2. More vibrant greens
- `colorGrade.groups.greens.saturation`: `0.0` → `0.08` (richer leaves/grass on models)
- `palette.Grass`: `'#86AD5E'` → `'#84B458'` and `palette.MeadowLight` a touch brighter
  (brighter ground + garden)
- `palette.FreshFoliage`: `'#B5D96B'` → `'#BFE072'` (punchier sun-lit tops)
- keep it gentle — large jumps look cartoonish.

### 3. Denser foliage / lusher
- `vegetation.groundCover.grass.maxCount`: `300` → `420`
- `vegetation.groundCover.wildflower.maxCount`: `130` → `180`
- `vegetation.trees.maxCount`: `64` → `90`, or `vegetation.clusters.count`: `7` → `9` (more groves)
- `vegetation.trees.broad.scaleMin`: `0.6` → `0.75` (bigger background trees)

After any edit: `cd art/scripts && node build.mjs`, then reload the viewer.


## STAGE 1 ISLAND (self-contained countryside diorama in mist) + comparison harness

The assembled world is now a self-contained irregular **ISLAND**, driven by a NEW
central config `art/config/world.config.mjs` (the single source of truth for world
layout). The legacy 5×5 cell world and the `?view=test` validation scene
(`modules.config.mjs`) are **left untouched**, so the fixed regression tests stay
green; the island is a separate **"world3 mode"** in `lib/terrain.mjs`, active only
in the assembled world view (not in `?view=test`/`?view=gallery`).

### world.config.mjs
- `island` — the footprint: `grid` (11) × `cellSize` (20) jittered cell grid
  (centre = farm), `planeSize`/`planeSegments` (the ONE heightfield mesh),
  `coreR`/`rimR`/`warpAmp`/`warpFreq*` (the domain-warped irregular coastline),
  `mistFloor` (the sunken basin beyond the rim), `rimLip`.
- `regionMap` — an EXPLICIT 11×11 letter grid: A farm, B clearing, C meadow,
  D rocky-ledge\*, E lake\*, F upper-plateau\*, H world-edge/rim. (\* = reserved for
  later stages; rendered gentle grassy now.)
- `regions` — per region: `tier`, `roll`, `drama` (stage-2 hook) and `modules`
  (the weighted composition palette the assembler picks from).
- `elevation` — `tierStep`, `maxTier`, `rollChance`/`rollField` (coherent gentle
  rises), `feather` (stage 1 = slope-only), `cliffChance` (0 now — no rock cliffs).
- `clearing`/`meadow` — the broad flat welcoming clearing + the confined meadow roll.
- `mist`/`fog`/`hills` — the atmospheric band the rim descends into.
- `cameras` — the 6 PERMANENT comparison presets by name (each {az,el,dist,tgt,
  mobile?,fov?,w,h}). `seeds` — the 2 locked island seeds.

### Island terrain (lib/terrain.mjs, world3 mode)
`buildIslandCells` reads each cell's region letter → `tier` (+ a coherent `roll`),
caps the farm ring, then enforces `|Δtier|≤1` by a **RAISE-skirt** (lifts the lower
neighbour, preserving the F plateau as a broad gentle rise). `assembleIslandModules`
picks a tier-valid module from the region palette. `terrainHeight` adds the ISLAND
MASK: a domain-warped coastline — land is full inside `coreR`, rolls gently DOWN
into the mist across `coreR..rimR`, and a flat mist basin beyond — all ONE
continuous watertight heightfield (no cutoff, no exposed edge/underside). The
viewer veils the sunken basin with a layered translucent **mist sheet** + a
**height-based submerge-fade** (rim grass fades to Haze as it descends), pushes the
background hills out faint, strengthens fog gently, and keeps vegetation off the
basin (an `onLand` height guard).

### Comparison-render harness (shots.mjs + ?capture)
`node art/scripts/shots.mjs` starts a tiny HTTP server (Node built-ins, no deps)
that serves the proof viewer and accepts `POST /shot/<name>` →
`proof/_shots/<name>.png`. Open `/index.html?capture=<prefix>&seed=<N>&ui=0` in a
browser: the viewer's capture driver walks all 6 `world.config.cameras` presets via
`__saveShot` and POSTs each PNG (`_seed<N>` suffix for the non-default seed). Capture
`baseline_*` BEFORE a change and `after_*` after; re-runnable every stage.

### Reserved for later stages (hooks exist, NOT built now)
- **Stage 2 DRAMA:** rocky-ledge cliffs (region D), the tall upper-plateau landmark
  (F), grassy-plateau drama, and the PATH network (`world.config.paths`, a stub —
  porch anchor + destination region anchors). Flip `elevation.cliffChance` and raise
  region tiers to introduce the selected drama.
- **Stage 3 WATER:** lake (region E), river/waterfall, bridges, docks, ruins.


## PASS A (2026-10-18): game parity, verification toolkit, hero-view + meadow fixes

The art contract is `art/config/STYLE.md`; the structure spec is
`art/config/world-layout.spec.md`. Judge every change against those, under parity.

### Game parity (the proof renders like the actual game)
Mirrors the game's renderer (read-only refs in the game repo: `src/world/World.tsx`,
`framing.ts`, `DayCycle.tsx`):
- **No tone mapping** (`look.config lighting.toneMapping: 'None'` = R3F `<Canvas flat>`),
  colour management on, sRGB output; palette/vertex colours go through `THREE.Color`
  (linear) and are encoded once. The sky-dome shader now encodes too (it used to write
  linear values -> dark olive horizon).
- **Camera** (`world.config render`): fov 30, near 0.5, far 600. GAMEPLAY mode = the game's
  OrbitControls clamp (no pan, distance 14-140, polar 0.62-1.22, azimuth PI/4 +/- 0.85),
  framed like CameraRig (`render.gameplay.frame`, `dist: 'rig'`). PHOTO mode = free orbit +
  wide zoom. Presets carry `mode: 'gameplay' | 'photo'`; gameplay presets are checked
  against the clamp by the viewer (`window.__clampViolations`) and by `tests_stage2.mjs`.
- **Fog** is camera-relative: near = camDist + `fog.nearOffset` (40), far = camDist +
  `fog.farOffset` (230), camDist = camera->target distance, every frame. In photo mode the
  far plane extends past full haze. The rim mist (mist sheet + submerge fade) is
  height-based and fades out radially (`mist.radiusFull/Fade/Outer`), below the mist sheet
  the land fades per-fragment to the exact mist colour and fully submerged basin faces are
  unlit mist, so from the ~400u photo views the island floats in seamless haze. The
  background hill bands only show from inside their ring (they are a horizon backdrop).
- Viewer URL extras: `?preset=<name>` loads a preset live, `?photo=1` free orbit,
  `?tone=ACESFilmic` A/B, `?diag=albedo` (unlit vertex colours) / `?diag=shade` (lit grey)
  to separate colour from lighting, `?only=a,b` limits a capture run.

### Verification toolkit (no dependencies; PNG decode/encode via node zlib in `lib/png.mjs`)
Run from `art/scripts` (shots land in `<proof>/_shots`; the proof folder is the git-ignored
`art/scripts/.build/proof` unless `PROOF_DIR=<dir>` or `GITAWAY_PROOF=<dir>` is set, see `lib/paths.mjs`):
```bash
node build.mjs                                   # rebuild proof viewer
node capture.mjs passA                           # every preset, both seeds -> passA_<preset>(_seed42).png
                                                 #   + placements(_seed42).json (tree/rock positions)
node capture.mjs probe --seeds default --only wide_island --extra diag=albedo   # targeted / diagnostic run
node metrics.mjs --dir <shots> --prefix passA_ [--json out.json]               # metrics table (+ JSON)
node metrics.mjs ../reference/concept/*.png                                    # concept targets
node contact-sheet.mjs --prefix passA --before parity   # contact_<preset>.png + metrics.md + metrics.json
node clumping.mjs <shots>/placements.json               # STYLE C4 clumping index
node concept-crops.mjs [uploadDir]                      # re-cut art/reference/concept/<preset>.png
```
- `capture.mjs` drives headless Chromium (an existing Playwright install, `lib/playwright.mjs`:
  `$PLAYWRIGHT_ROOT`, the repo root's node_modules, or the main checkout) against `shots.mjs`
  (started automatically if not running).
- `metrics.mjs`: mean HSV saturation (all + terrain-only = non-sky), mean luma, luma SD
  (contrast), darkest luma + 0.1th percentile (STYLE P1 >= 0.08), and hue-band shares:
  grass 70-110deg, yellowGreen 45-70, foliage 110-165, path 20-45 (mid sat), rock (warm
  low sat), cool (sky/haze/water), other.
- `contact-sheet.mjs`: one PNG per preset = [before | render | concept crop], equal height,
  labelled, with key metrics under each panel; `metrics.md` = per-preset tables (concept,
  before, render, seed-42 render, deltas) + the clumping index.
- Concept crops (`art/reference/concept/`, rects in `crops.json`) are cut from the three
  blueprint sheets; they include water, labels and painted detail the proof does not have,
  so band shares are a direction, not an exact target.

### Paths (porch path only, Pass-A scope)
`world.config paths` + `terrain.mjs buildPathNetwork`: the porch path leaves through the
fixed `leadOut` gap between the farm props and runs to the clearing edge (`main.at`),
routed on the heightfield (grade penalised, corridors steeper than `routing.maxGrade` and
the mist rim impassable, seeded `wiggle` for a natural curve), re-splined (centripetal
Catmull-Rom), tapered (`width` -> `width*taper`), drawn as a soft-alpha ribbon (`soft`)
with a soft end. Nothing is baked into the terrain. `branches` stays empty until the
main-island/isles redesign (the router supports branches joining the network beyond
`routing.junctionMinR`, `routing.junctionSep` apart).

### Terrain colour (`terrain.mjs terrainColours`, used by the viewer + tests)
Ground colour is per VERTEX from smooth fields (no per-quad colour steps -> coherent
meadow sheets, STYLE T8); rock + cliff-foot soil stay per FACE (crisp strata).
`world.config colour.soilBandScale` scales the legacy absolute-height earthy band
(`faceBands.soilH0..3`), which painted the island's ordinary rolling meadows tan; 0 =
off in island mode. Tests: `tests_stage2.mjs` (incl. `TARGET=legacy` red evidence).


## SPEC v3.1 (2026-10-18): ONE BLUEPRINT ISLAND BUILT FROM DOCKING PIECES

Anchor: `art/config/world-layout.spec.md` (v3.1). The default proof world is now the joined blueprint island
(~55 u across) cut into MAIN (the game's farm island, every layout.ts coordinate unchanged) + 7 unlock pieces that
rise from the cloud sea and dock against MAIN (petal layout: every piece touches MAIN, so any unlock subset is
coherent). Everything above this section is the LEGACY single-island mode (`?world=legacy`, legacy tests).

### Where things live
- `world.config.mjs archipelago` - ALL data: `source` (feat/idle-loop @ 01449a29 + lane commits), `game` (layout.ts
  verbatim), `terrainTs` / `waterTs` / `mainIslandTsx` / `lanes`, `pendingLaneEdits` (one-line switch, default
  false; moot under v3.1), `mainZones` (flat-zone radii), `blueprint` (coast, rings, tiers, underside, MAIN cone,
  seam walls, pieces, features, mounds, roll, water, paths, zones, coast anchors), `composition`, `cameras`,
  `views` (the 7 LOOK-BRIEF comparison views), `seeds`, `sea` (cloud-sea layout only). Every LOOK value (lights,
  sky, fog, shadows, tone mapping, cloud / water colours, wind) lives in `art/config/lookPresets.json` (see the
  LOOK-BRIEF section below; the skyPalette.ts day-cycle table moved there too).
- `lib/terrain.mjs` (three-free, node-tested, inlined as window.__GT__): `buildIsland` (own-spec island: game
  outline bit-identical, polar top, makeIsland cliff cone), `buildBlueprint` (parent H/U + MAIN + cut pieces),
  `blueprintTiers`, `blueprintWater`, `composeBlueprint`, `farmOcclusion`, `exportBlueprint`, `ownIslandContract`.
- `lib/islandAdapter.mjs` (THREE passed in): `buildIslandGeometry`, `islandContract`, `pieceGroup`.
- `lib/arch-scene.js` - the proof scene (inlined by build.mjs). `config/blueprint.pieces.json` - the spec section 10
  export for the game (written by `node build.mjs`; a test fails if it is stale).

### How a piece is built (why seams are seamless)
- Parent: coast `Rc(theta)` (Gaussian-weighted targets + harmonics + the islet promontory), heightfield
  `H = flatten(H0) then carve` where `H0 = tierStep * phi + mounds + roll + coast lip`; `phi` = tier features
  (`sector` plateau with terraced ledges and fixed-width flanks, `disc` knolls/basins). Underside `U` = depth by
  distance to the coast (makeIsland's cliff-ring profile `rf -> dc/reach`) + crags.
- Every vertex two pieces share comes from ONE keyed store: MAIN's rim (`r:j`, uniform theta, game outline), seam
  points (`s:i:k`, one per shared ring, seams start ON a MAIN rim vertex), seam-wall columns (rugged rows shared by
  both neighbours), MAIN's cone (`c:L:j`, wobble capped so radii stay monotone). Gentle normals at shared vertices
  use the analytic gradient of H, so shading matches across a seam.
- Each piece is closed alone: MAIN = top + cone + tip (looks like the game's island when nothing is docked);
  petal = top + outer-coast curtain + 2 seam curtains + the wall under MAIN's skirt + inner wall (MAIN's cone slice,
  reversed) + underside. Docked, walls are back-to-back (tested face for face).
- Flat zones: inside `r + margin` the ground IS the zone level (cores first), so feathers never tilt a pad.

### Knobs (edit values, `node build.mjs`, reload)
`blueprint.coast.targets` (size/shape; keep the joined island <= ~60 u), `pieces[].from/sway/pivot/core/step`
(seams + pivots; a pivot must see its whole outline: the star-shaped test), `tierStep` + `features` (drama; ledge
treads must stay >= `latticeCell` or the |dTier| test fails), `underside` (depth/reach/crag; `seamTaper` fade/gap: how far in from the
coast a lone petal's underside starts falling toward its seams, and the gap it keeps under MAIN's cone), `seamWall`
(rowStep/amp/lipRow), `zones.<piece>` (reserved spots: flat unless `flat: false`), `water` (levels, river via
points, outflow theta), `paths`, `composition` (clumps, counts, sight corridor), `sea` (cloud field/deck layout).
Lighting / atmosphere knobs: `art/config/lookPresets.json` (LOOK-BRIEF section below).

### Viewer URL (proof/index.html)
`?unlocked=main|all|a,b` (start / joined / subsets), `?dock=<piece>&t=0..1` (rise preview), `?look=<preset>`
(lookPresets.json; default `Game (current)`), `?hour=H` (Game (current) under the skyPalette.ts / DayCycle.tsx day
cycle at hour H), `?light=proof` (= `?look=Proof warm (v4)`), `?view=<name>` (the 7 fixed views), `?debug=1`
(reserved footprints for every missing asset + piece outlines + pivots), `?water=0` (hide the PLACEHOLDER water -
the game draws all water), `?preset=<name>`, `?seed=42`, `?world=legacy`.

### Toolkit (from art/scripts)
```bash
node build.mjs                                            # proof + config/blueprint.pieces.json
node tests/blueprint.test.mjs                             # spec v3.1 invariants (22)
TARGET=gameref node tests/blueprint.test.mjs              # RED evidence: game makeIsland height() != its mesh
node tests/terrain.test.mjs && node tests_stage2.mjs      # legacy single-island regression (kept green)
node capture.mjs v3                                       # every archipelago preset, seeds 11 + 42 (proof light)
node capture.mjs v3main --seeds default --unlocked main   # start state
node capture.mjs v3game13 --seeds default --light game --hour 13 --only default_mobile,max_zoom_all
node contact-sheet.mjs --prefix v3                        # contact_<preset>.png + metrics.md (+ per-piece clumping)
node contact-sheet.mjs --compare v3,v3game13,v3game17 --tag lighting   # proof vs game light, side by side
node concept-crops.mjs                                    # re-cut art/reference/concept/<preset>.png
node capture.mjs old --legacy                             # the legacy single-island presets
node topmap.mjs --out /tmp/topmap.png                     # top-down design map (hillshade, water, trees, paths, zones, 5 u grid)
```

## LOOK-BRIEF (2026-10-18): lighting, colour & atmosphere — Phase 0 infrastructure

Brief: `art/config/LOOK-BRIEF.md` (verbatim user brief + the lead's notes). Phase 0 = audit + baseline + the
infrastructure below, NO visual change (beyond the three r160 -> r186 upgrade itself). Audit, rainbow-noise notes and
the r160 -> r186 comparison: `art/screenshots/baseline/AUDIT.md`. Phase 1 starts from the `baseline` captures.

### Where the look lives
- `art/config/lookPresets.json` — EVERY look value of the blueprint-island proof, one object per named preset, in
  sections `renderer` (tone mapping, exposure, output space, max pixel ratio), `sun` (colour, intensity, elevationDeg,
  azimuthDeg RELATIVE TO THE `full` VIEW, distance, castShadow), `hemisphere`, `ambient`, `shadows` (type, mapSize,
  bias, normalBias, radius, fit fixed|bounds, frustum, fitMargin, near, farPad, contact blobs), `sky` (zenith,
  horizon, sunSideHorizon, below, stops, ...), `fog` (type, colour, anchor, offsets, density, height haze), `grass`,
  `canopy`, `stone`, `clouds`, `post` (AO, bloom, grade, vignette, DOF, cloud shadows), `water`, `wind` (+ life).
  `default` names the preset the page starts with; `dayCycle` = the game's skyPalette.ts table (the source of
  `Game (current)` and of `?hour=H`); `conventions` documents the angle / stop units.
- `art/config/lookPresets.schema.json` — type, range, step, phase, `wired` (consumed by the scene yet?) and `live`
  for every parameter. The panel is generated from it; `tests/lookpresets.test.mjs` validates every active preset.
- Presets: `Game (current)` (= the 87c830a render = the game today: DayCycle light @ 13 h, NoToneMapping, CSS sky,
  camera-anchored linear fog, Backdrop clouds; instant revert), `Proof warm (v4)` (the old `?light=proof`), and the
  Phase-1 stubs `Golden afternoon` / `Soft morning` / `Dusk` (status `stub`, not selectable until Phase 1 fills them).
- Palette tokens and terrain / asset colours stay in `look.config.mjs`; do NOT add look parameters there (its
  `lighting` / `atmosphere` / `ambient` sections are legacy-viewer only). Layout (sea geometry, views) stays in
  `world.config.mjs`.
- To add a parameter: schema entry (with phase / wired) + a value in every active preset + wire it in
  `lib/arch-scene.js applyLook()` (everything look-related goes through applyLook, so the panel updates it live).

### The 7 fixed comparison views (`world.config.mjs archipelago.views`; `?view=<name>`)
| view | camera (az / el / dist / target) | subject |
|---|---|---|
| `full` | 32 / 38 / 74 / (-1.2, -1.6, -1.2) | the whole joined island, three-quarter (= island_wide); also the sun-azimuth reference |
| `farm` | 40 / 30 / 17 / (-0.6, 0.3, 0.2) | farmhouse + fenced garden plots + pond, close |
| `lake` | 100 / 44 / 21 / (-7.0, -0.3, 17.8) | the wetland lake, its treed islet, river in / outflow out |
| `waterfall` | 20 / 23 / 34 / (-5.2, -4.0, 19.5) | lake outflow, the waterfall off the outer cliff, the island edge |
| `junction` | 60 / 44 / 15 / (-6.6, 0.0, 0.6) | the 3-way path junction west of the farmhouse (porch / cottage / wetland) |
| `woodland` | 75 / 14 / 12 / (-9.5, 0.2, 5.5) | the wetland forest edge seen low across MAIN's grass, tufts, flowers, stream |
| `edge` | 130 / 5 / 60 / (10, -10, -8) | the island underside against the sky + cloud sea |
All photo mode, everything unlocked, seed 11, 1600x900, fov 30.

### Capture + contact sheets (from art/scripts)
```bash
node look-capture.mjs <phase> [--masks] [--look "<preset>"] [--views full,farm] [--extra "k=v"]
#   -> art/screenshots/<phase>/raw/<view>.png (+ _mask.png, capture.json); raw/ is git-ignored. Deterministic
#      (animation clock frozen; a re-capture is bit-identical). Canvas only: no UI / panel / stats in the image.
node look-sheet.mjs <before> <after> [--out <phase>]
#   -> art/screenshots/<out = after>/sheet_<view>.png (BEFORE | AFTER, labelled, metrics footer), sheet_all.png,
#      sheets.md / sheets.json (metrics.mjs before/after + pixel diff, per mask class). Sheets <= 1.45 MB (committed).
node look-capture.mjs phase1 --masks --look "Golden afternoon" && node look-sheet.mjs baseline phase1
node build.mjs --three 0.160.0                            # A/B proof on another three release (default: 0.186.1)
node tests/lookpresets.test.mjs                           # schema, Game (current) parity, no literals, views, three pin
```
`art/screenshots/baseline/` = THE baseline (r186, `Game (current)`); `baseline_r160/` = the same views on r160
(raw only, for the upgrade check).

### The panel (proof page, top-right "Look (lookPresets.json)", collapsed)
lil-gui 0.20.0 (cdn.jsdelivr.net/npm, pinned in the importmap). Preset dropdown (active presets), every parameter
in one folder per section (hover a control for its help; later-phase parameters are listed disabled with `(P#)`),
live without a reload: lights, sun direction, shadows (type / map size / bias / radius / box), sky colours + stops,
fog (type / colour / range), tone mapping, exposure, output space, pixel ratio, clouds, water colours, grass sway.
The folder **Save & share** holds `save as` (the name), `Save preset (download + copy)` (downloads `<name>.look.json`
AND copies the same JSON to the clipboard; paste its `preset` into lookPresets.json `presets`), `Load preset (file)...`
(takes a saved .look.json, a raw preset or a whole lookPresets.json; merged onto the default, schema-checked; notes in
the console) and `Revert edits`. Hidden with `?ui=0`, never created with `?shot=1` / `?capture=` (captures).

**As a claude.ai artifact** the plain download link and the clipboard are blocked, so the same folder also uses the
artifact runtime (`window.claude.use('db' | 'downloads')`; publish with `capabilities: { db: {}, downloads: true }`).
The panel renders at once; these light up when the capability answers and stay hidden on a local page or when signed
out (the local Save / Load / Revert are then exactly as above):
- `Save to page` writes `looks/<slug of the name>` = `{ name, savedAt, preset }` (the full preset, lookPresets.json shape;
  slug = lowercase, every char outside `[a-z0-9_.-]` -> `-`, <= 80 chars). The name defaults to `<preset> (tuned)`.
  One write at a time, only on a click, never on load; status line `Saved to page ✓` or the error.
- `saved looks` (+ `Refresh saved looks`, fetched when the panel opens: `orderBy savedAt desc, limit 50`): choosing one
  validates it against `lookPresets.schema.json` (strictly: every section and parameter, no extra keys) and applies it;
  an invalid one is refused with the first problem in the status line. `Delete saved look` asks first (click twice).
- `Download JSON` (replaces the local Save label when downloads is available) = `dl.save({ filename: <slug>.look.json,
  data })` with the same `gitaway-look-preset` file; `Load preset (file)...` takes it back. A viewer who declines is not an
  error (`download cancelled`).
Logic: `art/scripts/lib/look-save.mjs` (pure; inlined as `window.__LOOK_SAVE__`); tests: `tests/panelsave.test.mjs`
(node, fakes) and `tests/panelsave.browser.mjs` (headless Chromium, real lil-gui, fake `window.claude`).

### Frame time + device diagnostics
- `?stats=1`: overlay (fps, frame ms median / p95, render() cpu ms, GPU ms via EXT_disjoint_timer_query_webgl2 when
  available, draw calls, triangles, pixel ratio). `await window.__frameStats(n)` -> `{ medianMs, p95Ms, meanMs, fps,
  cpuMedianMs, gpuMedianMs, drawCalls, triangles, pixelRatio, drawingBuffer, three, look }` over the next n frames.
  Measure on a real GPU with the pane visible (a hidden pane / headless SwiftShader throttles or emulates: not perf).
- `?diag=gl`: this device's GL facts (renderer, colour / depth bits, MSAA samples, GL_DITHER, fragment precision,
  context attributes, drawing buffer, DPR) + `window.__glFacts()`. Device A/B switches (default off, no visual
  change): `?nodither=1` (disable GL_DITHER), `?precision=mediump|highp`, `?aa=0`, `?pdb=0`
  (preserveDrawingBuffer off), `?pr=<max pixel ratio>`. See AUDIT.md "rainbow noise".

## LOOK-BRIEF Phase 1 (2026-10-18): colour pipeline, sun, fill, shadows, sky, moods

Default preset: **`Golden afternoon`** (`?look=` selects any active preset; `Game (current)` and `Proof warm (v4)` are kept
for instant revert). Captures: `art/screenshots/phase1/` (7 views, Golden afternoon, sheets vs `baseline`),
`phase1_moods/` (full view: the three moods + Game (current)), `phase1_tonemap/` (AgX | Neutral), `phase1_gameplay/`
(default_desktop / default_mobile).

- **iOS rainbow speckle (step 1)**: the cloud deck and the contact blobs are texture-free (deck = vertex alpha on a ring
  disc; blobs = analytic radial alpha from the quad uv). No textures remain in the proof scene. Details: AUDIT.md §2.
- **Material model (step 2)**: Lambert everywhere opaque (terrain, paths, pines, stairs, flowers, distant isles), GLBs
  converted on load by `toLambert()` (names / colours / emissive / flags kept; `Glass` may stay Standard). = the game.
- **Colour pipeline**: `outputColorSpace` sRGB, no post-processing, tone mapping applied once by the renderer
  (`renderer.toneMapping`, Neutral in the moods: it keeps the greens rich; AgX greys them at exposure ~1, see
  `phase1_tonemap/`). The sky dome and three's fog colour are display-referred (applied after tone mapping), so they meet.
  The placeholder water shaders are not tone mapped (unchanged until Phase 4).
- **Sun / fill**: one `DirectionalLight` (`sun.*`: colour, intensity, `elevationDeg`, `azimuthDeg` relative to the `full`
  view), a `HemisphereLight` (`hemisphere.*`) and `ambient.intensity 0`. The sun sits at target + direction x distance.
- **Shadows**: `shadows.fit 'tight'` = the shadow camera is fitted in light space to the world boxes of every visible
  mesh on the visible pieces (terrain + underside, trees, props, rocks, paths) + `fitMargin`, re-fitted on unlock / dock /
  look changes; `mapSize` 2048 (4096 optional), PCF with a small `radius`, `bias` / `normalBias` per mood.
- **Sky**: `sky.mode 'dome'` = a world-space gradient dome around the camera (inverted unit sphere, rotation only, far
  plane, drawn first): zenith / horizon (away from the sun) / `sunSideHorizon` (within `sunSideSpreadDeg` of the sun's
  azimuth, fading over `dome.sunWarmthElevDeg`) / `below` haze (reached `dome.belowDepthDeg` under the horizon), curve
  `dome.zenithElevDeg` + `dome.exponent`, `sky.dither` = ±0.5 / 255 monochrome hash dither. `sky.mode 'screen'` = the
  old screen-space gradient (Game (current)).
- **Fog**: `fog.skyMatch 'view'` = the fog colour is the dome's horizon colour along the camera's view azimuth (updated as
  the camera moves; the cloud-deck colour follows), `'horizon'` = `sky.horizon`, `'none'` = `fog.color`.
- **Moods = day-cycle keyframes**: `hour` on each preset (Soft morning 8.5, Golden afternoon 16.5, Dusk 19.5); the three
  share one parameter set (`tests/phase1.test.mjs` S3c), so the game can blend neighbouring keyframes.
- Tests: `node tests/phase1.test.mjs` (presets, source checks, STYLE P1 on the captures) and
  `node tests/phase1.browser.mjs` (runtime: textures, materials, lights, shadow-fit containment, dome + dither, fog match).
- Sheets: `node look-grid.mjs --out <phase>/<name>.png --views full,farm "<LABEL>=<dir>" ...` builds labelled N-up sheets
  (moods, tone mappers) from `look-capture.mjs --out` folders.

## LOOK-BRIEF Phase 2 (2026-10-18): materials — grass, trees, cliffs + underside, clouds

Direction: LOOK-BRIEF Phase 2, retuned toward the Worldseed reference (`art/config/WORLDSEED-BRIEF.md`, which absorbs the
LOOK brief): moderate saturation (contrast from hue and light, not saturation), coloured darks, warm red-brown taupe stone.
Captures: `art/screenshots/phase2/` (7 views, Golden afternoon, sheets vs `phase1`), `phase2_moods/` (full view per mood,
Phase 1 | Phase 2), `phase2_gameplay/` (default_mobile / default_desktop, Phase 1 | Phase 2 incl. the sky screen tint),
`phase2_game/` (Game (current) on 4956921 vs now: pixel-identical).

- **Grass** (`grass.*`, albedo): painted per VERTEX by the three-free core, `GT.paintBlueprint(bp, comp, preset, L)`
  (`lib/terrain.mjs`), into a copy of each island mesh's colour attribute (the core's base colours stay the reference).
  Three greens `cool` -> `mid` -> `warm` blended by a domain-warped fBm (`patchSize` u, `contrast`, `balance`); toward
  `lush` within `waterRadius` of the exported water shapes (`waterLush`); toward `dry` with height (`highFrom` ->
  `highTo`, `highDry`); darker bands at riser feet (`cliffBaseAO` / `cliffReach`, from a top-surface height grid) and
  under woods (`forestEdgeAO` / `forestReach`, from the tree positions). World position only -> neighbouring triangles agree
  (no per-triangle noise). The soil / rock blends of the base stay per face. Repaint: ~0.6 s (first ~0.8 s, fields cached),
  immediate on preset selection, debounced (150 ms) while dragging panel sliders. Flat-shading banding on open meadow was
  not a problem (normals are already smooth on gentle grass), so there is no facet-softening parameter.
- **Stone** (`stone.*`): warm red-brown taupe ramp `face` / `dark` (strata at half strength) / `top`; lighter toward a
  riser's top and under a wall's lip (`topLight`), darker toward feet / the wall base (`baseDark`), per-face `facet`
  variation; the underside shades `under` -> `deep` over `underFrom` -> `underTo` u below the top and takes
  `undersideHaze` of `hazeColor` (vertex colours, core). Shader side (island material): `fade` = a height fade toward
  `sky.below` (`matchSkyBelow`) or `hazeColor` after lighting + fog, display-referred like the dome (`strength`, world y
  `top` -> `bottom`), so the underside reads as warm rock that melts into the haze; `bounce` = warm hemisphere-ground light
  on steep faces (steepness^2) so shadowed stone is not cool grey (kept low: the violet shade tint is a later cel stage).
- **Canopies** (`canopy.*`, shader on the trees' own Lambert materials; GLBs untouched): per-vertex `aTreeH` (height within
  the tree, from the model's canopy parts) drives a `gradient` of multipliers (#808080 = no change; darker + cooler `bottom`,
  lighter + warmer `top`); `instanceTint` = deterministic per-tree hue / value jitter via `instanceColor` (seeded by the
  tree position + `seed`); `saturation` pulls the canopy albedo toward its luma; `shadowLift` (+ `coniferLift` on pines) adds
  the neutral mean hemisphere fill, more on facets turned to the sun = leaf translucency (shadowed foliage stays green with
  facet detail, never black / teal); `coniferTint` multiplies the pine albedo; `backlight` (warm glow with the sun behind)
  exists but is off (it did not clearly help). Lift values are per mood (the hemisphere differs).
- **Clouds** (`clouds.lit`, `clouds.layout`; minimal: the next stage replaces puffs + deck with a painted cloud sea):
  `lit` = cream top / lavender underside multipliers by puff height, wrapped sun light, silhouette fade to the fog colour;
  `layout` = keep a deterministic share of the clusters, clear a disc under the island and the camera-side sector
  (`clearAzDeg` +/- `clearArcDeg` out to `clearDist`, soft over `fade`), evaluated in world space after the sea's spin.
- **Sky** (`sky.screenTint`): gameplay-camera views blend a screen-space vertical tint toward `sky.zenith` into the dome
  (and thin the cloud deck there), so the top of the screen is the zenith blue; photo views keep the true dome
  (`gameplayOnly`).
- `Game (current)` / `Proof warm (v4)`: every Phase-2 switch off / neutral. Since the painterly trees (2026-10-23) `Game (current)`
  is no longer pixel-identical to before: its old sets load the painterly `tree_round_a`, `bush_a` and `bush_flowering` files, as
  `public/models` now holds them.
- Tests: `node tests/phase2.test.mjs` (core paint G1-G6 / S1-S3 on the vertex colours, R1-R5 on the captures; `--shots
  phase1` = the red run) and `node tests/phase2.browser.mjs` (runtime: canopy attribute / shader / uniforms + tints,
  painted-crown luminance probe (crowns never black; `--break black|darkmap|flip` = the red run), cloud count + foreground, sky tint, Game (current) neutral; `--page` = an older build).

## WORLDSEED look core (2026-10-18): painted sky, cel bands, one composite pass, time of day, seam lips

Direction: `art/config/WORLDSEED-BRIEF.md` (look-core stage). Techniques written from the Worldseed study (no Worldseed code or
assets). Captures: `art/screenshots/look_core/` (7 views + `default_mobile` / `default_desktop`, Golden afternoon, sheets vs
`phase2`), `look_core_toggles/` (all on / ink / cel / bloom / grade / composite off), `look_core_moods/` (8.5 / 12 / 16.5 / 18 /
19.5 h), `look_core_game/` (Game (current) parity). `look_core_ref/` = a git-ignored side-by-side with the reference.
The pure parts live in `lib/look-core.mjs` (inlined as `window.__LOOK_CORE__`, node-tested): time-of-day blend, the guarded cel
patch, the inverse Neutral, the sky / composite / bloom GLSL.

- **Step 0, lawn + canopies + darks**: grass albedos retuned toward the Worldseed lawn family (warmer, greener; lit meadow hue
  85-105 deg, saturation 0.40-0.50 on the captures, shade cooler but green); the hemisphere sky fill moved from cyan-blue to a
  neutral lavender-grey (a blue fill is what turned shadowed grass teal); canopy gradient darker / greener on top, pines less
  yellow; `materials.minAlbedo` (new section) = a luma FLOOR with a coloured dark for GLB albedos (sheep faces), applied at load.
- **Painted sky + cloud sea** (`sky.mode: 'painted'`, `sky.paint.*`): the dome sphere's fragment shader (`LC.SKY_FS`, a
  superset of the Phase-1 dome: `uPainted` 0 = the dome exactly). Zenith / `mid` / horizon gradient + a warm `glow` band toward
  the sun; overhead `cumulus` and the `sea` are a soft-max (log-sum-exp) union of puffs from a jittered cell grid (normals from
  the puff gradient, crisp shade / mid / lit bands + rim, `fwidth` antialiasing); the sea uses FLAT-TOPPED puffs (`flat`,
  `radius`, `coverage`, `cell` u) on the world plane `sea.y` with cast shadows toward the sun (`shadow`), bands on N.L relative
  to a flat top (`shadeMid` / `midLit`, so caps stay cream at every sun height), fading into `haze` (`fadeStart` / `fadeEnd`);
  `towers` = stacked-ellipse cumulus on the horizon. Drift = the shared clock (`drift`, `driftDirDeg`; frozen in captures).
  Texture-free, not tone mapped, drawn first; the icosphere puffs and the deck disc are hidden. `lowDetail` / `?quality=low` =
  one octave, no cast shadows, no towers. The gameplay screen tint (`sky.screenTint`) still puts the zenith at the top.
- **Cel bands** (`cel.*`, new section): every opaque Lambert material (terrain, paths, stairs, trees, bushes, GLBs) chains the
  guarded r186 patch (`LC.celPatchLambert`): N.L banded at `terminator` (per mood: low suns need a lower one) with `softness`
  per kind (terrain / foliage / building), `shade` / `lit` / `highlight` levels; the cast shadow stays a smooth factor (three
  multiplies it into the light colour before the band: no combs on PCF edges); `shadeTint` x `shadeAmount` tints the hemisphere
  fill (luminance kept); warm `rim` on grazing, non-upward faces. Any anchor that does not match exactly once -> plain Lambert +
  a console warning (`window.__lookCore.cel` counts). Every shader patch now goes through `addPatch` (chained, one cache key).
- **Composite** (`post.composite` / `ink` / `bloom` / `grade` / `vignette`): HIGH tier = scene -> MSAA (`samples`) HalfFloat
  target + DepthTexture -> one ShaderMaterial pass (`toneMapped: false`): depth ink (8 taps, second difference of linear depth
  = relative jump `jumpStart` .. `jumpFull`, fading `fadeStart` .. `fadeEnd`; lines take `surfaceMix` of the surface x `violet`,
  never darker than `color`), Neutral tone mapping ONCE on scene pixels (alpha 1; the sky writes alpha 0), bloom add (prefilter
  on the display luma `threshold - knee` .. `threshold`, sky excluded, 4-level dual-filter chain, `strength`, `radius`),
  split-tone grade (`shadowTint` / `highlightTint` x `amount`, `saturation`, `shadowSaturation` below `pivot`, `contrast`),
  `vignette`, sRGB once. `renderer.toneMapping` keeps the preset's curve: three applies it only to the canvas (the LOW tier and
  any direct render), never into the target. Display-referred extras (fog colour, underside haze, Water.tsx output) get their
  inverse-Neutral pre-image on the target, so the low and high tiers match except for the effects. The near plane is re-fitted
  every frame (0.9 x the distance to the nearest visible bounds). `?quality=low|high` overrides the preset.
- **Time of day** (`lookPresets.json timeOfDay`): Soft morning 8.5 h, Golden afternoon 16.5 h, Dusk 19.5 h are keyframes;
  `?hour=H` / the panel's "time of day (h)" slider / `window.__look.setHour(h)` blend every value (colours in linear, sun azimuth
  along the shorter arc, smoothstep, wrapping through midnight). Named moods still select as before. `?look=Game (current)&hour=H`
  or `?gamehour=H` = the old game day-cycle preview.
- **Seam lips** (`grass.seamMatch`): the meadow hairlines were the pieces' seam / inner walls and MAIN's cone seen through
  sub-pixel cracks between neighbouring top surfaces (different pivots -> float32 clip positions differ by ULPs). Their rim
  vertices now take the parent top surface's colour (paint) and normal (`GT.seamLipNormals`); nothing moves (export frozen).
- Panel: "time of day (h)" under the preset; "Look core toggles" (composite / ink / bloom / grade / vignette / cel / sky mode);
  every new parameter in the schema-driven folders.
- `Game (current)` / `Proof warm (v4)`: every look-core switch off -> unchanged.
- Tests: `node tests/lookcore.test.mjs [--shots <phase>]` (lawn albedo + lit lawn on the captures, sky shader, cel patch +
  fallback on the real r186 source, hour blend, seam lips, inverse tone map) and `node tests/lookcore.browser.mjs [--page]`
  (painted sky, cel once per material + fallback, composite / tone mapping once, ink / bloom toggles, grass never a bloom
  source, low tier, `?hour=`, min albedo).

## WORLDSEED plants & shapes (2026-10-19): tree silhouettes, woodland edge, flower drifts, cliff strata, farm, paths
All of it is preset-driven and OFF in `Game (current)` / `Proof warm (v4)` (= the old scene, except that since the painterly trees
`Game (current)` loads the painterly `tree_round_a` and bush files: see the first bullet).
- **Painterly models (2026-10-23, `art/specs/2026-10-22-painterly-trees-design.md`).** The moods now draw the composition's own
  models, as `composition.pieces.json` exports them: each tree's species GLB (`lib/species.mjs`, `art/reskin/<id>.glb`) as
  `tree:<asset>:<piece>`, one InstancedMesh per mesh part (bark, leaves, tree_fruit's apples), with only the `Canopy` parts tinted
  by `canopy.instanceTint`'s seed through `GT.texturedTint` (near white, each channel 0.92-1.08); the card shrubs and every bush
  kind (bush_berry too) as `shrub:<asset>:<piece>`. The painted textures keep their colour: the variant geometry, crown ramp and
  canopy patch below apply only where a painterly GLB is missing (a load error). `Game (current)` keeps its old sets, but
  tree_round_a, bush_a and bush_flowering now load their painterly files (as `public/models` holds them).
- **Tree variants** (`lib/plants.mjs` = `window.__PLANTS__`, pure / node-tested): 4 broadleaf (oak = full dome of lobes, ovate =
  tall stacked crown, spread = low shelved storybook canopy on a forked trunk, sapling = young tree / growth stage) + 2 conifers
  (fir = 5 jagged drooping tiers, pine = 3 stout bell tiers). Crowns = several stretched low-poly blobs with DOMED normals (lobe
  normal blended with the crown envelope's), trunk + crown in ONE geometry, one InstancedMesh per variant per piece
  (`tree:<variant>:<piece>`). Which variant stands where = `lib/terrain.mjs composeBlueprint` PLANTS block (tree positions /
  species / scales unchanged; new per-tree `variant`, `vscale` 0.92-1.08, `vyaw`): firs on the highland / grove / cliff tops,
  stout pines by the lake, saplings on the forest edge, spreading + oak where open, ovate + oak inside the woods; no two
  neighbours (< 1.5 u) share variant + scale + yaw. Shares: `world.config composition.plants.variants`.
- **Crown colour** (`plants.ramp` / `plants.conifer`): albedo = a 4-stop ramp shade -> mid -> lit (+ `accentAmount` of the gold
  accent on the most lit tips), t = `light` x (world N.sun x 0.5 + 0.5) + `height` x aTreeH + `bias`, live with the time of day,
  x the per-lobe value jitter x the per-tree tint (`canopy.instanceTint`). Then the canopy patch (`plants.gradient` share of
  `canopy.gradient`, `canopy.saturation`, leaf translucency `plants.lift` / `plants.coniferLift`) and the cel bands. Trunks keep
  their palette colour. Keep `lit` a mid green: rendered tops must stay hue 70-115, sat <= 0.62 (tests B2). `aTreeH` / `vTreeH`
  are the hooks the Phase-5 wind bends by.
- **Woodland edge** (`plants.shrubs`; layout `composition.plants.shrubs`): procedural mounds / low shrubs on partly-open ground
  near trees (forest edges + clearing rims), bigger nearer the trees, noise gaps, never on a trunk: meadow -> shrubs -> saplings ->
  forest. `shrub:<variant>:<piece>`, no shadow casting, contact blobs instead.
- **Flower drifts** (`plants.flowers`; layout `composition.plants.flowers`): elongated drifts aligned with a slow noise field, one
  colour scheme each (two palette colours split by a wavy boundary along the drift + 6 % strays): warm gold + coral by the garden
  plots, pink + cream round the farmhouse, white + violet / gold / violet per piece. Same totals as before; smooth heads.
- **Contact shadows** (`plants.contacts`): fences, bushes, shrubs, sheep, garden bushes (the shared texture-free blob).
- **Cliff strata** (`stone.strata`): steep faces only, in the island shader (no geometry change): beds `band` u tall, `warp`,
  per-bed `tone` + hue between `cool` and `warm` (multipliers around #808080), joints under ~65 % of the beds (merged beds =
  uneven thickness), a lit ledge on top, sparse vertical block joints (`blocks`); fwidth-antialiased, faded where a bed is
  < 3 px and down the underside.
- **Farm** (`farm.*`): window glow = the farmhouse `Glow` material's emissive (`windowColor` x `windowGlow`: 0.3 by day, 2.4 at
  dusk via the time-of-day blend), a warm porch point light (`porchLight` 0 by day = not in the scene, 5 at dusk), two flowering
  bushes flanking the porch (`garden`).
- **Paths** (`paths.*`): ribbon colour = `color` (muted warm tan #A89478) x a subtle world-space value-noise `variation`. Path
  geometry is the next stage.
- Tests: `node tests/plants.test.mjs` (variants, layout fixture, no clones, ramp, flower drifts, shrubs, paths, farm keyframes,
  revert) and `node tests/plants.browser.mjs [--page]` (sets per preset: the painterly trees, shrubs and the cover kit in the
  moods, the old sets in `Game (current)`; window glow / porch at 16.5 vs 19.5 h, strata energy, draw-call budget <= 920).
- **Draw-call budget re-baselined to <= 920** (ruling R21, 2026-10-23; was <= 900). The base was already 903 (full view) before the
  painterly trees; their two primitives per tree (bark + leaves) brought it to 914 full / 865 farm / 904 default_mobile / 894
  default_desktop. The task 11 probe measured desktop +0.2 ms per frame on a real GPU (GTX 1660 S, branch − main, noise ~1 ms), and
  the binding gate is the frame time, not the call count. The levers if it must come down: the far versions per piece batch
  (game side) and no shadow casting from bark.
