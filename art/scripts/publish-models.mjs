// publish-models.mjs -- puts the finished V21 models into public/models under the game's asset ids.
// =============================================================================
// The game's <Asset id> loader (src/world/Asset.tsx) swaps a model in as soon as its manifest entry is "ready".
// This script writes ONLY the ids in MODELS below and merges ONLY their manifest entries; every other entry
// (baked pieces, plants, anything the game adds) is left alone. Deterministic: the same inputs give the same bytes.
//   node publish-models.mjs [--out <modelsDir>]      (default: <repo>/public/models)
// Sources: finished Meshy models from art/meshy/<src>/<src>.glb (made by scripts/meshy/finish.mjs, see
// art/meshy/README.md) and procedural models rebuilt from scripts/assets/ (sheep, plot; the painted woodshed, wetland_jetty,
// barnaby, tower_ruin, barnaby_camp and shelter carry the painted atlas of lib/paintedAtlas.mjs). NOT build.mjs, which also rewrites
// the proof and every procedural model.
// Textured models (meshy: true) carry one painted albedo texture. Apple GPUs corrupt GPU-generated mipmaps of sRGB
// textures, so the game must store these maps linear and decode them in the shader (see art/BLUEPRINT.md).
// =============================================================================
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import { buildAsset, inspectGlb } from './lib/builder.mjs';
import { buildPlant } from './lib/plantkit.mjs';
import sheep from './assets/sheep.mjs';
import plot from './assets/plot.mjs';
import woodshed from './assets/woodshed.mjs';
import wetland_jetty from './assets/wetland_jetty.mjs';
import barnaby from './assets/barnaby.mjs';
import tower_ruin from './assets/tower_ruin.mjs';
import barnaby_camp from './assets/barnaby_camp.mjs';
import shelter from './assets/shelter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(__dirname, '../..');
export const meshySource = (src) => path.join(projectRoot, 'art', 'meshy', src, `${src}.glb`);

