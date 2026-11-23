# Water PR 2: the material and the pond. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the farm pond and its stream, one seamless surface, are drawn by the game from the art's baked water data, with the new painterly water material (posterised depth bands, foam, sky Fresnel and glints, ambient ripple rings). It sits behind a `water` switch, which the follow-up PR switches ON (see the owner's decision below), and today's water is the automatic fallback.

**Owner decision 2026-10-25, "Merge off, tune next":**
- the PR merges with the `water` switch OFF, so players keep today's pond; a look pass with the art session follows next (brightness in the game's lighting, the sky reflection, a dusk floor), and the switch goes on once the owner is happy with fresh renders;
- `e2e/water.spec.ts`'s ON tests skip while the switch is off, and one test that runs only while it is off pins that nothing of the water is fetched, drawn or reported;
- the Fallbacks gain the `PIECE_TIMEOUT_MS` give-up: a load that takes longer than the ground's own wait times out, and the pond falls back to today's.
- Later on 2026-10-25, after PR #69 had merged with the switch off, the owner saw the in-game renders and chose to switch it on. The switch-on lands in a follow-up PR (feat/water-on), not in #69; dusk tuning follows as a small PR after it.
  - So in the follow-up PR the `water` switch is ON: the ON tests run, and the off-only test skips but stays, to guard a switch back off.
  - With the switch on for everyone, the Fallbacks gain a shader the GPU can't build (below).

