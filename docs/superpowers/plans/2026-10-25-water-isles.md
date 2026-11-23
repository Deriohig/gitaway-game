# Water PR 3: every piece's water, and a dusk floor. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every piece's water is drawn from the art's baked water. That covers MAIN's pond, stream and farm fall, the wetland's lake, river, outflow and fall, and the highland's tarn and hot spring. The flowing water starts when the wetland docks, and a dusk floor keeps all of it readable at dusk and at night. Then PR #74 switches everything on together.

**Owner decision 2026-10-25, "Hold, convert all first":**
- The owner checked the phone at dusk with the wetland raised. MAIN's new water is lit, so it went dark and flat. The wetland's legacy lake, river and fall ignore the light, so they glowed pale blue-white.
- #74 (`feat/water-on`, switch on, shader fallback, ask at mount) stays unmerged.
- This plan's commits go on top of it (HEAD 11a5703, origin/main 9d1c165 merged in). #74 merges only after the owner's look check at the end.

**Architecture:**
- **One water per session:** `water.json` and the noise are fetched once (N3). One set of shared uniforms serves every piece (N1).
- **Each piece:** a piece loads its own map and GLB when the farm has that piece, and draws through the same patched Lambert material. That includes the falls; the river and outflow are merged into one ribbon.
- **The driver** steps the shared uniforms and a registry of bodies. The registry carries the fill fronts, the farm fall's retreat and visibility, from the moment the wetland docks.
- **The dusk floor** is a second, game-owned shader patch. It lifts the lit water to a floor keyed to the day's light, and the driver also eases the sky reflection and the falls' glow at night. No palette changes.

**Tech Stack:** TypeScript, React Three Fiber, three.js 0.186.x (`MeshLambertMaterial.onBeforeCompile`, `WebGLRenderer.compileAsync`), zustand, vitest (`TZ=UTC vitest run`), Playwright.

**Spec:** `art/specs/2026-10-23-water-revamp-design.md`. Read §3.5 (behaviour), §4.2 (game), §5 (budgets), §6 row "3. The other bodies" and Revision 1. The previous plan, `docs/superpowers/plans/2026-10-25-water-pond.md`, describes what exists.

## Global Constraints

- **No new dependencies.** three stays `^0.186.1`.
- **`art/` and `public/models/` are read-only to the game.** Never edit them and never `git add` them. Tests may read `art/config/lookPresets.json` and `art/scripts/lib/water-core.mjs`.
- **Material:**
  - one `MeshLambertMaterial` per drawn body; the merged river and outflow count as one body;
  - patched through `addPatch`: water-core's `patchWaterLambert` (key `water:<kind>:<tier>:<flow>:<join><brink><vhead><ripple>`), then the game's floor (key `water-floor`);
  - `userData.celKind = 'none'`;
  - no render targets, no extra passes.
- **Render order (spec §4.2):**
  - path ribbons 1;
  - still surfaces 2, with `depthWrite: true`;
  - ribbons 3, with `depthWrite: true`;
  - falls 5, with `depthWrite: false` and `DoubleSide`;
  - all `transparent`. Nothing casts a shadow, and bodies receive shadows on the mid tier only.
- **Texture reads per water pixel:** phone ≤ 3, mid ≤ 6. The floor adds none.
- **Phases:** `(t × speed) mod period` on the CPU, held in still motion. The water never requests frames.
- **Behaviour (spec §3.5):**
  - Still water (pond, lake, tarn, spring) rises with its piece through the clouds.
  - Flowing water starts when the wetland docks: the farm fall goes over 1 s; the river fills from the MAIN seam over 2.5 s; then the outflow over 1 s; then the wetland fall over 1 s (water.json `fillFrom`).
  - All of it is instant in still motion, and for a wetland that was already there.
- **Budgets (spec §5):**
  - water draw calls ≤ 12 in all and ≤ 10 at once;
  - triangles ≤ 4,000;
  - texture memory ≤ 1.5 MB;
  - downloads ≤ 0.8 MB of `.bin`, ≤ 150 KB of GLB, plus `water.json`;
  - A/B gates: desktop median Δ ≤ +0.3 ms (GPU Δ ≤ +0.3 ms); mobile profile at 4× CPU throttle, median Δ ≤ +1.0 ms.
- **Fallbacks, per piece:**
  - **The switch is off:** today's `Water.tsx`, exactly.
  - **A piece fails:** its JSON, GLB or map fails, stalls past `PIECE_TIMEOUT_MS` (8 s), or its shader can't be built. That piece alone draws today's water, with one `console.warn` naming it.
  - **Missing anchors:** plain Lambert in the body's mid colour, listed in `window.__water.misses` as `<piece>:<node>: <misses>`.
