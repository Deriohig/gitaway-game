// finish-roof.test.mjs -- finish.mjs --roof on a synthetic house (no Meshy files needed): a box with a gable roof whose two slopes sample a terracotta patch of the atlas, a terracotta ridge cap
// above them and a terracotta-ish (brown) step at the base. --roof moves the two slopes (and only them) into a `Roof` primitive with its own tiling texture and planar UVs (u along the eave,
// v up the slope, v = 0 on the eave, texel density from --roofTile, colour matched to the old texels).   node tests/finish-roof.test.mjs
import { Document, NodeIO } from '@gltf-transform/core';
import jpeg from 'jpeg-js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), finish = path.join(here, '..', 'meshy', 'finish.mjs');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-roof-'));

// the atlas: 64 x 64, left half cream wall (u < 0.5), top-right quarter terracotta (roof), bottom-right quarter brown wood (the step)
const AW = 64, apx = new Uint8Array(AW * AW * 4);
for (let y = 0; y < AW; y++) for (let x = 0; x < AW; x++) apx.set(x < 32 ? [225, 212, 190, 255] : y < 32 ? [196, 92, 58, 255] : [120, 78, 44, 255], (y * AW + x) * 4);
const WALL = [0.25, 0.5], ROOF = [0.75, 0.25], WOOD = [0.75, 0.75];
// the house: walls 2 x 1 x 1.6 (x -1..1, y 0..1, z -0.8..0.8), gable roof from the eaves (y 1, z +-0.8) to the ridge (y 1.8, z 0), a ridge cap
// box above the ridge, a step slab at the front. Every face its own 3 vertices (flat normals), UVs at one point of its colour patch
const P = [], N = [], UV = [], I = [];
let bend = null;   // while set, vertex normals lean by bend(p) (Meshy's smoothed normals, which shade one slope unevenly)
const tri = (a, b, c, uv) => { const u = b.map((v, k) => v - a[k]), w = c.map((v, k) => v - a[k]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n);
  for (const p of [a, b, c]) { I.push(P.length / 3); P.push(...p); const m = n.map((x, k) => x / l + (bend ? bend(p)[k] : 0)), lm = Math.hypot(...m); N.push(...m.map((x) => x / lm)); UV.push(...uv); } };
const quad = (a, b, c, d, uv) => { tri(a, b, c, uv); tri(a, c, d, uv); };
const box = (x0, x1, y0, y1, z0, z1, uv) => {
  quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uv); quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uv);
  quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uv); quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uv);
  quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], uv); quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], uv); };
box(-1, 1, 0, 1, -0.8, 0.8, WALL);
tri([1, 1, 0.8], [1, 1, -0.8], [1, 1.8, 0], WALL); tri([-1, 1, -0.8], [-1, 1, 0.8], [-1, 1.8, 0], WALL);   // gable ends
// the slopes, each split into a 4 x 3 grid of quads (Meshy's big flat triangles, plus shared edges for the region growing). The front's
// left column is a verge sitting RAISE proud of the slope (the farmhouse's left verge), joined to it by step faces (risers) running from
// the eave to the ridge; every slope normal leans (Meshy's smoothing): both made a diagonal band of another colour on the real roof
const RAISE = 0.06, NF = [0, Math.SQRT1_2, Math.SQRT1_2];
const slope = (zs) => { const at = (i, j, up) => { const p = [-1 + 2 * i / 4, 1 + 0.8 * j / 3, zs * 0.8 * (1 - j / 3)]; return up ? p.map((v, k) => v + RAISE * NF[k]) : p; };
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const up = zs > 0 && i === 0;
    zs > 0 ? quad(at(i, j, up), at(i + 1, j, up), at(i + 1, j + 1, up), at(i, j + 1, up), ROOF) : quad(at(i + 1, j), at(i, j), at(i, j + 1), at(i + 1, j + 1), ROOF); }
  if (zs > 0) for (let j = 0; j < 3; j++) quad(at(1, j), at(1, j + 1), at(1, j + 1, true), at(1, j, true), ROOF); };   // the risers (facing +x)
bend = (p) => [0.25 * p[0], 0, 0]; slope(1); slope(-1); bend = null;
box(-1.02, 1.02, 1.78, 1.9, -0.07, 0.07, ROOF);   // ridge cap: terracotta, but its top is flat and its sides vertical: not a slope
// the cap's lip: a face standing on the front slope (from its surface up 8 cm), running ALONG the ridge, with slope on both sides of it
// in the plane (the slope runs on under the cap): it must stay with the cap, not join the roof as a seam step
quad([-1.02, 1.62, 0.18], [1.02, 1.62, 0.18], [1.02, 1.7, 0.18], [-1.02, 1.7, 0.18], ROOF);
// a sloped brown step at the base (sloped like the roof, brownish = the "terracotta" hue band) that must stay in the body
quad([-0.4, 0.05, 1.1], [0.4, 0.05, 1.1], [0.4, 0.2, 0.95], [-0.4, 0.2, 0.95], WOOD);
const doc = new Document(), buf = doc.createBuffer(), acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
const tex = doc.createTexture('albedo').setMimeType('image/jpeg').setImage(new Uint8Array(jpeg.encode({ data: apx, width: AW, height: AW }, 95).data));
const prim = doc.createPrimitive().setMaterial(doc.createMaterial('m').setBaseColorTexture(tex))
  .setAttribute('POSITION', acc('VEC3', new Float32Array(P))).setAttribute('NORMAL', acc('VEC3', new Float32Array(N)))
  .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(UV))).setIndices(acc('SCALAR', new Uint32Array(I)));
