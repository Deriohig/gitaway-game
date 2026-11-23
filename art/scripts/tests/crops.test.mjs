// crops.test.mjs -- the painterly kit's crop stages (lib/plantkit.mjs CROPS / BEDS), the Meshy ready stages (public/models) and the flowerbed.
//   Kit stages: a node named after the file, <= 400 tris, one MASK PNG material, deterministic; stage 1 a sprout cluster (>= 5 seedlings,
//   outer ones >= 0.2 u out); sunflower/lavender stages 2-3 are three plants; garden stage 2 is one plant in the middle.
//   Every stage inside the 0.94 soil and on it; stages grow (each taller than the last, stage 2 40-80 % of ripe, stage 1 <= 50 %).
//   Garden ready stage = Meshy model: one OPAQUE JPEG <= 512 px, <= 2,500 tris, <= 200 KB, footprint >= 0.72 u.
//   Ripe sunflower heads are their own cards facing the default camera (azimuth 45), not crossed cards (read as a sliced head).
//   Flowerbed: MASK PNG flowers on a COLOR_0 soil mound inside the 0.6 u disc, outward-wound triangles, deterministic.
//   node tests/crops.test.mjs          (PLANTKIT=path/to/plantkit.mjs to test another kit)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const here = path.dirname(fileURLToPath(import.meta.url));
const PK = await import(pathToFileURL(process.env.PLANTKIT ? path.resolve(process.env.PLANTKIT) : path.join(here, '..', 'lib', 'plantkit.mjs')).href);
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
// one assertion per subject: `checks` maps label -> condition, the failing labels become the detail
const all = (name, checks, info = '') => { const bad = Object.keys(checks).filter((k) => !checks[k]); ok(`${name} ${info}`, !bad.length, bad.length ? `failed: ${bad.join('; ')}` : ''); };
const io = new NodeIO(), CR = PK.CROPS || {}, BD = PK.BEDS || {};
const MODELS = path.join(here, '..', '..', '..', 'public', 'models');
const same = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const sub = (a, b) => a.map((x, q) => x - b[q]);
const cross = (e, f) => [e[1] * f[2] - e[2] * f[1], e[2] * f[0] - e[0] * f[2], e[0] * f[1] - e[1] * f[0]];
const info = async (id) => { const bytes = await PK.buildPlant(id), r = (await io.readBinary(bytes)).getRoot(), prims = r.listMeshes().flatMap((m) => m.listPrimitives());
  const pts = []; for (const p of prims) { const A = p.getAttribute('POSITION').getArray(); for (let i = 0; i < A.length; i += 3) pts.push([A[i], A[i + 1], A[i + 2]]); }
  return { bytes, r, prims, pts, tris: prims.reduce((s, p) => s + p.getIndices().getCount() / 3, 0), node: r.listNodes().find((n) => n.getMesh()) }; };
const span = (pts) => { let mnY = Infinity, mxY = -Infinity, out = 0, f = 0; for (const [x, y, z] of pts) { mnY = Math.min(mnY, y); mxY = Math.max(mxY, y); f = Math.max(f, Math.abs(x), Math.abs(z)); if (Math.abs(x) > 0.47 || Math.abs(z) > 0.47) out++; } return { mnY, mxY, out, foot: 2 * f }; };
// kit plants are 4-vertex cards: the first two vertices low on the ground are a seedling's foot
const feetOf = (pts) => { const feet = [], spots = [];
  for (let k = 0; k + 3 < pts.length; k += 4) if (pts[k][1] < 0.02 && pts[k + 1][1] < 0.02) feet.push([(pts[k][0] + pts[k + 1][0]) / 2, (pts[k][2] + pts[k + 1][2]) / 2]);
  for (const [x, z] of feet) if (!spots.some(([u, w]) => Math.hypot(u - x, w - z) < 0.08)) spots.push([x, z]);
  return { spots, far: Math.max(...feet.map(([x, z]) => Math.hypot(x, z))), n: feet.length }; };
const growth = (name, hs) => { const [r1, r2] = [hs[0] / hs[2], hs[1] / hs[2]];
  ok(`${name}: each stage taller than the last (${hs.map((v) => v.toFixed(2)).join(' < ')}), stage 2 ${Math.round(r2 * 100)} % of ripe (40-80), stage 1 ${Math.round(r1 * 100)} % (<= 50)`,
    hs.every(Number.isFinite) && hs[0] < hs[1] && hs[1] < hs[2] && r2 >= 0.4 && r2 <= 0.8 && r1 <= 0.5); };

