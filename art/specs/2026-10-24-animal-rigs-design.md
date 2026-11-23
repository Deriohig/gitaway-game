# Animal rigs: design

- **Date:** 2026-10-24
- **Branch:** `art/animal-rigs`
- **Status:** built (owner's style calls settled under R37, 2026-10-26)

## Goal

Today the animals look stiff. The owner said, of the dog: "It just keeps the same expression."

The goal is animals that feel alive:
- varied idles;
- real walk cycles;
- small expressions: blinking, ears, head turns, chewing, panting;
- behaviours that use them.

**Owner decisions (2026-10-24)**
- Rig the animals in Blender (headless, scripted, in WSL).
- Rig all animals in one batch.
- The game drives the bones live, and also plays clips authored in Blender.

## Where we are

- No animal has a skeleton, animation clips or morph targets. The game moves 1–3 rigid pieces per animal in `useFrame`. The survey is in this session's scratchpad (`anim-survey`).
- **Dog** (Meshy batch 2):
  - It has body, `Head` and `Tail` pieces.
  - Its tail wags at one fixed speed forever.
  - Its head only nods down.
  - Its face is painted in a 512 px atlas, and its ears and tongue are part of the body mesh.
  - The head is modelled turned about 45° to its left, so it always looks the same way (measured 37° yaw, 15° roll on the rig build).
- **Cat** (`cat_sleeping`): curled up asleep, eyes painted shut. It only breathes and tilts its head.
- **Goat, chicken:** body + `Head`. They wander and graze or peck.
- **Duck:** one piece with folded wings and no legs. It bobs.
- **Sheep:** procedural stand-in with no eyes. A replacement is being chosen (Meshy pilot against the Blender pilot).
- The dog behaviours in `docs/idle-loop.md` were never built: trotting the path, sitting by the door, herding sheep, its name on tap.

## Scope

**In:** dog, cat, goat, chicken, duck, sheep, and the brown hare (`visitor_hare`, added by ruling R28 once its model shipped).

**Sheep.** The sheep is rigged last.
- It rigs whichever sheep the owner picks after the Blender pilot comparison.
- If no pick has been made by then, it rigs today's `sheep.glb`, which still needs eyes for blinking. The rig script takes the model as an input, so it re-runs on the new sheep later.

**Out:**
- Barnaby (a humanoid rig is its own job; listed as a follow-up);
- bees, birds and fireflies;
- all game code. The game session owns `src/`; see the game handoff section.

## The rigs

**Bones** use one naming scheme across all animals:
- `root`, `hips`, `spine`, `chest`, `neck`, `head`, `jaw`;
- `ear_L`/`ear_R` and `lid_L`/`lid_R`;
- `tail_1`…`tail_3` (the dog's tail has a fourth, `tail_4`: 23 bones);
- `leg_FL_1`/`leg_FL_2` (and FR, BL, BR), or `leg_L_1`/`leg_L_2` for birds;
- `wing_L`/`wing_R`.

Each animal uses the subset it needs. Names use underscores, never dots: three.js strips dots from node names, so `ear.L` would reach the game as `earL`.

| Animal | Bones | Clips | Expression |
|---|---|---|---|
| Dog | root, hips, spine, chest, neck, head, jaw, ears, lids, tail ×4, 4 legs × 2 (23) | `Idle` (breathing, weight shift) · `Walk` · `Sniff` (nose down, loop) · `Sit` · `Lie` · `Sleep` · `PlayBow` · `Scratch` · `Happy` (wiggle) | blink, ears perk/droop, pant (jaw bob), head look |
| Cat (asleep) | root, spine, chest, neck, head, ears, tail ×3 (10) | `Sleep` (breathing loop) · `EarTwitch` · `TailFlick` · `Peek` (head lifts, looks round, settles) | ear twitch; the eyes stay shut, since they're painted and the cat is a sleeper |
| Goat | root, hips, spine, neck, head, jaw, ears, lids, tail, 4 legs × 2 (19) | `Idle` · `Walk` · `Graze` (head down, chewing, loop) · `Chew` · `Hop` (playful buck) · `HeadShake` | blink, ear flick, chewing |
| Chicken | root, hips, neck, head, lids, tail, wings, 2 legs × 2 (13) | `Idle` (head jerks) · `Walk` (head bob) · `Peck` · `Scratch` · `Flap` (small wing lift) · `Fluff` | blink, head tilt |
| Duck | root, hips, neck, head, lids, tail, wings (9) | `Idle` (float, head turns) · `Paddle` (tail waggle, loop) · `Preen` · `Dabble` (tip-up) · `Shake` | blink |
| Sheep | root, hips, spine, neck, head, jaw, ears, lids, tail, 4 legs × 2 (19) | `Idle` · `Walk` · `Graze` · `Hop` · `Bleat` (head up, jaw open) | blink, ear flick, chewing |
| Hare | root, hips, spine, neck, head, ear_L/R ×2, lids, 4 legs × 2, tail (20) | Idle (nose twitch) · Look · EarTwitch · Groom · Hop (lands in the sit) · Alert | blink, ear flick, look |

**Clip types**
- *loop:* `Idle`, `Walk`, `Sniff`, `Sleep`, `Graze`, `Chew`, `Paddle`;
- *hold:* `Sit`, `Lie`. They ease in and hold the last frame, and the game crossfades out;
- *once:* everything else. These start and end on the rest pose.

**Expression pieces**
- **Eyelids:** small caps of 6–12 triangles each, over the painted eyes.
  - Each cap is weighted to its `lid` bone and sits at scale 0 when open and 1 when closed.
  - The caps are UV'd onto fur-coloured texels already in the atlas. The atlas itself isn't recoloured or flattened.
  - The eyes themselves can't look around; the head and neck do the looking.
- **Ears:** weighted regions of the existing mesh, moving at most ±25° so the geometry doesn't tear.
- **Jaw:** weighted to the lower jaw region, moving at most ±8°. It gives the dog's pant and the goat's and sheep's chew.
- **Limits:**
  - The cat's curl and the duck's and chicken's moulded wings limit how far those parts can move, so their clips keep angles small.
  - No clip re-poses the cat into standing.

**Rest pose:** neutral and symmetric, head facing forward.
- Every animal's rest head faces forward and level (ruling R29). The dog's, goat's and sheep's heads were modelled turned and are straightened in Blender, baked as the new rest geometry (each listed in `restChanged`).
- Otherwise the mesh is today's mesh. The `Head`/`Tail` pieces are joined back into one mesh.

## Asset contract

**Files**
- Each rigged model publishes as `public/models/<id>_rig.glb`, next to today's file. The game keeps working unchanged until it switches each animal over. The old files retire in a later cleanup, once nothing references them.
- **Per-animal data:** `public/models/rigs.json`. It lists each animal's clips with their type and duration, the walk stride (units per cycle, so the game can match the walk speed and avoid foot sliding), and the bones the game may drive live.

**Each `<id>_rig.glb`**
- One skinned mesh, one primitive, one material: today's atlas, JPEG ≤ 512.
- Core glTF only, no extensions, 30 fps keys.
- At most 24 bones and 4 weights per vertex, with weights normalised.
- **Geometry:**
  - Same facing, ground origin and scale as today.
  - Bounds within ±3% per axis, except where the dog's head is straightened.
  - At most 40 extra triangles (eyelids). The dog keeps its existing triangle exception (1918).
  - The sheep's rig (1,568 tris) is a named owner exception (R37).
- File ≤ 400 KB. (Ruling R13, 2026-10-25: raised from this spec's first estimate of 250 KB, which the dog's nine clips
  exceed; the cap is visible to the owner in the review sheet.)

**Live bones:** the game may layer its own offsets after the clips each frame on `head`, `neck`, `lid_*`, `ear_*` and `tail_*`. That covers looking around, blinking, ear twitches and wagging by mood.

## Pipeline

- **Blender:** 5.2.3 LTS (`~/.local/blender/b52`), headless. The Blender pilot's re-run on 5.2 confirms the switch.
- **Scripts:**
  - `art/blender/rigs/common.py`: import, rejoin parts, build the armature from a bone spec, weights, eyelids, clips, export.
  - One `art/blender/rigs/<animal>.py` per animal: bone landmarks and clip keys as data.
  - `art/blender/rigs/build.sh` builds all seven.
- **Weights:** Blender's automatic weights first. Meshy meshes are often non-manifold, so the fallback is distance-to-bone region weights with smoothing. The existing clean `Head`/`Tail` cut planes (test P15) give exact head and tail regions.
- **Clips:** keyed by code (phase-offset gait cycles, eased one-shots), not by hand. They rebuild deterministically, and tuning one is a number change.

## Verification

**Art tests:** new AR-series (AR1–AR7) in `art/scripts/tests/rigs.test.mjs` (the `R` prefix is taken by the roof tests). Each one is shown failing before the fix and passing after.
- AR1 contract: one skinned mesh, the bone names, ≤ 24 bones, ≤ 4 normalised weights, core glTF, JPEG ≤ 512.
- AR2 clips match `rigs.json`: names, durations, types. Loops end where they start.
- AR3 rest pose matches the source model (≤ 0.005 u, the straightened dog head excepted), plus bounds, ground and facing.
- AR4 no tearing: across every frame of every clip, no edge stretches more than 1.6× its rest length.
- AR5 the walk stride matches `rigs.json` (foot slide ≤ 10%).
- AR6 budgets: triangles, file size, one mesh per animal.
- AR7 three.js load: GLTFLoader, `SkeletonUtils.clone` and AnimationMixer play every clip without errors.

**Renders**
- Per animal: every clip at 3 orbit angles plus the default game camera.
- GIFs at in-game size, for phone and desktop zoom.

**Owner review:** all seven animals in one sheet. The game handoff waits for the owner's yes.

## Game handoff

The game session builds this; I write the note.

- **Loader:** `Asset` must clone skinned scenes with `SkeletonUtils.clone`, since `scene.clone(true)` shares one skeleton across copies. It must also keep `animations`, which it drops today.
- **Rig hook:**
  - one AnimationMixer per animal, 0.25 s crossfades;
  - walk speed matched to the stride.
- **Live layer:**
  - head and neck look-at, clamped per animal to the measured ellipse in rigs.json `look` (ruling R31; the flat ±60° tears the dog and chicken), on tap or when the player is near;
  - a random blink every 2–6 s;
  - ear twitches;
  - tail wag speed by mood.
- **Behaviours** use the clips. The dog's states, including those from `docs/idle-loop.md`: wander, sniff, sit, lie, sleep, trot the path, sit by the door, herd sheep, name on tap. The cat sleeps and peeks when tapped.
- **Motion setting:** `calm` plays fewer one-shots, more slowly; `still` holds the idle pose. The frame loop stays on demand.
- **Performance:**
  - Skip mixer updates for off-screen animals.
  - Draw calls go down: the dog drops from 3 meshes to 1, and the cat, goat and chicken from 2 to 1. Each mesh draws twice, counting shadows.

Until the game work lands, nothing changes on screen.

## Risks

- **Weights on Meshy meshes.** Caught by AR4 and the renders.
- **Moulded parts limit the range** (the cat's curl, the birds' wings). The clips stay small there.
- **Painted eyes can only be covered by lids, not moved.**
- **The game work is a sizeable job of its own,** and it comes after the art.

## Follow-ups (not in this batch)

- A Barnaby rig.
- Retiring the old animal GLBs once the game has switched over.
