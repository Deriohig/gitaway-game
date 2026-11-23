import { describe, expect, it } from 'vitest'
import { retirementCaption } from './CottageCard'

// The retirement card says "Islander", not "retirement" (lore canon).
describe('retirementCaption', () => {
  it.each([
    [0.5, '50% of the way to becoming an Islander.'],
    [1, "You're an Islander."],
  ])('at %f says %s', (progress, caption) => expect(retirementCaption(progress)).toBe(caption))
})