- **`data-water`:** `<piece>:v2:<bodies>` or `<piece>:legacy`, space-separated, in the order main, wetland, highland. Example: `main:v2:pond,fall wetland:v2:lake,river,fall highland:v2:tarn,spring`.
- **Look values not in water.json:** `shoreBand 0.35`, `foamLine 0.5`, `skyMix 0.25`, `glint 0.6`, `caustics 0.35`. Speeds: `normalSpeed 0.3`, `riverFlowSpeed 1`, `fallStreakSpeed 1.2`.
- **The legacy code stays.** PR 6 deletes it after the owner's sign-off.
- **Repo rules:**
  - red first for every test;
  - the commit trailer is `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - never force-push or merge #74;
  - e2e runs locally on desktop and mobile as `flock /tmp/gitaway-e2e.lock env E2E_PORT=<4270–4279> npx playwright test …`; the pre-push hook runs `npm run check:push`; CI runs only unit and rust.

## Rulings

- **I1, one shared uniform set per session (N1).** `sessionWaterUniforms(json)` makes the set once, and every build uses it. The phases, sky and look are the same for every piece.
  - **Why:** the driver's one slot was taken over by whichever piece built last.
  - **Cost if wrong:** one module holder, the pattern the pond already uses.
- **I2, the falls come into this PR as sheets.**
  - **In:** MAIN's farm fall and the wetland fall, through the fall material (brink, streaks, dissolve).
  - **Not drawn:** the skirts (`water_fall_skirt`). They are depth-only, for outline passes the game doesn't have yet.
  - **Still PR 5:** the mist and steam billboards. MAIN's four legacy mist blobs move to the art's `mist_fall` node; the wetland keeps none, as today.
  - **Why:** the owner's complaint names the glowing legacy fall, and the fall material already exists.
- **I3, the river and outflow merge into one mesh (spec §4.2).** Their u is continuous (3.4457 + 7.9566 = 11.4023, the outflow's start). One `uFill` front then runs from the seam to the lake, jumps to the outflow head at 2.5 s and reaches the lip at 3.5 s.
- **I4, when the downloads start.** A piece's water is asked for when the farm has that piece:
  - at world mount for MAIN and every piece already owned;
  - at purchase for a newly bought piece, with its ground (`needPiece`);
  - never for a piece not bought.

  **Why, given phones:**
  - The wetland's map is 406 KB, over half of all the water, and a player who hasn't bought the wetland shouldn't download it.
  - Asked with the ground, it counts in `data-models` from the same moment, and the 4.4 s rise covers it.
  - Asking at dock would pop the lake in after the dock, instead of surfacing with its piece (§3.5).
- **I5, the farm fall's retreat.** water-core's fill front only grows from the top (`step(u, uFill × L)`), so it can't empty a fall from the top down. The game slides the sheet down `RETREAT_DROP = 2` u while fading its material opacity from 1 to 0 over the retreat second, then hides it. An exact drain front is an optional art ask.
- **I6, what `data-water` reports.** It lists the bodies each piece builds. Which of them are showing now (the fill and the retreat) is in `window.__water.shown`.
- **I7, mounting.** The wetland and highland water mount inside their piece's group, so the root stands at the piece origin. A test pins water.json's `pivot` to `PIECES[id].dockedPosition`.
  - §4.2's "the hot spring is drawn once the highland docks" is read as "with the highland", because §3.5 has still water rise with its piece. The lily pads and jetty rise with the new lake too.
- **I8, precompiling.** A body hidden until its fill (river, wetland fall) has its program built when the piece is built (`renderer.compileAsync`). Then the unlock frame on a phone doesn't stall on a shader compile.
- **I9, the dusk floor (the owner's main complaint).** Three game-side knobs, keyed to one `daylight(sky)` (1 at 13:00, 0 at night):
  - **the floor:** the lit water is scaled up to at least `waterFloorAt(daylight) × its albedo's luminance`, keeping the light's hue, so the bands keep their ratios. Keys (daylight → floor): `[[0, 0.24], [0.1, 0.34], [0.3, 0.38], [0.6, 0]]`. It is 0 from late afternoon to noon, so midday and its shadows are untouched. It never exceeds half the noon brightness, so the water can't glow the way the legacy water does (0.65–1 × albedo, unlit);
  - **the sky reflection:** `uSkyMix = 0.25 × (0.6 + 0.4 × min(1, daylight / 0.3))`, so the dark night sky doesn't grey the bands;
  - **the falls' glow:** `emissiveIntensity = 0.4 + 0.6 × min(1, daylight / 0.3)`.

  The owner's screenshot reads as about 20:00–21:00 (dark grass, lit windows), so the renders cover 19.1, 20.6 and 22.6.

## For the art session

The game never edits `art/` or `public/models/`. The controller sends these asks to the art session.
- **A1, spec Revision 2 lines (the M5 item).** Record I2 (the fall sheets come in PR 3; the skirts wait for an outline pass; mist and steam stay in PR 5), I5 (the retreat is a slide and a fade) and I9 (the dusk floor is the game's; no palette change).
- **A2, optional, only if the owner wants the spec's exact retreat:** a drain front in water-core's fall chunk.
  - **What to add:** `uniform float uDrain;` with `a *= step( uDrain * uLength, u );`, plus `uDrain` in `WATER_UNIFORMS`.
  - **Then the game:** runs `npm run water-core`, and retreats with `uDrain` instead of the slide.
- **A3, only if the owner's look check says the bands still sit too close at dusk:** darken the `deep` colour of the pond, lake and tarn by about 10 % in value (for example the pond's `#43726E` → `#3B6763`).
  - **Where:** water-core's `PALETTES`, water.json's `palettes` and every preset's `water.bodies`, together (W9). No re-bake.
  - **Then the game:** regenerates `core.gen.ts`, and its drift tests hold it.

## Review Focus

1. **A phone buys the wetland on a slow link.** Its water arrives during or after the rise. Until then today's water shows on dock, never a hole. A water that arrives after the dock is drawn full and doesn't replay the fill. The test is in Task 3.
2. **Still motion, before or during the fill, and back again.** Everything is in place at once, and the fill never replays. The test is in Task 3.
3. **One piece's water fails** (a missing map, or a GPU that can't build the river's shader). Only that piece draws today's water, the others stay new, and there is one warning. The tests are in Task 1 (unit) and Task 6 (e2e, both cases).
4. **The rise through the clouds.** The Fader's copies of the lake and river materials read the same `uFill` and `uWaterFloor` objects, so the lake fades in with its piece and the fill and floor reach it. The tests are in Tasks 2 and 5.
5. **A farm that loses the wetland** (erased, or a save without it). The farm fall comes back full, at its place. The test is in Task 3.

