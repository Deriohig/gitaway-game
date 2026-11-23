// meshy.browser.mjs  --  the Meshy set pieces in the live proof scene (headless Chromium). Checks on the real three.js objects.
// =============================================================================
// Usage:  node tests/meshy.browser.mjs [--page index.html] [--port 8187]
// Same harness as plants.browser.mjs (the scene is reached through three's __THREE_DEVTOOLS__ 'observe' event); the placements come
// from window.__meshy (lib/arch-scene.js "Meshy set pieces"), but every number checked is measured on the scene's own geometry:
// the terrain is the island meshes (vertical ray casts on their triangles), the slots / zones / tree positions / paths come from
// world.config.mjs and window.__composition, the pieces' footprints from their own vertices.
//   S1 slots      windmill / well / bench at layout.ts WINDMILL / WELL / BENCH, the haystacks at the meadow zones haystack_a / _b,
//                 each within 0.15 u; the cart and the three outcrops present
//   S2 ground     each base sits on the terrain: |origin - ground| <= 0.06 for the slot pieces and the cart; the hero tree / outcrops
//                 (set on the lowest ground under their footprint) sink <= 0.6; no piece hovers (its bottom vertices <= 0.06 above
//                 the ground anywhere)
//   S3 paths      no footprint (convex hull of the vertices in the bottom 0.3 u) overlaps a path ribbon, a stair or the waterfall,
//                 and no tree trunk stands inside a free-placed piece (cart, outcrops). The three game slots whose stone-path ends
//                 the proof's v4 trunk paths start from (WINDMILL, WELL, BENCH) are LAYOUT CONFLICTS of the frozen layout: their
//                 overlap is reported and held at the measured value (+0.03), never more
//   S4 hero       the hero tree stands on an existing tree position (window.__composition, main) and that tree is no longer drawn by
//                 any tree InstancedMesh (both tree sets): it REPLACES the tree; its Canopy pivots on the trunk axis 30-60 % up
//   S5 underside  HELD BACK (lead review 2026-10-19: inside MAIN's cone it read as patchy fragments poking through): not loaded,
//                 not placed. When it returns as the cone's tip, undersideCheck() below (rim hidden in the rock, no poke-through,
//                 >= 25 % hanging out, joined island and MAIN alone) becomes the check again
//   S6 windmill   Blades: pivot on the windmill's front (+Z of its rotation) at 2.0-2.8 u, within 0.3 u of the axle end, sails in the
//                 node's local XY (spin axis Z) and turning on the live clock; Glow: the window emissive at 19.5 h >= 2 x 16.5 h
//   S7 presets    every active look preset (Game (current) included) shows every set piece
// Headless SwiftShader: fine for structure, never for timing.
// =============================================================================
import { requirePlaywright } from '../lib/playwright.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import W3 from '../../config/world.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const A = W3.archipelago;
const LP = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../config/lookPresets.json'), 'utf8'));
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
// the slot vs path conflicts of the frozen layout (S3): the footprint hull's overlap into the trunk path's hard ribbon width (u), as
// measured at the frozen slots (seed 11); the test holds each at this value + TOL so a bigger model or a moved piece fails
const LAYOUT_CONFLICTS = { windmill: 0.51, well: 0.43, bench: 0.28 }, TOL = 0.03;

function loadPlaywright() { return requirePlaywright(); }   // lib/playwright.mjs: PLAYWRIGHT_ROOT, the repo root, the main checkout
async function serverUp(port) { try { return (await fetch(`http://127.0.0.1:${port}/__shots`)).ok; } catch { return false; } }
function pageInit() {
  const t = new EventTarget(); window.__THREE_DEVTOOLS__ = t; window.__t = { scenes: [] };
  t.addEventListener('observe', (e) => { const o = e.detail; if (o && o.isScene) window.__t.scenes.push(o); });
}

