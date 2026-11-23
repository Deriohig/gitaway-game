import { expect, it } from 'vitest'
import { BUSHES, bushLook } from './layout'
import { bushModel } from './Nature'

// The farm's own bushes drawn as the art's painterly bushes.
const looks = BUSHES.map((_, i) => bushLook(i))

it('draws the farm’s bushes as the flowering bush wherever they flower, else the leafy or the berried one, by seed, the same each time', () => {
  expect(looks.some((l) => l.flowers)).toBe(true)
  for (const l of looks.filter((l) => l.flowers)) expect(bushModel(l.seed, true), `seed ${l.seed}`).toBe('bush_flowering')
  expect([...new Set(looks.filter((l) => !l.flowers).map((l) => bushModel(l.seed, false)))].sort()).toEqual(['bush_a', 'bush_berry'])
  for (let seed = 0; seed < 16; seed++) {
    expect(bushModel(seed, false)).toBe(bushModel(seed, false))
    expect(['bush_a', 'bush_berry']).toContain(bushModel(seed))
  }
})
