// trees.test.mjs -- the painterly trees and bushes: the reskin set (free CC0 MegaKit models repainted by reskin.mjs into art/reskin/<id>.glb).
// Reads the species table and the COMMITTED models (reskin.test.mjs runs the tool itself). TREES_DIR=<dir> checks <dir>/<id>.glb instead.
//   T1 table: SPECIES = the 11 ids (no tree_willow) with the table's source / kind / height / cap / ramp / bark / overlay, no Meshy-era field; approved = tree_pine_a + bush_flowering; AUTUMN = 3 { id, from, hue }
//   T2-T6 near model: one root <id>, tris <= cap, bark on the root, leaves on Canopy (conifers Crown > Canopy), a bush one node; height within 3 %, min y 0; Canopy pivot y 0.05-0.8 x height;
//      no ground slab (bottom 4 % reaches <= 35 % of the width; bushes by near-horizontal triangles; T5s: that rule catches a synthetic slab); overlay ids carry one <id>_overlay MASK PNG material, others none
//   T7 autumn: geometry byte-equal to its `from`, foliage hue within 12 deg of the target, luminance sd >= 0.6 x the `from`'s   T8 birch bark: median luminance >= 0.75, 3-10 % dark texels
//   T9 far versions (every tree id): <id>_far root with the bark, Canopy leaves; tris <= 1,000 (sapling and conifers 500); height and Canopy pivot as the near; materials as the near with images
//      box-downsampled to 256 (PNG same pixels, JPEG same bytes at q85); bark one welded component; tree_fruit keeps 6 apple cards; an autumn far geometry is byte-equal to its `from`'s
//   node tests/trees.test.mjs
import { NodeIO } from '@gltf-transform/core';
import jpeg from 'jpeg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from '../lib/png.mjs';
import { SPECIES, AUTUMN } from '../lib/species.mjs';

// TREES_DIR=<dir> checks <dir>/<id>.glb instead of art/reskin (e.g. a copy with an injected fault)
const here = path.dirname(fileURLToPath(import.meta.url)), RESKIN = process.env.TREES_DIR || path.join(here, '..', '..', 'reskin'), MESHY = path.join(here, '..', '..', 'meshy');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const chk = (name, checks, detail = '') => { const bad = Object.keys(checks).filter((k) => !checks[k]); ok(name, !bad.length, (bad.length ? 'failed: ' + bad.join('; ') + ' | ' : '') + detail); };   // one result per subject

// ---- T1: the table ----
// the R1 brief's table: source (or the allowed choices), height, cap, foliage ramp (concept folder), bark ramp ('birch' = painted)
const TABLE = {
  tree_pine_a: { src: ['Pine_5'], kind: 'conifer', h: 2.55, cap: 1200, ramp: 'tree_fir', bark: 'tree_fir' },
  tree_pine_b: { src: ['Pine_1', 'Pine_4'], kind: 'conifer', h: 1.97, cap: 1200, ramp: 'tree_fir', bark: 'tree_fir' },
  tree_round_a: { src: ['CommonTree_1'], kind: 'broad', h: 2.3, cap: 3500, ramp: 'tree_oak', bark: 'tree_oak' },
  tree_round_b: { src: ['CommonTree_2'], kind: 'broad', h: 2.3, cap: 3500, ramp: 'tree_beech', bark: 'tree_beech' },
  tree_spread: { src: ['TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3', 'TwistedTree_4', 'TwistedTree_5'], kind: 'broad', h: 1.92, cap: 3500, ramp: 'tree_maple', bark: 'tree_maple' },
  tree_sapling: { src: ['CommonTree_3', 'CommonTree_5'], kind: 'broad', h: 1.34, cap: 1500, ramp: 'tree_sapling', bark: 'tree_sapling' },
  tree_birch: { src: ['CommonTree_3', 'CommonTree_4'], kind: 'broad', h: 2.3, cap: 3000, ramp: 'tree_birch', bark: 'birch' },
  tree_fruit: { src: ['CommonTree_1'], kind: 'broad', h: 1.9, cap: 3500, ramp: 'tree_apple', bark: 'tree_apple', overlay: 'apple' },
  bush_a: { src: ['Bush_Common'], kind: 'bush', h: 0.9, cap: 600, ramp: 'bush_leafy' },
  bush_flowering: { src: ['Bush_Common_Flowers'], kind: 'bush', h: 0.9, cap: 600, ramp: 'bush_flowering' },
  bush_berry: { src: ['Bush_Common'], kind: 'bush', h: 0.9, cap: 600, ramp: 'bush_leafy', overlay: 'berry' },
};
const AUT = { tree_oak_autumn: ['tree_round_a', 22], tree_beech_autumn: ['tree_round_b', 36], tree_birch_autumn: ['tree_birch', 48] };
const ids = SPECIES.map((s) => s.id);
ok('T1 SPECIES: exactly the 11 ids of the R1 table, unique, no tree_willow', SPECIES.length === 11 && new Set(ids).size === 11 && ids.every((id) => TABLE[id]) && !ids.includes('tree_willow'),
  `${SPECIES.length} entries: ${ids.join(', ')}`);
