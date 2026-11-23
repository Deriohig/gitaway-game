import { ITEMS, PRICING } from '../src/game/config'
import { FEATURES } from '../src/game/features'
import { xpForLevel } from '../src/game/progression'
import { panelShown, storesTabs, storesTitle, toolbarTools } from '../src/ui/surfaces'
import { establishedFarm, expect, test } from './fixtures'

test('decorations, animals, buildings and a new isle can be bought, and sheep need the meadow', async ({ farm, page }) => {
  const level = Math.max(ITEMS.windmill.unlockLevel, 7)
  await farm.load(establishedFarm({ xp: xpForLevel(level), levelSeen: level, coins: ITEMS.windmill.coins + 1000 }))
  await farm.tool('shop')
  await page.getByTestId('tab-decor').click()
  await page.getByTestId('buy-flowerbed').click()
  await farm.expectToast('Flower bed added')
  await expect(page.getByTestId('item-flowerbed')).toContainText(`1/${ITEMS.flowerbed.max}`)
  // The next one costs a little more.
  await expect(page.getByTestId('item-flowerbed')).toContainText(String(Math.round(ITEMS.flowerbed.coins * PRICING.repeatGrowth)))
  await page.getByTestId('tab-animals').click()
  await page.getByTestId('buy-duck').click()
  await farm.expectToast('Duck added')

  await farm.tool('farm')
  await page.getByTestId('buy-windmill').click()
  await farm.expectToast('Windmill added')
  await expect(page.getByTestId('buy-windmill')).toHaveText('Built')
  await page.getByTestId('buy-meadow').click()
  await farm.expectToast('Meadow isle added')
  await farm.tool('shop')
  await page.getByTestId('tab-animals').click()
  await page.getByTestId('buy-sheep').click()
  await farm.expectToast('Sheep added')
})

test('a new farm can build a woodshed, and locked things say what they need', async ({ farm, page }) => {
  await farm.start()
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-woodshed', 'false')
  await farm.tool('farm')
  await expect(page.getByTestId('buy-windmill')).toBeDisabled()
  await expect(page.getByTestId('buy-windmill')).toHaveText(`Level ${ITEMS.windmill.unlockLevel}`)
  await page.getByTestId('buy-woodshed').click()
  await farm.expectToast('Woodshed added')
  await expect(world).toHaveAttribute('data-woodshed', 'true')

  if (FEATURES.workshop) {
    await farm.tool('shop')
    await page.getByTestId('tab-decor').click()
    await expect(page.getByTestId('item-birdhouse')).toHaveCount(0)
    await expect(page.getByTestId('panel-shop')).toContainText('made at the workbench')
  }
  if (panelShown('island')) {
    await farm.tool('island')
    await expect(page.getByTestId('island-locked')).toContainText('Opens at level 6')
  }
})

test('only the tools of switched-on features show, even on a farm that could afford it all', async ({ farm, page }) => {
  await farm.load(establishedFarm({ xp: 20_000, levelSeen: 20, coins: 100_000, wood: 10_000 }))
  const tools = toolbarTools()
  const toolbar = page.getByRole('navigation', { name: 'Farm tools' }).getByRole('button')
  await expect(toolbar).toHaveCount(tools.length)
  for (const [i, t] of tools.entries()) {
    await expect(toolbar.nth(i)).toHaveAttribute('data-testid', `tool-${t.id}`)
    await expect(toolbar.nth(i)).toHaveAccessibleName(t.label)
  }
  await page.keyboard.press(tools.at(-1)!.key)
  await expect(page.getByTestId('panel-progress')).toBeVisible()
  // With only its Things tab, the Stores tool is the Inventory it always was.
  await farm.tool('inventory')
  await expect(page.getByTestId('panel-inventory').getByRole('heading', { level: 2 })).toHaveText(storesTitle())
  await expect(page.getByTestId('panel-inventory').getByRole('tab')).toHaveCount(storesTabs().length > 1 ? storesTabs().length : 0)
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('panel-settings')).toContainText(`Shortcuts: 1–${tools.length} open the tools`)
})

test('progress shows the level, today and milestones', async ({ farm, page }) => {
  await farm.load(establishedFarm())
  await farm.tool('progress')
  for (const text of ['Orchard Keeper', 'Retirement plan', 'Clock in for the first time']) await expect(page.getByTestId('panel-progress')).toContainText(text)
})
