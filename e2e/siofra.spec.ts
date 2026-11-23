import { SIOFRA, SIOFRA_NAME } from '../src/game/content/siofra'
import { FEATURES } from '../src/game/features'
import type { GameState } from '../src/game/state'
import { momentDue } from '../src/game/systems/siofra'
import { START, SCREEN_POINT, establishedFarm, expect, motion, patiently, test, type Farm } from './fixtures'

// Síofra, the púca, is behind the characters switch. Once she's met, her figure stands at the meadow's field edge; the
// world element tells whether she's met (`data-siofra`) and where her figure stands on screen (`data-siofra-screen`,
// "x,y" in CSS pixels, empty while it isn't drawn).
test.skip(!FEATURES.characters, 'the characters are switched off')

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** A level-7 farm with the meadow, where Barnaby has settled and she was met at 06:00 yesterday; the hare, greeted once, isn't due back for a day or so. It has no ducks. */
const metFarm = (siofra: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  establishedFarm({
    owned: { plot: 0, chicken: 2, meadow: 1 },
    characters: {
      barnaby: { stage: 'camp', foundAt: START.getTime() - 5 * DAY },
      siofra: { dueAt: START.getTime() - DAY - 3 * HOUR, metAt: START.getTime() - DAY - 3 * HOUR, ...siofra },
    },
    visitors: { since: START.getTime() - 2 * HOUR, nextPeriod: 1, present: [], seen: { hare: 1 } },
    ...extra,
  })

/** A level-7 farm with the meadow, where she hasn't been met: she's due at 06:00 tomorrow. Motion still. */
const toMeet = () =>
  establishedFarm({
    owned: { plot: 0, chicken: 2, meadow: 1 },
    characters: { barnaby: { stage: 'camp', foundAt: START.getTime() - 4 * DAY } },
    visitors: { since: START.getTime() - 2 * HOUR, nextPeriod: 1, present: [], seen: { hare: 1 } },
    ...motion('still'),
  })

/** Waits for the meadow to dock and the view to settle on the farm and it. */
async function viewSettled(farm: Farm) {
  await expect(farm.page.getByTestId('world')).toHaveAttribute('data-docked', /\bmeadow\b/)
  await farm.viewSettled(20_000)
}

/** Where her figure stands on screen, once the view has settled and it shows (not under a panel). */
async function whereSheIs(farm: Farm): Promise<{ x: number; y: number }> {
  const { page } = farm
  const world = page.getByTestId('world')
  await viewSettled(farm)
  await expect(world).toHaveAttribute('data-siofra-screen', SCREEN_POINT)
  const [x, y] = (await world.getAttribute('data-siofra-screen'))!.split(',').map(Number)
  expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName, [x, y])).toBe('CANVAS')
  return { x, y }
}

/** Every line a moment of hers can be: the glimpses, the shapes, the notices and the gifts. */
const MOMENTS = [...SIOFRA.glimpses, ...SIOFRA.shapes, ...SIOFRA.cropsLeftStanding, ...Object.values(SIOFRA.gifts)]

/**
 * After a jump of hours, waits for the game's catch-up to land (it marks the farm seen at `at` or later), then puts away
 * any recap card. Returns what the card said, or '' when none came.
 */
async function caughtUp(farm: Farm, at: number): Promise<string> {
  await expect.poll(await patiently(async () => (await farm.stored())?.seenAt ?? 0)).toBeGreaterThanOrEqual(at)
  const recap = farm.page.getByTestId('recap')
  if (!(await recap.isVisible())) return ''
  const said = (await recap.textContent()) ?? ''
  await recap.getByTestId('recap-dismiss').click()
  await expect(recap).toBeHidden()
  return said
}

test('Síofra is met at the next morning, with one toast and a journal line', async ({ farm, page }) => {
  await farm.load(toMeet())
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-siofra', 'unmet')
  // Five to six after a night away: whatever the recap tells of, it isn't her, not yet.
  await farm.wait('20:55:00')
  expect(await caughtUp(farm, START.getTime() + 20 * HOUR + 55 * MINUTE)).not.toContain(SIOFRA.met.title)
  await expect(world).toHaveAttribute('data-siofra', 'unmet')

  // Six o'clock comes with the game open: her toast, and her line in the journal.
  await farm.wait('05:00')
  await farm.expectToast(SIOFRA.met.toast)
  await expect(world).toHaveAttribute('data-siofra', 'met')
  await farm.tool('journal')
  const line = page.getByTestId('journal-entry').filter({ hasText: SIOFRA.met.title })
  await expect(line).toHaveCount(1)
  await expect(line).toHaveAttribute('data-kind', 'character')
  // A while on, still the one meeting: one toast, one line, and none of her other lines ever came as a toast.
  await farm.wait('05:00')
  await expect(line).toHaveCount(1)
  const toasts = await farm.toastsShown()
  expect(toasts.filter((t) => t.includes(SIOFRA.met.toast))).toHaveLength(1)
  for (const l of [SIOFRA.met, ...MOMENTS]) expect(toasts.filter((t) => t.includes(l.title)), l.title).toEqual([])
})

