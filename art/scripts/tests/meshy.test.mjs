// meshy.test.mjs  --  the finished Meshy set (art/meshy/<id>/<id>.glb, scripts/meshy/finish.mjs): checks that need no browser. Pure node.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import jpeg from 'jpeg-js';
import { inspectGlb } from '../lib/builder.mjs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.resolve(__dirname, '../..'), MESHY = path.join(ART, 'meshy');
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: pass === 'skip' ? 'skip' : !!pass, detail });
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const io = new NodeIO();
// the set and the conventions each file is held to (size = [x, y, z] target, tol = relative; tex = max albedo size)
const SET = {
  boulder_a: { tex: 512, fit: [1, 0.7, 1] }, boulder_b: { tex: 512, fit: [1, 0.7, 1] }, boulder_c: { tex: 512, fit: [1, 0.7, 1] },
  outcrop_a: { tex: 512, height: [2, 3] }, outcrop_b: { tex: 512, height: [1.5, 3] },   // (the texture pass: 1024 -> 512 px)
  underside: { tex: 1024, hang: true, width: [8, 12] },
  hero_tree: { tex: 1024, height: [3.3, 3.5] },   // (4.3 ran off the top of the game's default view: re-finished at 3.4; 1024 px since the owner's texture review)
  windmill: { tex: 1024, height: [3.5, 3.9] },   // (1024 px since the owner's texture review)
  well: { tex: 1024, height: [1.25, 1.4], radius: [0.38, 0.55] },
  bench: { tex: 512, width: [0.98, 1.02] },
  cart: { tex: 512, length: [1.1, 1.3] },
  haystack: { tex: 512, height: [0.8, 0.95], radius: [0.42, 0.6], width: [0.88, 0.92] },   // (the brief's 0.9 wide)
};
async function load(id) { const f = path.join(MESHY, id, id + '.glb'); if (!fs.existsSync(f)) return null; const doc = await io.read(f); return { f, doc, root: doc.getRoot() }; }
function worldPoints(root, filt) { const out = [], e = [0, 0, 0];
  for (const n of root.listNodes()) { const m = n.getMesh(); if (!m || (filt && !filt(n))) continue; const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { const A = p.getAttribute('POSITION'); for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e); out.push([w[0] * e[0] + w[4] * e[1] + w[8] * e[2] + w[12], w[1] * e[0] + w[5] * e[1] + w[9] * e[2] + w[13], w[2] * e[0] + w[6] * e[1] + w[10] * e[2] + w[14]]); } } }
  return out; }
