# Gitaway — Lighting, Colour & Atmosphere Pass (user brief, 2026-10-18, verbatim)

> **Pointer (2026-10-24).** The look this brief asked for is summarised as rules in [../ART-BIBLE.md](../ART-BIBLE.md) (§B colour, §D lighting and rendering), which is now the single source of truth; this verbatim brief stays as the record.

## Goal

The island layout is approved. Do not move, regenerate or redesign anything: same seed (11), same terrain, same regions, same farm, paths, lake and waterfall positions.

The scene currently looks competent but flat: one olive green everywhere, dark uniform forests, neutral grey cliffs, pale flat water, grey plastic clouds, and noon light from overhead that kills all form. The target is a **warm, luminous, slightly magical miniature countryside diorama** — the feeling of a late-afternoon in a storybook. Depth and beauty should come from **light direction, warm/cool contrast and value hierarchy**, not from cranking saturation.

Work in phases. **After each phase, stop, capture the fixed comparison views, show me before/after side by side, and wait for my go-ahead.** I will judge the look; you wire the parameters.

---

## Phase 0 — Audit and baseline (no visual changes)

1. Report the current setup: renderer (WebGL or WebGPU) and three.js version; `outputColorSpace`; tone mapping + exposure; every light (type, colour, intensity, direction); shadow config (type, mapSize, camera bounds, bias); fog; sky/background implementation; any post-processing passes and their order; material types used for terrain, trees, cliffs, water, clouds; whether colour textures are tagged `SRGBColorSpace`.
2. Find out what the speckled rainbow noise in the sky/background is. It looks like a bug (bad noise texture, uninitialised render target, dithering or env map issue), not a style. Report the cause.
3. Add a fixed camera-preset system (URL param, e.g. `?view=full`) and capture baseline PNGs for:
   `full` (whole island), `farm` (farmhouse + plots close-up), `lake` (lake + islet), `waterfall` (river + waterfall + island edge), `junction` (a main path junction), `woodland` (forest edge + grass detail), `edge` (island underside + sky).
   Save them to `screenshots/baseline/`. Every later phase re-captures these same views into its own folder and produces a side-by-side contact sheet.
4. Add a lil-gui (or Tweakpane) panel exposing every parameter introduced below, with **Save/Load preset to JSON**. All values must live in one `lookPresets.json` — no magic numbers scattered through files.

---

## Phase 1 — Colour management, sun and sky (biggest win; do this first)

**Colour pipeline**
- `outputColorSpace = SRGBColorSpace`; all colour textures/atlases tagged sRGB; data textures (normals, masks) linear.
- Tone mapping: try **AgX** and **Neutral** (three.js `NeutralToneMapping`) at exposure ~1.0; avoid ACES (desaturates and shifts greens). Pick whichever keeps greens rich.
- If post-processing is used, tone mapping + sRGB conversion must happen exactly once (an `OutputPass` last on WebGL, or the WebGPU `RenderPipeline` output). Check for double conversion.

**Sun**
- Replace the noon sun with a **low, warm late-afternoon sun**: elevation ~25–35°, raking across the island from the back-left of the `full` view so trees cast long shadows toward the camera-right.
- Sun colour warm cream-gold (start around `#FFD8A8`), strong intensity. This light should do most of the work.

**Fill**
- Replace flat ambient with a **HemisphereLight**: sky colour cool blue (`#A9C8F0`-ish), ground colour warm earthy (`#7A6A45`-ish), low-to-moderate intensity. Shadows should read **cool blue-green, never black or grey**.
- Remove or drastically reduce any plain `AmbientLight` — it is the main cause of washed-out flatness.

**Shadows**
- One shadow-casting directional light, shadow camera fitted tightly to the island bounds, mapSize 2048–4096, soft filtering (PCF/VSM), bias tuned so there's no acne or peter-panning. Trees and the farmhouse must sit firmly on the ground.

**Sky**
- Fix the rainbow-noise bug.
- Replace the background with a clean **vertical gradient sky dome**: deeper clear blue at the zenith → soft warm cream/peach near the horizon (on the sun side). Below the island, fade to a soft pale haze rather than noise.

**Mood presets**
Create three named presets in `lookPresets.json` so I can compare moods quickly: **Golden afternoon** (default), **Soft morning** (cooler, paler, gentle mist), **Dusk** (amber sun near the horizon, lavender shadows). Stop and show me all three in the `full` view.

---

## Phase 2 — Materials: grass, trees, cliffs, clouds

**Terrain grass** (keep low-poly geometry)
- Replace the single olive with **broad world-space colour variation**: low-frequency noise (patches tens of metres across) blending 3 greens — warm sunlit yellow-green, mid green, cooler deep green. No per-triangle random noise.
- Add meaningful variation: slightly lusher/cooler near water, slightly warmer/drier on high ground and plateau tops, a subtle darker band at the base of cliffs and under forest edges (fake AO).
- If flat-shaded facets produce strong triangle banding on open meadow, soften them (smooth normals on gentle slopes or reduce facet contrast) while keeping the low-poly read.

**Trees**
- Add a **vertical gradient to canopies**: darker and cooler at the bottom, lighter and warmer at the top (by height within the instance). This alone makes KayKit-style trees look lit and voluminous.
- Per-instance tint variation (±4–6% hue/value), seeded deterministically.
- Optional: a soft rim/translucency boost when the sun is behind a canopy (backlit leaves glow slightly warm).
- Conifers should stay deep green but not black — keep detail in shadow.

