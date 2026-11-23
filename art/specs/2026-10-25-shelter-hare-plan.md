# Meadow Shelter and Brown Hare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two game-drawn stand-ins players can see today: the meadow shelter (a painted procedural lean-to) and the brown hare (a Meshy model, ready for the animal-rigs toolkit).

**Architecture:**
- **The shelter** is a new painted procedural asset script, `art/scripts/assets/shelter.mjs`. It follows `woodshed.mjs` and `barnaby_camp.mjs`: built in code, UV-mapped onto the shared painted atlas through `lib/paintedAtlas.mjs`, with cells from `look.config.mjs → assetMaterials`. It is published under two ids.
- **The hare** goes through the Meshy pipeline the crops and animals use: concepts, then an owner pick, then image-to-3D, then `scripts/meshy/finish.mjs`. It publishes as `visitor_hare`. Rigging is a later task on `art/animal-rigs`, not part of this plan.

**Tech Stack:** Node 22 art scripts (three.js 0.160.0 GLTFExporter), the Meshy API (credits), Playwright/three.js renders.

**Spec:** `art/specs/2026-10-25-shelter-hare-design.md`

## Global Constraints

**Where you work**
- Worktree `/home/me/Projects/gitaway-art-shelterhare`, branch `art/shelter-hare`.
- Touch only `art/` and `public/models/`. `src/` is game-owned: a game change becomes a G-item in the report.
- Never push, open PRs or message other sessions. The controller does those after the owner's OK.

**WSL and shell**
- Write each script to the session scratchpad and run it with a unique /tmp name, `/tmp/shelterhare-<task>-<name>.sh`. Never use a shared name like `/tmp/x.sh`.
- Put `export PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH` inside the script.
- Files written through `\\wsl.localhost` come out root-owned. Run `MSYS_NO_PATHCONV=1 wsl.exe -d Ubuntu-24.04 -u root -- chown -R $USER:$USER /home/me/Projects/gitaway-art-shelterhare` before node writes or a commit.

**Colour**
- Follow ART-BIBLE §B.1 bands, using existing tokens only.
- Stone ≤ 0.30 saturation, wood and soil 0.25–0.45, accents ≤ 0.70.
- Darkest luma ≥ 0.08.

**Meshy**
- The credit cap for this plan is **45**; the balance before is 666.
- Run at most 3 calls at once, and log the balance before and after every call in `art/meshy/visitor_hare/credits.log`.
- Never print, log or commit the API key; it is read from the environment the existing scripts use.
- A failed generation may be retried once inside the cap. Stop and report if the cap would be crossed.
- Never palette-flatten a Meshy texture; fix blur with resolution and filtering.

**Budgets**
- `shelter` and `sheep_shelter`: `structure` class, ≤ 600 tris, ≤ 200 KB, one painted-atlas material, no `Glow`.
- `visitor_hare`: `animal` class, ≤ 1,500 tris, ≤ 200 KB, 512 px texture.

**Red-green**
- Write every new test first and run it before the change: it must FAIL.
- Record the RED and GREEN lines in the commit message.

**Renders**
- Before reporting, check CAM-DESK, two orbit angles, CAM-CLOSE and CAM-PHONE yourself. Never one hero shot.

**Commits**
- Every message ends with `[skip ci]`, then the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The shelter's open front faces the wrong way in the game.** The game turns it by rotation 0.7 at `MEADOW.shelter`. With +Z as the front, that faces the camera like the stand-in. Expected: the open side and the hay are visible from the default camera.
   - Pinned by M-SH3 (front +Z) and the in-place render (Task 1).
2. **The shelter overhangs its flat zone or sinks.** The meadow's flat zone `shelter` is r 1.1. The 1.4 × 1.1 footprint has a half-diagonal of 0.89, so it fits; a wide roof overhang could still poke into the slope.
   - Pinned by M-SH1 (bounds) and the in-place render.
3. **The two shelter ids drift apart.** `sheep_shelter` must be the identical file. Expected: equal bytes, both in the manifest.
   - Pinned by M-SH4.
4. **The hare's scale against the game's stand-in numbers.** The game draws the visitor at `scale: 1.3`. A 0.45 u model would show 0.59 u, taller than the stand-in's intent. Expected: the report gives the game the exact scale to use (G-item), and the render shows the hare beside the shelter for scale.
   - Pinned by M-HA1 (bounds) and the scale render (Task 3).
