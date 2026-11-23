# Animal rigs

Skinned, animated GLBs for the game's animals, built by headless Blender 5.2.3 from today's models and checked in three.js.
Plan: `art/specs/2026-10-24-animal-rigs-plan.md`; design: `art/specs/2026-10-24-animal-rigs-design.md`.

| File | What it is |
|---|---|
| `common.py` | the toolkit: import, armature, weights, eyelids, rest-pose straightening, clips, gait, stride, export (its docstring is the interface) |
| `<id>.py` | one animal: landmarks, bones and pose functions as data; ends with `common.run(...)` |
| `build.sh` | Blender, then `art/scripts/rig-finalize.mjs`, into `public/models/<id>_rig.glb`, `rigs.json` and `probes/<id>.probe.json` |
| `render_clips.py` | review renders: a sheet of every clip and a GIF per clip |
| `review_sheet.py` | the owner's review of all the animals at once: one sheet, a GIF per animal, the open style calls |
| `GAME-NOTE.md` | for the game session: the files, `rigs.json`, the loader change, the rig hook, the live layer and look clamp |
| `probes/<id>.probe.json` | Blender's posed positions of a few vertices; AR7 checks three.js against them (committed with the rig) |
| `fixtures.py`, `fixtures.sh` | the checker's own fixtures (Part A of the test); standalone on purpose |

Run everything from WSL with node 22 on `PATH` (`export PATH=/home/me/.nvm/versions/node/v22.23.2/bin:$PATH`) and
`npm ci` done once in `art/scripts`. `BLENDER` overrides `~/.local/blender/b52/blender`.

## Build

```bash
art/blender/rigs/build.sh dog              # or several ids, or: all
art/blender/rigs/build.sh --check dog      # rebuild in a temp dir; fails unless the GLB, probe and rigs.json are byte-identical
```

The Blender log lines start with `[rig]`: the measured head turn, foot speeds and stride, face and clip counts.

## Sources

A rig's source is the model the game places today, `public/models/<id>.glb`, unless build.sh's `SOURCE` map names another
file in `public/models` (rigs.json's `source` follows it, and AR1/AR3 judge the rig against it). The sheep's is the owner's
pick after the Blender pilot, the Meshy sheep (art/meshy-garden's `public/models/sheep_meshy.glb`, sha256 1afbb36b...), fitted
to today's `sheep.glb` size template:

```bash
cd art/scripts && node rig-fit-source.mjs <sheep_meshy.glb> ../../public/models/sheep.glb ../../public/models/sheep_meshy_sized.glb
```

`rig-fit-source.mjs` scales uniformly (0.997209: the geometric mean of the height and length ratios, so the fitted sheep is
0.718 tall, 3.0 % under the template's 0.740, and 0.838 long, 3.1 % over its 0.8125; its width, 0.489 against 0.696, is
its own slimmer build), centres the hooves' footprint where today's stand and puts the base on y 0, keeping the atlas bytes,
UVs, normals and node tree (the `Head` pivot moves with the scale). `sheep_meshy_sized.glb` is committed; `sheep.glb` stays
until the game switches to `sheep_rig.glb`. The rig's 1,568 tris (the source's 1,544 + 24 eyelid tris) are over the 1,500
animal cap: approved (R37) as a named exception in the asset contract (`EXCEPTIONS.sheep_meshy_sized`).

The hare's is `visitor_hare.glb`, the Meshy brown hare art/shelter-hare shipped (PR #76, spec
`art/specs/2026-10-25-shelter-hare-design.md` section 3), brought in byte-identical from origin/main so a later merge is clean.
It is already sized (0.209 x 0.450 x 0.265, base on y 0), so it needs no fit; `hare_rig.glb` re-skins it when the game switches.

## Check

```bash
cd art/scripts && node tests/rigs.test.mjs     # Part A: the checker on fixtures; Part B: AR1-AR7 on every rigs.json animal
```

Add the animal's id to `EXPECTED` and its clips with their types to `EXPECTED_CLIPS` in the test first (it fails until
the rig is built).

## Review

```bash
~/.local/blender/b52/blender -b --factory-startup --python-exit-code 1 --python art/blender/rigs/render_clips.py -- \
  --rig public/models/dog_rig.glb --out art/blender/rigs/.build/review --pair Lie:Sleep
```

