import { describe, expect, it } from 'vitest'
import { CROPS, CROP_IDS, GROW_MINUTES_PER_XP, ITEMS, LAND, LEVEL_XP, MINUTE, PLOTS, SESSION, TASKS, levelBonus, type CropId } from './config'
import {
  buyItem,
  buySeeds,
  checkSessionMilestones,
  cropProgress,
  cropXp,
  endSession,
  growMs,
  harvest,
  harvestAll,
  harvestValue,
  isFresh,
  itemPrice,
  logTask,
  plant,
  plantAll,
  renameFarm,
  sessionPreview,
  startSession,
} from './engine'
import { grantXp } from './core'
import { levelForXp, xpForLevel } from './progression'
import type { Notice } from './result'
import { createInitialState, type GameState } from './state'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0) // 09:00 UTC (tests run with TZ=UTC)
const fresh = () => createInitialState(T0)
const rich = (patch: Partial<GameState> = {}): GameState => ({ ...fresh(), coins: 5000, wood: 500, ...patch })
const started = (s = fresh(), at = T0) => startSession(s, at).state
/** Coins from the gift for each level that `xp` reaches. */
const gifts = (xp: number) => Array.from({ length: Math.max(0, levelForXp(xp) - 1) }, (_, i) => levelBonus(i + 2)).reduce((a, b) => a + b, 0)
const paid = (minutes: number) => `+${minutes * SESSION.coinsPerMinute} coins · +${minutes * SESSION.xpPerMinute} XP`
const sessionToast = (n: Notice[]) => n.find((x) => x.title === 'Session complete')?.detail ?? ''

describe('work sessions', () => {
  it('pays coins, xp and wood for credited minutes', () => {
    const { state, notices } = endSession(started(), T0 + 45 * MINUTE)
    const xp = 45 * SESSION.xpPerMinute
    expect(state.session).toBeNull()
    expect(state.coins).toBe(fresh().coins + 45 * SESSION.coinsPerMinute + gifts(xp))
    expect(state.wood).toBe(fresh().wood + Math.floor(45 / SESSION.minutesPerWood))
    expect([state.xp, state.stats.sessions, state.daily.sessionMinutes]).toEqual([xp, 1, 45])
    expect(notices.map((n) => n.kind)).toContain('session')
  })

  it('ignores a second start, and cannot be ended twice for double the reward', () => {
    const again = startSession(started(), T0 + 10 * MINUTE)
    expect([again.ok, again.state.session?.startedAt]).toEqual([false, T0])
    const once = endSession(started(), T0 + 30 * MINUTE)
    const twice = endSession(once.state, T0 + 30 * MINUTE)
    expect([twice.ok, twice.state.coins]).toEqual([false, once.state.coins])
  })

  it('pays nothing under a minute, or when the clock jumped backwards (with a warning)', () => {
    const short = endSession(started(), T0 + 59_000)
    expect([short.state.coins, short.state.session]).toEqual([fresh().coins, null])
    const back = endSession(started(), T0 - 30 * MINUTE)
    expect([back.state.coins, back.state.session, back.notices[0].kind]).toEqual([fresh().coins, null, 'warn'])
  })

  it('caps a single session, and credited minutes per day across sessions, resetting on a new local day', () => {
    const preview = sessionPreview(started(), T0 + 10 * 60 * MINUTE)
    expect([preview.creditedMinutes, preview.cap]).toEqual([SESSION.maxMinutes, 'session'])
    let s = endSession(started(), T0 + 240 * MINUTE).state
    s = endSession(started(s, T0 + 241 * MINUTE), T0 + 481 * MINUTE).state
    expect(s.daily.sessionMinutes).toBe(SESSION.dailyMinuteCap)
    const third = started(s, T0 + 482 * MINUTE)
    const capped = sessionPreview(third, T0 + 540 * MINUTE)
    expect([capped.creditedMinutes, capped.cap]).toEqual([0, 'daily'])
    expect(endSession(third, T0 + 540 * MINUTE).state.coins).toBe(third.coins)
    const tomorrow = T0 + 24 * 60 * MINUTE
    expect(sessionPreview(started(s, tomorrow), tomorrow + 30 * MINUTE).creditedMinutes).toBe(30)
  })

  it('announces only the latest milestone passed, once, and at four hours says rewards are paused', () => {
    const first = checkSessionMilestones(started(), T0 + 70 * MINUTE)
    expect(first.notices).toHaveLength(1)
    expect(first.notices[0].title).toMatch(/hour/i)
    expect(first.state.session?.milestones).toEqual([25, 60])
    expect(checkSessionMilestones(first.state, T0 + 71 * MINUTE).ok).toBe(false)
    expect(checkSessionMilestones(started(), T0 + 240 * MINUTE).notices.map((n) => n.title)).toEqual(['Four hours: rewards paused'])
  })

  // A session that is ended early, or that a cap pauses, pays for every whole minute it ran.
  it.each([SESSION.minMinutes, 59, 119])('pays %i whole minutes, seconds short of the next adding nothing', (minutes) => {
    const end = T0 + minutes * MINUTE + 59_000
    expect(sessionPreview(started(), end).creditedMinutes).toBe(minutes)
    const { state, notices } = endSession(started(), end)
    expect([state.daily.sessionMinutes, state.stats.sessionMinutes]).toEqual([minutes, minutes])
    expect(sessionToast(notices)).toContain(paid(minutes))
  })

  it.each([SESSION.minutesPerWood - 1, 2 * SESSION.minutesPerWood + 3])('brings wood a piece per few credited minutes (%i min)', (minutes) => {
    expect(sessionPreview(started(), T0 + minutes * MINUTE).wood).toBe(Math.floor(minutes / SESSION.minutesPerWood))
  })
})