const KEYS = new Set(['id', 'source', 'kind', 'height', 'cap', 'ramp', 'barkRamp', 'barkPart', 'bark', 'overlay', 'approved', 'tune', 'far']);
for (const s of SPECIES) {
  const t = TABLE[s.id], why = [];
  if (!t) { ok(`T1 ${s.id}: in the R1 table`, false); continue; }
  for (const k of Object.keys(s)) if (!KEYS.has(k)) why.push(`unexpected field '${k}'`);
  if (!t.src.includes(s.source)) why.push(`source ${s.source} (want ${t.src.join(' or ')})`);
  if (s.kind !== t.kind) why.push(`kind ${s.kind} (want ${t.kind})`);
  if (s.height !== t.h) why.push(`height ${s.height} (want ${t.h})`);
  if (s.cap !== t.cap) why.push(`cap ${s.cap} (want ${t.cap})`);
  if (s.ramp !== t.ramp) why.push(`ramp ${s.ramp} (want ${t.ramp})`);
  else if (!fs.existsSync(path.join(MESHY, s.ramp))) why.push(`no art/meshy/${s.ramp}`);
  if (t.bark === 'birch' ? !(s.bark === 'birch' && s.barkRamp === undefined) : t.bark ? !(s.barkRamp === t.bark && s.bark === undefined) : (s.barkRamp !== undefined || s.bark !== undefined))
    why.push(`bark ${s.bark ?? '-'} / barkRamp ${s.barkRamp ?? '-'} (want ${t.bark ?? 'none (a bush)'})`);
  if ((s.overlay ?? null) !== (t.overlay ?? null)) why.push(`overlay ${s.overlay ?? '-'} (want ${t.overlay ?? '-'})`);
  if (s.approved !== undefined && s.approved !== true) why.push('approved must be true or absent');
  if (s.tune !== undefined && (typeof s.tune !== 'object' || Array.isArray(s.tune))) why.push('tune must be an object');
  if (s.far !== undefined && (typeof s.far !== 'object' || Array.isArray(s.far) || s.kind === 'bush')) why.push('far must be an object, on a tree');
  ok(`T1 ${s.id}: { id, source, kind, height, cap, ramp, barkRamp? / bark?, overlay?, approved? } as the R1 table`, !why.length, why.join('; '));
}
const approved = SPECIES.filter((s) => s.approved).map((s) => s.id).sort().join();
ok('T1 approved: exactly tree_pine_a and bush_flowering', approved === 'bush_flowering,tree_pine_a', approved || 'none');
const autOk = Array.isArray(AUTUMN) && AUTUMN.length === 3 && AUTUMN.every((a) => AUT[a.id] && a.from === AUT[a.id][0] && a.hue === AUT[a.id][1] && ids.includes(a.from) && !ids.includes(a.id) && Object.keys(a).sort().join() === 'from,hue,id');
ok('T1 AUTUMN: 3 { id, from, hue }: oak 22 / beech 36 / birch 48, every `from` in SPECIES', autOk, JSON.stringify(AUTUMN));

// ---- the models ----
const io = new NodeIO();
const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255]; };
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const median = (a) => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : NaN; };
const sd = (a) => { if (!a.length) return 0; let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length); };
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const medianHue = (hs) => { let x = 0, y = 0; for (const h of hs) { x += Math.cos(h * Math.PI / 180); y += Math.sin(h * Math.PI / 180); }
  const off = 180 - Math.atan2(y, x) * 180 / Math.PI; return ((median(hs.map((h) => ((h + off) % 360 + 360) % 360)) - off) % 360 + 360) % 360; };
