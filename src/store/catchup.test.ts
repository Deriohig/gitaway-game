import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { createStore, set } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CROPS, MINUTE } from '../game/config'
import { DEV_SKIPS } from '../game/dev'
import { plant } from '../game/engine'
import { createInitialState } from '../game/state'
import { RECAP_AFTER_MS } from '../game/systems/journal'

// Coming back after a while: on load, on returning to the tab, and when the computer wakes from sleep.
// A long enough gap gathers what happened into the recap card (journal on, farm welcomed); otherwise toasts say it.

const T0 = Date.UTC(2026, 10, 2, 9, 0, 0)
const READY = 'Your radish is ready'
const RIPE = T0 + CROPS.radish.growMinutes * MINUTE
const HOURS_10 = 10 * 60 * MINUTE
const wait = () => new Promise((resolve) => setTimeout(resolve, 50))

/** A farm with a radish planted at T0, welcomed or not. */
function farm({ welcomed = true } = {}) {
  const s = plant(createInitialState(T0), 0, 'radish', T0).state
  s.settings.welcomed = welcomed
  s.settings.tutorialDone = welcomed
  return JSON.parse(JSON.stringify(s))
}

/** A store module of its own, with the journal switch as given, started at T0 on the saved farm. */
async function startGame(saved: unknown, { journal = true } = {}) {
  await set('farm', saved, createStore('gitaway', 'saves'))
  const { FEATURES } = await import('../game/features')
  FEATURES.journal = journal
  const { useGame } = await import('./game')
  await useGame.getState().init()
  return useGame
}
type Game = Awaited<ReturnType<typeof startGame>>

/** The next tick of the game's one-second timer, at `at`, and whatever it sets off. */
async function tickAt(game: Game, at: number) {
  vi.setSystemTime(at)
  game.getState().tick()
  await wait()
}

const toastTitles = (game: Game) => game.getState().toasts.map((t) => t.title)
const recapTitles = (game: Game) => game.getState().recap?.map((e) => e.title) ?? null

/** A page whose tab can be hidden and shown again, as the player switching away and back. */
function hideableTab() {
  let visibility: 'visible' | 'hidden' = 'visible'
  const listeners = new Map<string, () => void>()
  vi.stubGlobal('document', {
    get visibilityState() {
      return visibility
    },
    addEventListener: (type: string, listener: () => void) => void listeners.set(type, listener),
  })
  return (state: typeof visibility) => {
    visibility = state
    listeners.get('visibilitychange')!()
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {} })
  vi.stubGlobal('window', { addEventListener: () => {} })
  vi.stubGlobal('BroadcastChannel', undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('skipping time in a development build', () => {
  it.each(DEV_SKIPS)('catches up straight away after the Dev panel\'s "$label", as after a real absence', async ({ ms }) => {
    const game = await startGame(farm())
    const { skipAhead, now } = await import('../game/clock')
    expect(game.getState().game.plots[0].crop).toBe('radish')
    // The button only moves the clock on: the store ticks when it moves.
    skipAhead(ms)
    await wait()
    expect([now(), game.getState().now, game.getState().game.seenAt]).toEqual([T0 + ms, T0 + ms, T0 + ms])
    // What happened meanwhile is gathered into the recap card, not told in toasts.
    expect(recapTitles(game) ?? []).toContain(READY)
    expect(toastTitles(game)).not.toContain(READY)
    // Actions run at the game's time from then on.
    expect(game.getState().run((s, at) => ({ state: { ...s, seenAt: at + 1 }, notices: [], ok: true }))).toBe(true)
    expect(game.getState().game.seenAt).toBe(T0 + ms + 1)
  })

  it('catches up straight away when another tab skips time', async () => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) })
    const events = new EventTarget()
    vi.stubGlobal('addEventListener', events.addEventListener.bind(events))
    const game = await startGame(farm())
    // The other tab's "+1 hour", as the browser reports it here.
    items.set('gitaway:dev-clock', String(60 * MINUTE))
    events.dispatchEvent(Object.assign(new Event('storage'), { key: 'gitaway:dev-clock', newValue: String(60 * MINUTE) }))
    await wait()
    expect(game.getState().now).toBe(T0 + 60 * MINUTE)
    expect(recapTitles(game)).toEqual([READY])
  })

  it('puts the clock back when the farm is erased', async () => {
    const game = await startGame(farm())
    const { skipAhead, clockOffset } = await import('../game/clock')
    skipAhead(24 * 60 * MINUTE)
    await game.getState().reset()
    expect(clockOffset()).toBe(0)
    expect(game.getState().game.createdAt).toBe(T0)
  })
})

describe('waking from sleep with the tab never hidden', () => {
  it('shows the recap once the gap between ticks reaches the recap threshold', async () => {
    expect(CROPS.radish.growMinutes * MINUTE).toBeLessThan(RECAP_AFTER_MS)
    const game = await startGame(farm())
    await tickAt(game, T0 + RECAP_AFTER_MS)
    expect(recapTitles(game)).toEqual([READY])
    expect(toastTitles(game)).not.toContain(READY)
    expect(game.getState().game.seenAt).toBe(T0 + RECAP_AFTER_MS)
  })

  it.each([
    ['the gap is shorter', farm(), true, RECAP_AFTER_MS - 1000],
    ['the farm is not welcomed yet', farm({ welcomed: false }), true, 2 * RECAP_AFTER_MS],
    ['the journal is switched off', farm(), false, 2 * RECAP_AFTER_MS],
  ])('is an ordinary tick with toasts when %s', async (_, saved, journal, gap) => {
    const game = await startGame(saved, { journal })
    await tickAt(game, T0 + gap)
    expect(recapTitles(game)).toBeNull()
    expect(toastTitles(game)).toContain(READY)
  })
})

describe('coming back to the tab', () => {
  it('gathers the time away into the recap, even when the one-second tick comes before the farm is read back', async () => {
    const show = hideableTab()
    const game = await startGame(farm())
    // A hidden tab's timer still comes round now and then, and says nothing.
    show('hidden')
    await tickAt(game, T0 + RECAP_AFTER_MS + MINUTE)
    expect(toastTitles(game)).not.toContain(READY)
    // Back again: the timer, held back while hidden, fires before the farm is read back from storage.
    show('visible')
    await tickAt(game, T0 + RECAP_AFTER_MS + MINUTE + 1000)
    expect(recapTitles(game)).toEqual([READY])
    expect(toastTitles(game)).not.toContain(READY)
  })
})

describe('what happened while away is written down when it happened', () => {
  it('a crop that ripened while the computer slept is in the recap, stamped when it ripened', async () => {
    const game = await startGame(farm())
    await tickAt(game, T0 + HOURS_10)
    expect(recapTitles(game)).toContain(READY)
    expect(game.getState().game.journal.find((e) => e.title === READY)?.at).toBe(RIPE)
  })

  it('one that ripened just before the tab was hidden, before a tick saw it, is in the recap all the same', async () => {
    const show = hideableTab()
    const game = await startGame(farm())
    await tickAt(game, RIPE - 500)
    // Hidden half a second after it ripened: the player was last here after that.
    vi.setSystemTime(RIPE + 500)
    show('hidden')
    expect(game.getState().game.seenAt).toBe(RIPE + 500)
    vi.setSystemTime(RIPE + HOURS_10)
    show('visible')
    await wait()
    expect(recapTitles(game)).toContain(READY)
    expect(toastTitles(game)).not.toContain(READY)
  })
})