// id = the game's asset id. `nodes` = named nodes the game's code looks up (it animates them).
export const MODELS = [
  { id: 'farmhouse', meshy: 'farmhouse', nodes: ['Smoke', 'PorchLight', 'PorchLamp'], notes: 'Meshy remake (proof V20; polished: porch lamp; since the roof review the roof slopes carry their own tiling 512 px tile texture, material Roof, and the atlas is 1024 px q85). Nodes Smoke (chimney top), PorchLight (porch lamp spot) and PorchLamp (a hanging lantern there). Two materials are named Glow: the TEXTURED one = the painted walls + an emissive window mask (drive its emissive intensity, do not replace it); the UNTEXTURED one = the lamp glass (swap it for the glow material).' },
  { id: 'windmill', meshy: 'windmill', nodes: ['Blades'], notes: 'Meshy (V21; 1024 px q85 texture since the texture review). Blades spins on local Z (procedural sails, vertex colours). Material Glow = textured window band + emissive mask: drive its emissive intensity, do not replace it.' },
  { id: 'well', meshy: 'well', nodes: [], notes: 'Meshy (V21). No Tint material yet (the studio tint feature cannot repaint it).' },
  { id: 'bench', meshy: 'bench', nodes: [], notes: 'Meshy (V21). No Tint material yet.' },
  { id: 'haystack', meshy: 'haystack', nodes: [], notes: 'Meshy (V21; polished to 0.9 wide x 0.84 tall, the brief radius 0.45). Meadow haystacks (the game draws Haystack procedurally today).' },
  { id: 'cart', meshy: 'cart', nodes: [], notes: 'Meshy (V21). Meadow prop; no game slot yet.' },
  { id: 'hero_tree', meshy: 'hero_tree', nodes: ['Canopy'], notes: 'Meshy (V21; polished to 3.4 u tall; 1024 px q85 texture since the texture review). The big round tree at STATIC_TREES[0] in the proof; Canopy = the crown, pivoted near the trunk top. HOME_FENCE[0] runs through its trunk at that spot (art/meshy/README.md).' },
  { id: 'rock_a', meshy: 'boulder_a', nodes: [], notes: 'Meshy boulder_a (V21 rocks).' },
  { id: 'rock_b', meshy: 'boulder_b', nodes: [], notes: 'Meshy boulder_b (V21 rocks).' },
  { id: 'rock_c', meshy: 'boulder_c', nodes: [], notes: 'Meshy boulder_c, a flat slab (V21 rocks).' },
  { id: 'outcrop_a', meshy: 'outcrop_a', nodes: [], notes: 'Meshy (V21). Sandstone outcrop, 2.8 u tall; highland riser and islet coast in the proof.' },
  { id: 'outcrop_b', meshy: 'outcrop_b', nodes: [], notes: 'Meshy (V21). Mossy outcrop, 1.9 u tall; highland riser in the proof.' },
  { id: 'sheep', build: sheep, nodes: ['Head'], notes: 'Procedural (flat palette materials), ~0.74 tall x 0.81 long (the brief size). Head = the grazing pivot at the neck.' },
  { id: 'plot', build: plot, nodes: [], notes: 'Painted procedural (scripts/assets/plot.mjs + the painted atlas, lib/paintedAtlas.mjs: one textured material, baked shade in COLOR_0; ART-PLAN P0-1). A tilled soil bed of three furrow rows along X (the atlas soil cell: soil.bed #6E5444, shade #5B4538, dry #8A6B55), crests ~0.174 and troughs ~0.146 around the crops\' y 0.16, inside weathered grey board edging. 1.02 x 1.02 outside, the soil top 0.94 x 0.94, 0.185 tall, origin at the base centre on y 0. Same footprint as the old flat plot: Garden.tsx needs no change.' },
  // batch 2 (the stand-ins the game still drew): concept = image-to-image from the approved farmhouse + well concepts as style
  // references, then smart-topology; recipes in art/meshy/<id>/finish_args.txt, review in art/meshy/README.md "Batch 2"
  { id: 'chicken', meshy: 'chicken', nodes: ['Head'], notes: 'Meshy (batch 2). 0.45 tall (brief), faces +Z. Head = cut off by a plane from the nape to the throat, pivot at the nape (0, 0.31, 0.04): a forward peck dips it into the chest. Flat caps on both sides of the cut. Cream coat (the game tints instances).' },
  { id: 'duck', meshy: 'duck', nodes: [], notes: 'Meshy (batch 2). 0.30 tall, faces +Z. y 0 = the waterline: the hull dips to y -0.05 (the game puts the origin ~0.02 above the water, so ~0.03 of hull sits under it).' },
  { id: 'dog', meshy: 'dog', nodes: ['Head', 'Tail'], notes: 'Meshy (batch 2). 0.55 tall x 0.72 long, faces +Z (head turned a little to +X, as in its concept). Head cut by a nape-to-throat plane, pivot at the nape (0, 0.45, 0.14); Tail cut across its base, pivot (0, 0.33, -0.2), wags on Y. 1,918 tris with the clean cuts: 28 % over the 1,500 animal budget.' },
  { id: 'cat_sleeping', meshy: 'cat_sleeping', nodes: ['Head'], notes: 'Meshy (batch 2). Curled ginger tabby, 0.23 tall x 0.52 x 0.45. Its sleeping face looks along +X (the game yaws the cat -0.4 so +X points at the farmhouse door and the camera sees the face). Head = the whole head (both ears, the full face), cut under the chin and behind the head; pivot at the back-top of the head (0, 0.16, 0.13), so a chin-up tilt (rotation.z ~0.3) hides the cut far better than a +y lift, which shows the flat cut surfaces.' },
  { id: 'goat', meshy: 'goat', nodes: ['Head'], notes: 'Meshy (batch 2). 0.68 tall x 0.75 long, faces +Z. Ivory with warm-brown patches. Head (with both horns and the beard) cut by a nape-to-throat plane, pivot at the nape (0, 0.5, 0.08): grazing dips it into the chest.' },
  { id: 'lighthouse', meshy: 'lighthouse', nodes: ['Beam'], notes: 'Meshy (batch 2). 3.75 tall, door on +Z, plinth r ~0.83. Material Glow = textured lamp-room glass + emissive mask (drive its intensity, do not replace it). Beam = an empty at the scene root in the lamp room centre (0, 2.67, 0.06), lower than the stand-in lamp (y 3.05).' },
  { id: 'greenhouse', meshy: 'greenhouse', nodes: [], notes: 'Meshy (batch 2, greenhouse v2): frosted glass on a stone base with a terracotta ridge, a climbing vine and pots by the door. 2.05 (ridge along X) x 1.50 tall x 1.21 deep, door on +X. The frosted panes are painted and opaque (plant silhouettes on them): no Glass material, so the game draws them solid.' },
  { id: 'beehive', meshy: 'beehive', nodes: [], notes: 'Meshy (batch 2). 0.42 x 0.73 x 0.42 with its tiled roof, entrance and landing board on +Z. No bees modelled (the game flies its own).' },
  { id: 'lantern', meshy: 'lantern', nodes: [], notes: 'Meshy (batch 2). Post on the origin, 0.9 tall, the lantern hangs from an arm on +X (glass x 0.17-0.28, y 0.49-0.65). Material Glow = textured glass + emissive mask (drive its intensity, do not replace it). The moth perch (0.18, 0.885) is on the arm.' },
  { id: 'scarecrow', meshy: 'scarecrow', nodes: [], notes: 'Meshy (batch 2). 1.45 tall, faces +Z; the concept arms are 1.25 across (brief 0.85), above the crops.' },
  // the brown hare (art/specs/2026-10-25-shelter-hare-design.md section 3): concept B (image-to-image from the oak + cottage style
  // references), image-to-3d smart-topology, finished by scripts/meshy/finish.mjs (art/meshy/visitor_hare/finish_args.txt). UNRIGGED:
  // the animal-rigs toolkit re-skins this file as hare_rig later
  { id: 'visitor_hare', meshy: 'visitor_hare', nodes: [], notes: 'Meshy (the owner\'s concept B: sitting up, one ear turned out as if listening). The meadow\'s brown hare, 0.21 wide (the turned ear) x 0.45 tall x 0.27 long, base on y 0, facing +Z; warm golden-brown coat, cream chest, ink ear tips. ONE mesh, one 512 px albedo, no bones or named nodes yet (no Head: the rig task on art/animal-rigs re-skins it as hare_rig with Head, ears, lids and Idle / Look / EarTwitch / Groom / Hop / Alert clips). The game\'s <Asset id="visitor_hare"> draws it unscaled (the Visitors.tsx `scale` applies to the stand-in only).' },
  // the living-ground part of the art-cohesion pass (art/specs/2026-10-22-flowers-living-ground-design.md): painterly kit models
  // (lib/plantkit.mjs, cut-out cards with painted PNG textures, alphaMode MASK). A crop file is the whole contents of one 0.94 x 0.94
  // plot with y 0 at the soil (art/ASSETS.md section 3); the game's CropPlants already asks for crop_<id>_<stage>
  // since 2026-10-25 (the owner's "match them") the garden crops' treatment: a seedling cluster, then three plants filling the plot, two in
  // front and one behind, side by side for the default camera
  ...[['sunflower', 'three sunflowers (stage 1: a seedling cluster)', ['a cluster of seven seedlings across the plot, ~0.22 tall', 'three leafy stems with green buds, ~0.64 tall', 'three gold heads, each its own card facing the default camera (azimuth 45 deg, tilted up toward it, a green back behind it), up to 1.17 tall, a 0.84 footprint']],
    ['lavender', 'three lavender bushes (stage 1: a tuft cluster)', ['a cluster of seven grey-green tufts across the plot, ~0.21 tall', 'three bushy mounds with pale buds, ~0.30 tall', 'three full bushes of purple spikes, ~0.52 tall, a 0.86 footprint']]]
    .flatMap(([crop, what, stages]) => stages.map((s, i) => ({ id: `crop_${crop}_${i + 1}`, kit: true, nodes: [],
      notes: `Painterly kit (lib/plantkit.mjs): ${what}, stage ${i + 1} (${['sprout', 'growing', 'ready'][i]}): ${s}. The whole plot's contents (0.94 x 0.94), y 0 = the soil; cut-out cards (MASK alpha).` }))),
  // the garden crops (owner 2026-10-25, "crops, mature on Meshy"): the ready stage is a Meshy model (image-to-image concept from the
  // oak + cottage style references, smart-topology, 4k source finished to 512 px; recipes in art/meshy/<id>/finish_args.txt), the
  // sprout and growing stages are kit cards in that model's own greens. The owner's "bigger, fit the plot" (2026-10-25): the ready
  // plant fills the 0.94 soil (footprint up to 0.92, up to 1.2 u tall), the sprouts are a cluster across the plot, the growing stage
  // one plant about half the ready size
  ...[['radish', 'a ready radish: a rosette of spoon leaves over a round red root, the root\'s lower part sunk into the soil (min y -0.12)', 0.82, 0.92],
    ['carrot', 'a ready carrot: a fan of feathery fronds over a fat orange shoulder (the fronds a shallow V facing the default camera; the root\'s tip sunk into the soil, min y -0.13)', 0.87, 0.84],
    ['wheat', 'a ripe clump of wheat: golden ears on straw stalks (a shallow V facing the default camera)', 1.20, 0.88],
    ['lettuce', 'a loose-leaf lettuce: an open rosette of frilled leaves', 0.43, 0.92],
    ['tomato', 'a staked tomato plant with ripe tomatoes all round', 1.20, 0.76],
    ['pumpkin', 'a ripe pumpkin among low lobed leaves and a curly vine', 0.34, 0.92],
    ['blueberry', 'a rounded blueberry bush with dusty blue berries', 0.67, 0.76],
    ['cranberry', 'a low mounded cranberry mat with red berries (its Meshy leaves were painted brown: hue-shifted to green in the finish, the berries kept)', 0.37, 0.92]]
    .flatMap(([crop, ready, h, w]) => [
      { id: `crop_${crop}_1`, kit: true, nodes: [], notes: `Painterly kit (lib/plantkit.mjs): the ${crop} sprouts, a cluster of seven seedlings across the plot (stage 1). y 0 = the soil; cut-out cards (MASK alpha).` },
      { id: `crop_${crop}_2`, kit: true, nodes: [], notes: `Painterly kit (lib/plantkit.mjs): the growing ${crop}, one young plant in the middle of the plot about half the ready size (stage 2), in the ready model's greens. y 0 = the soil; cut-out cards (MASK alpha).` },
      { id: `crop_${crop}_3`, meshy: `crop_${crop}_3`, nodes: [], notes: `Meshy (the garden batch): ${ready}; ${h.toFixed(2)} u above the soil, a ${w.toFixed(2)} u footprint filling the 0.94 soil, front +Z (turned so its best side faces the default camera). One painted atlas, 512 px JPEG. Stage 3 (ready).` }]),
  // the idle-economy batch (.superpowers/sdd/2026-10-23-idle-economy-art/design.md sections 3-4): PAINTED procedural models, built in
  // code and UV-mapped onto one small painted atlas generated in code (lib/paintedAtlas.mjs), so they sit beside the textured farmhouse
  { id: 'woodshed', build: woodshed, nodes: [], notes: 'Painted procedural (scripts/assets/woodshed.mjs + the painted atlas, lib/paintedAtlas.mjs: one textured material, one 512 px sRGB JPEG albedo, baked shade in COLOR_0). Lean-to, origin at the base centre on y 0, open front +Z: posts 1.0 x 0.6, the terracotta roof (tile courses, darker trim) ~0.84 over the back posts and ~0.65 over the front, overhanging to 1.16 x 0.76 (1.16 x 0.79 overall: the axe head pokes 2 cm past the front edge of the roof), 0.89 tall; stone footing, back wall of boards, 22 logs (rows 6/5/6/5) with painted ring ends on +Z, an axe on the front-left post. For <Asset id="woodshed" fallback={<WoodshedShell/>}>.' },
  { id: 'wetland_jetty', build: wetland_jetty, nodes: [], notes: 'Painted procedural (scripts/assets/wetland_jetty.mjs + the painted atlas, one textured material). y 0 = the waterline (set it on the lake level). Runs along Z centred on the origin, 0.7 x 1.7: the SHORE end at -Z (z -0.85, a sill log under it at y 0.11-0.16 for the bank), the far end at +Z. Deck top y 0.2 on four piles down to y -0.3 (wet below the waterline); mooring post to 0.45 with a rope loop at (0.3, 0.74), a bucket and a stool on the far end.' },
  // the Barnaby trio (.superpowers/sdd/2026-10-23-idle-economy-art/t6-brief.md, barnaby-request.md): painted procedural, the same atlas
  { id: 'barnaby', build: barnaby, nodes: [], notes: 'Painted procedural (scripts/assets/barnaby.mjs + the painted atlas, one textured material). Barnaby Wick, the wizard: ONE rigid mesh on the single root node "barnaby" (rotate that node to rock him). Origin at his feet on y 0, facing +Z, 1.06 tall, every vertex within 0.26 u of the y axis (his robe hem is the widest part, 0.256). A tall pointed hat (its tip flops to his left, +X) with a brass band, a slate-teal robe, a rust scarf, hands clasped in front, a brass lantern at his left hip, a satchel of papers at his right hip. For <Asset id="barnaby" fallback={<BarnabyShell/>}>.' },
  { id: 'tower_ruin', build: tower_ruin, nodes: [], notes: 'Painted procedural (scripts/assets/tower_ruin.mjs + the painted atlas, one textured material). The broken base of a round dry-stone tower, centred on the origin (the ring centre), base on y 0, ~2.0 across, 1.28 tall at the back (-Z), knee height at the sides, open front +Z. Back wall inner face 0.73 from the centre; Barnaby stands at model (0, -0.40). The game turns it so +Z points along piece-local (0.41, 0.91): rotation.y = atan2(0.41, 0.91) = 0.423 rad.' },
  { id: 'barnaby_camp', build: barnaby_camp, nodes: [], notes: 'Painted procedural (scripts/assets/barnaby_camp.mjs + the painted atlas, one textured material). Lean-to over a bedroll, origin at the footprint centre on y 0, open front +Z (rotation.y pi/4 to face the default camera, like the woodshed); 1.0 x 0.7, 0.70 tall. Forked poles and a ridge pole, a patched canvas tarp sloping to the back, guy lines and pegs; a bedroll with a check blanket and a rolled pillow; books with a candle stub and a kettle on three stones out front.' },
  // the meadow shelter (art/specs/2026-10-25-shelter-hare-design.md section 2): painted procedural, the same atlas; ONE file published
  // under both ids (ASSETS.md sheep_shelter: "ship the identical file under this id too"), so both rows build scripts/assets/shelter.mjs
  { id: 'shelter', build: shelter, nodes: [], notes: 'Painted procedural (scripts/assets/shelter.mjs + the painted atlas, lib/paintedAtlas.mjs: one textured material, one 512 px sRGB JPEG albedo, baked shade in COLOR_0). The meadow\'s open sheep lean-to; the SAME FILE as sheep_shelter.glb (identical bytes, root node "shelter"). Origin at the base centre on y 0, open front +Z: keep the game\'s rotation 0.7 at MEADOW.shelter and the open side and the hay face the default camera. 1.40 x 1.10, 1.35 tall: a terracotta tile roof high at the open front (~1.35) and low at the back (eave ~0.74), plank sheathing on three rafters under it, a stone footing under the back and the sides, a plank back wall, low plank side walls (~0.56), two front posts at x +-0.58, z 0.40 (the opening between them is 1.08 wide); inside, a hay bale tied with twine against the back wall and a little loose hay. For <Asset id="shelter" fallback={today\'s Shelter mesh}>.' },
  { id: 'sheep_shelter', build: shelter, nodes: [], notes: 'The identical file to shelter.glb (the same bytes: built from scripts/assets/shelter.mjs, root node "shelter"; ASSETS.md sheep_shelter: "ship the identical file under this id too"). See the shelter entry for the model.' },
  { id: 'flowerbed', kit: true, nodes: [], notes: 'Painterly kit (lib/plantkit.mjs): the raised wildflower bed (~1.1 x 0.8, 0.44 tall, inside the 0.6 u disc the layout keeps clear): a stone-edged soil mound (vertex colours) planted with the kit\'s daisies, buttercups, poppies, cornflowers, lavender and ox-eyes on a leaf carpet (cut-out cards, MASK alpha). For FlowerBed (Nature.tsx) to load as <Asset id="flowerbed">, today\'s bed as the fallback.' },
];
// Held back on purpose: art/meshy/underside (it must replace MAIN's cone tip first, see art/meshy/README.md).

