import { describe, expect, it } from 'vitest'
import { CROPS, ITEMS, ITEM_IDS, LEVEL_XP } from './config'
import { levelForXp, levelProgress, nextUnlock, unlocksAtLevel, xpForLevel } from './progression'

describe('levels', () => {
  it('maps xp to levels at the thresholds, and keeps going past the table', () => {
    expect([0, LEVEL_XP[1] - 1, LEVEL_XP[1], LEVEL_XP[LEVEL_XP.length - 1]].map(levelForXp)).toEqual([1, 1, 2, LEVEL_XP.length])
    const last = LEVEL_XP.length
    expect(xpForLevel(last + 1)).toBeGreaterThan(xpForLevel(last))
    expect(levelForXp(xpForLevel(last + 3))).toBe(last + 3)
  })

  it('reports progress within a level', () => {
    const p = levelProgress(LEVEL_XP[1] + 10)
    expect([p.level, p.into]).toEqual([2, 10])
    expect(p.fraction).toBeGreaterThan(0)
    expect(p.fraction).toBeLessThan(1)
  })

  it('points at the very next level all the way to 12, with something new each time, and at nothing past it', () => {
    for (let level = 1; level < 12; level++) {
      const next = nextUnlock(level)
      expect(next?.level, `from level ${level}`).toBe(level + 1)
      expect(next!.names.length, `level ${level + 1}`).toBeGreaterThan(0)
      const u = unlocksAtLevel(level + 1)
      expect(u.crops.length + u.items.length + u.gifts.length, `level ${level + 1}`).toBeGreaterThan(0)
    }
    expect(nextUnlock(CROPS.blueberry.unlockLevel - 1)?.names).toContain(CROPS.blueberry.name)
    expect(nextUnlock(12)).toBeNull()
  })

  it('names no land, and nothing that lives on it, among what the levels bring', () => {
    // Land is bought in any order from the start, and what each piece brings waits on that piece alone.
    const onLand = ITEM_IDS.filter((id) => ITEMS[id].category === 'land').map((id) => ITEMS[id].name)
    onLand.push('Cranberry', 'Lavender', 'Sheep', 'Goat', 'Lighthouse')
    for (let level = 1; level <= 20; level++) for (const name of nextUnlock(level)?.names ?? []) expect(onLand, `level ${level} brings ${name}`).not.toContain(name)
  })

  it('makes the first few levels quick and later ones longer', () => {
    const gaps = LEVEL_XP.slice(1).map((xp, i) => xp - LEVEL_XP[i])
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThanOrEqual(gaps[i - 1])
    expect(gaps[0]).toBeLessThanOrEqual(60)
  })
})
