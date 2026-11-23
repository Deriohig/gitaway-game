# Water revamp: design

Date: 2026-10-23 · Status: **draft for the owner's review; Revision 2 (2026-10-25) changes the phasing in §6; Revision 3 (2026-10-25) revises the §5 budgets** (design judgement delegated by the owner for tonight: "use the best judgement for good game design and visuals") · Branch `art/water-design` (worktree `gitaway-art-water`, from main `a1fe8bd`)

## Why

- **The owner:** "The next big thing I want to work on is the water textures and stuff. They're pretty bad."
- **The research** (2026-10-23): no drop-in library fits this stack.
  - Water, Water2, FFT oceans and the reflectors re-render the scene, which is too costly on phones (Water2 ran at about 2 fps).
  - WebGPU would break ShaderMaterial, onBeforeCompile, CSM and drei's GLSL materials.
  - The answer is one small custom material on WebGL, fed by data baked offline.
- **The audit** (main `a1fe8bd`):
  - All water is drawn by the game, with three `sin()`-based ShaderMaterials in `src/world/Water.tsx` that have no textures and no real depth.
  - The art pipeline already carves the basins and channels and exports their outlines and levels (`blueprintWater` → `blueprint.pieces.json`).
  - `lookPresets.json` holds six Phase-4 water keys that nothing reads yet.

## Decisions at a glance

1. **Bake.** Art bakes one **water map per wet piece** (main, wetland, highland): raw RGBA8 at 0.05 u per texel, with R depth, G signed shore distance and BA flow. Art also exports every water surface, ribbon and waterfall as piece-local meshes with arc-length UVs.
2. **Material.** The game draws every body with **one Lambert-based material patched through `onBeforeCompile`**: the CSM approach without the CSM package. Scene lights, shadows, fog and tone mapping come for free. One draw call per body, no render targets.
3. **Look.** A posterised 3-band depth ramp per body type; two world-space noise scrolls whose scales differ by the golden ratio; distance-field foam; a sky-gradient Fresnel instead of reflections; sun glints; soft edges. Everything must read at the phone framing, about 13–16 px per u.
4. **Virtual basin.** The farm pond and stream get a depth synthesised from the shore distance, so MAIN's terrain stays frozen.
5. **Falls and spring.** Waterfalls dissolve into spray under a mist plume instead of ending mid-air. The hot spring is drawn, with steam.
6. **Cloud sea.** Out of scope (§3.6).
7. **Tiers.** Two now, **phone** and **mid**; a WebGPU "high" tier later.
8. **Delivery.** Six small PRs. Each ships alone behind a `water` feature switch, with today's water as the fallback.

## 1. Goals and non-goals

**Goals**
- Painterly, cosy water that sits with the Meshy-textured buildings, the painterly trees and the stylised terrain.
- It reads at the game's camera distances: desktop default 35.5 u (about 47 px per u at 1440×900), phone 106–130 u (about 13–16 CSS px per u), and zoomed in to 14 u (about 120 px per u).
- It runs on phones: no extra passes, no render targets, and at most 3 texture reads per water pixel on the phone tier.
- Water belongs to its place: real depth where the terrain is carved, a shore that meets the ground with no gaps, flow that runs downhill, and falls that end on purpose.
- The scene lights it, so it follows the day cycle, night and the coming look port without light maths of its own.

**Non-goals**
- Photoreal water, planar or screen-space reflections, refraction, depth-buffer reads.
- WebGPU / TSL. That is a later "high" tier; the GLSL is laid out (decode → bands → foam → light) so it ports mechanically.
- The cloud sea (§3.6).
- Rain ripples and weather, the cranberry bed's wet sheets, and fishing splashes. The ripple API is ready for them.
- Moving or reshaping any water body. The layout is frozen. (Revision 1 lifts this for the farm pond and stream only.)

## 2. The water inventory

"Deepest" is the carved bed's depth below the water level. "Drawn today" is what the game draws.

| Body | Piece | Shape and level | Drawn today | What's wrong |
|---|---|---|---|---|
| Farm pond | main | Blob, r 1.45, at (−1.7, 4.3). Level 0.06 above **flat, uncarved** ground. | `Pond`: blob with `pondMat`, a brown bank disc (r + 0.32), 11 stones, 3 pads, 7 spike reeds. | <ul><li>The colour is a radial gradient from the centre, not depth.</li><li>Concentric sin rings read as a target.</li><li>Alpha is 0.94 everywhere, so it reads as an opaque disc.</li><li>A hard brown ring surrounds it.</li><li>The sin glints tile.</li><li>A hand-tuned scalar lights it, so it never takes the house's or the trees' shadows.</li></ul> |
| Farm stream | main | Ribbon from the pond to the rim at θ 2.42, 0.42 → 0.54 u wide, ground + 0.075, uncarved. | `Stream`: ribbon with `streamMat`, plus a brown mud ribbon. | <ul><li>Streak spacing follows the curve parameter, not distance, so it changes with the stream's length.</li><li>The streaks tile.</li><li>Both edges carry the same foam.</li><li>The stream starts inside the pond and lies on top of it (+0.075 over +0.06), so the junction shows a seam.</li></ul> |
| Farm waterfall | main, while the wetland is undocked | A 0.62 × 4.6 plane at the rim. | Plane with `fallMat`, plus 4 cloud blobs. | <ul><li>**It ends mid-air:** it fades from about 2 u below the rim to nothing at 4.6 u.</li><li>The four mist blobs hang 4.6 u down, detached from it.</li><li>It isn't shaped to the cliff.</li></ul> |
| Wetland lake | wetland | Carved ellipse 5 × 3.5 u, level −0.32, deepest 0.43 u, with a treed islet inside. | `Lake` (a `pondMat` clone), only once docked. | <ul><li>The deep-in-the-middle gradient centres on the outline's centroid, so it ignores the real basin and the islet.</li><li>The islet's shore has no foam.</li><li>Near opaque, so the carved bed never shows.</li></ul> |
| River | wetland | Carved channel from MAIN's stream exit to the lake, 0.54 → 1.15 u wide, bed 0.3 u deep. | `Brook`: ribbon plus mud ribbon. | <ul><li>The same tiling streaks.</li><li>The mud ribbon floats over banks the terrain already carves.</li><li>Its end overlaps the lake.</li></ul> |
| Outflow | wetland | Carved, 0.85 → 0.77 u wide, from lake level down to −0.44 at the lip. | `Brook`. | As the river. |
| Wetland waterfall | wetland | Exported points from the lip down to y ≈ −10.9. | `Fall`, 0.7 u wide. | <ul><li>A straight sheet.</li><li>No foam at the lip and no mist.</li><li>It fades out over its lower 55 %.</li></ul> |
| Highland tarn | highland | Carved disc, r 1.35, level = plateau − 0.2, deepest about 0.55 u. | `Lake`, only once docked. | As the lake. |
| Hot spring | highland | Carved disc, r 0.55, level = ground − 0.06, deepest about 0.17 u. | **Not drawn:** an empty dimple (the proof does draw it). | Missing, and no steam. |

