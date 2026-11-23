import { ECONOMY_CHANGED, V2_LEVEL_XP, V2_SEED_COST } from '../src/game/save'
import { SAVE_VERSION } from '../src/game/state'
import { establishedFarm, expect, storedSaves, test } from './fixtures'

// Saves written by other versions of Gitaway: a newer one's farm is shown but never written over, and an older one's
// is kept aside before it upgrades.

const NEWER = "This farm was saved by a newer Gitaway, so changes won't be kept here"

test("a newer Gitaway's farm is shown, and never written over", async ({ farm, page }) => {
  const future = establishedFarm({ version: 99, farmName: 'Far Future', ferries: { docked: 3 } })
  await farm.load(future)
  await expect(page.getByTestId('farm-name')).toContainText('Far Future')
  await farm.expectToast(NEWER)
  // Plant something and let time pass: it grows here, but isn't kept.
  await farm.tool('garden')
  await page.getByTestId('plant-radish').click()
  await expect(page.getByTestId('plot-0')).toHaveAccessibleName(/Radish/)
  await farm.wait('02:00')
  expect((await storedSaves(page)).farm).toEqual(future)
  await page.reload()
  await expect(page.getByTestId('farm-name')).toContainText('Far Future')
  await farm.tool('garden')
  await expect(page.getByTestId('plot-0')).not.toHaveAccessibleName(/Radish/)
})

test('a version 1 farm is kept as it was before it upgrades, until the farm is erased', async ({ farm, page }) => {
  const v1 = establishedFarm()
  await farm.load(v1)
  await expect(page.getByTestId('farm-name')).toContainText('Old Orchard')
  await expect.poll(async () => (await storedSaves(page)).farm).toMatchObject({ version: SAVE_VERSION, farmName: 'Old Orchard' })
  expect((await storedSaves(page))['farm-v1']).toEqual(v1)
  await expect(farm.toasts()).not.toContainText(NEWER)
  await page.getByTestId('open-settings').click()
  await page.getByTestId('reset-farm').click()
  await page.getByTestId('confirm-reset').click()
  await expect(page.getByTestId('welcome')).toBeVisible()
  expect(Object.keys(await storedSaves(page))).toEqual(['farm'])
})

test('a farm from before version 3 is told once that the economy changed, and paid for seeds it can no longer plant', async ({ farm, page }) => {
  // A version 2 farm at its level 7, with blueberry seeds that wait on a later level now.
  const v2 = establishedFarm({ version: 2, xp: V2_LEVEL_XP[6], levelSeen: 7, seeds: { radish: 3, blueberry: 2 } })
  await farm.load(v2)
  await farm.expectToast(ECONOMY_CHANGED.title)
  await farm.expectToast(`Seeds you can't plant yet were bought back for ${2 * V2_SEED_COST.blueberry} coins.`)
  const told = page.getByTestId('journal-entry').filter({ hasText: ECONOMY_CHANGED.title })
  await farm.tool('journal')
  await expect(told).toHaveCount(1)

  // Once the upgraded farm is saved, opening it again says nothing more.
  await expect.poll(async () => (await storedSaves(page)).farm).toMatchObject({ version: SAVE_VERSION, coins: v2.coins + 2 * V2_SEED_COST.blueberry })
  await page.reload()
  await expect(page.locator('.app[data-ready="true"]')).toBeAttached()
  await farm.wait('00:02')
  expect(await farm.toastsShown()).not.toContainEqual(expect.stringContaining(ECONOMY_CHANGED.title))
  await farm.tool('journal')
  await expect(told).toHaveCount(1)
})
