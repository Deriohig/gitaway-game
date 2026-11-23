// finish.mjs -- Meshy GLB -> Gitaway asset: one textured mesh, baked + scaled + based on y 0, a graded / downsampled albedo,
// and the optional extras the engine looks for (ASSETS.md special names): a `Glow` window split, a `Canopy` foliage split,
// windmill `Blades`, the farmhouse `Smoke` / `PorchLight` empties.
//
// node meshy/finish.mjs <in.glb> <out.glb> [options]
//   --id name             node / mesh / body-material name (default: the output file name)
//   size (one of):  --height H (uniform, total height H; default 2.7)   --fit WxHxD (uniform, the largest that fits the box)
//                   --stretch WxHxD (non-uniform, exactly the box)
//   --centre x,z          where the horizontal centre lands (default 0,0 = origin at the base centre)
//   --axis y0,y1          take the horizontal centre from the bbox of the vertices in this height band (fractions of the height)
//                         instead of the whole bbox (a tower whose door step / hub skews the bbox)
//   --hang                origin at the TOP centre (max y = 0) instead of the base (the island underside hangs from it)
//   --rotY deg            turn about +Y before scaling (front = +Z). --windmill without --rotY turns the hub to +Z itself
//   --tex N  --q Q        albedo box-downsampled to <= N px (default 1024), JPEG quality (default 82)
//   --pad                 coverage-weighted downsample + edge padding: each texel counts only where a face's UV triangle covers it,
//                         so the black between Meshy's UV islands never darkens an island's edge texels; the texels outside every
//                         island then take their neighbours' colour (nothing black for the mipmaps to pull in). The garden crops
//                         (4k source -> 512 px); without it the box filter is unchanged
//   --maxKB K             the JPEG quality steps down by 5 from --q until the file is <= K KB, never below 70 (ART-BIBLE §D.3: q70
//                         when visually identical); a file still over K at q70 exits non-zero. Geometry and paint are untouched
//   --fold s              (before --rotY) bend a flat sheet, thin along Z, into a shallow V about its vertical centre line: z - s |x - centre|,
//                         normals tilted to match, no triangles added (Meshy made the wheat and the carrot fronds paper-flat)
//   --lift L --terra T    readability grade: value^L on every texel, x T on terracotta / brick (default 0.9 / 1.1)
//   --fillBlack           inpaint the near-black (unpainted) texels from their neighbours
//   --sat h0,h1,k         saturation x k on the texels whose hue is in h0..h1 (after the grade)
//   --hue h0,h1,t,k       those texels turn k of the way to hue t (after --sat; outcrop_b's yellow moss -> lawn green)
//   --glow                Glow split: golden, bright texels (--glassHue 36,56 --glassSat 0.45 --glassVal 0.78) -> an emissive
//                         mask; every face touching a pane gets the `Glow` material (same albedo + emissiveMap = the mask)
//                         --glowY y0,y1: only faces in that height band (fractions of the height) may glow
//                         --glowBox x0,x1,y0,y1,z0,z1: only faces whose centroid is in that box (final units) may glow
//   --dump file.jpg       the albedo with the glow-mask / canopy texels pushed to magenta (for checking)
//   --smoke               `Smoke` empty on the farmhouse chimney (highest vertices in the back-right quadrant)
//   --porch               `PorchLight` empty in front of the door, under the awning (--porchY y --porchOut d)
//   --porchLamp           (with --porch) a small hanging lantern at the PorchLight empty (`PorchLamp` node, ~0.19 u tall): its glass
//                         centred on the empty in its OWN untextured `Glow` material (the game swaps an untextured Glow for its
//                         emissive glowMat and keeps the textured wall Glow), a dark iron frame (`PorchLamp` material, flat colour)
//                         and a rod up to the first surface above it (the awning)
//   --compact             visually lossless size cuts, core glTF (no extensions): 16-bit indices and TEXCOORD_0 as normalised
//                         16-bit (1/65535 steps: far below a texel at <= 1024 px)
//   --canopy              green foliage faces (--leafHue 55,170 --leafSat 0.2 --leafMinY 0.36) -> a separate mesh under a
//                         `Canopy` node whose pivot sits on the trunk axis near the trunk top (the game sways it)
//   --crown               (needs --canopy) the conifer structure: the pivot moves up to a mesh-less `Crown` node and `Canopy` (the
//                         foliage mesh) sits at its local origin under it: <id> (trunk mesh) > `Crown` > `Canopy`. The game's conifer
//                         check looks for `Crown`; the vertices' world positions are the same as without it
//   --windmill            find the hub (the part of the cap that sticks out furthest), turn it to +Z, add a `Blades` node at
//                         the hub (pivot = the hub, spins on local Z) with 4 procedural timber + canvas sails (--bladeR 1.7)
//   --lower d             after basing on y 0, move the model down by d (the duck: y 0 is the waterline, its hull sits below)
//   --part Name:x0,x1,y0,y1,z0,z1:px,py,pz   (repeatable; final units, after scale / --centre / --lower) splits a part off into
//                         its own mesh under a child node `Name` pivoted at (px,py,pz, the first given): the animals' `Head` and
//                         the dog's `Tail`. The box (or the union of the boxes given for that Name) is the REGION the part comes from:
//   --cut Name:nx,ny,nz[:qx,qy,qz]   (required for a part; repeatable: the + side of EVERY plane) the part is what lies on the +n
//                         side of the plane through q (default: the pivot) inside its region; the triangles the plane crosses
//                         are SPLIT along it, so the cut is clean and flat. Then pieces stranded by the cut move to their side (a body piece cut off from the body that touches the
//                         part joins the part: the goat's horn; a small part piece that only touches the body rejoins it), and each
//                         cut loop is capped on both sides by an ear-clipped polygon in the loop's typical texel colour (inside its
//                         outline: no shards). Put the pivot on the cut, at the back of the neck: a forward tilt then dips the head
//                         into the chest instead of opening the nape
//   --empty Name:x,y,z    (repeatable) an empty node, e.g. the lighthouse `Beam`; `Name:glow` puts it at the centre of the Glow faces
//   --roof tiles.jpg      the roof slopes get their own `Roof` primitive + a TILING texture instead of their slice of the atlas (the
//                         farmhouse: Meshy gave its roof ~4 % of the atlas, the tiles smeared at any texture size). Slopes = terracotta
//                         faces (>= 3 of 4 samples) above --roofMinY x height (0.3), tilted 15-75 deg, grown over welded edges whose
//                         normals differ < --roofAngle (20 deg), regions >= --roofArea u^2 (1); smaller pieces on a slope's plane (the
//                         verges) and the step faces between them and the slope join it, and every roof vertex takes its slope's one
//                         flat normal (uniform shading). Each region is UV-projected on its own
//                         plane: u along the eave (growing to the viewer's right), v up the slope with v = 0 on the eave (the texture's
//                         rows run level and a row's lower edge sits on the eave); one texture repeat = --roofTile w,h units (0.8,0.8).
//                         The texture is matched to the old roof texels' mean colour (per-channel gain: its own contrast kept), saved
//                         at --roofQ (85), box-downsampled to --roofPx if given; the atlas texels only the slopes used are filled flat
//                         (dead bytes). A relative path is looked up in art/meshy/<id>/ too (finish_args.txt)
// Prints one `RESULT {json}` line (tris, size, textures, nodes) for the README table.
import { NodeIO } from '@gltf-transform/core';
import jpeg from 'jpeg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const a = process.argv.slice(2), IN = a[0], OUT = a[1];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const has = (k) => a.includes('--' + k);
const ID = opt('id', path.basename(OUT, '.glb'));
const box3 = (s) => s.split('x').map(Number);
const SIZE = has('fit') ? { mode: 'fit', box: box3(opt('fit')) } : has('stretch') ? { mode: 'stretch', box: box3(opt('stretch')) } : { mode: 'height', h: +opt('height', 2.7) };
const [CX, CZ] = opt('centre', '0,0').split(',').map(Number), AXIS = has('axis') ? opt('axis').split(',').map(Number) : null, HANG = has('hang');
const TEX = +opt('tex', 1024), Q = +opt('q', 82), USER_ROT = has('rotY'), WINDMILL = has('windmill'), CANOPY = has('canopy'), CROWN = has('crown'), GLOW = has('glow');
const GLOW_TEX = 1024;   // the glow mask resolution the Glow faces are picked at (see step 3)
const LOWER = +opt('lower', 0);
const all = (k) => a.flatMap((v, i) => (v === '--' + k ? [a[i + 1]] : []));
const PARTS = [];   // a repeated name adds a box to that part (the union); its pivot is the first one given
for (const s of all('part')) { const [name, box, piv] = s.split(':'); const b = box.split(',').map(Number), p = piv.split(',').map(Number);
  if (b.length !== 6 || p.length !== 3 || [...b, ...p].some((v) => !Number.isFinite(v))) throw new Error('--part Name:x0,x1,y0,y1,z0,z1:px,py,pz, got ' + s);
  const had = PARTS.find((q) => q.name === name); if (had) had.boxes.push(b); else PARTS.push({ name, boxes: [b], pivot: p, cuts: [] }); }
for (const s of all('cut')) { const [name, nv, qv] = s.split(':'), pt = PARTS.find((q) => q.name === name); if (!pt) throw new Error('--cut for an unknown --part ' + name);
  const n = nv.split(',').map(Number), l = Math.hypot(...n), q = qv ? qv.split(',').map(Number) : pt.pivot;
  if (n.length !== 3 || !(l > 0) || q.length !== 3 || q.some((v) => !Number.isFinite(v))) throw new Error('--cut Name:nx,ny,nz[:qx,qy,qz], got ' + s);
  pt.cuts.push({ n: n.map((v) => v / l), q }); }   // repeatable: the part is the + side of every plane (the cat: under its chin AND behind its head)
// a part needs a cut plane: a centroid cut zigzags, and a cap over a zigzag lays triangles on the surface's own (shards, z-fighting)
for (const pt of PARTS) if (!pt.cuts.length) throw new Error(`--part ${pt.name} needs a --cut ${pt.name}:nx,ny,nz plane`);
const EMPTIES = all('empty').map((s) => { const [name, at] = s.split(':'); return { name, at: at === 'glow' ? 'glow' : at.split(',').map(Number) }; });
if (PARTS.length && (CANOPY || GLOW)) throw new Error('--part does not combine with --canopy / --glow');
const ROOF = has('roof');
if (ROOF && (PARTS.length || CANOPY)) throw new Error('--roof does not combine with --part / --canopy');
if (CROWN && !CANOPY) throw new Error('--crown needs --canopy (the Crown node carries the Canopy split)');

const io = new NodeIO();
const doc = await io.read(IN);
const root = doc.getRoot();
const meshes = root.listMeshes(); if (meshes.length !== 1 || meshes[0].listPrimitives().length !== 1) throw new Error('expected one mesh / one primitive');
const mesh = meshes[0], prim = mesh.listPrimitives()[0];
const node = root.listNodes().find((n) => n.getMesh() === mesh);
const srcMat = prim.getMaterial(), tex = srcMat.getBaseColorTexture();
const img = jpeg.decode(Buffer.from(tex.getImage()), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
const W = img.width, H = img.height, px = img.data;
{ // near-black texels: Meshy leaves some UV islands unpainted (black). --fillBlack inpaints them from their painted neighbours
  // (iterative dilation), so thin parts that sample them (the underside's vines) stop rendering as black slivers
  const isBlack = (o) => Math.max(px[o], px[o + 1], px[o + 2]) < 16; let nb = 0; for (let o = 0; o < px.length; o += 4) if (isBlack(o)) nb++;
  console.log('near-black texels', nb, '(' + (100 * nb / (W * H)).toFixed(2) + '%)' + (has('fillBlack') ? ' -> inpainted' : ''));
  if (has('fillBlack') && nb) {
    let todo = []; const dark = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) if (isBlack(i * 4)) { dark[i] = 1; todo.push(i); }
    for (let pass = 0; pass < 256 && todo.length; pass++) {
      const next = [], fill = [];
      for (const i of todo) { const x = i % W, y = (i / W) | 0; let r = 0, g = 0, b = 0, n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (dark[j]) continue; r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++; }
        if (n) fill.push([i, r / n, g / n, b / n]); else next.push(i); }
      for (const [i, r, g, b] of fill) { px[i * 4] = Math.round(r); px[i * 4 + 1] = Math.round(g); px[i * 4 + 2] = Math.round(b); dark[i] = 0; }
      todo = next; }
  }
}
const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0'), idxA = prim.getIndices();
const N = pos.getCount(), e = [0, 0, 0];

