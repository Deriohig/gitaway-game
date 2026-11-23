// reskin.test.mjs -- reskin.mjs: free CC0 trees (Quaternius Stylized Nature MegaKit) repainted into Gitaway game assets.
// The source pack (~/Downloads or MEGAKIT_DIR) and the concept images (git-ignored; frozen numbers in art/reskin/concept-stats.json) are
// outside git: the test FAILS, never skips, when the pack is missing or a concept image has no frozen numbers.
//   RESKIN_TOOL=<path> runs another copy of the tool; RESKIN_FROM=<dir> checks <dir>/<id>.glb instead of building; RESKIN_COMMITTED=<dir> for RS10.
//   RS0/RS11 inputs: PACK / CONCEPTS exports and env overrides; --all with an empty CONCEPTS_DIR gives the same bytes from the frozen numbers
//   RS1  structure per kind (broad / conifer / bush), one primitive per mesh (overlay host two), core attributes only, Canopy pivot, materials,
//        leaf sides (broadleaf two-sided by duplicated faces; bushes and faceOut single-faced and wound outward, flowers facing up)
//   RS2  height within 1 %, min y 0, triangles under the cap, thinned only as far as needed (or exactly the trim floor), never below the floor
//   RS3  leaf alpha byte-equal to the source's after the same resize
//   RS4  repaint: hue near the concept ramp (autumn: its target), luminance spread, p10/p90 and cooler shadows like the concept, pink flowers
//   RS5  deterministic   RS6/RS7 bark: conifer = trunk only, broadleaf loses exactly the hidden components (computed independently here)
//   RS8  owner-approved GLBs pinned by sha256   RS9 apple / berry overlay cards: count, size, two-sided, placement, colour
//   RS10 --all output is byte-identical to the committed art/reskin files (RS10s: a flipped byte is caught)   RS12 limits checked before writing
//   RS13 conifers, near and far: same crown all round (6 height bands x 8 sectors), crown centroid and trunk on the axis (round-1 fir was lopsided and bent)
//   node tests/reskin.test.mjs     (CONCEPTS_DIR=<empty dir> node tests/reskin.test.mjs: the whole test on the frozen numbers)
import { NodeIO } from '@gltf-transform/core';
import jpeg from 'jpeg-js';
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { crop, decodePNG, resizeBilinear } from '../lib/png.mjs';
import { SPECIES, AUTUMN } from '../lib/species.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), TOOL = process.env.RESKIN_TOOL || path.join(here, '..', 'reskin.mjs'), FROM = process.env.RESKIN_FROM || '';
// RS8 pins: tree_pine_a as the fir fix rebuilt it, bush_flowering as recoloured (older pins retired with the owner-approved rebuilds)
const SHA = { tree_pine_a: 'ec42bff222a8d94ac05ba22227d3f38e896d09b464f9cb6235e65f62cb908125', bush_flowering: '401960cb96553818f7670ca97daed824ab45876dff8edd904666fdca81842a0c' };
const FLOOR = { broad: 0.6, conifer: 0.6, bush: 0 };
const OV = { apple: { count: 12, size: [0.07, 0.09] }, berry: { count: 30, size: [0.06, 0.09] } };
const CASES = [...SPECIES.map((s) => ({ id: s.id, s })), ...AUTUMN.map((a) => ({ id: a.id, s: SPECIES.find((x) => x.id === a.from), aut: a }))].map(({ id, s, aut }) => ({
  id, src: s.source, kind: s.kind, h: s.height, cap: s.cap, concept: s.ramp, approved: !!s.approved && !aut, overlay: aut ? null : s.overlay ?? null, aut, tune: s.tune || {},
  green: !aut && s.kind !== 'conifer' })).map((c) => ({ ...c, dup: c.kind === 'broad' && c.tune.sides !== 'faceOut', faceOut: c.kind === 'bush' || c.tune.sides === 'faceOut' }));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
// one assertion per subject: `checks` maps label -> condition; failing labels lead the detail
const all = (name, checks, detail = '') => { const bad = Object.keys(checks).filter((k) => !checks[k]); ok(name, !bad.length, (bad.length ? `failed: ${bad.join('; ')}\n        ` : '') + detail); };
const done = () => { console.log(`\n${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0); };

// ---- RS0: the tool's inputs (ruling R23) and its concept numbers (RS4 compares against them) ----
let tool = null, toolErr = '';
try { tool = await import(pathToFileURL(TOOL).href); } catch (e) { toolErr = String(e.message || e).split('\n')[0]; }
const api = ['PACK', 'CONCEPTS', 'CONCEPT_STATS', 'conceptRamp'].filter((k) => !tool || tool[k] === undefined);
const envProbe = api.length ? null : spawnSync('node', ['--input-type=module', '-e', `const m = await import(${JSON.stringify(pathToFileURL(TOOL).href)}); console.log(JSON.stringify([m.PACK, m.CONCEPTS]));`],
  { encoding: 'utf8', env: { ...process.env, MEGAKIT_DIR: '/x/megakit', CONCEPTS_DIR: '/x/concepts' } });
const envGot = envProbe && envProbe.status === 0 ? JSON.parse(envProbe.stdout.trim().split('\n').pop()) : null;
ok('RS0 inputs: reskin.mjs exports PACK (MEGAKIT_DIR/glTF, else the default download), CONCEPTS (CONCEPTS_DIR, else art/meshy), CONCEPT_STATS and conceptRamp; the env overrides both',
  !api.length && !!envGot && envGot[0] === '/x/megakit/glTF' && envGot[1] === '/x/concepts',
  api.length ? `missing exports: ${api.join(', ')}${toolErr ? ' (' + toolErr + ')' : ''}` : `PACK ${tool.PACK}, CONCEPTS ${tool.CONCEPTS}; with the env: ${envGot ? envGot.join(', ') : 'no answer: ' + ((envProbe && envProbe.stderr) || '').split('\n')[0]}`);
if (api.length) done();
const { PACK, CONCEPTS, CONCEPT_STATS } = tool;
const conceptPng = (folder) => path.join(CONCEPTS, folder, 'source', 'concept_1.png');
const FROZEN = fs.existsSync(CONCEPT_STATS) ? JSON.parse(fs.readFileSync(CONCEPT_STATS, 'utf8')).folders || {} : {};

// ---- fixtures: the pack (always) and each concept image (or its frozen numbers in art/reskin/concept-stats.json) ----
const FOLDERS = [...new Set(CASES.map((c) => c.concept))];
const missing = [...new Set(CASES.map((c) => path.join(PACK, c.src + '.gltf')))].filter((f) => !fs.existsSync(f))
  .concat(FOLDERS.filter((f) => !fs.existsSync(conceptPng(f)) && !FROZEN[f]).map((f) => `${conceptPng(f)} (and no frozen numbers for ${f} in ${CONCEPT_STATS})`));
if (missing.length) { ok('fixtures: the MegaKit sources, and each concept image or its frozen numbers, are present', false, 'missing:\n        ' + missing.join('\n        ')); done(); }
const PNGS = FOLDERS.filter((f) => fs.existsSync(conceptPng(f)));
console.log(`  concepts: ${PNGS.length} of ${FOLDERS.length} images in ${CONCEPTS}${PNGS.length < FOLDERS.length ? `; the rest from ${path.basename(CONCEPT_STATS)}` : ''}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reskin-test-'));
const io = new NodeIO();
const run = (c, out) => spawnSync('node', [TOOL, '--recipe', c.id, out], { encoding: 'utf8', maxBuffer: 1 << 26 });
const spawnP = (args, env = {}) => new Promise((resolve) => { const p = spawn('node', args, { env: { ...process.env, ...env } }); let out = '', err = '';
  p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; }); p.on('close', (status) => resolve({ status, stdout: out, stderr: err })); });
