import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PHONE_SHORT_SIDE, farEverywhere } from '../composition'
import { useWaterTier, waterTier } from './tier'

// Phone tier on a phone (the rule trees use to draw far everywhere), mid elsewhere, ?water=phone|mid to pick by hand.

const phone = { width: 412, height: 915 }
const desktop = { width: 2560, height: 1440 }

afterEach(() => vi.unstubAllGlobals())

describe('the water tier', () => {
  it.each([
    ['a phone', true, phone, '', 'phone'],
    ['a phone held sideways', true, { width: 915, height: 412 }, '', 'phone'],
    ['a large touchscreen laptop', true, { width: 1920, height: 1080 }, '', 'mid'],
    ['a small touch laptop (the rule wins; ?water=mid overrides)', true, { width: 1280, height: 800 }, '', 'phone'],
    ['a small touch laptop with ?water=mid', true, { width: 1280, height: 800 }, '?water=mid', 'mid'],
    ['a narrow window with a fine pointer', false, phone, '', 'mid'],
    ['the short side the trees draw far from', true, { width: 1180, height: PHONE_SHORT_SIDE }, '', 'phone'],
    ['one past it', true, { width: 1180, height: PHONE_SHORT_SIDE + 1 }, '', 'mid'],
    ['?water=mid on a phone', true, phone, '?water=mid', 'mid'],
    ['?water=phone on a desktop', false, desktop, '?water=phone', 'phone'],
    ['?water among other parameters', true, phone, '?debug=1&water=mid&x=2', 'mid'],
    ['?water without the ?', false, desktop, 'water=phone', 'phone'],
  ])('%s', (_n, coarse, screen, search, tier) => {
    expect(waterTier(coarse, screen, search)).toBe(tier)
  })

  it('follows the trees’ rule everywhere', () => {
    for (const coarse of [true, false])
      for (const width of [320, 412, 820, 821, 1024, 1920])
        for (const height of [568, 800, 820, 821, 915, 1080]) {
          const screen = { width, height }
          expect(waterTier(coarse, screen, ''), `${coarse} ${width}x${height}`).toBe(farEverywhere(coarse, screen) ? 'phone' : 'mid')
        }
  })

  it('ignores a junk value, and goes by the device', () => {
    for (const search of ['?water=legacy', '?water=', '?water', '?water=PHONE', '?water=phone,mid', '?waters=mid', '?water=1', '']) {
      expect(waterTier(true, phone, search), `phone ${search}`).toBe('phone')
      expect(waterTier(false, desktop, search), `desktop ${search}`).toBe('mid')
    }
  })
})

describe('useWaterTier', () => {
  function Probe() {
    return createElement('span', null, useWaterTier())
  }
  const render = () => renderToString(createElement(Probe)).replace(/<[^>]*>/g, '')

  it.each([
    [true, phone, '', 'phone'],
    [true, { width: 1920, height: 1080 }, '', 'mid'],
    [false, phone, '', 'mid'],
    [true, phone, '?water=mid', 'mid'],
    [false, desktop, '?water=phone', 'phone'],
  ])('reads the pointer, the screen and the address (%s %j %s)', (coarse, screen, search, tier) => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' && coarse, addEventListener() {}, removeEventListener() {} }))
    vi.stubGlobal('screen', screen)
    vi.stubGlobal('location', { search })
    expect(render()).toBe(tier)
  })

  it('is mid where there is no screen to read (a test, a server)', () => {
    expect(typeof screen).toBe('undefined')
    expect(render()).toBe('mid')
  })
})
