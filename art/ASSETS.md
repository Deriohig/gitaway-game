# Gitaway 3D asset brief

> **Status (2026-10-24).** [ART-BIBLE.md](ART-BIBLE.md) is the single source of truth for the look, with [ASSET-RULES.md](ASSET-RULES.md)
> for per-category rules and [ASSET-CATALOG.md](ASSET-CATALOG.md) for what exists. In this file, **"Art direction (please read)" and
> the "Materials" line of the technical spec are superseded** (they predate the 2026-10-22 painterly decision: models are painted and
> textured now, never flat low-poly). Still valid here: file layout, the manifest, axes, special node and material names, the size
> lists and the triangle budget classes, and the Phase 2 id list, except Group 2 (the visitors and residents are cut, lore C4; only
> `visitor_hare` stays, as Síofra's first appearance), `hedge_cottage`, `burrow_door`, `otter_holt`, Hazel's `mailbox` (letters are interface only: no post box or postie asset; owner-approved lore answer 13, 2026-10-25), `stone_bridge`
> (land docks; there is no bridge), and the Ardea and otter wording around `keeper_cottage` and `reed_beds`.

This is the brief for whoever builds Gitaway's 3D models. The game already runs
with simple procedural stand-ins, so every model you deliver replaces one of
those. Nothing is blocked while you work.

Phase 2 (the idle loop) adds 104 more model ids; see [Phase 2: the idle loop](#phase-2-the-idle-loop) at the end of this file.

## Where things go

| What | Where |
|---|---|
| Exported models | `public/models/<id>.glb` |
| Status of each model | `public/models/manifest.json` (see below) |
| Source files and build scripts | `art/src/`, `art/scripts/` |
| Preview renders (3/4 view, transparent bg, ~800px) | `art/previews/<id>.png` |

Rules for the asset session:

- Only touch `art/` and `public/models/`. Don't edit `src/` and don't run git commands; the game session commits.
- The repo lives in WSL at `/home/me/Projects/gitaway`. Files written through `\\wsl.localhost\...` come out owned by root. Write from inside WSL, or run `sudo chown -R $USER:$USER art public/models` afterwards.
- Keep models reproducible: a script in `art/scripts/` (Blender `bpy`, or three.js + `GLTFExporter`) that regenerates each `.glb` is better than a hand-edited file.

### manifest.json

```json
{
  "version": 1,
  "assets": {
    "farmhouse": { "file": "farmhouse.glb", "status": "ready", "tris": 2400, "notes": "" },
    "tree_round_a": { "file": "tree_round_a.glb", "status": "draft", "tris": 300, "notes": "canopy too dark?" }
  }
}
```

`status` is `draft` or `ready`. The game only loads `ready` assets; anything else keeps its procedural stand-in.

## Art direction (please read)

> **Superseded** by [ART-BIBLE.md](ART-BIBLE.md) §A–D (painterly direction, colour system, materials). Kept for history; the palette
> below is the UI brand palette, not the model palette (ART-BIBLE §B.2).

The look is **soft low-poly diorama**: miniature, calm, a bit storybook, and contemporary. Think a digital terrarium, not a farming sim.

- **Do:** use rounded, organic silhouettes made of a few chunky facets, flat shading, slightly irregular hand-made proportions, gentle bevels, and warm details like window boxes, firewood and a stone foundation.
- **Don't:** use pixel art, voxels, Stardew-like tile shapes, photoreal textures, saturated or neon colours, pure white or pure black, or tiny noisy detail that disappears at game zoom.
- Objects are seen from about 30–40° above, at a fair distance. Silhouette and colour blocks matter far more than detail. Exaggerate a little: chunkier trims, bigger windows.

### Palette

Use these for material base colours (or vertex colours). Stay within them, plus tints and shades of them.

| Name | Hex | Typical use |
|---|---|---|
| Warm ivory | `#F5F0E6` | walls, wool |
| Soft cream | `#FFF8EC` | trims, highlights |
| Sage green | `#9CAF88` | light foliage |
| Meadow green | `#7D9B70` | foliage |
| Forest green | `#526E58` | pines, dark foliage |
| Dusty blue | `#91B7C8` | water, scarecrow shirt |
| Soft sky blue | `#BFD7DE` | glass tint |
| Warm terracotta | `#C98268` | roofs, flowers, fruit |
| Muted wood | `#A9825D` | timber |
| Golden sunlight | `#E8BD72` | hay, beehive, fruit |
| Deep warm ink | `#403D35` | small dark accents only |

Earthy companions already used in the scene: soil `#6E5444`, dark wood `#7D5F45`, light wood `#C29E76`, stone `#C9BFB0`, dark stone `#9E968B`, roof shade `#A9654F`, wall shade `#E2D2B6`.

### Technical spec

- **Format:** glTF 2.0 binary (`.glb`). No Draco or meshopt compression, because the game runs offline under a strict content policy.
- **Axes:** Y up. **The front faces +Z** (door, face, blades). Origin at the **base centre**, on the ground (y = 0). Apply all transforms.
- **Scale:** 1 unit is roughly 1 metre in the toy world. Match the sizes below; I scale only for variety.
- **Materials:** standard PBR with metalness 0 and roughness 0.9–1. Use flat colours or vertex colours, and no image textures. A single tiny palette texture is acceptable if you must. Keep shared colours as shared materials. *(Superseded: textures are now required for placed models, see ART-BIBLE §D.3 and ASSET-RULES.)*
- **Special material names** (the engine looks for these):
  - `Glow`: window panes and lamp glass. The engine drives its emissive strength by time of day. Base colour `#F3D9A4`.
  - `Glass`: greenhouse panes (the engine makes it translucent).
- **Special node names** (empties or meshes the engine animates; the pivot must be where the motion turns):
  - `Blades`: windmill sails. Pivot at the hub, spinning around local **Z**.
  - `Head`: animals. Pivot at the neck; I tilt it on X to peck or graze.
  - `Tail`: dog. Pivot at the base; I wag it on Y.
  - `Canopy` and `Crown`: tree foliage. Pivot near the trunk top; I sway it.
  - `Smoke`: farmhouse chimney top (an empty).
  - `Beam`: lighthouse lamp centre (an empty).
- **Budgets:** buildings ≤ 3,000 triangles, animals ≤ 1,500, props and plants ≤ 600, crops ≤ 400 per stage. Each file should be under 200 KB.
- **Shadows:** every mesh casts and receives, so avoid paper-thin single-sided faces where the camera might see the back.

## The list, in priority order

Sizes are approximate footprints and heights in units. They match the current stand-ins, so the layout keeps working.

### 1. Farmhouse — `farmhouse`
- Stone foundation 2.3 × 1.9. Cream walls 2.1 × 1.7 × 1.3 tall, with timber corner posts.
- Terracotta gable roof, ridge along X, peak at about y 2.55.
- On the front (+Z): the door, two windows with flower boxes, a small porch deck about 1.4 × 0.66 with two posts and a little awning, and a step.
- A window on each side. A lean-to shed on −X, about 0.95 × 1.1 × 0.9. A firewood stack on +X at the back. The chimney sits at the back right with a `Smoke` empty on top.
- Windows use `Glow`.

### 2. Trees and shrubs
- `tree_round_a`, `tree_round_b`: trunk about 0.9 tall, then 2–3 overlapping rounded canopy clumps, ~2.2 tall overall and ~1.5 wide. Canopy goes under a `Canopy` node.
- `tree_pine_a`, `tree_pine_b`: 3 stacked soft-edged tiers in forest green, ~2.4 tall. Foliage goes under a `Crown` node.
- `tree_fruit`: a smaller round tree, ~1.9 tall, with ~8 fruits in terracotta and gold.
- `bush_a`, `bush_flowering`: about 0.7 wide and 0.5 tall. The flowering one has blossom dots (`#E7B8A8` and cream).

### 3. Crops: 7 crops × 3 stages
Each file shows **the whole contents of one garden plot**, a 0.94 × 0.94 square, with y = 0 at the soil surface. The names are `crop_<id>_1` (sprout), `crop_<id>_2` (growing) and `crop_<id>_3` (ready to harvest).

| id | Arrangement | Ready height | Ready look |
|---|---|---|---|
| radish | 2×2 | 0.2 | pink-red bulbs `#CF7378` peeking out, leafy tops |
| carrot | 2×2 | 0.3 | feathery tops, orange shoulders `#D98A4E` |
| lettuce | 2×2 | 0.2 | round pale-green rosettes |
| tomato | 2 plants | 0.55 | wooden stake, vine, red fruit `#C65A4A` (green at stage 2) |
| sunflower | 2 plants | 0.85 | gold petals, brown centre, heads tilted toward +Z |
| pumpkin | 1 | 0.4 | one big ribbed pumpkin `#D98B4A` with sprawling leaves |
| blueberry | 2 bushes | 0.45 | dark bushes with blue berries `#5E70A5` |

### 4. Garden plot — `plot`
- A raised soil bed, top 0.94 × 0.94 and 0.16 tall, slightly tapered, in soil `#6E5444`, with three furrows on top.
- Optional: low timber edging.

### 5. Animals (face +Z, feet on y = 0, `Head` node)
- `chicken`: ~0.45 tall. Cream, gold or ivory variants (one model with a recolour is fine). Small red comb, gold beak.
- `duck`: ~0.3 tall. **The waterline is y = 0.** White body, sage-green head.
- `sheep`: ~0.75 tall and 0.8 long. Lumpy cloud of ivory wool, dark face and legs.
- `cat_sleeping`: curled up asleep, ~0.25 tall and 0.5 long, ginger `#D99A62`. The `Head` node is the head; I lift it when clicked.
- `dog`: ~0.55 tall and 0.65 long. Warm brown `#B98A63` with a cream muzzle, plus `Head` and `Tail` nodes.
- Optional: animation clips named `Idle` and `Walk`. I move the animals around myself.

### 6. Buildings
- `windmill`: tapered whitewashed tower, base radius 0.75 and 2.7 tall, with a terracotta cap to about 3.6. It has a door and one `Glow` window. The `Blades` hub is on the +Z side at about y 2.85, with 4 sails of radius ~1.7.
- `greenhouse`: 2.05 × 1.48 with a timber base. `Glass` walls and gable roof (~1.7 tall) with cream frames, plants inside, and the door on +X.
- `well`: round stone well, radius 0.42, with two posts, a winch and a little terracotta roof, ~1.35 tall.
- `lighthouse`: tapered tower with ivory and terracotta bands, base radius 0.75, ~3.8 tall, lamp room around y 3.05 (`Glow`), a dark cap, and a `Beam` empty. The beam turns slowly and nothing on the horizon answers it (owner-approved lore answer 12, 2026-10-25).

### 7. Decor and props
- `beehive`: stacked boxes in cream and gold, 0.4 × 0.4 × 0.65, with a small roof.
- `bench`: 1.0 wide, seat at 0.32, backrest on −Z.
- `lantern`: post 0.9 tall with a hanging lamp on a +X arm at about 0.72 (`Glow`).
- `scarecrow`: ~1.45 tall with arms 0.85 wide, a dusty-blue shirt, a sack head and a straw hat.
- `flowerbed`: oval bed about 1.1 × 0.8 with ~11 flowers in terracotta, gold, blossom, cream and lavender `#B9A3C9`.
- `fence`: one segment 0.62 long along Z, with posts 0.46 tall at both ends and rails at 0.16 and 0.34.
- `stone_a`, `stone_b`, `stone_c`: flat stepping stones, radius ~0.15 and 0.05 thick.
- `rock_a`, `rock_b`, `rock_c`: chunky stones that fit a 1 × 0.7 × 1 box.
- `grass_tuft`: a few blades, ~0.2 tall, pivot at the base. Its top vertices sway in a shader, so keep it a single mesh.
- `haystack`: ~0.9 tall, radius 0.45.
- `shelter`: open sheep lean-to, 1.4 × 1.1 and ~1.35 tall, with a terracotta roof and a hay bale.
- `footbridge`: small arched plank bridge 1.5 long along Z and 0.62 wide, arch rising ~0.2, rope or timber rails at 0.46.
- `log`: 0.9 long with a visible end grain. `mushrooms`: a cluster of 3 in about 0.3.

### Not needed
The islands, cliffs, water, clouds, mountains, birds and fireflies stay procedural, because they're tied to gameplay positions and shaders.

## Phase 2: the idle loop

The idle-loop update (`docs/idle-loop.md`, section 6) adds **104 more model ids**. Everything above still applies: art direction, palette, technical spec, special names, file layout and the manifest. This section only adds ids, plus a few extra node and material names.

- **Every id already has a procedural stand-in**, drawn through `<Asset id="…">`. Any subset can ship on its own and in any order; nothing waits on anything else. Mark each one `ready` in the manifest as before.
- **Fish are not models.** They are 2D procedural SVG cards drawn by the game. Nothing to build.
- **Priority:** the four groups run in build order, and inside a group the order is a good order to work in. Counts: group 1 has 29 ids, group 2 has 30, group 3 has 20, group 4 has 25.
- **Finished states only.** Restoration models are the "after" look. Ruined "before" looks (unfinished or overgrown, never rotten or falling in: owner-approved lore answer 6, 2026-10-25), seasonal looks (snow, autumn, blossom; seasons only ever add: answer 9) and the Studio's variants of existing buildings (roof, sails, bench…) have no ids in this phase and stay procedural.
- **Sizes** are width (X) × depth (Z) × height, in the same units as above. Front is +Z, origin at the base centre on y = 0. For things on water, y = 0 is the waterline and piles or stilts may go below it. Unless an entry names variants, an id is one static model.
- **Budgets** use the classes above (buildings and structures ≤ 3,000, animals and visitors ≤ 1,500, props and plants ≤ 600, crops ≤ 400 per stage) and each entry gives its own ceiling. The farmhouse shipped at 580 triangles, so treat these as ceilings and aim well under. Files stay under 200 KB.
- **Kits:** where an entry says *kit*, the file holds several separate top-level nodes with the names given, each with its pivot at its own base on y = 0. I clone and scatter them.

### New names for Phase 2

The ones already defined above (`Glow`, `Glass`, `Smoke`, `Head`, `Tail`, `Canopy`, `Crown`) keep their meaning. `Glow` also covers flames, string-light bulbs, paper lanterns and glowing mushroom spots, and a `Smoke` empty can sit on any chimney, fire or steam source.

| Name | Kind | What it is |
|---|---|---|
| `Wheel` | node | Waterwheel and spinning wheel. Pivot at the axle; I spin it around local **Z**. |
| `Wings` | node | Both wings of a flier in one node, pivot on the body's centre line. I flap it by squashing X, so model the wings spread out flat to each side. |
| `Sway` | node | Hanging or loose parts (chimes, hammock, swing seat, light strings). Pivot at the point it hangs from; I swing it a few degrees on X and Z. |
| `Flame` | node | A flame mesh in the `Glow` material. Pivot at its base; I flicker its scale. |
| `Dome` | node | The observatory dome. Pivot at the centre of the drum top; I turn it slowly on Y. |
| `Roses` | node | The rose clusters on `trellis_arch`. I hide it until the second tier. |
| `Bell`, `Note` | node | Hidden-detail click targets (wetland bell, carved cairn stone). Just a named mesh. |
| `Water` | material | Flat water inside a model (hot spring). Base `#91B7C8`; I tint and ripple it. |
| `Tint` | material | The main painted surface of a craft. The Studio recolours it from 8 swatches, so keep everything else in other materials. |
| `Fruit` | material | Fruit on the repo trees. I recolour it per tree (apple, plum, cherry…). |

### Group 1: restorations and workshop buildings (29)

The first things a player meets: the stations that open at levels 3 to 6, the notice board, then the 20 restoration rewards island by island, and last the three late shop buildings.

#### Workshop and post (6)
- `workbench` (level 3): open-fronted carpenter's lean-to. A chunky timber bench with a vice, a saw hung on the back board, a stool and a few offcuts, under a small terracotta-shingle awning on two posts, with a small hanging lamp (`Glow`). 1.5 × 0.9 × 1.3. ≤ 800 tris.
- `barn` (level 3): where harvests and goods are kept. Gable-front timber barn in muted wood with cream trim and a terracotta roof, big double doors with an X brace on +Z, a hayloft hatch with a little hoist beam above, a hay bale by the door. Humbler than the farmhouse, ridge along Z. 2.0 × 2.6 × 2.3. ≤ 1,600 tris. The hayloft hatch window is `Glow`.
- `press` (level 5): oil press. A stone footing with a timber screw press (a thick vertical screw with a cross bar), a barrel and two crocks of gold oil, under a small terracotta lean-to roof on two posts. 1.2 × 1.0 × 1.35. ≤ 900 tris.
- `loom` (level 6): spinning-wheel stall. An open timber stall with a big spoked wheel at the front, a basket of ivory wool and yarn skeins on a rail, with a small terracotta roof. 1.2 × 1.0 × 1.3. ≤ 900 tris. The wheel is a `Wheel` node (optional; I turn it while a yarn job runs).
- `notice_board` (level 6): the restoration board. Two posts holding a timber board under a small pitched roof, cream notes pinned on it, a hook with a small hanging lantern (`Glow`). 1.1 × 0.3 × 1.4. ≤ 400 tris.
- `mailbox` (Hazel's, level 5): a timber post with a rounded terracotta letterbox, a tiny fixed gold flag and a cream letter peeking out. 0.25 × 0.35 × 0.9. ≤ 200 tris.

#### Restorations: main island (3)
- `garden_arch` (Garden Gate): stone arch over the garden gate. Two chunky stone pillars with dark-stone caps and a rounded arch, sage ivy creeping up one side. The walk-through runs along Z, 1.2 wide and 1.15 clear. 1.7 × 0.35 × 1.35. ≤ 400 tris.
- `porch_rack` (Kitchen Shelf): a side porch to stand against a farmhouse wall. A small timber deck with a herb-drying rack (a pole hung with sage and lavender bundles) and a little round table with a jam pot and a mug. The −Z side is flat and plain, because it sits against the wall. 1.3 × 0.8 × 1.2. ≤ 500 tris.
- `waterwheel` (Waterwheel): timber wheel with 8 paddles on stone footings, with a short wooden flume. The stream runs along X under it. 1.5 × 0.7 × 1.3. ≤ 700 tris. The wheel is a `Wheel` node (required), radius ~0.55, axle at y 0.62, and it spins around Z.

#### Restorations: meadow (3)
- `wildflowers` (Wildflower Meadow): *kit* of three flower patches, `Patch_a`, `Patch_b`, `Patch_c`, each about 1.0 across and ≤ 0.35 tall, in terracotta, gold, blossom, cream and lavender with sage leaves and a few grass blades. I scatter them across the meadow. ≤ 450 tris in total.
- `shepherds_hut` (Shepherd's Hut): a hut on wheels. Curved roof in meadow green, muted-wood plank body with cream trim, four chunky dark-wood wheels, a short stair and a tow hitch at the +Z end, and a stovepipe with a `Smoke` empty. One side window and a door window in `Glow`. 1.2 × 2.0 × 1.6. ≤ 1,100 tris.
- `stone_bridge` (Stone Bridge): replaces the rope bridge. A shallow arch with low stone parapets, dark-stone capstones and a keystone. Runs along Z, 2.6 long and 0.8 wide, arch rising ~0.35, ends flat on the ground. I stretch it along Z to fit the gap, so keep the arch generous. 0.8 × 2.6 × 0.7. ≤ 700 tris.

#### Restorations: grove (3)
- `mushroom_ring` (Mushroom Ring): a ring of ~9 mushrooms, radius ~0.7, 0.12 to 0.3 tall, with cream and terracotta caps. The spots and the gills under the caps are `Glow`, so the ring shines at night. 1.5 × 1.5 × 0.3. ≤ 500 tris.
- `woodcutter_hut` (Woodcutter's Hut): a small log cabin of stacked logs in dark and light wood, with a sod roof in sage, a log pile along one side, a chopping stump with an axe in it at the front and a chimney with a `Smoke` empty. One `Glow` window. 1.8 × 1.5 × 1.7. ≤ 1,300 tris.
- `treetop_walk` (Treetop Walk): a freestanding rope-walk so it works among any trees. Two tall timber-pole platforms at y ~1.2, a plank walkway with rope rails sagging between them, and a ladder up one end. 0.9 × 3.2 × 1.7. ≤ 900 tris.

#### Restorations: islet (4)
- `keeper_cottage` (Keeper's Cottage): a small whitewashed cottage with a terracotta roof and chimney (`Smoke`), a door, two `Glow` windows with flower boxes, a bench and a hanging lantern by the door. It sits beside the lighthouse and takes its ivory and terracotta colours. Nobody moves in (no keeper, no resident), and its windows light at dusk by the day cycle, like every building's (owner-approved lore answer 12, 2026-10-25). 1.7 × 1.3 × 1.9. ≤ 1,500 tris.
- `sky_harbour` (Sky Harbour): the quay where the sky-boat is moored. A plank landing on piles at the island's edge, two bollards with a rope coil, a fish crate and a lamp post (~1.0 tall) with a `Glow` lantern. Open edge towards +Z, piles down to y −0.5. 2.0 × 1.0 × 1.0. ≤ 700 tris.
- `sky_boat` (Sky Harbour): a little wooden boat for the sky. Round hull, a gold crescent prow, one mast with a furled cream sail striped terracotta, a stern lantern (`Glow`). Keel on y = 0; I bob it. It stays moored: it only bobs, the sail stays furled and is never raised, and nobody boards it or takes it out (owner-approved lore answer 12, 2026-10-25). 0.5 × 1.2 × 1.3. ≤ 500 tris.
- `signal_fire` (Signal Fire): a beacon on the islet's point. A stone drum with a log basket on top and a chunky faceted flame. The flame is a `Flame` node in `Glow`, with a `Smoke` empty above it. The fire burns steadily and nothing on the horizon answers it (owner-approved lore answer 12, 2026-10-25). 0.7 × 0.7 × 1.3. ≤ 400 tris.

#### Restorations: wetland (4)
- `jetty` (the Pond Jetty restoration, game id `pondJetty`; it builds the wetland jetty, drawn on the wetland lake, not on the farm pond): plank deck on four piles, one mooring post with a rope loop, a bucket and a stool at the far end. Runs along Z with the shore end at −Z; deck top at y 0.2, mooring post to 0.45, piles down to −0.3. 0.7 × 1.7 × 0.45. ≤ 500 tris. Before the wetland has docked, Fin sits by the farm pond, with no jetty there.
- `boardwalk_loop` (Boardwalk Loop): an eight-sided ring of plank walkway on posts, 0.5 wide, outer radius ~1.9, deck top at y 0.16, with rope rails on the outside at 0.4 and a small bench on a widened fishing spot at +Z. Posts down to y −0.3. 3.8 × 3.8 × 0.5. ≤ 900 tris.
- `reed_beds` (Reed Beds): *kit* of three dense beds, `Bed_a`, `Bed_b`, `Bed_c`, each ~1.0 across and 0.9 to 1.2 tall, with sage and meadow-green blades and brown cattail heads (dark wood). I scatter them in the shallows. ≤ 600 tris in total. The otter's holt is its own id (`otter_holt`).
- `heron_hide` (Heron Hide): a bird hide on stilts. A timber hut on four stilts, floor ~0.6 up, with long viewing slits in the walls (ink, not `Glow`), a slanted dark-wood roof with golden reed thatch, and a short ladder on +Z. Stilts down to y −0.3. 1.3 × 1.1 × 1.9. ≤ 900 tris.

#### Restorations: highland (3)
- `standing_stones` (Stone Circle): seven chunky tapered menhirs in a ring of radius ~1.3, 0.55 to 1.0 tall, in stone and dark stone with sage moss patches. 2.8 × 2.8 × 1.0. ≤ 500 tris.
- `bothy` (Crofter's Bothy): a small dry-stone hut with chunky courses, a sod roof in meadow green, a plank door, a stone chimney with a `Smoke` empty, a `Glow` window and a peat stack against the wall. 1.6 × 1.2 × 1.6. ≤ 1,100 tris.
- `cairn` (Summit Cairn): 9 to 11 rounded stacked stones tapering to a point, in stone and dark stone. On the +Z side one flat stone carries a few cut marks (the 'Gone for a walk' stone), modelled as a separate `Note` mesh (a tiny raised or inset plate, ~0.12 across); it is the hidden click target. The marks are two short rows of shallow cut marks, one row for each sentence, worn soft, so they read as someone's writing and never as a pattern or a symbol; they are never legible, and the words themselves are only in the journal line. A little moss sits around the stone, never over the marks (owner-approved lore answer 8, 2026-10-25). 0.8 × 0.8 × 1.3. ≤ 300 tris.

#### Late shop buildings (3)
- `gazebo` (level 13): an open six-sided gazebo. Six slim posts, a low rail between them, a bench ring inside, a terracotta roof with a small finial, a hanging lamp (`Glow`). Radius ~1.15. 2.3 × 2.3 × 2.2. ≤ 1,400 tris.
- `hot_spring` (level 15): a ring of chunky stones round a pale pool, with a wooden bucket and a little drying rack. The pool surface uses `Water`, and a `Smoke` empty sits at its centre at y 0.2 for steam. 2.0 × 1.7 × 0.5. ≤ 900 tris.
- `observatory` (level 16): a round ivory drum, radius ~0.85, with cream trim, a small door and one `Glow` window on +Z, topped by a dusty-blue dome with a vertical slit (`Glow`) and a gold telescope barrel poking out. Shorter than the lighthouse. 1.7 × 1.7 × 2.6. ≤ 1,600 tris. The dome is a `Dome` node (optional).

### Group 2: visitors and residents (30)

#### Visitors (22)
Wild visitors that turn up near whatever attracted them and wait to be noticed. Clicking one makes it hop or look up, so a `Head` node earns its keep. Rest pose: facing +Z, feet or underside on y = 0, `Head` pivot at the neck. Tiny creatures are drawn about 1.5× life size so they read at game zoom; the sizes below are model sizes. The ids are `visitor_` plus the visitor id from the spec exactly, so mind the case in `visitor_hedgehogWild`.

| id | Look and where it stands | Size | Tris | Nodes |
|---|---|---|---|---|
| `visitor_butterfly` | Main island, by flowerbeds. Red admiral resting with wings open: ink-brown wings with a terracotta band and cream spots. | 0.22 × 0.14 × 0.06 | ≤ 120 | `Wings` |
| `visitor_bumblebee` | Main, by hives. Round fuzzy bee, gold with ink bands, cream wings. | 0.16 × 0.12 × 0.12 | ≤ 200 | `Wings` |
| `visitor_robin` | Main, under fruit trees. Plump, warm brown back, terracotta breast, cream belly. | 0.2 × 0.22 × 0.22 | ≤ 300 | `Head` |
| `visitor_heron` | Main, at the pond. Grey heron on long legs, S-curved neck, dusty-blue back, ivory chest, ink head plume, gold beak. | 0.3 × 0.55 × 0.95 | ≤ 700 | `Head` (pivot at the neck base) |
| `visitor_toad` | Main, by the well. Squat and warty, olive-brown, cream belly, gold eyes. | 0.16 × 0.2 × 0.13 | ≤ 250 | `Head` |
| `visitor_owl` | Main, by the windmill. Barn owl, upright, ivory heart-shaped face, golden-buff back. | 0.28 × 0.25 × 0.42 | ≤ 500 | `Head` (turns on Y) |
| `visitor_fox` | Main, on the path. Red fox sitting, terracotta-ginger coat, cream chest and tail tip, ink socks, tail curled round. | 0.3 × 0.75 × 0.45 | ≤ 900 | `Head`, `Tail` (as the dog's) |
| `visitor_moth` | Main, by lanterns. Luna moth, pale sage wings with long tails and small terracotta eyespots, cream furry body. | 0.26 × 0.2 × 0.06 | ≤ 160 | `Wings` |
| `visitor_kingfisher` | Main, by the ducks. Dusty-blue back, terracotta chest, cream throat, long ink beak, on a short stake (included). | 0.12 × 0.2 × 0.3 | ≤ 300 | `Head` |
| `visitor_hedgehogWild` | Main, by planters. Small wild hedgehog (plain, no clothes): dark-wood spines tipped cream, pale face. | 0.2 × 0.28 × 0.16 | ≤ 400 | `Head` |
| `visitor_hare` | Meadow. Brown hare sitting up with ears tall: warm brown `#B98A63`, cream belly, ink ear tips. | 0.2 × 0.45 × 0.5 | ≤ 700 | `Head` (ears included) |
| `visitor_skylark` | Meadow, by sheep. Streaky muted-wood brown, cream belly, tiny crest. | 0.12 × 0.2 × 0.14 | ≤ 300 | `Head` |
| `visitor_squirrel` | Grove. Red squirrel sitting up holding a gold hazelnut, big upright tail: terracotta, cream belly, ear tufts. | 0.2 × 0.3 × 0.38 | ≤ 600 | `Head`, `Tail` |
| `visitor_deer` | Grove. Roe deer standing: tawny light-wood coat, cream rump, dark nose, small velvet antlers. | 0.3 × 0.95 × 0.9 | ≤ 1,100 | `Head` (grazing tilt) |
| `visitor_puffin` | Islet. Upright, ink back, ivory chest, chunky beak banded terracotta and gold, terracotta feet. | 0.14 × 0.16 × 0.22 | ≤ 350 | `Head` |
| `visitor_petrel` | Islet, by the lighthouse. Storm petrel, soot-brown (lightened ink) with a cream rump patch, folded wings. | 0.12 × 0.2 × 0.14 | ≤ 250 | `Head` |
| `visitor_frog` | Wetland. Tree frog in leaf green with a cream belly and big gold eyes. | 0.12 × 0.14 × 0.1 | ≤ 200 | `Head` |
| `visitor_dragonfly` | Wetland, by the boardwalk. Emperor dragonfly with a slim dusty-blue and sage body and four spread soft-sky wings, perched on a short reed stalk (included). Wing thickness, not paper. | 0.3 × 0.3 × 0.35 | ≤ 250 | `Wings` |
| `visitor_otter` | Wetland, by the reed beds. Otter sitting up holding a shell: warm brown, cream chin. | 0.25 × 0.45 × 0.4 | ≤ 800 | `Head`, `Tail` |
| `visitor_eagle` | Highland. Golden eagle upright on a low rock (included), wings folded: golden brown, pale nape, ink beak and talons. | 0.4 × 0.4 × 0.8 | ≤ 900 | `Head` |
| `visitor_ptarmigan` | Highland. Plump grouse in ivory with muted-wood flecks and a small terracotta eye comb. | 0.18 × 0.32 × 0.24 | ≤ 400 | `Head` |
| `visitor_marten` | Highland, by the bothy. Pine marten low and alert on all fours: chestnut with a cream bib, bushy tail. | 0.14 × 0.6 × 0.2 | ≤ 700 | `Head`, `Tail` |

#### Residents (5) and their homes (3)
Residents are storybook villagers: upright animals on two legs in simple clothes, chunky and friendly (a picture-book village, not a mascot). Feet on y = 0, facing +Z, `Head` node, and `Tail` where noted. They stand in front of their homes, so keep about 0.5 clear in front of every door.

- `resident_hazel`: Hazel, a hedgehog postie. Brown spines, cream face, a dusty-blue postie cap and a terracotta satchel with a cream letter showing. 0.35 × 0.3 × 0.5. ≤ 900 tris.
- `resident_bramble`: Bramble, a badger miller. Ink-and-ivory striped face, dark-stone grey coat, a floury cream apron and a little cap. 0.45 × 0.35 × 0.65. ≤ 1,000 tris.
- `resident_ardea`: Ardea, a heron lighthouse keeper. Tall (grey-blue, long legs, ink plume), a terracotta scarf and a keeper's cap, holding a small lantern (`Glow`). `Head` pivots at the neck base. 0.4 × 0.35 × 1.0. ≤ 1,100 tris.
- `resident_moss`: Moss, an otter ferry keeper. Warm brown with a cream chin, a sage waistcoat, a straw hat, a long punt pole held upright (kept to ~1.0 tall). Has `Tail`. 0.4 × 0.4 × 0.7. ≤ 1,000 tris.
- `resident_corrie`: Corrie, a stoat crofter. Warm brown back, cream front, ink-tipped tail, a forest-green jumper, flat cap and a small crook. Has `Tail`. 0.35 × 0.3 × 0.6. ≤ 1,000 tris.
- `hedge_cottage` (Hazel): a tiny cottage grown into a rounded hedge mound in meadow and forest green, with a round terracotta door, a round `Glow` window, a little chimney (`Smoke`) and a flower box. 1.2 × 0.9 × 0.9. ≤ 700 tris.
- `burrow_door` (Bramble): a grassy bank at the foot of the windmill with a round muted-wood door, a stone step, a flour sack and a small hanging lamp (`Glow`). 0.9 × 0.45 × 0.7. ≤ 500 tris.
- `otter_holt` (Moss): a low mound of reeds, branches and mud at the water's edge with an arched dark entrance, and a small flat punt tied alongside. Ground at y = 0. 1.6 × 1.2 × 0.7. ≤ 600 tris.

### Group 3: biomes, crops and the cottage (20)

#### Biomes (5)
- `isle_props_wetland`: *kit* of scatter pieces, ≤ 600 tris in total. Nodes: `Reeds_a`, `Reeds_b` (tufts ~0.55 tall), `Cattails` (5 stems, ~0.7 tall, dark-wood heads), `Lily_a`, `Lily_b` (clusters of 2 to 4 flat pads of radius 0.18 to 0.3 on the waterline, one with a cream flower) and `Bell`: a click target at the ripple, kept fully hidden under the water. No bell is ever drawn or visible (lore BIBLE §9: what rang it stays open). The mesh stays as specified (~0.2 tall, drawn at y = 0) but is hit-test only, an invisible click target at the ripples, and nothing is drawn under the water at any zoom, light or water level. Until the bell is noticed, slow ripple rings spread there on a windless day (the water spec's one ripple-ring effect, ART-PLAN A21; frozen rings in still mode); once it is noticed, that water is as still as the rest of the lake. Both readings stand: a spring or a fish below, or something far down that rang (owner-approved lore answer 7, 2026-10-25).
- `isle_props_highland`: *kit*, ≤ 600 tris in total. Nodes: `Heather_a`, `Heather_b` (low hummocks ~0.3 tall in dark sage with lavender `#B9A3C9` flower tips) and `Boulder_a`, `Boulder_b`, `Boulder_c` (chunky weathered stones in dark stone with sage lichen, each fitting a 1 × 0.7 × 1 box like `rock_a` to `rock_c`).
- `goat` (highland animal, gives milk): ~0.65 tall and 0.8 long, face +Z, feet on y = 0. Ivory body with a muted-wood patch, curved dark-stone horns, a small beard, a stubby tail. One model with a recolour is fine (up to 4 are kept). `Head` and `Tail` nodes. ≤ 800 tris.
- `boardwalk` (wetland decor): one straight plank segment on two pairs of posts, 0.55 wide and 1.2 long along Z, deck top at y 0.16, low rope posts at the corners. Ends are flat and square so up to 3 chain end to end. 0.55 × 1.2 × 0.5. ≤ 250 tris.
- `lily_lantern` (wetland decor): a paper lantern floating on a lily pad. Pad radius ~0.2, lantern ~0.28 tall with a cream `Glow` shell, ink ribs and a terracotta cap. Waterline y = 0. 0.4 × 0.4 × 0.35. ≤ 250 tris.

#### Crops: 3 new crops × 3 stages (9)
Same rules as section 3 above (crops): each file shows the whole contents of one garden plot, a 0.94 × 0.94 square, y = 0 at the soil surface. Names are `crop_<id>_1` (sprout), `crop_<id>_2` (growing), `crop_<id>_3` (ready). Each stage ≤ 400 tris.

| id | Arrangement | Ready height | Look at each stage |
|---|---|---|---|
| wheat | 2×2 clumps of 6–8 stalks | 0.5 | 1: short sage shoots (0.1). 2: taller green stalks with green ears (0.3). 3: golden `#E8BD72` ears bowing a little. Stage 3's stalks go under a `Sway` node, pivot at the soil (optional). |
| cranberry | 2 low creeping mats | 0.18 | 1: a few runners with small leaves. 2: dense dark-green mat, white-cream buds. 3: ~20 berries in deep berry red `#A94A52` clustered on the mat. |
| lavender | 2 bushes | 0.45 | 1: tiny sprouts. 2: grey-green mounds with upright stems and buds. 3: 12–16 stems topped with lavender `#B9A3C9` spikes. |

#### Retirement cottage: 6 stages (6)
The player's cottage grows on its own small isle as lifetime XP rises. All six use the **same footprint** (2.0 × 1.6) and the same coordinates for posts, door (centre of +Z) and chimney, and each stage is the previous one plus more work, so the swap reads as growth. Build them from one script with a stage parameter. Cosy, smaller and rounder than the farmhouse (ridge along X); a golden thatch-style roof in sunlight gold keeps it apart from the farmhouse's terracotta.

| id | Stage | What stands there | Tris | Nodes |
|---|---|---|---|---|
| `cottage_1` | Pegged out | Four timber corner pegs joined by cream string, a few stakes with little cloth flags, a mound of soil. Under 0.35 tall. | ≤ 150 | – |
| `cottage_2` | Foundations | Low stone footing walls (0.25 tall) round the plan with a door gap on +Z, a packed floor, a stack of planks and a wheelbarrow. | ≤ 400 | – |
| `cottage_3` | Timber frame | Full-height posts and beams, a bare ridge and rafters, a ladder, timber stacked beside. Open to the sky. | ≤ 900 | – |
| `cottage_4` | Roof on | The frame now carries the roof; walls only half planked at the bottom, openings empty, chimney stack half built. | ≤ 1,500 | – |
| `cottage_5` | Windows and door | Walls finished in cream over a stone base, glazed windows, door hung, chimney up but cold, a ladder and paint bucket left against the wall, bare ground. | ≤ 2,100 | `Glow` windows |
| `cottage_6` | Home | Stage 5 plus window boxes, a bench and rocking chair by the door, pots of flowers, a stone path and a tiny picket fence with a gate. Maximum height ~1.9. | ≤ 2,700 | `Glow` windows, `Smoke` on the chimney |

### Group 4: milestone looks, crafts and git orchard (25)

#### Milestone looks (9)
Each appears when a count passes a threshold, so each is a complete model that stands alone (`coop_run` replaces `coop_small`; it does not add to it). They sit beside the things they celebrate.
- `coop_small` (chickens ≥ 3): an A-frame henhouse with a pop-hole and ramp, a side nesting box, terracotta roof, muted-wood body with cream trim. 0.8 × 0.7 × 0.75. ≤ 500 tris.
- `coop_run` (chickens ≥ 6): a bigger coop (1.0 × 0.8 × 0.9) with an attached fenced run (low fence 0.4 tall), a perch and a feed trough. 2.4 × 1.1 × 0.95. ≤ 800 tris.
- `trellis_arch` (flowerbeds ≥ 4): a timber lattice arch on the path, 1.0 wide to walk through, with a few sage climbing leaves. The roses (flowerbeds ≥ 8) are separate blossom and cream clusters on the lattice, grouped under a `Roses` node so I can hide them until then. 1.2 × 0.4 × 1.6. ≤ 450 tris.
- `orchard_ladder` (fruit trees ≥ 3): a tall three-legged orchard ladder in light wood with two crates of terracotta and gold fruit and a basket. 0.9 × 0.9 × 1.5. ≤ 450 tris.
- `picnic_blanket` (fruit trees ≥ 6): a cream and sage checked blanket (thick, 0.03, not a plane) with a basket, two cups and a few fruit, plus a freestanding swing: an A-frame of two angled posts with a crossbar and a plank seat on two ropes. The seat and ropes are a `Sway` node, pivot at the crossbar. 2.2 × 1.0 × 1.4. ≤ 600 tris.
- `string_lights` (lanterns ≥ 4): a drooping cord with ~7 chunky bulbs (`Glow`), one swag. 2.0 long along X, ends at y 0.8, drooping ~0.12 in the middle; origin at the midpoint on y = 0. I stretch it along X to span each pair of lanterns. 2.0 × 0.1 × 0.8. ≤ 200 tris. The whole string is a `Sway` node (optional).
- `apiary_sign` (beehives 3): a small timber sign on a post, with a gold bee and hexagon painted on a cream board, and two honey jars hung from hooks. Face +Z. 0.5 × 0.1 × 0.8. ≤ 250 tris.
- `duck_house` (ducks ≥ 3): a little floating duck house on the pond: a cream house with a terracotta roof and a round door on a small plank float, with a ramp. Waterline y = 0. 0.7 × 0.6 × 0.55. ≤ 450 tris.
- `sheep_shelter` (sheep ≥ 4): the same object as `shelter` in section 7 (open lean-to, 1.4 × 1.1 × 1.35, terracotta roof, hay bale). If you build `shelter`, ship the identical file under this id too and add a manifest entry for each. ≤ 600 tris.

#### Crafts (10)
Made at the workbench and placeable in the Studio, where the player recolours them. Put the main painted surface in a material named **`Tint`** and keep everything else in other materials. Front +Z. All are props, with budgets as given.
- `birdhouse`: a house on a post: a square box with a pitched roof, a round hole and a perch peg. `Tint` on the house body. 0.3 × 0.3 × 0.85. ≤ 250 tris.
- `planter`: a wooden planter box on short feet, full of soil, sage leaves and small blossoms. `Tint` on the box. 0.6 × 0.3 × 0.3. ≤ 300 tris.
- `signpost`: a post with two arrow boards pointing opposite ways. No lettering. `Tint` on the boards. 0.7 × 0.15 × 0.9. ≤ 250 tris.
- `wind_chime`: a post with a curved arm and a chime hanging from it: a wooden disc with 5 tubes in gold and dusty blue. The disc and tubes are a `Sway` node, pivot at the hanging point. `Tint` on the tubes. 0.5 × 0.3 × 1.2. ≤ 300 tris.
- `picnic_table`: a table with a bench on each long side. Tabletop at 0.5. `Tint` on the tabletop boards. 1.3 × 0.9 × 0.6. ≤ 350 tris.
- `hammock`: two posts with a sagging cloth hammock striped cream and dusty blue. The cloth is a `Sway` node, pivot at the centre of the line between posts. `Tint` on the cloth. 1.6 × 0.5 × 0.9. ≤ 450 tris.
- `arbour`: a rose arbour with a little bench inside: a timber lattice arch with climbing roses (blossom `#E7B8A8` and cream) and sage leaves. `Tint` on the woodwork. 1.2 × 0.8 × 1.9. ≤ 600 tris.
- `rowboat`: a small wooden rowboat with two thwarts, a pair of oars resting across and a coil of rope. Keel on y = 0 (so it sits on land too; I lower it on water). It stays on the island's own water, never the cloud sea (owner-approved lore answer 12, 2026-10-25). `Tint` on the hull stripe. 0.55 × 1.3 × 0.3. ≤ 400 tris.
- `dovecote`: a two-tier dovecote on a post: a box with six pigeonholes and perches under a small terracotta roof with a finial. `Tint` on the box. 0.55 × 0.55 × 1.5. ≤ 500 tris.
- `treehouse`: the largest craft and counted as a building. It brings its own chunky oak: a trunk ~0.35 wide, a `Canopy` node (sway, pivot near the trunk top), a platform at y ~1.1, a small cabin 0.9 × 0.9 × 0.7 with a pitched roof and a `Glow` window, and a rope ladder on +Z. `Tint` on the cabin. 2.0 × 2.0 × 2.6. ≤ 1,400 tris.

#### Git orchard (6)
- `repo_tree_1` to `repo_tree_5`: one tree per watched repository, growing in five stages by lifetime counted commits (1, 10, 50, 150, 400). Same trunk position and lean at every stage so the swap reads as growth. Foliage in sage and meadow green under a `Canopy` node (sway, pivot near the trunk top). Fruit is in the `Fruit` material (I recolour it per tree). No lettering. Each ≤ 600 tris.

| id | Commits | Look | Size |
|---|---|---|---|
| `repo_tree_1` | 1 | A sapling: a thin trunk with 4–5 leaves and a tie stake. ≤ 100 tris. | 0.2 × 0.2 × 0.35 |
| `repo_tree_2` | 10 | A young tree: a slim trunk and a small round canopy. ≤ 200 tris. | 0.4 × 0.4 × 0.8 |
| `repo_tree_3` | 50 | A thicker trunk, a rounder canopy, no fruit. ≤ 350 tris. | 0.8 × 0.8 × 1.3 |
| `repo_tree_4` | 150 | A fuller canopy with ~6 fruits. ≤ 450 tris. | 1.1 × 1.1 × 1.7 |
| `repo_tree_5` | 400 | The full tree, like `tree_fruit`: wide canopy, ~12 fruits, a little leaning basket at the foot. ≤ 600 tris. | 1.4 × 1.4 × 2.0 |

- `sky_lantern` (lantern night): a rising paper lantern. A tapered rounded shell 0.2 wide and 0.28 tall, the shell in `Glow` so it shines at night, with a terracotta cap band and ink ribs, open at the bottom. Solid shell, not a paper-thin plane. I float it upward. 0.2 × 0.2 × 0.28. ≤ 150 tris.

### Barnaby's ruin (built after the list; painted procedural, not one of the 104 ids)

- `tower_ruin` (highland; built from `art/scripts/assets/tower_ruin.mjs`): the built model *is* the tower, the broken base of one ordinary dry-stone round tower, with no symbols and no clue to an owner (about 2.08 across and 1.32 tall; ASSET-CATALOG §2). Once he moves in, only Barnaby's own things change it: a bedroll, a kettle on three stones, books and a candle stub (the camp props, so the lean-to camp goes with him and nothing is left behind) and a warm light in the empty window after dusk (`Glow`). A few sound steps climb into the thickness of the back wall, as old round towers' stairs do, and stop out of sight, so where they end is never shown. One ordinary oak stands in the plateau's woodland near the ruin: the same tree as anywhere else (`tree_round_a`), never framed, lit or tappable (owner-approved lore answer 2, 2026-10-25; ART-PLAN A20).
