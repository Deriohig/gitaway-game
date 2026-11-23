// rig-checks.mjs -- AR1-AR7, the animal rig contract (art/specs/2026-10-24-animal-rigs-plan.md: Global Constraints, Review Focus).
// Each check is (rig, entry, src, probe?) => Promise<string[]>, empty = pass: rig from loadRig, entry its rigs.json entry, src the
// unrigged model it was built from (loadSource), probe Blender's <id>.probe.json (AR7). Proven on fixtures by tests/rigs.test.mjs
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { boxOf, poseAt, rigId } from './rig-inspect.mjs';
import { RIG_EXTRA_TRIS, RIG_KB } from './asset-contract.mjs';

const FPS = 30;
const FORWARD = { '+Z': [0, 0, 1], '+X': [1, 0, 0] }, LEFT = { '+Z': [1, 0, 0], '+X': [0, 0, -1] };   // left = up x forward
const f3 = (v) => v.toFixed(3), f4 = (v) => v.toFixed(4);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = (P, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]];
const dist = (P, i, Q, j) => Math.hypot(P[3 * i] - Q[3 * j], P[3 * i + 1] - Q[3 * j + 1], P[3 * i + 2] - Q[3 * j + 2]);
const maxDist = (P, Q) => { let d = 0; for (let i = 0; i < P.length / 3; i++) d = Math.max(d, dist(P, i, Q, i)); return d; };
const sameSet = (a, b) => { const A = new Set(a), B = new Set(b); return A.size === a.length && A.size === B.size && [...A].every((x) => B.has(x)); };
const setDiff = (a, b) => { const x = a.filter((n) => !b.includes(n)), y = b.filter((n) => !a.includes(n)); return `${x.length ? 'extra ' + x.join(',') : ''}${x.length && y.length ? '; ' : ''}${y.length ? 'missing ' + y.join(',') : ''}` || 'duplicates'; };
const side = (name) => (/(^|_)[FB]?L(_|$)/.test(name) ? 1 : /(^|_)[FB]?R(_|$)/.test(name) ? -1 : 0);   // ear_L, leg_FL_1, leg_L_2: left

function joints(rig) {   // joint name -> model-space position at the default pose (the joint nodes' TRS)
  const names = new Set(rig.bones), J = new Map();
  for (const n of rig.doc.getRoot().listNodes()) if (names.has(n.getName())) { const w = n.getWorldMatrix(); J.set(n.getName(), [w[12], w[13], w[14]]); }
  return J;
}
function dominant(rig) {   // per vertex: the joint with its largest weight
  const { skinIndex: I, skinWeight: W } = rig.mesh.geometry.attributes, out = [];
  const comp = (A, i, c) => (c === 0 ? A.getX(i) : c === 1 ? A.getY(i) : c === 2 ? A.getZ(i) : A.getW(i));
  for (let i = 0; i < I.count; i++) { let k = 0; for (let c = 1; c < 4; c++) if (comp(W, i, c) > comp(W, i, k)) k = c; out.push(rig.bones[comp(I, i, k)]); }
  return out;
}
function weightOn(rig, names) {   // per vertex: its total weight on the joints named
  const { skinIndex: I, skinWeight: W } = rig.mesh.geometry.attributes, set = new Set(names), out = [];
  for (let i = 0; i < I.count; i++) {
    out.push([[I.getX(i), W.getX(i)], [I.getY(i), W.getY(i)], [I.getZ(i), W.getZ(i)], [I.getW(i), W.getW(i)]]
      .reduce((s, [j, w]) => s + (set.has(rig.bones[j]) ? w : 0), 0));
  }
  return out;
}
function nearest(P, i, Q) {   // [index, distance] of Q's vertex nearest P's vertex i
  let best = -1, d2 = Infinity; const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
  for (let j = 0; j < Q.length; j += 3) { const d = (Q[j] - x) ** 2 + (Q[j + 1] - y) ** 2 + (Q[j + 2] - z) ** 2; if (d < d2) { d2 = d; best = j / 3; } }
  return [best, Math.sqrt(d2)];
}

