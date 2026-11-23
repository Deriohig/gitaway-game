// plantkit.test.mjs -- the painterly plant kit (lib/plantkit.mjs, the living-ground spec art/specs/2026-10-22-flowers-living-ground-design.md):
import { NodeIO } from '@gltf-transform/core';
import zlib from 'node:zlib';
import * as PK from '../lib/plantkit.mjs';
const { KIT, buildPlant } = PK;
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const io = new NodeIO();
const BUDGET = { grass: 24, wildflower: 40, perennial: 120, stone: 24 };
const HEIGHT = { grass_short: [0.08, 0.22], grass_tall: [0.3, 0.55], grass_seedhead: [0.4, 0.7], clover_patch: [0.02, 0.12], flower_daisy: [0.12, 0.35],
  flower_buttercup: [0.12, 0.35], flower_poppy: [0.18, 0.42], flower_cornflower: [0.15, 0.4], perennial_lavender: [0.25, 0.5], perennial_foxglove: [0.5, 0.9],
  perennial_oxeye: [0.3, 0.55], fern_clump: [0.22, 0.5], pebbles: [0.015, 0.045] };
const IDS = Object.keys(HEIGHT);
// a minimal PNG reader (8-bit RGB / RGBA, filters 0-4): enough to check the kit's own textures
function readPNG(buf) {
  const b = Buffer.from(buf); if (b.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let o = 8, w = 0, h = 0, ct = 0, depth = 0; const idat = [];
  while (o < b.length) { const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; o += 12 + len; }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!ch || depth !== 8) return { w, h, ct, px: null };
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, px = new Uint8Array(w * h * 4); let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) { const a = x >= ch ? cur[x - ch] : 0, up = prev[x], c = x >= ch ? prev[x - ch] : 0;
      const p = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : (() => { const q = a + up - c, pa = Math.abs(q - a), pb = Math.abs(q - up), pc = Math.abs(q - c); return pa <= pb && pa <= pc ? a : pb <= pc ? up : c; })();
      cur[x] = (line[x] + p) & 255; }
    for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) px[(y * w + x) * 4 + k] = k < ch ? cur[x * ch + k] : 255;
    prev = cur; }
  return { w, h, ct, px };
}
// two-sided: every triangle has a twin on the same three positions, wound the other way; and the lowest normal y
function sides(P, N, I) {
  const T = I.length / 3, key = (i) => [0, 1, 2].map((k) => Math.round(P[i * 3 + k] * 1e5)).join(',');
  const cyc = (v) => { const r = v.indexOf([...v].sort()[0]); return [v[r], v[(r + 1) % 3], v[(r + 2) % 3]].join('|'); };   // a winding, rotated to start at its least corner
  const fwd = new Map(); const tris = [];
  for (let t = 0; t < T; t++) { const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]].map(key); tris.push(v); const c = cyc(v); fwd.set(c, (fwd.get(c) || 0) + 1); }
  let twins = 0; for (const v of tris) if (fwd.has(cyc([v[0], v[2], v[1]]))) twins++;
  let minNy = 1; for (let i = 0; i < N.length / 3; i++) minNy = Math.min(minNy, N[i * 3 + 1]);
  return { twins, minNy };
}
// the texture: opaque coverage and luminance spread (K7); the alpha bleed (K8): transparent texels touching an opaque one, against that
function texStats({ w, h, px }) {
  let op = 0; const lum = []; for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] >= 128) { op++; lum.push(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]); }
  const mean = lum.reduce((s, v) => s + v, 0) / (lum.length || 1), sd = Math.sqrt(lum.reduce((s, v) => s + (v - mean) ** 2, 0) / (lum.length || 1)), cov = op / (w * h);
  let n = 0, diff = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (px[i * 4 + 3] >= 16) continue;
    for (const j of [i - 1, i + 1, i - w, i + w]) if (px[j * 4 + 3] >= 200) { diff += Math.abs(px[i * 4] - px[j * 4]) + Math.abs(px[i * 4 + 1] - px[j * 4 + 1]) + Math.abs(px[i * 4 + 2] - px[j * 4 + 2]); n++; break; } }
  return { cov, sd, n, halo: n ? diff / n / 3 : Infinity };
}
ok('K0 the kit lists the 12 types of the spec and the pebbles (ground-vegetation plan Task 8)', IDS.every((id) => KIT[id]) && Object.keys(KIT).length === 13, `kit: ${Object.keys(KIT).join(', ')}`);
for (const id of IDS) {
  if (!KIT[id]) continue;
  const bytes = await buildPlant(id), doc = await io.readBinary(bytes), r = doc.getRoot();
  const meshes = r.listMeshes(), prim = meshes[0] && meshes[0].listPrimitives()[0], node = r.listNodes().find((n) => n.getMesh());
  const good = meshes.length === 1 && prim && ['POSITION', 'NORMAL', 'TEXCOORD_0'].every((s) => prim.getAttribute(s)) && prim.getIndices() && node && node.getName() === id;
  ok(`K1 ${id}: one mesh with positions, normals, UVs and indices, node named ${id}`, good);
  if (!good) continue;
  const P = prim.getAttribute('POSITION').getArray(), N = prim.getAttribute('NORMAL').getArray(), I = prim.getIndices().getArray(), T = I.length / 3, group = KIT[id].group;
  ok(`K2 ${id}: ${T} tris <= ${BUDGET[group]} (${group})`, T <= BUDGET[group]);
  const m = prim.getMaterial(), tex = m && m.getBaseColorTexture(), png = tex && tex.getMimeType() === 'image/png' ? readPNG(tex.getImage()) : null;
  const pot = (v) => v > 0 && (v & (v - 1)) === 0;
  ok(`K3 ${id}: MASK alpha (cutoff ${m && m.getAlphaCutoff()}), single-sided, PNG with alpha, power-of-two <= 512`, !!m && m.getAlphaMode() === 'MASK' && m.getAlphaCutoff() >= 0.3 && m.getAlphaCutoff() <= 0.6
    && !m.getDoubleSided() && !!png && png.ct === 6 && pot(png.w) && pot(png.h) && png.w <= 512 && png.h <= 512, png ? `${png.w}x${png.h} colour type ${png.ct}` : 'no PNG texture');
  const { twins, minNy } = sides(P, N, I);
  ok(`K4 ${id}: two-sided by duplicated faces (${twins}/${T}), every normal leans up (min y ${minNy.toFixed(2)} >= 0.6)`, twins === T && minNy >= 0.6);
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < P.length / 3; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i * 3 + k]); mx[k] = Math.max(mx[k], P[i * 3 + k]); }
  const [h0, h1] = HEIGHT[id], ht = mx[1] - mn[1];
  ok(`K5 ${id}: base on y 0, centred, ${ht.toFixed(2)} u tall (range ${h0}-${h1})`, Math.abs(mn[1]) <= 0.01 && Math.abs((mn[0] + mx[0]) / 2) <= 0.06 && Math.abs((mn[2] + mx[2]) / 2) <= 0.06 && ht >= h0 && ht <= h1,
    `min y ${mn[1].toFixed(3)}, centre ${((mn[0] + mx[0]) / 2).toFixed(3)}, ${((mn[2] + mx[2]) / 2).toFixed(3)}`);
  const again = await buildPlant(id);
  ok(`K6 ${id}: deterministic (two builds byte-identical)`, Buffer.compare(Buffer.from(bytes), Buffer.from(again)) === 0);
  if (png && png.px) {
    const { cov, sd, n, halo } = texStats(png);
    ok(`K7 ${id}: painted, not flat (opaque ${(100 * cov).toFixed(0)} % of the texture, luminance spread ${sd.toFixed(1)})`, cov >= 0.12 && cov <= 0.85 && sd >= 10);
    ok(`K8 ${id}: no dark halos: the clear texels at the cut-out edge carry the edge colour (mean difference ${n ? halo.toFixed(1) : '-'} levels <= 40)`, n > 0 && halo <= 40);
  }
}
// K9 the card shrubs: low cards (<= 120 tris) on the forest edges, one painted MASK texture each, sized to the composition's belt
const SHRUB_IDS = ['shrub_low', 'shrub_mound', 'shrub_heather'];
ok(`K9 SHRUBS lists ${SHRUB_IDS.join(', ')}`, !!PK.SHRUBS && SHRUB_IDS.every((id) => PK.SHRUBS[id]) && Object.keys(PK.SHRUBS).length === SHRUB_IDS.length,
  PK.SHRUBS ? `shrubs: ${Object.keys(PK.SHRUBS).join(', ')}` : 'no SHRUBS export');
