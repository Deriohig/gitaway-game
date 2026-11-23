# Flowers and living ground: design

> **Pointer (2026-10-24).** The rules this spec settled are carried in [../ASSET-RULES.md](../ASSET-RULES.md) §2–3; the kit is in [../ASSET-CATALOG.md](../ASSET-CATALOG.md) §4. [../ART-BIBLE.md](../ART-BIBLE.md) is the source of truth for the look.

Date: 2026-10-22 · Status: approved by the owner in conversation ("Yes and build") · Part 1 of the world art-cohesion pass

## Why

The owner's review of the world:

- the flowers look weird (the meadow drifts and the flower crops);
- the lawns are one solid colour;
- painterly models and flat low-poly assets are mixed and should be pulled together;
- the reeds in the water work;
- big open stretches of grass should have patches of different grasses and perennials so they feel alive;
- the poor, low-quality assets should go, since there are so many good painterly ones.

What the audit found (2026-10-22, the game build at main 6c18227):

- **Lawn.** The colour is baked per vertex as 3 close greens blended by noise with a 15 u patch, on islands about 18 u wide. Its p5–p95 band is narrow (`#6c9b66`…`#94c07c`), so it reads as one colour.
- **Grass.** About 1 tuft per u² (`grass_tuft`, 60 tris), all one olive that does not match the lawn's blue-greens.
- **Flowers.** `flower_head` is a 20-tri white blob, tinted per instance and floating 0.075 u up, with no stem or leaf. It does not move.
- **Flower crops.** No `crop_*` models exist, so the game draws all 10 crops as stand-ins.
- **Flower beds.** The game draws them as stand-ins: a raised disc holding 11 pebbles.
- **Reeds.** The wetland reeds work through silhouette, density, tint variation and wind lean. They have no texture.

## The three parts of the cohesion pass

1. **Flowers and living ground** (this spec).
2. **Painterly replacements**: trees, bushes, sheep and plot, plus models for the other 8 crops.
3. **Clean-up**: remove the game's duplicate and weak stand-ins with the game session (the blob bushes, the pond's spike reeds, the dirt path drawn over the art paths, the pebble flower stand-ins).

## Decisions

- **Character by area** (owner: "mixed by area"):
  - the farm (main island) is a tidy lawn;
  - the outer isles (meadow, wetland, cottage, highland, orchard, grove, islet) are wild and flowery.
- **Approach C** (owner): build a painterly plant kit in code first, at 0 credits, using the roof-tile method. Then review it in renders. Spend Meshy credits only where something still looks weak, with a credit estimate first and the owner's yes.
- **Crop growth stages** come from the kit for now. Generating dedicated stage assets, possibly with Meshy, is a later follow-up (owner, 2026-10-22).

## Scope

- **Farm.**
  - Short grasses of several kinds everywhere, but sparse.
  - Clover patches 0.5–1.5 u wide, with the odd daisy or buttercup.
  - No tall plants.
  - Every existing clearance is kept: build slots, plots, paths, water and the animal pen.
- **Wild isles.**
  - Tall-grass and seed-head patches 1–3 u across.
  - Wildflower drifts, one or two kinds each.
  - Perennial clumps where plants gather: by rocks, fences, paths, tree bases and water edges.
  - Ferns in the shade of tree groups.
  - Denser rushes and tall grass along wetland water.
- **Flower crops.** Sunflower and lavender at stages 1, 2 and 3: `crop_sunflower_1..3` and `crop_lavender_1..3`.
- **Flower bed.** A painterly `flowerbed` model built from the kit, replacing the game's pebble bed.
- **Out of scope here.** Trees, bushes, sheep and plot, the other 8 crops (part 2), and removing the game's stand-ins (part 3).

## The plant kit (12 types)

| Group | Types | Category and motion | Triangle budget |
|---|---|---|---|
| Grass | `grass_short`, `grass_tall`, `grass_seedhead`, `clover_patch` | `grass` (leans in the wind already) | ≤ 24 |
| Wildflowers | `flower_daisy`, `flower_buttercup`, `flower_poppy`, `flower_cornflower` | `flowers` (to lean: a game change) | ≤ 40 |
| Perennials | `perennial_lavender`, `perennial_foxglove`, `perennial_oxeye`, `fern_clump` | `flowers` (lean) | ≤ 120 |

