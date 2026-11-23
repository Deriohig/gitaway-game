# Porting the Worldseed look into the game

> **Pointer (2026-10-24).** Still the step-by-step for the game to adopt the approved look; [ART-BIBLE.md](ART-BIBLE.md) §D is the summary and [ART-PLAN.md](ART-PLAN.md) P1-1 schedules it. Step 5 (plant materials) is superseded by the painterly trees, as noted inside.

The art session wrote this for the game session on 2026-10-19. It explains how to bring the art proof's look into the game, following the Worldseed art direction ([config/WORLDSEED-BRIEF.md](config/WORLDSEED-BRIEF.md), which absorbs [config/LOOK-BRIEF.md](config/LOOK-BRIEF.md)). Every value comes from `config/lookPresets.json`, and every function named here was read in the code. Where the game code leaves something open, the brief says so.

**Sources read.**
- Art, on `origin/main` @ `1279e86`: `config/lookPresets.json` and `lookPresets.schema.json`, `config/TUNING.md`, `scripts/lib/look-core.mjs`, `scripts/lib/arch-scene.js`, `scripts/lib/plants.mjs`, `scripts/lib/bake.mjs` and `config/look.config.mjs`.
- Plants: `origin/art/composition` @ `95f677c` (not merged): `scripts/lib/composition.mjs` and that branch's `BLUEPRINT.md`.
- Game, on `origin/main`: `World.tsx`, `DayCycle.tsx`, `skyPalette.ts`, `skyRef.ts`, `Backdrop.tsx`, `SkyArt.tsx`, `materials.ts`, `assetMaterials.ts`, `Asset.tsx`, `Water.tsx`, `MainIsland.tsx`, `Nature.tsx`, `wind.ts`, `Rising.tsx`, `Fireflies.tsx`, `Farmhouse.tsx`, `framing.ts` and `styles/app.css`.
- Game, on the open branch `origin/feat/dock-islands` @ `e1f3e41`: `DayCycle.tsx`, `World.tsx`, `materials.ts`, `framing.ts` and `pieceLoader.ts`.
- Installed versions: three 0.186.1 and @react-three/fiber 9.8.2.

## 1. The goal

The Worldseed look is a handcrafted floating diorama. A low, warm sun rakes across the island and casts long shadows, and the shade is cool violet rather than black. Lighting falls in soft cel bands with a warm rim. A painted sky stands over a sea of cream-and-periwinkle clouds. The island's underside melts into the haze, and a thin plum ink line traces the silhouettes. Contrast comes from light and hue, not saturation.

The proof does all of this with Lambert materials, one patched lighting chunk, one sky shader and one optional fullscreen pass, all on three r186 WebGL2, the same renderer the game uses. The table compares the proof's default mood (`Golden afternoon`) with the game today.

| Area | Proof (`Golden afternoon`) | Game today (`origin/main`) |
|---|---|---|
| Tone mapping and output | `NeutralToneMapping`, exposure 1.05 (Dusk 1.1), sRGB output. Tone mapping and sRGB encoding each happen once: the renderer does both on the LOW tier, the composite pass on the HIGH tier. | `<Canvas flat>`, so `NoToneMapping`; sRGB output; transparent canvas (`alpha: true`, clear alpha 0); `dpr={[1, 1.75]}`. |
| Material model | `MeshLambertMaterial` on everything opaque. GLBs are converted on load by `toLambert()` in `arch-scene.js`. | Procedural meshes are Lambert (`mat()`, `vertexMat` with flat shading, `windMaterial`). GLB models keep the loader's `MeshStandardMaterial`: `gameMaterial()` in `assetMaterials.ts` only applies `storeLinear`. |
| Cel bands | `celPatchLambert()` patches `lights_lambert_pars_fragment`: a terminator band at N·L 0.26, lit 0.6, a highlight at 0.85 → 0.64, violet shade fill (`#A496D8` × 0.12) and a warm rim (`#FFD2A6` × 0.35). | None. |
| Sky | A painted dome: a camera-centred inverted sphere drawing `look-core.mjs` `SKY_FS` (gradient, sun glow, cumulus, horizon towers, cloud sea), raw sRGB, texture-free. | A CSS `body` gradient fed by `applySkyCss()` behind the transparent canvas, plus `SkyArt` (SVG mountains, sun, moon, stars). |
| Lights | Sun `#FFE4C2` × 4.4, elevation 30°, azimuth −115° from the full view (back-left). Hemisphere `#C4C8DE` / `#8A7650` × 2. Ambient 0. PCF, 2048, bias −0.0005, normalBias 0.06, radius 1.5, shadow box fitted tightly in light space. | `skyAt(hour)`, at 16.5 h (≈ the 16.6 key): sun `#FFE3B5` × 1.75, elevation 50.5°, bearing −0.2°. Hemisphere `#E6E2DA` / `#806A55` × 1.0. PCF (`shadows="percentage"`), 2048, bias −0.0004, normalBias 0.035, fixed box ±17 (up to 26 on dock-islands), redrawn every 4th frame. |
| Fog and haze | Linear fog. Colour = the dome's horizon colour along the camera's view direction (`fog.skyMatch 'view'`). Near/far = camera→target distance + 40 / + 230 (per mood). | Linear fog. Colour = the KEYS `fog` colour. Near/far = framed distance + 40 / + 230 (dock-islands `FogFollow`: live distance). |
| Composite pass | HIGH tier: one fullscreen pass doing depth ink, Neutral once, selective bloom, split-tone grade and vignette. | No post-processing and no post-processing dependency. |
| Cloud sea | Part of `SKY_FS`: flat-topped puff cells on the world plane y = −45, periwinkle shade, cream caps and cast shadows. | `Backdrop.tsx` `CloudField`: 2 InstancedMeshes of icosphere puffs at y −14 … −10.5, Lambert `#FBF5EA`. |
| Underside haze | Island material patch `islandHaze`: below y −5 the island fades toward `sky.below`, reaching 0.6 at y −22, applied after fog. Plus warm `bounce` on steep faces and cliff strata. | None; fog only. |
| Plant crown ramp | `plantMaterial()`: a live 4-stop ramp (shade → mid → lit + gold accent), keyed to world N·sun and height in the crown, plus leaf-translucency `lift` and a per-tree tint. | Procedural shells with palette leaf colours (`RoundTreeShell`, cone pines). The composition branch's plant GLBs bake the ramp. |
| Vertex-colour paint | Per-vertex grass and stone paint (`GT.paintBlueprint`), baked into `piece_<id>.glb` `COLOR_0`, the same in every mood. | `makeIsland()` colours per triangle; dock-islands loads the baked pieces with `pieceMat`. |