// ---- 1. bake the node's world matrix (float64, so the farmhouse stays bit-identical), find the windmill hub, rotate ----
const M = node.getWorldMatrix(), P0 = new Float64Array(N * 3), N0 = new Float64Array(N * 3);
for (let i = 0; i < N; i++) {
  pos.getElement(i, e); P0[i * 3] = M[0] * e[0] + M[4] * e[1] + M[8] * e[2] + M[12]; P0[i * 3 + 1] = M[1] * e[0] + M[5] * e[1] + M[9] * e[2] + M[13]; P0[i * 3 + 2] = M[2] * e[0] + M[6] * e[1] + M[10] * e[2] + M[14];
  nor.getElement(i, e); N0[i * 3] = M[0] * e[0] + M[4] * e[1] + M[8] * e[2]; N0[i * 3 + 1] = M[1] * e[0] + M[5] * e[1] + M[9] * e[2]; N0[i * 3 + 2] = M[2] * e[0] + M[6] * e[1] + M[10] * e[2];
}
const bboxOf = (A, filt) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < N; i++) { if (filt && !filt(i)) continue; for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], A[i * 3 + k]); mx[k] = Math.max(mx[k], A[i * 3 + k]); } } return { mn, mx }; };
// the windmill hub = the vertex of the upper part that sticks out furthest from the tower axis (axis = the tower body's bbox centre)
function hubAzimuth(A) {
  const b = bboxOf(A), h = b.mx[1] - b.mn[1], band = (lo, hi) => (i) => A[i * 3 + 1] >= b.mn[1] + lo * h && A[i * 3 + 1] <= b.mn[1] + hi * h;
  const t = bboxOf(A, band(0.3, 0.6)), ax = (t.mn[0] + t.mx[0]) / 2, az = (t.mn[2] + t.mx[2]) / 2, top = band(0.55, 0.95);
  let best = -1, bi = -1; for (let i = 0; i < N; i++) if (top(i)) { const r = Math.hypot(A[i * 3] - ax, A[i * 3 + 2] - az); if (r > best) { best = r; bi = i; } }
  return Math.atan2(A[bi * 3] - ax, A[bi * 3 + 2] - az);   // azimuth from +Z toward +X
}
if (has('fold')) {   // --fold s: bend a flat sheet (thin along Z) into a shallow V about its vertical centre line, before the turn
  const S = +opt('fold'), b = bboxOf(P0), xc = (b.mn[0] + b.mx[0]) / 2;
  for (let i = 0; i < N; i++) { const sg = Math.sign(P0[i * 3] - xc); P0[i * 3 + 2] -= S * Math.abs(P0[i * 3] - xc);
    const nx = N0[i * 3] + S * sg * N0[i * 3 + 2], ny = N0[i * 3 + 1], nz = N0[i * 3 + 2], l = Math.hypot(nx, ny, nz) || 1; N0[i * 3] = nx / l; N0[i * 3 + 1] = ny / l; N0[i * 3 + 2] = nz / l; }
  console.log('fold', S, 'about x', xc.toFixed(3));
}
const ROTY = USER_ROT ? +opt('rotY') * Math.PI / 180 : WINDMILL ? -hubAzimuth(P0) : 0;
if (WINDMILL && !USER_ROT) console.log('hub azimuth', (-ROTY * 180 / Math.PI).toFixed(1), 'deg -> turned to +Z');
const P = new Float32Array(N * 3), Nr = new Float32Array(N * 3), cr = Math.cos(ROTY), sr = Math.sin(ROTY);
for (let i = 0; i < N; i++) {
  let x = P0[i * 3], y = P0[i * 3 + 1], z = P0[i * 3 + 2];
  P[i * 3] = cr * x + sr * z; P[i * 3 + 1] = y; P[i * 3 + 2] = -sr * x + cr * z;
  x = N0[i * 3]; y = N0[i * 3 + 1]; z = N0[i * 3 + 2];
  const nx = cr * x + sr * z, nz = -sr * x + cr * z, l = Math.hypot(nx, y, nz) || 1; Nr[i * 3] = nx / l; Nr[i * 3 + 1] = y / l; Nr[i * 3 + 2] = nz / l;
}

// ---- 2. scale (height / fit / stretch), base on y = 0 (or the top on 0 with --hang), horizontal centre at (CX, CZ) ----
const { mn, mx } = bboxOf(P), ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
let sx, sy, sz;
if (SIZE.mode === 'height') sx = sy = sz = SIZE.h / ext[1];
else if (SIZE.mode === 'fit') sx = sy = sz = Math.min(SIZE.box[0] / ext[0], SIZE.box[1] / ext[1], SIZE.box[2] / ext[2]);
else [sx, sy, sz] = [SIZE.box[0] / ext[0], SIZE.box[1] / ext[1], SIZE.box[2] / ext[2]];
let mxc = (mn[0] + mx[0]) / 2, mzc = (mn[2] + mx[2]) / 2;
if (AXIS) { const t = bboxOf(P, (i) => P[i * 3 + 1] >= mn[1] + AXIS[0] * ext[1] && P[i * 3 + 1] <= mn[1] + AXIS[1] * ext[1]); mxc = (t.mn[0] + t.mx[0]) / 2; mzc = (t.mn[2] + t.mx[2]) / 2; }
const y0 = HANG ? mx[1] : mn[1];
for (let i = 0; i < N; i++) { P[i * 3] = (P[i * 3] - mxc) * sx + CX; P[i * 3 + 1] = (P[i * 3 + 1] - y0) * sy - LOWER; P[i * 3 + 2] = (P[i * 3 + 2] - mzc) * sz + CZ; }
if (sx !== sy || sy !== sz) for (let i = 0; i < N; i++) {   // normals of a non-uniform scale: the inverse transpose
  const nx = Nr[i * 3] / sx, ny = Nr[i * 3 + 1] / sy, nz = Nr[i * 3 + 2] / sz, l = Math.hypot(nx, ny, nz) || 1; Nr[i * 3] = nx / l; Nr[i * 3 + 1] = ny / l; Nr[i * 3 + 2] = nz / l; }
{ // zero normals (Meshy leaves a few: the raw underside has 20) normalise to NaN in the shader = black slivers: rebuild each from
  // the area-weighted normals of the faces that use it (a model without any stays bit-identical)
  const zero = new Set(); for (let i = 0; i < N; i++) if (!(Math.hypot(Nr[i * 3], Nr[i * 3 + 1], Nr[i * 3 + 2]) > 1e-6)) zero.add(i);
  if (zero.size) { const acc = new Map([...zero].map((i) => [i, [0, 0, 0]])), I0 = idxA.getArray();
    for (let t = 0; t < I0.length; t += 3) { const v = [I0[t], I0[t + 1], I0[t + 2]]; if (!v.some((i) => zero.has(i))) continue;
      const [a, b, c] = v.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]), u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      for (const i of v) if (zero.has(i)) { const s = acc.get(i); s[0] += fn[0]; s[1] += fn[1]; s[2] += fn[2]; } }
    let fixed = 0; for (const [i, s] of acc) { const l = Math.hypot(...s); if (l > 0) { Nr[i * 3] = s[0] / l; Nr[i * 3 + 1] = s[1] / l; Nr[i * 3 + 2] = s[2] / l; fixed++; } else { Nr[i * 3 + 1] = 1; fixed++; } }
    console.log('zero normals rebuilt from their faces:', fixed); }
}
pos.setArray(P); nor.setArray(Nr);
node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); node.setName(ID); mesh.setName(ID);
for (let p = node.getParentNode(); p; p = p.getParentNode()) p.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const SZ = [ext[0] * sx, ext[1] * sy, ext[2] * sz], HT = SZ[1];
console.log('scale', sx === sz && sy === sz ? sx.toFixed(3) : [sx, sy, sz].map((v) => v.toFixed(3)).join(','), 'size', SZ[0].toFixed(2), 'x', SZ[1].toFixed(2), 'x', SZ[2].toFixed(2));

