// composition.mjs -- the V21 proof's per-piece composition as data the game can draw with instancing, plus the plant models it
// references as GLBs (game asset ids). Node only (three for the colour maths and the procedural asset geometry, gltf-transform
// for the GLBs). export-composition.mjs writes the files; tests/composition.test.mjs re-runs this in memory.
//
// WHAT IS EXPORTED, item for item from the proof's own composeBlueprint() output (lib/terrain.mjs, seed 11; look preset 'Golden
// afternoon' = V21), placed exactly as lib/arch-scene.js populate() places it:
//   trees    every composition tree as its painterly species (t.asset: lib/species.mjs SPECIES / AUTUMN, art/reskin/<id>.glb;
//            art/specs/2026-10-22-painterly-trees-design.md "Revision 2"): scale = scale x vscale, yaw = rot + vyaw, on the ground
//            (no lift); a per-tree near-white crown tint (lib/terrain.mjs texturedTint, seeded by the world position on the
//            preset's canopy.instanceTint seed; the proof tints its Canopy parts with the same function)
//   shrubs   the woodland-edge shrub belt as card shrubs (s.asset: lib/plantkit.mjs SHRUBS) + the scattered bushes (b.kind: bush_a /
//            bush_flowering / bush_berry); all untinted
//   rocks    rock_a / rock_b instances; a position-hashed third drawn as boulder_c (MESHY_SET.rockC 0.34); lifted -0.04 / -0.02
//   flowers  the painterly ground-cover kit's flowers (composeBlueprint cover)
//   grass    the kit's grasses
// NOT EXPORTED (the game places these itself, or they are proof-only): MAIN's layout.ts trees (STATIC_TREES, incl. the slot the
// Meshy hero tree takes), bushes (BUSHES) and rocks (MainIsland.tsx ROCKS); the farm props, stepping stones and orchard repo-tree
// stand-ins; the meadow sheep; the 11 Meshy set pieces; contact-shadow blobs; the two porch bushes; the pre-plants speckle flowers.
//
// THE PLANT MODELS: the painterly trees and bushes are reskin.mjs's finished GLBs (painted textures, copied unchanged by
// export-composition.mjs), every tree with its far version (<id>_far.glb, task 11b: assets[id].far), the card shrubs and the ground
// cover are built by lib/plantkit.mjs; only grass_tuft and flower_head are still built here (flat vertex colours, published unplaced
// for the game's own tests).
import * as THREE from 'three';
import { Document } from '@gltf-transform/core';
import GT from './terrain.mjs';
import grassTuft from '../assets/grass_tuft.mjs';
import { KIT, SHRUBS } from './plantkit.mjs';
import { SPECIES, AUTUMN } from './species.mjs';

export const FORMAT = 'gitaway.composition-pieces/1';
export const CATEGORIES = ['trees', 'shrubs', 'rocks', 'flowers', 'grass'];
// the painterly ground-cover kit (lib/plantkit.mjs) -> composition category: its grasses lean in the game's wind as 'grass'; the
// wildflowers, perennial clumps and ferns are 'flowers'
// (the pebbles, group 'stone', are 'rocks': they stand still in the wind, as the game's motionOf does for a rock)
export const KIT_CATEGORY = Object.fromEntries(Object.entries(KIT).map(([id, k]) => [id, k.group === 'grass' ? 'grass' : k.group === 'stone' ? 'rocks' : 'flowers']));
export const PROOF_LOOK = 'Golden afternoon';   // the V21 look (lookPresets.json default, plants stage on)
export const GAME_PLACED = new Set(['tree_fruit']);   // shipped, never placed by the composition: the game's fruit-tree slots (untinted)
export const ROCK_C_SHARE = 0.34;   // arch-scene MESHY_SET.rockC
const HERO_AT = [-6.4, -3.6];       // arch-scene MESHY_SET.hero.at (a layout tree: excluded with the layout items)
// models-PR assets the composition references (files + manifest entries come with art/models-v21)
const MODELS_PR = { rock_a: 'Meshy boulder_a', rock_b: 'Meshy boulder_b', rock_c: 'Meshy boulder_c' };

const r3 = (v) => Math.round(v * 1000) / 1000 + 0, r4 = (v) => Math.round(v * 10000) / 10000 + 0;
const linHex = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // sRGB hex -> linear (THREE.Color.set)

// ---- per-instance crown tint for the PAINTED crowns (the spec's "per-tree colour variation"): lib/terrain.mjs texturedTint, a
//      near-white linear multiplier (value +/- 6 %, warm / cool +/- 3 %, each channel held to TINT_RANGE, plan Review Focus 3 and
//      composition.test C14; 18 of the 658 trees at seed 11 reach the clamp on r / b), seeded by the world position on the proof's
//      canopy.instanceTint seed. It lives in the shared core so the proof (arch-scene populate(), the tree:<asset> Canopy parts)
//      draws exactly these tints. The old canopyTint multiplied each crown by a green, which muddies a painted texture. ----
export const TINT_RANGE = GT.TINT_RANGE, texturedTint = GT.texturedTint;

// ---- clearance: the game's rule "nothing inside a layout.ts slot, a piece zone or water" on the blueprint export (the same data
//      as config/blueprint.pieces.json). Zones = every piece's flatZones except the open-ground ones (flat cores, the animals'
//      pasture, the wildflowers spot); water = the pond, stream / river / outflow (half width), and the lake / tarn / hot spring
//      where the ground is below level + 0.06 (open water: a land islet inside the shore is land). Returns the reason or null.
//      The proof breaks it on purpose in one place: its shore-boulder clusters sit in the lake shallows, on the river edge and in
//      the reed beds (composeBlueprint rockOk checks no water); those (and two grass tufts at the hot spring's rim) are WITHHELD:
//      listed under `withheld` with their full item data, so the game can opt in.
const OPEN_ZONE = (z) => (z.kind || z.what) === 'core' || z.kind === 'animals' || z.id === 'wildflowers';
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
export function clearanceChecker(exp, H) {
  const zones = [];
  for (const id of exp.order) { const d = exp.pieces[id].dockedPosition; for (const z of exp.pieces[id].flatZones) if (!OPEN_ZONE(z)) zones.push({ z, dx: d[0], dz: d[2] }); }
  const inZone = ({ z, dx, dz }, wx, wz) => { const x = wx - dx, y = wz - dz;
    if (z.type === 'rect') return x > z.min[0] && x < z.max[0] && y > z.min[1] && y < z.max[1];
    if (z.type === 'capsule') return segDist(x, y, z.a[0], z.a[1], z.b[0], z.b[1]) < z.r;
    return Math.hypot(x - z.at[0], y - z.at[1]) < z.r; };
  const Wm = exp.pieces.main.water, Ww = exp.pieces.wetland.water, Wh = exp.pieces.highland.water;
  // (water rev 1: the farm pond = its art-owned teardrop outline, the farm stream = its dense line; the game's blob circle only without it)
  const lines = [['stream', Wm.stream.line || Wm.stream.points], ['river', Ww.river.points], ['outflow', Ww.outflow.points]], pools = [['lake', Ww.lake], ['tarn', Wh.tarn], ['hot spring', Wh.hotSpring]];
  return (piece, x, z) => {
    const d = exp.pieces[piece].dockedPosition, wx = x + d[0], wz = z + d[2];
    for (const q of zones) if (inZone(q, wx, wz)) return 'zone ' + (q.z.id || q.z.what);
    if (Wm.pond.r == null ? GT.inLoop(Wm.pond.outline, wx, wz) : Math.hypot(wx - Wm.pond.at[0], wz - Wm.pond.at[1]) < Wm.pond.r) return 'pond';
    for (const [nm, pts] of lines) for (let i = 0; i < pts.length - 1; i++) if (segDist(wx, wz, pts[i].x, pts[i].z, pts[i + 1].x, pts[i + 1].z) < Math.max(pts[i].width, pts[i + 1].width) / 2) return nm;
    for (const [nm, p] of pools) if (GT.inLoop(p.outline, wx, wz) && H(wx, wz) < p.level + 0.06) return nm;
    return null;
  };
}

