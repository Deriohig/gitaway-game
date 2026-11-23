// The water's dev readout, `window.__water`: what the water reports of itself,
// for the e2e specs and a developer. Its own module, so the tier (tier.ts) can
// report into it without pulling in the material and the shader library.

/**
 * What the water reports: the device's tier (useWaterTier reports it), the bodies drawn, the patch misses (a three
 * update moved an anchor), the bodies whose shader the GPU built, as three found on their first draw
 * (build.ts watchWaterPrograms), and the bodies showing now, as the flow from the wetland's dock has them (the
 * river not yet filled, the farm fall gone: driver.ts registerWaterBodies), sorted. Each is `<piece>:<node>`.
 */
export interface WaterReadout {
  tier: string
  bodies: string[]
  misses: string[]
  compiled: string[]
  shown: string[]
}

const readout: WaterReadout = { tier: '', bodies: [], misses: [], compiled: [], shown: [] }

/**
 * The water's readout, which is also `window.__water` wherever there is a
 * window. Production builds too: it is tiny, and the e2e specs read it.
 */
export function waterReadout(): WaterReadout {
  if (typeof window !== 'undefined') (window as unknown as { __water?: WaterReadout }).__water = readout
  return readout
}