// a kit stage: returns its height (NaN when missing)
async function kitStage(id, layout, [lo, hi], ripe) {
  if (!CR[id]) { ok(`${id} builds from the kit`, false, 'not in the kit'); return NaN; }
  const M = await info(id), mat = M.prims[0].getMaterial(), tex = mat && mat.getBaseColorTexture(), { spots, far, n } = feetOf(M.pts), { mnY, mxY, out, foot } = span(M.pts);
  all(id, {
    'node named after it': M.node && M.node.getName() === id, '<= 400 tris': M.tris <= 400, 'one MASK PNG material': M.prims.length === 1 && mat.getAlphaMode() === 'MASK' && tex && tex.getMimeType() === 'image/png',
    deterministic: same(M.bytes, await PK.buildPlant(id)), 'has feet': n > 0,
    layout: layout === 'cluster' ? spots.length >= 5 && far >= 0.2 : layout === 'one' ? far <= 0.12 : spots.length === 3,
    'inside the plot, on the soil': !out && Math.abs(mnY) <= 0.01, [`height ${lo}-${hi}`]: mxY >= lo && mxY <= hi, 'ripe fills the plot': !ripe || foot >= 0.72 },
    `(${M.tris} tris, ${spots.length} spots, ${far.toFixed(2)} u out, ${mxY.toFixed(2)} u tall, min y ${mnY.toFixed(3)}, ${out} vertices out)`);
  if (id === 'crop_sunflower_3') { let heads = 0;
    for (const p of M.prims) { const N = p.getAttribute('POSITION').getArray(), I = p.getIndices().getArray();
      for (let k = 0; k < I.length; k += 3) { const v = [0, 1, 2].map((j) => [N[I[k + j] * 3], N[I[k + j] * 3 + 1], N[I[k + j] * 3 + 2]]), nn = cross(sub(v[1], v[0]), sub(v[2], v[0])), l = Math.hypot(...nn) || 1, az = Math.atan2(nn[0], nn[2]) * 180 / Math.PI;
        if (nn[1] / l > 0.2 && nn[1] / l < 0.5 && Math.abs(az - 45) <= 3 && Math.min(v[0][1], v[1][1], v[2][1]) > 0.5) heads++; } }
    ok(`crop_sunflower_3: three heads on their own cards facing the camera (azimuth 45 +- 3 deg), tilted up toward it (${heads / 2} heads)`, heads === 6); }
  return mxY;
}

// [stage 2 range, ripe range] in u above the soil
const GARDEN = { radish: [[0.4, 0.6], [0.75, 0.9]], carrot: [[0.4, 0.6], [0.8, 0.95]], wheat: [[0.6, 0.85], [1.1, 1.2 + 1e-3]], lettuce: [[0.24, 0.4], [0.38, 0.5]],
  tomato: [[0.6, 0.85], [1.1, 1.2 + 1e-3]], pumpkin: [[0.2, 0.32], [0.3, 0.42]], blueberry: [[0.35, 0.55], [0.6, 0.8]], cranberry: [[0.14, 0.25], [0.32, 0.45]] };
