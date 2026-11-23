# Gitaway asset catalog

2026-10-24 · branch `art/art-bible` (b077472) · owner's brief phases 3–4. Rules: [ASSET-RULES.md](ASSET-RULES.md); style: [ART-BIBLE.md](ART-BIBLE.md).

Every number was measured from the files in `public/models` (94 GLBs + 8 height grids, all `ready` in `manifest.json`, no missing
file, no orphan entry) with `@gltf-transform/core`, read-only. **Size** = bounding box W × H × D in u (H = height). **Tex** = colour
textures. **t/u** = texel density, √(UV area × texels ÷ world area) of the textured material (repeating UVs count every repeat).
**Status**: **ok** approved · **rev** needs revision · **dep** deprecated · **stand-in** replace · **keep** procedural by design.
**Used by** = the game code that draws it.

## 1. Meshy textured models (approach A: one painted atlas, r 0.92, m 0, double-sided)

Source: `art/meshy/<src>/` (prompts, finish args; raw downloads git-ignored), finished by `scripts/meshy/finish.mjs`, copied
byte-identical by `scripts/publish-models.mjs`.

| Id | Used by | Size | Tris | Tex | t/u | Nodes / materials | Status | Issues |
|---|---|---|---|---|---|---|---|---|
| farmhouse | `Farmhouse.tsx:90` | 3.54 × 2.70 × 2.76 | 3,646 | 1024² atlas + 1024² glow mask + 512² roof tile | walls 79, roof 288 | `Smoke`, `PorchLight`, `PorchLamp`; `Glow` textured + untextured, `Roof` | ok hero | Over the 3,000 building cap (hero exception); wall texel density lowest of all buildings (named exception, 79 against the 128 hero target); 587 KB |
| windmill | `Structures.tsx:44` | 3.05 × 3.79 × 2.24 | 3,480 | 1024² + glow mask | 133 | `Blades` (procedural sails, vertex colours); `Glow` | ok | Sails are flat vertex colour inside a textured model; over the building cap; 493 KB |
| greenhouse | `Structures.tsx:75` | 2.05 × 1.50 × 1.21 | 2,822 | 512² | 80 | — (frosted panes painted, no `Glass`) | ok | Low texel density for its size |
| lighthouse | `Structures.tsx:380` (islet) | 1.67 × 3.75 × 1.92 | 3,028 | 512² + glow mask | 81 | `Beam`; `Glow` | ok | Low texel density; 1 % over the building cap |
| well | `Structures.tsx:167` | 0.99 × 1.30 × 0.86 | 1,547 | 512² | 145 | — | ok | No `Tint` (Studio cannot recolour) |
| hero_tree | `Nature.tsx:74` (STATIC_TREES[0]) | 4.20 × 3.40 × 2.80 | 5,105 | 1024² | 106 | `Canopy` (pivot 1.19 = 0.35 × H) | ok | Meshy tree beside reskinned trees: the only one of its kind; HOME_FENCE[0] runs through its trunk (`meshy/README.md`) |
| bench | `Structures.tsx:223` | 1.00 × 0.68 × 0.48 | 580 | 512² | 216 | — | ok | No `Tint` |
| crop_radish_3 / carrot / wheat / lettuce / tomato / pumpkin / blueberry / cranberry (the garden batch, 2026-10-25) | `Crops.tsx:266` `CropPlants` (ready) | above the soil × footprint: 0.82 × 0.92 / 0.87 × 0.84 / 1.20 × 0.88 / 0.43 × 0.92 / 1.20 × 0.76 / 0.34 × 0.92 / 0.67 × 0.76 / 0.37 × 0.92, filling the 0.94 plot ("bigger, fit the plot", the owner) | 2,470 / 1,899 / 1,436 / 1,638 / 2,186 / 2,476 / 2,101 / 2,010 | 512² | 294 / 290 / 308 / 225 / 207 / 360 / 154 / 165 | — | ok | The Meshy-crop exception (≤ 2,500 tris, ASSET-RULES §10). Wheat and carrot fronds came out paper-flat: folded into a shallow V facing the default camera. Cranberry leaves were painted brown by Meshy: hue-shifted to green (the owner: "Green leaves"). Blueberry berries barely painted (1 % of the surface), kept as it is (the owner) |
| haystack | `Structures.tsx:471` (meadow) | 0.90 × 0.84 × 0.88 | 536 | 512² | 281 | — | ok | — |
| cart | none (proof only) | 0.83 × 0.69 × 1.20 | 1,466 | 512² | 163 | — | ok unused | No game slot; over the 600 prop cap |
| lantern | `Structures.tsx:242` | 0.37 × 0.90 × 0.15 | 558 | 512² + glow mask | 450 | `Glow` | ok | — |
| beehive | `Structures.tsx:199` | 0.42 × 0.73 × 0.42 | 572 | 512² | 250 | — | ok | — |
| scarecrow | `Structures.tsx:263` (drawn ×0.75) | 1.25 × 1.45 × 0.69 | 731 | 512² | 202 | — | ok | Over the prop cap |
| rock_a / rock_b / rock_c | `Nature.tsx:204` + composition (51 / 55 / 48) | ~1.0 × 0.56 / 0.66 / 0.15 × ~0.9 | 612 / 622 / 628 | 512² | 252 / 266 / 288 | — | ok | Over the prop cap (accepted) |
| outcrop_a / outcrop_b | `WildIsles.tsx:285` (highland, islet) | 1.79 × 2.80 × 1.78 / 2.64 × 1.90 × 3.58 | 2,075 / 2,081 | 512² | 106 / 73 | — | ok | outcrop_b has the lowest texel density in the set: a known defect on the V1 register (ART-PLAN P2-2; floor 100) |
| chicken | `Animals.tsx:126` (coat tints) | 0.29 × 0.45 × 0.42 | 1,158 | 512² | 597 | `Head` | ok | — |
| duck | `Animals.tsx` | 0.28 × 0.30 × 0.45 | 1,048 | 512² | 661 | — | ok | Hull dips to y −0.05 |
| dog | `Animals.tsx:246` | 0.31 × 0.55 × 0.72 | 1,918 | 512² | 459 | `Head`, `Tail` | ok | 28 % over the 1,500 animal cap |
| cat_sleeping | `Animals.tsx:290` | 0.45 × 0.23 × 0.52 | 1,394 | 512² | 471 | `Head` | ok | — |
| goat | `Animals.tsx:206` (highland) | 0.31 × 0.68 × 0.75 | 1,364 | 512² | 454 | `Head` | ok | — |

