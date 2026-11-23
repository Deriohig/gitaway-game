import { PLOTS, START as NEW_FARM } from '../src/game/config'
import { SAVE_VERSION } from '../src/game/state'
import { toolbarTools } from '../src/ui/surfaces'
import { START, establishedFarm, expect, test, type Farm } from './fixtures'

/** A new farm sows its starting radishes, one to a plot. */
const RADISHES = Math.min(NEW_FARM.seeds.radish!, PLOTS.starting)
const OPENING = 'A farmhouse, a pond and four beds of soil.'

/** A time on a day before the test's morning (09:00, Monday 19 October 2026). */
const daysAgo = (days: number, hour: number, minute = 0) => new Date(2026, 9, 19 - days, hour, minute).getTime()

/** A young farm at level 2, with nothing harvested yet. */
const youngFarm = (overrides: Record<string, unknown> = {}) =>
  establishedFarm({
    version: SAVE_VERSION,
    createdAt: daysAgo(3, 9),
    farmName: 'Little Plot',
    coins: 120,
    wood: 10,
    xp: 60,
    levelSeen: 2,
    seeds: { radish: 4, carrot: 0 },
    gifts: ['cat'],
    daily: { date: '2026-10-19', sessionMinutes: 0, tasks: [], commits: 0, harvests: 0 },
    stats: { sessions: 0, sessionMinutes: 0, tasks: 0, planted: 0, harvested: {}, coinsEarned: 0 },
    seenAt: START.getTime(),
    // Told its level 2 line already, so loading it writes no story line of its own.
    told: ['wheat'],
    ...overrides,
  })

/** Starts a farm and sows the starting radishes. */
async function startAndPlant(farm: Farm) {
  await farm.start()
  await farm.tool('garden')
  await farm.page.getByTestId('plant-radish').click()
  await farm.expectToast(`Planted ${RADISHES} radishes`)
}

test('what you do is written down in the journal, and any line takes a note of your own', async ({ farm, page }) => {
  test.slow()
  await farm.start()
  await farm.logTask('Water the tomatoes')
  await farm.expectToast('Task logged')
  await farm.tool('journal')
  const entries = page.getByTestId('journal-entry')
  await expect(entries.filter({ hasText: 'Water the tomatoes' })).toHaveCount(1)
  await expect(entries.filter({ hasText: 'One thing done, and written down.' })).toHaveCount(1)
  await expect(entries.filter({ hasText: OPENING })).toHaveCount(1)
  await expect(page.getByTestId('panel-journal')).toContainText('Today')
  // Its number key closes and opens it again.
  const key = toolbarTools().find((t) => t.id === 'journal')!.key
  await page.keyboard.press(key)
  await expect(page.getByTestId('panel-journal')).toBeHidden()
  await page.keyboard.press(key)
  await expect(page.getByTestId('panel-journal')).toBeVisible()

  // Any line takes a note of your own.
  const task = entries.filter({ hasText: 'Water the tomatoes' })
  const note = (entry: typeof task) => ({ edit: entry.getByTestId('journal-note-edit'), input: entry.getByTestId('journal-note-input'), shown: entry.getByTestId('journal-note') })

  await note(task).edit.click()
  await note(task).input.fill('Use the rain barrel next time')
  await note(task).input.press('Enter')
  await expect(note(task).shown).toHaveText('Use the rain barrel next time')
  // Escape puts it back as it was, and leaves the journal open.
  await note(task).edit.click()
  await note(task).input.fill('Never mind')
  await note(task).input.press('Escape')
  await expect(note(task).shown).toHaveText('Use the rain barrel next time')
  await expect(page.getByTestId('panel-journal')).toBeVisible()
  // Clicking away saves it too.
  const opening = page.getByTestId('journal-entry').filter({ hasText: OPENING })
  await note(opening).edit.click()
  await note(opening).input.fill('Where it all began')
  await page.locator('#panel-journal-title').click()
  await expect(note(opening).shown).toHaveText('Where it all began')

  // Notes are kept with the farm.
  await expect.poll(async () => (await farm.saved()).journal?.find((e: { title: string }) => e.title === 'Water the tomatoes')?.note).toBe('Use the rain barrel next time')
  await page.reload()
  await farm.tool('journal')
  await expect(note(task).shown).toHaveText('Use the rain barrel next time')
})

