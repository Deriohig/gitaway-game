// Deterministic "randomness" for the rules: the same parts always give the
// same number, on every device and after every reload, so nothing random is
// ever stored in a save. Seed it with `state.createdAt` plus whatever makes a
// roll distinct, e.g. hash01(s.createdAt, 'visit', period).

/** A stable number in [0, 1) from the given parts (FNV-1a, then a murmur3 finaliser). */
export function hash01(...parts: (string | number)[]): number {
  const input = parts.map(String).join('\u001f')
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 0x1_0000_0000
}

/** Picks one item with hash01; undefined for an empty list. */
export function hashPick<T>(items: readonly T[], ...parts: (string | number)[]): T | undefined {
  return items.length ? items[Math.floor(hash01(...parts) * items.length)] : undefined
}
