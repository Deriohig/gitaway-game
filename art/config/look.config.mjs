// look.config.mjs  --  GITAWAY SINGLE SOURCE OF TRUTH FOR LOOK & FEEL
// =============================================================================
// Pure DATA only (one object literal, no functions, no logic). Edit the values,
// then run:   cd art/scripts && node build.mjs
// ...to rebuild the model .glb files AND regenerate the proof viewer (index.html)
// with your new look. Both the asset "style kit" (lib/materials.mjs) and the
// scene viewer (lib/viewer.mjs) read EVERYTHING from this file -- there is no
// second copy of any colour or number anywhere.
//
// HOW COLOUR WORKS:
//   * `palette` holds every named colour ONCE, as a hex string. Everything else
//     that needs a colour refers to a palette name (a "token"), e.g. 'Grass'.
//   * `colorGrade` is a global tint applied to ASSET materials only (the glb
//     models) -- scene/terrain colours use the raw palette hex. This mirrors the
//     current look; keep grade small to stay natural.
// Ranges below are friendly guidance, not hard limits.
// =============================================================================

export default {

  // ---------------------------------------------------------------------------
  // 1. PALETTE  --  every colour, defined once. Change a hex here and it updates
  //    everywhere that colour is used (models + scene).
  // ---------------------------------------------------------------------------
  palette: {
    // walls / trims
    WarmIvory: '#F3E4C4',     // farmhouse walls (cream)
    SoftCream: '#FBF1DA',     // trims / cream flowers / highlights
    WallShade: '#E6D2A8',     // darker wall shade (spare)
    // foliage greens (multiple, related; dark = depth, light = sun side)
    DeepFoliage: '#3F5E46',   // darkest green (pine core, tree shade)
    ForestGreen: '#496A50',   // deep foliage
    MeadowGreen: '#91AD72',   // mid foliage / garden green
    Grass: '#86AD5E',         // ground grass
    GrassDark: '#587C43',     // grass in hollows / under clusters (shaded)
    SageGreen: '#B5C88A',     // light meadow green (tree-top tint)
    MeadowLight: '#B9D783',   // light meadow (terrain highs / sunlit grass)
    FreshFoliage: '#B5D96B',  // fresh sun-lit leaf tops
    // earth
    Soil: '#B98B61',          // bare soil
    DarkSoil: '#8E6A47',      // darker soil (spare)
    Path: '#C2935E',          // dirt path (warm brown; clearly reads vs grass)
    Dirt: '#C79A6E',          // the old flat plot's soil bed (retired from the plot: it read as timber)
    // tilled soil (ART-BIBLE §B.2 soil.bed / soil.shade / soil.dry, owner 2026-10-25): the painted plot's soil cell
    SoilBed: '#6E5444',       // tilled soil
    SoilShade: '#5B4538',     // furrow troughs
    SoilDry: '#8A6B55',       // dry crests
    // timber
    MutedWood: '#986641',     // timber (posts, fences, porch)
    DarkWood: '#6E4A2F',      // dark timber (door, trunk flare, pine trunk)
    LightWood: '#C79A6A',     // light timber (firewood)
    // roof / clay
    Terracotta: '#B9654B',    // roof tiles, flower boxes
    TerracottaDark: '#9C4E39',// roof ridge/eave/tile shade band
    // stone
    Stone: '#C3B49A',         // stone foundation, rocks
    DarkStone: '#9C8C74',     // darker stone (chimney, rock accent)
    // v4 LOOK pass, TERRAIN-ONLY tokens (the blueprint island's ground + rock; the glb assets keep Grass/Stone):
    // the concept's grass renders yellow-green (hue ~56, sat ~0.65), its cliffs a low-sat weathered stone
    TerrainGrass: '#B4C25A',  // ground grass (yellow-green)
    TerrainMeadow: '#CCD46E', // sunlit meadow / terrace tops
    TerrainGrassDark: '#7C9140', // grass in hollows / slope shade
    CliffStone: '#D0C9BB',    // riser + coast-wall stone (low-sat: reads as stone, not orange, in the warm sun)
    CliffStoneDark: '#ABA394',// stone shade / strata band
    UnderStone: '#C6C3BB',    // island underside, deep (near-neutral warm grey: reads as stone, not brown, under the warm ground bounce)
    UnderStoneDark: '#A29E95',// island underside shade band
    // flower accents (keep lively but not neon)
    Coral: '#E58A6A',
    Wildflower: '#E58A6A',    // alias of Coral
    Blossom: '#E7A6AE',       // soft pink
    SoftPink: '#E7A6AE',      // alias of Blossom
    GoldenYellow: '#EFC25A',
    GoldenSunlight: '#EFC25A',// alias of GoldenYellow (hay/flowers)
    Lavender: '#B9A3D4',
    // dark accent
    DeepWarmInk: '#3E352B',
    // lit glass
    Glow: '#F5DCA0',          // window panes (emissive; the game lights at night)
    Glass: '#A9D4E8',         // greenhouse glass tint (translucent)
    // sky / atmosphere / scene-only colours
    SkyTop: '#83C5F0',        // sky overhead (clear blue)
    Sun: '#FFD58A',           // sun light (warm key)
    Haze: '#D5DCCB',          // distance fog / horizon haze (light neutral)
    FogHaze: '#C7D7D9',       // island distance fog (sky-tinted so far regions recede)
    Hill0: '#789A65',         // nearest background hill band (green)
    Hill1: '#91B4A0',         // middle band (hazier green-grey)
    Hill2: '#B8CDE0',         // far band (lightest, blue-grey into sky)
    Cloud: '#FBF3E2',         // cloud cream
    Smoke: '#EFE6D6',         // chimney smoke
    ContactShadow: '#372A1C', // soft fake-AO contact shadow tint
    // light tints (unique to lighting)
    HemiSky: '#BCDCEA',       // hemisphere light from the sky
    HemiGround: '#A98A5E',    // hemisphere bounce from the ground
    AmbientFill: '#EFDCB2',   // warm ambient fill
    // misc
    Water: '#6FB8B0',         // clear blue-green water (spare)
  },

  // ---------------------------------------------------------------------------
  // 2. COLOR GRADE  --  global tint applied to ASSET (glb) materials only.
  //    Formula per channel: newSat = clamp(sat*(1+global.saturation)+group.sat);
  //    hue pulled toward warm by (global.warmth+group.warmth); lightness += sum.
  //    Scene/terrain colours use raw palette hex (unaffected).
  // ---------------------------------------------------------------------------
  colorGrade: {
    global: {
      saturation: 0.05,   // -0.3..0.4  overall richness (multiplicative). Up = more vivid
      warmth: 0.0,        // 0..0.3     pull hues toward golden. 0 = faithful hues
      lightness: 0.0,     // -0.1..0.1  overall brighten(+)/darken(-)
    },
    // Additive nudges per material group (on top of global).
    groups: {
      greens:   { saturation: 0.0,  warmth: 0.0, lightness: 0.0,
        keys: ['DeepFoliage','ForestGreen','MeadowGreen','Grass','GrassDark','SageGreen','MeadowLight','FreshFoliage'] },
      flowers:  { saturation: 0.04, warmth: 0.0, lightness: 0.0,   // small pop on blooms
        keys: ['Coral','Wildflower','Blossom','SoftPink','GoldenYellow','GoldenSunlight','Lavender'] },
      neutrals: { saturation: 0.0,  warmth: 0.0, lightness: 0.0,
        keys: ['WarmIvory','SoftCream','WallShade','Soil','DarkSoil','Path','Dirt','SoilBed','SoilShade','SoilDry','MutedWood','DarkWood','LightWood','Terracotta','TerracottaDark','Stone','DarkStone','DeepWarmInk'] },
    },
  },

  // ---------------------------------------------------------------------------
  // 3. MATERIAL DEFAULTS  --  shared PBR knobs for the glb models.
  // ---------------------------------------------------------------------------
  materials: {
    roughness: 0.92,      // 0.7..1  matte surface (keep high; no gloss)
    glowRoughness: 0.9,   // 0.7..1  window/lamp glass
    glassRoughness: 0.9,  // 0.7..1
    glowEmissive: 0.5,    // 0..1.5  daytime window glow strength (game drives night)
    glassAlpha: 0.45,     // 0.2..0.8  greenhouse glass transparency
  },

  // ---------------------------------------------------------------------------
  // 4. ASSET MATERIALS  --  which palette token paints each part of each model.
  //    Reassign a token to re-skin that part (e.g. roof:'DarkStone' for slate).
  //    Arrays are cycled across repeated parts (flowers, canopy lobes).
  // ---------------------------------------------------------------------------
  assetMaterials: {
    farmhouse: {
      foundation: 'Stone', walls: 'WarmIvory', posts: 'MutedWood',
      roof: 'Terracotta', roofTrim: 'TerracottaDark',  // ridge/eave/tile bands
      door: 'DarkWood', step: 'Stone', windows: 'Glow',
      flowerBox: 'Terracotta', flowers: ['Terracotta', 'GoldenSunlight', 'Blossom'],
      porch: 'MutedWood', awning: 'Terracotta',
      shed: 'MutedWood', shedRoof: 'Terracotta',
      firewood: 'LightWood', chimney: 'DarkStone',
    },
    tree_round_a: {
      trunk: 'MutedWood', flare: 'DarkWood',
      canopy: ['ForestGreen', 'DeepFoliage', 'MeadowGreen', 'MeadowGreen', 'FreshFoliage', 'SageGreen'],
    },
    fence: { timber: 'MutedWood' },
    bush_a: { lobes: ['ForestGreen', 'MeadowGreen', 'MeadowGreen', 'FreshFoliage'] },
    bush_flowering: {
      lobes: ['ForestGreen', 'MeadowGreen', 'MeadowGreen', 'FreshFoliage'],
      flowers: ['Coral', 'SoftCream', 'Blossom'],
    },
    grass_tuft: { blade: 'Grass' },
    rock_a: { body: 'Stone' },
    rock_b: { body: 'Stone', accent: 'DarkStone' },
    flowerbed: {
      soil: 'Soil', foliage: 'MeadowGreen',
      flowers: ['Terracotta', 'GoldenSunlight', 'Blossom', 'SoftCream', 'Lavender', 'Wildflower'],
    },
    // the painted procedural plot (scripts/assets/plot.mjs, ART-PLAN P0-1): atlas cells. The edging is the weathered grey board,
    // lighter and less red than MutedWood against the soil (ART-BIBLE §B.2)
    plot: { soil: 'soil', edging: 'plank_grey' },
    // The painted atlas (scripts/lib/paintedAtlas.mjs): one small texture painted in code for the painted procedural models
    // (woodshed, wetland_jetty). Each cell's colour: a token, or [tokenA, tokenB, t] = a mix of two. The swatches row is 12 plain
    // painted fills of these tokens, for small parts in any palette colour (swatch_<Token>).
    painted_atlas: {
      plank: 'MutedWood', plankDark: 'DarkWood', plankLight: 'LightWood', plankGrey: ['MutedWood', 'DarkStone', 0.7],
      tiles: ['Terracotta', 'GoldenYellow', 0.12], tilesTrim: 'TerracottaDark',   // tiles warmed toward the farmhouse's orange roof
      bark: 'DarkWood', rings: 'LightWood',
      stone: 'Stone', stoneDark: 'DarkStone',
      wet: ['DarkWood', 'DeepFoliage', 0.3], algae: ['GrassDark', 'DarkWood', 0.35],
      rope: ['LightWood', 'SoftCream', 0.3], metal: ['DeepWarmInk', 'DarkStone', 0.35], rust: ['TerracottaDark', 'DarkWood', 0.4],
      // the Barnaby trio (wizard, camp, tower ruin): a dusty slate-teal robe cloth (not purple: CAST "Two traps"), patched canvas,
      // warm skin, a knitted rust scarf, a check blanket, brass, weathered dry-stone blocks with moss and lichen, paper
      cloth: [['Water', 'Glass', 0.7], 'DeepWarmInk', 0.38], canvas: ['SoftCream', 'Stone', 0.42], canvasPatch: ['LightWood', 'Stone', 0.35],
      skin: ['SoftCream', 'Coral', 0.45], scarf: 'Terracotta', scarfStripe: 'GoldenYellow',
      blanket: ['ForestGreen', 'DeepWarmInk', 0.15], blanketCheck: ['Terracotta', 'GoldenYellow', 0.3], brass: ['GoldenYellow', 'MutedWood', 0.3],
      block: ['Stone', 'CliffStoneDark', 0.35], blockDark: ['DarkStone', 'CliffStoneDark', 0.3], moss: ['GrassDark', 'MeadowGreen', 0.35],
      lichen: ['SageGreen', 'GoldenYellow', 0.35], paper: 'WarmIvory',
      // the plot's tilled soil (one furrow row: troughs in SoilShade, the crest toward SoilDry), the cell freed from four unused swatches
      soil: 'SoilBed', soilShade: 'SoilShade', soilDry: 'SoilDry',
      // 12 swatches (MeadowGreen, SageGreen, TerracottaDark and Lavender, used by no model, made room for the soil cell, 2026-10-25)
      swatches: ['WarmIvory', 'SoftCream', 'ForestGreen', 'MutedWood', 'DarkWood', 'LightWood',
        'Terracotta', 'Stone', 'DarkStone', 'GoldenYellow', 'Water', 'DeepWarmInk'],
    },
    // the painted procedural models: which atlas cell each part is painted with
    woodshed: { posts: 'plank_dark', beams: 'plank_dark', wall: 'plank', roof: 'tiles', roofTrim: 'tiles_trim', logs: 'bark',
      logEnds: ['rings_0', 'rings_1', 'rings_2', 'rings_3'], footing: 'stone', pads: 'stone_dark', sleepers: 'plank_dark',
      handle: 'plank_light', axeHead: 'metal' },
    wetland_jetty: { deck: 'plank_grey', deckPatch: 'plank', stringers: 'plank_dark', piles: 'plank_dark', wet: 'wet', post: 'plank_dark',
      postTop: 'rings_1', rope: 'rope', bucket: 'plank', hoops: 'metal', water: 'swatch_Water', stool: 'plank_light', sill: 'bark', sillEnds: 'rings_2' },
    barnaby: { robe: 'cloth', hat: 'cloth', band: 'brass', skin: 'skin', beard: 'swatch_MutedWood', eyes: 'swatch_DeepWarmInk', scarf: 'scarf',
      satchel: 'swatch_DarkWood', strap: 'swatch_DarkWood', papers: 'paper', lantern: 'brass', lanternGlass: 'swatch_SoftCream', boots: 'swatch_DarkWood' },
    tower_ruin: { blocks: ['block_0', 'block_1', 'block_2', 'block_3'], mossy: ['block_moss_0', 'block_moss_1'], moss: 'moss', lintel: 'plank_grey', lintelEnds: 'rings_1' },
    barnaby_camp: { poles: 'bark', poleEnds: 'rings_2', tarp: 'canvas', ropes: 'rope', pegs: 'plank_light', bedroll: 'blanket', pillow: 'swatch_SoftCream',
      books: ['swatch_Terracotta', 'swatch_ForestGreen', 'swatch_DarkWood'], pages: 'paper', candle: 'swatch_SoftCream', flame: 'swatch_GoldenYellow',
      kettle: 'swatch_DarkStone', stones: 'block_2', char: 'swatch_DarkWood', mat: 'canvas' },
    // the meadow shelter (also published as sheep_shelter): the woodshed's cells. Hay: the paper cell's fine painted rows as straw,
    // tinted to the haystack's hay gold through COLOR_0 (shelter.mjs HAY_TINT; the atlas is full: no new cell)
    shelter: { posts: 'plank_dark', beams: 'plank_dark', rafters: 'plank_dark', sheathing: 'plank_light', wall: 'plank', sides: 'plank',
      roof: 'tiles', roofTrim: 'tiles_trim', footing: 'stone', pads: 'stone_dark', hay: 'paper', twine: 'rope' },
  },

  // ---------------------------------------------------------------------------
  // 5. LIGHTING  (LEGACY single-island viewer ?world=legacy ONLY)
  //    The default blueprint-island proof reads EVERY look value (lights, sky, fog, shadows, tone mapping, clouds,
  //    water colours, wind) from art/config/lookPresets.json. Do not add new look parameters here (LOOK-BRIEF rule):
  //    palette tokens stay in this file, look parameters go to lookPresets.json + lookPresets.schema.json.
  // ---------------------------------------------------------------------------
  lighting: {
    exposure: 1.05,            // 0.8..1.4  overall brightness (only used by ACES/Reinhard/Linear; inert under 'None')
    toneMapping: 'None',       // 'ACESFilmic' | 'Reinhard' | 'Linear' | 'None'. PASS A: 'None' = GAME PARITY
                               // (the game renders with R3F <Canvas flat> = NoToneMapping); was 'ACESFilmic'.
    sun: {
      colorToken: 'Sun',       // directional key light colour
      intensity: 2.3,          // 1..4
      azimuthDeg: 54.2,        // 0..360  compass direction of the sun
      elevationDeg: 44.4,      // 10..80  height above horizon (lower = longer shadows)
      distance: 16.73,         // 8..40   light distance (affects shadow frustum fit)
      target: [0.3, 0.3, 0],   // point the sun aims at
    },
    hemisphere: { skyToken: 'HemiSky', groundToken: 'HemiGround', intensity: 0.9 }, // 0..1.5 soft sky/ground fill
    ambient: { colorToken: 'AmbientFill', intensity: 0.34 },  // 0..0.8 flat warm fill (keeps shadows coloured)
    shadows: {
      radius: 6,        // 1..10  softness of shadow edges
      mapSize: 2048,    // 1024|2048|4096  resolution (perf cost)
      frustum: 11,      // 6..20  half-size of the shadowed area (around the farm)
      near: 1, far: 46, // shadow camera depth range
      bias: -0.0004,    // -0.001..0  acne/peter-panning tweak
      normalBias: 0.03, // 0..0.1
    },
    contactShadow: { colorToken: 'ContactShadow', innerAlpha: 0.46 }, // 0..0.7 fake-AO under objects
  },

  // ---------------------------------------------------------------------------
  // 6. ATMOSPHERE  (sky dome + fog; LEGACY viewer only -- the blueprint island: lookPresets.json sky.* / fog.*)
  // ---------------------------------------------------------------------------
  atmosphere: {
    sky: { topToken: 'SkyTop', horizonToken: 'Haze', sharpness: 0.7, horizonOffset: 0.02 }, // sharpness 0.4..1.2 gradient tightness
    fog: { colorToken: 'Haze', near: 34, far: 104 },  // near 10..60 start, far 70..160 full haze
  },

  // ---------------------------------------------------------------------------
  // 7. TERRAIN  (procedural ground; in-game terrain is procedural too)
  // ---------------------------------------------------------------------------
  terrain: {
    size: 120,          // 80..200  ground plane width
    segments: 180,      // 48..220  landform resolution. Raised so cliff risers resolve
                        // cleanly (tight feather spans ~2 facets) -> crisp, not jagged.
    groundFlatShading: true, // the rebuilt terrain is a NON-INDEXED flat-shaded mesh coloured PER FACE (rock on steep faces, grass on flat); true keeps the crisp faceted low-poly cliffs
    facetJitter: 0.0,   // 0..0.15  extra per-vertex height roughness (0 = smooth)
    // Layered, seeded, domain-warped height field: broad landforms + medium
    // detail + restrained fine. Deterministic -- same seed => same world.
    elevation: {
      seed: 1337,       // noise seed for the gentle meadow roll (terraces come from modules.config)
      broad:  { freq: 0.045, amp: 1.5, octaves: 3, lacunarity: 2.0, gain: 0.5 }, // REBALANCE: gentler base roll (1.9->1.5)
      medium: { freq: 0.11, amp: 0.5, octaves: 2, lacunarity: 2.2, gain: 0.5 },  // REBALANCE: softer shoulders (0.7->0.5)
      fine:   { freq: 0.5, amp: 0.12 },   // REBALANCE: less surface break-up (0.18->0.12 -> calmer grass)
      warp:   { freq: 0.03, amp: 6.0 },   // domain warp distance -> breaks regularity/symmetry
      flattenInner: 5,  // 0..10  radius kept near-flat under the farm
      flattenOuter: 16, // 12..40 radius where the full landscape resumes (smooth transition)
    },
    colour: {
      grassToken: 'Grass', meadowToken: 'MeadowLight', darkToken: 'GrassDark', soilToken: 'Soil',
      rockToken: 'Stone', rockDarkToken: 'DarkStone',  // warm weathered stone for steep faces (NOT charcoal)
      nFreqX: 0.12, nFreqZ: 0.1, nFreqDiag: 0.06, // colour-variation frequencies
      meadowWeight: 0.38,   // 0..1   REBALANCE: softer grass->meadow swing (0.45->0.38 -> calmer broad meadow)
      heightToMeadow: 0.09, // 0..0.2 higher ground reads lighter (sunlit highs)
      heightToDark: 0.10,   // 0..0.2 hollows read darker
      slopeToDark: 0.14,    // 0..1   REBALANCE: gentler slope shade (0.22->0.14 -> less high-contrast facet patches)
      darkMax: 0.22,        // 0..0.6 REBALANCE: lower darkening cap (0.3->0.22)
      // Cultivated-ground soil blends (broad + soft so they span many faces).
      soilPatches: [
        { x: -1.3, z: -0.8, strength: 0.45, falloff: 0.07, max: 0.25 },
      ],
      // PER-FACE SLOPE + HEIGHT -> ROCK/SOIL/GRASS weights (ported from
      // THREE.Terrain's blended-material GLSL to CPU; see lib/terrain.faceBlend).
      // slope = 1 - faceNormal.y (0 flat .. ~1 vertical). The cliffs are simply the
      // STEEP FACES of the single heightfield coloured rock here -- there is NO
      // separate cliff mesh any more, so nothing can float.
      faceBands: {
        slopeRock0: 0.47, slopeRock1: 0.62,  // STAGE2: steep DRAMA faces commit to rock (tan) not muddy dark; gentle interior slopes (~0.17) stay grass
        slopeSoil0: 0.30, slopeSoil1: 0.52,  // a thin soil band JUST below the rock (cliff feet), not on grassy slopes
        soilH0: 0.6, soilH1: 1.5, soilH2: 3.2, soilH3: 4.4, // earthy mid-height band (trapezoid)
        soilBandW: 0.28, soilSlopeW: 0.5,    // keep soil subtle so moderate slopes stay GREEN (no orange checkerboard)
        rockDarkBySlope: 0.5, // 0..1  STAGE2: lighter so steep DRAMA faces read warm tan, not muddy dark
      },
    },
  },

  // ---------------------------------------------------------------------------
  // 8. BACKGROUND  (distant hill silhouette bands + clouds)
  // ---------------------------------------------------------------------------
  background: {
    // each band is a smooth rolling silhouette ring; farther = lighter (fog hazes)
    hillBands: [
      { radius: 72, base: 3.4, amp: 2.6, segs: 150, phase: 0.0, colorToken: 'Hill0' },
      { radius: 96, base: 4.6, amp: 3.2, segs: 160, phase: 1.7, colorToken: 'Hill1' },
      { radius: 122, base: 6.0, amp: 3.8, segs: 170, phase: 3.1, colorToken: 'Hill2' },
    ],
    clouds: {
      colorToken: 'Cloud',
      // (cloud drift motion lives once in section 12: ambient.cloudDrift)
      flatten: 0.52,      // 0.3..0.8 how squashed the puffs are
      // a few small clouds, placed high and far (x, y height, z, scale)
      instances: [
        { x: -32, y: 31, z: -50, scale: 1.0 },
        { x: 24,  y: 35, z: -64, scale: 0.85 },
        { x: -8,  y: 39, z: -78, scale: 1.15 },
      ],
    },
  },

  // ---------------------------------------------------------------------------
  // 9. VEGETATION  (scattered trees + instanced ground cover)
  // ---------------------------------------------------------------------------
  // Placement is driven by the ASSEMBLED cell modules (modules.config.mjs): each
  // point's suitability = the host cell module's per-class density. Blue-noise
  // (Poisson) per-class spacing + species rules. Reuses the existing geometry.
  vegetation: {
    seed: 7,                 // plant-layout seed (independent of terrain + world seeds)
    // STAGE-2 CLUMPING: low-frequency masks so scatter forms CLUMPS + CLEARINGS
    // (woodland reads as woods, meadow/clearing stays open). Deterministic noise.
    clump: { freq: 0.052, lo: 0.37, hi: 0.57, speciesFreq: 0.028, driftFreq: 0.09, driftLo: 0.42, driftHi: 0.60 },
    worldRadius: 112,        // outer radius plants may spawn to (ISLAND: whole island)
    farmExclusion: 7.5,      // no trees/rocks/understory within this of the farm centre
    pathClearance: 2.3,      // keep plants this far from any path centre-line (STAGE-2 path network)
    maxTreeSlope: 1.0,       // trees reject ground steeper than this (rise/run)
    maxVegSlope: 0.8,        // bushes/grass/flowers reject cliff faces steeper than this
    trees: {
      maxCount: 440,         // upper bound on scattered trees (ISLAND; forest-mask CLUMPS them -> dense groves)
      minSep: 2.15,          // blue-noise min spacing between trees (tighter -> denser clumps)
      pineInPineGrove: 0.82, // pine share inside a grove module
      pineInBroadGrove: 0.3, // pine share in meadow/other modules
      pine:  { scaleMin: 0.85, scaleRange: 1.1 },                              // narrow, varied heights
      broad: { scaleMin: 0.6, scaleRange: 0.6, widthMin: 0.9, widthRange: 0.35, heightMin: 0.7, heightRange: 0.5 }, // broad canopy
    },
    // bush_a clones in grove/rocky modules (density from the module)
    understory: { maxCount: 155, minSep: 1.8, scaleMin: 0.8, scaleRange: 0.5 },
    // free rocks in rocky modules + on slopes
    rocks: { maxCount: 135, minSep: 2.0, scaleMin: 0.55, scaleRange: 0.8 },
    pine: { leafToken: 'ForestGreen', leaf2Token: 'DeepFoliage', trunkToken: 'DarkWood' },
    groundCover: {
      // grass: follows meadow/cultivated modules, extra near the farm, thin on path
      grass: { maxCount: 1100, minSep: 0.72, farmRadius: 12, farmBoost: 0.6, openBase: 0.06, pathThin: 1.5, scaleMin: 0.7, scaleRange: 0.9 },
      // wildflowers: concentrated in distinct BEDS + a few natural meadow patches
      // (golden-angle specks per bed), only a thin fringe along the path -- NOT a
      // uniform scatter around the house.
      wildflower: { maxCount: 640, minSep: 0.78, scaleMin: 0.7, scaleRange: 0.8, yOffset: 0.12,
        pathBand: 1.15, bedRadius: 1.8, goldenPerBed: 14,
        beds: [[-1.6,-0.9],[1.6,1.7],[0.3,2.3],[-2.4,0.6],[-6.5,3.6],[6.6,-2.6]],
        // open-meadow wildflower FIELDS [x, z, radius, strength] -> dense flower patches
        fields: [[30,-24,9,0.9],[-28,6,8,0.8],[18,34,8,0.8],[-12,-40,7,0.75]],
        colorTokens: ['Coral', 'Blossom', 'GoldenYellow', 'Lavender', 'SoftCream'] },
    },
  },

  // ---------------------------------------------------------------------------
  // 10. COMPOSITION  (where each model is placed; the little farm layout)
  //     Each entry: { x, z, ry (y-rotation radians), scale }. Repeats are
  //     instanced from the one glb.
  // ---------------------------------------------------------------------------
  composition: {
    cluster: {
      farmhouse: [{ x: 1.3, z: -0.3, ry: -0.5 }],
      tree_round_a: [
        { x: -2.0, z: 0.7, ry: 0.4, scale: 1.15 },
        { x: 3.1, z: -1.7, ry: 1.2, scale: 0.85 },
      ],
      fence: [
        { x: -2.05, z: -1.4, ry: 0 }, { x: -2.05, z: -0.78, ry: 0 }, { x: -2.05, z: -0.16, ry: 0 },
        { x: -1.74, z: -1.85, ry: 1.5707963 }, { x: -1.12, z: -1.85, ry: 1.5707963 },
        { x: -1.74, z: 0.12, ry: 1.5707963 }, { x: -1.12, z: 0.12, ry: 1.5707963 },
      ],
      plot: [{ x: -1.45, z: -1.35, ry: 0.0 }, { x: -1.45, z: -0.5, ry: 0.0 }],
      bush_a: [{ x: 2.4, z: 0.55, ry: 0.5 }, { x: 0.1, z: 0.85, ry: 1.2, scale: 0.9 }],
      bush_flowering: [{ x: 2.1, z: 1.25, ry: 0.5 }, { x: -0.55, z: 1.45, ry: 2.0 }],
      flowerbed: [{ x: 0.35, z: 1.75, ry: 0.2 }],
      rock_a: [{ x: -2.95, z: 0.5, ry: 0.8 }],
      rock_b: [{ x: 2.7, z: 1.95, ry: -0.5, scale: 0.9 }],
    },
    // winding dirt path (world x,z): one continuous route from the porch out into
    // the wider landscape (last point = porch).
    path: { width: 0.76, points: [[-7.5, 10.5], [-4.8, 7.4], [-2.6, 4.8], [-0.8, 2.7], [0.1, 1.6], [0.9, 1.1]] },
  },

  // ---------------------------------------------------------------------------
  // 11. CAMERA  (default framing; user can still orbit/zoom)
  // ---------------------------------------------------------------------------
  camera: {
    fov: 45,              // 30..70  desktop vertical field of view
    fovMobile: 46,        // 30..70  portrait FOV
    elevationDeg: 27,     // 10..60  desktop look-down angle
    elevationDegMobile: 31,// portrait look-down (a touch higher -> less empty foreground)
    azimuthDeg: 34,       // 0..360  orbit direction
    distanceDesktop: 13.8,// 8..30
    distanceMobile: 11.2, // closer on portrait so the farm fills more of the frame
    mobileAspect: 0.85,   // aspect below this uses the mobile framing
    target: [0.4, 0.7, 0.3],      // desktop look-at (just left of the farmhouse)
    targetMobile: [0.7, 0.55, 0.1],// portrait look-at (centred on the farm+garden)
    minDist: 4, maxDist: 46,
    autoRotateSpeed: 0.55,
    damping: 0.08,
    maxPolar: 0.49,       // *PI; keeps the camera above the ground
  },

  // ---------------------------------------------------------------------------
  // 12. AMBIENT LIFE  (subtle idle motion; LEGACY viewer only -- the blueprint island: lookPresets.json wind.*)
  // ---------------------------------------------------------------------------
  ambient: {
    grassSway: { ampX: 0.05, ampZ: 0.035, speedX: 1.4, speedZ: 1.1 }, // amp 0..0.15
    canopySway: { amp: 0.025, speed: 0.9 },  // tree-top gentle rock
    cloudDrift: { amp: 6, speed: 0.012 },    // mirrors background.clouds
    smoke: {
      colorToken: 'Smoke', puffs: 6, rate: 0.0016, // rate 0..0.01 emission speed
      rise: 1.7, driftX: 0.12, driftZ: 0.1,        // how the puffs float up and wander
      size: 0.17, baseScale: 0.5, growth: 1.3, opacity: 0.4, // 0..1 visibility
    },
  },
};
