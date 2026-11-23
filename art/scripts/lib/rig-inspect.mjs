// rig-inspect.mjs -- loads a rigged animal GLB the way the game does (three.js GLTFLoader) and poses it, for lib/rig-checks.mjs.
//   loadRig(glb) -> { doc, json, scene, mesh, clips, bones, tris, kb, imageBytes }: doc (gltf-transform) and json (the GLB's JSON
//     chunk) for the file's contract, scene / mesh / clips from GLTFLoader, bones = the skin's joint names in skin order
//   loadSource(glb) -> { positions, box, tris, imageBytes }: the unrigged model, every mesh node in model space
//   poseAt(rig, clip | null, t) -> Float32Array: skinned positions in model space; null is the default pose (the joint nodes' TRS)
//   lookPose(rig, bones, yaw, pitch, facing) -> the default pose with a live look as the game applies it (ruling R31)
//   stretchOf(rig, P) -> the largest edge stretch of positions P against the default pose (AR4's measure)
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const io = new NodeIO();

// an entry's id, from its file: dog_rig.glb -> dog (a fixture's good.glb -> good). The material carries it (AR1, rig-finalize.mjs)
export const rigId = (entry) => path.basename(entry.file).replace(/(_rig)?\.glb$/, '');

export function boxOf(P) {   // flat xyz array -> { mn, mx, size, c }
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
  return { mn, mx, size: mx.map((v, k) => v - mn[k]), c: mx.map((v, k) => (v + mn[k]) / 2) };
}

const trisOf = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
  .reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
const imageOf = (doc) => { const t = doc.getRoot().listTextures(); return t.length ? t[0].getImage() : new Uint8Array(0); };

export async function loadRig(glbPath) {
  const bytes = new Uint8Array(fs.readFileSync(glbPath)), doc = await io.readBinary(bytes), { json } = await io.binaryToJSON(bytes);
  const skin = doc.getRoot().listSkins()[0];
  // GLTFLoader in Node cannot decode images, so three gets a copy without textures
  const bare = await io.readBinary(bytes);
  for (const t of bare.getRoot().listTextures()) t.dispose();
  const glb = await io.writeBinary(bare), gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
  let mesh = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  gltf.scene.updateMatrixWorld(true);
  return { doc, json, scene: gltf.scene, mesh, clips: gltf.animations, bones: skin ? skin.listJoints().map((n) => n.getName()) : [],
    tris: trisOf(doc), kb: bytes.length / 1024, imageBytes: imageOf(doc) };
}

export async function loadSource(glbPath) {
  const doc = await io.readBinary(new Uint8Array(fs.readFileSync(glbPath))), P = [], e = [0, 0, 0];
  for (const n of doc.getRoot().listNodes()) {
    const m = n.getMesh(); if (!m) continue;
    const w = n.getWorldMatrix();
    for (const p of m.listPrimitives()) {   // only the vertices its faces use
      const A = p.getAttribute('POSITION'), ix = p.getIndices();
      for (const i of ix ? new Set(ix.getArray()) : Array.from({ length: A.getCount() }, (_, k) => k)) {
        A.getElement(i, e);
        P.push(w[0] * e[0] + w[4] * e[1] + w[8] * e[2] + w[12], w[1] * e[0] + w[5] * e[1] + w[9] * e[2] + w[13], w[2] * e[0] + w[6] * e[1] + w[10] * e[2] + w[14]);
      }
    }
  }
  const positions = Float32Array.from(P);
  return { positions, box: boxOf(positions), tris: trisOf(doc), imageBytes: imageOf(doc) };
}

const POSERS = new WeakMap();
function poser(rig) {   // a private SkeletonUtils clone per rig with its own mixer, so posing never moves rig.scene
  let p = POSERS.get(rig);
  if (!p) {
    const root = SkeletonUtils.clone(rig.scene), rest = [];
    let mesh = null;
    root.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; rest.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
    POSERS.set(rig, (p = { root, mesh, rest, mixer: new THREE.AnimationMixer(root) }));
  }
  return p;
}