// ---- the asset records (assets{} in the JSON) ----
// the painterly set's provenance: the reskin GLB, its MegaKit source and the concept it is painted from (art/reskin/SOURCES.md)
export function reskinFrom(id) {
  const a = AUTUMN.find((x) => x.id === id), s = SPECIES.find((x) => x.id === (a ? a.from : id));
  return `art/reskin/${id}.glb (reskin.mjs): MegaKit ${s.source} (Quaternius, CC0) ` + (a ? `as ${a.from}, its foliage on an autumn ramp at ${a.hue} deg` : `painted from the ${s.ramp} concept`)
    + (s.overlay ? ` + painted ${s.overlay === 'apple' ? 'apple' : 'berry'} cards (${id}_overlay)` : '');
}
export function assetTable(A) {
  const assets = {}, rec = (category, id, from, tint, far) => ({ category, file: id + '.glb', ...(far ? { far: id + '_far.glb' } : {}), provider: 'export-composition', from, ...(tint ? { instanceColor: 'tint' } : {}), yOffset: 0 });
  // the painterly trees take the per-tree crown tint (tree_fruit, game-placed, stays untinted); the bushes and card shrubs never do.
  // Every tree (tree_fruit too) also names its far version (task 11b: art/reskin/<id>_far.glb, for distant / low-power draws)
  for (const s of SPECIES) assets[s.id] = s.kind === 'bush' ? rec('shrubs', s.id, reskinFrom(s.id)) :
    rec('trees', s.id, reskinFrom(s.id) + (GAME_PLACED.has(s.id) ? '; not placed by the composition: the game\'s fruit-tree slots' : ''), !GAME_PLACED.has(s.id), true);
  for (const a of AUTUMN) assets[a.id] = rec('trees', a.id, reskinFrom(a.id), true, true);
  for (const id of Object.keys(SHRUBS)) assets[id] = rec('shrubs', id, 'lib/plantkit.mjs SHRUBS (painted cut-out cards, MASK alpha)');
  for (const [id, from] of Object.entries(MODELS_PR)) assets[id] = { category: 'rocks', file: id + '.glb', provider: 'models PR (art/models-v21)', from, yOffset: id === 'rock_c' ? -0.02 : -0.04 };
  assets.flower_head = { category: 'flowers', file: 'flower_head.glb', provider: 'export-composition', from: 'icosahedron r 0.06, y x 0.8 baked; white vertex colours', instanceColor: 'color', yOffset: 0.075 };
  assets.grass_tuft = { category: 'grass', file: 'grass_tuft.glb', provider: 'export-composition', from: 'assets/grass_tuft.mjs, palette ' + A.look.terrain.tuft, yOffset: 0 };
  for (const [id, cat] of Object.entries(KIT_CATEGORY)) assets[id] = { category: cat, file: id + '.glb', provider: 'export-composition', from: 'lib/plantkit.mjs (painted cut-out cards, MASK alpha)', instanceColor: 'tint', yOffset: KIT[id].yOffset ?? -0.01 };   // (-0.01: a hair into the ground; the pebbles lie flat, +0.006: the lowest card just above it)
  return assets;
}