`.build/` is git-ignored. You get `<id>_sheet.png` (every clip at 6 frames from the front, the left side, the back right
and the game camera, clips in rigs.json's sorted order) and `<id>_<clip>.gif` (the game camera at 96 px beside 192 px).
The three orbit views turn with the animal's `facing` (the cat's front is +X); the game camera stays at azimuth 45. The game
lays the porch cat facing the camera, so it sees the cat from the front: check that view too (the cat has no `--pair`).
`--pair A:B` adds two rows at the end: A's last frame above B's first frame in the four views, for a clip the game plays on
from another's held end (the dog's Sleep from Lie). About 1.5 minutes for the dog's nine clips. The ground checker scrolls
at the walk's stride, so a planted foot stands still on it. Look for: the head facing forward, no tearing at the shoulders
and hips, the feet planting, the eyelids invisible while open.

### The owner's review

```bash
~/.local/blender/b52/blender -b --factory-startup --python-exit-code 1 --python art/blender/rigs/review_sheet.py -- \
  --out art/blender/rigs/.build/review/owner
```

One Blender process loads every animal in `rigs.json` once (render_clips.py's helpers) and writes `owner_sheet.png` (one
row per animal, each clip from the game camera at its fullest frame: the frame furthest from the default pose, a hold
clip's held last frame), `owner_<id>.gif` (the animal's clips back to back at 192 px, labelled) and `owner_calls.png`: one
panel per open owner style call (the `CALLS` list at the top of the script: three renders, what the rig does now, the
option; the Walk panel measures its numbers). Edit `CALLS` as calls close or open. About 10 minutes. `--only dog,cat_sleeping`
renders a subset (the panels whose animals are all there) for a quick look. The duck stands on a water-blue plane at
the waterline, as the game draws it.

## Writing an animal

Read `common.py`'s docstring first. In short:

- **Landmarks** are glTF coordinates on the source GLB (Y up, +Z forward, left = +X; the cat: +X forward, left = -Z). Measure them with orthographic renders and
  vertex queries in a throwaway probe script, then write the numbers into `<id>.py` with a note on how each was found.
- **Bones** use the plan's names (lowercase, underscores). The lid bones' heads go at the eye tops; `add_lids` snaps them to the
  surface. `root` and `lid_*` get no automatic weights.
- **Regions**: `in_part(mesh, 'Head')` selects a source node's vertices. A region forces its vertices onto that bone's subtree.
  Outside the region the bone fades out over `BLEND` (3 cm), and the bones below it weigh nothing there.
  - `in_part(mesh, 'Head', inset, outset)` blends the bone with its parent across a band either side of the cut ring
    instead (the dog: 8 cm into the head, 2.5 cm out), so the head can turn 20 degrees without a crease at the ring.
  - `in_shell(mesh, near, 'Head')` is one closed shell of a part, such as an ear moulded on the head: a region of its own,
    so the ear turns rigidly. `in_part(..., near=)` bands only that shell of the part (the cat's Head node also holds a
    patch of its left shoulder).
  - `in_part(..., keep=True)` keeps the vertex's own bones for the rest of the band's weight instead of handing it all to the
    bone's parent (inside the part it borrows them from the nearest band vertex outside), so the band meets the weights
    beyond it without a step: the cat's chin, which rests on forearms that belong to the chest.
  - `in_reach(mesh, tip, length, inset, outset)` is a limb that joins the rest only at its root, found by walking the mesh's
    edges from its tip, so a body lying against it never joins it (the cat's tail along its body, its ears; the dog's legs).
    Bands as above.
  - A band also applies inside the region of an ancestor of its bone (an ear's band inside the head; there the outer band
    rules). Bands of unrelated bones may overlap (two legs' bands meet in the crotch): together they take the larger of
    their two shares, split between them in proportion, so the leg weight does not step twice as fast where both fade. An
    animal whose regions all band, like the cat, never uses `BLEND`.
- **Joint ramps** (`JOINTS = {bone: h}`): after the rules above, a bone and its parent split the weight they hold at each
  vertex along a smooth ramp across the plane through the joint, from all-parent h u on one side to all-bone h u on the other.
  Bone heat bends a low-poly knee across a single edge; the dog's elbows (h 0.05) and hocks (0.06) fold 90 degrees at 1.15x
  and 1.43x with ramps, against 1.85x for the hock without one. Its spine, chest and neck (0.08) bend over 16 cm, and its
  tail joints (0.03) curve instead of kinking. `{bone: (h, normal)}` sets the ramp's plane square to a glTF direction of
  your own: the goat's neck leaves its base nearly level, so the default plane stood upright and handed the neck the bib
  in front of it (Graze tore at 1.75x at the chest); tilted 45 degrees up, `(0.09, (0, 0.7, 0.7))`, the ramp crosses the
  neck's root and Graze peaks at 1.45x.
- **Loose shells** (pieces of up to `LOOSE` vertices joined to nothing: whiskers, decals) need no region: `skin()` hands
  each, whole, the final weights of its root, the nearest vertex of the rest of the mesh, so it stays on the skin it sits
  on (ruling R23). AR4 checks it. A piece whose bones carry nothing else, a limb modelled apart, keeps its own weights.
- **Taper** (`TAPER = {bone: f(p)}`): the bone keeps f of its bone-heat weight and its nearest untapered ancestor takes the
  rest. Bone heat gave the dog's neck the bib down to the elbows; the dog tapers the neck in from y 0.18 to 0.36, so the chest
  carries the bib. Keep f smooth: a hard cut on this low-poly mesh makes a single-edge crease that tears worse than the spill.
  A taper that is 1 on a banded region and its band and 0 elsewhere hands what bone heat gave that bone off its region to its
  parent instead of leaving it to the band's rules (the chicken: bone heat gave its lower flanks to the wings and legs alone,
  and with nothing left the nearest bone, a leg, took them whole).
