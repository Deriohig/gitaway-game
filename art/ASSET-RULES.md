# Gitaway asset rules

2026-10-24 · owner's brief phase 4 (categories from Part 1 §4 and Part 2). Style source: [ART-BIBLE.md](ART-BIBLE.md); inventory:
[ASSET-CATALOG.md](ASSET-CATALOG.md); checks: [VISUAL-QA.md](VISUAL-QA.md).

Every category gives: **palette** (token names from ART-BIBLE §B.2), **proportions and scale**, **silhouette**, **materials and texture
approach** (A Meshy atlas · B painted procedural · C ramp reskin · D code-painted cards · E flat, ART-BIBLE §D.3), **detail density**,
**variation**, **technical constraints**. Unmarked rules come from existing decisions, specs and tests (source in brackets).
**PA** = proposed (art director): my rule beyond existing decisions. **Every PA rule was approved by the owner on 2026-10-25** (some
retuned to the measured approved art) and is marked "Approved 2026-10-25" below; the tag is for new proposals only. The approved
bands, named exceptions and tracked defects are enforced by VISUAL-QA V1 and V2 (§10 lists the exceptions and defects). Rows tagged "owner-approved lore answer N" (2026-10-25)
come from the approved answers sheet, `voice-drafts/art-answers-approved-2026-10-25.md`.

**Common to all.** Y up, front +Z, origin at the base centre on y 0 (water: y 0 = waterline), transforms applied, glTF binary, no
Draco/meshopt, deterministic build script in `art/scripts`, manifest entry `ready` with notes [ASSETS.md technical spec]. Roughness
0.92 (cards 1.0), metalness 0, baseColor only [look.config.mjs:121-127]. Never palette-flatten a painted texture [Decided]. Faces seen
by the camera are never paper-thin single-sided [ASSETS.md]. Every new asset passes the ART-BIBLE §G workflow.

---

## 1. Terrain and floating-island edges