---

### Task 1: Load every piece the farm has

**Files:**
- Modify:
  - `src/world/water/load.ts`;
  - `src/world/water/types.ts` (add `FillPart`, `LoadedBody`);
  - `src/world/water/report.ts` (export `WATER_PIECES`);
  - `src/world/water/PieceWater.tsx:80-82` (`useAskForWater`);
  - `src/world/World.tsx:262`.
- Test: `src/world/water/load.test.ts`

**Interfaces:**
- **Consumes:** `PIECES` (`src/world/blueprint`), `IsleId`.
- **Produces:**
  - `type FillPart = { node: string; length: number }`;
  - `type LoadedBody = { body: WaterBody; geometry: THREE.BufferGeometry; parts: FillPart[] }`. `LoadedWater.bodies` becomes `LoadedBody[]`, and `noise` is the session's shared texture;
  - `export const WATER_PIECES: readonly WaterPieceId[] = ['main', 'wetland', 'highland']` (report.ts);
  - `loadWaterPiece(piece: WaterPieceId): Promise<LoadedWater | null>`, `waterPiece(piece: WaterPieceId)` and `giveUpOnWater(piece: WaterPieceId)`, as today but for any piece:
    - one loading-manager item `water:<piece>` from the call;
    - `PIECE_TIMEOUT_MS` per piece;
    - each piece fails alone, with one warning naming it;
  - water.json and the noise are fetched once per session, behind the pieces. Their own `PIECE_TIMEOUT_MS` runs from the first ask, and a failure stays failed;
  - drawn kinds are still `still` and `ribbon` (Task 4 adds `fall`);
  - **the merge:** when a piece has `water_river` and `water_outflow` and `outflow.uStart` is within 1e-3 of `river.uStart + river.length`, they load as one body:
    - `node: 'water_river'`, `uStart: river.uStart`, `length: river.length + outflow.length`, the river's `vhead`, `ripples` and `palette`, `fillFrom: null`;
    - the geometry is `mergeGeometries([river, outflow])` (`three/examples/jsm/utils/BufferGeometryUtils.js`);
    - `parts: [{ node: 'water_river', length: 7.9566 }, { node: 'water_outflow', length: 4.1278 }]`.

    Every other body has `parts: [{ node, length: body.length ?? 0 }]`;
  - `disposeWater(water: LoadedWater)` disposes the piece's geometries and map, never the shared noise;
  - `waterPiecesFor(inWorld: readonly IsleId[]): WaterPieceId[]` returns `'main'` plus each of `wetland` and `highland` that is in the world, in `WATER_PIECES` order;
  - `askForWater(pieces: readonly WaterPieceId[]): void` asks for each piece with the switch on, and does nothing with it off;
  - `useAskForWater(inWorld: readonly IsleId[]): void` runs an effect keyed on the joined list. World.tsx's Scene calls it with the same `useVisibleIsles()` list it gives `useFarmDrawn`.

- [ ] **Step 1: Write the failing tests** in `load.test.ts`. Read the real `public/models` files with `fs` and stub `fetch`.
  - `it('loads each piece’s surfaces')`: main `['water_pond']`, wetland `['water_lake', 'water_river']`, highland `['water_tarn', 'water_spring']`. Nothing of kind skirt, mist or steam.
  - `it('draws the river and the outflow as one body, its u running on')`: the wetland's `water_river` body has:
    - `uStart` 3.4457, `length` 12.0844 (±1e-4), `vhead` [3.6457, 5.0457];
    - the two `parts` above;
    - a vertex count equal to the river's plus the outflow's, from `glbMeshes`.
  - `it('fetches water.json and the noise once for the session, however many pieces load')`: load all three, then 1 fetch each of `water.json` and `water_noise.bin`, and 1 each of the three maps and GLBs.
  - `it('falls back alone when one piece’s map is missing')` (Review Focus 3): a 404 on `water_wetland.map.bin` gives `null` for the wetland, one `console.warn` containing `wetland`, and main and highland loading.
  - `it('bakes a node’s transform into its mesh')`:
    - a test helper `withNodeTransform(glb: Buffer, node: string, translation: [number, number, number]): Buffer` rewrites the GLB's JSON chunk (re-padded to 4 bytes, header lengths fixed);
    - serve `water_highland.glb` with `water_spring` translated by [1, 0.5, −2];
    - the loaded spring's bounding box is the plain one's plus that offset, ±1e-5.
  - `it('has each piece’s pivot at its docked place')`: for main, wetland and highland, `json.pieces[id].pivot` equals `PIECES[id].dockedPosition`.
  - `it('lets go of a piece’s water but keeps the shared noise')`: after `disposeWater(wetland)`, a dispose spy on the noise isn't called, and spies on the map and the geometry are.
  - `it('asks for the farm’s water and each piece it has, never one it hasn’t bought')`:
    - `askForWater(waterPiecesFor(['meadow', 'wetland']))` fetches main's and the wetland's map and GLB, and nothing of the highland;
    - `DefaultLoadingManager.itemStart` sees `water:main` and `water:wetland`.
  - Update the existing tests:
    - `waterPiece`, `giveUpOnWater` and `askForWater` take piece lists;
    - `'with the switch off, fetches nothing'` uses `askForWater(['main', 'wetland'])`.