// ---- in-page measurement kit (serialised into the page) ----
function kit() {
  const scene = window.__t.scenes.find((s) => s.children.some((c) => c.name === 'piece:main'));
  const visible = (o) => { for (let q = o; q; q = q.parent) if (q.visible === false) return false; return true; };
  // vertical-ray terrain: every visible island mesh's world triangles binned on a 1 u xz grid
  const tris = [], grid = new Map(), C = 1;
  scene.traverse((o) => { if (!o.isMesh || !/^island:/.test(o.name) || !visible(o)) return; o.updateMatrixWorld(true);
    const p = o.geometry.attributes.position, e = o.matrixWorld.elements, ix = o.geometry.index;
    const W = (i) => { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; };
    const n = ix ? ix.count : p.count;
    for (let k = 0; k < n; k += 3) { const a = W(ix ? ix.getX(k) : k), b = W(ix ? ix.getX(k + 1) : k + 1), c = W(ix ? ix.getX(k + 2) : k + 2), id = tris.length; tris.push([a, b, c]);
      const x0 = Math.floor(Math.min(a[0], b[0], c[0]) / C), x1 = Math.floor(Math.max(a[0], b[0], c[0]) / C), z0 = Math.floor(Math.min(a[2], b[2], c[2]) / C), z1 = Math.floor(Math.max(a[2], b[2], c[2]) / C);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const key = gx + ',' + gz; let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(id); } } });
  function hits(x, z) { const l = grid.get(Math.floor(x / C) + ',' + Math.floor(z / C)) || [], ys = [];
    for (const id of l) { const [a, b, c] = tris[id], d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]); if (Math.abs(d) < 1e-12) continue;
      const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, w = 1 - u - v;
      if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) ys.push(u * a[1] + v * b[1] + w * c[1]); }
    return ys; }
  const top = (x, z) => { const h = hits(x, z); return h.length ? Math.max(...h) : null; }, bottom = (x, z) => { const h = hits(x, z); return h.length ? Math.min(...h) : null; };
  // world vertices of a placed piece (an object, or one instance of an InstancedMesh)
  const M4 = scene.matrixWorld.constructor, V3 = scene.position.constructor;
  function verts(P, step = 1) { const out = []; const v = new V3();
    if (P.obj) { P.obj.updateMatrixWorld(true); P.obj.traverse((m) => { if (!m.isMesh) return; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); out.push([v.x, v.y, v.z, m.name, m.parent && m.parent.name]); } }); }
    else { const im = P.im, mi = new M4(); im.updateMatrixWorld(true); im.getMatrixAt(P.index, mi); mi.premultiply(im.matrixWorld); const p = im.geometry.attributes.position; for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(mi); out.push([v.x, v.y, v.z]); } }
    return out; }
  function origin(P) { const v = new V3(); if (P.obj) { P.obj.updateMatrixWorld(true); v.setFromMatrixPosition(P.obj.matrixWorld); } else { const mi = new M4(); P.im.getMatrixAt(P.index, mi); mi.premultiply(P.im.matrixWorld); v.setFromMatrixPosition(mi); } return [v.x, v.y, v.z]; }
  function hull(pts) { const p = pts.map((q) => [q[0], q[2]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1)); }
  function sdHull(H, x, z) {   // signed distance to a CCW convex polygon (negative inside)
    let inside = true, d = Infinity;
    for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1e-12, t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2));
      d = Math.min(d, Math.hypot(x - a[0] - ex * t, z - a[1] - ez * t)); if (ex * (z - a[1]) - ez * (x - a[0]) < 0) inside = false; }
    return inside ? -d : d; }
  return { scene, visible, hits, top, bottom, verts, origin, hull, sdHull };
}