Two problems apply to every body:
- One palette serves them all: `water #91B7C8`, `waterDeep #6E9AB0`, `foam #E8F1F0`.
- `uTime` is the raw `clock.elapsedTime`. It loses float precision over a session left running for days, which an idle game is.

## 3. The look target

### 3.1 Readability rules

- **Value structure carries the read.** From the lawn inwards: darker wet ground, a cream contact line, the bright shallow band (the lightest thing next to the lawn), the mid band, then a deep core darker than any grass. That sequence reads as water even at 13 px per u.
- **Detail by distance.** Each layer fades out once it would be thinner than 1.25 px (`fwidth` of its own coordinate), so nothing shimmers when zoomed out.
  - Phone framing: bands, contact line and sheen.
  - Desktop default: also travelling foam, glints and river streaks.
  - Zoomed in: also caustics, the lapping line and ripples.
- **Calm motion.** Still water drifts at most 0.05 u/s, rivers flow at 0.3–0.6 u/s, and fall streaks move at 1.2 u/s. These speeds read well at the Ticker's 30 fps (full motion) and 15 fps (calm). In "still" motion the water freezes.
- **Painterly, not toon.** Band edges are soft (about 2 px) and wobbled by the noise, and the foam is broken into dashes. No hard outlines.

### 3.2 Layers (per pixel, in order)

| # | Layer | Rule |
|---|---|---|
| L1 | Depth bands | <ul><li>3 bands, split at depths of **0.08 u** and **0.22 u**.</li><li>Edge softness max(0.015 u, 2 px).</li><li>The noise wobbles the depth by ±0.03 u, so band edges meander.</li><li>The virtual basins (pond, stream) are tuned to show a 0.25 u shallow rim and a 0.35 u mid band.</li></ul> |
| L2 | Noise | <ul><li>Two world-space scrolls: one with a 1.8 u cell moving along 25°, the other with a 1.8/φ ≈ 1.11 u cell moving along 205° at √2 times the speed (φ = 1.618).</li><li>The ratios are irrational, so their sum never visibly repeats.</li><li>Phone tier: the first scroll only.</li><li>Still bodies with flow (pond, lake, spring): the noise is carried along the map's flow with Water2's two-phase flow-map method.</li><li>Ribbons: the noise scrolls along their arc-length u instead, which never pops.</li></ul> |
| L3 | Foam | <ul><li>A contact line at the shore, 0.05 u wide (at least 1.25 px), broken where the noise is below 0.35.</li><li>Travelling bands `sin(2π(sd/0.22 − t/3.5))`, thresholded into dashes, out to `shoreBand` 0.35 u and fading inwards: 2 bands on mid, 1 on phone.</li><li>Rivers add riffle dashes stretched along u where the flow is fast, and a foam lip at every mouth and fall lip.</li><li>Foam is part of the albedo (lit), so it dims at night.</li></ul> |
| L4 | Edge alpha | <ul><li>Carved bodies: alpha 0.55 in the shallows, rising to 0.92 at 0.25 u deep so the tinted bed shows through, times a 0.04 u soft fade at the shore.</li><li>Virtual bodies: alpha 0.96, with the bed colour painted into the shallow band.</li><li>Foam raises alpha.</li><li>Alpha is multiplied by the material's `opacity`, so the `Rising` fader still fades the water with its piece.</li></ul> |
| L5 | Sky Fresnel | <ul><li>`F = (0.1 + 0.6 (1 − N·V)²) × skyMix/0.25`, capped at 0.6.</li><li>Mixed in after lighting, toward a sky gradient that runs from horizon to zenith by the reflected ray's elevation.</li><li>F is about 0.26 at the default view (today's constant is 0.25), 0.12 looking straight down and 0.36 at the lowest tilt, so distant water carries more sky.</li></ul> |
| L6 | Glints | <ul><li>Mid tier only.</li><li>Small cream-white sparkles (0.06–0.1 u) where `nA × nB` crosses a threshold, weighted by a noise-perturbed normal against the real sun's half vector.</li><li>Colour = the scene's directional light × `glint` 0.6: gold at dusk, silver under the night light, and feeding bloom once the look port adds it.</li></ul> |
| L7 | Caustics | <ul><li>Mid tier only.</li><li>A faint web of light (`abs(n − 0.5)` ridges), only in the shallow band (depth 0.02–0.18 u), × `caustics` 0.35.</li><li>Drawn in the water material, because the pond and stream have no carved bed to draw them on.</li></ul> |
| L8 | Terrain wet band | <ul><li>On the ground outside the water, from the shore out to `shoreBand` 0.35 u.</li><li>Albedo × 0.72, mixed 20 % toward `#5E6E6A`.</li><li>Its edge is broken by static noise.</li></ul> |
| L9 | Lapping line | <ul><li>Mid tier only.</li><li>A thin cream line on the ground just above the waterline that rises and falls ±0.02 u over 5 s.</li><li>Even a jagged terrain intersection then reads as a moving shore.</li></ul> |
| L10 | Underwater tint | <ul><li>Ground below a carved body's level is tinted toward the piece's bed colour by depth, from 0 at the shore to at most 80 % at 0.25 u.</li><li>Through the shallows, the basin then reads as wet bed, not grass.</li></ul> |

### 3.3 Palettes

These are albedo values, lit by the scene. Like the rest of `water.*`, they are the same in every mood. They come from the game's look config:
- **Deep bands:** `waterDeep #6E9AB0`, pulled toward the zenith `#6FA4DA` and darkened.
- **Shallow bands:** `water #91B7C8`, pulled toward the lawn greens (`warm #98C47E`, `cool #609262`, `lush #558A68`), so shores sit well with their banks.
- **Foam:** `foam #E8F1F0`, warmed toward the cloud sea's cap `#FFF6E6`.
- **Beds:** `soilLight #8A6B55` and the stone tokens.

| Body | Shallow | Mid | Deep | Foam | Bed / edge |
|---|---|---|---|---|---|
| Pond (farm) | `#93BCAE` | `#7CA7A6` | `#4E7D8C` | `#F4F4EB` | `#8E8B79`, painted into the virtual shallows |
| Lake (wetland) | `#86B0A2` | `#6A9899` | `#4F7188` | `#EEF2EA` | bed tint `#6D7F6C` (mossy) |
| River, stream, outflow | `#B4D4CE` | `#82ACB0` | `#5F93A2` | `#F6F6EE` | stream edge `#8E8B79` |
| Tarn (highland) | `#9BB0B8` | `#7A9EBD` | `#4C6275` | `#EDF1F4` | bed tint `#6F7A80` (slate) |
| Hot spring | `#BEDFD2` | `#7FC4BE` | `#4FA7B0` | `#F6F2EA` | sinter rim `#E3D2B4` |

