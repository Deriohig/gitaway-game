import { describe, expect, it } from 'vitest'
import { advance } from '../advance'
import { LEVEL_XP, type IslandId, type ItemId } from '../config'
import { ISLAND_ORDER, ISLANDS } from '../content/biomes'
import { BUNDLES, BUNDLE_IDS } from '../content/bundles'
import { buyBlock, buyItem } from '../engine'
import { migrate } from '../save'
import { createInitialState, type GameState } from '../state'
import { useFeatures, withFeatures } from '../testing'
import { advanceRestoration, bundlesDone, bundlesOn, deposit, findDetail, isFound, islandOpen, isListed, isRestored, listedBundles, needStatus, restorationDue } from './restoration'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)
const DAY = 86_400_000

// The restorations (B3) are switched off as committed; these are their rules with the switch on.
useFeatures({ restorations: true })

const board = (patch: Partial<GameState> = {}): GameState => ({ ...createInitialState(T0 - 30 * DAY), xp: LEVEL_XP[5], levelSeen: 6, ...patch })
const owning = (s: GameState, owned: Partial<Record<ItemId, number>>): GameState => ({ ...s, owned: { ...s.owned, ...owned } })
const withBarn = (s: GameState, produce: GameState['barn']['produce'], goods: GameState['barn']['goods'] = {}): GameState => ({
  ...s,
  barn: { produce: { ...s.barn.produce, ...produce }, goods: { ...s.barn.goods, ...goods } },
})
/** Brings each listed need of a bundle in turn, insisting every deposit worked. */
const bring = (s: GameState, id: Parameters<typeof deposit>[1], needs: number[], at = T0) =>
  needs.reduce((acc, i) => {
    const r = deposit(acc, id, i, at)
    expect(r.ok, `${id} need ${i}`).toBe(true)
    return r.state
  }, s)

const HOME = ['gardenGate', 'pondJetty', 'kitchenShelf', 'waterwheel']
const GATE_BARN = { carrot: 6, radish: 6, wheat: 4 }
const restorationLines = (s: GameState) => s.journal.filter((e) => e.kind === 'restoration')
const firstLines = (s: GameState) => s.journal.filter((e) => e.kind === 'story' && e.title.startsWith('The first thing on the notice board'))
const refused = (s: GameState) => ({ state: s, notices: [], ok: false })

describe('the board', () => {
  it('lists the home island from level 6, then each other island once it is owned', () => {
    expect(listedBundles(owning(board({ xp: LEVEL_XP[4], levelSeen: 5 }), { meadow: 1 }))).toEqual([])
    const s = board()
    expect(listedBundles(s)).toEqual(HOME)
    expect(isListed(s, 'wildflowers')).toBe(false)
    expect(listedBundles(owning(s, { meadow: 1 }))).toEqual([...HOME, 'wildflowers', 'shepherdsHut', 'stoneBridge'])
    expect(listedBundles(owning(s, { highland: 1 }))).toEqual([...HOME, 'stoneCircle', 'bothy', 'summitCairn'])
    expect(listedBundles(owning(s, { cottageLand: 1, orchardLand: 1 }))).toEqual(HOME)
  })

  it("has a list for every island with bundles, and opens each isle's list with its own land", () => {
    expect(ISLAND_ORDER).toEqual(['main', 'meadow', 'grove', 'islet', 'wetland', 'highland'])
    for (const island of Object.keys(ISLANDS) as IslandId[]) {
      expect(ISLAND_ORDER.includes(island), island).toBe(bundlesOn(island).length > 0)
      const land = ISLANDS[island].land
      if (land) expect([islandOpen(board(), island), islandOpen(owning(board(), { [land]: 1 }), island)], island).toEqual([false, true])
    }
  })

  const conditionsMet = owning(board({ wood: 50 }), { meadow: 1, beehive: 1, highland: 1, goat: 2 })
  it.each([
    ['a bundle not on the board yet', withBarn(board(), { sunflower: 10 }), 'wildflowers', 1],
    ['a condition that holds', conditionsMet, 'wildflowers', 0],
    ['a condition that holds, on the highland', conditionsMet, 'stoneCircle', 0],
  ] as const)('refuses a deposit for %s', (_, s, id, need) => expect(deposit(s, id, need, T0)).toEqual(refused(s)))

  it('takes nothing while the restorations are switched off', () => {
    const s = board({ wood: 50 })
    withFeatures({ restorations: false }, () => expect(deposit(s, 'pondJetty', 0, T0)).toEqual(refused(s)))
  })
})

