// finish.mjs --part / --cut / --lower / --empty on synthetic models: a textured UV sphere split by a plane into a `Head` cap (both pieces
// closed, no surface lost or doubled, part positions relative to its pivot, --lower moves the base below y 0), then a ball plus a
// separate "horn" the plane crosses: an exact flat cut, and the stranded horn half joining the Head.
import * as THREE from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import jpeg from 'jpeg-js';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const finish = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'meshy', 'finish.mjs');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-parts-'));
const px = new Uint8Array(8 * 8 * 4); for (let i = 0; i < 64; i++) px.set([200, 140, 90, 255], i * 4);

// write a raw-Meshy-like GLB (one mesh / primitive, 8x8 JPEG albedo) from attribute arrays + index
async function writeRaw(file, { position, normal, uv, index }) {
  const doc = new Document(), buf = doc.createBuffer(), acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const tex = doc.createTexture('albedo').setMimeType('image/jpeg').setImage(new Uint8Array(jpeg.encode({ data: px, width: 8, height: 8 }, 90).data));
  const prim = doc.createPrimitive().setMaterial(doc.createMaterial('m').setBaseColorTexture(tex)).setAttribute('POSITION', acc('VEC3', new Float32Array(position)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(normal))).setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uv))).setIndices(acc('SCALAR', new Uint32Array(index)));
  doc.createScene().addChild(doc.createNode('raw').setMesh(doc.createMesh('raw').addPrimitive(prim)));
  await new NodeIO().write(file, doc);
}
const raw = (g) => ({ position: g.attributes.position.array, normal: g.attributes.normal.array, uv: g.attributes.uv.array, index: g.index.array });
const named = (r, name) => r.listNodes().find((n) => n.getName() === name);
const faces = (m) => { const p = m.listPrimitives()[0]; return { P: p.getAttribute('POSITION').getArray(), I: p.getIndices().getArray(), N: p.getAttribute('NORMAL').getArray() }; };
const tris = (P, I, keep = () => true) => { const out = []; for (let t = 0; t < I.length; t += 3) if (keep(t)) out.push([0, 1, 2].map((k) => [0, 1, 2].map((c) => P[I[t + k] * 3 + c]))); return out; };
const area = (T) => T.reduce((s, [a, b, c]) => { const u = [0, 1, 2].map((k) => b[k] - a[k]), w = [0, 1, 2].map((k) => c[k] - a[k]); return s + Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2; }, 0);
// open / non-manifold edge count: every undirected edge between welded positions must be used by exactly two faces, in opposite directions
const closed = ({ P, I }, off = [0, 0, 0]) => {
  const key = (i) => [0, 1, 2].map((k) => Math.round((P[i * 3 + k] + off[k]) * 1e4)).join(','), cnt = new Map();
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = key(I[t + k]), b = key(I[t + (k + 1) % 3]); if (a === b) continue;
    const ek = a < b ? a + '|' + b : b + '|' + a, s = cnt.get(ek) || [0, 0]; s[a < b ? 0 : 1]++; cnt.set(ek, s); }
  let bad = 0; for (const [f, b] of cnt.values()) if (f !== 1 || b !== 1) bad++; return bad; };

// the input: a radius-1 sphere (base at y -1); --height 2 keeps its size (base y 0, top 2, centre (0, 1, 0)); --lower 0.25 moves it down
const g = new THREE.SphereGeometry(1, 24, 16), IN = path.join(tmp, 'raw.glb'), OUT = path.join(tmp, 'ball.glb'), T0 = g.index.count / 3, PIV = [0, 1.45, 0];
await writeRaw(IN, raw(g));
const log = execFileSync('node', [finish, IN, OUT, '--height', '2', '--lower', '0.25', '--tex', '8', '--part', `Head:-2,2,1.2,3,-2,2:${PIV.join(',')}`, '--cut', 'Head:0,1,0', '--empty', 'Beam:0,1.75,0'], { encoding: 'utf8' });
const res = JSON.parse(log.split('\n').find((l) => l.startsWith('RESULT ')).slice(7));
const r = (await new NodeIO().read(OUT)).getRoot(), head = named(r, 'Head'), body = named(r, 'ball');