| Aspect | Rule |
|---|---|
| Palette | Top: `lawn.*` (five greens + LAWN patches). Rock: `stone.top/face/dark`, strata `stone.strata.warm/cool`. Underside: `stone.under/deep` fading to `sky.below`. No charcoal, no grey-blue rock [STYLE P4]. |
| Proportions | MAIN ~18 u; joined island ~55 u; every outer coast is a 2 u wall, then a craggy cone (MAIN to y −6.9; petals −7.9 … −10.8, highland −14) [BLUEPRINT]. Tier step 0.75 u; risers one tier apart ≥ 2.2 u [STYLE §7b]. |
| Silhouette | One watertight heightfield per piece, no separate cliff meshes, no holes or seams [STYLE T1]. Coast wall of vertical slab facets (one offset per ~1.15 u block, 0.4 ± 0.3 u) with a 0.12 u grass lip; lone petals hang as their own rock (underside taper v5) [BLUEPRINT, Decided]. |
| Materials | Approach E by design: baked linear `COLOR_0` from the Golden-afternoon paint, `pieceMat` Lambert with baked normals (smooth grass, faceted rock) [BLUEPRINT]. |
| Detail density | Rock faces only on faces ≥ ~61° and only where the spec allows (rims, highland ledges, islet knolls; never MAIN's near side or within 0.6 u of a seam) [STYLE T5, §7b]. Drama budget ≤ 8 % rock area, interior slopes ≤ 15° [T6, T7]. |
| Variation | World-space noise only: lawn base 15 u, patches 5–7 u, clover/tall/worn from the cover field; never per-triangle checkerboard [T8, living-ground spec]. |
| Technical | ≤ 280 KB per piece file (highland ≤ 295), all 8 ≈ 37.5k tris [BLUEPRINT]. Seams exact (≤ 1e-6 u) with shared normals; colour-only changes keep height grids byte-identical [lawn.test]. Skirts per open neighbour. Tests: `bake.test.mjs`, `blueprint.test.mjs`, `lawn.test.mjs`, `look.test.mjs`. |
| Distant isles (approved 2026-10-25, owner-approved lore answer 11) | The backdrop isles (ART-PLAN A17) are land and trees only: no building, light, smoke, path or boat. They never come nearer, never change as the game goes on and are never named; night lighting stays off them, and no light or craft crosses the sky. |

## 2. Grass and ground cover

| Aspect | Rule |
|---|---|
| Palette | Kit textures painted from `lawn.*` and `foliage.bush`; slight per-instance tint through `instanceColor`. Flowers in drifts: `flower.*` schemes (`world.config.mjs` `plants.flowers.schemes`). |
| Proportions | grass 0.15–0.55, clover 0.09, flowers 0.20–0.30, perennials 0.38–0.72, ferns 0.37; pebbles ≤ 0.045 (four stones inside a 0.13 u circle, on flat cards), placed scale 1.0–1.5; placed scale 0.8–1.3 [terrain.mjs:2088]. |
| Silhouette | Crossed cards with soft, irregular painted cut-outs; tips and heads read against the lawn, never a solid blob [living-ground spec]. |
| Materials | Approach D: one PNG per plant with alpha (power-of-two, ≤ 512 px), `MASK` (cutoff 0.3–0.6) on a single-sided material, two-sided by duplicated faces, every normal leaning up (y ≥ 0.6) so cards shade like the ground, alpha bled into clear texels (no dark halos), opaque texels 12–85 % of the texture [plantkit.test K1–K8]. |
| Detail density | Farm: tidy lawn, sparse short grass and clover with the odd daisy or buttercup, 2–4 plants/u², no tall plants. Isles: patches 1–3 u of tall grass / seed-heads / one-kind drifts, 8–15 plants/u² inside patches, perennials where plants gather, ferns in tree shade [Decided "character by area"]. |
| Variation | Patches from one shared cover field that also paints the lawn under them; neighbours share a type far more than random [cover.test]. 2–4 variants per kind, rare kinds < 10 % [STYLE C6]. |
| Technical | grass ≤ 24 tris, wildflowers ≤ 40, perennials ≤ 120, pebbles ≤ 24 [plantkit.test K2, K10: palette `stone.prop` / `.propDark` with `lawn.deep` moss, the contact shade painted in, a 128² MASK card]; the pebbles are the composition's `rocks` (still in the wind) and carry the same near-white tint; ≤ 8,000 plants and ≤ 80,000 kit tris per piece [cover.test V1]; one InstancedMesh per asset per piece; cover never casts shadows; grass leans in the wind (`Composed.tsx:89`). Nothing on paths, plots, slots or water. |

## 3. Trees, bushes, flowers, crops

| Aspect | Rule |
|---|---|
| Palette | Each species paints from its approved concept ramp (`foliage.oak`, `.beech`, `.maple`, `.birch`, `.sapling`, `.fir`, `.bush`; frozen in `art/reskin/concept-stats.json`): cool teal-green shade → olive mid → warm yellow-green sunlit top. Bark from the concept's bark stops (birch: white with dark marks). Autumn accents: the same ramp rotated to 22° / 36° / 48°; they are gold trees, not a season, and seasons only ever add (ART-BIBLE §B.1; owner-approved lore answer 9, 2026-10-25). |
| Proportions | Model heights: round/birch 2.30, spread 1.92, fruit 1.90, sapling 1.34, fir 2.55, pine_b 1.97, bushes 0.90 [species.mjs]. Farm trees ×1.0 [Decided]; composed scale 0.49–1.23. |
| Silhouette | Broadleaf: separate clumped leaf pads with a little branch between them, a visible trunk below ~0.3 × H; conifers: ragged, uneven painted tiers with drooping tips and a visible trunk; bushes: leaf-pad mounds; card shrubs blend into the ground cover [trees design "Decisions"]. Distinct silhouettes per species. |
| Materials | Approach C (CC0 MegaKit + ramps) for trees and bushes [Decided]; D for card shrubs, flowers, crops. Bark JPEG opaque, leaves PNG `MASK`. Crown tint near-white ±6 %, clamped [0.92, 1.08], crown only; `tree_fruit` and bushes untinted [R18]. |
| Nodes | `Canopy` pivot on the trunk axis at the leaves' lowest y; conifers `Crown` > `Canopy` [reskin.test RS1c, trees.test T4]. **Approved 2026-10-25:** broadleaf, birch, sapling and hero-tree pivot 0.25–0.45 × H (not conifers; checked by V1 A12); bark ends ≥ 0.15 u inside the crown's top surface (smallest margin today `tree_fruit` 0.186 u; the former "≤ 75 % of H" clause is dropped: six of nine approved broadleaves break it and it does not isolate the one tree with a real problem; judge the trunk tip with the pivot rule and a motion check); a still trunk must never show against a swaying crown. `tree_spread` (pivot 0.213 u = 0.111 × H, bark to 85 % of H) is the one known defect: on the known-defects register, fixed by plan P2-4. |
| Detail density | Leaf cards kept 50–60 % (interior-first thinning); far versions keep 29–37 % of the cards, enlarged ×1.5, outline and height unchanged [SOURCES.md]. |
| Variation | ~8 species mixed by biome (meadow broadleaf + flowering bushes; wetland birch within 1.5 u of water, fir behind; highland ≥ 70 % conifer + heather; grove oak/beech among ferns; orchard apple rows; islet windswept pines) [trees design]. Autumn 5–10 % of isle broadleaf, none on the farm. ≥ 70 % of trees in clumps, real clearings between [STYLE C4]. Species on their own RNG stream so positions never move [species.test S1]. |
| Flowers | Drifts of one or two kinds (schemes per piece), never an even scatter; flower beds as kit beds in a 0.6 u disc [STYLE C5, crops.test]. |
| Crops | One file per plot per stage, `crop_<id>_<1|2|3>`: sprout / growing / ready; everything inside the 0.94 × 0.94 plot, y 0 at the soil [crops.test]. **Sunflower, lavender:** kit cards (approach D), ≤ 400 tris per stage, the garden crops' treatment since 2026-10-25 (the owner): a seedling cluster, then three plants filling the plot under 1.2 u; the sunflower heads are their own cards facing the default camera (azimuth 45°) [crops.test F1–F4, ASSETS.md §3]. **The eight garden crops** (radish, carrot, wheat, lettuce, tomato, pumpkin, blueberry, cranberry; owner, 2026-10-25, "crops, mature on Meshy"): the ready stage FILLS its plot (the owner, 2026-10-25, "bigger, fit the plot": a footprint up to 0.92 inside the soil's inner edge, ≥ 0.72, up to 1.2 u tall), stage 1 is a sprout cluster across the plot and stage 2 one plant about half the ready size (40–80 % of its height); the ready stage is a Meshy painted atlas (approach A: image-to-image concept from the oak + cottage style references, smart-topology, 4k source finished to ≤ 512 px with `--pad`; recipes in `art/meshy/crop_<id>_3/`), the sprout and growing stages are kit cards (approach D, ≤ 400 tris) in the ready model's own greens [crops.test G1–G5]. **Named exceptions (owner, 2026-10-25; §10):** (1) the eight Meshy ready stages ≤ **2,500 tris** (about 2,200, no decimation), ≤ 200 KB, density in the Meshy props' 150–500 band [`crop_meshy`, `MESHY_CROPS`; assets.test A5, M16]; owner, 2026-10-25: radish and carrot roots sit partly below the soil (≤ 0.15 u) [`EXCEPTIONS` base]; (2) a crop's **produce** (fruit, roots, heads, berries) may reach **0.85** saturation so it pops against the soil, while its leaves and stems stay in the foliage band [palette.test PB12]. **Approved 2026-10-25:** stage 3 must be identifiable by silhouette and fruit colour at `CAM-DESK` (~45 px for a plot); the ready colour is the crop's own accent (radish `#CF7378`, carrot `#D98A4E`, tomato `#C65A4A`, pumpkin `#D98B4A`, blueberry `#5E70A5`, cranberry `#A94A52`, wheat `#E8BD72`); leaves from `foliage.bush` / kit greens. The two soil flags of P0-1 are met by the Meshy models (produce measured area-weighted): tomato `#D95332` 1.74:1 against the `#6E5444` soil (the approved hex 1.65:1), cranberry `#C24F47` 1.49:1 (`#A94A52` was 1.26:1); the wheat and cranberry hexes are settled on the models (wheat `#D4AE63`). |
| Technical | Caps [R15]: broadleaf 3,500, birch 3,000, sapling 1,500, conifers 1,200, bushes 600, card shrubs 120; **the Meshy hero tree is the one exception: 5,105** (approved 2026-10-25, §10). Far versions mandatory for every tree: broadleaf ≤ 1,000, sapling and conifers ≤ 500, 256² textures, same nodes and pivot, materials bound by name [R20, trees.test T9]. Textures ≤ 512². Only trees cast shadows. Sway: broadleaf 0.03 rad at 0.9, conifers 0.025 at 0.7 (`Composed.tsx:87`). |