const bbox = (P) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (const p of P) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } return { mn, mx, size: mx.map((v, k) => v - mn[k]) }; };
const idxTris = (root) => root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);
const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx / 255]; };
async function main() {
  // ---- M0 ----
  { const fh = path.join(MESHY, 'farmhouse', 'farmhouse.glb'), d = await io.read(fh), want = idxTris(d.getRoot()), info = await inspectGlb(fh);
    ok('M0 inspectGlb counts indexed triangles (index count / 3)', info.tris === want, `inspectGlb ${info.tris}, indices / 3 = ${want}`); }
  // ---- M1 ----
  { const src = path.join(MESHY, 'farmhouse', 'source', 'farmhouse_meshy_a.glb');
    if (!fs.existsSync(src)) ok('M1 farmhouse re-finish = the committed GLB (structure)', 'skip', 'source/ is git-ignored and missing here');
    else {
      const tmp = path.join(os.tmpdir(), 'meshy_fh_check.glb');
      // the committed recipe (art/meshy/farmhouse/finish_args.txt), so the check follows whatever the branch ships
      const recipe = fs.readFileSync(path.join(MESHY, 'farmhouse', 'finish_args.txt'), 'utf8').trim().split(/\s+/);
      execFileSync(process.execPath, [path.join(__dirname, '..', 'meshy', 'finish.mjs'), src, tmp, '--id', 'farmhouse', ...recipe], { stdio: 'ignore' });
      const A = (await io.read(path.join(MESHY, 'farmhouse', 'farmhouse.glb'))).getRoot(), B = (await io.read(tmp)).getRoot(), bad = [];
      const acA = A.listAccessors(), acB = B.listAccessors(); if (acA.length !== acB.length) bad.push('accessor count');
      acA.forEach((x, i) => { const p = x.getArray(), q = acB[i] && acB[i].getArray(); if (!q || p.length !== q.length || p.some((v, k) => v !== q[k])) bad.push('accessor ' + i); });
      A.listTextures().forEach((t, i) => { const u = B.listTextures()[i]; if (!u || Buffer.compare(Buffer.from(t.getImage()), Buffer.from(u.getImage())) !== 0) bad.push('texture ' + i); });
      A.listMaterials().forEach((m, i) => { const n = B.listMaterials()[i]; for (const k of ['getBaseColorFactor', 'getEmissiveFactor', 'getMetallicFactor', 'getRoughnessFactor']) if (!n || JSON.stringify(m[k]()) !== JSON.stringify(n[k]())) bad.push('material ' + i + ' ' + k); });
      A.listNodes().forEach((x, i) => { const y = B.listNodes()[i]; if (!y || JSON.stringify(x.getMatrix()) !== JSON.stringify(y.getMatrix()) || x.getName() !== y.getName()) bad.push('node ' + x.getName()); });
      ok('M1 farmhouse re-finish = the committed GLB (geometry, textures, material factors, nodes)', !bad.length, bad.length ? bad.slice(0, 6).join(', ') : `${acA.length} accessors, ${A.listTextures().length} textures identical; materials ${B.listMaterials().map((m) => m.getName()).join(', ')}`);
      fs.rmSync(tmp, { force: true });
    }
  }
  // ---- M2 ----
  const rows = [], bad2 = [];
  for (const [id, S] of Object.entries(SET)) {
    const g = await load(id); if (!g) { bad2.push(id + ': missing'); continue; }
    const R = g.root, P = worldPoints(R), b = bbox(P), tris = idxTris(R), kb = fs.statSync(g.f).size / 1024, mats = R.listMaterials(), tex = R.listTextures();
    const albedo = tex.find((t) => /_albedo$/.test(t.getName())), sz = albedo && albedo.getSize(), body = mats.find((m) => m.getName() === id);
    const errs = [];
    if (!albedo || albedo.getMimeType() !== 'image/jpeg' || Math.max(...sz) > S.tex) errs.push('albedo ' + (sz ? sz.join('x') : 'none'));
    if (!body || body.getMetallicFactor() !== 0) errs.push('body material');
    if (R.listExtensionsUsed().length) errs.push('extensions ' + R.listExtensionsUsed().map((x) => x.extensionName).join(','));
    // every normal finite and unit length (a zero normal normalises to NaN in the shader: a black sliver)
    let badN = 0; for (const m of R.listMeshes()) for (const p of m.listPrimitives()) { const Nn = p.getAttribute('NORMAL').getArray(); for (let i = 0; i < Nn.length; i += 3) { const l = Math.hypot(Nn[i], Nn[i + 1], Nn[i + 2]); if (!(Math.abs(l - 1) < 0.01)) badN++; } }
    if (badN) errs.push(`${badN} zero / non-unit normals`);
    if (S.hang ? Math.abs(b.mx[1]) > 1e-3 : Math.abs(b.mn[1]) > 1e-3) errs.push((S.hang ? 'top ' : 'base ') + f2(S.hang ? b.mx[1] : b.mn[1]));
    // centred: the bbox centre (towers: the body below the cap) within 6 % of the width of the origin
    const PB = id === 'windmill' ? worldPoints(R, (n) => n.getName() !== 'Blades') : P, HB = bbox(PB).size[1];
    const body2 = id === 'windmill' ? bbox(PB.filter((p) => p[1] > 0.25 * HB && p[1] < 0.6 * HB)) : b, cx = (body2.mn[0] + body2.mx[0]) / 2, cz = (body2.mn[2] + body2.mx[2]) / 2;
    if (Math.hypot(cx, cz) > 0.06 * Math.max(body2.size[0], body2.size[2])) errs.push(`centre ${f2(cx)},${f2(cz)}`);
    const H = id === 'windmill' ? bbox(worldPoints(R, (n) => n.getName() !== 'Blades')).size[1] : b.size[1];
    const inR = (v, r) => v >= r[0] && v <= r[1];
    if (S.fit && (b.size[0] > S.fit[0] + 1e-3 || b.size[1] > S.fit[1] + 1e-3 || b.size[2] > S.fit[2] + 1e-3 || Math.max(b.size[0] / S.fit[0], b.size[2] / S.fit[2]) < 0.97)) errs.push('fit ' + b.size.map(f2).join('x'));
    if (S.height && !inR(H, S.height)) errs.push('height ' + f2(H));
    if (S.width && !inR(id === 'underside' ? Math.max(b.size[0], b.size[2]) : b.size[0], S.width)) errs.push('width ' + f2(b.size[0]));
    if (S.length && !inR(b.size[2], S.length)) errs.push('length (z) ' + f2(b.size[2]));
    if (S.radius) { const low = P.filter((p) => p[1] < 0.3 * H).map((p) => Math.hypot(p[0], p[2])).sort((p, q) => p - q), r = low[Math.floor(low.length * 0.95)]; if (!inR(r, S.radius)) errs.push('radius ' + f2(r)); }
    rows.push(`${id} ${tris} tris ${Math.round(kb)} KB ${sz ? sz.join('x') : '-'} ${b.size.map(f2).join('x')}`);
    if (errs.length) bad2.push(id + ': ' + errs.join(', '));
  }
  ok('M2 every set GLB: one JPEG albedo <= its size, body material = the id (metallic 0), no extensions, base on y 0 (underside: top), centred, target size',
    !bad2.length, bad2.length ? bad2.join(' | ') : rows.join(' | '));
  // ---- M3 ----
  { const g = await load('hero_tree'), errs = [];
    if (!g) errs.push('missing');
    else { const R = g.root, cn = R.listNodes().find((n) => n.getName() === 'Canopy'), all = bbox(worldPoints(R)), H = all.size[1];
      if (!cn || !cn.getMesh()) errs.push('no Canopy mesh node');
      else { const t = cn.getTranslation(), trunk = worldPoints(R, (n) => n.getName() !== 'Canopy').filter((p) => p[1] > 0.12 * H && p[1] < 0.3 * H), tb = bbox(trunk), ax = [(tb.mn[0] + tb.mx[0]) / 2, (tb.mn[2] + tb.mx[2]) / 2];
        if (t[1] < 0.3 * H || t[1] > 0.6 * H) errs.push('pivot height ' + f2(t[1]));
        if (Math.hypot(t[0] - ax[0], t[2] - ax[1]) > 0.35) errs.push(`pivot off the trunk axis by ${f2(Math.hypot(t[0] - ax[0], t[2] - ax[1]))}`);
        const p = cn.getMesh().listPrimitives()[0], img = jpeg.decode(Buffer.from(p.getMaterial().getBaseColorTexture().getImage()), { useTArray: true, formatAsRGBA: true }), UA = p.getAttribute('TEXCOORD_0'), I = p.getIndices().getArray();
        const U = UA.getNormalized() ? Float32Array.from(UA.getArray(), (v) => v / (UA.getArray() instanceof Uint8Array ? 255 : 65535)) : UA.getArray();   // (finish.mjs --compact: normalised 16-bit UVs)
        let gr = 0, n = 0; for (let k = 0; k < I.length; k += 9) { const u = (U[I[k] * 2] + U[I[k + 1] * 2] + U[I[k + 2] * 2]) / 3, v = (U[I[k] * 2 + 1] + U[I[k + 1] * 2 + 1] + U[I[k + 2] * 2 + 1]) / 3;
          const o = (Math.min(img.height - 1, Math.floor(v * img.height)) * img.width + Math.min(img.width - 1, Math.floor(u * img.width))) * 4, [h, s] = hsv(img.data[o], img.data[o + 1], img.data[o + 2]); n++; if (h >= 50 && h <= 175 && s >= 0.15) gr++; }
        if (gr / n < 0.85) errs.push(`canopy texels green ${f2(gr / n)}`);
        const tris = idxTris(R), ct = I.length / 3; if (ct < 0.15 * tris || ct > 0.6 * tris) errs.push(`canopy share ${f2(ct / tris)}`);
        if (!errs.length) errs.ok = `Canopy pivot ${t.map(f2).join(',')} (H ${f2(H)}), ${ct} / ${tris} tris, green ${f2(gr / n)}`; } }
    ok('M3a hero_tree: Canopy node (pivot on the trunk axis, 30-60 % up) holds the foliage; trunk keeps the rest', !errs.length, errs.ok || errs.join(', ')); }
  { const g = await load('windmill'), errs = [];
    if (!g) errs.push('missing');
    else { const R = g.root, bn = R.listNodes().find((n) => n.getName() === 'Blades'), body = bbox(worldPoints(R, (n) => n.getName() !== 'Blades')), H = body.size[1];
      if (!bn || !bn.getMesh()) errs.push('no Blades mesh node');
      else { const t = bn.getTranslation(), loc = []; const e = [0, 0, 0], A = bn.getMesh().listPrimitives()[0].getAttribute('POSITION'); for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e); loc.push([...e]); }
        const r = Math.max(...loc.map((p) => Math.hypot(p[0], p[1]))), zr = bbox(loc);
        if (t[1] < 0.55 * H || t[1] > 0.7 * H) errs.push('hub height ' + f2(t[1]));
        if (t[2] < 0.6 || Math.abs(t[0]) > 0.15) errs.push(`hub not on the +Z front (${t.map(f2).join(',')})`);
        if (r < 1.55 || r > 1.85) errs.push('sail radius ' + f2(r));
        if (zr.size[2] > 0.3) errs.push('sails not planar in local XY (z span ' + f2(zr.size[2]) + ')');
        const q = loc.filter((p) => Math.hypot(p[0], p[1]) > 1.2), quad = new Set(q.map((p) => (p[0] > 0 ? 1 : 0) + (p[1] > 0 ? 2 : 0))); if (quad.size !== 4) errs.push('not 4 sails');
        const glow = R.listMaterials().find((m) => m.getName() === 'Glow');
        if (!glow || !glow.getEmissiveTexture()) errs.push('no Glow material with an emissive mask');
        else { const gp = R.listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial() === glow), Pa = gp.getAttribute('POSITION').getArray(), I = gp.getIndices().getArray();
          let lo = Infinity, hi = -Infinity; for (let k = 0; k < I.length; k += 3) { const cy = (Pa[I[k] * 3 + 1] + Pa[I[k + 1] * 3 + 1] + Pa[I[k + 2] * 3 + 1]) / 3; lo = Math.min(lo, cy); hi = Math.max(hi, cy); }
          if (!(I.length >= 9 && lo > 0.15 * H && hi < 0.6 * H)) errs.push(`Glow faces ${I.length / 3}, centroids at y ${f2(lo)}..${f2(hi)}`);
          if (!errs.length) errs.ok = `Blades pivot ${t.map(f2).join(',')}, radius ${f2(r)}, z span ${f2(zr.size[2])}; Glow ${I.length / 3} faces, centroids at y ${f2(lo)}..${f2(hi)} (H ${f2(H)})`; } } }
    ok('M3b windmill: Blades node at the hub (+Z front, 55-70 % up), 4 sails r ~1.7 in local XY; Glow window on the tower wall', !errs.length, errs.ok || errs.join(', ')); }
  let fail = 0, skip = 0;
  for (const r of results) { const tag = r.pass === 'skip' ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'; console.log(`${tag}  ${r.name}\n      ${r.detail}`); if (r.pass === 'skip') skip++; else if (!r.pass) fail++; }
  console.log(`\n${results.length - fail - skip}/${results.length - skip} passed${skip ? ` (${skip} skipped)` : ''}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