// ---- 3. texel classes: window glass (GLOW MASK: golden, bright texels; the panes are painted onto the wall faces, so Glow is the
//      same textured surface + emissiveMap = this mask, on every face that touches a pane) and foliage (canopy split) ----
const hsv = ([r, g, b]) => { const mxv = Math.max(r, g, b), mnv = Math.min(r, g, b), d = mxv - mnv; let h = 0;
  if (d) { if (mxv === r) h = ((g - b) / d) % 6; else if (mxv === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mxv ? d / mxv : 0, mxv / 255]; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const [H0, H1] = opt('glassHue', '36,56').split(',').map(Number), GS = +opt('glassSat', 0.45), GV = +opt('glassVal', 0.78);
const glassW = (r, g, b) => { const [h, s, v] = hsv([r, g, b]); return sstep(H0 - 2, H0 + 2, h) * (1 - sstep(H1 - 2, H1 + 2, h)) * sstep(GS, GS + 0.1, s) * sstep(GV, GV + 0.1, v); };   // log ends: hue ~31, value ~0.7 -> 0
const down = (src, max = TEX) => { let cur = src; while (cur.w > max) { const w = cur.w >> 1, h = cur.h >> 1, d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) { const o = (y * 2 * cur.w + x * 2) * 4 + c; d[(y * w + x) * 4 + c] = (cur.d[o] + cur.d[o + 4] + cur.d[o + cur.w * 4] + cur.d[o + cur.w * 4 + 4] + 2) >> 2; }
  cur = { w, h, d }; } return cur; };
const I = idxA.getArray(), T = I.length / 3, U = uv.getArray();
const glowIdx = [], bodyIdx = [];
let mask = null, MK = null;
if (GLOW) {
  mask = new Uint8Array(W * H * 4); let maskN = 0;
  for (let i = 0, o = 0; i < W * H; i++, o += 4) { const m = Math.round(255 * glassW(px[o], px[o + 1], px[o + 2])); mask[o] = mask[o + 1] = mask[o + 2] = m; mask[o + 3] = 255; if (m > 127) maskN++; }
  // the faces are classified on the mask at GLOW_TEX (1024, what every V21 recipe used), whatever --tex is: a smaller albedo keeps
  // the same Glow faces and the same PorchLight (it is placed from them); only the saved emissive map follows --tex
  MK = down({ w: W, h: H, d: mask }, GLOW_TEX);
  const touchesPane = (i0, i1, i2) => {   // rasterise the face in mask space: any texel > 0.1
    const us = [U[i0 * 2], U[i1 * 2], U[i2 * 2]].map((u) => u * MK.w), vs = [U[i0 * 2 + 1], U[i1 * 2 + 1], U[i2 * 2 + 1]].map((v) => v * MK.h);
    const x0 = Math.max(0, Math.floor(Math.min(...us))), x1 = Math.min(MK.w - 1, Math.ceil(Math.max(...us))), yy0 = Math.max(0, Math.floor(Math.min(...vs))), yy1 = Math.min(MK.h - 1, Math.ceil(Math.max(...vs)));
    const tiny = (x1 - x0) * (yy1 - yy0) <= 4, A = (us[1] - us[0]) * (vs[2] - vs[0]) - (us[2] - us[0]) * (vs[1] - vs[0]), sg = A < 0 ? -1 : 1, tol = 0.75;
    const edge = (ax, ay, bx, by, x, y) => sg * ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / (Math.hypot(bx - ax, by - ay) || 1);
    for (let y = yy0; y <= yy1; y++) for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if (!tiny && (edge(us[0], vs[0], us[1], vs[1], cx, cy) < -tol || edge(us[1], vs[1], us[2], vs[2], cx, cy) < -tol || edge(us[2], vs[2], us[0], vs[0], cx, cy) < -tol)) continue;
      if (MK.d[(y * MK.w + x) * 4] > 25) return true; }
    return false; };
  const GY = has('glowY') ? opt('glowY').split(',').map((v) => +v * HT) : null;   // only faces in this height band may glow (the windmill's
  // panes are the same orange as its roof tiles: the band keeps the cap out)
  const GB = has('glowBox') ? opt('glowBox').split(',').map(Number) : null;   // --glowBox x0,x1,y0,y1,z0,z1 (final units): only faces whose
  // centroid is inside may glow (the lantern: its glass, not the honey post or the hook)
  for (let t = 0; t < T; t++) { const i0 = I[t * 3], i1 = I[t * 3 + 1], i2 = I[t * 3 + 2], c = [0, 1, 2].map((k) => (P[i0 * 3 + k] + P[i1 * 3 + k] + P[i2 * 3 + k]) / 3), cy = c[1];
    const inBox = !GB || (c[0] >= GB[0] && c[0] <= GB[1] && c[1] >= GB[2] && c[1] <= GB[3] && c[2] >= GB[4] && c[2] <= GB[5]);
    (touchesPane(i0, i1, i2) && (!GY || (cy >= GY[0] && cy <= GY[1])) && inBox ? glowIdx : bodyIdx).push(i0, i1, i2); }
  if (GY || GB) {   // with a band / box, the mask keeps only the texels the Glow faces cover (+2 px): the cap's tiles leave the emissive map
    const keep = new Uint8Array(MK.w * MK.h);
    for (let k = 0; k < glowIdx.length; k += 3) { const v = [glowIdx[k], glowIdx[k + 1], glowIdx[k + 2]], us = v.map((i) => U[i * 2] * MK.w), vs = v.map((i) => U[i * 2 + 1] * MK.h);
      const A2 = (us[1] - us[0]) * (vs[2] - vs[0]) - (us[2] - us[0]) * (vs[1] - vs[0]) || 1e-9;
      for (let y = Math.max(0, Math.floor(Math.min(...vs)) - 2); y <= Math.min(MK.h - 1, Math.ceil(Math.max(...vs)) + 2); y++) for (let x = Math.max(0, Math.floor(Math.min(...us)) - 2); x <= Math.min(MK.w - 1, Math.ceil(Math.max(...us)) + 2); x++) {
        const px0 = x + 0.5, py0 = y + 0.5, l1 = ((us[1] - px0) * (vs[2] - py0) - (us[2] - px0) * (vs[1] - py0)) / A2, l2 = ((us[2] - px0) * (vs[0] - py0) - (us[0] - px0) * (vs[2] - py0)) / A2, l3 = 1 - l1 - l2, m = -2 / Math.sqrt(Math.abs(A2));
        if (l1 >= m && l2 >= m && l3 >= m) keep[y * MK.w + x] = 1; } }
    let kept = 0; for (let i = 0; i < keep.length; i++) { if (!keep[i]) MK.d[i * 4] = MK.d[i * 4 + 1] = MK.d[i * 4 + 2] = 0; else if (MK.d[i * 4] > 127) kept++; }
    console.log('glow', GY ? 'band ' + GY.map((v) => v.toFixed(2)).join('..') : '', GB ? 'box ' + GB.join(',') : '', 'mask texels kept under the Glow faces', kept);
  }
  console.log('tris', T, 'glow tris', glowIdx.length / 3, 'pane texels', maskN, '(' + (100 * maskN / (W * H)).toFixed(2) + '%)');
} else { for (let t = 0; t < T * 3; t++) bodyIdx.push(I[t]); console.log('tris', T); }

// ---- 3b. --roof: the slopes leave the body for a `Roof` primitive (own vertices: planar UVs per region, see the header) ----
let roof = null;
if (ROOF) {
  const RMY = +opt('roofMinY', 0.3) * HT, RA = +opt('roofArea', 1), RCOS = Math.cos(+opt('roofAngle', 20) * Math.PI / 180);
  const [TW, TH] = opt('roofTile', '0.8,0.8').split(',').map(Number);
  const terraAt = (u, v) => { const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor(v * H))), o = (y * W + x) * 4, [h, s, val] = hsv([px[o], px[o + 1], px[o + 2]]);
    return (h <= 28 || h >= 340) && s > 0.35 && val > 0.25; };
  const FT = bodyIdx.length / 3, fn = new Float64Array(FT * 3), fa = new Float64Array(FT), cand = new Uint8Array(FT);
  for (let f = 0; f < FT; f++) {
    const v = [bodyIdx[f * 3], bodyIdx[f * 3 + 1], bodyIdx[f * 3 + 2]], q = v.map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    const u1 = [0, 1, 2].map((k) => q[1][k] - q[0][k]), w1 = [0, 1, 2].map((k) => q[2][k] - q[0][k]);
    const n = [u1[1] * w1[2] - u1[2] * w1[1], u1[2] * w1[0] - u1[0] * w1[2], u1[0] * w1[1] - u1[1] * w1[0]], l = Math.hypot(...n) || 1;
    for (let k = 0; k < 3; k++) fn[f * 3 + k] = n[k] / l; fa[f] = l / 2;
    const cy = (q[0][1] + q[1][1] + q[2][1]) / 3, ny = n[1] / l;
    if (ny < 0.26 || ny > 0.966 || cy < RMY) continue;   // 15-75 deg slopes, above the porch steps / log pile
    const cu = (U[v[0] * 2] + U[v[1] * 2] + U[v[2] * 2]) / 3, cv = (U[v[0] * 2 + 1] + U[v[1] * 2 + 1] + U[v[2] * 2 + 1]) / 3;
    let k = terraAt(cu, cv) ? 1 : 0; for (const i of v) k += terraAt(U[i * 2] * 0.7 + cu * 0.3, U[i * 2 + 1] * 0.7 + cv * 0.3) ? 1 : 0;
    cand[f] = k >= 3 ? 1 : 0;
  }
  // regions: candidates joined over welded edges (UV seams split vertices) whose face normals differ < --roofAngle
  const key = (i) => `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`, weld = new Map(), wid = new Int32Array(N);
  for (let i = 0; i < N; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, weld.size); wid[i] = weld.get(k); }
  const edges = new Map(), nb = Array.from({ length: FT }, () => []);
  for (let f = 0; f < FT; f++) if (cand[f]) for (let k = 0; k < 3; k++) { const p = wid[bodyIdx[f * 3 + k]], q = wid[bodyIdx[f * 3 + (k + 1) % 3]], ek = p < q ? p + ':' + q : q + ':' + p;
    const o = edges.get(ek); if (o === undefined) { edges.set(ek, f); continue; }
    if (fn[f * 3] * fn[o * 3] + fn[f * 3 + 1] * fn[o * 3 + 1] + fn[f * 3 + 2] * fn[o * 3 + 2] >= RCOS) { nb[f].push(o); nb[o].push(f); } }
  const comp = new Int32Array(FT).fill(-1), regions = [], small = [];
  for (let f = 0; f < FT; f++) { if (!cand[f] || comp[f] !== -1) continue; const faces = [], st = [f]; comp[f] = -2;
    while (st.length) { const g = st.pop(); faces.push(g); for (const o of nb[g]) if (comp[o] === -1) { comp[o] = -2; st.push(o); } }
    const area = faces.reduce((s, g) => s + fa[g], 0); if (area < RA) { small.push({ faces, area }); continue; }
    for (const g of faces) comp[g] = regions.length; regions.push({ faces, area }); }
  if (!regions.length) throw new Error('--roof: no slope region >= ' + RA + ' u^2');
  // the smaller pieces of the SAME roof planes (Meshy cuts a slope into shells: behind the chimney, the verges) join their slope when
  // their normal is within --roofSnapAngle (10 deg) of it and every vertex within --roofSnap (0.15 u) of its plane (the verges sit a
  // little proud of the slope; a parallel piece projects cleanly): one projection, so the tiles run on across them. The ridge cap's
  // sides (13-15 deg off), the porch awning and the shed roof are tilted differently: they stay
  const SNAP = +opt('roofSnap', 0.15), SCOS = Math.cos(+opt('roofSnapAngle', 10) * Math.PI / 180);
  const planes = regions.map((R) => { const n = [0, 0, 0], c = [0, 0, 0]; let A = 0;
    for (const g of R.faces) { for (let k = 0; k < 3; k++) { n[k] += fn[g * 3 + k] * fa[g]; for (let m = 0; m < 3; m++) c[k] += P[bodyIdx[g * 3 + m] * 3 + k] * fa[g] / 3; } A += fa[g]; }
    const l = Math.hypot(...n); return { n: n.map((x) => x / l), c: c.map((x) => x / A) }; });
  let snapped = 0, snappedA = 0;
  for (const S of small) {
    const n = [0, 0, 0]; for (const g of S.faces) for (let k = 0; k < 3; k++) n[k] += fn[g * 3 + k] * fa[g]; const l = Math.hypot(...n) || 1;
    let best = -1, bd = Infinity;
    planes.forEach((pl, r) => { if ((n[0] * pl.n[0] + n[1] * pl.n[1] + n[2] * pl.n[2]) / l < SCOS) return;
      let worst = 0; for (const g of S.faces) for (let m = 0; m < 3; m++) { const i = bodyIdx[g * 3 + m]; worst = Math.max(worst, Math.abs((P[i * 3] - pl.c[0]) * pl.n[0] + (P[i * 3 + 1] - pl.c[1]) * pl.n[1] + (P[i * 3 + 2] - pl.c[2]) * pl.n[2])); }
      if (worst <= SNAP && worst < bd) { bd = worst; best = r; } });
    if (best < 0) continue;
    for (const g of S.faces) { comp[g] = best; regions[best].faces.push(g); } regions[best].area += S.area; snapped += S.faces.length; snappedA += S.area;
    S.info = `${S.area.toFixed(2)} u^2 ${S.faces.length} tris -> slope ${best} (${bd.toFixed(3)} u off)`; }
  if (snapped) console.log(`roof: ${snapped} tris (${snappedA.toFixed(2)} u^2) of smaller pieces on the slopes' planes joined them: ${small.filter((S) => S.info).map((S) => S.info).join(', ')}`);
  // each slope's normal: area-weighted over its faces (the step faces below are left out: they stand across the slope)
  for (const R of regions) { const n = [0, 0, 0]; for (const g of R.faces) for (let k = 0; k < 3; k++) n[k] += fn[g * 3 + k] * fa[g]; const ln = Math.hypot(...n); R.normal = n.map((x) => x / ln); }
  // per region: n = its normal, t = up x n (horizontal, along the eave: the viewer's right), s = n x t (up the slope)
  const dot = (i, a) => P[i * 3] * a[0] + P[i * 3 + 1] * a[1] + P[i * 3 + 2] * a[2];
  for (const R of regions) { const n = R.normal, tl = Math.hypot(n[2], n[0]); R.t = [n[2] / tl, 0, -n[0] / tl]; R.s = [n[1] * R.t[2] - n[2] * R.t[1], n[2] * R.t[0] - n[0] * R.t[2], n[0] * R.t[1] - n[1] * R.t[0]]; }
  // the step faces at the seam between a slope and a verge that sits proud of it (Meshy's own shells: the left verge ~6 cm up, its
  // riser and the slope's cut edge running eave to ridge, too steep for candidates; their old paint drew a diagonal line). A body face
  // joins a slope when it stands across it (steep to the plane, not its underside), reaches down to the slope's level (lowest corner
  // <= 1 cm above the plane), every corner is within --roofSnap of the plane, and there is roof on BOTH sides of it: 3 cm either way
  // across it, in the plane, lands on the slope's own faces, and it runs DOWN the slope (its across direction mostly along the eave):
  // the verge seams run ridge to eave. The ridge cap's lip also reaches down to the slope with roof on both sides (the slope runs on
  // under the cap), but it runs along the ridge: it stays, like the roof's outer edges (roof on one side only) and the soffit (facing away)
  const foot = regions.map((R) => R.faces.map((g) => [0, 1, 2].map((k) => { const i = bodyIdx[g * 3 + k]; return [dot(i, R.t), dot(i, R.s)]; })));
  const onRoof = (r, x, y) => foot[r].some(([A, B, C]) => { const d = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (Math.abs(d) < 1e-12) return false;
    const l1 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / d, l2 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / d; return l1 >= -1e-4 && l2 >= -1e-4 && l1 + l2 <= 1 + 1e-4; });
  let steps = 0;
  for (let f = 0; f < FT; f++) { if (comp[f] >= 0) continue; const v = [bodyIdx[f * 3], bodyIdx[f * 3 + 1], bodyIdx[f * 3 + 2]];
    for (let r = 0; r < regions.length; r++) { const R = regions[r], n = R.normal, pl = planes[r], fnv = [fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]], c = fnv[0] * n[0] + fnv[1] * n[1] + fnv[2] * n[2];
      const d = v.map((i) => (P[i * 3] - pl.c[0]) * n[0] + (P[i * 3 + 1] - pl.c[1]) * n[1] + (P[i * 3 + 2] - pl.c[2]) * n[2]);
      if (c < -0.3 || d.some((x) => Math.abs(x) > SNAP) || Math.min(...d) > 0.01) continue;
      const m = fnv.map((x, k) => x - c * n[k]), ml = Math.hypot(...m); if (ml < 0.3) continue;   // nearly parallel to the slope: not a step
      const mt = (m[0] * R.t[0] + m[1] * R.t[1] + m[2] * R.t[2]) / ml, ms = (m[0] * R.s[0] + m[1] * R.s[1] + m[2] * R.s[2]) / ml;
      if (Math.abs(mt) < 0.7) continue;   // runs along the ridge / eave (the ridge cap's lip): not a verge seam
      const cx = v.reduce((a, i) => a + dot(i, R.t), 0) / 3, cy = v.reduce((a, i) => a + dot(i, R.s), 0) / 3;
      if (!onRoof(r, cx + 0.03 * mt, cy + 0.03 * ms) || !onRoof(r, cx - 0.03 * mt, cy - 0.03 * ms)) continue;
      comp[f] = r; R.faces.push(f); steps++; break; } }
  if (steps) console.log(`roof: ${steps} step faces at the seams between the slopes and their verges joined them`);
  // u = p.t / TW (+ a per-region phase, so the slopes do not repeat each other), v = -(p.s - eave) / TH. Every vertex gets n itself:
  // one flat normal per slope, so the verge and its steps shade exactly like the slope (Meshy's normals lean across it)
  const geo = { p: [], n: [], u: [], ix: [], map: new Map() };
  regions.forEach((R, r) => {
    const n = R.normal, t = R.t, s = R.s;
    let eave = Infinity; for (const g of R.faces) for (let k = 0; k < 3; k++) eave = Math.min(eave, dot(bodyIdx[g * 3 + k], s));
    const phase = (r * 0.37) % 1;
    for (const g of R.faces) for (let k = 0; k < 3; k++) { const i = bodyIdx[g * 3 + k], mk = r + ':' + i; let j = geo.map.get(mk);
      if (j === undefined) { j = geo.p.length / 3; geo.map.set(mk, j); geo.p.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); geo.n.push(n[0], n[1], n[2]);
        geo.u.push(dot(i, t) / TW + phase, -(dot(i, s) - eave) / TH); }
      geo.ix.push(j); }
    R.normal = n; R.slope = Math.acos(n[1]) * 180 / Math.PI;
  });
  const moved = regions.reduce((s, R) => s + R.faces.length, 0), keep = [], atlasFaces = [];
  for (let f = 0; f < FT; f++) (comp[f] >= 0 ? atlasFaces : keep).push(bodyIdx[f * 3], bodyIdx[f * 3 + 1], bodyIdx[f * 3 + 2]);
  bodyIdx.length = 0; for (const i of keep) bodyIdx.push(i);
  roof = { geo, regions, atlasFaces, TW, TH };
  console.log(`roof: ${regions.length} region(s), ${moved} tris moved: ` + regions.map((R) => `${R.area.toFixed(2)} u^2 ${R.faces.length} tris slope ${R.slope.toFixed(0)} deg n ${R.normal.map((v) => v.toFixed(2)).join(',')}`).join(' | '));
}

