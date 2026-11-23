import * as THREE from 'three'
import { VISITORS, VISITOR_IDS, type VisitorId } from '../src/game/content/visitors'
import { FEATURES } from '../src/game/features'
import { xpForLevel } from '../src/game/progression'
import { keepsakeLine } from '../src/game/systems/visitors'
import { journalTabs } from '../src/ui/surfaces'
import { defaultFrame, VIEW } from '../src/world/framing'
import { ISLE_VISITORS } from '../src/world/isleSpots'
import { ISLES } from '../src/world/layout'
import { pieceHeight } from './ground'
import { START, establishedFarm, expect, motion, test, type Farm } from './fixtures'

// Wild visitors (B1) are behind a feature switch. Only the Brown hare comes by, once the meadow isle is claimed.
test.skip(!FEATURES.visitors, 'visitors (B1) are switched off')

const HOUR = 3_600_000

interface Saved {
  coins: number
  wood: number
  xp: number
  visitors: { present: { id: VisitorId }[]; seen: Partial<Record<VisitorId, number>> }
  keepsakes: Partial<Record<VisitorId, number>>
  journal: { title: string; detail?: string }[]
}

const saved = async (farm: Farm) => (await farm.stored()) as unknown as Saved

/** A level-4 farm, where visitors start to come, with the meadow the hare lives on. */
const levelFour = () => establishedFarm({ xp: xpForLevel(4), levelSeen: 4, owned: { plot: 0, chicken: 2, meadow: 1 } })

/** A level-4 farm with the hare already waiting, and none due for a day or so. */
function waiting(extra: Record<string, unknown> = {}) {
  const arrivedAt = START.getTime() - HOUR
  return { ...levelFour(), visitors: { since: arrivedAt - HOUR, nextPeriod: 1, present: [{ id: 'hare', arrivedAt }], seen: {} }, ...extra }
}

/** Expects the hello to have left her keepsake in the journal, and to have paid nothing. */
function expectKeepsakeOnly(before: Saved, after: Saved) {
  expect(after.visitors.present).toEqual([])
  expect(after.journal).toEqual(expect.arrayContaining([expect.objectContaining({ title: VISITORS.hare.says[0], detail: keepsakeLine('hare') })]))
  expect({ coins: after.coins, wood: after.wood, xp: after.xp }).toEqual({ coins: before.coins, wood: before.wood, xp: before.xp })
}

test('the hare comes by, and saying hello from the almanac leaves a keepsake and pays nothing', async ({ farm, page }) => {
  await farm.load(levelFour())
  // Two days pass: the hare comes within a day and a half of level 4, and the recap tells of her arrival.
  await farm.wait('48:00:00')
  await expect.poll(async () => (await saved(farm))?.visitors.present.length ?? 0).toBeGreaterThan(0)
  const recap = page.getByTestId('recap')
  await expect(recap.getByTestId('recap-line').filter({ hasText: VISITORS[(await saved(farm)).visitors.present[0].id].arrives })).toHaveCount(1)
  await recap.getByTestId('recap-dismiss').click()
  await expect(recap).toBeHidden()
  const visitorsPage = await farm.openVisitorsPage()

  // The hare is the only wild visitor left, so the meadow is the only isle with a section.
  expect(VISITOR_IDS).toEqual(['hare'])
  await expect(page.getByTestId('visitor-card-hare')).toHaveCount(1)
  await expect(visitorsPage.locator('.vis-group')).toHaveAttribute('aria-label', 'Meadow isle')
  for (const isle of ['Home island', 'Forest grove', 'Lighthouse islet', 'Wetland isle', 'Highland isle']) await expect(visitorsPage).not.toContainText(isle)
  // No count of finds: her card is a silhouette and a hint, with no digit on it.
  await expect(page.getByTestId('visitors-found')).toHaveCount(0)
  await expect(page.getByTestId('visitor-card-hare')).toHaveAttribute('data-seen', 'false')
  await expect(page.getByTestId('visitor-card-hare')).not.toContainText(/\d/)
  const here = page.getByTestId('here-now')
  await expect(here).toHaveAttribute('data-visitor', 'hare')
  await expect(here).toContainText(VISITORS.hare.name)

  const before = await saved(farm)
  const chips = [farm.coins().locator('strong'), farm.wood().locator('strong')]
  const texts = await Promise.all(chips.map((c) => c.innerText()))
  // Say hello from the keyboard.
  const hello = page.getByTestId('say-hello-hare')
  await expect(hello).toHaveAccessibleName('Say hello to the brown hare')
  await hello.focus()
  await page.keyboard.press('Enter')
  // She leaves a keepsake, goes on her way, her card fills in, and focus lands on Here now.
  await expect(page.getByTestId('visitor-thanks')).toHaveText(keepsakeLine('hare'))
  await expect(page.getByRole('heading', { name: 'Here now' })).toBeFocused()
  await expect(here).toHaveCount(0)
  const card = page.getByTestId('visitor-card-hare')
  await expect(card).toHaveAttribute('data-seen', 'true')
  await expect(page.getByTestId('keepsake-hare')).toHaveText(VISITORS.hare.keepsake)
  await expect(card).toContainText('Seen before')
  await expect(card).not.toContainText(/\d/)
  await expect.poll(async () => (await saved(farm)).visitors.seen.hare).toBe(1)
  const after = await saved(farm)
  expect(after.keepsakes.hare).toBe(1)
  expectKeepsakeOnly(before, after)
  // Luck pays in delight only: the chips show no more.
  for (const [i, chip] of chips.entries()) await expect(chip).toHaveText(texts[i])
  if (journalTabs().some((t) => t.id === 'journal')) {
    await page.getByTestId('tab-journal').click()
    await expect(page.getByTestId('journal-entry').filter({ hasText: VISITORS.hare.says[0] })).toHaveCount(1)
  }
})

