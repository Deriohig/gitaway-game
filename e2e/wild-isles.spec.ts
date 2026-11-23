import { docked, expect, expectAttrs, test, wellOff, type Farm } from './fixtures'

// The wild isles: the wetland can be claimed and cranberries grown; the highland follows, with goats and lavender.

/** Buys a packet of seeds in the shop and sows it in the first plot. */
async function sow(farm: Farm, crop: 'cranberry' | 'lavender', name: RegExp) {
  const { page } = farm
  if (!(await page.getByTestId('panel-shop').isVisible())) await farm.tool('shop')
  await page.getByTestId('tab-seeds').click()
  await page.getByTestId(`buy-seed-${crop}-1`).click()
  await farm.expectToast(`Bought ${crop} seeds`)
  await farm.tool('garden')
  await page.getByTestId('plot-0').click()
  await page.getByTestId(`plant-${crop}`).click()
  await expect(page.getByTestId('plot-0')).toHaveAccessibleName(name)
}

test('the wetland can be claimed: it rises from the clouds, docks, and cranberries grow', async ({ farm, page }) => {
  await farm.load(wellOff())
  await farm.claim('wetland', 'Wetland isle added')
  await farm.expectToast(/rises from the clouds and docks/)
  await expect(page.getByTestId('panel-farm')).toBeHidden()
  await expectAttrs(page.getByTestId('world'), { 'data-isles': 'wetland', 'data-docked': 'wetland', 'data-isle-wetland': docked('wetland'), 'data-pieces': /wetland:baked/ })
  await sow(farm, 'cranberry', /Plot 1: Cranberry/)
})

test('the highland can be claimed: it rises and docks, and a goat and lavender follow', async ({ farm, page }) => {
  // The longest walk in the suite (a wetland, then the highland with its models, then a goat and a crop): most of a minute drawn in software.
  test.slow()
  await farm.load(wellOff({ wetland: 1 }))
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-docked', 'wetland')
  await farm.tool('shop')
  await page.getByTestId('tab-animals').click()
  await expect(page.getByTestId('buy-goat')).toBeDisabled()
  await farm.claim('highland', 'Highland isle added')
  await expect(page.getByTestId('panel-farm')).toBeHidden()
  await expectAttrs(world, { 'data-isles': 'wetland highland', 'data-docked': 'wetland highland', 'data-isle-highland': docked('highland'), 'data-pieces': /highland:baked/ })

  await farm.tool('shop')
  await page.getByTestId('tab-animals').click()
  await expect(page.getByTestId('buy-goat')).toHaveText('Adopt')
  await page.getByTestId('buy-goat').click()
  await farm.expectToast('Goat added')
  await expect(page.getByTestId('item-goat')).toContainText('1/4')
  await sow(farm, 'lavender', /Plot 1: Lavender/)
})