const decodeTex = (t) => (t.getMimeType() === 'image/png' ? decodePNG(Buffer.from(t.getImage())) : jpeg.decode(Buffer.from(t.getImage()), { useTArray: true, formatAsRGBA: true }));
// the leaf texture's foliage texels (alpha >= 128): hues and luminances
const foliage = (root, id) => { const m = root.listMaterials().find((x) => x.getName() === id + '_leaves'), t = m && m.getBaseColorTexture(); if (!t) return null;
  const img = decodeTex(t), hs = [], ls = []; for (let o = 0; o < img.data.length; o += 4) { if (img.data[o + 3] < 128) continue; hs.push(hsv(img.data[o], img.data[o + 1], img.data[o + 2])[0]); ls.push(lum(img.data[o], img.data[o + 1], img.data[o + 2])); } return { hs, ls }; };

// T5 (bushes): near-horizontal triangles (|face normal y| > 0.9) centred in the bottom 4 % of the height: their count and xz reach
const flatReach = (tris, y0, H) => { const bx = [Infinity, -Infinity], bz = [Infinity, -Infinity]; let n = 0;
  for (const [a, b, c] of tris) { if ((a[1] + b[1] + c[1]) / 3 > y0 + 0.04 * H) continue;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], g = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...g);
    if (!(l > 0) || Math.abs(g[1] / l) <= 0.9) continue; n++;
    for (const v of [a, b, c]) { bx[0] = Math.min(bx[0], v[0]); bx[1] = Math.max(bx[1], v[0]); bz[0] = Math.min(bz[0], v[2]); bz[1] = Math.max(bz[1], v[2]); } }
  return { n, reach: n ? Math.max(bx[1] - bx[0], bz[1] - bz[0]) : 0 }; };