// AR1 contract: joints = entry bones, no dots, <= 24 joints, one 4-weight set summing to 1, one skinned mesh node / primitive / material
// named <id>, core glTF, no morph targets, the source's image bytes, live / lids / restChanged inside bones, each _L joint left of
// its _R partner (ear_L of ear_R, leg_FL_1 of leg_FR_1; the curled cat lies off its box centre) and a joint without one left of
// the source's box centre (_R right)
async function AR1(rig, entry, src) {
  const e = [], R = rig.doc.getRoot(), id = rigId(entry);
  if (!sameSet(rig.bones, entry.bones)) e.push(`joints != entry bones (${setDiff(rig.bones, entry.bones)})`);
  const dotted = R.listNodes().map((n) => n.getName()).filter((n) => n.includes('.'));
  if (dotted.length) e.push(`dots in node names (three strips them): ${dotted.join(', ')}`);
  if (rig.bones.length > 24) e.push(`${rig.bones.length} joints > 24`);
  const meshNodes = R.listNodes().filter((n) => n.getMesh()), prims = R.listMeshes().flatMap((m) => m.listPrimitives());
  if (meshNodes.length !== 1 || !meshNodes[0].getSkin()) e.push(`${meshNodes.length} mesh nodes (want one, skinned)`);
  if (prims.length !== 1) e.push(`${prims.length} primitives (want one)`);
  const p = prims[0];
  if (p) {
    const sets = p.listSemantics().filter((s) => /^(JOINTS|WEIGHTS)_/.test(s)).sort();
    if (sets.join() !== 'JOINTS_0,WEIGHTS_0') e.push(`skin attributes ${sets.join(',') || 'none'} (want JOINTS_0 + WEIGHTS_0)`);
    const W = p.getAttribute('WEIGHTS_0'), w = [0, 0, 0, 0];
    let off = 0, worst = 0;
    for (let i = 0; W && i < W.getCount(); i++) { W.getElement(i, w); const d = Math.abs(w[0] + w[1] + w[2] + w[3] - 1); if (d > 1e-3) off++; worst = Math.max(worst, d); }
    if (off) e.push(`${off} vertices' weights do not sum to 1 (worst off by ${f4(worst)})`);
    const m = p.getMaterial();
    if (R.listMaterials().length !== 1 || !m || m.getName() !== id) e.push(`materials ${R.listMaterials().map((x) => x.getName()).join(',')} (want one, named ${id})`);
    if (p.listTargets().length) e.push(`${p.listTargets().length} morph targets`);
  }
  const ext = [...new Set([...(rig.json.extensionsUsed || []), ...(rig.json.extensionsRequired || [])])];
  if (ext.length) e.push(`extensions ${ext.join(', ')}`);
  const nTex = R.listTextures().length;
  if (nTex !== 1) e.push(`${nTex} images (want the source's one)`);
  else if (Buffer.compare(Buffer.from(rig.imageBytes), Buffer.from(src.imageBytes)) !== 0) e.push(`image bytes differ from the source's (${rig.imageBytes.length} vs ${src.imageBytes.length} B)`);
  for (const k of ['live', 'lids', 'restChanged']) { const out = (entry[k] || []).filter((b) => !entry.bones.includes(b)); if (out.length) e.push(`${k} not in bones: ${out.join(', ')}`); }
  const L = LEFT[entry.facing], J = joints(rig);
  if (!L) e.push(`facing ${entry.facing} (want +Z or +X)`);
  else for (const [name, q] of J) {
    const s = side(name), mate = s && name.replace(s > 0 ? /(^|_)([FB]?)L(_|$)/ : /(^|_)([FB]?)R(_|$)/, `$1$2${s > 0 ? 'R' : 'L'}$3`);
    const ref = J.get(mate) || src.box.c, d = dot([q[0] - ref[0], q[1] - ref[1], q[2] - ref[2]], L);
    if (s && s * d <= 0) e.push(`${name} is on the animal's ${d > 0 ? 'left' : d < 0 ? 'right' : 'midline'}${J.has(mate) ? ` of ${mate}` : ''}`);
  }
  return e;
}

