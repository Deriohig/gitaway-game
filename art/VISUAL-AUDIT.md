# Gitaway visual audit (stage 1 of the art-direction overhaul)

Date 2026-10-24 · branch `art/art-bible` from `origin/art/idle-economy-art` b077472 (it contains `origin/main` with the painterly trees,
PR #52, merged) · owner's brief: `gitaway-ui-screenshots/ART-DIRECTION-BRIEF.md` + `-part2.md`, phase 1.

This is the evidence base for [ART-BIBLE.md](ART-BIBLE.md) and the plan in [ART-PLAN.md](ART-PLAN.md). Nothing here changes code or
assets.

**How to read it.** **F** = fact, read in a file (path:line) or measured. **J** = my judgement as art director, from the renders
listed below. Item ids (P0-1 …) point at [ART-PLAN.md](ART-PLAN.md).

**Evidence used.**
- Code and configs at b077472 (paths below).
- GLB measurements of all 94 files in `public/models` (tris, materials, textures, bounds, texel density, atlas hashes), made read-only
  with `@gltf-transform/core` for this audit.
- Renders of the current game: the 71 UI captures (`gitaway-ui-screenshots/`, main 09f390a, 1440×900 and 390×844 @2x, software
  WebGL, 14:00); scratchpad `review/` (underside/final, models, models/barnaby, paths, woodshed_move, water, pond_shapes); the other
  session's scratchpad (trees-ab, idle-art/shots, t5-shots, t3-shots).
- New for this audit, in scratchpad `review/art-audit/` (never in the repo): `style_gallery.png` (every published model from the
  game angle, TEXTURED vs FLAT, via `art/scripts/meshy/gallery.mjs`), `trees_spread_round.png` and `standins_sheep_plot.png`
  (turntables via `meshy/turntable.mjs`).

## 0. Summary: what matters most

| # | Area | Finding | Kind | Plan |
|---|---|---|---|---|
| 1 | Garden | The plot GLB is flat colour (`Dirt #C79A6E`, `Soil #B98B61`, `MutedWood #986641`, no texture) and reads as a wooden pallet, not soil; 8 of the 10 crops are flat procedural primitives. The core gameplay surface is the least art-directed object on screen. | F + J | P0-1 |
| 2 | Water | All water is the legacy `sin()` ShaderMaterials: opaque disc (alpha 0.94), concentric target rings, one palette for every body, a waterfall that fades out mid-air. The revamp is drafted (art PR 1 on `art/water-design`) and waiting for the owner. | F | P0-2 |
| 3 | Light + material model | The game renders `NoToneMapping`, a sun ~64° high at 14:00 and a strong hemisphere fill; GLBs keep `MeshStandardMaterial` while everything procedural is Lambert. The approved look (LOOK-PORT steps 1–4) is not in the game. Result: flat, shadow-light afternoons with no cool shade. | F + J | P1-1 (game) |
| 4 | Stand-ins | Flat procedural pieces still sit next to painterly models: sheep (flat GLB), fences, stepping stones, footbridge, pond bank/stones/pads/spike reeds, shelter, log, mushrooms, cranberry bed, windmill sails, the game's dirt paths, cloud puffs, distant isles. | F | P1-2, P1-3 |
| 5 | Phone composition | On a 390–412 px phone the island sits in the middle band with the lower ~25–30% of the screen empty haze while the HUD stack covers the top ~30%; framing ignores HUD-safe areas. | J (phone-07, idle-art phone-0) | P1-4 (game, overlaps UI redesign) |
| 6 | Palette forks | Three colour sources disagree: UI tokens / game `palette.ts`, art `look.config.mjs` palette, `lookPresets.json`. Terracotta `#C98268` vs `#B9654B`; path `#C8B08E` vs `#C2935E` vs `#A89478`; glass `#DCEBE8` vs `#A9D4E8`; window glow `#F2B35E` vs `#F5DCA0` vs `#FFC877`. | F | P2-1 |
| 7 | Texture density | The biggest Meshy models (farmhouse, greenhouse, lighthouse, outcrops, hero tree) carry 73–106 texels/u (farmhouse walls 79), small painted props 250–470 (the woodshed beside the farmhouse: 441). Detail frequency jumps 3–5× between neighbours. | F (measured) + J | P2-2 |
| 8 | Docs | `ASSETS.md` still says "flat shading … no image textures"; `STYLE.md` palette and cameras predate the painterly decision and the blueprint; `meshy/README.md` texture table is stale. | F | P0-3 (this stage) |

## 1. Inventory of visual systems

### 1.1 Runtime systems (game, `src/`)

| System | Where | Depends on | Notes |
|---|---|---|---|
| Canvas + renderer | `src/world/World.tsx:331-345` | R3F 9.8.2, three 0.186.1 | `flat` (NoToneMapping), sRGB out (R3F default), `alpha: true` + clear alpha 0, `dpr [1, 1.75]`, `antialias`, `powerPreference 'low-power'`, `shadows="percentage"` (PCF), `frameloop="demand"` driven by `Ticker` (`FPS` full 30 / calm 15 / still 0, `src/world/motion.ts:32`). |
| Camera + orbit | `World.tsx:146-198, 233-247`; `src/world/framing.ts` | `VIEW`, piece data | fov 30, near 0.5, far 600; target (0, −0.6, 0); dir (1, 0.78, 1) = az 45°, el 28.88°; zoom 14 … max(140, overview ≤ 400); polar 0.62–1.22; azimuth 45° ± 0.85 rad; no pan. |
| Day cycle, lights | `src/world/DayCycle.tsx`, `src/world/skyPalette.ts:24-140` | game clock, settings | KEYS table (night, 6.1, 8.5, 13, 16.6, 18.6, 20.1 h); one directional (PCF 2048, bias −0.0004, normalBias 0.035, box ±17 … 26, refreshed every 4th frame) + hemisphere; no ambient. |
| Fog | `DayCycle.tsx:91`, `World.tsx:88-104` | KEYS `fog` | Linear, near = camera distance + 40, far + 230. |
| Sky | CSS `body` gradient `src/styles/app.css:19` + `src/world/SkyArt.tsx` (SVG mountains, sun, moon, 140 stars) | `applySkyCss` | Behind a transparent canvas. |
| Backdrop | `src/world/Backdrop.tsx` | `makeIsland`, `RoundTree` | Cloud sea (2 InstancedMeshes of icosphere puffs, y −14 … −10.5), 5 drifting clouds, 4 distant isles, a flock of ink triangles. |
| Island ground | `src/world/pieceLoader.ts`, `MainIsland.tsx:100`, `Isles.tsx:113-150` | `public/models/piece_*.glb` + `.height.bin` | Baked pieces (`pieceMat`, smooth Lambert, `COLOR_0`); skirts; `makeIsland` fallback (`vertexMat`, flat, per-triangle colour). |
| Paths | art ribbons `Composed.tsx:303` (`paths_<piece>.glb`); game `DirtPath` `Structures.tsx:337-360`; `SteppingStones` `Structures.tsx:317` | composition meta | Two path systems on MAIN (see §2.1). |
| Water | `src/world/Water.tsx` | `palette.ts` water colours, `sky.current` | Legacy, see §2.6. Draft replacement on `origin/art/water-design`. |
| Composition | `src/world/Composed.tsx`, `composition.ts`, `composition.data.ts` | `art/config/composition.pieces.json` via `npm run composition` | One InstancedMesh per asset per piece per primitive; trees near/far switch at 35/30 u, far everywhere on phones (`composition.ts:212-236`); crown sway / grass lean in the vertex shader. |
| Placed models | `src/world/Asset.tsx` (`<Asset id>`, `WithModel`) | `manifest.json` status `ready` | Model replaces the procedural fallback; `prepareModel` → `gameMaterial` (`assetMaterials.ts:66-137`). |
| Procedural stand-ins | `Nature.tsx`, `Structures.tsx`, `Crops.tsx`, `Animals.tsx`, `WildIsles.tsx`, `Isles.tsx`, `features/*Models.tsx` | `materials.ts` `mat()` cache, `GEO` (`Nature.tsx:15-25`) | Flat-shaded Lambert primitives in `palette.ts` colours. |
| Effects | `Fireflies.tsx` (additive points `#FFDB85`), `Farmhouse.tsx:39` smoke puffs, `Farmhouse.tsx:66` porch light `#F6BE72`, `Structures.tsx:362` lighthouse beam, bees `bees.ts`, rise puffs `Rising.tsx:21`, `ReadyMarkers.tsx` | `sky.current` | Each hand-tuned; no shared effect vocabulary. |
| Wind | `src/world/wind.ts` | `windTime = clock.elapsedTime` (`wind.ts:126`) | Lean (grass), sway about the instance origin (crowns), shiver wave from the farmhouse. |
| Materials | `src/world/materials.ts`, `assetMaterials.ts` | — | `mat()` Lambert flat-shaded by default; `vertexMat`, `pieceMat`, `glowMat` (emissive `#F2B35E`), `glassMat` (`#DCEBE8`, 0.38); GLBs keep Standard; iOS-safe `storeLinear`; anisotropy 8. |
| HUD | `src/App.tsx`, `src/ui/*`, `src/styles/tokens.css`, `app.css` (1,732 lines), `features/*.css` | zustand store | Documented in `UI-NOTES.md`; the redesign is queued (UI-REDESIGN-BRIEF). World labels: drei `Html`, `.world-label` in `features/visitors.css:125-144`. |

### 1.2 Asset families (all 94 files in `public/models`)

| Family | Count | Ids | Texture approach |
|---|---|---|---|
| Meshy textured | 22 | farmhouse, windmill, greenhouse, lighthouse, well, bench, haystack, cart, hero_tree, rock_a/b/c, outcrop_a/b, chicken, duck, dog, cat_sleeping, goat, lantern, beehive, scarecrow | one painted JPEG atlas (512², farmhouse/windmill/hero_tree 1024²), r 0.92, m 0, double-sided; farmhouse + roof tile 512² |
| Painted procedural | 5 | woodshed, wetland_jetty, barnaby, barnaby_camp, tower_ruin | the shared 512² painted atlas (`lib/paintedAtlas.mjs`) + baked AO in `COLOR_0` |
| MegaKit reskin | 14 near + 11 far | tree_pine_a/b, tree_round_a/b, tree_spread, tree_sapling, tree_birch, tree_fruit, 3 autumn, bush_a/berry/flowering | bark JPEG 512² opaque + leaves PNG 512² MASK; far: 256² |
| Plant kit (code-painted cards) | 22 | 12 ground cover, crop_sunflower_1–3, crop_lavender_1–3, flowerbed, shrub_low/mound/heather | one PNG per plant (128–512 px), MASK, cards two-sided by duplicated faces |
| Flat procedural GLB | 4 | sheep, plot, grass_tuft, flower_head | colours only (`COLOR_0` or palette materials) |
| Baked data | 16 (+ 8 `.height.bin`) | piece_* ×8, paths_* ×8 | `COLOR_0`, no texture |

Game-drawn with no GLB at all: water (pond, stream, falls, lake, brooks), stream footbridge, fences, stepping stones, the game's dirt
paths, pond bank/stones/pads/reeds, wetland reeds and lily pads, cranberry bed, meadow shelter, grove log and mushrooms, heather
blobs (only without the composition), bees, smoke, fireflies, lighthouse beam, cloud puffs, distant isles, birds, the 8 stand-in crops,
every visitor stand-in (no `visitor_*` model exists), the dead `SkyBridge` (`Structures.tsx:412`, no caller).

## 2. Area assessments

### 2.1 Terrain and island edges

**Works, preserve**
- F: One baked, watertight heightfield per piece, seams exact (≤ 7.6e-7 u), shared seam normals, 37,526 tris for all 8 pieces
  (`BLUEPRINT.md` "Baked pieces"). Lone petals hang as their own rock (underside taper v5, approved).
- F: The living-ground lawn paint: five greens with 5–7 u patches, clover ground, worn grass by the farm's paths (`art/scripts/lib/terrain.mjs:2098-2103`).
- J: The coast wall + cone silhouette reads well from the default camera (`review/underside/final/all.png`).

**Inconsistent, unfinished, noisy**
- F: Two path systems on MAIN. The game draws layout.ts `DIRT_PATHS` with `mat('path')` = `#C8B08E`, 0.6/0.5 u wide, ±12 % sine wobble,
  double-sided, no soft edge (`MainIsland.tsx:109-111`, `Structures.tsx:337-360`); the art ribbons are `#A89478` ±10 % noise with soft
  alpha edges, 0.8–1.1 u (`BLUEPRINT.md` "Path ribbons"). Where a run meets a game path the tone and edge change. The living-ground
  spec already lists "the dirt path drawn over the art paths" for clean-up.
- J: Under the game light the lawn reads as one muted mid-green at 35 u (trees-ab `scale-1.0-default.png`, t3 `7-late-afternoon-default.png`):
  the patch contrast the bake added is flattened by the high sun and strong hemisphere fill, not missing from the albedo.
- J: The underside on phones reads as a hard brown-mauve wedge against pale haze (`phone-07-hud-midgame.png`); the proof's
  `islandHaze` fade is not in the game.
- F: Distant isles use `makeIsland` + `vertexMat` (flat facets) and a `RoundTree` (`Backdrop.tsx:84-111`): the only flat-shaded
  terrain left in view.

**Impact.** Medium. The ground is coherent; what hurts is light (§2.8) and the path duplication at the farm.
**Shared fix.** One path system (art ribbons for everything, P1-3); the look port's underside haze (P1-1).

### 2.2 Vegetation

**Works, preserve**
- F: Painterly trees (MegaKit reskin from the approved concept ramps, `art/reskin/concept-stats.json`), far versions, near-white
  crown tint clamped to [0.92, 1.08]; fir and flowering bush approved as is; farm trees at ×1.0 (owner).
- F: The plant kit (12 ground-cover cards, 8–36 tris, MASK PNG), flower crops for sunflower and lavender, the painterly flowerbed.
- F/J: Wetland reeds (procedural, `WildIsles.tsx:70`) are liked by the owner.

**Inconsistent, unfinished**
- F: `tree_spread` has its canopy pivot at 0.213 u = 0.111 × H, `tree_pine_a` at 0.394 u = 0.154 × H (measured; allowed by ruling
  R22, `tests/trees.test.mjs:161`). The crown sways about that pivot (`wind.ts:79-86`, ±0.03 rad) while the bark stays still, and
  `tree_spread`'s bark reaches 1.634 u = 85 % of its height inside the crown (measured). J: this is the mechanism behind the
  reported trunk-tip artefact (the static trunk tip shows against the moving crown, and through the thinned far crown, 29 % of the
  cards); not reproduced in a still render (`review/art-audit/trees_spread_round.png`), so it needs a motion check.
- F: 468 of 656 composed trees are conifers (71 %, `composition.data.ts`); J: the isles read dark teal from the default camera,
  which suits the highland but makes the meadow/cottage/orchard edge heavy.
- F: Scale step at MAIN's rim: farm round trees 2.2–3.1 u, farm firs 2.9–4.1 u (×1.0, decided), composed broadleaf ~1.6 u,
  composed firs ~2.4 u (mean scales 0.70 / 0.94). J: decided; watch it where a farm fir stands next to a docked piece's woodland.
- F: `grass_tuft` and `flower_head` are still published with 0 composed instances; the game's own `GrassTufts` / `Wildflowers`
  (`Nature.tsx:271, 325`) draw only when the composition is off (`MainIsland.tsx:105-106`).
- F: Heather blobs (`WildIsles.tsx:222`, purple tints `#9C7BA8`…) draw only without the composition; `shrub_heather` replaces them.
- J: The flowerbed's edging stones are flat sage/grey `COLOR_0` lumps next to painted flowers (`standins_sheep_plot.png`).

**Impact.** Low–medium: vegetation is now the most cohesive family. **Shared fix.** Pivot/trunk rule in ASSET-RULES §3, P2-4.

### 2.3 Buildings

**Works, preserve**
- F/J: The farmhouse (Meshy, 3,646 tris, roof on its own 512² tiling texture at 288 texels/u) is the style anchor; windmill,
  greenhouse (frosted painted panes, no `Glass` material), lighthouse, well share its painted look.
- F: The woodshed (painted procedural, 1,196 tris, 0.889 u tall) at spot B, `byHouse(2.0, −1.2)` = (−3.434, −4.263) (`layout.ts:113`).
- F: Textured `Glow` + emissive window mask lit by the day cycle (`assetMaterials.ts:66-77`).

**Inconsistent**
- F (measured texel density): farmhouse walls 79 texels/u, greenhouse 80, lighthouse 81, windmill 133, well 145; woodshed 441,
  tower ruin 246. J: at the 14 u close zoom (≈ 120 css px/u at 1440×900, ×1.75 dpr) the farmhouse walls are under-sampled ~2.7×
  in device pixels while the woodshed beside it is crisp: a visible sharpness step between neighbours.
- F: The windmill's sails are procedural vertex colours inside a textured model (manifest note), grey-flat in `style_gallery.png`.
- F: Budgets: farmhouse 3,646 and windmill 3,480 exceed the 3,000 building budget (`ASSETS.md:82`); accepted as hero exceptions
  (`meshy/README.md:84`), never written down as a rule.
- F: GLB materials stay `MeshStandardMaterial` (GGX highlight, r 0.92) while the ground and stand-ins are Lambert; LOOK-PORT step 2
  plans the Lambert conversion (`LOOK-PORT.md:130-140`).

**Impact.** Medium (the hero reads well at 35 u; sharpness and sail shading show up close). **Shared fix.** Texel-density band per
class (ASSET-RULES §5), Lambert + cel for all GLBs (P1-1).

### 2.4 Props

**Works.** F: Meshy props (bench, haystack, cart, lantern, beehive, scarecrow, rocks, outcrops) and the painted jetty match the
painterly family (`style_gallery.png`).

**Inconsistent, unfinished**
- F: Flat procedural props with no model: `FenceRun` (`Structures.tsx:285`), `SteppingStones` (`:317`), footbridge `Bridge`
  (`Water.tsx:318`), `Shelter` (`Structures.tsx:455`, the meadow), `Log` (`:498`) and `Mushrooms` (`:483`, the grove), `CranberryBed`
  (`WildIsles.tsx:133`), `LilyPads` (`:113`), the pond bank disc, 11 stone stand-ins, 3 pads and 7 cone reeds (`Water.tsx:159-197`).
  J: the fence runs and the plots are the largest flat areas in the default view (`woodshed_move/sheet.png`).
- F: The painted atlas is full (`paintedAtlas.mjs:18`): a new painted prop needs a repack or a second page.
- F: The atlas JPEG is byte-identical in all five painted GLBs (sha256 `d35155ff182a…`, 65 KB each), so the game uploads five 512²
  textures and builds five materials for one image (`tests/models.test.mjs:427-445` pins the duplication as intended).
- F: Rocks: Meshy `rock_a/b/c` at composed mean scale ~0.58; procedural `Rock` stand-ins tint `stone`/`stoneDark` when a model is
  missing (`Nature.tsx:204-224`).

**Impact.** High for fences and plots (big, central, flat). **Shared fix.** Painted-procedural kit on a second atlas page (P1-2) and
texture dedupe (P2-3).

### 2.5 Characters and animals

**Works.** F: Meshy chicken, duck, dog, goat, cat (`Head`/`Tail` nodes, coat tints, `coats.ts`); Barnaby's look per the owner's
direction (crumpled pointed hat, slate-teal robe, warm scarf, brass band, hip lantern, satchel; no purple, no long white beard).

**Inconsistent**
- F: `sheep.glb` is the only flat animal: 620 tris, three palette materials (`DeepWarmInk`, `WarmIvory`, `SoftCream`), faceted wool
  (`standins_sheep_plot.png`).
- F: Dog 1,918 tris (28 % over the 1,500 animal budget, manifest note).
- J: Barnaby's face and hands are blocky next to the Meshy animals (`models/barnaby/bz_final.png` close-up); acceptable at game
  distance (1.06 u ≈ 50 px at 35 u), decided, keep.
- F: No `visitor_*` model exists; the hare (the púca's first appearance, CAST §4, C6) draws as a procedural stand-in (`features/visitorModels.tsx`).

**Impact.** Medium (the sheep sits in the meadow pasture, a mid-ground focal area). **Shared fix.** P1-5.

### 2.6 Water

**Works.** F/J: Water placement, the stream-into-river continuity on docking, wetland reeds.

**Unfinished (all F, `Water.tsx`)**
- One palette for all bodies: `water #91B7C8`, `waterDeep #6E9AB0`, `foam #E8F1F0`, 25 % sky mix (`Water.tsx:12-20, 38`).
- Pond: radial gradient from the centre, concentric `sin` rings, alpha 0.94 everywhere, brown bank disc, no shadows received
  (`uLight` scalar, `:105`).
- Stream sits above the pond (+0.075 over +0.06) and the junction seams; streak spacing follows the curve parameter.
- Waterfalls fade out from 2 u to 4.6 u below the lip (`:94`): the farm fall ends in mid-air; mist blobs hang detached.
- `uTime` is raw `clock.elapsedTime`: loses precision after days open (water spec §2).

**Impact.** High: water is a named focal element (pond by the house, the wetland lake) and the owner called it "pretty bad".
**Fix.** The draft revamp (custom baked-data Lambert material, 3-band depth ramp, per-body palettes, teardrop pond): art PR 1
done on `art/water-design`; game PRs 2–6 (P0-2).

### 2.7 Sky, clouds, background

**Works.** J: The CSS gradient and SVG mountains are cheap, follow the day cycle and keep the island the brightest thing in view.

**Inconsistent**
- F: Cloud puffs are icosphere detail-2 instances squashed to 0.42 in y, colour `#FBF5EA` with emissive `#6A6478` × 0.22
  (`Backdrop.tsx:16-17, 58`), lit by the same flat-shaded Lambert as the farm. J: they read as beige plastic blobs, large and close
  enough to be cut by the frame (trees-ab default, top right) and to cluster at the island's level on phones (idle-art phone-0).
- F: The rise puffs reuse the same material (`Rising.tsx:21-22`).
- F: The approved replacement is the painted sky dome + cloud sea (LOOK-PORT steps 3–4); the water spec keeps the cloud sea out of
  scope (§3.6).

**Impact.** Medium (clouds frame every view). **Fix.** P2-6 (interim retint) or LOOK-PORT steps 3–4.

### 2.8 Lighting, shadows, fog, post

**Works.** F: One shadow-casting sun with PCF 2048 and a fitted reach; warm windows at dusk; fireflies at night; still/calm/full motion.

**Inconsistent**
- F: `NoToneMapping` (`World.tsx:334`) while the proof, the presets and every look decision since 2026-10-18 use
  `NeutralToneMapping`, exposure 1.05 (`lookPresets.json` presets."Golden afternoon".renderer).
- F: Sun direction `el = 0.28 + sin(π·day)·0.85` rad (`skyPalette.ts:120`): 63.8° at 14:00, 50.5° at 16.5 h; the approved key is
  30° from the back-left (LOOK-BRIEF Phase 1; preset `sun.elevationDeg 30, azimuthDeg −115`).
- F: Hemisphere fill 1.05–1.1 against a sun of 1.75–1.95 (`skyPalette.ts:38-52`); no cel shade tint, no rim, no contact shadows,
  no underside haze, no post.
- J: Shadows are short and soft, forms read by albedo alone, shade is grey-green not cool violet; the "late afternoon storybook"
  target is not on screen. This is the largest single quality lever and it is game-owned.

**Fix.** LOOK-PORT steps 1–2 behind a flag, then 3–4 (P1-1).

### 2.9 Camera and composition

**Works.** F: Fixed az 45° / el 28.88° view, deterministic framing (`framing.ts`), orbit clamps that never show the island from
behind, 14 u close zoom with the farm still in frame.

**Inconsistent**
- F: Framing fits MAIN's 27 × 19 u with fill 0.95 (`framing.ts:48-50, 96`) and docked pieces into 72 % × 86 % of the view, symmetric
  about the screen centre; the HUD is not symmetric (top stack ~300 css px of 844 on a phone; bottom dock ~96 px).
- J: Phones: the island sits mid-screen with the lower ~25–30 % empty haze, while the top HUD covers ~30 % (phone-07, idle-art
  phone-0). Desktop: the drawer (384 px) covers the east third of the island with no reframe.
- F: The game has no committed camera hook for canonical screenshots; in-game sheets used a temporary `window.__gw` patch
  (other session's `idle-art/ia-shots.mjs`).

**Fix.** HUD-safe view offset (P1-4, game, overlaps the UI redesign); canonical camera hook (P2-7).

### 2.10 HUD, panels, mobile

**Works, preserve (UI-NOTES §5–7).** Cream surfaces, Fraunces + Inter, forest primary, gold for counts, terracotta for end/destroy,
`--ease cubic-bezier(.22,.8,.3,1)`, keyboard 1–6, reduced motion, inline SVG icons on a 24 grid at 1.4 px ink stroke (`src/ui/Icon.tsx:7`).

**Inconsistent (F unless marked)**
- Type scale sprawl: 17 distinct `font-size` values in `app.css` (11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 19, 21, 22, 24, 36, 40 px), plus `font:` shorthands (e.g. world labels 12.5 / 11.5 px).
- 21 raw hex colours in `app.css` outside `tokens.css` (e.g. disabled `#cfc6b4`/`#6f695c`, danger tints `#f3e2d4`, `#f6e4da`).
- Radii 18/12/8 (`tokens.css:35-37`) vs the approved 8/12/16/20/pill; `.card` is translucent with `backdrop-filter: blur(6px)`
  everywhere (`app.css:214-223`), which the brief asks to restrain.
- No spacing tokens; no semantic tokens for warning, error, disabled, selection.
- UI-NOTES §7 layout bugs: collection/harvest card hidden ≤ 900 px; welcome card 376 px wide in a 358 px box at 390 px;
  reset `<dialog>` edge to edge on phones; phone sheets overlap the session pill (phone-09, 11, 13); phone toasts cover the farm badge
  and session card (phone-29); Settings is one long scroll; "Inventory" is long for the phone dock.
- The phone e2e project is Pixel 7 (412×915, `playwright.config.ts`), not the 390×844 reference viewport.
- J: World labels (`.world-label`, 12.5 px pill) and in-world markers are the only UI inside the 3D view; they should follow the
  redesign's pill/toast styling.

**Fix.** The queued UI redesign (game) owns all of this; the bible fixes its target (ART-BIBLE §F).

### 2.11 Tokens and palettes

- F: Three colour sources:
  - UI `src/styles/tokens.css` = the brand palette; `src/world/palette.ts:4-63` repeats it and adds world colours for stand-ins
    (soil `#6E5444`, path `#C8B08E`, stone `#C9BFB0`, cliff ramp, water `#91B7C8` …).
  - Art `art/config/look.config.mjs:25-93` = the model palette (`WarmIvory #F3E4C4`, `Terracotta #B9654B`, `MutedWood #986641` …) that
    every procedural and painted GLB is built from.
  - `art/config/lookPresets.json` = terrain paint, light, sky, fog, cel, water, plants per mood.
- F: The stand-ins are drawn in UI pastels (`terracotta #C98268`, `sage #9CAF88`) next to models built from the art palette
  (`Terracotta #B9654B`); the pastel stand-ins read washed out beside the painted models.
- F: Board hexes on `design-board-modern-minimalist.png` (Primary `#6B8B6E`, Error `#D9785F`, Surface `#FBF6EF`, Muted `#E7E1D5`)
  differ from the tokens; the UI brief says the written spec and existing palette win (UI-REDESIGN-BRIEF §1, §3).

**Fix.** One token source per domain (ART-BIBLE §B), a generated world palette for `src/world` (P2-1).

## 3. The known items, checked

| Item | Fact | Status |
|---|---|---|
| Atlas duplication in painted GLBs | 5 × 65 KB identical JPEG (sha256 `d35155ff182a…`), 5 textures + 5 materials at runtime | P2-3 |
| Meshy vs painted procedural vs MegaKit vs flat | 22 / 5 / 14 (+11 far) / 4 GLBs, plus game-drawn primitives (§1.2) | rules in ASSET-RULES; P1-2, P1-5 |
| Flat stand-ins (sheep, plot, crops) | sheep 620 tris flat; plot 96 tris flat; 8 crops (radish, carrot, wheat, lettuce, tomato, pumpkin, blueberry, cranberry) procedural, drawn at ×1.45 (`Crops.tsx:271`) | P0-1, P1-5 |
| Legacy sin() water | §2.6 | P0-2 |
| Cloud puffs | §2.7 | P2-6 |
| UI notes layout bugs | §2.10 | UI redesign (game) |
| tree_spread trunk tip | bark top 1.634 u (85 % H) inside a crown swaying about a 0.213 u pivot | P2-4 |
| Low canopy pivots | tree_spread 0.111 × H, tree_pine_a 0.154 × H | P2-4 |

## 4. Doc drift (what the bible supersedes)

| Doc | Drift | Action this stage |
|---|---|---|
| `art/ASSETS.md` "Art direction", "Technical spec › Materials" | "soft low-poly … flat shading … no image textures"; the UI palette as model palette | marked superseded → ART-BIBLE §A–D, ASSET-RULES |
| `art/config/STYLE.md` §2 palette, §3 R1, §7 cameras | pre-painterly swatches; tone-mapping rule decided since; proof cameras only | marked; rules P1–P5, T*, C* still valid |
| `art/meshy/README.md` model table | windmill/hero_tree listed at 256², published at 1024² | marked → ASSET-CATALOG |
| `art/LOOK-PORT.md`, `BLUEPRINT.md`, `TUNING.md`, briefs, specs | still correct for their scope | pointer to the bible added |
