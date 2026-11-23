# Gitaway — STYLE.md (the checkable art-direction contract)

> **Status (2026-10-24).** [../ART-BIBLE.md](../ART-BIBLE.md) is now the single source of truth for the look. This file keeps its
> checkable rules (P1–P5, R2–R5, T1–T8, C1–C8, §7b) as the measurable constraints behind the bible. **Superseded:** §2's core swatches
> (the colour system is ART-BIBLE §B), §3 R1 (tone mapping is decided: `NeutralToneMapping` in the approved look, `NoToneMapping` in the
> game until the port; ART-BIBLE §D.1) and §7 as the camera list (canonical cameras: ART-BIBLE §E.2; the proof presets below stay valid
> for proof captures).

Read this before ANY visual task. Every rule here is either **measurable** (a number a
script or test can check) or a **do/don't backed by a reference image**. When something
"looks off", trace it to a rule; if no rule covers it, add one. Companion docs:
`world-layout.spec.md` (structure + regions), `look.config.mjs` / `world.config.mjs`
(all values), `TUNING.md` (how to change them).

Status: v1 draft, 2026-10-18. `[calibrate]` = target is measured from the concept crops
by `metrics.mjs` (to be built), not guessed. `[tune]` = provisional, adjust once measured.
Angles are face angles from horizontal (config `slope = 1 − normal.y`: 0.52 ≈ 61°, 0.66 ≈ 70°).

## 1. Identity
A warm, stylised, low-poly countryside island floating in soft haze. Cosy and open at the
centre around one charming farmhouse; deliberate, intentional drama — grassy plateaus,
rocky ledges, later waterfalls and ruins — reserved for the outer regions.
**Not a canyon. Not a flat field. Not an empty dome.**

## 2. Palette — core swatches (terrain/scene colours come only from these)

> Superseded by ART-BIBLE §B (named semantic colours with sources). Rules P1–P5 below still apply.

| Role | Token | Hex |
|---|---|---|
| ground grass | Grass | #86AD5E |
| sunlit meadow / terrace tops | MeadowLight | #B9D783 |
| grass in hollows | GrassDark | #587C43 |
| deep foliage | ForestGreen | #496A50 |
| darkest foliage (floor for conifers) | DeepFoliage | #3F5E46 |
| path / dirt | Path | #C2935E |
| soil | Soil | #B98B61 |
| rock face | Stone | #C3B49A |
| rock shade | DarkStone | #9C8C74 |
| roof | Terracotta | #B9654B |
| walls | WarmIvory | #F3E4C4 |
| sky | SkyTop | #83C5F0 |
| haze | Haze | #D5DCCB |
| water (stage 3) | Water | #6FB8B0 |

v4 terrain-only swatches (the blueprint island's ground + rock; the glb assets keep the swatches above, so
`public/models` never changes for a terrain colour): TerrainGrass #B4C25A, TerrainMeadow #CCD46E, TerrainGrassDark
#7C9140 (the concept's grass renders yellow-green, hue ~56, sat ~0.65), CliffStone #D0C9BB, CliffStoneDark #ABA394
(risers + coast walls, low-sat so they read as stone), UnderStone #C6C3BB, UnderStoneDark #A29E95 (the underside).
Placeholder water uses the game's palette.ts water #91B7C8 / waterDeep #6E9AB0 / foam #E8F1F0 + its Water.tsx shaders.

- **P1** No black. Darkest on-screen pixel luminance ≥ 0.08 (sRGB) `[tune]`. Shadows are warm-tinted, never black.
- **P2** Conifers never darker than DeepFoliage — foliage reads green, not black, at every preset.
- **P3** Paths contrast with grass: path pixels warm tan/orange (hue ~25–45°), clearly separable from grass (hue ~70–110°).
- **P4** Rock is warm weathered stone (Stone/DarkStone). Never charcoal, never grey-blue.
- **P5** Greens stay saturated: mean saturation of terrain pixels within ±15% of the matching concept crop `[calibrate]`. "Milky"/lifted = fail.

