// Water bake checks (pure node; reads the baked files in public/models: run `node bake-water.mjs` first).
//   node tests/water.test.mjs [W2 W3 ...]   (all, or some)
// W1 determinism + fresh bake, W2 decoding, W3 shore, W4 flow, W5 ribbons, W6 falls, W7 budgets, W8 nothing moves, W10-W12 shader patch /
// palettes / phase wraps, W13 pond outline + clearances, W14 pond-to-stream join, W15 river-to-fall continuity, W16 ripples, W17 read budget.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GT from '../lib/terrain.mjs';
import W3 from '../../config/world.config.mjs';
import L from '../../config/look.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS = path.resolve(__dirname, '../../../public/models'), LIB = (f) => path.resolve(__dirname, '../lib', f);
const A = W3.archipelago, G = A.game, TAU = Math.PI * 2;
const ONLY = process.argv.slice(2).filter((a) => /^W\d+$/.test(a)), want = (id) => !ONLY.length || ONLY.includes(id);
const results = [];
const ok = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
const miss = (name, why) => ok(name, false, why);
const guard = async (name, fn) => { try { await fn(); } catch (e) { miss(name, 'threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); } };
let _bp = null; const bp = () => _bp || (_bp = GT.buildBlueprint(A, L, {}));
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const WJ = () => readJSON(path.join(MODELS, 'water.json')), BPJ = () => readJSON(path.resolve(__dirname, '../../config/blueprint.pieces.json'));
const toWorld = (id, c) => { const pv = BPJ().pieces[id].dockedPosition; return [c[0] + pv[0], c[1] + pv[1], c[2] + pv[2]]; };
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hexRgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const countRe = (s, re) => (s.match(re) || []).length;
// distance (and segment parameter) from (x, z) to segment a-b; distance to a closed polygon's edges
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1e-12))); return [Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t), t]; };
const polyEdgeD = (poly, x, z) => Math.min(...poly.map((p, k) => segD(x, z, p, poly[(k + 1) % poly.length])[0]));
// a baked map from public/models (water.json's entry): { w, h, origin, texel, bytes, at(i, j) -> [R, G, B, A] }
function loadMap(id) {
  const j = WJ(), e = j && j.pieces && j.pieces[id] && j.pieces[id].map; if (!e) return null;
  const bytes = fs.readFileSync(path.join(MODELS, e.file)), [w, h] = e.size;
  return { ...e, w, h, bytes, at: (i, j2) => { const o = 4 * (j2 * w + i); return [bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]]; } };
}
// decoded bilinear lookups on a map (piece-local x, z)
function mapLookup(m) {
  const ch = (c, x, z) => {
    const gx = (x - m.origin[0]) / m.texel - 0.5, gz = (z - m.origin[1]) / m.texel - 0.5, i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j;
    const at = (ii, jj) => m.bytes[4 * (Math.min(m.h - 1, Math.max(0, jj)) * m.w + Math.min(m.w - 1, Math.max(0, ii))) + c];
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
  return { depth: (x, z) => ch(0, x, z) / 255, sd: (x, z) => (ch(1, x, z) - 128) / 127, flow: (x, z) => [(ch(2, x, z) - 128) / 255, (ch(3, x, z) - 128) / 255],
    centre: (i, j) => [m.origin[0] + (i + 0.5) * m.texel, m.origin[1] + (j + 0.5) * m.texel] };
}
let _ctx = null;
async function ctx() {
  if (_ctx) return _ctx;
  const WB = await import('../lib/water-bake.mjs'), W = GT.blueprintWater(bp()), pieces = {};
  for (const id of ['main', 'wetland', 'highland']) {
    const m = loadMap(id); if (!m) continue;
    const pivot = BPJ().pieces[id].dockedPosition;
    pieces[id] = { m, L: mapLookup(m), pivot, grid: WB.loadGrid(id), bodies: WB.waterBodies(W, id, pivot) };
  }
  return (_ctx = { WB, W, pieces });
}
// the body of a ribbon / still body that owns world-local (x, z), and its level there (virtual bodies skipped)
const ribbonReach = (WB, b, x, z) => { const nn = WB.nearestOnLine(b.line, x, z); return [nn.d <= nn.w / 2 + Math.min(b.bank, WB.RIBBON_REACH), nn]; };

// ---- W1 deterministic ----
if (want('W1')) await guard('W1', async () => {
  const WB = await import('../lib/water-bake.mjs'), a = await WB.bakeWater(), b = await WB.bakeWater();
  const na = Object.keys(a.files).sort(), nb = Object.keys(b.files).sort(), diff = na.filter((n) => !b.files[n] || Buffer.compare(a.files[n], b.files[n]) !== 0);
  ok('W1a two bakes give identical bytes (every file)', na.length >= 3 && na.join() === nb.join() && !diff.length, `${na.length} files${diff.length ? '; differ: ' + diff : ''}`);
  const stale = na.filter((n) => { const f = path.join(MODELS, n); return !fs.existsSync(f) || Buffer.compare(fs.readFileSync(f), a.files[n]) !== 0; });
  ok('W1b public/models holds the current bake (node bake-water.mjs)', !stale.length, stale.length ? 'stale: ' + stale.join(', ') : '');
});

// ---- W2 decoding ----
if (want('W2')) await guard('W2', async () => {
  const { WB, pieces } = await ctx(), P = pieces.wetland;
  if (!P) miss('W2a/b wetland map', 'no wetland map');
  else {
    const lake = P.bodies.find((b) => b.name === 'lake'), g = P.grid;
    let bed = Infinity; for (let j = 0; j < g.size[1]; j++) for (let i = 0; i < g.size[0]; i++) { const h = g.data[j * g.size[0] + i]; if (Number.isFinite(h) && WB.inPoly(lake.poly, g.origin[0] + i * g.spacing, g.origin[1] + j * g.spacing)) bed = Math.min(bed, h); }
    let maxR = 0; for (let j = 0; j < P.m.h; j++) for (let i = 0; i < P.m.w; i++) { const [x, z] = P.L.centre(i, j); if (WB.inPoly(lake.poly, x, z)) maxR = Math.max(maxR, P.m.at(i, j)[0]); }
    const want2 = lake.level - bed, got = maxR / 255;
    ok('W2a the lake\'s deepest depth = level - bed (+/- 1 step = 1/255 u)', Math.abs(got - want2) <= 1 / 255 + 1e-6, `map ${got.toFixed(4)} vs ${want2.toFixed(4)}`);
    const isl = A.blueprint.features.find((f) => f.id === 'lake_islet'), ix = isl.at[0] - P.pivot[0], iz = isl.at[1] - P.pivot[2], sdI = P.L.sd(ix, iz), gI = WB.gridHeight(g, ix, iz);
    ok('W2b the islet (lake_islet) has G < 0 (land inside the lake outline)', WB.inPoly(lake.poly, ix, iz) && sdI < 0 && gI >= lake.level, `sd ${sdI.toFixed(3)}, ground ${gI.toFixed(3)} vs level ${lake.level.toFixed(3)}`);
  }
  let bad = 0, n = 0;
  for (const Q of Object.values(pieces)) for (let q = 0; q < Q.m.w * Q.m.h; q++) if (Q.m.bytes[4 * q + 1] <= 128) { n++; if (Q.m.bytes[4 * q + 2] !== 128 || Q.m.bytes[4 * q + 3] !== 128) bad++; }
  ok('W2c flow is exactly 0 (B = A = 128) on every texel outside the water (G <= 128), every map (wetland + highland present)', n > 0 && !bad && pieces.wetland && pieces.highland, `${bad} of ${n} dry texels carry flow`);
});

// ---- W3 shore ----
if (want('W3')) await guard('W3', async () => {
  const { WB, pieces } = await ctx(), devs = [];
  for (const Q of Object.values(pieces)) for (const b of Q.bodies) {
    if (b.kind !== 'still') continue;
    // outline vertices another body claims are junctions (stream leaving the pond, river / outflow at the lake), not shore
    const junction = ([x, z]) => Q.bodies.some((o) => o !== b && (o.kind === 'still' ? WB.inPoly(o.poly, x, z) : (() => { const nn = WB.nearestOnLine(o.line, x, z); return nn.d <= nn.w / 2 + o.bank + 0.1; })()));
    devs.push(...b.poly.filter((p) => !junction(p)).map(([x, z]) => Math.abs(Q.L.sd(x, z))));
  }
  devs.sort((a, c) => a - c);
  const p95 = devs[Math.floor(devs.length * 0.95)], mx = devs[devs.length - 1];
  ok('W3a G = 0 lies within 0.05 u of the exported outlines (95 % of vertices, none past 0.15 u)', devs.length && pieces.wetland && pieces.highland && p95 <= 0.05 && mx <= 0.15, `p95 ${p95}, max ${mx}`);
  let agree = 0, n = 0;
  for (const Q of Object.values(pieces)) for (let j = 0; j < Q.m.h; j++) for (let i = 0; i < Q.m.w; i++) {
    const [x, z] = Q.L.centre(i, j), sd = (Q.m.at(i, j)[1] - 128) / 127; if (Math.abs(sd) <= 0.1) continue;
    let lvl = null;
    for (const b of Q.bodies) { if (b.virtual) continue;
      if (b.kind === 'still') { if (WB.inPoly(b.poly, x, z)) lvl = Math.max(lvl ?? -Infinity, b.level); }
      else { const [hit, nn] = ribbonReach(WB, b, x, z); if (hit) lvl = Math.max(lvl ?? -Infinity, nn.y); } }
    if (lvl == null) continue;
    const g = WB.gridHeight(Q.grid, x, z); if (!Number.isFinite(g)) continue;
    n++; if ((sd > 0) === (g < lvl)) agree++;
  }
  ok('W3b G agrees with "ground < level" on >= 98 % of carved-body texels away from the boundary (|sd| > 0.1 u)', n && agree / n >= 0.98, `${agree}/${n}`);
});
// W3c regression (a pale fan at the river's head by the MAIN seam): a carved ribbon's water never reaches the edge of its mesh (half width + 0.2 u)
if (want('W3')) await guard('W3c', async () => {
  const { WB, pieces } = await ctx(), P = pieces.wetland; if (!P) return miss('W3c wetland map', 'no wetland map');
  const stills = P.bodies.filter((b) => b.kind === 'still'), ribs = P.bodies.filter((b) => b.kind === 'ribbon');
  let out = 0, n = 0, worst = 0;
  for (let j = 0; j < P.m.h; j++) for (let i = 0; i < P.m.w; i++) {
    if (P.m.at(i, j)[1] <= 128) continue; const [x, z] = P.L.centre(i, j);
    if (stills.some((b) => WB.inPoly(b.poly, x, z) || polyEdgeD(b.poly, x, z) <= 0.3)) continue;   // inside a still body or at its shore: the junction
    let best = null; for (const b of ribs) { const nn = WB.nearestOnLine(b.line, x, z); if (!best || nn.d - nn.w / 2 < best.d - best.w / 2) best = nn; }
    if (!best) continue; n++; const over = best.d - (best.w / 2 + 0.2); if (over > 0) { out++; worst = Math.max(worst, over); }
  }
  ok('W3c carved ribbons: every wet texel outside the still bodies lies inside its ribbon mesh (half width + 0.2 u)', n > 0 && !out, `${out} of ${n} beyond the edge (worst ${worst.toFixed(3)} u)`);
});

// ---- W4 flow ----
if (want('W4')) await guard('W4', async () => {
  const { WB, pieces } = await ctx(), P = pieces.wetland;
  if (!P) miss('W4a wetland map', 'no wetland map');
  else {
    const lake = P.bodies.find((b) => b.name === 'lake'), river = P.bodies.find((b) => b.name === 'river'), out = P.bodies.find((b) => b.name === 'outflow');
    const mouth = river.line[river.line.length - 1], exit = out.line[0];
    // start at the flowing lake water nearest the river mouth, check the flow there points away from it, then trace the streamline (RK2, 0.05 u steps)
    let x = mouth.x, z = mouth.z, best = Infinity, steps = 0, near = Infinity;
    for (let r = 0.05; r <= 1.5 && near === Infinity; r += 0.05) for (let a = 0; a < 64; a++) { const px = mouth.x + Math.cos((a / 64) * TAU) * r, pz = mouth.z + Math.sin((a / 64) * TAU) * r, [fx, fz] = P.L.flow(px, pz);
      if (WB.inPoly(lake.poly, px, pz) && Math.hypot(fx, fz) > 2e-3 && r < near) { near = r; x = px; z = pz; } }
    const [f0x, f0z] = P.L.flow(x, z), leaves = near < 1.5 && (f0x * (x - mouth.x) + f0z * (z - mouth.z)) > 0;
    for (; steps < 4000; steps++) {
      const [ax, az] = P.L.flow(x, z), ma = Math.hypot(ax, az); if (ma < 1e-4) break;
      const [bx, bz] = P.L.flow(x + (ax / ma) * 0.025, z + (az / ma) * 0.025), mb = Math.hypot(bx, bz) || ma;
      x += (bx / mb) * 0.05; z += (bz / mb) * 0.05; best = Math.min(best, Math.hypot(x - exit.x, z - exit.z)); if (best < 0.6) break;
    }
    ok('W4a the lake\'s flow leaves the river mouth (into the lake) and its streamline reaches the outflow (within 0.6 u)', leaves && best < 0.6, `leaves ${leaves}; closest ${best.toFixed(3)} u after ${steps} steps`);
  }
  let vmax = 0, still = 0, stillN = 0; const nonzero = {};
  for (const Q of Object.values(pieces)) for (let j = 0; j < Q.m.h; j++) for (let i = 0; i < Q.m.w; i++) {
    const t = Q.m.at(i, j); vmax = Math.max(vmax, Math.hypot((t[2] - 128) / 255, (t[3] - 128) / 255)); if (t[1] <= 128) continue;
    const [x, z] = Q.L.centre(i, j);
    const owner = (Q.bodies.find((b) => b.kind === 'still' && WB.inPoly(b.poly, x, z)) || Q.bodies.find((b) => b.kind === 'ribbon' && ribbonReach(WB, b, x, z)[0]) || {}).name;
    if (!owner) continue;
    const flows = t[2] !== 128 || t[3] !== 128; if (flows) nonzero[owner] = (nonzero[owner] || 0) + 1;
    if (['tarn', 'river', 'outflow'].includes(owner)) { stillN++; if (flows) still++; }
  }
  ok('W4b |v| <= 0.5 u/s everywhere', vmax <= 0.5 + 1e-9, `max |v| ${vmax.toFixed(3)}`);
  // the farm stream is one surface with the pond, so it carries the pond's flow
  ok('W4c the tarn, the river and the outflow carry no flow; the pond, the farm stream (one surface with it), the lake and the spring do', stillN > 0 && !still && nonzero.pond > 0 && nonzero.stream > 0 && nonzero.lake > 0 && nonzero.spring > 0, `${still}/${stillN} still texels flow; ${JSON.stringify(nonzero)}`);
});

// ---- the water GLBs: { tris, nodes: { [node]: { P, UV, I, rows: [{ c: [x, y, z], u, u2, v0, v1 }] (ribbon / fall: vertex pairs per row), t, extras, material } } } ----
const locOf = (P, t, v) => [P[v * 3] + t[0], P[v * 3 + 1] + t[1], P[v * 3 + 2] + t[2]], loc = (n, v) => locOf(n.P, n.t, v);
const rowsOf = (P, UV, t, from = 0, merged) => { const rows = [];
  for (let v = from; v + 1 < P.length / 3; v += 2) { const a = locOf(P, t, v), b = locOf(P, t, v + 1); rows.push({ c: a.map((x, k) => (x + b[k]) / 2), u: UV[v * 2], u2: UV[v * 2 + 2], v0: UV[v * 2 + 1], v1: UV[v * 2 + 3], ...(merged ? { merged } : {}) }); }
  return rows; };
const _glb = {};
async function waterGlb(id) {
  if (id in _glb) return _glb[id];
  const f = path.join(MODELS, `water_${id}.glb`); if (!fs.existsSync(f)) return (_glb[id] = null);
  const { NodeIO } = await import('@gltf-transform/core'), doc = await new NodeIO().read(f), out = { tris: 0, nodes: {} };
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh(), t = n.getTranslation(); if (!m) { out.nodes[n.getName()] = { empty: true, t, extras: n.getExtras() }; continue; }
    const pr = m.listPrimitives()[0], P = pr.getAttribute('POSITION').getArray(), uvA = pr.getAttribute('TEXCOORD_0'), UV = uvA ? uvA.getArray() : null, I = pr.getIndices().getArray();
    out.tris += I.length / 3;
    out.nodes[n.getName()] = { P, UV, I, rows: UV ? rowsOf(P, UV, t) : [], t, extras: m.getExtras(), material: pr.getMaterial() && pr.getMaterial().getName() };
  }
  // the farm stream is drawn as part of water_pond: its ribbon rows are the vertex pairs after the outline's vertices
  const pn = out.nodes.water_pond, np = A.farmWater ? A.farmWater.pond.outline.length : 0;
  if (id === 'main' && !out.nodes.water_stream && pn && pn.UV && pn.P.length / 3 > np + 2) out.nodes.__farm_stream = { rows: rowsOf(pn.P, pn.UV, pn.t, np, true), t: pn.t, merged: true };
  return (_glb[id] = out);
}