// AR2 clips: names / durations as the entry, loops close, once starts + ends and hold starts at the default pose, root never
// animated, and the body's translation within limits: every direct child joint of root (ruling R19: hips for the quadrupeds,
// spine for the cat), measured in model axes, within +-0.05 u of its default in x and z (root-motion drift is horizontal) and
// within -0.20..+0.10 u in y (ruling R15: Sit / Lie / Sleep lower the body onto the ground, a hop lifts it)
const BODY_XZ = 0.05, BODY_DOWN = 0.20, BODY_UP = 0.10;
async function AR2(rig, entry) {
  const e = [], want = Object.keys(entry.clips), have = rig.clips.map((c) => c.name), rest = poseAt(rig, null, 0);
  const rootNode = rig.doc.getRoot().listNodes().find((n) => n.getName() === 'root');
  const body = new Set(rootNode ? rootNode.listChildren().map((n) => n.getName()).filter((n) => rig.bones.includes(n)) : []);
  if (!sameSet(have, want)) e.push(`clips != entry clips (${setDiff(have, want)})`);
  for (const c of rig.clips) {
    const E = entry.clips[c.name]; if (!E) continue;
    if (Math.abs(c.duration - E.duration) > 1 / FPS + 1e-6) e.push(`${c.name} lasts ${f3(c.duration)} s, the entry says ${E.duration}`);
    const first = poseAt(rig, c.name, 0);
    if (E.type === 'loop') { const d = maxDist(first, poseAt(rig, c.name, c.duration)); if (d > 1e-4) e.push(`${c.name} (loop) ends ${f4(d)} u off its first frame`); }
    else if (E.type === 'once' || E.type === 'hold') {
      const d = maxDist(first, rest); if (d > 1e-3) e.push(`${c.name} (${E.type}) starts ${f4(d)} u off the default pose`);
      const d2 = E.type === 'once' ? maxDist(poseAt(rig, c.name, c.duration), rest) : 0; if (d2 > 1e-3) e.push(`${c.name} (once) ends ${f4(d2)} u off the default pose`);
    } else e.push(`${c.name}: type ${E.type} (want loop, hold or once)`);
  }
  for (const a of rig.doc.getRoot().listAnimations()) {
    const rootPaths = [];
    for (const ch of a.listChannels()) {
      const n = ch.getTargetNode(), name = n && n.getName();
      if (name === 'root') rootPaths.push(ch.getTargetPath());
      if (body.has(name) && ch.getTargetPath() === 'translation') {
        const out = ch.getSampler().getOutput(), d0 = n.getTranslation(), v = [0, 0, 0], p = n.getParentNode();
        const W = p ? p.getWorldMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];   // the offset in model axes
        let xz = 0, lo = 0, hi = 0;
        for (let k = 0; k < out.getCount(); k++) {
          out.getElement(k, v);
          const d = [0, 1, 2].map((j) => v[j] - d0[j]), m = [0, 1, 2].map((r) => W[r] * d[0] + W[4 + r] * d[1] + W[8 + r] * d[2]);
          xz = Math.max(xz, Math.abs(m[0]), Math.abs(m[2])); lo = Math.min(lo, m[1]); hi = Math.max(hi, m[1]);
        }
        if (xz > BODY_XZ) e.push(`${a.getName()} moves ${name} ${f3(xz)} u sideways or along from its default (> ${BODY_XZ})`);
        if (lo < -BODY_DOWN - 1e-6 || hi > BODY_UP + 1e-6) e.push(`${a.getName()} moves ${name} ${f3(lo < -BODY_DOWN ? lo : hi)} u in y (want ${-BODY_DOWN}..+${BODY_UP})`);
      }
    }
    if (rootPaths.length) e.push(`${a.getName()} animates root (${rootPaths.join(', ')})`);
  }
  return e;
}