// foliage faces (on the raw albedo, before the grade): >= 3 of 4 samples (centroid + the corners pulled 25 % inward) green, and
// above leafMinY x height; then a 3-pass majority filter over edge neighbours and small islands folded back (moss, stray leaves)
let leaf = null;
if (CANOPY) {
  const [LH0, LH1] = opt('leafHue', '55,170').split(',').map(Number), LS = +opt('leafSat', 0.2), LMY = +opt('leafMinY', 0.36) * HT;
  const green = (u, v) => { const x = Math.min(W - 1, Math.max(0, Math.floor(u * W))), y = Math.min(H - 1, Math.max(0, Math.floor(v * H))), o = (y * W + x) * 4, [h, s, val] = hsv([px[o], px[o + 1], px[o + 2]]);
    return h >= LH0 && h <= LH1 && s >= LS && val >= 0.1; };
  leaf = new Uint8Array(T);
  for (let t = 0; t < T; t++) { const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]], cu = (U[v[0] * 2] + U[v[1] * 2] + U[v[2] * 2]) / 3, cv = (U[v[0] * 2 + 1] + U[v[1] * 2 + 1] + U[v[2] * 2 + 1]) / 3;
    let n = green(cu, cv) ? 1 : 0; for (const k of v) n += green(U[k * 2] * 0.75 + cu * 0.25, U[k * 2 + 1] * 0.75 + cv * 0.25) ? 1 : 0;
    const cy = (P[v[0] * 3 + 1] + P[v[1] * 3 + 1] + P[v[2] * 3 + 1]) / 3; leaf[t] = n >= 3 && cy >= LMY ? 1 : 0; }
  // edge adjacency on WELDED positions (UV seams split vertices)
  const key = (i) => `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`, weld = new Map(), wid = new Int32Array(N);
  for (let i = 0; i < N; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, weld.size); wid[i] = weld.get(k); }
  const edges = new Map(), nb = Array.from({ length: T }, () => []);
  for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) { const p = wid[I[t * 3 + k]], q = wid[I[t * 3 + (k + 1) % 3]], ek = p < q ? p + ':' + q : q + ':' + p;
    if (edges.has(ek)) { const o = edges.get(ek); nb[t].push(o); nb[o].push(t); } else edges.set(ek, t); }
  for (let it = 0; it < 3; it++) { const nx = leaf.slice(); for (let t = 0; t < T; t++) { if (nb[t].length < 2) continue; let s = 0; for (const o of nb[t]) s += leaf[o]; if (s * 2 > nb[t].length) nx[t] = 1; else if (s * 2 < nb[t].length) nx[t] = 0; } leaf.set(nx); }
  const comp = new Int32Array(T).fill(-1), sizes = [];
  for (let t = 0; t < T; t++) { if (comp[t] >= 0) continue; const c = sizes.length, st = [t]; comp[t] = c; let n = 0;
    while (st.length) { const f = st.pop(); n++; for (const o of nb[f]) if (comp[o] < 0 && leaf[o] === leaf[t]) { comp[o] = c; st.push(o); } } sizes.push({ n, cls: leaf[t] }); }
  let flipped = 0; for (let t = 0; t < T; t++) if (sizes[comp[t]].n < 16) { leaf[t] ^= 1; flipped++; }
  let nl = 0; for (let t = 0; t < T; t++) nl += leaf[t];
  console.log('canopy faces', nl, 'of', T, `(${flipped} faces in small islands folded back)`);
}
if (has('dump')) {   // the albedo with mask / canopy texels pushed to magenta (for checking)
  const out = Buffer.from(px);
  if (mask) for (let o = 0; o < out.length; o += 4) { const m = mask[o] / 255; out[o] = Math.round(out[o] * (1 - m) + 255 * m); out[o + 1] = Math.round(out[o + 1] * (1 - m)); out[o + 2] = Math.round(out[o + 2] * (1 - m) + 255 * m); }
  if (leaf) for (let t = 0; t < T; t++) if (leaf[t]) { const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]; for (let s = 0; s < 3; s++) { const u = (U[v[0] * 2] + U[v[1] * 2] + U[v[2] * 2]) / 3, w = (U[v[0] * 2 + 1] + U[v[1] * 2 + 1] + U[v[2] * 2 + 1]) / 3;
    const x = Math.floor(u * W), y = Math.floor(w * H); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const q = ((Math.min(H - 1, Math.max(0, y + dy))) * W + Math.min(W - 1, Math.max(0, x + dx))) * 4; out[q] = 255; out[q + 1] = 0; out[q + 2] = 255; } } }
  fs.writeFileSync(opt('dump'), jpeg.encode({ data: out, width: W, height: H }, 80).data);
}

