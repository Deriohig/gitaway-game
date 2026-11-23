# Meshy remakes (AI-generated models, under review)

> **Status (2026-10-24).** The texture rule this file left open is settled in [../ART-BIBLE.md](../ART-BIBLE.md) §D.3 (painted textures, 512² default, 1024² hero, never palette-flattened). **The per-model texture sizes in the tables below are history**: the published sizes are in [../ASSET-CATALOG.md](../ASSET-CATALOG.md) §1 (windmill and hero_tree are 1024² since the texture review).

The user allows AI models in selected places (2026-10-19), and the farmhouse is the style test. Each model lives in `art/meshy/<id>/`:

- `<id>.glb` is the finished asset, which the proof loads in place of the procedural model (`PROOF_OVERRIDES` in `scripts/build.mjs`). `public/models` keeps the procedural GLB until the texture rule is decided.
- `concept_prompt.txt` is the text the concept image was made from. The Worldseed style is described in words only; no reference images are uploaded.
- `source/` holds the raw Meshy outputs: concept images, the raw GLB and task JSON. It is git-ignored.

## Pipeline (Meshy CLI 4.4, logged in by the user; spend only within an approved batch)

1. **Concept image.** Run `meshy text-to-image create --ai-model gpt-image-2 --prompt "$(cat concept_prompt.txt)"`, which costs 9 credits. The image is one object in an elevated three-quarter view, under even light, on a plain background. Batch 2 used `meshy image-to-image create --reference-image-urls <farmhouse concept>,<well concept>` instead (12 credits), so new pieces paint like the approved set.
2. **Model.** Run `meshy image-to-3d create --image-url concept.png --model-type smart-topology --target-polycount 4000 --should-texture true --enable-pbr false --texture-resolution 2k`, which costs 15 credits.
3. **Finish.** Run `node scripts/meshy/finish.mjs source/raw.glb <id>.glb [options]` (the header of `finish.mjs` lists every switch). It always:
   - bakes the node transform, turns the model (`--rotY`), scales it (`--height H` uniform, `--fit WxHxD` the largest uniform fit, `--stretch WxHxD` exactly the box), puts the base on y = 0 (`--hang`: the top) and the horizontal centre on `--centre x,z` (default the origin; `--axis y0,y1` takes the centre from one height band, for a tower whose step or hub skews the box);
   - rebuilds zero normals from their faces (Meshy leaves a few; they render as black slivers), and with `--fillBlack` inpaints unpainted black texels;
   - grades the albedo (`--lift`, `--terra`; `--sat h0,h1,k` for one hue band), box-downsamples it to `--tex` px and saves it as JPEG `--q`;
   - names the node, the mesh and the body material after the id.

   Extras, each behind a switch:
   - `--glow`: the Glow mask. Golden, bright texels (`--glassHue/Sat/Val`, default hue 36–56°, saturation ≥ 0.45, value ≥ 0.78) become an emissive mask; every face that touches a pane gets the `Glow` material (the same albedo plus `emissiveMap` = the mask). `--glowY y0,y1` keeps the glow to one height band and the mask to the texels under those faces (the windmill's panes share the roof tiles' orange). The faces are picked on the mask at 1024 px whatever `--tex` is, so a smaller albedo keeps the same Glow faces and the same `PorchLight`; only the saved mask follows `--tex`.
   - `--smoke`, `--porch`: the farmhouse's `Smoke` (chimney top) and `PorchLight` (in front of the door, under the awning) empties.
   - `--porchLamp` (with `--porch`): a hanging lantern, the `PorchLamp` node (116 tris, ~0.19 u tall), whose glass is centred on `PorchLight`. The glass has its own untextured `Glow` material (base `#F3D9A4`), so the game can swap it for its emissive glow material while it keeps the textured wall `Glow`. The frame is flat dark iron (`PorchLamp` material, DeepWarmInk), and a rod goes up to the first surface above (the awning).
   - `--compact`: 16-bit indices and `TEXCOORD_0` as normalised 16-bit. It is core glTF with no extensions and is visually lossless (1/65535 steps). It saves about 40 KB on the farmhouse and 30–50 KB on the windmill and hero tree.
   - `--canopy`: green foliage faces (`--leafHue`, `--leafSat`, above `--leafMinY` × height, cleaned by a majority filter and small-island folding) move to their own mesh under a `Canopy` node pivoted on the trunk axis near the trunk top.
   - `--windmill`: finds the hub (the part of the cap that sticks out furthest), turns it to +Z unless `--rotY` is given, and adds a `Blades` node at the axle end with 4 procedural sails (`--bladeR`, timber stocks, lattice frames and cream canvas as flat-shaded boxes with vertex colours, one material). It spins on local Z.
4. **Check.** `scripts/meshy/inspect.mjs` prints tris, materials, textures and bounds. `cap_orbit.mjs` renders orbit shots (one page load, photo camera, clock frozen), `contact.mjs` lays them out and `sheet.mjs` builds the farmhouse sheet. `tests/meshy.test.mjs` checks the files and `tests/meshy.browser.mjs` checks the placements.

**iOS rule.** The renderer stores GLB sRGB maps as linear RGBA8 and decodes them in the shader (`linearStore` in `arch-scene.js`; phase1 browser checks B1a and B1d). Apple GPUs corrupt the GPU-generated mipmaps of sRGB textures.

## farmhouse (V20)

| Step | Settings | Result | Credits |
|---|---|---|---|
| Concepts | gpt-image-2 (picked) + nano-banana-pro | `source/concept_gpt.png` | 18 |
| Model | smart-topology 4000, 2k texture, no PBR (task 01a15171-3e82-7362-be7f-89a46dee0fe7) | 3,530 tris, 3.4 MB raw | 15 |
| Finish (V21) | `--height 2.7 --centre -0.21,0.35 --glow --smoke --porch --porchY 0.8 --porchOut 0.4` | 3,530 tris, one 1024² albedo + glow mask, 513 KB | 0 |
| Polish | the same + `--porchLamp --tex 1024 --q 70 --compact` | 3,646 tris (+ 116 lamp), one 1024² albedo + glow mask, 403 KB | 0 |