- [ ] **Step 2: Run the tests.** `npm test -- src/world/water/load.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** load.ts, `WATER_PIECES`, `useAskForWater(inWorld)` and the World.tsx call.
- [ ] **Step 4: Verify.**
  - `npx tsc -b` and `npm test` pass;
  - `e2e/water.spec.ts` passes on desktop. MAIN's water is unchanged, so `data-water` is still `main:v2:pond`.
- [ ] **Step 5: Commit.** "Load every piece's baked water once the farm has it, sharing water.json and the noise"

### Task 2: One water for the session, and materials for every body

**Files:**
- Create: `src/world/water/readout.ts`, `src/world/water/readout.test.ts`
- Modify:
  - `src/world/water/driver.ts`;
  - `src/world/water/waterMaterial.ts`;
  - `src/world/water/tier.ts:4`;
  - `src/world/water/build.ts`;
  - `src/world/water/types.ts`;
  - `src/world/water/PieceWater.tsx`, for the widened types.
- Test:
  - `src/world/water/driver.test.ts`, `src/world/water/build.test.ts`, `src/world/water/waterMaterial.test.ts`;
  - the readout tests move from `waterMaterial.test.ts` to `readout.test.ts`.

**Interfaces:**
- **Consumes:** Task 1's `LoadedWater`, `LoadedBody`, `FillPart`.
- **Produces:**
  - **`readout.ts`:**
    - `interface WaterReadout { tier: string; bodies: string[]; misses: string[]; compiled: string[] }`;
    - `waterReadout(): WaterReadout`, which is `window.__water`, moved out of waterMaterial.ts;
    - tier.ts and build.ts import it from here, and tier.ts no longer imports `./waterMaterial`.
  - **`types.ts`:**
    - `type WaterSurfaceKind = 'still' | 'ribbon' | 'fall'`;
    - `type BodyWaterUniforms = { uFill: IUniform<number> } & Record<string, IUniform>`;
    - `interface BuiltBody { name: string; kind: WaterSurfaceKind; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>; uniforms: BodyWaterUniforms; parts: FillPart[] }`.
  - **`waterMaterial.ts`:**
    - `createWaterMaterial(piece: WaterPieceId, body: WaterBody, shared: SharedWaterUniforms, maps: WaterMaps, tier: WaterTierName): THREE.MeshLambertMaterial`. The name is `water:<piece>:<node>`, and a miss reads `<piece>:<node>: <misses>`;
    - `bodyUniforms(material: THREE.Material): BodyWaterUniforms | undefined`, the per-material uniforms the patch hands the shader (N2), kept in a WeakMap, never in `userData`.
  - **`driver.ts`:**
    - `sessionWaterUniforms(json: WaterJson): SharedWaterUniforms` makes the set on the first call and returns the same object after;
    - `resetSessionWater(): void`, for tests;
    - `driveWater` steps the session's set once one is made;
    - `setSharedWater` and `getSharedWater` go.
  - **`build.ts`:**
    - `buildPieceWater(piece: WaterPieceId, loaded: LoadedWater, tier: WaterTierName): BuiltWater`, where `BuiltWater = { root; meshes; shared; bodies: BuiltBody[] }`;
    - the root stands at the origin, because the piece's group places it (I7);
    - `RENDER_ORDER = { still: 2, ribbon: 3, fall: 5 } as const`;
    - `showPieceWater` no longer hands the driver anything.

- [ ] **Step 1: Write the failing tests.**
  - **driver.test:**
    - `it('makes the shared uniforms once for the session')`: two calls give the same object;
    - `it('steps the session’s uniforms with no piece holding them')`: after `sessionWaterUniforms`, `driveWater` moves `uScrollA`.

    `'holds nothing until the pond sets it'` becomes `'steps nothing before the session’s water is made'`.
  - **build.test:**
    - `it('builds every piece on the session’s one set of uniforms')` (flips `'makes one set of shared uniforms, new for each build'`);
    - `it('stands the water in its piece’s own frame')`: the wetland's root is at (0, 0, 0);
    - `it('orders still 2, ribbon 3, fall 5')`: use a fall body from water.json in the fixture;
    - `it('leaves the session’s uniforms to the other pieces when one goes')` (replaces `'leaves another pond’s uniforms alone'`).
  - **waterMaterial.test:**
    - `it('names the piece and the body in a miss')`: a stub missing `#include <opaque_fragment>` records `wetland:water_lake: opaque x0`;
    - `it('hands out the body’s own uniforms, the ones its shader reads')`: after `onBeforeCompile`, `shader.uniforms.uFill === bodyUniforms(m)!.uFill`;
    - `it('shares them with the fader’s copy')` (Review Focus 4): `copy = m.clone()`, with `onBeforeCompile` and `customProgramCacheKey` copied as `Rising.tsx` does. Then the copy's shader `uFill` is the same object, and both cache keys are equal.
  - **readout.test:** the moved tests, plus `it('is read by tier.ts without the material')`: tier.ts's source has no `from './waterMaterial'`.
- [ ] **Step 2: Run the tests.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.** `npx tsc -b` and `npm test` pass, and `e2e/water.spec.ts` passes on desktop.
- [ ] **Step 5: Commit.** "Share one set of water uniforms for the session, and give every body its own fill and a named miss"

### Task 3: Flowing water starts when the wetland docks