// ---- 4. albedo: readability grade (mild lift; terracotta / brick a touch brighter), box-downsample to TEX, JPEG q ----
const LIFT = +opt('lift', 0.9), TERRA = +opt('terra', 1.1);
if (LIFT !== 1 || TERRA !== 1) for (let o = 0; o < px.length; o += 4) {
  const c = [px[o], px[o + 1], px[o + 2]], [h, sat] = hsv(c), terra = sat > 0.4 && (h <= 25 || h >= 345);
  for (let k = 0; k < 3; k++) { let v = Math.pow(c[k] / 255, LIFT); if (terra) v *= TERRA; px[o + k] = Math.min(255, Math.round(v * 255)); }
}
if (has('sat')) {   // --sat h0,h1,k: saturation x k on the texels of that hue band (a too-yellow moss cap)
  const [S0, S1, SK] = opt('sat').split(',').map(Number);
  for (let o = 0; o < px.length; o += 4) { const c = [px[o], px[o + 1], px[o + 2]], [h] = hsv(c); if (h < S0 || h > S1) continue;
    const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; for (let k = 0; k < 3; k++) px[o + k] = Math.min(255, Math.max(0, Math.round(l + (c[k] - l) * SK))); }
}
if (has('hue')) {   // --hue h0,h1,target,k: the texels of that hue band turn k of the way to the target hue (yellow moss -> lawn green)
  const [H0b, H1b, HT, HK] = opt('hue').split(',').map(Number);
  for (let o = 0; o < px.length; o += 4) { const [h, s, v] = hsv([px[o], px[o + 1], px[o + 2]]); if (h < H0b || h > H1b || s < 0.08) continue;
    const nh = (h + (HT - h) * HK) / 60, i = Math.floor(nh) % 6, f = nh - Math.floor(nh), p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i]; for (let k = 0; k < 3; k++) px[o + k] = Math.round(255 * rgb[k]); }
}
let roofJpg = null;
if (roof) {   // the old roof texels (graded): their mean colour, the tile texture matched to it, the dead ones filled flat
  const rast = (idx, pad, fn) => { for (let k = 0; k < idx.length; k += 3) {   // texel centres inside the UV triangle (+pad px)
    const v = [idx[k], idx[k + 1], idx[k + 2]], us = v.map((i) => U[i * 2] * W), vs = v.map((i) => U[i * 2 + 1] * H);
    const A2 = (us[1] - us[0]) * (vs[2] - vs[0]) - (us[2] - us[0]) * (vs[1] - vs[0]); if (Math.abs(A2) < 1e-9) continue; const sg = A2 < 0 ? -1 : 1;
    const ed = (a, b, x, y) => sg * ((us[b] - us[a]) * (y - vs[a]) - (vs[b] - vs[a]) * (x - us[a])) / (Math.hypot(us[b] - us[a], vs[b] - vs[a]) || 1);
    for (let y = Math.max(0, Math.floor(Math.min(...vs) - pad)); y <= Math.min(H - 1, Math.ceil(Math.max(...vs) + pad)); y++)
      for (let x = Math.max(0, Math.floor(Math.min(...us) - pad)); x <= Math.min(W - 1, Math.ceil(Math.max(...us) + pad)); x++) {
        const cx = x + 0.5, cy = y + 0.5; if (ed(0, 1, cx, cy) >= -pad && ed(1, 2, cx, cy) >= -pad && ed(2, 0, cx, cy) >= -pad) fn(y * W + x); } } };
  const mine = new Uint8Array(W * H), other = new Uint8Array(W * H);
  rast(roof.atlasFaces, 0, (i) => { mine[i] = 1; });
  rast(bodyIdx, 2, (i) => { other[i] = 1; }); rast(glowIdx, 2, (i) => { other[i] = 1; });
  const sum = [0, 0, 0]; let cnt = 0;
  for (let i = 0; i < W * H; i++) if (mine[i]) { for (let k = 0; k < 3; k++) sum[k] += px[i * 4 + k]; cnt++; }
  for (let k = 0; k < roof.atlasFaces.length; k += 3) {   // + each face's centroid texel (a face whose UVs collapse to a point has no area)
    const v = [roof.atlasFaces[k], roof.atlasFaces[k + 1], roof.atlasFaces[k + 2]], x = Math.min(W - 1, Math.floor((U[v[0] * 2] + U[v[1] * 2] + U[v[2] * 2]) / 3 * W)), y = Math.min(H - 1, Math.floor((U[v[0] * 2 + 1] + U[v[1] * 2 + 1] + U[v[2] * 2 + 1]) / 3 * H));
    for (let c = 0; c < 3; c++) sum[c] += px[(y * W + x) * 4 + c]; cnt++; }
  const mean = sum.map((s) => s / cnt);
  let dead = 0; for (let i = 0; i < W * H; i++) if (mine[i] && !other[i]) { for (let k = 0; k < 3; k++) px[i * 4 + k] = Math.round(mean[k]); dead++; }
  let tp = opt('roof'); if (!fs.existsSync(tp)) tp = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'meshy', ID, opt('roof'));
  const ti = jpeg.decode(fs.readFileSync(tp), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  let RT = { w: ti.width, h: ti.height, d: ti.data }; if (has('roofPx')) RT = down(RT, +opt('roofPx'));
  const meanOf = (d) => [0, 1, 2].map((k) => { let s = 0; for (let o = k; o < d.length; o += 4) s += d[o]; return s / (d.length / 4); });
  const src = Uint8Array.from(RT.d), out = new Uint8Array(src.length), m0 = meanOf(src);
  let gain = mean.map((m, k) => m / Math.max(1, m0[k]));
  const apply = () => { for (let o = 0; o < src.length; o += 4) { for (let k = 0; k < 3; k++) out[o + k] = Math.min(255, Math.round(src[o + k] * gain[k])); out[o + 3] = 255; } };
  for (let it = 0; it < 3; it++) { apply(); const m2 = meanOf(out); gain = gain.map((g, k) => g * mean[k] / Math.max(1, m2[k])); }   // (clipped highlights: re-aim)
  apply();
  roofJpg = new Uint8Array(jpeg.encode({ data: out, width: RT.w, height: RT.h }, +opt('roofQ', 85)).data);
  console.log(`roof texture ${path.basename(tp)} ${RT.w}x${RT.h} -> ${(RT.w / roof.TW).toFixed(0)} x ${(RT.h / roof.TH).toFixed(0)} px/u, matched to the old roof mean ${mean.map((v) => v.toFixed(0)).join(',')} (gain ${gain.map((g) => g.toFixed(2)).join(',')}), ${Math.round(roofJpg.length / 1024)} KB; atlas texels freed ${dead} (${(100 * dead / (W * H)).toFixed(1)} %)`);
}
const AL = has('pad') ? downCovered({ w: W, h: H, d: px }, coverage(I, U, W, H)) : down({ w: W, h: H, d: px });
tex.setImage(new Uint8Array(jpeg.encode({ data: AL.d, width: AL.w, height: AL.h }, Q).data)).setMimeType('image/jpeg').setName(ID + '_albedo');

// --pad: which source texels a face's UV triangle covers (texel centres inside it), then a halving box filter that weights every texel
// by that coverage (premultiplied: an edge texel averages only island texels, never the black between islands), and at the final size
// the uncovered texels grow their covered neighbours' colour ring by ring (64 rings; anything left takes the mean)
function coverage(idx, uvs, w, h) {
  const cov = new Uint8Array(w * h);
  for (let k = 0; k < idx.length; k += 3) {
    const v = [idx[k], idx[k + 1], idx[k + 2]], us = v.map((i) => uvs[i * 2] * w), vs = v.map((i) => uvs[i * 2 + 1] * h);
    const A2 = (us[1] - us[0]) * (vs[2] - vs[0]) - (us[2] - us[0]) * (vs[1] - vs[0]); if (Math.abs(A2) < 1e-12) continue; const sg = A2 < 0 ? -1 : 1;
    const ed = (a, b, x, y) => sg * ((us[b] - us[a]) * (y - vs[a]) - (vs[b] - vs[a]) * (x - us[a]));
    for (let y = Math.max(0, Math.floor(Math.min(...vs))); y <= Math.min(h - 1, Math.ceil(Math.max(...vs))); y++)
      for (let x = Math.max(0, Math.floor(Math.min(...us))); x <= Math.min(w - 1, Math.ceil(Math.max(...us))); x++) {
        const cx = x + 0.5, cy = y + 0.5; if (ed(0, 1, cx, cy) >= 0 && ed(1, 2, cx, cy) >= 0 && ed(2, 0, cx, cy) >= 0) cov[y * w + x] = 1; } }
  return cov;
}
function downCovered(src, cov, max = TEX) {
  let w = src.w, h = src.h, c = new Float32Array(w * h * 3), a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { a[i] = cov[i]; for (let k = 0; k < 3; k++) c[i * 3 + k] = src.d[i * 4 + k] * cov[i]; }
  while (w > max) { const w2 = w >> 1, h2 = h >> 1, c2 = new Float32Array(w2 * h2 * 3), a2 = new Float32Array(w2 * h2);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) { const o = y * 2 * w + x * 2, q = [o, o + 1, o + w, o + w + 1], j = y * w2 + x;
      for (const i of q) { a2[j] += a[i]; for (let k = 0; k < 3; k++) c2[j * 3 + k] += c[i * 3 + k]; }
      a2[j] /= 4; for (let k = 0; k < 3; k++) c2[j * 3 + k] /= 4; }
    w = w2; h = h2; c = c2; a = a2; }
  const col = new Float32Array(w * h * 3), done = new Uint8Array(w * h); let todo = [];
  for (let i = 0; i < w * h; i++) if (a[i] > 1e-6) { for (let k = 0; k < 3; k++) col[i * 3 + k] = c[i * 3 + k] / a[i]; done[i] = 1; } else todo.push(i);
  const covered = w * h - todo.length;
  for (let pass = 0; pass < 64 && todo.length; pass++) { const next = [], fill = [];
    for (const i of todo) { const x = i % w, y = (i / w) | 0; let r = 0, g = 0, b = 0, m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const j = yy * w + xx; if (!done[j]) continue; r += col[j * 3]; g += col[j * 3 + 1]; b += col[j * 3 + 2]; m++; }
      if (m) fill.push([i, r / m, g / m, b / m]); else next.push(i); }
    for (const [i, r, g, b] of fill) { col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; done[i] = 1; }
    todo = next; }
  if (todo.length) { const s = [0, 0, 0]; let m = 0; for (let i = 0; i < w * h; i++) if (done[i]) { for (let k = 0; k < 3; k++) s[k] += col[i * 3 + k]; m++; } for (const i of todo) for (let k = 0; k < 3; k++) col[i * 3 + k] = s[k] / (m || 1); }
  const d = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, Math.min(255, Math.round(col[i * 3 + k]))); d[i * 4 + 3] = 255; }
  console.log(`pad: ${w}x${h} albedo, ${(100 * covered / (w * h)).toFixed(1)} % of the texels touch an island, the rest padded`);
  return { w, h, d };
}

// ---- 5. materials + the Glow primitive (shares the vertex attributes; emissive = factor x mask, the proof drives the factor) ----
srcMat.setName(ID).setMetallicFactor(0).setRoughnessFactor(0.92);
const buf = root.listBuffers()[0];
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
let canopyNode = null;
if (CANOPY) {   // trunk + canopy: each its own compacted vertex set; the canopy's positions relative to its pivot
  const faces = (cls) => { const f = []; for (let t = 0; t < T; t++) if (leaf[t] === cls) f.push(t); return f; };
  const trunkF = faces(0), leafF = faces(1);
  let lo = Infinity, hi = -Infinity, ax = 0, az = 0, an = 0;   // pivot: trunk axis (trunk verts in 12-30 % of the height), near the trunk top
  const tb = { mn: [Infinity, 0, Infinity], mx: [-Infinity, 0, -Infinity] };
  for (const t of trunkF) for (let k = 0; k < 3; k++) { const i = I[t * 3 + k], y = P[i * 3 + 1]; if (y >= 0.12 * HT && y <= 0.3 * HT) { tb.mn[0] = Math.min(tb.mn[0], P[i * 3]); tb.mx[0] = Math.max(tb.mx[0], P[i * 3]); tb.mn[2] = Math.min(tb.mn[2], P[i * 3 + 2]); tb.mx[2] = Math.max(tb.mx[2], P[i * 3 + 2]); an++; } }
  ax = an ? (tb.mn[0] + tb.mx[0]) / 2 : 0; az = an ? (tb.mn[2] + tb.mx[2]) / 2 : 0;
  const ly = []; for (const t of leafF) for (let k = 0; k < 3; k++) ly.push(P[I[t * 3 + k] * 3 + 1]); ly.sort((p, q) => p - q);
  const py = Math.max(0.35 * HT, Math.min(0.6 * HT, ly[Math.floor(ly.length * 0.05)] || 0.5 * HT)), PIV = [ax, py, az];
  lo = ly[0]; hi = ly[ly.length - 1];
  const compact = (fl, off) => { const map = new Map(), p = [], n = [], u = [], ix = [];
    for (const t of fl) for (let k = 0; k < 3; k++) { const i = I[t * 3 + k]; let j = map.get(i); if (j === undefined) { j = map.size; map.set(i, j);
      p.push(P[i * 3] - off[0], P[i * 3 + 1] - off[1], P[i * 3 + 2] - off[2]); n.push(Nr[i * 3], Nr[i * 3 + 1], Nr[i * 3 + 2]); u.push(U[i * 2], U[i * 2 + 1]); } ix.push(j); }
    return { p: new Float32Array(p), n: new Float32Array(n), u: new Float32Array(u), i: new Uint32Array(ix) }; };
  const tr = compact(trunkF, [0, 0, 0]), lf = compact(leafF, PIV);
  prim.setAttribute('POSITION', acc('VEC3', tr.p)).setAttribute('NORMAL', acc('VEC3', tr.n)).setAttribute('TEXCOORD_0', acc('VEC2', tr.u)).setIndices(acc('SCALAR', tr.i));
  pos.dispose(); nor.dispose(); uv.dispose();
  const lp = doc.createPrimitive().setMaterial(srcMat).setAttribute('POSITION', acc('VEC3', lf.p)).setAttribute('NORMAL', acc('VEC3', lf.n)).setAttribute('TEXCOORD_0', acc('VEC2', lf.u)).setIndices(acc('SCALAR', lf.i));
  // --crown (conifers): the pivot moves up to a mesh-less `Crown` node, `Canopy` sits at its local origin under it: same world positions
  canopyNode = doc.createNode('Canopy').setTranslation(CROWN ? [0, 0, 0] : PIV).setMesh(doc.createMesh(ID + '_canopy').addPrimitive(lp));
  if (CROWN) node.addChild(doc.createNode('Crown').setTranslation(PIV).addChild(canopyNode)); else node.addChild(canopyNode);
  console.log('canopy pivot', PIV.map((v) => v.toFixed(2)).join(', '), 'canopy y', lo.toFixed(2), '..', hi.toFixed(2), 'trunk tris', trunkF.length, 'canopy tris', leafF.length, ...(CROWN ? ['(Crown > Canopy)'] : []));
} else if (PARTS.length) splitParts();
else prim.setIndices(acc('SCALAR', new Uint32Array(bodyIdx)));
if (glowIdx.length) {
  const MO = down(MK);   // the saved emissive map: the classification mask box-downsampled to --tex (= MK at --tex >= 1024)
  const mtex = doc.createTexture(ID + '_glowmask').setMimeType('image/jpeg').setImage(new Uint8Array(jpeg.encode({ data: MO.d, width: MO.w, height: MO.h }, 85).data));
  const glow = doc.createMaterial('Glow').setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(tex).setEmissiveTexture(mtex)
    .setEmissiveFactor([0.466, 0.361, 0.171]).setMetallicFactor(0).setRoughnessFactor(0.92);
  const gp = doc.createPrimitive().setMaterial(glow).setIndices(acc('SCALAR', new Uint32Array(glowIdx)));
  for (const sem of prim.listSemantics()) gp.setAttribute(sem, prim.getAttribute(sem));
  mesh.addPrimitive(gp);
}
if (roof) {   // its own vertices: float UVs (they run past 0..1; --compact leaves them float), REPEAT, not named *_albedo (P16)
  const rtex = doc.createTexture(ID + '_roof').setMimeType('image/jpeg').setImage(roofJpg);
  const rm = doc.createMaterial('Roof').setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(rtex).setMetallicFactor(0).setRoughnessFactor(0.92);
  rm.getBaseColorTextureInfo().setWrapS(10497).setWrapT(10497).setMinFilter(9987).setMagFilter(9729);
  const g = roof.geo;
  mesh.addPrimitive(doc.createPrimitive().setMaterial(rm).setAttribute('POSITION', acc('VEC3', new Float32Array(g.p))).setAttribute('NORMAL', acc('VEC3', new Float32Array(g.n)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.u))).setIndices(acc('SCALAR', new Uint32Array(g.ix))));
}
idxA.dispose();