// AR3 default pose: two-way nearest vertex <= 0.005 u to the source, bounds +-3 % per axis (ruling R5: only y when restChanged
// is set), ground +-0.005, the head joint on the facing side, every lid vertex on its joint. The nearest-vertex test skips a
// vertex with >= 0.2 of its weight on restChanged joints (ruling R10: the dog's straightened neck carries the shoulders beside
// it a few mm) or dominated by a lid joint, and a source vertex whose nearest rig vertex is skipped
async function AR3(rig, entry, src) {
  const e = [], P = poseAt(rig, null, 0), n = P.length / 3, S = src.positions, dom = dominant(rig);
  const moved = weightOn(rig, entry.restChanged || []), lids = new Set(entry.lids || []);
  const kept = (i) => moved[i] < 0.2 && !lids.has(dom[i]);
  let bad = 0, worst = 0;
  for (let i = 0; i < n; i++) if (kept(i)) { const d = nearest(P, i, S)[1]; if (d > 0.005) bad++; worst = Math.max(worst, d); }
  if (bad) e.push(`${bad} rig vertices > 0.005 u from the source (worst ${f4(worst)})`);
  bad = 0; worst = 0;
  for (let j = 0; j < S.length / 3; j++) {   // a source vertex whose nearest rig vertex is a skipped one is skipped too
    const [i, d] = nearest(S, j, P); if (!kept(i)) continue;
    if (d > 0.005) bad++; worst = Math.max(worst, d);
  }
  if (bad) e.push(`${bad} source vertices > 0.005 u from the rig (worst ${f4(worst)})`);
  const B = boxOf(P);
  for (const k of (entry.restChanged || []).length ? [1] : [0, 1, 2]) {
    const r = B.size[k] / src.box.size[k] - 1;
    if (Math.abs(r) > 0.03) e.push(`${'xyz'[k]} size ${f3(B.size[k])} vs the source's ${f3(src.box.size[k])} (${(100 * r).toFixed(1)} %)`);
  }
  if (Math.abs(B.mn[1] - src.box.mn[1]) > 0.005) e.push(`ground y ${f4(B.mn[1])} vs the source's ${f4(src.box.mn[1])}`);
  const J = joints(rig), F = FORWARD[entry.facing], h = J.get('head');
  if (!F) e.push(`facing ${entry.facing} (want +Z or +X)`);
  else if (!h) e.push('no head joint');
  else if (dot([h[0] - B.c[0], h[1] - B.c[1], h[2] - B.c[2]], F) <= 0) e.push(`the head joint is not on the ${entry.facing} side of the box centre`);
  bad = 0; worst = 0;
  for (let i = 0; i < n; i++) {
    if (!(entry.lids || []).includes(dom[i])) continue;
    const q = J.get(dom[i]), d = Math.hypot(P[3 * i] - q[0], P[3 * i + 1] - q[1], P[3 * i + 2] - q[2]);
    if (d > 0.002) bad++; worst = Math.max(worst, d);
  }
  if (bad) e.push(`${bad} lid vertices show at the default pose (up to ${f4(worst)} u from their joint; open lids are scale 0)`);
  return e;
}

// AR4 stretch: at every 1/30 s of every clip, no edge longer than 1.6x its default length, no seam opening: vertices that
// coincide at the default pose (glTF splits them at UV seams and hard edges) stay within 0.002 u (ruling R9; lid caps left out),
// and no loose shell drifting: each vertex of a piece of at most LOOSE distinct vertices joined to nothing (a whisker) keeps
// within 0.002 u of its default-pose distance to the shell's root, the nearest vertex of the rest of the mesh (ruling R23). A
// piece hung only on bones that dominate none of the rest (a limb modelled apart, like the fixtures' box legs) is left out
const LOOSE = 32;   // as art/blender/rigs/common.py's LOOSE
async function AR4(rig, entry) {
  const e = [], D = poseAt(rig, null, 0), ix = rig.mesh.geometry.index, n = D.length / 3, seen = new Set(), edges = [], seams = [];
  const tri = ix ? ix.array : Array.from({ length: n }, (_, i) => i);
  for (let t = 0; t < tri.length; t += 3) for (const [a, b] of [[tri[t], tri[t + 1]], [tri[t + 1], tri[t + 2]], [tri[t + 2], tri[t]]]) {
    const key = Math.min(a, b) * n + Math.max(a, b), l0 = dist(D, a, D, b);
    // edges under 1e-4 u at the default pose are left out: the open lid caps are collapsed to a point there
    if (!seen.has(key) && l0 >= 1e-4) edges.push([a, b, l0]);
    seen.add(key);
  }
  const dom = dominant(rig), lid = (i) => (entry.lids || []).includes(dom[i]), byX = Array.from({ length: n }, (_, i) => i).sort((a, b) => D[3 * a] - D[3 * b]);
  for (let s = 0; s < n; s++) for (let u = s + 1; u < n && D[3 * byX[u]] - D[3 * byX[s]] <= 1e-5; u++) {
    const a = byX[s], b = byX[u];
    if (!lid(a) && !lid(b) && dist(D, a, D, b) <= 1e-5) seams.push([a, b]);
  }
  // loose shells: pieces joined by triangle edges and coincident vertices (a cluster counted once), lid caps left out
  const par = Array.from({ length: n }, (_, i) => i), find = (x) => (par[x] === x ? x : (par[x] = find(par[x]))), twin = new Set();
  for (let t = 0; t < tri.length; t += 3) { par[find(tri[t + 1])] = find(tri[t]); par[find(tri[t + 2])] = find(tri[t]); }
  for (const [a, b] of seams) { par[find(b)] = find(a); twin.add(Math.max(a, b)); }
  const pieces = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!pieces.has(r)) pieces.set(r, []); pieces.get(r).push(i); }
  let loose = [...pieces.values()].filter((p) => !p.some(lid) && p.filter((i) => !twin.has(i)).length <= LOOSE);
  const inLoose = new Set(loose.flat()), main = Array.from({ length: n }, (_, i) => i).filter((i) => !inLoose.has(i) && !lid(i));
  // a piece whose bones carry nothing of the rest of the mesh is a part that moves on its own (the fixtures' box legs), not a decal
  const carried = new Set(main.map((i) => dom[i]));
  loose = loose.filter((p) => p.some((i) => carried.has(dom[i])));
  const roots = main.length ? loose.map((p) => {   // [shell, its root, each shell vertex's default distance to the root]
    let best = [Infinity, -1];
    for (const v of p) for (const m of main) { const d = dist(D, v, D, m); if (d < best[0]) best = [d, m]; }
    return [p, best[1], p.map((v) => dist(D, v, D, best[1]))];
  }) : [];
  for (const c of rig.clips) {
    let worst = 0, when = 0, gap = 0, gapAt = 0, drift = 0, driftAt = 0, drifter = -1;
    for (let k = 0, N = Math.round(c.duration * FPS); k <= N; k++) {
      const t = Math.min(k / FPS, c.duration), P = poseAt(rig, c.name, t);
      for (const [a, b, l0] of edges) { const r = dist(P, a, P, b) / l0; if (r > worst) { worst = r; when = t; } }
      for (const [a, b] of seams) { const d = dist(P, a, P, b); if (d > gap) { gap = d; gapAt = t; } }
      for (const [p, m, d0] of roots) p.forEach((v, j) => { const d = Math.abs(dist(P, v, P, m) - d0[j]); if (d > drift) { drift = d; driftAt = t; drifter = v; } });
    }
    if (worst > 1.6) e.push(`${c.name}: an edge stretches to ${worst.toFixed(2)}x its default length at ${f3(when)} s`);
    if (gap > 0.002) e.push(`${c.name}: a seam opens ${f4(gap)} u at ${f3(gapAt)} s (vertices together at the default pose come apart)`);
    if (drift > 0.002) e.push(`${c.name}: a loose shell drifts ${f4(drift)} u from its root at ${f3(driftAt)} s (its vertex at ${at(D, drifter).map(f3).join(', ')})`);
  }
  return e;
}