## 2. Time of day

**How the moods work as keyframes.** `lookPresets.json` → `timeOfDay`: `{ keyframes: ["Soft morning", "Golden afternoon", "Dusk"], ease: "smoothstep", wrap: true }`. Each mood sets its own `hour`:

| Keyframe | `hour` | Sun (colour, intensity, elevation, azimuth) | Sun direction (world, unit) |
|---|---|---|---|
| `Soft morning` | 8.5 | `#FFEEDC`, 3.2, 20°, +70° (camera-right) | (0.9192, 0.3420, −0.1954) |
| `Golden afternoon` | 16.5 | `#FFE4C2`, 4.4, 30°, −115° (back-left) | (−0.8596, 0.5000, 0.1055) |
| `Dusk` | 19.5 | `#FFAE6B`, 5.6, 12°, −132° | (−0.9633, 0.2079, −0.1699) |

**Sun direction convention.** `azimuthDeg` is relative to the proof's `full` view, `archipelago.views.full.az = 32` in `config/world.config.mjs`. The bearing is b = 32° + azimuthDeg, measured from +z toward +x, and dir = (sin b cos e, sin e, cos b cos e). The light sits at target + dir × `sun.distance` (40). This is `applyLook()` in `arch-scene.js`. The game camera looks from bearing 45°, so the Golden sun comes from 128° to the camera's left and back.

**The blend.** `presetAtHour(LP, hour)` in `look-core.mjs` finds the two neighbouring keyframes and applies smoothstep to the raw fraction. `blendPresets()` then blends every leaf:
- colours are mixed in linear;
- `sun.azimuthDeg` and `clouds.layout.clearAzDeg` follow the shorter arc;
- other numbers are blended linearly;
- `seed` and `mapSize`, and every boolean, enum and string, are taken from the nearer keyframe.

Midnight wraps: Dusk at 19.5 h runs to Soft morning at 8.5 + 24 h.

**What changes between keyframes.** I compared the three moods section by section.
- `renderer.exposure`.
- `sun.{color, intensity, elevationDeg, azimuthDeg}`.
- `hemisphere.{sky, ground, intensity}`.
- `shadows.{normalBias, radius, contact}`.
- `sky.{zenith, horizon, sunSideHorizon, below, sunSideSpreadDeg, dome, paint}`.
- `fog.{color, nearOffset, farOffset}`.
- `cel.{terminator, shadeTint, shadeAmount, rim}`.
- `post.grade`.
- `farm.{windowGlow, porchLight, porchDistance}`.
- `canopy.{shadowLift, coniferLift, backlight}`.
- `clouds.lit`.

**What is identical in all three:** `ambient`, `grass`, `stone`, `materials`, `water`, `plants`, `paths` and `wind`.

**What the blend gives at the game's own hours.** These come from `presetAtHour` on the committed JSON. `skyPalette.ts` `PRESETS` sets morning 8.2, afternoon 14.5, evening 19.1 and night 22.6.
- **12 h:** Soft morning → Golden, t 0.407. The sun is at 24° elevation and azimuth +141°: the shorter arc takes it behind the island at midday.
- **14.5 h:** t 0.844. Sun at 28.4° and −142.3°.
- **18 h:** Golden → Dusk, t 0.5. Window glow 1.35, porch 1.6.
- **22.6 h:** t ≈ 0.14 toward Soft morning. This is still an amber Dusk sun of intensity ≈ 5.3. **There is no night.**

**What can't be interpolated, or isn't covered.**
1. **Night.** No keyframe exists. Between 21 h and 6 h the blend shows a bright dusk-to-morning sun. The game's `NIGHT` key covers 21.6–4.6 h. A `Night` preset has to be authored, schema-complete with every section, before the look can run 24 h. The `timeOfDay.about` text expects one.
2. **Discrete values.** These come from the nearer keyframe and switch at t = 0.5: `renderer.toneMapping`, `shadows.type`, `shadows.fit`, `sky.mode`, the `fog.type` / `skyMatch` / `anchor` settings, every `enabled`, and `sky.dither`. Today they are equal in all three moods, so nothing switches. A Night preset must keep them equal: a `fog.type`, `shadows.type` or light-count change recompiles every program.
3. **Integers that `blendPresets` would blend.** `post.composite.samples`, `sky.paint.towers.cells` and `wind.life.motes` are all equal today; keep them equal.
4. **Vertex-colour paint.** It is baked into the pieces, so it can't be blended per frame. It is the same in every mood anyway.
5. **Game-only `SkyKey` fields.** `glow`, `fireflies`, `stars` and `isNight` have no preset counterpart, apart from `farm.windowGlow` and `farm.porchLight`, which cover the glow. Keep driving these from the game's table, or add them to the Night work.

## 3. The port, step by step

**Order adjusted from the suggestion.** `DayCycle.tsx` `apply()` rewrites the sun, hemisphere and fog from `skyAt()` every 2 s, so a fixed mood would stop the day cycle. The time-of-day plumbing therefore comes first, in step 1. Step 7 finishes it with night, glow and the hour presets.

**The flag.** Everything lands behind one feature flag (`src/game/features.ts` already has `FEATURES`). With it off, the game is exactly as it is today. The proof's `Game (current)` preset has every look section off, and its renders are unchanged through the look work (`phase2_game/` and `look_core_game/` in the art worktree). Each step can then merge while the game stays shippable. Turn the flag on once the night keyframe exists, or earlier if the lead accepts dusk at night.

