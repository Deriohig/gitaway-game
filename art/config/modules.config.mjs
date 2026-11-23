// modules.config.mjs  --  MODULE LIBRARY + DETERMINISTIC WORLD ASSEMBLER
// =============================================================================
// Procedural generation here CHOOSES + ASSEMBLES handcrafted modules; it does NOT
// invent terrain/compositions from unconstrained noise. Linked to look.config.mjs:
// all colours are palette TOKENS (strings) resolved by the viewer, and all asset
// ids refer to the existing GLBs -- no colour or number is duplicated from
// look.config.mjs. Injected into the viewer as window.__MODULES__.
//
// A world is a jittered grid of CELLS. Each cell gets an elevation TIER (terrain
// module: flat / raised terrace / slope, with cliff edges at tier jumps) and a
// COMPOSITION module (environment) or the farm LANDMARK. Same seed => same world;
// ?view=world&seed=N re-assembles; ?view=gallery inspects modules in isolation.
export default {

  world: {
    seed: 20250617,     // world seed (override per-view with ?seed=N)
    grid: 5,            // 5x5 = 25 cells
    cellSize: 11,       // world units per cell
    jitter: 2.6,        // 0..cellSize/2  cell-centre jitter -> irregular, non-grid silhouettes
    tierStep: 1.6,      // metres of elevation per tier (REBALANCE: lowered 2.1->1.6 so drops are short + peaceful, not canyon walls)
    maxTier: 2,         // 0..3  number of raised terrace levels (kept at 2: occasional wooded rises, no high mesas)
    farmTier: 0,        // elevation tier of the farm clearing (0 = ground level; the pad is held flat)
    maxTierDelta: 1,    // HARD constraint: adjacent cells may differ by at most this many tiers
                        // (solver lowers over-steep cells -> no impossible vertical jumps)
    // REBALANCE: keep the immediate farm surroundings calm + welcoming. Cells whose
    // centre is within farmCalm.radius of the origin are capped to farmCalm.maxTier
    // (before the |Δtier| solve) AND forced to be gentle SLOPE cells (never rocky
    // cliffs), so no terrace wall or exposed rock crowds the house at the default
    // mobile camera. Assembled worlds only (the ?view=test staircase is untouched).
    farmCalm: { radius: 17, maxTier: 1 },
    // INFLUENCE STAMPING (adapted from THREE.Terrain, MIT): each cell stamps a
    // plateau at absolute height tier*tierStep with a FLAT CORE then an EASED
    // FEATHER; stamps combine via an order-independent soft-max p-norm so
    // same-tier neighbours merge into one irregular terrace.
    stampInner: 0.46,   // x cellSize: flat plateau-top (core) radius -> broad genuinely-flat grassy shelves (REBALANCE: wider flat tops)
    pNorm: 6,           // soft-max sharpness (higher = flatter tops + crisper terrace edges, still smooth)
    outlineWarp: 4.5,   // domain-warp distance -> irregular plateau/terrace OUTLINES (no concentric rings)
    // FEATHER = the width (world units) of a cell's riser. This is what makes a
    // drop read as a CLIFF or a SLOPE, all inside the ONE heightfield:
    //   cliff  -> TIGHT feather -> steep face (coloured rock by per-face slope)
    //   slope  -> WIDE  feather -> gentle grassy slope
    feather: { cliff: 1.0, slope: 6.5 },  // REBALANCE: cliff kept TIGHT (1.0) so the FEW rocky drops read as crisp,
                                          // genuinely-steep faceted rock ledges; slope widened 4.4->6.5 so every
                                          // other drop is a long, gentle grassy slope
    cliffChance: 0.20,  // 0..1  REBALANCE: 0.45->0.20 so only a FEW raised cells become exposed rock cliffs (most = grassy slopes)
    stampRadius: 0.78,  // (legacy; kept for the old-curtain regression reproduction only)
    cliffTierDiff: 1,   // (legacy regression reproduction only)
    cliffFarmClear: 6,  // (legacy regression reproduction only)
    cliff: {            // (legacy curtain knobs; used ONLY by the RED regression reproduction)
      faceRunScale: 0.55, faceRunMin: 1.6, faceRunMax: 3.2, minFaceDrop: 1.1,
      topSink: 0.22, baseSink: 0.1, spansPerEdge: 3, rows: 3,
    },
    filler: 'comp_meadow', // guaranteed-eligible module so a cell's domain can never empty
    testSeed: 777,      // fixed seed for ?view=test (stable validation scene)
    farmFlat: { inner: 5, outer: 14 }, // REBALANCE: broad welcoming flat clearing; elevation only resumes well beyond the garden
    biome: { farmRadius: 13, midRadius: 24 }, // near / mid / far rings from the farm
  },

  // Fixed elevation tiers for the ?view=test VERTICAL SLICE (grid rows i=0..4,
  // columns j=0..4; indexed testTiers[i][j]). A terrace staircase: a high tier-2
  // plateau in the -x/-z corner (a CLIFF, see testCliffCells) steps down through a
  // tier-1 grassy shelf to the flat tier-0 meadow (with the farm). Satisfies the
  // slice: farm plateau, lower meadow, a raised grassy shelf, one continuous rocky
  // cliff (convex + concave corner at the (1,1) notch), a gentle connecting slope,
  // and the path crosses the tier-1 shelf on the -x/+z side. |Δtier|<=1 everywhere.
  testTiers: [
    [2, 2, 1, 1, 1],
    [2, 1, 1, 1, 1],
    [1, 1, 0, 0, 0],
    [1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ],
  // Which raised test cells are CLIFF cells (tight feather -> steep rock). The rest
  // of the raised cells stay SLOPE cells (wide feather -> grass). This trio forms
  // one continuous rocky outcrop wrapping the -x/-z corner with a concave notch.
  testCliffCells: [[0, 0], [0, 1], [1, 0]],
  // Demo additive/subtractive stamps for the slice (test scene only): a shallow
  // basin ('sub' -> a genuinely LOWER meadow) and a soft knoll ('add' -> a bump).
  testStamps: [
    { x: 15, z: 12, r: 8, r0: 1.5, amp: 1.5, mode: 'sub' },
    { x: 16, z: -11, r: 6, r0: 1, amp: 1.2, mode: 'add' },
  ],

  // Coherent tier regions from a seeded sine field -> low meadows / mid ground /
  // raised shelves in connected regions (NOT per-cell noise, NOT concentric rings).
  // REBALANCE: contrast lowered 1.15->0.9 (fewer high tiers) and a downward `bias`
  // added so MOST regions settle at tier 0 (broad meadow), a connected band rolls
  // at tier 1, and only occasional pockets reach tier 2 -> varied regions, not a
  // uniform staircase and not a canyon. Still coherent (seeded sine field, not noise).
  tierField: { f1: 0.075, f2: 0.065, f3: 0.04, contrast: 0.9, bias: 0.26 },

  // Weighted module selection per biome ring (deterministic choice among APPROVED
  // alternatives; constrained by each module's tierRange).
  // REBALANCE: bias selection toward open meadow + rolling ground; reserve rocky
  // comps for rare far/high cells and push woodland (grove) onto the higher far
  // ground, so rises read as WOODED hills rather than bare rock.
  selection: {
    near: { comp_cultivated: 3, comp_meadow: 4, comp_grove: 1 },
    mid:  { comp_meadow: 4, comp_grove: 3, comp_rocky: 1 },
    far:  { comp_grove: 4, comp_meadow: 2, comp_rocky: 1 },
  },

  // -------- MODULE LIBRARY (schema per module) --------
  // category  : 'terrain' | 'environment' | 'landmark'
  // role      : 'focal' | 'fill' | 'transition' | 'boundary'
  // footprint : bounding cell size (w x d)
  // tier/tierRange : supported elevation levels (prevents incompatible assemblies)
  // edges     : edge TYPE per side -> adjacency compatibility ('grass'|'transition'|'cliff'|'path')
  // biome     : biome affinity tags
  // density   : vegetation suitability per class (0..1) used by the placement pass
  // tags      : visual tags / composition role
  modules: {
    landmark_farm: {
      category: 'landmark', role: 'focal', footprint: { w: 11, d: 11 }, tier: 0,
      edges: { all: 'grass' }, biome: ['farm'], tags: ['farmhouse', 'garden', 'path'],
      influence: { favour: ['comp_cultivated', 'comp_meadow', 'comp_grove'], avoid: ['comp_rocky'] },
    },
    comp_cultivated: {
      category: 'environment', role: 'fill', footprint: { w: 11, d: 11 }, tierRange: [0, 0],
      edges: { all: 'grass' }, biome: ['farm', 'meadow'], tags: ['garden', 'plots'],
      density: { tree: 0.10, bush: 0.35, grass: 0.70, flower: 0.55, plot: 1.0, rock: 0.05 },
    },
    comp_meadow: {
      category: 'environment', role: 'fill', footprint: { w: 11, d: 11 }, tierRange: [0, 2],
      edges: { all: 'grass' }, biome: ['meadow'], tags: ['open', 'wildflower'],
      density: { tree: 0.10, bush: 0.15, grass: 0.95, flower: 0.70, rock: 0.05 },
    },
    comp_grove: {
      category: 'environment', role: 'fill', footprint: { w: 11, d: 11 }, tierRange: [0, 3],
      edges: { all: 'transition' }, biome: ['woodland'], tags: ['trees', 'woodland'],
      density: { tree: 0.95, bush: 0.5, grass: 0.5, flower: 0.12, rock: 0.1 },
    },
    comp_rocky: {
      category: 'environment', role: 'fill', footprint: { w: 11, d: 11 }, tierRange: [1, 3],
      edges: { all: 'transition' }, biome: ['rocky'], tags: ['rocks', 'hillside'],
      density: { tree: 0.3, bush: 0.4, grass: 0.35, flower: 0.08, rock: 1.0 },
    },
  },

  // Rocky cliff/ledge geometry placed where adjacent cells differ in tier.
  cliffs: { atTierDiff: 1, rocksPerEdge: 3, rockScale: [0.9, 1.7], jitter: 1.4, strokeStep: 0.9 },

  // Gallery order (?view=gallery) -- render each module in isolation, left to right.
  gallery: ['landmark_farm', 'comp_cultivated', 'comp_meadow', 'comp_grove', 'comp_rocky'],
};