ok('F1 Head node exists under the body, at the pivot', !!head && !!body && body.listChildren().includes(head) && head.getTranslation().every((v, k) => Math.abs(v - PIV[k]) < 1e-6));
if (head && body) {
  const B = faces(body.getMesh()), H = faces(head.getMesh());
  // each split triangle becomes 3 (+ piece and - piece, one a quad); the caps add the same triangles to both sides
  const capOf = (log.match(/\+ cap (\d+)/) || [])[1] | 0, splitOf = (log.match(/split (\d+)/) || [])[1] | 0;
  const a0 = area(tris(g.attributes.position.array, g.index.array));
  const capArea = area(tris(H.P, H.I, (t) => [0, 1, 2].every((k) => H.N[H.I[t + k] * 3 + 1] < -0.999)));   // the head's cap = faces with straight-down normals
  const surf = area(tris(B.P, B.I)) + area(tris(H.P, H.I)) - 2 * capArea, nB = B.I.length / 3, nH = H.I.length / 3;
  ok('F2 nothing lost or doubled: face count = input + 2 per split triangle (+ caps), surface area = the input\'s', nB + nH - 2 * capOf === T0 + 2 * splitOf && Math.abs(surf - a0) < 1e-4 * a0, `faces ${nB + nH - 2 * capOf} vs ${T0 + 2 * splitOf}; area ${surf.toFixed(5)} vs ${a0.toFixed(5)}`);
  ok('F3 body and Head are both closed after the cut', closed(B) === 0 && closed(H, PIV) === 0);
  let hy = Infinity; for (let i = 1; i < H.P.length; i += 3) hy = Math.min(hy, H.P[i]);
  ok('F4 Head positions are relative to the pivot (cut plane through it: lowest local y = 0)', Math.abs(hy) < 1e-4, `lowest local y ${hy.toFixed(5)}`);
}
ok('F5 --lower 0.25: base at y -0.25, top at 1.75', Math.abs(res.min[1] + 0.25) < 1e-3 && Math.abs(res.max[1] - 1.75) < 1e-3, `y ${res.min[1]} .. ${res.max[1]}`);
const beam = named(r, 'Beam');
ok('F6 --empty Beam:0,1.75,0 adds an empty there', !!beam && !beam.getMesh() && Math.abs(beam.getTranslation()[1] - 1.75) < 1e-6);

// --cut: a clean plane cut, and a stranded piece moved to its part (the game's goat: a horn half left floating on the body).
// Same ball plus a separate r 0.2 "horn" just outside it that the plane y = 1.3 crosses (its y 1.05..1.45)
{ const big = new THREE.SphereGeometry(1, 24, 16), horn = new THREE.SphereGeometry(0.2, 12, 8).translate(1.15, 0.5, 0), nb = big.attributes.position.count;
  const cat = (k) => [...big.attributes[k].array, ...horn.attributes[k].array];
  const IN2 = path.join(tmp, 'raw2.glb'), OUT2 = path.join(tmp, 'ball2.glb');
  await writeRaw(IN2, { position: cat('position'), normal: cat('normal'), uv: cat('uv'), index: [...big.index.array, ...Array.from(horn.index.array, (i) => i + nb)] });
  // height 2 + lower 0.25: the horn's centre lands at (1.15, 1.25, 0); finish centres the bbox (x -1 .. 1.35), shifting x by -0.175
  const PV = [0, 1.3, 0], log2 = execFileSync('node', [finish, IN2, OUT2, '--height', '2', '--lower', '0.25', '--tex', '8', '--part', `Head:-2,2,0.9,3,-2,2:${PV.join(',')}`, '--cut', 'Head:0,1,0'], { encoding: 'utf8' });
  const R2 = (await new NodeIO().read(OUT2)).getRoot(), hd = named(R2, 'Head'), bd = named(R2, 'ball2');
  if (!hd || !bd) ok('F7 --cut makes a Head', false, log2.split('\n').filter((l) => /part|Error/.test(l)).join(' | '));
  else {
    const B = faces(bd.getMesh()), Hh = faces(hd.getMesh()), HC = [1.15 - 0.175, 1.25, 0], inHorn = (x, y, z) => Math.hypot(x - HC[0], y - HC[1], z - HC[2]) < 0.21;
    let hornHead = 0, hmin = Infinity, bodyAbove = 0, bodyHorn = 0, capN = 0;
    for (let i = 0; i < Hh.P.length; i += 3) {
      if (inHorn(Hh.P[i] + PV[0], Hh.P[i + 1] + PV[1], Hh.P[i + 2] + PV[2])) hornHead++; else hmin = Math.min(hmin, Hh.P[i + 1]);   // hmin: the ball's share of the Head
      if (Math.abs(Hh.P[i + 1]) < 1e-4 && Hh.N[i + 1] < -0.999) capN++;
    }
    for (let i = 0; i < B.P.length; i += 3) { if (B.P[i + 1] > PV[1] + 1e-4) bodyAbove++; if (inHorn(B.P[i], B.P[i + 1], B.P[i + 2])) bodyHorn++; }
    ok('F7 --cut: every Head vertex on the +n side of the plane, every body vertex below it (flat, exact cut)', hmin > -1e-4 && bodyAbove === 0, `head lowest local y ${hmin.toFixed(5)}, body above ${bodyAbove}`);
    ok('F8 --cut: body and Head both closed (split triangles + ear-clipped caps)', closed(B) === 0 && closed(Hh, PV) === 0);
    ok('F9 --cut: the Head is capped by a flat cap in the plane (normals straight down)', capN >= 3, `${capN} cap vertices`);
    ok('F10 the horn half below the plane, cut off from the body, joins the Head (none left on the body)', bodyHorn === 0 && hornHead > 50, `${bodyHorn} on the body, ${hornHead} in the Head; ` + (log2.match(/moved to a part \d+/) || [''])[0]);
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