## 3. Rendering
- **R1** Tone mapping must preserve authored hex: default_mobile mean saturation and luminance within ±15% of the concept crop `[calibrate]`. ACESFilmic is suspected of desaturating — choose None/Linear/Neutral by metric, not taste.
- **R2** Colour space: vertex colours built through `THREE.Color` (linear); output conversion happens exactly once.
- **R3** Haze lives only beyond the interior: no visible fog over regions A/B or the near meadow at default_mobile; haze ramps in toward the rim and beyond. Fog tints toward the sky (Haze → SkyTop), never a grey wash.
- **R4** Lighting: warm directional key with soft shadows + hemisphere fill (sky blue over warm ground bounce). Cliff faces read clearly darker than terrace tops (face/top luminance ≤ ~0.75 `[tune]`) — that contrast is the "chunky" read.
- **R5** Grounding: contact shadow / AO under every placed object, at cliff bases and inside tree clumps.

## 4. Terrain & structure (tested invariants)
- **T1** One watertight heightfield. No separate cliff meshes. No holes, seams, exposed undersides, floating or buried objects. (`tests/terrain.test.mjs`)
- **T2** |Δtier| ≤ 1 between neighbouring cells.
- **T3** Farm pad: max slope 0, height 0, fixed composition (`look.config composition.cluster`) — never moved, rescaled or re-rolled by seed.
- **T4** Terrace and plateau tops are flat: height within ±0.3 u across the stamp core.
- **T5** Rock faces appear only on faces ≥ ~61° (`faceBands.slopeRock0`) AND only in regions D, F, H. **Zero** rock faces in A, B or within `farmCalm.radius`.
- **T6** Interior gentleness: in A, B and the near meadow, ground slope ≤ ~15°.
- **T7** Drama budget: rock-face area ≤ ~8% of island land area `[tune]`; no single continuous rock face run longer than ~30 u `[tune]`. A canyon is a fail.
- **T8** Grass reads as coherent sheets (per-quad colouring) — no per-triangle light/dark checkerboard on meadows.

## 5. Composition
- **C1** Hierarchy: ONE hero (the farmhouse) · 2–3 secondary anchors (now: upper plateau; stage 3: waterfall, plateau ruins, lake bridge) · everything else is texture.
- **C2** Negative space: the farm clearing (region B) stays open — no trees, rocks or large props inside it except the fixed farm cluster.
- **C3** Farm prominence: in default_mobile the farmhouse + garden cover ≥ 25% of the frame and sit in the central third; in wide_island the farm is identifiable (roof contrasting against an open clearing, unoccluded).
- **C4** Clumping: ≥ 70% of trees belong to a clump (≥ 5 trees within ~6 u `[tune]`); clumps of 5–20; real clearings between clumps; species chosen per clump.
- **C5** Rocks cluster at cliff bases and shores, never a random sprinkle. Flowers grow in drifts in B/C, never an even scatter.
- **C6** Variety by removal: 2–4 discrete variants per thing; rare variants < 10%; correlate properties (e.g. bigger tree → deeper canopy) instead of randomising independently.
- **C7** Paths: one main path, always connected, from the porch to the destinations; never dead-ends at a cliff; crosses tier changes by gentle grade (later: steps); nothing scattered on path corridors.
- **C8** Every one of the 6 fixed presets shows a readable silhouette and a clear focal point.

## 6. Region character — what each must read as
- **A Farm** — the fixed cosy farm cluster. Untouched.
- **B Clearing** — broad, open, flat; flower drifts; soft irregular edge blending outward. No rock, no trees inside.
- **C Meadow** — open rolling grassland, wildflower drifts, the occasional lone tree or rock, small clumps at its edges.
- **D Rocky ledges** — a few short, steep, faceted warm-stone faces with grassy tops and rock clusters at their base. Selected sectors only.
- **F Upper plateau** — one raised, flat-topped landmark with a woodland clump on top and a steep rocky edge where it drops. Must read in wide_island.
- **H World edge** — grassy plateaus and exposed cliffs descending into soft mist; haze and sky beyond; no hard cutoff.
- **Woodland groves** — dense clumps with undergrowth, separated by clearings; favour cliff tops.
- *(Stage 3)* **E Lake / G River & waterfall** — cyan water with white falls, a coherent shoreline, bridges and docks.

## 7. Cameras