test('coming back after a while shows what happened on the island', async ({ farm, page }) => {
  // A long absence replays many ticks and can take most of the 60 s limit.
  test.slow()
  await startAndPlant(farm)
  // Close the game, let a quarter of an hour pass, and open it again.
  await page.goto('/favicon.svg')
  await page.clock.fastForward('15:00')
  await page.goto('/')
  const recap = page.getByTestId('recap')
  await expect(recap).toBeVisible()
  await expect(recap).toContainText('On the island')
  await expect(recap).toContainText('Byte Acres')
  await expect(recap).toContainText('Your radishes are ready')
  // The card says it instead of a pile of toasts, and never says how long you were gone.
  await expect(farm.toasts()).not.toContainText('Your radishes are ready')
  await expect(recap).not.toContainText(/minute|hour|away/i)
  await page.getByTestId('recap-open-journal').click()
  await expect(recap).toBeHidden()
  await expect(page.getByTestId('panel-journal')).toBeVisible()
  await expect(page.getByTestId('journal-entry').filter({ hasText: 'Your radishes are ready' })).toHaveCount(1)
})

test('returning to the tab shows the recap, which takes focus without taking the keys you were typing, and can be put away', async ({ farm, page }) => {
  await startAndPlant(farm)
  await farm.closePanel()
  const task = page.getByTestId('task-input')
  await task.fill('Water the')
  await farm.setHidden(true)
  await farm.wait('12:00')
  await expect(page.getByTestId('recap')).toBeHidden()
  await farm.setHidden(false)
  const recap = page.getByTestId('recap')
  await expect(recap).toContainText('Your radishes are ready')
  await expect(farm.toasts()).not.toContainText('Your radishes are ready')
  await expect(recap).toBeFocused()
  // A key meant for the field doesn't press one of the card's buttons.
  await page.keyboard.press('Space')
  await expect(recap).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(recap).toBeHidden()
  await expect(task).toBeFocused()
  await expect(task).toHaveValue('Water the')
})

test('a short break brings no recap, just the usual note', async ({ farm, page }) => {
  await startAndPlant(farm)
  await farm.setHidden(true)
  await farm.wait('06:00')
  await farm.setHidden(false)
  await farm.expectToast('Your radishes are ready')
  await expect(page.getByTestId('recap')).toBeHidden()
})

test('the journal groups lines by day, filters them by kind and pages fifty at a time', async ({ farm, page }) => {
  const journal = [
    { id: 1, at: daysAgo(3, 10), kind: 'story', title: OPENING },
    { id: 2, at: daysAgo(1, 14), kind: 'work', title: 'Fixed the flaky test', detail: '+8 coins · +5 XP' },
    ...Array.from({ length: 55 }, (_, i) => ({ id: 3 + i, at: daysAgo(0, 8, i), kind: 'garden', title: `Ripe batch ${i + 1}` })),
  ]
  await farm.load(youngFarm({ journal, journalSeq: journal.length }))
  await farm.tool('journal')
  const entries = page.getByTestId('journal-entry')
  const days = page.getByTestId('journal-day')
  await expect(entries).toHaveCount(50)
  await expect(entries.first()).toContainText('Ripe batch 55')
  await expect(days.first().getByRole('heading')).toHaveText('Today')

  await page.getByTestId('journal-show-older').click()
  await expect(entries).toHaveCount(journal.length)
  await expect(page.getByTestId('journal-show-older')).toBeHidden()
  // The button is gone, so focus moves on to the first line it brought in.
  await expect(entries.nth(50)).toBeFocused()
  await expect(days.getByRole('heading')).toHaveText(['Today', 'Yesterday', 'Friday 16 October'])

  await page.getByTestId('journal-filter-work').click()
  await expect(page.getByTestId('journal-filter-work')).toHaveAttribute('aria-pressed', 'true')
  await expect(entries).toHaveCount(1)
  await expect(entries.first()).toContainText('Fixed the flaky test')
  await expect(days.getByRole('heading')).toHaveText(['Yesterday'])
  await page.getByTestId('journal-filter-all').click()
  await expect(entries).toHaveCount(50)
})

