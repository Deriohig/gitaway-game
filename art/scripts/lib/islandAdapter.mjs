// islandAdapter.mjs -- the THIN three.js adapter for the island core (lib/terrain.mjs).
// =============================================================================
// The core is three-free: buildIsland / buildBlueprint return per-piece typed arrays
// (positions, normals, colors -- non-indexed, one corner per row, island-LOCAL coordinates around
// the piece pivot) plus the contract functions height / outline / random. This file turns one
// piece into the game's `Island` shape (src/world/terrain.ts) and a three.js group whose pivot is
// the piece's local origin, so the game's `Rising` (position-y from -9 to 0) works unchanged.
// THREE is passed in (no import), so the same file runs in node tests, the proof viewer and the game.
//   buildIslandGeometry(THREE, piece)      -> BufferGeometry (position, normal, color; tag groups)
//   islandContract(THREE, piece, spec)     -> { spec, geometry, height, outline, random }
//   pieceGroup(THREE, piece, material)     -> Group at piece.pivot holding the island mesh
// Vertex colours are LINEAR (built like THREE.Color.set(hex)); normals: smooth on gentle grass,
// flat (per face) on rock, so materials must NOT force flatShading.
// =============================================================================

export function buildIslandGeometry(THREE, piece, opts = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(piece.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(piece.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(piece.colors, 3));
  if (opts.groups !== false && piece.tags) {          // contiguous runs of the same face tag -> groups
    let start = 0;
    for (let t = 1; t <= piece.faceCount; t++) {
      if (t === piece.faceCount || piece.tags[t] !== piece.tags[start]) { g.addGroup(start * 3, (t - start) * 3, 0); start = t; }
    }
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData.islandId = piece.id;
  return g;
}

export function islandContract(THREE, piece, spec) {
  return { spec: spec || { id: piece.id, depth: piece.depth }, geometry: buildIslandGeometry(THREE, piece), height: piece.height, outline: piece.outline, random: piece.random };
}

export function pieceGroup(THREE, piece, material, opts = {}) {
  const group = new THREE.Group();
  group.name = 'piece:' + piece.id;
  group.position.set(piece.pivot[0], piece.pivot[1], piece.pivot[2]);
  const mesh = new THREE.Mesh(buildIslandGeometry(THREE, piece, opts), material);
  mesh.name = 'island:' + piece.id;
  mesh.receiveShadow = true; mesh.castShadow = opts.castShadow !== false;
  group.add(mesh);
  group.userData.piece = piece.id;
  return { group, mesh };
}

export default { buildIslandGeometry, islandContract, pieceGroup };