/** Where she stands in the meadow grass, as world/features/Visitors.tsx stands her, and her middle (halfway up the 0.45 model drawn 1.3 times larger). */
function hareMiddle(): THREE.Vector3Tuple {
  const { isle, at, lift } = ISLE_VISITORS.hare
  const [px, py, pz] = ISLES[isle].pos
  return [px + at[0], py + pieceHeight(isle)(at[0], at[1]) + lift + 0.45 * 1.3 * 0.5, pz + at[1]]
}

/**
 * Finds the hare on screen and points at her, so her label shows. A window taller than it is wide frames the farm with
 * the meadow docked beside it; a wide one frames the farm alone, so its window is narrowed first, as the desktop strip layout does.
 */
async function pointAtHare(farm: Farm) {
  const page = farm.page
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-docked', /\bmeadow\b/)
  await farm.viewSettled()
  let box = (await world.locator('canvas').boundingBox())!
  if (box.width >= box.height) {
    await page.setViewportSize({ width: 600, height: 900 })
    await expect.poll(async () => (await world.locator('canvas').boundingBox())!.width).toBeLessThan(700)
    await farm.viewSettled()
    box = (await world.locator('canvas').boundingBox())!
  }
  const aspect = box.width / box.height
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.5, 600)
  const target = new THREE.Vector3(...VIEW.target)
  camera.position.copy(target).addScaledVector(new THREE.Vector3(...VIEW.dir).normalize(), defaultFrame(['meadow'], aspect))
  camera.lookAt(target)
  camera.updateMatrixWorld()
  const v = new THREE.Vector3(...hareMiddle()).project(camera)
  expect(Math.max(Math.abs(v.x), Math.abs(v.y)), 'the hare in view').toBeLessThan(0.9)
  const x = box.x + ((v.x + 1) / 2) * box.width
  const y = box.y + ((1 - v.y) / 2) * box.height
  // A pixel or two either way, and only where the world shows, not under a panel.
  const candidates: [number, number][] = [[0, 0], [0, -3], [0, 3], [-3, 0], [3, 0]].map(([dx, dy]) => [x + dx, y + dy])
  const points = await page.evaluate((list) => list.filter(([px, py]) => document.elementFromPoint(px, py)?.tagName === 'CANVAS'), candidates)
  expect(points.length, 'the hare not under a panel').toBeGreaterThan(0)
  const label = page.locator('.world-label', { hasText: 'Click to say hello' })
  for (let tries = 0; ; tries++) {
    for (const [x, y] of points) {
      await page.mouse.move(x, y)
      if (await label.isVisible()) return { x, y }
    }
    if (tries >= 5) throw new Error('could not find the hare on screen')
    await page.waitForTimeout(500)
  }
}

// The system allows motion in the second run; the player chose Still in the game, so labels must come and go without moving.
for (const gameStill of [false, true]) {
  test.describe(gameStill ? "in the game's own Still mode" : 'with the system’s reduced motion', () => {
    test.use({ reducedMotion: gameStill ? 'no-preference' : 'reduce' })

    test('the hare in the world can be greeted by clicking her', async ({ farm, page }) => {
      await farm.load(waiting(gameStill ? motion('still') : {}))
      const before = await saved(farm)
      const { x, y } = await pointAtHare(farm)
      const label = page.locator('.world-label', { hasText: 'Click to say hello' })
      await expect(label).toBeVisible()
      await expect(page.getByText(VISITORS.hare.name)).toBeVisible()
      if (gameStill) expect(await label.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')

      // Hold the clock from the goodbye on: a farewell is up for a few seconds, which a slow machine can spend drawing her going.
      await farm.holdClock()
      await page.mouse.click(x, y)
      await page.clock.runFor(100)
      const farewell = page.locator('.world-label', { hasText: keepsakeLine('hare') })
      await expect(farewell).toBeVisible()
      if (gameStill) expect(await farewell.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
      await expect.poll(async () => (await saved(farm)).visitors.seen.hare).toBe(1)
      expectKeepsakeOnly(before, await saved(farm))
    })
  })
}