let slabChecked = false;
const all = [...SPECIES.map((s) => ({ id: s.id, s })), ...AUTUMN.map((a) => ({ id: a.id, s: SPECIES.find((x) => x.id === a.from), aut: a }))];
const roots = {};
for (const { id, s, aut } of all) {
  if (!s) continue;
  const file = path.join(RESKIN, id + '.glb');
  console.log(`\n${id}${aut ? ` (autumn of ${aut.from}, hue ${aut.hue})` : ''} <- ${s.source}`);
  if (!fs.existsSync(file)) { ok(`T2 ${id}: art/reskin/${id}.glb exists`, false, 'missing'); continue; }
  const root = (roots[id] = (await io.read(file)).getRoot()), top = root.listScenes()[0].listChildren(), main = top[0], nodes = root.listNodes(), bush = s.kind === 'bush', conifer = s.kind === 'conifer';
  const byName = (n) => nodes.filter((x) => x.getName() === n), canopy = byName('Canopy')[0], crown = byName('Crown')[0];
  let T = 0; const where = [], mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], e = [0, 0, 0], V = [], TR = [];
  for (const n of nodes) { const m = n.getMesh(); if (!m) continue; const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { T += p.getIndices().getCount() / 3; where.push([n.getName(), p.getMaterial()?.getName() ?? '', p.getIndices().getCount() / 3]);
      const A = p.getAttribute('POSITION'), base = V.length; for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e);
        const v = [0, 1, 2].map((k) => w[k] * e[0] + w[4 + k] * e[1] + w[8 + k] * e[2] + w[12 + k]); V.push(v); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } }
      const I = p.getIndices().getArray(); for (let t = 0; t < I.length; t += 3) TR.push([V[base + I[t]], V[base + I[t + 1]], V[base + I[t + 2]]]); } }
  const H = mx[1] - mn[1], wide = Math.max(mx[0] - mn[0], mx[2] - mn[2]), C = {
    [`one root '${id}'`]: top.length === 1 && main.getName() === id, [`<= ${s.cap} tris`]: T <= s.cap, [`height within 3 % of ${s.height}, min y within 0.01 of 0`]: Math.abs(H - s.height) <= 0.03 * s.height && Math.abs(mn[1]) <= 0.01 };
  let reach;
  if (bush) { C['one node'] = nodes.length === 1; reach = flatReach(TR, mn[1], H).reach; C['no ground slab (near-horizontal triangles in the bottom 4 % reach <= 35 % of the xz width)'] = reach <= 0.35 * wide; }
  else {
    C[`structure: bark on the root, leaves on ${conifer ? 'Crown > ' : ''}Canopy`] = (conifer ? main?.listChildren().length === 1 && main.listChildren()[0] === crown && !crown.getMesh() && crown.listChildren().length === 1 && crown.listChildren()[0] === canopy
      : main?.listChildren().length === 1 && main.listChildren()[0] === canopy) && !!canopy?.getMesh();
    const barkHere = where.filter(([, m]) => m === id + '_bark'), leafHere = where.filter(([, m]) => m === id + '_leaves');
    C['bark primitives only on the root'] = barkHere.length > 0 && barkHere.every(([n]) => n === id); C['leaf primitives only on Canopy'] = leafHere.length > 0 && leafHere.every(([n]) => n === 'Canopy');
    const py = canopy ? canopy.getWorldTranslation()[1] : NaN; C['Canopy pivot y between 0.05 and 0.8 x the height'] = py >= 0.05 * H && py <= 0.8 * H;
    const band = V.filter((v) => v[1] <= mn[1] + 0.04 * H), bx = [Infinity, -Infinity], bz = [Infinity, -Infinity];
    for (const v of band) { bx[0] = Math.min(bx[0], v[0]); bx[1] = Math.max(bx[1], v[0]); bz[0] = Math.min(bz[0], v[2]); bz[1] = Math.max(bz[1], v[2]); }
    reach = band.length ? Math.max(bx[1] - bx[0], bz[1] - bz[0]) : 0; C['no ground slab (the bottom 4 % reaches <= 35 % of the xz width)'] = reach <= 0.35 * wide;
  }
  const ov = root.listMaterials().filter((m) => /_overlay$/.test(m.getName())), host = s.overlay === 'apple' ? 'Canopy' : id, on = where.filter(([, mm]) => mm === id + '_overlay').map(([n]) => n), om = ov[0], ot = om?.getBaseColorTexture();
  if (s.overlay) C[`exactly one '${id}_overlay' MASK PNG material, on ${host === 'Canopy' ? 'Canopy' : 'the root'}`] = ov.length === 1 && om.getName() === id + '_overlay' && om.getAlphaMode() === 'MASK' && ot?.getMimeType() === 'image/png' && on.length === 1 && on[0] === host;
  else C['no overlay material'] = !ov.length;
  chk(`T2-T6 ${id}: ${bush ? 'bush' : s.kind} structure, size, height, slab, overlay`, C, `${T} tris (${where.map(([n, m, t]) => `${n}:${m} ${t}`).join(', ')}); height ${H.toFixed(4)}, min y ${mn[1].toFixed(4)}, slab reach ${reach.toFixed(3)} of width ${wide.toFixed(3)}`);
  if (bush && !slabChecked) { slabChecked = true;   // T5s: the bush rule on this bush plus one wide horizontal quad at y 0.01 (a slab) must fail
    const h = 0.45 * wide, y = mn[1] + 0.01, q = [[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h]], g = flatReach([...TR, [q[0], q[1], q[2]], [q[0], q[2], q[3]]], mn[1], H);
    ok(`T5s ${id} + a synthetic slab (one ${(2 * h).toFixed(2)} u quad at y 0.01): the bush slab rule catches it`, g.reach > 0.35 * wide, `reach with the slab ${g.reach.toFixed(3)} of width ${wide.toFixed(3)}`); }
}

// ---- T7: autumn ----
const geom = (root) => { const out = []; for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue;
  m.listPrimitives().forEach((p, i) => out.push({ key: `${n.getName() === root.listScenes()[0].listChildren()[0].getName() ? '<root>' : n.getName()}#${i}`,
    arrays: ['POSITION', 'NORMAL', 'TEXCOORD_0'].map((a) => p.getAttribute(a) ? Buffer.from(p.getAttribute(a).getArray().buffer, p.getAttribute(a).getArray().byteOffset, p.getAttribute(a).getArray().byteLength) : null).concat([Buffer.from(p.getIndices().getArray().buffer, p.getIndices().getArray().byteOffset, p.getIndices().getArray().byteLength)]) })); }
  return out; };