- **Waterfall tones:** body `#82ACB0`, streak `#B4D4CE`, spray `#F6F6EE`, mist `#FBF5EA` (the cloud colour).
- **Character:** the pond is a sunny, green-teal farm pond; the lake is cooler and reedier; the rivers are the lightest and most aerated; the tarn is cold slate, up at altitude; the spring is milky turquoise inside a cream sinter rim.

### 3.4 Waterfalls

- **Shape.** A ribbon from the lip that follows the exported outward arc, keeping at least 0.1 u clear of the rock. It starts 1.1 times as wide as the channel that feeds it and widens to 1.5 times.
- **Streaks.** Vertical streaks come from the noise stretched along u, posterised into body, streak and spray tones. Mid has 2 layers moving at speeds in the φ ratio; phone has 1.
- **Lip.** A bright foam band over the first 0.3 u. Its u carries on from the channel above, so the pattern runs over the edge unbroken.
- **The end.** Both falls drop about 10 u; the farm fall is lengthened to match the wetland's.
  - Over the last 45 % the sheet dissolves: its alpha is thresholded against the noise, the threshold climbs to 1, and the edges break up.
  - A mist plume covers the dissolve zone, so the water visibly turns to spray. That reads on a sky island whether or not there are clouds below.
  - Today's sea puffs are placed from 12 u out, so the farm fall barely meets them anyway.
- **Mist.** 6 billboard puffs per fall (3 on phone), growing from 0.6 to 1.6 u and drifting down and out at 0.3 u/s on a 6 s loop, each with its own phase. Alpha at most 0.55, in cloud cream, lit like the clouds (Lambert plus emissive, as `cloudMat`).
- **Spring steam.** 5 puffs (3 on phone), rising at 0.25 u/s and growing from 0.3 to 0.9 u, alpha at most 0.35, on a 7 s loop.

### 3.5 Behaviour (game feel)

- **Still water** (pond, lake, tarn, spring) rises with its piece through the clouds: a full lake surfacing.
- **Flowing water starts when its piece docks.** When the wetland docks:
  1. the farm fall's water front retreats downwards over 1 s (Revision 2, R2.2: a 2 u slide down plus a 1 s fade, not a front);
  2. the river fills from the seam to the lake over 2.5 s (an alpha front moving along u);
  3. then the outflow and the wetland fall start.

  In "still" motion all of this is instant. It marks the unlock moment: the farm's water now runs on into the new land.
- **Ducks** leave rings and a soft V-shaped wake; the heron leaves a ring every few seconds while it wades. The same pool of ripples serves future fish jumps and rain.

### 3.6 The cloud sea: out of scope

- **Why:**
  - It is sky, not water.
  - LOOK-PORT steps 3–4 replace `Backdrop.tsx`'s puffs with the painted sea in the sky shader, so any work on today's puffs would be thrown away.
  - The owner's complaint was the water.
- **Where it touches the water:**
  - The falls dissolve on their own (§3.4), so they don't depend on where the sea sits (y −10.5 today, −45 once painted).
  - The mist takes the cloud colour.

## 4. Architecture

### 4.1 Art (owns `art/` and `public/models/`)

**The bake: `node bake-water.mjs`** (in `art/scripts` beside `bake-pieces.mjs`; deterministic).

- **One map per wet piece, not per body.** This departs from the research note's "about 128² per body", for three reasons:
  - the terrain hooks need the same field;
  - the junctions (stream → pond, river → lake → outflow) must be seamless;
  - each material then needs only one sampler.
- **Coverage.** The piece-local bounding box of the water, plus 1 u, at 0.05 u per texel. Sizes are rounded up to multiples of 8, since WebGL2 handles non-power-of-two sizes with mips:
  - main about 168 × 120;
  - wetland about 240 × 416;
  - highland about 272 × 120.
- **Ground.** Sampled from the **baked** height grid (`piece_<id>.height.bin`, bilinear, as `gridHeight` does), so the shore matches the terrain the game renders.
- **Channels**, 8 bits each:
  - **R: depth** = clamp(level − ground, 0, 1 u). The pond and stream are virtual: their depth comes from the shore distance, up to 0.45 u in the pond and a 0.18 u V-shaped profile across the stream, with a low-frequency wobble.
  - **G: signed shore distance**, positive in the water, over ±1 u, encoded as 0.5 + sd/2. It is an exact distance transform on a 4× supersampled water mask (so islets come out right), followed by a blur with σ 0.06 u.
  - **BA: flow**, ±0.5 u/s, encoded as 0.5 + v.
    - **Lake:** a Laplace solve on the water mask, with the river mouth as the source and the outflow as the sink, so the current bends round the islet.
    - **Pond:** spring-fed, draining to the stream's mouth.
    - **Spring:** a slow radial welling outwards.
    - **Ribbons and the tarn:** none.
- **Format.**
  - The maps are raw `water_<piece>.map.bin`, row-major with x fastest, like the height grid. PNG would be risky: browser colour management and premultiplied alpha can corrupt data in PNG channels, alpha especially, and the game already loads `.bin` grids.
  - `water_noise.bin` is 128² RG8: tileable, with two decorrelated value-noise channels.
  - Both load as linear data textures (`NoColorSpace`) with GPU-built mipmaps; the iOS mipmap bug affects sRGB textures only.

**Meshes: `water_<piece>.glb`.** Piece-local, with one opaque placeholder material named `Water`, which the game replaces.

| GLB | Nodes |
|---|---|
| main | `water_pond`, `water_stream`, `water_fall`, empty `mist_fall` |
| wetland | `water_lake`, `water_river`, `water_outflow`, `water_fall`, `mist_fall` |
| highland | `water_tarn`, `water_spring`, `steam_spring` |

- **Still surfaces:** the outline, triangulated flat at the water level.
- **Ribbons:** a vertex row every 0.2 u. TEXCOORD_0 = (u, the arc length in world units; v, 0 to 1 across). u carries on across joins: the river starts at the stream's length, and each fall continues from its channel.
- **Carved ribbons** are 0.2 u wider on each side than the water, so the terrain clips them and the visible edge is the true intersection. The farm stream is exactly its width, with soft edges.
- **Tuck.** Where a ribbon meets a still body, it dips 0.01 u under that body's surface for 0.5 u. The still body draws first and writes depth, so nothing is blended twice.
- **Nothing moves.** The pond outline is today's `blob(POND.r, 3)`, ported with the same mulberry32 `rng`. The stream's centreline repeats the game's centripetal Catmull-Rom curve.

