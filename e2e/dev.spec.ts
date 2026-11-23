import { expect, test } from './fixtures'

// The Dev tools exist only in development builds; the suite runs against the production build, which must not have them.
test('the production build has no Dev tools, and nothing turns them on', async ({ farm, page }) => {
  const scripts: Promise<string>[] = []
  page.on('response', (r) => {
    // A revalidated script (304) has no body; its first load is enough.
    if (r.request().resourceType() === 'script' && r.status() === 200) scripts.push(r.text())
  })

  await farm.start()
  await expect(page.getByTestId('dev-open')).toHaveCount(0)
  await expect(page.getByTestId('dev-panel')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /dev tools/i })).toHaveCount(0)

  for (const url of ['/?dev', '/?dev=1', '/#dev']) {
    await page.goto(url)
    await expect(page.locator('.app[data-ready="true"]')).toBeAttached()
    // Wait for the full load before the next goto, or the scripts' bodies are gone when read.
    await expect(page.getByTestId('farm-name')).toBeVisible()
    await expect(page.getByTestId('dev-open'), url).toHaveCount(0)
  }

  const shipped = await Promise.all(scripts)
  expect(shipped.length).toBeGreaterThan(0)
  for (const text of shipped) for (const code of ['DevPanel', 'dev-open', 'gitaway:dev-clock']) expect(text).not.toContain(code)
})
