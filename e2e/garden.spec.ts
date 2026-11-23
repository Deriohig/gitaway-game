import { CROPS, PLOTS, START } from '../src/game/config'
import { cropXp, harvestValue } from '../src/game/engine'
import { FEATURES } from '../src/game/features'
import { createInitialState } from '../src/game/state'
import { expect, test } from './fixtures'

/** A crop's growing time as the clock's "mm:ss". */
const growing = (crop: keyof typeof CROPS, extraMinutes = 0) => `${String(CROPS[crop].growMinutes + extraMinutes).padStart(2, '0')}:00`

test('plant, wait, and harvest a crop', async ({ farm, page }) => {
  // A new farm sows its starting radishes, one to a plot.
  const radishes = Math.min(START.seeds.radish!, PLOTS.starting)
  await farm.start()
  await farm.tool('garden')
  await page.getByTestId('plant-radish').click()
  await farm.expectToast(`Planted ${radishes} radishes`)
  await expect(page.getByTestId('plot-0')).toHaveAccessibleName(/Radish/)

  const before = await farm.coinCount()
  await farm.wait(growing('radish'))
  await farm.expectToast('Your radishes are ready')
  await expect(page.getByTestId('plot-0')).toHaveAccessibleName(/ready to harvest/)
  await page.getByTestId('harvest-all').click()
  await farm.expectToast(`Harvested ${radishes} crops`)
  // Every radish from fresh soil, so each pays the fresh-soil price.
  const fresh = harvestValue(createInitialState(0), 'radish', true)
  expect(fresh).toBeGreaterThan(CROPS.radish.coins)
  await expect.poll(() => farm.coinCount()).toBe(before + radishes * fresh)
  await expect(page.getByTestId('plot-0')).toHaveAccessibleName(/empty/)
  // These few radishes make no whole point of XP, so the toast says nothing about XP.
  expect(radishes * cropXp('radish')).toBeLessThan(1)
  const harvested = (await farm.toastsShown()).filter((t) => t.includes(`Harvested ${radishes} crops`))
  expect(harvested).toEqual([expect.stringContaining(`+${radishes * fresh} coins`)])
  expect(harvested[0]).not.toContain('XP')
})

test('a single plot can be chosen and sown, and an empty plot shows its fresh-soil hint', async ({ farm, page }) => {
  await farm.start()
  await farm.tool('garden')
  await page.getByTestId('plot-1').click()
  await page.getByTestId('plant-carrot').click()
  await expect(page.getByTestId('plot-1')).toHaveAccessibleName(/Carrot/)
  await expect(page.getByTestId('plot-0')).toHaveAccessibleName(/empty/)

  await page.getByTestId('plot-0').click()
  await expect(page.getByText('Fresh soil: +25% for any crop')).toBeVisible()
  await expect(page.getByTestId('plant-radish')).toContainText('+25%')
  await page.getByTestId('plant-radish').click()
  await farm.wait(growing('radish'))
  await page.getByTestId('harvest-selected').click()
  await farm.expectToast('Harvested radish')
  // Plot 0 is still chosen, and empty again: radishes would pay their normal price, carrots the bonus.
  await expect(page.getByText('Fresh soil: +25% for anything but radishes')).toBeVisible()
  await expect(page.getByTestId('plant-radish')).not.toContainText('+25%')
  await expect(page.getByTestId('plant-carrot')).toContainText('+25%')
})

test('crops keep growing while the game is closed', async ({ farm, page }) => {
  await farm.start()
  await farm.tool('garden')
  await page.getByTestId('plant-carrot').click()
  await page.reload()
  await farm.wait(growing('carrot', 1))
  // A quarter of an hour at once looks like the computer slept: with the journal on, the recap tells it instead of a toast.
  if (FEATURES.journal) await expect(page.getByTestId('recap')).toContainText('Your carrots are ready')
  else await farm.expectToast('Your carrots are ready')
})

test('buy seeds in the shop and find them in the inventory', async ({ farm, page }) => {
  await farm.start()
  await farm.tool('shop')
  const s = createInitialState(0)
  await expect(page.getByTestId('seed-carrot')).toContainText(`sells for ${harvestValue(s, 'carrot')}, or ${harvestValue(s, 'carrot', true)} in fresh soil`)
  await page.getByTestId('buy-seed-carrot-1').click()
  await farm.expectToast('Bought carrot seeds')
  await expect(page.getByTestId('seed-carrot')).toContainText(`×${START.seeds.carrot! + 1}`)
  expect(await farm.coinCount()).toBe(START.coins - CROPS.carrot.seedCost)
  await farm.tool('inventory')
  await expect(page.getByTestId('panel-inventory')).toContainText('Seed shed')
})