**Architecture:**
- **Shared core:** the art's shader library (`art/scripts/lib/water-core.mjs`) reaches the game as a generated TypeScript copy, with a drift test, as the blueprint and the composition already do. Its two functions are ported by hand and checked against the original.
- **The material:** each water body gets one `MeshLambertMaterial`, patched through a new `addPatch` helper (LOOK-PORT's API).
- **The pond:** `<PieceWater piece="main">` loads `water.json`, MAIN's map and the noise, and the `water_pond` mesh from `water_main.glb`.
- **The driver:** `WaterDriver` feeds the shared uniforms. Phases are wrapped on the CPU and held in still mode.
- **What stays legacy:** wetland and highland water, and MAIN's waterfall, until PRs 3 and 5.

**Tech Stack:** TypeScript, React Three Fiber, three.js 0.186.x (`MeshLambertMaterial.onBeforeCompile`), vitest (`TZ=UTC vitest run`), Playwright.

**Spec:** `art/specs/2026-10-23-water-revamp-design.md` on main. Read these sections:
- §3 (look) and §4.2 (game);
- §5 (budgets);
- §6, the row "2. Material and the pond";
- Revision 1: R1.3 (one surface), R1.5 (ripples) and R1.6 (already done on main).

## Global Constraints

- **No new dependencies.** three stays at `^0.186.1`.
- **Material:**
  - one `MeshLambertMaterial` per body, patched through `onBeforeCompile` with water-core's `patchWaterLambert`, keyed through `addPatch`;
  - one draw call per body, with no render targets and no extra passes;
  - `userData.celKind = 'none'`.
- **Mesh settings:** `transparent: true`. The still surface has `depthWrite: true` and `renderOrder: 2`. It never casts shadows, and receives them only on the mid tier.
- **Textures:**
  - maps are RGBA8 `DataTexture`s: `NoColorSpace`, linear filtering with mipmaps, `ClampToEdgeWrapping`, `unpackAlignment = 1`;
  - the noise is RG8 with `RepeatWrapping`.
- **Texture reads per water pixel:** phone ≤ 3, mid ≤ 6.
- **Tiers:**
  - **phone** when `(pointer: coarse)` matches and the screen's short side is ≤ 820 px, the same rule as `farEverywhere` (`PHONE_SHORT_SIDE = 820`); otherwise **mid**;
  - `?water=phone|mid` overrides it.
- **Phases:** `(t × speed) mod period`, wrapped on the CPU in float64, using water-core's `waterPhases`. In still motion the phases hold. The water never requests frames; the Ticker owns the frame rate.
- **Look values** not carried in `water.json`: `shoreBand 0.35`, `foamLine 0.5`, `skyMix 0.25`, `glint 0.6`, `caustics 0.35` (the lookPresets schema defaults). `bands [0.08, 0.22]` and `bandSoft 0.015` come from `water.json` `layers`.
- **Sky:** `uSkyZenith ← sky.current.top`, `uSkyHorizon ← sky.current.mid`, copied each frame. These are already linear Colors.
- **Fallbacks:**
  - **the `water` switch is off:** today's `Water.tsx` exactly;
  - **MAIN's JSON, GLB or map fails to load:** today's pond and stream for MAIN, with exactly one `console.warn`;
  - **the load stalls:** after `PIECE_TIMEOUT_MS` (the ground's own wait) whatever is still coming is cancelled and the load fails like any other: one `console.warn`, then today's pond, and the world's models never wait on it for good;
  - **the GPU can't build the water's shader** (a phone's driver that fails to compile or link it): after the pond's first draw, three's program for it is checked, on a draw with its own material (its `diagnostics.runnable`, kept while `checkShaderErrors` is on, three's default; or no program at all). A broken one gives the water up for the session the way a failed load does: one `console.warn`, then today's pond, and `data-water` says `main:legacy`; once today's pond is drawn, the water's mesh, map and noise are disposed. `window.__water.compiled` lists the bodies whose program built;
  - **while loading:** today's water stays until the new pond is ready. The world asks for the water as it mounts, with the ground, so it counts among the models (`data-models`) from before the farm is drawn;
  - **patch anchors missing:** plain Lambert in the body's mid colour, the misses listed in `window.__water.misses`, and a failing vitest.
- **The legacy code** stays; PR 6 deletes it after the owner's sign-off.
- **Repo rules:**
  - never `git add` art/ or public/models/;
  - never force-push or merge;
  - the commit trailer is `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - red first for every test;
  - e2e runs locally on desktop and mobile (the pre-push hook runs `npm run check:push`); CI runs only unit and rust.

## Rulings

- **P1, the shared core:**
  - the GLSL strings and constants are generated into `src/world/water/core.gen.ts` by `scripts/water-core.mjs` (`--check` mode, like `scripts/blueprint.mjs`);
  - `waterPhases`, `patchWaterLambert` and `bodyColours` are ported by hand to `src/world/water/core.ts`;
  - a drift test runs the original from `art/scripts/lib/water-core.mjs` beside the ports and compares outputs.
  - **Why:** the game doesn't import `art/` at runtime today; the generated-copy pattern exists.
  - **Cost if wrong:** one generated file.
- **P2, `addPatch`:**
  - `src/world/look/patch.ts` exports `addPatch(m, key, fn)` exactly as LOOK-PORT step 2 specifies (`art/LOOK-PORT.md` l.128; the reference is `arch-scene.js` l.73-80);
  - only the water uses it in this PR; `wind.ts` and `storeLinear` move later, with LOOK-PORT.
- **P3, what the switch replaces on MAIN:**
  - **drawn by `PieceWater`:** the water blob, the bank disc, the stream ribbon and the stream's mud ribbon;
  - **kept:** the waterfall plane, its mist and the bridge, drawn as now, plus the stones, pads and reeds, re-placed for the Teardrop.
  - **Why:** spec §4.2 ("The stones, pads, reeds and bridge stay. The mud bank ribbons and the pond's bank disc go"). The falls are PR 5.
- **P4, the `data-water` format:** `main:v2:pond` when the new pond is drawn, otherwise `main:legacy`. Plus `data-water-tier="phone|mid"`.
  - **Why:** the spec's example names a `stream` body, which doesn't exist (R1.3), and the fall stays legacy until PR 5. Wetland and highland join the string in PR 3.
- **P5, the frame-time A/B** is a one-off measurement script in the scratchpad, not committed. No committed probe exists (`art/ART-TOOLING.md` l.113; planned as G10), so the numbers go in the PR description.

## Review Focus

1. **A slow or failed download** (a 404 on `water_main.map.bin`) shows today's pond, never an empty hole, and warns once. The test is in Task 3.
2. **Still motion** freezes the water: the phases don't move and the water requests no frames. The test is in Task 4.
3. **A session left open for days:** the phases stay bounded and smooth at t = 10⁷ s. The test is in Task 4.
4. **A three patch release changes the Lambert chunks:** the anchor test fails loudly, and the game draws plain Lambert, not a broken shader. The test is in Task 2.
5. **A touchscreen laptop** (coarse pointer, large screen) gets the mid tier, and a phone gets phone. The test is in Task 4.

---

### Task 1: The shared water core in the game

**Files:**
- Create:
  - `scripts/water-core.mjs`: the generator, with a `--check` mode;
  - `src/world/water/core.gen.ts`: generated, do not edit;
  - `src/world/water/core.ts`: the hand ports;
  - `src/world/water/core.test.ts`.
- Modify: `package.json`, adding the script `"water-core": "node scripts/water-core.mjs"`.

**Interfaces (produces):**
- **`core.gen.ts`:**
  - `WATER_FORMAT`, `TEXEL`, `NOISE_SIZE`;
  - `BANDS`, `BAND_SOFT`, `NOISE_CELL`, `PHI`, `FLOW_CYCLE`, `PHASE_PERIODS`, `PHASE_USES`;
  - `TIERS`, `PALETTES`, `BODY_PALETTE`, `RIPPLE`, `RIPPLE_BODIES`, `WATER_UNIFORMS`;
  - `WATER_VERT_PARS`, `WATER_VERT`, `WATER_FRAG_PARS`, `WATER_COLOR`, `WATER_LIGHT`, `WATER_ANCHORS`.
  
  Each is a `const` literal with the exact evaluated value from water-core.
- **`core.ts`:**
  - `waterPhases(t: number, speeds: { normalSpeed: number; riverFlowSpeed: number; fallStreakSpeed: number }): WaterPhases`;
  - `patchWaterLambert(vertexShader: string, fragmentShader: string, opts: PatchOpts): { vertexShader: string; fragmentShader: string; applied: boolean; misses: string[] }`, where `PatchOpts = { kind: 'still'|'ribbon'|'fall'; tier: 'phone'|'mid'; flow?: boolean; join?: boolean; brink?: boolean; vhead?: boolean; ripple?: boolean; debug?: number }`;
  - `bodyColours(presetWater: Record<string, unknown>, json: WaterJson, palette: string)`;
  - `decode(r, g, b, a): { depth: number; sd: number; flow: [number, number] }`.
  
  The behaviour is exactly the art original's.

- [ ] **Step 1: Write the failing tests** in `core.test.ts`:
  - **`it('matches water-core byte for byte')`:** import the original with a test-local ambient declaration for `*/water-core.mjs`; every generated export `toEqual`s the original's.
  - **`it('is regenerated from water-core')`:** run `node scripts/water-core.mjs --check` (exit 0), as `blueprint.test` does.
  - **`it('phases match the original')`:** for t in `[0, 1.5, 59.9, 3600, 1e7]` and the default speeds from `water.json`/lookPresets, `waterPhases` deep-equals the original's.
  - **`it('patches like the original')`:**
    - for every kind (`still`, `ribbon`, `fall`) × tier (`phone`, `mid`) × the flags the bodies use (`flow`, `join`, `brink`, `vhead`, `ripple`), on `THREE.ShaderLib.lambert` from the installed three;
    - the ported `patchWaterLambert` output equals the original's;
    - `applied` is true and `misses` is empty.
  - **`it('refuses a second patch')`:** patching the output again returns `applied: false`.
- [ ] **Step 2: Run the tests.** `npm test -- src/world/water/core.test.ts`. Expect FAIL (no module).
- [ ] **Step 3: Write the generator** (import the `.mjs`, serialise with `JSON.stringify` per export, header "generated by scripts/water-core.mjs, do not edit") **and the ports.**
- [ ] **Step 4: Verify.** The tests pass; `npx tsc -b` and `npm test` pass.
- [ ] **Step 5: Commit.** "Bring the art's water core into the game, with a drift test"

### Task 2: `addPatch` and the water material

**Files:**
- Create:
  - `src/world/look/patch.ts`, `src/world/look/patch.test.ts`;
  - `src/world/water/waterMaterial.ts`, `src/world/water/waterMaterial.test.ts`.

**Interfaces:**
- **Consumes:** Task 1's `patchWaterLambert`, `WATER_UNIFORMS` and `PALETTES`.
- **Produces:**
  - **`addPatch(m: THREE.Material, key: string, fn: (shader: THREE.WebGLProgramParametersWithUniforms, renderer: THREE.WebGLRenderer) => void): boolean`:**
    - a per-material list in a `WeakMap`;
    - `onBeforeCompile` runs the list, and `customProgramCacheKey` joins the keys with `|`;
    - a repeated key returns false; a new one sets `needsUpdate`.
  - **`createWaterMaterial(body: WaterBody, shared: SharedWaterUniforms, maps: { map: THREE.DataTexture; noise: THREE.DataTexture; origin: [number, number]; extent: [number, number] }, tier: 'phone'|'mid'): THREE.MeshLambertMaterial`:**
    - `color` is the palette's mid, with `transparent: true`, `depthWrite: body.kind !== 'fall'` and `celKind: 'none'`;
    - the per-material uniforms are as the proof sets them (`arch-scene.js` l.759-770): `uWaterMap`, `uWaterNoise`, `uMapOrigin`, `uMapExtent`, `uShallow`, `uMid`, `uDeep`, `uFoamCol`, `uBed`, `uVirtual`, `uUStart`, `uLength`, `uFill = 1`, `uJoin` (plus the second palette for `join`), `uRippleDensity`, `uRippleShore`;
    - shared uniform objects are passed by reference;
    - the patch key is `water:<kind>:<tier>:<flow>:<join><brink><vhead><ripple>`.
  - **On `applied: false`:** the material is left as plain Lambert in the mid colour, and the misses are pushed to `waterReadout().misses`.
  - **`waterReadout(): { tier: string; bodies: string[]; misses: string[] }`:** backed by `window.__water` when `window` exists.

- [ ] **Step 1: Write the failing tests.**
  - **`patch.test.ts`:**
    - two patches run in order;
    - the key joins as `a|b`;
    - a repeat key is refused;
    - a clone that copies `onBeforeCompile` and `customProgramCacheKey` (as `Rising.tsx`'s fader does) gives the same program key and the same shader.
  - **`waterMaterial.test.ts`:**
    - **`it('applies every anchor exactly once on the installed three')`:** run `onBeforeCompile` on a `THREE.ShaderLib.lambert` copy, for still/phone and still/mid, with and without `join` and `ripple`. Every `WATER_ANCHORS` value appears exactly once in the result, and `wFoamOut` is present.
    - **`it('keys the program by kind and tier')`:** the keys differ between phone and mid, and between still and ribbon.
    - **`it('falls back to plain Lambert when an anchor is missing')`:** a stub shader missing `#include <opaque_fragment>` leaves the shader unchanged and records a miss (Review Focus 4).
    - **`it('shares one uniform object across materials')`:** two materials see the same `uScrollA` object.
- [ ] **Step 2: Run the tests.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.** `npx tsc -b` and `npm test` pass.
- [ ] **Step 5: Commit.** "Add addPatch and the patched Lambert water material"

### Task 3: Loading MAIN's water

**Files:**
- Create: `src/world/water/load.ts`, `src/world/water/load.test.ts`

**Interfaces:**
- **Produces:**
  - `type WaterJson`, mirroring `public/models/water.json` (`format`, `encoding`, `noise`, `pieces{pivot, glb, map{file, origin, texel, size}, bodies[]}`, `palettes`, `tiers`, `ripple`, `layers`);
  - `WaterBody` (`node`, `kind`, `palette`, `level`, `virtual`, `flow`, `uStart`, `length`, `ripples`, `join?`, `brink?`, `vhead?`, `fillFrom?`);
  - **`loadWaterPiece(piece: 'main'): Promise<LoadedWater | null>`:**
    - it fetches `models/water.json`, the map `.bin` and `water_noise.bin` (as `pieceLoader.ts` does: `import.meta.env.BASE_URL + 'models/' + file`, `fetch`, `arrayBuffer`), and the piece GLB through `GLTFLoader` (`three-stdlib`);
    - `LoadedWater = { json: WaterJson; bodies: { body: WaterBody; geometry: THREE.BufferGeometry }[]; map: THREE.DataTexture; noise: THREE.DataTexture; origin; extent }`;
    - it returns `null` and warns exactly once if anything fails: a bad `format`, a missing node, a wrong byte length, or a fetch or GLB error;
    - only the `still` / `ribbon` bodies of MAIN that PR 2 draws are kept: `water_pond`;
  - **`makeMapTexture(bytes: Uint8Array, size: [number, number]): THREE.DataTexture`:** RGBA, `NoColorSpace`, `LinearMipmapLinearFilter` / `LinearFilter`, `generateMipmaps`, `ClampToEdgeWrapping`, `unpackAlignment 1`;
  - **`makeNoiseTexture(bytes, size)`:** RG, `RepeatWrapping`, linear filtering.

- [ ] **Step 1: Write the failing tests.** Read the real files from `public/models` with Node `fs`, using `src/world/testing.ts` helpers where useful, and stub `fetch`.
  - `it('loads the pond and stream as one body')`: one body, `water_pond`, kind `still`, with a `join` to `river`; its geometry has positions, normals and uvs.
  - `it('builds the map at 192×128 with the right sampling')`: the texture's format, colour space, filters and wrap match the constraints.
  - `it('returns null and warns once when the map is missing')`: a stubbed 404, then `null`, with a `console.warn` spy called once (Review Focus 1).
  - `it('rejects an unknown format')`.
- [ ] **Step 2: Run the tests.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.** `npx tsc -b` and `npm test` pass.
- [ ] **Step 5: Commit.** "Load MAIN's baked water: the json, the map, the noise and the pond mesh"

### Task 4: The switch, the tiers and the driver

**Files:**
- Create: `src/world/water/tier.ts`, `src/world/water/tier.test.ts`, `src/world/water/driver.ts`, `src/world/water/driver.test.ts`
- Modify:
  - `src/game/features.ts`: `water: true` (merged off at first, then switched on, see the owner's decision under the Goal), with a doc comment;
  - `src/world/Water.tsx`: `WaterDriver` also drives the new uniforms;
  - `src/game/features.test.ts`, if it pins the switch list.

**Interfaces (produces):**
- **`waterTier(coarse: boolean, screen: { width: number; height: number }, search: string): 'phone' | 'mid'`:** `?water=phone|mid` wins; otherwise the `farEverywhere` rule.
- **`useWaterTier(): 'phone' | 'mid'`:** `useMediaQuery('(pointer: coarse)')`, global `screen` and `location.search`.
- **`createSharedWaterUniforms(json: WaterJson): SharedWaterUniforms`:** every shared uniform in `arch-scene.js` l.699-703:
  - the phase uniforms;
  - `uSkyHorizon`, `uSkyZenith`;
  - `uBands`, `uBandSoft`, `uShoreBand`, `uFoamLine`, `uSkyMix`, `uGlint`, `uCaustics`;
  - `uRipplePhase`, `uRippleFlow`, `uRippleClock`;
  - `uRipple[4]`, all zero strength.
- **`stepWater(shared: SharedWaterUniforms, held: { t: number }, dt: number, still: boolean, sky: SkyState): void`:**
  - advances `held.t` by `dt` unless `still`;
  - writes `waterPhases(held.t, speeds)` into the phase uniforms;
  - copies `sky.top` / `sky.mid` into zenith and horizon.
  - `WaterDriver` calls it in `useFrame` with `useMotion() === 'still'`, and never calls `invalidate`.

- [ ] **Step 1: Write the failing tests.**
  - **`tier.test.ts`,** the matrix (Review Focus 5):
    - coarse 412×915 is phone;
    - coarse 1280×800 (a touch laptop) is mid;
    - fine 412×915 is mid;
    - `?water=mid` on a phone is mid;
    - `?water=phone` on a desktop is phone;
    - a junk value is ignored.
  - **`driver.test.ts`:**
    - `it('holds the phases in still motion')`: the same uniform values after a `dt` of 5 s (Review Focus 2);
    - `it('keeps phases bounded at t = 1e7')`: every phase is finite, within its period, and continuous over a small step (Review Focus 3);
    - `it('follows the sky')`: after `stepWater` with a night `SkyState`, `uSkyZenith` equals `sky.top`.
- [ ] **Step 2: Run the tests.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.** `npx tsc -b` and `npm test` pass.
- [ ] **Step 5: Commit.** "Add the water switch, its phone and mid tiers, and a driver that holds still"

### Task 5: The new pond on MAIN, and its dressing

**Files:**
- Create: `src/world/water/PieceWater.tsx`, `src/world/water/pondDressing.ts`, `src/world/water/pondDressing.test.ts`
- Modify:
  - `src/world/Water.tsx`: split `Pond` into its water and its dressing, and `Stream` into its water, its fall and mist, and the bridge, so each part can be mounted alone. With the switch off, the legacy output is unchanged;
  - `src/world/MainIsland.tsx` l.112-113: mount `PieceWater` plus the dressing, or legacy, per the switch and the load state.

**Interfaces:**
- **Consumes:** Tasks 2–4.
- **Produces:**
  - **`<PieceWater piece="main" />`:**
    - it calls `loadWaterPiece` once;
    - while loading, or after a failure, it renders the legacy pond water, bank, stream ribbon and mud;
    - once ready, it renders the `water_pond` mesh (`renderOrder 2`, `receiveShadow = tier === 'mid'`, `castShadow false`) at MAIN's pivot;
    - it registers itself in `waterReadout().bodies` and reports `main:v2:pond` or `main:legacy` (Task 6 reads it).
  - **`pondDressing(mode: 'legacy' | 'v2'): { stones: { x; z; r; rot }[]; pads: { x; z; r; blossom }[]; reeds: { x; z; h }[]; bridge: { x; z; rot } }`:**
    - `legacy` returns today's numbers exactly;
    - `v2` places them for the Teardrop:
      - 11 stones on the shore band, 0.10–0.35 outside `POND_SHORE`, none within 0.4 of the stream's mouth or over `STREAM_LINE`;
      - 3 pads at least 0.3 inside the shore and 0.5 from each other;
      - 7 reeds 0.05–0.25 inside the shore, on the side away from the stream;
      - the bridge at the art's stream bridge point (−5.7089, 5.5385), turned across `STREAM_LINE` there.
- **Note:** MAIN never rises, so the Fader isn't involved until PR 3.

- [ ] **Step 1: Write the failing tests** in `pondDressing.test.ts`:
  - `it('keeps the legacy dressing exactly')`;
  - the v2 rules above, each as its own `it`, using `POND_SHORE` and `STREAM_LINE` from `layout.ts`;
  - `it('keeps the dressing off the ducks' rings and the blockers' cover')`: the pads clear the duck rings by at least 0.2, and no stone sits inside `WATER_BLOCKERS`' water cover.
- [ ] **Step 2: Run the tests.** Expect FAIL.
- [ ] **Step 3: Implement** `pondDressing`, the `Water.tsx` split and `PieceWater`, and wire them in MainIsland.
- [ ] **Step 4: Verify.** `npx tsc -b` and `npm test` pass. Run `e2e/composition.spec.ts` and `e2e/isles.spec.ts` on desktop, under flock: nothing else moved.
- [ ] **Step 5: Commit.** "Draw the farm pond and stream as one baked surface, with its stones, pads and reeds on the new shore"

### Task 6: Reporting, e2e, renders and the frame-time check

**Files:**
- Modify: `src/world/World.tsx`: `data-water` and `data-water-tier` on `[data-testid=world]`, store-fed like `data-pieces`, from `PieceWater`'s report and `useWaterTier()`.
- Create: `e2e/water.spec.ts`

**Interfaces:** consumes Task 5's report and Task 4's tier.

**Switched on in the follow-up PR:** the ON tests below run, now that the `water` switch is on (they skipped while it was merged off). A further test runs only while it is off, so it skips now and stays to guard a switch back off: it loads a farm and asserts that no `/models/water` file is requested, that `data-water` and `data-water-tier` are empty, and that `window.__water` is undefined. With the switch on, `test("a water shader the GPU can't build falls back to the old pond")` joins them: the page refuses the link of any program reading `uWaterMap`, and the pond falls back with one warning.

- [ ] **Step 1: Write the failing e2e** in `e2e/water.spec.ts`, using `e2e/fixtures.ts`:
  - `test('the pond is drawn from the baked water')`: a fresh farm, then `data-water` becomes `main:v2:pond`. `data-water-tier` is `mid` on the desktop project and `phone` on mobile.
  - `test('?water=phone forces the phone tier')`: desktop only, open `/?water=phone`, and `data-water-tier` is `phone`.
  - `test('a missing map falls back to the old pond')`:
    - `page.route('**/water_main.map.bin', r => r.abort())`;
    - `data-water` is `main:legacy`;
    - the page still shows the world;
    - exactly one console warning mentions water.
- [ ] **Step 2: Run the tests.** `flock /tmp/gitaway-e2e.lock env E2E_PORT=<port> npx playwright test e2e/water.spec.ts`. Expect FAIL.
- [ ] **Step 3: Implement the attributes.**
- [ ] **Step 4: Verify.**
  - `e2e/water.spec.ts` passes on desktop and mobile with `--repeat-each=3`;
  - then `npm run check:push` passes (types, unit, and the full e2e on both projects).
- [ ] **Step 5: Renders for the owner.**
  - Screenshots in the full motion level: the default desktop camera, the phone default, and at least 3 orbit angles of the pond and stream, including one close-up.
  - Each at midday and at dusk, with the switch on and off for comparison.
  - Save them to the scratchpad, and look at every one before reporting: banding, foam on the shore, ripple rings, the seamless pond-to-stream join, and no pale band at the junction.
- [ ] **Step 6: The frame-time A/B** (P5), as a scratchpad Playwright script, not committed:
  - main against this branch, on a farm seeded with every piece docked;
  - motion `full`, the default camera and a pond close-up;
  - 10 s per run, 5 runs;
  - measure the median and p95 of the CPU time of `WebGLRenderer.render`, by wrapping the prototype from `page.addInitScript`, and the GPU time through `EXT_disjoint_timer_query_webgl2` where present;
  - report `renderer.info` draw calls and triangles.
  - **Gates:** desktop median Δ ≤ +0.3 ms (GPU Δ ≤ +0.3 ms), and on the mobile project with 4× CPU throttling a median Δ ≤ +1.0 ms. Water draw calls ≤ 12. If a gate fails, cut in the spec's order (glints first, then the second noise scroll), and report it.
- [ ] **Step 7: Commit.** "Report the water in the world element, and test the pond end to end"

**After Task 6:**
- run the whole-branch review;
- the PR description carries the renders' paths, the A/B table and the budgets: draw calls, texture memory (MAIN's map with mips plus the noise), and the downloads.
