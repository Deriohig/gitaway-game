import type { Locator, Page } from '@playwright/test'
import { YIELDS, yieldAmount } from '../src/game/content/yields'
import { FEATURES } from '../src/game/features'
import { establishedFarm, expect, test, type Farm } from './fixtures'

// Idle yields: the hens lay and the woodshed stacks logs while no one is looking. Collect all brings them in, from the
// bottom-left card or the garden panel, and a marker floats over each thing with something waiting.

const HOURS = 13
/** What that many hours bring, in whole units: two hens' eggs and one woodshed's logs. */
const EGGS = Math.floor((HOURS * 2) / YIELDS.eggs.hours)
const LOGS = Math.floor(HOURS / YIELDS.wood.hours)
const COLLECTED = `+${EGGS * YIELDS.eggs.value} coins, +${LOGS * YIELDS.wood.value} wood`

const shown = async (chip: Locator) => Number((await chip.locator('strong').innerText()).replace(/[^0-9]/g, ''))

/** Where a marker's label is against the open garden panel: `clear` of it, `under` it, or drawn `over` it. */
async function againstPanel(page: Page, testId: string): Promise<'clear' | 'under' | 'over'> {
  const box = await page.getByTestId('panel-garden').boundingBox()
  return page.getByTestId(testId).evaluate((label, panel) => {
    const r = label.getBoundingClientRect()
    const [x, y] = [r.x + r.width / 2, r.y + r.height / 2]
    if (!panel || x < panel.x || x > panel.x + panel.width || y < panel.y || y > panel.y + panel.height) return 'clear'
    // A label lets clicks through to the world; for a moment it doesn't, so whatever is on top there can be found.
    label.style.pointerEvents = 'auto'
    const top = document.elementFromPoint(x, y)
    label.style.pointerEvents = ''
    return label.contains(top) ? 'over' : 'under'
  }, box)
}

/** Opens a farm with two hens and a woodshed and lets 13 hours pass; puts away the recap that tells what's waiting (on a phone it covers the garden panel). */
async function thirteenHoursLater(farm: Farm) {
  await farm.load(establishedFarm({ owned: { plot: 0, chicken: 2, woodshed: 1 } }))
  await farm.wait(`${HOURS}:00:00`)
  if (!FEATURES.journal) return
  const recap = farm.page.getByTestId('recap')
  await expect(recap).toContainText('Waiting to be collected')
  await recap.getByTestId('recap-dismiss').click()
  await expect(recap).toBeHidden()
}

test("the woodshed's wood and the hens' eggs wait, and Collect all brings them in", async ({ farm, page, isMobile }) => {
  test.skip(isMobile, 'Phones leave out the bottom-left card (app.css); the garden panel collects there.')
  await thirteenHoursLater(farm)
  const quick = page.getByTestId('collect-all-quick')
  await expect(quick).toBeVisible()
  const before = { coins: await shown(farm.coins()), wood: await shown(farm.wood()) }
  await quick.click()
  await expect.poll(() => shown(farm.coins())).toBeGreaterThan(before.coins)
  await expect.poll(() => shown(farm.wood())).toBeGreaterThan(before.wood)
  await farm.expectToast(COLLECTED)
  await expect(quick).toBeHidden()
})

test('ready markers float over what has something waiting, and the garden panel collects too', async ({ farm, page }) => {
  await thirteenHoursLater(farm)
  await expect(page.getByTestId('world')).toHaveAttribute('data-drawn', 'true')
  await expect(page.getByTestId('ready-eggs')).toHaveText(yieldAmount('eggs', EGGS))
  await expect(page.getByTestId('ready-wood')).toHaveText(yieldAmount('wood', LOGS))

  // The garden's badge counts the kinds waiting; this farm grows no crops.
  const badge = page.getByTestId('tool-garden').locator('.tool__badge')
  await expect(badge).toHaveAttribute('aria-label', `${[EGGS, LOGS].filter((n) => n > 0).length} ready`)
  // An open panel covers the markers under it, as it covers the world.
  await farm.tool('garden')
  for (const id of ['eggs', 'wood']) expect(await againstPanel(page, `ready-${id}`), id).not.toBe('over')

  const collect = page.getByTestId('collect-all')
  await expect(collect).toBeEnabled()
  await collect.click()
  await farm.expectToast(COLLECTED)
  await expect(page.getByTestId('ready-eggs')).not.toBeAttached()
  await expect(page.getByTestId('ready-wood')).not.toBeAttached()
  await expect(collect).toBeDisabled()
  await expect(badge).toHaveCount(0)
})