// ---- the composition data ----
export function compositionData(bp, comp, L, look, meta = {}) {
  const A = bp.config, P = L.palette, T = look.canopy && look.canopy.instanceTint, assets = assetTable(A);
  const exp = GT.exportBlueprint(bp, comp), hit = clearanceChecker(exp, bp.H), withheld = [];
  const hash01 = (x, z) => GT.hash3(Math.round(x * 100), Math.round(z * 100), 77), isRockC = (r) => hash01(r.x + 0.37, r.z - 0.11) < ROCK_C_SHARE;
  const pieces = {}, counts = {}, excluded = [];
  const exclude = (piece, what, n, why) => { if (n) excluded.push({ piece, what, count: n, why }); };
  for (const id of bp.order) {
    const O = comp.pieces[id], pv = bp.pieces[id].pivot, loc = (x, z) => ({ x: r3(x - pv[0]), z: r3(z - pv[2]) });
    // trees: the species (t.asset), the crown tint where its record asks for one; shrubs: the card shrubs (s.asset) + the bushes
    // (b.kind), never tinted
    const trees = O.trees.filter((t) => !t.layout).map((t) => ({ asset: t.asset, ...loc(t.x, t.z), rotY: r4(t.rot + (t.vyaw || 0)), scale: r4(t.scale * (t.vscale || 1)),
      tint: assets[t.asset] && assets[t.asset].instanceColor === 'tint' ? texturedTint(t.x, t.z, T) : null }));
    const shrubs = (O.shrubs || []).map((s) => ({ asset: s.asset, ...loc(s.x, s.z), rotY: r4(s.rot), scale: r4(s.scale) }))
      .concat(O.bushes.filter((b) => !b.layout).map((b) => ({ asset: b.kind, ...loc(b.x, b.z), rotY: r4(b.rot), scale: r4(b.scale) })));
    const rocks0 = O.rocks.filter((r) => !r.layout).map((r) => ({ asset: isRockC(r) ? 'rock_c' : r.kind, ...loc(r.x, r.z), rotY: r4(r.rot), scale: r4(r.scale), ...(r.sy ? { scaleY: r4(r.scale * r.sy) } : {}) }));
    // ground cover (the living-ground spec): the painterly kit in patches (composeBlueprint's cover), split by the kit's category;
    // it replaces the old grass_tuft sprinkle and flower_head drifts (their GLBs stay published, unplaced, for the game's own tests)
    const cover = (O.cover || []).map((c) => ({ asset: c.asset, ...loc(c.x, c.z), rotY: r4(c.rot), scale: r4(c.scale), ...(c.tint ? { tint: c.tint } : {}) }));   // (plan Task 4: near-white; the shade-pool clover darker)
    const rocks = rocks0.concat(cover.filter((c) => KIT_CATEGORY[c.asset] === 'rocks'));   // (plan Task 8: MAIN's pebbles, after the boulders)
    const flowers = cover.filter((c) => KIT_CATEGORY[c.asset] === 'flowers');
    const grass = cover.filter((c) => KIT_CATEGORY[c.asset] === 'grass');
    for (const it of trees) if (!it.tint) delete it.tint;
    pieces[id] = {};
    for (const [c, list] of Object.entries({ trees, shrubs, rocks, flowers, grass })) pieces[id][c] = list.filter((it) => { const why = hit(id, it.x, it.z);
      if (why) withheld.push({ piece: id, category: c, reason: why, item: it }); return !why; });
    // paths: the proof's trunk paths (world.config blueprint.paths) as composeBlueprint splits them at the seams; MAIN's layout.ts
    // dirt paths are drawn by the game (MainIsland.tsx), so only the blueprint runs are exported
    pieces[id].paths = O.paths.filter((q) => !q.layout).map((q) => ({ id: q.id, width: q.width, ...(q.widths ? { widths: q.widths.map(r3) } : {}), _ends: [q.from, q.to],
      pts: q.pts.map(([x, z]) => [r3(x - pv[0]), r3(z - pv[2])]) }));
    // the pond's reeds (ground-vegetation plan Task 10): outside CATEGORIES (the counts do not move), one per reed, 1:1 the game's Reed
    // { at, height, head } (WildIsles.tsx Reeds), piece-local; MAIN only (composeBlueprint's pieces.main.reeds), drawn by the game (GV3)
    if (O.reeds && O.reeds.length) pieces[id].reeds = O.reeds.map((r) => ({ ...loc(r.x, r.z), height: r3(r.height), head: !!r.head }));
    counts[id] = Object.fromEntries(CATEGORIES.map((c) => [c, pieces[id][c].length]).concat([['paths', pieces[id].paths.length]]));
    const lt = O.trees.filter((t) => t.layout), hero = lt.find((t) => Math.hypot(t.x - HERO_AT[0], t.z - HERO_AT[1]) < 0.05);
    exclude(id, 'layout.ts STATIC_TREES', lt.length, 'game slots (Nature.tsx RoundTree / PineTree)' + (hero ? `; incl. the (${hero.x}, ${hero.z}) slot the proof fills with the Meshy hero_tree` : ''));
    exclude(id, 'layout.ts BUSHES', O.bushes.filter((b) => b.layout).length, 'game slots');
    exclude(id, 'MainIsland.tsx ROCKS', O.rocks.filter((r) => r.layout).length, 'game rocks');
    exclude(id, 'repo-tree stand-ins', O.placeholders.length, 'RepoOrchard.tsx places the 8 repo trees');
    exclude(id, 'sheep', O.sheep.length, 'animals: the game places the flock');
    exclude(id, 'layout.ts DIRT_PATHS', O.paths.filter((q) => q.layout).length, 'MainIsland.tsx draws its dirt and stone paths');
  }
  counts.total = Object.fromEntries([...CATEGORIES, 'paths'].map((c) => [c, bp.order.reduce((s, id) => s + counts[id][c], 0)]));
  // which pieces a run needs (paths v2): leadsTo = the non-main piece it runs into at an end (null: it only meets main or ends free);
  // needs = every other non-main piece the whole path crosses, so a run never dangles: show it once all of them are docked
  const crossing = {}; for (const id of bp.order) for (const q of pieces[id].paths) (crossing[q.id] = crossing[q.id] || new Set()).add(id);
  for (const id of bp.order) pieces[id].paths = pieces[id].paths.map(({ _ends, pts, ...q }) => ({ ...q, leadsTo: _ends.find((p) => p && p !== 'main' && p !== id) || null,
    needs: [...crossing[q.id]].filter((p) => p !== 'main' && p !== id).sort(), pts }));
  const conflicts = pathConflicts(exp, pieces);
  excluded.push({ piece: 'main', what: 'farm props (farmhouse, plots, flowerbeds, stepping stones) + the two porch bushes', why: 'the game places the farm' },
    { piece: '*', what: 'Meshy set pieces: windmill, well, bench, cart, 2 haystacks, hero tree, 3 outcrops', why: 'placed individually by the game (models PR)' },
    { piece: '*', what: 'contact-shadow blobs; the pre-plants speckle flowers (hidden in V21)', why: 'proof-only (the game has real shadows)' });
  return {
    format: FORMAT,
    about: 'The V21 art proof\'s per-piece composition (trees, shrubs, rocks, flower drifts, grass) for the game to draw with instancing. Generated by art/scripts/export-composition.mjs; do not hand-edit.',
    source: { proof: 'V21', look: PROOF_LOOK, seed: meta.seed, core: 'art/scripts/lib/terrain.mjs composeBlueprint (the proof\'s own code)', blueprint: 'art/config/blueprint.pieces.json' },
    frame: 'x / z are PIECE-LOCAL (world minus the piece dockedPosition); there is no y: sample the piece\'s height(x, z) (its height grid)',
    draw: {
      matrix: 'translate(x, height(x, z) + assets[asset].yOffset, z) * rotateY(rotY) * scale(scale) (scaleY, when present, replaces scale on y)',
      nodes: 'GLBs with child nodes (trees: root = bark, child Canopy = crown; conifers root > Crown > Canopy): one InstancedMesh per mesh primitive (a tree has a bark and a leaves primitive, tree_fruit and bush_berry also an _overlay one), instance matrix x the node matrix relative to the root',
      tint: 'trees: optional linear RGB multiplier, near white (value +/- 6 % with a slight warm / cool shift), for the CANOPY only: instance the bark mesh (GLB root) and the Canopy mesh as separate InstancedMeshes and setColorAt(i, new Color().setRGB(r, g, b)) on the canopy one; the bark, tree_fruit, the bushes and the card shrubs stay untinted; flowers and grass (the ground-cover kit, instanceColor tint; so are the pebbles on MAIN, in rocks, which stand still): each item has its own tint, near white (each channel 0.92-1.08), darker (0.754-0.972) on clover_patch in a shade pool under a tree: setColorAt(i, new Color().setRGB(r, g, b)) on the one mesh',
      color: 'flowers: sRGB hex: setColorAt(i, new Color(hex)); flower_head\'s vertex colours are white',
      reeds: 'pieces.main.reeds (ground-vegetation plan Task 10; G-item GV3): the farm pond\'s reeds on stretches of the Teardrop\'s far shore, [{ x, z, height, head }] piece-local, 1:1 the game\'s Reed { at: [x, z] + the piece\'s dockedPosition, height, head }: draw them with the game\'s own Reeds (WildIsles.tsx: blades and bulrush heads, REED_TINTS, leaning in the wind) whenever the baked Teardrop is drawn, in place of pondDressing\'s 7 spike reeds (v2Reeds; its bank stones and lily pads stay); never with the legacy pond. Outside the categories (not in counts)',
      far: 'trees: optional far version (assets.<id>.far = <id>_far.glb) for distant / low-power draws: the same node structure (root > [Crown >] Canopy) and Canopy pivot as <id>.glb, but the root node and meshes are named <id>_far / <id>_far_canopy; the materials keep the near names (bind by name), their textures downsampled to 256 px',
    },
    categories: CATEGORIES,
    assets,
    counts,
    excluded,
    pathColor: P.Path.toUpperCase(),
    pathTone: { color: look.paths.color.toUpperCase(), variation: look.paths.variation, scale: look.paths.scale,
      about: 'what the V21 proof draws (preset paths.*): color x (1 + variation (2n - 1)), n = 0.65 noise(q) + 0.35 noise(2.7 q + 5.3), q = world xz x scale; pathColor is the palette Path the paths fall back to with paths off. The ribbons bake the V21 tone per vertex.' },
    paths: { format: 'pieces.<id>.paths: [{ id, width, widths?, leadsTo, needs, pts: [[x, z], ...] }] piece-local centrelines, split at the seams like the proof (a run ends exactly on the seam); widths (optional) = the width at each point where a run is narrowed; ribbon = width + a 0.14 soft edge each side. leadsTo = the non-main piece the run runs into at an end (null: it only meets main or ends free); needs = every non-main piece the whole path crosses besides this one: show the run once all of them are docked',
      ribbons: Object.fromEntries(bp.order.filter((id) => pieces[id].paths.length).map((id) => [id, { file: `paths_${id}.glb`, lift: PATH_LIFT }])),
      draw: `add public/models/paths_<id>.glb to the piece group (piece-local, sits on the BAKED top of piece_<id>.glb + ${PATH_LIFT} u). Its root node paths_<id> holds ONE node per run, node and mesh named path_<runId>, with mesh extras { leadsTo, needs }: set each run node visible only once every piece in its needs is docked. One shared alphaMode BLEND material (soft edges in COLOR_0 alpha): give it a renderOrder above the terrain and, if wanted, a polygonOffset` },
    conflicts: { why: 'layout.ts / piece-zone slots that stand on a path ribbon (the layout is frozen: reported, not fixed). overlap = the local half width of the ribbon - the distance from the path centreline to the slot edge (the zone radius, our layout.ts snapshot). resolution says why each remains: the game moves the slot (composition-conflicts.md; overlap still computed at the old spot), a keep-clear disc whose DRAWN footprint is clear (drawnClear, u), a trailhead, or nothing drawn in the alpha; open = unresolved', items: conflicts },
    withheld: { why: 'drawn by the proof but inside water or a piece zone (the game\'s clearance rule): the proof\'s shore boulders in the lake shallows / river edge / reed-bed spots and two grass tufts at the hot spring\'s rim. Same item format; add them to the lists to get the proof\'s rock-lined shore.', items: withheld },
    pieces,
  };
}

