# Gitaway art bible

Version 1 · 2026-10-24 · owner's brief phases 2, 6 (cameras) and 7 · evidence in [VISUAL-AUDIT.md](VISUAL-AUDIT.md). **2026-10-25: the owner
reviewed every rule this file and its companions had marked proposed and approved all of them as recommended** (retuned numbers below;
decision log at the end; enforced by VISUAL-QA V1 and V2).

**This file is the single source of truth for how Gitaway looks.** Detail lives in the files it points to; where they disagree with it,
it wins. Companions: [ASSET-RULES.md](ASSET-RULES.md) (per-category creation rules), [ASSET-CATALOG.md](ASSET-CATALOG.md) (what exists),
[VISUAL-QA.md](VISUAL-QA.md) (how to check), [ART-TOOLING.md](ART-TOOLING.md) (how to build), [ART-PLAN.md](ART-PLAN.md) (what to fix next).

**Precedence.** (1) The owner's explicit decisions (log at the end). (2) This bible. (3) Values in `art/config/lookPresets.json`,
`art/config/look.config.mjs`, `src/styles/tokens.css`. (4) The older docs, which keep their technical detail:
`config/STYLE.md` (checkable rules P1–P5, R2–R5, T1–T8, C1–C8 stay valid), `config/LOOK-BRIEF.md` + `config/WORLDSEED-BRIEF.md`
(the look target), `LOOK-PORT.md` (how the game adopts it), `BLUEPRINT.md` (pieces, composition, ribbons), `config/TUNING.md`
(proof knobs), `specs/*` (per-feature designs). Superseded: `ASSETS.md` "Art direction" and "Materials"; `STYLE.md` §2 palette,
§3 R1, §7 cameras.

**Tags.** *Decided* = owner decision, do not re-open. *Fact* = read in code/config. *Proposed (art director)* = my rule beyond existing
decisions; it holds until the owner overrules it. Every rule that carried this tag on 2026-10-24 is **approved by the owner, 2026-10-25**
and is now Decided (marked "approved" where it appears); the tag is for new proposals only.

---

## A. Identity

**In one line.** A painted miniature countryside floating in soft haze: warm, lush, handcrafted, quietly magical; the interface is a
calm, modern layer that stays out of its way.

**Canon** (`docs/lore/BIBLE.md:60` on main): "a magical miniature countryside diorama: lush land, warm light, charming buildings,
winding paths, woodland, ponds, flowers, and an island that keeps getting bigger."