5. **A sitting hare that tips or floats.** Meshy bases are uneven. Expected: the base is at y 0 with the feet on it, and nothing below −0.01 u (the rigs' R25 ground rule, applied early).
   - Pinned by M-HA2 (Task 3).

---

### Task 1: The meadow shelter

**Files:**
- Create: `art/scripts/assets/shelter.mjs`.
- Modify:
  - `art/config/look.config.mjs`: `assetMaterials.shelter`, cells only from existing swatches;
  - `art/scripts/lib/asset-contract.mjs`: `shelter` and `sheep_shelter` set to `structure`;
  - `public/models/manifest.json`: both ids;
  - the publish list in `art/scripts/publish-models.mjs`, wherever woodshed is registered, so both ids publish.
- Create: `public/models/shelter.glb`, `public/models/sheep_shelter.glb` (identical bytes).
- Test: `art/scripts/tests/models.test.mjs` (M-SH1–M-SH4), `art/scripts/tests/assets.test.mjs` (runs as is).

**Interfaces:**
- Produces: `shelter.glb` and `sheep_shelter.glb`. Each is one mesh, one painted-atlas material, origin at the base centre on y 0, with the open front +Z. The manifest entries are `structure` and `ready`.

- [ ] **Step 1: Write the tests** in `models.test.mjs`, following the P19–P23 style (P23 `barnaby_camp` is the nearest).
  - **M-SH1:** the bounds are x 1.4 ± 0.08, z 1.1 ± 0.08 and height 1.35 ± 0.05, centred on the origin (|centre x|, |centre z| ≤ 0.05), with min y = 0 ± 0.005.
  - **M-SH2:** ≤ 600 tris, exactly one material carrying the painted atlas texture, and no `Glow` material.
  - **M-SH3:** the open front is +Z. The roof's highest vertex has z > 0, because the roof is high at the open front. Over the back half (z < −0.3), the geometry rises to at least 0.6 u (the back wall). Over the front half (z > 0.3, |x| < 0.5), nothing lies between y 0.15 and 0.9 except the two posts (|x| > 0.5), so the front is open.
  - **M-SH4:** `sheep_shelter.glb` has the same bytes as `shelter.glb`, and the manifest has both ids marked `ready`.
- [ ] **Step 2: Run** `node tests/models.test.mjs` from `art/scripts`. Expected: M-SH1–M-SH4 FAIL with "missing shelter.glb". Also run `node tests/assets.test.mjs` and record its count.
- [ ] **Step 3: Implement `shelter.mjs`** with the same export shape as `woodshed.mjs`: `{ id, category, build() }`, using `box`/`cyl`, `placer`, `atlasTexture` and `sm`. The form follows spec §2:
  - a stone footing under the back and sides;
  - a plank back wall, plus low plank side walls about half height;
  - two front posts;
  - a single-pitch terracotta tile roof, high at the open front and low at the back, with a short overhang that stays inside 1.4 × 1.1;
  - one hay bale against the back wall and a little loose hay;
  - baked shade (darker low down and under the roof), as the woodshed does.
  - Pick the hay cell from the existing swatches nearest the bible's hay tones, and write the choice in the file header.
- [ ] **Step 4: Publish both ids** with the repo's publish flow. Add the manifest entries, with notes naming the file as identical for both ids, and the contract classes.
- [ ] **Step 5: Run** `models`, `assets` and `palette`. Expected: all PASS, and the assets count is unchanged apart from the two new ids passing.
- [ ] **Step 6: Render.**
  - The model alone at 4 orbit angles.
  - The meadow in place, at `MEADOW.shelter` with rotation 0.7 next to the haystacks, from CAM-DESK, CAM-CLOSE and CAM-PHONE. Use the existing proof or capture tooling (`scripts/shots.mjs`, `scripts/capture.mjs`, `scripts/meshy/gamecam.mjs`; find how the woodshed and camp were rendered).
  - Also render the stand-in from the same views for a before/after.
  - Save the renders under the scratchpad at `shelterhare/t1/`.
- [ ] **Step 7: Commit**, with the message "Meadow shelter: a painted lean-to, also as sheep_shelter (M-SH1-M-SH4) [skip ci]" and the RED/GREEN lines.
- [ ] **Step 8: Write the G-item** in the report: `Shelter` (`src/world/Structures.tsx:455`) loads `shelter` through `Asset`, keeping today's mesh as the fallback, and the rotation stays 0.7.

### Task 2: The hare concepts (stops for the owner)

**Files:**
- Create:
  - `art/meshy/visitor_hare/concept_prompt.txt`;
  - `art/meshy/visitor_hare/concepts/` (the PNGs the API returns, with their task ids);
  - `art/meshy/visitor_hare/credits.log`.

**Interfaces:**
- Consumes: the concept flow `art/scripts/concept-crops.mjs` and the style references it uses (oak + cottage). Read how `art/meshy/dog/concept_prompt.txt` was written.
- Produces: two concept images, `concepts/a.png` and `concepts/b.png`, and a contact sheet, `concepts/sheet.png`, for the owner.

- [ ] **Step 1: Write the prompt** from spec §3.
  - The subject: an ordinary European brown hare sitting up with its ears tall; warm brown `#B98A63` fur, a cream belly, black ear tips and dark eyes. Side three-quarter view, the whole body, on a plain background, in the game's painted style.
  - No glow, no fantasy features, no clothing.
  - Make variant B differ in pose only: A has the ears straight up, B has one ear slightly turned.
- [ ] **Step 2: Generate the 2 concepts** (about 12 credits), with at most 3 calls at once, logging the balance before and after.
- [ ] **Step 3: Build the contact sheet** with both concepts side by side, labelled A and B. Show `scripts/meshy/contact.mjs` or similar.
- [ ] **Step 4: Commit** the prompt, concepts, sheet and credits log: "Hare: two Meshy concepts for the owner's pick [skip ci]".
- [ ] **Step 5: STOP.** Report the sheet path and the credits spent. The controller shows the owner, and Task 3 starts only after the owner's pick.

### Task 3: The hare model

**Files:**
- Create:
  - `art/meshy/visitor_hare/finish_args.txt`;
  - `art/meshy/visitor_hare/visitor_hare_raw.glb` (the Meshy output, in the same place the dog's raw model sits);
  - `public/models/visitor_hare.glb`.
- Modify:
  - `art/scripts/lib/asset-contract.mjs`: `visitor_hare` set to `animal`;
  - `public/models/manifest.json`.
- Test: `art/scripts/tests/models.test.mjs` (M-HA1–M-HA3), `assets`, `palette`.

**Interfaces:**
- Consumes: the owner's pick (A or B), passed in the dispatch.
- Produces: `visitor_hare.glb`. It has one mesh and one textured material (512 px), a sitting pose facing +Z, and its base at y 0. It is ready for the rigs toolkit, which re-skins it, so it has no bones here.

- [ ] **Step 1: Write the tests.**
  - **M-HA1:** the bounds are width (x) 0.2 ± 0.04, height 0.45 ± 0.04 and length (z) 0.5 ± 0.06, with the head at +Z: the top-most vertex has z > 0.
  - **M-HA2:** min y = 0 ± 0.005, and at least 30 vertices within 0.01 u of y 0 (the feet and rump on the ground, not balanced on one point).
  - **M-HA3:** ≤ 1,500 tris, ≤ 200 KB, one material with a texture ≤ 512 px, and no skin or bones.
- [ ] **Step 2: Run** the tests. Expected: M-HA1–M-HA3 FAIL with "missing visitor_hare.glb".
- [ ] **Step 3: Generate the 3D model.** Run image-to-3D from the picked concept with smart topology (about 15 credits), logging the balance. The plan's total must stay ≤ 45.
- [ ] **Step 4: Finish it** with `scripts/meshy/finish.mjs` to the M-HA bounds at 512 px, with `--pad` and `--maxKB 200`. Record the arguments in `finish_args.txt`. Turn it to face +Z and seat the base on y 0.
- [ ] **Step 5: Publish it**, adding the manifest entry and the contract class. Run `models`, `assets` and `palette`. Expected: all PASS. If the fur fails the palette bands, report it with numbers; never flatten.
- [ ] **Step 6: Render.**
  - The hare at 4 orbit angles.
  - The hare beside the shelter in the meadow, from CAM-DESK and CAM-CLOSE.
  - The hare at the game's `scale: 1.3` against `scale: 1.0`, so the G-item can name the scale that matches the brief's 0.45 u.
  - Save the renders under `shelterhare/t3/`.
- [ ] **Step 7: Commit**, with the message "Hare: the brown hare from Meshy, finished to the brief (M-HA1-M-HA3) [skip ci]" and the RED/GREEN lines.
- [ ] **Step 8: Report.**
  - The credits used in total.
  - The G-item: until the rigged version lands, `Visitors.tsx:45` can load `visitor_hare` through `Asset`, with the stand-in as the fallback, at the scale from Step 6.
  - A note for the rig task: the bones the pose suggests (spec §3).
