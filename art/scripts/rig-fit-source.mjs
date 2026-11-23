// rig-fit-source.mjs -- fits a replacement animal model to the size template of the one the game places today, for a rig source
// (art/blender/rigs/build.sh takes it as the animal's --source):
//   node rig-fit-source.mjs <in.glb> <template.glb> <out.glb>
// One uniform scale (never per axis) and a translation, so the model keeps its proportions, faces +Z as both do, stands on y 0
// and stands where the template stands:
//   - scale s fits the template's height (y) and length (z) together: the geometric mean of the two ratios, so neither misses
//     by more than the other (log least squares); the width is left to the model's own build;
//   - x and z: the centre of the four hooves' footprint (the vertices within FOOT u of the lowest point, split at the
//     footprint's centroid into front/back and left/right, each foot's centre averaged) lands on the template's;
//   - y: the lowest point on y 0.
// Every mesh node's vertices are scaled in place and the node translations moved with them, so child pivots (the `Head` node at
// the nape) stay where they belong; node rotations and scales must be identity. Images, UVs, normals, materials and the node
// tree are untouched: the JPEG bytes stay the source's (AR1). Writes deterministically and prints the numbers. A model that
// already fits (scale 1 and no move, within 1e-6) is copied byte for byte, so a rerun on the output changes nothing.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';

const FOOT = 0.01;
const [inPath, tplPath, outPath] = process.argv.slice(2);
if (!outPath) { console.error('usage: node rig-fit-source.mjs <in.glb> <template.glb> <out.glb>'); process.exit(2); }
const io = new NodeIO();
const fail = (m) => { console.error(`rig-fit-source: ${m}`); process.exit(1); };

function points(doc) {   // every used vertex in model space: [[x, y, z], ...]
  const out = [], e = [0, 0, 0];
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh(); if (!m) continue;
    const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) {
      const A = p.getAttribute('POSITION'), ix = p.getIndices();
      for (const i of ix ? new Set(ix.getArray()) : Array.from({ length: A.getCount() }, (_, k) => k)) {
        A.getElement(i, e);
        out.push([0, 1, 2].map((k) => w[k] * e[0] + w[4 + k] * e[1] + w[8 + k] * e[2] + w[12 + k]));
      }
    }
  }
  return out;
}
function measure(P) {
  const mn = [0, 1, 2].map((k) => Math.min(...P.map((p) => p[k]))), mx = [0, 1, 2].map((k) => Math.max(...P.map((p) => p[k])));
  const sole = P.filter((p) => p[1] <= mn[1] + FOOT), c = [0, 2].map((k) => sole.reduce((s, p) => s + p[k], 0) / sole.length);
  const feet = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const f = sole.filter((p) => Math.sign(p[0] - c[0] || 1) === sx && Math.sign(p[2] - c[1] || 1) === sz);
    if (!f.length) fail(`no foot on the ${sx > 0 ? 'left' : 'right'} ${sz > 0 ? 'front' : 'back'} (sole vertices within ${FOOT} u of the lowest point)`);
    feet.push([0, 2].map((k) => f.reduce((s, p) => s + p[k], 0) / f.length));
  }
  return { mn, mx, size: mx.map((v, k) => v - mn[k]), foot: [0, 1].map((k) => feet.reduce((s, f) => s + f[k], 0) / 4), feet };
}

const src = await io.read(inPath), tpl = await io.read(tplPath);
for (const n of src.getRoot().listNodes()) {
  const r = n.getRotation(), s = n.getScale();
  if (Math.abs(r[3] - 1) > 1e-9 || s.some((v) => Math.abs(v - 1) > 1e-9)) fail(`node ${n.getName()} has a rotation or scale`);
}
const A = measure(points(src)), T = measure(points(tpl));
const s = Math.sqrt((T.size[1] / A.size[1]) * (T.size[2] / A.size[2]));
const d = [T.foot[0] - s * A.foot[0], -s * A.mn[1], T.foot[1] - s * A.foot[1]];
if (Math.abs(s - 1) <= 1e-6 && d.every((v) => Math.abs(v) <= 1e-6)) {   // already fitted (a rerun on its own output): bytes kept
  if (!fs.existsSync(outPath) || fs.realpathSync(inPath) !== fs.realpathSync(outPath)) fs.copyFileSync(inPath, outPath);
  console.log(`rig-fit-source: ${inPath} already fits (scale ${s.toFixed(7)}, move ${d.map((v) => v.toExponential(1)).join(' ')}); ${outPath} keeps its bytes`);
  process.exit(0);
}
// new world translation of a node: s * old + d; its local translation is that less its parent's new world translation
const world = new Map();
for (const n of src.getRoot().listNodes()) world.set(n, n.getWorldMatrix().slice(12, 15));
for (const n of src.getRoot().listNodes()) {
  const w = world.get(n).map((v, k) => s * v + d[k]), parent = n.getParentNode();
  const pw = parent ? world.get(parent).map((v, k) => s * v + d[k]) : [0, 0, 0];
  n.setTranslation(w.map((v, k) => v - pw[k]));
}
const scaled = new Set();
for (const m of src.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const P = p.getAttribute('POSITION');
  if (scaled.has(P)) continue;
  scaled.add(P);
  const a = P.getArray().slice();
  for (let i = 0; i < a.length; i++) a[i] *= s;
  P.setArray(a);
}
fs.writeFileSync(outPath, await io.writeBinary(src));
const B = measure(points(await io.read(outPath)));
const r = (v, k = 4) => v.map((x) => x.toFixed(k)).join(' x ');
console.log(`rig-fit-source: ${inPath} (sha256 ${crypto.createHash('sha256').update(fs.readFileSync(inPath)).digest('hex').slice(0, 16)})`);
console.log(`  model    size ${r(A.size)} (x y z), feet centre x ${A.foot[0].toFixed(4)} z ${A.foot[1].toFixed(4)}`);
console.log(`  template size ${r(T.size)}, feet centre x ${T.foot[0].toFixed(4)} z ${T.foot[1].toFixed(4)}`);
console.log(`  scale ${s.toFixed(6)} (height ratio ${(T.size[1] / A.size[1]).toFixed(4)}, length ratio ${(T.size[2] / A.size[2]).toFixed(4)}), move ${r(d)}`);
console.log(`  fitted   size ${r(B.size)} (height ${(100 * (B.size[1] / T.size[1] - 1)).toFixed(1)} %, length ${(100 * (B.size[2] / T.size[2] - 1)).toFixed(1)} %, width ${(100 * (B.size[0] / T.size[0] - 1)).toFixed(1)} % against the template), lowest y ${B.mn[1].toFixed(5)}, feet centre x ${B.foot[0].toFixed(4)} z ${B.foot[1].toFixed(4)}`);
console.log(`  wrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);
