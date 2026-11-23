/** Small seeded PRNG (mulberry32) so the world looks the same on every load. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A steady 0..1 from a spot, so each rock keeps its model and its turn (Nature.tsx Rock). */
export function spotHash(x: number, z: number): number {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return v - Math.floor(v)
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