const resultsOf = (r) => r.stdout.split('\n').filter((l) => l.startsWith('RESULT ')).map((l) => JSON.parse(l.slice(7)));
// one `--all` run builds every id and far version (RS10 compares them with the committed files); RS11 does the same with CONCEPTS_DIR = an empty dir
const ALL = path.join(tmp, 'all'), HID = path.join(tmp, 'hidden'), NOCON = path.join(tmp, 'noconcepts'); fs.mkdirSync(NOCON);
const [allRun, hidRun] = FROM ? [null, null] : await Promise.all([spawnP([TOOL, '--all', '--out', ALL]), spawnP([TOOL, '--all', '--out', HID], { CONCEPTS_DIR: NOCON })]);
const allResults = allRun ? resultsOf(allRun) : [];
const results = {};
for (const c of CASES) {
  if (FROM) { const out = path.join(FROM, c.id + '.glb'); results[c.id] = { out, status: fs.existsSync(out) ? 0 : 1, err: fs.existsSync(out) ? '' : 'no ' + out, result: null, ok: fs.existsSync(out) }; continue; }
  const out = path.join(ALL, c.id + '.glb'), result = allResults.find((x) => x.id === c.id) || null;
  results[c.id] = { out, status: result ? 0 : allRun.status || 1, err: result ? '' : (allRun.stderr || '').split('\n').filter(Boolean).slice(0, 4).join(' | '), result, ok: !!result && fs.existsSync(out) };
}

// ---- helpers ----
const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx / 255]; };
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const median = (a) => { const s = Float64Array.from(a).sort(); return s.length ? s[s.length >> 1] : NaN; };
const sd = (a) => { if (!a.length) return 0; let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / a.length); };
const meanHue = (hs) => { let x = 0, y = 0; for (const h of hs) { x += Math.cos(h * Math.PI / 180); y += Math.sin(h * Math.PI / 180); } return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360; };
// circular median hue: rotate so the circular mean sits at 180, take the plain median, rotate back
const medianHue = (hs) => { const off = 180 - meanHue(hs); return ((median(hs.map((h) => ((h + off) % 360 + 360) % 360)) - off) % 360 + 360) % 360; };
const region = (img, R) => (R ? crop(img, R.x, R.y, R.w, R.h) : img);
// opaque texels' hue / luminance (alpha >= 128)
const stats = (img) => { const hs = [], ls = [], ss = [], vs = []; for (let o = 0; o < img.data.length; o += 4) { if (img.data[o + 3] < 128) continue; const [h, s, v] = hsv(img.data[o], img.data[o + 1], img.data[o + 2]); hs.push(h); ss.push(s); vs.push(v); ls.push(lum(img.data[o], img.data[o + 1], img.data[o + 2])); } return { hs, ls, ss, vs }; };
const alphaOf = (img) => { const a = new Uint8Array(img.width * img.height); for (let i = 0; i < a.length; i++) a[i] = img.data[i * 4 + 3]; return a; };
const decodeAny = (bytes, mime) => (mime === 'image/png' ? decodePNG(Buffer.from(bytes)) : jpeg.decode(Buffer.from(bytes), { useTArray: true, formatAsRGBA: true }));
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
// the concept's foliage pixels (independent of the tool): luminance p10 / p90 and the hue gap of the darkest / brightest 20 %; frozen numbers when the image is absent
const conceptCache = {};
const conceptFoliage = (folder) => { if (conceptCache[folder]) return conceptCache[folder];
  if (!fs.existsSync(conceptPng(folder))) { const f = FROZEN[folder].foliage; return (conceptCache[folder] = { p10: f.p10, p90: f.p90, gap: f.gap20, n: f.n, frozen: true }); }
  const img = decodePNG(fs.readFileSync(conceptPng(folder))), { width: W, height: H, data: D } = img, corner = [];
  for (const [cx, cy] of [[0, 0], [W - 16, 0], [0, H - 16], [W - 16, H - 16]]) for (let y = cy; y < cy + 16; y++) for (let x = cx; x < cx + 16; x++) corner.push((y * W + x) * 4);
  const bg = [0, 1, 2].map((k) => corner.map((o) => D[o + k]).sort((a, b) => a - b)[corner.length >> 1]), px = [];
  for (let o = 0; o < D.length; o += 4) { const r = D[o], g = D[o + 1], b = D[o + 2]; if (Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2])) < 14) continue;
    const [h, s, v] = hsv(r, g, b); if (h >= 55 && h <= 175 && s >= 0.18 && v >= 0.1) px.push([lum(r, g, b), h]); }
  px.sort((a, b) => a[0] - b[0]); const ls = px.map((p) => p[0]), n = px.length;
  const gap = ((meanHue(px.slice(0, Math.floor(0.2 * n)).map((p) => p[1])) - meanHue(px.slice(Math.floor(0.8 * n)).map((p) => p[1])) + 540) % 360) - 180;
  return (conceptCache[folder] = { p10: pct(ls, 0.1), p90: pct(ls, 0.9), gap, n }); };
