import type { Page, Route } from '@playwright/test'
import { piecesInPlay, type DockId } from '../src/world/blueprint'
import { docked, establishedFarm, expect, expectAttrs, motion, putFarm, test } from './fixtures'
import { bakedPieces } from './ground'

// Claiming new land: a bought piece rises out of the clouds and docks against the farm. The world element reports
// `data-isles` (pieces in the world), `data-rising`, `data-docked`, `data-isle-<id>` (how each is drawn), `data-pieces`
// (loaded, baked or procedural) and `data-camera-distance` / `data-frame-distance` (where the camera is and is heading).

const farmWith = (level: 'auto' | 'full' | 'calm', owned: Record<string, number> = {}) =>
  establishedFarm({ owned: { plot: 0, chicken: 2, ...owned }, ...motion(level) })

/** Reads `data-isle-<id>`: the piece's height against its place, whether it's drawn, and where it docks. */
function isleState(value: string | null) {
  const match = /^y=(-?\d+\.\d+) (shown|hidden) at=(-?\d+\.\d+),(-?\d+\.\d+)$/.exec(value ?? '')
  expect(match, `data-isle reads "${value}"`).not.toBeNull()
  return { y: Number(match![1]), shown: match![2] === 'shown', at: [Number(match![3]), Number(match![4])] }
}

/** Whether the page is at least as wide as it is tall: the view then frames the farm alone (see framing.ts). */
const wide = (page: Page) => page.viewportSize()!.width >= page.viewportSize()!.height

/** How far back the camera frames the farm at the desktop project's 1440 × 900. */
const FARM_VIEW_WIDE = 35.5

/** Another tab saves \ and says so, as the game's tabs do, and this one loads it. */
async function savedInAnotherTab(page: Page, save: Record<string, unknown>) {
  const savedAt = Date.now() + 60_000
  await putFarm(page, { ...save, savedAt })
  await page.evaluate((savedAt) => new BroadcastChannel('gitaway').postMessage({ type: 'saved', from: 'another-tab', savedAt }), savedAt)
}

test('a farm loads the island’s pieces with none but the farm in the world, then buying an area docks the piece and closes the panel', async ({ farm, page }) => {
  expect(piecesInPlay()).toEqual(expect.arrayContaining(['wetland', 'highland']))
  await farm.load(farmWith('auto'))
  const world = page.getByTestId('world')
  const loaded = piecesInPlay().map((id) => `${id}:${bakedPieces().includes(id) ? 'baked' : 'procedural'}`)
  await expect.poll(async () => (await world.getAttribute('data-pieces'))?.split(' ').sort()).toEqual(loaded.sort())
  await expectAttrs(world, { 'data-isles': '', 'data-docked': '' })
  await farm.claim('meadow', 'Meadow isle added')
  await expect(page.getByTestId('panel-farm')).toBeHidden()
  await expectAttrs(world, { 'data-isles': 'meadow', 'data-rising': '', 'data-docked': 'meadow', 'data-isle-meadow': docked('meadow') })
  // Something that isn't land leaves the panel open.
  await farm.claim('woodshed', 'Woodshed added')
  await expect(page.getByTestId('panel-farm')).toBeVisible()
})

test.describe('when a piece is slow to load', () => {
  /** Holds back every request for a piece's files, as a stalled connection would; returns the requests held. */
  const hold = async (page: Page, id: DockId) => {
    const held: Route[] = []
    await page.route(new RegExp(`/models/piece_${id}\\.(glb|height\\.bin)$`), (route) => {
      held.push(route)
    })
    return held
  }

  for (const arrives of [false, true]) {
    test(`a piece bought while its files are on their way waits for them, then docks ${arrives ? 'baked' : 'as its stand-in after eight seconds'}`, async ({ farm, page }) => {
      const held = await hold(page, 'grove')
      // The farm is drawn without waiting for a piece it hasn't got.
      const drawn = page.waitForResponse((r) => r.url().endsWith('/models/farmhouse.glb'))
      await farm.load(farmWith('auto'))
      await drawn
      const world = page.getByTestId('world')
      await expectAttrs(world, { 'data-drawn': 'true', 'data-pieces': /main:baked/ })
      await farm.claim('grove', 'Forest grove added')
      await expectAttrs(world, { 'data-isles': 'grove', 'data-docked': '' })
      if (arrives) {
        await expect.poll(() => held.length).toBeGreaterThan(0)
        for (const route of held) await route.fallback()
      } else {
        await page.clock.fastForward(9000)
      }
      await expectAttrs(world, { 'data-pieces': arrives ? /grove:baked/ : /grove:procedural/, 'data-docked': 'grove', 'data-isle-grove': docked('grove') })
    })
  }

  test('a farm with a piece whose files stall is drawn a few seconds later, with that piece’s stand-in', async ({ farm, page }) => {
    await hold(page, 'meadow')
    await farm.load(farmWith('auto', { meadow: 1 }))
    const world = page.getByTestId('world')
    await expectAttrs(world, { 'data-isles': 'meadow', 'data-pieces': /main:baked/ })
    expect(await world.getAttribute('data-pieces')).not.toMatch(/meadow/)
    await page.clock.fastForward(9000)
    await expectAttrs(world, { 'data-drawn': 'true', 'data-pieces': /meadow:procedural/, 'data-docked': 'meadow' })
  })
})

