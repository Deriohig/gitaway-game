// rig-finalize.mjs -- finishes a Blender rig export (art/blender/rigs) for the game:
//   node rig-finalize.mjs <raw.glb> <source.glb> <sidecar.json> <out.glb> [--rigs <rigs.json> --id <id>]
// Copies the source GLB's image bytes over the exported image (the atlas is never re-encoded), names the material <id> (--id, else
// from the sidecar's file: dog_rig.glb -> dog), drops extensionsUsed, opens the eyelids (each `lids` joint's node scale [0,0,0]: the
// default pose), thins every LINEAR animation sampler's keys (lib/rig-keys.mjs: a key goes only when the line between its kept
// neighbours reproduces it within 1e-4 per component; ruling R11) and writes the GLB deterministically. With --rigs it upserts
// the sidecar as animals[<id>] (keys sorted, 2-space JSON).
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { rigId } from './lib/rig-inspect.mjs';
import { reduceLinear } from './lib/rig-keys.mjs';

const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };
const [raw, source, sidecarPath, out] = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'));
if (!out || !opt('--rigs') !== !opt('--id')) {
  console.error('usage: node rig-finalize.mjs <raw.glb> <source.glb> <sidecar.json> <out.glb> [--rigs <rigs.json> --id <id>]');
  process.exit(2);
}
const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8')), id = opt('--id') || rigId(sidecar);
const io = new NodeIO(), doc = await io.read(raw), R = doc.getRoot(), srcTex = (await io.read(source)).getRoot().listTextures();
const fail = (msg) => { console.error(`rig-finalize: ${msg}`); process.exit(1); };

const tex = R.listTextures(), mats = R.listMaterials();
if (tex.length !== 1 || srcTex.length !== 1) fail(`want one image in each GLB (export ${tex.length}, source ${srcTex.length})`);
tex[0].setImage(srcTex[0].getImage()).setMimeType(srcTex[0].getMimeType());
if (mats.length !== 1) fail(`want one material, the export has ${mats.length}`);
mats[0].setName(id);
for (const ext of R.listExtensionsUsed()) ext.dispose();
for (const name of sidecar.lids || []) {
  const n = R.listNodes().find((x) => x.getName() === name);
  if (!n) fail(`no lid joint ${name}`);
  n.setScale([0, 0, 0]);
}
// key reduction: each LINEAR sampler gets its kept keys in new accessors (samplers whose kept times agree share one input)
const buffer = R.listBuffers()[0], inputs = new Map();
let keysIn = 0, keysOut = 0;
for (const anim of R.listAnimations()) for (const s of anim.listSamplers()) {
  const t = s.getInput().getArray(), v = s.getOutput().getArray(), size = s.getOutput().getElementSize();
  if (s.getInterpolation() !== 'LINEAR' || !(t instanceof Float32Array) || !(v instanceof Float32Array)) continue;
  const keep = reduceLinear(t, v, size), times = Float32Array.from(keep, (i) => t[i]), key = times.join(',');
  keysIn += t.length; keysOut += keep.length;
  if (!inputs.has(key)) inputs.set(key, doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer));
  const values = new Float32Array(keep.length * size);
  keep.forEach((i, j) => values.set(v.subarray(i * size, (i + 1) * size), j * size));
  s.setInput(inputs.get(key)).setOutput(doc.createAccessor().setType(s.getOutput().getType()).setArray(values).setBuffer(buffer));
}
for (const a of R.listAccessors()) if (a.listParents().every((p) => p === R)) a.dispose();
const glb = await io.writeBinary(doc);
fs.writeFileSync(out, glb);
let note = '';
if (opt('--rigs')) {
  const f = opt('--rigs'), rigs = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { version: 1, animals: {} };
  const sorted = (v) => (Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted(v[k])])) : v);
  rigs.animals[id] = sidecar;
  fs.writeFileSync(f, JSON.stringify(sorted(rigs), null, 2) + '\n');
  note = `, ${path.basename(f)} animals.${id}`;
}
console.log(`rig-finalize: ${path.basename(out)} (material ${id}, lids ${(sidecar.lids || []).join(' ') || 'none'}, ` +
  `LINEAR keys ${keysIn} -> ${keysOut}, ${(glb.length / 1024).toFixed(1)} KB${note})`);