function measure(cfg) {
  const K = (window.__kit = window.__kit || eval('(' + cfg.kit + ')')()), M = window.__meshy, COMP = window.__composition, out = { pieces: [], errors: [] };
  const { top, verts, origin, hull, sdHull } = K, G = cfg.game, Z = cfg.zones;
  const slotOf = (id, i) => (id === 'windmill' ? G.WINDMILL : id === 'well' ? G.WELL : id === 'bench' ? [G.BENCH.x, G.BENCH.z] : id === 'haystack' ? Z.meadow.find((z) => z.id === (i === 0 ? 'haystack_a' : 'haystack_b')).at : null);
  const paths = COMP.pathSamples, stairs = cfg.stairs, fall = COMP.water.wetland.waterfall.points, seen = {};
  for (const P of M.placed) {
    const k = (seen[P.id] = (seen[P.id] || 0) + 1) - 1, o = origin(P), V = verts(P), y0 = o[1];
    const H = Math.max(...V.map((v) => v[1])) - y0, low = V.filter((v) => v[1] < y0 + Math.min(0.3, 0.25 * H)), hl = hull(low);
    const g0 = top(o[0], o[2]), slot = slotOf(P.id, k);
    // hovering: the base vertices (within 3 cm of the base plane) vs the ground right under each: > 0 = air under the base
    let hover = -Infinity; for (const v of V.filter((v) => v[1] < y0 + 0.03)) { const g = top(v[0], v[2]); if (g != null) hover = Math.max(hover, v[1] - g); }
    // path / stair / waterfall overlap: penetration of the ribbon's hard half width into the hull
    let pen = -Infinity, pid = ''; for (const Pp of paths) for (const q of Pp.pts) { const d = sdHull(hl, q[0], q[1]), p = Pp.width / 2 - d; if (p > pen) { pen = p; pid = Pp.id; } }
    let stair = Infinity; for (const S of stairs) for (let t = 0; t <= 1; t += 0.05) { const x = S.from[0] + (S.to[0] - S.from[0]) * t, z = S.from[1] + (S.to[1] - S.from[1]) * t; stair = Math.min(stair, sdHull(hl, x, z) - S.width / 2); }
    let fallD = Infinity; for (const q of fall) fallD = Math.min(fallD, sdHull(hl, q[0], q[2]));
    let trunk = Infinity; for (const id of Object.keys(COMP.pieces)) for (const t of COMP.pieces[id].trees) { if (P.hero && Math.hypot(t.x - o[0], t.z - o[2]) < 0.05) continue; trunk = Math.min(trunk, sdHull(hl, t.x, t.z)); }
    out.pieces.push({ id: P.id, k, piece: P.piece, at: o, slot, slotErr: slot ? Math.hypot(o[0] - slot[0], o[2] - slot[1]) : null, base: g0 == null ? null : y0 - g0, hover, pen, pid, stair, fall: fallD, trunk, H, n: V.length, hullN: hl.length });
  }
  return out;
}
function heroCheck() {
  const K = window.__kit, M = window.__meshy, COMP = window.__composition, h = M.hero, o = K.origin({ obj: h.obj }), out = {};
  let best = Infinity; for (const t of COMP.pieces.main.trees) best = Math.min(best, Math.hypot(t.x - o[0], t.z - o[2])); out.treeDist = best;
  // no tree instance (either set) left at that spot
  const M4 = K.scene.matrixWorld.constructor, m = new M4(), V3 = K.scene.position.constructor, v = new V3(); let near = 0, sets = 0;
  K.scene.traverse((q) => { if (!q.isInstancedMesh || !/^(tree:|tree_round_a:|pine:)/.test(q.name)) return; sets++; q.updateMatrixWorld(true);
    for (let i = 0; i < q.count; i++) { q.getMatrixAt(i, m); m.premultiply(q.matrixWorld); v.setFromMatrixPosition(m); if (Math.hypot(v.x - o[0], v.z - o[2]) < 0.3) near++; } });
  out.instancesLeft = near; out.sets = sets;
  // canopy pivot vs the trunk axis
  const c = h.canopy, V = K.verts({ obj: h.obj }), y0 = o[1], H = Math.max(...V.map((q) => q[1])) - y0;
  const trunk = V.filter((q) => q[3] !== 'Canopy' && q[1] > y0 + 0.12 * H && q[1] < y0 + 0.3 * H);
  const xs = trunk.map((q) => q[0]), zs = trunk.map((q) => q[2]), ax = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  c.updateMatrixWorld(true); v.setFromMatrixPosition(c.matrixWorld);
  out.canopy = { exists: !!c, isFoliage: !!(c.isMesh || c.children.some((q) => q.isMesh)), pivotUp: (v.y - y0) / H, offAxis: Math.hypot(v.x - ax[0], v.z - ax[1]), H };
  return out;
}
function undersideCheck() {
  const K = window.__kit || window.__kitFresh, M = window.__meshy, U = M.underside.obj, V = K.verts({ obj: U }, 2), o = K.origin({ obj: U });
  const yTop = Math.max(...V.map((v) => v[1])), rim = V.filter((v) => v[1] > yTop - 0.04 * (yTop - Math.min(...V.map((q) => q[1]))));
  let rimOut = 0, rimMiss = 0, poke = 0, outside = 0, below = 0, worstRim = Infinity, worstTop = Infinity;
  for (const v of rim) { const b = K.bottom(v[0], v[2]); if (b == null) { rimMiss++; continue; } worstRim = Math.min(worstRim, v[1] - b); if (v[1] < b) rimOut++; }
  for (const v of V) { const t = K.top(v[0], v[2]), b = K.bottom(v[0], v[2]); if (t == null) { outside++; continue; } worstTop = Math.min(worstTop, t - v[1]); if (v[1] > t - 1) poke++; if (v[1] < b) below++; }
  return { fit: M.undersideFit, n: V.length, rim: rim.length, rimOut, rimMiss, worstRim, poke, outside, worstTop, belowShare: below / V.length, at: o };
}
function windmillCheck() {
  const K = window.__kit, M = window.__meshy, W = M.placed.find((p) => p.id === 'windmill'), B = M.blades, V3 = K.scene.position.constructor, v = new V3(), out = {};
  const o = K.origin(W); B.updateMatrixWorld(true); v.setFromMatrixPosition(B.matrixWorld); const rot = W.obj.rotation.y, fwd = [Math.sin(rot), Math.cos(rot)], rel = [v.x - o[0], v.z - o[2]];
  out.pivot = { y: v.y - o[1], front: rel[0] * fwd[0] + rel[1] * fwd[1], side: Math.abs(rel[0] * fwd[1] - rel[1] * fwd[0]) };
  // the axle end: the closest body vertex to the pivot
  let axle = Infinity; for (const q of K.verts(W)) if (q[4] !== 'Blades' && q[3] !== 'Blades') axle = Math.min(axle, Math.hypot(q[0] - v.x, q[1] - v.y, q[2] - v.z)); out.axle = axle;
  const p = (B.isMesh ? B : B.children.find((q) => q.isMesh)).geometry.attributes.position; let zmin = Infinity, zmax = -Infinity, rmax = 0; for (let i = 0; i < p.count; i++) { zmin = Math.min(zmin, p.getZ(i)); zmax = Math.max(zmax, p.getZ(i)); rmax = Math.max(rmax, Math.hypot(p.getX(i), p.getY(i))); }
  out.sails = { zSpan: zmax - zmin, radius: rmax };
  return out;
}
function glowAt(h) { window.__look.setHour(h); const g = window.__plants.glow, x = g.extra && g.extra[0]; if (!x) return null; const e = x.mat.emissive; return (0.2126 * e.r + 0.7152 * e.g + 0.0722 * e.b) * x.mat.emissiveIntensity; }
function presetsCheck(names) {
  const K = window.__kit, M = window.__meshy, out = {};
  for (const n of names) { window.__look.select(n); const hidden = M.placed.filter((P) => !K.visible(P.obj || P.im)).map((P) => P.id).concat(M.underside && !K.visible(M.underside.obj) ? ['underside'] : []); out[n] = hidden; }
  return out;
}