**Cliffs and island underside**
- Shift neutral grey toward warm taupe/ochre stone. Lighter on top edges, darker toward the base. The underside fades gently into the haze below rather than ending as a hard dark mass.

**Clouds**
- Lit by the sun: warm cream tops, cool lavender-blue undersides. Softer, fewer, and kept away from the farm.

Stop and show before/after for all views.

---

## Phase 3 — Atmosphere and restrained post-processing

Add one at a time. Keep only what visibly helps; show me each toggle on/off.

- **Atmospheric perspective**: very light distance/height fog tinted toward the horizon sky colour. The far side of the island and the underside should soften; the farm must stay crisp.
- **Cloud shadows**: scrolling low-frequency noise multiplied into the sun term on the ground so soft shadows drift slowly over the meadow. Cheap and very atmospheric.
- **Ambient occlusion** (N8AO on WebGL / GTAO on WebGPU): low intensity, only for contact grounding.
- **Bloom**: high threshold, low strength — only water sparkle and the brightest sun highlights. Grass, buildings and landscape must not glow.
- **Colour grade**: gentle — shadows lifted slightly toward teal/blue, highlights slightly warm. A LUT or a few lines of grading.
- **Vignette**: subtle.
- Optional: **tilt-shift style depth of field** focused on the orbit target, only if it looks good in the `full` view.

---

## Phase 4 — Water (separate pass, after I approve phases 1–3)

Study these and adapt techniques to our renderer (do not migrate the renderer for water):
- `norio/three-stylized-water` (MIT; WebGPU + TSL, three r185). Read `src/water/nodes/`: `depth.ts`, `baseColor.ts`, `shoreline.ts`, `intersection.ts`, `surfaceFoam.ts`, `caustics.ts`, `specular.ts`, `normals.ts`, `presets.json`.
- `boona13/threejs-grass-water-shaders` (MIT; WebGL2 GLSL, three ^0.170). Read `src/water/waterShader.glsl.ts`, `WaterMask.ts`, `WaterPlane.ts`.

Because the island is fixed, prefer **baked depth** (water level minus terrain height, stored in a texture) over depth-buffer reads. Use it for:
- **Lake**: shallow turquoise → deep blue-green gradient, soft lighter shoreline band plus thin animated foam line, slow panning normals, stylised sun glint (feeds bloom), optional faint caustics in shallows. It must not look like a pool or an opaque disc.
- **River**: flow-mapped scrolling normals/streaks in the downhill direction, banks meeting cleanly with no floating planes or gaps.
- **Waterfall**: vertical scrolling streak texture, whiter at the lip and base, soft mist/splash particles and foam ring at the bottom.

---

## Phase 5 — Ambient life (after water)

Reference: Bruno Simon's `folio-2025` (MIT, three.js WebGPU/TSL). Read its `Wind.js`, `Grass.js`, `Foliage.js`, `Fog.js`, `DayCycles.js` and `Rendering.js` (search the repo if the paths have moved) for shared-wind, foliage-lighting and day-cycle patterns. `boona13/threejs-grass-water-shaders` `src/grass/` has a WebGL instanced-grass + wind example.

- One shared wind uniform (two scrolling noise layers + occasional gusts) driving grass tufts, flowers, bushes and canopy sway via vertex shaders. Trunks stay still; canopies move gently. Deterministic per-instance phase.
- Slow cloud drift (linked to the cloud shadows).
- A few pollen/dust motes catching light in sunlit areas, a few butterflies near flower patches, optional distant birds. Sparse.
- Pause when the tab is hidden; respect `prefers-reduced-motion`.

---

## Phase 6 — Paths (separate session/prompt after this one)

Don't touch path geometry in this pass beyond colour (warm compacted-earth tones with subtle variation, consistent with the new lighting). Path-network rebuilding (graph + splines + junctions; reference `vibe-stack/three-roads` for topology only) gets its own pass afterward.

---

## Rules

- One phase at a time; capture → contact sheet → show me → wait.
- Never change the seed or layout. If something looks wrong because of geometry, tell me instead of moving it.
- Keep the previous approved preset and screenshots so we can revert instantly.
- Measure frame time before/after each phase (stats-gl or similar) and report it. Keep it cheap: no real-time reflections, one shadow light, bounded particles.
- Prefer fewer, deliberate effects. If an effect doesn't clearly improve the side-by-side, remove it.

---

## Lead's notes on how this brief is applied (2026-10-18)
- This brief supersedes "tune under the game's day-cycle light" and the NoToneMapping parity rule. The new look is the target the GAME will adopt: every value lives in `art/config/lookPresets.json` in a form the game (R3F, three r186) can import; the mood presets double as day-cycle keyframes so the game keeps real-time day/night. The current game look is kept as a `Game (current)` preset for instant revert.
- The proof is upgraded to the game's three.js version (r186.1) in Phase 0, so tone-mapping options and results transfer.
- Screenshots: `art/screenshots/<phase>/` in the worktree; the side-by-side sheets are committed, raw PNGs are git-ignored.
- Frame time: the lead measures on a real GPU (Windows, browser pane); headless captures use SwiftShader and are not representative for timing.