// one item per line inside the lists (readable diffs), the rest pretty-printed
export function serialize(data) {
  const head = JSON.stringify({ ...data, withheld: { ...data.withheld, items: '__WITHHELD__' }, pieces: '__PIECES__' }, null, 1);
  const body = Object.entries(data.pieces).map(([id, P]) => `  ${JSON.stringify(id)}: {\n` +
    [...CATEGORIES, 'paths', ...(P.reeds ? ['reeds'] : [])].map((c) => `   ${JSON.stringify(c)}: [` + (P[c].length ? '\n' + P[c].map((it) => '    ' + JSON.stringify(it)).join(',\n') + '\n   ]' : ']')).join(',\n') + '\n  }').join(',\n');
  const wh = data.withheld.items.length ? '[\n' + data.withheld.items.map((w) => '   ' + JSON.stringify(w)).join(',\n') + '\n  ]' : '[]';
  return head.replace('"__WITHHELD__"', wh).replace('"__PIECES__"', '{\n' + body + '\n }') + '\n';
}

// ---- paths: slot conflicts, the baked-top sampler and the ribbon GLBs ----
export const PATH_LIFT = 0.035, PATH_SOFT = 0.14;   // the proof's ribbon lift above the ground and soft-edge width (arch-scene ribbon())
// the paths' own zones (the trunk paths start at the stone-path ends) + the fence capsules (the game removed the farm fences)
const PATH_ZONES = new Set(['stonePath', 'dirtPath', 'homeFence', 'fenceRun']);
// how each listed conflict is resolved (paths v2; the game session's composition-conflicts.md, 2026-10-19). World x, z.
//   MOVES: the game moves these slots (its section C) -> the conflict goes once its layout.ts lands (our zone data is the frozen
//          layout.ts snapshot, so the overlap is still computed at the old spot)
//   DRAWN: keep-clear discs (BLOCKERS) that overstate what is drawn: the drawn footprint must be clear of the ribbon's hard width
//   TRAILHEAD / NOT_DRAWN: by design, or nothing is drawn there in the alpha
const SLOT_MOVES = [['FRUIT_TREES[0]', [6.25, -1.70], [5.77, -2.30]], ['FRUIT_TREES[5]', [1.10, 6.80], [0.95, 6.95]], ['FLOWERBEDS[0]', [-5.40, 0.15], [-5.00, 1.22]],
  ['FLOWERBEDS[1]', [-2.15, -3.35], [-1.33, -5.60]], ['LANTERNS[3]', [0.85, 4.85], [0.45, 4.60]], ['BENCH', [0.65, 5.75], [0.20, 5.77]], ['BUSHES[2]', [1.90, -6.10], [1.30, -6.80]],
  ['STATIC_TREES[2]', [-2.40, -6.40], [-2.08, -6.63]], ['STATIC_TREES[4]', [-1.30, -4.50], [-0.88, -4.55]], ['STATIC_TREES[6]', [3.30, -6.50], [3.47, -6.43]],
  ['STATIC_TREES[7]', [7.10, -3.60], [6.85, -3.70]], ['ROCKS[0]', [-7.60, 1.40], [-7.45, 1.35]], ['ROCKS[3]', [2.00, 7.20], [1.72, 7.52]]];