// ---- W5 ribbons ----
if (want('W5')) await guard('W5', async () => {
  const gm = await waterGlb('main'), gw = await waterGlb('wetland'), W = GT.blueprintWater(bp()), WB = await import('../lib/water-bake.mjs');
  if (!gm || !gw) return miss('W5 ribbons', 'water_main.glb / water_wetland.glb missing');
  const SN = gm.nodes.water_stream ? 'water_stream' : '__farm_stream', arc = [];
  let arcOk = true;
  for (const [id, name, g] of [['main', SN, gm], ['wetland', 'water_river', gw], ['wetland', 'water_outflow', gw], ['main', 'water_fall', gm], ['wetland', 'water_fall', gw]]) {
    const n = g.nodes[name]; if (!n || !n.rows.length) { arcOk = false; arc.push(`${id}/${name} missing`); continue; }
    let s = 0, worst = 0;
    for (let i = 1; i < n.rows.length; i++) { s += d3(n.rows[i].c, n.rows[i - 1].c); worst = Math.max(worst, Math.abs(n.rows[i].u - n.rows[0].u - s) / Math.max(s, 0.2)); }
    const pairs = n.rows.every((r) => r.u === r.u2 && r.v0 === 0 && r.v1 === 1);
    if (!(worst <= 0.01) || !pairs) arcOk = false;
    arc.push(`${id}/${name} ${s.toFixed(2)} u, worst ${(worst * 100).toFixed(2)} %${pairs ? '' : ' (bad uv pairs)'}`);
  }
  ok('W5a ribbons + falls: TEXCOORD_0 u = world arc length within 1 % (v 0..1 across)', arcOk, arc.join('; '));
  // y = the level, away from the tucks (rows 0.01 u under a still body, or the merged pond surface easing down over 0.8 u after the cap line)
  const lvlRows = []; let yOk = true;
  const check = (name, g, levelAt, stills) => {
    const n = g.nodes[name]; if (!n) { yOk = false; lvlRows.push(name + ' missing'); return; }
    let worst = 0, badTuck = 0;
    for (const r of n.rows) {
      const [x, y, z] = r.c, L2 = levelAt(x, z), st = stills.find((b) => WB.inPoly(b.poly, x, z) || polyEdgeD(b.poly, x, z) <= 0.55);
      if (st && y < L2 - 1e-4) { if (y < st.level - 0.0101 || y > L2) badTuck++; continue; }
      const J0 = r.merged && (WJ().pieces.main.bodies.find((b) => b.node === 'water_pond') || {}).join;
      if (J0 && y > L2 + 1e-4 && r.u <= J0.u0 + 0.85) { if (y > (stills.length ? stills[0].level : 0) + 1e-4) badTuck++; continue; }
      worst = Math.max(worst, Math.abs(y - L2));
    }
    if (worst > 1e-3 || badTuck) yOk = false;
    lvlRows.push(`${name} |dy| ${worst.toFixed(5)}${badTuck ? ` (${badTuck} bad tucks)` : ''}`);
  };
  const bodies = (id) => WB.waterBodies(W, id, BPJ().pieces[id].dockedPosition), bodiesM = bodies('main'), bodiesW = bodies('wetland');
  const lineLevel = (body) => (x, z) => WB.nearestOnLine(body.line, x, z).y;
  check(SN, gm, lineLevel(bodiesM.find((b) => b.name === 'stream')), bodiesM.filter((b) => b.kind === 'still'));
  for (const nm of ['river', 'outflow']) check('water_' + nm, gw, lineLevel(bodiesW.find((b) => b.name === nm)), bodiesW.filter((b) => b.kind === 'still'));
  ok('W5b ribbon centrelines sit at the level (1e-3 u), except where they tuck 0.01 u under a still body', yOk, lvlRows.join('; '));
  // joins in world space
  const st = gm.nodes[SN], rv = gw.nodes.water_river, of = gw.nodes.water_outflow, fm = gm.nodes.water_fall, fw = gw.nodes.water_fall, joins = [];
  let jOk = !!(st && rv && of && fm && fw);
  if (jOk) {
    const sEnd = toWorld('main', st.rows[st.rows.length - 1].c), rStart = toWorld('wetland', rv.rows[0].c);
    for (const [nm, a, b, ua, ub] of [['stream end -> river start', sEnd, rStart, st.rows[st.rows.length - 1].u, rv.rows[0].u], ['farm fall top -> stream end', fm.rows[0].c, st.rows[st.rows.length - 1].c, fm.rows[0].u, st.rows[st.rows.length - 1].u],
      ['wetland fall top -> outflow end', fw.rows[0].c, of.rows[of.rows.length - 1].c, fw.rows[0].u, of.rows[of.rows.length - 1].u]]) {
      const d = d3(a, b), du = Math.abs(ua - ub); joins.push(`${nm} ${d.toExponential(2)} u (u jump ${du.toExponential(2)})`); if (d > 1e-4 || du > 1e-4) jOk = false; }
  }
  ok('W5c the stream\'s rim end meets the river\'s start (1e-4 u, u carries on); each fall\'s top meets its channel\'s end', jOk, joins.join('; ') || 'nodes missing');
});