describe('tasks', () => {
  it('rewards a task once with wood, says so, and rejects duplicates the same day', () => {
    const { ok, state, notices } = logTask(fresh(), 'Fix flaky test', T0)
    expect([ok, state.coins, state.wood]).toEqual([true, fresh().coins + TASKS.coins, fresh().wood + TASKS.wood])
    expect(state.recent[0]).toMatchObject({ label: 'Fix flaky test', coins: TASKS.coins, xp: TASKS.xp, wood: TASKS.wood })
    const logged = notices.find((n) => n.title === 'Task logged')
    expect(logged?.detail).toBe(`+${TASKS.coins} coins · +${TASKS.xp} XP · +${TASKS.wood} wood`)
    expect(state.journal.find((e) => e.kind === 'work')).toMatchObject({ title: 'Fix flaky test', detail: logged?.detail })
    const dupe = logTask(state, '  fix   FLAKY test ', T0 + MINUTE)
    expect([dupe.ok, dupe.state.coins, dupe.state.wood]).toEqual([false, state.coins, state.wood])
  })

  it('stops rewarding after the daily limit, wood included, and rejects empty names', () => {
    let s = fresh()
    for (let i = 0; i < TASKS.dailyLimit; i++) s = logTask(s, `task ${i}`, T0 + i).state
    expect(s.wood).toBe(fresh().wood + TASKS.dailyLimit * TASKS.wood)
    const extra = logTask(s, 'one more', T0 + 100)
    expect([extra.ok, extra.state.stats.tasks, extra.state.wood]).toEqual([false, TASKS.dailyLimit, s.wood])
    expect(logTask(fresh(), '   ', T0).ok).toBe(false)
  })
})