const FLOWERS = { sunflower: [[0.5, 0.75], [1.0, 1.2 + 1e-3]], lavender: [[0.25, 0.4], [0.45, 0.6]] };
for (const [crop, [h2, h3]] of Object.entries(GARDEN)) {
  const hs = [await kitStage(`crop_${crop}_1`, 'cluster', [0.1, 0.25]), await kitStage(`crop_${crop}_2`, 'one', h2)], id = `crop_${crop}_3`, f = path.join(MODELS, `${id}.glb`);
  if (!fs.existsSync(f)) { ok(`${id}: published (public/models)`, false, 'missing'); continue; }
  const r = (await io.read(f)).getRoot(), prims = r.listMeshes().flatMap((m) => m.listPrimitives()), mats = r.listMaterials(), texs = r.listTextures(), pts = [];
  const tris = prims.reduce((s, p) => s + p.getIndices().getCount() / 3, 0), kb = fs.statSync(f).size / 1024, t = texs[0], sz = t && t.getSize(), root = crop === 'radish' || crop === 'carrot';
  for (const p of prims) { const A = p.getAttribute('POSITION'), e = [0, 0, 0]; for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e); pts.push([...e]); } }
  const { mnY, mxY, out, foot } = span(pts); hs.push(mxY);
  all(id, { 'node named after it': r.listNodes().some((n) => n.getName() === id && n.getMesh()), 'one material named after it': mats.length === 1 && mats[0].getName() === id, OPAQUE: mats[0].getAlphaMode() === 'OPAQUE',
    'one JPEG albedo <= 512 px': texs.length === 1 && t.getMimeType() === 'image/jpeg' && Math.max(...sz) <= 512, '<= 2,500 tris': tris <= 2500, '<= 200 KB': kb <= 200, 'fills the plot (footprint >= 0.72)': foot >= 0.72,
    'inside the plot': !out, 'on the soil (roots may sit <= 0.15 u below)': root ? mnY >= -0.15 && mnY <= 0.001 : Math.abs(mnY) <= 0.01, [`height ${h3[0]}-${h3[1]}`]: mxY >= h3[0] && mxY <= h3[1] },
    `(Meshy ready stage, ${tris} tris, ${Math.round(kb)} KB, ${sz ? sz.join('x') : '-'}, footprint ${foot.toFixed(2)}, ${mxY.toFixed(2)} u tall)`);
  growth(crop, hs);
}
for (const [crop, [h2, h3]] of Object.entries(FLOWERS)) {
  const hs = []; for (const st of [1, 2, 3]) hs.push(await kitStage(`crop_${crop}_${st}`, st === 1 ? 'cluster' : 'three', st === 1 ? [0.1, 0.25] : st === 2 ? h2 : h3, st === 3));
  growth(crop, hs);
}
{ const man = JSON.parse(fs.readFileSync(path.join(MODELS, 'manifest.json'), 'utf8')).assets || {}, want = [...Object.keys(GARDEN), 'sunflower', 'lavender'].flatMap((c) => [1, 2, 3].map((s) => `crop_${c}_${s}`));
  const miss = want.filter((id) => !man[id] || man[id].status !== 'ready' || man[id].file !== `${id}.glb` || !fs.existsSync(path.join(MODELS, `${id}.glb`)));
  ok(`the manifest has all ${want.length} crop files ready (ten crops x 3 stages)`, !miss.length, miss.length ? `missing or not ready: ${miss.join(', ')}` : ''); }

if (!BD.flowerbed) ok('flowerbed builds', false, 'not in the kit');
else { const M = await info('flowerbed'), mats = M.prims.map((p) => p.getMaterial());
  const cards = M.prims.find((p) => p.getMaterial().getAlphaMode() === 'MASK' && p.getMaterial().getBaseColorTexture()), soil = M.prims.find((p) => p.getAttribute('COLOR_0'));
  let far = 0, mxY = 0, mnY = Infinity; for (const [x, y, z] of M.pts) { far = Math.max(far, Math.hypot(x, z)); mxY = Math.max(mxY, y); mnY = Math.min(mnY, y); }
  // a triangle wound against its vertex normals is drawn dark (back face)
  let inward = 0, tris = 0;
  if (soil) { const P = soil.getAttribute('POSITION').getArray(), N = soil.getAttribute('NORMAL').getArray(), I = soil.getIndices().getArray();
    for (let k = 0; k < I.length; k += 3) { const v = [0, 1, 2].map((j) => I[k + j]), p = v.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]), f = cross(sub(p[1], p[0]), sub(p[2], p[0]));
      if (Math.hypot(...f) < 1e-9) continue; tris++;
      const n = v.reduce((s, i) => [s[0] + N[i * 3], s[1] + N[i * 3 + 1], s[2] + N[i * 3 + 2]], [0, 0, 0]); if (f[0] * n[0] + f[1] * n[1] + f[2] * n[2] <= 0) inward++; } }
  all('flowerbed', { named: M.node && M.node.getName() === 'flowerbed', 'MASK PNG flowers + COLOR_0 soil, 2 materials': !!cards && !!soil && mats.length === 2, 'inside the 0.6 u disc': far <= 0.6, 'at most 0.5 u tall': mxY <= 0.5,
    'at most 600 tris': M.tris <= 600, 'on the ground': Math.abs(mnY) <= 0.01, 'mound and stones face out': tris > 0 && !inward, deterministic: same(M.bytes, await PK.buildPlant('flowerbed')) },
    `(disc ${far.toFixed(2)}, ${mxY.toFixed(2)} u tall, ${M.tris} tris, ${inward} of ${tris} triangles wound inward)`); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
