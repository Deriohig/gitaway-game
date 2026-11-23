// jitter.mjs
// Seeded, position-coherent vertex jitter for a hand-made feel.
//
// We hash each vertex's (quantized) position and seed a mulberry32 PRNG from it,
// so two vertices that sit at the SAME position get the SAME offset. That keeps
// an icosphere (which THREE emits as non-indexed, with duplicated corner
// positions) watertight after jittering instead of cracking apart.

// mulberry32: tiny deterministic PRNG, returns a function -> float in [0,1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a string hash -> uint32
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Jitter a THREE.BufferGeometry in place. `amp` is the max nudge (metres).
// Offsets are coherent per world position so shared seams stay welded.
// opts:
//   axisScale [sx,sy,sz] -- per-axis multiplier on amp (default [1,1,1])
//   filter (x,y,z)=>bool -- only jitter vertices that pass (default: all)
// Returns the same geometry for chaining.
export function jitter(geometry, amp = 0.05, seed = 1, opts = {}) {
  const axis = opts.axisScale || [1, 1, 1];
  const filter = opts.filter || null;
  const pos = geometry.attributes.position;
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (filter && !filter(x, y, z)) continue;
    const key =
      Math.round(x * 1000) + ',' + Math.round(y * 1000) + ',' + Math.round(z * 1000);
    let off = cache.get(key);
    if (!off) {
      const rnd = mulberry32(fnv1a(key) ^ (seed * 0x9e3779b1));
      off = [
        (rnd() * 2 - 1) * amp * axis[0],
        (rnd() * 2 - 1) * amp * axis[1],
        (rnd() * 2 - 1) * amp * axis[2],
      ];
      cache.set(key, off);
    }
    pos.setXYZ(i, x + off[0], y + off[1], z + off[2]);
  }
  pos.needsUpdate = true;
  return geometry;
}