const sameGeom = (r, f) => { const ga = geom(r), gf = geom(f); return ga.length === gf.length && ga.every((g, i) => g.key === gf[i].key && g.arrays.every((b, k) => (b && gf[i].arrays[k] ? b.equals(gf[i].arrays[k]) : b === gf[i].arrays[k]))); };
for (const a of AUTUMN) {
  const r = roots[a.id], f = roots[a.from];
  if (!r || !f) { ok(`T7 ${a.id}: geometry byte-equal to ${a.from}, hue, luminance spread`, false, `missing ${!r ? a.id : a.from}`); continue; }
  const fa = foliage(r, a.id), ff = foliage(f, a.from), mh = fa ? medianHue(fa.hs) : NaN;
  chk(`T7 ${a.id}: geometry byte-equal to ${a.from}, foliage median hue within 12 deg of ${a.hue}, luminance sd >= 0.6 x ${a.from}'s`, { geometry: sameGeom(r, f), hue: !!fa && hueDist(mh, a.hue) <= 12, 'luminance sd': !!fa && !!ff && sd(fa.ls) >= 0.6 * sd(ff.ls) }, `median hue ${mh.toFixed(1)}`);
}

// ---- T8: birch bark ----
for (const id of ['tree_birch', 'tree_birch_autumn']) {
  const r = roots[id], m = r?.listMaterials().find((x) => x.getName() === id + '_bark'), t = m?.getBaseColorTexture();
  if (!t) { ok(`T8 ${id}: birch bark`, false, 'no bark texture'); continue; }
  const img = decodeTex(t), ls = []; for (let o = 0; o < img.data.length; o += 4) ls.push(lum(img.data[o], img.data[o + 1], img.data[o + 2]));
  const dark = ls.filter((v) => v < 0.3).length / ls.length, med = median(ls);
  ok(`T8 ${id}: bark median luminance >= 0.75, 3-10 % of texels darker than 0.3`, med >= 0.75 && dark >= 0.03 && dark <= 0.1, `median ${med.toFixed(3)}, dark ${(100 * dark).toFixed(2)} %`);
}

// ---- T9: the far versions (task 11b) ----
// the far triangle targets (the brief): broadleaf 1,000, the sapling 500, conifers 500; an autumn id as its `from`
const FAR_TRIS = { tree_round_a: 1000, tree_round_b: 1000, tree_spread: 1000, tree_birch: 1000, tree_fruit: 1000, tree_sapling: 500, tree_pine_a: 500, tree_pine_b: 500 };
// welded connected components (vertices merged by position at 1e-5) of one primitive
const weldedComponents = (prim) => { const P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray(), key = new Map(), wid = new Int32Array(P.length / 3);
  for (let i = 0; i < wid.length; i++) { const k = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, key.size); wid[i] = key.get(k); }
  const par = Int32Array.from({ length: key.size }, (_, i) => i), find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < I.length; t += 3) { const a = find(wid[I[t]]); par[find(wid[I[t + 1]])] = a; par[find(wid[I[t + 2]])] = a; }
  const roots = new Set(); for (let t = 0; t < I.length; t += 3) roots.add(find(wid[I[t]])); return roots.size; };
// world bounds and triangles of a root
const boundsOf = (root) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], e = [0, 0, 0]; let T = 0;
  for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { T += p.getIndices().getCount() / 3; const A = p.getAttribute('POSITION');
      for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e); for (let k = 0; k < 3; k++) { const v = w[k] * e[0] + w[4 + k] * e[1] + w[8 + k] * e[2] + w[12 + k]; mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); } } } }
  return { mn, mx, T }; };
