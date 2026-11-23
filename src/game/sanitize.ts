// Small helpers for turning whatever was found in storage into valid values.
// Used by `migrate` and by each system's `sanitize<Name>`: junk is repaired or
// dropped, never trusted.

export type Raw = Record<string, unknown>

export const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A whole, non-negative number, clamped to `max`. */
export const count = (v: unknown, fallback = 0, max = 1e9): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : fallback

/** A finite number within a range, kept as is (fractions allowed). */
export const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/**
 * A fraction of a point of XP carried over (see `carryXp` in core.ts), in
 * [0, 1). Never a whole point or more: a carry like that was never saved, so
 * it's junk and starts again from nothing.
 */
export const xpCarry = (v: unknown): number => {
  const carry = num(v, 0, 0)
  return carry < 1 ? carry : 0
}

/** A timestamp in ms, or null. */
export const time = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

export const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback

export const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)

/** A trimmed string of at most `max` characters. */
export const text = (v: unknown, max: number, fallback = ''): string => (typeof v === 'string' ? v.trim().slice(0, max) : fallback)

/**
 * Whether a raw value is one of a table's own ids. Never `key in table` or a
 * bare `table[key]`: those also find what every object inherits, such as
 * 'toString' or '__proto__'.
 */
export const ownKey = <T extends object>(table: T, key: unknown): key is Extract<keyof T, string> =>
  typeof key === 'string' && Object.hasOwn(table, key)

/** Reads a field of something that may not be an object. */
export const field = (raw: unknown, key: string): unknown => (isObj(raw) ? raw[key] : undefined)

/** A map from known ids to whole counts. Unknown ids and junk values are dropped. */
export function countMap<K extends string>(v: unknown, ids: readonly K[], max = 1e9): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {}
  if (!isObj(v)) return out
  for (const id of ids) {
    const value = v[id]
    if (typeof value === 'number' && Number.isFinite(value)) out[id] = count(value, 0, max)
  }
  return out
}

/** A map from known ids to timestamps. Unknown ids and junk values are dropped. */
export function timeMap<K extends string>(v: unknown, ids: readonly K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {}
  if (!isObj(v)) return out
  for (const id of ids) {
    const t = time(v[id])
    if (t !== null) out[id] = t
  }
  return out
}
