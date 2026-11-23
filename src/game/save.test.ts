import { describe, expect, it } from 'vitest'
import { advance } from './advance'
import { CROPS, CROP_IDS, GROW_MINUTES_PER_XP, ITEMS, ITEM_IDS, MINUTE, YIELD_CAP_HOURS } from './config'
import { FISH } from './content/fish'
import { YIELDS } from './content/yields'
import { LETTER_IDS } from './content/letters'
import { STAMPS } from './content/stamps'
import { grantXp } from './core'
import { buyItem, harvest, harvestAll, isCropUnlocked, plant, startSession } from './engine'
import { levelForXp, xpForLevel } from './progression'
import type { Notice } from './result'
import { ECONOMY_CHANGED, V2_LEVEL_XP, V2_SEED_COST, isNewerSave, migrate, v1LevelForXp, v2LevelForXp, v2XpForLevel } from './save'
import { SAVE_VERSION, createInitialState, emptyPlot, type GameState } from './state'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)
const DAY = 86_400_000
const HOUR = 3_600_000
const SEC = (ms: number) => Math.floor(ms / 1000)
const json = <T>(x: T) => JSON.parse(JSON.stringify(x))

/** A save exactly as version 1 of the game wrote it, from a farm a month in. */
const empty = { crop: null, plantedAt: null, readyAt: null, notified: false }
const V1_SAVE = {
  version: 1,
  createdAt: T0 - 30 * DAY,
  farmName: 'Old Orchard',
  coins: 2000,
  wood: 120,
  xp: 1100,
  levelSeen: 7,
  seeds: { radish: 3, carrot: 3, lettuce: 2, tomato: 2, sunflower: 1, pumpkin: 1, blueberry: 1 },
  plots: [
    { id: 0, crop: 'carrot', plantedAt: T0 - 10 * MINUTE, readyAt: T0 + 5 * MINUTE, notified: false },
    { id: 1, crop: 'radish', plantedAt: T0 - 20 * MINUTE, readyAt: T0 - 15 * MINUTE, notified: true },
    ...[2, 3, 4].map((id) => ({ id, ...empty })),
  ],
  owned: { plot: 1, flowerbed: 6, fence: 2, path: 1, lantern: 4, bench: 1, scarecrow: 0, well: 1, beehive: 2, fruitTree: 5, windmill: 1, greenhouse: 0, meadow: 1, grove: 0, islet: 0, lighthouse: 0, chicken: 4, duck: 3, sheep: 4 },
  gifts: ['cat', 'dog'],
  session: { startedAt: T0 - 20 * MINUTE, milestones: [] },
  daily: { date: '2026-10-17', sessionMinutes: 120, tasks: ['ship it'], commits: 3 },
  repos: [{ path: 'C:\code\api', name: 'api', cursor: SEC(T0) - 100, addedAt: T0 - DAY }],
  recent: [{ at: T0 - 1000, label: 'Work session · 2 h', coins: 120, xp: 120, wood: 6 }],
  stats: { sessions: 12, sessionMinutes: 900, tasks: 20, planted: 30, harvested: { radish: 10, carrot: 8 }, coinsEarned: 2400, commits: 7 },
  settings: { motion: 'calm', timeOfDay: 'clock', ambientSound: true, sessionPanelCollapsed: false, welcomed: true, tutorialDone: true },
}

const [someFish] = Object.keys(FISH)
const [someStamp] = Object.keys(STAMPS)