**Files:**
- Create: `src/world/water/fill.ts`, `src/world/water/fill.test.ts`
- Modify:
  - `src/world/water/driver.ts`;
  - `src/world/water/readout.ts` (add `shown`);
  - `src/world/water/build.ts` (`plan`, and registering in `showPieceWater`);
  - `src/world/WildIsles.tsx:182-212`, where `Wetland` takes `risesIn`;
  - `src/world/Isles.tsx:276`;
  - `e2e/water.spec.ts`, whose readout expectations gain `shown`.
- Test: `fill.test.ts`, `driver.test.ts`, `build.test.ts`

**Interfaces:**
- **Consumes:** Task 2's `BuiltBody` and `bodyUniforms`; Task 1's `FillPart`.
- **Produces:**
  - **`fill.ts`:**
    - `type FillStep = { dir: 'in' | 'out'; start: number; seconds: number }` and `type FillPlan = Record<string, FillStep | null>`;
    - **`fillPlan(bodies: readonly WaterBody[]): FillPlan`:**
      - `{ shownWhile, retreat }` gives `out` from 0 over `retreat`;
      - `{ after: 'dock', seconds }` gives `in` from 0;
      - `{ after: <node>, seconds }` gives `in` from that node's `start + seconds`;
      - no `fillFrom` gives `null`;
      - an unknown `after` or a cycle throws, naming the node;
    - **`bodyFill(parts: readonly FillPart[], plan: FillPlan, sinceDock: number | null): number`:**
      - for a step: `in` is `clamp01((sinceDock − start) / seconds)`, and `out` is 1 minus that;
      - `null` (not docked) gives `in` 0 and `out` 1;
      - a `null` step is 1;
      - one part's fill is its own, and several are weighted by `length`;
    - `RETREAT_DROP = 2`.
  - **`driver.ts`:**
    - **`type FlowDock = 'none' | 'now' | 'before'`.**
    - **`setFlowDock(dock: FlowDock): void`:**
      - `'now'` takes effect only from `'none'`, and the next drive records the held clock as the dock time;
      - `'before'` is instant (−∞);
      - `'none'` resets.
    - **`flowDockFor(docked: boolean, risesIn: boolean, still: boolean): FlowDock`.**
    - **`registerWaterBodies(piece: WaterPieceId, bodies: readonly BuiltBody[], plan: FillPlan): () => void`.** Each `driveWater` frame, with `sinceDock` = ∞ in still motion:
      - **an `in` body:** `uFill = f` and `visible = f > 0`;
      - **an `out` body:** `material.opacity = f`, `mesh.position.y = −RETREAT_DROP × (1 − f)` and `visible = f > 0`;
      - **a body without a plan:** untouched;
      - `waterReadout().shown` is rewritten when a body's visibility changes, as the sorted `<piece>:<name>` of the visible registered bodies.
  - **build.ts:** `BuiltWater.plan = fillPlan(json.pieces[piece].bodies)`, and `showPieceWater` registers `built.bodies` with the plan.
  - **WildIsles:** `Wetland({ risesIn }: { risesIn: boolean })`, with `setFlowDock(flowDockFor(docked, risesIn, motion === 'still'))` in an effect, and `'none'` on unmount. Isles passes `rise.wetland`.

- [ ] **Step 1: Write the failing tests.**
  - **fill.test,** on the real water.json:
    - `fillPlan` gives: main `water_fall` `{ out, 0, 1 }`; wetland `water_river` `{ in, 0, 2.5 }`, `water_outflow` `{ in, 2.5, 1 }`, `water_fall` `{ in, 3.5, 1 }`; `water_lake` and both highland bodies `null`;
    - an unknown `after` throws;
    - the merged river's `bodyFill` is 0.32921 at 1.25 s, 0.65842 at 2.5 s, 0.82921 at 3.0 s and 1 at 3.5 s (±1e-4);
    - `null` gives `in` 0 and `out` 1, and `Infinity` gives `in` 1 and `out` 0.
  - **driver.test,** with fake `BuiltBody`s (real meshes, a `MeshLambertMaterial` and a `{ uFill }`):
    - `it('fills the river from the seam, then the outflow, then the fall')`: `setFlowDock('now')`, then frames of 0.25 s. At 1.25 s the river is 0.329 and the fall is hidden; at 4.0 s the fall is 0.5; at 4.5 s it is 1.
    - `it('retreats the farm fall over a second, then hides it')`: at 0.5 s, opacity 0.5 and y −1; after 1 s it is hidden.
    - `it('puts it all in place at once in still motion, and never replays it')` (Review Focus 2): `'now'` with `still`, then the river is 1 and the fall hidden. Then `setFlowDock('now')` again, not still, and it stays 1.
    - `it('puts it all in place at once for a wetland already there')`: `'before'`.
    - `it('draws a piece built after the dock full')` (Review Focus 1): `'now'`, drive 10 s, register the wetland; the first drive gives 1.
    - `it('brings the farm fall back when the wetland goes')` (Review Focus 5): `'none'` gives visible, opacity 1 and y 0.
    - `it('lists the bodies showing in the readout')`.
    - `flowDockFor`'s truth table.
  - **build.test:** `it('registers its bodies with the driver while shown, and takes them out when it goes')`.
- [ ] **Step 2: Run the tests.** Expect FAIL.
- [ ] **Step 3: Implement.** In `e2e/water.spec.ts`, add `shown` to the readout expectations: `['main:water_pond']` while drawn, `[]` on today's water.
- [ ] **Step 4: Verify.**
  - `npx tsc -b` and `npm test` pass;
  - `e2e/water.spec.ts` and `e2e/wild-isles.spec.ts` pass on desktop.
