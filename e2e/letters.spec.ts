import type { Page } from '@playwright/test'
import { FEATURES } from '../src/game/features'
import { journalTabs } from '../src/ui/surfaces'
import { START, establishedFarm, expect, test, type Farm } from './fixtures'

// Barnaby's field notes come as letters in the morning post (08:00 local) once he has settled, and are read in
// Journal → Letters. No toast, and never a count.
test.skip(!FEATURES.letters || !FEATURES.characters, 'letters or the characters are switched off')

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A level-7 farm where Barnaby settled at 08:00 this morning; the first letter is posted tomorrow at 08:00. */
const settled = () =>
  establishedFarm({
    farmName: 'Willow Hollow',
    owned: { plot: 0, chicken: 2, islet: 1, meadow: 1 },
    characters: { barnaby: { stage: 'camp', foundAt: START.getTime() - 3 * DAY - HOUR } },
  })

/** After a long jump, waits for the game's catch-up to land (it marks the farm seen at `at` or later), then puts away any recap card. */
async function caughtUp(farm: Farm, page: Page, at: number) {
  await expect.poll(async () => (await farm.stored())?.seenAt ?? 0).toBeGreaterThanOrEqual(at)
  const recap = page.getByTestId('recap')
  if (await recap.isVisible()) {
    await recap.getByTestId('recap-dismiss').click()
    await expect(recap).toBeHidden()
  }
}

test('a field note arrives in the morning post, is read, and stays read after a reload', async ({ farm, page }) => {
  test.slow()
  await farm.load(settled())
  // Before the first letter there is no Letters tab, though the other tabs are drawn.
  await farm.tool('journal')
  await expect(page.getByTestId('panel-journal').getByTestId('tab-letters')).toHaveCount(0)
  await expect(page.getByTestId('panel-journal').getByRole('tab')).toHaveCount(journalTabs().length > 1 ? journalTabs().length : 0)
  await farm.closePanel()

  // Five to eight tomorrow morning, with the game open all night; then a step too short to count as time away.
  await farm.wait('22:55:00')
  await caughtUp(farm, page, START.getTime() + 22 * HOUR + 55 * MINUTE)
  await farm.wait('09:00')
  await expect(page.getByTestId('recap')).toBeHidden()

  await farm.tool('journal')
  const panel = page.getByTestId('panel-journal')
  await expect(panel.getByTestId('journal-entry').filter({ hasText: 'A letter from Barnaby.' })).toHaveCount(1)
  // It came quietly: a journal line and a seal, never a toast.
  expect(await farm.toastsShown()).not.toContainEqual(expect.stringMatching(/letter/i))
  const tab = page.getByTestId('tab-letters')
  await expect(tab).toHaveAttribute('data-sealed', 'true')
  await expect(tab).toHaveText('Letters') // never a count
  await expect(tab).toHaveAccessibleName('Letters, unread')
  await tab.click()

  const rows = page.getByTestId('letter')
  await expect(rows).toHaveCount(1)
  await expect(rows).toHaveAttribute('data-read', 'false')
  await expect(rows).toHaveAccessibleName(/^Unread: /)
  await expect(rows).toContainText('Barnaby')
  await expect(rows).toContainText('Field note:')
  await expect(rows.locator('.letter-row__when')).toHaveText('Today')
  // The only figures are in the dates.
  const beside = (el: Element) => {
    const copy = el.cloneNode(true) as Element
    copy.querySelectorAll('.letter-row__when').forEach((when) => when.remove())
    return copy.textContent ?? ''
  }
  expect(await rows.evaluate(beside)).not.toMatch(/\d/)
  await rows.click()

  // Laid out as drafted: each part on its own, no Markdown.
  const view = page.getByTestId('letter-view')
  await expect(view.locator('p', { hasText: 'Dear Willow Hollow,' })).toHaveText('Dear Willow Hollow,')
  const title = view.getByTestId('letter-title')
  await expect(title).toHaveText(/^Field note: /)
  await expect(title).toBeFocused()
  await expect(view.locator('p').last()).toHaveText('Barnaby')
  await expect(view).not.toContainText('**')

  // Back to the list: read now, and the seal has gone from the tab.
  await view.getByTestId('letter-back').click()
  await expect(view).toBeHidden()
  await expect(rows).toHaveAttribute('data-read', 'true')
  await expect(rows).toBeFocused()
  await expect(rows).not.toHaveAccessibleName(/Unread/)
  await expect(tab).not.toHaveAttribute('data-sealed')
  await expect(tab).toHaveAccessibleName('Letters')

  // Kept with the farm: read it stays.
  await expect.poll(async () => (await farm.saved()).mail?.letters?.[0]?.read).toBe(true)
  await page.reload()
  await expect(page.locator('.app[data-ready="true"]')).toBeAttached()
  await farm.tool('journal')
  await page.getByTestId('tab-letters').click()
  await expect(rows).toHaveAttribute('data-read', 'true')
  await expect(page.getByTestId('tab-letters')).not.toHaveAttribute('data-sealed')
})

