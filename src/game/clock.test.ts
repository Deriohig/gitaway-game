import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The game clock: the device's time plus an offset that only a development build can move, forward only, across reloads.

const T0 = Date.UTC(2026, 9, 19, 9, 0, 0)
const HOUR = 3_600_000
const KEY = 'gitaway:dev-clock'

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, String(v)),
    removeItem: (k: string) => void items.delete(k),
  }
}

let storage: ReturnType<typeof memoryStorage>
/** Where the page's `storage` listeners go. */
let events: EventTarget

/** A fresh copy of the module, as after a page reload (or another tab: they share the storage). */
async function loadClock() {
  vi.resetModules()
  return import('./clock')
}

/** What the browser tells the other tabs once one of them has changed local storage (`key` null: cleared it). */
function storageEvent(key: string | null = KEY) {
  events.dispatchEvent(Object.assign(new Event('storage'), { key, newValue: key === null ? null : storage.getItem(key) }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  events = new EventTarget()
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('the game clock', () => {
  it('is the device clock until time is skipped, then moves forward by each skip and keeps going with the device clock', async () => {
    const clock = await loadClock()
    expect([clock.clockOffset(), clock.now()]).toEqual([0, T0])
    expect(clock.skipAhead(HOUR)).toBe(HOUR)
    expect(clock.skipAhead(8 * HOUR)).toBe(9 * HOUR)
    vi.setSystemTime(T0 + 1000)
    expect(clock.now()).toBe(T0 + 9 * HOUR + 1000)
  })

  it('never moves backwards', async () => {
    const clock = await loadClock()
    clock.skipAhead(HOUR)
    expect([clock.skipAhead(-2 * HOUR), clock.skipAhead(Number.NaN), clock.skippedOffset(HOUR, -1), clock.skippedOffset(HOUR, 1.7)]).toEqual([HOUR, HOUR, HOUR, HOUR + 1])
    expect(clock.now()).toBe(T0 + HOUR)
  })

  it('keeps a skip across a reload, so the clock does not jump back', async () => {
    ;(await loadClock()).skipAhead(24 * HOUR)
    expect(storage.items.get(KEY)).toBe(String(24 * HOUR))
    const reloaded = await loadClock()
    expect([reloaded.clockOffset(), reloaded.now()]).toEqual([24 * HOUR, T0 + 24 * HOUR])
  })

  it('goes back to the device clock when the farm is erased, and tells listeners only when it moves', async () => {
    const clock = await loadClock()
    const heard = vi.fn()
    const stop = clock.subscribeClock(heard)
    clock.skipAhead(HOUR)
    clock.skipAhead(0)
    clock.skipAhead(7 * HOUR)
    clock.resetClock()
    expect(heard).toHaveBeenCalledTimes(3)
    expect(clock.now()).toBe(T0)
    expect(storage.items.has(KEY)).toBe(false)
    expect((await loadClock()).clockOffset()).toBe(0)
    stop()
    clock.skipAhead(HOUR)
    expect(heard).toHaveBeenCalledTimes(3)
  })

  it('works where storage is blocked', async () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    const clock = await loadClock()
    expect(clock.skipAhead(HOUR)).toBe(HOUR)
    expect(clock.now()).toBe(T0 + HOUR)
  })

  it('never moves in a production build, whatever is stored', async () => {
    storage.setItem(KEY, String(5 * HOUR))
    vi.stubGlobal('__DEV_TOOLS__', false)
    const clock = await loadClock()
    expect([clock.clockOffset(), clock.skipAhead(HOUR)]).toEqual([0, 0])
    clock.resetClock()
    expect(clock.now()).toBe(T0)
    expect(storage.items.get(KEY)).toBe(String(5 * HOUR))
    storage.setItem(KEY, String(9 * HOUR))
    storageEvent()
    expect(clock.now()).toBe(T0)
  })

  it('moves in a dev-tools build, which is a production build with the tools switched on', async () => {
    // The `devtools` mode is a normal optimised build: Vite's DEV is false there, and only the dev-tools switch is on.
    vi.stubEnv('DEV', false)
    vi.stubEnv('PROD', true)
    vi.stubGlobal('__DEV_TOOLS__', true)
    storage.setItem(KEY, String(2 * HOUR))
    const clock = await loadClock()
    expect(clock.clockOffset()).toBe(2 * HOUR)
    expect(clock.skipAhead(HOUR)).toBe(3 * HOUR)
    expect(clock.now()).toBe(T0 + 3 * HOUR)
    expect(storage.items.get(KEY)).toBe(String(3 * HOUR))
  })
})

describe('the game clock with several tabs open', () => {
  it('takes up a skip made in another tab, and tells its listeners', async () => {
    const clock = await loadClock()
    const heard = vi.fn()
    clock.subscribeClock(heard)
    storage.setItem(KEY, String(8 * HOUR))
    storageEvent()
    expect([clock.clockOffset(), clock.now()]).toEqual([8 * HOUR, T0 + 8 * HOUR])
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('never goes back for an older offset from another tab, and ignores other keys', async () => {
    const clock = await loadClock()
    clock.skipAhead(9 * HOUR)
    storage.setItem(KEY, String(HOUR))
    storageEvent()
    storage.setItem('gitaway:farm', '{}')
    storageEvent('gitaway:farm')
    expect(clock.clockOffset()).toBe(9 * HOUR)
  })

  it('goes back to the device clock when another tab erases the farm, or the storage is cleared', async () => {
    const clock = await loadClock()
    clock.skipAhead(8 * HOUR)
    const heard = vi.fn()
    clock.subscribeClock(heard)
    storage.removeItem(KEY)
    storageEvent()
    expect([clock.clockOffset(), clock.now()]).toEqual([0, T0])
    expect(heard).toHaveBeenCalledTimes(1)
    clock.skipAhead(HOUR)
    storage.items.clear()
    storageEvent(null)
    expect(clock.clockOffset()).toBe(0)
  })
})