/** A farm saved by this version with every field since version 2 filled in; fish and stamps only once their tables have content. */
function busyV2(): GameState {
  const s = createInitialState(T0 - 60 * DAY)
  s.journal = [
    { id: 4, at: T0 - MINUTE, kind: 'garden', title: 'Your radishes are ready', note: 'For the soup' },
    { id: 3, at: T0 - 2 * MINUTE, kind: 'craft', title: 'Your jam is ready', detail: '1 jar of jam to the barn' },
    ...s.journal,
  ]
  Object.assign(s, {
    xp: 3000, levelSeen: 10, journalSeq: 4, told: ['wheat', 'workshop'], seenAt: T0 - 30 * MINUTE, nextNote: 'Finish the parser', jobSeq: 8, cottageSeen: 1,
    history: [{ date: '2026-10-16', minutes: 200, tasks: 4, commits: 6, harvests: 9 }],
    names: { cat: 'Git', dog: 'Rebase', flagship: 'Henrietta' },
    visitors: { since: T0 - 10 * DAY, nextPeriod: 6, present: [{ id: 'hare', arrivedAt: T0 - DAY }], seen: { hare: 2 } },
    keepsakes: { hare: 2 },
    barn: { produce: { tomato: 4, wheat: 2 }, goods: { eggs: 5, jam: 1 } },
    keep: { tomato: 6, blueberry: 4 },
    jobs: [
      { id: 7, station: 'kitchen', recipe: 'jam', startedAt: T0 - 10 * MINUTE, readyAt: T0 + 35 * MINUTE },
      { id: 8, station: 'workbench', recipe: 'birdhouse', startedAt: T0 - MINUTE, readyAt: T0 + 19 * MINUTE },
    ],
    producers: { at: T0 - 2 * HOUR, progress: { eggs: 0.25, honey: 0.5, wool: 0, milk: 0 } },
    made: { jam: 3, flour: 2 },
    helpers: { replant: true, harvest: false },
    restoration: { progress: { gardenGate: [6, 2, 0], pondJetty: [8, 1] }, done: { waterwheel: T0 - 5 * DAY } },
    lanternNightUntil: T0 + HOUR,
    placements: { 'flowerbed#0': { x: -5.1, z: 0.4, rot: 0.785 }, 'bench#0': { x: 0.9, z: 5.6, rot: -2.1 } },
    tints: { 'flowerbed#0': 3 },
    variants: { roof: 2, sails: 1 },
    stats: { ...s.stats, visitors: 3, fish: 2, goodsMade: 5, crafted: 2, bundles: 1, photos: 1 },
    settings: { ...s.settings, quiet: true, hemisphere: 'south', windowLayout: 'corner', keepOnTop: true },
    mail: { ...s.mail, letters: [{ id: LETTER_IDS[0], at: T0 - DAY, read: true }] },
    ...(someStamp && { stamps: { [someStamp]: T0 - DAY } }),
  })
  Object.assign(s.owned, { barn: 1, workbench: 1, planter: 2 })
  s.characters.siofra = { dueAt: T0 - 4 * DAY, metAt: T0 - 4 * DAY, momentAt: T0 - DAY, checkedAt: T0 - DAY, lastMoment: 'gift-pebble', given: ['pebble'], met: true, heard: [2, 9], said: { index: 9, at: T0 - MINUTE } }
  s.fishing.slots = { pond: 14, cloud: 3 }
  if (someFish) {
    s.fishing.caught = { [someFish]: { count: 2, firstAt: T0 - DAY, best: 31 } }
    s.fishing.big = { id: someFish, spot: 'pond', size: 42, at: T0 - MINUTE }
  }
  return s
}
/** Migrates a JSON round trip of the busy v2 farm, with `patch` laid over it. */
const busyRaw = (patch: Record<string, unknown> = {}) => ({ ...json(busyV2()), ...patch })
const migrated = (raw: unknown, now = T0) => migrate(json(raw), now)!
const v2Farm = (xp: number, patch: Record<string, unknown> = {}) => busyRaw({ version: 2, xp, levelSeen: v2LevelForXp(xp), ...patch })
const levelNotices = (s: GameState, xp: number) => {
  const out: Notice[] = []
  grantXp(s, xp, out, T0)
  return out.filter((n) => n.kind === 'level').map((n) => n.title)
}