**Additions to `blueprintWater`:**
- `main.pond.outline`;
- `main.waterfall.points`, the wetland fall's profile started from MAIN's rim exit, running down to y ≈ −10.

**`public/models/water.json`** (format `gitaway.water/1`). It gives the game everything, so the game reads nothing from `art/config`.
- Per piece: the GLB; the map `{ file, origin, texel, size, encoding }`; the bodies `{ node, kind: still | ribbon | fall, palette, level, virtual, flow, length, fillFrom }`.
- The resolved palettes and the layer parameters per tier.
- The three GLBs also get the usual entries in `public/models/manifest.json`.

**`lookPresets.json` and its schema.** The water keys become wired, and the section stays identical in every mood. `Game (current)` keeps `bakedDepth: false` as the revert.

| Key | Today | Revamp |
|---|---|---|
| `bakedDepth` | false, not wired | true = the maps and the new material |
| `shallowDepth`, `deepDepth` | 0.4 / 2 u, deeper than any basin (the lake is 0.43 u) | replaced by `bands: [0.08, 0.22]` and `bandSoft: 0.015` |
| `shoreBand` | 0.35 | width of the wet band and reach of the foam (u) |
| `foamLine` | 0.5 | strength of the contact line |
| `normalSpeed` | 0.3 | speed scale for the noise scrolls |
| `glint`, `caustics` | 0.6, 0 | 0.6, 0.35 |
| `riverFlowSpeed`, `fallStreakSpeed` | 1, 0.55 | ribbon flow multiplier (base 0.45 u/s); fall streaks at 1.2 u/s |
| `fallMist` | false | true: mist plumes and spring steam |
| `skyMix` | 0.25 | Fresnel scale (L5) |
| `bodies.*` (new) | — | the palettes in §3.3 |

**Shader source.**
- `art/scripts/lib/water-core.mjs` is pure ESM with no three dependency, like `look-core.mjs`. It holds:
  - the GLSL chunks;
  - `patchWaterLambert()` and `patchShoreLambert()`, string transforms that report `{ applied, misses }` as `celPatchLambert` does;
  - the encoding constants.
- The proof uses it directly. The game keeps a TypeScript copy, held to it by a drift test (§4.2).

**Proof preview.**
- **URL switches:**
  - `?water=v2|legacy`;
  - `?waterdebug=depth|shore|flow|bands`: false colour on the water and the ground;
  - `?waterTier=phone|mid`.
- **A new fixed view,** `pond`, beside `lake` and `waterfall`.
- **Reviews use `?baked=1`,** so the waterline matches the game's terrain.
- **Review sheets:**
  - the 7 LOOK-BRIEF views plus `pond`;
  - for each body, 3 orbit angles plus the default and phone gameplay cameras;
  - all of it under both the `Game (current)` light and `Golden afternoon`.

**Art tests** (`tests/water.test.mjs`; each is seen failing first):

| # | Check |
|---|---|
| W1 | Deterministic: two bakes give identical bytes. |
| W2 | Decoding: the lake's deepest depth ≈ level − bed (±1 step); the islet has G < 0; flow is 0 outside the water. |
| W3 | Shore: G = 0 lies within 0.05 u of the exported outlines, and agrees with "ground ≥ level" on at least 98 % of texels away from the boundary. |
| W4 | Flow: the lake's flow leaves the river mouth and reaches the outflow; \|v\| ≤ 0.5 u/s; still bodies have none. |
| W5 | Ribbons: u equals world arc length within 1 %; y equals the level; the stream's rim end meets the river's start within 1e-4 u; each fall's top meets its channel's end. |
| W6 | Falls: every vertex is at least 0.1 u outside the baked rock, and both falls reach y ≤ −10. |
| W7 | Budgets: at most 1,500 GLB triangles per piece; maps at most 512 texels per side; the noise tiles seamlessly. |
| W8 | Nothing moves: the pond outline is within 0.01 u of the game's blob, and the stream's centreline within 0.01 u of the game's curve. |
| W9 | `lookpresets.test.mjs` is updated: the water section is identical across moods, and the schema marks the keys wired. |

### 4.2 Game (owns `src/`)

**The material: Lambert plus an `onBeforeCompile` patch** (`src/world/water/waterMaterial.ts`). The research named two options, CSM or a ShaderMaterial; this takes the CSM approach without the package.
- **Not three-custom-shader-material:**
  - it isn't in `package.json`, so it would be a new dependency for one material;
  - it patches through `onBeforeCompile` itself, which would fight the `addPatch` chain LOOK-PORT step 2 plans for cel bands, haze and strata;
  - `Rising`'s fader clones materials and copies their `onBeforeCompile`, which a CSM instance doesn't survive cleanly.
- **Not a bare ShaderMaterial:**
  - the lights have to be fed in by hand, and today's `uLight` scalar is why the water looks pasted on;
  - it can't receive shadows without re-implementing three's shader chunks;
  - it would need LOOK-PORT step 6's display-referred fix-ups by hand.
- **So `MeshLambertMaterial`,** patched the way `wind.ts` and `assetMaterials.ts` already work, through LOOK-PORT's `addPatch`. If the water lands first, it adds `src/world/look/patch.ts` with the API LOOK-PORT specifies.
  - The water gets the sun, the hemisphere light, received shadows, fog, tone mapping, the colour pipeline and the future cel bands for free.
  - Anchors: `#include <common>` and `#include <worldpos_vertex>` in the vertex shader; in the fragment shader, `#include <color_fragment>` (bands, foam and caustics into `diffuseColor`) and `#include <opaque_fragment>` (Fresnel and glints).
  - `celKind` is `'none'`, so the water's own posterisation rules.
  - Defines pick one program per kind (surface, fall, mist, ripple) per tier.
- **Loading the maps.** Each `.bin` is fetched into a `THREE.DataTexture`: RGBA, `NoColorSpace`, linear filtering, mipmaps, clamp to edge. The noise texture is RG with `RepeatWrapping`.

**Bodies and draw calls.**
- `<PieceWater piece>` loads `water.json` and the piece's GLB and map, builds one material per body, and mounts the meshes in the piece's group, so they rise and dock with it.
- It replaces the water parts of `Pond`, `Stream`, `Lake`, `Brook` and `Fall`. The stones, pads, reeds and bridge stay.
- The river and outflow merge into one mesh, since they share a palette.
- The mud bank ribbons and the pond's bank disc go; the wet band replaces them.
- The hot spring is drawn once the highland docks, with the tarn. (Revision 3, R3.5: only while the Hot spring item is owned.)