// AR5 stride (entries with a Walk stride): each foot (the lowest default-pose vertex mostly on a leg_*_2) moves backward over its
// stance frames (foot y <= its lowest + 0.01) at stride / duration, +-10 %
async function AR5(rig, entry) {
  const W = entry.clips && entry.clips.Walk;
  if (!W || W.stride === undefined) return [];
  const c = rig.clips.find((x) => x.name === 'Walk');
  if (!c) return ['no Walk clip'];
  const e = [], D = poseAt(rig, null, 0), dom = dominant(rig), F = FORWARD[entry.facing], want = W.stride / W.duration, frames = [];
  const legs = [...new Set(dom)].filter((b) => /^leg_.*_2$/.test(b)).sort();
  if (!legs.length) return ['no leg_*_2 joint carries vertices'];
  for (let k = 0, N = Math.round(c.duration * FPS); k <= N; k++) frames.push(poseAt(rig, 'Walk', Math.min(k / FPS, c.duration)));
  for (const leg of legs) {
    let foot = -1;
    for (let i = 0; i < dom.length; i++) if (dom[i] === leg && (foot < 0 || D[3 * i + 1] < D[3 * foot + 1])) foot = i;
    const y = frames.map((P) => P[3 * foot + 1]), fwd = frames.map((P) => dot(at(P, foot), F)), lo = Math.min(...y), v = [];
    for (let k = 0; k + 1 < frames.length; k++) if (y[k] <= lo + 0.01 && y[k + 1] <= lo + 0.01) v.push(-(fwd[k + 1] - fwd[k]) * FPS);
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    if (!(Math.abs(mean / want - 1) <= 0.1)) e.push(`${leg} foot: ${f3(mean)} u/s backward in stance vs stride / duration ${f3(want)} (${v.length ? (100 * (mean / want - 1)).toFixed(0) + ' %' : 'no stance frames'})`);
  }
  return e;
}