## 4. Rocks and cliffs

| Aspect | Rule |
|---|---|
| Palette | Prop rocks `stone.prop` / `.propDark` with moss in `lawn.deep` / the atlas `moss` cell; terrain rock `stone.*`. Warm weathered stone, low saturation: ≤ 0.30 (approved 2026-10-25; prop stone and the Meshy rocks run 0.20–0.28, terrain rock stays ≤ 0.20); never grey-blue. |
| Proportions | Boulders fit a 1 × 0.7 × 1 box, placed ~0.5–0.9 (mean 0.58) and settled 0.02–0.04 u into the ground (`yOffset`); one in three is a flat slab (`rock_c`); outcrops 1.9–2.8 u against risers [composition meta, meshy/README]. |
| Silhouette | Chunky, rounded-faceted, wider than tall; mossy tops face up; no spikes. |
| Materials | Approach A (Meshy boulders/outcrops, 512²). Terrain rock is part of the piece bake (approach E). |
| Detail density | Rocks cluster at cliff bases, shores and path edges, never a random sprinkle [STYLE C5]; ≥ 0.3 u clear of water edges and paths (the withheld list shows the clearance rule). |
| Variation | 3 boulders + 2 outcrops, yaw and scale per placement (hash of the spot, not the RNG, for game-placed rocks: `Nature.tsx:194-197`). |
| Technical | ≤ 650 tris per boulder (accepted over the 600 prop cap), outcrops ≤ 2,100; instanced per piece; rocks do not cast in the composition. **Approved 2026-10-25:** texel density boulders 200–500 t/u (252–288 today), outcrops ≥ 100 t/u (outcrop_a 106). `outcrop_b` (73 t/u, the lowest of any published model) is a known defect on the register (plan P2-2): re-texture it by resolution, never by flattening. |

