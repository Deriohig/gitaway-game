// bake.mjs -- BAKED BLUEPRINT PIECES for the game (used by bake-pieces.mjs and tests/bake.test.mjs).
// =============================================================================
// One LOW-RESOLUTION build of the island core (buildBlueprint(A, L, { res: PROFILE })): the same heightfield, outlines, zones,
// seams and docked positions as the default build, sampled coarser. Neighbouring pieces still draw every shared vertex (MAIN's rim
// + cone, the seam polylines, the seam-wall columns) from ONE store, so the seams stay exact by construction, every piece stays
// closed, and MAIN's flat zones stay flat. Each piece becomes:
//   piece_<id>.glb         one node + one mesh `piece_<id>`, one primitive, one opaque material, POSITION (float32, piece-local:
//                          pivot = the piece's dockedPosition in config/blueprint.pieces.json), NORMAL (float32: smooth on grass,
//                          flat on rock), COLOR_0 (normalized UNSIGNED_BYTE vec3, LINEAR, the default look preset's terrain paint),
//                          uint16 indices; faces sorted by tag, mesh extras.faceRanges = { top: [firstTri, count], coast, under,
//                          seam, inner, cone } (the top surface = the walkable ground)
//   piece_<id>.height.bin  Float32 little-endian height grid sampled from the BAKED top faces (props sit on what is rendered):
//                          spacing 0.25 u, origin [x0, z0] (piece-local), size [nx, nz], row-major with x fastest
//                          (value(i, j) = grid[j * nx + i] at x0 + i * 0.25, z0 + j * 0.25); NaN where (x, z) is off the top
//   a manifest entry       piece_<id>: { file, status, tris, notes, height: { file, origin, spacing, size } }
// Deterministic: same inputs -> byte-identical files.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import GT from './terrain.mjs';
import LOOK from '../../config/look.config.mjs';
import WORLD3 from '../../config/world.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(__dirname, '../../config');

// THE BAKE PROFILE (terrain.mjs buildBlueprint opts.res): terrain.mjs BAKE_RES (the per-key reasons are there), with the underside
// scale from world.config (underside.gameScale, so blueprint.pieces.json depth / bottomLocal agree). The core keeps it, because its
// cover stands on the game's ground (terrain.mjs gameGround, plan Task 7)
export const PROFILE = GT.bakeProfile(WORLD3.archipelago);
export const SPACING = GT.GAME_GROUND_SPACING;
export const COLOR_BITS = 8;    // COLOR_0 = normalized UNSIGNED_BYTE (linear; max error 1.08 sRGB levels on this palette, darkest 0.059) (16 -> UNSIGNED_SHORT)

const TAGN = Object.keys(GT.TAG);

export function lookPresets() { return JSON.parse(fs.readFileSync(path.join(CONFIG, 'lookPresets.json'), 'utf8')); }

// exact sampler on the baked top faces (float32 local positions): (x, z) -> y, or null off the top (the core's, which gameGround uses too)
export const topSampler = GT.gridTopSampler;

// welded mesh arrays for a list of the piece's faces: corners that share the core vertex AND the exact (float32) normal AND the
// quantized colour become one vertex
function weld(pc, list, NOR, COL, colorBits) {
  const qmax = colorBits === 16 ? 65535 : 255, q = (v) => Math.round(Math.min(1, Math.max(0, v)) * qmax);
  const key2v = new Map(), vp = [], vn = [], vc = [], idx = new Uint32Array(list.length * 3), f32 = new Float32Array(3), POS = pc.positions;
  list.forEach((t, s) => {
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3, vi = pc.faces[t * 3 + k], r = q(COL[o]), g = q(COL[o + 1]), b = q(COL[o + 2]);
      f32[0] = NOR[o]; f32[1] = NOR[o + 1]; f32[2] = NOR[o + 2];
      const key = vi + '|' + f32[0] + '|' + f32[1] + '|' + f32[2] + '|' + r + '|' + g + '|' + b;
      let v = key2v.get(key);
      if (v === undefined) { v = vp.length / 3; key2v.set(key, v); vp.push(POS[o], POS[o + 1], POS[o + 2]); vn.push(f32[0], f32[1], f32[2]); vc.push(r, g, b); }
      idx[s * 3 + k] = v;
    }
  });
  return { vp, vn, vc, idx, nV: vp.length / 3 };
}
function primitive(doc, buf, w, mat, colorBits) {
  const pos = doc.createAccessor().setType('VEC3').setArray(Float32Array.from(w.vp)).setBuffer(buf);
  const nor = doc.createAccessor().setType('VEC3').setArray(Float32Array.from(w.vn)).setBuffer(buf);
  const col = doc.createAccessor().setType('VEC3').setArray(colorBits === 16 ? Uint16Array.from(w.vc) : Uint8Array.from(w.vc)).setNormalized(true).setBuffer(buf);
  const ind = doc.createAccessor().setType('SCALAR').setArray(w.nV <= 65535 ? Uint16Array.from(w.idx) : w.idx).setBuffer(buf);
  return doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nor).setAttribute('COLOR_0', col).setIndices(ind).setMaterial(mat);
}

