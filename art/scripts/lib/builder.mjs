// builder.mjs
// Turns an asset definition (parts + special pivot nodes) into a glTF 2.0 .glb.
//
// An asset's build() returns:
//   { parts: [ { node?, material, geometry } ... ],
//     nodes: { <Name>: { translation:[x,y,z], empty?:true } } }
//
// Flat shading: for each (node, material) group we convert every part to
// non-indexed, concatenate POSITION into one Float32Array, rebuild a
// BufferGeometry and computeVertexNormals() -> per-face (flat) normals. We then
// export POSITION + NORMAL only -- except for a painted (textured) material: a
// build() may return `textures: { <material>: {name, mimeType, image} }`, and
// parts with that material also carry TEXCOORD_0 (+ COLOR_0 shade) into one
// textured material (the painted atlas, lib/paintedAtlas.mjs).
//
// Scene graph: a root Node named after the asset id holds all un-named ("base")
// parts as its mesh. Each special pivot is a child Node named exactly, with
// translation = the pivot point; its geometry is authored in world space and
// offset by -pivot so engine rotation about the pivot is correct. A node marked
// empty (e.g. Smoke) gets no mesh.

import { BufferGeometry, Float32BufferAttribute } from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import { getMaterial, texturedMaterial } from './materials.mjs';

// Merge part geometries into one flat-shaded BufferGeometry (POSITION + NORMAL). A TEXTURED group (its material is one of the
// build's `textures`, the painted atlas of lib/paintedAtlas.mjs) also carries each part's atlas uvs (TEXCOORD_0) and, when any part
// has them, its baked per-vertex shade (COLOR_0; parts without it get white).
function mergeFlat(geoms, textured = false, label = '') {
  const parts = geoms.map((g) => (g.index ? g.toNonIndexed() : g)); // icospheres are already non-indexed
  const cat = (name, size, fill) => {
    const out = new Float32Array(parts.reduce((s, g) => s + g.attributes.position.count * size, 0));
    let off = 0;
    for (const g of parts) { const a = g.attributes[name]; const len = g.attributes.position.count * size;
      if (a) out.set(a.array.subarray(0, len), off); else out.fill(fill, off, off + len); off += len; }
    return out;
  };
  const geom = new BufferGeometry();
  geom.setAttribute('position', new Float32BufferAttribute(cat('position', 3, 0), 3));
  if (textured) {
    const bad = geoms.filter((g) => !g.userData.atlas).length;
    if (bad) throw new Error(`${label}: ${bad} part(s) of a textured material without atlas uvs (paintedAtlas.mapUV)`);
    geom.setAttribute('uv', new Float32BufferAttribute(cat('uv', 2, 0), 2));
    if (parts.some((g) => g.attributes.color)) geom.setAttribute('color', new Float32BufferAttribute(cat('color', 3, 1), 3));
  }
  geom.computeVertexNormals(); // non-indexed -> flat per-face normals
  return geom;
}

function addPrimitive(doc, buffer, geom, material) {
  const acc = (type, arr) => doc.createAccessor().setType(type).setBuffer(buffer).setArray(Float32Array.from(arr));
  if (geom.attributes.uv) return addPainted(doc, buffer, geom, material);
  return doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', geom.attributes.position.array))
    .setAttribute('NORMAL', acc('VEC3', geom.attributes.normal.array))
    .setMaterial(material);
}