- **Look clamp** (`LOOK = dict(yaw, pitch, bones)`, ruling R31): rigs.json's `look`, the game's live look-at limit for
  this animal (over the spec's flat 60 deg). The game turns `bones` by a look of yaw deg about the up axis and pitch deg about
  the left axis, split evenly over them, and keeps it inside the ellipse (yaw / look.yaw)^2 + (pitch / look.pitch)^2 <= 1.
  Measure it on the built rig (`lookPose` and `stretchOf` in `art/scripts/lib/rig-inspect.mjs`): yaw is the largest whole 5
  deg that keeps AR4 <= 1.6 at rest with pitch 0, then pitch the largest whole 5 deg whose ellipse holds; rigs.test checks
  both and that 5 deg more breaks 1.6. Pick the bones that give the larger yaw (the chicken's neck shrinks it: head only).
- **Weights after skin** (`weights(mesh, arm)`, optional): runs after `skin()`, before the lids. The chicken smooths the
  hips / neck / head share over its neck by position (a 2.5 cm Gaussian, so the two sides of a cut ring keep one share):
  its head band and bone heat's bumps tore the side of the neck at 1.65x for a 20 deg head turn, 1.35x smoothed.
  The duck (no cut, a neck as thick as its head) replaces the neck and head shares outright with smooth functions of
  position (`duck.neck_shares`: up a tilted neck axis, out from it), tuned on a grid against AR4 for a preen-sized turn.
- **Legs**: put each leg's top straight above its paw, with the knee a little off the top-paw line. `gait()` then plants the paws
  with two-bone IK, and `measure_stride` checks AR5's stance rule and ruling R8 before export. Pass `feet=common.Feet(arm, mesh)`
  to `gait()`: a paw tilts with its leg, and without it the toes or heel sink under the ground at the ends of the stance (the
  dog's sank 12 mm). The test checks every Walk stance frame's lowest paw vertex within 3 mm of the ground.
- **Bird feet** (the chicken): a foot as long as the leg and rigid with its shank cannot be planted by two-bone IK on its
  ground point: the IK tips it as it slides, and raising the tipped foot until its toes clear the ground folds the
  near-straight leg further (the fold ran away to 66-106 deg in `gait(..., feet=)`). `chicken._planted` keeps each foot flat
  instead (the shank at its rest angle, the drumstick turning to the knee and sliding along its length, `loc`, by the few mm
  the distance changes), and its walk rides the body on the planted leg as on a stilt (the bob), one foot down at a time,
  the swinging leg drawn up into the feathers. Its own `gait()` path and stride, so AR5 and ruling R8 hold as for the others.
- **Feet** (`common.Feet(arm, mesh)`, built in `clips(arm)`) holds each leg's ground point and sole vertices for the pose
  helpers: `feet.held(P, limit=0.045)` moves the body so it turns about the front-leg tops (limit caps the shift AR2 judges),
  `feet.planted(P, targets)` plants paws by IK without sinking a turned paw, `feet.ahead(P, leg, d, k)` finds a ground target
  in front of a posed leg, `feet.under(P, leg, k)` one under a leaning body's shoulder (a paw that steps),
  `feet.lowest(M, leg, whole=True)` the lowest point of a whole leg (a forearm lying down), and `Feet.at(M, feet.points(bones))`
  that of any bones' vertices (a tail). A helper that cannot meet its goal leaves a `feet.note()`; wrap each clip in
  `feet.checked(name, fn)` and a `feet:` line (with the notes) is logged only when a frame's final pose still sinks, so a
  normal build prints none.
- **Nothing sinks into the ground** (ruling R25; the game's terrain is uneven): the test plays every clip at 1/120 s, as the
  game interpolates it, and fails any vertex more than 0.01 u under the default pose's lowest point, with no allowances. Low
  poses clamp on `Feet`'s exact skinned heights: the dog's `_forearms_down` (the upper arm lifts the elbow), `_Tuck` (a hind
  leg folds further at the hip) and `_tail_on_ground` (tail_1 pitches up so the tail rests on the ground).
- **Floating** (the duck, ruling R32): its ground is its rest hull bottom (y -0.05, the waterline is y 0), so R25's floor is
  -0.06. `duck.Float.afloat` raises hips by however far the lowest body vertex would sink under it (exact: hips' loc moves
  every vertex alike). The one named exception, `FLOAT_DIVE` in rigs.test: Dabble's neck and head may go 0.25 u under the
  waterline, checked on their own.
- **No one-frame pops** (ruling R26): the same 1/120 s pass fails a vertex whose travel in one step is more than 3x the
  median at that point of the 3 key frames before and of the 3 after, and over 25 mm per 1/30 s (Walk's legs excepted: R8
  sets a paw down and lifts it within one key). A clamp solved frame by frame can leap: a little extra fold first pushed the
  dog's paw deeper, so the fold found jumped 0 -> 15 deg between two frames. `_Tuck` instead finds each 1/120 s sample's need
  by scanning and uses the upper envelope of the needs with a slope limit (90 deg/s), so every frame clears and none leaps.
- **Rest pose changes** (`rest()` with `apply_rest`) bake into the mesh. List every moved bone in `REST_CHANGED`. The bake
  is a sculpt, so it may use weights of its own: the sheep's neck is a wide collar of fleece, and its thin outer fringe (neck
  weight under 0.2, which AR3 still checks against the source, ruling R10) would have moved up to 9 mm with the 13.5 deg
  neck swing; `sheep.rest` bakes with the collar share cubed and gives the skin the full shares back afterwards.
- **A body with no neck** (the sheep: a ball of fleece, the head set on its front): the neck is a collar of fleece round
  the head's cut ring (`sheep.neck_share`, in `weights()`), and Graze slides it (a `loc` on `neck`) as well as nodding it.
- **Limbs welded to the body** (the hare): the forepaws are welded together on the midline and a strip of skin joins the
  forearms' backs to the belly, the long hind feet lie flat under the haunch. Weights made mirror-symmetric (`hare.weights`)
  split the paws' midline evenly between the forelegs; the elbow sits where the strip meets the forearm, so a forearm raised
  to the face turns about the strip (at the anatomical elbow, 2 cm higher, the strip tore 2.3x); a hind foot is a region by
  height (`hare._foot_region`), not a walk from the toes, which climbs the haunch's side. A paw raised above the shoulder
  goes by joint angle: `reach`'s sideways roll assumes the paw hangs below the top, and IK on a target near the shoulder
  swings the upper arm back and forth.
- **Size-scaled pops** (ruling R38, amended): rigs.test scales R26's 25 mm pop floor for every animal by its largest rest extent
  (`boxOf(poseAt(rig, null, 0))`) against the dog's 0.771 (`POP_SIZE`), so a pop of the same size relative to the body
  counts on every animal: the chicken and hare at 14.6 mm, the duck 14.7, the cat 16.9, the goat 23.2, the dog 25.0, the
  sheep 27.0. `POP_ALLOW` names R26's allowances, as `FLOAT_DIVE` names R32's: the chicken's Idle head jerks (head and neck
  vertices) and its Scratch scrape kick (`leg_R_1`, `leg_R_2`, and the `tail_1` and `hips` that ride it) are snaps by design.
  R27's stride skip covers every vertex a leg joint dominates and every seam vertex whose leg weights add up to at least 0.45
  (`LEG_SEAM`): the shoulder and hip seams riding a lifting leg, such as the goat's Walk shoulder (spine 0.499, leg_FR_1
  0.452). On c516280 that newly covers 8 chicken, 9 dog and 17 goat seam vertices in Walk (none on the sheep), and it
  silences only the goat's shoulder pair. The hare's own checks take fractions of its height.
- **Poses**: `fk(arm, P)` evaluates a pose dict, `reach(arm, P, leg, target)` plants a leg on a point under a posed body (with
  a sideways roll), `ease` is the smoothstep for once and hold clips. AR4 (stretch <= 1.6x) is the hard limit: measure what
  each joint can take by turning it alone before writing a clip (the dog: see the recipe below; the cat: head 15 deg up or 20
  deg round), and let the body pivot so no joint has to go further. A pose that needs many joints at once (the dog's
  Scratch) can be searched for: the dog's came from an annealing search that minimised the paw-to-ear distance under a
  stretch cap of 1.58x, with the shoulders held, the body shift capped and the leg kept outside the body. Each child of
  `root` (`hips`, or the cat's `spine`) may move 0.05 u sideways and along, and -0.20 to +0.10 u up and down (rulings R15,
  R19).
- **Eyelids**: `EYES[side]` takes `radius` (or an (across, up) pair for an oval), optional `shift` and `dome`; `LID_SIDES`
  is 6-12. Look at the closed caps up close in a lit render before shipping a clip that closes them.
- **Size**: the rig must stay at or under 400 KB (ruling R13; first planned as 250 KB), and the dog's mesh and atlas alone
  take 197.5 KB. Measured on the dog after rig-finalize's key reduction (ruling R11):
  - every clip costs about 12.7 KB before it moves anything, because each of the 21 bones gets rotation, location and scale
    channels (the dog now has 22 keyed bones with `tail_4`);
  - motion adds about 4.3 KB per clip-second;
  - the dog's nine clips (15.2 s) came to 360 KB; with the Task 3b clips (more motion: the wags, the new poses) 374 KB.

  Keep clips short, keep bones still unless they move, and prefer slow, smooth curves, which the reduction thins the most.

## Quadruped weighting recipe

The dog's weights (Task 3b), for the goat and sheep to follow. Bone heat alone gave the dog's front legs up to 71 % of its
bib and spread the hind legs and the neck over the flank and the chest, so any deep pose (lying, a bow, a scratch) tore past
AR4. In `<id>.py`:

1. **Front legs: the knee at the elbow.** `leg_F*_1` runs from the shoulder (straight above the paw, so the walk keeps its
   reach) to the elbow, placed inside the back of the forearm where it leaves the body's lower edge; `leg_F*_2` is the whole
   forearm and paw. The forearm then folds flat about the elbow (lying, bowing) at 1.15x, where folding it about the shoulder
   cost 1.8-2.0x; the upper arm only nudges the elbow (keep it under about 30 degrees).
2. **Hind legs: the top where the thigh hinges** (up and a little forward of the paw), the knee at the hock.
3. **Each leg a region** walked from its paw front with `in_reach(mesh, toe, length, inset, outset, keep=True)`: the dog's
   front legs reach 0.22 u and blend over (0.05, 0.14), so they start at the elbow crease and fade across the armpit; the hind
   legs reach 0.25 u and blend over (0.08, 0.14), so the thigh takes the flank with it. Out of the band a leg keeps none of
   the bib or belly; `keep` lets the band meet the body's own weights without a step.
4. **Joint ramps** on the elbows and hocks (0.05-0.06), the spine, chest and neck (0.08) and the tail joints (0.03).
5. **The neck tapered off the bib**, so the chest and spine own the bib and throat down to the elbows.
6. **Head and tail** as before: an `in_part` band at each cut ring, the ears rigid on their shells.

Then measure each joint alone (a scratch script turning one bone at a time) and let the poses pivot the body rather than
push one joint past its budget. The dog's budgets now: elbow fold 90 degrees 1.15x, hock 80 degrees 1.43x, hind leg 90
forward 1.60x (the left; the right, modelled stepping forward, 2.05x), neck 45 down 1.51x and 45 round 1.61-1.80x, head 20
1.35x, each tail joint 40-45 degrees 1.20-1.57x. The pelvis may tilt freely (it carries the body): a lying dog tilts it 25
degrees tail-down and turns the spine and chest back level, so its hind legs fold only 50 degrees.

## The wag

`dog.wag(t, hz, amp, lift, carry)` gives the tail its overlapping action: each of the four segments follows the one before
by 0.15 of a cycle and swings wider toward the tip (`GROW`), lifting a little at both ends of the swing. Idle wags slowly and
low (0.67 Hz), Walk once a stride, Sniff at 1 Hz, Happy fast and wide (3.3 Hz) with the hips swinging the other way,
PlayBow high and fast (4 Hz); Sit sweeps once along the ground and Sleep only flicks the tip once a loop. The test checks
the lag, the growth and each clip's speed. The game's live layer may scale the wag's speed and amplitude by mood on
`tail_*` after the mixer (as it drives `head`, `neck` and the ears): every loop holds whole cycles, so a time scale keeps it
seamless.