// welded connected components: their triangles, vertices and centre (the mean of their triangles' corners)
const comps3 = (P, I) => { const key = new Map(), wid = new Int32Array(P.length / 3);
  for (let i = 0; i < wid.length; i++) { const k = `${Math.round(P[i * 3] * 1e5)},${Math.round(P[i * 3 + 1] * 1e5)},${Math.round(P[i * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, key.size); wid[i] = key.get(k); }
  const par = Int32Array.from({ length: key.size }, (_, i) => i), find = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < I.length; t += 3) { const a = find(wid[I[t]]); par[find(wid[I[t + 1]])] = a; par[find(wid[I[t + 2]])] = a; }
  const by = new Map(), out = [];
  for (let t = 0; t < I.length / 3; t++) { const r = find(wid[I[t * 3]]); let c = by.get(r); if (!c) { by.set(r, (c = { tris: [], verts: new Set(), sum: [0, 0, 0], n: 0 })); out.push(c); } c.tris.push(t);
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; c.verts.add(v); for (let q = 0; q < 3; q++) c.sum[q] += P[v * 3 + q]; c.n++; } }
  for (const c of out) c.c = c.sum.map((s) => s / c.n);
  return out; };
const cards = (prim) => comps3(prim.getAttribute('POSITION').getArray(), prim.getIndices().getArray()).map((c) => c.tris.length);
const tris = (prim) => prim.getIndices().getCount() / 3;
function hiddenBarkOf(bark, leaves) {
  const LP = leaves.getAttribute('POSITION').getArray(), LI = leaves.getIndices().getArray(), BP = bark.getAttribute('POSITION').getArray(), BI = bark.getIndices().getArray();
  const cardsL = comps3(LP, LI), cen = [0, 0, 0]; for (const c of cardsL) for (let k = 0; k < 3; k++) cen[k] += c.c[k] / cardsL.length;
  let leafMinY = Infinity; const pts = [];
  for (let i = 0; i < LP.length; i += 3) { leafMinY = Math.min(leafMinY, LP[i + 1]); pts.push(new THREE.Vector3(...[0, 1, 2].map((k) => cen[k] + (LP[i + k] - cen[k]) * 0.9))); }
  const hull = new ConvexHull().setFromPoints(pts), p = new THREE.Vector3();
  let low = 0; for (let i = 1; i < BP.length / 3; i++) if (BP[i * 3 + 1] < BP[low * 3 + 1]) low = i;
  return comps3(BP, BI).map((c) => { let inside = 0, below = 0; for (const v of c.verts) { p.set(BP[v * 3], BP[v * 3 + 1], BP[v * 3 + 2]); if (hull.containsPoint(p)) inside++; if (p.y < leafMinY) below++; }
    const trunk = c.verts.has(low); return { first: c.tris[0], tris: c.tris.length, trunk, inside: inside / c.verts.size, below, hidden: !trunk && inside >= 0.9 * c.verts.size && below === 0 }; });
}
const triDist = (p, a, b, c) => { const t = new THREE.Triangle(a, b, c), q = new THREE.Vector3(); t.closestPointToPoint(p, q); return q.distanceTo(p); };
const tree = (n, d = 0) => '  '.repeat(d) + n.getName() + (n.getMesh() ? ` [mesh ${n.getMesh().listPrimitives().length}p]` : '') + '\n' + n.listChildren().map((k) => tree(k, d + 1)).join('');
const treeOf = (r) => r.listScenes()[0].listChildren().map((n) => tree(n)).join('').trim().replace(/\n/g, ' / ');
const sha = (f) => (fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : 'missing');
// RS13 measure of a conifer: leaf surface in 6 height bands x 8 azimuth sectors about the trunk axis (max radius, centroid), and the trunk centre per eighth of its height
const SYM = { bands: 6, sectors: 8, ratio: 1.6, centroid: 0.05, trunk: 0.03 };
function crownShape(root) {
  const world = (node, prim) => { const w = node.getWorldMatrix(), A = prim.getAttribute('POSITION'), e = [0, 0, 0], out = [];
    for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e); out.push([0, 1, 2].map((k) => w[k] * e[0] + w[4 + k] * e[1] + w[8 + k] * e[2] + w[12 + k])); } return out; };
  // the leaves' surface, not only their vertices (a simplified far frond keeps few): every triangle sampled on a barycentric grid (step 1/4)
  const surface = (P, I) => { const out = []; for (let t = 0; t < I.length; t += 3) { const [a, b, c] = [P[I[t]], P[I[t + 1]], P[I[t + 2]]];
    for (let i = 0; i <= 4; i++) for (let j = 0; i + j <= 4; j++) { const u = i / 4, v = j / 4; out.push([0, 1, 2].map((k) => a[k] * (1 - u - v) + b[k] * u + c[k] * v)); } } return out; };
  const canopy = root.listNodes().find((n) => n.getName() === 'Canopy'), top = root.listScenes()[0].listChildren()[0];
  if (!canopy?.getMesh() || !top?.getMesh()) return null;
  const lp = canopy.getMesh().listPrimitives()[0], L = surface(world(canopy, lp), lp.getIndices().getArray()), B = world(top, top.getMesh().listPrimitives()[0]);
  let y0 = Infinity, y1 = -Infinity, H = 0; for (const p of L) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } for (const p of [...L, ...B]) H = Math.max(H, p[1]);
  const bands = Array.from({ length: SYM.bands }, () => ({ r: new Array(SYM.sectors).fill(0), n: new Array(SYM.sectors).fill(0), cx: 0, cz: 0, m: 0 }));
  for (const [x, y, z] of L) { const b = bands[Math.min(SYM.bands - 1, Math.floor((y - y0) / (y1 - y0) * SYM.bands))], s = Math.min(SYM.sectors - 1, Math.floor((Math.atan2(z, x) + Math.PI) / (2 * Math.PI) * SYM.sectors));
    b.r[s] = Math.max(b.r[s], Math.hypot(x, z)); b.n[s]++; b.cx += x; b.cz += z; b.m++; }
  const out = bands.map((b) => ({ ratio: Math.min(...b.r) > 0 ? Math.max(...b.r) / Math.min(...b.r) : Infinity, empty: b.n.filter((k) => !k).length, off: Math.hypot(b.cx / b.m, b.cz / b.m) }));
  let t0 = Infinity, t1 = -Infinity; for (const p of B) { t0 = Math.min(t0, p[1]); t1 = Math.max(t1, p[1]); }
  const sl = Array.from({ length: 8 }, () => [0, 0, 0]), lo = t0 + 0.15 * (t1 - t0);
  for (const [x, y, z] of B) { if (y < lo) continue; const s = sl[Math.min(7, Math.floor((y - lo) / (t1 - lo) * 8))]; s[0] += x; s[1] += z; s[2]++; }
  return { H, bands: out, trunkOff: Math.max(...sl.filter((s) => s[2]).map((s) => Math.hypot(s[0] / s[2], s[1] / s[2]))) };
}

// the source models, by role (bark / leaves / flowers)
const source = {};
for (const c of CASES) {
  if (source[c.src]) continue;
  const r = (await io.read(path.join(PACK, c.src + '.gltf'))).getRoot(), prims = r.listMeshes().flatMap((m) => m.listPrimitives());
  const role = (p) => (/bark/i.test(p.getMaterial().getName()) ? 'bark' : /flower/i.test(p.getMaterial().getName()) ? 'flowers' : 'leaves');
  source[c.src] = Object.fromEntries(prims.map((p) => [role(p), p]));
}

for (const c of CASES) {
  const R = results[c.id], S = source[c.src];
  console.log(`\n${c.id} <- ${c.src} (${c.kind}, H ${c.h}, cap ${c.cap}${c.aut ? `, autumn of ${c.aut.from} at ${c.aut.hue} deg` : ''}${c.overlay ? ', overlay ' + c.overlay : ''})`);
  if (!R.ok) { ok(`RS ${c.id}: reskin.mjs --all builds ${c.id}`, false, `exit ${R.status}: ${R.err || '(no stderr)'}`); continue; }
  const root = (await io.read(R.out)).getRoot(), byName = (n) => root.listNodes().filter((x) => x.getName() === n);
  const top = root.listScenes()[0].listChildren(), main = byName(c.id)[0], canopy = byName('Canopy')[0], crown = byName('Crown')[0];
  const meshes = root.listMeshes(), allPrims = meshes.flatMap((m) => m.listPrimitives());
  const host = c.overlay === 'apple' ? canopy : c.overlay === 'berry' ? main : null, foliage = (c.kind === 'bush' ? main : canopy)?.getMesh()?.listPrimitives()[0];

  // ---- RS1 ----
  const sole = top.length === 1 && top[0] === main && !!main?.getMesh(), kids = (n) => n.listChildren(), mats = root.listMaterials(), mat = (n) => mats.find((m) => m.getName() === n), srcLeaf = S.leaves.getMaterial();
  const shape = { broad: () => sole && kids(main).length === 1 && kids(main)[0] === canopy && !!canopy.getMesh() && !kids(canopy).length && !crown && root.listNodes().length === 2,
    conifer: () => sole && kids(main).length === 1 && kids(main)[0] === crown && !crown.getMesh() && kids(crown).length === 1 && kids(crown)[0] === canopy && !!canopy.getMesh() && canopy.getTranslation().every((v) => v === 0) && root.listNodes().length === 3,
    bush: () => sole && !kids(main).length && root.listNodes().length === 1 }[c.kind]();
  let ly = Infinity; if (canopy?.getMesh()) { const A = canopy.getMesh().listPrimitives()[0].getAttribute('POSITION').getArray(); for (let i = 1; i < A.length; i += 3) ly = Math.min(ly, A[i]); }
  const piv = canopy?.getMesh() ? canopy.getWorldTranslation() : [NaN, NaN, NaN];
  const mirrored = (p) => { const I = p?.getIndices().getArray(), half = I ? I.length / 2 : 0; if (!(half % 3 === 0 && half > 0)) return false; for (let t = 0; t < half; t += 3) if (I[half + t] !== I[t] || I[half + t + 1] !== I[t + 2] || I[half + t + 2] !== I[t + 1]) return false; return true; };
  const png512 = (t, mime) => t?.getMimeType() === mime && Math.max(...t.getSize()) <= 512;
  const om = c.overlay ? mat(c.id + '_overlay') : null, ot = om?.getBaseColorTexture(), bush = c.kind === 'bush', lm = mat(bush ? c.id : c.id + '_leaves'), bark = bush ? null : mat(c.id + '_bark');
  const ovMatOk = !c.overlay || (!!om && om.getAlphaMode() === 'MASK' && om.getDoubleSided() === false && om.getMetallicFactor() === 0 && om.getRoughnessFactor() === 1 && png512(ot, 'image/png') && host?.getMesh()?.listPrimitives()[1]?.getMaterial() === om);
  const S1 = { 'node structure': shape, 'one primitive per mesh (the overlay host two), POSITION / NORMAL / TEXCOORD_0 only': meshes.length > 0 && root.listNodes().every((n) => !n.getMesh() || n.getMesh().listPrimitives().length === (n === host ? 2 : 1)) && allPrims.every((p) => p.listSemantics().slice().sort().join() === 'NORMAL,POSITION,TEXCOORD_0'),
    'core glTF, no extensions': root.listExtensionsUsed().length === 0, 'material count and overlay material (MASK PNG <= 512, single-sided)': mats.length === 1 + (bush ? 0 : 1) + (c.overlay ? 1 : 0) && ovMatOk,
    "leaf material: MASK at the source's cutoff, metallic 0, roughness 1, PNG <= 512, on the foliage; single-sided when duplicated or wound outward, else as the source": !!lm && lm.getAlphaMode() === 'MASK' && Math.abs(lm.getAlphaCutoff() - srcLeaf.getAlphaCutoff()) < 1e-6 && lm.getMetallicFactor() === 0 && lm.getRoughnessFactor() === 1 && png512(lm.getBaseColorTexture(), 'image/png') && foliage?.getMaterial() === lm && lm.getDoubleSided() === (c.dup || c.faceOut ? false : srcLeaf.getDoubleSided()) };
  if (!bush) { S1["Canopy pivot on the trunk axis (x, z = 0) at the leaves' lowest y"] = Math.abs(piv[0]) < 1e-6 && Math.abs(piv[2]) < 1e-6 && Math.abs(ly) < 1e-5 && piv[1] > 0; S1['bark: OPAQUE JPEG <= 512 on the trunk'] = !!bark && bark.getAlphaMode() === 'OPAQUE' && png512(bark.getBaseColorTexture(), 'image/jpeg') && main.getMesh().listPrimitives()[0].getMaterial() === bark; }
  if (c.dup) S1['leaves two-sided by duplicated faces (second half of the triangles = the first wound the other way)'] = mirrored(foliage);
  all(`RS1 ${c.id}: ${c.kind} structure, materials, leaf sides`, S1, `tree: ${treeOf(root)}; pivot ${piv.map((v) => v.toFixed(4)).join(', ')}, local min y ${ly.toExponential(2)}`);
  if (c.faceOut && foliage) {   // single-faced leaves wound outward: each triangle's face normal on the side of its smooth normals;
    // flowers (their UVs in the atlas's pink / cream regions; without a RESULT, outside its top-left leaf quarter) wound to face up
    const P = foliage.getAttribute('POSITION').getArray(), N = foliage.getAttribute('NORMAL').getArray(), U = foliage.getAttribute('TEXCOORD_0').getArray(), I = foliage.getIndices().getArray();
    const TW = (c.kind === 'bush' ? mat(c.id) : mat(c.id + '_leaves'))?.getBaseColorTexture()?.getSize()?.[0] || 512, A = R.result?.atlas;
    const inR = (u, v, r) => r && u * TW >= r.x && u * TW < r.x + r.w && v * TW >= r.y && v * TW < r.y + r.h;
    const isFlower = (u, v) => (S.flowers ? (A ? inR(u, v, A.pink) || inR(u, v, A.cream) : u >= 0.5 || v >= 0.5) : false);
    let bad = 0, badF = 0, nF = 0;
    for (let t = 0; t < I.length; t += 3) { const [a, b, d] = [I[t], I[t + 1], I[t + 2]], u = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]), w = [0, 1, 2].map((k) => P[d * 3 + k] - P[a * 3 + k]);
      const g = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (isFlower((U[a * 2] + U[b * 2] + U[d * 2]) / 3, (U[a * 2 + 1] + U[b * 2 + 1] + U[d * 2 + 1]) / 3)) { nF++; if (g[1] < 0) badF++; }
      else if ([0, 1, 2].reduce((s2, k) => s2 + g[k] * (N[a * 3 + k] + N[b * 3 + k] + N[d * 3 + k]), 0) < 0) bad++; }
    ok(`RS1g ${c.id}: leaves single-faced and wound outward (every leaf triangle faces along its smooth normals)${S.flowers ? ', every flower triangle facing up' : ''}`, bad === 0 && badF === 0 && (!S.flowers || nF > 0),
      `${bad} of ${I.length / 3 - nF} leaf triangles face inward${S.flowers ? `; ${badF} of ${nF} flower triangles face down` : ''}`);
  }
  ok(`RS1e ${c.id}: core glTF, no extensions`, root.listExtensionsUsed().length === 0, root.listExtensionsUsed().map((e) => e.extensionName).join(', '));

  // ---- RS2 ----
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], e = [0, 0, 0]; let T = 0;
  for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { T += tris(p); const A = p.getAttribute('POSITION'); for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e);
      const v = [w[0] * e[0] + w[4] * e[1] + w[8] * e[2] + w[12], w[1] * e[0] + w[5] * e[1] + w[9] * e[2] + w[13], w[2] * e[0] + w[6] * e[1] + w[10] * e[2] + w[14]];
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } } } }
  const H = mx[1] - mn[1];
  const srcCards = [...cards(S.leaves), ...(S.flowers ? cards(S.flowers) : [])], srcTotal = Object.values(S).reduce((s, p) => s + tris(p), 0);
  const outCards = foliage ? cards(foliage) : [], unit = Math.min(...srcCards) * (c.dup ? 2 : 1);
  const floor = c.tune.trim ?? c.tune.minKeep ?? FLOOR[c.kind], floorN = Math.ceil(floor * srcCards.length);
  const needed = c.tune.trim ? outCards.length === floorN : outCards.length === srcCards.length || T + unit > c.cap;
  all(`RS2 ${c.id}: height within 1 % of ${c.h}, min y within 0.005 of 0, triangles <= the cap ${c.cap}, ${c.tune.trim ? `trimmed to exactly its floor (${floorN} cards)` : 'thinned only as far as needed'}${c.kind === 'bush' ? '' : `, >= ${(floor * 100).toFixed(0)} % of the leaf cards kept`}`,
    { height: Math.abs(H - c.h) <= 0.01 * c.h, 'min y': Math.abs(mn[1]) <= 0.005, cap: T <= c.cap, thinning: needed, 'card floor': c.kind === 'bush' || outCards.length >= floorN },
    `height ${H.toFixed(4)}, min y ${mn[1].toFixed(5)}, tris ${T} (source ${srcTotal}), cards ${outCards.length} of ${srcCards.length}, smallest card ${unit} tris`);

  // ---- RS3 ----
  const leafTex = (c.kind === 'bush' ? mat(c.id) : mat(c.id + '_leaves'))?.getBaseColorTexture();
  const outImg = leafTex ? decodeAny(leafTex.getImage(), leafTex.getMimeType()) : null;
  const srcLeafImg = R.result?.leafTex ? decodePNG(fs.readFileSync(path.join(PACK, R.result.leafTex))) : decodePNG(Buffer.from(srcLeaf.getBaseColorTexture().getImage()));
  // the leaf texture is an atlas (RESULT.atlas): leaf cells (each the whole source leaf texture resized) and, for the flowering bush, pink / cream flower crops
  const atlas = R.result?.atlas, cellsOf = Array.isArray(atlas?.leaves) ? atlas.leaves : [];
  {
    const flowerSrc = S.flowers ? decodePNG(Buffer.from(S.flowers.getMaterial().getBaseColorTexture().getImage())) : null;
    const regions = [...cellsOf.map((A, k) => [`leaves cell ${k}`, srcLeafImg, A]), ...(S.flowers ? [['pink', flowerSrc, atlas?.pink], ['cream', flowerSrc, atlas?.cream]] : [])];
    const bad = [];
    if (!cellsOf.length) bad.push('no leaf cells in RESULT.atlas');
    for (const [name, src, A] of regions) { if (!A || !outImg) { bad.push(name + ': no region'); continue; }
      const want = alphaOf(resizeBilinear(A.crop ? crop(src, ...A.crop) : src, A.w, A.h)), got = alphaOf(region(outImg, A));
      let diff = 0; for (let i = 0; i < want.length; i++) if (want[i] !== got[i]) diff++; if (diff) bad.push(`${name}: ${diff} texels differ`); }
    ok(`RS3 ${c.id}: the leaf texture's alpha is byte-equal to the source's after the same resize, in every atlas region`, !bad.length,
      `${srcLeafImg.width}x${srcLeafImg.height} -> ${regions.map(([n, , A]) => (A ? `${n} ${A.w}x${A.h}@${A.x},${A.y}` : n)).join('; ')}${bad.length ? ' / ' + bad.join(', ') : ''}`);
  }

  // ---- RS4 ----
  const fol = { hs: [], ls: [] };
  if (outImg) for (const A of cellsOf.length ? cellsOf : [null]) { const st = stats(region(outImg, A)); for (let i = 0; i < st.hs.length; i++) { fol.hs.push(st.hs[i]); fol.ls.push(st.ls[i]); } }
  if (outImg) {
    const ramp = tool.conceptRamp(c.concept, 'foliage'), mid = hsv(...ramp.stops[1])[0], src = stats(resizeBilinear(srcLeafImg, cellsOf[0]?.w ?? 256, cellsOf[0]?.h ?? 256));
    const mh = medianHue(fol.hs), s1 = sd(fol.ls), s0 = sd(src.ls), R4 = {
      [c.aut ? `median hue within 12 deg of the autumn target ${c.aut.hue}` : `median hue within 15 deg of the ${c.concept} ramp's mid-stop`]: hueDist(mh, c.aut ? c.aut.hue : mid) <= (c.aut ? 12 : 15),
      "luminance sd >= 0.6 x the source's and >= 0.3 x the concept foliage's (painted, not flat)": s1 >= 0.6 * s0 && s1 >= 0.3 * ramp.sd };
    if (S.flowers && atlas?.pink) { // the petals (saturation >= 0.15; the pale heart's hue means little)
      const st = stats(region(outImg, atlas.pink)); R4["pink flowers' median hue within 15 deg of the concept's pink"] = hueDist(medianHue(st.hs.filter((_, i) => st.ss[i] >= 0.15)), hsv(...tool.conceptRamp(c.concept, 'pink').stops[1])[0]) <= 15; }
    all(`RS4 ${c.id}: repainted foliage`, R4, `median hue ${mh.toFixed(1)}, mid-stop ${mid.toFixed(1)}; sd ${s1.toFixed(4)}, source ${s0.toFixed(4)}, concept foliage ${ramp.sd.toFixed(4)}`);
  } else ok(`RS4 ${c.id}: the repainted foliage`, false, 'no leaf texture');
  if (c.green) {   // RS4c needs no RESULT (the R1 leaf textures hold only leaves)
    const cf = conceptFoliage(c.concept), idx = fol.ls.map((_, i) => i).sort((a, b) => fol.ls[a] - fol.ls[b]), sl = idx.map((i) => fol.ls[i]);
    const n = idx.length, p10 = n ? pct(sl, 0.1) : NaN, p90 = n ? pct(sl, 0.9) : NaN;
    const hDark = meanHue(idx.slice(0, Math.floor(0.2 * n)).map((i) => fol.hs[i])), hBright = meanHue(idx.slice(Math.floor(0.8 * n)).map((i) => fol.hs[i]));
    const cool = ((hDark - hBright + 540) % 360) - 180, need = Math.min(25, cf.gap);
    ok(`RS4c ${c.id}: foliage luminance p10 / p90 within 0.08 of the ${c.concept} concept's, the darkest 20 % >= ${need.toFixed(1)} deg cooler than the brightest 20 %`,
      n > 0 && Math.abs(p10 - cf.p10) <= 0.08 && Math.abs(p90 - cf.p90) <= 0.08 && cool >= need,
      `p10 ${p10.toFixed(3)} vs ${cf.p10.toFixed(3)}, p90 ${p90.toFixed(3)} vs ${cf.p90.toFixed(3)}; hue dark ${hDark.toFixed(1)} - bright ${hBright.toFixed(1)} = ${cool.toFixed(1)} deg (concept ${cf.gap.toFixed(1)}${cf.frozen ? ', frozen' : ''})`);
  }

  // ---- RS5 ----
  if (!FROM && ['tree_round_a', 'tree_fruit', 'bush_berry'].includes(c.id)) {
    const again = path.join(tmp, c.id + '_again.glb'), r2 = run(c, again);
    ok(`RS5 ${c.id}: two runs (--all, then --recipe ${c.id}) give byte-identical GLBs`, r2.status === 0 && sha(R.out) === sha(again), `${sha(R.out).slice(0, 16)} vs ${sha(again).slice(0, 16)}`);
  }

  // ---- RS6, RS7 ----
  if (c.kind !== 'bush') {
    const bt = main?.getMesh() ? tris(main.getMesh().listPrimitives()[0]) : -1, st = tris(S.bark);
    const comps = hiddenBarkOf(S.bark, S.leaves), trunk = comps.find((x) => x.trunk);
    // (a conifer, rebuilt round a straight trunk: reskin.mjs step 3c; RS13c holds it straight)
    if (c.kind === 'conifer') { const lo = Math.min(trunk.tris, tool.FIR?.barkMin ?? 180) - 2;
      ok(`RS6 ${c.id}: conifer: the bark is the source's trunk alone, simplified to the cap's slack: <= its ${trunk.tris} tris, >= ${lo} (FIR.barkMin)`, bt <= trunk.tris && bt >= lo,
        `bark ${bt}, trunk ${trunk.tris} (source ${st}, ${comps.length} components)`); }
    else if (c.tune.trunkOnly) ok(`RS6 ${c.id}: trunk only: the bark is exactly the trunk component`, bt === trunk.tris, `bark ${bt}, trunk ${trunk.tris} (source ${st}, ${comps.length} components)`);
    else {
      const hidden = comps.filter((x) => x.hidden), hiddenTris = hidden.reduce((s, x) => s + x.tris, 0);
      const gone = (R.result?.barkHidden?.removed ?? null), want = hidden.map((x) => x.first).sort((a, b) => a - b), got = gone ? [...gone].sort((a, b) => a - b) : null;
      ok(`RS6 ${c.id}: bark = the source's minus exactly the hidden components`, bt === st - hiddenTris, `bark ${bt}, source ${st} - hidden ${hiddenTris} = ${st - hiddenTris}`);
      ok(`RS7 ${c.id}: the trunk is kept, and the removed bark components are exactly the hidden ones (>= 90 % inside the leaf hull shrunk 10 %, none below the crown)`,
        !!got && !!trunk && !got.includes(trunk.first) && got.length === want.length && got.every((v, i) => v === want[i]),
        `${comps.length} components, trunk ${trunk ? trunk.tris + ' tris' : 'none'}; hidden here ${want.length} (${hiddenTris} tris); tool removed ${got ? got.length : 'nothing reported'}; kept branches: ${comps.filter((x) => !x.trunk && !x.hidden).map((x) => `${x.tris}t ${Math.round(100 * x.inside)}%${x.below ? ' below' : ''}`).join(', ') || 'none'}`);
    }
  }

  // ---- RS8 ----
  if (SHA[c.id]) { const h = sha(R.out); ok(`RS8 ${c.id}: exactly the owner-approved GLB (sha256 pinned)`, h === SHA[c.id], `sha256 ${h.slice(0, 16)}, pinned ${SHA[c.id].slice(0, 16)}`); }

  // ---- RS13 (conifers, near and far) ----
  if (c.kind === 'conifer') for (const [label, file] of [['near', R.out], ['far', R.out.replace(/\.glb$/, '_far.glb')]]) {
    const sh = fs.existsSync(file) ? crownShape((await io.read(file)).getRoot()) : null;
    if (!sh) { ok(`RS13 ${c.id} ${label}: the crown's shape`, false, `no crown in ${file}`); continue; }
    const worst = Math.max(...sh.bands.map((b) => b.ratio)), empty = sh.bands.reduce((n, b) => n + b.empty, 0), off = Math.max(...sh.bands.map((b) => b.off));
    all(`RS13 ${c.id} ${label}: the same crown all round (${SYM.bands} bands x ${SYM.sectors} sectors, radius within ${SYM.ratio} x, none empty), centroids and a straight trunk on the axis`,
      { 'radius ratio, no empty sector': worst <= SYM.ratio && !empty, [`band centroids within ${SYM.centroid * 100} % of the height`]: off <= SYM.centroid * sh.H, [`trunk within ${SYM.trunk * 100} % of the height`]: sh.trunkOff <= SYM.trunk * sh.H },
      `ratio per band ${sh.bands.map((b) => b.ratio.toFixed(2)).join(' ')}; empty ${sh.bands.map((b) => b.empty).join(' ')}; off ${sh.bands.map((b) => b.off.toFixed(3)).join(' ')} u (height ${sh.H.toFixed(3)}); trunk ${sh.trunkOff.toFixed(3)} u`);
  }

  // ---- RS9 ----
  if (c.overlay) {
    const O = OV[c.overlay], op = host?.getMesh()?.listPrimitives()[1];
    if (!op) { ok(`RS9 ${c.id}: the ${c.overlay} overlay`, false, 'no overlay primitive'); continue; }
    const P = op.getAttribute('POSITION').getArray(), I = op.getIndices().getArray(), N = op.getAttribute('NORMAL').getArray(), cs = comps3(P, I);
    const half = I.length / 2; let mirrored = half % 6 === 0; for (let t = 0; mirrored && t < half; t += 3) if (I[half + t] !== I[t] || I[half + t + 1] !== I[t + 2] || I[half + t + 2] !== I[t + 1]) mirrored = false;
    const sq = cs.map((k) => { const vs = [...k.verts], side = []; for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) side.push(Math.hypot(...[0, 1, 2].map((q) => P[vs[i] * 3 + q] - P[vs[j] * 3 + q])));
      side.sort((a, b) => a - b); const s = side[0]; return { n: vs.length, s, square: vs.length === 4 && Math.abs(side[3] - s) < 1e-4 && Math.abs(side[4] - s * Math.SQRT2) < 1e-4, ny: N[vs[0] * 3 + 1], c: k.c, tris: k.tris.length }; });
    ok(`RS9a ${c.id}: ${O.count} ${c.overlay} cards, each a square of ${O.size[0]}-${O.size[1]} u (4 vertices, 2 triangles + their duplicates)`,
      cs.length === O.count && mirrored && sq.every((q) => q.square && q.tris === 4 && q.s >= O.size[0] - 1e-4 && q.s <= O.size[1] + 1e-4),
      `${cs.length} cards, mirrored ${mirrored}, sizes ${sq.map((q) => q.s.toFixed(3)).join(' ')}`);
    // placement, in the host's frame: on a kept leaf triangle (within its 0.004 u offset), apples high, berries facing up / out, spaced
    const LP = foliage.getAttribute('POSITION').getArray(), LI = foliage.getIndices().getArray(), lt = [];
    let ly0 = Infinity, ly1 = -Infinity; for (let i = 1; i < LP.length; i += 3) { ly0 = Math.min(ly0, LP[i]); ly1 = Math.max(ly1, LP[i]); }
    for (let t = 0; t < LI.length / (c.dup ? 2 : 1); t += 3) lt.push([0, 1, 2].map((k) => new THREE.Vector3(LP[LI[t + k] * 3], LP[LI[t + k] * 3 + 1], LP[LI[t + k] * 3 + 2])));
    const far = sq.map((q) => { const p = new THREE.Vector3(...q.c); let d = Infinity; for (const [a, b, cc] of lt) d = Math.min(d, triDist(p, a, b, cc)); return d; });
    let spaced = true, minGap = Infinity; for (let i = 0; i < sq.length; i++) for (let j = i + 1; j < sq.length; j++) { const d = Math.hypot(...[0, 1, 2].map((q) => sq[i].c[q] - sq[j].c[q])), need = 0.6 * Math.max(sq[i].s, sq[j].s); minGap = Math.min(minGap, d / need); if (d < need - 1e-6) spaced = false; }
    const high = sq.every((q) => q.c[1] >= ly0 + 0.5 * (ly1 - ly0) - 1e-6), up = sq.every((q) => q.ny >= 0.42) && sq.every((q) => q.c[1] >= 0.35 * H - 1e-6);
    ok(`RS9b ${c.id}: on the foliage (<= 0.006 u from a kept leaf triangle), ${c.overlay === 'apple' ? 'above 50 % of the canopy\'s leaf span' : 'upper: centres >= 0.35 x the bush height, facing up / out (normal y >= 0.42)'}, >= 0.6 x size apart`,
      far.every((d) => d <= 0.006) && spaced && (c.overlay === 'apple' ? high : up),
      `max distance to a leaf ${Math.max(...far).toFixed(4)}; min gap ${minGap.toFixed(2)} x; ${c.overlay === 'apple' ? `lowest centre at ${((Math.min(...sq.map((q) => q.c[1])) - ly0) / (ly1 - ly0)).toFixed(2)} of the leaf span` : `lowest centre at ${(Math.min(...sq.map((q) => q.c[1])) / H).toFixed(3)} x the height, min normal y ${Math.min(...sq.map((q) => q.ny)).toFixed(3)}`}`);
    // colour: the overlay texture's opaque texels
    const oi = ot ? decodeAny(ot.getImage(), ot.getMimeType()) : null, st = oi ? stats(oi) : { hs: [], ss: [], vs: [], ls: [] }, n = st.hs.length || 1;
    const red = st.hs.map((h, i) => i).filter((i) => st.ss[i] >= 0.45 && (st.hs[i] <= 20 || st.hs[i] >= 345)), redH = medianHue(red.map((i) => st.hs[i])), redV = median(red.map((i) => st.vs[i]));
    const green = st.hs.filter((h, i) => h >= 70 && h <= 170 && st.ss[i] >= 0.25).length / n;
    if (c.overlay === 'apple') {
      const hi = st.vs.filter((v, i) => v >= 0.85 && st.ss[i] <= 0.5).length / n;
      ok(`RS9c ${c.id}: apples: >= 50 % red, median red hue in the #C8352B..#E05A3C range (2-14 deg), a highlight, a green leaf`, red.length / n >= 0.5 && redH >= 2 && redH <= 14 && redV >= 0.6 && redV <= 0.95 && hi >= 0.005 && green >= 0.005,
        `red ${(100 * red.length / n).toFixed(1)} % (hue ${redH.toFixed(1)}, value ${redV.toFixed(2)}), highlight ${(100 * hi).toFixed(1)} %, green ${(100 * green).toFixed(1)} %`);
    } else {
      const dark = st.hs.filter((h, i) => h >= 70 && h <= 170 && st.vs[i] <= 0.55 && st.ss[i] >= 0.25).length / n;
      ok(`RS9c ${c.id}: berries: >= 25 % red around #C0392B (hue within 8 deg of 6), on a dark-green scrap (>= 10 %)`, red.length / n >= 0.25 && hueDist(redH, 6) <= 8 && dark >= 0.1,
        `red ${(100 * red.length / n).toFixed(1)} % (hue ${redH.toFixed(1)}, value ${redV.toFixed(2)}), dark green ${(100 * dark).toFixed(1)} %`);
    }
  }
}

