// The skinned animals (public/models/<id>_rig.glb + rigs.json) against checks AR1-AR7 (lib/rig-checks.mjs).
//   node tests/rigs.test.mjs
// Part A proves the checker on Blender-built fixtures (tests/fixtures/rigs, rebuilt by art/blender/rigs/fixtures.sh): good passes every
// check and each bad_* fails exactly its own. Part B runs every check on every animal in rigs.json (with Blender's probe from
// art/blender/rigs/probes/<id>.probe.json) plus each animal's own measured pose checks.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { boxOf, loadRig, loadSource, poseAt, lookPose, stretchOf } from '../lib/rig-inspect.mjs';
import { CHECKS } from '../lib/rig-checks.mjs';
import { reduceLinear } from '../lib/rig-keys.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n        ' + detail : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..', '..', '..');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const LABEL = { AR1: 'contract', AR2: 'clips', AR3: 'default pose', AR4: 'stretch', AR5: 'stride', AR6: 'budgets', AR7: 'three.js playback' };
const deg = (x) => (x * 180) / Math.PI, mm = (x, d = 1) => (1000 * x).toFixed(d);

async function run(entry, dir, probe, mutate) {   // { AR1: [errors], ... }; a check that throws fails with its stack
  const rig = await loadRig(path.join(dir, entry.file)), src = await loadSource(path.join(dir, entry.source)), res = {};
  if (mutate) mutate(rig);
  for (const [k, check] of Object.entries(CHECKS)) { try { res[k] = await check(rig, entry, src, probe); } catch (e) { res[k] = [`threw ${e.stack || e}`]; } }
  return res;
}
const comp = (A, i, c) => [A.getX, A.getY, A.getZ, A.getW][c].call(A, i);

// ---- Part A: the checker on its fixtures ----
// good.glb is split into one glTF island per face. Moves the first island whose vertices all sit on `head` onto leg_L_2 in memory:
// no edge stretches, only the seam with its neighbours opens
function headIslandOnLeg(rig) {
  const g = rig.mesh.geometry, ix = g.index.array, n = g.attributes.position.count, par = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
  for (let t = 0; t < ix.length; t += 3) { par[find(ix[t + 1])] = find(ix[t]); par[find(ix[t + 2])] = find(ix[t]); }
  const islands = new Map();
  for (let i = 0; i < n; i++) { const r = find(i); if (!islands.has(r)) islands.set(r, []); islands.get(r).push(i); }
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, head = rig.bones.indexOf('head'), leg = rig.bones.indexOf('leg_L_2');
  const onHead = (i) => [0, 1, 2, 3].some((c) => comp(SI, i, c) === head && comp(SW, i, c) > 0.99);
  for (const i of [...islands.values()].find((c) => c.every(onHead))) { SI.setXYZW(i, leg, 0, 0, 0); SW.setXYZW(i, 1, 0, 0, 0); }
}
// adds a loose triangle (a whisker-like piece of its own) 2 mm off good's front-most non-lid vertex (the muzzle): weighted wholly to `bone`,
// or with that vertex's own weights when bone is null (a loose shell must follow the skin it is rooted in: the cat's whiskers once floated off its face)
function looseTriangle(bone) {
  return (rig) => {
    const g = rig.mesh.geometry, P = g.attributes.position, n = P.count, ix = g.index.array, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    const lid = (i) => { const w = [0, 1, 2, 3].map((c) => comp(SW, i, c)); return rig.bones[comp(SI, i, w.indexOf(Math.max(...w)))].startsWith('lid_'); };
    let r = -1;
    for (let i = 0; i < n; i++) if (!lid(i) && (r < 0 || P.getZ(i) > P.getZ(r))) r = i;
    for (const [name, A] of Object.entries(g.attributes)) {   // each attribute: three more vertices, copies of the root's
      const s = A.itemSize, a = new Float32Array((n + 3) * s);
      for (let i = 0; i < n + 3; i++) for (let c = 0; c < s; c++) a[i * s + c] = comp(A, i < n ? i : r, c);
      g.setAttribute(name, new THREE.BufferAttribute(a, s));
    }
    for (let k = 0; k < 3; k++) {
      g.attributes.position.setXYZ(n + k, P.getX(r) + (k === 0) * 0.002, P.getY(r) + (k === 1) * 0.002, P.getZ(r) + (k === 2) * 0.002);
      if (bone) { g.attributes.skinIndex.setXYZW(n + k, rig.bones.indexOf(bone), 0, 0, 0); g.attributes.skinWeight.setXYZW(n + k, 1, 0, 0, 0); }
    }
    const index = new Uint32Array(ix.length + 3); index.set(ix); index.set([n, n + 1, n + 2], ix.length);
    g.setIndex(new THREE.BufferAttribute(index, 1));
  };
}
// rewrites one clip's translation keys of `joint` (default hips) in the document AR2 reads: on axis k each key's offset from the default becomes f(offset)
function hipsKeys(clip, k, f, joint = 'hips') {
  return (rig) => {
    const ch = rig.doc.getRoot().listAnimations().find((a) => a.getName() === clip).listChannels().find((c) => c.getTargetNode() && c.getTargetNode().getName() === joint && c.getTargetPath() === 'translation');
    const out = ch.getSampler().getOutput(), d0 = ch.getTargetNode().getTranslation(), v = out.getArray().slice();
    for (let i = 0; i < out.getCount(); i++) v[3 * i + k] = d0[k] + f(v[3 * i + k] - d0[k]);
    out.setArray(v);
  };
}
// renames joint `from` to `to` in memory wherever the checks read it (document node, rig.bones, three's bone, clip track names); pair it with an entry whose bones say `to`
function renameJoint(from, to) {
  return (rig) => {
    rig.doc.getRoot().listNodes().find((n) => n.getName() === from).setName(to);
    rig.bones = rig.bones.map((b) => (b === from ? to : b));
    rig.scene.traverse((o) => { if (o.name === from) o.name = to; });
    for (const c of rig.clips) for (const t of c.tracks) if (t.name.startsWith(from + '.')) t.name = to + t.name.slice(from.length);
  };
}
function exactly(name, res, want) {
  const failed = Object.keys(res).filter((k) => res[k].length);
  ok(`A ${name} ${want.length ? 'fails exactly ' + want.join(' + ') : 'passes every check'}`, failed.join() === want.join(), failed.map((k) => `${k}: ${res[k].join('; ')}`).join('\n        ') || 'no check failed');
}

console.log('  Part A: the checker on its fixtures (tests/fixtures/rigs)');
const FIX = path.join(here, 'fixtures', 'rigs');
// the checks each fixture must fail (and it passes every other one); bad_slide.json pairs with good.glb
const TARGETS = {
  good: [],
  bad_names: ['AR1', 'AR7'],    // + AR7: three strips the dot (PropertyBinding.sanitizeNodeName), so the loader's joint is earL
  bad_side: ['AR1'], bad_atlas: ['AR1'], bad_loop: ['AR2'], bad_rootmotion: ['AR2'],
  bad_lid: ['AR2', 'AR3'],      // + AR2: every clip keys the lids open (scale 0), so Sit / Wave no longer start at the default pose
  bad_tear: ['AR4'], bad_slide: ['AR5'],
};
for (const [name, want] of Object.entries(TARGETS)) {
  let res;
  try { const pf = path.join(FIX, name + '.probe.json'); res = await run(readJson(path.join(FIX, name + '.json')), FIX, fs.existsSync(pf) ? readJson(pf) : undefined); }
  catch (e) { ok(`A ${name} loads`, false, String(e.stack || e)); continue; }
  if (name === 'good') { for (const [k, errs] of Object.entries(res)) ok(`A good ${k} ${LABEL[k]}`, !errs.length, errs.join('; ')); continue; }
  exactly(name, res, want);
}
// in-memory variants of good (no probe unless it is the subject): a seam opening along a glTF vertex split, probes that do not cover every clip or
// carry too few points, the 400 KB file cap, the hips translation limit (x, z within +-0.05, y within -0.20..+0.10; good's Sit lowers hips 0.03)
// which holds for any direct child joint of root whatever its name (the cat's is spine), proven with good's hips renamed pelvis
{
  const entry = readJson(path.join(FIX, 'good.json')), probe = readJson(path.join(FIX, 'good.probe.json'));
  const pelvis = { ...entry, bones: entry.bones.map((b) => (b === 'hips' ? 'pelvis' : b)) };
  const VARIANTS = [   // [name, probe, mutate, the checks it fails, entry (default good's)]
    ['good + a head island on leg_L_2', undefined, headIslandOnLeg, ['AR4']],
    ['good + a loose triangle with its root\'s weights', undefined, looseTriangle(null), []],
    ['good + a loose triangle on its muzzle weighted to hips', undefined, looseTriangle('hips'), ['AR4']],
    ['good + a probe of Idle only', { ...probe, times: { Idle: probe.times.Idle } }, null, ['AR7']],
    ['good + a probe without points', { ...probe, points: [] }, null, ['AR7']],
    ['good at 300 KB', undefined, (rig) => { rig.kb = 300; }, []],
    ['good at 410 KB', undefined, (rig) => { rig.kb = 410; }, ['AR6']],
    ['good + Sit lowering hips 0.15', undefined, hipsKeys('Sit', 1, (d) => d * 5), []],
    ['good + Sit lowering hips 0.25', undefined, hipsKeys('Sit', 1, (d) => d * 0.25 / 0.03), ['AR2']],
    ['good + Sit raising hips 0.12', undefined, hipsKeys('Sit', 1, (d) => d * -4), ['AR2']],
    ['good + Idle moving hips 0.06 in x', undefined, hipsKeys('Idle', 0, () => 0.06), ['AR2']],
    // the side rule judges a paired joint against its partner: an animal lying off its box centre (the curled cat) keeps its _L joints left of
    // their _R partners. Both legs moved 0.04 to the left in the document AR1 reads
    ['good with its legs 0.04 left of its box centre', undefined, (rig) => {
      for (const n of rig.doc.getRoot().listNodes().filter((x) => /^leg_[LR]_1$/.test(x.getName()))) {
        const t = n.getTranslation(), m = n.getParentNode().getWorldMatrix();   // model +X into the parent's axes
        n.setTranslation([0, 1, 2].map((i) => t[i] + 0.04 * m[4 * i]));
      }
    }, []],
    ['good with hips renamed pelvis', undefined, renameJoint('hips', 'pelvis'), [], pelvis],
    ['good with hips renamed pelvis + Idle moving it 0.06 in x', undefined, (rig) => { hipsKeys('Idle', 0, () => 0.06)(rig); renameJoint('hips', 'pelvis')(rig); }, ['AR2'], pelvis],
  ];
  for (const [name, p, mutate, want, e] of VARIANTS) {
    try { exactly(name, await run(e || entry, FIX, p, mutate), want); } catch (err) { ok(`A ${name} loads`, false, String(err.stack || err)); }
  }
}
// rig-finalize's key reduction on synthetic 30 fps tracks: a straight line keeps only its ends; a slow, small sine (breathing) drops keys yet every original key stays within 1e-4
{
  const T = Float32Array.from({ length: 91 }, (_, k) => k / 30), keyed = (f) => Float32Array.from([...T].flatMap(f));
  const worst = (V, size, keep) => {
    let w = 0;
    for (let k = 0, s = 0; k < T.length; k++) {
      while (keep[s + 1] < k) s++;
      const a = keep[s], b = keep[Math.min(s + 1, keep.length - 1)], u = b === a ? 0 : (T[k] - T[a]) / (T[b] - T[a]);
      for (let c = 0; c < size; c++) w = Math.max(w, Math.abs(V[a * size + c] + u * (V[b * size + c] - V[a * size + c]) - V[k * size + c]));
    }
    return w;
  };
  const kl = reduceLinear(T, keyed((t) => [0.1 + t, 2 * t, -0.5 * t]), 3);
  ok('A key reduction: a linear track keeps only its first and last keys', kl.join() === '0,90', `kept ${kl.join(',')}`);
  const sine = keyed((t) => [0.01 * Math.sin(2 * Math.PI * t / 3), 0.005 * Math.cos(2 * Math.PI * t / 3), 0.02 * t, 1]), ks = reduceLinear(T, sine, 4), err = worst(sine, 4, ks);
  ok('A key reduction: a sine track drops keys and stays within 1e-4 of every key', ks[0] === 0 && ks.at(-1) === 90 && ks.length < 91 && err <= 1e-4, `kept ${ks.length} of 91, worst ${err.toExponential(2)}`);
}

