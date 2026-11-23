import * as THREE from 'three'
import { afterEach, expect, it, vi } from 'vitest'
import waterRaw from '../../../public/models/water.json?raw'
import { createSharedWaterUniforms } from './driver'
import { waterReadout } from './readout'
import type { WaterJson } from './types'
import { createWaterMaterial } from './waterMaterial'

const water = JSON.parse(waterRaw) as WaterJson
afterEach(() => vi.unstubAllGlobals())

it('is window.__water wherever there is a window, and leaves the tier to useWaterTier, not to a material', () => {
  expect(typeof window).toBe('undefined')
  const win = {} as { __water?: unknown }
  vi.stubGlobal('window', win)
  expect(waterReadout()).toBe(win.__water)
  expect(win.__water).toEqual({ tier: '', bodies: [], misses: [], compiled: [], shown: [] })
  const maps = { map: new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat), noise: new THREE.DataTexture(new Uint8Array(2), 1, 1, THREE.RGFormat), origin: [-8.525, 1.975] as [number, number], extent: [9.6, 6.4] as [number, number] }
  createWaterMaterial('main', water.pieces.main.bodies.find((b) => b.node === 'water_pond')!, createSharedWaterUniforms(water), maps, 'phone')
  expect(waterReadout().tier).toBe('')
})