## 5. Buildings, cottages, farm structures, paths

| Aspect | Rule |
|---|---|
| Palette | Walls `wall` (`WarmIvory`) and `wall.trim`; roofs `roof` / `roof.dark` clay tiles painted warm, saturation 0.45–0.80 (its own band: the farmhouse's roof, 0.76, is the reference; atlas tiles warmed 12 % to gold); timber `timber.*` (0.35–0.60); foundations `stone.prop`; windows `glow.window` via `Glow`. The retirement cottage takes a golden thatch to stand apart from the farmhouse [ASSETS.md Phase 2]. |
| Proportions | Characters are 1.0–1.1 u: doors ≥ 0.95 u (approved 2026-10-25; review-time), windows large, trims chunky. Heights: farmhouse 2.70, windmill 3.79, lighthouse 3.75, greenhouse 1.50, well 1.30, woodshed 0.889. No building over ~4 u on MAIN. |
| Silhouette | One main mass + one secondary (lean-to, porch, chimney) + a readable roof that takes ~45–55 % of the height (the farmhouse-style house; 53 % today; approved 2026-10-25); the entrance turned to read from the default camera (az 45°); stands on the lowest ground under its footprint (`footprintDrop`). |
| Materials | Buildings and cottages: approach A (Meshy atlas from an approved concept; roofs may carry their own tiling texture like the farmhouse's `Roof`) [models.test P17]. Small farm structures (sheds, lean-tos, shelters, bridges, plot edging): approach B on the painted atlas [Decided for the woodshed]. `Glow` textured band + emissive mask for windows; `Glass` only for real panes (the greenhouse paints them opaque). |
| Detail density | **Approved 2026-10-25:** walls ≥ 75 t/u (the large Meshy buildings measure 79–145); hero walls ≥ 128 t/u is the target for any new hero (the windmill, 133, meets it) and the farmhouse (79; the owner kept its 1024 px texture, raise only by resolution, plan P2-2) is the one named exception; roofs ≥ 200 t/u (the farmhouse's `Roof` 288); features ≥ 0.05 u (review-time); neighbours within 3× texel density inside a family of similar models (Meshy buildings, props, animals, painted-atlas models, plant cards, boulders + outcrops), reported but not gated across families (the farmhouse beside the sharp props is VISUAL-AUDIT #7, plan P2-2). |
| Variation | Each building is unique; repeated structures (sheds, stalls) vary trim colour through `Tint` or an atlas swatch, not geometry. |
| Technical | ≤ 3,000 tris (named exceptions, approved 2026-10-25: farmhouse 3,646, windmill 3,480 and the lighthouse 3,028, 1 % over; §10), 512² (hero 1024²), ≤ 200 KB (hero ≤ 600 KB); special nodes per ART-BIBLE §D.2; casts and receives shadows. |
| Paths | One system: art ribbons (`paths_<piece>.glb`) with soft alpha edges, colour `path` `#A89478` ± 10 % world noise, 0.035 u above the baked top, rows matched on seams [BLUEPRINT]. Widths: trunks 1.1 u, branches 0.8, narrowed runs ≥ 0.9; MAIN's own paths 0.6 / 0.5 until they move to ribbons (P1-3). Climbs only over stone steps. Paths contrast with grass by hue [STYLE P3]; nothing scattered on a path. |

## 6. Fences, tools, furniture, decorative props

| Aspect | Rule |
|---|---|
| Palette | Atlas cells: `plank*`, `bark`, `rings`, `stone*`, `rope`, `metal`, `canvas`, swatches. Accents from `flower.*` / `roof` only in small parts. |
| Proportions | fence posts 0.46 on 0.62 segments, rails at 0.16 and 0.34; bench seat 0.32 (1.0 wide); lantern 0.9 (lamp at ~0.72 on a +X arm); beehive 0.73; stepping stones r ~0.15, 0.05 thick; footbridge 1.5 long, 0.62 wide, arch ~0.2, rails 0.46 [ASSETS.md §7]. |
| Silhouette | Hand-made: slightly irregular posts and planks (jitter), chunky ends, visible end grain; read as one clear shape at 35 u. |
| Materials | Approach B is the default for NEW props built from timber, stone, rope and canvas (fences, stepping stones, bridges, shelters, logs, signposts, crafts) (approved 2026-10-25, extends the Decided painted-procedural props); the existing approved Meshy props (bench, lantern, beehive, haystack, cart, scarecrow) stay as they are, and approach A remains for organic one-offs. Crafts put the recolourable surface in a `Tint` material. |
| Detail density | Plank grain and wear in the texture, not geometry; ≤ 2 geometric parts per 0.1 u. Texel density (approved 2026-10-25): Meshy props 150–500 t/u (the cart is 163, the set spans 163–450), painted props on the shared atlas 200–500 (observed 246–465). |
| Variation | Kits of 2–4 variants as top-level nodes (`Patch_a` …), scattered with yaw and scale; repeated segments (fence runs) as instances. |
| Technical | ≤ 600 tris (Meshy props accepted up to 1,500 case by case, named: cart 1,466 and scarecrow 731; §10), one material on the shared atlas, ≤ 200 KB; the atlas is full: a new cell needs a repack or a second page, and every painted model is republished (`paintedAtlas.mjs:18`). Repeated props instance one geometry. |

## 7. Water, waterfalls, particles, magical effects

| Aspect | Rule |
|---|---|
| Palette | Per body (`water.pond`, `.lake`, `.river`, `.tarn`, `.spring`); foam cream; mist and steam `cloud.target` cream; the same in every mood (the light changes, not the albedo) [water spec §3.3]. |
| Proportions | Real carved depth where the terrain is carved; the farm pond and stream use a virtual basin (0.25 u shallow rim, 0.35 u mid band); falls drop ~10 u and dissolve into spray [water spec §3]. Farm pond: the teardrop outline (pond mock A, 9.32 u²) welded to the stream [Decided]. |
| Silhouette | Value sequence from the lawn inwards: darker wet ground, cream contact line, bright shallow band, mid band, deep core darker than any grass; readable at 13–16 px/u. |
| Materials | One Lambert material patched through `onBeforeCompile` (`addPatch`), fed by baked RGBA maps (depth, signed shore distance, flow) at 0.05 u/texel; no reflections, refraction or depth-buffer reads [water spec §1, §4]. |
| Detail density | Each layer fades out when thinner than 1.25 px; phone: bands, contact line, sheen; desktop: + foam bands, glints, streaks; close: + caustics, lapping line, ripples. |
| Motion | Still water ≤ 0.05 u/s, rivers 0.3–0.6 u/s, fall streaks 1.2 u/s; frozen in still mode; phases wrapped on the CPU (no raw `elapsedTime`). |
| Particles | Billboard puffs in cloud cream, alpha ≤ 0.55, ≤ 20 puffs in all for water; fireflies ≤ 26 (calm 14), warm `#FFDB85`, additive, night only; smoke 5 puffs. No bursts, no sparkle showers. **Approved 2026-10-25:** every particle system has a still-mode state, a count cap, and uses a shared clock with wrapped phases; three shipped systems still feed a raw `elapsedTime` (`Fireflies.tsx`, `wind.ts`, `Water.tsx`) and move to one shared wrapped clock with the water branch (plan P2-8). |
| Magical effects (approved 2026-10-25) | Magic is light and slow behaviour: warm glow (`glow.window` family) against cool cloud-sea periwinkle, soft-edged, ≥ 2 s fades, no glyphs, runes or explanatory symbols, no purple/neon; the island's responses keep two readings (lore `BIBLE.md` §3 rules 1–3) and never show decay (rule 6, defined in the next row). The shiver wave rolling out from the farmhouse (`wind.ts`) is the pattern to copy; the row after says how far it reaches. |
| No decay (approved 2026-10-25, owner-approved lore answer 6) | Decay is any change for the worse: nothing ever looks worse than it did. Wear is a material, never a state: worn paths, weathered planks and moss are painted in from the start and never spread. Anything left behind is whole and where it was put, with moss around it, never over it. Ruin belongs only to the island's old stonework (the tower base, the stones, the cairn); nothing the player builds and nothing an inhabitant uses is ever broken, and a restoration's "before" look is unfinished or overgrown, never rotten or falling in. Review test (VISUAL-QA checklist 8): does anything get worse, and is anything of the player's broken? |
| The shiver's extent (approved 2026-10-25, owner-approved lore answer 10) | One wave from the farmhouse (the `wind.ts` pattern) carries on through everything it meets: grass and tree crowns sway; still water takes a soft ring or two as the front passes; light things on water or on posts give a small nod (the jetty deck, the moored sky-boat, a rod tip, a kettle lid). Buildings, rock and the land stay still, and nothing glows, cracks or falls; a big shiver differs from a small one only in strength and reach. It runs on the shared wrapped clock (P2-8), is off in still mode, and hooks into the water spec (`origin/art/water-design`; ART-PLAN A23). |
| Technical | Water ≤ 12 draw calls in all (≤ 10 at once), ≤ 4,000 tris incl. mist and ripples, ≤ 1.5 MB maps; phone ≤ 3 texture reads per water pixel, mid ≤ 6; water casts no shadows; gates desktop Δ ≤ +0.3 ms, mobile Δ ≤ +1.0 ms [water spec §5]. |

## 8. Landmarks and special items

| Aspect | Rule |
|---|---|
| Palette | From the building and stone families; one warm accent at most (a lit window, a brass fitting); no glowing loot colours. |
| Proportions | 1.3–3.8 u; one anchor per piece: islet lighthouse (3.75), highland tower ruin (1.32 tall, 2.08 across), standing stones and cairn, the wetland jetty on the lake (Fin's; the Pond Jetty restoration, game id `pondJetty`, builds it) and the hidden bell, the farm's windmill. Before the wetland has docked, Fin sits by the farm pond, with no jetty there. |
| Silhouette | Readable at `CAM-FAR` (140 u, ≈ 6 px/u) as a distinct shape on its piece's skyline; never on MAIN's near side line of sight [STYLE §7b]. |
| Materials | Approach A for big landmarks; approach B for ordinary built things (the ruin: dry stone, moss, a grey lintel). |
| Lore | The ruin reads as an ordinary dry-stone ruin, with no symbols and no clue to an owner (Barnaby calls it 'perfectly ordinary'; that's his line, not a fact the art settles); relics are ordinary objects whose story is the value; nothing explains the island; hidden details (the wetland bell, the cairn's carved stone) are small named meshes, not glowing markers [Decided; lore BIBLE §9, and §11 Q5 for the ruin's owner]. |
| The ruin, bell and cairn (approved 2026-10-25, owner-approved lore answers 2, 7, 8) | The built `tower_ruin` is the tower: one ordinary dry-stone base, changed only by Barnaby's own things once he moves in (ASSETS.md "Barnaby's ruin"). The bell is heard, never seen: nothing is drawn under the water at any zoom, light or water level, `Bell` is an invisible click target at the ripples, and its ripple rings show until it is noticed (frozen in still mode; the water spec's one ripple-ring effect, ART-PLAN A21). The cairn stone's two rows of worn cut marks read as writing but are never legible; moss sits around the stone, never over the marks. |
| Boats, beacons, the cottage (approved 2026-10-25, owner-approved lore answer 12) | The sky-boat stays moored: it bobs, its sail stays furled, and nobody boards it or takes it out. The rowboat stays on the island's own water, never the cloud sea. The lighthouse beam turns and the Signal Fire burns steadily, and nothing on the horizon answers either. Nobody moves into the Keeper's Cottage (no keeper, no resident); its windows light at dusk by the day cycle, like every building's. |
| Letters (approved 2026-10-25, owner-approved lore answer 13) | Letters are interface only: no post box and no postie or delivery animal asset, and the camp and the ruin need no post fittings. |
| Technical | As buildings (§5); hidden-detail click targets are separate named meshes (`Bell`, `Note`, and Fin's clue objects `TackleBox`, `ShedWindow`, `BiscuitTin`, `BigCatch`: owner-approved lore answer 4, 2026-10-25) [ASSETS.md Phase 2 names]. |

## 9. Characters and animals (added; not in the brief's list)

| Aspect | Rule |
|---|---|
| Palette | Animals in natural low-saturation coats (`WarmIvory`, wood browns, ginger `#D99A62`), tinted per instance (`coats.ts`); Barnaby: `accent.barnaby` only (slate-teal cloth, warm scarf, brass), never purple [Decided]. Fin: warm creams, never white, and soft warm eyes, never black and never lit (owner-approved lore answer 4, 2026-10-25). Síofra as herself: the hare's browns and creams (answer 5). |
| Proportions | Barnaby 1.06; animals per ART-BIBLE §C.2; the Brown hare (Síofra's first appearance) is drawn ~1.5× life (ASSETS.md); there are no other wild visitors (lore C4). Fin and Síofra as herself stand on the 1.0–1.1 u yardstick (owner-approved lore answers 4, 5, 2026-10-25). |
| Silhouette | Chunky, friendly, readable at 35 u as one mass + head; Barnaby: crumpled pointed hat, hip lantern, satchel; no long white beard; age ambiguous [Decided]. Fin: his look is the owner's model prompt (a sun hat, a sage fishing waistcoat, an A-pose, no rod in the model), easy and seated on his stool with his bucket and towel, and nothing plays on what he is (owner-approved lore answer 4, 2026-10-25). Síofra: a young woman with grass in her hair and her shoes on the wrong feet, and no wings, glow or fairy trappings (answer 5). |
| Materials | Animals approach A (Meshy family: chicken, duck, dog, cat, goat; the sheep should join it, P1-5); Barnaby approach B [Decided]. |
| Technical | ≤ 1,500 tris (the dog, 1,918, is the one accepted exception; §10), 512², feet on y 0 facing +Z, `Head` pivot at the nape, `Tail` at its base, `Wings` for fliers [ASSETS.md]. |

## 10. Named exceptions and tracked defects (approved by the owner, 2026-10-25)

Enforced by VISUAL-QA V1 (`lib/asset-contract.mjs`); an entry that is no longer needed fails as stale, and nothing may be added
without the owner. Any new over-cap model needs the owner to add it.

**Triangle exceptions** (measured from the published files; `EXCEPTIONS` adds a small margin, `TRIS_EXCEPTION_CEILING` is this list):

| Model | Tris | Cap it is over | Note |
|---|---|---|---|
| farmhouse | 3,646 | 3,000 building | hero; 1024² atlas, ≤ 600 KB |
| windmill | 3,480 | 3,000 building | hero; 1024² atlas, ≤ 600 KB |
| lighthouse | 3,028 | 3,000 landmark | 1 % over |
| hero_tree | 5,105 | 3,500 broadleaf | the Meshy hero tree, 1024² atlas, ≤ 600 KB |
| dog | 1,918 | 1,500 animal | accepted |
| cart | 1,466 | 600 prop | Meshy prop accepted case by case (≤ 1,500) |
| scarecrow | 731 | 600 prop | Meshy prop accepted case by case |

**Meshy crop exception** (owner, 2026-10-25, "crops, mature on Meshy"; keep about 2,200 tris, no decimation). The eight garden crops' ready stages are a class of their own (`crop_meshy`, by name in `MESHY_CROPS`): Meshy painted atlas, ≤ **2,500 tris** (measured 1,436–2,476), ≤ 200 KB (128–190), ≤ 512 px, density 150–500 (154–360), their own neighbour family. Any other `crop_<id>_<n>` is a kit crop (cards, ≤ 400 tris): assets.test M16. Owner, 2026-10-25: radish and carrot roots sit partly below the soil (`crop_radish_3` 0.12 u, `crop_carrot_3` 0.13 u; `EXCEPTIONS` base, A9).

**Texture exception.** The farmhouse walls (79 t/u against the 128 hero target; ≥ 75): the owner kept its 1024 px texture (`HERO_WALLS`).

**Produce exception** (owner, 2026-10-25). A crop's produce (fruit, roots, heads, berries) may reach **0.85** saturation, against the accents' 0.70, so it pops against the soil; its leaves and stems stay in the foliage band (`produce` family in `lib/palette-bands.mjs`; palette.test PB12 samples each Meshy ready stage, PB1 pins the 0.85 edge). Measured: pumpkin 0.84, carrot 0.80, tomato 0.77, radish 0.75, cranberry 0.63, wheat 0.53.

**Known defects** (`KNOWN_DEFECTS`, genuine outliers kept visible, each tied to the plan item that fixes it):

| Model | Defect | Plan item |
|---|---|---|
| outcrop_b | 73 t/u against the ≥ 100 floor, and 3.94× the sharpest boulder against the 3× family limit | P2-2 / A13: re-texture by resolution, never by flattening |
| tree_spread | canopy pivot 0.213 u = 0.111 × H against 0.25–0.45 × H; bark to 85 % of H | P2-4 / A11: re-pivot and trim the bark tip inside the crown |