// A painted primitive, kept small (the 200 KB rule with a texture inside): the flat-shaded corners are welded where position,
// normal, uv and shade all agree (a box face's two triangles share an edge) into an indexed primitive, the uvs are normalised
// uint16 and the shade normalised uint8 RGBA (both core glTF 2.0, no extension). Same order every run: deterministic.
function addPainted(doc, buffer, geom, material) {
  const P = geom.attributes.position.array, N = geom.attributes.normal.array, U = geom.attributes.uv.array, C = geom.attributes.color && geom.attributes.color.array;
  const seen = new Map(), pos = [], nor = [], uv = [], col = [], idx = [];
  for (let i = 0; i < P.length / 3; i++) {
    const u = [Math.round(Math.min(1, Math.max(0, U[i * 2])) * 65535), Math.round(Math.min(1, Math.max(0, U[i * 2 + 1])) * 65535)];
    const c = C ? [0, 1, 2].map((q) => Math.round(Math.min(1, Math.max(0, C[i * 3 + q])) * 255)) : null;
    const key = `${P[i * 3]},${P[i * 3 + 1]},${P[i * 3 + 2]},${N[i * 3]},${N[i * 3 + 1]},${N[i * 3 + 2]},${u}${c ? ',' + c : ''}`;
    let j = seen.get(key);
    if (j === undefined) { j = seen.size; seen.set(key, j); pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); nor.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); uv.push(...u); if (c) col.push(...c, 255); }
    idx.push(j);
  }
  const a = (type, arr, norm = false) => doc.createAccessor().setType(type).setBuffer(buffer).setArray(arr).setNormalized(norm);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', a('VEC3', Float32Array.from(pos)))
    .setAttribute('NORMAL', a('VEC3', Float32Array.from(nor)))
    .setAttribute('TEXCOORD_0', a('VEC2', Uint16Array.from(uv), true))
    .setIndices(a('SCALAR', seen.size < 65536 ? Uint16Array.from(idx) : Uint32Array.from(idx)))
    .setMaterial(material);
  if (C) prim.setAttribute('COLOR_0', a('VEC4', Uint8Array.from(col), true));
  return prim;
}

export async function buildAsset(asset, outPath) {
  // textures: { <material name>: { name, mimeType, image } } -- parts with that material are drawn with it (lib/paintedAtlas.mjs)
  const { parts, nodes = {}, textures = {} } = asset.build();

  const doc = new Document();
  doc.getRoot().getAsset().generator = 'gitaway-art-pipeline';
  const buffer = doc.createBuffer();
  const scene = doc.createScene(asset.id);
  doc.getRoot().setDefaultScene(scene);
  const root = doc.createNode(asset.id);
  scene.addChild(root);

  const matCache = new Map();
  const mat = (key) => {
    if (!matCache.has(key)) matCache.set(key, textures[key] ? texturedMaterial(doc, key, textures[key]) : getMaterial(doc, key));
    return matCache.get(key);
  };

  // Bucket parts by their node (default 'base').
  const byNode = new Map([['base', []]]);
  for (const name of Object.keys(nodes)) byNode.set(name, []);
  for (const p of parts) {
    const n = p.node || 'base';
    if (!byNode.has(n)) byNode.set(n, []);
    byNode.get(n).push(p);
  }

  let triCount = 0;

  const buildMesh = (meshName, nodeParts, pivot) => {
    if (!nodeParts || nodeParts.length === 0) return null;
    if (pivot) {
      for (const p of nodeParts) p.geometry.translate(-pivot[0], -pivot[1], -pivot[2]);
    }
    const byMat = new Map();
    for (const p of nodeParts) {
      if (!byMat.has(p.material)) byMat.set(p.material, []);
      byMat.get(p.material).push(p.geometry);
    }
    const mesh = doc.createMesh(meshName);
    for (const [matKey, geoms] of byMat) {
      const merged = mergeFlat(geoms, !!textures[matKey], `${meshName}/${matKey}`);
      triCount += merged.attributes.position.count / 3;
      mesh.addPrimitive(addPrimitive(doc, buffer, merged, mat(matKey)));
    }
    return mesh;
  };

  // Base mesh (un-named parts) hangs on the root node.
  const baseMesh = buildMesh(`${asset.id}_base`, byNode.get('base'), null);
  if (baseMesh) root.setMesh(baseMesh);

  // Special pivot nodes.
  for (const [name, cfg] of Object.entries(nodes)) {
    const node = doc.createNode(name).setTranslation(cfg.translation || [0, 0, 0]);
    if (!cfg.empty) {
      const mesh = buildMesh(name, byNode.get(name), cfg.translation || [0, 0, 0]);
      if (mesh) node.setMesh(mesh);
    }
    root.addChild(node);
  }

  const io = new NodeIO();
  await io.write(outPath, doc);

  return { tris: Math.round(triCount) };
}

// Read a .glb back to confirm it parses, and report its structure.
export async function inspectGlb(path) {
  const io = new NodeIO();
  const doc = await io.read(path);
  const root = doc.getRoot();
  const nodes = root.listNodes().map((n) => n.getName());
  const materials = root.listMaterials().map((m) => m.getName());
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
      if (pos) tris += (idx ? idx.getCount() : pos.getCount()) / 3;   // indexed (the Meshy remakes) or not (the procedural assets)
    }
  }
  return { nodes, materials, tris: Math.round(tris) };
}