// ---- W6 falls ----
function pointTri(p, a, b, c) {   // squared distance point -> triangle (Ericson, Real-Time Collision Detection 5.1.5)
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], lerp = (o, e, s) => [o[0] + e[0] * s, o[1] + e[1] * s, o[2] + e[2] * s];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); let q;
  const bp2 = sub(p, b), d3_ = dot(ab, bp2), d4 = dot(ac, bp2), cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp), vc = d1 * d4 - d3_ * d2, vb = d5 * d2 - d1 * d6, va = d3_ * d6 - d5 * d4;
  if (d1 <= 0 && d2 <= 0) q = a;
  else if (d3_ >= 0 && d4 <= d3_) q = b;
  else if (vc <= 0 && d1 >= 0 && d3_ <= 0) q = lerp(a, ab, d1 / (d1 - d3_));
  else if (d6 >= 0 && d5 <= d6) q = c;
  else if (vb <= 0 && d2 >= 0 && d6 <= 0) q = lerp(a, ac, d2 / (d2 - d6));
  else if (va <= 0 && d4 - d3_ >= 0 && d5 - d6 >= 0) q = lerp(b, sub(c, b), (d4 - d3_) / ((d4 - d3_) + (d5 - d6)));
  else { const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]; }
  const d = sub(p, q); return dot(d, d);
}
if (want('W6')) await guard('W6', async () => {
  const { NodeIO } = await import('@gltf-transform/core'), rows = []; let pass = true;
  for (const id of ['main', 'wetland']) {
    const g = await waterGlb(id), f = g && g.nodes.water_fall; if (!f) { pass = false; rows.push(id + ' fall missing'); continue; }
    const doc = await new NodeIO().read(path.join(MODELS, `piece_${id}.glb`)), pr = doc.getRoot().listMeshes().find((m) => m.getName() === 'piece_' + id).listPrimitives()[0];
    const RP = pr.getAttribute('POSITION').getArray(), RI = pr.getIndices().getArray(), tris = [];
    for (let t = 0; t < RI.length; t += 3) tris.push([0, 1, 2].map((k) => [RP[RI[t + k] * 3], RP[RI[t + k] * 3 + 1], RP[RI[t + k] * 3 + 2]]));
    let minD = Infinity, inside = 0, curl = 0;
    const nV = f.P.length / 3, yTop = (f.P[1] + f.P[4]) / 2 + f.t[1];
    for (let v = 2; v < nV; v++) {   // the top row (vertices 0-1) sits on the channel at the lip
      const p = loc(f, v);
      const isCurl = p[1] > yTop - 0.1; if (isCurl) curl++;   // the curl (rows within 0.1 u of the top) lies ON the brink by design: never inside the rock, but the 0.1 u clearance holds below it
      let d2 = Infinity, cross = 0;
      for (const [a, b, c] of tris) {
        if ([0, 1, 2].every((k) => Math.min(a[k], b[k], c[k]) - 0.5 < p[k] && Math.max(a[k], b[k], c[k]) + 0.5 > p[k])) d2 = Math.min(d2, pointTri(p, a, b, c));
        // vertical ray up: an odd number of crossings of the closed piece = inside the rock
        const det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]); if (Math.abs(det) < 1e-12) continue;
        const l1 = ((p[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (p[2] - a[2])) / det, l2 = ((b[0] - a[0]) * (p[2] - a[2]) - (p[0] - a[0]) * (b[2] - a[2])) / det;
        if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1 && a[1] + l1 * (b[1] - a[1]) + l2 * (c[1] - a[1]) > p[1]) cross++;
      }
      if (!isCurl) minD = Math.min(minD, Math.sqrt(d2)); if (cross % 2) inside++;
    }
    let low = Infinity; for (let v = 0; v < nV; v++) low = Math.min(low, f.P[v * 3 + 1] + f.t[1] + BPJ().pieces[id].dockedPosition[1]);
    if (!(minD >= 0.1 && !inside && low <= -10)) pass = false;
    rows.push(`${id}: closest rock ${minD.toFixed(3)} u, ${inside} inside, ${curl} curl vertices, lowest world y ${low.toFixed(2)}`);
  }
  ok('W6 falls: every vertex more than 0.1 u below the lip >= 0.1 u outside the baked rock (piece GLB), none inside it (the curl too), both falls reach y <= -10', pass, rows.join('; '));
});

// ---- W7 budgets ----
if (want('W7')) await guard('W7', async () => {
  const j = WJ(), bad = [], ids = j && j.pieces ? Object.keys(j.pieces) : [];
  for (const id of ids) { const m = j.pieces[id].map, f = path.join(MODELS, m.file), len = fs.existsSync(f) ? fs.statSync(f).size : -1;
    if (m.size[0] > 512 || m.size[1] > 512) bad.push(`${id} ${m.size}`); if (m.size[0] % 8 || m.size[1] % 8) bad.push(`${id} not x8`);
    if (len !== m.size[0] * m.size[1] * 4) bad.push(`${id} ${len} B != w*h*4`); if (Math.abs(m.texel - 0.05) > 1e-12) bad.push(`${id} texel ${m.texel}`); }
  ok('W7a maps: raw RGBA8, <= 512 texels a side, sides x8, 0.05 u texels (main present)', ids.includes('main') && !bad.length, bad.join('; '));
  const nf = path.join(MODELS, 'water_noise.bin'), N = fs.existsSync(nf) ? fs.readFileSync(nf) : null, S = 128;
  let pass = false, det = 'missing';
  if (N && N.length === S * S * 2) {
    det = ''; pass = true;
    for (let c = 0; c < 2; c++) {
      const v = (i, k) => N[2 * (((k + S) % S) * S + ((i + S) % S)) + c];
      let inMax = 0, inSum = 0, inN = 0, wMax = 0, wSum = 0, wN = 0;
      for (let k = 0; k < S; k++) for (let i = 0; i < S; i++) for (const [di, dk] of [[1, 0], [0, 1]]) {
        const d = Math.abs(v(i, k) - v(i + di, k + dk));
        if ((di && i === S - 1) || (dk && k === S - 1)) { wMax = Math.max(wMax, d); wSum += d; wN++; } else { inMax = Math.max(inMax, d); inSum += d; inN++; } }
      let mn = 255, mx = 0; for (let q = c; q < N.length; q += 2) { mn = Math.min(mn, N[q]); mx = Math.max(mx, N[q]); }
      pass = pass && wMax <= inMax && wSum / wN <= 1.5 * (inSum / inN) && mx - mn > 200; det += `ch${c}: wrap max ${wMax} mean ${(wSum / wN).toFixed(2)} vs interior ${inMax} / ${(inSum / inN).toFixed(2)}, range ${mn}-${mx}; `;
    }
    let cor = 0, sa = 0, sb = 0, saa = 0, sbb = 0; const n = S * S;
    for (let q = 0; q < n; q++) { const a = N[2 * q], b = N[2 * q + 1]; sa += a; sb += b; saa += a * a; sbb += b * b; cor += a * b; }
    const r = (cor / n - (sa / n) * (sb / n)) / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2));
    pass = pass && Math.abs(r) < 0.2; det += `corr(R, G) ${r.toFixed(3)}`;
  }
  ok('W7b water_noise.bin: 128x128 RG8, tiles seamlessly (wrap steps like interior steps), full range, channels decorrelated', pass, det);
  const per = [], NODES = { main: ['water_pond', 'water_fall', 'water_fall_skirt', 'mist_fall'], wetland: ['water_lake', 'water_river', 'water_outflow', 'water_fall', 'water_fall_skirt', 'mist_fall'], highland: ['water_tarn', 'water_spring', 'steam_spring'] };
  let gOk = true;
  for (const id of Object.keys(NODES)) {
    const g = await waterGlb(id); if (!g) { gOk = false; per.push(id + ' missing'); continue; }
    const missing = NODES[id].filter((n) => !g.nodes[n]), mats = [...new Set(Object.entries(g.nodes).filter(([k, n]) => !n.empty && !k.startsWith('__')).map(([, n]) => n.material))];
    if (g.tris > 1500 || missing.length || mats.join() !== 'Water') gOk = false;
    per.push(`${id} ${g.tris} tris${missing.length ? ' missing ' + missing : ''}${mats.join() !== 'Water' ? ' materials ' + mats : ''}`);
    if (id === 'main') { const pb = j && j.pieces.main.bodies.find((b) => b.node === 'water_pond'), J = pb && pb.join;   // one surface: the pond carries the stream's join metadata
      if (!(!g.nodes.water_stream && J && Math.abs(J.ramp - 1.5) < 1e-9 && J.handover === 1 && J.to === 'river' && J.u0 > 0 && J.uEnd > J.u0 && pb.palette === 'pond')) { gOk = false; per.push('main: bad water_pond join / separate water_stream'); } }
  }
  ok('W7c water_<piece>.glb: the spec\'s nodes (the farm stream is part of water_pond, with its join), one material `Water`, <= 1,500 triangles a piece', gOk, per.join('; '));
});