- **Construction.** Crossed cards (quads) carrying painted cut-out textures. The material is glTF `alphaMode: MASK` and double-sided.
- **Normals.** Each card's normals mostly point up, so plants shade like the ground and show no dark backs.
- **Textures.** Painted in code, one PNG per plant (the colour and the cut-out need an alpha channel): soft brushwork, a root-to-tip gradient, grain, and light from above. The PNG encoder is written in code with zlib, since the art scripts have no PNG dependency.
- **Tint.** Each instance gets a slight tint for variety, through the existing `instanceColor` path.
- **Replacements.** The kit replaces `grass_tuft` and `flower_head`.

## Placement (scatter)

- **Patches, not a sprinkle.** A seeded noise mask divides open ground into soft-edged patches. Each patch has one main mix: short grass, clover, tall grass, seed-heads or a flower drift. Plain lawn shows between patches.
- **Densities.**
  - Farm: about 2–4 plants per u² overall.
  - Wild isles: about 8–15 per u² inside patches.
- **Cap.** At most 8,000 plants and 80,000 kit triangles per piece.
- **Pipeline.** The scatter is generated in the art pipeline (the proof's populate and export-composition) and shipped through the existing composition files, so the game draws it with its current instancing.
- **One patch mask.** The same mask drives the lawn colour, so the ground under a patch matches its plants.

## Lawn colour (re-bake)

- Colour patches 3–5 u across instead of 15.
- Five greens instead of three, adding a yellow-green and a deep green.
- Darker clover tones under the farm's clover patches.
- Paler, worn grass along farm paths and around buildings.
- Warmer, yellower ground under the wild isles' tall-grass patches.
- Colour only: the height grids stay byte-identical.

## Game changes (through the game session)

1. **Flowers lean.** The `flowers` composition category leans in the wind like `grass` (a one-line change in `Composed.tsx`'s motion mapping).
2. **Flower bed model.** `FlowerBed` loads the `flowerbed` model through `<Asset>`, with today's bed as the fallback.
3. **Composition data.** The regenerated data goes into the game's data files the same way as the original composition PR. Who runs `npm run composition` is agreed with the game session.

No game change is needed for the flower crops (`CropPlants` already asks for `crop_<id>_<stage>`), the new plant models or the lawn colours.

## Checks

Each new test is written to fail first and is reported RED, then GREEN.

- **Kit:**
  - every type within its triangle budget;
  - MASK alpha, double-sided, upward normals;
  - the texture has an alpha channel and power-of-two size;
  - the generator is deterministic.
- **Scatter:**
  - each piece within its plant and triangle caps;
  - nothing on paths, plots, build slots or water;
  - no tall types on the farm;
  - the plants are patchy: neighbours share a type far more often than a random scatter would.
- **Lawn:**
  - height grids byte-identical;
  - the colour spread (p5–p95) widened past a threshold;
  - at least 4 distinct tones per island.
- **Flower crops and flower bed:**
  - each crop fills the 0.94 × 0.94 plot with y = 0 at the soil, within budget, under the `crop_<id>_<stage>` names;
  - the flower bed matches the stand-in's footprint.
- **Existing suites.** All existing art suites stay green; the game's vitest and e2e runs are done locally or by the game session.
- **Renders.**
  - Game-camera before and after at the default distance and at distance 14.
  - Close views of the farm lawn, a meadow, a wetland edge and the garden.
  - The same in-game audit shots as 2026-10-22 (`shots.sh`), so the comparison is like for like.
- **Performance.** Plant and triangle counts per piece are reported, plus a phone frame check from the game session.

## Review gate and Meshy

Once the work is in renders, the owner reviews it. Any type that still looks weak (a perennial clump or a crop stage) goes on a list with a credit estimate. Nothing is spent without the owner's yes.

## Delivery

- **Branch.** `art/living-ground` (worktree `gitaway-art-ground`, from main).
- **PR.** One PR for the whole part, to keep CI minutes down: the kit, the scatter, the lawn re-bake, the flower crops and the flower bed.
- **Game session.** A short brief for its two changes.
- **Follow-ups.**
  - Crop stage assets (possibly Meshy).
  - Parts 2 and 3 of the cohesion pass.

## Build order

1. **Kit.** The PNG encoder, the texture painter, the card builders and the 12 GLBs, with their tests.
2. **Shared patch mask and scatter.** Area rules, clearances, caps and the composition export, with their tests.
3. **Lawn re-bake** from the same mask, with its tests.
4. **Flower crops and flower bed**, with their tests.
5. **Renders and in-game shots**, then the review with the owner.
6. **The PR**, plus the game-session brief.
