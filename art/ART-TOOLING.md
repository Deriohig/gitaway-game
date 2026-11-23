# Gitaway art tooling

2026-10-24 · what exists, how to run it, what is missing. Knob-level detail stays in [config/TUNING.md](config/TUNING.md); the asset
formats in [BLUEPRINT.md](BLUEPRINT.md); capture recipes in [VISUAL-QA.md](VISUAL-QA.md).

## 0. Setup

- Everything art-side runs from `art/scripts` in WSL: `cd art/scripts && npm ci` (deps: `@gltf-transform/core` ^4.1, `jpeg-js`, `three`
  **0.160.0** for geometry; the game runs three 0.186.1, and the proof is built against 0.186.1 by default, `node build.mjs --three <v>`
  for an A/B).
- Browser tools resolve Playwright through `lib/playwright.mjs`: `PLAYWRIGHT_ROOT` first, then this repo's root, then the main checkout
  of this git worktree (found from `git rev-parse --git-common-dir`, so it follows the checkout if it moves); they render headless with
  SwiftShader.
- The proof folder is `PROOF_DIR` (or the older `GITAWAY_PROOF`), default `art/scripts/.build/proof` (git-ignored), set in
  `lib/paths.mjs` and shared by `build.mjs`, `shots.mjs` and the capture tools.
- Ownership: art writes only `art/` and `public/models/`; the game owns `src/` (BLUEPRINT "Who changes what"). Files written through
  `\\wsl.localhost` come out root-owned: `chown -R $USER:$USER` afterwards.

## 1. Pipeline scripts (`art/scripts`)

| Script | Makes | Run | Writes | Tests |
|---|---|---|---|---|
| `build.mjs` | the proof viewer + the procedural proof models + `config/blueprint.pieces.json` | `node build.mjs` (`PROOF_DIR=<dir>`, default `.build/proof`; `--publish-procedural` only outside a game checkout) | proof dir, `.build/models`, the JSON | `blueprint.test`, `look.test` |
| `bake-pieces.mjs` | the 8 baked island pieces + height grids | `node bake-pieces.mjs` | `public/models/piece_*`, their manifest entries only | `tests/bake.test.mjs` (17 checks) |
| `export-composition.mjs` | composition JSON, the painterly tree/bush GLBs (copied from `art/reskin`), card shrubs, path ribbons | `node export-composition.mjs` | `config/composition.pieces.json`, `public/models/<plant>.glb`, `paths_*.glb`, their entries | `composition.test`, `species.test`, `cover.test` |
| `publish-models.mjs` | Meshy copies (byte-identical), sheep, plot, the five painted procedural models | `node publish-models.mjs [--out <dir>]` | listed ids + entries only | `models.test.mjs` P1–P23 |
| `reskin.mjs` | painterly trees and bushes from the CC0 MegaKit + concept ramps, and every tree's far version | `node reskin.mjs --all` (pack in `~/Downloads/assets/quaternius-megakit/` or `MEGAKIT_DIR`; `--freeze-stats` re-measures the concepts) | `art/reskin/*.glb`, `concept-stats.json` | `reskin.test`, `trees.test` |
| `plantkit.mjs` | the code-painted kit (ground cover, crops, beds, card shrubs) for review | `node plantkit.mjs <outDir> [id …]` | `<outDir>/<id>.glb`, `kit_textures.png` | `plantkit.test`, `crops.test` |
| `meshy/finish.mjs` | Meshy download → game asset (scale, base, atlas size/quality, `Glow` mask, `Canopy`/`Crown`, `Blades`, `Smoke`, `PorchLight`, `--roof` tiling texture, `--part` cuts) | args per model in `art/meshy/README.md` | `art/meshy/<id>/<id>.glb` | `meshy.test`, `finish-*.test`, `rooftiles.test` |
| `meshy/gardencam.mjs` | the garden review renders: every crop at every stage on the published plot from the game's cameras (`CAM-DESK`, the default zoom on the garden, `CAM-CLOSE` labelled, `CAM-PHONE`) | `node meshy/gardencam.mjs <outPrefix> [modelsDir]` | 4 PNGs | — |
| `meshy/rooftiles.mjs` | the farmhouse's seamless roof-tile texture | `node meshy/rooftiles.mjs` | `art/meshy/farmhouse/roof_tiles.jpg` | `rooftiles.test` |
| `scripts/assets/*.mjs` + `lib/paintedAtlas.mjs` | painted procedural geometry on the shared atlas | via `publish-models.mjs` | — | `models.test` P18–P23 |
| `lib/water-bake.mjs`, `bake-water.mjs` (branch `art/water-design`) | water maps, noise, meshes, `water.json` | `node bake-water.mjs` | `public/models/water_*` | `tests/water.test.mjs` W1–W9 |