// AR6 budgets: triangles <= the source's + RIG_EXTRA_TRIS (40, the eyelid caps), file <= RIG_KB (400 KB, ruling R13; the spec's
// first estimate was 250 KB): the asset contract's numbers (lib/asset-contract.mjs, R36), so the two checks cannot drift
async function AR6(rig, entry, src) {
  const e = [];
  if (rig.tris > src.tris + RIG_EXTRA_TRIS) e.push(`${rig.tris} tris > the source's ${src.tris} + ${RIG_EXTRA_TRIS}`);
  if (rig.kb > RIG_KB) e.push(`${rig.kb.toFixed(1)} KB > ${RIG_KB}`);
  return e;
}

// AR7 three.js playback: GLTFLoader's joint names = entry bones; two SkeletonUtils clones on different clips get different joint
// matrices while the loaded scene stays put; with a probe, three's posed vertices within 0.002 u of Blender's
async function AR7(rig, entry, src, probe) {
  if (!rig.mesh) return ['no SkinnedMesh in the loaded scene'];
  const e = [], names = rig.mesh.skeleton.bones.map((b) => b.name);
  if (!sameSet(names, entry.bones)) e.push(`three.js joint names != entry bones (${setDiff(names, entry.bones)})`);
  const worlds = () => Float64Array.from(rig.mesh.skeleton.bones.flatMap((b) => b.matrixWorld.elements));
  if (rig.clips.length < 2) e.push(`${rig.clips.length} clips: two instances need two to play`);
  else {
    rig.scene.updateMatrixWorld(true);
    const before = worlds();
    const [A, B] = rig.clips.slice(0, 2).map((c) => {
      const root = SkeletonUtils.clone(rig.scene), mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(c).play(); mixer.update(c.duration / 2); root.updateMatrixWorld(true);
      let m = null; root.traverse((o) => { if (o.isSkinnedMesh && !m) m = o; });
      m.skeleton.update();
      return Float64Array.from(m.skeleton.boneMatrices);
    });
    if (!A.some((x, i) => Math.abs(x - B[i]) > 1e-6)) e.push(`two clones playing ${rig.clips[0].name} / ${rig.clips[1].name} share their joint matrices`);
    rig.scene.updateMatrixWorld(true);
    if (worlds().some((x, i) => Math.abs(x - before[i]) > 1e-9)) e.push('playing two clones moved the loaded scene');
  }
  if (probe) {   // it must cover every clip at its start, end and at least one time between, with >= 16 points (review fix I2)
    const clips = rig.clips.map((c) => c.name), keys = Object.keys(probe.times);
    if (!sameSet(keys, clips)) e.push(`probe clips != the file's clips (${setDiff(keys, clips)})`);
    for (const c of rig.clips) {
      const ts = probe.times[c.name], near = (a, b) => Math.abs(a - b) < 1e-4;
      if (ts && !(ts.some((t) => near(t, 0)) && ts.some((t) => near(t, c.duration)) && ts.some((t) => t > 1e-4 && t < c.duration - 1e-4)))
        e.push(`probe times for ${c.name} (${ts.join(', ')}) miss its start, its end or a time between`);
    }
    if (probe.points.length < 16) e.push(`${probe.points.length} probe points (want >= 16)`);
    const D = poseAt(rig, null, 0), n = D.length / 3;
    const idx = probe.points.map((pt) => { for (let i = 0; i < n; i++) if (Math.hypot(D[3 * i] - pt.rest[0], D[3 * i + 1] - pt.rest[1], D[3 * i + 2] - pt.rest[2]) < 1e-4) return i; return -1; });
    const miss = idx.filter((i) => i < 0).length;
    if (miss) e.push(`${miss} of ${probe.points.length} probe points match no default-pose vertex`);
    let worst = 0, where = '';
    for (const [clip, times] of Object.entries(probe.times)) {
      if (!clips.includes(clip)) continue;
      times.forEach((t, j) => {
        const P = poseAt(rig, clip, t);
        probe.points.forEach((pt, k) => {
          if (idx[k] < 0) return;
          const q = pt.posed[clip][j], d = Math.hypot(P[3 * idx[k]] - q[0], P[3 * idx[k] + 1] - q[1], P[3 * idx[k] + 2] - q[2]);
          if (d > worst) { worst = d; where = `${clip} at ${t} s`; }
        });
      });
    }
    if (worst > 0.002) e.push(`three.js vs Blender: probe vertices ${f4(worst)} u apart (${where})`);
  }
  return e;
}

export const CHECKS = { AR1, AR2, AR3, AR4, AR5, AR6, AR7 };
