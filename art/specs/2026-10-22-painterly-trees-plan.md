# Painterly Trees and Bushes Implementation Plan

> **Pointer (2026-10-24).** Executed plan, kept as the record; current rules in [../ASSET-RULES.md](../ASSET-RULES.md) §3 and [../ART-BIBLE.md](../ART-BIBLE.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** replace the flat code-built trees, shrubs and bushes with 12 painterly Meshy species, 3 autumn recolours and 3 code-built card shrubs. Species are mixed per isle; positions and scales stay frozen.

**Architecture:**
- Meshy concepts → models → `finish.mjs`, which gives each model its `Canopy`, or `Crown` > `Canopy` on conifers.
- `composeBlueprint` assigns species with positional hashes, so no existing RNG stream moves.
- `compositionData` exports the asset ids with a near-white crown tint.
- `export-composition` publishes the finished GLBs in place of the `plants.mjs` trees.
- The proof draws the same GLBs, so the composition fixture stays the source of truth.

**Tech Stack:**
- Node 22 ESM.
- `@gltf-transform/core`.
- three 0.160, art-side.
- Meshy CLI 4.4: `meshy image-to-image`, `meshy image-to-3d`.
- Playwright from the game checkout, for renders.

**Spec:** `art/specs/2026-10-22-painterly-trees-design.md` (read it with this plan, its "Revision 2" section first).

## Revision 2 (the reskin route): task changes

- **Done:** Tasks 1–4. The species table and prompts (the prompts are now only a record), Gate A, `--crown`, and the card shrubs. Task 7 steps 1–2, the Meshy models, are done and abandoned.
- **Replaced:** Tasks 5, 6, 7 and 7b give way to R1 and R2 below. The probe already made the tool (`art/scripts/reskin.mjs`, `tests/reskin.test.mjs`, commit 3babd98, plus round 2 for the broadleaf).
- **Carried over, with amendments:** Tasks 8–12.

### Task R1: the production reskin set (0 credits)

**Files:**
- Modify: `art/scripts/lib/species.mjs`.
  - `SPECIES` entries lose `folder` / `finish` and gain `source` (a MegaKit glTF name), `ramp` (the concept folder for the foliage ramp), `barkRamp`, and optional `overlay`: `'apple'`, or `'berry'` for bushes.
  - Drop `tree_willow`.
  - Add `tree_pine_b`'s fir-variant source.
  - `AUTUMN` keeps `{ id, from, hue/ramp }` and is built by `reskin.mjs` with an autumn ramp.
- Modify: `art/scripts/reskin.mjs`.
  - A `--recipe <id>` mode reads `species.mjs`.
  - Add the overlay step: painted apple cards in `Canopy`, berry clusters on bushes, as in the old Task 7b brief, as a function in `reskin.mjs`.
  - Add a birch bark repaint (white with dark marks) and autumn ramps.
- Modify: `art/scripts/tests/trees.test.mjs`.
  - T1 drops the prompt checks and asserts the new table shape.
  - T2–T5 run on `art/reskin/<id>.glb`.
  - Allow two primitives for trees (bark on `<id>`, leaves on `Canopy`).
  - Caps: fir 1,200, broadleaf 2,000 (or the probe round-2 figure), bushes 600.
- Create: `art/reskin/<id>.glb` for every `SPECIES` and `AUTUMN` id, plus `SOURCES.md`.

**Look gate:** a turntable sheet of every model beside its concept, plus a forest sheet. The controller looks first, then the owner sees it (this is the old Gate B-2's model half). No integration before the owner's yes.

### Task R2: proof of fit

- Re-render the whole set in a local game build (swap `public/models`, never committed, then revert), same views as `audit_probe`.
- Fix anything that reads wrong before Task 8: scale versus the farm, canopy pivots, leaf alpha shimmer, shadow cut-outs.

### Amendments to Tasks 8–12

- **Task 8 (species by biome):**
  - The wetland rule becomes birch within 1.5 u of water (no willow). S2 is dropped. S7 becomes "the wetland has ≥ 8 birches within 1.5 u of water, and the highland ≥ 6 birches".
  - S5 drops `tree_willow`.
  - `tree_pine_b` keeps its share as the fir variant.
- **Task 9 (export):**
  - The exporter copies `art/reskin/<id>.glb` (not `art/meshy/...`).
  - C7: trees have two primitives (bark JPEG material on `<id>`; leaves MASK PNG material on `Canopy`), and conifers have `Crown` > `Canopy`. Bushes have one primitive, MASK PNG.
  - C8 caps per revision 2.
- **Task 10 (proof):** ships `art/reskin/*.glb`.
- **Tasks 11 and 12:** unchanged. The frame-time check matters more now, at about 1M tree triangles.

## Global Constraints

- **Where:**
  - Work only in worktree `/home/me/Projects/gitaway-art-trees` (branch `art/painterly-trees`).
  - Touch only `art/` and `public/models/`.
  - Never touch `src/`, `main`, or the main tree `/home/me/Projects/gitaway`.
- **How to run commands:**
  - Shell: write a script to the session scratchpad and run it in WSL with `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-24.04 --cd "~" -- bash -c "tr -d '\r' < $S/x.sh > /tmp/x.sh; bash /tmp/x.sh"`.
  - Node: `export PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH`.
  - gh: `~/.local/bin/gh`.
  - `art/scripts/node_modules` is a symlink to `gitaway-art-meshy2`'s.
- **File ownership:** files written through `\\wsl.localhost` come out root-owned. Run `wsl.exe -d Ubuntu-24.04 -u root -- chown -R $USER:$USER <path>` before node writes to them or before committing.
- **Meshy:**
  - Spend only after the owner's yes at Gate A (concepts, 144 credits) and Gate B-1 (models, 180 credits). Every re-roll (27) is asked about separately.
  - At most 3 concurrent calls.
  - `meshy api GET /balance` is logged before and after every step, and any charge that differs from 12 (image-to-image) or 15 (image-to-3d) is reported.
  - Never use an API key from chat; the CLI is logged in by the owner.
- **Texture:**
  - 512² JPEG q85, with `--compact`.
  - Go to 1024² only for a model that reads blotchy at the default camera. Never palette-flatten or posterise.
  - sRGB maps are stored linear (the iOS rule, already in the proof's `linearStore`).
- **Budgets (triangles, target / cap):**
  - Trees 900 / 1,200; `tree_sapling` 400 / 600.
  - Bushes 500 / 600.
  - Card shrubs ≤ 120.
- **Heights at scale 1:**
  - `tree_round_a`, `tree_round_b`, `tree_birch` and `tree_willow` 2.3 u.
  - `tree_spread` 1.92 u; `tree_fruit` 1.9 u.
  - `tree_pine_a` 2.55 u; `tree_pine_b` 1.97 u.
  - `tree_sapling` 1.34 u.
  - Bushes 0.9 u tall.
- **Positions and scales:** every composed tree, shrub and bush keeps its x, z and final scale (`scale × vscale`). Only its species and yaw may change.
- **Red-green:** every new test is run on the code before its change and must FAIL there; record both runs in the commit message.
- **Renders:** check at least three orbit angles plus the default camera before showing the owner anything.

## Review Focus

1. **Non-green crown parts lost from the `Canopy` split.** Scots pine blue-green, apple fruit, birch catkins: anything outside `--leafHue` stays on the trunk mesh, does not sway and gets no tint. Task 5 test T4: the `Canopy` holds ≥ 85% of each tree's triangles above 45% of its height.
2. **A Meshy ground slab or base disc under a tree or bush.** It would float or z-fight on slopes. Task 5 test T5: the bottom 4% of the height has an xz extent ≤ 30% of the model's width (a trunk, not a plinth).
3. **The tint muddying the painted crowns.** Task 9 test C14: every tree item's tint channel is in [0.92, 1.08]; no shrub item carries a tint.
4. **The autumn recolour bleeding into the bark.** Task 6 test R2: trunk texels differ from the source by mean ΔRGB ≤ 2/255.
5. **The willow and birch rules matching nothing on some seed.** Task 8 test S7: the wetland has ≥ 8 willows and the highland ≥ 6 birches on both seeds.

---

## File map

| File | Responsibility |
|---|---|
| `art/scripts/lib/species.mjs` (new) | the one table of the 12 Meshy species plus the 3 autumn variants: id, Meshy folder, kind, height, polycount target, cap, finish switches |
| `art/meshy/<folder>/concept_prompt.txt`, `finish_args.txt` (new ×12) | the prompts and finish recipes (`source/` stays git-ignored) |
| `art/scripts/meshy/finish.mjs` | + `--crown` (conifers: a `Crown` node wrapping `Canopy`) |
| `art/scripts/meshy/recolour.mjs` (new) | autumn: hue-shift only the texels under the `Canopy` mesh |
| `art/scripts/lib/plantkit.mjs`, `plantkit.mjs` CLI | + `SHRUBS` table: `shrub_low`, `shrub_mound` (bracken), `shrub_heather` |
| `art/scripts/lib/terrain.mjs` | `composeBlueprint`: `t.asset` for trees, `s.asset` for shrubs and bushes (species, autumn, bush kinds, shrub belt) |
| `art/scripts/lib/composition.mjs` | export `t.asset`; `texturedTint`; asset records from `species.mjs`; drop the `plants.mjs` tree, shrub and bush builds from `plantAssets` |
| `art/scripts/export-composition.mjs` | publish the finished Meshy GLBs, the autumn GLBs and the card shrubs |
| `art/scripts/lib/arch-scene.js`, `build.mjs`, `composition-check.mjs` | the proof draws `tree:<asset>` and `shrub:<asset>` from the GLBs; extraction maps them directly |
| tests | `finish-crown`, `recolour`, `trees`, `species` (new); `plantkit`, `plants`, `composition` (changed); `plants-export` (retired) |

---

### Task 1: Species table and concept prompts (0 credits)

**Files:**
- Create: `art/scripts/lib/species.mjs`
- Create: `art/meshy/{tree_oak,tree_beech,tree_maple,tree_sapling,tree_birch,tree_willow,tree_apple,tree_fir,tree_scots_pine,bush_leafy,bush_flowering,bush_berry}/concept_prompt.txt`
- Test: `art/scripts/tests/trees.test.mjs` (T1 only in this task)

**Interfaces:**
- Produces: `export const SPECIES` is an array of `{ id, folder, kind: 'broad'|'conifer'|'bush', height, target, cap, finish: string }`. `export const AUTUMN` is an array of `{ id, from, hue, sat, val }`. Both are used by Tasks 2, 5, 6, 9 and 10.

| id | folder | kind | height | target / cap |
|---|---|---|---|---|
| tree_round_a | tree_oak | broad | 2.3 | 900 / 1200 |
| tree_round_b | tree_beech | broad | 2.3 | 900 / 1200 |
| tree_spread | tree_maple | broad | 1.92 | 900 / 1200 |
| tree_sapling | tree_sapling | broad | 1.34 | 400 / 600 |
| tree_birch | tree_birch | broad | 2.3 | 900 / 1200 |
| tree_willow | tree_willow | broad | 2.3 | 900 / 1200 |
| tree_fruit | tree_apple | broad | 1.9 | 900 / 1200 |
| tree_pine_a | tree_fir | conifer | 2.55 | 900 / 1200 |
| tree_pine_b | tree_scots_pine | conifer | 1.97 | 900 / 1200 |
| bush_a | bush_leafy | bush | 0.9 | 500 / 600 |
| bush_flowering | bush_flowering | bush | 0.9 | 500 / 600 |
| bush_berry | bush_berry | bush | 0.9 | 500 / 600 |

`AUTUMN`: `tree_oak_autumn` from `tree_round_a`, hue 22°; `tree_beech_autumn` from `tree_round_b`, hue 36°; `tree_birch_autumn` from `tree_birch`, hue 48°. All three have sat × 1.1 and val × 1.0.

- [ ] **Step 1: Write T1 in `tests/trees.test.mjs`.** `SPECIES` has 12 unique ids and folders. Every folder has a `concept_prompt.txt` of ≥ 400 chars that names the species and contains the shared style block verbatim. `AUTUMN.from` values are all `SPECIES` ids.
- [ ] **Step 2: Run** `node tests/trees.test.mjs`. Expect FAIL: `Cannot find module '../lib/species.mjs'`.
- [ ] **Step 3: Write `species.mjs` and the 12 prompts.** Each prompt is the hero-tree prompt's style block, from "Stylized 3D game asset…" to the end of `art/meshy/hero_tree/concept_prompt.txt`, kept verbatim, preceded by one species paragraph:
  - **oak:** young, clumped rounded leaf pads, a little branch between them, warm bark, *less gnarled than an ancient oak*.
  - **beech:** a tall rounded dome of leaf pads, smooth grey bark.
  - **maple:** a wide spreading crown on a short trunk.
  - **sapling:** a slim young tree with 3–4 small leaf pads.
  - **birch:** white bark with dark marks, airy, light-green pads.
  - **willow:** weeping curtains of long leaf strands from a broad crown.
  - **apple:** a rounded crown with red apples among the leaf pads.
  - **fir:** tall narrow ragged tiers of painted needles, drooping tips, trunk visible at the base.
  - **Scots pine:** a red-brown upper trunk, a flat-topped crown of blue-green needle clumps.
  - **bush_leafy:** a round leafy bush of soft leaf pads, no trunk.
  - **bush_flowering:** a round leafy bush with pink and white blossom.
  - **bush_berry:** a round leafy bush with clusters of red berries.
  - Every prompt ends with the view and isolation sentences of the hero prompt ("Elevated three-quarter view…", "…isolated on a plain light grey background, no ground plane…").
- [ ] **Step 4: Run** `node tests/trees.test.mjs`. Expect `T1 … PASS`.
- [ ] **Step 5: Commit** `art/scripts/lib/species.mjs art/meshy/*/concept_prompt.txt art/scripts/tests/trees.test.mjs`: "Trees: the species table and the 12 concept prompts".

### Task 2: Gate A, the concepts (144 credits, needs the owner's yes)

**Files:**
- Create: `art/meshy/<folder>/source/concept_1.png`, `.json` (git-ignored)
- Create (scratchpad, not the repo): `review/concepts_lineup.png`

**Interfaces:**
- Consumes: `SPECIES[].folder` (Task 1).
- Produces: `art/meshy/<folder>/source/concept_1.png` for Task 7.

- [ ] **Step 1: Ask the owner (AskUserQuestion)** to approve 12 concepts × 12 = 144 credits. Stop if the answer is no.
- [ ] **Step 2: Log the balance.** `meshy api GET /balance` goes to `scratchpad/meshy_trees.log`.
- [ ] **Step 3: Run the concepts**, 3 at a time (`xargs -P 3`), with a retry after a 20 s pause on `rate_limit`:
  - Command: `meshy image-to-image create --ai-model gpt-image-2 --reference-image-urls /home/me/Projects/gitaway-assets/art/meshy/hero_tree/source/concept_1.png,/home/me/Projects/gitaway-art-meshy2/art/meshy/farmhouse/source/concept_gpt.png --prompt "$(cat concept_prompt.txt)"`.
  - Save the output as `source/concept_1.png` with the task JSON beside it.
- [ ] **Step 4: Log the balance and check the spend.** Expect a drop of exactly 144. Report any difference.
- [ ] **Step 5: Build the lineup** (the 12 concepts in a 4×3 grid with labels, Pillow in `/tmp/img-venv`). Send it to the owner with SendUserFile and ask with AskUserQuestion: all approved, or which to re-roll (27 each covers a concept plus its model later; a concept re-roll alone is 12). Re-roll only on a yes.

### Task 3: `finish.mjs --crown` (conifer structure)

**Files:**
- Modify: `art/scripts/meshy/finish.mjs` (option parsing near the `--canopy` handling, and the node build)
- Test: `art/scripts/tests/finish-crown.test.mjs` (new)

**Interfaces:**
- Produces: `--crown` (requires `--canopy`). The output is root node `<id>` (the trunk mesh) > `Crown` (no mesh, at the `Canopy` pivot) > `Canopy` (the foliage mesh, local origin). This is the structure `composition.ts` `inCrown` and `composition.test.mjs` C7 read on conifers.

- [ ] **Step 1: Write the test** in `tests/finish-crown.test.mjs`. It runs `finish.mjs` on `art/meshy/hero_tree/source/raw.glb` (or `hero_tree.glb` if the raw file is absent) twice, into `/tmp`:
  - F1 `--canopy --crown`: a node `Crown` with exactly one child, `Canopy`. `Crown` has no mesh. `Crown`'s world translation equals the `Canopy` pivot of a plain `--canopy` run (±1e-4).
  - F2 `--canopy` alone: no `Crown` node, and the output is byte-identical to the run before this change (hash pinned in the test from the pre-change run).
  - F3 `--crown` without `--canopy` exits non-zero with "--crown needs --canopy".
- [ ] **Step 2: Run it.** Expect F1 and F3 to FAIL and F2 to PASS.
- [ ] **Step 3: Implement `--crown`** in `finish.mjs`: wrap the `Canopy` node in a new `Crown` node at the same translation, and give `Canopy` translation 0. Add the option's line to the header comment.
- [ ] **Step 4: Run it.** Expect F1–F3 PASS. Also run `node tests/finish-parts.test.mjs` and `node tests/finish-roof.test.mjs`; expect them unchanged and passing.
- [ ] **Step 5: Commit** "finish.mjs --crown: the conifer Crown > Canopy structure".

### Task 4: Card shrubs in the kit (0 credits)

**Files:**
- Modify: `art/scripts/lib/plantkit.mjs` (a new `SHRUBS` table next to `CROPS`/`BEDS`; add `SHRUBS` to `specOf`), `art/scripts/plantkit.mjs` (the CLI table lookup)
- Test: `art/scripts/tests/plantkit.test.mjs` (new K9)

**Interfaces:**
- Produces: `export const SHRUBS = { shrub_low, shrub_mound, shrub_heather }`, each built by `buildPlant(id)`. Used by Task 9.

- [ ] **Step 1: Write K9.** For each of `shrub_low`, `shrub_mound` and `shrub_heather`:
  - ≤ 120 tris, one MASK PNG material (cutoff 0.4), node named after the id;
  - min y within 0.01 of 0, footprint inside a 0.6 u radius, height 0.2–0.5 u;
  - deterministic bytes.
  - Also: `shrub_heather`'s texture has ≥ 20% of its opaque texels with hue 280–330° (the heather bloom).
- [ ] **Step 2: Run** `node tests/plantkit.test.mjs`. Expect K9 to FAIL ("no plant kit model shrub_low") and K0–K8 to pass.
- [ ] **Step 3: Paint the three shrubs** using the existing `Paint` primitives and card layout (`grassTuft`, `blob`, `ell`, `brush`/`grain`, as in `KIT`):
  - **`shrub_low`:** a low dome of leaf blobs on 3 crossed cards, 0.32 u.
  - **`shrub_mound`:** bracken, 6 tilted frond cards like `fern_clump` but broader and russet-tipped, 0.4 u.
  - **`shrub_heather`:** a low mat of green tufts with purple-pink bloom dots, 0.25 u.
- [ ] **Step 4: Run** `node tests/plantkit.test.mjs`. Expect all PASS. Run `node plantkit.mjs /tmp/shrubs shrub_low shrub_mound shrub_heather` and look at `kit_textures.png`.
- [ ] **Step 5: Commit** "Plant kit: three card shrubs (low shrub, bracken, heather)".

### Task 5: Finished-model checks (written now, green after Task 7)

**Files:**
- Modify: `art/scripts/tests/trees.test.mjs` (T2–T6)

**Interfaces:**
- Consumes: `SPECIES` (Task 1); the finished files `art/meshy/<folder>/<folder>.glb` (Task 7).

- [ ] **Step 1: Write T2–T6** for every `SPECIES` entry, reading `art/meshy/<folder>/<folder>.glb`:
  - **T2:** the root node is named `id`. One base-colour JPEG texture of 512² (or 1024² with the id listed in `HI_RES = []` in the test). Triangles ≤ `cap`.
  - **T3:** height within ±3% of `height`, and min y within 0.01 of 0.
  - **T4 (broad and conifer only):**
    - A `Canopy` node with a pivot y between 0.3 × height and 0.8 × height.
    - Conifers: `Crown` > `Canopy`. Broadleaf: no `Crown`.
    - The `Canopy` mesh holds ≥ 85% of the triangles whose centroid lies above 0.45 × height (Review Focus 1).
  - **T5:** the vertices in the bottom 4% of the height span ≤ 30% of the model's xz width (Review Focus 2).
  - **T6 (bushes):** no `Canopy`, one mesh.
- [ ] **Step 2: Run** `node tests/trees.test.mjs`. Expect T2–T6 to FAIL (files missing) and T1 to PASS.
- [ ] **Step 3: Commit** "Trees: finished-model checks (red until the models land)".

### Task 6: Autumn recolour (0 credits)

**Files:**
- Create: `art/scripts/meshy/recolour.mjs`
- Test: `art/scripts/tests/recolour.test.mjs` (new)

**Interfaces:**
- Produces: `node meshy/recolour.mjs <in.glb> <out.glb> --id <id> --hue <deg> [--sat k] [--val k]`. It writes a copy whose texels under the `Canopy` mesh's UV triangles turn to hue `deg`, with saturation × k and value × k. The trunk texels and all geometry are unchanged. The node, mesh and material are renamed `id`. Used by Task 7 for `AUTUMN`.

- [ ] **Step 1: Write the test.** Use `hero_tree.glb` as input (it has `Canopy`), with `--hue 36 --id t_autumn`:
  - **R1:** of the texels under the `Canopy` triangles with saturation ≥ 0.15, ≥ 90% have a hue within 36 ± 12°.
  - **R2:** the texels under the trunk triangles only (not `Canopy`) differ from the source by mean |ΔRGB| ≤ 2/255 (Review Focus 4).
  - **R3:** the `Canopy` texels' luminance standard deviation is within ±15% of the source's (detail kept, not flattened).
  - **R4:** POSITION, NORMAL, TEXCOORD_0 and indices are byte-equal to the input. The root node is named `t_autumn`.
  - **R5:** deterministic bytes.
- [ ] **Step 2: Run** `node tests/recolour.test.mjs`. Expect FAIL (no script).
- [ ] **Step 3: Implement `recolour.mjs`.**
  - Decode the JPEG with the same decoder `finish.mjs` uses. Rasterise every `Canopy` triangle's UV triangle into a mask at texture resolution, then dilate it by 1 px. Texels under both a `Canopy` triangle and a trunk triangle stay unchanged; the trunk wins.
  - For each masked texel: HSV, set h = hue, s × sat, v × val, back to RGB.
  - Re-encode at the source JPEG quality.
- [ ] **Step 4: Run.** Expect R1–R5 PASS.
- [ ] **Step 5: Commit** "meshy/recolour.mjs: autumn crowns by hue shift, bark untouched".

### Task 7: Gate B-1, models and finishing (180 credits, needs the owner's yes)

**Files:**
- Create: `art/meshy/<folder>/source/raw.glb`, `model_1.json` (git-ignored); `art/meshy/<folder>/<folder>.glb`, `finish_args.txt`; `art/meshy/autumn/{tree_oak_autumn,tree_beech_autumn,tree_birch_autumn}.glb`
- Modify: `art/meshy/README.md` (a "Trees and bushes" section with the table of tris, KB and the args)

**Interfaces:**
- Consumes: the concepts (Task 2), `--crown` (Task 3), `recolour.mjs` (Task 6), `SPECIES` and `AUTUMN` (Task 1).
- Produces: the 15 finished GLBs read by Tasks 9 and 10.

- [ ] **Step 1: Ask the owner (AskUserQuestion)** to approve 12 models × 15 = 180 credits. Stop on no.
- [ ] **Step 2: Log the balance. Run the models** 3 at a time:
  - Command: `meshy image-to-3d create --image-url source/concept_1.png --model-type smart-topology --target-polycount <target> --should-texture true --enable-pbr false --texture-resolution 2k`, saved as `source/raw.glb`.
  - Log the balance again and expect a drop of exactly 180.
- [ ] **Step 3: Write each `finish_args.txt`** from `SPECIES.finish`, then run `node scripts/meshy/finish.mjs source/raw.glb <folder>.glb --id <id> $(cat finish_args.txt)`:
  - **Broadleaf:** `--height H --tex 512 --q 85 --compact --canopy --leafMinY 0.25`.
  - **Conifers:** add `--crown --leafHue 55,200`.
  - **Apple:** `--leafHue 0,170` so the fruit joins the crown.
  - **Bushes:** `--height 0.9 --tex 512 --q 85 --compact`.
  - Tune `--leafMinY`/`--leafHue` per model until T4 passes. Never change the texture to pass.
- [ ] **Step 4: Recolour the autumn variants:** `node scripts/meshy/recolour.mjs art/meshy/<from folder>/<from folder>.glb art/meshy/autumn/<id>.glb --id <id> --hue <hue> --sat 1.1`.
- [ ] **Step 5: Run** `node tests/trees.test.mjs`. Expect T1–T6 PASS. Add T7: the 3 autumn files pass T2–T5 with their `from` species' height.
- [ ] **Step 6: Render turntables** (`node scripts/meshy/turntable.mjs <out.png> "Trees" <glb>,<concept.png> …`), 4 orbits plus the game camera. Check them yourself before Gate B.
- [ ] **Step 7: Commit** the finished GLBs, `finish_args.txt`, the README section and T7: "Trees: 12 Meshy species finished, 3 autumn recolours".

### Task 8: Species by biome in `composeBlueprint` (0 credits)

**Files:**
- Modify: `art/scripts/lib/terrain.mjs` (the plants block after the variant pass; the bush placement near `:2224`; the shrub belt)
- Modify: `art/scripts/tests/plants.test.mjs` (V2 hashes positions and scales only; V3 keys on `asset`)
- Test: `art/scripts/tests/species.test.mjs` (new)

**Interfaces:**
- Produces:
  - every composed tree gets `t.asset`: one of the `SPECIES` tree ids or an `AUTUMN` id;
  - every `O.shrubs` item gets `s.asset`: `shrub_low`, `shrub_mound` or `shrub_heather`;
  - every `O.bushes` item gets `b.kind`: `bush_a`, `bush_flowering` or `bush_berry`;
  - layout trees and bushes are unchanged (the game places them).
- Consumed by Tasks 9 and 10.

- [ ] **Step 1: Freeze the position fixture before any change.**
  - Write `tests/species.test.mjs` with `--freeze` mode. It writes `fixtures/trees.positions.json`: per seed, per piece, the sorted list of `[x, z, scale × vscale]` (r3) for trees, shrubs and bushes.
  - Run it with `--freeze` on the unchanged code and commit the fixture alone: "Trees: freeze positions and scales".
- [ ] **Step 2: Write S1–S8**, both seeds:
  - **S1:** positions and scales equal the fixture.
  - **S2:** every `tree_willow` lies within 1.5 u of water: the lake or tarn shore, a channel half-width, or the pond.
  - **S3:** the highland is ≥ 70% `tree_pine_a` + `tree_pine_b` among its composed trees.
  - **S4:** autumn ids are 5–10% of the composed broadleaf trees on non-main pieces, and 0 on main.
  - **S5:** every `SPECIES` tree id except `tree_fruit` and every `AUTUMN` id appears at least once; `bush_berry` appears at least once.
  - **S6:** composing twice gives identical `asset` and `kind` fields.
  - **S7:** the wetland has ≥ 8 willows and the highland ≥ 6 birches (Review Focus 5).
  - **S8:** `shrub_heather` appears only on the highland, and every highland shrub is `shrub_heather`.
- [ ] **Step 3: Run** `node tests/species.test.mjs`. Expect S1 to PASS and S2–S8 to FAIL (no `asset` field).
- [ ] **Step 4: Implement the species rule** in `terrain.mjs`.
  - Hoist the cover block's water check to `const waterWithin = (x, z, r) => nearChannel(x, z, r) || pondHit(x, z, r - 0.32) || <8 inWater samples on a ring of radius r>`, and make the cover use it.
  - New positional hashes `ph(x, z, 9419)` (species, `h4`), `ph(x, z, 9521)` (autumn, `h5`) and `ph(x, z, 9623)` (bush kind, `h6`). No RNG stream is drawn.
  - Base asset by variant:

```js
const BASE = { oak: 'tree_round_a', ovate: 'tree_round_b', spread: 'tree_spread', sapling: 'tree_sapling', fir: 'tree_pine_a', pine: 'tree_pine_b' };
// highland: the 70th-percentile ground height of its composed trees, computed once per piece
function speciesOf(id, t, h4, hiP70) {
  const broad = t.variant !== 'fir' && t.variant !== 'pine';
  if (!broad) return BASE[t.variant];
  if (id === 'highland') return bp.H(t.x, t.z) >= hiP70 ? 'tree_birch' : h4 < 0.5 ? 'tree_pine_a' : 'tree_pine_b';
  if (id === 'wetland') return waterWithin(t.x, t.z, 1.5) ? (h4 < 0.65 ? 'tree_willow' : 'tree_birch') : h4 < 0.35 ? 'tree_birch' : BASE[t.variant];
  if (id === 'grove') return t.variant === 'sapling' ? 'tree_sapling' : h4 < 0.55 ? 'tree_round_a' : 'tree_round_b';
  if (id === 'orchard') return h4 < 0.6 ? 'tree_round_b' : BASE[t.variant];
  if (id === 'meadow' || id === 'cottage') return h4 < 0.1 ? 'tree_birch' : BASE[t.variant];
  return BASE[t.variant];   // islet, main
}
const AUTUMN_OF = { tree_round_a: 'tree_oak_autumn', tree_round_b: 'tree_beech_autumn', tree_birch: 'tree_birch_autumn' };
// autumn: non-main, broadleaf asset in AUTUMN_OF, h5 < 0.075
```

  - **No-clone pass:** compare `o.asset !== t.asset` instead of `variant`.
  - **Bushes** (non-layout):
    - meadow and cottage: `h6 < 0.6` flowering, `< 0.85` `bush_a`, else berry;
    - elsewhere: `h6 < 0.5` `bush_a`, `< 0.85` berry, else flowering.
  - **Shrub belt:** highland → `shrub_heather`; otherwise `mound` → `shrub_mound`, `low` → `shrub_low`.
  - If S3 or S7 fails on a seed, adjust only the thresholds in `speciesOf`, never the test numbers.
- [ ] **Step 5: Run** `node tests/species.test.mjs`. Expect S1–S8 PASS.
- [ ] **Step 6: Update `plants.test.mjs`.**
  - V2 hashes `[x, z, scale × vscale]` only. Re-pin the hash from the frozen fixture, and say in the comment why: species now come from `asset`.
  - V3 compares `asset`.
  - Run it, and run `cover`, `lawn`, `blueprint` and `terrain`. Expect all PASS, with no other list moved.
- [ ] **Step 7: Commit** with the red and green runs in the message: "Trees: species by biome, autumn accents, bush kinds and card shrubs in the composition".

### Task 9: Composition export of the new assets

**Files:**
- Modify: `art/scripts/lib/composition.mjs`:
  - `compositionData` trees, shrubs and bushes use `t.asset`, `s.asset` and `b.kind`;
  - new `texturedTint`;
  - the `assets` table comes from `SPECIES`, `AUTUMN` and `SHRUBS`;
  - `plantAssets` keeps only `grass_tuft` and `flower_head`.
- Modify: `art/scripts/export-composition.mjs` (copy the finished GLBs; build the card shrubs with `buildPlant`)
- Modify: `art/scripts/tests/composition.test.mjs` (C7, C8; new C13, C14)
- Delete: `art/scripts/tests/plants-export.test.mjs`, `fixtures/plants.baseline.json`, `fixtures/plants.proof-live.json`. The GLBs they guard no longer come from `plants.mjs`; note it in `art/LOOK-PORT.md` step 5.

**Interfaces:**
- Consumes: `t.asset`, `s.asset`, `b.kind` (Task 8); the GLBs (Task 7); `SHRUBS` (Task 4).
- Produces: `export function texturedTint(x, z, T): [r, g, b] | null`:
  - `null` when `!T || !T.enabled`;
  - otherwise `dv = (hash3(kx, kz, 7919 + T.seed) × 2 − 1) × 0.06` and `dw = (hash3(kx, kz, 4001 + T.seed) × 2 − 1) × 0.03`;
  - returns `[(1 + dv)(1 + dw), 1 + dv, (1 + dv)(1 − dw)]`, r4-rounded.
  - The asset records: trees `{ category: 'trees', instanceColor: 'tint', provider: 'export-composition', from: 'Meshy art/meshy/<folder>' }`; bushes and card shrubs `{ category: 'shrubs' }` with no `instanceColor`.

- [ ] **Step 1: Write the tests.**
  - **C7 (replaced):**
    - Every tree GLB has one material with a base-colour texture, `NORMAL` + `TEXCOORD_0`, and a `Canopy` node; the conifers have `Crown` > `Canopy`.
    - Bushes have one textured material.
    - Card shrubs pass the C12 kit rules.
  - **C8 (replaced):** manifest tris equal the GLB's. Caps: trees 1,200, `tree_sapling` 600, bushes 600, card shrubs 120.
  - **C13:** every asset id in `SPECIES` (except `tree_fruit`, which is game-placed), `AUTUMN` and `SHRUBS` is placed somewhere, and has a ready manifest entry and a file.
  - **C14:** every tree item's tint channels are in [0.92, 1.08]. Shrub items have no `tint` field (Review Focus 3).
- [ ] **Step 2: Run** `node tests/composition.test.mjs`. Expect C7, C8, C13 and C14 to FAIL.
- [ ] **Step 3: Implement** the `composition.mjs` and `export-composition.mjs` changes above.
  - The exporter reads `art/meshy/<folder>/<folder>.glb`, or `art/meshy/autumn/<id>.glb`, as bytes and copies them unchanged. Manifest notes name the species and the Meshy source.
  - `tree_fruit` stays in the assets table, provided by its Meshy file.
  - Run `node export-composition.mjs`.
- [ ] **Step 4: Run** `node tests/composition.test.mjs`. Expect everything except C5 (proof fixture, Task 10) to PASS. Run `models`, `meshy` and `crops`; expect PASS.
- [ ] **Step 5: Commit** "Composition: export the painterly trees, bushes and card shrubs; near-white crown tint".

### Task 10: The proof draws the new assets

**Files:**
- Modify: `art/scripts/lib/arch-scene.js` (the plants block around `:900-915`): when the composition items carry `asset`, draw one instanced mesh per asset from the loaded GLBs, named `tree:<asset>` (tint on the canopy mesh as now) and `shrub:<asset>` (no tint, no cast shadow). The bushes go through `shrub:<asset>` too.
- Modify: `art/scripts/build.mjs`: ship every `SPECIES`, `AUTUMN` and `SHRUBS` GLB into the proof as `.wasm`, and add them to `GLB_KIND` foliage.
- Modify: `art/scripts/composition-check.mjs`: `KIND` maps `tree:<asset>` → `['trees', asset]` and `shrub:<asset>` → `['shrubs', asset]`; the extraction recognises those heads.
- Modify: `art/scripts/tests/fixtures/composition.proof.json` (regenerated)

**Interfaces:**
- Consumes: the composition fields (Task 8) and the GLBs (Tasks 4, 7).

- [ ] **Step 1: Run** `node tests/composition.test.mjs` and confirm C5 FAILS (the proof still draws `plants.mjs` variants).
- [ ] **Step 2: Implement the three file changes.**
- [ ] **Step 3: Rebuild the proof and re-extract.**
  - Build: `PROOF_DIR=/tmp/proof_trees node build.mjs`.
  - Serve it the way `scratchpad/extract.sh` does, with `SERVE=/tmp/serve_trees` and port 4422.
  - Extract: `node composition-check.mjs --port 4422 --out /tmp/cc_trees --extract`. Expect "problems: none; page errors: 0".
- [ ] **Step 4: Run** `node tests/composition.test.mjs`. Expect 14/14 PASS. Then run the full art suite: plantkit, cover, lawn, crops, composition, plants, species, trees, recolour, finish-crown, finish-roof, finish-parts, blueprint, bake, terrain, lookcore, phase2, lookpresets, look, models and meshy. Expect all PASS.
- [ ] **Step 5: Commit** "Proof: draw the painterly trees and bushes from their GLBs; fixture regenerated".

### Task 11: Gate B-2, in-game review and frame time

**Files:** none in the repo; the scratchpad only.

- [ ] **Step 1: Regenerate the game's composition data locally.** Run `node scripts/composition.mjs` in the worktree; it is local only, never committed. Build and capture with a copy of `scratchpad/shots_ground.sh` (`REPO=gitaway-art-trees`, `GW_OUT=$S/audit_trees`, mode `final`). Clean up `dist`, `test-results` and the `node_modules` link afterwards.
- [ ] **Step 2: Check the shots yourself:** the default view, the meadow, garden, wetland, highland and grove views, plus ≥ 3 orbit angles. Make before/after sheets against `audit_v5`, same views, same script as part 1.
- [ ] **Step 3: Measure frame time** with a subagent. It runs a Playwright probe on main and on the branch build: all pieces docked via the dev fast-forward, default camera, 10 s of rAF deltas, median and p95, on desktop and the mobile project with 4× CPU throttling. Record the deltas. Over 2 ms → the LOD item goes into the game brief.
- [ ] **Step 4: Send the owner the sheets** and the frame-time numbers, and list any weak species. Ask with AskUserQuestion: approve, or which to re-roll (27 each, asked per re-roll).

### Task 12: Game brief and PR

- [ ] **Step 1: Push** `art/painterly-trees` (pushing a branch runs no CI). SendMessage the game session the spec's five game-side steps, with:
  - the new asset ids;
  - `bush_berry`;
  - the farm-tree scale A/B request;
  - the frame-time numbers, and whether the LOD step is needed.
  - Ask it to push fast-forward onto `art/painterly-trees` from its own worktree and run vitest plus desktop and mobile Playwright locally.
- [ ] **Step 2: When it reports done,** pull with `--ff-only`, recapture, and check the farm trees and the bushes in game (≥ 3 angles).
- [ ] **Step 3: Open the PR** with `gh pr create --base main`. Body: summary, credits spent with the balance before and after, tests, frame time, before/after links, and what is out of scope. End it with the Claude Code attribution line. Check CI once by hand; this session cannot bind the PR, and never poll.
- [ ] **Step 4: Update** the memory note `gitaway-art-cohesion.md` with the outcome and the credits.