- [ ] **Step 5: Commit.** "Run the wetland's water in from the farm once it docks, and retreat the farm fall"

### Task 4: Draw the wetland, the highland and both falls

**Files:**
- Modify:
  - `src/world/water/PieceWater.tsx`;
  - `src/world/water/build.ts` (`precompileWater`);
  - `src/world/water/load.ts` (`DRAWN` adds `'fall'`);
  - `src/world/water/pondDressing.ts` (`MAIN_FALL_MIST`);
  - `src/world/Water.tsx:276-301` (`StreamFall` takes `mode`);
  - `src/world/MainIsland.tsx:118-132`;
  - `src/world/WildIsles.tsx:182-212` and `:301-320`;
  - `src/game/features.ts:59` (the doc comment covers every piece);
  - `e2e/water.spec.ts`, whose expectations gain the farm fall.
- Test: `build.test.ts`, `pondDressing.test.ts`, `load.test.ts`

**Interfaces:**
- **Consumes:** Tasks 1–3.
- **Produces:**
  - **`PieceWater({ piece, legacy }: { piece: WaterPieceId; legacy: ReactNode })`:**
    - it draws `legacy` while loading, after a failure, or once it gave up;
    - per piece: its own load, build, `watchWaterPrograms` and give-up;
    - after a build it calls `precompileWater` with R3F's `gl`, `camera` and `scene`.
  - **`precompileWater(built: BuiltWater, renderer: Pick<THREE.WebGLRenderer, 'compileAsync'>, camera: THREE.Camera, scene: THREE.Object3D): Promise<void>`:** one `compileAsync(built.root, camera, scene)`, with a rejection swallowed (I8).
  - **`MAIN_FALL_MIST: readonly [number, number, number]`:** the `mist_fall` node of `water_main.glb`, [−7.63946, −8.15389, 6.49781].
  - **`StreamFall({ waterfall, mode }: { waterfall?: boolean; mode: DressingMode })`:** `legacy` draws today's sheet and mist exactly. `v2` draws no sheet, and today's four mist blobs in the same cluster, centred on `MAIN_FALL_MIST` instead of 4.6 u under the rim.
  - **MainIsland, with the switch on:**
    - `<PieceWater piece="main" legacy={<><PondWater /><StreamWater /></>} />`;
    - `<StreamFall waterfall={waterfall} mode={pondDrawn ? 'v2' : 'legacy'} />`;
    - the dressing and bridge as now.
  - **Wetland, with the switch on:**
    - `<PieceWater piece="wetland" legacy={docked ? <the legacy Lake, two Brooks and Fall /> : null} />`;
    - `LilyPads` and `Jetty` drawn when `docked || useWaterDrawnV2('wetland')`.
  - **Highland, with the switch on:** `<PieceWater piece="highland" legacy={docked ? <Lake {...HIGHLAND.tarn} /> : null} />`.
  - **With the switch off,** both isles draw exactly as today.

- [ ] **Step 1: Write the failing tests.**
  - **load.test:**
    - `'loads each piece’s surfaces'` now includes `water_fall` for main and the wetland;
    - `it('fits the spec’s budgets')`:
      - the three maps' bytes × 4/3 plus the noise × 4/3 are ≤ 1.5 MB;
      - the `.bin` downloads are ≤ 0.8 MB, and the GLBs ≤ 150 KB;
      - the drawn bodies' triangles, from `glbMeshes` without the skirts, are ≤ 4,000 (761 today);
      - the drawn bodies plus MAIN's 4 mist blobs are ≤ 12.
  - **pondDressing.test:** `it('stands the farm fall’s mist at the art’s mist node')`: `MAIN_FALL_MIST` equals `glbRootNodes('public/models/water_main.glb').mist_fall`, ±1e-4.
  - **build.test:** `it('builds the hidden bodies’ shaders ahead, once')`: a stub renderer's `compileAsync` is called once with `(built.root, camera, scene)`, and a rejection doesn't throw.
- [ ] **Step 2: Run the tests.** Expect FAIL.
- [ ] **Step 3: Implement**, and update `e2e/water.spec.ts`'s main-only expectations:
  - `data-water` is `main:v2:pond,fall`;
  - `bodies`, `compiled` and `shown` include `main:water_fall`; compare sorted.
- [ ] **Step 4: Verify.**
  - `npx tsc -b` and `npm test` pass;
  - on desktop, under flock: `e2e/water.spec.ts`, `e2e/wild-isles.spec.ts`, `e2e/isles.spec.ts` and `e2e/composition.spec.ts`;
  - one render at 14:30 of a farm with the wetland and highland docked: the lake, river seam, falls, tarn and spring are drawn, with no hole and no doubled fall. Look at it.
- [ ] **Step 5: Commit.** "Draw the wetland's lake, river and fall, the highland's tarn and spring, and the farm fall from the baked water"

### Task 5: The dusk floor