describe('save migration', () => {
  it('returns null when there is no save', () => {
    expect(migrate(undefined, T0)).toBeNull()
    expect(migrate('nonsense', T0)).toBeNull()
  })

  it('round-trips a real state, an upgraded version 1 save and a busy current save unchanged', () => {
    let s = createInitialState(T0)
    s = plant(s, 1, 'carrot', T0).state
    s = startSession(s, T0).state
    s = buyItem({ ...s, coins: 999 }, 'plot', T0).state
    expect(migrate(json(s), T0 + 1000)).toEqual(s)
    const once = migrated(V1_SAVE)
    expect(migrated(once, T0 + 1000)).toEqual(once)
    expect(migrated(busyV2())).toEqual(busyV2())
  })

  it('upgrades a version 1 save without losing anything', () => {
    const s = migrated(V1_SAVE)
    const { version: _v, xp, coins, seeds, owned, daily, repos, stats, settings, ...rest } = V1_SAVE
    expect(s.version).toBe(SAVE_VERSION)
    expect(s).toMatchObject(rest)
    expect(s.xp).toBe(Math.max(xp, xpForLevel(v1LevelForXp(xp)))) // its XP only rises, to keep its level
    expect(s.seeds).toMatchObject({ ...seeds, blueberry: 0 }) // its blueberry seed waits on a later level, so it was bought back
    expect(s.coins).toBe(coins + seeds.blueberry * V2_SEED_COST.blueberry)
    expect(s.owned).toMatchObject(owned)
    expect(s.daily).toEqual({ ...daily, harvests: 0 })
    expect(s.repos).toEqual([{ ...repos[0], commits: 0, alias: 'Apple', tagCursor: SEC(T0) }])
    expect(s.stats).toEqual({ ...stats, visitors: 0, fish: 0, goodsMade: 0, crafted: 0, bundles: 0, photos: 0 })
    expect(s.settings).toEqual({
      ...settings,
      sessionMusic: true,
      quiet: false,
      batterySaver: true,
      hemisphere: 'north',
      weather: true,
      showRepoNames: false,
      windowLayout: 'normal',
      keepOnTop: false,
      farmOnly: false,
    })
    // Everything new starts empty, and nothing new is owned or planted.
    for (const id of CROP_IDS) if (!(id in seeds)) expect(s.seeds[id]).toBe(0)
    for (const id of ITEM_IDS) if (!(id in owned)) expect(s.owned[id]).toBe(0)
    expect(s.journal).toEqual([expect.objectContaining({ kind: 'story', title: ECONOMY_CHANGED.title })])
    expect(s).toMatchObject({
      told: [ECONOMY_CHANGED.id],
      history: [],
      seenAt: T0,
      nextNote: '',
      visitors: { since: null, nextPeriod: 0, present: [], seen: {} },
      barn: { produce: {}, goods: {} },
      jobs: [],
      restoration: { progress: {}, done: {} },
      placements: {},
    })
  })

  it("keeps a newer Gitaway's version, so the farm is never written over", () => {
    const newer = migrated({ ...busyV2(), version: SAVE_VERSION + 1, ferries: { docked: 3 } })
    expect([newer.version, isNewerSave(newer), newer.farmName]).toEqual([SAVE_VERSION + 1, true, busyV2().farmName])
    expect(isNewerSave(migrate(V1_SAVE, T0)!)).toBe(false)
    expect(isNewerSave(migrate({ ...V1_SAVE, version: 'soon' }, T0)!)).toBe(false)
  })

  it('keeps the fraction of a point harvests have carried, repairs a junk one, and goes on adding to it', () => {
    const radishes = (from: GameState, n: number) => {
      let s = from
      for (let i = 0; i < n; i++) {
        const planted = plant(s, 0, 'radish', T0).state
        s = harvest(planted, 0, planted.plots[0].readyAt!).state
      }
      return s
    }
    const perPoint = GROW_MINUTES_PER_XP / CROPS.radish.growMinutes
    const half = radishes({ ...createInitialState(T0), seeds: { ...createInitialState(T0).seeds, radish: 99 } }, perPoint / 2)
    expect(half.xp).toBe(0)
    const back = migrated(half)
    expect(back.harvestXpCarry).toBeCloseTo(0.5)
    expect(radishes(back, perPoint / 2).xp).toBe(1)
    const carry = (harvestXpCarry: unknown) => migrated({ ...json(createInitialState(T0)), harvestXpCarry }).harvestXpCarry
    expect([carry(0.25), carry(0)]).toEqual([0.25, 0])
    // Missing, as in every save from before it, or junk: nothing carried.
    for (const junk of [undefined, null, '0.5', -0.5, 1, 7, NaN, Infinity]) expect(carry(junk), String(junk)).toBe(0)
  })

  describe('plots’ last crops', () => {

    it('counts a plot as fresh when its last crop is missing or unknown', () => {
      const plots = [
        V1_SAVE.plots[0],
        { id: 1, ...empty, lastCrop: 'durian' },
        { id: 2, ...empty, lastCrop: 'toString' },
        { id: 3, ...empty, lastCrop: 42 },
        { ...V1_SAVE.plots[1], lastCrop: 'carrot' },
      ]
      const s = migrated({ ...V1_SAVE, version: SAVE_VERSION, plots }) // this version's saves keep their known last crops
      expect(s.plots.map((p) => p.lastCrop)).toEqual([null, null, null, null, 'carrot'])
    })

    it.each([1, 2])('counts every plot of an upgraded version %i farm as fresh soil, and keeps what grows in them', (version) => {
      const plots = [
        { id: 0, crop: 'carrot', plantedAt: T0 - MINUTE, readyAt: T0 + 10 * MINUTE, notified: false, lastCrop: 'radish' },
        { ...emptyPlot(1), lastCrop: 'carrot' },
        { ...emptyPlot(2), lastCrop: 'tomato' },
        emptyPlot(3),
        { ...emptyPlot(4), lastCrop: 'radish' },
      ]
      const s = migrated({ ...V1_SAVE, version, plots })
      expect(s.plots.map((p) => p.lastCrop)).toEqual([null, null, null, null, null])
      expect(s.plots[0]).toMatchObject({ crop: 'carrot', plantedAt: T0 - MINUTE, readyAt: T0 + 10 * MINUTE })
    })
  })

  it('upgrades a full version 2 farm with nothing lost but its version, plots’ last crops, level-keeping XP and the economy line', () => {
    const s: GameState = { ...busyV2(), version: 2, xp: V2_LEVEL_XP[9] }
    s.plots = [
      { id: 0, crop: 'carrot', plantedAt: T0 - MINUTE, readyAt: T0 + 10 * MINUTE, notified: false, lastCrop: 'radish' },
      { ...emptyPlot(1), lastCrop: 'carrot' },
      ...s.plots.slice(2),
    ]
    expect(v2LevelForXp(s.xp)).toBe(10) // version 2's level 10 asks less XP than today's
    expect(levelForXp(s.xp)).toBeLessThan(10)
    const up = migrated(s)
    const [line] = up.journal
    expect(line).toEqual({ id: s.journalSeq + 1, at: T0, kind: 'story', title: ECONOMY_CHANGED.title, detail: ECONOMY_CHANGED.detail })
    expect(up).toEqual({
      ...s,
      version: SAVE_VERSION,
      xp: xpForLevel(10),
      plots: s.plots.map((p) => ({ ...p, lastCrop: null })),
      journal: [line, ...s.journal],
      journalSeq: s.journalSeq + 1,
      told: [...s.told, ECONOMY_CHANGED.id],
    })
  })

  it('repairs corrupt fields instead of discarding the farm', () => {
    const s = migrate(
      {
        farmName: 'Cloud Acre',
        coins: -50,
        wood: 'lots',
        xp: Number.NaN,
        seeds: { carrot: 3, potato: 99 },
        owned: { plot: 999, windmill: 1 },
        plots: [{ crop: 'carrot', plantedAt: T0, readyAt: T0 - 1 }, { crop: 'durian', plantedAt: T0, readyAt: T0 + 1 }],
        session: { startedAt: 'yesterday' },
        settings: { motion: 'turbo', ambientSound: true },
      },
      T0,
    )!
    expect(s).toMatchObject({ farmName: 'Cloud Acre', coins: 0, wood: createInitialState(T0).wood, xp: 0, session: null })
    expect([s.seeds.carrot, s.owned.windmill, s.owned.plot]).toEqual([3, 1, 12])
    expect(s.plots).toHaveLength(16)
    expect(s.plots.every((p) => p.crop === null)).toBe(true)
    expect([s.settings.motion, s.settings.ambientSound]).toEqual(['auto', true])
  })

  describe('what the farm owns, and what it has made', () => {
    /** The most of a kind that waits, for this many sources. */
    const cap = (id: 'eggs' | 'honey', sources: number) => (YIELD_CAP_HOURS * sources) / YIELDS[id].hours

    it('a farm with the glade keeps all six hives through a reload, and without it three hives and their honey', () => {
      const s = createInitialState(T0)
      s.owned.cottageLand = 1
      s.owned.beehive = ITEMS.beehive.max + 3
      s.yields.stored.honey = cap('honey', 5) // more honey than three hives hold, less than six do
      const back = migrated(s)
      expect([back.owned.beehive, back.yields.stored.honey]).toEqual([6, cap('honey', 5)])
      expect(back).toEqual(s)
      const without = migrated({ ...s, owned: { ...s.owned, cottageLand: 0 } })
      expect([without.owned.beehive, without.yields.stored.honey]).toEqual([ITEMS.beehive.max, cap('honey', ITEMS.beehive.max)])
    })

    it.each([
      ['the save’s clock ran ahead', T0 + HOUR, T0],
      ['a stamp is far in the future', 8e15, T0],
      ['one is in the past, so what was made since is still there to settle', T0 - HOUR, T0 - HOUR],
    ])('counts what the farm makes from the right time when %s', (_why, at, expected) => {
      const s = createInitialState(T0)
      expect(migrated({ ...s, yields: { ...s.yields, at } }).yields.at).toBe(expected)
    })
  })

  describe('music during work sessions', () => {
    const saved = (sessionMusic?: unknown) => {
      const raw = json(createInitialState(T0))
      if (sessionMusic === undefined) delete raw.settings.sessionMusic
      else raw.settings.sessionMusic = sessionMusic
      return migrate(raw, T0)!.settings.sessionMusic
    }

    it.each([
      ['a fresh farm', createInitialState(T0).settings.sessionMusic, true],
      ['a farm saved before there was music', saved(), true],
      ['switched off', saved(false), false],
      ['junk', saved('loud'), true],
    ])('is as expected for %s', (_what, actual, expected) => {
      expect(actual).toBe(expected)
    })
  })

  describe('levels from version 1', () => {
    // Version 1 had the first 12 levels of version 2's table, then 900 XP per level; version 2 charged more past 12.
    // Worked out by hand: [saved XP, v1 level, v2 level for that XP].
    const FARMS = [
      [4_960, 13, 12],
      [10_000, 18, 16],
      [15_000, 24, 19],
      [20_000, 29, 21],
    ] as const

    it.each(FARMS)('a farm at %i XP keeps its level %i, where version 2 would have dropped it to %i, and still gets the next level’s bonus', (xp, v1Level, v2Level) => {
      expect(v1LevelForXp(xp)).toBe(v1Level)
      expect(v2LevelForXp(xp)).toBe(v2Level)
      const s = migrated({ ...V1_SAVE, xp, levelSeen: v1Level })
      expect(levelForXp(s.xp)).toBe(Math.max(v1Level, levelForXp(xp)))
      expect(s.xp).toBe(Math.max(xp, xpForLevel(v1Level))) // raised to the new threshold at most: a small gift, never a loss
      expect(s.levelSeen).toBe(v1Level)
      expect(levelNotices(s, xpForLevel(v1Level + 1) - s.xp)).toEqual([expect.stringMatching(`^Farm level ${v1Level + 1}:`)])
    })
  })

  describe('levels from version 2', () => {
    it('keeps the level of every version 2 farm, at a level threshold or just short of the next', () => {
      for (let level = 1; level <= 30; level++) {
        for (const xp of [v2XpForLevel(level), v2XpForLevel(level + 1) - 1]) {
          expect(v2LevelForXp(xp), `${xp} XP`).toBe(level)
          const s = migrated(v2Farm(xp))
          expect(levelForXp(s.xp), `${xp} XP`).toBe(Math.max(level, levelForXp(xp)))
          expect(s.xp, `${xp} XP`).toBe(Math.max(xp, xpForLevel(level)))
        }
      }
      const s = migrated(v2Farm(V2_LEVEL_XP[9]))
      expect([levelForXp(s.xp), s.levelSeen, s.version]).toEqual([10, 10, SAVE_VERSION])
    })

    it("leaves a current farm's XP alone, and never counts a level as celebrated before it is reached", () => {
      const s = migrated(busyRaw({ xp: 10_000, levelSeen: levelForXp(10_000) }))
      expect([s.xp, s.levelSeen]).toEqual([10_000, levelForXp(10_000)])
      const early = migrated(busyRaw({ xp: 1100, levelSeen: 40 }))
      const level = levelForXp(1100)
      expect(early.levelSeen).toBe(level)
      expect(levelNotices(early, xpForLevel(level + 1) - early.xp)).toEqual([expect.stringMatching(`^Farm level ${level + 1}:`)])
      const v1 = migrated({ ...V1_SAVE, levelSeen: 40 })
      expect(v1.levelSeen).toBe(levelForXp(v1.xp))
    })
  })

  describe('the economy that changed under an older farm', () => {
    const changed = (s: GameState) => s.journal.filter((e) => e.title === ECONOMY_CHANGED.title)
    /** A version 2 farm at its level 7, holding these seeds. */
    const v2At7 = (seeds: Record<string, number>, coins = 500) => v2Farm(V2_LEVEL_XP[6], { levelSeen: 7, coins, seeds })

    it('tells a version 2 farm once, in the journal and in a toast', () => {
      const out: Notice[] = []
      const once = migrate(v2At7({ radish: 2 }), T0, out)!
      expect(out).toEqual([expect.objectContaining({ title: ECONOMY_CHANGED.title, detail: ECONOMY_CHANGED.detail })])
      expect(out[0].quiet).toBeFalsy()
      expect(changed(once)).toEqual([expect.objectContaining({ kind: 'story', detail: ECONOMY_CHANGED.detail })])
      // Saved and loaded again it says nothing more, and catching up doesn't either.
      const again: Notice[] = []
      const twice = migrate(json(once), T0 + 1000, again)!
      expect(again).toEqual([])
      expect(changed(twice)).toHaveLength(1)
      const later = advance(twice, T0 + DAY)
      expect(later.notices.filter((n) => n.title === ECONOMY_CHANGED.title)).toEqual([])
      expect(changed(later.state)).toHaveLength(1)
      // Its told id holds even if the save came back with its old version number.
      const relabelled: Notice[] = []
      expect(changed(migrate({ ...json(once), version: 2 }, T0, relabelled)!)).toHaveLength(1)
      expect(relabelled).toEqual([])
    })

    it('buys back, at the version 2 price, the seeds a version 2 level 7 farm can no longer plant, once', () => {
      expect(V2_SEED_COST.blueberry).toBe(48)
      expect(Object.isFrozen(V2_SEED_COST)).toBe(true)
      const out: Notice[] = []
      const s = migrate(v2At7({ radish: 2, blueberry: 3 }), T0, out)!
      expect(levelForXp(s.xp)).toBe(7)
      expect(isCropUnlocked(s, 'blueberry')).toBe(false)
      expect([s.seeds.blueberry, s.seeds.radish, s.coins]).toEqual([0, 2, 500 + 3 * V2_SEED_COST.blueberry])
      const said = `${ECONOMY_CHANGED.detail} Seeds you can't plant yet were bought back for ${3 * V2_SEED_COST.blueberry} coins.`
      expect([out[0].detail, changed(s)[0].detail]).toEqual([said, said])
      expect(migrated(s).coins).toBe(s.coins)
    })

    it('tells a version 3 farm nothing, and buys nothing back', () => {
      const out: Notice[] = []
      const s = migrate({ ...v2At7({ radish: 2, blueberry: 3 }), version: SAVE_VERSION, xp: xpForLevel(7) }, T0, out)!
      expect(out).toEqual([])
      expect(changed(s)).toEqual([])
      expect([s.seeds.blueberry, s.coins]).toEqual([3, 500])
      expect(s.told).not.toContain(ECONOMY_CHANGED.id)
    })
  })

  describe('ids that only exist on Object.prototype', () => {
    const INHERITED = ['toString', '__proto__', 'constructor', 'hasOwnProperty', 'valueOf']

    it.each(INHERITED)('drops a plot of %s instead of growing it', (crop) => {
      const plot = { id: 0, crop, plantedAt: T0 - 2 * MINUTE, readyAt: T0 - MINUTE, notified: false }
      const s = migrated({ ...V1_SAVE, plots: [plot] })
      expect(s.plots[0]).toEqual({ id: 0, crop: null, plantedAt: null, readyAt: null, notified: false, lastCrop: null })
      expect(() => advance(s, T0 + 1000)).not.toThrow()
      expect(Number.isFinite(harvestAll(plant(s, 0, 'radish', T0).state, T0 + DAY).state.coins)).toBe(true)
    })

    it('drops them from every other slice too', () => {
      const s = migrated({
        ...busyV2(),
        seeds: { toString: 5, radish: 1 },
        owned: { constructor: 2 },
        stats: { ...busyV2().stats, harvested: { toString: 3, radish: 2 } },
        gifts: ['toString', 'cat'],
        visitors: { since: null, nextPeriod: 0, present: [{ id: 'toString', arrivedAt: T0 }], seen: { valueOf: 2 } },
        keepsakes: { constructor: 1 },
        barn: { produce: { toString: 1 }, goods: { valueOf: 1 } },
        keep: { hasOwnProperty: 3 },
        jobs: [{ id: 1, station: 'toString', recipe: 'jam', startedAt: T0, readyAt: T0 + 1 }],
        made: { toString: 1 },
        restoration: { progress: { toString: [1] }, done: { valueOf: T0 } },
        fishing: { slots: { toString: 1 }, caught: { toString: { count: 1, firstAt: T0, best: 3 } }, big: { id: 'toString', spot: 'pond', size: 3, at: T0 } },
        mail: { letters: [{ id: 'toString', at: T0, read: false }] },
        stamps: { toString: T0 },
        placements: { 'constructor#0': { x: 0, z: 0, rot: 0 } },
        tints: { 'toString#0': 1 },
        variants: { toString: 1 },
      })
      for (const id of INHERITED) expect(JSON.stringify(s), id).not.toContain(`"${id}`)
      expect(s.seeds.radish).toBe(1)
      expect(s.gifts).toEqual(['cat'])
    })
  })

  it('repairs corrupt idle-loop fields slice by slice', () => {
    const s = migrated(
      busyRaw({
        journal: [{ id: 'x', at: T0, kind: 'work', title: 'bad id' }, { id: 9, at: T0, kind: 'gossip', title: 'bad kind' }, { id: 2, at: T0, kind: 'work', title: 'kept', note: 'n'.repeat(500) }],
        journalSeq: 1,
        seenAt: T0 + DAY,
        nextNote: 42,
        history: [{ date: 'yesterday', minutes: 5 }, { date: '2026-10-15', minutes: -3, tasks: 2 }],
        names: { cat: 'x'.repeat(100), dog: 7 },
        visitors: { since: 'soon', present: [{ id: 'dragon', arrivedAt: T0 }, { id: 'hare', arrivedAt: T0 }, { id: 'hare', arrivedAt: T0 }] },
        jobs: [{ id: 1, station: 'kitchen', recipe: 'yarn', startedAt: T0, readyAt: T0 + 1 }, { id: 2, station: 'mill', recipe: 'flour', startedAt: T0, readyAt: T0 - 1 }],
        restoration: { progress: { gardenGate: [99, -1], nowhere: [1] }, done: { pondJetty: 'yes', waterwheel: T0 } },
        placements: { 'flowerbed#0': { x: 1, z: 2 }, 'flowerbed#99': { x: 1, z: 2, rot: 0 }, 'castle#0': { x: 0, z: 0, rot: 0 }, 'lantern#1': { x: 999, z: 0, rot: 0 } },
        tints: { 'flowerbed#0': 9, 'lantern#0': 2 },
        variants: { roof: 7, sails: -2, chimney: 1 },
        cottageSeen: 40,
      }),
    )
    expect(s).toMatchObject({
      journal: [{ id: 2, at: T0, kind: 'work', title: 'kept', note: 'n'.repeat(140) }],
      journalSeq: 2,
      seenAt: T0,
      nextNote: '',
      history: [{ date: '2026-10-15', minutes: 0, tasks: 2, commits: 0, harvests: 0 }],
      names: { cat: 'x'.repeat(24), dog: '', flagship: '' },
      jobs: [],
      restoration: { progress: { gardenGate: [6, 0, 0] }, done: { waterwheel: T0 } },
      placements: { 'flowerbed#0': { x: 1, z: 2, rot: 0 } },
      tints: { 'lantern#0': 2 },
      variants: { roof: 2, sails: 0 },
      cottageSeen: 6,
    })
    expect(s.journal).toHaveLength(1)
    expect(s.visitors.since).toBeNull()
    expect(s.visitors.present).toEqual([{ id: 'hare', arrivedAt: T0 }])
  })

  describe('the post', () => {
    const lettersOf = (letters: unknown[]) => migrated(busyRaw({ mail: { letters, checkedAt: null } })).mail.letters
    const checkedAtOf = (checkedAt: unknown) => migrated(busyRaw({ mail: { letters: [], checkedAt } })).mail.checkedAt

    it('keeps each known letter once, with a valid time, and clamps a future one to now', () => {
      // A second copy, a cut resident's letter and a letter with no time are dropped.
      expect(
        lettersOf([
          { id: 'bell', at: T0 - DAY, read: true },
          { id: 'bell', at: T0, read: false },
          { id: 'hazel-welcome', at: T0, read: false },
          { id: 'cloud-sea', at: 'soon', read: false },
        ]),
      ).toEqual([{ id: 'bell', at: T0 - DAY, read: true }])
      // The clock ran ahead when the note came: the post mustn't wait for it.
      expect(lettersOf([{ id: 'bell', at: T0 + 3 * DAY, read: false }, { id: 'cloud-sea', at: T0 - DAY, read: true }])).toEqual([
        { id: 'bell', at: T0, read: false },
        { id: 'cloud-sea', at: T0 - DAY, read: true },
      ])
    })

    it('keeps a saved checkedAt that is not in the future, and drops one that is', () => {
      expect([T0 - DAY, T0, T0 + DAY, 'yesterday'].map(checkedAtOf)).toEqual([T0 - DAY, T0, null, null])
    })
  })

  it('keeps what was brought to a bundle that no longer asks for a visitor, each in its new place', () => {
    // Saved while the Fishing Bench and boardwalk loop still asked first for the heron and frog, the keeper's cottage last for the puffin.
    const raw = busyRaw({ restoration: { progress: { pondJetty: [0, 8, 1], boardwalkLoop: [0, 4, 15], keeperCottage: [0, 3, 0] }, done: {} } })
    expect(migrated(raw).restoration.progress).toEqual({ pondJetty: [8, 1], boardwalkLoop: [4, 15], keeperCottage: [0, 3] })
    // Known limit (see DROPPED in restoration.ts): the mushroom ring and stone circle swapped keepsakes for wood and milk in place.
    const kept = busyRaw({ restoration: { progress: { mushroomRing: [0, 2, 3], stoneCircle: [0, 4, 6] }, done: {} } })
    expect(migrated(kept).restoration.progress).toEqual({ mushroomRing: [0, 2, 3], stoneCircle: [0, 4, 6] })
  })

  it('lets the wild visitors who left go from an older save, and keeps the hare and everything else', () => {
    const kept = busyV2()
    kept.visitors = { since: T0 - 10 * DAY, nextPeriod: 6, present: [{ id: 'hare', arrivedAt: T0 - DAY }], seen: { hare: 3 } }
    kept.keepsakes = { hare: 2 }
    // The heron's hello, the newest line, as the journal wrote it: its history stays as written.
    kept.journal = [
      { id: 5, at: T0, kind: 'visitor', title: 'Still here. Still patient. The pond and I have an understanding.', detail: "The grey heron left a heron's feather." },
      ...kept.journal,
    ]
    kept.journalSeq = 5
    // Saved while the others still came: a robin and an eagle waiting, and others' hellos and keepsakes.
    const raw = json(kept)
    raw.visitors.present = [{ id: 'robin', arrivedAt: T0 - 2 * DAY }, ...raw.visitors.present, { id: 'eagle', arrivedAt: T0 - 60 * MINUTE }]
    raw.visitors.seen = { heron: 2, ...raw.visitors.seen, butterfly: 1, hedgehogWild: 4 }
    raw.keepsakes = { heron: 2, ...raw.keepsakes, eagle: 1 }
    expect(migrate(raw, T0)).toEqual(kept)
  })
})