// ---- Part B: the animals ----
function dominantJoint(rig) {   // per vertex: the joint with its largest weight (as rig-checks' dominant)
  const { skinIndex: I, skinWeight: W } = rig.mesh.geometry.attributes, out = [];
  for (let i = 0; i < I.count; i++) { let k = 0; for (let c = 1; c < 4; c++) if (comp(W, i, c) > comp(W, i, k)) k = c; out.push(rig.bones[comp(I, i, k)]); }
  return out;
}
function legWeight(rig) {   // per vertex: the sum of its weights on leg_* joints
  const { skinIndex: I, skinWeight: W } = rig.mesh.geometry.attributes;
  return Array.from({ length: I.count }, (_, i) => [0, 1, 2, 3].reduce((s, c) => s + (/^leg_/.test(rig.bones[comp(I, i, c)]) ? comp(W, i, c) : 0), 0));
}
const groundOf = (D) => { let g = Infinity; for (let i = 1; i < D.length; i += 3) g = Math.min(g, D[i]); return g; };
const legVerts = (dom) => [...new Set(dom)].filter((b) => /^leg_.*_2$/.test(b)).sort().map((b) => [b, dom.flatMap((x, i) => (x === b ? [i] : []))]);   // [leg_*_2 joint, the vertices it dominates]
const lowestOf = (P, vs) => Math.min(...vs.map((i) => P[3 * i + 1]));

// Walk stance: on every stance frame each foot's lowest vertex sits on the ground (the default pose's lowest y) within +-PLANT u (the dog's paws once sank ~1 cm).
// A stance frame is one where the foot is within 0.01 u of its lowest over the cycle (AR5's band; swings are lifted clear)
const PLANT = 0.003;
function stanceOffGround(rig, walk) {
  const D = poseAt(rig, null, 0), dom = dominantJoint(rig), n = Math.round(walk.duration * 30), bad = [], ground = groundOf(D);
  const frames = Array.from({ length: n + 1 }, (_, k) => poseAt(rig, 'Walk', Math.min(k / 30, walk.duration)));
  for (const [leg, feet] of legVerts(dom)) {
    const low = frames.map((P) => lowestOf(P, feet)), lo = Math.min(...low), off = low.map((y, k) => [k, y - ground]).filter(([k, d]) => low[k] <= lo + 0.01 && Math.abs(d) > PLANT);
    if (off.length) bad.push(`${leg}: stance frames ${off.map(([k, d]) => `${k} (${mm(d)} mm)`).join(', ')}`);
  }
  return bad;
}
// Hop: "feet at most X u up" bounds the jump's clearance (lowest hoof at the top); a tucked hoof may rise further, but each hoof's own peak is capped at 2X.
// A hoof is the sole of a leg (the vertices its leg_*_2 joint dominates within 0.01 u of that leg's lowest at the default pose); its lift is its lowest vertex over the default ground, sampled at 1/120 s
// (measured: the goat's tucked FL peaks at 156.6 mm, the sheep's FR at 73.5 mm; the sheep's forelegs tucked to 100 deg rise 155-157 mm and fail)
const HOP_CAP = { goat: 0.16, sheep: 0.12, hare: 0.12 };
function hopPeaks(rig, clip, dur) {
  const D = poseAt(rig, null, 0), ground = groundOf(D), out = {};
  const hooves = legVerts(dominantJoint(rig)).map(([b, vs]) => { const lo = lowestOf(D, vs); return [b, vs.filter((i) => D[3 * i + 1] <= lo + 0.01)]; });
  for (let k = 0, N = Math.round(dur * 120); k <= N; k++) {
    const t = Math.min(k / 120, dur), P = poseAt(rig, clip, t);
    for (const [b, vs] of hooves) { const low = lowestOf(P, vs) - ground; if (!out[b] || low > out[b][0]) out[b] = [low, t]; }
  }
  return out;
}
function hopCap(X, cap) {
  const e = [], H = X.E.Hop, peaks = H ? hopPeaks(X.rig, 'Hop', H.duration) : {};
  if (!H) e.push('no Hop clip'); else if (!Object.keys(peaks).length) e.push('no hoof (no vertex a leg_*_2 joint dominates)');
  for (const [b, [y, t]] of Object.entries(peaks)) if (y > cap) e.push(`${b.slice(4, -2)} hoof rises ${mm(y)} mm (at ${t.toFixed(3)} s; cap ${1000 * cap})`);
  X.chk(`Hop: each hoof's peak lift at most ${cap} u (twice the brief's clearance)`, e);
}

