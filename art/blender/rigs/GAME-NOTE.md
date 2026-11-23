# Animal rigs: note for the game session

The art side of the animal rigs is done; nothing changes on screen until the game switches. This note gives the game
session what it needs to switch each animal over. The design is `art/specs/2026-10-24-animal-rigs-design.md` ("Game
handoff"); this note replaces it where they differ (the look-at clamp, the duck, the sheep and the hare). The owner's
style calls are settled (ruling R37, below); the owner can still overturn any of them.

## Files

In `public/models/`, next to today's models (which stay until the game stops using them):

| Animal | Rig | Built from (`source`) | Game draws today | Bones | Clips | Tris | KB |
|---|---|---|---|---|---|---|---|
| dog | `dog_rig.glb` | `dog.glb` | `dog.glb` | 23 | Idle, Walk, Sniff, Sit, Lie, Sleep, PlayBow, Scratch, Happy | 1,942 | 378 |
| cat | `cat_sleeping_rig.glb` | `cat_sleeping.glb` | `cat_sleeping.glb` | 10 | Sleep, EarTwitch, TailFlick, Peek | 1,394 | 172 |
| goat | `goat_rig.glb` | `goat.glb` | `goat.glb` | 19 | Idle, Walk, Graze, Chew, Hop, HeadShake | 1,388 | 257 |
| chicken | `chicken_rig.glb` | `chicken.glb` | `chicken.glb` | 13 | Idle, Walk, Peck, Scratch, Flap, Fluff | 1,178 | 228 |
| duck | `duck_rig.glb` | `duck.glb` | `duck.glb` | 9 | Idle, Paddle, Preen, Dabble, Shake | 1,068 | 172 |
| sheep | `sheep_rig.glb` | `sheep_meshy_sized.glb` | `sheep.glb` (the flat stand-in) | 19 | Idle, Walk, Graze, Hop, Bleat | 1,568 | 258 |
| hare | `hare_rig.glb` | `visitor_hare.glb` | `visitor_hare.glb` | 20 | Idle, Look, EarTwitch, Groom, Hop, Alert | 1,490 | 286 |

The rigs are not in `manifest.json`: `rigs.json` lists them (the asset contract checks both files of each entry, ruling
R36). Read `rigs.json` beside the manifest and load `models/<entry.file>`.

Each rig is one skinned mesh, one primitive, one material named after the animal (today's atlas, the same JPEG bytes),
at most 24 joints, core glTF. Same facing, ground origin and scale as the model it replaces: `+Z` forward, except the cat
(`+X`). Each clip is its own glTF animation, named as above, keyed at 30 fps. `root` is never animated: the game moves
the object.

### `rigs.json`

```jsonc
{
  "version": 1,
  "animals": {
    "<id>": {
      "file": "dog_rig.glb",          // the rig
      "source": "dog.glb",            // the model it was built from (same geometry; the sheep's is NOT the one the game draws)
      "facing": "+Z",                 // "+X" for the cat
      "bones": ["root", "hips", ...], // every joint name (lowercase, underscores: three.js keeps them as they are)
      "live": ["head", "neck", ...],  // the bones the game may drive on top of the clips (below)
      "lids": ["lid_L", "lid_R"],     // eyelid joints ([] for the cat): scale 0 = open, uniform 1 = closed
      "look": { "yaw": 45, "pitch": 45, "bones": ["neck", "head"] },  // the live look-at clamp (below)
      "restChanged": ["neck", "head", ...],  // bones whose rest was straightened from the source (ruling R29)
      "clips": {
        "Walk": { "type": "loop", "duration": 0.6, "stride": 0.1825 },  // stride: units travelled per cycle (walks only)
        "Sit":  { "type": "hold", "duration": 0.6 },
        "Happy": { "type": "once", "duration": 1.2 }
      }
    }
  }
}
```

Clip types: `loop` (first frame = last), `hold` (eases in from the default pose; the game holds the last frame) and
`once` (starts and ends at the default pose).

`restChanged` is for the record: the dog, goat and sheep had their heads turned in the source and now face forward at
rest (R29); every animal's rest head faces forward and level. Drop any offset today's code adds for a turned head.

## Loader

`Asset.tsx` / `assetMaterials.ts` need two changes before any rig can play:

1. **Clone with `SkeletonUtils.clone`** (`three/examples/jsm/utils/SkeletonUtils.js`), not `scene.clone(true)`
   (`prepareModel`, `assetMaterials.ts:119`). `clone(true)` keeps every copy bound to the source's one skeleton, so two
   chickens would move as one. The rigs' tests check that two `SkeletonUtils.clone`s play different clips with different
   joint matrices while the loaded scene stays at its default pose.
2. **Keep `animations`.** `useGLTF` returns `{ scene, animations }`; `Model` drops `animations` today. Hand them to the
   rig hook (the clips are shared; each copy gets its own mixer and actions).

Also:
- `prepareModel` swaps in the game's materials and the tint copies (`coats.ts`; the chicken and goat are tinted). On a
  `SkinnedMesh` three adds skinning to any standard material by itself. `gameMaterial`'s hook (`storeLinear`,
  `assetMaterials.ts:37-41`) only prepends a define to the fragment shader, so skinning works unchanged.
- Lookups by node name change: there is no `Head` or `Tail` node in a rig (`Animals.tsx` uses `getObjectByName('Head')`
  and `'Tail'`). The bones are `head`, `tail_1` and so on; the clips do what those lookups did.
- A skinned mesh is culled by its bind-pose bounds. Clips reach outside them (Dabble, Scratch, Hop), so near the screen
  edge an animal could vanish for a frame: set `frustumCulled = false` on the skinned mesh, or grow its bounding sphere
  once (×1.5) after loading.

## The rig hook

- **One `AnimationMixer` per animal copy.** Crossfade between clips over **0.25 s** (`action.crossFadeTo` or
  `fadeIn` / `fadeOut`), with one exception: **`Lie` → `Sleep` crossfades over at least 0.4 s** (ruling R16). Sleep
  starts on Lie's last body pose exactly, but its head is already down: a short or no crossfade shows the head drop.
- **Loops:** `LoopRepeat`. **Once:** `LoopOnce`, then back to the animal's resting loop on `finished`, crossfaded.
  **Hold** (the dog's `Sit` and `Lie`): `LoopOnce` with `clampWhenFinished = true`; it holds its last frame until the
  game crossfades out. `Sleep` follows `Lie`, never the default pose.
- **Walk speed:** the game moves the object; the clip's feet travel `stride` units per cycle. Set the Walk action's
  `timeScale = speed / (stride / duration)`, where speed is the object's ground speed in the rig's own units (divide by
  the object's scale if it is drawn larger: speed / scale). The paws then stay planted. Today's speeds against each
  walk's natural pace (stride / duration): chicken 0.32 against 0.208 u/s (timeScale 1.54), goat 0.22 against 0.266
  (0.83), sheep 0.18 against 0.205 (0.88), dog 0.5 u/s against its natural 0.304, so timeScale 1.64. Drop today's
  walking bob (`Animals.tsx`, 0.02 u): the walks bob on their own.
- **Hops:** the goat's, sheep's and hare's `Hop` lift the body themselves. Each hoof's peak is capped at twice the jump's
  clearance (ruling R35): goat 0.16, sheep 0.12, hare 0.12 (clearance: goat 0.08, sheep and hare 0.06). Play `Hop` on a
  click in place of `hopWalker`'s lift, or keep the walker's forward move and set its lift to 0 while the clip plays. The
  hare's `Hop` lands in its sit.
- **The live layer** runs after `mixer.update(dt)`, every frame, on the bones in the entry's `live` list only (it
  starts each frame from the clip's pose, so it never accumulates):
  - **Look-at**, on tap or when the player is near, clamped per animal from `look` (below), not the spec's flat ±60°.
  - **Blink**: a random blink every 2–6 s, if `lids` is not empty (the cat's eyes are painted shut). A blink scales
    both lid joints 0 → 1 → 0 over about 0.15 s. Clips also key the lids (Sleep shuts them, Groom half-shuts them): write
    `max(clip scale, blink)`, so a blink never opens a sleeping eye.
  - **Ear twitch**: now and then a quick turn of one ear joint; keep the clip's turn plus the twitch within ±25° of rest
    (the ears tear past it). The hare's live ears are `ear_L_1` and `ear_R_1` (the tips follow).
  - **Tail wag by mood**: scale the wag on `tail_*` (speed and amplitude). Every loop holds whole wag cycles, so a
    time scale stays seamless.
- **`useMotion()`** (`motion.ts`): `full` plays as above. `calm` plays fewer one-shots (about half as often) and plays
  everything slower (mixer `timeScale` 0.5, as `Visitors.tsx`'s `SPEED`; the Walk's own timeScale still follows the
  slower ground speed). `still` stops the mixer and holds the default pose (the joints' rest TRS): no clips, no live
  layer.
- **Performance:** skip `mixer.update` for animals off screen (and don't invalidate for them); the frame loop stays on
  demand: invalidate only while a visible animal is playing.

### The look-at clamp (ruling R31)

Each entry carries `look: {yaw, pitch, bones}`, measured on the rig. The game clamps a look to the ellipse

    (yaw / look.yaw)^2 + (pitch / look.pitch)^2 <= 1

and applies it as `lookPose` in `art/scripts/lib/rig-inspect.mjs` does (the reference implementation):

- yaw turns about the model's up axis (+Y), pitch about the animal's left axis (up × forward: +X for a +Z animal, −Z for
  the cat; positive pitch is nose down), pitch first;
- the look is split evenly over `look.bones`; each bone, parent first, turns its share S in the model's own axes about
  its joint: `bone.quaternion.premultiply(Wp⁻¹ · S · Wp)`, Wp the parent's rotation in the model's space (the rig's
  scene, not the game world).

| Animal | yaw | pitch | bones |
|---|---|---|---|
| dog | 45 | 45 | neck, head |
| cat | 30 | 15 | head |
| goat | 60 | 45 | neck, head |
| chicken | 30 | 10 | head |
| duck | 60 | 55 | neck, head |
| sheep | 25 | 25 | neck, head |
| hare | 60 | 40 | neck, head |

The clamp keeps the stretch test (AR4, ≤ 1.6x) at the **default pose**: it was measured at rest. The game applies it on
top of the clips, where a turned neck plus a clip's own turn can go further. Ease the look's weight down during clips that
already turn the head a lot (Graze, Scratch, Preen, Dabble, Groom), or fade it out for them.

The chicken's `live` list has no `neck` (`head`, `lid_L`, `lid_R`, `tail_1`): turning its neck as well shrinks the clamp
(neck + head 30 × 10 tears at 1.67x), so its look is head only.

## Behaviours

The clips give each animal these states (the spec's list; the game picks the timing):

- **Dog:** wander (Walk, Idle), sniff (Sniff), sit (Sit), lie and sleep (Lie, then Sleep), and from `docs/idle-loop.md`:
  trot the path (Walk at a faster timeScale), sit by the door (Sit), herd sheep (Walk, PlayBow at the flock), its name on
  tap (look at the player, Happy). Scratch now and then while sitting about.
- **Cat:** sleeps (Sleep); Peek when tapped (it lifts its head, looks round, settles); EarTwitch and TailFlick now and
  then. These three key the chest at rest, so at full weight they pause the breathing for 0.6–3 s: blend them over Sleep
  at partial weight, or let the breathing pause (it reads as listening).
- **Goat:** wander (Walk, Idle), Graze and Chew, Hop when clicked or playful, HeadShake.
- **Chicken:** wander (Walk with its head bob, Idle with head jerks), Peck and Scratch while standing, Flap and Fluff.
- **Duck:** floats (Idle), Paddle while moving, Preen, Dabble (a tip-up), Shake.
- **Sheep:** wander (Walk, Idle), Graze, Hop, Bleat.
- **Hare:** sits (Idle, a nose twitch); Look, EarTwitch and Groom now and then; Alert when the player comes near; Hop to
  move (it lands in its sit).

## Per animal

- **Duck (ruling R32): it floats.** Its y 0 is the waterline and its hull bottom sits at y −0.05 at rest (as today's
  duck). Draw the object at the water surface's height, not the ground's; keep no extra bob that lifts the hull out (Idle
  floats it). Dabble tips its head and neck up to 0.25 u under the waterline, on purpose.
- **Sheep:** `sheep_rig.glb` is the Meshy sheep the owner picked, fitted to today's size (`sheep_meshy_sized.glb`), not
  today's flat stand-in `sheep.glb`. Switching changes the sheep's look: it is painted, and slimmer (0.489 wide against
  the stand-in's 0.696; 0.718 tall against 0.740, 0.838 long against 0.8125). Its 1,568 tris are over the 1,500 animal cap,
  approved (R37) as a named exception in the asset contract (`sheep_meshy_sized`).
- **Hare:** `hare_rig.glb` is `visitor_hare.glb` rigged (same geometry and atlas). `src/world/features/Visitors.tsx` asks
  for `visitor_${id}` (`visitor_hare`; `Visitors.tsx:193`): find the rig by `source` (rigs.json's key is `hare`). Keep
  drawing it as `Visitors.tsx` does, at `LOOKS.hare.scale` 1.3 and its `face`; its clips replace the stand-in parts' `sit`
  idle: drop the `sit` idle's `g.scale.y` breathing (`Visitors.tsx:85`). Divide any speed by 1.3 for a timeScale.
- **Dog:** the rest head now faces forward (it was turned about 37° to its left and rolled 15°): drop the old head nod and tail wag
  code.
- **Cat:** faces `+X`; no lids, no blink. The porch shows it from the front. Drop `Cat()`'s group `scale.y` breathing
  (`src/world/Animals.tsx:237`) and the `catHead` tilt: Sleep breathes and Peek is the tap.

## Draw calls

Measured on the files (mesh primitives; every mesh casts a shadow in `prepareModel`, so each draws twice):

| Animal | Today | Rig | Saved per animal | With shadows |
|---|---|---|---|---|
| dog | 3 (body, `Head`, `Tail`) | 1 | 2 | 4 |
| cat | 2 (body, `Head`) | 1 | 1 | 2 |
| goat | 2 | 1 | 1 | 2 |
| chicken | 2 | 1 | 1 | 2 |
| sheep | 4 (`sheep.glb`: 2 meshes, 3 materials) | 1 | 3 | 6 |
| duck | 1 | 1 | 0 | 0 |
| hare | 1 | 1 | 0 | 0 |

So a farm with the dog, the cat, four chickens, three goats and five sheep draws 2 + 1 + 4 + 3 + 15 = 25 fewer calls,
50 with shadows. Skinning adds a little vertex work per animal (at most 24 joints, about 1,000–1,600 vertices each).

## Settled (R37)

`art/blender/rigs/review_sheet.py` renders `owner_sheet.png` (every clip of every animal at the game camera),
`owner_<id>.gif` per animal and `owner_calls.png`, the owner's style calls: the Walk touchdown snap and paw pop (all the
quadruped walks, R27), a lower Graze for the goat and sheep, the sheep's tris exception, the hare's Groom reach, the cat's
Peek amplitude, the EarTwitch flinch, the sheep's throat crease and the dog's Scratch paw on its ear. Ruling R37
(2026-10-26, after the owner saw the sheets) keeps each as built, and approves the sheep's 1,568 tris as a named exception.
The owner can overturn any of them; that would change a rig's clips (never the file names, bones or `rigs.json` schema).

The checker plays the rigs in three 0.160; the game runs 0.186.