describe('garden', () => {
  /** Plants the crop in plot 0 and harvests it once ripe. */
  const grow = (s: GameState, crop: CropId) => {
    const planted = plant(s, 0, crop, T0).state
    const done = harvest(planted, 0, planted.plots[0].readyAt!)
    return { paid: done.state.coins - planted.coins, state: done.state, notices: done.notices }
  }
  const FRESH_RADISH = Math.round(CROPS.radish.coins * 1.25)

  it('plants from seed stock, grows over persisted time, and refuses without seeds, in an occupied plot or a locked crop', () => {
    const { state } = plant(fresh(), 0, 'carrot', T0)
    expect(state.plots[0].crop).toBe('carrot')
    expect(state.seeds.carrot).toBe(fresh().seeds.carrot - 1)
    expect(cropProgress(state.plots[0], T0 + (CROPS.carrot.growMinutes / 2) * MINUTE)).toBeCloseTo(0.5)
    expect(cropProgress(state.plots[0], T0 + 999 * MINUTE)).toBe(1)
    expect(plant({ ...fresh(), seeds: { ...fresh().seeds, carrot: 0 } }, 0, 'carrot', T0).ok).toBe(false)
    expect(plant(plant(fresh(), 0, 'radish', T0).state, 0, 'radish', T0).ok).toBe(false)
    expect(plant({ ...fresh(), seeds: { ...fresh().seeds, blueberry: 3 } }, 0, 'blueberry', T0).ok).toBe(false)
  })

  it('buys seeds with coins and refuses when short', () => {
    const { state } = buySeeds(fresh(), 'carrot', 2, T0)
    expect([state.seeds.carrot, state.coins]).toEqual([fresh().seeds.carrot + 2, fresh().coins - 2 * CROPS.carrot.seedCost])
    expect(buySeeds({ ...fresh(), coins: 0 }, 'carrot', 1, T0).ok).toBe(false)
  })

  it('harvests only when ready, once', () => {
    const planted = plant(fresh(), 0, 'radish', T0).state
    expect(harvest(planted, 0, T0 + MINUTE).ok).toBe(false)
    const ready = T0 + CROPS.radish.growMinutes * MINUTE
    const done = harvest(planted, 0, ready)
    expect([done.ok, done.state.coins, done.state.plots[0].crop]).toEqual([true, fresh().coins + FRESH_RADISH, null])
    expect(harvest(done.state, 0, ready).ok).toBe(false)
  })

  it('plants and harvests every plot in one go', () => {
    const planted = plantAll(fresh(), 'radish', T0).state
    expect(planted.plots.filter((p) => p.crop === 'radish')).toHaveLength(Math.min(PLOTS.starting, fresh().seeds.radish))
    const all = harvestAll(planted, T0 + CROPS.radish.growMinutes * MINUTE)
    expect(all.state.plots.every((p) => !p.crop && p.lastCrop === 'radish')).toBe(true)
    expect(all.state.stats.harvested.radish).toBe(4)
    expect(all.state.coins - fresh().coins).toBe(4 * FRESH_RADISH)
  })

  it('greenhouse speeds growth and windmill raises harvest value, stacking with fresh soil', () => {
    const s = rich({ owned: { ...fresh().owned, greenhouse: 1, windmill: 1 } })
    s.plots[0] = { ...s.plots[0], lastCrop: 'carrot' } // carrots again, so only the windmill counts
    const planted = plant(s, 0, 'carrot', T0).state
    expect((planted.plots[0].readyAt! - T0) / MINUTE).toBeCloseTo(CROPS.carrot.growMinutes * 0.8)
    expect(harvest(planted, 0, planted.plots[0].readyAt!).state.coins - planted.coins).toBe(Math.round(CROPS.carrot.coins * 1.1))
    expect(harvestValue(s, 'carrot', true)).toBe(Math.round(CROPS.carrot.coins * 1.1 * 1.25))
  })

  describe('fresh soil', () => {
    it('a different crop from the plot’s last pays 25% more, the same again its normal price, and a new plot counts as fresh', () => {
      expect(fresh().plots.every((p) => p.lastCrop === null)).toBe(true)
      expect(isFresh(fresh().plots[0], 'radish')).toBe(true)
      expect(grow(fresh(), 'radish').paid).toBe(FRESH_RADISH)
      const carrots = grow(fresh(), 'carrot').state
      expect(carrots.plots[0]).toMatchObject({ crop: null, lastCrop: 'carrot' })
      expect(grow(carrots, 'radish').paid).toBe(FRESH_RADISH)
      expect(grow(grow(fresh(), 'radish').state, 'radish').paid).toBe(CROPS.radish.coins)
    })

    it('pays fresh and repeated plots harvested together, each at its own price', () => {
      const s = rich({ seeds: { ...fresh().seeds, radish: 2, carrot: 2 } })
      // Plots 0 and 1 grow again what they last grew; plot 2 grows something new, and plot 3 has never grown anything.
      s.plots = s.plots.map((p, i) => ({ ...p, lastCrop: (['radish', 'carrot', 'carrot', null] as const)[i] }))
      let planted = s
      for (const [plot, crop] of [[0, 'radish'], [1, 'carrot'], [2, 'radish'], [3, 'carrot']] as const) planted = plant(planted, plot, crop, T0).state
      expect(planted.plots.map((p) => isFresh(p, p.crop!))).toEqual([false, false, true, true])
      const expected = planted.plots.reduce((sum, p) => sum + harvestValue(planted, p.crop!, isFresh(p, p.crop!)), 0)
      const done = harvestAll(planted, T0 + CROPS.carrot.growMinutes * MINUTE)
      expect(done.state.plots.every((p) => p.crop === null)).toBe(true)
      expect(done.state.coins - planted.coins).toBe(expected)
    })
  })
})