Meshy itself (concepts, image-to-3d) costs credits: owner's yes first, at most 3 requests at once, log the balance before and after.

## 2. Proof viewer and comparison harness

- Serve: `node shots.mjs` (127.0.0.1:8187) serves the proof and accepts `POST /shot/<name>` from `window.__saveShot`.
- URL switches (TUNING.md "Viewer URL", LOOK-PORT §6): `?unlocked=main|all|a,b`, `?dock=<piece>&t=0..1`, `?look=<preset>`, `?hour=H`,
  `?view=<full|farm|lake|waterfall|junction|woodland|edge>`, `?preset=<camera>`, `?cam=az,el,dist&tgt=x,y,z`, `?baked=1`, `?ui=0`,
  `?stats=1` (+ `await __frameStats(n)`), `?diag=gl`, `?debug=1`, `?quality=low|high`, `?seed=42`; water branch: `?water=v2|legacy`,
  `?waterdebug=depth|shore|flow|bands`, `?waterTier=phone|mid`.
- The look panel (lil-gui): every `lookPresets.json` value live, save/load presets.
- Capture: `capture.mjs` (presets × seeds), `look-capture.mjs` (the 7 fixed views, deterministic, optional masks), `meshy/cap_orbit.mjs`
  (orbit sweeps). Sheets and numbers: `look-sheet.mjs`, `look-grid.mjs`, `contact-sheet.mjs`, `metrics.mjs`, `look-gates.mjs`,
  `clumping.mjs`, `scene-probe.mjs` (draw calls, tree pixel share), `composition-check.mjs` (proof vs JSON, game-style sheets),
  `topmap.mjs` (top-down design map), `concept-crops.mjs`.

## 3. Asset harnesses (`art/scripts/meshy`)

| Tool | Shows |
|---|---|
| `turntable.mjs` | `CAM-TURN`: concept + four quarter views at 24°, a posed view (`Head`/`Tail`), the game angle |
| `gallery.mjs` | every model from the game angle, labelled TEXTURED or FLAT, tris, height: the style audit |
| `farsheet.mjs` | near vs far tree versions at 20 / 40 / 60 u |
| `gamecam.mjs` | farmhouse, hero tree, windmill at their game slots from the game camera (default, 14 u, roof, bark) |
| `forest.mjs` | tree clusters on a ground plane |
| `ortho.mjs` | orthographic side/front/top with a 0.05 u grid and named nodes: pivots and cut boxes |
| `inspect.mjs` | tris, meshes, materials, textures, bounds of one GLB |
| `contact.mjs`, `sheet.mjs` | labelled grids of images |

## 4. Tests (`art/scripts/tests`, pure node unless `.browser.mjs`)

Run one: `node tests/<name>.test.mjs`; all node tests: `for t in tests/*.test.mjs; do node "$t" || echo "FAIL $t"; done`. Browser
tests need the proof built and `shots.mjs` (they start it if needed): `node tests/<name>.browser.mjs`. Every new test is written to fail
first (red), then made to pass (green), and both are reported.

Suites: `assets` (VISUAL-QA V1), `bake`, `blueprint`, `composition`, `cover`, `crops`, `finish-crown` (needs the raw Meshy hero tree,
`art/meshy/hero_tree/source/raw.glb`, git-ignored: copy it from a checkout that has it; fails, never skips, when missing),
`finish-crops` (`--pad`, `--maxKB`, `--fold`), `finish-parts`, `finish-roof`, `lawn`, `look`, `lookcore`, `lookpresets`, `meshy`, `models`, `palette` (VISUAL-QA V2), `panelsave`,
`phase1`, `phase2`, `plantkit`, `plants`, `reskin` (needs the MegaKit pack), `rooftiles`, `species`, `terrain`, `tooling` (A3
hygiene), `trees`, plus `tests_stage2.mjs`; browser: `lookcore`, `meshy`, `panelsave`, `phase1`, `phase2`, `plants`.

**QA rails (art plan stage 1).** `node tests/assets.test.mjs` is VISUAL-QA V1, the asset contract: data and rules in
`lib/asset-contract.mjs` (categories, budgets, the `STAND_INS` / `DEPRECATED` / `EXCEPTIONS` / `HERO_WALLS` / `KNOWN_DEFECTS`
registers that only shrink, and `measureModel`, which also reports texel density and the canopy pivot per model).
`node tests/palette.test.mjs` is V2, the palette bands: families, bands and the `LEGACY` named exceptions in `lib/palette-bands.mjs`,
the out-of-band detector fixture in `tests/fixtures/palette.out-of-band.json`. The ART-BIBLE's bands (V1 density, pivot, neighbours;
V2 colour bands) were approved by the owner on 2026-10-25 and are blocking; `ENFORCE_PROPOSED` in `lib/qa-proposed.mjs` (now
`true`) can be set `false` to survey a retune. What each register means and what blocks: VISUAL-QA §3a. A new published id needs a
category in `ASSET_CLASS`; retiring a stand-in means deleting its `STAND_INS` entry in the same change, and fixing a known defect
(`outcrop_b` density, `tree_spread` pivot) means deleting its `KNOWN_DEFECTS` entry (the test fails on a stale one).

