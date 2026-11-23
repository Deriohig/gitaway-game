import { describe, expect, it } from 'vitest'
import { CROPS, CROP_IDS, FARM_ONLY, LEVEL_XP, MINUTE, SESSION, type CropId } from './config'
import { endSession, harvest, harvestValue, logTask, plant, recordCommits, startSession, watchRepository } from './engine'
import { migrate } from './save'
import { createInitialState, type GameState } from './state'
import { collectAll } from './systems/yields'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0) // 09:00 UTC (tests run with TZ=UTC)

const farm = (farmOnly: boolean): GameState => {
  const s = createInitialState(T0)
  s.settings.farmOnly = farmOnly
  return s
}

/** A level 12 farm with the land for every crop and seeds of each, so a harvest can't reach a new level. */
const grown = (farmOnly: boolean, crop: CropId) => {
  const s = farm(farmOnly)
  s.xp = LEVEL_XP[11]
  s.levelSeen = 12
  s.owned = { ...s.owned, wetland: 1, highland: 1 }
  s.seeds = Object.fromEntries(CROP_IDS.map((id) => [id, 9])) as Record<CropId, number>
  const planted = plant(s, 0, crop, T0).state
  const done = harvest(planted, 0, planted.plots[0].readyAt!)
  expect(done.ok).toBe(true)
  return { coins: done.state.coins - s.coins, xp: done.state.xp - s.xp }
}

describe('the farm-only setting', () => {
  it('is off for a new farm and for a save from before it existed, and kept in the save', () => {
    const old = JSON.parse(JSON.stringify(createInitialState(T0)))
    delete old.settings.farmOnly
    expect([farm(false).settings.farmOnly, migrate(old, T0)!.settings.farmOnly]).toEqual([false, false])
    expect(migrate(JSON.parse(JSON.stringify(farm(true))), T0)!.settings.farmOnly).toBe(true)
  })

  it('multiplies what a crop sells for, and a harvest\'s coins and XP', () => {
    const crop = [...CROP_IDS].sort((a, b) => CROPS[b].growMinutes - CROPS[a].growMinutes)[0]
    expect(harvestValue(farm(true), crop)).toBe(Math.round(CROPS[crop].coins * FARM_ONLY.pay))
    expect(harvestValue(farm(false), crop)).toBe(CROPS[crop].coins)
    // The longest crop pays whole points of XP, so nothing is left in the carry.
    const on = grown(true, crop)
    const off = grown(false, crop)
    expect(off.coins).toBeGreaterThan(0)
    expect(on).toEqual({ coins: off.coins * FARM_ONLY.pay, xp: off.xp * FARM_ONLY.pay })
  })

  it('multiplies what the farm makes on its own', () => {
    const at = T0 + 24 * 60 * MINUTE
    const on = collectAll(farm(true), at).state
    const off = collectAll(farm(false), at).state
    const start = farm(false)
    expect(off.coins - start.coins).toBeGreaterThan(0)
    expect(on.coins - start.coins).toBe((off.coins - start.coins) * FARM_ONLY.pay)
    expect(on.wood - start.wood).toBe((off.wood - start.wood) * FARM_ONLY.pay)
  })

  it('stops new work sessions and tasks from paying, but pays a session already running when it was turned on', () => {
    const s = farm(true)
    expect(startSession(s, T0).ok).toBe(false)
    const task = logTask(s, 'Write the report', T0)
    expect([task.ok, task.state.coins]).toEqual([false, s.coins])
    const running = startSession(farm(false), T0).state
    running.settings.farmOnly = true
    expect(endSession(running, T0 + 30 * MINUTE).state.coins - running.coins).toBeGreaterThanOrEqual(30 * SESSION.coinsPerMinute)
  })

  it('moves past commits without paying for them, now or later', () => {
    const REPO = { path: 'C:\\code\\api', name: 'api' }
    const s = watchRepository(farm(true), REPO, T0).state
    const latest = s.repos[0].cursor + 120
    const done = recordCommits(s, REPO.path, { count: 3, latest, since: s.repos[0].cursor }, T0 + 3 * MINUTE)
    expect([done.state.coins, done.state.stats.commits, done.state.repos[0].cursor]).toEqual([s.coins, 0, latest])
  })
})
