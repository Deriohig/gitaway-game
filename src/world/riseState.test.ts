import { expect, it } from 'vitest'
import { joinedIsles } from './riseState'

// Which pieces the farm's rim gives way to: the scatter by the rim and the stream's waterfall stay until a piece rising in has docked.
it('joins the pieces there when the farm opened straight away, leaves out one still rising in until it has docked, and one not drawn yet', () => {
  expect(joinedIsles(['meadow', 'grove'], [], [])).toEqual(['meadow', 'grove'])
  expect(joinedIsles(['meadow', 'wetland'], ['wetland'], [])).toEqual(['meadow'])
  expect(joinedIsles(['meadow', 'wetland'], ['wetland'], ['meadow', 'wetland'])).toEqual(['meadow', 'wetland'])
  expect(joinedIsles([], ['grove'], ['grove'])).toEqual([])
})