describe('deposits', () => {
  it('keeps a partial deposit for good (a month away, a save); brings only what is still needed; says where things come from', () => {
    const s = bring(withBarn(board(), { carrot: 4 }), 'gardenGate', [0])
    expect(s.restoration.progress.gardenGate).toEqual([4, 0, 0])
    expect(s.barn.produce.carrot).toBe(0)
    expect(needStatus(s, 'gardenGate')[0]).toMatchObject({ amount: 6, brought: 4, left: 2, have: 0, canBring: 0, met: false })
    const away = advance(s, T0 + 31 * DAY).state
    expect(away.restoration.progress.gardenGate).toEqual([4, 0, 0])
    expect(migrate(JSON.parse(JSON.stringify(away)), T0 + 31 * DAY)!.restoration).toEqual(away.restoration)
    // Five in the barn, two still needed: three stay. A full need takes no more.
    const r = deposit(withBarn(s, { carrot: 5 }), 'gardenGate', 0, T0 + 1000)
    expect([r.notices[0].title, r.state.restoration.progress.gardenGate, r.state.barn.produce.carrot]).toEqual(['Brought 2 carrots', [6, 0, 0], 3])
    expect(deposit(r.state, 'gardenGate', 0, T0 + 2000)).toEqual(refused(r.state))
    expect(deposit(board(), 'gardenGate', 2, T0).notices[0]).toMatchObject({ kind: 'warn', title: 'No sheaves of wheat to bring yet' })
  })

  it('takes crops from the barn only (never seeds), goods from the barn, wood and coins from the purse, and pays nothing yet', () => {
    const seeded = board({ wood: 20, coins: 500, seeds: { ...board().seeds, carrot: 9 } })
    expect(deposit(seeded, 'gardenGate', 0, T0).ok).toBe(false)
    let s = bring(withBarn(seeded, { carrot: 6 }, { honey: 1 }), 'gardenGate', [0])
    expect({ seeds: s.seeds.carrot, carrots: s.barn.produce.carrot }).toEqual({ seeds: 9, carrots: 0 })
    s = bring(bring(s, 'pondJetty', [1, 0]), 'waterwheel', [0])
    expect({ honey: s.barn.goods.honey, wood: s.wood, coins: s.coins, xp: s.xp }).toEqual({ honey: 0, wood: 12, coins: 200, xp: seeded.xp })
    expect(s.restoration.progress).toMatchObject({ pondJetty: [8, 1], waterwheel: [300, 0] })
    expect(restorationLines(s)).toEqual([])
  })
})

describe('finishing', () => {
  it('finishes once everything is brought: its XP, a journal line, a toast and the first-bundle story', () => {
    const s = board()
    const last = deposit(bring(withBarn(s, GATE_BARN), 'gardenGate', [0, 1]), 'gardenGate', 2, T0 + 5)
    const done = last.state
    expect([done.restoration.done.gardenGate, done.stats.bundles, done.xp]).toEqual([T0 + 5, 1, s.xp + BUNDLES.gardenGate.xp])
    expect([done.coins, done.wood]).toEqual([s.coins, s.wood])
    expect(restorationLines(done)).toEqual([expect.objectContaining({ at: T0 + 5, title: 'Garden Gate restored', detail: BUNDLES.gardenGate.change })])
    expect(last.notices.map((n) => n.title)).toEqual(['Brought 4 sheaves of wheat', 'Garden Gate restored'])
    expect(firstLines(done)).toEqual([expect.objectContaining({ at: T0 + 5, title: 'The first thing on the notice board is mended. Its card has been crossed through, neatly.' })])
  })

  it('finishes only once, however often time passes or Bring is pressed; a second bundle is not a first', () => {
    const done = bring(withBarn(board(), GATE_BARN), 'gardenGate', [0, 1, 2])
    expect(advanceRestoration(structuredClone(done), T0 + DAY, [])).toBe(false)
    expect(advance(done, T0 + 40 * DAY).state.stats.bundles).toBe(1)
    const more = withBarn(done, { carrot: 6 })
    expect(deposit(more, 'gardenGate', 0, T0).ok).toBe(false)
    expect(restorationLines(advance(more, T0 + 2 * DAY).state).map((e) => e.title)).toEqual(['Garden Gate restored'])
    const w = bring({ ...done, coins: 300, wood: 10 }, 'waterwheel', [0, 1])
    expect([w.stats.bundles, firstLines(w).length]).toEqual([2, 1])
  })

  it('finishes with conditions that hold, or waits and finishes on its own when one comes true', () => {
    const held = withBarn(owning(board(), { meadow: 1, beehive: 1, flowerbed: 2 }), { sunflower: 6 })
    const done = deposit(held, 'wildflowers', 1, T0).state
    expect(isRestored(done, 'wildflowers')).toBe(true)
    expect(done.restoration.progress.wildflowers).toEqual([0, 6, 0])
    expect(done.xp).toBe(held.xp + BUNDLES.wildflowers.xp)

    let s = bring(withBarn(owning(board(), { meadow: 1, beehive: 1, flowerbed: 1 }), { sunflower: 6 }), 'wildflowers', [1])
    expect(needStatus(s, 'wildflowers')[2]).toMatchObject({ consumed: false, met: false })
    expect([isRestored(s, 'wildflowers'), restorationDue(s), isRestored(advance(s, T0 + DAY).state, 'wildflowers')]).toEqual([false, false, false])
    // Building is the player's doing; the board notices on the next tick.
    const bought = buyItem({ ...s, coins: 1000 }, 'flowerbed', T0 + 10)
    expect(bought.ok).toBe(true)
    s = bought.state
    expect([isRestored(s, 'wildflowers'), restorationDue(s)]).toEqual([false, true])
    const r = advance(s, T0 + 11)
    expect(r.state.restoration.done.wildflowers).toBe(T0 + 11)
    expect(r.notices.map((n) => n.title)).toContain('Wildflower Meadow restored')
    expect(restorationDue(r.state)).toBe(false)
  })

  it('opens the wetland after 4 bundles and the highland after 9', () => {
    const doneN = (n: number): GameState['restoration']['done'] => Object.fromEntries(BUNDLE_IDS.slice(0, n).map((id) => [id, T0]))
    let s = board({ xp: LEVEL_XP[11], levelSeen: 12, coins: 10_000, wood: 500 })
    s = bring({ ...s, restoration: { progress: {}, done: doneN(2) } }, 'waterwheel', [0, 1])
    expect([bundlesDone(s), buyBlock(s, 'wetland')]).toEqual([3, 'bundles'])
    s = bring(withBarn(s, {}, { flour: 2, jam: 2, eggs: 6 }), 'kitchenShelf', [0, 1, 2])
    expect([bundlesDone(s), buyBlock(s, 'wetland'), buyBlock(s, 'highland')]).toEqual([4, null, 'bundles'])
    expect(buyBlock({ ...s, restoration: { progress: {}, done: doneN(9) } }, 'highland')).toBe(null)
  })
})