async function openPage(browser, port, page0, query) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(pageInit);
  await page.goto(`http://127.0.0.1:${port}/${page0}?ui=0&shot=1${query || ''}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__ready === true && window.__meshy, null, { timeout: 600000, polling: 250 });
  await page.waitForTimeout(300);
  return { page, errors };
}

async function main() {
  const a = process.argv.slice(2); let page0 = 'index.html', port = 8187;
  for (let i = 0; i < a.length; i++) { if (a[i] === '--page') page0 = a[++i]; else if (a[i] === '--port') port = +a[++i]; }
  let child = null;
  if (!(await serverUp(port))) { child = spawn(process.execPath, [path.join(__dirname, '..', 'shots.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    for (let i = 0; i < 50 && !(await serverUp(port)); i++) await new Promise((r) => setTimeout(r, 100)); }
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const allErrors = [];
  try {
    const { page, errors } = await openPage(browser, port, page0); allErrors.push(...errors);
    const cfg = { kit: kit.toString(), game: A.game, zones: A.blueprint.zones, stairs: A.blueprint.stairs };
    const m = await page.evaluate(measure, cfg), P = m.pieces, by = (id) => P.filter((p) => p.id === id);
    // ---- S1 ----
    const slotted = P.filter((p) => p.slot), want = ['windmill', 'well', 'bench', 'haystack', 'haystack'];
    ok('S1 windmill / well / bench at their layout.ts slots, the haystacks at haystack_a / _b (<= 0.15 u); cart + 3 outcrops present',
      slotted.length === want.length && slotted.every((p) => p.slotErr <= 0.15) && by('cart').length === 1 && by('outcrop_a').length + by('outcrop_b').length === 3 && by('hero_tree').length === 1,
      P.map((p) => `${p.id}${p.slot ? ' ' + f2(p.slotErr) : ''} @${f2(p.at[0])},${f2(p.at[2])}`).join(' | '));
    // ---- S2 ----
    const flat = ['windmill', 'well', 'bench', 'haystack', 'cart'], sunk = ['hero_tree', 'outcrop_a', 'outcrop_b'];
    ok('S2 bases on the terrain: |origin - ground| <= 0.06 (slot pieces, cart), hero tree / outcrops sunk <= 0.6 on their footprint low point, nothing hovers > 0.06',
      P.every((p) => p.base != null && (flat.includes(p.id) ? Math.abs(p.base) <= 0.06 : sunk.includes(p.id) ? p.base <= 0.06 && p.base >= -0.6 : true) && p.hover <= 0.06),
      P.map((p) => `${p.id} base ${f2(p.base)} hover ${f2(p.hover)}`).join(' | '));
    // ---- S3 ----
    const conflicts = P.filter((p) => LAYOUT_CONFLICTS[p.id] != null), strict = P.filter((p) => LAYOUT_CONFLICTS[p.id] == null);
    const free = P.filter((p) => ['cart', 'outcrop_a', 'outcrop_b'].includes(p.id));
    ok('S3 no footprint on a path ribbon / stair / the waterfall, no trunk inside a free-placed piece; the 3 slot-vs-path layout conflicts held at their measured overlap',
      strict.every((p) => p.pen <= 0 && p.stair > 0 && p.fall > 3) && free.every((p) => p.trunk > 0.15) && conflicts.every((p) => p.pen <= LAYOUT_CONFLICTS[p.id] + TOL && p.stair > 0),
      'clear: ' + strict.map((p) => `${p.id} path ${f2(-p.pen)} (${p.pid}) stair ${f2(p.stair)}${free.includes(p) ? ' trunk ' + f2(p.trunk) : ''}`).join(' | ') +
      ' || LAYOUT CONFLICTS (hull overlap into the ribbon): ' + conflicts.map((p) => `${p.id} ${f2(p.pen)} on ${p.pid} (held <= ${f2(LAYOUT_CONFLICTS[p.id] + TOL)})`).join(', '));
    // ---- S4 ----
    const hc = await page.evaluate(heroCheck);
    ok('S4 hero tree on an existing tree position (main), that tree removed from both tree sets; Canopy pivot on the trunk axis 30-60 % up',
      hc.treeDist <= 0.05 && hc.instancesLeft === 0 && hc.sets > 0 && hc.canopy.exists && hc.canopy.isFoliage && hc.canopy.pivotUp >= 0.3 && hc.canopy.pivotUp <= 0.6 && hc.canopy.offAxis <= 0.35,
      `tree dist ${f2(hc.treeDist)}, tree instances left there ${hc.instancesLeft} (of ${hc.sets} tree meshes); canopy pivot ${f2(hc.canopy.pivotUp * 100)} % up, ${f2(hc.canopy.offAxis)} off the trunk axis (H ${f2(hc.canopy.H)})`);
    // ---- S6 ----
    const wc = await page.evaluate(windmillCheck), r0 = await page.evaluate(() => window.__meshy.blades.rotation.z); await page.waitForTimeout(700); const r1 = await page.evaluate(() => window.__meshy.blades.rotation.z);
    const gD = await page.evaluate(glowAt, 16.5), gN = await page.evaluate(glowAt, 19.5);
    ok('S6 windmill: Blades pivot on its front at 2.0-2.8 u by the axle end (<= 0.3), sails planar on local Z and turning; the Glow window at 19.5 h >= 2 x 16.5 h',
      wc.pivot.y >= 2 && wc.pivot.y <= 2.8 && wc.pivot.front > 0.6 && wc.pivot.side < 0.2 && wc.axle <= 0.3 && wc.sails.zSpan < 0.3 && wc.sails.radius > 1.5 && r1 !== r0 && gD != null && gN >= 2 * gD,
      `pivot y ${f2(wc.pivot.y)} front ${f2(wc.pivot.front)} side ${f2(wc.pivot.side)}, axle end ${f2(wc.axle)}; sails r ${f2(wc.sails.radius)} z span ${f2(wc.sails.zSpan)}; spin ${f2(r0)} -> ${f2(r1)}; glow ${f2(gD)} -> ${f2(gN)}`);
    // ---- S7 ----
    const names = Object.entries(LP.presets).filter(([, p]) => p.status === 'active').map(([n]) => n), pc = await page.evaluate(presetsCheck, names);
    ok('S7 every active look preset shows every set piece (Game (current) included)', names.includes('Game (current)') && Object.values(pc).every((h) => !h.length),
      Object.entries(pc).map(([n, h]) => `${n}: ${h.length ? 'HIDDEN ' + h.join(',') : 'all'}`).join(' | '));
    // ---- S5: the underside is held back (build.mjs PROOF_EXTRAS); undersideCheck() is kept for when it returns as the cone's tip ----
    const us = await page.evaluate(() => ({ set: !!(window.__meshy && window.__meshy.underside), placed: (window.__meshy ? window.__meshy.placed : []).filter((P) => P.id === 'underside').length }));
    ok('S5 the Meshy underside is held back from the proof (it poked through MAIN\'s cone as patchy fragments)', !us.set && us.placed === 0, `MESHY.underside ${us.set ? 'SET' : 'null'}, placed ${us.placed}`);
  } finally { await browser.close(); if (child) child.kill(); }
  // order the report S1..S7
  results.sort((x, y) => x.name.localeCompare(y.name));
  let fail = 0;
  for (const r of results) { console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`); if (!r.pass) fail++; }
  if (allErrors.length) console.log('page errors: ' + allErrors.slice(0, 5).join(' | '));
  console.log(`\n${results.length - fail}/${results.length} passed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
