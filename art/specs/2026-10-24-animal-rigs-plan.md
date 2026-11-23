# Animal Rigs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skinned, animated GLBs (`public/models/<id>_rig.glb`) and `public/models/rigs.json` for the dog, cat, goat, chicken, duck, sheep and hare, built by headless Blender scripts and proven by a three.js-side checker.

**Architecture:**
- **Shared toolkit.** One Blender Python module (`art/blender/rigs/common.py`) imports each animal's current GLB and joins its parts. It builds an FK armature from glTF-space landmarks, skins it, adds eyelid caps, keys clips from pose functions sampled at 30 fps, and exports.
- **Finalize step.** A Node script (`art/scripts/rig-finalize.mjs`) restores the source atlas bytes, normalises the file and merges the animal's sidecar into `rigs.json`.
- **Checker.** A Node checker (`art/scripts/lib/rig-checks.mjs`, driven by `tests/rigs.test.mjs`) loads each rig in three.js, plays every clip and checks it against the contract. It is proven first on small Blender-built fixtures.

**Tech Stack:**
- Blender 5.2.3 LTS (bpy, glTF exporter);
- Node 22;
- `art/scripts`: `@gltf-transform/core` 4, three 0.160 (GLTFLoader, SkeletonUtils, AnimationMixer);
- ffmpeg for GIFs.

**Spec:** `art/specs/2026-10-24-animal-rigs-design.md`

## Global Constraints

**Workspace**
- Worktree `/home/me/Projects/gitaway-art-rigs`, branch `art/animal-rigs`.
- Write only under `art/` and `public/models/`. Never edit `src/`, never touch `main`, and never touch the main tree `/home/me/Projects/gitaway`.
- Run Linux work in WSL Ubuntu-24.04 through script files. Files written through `\\wsl.localhost` paths become root-owned: `wsl.exe -d Ubuntu-24.04 -u root -- chown -R $USER:$USER <path>`.

**Tools**
- Blender: `~/.local/blender/b52/blender -b --factory-startup --python <script> -- <args>`, one Blender process per animal.
- Node: `export PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH`.
- Art tests run from `art/scripts`: `node tests/<name>.test.mjs`. Run `npm ci` in `art/scripts` once first.

**Naming**
- Bone names are lowercase with underscores, never dots: `ear_L`, `leg_FL_1`, `tail_2`. three.js strips `.` from node names (`PropertyBinding.sanitizeNodeName`), so `ear.L` would reach the game as `earL`.
- Outputs:
  - `public/models/<id>_rig.glb`, where `<id>` ∈ `dog`, `cat_sleeping`, `goat`, `chicken`, `duck`, `sheep`, `hare`;
  - `public/models/rigs.json`.
- Today's GLBs, `manifest.json` and `publish-models.mjs` stay untouched, and `tests/models.test.mjs` stays green.

**Contract for each `<id>_rig.glb`**
- One skinned mesh node, one primitive, one material named `<id>`.
- At most 24 joints. One `JOINTS_0`/`WEIGHTS_0` set only, with weights summing to 1 ± 1e-3.
- Empty `extensionsUsed`, no morph targets.
- The source GLB's JPEG image bytes, unchanged.
- At most the source's triangles + 40, and ≤ 400 KB (ruling R13; first planned as 250 KB).
- **Default pose** (joint node TRS, no clip applied):
  - matches the source within 0.005 u, except the bones listed in the entry's `restChanged`;
  - bounds within ±3% per axis;
  - ground (min y) within 0.005 of the source;
  - facing: `+Z` for all but `cat_sleeping`, which faces `+X`.
- `left` means `up × forward` (+X for a +Z-facing animal, −Z for the cat). Every `_L` bone's head lies on that side.

**Clips**
- Sampled and keyed at 30 fps.
- `root` is never animated. The game moves the object.
- Types:
  - `loop`: the first frame equals the last;
  - `hold`: starts at the default pose, eases in over ≥ 0.3 s, and the game holds its last frame;
  - `once`: starts and ends at the default pose.
- Each clip's rotation and scale keys are separated into the clip's own glTF animation, named exactly as in the clip tables below.

**Motion limits**
- Ears ±25°, jaw ±8°.
- Chicken wings ≤ 20°, duck wings ≤ 12°.
- The cat never leaves its curl (spine and neck ≤ 15°, `Peek` head lift ≤ 25°).