// ---- 6. Smoke empty: top of the chimney (highest vertices in the back-right quadrant: x > CX, z < CZ) ----
if (has('smoke')) {
  let best = -Infinity; for (let i = 0; i < N; i++) if (P[i * 3] > CX && P[i * 3 + 2] < CZ) best = Math.max(best, P[i * 3 + 1]);
  const top = []; for (let i = 0; i < N; i++) if (P[i * 3] > CX && P[i * 3 + 2] < CZ && P[i * 3 + 1] > best - 0.04) top.push(i);
  const sm = [0, 0, 0]; for (const i of top) for (let k = 0; k < 3; k++) sm[k] += P[i * 3 + k] / top.length;
  const smoke = doc.createNode('Smoke').setTranslation([sm[0], best, sm[2]]);
  root.listScenes()[0].addChild(smoke);
  console.log('smoke at', sm[0].toFixed(2), best.toFixed(2), sm[2].toFixed(2), '(' + top.length + ' verts)');
}

// ---- 6b. --empty Name:x,y,z (or Name:glow = the centre of the Glow faces' bbox): the lighthouse `Beam` ----
for (const E of EMPTIES) {
  let at = E.at;
  if (at === 'glow') { if (!glowIdx.length) throw new Error(`--empty ${E.name}:glow needs Glow faces`);
    const mn3 = [Infinity, Infinity, Infinity], mx3 = [-Infinity, -Infinity, -Infinity];
    for (const i of glowIdx) for (let k = 0; k < 3; k++) { mn3[k] = Math.min(mn3[k], P[i * 3 + k]); mx3[k] = Math.max(mx3[k], P[i * 3 + k]); }
    at = mn3.map((v, k) => +((v + mx3[k]) / 2).toFixed(4)); }
  root.listScenes()[0].addChild(doc.createNode(E.name).setTranslation(at));
  console.log('empty', E.name, 'at', at.map((v) => v.toFixed(2)).join(', '));
}