// Every clip played at 1/120 s, as the game interpolates it:
// sink: the ground is uneven island terrain, so no vertex lies more than SINK u below the default pose's lowest point.
// duck floats: its ground is its rest hull bottom (y -0.05; waterline y 0), so its floor is -0.06 u; FLOAT_DIVE names the one exception: in the duck's
//   Dabble (a tip-up) the neck / head vertices are held to `below` u under the waterline instead (motion() reports how low they go).
// pops: no one-frame pops. A vertex's travel over a 1/120 s step (counted per 1/30 s) is a pop when it exceeds POP x the median travel at the same point of
//   the 3 key frames before AND after, and exceeds the floor POP_MIN (set on the dog, scaled per animal by its largest rest extent against POP_REF, the dog's 0.771 u).
//   Leg vertices of a clip with a stride (and every vertex whose leg_* weights add up to >= LEG_SEAM: shoulder / hip seams riding a lifting leg) are left to AR5 and
//   the stance check, because a Walk paw sets down and lifts off within one key.
// POP_ALLOW names per-clip bone exceptions: the chicken's head jerks and scrape kick are snaps by design; nothing else is excused.
const WATERLINE = 0, FLOAT_DIVE = { duck: { Dabble: { bones: ['neck', 'head'], below: 0.25 } } };
const SINK = 0.01, POP = 3, POP_MIN = 0.025, HZ = 120, POP_REF = 0.771, LEG_SEAM = 0.45;
const POP_ALLOW = { chicken: { Idle: ['neck', 'head'], Scratch: ['leg_R_1', 'leg_R_2', 'tail_1', 'hips'] } };
function motion(rig, entry, id) {
  const D = poseAt(rig, null, 0), n = D.length / 3, dom = dominantJoint(rig), K = HZ / 30, sunk = [], pops = [], dives = [];
  const popMin = POP_MIN * Math.max(...boxOf(D).size) / POP_REF, legW = legWeight(rig), stridden = dom.map((b, i) => /^leg_/.test(b) || legW[i] >= LEG_SEAM), ground = groundOf(D);
  const median = (s) => (s.length ? (s.sort((x, y) => x - y), (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2) : 0);
  for (const [c, E] of Object.entries(entry.clips)) {
    const allow = (POP_ALLOW[id] || {})[c] || [], N = Math.round(E.duration * HZ), F = [], skip = dom.map((b, i) => (E.stride !== undefined && stridden[i]) || allow.includes(b));
    const X = (FLOAT_DIVE[id] || {})[c], dive = dom.map((b) => !!X && X.bones.includes(b));
    let worst = [0, 0, 0], deep = [Infinity, 0];
    for (let k = 0; k <= N; k++) {
      const t = Math.min(k / HZ, E.duration), P = poseAt(rig, c, t);
      let low = Infinity, m = 0;
      for (let i = 0; i < n; i++) {
        const y = P[3 * i + 1];
        if (dive[i]) { if (y < deep[0]) deep = [y, t]; continue; }
        low = Math.min(low, y - ground); if (y - ground < -SINK) m++;
      }
      if (low < worst[0]) worst = [low, t, m];
      F.push(P);
    }
    if (worst[0] < -SINK) sunk.push(`${c}: ${mm(worst[0])} mm at ${worst[1].toFixed(3)} s (${worst[2]} vertices)`);
    if (X) dives.push({ clip: c, low: deep[0], at: deep[1], count: dive.filter(Boolean).length });
    const d = F.slice(0, -1).map((a, k) => { const b = F[k + 1], r = new Float32Array(n); for (let i = 0; i < n; i++) r[i] = K * Math.hypot(b[3 * i] - a[3 * i], b[3 * i + 1] - a[3 * i + 1], b[3 * i + 2] - a[3 * i + 2]); return r; });
    let pop = null, steps = 0;
    for (let k = 0; k < d.length; k++) {
      let hit = null;
      for (let i = 0; i < n; i++) {
        const v = d[k][i];
        if (v <= popMin || skip[i]) continue;
        const side = (js) => median(js.map((j) => k + j * K).filter((q) => q >= 0 && q < d.length).map((q) => d[q][i])), ref = Math.max(side([-1, -2, -3]), side([1, 2, 3]));
        if (v > POP * ref && (!hit || v > hit[0])) hit = [v, v / Math.max(ref, 1e-6), i];
      }
      if (hit) { steps++; if (!pop || hit[0] > pop[0]) pop = [...hit, k / HZ]; }
    }
    if (pop) pops.push(`${c}: ${steps} steps, worst ${mm(pop[0])} mm per 1/30 s (${pop[1].toFixed(1)}x its neighbours) at ${pop[3].toFixed(3)} s, vertex ${pop[2]} (${dom[pop[2]]})`);
  }
  return { sunk, pops, dives, popMin };
}

// ---- measuring helpers for the per-animal pose checks (the game plays the GLB; regions are geometric at the default pose, not by bone) ----
const JOINT_POSERS = new WeakMap();
function jointAt(rig, clip, t, name) {   // a joint's model-space position in a clip, from a private SkeletonUtils clone
  let p = JOINT_POSERS.get(rig);
  if (!p) { const r = SkeletonUtils.clone(rig.scene); JOINT_POSERS.set(rig, (p = { root: r, mixer: new THREE.AnimationMixer(r) })); }
  p.mixer.stopAllAction();
  const a = p.mixer.clipAction(rig.clips.find((c) => c.name === clip));
  a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset().play(); p.mixer.setTime(t);
  p.root.updateMatrixWorld(true);
  return p.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
}
function jointState(rig, clip, t, name) {   // a joint's model-space position and rotation and its local scale, as jointAt
  jointAt(rig, clip, t, name);
  const o = JOINT_POSERS.get(rig).root.getObjectByName(name);
  return { p: o.getWorldPosition(new THREE.Vector3()), q: o.getWorldQuaternion(new THREE.Quaternion()), s: o.scale.clone() };
}
function tailYaws(rig, clip, dur) {   // each tail joint's yaw (deg about the model's up, from its local rotation off the default) at every 1/30 s of a clip
  const r = SkeletonUtils.clone(rig.scene), mixer = new THREE.AnimationMixer(r), names = rig.bones.filter((b) => /^tail_\d+$/.test(b)).sort();
  r.updateMatrixWorld(true);
  const rest = names.map((b) => { const o = r.getObjectByName(b); return [o, o.quaternion.clone(), o.getWorldQuaternion(new THREE.Quaternion())]; });
  const a = mixer.clipAction(rig.clips.find((c) => c.name === clip)), out = names.map(() => []);
  a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset().play();
  for (let k = 0, N = Math.round(dur * 30); k < N; k++) {
    mixer.setTime(k / 30);
    rest.forEach(([o, q0, w0], j) => {
      const d = q0.clone().invert().multiply(o.quaternion), ang = 2 * Math.acos(Math.min(1, Math.abs(d.w))) * Math.sign(d.w || 1), ax = new THREE.Vector3(d.x, d.y, d.z), s = ax.length();
      out[j].push(s < 1e-9 ? 0 : (ax.divideScalar(s).applyQuaternion(w0).y * ang * 180) / Math.PI);
    });
  }
  return { names, out };
}
function fit(signals, f) {   // each sampled signal's amplitude and phase (cycles) at frequency f
  return signals.map((s) => {
    let a = 0, b = 0;
    s.forEach((x, k) => { a += x * Math.cos(2 * Math.PI * f * k / 30); b += x * Math.sin(2 * Math.PI * f * k / 30); });
    return { amp: (2 * Math.hypot(a, b)) / s.length, ph: Math.atan2(a, b) / (2 * Math.PI) };
  });
}
function strongest(s, dur, loop) {   // the strongest frequency of a signal: a loop's whole cycles per loop, else 0.05 Hz steps up to 6 Hz
  const fs = loop ? Array.from({ length: Math.floor(6 * dur) }, (_, k) => (k + 1) / dur) : Array.from({ length: 120 }, (_, k) => 0.05 * (k + 1));
  let best = [0, 0];
  for (const f of fs) { const [{ amp }] = fit([s], f); if (amp > best[1]) best = [f, amp]; }
  return best[0];
}
// the per-rig context every pose check shares
function mk(rig, entry) {
  const D = poseAt(rig, null, 0), n = D.length / 3, E = entry.clips, { skinIndex: I, skinWeight: W } = rig.mesh.geometry.attributes, out = [];
  const X = { rig, entry, D, n, E, out, dom: dominantJoint(rig), all: Array.from({ length: n }, (_, i) => i), ground: groundOf(D) };
  X.V = (P, i) => new THREE.Vector3(P[3 * i], P[3 * i + 1], P[3 * i + 2]);
  X.on = (i, b) => { const j = rig.bones.indexOf(b); return [0, 1, 2, 3].reduce((s, c) => s + (comp(I, i, c) === j ? comp(W, i, c) : 0), 0); };
  X.frames = (c, hz = 30) => Array.from({ length: Math.round(E[c].duration * hz) + 1 }, (_, k) => Math.min(k / hz, E[c].duration));
  X.J0 = (name) => { const w = rig.doc.getRoot().listNodes().find((x) => x.getName() === name).getWorldMatrix(); return new THREE.Vector3(w[12], w[13], w[14]); };
  X.front = (vs) => vs.reduce((b, i) => (D[3 * i + 2] > D[3 * b + 2] ? i : b));
  X.nose = () => { const eyeY = Math.min(X.J0('lid_L').y, X.J0('lid_R').y) - 0.02; return X.front(X.all.filter((i) => X.dom[i] === 'head' && D[3 * i + 1] < eyeY)); };   // front-most head vertex below the eyes
  X.tip = () => X.front(X.all);   // the front-most vertex (a bill or beak)
  X.sole = (bone) => { const vs = X.all.filter((i) => X.dom[i] === bone), lo = lowestOf(D, vs); return vs.filter((i) => D[3 * i + 1] <= lo + 0.01); };
  X.chk = (label, errs) => out.push([label, errs]);
  X.clip = (c, fn) => { const e = []; if (!E[c]) e.push(`no ${c} clip`); else fn(E[c], e); return e; };   // errors of a check on clip c, 'no c clip' when it is absent
  X.turns = (c, name) => { const q0 = rig.scene.getObjectByName(name).quaternion.clone(); return X.frames(c).map((t) => { jointAt(rig, c, t, name); return q0.angleTo(JOINT_POSERS.get(rig).root.getObjectByName(name).quaternion); }); };   // radians off the default per frame
  return X;
}
// the face's axes from the eye tops (lid joints) and a nose / bill point: {pitch (down +), yaw (to the left +), roll (left side up +), fwd}
function faceOf(eL, eR, p) {
  const left = eL.clone().sub(eR).normalize(), up = p.clone().sub(eL.clone().add(eR).multiplyScalar(0.5)).cross(left).normalize(), fwd = left.clone().cross(up);
  return { fwd, pitch: deg(Math.asin(-fwd.y)), yaw: deg(Math.atan2(fwd.x, fwd.z)), roll: deg(Math.asin(left.y)) };
}
const faceAt = (X, c, t, i) => faceOf(jointAt(X.rig, c, t, 'lid_L'), jointAt(X.rig, c, t, 'lid_R'), X.V(poseAt(X.rig, c, t), i));
// rest: the face points along +Z (|yaw| <= 5), the eye line is level (|roll| <= 5 when `roll`) and the nose / bill lies lo..hi deg below the eye tops
function restFace(X, p, lo, hi, roll = true) {
  const f = faceOf(X.J0('lid_L'), X.J0('lid_R'), X.V(X.D, p)), e = [];
  if (!(Math.abs(f.yaw) <= 5 && (!roll || Math.abs(f.roll) <= 5) && f.pitch >= lo && f.pitch <= hi)) e.push(`face yaw ${f.yaw.toFixed(1)}, roll ${f.roll.toFixed(1)}, pitch ${f.pitch.toFixed(1)} deg below the eyes (want |yaw| <= 5${roll ? ', |roll| <= 5' : ''}, ${lo}-${hi} below)`);
  X.chk('rest: the face points along +Z' + (roll ? ', the eyes level' : ', level or slightly down'), e);
  return f;
}
const ridesHead = (X, vs, min = 0.999) => { const soft = vs.filter((i) => X.on(i, 'head') < min); return !vs.length ? ['no vertex'] : soft.length ? [`${soft.length} carry less than ${min} head (worst ${Math.min(...soft.map((i) => X.on(i, 'head'))).toFixed(3)})`] : []; };
// jaw: turns at most 8 deg off its default in every clip, and at least mins[clip] deg in the named clips
function jawCheck(X, mins, label) {
  const { rig, entry } = X, r = SkeletonUtils.clone(rig.scene), mixer = new THREE.AnimationMixer(r), jaw = r.getObjectByName('jaw'), q0 = jaw.quaternion.clone(), e = [];
  for (const [c, C] of Object.entries(entry.clips)) {
    const a = mixer.clipAction(rig.clips.find((x) => x.name === c));
    mixer.stopAllAction(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset().play();
    let most = 0;
    for (let k = 0, N = Math.round(C.duration * 30); k <= N; k++) { mixer.setTime(Math.min(k / 30, C.duration)); most = Math.max(most, deg(q0.angleTo(jaw.quaternion))); }
    if (most > 8 + 1e-3) e.push(`${c} turns the jaw ${most.toFixed(2)} deg`);
    if (mins[c] !== undefined && most < mins[c]) e.push(`${c} moves the jaw only ${most.toFixed(2)} deg (want ${mins[c]}+)`);
  }
  for (const c of Object.keys(mins)) if (!X.E[c]) e.push(`no ${c} clip`);
  X.chk(label, e);
}
// Hop: the whole animal's lowest vertex rises lo..hi u at the top of the hop (the jump's clearance)
function hopClear(X, hi) {
  X.chk(`Hop: all four feet leave the ground, by 0.02-${hi} u`, X.clip('Hop', (H, e) => {
    let top = -Infinity, when = 0;
    for (const t of X.frames('Hop', 120)) { const low = lowestOf(poseAt(X.rig, 'Hop', t), X.all) - X.ground; if (low > top) { top = low; when = t; } }
    if (!(top >= 0.02 && top <= hi)) e.push(`its lowest point rises at most ${mm(top)} mm (at ${when.toFixed(3)} s; want 20-${1000 * hi} mm)`);
  }));
}
// Graze: on every 1/30 s the nose is at most `noseMax` u above the ground and in front of the forehooves (front-most hoof vertex), the face 70-90 deg down (never
// past the vertical) and still facing forward (its level part toward +Z)
function graze(X, nose, noseMax) {
  const { rig, D, all, dom, ground } = X, hooves = all.filter((i) => /^leg_F[LR]_2$/.test(dom[i]) && D[3 * i + 1] - ground < 0.05);
  X.chk(`Graze: the nose at the grass (<= ${noseMax} u) in front of the forehooves, the face forward and 70-90 deg down`, X.clip('Graze', (G, e) => {
    const w = { y: -Infinity, front: Infinity, pitch: [Infinity, -Infinity], yaw: 0 };
    for (const t of X.frames('Graze')) {
      const P = poseAt(rig, 'Graze', t), p = X.V(P, nose), f = faceAt(X, 'Graze', t, nose);
      w.y = Math.max(w.y, p.y - ground); w.front = Math.min(w.front, p.z - Math.max(...hooves.map((i) => P[3 * i + 2])));
      w.pitch = [Math.min(w.pitch[0], f.pitch), Math.max(w.pitch[1], f.pitch)];
      if (Math.hypot(f.fwd.x, f.fwd.z) > 0.05 && Math.abs(f.yaw) > Math.abs(w.yaw)) w.yaw = f.yaw;
    }
    if (w.y > noseMax) e.push(`the nose rises to ${mm(w.y)} mm (want <= ${1000 * noseMax})`);
    if (w.front < 0) e.push(`the nose comes ${mm(-w.front)} mm behind the front of the forehooves`);
    if (w.pitch[0] < 70 || w.pitch[1] > 90) e.push(`the face is ${w.pitch.map((x) => x.toFixed(1)).join('-')} deg down (want 70-90)`);
    if (Math.abs(w.yaw) > 45) e.push(`the face turns ${w.yaw.toFixed(1)} deg off forward`);
  }));
}
// Walk: the front knee folds forward in swing (a carpus): at each foreleg's most flexed swing frame its knee lies >= 0.01 u in front of the shoulder-hoof line, and farther than at rest
function kneeFold(X) {
  const { rig, D, V, J0 } = X;
  X.chk('Walk: the front knee folds forward in swing (a carpus)', X.clip('Walk', (W, e) => {
    for (const leg of ['FL', 'FR']) {
      const sole = X.sole(`leg_${leg}_2`), hoof = (P) => sole.reduce((a, i) => a.add(V(P, i)), new THREE.Vector3()).divideScalar(sole.length);
      const off = (S, K, H) => K.z - (S.z + ((H.z - S.z) * (K.y - S.y)) / (H.y - S.y));   // the knee in front of the line (+)
      const rest = off(J0(`leg_${leg}_1`), J0(`leg_${leg}_2`), hoof(D));
      const fr = X.frames('Walk').slice(0, -1).map((t) => { const P = poseAt(rig, 'Walk', t), S = jointAt(rig, 'Walk', t, `leg_${leg}_1`), K = jointAt(rig, 'Walk', t, `leg_${leg}_2`), H = hoof(P); return { t, h: H.y, len: S.distanceTo(H), off: off(S, K, H) }; });
      const hmin = Math.min(...fr.map((x) => x.h)), swing = fr.filter((x) => x.h > hmin + 0.02), flex = swing.reduce((b, x) => (x.len < b.len ? x : b), swing[0]);
      if (!flex) e.push(`${leg}: no swing frame`);
      else if (!(flex.off >= 0.01 && flex.off > rest)) e.push(`${leg}: at its most flexed swing frame (${flex.t.toFixed(3)} s) the knee lies ${mm(flex.off)} mm in front of the shoulder-hoof line (at rest ${mm(rest)}; want >= 10 and more than at rest)`);
    }
  }));
}
// wings: wing_L and wing_R turn at most `max` deg off their default in every clip, and at least `min` in `clip`
function wingsCheck(X, max, clip, min) {
  const e = []; let top = 0;
  for (const c of Object.keys(X.E)) for (const w of ['wing_L', 'wing_R']) {
    const most = deg(Math.max(...X.turns(c, w)));
    if (most > max + 1e-3) e.push(`${c} turns ${w} ${most.toFixed(2)} deg`);
    if (c === clip) top = Math.max(top, most);
  }
  if (!X.E[clip]) e.push(`no ${clip} clip`); else if (top < min) e.push(`${clip} lifts the wings only ${top.toFixed(2)} deg`);
  X.chk(`wings: at most ${max} deg in every clip, at least ${min} in ${clip}`, e);
}
// the head joint's snaps (6 deg or more within 0.15 s, at least 3 times) and holds (under 1.5 deg over 0.2 s on at least holdMin of the loop's frames) in Idle
function headSnaps(X, holdMin) {
  const q = X.frames('Idle').map((t) => jointState(X.rig, 'Idle', t, 'head').q), N = q.length - 1, turn = (a, b) => deg(q[((a % N) + N) % N].angleTo(q[((b % N) + N) % N])), e = [];
  let snaps = 0, inSnap = false;
  for (let k = 0; k < N; k++) { const s = turn(k, k + 4) >= 6; if (s && !inSnap) snaps++; inSnap = s; }
  const holds = Array.from({ length: N }, (_, k) => turn(k, k + 6) < 1.5).filter(Boolean).length / N;
  if (snaps < 3) e.push(`the head snaps ${snaps} times`);
  if (holds < holdMin) e.push(`the head holds on ${(100 * holds).toFixed(0)} % of the frames`);
  return e;
}
// the tail's direction against the body as a viewer sees it (the chicken's tail once drooped in Flap, which fans it up): tailTip is the vertex tail_1 dominates
// farthest from the tail joint at rest; tailRise is the elevation (deg above level, the tail pointing back along -z) of the joint-to-tip line in hips' own
// frame in a clip at t, less the default pose's (the body's own tip or turn does not count)
const TAIL_RISE = 5;
function tailLift(X, clip) {
  const { rig, D, dom } = X, w = rig.doc.getRoot().listNodes().find((x) => x.getName() === 'tail_1').getWorldMatrix(), elev = (v) => (Math.atan2(v.y, -v.z) * 180) / Math.PI;
  let tip = -1, far = -1;
  dom.forEach((b, i) => { const d = Math.hypot(D[3 * i] - w[12], D[3 * i + 1] - w[13], D[3 * i + 2] - w[14]); if (b === 'tail_1' && d > far) { far = d; tip = i; } });
  X.chk(`${clip}: the tail fans up (its tip rises ${TAIL_RISE} deg or more against the body)`, X.clip(clip, (C, e) => {
    const r = X.frames(clip).map((t) => {
      const P = poseAt(rig, clip, t), j = jointState(rig, clip, t, 'tail_1').p, h = jointState(rig, clip, t, 'hips').q;
      const turn = h.multiply(rig.scene.getObjectByName('hips').getWorldQuaternion(new THREE.Quaternion()).invert());   // hips' turn off its default
      return elev(X.V(P, tip).sub(j).applyQuaternion(turn.invert())) - elev(new THREE.Vector3(D[3 * tip] - w[12], D[3 * tip + 1] - w[13], D[3 * tip + 2] - w[14]));
    }), rise = Math.max(...r);
    if (!(rise >= TAIL_RISE)) e.push(`the tail tip rises ${rise.toFixed(1)} deg against the body at most, ${Math.min(...r).toFixed(1)} at least (want ${TAIL_RISE}+)`);
  }));
}

// ---- the dog: Lie and Sleep read as a low crouch, PlayBow as a dip, the wag as overlapping action; regions are geometric at the default pose:
// torso = the vertices hips, spine, chest or neck dominates, its chest in front of z 0 below y 0.25, its belly z -0.12..0, its rump behind z -0.12; a forearm = what leg_F*_2 dominates ----
const WAG = { Idle: [0.6, 0.8], Walk: [1 / 0.6 - 0.1, 1 / 0.6 + 0.1], Happy: [3, 4], PlayBow: [3, 6] };   // Hz (Walk: once a stride)
function dogPoses(X) {
  const { rig, entry, D, n, E, dom, V, ground, all } = X, Y = (P, i) => P[3 * i + 1], end = (c) => E[c].duration;
  const ids = (f) => all.filter(f), low = (P, s) => Math.min(...s.map((i) => Y(P, i))), frames = X.frames;
  const mean = (P, s) => s.reduce((a, i) => a.add(V(P, i)), new THREE.Vector3()).divideScalar(Math.max(s.length, 1));
  const torso = ids((i) => ['hips', 'spine', 'chest', 'neck'].includes(dom[i]));
  const chest = torso.filter((i) => D[3 * i + 2] >= 0 && Y(D, i) < 0.25), belly = torso.filter((i) => D[3 * i + 2] >= -0.12 && D[3 * i + 2] < 0), rump = torso.filter((i) => D[3 * i + 2] < -0.12), tail = ids((i) => /^tail_/.test(dom[i]));
  const fore = { FL: ids((i) => dom[i] === 'leg_FL_2'), FR: ids((i) => dom[i] === 'leg_FR_2') }, jaw = ids((i) => dom[i] === 'jaw');
  const near = (P, a, b) => Math.min(...a.map((i) => Math.min(...b.map((j) => V(P, i).distanceTo(V(P, j))))));
  { // Lie: the underside rests on the ground (chest within 0.015 u, belly and rump within 0.06 u) and the forearms fold forward, more along the ground than down
    const P = poseAt(rig, 'Lie', end('Lie')), e = [];
    for (const [name, s, most] of [['chest', chest, 0.015], ['belly', belly, 0.06], ['rump', rump, 0.06]]) { const u = low(P, s) - ground; if (u > most) e.push(`${name} underside ${mm(u)} mm off the ground (want <= ${1000 * most})`); }
    for (const [leg, s] of Object.entries(fore)) {
      const top = s.filter((i) => Y(D, i) > 0.1), paw = s.filter((i) => Y(D, i) < 0.04), d = mean(P, paw).sub(mean(P, top));
      if (!top.length) e.push(`${leg}: leg_${leg}_2 carries no forearm above y 0.1 (its knee is not at the elbow)`);
      else if (!(d.z > Math.abs(d.y))) e.push(`${leg} forearm not folded forward (elbow to paw ${d.z.toFixed(3)} forward, ${d.y.toFixed(3)} up)`);
    }
    X.chk('Lie: chest on the ground (<= 0.015 u), belly and rump <= 0.06 u, forearms folded forward', e);
  }
  { // Sleep: the body is Lie's last frame, the chin rests on a forearm or paw
    const P = poseAt(rig, 'Sleep', 0), L = poseAt(rig, 'Lie', end('Lie')), e = [], head = new Set(['neck', 'head', 'jaw', 'ear_L', 'ear_R', 'lid_L', 'lid_R'].map((b) => rig.bones.indexOf(b)));
    const { skinIndex: I, skinWeight: W } = rig.mesh.geometry.attributes, body = ids((i) => [0, 1, 2, 3].every((c) => !comp(W, i, c) || !head.has(comp(I, i, c))));
    const gap = Math.max(...body.map((i) => V(P, i).distanceTo(V(L, i))));
    if (gap > 1e-3) e.push(`body ${mm(gap, 2)} mm off Lie's last frame`);
    const chin = Math.max(...frames('Sleep').filter((_, k) => k % 10 === 0).map((t) => near(poseAt(rig, 'Sleep', t), jaw, [...fore.FL, ...fore.FR])));
    if (chin > 0.02) e.push(`chin ${(100 * chin).toFixed(1)} cm from the forearms`);
    X.chk('Sleep: Lie\'s body, the chin on a forearm (<= 0.02 u)', e);
  }
  { // PlayBow: at the deepest frame the chest is near the ground, the forearms lie on it, the rear and the tail are up
    const e = [], rest = { rump: Math.max(...rump.map((i) => Y(D, i))), tail: mean(D, tail).y };
    const [c, t] = frames('PlayBow').map((t) => [low(poseAt(rig, 'PlayBow', t), chest), t]).sort((a, b) => a[0] - b[0])[0], P = poseAt(rig, 'PlayBow', t);
    if (c - ground > 0.06) e.push(`chest ${(100 * (c - ground)).toFixed(1)} cm off the ground at its lowest (${t.toFixed(2)} s)`);
    for (const [leg, s] of Object.entries(fore)) if (low(P, s) - ground > 0.01) e.push(`${leg} forearm ${(100 * (low(P, s) - ground)).toFixed(1)} cm up`);
    if (Math.max(...rump.map((i) => Y(P, i))) < rest.rump - 0.001) e.push('the rump drops');
    if (mean(P, tail).y < rest.tail) e.push('the tail is not up');
    X.chk('PlayBow: chest <= 0.06 u off the ground, forearms down, rear and tail up', e);
  }
  { // Scratch: the left hind paw reaches behind the left ear root (ear_L) without entering its base: nearest vertex within 0.04 u of the root, never closer than 0.015 u
    const paw = ids((i) => dom[i] === 'leg_BL_2' && Y(D, i) < 0.05);
    const d = Math.min(...frames('Scratch').map((t) => { const P = poseAt(rig, 'Scratch', t), ear = jointAt(rig, 'Scratch', t, 'ear_L'); return Math.min(...paw.map((i) => V(P, i).distanceTo(ear))); }));
    X.chk('Scratch: left hind paw 0.015-0.04 u from the left ear root', d > 0.04 || d < 0.015 ? [`${(100 * d).toFixed(1)} cm at the closest`] : []);
  }
  { // the wag: overlapping action (each tail segment 0.12-0.20 of a cycle behind the one before, swinging wider toward the tip) in the loops, at each clip's speed
    const e = [];
    for (const c of ['Idle', 'Walk', 'Sniff', 'Happy', 'PlayBow']) {
      const { names, out: s } = tailYaws(rig, c, end(c)), f = strongest(s[s.length - 1], end(c), entry.clips[c].type === 'loop'), F = fit(s, f);
      if (WAG[c] && !(f >= WAG[c][0] - 1e-6 && f <= WAG[c][1] + 1e-6)) e.push(`${c} wags at ${f.toFixed(2)} Hz (want ${WAG[c].map((x) => x.toFixed(2)).join('-')})`);
      if (entry.clips[c].type !== 'loop') continue;
      for (let j = 1; j < names.length; j++) {
        const lag = (((F[j - 1].ph - F[j].ph) % 1) + 1) % 1;
        if (!(lag >= 0.12 && lag <= 0.2)) e.push(`${c} ${names[j]} lags ${lag.toFixed(3)} of a cycle`);
        if (!(F[j].amp > F[j - 1].amp)) e.push(`${c} ${names[j]} swings ${F[j].amp.toFixed(1)} deg, not more than ${names[j - 1]}`);
      }
    }
    X.chk('wag: overlapping, growing toward the tip, at each clip\'s speed', e);
  }
}
// ---- the goat: horns stay rigid, the beard follows the jaw, chewing at +-8 deg, a hop clearing the ground by 0.02-0.08 u ----
// horns = the vertices within HORN_R u of the two horn tips (the head-dominated vertices farthest from the head joint, >= 0.15 u apart), ears left out, so the horn bases are tested too
const GRAZE_NOSE = 0.09, HORN_R = 0.11;   // Graze: this rig's short neck reaches 0.08-0.086 u within AR4; a higher nose (99.7 mm, the face past vertical) fails
function goatPoses(X) {
  const { D, n, dom, V, all, on, J0 } = X;
  { const hj = J0('head'), heads = all.filter((i) => dom[i] === 'head'), far = (s) => s.reduce((b, i) => (V(D, i).distanceTo(hj) > V(D, b).distanceTo(hj) ? i : b));
    const t1 = far(heads), t2 = far(heads.filter((i) => V(D, i).distanceTo(V(D, t1)) > 0.15));
    const horn = all.filter((i) => !/^ear_/.test(dom[i]) && Math.min(V(D, i).distanceTo(V(D, t1)), V(D, i).distanceTo(V(D, t2))) <= HORN_R);
    X.chk(`horns: the ${horn.length} vertices within ${HORN_R} u of the horn tips ride the head alone`, ridesHead(X, horn)); }
  let tip = -1;   // the beard tip: the lowest default-pose vertex in front of z 0.24 (only the beard and the head reach so far)
  for (let i = 0; i < n; i++) if (D[3 * i + 2] > 0.24 && (tip < 0 || D[3 * i + 1] < D[3 * tip + 1])) tip = i;
  X.chk('beard: its tip follows the jaw (>= 0.99)', tip < 0 ? ['no beard tip'] : on(tip, 'jaw') < 0.99 ? [`tip ${tip} carries ${on(tip, 'jaw').toFixed(3)} jaw`] : []);
  jawCheck(X, { Graze: 4, Chew: 4 }, 'chew: the jaw works 4-8 deg in Graze and Chew, never past 8 deg');
  hopClear(X, 0.08); hopCap(X, HOP_CAP.goat);
  const nose = X.nose();
  restFace(X, nose, 0, 20, false);
  graze(X, nose, GRAZE_NOSE);
  kneeFold(X);
}
// ---- the chicken: comb and wattle stay on the head, wings lift at most 20 deg, the feet plant; quick head jerks and holds, a walk with the head bobbing,
// three pecks, one foot scraping back twice, a flap, a fluff by hips scale up to 8 % ----
// comb and wattle: every vertex above y COMB_Y in front of z 0 and every vertex in front of z FACE_Z above y FACE_Y (wattle, beak, face) rides the head alone.
// rest: the beak lies 30 +- 6 deg below the eyes (measured at the source). Peck: the beak tip comes within PECK_GROUND u of the ground at three moments >= 0.1 s
// apart, rising >= 0.03 u between them. Scratch: one foot has two runs of frames on the ground (within 0.004 u) moving back >= 0.03 u each while the other stays put.
// Walk: head stabilisation: with the chicken moving forward at stride / duration, the head joint's ground speed is under a quarter of the walk's on >= 40 % of the
// frames and it thrusts forward (over twice the walk's) in two runs a cycle. Idle: head snaps and holds on >= 40 % of the frames.
const COMB_Y = 0.38, FACE_Z = 0.15, FACE_Y = 0.28, PECK_GROUND = 0.008;
function chickenPoses(X) {
  const { rig, D, E, dom, V, all, ground } = X;
  { const face = all.filter((i) => !/^lid_/.test(dom[i]) && ((D[3 * i + 1] > COMB_Y && D[3 * i + 2] > 0) || (D[3 * i + 2] > FACE_Z && D[3 * i + 1] > FACE_Y)));
    X.chk(`comb and wattle: the ${face.length} vertices of the comb, crown, wattle, beak and face ride the head alone`, ridesHead(X, face)); }
  restFace(X, X.tip(), 24, 36);
  wingsCheck(X, 20, 'Flap', 8);
  { const e = [];   // Fluff: hips scales up by 4-8 %, scale 1 in every other clip
    for (const c of Object.keys(E)) {
      const s = X.frames(c).map((t) => jointState(rig, c, t, 'hips').s), hi = Math.max(...s.map((v) => Math.max(v.x, v.y, v.z))), lo = Math.min(...s.map((v) => Math.min(v.x, v.y, v.z)));
      if (c === 'Fluff' ? !(hi >= 1.04 && hi <= 1.08 + 1e-4 && lo >= 1 - 1e-4) : hi > 1 + 1e-4 || lo < 1 - 1e-4) e.push(`${c} scales hips ${lo.toFixed(4)}-${hi.toFixed(4)}`);
    }
    if (!E.Fluff) e.push('no Fluff clip');
    X.chk('Fluff: hips puffs up by 4-8 %, scale 1 in every other clip', e); }
  X.chk(`Peck: three pecks, the beak tip within ${PECK_GROUND} u of the ground`, X.clip('Peck', (C, e) => {
    const tipI = X.tip(), ys = X.frames('Peck', 120).map((t) => poseAt(rig, 'Peck', t)[3 * tipI + 1] - ground), hits = [];
    for (let k = 1; k < ys.length - 1; k++) if (ys[k] <= PECK_GROUND && ys[k] <= ys[k - 1] && ys[k] <= ys[k + 1]) {
      const last = hits[hits.length - 1];
      if (last === undefined || (k - last >= 12 && Math.max(...ys.slice(last, k)) >= ys[k] + 0.03)) hits.push(k); else if (ys[k] < ys[last]) hits[hits.length - 1] = k;
    }
    if (hits.length !== 3) e.push(`${hits.length} pecks reach the ground (beak tip lowest ${mm(Math.min(...ys))} mm; want 3 within ${1000 * PECK_GROUND} mm)`);
  }));
  X.chk('Scratch: one foot scrapes back twice along the ground, the other stays put', X.clip('Scratch', (C, e) => {
    const Ps = X.frames('Scratch').map((t) => poseAt(rig, 'Scratch', t)), feet = { L: all.filter((i) => dom[i] === 'leg_L_2'), R: all.filter((i) => dom[i] === 'leg_R_2') };
    const moved = (leg) => Math.max(...Ps.map((P) => Math.max(...feet[leg].map((i) => V(P, i).distanceTo(V(D, i)))))), scr = moved('L') > moved('R') ? 'L' : 'R', still = scr === 'L' ? 'R' : 'L';
    const low = Ps.map((P) => feet[scr].reduce((b, i) => (P[3 * i + 1] < P[3 * b + 1] ? i : b))), runs = [], backOf = (P) => Math.min(...feet[scr].map((i) => P[3 * i + 2]));
    let run = null;
    for (let k = 0; k + 1 < Ps.length; k++) {
      const y = Ps[k][3 * low[k] + 1] - ground, y1 = Ps[k + 1][3 * low[k + 1] + 1] - ground, back = backOf(Ps[k]) - backOf(Ps[k + 1]);
      if (y <= 0.004 && y1 <= 0.004 && back > 1e-4) { run = run || { d: 0 }; run.d += back; } else if (run) { runs.push(run.d); run = null; }
    }
    if (run) runs.push(run.d);
    const scrapes = runs.filter((d) => d >= 0.03).length;
    if (scrapes !== 2) e.push(`the ${scr} foot scrapes back ${scrapes} times (${runs.map((d) => mm(d, 0)).join(', ') || 'no'} mm along the ground; want 2 of 30 mm or more)`);
    if (moved(still) > 0.004) e.push(`the ${still} foot moves ${mm(moved(still))} mm`);
  }));
  { const e = [], Wk = E.Walk;
    if (!Wk || Wk.stride === undefined) e.push('no Walk stride');
    else {
      const v = Wk.stride / Wk.duration, z = X.frames('Walk').map((t) => jointState(rig, 'Walk', t, 'head').p.z), g = z.slice(1).map((x, k) => (x - z[k]) * 30 + v), held = g.filter((x) => Math.abs(x) < 0.25 * v).length / g.length;
      let thrusts = 0; g.forEach((x, k) => { if (x > 2 * v && !(k > 0 && g[k - 1] > 2 * v)) thrusts++; });
      if (held < 0.4) e.push(`the head holds still on ${(100 * held).toFixed(0)} % of the frames`);
      if (thrusts !== 2) e.push(`the head thrusts forward ${thrusts} times a cycle`);
    }
    X.chk('Walk: the head holds still in space, then thrusts forward, once a step', e); }
  X.chk('Idle: the head jerks and holds', X.clip('Idle', (C, e) => e.push(...headSnaps(X, 0.4))));
  tailLift(X, 'Flap');
}
// ---- the duck: floats (hull bottom at y -0.05 under the waterline y 0), no legs, wings lift at most 12 deg; clips: a float bob with head turns, a paddle, a preen, a tip-up, a shake ----
// rest: the bill lies DUCK_BILL +- 6 deg below the eyes. face: the bill's front half (z > BILL_Z) and the eyes (within EYE_R u of a lid joint) ride the head alone; the bill's base
// (z > 0.155, y > 0.105) and the crown (above the lid joints) at least HEAD_MOST of it (a turn's twist, spread up the neck, reaches them a little).
// Idle: hips bobs 6-12 mm; the head snaps and settles on >= 30 % of the frames. Paddle: the body leans forward 3-10 deg on average (hips' forward axis below level) and the tail
// waggles 8 deg or more to each side. Preen: the face turns >= 75 deg to one side and the bill tip comes within PREEN_REACH u of that side's wing.
// Dabble: at its deepest hips pitches down 45-70 deg, the tail joint rises >= 0.1 u and the bill tip goes >= 0.03 u under the waterline. Shake: ripples head, then hips, then tail_1 (each
// first reaches half its largest turn at least 1/30 s after the one before).
const DUCK_BILL = 41, BILL_Z = 0.19, EYE_R = 0.025, HEAD_MOST = 0.9, PREEN_REACH = 0.03;
function duckPoses(X) {
  const { rig, D, E, dom, V, all, J0, on } = X, tipI = X.tip();
  const restQ = (name) => rig.scene.getObjectByName(name).getWorldQuaternion(new THREE.Quaternion());
  const fwdOf = (clip, t, name) => new THREE.Vector3(0, 0, 1).applyQuaternion(jointState(rig, clip, t, name).q.multiply(restQ(name).invert()));
  const pitchOf = (f) => deg(Math.asin(-f.y)), yawOf = (f) => deg(Math.atan2(f.x, f.z));
  restFace(X, tipI, DUCK_BILL - 6, DUCK_BILL + 6);
  { const eL = J0('lid_L'), eR = J0('lid_R'), eyeY = Math.max(eL.y, eR.y), lid = (i) => /^lid_/.test(dom[i]);
    const hard = all.filter((i) => !lid(i) && (D[3 * i + 2] > BILL_Z || Math.min(V(D, i).distanceTo(eL), V(D, i).distanceTo(eR)) <= EYE_R));
    const firm = all.filter((i) => !lid(i) && ((D[3 * i + 2] > 0.155 && D[3 * i + 1] > 0.105) || D[3 * i + 1] > eyeY));
    const e = [...ridesHead(X, hard).map((m) => 'bill front + eyes: ' + m), ...ridesHead(X, firm, HEAD_MOST).map((m) => 'bill base + crown: ' + m)];
    X.chk(`face: the bill's front and the eyes ride the head alone (${hard.length} vertices), the bill's base and the crown at least ${HEAD_MOST} (${firm.length})`, e); }
  wingsCheck(X, 12, 'Shake', 4);
  X.chk('Idle: a float bob of 6-12 mm, head turns that snap and settle', X.clip('Idle', (C, e) => {
    const ys = X.frames('Idle').map((t) => jointState(rig, 'Idle', t, 'hips').p.y), bob = Math.max(...ys) - Math.min(...ys);
    if (!(bob >= 0.006 && bob <= 0.012)) e.push(`hips bobs ${mm(bob)} mm (want 6-12)`);
    e.push(...headSnaps(X, 0.3));
  }));
  X.chk('Paddle: a slight forward lean, the tail waggling', X.clip('Paddle', (C, e) => {
    const ts = X.frames('Paddle').slice(0, -1), lean = ts.reduce((s, t) => s + pitchOf(fwdOf('Paddle', t, 'hips')), 0) / ts.length, y = tailYaws(rig, 'Paddle', C.duration).out[0];
    if (!(lean >= 3 && lean <= 10)) e.push(`the body leans ${lean.toFixed(1)} deg forward on average (want 3-10)`);
    if (!(Math.max(...y) >= 8 && Math.min(...y) <= -8)) e.push(`the tail waggles ${Math.min(...y).toFixed(1)} to ${Math.max(...y).toFixed(1)} deg`);
  }));
  X.chk(`Preen: the head turns back (75 deg or more), the bill within ${PREEN_REACH} u of the wing`, X.clip('Preen', (C, e) => {
    let best = { yaw: 0, t: 0 };
    for (const t of X.frames('Preen')) { const y = yawOf(fwdOf('Preen', t, 'head')); if (Math.abs(y) > Math.abs(best.yaw)) best = { yaw: y, t }; }
    const wing = all.filter((i) => dom[i] === (best.yaw > 0 ? 'wing_L' : 'wing_R'));
    const reach = Math.min(...X.frames('Preen').map((t) => { const Q = poseAt(rig, 'Preen', t), tip = V(Q, tipI); return Math.min(...wing.map((i) => V(Q, i).distanceTo(tip))); }));
    if (Math.abs(best.yaw) < 75) e.push(`the face turns ${best.yaw.toFixed(1)} deg at most`);
    if (reach > PREEN_REACH) e.push(`the bill tip comes ${mm(reach)} mm from the wing (want <= ${1000 * PREEN_REACH})`);
  }));
  X.chk('Dabble: a tip-up, hips 45-70 deg forward, the tail up, the bill under the water', X.clip('Dabble', (C, e) => {
    const ts = X.frames('Dabble'), pitch = Math.max(...ts.map((t) => pitchOf(fwdOf('Dabble', t, 'hips')))), rise = Math.max(...ts.map((t) => jointState(rig, 'Dabble', t, 'tail_1').p.y)) - J0('tail_1').y;
    const tip = Math.min(...X.frames('Dabble', 120).map((t) => poseAt(rig, 'Dabble', t)[3 * tipI + 1]));
    if (!(pitch >= 45 && pitch <= 70)) e.push(`hips pitches ${pitch.toFixed(1)} deg forward at most (want 45-70)`);
    if (rise < 0.1) e.push(`the tail rises ${mm(rise)} mm`);
    if (tip > WATERLINE - 0.03) e.push(`the bill tip reaches ${mm(tip)} mm (want 30 mm or more under the waterline)`);
  }));
  tailLift(X, 'Dabble');
  X.chk('Shake: it ripples from the head to the tail', X.clip('Shake', (C, e) => {
    const ts = X.frames('Shake'), first = {};
    for (const b of ['head', 'hips', 'tail_1']) { const a = X.turns('Shake', b); first[b] = ts[a.findIndex((x) => x >= 0.5 * Math.max(...a))]; }
    if (!(first.head + 1 / 30 - 1e-6 <= first.hips && first.hips + 1 / 30 - 1e-6 <= first.tail_1)) e.push(`the turns first reach half their largest at head ${first.head.toFixed(3)}, hips ${first.hips.toFixed(3)}, tail_1 ${first.tail_1.toFixed(3)} s`);
  }));
}
// ---- the sheep (the Meshy sheep fitted to sheep.glb's size): Graze with the head down and chewing, a Hop whose feet rise at most 0.06 u, a Bleat with the head up and the jaw open 8 deg ----
// rest: the nose lies SHEEP_NOSE +- 6 deg below the eye tops (the face's own slope as modelled). Bleat: at its highest the face pitches SHEEP_BLEAT_UP deg or more above its rest.
// Graze: a ball of fleece on 13 cm of leg with no neck to speak of, so the nose reaches 70-77 mm within AR4; the check holds SHEEP_GRAZE_NOSE and fails anything higher (the first build: 106 mm)
const SHEEP_NOSE = 44, SHEEP_BLEAT_UP = 20, SHEEP_GRAZE_NOSE = 0.08;
function sheepPoses(X) {
  const nose = X.nose(), rest = restFace(X, nose, SHEEP_NOSE - 6, SHEEP_NOSE + 6);
  jawCheck(X, { Graze: 4, Bleat: 7.5 }, 'jaw: at most 8 deg in every clip, chewing 4-8 in Graze, open 7.5-8 in Bleat');
  X.chk(`Bleat: the head comes up (the face ${SHEEP_BLEAT_UP} deg or more above its rest)`, X.clip('Bleat', (C, e) => {
    const up = Math.max(...X.frames('Bleat').map((t) => rest.pitch - faceAt(X, 'Bleat', t, nose).pitch));
    if (up < SHEEP_BLEAT_UP) e.push(`the face comes up ${up.toFixed(1)} deg at most (want ${SHEEP_BLEAT_UP} or more)`);
  }));
  hopClear(X, 0.06); hopCap(X, HOP_CAP.sheep);
  graze(X, nose, SHEEP_GRAZE_NOSE);
  kneeFold(X);
}
// ---- the brown hare (0.45 u tall, so distances not from the brief are fractions of its height): a sitting hare that breathes and twitches its nose, a look, a two-segment ear flick,
// a face wash with the front paws, one short hop landing back in the sit with 0.02-0.06 u clearance, an alert sit ----
// ears: every ear segment within EAR_MAX deg of its default in every clip. EarTwitch: one ear_*_1 turns >= 12 deg while the other ear's segments stay under 3 deg, and its tip
// ear_*_2 turns >= 5 deg against it and reaches half its largest turn at least 1/30 s later. Groom: each forepaw's sole comes within GROOM_REACH u of the face (head vertices in
// front of the eye centres). Alert: the head joint rises ALERT_RISE u or more, and each ear (joint to the ear_*_2 vertex farthest from it) leans ALERT_EAR deg or more nearer the
// vertical. Idle: the nose tip's height reverses >= TWITCHES times (1/30 s, ignoring wiggles under 0.05 mm) and strays at most TWITCH_MAX u from rest: a micro-motion, not a nod.
const HARE_H = 0.45, HARE_NOSE = 46, EAR_MAX = 25, GROOM_REACH = 0.025 * HARE_H, ALERT_RISE = 0.03 * HARE_H, ALERT_EAR = 10, TWITCHES = 8, TWITCH_MAX = 0.015 * HARE_H, LOOK_TURN = 25;
function harePoses(X) {
  const { rig, D, E, dom, V, all, J0 } = X, nose = X.nose(), EARS = ['ear_L_1', 'ear_L_2', 'ear_R_1', 'ear_R_2'];
  const turns = (c, names) => names.map((b) => X.turns(c, b).map(deg));   // each named joint's turn off its default (deg) at every 1/30 s of a clip
  restFace(X, nose, HARE_NOSE - 6, HARE_NOSE + 6);
  { const e = [];
    for (const c of Object.keys(E)) turns(c, EARS).forEach((s, j) => { const m = Math.max(...s); if (m > EAR_MAX + 1e-3) e.push(`${c} turns ${EARS[j]} ${m.toFixed(2)} deg`); });
    X.chk(`ears: every ear segment within ${EAR_MAX} deg of its default in every clip`, e); }
  X.chk('EarTwitch: one ear flicks, its tip segment following through', X.clip('EarTwitch', (C, e) => {
    const [l1, l2, r1, r2] = turns('EarTwitch', EARS), [a1, a2, b1, b2, s] = Math.max(...l1) >= Math.max(...r1) ? [l1, l2, r1, r2, 'L'] : [r1, r2, l1, l2, 'R'], half = (x) => x.findIndex((v) => v >= 0.5 * Math.max(...x));
    if (Math.max(...a1) < 12) e.push(`ear_${s}_1 flicks ${Math.max(...a1).toFixed(1)} deg at most`);
    if (Math.max(...b1, ...b2) >= 3) e.push(`the other ear turns ${Math.max(...b1, ...b2).toFixed(1)} deg`);
    if (Math.max(...a2) < 5) e.push(`ear_${s}_2 turns ${Math.max(...a2).toFixed(1)} deg against ear_${s}_1 at most`);
    if (!(half(a2) >= half(a1) + 1)) e.push(`ear_${s}_2 reaches half its turn at frame ${half(a2)}, ear_${s}_1 at ${half(a1)} (want the tip later)`);
  }));
  X.chk(`Groom: each forepaw within ${mm(GROOM_REACH)} mm of the face`, X.clip('Groom', (C, e) => {
    const eyeZ = Math.min(J0('lid_L').z, J0('lid_R').z), muzzle = all.filter((i) => dom[i] === 'head' && D[3 * i + 2] > eyeZ);
    for (const leg of ['FL', 'FR']) {
      const sole = X.sole(`leg_${leg}_2`); let best = [Infinity, 0];
      for (const t of X.frames('Groom')) { const P = poseAt(rig, 'Groom', t); for (const i of sole) for (const j of muzzle) { const d = V(P, i).distanceTo(V(P, j)); if (d < best[0]) best = [d, t]; } }
      if (!sole.length || !muzzle.length) e.push(`${leg}: no sole or no face vertex`);
      else if (best[0] > GROOM_REACH) e.push(`the ${leg} paw comes ${mm(best[0])} mm from the face at the closest (${best[1].toFixed(3)} s; want <= ${mm(GROOM_REACH)})`);
    }
  }));
  hopClear(X, 0.06); hopCap(X, HOP_CAP.hare);
  X.chk(`Alert: the head ${mm(ALERT_RISE)} mm or more higher, the ears ${ALERT_EAR} deg or more nearer the vertical`, X.clip('Alert', (C, e) => {
    const rise = Math.max(...X.frames('Alert').map((t) => jointAt(rig, 'Alert', t, 'head').y)) - J0('head').y;
    if (rise < ALERT_RISE) e.push(`the head rises ${mm(rise)} mm at most (want ${mm(ALERT_RISE)} or more)`);
    for (const s of ['L', 'R']) {
      const r0 = J0(`ear_${s}_1`), tip = all.filter((i) => dom[i] === `ear_${s}_2`).reduce((b, i) => (V(D, i).distanceTo(r0) > V(D, b).distanceTo(r0) ? i : b));
      const lean = (root, p) => deg(p.clone().sub(root).angleTo(new THREE.Vector3(0, 1, 0))), l0 = lean(r0, V(D, tip));
      const up = Math.max(...X.frames('Alert').map((t) => l0 - lean(jointAt(rig, 'Alert', t, `ear_${s}_1`), V(poseAt(rig, 'Alert', t), tip))));
      if (up < ALERT_EAR) e.push(`ear ${s} comes ${up.toFixed(1)} deg nearer the vertical at most (rest lean ${l0.toFixed(1)}; want ${ALERT_EAR} or more)`);
    }
  }));
  X.chk(`Idle: the nose twitches (${TWITCHES}+ reversals, within ${mm(TWITCH_MAX)} mm)`, X.clip('Idle', (C, e) => {
    const Ps = X.frames('Idle').map((t) => poseAt(rig, 'Idle', t)), y = Ps.map((P) => P[3 * nose + 1]), far = Math.max(...Ps.map((P) => V(P, nose).distanceTo(V(D, nose))));
    let dir = 0, flips = 0, ref = y[0];
    for (const v of y) { const d = v - ref; if (Math.abs(d) < 5e-5) continue; const s = Math.sign(d); if (dir && s !== dir) flips++; dir = s; ref = v; }
    if (flips < TWITCHES) e.push(`the nose reverses ${flips} times (want ${TWITCHES} or more)`);
    if (far > TWITCH_MAX) e.push(`the nose strays ${mm(far)} mm (want <= ${mm(TWITCH_MAX)})`);
  }));
  X.chk(`Look: the face turns ${LOOK_TURN} deg or more`, X.clip('Look', (C, e) => { const m = Math.max(...X.frames('Look').map((t) => Math.abs(faceAt(X, 'Look', t, nose).yaw))); if (m < LOOK_TURN) e.push(`the face turns ${m.toFixed(1)} deg at most`); }));
}
// Live-look clamp: each entry carries look: { yaw, pitch, bones }. The game turns `bones` (live) by a look of yaw deg about up and pitch deg about left, split evenly over them
// (lib/rig-inspect.mjs lookPose), keeping the look inside the ellipse (yaw / look.yaw)^2 + (pitch / look.pitch)^2 <= 1. Measured, not padded: at rest the whole ellipse (LOOK_DIRS
// directions) keeps AR4 <= 1.6; yaw is the largest whole 5 deg that holds with pitch 0 and pitch the largest whole 5 deg that keeps the ellipse at that yaw, each at most LOOK_MAX
const LOOK_DIRS = 32, LOOK_MAX = 60, AR4_MAX = 1.6;
function lookClamp(rig, entry) {   // [errors of the clamp itself, errors of its measurement]
  const L = entry.look;
  if (!L || !Array.isArray(L.bones) || typeof L.yaw !== 'number' || typeof L.pitch !== 'number') return [['no look { yaw, pitch, bones } in rigs.json'], ['no look']];
  const held = [], tight = [], f = entry.facing, off = L.bones.filter((b) => !(entry.live || []).includes(b));
  const ell = (Y, P, n) => Math.max(...Array.from({ length: n }, (_, k) => { const a = (2 * Math.PI * k) / n; return stretchOf(rig, lookPose(rig, L.bones, Y * Math.cos(a), P * Math.sin(a), f)); }));
  if (!L.bones.length) held.push('no look bones');
  if (off.length) held.push(`look bones not live: ${off.join(', ')}`);
  if (L.yaw % 5 || L.pitch % 5 || L.yaw > LOOK_MAX || L.pitch > LOOK_MAX) held.push(`yaw ${L.yaw}, pitch ${L.pitch} (want whole 5 deg up to ${LOOK_MAX})`);
  const w = ell(L.yaw, L.pitch, LOOK_DIRS);
  if (w > AR4_MAX) held.push(`the look ellipse ${L.yaw} x ${L.pitch} deg stretches ${w.toFixed(3)}x`);
  if (L.yaw < LOOK_MAX) { const b = ell(L.yaw + 5, 0, 2); if (b <= AR4_MAX) tight.push(`yaw ${L.yaw + 5} still holds (${b.toFixed(3)}x)`); }
  if (L.pitch < LOOK_MAX) { const b = ell(L.yaw, L.pitch + 5, LOOK_DIRS); if (b <= AR4_MAX) tight.push(`pitch ${L.pitch + 5} still holds (${b.toFixed(3)}x)`); }
  return [held, tight];
}
const EXPECTED = ['dog', 'cat_sleeping', 'goat', 'chicken', 'duck', 'sheep', 'hare'];
// each animal's clips and their types (the dog has nine)
const EXPECTED_CLIPS = {
  dog: { Idle: 'loop', Walk: 'loop', Sniff: 'loop', Sit: 'hold', Lie: 'hold', Sleep: 'loop', PlayBow: 'once', Scratch: 'once', Happy: 'once' },
  cat_sleeping: { Sleep: 'loop', EarTwitch: 'once', TailFlick: 'once', Peek: 'once' },
  goat: { Idle: 'loop', Walk: 'loop', Graze: 'loop', Chew: 'loop', Hop: 'once', HeadShake: 'once' },
  chicken: { Idle: 'loop', Walk: 'loop', Peck: 'once', Scratch: 'once', Flap: 'once', Fluff: 'once' },
  duck: { Idle: 'loop', Paddle: 'loop', Preen: 'once', Dabble: 'once', Shake: 'once' },
  sheep: { Idle: 'loop', Walk: 'loop', Graze: 'loop', Hop: 'once', Bleat: 'once' },
  hare: { Idle: 'loop', Look: 'once', EarTwitch: 'once', Groom: 'once', Hop: 'once', Alert: 'once' },
};
// each animal's own pose checks (the cat has none beyond AR1-AR7, sink, pops and the look clamp)
const POSES = { dog: dogPoses, goat: goatPoses, chicken: chickenPoses, duck: duckPoses, sheep: sheepPoses, hare: harePoses };
const MODELS = path.join(root, 'public', 'models'), PROBES = path.join(root, 'art', 'blender', 'rigs', 'probes');
let rigs = { animals: {} };
try { rigs = readJson(path.join(MODELS, 'rigs.json')); } catch (e) { ok('B public/models/rigs.json reads', false, String(e)); }
for (const id of EXPECTED) { const e = rigs.animals[id];
  ok(`B ${id} is in rigs.json with its file`, !!e && fs.existsSync(path.join(MODELS, e.file)), e ? e.file : 'no entry');
  const want = EXPECTED_CLIPS[id] || {}, have = (e && e.clips) || {};
  const wrong = [...Object.keys(want).filter((c) => !have[c]).map((c) => `missing ${c}`), ...Object.keys(have).filter((c) => !want[c]).map((c) => `extra ${c}`),
    ...Object.keys(want).filter((c) => have[c] && have[c].type !== want[c]).map((c) => `${c} is ${have[c].type}, want ${want[c]}`)];
  ok(`B ${id} has its clips (${Object.keys(want).length})`, Object.keys(want).length > 0 && !wrong.length, Object.keys(want).length ? wrong.join('; ') : 'no EXPECTED_CLIPS entry'); }
const ids = Object.keys(rigs.animals).sort();
console.log(`\n  Part B: ${ids.length} animals${ids.length ? ' (' + ids.join(', ') + ')' : ''} in public/models/rigs.json`);
for (const id of ids) {
  const entry = rigs.animals[id], pf = path.join(PROBES, id + '.probe.json'), load = () => loadRig(path.join(MODELS, entry.file));
  let res;
  try { res = await run(entry, MODELS, fs.existsSync(pf) ? readJson(pf) : undefined); } catch (e) { ok(`B ${id} loads`, false, String(e.stack || e)); continue; }
  if (!fs.existsSync(pf)) res.AR7.push(`no probe at ${path.relative(root, pf)}`);
  for (const [k, errs] of Object.entries(res)) ok(`B ${id} ${k} ${LABEL[k]}`, !errs.length, errs.join('; '));
  if (fs.existsSync(pf)) {   // the toolkit's probe samples every clip at frames 0, n/4, n/2, 3n/4 and n (floored), every frame when n <= 10
    const times = readJson(pf).times, short = [];
    for (const [c, E] of Object.entries(entry.clips)) {
      const n = Math.round(E.duration * 30), want = n <= 10 ? [...Array(n + 1).keys()] : [0, 1, 2, 3, 4].map((k) => Math.floor((k * n) / 4));
      const missing = want.filter((f) => !(times[c] || []).some((t) => Math.abs(t - f / 30) < 1e-4));
      if (missing.length) short.push(`${c} lacks frames ${missing.join(',')}`);
    }
    ok(`B ${id} probe samples every clip at its quarters`, !short.length, short.join('; '));
  }
  const walk = entry.clips.Walk;
  if (walk && walk.stride !== undefined) { const bad = stanceOffGround(await load(), walk); ok(`B ${id} Walk stance paws on the ground (+-${PLANT} u)`, !bad.length, bad.join('; ')); }
  { const [held, tight] = lookClamp(await load(), entry), L = entry.look || {};
    ok(`B ${id} look clamp ${L.yaw} x ${L.pitch} deg on ${(L.bones || []).join('+')} keeps AR4 <= ${AR4_MAX}`, !held.length, held.join('; '));
    ok(`B ${id} look clamp is measured: 5 deg more yaw or pitch breaks ${AR4_MAX}`, !tight.length, tight.join('; ')); }
  const { sunk, pops, dives, popMin } = motion(await load(), entry, id);
  ok(`B ${id} nothing sinks more than ${SINK} u into the ground at 1/${HZ} s`, !sunk.length, sunk.join('; '));
  for (const [c, X] of Object.entries(FLOAT_DIVE[id] || {})) {   // the named exception holds where it is named
    const d = dives.find((x) => x.clip === c);
    ok(`B ${id} ${c}: its ${X.bones.join(' and ')} vertices stay within ${X.below} u under the waterline`, !!d && d.count > 0 && d.low >= WATERLINE - X.below, d ? `${d.count} vertices, lowest ${mm(d.low)} mm at ${d.at.toFixed(3)} s` : `no ${c} clip`);
  }
  const allowed = Object.entries(POP_ALLOW[id] || {}).map(([c, b]) => `${c} ${b.join('/')}`).join(', ');
  ok(`B ${id} no one-frame pops at 1/${HZ} s (floor ${mm(popMin)} mm for its size${allowed ? `; allowed: ${allowed}` : ''})`, !pops.length, pops.join('; '));
  if (POSES[id]) { const X = mk(await load(), entry); POSES[id](X); for (const [name, e] of X.out) ok(`B ${id} ${name}`, !e.length, e.join('; ')); }
}
// the sheep's rig source (the Meshy sheep, fitted by art/scripts/rig-fit-source.mjs) keeps sheep.glb's size template so the game's placement still holds: height and length each within
// FIT_SIZE of sheep.glb's, its hooves' footprint centre (the vertices within 0.01 u of the lowest point, split at their centroid into four feet, the feet's centres averaged) within FIT_FOOT of (0, 0), lowest point on y 0
const SHEEP_SIZED = path.join(MODELS, 'sheep_meshy_sized.glb'), SHEEP_TEMPLATE = path.join(MODELS, 'sheep.glb'), FIT_SIZE = 0.035, FIT_FOOT = 0.001;
function footprint(P) {   // { size, low, feet, foot: [x, z] } of flat xyz positions
  const pts = Array.from({ length: P.length / 3 }, (_, i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
  const mn = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))), mx = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
  const sole = pts.filter((p) => p[1] <= mn[1] + 0.01), c = [0, 2].map((k) => sole.reduce((s, p) => s + p[k], 0) / sole.length), feet = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const f = sole.filter((p) => Math.sign(p[0] - c[0] || 1) === sx && Math.sign(p[2] - c[1] || 1) === sz);
    if (f.length) feet.push([0, 2].map((k) => f.reduce((s, p) => s + p[k], 0) / f.length));
  }
  return { size: mx.map((v, k) => v - mn[k]), low: mn[1], feet: feet.length, foot: [0, 1].map((k) => feet.reduce((s, f) => s + f[k], 0) / Math.max(feet.length, 1)) };
}
{ const e = [];
  try {
    const A = footprint((await loadSource(SHEEP_SIZED)).positions), T = footprint((await loadSource(SHEEP_TEMPLATE)).positions);
    for (const [k, name] of [[1, 'height'], [2, 'length']]) { const r = A.size[k] / T.size[k] - 1; if (Math.abs(r) > FIT_SIZE) e.push(`${name} ${A.size[k].toFixed(4)} is ${(100 * r).toFixed(1)} % off sheep.glb's ${T.size[k].toFixed(4)}`); }
    if (A.feet !== 4) e.push(`${A.feet} feet in the footprint`);
    if (Math.hypot(...A.foot) > FIT_FOOT) e.push(`footprint centre (${A.foot.map((v) => mm(v)).join(', ')}) mm`);
    if (Math.abs(A.low) > 1e-4) e.push(`lowest point y ${A.low.toFixed(5)}`);
  } catch (err) { e.push(String(err.stack || err)); }
  ok(`B sheep source sheep_meshy_sized.glb keeps sheep.glb's size (height, length within ${(100 * FIT_SIZE).toFixed(1)} %), footprint on (0, 0), base on y 0`, !e.length, e.join('; ')); }

console.log('  ' + '-'.repeat(60) + `\n  ${pass}/${pass + fail} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
