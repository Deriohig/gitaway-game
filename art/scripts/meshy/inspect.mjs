// node inspect.mjs <file.glb>  -- tris, meshes, materials, textures, bounds
import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
let tris = 0;
for (const mesh of root.listMeshes()) {
  for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices(); const pos = p.getAttribute('POSITION');
    const n = idx ? idx.getCount() / 3 : pos.getCount() / 3; tris += n;
    console.log('mesh', JSON.stringify(mesh.getName()), 'prim tris', n, 'verts', pos.getCount(), 'attrs', p.listSemantics().join(','), 'mat', p.getMaterial()?.getName());
  }
}
for (const m of root.listMaterials()) console.log('material', JSON.stringify(m.getName()), 'base', m.getBaseColorFactor().map((v) => v.toFixed(2)).join(','), 'map', !!m.getBaseColorTexture(), 'metal', m.getMetallicFactor(), 'rough', m.getRoughnessFactor(), 'emis', m.getEmissiveFactor().join(','));
for (const t of root.listTextures()) { const s = t.getSize(); console.log('texture', JSON.stringify(t.getName()), t.getMimeType(), s && s.join('x'), Math.round(t.getImage().byteLength / 1024) + ' KB'); }
for (const n of root.listNodes()) console.log('node', JSON.stringify(n.getName()), 't', n.getTranslation().map((v) => v.toFixed(3)).join(','), 'r', n.getRotation().map((v) => v.toFixed(3)).join(','), 's', n.getScale().map((v) => v.toFixed(3)).join(','), 'mesh', !!n.getMesh());
let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { const a = p.getAttribute('POSITION'); const e = [0, 0, 0];
  for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], e[k]); mx[k] = Math.max(mx[k], e[k]); } } }
console.log('TOTAL tris', tris, 'bounds min', mn.map((v) => v.toFixed(3)).join(','), 'max', mx.map((v) => v.toFixed(3)).join(','), 'size', mx.map((v, k) => (v - mn[k]).toFixed(3)).join(' x '));