const SLOT_DRAWN = { well: { at: [-6.10, 0.90], r: 0.5, what: 'well plinth' }, windmill: { at: [0.70, -5.50], r: 0.9, doorstep: 0.8, what: 'windmill plinth (past the 0.8 u doorstep)' },
  greenhouse: { box: [3.80, -4.25, 1.025, 0.74, -0.12], what: 'greenhouse 2.05 x 1.48 box' }, lighthouse: { at: [25.80, -5.96], r: 0.75, what: 'lighthouse base' } };
const SLOT_TRAILHEAD = { 'to_highland:porch': 'to_highland starts at the porch steps', 'to_highland:house': 'to_highland starts at the porch steps, beside the house' };
const SLOT_NOT_DRAWN = { bramble: 'the idle / mail lane spot (not in the game yet)', ruins: 'a restoration zone: restorations are off, nothing is drawn there in the alpha' };
// the least (distance from the centreline to a feature) - (local half width + r) along a world polyline, past `from` u
function bandClear(W, ws, dist, r, from = 0) { let s = 0, m = Infinity;
  for (let i = 0; i < W.length - 1; i++) { const L = Math.hypot(W[i + 1][0] - W[i][0], W[i + 1][1] - W[i][1]); if (s + L > from) m = Math.min(m, dist(W[i], W[i + 1]) - (Math.max(ws[i], ws[i + 1]) / 2 + r)); s += L; }
  return m; }
const boxDist = ([cx, cz, hx, hz, rot]) => (a, b) => { let m = Infinity; for (let t = 0; t <= 1.0001; t += 0.05) { const x = a[0] + (b[0] - a[0]) * t - cx, z = a[1] + (b[1] - a[1]) * t - cz, c = Math.cos(rot), s = Math.sin(rot);
  m = Math.min(m, Math.hypot(Math.max(Math.abs(c * x - s * z) - hx, 0), Math.max(Math.abs(s * x + c * z) - hz, 0))); } return m; };   // (three rotation.y = rot)