**Files:**
- Create: `src/world/water/dusk.ts`, `src/world/water/dusk.test.ts`
- Modify:
  - `src/world/water/waterMaterial.ts` (the second patch);
  - `src/world/water/driver.ts` (export `SPEEDS`; `stepWater` writes the floor and the sky mix; the falls' glow per registered fall);
  - `src/world/water/waterMaterial.test.ts`, whose declared-uniforms list allows `uWaterFloor`;
  - `src/world/water/driver.test.ts`.

**Interfaces:**
- **Consumes:** `SkyState` and `skyAt` (`src/world/skyPalette.ts`), Task 3's registry, and `addPatch`.
- **Produces:**
  - **`dusk.ts`:**
    - **`daylight(sky: SkyState): number`:**
      - `E(s) = s.sunI × lum(s.sun) × max(s.lightDir.y, 0) + s.hemiI × lum(s.hemiSky)`, where `lum = 0.2126 r + 0.7152 g + 0.0722 b`;
      - the result is `clamp01((E(sky) − E(skyAt(0))) / (E(skyAt(13)) − E(skyAt(0))))`;
    - `FLOOR_KEYS = [[0, 0.24], [0.1, 0.34], [0.3, 0.38], [0.6, 0]] as const`, and `waterFloorAt(day: number): number`, linear between the keys and 0 above 0.6;
    - `NIGHT_SKY_MIX = 0.6`, and `skyMixShareAt(day) = 0.6 + 0.4 × min(1, day / 0.3)`;
    - `FALL_GLOW_NIGHT = 0.4`, and `fallGlowAt(day) = 0.4 + 0.6 × min(1, day / 0.3)`;
    - `duskUniforms: { uWaterFloor: IUniform<number> }`, one object for the session;
    - **`patchWaterFloor(fragmentShader: string): { fragmentShader: string; applied: boolean; misses: string[] }`:**
      - only on a shader the water patch changed (it holds `wFoamOut`); otherwise it is unchanged, with `applied: false` and no misses;
      - it inserts `uniform float uWaterFloor;` after `#include <common>`, and the floor after `#include <envmap_fragment>`, so it runs before WATER_LIGHT's Fresnel. Each anchor must occur exactly once, or it's a miss;
      - a second patch is refused.

    The floor's GLSL (the scale keeps the light's hue, and the bands keep their ratios):
    ```glsl
    {
      float wLum = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );
      float wFloor = uWaterFloor * dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      outgoingLight = wLum > 1e-4 ? outgoingLight * max( 1.0, wFloor / wLum ) : diffuseColor.rgb * uWaterFloor;
    }
    ```
  - **`createWaterMaterial`** adds `addPatch(material, 'water-floor', …)` after the water patch, assigning `duskUniforms`; a miss is listed as in Task 2.
  - **`stepWater`:** with `d = daylight(sky)`, `duskUniforms.uWaterFloor.value = waterFloorAt(d)` and `shared.uSkyMix.value = WATER_LOOK.skyMix × skyMixShareAt(d)`.
  - **`driveWater`:** each registered `fall` body gets `material.emissiveIntensity = fallGlowAt(d)`.

- [ ] **Step 1: Write the N4 drift test first** (`driver.test`, `it('matches the look presets')`). For every preset in `art/config/lookPresets.json`:
  - `water.{shoreBand, foamLine, skyMix, glint, caustics}` equal `WATER_LOOK`;
  - `water.{normalSpeed, riverFlowSpeed, fallStreakSpeed}` equal `SPEEDS`;
  - `water.bands.{shallow, deep}` and `water.bandSoft` equal water.json's `layers`.

  It fails only on the missing `SPEEDS` export. Export it, see it pass, and commit: "Hold the water's look and speeds to the look presets".
- [ ] **Step 2: Write the failing tests.**
  - **dusk.test:**
    - `daylight(skyAt(13))` is 1; `skyAt(2)` and `skyAt(22.6)` are 0; 16.6 is in [0.55, 0.85], 19.1 in [0.2, 0.45] and 20.1 in [0, 0.15];
    - it never rises between 13:00 and 20:54, in 0.1 h steps. At 21:00 `skyAt` swaps to the night light's direction, a small bump the floor follows like the rest of the scene;
    - `waterFloorAt` is 0.24 at 0, 0.34 at 0.1, 0.38 at 0.3, 0.19 at 0.45, and 0 at 0.6 and 1;
    - `it('never lifts the water past half its noon brightness')`: the largest key is ≤ 0.5 × E(skyAt(13)) / π;
    - `patchWaterFloor` on a water-patched lambert gives: `uWaterFloor` declared once, `#include <envmap_fragment>` < the floor < WATER_LIGHT's first line < `#include <opaque_fragment>`, and `applied` true;
    - plain Lambert is left unchanged, a second patch is refused, and a stub without `#include <envmap_fragment>` lists the miss.
  - **waterMaterial.test:**
    - `it('lays the floor on after the water')`: the key ends in `|water-floor`, and `shader.uniforms.uWaterFloor === duskUniforms.uWaterFloor`;
    - the Fader copy shares it (Review Focus 4).
  - **driver.test:**
    - `it('keeps midday as it was, and lifts the floor and eases the sky at night')`:
      - `skyAt(13)` gives floor 0, `uSkyMix` 0.25 and a fall's `emissiveIntensity` 1;
      - `skyAt(22.6)` gives 0.24, 0.15 and 0.4;

      This replaces `'leaves the look values alone'` for `uSkyMix`; the rest stay alone.
    - `it('changes no program across the day')`: a material's `customProgramCacheKey()` is the same after stepping 13 → 22.6.
- [ ] **Step 3: Run the tests.** Expect FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Verify.**
  - `npx tsc -b` and `npm test` pass, and `e2e/water.spec.ts` passes on desktop.
  - Renders, in the scratchpad (`water/renders-isles/floor/`), of a farm with the wetland and highland docked:
    - the default camera, desktop 1440×900 and the Pixel 7 profile;
    - at 13:00, 19:06, 20:36 and 22:36;
    - this commit against Task 4's.
  - Look at every one. At 13:00 they must match. At dusk and night the bands must read (shallow, mid, deep), with the water lighter than the grass beside it and darker than today's legacy water.
  - If the night water outshines the lantern-lit paths, or the deep core is lost, move `FLOOR_KEYS` within ±0.08, re-render, and report the values used.