// ---- W8 nothing moves ----
// the art-owned farm stream curve: THREE.CatmullRomCurve3 (centripetal) through the exported points + the steer point, sampled from P0 to the rim exit
// only (parameter 0 .. (n - 2) / (n - 1)) by arc length; written from the spec, independently of water-bake.mjs. -> dense [[x, z, y]] (2001 samples)
async function artStreamCurve(st) {
  const THREE = await import('three'), P = [...st.points, st.steer], n = P.length, tEnd = (n - 2) / (n - 1);
  const c = new THREE.CatmullRomCurve3(P.map((p) => new THREE.Vector3(p.x, p.level, p.z))), N = 8000, pts = [], cum = [0];
  for (let i = 0; i <= N; i++) { pts.push(c.getPoint((tEnd * i) / N)); if (i) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1])); }
  const out = []; let k = 0;
  for (let j = 0; j <= 2000; j++) { const s = (cum[N] * j) / 2000; while (k < N - 1 && cum[k + 1] < s) k++; const f = (s - cum[k]) / (cum[k + 1] - cum[k] || 1), p = pts[k].clone().lerp(pts[k + 1], Math.min(1, Math.max(0, f))); out.push([p.x, p.z, p.y]); }
  return out;
}
if (want('W8')) await guard('W8c', async () => {
  const gm = await waterGlb('main'), NAME = 'W8c the stream mesh centreline = the art-owned curve (0.01 u, rim end exact); the pond mesh has every art-owned outline vertex (0.01 u)';
  if (!gm || !gm.nodes.water_pond) return miss(NAME, 'water_main.glb missing');
  const W = GT.blueprintWater(bp()), FW = A.farmWater;
  if (!FW || !W.main.stream.steer) return miss(NAME, 'no art-owned farm water (archipelago.farmWater / main.stream.steer)');
  const dense = await artStreamCurve(W.main.stream), distTo = (x, z) => Math.min(...dense.slice(0, -1).map((a, k) => segD(x, z, a, dense[k + 1])[0]));
  const rows = (gm.nodes.water_stream || gm.nodes.__farm_stream).rows.map((r) => toWorld('main', r.c));   // the stream's own node, or the merged pond surface's ribbon rows
  const worst = Math.max(...rows.map((c) => distTo(c[0], c[2]))), last = rows[rows.length - 1], endD = Math.hypot(last[0] - dense[dense.length - 1][0], last[2] - dense[dense.length - 1][1]);
  const { P, t } = gm.nodes.water_pond; let pw = 0;
  for (const b of FW.pond.outline) { let d = Infinity; for (let v = 0; v < P.length / 3; v++) d = Math.min(d, Math.hypot(P[v * 3] + t[0] - b[0], P[v * 3 + 2] + t[2] - b[1])); pw = Math.max(pw, d); }
  ok(NAME, worst <= 0.01 && endD <= 0.01 && pw <= 0.01, `stream worst ${worst.toFixed(5)} u, rim end ${endD.toFixed(5)} u; pond worst ${pw.toFixed(5)} u`);
});
// the game's Water.tsx blob(radius, seed, 22) (rng = GT.gameRng), laid flat by the mesh's rotation-x -PI/2 (shape y -> world -z), at POND
function gameBlob(radius, seed, points = 22) {
  const r = GT.gameRng(seed), out = [];
  for (let i = 0; i < points; i++) { const a = (i / points) * TAU, rad = radius * (1 + Math.sin(a * 3 + 1.2) * 0.06 + (r() - 0.5) * 0.05); out.push([G.POND.x + Math.cos(a) * rad, G.POND.z - Math.sin(a) * rad]); }
  return out;
}
// the farm pond is art-owned (archipelago.farmWater); the game's blob stays exported as the legacy fallback's shape (main.pond.legacy)
if (want('W8')) guard('W8a', () => {
  const W = GT.blueprintWater(bp()), po = W.main.pond && W.main.pond.outline, ref = A.farmWater && A.farmWater.pond.outline, leg = W.main.pond && W.main.pond.legacy, blob = gameBlob(G.POND.r, 3);
  const worstOf = (a, b) => (Array.isArray(a) && Array.isArray(b) && a.length === b.length ? Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1]))) : Infinity);
  const worst = worstOf(po, ref), lw = worstOf(leg && leg.outline, blob);
  ok('W8a main.pond.outline = the art-owned outline (same points, same order, 0.01 u); main.pond.legacy.outline = the game\'s blob(POND.r, 3)', worst <= 0.01 && lw <= 0.01, `art-owned worst ${worst}; legacy worst ${lw}`);
  const f = W.main.waterfall && W.main.waterfall.points, ex = W.main.stream.rimExit, wf = W.wetland.waterfall.points;
  let det = 'missing', pass = false;
  if (Array.isArray(f) && f.length === wf.length) {
    const top = f[0], bot = f[f.length - 1], dTop = Math.hypot(top[0] - ex.x, top[2] - ex.z), dyTop = Math.abs(top[1] - ex.level);
    const prof = (pts) => pts.map((p) => [Math.hypot(p[0] - pts[0][0], p[2] - pts[0][2]), p[1] - pts[0][1]]);   // (outward offset, drop) per point
    const pa = prof(f), pb = prof(wf), dProf = Math.max(...pa.map((q, i) => Math.hypot(q[0] - pb[i][0], q[1] - pb[i][1])));
    const dl = Math.hypot(bot[0] - top[0], bot[2] - top[2]) || 1, cosOut = ((bot[0] - top[0]) * Math.cos(ex.theta) + (bot[2] - top[2]) * Math.sin(ex.theta)) / dl;
    pass = dTop < 1e-3 && dyTop < 1e-3 && dProf < 1e-3 && bot[1] <= -10 && cosOut > 0.999;
    det = `top off the rim exit ${dTop.toFixed(5)} (dy ${dyTop.toFixed(5)}), profile diff ${dProf.toFixed(5)}, bottom y ${bot[1]}, outward cos ${cosOut.toFixed(5)}`;
  }
  ok('W8b main.waterfall.points = the wetland fall profile started at MAIN\'s rim exit, outward, down to y <= -10', pass, det);
});

// ---- W10 patchWaterLambert on three's MeshLambertMaterial shader (node three AND the r186 fixture): every chunk once and in order
// (worldpos_vertex < WATER_VERT; color_fragment < WATER_COLOR < WATER_LIGHT < opaque_fragment), anchors re-emitted, re-patch / missing anchor
// refused, phases bounded. WATER_CORE_MODULE=<file> runs it against a mutated copy (the mutation check). ----
if (want('W10')) await guard('W10', async () => {
  const WC = await import(process.env.WATER_CORE_MODULE || '../lib/water-core.mjs'), THREE = await import('three'), SL = THREE.ShaderLib.lambert, rows = [];
  const fx = readJSON(path.join(__dirname, 'fixtures', 'three-r186-lambert.json')) || {};
  let pass = !!(fx.meshlambert_vertex && fx.meshlambert_fragment); if (!pass) rows.push('r186 fixture lacks meshlambert_vertex / meshlambert_fragment');
  const AN = WC.WATER_ANCHORS;
  for (const [name, vs, fs2] of [['three ' + THREE.REVISION, SL.vertexShader, SL.fragmentShader], ['r186 fixture', fx.meshlambert_vertex, fx.meshlambert_fragment]]) {
    if (!vs || !fs2) continue;
    for (const kind of ['still', 'ribbon', 'fall']) for (const tier of ['phone', 'mid']) {
      const r = WC.patchWaterLambert(vs, fs2, { kind, tier, flow: kind === 'still' }), V = r.vertexShader, F = r.fragmentShader, bad = [];
      if (!r.applied) bad.push('not applied: ' + r.misses);
      for (const [lbl, src, chunk] of [['VERT_PARS', V, WC.WATER_VERT_PARS], ['VERT', V, WC.WATER_VERT], ['FRAG_PARS', F, WC.WATER_FRAG_PARS], ['COLOR', F, WC.WATER_COLOR], ['LIGHT', F, WC.WATER_LIGHT],
        ...[[AN.vertCommon, V], [AN.vertWorld, V], [AN.fragCommon, F], [AN.color, F], [AN.opaque, F]].map(([a, s]) => ['anchor ' + a, s, a])]) { const n = src.split(chunk).length - 1; if (n !== 1) bad.push(`${lbl} x${n}`); }   // anchors are re-emitted once, for later patches
      const iv = [V.indexOf('#include <worldpos_vertex>'), V.indexOf(WC.WATER_VERT)], ifr = [F.indexOf('#include <color_fragment>'), F.indexOf(WC.WATER_COLOR), F.indexOf(WC.WATER_LIGHT), F.indexOf('#include <opaque_fragment>')];
      if (!(iv[0] >= 0 && iv[0] < iv[1])) bad.push('WATER_VERT not after worldpos_vertex');
      if (!(ifr.every((x) => x >= 0) && ifr[0] < ifr[1] && ifr[1] < ifr[2] && ifr[2] < ifr[3])) bad.push(`fragment order ${ifr}`);
      if (!F.includes(`#define WATER_${kind.toUpperCase()}`) || F.includes('#define WATER_MID') !== (tier === 'mid')) bad.push('defines');
      if (WC.patchWaterLambert(V, F, { kind, tier }).applied) bad.push('re-patch accepted');
      if (bad.length) { pass = false; rows.push(`${name} ${kind}/${tier}: ${bad.join(', ')}`); }
    }
  }
  const noAnchor = WC.patchWaterLambert(SL.vertexShader, SL.fragmentShader.replace('#include <opaque_fragment>', ''), { kind: 'still' });
  if (noAnchor.applied || !noAnchor.misses.length) { pass = false; rows.push('missing anchor not refused'); }
  const ph = WC.waterPhases(1e7), P = WC.PHASE_PERIODS;
  if (!(ph.scrollA.every((v) => v >= 0 && v < P.scrollA) && ph.scrollB.every((v) => v >= 0 && v < P.scrollB) && ph.ribbon < P.ribbon && ph.fall1 < P.fall && ph.foam < 1)) { pass = false; rows.push('phases unbounded at 1e7 s'); }
  ok('W10 patchWaterLambert (three node + r186 fixture, 3 kinds x 2 tiers): each chunk once and in order, anchors re-emitted, re-patch / missing anchor refused, phases bounded', pass, rows.slice(0, 4).join('; '));
});