function pathConflicts(exp, pieces) {
  const out = [];
  for (const id of exp.order) for (const P of pieces[id].paths) {
    const d0 = exp.pieces[id].dockedPosition, W = P.pts.map(([x, z]) => [x + d0[0], z + d0[2]]), ws = P.widths || P.pts.map(() => P.width);
    for (const zid of exp.order) { const d = exp.pieces[zid].dockedPosition;
      for (const z of exp.pieces[zid].flatZones) {
        if (OPEN_ZONE(z) || PATH_ZONES.has(z.what) || /^blocker:/.test(z.what || '')) continue;   // (blocker:* = the same disc as its building)
        let overlap = -Infinity, ctr = null, at = null;   // the local half width - the distance from the centreline to the slot edge
        if (z.type === 'disc' || !z.type) { const cx = z.at[0] + d[0], cz = z.at[1] + d[2]; at = [cx, cz]; ctr = Infinity;
          for (let i = 0; i < W.length - 1; i++) { const s = segDist(cx, cz, W[i][0], W[i][1], W[i + 1][0], W[i + 1][1]); ctr = Math.min(ctr, s); overlap = Math.max(overlap, Math.max(ws[i], ws[i + 1]) / 2 + z.r - s); } }
        else if (z.type === 'capsule') W.forEach(([x, y], i) => { overlap = Math.max(overlap, ws[i] / 2 - (segDist(x - d[0], y - d[2], z.a[0], z.a[1], z.b[0], z.b[1]) - z.r)); });
        else W.forEach(([x, y], i) => { const lx = x - d[0], ly = y - d[2], dx = Math.max(z.min[0] - lx, 0, lx - z.max[0]), dz = Math.max(z.min[1] - ly, 0, ly - z.max[1]);
          overlap = Math.max(overlap, ws[i] / 2 - (dx || dz ? Math.hypot(dx, dz) : -Math.min(lx - z.min[0], z.max[0] - lx, ly - z.min[1], z.max[1] - ly))); });
        if (!(overlap > 0)) continue;
        const slot = z.what || z.id, c = { path: P.id, piece: id, slot, slotPiece: zid, overlap: r3(overlap), ...(ctr != null ? { slotAt: at.map(r3), centrelineToSlotCentre: r3(ctr), slotRadius: z.r } : {}) };
        const mv = at && SLOT_MOVES.find(([, from]) => Math.hypot(from[0] - at[0], from[1] - at[1]) < 0.05), dr = SLOT_DRAWN[slot];
        if (mv) c.resolution = `game moves ${mv[0]} to (${mv[2].join(', ')})`;
        else if (dr) { c.drawnClear = r3(dr.box ? bandClear(W, ws, boxDist(dr.box), 0) : bandClear(W, ws, (a, b) => segDist(dr.at[0], dr.at[1], a[0], a[1], b[0], b[1]), dr.r, dr.doorstep || 0));
          if (c.drawnClear >= 0) c.resolution = `keep-clear disc only: the drawn ${dr.what} is ${c.drawnClear} u clear of the ribbon`; else c.open = true; }
        else if (SLOT_TRAILHEAD[P.id + ':' + slot]) c.resolution = 'trailhead: ' + SLOT_TRAILHEAD[P.id + ':' + slot];
        else if (SLOT_NOT_DRAWN[slot]) c.resolution = 'not drawn: ' + SLOT_NOT_DRAWN[slot];
        else c.open = true;
        out.push(c);
      } }
  }
  return out;
}
// the BAKED piece's top surface, triangle-exact: (x, z) local -> y, or null off the top (piece_<id>.glb, mesh extras faceRanges.top)
export function bakedTopSampler(doc) {
  const mesh = doc.getRoot().listMeshes()[0], prim = mesh.listPrimitives()[0], P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray();
  const [t0, tn] = mesh.getExtras().faceRanges.top, C = 0.5, grid = new Map(), key = (i, j) => i * 100003 + j;
  for (let t = t0; t < t0 + tn; t++) { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; x0 = Math.min(x0, P[v * 3]); x1 = Math.max(x1, P[v * 3]); z0 = Math.min(z0, P[v * 3 + 2]); z1 = Math.max(z1, P[v * 3 + 2]); }
    for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) { const k = key(i, j); (grid.get(k) || grid.set(k, []).get(k)).push(t); } }
  const at = (x, z) => { let best = null;
    for (const t of grid.get(key(Math.floor(x / C), Math.floor(z / C))) || []) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2], ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(det) < 1e-12) continue;
      const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l2 = 1 - l0 - l1;
      if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
      const y = l0 * P[a * 3 + 1] + l1 * P[b * 3 + 1] + l2 * P[c * 3 + 1]; if (best === null || y > best) best = y; }
    return best; };
  // at.near(x, z, tol): the top at a point ON its rim (a seam row vertex, which float rounding may leave a hair outside): exact when
  // inside, else the height at the closest point of the closest top triangle within tol (on a rim edge: the edge's own linear height,
  // the same on both pieces of a seam, which share their rim vertices), else null
  at.near = (x, z, tol = 1e-4) => { const y0 = at(x, z); if (y0 !== null) return y0; let best = null, bd = tol;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (const t of grid.get(key(Math.floor(x / C) + di, Math.floor(z / C) + dj)) || []) for (let k = 0; k < 3; k++) {
      const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3], ax = P[a * 3], az = P[a * 3 + 2], dx = P[b * 3] - ax, dz = P[b * 3 + 2] - az, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - ax - dx * u, z - az - dz * u); if (d <= bd) { bd = d; best = P[a * 3 + 1] + (P[b * 3 + 1] - P[a * 3 + 1]) * u; } }
    return best; };
  return at;
}
// a baked piece's top rim: the edges used by one top face, as world segments [ax, az, bx, bz] (piece-local + the docked position)
export function bakedRim(doc, pivot) {
  const mesh = doc.getRoot().listMeshes()[0], prim = mesh.listPrimitives()[0], P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray(), [t0, tn] = mesh.getExtras().faceRanges.top;
  const ec = new Map(); for (let t = t0; t < t0 + tn; t++) for (let k = 0; k < 3; k++) { const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3], key = Math.min(a, b) * 1e6 + Math.max(a, b); ec.set(key, (ec.get(key) || 0) + 1); }
  return [...ec].filter(([, n]) => n === 1).map(([key]) => { const a = Math.floor(key / 1e6), b = key % 1e6; return [P[a * 3] + pivot[0], P[a * 3 + 2] + pivot[2], P[b * 3] + pivot[0], P[b * 3 + 2] + pivot[2]]; });
}
// the seam two baked pieces share: the rim edges of `ra` whose two ends are rim vertices of `rb` too (within 1e-5: the bake shares the
// seam vertices) and whose middle lies on an edge of `rb` (world segments; the drawn surfaces meet exactly along these)
export function sharedRim(ra, rb, tol = 1e-5) {
  const onB = (x, z) => rb.some(([ax, az, bx, bz]) => { const dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - ax - dx * u, z - az - dz * u) <= tol; });
  const vB = (x, z) => rb.some(([ax, az, bx, bz]) => Math.hypot(x - ax, z - az) <= tol || Math.hypot(x - bx, z - bz) <= tol);
  return ra.filter(([ax, az, bx, bz]) => vB(ax, az) && vB(bx, bz) && onB((ax + bx) / 2, (az + bz) / 2));
}
// every exported run's seam ends, aligned with the composition's per-piece path lists: { [piece]: [{ start, end }] }; start / end is
// null at a free end, else { at, dir, seam }: the crossing (world x, z; composeBlueprint gives both runs the same point), the path's
// direction there (the same unit vector for both runs: from the point before the crossing, on the one run, to the point after it,
// on the other) and the seam the two baked pieces share there (sharedRim, world). rims = { [piece]: bakedRim(...) }
export function seamEnds(bp, comp, rims) {
  const runs = {}, seams = new Map(), out = {};
  for (const id of bp.order) runs[id] = comp.pieces[id].paths.filter((q) => !q.layout);
  const seamOf = (a, b) => { const k = [a, b].sort().join('|'); if (!seams.has(k)) { const [p, q] = k.split('|'); seams.set(k, sharedRim(rims[p], rims[q])); } return seams.get(k); };
  const unit = (p, q) => { const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  for (const id of bp.order) out[id] = runs[id].map((q) => {
    const before = q.from && runs[q.from].find((r) => r.id === q.id && r.pts[r.pts.length - 1] === q.pts[0]);   // (the very same crossing array)
    const after = q.to && runs[q.to].find((r) => r.id === q.id && r.pts[0] === q.pts[q.pts.length - 1]);
    return { start: before ? { at: q.pts[0], dir: unit(before.pts[before.pts.length - 2], q.pts[1]), seam: seamOf(id, q.from) } : null,
      end: after ? { at: q.pts[q.pts.length - 1], dir: unit(q.pts[q.pts.length - 2], after.pts[1]), seam: seamOf(id, q.to) } : null };
  });
  return out;
}
// the 7 points (world x, z) where the ribbon's lines along the path at the offsets `offs` (from the crossing `at`, along `dir`) cross
// the seam: per line the crossing nearest to `at`; a line that misses the seam ends at the closest seam end to it
export function seamRow(at, dir, offs, seam) {
  const [tx, tz] = dir;
  return offs.map((o) => { const px = at[0] - tz * o, pz = at[1] + tx * o; let best = null, bs = Infinity;
    for (const [ax, az, bx, bz] of seam) { const ex = bx - ax, ez = bz - az, den = tx * ez - tz * ex; if (Math.abs(den) < 1e-12) continue;
      const s = ((ax - px) * ez - (az - pz) * ex) / den, u = ((ax - px) * tz - (az - pz) * tx) / den;
      if (u >= -1e-9 && u <= 1 + 1e-9 && Math.abs(s) < bs) { bs = Math.abs(s); best = [px + tx * s, pz + tz * s]; } }
    if (!best) { let bd = Infinity; for (const [ax, az, bx, bz] of seam) for (const [x, z] of [[ax, az], [bx, bz]]) { const d = Math.abs((x - px) * tz - (z - pz) * tx); if (d < bd) { bd = d; best = [x, z]; } } }
    return best; });
}
// the proof's path tone (arch-scene pathTone: two octaves of the GLSL value noise lkNoise in world xz), per vertex, linear
const fract = (v) => v - Math.floor(v), lkHash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
function lkNoise(x, y) { const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = lkHash(ix, iy), b = lkHash(ix + 1, iy), c = lkHash(ix, iy + 1), d = lkHash(ix + 1, iy + 1), lo = a + (b - a) * fx; return lo + ((c + (d - c) * fx) - lo) * fy; }
function pathTone(T) { const base = linHex(T.color); return (wx, wz) => { const qx = wx * T.scale, qz = wz * T.scale, n = 0.65 * lkNoise(qx, qz) + 0.35 * lkNoise(qx * 2.7 + 5.3, qz * 2.7 + 5.3);
  return base.map((c) => c * (1 + T.variation * (2 * n - 1))); }; }
// one piece's ribbons (arch-scene ribbon(): 7 vertices across = soft edge / half / quarter / centre, alpha 0 at the outer edge), each
// vertex on the baked top + PATH_LIFT; cross-sections that would leave the piece (a run ends on the seam) are pulled back inside.
// Where a ribbon crosses a CREST of the baked top between its vertices (a riser edge beside a stair ramp), its flat triangles would
// dip into the ground: those vertices are raised until every edge midpoint and quad centre clears the top by PATH_CLEAR.
// A run that ends on a SEAM (ends[i].start / .end, seamEnds) starts / ends with a seam row instead: its 7 vertices where the ribbon's
// lines along the path cross the seam both baked pieces share (seamRow), on the rim at the top's own height + PATH_LIFT, so the
// neighbour's run, built from the same crossing, direction and seam, starts / ends with the same 7 points and no sliver of grass or
// overlap is left between them. Rows whose vertices reach that row are dropped; the seam rows are never raised (both sides agree).
export const PATH_CLEAR = 0.5 * PATH_LIFT;   // the least clearance of the ribbon interior over the baked top
export function pathRibbon(id, paths, sampler, outline, pivot, T, ends = null) {
  // inside = on the baked top and inside the outline with a 3 mm margin (float32 storage never puts a seam vertex off the piece,
  // and the two pieces' ribbons meet across a seam with a hairline of at most ~6 mm)
  const IN = (x, z) => GT.inLoop(outline, x, z) && sampler(x, z) !== null, M = 0.003, tone = pathTone(T);
  const inside = (x, z) => IN(x, z) && IN(x + M, z) && IN(x - M, z) && IN(x, z + M) && IN(x, z - M);
  const pull = (ax, az, bx, bz) => { for (let k = 0; k < 30; k++) { const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (inside(mx, mz)) { ax = mx; az = mz; } else { bx = mx; bz = mz; } } return [ax, az]; };
  const AL = [0, 1, 1, 1, 1, 1, 0];
  const doc = new Document(); doc.getRoot().getAsset().generator = 'gitaway export-composition';
  const buffer = doc.createBuffer(), scene = doc.createScene(id); doc.getRoot().setDefaultScene(scene);
  const material = doc.createMaterial('path').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1).setAlphaMode('BLEND');
  const acc = (type, arr) => doc.createAccessor().setType(type).setBuffer(buffer).setArray(arr);
  const root = doc.createNode(id); scene.addChild(root);
  let tris = 0; const used = new Set();
  // ONE node per run (node + mesh path_<runId>, extras { lift, path, leadsTo, needs }), so the game shows a run only once every piece
  // in its `needs` is docked (paths v2)
  for (const [pi, P] of paths.entries()) {
    const pts = P.pts, pos = [], col = [], idx = [];
    // the 7 offsets across at point i (the run's own width there: `widths` narrows a stretch)
    const offsAt = (i) => { const hw = (P.widths ? P.widths[i] : P.width) / 2; return [-(hw + PATH_SOFT), -hw, -hw * 0.5, 0, hw * 0.5, hw, hw + PATH_SOFT]; };
    // a cross-section at centre (cx, cz), direction (tx, tz): 7 [x, y, z] or null when the centre cannot be brought inside
    // a vertex off the piece is pulled back ALONG THE PATH (toward the run's interior, back = +1 near its start, -1 near its end);
    // only if that finds no ground within 2 u (a path along the outer rim) is it pulled toward the centreline instead (a run's end
    // on a seam is its seam row, below, not a section)
    const section = (cx, cz, tx, tz, from, back, offs) => {
      if (!inside(cx, cz)) { if (!from || !inside(from[0], from[1])) return null; [cx, cz] = pull(from[0], from[1], cx, cz); }
      const row = [];
      for (let k = 0; k < 7; k++) { let x = cx - tz * offs[k], z = cz + tx * offs[k];
        if (!inside(x, z)) { let done = false;
          for (const s of [0.25, 0.5, 1, 2]) { const ix = x + back * tx * s, iz = z + back * tz * s; if (inside(ix, iz)) { [x, z] = pull(ix, iz, x, z); done = true; break; } }
          if (!done) [x, z] = pull(cx, cz, x, z); }
        row.push([x, sampler(x, z) + PATH_LIFT, z]); }
      return row; };
    const emit = (rows, pinned) => {   // consecutive rows -> vertices + 12 triangles per row pair (the proof's winding: faces up)
      clear(rows, pinned);
      const base = pos.length / 3;
      for (const R of rows) for (let k = 0; k < 7; k++) { const [x, y, z] = R[k]; pos.push(x, y, z); col.push(...tone(x + pivot[0], z + pivot[2]), AL[k]); }
      for (let r = 0; r < rows.length - 1; r++) for (let k = 0; k < 6; k++) { const p = base + r * 7 + k, q = p + 1, d = p + 7, e = d + 1; idx.push(p, q, d, q, e, d); }
    };
    const n = pts.length, E = (ends && ends[pi]) || {}, tangent = (i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl]; };
    // the seam rows (piece-local, on the rim at the baked top + lift)
    const seamRowOf = (S, i) => S && seamRow(S.at, S.dir, offsAt(i), S.seam).map(([wx, wz]) => { const x = wx - pivot[0], z = wz - pivot[2], h = sampler.near(x, z);
      if (h === null) throw new Error(`${id}/${P.id}: seam row point (${wx.toFixed(4)}, ${wz.toFixed(4)}) is off the baked top`); return [x, h + PATH_LIFT, z]; });
    const R0 = seamRowOf(E.start, 0), R1 = seamRowOf(E.end, n - 1);
    // point i's own row reaches a seam row (some vertex within 2 cm of it, or past it, along the path): dropped
    const reaches = (i, S, Q, sign) => { if (!S || Math.hypot(pts[i][0] - Q[3][0], pts[i][1] - Q[3][2]) > 3) return false; const [tx, tz] = tangent(i);
      return offsAt(i).some((o, k) => sign * ((pts[i][0] - tz * o - Q[k][0]) * S.dir[0] + (pts[i][1] + tx * o - Q[k][2]) * S.dir[1]) <= 0.02); };
    const rows = [], pin = new Set();
    const flush = () => { if (rows.length > 1) emit(rows, pin); rows.length = 0; pin.clear(); };
    if (R0) { pin.add(0); rows.push(R0); }
    for (let i = R0 ? 1 : 0; i < (R1 ? n - 1 : n); i++) {
      if (reaches(i, E.start, R0, 1) || reaches(i, E.end, R1, -1)) continue;
      const [tx, tz] = tangent(i), R = section(pts[i][0], pts[i][1], tx, tz, pts[i > 0 ? i - 1 : i + 1], i < n / 2 ? 1 : -1, offsAt(i));
      if (!R) { flush(); continue; }
      rows.push(R);
    }
    if (R1) { pin.add(rows.length); rows.push(R1); }
    flush();
    if (!idx.length) continue;
    const nor = new Float32Array(pos.length);   // area-weighted vertex normals (three computeVertexNormals on the indexed ribbon)
    for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2], ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2],
      vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2], n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nor[v * 3 + k] += n[k]; }
    for (let v = 0; v < nor.length; v += 3) { const l = Math.hypot(nor[v], nor[v + 1], nor[v + 2]); if (l > 1e-12) { nor[v] /= l; nor[v + 1] /= l; nor[v + 2] /= l; } else nor.set([0, 1, 0], v); }
    let name = 'path_' + P.id; for (let k = 2; used.has(name); k++) name = `path_${P.id}_${k}`; used.add(name);
    const prim = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', new Float32Array(pos))).setAttribute('NORMAL', acc('VEC3', nor)).setAttribute('COLOR_0', acc('VEC4', new Float32Array(col)))
      .setIndices(acc('SCALAR', pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx))).setMaterial(material);
    const mesh = doc.createMesh(name).addPrimitive(prim).setExtras({ lift: PATH_LIFT, path: P.id, leadsTo: P.leadsTo ?? null, needs: P.needs || [] });
    root.addChild(doc.createNode(name).setMesh(mesh)); tris += idx.length / 3;
  }
  function clear(rows, pinned) {   // raise vertices under a crest: each edge midpoint / quad centre below top + PATH_CLEAR lifts its corners (a pinned row's stay)
    for (let it = 0; it < 12; it++) {
      const up = rows.map(() => new Array(7).fill(0)); let any = false;
      const need = (vs) => { const n = vs.length, x = vs.reduce((s, [r, k]) => s + rows[r][k][0], 0) / n, y = vs.reduce((s, [r, k]) => s + rows[r][k][1], 0) / n, z = vs.reduce((s, [r, k]) => s + rows[r][k][2], 0) / n, h = sampler(x, z);
        const d = h === null ? 0 : h + PATH_CLEAR - y; if (d > 1e-6) { any = true; for (const [r, k] of vs) up[r][k] = Math.max(up[r][k], d); } };
      for (let r = 0; r < rows.length; r++) for (let k = 0; k < 7; k++) {
        if (k < 6) need([[r, k], [r, k + 1]]);
        if (r + 1 < rows.length) { need([[r, k], [r + 1, k]]);
          if (k < 6) { need([[r, k + 1], [r + 1, k]]); need([[r, k], [r, k + 1], [r + 1, k]]); need([[r, k + 1], [r + 1, k + 1], [r + 1, k]]); } }   // + the quad's diagonal midpoint and its two triangle centroids
      }
      if (!any) break;
      for (let r = 0; r < rows.length; r++) if (!pinned.has(r)) for (let k = 0; k < 7; k++) rows[r][k][1] += up[r][k];
    }
  }
  return { doc, tris };
}

