import { useEffect } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { farEverywhere } from '../composition'
import { waterReadout } from './readout'

// Which of the water's two quality tiers a device draws (spec §5): phone, one
// noise layer and no caustics or glints, or mid, the lot. A phone is where the
// trees are drawn far everywhere; the water asks the same question.

export type WaterTierName = 'phone' | 'mid'

/**
 * The tier for a device: `?water=phone` or `?water=mid` in the address wins
 * (for trying the other one by hand); otherwise phone where the trees draw far
 * everywhere (`farEverywhere`: a coarse pointer on a screen no longer than
 * PHONE_SHORT_SIDE on its short side), and mid everywhere else, a
 * touchscreen laptop included. Any other `water` value is ignored.
 */
export function waterTier(coarse: boolean, screen: { width: number; height: number }, search: string): WaterTierName {
  const asked = new URLSearchParams(search).get('water')
  if (asked === 'phone' || asked === 'mid') return asked
  return farEverywhere(coarse, screen) ? 'phone' : 'mid'
}

/** The page's own screen, or one too big to be a phone where there is none (a test, a server). */
const noScreen = { width: Infinity, height: Infinity }

/**
 * This device's water tier. The pointer is watched (a mouse plugged in or taken
 * out changes it); the screen is the device's and the address is read as it
 * stands. Reports the tier in the water's readout (`window.__water`).
 */
export function useWaterTier(): WaterTierName {
  const coarse = useMediaQuery('(pointer: coarse)')
  const tier = waterTier(coarse, typeof screen !== 'undefined' ? screen : noScreen, typeof location !== 'undefined' ? location.search : '')
  useEffect(() => {
    waterReadout().tier = tier
  }, [tier])
  return tier
}
