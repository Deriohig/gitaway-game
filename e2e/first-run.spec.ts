import { START, TASKS } from '../src/game/config'
import { expect, test } from './fixtures'

test('a new player names their farm, takes the tour, sees their island and can rename it', async ({ farm, page }) => {
  await page.goto('/')
  await expect(page.getByText('You remember a long day, a bright screen, and then nothing.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Gitaway' })).toBeVisible()
  await expect(page.getByText('Commit code. Escape to the countryside.')).toBeVisible()
  await expect(page.getByText(/No account needed/)).toBeVisible()

  await page.getByTestId('welcome-name').fill('Merge Meadow')
  await page.getByTestId('welcome-begin').click()
  const tour = page.getByTestId('tutorial')
  await expect(tour).toContainText('An island to look after')
  for (const title of ['Clock in when you start working', 'Grow something', 'Make it home']) {
    await page.getByTestId('tutorial-next').click()
    await expect(tour).toContainText(title)
    if (title === 'Clock in when you start working') await expect(tour).toContainText(`Log it for ${TASKS.coins} coins and ${TASKS.wood} wood`)
    if (title === 'Make it home') {
      await expect(tour).toContainText('woodshed')
      await expect(tour).toContainText('waits for you to collect')
      await expect(tour).not.toContainText('windmill')
    }
  }
  await page.getByTestId('tutorial-next').click()
  await expect(tour).toBeHidden()
  await expect(page.getByTestId('farm-name')).toContainText('Merge Meadow')
  await expect(page.getByTestId('farm-level')).toHaveText('Level 1')
  expect(await farm.coinCount()).toBe(START.coins)
  await expect(page.getByTestId('world')).toBeVisible()

  await page.getByTestId('farm-name').click()
  const input = page.getByLabel('Farm name')
  await input.fill('Rebase Ranch')
  await input.press('Enter')
  await expect(page.getByTestId('farm-name')).toContainText('Rebase Ranch')
})