// one piece -> { glb, height, entry, stats }
async function bakeOne(bp, id, colors, normals, presetName, colorBits) {
  const pc = bp.pieces[id], nf = pc.faceCount, NOR = normals ? normals[id] : pc.normals, COL = colors[id];
  // the piece's own (closed) mesh: every face but the skirts, sorted by tag (stable), top first, so faceRanges are contiguous
  const order = Array.from({ length: nf }, (_, t) => t).filter((t) => pc.tags[t] !== GT.TAG.skirt).sort((a, b) => pc.tags[a] - pc.tags[b] || a - b);
  const faceRanges = {}; order.forEach((t, s) => { const tg = TAGN[pc.tags[t]]; if (!faceRanges[tg]) faceRanges[tg] = [s, 0]; faceRanges[tg][1]++; });
  const w = weld(pc, order, NOR, COL, colorBits);
  const doc = new Document(); doc.getRoot().getAsset().generator = 'gitaway-art-pipeline bake-pieces';
  const buf = doc.createBuffer(), name = 'piece_' + id;
  const mat = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1).setAlphaMode('OPAQUE').setDoubleSided(false);
  const mesh = doc.createMesh(name).addPrimitive(primitive(doc, buf, w, mat, colorBits)).setExtras({ piece: id, dockedPosition: pc.pivot, faceRanges, colorSpace: 'linear', look: presetName });
  const node = doc.createNode(name).setMesh(mesh), scene = doc.createScene(name).addChild(node);
  // open-seam skirts: child node + mesh skirt_<neighbour> (same material), shown while that neighbour is not docked
  let skirtTris = 0; const skirtStats = {};
  for (const sk of pc.skirts || []) {
    const list = []; for (let t = sk.from; t < sk.to; t++) list.push(t);
    const sw = weld(pc, list, NOR, COL, colorBits), sname = 'skirt_' + sk.nb;
    const smesh = doc.createMesh(sname).addPrimitive(primitive(doc, buf, sw, mat, colorBits)).setExtras({ piece: id, skirtOf: sk.nb, show: `while ${sk.nb} is not docked; hide when ${sk.nb} starts rising` });
    node.addChild(doc.createNode(sname).setMesh(smesh)); skirtTris += list.length; skirtStats[sk.nb] = list.length;
  }
  doc.getRoot().setDefaultScene(scene);
  const glb = await new NodeIO().writeBinary(doc);
  // height grid from the baked top (the exact float32 positions written above)
  const P = Float32Array.from(w.vp), tops = []; order.forEach((t, s) => { if (pc.tags[t] === GT.TAG.top) tops.push(s); });
  const hg = GT.heightGridOf(P, w.idx, tops, SPACING), [x0, z0] = hg.origin, [nx, nz] = hg.size, finite = hg.finite;
  const height = Buffer.alloc(nx * nz * 4), dv = new DataView(height.buffer, height.byteOffset, height.byteLength);
  for (let k = 0; k < nx * nz; k++) dv.setFloat32(k * 4, hg.grid[k], true);
  const skirtNote = (pc.skirts || []).length ? `; child nodes ${(pc.skirts || []).map((q) => 'skirt_' + q.nb).join(' + ')} (open-seam cliff skirts: show skirt_<X> while X is not docked, hide it when X starts rising)` : '';
  const entry = { file: name + '.glb', status: 'ready', tris: order.length + skirtTris,
    notes: `baked blueprint piece (art/scripts/bake-pieces.mjs): piece-local, pivot = dockedPosition [${pc.pivot.join(', ')}] in art/config/blueprint.pieces.json; COLOR_0 linear (${presetName} paint); top faces first (mesh extras.faceRanges); height grid Float32 LE, x fastest, NaN off the top${skirtNote}`,
    height: { file: name + '.height.bin', origin: [x0, z0], spacing: SPACING, size: [nx, nz] } };
  return { glb, height, entry, stats: { tris: order.length + skirtTris, skirtTris, skirts: skirtStats, verts: w.nV, kb: glb.byteLength / 1024, grid: [nx, nz], finite, faceRanges } };
}

// bake every piece (in memory). opts.profile / opts.colorBits override PROFILE / COLOR_BITS (experiments only).
export async function bakePieces(opts = {}) {
  const A = WORLD3.archipelago, LP = lookPresets(), presetName = LP.default, preset = LP.presets[presetName];
  const full = GT.buildBlueprint(A, LOOK, {});                 // the default build: the composition (trees, water) the paint reads
  const comp = GT.composeBlueprint(full, LOOK);
  const bp = GT.buildBlueprint(A, LOOK, { res: opts.profile || PROFILE });
  const colors = GT.paintBlueprint(bp, comp, preset, LOOK);   // the proof's default look (grass variation + warm stone)
  const normals = preset.grass && preset.grass.enabled && preset.grass.seamMatch ? GT.seamLipNormals(bp) : null;
  const pieces = {};
  for (const id of bp.order) pieces[id] = await bakeOne(bp, id, colors, normals, presetName, opts.colorBits || COLOR_BITS);
  return { order: bp.order, pieces, bp, full, comp, presetName };
}

// the baked pieces' lowest points (piece-local y; the bake-resolution build at the game's hanging scale), for exportBlueprint's
// depth / bottomLocal (blueprint.pieces.json == the GLBs, bake.test B13a). `bake` = an existing bake-resolution build, if at hand.
export function gameBottoms(bake) {
  const b = bake || GT.buildBlueprint(WORLD3.archipelago, LOOK, { res: PROFILE });
  return Object.fromEntries(b.order.map((id) => [id, b.pieces[id].bottom]));
}

export default { PROFILE, SPACING, bakePieces, topSampler, gameBottoms };