- [ ] **Step 6: Commit.** "Give the water a dusk floor, and ease its sky and its falls' glow at night"

### Task 6: Every piece end to end, on desktop and phone

**Files:**
- Modify: `e2e/water.spec.ts`. `refuseWaterShader(page, marker = 'uWaterMap')` takes the source marker.

**Interfaces:** consumes Tasks 1–5 through `data-water`, `data-docked` and `window.__water`.

- [ ] **Step 1: Write the failing e2e**, using `wellOff` from `e2e/wild-isles.spec.ts` (move it to `e2e/fixtures.ts`):
  - `test('every piece the farm has is drawn from the baked water')`:
    - `farm.load(wellOff({ wetland: 1, highland: 1 }))`;
    - `data-water` becomes `main:v2:pond,fall wetland:v2:lake,river,fall highland:v2:tarn,spring`, and `data-water-tier` is the device's;
    - the readout's sorted `bodies` are those 7, `misses` is `[]`, and `shown` is all but `main:water_fall`;
    - `compiled` comes to contain every shown body;
    - no water warnings.
  - `test('the wetland’s water runs on from the farm once it docks')`:
    - `wellOff()` shows `main:water_fall` in `shown`, and nothing of `water_wetland` or `water_highland` is requested;
    - buy the wetland: `water_wetland.map.bin` is requested, and `data-docked` becomes `wetland`;
    - poll `shown`, 60 s (the water clock moves at most 0.25 s a frame): it includes `wetland:water_lake`, `wetland:water_river` and `wetland:water_fall`, and not `main:water_fall`.
  - `test('a piece whose map is missing falls back alone')`:
    - abort `**/water_wetland.map.bin`;
    - `wellOff({ wetland: 1, highland: 1 })` gives `main:v2:pond,fall wetland:legacy highland:v2:tarn,spring`;
    - one warning, containing `wetland`.
  - `test("a piece whose shader the GPU can't build falls back alone")`:
    - `refuseWaterShader(page, '#define WATER_RIBBON')`;
    - the same farm settles to the same `data-water`, with one warning `wetland … can't be drawn`.
- [ ] **Step 2: Run the tests.** On desktop, under flock, expect them to FAIL where the behaviour is missing. If they pass at once, break the behaviour by hand (for example, skip the river's registration) and see them fail.
- [ ] **Step 3: Make them pass.** The behaviour belongs to Tasks 1–5. A failure here is a bug in the owning task's file, fixed there red-green, with a unit test beside the e2e.
- [ ] **Step 4: Verify.**
  - `e2e/water.spec.ts` passes with `--repeat-each=3` on desktop, and on mobile (`--project=mobile`);
  - then `npm run check:push` passes: types, unit, and the full e2e on both projects.
- [ ] **Step 5: Commit.** "Test every piece's water end to end, its run on dock, and a piece falling back alone"

### Task 7: Budgets, the A/B, the renders and the owner's look check

**Files:** none committed, unless a gate forces a cut. The scripts stay in the scratchpad: `water-sdd/ab/ab.cjs` and `render.cjs`, adapted.

- [ ] **Step 1: The A/B** (spec §5, the previous plan's P5 method):
  - origin/main (the switch off, so legacy everywhere) against this branch;
  - a farm with every piece docked (ab.cjs's `PIECES`), motion `full`, at 14:30 and 22:36;
  - the default camera, the pond close-up and a lake close-up (world about (−6.9, −0.3, 17.4));
  - 5 runs of 10 s: median and p95 of the render CPU time, and the GPU time where `EXT_disjoint_timer_query_webgl2` exists;
  - desktop, and the mobile profile at 4× throttle;
  - the water's draw calls from the scene graph in three states: no wetland; the wetland rising (bought in-page, sampled mid-rise); all docked.

  **Gates:** desktop Δ ≤ +0.3 ms (GPU ≤ +0.3 ms), mobile Δ ≤ +1.0 ms, ≤ 12 water draws in all and ≤ 10 at once. If one fails, cut in the spec's order (glints, then the second noise scroll, then the water's shadows), commit the cut with its test, and report it.
- [ ] **Step 2: The renders,** to `water/renders-isles/final/`:
  - the default camera plus two orbits (default azimuth ± 0.8 rad);
  - desktop 1440×900 and the Pixel 7 profile;
  - at 13:00, 19:06, 20:36 and 22:36;
  - the wetland and highland docked, on the branch and on origin/main (legacy);
  - close-ups at 20:36 of the lake, the river at the MAIN seam, and the wetland fall;
  - frames 0, 1, 2.5, 3.5 and 4.5 s after the wetland docks, from the default camera.
- [ ] **Step 3: Look at every render** against the multi-angle rule. Note for the owner where the new water sits against the grass and the legacy at each hour.
- [ ] **Step 4 (controller):**
  - the whole-branch review;
  - merge origin/main if it moved;
  - `npm run check:push`.
- [ ] **Step 5 (controller, with the owner's go-ahead):**
  - push `feat/water-on`, and update #74's text: the scope, the rulings, the A/B table, the budgets (about 0.90 MB of textures with mips, 674 KB of `.bin`, 40 KB of GLB, 761 triangles, the draw counts) and the render paths;
  - bring up the share link with `water-sdd/share-branch.sh`;
  - the owner looks on the phone at dusk, with the wetland and highland raised;
  - take the link down with `share.sh down`.

  #74 merges only on the owner's word.