// ---- 7. PorchLight empty: in front of the door = between the front windows (Glow faces facing +Z), under the awning ----
if (has('porch')) {
  const fw = []; for (let k = 0; k < glowIdx.length; k += 3) { const v = [glowIdx[k], glowIdx[k + 1], glowIdx[k + 2]].map((i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]);
    const ux = v[1][0] - v[0][0], uy = v[1][1] - v[0][1], uz = v[1][2] - v[0][2], wx = v[2][0] - v[0][0], wy = v[2][1] - v[0][1], wz = v[2][2] - v[0][2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz) || 1;
    if (nz / l > 0.7) fw.push([(v[0][0] + v[1][0] + v[2][0]) / 3, (v[0][1] + v[1][1] + v[2][1]) / 3, (v[0][2] + v[1][2] + v[2][2]) / 3]); }
  if (fw.length) { const fx = fw.reduce((s, p) => s + p[0], 0) / fw.length, fy = fw.reduce((s, p) => s + p[1], 0) / fw.length, fz = Math.max(...fw.map((p) => p[2]));
    const PL = [fx, +opt('porchY', fy + 0.05), fz + +opt('porchOut', 0.35)];
    root.listScenes()[0].addChild(doc.createNode('PorchLight').setTranslation(PL));
    console.log('front window faces', fw.length, 'porch light at', PL.map((v) => v.toFixed(2)).join(', '));
    if (has('porchLamp')) addPorchLamp(PL); }
  else console.log('no front window faces: no PorchLight');
}
// --part / --cut: split parts off into child nodes pivoted at their pivots (positions relative to them).
// 1. Faces in a part's region go to the part when wholly on the +n side of all its cut planes; the triangles a plane crosses are
//    SPLIT along it (new vertices on the plane, normals / UVs interpolated, one per original edge and plane so the two triangles on
//    an edge share the point).
// 2. Stranded pieces move to their side: a body component other than the main body that touches a part joins that part (the goat's
//    horn); a part component other than the part's main one that touches only the body and holds < 10 % of the part rejoins it.
// 3. Each part's boundary loops against the body (welded positions, so UV seams are not cuts) are capped on BOTH sides by the same
//    ear-clipped polygon (inside the loop's outline: no shards): the part's cap runs against its boundary edges and the body's
//    along them, so both surfaces stay closed. Flat normals, one UV per cap (the loop's typical texel colour).
function splitParts() {
  const pos3 = Array.from(P), nrm3 = Array.from(Nr), uv2 = Array.from(U);
  const V = (i) => [pos3[i * 3], pos3[i * 3 + 1], pos3[i * 3 + 2]];
  const faces = [], owner = [], cutAt = new Map();
  const cutVert = (i, j, t, plane) => {   // the point at fraction t from i to j on that plane, from the lower index so both sides agree
    if (i > j) { [i, j] = [j, i]; t = 1 - t; }
    const k = i + ':' + j + ':' + plane; let v = cutAt.get(k); if (v !== undefined) return v;
    v = pos3.length / 3;
    for (let c = 0; c < 3; c++) pos3.push(pos3[i * 3 + c] + (pos3[j * 3 + c] - pos3[i * 3 + c]) * t);
    const nn = [0, 1, 2].map((c) => nrm3[i * 3 + c] + (nrm3[j * 3 + c] - nrm3[i * 3 + c]) * t), l = Math.hypot(...nn) || 1; nrm3.push(...nn.map((x) => x / l));
    for (let c = 0; c < 2; c++) uv2.push(uv2[i * 2 + c] + (uv2[j * 2 + c] - uv2[i * 2 + c]) * t);
    cutAt.set(k, v); return v; };
  const inRegion = (pt, c) => pt.boxes.some((b) => c[0] >= b[0] && c[0] <= b[1] && c[1] >= b[2] && c[1] <= b[3] && c[2] >= b[4] && c[2] <= b[5]);
  let split = 0;
  for (let t = 0; t < T; t++) {
    const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]], c = [0, 1, 2].map((k) => (P[v[0] * 3 + k] + P[v[1] * 3 + k] + P[v[2] * 3 + k]) / 3);
    let done = false;
    for (let j = 0; j < PARTS.length && !done; j++) {
      const pt = PARTS[j]; if (!inRegion(pt, c)) continue;
      // the part = the + side of EVERY cut plane: clip the polygon plane by plane; what each plane cuts off goes to the body
      let poly = v, cut = false; const off = [];
      for (let pi = 0; pi < pt.cuts.length && poly; pi++) {
        const { n, q } = pt.cuts[pi], d = poly.map((i) => { const s = n[0] * (pos3[i * 3] - q[0]) + n[1] * (pos3[i * 3 + 1] - q[1]) + n[2] * (pos3[i * 3 + 2] - q[2]); return Math.abs(s) < 1e-7 ? 1e-7 : s; });
        if (d.every((x) => x > 0)) continue;
        if (d.every((x) => x < 0)) { off.push(poly); poly = null; break; }
        const plus = [], minus = [];   // crossed: split into the + and - polygons (a convex polygon clipped by a plane stays convex)
        for (let k = 0; k < poly.length; k++) { const k2 = (k + 1) % poly.length; (d[k] > 0 ? plus : minus).push(poly[k]);
          if ((d[k] > 0) !== (d[k2] > 0)) { const x = cutVert(poly[k], poly[k2], d[k] / (d[k] - d[k2]), j * 16 + pi); plus.push(x); minus.push(x); } }
        off.push(minus); poly = plus; cut = true;
      }
      if (!cut && !poly) continue;   // wholly outside: not this part (a later part may claim it, else the body)
      if (!cut) { faces.push(v); owner.push(j); done = true; break; }
      for (const [pl, o] of [...(poly ? [[poly, j]] : []), ...off.map((m) => [m, -1])]) for (let k = 1; k + 1 < pl.length; k++) { faces.push([pl[0], pl[k], pl[k + 1]]); owner.push(o); }
      split++; done = true;
    }
    if (!done) { faces.push(v); owner.push(-1); }
  }
  // welded vertex ids, edge -> faces
  const NV = pos3.length / 3, wid = new Int32Array(NV), weld = new Map();
  for (let i = 0; i < NV; i++) { const k = `${Math.round(pos3[i * 3] * 1e4)},${Math.round(pos3[i * 3 + 1] * 1e4)},${Math.round(pos3[i * 3 + 2] * 1e4)}`; if (!weld.has(k)) weld.set(k, weld.size); wid[i] = weld.get(k); }
  const ekey = (a, b) => { const p = wid[a], q = wid[b]; return p < q ? p + ':' + q : q + ':' + p; };
  const edgeFaces = new Map();
  faces.forEach((f, fi) => { for (let k = 0; k < 3; k++) { const e = ekey(f[k], f[(k + 1) % 3]); let s = edgeFaces.get(e); if (!s) edgeFaces.set(e, (s = [])); s.push(fi); } });
  const nbrs = (f) => { const out = []; for (let k = 0; k < 3; k++) for (const g of edgeFaces.get(ekey(faces[f][k], faces[f][(k + 1) % 3]))) if (g !== f) out.push(g); return out; };
  const comps = (o) => {   // the connected components of the faces owned by o (edge adjacency inside the class), largest first
    const seen = new Set(), out = [];
    owner.forEach((x, f0) => { if (x !== o || seen.has(f0)) return; const c = [], st = [f0]; seen.add(f0);
      while (st.length) { const f = st.pop(); c.push(f); for (const g of nbrs(f)) if (!seen.has(g) && owner[g] === o) { seen.add(g); st.push(g); } }
      out.push(c); });
    return out.sort((x, y) => y.length - x.length); };
  const touching = (c) => { const m = new Map(); for (const f of c) for (const g of nbrs(f)) if (owner[g] !== owner[f]) m.set(owner[g], (m.get(owner[g]) || 0) + 1); return m; };
  let toPart = 0, toBody = 0;
  for (const c of comps(-1).slice(1)) { let best = null, bn = 0; for (const [o, k] of touching(c)) if (o >= 0 && k > bn) { bn = k; best = o; }
    if (best !== null) { for (const f of c) owner[f] = best; toPart += c.length; } }
  PARTS.forEach((pt, j) => { const cs = comps(j), total = cs.reduce((s, c) => s + c.length, 0);
    for (const c of cs.slice(1)) { const m = touching(c); if (m.size === 1 && m.has(-1) && c.length < 0.1 * total) { for (const f of c) owner[f] = -1; toBody += c.length; } } });
  // geometry: the body and every part get their own compacted vertex set
  const geo = () => ({ map: new Map(), p: [], n: [], u: [], ix: [] });
  const vtx = (g, i, off) => { let j = g.map.get(i); if (j === undefined) { j = g.p.length / 3; g.map.set(i, j); g.p.push(pos3[i * 3] - off[0], pos3[i * 3 + 1] - off[1], pos3[i * 3 + 2] - off[2]); g.n.push(nrm3[i * 3], nrm3[i * 3 + 1], nrm3[i * 3 + 2]); g.u.push(uv2[i * 2], uv2[i * 2 + 1]); } return j; };
  const fresh = (g, p, n, u, off) => { const j = g.p.length / 3; g.p.push(p[0] - off[0], p[1] - off[1], p[2] - off[2]); g.n.push(...n); g.u.push(...u); return j; };
  const body = geo(), parts = PARTS.map(() => geo()), O = [0, 0, 0];
  faces.forEach((f, fi) => { const o = owner[fi], g = o < 0 ? body : parts[o], off = o < 0 ? O : PARTS[o].pivot; for (const i of f) g.ix.push(vtx(g, i, off)); });
  const col = (i) => { const x = Math.min(W - 1, Math.max(0, Math.floor(uv2[i * 2] * W))), y = Math.min(H - 1, Math.max(0, Math.floor(uv2[i * 2 + 1] * H))), o = (y * W + x) * 4; return [px[o], px[o + 1], px[o + 2]]; };
  const cr2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const earClip = (p2) => {   // p2 counter-clockwise; triangles as index triples, counter-clockwise
    const idx = p2.map((_, i) => i), tris = [], inTri = (p, A, B, C) => cr2(A, B, p) >= -1e-12 && cr2(B, C, p) >= -1e-12 && cr2(C, A, p) >= -1e-12;
    while (idx.length > 3) { let found = false;
      for (let k = 0; k < idx.length; k++) { const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length], A = p2[i0], B = p2[i1], C = p2[i2];
        if (cr2(A, B, C) <= 1e-14) continue;
        if (idx.some((m) => m !== i0 && m !== i1 && m !== i2 && inTri(p2[m], A, B, C))) continue;
        tris.push([i0, i1, i2]); idx.splice(k, 1); found = true; break; }
      if (!found) { for (let k = 1; k + 1 < idx.length; k++) tris.push([idx[0], idx[k], idx[k + 1]]); return tris; } }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    return tris; };
  PARTS.forEach((pt, j) => {
    const next = new Map();   // the part's directed boundary edges against the body (its own winding), chained into loops
    faces.forEach((f, fi) => { if (owner[fi] !== j) return; for (let k = 0; k < 3; k++) { const a0 = f[k], b0 = f[(k + 1) % 3];
      if (edgeFaces.get(ekey(a0, b0)).some((g) => owner[g] === -1)) next.set(wid[a0], { a: a0, b: b0, q: wid[b0] }); } });
    const seen = new Set(), loops = [];
    for (const [start] of next) { if (seen.has(start)) continue; const loop = []; let cur = start;
      while (next.has(cur) && !seen.has(cur)) { seen.add(cur); const e = next.get(cur); loop.push(e); cur = e.q; } if (loop.length >= 3) loops.push(loop); }
    let capT = 0;
    for (const loop of loops) {
      const pts = loop.map((e) => V(e.a)), nn = [0, 0, 0];   // Newell normal: the loop runs counter-clockwise around it
      for (let k = 0; k < pts.length; k++) { const A = pts[k], B = pts[(k + 1) % pts.length]; nn[0] += (A[1] - B[1]) * (A[2] + B[2]); nn[1] += (A[2] - B[2]) * (A[0] + B[0]); nn[2] += (A[0] - B[0]) * (A[1] + B[1]); }
      const ln = Math.hypot(...nn) || 1, nz = nn.map((x) => x / ln), ref = Math.abs(nz[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      let e1 = [ref[1] * nz[2] - ref[2] * nz[1], ref[2] * nz[0] - ref[0] * nz[2], ref[0] * nz[1] - ref[1] * nz[0]]; const l1 = Math.hypot(...e1); e1 = e1.map((x) => x / l1);
      const e2 = [nz[1] * e1[2] - nz[2] * e1[1], nz[2] * e1[0] - nz[0] * e1[2], nz[0] * e1[1] - nz[1] * e1[0]];
      const tris = earClip(pts.map((p) => [p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2], p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2]]));
      // the cap's colour: the most common colour along the loop (texels bucketed 16 levels per channel; the biggest bucket is the base
      // fur, not a stripe, an eye or a mean between them), at the loop vertex nearest that bucket's mean
      const cs = loop.map((e) => col(e.a)), buckets = new Map();
      cs.forEach((c, q) => { const k = (c[0] >> 4) * 256 + (c[1] >> 4) * 16 + (c[2] >> 4); (buckets.get(k) ?? buckets.set(k, []).get(k)).push(q); });
      const top = [...buckets.values()].sort((x, y) => y.length - x.length)[0], mean = [0, 1, 2].map((k) => top.reduce((s, q) => s + cs[q][k], 0) / top.length);
      let best = top[0], bd = Infinity; for (const q of top) { const c = cs[q], dd = Math.hypot(c[0] - mean[0], c[1] - mean[1], c[2] - mean[2]); if (dd < bd) { bd = dd; best = q; } }
      const uv0 = [uv2[loop[best].a * 2], uv2[loop[best].a * 2 + 1]];
      // the body's cap faces the part (+nz, along the loop), the part's faces the body (-nz, against its boundary edges)
      for (const [g, off, n, flip] of [[parts[j], pt.pivot, nz.map((x) => -x), true], [body, O, nz, false]]) {
        const ids = pts.map((p) => fresh(g, p, n, uv0, off));
        for (const [i0, i1, i2] of tris) g.ix.push(ids[i0], flip ? ids[i2] : ids[i1], flip ? ids[i1] : ids[i2]); }
      capT += tris.length;
    }
    const pa = parts[j], pp = doc.createPrimitive().setMaterial(srcMat).setAttribute('POSITION', acc('VEC3', new Float32Array(pa.p))).setAttribute('NORMAL', acc('VEC3', new Float32Array(pa.n)))
      .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(pa.u))).setIndices(acc('SCALAR', new Uint32Array(pa.ix)));
    node.addChild(doc.createNode(pt.name).setTranslation(pt.pivot).setMesh(doc.createMesh(ID + '_' + pt.name.toLowerCase()).addPrimitive(pp)));
    console.log('part', pt.name, 'pivot', pt.pivot.join(', '), pt.cuts.length ? 'cuts ' + pt.cuts.map((c) => c.n.map((v) => v.toFixed(3)).join(',')).join(' | ') : 'centroid boxes', 'faces', pa.ix.length / 3 - capT, '+ cap', capT, 'in', loops.length, 'loop(s)');
  });
  console.log('parts: split', split, 'triangles on the cut planes; stranded faces moved to a part', toPart, ', back to the body', toBody);
  prim.setAttribute('POSITION', acc('VEC3', new Float32Array(body.p))).setAttribute('NORMAL', acc('VEC3', new Float32Array(body.n))).setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(body.u))).setIndices(acc('SCALAR', new Uint32Array(body.ix)));
  pos.dispose(); nor.dispose(); uv.dispose();
}

// the porch lamp: a hanging lantern whose glass is centred on the PorchLight empty, hung from the first surface above it (a ray up
// through the model's own faces: the awning). Glass = its own UNTEXTURED `Glow`; frame = flat dark iron (`PorchLamp`)
function addPorchLamp(PL) {
  let up = Infinity;   // ray +Y from the empty (Moller-Trumbore), up to 0.6 u
  for (let t = 0; t < T; t++) { const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const p = [e2[2], 0, -e2[0]], det = e1[0] * p[0] + e1[2] * p[2]; if (Math.abs(det) < 1e-12) continue;   // p = (0,1,0) x e2
    const s = [PL[0] - P[a], PL[1] - P[a + 1], PL[2] - P[a + 2]], u = (s[0] * p[0] + s[2] * p[2]) / det; if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], v = q[1] / det; if (v < 0 || u + v > 1) continue;
    const d = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det; if (d > 1e-4 && d < up) up = d; }
  const KNOB = 0.12, yU = up <= 0.6 ? PL[1] + up : PL[1] + KNOB + 0.1;   // (nothing above: a short rod)
  const C = [PL[0], Math.min(PL[1], yU - KNOB), PL[2]];   // glass centre: on the empty (lowered only if the awning is closer)
  const lin = (h) => [1, 3, 5].map((k) => { const x = parseInt(h.slice(k, k + 2), 16) / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  const frame = { p: [], n: [], i: [] }, glass = { p: [], n: [], i: [] };
  const quad = (g, A, B, Cc, D) => { const b = g.p.length / 3, u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    for (const V of [A, B, Cc, D]) { g.p.push(...V); g.n.push(...n); } g.i.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  const tri = (g, A, B, Cc) => { const b = g.p.length / 3, u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    for (const V of [A, B, Cc]) { g.p.push(...V); g.n.push(...n); } g.i.push(b, b + 1, b + 2); };
  const box = (g, x0, x1, y0, y1, z0, z1) => {   // axis-aligned, outward faces (CCW seen from outside)
    quad(g, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]); quad(g, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    quad(g, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]); quad(g, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    quad(g, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]); quad(g, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]); };
  const pyr = (g, h, y0, apex) => {   // square pyramid: base half-size h at y0, apex at y = apex (up or down), side faces only
    const c4 = [[-h, -h], [h, -h], [h, h], [-h, h]], A = [0, apex, 0];
    for (let k = 0; k < 4; k++) { const [x0, z0] = c4[k], [x1, z1] = c4[(k + 1) % 4]; if (apex > y0) tri(g, [x1, y0, z1], [x0, y0, z0], A); else tri(g, [x0, y0, z0], [x1, y0, z1], A); } };
  const GH = 0.045, GW = 0.0375;
  box(glass, -GW, GW, -GH, GH, -GW, GW);                                                  // glass (Glow)
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(frame, sx * GW - 0.007, sx * GW + 0.007, -GH, GH, sz * GW - 0.007, sz * GW + 0.007);   // corner posts
  box(frame, -0.05, 0.05, -GH - 0.015, -GH, -0.05, 0.05);                                  // base plate
  pyr(frame, 0.03, -GH - 0.015, -GH - 0.04);                                               // drip finial
  box(frame, -0.055, 0.055, GH, GH + 0.015, -0.055, 0.055);                                // top rim
  pyr(frame, 0.06, GH + 0.015, GH + 0.06);                                                 // cap
  box(frame, -0.012, 0.012, 0.1, KNOB, -0.012, 0.012);                                     // knob
  box(frame, -0.006, 0.006, KNOB, yU - C[1] + 0.01, -0.006, 0.006);                       // rod up into the awning
  const mk = (g, mat) => doc.createPrimitive().setMaterial(mat).setAttribute('POSITION', acc('VEC3', new Float32Array(g.p))).setAttribute('NORMAL', acc('VEC3', new Float32Array(g.n))).setIndices(acc('SCALAR', new Uint16Array(g.i)));
  const fm = doc.createMaterial('PorchLamp').setBaseColorFactor([...lin('#3E352B'), 1]).setMetallicFactor(0).setRoughnessFactor(0.85);   // DeepWarmInk iron
  const gm = doc.createMaterial('Glow').setBaseColorFactor([...lin('#F3D9A4'), 1]).setEmissiveFactor([0.466, 0.361, 0.171]).setMetallicFactor(0).setRoughnessFactor(0.6);   // ASSETS Glow base colour, the wall Glow's emissive
  const lm = doc.createMesh('PorchLamp').addPrimitive(mk(frame, fm)).addPrimitive(mk(glass, gm));
  root.listScenes()[0].addChild(doc.createNode('PorchLamp').setTranslation(C).setMesh(lm));
  console.log('porch lamp: glass centre', C.map((v) => v.toFixed(3)).join(', '), up <= 0.6 ? `hung from y ${yU.toFixed(3)} (rod ${(yU - C[1] - KNOB).toFixed(3)})` : 'NOTHING above within 0.6 u: short rod',
    'tris', (frame.i.length + glass.i.length) / 3);
}

