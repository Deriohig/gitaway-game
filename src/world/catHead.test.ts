import { expect, it } from 'vitest'
import { catHead } from './layout'

it('rests the porch cat’s head in place while it sleeps, and looks up by tilting its chin, never lifting the head off its body', () => {
  expect(catHead(false)).toEqual({ tilt: 0, lift: 0 })
  const awake = catHead(true)
  expect(awake.lift).toBe(0) // lifting showed the whole flat cut where the head meets the body
  expect(awake.tilt).toBeGreaterThan(0.2)
  expect(awake.tilt).toBeLessThan(0.4)
})