test('tapping her shows a line that is not written to the journal', async ({ farm, page }) => {
  await farm.load(metFarm({}, motion('still')))
  // A wide window frames the farm alone; narrowed, as the desktop app's strip layout does, it frames the meadow docked beside it.
  await viewSettled(farm)
  const canvas = page.getByTestId('world').locator('canvas')
  if ((await canvas.boundingBox())!.width >= (await canvas.boundingBox())!.height) {
    await page.setViewportSize({ width: 600, height: 900 })
    await expect.poll(async () => (await canvas.boundingBox())!.width, { timeout: 20_000 }).toBeLessThan(700)
  }
  const at = await whereSheIs(farm)
  await page.mouse.move(at.x, at.y)
  const name = page.getByTestId('siofra-name')
  await expect(name).toHaveText(SIOFRA_NAME)
  expect(await name.evaluate((el) => getComputedStyle(el).whiteSpace), 'her name stays on one line').toBe('nowrap')

  await farm.holdClock()
  await page.mouse.click(at.x, at.y)
  await page.clock.runFor(100)
  const says = page.getByTestId('siofra-says')
  await expect(says).toBeVisible()
  const said = (await says.textContent()) ?? ''
  const index = SIOFRA.taps.findIndex((t) => t.line === said)
  expect(index, `"${said}" is one of her lines`).toBeGreaterThanOrEqual(0)
  expect(SIOFRA.taps[index].needs, 'this farm has no ducks, so never the duckling').not.toBe('duck')

  // A line is up for 4 s by the game's clock, which reads up to a second behind: 5 s on, it's gone.
  await page.clock.runFor(5000)
  await expect(says).toBeHidden()
  // The farm keeps that she said it, and nothing more: no journal line, and no toast.
  await expect.poll(await patiently(async () => ((await farm.stored()) as unknown as GameState | undefined)?.characters?.siofra?.said?.index)).toBe(index)
  const journal = ((await farm.saved()).journal ?? []) as { title: string; detail?: string }[]
  expect(journal.filter((e) => e.title.includes(said) || e.detail?.includes(said))).toEqual([])
  expect((await farm.toastsShown()).filter((t) => t.includes(said))).toEqual([])
})

test('a moment arrives at the next 18:00 post', async ({ farm, page }) => {
  // Her last moment came two or three local days before 18:00 today, by the gap its date gives (see momentDue), and
  // yesterday's post has been seen to: the next is due at 18:00 today.
  const post = new Date(START).setHours(18, 0, 0, 0)
  const evening = (daysBefore: number) => {
    const d = new Date(post)
    d.setDate(d.getDate() - daysBefore)
    return d.getTime()
  }
  const dueAfter = (momentAt: number) => momentDue({ characters: { siofra: { momentAt } }, visitors: { seen: { hare: 1 } } } as unknown as GameState)
  const last = [2, 3].map(evening).find((at) => dueAfter(at) === post)
  expect(last, 'a moment two or three days before, whose gap ends today').toBeDefined()
  // That one was a glimpse, before she was met.
  await farm.load(metFarm({ momentAt: last, checkedAt: evening(1), lastMoment: SIOFRA.glimpses[1].id }, motion('still')))
  const hers = async () => (((await farm.saved()).journal ?? []) as { kind: string; title: string; at: number }[]).filter((e) => MOMENTS.some((l) => l.title === e.title))
  // Five to six this evening, with the game open since nine: nothing of hers yet.
  await farm.wait('08:55:00')
  await caughtUp(farm, post - 5 * MINUTE)
  expect(await hers()).toEqual([])
  // Six o'clock comes with the game open: one line of hers, quietly, at the post.
  await farm.wait('09:00')
  await expect.poll(await patiently(async () => (await hers()).length)).toBe(1)
  const [moment] = await hers()
  expect(moment).toMatchObject({ kind: 'character', at: post })
  expect((await farm.toastsShown()).filter((t) => t.includes(moment.title))).toEqual([])
  await farm.tool('journal')
  await expect(page.getByTestId('journal-entry').filter({ hasText: moment.title })).toHaveAttribute('data-kind', 'character')
})

test('while the hare is here her figure is hidden and Say hello names her', async ({ farm, page }) => {
  const hare = { id: 'hare', arrivedAt: START.getTime() - HOUR }
  await farm.load(metFarm({}, { visitors: { since: START.getTime() - 2 * HOUR, nextPeriod: 1, present: [hare], seen: { hare: 1 } }, ...motion('still') }))
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-siofra', 'met')
  // The meadow is docked and the view settled, so the frames since would have drawn her: she isn't drawn.
  await expect(world).toHaveAttribute('data-pieces', /\bmeadow:/)
  await viewSettled(farm)
  await page.waitForTimeout(500)
  expect(await world.getAttribute('data-siofra-screen')).toBe('')

  await farm.openVisitorsPage()
  const here = page.getByTestId('here-now')
  await expect(here).toHaveAttribute('data-visitor', 'hare')
  await expect(here).toContainText(SIOFRA_NAME)
  const hello = page.getByTestId('say-hello-hare')
  await expect(hello).toHaveAccessibleName(SIOFRA.hareOnceMet.sayHello)
  await hello.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('visitor-thanks')).toHaveText(SIOFRA.hareOnceMet.keepsakeLine)
  // The hare has gone on her way, and she stands there as herself.
  await expect(here).toHaveCount(0)
  await expect(world).toHaveAttribute('data-siofra-screen', SCREEN_POINT)
})