// ---- RS10: the committed files are fresh: the --all run above, byte for byte ----
if (!FROM) {
  console.log('');
  const COMMITTED = process.env.RESKIN_COMMITTED || path.join(here, '..', '..', 'reskin');
  const FILES = CASES.flatMap((c) => [c.id + '.glb', ...(c.kind !== 'bush' ? [c.id + '_far.glb'] : [])]);
  const differing = (a, b) => FILES.filter((f) => { const p = path.join(a, f), q = path.join(b, f); return !fs.existsSync(p) || !fs.existsSync(q) || !fs.readFileSync(p).equals(fs.readFileSync(q)); });
  const d = differing(ALL, COMMITTED);
  ok(`RS10 fresh: reskin.mjs --all gives every committed file byte for byte (${FILES.length}: each <id>.glb and each tree's <id>_far.glb in ${process.env.RESKIN_COMMITTED ? COMMITTED : 'art/reskin'})`,
    allRun.status === 0 && !d.length, `${allRun.status === 0 ? '' : `--all exit ${allRun.status}; `}${d.length ? `differ or missing: ${d.join(', ')}` : `${FILES.length} files identical`}`);
  // RS10s: the comparison bites: a copy of the committed files with one byte flipped in one of them (one that matched)
  const bit = path.join(tmp, 'bitten'), victim = FILES.find((f) => !d.includes(f));
  fs.mkdirSync(bit); for (const f of FILES) if (fs.existsSync(path.join(COMMITTED, f))) fs.copyFileSync(path.join(COMMITTED, f), path.join(bit, f));
  if (victim) { const b = fs.readFileSync(path.join(bit, victim)); b[b.length >> 1] ^= 0xff; fs.writeFileSync(path.join(bit, victim), b); }
  const d2 = differing(ALL, bit);
  ok(`RS10s the freshness comparison catches one flipped byte in a copy of the committed files (${victim || 'no matching file'})`, !!victim && d2.length === d.length + 1 && d2.includes(victim), `differ: ${d2.join(', ') || 'none'}`);

  // ---- RS11: reproducible inputs (ruling R23): without the concept images, the frozen numbers give the same files ----
  const hr = resultsOf(hidRun), d3 = differing(ALL, HID), notFrozen = hr.filter((x) => !x.concepts || Object.values(x.concepts).some((v) => v !== 'frozen')).map((x) => x.id);
  ok(`RS11 reproducible: --all with CONCEPTS_DIR = an empty dir (every concept number read from concept-stats.json, as each RESULT's concepts says) gives the same ${FILES.length} files byte for byte`,
    hidRun.status === 0 && hr.length === CASES.length && !notFrozen.length && !d3.length,
    `exit ${hidRun.status}${hidRun.status ? ': ' + hidRun.stderr.split('\n').filter(Boolean).slice(-1)[0] : ''}; ${hr.length} RESULTs; read from the images instead: ${notFrozen.join(', ') || 'none'}; differ: ${d3.join(', ') || 'none'}`);
  // RS11b: the frozen numbers are the images' (where the images are here): a fresh --freeze-stats equals the committed file
  if (PNGS.length === FOLDERS.length) {
    const fresh = path.join(tmp, 'concept-stats.json'), fr = spawnSync('node', [TOOL, '--freeze-stats', '--out', fresh], { encoding: 'utf8' });
    const same = fr.status === 0 && fs.existsSync(fresh) && fs.readFileSync(fresh).equals(fs.readFileSync(CONCEPT_STATS));
    ok(`RS11b concept-stats.json is fresh: byte-equal to a --freeze-stats of the ${FOLDERS.length} concept images`, same, fr.status ? `exit ${fr.status}: ${(fr.stderr || '').split('\n')[0]}` : same ? `${Object.keys(FROZEN).length} folders: ${Object.keys(FROZEN).join(', ')}` : 'differs: re-run node reskin.mjs --freeze-stats');
  } else console.log(`  (RS11b not run: only ${PNGS.length} of ${FOLDERS.length} concept images here, so concept-stats.json is the input)`);

  // ---- RS12: the triangle limits are checked before anything is written (M2) ----
  const M2 = path.join(tmp, 'm2'); fs.mkdirSync(M2);
  const a = path.join(M2, 'over_far.glb'), ra = spawnSync('node', [TOOL, '--recipe', 'tree_round_a', a, '--far', '--set', 'far.cards=0.9'], { encoding: 'utf8' });
  const wroteA = [a, a.replace(/\.glb$/, '_far.glb')].filter((f) => fs.existsSync(f)).map((f) => path.basename(f));
  ok('RS12a a far version over its target (tree_round_a with --set far.cards=0.9: over 1,000 tris) stops the build before any file is written, near or far',
    ra.status !== 0 && /far/.test(ra.stderr || '') && !wroteA.length, `exit ${ra.status}${ra.stderr ? ': ' + ra.stderr.split('\n')[0] : ''}; written: ${wroteA.join(', ') || 'nothing'}`);
  const b = path.join(M2, 'over_cap.glb'), rb = spawnSync('node', [TOOL, '--recipe', 'tree_pine_a', b, '--set', 'cap=1000'], { encoding: 'utf8' });
  ok('RS12b a cap the build cannot meet (tree_pine_a with --set cap=1000) stops it before the file is written', rb.status !== 0 && !fs.existsSync(b),
    `exit ${rb.status}${rb.stderr ? ': ' + rb.stderr.split('\n')[0] : ''}; written: ${fs.existsSync(b) ? path.basename(b) : 'nothing'}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
done();
