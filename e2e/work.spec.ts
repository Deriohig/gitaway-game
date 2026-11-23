import { SESSION, START, TASKS } from '../src/game/config'
import { levelForXp } from '../src/game/progression'
import { expect, test } from './fixtures'

test('a work session earns coins, wood and a level', async ({ farm, page }) => {
  await farm.start()
  const before = await farm.coinCount()
  await expect(page.getByText('Not working. Enjoy the view.')).toBeVisible()
  await page.getByTestId('start-session').click()
  await farm.wait('15:00')
  // An open session survives closing and reopening the game.
  await page.reload()
  await farm.expandSession()
  await farm.wait('30:00')
  await expect(page.getByTestId('session-timer')).toContainText('00:45')
  await expect(page.getByTestId('session-estimate')).toContainText(`+${45 * SESSION.coinsPerMinute}`)
  await farm.expectToast('25 minutes of focus')

  await page.getByTestId('end-session').click()
  await farm.expectToast('Session complete')
  // Its XP takes a new farm up a level.
  const level = levelForXp(45 * SESSION.xpPerMinute)
  expect(level).toBeGreaterThan(1)
  await farm.expectToast(`Farm level ${level}`)
  await expect(page.getByTestId('farm-level')).toHaveText(`Level ${level}`)
  // The session's coins, plus the level-up gift.
  expect(await farm.coinCount()).toBeGreaterThanOrEqual(before + 45 * SESSION.coinsPerMinute)
  await expect(farm.wood().locator('strong')).toHaveText(String(START.wood + Math.floor(45 / SESSION.minutesPerWood)))
  await expect(page.getByTestId('start-session')).toBeVisible()
})

test('logging a finished task pays coins and wood once per task per day', async ({ farm, page }) => {
  await farm.start()
  const before = await farm.coinCount()
  await expect(farm.wood().locator('strong')).toHaveText(String(START.wood))
  await farm.logTask('Fix flaky login test')
  await farm.expectToast('Task logged')
  await farm.expectToast(`+${TASKS.wood} wood`)
  await expect.poll(() => farm.coinCount()).toBe(before + TASKS.coins)
  await expect(farm.wood().locator('strong')).toHaveText(String(START.wood + TASKS.wood))
  await expect(page.getByRole('list', { name: 'Recent rewards' }).getByTestId('recent-wood')).toContainText(`+${TASKS.wood}`)

  // The same task again pays nothing, wood included.
  await farm.logTask('fix flaky LOGIN test')
  await farm.expectToast('Already logged today')
  expect(await farm.coinCount()).toBe(before + TASKS.coins)
  await expect(farm.wood().locator('strong')).toHaveText(String(START.wood + TASKS.wood))
})
