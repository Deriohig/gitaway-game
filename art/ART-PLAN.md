# Gitaway art plan

2026-10-24 · owner's brief phase 8 · evidence: [VISUAL-AUDIT.md](VISUAL-AUDIT.md) · target: [ART-BIBLE.md](ART-BIBLE.md),
[ASSET-RULES.md](ASSET-RULES.md) · checks: [VISUAL-QA.md](VISUAL-QA.md).

**Owners.** **art** = `art/`, `public/models/`, `art/scripts`. **game** = `src/` (lighting config, UI tokens and components, in-game
materials, stand-ins drawn in `src/world`). Joint items list both halves; each half ships on its own.
**Priorities** (brief phase 8): P0 major inconsistency or broken element · P1 high-impact cohesion · P2 reusable systems and workflow ·
P3 polish.

## 1. Priority list

| Id | Item | Owner | Art id | Game id |
|---|---|---|---|---|
| P0-1 | Garden: painterly plot + the 8 missing crops × 3 stages + cranberry bed | art | A4 | — |
| P0-2 | Water revamp (legacy `sin()` water out) | art + game | A5 | G3 |
| P0-3 | One source of truth for art direction (this stage's 7 docs, supersede notes) | art | A1 (done) | — |
| P1-1 | Port the approved look: tone mapping, light rig, Lambert + cel, then sky, fog, cloud sea, underside haze | game (+ art Night keyframe) | A6 | G1, G2 |
| P1-2 | Replace the flat small props with a painted procedural kit (fences, stepping stones, footbridge, shelter, log, mushrooms, pond stones, lily pads) | art + game | A7 | G4 |
| P1-3 | One path system: MAIN's layout paths as art ribbons; retire `DirtPath` | art + game | A9 | G5 |
| P1-4 | HUD-safe framing (phone first) | game | — | G6 |
| P1-5 | Painterly sheep | art | A10 | — |
| P1-6 | Modern Minimalist UI redesign (queued; tokens, type, radii, HUD bugs, dock, world labels) | game | — | G7 |
| P2-1 | One world palette: art exports it, the game's stand-ins and fx read it | art + game | A12 | G8 |
| P2-2 | Texel-density bands; farmhouse wall sharpness A/B for the owner | art | A13 | — |
| P2-3 | Painted atlas loaded once (dedupe) | art + game | A8 | G9 |
| P2-4 | Tree fixes: tree_spread trunk tip and pivot; optional height-weighted sway | art (+ game) | A11 | G13 |
| P2-5 | Visual QA automation (VISUAL-QA V1–V6) + frame-time probe | art + game | A2 | G10 |
| P2-6 | Cloud puffs: interim retint, or skip if G2 is next | game | — | G11 |
| P2-7 | Canonical camera hook (dev builds) | game | — | G10 |
| P2-8 | Wrapped animation phases (wind, fireflies) for long idle sessions | game | — | G12 |
| P3-1 | Windmill sails painted | art | A14 | — |
| P3-2 | Flowerbed edging stones painted | art | A15 | — |
| P3-3 | Retire `grass_tuft`, `flower_head`, `SkyBridge`, obsolete fallbacks | art + game | A16 | G14 |
| P3-4 | Tooling hygiene (scratch paths, Playwright root, three bump) | art | A3 | — |
| P3-5 | Dev-only in-game asset preview stage | game | — | G15 |
| P3-6 | Painterly distant isles | art + game | A17 | G16 |
| P3-7 | Fin: his figure (the owner's model), his kit by the farm pond then on the wetland jetty, a shed on the jetty (pending the owner's model) | art | A18 | — |
| P3-8 | Síofra: two models, `visitor_hare` and herself; her other shapes stay journal lines | art | A19 | — |
| P3-9 | Tower ruin: stair opening, Barnaby's move-in dressing, one ordinary oak | art + game | A20 | G17 |
| P3-10 | Wetland bell: invisible click target and one ripple-ring effect | art + game | A21 | G18 |
| P3-11 | Cairn: two rows of never-legible cut marks on the `Note` stone | art | A22 | — |
| P3-12 | Shiver nods: water-spec hook and named nodes on the light things | art + game | A23 | G19 |

## 2. Items

Format: **Problem** · **Solution** · **Files** · **Benefit** · **Risk**.

**P0-1 Garden (art, A4).** Status (2026-10-25, branch `art/garden-crops`): the painted plot and the eight crops × 3 stages are built and published (ready stage on Meshy, the owner's decision; young stages in the kit); the wet cranberry bed is still open.
Problem: `plot.glb` is flat colour (`Dirt #C79A6E`, `Soil #B98B61`, `MutedWood #986641`) and reads as a wooden board; 8 of 10 crops
are procedural primitives at ×1.45 (`Crops.tsx:271`); the cranberry bed is boxes (`WildIsles.tsx:133`).
Solution: rebuild `plot` as painted procedural: a soft soil mound in `soil.bed #6E5444` / `soil.shade #5B4538` / `soil.dry #8A6B55`
with painted furrows, a low timber edge from the atlas, same footprint (top 0.94, ≤ 0.19 tall, ≤ 300 tris). Build `crop_<id>_<1|2|3>`
for radish, carrot, wheat, lettuce, tomato, pumpkin, blueberry, cranberry from `lib/plantkit.mjs` (cards, ≤ 400 tris, ready colours from
ASSETS.md §3), plus a wet cranberry bed asset. Approved 2026-10-25 flags: lighten or shift the ready cranberry `#A94A52` and tomato
`#C65A4A`, which sit too close to the `#6E5444` soil in value and hue (ASSET-RULES §3); settle the wheat and cranberry hexes on one
source first; give the plot's timber edging a lighter or less red tone than `MutedWood` against the soil.
Files: `art/scripts/assets/plot.mjs`, `lib/plantkit.mjs`, `publish-models.mjs`, `config/look.config.mjs` (`assetMaterials.plot`),
`tests/crops.test.mjs`, `tests/models.test.mjs`, `public/models/plot.glb`, `crop_*.glb`, `manifest.json`. Game: none (`Garden.tsx:124`
and `CropPlants` already ask for these ids).
Benefit: the core gameplay surface joins the painterly family; the garden stops reading as pallets. Risk: low (fallbacks stay); check
the plot selection outline (`Garden.tsx`) and ready markers still sit right.

**P0-2 Water (art A5 + game G3).**
Problem: legacy water (VISUAL-AUDIT §2.6). Solution: the draft spec on `origin/art/water-design`: after the owner's review, art folds the
teardrop pond (mock A) and its stream weld into `blueprintWater` and the bake, and lands `patchShoreLambert()` before game PR 4; the game
ships PRs 2–6 behind the `water` switch. Files: art `lib/water-bake.mjs`, `lib/water-core.mjs`, `lib/terrain.mjs`, `world.config.mjs`,
`tests/water.test.mjs`, `public/models/water_*`; game `src/world/water/*`, `Water.tsx`, `layout.ts` (`FLOWERBEDS[7]` moves to (−1.50, 7.75),
pond `BLOCKERS`). Two hooks join the spec after the owner-approved lore answers 7 and 10 (2026-10-25): the bell's one ripple-ring effect (P3-10) and the shiver's soft rings on still water (P3-12), each inside the motion caps and frozen or off in still mode. Benefit: high. Risk: medium (transparent sorting, phone fill rate); the spec's gates and cut list apply.

**P0-3 Docs (art, A1, done in this stage).** The bible and its six companions; supersede notes in `ASSETS.md`, `config/STYLE.md`,
`meshy/README.md`; pointers in the other art docs.

**P1-1 Look port (game G1, G2; art A6).**
Problem: `NoToneMapping`, a sun ~64° high at 14:00, Standard GLBs beside Lambert ground; no cool shade, no underside haze.
Solution: LOOK-PORT steps 1–2 behind one feature flag (Neutral 1.05, preset-driven light rig with time-of-day keyframes, `addPatch`,
GLBs to Lambert + cel, `minAlbedo`, glow and porch colours from the presets), then steps 3–4 (sky dome + view-matched fog; cloud sea +
underside haze + strata). Art authors the missing **Night** keyframe in `lookPresets.json` (schema-complete, discrete values equal to the
other moods) before the flag turns on.
Files: game `World.tsx`, `DayCycle.tsx`, `skyPalette.ts`, `assetMaterials.ts`, `materials.ts`, `wind.ts`, new `src/world/look/*`;
art `config/lookPresets.json`, `lookPresets.schema.json`, `tests/lookpresets.test.mjs`.
Benefit: the largest single quality lift (form, warmth, depth). Risk: high (every program recompiles, every colour shifts, all reference
screenshots change): flag off = pixel-identical, staged merges, sheets under both lights.

**P1-2 Painted small-prop kit (art A7, game G4).**
Problem: fences, stepping stones, footbridge, shelter, log, mushrooms, pond stones and pads are flat primitives (VISUAL-AUDIT §2.4).
Solution: art adds a second 512² atlas page (or repacks) and builds painted procedural GLBs: `fence` kit (post, rail segment, end),
`stepping_stone_a/b/c`, `footbridge` (1.5 × 0.62, arch 0.2), `shelter` (= `sheep_shelter`), `log`, `mushrooms`, `pond_stones` kit,
`lily_pads` kit; the game swaps each procedural component for `<Asset>` / instanced `WithModel` with today's mesh as the fallback, fences
instanced per run. Files: art `lib/paintedAtlas.mjs`, `scripts/assets/*.mjs`, `publish-models.mjs`, `tests/models.test.mjs`; game
`Structures.tsx:285-505`, `Water.tsx:159-197, 318`, `WildIsles.tsx:113`, `Isles.tsx:181, 209-211`. Benefit: the last big flat areas in the
default view go. Risk: medium (fence segment count → draw calls; instancing required).

**P1-3 One path system (art A9, game G5).**
Problem: game `DirtPath` (`#C8B08E`, hard edges) beside art ribbons (`#A89478` ± 10 %, soft edges). Solution: art exports MAIN's
layout.ts dirt paths as always-shown runs in `paths_main.glb` (widths 0.6 / 0.5, same tone and edge as the other runs, clearing slots);
the game drops `DirtPath` for them. Files: art `config/world.config.mjs` (`archipelago.game` paths), `lib/composition.mjs`,
`export-composition.mjs`, `tests/composition.test.mjs`; game `MainIsland.tsx:109-111`, `Structures.tsx:337-360`, then `npm run composition`.
Benefit: one path language across the island. Risk: low–medium (clearance against slots, test C11).

**P1-4 HUD-safe framing (game G6; overlaps the UI redesign).**
Problem: the island centres on the screen, not in the HUD-free band; phones show ~25–30 % empty haze below the island under a ~30 %
HUD stack. Solution: a vertical view offset (or shifted framing points) so the farm centres in the focal band of ART-BIBLE §E.3, computed
from the HUD's measured heights after the redesign; framing distance unchanged. Files: `framing.ts`, `World.tsx` `CameraRig`,
`framing.test.ts`, e2e camera-distance checks. Benefit: the island fills the phone. Risk: medium (framing tests, rise framing).

**P1-5 Sheep (art A10).**
Problem: the only flat animal. Solution: owner picks the method: Meshy (the animal family; one concept + one model, credits on the owner's
yes, ≤ 3 requests at once) or painted procedural. Keep 0.74 u, `Head` at the neck, ≤ 1,500 tris, 512². Files: `art/meshy/sheep/` or
`scripts/assets/sheep.mjs`, `publish-models.mjs`, `tests/models.test.mjs` (P8 size). Benefit: medium. Risk: low.

**P1-6 UI redesign (game G7).** The queued Modern Minimalist work (UI-REDESIGN-BRIEF): tokens (spacing, type scale, radii 8/12/16/20,
semantic states), HUD and dock, phone fixes from UI-NOTES §7, panels, world labels in the pill style. The bible §F is its art target.

**P2-1 One world palette (art A12, game G8).**
Problem: three colour sources (VISUAL-AUDIT §2.11). Solution: art generates `public/models/palette.json` (semantic names of ART-BIBLE §B.2
from `look.config.mjs`, `lookPresets.json`, `LAWN`, concept stops) with a test; the game generates `src/world/palette.ts` world colours
from it (UI tokens unchanged). Files: art `scripts/` exporter, `tests/palette.test.mjs`; game `palette.ts`, `scripts/`. Benefit: stand-ins
and fx stop drifting. Risk: low (stand-in colours shift).

**P2-2 Texel density (art A13).** Problem: 73–106 t/u on big Meshy models vs 250–470 on painted props. Solution: V1 enforces the
approved bands (buildings ≥ 75, props ≥ 150, painted ≥ 200, outcrops ≥ 100, any new hero ≥ 128) for new assets; for the farmhouse
walls (79, the named exception), render `CAM-CLOSE` with the 1024² and a 2048² atlas for the owner (resolution only, never
flattening); no change without a yes. Also re-texture `outcrop_b` (73 t/u, the one genuine outlier: below the floor and 3.94× the
sharpest boulder), then delete its `KNOWN_DEFECTS` entry in the same change. Files: `art/meshy/farmhouse/`, `art/meshy/outcrop_b/`,
`finish.mjs` args, `lib/asset-contract.mjs`. Benefit: the hero holds up close. Risk: file size (587 KB today).

**P2-3 Atlas dedupe (art A8, game G9).** Problem: five copies of one atlas on the GPU. Solution: art names the texture
`painted_atlas@<sha8>`; the game caches textures by that name in `gameMaterial` and shares the material. Files: `lib/paintedAtlas.mjs`,
`tests/models.test.mjs` P20; `src/world/assetMaterials.ts` + test. Benefit: 4 fewer textures and materials. Risk: low.

**P2-4 Trees (art A11, game G13).** Problem: tree_spread pivot 0.111 × H with bark to 85 % H. Solution: trim the bark tip inside the
crown and raise the pivot to ≥ 0.25 × H in `reskin.mjs` for tree_spread only (tree_pine_a is owner-approved and pinned, leave it); test
T10 "bark top ≤ crown top − 0.15 u" (red first; the old "≤ 75 % of H" clause is dropped). `tree_spread` is on V1's known-defects
register (`tree_spread.pivot`, A12 checks 0.25–0.45 × H): delete the entry in the same change. Game, optional: weight crown sway by
canopy-local height in `wind.ts`. Benefit: no trunk tip in motion. Risk: low; check the composition's tint and far version.

**P2-5 QA automation (art A2, game G10).** VISUAL-QA V1, V2, V6 (art) and V3, V4, V5 + a committed frame-time probe (game).

**P2-6 Cloud puffs (game G11).** Retint to `cloud.target` (cream tops, periwinkle undersides), fewer and farther puffs, never at the
island's level on phones; skip if G2 is next. Files: `Backdrop.tsx`, `Rising.tsx`.

**P2-7 Camera hook (game G10).** Dev/devtools builds only: set az / el / distance from Playwright, report them on the world element.
Files: `World.tsx`, `src/dev/*`.

**P2-8 Phases (game G12).** Wrap `windTime` and other shader clocks on the CPU (`wind.ts:126`, `Fireflies.tsx`), as the water spec does.

**P3-1 Windmill sails (art A14).** Paint the `Blades` from the atlas or the concept; `finish.mjs --windmill`. **P3-2 Flowerbed stones
(art A15).** Painted stone cards or atlas stones in `lib/plantkit.mjs` `BEDS`. **P3-3 Retire (art A16, game G14).** Drop `grass_tuft` and
`flower_head` from the export and manifest; the game removes `SkyBridge` and composition-off fallbacks once the composition flag is
permanent. **P3-4 Tooling (art A3).** ART-TOOLING §7. **P3-5 Preview stage (game G15).** **P3-6 Distant isles (art A17, game G16).**
Two small painted isle GLBs (a baked mini piece + far trees) replacing `makeIsland` + `RoundTree` in `Backdrop.tsx`. Land and trees only: no building, light, smoke, path or boat; never nearer, never named, night lighting stays off them, and no light or craft crosses the sky (owner-approved lore answer 11, 2026-10-25).

**P3-7 Fin (art A18; waits for the owner's model).** The lore answers are in (owner-approved lore answer 4, 2026-10-25; sheet `voice-drafts/art-answers-approved-2026-10-25.md`); what waits is the owner's model, which he is generating on another platform: the art session fits, scales and rigs it, and nothing of the figure is built before it is in.
**Look:** the owner's model prompt is his look (a sun hat, a sage fishing waistcoat, an A-pose, no rod in the model; Decided). He stands on the 1.0–1.1 u yardstick, painted in warm creams, never white, with soft warm eyes, never black and never lit. The rod is a separate prop. He sits easy on his stool with his bucket and towel; nothing plays on what he is, and no instrument and no lone scene in fog goes near him.
**Shed:** a small, sound timber hut of the woodshed's family on the wetland jetty's shed patch (`BLUEPRINT.md` item 6: a disc of r 0.6 u beside the shore end, kept clear for it). Rods in wrappers stand behind its window, the biscuit tin sits closed on a shelf (the licences are never drawn), and a tackle box sits by his stool with a plain sticker that shows no figures.
**Click meshes:** `TackleBox`, `ShedWindow`, `BiscuitTin` and `BigCatch` (ASSET-RULES §8). The big catch is a fish's tail over the bucket rim, with no species or size shown; once noticed it goes back and the bucket is as it was.
**Where:** his kit (stool, bucket, towel, tackle box, rod) goes by the farm pond first, with no jetty there, then on the wetland jetty once the wetland has docked.
**Game side:** placing him, the click wiring and the swap between the two places are the game session's once the model lands (no G-id yet).

**P3-8 Síofra (art A19).** Two models only (owner-approved lore answer 5, 2026-10-25): `visitor_hare` (built to its ASSETS.md entry; a procedural stand-in today) and Síofra as herself, a young woman on the 1.0–1.1 u yardstick in the hare's warm browns and creams, with grass in her hair and her shoes on the wrong feet, and no wings, glow or fairy trappings. Only one of the two is on the island at a time. Her other shapes stay journal lines; if they ever become world actors they use ordinary models and differ only in what they do, never by a mark, a tint or a glow. Where she has been, more of what is already there grows and stays (clover between the ripe rows, a drift of one wildflower, a bed standing a little taller), made from the existing plant kit and never shown as light. Her gifts are keepsake icons, with no world prop. Her model's approach and id are settled in her spec block (ART-BIBLE §G). Game side: her stand-in spot at a field edge, the drifts that stay and the icons are the game session's once the models land (no G-id yet).

**P3-9 Tower ruin (art A20, game G17).** Owner-approved lore answer 2, 2026-10-25: the built `tower_ruin` is the tower (ASSETS.md "Barnaby's ruin"). Art: add the stair opening, a few sound steps climbing into the back wall and stopping out of sight; build the lived-in state, a bedroll, a kettle on three stones, books and a candle stub (the `barnaby_camp` props move in with him and the lean-to camp goes with him) plus `Glow` on the empty window, so only Barnaby's own things change the ruin; and place one ordinary oak (`tree_round_a`) in the plateau woodland near it, never framed, lit or tappable. How the lived-in state is delivered (hideable nodes, or a separate dressing model) is settled in the spec block. Game (G17): switch the dressing on when Barnaby moves in and light the window by the day cycle. Files: `art/scripts/assets/tower_ruin.mjs`, `barnaby_camp.mjs`, `config/world.config.mjs` (the oak), `tests/models.test.mjs`, `public/models/tower_ruin.glb`, `manifest.json`.

**P3-10 Wetland bell (art A21, game G18).** Owner-approved lore answer 7, 2026-10-25: the bell is heard, never seen. Art: the water spec gets one ripple-ring effect at a single spot by the reeds, inside its motion caps, with the rings drawn frozen in still mode; `Bell` in `isle_props_wetland` stays an invisible click target (the L9 wording in ASSETS.md), and nothing is drawn under the water at any zoom, light or water level. Game (G18): the hit-test-only `Bell`, and rings that show until the bell is noticed, after which that water is as still as the rest of the lake (the rings arrive with the water PRs, G3).

**P3-11 Cairn (art A22).** Owner-approved lore answer 8, 2026-10-25: build `cairn` (ASSETS.md Group 1) with the `Note` stone carrying two rows of shallow cut marks, one row for each sentence, worn soft, so they read as writing and are never legible, never a pattern or a symbol. The marks are painted, not modelled (the plate is about 0.12 u across, ART-BIBLE §C.1); moss sits around the stone, never over the marks. The words themselves are only in the journal line. Game: none.

**P3-12 Shiver nods (art A23, game G19).** Owner-approved lore answer 10, 2026-10-25: the shiver wave runs on from the farmhouse through grass, trees and still water, with small nods from light things. Art: the water spec's shiver hook, a soft ring or two on still water as the front passes, on the shared wrapped clock (P2-8) and off in still mode; and the nodding parts as their own named nodes so the game can nod them: the jetty deck (`wetland_jetty`), the sky-boat, Fin's rod tip (A18) and the camp's kettle lid (`barnaby_camp`), with names settled in each model's spec block. Buildings, rock and the land stay still, and nothing glows, cracks or falls. Game (G19): carry the `wind.ts` wave into the water rings and the nodes, off in still mode.

## 3. Art-owned work in stages

Each stage: one branch and PR, tests written red then green (both reported), renders at `CAM-TURN` plus `CAM-DESK`, `CAM-ORBIT-W`,
`CAM-ORBIT-E`, `CAM-CLOSE`, `CAM-PHONE` (≥ 3 orbit angles + the default camera, never one hero shot), the owner reviews sheets before
merge. `[skip ci]` for docs-only commits.

**Gate lifted (2026-10-25).** Stage 1 rules approved: the owner reviewed every proposed rule of the bible and its companions and
approved all of them as recommended ("Accept all recommendations"; ART-BIBLE decision log). V1 and V2 now enforce the retuned bands
(`ENFORCE_PROPOSED = true`), with the 15 legacy colours as named exceptions, the farmhouse walls as a named exception, and `outcrop_b`
(texel density) and `tree_spread` (canopy pivot) in the known-defects register, tied to P2-2 and P2-4. Stage 2 onwards no longer waits
on that review; each stage's own owner review of sheets before merge still applies.

| Stage | Items | Tests (red first) | Render check |
|---|---|---|---|
| 0 | A1 docs | — | — |
| 1 QA rails (done; rules approved 2026-10-25) | A2 (V1 asset contract with the stand-in register, density bands and known-defects register; V2 palette bands), A3 tooling hygiene | V1 red on `sheep`/`plot` off the allowlist; V2 red on an out-of-band fixture; with the proposed bands enforced: red on 40 colours and 8 materials, green after the owner's retune | none |
| 2 Garden | A4 plot, 24 crop stages, cranberry bed | `crops.test` requires all 10 crops × 3; V1 allowlist drops `plot` | fresh + mid-game garden at `CAM-DESK`, `CAM-CLOSE`, orbits, phone |
| 3 Water follow-ups (after the owner's review) | A5 teardrop in the bake, `patchShoreLambert` | `water.test` W8 against the teardrop outline; shore patch anchors apply once | the spec's sheets: 3 orbits + default + phone per body, both lights |
| 4 Prop kit | A7 atlas page 2 + 8 painted props, A8 atlas naming | `models.test` new entries (budgets, one material, atlas cells, nodes); P20 updated for two pages | turntables; in game after G4 |
| 5 Paths | A9 MAIN runs | `composition.test`: every layout.ts dirt path has an always-shown run that clears slots and lies on the baked top | `CAM-DESK`, `CAM-CLOSE`, proof `junction` |
| 6 Night keyframe | A6 | `lookpresets.test`: Night schema-complete, discrete values equal across moods, no NaN over 0–24 h | proof `?hour=22.6` and `?hour=0` against the game's night |
| 7 Sheep | A10 (method by the owner) | `models.test` P8 size, `Head` node, textured | turntable + meadow at `CAM-DESK`, `CAM-ORBIT-E` |
| 8 Trees | A11 | `trees.test` T10 bark-top rule; T4 pivot band for tree_spread | turntable + in-game motion (needs G10 or the proof) |
| 9 Palette + density | A12 export, A13 farmhouse A/B | `palette.test` export round-trip | `CAM-CLOSE` farmhouse 1024² vs 2048² for the owner |
| 10 Polish | A14, A15, A16, A17, A18 (waits for the owner's model), A19, A20, A21, A22, A23 | per item | per item |

## 4. Brief for the game session

Ordered by impact. **UI** marks overlap with the queued UI redesign.

| Game id | Item | Plan | Depends on | Note |
|---|---|---|---|---|
| G7 | Modern Minimalist UI redesign (queued) | P1-6 | — | **UI**: tokens, type scale, radii, spacing, HUD bugs, mobile dock, world labels; adds V3 and V4 |
| G1 | LOOK-PORT steps 1–2 behind a flag | P1-1 | art A6 for night | glow `#FFC877`, porch `#FFB866` from the presets |
| G3 | Water PRs 2–6 behind `water` | P0-2 | owner's review, art A5 | spec's gates |
| G6 | HUD-safe framing | P1-4 | G7's final HUD heights | **UI** |
| G2 | LOOK-PORT steps 3–4 (sky dome, fog, cloud sea, underside haze) | P1-1 | G1 | drops `SkyArt` and the puffs |
| G4 | Wire the painted prop kit (instanced fences) | P1-2 | art A7 | today's meshes stay as fallbacks |
| G5 | Drop `DirtPath` for the art runs | P1-3 | art A9 | `npm run composition` |
| G10 | Camera hook, canonical capture spec, frame-time probe | P2-5, P2-7 | — | **UI** viewports in V4/V5 |
| G9 | Texture/material dedupe by atlas name | P2-3 | art A8 | |
| G8 | Generated world palette | P2-1 | art A12 | |
| G11 | Cloud puff retint (skip if G2 is next) | P2-6 | — | |
| G12 | Wrapped shader phases | P2-8 | — | |
| G13 | Height-weighted crown sway (optional) | P2-4 | — | |
| G14 | Remove `SkyBridge`, obsolete fallbacks, deprecated meta | P3-3 | art A16 | |
| G15 | Dev asset preview stage | P3-5 | G10 | |
| G16 | Painterly distant isles | P3-6 | art A17 | |
| G17 | Barnaby's move-in at the ruin: the dressing switches on, the window lights by the day cycle | P3-9 | art A20 | the lean-to camp goes with him |
| G18 | Wetland bell: hit-test-only `Bell`, ripple rings until noticed (frozen in still mode) | P3-10 | art A21, G3 | the rings ride on the water PRs |
| G19 | The shiver beyond the foliage: the wave continues into still water and the nodding nodes (off in still mode) | P3-12 | art A23, G3, G12 | |

Overlap with the UI redesign: G7 (all of it), G6 (needs the redesigned HUD's heights), G10 (the UI viewports for V4/V5). Everything else is
independent of it; G7 itself must not touch `src/world/*` (UI-REDESIGN-BRIEF §2), so G6 follows it.

## 5. Counts

**23 art-owned items** (A1–A23; A1 done in this stage; A18 waits for the owner's model) and **19 game-owned items** (G1–G19). Thirteen plan items are joint (P0-2, P1-1, P1-2, P1-3, P2-1, P2-3, P2-4, P2-5, P3-3, P3-6, P3-9, P3-10, P3-12); each half is counted on its own side.