**Render order.** Everything here is `transparent`.

| Order | What | depthWrite |
|---|---|---|
| 1 | Path ribbons (the existing `RIBBON_ORDER`) | false |
| 2 | Still surfaces | true |
| 3 | Ribbons | true |
| 4 | Ripples | false |
| 5 | Falls (double-sided) | false |
| 6 | Mist and steam | false |

**Terrain hooks** (`src/world/water/shorePatch.ts`).
- `pieceMat` is cloned for main, wetland and highland only, and each clone gets its piece's map. This adds no draw calls, since each piece is already its own mesh. The skirts share the clone, which is harmless.
- The patch draws L8–L10 from G and R.
- Outside the map's rectangle it does nothing: an explicit bounds test, so clamp-to-edge never smears the edge values outwards.

**Ripples** (`Ripples.tsx`).
- One InstancedMesh of up to 16 horizontal quads at the water level, with the rings drawn in the shader.
- The duck instances follow `duckAt` each frame. On mid, each duck also trails a wake quad.
- It exposes `ripple(x, z)` for the heron, and later for fish and rain.

**The driver.** `WaterDriver` stays the single mount.
- It sets the shared uniforms:
  - the sky zenith and horizon from `sky.current` (`top`, `mid`; later the look port's `sky.zenith` and `sky.horizon`, converted the same way as the fog colour);
  - the fill fronts;
  - the ripple instances.
- **Phases, not time.** The scroll offsets and wave phases are wrapped on the CPU in float64, as `(t × speed) mod period`, and sent as small uniforms, so precision holds after days of running.
- In "still" motion the phases hold.
- It never requests frames itself; the Ticker owns the frame rate.

**Tiers** (`tier.ts`). The tier is **phone** when the pointer is coarse (`(pointer: coarse)`) and the screen's short side is 820 px or less; otherwise it is **mid**. `?water=phone|mid` overrides this. Later it folds into LOOK-PORT step 6's quality setting (LOW → phone) and the trees' far-version switch.

| | Phone | Mid |
|---|---|---|
| Noise | 1 scroll, no flow advection | 2 scrolls, with flow advection on the pond, lake and spring |
| Foam | contact line + 1 band | contact line + 2 bands + riffles |
| Glints, caustics, lapping line, duck wake | off | on |
| Water receives shadows | no | yes |
| Streak layers per fall | 1 | 2 |
| Mist puffs per fall | 3 | 6 |

**Fallbacks.**
- **The `water` switch is off:** today's `Water.tsx`, pixel for pixel.
- **A piece's JSON, GLB or map fails to load:** the legacy components for that piece, with one warning.
- **Patch anchors are missing (after a three update):** plain Lambert in the body's mid colour, the misses listed in a dev readout `window.__water`, and a failing vitest.
- **The legacy code** is deleted only after the owner signs off the finished water.

**Game tests** (vitest; each is seen failing first):
- every anchor applies exactly once on the installed three, and the program cache keys differ per tier (the `assetMaterials.test.ts` pattern);
- the GLSL and constants match `art/scripts/lib/water-core.mjs` byte for byte (the drift test);
- `water.json` decodes, and a missing file selects the legacy path;
- the fader's clone keeps the patch and fades the alpha;
- the phases stay bounded at t = 10⁷ s and hold in "still";
- the ripples follow `duckAt`;
- with the switch off, the legacy materials render.

**e2e.** These checks go into the existing desktop spec, with no new CI job; the mobile project runs locally before any app push.
- The world element reports `data-water`, for example `main:v2:pond,stream,fall wetland:v2:lake,river,fall highland:v2:tarn,spring`. (Revision 3, R3.5: `highland:v2:tarn` until the Hot spring item is owned.)
- After the dev fast-forward docks the wetland, MAIN's fall is gone and the river is there.

## 5. Performance budgets

| Item | Today | Budget |
|---|---|---|
| Water draw calls | 16 in all, up to 11 at once | **≤ 12** in all, **≤ 10** at once (the farm fall and its mist go when the wetland docks); counted per mesh, see Revision 3, R3.3, for the per-pass count |
| Shadow-pass calls | 0 | 0 (water casts no shadows) |
| Texture reads per water pixel | 0 | phone ≤ 3, mid ≤ 9 (Revision 3, R3.2; was ≤ 6; the shadow map's reads counted apart) |
| Texture reads per terrain pixel (wet pieces only) | 0 | 1 |
| Texture memory | 0 | about 0.85 MB (0.8 MB of maps with mips, plus 43 KB of noise); budget **≤ 1.5 MB** |
| Downloads | — | ≤ 0.8 MB of `.bin`, ≤ 150 KB of GLB, plus `water.json` |
| Triangles | about 1k | ≤ 4,000, including ripples and mist |
| Overdraw | — | at most 20 mist and steam puffs in all, each with alpha ≤ 0.55 |

**How it is measured:** the same way as the painterly trees (their task 11).
- A Playwright probe on main and on the branch build, with all pieces docked via the dev fast-forward.
- At the default camera and the `lake` and `pond` close-ups.
- 10 s of rAF deltas, median and p95, 5 runs each.
- On desktop (GTX 1660 S, Windows Chrome), and on the mobile project with 4× CPU throttling.
- Where `EXT_disjoint_timer_query_webgl2` exists, the whole-frame GPU time is compared too, since the trees' rAF numbers had about 1 ms of noise.

**Gates:** desktop median Δ ≤ +0.3 ms (GPU time Δ ≤ +0.3 ms); mobile-profile median Δ ≤ +1.0 ms. If a gate fails, cut in this order: the mist puffs, the glints, the second noise scroll, the water's shadows, the lapping line. If the owner has a phone to hand, one look through the share link is the real-device check.

## 6. Phasing

Each PR ships on its own, carries its own tests (reported RED then GREEN), and comes with renders from at least 3 angles plus the default camera. The desktop e2e runs in CI, and `npm run e2e:mobile` runs locally before any app push. (Revision 2, R2.4: e2e now runs locally in the pre-push hook, not in CI.) Game PRs are briefed to the game session.

| PR | Owner | Contents | Why it can ship alone |
|---|---|---|---|
| 1. Bakes and proof | art | <ul><li>`bake-water.mjs`: maps, noise, GLBs, `water.json`</li><li>The `blueprintWater` additions and `water-core.mjs`</li><li>The proof's `?water=v2` and debug views</li><li>The schema and presets</li><li>W1–W9 and the review sheets</li><li>**The owner reviews the look here, before any game work.**</li></ul> | The game ignores the new files. |
| 2. Material and the pond | game | <ul><li>`waterMaterial`, plus `addPatch` if it isn't in yet</li><li>`PieceWater` for the pond only</li><li>Driver phases, tiers and fallbacks</li><li>The `water` switch turned on</li><li>Vitests, the `data-water` e2e and the frame-time A/B</li></ul> | The other bodies stay legacy. (Revision 2: PR 2 merged with the `water` switch off; see R2.1 and R2.4.) |
| 3. The other bodies | game | <ul><li>The stream, the lake, the merged river and outflow, the tarn</li><li>**The hot spring, now drawn**</li><li>The bank strips removed</li><li>The rise and fill behaviour</li><li>The e2e dock check</li></ul> | The falls stay legacy. (Revision 2 supersedes this: the two fall sheets come in PR 3, and the wetland and highland come onto the new water here, see R2.1. Revision 3, R3.5: the hot spring is drawn only while its item is owned.) |
| 4. Terrain hooks and ripples | game | <ul><li>`shorePatch` on the three `pieceMat` clones</li><li>`Ripples` for the ducks and the heron</li><li>The A/B again</li></ul> | Pure addition. |
| 5. Waterfalls, mist, steam | game, plus art if the fall ribbons need tuning | <ul><li>The fall material, with the dissolve</li><li>Mist and steam billboards</li><li>The farm fall lengthened to about 10 u</li><li>Final A/B and in-game shots</li></ul> | It closes the last visible gap. (Revision 2: the fall material and sheets moved to PR 3; PR 5 keeps the mist and steam billboards, the farm fall's lengthening and the final A/B.) |
| 6. Clean-up | game | Delete the legacy shaders once the owner has signed off. | — |

**Deferred from PR 1 (2026-10-23 review):** `patchShoreLambert()` (L8–L10) and the ground half of `?waterdebug` move to an art follow-up that lands **before PR 4**, since the game's drift test needs them in `water-core.mjs`.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The shader-chunk anchors are tied to three 0.186. | The minor version is pinned; anchor tests; the plain-Lambert fallback. |
| The virtual pond depth looks painted on. | Its bed colour and bands are tuned in the proof at the phone and desktop framings; open question 1. |
| The shore field disagrees with the rendered intersection: the height grid is off by up to 0.013 u on gentle ground and up to 0.38 u on risers. | Bake from the baked grid; over-wide carved ribbons; the W3 tolerance; soft edges. |
| Transparent sorting against the path ribbons, fireflies and mist. | Explicit render orders; still bodies write depth. |
| Float precision over long sessions. | Phases wrapped on the CPU; highp for world-space coordinates. |
| Phone fill rate. | The phone tier; caps on mist; the measured gate and its cut list. |
| The look port changes the lights and tone mapping. | Lambert follows automatically. The sheets cover both `Game (current)` and `Golden afternoon`, and sky colours are converted the same way as the fog colour. |
| The coarse facets of the basins show through shallow water. | The underwater tint, and alpha below 0.9 only in the outer 0.25 u. |
| CI minutes. | Node tests and vitest only; the e2e checks go inside existing specs. |

## Licences

Borrow code only from MIT sources. Before copying, check each repo's LICENSE at the commit you read, and put the repo, the commit and the MIT notice in the file header.
- three.js `Water2`: the flow-map maths.
- thaslle/stylized-water: the shore drawn on the terrain.
- brunosimon/folio-2025 `WaterSurface.js`: the baked shore, the tiers, and a TSL template for later.
- norio/three-stylized-water and boona13/threejs-grass-water-shaders: MIT according to LOOK-BRIEF.

**Ideas only, no code:** Roystan's toon water, jpanuelos' Ghibli foam, the A Short Hike threads, 80.lv's Nimue breakdown, and Cyanilux's water and waterfall breakdowns.

**Avoid:**
- Lygia (Prosperity licence, no commercial use);
- Three.js Journey code (its terms);
- Tidewater (paid);
- unlicensed repos (nhtoby311/WaterSurface, roombawulf).

## Open questions

1. **Should the farm pond and stream get a real carved basin?** MAIN is frozen and flat there, so this design fakes the depth. Carving means re-baking `piece_main` and moving the water height the ducks and the heron use.
   - *Recommended: not now; look again after PR 2's renders.*
2. **The cloud sea stays out of scope, and the falls dissolve into spray instead of meeting clouds. Is that OK?**
   - *Recommended: yes; look again when LOOK-PORT step 4 brings the painted sea.*
3. **Remove the brown bank strips now, in PR 3?** The pond's spike reeds would be left to the cohesion clean-up (part 3).
   - *Recommended: yes.*
4. **Detect the phone tier, before a quality setting exists, by a coarse pointer plus a short side of 820 px or less?**
   - *Recommended: yes, folded into the quality setting when LOOK-PORT step 6 lands.*

**Controller rulings (2026-10-23, provisional, design delegated by the owner for tonight):** questions 1–4 take the recommended answers above. The owner can override any of them at review.

## Revision 1 (owner, 2026-10-24)

The owner reviewed the three pond-shape mockups and the seamless-junction mockup of shape A, and approved:

> "Yes but there is still an issue where the river connects to the waterfall halfway up the river. Also add animations to the water. Ripples."

So the farm pond becomes **A, the Teardrop**, with the seamless pond-to-stream join, plus two requests: the river-to-waterfall joins (R1.4) and a ripple animation (R1.5).

### R1.1 Ownership

- **The art side now owns the farm pond and stream outline.** This lifts the §1 non-goal "Moving or reshaping any water body" for the farm pond and stream only. The lake, river, outflow, tarn and spring stay frozen.
- The outline lives in the art config (`world.config.mjs` → `archipelago.farmWater`) and reaches the game through `water.json` and `blueprint.pieces.json` (`blueprintWater`), as every other body does.
- **W8 changes meaning.** W8a and W8c no longer pin the game's `blob(POND.r, 3)` and the game's stream curve. They check the bake against the art-owned outline and the art-owned stream curve.
- MAIN is already flat (|H| < 0.03 u) under the whole new pond and stream, so the virtual depth (§4.1) still needs no carve. The flat-zone corridor, the scatter keep-clears and the lawn paint follow the new outline. The pieces are re-baked for that, which moves MAIN's ground by at most 0.03 u, at flowerbed 8's new spot.

### R1.2 The Teardrop

- **Outline:** 191 points, no self-intersection, closing on the cap line where the stream leaves it (the first and last points are the cap corners).
  - **Area:** 9.32 u², which is 43% more than today's 6.51 u² (the pond up to the cap line; the stream beyond it is extra).
  - **Generator** (for the record; the points are what ship): smooth unions of circles (−1.6, 4.42) r 1.33, (−1.62, 4.98) r 0.9 and (−2.25, 5.52) r 0.85, and a tapered sweep (−2.0, 4.85, 1.25) → (−2.65, 5.3, 1.05) → (−3.3, 5.62, 0.74) → (−3.8, 5.78, 0.42), with 0.07 u of low-frequency shore noise.
  - **Level:** 0.06, unchanged.
- **Stream:** centripetal Catmull-Rom through four points (x, z, level, width), with the width set per point:
  - (−3.6, 5.72, 0.06, 0.48) inside the neck, (−4.62, 5.95, 0.054, 0.45), the bridge (−5.7089, 5.5385, 0.044, 0.50), and the rim exit (−6.8147, 5.9962, 0.02, 0.54).
  - **It leaves the pond at pond level (0.06)** and only falls after that. Today it sits at +0.075, above the pond.
  - **The rim exit stays pinned,** so the wetland river still continues from it at the same width and level.
  - **A steer point** 1.2 u past the rim exit, along the wetland river's first segment, shapes the end tangent (157.5° → 135.3°). The curve is sampled only up to the rim exit, and it moves the course by at most 0.065 u, between the bridge and the rim.
- **Clearances** (water edge to the item; at least 0.3 u):

  | Item | Edge |
  |---|---|
  | garden fence SW corner (0.17, 3.16) | 0.86 |
  | lantern (0.45, 4.6) | 0.74 |
  | bench disc (0.2, 5.77) r 0.6 | 0.32 |
  | lantern (−2.95, 2.75) | 0.79 |
  | dirt-path fork end (−1.85, 2.75) | 0.38 (0.12 today) |
  | rock (−2.8, 7.0) | 0.59 |
  | bush (−0.4, 6.6) | 1.03 |
  | fruit tree (−4.8, 4.6) | 0.93 |
  | static tree (−5.8, 3.4) | 1.89 |

- **Flowerbed 8** moves from (−3.4, 5.5), which the stream now crosses, to **(−1.50, 7.75)**: open lawn south of the pond, 0.89 u from the water.

### R1.3 The seamless join

- **One surface.** `water_pond` is one mesh: the pond polygon, closing on its cap line, plus the stream ribbon from that cap row to the rim exit. The ribbon's first row is the polygon's two cap-corner vertices, so there is no overlap and no tuck. MAIN's GLB has no separate `water_stream` node, so the game's PR 2 ships the pond and the stream together.
- **The pond palette for the farm stream,** in every band. Over its last 1.0 u it blends to the river palette, so at the rim it matches the wetland river.
- **Continuous depth.** One virtual depth over the union of pond and stream, from the union's shore distance, so the pond's bands taper straight into the stream's centre stripe.
- **One shoreline.** The contact line, foam bands, alpha and bed paint come from the one union shore field, through one material. There is no ribbon edge band at the junction.
- **A 1.5 u flow ramp.** From the cap line, the still drift hands over to the stream's flow over 1.5 u: the noise blends from the advected still path to the ribbon path (a variance-keeping mix, so there is no flat patch halfway), the riffles fade in, and the baked flow's cap rises from 0.08 to 0.15 u/s. The flow is one Laplace solve over pond and stream.
- **Over the edge.** Undocked, the stream curls over the rim into the fall's foam lip: the first rows past the rim are drawn with the pond surface's own material, and the sheet below starts with a broken foam lip instead of a solid pale band.

### R1.4 River-to-fall continuity

- **Every fall starts exactly where its channel meets the cliff edge:** MAIN's farm fall (shown while the wetland is undocked) and the wetland outflow's fall.
  - The fall's top row is the channel's last row (within 1e-3 u), with the same width and the same across vector.
  - That row lies on the brink, the cliff edge of the baked ground. The channel's ribbon ends there: no water runs on past the edge, and the sheet never starts upstream of it.
  - The water curls over continuously: the first rows past the brink stay nearly level, then turn down the exported profile, with no overlap and no gap.
- **Docked:** no farm fall is drawn, and the stream runs straight into the wetland river across the seam (C1 there, the river's first row exactly the stream's last).

### R1.5 The ripple layer (L11)

- **Still bodies:** ambient rings that expand and fade.
  - **Deterministic:** each ring comes from a hash of a world cell and an epoch, never from a per-frame random number. Its phase is wrapped on the CPU, as every other phase (W12).
  - **Density per body:** the pond moderate; the lake more, near the reeds, weighted by the shore field; the tarn sparse; the spring none, since its steam carries its life.
- **Streams:** flow-aligned ripple chevrons and streaks, moving along the arc length u.
- **Tiers:** the phone tier draws one ring layer; mid draws the full set.
- **Look:** soft, thin, cream rings that fade out at the phone framing through `fwidth`, like the other layers. No hard white circles.
- **Hook:** a small uniform array `uRipple[4]` (x, z, start phase, strength) for the game's duck and heron ripples (PR 4). It is declared and read, but nothing writes it yet.
- **Cost:** no texture reads; a few hash and ring evaluations per pixel.

### R1.6 Game follow-ups

These come in game PR 2, or in a small game PR before it:
- `layout.ts`: `POND` and everything placed from it follow the new outline: the ducks' paths, the heron's wading spot, the kingfisher stake, and the pond blocker (a polygon, or circles covering the new south-west lobe instead of the r 1.75 circle).
- `layout.ts`: `FLOWERBEDS[7]` moves to (−1.50, 7.75).
- `Water.tsx`'s legacy pond and stream stay as they are: they are the fallback when the `water` switch is off.

## Revision 2 (owner, 2026-10-25)

The owner checked the switched-on water (#74) on a phone at dusk, with the wetland raised. MAIN's new lit water went dark and flat beside the wetland's legacy water, which ignores light and so glowed.

The owner's choice: hold #74; bring the wetland and highland onto the new water now (game PR 3, using the baked `water_wetland` and `water_highland`); add a game-side dusk floor; then switch everything on together.

This supersedes §6's "the other bodies stay legacy" for PR 2 and "the falls stay legacy" for PR 3. Everything else in the spec stands.

### R2.1 The falls come in PR 3, without mist (I2)

- **In PR 3:** both waterfall sheets, MAIN's farm fall and the wetland fall, through the fall material (brink, streaks, dissolve).
- **Not drawn:** the skirts (`water_fall_skirt`). They are depth-only, for an outline pass the game doesn't have yet.
- **Still PR 5:** the mist and steam billboards.
- **The owner approved switching the falls on without mist.**

### R2.2 The farm fall's retreat (I5)

- When the wetland docks, the farm fall retreats with a **2 u slide down plus a 1 s fade**.
- **Why:** water-core's fill front only grows from the top (`step(u, uFill × L)`), so it can't empty a fall from the top down.
- This replaces §3.5's "water front retreats downwards over 1 s".

### R2.3 The dusk floor is the game's (I9)

- **Game-owned:** a second shader patch, keyed to the day's light, after water-core's patch. Water-core and the palettes don't change.
- **The floor:** the lit water is scaled up to at least `floor(daylight) × its albedo's luminance`, keeping the light's hue.
  - Keys (daylight → floor): `[[0, 0.24], [0.1, 0.34], [0.3, 0.38], [0.6, 0]]`.
  - It is never above half of noon.
- **The sky mix** eases to 60 % at night, and **the falls' glow** to 40 %.
- **No palette change.** The owner chose night water "a little lighter than the grass".

### R2.4 e2e runs locally (M5, carried from PR 2)

- e2e runs locally in the pre-push hook, not in CI.
- PR 2 merged with the water switch off. #74 switches it on together with PR 3, after the owner's look check.

### R2.5 Optional follow-ups: not done; on request only

These are done only if the owner asks after the look check.
- **A2, a drain front for the falls in water-core:** `uniform float uDrain;` and `a *= step(uDrain * uLength, u);`, with `uDrain` added to `WATER_UNIFORMS`. The farm fall's retreat would then use it instead of the slide.
- **A3, about 10 % darker `deep` colours for the pond, lake and tarn:** water-core's `PALETTES`, `water.json` and every preset's `water.bodies` change together (W9). No re-bake. (Revision 3, R3.4: no longer needed.)

## Revision 3 (controller, under the owner's rule, 2026-10-25)

The game session measured PR 3 (#78) on the phone tier and counted its texture reads (its asks A5a and A5b). The phone falls were over the read budget and pushed the mobile A/B past its gate. Mid's paths, merged in PR 2, read more than §5 allowed.

This revision trims the phone fall, sets mid's budget to the measured paths, records two ways of counting draws, drops A3, and ties the hot spring's water to its item. Everything else in the spec stands.

### R3.1 The phone fall within 3 reads (A5a)

- **Measured (game, PR 3):** mobile at 4× CPU throttle, A/B against main.
  - Median of the run medians: +1.17 ms GPU, +1.90 ms CPU.
  - Paired: +1.02 ms GPU, +1.00 ms CPU. The gate is +1.0 ms (§5).
  - On one page the water costs about +0.7 ms. About half of that is the wetland fall, seen under the island in portrait.
  - The phone tier already draws no shadows, and drawing both fall passes together saved nothing.
- **The fix: water-core's phone fall path is trimmed.** Mid is unchanged.
  - **One tap fewer.** The brink's noise is now the streak tap `s1` (the same R channel), not a ribbon tap of its own. On phone a fall reads 3 texels a pixel: `s1`, the dissolve's `nd` and the channel's map.
  - Over the brink, the cream contact line is kept unbroken (its noise ≥ 0.4). Otherwise `s1` could notch the bank's foam where the river's line runs on.
  - **A cheaper sheet.** The sky Fresnel runs only over the brink (`if ( wBrK > 0.0 )`, phone only). Below the brink F was already 0, so the rest of the sheet now skips that block. The branch holds no texture read or derivative, so it is safe.
- **The look cost:** only the brink's noise changes. The wobble of its bands and the dashes of its foam no longer line up with the river's above. The brink is 0.075 + 0.16 u long, about 3 px at the phone framing.
  - The streaks, the foam lip, the edges and the dissolve are unchanged.
  - Rendered before and after on the phone tier, the game's portrait framing and four 16 u views of the two falls came out pixel-identical.
  - Only the 4 u brink close-ups differ, and only over the brink: about 1 % of their pixels, by at most 30 levels. The worst spot is a short break in the bank's cream at the farm fall's lip corner, about 1 px at the phone framing.
  - Mid's renders came out pixel-identical.
- **The binding check is still the game's A/B gate.** The game measures PR 3 again.

### R3.2 The texture-read budget (A5b)

- **Phone: ≤ 3 reads per water pixel**, as before. Every body now meets it.
- **Mid: ≤ 9 reads per water pixel** (was ≤ 6), which matches the PR 2 and PR 3 paths.
  - Not counted: the 5 shadow-map reads that mid's shadows add. They are three's, not water-core's.
- The reads per body, per pixel:

| Body (its patch) | Phone | Mid |
|---|---|---|
| Pond, with the farm stream (the join) | 3 | 9 |
| Both falls (the brink) | **3** (was 4) | 9 |
| Lake, river, outflow, spring | 2 | 6 |
| Tarn | 2 | 5 |

- **The check: art's W17.** For every body `water.json` draws, it counts the reads per tier in water-core's GLSL, and it fails over the budget.
- **§5's A/B gates stay binding.** A path within the read budget that fails its gate is still cut.

### R3.3 Two ways to count water draws

- **Per mesh**, which §5 and the game's budget test count: at most 9 at once and 11 in all, within ≤ 10 and ≤ 12.
- **Per GPU pass:** a fall draws in two passes, as three does for a transparent double-sided sheet. Counted that way, a rise peaks at 10 draws at once (exactly the cap) and 13 in all.
- §5's budget stays per mesh. The per-pass count is here so that any later fall or double-sided body is costed with its second pass.

### R3.4 The night floor scales per body; A3 is dropped

- **The game's dusk floor (R2.3) now scales per body** by `min(1, 0.17 / luminance(deep))`. So the light palettes (the river, the spring, the falls and MAIN's stream) don't read bright at night.
- This is game-side. No palette changes.
- **It supersedes R2.5's optional A3** (darker `deep` colours). A3 is no longer needed.

### R3.5 The hot spring's water comes with its item

- **The hot spring's water is drawn only while the Hot spring item is owned.** §4.2 and §6 row 3 drew it with the tarn; this replaces that.
- **Why:** on main nothing draws spring water and the spot is grass. `hotSpring` sits behind the `biomes` switch, which is off. The game ruled that nothing appears that the player didn't buy.
- **`data-water`** reads `highland:v2:tarn`, and `highland:v2:tarn,spring` once the item is owned.

### R3.6 What the game regenerates

- **`src/world/water/core.gen.ts`**, by `npm run water-core` (`node scripts/water-core.mjs`) at the repo root. `core.test.ts`'s drift test holds it to water-core.
- **Unchanged:** the program keys (`water:<kind>:<tier>:…|water-floor`), the patch's five anchors, the dusk floor's two anchors (`#include <common>`, `#include <envmap_fragment>`), the chunk boundaries and every `w…Out` value the chunks hand on.
- **No uniform, varying or define is added or renamed.** The names the game's floor patch reads under `WATER_JOIN` (`uDeep2`, `uJoin`, `vWaterUv`) are untouched and stay on that path.
