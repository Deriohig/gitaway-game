import { afterEach, expect, it } from 'vitest'
import { setWaterReport, waterDrawnV2, waterReport, waterTierReport } from './report'

// The world element's data-water (each piece's own report, in the blueprint's piece order) and data-water-tier.
afterEach(() => {
  for (const piece of ['main', 'wetland', 'highland'] as const) setWaterReport(piece, null)
})

it('reports what each piece’s water is drawn as, in the blueprint’s order, and drops a piece that reports nothing', () => {
  expect([waterReport(), waterDrawnV2('main')]).toEqual(['', false])
  setWaterReport('main', 'main:legacy')
  expect([waterReport(), waterDrawnV2('main')]).toEqual(['main:legacy', false])
  setWaterReport('highland', 'highland:legacy')
  setWaterReport('main', 'main:v2:pond')
  setWaterReport('wetland', 'wetland:legacy')
  expect([waterReport(), waterDrawnV2('main'), waterDrawnV2('wetland')]).toEqual(['main:v2:pond wetland:legacy highland:legacy', true, false])
  setWaterReport('main', null)
  expect([waterReport(), waterDrawnV2('main')]).toEqual(['wetland:legacy highland:legacy', false])
})

it('gives the tier a piece reports with its water (today’s included), empty until one does, and drops it with the piece', () => {
  setWaterReport('main', 'main:legacy')
  expect(waterTierReport()).toBe('')
  setWaterReport('main', 'main:legacy', 'phone')
  expect(waterTierReport()).toBe('phone')
  setWaterReport('main', 'main:v2:pond', 'mid')
  setWaterReport('wetland', 'wetland:legacy', 'mid')
  setWaterReport('main', null)
  expect(waterTierReport()).toBe('mid')
  setWaterReport('wetland', null)
  expect(waterTierReport()).toBe('')
})