**Eyelids**
- 6–12 triangles a side, a cap hinged at the top of the painted eye and conforming to the head 0.002 u proud at its edges; it may dome up to 0.005 u proud at the centre (ruling R17).
- All of a cap's UVs sit on one fur texel sampled just above that eye.
- Default joint scale 0 (open); uniform scale 1 means closed.

**Textures:** never recolour, flatten or re-encode the atlas (owner rule).

**Process**
- Red-green: show every new check failing before the change that makes it pass, and report both.
- Before a task is done, look at every clip at 3 orbit angles plus the game camera (orthographic, azimuth 45°, elevation 29°).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No PRs. Implementers never dispatch subagents.

## Review Focus

1. **Eyelids showing while open.** Expected invisible: every lid vertex sits within 0.002 u of its lid joint at the default pose. The Task 1 check AR3 enforces this, with fixture `bad_lid`.
2. **Two instances of one animal.** They must animate independently: two `SkeletonUtils.clone`s playing different clips have different joint matrices, and the source scene stays at its default pose. Check AR7, Task 1.
3. **Clips that drift the animal.** These snap on crossfades. Expected: `root` has no animation channel at all, and the translation of every direct child joint of `root` (`hips`; the cat's `spine`, ruling R19) stays within ±0.05 u of default in x and z (drift is horizontal) and within −0.20…+0.10 u in y, so `Sit`, `Lie` and `Sleep` can lower the body onto the ground and a hop can lift it (ruling R15). Check AR2, fixture `bad_rootmotion`.
4. **Left and right swapped.** Head look-at and ear twitches would go the wrong way. Expected: every `_L` joint lies on the animal's left side by the `up × forward` rule: left of its `_R` partner, or of the source's box centre when it has none (the curled cat lies off its box centre). Check AR1, fixture `bad_side`.
5. **Blender playback differing from three.js playback.** This happens with scale inheritance or bone roll. Expected: probe vertices posed by three.js match Blender's evaluated positions within 0.002 u at the start, middle and end of every clip. Check AR7, from the `<id>.probe.json` sidecar.

---

### Task 1: Rig checker, finalize step and fixtures

**Files:**
- Create: `art/scripts/lib/rig-inspect.mjs`, `art/scripts/lib/rig-checks.mjs`, `art/scripts/rig-finalize.mjs`, `art/scripts/tests/rigs.test.mjs`
- Create: `art/blender/rigs/fixtures.py`, `art/blender/rigs/fixtures.sh`
- Create: `art/scripts/tests/fixtures/rigs/`. It holds:
  - `source.glb` (unrigged, JPEG atlas);
  - `good.glb` + `good.json` + `good.probe.json`;
  - `bad_names`, `bad_loop`, `bad_rootmotion`, `bad_tear`, `bad_lid`, `bad_side`, `bad_atlas` (`.glb` + `.json` each);
  - `bad_slide.json`, which pairs with `good.glb`.
- Create: `public/models/rigs.json` = `{"version":1,"animals":{}}`

**Interfaces:**
- **Produces, for every later task:**
  - Entry schema (one per animal in `rigs.json` → `animals[id]`, also the fixture `.json` files): `{ file, source, facing: "+Z"|"+X", bones: string[], live: string[], lids: string[], restChanged: string[], clips: { [name]: { type: "loop"|"hold"|"once", duration: number, stride?: number } } }`. Here `stride` is the units travelled per `Walk` cycle; `restChanged` lists bones whose skinned region may differ from the source.
  - `loadRig(glbPath: string): Promise<Rig>` in `rig-inspect.mjs`. `Rig = { doc, scene, mesh /* THREE.SkinnedMesh */, clips /* THREE.AnimationClip[] */, bones: string[], tris: number, kb: number, imageBytes: Uint8Array }`. It parses through gltf-transform, strips textures for three, then runs `GLTFLoader.parse`.
  - `loadSource(glbPath: string): Promise<{ positions: Float32Array, box, tris: number, imageBytes: Uint8Array }>`, with all mesh nodes in model space.
  - `poseAt(rig: Rig, clip: string | null, t: number): Float32Array`: skinned positions in model space; `null` gives the default pose.
  - `rig-checks.mjs` exports `CHECKS = { AR1, AR2, AR3, AR4, AR5, AR6, AR7 }`. Each is `(rig, entry, src, probe?) => Promise<string[]>`, where an empty array means pass.
  - `node rig-finalize.mjs <raw.glb> <source.glb> <sidecar.json> <out.glb> [--rigs <rigs.json> --id <id>]`. It:
    - copies the source image bytes over the exported image;
    - names the material `<id>`;
    - drops `extensionsUsed`;
    - sets each `lids` joint's node scale to `[0,0,0]`;
    - writes the result deterministically;
    - with `--rigs`, upserts the sidecar as `animals[id]`, keys sorted, 2-space JSON.

- [ ] **Step 1: Write `fixtures.py` + `fixtures.sh`.**
  - A bar creature 0.4 u long facing +Z, with a JPEG atlas, exported once unrigged (`source.glb`).
  - Then rigged with joints `root, hips, neck, head, lid_L, lid_R, leg_L_1, leg_L_2, leg_R_1, leg_R_2`.
  - Clips `Idle` (loop 1.0 s), `Walk` (loop 0.5 s, biped gait, stride measured), `Sit` (hold 0.5 s) and `Wave` (once 0.8 s).
  - Each `bad_*` variant breaks exactly one rule, named by its file:
    - `bad_names`: a joint called `ear.L`;
    - `bad_loop`: `Idle`'s last frame is off;
    - `bad_rootmotion`: `root` is keyed;
    - `bad_tear`: head vertices are weighted to `leg_L_2`;
    - `bad_lid`: the lid scale is left at 1;
    - `bad_side`: `lid_L` is on the right;
    - `bad_atlas`: finalized without restoring the image;
    - `bad_slide.json`: `good.json` with the stride doubled.
  - The `.sh` runs Blender, then `rig-finalize.mjs`, into the fixtures folder.
- [ ] **Step 2: Write `tests/rigs.test.mjs`** in the suite's `ok(name, cond, detail)` style (copy the helper from `tests/models.test.mjs:13-14`).
  - **Part A (checker self-test):**
    - every check passes on `good`;
    - each bad fixture fails exactly its target and passes the rest. Targets: `bad_names`→AR1, `bad_side`→AR1, `bad_atlas`→AR1, `bad_loop`→AR2, `bad_rootmotion`→AR2, `bad_lid`→AR3, `bad_tear`→AR4, `bad_slide`→AR5.
  - **Part B (real rigs):**
    - `const EXPECTED = []`; every id in `EXPECTED` must be in `rigs.json` with its file present;
    - every entry in `rigs.json` passes AR1–AR7 against its source and probe;
    - it prints one PASS/FAIL line per check per animal.
  - Exit code 1 on any FAIL.
- [ ] **Step 3: Run it red.**
  - Run: `cd art/scripts && node tests/rigs.test.mjs`
  - Expected: it fails because `rig-checks.mjs` and the fixtures do not exist yet.
- [ ] **Step 4: Implement `rig-inspect.mjs`, `rig-checks.mjs` and `rig-finalize.mjs`, then run `fixtures.sh`.** The checks follow Global Constraints and Review Focus:
  - **AR1 contract:**
    - joint names equal `entry.bones` (as sets);
    - no `.` in any name;
    - ≤ 24 joints, one weight set, sums 1 ± 1e-3;
    - one mesh node, one primitive, material = id;
    - no extensions, no morph targets;
    - image bytes equal the source's;
    - `live` ⊆ `bones`;
    - the `_L` side rule (each `_L` joint left of its `_R` partner, an unpaired one left of the source's box centre).
  - **AR2 clips:**
    - names equal the `entry.clips` keys, and durations within 1/30 s;
    - loop first = last (1e-4);
    - once starts and ends at default, hold starts at default (1e-3);
    - no `root` channel;
    - the translation of every direct child joint of `root` (`hips`, the cat's `spine`; ruling R19) within ±0.05 in x and z, and −0.20…+0.10 in y (ruling R15).
  - **AR3 default pose:**
    - two-way nearest-vertex distance ≤ 0.005 to the source, skipping vertices whose largest weight is on a `restChanged` or `lids` joint;
    - bounds ±3%, ground ±0.005, facing (the head joint is on the `facing` side of the box centre);
    - lid vertices within 0.002 of their joint.
  - **AR4 stretch:** at every 1/30 s of every clip, no edge longer than 1.6× its default length; no seam opening (ruling R9); and no loose shell (at most 32 vertices joined to nothing, such as a whisker, unless its bones carry nothing else) drifting more than 0.002 u from its default-pose distance to its root, the nearest vertex of the rest of the mesh (ruling R23).
  - **AR5 stride:**
    - only for entries with a `Walk` stride;
    - per foot (the lowest vertex weighted mostly to each `leg_*_2`), over the stance frames (foot y ≤ min + 0.01);
    - mean backward speed within ±10% of `stride / duration`.
  - **AR6 budgets:** tris ≤ source + 40, ≤ 400 KB (ruling R13).
  - **AR7 three.js playback:**
    - GLTFLoader names equal `entry.bones`;
    - two `SkeletonUtils.clone`s on different clips give different joint matrices, with the original unchanged;
    - when a probe is given, the probe vertices (matched by default-pose position < 1e-4) match `probe.json` within 0.002 at each recorded time.
  - `probe.json` = `{ times: {clip: number[]}, points: [{ rest: [x,y,z], posed: {clip: [[x,y,z], …]} }] }`. Blender writes it in glTF space with one vertex per weighted bone, topped up to 24 evenly by index, sampled at frames 0, n/4, n/2, 3n/4 and n (every frame for n ≤ 10; R14).
- [ ] **Step 5: Run it green.**
  - Run: `node tests/rigs.test.mjs` → Part A all PASS, Part B prints "0 animals".
  - Run: `node tests/models.test.mjs` → unchanged PASS count.
- [ ] **Step 6: Commit.** `git add art/scripts art/blender/rigs public/models/rigs.json && git commit -m "art(rigs): rig checker, finalize step, fixtures"`

### Task 2: Blender toolkit, review renders, dog rig with `Idle` + `Walk`

**Files:**
- Create: `art/blender/rigs/common.py`, `art/blender/rigs/dog.py`, `art/blender/rigs/render_clips.py`, `art/blender/rigs/build.sh`, `art/blender/rigs/README.md`
- Create: `public/models/dog_rig.glb`; Modify: `public/models/rigs.json`, `art/scripts/tests/rigs.test.mjs` (`EXPECTED`)

**Interfaces:**
- **Consumes:** the Task 1 entry schema, `probe.json` format, `rig-finalize.mjs` CLI.
- **Produces** (`common.py`, used by every animal script):
  - `g2b(p) -> Vector` (glTF → Blender axes) and `b2g(v) -> tuple`.
  - `load_source(path: str, id: str) -> Object`: imports, joins parts into one mesh named `id`, applies transforms.
  - `build_armature(mesh, bones: list[dict(name, head, tail, parent)]) -> Object`, with heads and tails in glTF coordinates.
  - `skin(mesh, arm, method: "auto"|"distance" = "auto", region: dict[str, Callable[[Vector], bool]] | None = None)`: automatic weights. If Blender reports a failure, fall back to distance-to-segment weights with 2 smoothing passes. `region` forces vertices to a bone (e.g. the head side of the `Head` cut plane).
  - `add_lids(mesh, arm, eyes: dict[side, dict(top, centre, radius)], fur_uv: dict[side, (u, v)])`.
  - `apply_rest(mesh, arm, pose: dict[bone, (rx, ry, rz) degrees])`: bakes a pose into the mesh and makes it the rest pose (the dog's head straightening).
  - `key_clip(arm, name, kind, duration, pose_fn: Callable[[float], dict[bone, dict(rot=(x,y,z)°, loc=(x,y,z), scale=s)]])`: sampled every 1/30 s, loop end = start enforced.
    - Every bone is keyed in every clip, because the exporter force-samples all bones.
    - Bones missing from `pose_fn`'s dict are keyed at the default pose.
    - The default pose for `lids` bones is scale 0 (open). Otherwise force-sampling would export them at their bind scale 1, and the eyes would stay closed for the whole clip.
  - `gait(t, duration, phases: dict[leg, float], swing_deg, lift, stance=0.6) -> dict`: quadruped phases `BL 0, FL 0.25, BR 0.5, FR 0.75`; biped `L 0, R 0.5`.
  - `measure_stride(arm, mesh, clip) -> float`.
  - `export(arm, mesh, raw_path, sidecar: dict, probe_path)`. Verify the exporter argument names on 5.2 with `bpy.ops.export_scene.gltf.get_rna_type()` before relying on them. Settings:
    - `export_format='GLB'`;
    - `export_animation_mode='ACTIONS'`;
    - `export_force_sampling=True`, `export_frame_step=1`;
    - `export_def_bones=False`, `export_skins=True`, `export_morph=False`;
    - `export_yup=True`, `use_selection=True`.
  - `run(animal_module)`: the CLI entry each animal script calls: `-- --source <glb> --out <dir>`.
- **Produces** (`render_clips.py`): `-- --rig <glb> --out <dir>` writes:
  - `<id>_sheet.png`: every clip at 6 evenly spaced frames × (3 orbit angles + the game camera);
  - `<id>_<clip>.gif`: the game camera at 96 px (phone zoom) and 192 px (desktop max zoom).

  Use the faster of Workbench or EEVEE as measured. The thumbnail trial found a second EEVEE render in one process about 5× slower, so batch across processes if that holds. Assemble with ffmpeg (`palettegen`/`paletteuse`). All media for one animal should take ≤ 10 min.
- **Produces** (`build.sh`):
  - `build.sh <id>…` (or `all`) runs Blender → `rig-finalize.mjs --rigs public/models/rigs.json --id <id>` → `public/models/<id>_rig.glb`;
  - `build.sh --check <id>` rebuilds into a temp dir and fails unless the bytes are identical.

**Dog values** (source `public/models/dog.glb`; it faces +Z; its `Head`/`Tail` pivots sit at the cut planes, which `region` uses):
- **Bones (23; `tail_4` added in Task 3b for a smoother wag):** `root, hips, spine, chest, neck, head, jaw, ear_L, ear_R, lid_L, lid_R, tail_1, tail_2, tail_3, tail_4, leg_FL_1, leg_FL_2, leg_FR_1, leg_FR_2, leg_BL_1, leg_BL_2, leg_BR_1, leg_BR_2`.
- **Live:** `head, neck, lid_L, lid_R, ear_L, ear_R, tail_1, tail_2, tail_3, tail_4`.
- **Head:** the head is modelled turned to one side. Measure the yaw (and any roll) of the snout-tip direction off +Z, then `apply_rest` on `neck`/`head` until the snout tip's x is within 0.01 of the body's midline x.
- `restChanged`: `neck, head, jaw, ear_L, ear_R, lid_L, lid_R`.
- **Landmarks:** measure them with a probe script (orthographic renders plus vertex queries) and record them as data in `dog.py`: hips, shoulders, the four paw centres, the neck base, the skull centre, the jaw hinge, both ear roots and tips, the tail base and tip, and each eye's top, centre and radius.
- **Clips this task:** `Idle` (loop 3.0 s: breathing via `chest` scale ≤ 3%, a slow weight shift, a tail sway) and `Walk` (loop 0.6 s, `gait` quadruped, head bob ≤ 4°). Record the measured stride.

- [ ] **Step 1: Add `'dog'` to `EXPECTED`. Run `node tests/rigs.test.mjs`: it fails because `dog` is missing from `rigs.json`.**
- [ ] **Step 2: Implement `common.py`, `dog.py` (`Idle` + `Walk` only), `render_clips.py`, `build.sh`, and the README (how to build, render and check).**
- [ ] **Step 3: Run `art/blender/rigs/build.sh dog`, then `node tests/rigs.test.mjs`.** Expected: Part A PASS, and dog AR1–AR7 PASS.
- [ ] **Step 4: Check determinism.** Run `build.sh --check dog`; expected "identical".
- [ ] **Step 5: Render.** Run `render_clips.py` for the dog into `art/blender/rigs/.build/review/` (git-ignored; add the ignore line). Look at the sheet and both GIFs:
  - the head faces forward;
  - no tearing at the shoulders or hips;
  - the feet plant during the walk;
  - the lids are invisible.

  Fix and repeat until all four hold.
- [ ] **Step 6: Commit.** `git commit -m "art(rigs): Blender rig toolkit, review renders, dog Idle + Walk"`

### Task 3: Dog's remaining clips

**Files:** Modify `art/blender/rigs/dog.py`, `public/models/dog_rig.glb`, `public/models/rigs.json`.

**Interfaces:**
- **Consumes:** `key_clip` and the pose-function format from Task 2.
- **Produces:** the dog's full clip set in `rigs.json`.

**Clips** (target durations; adjust up to ±25% after review and record the actual):

| Clip | Type | Duration | Action |
|---|---|---|---|
| `Sniff` | loop | 2.0 s | nose down, small head sweeps, ears forward |
| `Sit` | hold | 0.5 s | hips down, front legs straight, tail curled round |
| `Lie` | hold | 0.8 s | from standing to chest down, head up |
| `Sleep` | loop | 4.0 s | on `Lie`'s end pose: head down on paws, lids closed (scale 1), slow breathing |
| `PlayBow` | once | 1.4 s | chest down, rear up, fast tail |
| `Scratch` | once | 1.6 s | hind leg scratching behind the ear, head tilted |
| `Happy` | once | 1.2 s | hip and tail wiggle, ears back, a jaw pant at ±8° |

- [ ] **Step 1: Add the seven clip names to the dog's expected clip list in the test (a per-id `EXPECTED_CLIPS` map in Part B). Run: it fails, missing clips.**
- [ ] **Step 2: Author the pose functions in `dog.py` and rebuild with `build.sh dog`.**
- [ ] **Step 3: Run `node tests/rigs.test.mjs`.** All dog checks PASS; AR4 shows no tearing in `Sit`, `Lie` or `Scratch`.
- [ ] **Step 4: Render.** Review every clip at 3 angles plus the game camera. `Sleep` must start exactly from `Lie`'s last frame (compare the two frames side by side in the sheet).
- [ ] **Step 5: Commit.** `git commit -m "art(rigs): dog behaviour clips"`

### Task 4: Cat (asleep)

**Files:** Create `art/blender/rigs/cat_sleeping.py`, `public/models/cat_sleeping_rig.glb`; Modify `rigs.json`, the test's `EXPECTED`/`EXPECTED_CLIPS`.

**Values:**
- Source `cat_sleeping.glb`, facing `+X`. Its `Head` pivot is at the back-top of the head, so the chin-up tilt turns about it.
- **Bones (10):** `root, spine, chest, neck, head, ear_L, ear_R, tail_1, tail_2, tail_3`.
- **Live:** `head, neck, ear_L, ear_R, tail_1, tail_2, tail_3`. No lids (the eyes are painted shut). `restChanged` is empty.

**Clips:**

| Clip | Type | Duration | Action |
|---|---|---|---|
| `Sleep` | loop | 4.0 s | `chest` breathing, the existing ±4% feel |
| `EarTwitch` | once | 0.6 s | one ear flicks |
| `TailFlick` | once | 1.0 s | the tail tip curls and settles |
| `Peek` | once | 3.0 s | head lifts ≤ 25°, turns toward the camera side, settles |

Spine and neck stay ≤ 15°.

- [ ] **Step 1: Add the cat to `EXPECTED`/`EXPECTED_CLIPS` and run: red (missing).**
- [ ] **Step 2: Write `cat_sleeping.py` and run `build.sh cat_sleeping`.**
- [ ] **Step 3: Run the test: cat AR1–AR7 PASS.**
- [ ] **Step 4: Render and review.** The curl holds, the tail doesn't pass through the body, and there's no tearing at the neck.
- [ ] **Step 5: Commit.** `git commit -m "art(rigs): sleeping cat"`

### Task 5: Goat

**Files:** Create `art/blender/rigs/goat.py`, `public/models/goat_rig.glb`; Modify `rigs.json`, the test lists.

**Values:**
- Source `goat.glb`, facing +Z. Horns and beard ride the head, so `region` forces the horn vertices to `head` (test P15's cut is clean).
- **Bones (19):** `root, hips, spine, neck, head, jaw, ear_L, ear_R, lid_L, lid_R, tail_1, leg_FL_1, leg_FL_2, leg_FR_1, leg_FR_2, leg_BL_1, leg_BL_2, leg_BR_1, leg_BR_2`.
- **Live:** `head, neck, lid_L, lid_R, ear_L, ear_R, tail_1`. `restChanged`: neck, head, jaw, ear_L, ear_R, lid_L, lid_R (R29).

**Clips:**

| Clip | Type | Duration | Action |
|---|---|---|---|
| `Idle` | loop | 3.0 s | — |
| `Walk` | loop | 0.8 s | quadruped `gait`, stride recorded |
| `Graze` | loop | 2.4 s | head down, jaw chewing at ±8° |
| `Chew` | loop | 1.2 s | standing chew |
| `Hop` | once | 0.9 s | playful buck, all four feet leave the ground (≤ 0.08 u is the clearance; each tucked hoof ≤ 0.16, R35) |
| `HeadShake` | once | 0.8 s | — |

- [ ] **Step 1: Add the goat to the test lists and run: red.**
- [ ] **Step 2: Write `goat.py` and run `build.sh goat`.**
- [ ] **Step 3: Run the test: goat PASS (AR5 included).**
- [ ] **Step 4: Render and review.** The horns stay rigid, the beard follows the jaw, and the feet plant.
- [ ] **Step 5: Commit.** `git commit -m "art(rigs): goat"`

### Task 6: Chicken

**Files:** Create `art/blender/rigs/chicken.py`, `public/models/chicken_rig.glb`; Modify `rigs.json`, the test lists.

**Values:**
- Source `chicken.glb`, facing +Z. Its wings are moulded into the body: lift ≤ 20°.
- **Bones (13):** `root, hips, neck, head, lid_L, lid_R, tail_1, wing_L, wing_R, leg_L_1, leg_L_2, leg_R_1, leg_R_2`.
- **Live:** `head, lid_L, lid_R, tail_1` (neck left out: it shrinks the look clamp, R31). `restChanged` is empty.

**Clips:**

| Clip | Type | Duration | Action |
|---|---|---|---|
| `Idle` | loop | 2.4 s | quick head jerks, holds |
| `Walk` | loop | 0.5 s | biped `gait`, head bob forward and back, stride recorded |
| `Peck` | once | 0.9 s | three pecks |
| `Scratch` | once | 1.2 s | one leg scrapes back twice, then a look |
| `Flap` | once | 0.8 s | — |
| `Fluff` | once | 1.0 s | body puff via `hips` scale ≤ 8%, then a shake |

- [ ] **Step 1: Add the chicken to the test lists and run: red.**
- [ ] **Step 2: Write `chicken.py` and run `build.sh chicken`.**
- [ ] **Step 3: Run the test: chicken PASS.**
- [ ] **Step 4: Render and review.** The comb and wattle stay on the head, the wings don't tear, and the feet plant.
- [ ] **Step 5: Commit.** `git commit -m "art(rigs): chicken"`

### Task 7: Duck

**Files:** Create `art/blender/rigs/duck.py`, `public/models/duck_rig.glb`; Modify `rigs.json`, the test lists.

**Values:**
- Source `duck.glb`: one mesh with no `Head` node, facing +Z, its hull bottom at y −0.05. Wings are moulded in: lift ≤ 12°. There are no legs.
- **Bones (9):** `root, hips, neck, head, lid_L, lid_R, tail_1, wing_L, wing_R`.
- **Live:** `head, neck, lid_L, lid_R, tail_1`. `restChanged` is empty. No stride.

**Clips:**

| Clip | Type | Duration | Action |
|---|---|---|---|
| `Idle` | loop | 3.0 s | float bob on `hips` ≤ 0.012 u, head turns |
| `Paddle` | loop | 1.0 s | tail waggle, slight forward lean |
| `Preen` | once | 2.0 s | head turns back to the wing |
| `Dabble` | once | 2.2 s | tip-up: `hips` pitches forward ≤ 70°, tail up, back |
| `Shake` | once | 0.8 s | — |

- [ ] **Step 1: Add the duck to the test lists and run: red.**
- [ ] **Step 2: Write `duck.py`. The neck/head region comes from distance weights or a plane, since there's no cut. Run `build.sh duck`.**
- [ ] **Step 3: Run the test: duck PASS.**
- [ ] **Step 4: Render and review.** `Dabble` reads as a tip-up, and the neck doesn't pinch.
- [ ] **Step 5: Commit.** `git commit -m "art(rigs): duck"`

### Task 8: Sheep

**Input:**
- `--source` is the sheep the owner picked after the Blender pilot comparison: the Blender pilot sheep, the Meshy `sheep_meshy.glb`, or today's `sheep.glb`.
- If no pick has been recorded when this task starts, use today's `public/models/sheep.glb`. It is a flat-material stand-in with no eyes, so for it only:
  - drop `lid_L`/`lid_R`;
  - allow its source material count, with AR1's single-material and image-bytes rules relaxed through an entry field `materials: "source"`;
  - record this in the ledger.

**Files:** Create `art/blender/rigs/sheep.py`, `public/models/sheep_rig.glb`; Modify `rigs.json`, the test lists, and `rig-checks.mjs` (only if the `materials: "source"` relaxation is needed; add a fixture proving it).

**Values:**
- **Bones (19):** the goat's list.
- **Live:** `head, neck, lid_L, lid_R, ear_L, ear_R, tail_1`. `restChanged`: neck, head, jaw, ears, lids (R29). Source: the Meshy sheep fitted by `rig-fit-source.mjs` (`sheep_meshy_sized.glb`).

**Clips:**

| Clip | Type | Duration | Action |
|---|---|---|---|
| `Idle` | loop | 3.0 s | — |
| `Walk` | loop | 0.9 s | stride recorded |
| `Graze` | loop | 2.4 s | head down, chewing |
| `Hop` | once | 0.8 s | spring, feet ≤ 0.06 u up (clearance; each hoof ≤ 0.12, R35) |
| `Bleat` | once | 1.2 s | head up, jaw open 8° |

- [ ] **Step 1: Add the sheep to the test lists and run: red.**
- [ ] **Step 2: Write `sheep.py` and run `build.sh sheep`.**
- [ ] **Step 3: Run the test: sheep PASS.**
- [ ] **Step 4: Render and review.** The fleece doesn't tear at the legs.
- [ ] **Step 5: Commit.** `git commit -m "art(rigs): sheep"`

### Task 8b: Hare (ruling R28): source `visitor_hare.glb`, 20 bones, clips Idle/Look/EarTwitch/Groom/Hop/Alert (types as rigs.test EXPECTED_CLIPS); brief in the ledger's task-8b-brief.md.

### Task 9: Owner review sheet, game note, final checks

**Files:** Create `art/blender/rigs/GAME-NOTE.md`, `art/blender/rigs/review_sheet.py`. Modify `art/blender/rigs/README.md`.

**Interfaces:**
- **Consumes:** every `<id>_rig.glb`, `rigs.json`, `render_clips.py`.
- **Produces:**
  - `review_sheet.py -- --out <dir>` writes `owner_sheet.png` (one row per animal, its clips at the game camera) and `owner_<id>.gif` (all of that animal's clips back to back at 192 px).
  - `GAME-NOTE.md` covers, for the game session:
    - the files and the `rigs.json` schema;
    - the loader change (`SkeletonUtils.clone`, keep `animations`);
    - one mixer per animal, 0.25 s crossfades;
    - `timeScale = speed / (stride / duration)` for `Walk`;
    - the live layer (look-at clamped per animal from rigs.json `look` (R31), blink every 2–6 s, ear twitch, tail wag by mood), applied after `mixer.update`;
    - hold clips (`clampWhenFinished`), `Sleep` after `Lie`;
    - the behaviours the spec lists per animal;
    - `useMotion()` (`calm` = fewer one-shots and slower, `still` = hold the default pose);
    - skipping off-screen mixers;
    - the draw-call savings (dog 3→1 meshes, cat, goat and chicken 2→1, the sheep 4→1, ×2 passes with shadows).

- [ ] **Step 1: Run `build.sh --check all`.** Expected: all identical.
- [ ] **Step 2: Run every art test:** `for f in tests/*.test.mjs; do node $f; done` from `art/scripts`. Expected: no FAIL lines; the existing counts are unchanged.
- [ ] **Step 3: Write `review_sheet.py`, then render into `art/blender/rigs/.build/review/owner/`.**
- [ ] **Step 4: Write `GAME-NOTE.md` and update the README.**
- [ ] **Step 5: Commit and push.** `git commit -m "art(rigs): owner review sheet, game note [skip ci]"` → `git push`.
