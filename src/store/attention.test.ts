import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { createStore, set } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CROPS, MINUTE } from '../game/config'
import { endSession, harvestAll, logTask, plant, startSession, type Result } from '../game/engine'
import { createInitialState, type GameState } from '../game/state'
import { RECAP_AFTER_MS } from '../game/systems/journal'

// Quiet mode only drops the toasts: the clock, every payout, the journal and the recap are unchanged.

const T0 = Date.UTC(2026, 10, 2, 9, 0, 0)
const READY = 'Your radish is ready'

/** A welcomed farm with a radish planted at T0, quiet or not. */
function farm(quiet: boolean) {
  const s = plant(createInitialState(T0), 0, 'radish', T0).state
  Object.assign(s.settings, { welcomed: true, tutorialDone: true, quiet })
  return JSON.parse(JSON.stringify(s))
}

/** A store module of its own, with the Attention switch on, started at T0 on the saved farm. */
async function startGame(saved: unknown) {
  await set('farm', saved, createStore('gitaway', 'saves'))
  const { FEATURES } = await import('../game/features')
  FEATURES.attention = true
  const { useGame } = await import('./game')
  await useGame.getState().init()
  return useGame
}
type Game = Awaited<ReturnType<typeof startGame>>

/** The one-second timer's tick at `at`, and whatever it sets off. */
async function tickAt(game: Game, at: number) {
  vi.setSystemTime(at)
  game.getState().tick()
  await new Promise((resolve) => setTimeout(resolve, 20))
}

/** Runs an action at `at`, as a click does. */
function runAt(game: Game, at: number, action: (s: GameState, now: number) => Result) {
  vi.setSystemTime(at)
  return game.getState().run(action)
}

/** An hour's play: a session with the radish ripening on the way, a task, the harvest and the hour ticking by. Returns the toast titles shown. */
async function anHour(game: Game) {
  const shown: string[] = []
  const unsubscribe = game.subscribe((s, before) => {
    for (const t of s.toasts) if (!before.toasts.includes(t)) shown.push(t.title)
  })
  runAt(game, T0 + 1000, startSession)
  for (let m = 5; m <= 50; m += 5) await tickAt(game, T0 + m * MINUTE)
  runAt(game, T0 + 50 * MINUTE + 1000, endSession)
  runAt(game, T0 + 51 * MINUTE, (s, now) => logTask(s, 'Write the quiet tests', now))
  runAt(game, T0 + 52 * MINUTE, harvestAll)
  for (const m of [55, 60]) await tickAt(game, T0 + m * MINUTE)
  unsubscribe()
  return shown
}

/** The farm with its quiet setting left out, to compare a quiet hour with a loud one. */
const withoutQuiet = (g: GameState) => ({ ...g, settings: { ...g.settings, quiet: undefined } })

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

describe('quiet mode', () => {
  it('never stops the clock or changes a payout: only the toasts go', async () => {
    expect(CROPS.radish.growMinutes).toBeLessThan(50)
    const loud = await startGame(farm(false))
    const loudToasts = await anHour(loud)

    vi.resetModules()
    vi.setSystemTime(T0)
    vi.stubGlobal('indexedDB', new IDBFactory())
    const quiet = await startGame(farm(true))
    const quietToasts = await anHour(quiet)

    // The same hour, to the coin, the minute and the journal line.
    const [a, b] = [loud.getState(), quiet.getState()]
    expect(b.now).toBe(T0 + 60 * MINUTE)
    expect(b.now).toBe(a.now)
    expect(withoutQuiet(b.game)).toEqual(withoutQuiet(a.game))
    expect(b.game.coins).toBeGreaterThan(farm(false).coins)
    expect([b.game.stats.sessions, b.game.stats.tasks]).toEqual([1, 1])
    expect(b.game.journal.map((e) => e.title)).toContain(READY)
    // Only the toasts differ.
    expect(loudToasts).toContain(READY)
    expect(loudToasts.length).toBeGreaterThan(2)
    expect(quietToasts).toEqual([])
  })

  it('still gathers the time away into the recap', async () => {
    let visibility: 'visible' | 'hidden' = 'visible'
    const listeners = new Map<string, () => void>()
    vi.stubGlobal('document', {
      get visibilityState() {
        return visibility
      },
      addEventListener: (type: string, listener: () => void) => void listeners.set(type, listener),
    })
    const game = await startGame(farm(true))
    for (const [state, at] of [['hidden', T0 + RECAP_AFTER_MS + MINUTE], ['visible', T0 + RECAP_AFTER_MS + MINUTE + 1000]] as const) {
      visibility = state
      listeners.get('visibilitychange')!()
      await tickAt(game, at)
    }
    expect(game.getState().recap?.map((e) => e.title)).toEqual([READY])
    expect(game.getState().toasts).toEqual([])
  })
})
