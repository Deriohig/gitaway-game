# Meadow shelter and brown hare: design

**Status:** owner-approved design and spec, 2026-10-25; rulings SH1–SH5 applied.
**Branch:** `art/shelter-hare`, worktree `/home/me/Projects/gitaway-art-shelterhare`, from `origin/main` b64e06a. The hare's rig is
the exception: it is built on `art/animal-rigs` (section 3).

## 1. Why and scope

The owner asked what designs are still missing, then chose **"only features that are on for now"**: the two placed things players
can see today that are still game-drawn stand-ins.

- **The meadow shelter.** It is drawn by `Shelter` (`src/world/Structures.tsx:455`) at `MEADOW.shelter` (`Isles.tsx:181`,
  rotation 0.7). The stand-in is a gable on four posts. The wild isles are on (`features.wildIsles`).
- **The brown hare, Síofra's visitor form.** `features.visitors` is on. `Visitors.tsx:45` draws the procedural stand-in from
  `visitorModels.tsx:48`: idle `sit`, height 0.45, scale 1.3, face 0.6.

**Out of scope.** The other 10 buildings (workshop, late shop buildings), because their features are off; Síofra as a young woman,
because her feature is a spec only; and Fin, who is waiting on the owner's model.

## 2. The meadow shelter (`shelter`, and `sheep_shelter` as the identical file)

- **Approach B, painted procedural** on the shared painted atlas. ASSET-RULES §5 names shelters as approach B. It is in the woodshed
  and Barnaby's camp family: the same posts, tile roof and stone footing. It is the `structure` class.
- **Form** (ASSETS.md `shelter`: "open sheep lean-to, 1.4 × 1.1 and ~1.35 tall, with a terracotta roof and a hay bale"):
  - a stone footing strip under the back and the sides;
  - a plank back wall, plus low plank side walls about half height, so it reads as a lean-to and not a canopy;
  - two front posts;
  - a single-pitch terracotta tile roof, high at the open front and low at the back, with a short overhang;
  - inside: one hay bale against the back wall and a little loose hay on the floor.
  - The open front faces +Z, so the game's rotation 0.7 turns it toward the default camera, matching the stand-in.
  - SH2: the owner kept the front-high roof (about a 28° pitch), although it is nearly edge-on from the 29° game camera.
- **Bounds:** 1.4 × 1.1 footprint (x × z), 1.35 ± 0.05 tall, with the base at y 0. That is inside the blueprint's flat zone
  `shelter` (r 1.1, `blueprint.data.ts`). The silhouette rule applies: one main mass, the roof at about 45–55 % of the height.
- **Budget:** ≤ 600 tris (the `sheep_shelter` brief), ≤ 200 KB, one painted-atlas material (no `Glow`).
- **Atlas:** existing cells only, because the atlas is full; a new atlas cell needs a repack, which is out of scope. The hay is the
  painted `paper` cell tinted gold through COLOR_0 (`HAY_TINT`, saturation about 0.66, guarded by M-SH5); swatch_GoldenYellow and
  plank_light were tried and rejected. The loose hay is 30 straw stalks in three drifts, all under 0.04 u.
