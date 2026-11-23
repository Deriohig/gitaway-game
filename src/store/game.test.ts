import { afterEach, describe, expect, it } from 'vitest'
import { createInitialState } from '../game/state'
import { withFeatures } from '../game/testing'
import { useGame } from './game'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)

// A save can say quiet: true (from a later version); it must not hide toasts while the Attention switch is off.
describe('quiet mode', () => {
  afterEach(() => useGame.setState({ toasts: [] }))

  it.each([
    [false, ['Bought radish seeds', 'Not enough coins']],
    [true, ['Not enough coins']],
  ])('with the Attention switch %s, a quiet save keeps %j', (attention, kept) => {
    withFeatures({ attention }, () => {
      const game = createInitialState(T0)
      game.settings.quiet = true
      useGame.setState({ game, toasts: [] })
      useGame.getState().notify({ kind: 'info', title: 'Bought radish seeds' })
      useGame.getState().notify({ kind: 'warn', title: 'Not enough coins' })
      expect(useGame.getState().toasts.map((t) => t.title)).toEqual(kept)
    })
  })
})