**Runtime values versus copied code.** Read every value from `lookPresets.json` at runtime: its shape is what `presetAtHour` expects. The file is 44.7 KB; the game needs the three moods and `timeOfDay`, not `Game (current)`, `Proof warm (v4)` or the long `description` strings. Two options are open; the lead decides:
- a build-time JSON import from `art/config`, which ties `src/` to the art tree;
- a trimmed copy in `src/world/look/` that the art session regenerates.

Copy code, not values, from `look-core.mjs`. It is pure ESM with no three and no DOM: `presetAtHour`, `blendPresets`, `celPatchLambert`, `invNeutral`, `compositeMemory` and the GLSL strings. Either port it to TypeScript or add a `.d.ts`. A few constants live in code, not the JSON, and are given in the steps below.

### Step 1: tone mapping, output and the light rig (with the time-of-day plumbing)

- **Game side.**
  - `World.tsx`: remove `flat` and move the `gl` object to a module constant with `toneMapping: THREE.NeutralToneMapping`. In R3F 9.8.2, `configure()` sets `gl.toneMapping` from `flat` only when `glProps.toneMapping === undefined`. It also re-applies `glProps` whenever the `gl` prop changes identity, so don't put the exposure there. Set `gl.toneMappingExposure = renderer.exposure` in `DayCycle` `apply()` instead (1.05 / 1.05 / 1.10).
  - Output stays sRGB (R3F's default; `linear` is not set). Keep the game's `dpr` cap of 1.75; the proof's `maxPixelRatio` of 2 is a proof value.
  - `DayCycle.tsx`: `apply()` computes `p = presetAtHour(LP, hourFor(pref, now())).preset` and sets the following:
    - the sun: colour, intensity, and position = target + dir × 40, as in §2;
    - the hemisphere: sky, ground and intensity;
    - the shadow bias, normalBias and radius;
    - `gl.toneMappingExposure`.
  - Keep `sky.current` (`skyRef.ts`) as a façade for the readers that remain (`Water.tsx`, the birds, `Fireflies.tsx`, `Farmhouse.tsx` `PorchLight`).
- **Copy from.** `arch-scene.js` `applyLook()` (the lights, `SUN_DIR` and shadow blocks) and `look-core.mjs` `presetAtHour` / `blendPresets` / `keyframesOf`.
- **Values** (Soft morning / Golden afternoon / Dusk):
  - sun as in §2;
  - hemisphere `#CCD2E6`/`#857B68` × 2.5, `#C4C8DE`/`#8A7650` × 2, `#B0A6D8`/`#8A6A58` × 3.4;
  - shadows PCF 2048, bias −0.0005, normalBias 0.07 / 0.06 / 0.08, radius 2 / 1.5 / 1.5;
  - `ambient.intensity` 0.

  The sun is up to 2.3× as strong as the game's (4.4 against 1.9) and the hemisphere up to 3× (3.4 against 1.1). These values only work under Neutral, so flip both together.
- **The shadow box.** The proof fits it tightly (`fitShadow()`, `shadows.fit 'tight'`): a light-space box around every visible caster and receiver plus `fitMargin` 1, refitted when pieces dock or unlock and when the look changes. The game's fixed ±17 box (dock-islands `shadowReachOf()`, capped at 26) works with a 12–30° sun, but shadows from casters outside the box drop out.
  - **Recommendation.** Port `fitShadow()` and run it on dock and unlock changes and in `apply()` (every 2 s, as the sun moves), not every frame.
  - Keep the game's shadow refresh every 4th frame.
  - `shadow-camera-far` 90 at distance 40 covers the joined island.
- **Performance.** No change in draw calls. Flipping tone mapping recompiles every program once (the tone-mapping define).
- **Mobile.** Neutral is a few ALU operations per fragment.
- **Verify.**
  - Unit-test the direction conversion against §2's vectors.
  - Check that `presetAtHour(LP, 16.5).preset` equals `Golden afternoon` apart from `hour`, `phase` and `description`.
  - Check `gl.toneMapping === THREE.NeutralToneMapping` after a Canvas re-render, for example after buying an isle.
  - Compare against the proof with the panel's "Look core toggles" turned off (cel and composite off, sky mode dome): the shadow direction and the terrain values should match.

### Step 2: Lambert plus cel bands through `addPatch`

- **Game side.**
  - Add `src/world/look/patch.ts`, a port of `addPatch(m, key, fn)`. It keeps a `WeakMap` list per material; `onBeforeCompile` runs the list, `customProgramCacheKey` joins the keys, and each key applies once. Route every existing shader tweak through it:
    - `wind.ts` `windMaterial()` assigns `onBeforeCompile` and `customProgramCacheKey` directly and would overwrite or be overwritten;
    - `assetMaterials.ts` `storeLinear()` chains by hand (`srgb-in-shader`; update `assetMaterials.test.ts`);
    - `Rising.tsx` `copyOf()` copies both hooks to its fade clones, which still works because the copied hook reads the original material's list.
  - **Convert GLB materials to Lambert.** The cel anchors exist only in the Lambert chunk, and `gameMaterial()` keeps `MeshStandardMaterial`. I found no Lambert conversion on `main`, `feat/dock-islands`, `feat/new-models` or `art/composition`.
    - Port `toLambert()` with its `LAMBERT_KEEP` key list. It runs `linearStore()` (= the game's `storeLinear`) on the new material.
    - `Glass` stays `glassMat`. Textured `Glow` keeps its map and emissive map, then `adoptGlow()`.
    - This drops GGX specular from every model, as in the proof.
  - Give each material a `userData.celKind`:
    - `terrain`: `vertexMat`, `pieceMat` and paths;
    - `foliage`: leaf palette keys, the proof's `GLB_KIND` foliage ids (`tree_round_a`, `bush_a`, `bush_flowering`, `grass_tuft`, `hero_tree`, `haystack`) and the composition plant ids (`tree_*`, `shrub_*`);
    - `building`: everything else;
    - `none`: the cloud puffs (`Backdrop.tsx` `cloudMat` and `Rising.tsx` `puffMaterial`).

    Then call `celMaterial(m, kind)` for each one and precompile once models load with `gl.compile(scene, camera)`, as `populate()` does.
  - Port `applyMinAlbedo()` (`materials.minAlbedo #544A5C`, a luma floor on GLB albedos, applied at load).
- **Copy from.**
  - `look-core.mjs`: `CEL_PARS`, `CEL_ANCHORS` and `celPatchLambert()`. Every anchor must match exactly once; otherwise the material stays plain Lambert and the misses are reported.
  - `arch-scene.js`: `mkCelU`, `celMaterial`, `applyCel`, `toLambert`, `LAMBERT_KEEP`, `linearStore` and `applyMinAlbedo`.
- **Uniforms** (Golden afternoon; `applyCel()` builds them):

  | Uniform | Value |
  |---|---|
  | `uCel` | (amount 1, terminator 0.26, softness per kind: terrain 0.12 / foliage 0.07 / building 0.035, shade 0) |
  | `uCelLit` | (lit 0.6, highlight threshold 0.85, level 0.64, on 1) |
  | `uCelShade` | (`#A496D8` in linear ÷ its luma, amount 0.12) |
  | `uCelRim` | (`#FFD2A6` in linear × 0.35, power 3) |
  | `uCelRimP` | (upCutoff 0.55, wrap 0.25) |

  Per-mood changes: terminator 0.18 / 0.26 / 0.08; Dusk shade `#8C7CD8` × 0.3 and rim `#FFA060` × 0.8. With `cel.enabled` false the neutral uniforms `(0, 0.26, 0.05, 0)`, `(1, 0.8, 1, 0)`, `(1, 1, 1, 0)`, `(0, 0, 0, 3)` give exactly plain Lambert.
- **Performance.** No extra draw calls. Per fragment: two smoothsteps per light, one pow for the rim and one dot product for the shade. Each material compiles one more program variant at load, so precompile it.
- **Mobile.** Nothing beyond the recompile. The anchors are tied to three 0.186.x; the game's `^0.186.1` pins the minor version.
- **Verify.**
  - A vitest that runs `celPatchLambert(THREE.ShaderLib.lambert.fragmentShader, THREE.ShaderChunk.lights_lambert_pars_fragment)` on the game's three and expects `applied: true`, mirroring `scripts/tests/lookcore.test.mjs`.
  - A dev readout like the proof's `window.__lookCore.cel` (`applied`, `fallback`, `misses`).
  - The flag off is pixel-identical.

### Step 3: the sky dome and fog

- **Game side.**
  - Add `src/world/look/Sky.tsx`: a `SphereGeometry(1, 48, 24)` with a `ShaderMaterial` (`SKY_VS`, `SKY_FS`, `side: BackSide`, `depthWrite: false`, `depthTest: false`, `fog: false`, `toneMapped: false`), `renderOrder` −100 and `frustumCulled` false.
  - `uSunDir` is the sun direction from step 1. `uTime` is the shared clock, which drives the drift.
  - Set `uScreenTint` = 1 always: every game camera is a gameplay camera, which is what `sky.screenTint.gameplayOnly` targets.
  - Ship this step with `sky.paint.sea.enabled` off, so the `Backdrop` puffs stay until step 4.
- **The canvas.** The dome writes alpha 1, so the canvas becomes opaque and hides the CSS gradient and `SkyArt` (mountains, sun disc, moon and stars). Drop `SkyArt` when the flag is on. Stars and the moon then wait for the Night work (an open question). `applySkyCss()` can keep writing `--sky-*`, which only `app.css` reads.
- **Fog.**
  - Port `skyHorizonAlong()` and `syncFog()`: the fog colour = the dome's horizon colour along the camera's forward vector. Re-evaluate it on OrbitControls `change` (in dock-islands `FogFollow`) and in `apply()`.
  - Near/far = camera→target distance + `fog.nearOffset` / `farOffset`: −15/150, 40/230 and 30/215. `FogFollow` hard-codes 40/230.
  - Like `syncFrame()`, set `camera.far = max(600, fog.far + 40)`. dock-islands allows zoom to `overviewDistance` (up to 400), where fog far reaches 630, beyond today's far of 600.
- **Water.** `WaterDriver` `uSky` takes `sky.horizon`, as in the proof's `applyLook()`.
- **Copy from.**
  - `look-core.mjs`: `SKY_VS` and `SKY_FS` (`uPainted` 0 = the plain Phase 1 dome).
  - `arch-scene.js`: `SKY_DOME_U`, the dome block of `applyLook()`, `applySkyPaint()`, `skyHorizonAlong()`, `syncFog()` and `skyTint()`.
  - Colours go in as raw sRGB: `srgbVec` = `new Color(hex).convertLinearToSRGB()`. Angles go in as radians.
- **Values** (Golden): zenith `#6FA4DA`, horizon `#CFDFE8`, sun-side horizon `#F6DCB4` within 75°, below `#D6C2CA`, `dome` {62°, 0.75, 40°, 28°}, `paint.mid` `#9EC2E8` at 18°, glow `#FFB874` × 0.35, drift 0.4 u/s at 20°, cumulus cell 60 / height 120 / coverage 0.35, towers 9° / 28 cells / 0.55, dither on, screen tint 0.35 → 0.95.
- **Performance.**
  - One draw call, but the most expensive fragment shader in the frame. Per sky pixel it evaluates `skyPuffs()` over 9 cells for each cumulus octave (2), each sea octave (2) and the sea's cast-shadow lookup, plus 3 × 4 tower ellipses.
  - `sky.paint.lowDetail` (`uLow`) drops to 1 octave with no cast shadow and no towers.
- **Mobile and iOS.**
  - Use `lowDetail` on phones.
  - The shader is texture-free on purpose (the iOS mip-chain rule).
  - It needs highp: it projects onto a plane up to `fadeEnd` 1600 u away and uses `fwidth` antialiasing. The proof has a `?precision=mediump` A/B switch to test this.
  - `sky.dither` (±0.5/255) prevents banding on 8-bit surfaces.
- **Verify.** At the game camera (§6), the top of the screen should show the zenith blue, the sun-side horizon should be warm, and the distant isles should melt into the horizon. Compare with the proof's composite toggled off in the panel, not `?quality=low`, which also forces `lowDetail`.

### Step 4: the cloud sea and underside haze

- **Cloud sea.**
  - Turn on `uSea` and hide `Backdrop.tsx` `CloudField`, both the sea and the `FAR_ARC` drift. The proof hides `seaGroup`, `driftGroup` and the deck when the sky is painted. Keep `DistantIsles` and the birds.
  - Values (Golden):

    | Key | Value |
    |---|---|
    | cell, y, coverage | 26, −45, 0.92 |
    | deep / shade / mid / cap / haze | `#A0A8E4` / `#A8B0E8` / `#D6D8F2` / `#FFF6E6` / `#D6DCEE` |
    | relief, shadow, octave2 | 1.6, 0.25, 0.15 |
    | flat, shadeMid, midLit | 0.3, −0.35, −0.12 |
    | radius, fade | 0.85, 450 → 1600 |

    The colours change per mood.
- **Open: rising pieces.** `Rising.tsx` `puffMaterial` (the clouds a rising piece passes through) keeps Backdrop's `#FBF5EA`, but the pieces rise from 9 u below their docked place (BLUEPRINT.md) while the painted sea lies at y −45. Check it visually; the puffs may need tinting to `sea.mid` / `cap`.
- **Underside haze.**
  - Apply `addPatch(m, 'islandHaze', …)` to `pieceMat` and `vertexMat`. `vertexMat` also covers the distant isles, which the proof hazes too.
  - `uHaze` = raw sRGB of `sky.below` (`stone.fade.matchSkyBelow`) with strength 0.6; `uHazeY` = (bottom −22, top −5).
  - `uBounce` = linear `hemisphere.ground` × `stone.bounce` 0.1 × `hemisphere.intensity` / π, applied on steep faces (steepness²).
  - Mix in the haze after `fog_fragment` with `lcDisplayToTarget()` (`DISPLAY_GLSL`, uniform `uLcExposure` = exposure), so it stays right once step 6 adds the composite.
- **Cliff strata.** Apply `stone.strata` (`STRATA_GLSL` + `NOISE_GLSL` on the island material): band 0.7, warp 0.45, tone 0.12, warm `#907A70`, cool `#787A8A` (multipliers around `#808080` via `mulVec`), joint 0.3, jointWidth 0.07, ledge 0.16, blocks 0.5.
- **Copy from.** `arch-scene.js` `hazeU`, the `islandHaze` patch, `stratU`, `STRATA_GLSL`, `NOISE_GLSL` and the stone block of `applyLook()`; `look-core.mjs` `DISPLAY_GLSL`.
- **Performance.** Removing the two `CloudField` InstancedMeshes saves 2 draw calls. The haze adds a few ALU operations per island fragment; strata adds value noise on steep faces only.
- **Mobile.** The strata hash is `sin`-based, so give it highp. The sea's cost is in step 3.
- **Verify.** Compare the proof's `?view=edge` with a free game camera looking under the island, and a phone zoomed out to `overviewDistance`.

### Step 5: plant materials for the composition PR's instanced plants

- **Superseded for the plant models (painterly trees, 2026-10-23).** `export-composition.mjs` no longer builds the trees, shrubs and bushes from `plants.mjs` and `assets/*.mjs`.
  - **What ships now.**
    - 8 trees, 3 autumn recolours and 3 bushes: `art/reskin/<id>.glb`, CC0 MegaKit models repainted by `reskin.mjs` and copied unchanged.
    - 3 card shrubs: `lib/plantkit.mjs` `SHRUBS`.
  - **Their materials.**
    - Every one has painted textures. A tree has a JPEG bark material (opaque) on the root and a PNG leaves material (alphaMode MASK) in `Canopy`; conifers wrap it in `Crown` > `Canopy`.
    - `tree_fruit` and `bush_berry` add an `_overlay` MASK material.
    - There is no baked `COLOR_0` ramp, no canopy-lift gain (`liftGain()` is gone) and no `_ATREEH` / `_COLOR_RAW` attributes.
    - So the **Materials**, **baked lift gain** and **Still missing** bullets below describe the retired GLBs only.
  - **Tests.** `tests/plants-export.test.mjs` and its fixtures (`plants.baseline.json`, `plants.proof-live.json`) are retired with them. `tests/composition.test.mjs` C7, C8, C13 and C14 check the new set.
  - **Still valid.**
    - One `InstancedMesh` per asset, piece and primitive.
    - The canopy-only tint, now near white: ±6 % value with a slight warm / cool shift, each channel in [0.92, 1.08]. Bushes, card shrubs and `tree_fruit` stay untinted.
    - Only trees cast shadows.
    - The sway note.
- **Prerequisite.** `origin/art/composition` must be merged. It provides `config/composition.pieces.json`, 13 plant GLBs and the drawing recipe in its `BLUEPRINT.md`:
  - one `InstancedMesh` per asset per piece per mesh node;
  - the tint applied with `setColorAt` on the `Canopy` mesh only (canopy-only tint);
  - only trees cast shadows.
- **Materials.** Each plant GLB has one material, `plant`, shared by the trunk (root mesh) and the `Canopy` mesh. Clone it for the canopy, run `toLambert` on both, and give both `celKind` `foliage` (as `plantMaterial()` does).
- **The baked lift gain.** `liftGain()` in `composition.mjs` folds the proof's leaf-translucency fill into `COLOR_0` as an albedo gain: ×1.787 on broadleaf crowns and shrubs, ×1.605 on conifers (recomputed from the JSON: 1 + lift × hemisphere × 0.65 / (sun + hemisphere)). That was a stand-in for the game's old lights. Once steps 1–2 are in:
  1. Set the canopy material's `color` to 1/1.787 (`tree_round_*`, `tree_spread`, `tree_sapling`, `tree_fruit`, `shrub_*`) or 1/1.605 (`tree_pine_*`). Lambert multiplies vertex colours by `color`, so this removes the gain exactly. The bake's `min(1, …)` clamp touched only the 5 % gold accent. One exception: `tree_fruit`'s fruit sits in its `Canopy` mesh without the gain (`splitBody()` copies the fruit colours as they are), so this step would darken the fruit by 1/1.787.
  2. Add the live lift from `canopyMaterial()`: the `lights_fragment_end` injection `indirectDiffuse += albedo × uCanopyLiftCol × uCanopyLift × (0.65 + 0.35 N·L)`, where `uCanopyLift` = `plants.lift` 2.6 or `plants.coniferLift` 2.0, and `uCanopyLiftCol` = (hemisphere sky + ground) / 2 in linear × intensity / π, updated per mood.
  3. Leave `plants.gradient` 0 (no `canopy.gradient` on these) and `canopy.backlight` off (off in every mood).
- **Still missing after that.** The live ramp: the warm sun side and cool shade side of each crown, which turn with the time of day. That needs the crown height (`aTreeH`) and the unramped per-lobe value. The GLBs carry neither: `COLOR_0` is the yaw-averaged ramp × value × saturation 0.9 × gain. `aTreeH` could be rebuilt from Canopy-local y, normalised over the canopy as in `plants.mjs` `finish()`, but `tree_fruit`'s fruit sits in the same mesh. If the lead wants the live ramp, ask the art session for a re-export with a `_ATREEH` attribute and an unramped `COLOR_0`. Then port `plantMaterial()` with `plants.ramp` and `plants.conifer`:

  | Ramp | shade | mid | lit | accent | light / height / bias / midStop |
  |---|---|---|---|---|---|
  | `ramp` (broadleaf) | `#2A4834` | `#4A7445` | `#7AAA5E` | `#D9B24C` × 0.05 | 0.8 / 0.5 / 0 / 0.45 |
  | `conifer` | `#26412B` | `#3A6142` | `#608A4C` | — | 0.75 / 0.4 / 0 / 0.5 |
- **Sway.** `useSway()` rotates the `Canopy` / `Crown` node, which can't happen per instance in an InstancedMesh. Sway needs an `addPatch` vertex patch keyed on canopy height, with a phase from the instance translation (the pattern of `wind.ts`). The proof sways only the grass tufts (`makeSway()`); `wind.shared` is not wired.
- **Performance** (art worktree `gitaway-assets`, `art/screenshots/<phase>/raw/capture.json`, local only; joined island; scene draw calls including the shadow pass):

  | Stage | `full` view | `default_*` views |
  |---|---|---|
  | Look core, before plants | 895 calls / 838k tris | 876 |
  | Plants | 840 calls / 984k tris | 821 |
  | Meshy set | 844 calls / 1.14M tris | 824 |

  The budget is ≤ 900 (`scripts/tests/plants.browser.mjs` B5). Each variant is one geometry, which is why plants lowered the call count.
- **Mobile.** About 1M triangles for the fully joined island is heavy for phones. The game starts with MAIN plus few pieces.
- **Verify.** On the composition branch, `composition-check.mjs --extract / --agree / --sheets` renders game-style side-by-side sheets at the game camera.

### Step 6: the composite pass (ink, bloom, grade) behind a quality setting

- **Game side.**
  - Add `src/world/look/Composite.tsx`. A `useFrame(cb, 1)` with priority 1 takes over R3F's render. It works with `frameloop="demand"` and the Ticker.
  - **HIGH tier:**
    - render the scene into a `WebGLRenderTarget(w, h, { type: HalfFloatType, samples: post.composite.samples, depthTexture: DepthTexture with UnsignedIntType })`;
    - build bloom at 4 levels (`BLOOM_LEVELS`, in code): a prefilter at ½ resolution, 3 downsamples and 3 tent upsamples;
    - run one `ShaderMaterial` (`toneMapped: false`) to the canvas.
  - **LOW tier:** today's path, where the renderer tone-maps.
  - Add a quality setting (Settings): auto picks LOW on phones and on battery saver. The game already has "Save power on battery" and the motion levels.
- **Display-referred fix-ups** on the HIGH path. The scene renders linear and untone-mapped into the target, and the composite tone-maps it. Anything that was meant to be display-referred must be pre-inverted, otherwise it changes colour between tiers.
  - **Fog colour.** `renderFrame()` swaps `scene.fog.color` for `invNeutral(fog, exposure)` around the scene render. Three converts the fog colour with `getUnlitUniformColorSpace()`: to the output space on the canvas, linear into a target.
  - **Water.** `Water.tsx`'s three `ShaderMaterial`s need `DISPLAY_GLSL` and `gl_FragColor.rgb = lcLinearToTarget(gl_FragColor.rgb)` before `colorspace_fragment` (the proof's `wFS()`).
  - **Underside haze.** Already handled in step 4.
  - **Sky.** The sky shader linearises itself and writes alpha 0. The composite reads scene alpha as the sky mask: 1 = tone-map, 0 = sky.
  - **Game-only.** `Fireflies.tsx` (additive, no `colorspace_fragment`) and any other game `ShaderMaterial` need the same check. The proof has none of them.
- **Copy from.**
  - `look-core.mjs`: `QUAD_VS`, `COMPOSITE_FS`, `NEUTRAL_GLSL`, `BLOOM_PRE_FS` / `DOWN` / `UP`, `invNeutral`, `DISPLAY_GLSL` and `compositeMemory`.
  - `arch-scene.js`: `ensureTargets()`, `pass()`, `renderFrame()`, `applyPost()`, `compositeActive()` and `fitNear()` / `nearObjects()`. The near plane = 0.9 × the distance to the nearest visible bounds, clamped to [0.5, 60] and refitted every frame for ink precision.
- **Values** (Golden; `applyPost()` builds the uniforms):

  | Effect | Values |
  |---|---|
  | Composite | samples 4, dither on |
  | Ink | `#2F2233` × 0.85, depth jump 0.03 → 0.08, `surfaceMix` 0.55 × violet `#9C8CC0`, fades over 160 → 480 u |
  | Bloom | threshold 0.92, knee 0.05 (`uKnee` 0.87 → 0.92), strength 0.4 (÷ 4 levels in `uBloom`), radius 0.5 (tent 0.5 + radius) |
  | Grade | shadow `#7C86C8`, highlight `#FFE2BC`, amount 0.06, saturation +0.06, shadowSaturation 0.7, pivot 0.22, contrast 0 |
  | Vignette | offset 0.55 → 1.0, darkness 0.12 |

  Grade per mood: Soft morning highlight `#FFF0DC` × 0.10; Dusk `#7468C0` / `#FFD0A8` × 0.18.
- **Performance.**
  - **Draw calls.** 8 post passes with bloom, 1 without (`postCalls` in `look_core_toggles/raw/*/capture.json`). Scene calls are unchanged.
  - **Memory** (`compositeMemory()`, 4 bloom levels):

    | Drawing buffer | 4× MSAA | No MSAA |
    |---|---|---|
    | 412×915 phone at dpr 1.75 (721×1601) | 71.9 MB | 19.0 MB |
    | 412×915 phone at dpr 3 (1236×2745) | 211 MB | 55.9 MB |
    | 1440×900 desktop at dpr 1.75 (2520×1575) | 247 MB | 65.4 MB |
    | 1440×900 desktop at dpr 1 | 80.7 MB | 21.4 MB |

    Keep the game's dpr cap of 1.75.
  - **Canvas MSAA.** The canvas's own `antialias: true` buffer is wasted on HIGH, but context attributes can't change at runtime.
  - **Frame time.** No measurement exists in the repo. LOOK-BRIEF has the lead measure on a real GPU, and the headless captures use SwiftShader. Measure with the proof's `?stats=1` / `await __frameStats(300)` and an equivalent in the game.
- **Mobile and iOS.**
  - HalfFloat colour attachments need `EXT_color_buffer_half_float` or `EXT_color_buffer_float`. Check `gl.extensions` and fall back to LOW.
  - Clamp `samples` to `MAX_SAMPLES`.
  - The ink linearises depth with `perspectiveDepthToViewZ`, so keep highp.
  - Per pixel the composite reads 1 scene, 9 depth and 1 bloom texel, plus the chain. Default phones to LOW, or HIGH with `samples` 0, where ink and grade still work but edges alias.
  - No iOS measurement of the composite is recorded; the proof's tests run headless (SwiftShader) and on a desktop GPU.
- **Verify.**
  - A readout like the proof's `window.__lookCore.composite`: `on`, `samples`, `targetType` HalfFloat, `hasDepthTexture`, `toneMappedMaterial` false, renderer tone mapping Neutral.
  - `postCalls` 8.
  - LOW and HIGH should match apart from the effects; the TUNING.md look-core section explains why. In the proof, `tests/lookcore.browser.mjs` K5 checks the LOW tier.
  - Grass never feeds the bloom.

### Step 7: day-cycle keyframes (finishing the job)

- **Game side.** `DayCycle.tsx` applies every remaining section from the blended preset: sky, fog, cel, post, farm and canopy lift. That gives the game the proof's `applyLook()`.
  - `skyPalette.ts`: either retarget `PRESETS` to the keyframe hours (morning 8.5, afternoon 16.5, evening 19.5) so each setting shows its mood exactly, or keep 8.2 / 14.5 / 19.1 and accept the blends in §2.
  - `night` 22.6 needs the `Night` keyframe (§2).
  - Retire `KEYS` once the flag stays on. Until then, keep it for `fireflies`, `stars` and `isNight`.
- **Glow.** Set `glowMat.emissive` = `farm.windowColor` `#FFC877` and call `setGlow(farm.windowGlow)`: 0.2 / 0.3 / 2.4 against the game's `glow` 0 → 1.5. `adoptGlow` materials follow.
- **Porch light.** The proof uses `farm.porchColor` `#FFB866`, `porchLight` 0 / 0 / 3.2 candela, decay 2 and distance 4.5 / 4.5 / 4. The game's `PorchLight` is `#F6BE72` at glow × 2.2, decay 1.6, distance 5.5. Pick one.
  - Keep the game's always-mounted light at intensity 0 by day. The proof toggles `porch.visible`, and a light-count change recompiles every lit program once, which shows as a hitch at dusk on phones.
- **Performance.** `presetAtHour` clones and blends about 500 leaves every 2 s, which is negligible. Updates touch uniforms only, as long as the discrete values stay equal across keyframes (§2).
- **Verify.**
  - Sweep 0–24 h: no `NaN`, and the colours stay continuous through midnight.
  - Screenshots at 8.5 / 12 / 16.5 / 18 / 19.5 h against the proof's `?hour=H` (reference captures: `look_core_moods/` in the art worktree).

## 4. Baked assets

- **Pieces** (`public/models/piece_<id>.glb`, on main).
  - `COLOR_0` is linear UNSIGNED_BYTE, painted by `bake.mjs` with `LP.default` = `Golden afternoon`: `GT.paintBlueprint`, plus seam-lip normals because `grass.seamMatch` is on.
  - `grass` and `stone` are identical in all three moods, so this paint is right in every mood. The proof does not repaint per mood: `applyPaint()`'s signature (grass + stone without `fade` and `bounce`) never changes between moods, so the mood comes entirely from light, sky, fog, cel, grade and the shader-side `stone.fade` / `bounce`.
  - Only `Game (current)` paints differently (grass and stone off), so with the flag off the baked pieces show the Golden albedo under the old lights. That is what dock-islands already draws.
  - Keep a future Night keyframe's albedo the same; anything else needs a re-bake or a shader tint.
- **Textured Meshy models** (the farmhouse and its 1024 px texture, windmill, well, bench, haystack, cart, hero tree, rocks and outcrops).
  - The iOS rule: Apple GPUs corrupt GPU-built mipmaps of sRGB textures. So an sRGB `map` is stored as `NoColorSpace` RGBA8, its mips are built on that, and it is decoded in the shader through `DECODE_VIDEO_TEXTURE`.
  - The emissive window mask is stored linear and never decoded.
  - The game's `storeLinear()` already mirrors the proof's `linearStore()`. When step 2 converts these to Lambert, the new material must go through it again: the flag is on the texture (`userData.srgbInShader`), and the decode goes through `addPatch` (`srgbDecode`) so it chains with cel.
  - The mips then average sRGB bytes, which is invisible at this scale (comment on `linearStore`).
  - The texture rule itself (budget and size) is still open in `meshy/README.md`.
- **Plant GLBs** (`origin/art/composition`; retired by the painterly trees, see the note at the top of step 5). The ramp is baked as a yaw average at a 30° sun, the lift as the gain in step 5, saturation 0.9, and the per-tree tint ships in the JSON. Under the proof's lights:
  - divide out the gain;
  - add the live lift;
  - keep cel bands on;
  - ask for a re-export if the live sun-side ramp is wanted.

  The bake's notes already say what the game loses without this: the crowns read flatter and more olive, and the conifers paler.

## 5. What not to port, or to defer

- **Proof tooling.**
  - `look-panel.js` (the lil-gui panel), `look-save.mjs` (save / load / the artifact db).
  - `look-capture.mjs`, `look-sheet.mjs`, `look-grid.mjs`, `look-gates.mjs`, `capture.mjs`, `shots.mjs`, `metrics.mjs` and `contact-sheet.mjs`.
  - `__viewShot`, `__saveShot`, the capture driver and `renderMask()` / `MASK`.
  - `?diag=gl` / `__glFacts` and the device A/B flags (`?nodither`, `?precision`, `?aa`, `?pdb`, `?pr`).
  - `debugOverlay()`.
  - `__frameStats`: port only a light version for the dev panel, if wanted.
- **Superseded proof paths.**
  - the `screen` and Phase 1 `dome` sky modes (`SKY_FS` with `uPainted` 0 covers the dome);
  - `cloudLit`, `layoutClouds()`, `radialDisc()` and the deck (the painted sea replaces them);
  - the `Proof warm (v4)` preset, `dayCyclePreset()` and `Game (current)` (keep it only as the revert reference);
  - the legacy `look.config.mjs` `lighting` and `atmosphere` sections (`?world=legacy` only).
- **Proof-only content.**
  - `MESHY_SET` placements and the held-back Meshy underside;
  - the proof's stairs and placeholder water (the game draws its own water);
  - the runtime terrain paint and seam lips (already baked).
- **Schema `wired: false` (nothing to port).** `post.ao`, `post.dof`, `post.cloudShadows`, `fog.height`, the Phase 4 `water.*` keys, `wind.shared` and `wind.life`. Also skip `canopy.backlight` (off in every mood) and `canopy.gradient` on the GLB plants (`plants.gradient` 0).
- **Defer on phones.** 4× MSAA in the composite, the sky's towers and the sea's cast shadow (`lowDetail`), the per-frame near-plane fit (it only serves the ink), and the per-frame shadow refit.

## 6. How to compare

- **The proof.** Run `node build.mjs` in `art/scripts`, which writes the proof to the git-ignored `art/scripts/.build/proof` or `PROOF_DIR`, then serve it with `node shots.mjs`. The user also has a published copy.
- **Proof URL parameters.**

  | Parameter | What it does |
  |---|---|
  | `?look=<preset>` | A named mood; the default is `Golden afternoon`. |
  | `?hour=H` | The time-of-day blend; only without `?look`. |
  | `?look=Game (current)&hour=H` or `?gamehour=H` | Today's game light at hour H. |
  | `?quality=low\|high` | LOW also forces the low-detail sky. |
  | `?unlocked=main\|all\|meadow,grove,islet` | The unlock state; the default is `all`, but the game starts at `main`. |
  | `?preset=default_desktop\|default_mobile` | A preset camera. |
  | `?cam=az,el,dist&tgt=x,y,z` | Overrides the camera; az in degrees from +z toward +x. |
  | `?baked=1` | Draws the baked piece GLBs. |
  | `?ui=0`, `?stats=1` | Hide the UI; show the frame-time overlay. |

  The panel's "Look core toggles" switch composite, ink, bloom, grade, vignette, cel and the sky mode one at a time, which matches the steps above.
- **The game camera.** Target (0, −0.6, 0), azimuth 0.7854 rad (45°), polar 1.0668 rad (elevation 28.88°), fov 30, near 0.5, far 600 (`framing.ts` `VIEW`, `World.tsx`).
  - **Desktop** 1440×900: `frameDistance()` = max(30, 29.9, 35.45) = **35.5**. The proof's `?preset=default_desktop` resolves the same, because `dist: 'frame'` uses `render.view` 27×19, fill 0.95, floor 30, max 130.
  - **Phone** 412×915: **106.3** with MAIN alone (main and the proof's `default_mobile`). With pieces docked on dock-islands, `defaultFrame()` on a portrait screen reaches the cap of **130**, which is what `composition-check.mjs` uses for main, meadow, grove and islet.
- **Recipes.**
  - Desktop: open the proof in a 1440×900 window with `?preset=default_desktop&cam=45,28.88,35.5&tgt=0,-0.6,0&unlocked=main,meadow,grove,islet`.
  - For exact sizes, run this in the console. It returns `{ url }`, a PNG data URL:

    ```js
    await __saveShot('game_desktop', { mode: 'gameplay', az: 45, el: 28.88, dist: 35.5, tgt: [0, -0.6, 0], w: 1440, h: 900, unlocked: 'main,meadow,grove,islet', returnUrl: true })
    ```

  - Phone: the same with `dist: 130, w: 824, h: 1830`, which is 412×915 rendered at 2×, as `composition-check.mjs` does.
  - Game side: pick the hour with Settings → time of day, or skip ahead with the dev panel (`skipAhead`, development builds only).

## Open questions for the lead

1. **Night.** Who authors the `Night` keyframe, and should the flag go on before it exists?
2. **Losing `SkyArt`.** Is it acceptable to lose the CSS mountains, sun, moon and stars once the dome is opaque?
3. **GLBs to Lambert.** Is it acceptable that step 2 converts all GLB models from Standard to Lambert? The proof's comments assume the game already does this, but `gameMaterial()` doesn't.
4. **How the game gets the presets.** A build-time import from `art/config`, or a trimmed copy in `src/`?
5. **The plant crown ramp.** Should the art session re-export the plant GLBs with `_ATREEH` and an unramped `COLOR_0` for the live ramp?
6. **The porch light.** Which porch light model to keep?
7. **The rise puffs.** Does the rise through the clouds need retinting against the painted sea at y −45?
8. **Discrepancy.** `TUNING.md` says the porch light reaches 5 at dusk, but `lookPresets.json` has 3.2. The JSON is the source of truth.