| Quality | What it means on screen | Never |
|---|---|---|
| Cosy countryside | One charming farmhouse in an open clearing is the heart; warm roofs, cream walls, timber, hay, flowers near the house. | A sprawling farm sim grid; industrial props. |
| Magical island | The island floats; land rises from the cloud sea and docks; fireflies, glowing windows, a bell under the wetland. Magic is *behaviour and light*, never explained (lore rules: two readings, show behaviour not intent). | Runes, glyphs, sparkle bursts, neon, purple-wizard clichés, decay or wilting (nothing ever looks worse than it did; rules below). |
| Miniature, handcrafted | Slightly chunky proportions, painted surfaces with visible brush grain, soft irregular edges, a "made by hand" wobble. | CAD-clean bevels, photoreal textures, faceted flat low-poly. |
| Restrained, sophisticated | Value and temperature carry the read, not saturation; one hero, a few anchors, the rest is texture (STYLE C1). | Rainbow scatter, random asset-pack mixes, noisy detail that dies at game zoom. |
| Gentle humour, warmth | Small lived-in details (a kettle at Barnaby's camp, a cat on the porch, a log stack). | Slapstick, mascots, signage that explains. |
| Calm, ambient | Slow motion only: sway ≤ 0.03 rad, water drift ≤ 0.05 u/s, 30/15/0 fps tiers; beautiful when paused (WORLDSEED §7). | Constant particles, fast loops, screen shake. |
| Modern minimalist UI | Cream surfaces, 1 px borders, compact controls, Fraunces for names, Inter for everything else (UI-REDESIGN-BRIEF). | Paper textures, ornamental frames, gradients, heavy blur. |

**Standing rules from the lore answers (Decided: the owner approved all 11 answers of the art lore sheet, as written, on 2026-10-25).**
Sheet: `voice-drafts/art-answers-approved-2026-10-25.md` (detail lives there and in the files
named below; answers 1 and 3, Fin's jetty and Barnaby's look, were already in). Seasons are in §B.1; the ruin, bell, cairn, Fin and
Síofra are in ASSETS.md, ASSET-RULES §7–§9 and ART-PLAN A18–A23.

- **No decay (owner-approved lore answer 6, 2026-10-25).** Nothing ever looks worse than it did. Wear is painted in from the start and
  never spreads, anything left behind is whole and where it was put, and only the island's old stonework is ruined; a restoration's
  "before" is unfinished or overgrown, never rotten. Review test: does anything get worse, and is anything of the player's broken
  (VISUAL-QA checklist 8, ASSET-RULES §7).
- **The shiver's extent (answer 10).** One wave from the farmhouse runs through grass, trees and soft rings on still water, plus small
  nods from light things (the jetty deck, the sky-boat, a rod tip, a kettle lid). Buildings and land stay still, nothing glows, and it is
  off in still mode. It hooks into the water spec (ASSET-RULES §7, ART-PLAN A23).
- **Distant isles and the sky (answer 11).** Land and trees only: no building, light, smoke, path or boat. They never come nearer and are
  never named, and no light or craft crosses the sky (ASSET-RULES §1, ART-PLAN A17).
- **Boats and beacons (answer 12).** The sky-boat stays moored, bobbing with its sail furled, and the rowboat stays on the island's own
  water. The beam turns and the fire burns, and nothing answers either. No keeper moves into the Keeper's Cottage, whose windows light at
  dusk like every building's (ASSET-RULES §8).
- **Letters (answer 13).** Barnaby's letters are interface only: no post box and no postie asset, at the farm, the camp or the ruin.

**Rendering direction (Decided 2026-10-22).** Unify toward the painterly, painted-texture look of the farmhouse and buildings; retire
the flat low-poly stand-ins. Lawns are never a solid colour. Reeds in water stay.

## B. Colour system

### B.1 Rules

- **Shares in the default view (approved by the owner, 2026-10-25; measured as screen-pixel shares by VISUAL-QA V6, planned).**
  Dominant: lawn and foliage greens are the largest group of the frame and **at least 45 %** (the approved default views measure
  49.5–56 %; there is no upper cap, close-ups run 65–90 %). Supporting **20–40 %**: earth, stone, timber, roofs, walls, water, sky (the
  approved default views run 25–38 %). Exceptional: flowers, warm light, character accents and autumn accents stay in drifts of one or
  two kinds, as guidance with no number until a material mask can measure it (the old 5 % cap failed its own proxy). Measure on the
  island pixels (a mask) once V6 exists; the current game's fresh single-island view reads only 26 % green because sky and cloud sea
  fill the frame, which V6 will report.
- **Value.** No black, no white. Darkest on-screen luma ≥ 0.08 (STYLE P1); albedo floor `#544A5C` luma for GLBs
  (`lookPresets` `materials.minAlbedo`, to port); the lightest albedo is a cream (`SoftCream #FBF1DA`, foam `#F4F4EB`). The farmhouse
  roof is the strongest large value/chroma accent near the centre; cliff faces read darker than their tops (face/top luma ≤ 0.75, STYLE R4).
- **Saturation (HSV, measured from the approved tokens; new colours must sit inside their band; approved by the owner, 2026-10-25,
  after a review that measured every colour: the first draft's bands were too tight for the owner's own approved art).** Bands are
  compared at the two decimals written here (a measured 0.551 is 0.55).

  | Family | Band | Examples |
  |---|---|---|
  | Lawn, path, soil | 0.25–0.45 | lawn mid `#7AAE72` 0.34, path `#A89478` 0.29, soil `#6E5444` 0.38 |
  | Foliage | shade **0.30**–0.60, sunlit top ≤ 0.70 | oak `#1E3924` → `#98A233` (0.69); flat shade `ForestGreen #496A50` 0.31 (dark greens desaturate) |
  | Stone, cliff, underside | ≤ **0.30** | `#D0BFB4` 0.13, `#B29E94` 0.17, `DarkStone #9C8C74` 0.26, atlas `stone_dark #8A7A64` 0.28; terrain rock stays ≤ 0.20 |
  | Timber, bark | **0.35**–0.60 | `MutedWood #986641` 0.57, weathered `plank_grey #8C7359` 0.36 |
  | Clay roof (**its own band**) | **0.45–0.80** | `Terracotta #B9654B` 0.59, `TerracottaDark #9C4E39` 0.63, farmhouse roof texture 0.76 |
  | Walls, cream, cloth | ≤ 0.30 | `WarmIvory #F3E4C4` 0.19, Barnaby cloth `#698488` 0.23 |
  | Water | **0.15–0.55** | pond `#93BCAE` 0.22 … `#4E7D8C` 0.44; the draft per-body palettes below run 0.15 (pale river, tarn and spring shallows) to 0.55 (spring deep `#4FA7B0`) |
  | Flowers, accents | ≤ 0.70 | `Coral #E58A6A` 0.54, `GoldenYellow #EFC25A` 0.62 |
  | Crop produce (a **named exception**, owner 2026-10-25) | ≤ **0.85** | a crop's fruit, roots, heads, berries (the Meshy crops: pumpkin 0.84, carrot 0.80, tomato 0.77, radish 0.75): it pops against the soil; their leaves and stems stay in the foliage band (ASSET-RULES §3, §10) |

  **Legacy colours are named exceptions, not wider bands.** 15 colours of the pre-port look still break a band and are excused one
  by one, each with its reason, in `lib/palette-bands.mjs` `LEGACY` (listed in VISUAL-QA §3a): look.config `Grass`, `GrassDark`,
  `Soil`, `DarkSoil`, `Path`, `TerrainGrass`, `TerrainMeadow`, `TerrainGrassDark` (saturation) and `ContactShadow` (temperature: a warm
  shadow), plus the same three colours (`grass.dry`, `paths.color`, `shadows.contact.color`) in the retired presets `Game (current)` and
  `Proof warm (v4)`. An entry leaves the register the day its colour is retired; the register can never grow.
- **Temperature.** Warm key light, cool shade (cel shade `#A496D8`, grade shadow `#7C86C8`). Warm materials concentrate at the farm
  (roof, timber, cream, hay); greens cool and deepen toward woodland and the rim; stone stays near-neutral warm grey; water cools by
  altitude (pond green-teal → lake cooler teal → tarn slate). Shadows are never grey or black. Approved hue windows (V2 checks them):
  greens 55–175°, paths and soil 20–45°, timber and clay roofs 5–50°, stone 0–60° or 330–360° (near-neutral warm, never grey-blue), walls
  20–60°, water 150–230°, glow 20–60°, key lights 10–60°, shade 180–320° and at least 0.10 saturation; the birch lit and fir shade ramp
  stops sit only 2° and 5° inside the green windows, so widen them to 50–180° if a ramp is re-sampled.
- **Contrast.** Paths separate from grass by hue (tan 20–45° vs green 70–120°, STYLE P3); the focal object has the highest local
  contrast; distant land loses contrast into the horizon colour, never into grey.
- **Accents.** A new accent must replace or reuse an existing token; never add a hue because it looks good alone (brief §B). A
  review-time rule (it needs a human); the family check (PB2) already stops a new palette token from arriving without a band.
- **Seasons (owner-approved lore answer 9, 2026-10-25).** Until the game's `seasons` switch is on (it is off today) it is a long late
  summer: the gold trees (`autumn.*`) are simply gold trees all year, not a sign of autumn (the token names stay). When seasons come they
  only ever add (blossom, colour, frost and snow on top; a few leaves may drift down): crowns stay full, lawns go pale with frost but
  never brown, and nothing looks as if it is wilting.

### B.2 Environment palette (exact values and their source)

Sources: `LP` = `art/config/lookPresets.json` presets."Golden afternoon"; `LC` = `art/config/look.config.mjs` palette;
`LAWN` = `art/scripts/lib/terrain.mjs:2098-2103`; `CS` = `art/reskin/concept-stats.json` (10/50/90 % luminance stops of the
approved concepts); `PT` = `src/world/palette.ts`; `WS` = water spec §3.3 on `origin/art/water-design` (draft, owner reviewing).

**Dominant: greens**

| Name | Hex | Source | Use |
|---|---|---|---|
| `lawn.warm` / `lawn.mid` / `lawn.cool` | `#98C47E` / `#7AAE72` / `#609262` | LP `grass` | the baked lawn's three-green base (15 u blend) |
| `lawn.lush` / `lawn.dry` | `#558A68` / `#AAB888` | LP `grass` | by water (5 u) / high ground |
| `lawn.yellow` / `lawn.deep` | `#A9C377` / `#56844F` | LAWN | 6–7 u patches |
| `lawn.clover` / `lawn.tall` / `lawn.worn` | `#4E7C4A` / `#A2B06A` / `#A6BB86` | LAWN | under clover, under tall grass, along farm paths |
| `foliage.oak` | `#1E3924` → `#4B642B` → `#98A233` | CS `tree_oak` | tree_round_a (+ fruit uses `tree_apple` `#213B20` → `#5D6F2B` → `#B3B139`) |
| `foliage.beech` | `#243625` → `#4F6435` → `#A7AB3C` | CS | tree_round_b |
| `foliage.maple` | `#2B4327` → `#5F7337` → `#B0B147` | CS | tree_spread |
| `foliage.birch` | `#4E5B31` → `#717D3F` → `#B5B043` | CS | tree_birch |
| `foliage.sapling` | `#364F30` → `#697E35` → `#BFBA3E` | CS | tree_sapling |
| `foliage.fir` | `#162D29` → `#355A4A` → `#708F60` | CS | both conifers (coolest green in the game) |
| `foliage.bush` | `#223F2B` → `#547133` → `#A7B13F` | CS `bush_leafy` | bush_a, bush_berry (`bush_flowering` `#223F2A` → `#4F6A35` → `#A5A539`) |
| `foliage.flat.*` | `DeepFoliage #3F5E46`, `ForestGreen #496A50`, `MeadowGreen #91AD72`, `SageGreen #B5C88A`, `FreshFoliage #B5D96B` | LC | small painted parts (atlas swatches), never a whole crown |

**Supporting: earth, stone, built, water, sky**

| Name | Hex | Source | Use |
|---|---|---|---|
| `path` | `#A89478` ± 10 % world noise | LP `paths.color` | every dirt path (ribbons). PT `path #C8B08E` is legacy, to retire |
| `soil.bed` / `soil.shade` / `soil.dry` | `#6E5444` / `#5B4538` / `#8A6B55` | PT `soil`, `soilDark`, `soilLight` | tilled ground: plots, cranberry bed, molehills. Approved by the owner, 2026-10-25: LC `Dirt #C79A6E` / `Soil #B98B61` read as timber on the plot and are not used for tilled soil. All three sit inside the earth band (saturation 0.38). Since 2026-10-25 the painted plot (ART-PLAN P0-1, `scripts/assets/plot.mjs`) paints its atlas `soil` cell from these three (look.config `SoilBed` / `SoilShade` / `SoilDry`), and its timber edging is the weathered grey board (`plank_grey`), lighter and less red than `MutedWood`, which is only 3° of hue and 0.08 of luma from `#6E5444` |
| `stone.top` / `.face` / `.dark` | `#D0BFB4` / `#B29E94` / `#8A7B76` | LP `stone` | terrain rock: coast walls, risers |
| `stone.under` / `.deep` | `#AEA29C` / `#C2B8B2` | LP `stone` | island underside (fading to the sky's below colour) |
| `stone.strata.warm` / `.cool` | `#907A70` / `#787A8A` | LP `stone.strata` | cliff banding multipliers |
| `stone.prop` / `.propDark` | `Stone #C3B49A` / `DarkStone #9C8C74` | LC | models: foundations, rocks, the ruin's blocks (`#B6A990` painted) |
| `timber` / `.dark` / `.light` | `MutedWood #986641` / `DarkWood #6E4A2F` / `LightWood #C79A6A` | LC | posts, planks, logs (atlas paints `#8E5D39` / `#664329` / `#B3895C`) |
| `roof` / `.dark` | `Terracotta #B9654B` / `TerracottaDark #9C4E39` | LC | clay tiles; atlas tiles warmed 12 % to gold (`#B66744`) to sit with the farmhouse's painted roof |
| `wall` / `.trim` / `.shade` | `WarmIvory #F3E4C4` / `SoftCream #FBF1DA` / `WallShade #E6D2A8` | LC | walls, trims, canvas (`#CABA9F` painted) |
| `ink.warm` | `DeepWarmInk #3E352B` | LC | the darkest model colour: eyes, iron, slits. Never black |
| `water.pond` | shallow `#93BCAE`, mid `#7CA7A6`, deep `#4E7D8C`, foam `#F4F4EB`, bed `#8E8B79` | WS | farm pond (green-teal) |
| `water.lake` | `#86B0A2` / `#6A9899` / `#4F7188`, foam `#EEF2EA`, bed tint `#6D7F6C` | WS | wetland lake (cooler teal) |
| `water.river` | `#B4D4CE` / `#82ACB0` / `#5F93A2`, foam `#F6F6EE` | WS | stream, river, outflow, fall body/streak |
| `water.tarn` | `#9BB0B8` / `#7A9EBD` / `#4C6275`, foam `#EDF1F4`, bed `#6F7A80` | WS | highland tarn (slate) |
| `water.spring` | `#BEDFD2` / `#7FC4BE` / `#4FA7B0`, foam `#F6F2EA`, sinter rim `#E3D2B4` | WS | hot spring (milky turquoise) |
| `water.legacy` | `#91B7C8` / `#6E9AB0` / foam `#E8F1F0` | PT | today's game water; retired by the revamp |
| `sky.game` (13 h) | top `#9CC1D3`, mid `#C9DFE3`, bottom `#F5F0E6`, fog `#DDE7E4` | `skyPalette.ts:43-47` | today's day-cycle sky; other keys in that table |
| `sky.target` | zenith `#6FA4DA`, mid `#9EC2E8`, horizon `#CFDFE8`, sun-side `#F6DCB4`, below `#D6C2CA`, fog `#D9E3E6` | LP `sky`, `fog` | the approved painted sky (LOOK-PORT step 3) |
| `cloud.target` | lit top `#FFF6E4`, underside `#A6AED6`; sea cap `#FFF6E6`, mid `#D6D8F2`, shade `#A8B0E8`, deep `#A0A8E4` | LP `clouds.lit`, `sky.paint.sea` | clouds and cloud sea (cream tops, periwinkle undersides) |
| `cloud.game` | `#FBF5EA` + emissive `#6A6478` × 0.22 | `Backdrop.tsx:17` | today's puffs; interim until the painted sea |

**Light colours**

| Name | Hex | Source |
|---|---|---|
| `light.sun.game` (13 h) / `.target` | `#FFF5E4` × 1.9 / `#FFE4C2` × 4.4 | `skyPalette.ts:45` / LP `sun` |
| `light.hemi.game` / `.target` | `#E2EDF0` over `#80705A` × 1.1 / `#C4C8DE` over `#8A7650` × 2 | `skyPalette.ts:45` / LP `hemisphere` |
| `light.shade` / `light.rim` | `#A496D8` × 0.12 / `#FFD2A6` × 0.35 | LP `cel` |
| `light.ink` / `light.grade` | `#2F2233` × 0.85 / shadow `#7C86C8`, highlight `#FFE2BC` | LP `post` |
| `light.contact` | `#2A3A3C` α 0.32 | LP `shadows.contact` |

**Exceptional**

| Name | Hex | Source | Rule |
|---|---|---|---|
| `flower.coral` / `.blossom` / `.gold` / `.lavender` / `.cream` | `#E58A6A` / `#E7A6AE` / `#EFC25A` / `#B9A3D4` / `#FBF1DA` | LC | drifts of one or two kinds (schemes in `world.config.mjs` `plants.flowers.schemes`), never an even rainbow |
| `flower.bushPink` / `.bushCream` | `#DA8C85` / `#F0D8B4` | CS `bush_flowering` | blossom on bushes |
| `autumn.rust` / `.amber` / `.gold` | the oak / beech / birch ramps rotated to hue 22° / 36° / 48° | `lib/species.mjs:46-48` | 5–10 % of isle broadleaf, none on the farm; gold trees, not a season (§B.1) |
| `glow.window` | `#FFC877` (target) / emissive `#F2B35E` (game) | LP `farm.windowColor` / `materials.ts:37` | windows, lanterns, lamp glass; driven by the day cycle |
| `glow.porch` / `glow.firefly` | `#FFB866` (target), `#F6BE72` (game) / `#FFDB85` | LP / `Farmhouse.tsx:71` / `Fireflies.tsx:52` | night only |
| `accent.barnaby` | cloth `#698488`, scarf `#C37A48`, brass `#C79D47`, skin `#F2C0A3` | painted atlas cells (measured) | his alone; slate-teal, never purple |
| `accent.magic` | warm `glow.window` against cool `cloud.target` periwinkle | approved 2026-10-25 | magic is lit, never a new hue family |

### B.3 UI palette

See §F.2. The UI keeps the brand tokens of `src/styles/tokens.css`; the world does not borrow them for models (Fact: `palette.ts` does
today for stand-ins; retire with P2-1).

## C. Shape language and proportions

### C.1 Vocabulary

- **Softly irregular, chunky, painterly.** Rounded clumps for foliage (separate leaf pads, a little branch between them), slab-faceted
  warm stone for rock (vertical slab facets, strata bands, a grass lip on top), straight-but-hand-skewed timber (painted procedural
  geometry is jittered: `lib/jitter.mjs`), soft mounded soil and hay.
- **Stylisation.** Read like a hand-painted diorama piece at 47 px/u: silhouettes simple, proportions exaggerated a little (chunkier
  trims, bigger windows, fatter roofs, ASSETS.md §art direction still valid here). Realism only in material cues (grain, moss, wear).
- **Edges.** No modelled bevels for their own sake; edges are softened by paint (lit top edge, dark crevice), by jitter and by the cel
  terminator. No razor edges, no mirror symmetry left unjittered on buildings.
- **Faceting.** Flat-shaded low-poly is retired for placed objects (Decided). Terrain keeps smooth grass and faceted rock
  (`pieceMat` uses the baked normals).
- **Detail by importance and size (approved by the owner, 2026-10-25; a review-time rule, no objective test).** The smallest painted feature ≥ 0.05 u (≈ 2.4 px at the default 35 u,
  6 px at 14 u); geometric detail below 0.1 u goes into the texture; a model shows its full character at 14 u and still reads as a
  silhouette plus two or three colour masses at 35 u.

### C.2 Scale conventions (u; 1 u ≈ 1 m in the toy world; measured from the published GLBs)

| Class | Heights and sizes |
|---|---|
| Characters | Barnaby 1.06 (feet at y 0, within 0.5 u of the axis). Character height 1.0–1.1 is the yardstick (Fin and Síofra stand on it too, ART-PLAN A18, A19); a door is ≥ 0.95 tall (approved 2026-10-25; review-time: no model has a named `Door` node yet, add one if it should become a check). |
| Animals | chicken 0.45, duck 0.30 (waterline y 0), dog 0.55 (0.72 long), goat 0.68, sheep 0.74 (0.81 long), cat 0.23. The Brown hare (Síofra's first appearance) is drawn ~1.5× life (ASSETS.md); there are no other wild visitors (lore C4). |
| Buildings | farmhouse 2.70 (3.54 × 2.76 with lean-to), windmill 3.79, lighthouse 3.75, greenhouse 1.50 (2.05 × 1.21), well 1.30, woodshed 0.889 (1.16 × 0.79), tower ruin 1.32 (2.08 across), Barnaby's camp 0.69. |
| Trees (model) | round/birch 2.30, spread 1.92, fruit 1.90, sapling 1.34, fir 2.55, pine_b 1.97, hero tree 3.40. |
| Trees (placed) | Farm: ×1.0 × layout scale 0.95–1.6 → 2.2–4.1 (Decided ×1.0). Composition: scale 0.49–1.23, mean 0.70 broadleaf (~1.6) and 0.92 conifer (~2.3). |
| Shrubs, cover | bushes 0.90 (placed ~0.9×), card shrubs 0.25–0.40, grass 0.15–0.55, flowers 0.20–0.30, perennials 0.38–0.72, clover 0.09. |
| Props | bench 0.68 (seat 0.32), lantern 0.90, beehive 0.73, haystack 0.84, cart 0.69, scarecrow 1.45 drawn ×0.75, fence posts 0.46 on 0.62 segments, rocks ~1.0 × 0.6 (placed ~0.58×), outcrops 2.8 / 1.9, wetland jetty 0.72 × 1.71 (deck y 0.2). |
| Garden | plot top 0.94 × 0.94, 0.16–0.19 tall; a crop fills the plot, y 0 at the soil; flower bed ≤ 1.1 × 0.8 in a 0.6 u disc. |
| Islands | MAIN ~18 u across (framing 27 × 19 u); joined island ~55 u; coast wall 2 u; MAIN cone to y −6.9, petals −7.9 … −10.8 (highland −14). |

Axes for every model: Y up, front +Z, origin at the base centre on y 0 (water models: y 0 = waterline), transforms applied (ASSETS.md
technical spec, still valid).

## D. Materials and rendering

### D.1 Colour management and tone mapping (Fact, verified in code)

- Output `sRGB` (R3F default; no `linear` prop), tone mapping **`NoToneMapping`** (`<Canvas flat>`, `src/world/World.tsx:334`),
  transparent canvas over the CSS sky (`World.tsx:339-340`), dpr 1–1.75.
- `THREE.ColorManagement` is on (three default): hex colours are authored sRGB and converted to linear; vertex colours are linear
  (`BLUEPRINT.md` "Rendering notes").
- Colour textures: GLTFLoader tags them sRGB; the game re-stores them as `NoColorSpace` RGBA8 and decodes in the shader
  (`DECODE_VIDEO_TEXTURE`) because Apple GPUs corrupt GPU-built mips of sRGB textures (`src/world/assetMaterials.ts:24-45`).
  Emissive window masks stay linear. Data textures (height grids, water maps) are `NoColorSpace`.
- Water and fireflies are ShaderMaterials; water includes `colorspace_fragment` (`Water.tsx:47`), fireflies are additive without it.
- **Target (approved look, not yet ported):** `NeutralToneMapping`, exposure 1.05 (Dusk 1.10), applied exactly once (LOOK-PORT step 1).
  **Rule:** author albedo as plain sRGB hex/texture; never pre-brighten or pre-saturate to compensate for a tone mapper; a new material
  must read correctly under both `None` and `Neutral` until the flag flips (check both in VISUAL-QA).

### D.2 Surface model

| Property | Rule | Source |
|---|---|---|
| Shading model | Today: procedural = `MeshLambertMaterial` (flat-shaded by default, `materials.ts:9-18`), terrain = Lambert with baked normals, GLBs = `MeshStandardMaterial`. Target: Lambert + cel bands for everything opaque (LOOK-PORT step 2, `celKind` terrain / foliage / building / none). New materials: Lambert-compatible inputs only. | Fact / Decided direction |
| Roughness / metalness | roughness 0.92 (cards 1.0), metalness 0. Metal looks (brass, iron) are painted, never metallic. | `look.config.mjs:121-127`, measured on every GLB |
| Maps | baseColor only (plus `Glow` emissive masks). No normal, roughness, AO or metal maps. | measured |
| Alpha | `MASK` for leaf/plant cards; `BLEND` only for path ribbons, water, fx, rise/smoke puffs; never on opaque models. | measured |
| Sidedness | Meshy shells, bark and conifer leaves: `doubleSided`. Plant-kit cards and broadleaf leaves: single-sided materials made two-sided by duplicated faces with up-leaning normals (a `DoubleSide` material would flip the backs dark; plantkit.test K4). Closed procedural meshes: single-sided. | measured |
| Special names | `Glow` (plain = shared glow material; textured = painted band + emissive mask, kept), `Glass` (translucent `glassMat`), `Water`, `Tint` (Studio recolour), `Fruit`; nodes `Canopy`, `Crown`, `Head`, `Tail`, `Blades`, `Smoke`, `Beam`, `PorchLight`, `Wheel`, `Wings`, `Sway`, `Flame`, `Dome`. | `ASSETS.md` §technical spec + Phase 2 names (valid) |

### D.3 Texture approaches (when each is allowed)

| Approach | What | Allowed for | Tool |
|---|---|---|---|
| **A. Meshy painted atlas** | one painted albedo per model from an approved concept, finished in code | buildings, animals, hero props, rocks/outcrops; anything organic and one-off | `scripts/meshy/finish.mjs` (Meshy credits: owner's yes, ≤ 3 requests at once) |
| **B. Painted procedural** | code geometry UV-mapped onto the shared 512² painted atlas + baked AO in `COLOR_0` | the five decided props (woodshed, wetland_jetty, barnaby, barnaby_camp, tower_ruin), and small structural props built from planks, tiles, stone, rope (fences, bridges, plot edging, shelters) | `lib/paintedAtlas.mjs`, `scripts/assets/<id>.mjs` |
| **C. Ramp reskin** | a CC0 model repainted with gradient ramps taken from an approved concept | trees and bushes (Decided: Quaternius MegaKit) | `scripts/reskin.mjs` |
| **D. Code-painted cards** | crossed/tilted cards with painted cut-out PNGs | ground cover, flowers, perennials, card shrubs, crop stages, flower beds | `lib/plantkit.mjs` |
| **E. Flat colour** | vertex or material colour, no texture | terrain paint, path ribbons, transient fx only. A placed object in flat colour is a stand-in and goes on the plan. | — |

- **Never palette-flatten a painted texture** (Decided: "drastically worse"). Fix blur with resolution (512 → 1024), anisotropy 8,
  correct mips and colour space; recolour with hue/ramp shifts that keep every stroke.
- **Texel density (approved by the owner, 2026-10-25; measured in ASSET-CATALOG, enforced by VISUAL-QA V1 A11-A13).** Buildings and
  landmark walls ≥ **75** texels/u (the large Meshy buildings measure 79–145: a property of big atlases, not three outliers); hero walls
  ≥ 128 is the target for any new hero (the windmill, 133, meets it) and **the farmhouse (79) is the one named exception**: its 1024²
  size was the owner's choice, raise it only by resolution, never by flattening (plan P2-2); roofs ≥ 200 (the farmhouse's roof is 288);
  props **150**–500 (the Meshy cart is 163) and painted-procedural props and atlas models **200**–500 (observed 246–465); boulders
  200–500; outcrops ≥ **100** (outcrop_a 106); cards 250–1,000; far versions ≥ 110. **Neighbours stay within 3× of each other inside a
  family of similar models** (Meshy buildings, props, animals, painted-atlas models, plant cards, boulders + outcrops); across families
  the step is reported, not gated (the farmhouse beside the sharp props is VISUAL-AUDIT #7, plan P2-2). `outcrop_b` (73 texels/u, the
  lowest of any published model, 3.94× the sharpest boulder) is a genuine outlier: it sits in the known-defects register
  (`KNOWN_DEFECTS`, plan P2-2) so enforcement passes while it stays tracked; re-texture it by resolution, never by flattening.
- **Size.** 512² default; 1024² hero only (farmhouse, windmill, hero tree today); far versions 256²; cards 128–512 px; JPEG q85 for
  opaque albedo (q70 allowed when visually identical), PNG for alpha.

### D.4 Light, shadow, atmosphere

| Topic | Today (game, Fact) | Target (Decided look; port pending) |
|---|---|---|
| Key light | One directional, KEYS colour/intensity (`skyPalette.ts:30-65`), elevation `0.28 + sin(π·day)·0.85` rad (≈ 64° at 14:00) | Low warm sun: el 30°, back-left (az −115° from the `full` view), `#FFE4C2` × 4.4 (Golden); mood keyframes 8.5 / 16.5 / 19.5 h + a night key to author |
| Fill | Hemisphere 0.85–1.1, no ambient | Hemisphere `#C4C8DE` / `#8A7650` × 2, ambient 0 |
| Shade | none (Lambert only) | cel terminator 0.26, violet shade `#A496D8` × 0.12, warm rim `#FFD2A6` × 0.35 |
| Shadows | PCF 2048, bias −0.0004, normalBias 0.035, box ±17 (≤ 26 with pieces), refresh every 4th frame | PCF 2048, bias −0.0005, normalBias 0.06, radius 1.5, box fitted to casters |
| Who casts | every placed model; composed trees only (not shrubs/cover) (`Composed.tsx:143`) | same |
| AO / contact | painted in Meshy textures; baked `COLOR_0` AO on painted procedural; none on terrain contact | add contact grounding (`shadows.contact #2A3A3C` α 0.32) where a model meets lawn; no SSAO on phones |
| Fog | linear, colour KEYS `fog`, near cam+40, far cam+230 | colour = sky horizon along the view; haze only beyond the island, never over the farm (STYLE R3) |
| Underside | fog only | haze fade to `sky.below` from y −5 to −22 (strength 0.6), cliff strata |
| Post | none | HIGH tier only: ink outline, bloom (threshold 0.92), split-tone grade, vignette 0.12; phones LOW |

Water appearance: soft 3-band depth ramp, sky-gradient Fresnel instead of reflections, foam as broken dashes, sun glints only on the
mid tier; no planar/SSR reflections, no refraction (water spec §1, §3).

### D.5 Shader and performance budgets

- **Shaders.** Every world material is Lambert plus string patches chained through one `addPatch` (LOOK-PORT step 2; water uses the
  same). No new bare `ShaderMaterial` for lit surfaces; ShaderMaterial only for unlit things (sky dome, fireflies, beams). Shader-chunk
  anchors are tied to three 0.186.x (pinned minor).
- **Frame budget.** The binding gate is frame time on the reference GPU (GTX 1660 S, Windows Chrome) and the 4× CPU-throttled mobile
  profile: a feature adds ≤ +0.3 ms desktop median and ≤ +1.0 ms mobile-profile median (water spec §5 gates; trees measured +0.2 /
  +1.5–2.9 ms).
- **Draw calls.** Proof gate ≤ 920 (ruling R21); the game measured 995 (1,643 in a shadow frame) with all pieces after the trees; water
  ≤ 12 in all. A new asset family must instance (one InstancedMesh per asset per piece per primitive) or share materials.
- **Triangles per asset.** See ASSET-RULES (classes from `ASSETS.md:82` plus the tree caps of ruling R15) and its list of the seven
  named exceptions (farmhouse 3,646, windmill 3,480, lighthouse 3,028, hero tree 5,105, dog 1,918, cart 1,466, scarecrow 731; any new
  over-cap model needs the owner to add it). Composition: ≤ 8,000 plants and ≤ 80,000 kit triangles per piece.
- **Textures.** ≤ 512² per asset (1024² hero), ≤ 200 KB per file (hero ≤ 600 KB); water maps ≤ 1.5 MB GPU in all.
- **Phones.** Far trees everywhere (`composition.ts:234`), LOW look tier, water phone tier (≤ 3 texture reads per pixel), dpr ≤ 1.75.

## E. Camera and composition

### E.1 Projection and framing (Fact)

Perspective, fov 30 (half 15°), near 0.5, far 600. Target fixed at (0, −0.6, 0), no pan. View direction (1, 0.78, 1): azimuth 45°
(OrbitControls 0.7854 rad; proof az is degrees from +z toward +x), elevation 28.88° (polar 1.0668). Zoom 14 u … max(140, the
overview distance ≤ 400). Polar 0.62–1.22 (el 54.5°–20.1°); azimuth 45° ± 0.85 rad. Framing fits MAIN's 27 × 19 u at fill 0.95 with
a 30 u floor; portrait screens add docked pieces' middles into 72 % (v) × 86 % (h) of the view, capped at 130 u (`framing.ts:31-103`).
Screen density: 47 css px/u at 35.45 u on 1440×900; 120 at 14 u; ~15 at 104 u on a 390 px phone.

### E.2 Canonical cameras (use these ids in every comparison)

| Id | Purpose | Viewport (css @ dpr) | Az | El (polar) | Distance | State |
|---|---|---|---|---|---|---|
| `CAM-DESK` | game default | 1440×900 @1 | 45° | 28.88° (1.0668) | 35.45 | fresh farm + mid-game |
| `CAM-ORBIT-W` | orbit −0.5 rad | 1440×900 | 16.35° | 28.88° | 35.45 | mid-game |
| `CAM-ORBIT-E` | orbit +0.5 rad | 1440×900 | 73.65° | 28.88° | 35.45 | mid-game |
| `CAM-LOW` | lowest tilt | 1440×900 | 45° | 20.10° (1.22) | 35.45 | mid-game, shows underside + coast |
| `CAM-HIGH` | highest tilt | 1440×900 | 45° | 54.48° (0.62) | 35.45 | layout read |
| `CAM-CLOSE` | close zoom | 1440×900 | 45° | 28.88° | 14 | material + texture check |
| `CAM-PHONE` | phone portrait | 390×844 @2 | 45° | 28.88° | frame: 103.6 (MAIN alone); up to 130 with pieces | fresh + late |
| `CAM-PHONE-E2E` | e2e phone | 412×915 (Pixel 7) | 45° | 28.88° | 106.3 / ≤ 130 | as the e2e suite |
| `CAM-TABLET` | compact desktop | 1024×768 @1 | 45° | 28.88° | frame (35.9 at 4:3) | HUD check |
| `CAM-FAR` | overview | 1440×900 | 45° | 28.88° | 140 | everything docked |
| `CAM-TURN` | one asset | 400² cells | −45, 45, 135, −135 at el 24; game 45 at 29 | — | auto-fit | `meshy/turntable.mjs` |

Target (0, −0.6, 0) and fov 30 for all game cameras. Light: the in-game "afternoon" preset (14.5 h) for comparisons, plus evening
(19.1 h) and night (22.6 h) for light checks; after the look port, the mood keyframes 8.5 / 16.5 / 19.5 h. Unlock states: fresh
(`main`), mid-game (main + meadow, grove, islet), all docked. Proof equivalents use `?cam=az,el,dist&tgt=0,-0.6,0`.

### E.3 Composition rules

- **Hierarchy (STYLE C1).** One hero: the farmhouse with the garden. Secondary anchors: windmill, pond, hero tree; per piece one anchor
  (highland ruin/tower, wetland lake + its jetty, islet lighthouse). The jetty is the wetland jetty on the lake (Fin's; the Pond
  Jetty restoration, game id `pondJetty`, builds it); before the wetland has docked, Fin sits by the farm pond, with no jetty there.
  Everything else is texture.
- **Negative space.** The farm clearing stays open; MAIN's near side (+x/+z, θ 22–68°, r < 16) carries nothing tall (STYLE §7b).
  Tall pieces sit on the sides and far side (`BLUEPRINT.md` pieces table).
- **Scale relative to the island.** Buildings ≤ 4 u tall on an ~18 u MAIN; no single object wider than ~1/6 of MAIN except the house.
- **Depth.** Foreground lawn and cover, mid-ground farm, background woodland and docked pieces, then haze and cloud sea; separation by
  value (near darker/warmer, far lighter/cooler) and by fog, not by outlines alone.
- **HUD-safe zones (approved by the owner, 2026-10-25; from UI-NOTES §6 and the approved board).** Desktop 1440×900: keep the farmhouse
  and garden inside x 320–1120, y 96–790 with no panel open; with the 384 px drawer open, the island may slide under it but the
  farmhouse stays visible. Phone 390×844: the focal band is y 230–740 css after the redesign's compact top (today y 300–740); framing
  should centre the island in that band, not in the screen (plan P1-4: a framing task, not a pass/fail check on assets). Projected
  for the review at the five desktop cameras (default, both orbit extremes, both tilt extremes) the farmhouse and garden sit inside the
  zone, tightest 34 px at the top edge of `CAM-HIGH`, and left of the drawer edge (x 1056); on the phone they sit inside the band
  already, only the centring is outstanding. Checked by hand for now.
- **Screenshot rules.** Canonical ids only; HUD on for UI checks, off (or `?ui=0` in the proof) for art checks; fixed clock; still
  motion for determinism; never judge a model from one hero angle (≥ 3 orbit angles + the default camera).

## F. UI art direction (matches UI-REDESIGN-BRIEF, approved 2026-10-24)

### F.1 Principles

Minimal noise; strong hierarchy; the island stays the visual focus; consistent spacing, type, surfaces and controls; progressive
disclosure instead of big persistent panels; real touch and desktop layouts. The UI shares the world's palette (cream walls, forest
foliage, hay gold, clay terracotta, warm ink) but none of its textures: no paper, no botanical borders, no gradients, no ornamental
frames, restrained blur (UI-REDESIGN-BRIEF §3). Fantasy decoration only with the owner's explicit approval.

### F.2 Tokens (existing values; semantic names to consolidate in `src/styles/tokens.css`)

| Role | Token today | Value |
|---|---|---|
| Page / sky base | `--ivory` | `#F5F0E6` |
| Surface (HUD, panels) | `--cream`, `--panel` | `#FFF8EC`; translucent `rgba(255,248,236,0.92)` |
| Sunken surface | `--panel-sunk` | `#F5ECDC` |
| Text main / secondary / muted | `--ink` / `--ink-soft` / `--ink-faint` | `#403D35` / `#6B665A` / `#8E887A` |
| Borders | `--line` / `--line-strong` | ink at 12 % / 20 % |
| Primary action, active | `--forest` / pressed `--forest-deep` | `#526E58` / `#435C49` |
| Secondary greens | `--sage` / `--meadow` | `#9CAF88` / `#7D9B70` |
| Counts, rewards, badges | `--gold` | `#E8BD72` |
| Destructive, end session, error | `--terracotta` / `--terracotta-deep` | `#C98268` / `#A8624A` |
| Info, cool accents | `--sky` / `--dusty` | `#BFD7DE` / `#91B7C8` |
| Wood accent (icons) | `--wood` | `#A9825D` |
| Focus | `--focus` | 3 px `rgba(82,110,88,0.45)` |
| Disabled (to tokenise) | raw in `app.css` | bg `#CFC6B4`, text `#6F695C` |
| Warning (to define) | none | approved 2026-10-25, **changed from the proposal**: `--ink` text `#403D35` on the gold tint `rgba(232,189,114,0.28)` (the existing tint, `app.css:785`; over `--cream` it composites to `#F9E7CA`): **8.94:1**, AA needs 4.5:1. `--gold #E8BD72` stays on the icon and a 1 px border only, never the only cue. The proposed gold text on that tint measured 1.45:1 (1.66:1 on plain cream), nearly unreadable |
| Sky (runtime) | `--sky-top/mid/bottom`, `--night` | written by `skyPalette.ts` `applySkyCss`; HUD stays legible day to night |

The board's generated hexes (Primary `#6B8B6E`, Error `#D9785F`, Surface `#FBF6EF`, Muted `#E7E1D5`) are **not** adopted; the
written brief keeps the existing palette.

### F.3 Typography, spacing, shape

- **Fonts.** Fraunces Variable (`--font-display`) for the farm name, panel titles, level title, welcome and recap headings; Inter Variable
  (`--font-ui`) for all UI text, buttons, labels, numbers. Self-hosted only (CSP).
- **Type scale (approved by the owner, 2026-10-25, to replace the 17 sizes in `app.css`).** 11/1.3 dock labels and captions · 12/1.35
  meta · 13/1.4 secondary UI · 14/1.45 body · 16/1.4 emphasis · 20/1.25 panel titles (Fraunces) · 24/1.2 section display · 32/1.15 timer ·
  40/1.1 welcome title. Mobile dock labels 11–12 px, never wrapped (brief §5). **Enforced as a shrinking allowlist, not a gate (V3):**
  38 of today's 82 `font-size` declarations are on the scale; the 44 that are not (11 off-scale sizes, listed with their mapping in
  VISUAL-QA §3b) stay allowed until the redesign (G7) maps them, the list only shrinks, and **a new size must be on the scale**.
- **Spacing.** 4 px base: 4, 8, 12, 16, 24, 32 (brief §7).
- **Radii.** small controls 8, buttons/inputs 12, cards 16, panels 20, pills fully round (brief §7; replaces 18/12/8).
- **Sizes.** Touch targets ≥ 44 × 44 css px; desktop drawer ≈ 384 px; phone sheets above the dock, max 64 vh, header always visible.
- **Surface hierarchy.** L0 world · L1 HUD pills and chips (cream, 1 px line, low shadow) · L2 panels, drawers, sheets (solid cream,
  medium shadow) · L3 dialogs, tour, recap (solid, high shadow). Not every element gets a shadow or blur.
- **Icons.** Keep `src/ui/Icon.tsx`: 24 × 24 grid, warm ink `#403D35` stroke 1.4 px, round caps and joins, two-tone palette fills;
  illustrations in `src/ui/Art.tsx`. No new icon dependency.
- **States.** Primary: forest fill, cream text; hover/pressed forest-deep; quiet: transparent with ink-soft; danger: terracotta-deep;
  disabled: tokenised muted pair; selected: forest outline or fill; badges: gold. Focus ring always visible.
- **Tooltips and popovers (approved by the owner, 2026-10-25).** Solid cream, 1 px line, radius 8, 12 px text, shown after 400 ms hover / on
  long-press, never covering the target, Escape closes. A spec for a component that does not exist yet (today: 30 native `title=` attributes).
- **Motion.** Easing `--ease cubic-bezier(0.22, 0.8, 0.3, 1)`; 150 ms state changes, 250 ms panels and labels in, 600 ms bars;
  toasts 6.5 s (9.75 s level-up); reduced motion and the in-game Motion setting cut it (`app.css:1725`).
- **Responsive.** Keep the 900 px and 720 px breakpoints; test 1440×900, 1024×768, 720 wide, 390×844, 375×667. Mobile dock: Farm,
  Garden, Shop, Items, Journal, Progress, six equal items, safe-area aware, icon-only fallback with accessible names.
- **World-space UI.** Labels and ready markers over the canvas use the pill style of the HUD (cream at 0.92, 12–13 px Inter, radius
  full) and never duplicate a HUD count.

## G. How to make a new asset (phase 7 workflow)

1. **Read.** This bible, the matching section of ASSET-RULES, and ASSET-CATALOG (is there something to reuse or extend?).
2. **Write a spec block** in the PR or a `specs/` note: id, class, approach (D.3), size in u, triangle cap, texture size, palette tokens
   (B.2), nodes and special names, where it stands, what it replaces.
3. **Check conflicts.** Lore (keep mysteries open; the standing rules under the §A table, no decay among them), layout keep-clears (`BLUEPRINT.md`), the camera's near-side rule.
4. **Build** with the approach's tool (ART-TOOLING); never hand-edit a GLB; deterministic output.
5. **Publish** through `publish-models.mjs` or `export-composition.mjs` (manifest `ready` + notes).
6. **Test red-green.** Add or extend a node test that fails first (budget, nodes, texture rules, placement), then passes.
7. **Render** `CAM-TURN`, then in game context `CAM-DESK`, `CAM-ORBIT-W`, `CAM-ORBIT-E`, `CAM-CLOSE`, `CAM-PHONE` (and `CAM-LOW` for
   anything on a coast), under today's light and, once ported, the Golden afternoon.
8. **Compare** beside its neighbours and the farmhouse (the style anchor) and the approved concept; check palette band, silhouette,
   scale against C.2, texel density against D.3, and the screen shares in B.1.
9. **Correct** and re-render; responsive/UI checks if it adds UI.
10. **Record.** Update ASSET-CATALOG, and this bible's decision log if the owner approved a change. A request that conflicts with a
    decision here keeps the decision until the owner says otherwise.

---

## Decision log (owner unless noted)

| Date | Decision |
|---|---|
| 2026-10-18 | Blueprint island: one island cut into 8 docking pieces, layout frozen (`BLUEPRINT.md`). Worldseed direction absorbs LOOK-BRIEF. |
| 2026-10-22 | Painterly direction: unify toward the farmhouse's painted look, retire flat low-poly; lawns not solid colour; reeds in water stay. |
| 2026-10-22 | Meshy textures are never palette-flattened ("drastically worse"); fix blur by resolution and filtering. |
| 2026-10-22 | Trees: CC0 Quaternius MegaKit reskinned with the concept ramps; firs and the flowering bush approved; far versions; farm trees ×1.0. |
| 2026-10-22 | Character by area: farm = tidy lawn, isles = wild and flowery (living-ground spec). |
| 2026-10-23/24 | Props woodshed, wetland_jetty, barnaby, barnaby_camp, tower_ruin are painted procedural, no Meshy. |
| 2026-10-23 | Underside taper: lone petals hang as their own rock. |
| 2026-10-23 | Barnaby (controller, delegated): crumpled pointed hat, slate-teal robe, warm scarf, brass band, hip lantern, satchel; no purple, no long white beard; age ambiguous (adopted into the lore by the owner, 2026-10-25). The ruin reads as an ordinary dry-stone ruin, with no symbols and no clue to an owner. Barnaby calls it 'perfectly ordinary'; that's his line, not a fact the art settles. |
| 2026-10-23 | Water (draft, owner reviewing): custom baked-data Lambert material on WebGL, 3-band depth ramp, per-body palettes; cloud sea out of scope. |
| 2026-10-24 | Woodshed at spot B beside the log stack (`BLUEPRINT.md`). Farm pond reshaped to the teardrop (pond mock A) with a seamless join into the stream (as briefed; port pending). |
| 2026-10-24 | UI: Modern Minimalist (UI-REDESIGN-BRIEF + board). |
| 2026-10-25 | Rules review ("Accept all recommendations"): every rule marked proposed is approved, retuned to the measured approved art. Colour: stone ≤ 0.30, clay roof its own band 0.45–0.80, timber floor 0.35, dark-green floor 0.30, water 0.15–0.55; 15 legacy colours are named exceptions with a reason, not wider bands; greens ≥ 45 % of the default view (no cap), supporting 20–40 %, no number for the exceptional share. Texture: buildings ≥ 75, props ≥ 150, painted ≥ 200, outcrops ≥ 100, any new hero ≥ 128, the farmhouse (79) a named exception, the 3× neighbour rule within a family only. Triangles: seven named exceptions. UI: warning = ink text on the gold tint (8.94:1), type scale as a shrinking allowlist. Kept: HUD-safe zones, plot soil `#6E5444`, the tree pivot rule (0.25–0.45 × H). Dropped: the 75 % bark clause. Known defects tracked in a register: `outcrop_b` density (P2-2), `tree_spread` pivot (P2-4). V1 and V2 now enforce; the gate on art stages 2 onward is lifted (ART-PLAN §3). |
| 2026-10-25 | Fin's jetty (lore check of PR #60; owner: "The wetland. But if it's not unlocked he sits by the pond."): `wetland_jetty` stays on the wetland lake as built, with its anchor and the 0.6 u shed patch for Fin's shed. The Pond Jetty restoration (game id `pondJetty`) builds it; the object is the wetland jetty, not a farm-pond jetty. Before the wetland has docked, Fin sits by the farm pond, with no jetty there (ART-PLAN A18). |
| 2026-10-25 | Lore answers for the art (the gaps the lore check of PR #60 left; the owner approved all 11, as written under each Recommended; 1 and 3 were already in): the ruin is the built `tower_ruin`, changed only by Barnaby's own things (2); Fin's look is the owner's model prompt (4) and Síofra is two models (5); no decay (6); the bell is heard, never seen (7); the cairn's marks are never legible (8); a long late summer, and seasons only add (9); the shiver's extent (10); distant isles are land and trees only (11); the sky-boat stays moored and nothing answers a beacon (12); letters are interface only (13). Sheet: `voice-drafts/art-answers-approved-2026-10-25.md`; rules in §A and §B.1, ASSET-RULES §1, §3 and §7–§9, entries in ASSETS.md and ART-PLAN A18–A23. |