doc.createScene().addChild(doc.createNode('raw').setMesh(doc.createMesh('raw').addPrimitive(prim)));
const IN = path.join(tmp, 'raw.glb'), OUT = path.join(tmp, 'house.glb'), PLAIN = path.join(tmp, 'plain.glb');
await new NodeIO().write(IN, doc);
const T0 = I.length / 3, SLOPE_T = 2 * 4 * 3 * 2, RISER_T = 3 * 2;

// the tile texture: 64 x 64, grey stripes (a tile row's lower edge = a dark line at the bottom of each 16 px band), so the colour match
// has something to move: the output's mean must come out near the roof patch's terracotta
const TW = 64, tpx = new Uint8Array(TW * TW * 4);
for (let y = 0; y < TW; y++) for (let x = 0; x < TW; x++) { const v = y % 16 === 15 ? 60 : 150 + ((x >> 3) & 1) * 20; tpx.set([v, v, v, 255], (y * TW + x) * 4); }
const TILE = path.join(tmp, 'tiles.jpg'); fs.writeFileSync(TILE, jpeg.encode({ data: tpx, width: TW, height: TW }, 95).data);

// --height 1.9 keeps the house's own size (base y 0, ridge cap top 1.9); one texture repeat = 0.5 u along the eave x 0.4 u up the slope
const run = (out, extra) => execFileSync('node', [finish, IN, out, '--height', '1.9', '--tex', '64', '--lift', '1', '--terra', '1', ...extra], { encoding: 'utf8' });
run(PLAIN, []);
const log = run(OUT, ['--roof', TILE, '--roofTile', '0.5,0.4']);
const d = await new NodeIO().read(OUT), r = d.getRoot(), mesh = r.listMeshes().find((m) => m.getName() === 'house');
const prims = mesh ? mesh.listPrimitives() : [], roofP = prims.find((p) => p.getMaterial() && p.getMaterial().getName() === 'Roof'), bodyP = prims.find((p) => p.getMaterial() && p.getMaterial().getName() === 'house');
const C = {}, info = [];   // one result: each check is a key, the failing ones are listed
const texOf = (p) => p.getMaterial().getBaseColorTexture();
C['R1 a `Roof` primitive on the body mesh, its own baseColor texture (not the atlas), REPEAT wrap'] = !!roofP && !!bodyP && !!texOf(roofP) && texOf(roofP) !== texOf(bodyP) && roofP.getMaterial().getBaseColorTextureInfo().getWrapS() === 10497 && roofP.getMaterial().getBaseColorTextureInfo().getWrapT() === 10497;
const normalOf = (P, I, k) => { const p = [0, 1, 2].map((j) => [P[I[k + j] * 3], P[I[k + j] * 3 + 1], P[I[k + j] * 3 + 2]]), e1 = p[1].map((v, q) => v - p[0][q]), e2 = p[2].map((v, q) => v - p[0][q]);
  return { p, n: [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]] }; };
