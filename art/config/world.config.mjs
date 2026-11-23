// world.config.mjs  --  GITAWAY ISLAND: THE SINGLE SOURCE OF TRUTH FOR WORLD LAYOUT
// =============================================================================
// Pure DATA only (object literals, no logic). This is the CENTRAL map that the
// whole world revamp is judged against (see world-layout.spec.md). It owns:
//   * footprint  -- the island silhouette (size, radii, domain-warp, rim, mist)
//   * regionMap  -- an EXPLICIT per-cell region assignment (A..H, W) + per-region
//                   elevation targets, drama level and module palette
//   * clearing   -- the broad flat welcoming ring around the fixed farm
//   * paths      -- the STAGE-2 branching dirt-path network (porch -> destinations)
//   * mist/edge  -- the atmospheric band the rim descends into
//   * cameras    -- the PERMANENT comparison-render presets (+ orbit angles)
//
// terrain.mjs reads this (passed as `world3`) to build the island; viewer.mjs
// reads it as window.__WORLD3__ for the mist layer + camera presets + capture.
// The legacy 5x5 cell world + the ?view=test validation scene (modules.config)
// are LEFT UNTOUCHED so the fixed regression tests stay green.
//
// STAGE 2 SCOPE (built ONTO the Stage-1 island foundation): the SELECTED DRAMA +
// PATH NETWORK. Gentle cozy interior (farm -> clearing -> rolling meadows +
// woodland groves) with INTENTIONAL, SELECTED drama at the edges: a few faceted
// ROCKY LEDGES (region D only), one raised flat-topped UPPER PLATEAU landmark
// (region F, woodland on top), and a branching dirt-PATH network from the farm
// porch. Water (lake E / river G / waterfall / bridges / docks) and ruins are
// STAGE 3 -- their sectors (E lake, reserved) are kept but rendered gentle grass.
// =============================================================================