// ---- W11 palette character + tuned Fresnel / glints ----
if (want('W11')) await guard('W11', async () => {
  const WC = await import('../lib/water-core.mjs'), P0 = WC.PALETTES, rows = []; let pass = true;
  for (const [b, slack] of [['pond', 0], ['lake', 6]]) { const [, g, bl] = hexRgb(P0[b].deep); if (!(g >= bl - slack)) { pass = false; rows.push(`${b} deep too blue`); } }   // pond teal-green, lake cool but not navy
  // the pond is signed off as is; the lake is livelier (deep max channel >= 118, mid >= 160), green-teal (G > B) and cooler than the pond (deep B / G above the pond's)
  const [, pg, pb] = hexRgb(P0.pond.deep), ld = hexRgb(P0.lake.deep), lm = hexRgb(P0.lake.mid);
  const lake = { pondKept: P0.pond.deep.toUpperCase() === '#43726E', lively: Math.max(...ld) >= 118 && Math.max(...lm) >= 160, teal: ld[1] > ld[2], cooler: ld[2] / ld[1] > pb / pg };
  if (!Object.values(lake).every(Boolean)) { pass = false; rows.push(JSON.stringify(lake)); }
  // Fresnel capped over deep water, desaturated sky tone, glints in the sun path (broad lobe on the flat normal), pixel-size fade
  for (const [k, re] of Object.entries({ 'Fresnel cap': /wDeepF/, 'sky tone': /wSkyGrey/, 'sun-path lobe': /wSunPath/, 'pixel-size fade': /wGlintPx/ })) if (!re.test(WC.WATER_LIGHT)) { pass = false; rows.push(k + ' missing'); }
  ok('W11 palette character + tuned Fresnel / glints (pond deep teal-green, lake not navy; F capped over deep; glints in the sun path, gone at the phone framing)', pass, rows.join('; '));
});

// ---- W12 every CPU-wrapped phase use wraps invisibly (period x scale / tile is a whole number) and is in the shader source ----
if (want('W12')) await guard('W12', async () => {
  const WC = await import('../lib/water-core.mjs'), src = WC.WATER_COLOR + WC.WATER_LIGHT + WC.WATER_FRAG_PARS, rows = [];
  let pass = Array.isArray(WC.PHASE_USES) && WC.PHASE_USES.length > 0;
  for (const u of WC.PHASE_USES || []) {
    const k = (WC.PHASE_PERIODS[u.phase] * u.scale) / u.tile, whole = Number.isFinite(k) && Math.abs(k - Math.round(k)) < 1e-6 && Math.round(k) >= 1, inSrc = src.includes(u.glsl);
    if (!whole || !inSrc) { pass = false; rows.push(`${u.phase} x ${+u.scale.toFixed(4)} on tile ${+u.tile.toFixed(4)}: ${k.toFixed(3)} tiles a wrap${inSrc ? '' : ' (not in the GLSL)'}`); }
  }
  ok('W12 every phase use wraps on a whole number of its texture tiles (period x scale / tile integer), and is in the GLSL', pass, rows.join('; '));
});