if (roofP && bodyP) {
  const tris = (p) => p.getIndices().getCount() / 3, rT = tris(roofP), bT = tris(bodyP);
  C['R2 exactly the slopes move (the raised verge and its step faces with them): the ridge cap and the brown step stay'] = rT === SLOPE_T + RISER_T && bT === T0 - SLOPE_T - RISER_T; info.push(`roof ${rT} (want ${SLOPE_T + RISER_T}), body ${bT} (want ${T0 - SLOPE_T - RISER_T})`);
  // planar UVs: on each slope v depends only on the distance up the slope (rows level; the verge maps like the slope under it), u on x only (columns plumb), at the --roofTile scale
  const RP = roofP.getAttribute('POSITION').getArray(), RU = roofP.getAttribute('TEXCOORD_0').getArray(), RN = roofP.getAttribute('NORMAL').getArray(), RI = roofP.getIndices().getArray();
  const S2 = Math.SQRT1_2, UPS = { 1: [0, S2, -S2], [-1]: [0, S2, S2] };   // up the slope: the front (normal +z) climbs toward -z
  const verts = []; for (let i = 0; i < RP.length / 3; i++) { const side = Math.sign(RN[i * 3 + 2]), s = UPS[side];
    verts.push({ x: RP[i * 3], u: RU[i * 2], v: RU[i * 2 + 1], side, d: s ? RP[i * 3] * s[0] + RP[i * 3 + 1] * s[1] + RP[i * 3 + 2] * s[2] : NaN }); }
  let worst = 0, uBad = 0; const eaveV = [];
  for (const side of [1, -1]) { const vs = verts.filter((q) => q.side === side), dmin = Math.min(...vs.map((q) => q.d)), k = vs.map((q) => q.v + (q.d - dmin) / 0.4), ku = vs.map((q) => q.u - side * q.x / 0.5);
    for (const x of k) worst = Math.max(worst, Math.abs(x - k[0])); for (const q of vs) if (q.d - dmin < 1e-4) eaveV.push(q.v); for (const q of ku) uBad = Math.max(uBad, Math.abs(q - ku[0])); }
  C['R3 v runs up the slope at 1 / 0.4 per unit, level along the eave, an integer on the eave (a row edge there)'] = worst < 1e-3 && eaveV.length > 0 && eaveV.every((v) => Math.abs(v - Math.round(v)) < 1e-3);
  C["R4 u runs along the eave at 1 / 0.5 per unit (texture upright seen from each side: u grows to the viewer's right)"] = uBad < 1e-3; info.push(`v spread ${worst.toExponential(2)}, u spread ${uBad.toExponential(2)}`);
  // one flat normal per slope: the verge and the risers shade exactly like the slope (Meshy's leaning normals made a band of another colour)
  let nBad = 0; for (let i = 0; i < RP.length / 3; i++) { const side = Math.sign(RN[i * 3 + 2]) || 1, want = [0, S2, side * S2]; nBad = Math.max(nBad, Math.hypot(RN[i * 3] - want[0], RN[i * 3 + 1] - want[1], RN[i * 3 + 2] - want[2])); }
  C["R9 every roof vertex carries its slope's one normal (uniform shading across the slope, the verge and its step)"] = nBad < 1e-3;
  // the vertical step faces between the raised verge and the slope join the roof (no strip of old paint along the seam)
  let steps = 0; for (let k = 0; k < RI.length; k += 3) { const { n } = normalOf(RP, RI, k); if (Math.abs(n[0]) / (Math.hypot(...n) || 1) > 0.9) steps++; }
  C['R10 the step faces between the raised verge and the slope join the roof'] = steps === RISER_T;
  // the cap's lip (standing on the slope, along the ridge) stays in the body, not tiled as a seam step
  const BP = bodyP.getAttribute('POSITION').getArray(), BI = bodyP.getIndices().getArray(); let lip = 0;
  for (let k = 0; k < BI.length; k += 3) { const { p, n } = normalOf(BP, BI, k), cy = (p[0][1] + p[1][1] + p[2][1]) / 3; if (n[2] / (Math.hypot(...n) || 1) > 0.99 && cy > 1.6 && cy < 1.72) lip++; }
  C["R11 the ridge cap's lip (standing on the slope, running along the ridge) stays in the body"] = lip === 2;
  // the colour match: the roof texture's mean is the old roof texels' (196, 92, 58) within a few levels
  const rimg = jpeg.decode(Buffer.from(texOf(roofP).getImage()), { useTArray: true, formatAsRGBA: true });
  const mean = [0, 1, 2].map((k) => { let s = 0; for (let o = k; o < rimg.data.length; o += 4) s += rimg.data[o]; return s / (rimg.data.length / 4); });
  C['R5 the tile texture is colour-matched to the roof texels it replaces (mean within 8 levels of 196, 92, 58)'] = Math.abs(mean[0] - 196) < 8 && Math.abs(mean[1] - 92) < 8 && Math.abs(mean[2] - 58) < 8; info.push(`mean ${mean.map((v) => v.toFixed(1)).join(', ')}`);
  // the roof vertices sit exactly where the slopes were (positions unchanged), with their own TEXCOORD_0
  const PP = (await new NodeIO().read(PLAIN)).getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION').getArray(), key = (A, i) => [0, 1, 2].map((k) => Math.round(A[i * 3 + k] * 1e4)).join(',');
  const keys = new Set(); for (let i = 0; i < PP.length / 3; i++) keys.add(key(PP, i));
  let off = 0; for (let i = 0; i < RP.length / 3; i++) if (!keys.has(key(RP, i))) off++;
  C['R6 the roof vertices sit exactly where the slopes were (no crack, nothing moved); the roof has its own TEXCOORD_0'] = !off && roofP.getAttribute('TEXCOORD_0') !== bodyP.getAttribute('TEXCOORD_0');
  C['R7 the log reports the roof regions'] = /roof: \d+ region/.test(log);
}
C['R8 without --roof: no Roof material'] = !(await new NodeIO().read(PLAIN)).getRoot().listMaterials().some((m) => m.getName() === 'Roof');
{ const bad = Object.keys(C).filter((k) => !C[k]); ok(`finish.mjs --roof on a synthetic house: ${Object.keys(C).length} checks (R1-R11)`, !bad.length, (bad.length ? 'failed: ' + bad.join('; ') + ' | ' : '') + `materials ${prims.map((p) => p.getMaterial() && p.getMaterial().getName()).join(', ')}; ${info.join('; ')}`); }

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
