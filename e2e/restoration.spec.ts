import { BUNDLES } from '../src/game/content/bundles'
import { FEATURES } from '../src/game/features'
import { xpForLevel } from '../src/game/progression'
import { islandTabs } from '../src/ui/surfaces'
import { establishedFarm, expect, test, type Farm } from './fixtures'

// Island restorations (B3) are behind a feature switch.
test.skip(!FEATURES.restorations, 'restorations (B3) are switched off')

/** A level-6 farm, where the notice board goes up. */
const levelSix = (overrides: Record<string, unknown> = {}) => establishedFarm({ xp: xpForLevel(6), levelSeen: 6, ...overrides })

/** Opens Island → Restorations (while the board is all the Island tool has, it opens straight on it). */
async function openBoard(farm: Farm) {
  await farm.tool('island')
  if (islandTabs().length > 1) await farm.page.getByTestId('tab-restorations').click()
  const board = farm.page.getByTestId('restorations')
  await expect(board).toBeVisible()
  return board
}

test('wood brought to a bundle stays brought, and is still there after a reload', async ({ farm, page }) => {
  await farm.load(levelSix({ wood: 5 }))
  let board = await openBoard(farm)
  await expect(board.getByTestId('need-pondJetty-0-have')).toHaveText('0 of 8 brought · you have 5')
  await board.getByTestId('bring-pondJetty-0').click()
  await farm.expectToast('Brought 5 wood')
  await expect(board.getByTestId('need-pondJetty-0-have')).toHaveText('5 of 8 brought · you have 0')
  await expect(board.getByTestId('bring-pondJetty-0')).toBeDisabled()
  await expect(farm.wood().locator('strong')).toHaveText('0')
  await expect.poll(async () => (await farm.saved()).restoration.progress.pondJetty).toEqual([5, 0])

  await page.reload()
  await expect(page.locator('.app[data-ready="true"]')).toBeAttached()
  board = await openBoard(farm)
  await expect(board.getByTestId('need-pondJetty-0-have')).toHaveText('5 of 8 brought · you have 0')
  await expect(board.getByTestId('bundle-pondJetty')).toHaveAttribute('data-done', 'false')
})

test('bringing the last of what a bundle needs restores it, and its card says so', async ({ farm }) => {
  // Goods come from the workshop (B2), switched off: these are in the barn from the save.
  await farm.load(levelSix({ barn: { produce: {}, goods: { flour: 2, jam: 2, eggs: 6 } } }))
  const board = await openBoard(farm)
  const card = board.getByTestId('bundle-kitchenShelf')
  await expect(card).toHaveAttribute('data-done', 'false')
  for (const i of [0, 1, 2]) await card.getByTestId(`bring-kitchenShelf-${i}`).click()
  await farm.expectToast('Kitchen Shelf restored')
  await expect(card).toHaveAttribute('data-done', 'true')
  await expect(card.getByTestId('bundle-kitchenShelf-done')).toHaveText('Restored')
  await expect(card).toContainText(BUNDLES.kitchenShelf.change)
  await expect(card.getByRole('button', { name: /^Bring/ })).toHaveCount(0)
  await expect.poll(async () => (await farm.saved()).xp).toBe(xpForLevel(6) + BUNDLES.kitchenShelf.xp)
})