export async function publishModels({ modelsDir = path.join(projectRoot, 'public', 'models'), log = console.log } = {}) {
  await fs.mkdir(modelsDir, { recursive: true });
  const manifestPath = path.join(modelsDir, 'manifest.json');
  let manifest = { version: 1, assets: {} };
  try { manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')); } catch { /* none yet */ }
  manifest.version = manifest.version || 1;
  manifest.assets = manifest.assets || {};
  const rows = [];
  for (const M of MODELS) {
    const out = path.join(modelsDir, `${M.id}.glb`);
    if (M.meshy) await fs.copyFile(meshySource(M.meshy), out);
    else if (M.kit) await fs.writeFile(out, await buildPlant(M.id));
    else await buildAsset(M.build, out);
    const info = await inspectGlb(out), kb = (await fs.stat(out)).size / 1024;
    manifest.assets[M.id] = { file: `${M.id}.glb`, status: 'ready', tris: info.tris, notes: M.notes };
    rows.push({ id: M.id, tris: info.tris, kb: Math.round(kb), source: M.meshy ? `art/meshy/${M.meshy}` : M.kit ? 'lib/plantkit.mjs' : `scripts/assets/${M.build.id}.mjs` });
  }
  // stable key order: existing entries keep their place, ours are rewritten in place / appended in MODELS order
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  for (const r of rows) log(`  ${r.id.padEnd(10)} ${String(r.tris).padStart(5)} tris ${String(r.kb).padStart(4)} KB  <- ${r.source}`);
  return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  publishModels(i > 0 ? { modelsDir: path.resolve(process.argv[i + 1]) } : {}).catch((e) => { console.error(e); process.exit(1); });
}