export default {

  // ---------------------------------------------------------------------------
  // 1. ISLAND FOOTPRINT  (spec 2, 5)  -- one watertight heightfield shaped into an
  //    irregular self-contained island that descends into mist. All units ~1m.
  // ---------------------------------------------------------------------------
  island: {
    enabled: true,
    grid: 11,            // 11x11 jittered cell grid (centre cell = farm)
    cellSize: 20,        // world units per cell  -> cells span +/-100u
    jitter: 5.0,         // 0..cellSize/2  cell-centre jitter -> irregular silhouette
    planeSize: 300,      // the single heightfield mesh spans +/-150u (island + mist basin)
    planeSegments: 250,  // mesh resolution (~1.2u/segment) -> flat-shaded low-poly facets
    // --- silhouette (domain-warped radial mask) ---
    // land is FULL inside coreR; from coreR..rimR the surface rolls gently DOWN
    // into the mist; beyond rimR it is the sunken mist basin (hidden by fog + the
    // mist sheet). The boundary radius is warped by low-freq noise -> an irregular
    // natural coastline, never a circle.
    coreR: 88,           // radius of full-height land (nudged out 86->88 so rim-adjacent
                         // plateau/ledge cells survive the jitter instead of masking to rim)
    rimR: 122,           // radius where the rim finishes dropping into the mist
    warpAmp: 18,         // world units the coastline wobbles in/out (irregularity)
    warpFreq: 0.017,     // low freq -> big lazy bays + headlands, not noise
    warpFreq2: 0.043,    // a second finer octave of coastline wobble
    warp2Amp: 7,
    mistFloor: -17,      // absolute height of the sunken basin beyond the rim
    rimLip: 0.6,         // small grassy lip raised at the very top of the rim
    // the base meadow roll + tier plateaus are confined to the island by the same
    // mask so nothing rolls out across the basin.
  },

  // ---------------------------------------------------------------------------
  // 2. REGION MAP  (spec 3)  -- EXPLICIT per-cell region letters on the 11x11 grid.
  //    Row index i = X axis (i=0 -> x=-100 .. i=10 -> x=+100).
  //    Col index j = Z axis (j=0 -> z=-100 .. j=10 -> z=+100).
  //    Centre (5,5) = A (farm). Cells whose jittered core falls in the rim/mist
  //    zone are forced to H (rim) by the mask regardless of the letter here.
  //    A farm | B clearing | C meadow | W woodland grove |
  //    D rocky-ledge (SELECTED drama) | F upper-plateau (landmark) |
  //    E lake (STAGE-3 reserve, gentle now) | H world-edge/rim
  //
  //    Composition is INTENTIONAL: the farm sits in a broad open clearing/meadow
  //    heart; woodland groves (W) are placed as CLUSTERS; the F plateau is one
  //    clear NW landmark (lines up with the `plateau` camera); the D rocky ledges
  //    are two SELECTED outer clusters (NE lines up with `rocky_ledge`; a small
  //    southern outcrop lines up with `world_edge`). Everything else stays grassy.
  // ---------------------------------------------------------------------------
  regionMap: [
    'HHHHHHHHHHH', // i=0  x=-100
    'HHCWWCCCCHH', // i=1  x=-80   (W woodland grove NW)
    'HCCWWCCFFCH', // i=2  x=-60   (W grove NW, F upper-plateau toe N)
    'HCECCCCFFCH', // i=3  x=-40   (E lake reserve W, F upper-plateau landmark)
    'HCECBBBCFCH', // i=4  x=-20   (B clearing ring, F plateau edge)
    'HDDCBABCCWH', // i=5  x=0     (D rocky outcrop S-rim, A farm, W grove E-rim)
    'HCCCBBBCCWH', // i=6  x=+20   (B clearing, W grove E-rim)
    'HCWWCCCDDCH', // i=7  x=+40   (W grove SW, D rocky ledge E)
    'HCWWCCCDDCH', // i=8  x=+60   (W grove SW, D rocky ledge E)
    'HHCCCCCCCHH', // i=9  x=+80
    'HHHHHHHHHHH', // i=10 x=+100
  ],

  // Per-region design parameters. `tier` is the target elevation tier (height =
  // tier * tierStep); `roll` lets a region gently vary +1 tier via a coherent
  // seeded field (rolling meadows / grassy shelves); `cliffChance` (STAGE 2) is
  // the per-region probability a RAISED cell becomes a tight-feather ROCK CLIFF
  // (0 everywhere EXCEPT the selected drama regions D/F -> drama stays INTENTIONAL
  // and never near the farm); `drama` is a descriptive tag; `modules` is the
  // weighted composition palette the assembler chooses from (keys = module ids).
  regions: {
    A: { name: 'Farm',        tier: 0, roll: 0, drama: 'none',    cliffChance: 0,    modules: { landmark_farm: 1 } },
    B: { name: 'Clearing',    tier: 0, roll: 0, drama: 'none',    cliffChance: 0,    modules: { comp_cultivated: 3, comp_meadow: 4 } },
    C: { name: 'Meadow',      tier: 0, roll: 1, drama: 'gentle',  cliffChance: 0,    modules: { comp_meadow: 6, comp_cultivated: 1 } },
    W: { name: 'Woodland',    tier: 0, roll: 1, drama: 'gentle',  cliffChance: 0,    modules: { comp_grove: 6, comp_meadow: 1 } },
    D: { name: 'RockyLedge',  tier: 2, roll: 0, drama: 'rocky',   cliffChance: 0.72, modules: { comp_rocky: 5, comp_grove: 1 } },
    E: { name: 'Lake',        tier: 0, roll: 0, drama: 'reserved',cliffChance: 0,    modules: { comp_meadow: 5, comp_grove: 1 } },
    F: { name: 'UpperPlateau',tier: 3, roll: 0, drama: 'plateau', cliffChance: 0.40, modules: { comp_grove: 5, comp_meadow: 2 } },
    H: { name: 'WorldEdge',   tier: 0, roll: 1, drama: 'rim',     cliffChance: 0.12, modules: { comp_meadow: 4, comp_grove: 2 } },
  },

  // Elevation tuning for the island (cozy-scaled; drama is SELECTED, never canyon).
  // The |Δtier|<=1 solver + a RAISE-skirt (so a tier-3 F plateau gets tier-2 then
  // tier-1 rings, read as a broad gentle massif with a flat top) keep transitions
  // legal. Drops are GENTLE grassy slopes by default (wide feather); only cells in
  // the SELECTED drama regions (D/F, via per-region cliffChance) get the TIGHT
  // feather that reads as a faceted ROCK face. Nothing rocky near the farm.
  elevation: {
    tierStep: 1.9,       // metres per tier (cozy; a 1-tier drop over the tight cliff
                         // feather reads as a crisp faceted rock riser)
    maxTier: 3,          // tier 3 = the F upper-plateau landmark (D ledges = tier 2)
    rollChance: 0.42,    // chance a `roll` region cell lifts +1 (coherent field gated)
    rollField: { f: 0.03, p: 1.9 }, // low-freq coherent roll field (connected rises)
    feather: { cliff: 1.3, slope: 11.0 }, // TIGHT cliff riser (rock) vs WIDE grassy slope
    cliffChance: 0.0,    // GLOBAL default 0; regions D/F/H set their own (selected drama)
    calmRadius: 30,      // cells within this of the farm are capped to calmTier (gentle heart)
    calmTier: 1,
    rockFarmClear: 42,   // no rocky CLIFF cell within this of the farm (interior stays grassy)
    stampInner: 0.46,    // x cellSize -> flat plateau-top core radius
    pNorm: 6,
    outlineWarp: 7.0,    // domain-warp the terrace outlines (no concentric rings)
  },

  // Broad welcoming flat clearing around the farm (spec C): held flat + blends
  // out with an irregular grassy edge into the meadow (NOT a floating platform).
  clearing: { flatInner: 15, flatOuter: 36 },

  // Gentle meadow base-roll confined to the island (replaces look.config flatten
  // ranges in island mode). Broad soft rolls, calm grass.
  meadow: { flattenInner: 15, flattenOuter: 40, broadAmp: 2.0, mediumAmp: 0.55, fineAmp: 0.12 },

  // ---------------------------------------------------------------------------
  // 3. PATHS  (spec 4, STYLE C7)  -- PASS A. The Stage-2 network was four hand-placed
  //    straight spokes meeting at the porch (an X) with a per-quad dirt bake -> a tan
  //    halo round the farm + staircase edges. SCOPE (user decision 2026-10-18): the
  //    world is being restructured into a small game-scale main island + unlock
  //    isles, so the island-spanning network is NOT built here; only the farm's own
  //    PORCH PATH: it leaves the porch through `leadOut` (a fixed gap between the
  //    farm props) and runs to the clearing edge (`main.at`), routed on the
  //    heightfield by terrain.mjs buildPathNetwork (grade penalised, steep corridors
  //    + the mist rim impassable, a seeded low-frequency wiggle for a natural curve),
  //    re-splined (centripetal Catmull-Rom) and drawn as a smooth, surface-conforming
  //    ribbon with a soft alpha edge and a soft end (NO terrain bake). `branches`
  //    (routed back INTO the network, joining beyond routing.junctionMinR, at least
  //    routing.junctionSep apart) is kept EMPTY until the main-island redesign. The
  //    corridor (vegetation.pathClearance from the centre line) is reserved before
  //    scatter.
  // ---------------------------------------------------------------------------
  paths: {
    enabled: true,
    width: 1.15,          // path width at the porch (u); tapers along each route
    taper: 0.8,           // width multiplier reached at the far end of a route (gentle taper)
    branchScale: 0.92,    // a branch starts at this x its parent's local width
    soft: 0.2,            // soft alpha edge each side of the ribbon (u) -> no hard/stair-stepped edge (0.4 read airbrushed)
    clearance: 1.7,       // (legacy key; the reserved corridor is look.config vegetation.pathClearance)
    porch: [0.9, 1.1],    // farm porch anchor (world x,z) -- the main route starts here
    leadOut: [[0.9, 1.1], [1.25, 2.3], [1.6, 3.6]],   // fixed porch exit between flowerbed / flowering bush / rock
    main:     { to: 'clearing-edge', at: [7, 15] },   // porch path ends (soft fade) at the clearing edge
    branches: [],                                     // none until the main-island redesign (see above)
    routing: {
      step: 1.5,          // lattice spacing (u) over the island
      extent: 110,        // lattice half-size (u)
      maxGrade: 0.6,      // max rise/run anywhere across the path corridor (~31 deg; rock faces start ~1.6 = 58 deg);
                          // steeper = impassable (the 220u island's tier transitions reach ~0.4-0.6)
      gradeCost: 4,       // penalty on climbing (paths follow contours)
      slopeCost: 1.5,     // penalty on cross-slope / nearby steepness
      wiggle: 0.85,       // amplitude of the seeded low-frequency cost field -> organic winding
      wiggleFreq: 0.032,  // its frequency (1/u): broad meanders, not jitter
      farmBlockR: 3.6,    // routes never re-enter the farm-prop footprint
      clearR: 15,         // branches pay clearCost inside the farm clearing ...
      clearCost: 6,
      junctionMinR: 18,   // ... and join the network only beyond this radius (no X at the porch)
      junctionSep: 10,    // no two junctions (or a junction and the porch exit) closer than this -> no crossings
      mistMargin: 2.5,    // keep this far above the mist sheet
      ctrlEvery: 4,       // lattice nodes per spline control point (coarser = smoother curves)
      sample: 0.5,        // arc-length resample spacing (u)
      smoothTolerance: 1.25, // a smoothed curve may exceed maxGrade by at most this factor
      widthJitter: 0.06,  // +/- organic width variation
    },
  },

  // PASS A island terrain-colour overrides (terrain.mjs terrainColours).
  // soilBandScale scales look.config faceBands' legacy ABSOLUTE-HEIGHT earthy band
  // (soilH0..3 = 0.6..4.4m). The island's ordinary rolling meadows sit in exactly
  // that range, so at full weight it painted gentle rises tan (the blocky tan/green
  // meadow patches). 0 = meadows stay grass; cliff feet keep their slope-driven soil.
  colour: { soilBandScale: 0 },

  // ---------------------------------------------------------------------------
  // 4. MIST / EDGE  (spec 5)  -- the atmospheric band the rim descends into.
  //    A broad translucent mist sheet veils the sunken basin so the island reads
  //    as self-contained, floating in soft haze; beyond = haze -> sky. The terrain
  //    submerge-fade (below) hazes the rim drop into the mist so no dark over-steep
  //    rim facet reads, and far regions recede for atmospheric DEPTH.
  // ---------------------------------------------------------------------------
  mist: {
    enabled: true,
    top: -4.5,           // height of the mist sheet (island sits above it)
    radiusInner: 64,     // fully clear inside this (island interior stays crisp)
    radiusFull: 191,     // full veil from here (= the Stage-2 profile: 0.72 of the old 240 ramp)
    radiusFade: 420,     // PASS A: veil starts fading out here ...
    radiusOuter: 640,    // ... and is 0 here (was a hard-edged 480u square at 240): no visible
                         // sheet edge from the fov-30 photo views (~400u away)
    colorToken: 'Haze',
    opacity: 0.6,        // peak veil opacity per layer over the basin
    layers: 4,           // a few stacked discs -> soft depth, not a hard sheet
    submergeTop: -0.3,   // terrain faces START hazing toward mist colour below this height
    submergeBottom: -12, // ...and are FULLY mist by here (hazes the whole rim drop;
                         // fixes the Stage-1 dark over-steep rim facet + adds depth)
  },

  // fog for island mode. PASS A GAME PARITY: linear fog anchored to the CAMERA like
  // the game (gitaway/src/world/DayCycle.tsx: near = cameraDistance + 40, far = +230).
  // camDist = camera->target distance, re-evaluated every frame and per capture, so
  // the haze stays beyond the interior at every zoom (hero 17.7u .. photo ~400u).
  // The rim mist (mist sheet + terrain submerge-fade below) is height-based and
  // independent of this, so it keeps working when zoomed out. (Stage-2 fixed values
  // were near 95 / far 340.)
  // (LEGACY single-island mode only: the blueprint island's fog lives in art/config/lookPresets.json fog.*)
  fog: { nearOffset: 40, farOffset: 230, colorToken: 'FogHaze' },

  // distant background hills: pushed WAY out + lowered + hazed so they read as
  // faint distant haze behind the mist, never as a wall fighting the floating
  // island (spec 5). Overrides look.config.background.hillBands in island mode.
  hills: [
    { radius: 200, base: -2.0, amp: 5.0, segs: 170, phase: 0.0, colorToken: 'Hill1' },
    { radius: 250, base: -1.0, amp: 6.0, segs: 180, phase: 2.2, colorToken: 'Hill2' },
  ],

  // ---------------------------------------------------------------------------
  // 5. RENDER PARITY  (PASS A)  -- mirror the ACTUAL GAME renderer/camera so every
  //    proof judgement happens under the game's look (read-only refs in the game
  //    repo: src/world/World.tsx, framing.ts, DayCycle.tsx). Tone mapping lives in
  //    look.config lighting.toneMapping ('None' = R3F <Canvas flat>).
  // ---------------------------------------------------------------------------
  render: {
    camera: { fov: 30, near: 0.5, far: 600 },      // World.tsx:159 (far auto-extends past the fog in photo mode)
    // GAMEPLAY clamp = the game's OrbitControls (World.tsx:120-134). `frame` is the
    // CameraRig hero rectangle (world units around the target): rig distance =
    // max(minDistance, width/(2 tan(fov/2) aspect) * fill, height/(2 tan(fov/2))),
    // same form as framing.ts frameDistance. 8.5 x 9.5 reproduces the approved
    // Stage-1 default_mobile framing (fov 46 @ 11.2u) at fov 30 (17.7u).
    gameplay: { minDistance: 14, maxDistance: 140, minPolar: 0.62, maxPolar: 1.22,
      azimuthCenter: 0.7853981634, azimuthRange: 0.85, enablePan: false,
      damping: 0.08, rotateSpeed: 0.45, zoomSpeed: 0.6,
      frame: { width: 8.5, height: 9.5, fill: 0.95 } },
    // PHOTO mode: free orbit + wider zoom (user decision: clamped in play, free in photo).
    photo: { minDistance: 4, maxDistance: 560, minPolar: 0.05, maxPolar: 1.45 },
  },

  // ---------------------------------------------------------------------------
  // 6. CAMERAS  (spec 6)  -- the PERMANENT comparison-render presets, by name. The
  //    capture driver walks EVERY camera here in order. Each = { mode, az, el,
  //    dist, tgt:[x,y,z], w, h }; all at the game fov 30.
  //    GAMEPLAY presets obey the game clamp (checked by the viewer + tests):
  //      default_mobile (PRIMARY farm hero, portrait 0.85), default_desktop, and
  //      farm_to_meadow. dist 'rig' = CameraRig framing for the shot's aspect.
  //    PHOTO-MODE presets (free orbit, wider zoom): the whole-island views (at fov
  //      30 the ~220u island only fits from ~400u) + the landmark close-ups.
  //    Pass-A distances keep each view's Stage-2 framing at fov 30
  //    (dist30 = dist * tan(oldFov/2) / tan(15deg)).
  // ---------------------------------------------------------------------------
  cameras: {
    default_mobile:  { mode: 'gameplay', az: 34,  el: 31, dist: 'rig', tgt: [0.7, 0.55, 0.1], mobile: true, w: 900,  h: 1059 },
    default_desktop: { mode: 'gameplay', az: 34,  el: 27, dist: 'rig', tgt: [0.4, 0.7, 0.3],                w: 1600, h: 900 },
    wide_island:     { mode: 'photo',    az: 32,  el: 30, dist: 400,   tgt: [0, 2, 0],                      w: 1600, h: 900 },
    farm_to_meadow:  { mode: 'gameplay', az: 48,  el: 21, dist: 71,    tgt: [10, 1.2, 14],                  w: 1600, h: 900 },
    rocky_ledge:     { mode: 'photo',    az: -42, el: 19, dist: 108,   tgt: [50, 3.0, 48],                  w: 1600, h: 900 },
    plateau:         { mode: 'photo',    az: 128, el: 22, dist: 127,   tgt: [-42, 5.0, 46],                 w: 1600, h: 900 },
    world_edge:      { mode: 'photo',    az: 18,  el: 12, dist: 148,   tgt: [6, -1.0, -70],                 w: 1600, h: 900 },
    // --- extra whole-island orbit angles (photo mode; prove composition from all sides) ---
    orbit_ne:        { mode: 'photo',    az: 125, el: 28, dist: 409,   tgt: [0, 2, 0],                      w: 1600, h: 900 },
    orbit_sw:        { mode: 'photo',    az: 215, el: 28, dist: 409,   tgt: [0, 2, 0],                      w: 1600, h: 900 },
    orbit_back:      { mode: 'photo',    az: 300, el: 30, dist: 409,   tgt: [0, 2, 0],                      w: 1600, h: 900 },
  },

  // The two LOCKED island seeds for the comparison set (default + 1 alt): proves
  // variation without breaking the fixed farm/region structure.
  // (LEGACY single-island mode only: ?world=legacy, tests/terrain.test.mjs, tests_stage2.mjs.)
  seeds: { default: 20250617, alt: 42 },

  // ===========================================================================
  // 7. ARCHIPELAGO = THE BLUEPRINT ISLAND BUILT FROM DOCKING PIECES  (spec v3.1, 2026-10-18)
  //    The default proof world. Everything above (island/regionMap/.../cameras/seeds) is the
  //    LEGACY single-island mode, kept for ?world=legacy and the legacy regression tests.
  //    Pure data. terrain.mjs buildBlueprint() turns it into the parent heightfield + pieces.
  //    theta = Math.atan2(z, x) in RADIANS in code (terrain.ts convention); angles in this
  //    section are DEGREES (converted once by the core). The camera looks from +x/+z, so the
  //    near side is theta ~ 45 deg and the far side ~ -135 deg (= 225).
  // ===========================================================================
  archipelago: {

    // ---- STEP 0: transcription source (read-only `git show feat/idle-loop:<file>`) ----------
    source: {
      branch: 'feat/idle-loop',
      commit: '01449a29acca3f00f62822b3a38f590c5900ec35',   // 2026-10-17 "Brief the asset session on the idle loop's models"
      files: ['src/world/layout.ts', 'src/world/terrain.ts', 'src/world/Isles.tsx', 'src/world/MainIsland.tsx',
        'src/world/Water.tsx', 'src/world/framing.ts', 'src/world/Backdrop.tsx', 'src/world/DayCycle.tsx', 'src/world/skyPalette.ts'],
      lanes: {   // unmerged lane branches, read-only, only where spec v2/v3 names their spots
        mail: { branch: 'idle/mail', commit: 'c25195f49ce9ce0aac0c006b9951247da5f5e19f', file: 'src/world/places/mail.ts' },
        git: { branch: 'idle/git', commit: 'a37631148ce6522c2990c5328833b1e58ea8d0b5', file: 'src/world/features/RepoOrchard.tsx + layout.ts' },
        restoration: { branch: 'idle/restoration', commit: '67f9c72a8612a9e647d42d2dc15cf04da2fbdf6a', note: 'no src/world diff vs feat/idle-loop; notice board + jetty spots come from spec v2 section 2' },
      },
    },

    // ONE-LINE SWITCH for the pending lane edits (highland depth 1.3 + mound (-1.3,-1.45) h1.5 r2.5;
    // orchard moved to (0,-0.6,-14.2), the latter on idle/git). Default OFF until the game session
    // confirms. Spec v3.1 section 3 makes both MOOT (the pieces supersede ISLES); the switch now only
    // changes the transcribed legacy `game.ISLES` table and the exported legacy block.
    pendingLaneEdits: false,
    pending: { highland: { depth: 1.3, mound: { x: -1.3, z: -1.45, h: 1.5, r: 2.5 } }, orchardPos: [0.0, -0.6, -14.2] },

    // ---- layout.ts @ 01449a29, VERBATIM (derived constants evaluated, formula noted) ----------
    game: {
      MAIN: { seed: 11, radius: 8.8, hills: 0.8, depth: 1.25, flatCenter: 0.55,
        mounds: [{ x: -5.6, z: -4.6, h: 0.75, r: 3.2 }, { x: 6.2, z: -3.4, h: 0.35, r: 2.4 }, { x: -1.5, z: 7.2, h: 0.3, r: 2.2 }] },
      HOUSE: { x: -4.0, z: -2.0, rot: 0.7853981633974483 },          // rot: Math.PI / 4
      PORCH: [-2.75, -0.75],
      GARDEN: { x0: 0.45, z0: -1.6, cell: 1.12, plot: 0.94 },
      // plotCenter(i) = [x0 + cell*(col+0.5), z0 + cell*(row+0.5)], [col,row] = PLOT_SLOTS[i]
      PLOT_SLOTS: [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [2, 1], [0, 2], [1, 2], [2, 2], [3, 0], [3, 1], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3]],
      POND: { x: -1.7, z: 4.3, r: 1.45 },
      STREAM_THETA: 2.42,
      WINDMILL: [0.7, -5.5],
      GREENHOUSE: { x: 3.8, z: -4.25, rot: -0.12 },
      WELL: [-6.1, 0.9],
      BENCH: { x: 0.65, z: 5.75, rot: -2.1 },
      SCARECROW: [5.45, 3.4],
      LANTERNS: [[-2.3, 0.75], [-0.15, 0.05], [-2.95, 2.75], [0.85, 4.85], [-1.35, 1.65], [-4.2, 1.05]],
      // (water rev 1, 2026-10-24) FLOWERBEDS[7] moved AHEAD of the game: (-3.4, 5.5) is on the new stream; the open lawn south of the
      // pond (-1.50, 7.75) holds it (the game moves it in layout.ts with the pond, game PR 2); its FLAT ZONE stays at the old spot, frozen
      // with MAIN's zones and the piece tops (farmWater.frozen; look.test L0, bake.test B16): the new spot is level within 0.03 u
      FLOWERBEDS: [[-5.4, 0.15], [-2.15, -3.35], [5.75, 1.0], [2.6, 3.95], [1.7, -2.65], [-4.35, 2.55], [0.2, -3.3], [-1.5, 7.75]],
      FRUIT_TREES: [[6.25, -1.7], [6.7, 0.35], [6.1, 2.55], [4.75, 4.6], [2.9, 5.7], [1.1, 6.8], [-4.8, 4.6], [-0.4, -6.7]],
      BEEHIVES: [[5.0, -2.55], [5.75, -3.45], [6.45, -2.75]],
      // GX1 = x0-0.28 = 0.17, GX2 = x0+cell*4+0.28 = 5.21, GZ1 = z0-0.28 = -1.88, GZ2 = z0+cell*4+0.28 = 3.16
      FENCE_RUNS: [[[0.17, -1.88], [5.21, -1.88]], [[5.21, -1.88], [5.21, 3.16]], [[5.21, 3.16], [0.17, 3.16]],
        [[0.17, 3.16], [0.17, 1.25]], [[0.17, -0.15], [0.17, -1.88]]],
      STONE_PATHS: [[[2.2, 3.55], [1.75, 4.4], [1.2, 5.1]], [[-4.6, -0.55], [-5.25, 0.05], [-5.65, 0.55]],
        [[1.35, -2.05], [1.05, -3.2], [0.85, -4.3]], [[3.4, -2.05], [3.55, -2.75], [3.7, -3.2]]],
      DIRT_PATHS: [[[-2.85, -0.85], [-1.9, 0.05], [-0.85, 0.45], [0.2, 0.55]], [[-1.9, 0.05], [-1.95, 1.4], [-1.85, 2.75]]],
      DIRT_PATH_WIDTHS: [0.6, 0.5],                                    // MainIsland.tsx: width={i === 0 ? 0.6 : 0.5}
      STATIC_TREES: [
        { at: [-6.4, -3.6], s: 1.55, kind: 'r' }, { at: [-4.7, -5.6], s: 1.6, kind: 'p' }, { at: [-2.4, -6.4], s: 1.35, kind: 'r' },
        { at: [-7.3, -1.1], s: 1.25, kind: 'p' }, { at: [-6.2, -5.6], s: 1.2, kind: 'p' }, { at: [-1.3, -4.5], s: 0.95, kind: 'r' },
        { at: [-5.8, 3.4], s: 1.2, kind: 'r' }, { at: [3.3, -6.5], s: 1.15, kind: 'p' }, { at: [7.1, -3.6], s: 0.95, kind: 'r' }],
      BUSHES: [[-6.6, 2.3], [-3.5, -4.2], [1.9, -6.1], [6.6, 4.0], [-0.4, 6.6], [4.1, 6.4], [-6.0, -5.0], [7.4, 1.8]],
      // BLOCKERS = layout list + WORKSHOP/RESTORATION/MAIL_BLOCKERS (all three are [] at this commit)
      BLOCKERS: [
        { at: [-4.0, -2.0], r: 1.9, what: 'house' }, { at: [2.69, 0.64], r: 2.9, what: 'garden' },   // garden: [x0+cell*2, z0+cell*2]
        { at: [-1.7, 4.3], r: 1.75, what: 'pond' },                                                     // POND.r + 0.3
        { at: [0.7, -5.5], r: 1.2, what: 'windmill' }, { at: [3.8, -4.25], r: 1.6, what: 'greenhouse' }, { at: [-6.1, 0.9], r: 0.8, what: 'well' }],
      // ISLES (separate isles) -- SUPERSEDED by the v3 pieces below; kept as the record of the game today
      ISLES: {
        meadow: { seed: 23, radius: 4.4, hills: 0.5, depth: 0.7, flatCenter: 0.35, pos: [-12.6, -0.6, 8.1] },
        grove: { seed: 37, radius: 4.1, hills: 0.65, depth: 0.85, flatCenter: 0.3, pos: [-8.6, 2.4, -15.4] },
        islet: { seed: 41, radius: 2.7, hills: 0.35, depth: 0.6, flatCenter: 0.4, pos: [12.3, -0.9, -9.9] },
        wetland: { seed: 53, radius: 4.0, hills: 0.25, depth: 0.6, flatCenter: 0.5, pos: [15.75, -1.2, 2.8] },
        highland: { seed: 61, radius: 4.6, hills: 0.95, depth: 1.0, flatCenter: 0.25, pos: [-18.6, 4.2, -10.4] },
        orchard: { seed: 71, radius: 2.6, hills: 0.3, depth: 0.55, flatCenter: 0.5, pos: [1.4, 1.0, -15.8] },
        cottage: { seed: 83, radius: 3.0, hills: 0.35, depth: 0.6, flatCenter: 0.5, pos: [-3.0, -1.4, 14.4] },
      },
    },
    // game constants added after the 01449a29 snapshot, mirrored for the composition's keep-clear discs only (blueprint.keepClear below).
    // `game` above, the ground zones and the baked tops stay the frozen v3 snapshot (look L0, bake B16), so none of this reaches them.
    gameSince: {
      // places/characters.ts: Barnaby's camp (barnaby_camp, 1.0 x 0.7), its turn (rotation.y) and where he stands by it: STAND_DIST out
      // from the camp on the bearing STAND_BEARING (radians from the camp's +Z towards its +X), facing the farmhouse. CAMP_STAND is the
      // game's own number to three decimals (the formula gives (-0.71906, -0.11154)); its placement keeps thin margins (0.011 u to the
      // dirt path, 0.041 to the garden blocker), so it is mirrored as given and never nudged. CAMP_CLEAR = CHARACTER_BLOCKERS r (the camp's
      // animal clearance); STAND_CLEAR = layout.ts SLOT_DISCS r for the stand (the game keeps the composition off it). Composition C20.
      CAMP: [-0.85, -0.85], CAMP_ROT: 0.7853981633974483, STAND_BEARING: -0.61, STAND_DIST: 0.75, CAMP_STAND: [-0.719, -0.111],
      CAMP_CLEAR: 0.65, STAND_CLEAR: 0.3,
    },
    // terrain.ts makeIsland outline + cliff rings (the look the pieces reuse)
    terrainTs: {
      harmonics: [2, 3, 5, 7], amps: [0.06, 0.045, 0.025, 0.014],
      cliff: [[1.03, -0.14], [1.0, -0.48], [0.95, -1.25], [0.84, -2.2], [0.67, -3.2], [0.45, -4.1], [0.2, -4.9]], tipY: -5.5,
    },
    // Water.tsx @ 01449a29 (the game draws all water; these are the numbers the river must match)
    waterTs: {
      pondWaterLift: 0.06, pondBank: 0.32,          // pond surface = ground(POND)+0.06; bank blob r + 0.32
      stream: { startFrac: 0.7, mid1: { t: 0.35, off: [0.25, 0.35] }, mid2: { t: 0.7, off: [-0.2, -0.15] }, endInset: -0.05,
        waterLift: 0.075, endLift: 0.02, width: [0.42, 0.12], bank: [0.72, 0.1] },   // width(t) = 0.42 + 0.12 t (t = 0 pond .. 1 rim)
    },
    // ---- THE FARM POND + STREAM: ART-OWNED (water rev 1, 2026-10-24; art/specs/2026-10-23-water-revamp-design.md Revision 1) ----
    // Shape A, the Teardrop: the owner-approved outline (191 points, 9.32 u2, no self-intersection) that CLOSES ON THE CAP LINE where the
    // stream leaves it (the first and last points are the cap corners; the stream's ribbon takes over from that row). Level: the
    // ground at POND + waterTs.pondWaterLift (0.06). The stream: centripetal Catmull-Rom through these 3 points (x, z, level, width;
    // width per point, linear in the curve parameter) + the PINNED rim exit (rimPoint(MAIN, STREAM_THETA, -0.05), its level / width =
    // the wetland river's start) + a steer point `steer` u past the rim exit along the wetland river's first segment (it shapes the end
    // tangent; the stream is sampled only from P0 to the rim exit). It leaves the pond at pond level and only falls. flowSpring: the
    // pond's Laplace source. frozen: MAIN's flat zones and the piece tops are frozen (v3; look.test L0, bake.test B16), so the zones keep
    // the game's Water.tsx stream corridor and flowerbed 8's old spot; the new water and the bed's new spot sit on ground level within
    // 0.03 u, and the composition drops the V21 scatter they cover (like paths v2: every RNG stream stays V21's). The game's POND /
    // blob(POND.r, 3) / Water.tsx stream stay the legacy fallback (blueprintWater main.pond.legacy / main.stream.legacy).
    farmWater: {
      pond: { flowSpring: [-0.9, 4.1], outline: [
        [-5.0327, 6.0647], [-4.9732, 6.0905], [-4.9128, 6.1141], [-4.8512, 6.1345], [-4.7886, 6.1517], [-4.7251, 6.1645], [-4.6607, 6.1726], [-4.596, 6.177], [-4.5311, 6.178], [-4.4663, 6.1758],
        [-4.4015, 6.1725], [-4.3367, 6.1716], [-4.2718, 6.1741], [-4.2073, 6.18], [-4.143, 6.1891], [-4.079, 6.1998], [-4.0151, 6.2106], [-3.9508, 6.2194], [-3.887, 6.229], [-3.8268, 6.2532],
        [-3.7668, 6.2778], [-3.7063, 6.3013], [-3.6451, 6.3229], [-3.583, 6.3415], [-3.5197, 6.3557], [-3.4556, 6.3654], [-3.3909, 6.3707], [-3.3261, 6.3715], [-3.2614, 6.3675], [-3.1971, 6.3584],
        [-3.1333, 6.3599], [-3.0697, 6.3727], [-3.0056, 6.3831], [-2.9414, 6.3921], [-2.8771, 6.4005], [-2.8126, 6.408], [-2.7481, 6.4146], [-2.6835, 6.4203], [-2.6188, 6.4249], [-2.554, 6.4282],
        [-2.4891, 6.4294], [-2.4242, 6.4283], [-2.3595, 6.4245], [-2.295, 6.4173], [-2.2311, 6.4062], [-2.1679, 6.3916], [-2.1055, 6.374], [-2.0428, 6.3571], [-1.9807, 6.3386], [-1.9192, 6.3178],
        [-1.859, 6.2938], [-1.8003, 6.266], [-1.7435, 6.2348], [-1.6881, 6.2011], [-1.6337, 6.1657], [-1.5799, 6.1295], [-1.5255, 6.0941], [-1.47, 6.0606], [-1.4139, 6.0279], [-1.3579, 5.9952],
        [-1.3019, 5.9625], [-1.2461, 5.9295], [-1.1908, 5.8955], [-1.1363, 5.8603], [-1.0827, 5.8238], [-1.0298, 5.7862], [-0.9782, 5.7468], [-0.9285, 5.7051], [-0.8808, 5.6612], [-0.8353, 5.615],
        [-0.7921, 5.5666], [-0.7505, 5.5168], [-0.7099, 5.4662], [-0.6701, 5.415], [-0.6312, 5.3631], [-0.5934, 5.3103], [-0.5573, 5.2565], [-0.5226, 5.2017], [-0.4889, 5.1462], [-0.4559, 5.0904],
        [-0.4237, 5.034], [-0.3931, 4.9769], [-0.3647, 4.9185], [-0.3394, 4.8588], [-0.3179, 4.7976], [-0.3013, 4.7349], [-0.2909, 4.6709], [-0.286, 4.6062], [-0.2852, 4.5414], [-0.2871, 4.4765],
        [-0.2906, 4.4118], [-0.2947, 4.347], [-0.2983, 4.2822], [-0.3024, 4.2175], [-0.3086, 4.1529], [-0.3181, 4.0888], [-0.332, 4.0254], [-0.3515, 3.9636], [-0.3772, 3.904], [-0.408, 3.847],
        [-0.4417, 3.7915], [-0.4777, 3.7376], [-0.5158, 3.6851], [-0.5555, 3.6338], [-0.5965, 3.5835], [-0.6386, 3.5341], [-0.6814, 3.4854], [-0.7255, 3.4378], [-0.7708, 3.3914], [-0.8173, 3.3462],
        [-0.8657, 3.303], [-0.9165, 3.2626], [-0.9699, 3.2258], [-1.0261, 3.1934], [-1.0852, 3.1669], [-1.147, 3.1471], [-1.2104, 3.1334], [-1.2746, 3.1246], [-1.3393, 3.1194], [-1.4041, 3.1163],
        [-1.4689, 3.114], [-1.5337, 3.1118], [-1.5986, 3.1112], [-1.6635, 3.1125], [-1.7282, 3.1159], [-1.7928, 3.1219], [-1.8571, 3.1309], [-1.9208, 3.1432], [-1.9836, 3.1592], [-2.0455, 3.1788],
        [-2.1064, 3.201], [-2.1666, 3.2252], [-2.2262, 3.2509], [-2.2851, 3.2781], [-2.3432, 3.3069], [-2.4001, 3.338], [-2.4551, 3.3724], [-2.508, 3.41], [-2.5585, 3.4506], [-2.6074, 3.4933],
        [-2.655, 3.5374], [-2.7015, 3.5826], [-2.7466, 3.6292], [-2.7899, 3.6775], [-2.8308, 3.7279], [-2.8697, 3.7798], [-2.9065, 3.8332], [-2.941, 3.8881], [-2.9734, 3.9443], [-3.0052, 4.0009],
        [-3.0373, 4.0572], [-3.0706, 4.1129], [-3.1051, 4.1678], [-3.1405, 4.2222], [-3.1762, 4.2764], [-3.2116, 4.3308], [-3.2467, 4.3853], [-3.2806, 4.4406], [-3.3219, 4.4899], [-3.3696, 4.5339],
        [-3.4151, 4.5801], [-3.4587, 4.6282], [-3.5011, 4.6772], [-3.5427, 4.727], [-3.5839, 4.7771], [-3.6244, 4.8278], [-3.6634, 4.8796], [-3.6998, 4.9333], [-3.7334, 4.9888], [-3.7707, 5.041],
        [-3.8228, 5.0796], [-3.8716, 5.1224], [-3.9166, 5.169], [-3.9579, 5.219], [-3.9968, 5.271], [-4.034, 5.3241], [-4.0704, 5.3778], [-4.1064, 5.4318], [-4.1489, 5.4801], [-4.1982, 5.5223],
        [-4.2462, 5.5659], [-4.2946, 5.6091], [-4.3455, 5.6493], [-4.4005, 5.6836], [-4.4601, 5.709], [-4.5233, 5.7233], [-4.588, 5.7261], [-4.6521, 5.7169], [-4.7141, 5.6981], [-4.7742, 5.6736],
        [-4.8327, 5.6456]
      ] },
      stream: { points: [{ x: -3.6, z: 5.72, level: 0.06, width: 0.48 }, { x: -4.62, z: 5.95, level: 0.054, width: 0.45 }, { x: -5.7089, z: 5.5385, level: 0.044, width: 0.5 }], steer: 1.2 },
      frozen: { flowerbeds: { 7: [-3.4, 5.5] } },   // (FLOWERBEDS index -> the spot its frozen flat zone keeps)
    },
    // MainIsland.tsx @ 01449a29 (always drawn)
    mainIslandTsx: {
      ROCKS: [{ at: [-7.6, 1.4], s: 0.32 }, { at: [-7.1, 1.9], s: 0.18 }, { at: [7.6, -1.0], s: 0.26 }, { at: [2.0, 7.2], s: 0.24 },
        { at: [-2.8, 7.0], s: 0.3 }, { at: [5.6, -5.4], s: 0.22 }],
      HOME_FENCE: [[[-6.9, -2.3], [-6.0, -4.4]], [[-6.0, -4.4], [-4.9, -4.9]]],
    },
    // lane spots (unmerged; reserved as flat zones so the game can build there)
    lanes: {
      HEDGE_COTTAGE: { x: -4.85, z: 3.4, rot: 0.7853981633974483 },  // Hazel (mail lane; spec v2 "near (-5.2, 3.6)")
      HAZEL_SPEC: [-5.2, 3.6],
      MAILBOX: [-3.95, 3.85], HAZEL: [-4.25, 3.35], BURROW_DOOR: [-0.45, -4.75], BRAMBLE: [0.1, -4.2],
      NOTICE_BOARD: [-0.9, -1.0],                                    // restoration (spec v2)
      JETTY: [[-0.3, 4.8], [-1.25, 4.45]],
      // RepoOrchard.tsx (idle/git): tree spots as (across, towards camera); local xz = [(u+v)/sqrt2, (v-u)/sqrt2]
      ORCHARD_ROWS: [[0, 0.55], [-1.05, 0.45], [1.05, 0.45], [-0.55, -0.6], [0.55, -0.6], [-1.55, -0.75], [1.55, -0.75], [0, -1.55]],
      ORCHARD_SIGN_OFFSET: [0.3, 0.42],
    },

    // ---- MAIN flat zones: every layout.ts spot is held FLAT at y = 0 (spec v3.1 sections 2, 3) ----
    mainZones: {
      level: 0, margin: 0.3, feather: 1.1,   // exactly flat to r + margin, eased back to the meadow over `feather`
      core: 4.8,                             // spec: near-flat core out to ~4.8 u
      radii: { house: 1.9, porch: 0.6, notice: 0.45, hedgeCottage: 0.9, hazelSpec: 0.9, mailbox: 0.3, hazel: 0.3, burrow: 0.55,
        bramble: 0.3, pondBank: 0.32, jettyHalf: 0.35, streamHalf: 0.45, windmill: 1.2, greenhouse: 1.6, well: 0.8, bench: 0.6,
        scarecrow: 0.4, lantern: 0.3, flowerbed: 0.6, fruitTree: 0.55, beehive: 0.35, treeBase: 0.3, treePerScale: 0.2,
        bush: 0.45, rock: 0.4, dirtPathHalf: 0.35, stonePathHalf: 0.3, fenceHalf: 0.2, plot: 0.47 },
      gentleSlope: 0.268,                    // tan 15 deg (STYLE T6): max rise/run anywhere inside MAIN
    },

    // ---- THE PARENT (BLUEPRINT) ISLAND ------------------------------------------------------
    blueprint: {
      mainRimN: 320,          // MAIN rim vertices (uniform theta); every seam starts ON one of them
      mainRing: 0.2,          // MAIN top ring spacing (u)
      petalRings: 84,         // rings between MAIN's rim (g=0) and the coast (g=1), shared by all pieces
      tierStep: 0.75,         // u per tier (spec: tenths of a unit); ledge risers are one tier tall
      latticeCell: 1.5,       // tier-solver lattice (|dTier| <= 1 between 4-neighbours => ledges >= one cell apart)
      jitter: 0.28,           // interior vertex jitter (fraction of the local spacing) -> no regular facet pattern
      // joined-island coast (outer rim): Gaussian-weighted targets [deg, radius] + harmonics + the islet promontory
      coast: {
        targets: [[47, 23.0], [125, 25.0], [177, 25.5], [230, 30.0], [280, 26.0], [312, 25.5], [347, 25.0]],
        sigma: 30,
        harmonics: [[3, 0.016, 0.6], [5, 0.012, 2.1], [7, 0.008, 4.4], [11, 0.005, 1.3]],
        promontory: { theta: 347, width: 5.0, gain: 4.6 },
      },
      // underside: depth by distance to the parent coast (dc), terrain.ts cliff-ring profile
      // (rf -> dc/reach = 1-rf), deepest = -tipY*depth; it bottoms out inside the cloud sea
      // v4 LOOK pass: wallH = the outer coast WALL (u below the top, the same everywhere: concept H), then the rock
      // cone `profile` [[dc, u below the wall bottom]] tapering to a deep tip (hidden in the cloud sea); U follows the
      // top for topBlend u inland so a plateau's wall is as tall as a meadow's. (depth/reach/coastLip = v3 bowl, unused)
      underside: { depth: 2.9, reach: 24, crag: 2.0, cragFreq: 0.22, cragIn: 1.2, dfCell: 0.5, ringStep: 4, angStep: 3, coastLip: 0.48,
        wallH: 2.0, topBlend: 5.0, ribs: { amp: 1.6, freq: 0.42, in: 1.0 },
        profile: [[0, 0], [1.0, 2.6], [2.5, 5.0], [5.0, 8.4], [9.0, 13.2], [14.0, 18.0], [19.0, 21.5], [24.0, 23.5], [40, 25]],
        // pieces v2: the GAME's (baked) pieces hang shallower: the cone below the wall is squashed by gameScale (bake profile
        // underScale; blueprint.pieces.json depth / bottomLocal follow it). The full-res proof keeps the profile above (scale 1).
        gameScale: 0.7,
        // v5 seam taper (idle-economy design 2026-10-23 section 1, ruling R1 = option B): each petal's underside also falls toward its
        // two seams, as if they were coasts (terrain.mjs Uat), fading from full inland to none at the outer coast over dc `fade` u, so
        // a petal docked alone hangs like its own rock (a 2 u lip on its seams, then its own cone) instead of a radial slab; under
        // MAIN a petal's underside stays `gap` u below MAIN's cone. The joined island's default view is visually unchanged; at low tilt its
        // underside reads as hanging lobes (accepted, R1).
        seamTaper: { fade: [0, 6], gap: 0.6 } },
      // v4: coast wall = vertical slab facets (blocks ~facetW wide, set back up to amp under the grass lip, outShare of
      // them stand proud), rows every rowStep; MAIN's own rim (when nothing is docked) = a ~2 u near-vertical wall too
      coastWall: { facetW: 1.15, amp: 0.3, outShare: 0.35, jig: 0.07, rowStep: 0.55, lip: 0.07, foot: 0.22 },
      wallColour: { lip: [0.04, 0.12], soil: [0.12, 0.3], soilMix: 0.45, under: 0.06, underFade: [0.6, 4.0] },
      mainCone: { depth: 1.25, rings: [[0.997, -0.45], [0.99, -1.0], [0.982, -1.6], [0.9, -2.3], [0.76, -3.1], [0.56, -4.0], [0.34, -4.7], [0.15, -5.2]], tipY: -5.5,
        wobble: 0.12, yJitter: 0.3 },
      seamWall: { rowStep: 1.1, amp: 0.32, freq: 0.6, lipRow: 0.35 },   // shared rugged rock curtain between neighbours (+ a thin grassy lip row)
      coastLip: { drop: 0.18, width: 1.3, theta: [-5, 140], soft: 25 },   // soft grassy shoulder on the near side only
      gentleSlope: 0.268,
      // PIECES in CCW order; `from` = the piece's LEFT seam (deg at MAIN's rim, snapped to a MAIN rim vertex);
      // its right seam is the next piece's `from`. `sway` = how far (deg) that left seam swings by the coast.
      pieces: [
        { id: 'meadow',   from: 4.5,    sway: 2.0,  pivot: [10.9, 11.7],   core: 2.6, step: 0.42, low: true,
          unlock: 'any order (land price)', identity: 'open meadow, flower drifts, grazing sheep', focal: 'flock' },
        { id: 'wetland',  from: 90.0,   sway: -2.5, pivot: [-12.6, 11.4],  core: 2.4, step: 0.38, low: true,
          unlock: 'any order + 4 restorations', identity: 'lake, river, waterfall', focal: 'lake' },
        { id: 'cottage',  from: 159.75, sway: 2.0,  pivot: [-19.47, 1.02], core: 1.8, step: 0.36,
          unlock: 'any order (land price)', identity: 'quiet plot for the retirement cottage', focal: 'cottage' },
        { id: 'highland', from: 195.75, sway: -2.0, pivot: [-16.37, -17.55], core: 2.8, step: 0.28,
          unlock: 'any order + 9 restorations', identity: 'flat-topped plateau + rocky ledges', focal: 'plateau' },
        { id: 'orchard',  from: 264.375, sway: 2.0, pivot: [2.8, -15.8],   core: 1.8, step: 0.36,
          unlock: 'any order (land price)', identity: 'small orchard, one tree per repository', focal: 'orchard' },
        { id: 'grove',    from: 295.875, sway: -2.0, pivot: [11.0, -12.3], core: 2.4, step: 0.36,
          unlock: 'any order (land price)', identity: 'dense tree clumps around a small clearing', focal: 'clearing' },
        { id: 'islet',    from: 330.75, sway: 2.0,  pivot: [18.8, -4.2],   core: 1.6, step: 0.3,   // core zone = the lighthouse (see zones)
          unlock: 'any order (land price)', identity: 'rocky promontory with the lighthouse', focal: 'lighthouse' },
      ],
      // tier features (tiers x tierH, default tierStep), world coordinates; terraced = rock risers, else grassy ramps
      features: [
        // F upper plateau + D rocky ledges (v4 LOOK pass): a MESA of two nested flat-topped levels, each edged by a
        // TIGHT riser (feather 0.12 u -> near-vertical warm-stone cliff), 1.5 u per tier (tierH), so the plateau top
        // stays at the docked level 3.0 (2 tiers) with two TALL risers instead of the v3 4-tier smooth ramp (a dome).
        // Level 1 (the ledge, y 1.5) and level 2 (the top, y 3.0) are sectors set back from the highland seams
        // (195.75 / 264.375 deg) so the seam bands stay gentle; treads >= 2.3 u (> the 1.5 u lattice even with the
        // warp) -> raw |dTier| <= 1 by design. The back of the top runs out to the outer coast cliff.
        { type: 'mesa', id: 'highland_plateau', tierH: 1.5, feather: 0.12, warp: 0.5, warpFreq: 0.24,
          levels: [
            { theta: [203.0, 257.5], r0: 13.0, wobble: [[5, 0.45, 0.7], [9, 0.25, 2.4]] },      // the ledge (D rocky ledges)
            { theta: [210.5, 250.0], r0: 17.6, wobble: [[4, 0.5, 1.9], [7, 0.3, 0.2]] },       // the plateau top (F)
          ] },
        { type: 'disc', id: 'cairn_knoll', at: [-15.1, -22.38], r: 1.6, soft: 0.25, tiers: 1, warp: 0.2, tierH: 0.75 },
        { type: 'disc', id: 'tarn', at: [-20.97, -18.55], r: 1.35, soft: 0.7, tiers: -1, warp: 0.1 },
        { type: 'disc', id: 'hot_spring', at: [-11.54, -20.82], r: 0.55, soft: 0.25, tiers: -0.3, warp: 0 },
        // islet: a raised rocky headland (lighthouse + signal fire) and two rock knolls inland
        // (v4: tierH 1.2 -> taller rock risers on the rocky promontory; the lighthouse pad follows the headland top)
        { type: 'disc', id: 'islet_headland', at: [26.4, -6.1], r: 3.3, soft: 0.22, tiers: 1, warp: 0.35, tierH: 1.2 },
        { type: 'disc', id: 'islet_knoll_a', at: [21.0, -2.2], r: 1.5, soft: 0.2, tiers: 1, warp: 0.25, tierH: 1.2 },   // v4: was (21.2, -3.6), now clear of the lighthouse path
        { type: 'disc', id: 'islet_knoll_b', at: [18.6, -6.9], r: 1.2, soft: 0.2, tiers: 1, warp: 0.2, tierH: 1.2 },
        // wetland lake basin (v4: ~2.4x the v3 area, TIGHT banks -> a rock-lined shore; bed 0.75 below the meadow,
        // water level below) + a small treed islet raised back to meadow level inside it
        { type: 'disc', id: 'lake', at: [-7.2, 17.4], r: 5.0, rz: 3.5, rot: 24, soft: 0.55, tiers: -1, warp: 0.4 },
        { type: 'disc', id: 'lake_islet', at: [-5.55, 18.55], r: 1.5, rz: 1.2, rot: 30, soft: 0.3, tiers: 1, warp: 0.15 },
      ],
      // STAIRS (v4): ramp corridors cut through the mesa risers (from = lower tread, to = upper tread, world xz);
      // the only way a path climbs a cliff (STYLE C7). Stone steps are laid on them in the proof.
      stairs: [
        { id: 'ledge_stair', from: [-5.22, -10.25], to: [-6.54, -12.83], width: 1.2 },     // base -> ledge (theta 243)
        { id: 'plateau_stair', from: [-9.73, -12.45], to: [-11.51, -14.74], width: 1.2 },  // ledge -> plateau top (theta 232)
        { id: 'headland_stair', from: [21.3, -4.72], to: [23.91, -5.19], width: 1.2 },    // islet: up onto the lighthouse headland (ends on the lighthouse pad's edge)
      ],
      mounds: [   // soft rises (u), gentle
        { at: [15.2, 7.9], h: 0.32, r: 3.4 }, { at: [6.9, 17.4], h: 0.26, r: 3.0 },     // meadow swells
        { at: [13.9, -16.4], h: 0.5, r: 3.6 }, { at: [7.9, -17.0], h: 0.38, r: 3.0 },   // grove hills
        { at: [-21.5, -2.6], h: 0.3, r: 2.8 },                                            // cottage backdrop rise
      ],
      roll: { freq: 0.14, pieces: { main: 0.04, meadow: 0.15, wetland: 0.07, cottage: 0.07, highland: 0.05, orchard: 0.05, grove: 0.26, islet: 0.13 },
        coreFade: 1.6, blend: 6 },
      // WATER (the game draws it; we carve + export). Levels in world y.
      water: {
        lake: { feature: 'lake', level: -0.32, boardwalkLoop: { at: [-9.4, 15.5], r: 1.2 }, sunkenBell: { at: [-7.6, 16.9], r: 0.45 } },
        river: { // starts EXACTLY at the main stream's rim exit (rimPoint(MAIN, 2.42, -0.05)); width/level continue Water.tsx
          // v4: widens to 1.15 u and has tighter banks so the channel reads (was endWidth 0.78, bank 0.9)
          via: [[-7.65, 8.0], [-8.3, 10.2], [-8.55, 12.1]], toLakeEnd: [-8.5, 13.65], endWidth: 1.15, bedDepth: 0.3, bank: 0.6 },
        // v4: the outflow leaves the lake's far shore and falls off the outer cliff at theta 100 (faces the island_wide
        // and wetland_edge cameras); was from (-9.05, 18.75) to theta 111
        outflow: { from: [-6.95, 20.35], via: [[-6.3, 22.0]], toCoastTheta: 100, width: 0.85, bedDepth: 0.24, bank: 0.55 },
        tarn: { feature: 'tarn', below: 0.2 },        // level = plateau ground - 0.2
        hotSpring: { feature: 'hot_spring', below: 0.06 },
      },
      // paths that continue across seams (world polylines, centripetal Catmull-Rom smoothed)
      // v4 LOOK pass: ONE connected network (concept: warm winding paths between every region). Trunks start at the
      // layout.ts path slots (the porch, the stone-path ends by the well / windmill, the garden's east gate, the
      // south stepping stones) and reach every piece's core; branches link neighbours; climbs only over `stairs`.
      // Widths are concept-scale (trunks 1.1 u, branches 0.8 u; v3 connectors were 0.40-0.42 u).
      paths: [
        { id: 'to_meadow', width: 1.1, pts: [[1.2, 5.1], [2.0, 6.4], [3.1, 7.4], [4.2, 8.9], [6.4, 10.7], [8.6, 11.6], [10.4, 11.7]] },
        { id: 'to_highland', width: 1.1, pts: [[-2.75, -0.75], [-1.6, -1.9], [-1.45, -3.0], [-2.2, -4.7], [-3.0, -5.9], [-3.9, -7.1], [-4.6, -8.4],
          [-5.0, -9.5], [-5.22, -10.25], [-5.88, -11.54], [-6.54, -12.83], [-6.8, -13.35], [-7.6, -13.35], [-8.5, -12.85], [-9.36, -11.98],
          [-9.73, -12.45], [-10.62, -13.6], [-11.51, -14.74], [-11.9, -15.24], [-13.0, -16.3], [-14.3, -17.1], [-15.6, -17.5]] },
        // paths v2 (2026-10-19, the game session's composition-conflicts.md): to_islet starts 0.8 u later, clear of the garden's east
        // fence, and stops 0.3 u short of the lighthouse door; to_cottage starts at the shortened STONE_PATHS[1] end (-5.25, 0.05) and
        // runs north of the well, 0.9 u wide past the lean-to / well gap (`widths` per point); to_orchard leaves the windmill door east
        // and swings north after x 2.2, between the windmill plinth and the greenhouse. The V21 routes stay in `scatterPaths` below.
        { id: 'to_islet', width: 1.1, pts: [[6.15, -0.98], [7.2, -2.0], [9.6, -3.4], [13.5, -4.4], [17.0, -5.0], [19.6, -4.75], [20.71, -4.61],
          [21.3, -4.72], [22.6, -4.95], [23.91, -5.19], [24.5, -5.3], [24.61, -5.33]] },
        { id: 'to_cottage', width: 1.1, pts: [[-5.25, 0.05], [-5.35, 0.05], [-5.4, 0.0], [-5.7, 0.0], [-5.9, -0.2], [-6.6, -0.2], [-7.0, 0.2], [-8.7, 0.2], [-8.95, 0.45],
          [-10.6, 0.65], [-13.4, 0.9], [-15.6, 1.0], [-17.4, 1.05]], widths: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1] },
        { id: 'to_wetland', width: 1.1, pts: [[-8.2, 0.35], [-8.8, 2.2], [-9.8, 4.8], [-10.9, 7.4], [-11.9, 9.3], [-12.5, 11.6], [-12.2, 13.6], [-11.6, 14.6]] },
        { id: 'to_orchard', width: 1.1, pts: [[0.85, -4.3], [1.65, -4.3], [1.95, -4.6], [2.2, -5.1], [2.2, -5.3], [2.25, -5.35], [2.25, -6.1], [2.3, -6.15],
          [2.4, -6.8], [2.9, -8.6], [3.3, -11.0], [3.1, -13.4], [2.9, -14.2]] },
        { id: 'to_grove', width: 1.1, pts: [[7.2, -2.0], [8.3, -4.1], [9.5, -6.4], [10.3, -8.5], [10.7, -10.0]] },
        { id: 'meadow_hut', width: 0.8, pts: [[8.6, 11.6], [11.0, 9.6], [13.4, 7.8], [15.0, 6.6]] },
        { id: 'meadow_lake', width: 0.8, pts: [[4.2, 8.9], [3.0, 11.0], [1.4, 13.2], [-0.6, 14.9], [-2.0, 15.6]] },
        { id: 'base_to_orchard', width: 0.8, pts: [[-4.6, -8.4], [-3.4, -9.9], [-1.6, -11.0], [0.2, -12.3], [1.6, -13.6], [1.9, -14.1]] },
        { id: 'orchard_to_grove', width: 0.8, pts: [[4.4, -15.2], [6.6, -14.4], [8.6, -13.4], [9.0, -12.9]] },
        { id: 'rim_walk', width: 0.8, pts: [[13.5, -4.4], [16.0, -2.2], [18.0, 0.6], [19.0, 3.4], [18.6, 5.8], [16.9, 7.5], [15.0, 6.6]] },
        { id: 'plateau_walk', width: 0.8, pts: [[-15.6, -17.5], [-14.2, -19.6], [-16.6, -20.2], [-17.6, -20.6]] },
      ],
      // the V21 routes of the paths v2 rerouted: the composition's scatter keeps clearing THESE corridors (composeBlueprint), so every
      // RNG stream and the approved V21 composition stay item for item; scatter that the new routes run over is dropped afterwards
      scatterPaths: {
        to_islet: { pts: [[5.6, -0.4], [7.2, -2.0], [9.6, -3.4], [13.5, -4.4], [17.0, -5.0], [19.6, -4.75], [20.71, -4.61],
          [21.3, -4.72], [22.6, -4.95], [23.91, -5.19], [24.5, -5.3], [24.9, -5.4]] },
        to_cottage: { pts: [[-5.65, 0.55], [-6.9, 0.2], [-8.2, 0.35], [-10.6, 0.65], [-13.4, 0.9], [-15.6, 1.0], [-17.4, 1.05]] },
        to_orchard: { pts: [[0.85, -4.3], [1.95, -5.1], [2.4, -6.8], [2.9, -8.6], [3.3, -11.0], [3.1, -13.4], [2.9, -14.2]] },
      },
      // labelled flat zones per piece (WORLD xz; exported in piece-local coords). kind: building | restoration | animals | water | spot
      zones: {
        meadow: [
          { id: 'core', at: [10.9, 11.7], r: 2.6, kind: 'core' },
          { id: 'shelter', at: [5.2, 14.4], r: 1.1, kind: 'building' },
          { id: 'haystack_a', at: [6.5, 13.4], r: 0.45, kind: 'building' }, { id: 'haystack_b', at: [7.2, 14.4], r: 0.45, kind: 'building' },
          { id: 'shepherds_hut', at: [16.2, 5.6], r: 1.0, kind: 'building' },
          { id: 'sheep_shelter', at: [17.0, 9.4], r: 1.1, kind: 'building' },
          { id: 'pasture', at: [11.6, 12.4], r: 4.2, kind: 'animals', flat: false, note: 'up to 6 sheep' },
          { id: 'wildflowers', at: [13.6, 15.4], r: 2.6, kind: 'spot', flat: false },
        ],
        wetland: [
          { id: 'core', at: [-12.6, 11.4], r: 2.4, kind: 'core', note: 'firm ground beside the lake' },
          { id: 'heron_hide', at: [-12.3, 15.7], r: 0.7, kind: 'building' },
          { id: 'otter_holt', at: [-3.4, 15.9], r: 0.5, kind: 'animals', flat: false, note: "at the water's edge (v4: moved from (-5.95, 16.4), now inside the larger lake)" },
          { id: 'reed_bed_a', at: [-10.9, 17.9], r: 1.0, kind: 'spot', flat: false }, { id: 'reed_bed_b', at: [-6.4, 14.4], r: 0.9, kind: 'spot', flat: false },
        ],
        cottage: [
          { id: 'core', at: [-19.47, 1.02], r: 1.8, kind: 'core' },
          { id: 'cottage_plot', at: [-19.47, 1.02], r: 1.5, kind: 'building', note: '6-stage retirement cottage, piece outer half' },
          { id: 'cottage_garden', at: [-17.7, 2.7], r: 1.0, kind: 'restoration' },
        ],
        highland: [
          { id: 'core', at: [-16.37, -17.55], r: 2.8, kind: 'core', note: 'plateau top' },
          { id: 'summit_cairn', at: [-15.1, -22.38], r: 0.6, kind: 'restoration', note: 'top of the cairn knoll (the high point)' },
          { id: 'standing_stones', at: [-17.22, -13.69], r: 1.2, kind: 'restoration', note: 'on the plateau top near its front edge (v4: moved from (-18.79,-12.92), which the mesa side cliff now crosses)' },
          { id: 'bothy', at: [-12.19, -18.07], r: 0.8, kind: 'building' },
          { id: 'ruins', at: [-18.26, -21.76], r: 1.0, kind: 'restoration', note: 'later' },
          { id: 'goats', at: [-9.0, -10.7], r: 2.2, kind: 'animals', flat: false, note: 'up to 4 goats on the ledges' },
        ],
        orchard: [
          { id: 'core', at: [2.8, -15.8], r: 1.8, kind: 'core' },
        ],
        grove: [
          { id: 'core', at: [11.0, -12.3], r: 2.4, kind: 'core', note: 'the clearing' },
          { id: 'woodcutters_hut', at: [12.9, -10.4], r: 0.9, kind: 'building' },
          { id: 'mushroom_ring', at: [9.4, -11.3], r: 0.6, kind: 'spot' },
          { id: 'treehouse', at: [13.0, -15.6], r: 1.0, kind: 'building', flat: false, note: 'in a big tree at the clearing edge' },
        ],
        islet: [
          { id: 'core', at: [25.8, -5.96], r: 1.6, kind: 'core', note: 'lighthouse' },
          { id: 'lighthouse', at: [25.8, -5.96], r: 0.9, kind: 'building' },
          { id: 'signal_fire', at: [28.4, -6.55], r: 0.5, kind: 'restoration', note: 'outermost point' },
          { id: 'keepers_cottage', at: [22.0, -6.4], r: 0.9, kind: 'building' },
          { id: 'harbour_quay', at: [24.2, -0.6], r: 0.9, kind: 'restoration', note: 'sky-boat mooring over the cloud sea' },
          { id: 'cloud_fishing', at: [23.7, -8.4], r: 0.6, kind: 'spot' },
        ],
      },
      // open-coast anchors (islet), on the coast facing outward (resolved onto the coast by the core)
      coastAnchors: { islet: [{ id: 'harbour_mooring', theta: -1.4 }, { id: 'cloud_fishing', theta: -19.5 }, { id: 'signal_fire', theta: -12.7 },
        { id: 'lighthouse', near: 'lighthouse' }, { id: 'keepers_cottage', near: 'keepers_cottage' }],
        // the wetland jetty (idle-economy art 4; built by the Pond Jetty restoration; ASSETS.md `jetty`: deck 0.7 x 1.7 along +Z, shore end at -Z, y 0 = the waterline,
        // piles to -0.3): chosen by lakeJetty() (lib/terrain.mjs) on the lake's farm-side shore: the shore end where the bank is
        // bankAim above the lake level (inside `bank`), the deck past `overWater` u over open water, `clear` u off the zones named in
        // keepClear and the game's own lake dressing (isleSpots.ts WETLAND: lily pads, the shore-reed clumps its shore() puts at
        // these outline fractions, the bank rock; wetland-local x, z), with a dry, flat shed patch (r) beside the shore end (lore
        // BIBLE Q4); best side-on to the game's default camera, nearest the farm-side shore point `near` (local)
        // the finished model (models lane, measured): origin at the deck centre, plan 0.716 x 1.707, shore-end sill at local z -0.85
        // (top y 0.162), rope loop to x +0.37; the bank at the shore end wants level + 0.11 .. 0.16
        wetland: [{ id: 'wetland_jetty', jetty: { length: 1.71, width: 0.72, origin: 0.85, bank: [0.11, 0.16], bankAim: 0.15, smooth: 0.35, overWater: 0.45, clear: 0.15, near: [4.71, 2.09],
          keepClear: ['heron_hide', 'reed_bed_a', 'reed_bed_b', 'otter_holt'],
          pads: { r: 0.25, at: [[3.1, 5.3], [3.55, 5.75], [2.95, 5.95], [4.7, 4.3], [5.15, 4.6], [8.6, 5.3], [8.2, 4.85], [4.7, 8.2]] },
          shoreReeds: { fractions: [0.05, 0.3, 0.62, 0.84], inset: 0.35, r: 0.45 }, rocks: [[6.6, 1.2, 0.3]], channel: 0.6,
          shed: { r: 0.6, gap: 0.15, back: [0.6, 0.35, 0.1], dry: 0.08, path: 0.1, edge: 0.4 },
          camera: { az: 45, el: 28.88, dist: 35.5, tgt: [0, -0.6, 0] } } }] },
      // keep-clear discs the composition leaves bare (world x, z): game spots added after V21. Dropped at the end of composeBlueprint,
      // so every other placement keeps its RNG stream; the wetland jetty's deck and shed patch are kept clear the same way
      // the woodshed: spot B, back-right of the farmhouse beside its log stack (the owner's choice on 2026-10-24; it stood at
      // byHouse(-1.3, 2.25), world (-3.328, 0.51), front-left of the porch before). byHouse(2.0, -1.2) with HOUSE above; composition C17
      // derives the spot from HOUSE and checks this disc is on it
      // bush_1: layout.ts BUSHES[1], moved by the game on 2026-10-24 from (-3.5, -4.2) (the woodshed's spot) to (-4.9, -4.4), then (511aa4a, off the hero tree's root flare) to (-4.76, -4.48). The ground zones
      // (game.BUSHES above, the baked tops) are the frozen v3 snapshot and stay on the old spot, so the move is mirrored here: the slot's
      // own radius (mainZones.radii.bush); the old spot's disc lies inside the woodshed's. Composition C19 pins both
      keepClear: [
        { id: 'woodshed', at: [-3.434, -4.263], r: 0.65, pad: 0.15, note: 'layout.ts WOODSHED = byHouse(2.0, -1.2), BLOCKERS r 0.65; spot B, the owner\'s choice on 2026-10-24' },
        { id: 'bush_1', at: [-4.76, -4.48], r: 0.45, pad: 0.15, note: 'layout.ts BUSHES[1] at its new spot (game commits 38059d2, 511aa4a), r = the bush slot disc (mainZones.radii.bush)' },
        // Barnaby's camp and his stand (gameSince above): no clover or other cover shows through the bedroll or under his hem. C20
        { id: 'camp', at: [-0.85, -0.85], r: 0.65, pad: 0.15, note: 'places/characters.ts CAMP, CHARACTER_BLOCKERS r 0.65 (the game keeps the composition off r 0.75, SLOT_DISCS)' },
        { id: 'camp_stand', at: [-0.719, -0.111], r: 0.3, pad: 0.15, note: 'places/characters.ts CAMP_STAND, layout.ts SLOT_DISCS r 0.3' },
        // the big tree's root flare: the hero tree (STATIC_TREES[0], the Meshy hero_tree model at scale 1 on its spot) has roots that reach
        // 1.461 u from its origin (the lowest vertices of public/models/hero_tree.glb, as the game's modelPlacement.test.ts takes them: within
        // 0.05 u of the lowest point). `kinds`: only volumes stay off it; grass and flowers may grow between the roots. C21
        { id: 'hero_tree', at: [-6.4, -3.6], r: 1.47, pad: 0.15, kinds: ['trees', 'bushes', 'shrubs', 'rocks'], note: 'STATIC_TREES[0], hero_tree.glb root flare 1.461 u (rounded up)' },
      ],
    },

    // ---- LOOK (v4) -----------------------------------------------------------------------------------
    // water: the proof's PLACEHOLDER water = the game's Water.tsx shaders (pond / stream / fall); geometry here, its colours
    //        (palette.ts @ feat/idle-loop: water #91B7C8, waterDeep #6E9AB0, foam #E8F1F0) live in lookPresets.json water.*
    // stairs: stone step slabs laid on the stair ramps (count per u of rise, colour tokens)
    // terrain: palette tokens for the blueprint island's ground + rock (terrain-only tokens: the glb assets keep
    //          Grass / Stone, so public/models is untouched); tuft = the proof's instanced grass tufts' colour
    look: {
      water: { fallWidth: 1.0, mist: 5 },
      stairs: { stepRise: 0.25, tokens: ['CliffStone', 'CliffStoneDark'], width: 0.9 },
      terrain: { grass: 'TerrainGrass', meadow: 'TerrainMeadow', dark: 'TerrainGrassDark', stone: 'CliffStone', darkStone: 'CliffStoneDark', tuft: 'TerrainGrassDark' },
    },

    // ---- composition (piece-local where noted; trees in clumps, STYLE C4 rescaled) -------------
    composition: {
      clumping: { main: { radius: 2.2, min: 3 }, meadow: { radius: 2.0, min: 3 }, grove: { radius: 2.4, min: 4 }, highland: { radius: 2.0, min: 3 },
        wetland: { radius: 2.0, min: 3 }, cottage: { radius: 2.0, min: 3 }, orchard: { radius: 2.0, min: 3 }, islet: { radius: 2.0, min: 3 } },
      // tree clumps: world centre, count, spread radius, species, scale range
      clumps: [
        { piece: 'main', at: [-7.75, -2.75], n: 2, spread: 0.7, species: 'pine', scale: [1.0, 1.25] },
        { piece: 'main', at: [-3.15, -5.55], n: 1, spread: 0.2, species: 'round', scale: [1.0, 1.1] },
        { piece: 'meadow', at: [19.5, 3.7], n: 4, spread: 1.4, species: 'round', scale: [0.8, 1.05] },
        { piece: 'meadow', at: [3.6, 19.6], n: 4, spread: 1.4, species: 'round', scale: [0.8, 1.0] },
        { piece: 'meadow', at: [21.0, 8.4], n: 3, spread: 1.1, species: 'round', scale: [0.75, 0.95] },
        { piece: 'wetland', at: [-15.8, 8.6], n: 5, spread: 1.6, species: 'round', scale: [0.85, 1.1] },
        { piece: 'wetland', at: [-14.6, 19.2], n: 4, spread: 1.4, species: 'pine', scale: [0.9, 1.2] },
        { piece: 'wetland', at: [-4.6, 20.4], n: 3, spread: 1.2, species: 'round', scale: [0.8, 1.0] },
        { piece: 'wetland', at: [-19.6, 13.2], n: 5, spread: 1.6, species: 'pine', scale: [0.95, 1.3] },
        { piece: 'cottage', at: [-22.6, -1.9], n: 5, spread: 1.5, species: 'mix', scale: [0.9, 1.25] },
        { piece: 'cottage', at: [-15.4, -3.2], n: 3, spread: 1.2, species: 'round', scale: [0.8, 1.0] },
        { piece: 'cottage', at: [-21.8, 5.6], n: 4, spread: 1.4, species: 'pine', scale: [0.95, 1.3] },
        { piece: 'highland', at: [-19.6, -21.4], n: 4, spread: 1.6, species: 'pine', scale: [1.0, 1.4] },
        { piece: 'highland', at: [-22.2, -15.0], n: 6, spread: 1.8, species: 'pine', scale: [1.0, 1.45] },
        { piece: 'highland', at: [-11.0, -24.8], n: 5, spread: 1.6, species: 'pine', scale: [1.0, 1.35] },
        { piece: 'highland', at: [-17.6, -8.6], n: 5, spread: 1.6, species: 'mix', scale: [0.9, 1.25] },
        { piece: 'highland', at: [-4.2, -13.2], n: 3, spread: 1.2, species: 'round', scale: [0.85, 1.05] },
        { piece: 'orchard', at: [-0.6, -20.6], n: 5, spread: 1.5, species: 'pine', scale: [1.0, 1.3] },
        { piece: 'orchard', at: [6.9, -20.2], n: 3, spread: 1.2, species: 'round', scale: [0.9, 1.15] },
        { piece: 'orchard', at: [1.4, -24.2], n: 3, spread: 1.1, species: 'pine', scale: [0.95, 1.25] },
        { piece: 'grove', at: [14.4, -16.0], n: 8, spread: 2.0, species: 'pine', scale: [0.95, 1.4] },
        { piece: 'grove', at: [8.0, -16.4], n: 6, spread: 1.8, species: 'mix', scale: [0.9, 1.3] },
        { piece: 'grove', at: [16.4, -10.0], n: 6, spread: 1.8, species: 'pine', scale: [0.9, 1.35] },
        { piece: 'grove', at: [11.6, -21.0], n: 6, spread: 1.8, species: 'pine', scale: [1.0, 1.4] },
        { piece: 'grove', at: [19.4, -14.8], n: 6, spread: 1.8, species: 'round', scale: [0.85, 1.15] },
        { piece: 'grove', at: [7.6, -11.2], n: 4, spread: 1.3, species: 'mix', scale: [0.85, 1.15] },
        { piece: 'islet', at: [17.4, -6.2], n: 3, spread: 1.1, species: 'pine', scale: [0.8, 1.05] },
        { piece: 'islet', at: [12.6, -5.4], n: 3, spread: 1.1, species: 'round', scale: [0.75, 0.95] },
      ],
      // FORESTS (v4 LOOK pass, concept: wooded everywhere outside the farm, the clearing and the meadow): candidates on a
      // jittered `cell` grid per petal; each rule gives a density (x its per-piece weight); the strongest wins, times a
      // low-frequency glade mask (stands separated by clearings, STYLE C4) unless noGlades; min trunk spacing per species.
      //   coast: band dc [in, full, fade] from the outer coast (the rim tree line)   fill: the whole piece
      //   lakeshore: band [in, full, fade] from the waterline (incl. the lake islet)  cliff: next to a riser (top or foot)
      forests: {
        cell: 0.5, maxSlope: 0.7, coastIn: 0.75, seamIn: 0.4, coreClear: 0.5, footClear: 2.0,   // footClear: no tree within this of a riser rising above it
        sep: { pine: 0.72, round: 0.88 },
        clearing: { freq: 0.17, lo: 0.3, hi: 0.46 },
        rules: [
          { id: 'rim', kind: 'coast', dc: [0.75, 3.4, 5.6], pieces: { grove: 1, highland: 1, cottage: 1, orchard: 1, wetland: 1, islet: 0.45, meadow: 0.28 }, pine: 0.55, scale: [0.95, 1.45] },
          { id: 'grove', kind: 'fill', pieces: { grove: 1 }, pine: 0.5, scale: [0.95, 1.5], clear: [{ at: [11.0, -12.3], r: 3.4 }], noGlades: true },
          { id: 'lakeshore', kind: 'lakeshore', band: [0.55, 2.4, 3.6], pieces: { wetland: 0.95 }, pine: 0.15, scale: [0.85, 1.25], noGlades: true },
          { id: 'cliffs', kind: 'cliff', probe: [1.0, 1.8], pieces: { highland: 0.95, islet: 0.6 }, pine: 0.75, scale: [1.0, 1.45] },
          { id: 'woods', kind: 'fill', pieces: { highland: 1.0, cottage: 0.9, orchard: 0.7, wetland: 0.6, islet: 0.15 }, pine: 0.6, scale: [0.9, 1.4] },
        ],
      },
      treeAvoid: 0.55,       // trees keep this far (u) from any flat zone edge / path / water
      treeEdge: 0.9,         // ... and this far inside their piece's boundary
      sightCorridor: { theta: [22, 68], r: 16 },   // no trees in the near-side line of sight to the farm
      flowers: { main: 200, meadow: 650, wetland: 170, cottage: 150, highland: 220, orchard: 120, grove: 90, islet: 80 },
      grass: { main: 260, meadow: 420, wetland: 260, cottage: 150, highland: 300, orchard: 130, grove: 200, islet: 140 },
      sheep: [[9.6, 12.8, 0.4], [11.7, 10.2, 2.1], [12.9, 13.2, -1.0], [8.4, 10.9, 3.0], [13.6, 11.1, 1.2]],   // world x, z, yaw
      rocksPerPiece: { meadow: 8, wetland: 9, cottage: 7, highland: 28, orchard: 6, grove: 10, islet: 32 },
      // v4 boulders (STYLE C5): clusters along the lake waterline (band = offset from the shore, - = in the water),
      // round the lake islet and along the river banks; clusters at the foot of the risers (mesa, islet knolls)
      shoreRocks: { wetland: { lake: 14, band: [-0.15, 0.45], islet: 'lake_islet', isletN: 5, river: 7 } },
      cliffRocks: { highland: { clusters: 12 }, islet: { clusters: 12, rise: 0.8 } },   // rise: what counts as a riser above the spot (u)
      bushesPerPiece: { meadow: 9, wetland: 16, cottage: 9, highland: 9, orchard: 7, grove: 18, islet: 6 },
      // WORLDSEED-BRIEF plants & shapes (lib/terrain.mjs composeBlueprint PLANTS block; drawn by the moods, preset plants.*):
      // tree variant shares, the woodland-edge shrub belt, composed flower drifts (palette tokens; [token, share] per scheme)
      plants: {
        variants: { firShare: { highland: 0.68, grove: 0.62, wetland: 0.3, islet: 0.35 }, firDefault: 0.5, edgeSapling: 0.38 },
        shrubs: { cell: 0.42, keep: 0.55, minSep: 0.5, trunkClear: 0.42, reach: [0.55, 1.85], scale: [0.5, 1.05], max: 220 },
        flowers: { minSep: 0.13, patchSep: 2.4, houseR: 3.6, gardenR: 5.2,
          schemes: { whiteViolet: [['SoftCream', 0.55], ['Lavender', 0.45]], warm: [['GoldenYellow', 0.6], ['Coral', 0.4]], pink: [['Blossom', 0.62], ['SoftCream', 0.38]],
            gold: [['GoldenYellow', 0.68], ['SoftCream', 0.32]], violet: [['Lavender', 0.7], ['Blossom', 0.3]] },
          defaults: { main: ['gold', 'whiteViolet'], meadow: ['whiteViolet', 'gold', 'whiteViolet', 'pink'], wetland: ['violet', 'whiteViolet'], cottage: ['pink', 'whiteViolet'],
            highland: ['gold', 'whiteViolet'], orchard: ['pink', 'gold'], grove: ['whiteViolet', 'violet'], islet: ['gold', 'violet'] } },
      },
      // the GROUND ZONES (lib/terrain.mjs groundZones; the ground-vegetation spec art/specs/2026-10-25-ground-vegetation-design.md §3):
      // keys here override lib/terrain.mjs GROUND key by key. spots: per piece, spots the zones see and nothing else reads (so no other
      // composed list moves), keep 'clear' (nothing inside, A out to its halo) or 'tidy' (A inside, no halo). MAIN: the animal yards
      ground: {
        spots: {
          main: [
            { what: 'chicken_yard_0', keep: 'tidy', halo: 0, x: -1.5, z: -1.7, r: 1.5, note: 'layout.ts:86-91 CHICKEN_YARDS[0], where the chickens scratch about by the farmhouse' },
            { what: 'chicken_yard_1', keep: 'tidy', halo: 0, x: -3.0, z: 1.6, r: 1.0, note: 'layout.ts:86-91 CHICKEN_YARDS[1], between the lanterns and the pond' },
            { what: 'dog_yard', keep: 'tidy', halo: 0, x: -1.2, z: 1.5, r: 1.3, note: 'layout.ts:86-91 DOG_YARD, where the dog trots about by the path to the pond' },
          ],
        },
        // MAIN's cover as zoned clusters (lib/terrain.mjs clusterCover; plan Task 2): the most items per u^2 each zone takes (E: its
        // 0.25-0.7 u band, as a share of the lawn's density). Ruling GR8: at the top of each zone window (cover V11: A 0.8-1.5, lawn 3-4,
        // C 3-5, B 5-7, D 1.5-2.5, E <= half the lawn), so both seeds carry 300-340 plants. Each zone's count is floor(density x its area),
        // so it lands on or just under these on either seed (the margin inside each window is that rounding)
        density: { A: 1.5, lawn: 3.95, C: 4.99, B: 6.99, D: 2.49, E: 0.5 },
      },
    },

    // ---- unlock states, cameras, sea, lighting ------------------------------------------------
    unlockOrder: ['meadow', 'grove', 'islet', 'orchard', 'wetland', 'highland', 'cottage'],
    defaultUnlocked: 'all',
    render: {
      camera: { fov: 30, near: 0.5, far: 600 },
      // framing.ts VIEW + frameDistance (main alone): target, dir, MAIN frame 27 x 19, fill 0.95, floor 30
      view: { target: [0, -0.6, 0], dir: [1, 0.78, 1], mainFrame: [27, 19], fill: 0.95, floor: 30, maxDistance: 130 },
      gameplay: { minDistance: 14, maxDistance: 140, minPolar: 0.62, maxPolar: 1.22, azimuthCenter: 0.7853981634, azimuthRange: 0.85 },
      photo: { minDistance: 4, maxDistance: 320, minPolar: 0.05, maxPolar: 1.5 },
    },
    // dist 'frame' = framing.ts frameDistance([], aspect) (the starting state). az/el in degrees,
    // el 28.88 = atan(0.78 / sqrt 2) (framing.ts VIEW.dir). Gameplay targets = VIEW.target (no pan).
    cameras: {
      default_mobile:      { mode: 'gameplay', az: 45, el: 28.88, dist: 'frame', tgt: [0, -0.6, 0], w: 720, h: 1560 },
      default_desktop:     { mode: 'gameplay', az: 45, el: 28.88, dist: 'frame', tgt: [0, -0.6, 0], w: 1600, h: 900 },
      farm_to_meadow:      { mode: 'gameplay', az: 30, el: 21, dist: 27, tgt: [0, -0.6, 0], w: 1600, h: 900 },
      max_zoom_all:        { mode: 'gameplay', az: 45, el: 28.88, dist: 140, tgt: [0, -0.6, 0], w: 1600, h: 900 },
      max_zoom_portrait:   { mode: 'gameplay', az: 45, el: 28.88, dist: 140, tgt: [0, -0.6, 0], w: 720, h: 1560 },
      // v4: framed TIGHT on the island like the concept's joined-island crop (was dist 118: ~52% of the width, the rest sky)
      island_wide:         { mode: 'photo', az: 32, el: 38, dist: 74, tgt: [-1.2, -1.6, -1.2], w: 1600, h: 900 },
      highland:            { mode: 'photo', az: 52, el: 24, dist: 30, tgt: [-10.5, 1.2, -15.0], w: 1600, h: 900 },
      islet:               { mode: 'photo', az: 22, el: 19, dist: 24, tgt: [22.5, 0.0, -5.5], w: 1600, h: 900 },
      grove:               { mode: 'photo', az: 72, el: 29, dist: 27, tgt: [11.5, 0.4, -13.5], w: 1600, h: 900 },
      meadow:              { mode: 'photo', az: 40, el: 30, dist: 27, tgt: [11.0, 0.0, 11.5], w: 1600, h: 900 },
      // v4: from OUTSIDE the wetland's outer cliff (was az 74 el 27 dist 23 tgt (-7.6,-0.2,10.4), which faced away from
      // the outer rim): the waterfall off the cliff, the rock-lined lake + islet behind it, MAIN beyond (concept 4 + G)
      wetland_edge:        { mode: 'photo', az: 12, el: 24, dist: 27, tgt: [-6.8, -0.8, 18.0], w: 1600, h: 900 },
      rim_edge:            { mode: 'photo', az: 130, el: 9, dist: 36, tgt: [19.5, -3.5, -16.5], w: 1600, h: 900 },
      docking:             { mode: 'photo', az: 45, el: 25, dist: 62, tgt: [6.0, -3.0, 6.0], w: 1600, h: 900,
        unlocked: 'main,wetland,cottage,highland,orchard,grove,islet', dock: { piece: 'meadow', t: 0.45 } },
    },
    // v4: free-orbit check angles of the joined island (front = the camera side, side, back); captured with
    // `capture.mjs <prefix> --set orbits` (?set=orbits) so the 13-preset comparison set stays unchanged
    orbits: {
      orbit_front: { mode: 'photo', az: 40, el: 30, dist: 92, tgt: [-1.0, -2.5, -1.0], w: 1600, h: 900 },
      orbit_side:  { mode: 'photo', az: 130, el: 26, dist: 92, tgt: [-1.0, -2.5, -1.0], w: 1600, h: 900 },
      orbit_back:  { mode: 'photo', az: 225, el: 30, dist: 92, tgt: [-1.0, -2.5, -1.0], w: 1600, h: 900 },
    },
    seeds: { default: 11, alt: 42 },   // 11 = the game's seeds (MAIN seed 11; pieces derive from it); 42 = variation test
    // LOOK-BRIEF Phase 0: the 7 FIXED COMPARISON VIEWS (?view=<name>; `node look-capture.mjs <phase>` captures all 7 into
    // art/screenshots/<phase>/raw/<view>.png, `node look-sheet.mjs <before> <after>` builds the side-by-side sheets).
    // Photo mode, everything unlocked, seed 11, 1600x900, game fov 30. Every later phase re-captures exactly these.
    // `full` also anchors the sun: lookPresets.json sun.azimuthDeg is relative to views.full.az (0 = from behind the camera).
    views: {
      full:      { mode: 'photo', az: 32, el: 38, dist: 74, tgt: [-1.2, -1.6, -1.2], w: 1600, h: 900, unlocked: 'all' },
      farm:      { mode: 'photo', az: 40, el: 30, dist: 17, tgt: [-0.6, 0.3, 0.2], w: 1600, h: 900, unlocked: 'all' },
      lake:      { mode: 'photo', az: 100, el: 44, dist: 21, tgt: [-7.0, -0.3, 17.8], w: 1600, h: 900, unlocked: 'all' },
      waterfall: { mode: 'photo', az: 20, el: 23, dist: 34, tgt: [-5.2, -4.0, 19.5], w: 1600, h: 900, unlocked: 'all' },
      junction:  { mode: 'photo', az: 60, el: 44, dist: 15, tgt: [-6.6, 0.0, 0.6], w: 1600, h: 900, unlocked: 'all' },
      woodland:  { mode: 'photo', az: 75, el: 14, dist: 12, tgt: [-9.5, 0.2, 5.5], w: 1600, h: 900, unlocked: 'all' },
      edge:      { mode: 'photo', az: 130, el: 5, dist: 60, tgt: [10.0, -10.0, -8.0], w: 1600, h: 900, unlocked: 'all' },
    },
    // the water revamp's extra fixed view (art/specs/2026-10-23-water-revamp-design.md 4.1; the proof's ?view= also takes these;
    // kept apart from `views` so the 7 LOOK-BRIEF comparison views stay exactly 7)
    waterViews: {
      pond:      { mode: 'photo', az: 20, el: 40, dist: 11, tgt: [-3.2, 0.0, 4.9], w: 1600, h: 900, unlocked: 'all' },
    },
    // cloud sea LAYOUT (Backdrop.tsx CloudField geometry). Its colours / material / deck opacity and its motion are LOOK values:
    // art/config/lookPresets.json clouds.* and wind.clouds.*
    sea: {
      cloudY: [-14, -10.5],            // Backdrop.tsx CLOUD_SEA_Y
      field: { count: 150, inner: 4, outer: 110, scale: 3.0, seed: 12, clearArc: 1.15, clearDist: 24 },
      drift: { count: 6, inner: 44, outer: 78, y: [-7, -2], scale: 2.2, seed: 29, arc: [-2.36, 1.0] },   // Backdrop.tsx FAR_ARC
      deck: { y: -12.6, radius: 190, inner: 0.0 },   // soft cloud deck under the puffs (the "sea")
      distantIsles: [ { seed: 101, r: 2.4, p: [-52, -10, -46] }, { seed: 102, r: 1.6, p: [-18, -7, -66] },
        { seed: 103, r: 2.8, p: [46, -14, -58] }, { seed: 104, r: 1.4, p: [-70, -15, 8] } ],
    },
    // LIGHTING moved (LOOK-BRIEF Phase 0) to art/config/lookPresets.json: every light / sky / fog / shadow / tone-mapping value,
    // per named preset ('Game (current)' = the game's day cycle at 13 h, the old default), plus the skyPalette.ts day-cycle
    // table (dayCycle) that ?hour=H uses. ?light=proof still works (= ?look=Proof warm (v4)).
  },
};
