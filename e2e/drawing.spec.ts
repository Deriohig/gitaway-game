import { countFrames, establishedFarm, expect, test } from './fixtures'

// The world is drawn on demand. In Still mode (which "auto" follows under the suite's reduced motion) nothing in it
// moves, so it is drawn again only when something changes, and once a minute for the light.

test('in still mode an idle farm isn’t drawn again as the seconds pass, nor when a panel opens and closes', async ({ farm, page }) => {
  const frames = await countFrames(page)
  await farm.load(establishedFarm())
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-drawn', 'true')
  // Over 20 seconds on a two-core CI runner drawing in software.
  await expect(world).toHaveAttribute('data-models', 'loaded', { timeout: 30_000 })
  await expect
    .poll(
      async () => {
        const before = await frames()
        await page.waitForTimeout(2000)
        return (await frames()) - before
      },
      { message: 'frames drawn in two seconds', timeout: 30_000 },
    )
    .toBe(0)
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 5000)

  const before = await frames()
  await farm.tool('shop')
  await page.clock.runFor(200)
  await farm.closePanel()
  await expect(page.getByTestId('panel-shop')).toBeHidden()
  await page.clock.runFor(200)
  expect(await frames()).toBe(before)

  // Twenty seconds with nothing to do: only the light's once-a-minute redraw may fall in that time.
  await page.clock.runFor(20_000)
  expect((await frames()) - before).toBeLessThanOrEqual(1)
})

test('nothing is drawn while the page is hidden, and coming back draws at once', async ({ farm, page }) => {
  // Lively motion draws a steady stream of frames, so a pause in it is plain to see.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const frames = await countFrames(page)
  await farm.load(establishedFarm())
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-drawn', 'true')
  await expect(world).toHaveAttribute('data-models', 'loaded', { timeout: 30_000 })
  const drawnIn = async (ms: number) => {
    const before = await frames()
    await page.waitForTimeout(ms)
    return (await frames()) - before
  }
  expect(await drawnIn(2000)).toBeGreaterThan(0)

  await farm.setHidden(true)
  await page.waitForTimeout(500) // a frame already asked for may still land
  expect(await drawnIn(2000)).toBe(0)

  const back = await frames()
  await farm.setHidden(false)
  await expect.poll(frames, { message: 'a frame drawn on coming back', timeout: 5000 }).toBeGreaterThan(back)
  expect(await drawnIn(2000)).toBeGreaterThan(0)
})