// ---- 8. windmill: the hub (axle end on +Z) and a `Blades` node there, 4 procedural sails spinning on local Z ----
let bladesInfo = null;
if (WINDMILL) {
  const top = (i) => P[i * 3 + 1] >= 0.55 * HT && P[i * 3 + 1] <= 0.95 * HT, front = (i) => Math.abs(Math.atan2(P[i * 3] - CX, P[i * 3 + 2] - CZ)) < 15 * Math.PI / 180;
  let zt = -Infinity; for (let i = 0; i < N; i++) if (top(i) && front(i)) zt = Math.max(zt, P[i * 3 + 2]);
  const end = []; for (let i = 0; i < N; i++) if (top(i) && front(i) && P[i * 3 + 2] > zt - 0.06) end.push(i);
  const hx = end.reduce((s, i) => s + P[i * 3], 0) / end.length, hy = end.reduce((s, i) => s + P[i * 3 + 1], 0) / end.length;
  const R = +opt('bladeR', 1.7), PIV = [hx, hy, zt + 0.03], g = makeBlades(R);
  const bm = doc.createMaterial('Blades').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.95);
  const bp = doc.createPrimitive().setMaterial(bm).setAttribute('POSITION', acc('VEC3', g.p)).setAttribute('NORMAL', acc('VEC3', g.n)).setAttribute('COLOR_0', acc('VEC3', g.c)).setIndices(acc('SCALAR', g.i));
  node.addChild(doc.createNode('Blades').setTranslation(PIV).setMesh(doc.createMesh('Blades').addPrimitive(bp)));
  bladesInfo = { pivot: PIV, radius: R, tris: g.i.length / 3 };
  console.log('hub: axle end z', zt.toFixed(2), 'from', end.length, 'verts; Blades pivot', PIV.map((v) => v.toFixed(2)).join(', '), 'radius', R, 'tris', g.i.length / 3);
}

// ---- 9. --compact: 16-bit indices (every primitive whose largest index < 65535, the restart value) and TEXCOORD_0 as normalised
//      16-bit (only if every UV is inside 0..1); core glTF, so the game's plain GLTFLoader reads it as before ----
if (has('compact')) {
  let ni = 0, nu = 0; const seenUV = new Set();
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const ix = p.getIndices(); if (ix && !(ix.getArray() instanceof Uint16Array)) { const arr = ix.getArray(); let hiI = 0; for (const v of arr) if (v > hiI) hiI = v; if (hiI < 65535) { ix.setArray(Uint16Array.from(arr)); ni++; } }
    const ua = p.getAttribute('TEXCOORD_0'); if (!ua || seenUV.has(ua) || ua.getNormalized()) continue; seenUV.add(ua);
    const arr = ua.getArray(); if (arr.some((v) => !(v >= 0 && v <= 1))) { console.log('compact: UVs outside 0..1, TEXCOORD_0 kept float'); continue; }
    ua.setArray(Uint16Array.from(arr, (v) => Math.round(v * 65535))).setNormalized(true); nu++; }
  console.log('compact:', ni, 'index accessors -> 16-bit,', nu, 'TEXCOORD_0 -> normalised 16-bit');
}

await io.write(OUT, doc);
if (has('maxKB')) {   // --maxKB: step the albedo's JPEG quality down by 5 until the file fits; q70 is the floor (ART-BIBLE §D.3)
  const CAP = +opt('maxKB'), Q_MIN = 70; let q = Q;
  while (fs.statSync(OUT).size / 1024 > CAP && q - 5 >= Q_MIN) {
    q -= 5; tex.setImage(new Uint8Array(jpeg.encode({ data: AL.d, width: AL.w, height: AL.h }, q).data)); await io.write(OUT, doc); }
  const kb = fs.statSync(OUT).size / 1024;
  if (kb > CAP) { console.error(`maxKB: ${kb.toFixed(1)} KB > ${CAP} KB even at q${q} (the floor is q${Q_MIN}): fix the geometry or the texture size`); process.exit(2); }
  console.log(`maxKB: q${Q} -> q${q}, ${kb.toFixed(1)} KB <= ${CAP} KB`);
}
const outKB = Math.round(fs.statSync(OUT).size / 1024);
console.log('wrote', OUT, outKB + ' KB');
// summary for the README table (re-read: what the file really holds)
{ const d2 = await io.read(OUT), r2 = d2.getRoot(); let tris = 0; const mn2 = [Infinity, Infinity, Infinity], mx2 = [-Infinity, -Infinity, -Infinity];
  for (const n of r2.listNodes()) { const m = n.getMesh(); if (!m) continue; const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) { tris += p.getIndices().getCount() / 3; const A = p.getAttribute('POSITION'); for (let i = 0; i < A.getCount(); i++) { A.getElement(i, e);
      const v = [w[0] * e[0] + w[4] * e[1] + w[8] * e[2] + w[12], w[1] * e[0] + w[5] * e[1] + w[9] * e[2] + w[13], w[2] * e[0] + w[6] * e[1] + w[10] * e[2] + w[14]];
      for (let k = 0; k < 3; k++) { mn2[k] = Math.min(mn2[k], v[k]); mx2[k] = Math.max(mx2[k], v[k]); } } } }
  console.log('RESULT ' + JSON.stringify({ id: ID, tris, kb: outKB, tex: r2.listTextures().map((t) => t.getName() + ' ' + t.getSize().join('x')), materials: r2.listMaterials().map((m) => m.getName()),
    nodes: r2.listNodes().map((n) => n.getName()), min: mn2.map((v) => +v.toFixed(3)), max: mx2.map((v) => +v.toFixed(3)), blades: bladesInfo })); }

// 4 sails in the XY plane (spin axis = local +Z, hub at the origin): a dark timber stock per arm, a light timber lattice frame on its
// trailing side and a cream canvas panel behind the battens; flat-shaded boxes (no paper-thin faces), linear vertex colours
function makeBlades(R) {
  const lin = (h) => [1, 3, 5].map((k) => { const c = parseInt(h.slice(k, k + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  const DARK = lin('#6b4b33'), WOOD = lin('#a9825d'), CANVAS = lin('#efe4cc'), CANVAS2 = lin('#e2d3b4');
  const p = [], n = [], c = [], ix = [];
  // an oriented box: centre o (in the arm's frame: r along the arm, s across it, z out of the plane), half-sizes, colour fn(face, corner)
  const box = (th, r0, r1, s0, s1, z0, z1, col) => {
    const ca = Math.cos(th), sa = Math.sin(th), X = (r, s) => [r * ca - s * sa, r * sa + s * ca];
    const C = [[r0, s0, z0], [r1, s0, z0], [r1, s1, z0], [r0, s1, z0], [r0, s0, z1], [r1, s0, z1], [r1, s1, z1], [r0, s1, z1]].map(([r, s, z]) => [...X(r, s), z]);
    const F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
    for (const f of F) { const b = p.length / 3, A = C[f[0]], B = C[f[1]], D = C[f[2]];
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = D[0] - A[0], vy = D[1] - A[1], vz = D[2] - A[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      f.forEach((k, q) => { p.push(...C[k]); n.push(nx, ny, nz); c.push(...col(C[k], q)); });
      ix.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  };
  const flat = (k) => () => k;
  for (let a = 0; a < 4; a++) {
    const th = Math.PI / 4 + a * Math.PI / 2;
    box(th, 0.06, R, -0.045, 0.045, 0.02, 0.1, flat(DARK));                                 // the stock (spar)
    const s0 = 0.05, s1 = 0.05 + 0.36 * Math.min(1, R / 1.7) + 0.06, r0 = 0.36 * R / 1.7, r1 = R - 0.03;
    box(th, r0, r1, s1 - 0.035, s1, 0.035, 0.085, flat(WOOD));                              // outer rail
    box(th, r0 - 0.02, r0 + 0.02, s0, s1, 0.035, 0.085, flat(WOOD));                        // inner end batten
    const nb = 6; for (let k = 1; k <= nb; k++) { const r = r0 + (r1 - r0) * k / nb; box(th, r - 0.018, r + 0.018, s0, s1, 0.04, 0.08, flat(WOOD)); }   // battens
    box(th, r0 + 0.02, r1 - 0.01, s0 + 0.005, s1 - 0.03, 0.0, 0.03, (v) => {                 // canvas: a touch warmer / darker toward the hub
      const t = Math.min(1, Math.max(0, (Math.hypot(v[0], v[1]) - r0) / (r1 - r0))); return CANVAS2.map((x, k) => x + (CANVAS[k] - x) * (0.35 + 0.65 * t)); });
  }
  // hub: an octagonal boss in front of the stocks
  const hb = p.length / 3, hr = 0.14, z0 = 0.0, z1 = 0.16;
  for (let k = 0; k < 8; k++) { const t0 = k / 8 * Math.PI * 2, t1 = (k + 1) / 8 * Math.PI * 2, tm = (t0 + t1) / 2, b = p.length / 3;
    p.push(Math.cos(t0) * hr, Math.sin(t0) * hr, z0, Math.cos(t1) * hr, Math.sin(t1) * hr, z0, Math.cos(t1) * hr, Math.sin(t1) * hr, z1, Math.cos(t0) * hr, Math.sin(t0) * hr, z1);
    for (let q = 0; q < 4; q++) { n.push(Math.cos(tm), Math.sin(tm), 0); c.push(...DARK); } ix.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  const cb = p.length / 3; p.push(0, 0, z1 + 0.02); n.push(0, 0, 1); c.push(...WOOD);
  for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2; p.push(Math.cos(t) * hr, Math.sin(t) * hr, z1); n.push(0, 0, 1); c.push(...WOOD); }
  for (let k = 0; k < 8; k++) ix.push(cb, cb + 1 + k, cb + 1 + (k + 1) % 8);
  void hb;
  return { p: new Float32Array(p), n: new Float32Array(n), c: new Float32Array(c), i: new Uint32Array(ix) };
}
