import { FEATURES } from '../src/game/features'
import { expect, test } from './fixtures'

test.skip(!FEATURES.attention, 'the attention dial (A6) is switched off')

test('quiet mode keeps the toasts away while the journal still records everything', async ({ farm, page }) => {
  await farm.start()
  const world = page.getByTestId('world')
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('quiet-mode')).not.toBeChecked()
  await expect(page.getByTestId('battery-saver')).toBeChecked()
  await expect(page.getByTestId('window-layout-corner')).toHaveCount(0)

  await page.getByTestId('motion-full').click()
  await expect(world).toHaveAttribute('data-fps', '30')
  await page.getByTestId('quiet-mode').check()
  await expect(world).toHaveAttribute('data-motion', 'calm')
  await expect(world).toHaveAttribute('data-fps', '10')
  // It never livens a calmer choice: Still stays still.
  await page.getByTestId('motion-still').click()
  await expect(world).toHaveAttribute('data-fps', '0')
  await expect(page.getByTestId('quiet-mode')).toBeChecked()
  await farm.closePanel()

  await farm.logTask('Water the tomatoes')
  await expect(page.getByTestId('task-input')).toHaveValue('')
  await farm.tool('journal')
  await expect(page.getByTestId('journal-entry').filter({ hasText: 'Water the tomatoes' })).toHaveCount(1)
  expect(await farm.toastsShown()).toEqual([])

  await farm.wait('00:01')
  await page.reload()
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('quiet-mode')).toBeChecked()
  await expect(page.getByTestId('motion-still')).toHaveAttribute('aria-checked', 'true')
})

test('a small window folds the HUD into one bar, and a session starts and stops from it', async ({ farm, page }) => {
  await farm.start()
  await page.setViewportSize({ width: 500, height: 400 })
  const bar = page.getByTestId('compact-hud')
  await expect(bar).toBeVisible()
  for (const gone of ['farm-name', 'task-input', 'tool-shop']) await expect(page.getByTestId(gone)).toHaveCount(0)
  await expect(bar.getByTestId('session-timer')).toHaveText('00:00:00')

  await bar.getByTestId('start-session').click()
  await farm.wait('02:00')
  await expect(bar.getByTestId('session-timer')).toContainText('00:02:')
  const coins = await farm.coinCount()
  await bar.getByTestId('end-session').click()
  await expect(bar.getByTestId('session-timer')).toHaveText('00:00:00')
  await farm.expectToast('Session complete')
  await expect.poll(() => farm.coinCount()).toBeGreaterThan(coins)

  await bar.getByTestId('tool-garden').click()
  await expect(page.getByTestId('panel-garden')).toBeVisible()
  await bar.getByTestId('tool-journal').click()
  await expect(page.getByTestId('journal-entry').first()).toBeVisible()
  // The number keys still open the tools, and Esc closes them.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('panel-journal')).toBeHidden()
  await page.keyboard.press('2')
  await expect(page.getByTestId('panel-garden')).toBeVisible()
  await page.keyboard.press('Escape')

  await bar.getByTestId('open-settings').click()
  await expect(page.getByTestId('panel-settings')).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(bar).toBeHidden()
  await expect(page.getByTestId('tool-shop')).toBeVisible()
  await expect(page.getByTestId('farm-name')).toBeVisible()
})

test('in a small window a warning still shows over an open panel', async ({ farm, page }) => {
  await farm.start()
  for (let i = 0; i < 2; i++) await farm.logTask('Water the tomatoes')
  await farm.expectToast('Already logged today')
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 500)
  await page.setViewportSize({ width: 500, height: 400 })
  await page.getByTestId('compact-hud').getByTestId('tool-garden').click()
  await expect(page.getByTestId('panel-garden')).toBeVisible()
  const warning = page.locator('.toast--warn')
  await expect(warning).toContainText('Already logged today')
  const onTop = await warning.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
  })
  expect(onTop).toBe(true)
})
