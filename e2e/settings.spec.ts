import { expect, test } from './fixtures'

test('settings explain privacy and never fake an integration, and the build makes no requests to other hosts', async ({ farm, page }) => {
  const external: string[] = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol.startsWith('http')) external.push(req.url())
  })
  await farm.start()
  await farm.tool('shop')
  await farm.tool('garden')
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('panel-settings')).toContainText('Gitaway makes no network requests')
  await expect(page.getByTestId('source-manual')).toContainText('On')
  await expect(page.getByTestId('source-local-git')).toContainText('Desktop app only')
  await expect(page.getByTestId('source-local-git')).toContainText('Commit counts and times only: never code, diffs, messages, file names or credentials.')
  await expect(page.getByTestId('source-github')).toContainText('Not available yet')
  await expect(page.getByTestId('ambient-sound')).not.toBeChecked()
  expect(external).toEqual([])
})

test('appearance settings and farm-only mode are remembered, and progress can be reset', async ({ farm, page }) => {
  test.slow()
  await farm.start()
  await expect(page.getByTestId('start-session')).toBeVisible()
  await page.getByTestId('open-settings').click()
  await page.getByTestId('motion-calm').click()
  await page.getByTestId('time-of-day').selectOption('evening')
  await page.getByTestId('farm-only').check()
  await expect(page.getByTestId('start-session')).toHaveCount(0)
  // Only the clock jumps: on Calm the island is drawn fifteen times a second, and a farm.wait would draw each frame in software.
  await page.clock.fastForward('00:01')

  await page.reload()
  await expect(page.getByTestId('start-session')).toHaveCount(0)
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('motion-calm')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('time-of-day')).toHaveValue('evening')
  await expect(page.getByTestId('farm-only')).toBeChecked()
  await page.getByTestId('farm-only').uncheck()
  await expect(page.getByTestId('start-session')).toBeVisible()

  // Progress can be reset after confirming.
  await page.getByTestId('reset-farm').click()
  await expect(page.getByTestId('reset-dialog')).toBeVisible()
  await page.getByTestId('confirm-reset').click()
  await expect(page.getByTestId('welcome')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('welcome')).toBeVisible()
})
