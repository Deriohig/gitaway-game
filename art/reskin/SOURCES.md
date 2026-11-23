# Reskinned CC0 models: sources

The production tree and bush set (task R1 of the painterly-trees plan, revision 2): free CC0 shapes repainted by
`art/scripts/reskin.mjs` in the palette of the owner-approved concepts. The table of record is `art/scripts/lib/species.mjs`.
`art/scripts/export-composition.mjs` copies them unchanged into `public/models/` (plan Task 9).

## Source pack

- **Pack:** Stylized Nature MegaKit by Quaternius, the free Standard tier.
- **URL:** https://quaternius.itch.io/stylized-nature-megakit
- **Download:** `Stylized Nature MegaKit[Standard].zip`, downloaded 2026-10-22, 104,088,529 bytes, sha256
  `298f6732b872e4cf7b30e6e7abf9641c7f6dc6b326df37ac089533ed7e3d58c9`. Unpacked, its `glTF/` folder holds the sources below.
- **Licence:** CC0 1.0 Universal (public domain dedication), as stated in the pack's `License_Standard.txt`. No attribution is
  required; it is given here anyway.
- **In the repo:** only the outputs below. The downloaded pack itself is never copied into the repo.

## Which source became which id

The colour references are the approved concepts, `art/meshy/<folder>/source/concept_1.png` (git-ignored; the Meshy-era concept
prompts stay in `art/meshy/<folder>/concept_prompt.txt` as a record). Every number the build reads from them is frozen in
`concept-stats.json` (ruling R23), so the set rebuilds byte for byte without the images.