Re-finished with the generalised `finish.mjs` (V21): geometry, textures, material factors and nodes were identical to V20; only the body material is now named `farmhouse`. Since the polish, `meshy.test.mjs` M1 re-runs the polish recipe and checks it against the committed file.

Open points:
- The model is over the game rules: building budget 3,000 tris, "flat colours, no image textures" and files ≤ 200 KB (403 KB, see the polish section). The user and the game session decide the texture rule.
- The right gable is invented, because the concept shows only the front and left. A multi-view concept would fix it.

## The set (V21: 12 models finished and placed in the proof, 0 credits)

The 12 raw models were generated and approved in one batch (concept + smart-topology model each). Finishing and placing them cost no credits. The proof loads them; `public/models` and the manifest are untouched. `rock_a` / `rock_b` become `boulder_a` / `boulder_b` through `PROOF_OVERRIDES`, and the other ten ship as `.wasm` through `PROOF_EXTRAS` (`scripts/build.mjs`). The "Meshy set pieces" block of `scripts/lib/arch-scene.js` (`MESHY_SET`) places them.

| id | finish settings | tris | KB | texture | placement |
|---|---|---|---|---|---|
| boulder_a | `--fit 1x0.7x1 --tex 512` | 612 | 87 | 512² | every `rock_a` instance (`PROOF_OVERRIDES`), including the stepping stones |
| boulder_b | `--fit 1x0.7x1 --tex 512` | 622 | 81 | 512² | every `rock_b` instance (`PROOF_OVERRIDES`) |
| boulder_c | `--fit 1x0.7x1 --tex 512` | 628 | 85 | 512² | a third of the rock instances, picked by a hash of the position (`isRockC`), not the RNG: a flat slab |
| outcrop_a | `--height 2.8 --tex 512 --lift 0.8` (polish: was `--tex 1024`, 373 KB) | 2,075 | 177 | 512² | highland upper mesa riser, theta 248° (−6.39, −15.81), and the islet's open coast, theta 0° (24.28, 0), at scale 0.9 |
| outcrop_b | `--height 1.9 --tex 512 --sat 40,95,0.62 --hue 40,95,104,0.8` (the yellow moss read as a flat yellow slab from the gameplay camera: turned toward the lawn green; polish: was `--tex 1024`, 353 KB) | 2,081 | 171 | 512² | highland upper mesa riser, theta 218° (−13.03, −10.18), at scale 0.85, running along the cliff face |
| underside | `--fit 10x10x10 --hang --tex 1024 --fillBlack` | 4,223 | 489 | 1024² | **HELD BACK from the proof (lead review):** sitting inside MAIN's cone it pokes through as patchy fragments, so it has to replace the cone's tip instead. It is not in `PROOF_EXTRAS`, and meshy.browser S5 asserts it absent. The fit it had: under MAIN's axis. On the joined island: scale 1.5, top 0.6 u above the highest bottom-surface point (core `U`) under its top rim (y ≈ −18.9). MAIN alone: scale 0.6 under MAIN's cone (y ≈ −5.2) |
| hero_tree | `--height 3.4 --tex 256 --compact --canopy --leafMinY 0.2` (polish: was `--height 4.3 --tex 1024`, 492 KB) | 5,105 (trunk 3,617 + `Canopy` 1,488) | 193 | 256² | replaces layout.ts `STATIC_TREES[0]` (−6.4, −3.6), the game's biggest round tree, in both tree sets; broad side to the camera; contact 2.7 × 1.9 |
| windmill | `--stretch 1.955x3.7x2.18 --axis 0.25,0.6 --windmill --glow --glassHue 18,48 --glassSat 0.5 --glassVal 0.55 --glowY 0.2,0.55 --tex 256 --compact` (polish: was `--tex 1024`, 493 KB) | 3,480 (body 2,940 + `Glow` 36 + `Blades` 504) | 181 | 256² + glow mask | `WINDMILL` (0.7, −5.5), rot 0.124: the door faces the stone path's end at (0.85, −4.3); the window faces local +X |
| well | `--stretch 0.985x1.3x0.864 --tex 512` | 1,547 | 173 | 512² | `WELL` (−6.1, 0.9), rot π/4 |
| bench | `--fit 1x1x1 --tex 512` | 580 | 109 | 512² | `BENCH` (0.65, 5.75), rot −2.1 (facing the pond) |
| cart | `--rotY 90 --fit 1x1x1.2 --tex 512` | 1,466 | 173 | 512² | a checked free spot (5.75, 12.25), rot 2.5: 1.37 u from haystack_a, 0.5 u clear of the to_meadow ribbon, outside the shelter and pasture zones |
| haystack | `--stretch 0.9x0.84x0.881 --tex 512` (polish: was `--stretch 1.022x0.84x1.001`) | 536 | 95 | 512² | meadow zones haystack_a (6.5, 13.4) rot 0.35 and haystack_b (7.2, 14.4) rot 2.2, as one InstancedMesh; their footprints are 0.35 u apart (were 0.23) |

Size calls:
- The windmill concept is chunkier than the ASSETS spec (base radius 0.75, tower 2.7, hub 2.85). At a uniform 3.6 the plinth radius would be 1.22, so it is narrowed by about 14 %. Plinth 1.08, tower 0.8, cap top 3.7, hub 2.26, sails r 1.7.
- The well is made about 12–14 % taller than wide, toward the ASSETS radius 0.42. The haystack is 0.9 wide since the polish (the ASSETS radius 0.45), with the same 0.84 height and depth in proportion.
- The outcrops have the sandstone lifted (outcrop_a) and the moss desaturated (outcrop_b), so they sit with the warm-taupe cliffs.