## 5. Game-side tools (`src/`, game-owned; listed for art's use)

| Tool | Run | Note |
|---|---|---|
| Copy art data into the game | `npm run blueprint`, `npm run composition` | `scripts/blueprint.mjs` → `src/world/blueprint.data.ts`; `scripts/composition.mjs` → `composition.data.ts` + `composition.meta.ts` (never hand-edit) |
| Unit tests | `npm test` (vitest, TZ=UTC) | `src/world/*.test.ts` cover materials, framing, wind, placement, composition |
| e2e | `npm run e2e` (desktop + mobile), `npm run e2e:mobile` | builds + `vite preview`; desktop 1440×900, mobile = Pixel 7 412×915; reduced motion; world element `data-*` reports for tests |
| Dev panel | dev builds only (`src/dev/DevPanel.tsx`) | `skipAhead` to fast-forward time and docking |
| `<Asset id>` swap | edit `public/models/manifest.json` status | a `ready` model replaces its stand-in with no game change, if the game already asks for that id |

## 6. Scratch harnesses (not committed)

- In-game sheets: Playwright scripts that inject a save into IndexedDB and drive the camera through a temporary `window.__gw` hook
  patched into a local build (the other session's `idle-art/ia-shots.mjs`, `trees-ab`, `t3-shots`, `t5-shots`). Useful pattern; the
  hook itself is not in the repo.
- The UI capture set (71 PNGs + contact sheet) in `ui-screenshots/`.
- This audit's read-only GLB scripts (tris, bounds, texel density, atlas hashes, atlas cell colours) in the session scratchpad
  (`ab-glbstats.mjs`, `ab-texel.mjs`, `ab-trees.mjs`, `ab-atlas.mjs`); the inventory and texel-density parts now live in V1
  (`lib/asset-contract.mjs` `measureModel`), the atlas cell colours in V2 (`lib/palette-bands.mjs` `atlasEntries`).

## 7. Gaps

| Gap | Effect | Fix (plan) |
|---|---|---|
| ~~Hard-coded scratch paths~~ (`build.mjs`, `shots.mjs`, `lib/paths.mjs`, `meshy/sheet.mjs`) | fixed (A3): `PROOF_DIR` / `GITAWAY_PROOF`, default `art/scripts/.build/proof`; `meshy/sheet.mjs` takes its shots dir as an argument | `tests/tooling.test.mjs` TL1-TL4 |
| ~~Playwright resolved from `/home/me/Projects/gitaway`~~ | fixed (A3): one lookup, `lib/playwright.mjs` (`PLAYWRIGHT_ROOT`, repo root, the worktree's main checkout) | `tests/tooling.test.mjs` TL5 |
| No committed game camera hook | canonical in-game views need a patched build | dev-only camera hook (P2-7) |
| No in-game asset preview scene | models are judged in the proof (different materials) or by patching the game | a dev-only `?preview=<id>` stage on the canonical cameras (P3-5) |
| No asset contract, palette or token tests | budgets, flat stand-ins, raw hexes slip in unnoticed | V1 and V2 done (stage 1: `tests/assets.test.mjs`, `tests/palette.test.mjs`; the bands approved and blocking since 2026-10-25); V3 (tokens, with the type-scale allowlist of VISUAL-QA §3b) is the game's (P2-5) |
| No committed frame-time probe for the game | each feature rebuilt its own A/B | a shared probe script next to the e2e suite (P2-5) |
| ~~Texel density only measured ad hoc~~ | measured on every V1 run and enforced against the owner-approved bands (2026-10-25) | fixed; `outcrop_b` (P2-2) is the one tracked outlier |
| Painted atlas full (`paintedAtlas.mjs:18`) | no room for new painted props | atlas page 2 or repack (P1-2) |
| Art pipeline on three 0.160.0, game on 0.186.1 | shader-chunk patches are tested against r186 fixtures only | keep fixtures; bump the pipeline when convenient (P3-4). Left open in A3: the version is the game's call |
| Reskin needs the MegaKit pack outside git; concepts git-ignored | rebuilds need the pack on disk | documented in `art/reskin/SOURCES.md`; keep |