| game id | source model (glTF) | kind | height | cap | tris | bark | leaf cards kept | painted from | notes |
|---|---|---|---|---|---|---|---|---|---|
| `tree_pine_a` | `Pine_5` | conifer | 2.55 | 1,200 | 1,188 | 488 | 32 of 53 | `tree_fir` | approved (round 1), byte-identical |
| `tree_pine_b` | `Pine_1` | conifer | 1.97 | 1,200 | 1,192 | 488 (trunk only) | 32 of 35 | `tree_fir` | the fir ramp; its dead lower twigs out |
| `tree_round_a` | `CommonTree_1` | broad | 2.3 | 3,500 | 2,792 | 488 (24 hidden branches out) | 576 of 960 (trim 60 %) | `tree_oak` (foliage, bark) | round 2: 3,176 |
| `tree_round_b` | `CommonTree_2` | broad | 2.3 | 3,500 | 3,392 | 1,784 (18 hidden branches out) | 402 of 669 (trim 60 %) | `tree_beech` (foliage, silvery bark) | round 2: 3,660 |
| `tree_spread` | `TwistedTree_3` | broad | 1.92 | 3,500 | 3,460 | 488 (43 hidden branches out) | 743 of 1,350 (trim 55 %) | `tree_maple` | recoloured green, crown x 1.15 broader |
| `tree_sapling` | `CommonTree_5` | broad | 1.34 | 1,500 | 1,138 | 488 (trunk only) | 325 of 650 (trim 50 %) | `tree_sapling` | leaves single-faced, wound outward, single-sided material |
| `tree_birch` | `CommonTree_3` | broad | 2.3 | 3,000 | 2,648 | 488 (8 hidden branches out) | 540 of 900 (trim 60 %) | `tree_birch` (foliage, end hues x 1.3 out); bark repainted | white bark with dark marks |
| `tree_fruit` | `CommonTree_1` | broad | 1.9 | 3,500 | 2,840 | 488 | 576 of 960 (trim 60 %) | `tree_apple` | + 12 painted apple cards in `Canopy` (48 tris) |
| `tree_oak_autumn` | `CommonTree_1` (`tree_round_a`'s geometry) | broad | 2.3 | 3,500 | 2,792 | as `tree_round_a` | as `tree_round_a` | autumn rust ramp, 22 deg | geometry byte-equal to `tree_round_a` |
| `tree_beech_autumn` | `CommonTree_2` (`tree_round_b`'s geometry) | broad | 2.3 | 3,500 | 3,392 | as `tree_round_b` | as `tree_round_b` | autumn amber ramp, 36 deg | geometry byte-equal to `tree_round_b` |
| `tree_birch_autumn` | `CommonTree_3` (`tree_birch`'s geometry) | broad | 2.3 | 3,000 | 2,648 | as `tree_birch` | as `tree_birch` | autumn gold ramp, 48 deg | geometry byte-equal to `tree_birch` |
| `bush_a` | `Bush_Common` | bush | 0.9 | 600 | 600 | - | 300 of 450 | `bush_leafy` | the pack's pointed leaf picture (`Leaves_NormalTree_C.png`) on its cards; leaves wound outward, single-sided |
| `bush_flowering` | `Bush_Common_Flowers` | bush | 0.9 | 600 | 599 | - | 202 of 450 leaves, 15 of 36 flowers | `bush_flowering` (leaves; pink and cream flowers) | recoloured with the R1 method on the owner's yes, its cards and blossom kept; leaves wound outward, flowers facing up, single-sided |
| `bush_berry` | `Bush_Common` | bush | 0.9 | 600 | 600 | - | 240 of 450 | `bush_leafy` | + 30 painted berry-bunch cards on the root (120 tris); pointed leaf picture; wound outward, single-sided |

- **History.** The probe (round 1) used `CommonTree_5` and `CommonTree_3` for the two broadleaf ids; the owner judged them "dark,
  small and scrappy". Round 2 swapped in `CommonTree_1` and `CommonTree_2`; the owner approved its shapes and brightness, but "the
  color seems off" (a flat lime). R1 repaints every green broadleaf and bush from the concepts' own luminance bands (deep cool
  teal-green shadows to warm yellow-green sunlit tops) and trims the round crowns to fewer, bigger cards.
- **The fir is unchanged** from round 1, byte for byte. **The flowering bush** was recoloured with the R1 method on the owner's
  "Yes, recolour it" (its cards and blossom kept). `tests/reskin.test.mjs` RS8 pins both sha256.
- **Caps** are the R1 table's. Two-sided broadleaf leaves cost twice the triangles (duplicated faces), which is why the broadleaf caps
  sit well above revision 2's first 2,000 estimate.

## Far versions (task 11b)

Every tree id also has `<id>_far.glb`: a light copy for distant trees and low-power draws (the game switches to it; the composition
JSON names it as `assets[id].far`). `reskin.mjs` derives it from the same build as the near model, which it never changes. Both
triangle limits (the near cap, the far target) are checked before either file is written, so a build over one leaves nothing behind:

- **Bark:** the trunk component alone (every branch out, seen or not), simplified by quadric-error edge collapses that keep every
  vertex one of the trunk's own. It stops at 119-137 tris, where the trunk's UV and normal seams block further collapses.
- **Leaves (broadleaf):** 37 % of the near model's cards (`tree_spread` 29 %), the least seen from the game camera's views first
  (the coverage of 36 views by ray grids). The kept cards hold 62-82 % of the near crown's picture. They grow x 1.5 about their own
  centres, then move back toward the trunk axis so the crown's outline and height stay the near's. Leaves stay two-sided and use
  the same atlas cells.
- **Leaves (conifers):** thinning the 32 big frond strips read as dark blobs, so every frond stays, each simplified (340 tris).
- **`tree_fruit`:** 6 apple cards placed again on the far leaves, grown with them.
- **The same materials:** names, alpha modes, cutoffs and samplers, with the same pivot and nodes (`<id>_far` > [`Crown` >] `Canopy`),
  so the game may bind the near model's materials by name.
- **Textures (ruling R20):** each far file is self-contained. Its images are the near images box-downsampled to 256² (leaves PNG
  with alpha, bark JPEG q85; `tree_fruit`'s 256² apple atlas is kept as it is). That took the 11 far files from 3,098,392 to
  1,338,796 bytes (1,759,596 saved, 57 %), and a far tree's texture memory to about a quarter of the near's.

| far id | tris | bark | leaf cards | leaf tris | near tris |
|---|---|---|---|---|---|
| `tree_pine_a_far` | 477 | 137 | 32 of 32 (simplified) | 340 | 1,188 |
| `tree_pine_b_far` | 475 | 135 | 32 of 32 (simplified) | 340 | 1,192 |
| `tree_round_a_far` | 971 | 119 | 213 of 576 | 852 | 2,792 |
| `tree_round_b_far` | 720 | 124 | 149 of 402 | 596 | 3,392 |
| `tree_spread_far` | 980 | 120 | 215 of 743 | 860 | 3,460 |
| `tree_sapling_far` | 359 | 119 | 120 of 325 | 240 (single-faced) | 1,138 |
| `tree_birch_far` | 931 | 131 | 200 of 540 | 800 | 2,648 |
| `tree_fruit_far` | 995 | 119 | 213 of 576 | 852 + 24 (6 apples) | 2,840 |
| `tree_oak_autumn_far` / `tree_beech_autumn_far` / `tree_birch_autumn_far` | as their `from` | | | | |

The targets are broadleaf <= 1,000 and the sapling and conifers <= 500 (`tests/trees.test.mjs` T9).

## Rebuild

Paths are relative to `art/scripts`. The inputs are outside git (ruling R23):

- **The pack.** Unzip the download above (check its sha256) anywhere, and set `MEGAKIT_DIR` to the unpacked folder (the one
  holding `glTF/`). The default is `~/Downloads/assets/quaternius-megakit/unpacked`.
- **The concepts.** `art/meshy/<folder>/source/concept_1.png`, or `CONCEPTS_DIR=<dir>` for a copy elsewhere. They are optional:
  for an absent image `reskin.mjs` reads its numbers from `concept-stats.json` (band-ramp stops, luminance p10 / p90, hue gap,
  bark, pink and cream stops), and the models come out byte-identical (`tests/reskin.test.mjs` RS11). Each build's RESULT line
  says which it read (`concepts`). `--freeze-stats` rewrites the file from the images; RS11b checks it is fresh.

```sh
node reskin.mjs --all                       # every id above into ../reskin/<id>.glb, every tree's <id>_far.glb, a RESULT line each
node reskin.mjs --recipe tree_spread        # one id
node reskin.mjs --recipe tree_spread --far  # one id and its far version
node reskin.mjs --freeze-stats              # the concept images' numbers into ../reskin/concept-stats.json (needs every image)
MEGAKIT_DIR=/path/to/unpacked CONCEPTS_DIR=/tmp/none node reskin.mjs --all   # elsewhere, without the concept images
node meshy/farsheet.mjs <out.png> ../reskin tree_round_a tree_pine_a   # near vs far at 20 / 40 / 60 u, in the game's pixels
```

The output is deterministic: the same inputs give byte-identical GLBs. The tests are `node tests/reskin.test.mjs` (the tool: one
`--all` build checked id by id, RS10 byte-equal to these committed files, RS11 the same without the concept images) and
`node tests/trees.test.mjs` (the table and the committed models).