> For comparisons use the canonical camera ids of ART-BIBLE §E.2; the proof presets here are how to reproduce them in the proof.
Spec v3.1 comparison set (`world.config.mjs archipelago.cameras`, captured at seeds 11 = the game's and 42):
gameplay **default_mobile** (primary, portrait), default_desktop, farm_to_meadow, max_zoom_all (landscape) +
max_zoom_portrait — all at `framing.ts` VIEW.target inside the game clamp; photo island_wide, highland, islet, grove,
meadow, wetland_edge, rim_edge, docking. Unlock states `?unlocked=main|all|a,b`, lighting `?light=proof|game&hour=H`.
A change that regresses an approved preset does not ship. (The legacy single-island presets in `cameras` belong to
`?world=legacy`.)

## 7b. Rescaled numbers per piece (spec v3.1 — the blueprint island, ~55 u across)
STYLE's palette, rendering and do/don't rules apply unchanged; these scale-dependent numbers replace the 220 u ones:
| Rule | 220 u island (v1) | Blueprint island (v3.1) |
|---|---|---|
| C3 farm prominence | farm >= 25% of default_mobile | the game frames the WHOLE main piece (framing.ts: 27 x 19 u, phone portrait ~104 u away): farm = the clear focal point, unoccluded by any docked piece (tested by ray-cast) |
| C4 clump | >= 5 trees within ~6 u | per piece (`composition.clumping`): main >= 3 within 2.2 u; grove >= 4 within 2.4 u; others >= 3 within 2.0 u; target >= 70% clumped |
| C2 / sight line | open clearing (region B) | MAIN's near side (+x/+z) and the near-side line of sight (theta 22-68 deg, r < 16 u) carry nothing tall |
| T4 terrace flatness | +/- 0.3 u | flat cores (meadow 2.6, wetland 2.4, grove 2.4, highland 2.8, orchard 1.8, cottage 1.8, islet 1.6 u): slope <= 4 deg, range <= 0.1 u |
| T5 rock placement | regions D/F/H only | outer rim skirts + highland ledges + islet knolls; never on MAIN's near side, never within 0.6 u of a seam |
| T6 interior gentleness | <= 15 deg in A/B/near C | <= 15 deg across MAIN's whole interior and every seam band (walkable: dog and sheep cross) |
| T7 drama budget | <= 8% rock, runs <= 30 u | tier step 0.75 u, per-feature `tierH` (v4: the highland mesa 1.5 u, islet knolls 1.2 u); risers one tier apart >= 2.2 u (|dTier| <= 1 on a 1.5 u lattice). v4 highland: flat (<10 deg) or cliff (>55 deg), <= 8% smooth 15-50 deg ramp |
| C7 paths | width ~1.1 u | layout.ts dirt paths 0.6 / 0.5 u; v4 connector network: trunks 1.1 u, branches 0.8 u, porch slots -> every piece core, continuing across seams; climbs only over `stairs` (stone steps) |
| H rim | grassy plateaus + exposed cliffs | v4: every outer coast is a 2 u warm-stone WALL (vertical slab facets, thin grass lip), then a craggy rock cone underside; MAIN alone has the same ~2 u wall |
| woodland | dense clumps | v4: forest rules (rim band, grove fill, lakeshore, cliff tops, piece woods) with glades; cliff FEET stay open (risers read); MAIN interior + the meadow's sight line stay open |

## 8. Do / Don't
**Don't — past failures, never again:**
- Dark charcoal cliff panels stuck onto green (V8).
- Flat brown panels floating in mid-air (V9).
- A canyon of continuous cliff walls (V10).
- An empty green dome with sparse, sprinkled trees (V12 wide view).
- Per-triangle light/dark checkerboard on grass.
- Grey fog washing out the midground.
- Near-black conifers; black shadows.
- Uniform, even sprinkles of trees, rocks or flowers.

**Do — from the concept sheets:** saturated yellow-green flat terrace tops; warm stone faces darker than the tops; dense tree clumps separated by open clearings; warm tan/orange paths; haze only at the far edge; one charming farm in an open clearing as the clear focal point.

## 9. Process
- The AI never guesses aesthetic numbers. Values live in config; the human dials by eye; the AI wires, measures and commits.
- Every capture runs `metrics.mjs` and builds a contact sheet (each render beside its matching concept crop) so target and current are compared in one view.
- If the numbers don't move, the change didn't help. Regressions in approved presets block shipping.
- Once structure is right, make targeted corrections only — never regenerate the world to fix a detail.
