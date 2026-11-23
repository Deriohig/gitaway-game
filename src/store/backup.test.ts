import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { createStore, get, set } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renameFarm } from '../game/engine'
import { createInitialState, SAVE_VERSION } from '../game/state'

// What the store does with the backup it copies into localStorage when the page may be going away.

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)
const BACKUP = 'gitaway:farm'
/** A farm from a Gitaway newer than this one, stamped when that version saved it. */
const FUTURE = { ...JSON.parse(JSON.stringify(createInitialState(T0))), version: SAVE_VERSION + 1, farmName: 'Far Future', savedAt: T0 }

const saves = () => createStore('gitaway', 'saves')
const savedFarm = () => get('farm', saves())
/** Lets queued saves land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
const rename = (game: Awaited<ReturnType<typeof startGame>>, name: string) => game.getState().run((s) => renameFarm(s, name))
/** The backup as it is in localStorage now, or null. */
const backup = (): Record<string, unknown> | null => JSON.parse(localStorage.getItem(BACKUP) ?? 'null')

/** The page's event listeners, so a test can leave the page or switch tabs. */
let listeners: Map<string, (() => void)[]>
const fire = (type: string) => listeners.get(type)?.forEach((listener) => listener())

/** The channel the open tabs talk on: what this tab said, and a way to hear another tab. */
class FakeChannel {
  static current: FakeChannel | null = null
  said: unknown[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  constructor() {
    FakeChannel.current = this
  }
  postMessage(data: unknown) {
    this.said.push(data)
  }
  hear(data: unknown) {
    this.onmessage?.({ data })
  }
}

/** A store module of its own, started on whatever is in IndexedDB and localStorage now. */
async function startGame() {
  const { useGame } = await import('./game')
  await useGame.getState().init()
  return useGame
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  listeners = new Map()
  const addEventListener = (type: string, listener: () => void) => listeners.set(type, [...(listeners.get(type) ?? []), listener])
  const items = new Map<string, string>()
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('localStorage', { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) })
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener })
  vi.stubGlobal('window', { addEventListener })
  vi.stubGlobal('BroadcastChannel', undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it("never backs up a newer Gitaway's farm, not even on leaving, so no backup can replace it", async () => {
  await set('farm', FUTURE, saves())
  rename(await startGame(), 'Changed Here')
  vi.setSystemTime(T0 + 60_000)
  fire('pagehide')
  expect(backup()).toBeNull()
  // Opening the game again shows the newer farm as that version saved it.
  vi.resetModules()
  expect((await startGame()).getState().game.farmName).toBe('Far Future')
  await settle()
  expect(await savedFarm()).toEqual(FUTURE)
})

describe('the backup', () => {
  it('is taken with each change, before its save lands, and lasts only until it has', async () => {
    const game = await startGame()
    await settle()
    rename(game, 'Just Renamed')
    // Taken at once, so a page that ends with no chance to run its pagehide handler keeps the change.
    expect(backup()).toMatchObject({ farmName: 'Just Renamed' })
    await settle()
    expect(await savedFarm()).toMatchObject({ farmName: 'Just Renamed' })
    expect(backup()).toBeNull()
  })

  it('is adopted on coming back when it is newer than the save, written to IndexedDB, and then cleared', async () => {
    const game = await startGame()
    await settle()
    // Another tab closed before its last save landed, and left its backup.
    localStorage.setItem(BACKUP, JSON.stringify({ ...JSON.parse(JSON.stringify(game.getState().game)), farmName: 'Other Tab', savedAt: T0 + 30_000 }))
    vi.setSystemTime(T0 + 60_000)
    Object.assign(document, { visibilityState: 'visible' })
    fire('visibilitychange')
    await settle()
    expect(game.getState().game.farmName).toBe('Other Tab')
    expect(await savedFarm()).toMatchObject({ farmName: 'Other Tab' })
    expect(backup()).toBeNull()
  })
})

it("tells its stamps to the other tabs, and each save's is later than any another tab told", async () => {
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  const game = await startGame()
  await settle()
  const channel = FakeChannel.current!
  expect(channel.said.at(-1)).toMatchObject({ type: 'saved', savedAt: (await savedFarm()).savedAt })
  // Another tab saved with a clock a minute ahead of this one.
  channel.hear({ type: 'saved', from: 'other-tab', savedAt: T0 + 60_000 })
  await settle()
  rename(game, 'Later')
  await settle()
  expect((await savedFarm()).savedAt).toBeGreaterThan(T0 + 60_000)
})