// ---- W13 the Teardrop pond outline (art-owned) + clearances + stream ----
const polyArea = (P) => Math.abs(P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
function selfCross(P) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])), X = (a, b, c, d) => o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  let n = 0; for (let i = 0; i < P.length; i++) for (let j = i + 2; j < P.length; j++) { if (i === 0 && j === P.length - 1) continue; if (X(P[i], P[(i + 1) % P.length], P[j], P[(j + 1) % P.length])) n++; } return n;
}
// signed distance (negative inside) to the farm water = pond polygon U stream ribbon, world xz
function farmWaterSd(W) {
  const po = W.main.pond.outline, line = W.main.stream.line || [];
  const inP = (x, z) => { let ins = false; for (let i = 0, j = po.length - 1; i < po.length; j = i++) { const [xi, zi] = po[i], [xj, zj] = po[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
  return (x, z) => {
    let s = inP(x, z) ? -polyEdgeD(po, x, z) : polyEdgeD(po, x, z);
    for (let i = 0; i < line.length - 1; i++) { const a = line[i], b = line[i + 1], [d, t] = segD(x, z, [a.x, a.z], [b.x, b.z]); s = Math.min(s, d - (a.width + (b.width - a.width) * t) / 2); }
    return s;
  };
}
if (want('W13')) await guard('W13', async () => {
  const W = GT.blueprintWater(bp()), FW = A.farmWater, po = W.main.pond.outline;
  const area = polyArea(po), cross = selfCross(po), cap = FW && FW.pond.outline;
  const capOk = Array.isArray(cap) && Math.hypot(po[0][0] + 5.0327, po[0][1] - 6.0647) < 1e-3 && Math.hypot(po[po.length - 1][0] + 4.8327, po[po.length - 1][1] - 5.6456) < 1e-3;
  ok('W13a the Teardrop outline: 191 points, closes on the cap line (first / last = the cap corners), no self-intersection, area 9.32 u2 (+/- 0.01)', po.length === 191 && capOk && !cross && Math.abs(area - 9.32) <= 0.01, `${po.length} points, area ${area.toFixed(4)}, ${cross} self-crossings, cap ${capOk}`);
  // clearances from the shape report: [label, x, z, r (subtracted: disc edge), report value, hard limit (>= 0.3 u)]
  const sd = farmWaterSd(W), bad = [];
  for (const [lbl, x, z, r, want2, hard] of [['garden fence SW corner', 0.17, 3.16, 0, 0.86, 1], ['lantern (0.45, 4.6)', 0.45, 4.6, 0, 0.74, 1], ['bench disc r0.6', 0.2, 5.77, 0.6, 0.32, 1],
    ['lantern (-2.95, 2.75)', -2.95, 2.75, 0, 0.79, 1], ['dirt-path fork end', -1.85, 2.75, 0, 0.38, 1], ['rock (-2.8, 7.0)', -2.8, 7.0, 0, 0.59, 1], ['bush (-0.4, 6.6)', -0.4, 6.6, 0, 1.03, 1],
    ['fruit tree (-4.8, 4.6)', -4.8, 4.6, 0, 0.93, 1], ['static tree (-5.8, 3.4)', -5.8, 3.4, 0, 1.89, 1], ['mailbox r0.25', -3.95, 3.85, 0.25, 0.63, 0], ['hedge cottage r0.9', -4.85, 3.4, 0.9, 0.96, 0],
    ['flowerbed 6 r0.6', -4.35, 2.55, 0.6, 1.32, 0], ['jetty lane end (in the pond)', -1.25, 4.45, 0, -0.96, 0], ['jetty lane shore end', -0.3, 4.8, 0, 0.02, 0], ['flowerbed 8 r0.6 (new spot)', -1.5, 7.75, 0.6, 0.89, 1]]) {
    const v = sd(x, z) - r; if (Math.abs(v - want2) > 0.03 || (hard && v < 0.3)) bad.push(`${lbl} ${v.toFixed(3)} vs ${want2}`); }
  ok('W13b every clearance of the shape report (water = pond + stream ribbon): hard limits >= 0.3 u, each within 0.03 u of the report', !bad.length, 'off: ' + bad.join('; '));
  // the stream leaves at pond level and only falls, the rim exit stays pinned, flowerbed 8 moved, the baked stream body starts at pond level
  const st = W.main.stream, P = st.points, ex = st.rimExit, pl = W.main.pond.level, L2 = st.line || [], rim = P[P.length - 1];
  const falls = P.every((p, i) => !i || p.level <= P[i - 1].level + 1e-9) && L2.every((p, i) => !i || p.level <= L2[i - 1].level + 1e-4);
  const pinned = Math.hypot(rim.x + 6.8147, rim.z - 5.9962) < 1e-4 && Math.abs(rim.level - 0.02) < 1e-3 && Math.abs(rim.width - 0.54) < 1e-4 && Math.hypot(ex.x - rim.x, ex.z - rim.z) < 1e-4;
  const lineEnds = L2.length > 10 && Math.hypot(L2[0].x - P[0].x, L2[0].z - P[0].z) < 1e-4 && Math.hypot(L2[L2.length - 1].x - rim.x, L2[L2.length - 1].z - rim.z) < 1e-4;
  const fb = G.FLOWERBEDS[7], fbOk = Math.hypot(fb[0] + 1.5, fb[1] - 7.75) < 1e-9;
  const { WB } = await ctx(), pv = BPJ().pieces.main.dockedPosition, sb = WB.waterBodies(W, 'main', pv).find((b) => b.name === 'stream'), y0 = sb ? sb.line[0].y + pv[1] : NaN;
  ok('W13c the stream leaves the pond at pond level (0.06) and only falls; the rim exit pinned (-6.8147, 5.9962, 0.02, 0.54); the dense line runs P0 -> rim exit; the baked stream body starts at pond level; flowerbed 8 at (-1.50, 7.75)',
    Math.abs(P[0].level - pl) < 1e-4 && Math.abs(pl - 0.06) < 1e-3 && falls && pinned && lineEnds && Math.abs(y0 - pl) < 1e-4 && fbOk, `pond level ${pl}; falls ${falls}; pinned ${pinned}; ends ${lineEnds}; body y ${y0}; flowerbed ${fb}`);
});

// ---- W14 the seamless pond -> stream join: walk the centreline from the pond core (deepest texel) along the teardrop's sweep into the stream
// and down to the rim exit every 0.025 u on MAIN's baked map: no step in depth (R, <= 0.03 u), shore distance (G, <= 0.04 u) or palette
// (band colour at equal depth, <= 3 levels); one shore field over the union (sd >= 0.12 u all along); one mesh draws the junction and no two
// water triangles overlap within 1.2 u of the cap line ----
function bandColour(pal, d) {
  const b1 = sstep(0.08 - 0.015, 0.08 + 0.015, d), b2 = sstep(0.22 - 0.015, 0.22 + 0.015, d), S = hexRgb(pal.shallow), M = hexRgb(pal.mid), D = hexRgb(pal.deep);
  return [0, 1, 2].map((k) => (S[k] + (M[k] - S[k]) * b1) * (1 - b2) + D[k] * b2);
}
function triOverlap2(A2, B) {   // the interiors of two xz triangles overlap (SAT; touching edges / shared vertices do not count)
  for (const T of [A2, B]) for (let e = 0; e < 3; e++) {
    const p = T[e], q = T[(e + 1) % 3], nx = q[1] - p[1], nz = p[0] - q[0], a = A2.map((v) => v[0] * nx + v[1] * nz), b = B.map((v) => v[0] * nx + v[1] * nz);
    if (Math.max(...a) <= Math.min(...b) + 1e-7 || Math.max(...b) <= Math.min(...a) + 1e-7) return false;
  }
  return true;
}
if (want('W14')) await guard('W14', async () => {
  const { WB, pieces } = await ctx(), P = pieces.main, W = GT.blueprintWater(bp()), j = WJ(), gm = await waterGlb('main');
  if (!P || !gm || !j) return miss('W14 the seamless join', 'main map / GLB / water.json missing');
  const pond = P.bodies.find((b) => b.name === 'pond');
  let core = null, dmax = -1;
  for (let jj = 0; jj < P.m.h; jj++) for (let i = 0; i < P.m.w; i++) { const R = P.m.at(i, jj)[0], [x, z] = P.L.centre(i, jj); if (R > dmax && WB.inPoly(pond.poly, x, z)) { dmax = R; core = [x, z]; } }
  // MAIN's pivot is the origin: core -> the sweep centres -> P0 and down the stream line; s = arc length on the line (-1 before it)
  const line = W.main.stream.line, lead = [core, [-2.65, 5.3], [-3.3, 5.62], [line[0].x, line[0].z]], walk = [];
  const addSeg = (a, b, s0) => { const L2 = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L2 / 0.025)); for (let q = 0; q < n; q++) walk.push({ x: a[0] + (b[0] - a[0]) * q / n, z: a[1] + (b[1] - a[1]) * q / n, s: s0 < 0 ? -1 : s0 + L2 * q / n }); return L2; };
  for (let k = 0; k < lead.length - 1; k++) addSeg(lead[k], lead[k + 1], -1);
  let sL = 0; for (let k = 0; k < line.length - 1; k++) sL += addSeg([line[k].x, line[k].z], [line[k + 1].x, line[k + 1].z], sL);
  walk.push({ x: line[line.length - 1].x, z: line[line.length - 1].z, s: sL });
  const pb = j.pieces.main.bodies.find((b) => b.node === 'water_pond'), sb = j.pieces.main.bodies.find((b) => b.node === 'water_stream'), J = pb && pb.join, PAL = j.palettes;
  const palAt = (w) => {   // which palette draws there: the pond polygon's, else the stream's own, or the join's blend by u
    if (WB.inPoly(pond.poly, w.x, w.z)) return PAL[pb.palette];
    if (!J) return PAL[sb ? sb.palette : 'river'];
    const jR = sstep(J.uEnd - J.handover, J.uEnd, (w.s / sL) * J.uEnd), out = {};
    for (const k of ['shallow', 'mid', 'deep']) { const a = hexRgb(PAL[pb.palette][k]), b = hexRgb(PAL[J.to][k]); out[k] = '#' + a.map((v, c) => Math.round(v + (b[c] - v) * jR).toString(16).padStart(2, '0')).join(''); }
    return out;
  };
  let wD = 0, wS = 0, wC = 0, minSd = Infinity;
  for (let i = 0; i < walk.length; i++) {
    const w = walk[i]; w.d = P.L.depth(w.x, w.z); w.sd = P.L.sd(w.x, w.z); w.pal = palAt(w); minSd = Math.min(minSd, w.sd);
    if (!i) continue; const p = walk[i - 1], c0 = bandColour(p.pal, p.d), c1 = bandColour(w.pal, p.d);
    wD = Math.max(wD, Math.abs(w.d - p.d)); wS = Math.max(wS, Math.abs(w.sd - p.sd)); wC = Math.max(wC, ...c0.map((v, k) => Math.abs(v - c1[k])));
  }
  ok('W14a the walk pond core -> junction -> rim exit (every 0.025 u): no step in depth (<= 0.03 u), shore distance (<= 0.04 u) or palette (<= 3 levels at equal depth) a sample', wD <= 0.03 && wS <= 0.04 && wC <= 3, `${walk.length} samples; depth ${wD.toFixed(4)}, shore ${wS.toFixed(4)}, palette ${wC.toFixed(1)}`);
  ok('W14b one shore field over the union: sd >= 0.12 u all along the walk (no shore line across the junction)', minSd >= 0.12, `min sd ${minSd.toFixed(3)}`);
  // the junction's triangles (xz): every water mesh of MAIN (not the fall) with a vertex within 1.2 u of the cap line's middle
  const cap = W.main.pond.cap, cm = [(cap[0][0] + cap[1][0]) / 2, (cap[0][1] + cap[1][1]) / 2], T = [];
  for (const [nm, n] of Object.entries(gm.nodes)) { if (n.empty || !n.I || nm.startsWith('__') || nm === 'water_fall') continue;
    for (let t = 0; t < n.I.length; t += 3) { const tri = [0, 1, 2].map((k) => [n.P[n.I[t + k] * 3] + n.t[0], n.P[n.I[t + k] * 3 + 2] + n.t[2]]); if (tri.some((v) => Math.hypot(v[0] - cm[0], v[1] - cm[1]) < 1.2)) T.push({ nm, tri }); } }
  let over = 0; for (let a = 0; a < T.length; a++) for (let b = a + 1; b < T.length; b++) if (triOverlap2(T[a].tri, T[b].tri)) over++;
  ok('W14c one mesh draws the junction (no water_stream node) and no two water triangles overlap within 1.2 u of the cap line', !gm.nodes.water_stream && !over, `${T.length} junction triangles, ${over} overlapping pairs`);
});

// ---- W15 river-to-fall continuity. Per fall (MAIN's farm fall, shown while the wetland is undocked; the wetland outflow's fall): the top row's
// two vertices ARE the channel's last row's (<= 1e-3 u); that row lies on the brink (the piece's baked top is under the channel within 0.06 u
// upstream and nowhere from 0.02 u past it outward); no channel row past it and no fall row back over it; the curl is continuous (first
// segment within 10 deg of the channel's last, no turn above 30 deg over the first 0.5 u). Docked: the river's first row is the stream's last
// row, leaving along its end tangent (<= 2 deg). The depth-only skirt hugs the rock (it once hung up to 0.25 u out and the ink pass outlined it). ----
async function pieceTop(id) {   // max y of the piece GLB's triangles over (x, z), world (bucketed in xz)
  const { NodeIO } = await import('@gltf-transform/core'), doc = await new NodeIO().read(path.join(MODELS, `piece_${id}.glb`)), pv = BPJ().pieces[id].dockedPosition, cells = new Map(), CS = 0.5;
  const rng = (tri, k) => { const lo = tri.map((v) => v[k]); return [Math.floor(Math.min(...lo) / CS), Math.floor(Math.max(...lo) / CS)]; };
  for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) { const P = pr.getAttribute('POSITION').getArray(), I = pr.getIndices().getArray();
    for (let t = 0; t < I.length; t += 3) { const tri = [0, 1, 2].map((k) => locOf(P, pv, I[t + k])), [x0, x1] = rng(tri, 0), [z0, z1] = rng(tri, 2);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx + ',' + gz; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(tri); } } }
  return (x, z) => { let best = -Infinity; for (const [a, b, c] of cells.get(Math.floor(x / CS) + ',' + Math.floor(z / CS)) || []) {
    const det = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]); if (Math.abs(det) < 1e-12) continue;
    const l1 = ((x - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (z - a[2])) / det, l2 = ((b[0] - a[0]) * (z - a[2]) - (x - a[0]) * (b[2] - a[2])) / det;
    if (l1 >= -1e-9 && l2 >= -1e-9 && l1 + l2 <= 1 + 1e-9) best = Math.max(best, a[1] + l1 * (b[1] - a[1]) + l2 * (c[1] - a[1])); } return best; };
}
if (want('W15')) await guard('W15', async () => {
  const gm = await waterGlb('main'), gw = await waterGlb('wetland'), j = WJ(), rows = [];
  if (!gm || !gw || !j) return miss('W15 river-to-fall joins', 'GLBs / water.json missing');
  const np = A.farmWater.pond.outline.length;
  const pairs = (id, n, from = 0) => { const out = []; for (let v = from; v + 1 < n.P.length / 3; v += 2) out.push([toWorld(id, loc(n, v)), toWorld(id, loc(n, v + 1))]); return out; };   // a node's row vertex pairs, world
  const mid = (p) => p[0].map((v, k) => (v + p[1][k]) / 2), sub3 = (a, b) => a.map((v, k) => v - b[k]);
  const ang = (a, b) => { const l = Math.hypot(...a) * Math.hypot(...b) || 1; return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / l))) * 180 / Math.PI; };
  let pass = true;
  for (const [nm, id, g, chNode, from] of [['farm fall', 'main', gm, 'water_pond', np], ['wetland fall', 'wetland', gw, 'water_outflow', 0]]) {
    const f = g.nodes.water_fall, c = g.nodes[chNode]; if (!f || !c) { pass = false; rows.push(nm + ': nodes missing'); continue; }
    const CH = pairs(id, c, from), FA = pairs(id, f), last = CH[CH.length - 1], top = FA[0], vtx = Math.max(d3(last[0], top[0]), d3(last[1], top[1]));
    const C = mid(top), Cp = mid(CH[CH.length - 2]), th = [C[0] - Cp[0], C[2] - Cp[2]], tl = Math.hypot(...th), t = [th[0] / tl, th[1] / tl];
    const top2 = await pieceTop(id), land = (s) => top2(C[0] + t[0] * s, C[2] + t[1] * s) >= C[1] - 0.8, brink = land(-0.06) && !land(0.02) && !land(0.1) && !land(0.3);
    const along = (p) => (p[0] - C[0]) * t[0] + (p[2] - C[2]) * t[1];
    const chPast = CH.slice(0, -1).filter((p) => along(mid(p)) > 1e-4).length, faBack = FA.slice(1).filter((p) => along(mid(p)) <= 1e-4).length;
    const fm = FA.map(mid), seg = fm.slice(1).map((p, i) => sub3(p, fm[i])), first = ang(sub3(C, Cp), seg[0]);
    let turn = 0, s = 0; for (let i = 1; i < seg.length && s < 0.5; i++) { s += Math.hypot(...seg[i - 1]); turn = Math.max(turn, ang(seg[i - 1], seg[i])); }
    if (!(vtx <= 1e-3 && brink && !chPast && !faBack && first <= 10 && turn <= 30)) pass = false;
    rows.push(`${nm}: top vs channel's last ${vtx.toExponential(2)}; brink ${brink}; past ${chPast}, back ${faBack}; first turn ${first.toFixed(1)}, max ${turn.toFixed(1)} deg`);
  }
  ok('W15a each fall starts at its channel\'s last row (both vertices <= 1e-3 u), which lies on the brink; no overlap, no gap; the curl continuous', pass, rows.join(' || '));
  // docked: no farm fall; the stream runs straight into the wetland river (C1 on the bodies' 0.05 u centrelines)
  const mb = j.pieces.main.bodies, shown = (n) => { const b = mb.find((q) => q.node === n); return !!(b && b.fillFrom && b.fillFrom.shownWhile === 'wetland undocked'); };
  const S2 = pairs('main', gm.nodes.water_pond, np), R2 = pairs('wetland', gw.nodes.water_river), sl = S2[S2.length - 1], r0 = R2[0];
  const { WB } = await ctx(), W = GT.blueprintWater(bp()), lineOf = (id, nm) => WB.waterBodies(W, id, BPJ().pieces[id].dockedPosition).find((b) => b.name === nm).line;
  const sbL = lineOf('main', 'stream'), rbL = lineOf('wetland', 'river'), sa = sbL[sbL.length - 2], sz = sbL[sbL.length - 1], ra = rbL[0], rz = rbL[1];
  const rv = Math.max(d3(sl[0], r0[0]), d3(sl[1], r0[1])), c1 = ang([sz.x - sa.x, 0, sz.z - sa.z], [rz.x - ra.x, 0, rz.z - ra.z]);
  ok('W15b docked: the farm fall + its skirt are shown only while the wetland is undocked; the river\'s first row = the stream\'s last row (1e-3 u), leaving along its end tangent (<= 2 deg)', shown('water_fall') && shown('water_fall_skirt') && rv <= 1e-3 && c1 <= 2, `join ${rv.toExponential(2)} u; tangent ${c1.toFixed(2)} deg`);
  // the skirt hugs the rock (piece-local, the frame of the piece GLB's rock)
  const rowsC = []; let cOk = true;
  for (const [nm, id, g] of [['farm', 'main', gm], ['wetland', 'wetland', gw]]) {
    const sk = g.nodes.water_fall_skirt, f = g.nodes.water_fall; if (!sk || !f) { cOk = false; rowsC.push(nm + ': skirt missing'); continue; }
    const rock = await WB.loadRock(id), topD = Math.max(d3(loc(sk, 0), loc(f, 0)), d3(loc(sk, 1), loc(f, 1)));
    let worst = 0, inside = 0; for (let v = 2; v < sk.P.length / 3; v++) { const p = loc(sk, v); if (rock.inside(p)) inside++; else worst = Math.max(worst, rock.dist(p)); }
    if (!(topD <= 1e-4 && worst <= 0.05)) cOk = false;
    rowsC.push(`${nm}: top vs fall's ${topD.toExponential(1)}; ${inside} inside the rock, rest within ${worst.toFixed(3)} u`);
  }
  ok('W15c the depth-only skirt hugs the rock: its top row = the fall\'s top row, every other vertex inside the baked rock or within 0.05 u of it', cOk, rowsC.join(' || '));
  // the proof draws the skirt depth-only with NO polygon offset (on a steep skirt the offset stepped the depth at the brink and the ink pass drew a line across the stream)
  const AS = fs.readFileSync(LIB('arch-scene.js'), 'utf8'), i0 = AS.indexOf("if (b.kind === 'skirt')"), skSrc = i0 < 0 ? '' : AS.slice(i0, AS.indexOf('continue;', i0));
  ok('W15d the proof draws the skirt depth-only (no colour) with no polygon offset', /colorWrite: false/.test(skSrc) && !/polygonOffset/.test(skSrc), skSrc ? '' : 'no skirt branch in arch-scene.js');
});

