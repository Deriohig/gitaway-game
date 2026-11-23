# Water revamp PR 1 (Bakes and proof): task plan

Date: 2026-10-23 · Branch `art/water-design` · Spec: `2026-10-23-water-revamp-design.md` (sections 3.1-3.5, 4.1, 6 row 1)
Time box: stop by 22:40 local. Red-green per task: the named W test is written first and seen failing, then the code.

All W tests live in `art/scripts/tests/water.test.mjs` (pure node, `node tests/water.test.mjs [W1,W2,...]`), except W9, which
extends `tests/lookpresets.test.mjs`.

| # | Task | Tests | Files |
|---|---|---|---|
| 1 | `blueprintWater` additions: `main.pond.outline` (the game's `blob(POND.r, 3)`, same mulberry32 draws) and `main.waterfall.points` (the wetland fall profile from MAIN's rim exit); `blueprint.pieces.json` re-exported | W8 | `lib/terrain.mjs`, `config/blueprint.pieces.json` |
| 2 | `water-core.mjs` encoding constants + the map bake for **main** (virtual pond + stream depth, EDT shore distance on a 4x mask, pond flow) + `water_noise.bin` + CLI `bake-water.mjs` | W1, W7 (maps + noise part) | `lib/water-core.mjs`, `lib/water-bake.mjs`, `bake-water.mjs`, `public/models/water_main.map.bin`, `public/models/water_noise.bin` |
| 3 | Maps for **wetland** (lake + river + outflow, Laplace flow round the islet) and **highland** (tarn, spring radial welling) | W2, W3, W4 | `lib/water-bake.mjs`, `public/models/water_{wetland,highland}.map.bin` |
| 4 | Meshes: still surfaces, ribbons (arc-length u, carry-over across joins, tuck), falls (clearance from the baked rock, to y <= -10), empty mist / steam nodes; `water_<piece>.glb`, `water.json`, manifest entries | W5, W6, W7 (tris) | `lib/water-bake.mjs`, `public/models/water_*.glb`, `public/models/water.json`, `public/models/manifest.json` |
| 5 | Presets + schema: water keys wired, `bands`, `bandSoft`, `bodies.*` palettes; identical across moods; `Game (current)` keeps `bakedDepth: false` | W9 | `config/lookPresets.json`, `config/lookPresets.schema.json`, `tests/lookpresets.test.mjs` |
| 6 | GLSL chunks + `patchWaterLambert()` / `patchShoreLambert()` in `water-core.mjs`; proof `?water=v2|legacy`, `?waterdebug=depth|shore|flow|bands`, `?waterTier=phone|mid`, fixed view `pond` | water-core patch check (W10, extra) | `lib/water-core.mjs`, `lib/arch-scene.js`, `lib/viewer.mjs`, `build.mjs`, `config/world.config.mjs` |
| 7 | Review sheets: pond / lake / tarn / falls from 3 orbit angles + the default camera, `Game (current)` and `Golden afternoon` | (visual) | scratchpad `review/water/` |

Priority if time runs short: 2 -> 3 -> 4 -> 6 (pond + lake preview) -> 7. Task 1 is a prerequisite of 2 and 4.

## Status at the stop (22:05)

| # | Status | Commit |
|---|---|---|
| 1 | done (W8a/b) | e59fee4 |
| 2 | done (W1, W7a/b) | b18c526 |
| 3 | done (W2, W3a/b, W4) | 9551ecc |
| 4 | done (W5, W6, W7c, W8c) | 8237b6d |
| 5 | done (W9 = lookpresets P6a-c) | 86716a0 |
| 6 | done (W10; proof `?water=v2`, `?waterdebug=`, `?waterTier=`, `?view=pond`) | 1ee0374 |
| fix | river-head fan at the MAIN seam (W3c), proof patch via addPatch, no mipmaps in the proof | e5506f9 |
| 7 | sheets rendered (scratchpad `review/water/`), not committed (renders are review material) | - |
| tuning 1 | deep cores teal (pond #43726E, lake #4A6E72), sky Fresnel eased over deep water toward a desaturated sky, glints sparse / small / soft in the sun path and gone at the phone framing (W11) | 37ea034 |
| tuning 2 | lake livelier: mid #6A9899 -> #75A7A0, deep #4A6E72 -> #4E7A77 (~10 % lighter, greener, still cooler than the pond); pond kept (W11 extended) | d34cb15, 071ef7b |
| review I3 | proof reads `water.bodies` live (bodyColours) and `bakedDepth` picks v2 by default; W9 P6d | e6aab7e |
| review I1 | own CPU-wrapped phase per scaled use (caustics, glints, ribbon B); PHASE_USES + W12 | 7720627 |
| review I2 | W10: each chunk once and in order, on node three + the r186 fixture (vertex added); 3 mutants now fail | 99aa0eb |
| review I4 | phone-framing renders (106 / 130 u, both lights; scratchpad sheet_phone_framing.png); spec §6 note: patchShoreLambert before PR 4 | (this commit) |

Not done (left for later PRs or a follow-up art pass; review minors 1-8 not addressed in the fix wave):
- `patchShoreLambert()` (L8-L10 terrain hooks) in `water-core.mjs`: not written; the proof's `?waterdebug=` colours the water only, not the ground.
- The phone gameplay camera sheets and the full "7 LOOK views x 2 lights" sheet set: only pond / lake / tarn / spring / falls / default camera, Golden afternoon + a Game (current) and legacy comparison row.
- The proof's mist / steam are unlit sprites in the palette colour (the spec wants them lit like `cloudMat`).
- The proof's maps and noise have no mipmaps (the proof's S1 rule); the game's loader should build them, as the spec says.
- W10 was written after the patch code (no RED run).

## Revision 1 (owner, 2026-10-24): status

The spec's Revision 1: the Teardrop pond, the seamless join, river-to-fall joins, ripples. Red-green per task, each with its own commit.

| # | Task | Tests | Status | Commit |
|---|---|---|---|---|
| 1 | Spec amendment (R1.1-R1.6) | (docs) | done | d7cb742 |
| 2 | The Teardrop + the stream reroute (art-owned `archipelago.farmWater`), flowerbed 8 to (−1.50, 7.75), re-bakes | W8a/c (new meaning), W13 | done | 84121ad |
| 3 | The seamless join: one `water_pond` surface, union depth / shore / flow, `WATER_JOIN`, the docked river head (`WATER_VHEAD`) | W14, W4c, W5, W7c | done | f96f571 |
| 4 | River-to-fall joins, both falls: the channel ends on the brink, the fall's top row = its last row, the curl, `WATER_BRINK`, `water_fall_skirt` | W15, W6, W7c | done | 6884bee |
| 5 | Ripples (L11, `WATER_RIPPLE`): rings, V wakes + streaks, tiers, the `uRipple[4]` hook | W16a-e | done | 24c77f4 |
| 5r | From the review renders: the chevron wrap pop, thin stream lines, each chevron lives and fades | W16f | done | 7fa2d90 |
| 6 | Evidence: before / after stills sheets (Game (current), Golden afternoon) and 40-frame animated previews | (visual) | rendered (scratchpad `review/water2/`), not committed | - |
| 6r | From the evidence renders: the depth-only fall skirts hug the rock (the ink pass outlined the old ones as a floating box round the curl); the proof's skirt has no polygon offset. Still open: a thin ink line along the brink row in the ink look | W15c, W15d | done | bd8f2e3 |
| 7 | Full art suite, BLUEPRINT water section, this status, push | all `tests/*.test.mjs` | done | (this commit) |