// T9d: a far texture is the near image box-downsampled to FAR_TEX² by whole factors (alpha-premultiplied mean; a near image already no larger stays); computed here independently of reskin.mjs
const FAR_TEX = 256, BARK_Q = 85;
const boxDown = (img, W, H) => { const fx = img.width / W, fy = img.height / H, n = fx * fy, d = img.data, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const pm = [0, 0, 0], pl = [0, 0, 0]; let a = 0;
    for (let j = 0; j < fy; j++) for (let i = 0; i < fx; i++) { const o = ((y * fy + j) * img.width + x * fx + i) * 4, al = d[o + 3]; a += al;
      for (let k = 0; k < 3; k++) { pm[k] += Math.round(d[o + k] * al / 255); pl[k] += d[o + k]; } }
    const o = (y * W + x) * 4, A = Math.round(a / n); out[o + 3] = A;
    for (let k = 0; k < 3; k++) out[o + k] = A ? Math.max(0, Math.min(255, Math.round(Math.round(pm[k] / n) * 255 / A))) : Math.round(pl[k] / n); }
  return { width: W, height: H, data: out }; };
// what a near texture's far copy must be: { img } (PNG: compare the decoded pixels) or { bytes } (JPEG: the box encoded at BARK_Q)
const farTexture = (t) => { const img = decodeTex(t), [w, h] = [img.width, img.height];
  if (w <= FAR_TEX && h <= FAR_TEX) return t.getMimeType() === 'image/png' ? { img } : { bytes: Buffer.from(t.getImage()) };
  if (w % FAR_TEX || h % FAR_TEX) return { img: { width: -1, height: -1, data: [] } };   // not a whole factor: no box filter
  const b = boxDown(img, FAR_TEX, FAR_TEX);
  return t.getMimeType() === 'image/png' ? { img: b } : { bytes: Buffer.from(jpeg.encode({ data: b.data, width: FAR_TEX, height: FAR_TEX }, BARK_Q).data) }; };
