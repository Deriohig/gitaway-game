// geometry.mjs
// Thin convenience wrappers over THREE core geometry generators plus a custom
// triangular-prism "gable" helper. Core `three` only -- NO three/examples/jsm.
// Every helper returns a THREE.BufferGeometry already positioned in world space
// (use .translate/.scale/.rotateX/Y/Z to place parts).

import {
  BoxGeometry,
  CylinderGeometry,
  ConeGeometry,
  IcosahedronGeometry,
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';

export function box(w, h, d, ws = 1, hs = 1, ds = 1) {
  return new BoxGeometry(w, h, d, ws, hs, ds);
}

// Cylinder with explicit top/bottom radius so trunks/logs can taper.
export function cyl(rTop, rBottom, height, radialSegments = 8, openEnded = false) {
  return new CylinderGeometry(rTop, rBottom, height, radialSegments, 1, openEnded);
}

export function cone(radius, height, radialSegments = 8) {
  return new ConeGeometry(radius, height, radialSegments);
}

// Faceted lump. detail 0 = 20 tris, detail 1 = 80 tris.
export function ico(radius, detail = 1) {
  return new IcosahedronGeometry(radius, detail);
}

// Triangular-prism gable roof, centred at origin, base on y = 0.
//   w = full span across the ridge (along Z), the eave-to-eave width
//   h = peak height above the base (ridge at y = h, z = 0)
//   L = full length along the ridge (along X)
// Ridge runs along X at (y = h, z = 0); slopes fall to z = +/- w/2 at y = 0.
// Solid (5 faces, 8 triangles): two gable-end triangles, two slopes, one floor.
export function gablePrism(w, h, L) {
  const x0 = -L / 2, x1 = L / 2;
  const zn = -w / 2, zp = w / 2;
  // named corners
  const BLN = [x0, 0, zn], BRN = [x1, 0, zn];
  const BLP = [x0, 0, zp], BRP = [x1, 0, zp];
  const RN = [x0, h, 0], RP = [x1, h, 0]; // ridge ends

  const tris = [
    // -Z slope
    BLN, BRN, RP, BLN, RP, RN,
    // +Z slope
    BRP, BLP, RN, BRP, RN, RP,
    // floor (-Y)
    BLN, BLP, BRP, BLN, BRP, BRN,
    // -X gable end
    BLN, RN, BLP,
    // +X gable end
    BRN, BRP, RP,
  ];

  const arr = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    arr[i * 3] = tris[i][0];
    arr[i * 3 + 1] = tris[i][1];
    arr[i * 3 + 2] = tris[i][2];
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(arr, 3));
  return g;
}
