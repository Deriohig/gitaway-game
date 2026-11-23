// finish.mjs --pad, --maxKB and --fold on synthetic models (no Meshy files needed).
//   F1 --pad: texels are weighted by UV coverage, so island edges keep their colour and the outside is padded (no dark fringe)
//   F2 without --pad the old box filter is unchanged (what F1 guards against)
//   F3 --maxKB steps the JPEG quality down by 5 until the file fits, never below q70
//   F4 --maxKB that q70 cannot meet exits non-zero, never a silent over-cap file
//   F5 --fold s bends a flat sheet into a shallow V about its centre line, normals tilted to match
import { Document, NodeIO } from '@gltf-transform/core';
import jpeg from 'jpeg-js';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const finish = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'meshy', 'finish.mjs');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-crops-')), at = (f) => path.join(tmp, f);

// one mesh / one primitive with a JPEG base colour, like a raw Meshy GLB; `paint(x, y)` colours the albedo's u < island part, black outside
async function glb(file, { P, U, I, size, island = 1, paint = () => [160, 160, 160], q = 95 }) {
  const doc = new Document(), buf = doc.createBuffer(), acc = (t, a) => doc.createAccessor().setType(t).setArray(a).setBuffer(buf), px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) px.set([...(x < island * size ? paint(x, y) : [0, 0, 0]), 255], (y * size + x) * 4);
  const tex = doc.createTexture('albedo').setMimeType('image/jpeg').setImage(new Uint8Array(jpeg.encode({ data: px, width: size, height: size }, q).data));
  const prim = doc.createPrimitive().setMaterial(doc.createMaterial('m').setBaseColorTexture(tex)).setAttribute('POSITION', acc('VEC3', new Float32Array(P)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(P.map((_, i) => (i % 3 === 2 ? 1 : 0))))).setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(U))).setIndices(acc('SCALAR', new Uint32Array(I)));
  doc.createScene().addChild(doc.createNode('raw').setMesh(doc.createMesh('raw').addPrimitive(prim)));
  await new NodeIO().write(file, doc);
}
const quad = (file, size, island, paint) => glb(file, { size, island, paint, P: [-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], U: [0, 1, island, 1, island, 0, 0, 0], I: [0, 1, 2, 0, 2, 3] });
const albedo = async (file) => jpeg.decode(Buffer.from((await new NodeIO().read(file)).getRoot().listTextures()[0].getImage()), { useTArray: true, formatAsRGBA: true });
const run = (args) => execFileSync('node', [finish, ...args], { encoding: 'utf8' });
const KEEP = ['--height', '1', '--lift', '1', '--terra', '1'];   // no grade: texels come through as painted

// F1 / F2: flat colour on island u 0..0.4375 of a 64 px albedo; --tex 8 averages 8 x 8 blocks, so output column 3 is half island, half black
const COL = [200, 140, 90], IN1 = at('flat.glb');
await quad(IN1, 64, 0.4375, () => COL);
{ const O = at('pad.glb'); run([IN1, O, ...KEEP, '--tex', '8', '--q', '95', '--pad']);
  const a = await albedo(O); let worst = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(a.data[(y * a.width + x) * 4 + k] - COL[k]));
  ok('F1 --pad: every texel keeps the island colour (edge not darkened, outside padded)', worst <= 14, `worst channel error ${worst}`); }
{ const O = at('nopad.glb'); run([IN1, O, ...KEEP, '--tex', '8', '--q', '95']);
  const a = await albedo(O), edge = a.data[(4 * a.width + 3) * 4], out = a.data[(4 * a.width + 6) * 4];
  ok('F2 without --pad the half-covered edge texel darkens, the outside stays black', edge < COL[0] - 40 && out < 30, `edge red ${edge}, outside red ${out}`); }

// F3 / F4: a noisy 512 px albedo, so the JPEG size follows the quality
const IN2 = at('noisy.glb'); let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
await quad(IN2, 512, 0.5, () => [80 + rnd() * 150, 60 + rnd() * 120, 40 + rnd() * 90]);
const kb = (f) => fs.statSync(f).size / 1024, args2 = (O, q, extra = []) => [IN2, O, ...KEEP, '--tex', '512', '--q', String(q), ...extra];
run(args2(at('q85.glb'), 85)); run(args2(at('q70.glb'), 70));
const k85 = kb(at('q85.glb')), k70 = kb(at('q70.glb')), cap = (k85 + k70) / 2;
{ const O = at('capped.glb'); run(args2(O, 85, ['--maxKB', cap.toFixed(1)])); const k = kb(O);
  ok('F3 --maxKB: quality steps down until the file fits, not below q70', k <= cap && k >= k70 - 0.5 && k < k85, `q85 ${k85.toFixed(1)}, q70 ${k70.toFixed(1)}, cap ${cap.toFixed(1)} -> ${k.toFixed(1)} KB`); }
{ const r = spawnSync('node', [finish, ...args2(at('toolow.glb'), 85, ['--maxKB', (k70 * 0.5).toFixed(1)])], { encoding: 'utf8' });
  ok('F4 --maxKB below what q70 gives: non-zero exit', r.status !== 0, `exit ${r.status}`); }

// F5: flat sheet (x -1, 0, 1; y 0..1; z 0) folded by 0.5: sides go back 0.5, the centre line stays, side normals ~(+-0.45, 0, 0.89)
const P = [], U = []; for (const y of [0, 1]) for (const x of [-1, 0, 1]) { P.push(x, y, 0); U.push((x + 1) / 2, 1 - y); }
await glb(at('sheet.glb'), { size: 8, q: 90, P, U, I: [0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4] });
{ const O = at('fold.glb'); run([at('sheet.glb'), O, ...KEEP, '--tex', '8', '--fold', '0.5']);
  const p = (await new NodeIO().read(O)).getRoot().listMeshes()[0].listPrimitives()[0], Q = p.getAttribute('POSITION').getArray(), N = p.getAttribute('NORMAL').getArray();
  let zmin = Infinity, zmax = -Infinity, nOk = true; const xs = [];
  for (let i = 0; i < Q.length / 3; i++) { zmin = Math.min(zmin, Q[i * 3 + 2]); zmax = Math.max(zmax, Q[i * 3 + 2]); xs.push(Q[i * 3]);
    const sx = Math.sign(Q[i * 3]), h = Math.hypot(0.5, 1); if (sx && Math.hypot(N[i * 3] - sx * 0.5 / h, N[i * 3 + 1], N[i * 3 + 2] - 1 / h) > 0.02) nOk = false; }
  const w = Math.max(...xs) - Math.min(...xs);
  ok('F5 --fold 0.5: the flat sheet bends into a V (sides 0.5 x half-width back) with matching normals', Math.abs((zmax - zmin) / (w / 2) - 0.5) < 0.02 && nOk, `width ${w.toFixed(3)}, depth ${(zmax - zmin).toFixed(3)}`); }

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nfinish-crops: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