describe('crop XP', () => {
  /** A level 12 farm with the land for every crop and plenty of seeds of each. */
  const farm = (patch: Partial<GameState> = {}): GameState => {
    const s = rich({ xp: LEVEL_XP[11], levelSeen: 12, owned: { ...fresh().owned, wetland: 1, highland: 1 }, ...patch })
    s.seeds = Object.fromEntries(CROP_IDS.map((crop) => [crop, 99])) as Record<CropId, number>
    return s
  }
  const grow = (s: GameState, crop: CropId) => {
    const planted = plant(s, 0, crop, T0).state
    return harvest(planted, 0, planted.plots[0].readyAt!)
  }
  const told = (notices: Notice[]) => notices.find((n) => n.kind === 'crop')!
  const journaled = (s: GameState) => s.journal.find((e) => e.kind === 'garden' && e.title.startsWith('Harvested'))!
  const WORK_XP_PER_HOUR = 60 * SESSION.xpPerMinute

  it('a 5-minute radish pays no whole point of XP, the fractions add up across harvests and each whole point is paid once', () => {
    const s = farm()
    const first = grow(s, 'radish')
    expect(first.state.xp).toBe(s.xp)
    expect(first.state.harvestXpCarry).toBeCloseTo(CROPS.radish.growMinutes / GROW_MINUTES_PER_XP)
    const coins = `+${harvestValue(s, 'radish', true)} coins` // no whole point: toast and journal say nothing about XP
    expect([told(first.notices).detail, journaled(first.state).detail]).toEqual([coins, coins])
    let after = s
    for (let i = 1; i < GROW_MINUTES_PER_XP / CROPS.radish.growMinutes; i++) after = grow(after, 'radish').state
    expect(after.xp).toBe(s.xp)
    const last = grow(after, 'radish')
    expect(last.state.xp).toBe(s.xp + 1)
    expect(last.state.harvestXpCarry).toBeCloseTo(0)
    expect(told(last.notices).detail).toBe(`+${CROPS.radish.coins} coins · +1 XP`)
    expect(journaled(last.state).detail).toBe(`+${CROPS.radish.coins} coins · +1 XP`)
  })

  it('harvesting every plot at once pays the whole points of them all and carries the rest', () => {
    const s = farm()
    const all = harvestAll(plantAll(s, 'lettuce', T0).state, T0 + CROPS.lettuce.growMinutes * MINUTE)
    const earned = s.plots.length * (CROPS.lettuce.growMinutes / GROW_MINUTES_PER_XP)
    expect(all.state.xp - s.xp).toBe(Math.floor(earned))
    expect(all.state.harvestXpCarry).toBeCloseTo(earned - Math.floor(earned))
    expect(told(all.notices).detail).toBe(`+${s.plots.length * harvestValue(s, 'lettuce', true)} coins · +${Math.floor(earned)} XP`)
  })

  it.each(CROP_IDS.filter((c) => CROPS[c].growMinutes >= CROPS.tomato.growMinutes))('pays %s its full XP, as before', (crop) => {
    const s = farm()
    const done = grow(s, crop)
    expect([done.state.xp - s.xp, done.state.harvestXpCarry]).toEqual([CROPS[crop].xp, 0])
    expect(told(done.notices).detail).toBe(`+${harvestValue(s, crop, true)} coins · +${CROPS[crop].xp} XP`)
  })

  // The desk clicker replants one crop on every plot the moment it's ripe: at most 40% of what work earns an hour.
  it.each(CROP_IDS)('clicking %s on every plot earns at most 40%% of work an hour, with or without the greenhouse', (crop) => {
    expect(cropXp(crop) * 10).toBeCloseTo(Math.round(cropXp(crop) * 10), 9) // whole tenths, which the carry adds up exactly
    expect(PLOTS.max * (60 / CROPS[crop].growMinutes) * cropXp(crop)).toBeLessThanOrEqual(WORK_XP_PER_HOUR / 2.5)
    const greenhouse = farm({ owned: { ...fresh().owned, wetland: 1, highland: 1, greenhouse: 1 } })
    // Within a rounding error: the greenhouse's radishes earn exactly the 40%.
    expect(PLOTS.max * ((60 * MINUTE) / growMs(greenhouse, crop)) * cropXp(crop)).toBeLessThanOrEqual(WORK_XP_PER_HOUR / 2.5 + 1e-9)
  })
})

