# Painterly trees and bushes: design

> **Pointer (2026-10-24).** The rules this spec settled are carried in [../ASSET-RULES.md](../ASSET-RULES.md) §3; the built set is in [../ASSET-CATALOG.md](../ASSET-CATALOG.md) §3. [../ART-BIBLE.md](../ART-BIBLE.md) is the source of truth for the look.

Date: 2026-10-22 · Status: revision 2 (the reskin route) supersedes the Meshy-per-species approach below · Part 2 of the world art-cohesion pass (part 1: `2026-10-22-flowers-living-ground-design.md`, merged as PR #41)

## Revision 2: the reskin route (owner, 2026-10-22)

Read this first. Where it conflicts with the original design below, this section wins. Everything it doesn't mention still stands: the "Why", the decisions on look and variety, the biome mixes, the integration and the testing, except where amended here.

### What changed and why

- **The Meshy step failed.** Gate A spent 144 credits on 12 concepts; the owner approved all of them. Gate B-1 spent 180 credits on 12 models.
  - At about 900 triangles, Meshy turned the concepts' soft leaf clumps into angular plates, with dark, muddy textures.
  - The blossom, berries and apples were not painted at all.
  - Owner: "Honestly, they all look absolutely terrible."
  - The owner then proposed "get trees from free assets and reskin them".
- **The free source.** Quaternius **Stylized Nature MegaKit**, free Standard tier: 68 models, **CC0 1.0** (`License_Standard.txt`), https://quaternius.itch.io/stylized-nature-megakit.
  - Downloaded with the owner's OK to `~/Downloads/assets/quaternius-megakit/`. It is never copied into the repo; provenance goes in `art/reskin/SOURCES.md`.
  - Its trees are leaf-card crowns over branched bark, with separate bark and leaf materials.
- **The probe.** `art/scripts/reskin.mjs` (commit 3babd98) repaints a source model in the concepts' palette. It:
  - gradient-maps leaves and bark from the concept images, with painted per-card leaf shading and a shade-to-sun atlas by crown height;
  - adds soft grain (never posterised);
  - thins leaf cards interior-first;
  - splits `Canopy` (or `Crown` > `Canopy`);
  - normalises the height.
- **Seen in game, the owner said: "Firs + bush yes, redo broadleaf".**
  - The repainted fir (Pine_5) and the flowering bush (Bush_Common_Flowers) are approved as they are.
  - The broadleaf probe was "dark, small and scrappy"; it is being redone fuller and brighter, with hidden inner bark removed.
- **The approved concepts** (`art/meshy/<folder>/source/concept_1.png`) stay as the colour references for every ramp. The Meshy raw models are abandoned; `source/` is git-ignored.

### Species (revision 2)

| id | source (MegaKit) | recipe | status |
|---|---|---|---|
| `tree_pine_a` (fir) | Pine_5 | fir ramp, `Crown` > `Canopy` | approved |
| `tree_pine_b` (fir variant) | Pine_1 or Pine_4 | the same fir ramp, a different silhouette. The free tier has no Scots pine; this gives conifer variety instead. | to build |
| `tree_round_a` (oak) | CommonTree (fullest broad crown) | oak ramp, warm bark | probe round 2 |
| `tree_round_b` (beech) | CommonTree (tall dome) | beech ramp, silvery bark | probe round 2 |
| `tree_spread` (maple) | TwistedTree (broad, irregular), recoloured green | maple ramp | to build |
| `tree_sapling` | the slimmest CommonTree, thinned, 1.34 u | oak ramp, lighter | to build |
| `tree_birch` | a slender CommonTree | birch ramp: light yellow-green leaves, white bark with dark marks (bark repainted) | to build |
| `tree_fruit` (apple) | the oak model + painted apple cards in `Canopy` (the overlay step) | oak ramp | to build |
| `tree_oak_autumn` / `tree_beech_autumn` / `tree_birch_autumn` | the same models, autumn ramps (rust / amber / gold) | recolour | to build |
| `bush_a` (leafy) | Bush_Common | bush leafy ramp | to build |
| `bush_flowering` | Bush_Common_Flowers | approved as is | approved |
| `bush_berry` | Bush_Common + painted berry clusters (the overlay step) | bush leafy ramp | to build |
| `shrub_low`, `shrub_mound` (bracken), `shrub_heather` | code-built card shrubs (Task 4, done) | — | done |

- **Dropped from this pass:** `tree_willow`, since no free source has a weeping willow. The wetland's water edge gets birch instead. Willow is a follow-up, as a kit-bash or a new source.
- **Biome mixes:** unchanged, except that the wetland rule becomes "birch within 1.5 u of water". Its test S7 becomes "the wetland has ≥ 8 birches near water". S2 ("willows only near water") is dropped.

### Budgets (revision 2)

- **Triangles:**
  - fir ≤ 1,200 (Pine_5: 1,188);
  - broadleaf ≤ 2,000, after hidden-bark removal and interior-first thinning, with probe round 2 setting the real figure;
  - bushes ≤ 600;
  - card shrubs ≤ 120.
- **Expected world total:** about 1M tree triangles (658 trees at about 1,500 on average). That is heavier than revision 1's estimate of 600k. The frame-time check (game) and the far-LOD fallback stay, and are more likely to be needed.
- **Textures:** leaves PNG (alpha) ≤ 512², bark JPEG ≤ 512².
- **Draw calls:** each tree has two primitives (bark plus leaves), so about 2× the instanced batches of one-primitive trees. The batch count is measured with the frame time.

### Credits

- **Total spent:** 324, from 1,284 to 960. That is 144 on concepts (kept as references) and 180 on models (abandoned).
- **Revision 2 spends no credits.**

### Revision 2 amendments (implementation)

What the build settled, by the controller's rulings and the owner's choices. Where these conflict with the budgets above or the original design below, these win.

- **Caps** (ruling R15): broadleaf 3,500 (`tree_round_a`, `tree_round_b`, `tree_spread`, `tree_fruit`), birch 3,000, sapling 1,500, fir 1,200 (both conifers), bushes 600, card shrubs 120. The autumn accents share their source's cap. Two-sided broadleaf leaves cost twice the triangles (duplicated faces), so the first estimate of 2,000 could not be met at the 60 % card floor.
- **Far versions**, done art side by the owner's choice ("Add far versions", task 11b): every tree has an `<id>_far.glb`, named by `assets[id].far` in the composition JSON.
  - Targets: broadleaf ≤ 1,000 triangles, the sapling and the conifers ≤ 500. Built: `tree_round_a` 971, `tree_round_b` 720, `tree_spread` 980, `tree_birch` 931, `tree_fruit` 995, `tree_sapling` 359, `tree_pine_a` 477, `tree_pine_b` 475.
  - Same `Crown` / `Canopy` nodes and pivot as the near model; the materials keep the near names. Textures (ruling R20): the near images box-downsampled to 256², so each far file is self-contained.
  - The game switches per piece batch at ≥ 35 u with hysteresis, and uses the far versions everywhere on phones.
- **Tint clamp** (ruling R18): the per-tree crown tint is clamped to [0.92, 1.08] per channel. The plan's formula reached 1.0918 on 18 of 658 trees; the clamp trims only their warm / cool shift, and the ±6 % value is untouched.
- **Canopy pivot range** (ruling R22): 0.05–0.8 × the height (`tests/trees.test.mjs` T4). The low pivots of `tree_spread` (0.111) and `tree_pine_a` (0.154) are real crown bases; the sway is checked in motion in the game.
- **`bush_flowering` recoloured** (owner, "Yes, recolour it"): the R1 colour method, its cards and blossom kept, and its sha256 re-pinned.
- **Measured performance** (task 11, a real GPU: GTX 1660 S, Windows Chrome):
  - Desktop: branch − main ≈ +0.2 ms per frame (noise about 1 ms).
  - Mobile profile (4× CPU throttle on the desktop GPU): +1.5 to +2.9 ms, rAF median +1.0 ms. A phone GPU likely pays more, hence the far versions.
  - Triangles: 616k → 1.52M plain, 948k → 2.79M in a shadow frame. Draw calls: 964 → 995 (shadow frame 1,578 → 1,643).
  - The proof's draw-call budget is re-baselined to ≤ 920 (ruling R21): the binding gate is the frame time, not the calls.
- **Removed:** `VARIANT_ASSET` and `canopyTint`. Each composed tree carries its species `asset`, and the crown tint is the near-white `texturedTint` (see Integration).

## Why

The owner's verdict on today's trees and bushes, against the hero tree and the farmhouse (both Meshy, painted textures), was all four of:

- flat colour, no texture;
- blobby, faceted shapes (lumpy polygon crowns, stacked-cone pines);
- too samey: the forests read as copies of a few trees;
- bushes worst of all.

What exists (main fda27b8):

- **One painterly tree.** `hero_tree`: Meshy, 5,105 tris, one textured material, a `Canopy` node. It is not touched by this work.
- **Flat code-built trees** (`lib/plants.mjs`, COLOR_0 only, no texture):
  - `tree_round_a` (568 tris), `tree_round_b` (388), `tree_spread` (648), `tree_sapling` (140);
  - `tree_pine_a` (184) and `tree_pine_b` (216), with `Crown` > `Canopy`;
  - `tree_fruit` (584, with 10 fruit in its `Canopy`).
- **Flat shrubs and bushes:**
  - `shrub_mound` (80 tris) and `shrub_low` (100);
  - `bush_a` (320) and `bush_flowering` (460): icosahedron lobes;
  - the game's own procedural blob bushes (`Nature.tsx` `Bush`) and the highland heather blobs (`WildIsles.tsx` `Heather`).
- **Composition** (`art/config/composition.pieces.json`): 658 trees and 773 shrubs across the isles.
  - Trees: `pine_b` 231, `pine_a` 193, `round_a` 82, `round_b` 78, `spread` 38, `sapling` 36.
  - Shrubs: `shrub_mound` 544, `shrub_low` 155, `bush_a` 41, `bush_flowering` 33.
  - About 192k tree triangles and 87k shrub triangles in total.
- **The farm** (main) draws its own trees and bushes from `layout.ts`:
  - 8 static trees, with the hero tree as index 0;
  - up to 8 fruit trees;
  - 8 blob bushes.
  - `RoundTree` picks `tree_round_a` or `tree_round_b` by seed, and `PineTree` picks the pines.

## Decisions (owner, 2026-10-22)

- **Broadleaf look: the hero-tree family.**
  - Crowns of separate, clumped leaf pads with painted leaf texture.
  - A little branch showing between the pads.
  - Bark-textured trunks.
- **Pines: painted tiers.** Ragged, uneven tiers of painted needles, drooping tips and a visible trunk.
- **Bushes: two tiers.**
  - Proper bushes are leaf-pad bushes in the hero family.
  - The low forest-edge mounds become painted leaf-card shrubs that blend into the part-1 ground cover.
- **Variety: biome mixes plus autumn accents.**
  - About 8 species, mixed per isle.
  - A sprinkle of warm-coloured accent trees.
- **Approach C: Meshy for each species.**
  - The owner chose this over code-built shapes, whether with code-painted textures or with the hero tree's own texture.
  - Credits are spent in two gated steps (below), and every re-roll is asked about separately.
- **The farm-tree scale gets settled too.** The farm's static trees are drawn at s × 1.0, about 2.2–3.7 u tall, while the same models in the composition are drawn at s × 0.62 (round) or × 0.72 (pine), about 1.6 u. The game session renders the farm both ways and the owner picks.

## Scope

### Meshy models (12)

| id (kept or new) | Species | Role | Triangle target / cap |
|---|---|---|---|
| `tree_round_a` (kept) | young oak: clumped pads, less gnarled than the hero | broadleaf, farm and isles | 900 / 1,200 |
| `tree_round_b` (kept) | round beech | broadleaf | 900 / 1,200 |
| `tree_spread` (kept) | spreading field maple | broadleaf | 900 / 1,200 |
| `tree_sapling` (kept) | sapling | broadleaf | 400 / 600 |
| `tree_birch` (new) | birch: white bark, airy crown | broadleaf | 900 / 1,200 |
| `tree_willow` (new) | weeping willow | broadleaf, water's edge | 900 / 1,200 |
| `tree_fruit` (kept) | apple tree with red apples in the crown | farm fruit trees and the orchard | 900 / 1,200 |
| `tree_pine_a` (kept) | fir | conifer | 900 / 1,200 |
| `tree_pine_b` (kept) | Scots pine: red-brown upper trunk, flat-topped crown | conifer | 900 / 1,200 |
| `bush_a` (kept) | leafy round bush | bush | 500 / 600 |
| `bush_flowering` (kept) | bush with pink and white blossom | bush | 500 / 600 |
| `bush_berry` (new) | bush with red berries | bush | 500 / 600 |

Kept ids mean the game's own references (`RoundTree`, `PineTree`, fruit trees, `Backdrop`) pick the new models up with no game change.

### Free extras (0 credits)

- **Autumn accents.** Hue-shifted copies of three textures: `tree_oak_autumn` (rust, from `tree_round_a`), `tree_beech_autumn` (amber, from `tree_round_b`) and `tree_birch_autumn` (gold, from `tree_birch`).
  - The recolour keeps every painted stroke.
  - It is never a palette flatten (see the texture-direction rule).
- **Low tier, code-built cards** (part-1 `lib/plantkit.mjs` method: painted alpha-cut cards, MASK, grainy):
  - `shrub_low`, a low leafy shrub;
  - `shrub_mound` (id kept), now bracken;
  - `shrub_heather` (new), for the highland.
  - Each is ≤ 120 tris.

### Biome mixes

Every tree keeps its position and scale. Only the species changes, picked on its own RNG stream (`'species'`) so no other list moves.

| Piece | Mix |
|---|---|
| meadow | scattered oak, beech, maple and saplings; flowering bushes |
| wetland | willows and birch within 1.5 u of water (the lake, channels or pond); fir behind |
| highland | mostly fir and Scots pine; birch on the upper ledges; heather |
| grove | oak and beech among the existing ferns |
| orchard | the game's apple rows; beech at the edges |
| cottage | mixed broadleaf; flowering bushes |
| islet | windswept Scots pine; bushes |
| main | the game's own trees (oak, beech, apple); the hero tree as is |

- **Autumn accents** are 5–10% of the broadleaf trees on the isles, and none on the farm.
- **Bushes:** the composition's 74 proper bushes split leafy, flowering and berry by biome. The forest-edge mounds become `shrub_low`, `shrub_mound` (bracken) or `shrub_heather` by biome.

### Out of scope

- The hero tree.
- Sheep, the plot, the other 8 crops and crop growth stages (later in part 2, or follow-ups).
- Removing the remaining game stand-ins (part 3).

## Pipeline

1. **Concepts: 12 × 12 = 144 credits.**
   - `meshy image-to-image`, gpt-image-2, with style references.
   - References: the hero tree concept (`gitaway-assets/art/meshy/hero_tree/source/concept_1.png`) and the farmhouse concept (`farmhouse/source/concept_gpt.png`).
   - Each concept: one object, an elevated three-quarter view, even light, a plain background, the painted finish.
   - **Gate A:** the owner sees all 12 concepts side by side before any model is made. A concept is re-rolled only on request.
2. **Models: 12 × 15 = 180 credits.**
   - `meshy image-to-3d`, smart-topology, `--target-polycount` from the table, textured, no PBR, 2k texture.
   - At most 3 requests at once.
   - `meshy api GET /balance` is logged before and after every step, and any mismatch against the expected price is reported.
3. **Finishing: 0 credits** (`scripts/meshy/finish.mjs`).
   - Height per species, matching today's models so the composition scales still fit: round 2.3 u at scale 1, pines 2.55 / 1.97, sapling 1.34, bushes about 0.9 × 0.6.
   - `--canopy` splits a `Canopy` node pivoted on the trunk axis. The conifers get the `Crown` > `Canopy` structure the game's conifer check reads.
   - Trunk base at the origin.
   - meshopt simplification only if the result is over its cap.
   - Texture 512² JPEG q85 with `--compact`. Any model that reads blotchy at the default camera goes to 1024², never flattened. sRGB maps are stored linear (the iOS rule).
   - The autumn recolours and the card shrubs are made here.
4. **Gate B.**
   - Turntables (`scripts/meshy/turntable.mjs`) and in-game shots, at the default camera, at least three orbit angles and a close orbit.
   - Weak models are listed for the owner. Each re-roll costs 27 credits and needs the owner's yes.

**Credits:** 324 in total, from the last logged balance of 1,284. Re-roll allowance: up to 4 × 27 = 108, each asked separately.

The `image-to-image` step was blocked by the session's permission check once before, so the owner may need to approve the command when it runs.

## Integration

### Art side

- **`lib/composition.mjs`:**
  - The tree and shrub asset records become textured models: one material with a base-colour texture, plus the `Canopy` or `Crown` split.
  - Each composed tree carries its species id as `asset` (`lib/species.mjs`); the old `VARIANT_ASSET` map and the canopy-pivot table are removed.
- **Per-tree colour variation.**
  - The old `canopyTint` multiplied each crown by a green, which muddies a painted texture. It is removed.
  - `texturedTint` gives a near-white multiplier instead: ±6% value, with a slight warm or cool shift, each channel clamped to [0.92, 1.08] (ruling R18), kept on the crown only.
  - `tree_fruit` and the bushes stay untinted, as now.
- **`composeBlueprint`:**
  - Species are picked by the biome rules on the `'species'` stream.
  - The autumn picks are on their own stream too.
  - The shrub belt maps to the card shrubs.
- **Exports:** `export-composition.mjs`, `publish-models.mjs` and `manifest.json` get the new ids.
  - The Meshy sources live under `art/meshy/<id>/`, with the `source/` folder git-ignored as before.
  - The prompts and finish arguments are committed.

### Game side (brief to the game session, same flow as part 1)

1. Regenerate the composition data (`npm run composition`).
2. Draw the blob bushes as `<Asset id="bush_a|bush_flowering|bush_berry">`, with today's procedural bush as the fallback.
3. Update any game tests that expect flat-coloured tree or shrub models.
4. Settle the farm-tree scale: render the farm at s × 1.0 and at the composition's × 0.62 / 0.72, and the owner picks.
5. Only if the frame-time check fails: a simplified far version (LOD) of each species.

**Wind:** unchanged. Broadleaf crowns are a `Canopy` node, conifers `Crown` > `Canopy`, and bushes stay still.

## Budgets and performance

- **Triangles:** the trees go from about 192k to about 600k (658 × ~900); the shrubs stay about the same.
- **Draw calls:** one instanced batch per asset per piece.
  - The composition goes from 10 tree and shrub assets to 17: 8 trees, 3 autumn variants, 3 bushes and 3 card shrubs.
  - Not every asset grows on every piece, so the worst case is about 50 more batches across the whole docked world, plus a shadow pass for the trees.
  - Measured with the frame time below.
- **Textures:** about 14 × 512² ≈ 20 MB of GPU memory.
- **Measured:** frame time in game against main, on desktop and the phone profile. Above about 2 ms per frame, the far-version fallback goes in (game step 5).

## Testing (red-green: each new test fails before its change)

- **Models.** For every new model:
  - the node named after the id, with `Canopy` (or `Crown` > `Canopy`) and a canopy pivot y of 0.05–0.8 × the height (ruling R22);
  - the triangle cap, with the texture at 512² or 1024² and stored linear;
  - the height in its species range, with the trunk base at y 0.
- **Composition:**
  - positions and scales unchanged against today's composition;
  - willows only within 1.5 u of water;
  - the highland ≥ 70% conifer;
  - autumn 5–10% of isle broadleaf, and none on main;
  - every species placed somewhere;
  - deterministic.
- **Card shrubs:** the part-1 kit checks (budget, MASK PNG, deterministic, on the ground).
- **Visual:**
  - Gate A and Gate B sheets.
  - I check at least three orbit angles plus the default camera before the owner sees anything.
  - Before/after sheets as in part 1.
- **Game:** vitest plus the desktop and mobile Playwright suites run locally before the PR, and one PR.

## Where

Worktree `/home/me/Projects/gitaway-art-trees`, branch `art/painterly-trees`, from main fda27b8 (which includes part 1). The other session works in the main tree, so all art work stays in this worktree.