Scene rules:
- Every base sits on the lowest ground under its footprint.
- Contact blobs join each piece's instanced contact batch.
- Only the windmill, well, hero tree and outcrops cast shadows.
- The underside is out of the shadow fit and fades with the island's underside haze (× 0.6, so its roots still read).
- The windmill window rides the farm's dusk glow (`GLOW.extra`), and its sails turn on the shared clock (at rest in captures).
- Draw calls (incl. the shadow pass) are full 844, farm 771, default_mobile 824, default_desktop 824. Before the set they were 822 / 753 / 803 / 803; the cap is 900.

Open points:
- **Layout conflicts (frozen layout).** The proof's v4 trunk paths start at the layout.ts stone-path ends, and three game slots stand on them:
  - to_cottage runs 0.47 u past the WELL centre, so 0.43 u of the well's footprint is on the ribbon.
  - to_orchard passes 1.1 u from WINDMILL, so 0.51 u of the plinth is on the ribbon.
  - to_meadow starts under the BENCH's back corner (0.28 u).

  `meshy.browser.mjs` S3 holds these at their measured values. Fixing them means moving a path start or a slot, which is outside this pass.
- **Game rules.** Since the polish every published file is ≤ 200 KB except the farmhouse (403 KB, the hero asset); the held-back underside is 489 KB. The well (1,547), cart (1,466) and boulders (612–628) are over the 600-tri prop budget. The windmill (3,480 with sails) is over the 3,000 building budget. The texture rule is still open (see the farmhouse).
- **Triangle count.** The scatter boulders (about 170 instances × ~620 tris) add about 100 k scene triangles (full view 990 k → 1.14 M). A meshopt simplification of the three boulders to ~250 tris would win most of it back.
- **Underside seam.** The model emerges through the craggy cone, so the seam is a jagged interpenetration. It reads as a rooted tip from the edge and gameplay views but looks patchy up close. It cannot be seen in the `full` view, where the island hides everything under it.
- **Single-view geometry.** The hero tree is flat in depth (4.2 wide, 2.8 deep at 3.4 u), so it is turned broad side to the camera.
- **Sheets** are in `art/screenshots/meshy_set/`: `sheet_*.png` for before / after on the 7 views and both gameplay cameras, and `orbits_*.png` for 3–4 orbit angles per piece plus the windmill at dusk.

## Polish (the game session's feedback, 0 credits)

The six models were re-finished from the raw outputs with no Meshy calls, and the sheep was rebuilt. The layout is unchanged (blueprint 22/22). `public/models` was re-published through `publish-models.mjs`. `models.test.mjs` P7–P11 hold the new expectations; they were recorded RED on the V21 files first.

| id | before | after | how |
|---|---|---|---|
| farmhouse | 3,530 tris, 1024² q82, 513 KB, `PorchLight` empty only | 3,646 tris, 1024² q70, 403 KB, `PorchLamp` lantern | `--porchLamp --tex 1024 --q 70 --compact` |
| windmill | 3,480 tris, 1024², 493 KB | 3,480 tris, 256², 181 KB | `--tex 256 --compact` |
| hero_tree | 4.3 u (5.3 × 3.5), 1024², 492 KB | 3.4 u (4.2 × 2.8), 256², 193 KB | `--height 3.4 --tex 256 --compact` |
| outcrop_a | 1024², 373 KB | 512², 177 KB | `--tex 512` |
| outcrop_b | 1024², 353 KB | 512², 171 KB | `--tex 512` |
| haystack | 1.02 × 0.84 × 1.00 | 0.90 × 0.84 × 0.88, 95 KB | `--stretch 0.9x0.84x0.881` |
| sheep | 0.75 × 0.88 × 1.18 (w × h × l) | 0.70 × 0.74 × 0.81, 620 tris | `scripts/assets/sheep.mjs`: a shorter fleece with the face half sunk into it, × 0.88; `Head` pivot at the neck (0, 0.48, 0.18) |

- **Porch lamp.** The lantern hangs from the awning's front edge, with its glass centred on `PorchLight` (−0.38, 0.80, 1.45), which is unchanged. In the proof, `arch-scene.js` puts the untextured `Glow` on the farm's dusk glow (`GLOW.extra`), as it does for the windmill window. It adds 4 draw calls, 2 primitives plus their shadow pass: default_mobile and default_desktop went from 823 to 827.
- **Texture pass.** The geometry sets the floor. The farmhouse's 5,270 vertices are about 200 KB as float UVs with 32-bit indices, and about 164 KB with `--compact`. The windmill and hero tree are close to that too, so `--tex` / `--q` alone cannot bring them under 200 KB. Each size was judged at default_mobile, default_desktop and a closer orbit:
  - At 256 px the farmhouse roof loses its shingle rows and the windows smear at both gameplay cameras (198 KB). At 512 px (241 KB, q70) the shingles and window panes go soft in the dusk close-ups and at desktop zoom, so after the lead's review the hero asset keeps 1024 px, with q70 and `--compact`: 403 KB (it was 513). q70 cannot be told from q82.
  - At 256 px the windmill and hero tree lose only fine grain at the gameplay cameras; up close, the windmill cap tiles and window go softer. At 512 px they would be 249 KB and 248 KB.
  - `models.test.mjs` P10 holds every published Meshy file to ≤ 200 KB, with one documented exception: the farmhouse at ≤ 405 (403 KB measured).
