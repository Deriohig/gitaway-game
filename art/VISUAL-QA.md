# Gitaway visual QA

2026-10-24 · owner's brief phase 6 (document + canonical cameras). Art plan stage 1 "QA rails" automated V1 and V2 (§3a); the rest
of the automation is scoped in §4. Cameras are defined in
[ART-BIBLE.md §E.2](ART-BIBLE.md#e2-canonical-cameras-use-these-ids-in-every-comparison); tools in [ART-TOOLING.md](ART-TOOLING.md).

**Honesty rules.** Headless captures use SwiftShader: softer than a GPU and useless for timing. Frame time is measured on the reference
GPU (GTX 1660 S, Windows Chrome) and the 4× CPU-throttled mobile profile only. No screenshot comparison or test is reported as done
unless it ran.

## 1. What to capture

| Subject (brief §6) | Game cameras | Proof views (art) | Asset harness |
|---|---|---|---|
| Full island | `CAM-DESK` fresh + mid-game, `CAM-FAR` all docked, `CAM-PHONE` | `full`, `island_wide`, orbits `orbit_front/side/back` | — |
| Terrain and island edges | `CAM-LOW`, `CAM-ORBIT-W/E` | `edge`, `rim_edge`, `wetland_edge`, `docking` | `bake.test.mjs` B13/B17 numbers |
| Vegetation and natural props | `CAM-CLOSE` at the farm, `CAM-DESK` | `woodland`, `grove`, `meadow`, `highland` | `meshy/turntable.mjs`, `meshy/farsheet.mjs` (near vs far at 20/40/60 u), `meshy/forest.mjs` |
| Buildings and constructed objects | `CAM-CLOSE`, `CAM-ORBIT-W/E` | `farm`, `junction`, `islet` | `meshy/gamecam.mjs` (roof 4.5 u, bark 3 u), `meshy/gallery.mjs` (TEXTURED vs FLAT) |
| Water | `CAM-DESK`, `CAM-CLOSE`, `CAM-PHONE` | `lake`, `waterfall`, `pond` (water branch), `?waterdebug=` | water review sheets (3 orbits + default + phone per body) |
| Lighting, shadows, atmosphere | `CAM-DESK` at 8.2 / 14.5 / 19.1 / 22.6 h (settings presets) | `?look=<mood>` and `?hour=H` | `look-grid.mjs` mood sheets |
| Desktop HUD | 1440×900 and 1024×768, HUD on: fresh, mid-game, running session, panel open, toasts | — | UI capture procedure (UI-NOTES §1) |
| Mobile HUD | 390×844 @2, 375×667 @2, 720 wide; Pixel 7 412×915 (e2e) | — | as above |

Unlock states: fresh (`main`), mid-game (main + meadow, grove, islet), all docked. Motion: still. Clock fixed (UI captures used Sat
24 Oct 2026 14:00 local). Hide the dev-only "Dev" tab (`src/dev/dev.css`) in every capture.

## 2. How to capture with the existing tools

**Proof viewer (art; geometry, composition, look presets).** `cd art/scripts && npm ci && node build.mjs` writes the proof to
`PROOF_DIR` (default: the git-ignored `art/scripts/.build/proof`; `GITAWAY_PROOF` also works), `node shots.mjs` serves the same
folder on 127.0.0.1:8187.
- The 7 fixed views: `node look-capture.mjs <phase> [--look "<preset>"] [--views full,farm]` → `art/screenshots/<phase>/raw/`;
  side by side: `node look-sheet.mjs <before> <after>`; N-up: `node look-grid.mjs`.
- Presets at both seeds: `node capture.mjs <prefix> [--light game --hour 14.5] [--only default_desktop]`; metrics + concept crops:
  `node metrics.mjs`, `node contact-sheet.mjs --prefix <p>`.
- Any game camera, exactly (LOOK-PORT §6): in the page console
  `await __saveShot('cam_desk', { mode: 'gameplay', az: 45, el: 28.88, dist: 35.5, tgt: [0, -0.6, 0], w: 1440, h: 900, unlocked: 'main,meadow,grove,islet', returnUrl: true })`;
  phone: `dist: 130, w: 824, h: 1830`; orbits: `az: 16.35` / `73.65`; low tilt `el: 20.1`; close `dist: 14`.
- Orbit sweeps of one spot: `node meshy/cap_orbit.mjs index.html <outdir> <tgt> <dist> <el> <az1,az2,…> [hour]`.
- Caveat: the proof draws Lambert + cel and its own placeholder water; the game draws Standard GLBs without cel. Use
  `?look=Game (current)&hour=14.5` for light parity and `?baked=1` for the game's terrain.

**Asset harnesses (art; one model at a time).** `node meshy/turntable.mjs <out.png> "<title>" <a.glb> …` (`CAM-TURN`: four
quarter views at 24°, a posed view, the game angle); `node meshy/gallery.mjs <out.png> "<title>" <glbs…> --cols 8` (style audit);
`node meshy/farsheet.mjs`, `meshy/gamecam.mjs`, `meshy/ortho.mjs` (pivots on a grid). They resolve Playwright through
`lib/playwright.mjs` (`PLAYWRIGHT_ROOT`, then the repo root, then the worktree's main checkout) and three from
`art/scripts/node_modules`.

**The game (canonical in-game views).**
- Build and serve: `npm run build && npx vite preview --port <p>`.
- State: write a save into IndexedDB before load (`e2e/fixtures.ts` `Farm.load`, or the other session's `idle-art/ia-shots.mjs`
  pattern), with `settings.motion: 'still'`, `timeOfDay: 'afternoon'`, `welcomed` and `tutorialDone` true.
- Wait for `[data-testid="world"]` `data-drawn="true"` and `data-models="loaded"`, then ~4 s.
- Camera: the default view is `CAM-DESK` / `CAM-PHONE` by construction; the world element reports `data-camera-distance` and
  `data-frame-distance`. Orbit, tilt and zoom have **no committed hook** today; past sheets patched a temporary `window.__gw` into the
  build. Stage 2 adds a dev-only camera hook (plan P2-7).
- UI captures: Playwright 1.64 headless, desktop 1440×900 @1, phone 390×844 @2 with touch and mobile UA, page clock fixed (UI-NOTES §1).

**Comparison sheets.** `look-sheet.mjs`, `look-grid.mjs`, `contact-sheet.mjs`, `meshy/contact.mjs` (labelled grids), `meshy/sheet.mjs`.
Sheets go to the scratchpad or `art/screenshots/<phase>/` (raw PNGs git-ignored, sheets ≤ 1.45 MB committed).

**References to compare against.** The farmhouse (style anchor); `art/reference/concept/*.png` (layout and mood, one per preset);
the approved per-model concepts `art/meshy/<folder>/source/concept_1.png` (git-ignored; their ramps frozen in
`art/reskin/concept-stats.json`); owner-approved renders (underside taper final, woodshed spot B, painterly trees); the UI board
`design-board-modern-minimalist.png` and the 71 UI captures (current state).

## 3. Which checks are objective and automated today

| Check | Tool | Status |
|---|---|---|
| Model files ↔ manifest, `ready`, ids, nodes, tris, ≤ 200 KB, Meshy copies byte-identical, painted atlas shared and ≤ 512² | `art/scripts/tests/models.test.mjs` | automated (node) |
| **V1 asset contract**: all 94 manifest models against their category (manifest ↔ files, category, texture approach A–E, budgets and the seven named triangle exceptions, materials, one material, nodes, far versions, base at y 0, the flat-colour stand-in register); texel density per material (approved bands, farmhouse exception), canopy pivot 0.25–0.45 × H, the 3× neighbour rule inside a family, the known-defects register | `tests/assets.test.mjs` + `lib/asset-contract.mjs` | automated (node), **blocking**, including the owner-approved density, pivot and neighbour rules (§3a) |
| **V2 palette bands**: `look.config.mjs` palette, `lookPresets.json`, sampled painted-atlas cells, the farmhouse roof, Meshy rock albedos and concept ramps against ART-BIBLE §B.1 saturation / value / temperature; the 15 legacy colours as named exceptions | `tests/palette.test.mjs` + `lib/palette-bands.mjs` | automated (node), **blocking** (owner-approved bands, §3a) |
| Tooling hygiene: no session scratch paths, the proof folder env var + repo-local default, one Playwright lookup | `tests/tooling.test.mjs` | automated (node) |
| Tree species table, caps, heights, canopy pivot 0.05–0.8 × H, far versions (tris, textures, nodes, pivot) | `tests/trees.test.mjs`, `reskin.test.mjs`, `species.test.mjs` | automated |
| Plant kit budgets, `MASK`, POT textures, upward normals, determinism; cover caps and patchiness; crops fill the plot | `plantkit.test`, `cover.test`, `crops.test` | automated |
| Lawn variety (p5–p95 spread, ≥ 4 tones, byte-identical grids) | `lawn.test.mjs` | automated |
| Terrain invariants, seams, height grids, underside screen share ≤ 20 % at the gameplay cameras, seam-wall ratio | `blueprint.test`, `bake.test` (B13, B17), `terrain.test`, `look.test` | automated |
| Composition: clearances, counts, GLB structure, ribbons on the baked top, seam rows | `composition.test.mjs` | automated |
| Look presets schema, mood parity, cel patch applies on three r186 | `lookpresets.test`, `lookcore.test` | automated |
| Proof runtime: colour pipeline, materials, sky, draw calls ≤ 920, plants, Meshy placements | `phase1/phase2/lookcore/plants/meshy.browser.mjs` (headless) | automated, run by hand |
| Image metrics vs concept: saturation, luma, darkest luma ≥ 0.08, hue shares, clumping index | `metrics.mjs`, `look-gates.mjs`, `clumping.mjs` | semi-automated |
| Game: iOS-safe textures (`storeLinear`), anisotropy, wind patches, framing distances, placement and clearance | vitest in `src/world/*.test.ts` | automated (CI) |
| Game: models load without CSP or texture errors | `e2e/models.spec.ts` | automated (CI desktop) |
| Game: phone toolbar labels fit and never spill | `e2e/toolbar.spec.ts` | automated (mobile, local) |
| Game: still mode does not redraw; panels leave the world as drawn | `e2e/drawing.spec.ts` | automated |

**Objective but manual today:** frame time and draw calls in the game (Playwright probe + `?stats=1`-style readouts on the reference
GPU); HUD overlap, clipping and text overflow outside the toolbar (screenshots by eye); the HUD-safe zones (approved 2026-10-25,
ART-BIBLE §E.3: projected for the review, not yet a test). Texel density is measured and enforced by V1 on every run.

### 3a. V1 and V2 (stage 1 "QA rails"): how to run, what blocks

Run from `art/scripts` after `npm ci`: `node tests/assets.test.mjs` (V1) and `node tests/palette.test.mjs` (V2), a few seconds each;
every node suite: `for t in tests/*.test.mjs; do node "$t" || echo "FAIL $t"; done`. They are not in CI (CI runs the game's checks):
run them before pushing art changes.

**Approved by the owner on 2026-10-25 ("Accept all recommendations") and enforced.** The bands the art director proposed (colour
saturation, value and temperature; texel density, canopy pivot, the neighbour rule) were reviewed against every approved asset and
retuned where they failed the owner's own approved art (ART-BIBLE §B.1, §D.3; ASSET-RULES §10). V1's density, pivot and neighbour
checks (A11-A13) and V2's band checks (PB2-PB8) now BLOCK: `ENFORCE_PROPOSED = true` in `art/scripts/lib/qa-proposed.mjs`
(`false` only surveys a retune: both suites then print every value outside a band and never fail on it). Blocking whatever that
constant says: V1 A1-A10 and A14 (manifest, categories, the stand-in register, approach, budgets, materials, one material, nodes,
base, tidy registers, the known-defects register) and M1-M16 (the contract goes red on mutated manifests; M15 the water bake, M16
the named Meshy-crop exception); V2 PB1 (the detector
flags every colour of `tests/fixtures/palette.out-of-band.json` and none of its in-band controls), PB9 (the switch), PB10 (the legacy
register is tidy) and PB11 (it bites). V2 PB12 (the Meshy crops' ripe stages: their produce, fruit, roots, heads, berries, within the
owner's 0.85 produce exception; their leaves and stems in the foliage band) blocks with the bands.

**Registers, each only shrinks.** In `lib/asset-contract.mjs`: `STAND_INS`: the flat-colour placed models allowed for now, each with
the plan item that replaces it: `sheep` (P1-5 / A10; `plot` left it on 2026-10-25, painted procedural since stage 2).
Any other flat model fails A3; an entry that gets a texture or leaves the manifest fails as stale, and the
register can never grow past its 2026-10-24 ceiling (`STAND_IN_CEILING`). `DEPRECATED`: `grass_tuft`, `flower_head` (P3-3 / A16),
flagged in the output. `EXCEPTIONS`: per-id ceilings, each with its source (the farmhouse and windmill hero tris / KB / 1024², the
seven triangle exceptions of ASSET-RULES §10, piece_highland KB, the duck and jetty waterline bases, the ruin's bedded stones, the radish and carrot roots (owner, 2026-10-25: radish and carrot roots
sit partly below the soil), the
farmhouse PorchLamp roughness); an exception that is no longer needed fails, and an eighth triangle exception fails
(`TRIS_EXCEPTION_CEILING`). `crop_meshy` (the class, by name in `MESHY_CROPS`): the owner's Meshy-crop exception (2026-10-25), the eight ripe crops at ≤ 2,500 tris
as painted atlases; any other crop id is held to the kit's 400 tris (M16). `HERO_WALLS`: the farmhouse walls, the one named exception to the ≥ 128 hero target (stale once they
reach it). `KNOWN_DEFECTS`: the two genuine, tracked defects, each tied to its plan item: `outcrop_b.density` (P2-2 / A13: 73 t/u
against the ≥ 100 floor and the 3× family spread) and `tree_spread.pivot` (P2-4 / A11: 0.111 × H against 0.25–0.45); enforcement
passes while they stay, the entry fails as stale the day the defect is fixed, and the register can never grow past
`KNOWN_DEFECT_CEILING` (fix the asset instead). In `lib/palette-bands.mjs`: `LEGACY`, the 15 colours of the pre-port look that
still break a band, excused by name with a reason, never by a wider band: look.config `Grass`, `GrassDark`, `Soil`, `DarkSoil`,
`Path`, `TerrainGrass`, `TerrainMeadow`, `TerrainGrassDark` (saturation), `ContactShadow` (temperature), and `grass.dry` (saturation),
`paths.color` (saturation), `shadows.contact.color` (temperature) in the retired presets `Game (current)` and `Proof warm (v4)`; each
entry is excused from the one rule it names, goes stale when its colour is retired or fixed, and cannot grow past `LEGACY_CEILING`
(PB10, PB11). A new asset needs a category in `ASSET_CLASS` (crop stages, pieces, path ribbons and tree far versions match by
pattern), or A2 fails. A new palette token needs a family in `PALETTE_FAMILY` (`null` for sky and light colours).

**First report (2026-10-24) and what the review did with it.** Run with the proposed bands switched on, V1 had 8 of 67 textured
materials outside a density band (farmhouse walls 79 against ≥ 128, greenhouse 80 and lighthouse 81 against ≥ 120, outcrop_a 106 and
outcrop_b 73 against ≥ 110, cart 163 against 200-500, wetland_jetty 465 and tower_ruin 246 against 250-450) and V2 had 40 colours
outside a band across five checks. The review sorted them: 25 approved colours (the stone band ≤ 0.20 against `Stone` 0.21,
`DarkStone` 0.26, every Meshy rock and outcrop at 0.21-0.27 and the atlas stones; the timber / roof band ≤ 0.60 against
`TerracottaDark` 0.63, the atlas tiles 0.62-0.66 and the farmhouse roof 0.76; the flat foliage shade tokens 0.31-0.33 and one beech
concept shade stop against the 0.35 floor; the grey `plank_grey` 0.36) showed the bands were too tight and were retuned; the other 15
are the legacy look.config soil, path and terrain greens and the warm contact shadow `#372A1C` (shade should be cool), now named
exceptions; the 8 materials are the retuned floors (buildings ≥ 75, props ≥ 150, painted ≥ 200, outcrops ≥ 100), the farmhouse
exception and outcrop_b as a known defect.

### 3b. Approved UI rules V3 and V4 start from (game-owned, ART-BIBLE §F)

- **Type scale (shrinking allowlist).** `font-size` must come from 11, 12, 13, 14, 16, 20, 24, 32, 40 px (line heights 1.3, 1.35, 1.4,
  1.45, 1.4, 1.25, 1.2, 1.15, 1.1). Today 38 of 82 declarations in `src/styles` are on the scale; the 44 that are not are the allowlist
  V3 starts from: 11.5 px ×5 (map to 12), 12.5 px ×20 (13), 13.5 px ×7 (14), 15 px ×2 (14), 15.5 px ×1 (14 or 16), 17 px ×2 (16),
  18 px ×3 (16 or 20), 19 px ×1 (20), 21 px ×1 (20), 22 px ×1 (20), 36 px ×1 (32). The list only shrinks (G7 maps each size as the
  redesign lands; steps 20 and 32 are unused today); a new size must be on the scale.
- **Warning style.** `--ink #403D35` text on `rgba(232,189,114,0.28)`, which over `--cream #FFF8EC` composites to `#F9E7CA`: contrast
  **8.94:1** (WCAG AA text needs 4.5:1; `--ink-soft #6B665A` would be 4.71:1). Gold `#E8BD72` is for the icon and a 1 px border only,
  never the only cue: gold text on the tint was 1.45:1 (1.66:1 on cream) and is dropped. V4 should assert 4.5:1 for the final tokens.

**Subjective (art director, then owner):** palette fit and screen shares (ART-BIBLE §B.1), silhouette and scale coherence, material
response under the light, focal hierarchy, asset integration (grounding, contact, edges), mood per time of day, UI alignment and
rhythm against the board. Checklist per capture: (1) does any object read as a different art style? (2) is the farm the focal point?
(3) any flat-colour placed object? (4) any black or grey shadow? (5) do neighbours match in sharpness? (6) is the HUD covering the focal
band? (7) does it still look good paused? (8) does anything look worse than it did, or is anything the player built or an inhabitant uses broken (owner-approved lore answer 6, 2026-10-25; ART-BIBLE §A)?

## 4. Automated checks to add (scoped; V1 and V2 done in stage 1, §3a)

Ordered by value per CI minute. Node and vitest checks run in CI; e2e desktop checks go inside existing specs; mobile e2e runs
locally before app pushes (CI minutes are limited).

| # | Check | Where | Owner | Red first on |
|---|---|---|---|---|
| V1 | **Asset contract test**: manifest ↔ files (no missing, no orphan); per-class budgets (tris, texture size, file size) from ASSET-RULES; material rules (roughness ≥ 0.9, metalness 0, no normal/roughness maps, `MASK` only on cards, `BLEND` only on ribbons/water); node contracts (`Canopy`/`Crown` pivots, `Head`/`Tail`, base at y 0 except water models); texel-density bands; a **stand-in register**: an untextured placed model must be on an allowlist that may only shrink (today `sheep`, `plot`); deprecated ids flagged (`grass_tuft`, `flower_head`). **Done (stage 1)**; the texel-density bands, canopy pivot, family neighbour rule and the known-defects register (§3a) are enforced since the owner approved them (2026-10-25). | `art/scripts/tests/assets.test.mjs` | art | `sheep`, `plot` off the allowlist (confirmed red); farmhouse wall density below the hero band and 8 materials outside the unretuned bands (confirmed red with enforcement on, 2026-10-25) |
| V2 | **Palette test**: every colour in `look.config.mjs` palette and `lookPresets.json` sits in its family's saturation/value band (ART-BIBLE §B.1); the exported world palette matches; once P2-1 lands, a drift test against `src/world/palette.ts`. **Done (stage 1)** for the config, presets and sampled textures; blocking since the owner approved the bands (2026-10-25), with the 15 legacy colours as named exceptions; the export match and the drift test wait for P2-1. | `art/scripts/tests/palette.test.mjs` | art | a deliberately out-of-band fixture (confirmed red); 40 colours outside the unretuned bands (confirmed red with enforcement on, 2026-10-25) |
| V3 | **Token-misuse test**: no raw hex/rgba in `src/styles/app.css` and `features/*.css` outside `tokens.css` (allowlist starts at today's 21 and only shrinks); `font-size` only from the type scale (approved 2026-10-25: the allowlist is the 44 off-scale declarations of §3b, and a new size must be on the scale); radii only from tokens. | `src/styles/tokens.test.ts` (vitest) | game | today's 21 raw colours and 44 off-scale `font-size` declarations |
| V4 | **Rendering and responsive smoke**: no console errors or failed `/models/` requests; canvas not blank (variance of a downscaled screenshot); at 1440×900, 1024×768, 720, 390×844, 375×667: no horizontal overflow, dock labels unclipped, no overlap between badge, chips, session control, dock, toasts and an open sheet, touch targets ≥ 44 px. | inside `e2e/toolbar.spec.ts` + a new `e2e/layout.spec.ts` | game (UI redesign) | today's phone sheet/session-pill overlap and toast/badge overlap |
| V5 | **Canonical capture** (no pixel asserts): `CAM-DESK`, `CAM-ORBIT-W/E`, `CAM-LOW`, `CAM-CLOSE`, `CAM-PHONE` PNGs for sheets, through the dev camera hook. | `e2e/canonical.spec.ts`, local only | game (hook) + art (sheets) | — (capture tool) |
| V6 | **Screen-share gate**: greens the largest group and at least 45 % (no cap), supporting 20-40 %, and darkest luma ≥ 0.08 on `CAM-DESK` captures (approved 2026-10-25; measure on the island pixels with a mask; the exceptional share is guidance, no number). | extend `look-gates.mjs` | art | an untextured grey test model |

Not planned: pixel-diff against golden images (SwiftShader and GPU differ; animation and instancing order make diffs noisy).