const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const h = !d ? -1 : mx === r ? (((g - b) / d) % 6 + 6) % 6 * 60 : mx === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60; return [h, mx ? d / mx : 0]; };
for (const id of SHRUB_IDS) {
  let bytes; try { bytes = await buildPlant(id); } catch (e) { ok(`K9 ${id}: builds`, false, e.message); continue; }
  const doc = await io.readBinary(bytes), r = doc.getRoot(), meshes = r.listMeshes(), prims = meshes.flatMap((m) => m.listPrimitives()), mats = r.listMaterials();
  const prim = prims[0], m = mats[0], node = r.listNodes().find((n) => n.getMesh()), tex = m && m.getBaseColorTexture();
  const png = tex && tex.getMimeType() === 'image/png' ? readPNG(tex.getImage()) : null;
  const good = meshes.length === 1 && prims.length === 1 && ['POSITION', 'NORMAL', 'TEXCOORD_0'].every((s) => prim.getAttribute(s)) && !!prim.getIndices() && !!node && node.getName() === id;
  const T = good ? prim.getIndices().getCount() / 3 : NaN;
  const pot = (v) => v > 0 && (v & (v - 1)) === 0;
  ok(`K9 ${id}: ${T} tris <= 120, one MASK PNG material (cutoff ${m && m.getAlphaCutoff()}, single-sided, power-of-two <= 512), node named ${id}`, good && T <= 120 && mats.length === 1 && prim.getMaterial() === m
    && m.getAlphaMode() === 'MASK' && Math.abs(m.getAlphaCutoff() - 0.4) < 1e-6 && !m.getDoubleSided() && !!png && png.ct === 6 && pot(png.w) && pot(png.h) && png.w <= 512 && png.h <= 512,
    `${meshes.length} mesh(es), ${prims.length} primitive(s), ${mats.length} material(s), ${png ? `${png.w}x${png.h} colour type ${png.ct}` : 'no PNG texture'}, node ${node && node.getName()}`);
  if (!good) continue;
  const P = prim.getAttribute('POSITION').getArray(), N = prim.getAttribute('NORMAL').getArray(), I = prim.getIndices().getArray();
  let y0 = Infinity, y1 = -Infinity, rad = 0; for (let i = 0; i < P.length / 3; i++) { y0 = Math.min(y0, P[i * 3 + 1]); y1 = Math.max(y1, P[i * 3 + 1]); rad = Math.max(rad, Math.hypot(P[i * 3], P[i * 3 + 2])); }
  ok(`K9 ${id}: on the ground (min y ${y0.toFixed(3)}), footprint radius ${rad.toFixed(2)} <= 0.6 u, ${(y1 - y0).toFixed(2)} u tall (0.2-0.5)`, Math.abs(y0) <= 0.01 && rad <= 0.6 && y1 - y0 >= 0.2 && y1 - y0 <= 0.5);
  const again = await buildPlant(id);
  ok(`K9 ${id}: deterministic (two builds byte-identical)`, Buffer.compare(Buffer.from(bytes), Buffer.from(again)) === 0);
  const { twins, minNy } = sides(P, N, I);
  ok(`K9 ${id}: two-sided by duplicated faces (${twins}/${T}), every normal leans up (min y ${minNy.toFixed(2)} >= 0.6)`, twins === T && minNy >= 0.6);
  if (!png || !png.px) continue;
  const { cov, sd, n, halo } = texStats(png);
  ok(`K9 ${id}: painted, not flat (opaque ${(100 * cov).toFixed(0)} %, luminance spread ${sd.toFixed(1)}), no dark halos (${n ? halo.toFixed(1) : '-'} levels <= 40)`,
    cov >= 0.12 && cov <= 0.85 && sd >= 10 && n > 0 && halo <= 40);
  if (id === 'shrub_heather') {
    const { w, h, px } = png; let op = 0, bloom = 0;
    for (let i = 0; i < w * h; i++) { if (px[i * 4 + 3] < 128) continue; op++; const [hu, s] = hsv(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]); if (hu >= 280 && hu <= 330 && s >= 0.15) bloom++; }
    ok(`K9 ${id}: the bloom: ${(100 * bloom / (op || 1)).toFixed(1)} % of the opaque texels purple-pink (hue 280-330) >= 20 %`, op > 0 && bloom / op >= 0.2);
  }
}
// K10 the pebbles: a few painted stones on low cards, the contact shade in the paint, stone with a little moss
{
  const id = 'pebbles';
  let bytes = null; try { bytes = KIT[id] ? await buildPlant(id) : null; } catch (e) { ok(`K10 ${id}: builds`, false, e.message); }
  if (!bytes) ok(`K10 ${id}: the kit has pebbles (KIT.pebbles, group 'stone')`, false, KIT[id] ? 'build failed' : 'no KIT.pebbles');
  else {
    const doc = await io.readBinary(bytes), r = doc.getRoot(), prim = r.listMeshes()[0].listPrimitives()[0], m = prim.getMaterial(), tex = m && m.getBaseColorTexture();
    const png = tex && tex.getMimeType() === 'image/png' ? readPNG(tex.getImage()) : null, P = prim.getAttribute('POSITION').getArray(), T = prim.getIndices().getCount() / 3;
    let ymax = -Infinity, rad = 0; for (let i = 0; i < P.length / 3; i++) { ymax = Math.max(ymax, P[i * 3 + 1]); rad = Math.max(rad, Math.hypot(P[i * 3], P[i * 3 + 2])); }
    ok(`K10 ${id}: ${T} tris <= 24, max y ${ymax.toFixed(3)} <= 0.045, footprint radius ${rad.toFixed(3)} <= 0.13 u`, T <= 24 && ymax <= 0.045 + 1e-9 && rad <= 0.13 + 1e-9);
    ok(`K10 ${id}: a 128 x 128 MASK PNG with alpha (${png ? `${png.w}x${png.h}, colour type ${png.ct}` : 'no PNG'}; ${m && m.getAlphaMode()})`, !!png && png.ct === 6 && png.w === 128 && png.h === 128 && m.getAlphaMode() === 'MASK');
    if (png && png.px) {
      const { w, h, px } = png, op = (i) => px[i * 4 + 3] >= 128, luma = (i) => 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
      // the distance (px, euclidean to the nearest clear texel, by an exact brute force over a 6 px window) of each opaque texel
      const dist = (x, y) => { let best = 99; for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; if (!op(yy * w + xx)) best = Math.min(best, Math.hypot(dx, dy)); } return best; };
      let rim = 0, rimN = 0, core = 0, coreN = 0, nOp = 0, stone = 0, green = 0, other = 0; const cellL = [0, 0, 0, 0], cellN = [0, 0, 0, 0];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!op(i)) continue; nOp++;
        const d = dist(x, y); if (d <= 2) { rim += luma(i); rimN++; } else if (d >= 4) { core += luma(i); coreN++; }
        const [hu, s] = hsv(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
        if (s <= 0.30 && hu >= 0 && hu <= 60) { stone++; if (d >= 4) { const c = (y >= 64 ? 2 : 0) + (x >= 64 ? 1 : 0); cellL[c] += luma(i); cellN[c]++; } } else if (hu >= 55 && hu <= 175) green++; else other++; }
      const rimL = rim / (rimN || 1), coreL = core / (coreN || 1);
      ok(`K10 ${id}: the contact shade is painted in: the rim texels (within 2 px of a clear one, ${rimN}) have a mean luma ${rimL.toFixed(1)} <= 0.85 x the core's (4 px or more in, ${coreN}) ${coreL.toFixed(1)} (x ${(rimL / (coreL || 1)).toFixed(2)})`, rimN > 0 && coreN > 0 && rimL <= 0.85 * coreL);
      ok(`K10 ${id} (GR26): the contact shade is darker still: the rim's mean luma ${rimL.toFixed(1)} <= 0.50 x the core's ${coreL.toFixed(1)} (x ${(rimL / (coreL || 1)).toFixed(2)})`, rimN > 0 && coreN > 0 && rimL <= 0.50 * coreL);
      const bodies = cellL.map((v, c) => v / (cellN[c] || 1)), tone = Math.max(...bodies) / (Math.min(...bodies) || 1);
      ok(`K10 ${id} (GR26): the stones differ in tone: the four bodies' mean luma ${bodies.map((v) => v.toFixed(0)).join(' / ')}, lightest / darkest x ${tone.toFixed(2)} >= 1.30`, cellN.every((n) => n > 50) && tone >= 1.30);
      ok(`K10 ${id}: ${(100 * stone / (nOp || 1)).toFixed(1)} % of the ${nOp} opaque texels in the stone band (saturation <= 0.30, hue 0-60 deg) >= 70 %, the rest greens (${green} green, ${other} neither; moss ${(100 * green / (nOp || 1)).toFixed(1)} % >= 3 %)`,
        nOp > 0 && stone / nOp >= 0.7 && other === 0 && green / nOp >= 0.03);
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