- **Haystacks.** The meadow pair's footprints are now 0.35 u apart (they were 0.23 u). The pair lines up with the gameplay camera (its axis is at 35°, the camera at 45°), so one still stands in front of the other in that view.
- **Proof flock.** The meadow composition keeps its sheep scales (0.55–0.67, `lib/terrain.mjs`). The proof's sheep are therefore 0.41–0.50 tall and read as a compact flock beside the 0.84 haystacks.
- **Hero tree and the home fence (layout frozen: not moved).** `HOME_FENCE[0]` (−6.9, −2.3) → (−6.0, −4.4) passes 0.04 u from the trunk axis, so it runs through the trunk at any size. At 3.4 u the roots spread 1.53 u (1.94 at 4.3) and reach 1.36 u past that fence on one side and 1.24 u on the other. `HOME_FENCE[1]` passes 0.99 u from the axis, and the roots reach 0.46 u past it.
  - The nearest fence-clear spot behind the farmhouse is (−3.3, −5.2): 1.63 u from both runs, 2.2 u inside the rim, ≥ 1 u from the bushes and paths, and still behind the house at az 45. It is 1.46 u from the pine `STATIC_TREES[1]` (−4.7, −5.6), so their crowns would overlap.
  - The alternative is to end or reroute `HOME_FENCE[0]` before (−6.4, −3.6).
- **Windmill.** No change apart from the texture: its window faces local +X.

## Batch 2 (the ten stand-ins the game still drew: 270 credits)

The user asked for the missing models and that the designs stay **in line with the concept**. The concepts were therefore made with `meshy image-to-image` (gpt-image-2, 12 credits each), using two approved concepts as style references: `farmhouse/source/concept_gpt.png` and `well/source/concept_1.png`. The new set uses the same terracotta tiles, honey timber, warm stone and painted finish.
- **Concept prompts.** `<id>/concept_prompt.txt` holds the shared style instruction, then the object, then the view.
- **Models.** Each one is image-to-3d smart-topology from `concept_1.png` (15 credits each), with no re-rolls.
- **Recipes.** `<id>/finish_args.txt` holds the exact `finish.mjs` switches.
- **Spend.** The balance went from 1,120 to 850: 10 concepts × 12, plus 10 models × 15. Every charge matched its expected price.

Every model was checked against its concept with `scripts/meshy/turntable.mjs`. That covers four orbit views, the game camera (az 45°, 29°) and a posed shot (`Head` x 0.7 for the peck, `Tail` y 0.5 for the wag). `scripts/meshy/ortho.mjs` (gridded orthographic views, parts tinted red) placed the cuts. The sheets are in the session scratchpad, not the repo.

