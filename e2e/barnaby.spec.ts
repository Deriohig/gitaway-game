import type { Page } from '@playwright/test'
import { BARNABY } from '../src/game/content/barnaby'
import { FEATURES } from '../src/game/features'
import { START, SCREEN_POINT, establishedFarm, expect, test, motion } from './fixtures'

// The world element tells where Barnaby is: `data-barnaby` his stage, `data-barnaby-screen` where he stands ("x,y").
test.skip(!FEATURES.characters, 'the characters are switched off')

const DAY = 86_400_000

// A level-7 farm at 09:00 on Monday: he's due at 06:00 on Tuesday.
test('Barnaby is found the morning after level 6', async ({ farm, page }) => {
  await farm.load(establishedFarm())
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-barnaby', 'away')
  await expect(world).toHaveAttribute('data-barnaby-screen', '')
  // Five to six after a night away: the recap doesn't tell of him yet.
  await farm.wait('20:55:00')
  const recap = page.getByTestId('recap')
  await expect(recap).toBeVisible()
  await expect(recap).not.toContainText(BARNABY.found.title)
  await recap.getByTestId('recap-dismiss').click()
  await expect(recap).toBeHidden()
  // Six o'clock comes with the game open.
  await farm.wait('05:00')
  await farm.expectToast('Someone is asleep in the radishes.')
  await expect(world).toHaveAttribute('data-barnaby', 'camp')
  await farm.tool('journal')
  await expect(page.getByTestId('journal-entry').filter({ hasText: BARNABY.found.title })).toHaveCount(1)
})

test('away at six, the recap tells of him when the player is back', async ({ farm, page }) => {
  await farm.load(establishedFarm())
  const recap = page.getByTestId('recap')
  await farm.wait('21:00:00')
  await expect(recap.getByTestId('recap-line').filter({ hasText: BARNABY.found.title })).toHaveCount(1)
  await page.getByTestId('recap-open-journal').click()
  await expect(recap).toBeHidden()
  await expect(page.getByTestId('journal-entry').filter({ hasText: BARNABY.found.title })).toHaveCount(1)
})

/** A well-off level-7 farm where Barnaby was found yesterday and camps by the garden. */
const camping = (extra: Record<string, unknown> = {}) =>
  establishedFarm({ coins: 50_000, wood: 5_000, characters: { barnaby: { stage: 'camp', foundAt: START.getTime() - DAY } }, ...extra })

async function whereBarnabyIs(page: Page): Promise<{ x: number; y: number }> {
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-barnaby-screen', SCREEN_POINT)
  const [x, y] = (await world.getAttribute('data-barnaby-screen'))!.split(',').map(Number)
  return { x, y }
}

test('claiming the highland moves him to the ruin', async ({ farm, page }) => {
  await farm.load(camping())
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-barnaby', 'camp')
  await farm.tool('farm')
  await page.getByTestId('buy-highland').click()
  await farm.expectToast('Highland isle added')
  await expect(world).toHaveAttribute('data-barnaby', 'ruin')
})

test('tapping Barnaby shows a line', async ({ farm, page }) => {
  await farm.load(camping(motion('still')))
  await expect(page.getByTestId('world')).toHaveAttribute('data-barnaby', 'camp')
  const { x, y } = await whereBarnabyIs(page)
  await page.mouse.move(x, y)
  await expect(page.getByTestId('barnaby-name')).toHaveText(BARNABY.name)

  await farm.holdClock()
  const says = page.getByTestId('barnaby-says')
  await page.mouse.click(x, y)
  await page.clock.runFor(100)
  await expect(says).toContainText('Barnaby Wick. At your service.')
  // He has more to say than that.
  await page.mouse.click(x, y)
  await page.clock.runFor(100)
  await expect(says).not.toContainText('Barnaby Wick. At your service.')
  expect(BARNABY.tapCamp).toContain(await says.textContent())

  // A line is up for 4 s by the game's clock, which reads up to a second behind.
  await page.clock.runFor(2500)
  await expect(says).toBeVisible()
  await page.clock.runFor(2500)
  await expect(says).toBeHidden()
})

test('his longest line wraps to stay inside a phone-wide view', async ({ farm, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const longest = BARNABY.tapCamp.reduce((a, line, i) => (line.length > BARNABY.tapCamp[a].length ? i : a), 0)
  expect(BARNABY.tapCamp[longest].length).toBeGreaterThan(70)
  const heard = BARNABY.tapCamp.flatMap((_, i) => (i === longest ? [] : [i]))
  await farm.load(camping({ ...motion('still'), characters: { barnaby: { stage: 'camp', foundAt: START.getTime() - DAY, met: true, heard } } }))
  await farm.viewSettled()
  const { x, y } = await whereBarnabyIs(page)
  expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName, [x, y])).toBe('CANVAS')
  await farm.holdClock()
  await page.mouse.click(x, y)
  await page.clock.runFor(100)
  const says = page.getByTestId('barnaby-says')
  await expect(says).toHaveText(BARNABY.tapCamp[longest])
  const box = (await says.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(844)
})