// ---- plant GLBs: the two flat models still built here (the painterly trees / bushes are copied, the card shrubs and the ground
//      cover built by lib/plantkit.mjs, both in export-composition.mjs). The plants.mjs trees, shrubs and the assets/*.mjs bushes
//      with their baked crown ramp, canopy-lift gain and live-ramp attributes went with the painterly trees (plan Task 9) ----
function newDoc(id) {
  const doc = new Document(); doc.getRoot().getAsset().generator = 'gitaway export-composition';
  const buffer = doc.createBuffer(), scene = doc.createScene(id); doc.getRoot().setDefaultScene(scene);
  const material = doc.createMaterial('plant').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1);   // single-sided, opaque
  return { doc, buffer, scene, material };
}
function addMesh(D, name, pos, nor, col, idx) {
  const acc = (type, arr) => D.doc.createAccessor().setType(type).setBuffer(D.buffer).setArray(arr);
  const prim = D.doc.createPrimitive().setAttribute('POSITION', acc('VEC3', new Float32Array(pos))).setAttribute('NORMAL', acc('VEC3', new Float32Array(nor)))
    .setAttribute('COLOR_0', acc('VEC3', new Float32Array(col))).setMaterial(D.material);
  if (idx) prim.setIndices(acc('SCALAR', new Uint16Array(idx)));
  return D.doc.createMesh(name).addPrimitive(prim);
}
// a builder-style procedural asset (assets/*.mjs parts) flattened into one non-indexed, flat-shaded, vertex-coloured mesh
function flatDoc(id, parts, colourOfPart) {
  const pos = [], col = [];
  for (const p of parts) { const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry, a = g.attributes.position.array, c = colourOfPart(p);
    for (let i = 0; i < a.length; i += 3) { pos.push(a[i], a[i + 1], a[i + 2]); col.push(c[0], c[1], c[2]); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();   // non-indexed: per-face normals (= builder.mjs mergeFlat)
  const D = newDoc(id), root = D.doc.createNode(id).setMesh(addMesh(D, id, pos, Array.from(g.attributes.normal.array), col, null)); D.scene.addChild(root);
  return { doc: D.doc, tris: pos.length / 9 };
}
function flowerDoc(id) {
  const g = new THREE.IcosahedronGeometry(0.06, 0), a = g.attributes.position.array, pos = [], nor = [], col = [];
  for (let k = 0; k < a.length; k += 3) { const l = Math.hypot(a[k], a[k + 1], a[k + 2]), nx = a[k] / l, ny = a[k + 1] / l, nz = a[k + 2] / l, m = Math.hypot(nx, ny / 0.8, nz);
    pos.push(a[k], a[k + 1] * 0.8, a[k + 2]); nor.push(nx / m, ny / 0.8 / m, nz / m); col.push(1, 1, 1); }   // smooth heads (proof flowerGeo) x the 0.8 y-squash, normals inverse-transposed
  const D = newDoc(id), root = D.doc.createNode(id).setMesh(addMesh(D, id, pos, nor, col, null)); D.scene.addChild(root);
  return { doc: D.doc, tris: pos.length / 9 };
}

// the flat plant assets still built here: { id: { doc, tris, notes } } (grass_tuft, flower_head)
export function plantAssets(L, A) {
  const tuft = linHex(L.palette[A.look.terrain.tuft]), out = {};
  out.grass_tuft = { ...flatDoc('grass_tuft', grassTuft.build().parts, () => tuft), notes: `assets/grass_tuft.mjs geometry, palette ${A.look.terrain.tuft} (the proof's tuft colour) as COLOR_0; the proof sways it in a shader` };
  out.flower_head = { ...flowerDoc('flower_head'), notes: 'drift flower head: smooth 0.06 icosahedron, 0.8 y-squash baked, white COLOR_0 (colour per instance); yOffset 0.075' };
  return out;
}
