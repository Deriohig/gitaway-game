// The island studio (B5, A5 variants): where things stand, what colour they
// are, and which look the fixed buildings wear. Purely cosmetic.

import { ITEMS, type ItemId } from '../config'
import type { Notice } from '../result'
import { count, isObj, field, num } from '../sanitize'
import type { GameState, Placement } from '../state'

export type VariantSlot = 'roof' | 'sails' | 'bench' | 'scarecrow' | 'wellRoof' | 'greenhouse' | 'lighthouse'

/** How many looks each slot offers. Look 0 is the original. */
export const VARIANTS: Record<VariantSlot, number> = {
  roof: 3,
  sails: 3,
  bench: 2,
  scarecrow: 3,
  wellRoof: 2,
  greenhouse: 2,
  lighthouse: 3,
}

export const VARIANT_SLOTS = Object.keys(VARIANTS) as VariantSlot[]

/** Palette swatches per object. */
export const TINT_SWATCHES = 8

/** How far from an island's centre a placement may be stored, in world units. */
const PLACE_LIMIT = 40

/** The key for one placed thing: `${itemId}#${index}`. */
export const slotKey = (item: ItemId, index: number): string => `${item}#${index}`

export function parseSlotKey(key: string): { item: ItemId; index: number } | null {
  const m = /^([a-zA-Z]+)#(\d{1,2})$/.exec(key)
  if (!m || !Object.hasOwn(ITEMS, m[1])) return null
  const item = m[1] as ItemId
  const index = Number(m[2])
  return index < ITEMS[item].max ? { item, index } : null
}

export function sanitizeStudio(raw: unknown, _base: GameState, _now: number): Pick<GameState, 'placements' | 'tints' | 'variants'> {
  const placements: Record<string, Placement> = {}
  const rawPlacements = field(raw, 'placements')
  if (isObj(rawPlacements)) {
    for (const [key, p] of Object.entries(rawPlacements)) {
      if (!parseSlotKey(key) || !isObj(p)) continue
      const x = num(p.x, NaN)
      const z = num(p.z, NaN)
      if (Number.isNaN(x) || Number.isNaN(z) || Math.abs(x) > PLACE_LIMIT || Math.abs(z) > PLACE_LIMIT) continue
      placements[key] = { x, z, rot: num(p.rot, 0) }
    }
  }
  const tints: Record<string, number> = {}
  const rawTints = field(raw, 'tints')
  if (isObj(rawTints)) {
    for (const [key, t] of Object.entries(rawTints)) {
      if (parseSlotKey(key) && typeof t === 'number' && Number.isInteger(t) && t >= 0 && t < TINT_SWATCHES) tints[key] = t
    }
  }
  const variants: Partial<Record<VariantSlot, number>> = {}
  const rawVariants = field(raw, 'variants')
  for (const slot of VARIANT_SLOTS) {
    const v = field(rawVariants, slot)
    if (typeof v === 'number' && Number.isFinite(v)) variants[slot] = count(v, 0, VARIANTS[slot] - 1)
  }
  return { placements, tints, variants }
}

/** Nothing in the studio changes with time. */
export function advanceStudio(_s: GameState, _now: number, _out: Notice[]): boolean {
  return false
}