- **Manifest:** an entry for both `shelter` and `sheep_shelter`, pointing at the same bytes as two files (the brief says "ship the
  identical file under this id too"), both `structure`. No game slot uses `sheep_shelter` yet; the meadow blueprint has a `sheep_shelter` flat zone at (6.1, −2.3), r 1.1.
- **Game:** a G-item for the game session. `Shelter` loads the `shelter` model through `Asset`, keeping today's mesh as the
  fallback. The rotation stays 0.7.

## 3. The brown hare (`visitor_hare`; unrigged here, rigged as `hare_rig` in rigs Task 8b, R28)

- **Approach A, Meshy**, the animal class like the dog and cat. It is later **rigged** with the animal-rig toolkit, so the game can
  drive it the way it drives the other animals.
- **Look** (ASSETS.md `visitor_hare` and the lore): an ordinary brown hare sitting up with its ears tall.
  - Warm brown `#B98A63`, a cream belly, ink ear tips and dark eyes.
  - Nothing magical: no glow, no odd colour, nothing that hints it is Síofra. CAST C4/C6 and lore answer 5 make it "an extra
    animal, never a missing one".
  - The owner picked concept B (one ear turned, paws tucked).
- **Bounds:** width 0.20–0.30 (SH3, the turned ear), height 0.45 ± 0.04, length 0.22–0.32 (SH4); shipped 0.209 × 0.450 × 0.265, with
  the base at y 0 and facing +Z. ASSETS' box is W × D × H, which the first draft misread. The game's `scale: 1.3` and `height: 0.45` are set against today's stand-in; the G-item says what to change.
- **Meshy steps**, at most 3 calls at once, balance logged per call, the key never printed:
  1. **Concepts:** 2 image-to-image concepts from the oak and cottage style references (24 credits, 12 each). The owner picked B.
  2. **3D:** image-to-3D from the picked concept, smart topology (15 credits).
  3. **Finish:** `finish.mjs --height 0.45 --lift 0.75 --terra 1 --tex 512 --q 85 --compact --pad --maxKB 200`. The `animal` class is
     ≤ 1,500 tris and ≤ 200 KB; the brief's ≤ 700 is the stand-in budget, and the rig keeps to the class.
     SH5: the pupils' darkest texels, at luma 0.042, are accepted.
  - **Credit cap: 45.** Spent 39 (concepts 24, 3D model 15; balance 666 → 627).
- **Rig and clips** on `art/animal-rigs`, as an extra task (8b) after the sheep (Task 8) and before the owner's review sheet (Task 9),
  using the same toolkit, checker (AR1–AR7, R25 no sinking, R26 no pops) and finalize step.
  - Bones: root, hips, spine, neck, head, ear_L/R (two segments each), lids (scale 0 open), the front legs, the hind legs
    (folded, sitting) and a short tail.
  - **Clips:** Idle (sitting, breathing, nose twitch), Look (head turns), EarTwitch, Groom (washes its face with its front paws),
    Hop (one short hop, landing back in the sit) and Alert (sits taller, ears full up).
  - **Game-driven bones:** look-at on the head, blink, and the ears.
  - The hare is shown on the Task 9 review sheet with the other six animals.
  - The unrigged `visitor_hare` ships in this PR as `ready`, so the game draws it at once (G-H1 scales it). The rig re-skins it
    later on `art/animal-rigs` (owner-confirmed 2026-10-25).

## 4. Tests and checks

- **Red-green:** each new check fails on the current tree before its model lands.
- **`models.test`:** a shelter entry (bounds, base at y 0, open front +Z, one material, ≤ 600 tris) and the identical
  `sheep_shelter` bytes.
- **M-SH5:** the hay stays inside the accent band (ART-BIBLE §B.1, accents ≤ 0.70): the paper cell × COLOR_0 is sampled in linear
  light; area-weighted mean saturation ≤ 0.68, no sample over 0.70 (measured 0.665 / 0.694).
- **`assets.test`:** the coverage comes from the asset-contract classes: both shelter ids are `structure`, `visitor_hare` is `animal`.
  Nothing is added to the stand-in register.
- **The palette bands** (ART-BIBLE §B.1): the shelter is covered by `palette.test` plus M-SH5. The hare is measured by hand (fur
  mean saturation 0.51), because `palette.test` has no animal source.
- **Renders** at CAM-DESK, two orbit angles, CAM-CLOSE and CAM-PHONE, checked by hand, never one hero shot. The shelter is
  rendered in its meadow spot next to the haystacks; the hare is rendered beside the shelter for scale. The renders are three.js
  approximations, not game captures.

## 5. Handoff

- **The shelter:** a PR from `art/shelter-hare` once the owner has seen the renders, with the G-item for the game session.
- **The hare:** the unrigged `visitor_hare` ships in this PR as `ready` (owner-confirmed 2026-10-25), so the game draws it at once
  (G-H1 scales it). After its rig on `art/animal-rigs`, the rigged `hare_rig` re-skins it, with the GAME-NOTE covering the hare's
  loader and clips.
