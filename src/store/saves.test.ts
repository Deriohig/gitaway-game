import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { createStore, get, keys, set } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renameFarm } from '../game/engine'
import { ECONOMY_CHANGED } from '../game/save'
import { createInitialState, SAVE_VERSION } from '../game/state'

// What the store does with the farm already in IndexedDB when it starts: a newer Gitaway's save is never
// written over, and an older version's save is kept aside, as it was, before the first write upgrades it.

const NEWER = "This farm was saved by a newer Gitaway, so changes won't be kept here"
const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)

/** The farm as version 1 wrote it. */
const V1 = {
  version: 1,
  createdAt: T0 - 30 * 86_400_000,
  farmName: 'Old Orchard',
  coins: 2000,
  wood: 120,
  xp: 1100,
  levelSeen: 7,
  seeds: { radish: 3 },
  plots: [],
  owned: { plot: 0, chicken: 2 },
  gifts: ['cat'],
  session: null,
  daily: { date: '2026-10-17', sessionMinutes: 0, tasks: [], commits: 0 },
  repos: [],
  recent: [],
  stats: { sessions: 1, sessionMinutes: 30, tasks: 0, planted: 0, harvested: {}, coinsEarned: 30, commits: 0 },
  settings: { motion: 'auto', timeOfDay: 'clock', ambientSound: false, sessionPanelCollapsed: false, welcomed: true, tutorialDone: true },
}
/** A farm from a Gitaway newer than this one, with a field this one doesn't know. */
const FUTURE = { ...JSON.parse(JSON.stringify(createInitialState(T0))), version: SAVE_VERSION + 1, farmName: 'Far Future', ferries: { docked: 3 } }

const saves = () => createStore('gitaway', 'saves')
const stored = (key: string) => get(key, saves())
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
const rename = (game: Game, name: string) => game.getState().run((s) => renameFarm(s, name))
const titles = (game: Game) => game.getState().toasts.map((t) => t.title)

/** A store module of its own, started on whatever is in IndexedDB now. */
async function startGame() {
  const { useGame } = await import('./game')
  await useGame.getState().init()
  return useGame
}
type Game = Awaited<ReturnType<typeof startGame>>

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {} })
  vi.stubGlobal('window', { addEventListener: () => {} })
  vi.stubGlobal('BroadcastChannel', undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe("a newer Gitaway's save", () => {
  it('is loaded as far as it can be, with one warning, and never written over however much happens', async () => {
    await set('farm', FUTURE, saves())
    const game = await startGame()
    expect(game.getState().game.farmName).toBe('Far Future')
    expect(game.getState().toasts.map((t) => [t.kind, t.title])).toEqual([['warn', NEWER]])
    rename(game, 'Changed Here')
    game.getState().tick()
    await settle()
    expect(game.getState().game.farmName).toBe('Changed Here')
    expect(await stored('farm')).toEqual(FUTURE)
    expect(titles(game).filter((t) => t === NEWER)).toHaveLength(1)
  })

  it('can still be erased on purpose, and the new farm is kept', async () => {
    await set('farm', FUTURE, saves())
    const game = await startGame()
    await game.getState().reset()
    rename(game, 'Fresh Start')
    await settle()
    expect(await stored('farm')).toMatchObject({ version: SAVE_VERSION, farmName: 'Fresh Start' })
  })
})

describe('a version 1 save', () => {
  it('is kept as it was under farm-v1 before the first write upgrades it, and not once the farm is erased', async () => {
    await set('farm', V1, saves())
    const game = await startGame()
    await vi.waitFor(async () => expect(await stored('farm')).toMatchObject({ version: SAVE_VERSION }))
    expect(await stored('farm-v1')).toEqual(V1)
    await game.getState().reset()
    expect(await keys(saves())).toEqual(['farm'])
  })

  it('says once, in a toast, that the economy changed', async () => {
    await set('farm', V1, saves())
    const game = await startGame()
    expect(titles(game).filter((t) => t === ECONOMY_CHANGED.title)).toHaveLength(1)
    await vi.waitFor(async () => expect(await stored('farm')).toMatchObject({ version: SAVE_VERSION, told: expect.arrayContaining([ECONOMY_CHANGED.id]) }))
    // Opened again, on the farm it saved, it says nothing more.
    vi.resetModules()
    expect(titles(await startGame())).not.toContain(ECONOMY_CHANGED.title)
  })
})

it('copies nothing aside for a save of this version', async () => {
  await set('farm', JSON.parse(JSON.stringify(createInitialState(T0))), saves())
  const game = await startGame()
  rename(game, 'Same Version')
  await vi.waitFor(async () => expect(await stored('farm')).toMatchObject({ farmName: 'Same Version' }))
  expect(await keys(saves())).toEqual(['farm'])
  expect(game.getState().toasts).toEqual([])
})