describe('old saves', () => {
  it('loads deposits saved before the visitors left, and the board carries on from them', () => {
    // The Fishing Bench asked first for the heron then: what was brought for it moves up a place.
    const raw = {
      ...JSON.parse(JSON.stringify(board({ wood: 10 }))),
      restoration: { progress: { pondJetty: [0, 5, 2], gardenGate: [4, 0, 0] }, done: { waterwheel: T0 - DAY } },
    }
    const s = migrate(raw, T0)!
    expect(s.restoration).toEqual({ progress: { pondJetty: [5, 2], gardenGate: [4, 0, 0] }, done: { waterwheel: T0 - DAY } })
    expect(needStatus(s, 'pondJetty').map((n) => n.left)).toEqual([3, 0])
    const r = deposit(s, 'pondJetty', 0, T0)
    expect(r.notices.map((n) => n.title)).toEqual(['Brought 3 wood', 'Fishing Bench restored'])
    expect([r.state.wood, bundlesDone(r.state), firstLines(r.state)]).toEqual([7, 2, []]) // the waterwheel was the first, long ago
  })

  it('keeps the details found through a save, and repairs junk', () => {
    const s = JSON.parse(JSON.stringify(board()))
    const raw = { ...s, restoration: { progress: { gardenGate: [40, 'x'] }, done: {}, found: { bell: T0, gong: T0, note: 'no' } } }
    expect(migrate(raw, T0)!.restoration).toEqual({ progress: { gardenGate: [6, 0, 0] }, done: {}, found: { bell: T0 } })
    expect(migrate(s, T0)!.restoration).toEqual({ progress: {}, done: {} })
  })
})

describe('hidden details', () => {
  useFeatures({ biomes: true }) // they belong to the biomes (C2), switched off as committed
  const wetland = () => owning(board(), { wetland: 1 })

  it('writes one line, once, and nothing else; stays hidden on an isle not there yet or with the biomes off', () => {
    const s = wetland()
    const r = findDetail(s, 'bell', T0)
    expect([r.ok, isFound(r.state, 'bell'), findDetail(r.state, 'bell', T0 + 1).ok]).toEqual([true, true, false])
    expect(r.state.journal[0]).toMatchObject({ at: T0, kind: 'story', title: 'A bell rang under the wetland' })
    expect([r.state.coins, r.state.wood, r.state.xp]).toEqual([s.coins, s.wood, s.xp])
    expect([findDetail(board(), 'bell', T0).ok, findDetail(s, 'note', T0).ok]).toEqual([false, false])
    withFeatures({ biomes: false }, () => expect(findDetail(s, 'bell', T0).ok).toBe(false))
  })
})