test.describe('with motion on', () => {
  test('a new piece rises out of the clouds while the view eases out to show it, docks, the view settles back, and it stays put', async ({ farm, page }) => {
    // A rise with camera easing runs near the 60 s limit when the machine is busy (software GL, parallel sessions).
    test.slow()
    await farm.load(farmWith('full'))
    const world = page.getByTestId('world')
    await expect(world).toHaveAttribute('data-drawn', 'true')
    const farmView = Number(await world.getAttribute('data-frame-distance'))
    if (wide(page)) expect(farmView).toBe(FARM_VIEW_WIDE)
    // Hold the clock so the rise can be looked at part way, before the panel opens.
    await farm.holdClock()
    await farm.tool('farm')
    await page.getByTestId('buy-grove').click()
    await expect(page.getByTestId('panel-farm')).toBeHidden()
    await expectAttrs(world, { 'data-isles': 'grove', 'data-rising': 'grove', 'data-docked': '' })
    // It starts under the cloud sea, unseen, right below its place.
    const start = isleState(await world.getAttribute('data-isle-grove'))
    expect(start).toMatchObject({ shown: false, at: [11, -12.3] })
    expect(start.y).toBeLessThan(-9)
    // A few frames start the rise, then two seconds in it's well up from where it started, still below its place.
    await page.clock.runFor(100)
    await page.clock.fastForward(1900)
    await page.clock.runFor(100)
    await expect(world).toHaveAttribute('data-rising', 'grove')
    const partway = isleState(await world.getAttribute('data-isle-grove'))
    expect(partway.y).toBeGreaterThan(start.y + 1)
    expect(partway.y).toBeLessThan(-0.5)
    expect(partway.shown).toBe(true)
    // About six seconds in all, it has docked, and the view settles back on the farm (held upright, on the farm and the grove's middle).
    await page.clock.fastForward(4000)
    await page.clock.runFor(100)
    await expectAttrs(world, { 'data-rising': '', 'data-docked': 'grove', 'data-isle-grove': docked('grove') })
    await page.clock.fastForward(2000)
    await page.clock.runFor(100)
    const settled = (await world.getAttribute('data-frame-distance'))!
    if (wide(page)) expect(Number(settled)).toBe(farmView)
    await expect(world).toHaveAttribute('data-camera-distance', settled)
    // Coming back to it later, it's simply there.
    await page.clock.resume()
    await page.reload()
    await expect(page.locator('.app[data-ready="true"]')).toBeAttached()
    await expectAttrs(world, { 'data-isles': 'grove', 'data-rising': '', 'data-isle-grove': docked('grove') })
  })

  test('a piece bought again after the farm is erased rises in again', async ({ farm, page }) => {
    await farm.load(farmWith('full', { meadow: 1 }))
    const world = page.getByTestId('world')
    await expect(world).toHaveAttribute('data-isles', 'meadow')
    // Only once the farm is drawn: the canvas takes its size on a timer, so a clock held earlier would stop it being drawn.
    await expect(world).toHaveAttribute('data-drawn', 'true')
    await farm.holdClock()
    await page.getByTestId('open-settings').click()
    await page.getByTestId('reset-farm').click()
    await page.getByTestId('confirm-reset').click()
    await expect(page.getByTestId('welcome')).toBeVisible()
    await expect(world).toHaveAttribute('data-isles', '')
    // The new farm grows until it can afford the meadow (here, another tab saves one that can).
    await savedInAnotherTab(page, farmWith('full'))
    await expect(page.getByTestId('welcome')).toBeHidden()
    await expect(world).toHaveAttribute('data-isles', '')
    await farm.claim('meadow', 'Meadow isle added')
    await expectAttrs(world, { 'data-isles': 'meadow', 'data-rising': 'meadow' })
  })
})