const farRoots = {};
console.log('');
for (const { id, s, aut } of all) {
  if (!s || s.kind === 'bush') continue;
  const max = FAR_TRIS[aut ? aut.from : id], file = path.join(RESKIN, id + '_far.glb'), near = roots[id];
  if (!fs.existsSync(file)) { ok(`T9 ${id}: art/reskin/${id}_far.glb exists`, false, 'missing'); continue; }
  if (!near) { ok(`T9 ${id}: the near version to compare with`, false, `no art/reskin/${id}.glb`); continue; }
  const r = (await io.read(file)).getRoot(), top = r.listScenes()[0].listChildren(), main = top[0], nodes = r.listNodes();
  const byName = (n) => nodes.filter((x) => x.getName() === n), canopy = byName('Canopy')[0], crown = byName('Crown')[0], conifer = s.kind === 'conifer';
  const B = boundsOf(r), NB = boundsOf(near), H = B.mx[1] - B.mn[1], NH = NB.mx[1] - NB.mn[1];
  const shape = top.length === 1 && main.getName() === id + '_far' && !!main.getMesh() && main.listChildren().length === 1 && nodes.length === (conifer ? 3 : 2) && !!canopy?.getMesh() && !canopy.listChildren().length
    && (conifer ? main.listChildren()[0] === crown && !crown.getMesh() && crown.listChildren().length === 1 && crown.listChildren()[0] === canopy && canopy.getTranslation().every((v) => v === 0) : main.listChildren()[0] === canopy);
  const prims = (n) => (n?.getMesh() ? n.getMesh().listPrimitives() : []), barkP = prims(main), leafP = prims(canopy);
  const named = barkP.length === 1 && barkP[0].getMaterial()?.getName() === id + '_bark' && leafP[0]?.getMaterial()?.getName() === id + '_leaves';
  const nCan = near.listNodes().find((x) => x.getName() === 'Canopy'), pf = canopy ? canopy.getWorldTranslation() : null, pn = nCan ? nCan.getWorldTranslation() : null;
  const dp = pf && pn ? Math.hypot(pf[0] - pn[0], pf[1] - pn[1], pf[2] - pn[2]) : Infinity;
  // the far materials and their downsampled textures
  const why = [], sizes = [], nearMats = new Map(near.listMaterials().map((m) => [m.getName(), m])), farMats = r.listMaterials();
  if (farMats.map((m) => m.getName()).sort().join() !== [...nearMats.keys()].sort().join()) why.push(`materials ${farMats.map((m) => m.getName()).join(', ')} vs near ${[...nearMats.keys()].join(', ')}`);
  for (const fm of farMats) {
    const nm = nearMats.get(fm.getName()); if (!nm) continue;
    const name = fm.getName(), ft = fm.getBaseColorTexture(), nt = nm.getBaseColorTexture(), fi = fm.getBaseColorTextureInfo(), ni = nm.getBaseColorTextureInfo();
    const fields = (m, i) => [m.getAlphaMode(), m.getAlphaCutoff(), m.getDoubleSided(), m.getMetallicFactor(), m.getRoughnessFactor(), i?.getWrapS(), i?.getWrapT(), i?.getMinFilter(), i?.getMagFilter(), i?.getTexCoord()].join(' ');
    if (fields(fm, fi) !== fields(nm, ni)) why.push(`${name}: [${fields(fm, fi)}] vs near [${fields(nm, ni)}]`);
    if (!ft || !nt) { why.push(`${name}: no base-colour texture`); continue; }
    if (ft.getMimeType() !== nt.getMimeType()) { why.push(`${name}: ${ft.getMimeType()} vs near ${nt.getMimeType()}`); continue; }
    const want = farTexture(nt), got = Buffer.from(ft.getImage()), [w, h] = ft.getSize();
    sizes.push(`${name} ${w}x${h} ${(got.length / 1024).toFixed(0)}/${(nt.getImage().length / 1024).toFixed(0)} KB`);
    if (w !== Math.min(FAR_TEX, nt.getSize()[0]) || h !== Math.min(FAR_TEX, nt.getSize()[1])) why.push(`${name}: ${w}x${h} (want ${FAR_TEX}x${FAR_TEX}, or the near's size when smaller)`);
    if (want.bytes) { if (!got.equals(want.bytes)) why.push(`${name}: not the near image, box-downsampled and encoded as before`); }
    else { const a = decodeTex(ft), diff = a.width === want.img.width && a.height === want.img.height ? a.data.reduce((n, v, i) => n + (v !== want.img.data[i]), 0) : -1;
      if (diff) why.push(`${name}: ${diff < 0 ? 'size differs' : diff + ' channel values differ'} from the near image box-downsampled`); }
  }
  const nc = barkP.length === 1 ? weldedComponents(barkP[0]) : -1, ov = r.listMaterials().filter((m) => /_overlay$/.test(m.getName())), ovP = leafP.filter((p) => p.getMaterial()?.getName() === id + '_overlay');
  const apples = s.overlay === 'apple' && !aut;
  chk(`T9 ${id}_far.glb: root '${id}_far' (the bark) > ${conifer ? 'Crown > ' : ''}Canopy (the leaves), <= ${max} tris; height and Canopy pivot as the near; materials and ${FAR_TEX}-px textures as the near; bark one component; ${apples ? '6 apple cards' : 'no overlay'}`, {
    structure: shape && named && B.T <= max, 'height within 3 % of the near, min y within 0.01 of 0': Math.abs(H - NH) <= 0.03 * NH && Math.abs(B.mn[1]) <= 0.01, 'Canopy pivot within 0.01 u of the near': dp <= 0.01,
    [`materials as the near, images box-downsampled to ${FAR_TEX}² (PNG same pixels, JPEG same bytes at q${BARK_Q})`]: !why.length, 'bark one primitive of one connected component': nc === 1,
    [apples ? `6 apple cards (${id}_overlay, two-sided: 24 tris) in Canopy` : 'no overlay']: apples ? ov.length === 1 && ovP.length === 1 && ovP[0].getIndices().getCount() / 3 === 24 && weldedComponents(ovP[0]) === 6 : !ov.length },
    `${B.T} tris (near ${NB.T}); height ${H.toFixed(4)} vs near ${NH.toFixed(4)}; pivot distance ${dp.toFixed(5)}; ${sizes.join('; ')}${why.length ? ' / ' + why.join('; ') : ''}`);
  farRoots[id] = r;
}
// an autumn id's far version is its `from`'s far geometry, byte for byte
for (const a of AUTUMN) {
  const r = farRoots[a.id], f = farRoots[a.from];
  if (!r || !f) { ok(`T9g ${a.id}_far: geometry byte-equal to ${a.from}_far`, false, `missing ${!r ? a.id : a.from}_far`); continue; }
  ok(`T9g ${a.id}_far: geometry byte-equal to ${a.from}_far`, sameGeom(r, f));
}
// ---- T9g: an autumn id's far version is its `from`'s far geometry, byte for byte ----

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
