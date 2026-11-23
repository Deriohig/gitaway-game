import { availableCrops, availableItems } from './available'
import { CROPS, GIFTS, ITEMS, LEVEL_TITLES, LEVEL_XP, type CropDef, type ItemDef } from './config'

/** Each level past the table costs this much more XP (a little more than the table's last step). */
const LATE_LEVEL_STEP = 2200

/** Total XP needed to reach a level (level 1 needs 0). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  if (level <= LEVEL_XP.length) return LEVEL_XP[level - 1]
  return LEVEL_XP[LEVEL_XP.length - 1] + (level - LEVEL_XP.length) * LATE_LEVEL_STEP
}

export function levelForXp(xp: number): number {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  return level
}

export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1]
}

export interface LevelProgress {
  level: number
  title: string
  /** XP earned inside the current level. */
  into: number
  /** XP the current level spans. */
  span: number
  fraction: number
  nextAt: number
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp)
  const start = xpForLevel(level)
  const nextAt = xpForLevel(level + 1)
  const span = nextAt - start
  const into = xp - start
  return { level, title: levelTitle(level), into, span, fraction: span > 0 ? into / span : 1, nextAt }
}

/** What opens at a level. Things of switched-off features are left out. */
export function unlocksAtLevel(level: number): { crops: CropDef[]; items: ItemDef[]; gifts: typeof GIFTS } {
  return {
    crops: availableCrops().map((id) => CROPS[id]).filter((c) => c.unlockLevel === level && level > 1),
    items: availableItems().map((id) => ITEMS[id]).filter((i) => i.unlockLevel === level && level > 1),
    gifts: GIFTS.filter((g) => g.level === level),
  }
}

/** The next level that unlocks something, with what it unlocks. */
export function nextUnlock(level: number): { level: number; names: string[] } | null {
  for (let l = level + 1; l <= level + 12; l++) {
    const u = unlocksAtLevel(l)
    const names = [...u.crops.map((c) => c.name), ...u.items.map((i) => i.name), ...u.gifts.map((g) => `a ${g.animal}`)]
    if (names.length) return { level: l, names }
  }
  return null
}