test('long recap lines wrap on a narrow phone', async ({ farm, page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  // No hyphens or spaces to break at, as a repository name can be.
  const long = 'Three commits landed in gitaway_desktop_shell_experiments_with_a_long_name'
  const journal = [
    { id: 2, at: START.getTime() - 20 * 60_000, kind: 'git', title: long },
    { id: 1, at: daysAgo(3, 10), kind: 'story', title: OPENING },
  ]
  await farm.load(youngFarm({ journal, journalSeq: 2, seenAt: START.getTime() - 3 * 3_600_000 }))
  const recap = page.getByTestId('recap')
  await expect(recap.getByTestId('recap-line')).toHaveText(long)
  expect(await recap.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0)
  const card = (await recap.boundingBox())!
  const line = (await recap.getByTestId('recap-line').boundingBox())!
  expect(line.x + line.width).toBeLessThanOrEqual(card.x + card.width)
})

test('the note for next time is waiting on the recap, and on the session card until cleared', async ({ farm, page }) => {
  test.slow()
  await farm.start()
  await page.getByTestId('start-session').click()
  await page.getByTestId('next-note-input').fill('Finish the parser')
  await farm.tool('garden')
  await page.getByTestId('plant-radish').click()
  await farm.expectToast(`Planted ${RADISHES} radishes`)
  await farm.closePanel()
  await farm.wait('02:00')
  await page.getByTestId('end-session').click()
  await farm.expectToast('Session complete')
  await expect(page.getByTestId('next-note')).toContainText('Last time you noted: Finish the parser')

  // Wait for the save to land before closing the game.
  await expect.poll(async () => (await farm.saved()).nextNote).toBe('Finish the parser')
  await expect.poll(async () => (await farm.stored())?.plots[0].crop).toBe('radish')
  await page.goto('/favicon.svg')
  await page.clock.fastForward('20:00')
  await page.goto('/')
  const recap = page.getByTestId('recap')
  await expect(recap).toContainText('Byte Acres')
  await expect(recap).toContainText('On the island')
  await expect(page.getByTestId('recap-note')).toHaveText('Last time you noted: Finish the parser')
  await expect(page.getByTestId('recap-line').filter({ hasText: 'Your radishes are ready' })).toHaveCount(1)
  await expect(recap).not.toContainText(/minute|hour|away|while you were/i)
  await page.getByTestId('recap-dismiss').click()
  await expect(recap).toBeHidden()

  await farm.expandSession()
  await expect(page.getByTestId('next-note')).toContainText('Finish the parser')
  await page.getByTestId('next-note-clear').click()
  await expect(page.getByTestId('next-note')).toBeHidden()
  await expect.poll(async () => (await farm.saved()).nextNote).toBe('')
})

test('ending the session keeps the note for next time, even when the field never loses focus', async ({ farm, page }) => {
  // Some browsers (Safari) don't move focus to a clicked button, so ending the session has to keep the note on its own.
  await farm.start()
  await page.getByTestId('start-session').click()
  await page.getByTestId('next-note-input').fill('Finish the parser')
  await page.getByTestId('end-session').dispatchEvent('click')
  await expect(page.getByTestId('start-session')).toBeVisible()
  await expect(page.getByTestId('next-note')).toContainText('Last time you noted: Finish the parser')
  await expect.poll(async () => (await farm.saved()).nextNote).toBe('Finish the parser')

  // The same from the small card, folded away while the field still had focus.
  await page.getByTestId('start-session').click()
  await page.getByTestId('next-note-input').fill('Then the save backup')
  await page.getByLabel('Collapse work session panel').dispatchEvent('click')
  await page.getByTestId('end-session').dispatchEvent('click')
  await expect(page.getByTestId('start-session')).toBeVisible()
  await expect.poll(async () => (await farm.saved()).nextNote).toBe('Then the save backup')
  // Folded away, as it starts on a phone, the card says a note is kept inside.
  await expect(page.getByTestId('session-expand')).toHaveAccessibleName(/note for next time/)
  await page.getByTestId('session-expand').click()
  await expect(page.getByTestId('next-note')).toContainText('Last time you noted: Then the save backup')
})