describe('building, progression and the farm', () => {
  it('adds a plot and raises the next plot price', () => {
    const { state } = buyItem(rich(), 'plot', T0)
    expect(state.plots).toHaveLength(PLOTS.starting + 1)
    expect(new Set(state.plots.map((p) => p.id)).size).toBe(state.plots.length)
    expect(itemPrice(state, 'plot').coins).toBeGreaterThan(itemPrice(rich(), 'plot').coins)
  })

  it('respects level locks, requirements, maximums and cannot go into debt', () => {
    expect(buyItem(rich(), 'windmill', T0).ok).toBe(false) // level 9
    const high = rich({ xp: 5000 })
    expect(buyItem(high, 'sheep', T0).ok).toBe(false) // needs the meadow
    expect(buyItem(buyItem(high, 'meadow', T0).state, 'sheep', T0).ok).toBe(true)
    expect(buyItem(buyItem(high, 'bench', T0).state, 'bench', T0).ok).toBe(false)
    const broke = buyItem({ ...fresh(), coins: 5, wood: 0 }, 'flowerbed', T0)
    expect([broke.ok, broke.state.coins]).toEqual([false, 5])
  })

  it('sells a new farm its first piece of land at LAND’s base price, leaving only the level gift', () => {
    const first = { coins: LAND.coins.base, wood: LAND.wood.base }
    for (const id of ['meadow', 'grove', 'islet'] as const) expect(itemPrice(fresh(), id), id).toEqual(first)
    const ready = { ...fresh(), ...first }
    const bought = buyItem(ready, 'meadow', T0)
    expect([bought.ok, bought.state.owned.meadow]).toEqual([true, 1])
    expect([bought.state.coins, bought.state.wood]).toEqual([gifts(ITEMS.meadow.xp), 0])
    expect(buyItem({ ...ready, wood: first.wood - 1 }, 'meadow', T0).ok).toBe(false)
  })

  it('does not announce, at its level, something the farm already owns', () => {
    const level = ITEMS.windmill.unlockLevel
    const nearly = { ...fresh(), xp: xpForLevel(level) - 1, levelSeen: level - 1 }
    const announced = (s: GameState) => {
      const out: Notice[] = []
      grantXp(structuredClone(s), 1, out, T0)
      return out.filter((n) => n.kind === 'unlock').flatMap((n) => (n.detail ?? '').split(', '))
    }
    expect(announced(nearly)).toContain(ITEMS.windmill.name)
    // An upgraded farm can own one already; the rest of the level's openings are still announced.
    const owner = { ...nearly, owned: { ...nearly.owned, windmill: 1 } }
    expect(announced(owner)).not.toContain(ITEMS.windmill.name)
    expect(announced(owner)).toEqual(announced(nearly).filter((name) => name !== ITEMS.windmill.name))
  })

  it('renames a farm with trimming and length limits', () => {
    expect(renameFarm(fresh(), '  Byte  Acres ').state.farmName).toBe('Byte Acres')
    expect(renameFarm(fresh(), '   ').ok).toBe(false)
    expect(renameFarm(fresh(), 'x'.repeat(80)).state.farmName).toHaveLength(32)
  })
})