Held back, not published: `art/meshy/underside` (4,223 tris, pokes through MAIN's cone). Abandoned: the 12 Meshy tree/bush models
(`art/meshy/tree_*`, `bush_*`; concepts kept as colour references).

## 2. Painted procedural (approach B: shared 512² painted atlas + baked AO in `COLOR_0`)

Source: `art/scripts/assets/<id>.mjs` + `lib/paintedAtlas.mjs` (+ `look.config.mjs` `assetMaterials`), published by
`publish-models.mjs`, tested by `tests/models.test.mjs` P18–P23.

| Id | Used by | Size | Tris | t/u | Status | Issues |
|---|---|---|---|---|---|---|
| woodshed | `Structures.tsx:127`, spot B `layout.ts:113` | 1.16 × 0.89 × 0.79 | 1,196 | 441 | ok | — |
| plot | `Garden.tsx:124` (every garden plot) | 1.03 × 0.19 × 1.03 | 240 | 322 | ok | Painted since 2026-10-25 (P0-1): tilled soil, three furrow rows (the atlas `soil` cell), weathered grey board edging; same footprint as the flat stand-in |
| wetland_jetty | `WildIsles.tsx:172` (anchor `wetland_jetty`, on the wetland lake) | 0.72 × 0.75 × 1.71 (y 0 = waterline, piles to −0.3) | 450 | 465 | ok | — |
| barnaby | `features/barnabyModels.tsx:10`, `Barnaby.tsx:82` | 0.48 × 1.06 × 0.44 | 1,073 | 377 | ok | Blocky face up close (decided look, keep) |
| barnaby_camp | `Barnaby.tsx:132` | 1.00 × 0.69 × 0.69 | 711 | 347 | ok | — |
| tower_ruin | `Barnaby.tsx:145` (highland) | 2.08 × 1.32 × 1.96 | 1,380 | 246 | ok | — |

**The wetland jetty.** `wetland_jetty` is Fin's jetty on the wetland lake, with a 0.6 u shed patch beside it kept clear for Fin's shed (`BLUEPRINT.md` item 6). The Pond Jetty restoration (game id `pondJetty`) builds it. Before the wetland has docked, Fin sits by the farm pond, with no jetty there.

**The tower ruin.** `tower_ruin` is the tower (owner-approved lore answer 2, 2026-10-25): one ordinary dry-stone base, changed only by Barnaby's own things once he moves in. The stair opening in the back wall and the lived-in state (camp props, a `Glow` window) are still to build (ART-PLAN A20, ASSETS.md "Barnaby's ruin").

**Shared atlas.** One image, sha256 `d35155ff182a…`, 65 KB, embedded in all five files (5 GPU textures and 5 materials at runtime).
Cells (`paintedAtlas.mjs:9-31`, measured mean colour): plank `#8E5D39`, plank_dark `#664329`, plank_light `#B3895C`, plank_grey
`#8D745A`, tiles `#B66744`, tiles_trim `#984934`, bark `#6A462B`, rings, stone `#AE9F86`, stone_dark `#8A7A64`, wet `#51462D`, rope
`#C09F7A`, metal `#5E5041`, cloth `#698488`, canvas `#CABA9F`, skin `#F2C0A3`, scarf `#C37A48`, blanket `#5B6448`, brass `#C79D47`,
dry-stone blocks `#B6A990`, mossy blocks `#919670`, moss `#6F9055`, paper `#E2D3B4`, and 16 palette swatches. **The atlas is full.**

## 3. Reskinned vegetation (approach C: CC0 Quaternius MegaKit + concept ramps)

Source: `art/reskin/<id>.glb` from `scripts/reskin.mjs` (table of record `scripts/lib/species.mjs`, provenance `art/reskin/SOURCES.md`,
ramps frozen in `art/reskin/concept-stats.json`), copied by `export-composition.mjs`. Bark JPEG 512² opaque (r 1, double-sided),
leaves PNG 512² `MASK`. Far versions: 256², same nodes and pivot, materials bound by name, switched at ≥ 35 u (back at 30) and always
on phones (`composition.ts:212-236`). Crown tint near-white ±6 %, clamped [0.92, 1.08] (composition `tint`).

| Id | Source | Ramp | H | Tris (far) | Canopy pivot | Composed (mean scale) | Status | Issues |
|---|---|---|---|---|---|---|---|---|
| tree_pine_a | Pine_5 | fir | 2.55 | 1,188 (477) | 0.394 = 0.154 × H, `Crown`>`Canopy` | 207 (0.94) + farm pines | ok owner-approved | Low pivot (crown base is real); farm firs reach 4.1 u |
| tree_pine_b | Pine_1 | fir | 1.97 | 1,192 (475) | 0.634 = 0.32 × H | 261 (0.91) | ok | — |
| tree_round_a | CommonTree_1 | oak | 2.30 | 2,792 (971) | 0.715 = 0.31 × H | 36 (0.70) + farm | ok | — |
| tree_round_b | CommonTree_2 | beech | 2.30 | 3,392 (720) | 0.845 = 0.37 × H | 50 (0.71) + farm | ok | — |
| tree_spread | TwistedTree_3 | maple | 1.92 | 3,460 (980) | 0.213 = **0.111 × H** | 15 (0.66) | rev | Trunk-tip artefact: bark to 1.634 u (85 % H) inside a crown that sways about a pivot 0.21 u up; far keeps 29 % of the cards; a known defect on the V1 register (ART-PLAN P2-4; pivot band 0.25-0.45 × H) |
| tree_sapling | CommonTree_5 | sapling | 1.34 | 1,138 (359) | 0.450 = 0.34 × H | 20 (0.66) | ok | — |
| tree_birch | CommonTree_3 | birch | 2.30 | 2,648 (931) | 0.613 = 0.27 × H | 51 (0.70) | ok | Lit stop `#B5B043` is the most lime green in the set |
| tree_fruit | CommonTree_1 + 12 apple cards | apple | 1.90 | 2,840 (995) | 0.613 = 0.32 × H | 0 (game fruit trees, orchard) | ok | Untinted; overlay material 256² |
| tree_oak_autumn / tree_beech_autumn / tree_birch_autumn | geometry of round_a / round_b / birch | rust 22° / amber 36° / gold 48° | 2.30 | as their source | as source | 5 / 7 / 4 | ok | — |
| bush_a / bush_berry / bush_flowering | Bush_Common (+30 berry cards) / Bush_Common_Flowers | bush leafy / bush flowering | 0.90 | 600 / 600 / 599 | — | 33 / 23 / 18 + farm `BUSHES` | ok (flowering owner-approved) | — |

## 4. Plant kit (approach D: code-painted cut-out cards, `MASK` cutoff 0.3–0.6, single-sided material, two-sided by duplicated faces)

Source: `art/scripts/lib/plantkit.mjs` (`node plantkit.mjs <out>`), placed by `composeBlueprint` (`lib/terrain.mjs` `COVER`), tested by
`tests/plantkit.test.mjs`, `cover.test.mjs`, `crops.test.mjs`. All ok (living-ground PR #41, trees PR #52).

| Id | H | Tris | Tex | Composed |
|---|---|---|---|---|
| grass_short / grass_tall / grass_seedhead | 0.15 / 0.42 / 0.55 | 12 each | 256×128, 256² | 1,392 / 1,854 / 317 |
| clover_patch | 0.09 | 12 | 256×128 | 650 |
| flower_daisy / buttercup / poppy / cornflower | 0.22 / 0.20 / 0.30 / 0.27 | 8 each | 128² | 471 / 329 / 386 / 516 |
| perennial_lavender / foxglove / oxeye | 0.38 / 0.72 / 0.45 | 16 / 12 / 12 | 256², 128×256 | 90 / 45 / 69 |
| fern_clump | 0.37 | 36 | 128×256 | 934 |
| shrub_low / shrub_mound (bracken) / shrub_heather | 0.32 / 0.40 / 0.25 | 36 / 24 / 36 | 256² | 106 / 372 / 220 |
| crop_sunflower_1–3 | 0.22 / 0.64 / 1.17 | 56 / 24 / 36 | 128×64 → 512² | game `CropPlants` (`Crops.tsx:266`); since 2026-10-25 the garden crops' treatment: a seedling cluster, then three plants filling the plot (two in front, one behind); each head is its own card facing the default camera (45°) with a green back (the old crossed face-on + profile cards sliced each head: the owner's "looks broken") |
| crop_lavender_1–3 | 0.21 / 0.30 / 0.52 | 56 / 36 / 36 | 128×64 → 512×256 | game `CropPlants`; a tuft cluster, then three bushes filling the plot (0.86) |
| crop_<radish, carrot, wheat, lettuce, tomato, pumpkin, blueberry, cranberry>_1–2 | 0.14–0.23 / 0.18–0.72 | 56 / 8–36 | 128×32 → 256² | game `CropPlants`; stage 1 a cluster of seven seedlings across the plot, stage 2 one plant in the middle (49–77 % of the ready height), in the Meshy ready stage's greens (the ready stage is in §1) |
| flowerbed | 1.12 × 0.44 × 0.84 | 545 | 512×256 + `COLOR_0` soil/stones | game `FlowerBed` (`Nature.tsx:236`, ×0.85) — rev minor: edging stones are flat `COLOR_0` lumps |

## 5. Flat procedural GLBs (approach E on a placed object = stand-in)

| Id | Used by | Size | Tris | Materials | Status | Issues |
|---|---|---|---|---|---|---|
| sheep | `Animals.tsx:159` (meadow flock) | 0.70 × 0.74 × 0.81 | 620 | `DeepWarmInk`, `WarmIvory`, `SoftCream` flat | rev | The only flat animal; faceted wool |
| grass_tuft | composition meta only (0 instances) | 0.15 × 0.26 × 0.26 | 60 | `COLOR_0` | dep | Replaced by the kit |
| flower_head | composition meta only (0 instances) | 0.10 × 0.08 × 0.10 | 20 | `COLOR_0` | dep | Replaced by the kit |

## 6. Baked data (no texture)

| Id | What | Tris | Status | Notes |
|---|---|---|---|---|
| piece_main … piece_islet (8) + `.height.bin` | the blueprint island pieces, `COLOR_0` Golden-afternoon lawn/stone paint, skirts `skirt_<neighbour>` | 37,526 in all (main 7,058) | ok v5 (underside taper) | `bake-pieces.mjs`, `tests/bake.test.mjs`; grids 0.25 u, NaN off the top |
| paths_<piece> (8) | soft-edged path ribbons, one node per run, `BLEND`, `COLOR_0` RGBA, +0.035 u | 7,452 in all | ok | MAIN's own layout.ts dirt paths are not included (the game draws them) |
| water_main / _wetland / _highland + maps + `water.json` | water meshes (flat still surfaces, ribbons, falls, a depth-only fall skirt, empty mist / steam nodes) on one untextured `Water` placeholder; baked RGBA8 maps `water_<piece>.map.bin` + the shared RG8 `water_noise.bin` | ≤ 1,500 per piece (349 / 328 / 104) | merged (#65) | `bake-water.mjs`, `tests/water.test.mjs`; contract class `water_surface` (V1, approach W: baked data) |

## 7. Composition kinds (`art/config/composition.pieces.json` → `src/world/composition.data.ts`)

Per piece, items (trees / shrubs / rocks / flowers / grass): main 1 / 29 / 0 / 10 / 387 · meadow 61 / 99 / 4 / 567 / 845 · wetland
158 / 130 / 29 / 492 / 699 · cottage 72 / 81 / 7 / 224 / 385 · highland 165 / 229 / 50 / 792 / 823 · orchard 74 / 69 / 0 / 257 / 310 ·
grove 105 / 71 / 10 / 283 / 345 · islet 20 / 64 / 54 / 215 / 419 (`composition.meta.ts`). 656 trees, 71 % conifer. 26 path runs.
Withheld (12 rocks and 2 tufts) and excluded groups are listed in the JSON.

## 8. Game-drawn procedural meshes (`src/world`, no GLB)

| What | Where | Status | Note |
|---|---|---|---|
| Pond, stream, waterfalls, lake, brooks | `Water.tsx` | stand-in | Legacy `sin()` shaders; replaced by the water revamp (P0-2) |
| Pond bank disc, 11 stones, 3 lily pads, 7 cone reeds | `Water.tsx:159-197` | stand-in | Bank disc goes with the revamp; stones/pads/reeds → painted kit |
| Stream footbridge | `Water.tsx:318` | stand-in | → painted procedural (P1-2) |
| Fences | `Structures.tsx:285` | stand-in | Largest flat element in view → painted kit |
| Stepping stones | `Structures.tsx:317` | stand-in | → painted kit |
| Dirt paths (layout.ts) | `Structures.tsx:337`, `MainIsland.tsx:109` | stand-in | `#C8B08E`, no soft edge; → art ribbons (P1-3) |
| Meadow shelter | `Structures.tsx:455` | stand-in | `shelter` id exists in `ASSETS.md`, no model |
| Grove log, mushrooms | `Structures.tsx:498, 483` | stand-in | → painted kit |
| Cranberry bed | `WildIsles.tsx:133` | stand-in | → plant kit crop + soil tokens |
| Wetland lily pads | `WildIsles.tsx:113` | stand-in | → kit cards |
| Wetland reeds | `WildIsles.tsx:70` | keep | Liked by the owner; keep |
| Heather blobs, wildflower specks, grass tufts | `WildIsles.tsx:222`, `Nature.tsx:271, 325` | keep fallback | Only when the composition is off |
| Tree, bush, rock, building, animal, crop shells | `Nature.tsx`, `Structures.tsx`, `Animals.tsx`, `features/*Models.tsx` | keep fallback | Drawn until a model loads or if it fails |
| 8 crops (radish, carrot, wheat, lettuce, tomato, pumpkin, blueberry, cranberry) | `Crops.tsx` (×1.45) | keep fallback | Replaced by `crop_<id>_<1|2|3>` (2026-10-25: kit stages 1–2, Meshy ready stage); drawn only until a model loads. The cranberry's `WetBed` water goes with the fallback: the wet cranberry bed asset is still open (P0-1) |
| Visitor stand-ins | `features/visitorModels.tsx` | stand-in | Only the hare matters now (lore C4/C6); Síofra as herself is the one other model (owner-approved lore answer 5, 2026-10-25; ART-PLAN A19) |
| Cloud sea + drift clouds | `Backdrop.tsx:34-82` | stand-in | Beige puffs; → painted sea (LOOK-PORT 3–4) or retint |
| Rise puffs | `Rising.tsx:21` | stand-in | Same material as the clouds |
| Distant isles | `Backdrop.tsx:84` | rev | Flat `makeIsland` + `RoundTree`; the repaint (P3-6) keeps them land and trees only, with no building, light, smoke, path or boat (owner-approved lore answer 11, 2026-10-25) |
| Birds | `Backdrop.tsx:121` | keep | Ink triangles, full motion only |
| Fireflies, smoke, porch light, lighthouse beam, bees | `Fireflies.tsx`, `Farmhouse.tsx:39, 66`, `Structures.tsx:362`, `bees.ts` | keep | Hand-tuned colours; align to B.2 glow tokens |
| SkyBridge | `Structures.tsx:412` | dep | Dead code (no caller) |
| Sky (CSS gradient, SVG mountains, sun, moon, stars) | `app.css:19`, `SkyArt.tsx` | keep until the sky dome | Hidden once LOOK-PORT step 3 makes the canvas opaque |
