import { num } from '../src/ui/format'
import { docked, establishedFarm, expect, expectAttrs, landPrice, test, type Farm } from './fixtures'

// Land in any order: every piece is on offer from the start, at one price for each piece not yet owned, and every piece
// claimed raises it for the rest. Each piece brings what lives on it, with no level of its own.

/** A level 1 farm with plenty to spend and no land yet. */
const newFarm = () => establishedFarm({ xp: 0, levelSeen: 1, coins: 50_000, wood: 5_000 })

/** Expects a card in the Farm panel to ask for the price of land with `owned` pieces owned. */
async function expectPrice(farm: Farm, id: string, owned: number) {
  const { coins, wood } = landPrice(owned)
  const parts = farm.page.getByTestId(`item-${id}`).locator('.price > span')
  await expect(parts).toHaveText([num(coins), num(wood)])
}

test('land can be claimed in any order, and each piece raises the price of the rest', async ({ farm, page }) => {
  await farm.load(newFarm())
  const world = page.getByTestId('world')
  await expect(page.getByTestId('farm-level')).toHaveText('Level 1')
  await expect(world).toHaveAttribute('data-isles', '')
  // The orchard, the last piece of all while land waited on levels, is on offer at level 1, at the first price.
  await farm.tool('farm')
  await expectPrice(farm, 'orchardLand', 0)
  await page.getByTestId('buy-orchardLand').click()
  await farm.expectToast('Orchard isle added')
  await expect(page.getByTestId('panel-farm')).toBeHidden()
  await expectAttrs(world, { 'data-isles': 'orchard', 'data-docked': 'orchard', 'data-isle-orchard': docked('orchard') })
  // Every piece left now asks for LAND's growth more; a piece already claimed shows no price.
  await farm.tool('farm')
  await expectPrice(farm, 'meadow', 1)
  await expectPrice(farm, 'cottageLand', 1)
  await expect(page.getByTestId('buy-orchardLand')).toHaveText('Built')
  await expect(page.getByTestId('item-orchardLand').locator('.price')).toHaveCount(0)
})

test('the highland first brings goats and lavender at once', async ({ farm, page }) => {
  await farm.load(newFarm())
  // Goats wait on the highland, not on a level.
  await farm.tool('shop')
  await page.getByTestId('tab-animals').click()
  await expect(page.getByTestId('buy-goat')).toBeDisabled()
  await expect(page.getByTestId('buy-goat')).toHaveText('Needs highland isle')
  await farm.claim('highland', 'Highland isle added')
  await expectAttrs(page.getByTestId('world'), { 'data-docked': 'highland', 'data-isle-highland': docked('highland') })

  await farm.tool('shop')
  await page.getByTestId('tab-animals').click()
  await expect(page.getByTestId('buy-goat')).toHaveText('Adopt')
  await expect(page.getByTestId('buy-goat')).toBeEnabled()
  await page.getByTestId('tab-seeds').click()
  await expect(page.getByTestId('seed-lavender')).not.toHaveClass(/item--locked/)
  await expect(page.getByTestId('buy-seed-lavender-1')).toBeEnabled()
  // The wetland's cranberries still wait on the wetland.
  await expect(page.getByTestId('seed-cranberry')).toHaveClass(/item--locked/)
})