// ---- W16 the ripple layer ----
function activeGlsl(src, defs) {   // a tiny preprocessor: #ifdef / #ifndef / #if (defined(), !, &&, ||, NAME == n, NAME > n) / #elif / #else / #endif
  const evalExpr = (e) => Function('return (' + e.replace(/defined\s*\(\s*(\w+)\s*\)/g, (_, n) => (n in defs ? 'true' : 'false')).replace(/\b([A-Z_][A-Z0-9_]*)\b/g, (n) => (n in defs ? String(+defs[n]) : '0')) + ')')();
  const out = [], stack = []; let on = true;
  for (const line of src.split('\n')) {
    const t = line.trim(); let m;
    if ((m = t.match(/^#ifdef\s+(\w+)/))) { const c = m[1] in defs; stack.push({ p: on, taken: c }); on = on && c; continue; }
    if ((m = t.match(/^#ifndef\s+(\w+)/))) { const c = !(m[1] in defs); stack.push({ p: on, taken: c }); on = on && c; continue; }
    if ((m = t.match(/^#if\s+(.*)$/))) { const c = !!evalExpr(m[1]); stack.push({ p: on, taken: c }); on = on && c; continue; }
    if ((m = t.match(/^#elif\s+(.*)$/))) { const top = stack[stack.length - 1], c = !top.taken && !!evalExpr(m[1]); if (c) top.taken = true; on = top.p && c; continue; }
    if (/^#else\b/.test(t)) { const top = stack[stack.length - 1]; on = top.p && !top.taken; top.taken = true; continue; }
    if (/^#endif\b/.test(t)) { on = stack.pop().p; continue; }
    if (on) out.push(line);
  }
  return out.join('\n');
}
if (want('W16')) await guard('W16', async () => {
  const WC = await import('../lib/water-core.mjs'), R = WC.RIPPLE, P = WC.PHASE_PERIODS, j = WJ();
  if (!R || !WC.rippleRing) return miss('W16 the ripple layer', 'water-core has no RIPPLE / rippleRing');
  // a. phases wrap on the CPU, stay bounded, and are listed in PHASE_USES (W12 checks the wraps)
  const aRows = [];
  for (const t of [0, 1.5, 12345.6789, 1e7]) { const r = WC.waterPhases(t).ripple;
    if (!(r && r.ringA >= 0 && r.ringA < 1 && r.ringB >= 0 && r.ringB < 1 && Number.isInteger(r.epochA) && Number.isInteger(r.epochB) && r.epochA >= 0 && r.epochA < R.epochs && r.epochB >= 0 && r.epochB < R.epochs
      && r.chevron >= 0 && r.chevron < P.chevron && r.clock >= 0 && r.clock < P.rippleClock)) aRows.push(`t ${t}: ${JSON.stringify(r)}`); }
  const r0 = WC.waterPhases(100).ripple, r1 = WC.waterPhases(100.25).ripple, dA = ((r1.ringA - r0.ringA) % 1 + 1) % 1;
  if (Math.abs(dA - 0.25 / R.periodA) > 1e-9) aRows.push(`ringA advances ${dA} in 0.25 s`);
  const uses = new Set((WC.PHASE_USES || []).map((u) => u.phase)), need = ['ringA', 'ringB', 'chevron', 'rippleClock'].filter((k) => !uses.has(k)); if (need.length) aRows.push('PHASE_USES lacks ' + need);
  ok('W16a ripple phases wrapped on the CPU (rings 0..1 + epochs, chevrons, the hook clock), bounded at 1e7 s, listed in PHASE_USES', !aRows.length, aRows.join('; '));
  // b. the code per tier: still bodies draw one ring layer on phone and two on mid, streams chevrons (both tiers) and streaks (mid), pond + stream both; none without WATER_RIPPLE
  const bRows = [];
  for (const [nm, defs, rings, chev, streak] of [['still phone', { WATER_STILL: 1, WATER_RIPPLE: 1 }, 1, 0, 0], ['still mid', { WATER_STILL: 1, WATER_MID: 1, WATER_FLOW: 1, WATER_RIPPLE: 1 }, 2, 0, 0],
    ['ribbon phone', { WATER_RIBBON: 1, WATER_RIPPLE: 1 }, 0, 1, 0], ['ribbon mid', { WATER_RIBBON: 1, WATER_MID: 1, WATER_RIPPLE: 1 }, 0, 1, 1],
    ['pond+stream phone', { WATER_STILL: 1, WATER_JOIN: 1, WATER_RIPPLE: 1 }, 1, 1, 0], ['pond+stream mid', { WATER_STILL: 1, WATER_MID: 1, WATER_FLOW: 1, WATER_JOIN: 1, WATER_RIPPLE: 1 }, 2, 1, 1],
    ['still mid, no ripples', { WATER_STILL: 1, WATER_MID: 1, WATER_FLOW: 1 }, 0, 0, 0]]) {
    const c = activeGlsl(WC.WATER_COLOR, defs), got = [countRe(c, /wRingLayer\(/g), countRe(c, /wChevron\(/g), countRe(c, /wStreak\(/g)];
    if (got.join() !== [rings, chev, streak].join()) bRows.push(`${nm}: rings/chevrons/streaks ${got} want ${[rings, chev, streak]}`);
  }
  ok('W16b the ripple code per tier: still bodies one ring layer on phone, two on mid; streams chevrons (+ streaks on mid); the joined pond + stream both; none without WATER_RIPPLE', !bRows.length, bRows.join('; '));
  // c. uniforms declared and listed, the hook read by the code, and water.json carries each body's ripples
  const pars = activeGlsl(WC.WATER_FRAG_PARS, { WATER_STILL: 1, WATER_MID: 1, WATER_RIPPLE: 1 }), col = activeGlsl(WC.WATER_COLOR, { WATER_STILL: 1, WATER_MID: 1, WATER_RIPPLE: 1 });
  const decl = ['uniform vec4 uRipplePhase;', 'uniform float uRippleFlow;', 'uniform float uRippleClock;', 'uniform float uRippleDensity;', 'uniform float uRippleShore;', 'uniform vec4 uRipple[ 4 ];'].filter((d) => !pars.includes(d));
  const listed = ['uRipplePhase', 'uRippleFlow', 'uRippleClock', 'uRippleDensity', 'uRippleShore', 'uRipple'].filter((u) => !WC.WATER_UNIFORMS.includes(u)), hookRead = /uRipple\[\s*i\s*\]/.test(col);
  const rp = (id, node) => ((j && j.pieces[id].bodies.find((b) => b.node === node)) || {}).ripples;
  const pond = rp('main', 'water_pond'), lake = rp('wetland', 'water_lake'), tarn = rp('highland', 'water_tarn'), spring = rp('highland', 'water_spring'), river = rp('wetland', 'water_river'), outf = rp('wetland', 'water_outflow');
  const jOk = pond && lake && tarn && !spring && river && outf && lake.density > pond.density && lake.shore > 0 && tarn.density < pond.density && pond.chevrons && river.chevrons && outf.chevrons && !rp('main', 'water_fall') && !rp('wetland', 'water_fall');
  ok('W16c ripple uniforms declared and listed, the uRipple[4] hook read by the code; water.json: pond moderate, lake more + shore, tarn sparse, spring none, streams chevrons, falls none', !decl.length && !listed.length && hookRead && jOk,
    `undeclared ${decl}; unlisted ${listed}; hook read ${hookRead}; pond ${JSON.stringify(pond)}, lake ${JSON.stringify(lake)}, tarn ${JSON.stringify(tarn)}`);
  // d. ring positions stable for a given time (the JS mirror of the GLSL: a hash of the cell and the epoch): a ring keeps its centre and grows through its cycle, moves on the next, the share of cells holding one = the density
  let same = 0, held = 0, heldN = 0, moved = 0, on = 0; const n = 3000, rng = GT.mulberry32(7);
  for (let k = 0; k < n; k++) {
    const layer = k % 2, cx = Math.floor(rng() * 60) - 30, cz = Math.floor(rng() * 60) - 30, t = rng() * 5000, a = WC.rippleRing(layer, cx, cz, t, 0.5), b = WC.rippleRing(layer, cx, cz, t, 0.5);
    if (JSON.stringify(a) === JSON.stringify(b)) same++; if (a.on) on++;
    const per = layer ? R.periodB : R.periodA, c = WC.rippleRing(layer, cx, cz, t + per * 0.2, 0.5);
    if (c.epoch === a.epoch) { heldN++; if (c.cx === a.cx && c.cz === a.cz && c.r >= a.r) held++; }
    const d2 = WC.rippleRing(layer, cx, cz, t + per, 0.5); if (d2.cx !== a.cx || d2.cz !== a.cz) moved++;
  }
  ok('W16d ring positions stable for a given time: repeatable; a ring keeps its centre and grows through its cycle; it moves next cycle (>= 80 %); the share of cells holding one = the density (+/- 0.05)', same === n && held === heldN && heldN > 500 && moved / n >= 0.8 && Math.abs(on / n - 0.5) <= 0.05, `${same}/${n} repeatable; held ${held}/${heldN}; moved ${moved}; active ${(on / n).toFixed(3)}`);
  // e. the look: thin cream rings feeding the foam colour (strength <= 0.4), >= 1.25 px at the desktop default (47 px/u), faded out at the phone framing (16 px/u);
  // a pixel in u is the footprint's geometric mean, the ground foreshortened by the gameplay camera's 28.88 deg
  const cAt = (pxPerU) => Math.sqrt((1 / pxPerU) * (1 / pxPerU) / Math.sin((28.88 * Math.PI) / 180)), desk = R.width / cAt(47), fadeAt = (pxPerU) => 1 - sstep(R.width / 2.5, R.width / 1.25, cAt(pxPerU));
  ok('W16e the look: thin cream rings feeding the foam colour (strength <= 0.4), >= 1.25 px at the desktop default, faded out at the phone framing (fwidth)', desk >= 1.25 && fadeAt(47) > 0.8 && fadeAt(16) < 0.05 && R.strength <= 0.4 && /foam = max\( foam, rip/.test(WC.WATER_COLOR)
    && /wFade\(/.test(WC.WATER_FRAG_PARS.slice(WC.WATER_FRAG_PARS.indexOf('wRing'))), `${desk.toFixed(2)} px at 47 px/u (fade ${fadeAt(47).toFixed(2)}), fade ${fadeAt(16).toFixed(2)} at 16 px/u; strength ${R.strength}`);
  // f. the hash cells survive the CPU wraps (chevron cells counted mod period / cell, life + presence on the ring-A phase + epoch) and the stream lines are thin (pixel floor, capped)
  const fp = WC.WATER_FRAG_PARS, cells = P.chevron / R.chevron, i0 = fp.indexOf('float wChevron('), chev = i0 < 0 ? '' : fp.slice(i0, fp.indexOf('float wStreak(')), strk = fp.slice(fp.indexOf('float wStreak('));
  const wrapped = /ci = mod\( floor\( qu \), W_CHEV_CELLS \)/.test(chev) && countRe(chev, /floor\( qu \)/g) === 1;
  const lifeOk = /mod\( uRipplePhase\.z \+ floor\( ph \), W_RING_EPOCHS \)/.test(chev) && /uRipplePhase\.x \+ wHash12\(/.test(chev);
  const thin = /clamp\( 2\.0 \* px, W_CHEV_MIN, W_CHEV_W \)/.test(chev) && /clamp\( 1\.5 \* pv, W_STREAK_MIN, W_STREAK \)/.test(strk) && R.chevronMin <= 0.025 && R.chevronWidth <= 0.06 && R.streakWidth <= 0.03 && R.streakMin <= 0.012;
  ok('W16f the hash cells survive the phase wraps: chevron cells counted mod (period / cell, whole), life + presence on the ring-A phase and epoch; the stream lines thin (a pixel floor, capped)',
    R.chevronCells != null && Math.abs(cells - R.chevronCells) < 1e-9 && Number.isInteger(R.chevronCells) && fp.includes(`#define W_CHEV_CELLS ${R.chevronCells}.0`) && wrapped && lifeOk && thin, `${+cells.toFixed(6)} cells; wrapped ${wrapped}; life ${lifeOk}; thin ${thin}`);
  // g. regression: THREE.Vector4's w defaults to 1 and uRipple[i].w is the ring strength, so a bare `new THREE.Vector4()` would draw four phantom rings at the origin:
  // every ripple uniform vector (each uRipple entry + uRipplePhase) is built with all four components explicit 0
  const AS = fs.readFileSync(LIB('arch-scene.js'), 'utf8'), gDecl = (AS.match(/uRipplePhase:[\s\S]*?uRipple: \{ value: \[[^\]]*\] \}/) || [''])[0];
  const gHookN = +((WC.WATER_FRAG_PARS.match(/uniform vec4 uRipple\[\s*(\d+)\s*\];/) || [])[1] || 0), gHook = ((gDecl.match(/uRipple: \{ value: \[([^\]]*)\]/) || [])[1] || '').match(/new THREE\.Vector4\([^)]*\)/g) || [];
  const gArgs = (c) => c.replace(/^new THREE\.Vector4\(/, '').replace(/\)$/, '').split(',').map((s) => s.trim()), gBad = (gDecl.match(/new THREE\.Vector4\([^)]*\)/g) || []).filter((c) => { const a = gArgs(c); return a.length !== 4 || a.some((v) => v !== '0'); });
  const gPhase = /uRipplePhase: \{ value: new THREE\.Vector4\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\) \}/.test(gDecl);
  ok('W16g the unused hook rings start at zero strength: each uRipple entry + uRipplePhase built with explicit (0, 0, 0, 0) (Vector4 w defaults to 1), the hook .w = 0', !!gDecl && gHookN > 0 && gHook.length === gHookN && !gBad.length && gHook.every((c) => gArgs(c)[3] === '0') && gPhase,
    gDecl ? `${gHook.length}/${gHookN} hook entries; non-zero ${gBad}; uRipplePhase zeros ${gPhase}` : 'the uRipple uniform declaration was not found in arch-scene.js');
});

// ---- W17 texture reads per water pixel: for every body water.json draws (patch options as the game derives them: flow on still bodies only,
// ripples never on a fall, join / brink / virtual head flags as baked) phone <= 3 reads, mid <= 9. Counted statically on the active GLSL:
// each texture() in WATER_COLOR + WATER_LIGHT plus each call of a WATER_FRAG_PARS function by the reads in its body; a read in a loop fails ----
if (want('W17')) await guard('W17', async () => {
  const WC = await import(process.env.WATER_CORE_MODULE || '../lib/water-core.mjs'), j = WJ(), BUDGET = { phone: 3, mid: 9 };
  if (!j) return miss('W17 texture reads per water pixel', 'no water.json');
  const readsFor = (defs) => {
    const pars = activeGlsl(WC.WATER_FRAG_PARS, defs), main = activeGlsl(WC.WATER_COLOR, defs) + '\n' + activeGlsl(WC.WATER_LIGHT, defs);
    const fns = {}, sig = /\b(?:float|vec[234]|void)\s+(w\w+)\s*\(([^)]*)\)\s*\{/g; let m;   // the pars' functions: name -> { } body
    while ((m = sig.exec(pars))) { let d = 0, k = m.index + m[0].length - 1; const s0 = k; for (; k < pars.length; k++) { if (pars[k] === '{') d++; else if (pars[k] === '}' && --d === 0) break; } fns[m[1]] = pars.slice(s0, k + 1); }
    const memo = {}, fnReads = (n, seen = new Set()) => { if (n in memo) return memo[n]; if (seen.has(n)) return 0; seen.add(n); const b = fns[n];
      let r = countRe(b, /\btexture\s*\(/g); for (const o of Object.keys(fns)) if (o !== n) r += countRe(b, new RegExp('\\b' + o + '\\s*\\(', 'g')) * fnReads(o, seen); return (memo[n] = r); };
    let reads = countRe(main, /\btexture\s*\(/g); const calls = {};
    for (const n of Object.keys(fns)) { const c = countRe(main, new RegExp('\\b' + n + '\\s*\\(', 'g')); if (c && fnReads(n)) { reads += c * fnReads(n); calls[n] = c; } }
    return { reads, loopTex: main.split('\n').some((l) => /\bfor\s*\(/.test(l) && (/\btexture\s*\(/.test(l) || Object.keys(calls).some((n) => l.includes(n + '(')))) };
  };
  const over = []; let n = 0;
  for (const [piece, P] of Object.entries(j.pieces)) for (const b of P.bodies || []) {
    if (!['still', 'ribbon', 'fall'].includes(b.kind)) continue;   // the skirt is depth-only; mist and steam are billboards
    for (const tier of ['phone', 'mid']) {
      const defs = { ['WATER_' + b.kind.toUpperCase()]: 1 };
      if (tier === 'mid') defs.WATER_MID = 1;
      if (b.flow && b.kind === 'still') defs.WATER_FLOW = 1;
      if (b.join) defs.WATER_JOIN = 1;
      if (b.brink) defs.WATER_BRINK = 1;
      if (b.vhead) defs.WATER_VHEAD = 1;
      if (b.ripples && b.kind !== 'fall') defs.WATER_RIPPLE = 1;
      const r = readsFor(defs); n++;
      if (r.loopTex || r.reads > BUDGET[tier]) over.push(`${piece}/${b.node} ${tier} ${r.reads}${r.loopTex ? ' (a read in a loop)' : ''}`);
    }
  }
  ok(`W17 texture reads per water pixel within the budget: phone <= ${BUDGET.phone}, mid <= ${BUDGET.mid}, every body water.json draws (the falls with their brink, the pond with its join)`, !over.length && n >= 16, `${n} body/tier variants${over.length ? '; OVER: ' + over.join('; ') : ''}`);
});

console.log('\n  WATER BAKE'); console.log('  ' + '-'.repeat(100));
for (const r of results) console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name.slice(0, 96) + (r.detail ? '\n        ' + r.detail : ''));
const fails = results.filter((r) => !r.pass).length;
console.log('  ' + '-'.repeat(100)); console.log(`  ${results.length - fails}/${results.length} passed, ${fails} failed\n`);
process.exit(results.length && !fails ? 0 : 1);