| id | finish | tris | KB | nodes / materials | vs the brief |
|---|---|---|---|---|---|
| chicken | `--height 0.45`, `--part Head` (pivot 0, 0.27, 0.06) | 1,096 | 116 | `Head` | as briefed; one cream coat (the game cannot tint GLB instances) |
| duck | `--height 0.3 --lower 0.05` | 1,048 | 95 | — | y 0 = the waterline, hull to −0.05 (the game's origin sits ~0.02 above the water) |
| dog | `--height 0.55`, `--part Head` (0, 0.38, 0.17), `--part Tail` (0, 0.33, −0.2) | 1,676 | 133 | `Head`, `Tail` | 0.72 long (brief 0.65); 1,572 + 104 cap tris, 5 % over the animal budget |
| cat_sleeping | `--rotY 90 --fit 0.5x0.26x0.52`, `--part Head` (0.08, 0.1, 0.08) | 1,132 | 100 | `Head` | its sleeping face looks along **+X**: the game yaws the cat −0.4 so +X points at the farmhouse door and the camera sees the face |
| goat | `--height 0.68`, `--part Head` ×2 boxes (head + beard; pivot 0, 0.5, 0.17) | 1,324 | 120 | `Head` | one coat (the stand-in had four) |
| lighthouse | `--height 3.75 --axis 0.1,0.6 --glow --glowY 0.66,0.9 --empty Beam:glow --q 72` | 3,028 | 191 | `Beam` (scene root, 0, 2.67, 0.06), textured `Glow` | 1 % over the building budget; lamp room lower than the stand-in's (y 3.05) |
| greenhouse (v2) | `--rotY 90 --fit 2.05x1.7x1.48 --axis 0.45,0.95 --fillBlack --q 64` | 2,822 | 196 | — | v2 (see below): frosted glass on a stone base, 2.05 × 1.50 × 1.21 (the stand-in is 1.70 × 1.48). Painted, opaque frosted panes: **no `Glass` material** |
| beehive | `--fit 0.5x0.73x0.5` | 572 | 101 | — | 0.42 × 0.73 × 0.42, entrance on +Z; no bees (the game's own) |
| lantern | `--rotY 180 --height 0.9 --axis 0.15,0.38 --glow --glowBox 0.12,1,0.4,0.76,-1,1` | 558 | 131 | textured `Glow` | the post on the origin, the lamp on the +X arm, glass x 0.17–0.28, y 0.49–0.65 (the stand-in's glow box was at 0.18, 0.72); the moth's perch (0.18, 0.885) is on the arm |
| scarecrow | `--height 1.45 --fillBlack` | 731 | 111 | — | the concept's arms, 1.25 across (brief 0.85), above the crops; 731 tris (props 600) |

Every texture is 512² JPEG q82 (the lighthouse and greenhouse use q72 to stay under 200 KB), and every file uses `--compact`.

New `finish.mjs` switches:
- **`--part Name:box:pivot` with `--cut Name:normal[:point]`.** Splits a node out with its pivot at the given point; the box is the region and the cut planes do the cutting. It was a centroid cut at first; see "Clean Head / Tail cuts" below.
- **`--lower d`.** Moves the model down by d after basing it on y 0.
- **`--empty Name:x,y,z|glow`.** Adds an empty node, either at a point or at the centre of the Glow faces.
- **`--glowBox`.** Limits Glow to faces inside a box.

`tests/finish-parts.test.mjs` checks the splitter on a synthetic sphere: no face lost, both halves closed, pivot-relative positions, `--lower`, `--empty`. `models.test.mjs` P12–P14 check the published files:
- **P12:** sizes, budgets, `Head` / `Tail` at identity rotation with pivots at the neck and tail base, and facing.
- **P13:** `Beam` sits in the lamp room at the scene root, and the lantern Glow is on the arm.
- **P14:** the albedo is a JPEG ≤ 512, the body material is named after the id, there are no extensions, the normals are unit length, and the base sits on y 0.

P12–P14 were RED before publishing, then GREEN. The lantern glow fix was recorded RED first: Glow had spread onto the post and the hook, x from 0.03 and y up to 0.86.

Notes for the game:
- **Ducks swim tail-first.** From reading `Animals.tsx:391`, every duck faces opposite to its direction of travel. That is a game-side heading bug, not the model.
- **One colour per model.** The chickens and goats share one material per model, so per-instance coats need a game change.
- **Cat porch height.** The cat sits on the stand-in porch height (+0.24 above terrain); check it against farmhouse.glb's deck.

**In-game check.** The game was run from this branch with a late-game save injected into IndexedDB, as `e2e/fixtures.ts` does.
- **Loading.** All ten load as GLBs and replace every stand-in. All 41 `/models/*` requests returned 200, with no GLTF errors.
- **Placement.** Grounding is right: the ducks sit half-submerged, the goats stand on the highland, and the lighthouse stands on the islet.
- **Dusk and night.** The lanterns and the lighthouse lamp glow, and the beam shows at night.

Seen there, and left for the game:
- **The cat overhangs.** It sits about half past the porch deck's end, at PORCH + (0.3, 0.24, −0.15). Moving it about 0.3 u toward the door fixes that.
- **The ducks swim tail-first.**

One close-up that reads oddly: the greenhouse panes carry the concept's painted diagonal reflections, which look like torn sheets at very close range. They are mild at the game camera, and the panes are all present; a double-sided material made no visible difference.

### Greenhouse v2 (the user's review: "I don't think the greenhouse looks good"; 66 credits)

In the game, v1 read as an empty, dirty cage: murky grey panes with dark diagonal sheets and leaf shards inside. The cause is see-through glass. From one image, image-to-3d paints a smeared copy of whatever is behind the glass onto the panes and builds junk geometry inside. v2 is designed for reconstruction instead.
- **Concept.** The prompt says the glass is NOT see-through: soft, milky, frosted pale sky-blue panes with one gentle highlight each, so every pane reconstructs as a clean colour block. Plants show only as soft silhouettes on the glass. Less of the house is glass, because a base wall rises to about a third of the height.
- **Variants.** Three concepts were made with the same style references (12 credits each): v2a with a timber base, **v2b with a stone base** and v2c with a brick base. v2b and v2a were modelled (15 each). v2b was picked: its stone foundation and terracotta ridge match the farmhouse and well, and it adds a climbing vine and pots by the door.
- **Sources.** The variants and v1's raw model are kept in `greenhouse/source/variants/` and `source/raw_v1.glb`, both git-ignored.
- **Finish.** `--rotY 90` turns the door gable to +X. `--axis 0.45,0.95` centres the house on its glass and roof rather than on the pots, and `--q 64` keeps the file under 200 KB (196). The result is 2.05 × 1.50 × 1.21, closer to the stand-in than v1's 1.30 × 1.06.
- **Tests.** `models.test.mjs` P12 now holds the v2 size. It was RED on v1 (height 1.297, depth 1.062) and GREEN after the swap.

### Clean Head / Tail cuts (the game session's close-up review; 0 credits)

Three defects showed up close in the game:
- the goat's right horn was sliced, so a horn piece floated in place when it grazed;
- the cat's body kept half its face, so a "second face" showed when the head lifted;
- the chicken and dog had jagged shard caps at the neck and tail.

All three came from the first `--part`. It assigned whole triangles by their centroid, so:
- the cut zigzagged;
- triangles of the head whose centroids fell outside the box stayed on the body;
- the fan caps over the zigzag poked out, and in places duplicated surface triangles.

`finish.mjs --part` now needs `--cut` planes:
- **Split along the plane.** The triangles a plane crosses are split along it, so the cut is clean and flat, with normals and UVs interpolated.
- **Clean up stranded pieces.** A body piece cut off from the body that touches the part joins the part (the horn). A small part piece that touches only the body rejoins the body.
- **Ear-clip the caps.** Each loop is capped on both sides by an ear-clipped polygon inside its outline, in the most common fur colour along the cut.
- **Pivot at the nape.** The pivot sits on the cut at the nape, so the game's forward peck or graze dips the head into the chest instead of opening the back of the neck.

| id | cut (normal through the pivot) | pivot | tris |
|---|---|---|---|
| chicken | nape → throat, n (0, 0.908, 0.419) | (0, 0.31, 0.04) | 1,158 |
| dog | Head nape → throat, n (0, 0.841, 0.541); Tail across its base, n (0, 0.5, −0.866) | Head (0, 0.45, 0.14), Tail (0, 0.33, −0.2) | 1,918 |
| goat | nape → throat, n (0, 0.725, 0.689), keeps both horns and the beard | (0, 0.5, 0.08) | 1,364 |
| cat_sleeping | two planes: under the chin (y 0.065) and behind the head (x 0) | (0, 0.16, 0.13), the back-top of the head | 1,394 |

**The cat.** Its head is embedded in the curled body, and its two ears are 0.27 apart. A +0.07 lift (a third of the cat's height) therefore always exposes a large flat cut. The model is cut as cleanly as it can be: the whole face and both ears are in `Head`, with no shards. The pivot sits at the back-top of the head so that a chin-up tilt can turn about it. A tilt of `rotation.z` ≈ 0.3 shows only a modest fur-coloured surface under the chin, which is far less than the lift; that was suggested to the game.

**Tests.**
- `finish-parts.test.mjs` (10/10) checks the splitter on synthetic spheres:
  - the area is conserved, and both halves are closed;
  - the cut is exact and flat;
  - the cap lies in the plane;
  - a stranded "horn" half joins the head.
- `models.test.mjs` P15 checks the published animals:
  - every part has cut planes, and nothing of the part is left on the body (≤ 12 vertices);
  - no body piece is stranded;
  - the cut ring is flat (≥ 90 % of it on the planes).

P15 was RED on the shipped files: no cut planes, plus stranded pieces on the chicken (6 vertices), the dog (19) and the goat (22). It is GREEN after the re-finish.

## Texture quick fix (the owner's texture review, 0 credits)

The owner found the Meshy models blotchy and unevenly sharp. The game session measured texture sizes and texel density; the facts are in that exchange. The quick fix the owner chose re-finishes three models from Meshy's raw 2048 px textures. Nothing else changes: the same recipes, geometry, nodes and Glow faces.

| id | before | after | median texel density (p10 / p50 / p90 px per u) |
|---|---|---|---|
| farmhouse | 1024 px q70, 403 KB | **2048 px q70** (its full source), 871 KB | 38 / 44 / 101 → 77 / 87 / 202 |
| hero_tree | 256 px q82, 193 KB | **1024 px q85**, 478 KB | 15 / 22 / 36 → 60 / 90 / 144 |
| windmill | 256 px q82, 181 KB | **1024 px q85**, 493 KB | 16 / 21 / 44 → 63 / 85 / 177 |

- **Reference density.** The game's desktop default (distance 35.5, fov 30, 900 px tall) needs about 47 px per unit, and the phone default about 26. At 256 px the tree and windmill were magnified about 2× on desktop, which made the bark and the windmill blotchy. They now have about twice what that view needs.
- **Farmhouse at 2048.** The roof gets only about 4 % of the atlas: about 145 × 145 texels a slope at 1024. The game session's in-game A/B against the raw Meshy model found nearly all of the roof's loss was the 2048 → 1024 downscale. Its findings:
  - at 2048 the tile edges come back;
  - JPEG quality makes no visible difference at 2048 (q70 looks the same as q85 and q100);
  - shadows and normals change nothing.

  The owner approved the full resolution. The farmhouse was first re-finished at 1024 q85 (515 KB) in this same fix.
- **Size cap.** The owner waived the 200 KB cap for these three; `models.test.mjs` P10 now allows 900 KB for the farmhouse and 520 KB for the other two.
- **Tests.**
  - P16 (new): hero_tree and windmill are 1024 × 1024 at JPEG quality ≥ 85, and the farmhouse is 2048 × 2048 at quality ≥ 70, read from the quantisation table. It was RED on main, and RED again for the farmhouse's 1024 before it moved to 2048. It is GREEN after the re-finish.
  - `meshy.test.mjs` M1 re-runs the committed `farmhouse/finish_args.txt`.
- **Recipes.** These are in `<id>/finish_args.txt`.
- **Comparison renders.** `scripts/meshy/gamecam.mjs` renders before / after sheets from the game's camera: the three models at their layout slots, with anisotropy 8. It covers the default view, distance 14 (at the game's target and framed on the models), the farmhouse roof and the tree's bark.

## Farmhouse roof (the owner's roof note, 0 credits)

After the texture fix the owner found most models fine, but the farmhouse roof still read low quality. The 2048 px atlas could not help. Meshy gave the roof only about 4 % of the atlas, and its own painting of the tiles is smeared: every tile is streaked and the tile edges run into each other. No resize can add detail that was never painted.

The slopes now carry their own texture. Everything else is unchanged: the walls, windows, Glow faces, porch lamp, Smoke, the ridge cap (and its lip) and the porch awning keep the atlas.

- **`finish.mjs --roof roof_tiles.jpg`** moves the roof slopes into a `Roof` primitive with a tiling texture.
  - **Which faces.** Terracotta faces above 30 % of the height, tilted 15–75°, grown over welded edges (normals within 20°) into regions of at least 1 u².
  - **Verge pieces.** Smaller pieces of the same planes join their slope: the verges and the strip behind the chimney, within 10° and 0.15 u of the plane.
  - **Seam faces.** The left verge is a separate Meshy shell. It sits about 6 cm proud of the slope, and the step faces between them run from the eave to the ridge. In the first version those faces kept the old paint, and the verge shaded differently. The owner saw the result as a diagonal band of another colour on the left of the front slope.
    - A face now joins a slope when it stands across the slope (not its underside), reaches down to the slope's level, lies within 0.15 u of the plane, runs down the slope, and has roof on both sides of it (3 cm either way in the plane).
    - The ridge cap's lip also reaches the slope with roof on both sides, but it runs along the ridge, so it stays. So do the roof's outer edges, which have roof on one side only.
  - **One normal per slope.** Every roof vertex gets its slope's flat normal, so the verge and the seam shade exactly like the slope. Meshy's normals lean across it.
  - **Left out.** The ridge cap's sides, the awning and the shed roof are tilted differently and stay on the atlas.
  - **UVs.** Each region is projected on its own plane. u runs along the eave and v runs up the slope, with v = 0 on the eave, so the rows run level and a row's lower edge sits on the eave. A verge raised along the normal maps exactly like the slope under it, so the tiles run on across the seam.
  - **Colour.** The texture is matched to the old roof texels' mean colour with a per-channel gain, which keeps its own contrast.
  - **Freed atlas texels.** Texels that only the slopes used (2.5 % of the atlas) are filled flat.
  - **Game check.** The game keeps a `Roof` material as it is: its own map, sRGB in shader, anisotropy 8, and the glTF REPEAT wrap. The texture is named `farmhouse_roof`, not `*_albedo`, which P16 reads as the atlas.
- **`scripts/meshy/rooftiles.mjs`** generates the texture: `roof_tiles.jpg`, 1024 px, 6 rows × 7 tiles, seed 7. It is a procedural, seamless tile pattern in the concept's style:
  - chunky clay tiles with rounded lower corners, staggered rows and a little hand-made jitter;
  - each tile's lower edge is a lit bevel over a dark thickness face that casts a soft shadow on the row below;
  - per-tile colour, with a few weathered tiles.

  One repeat covers 1.82 × 1.62 u, which makes tiles about 0.26 × 0.27 u, near the old roof's chunky scale.
  - **Grain and softening.** The owner found the first version a little sharper than the painted tiles around it. The texture now has brush streaks down each tile and a fine grain (2–4 px), and is softened with two passes of `[1 2 1]`.
  - **Wrapping.** Every noise layer wraps at the texture edge. The first version scaled two layers by non-integer factors, which left a faint left-right seam: the step across the wrap was 1.7× an ordinary neighbouring step.
- **Resolution.**
  - **Roof texture.** 512 px q90, about 298 texels per unit, against about 95 from the atlas slice. The game's closest zoom (distance 14) needs about 210 on a high-dpi screen. 512 and 1024 looked identical at distance 14 in the `gamecam.mjs` renders.
  - **Atlas.** The atlas went to 2048 only for the roof. With the roof on its own texture, the owner chose a 1024 px q85 atlas, which looks the same at distance 14. The file goes from 871 KB to 587 KB, and GPU texture memory from about 24 MB to about 7 MB. P10 allows the farmhouse 620 KB.
- **Tests.**
  - `tests/finish-roof.test.mjs` (new, a synthetic house) checks R1–R11:
    - only the slopes move, together with a raised verge and its step faces; the ridge cap, its lip and a brown step stay;
    - rows are level and u runs to the viewer's right;
    - the colour is matched;
    - there are no cracks;
    - each slope has one normal;
    - nothing changes without `--roof`.

    R2, R9 and R10 were RED before the seam fix. R11 was RED with the down-the-slope rule switched off. All are GREEN.
  - `tests/rooftiles.test.mjs` (new) checks that the texture is seamless both ways, with tile edges not counted, and keeps the eave convention. T2 was RED on the first generator (wrap step 1.71 against 1.00) and is GREEN now (1.00 against 1.06).
  - `models.test.mjs`:
    - P17 (new) checks the shipped farmhouse: a `Roof` primitive of at least 8 u², at least 250 texels per unit, REPEAT both ways, and level rows on at least 90 % of the roof. It was RED on main.
    - P16 now expects the farmhouse atlas at 1024 px and quality ≥ 85. It was RED on the 2048 file.
    - Both are GREEN after the re-finish.

## Trees and bushes (abandoned Meshy route)

Part 2 of the art-cohesion pass (`art/specs/2026-10-22-painterly-trees-design.md`) first planned one Meshy model per species. The route was abandoned after the raw models; the shipped trees and bushes are free CC0 MegaKit models repainted by `scripts/reskin.mjs` (`art/reskin/SOURCES.md`, the spec's revision 2).

- **Folders.** `tree_oak`, `tree_beech`, `tree_fir`, `tree_scots_pine`, `tree_willow`, `tree_maple`, `tree_sapling`, `tree_birch`, `tree_apple`, `bush_leafy`, `bush_flowering` and `bush_berry`.
- **Concepts** (Gate A, the owner approved all 12 as they were): `meshy image-to-image create` with gpt-image-2 and two style references, an old oak tree and a cottage. gpt-image-2 needs its references named, so each call sent a runtime prefix (ruling R10) before the folder's `concept_prompt.txt`, which stayed as tested. The prefix, verbatim:

  > The first image (an old oak tree) and the second image (a cottage) are references for the painted art style, colours, brushwork and finish ONLY: do not copy their objects. Paint this new object in exactly that style: 

- **Credits.** 144 for the 12 concepts (1,284 → 1,140) and 180 for the 12 raw models (Gate B-1, 1,140 → 960): 144 + 180 = 324 in all.
- **Why it was abandoned.** At about 900 triangles Meshy turned the concepts' soft leaf clumps into angular plates, with dark, muddy textures. The bushes' blossom and berries and the apple tree's fruit were barely painted at all. The owner: "Honestly, they all look absolutely terrible." The owner then asked for free assets to reskin, which became the MegaKit route.
- **What is kept.**
  - The 12 `concept_prompt.txt` files are kept only as a record.
  - The concept images (`<folder>/source/concept_1.png`, git-ignored) are the colour references for every reskin ramp. The numbers the build reads from them (band-ramp stops, luminance p10 / p90, hue gap, bark, pink and cream stops) are frozen in `art/reskin/concept-stats.json` (`node reskin.mjs --freeze-stats`), so the build and its tests run without the images.
  - The raw models (`source/raw.glb`) are not used, and stay git-ignored.

## Garden crops (the owner's batch, 2026-10-25: 240 credits)

The owner's decision, "crops, mature on Meshy": each crop's ready stage (`crop_<id>_3`) is a Meshy model, the young stages are kit cards
(`lib/plantkit.mjs`) and the plot is painted procedural (`scripts/assets/plot.mjs`). After the first review the owner asked for
"bigger, fit the plot" (the same day, 0 credits): the ready plant fills its plot, stage 1 is a sprout cluster, stage 2 one plant about
half the ready size. The owner kept the cranberry's green leaves and the faceted blueberry and cranberry as they are.

- **Spend.** The cap was 216, then 240 for two concept redos (the owner, after the concept review). Balance 906 → 810 (8 concepts × 12)
  → 786 (lettuce and pumpkin redone, 2 × 12) → 666 (8 models × 15): 240 of 240, every task's `consumed_credits` as priced. At most 3 calls
  in flight, the balance logged before and after each.
- **Concepts.** `meshy image-to-image create --ai-model gpt-image-2` with the oak + cottage style references and the R10 prefix (as the
  trees), then `crop_<id>_3/concept_prompt.txt`: one ripe plant, side three-quarter and slightly elevated, sunlit leaf tops, produce all
  round, warm ripe colours, each crop's silhouette cue. The tomato prompt fixes the pilot's (`tomato_ripe/`) dark foliage, saturated red and
  front-only fruit. The first lettuce read as a cabbage and was lime; the first pumpkin's leaves were over the foliage band: both redone.
- **Models.** `meshy image-to-3d create --model-type smart-topology --target-polycount 2350 --should-texture true --enable-pbr false
  --texture-resolution 4k` (15 credits): 1,436–2,476 tris, under the owner's 2,500 Meshy-crop exception (ASSET-RULES §10).
- **Finish** (`crop_<id>_3/finish_args.txt`). Every crop: `--rotY 45`, a size that fills the plot (a footprint up to 0.92 inside the 0.94
  soil's inner edge, up to 1.2 u tall, so the human-height tomato and wheat do not tower), `--terra 1` (no red boost), `--tex 512 --q 85
  --compact`, and three new switches (`tests/finish-crops.test.mjs` F1–F5):
  - `--pad`: a coverage-weighted downsample with edge padding, so the black between Meshy's UV islands no longer darkens their edges
    at 512 px (the pilot ledger's lesson). It also made every file smaller: the pilot recipe was 202 KB, the crops are 128–190 KB.
  - `--maxKB 200`: steps the JPEG quality down until the file fits (q70 floor; none needed it).
  - `--fold s`: bends a paper-flat sheet into a shallow V before the turn.

| id | size switches + extras | above the soil (H × footprint) | tris | KB | t/u | why |
|---|---|---|---|---|---|---|
| crop_radish_3 | `--fit 0.92x1.2x0.92 --lower 0.12 --sat 55,175,0.93` | 0.82 × 0.92 | 2,470 | 175 | 294 | the root's lower part in the soil; leaf shade 0.63 → 0.59 (band 0.60) |
| crop_carrot_3 | `--fold 0.5 --stretch 0.84x1.0x0.84 --lower 0.13` | 0.87 × 0.84 | 1,899 | 148 | 290 | Meshy made the fronds one flat sheet: folded; stretched 1.45× wider than its own tall, narrow fan so it fills the plot |
| crop_wheat_3 | `--fold 0.5 --fit 0.92x1.2x0.92` | 1.20 × 0.88 | 1,436 | 128 | 308 | a flat sheet (0.02 deep): folded, facing the default camera (the game orbits only ±49°, never edge-on); the 1.2 u cap |
| crop_lettuce_3 | `--fit 0.92x1.2x0.92` | 0.43 × 0.92 | 1,638 | 157 | 225 | |
| crop_tomato_3 | `--fit 0.92x1.2x0.92` | 1.20 × 0.76 | 2,186 | 164 | 207 | fruit all round; the 1.2 u cap sets its width |
| crop_pumpkin_3 | `--fit 0.92x1.2x0.92 --sat 12,40,0.93` | 0.34 × 0.92 | 2,476 | 190 | 360 | produce 0.87 → 0.84, inside the owner's 0.85 |
| crop_blueberry_3 | `--fit 0.76x1.2x0.76 --lift 0.85` | 0.67 × 0.76 | 2,101 | 164 | 154 | held at 0.76 so its texel density stays in the 150–500 band; the dark foliage lifted a little |
| crop_cranberry_3 | `--fit 0.92x1.2x0.92 --hue 11,45,80,1` | 0.37 × 0.92 | 2,010 | 166 | 165 | Meshy painted the leaves reddish brown (79 % of the texels at hue 10–30°: a dirt mound on the soil): turned to leaf green (the `outcrop_b` method, every stroke kept), the red berries untouched; the owner: "Green leaves" |

- **Young stages** (kit). Stage 1: seven seedlings across the plot (one in the middle, six round it at 0.27 u), 0.14–0.23 u tall (the
  low lettuce, pumpkin and cranberry 0.14–0.15). Stage 2: one plant in the middle, 49–77 % of the ready height (radish 0.48, carrot 0.50,
  wheat 0.72, lettuce 0.30, tomato 0.68, pumpkin 0.26, blueberry 0.44, cranberry 0.18). Every card stays at 250–460 texels/u.
- **Checks.** `crops.test` G1–G5 (the sprout cluster and the one-plant stage 2, the published ready stage filling its plot, inside the
  soil, the stages grow, the manifest), `assets.test` (the `crop_meshy` class, M16), `palette.test` PB12 (produce ≤ 0.85, leaves and leaf
  shade in the foliage band), `models.test` P10.
- **Reads badly.** The blueberry's berries are barely painted (about 1 % of its surface) and its leaves are angular plates (kept, the
  owner's call). At the default camera the 1.2 u tomato and wheat cover part of the plot behind them (they stay inside their own soil).
  Wheat and carrot are folded sheets: fine from the game's cameras, thin from the side. The low lettuce and cranberry sprouts are still
  small at `CAM-DESK`. The kit sunflower and lavender got the same treatment (crops.test F1–F4); the sunflower's heads are now their own cards (the crossed face-on and profile cards sliced each head).