export function poseAt(rig, clip, t) {
  const p = poser(rig);
  atRest(p);
  if (clip !== null) {
    const c = rig.clips.find((x) => x.name === clip);
    if (!c) throw new Error(`no clip ${clip}`);
    const a = p.mixer.clipAction(c);
    a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;   // t = duration samples the last frame instead of wrapping to the first
    a.reset().play();
    p.mixer.setTime(t);
  }
  return skinned(p);
}
function skinned(p) {   // the clone's skinned positions in model space
  const n = p.mesh.geometry.attributes.position.count, out = new Float32Array(n * 3), v = new THREE.Vector3();
  p.root.updateMatrixWorld(true);
  for (let i = 0; i < n; i++) { p.mesh.getVertexPosition(i, v).applyMatrix4(p.mesh.matrixWorld); out[3 * i] = v.x; out[3 * i + 1] = v.y; out[3 * i + 2] = v.z; }
  return out;
}
function atRest(p) {
  p.mixer.stopAllAction();
  for (const [o, P, Q, S] of p.rest) { o.position.copy(P); o.quaternion.copy(Q); o.scale.copy(S); }
}

// lookPose(rig, bones, yaw, pitch, facing) -> skinned positions of the default pose with a live look applied as the game applies
// it (ruling R31): the look turns yaw deg about the model's up axis and pitch deg about the animal's left axis (up x forward;
// positive pitch: nose down), pitch first; it is split evenly over `bones`, and each bone, parent first, turns its share in the
// model's axes about its own joint (its local rotation becomes Wp^-1 S Wp q, Wp its parent's world rotation, S the share)
const LEFT_AXIS = { '+Z': [1, 0, 0], '+X': [0, 0, -1] };
export function lookPose(rig, bones, yaw, pitch, facing = '+Z') {
  const p = poser(rig), n = Math.max(bones.length, 1), D = Math.PI / 180;
  atRest(p);
  const S = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (yaw / n) * D)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...LEFT_AXIS[facing]), (pitch / n) * D));
  const depth = (o) => { let d = 0; for (let x = o; x.parent; x = x.parent) d++; return d; };
  const objs = bones.map((b) => p.root.getObjectByName(b)).sort((a, b) => depth(a) - depth(b));
  for (const o of objs) {
    p.root.updateMatrixWorld(true);
    const Wp = o.parent.getWorldQuaternion(new THREE.Quaternion());
    o.quaternion.premultiply(Wp.clone().invert().multiply(S).multiply(Wp));
  }
  return skinned(p);
}

// the largest edge stretch of positions P against the default pose (AR4's measure: triangle edges of 1e-4 u or more there)
const EDGES = new WeakMap();
export function stretchOf(rig, P) {
  let e = EDGES.get(rig);
  if (!e) {
    const D = poseAt(rig, null, 0), ix = rig.mesh.geometry.index.array, n = D.length / 3, seen = new Set();
    const d = (a, b) => Math.hypot(D[3 * a] - D[3 * b], D[3 * a + 1] - D[3 * b + 1], D[3 * a + 2] - D[3 * b + 2]);
    e = [];
    for (let t = 0; t < ix.length; t += 3) for (const [a, b] of [[ix[t], ix[t + 1]], [ix[t + 1], ix[t + 2]], [ix[t + 2], ix[t]]]) {
      const k = Math.min(a, b) * n + Math.max(a, b);
      if (!seen.has(k) && d(a, b) >= 1e-4) e.push([a, b, d(a, b)]);
      seen.add(k);
    }
    EDGES.set(rig, e);
  }
  let w = 0;
  for (const [a, b, l0] of e) w = Math.max(w, Math.hypot(P[3 * a] - P[3 * b], P[3 * a + 1] - P[3 * b + 1], P[3 * a + 2] - P[3 * b + 2]) / l0);
  return w;
}
