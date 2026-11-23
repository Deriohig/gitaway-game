import { DOCK_IDS } from '../src/world/blueprint'
import { docked, establishedFarm, expect, expectAttrs, landPrice, patiently, test, type Farm } from './fixtures'

// The ring isles: with the five pieces nearest the farm in, the glade (the cottage's piece) can be claimed, then the
// orchard behind the windmill, and the island closes all the way round the farm. `data-paths` says which path runs show on each piece.

const FIVE = ['meadow', 'grove', 'islet', 'wetland', 'highland']

/** A farm with the five pieces bought before, and enough for the last two. */
const withFive = (owned: Record<string, number> = {}) =>
  establishedFarm({
    coins: landPrice(5).coins + landPrice(6).coins,
    wood: landPrice(5).wood + landPrice(6).wood,
    owned: { plot: 0, chicken: 2, ...Object.fromEntries(FIVE.map((id) => [id, 1])), ...owned },
  })

/** Expects the journal's note on a purchase, as saved, to say `detail`: read there rather than from a toast, which can come and go while the world is busy drawing the new piece. */
async function expectNote(farm: Farm, title: string) {
  const noteOn = async () => ((await farm.saved()).journal as { title: string; detail?: string }[] | undefined)?.find((e) => e.title === title)?.detail ?? ''
  await expect.poll(await patiently(noteOn), { message: `the journal's note on "${title}"` }).toMatch(/rises from the clouds and docks/)
}

// With every piece drawn, these are the heaviest scenes in the suite: without a graphics card they take more than the usual minute.
test.beforeEach(() => test.slow())

test('the glade can be claimed: it rises from the clouds, docks beside the wetland and the highland, and its paths show', async ({ farm, page }) => {
  await farm.load(withFive())
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-docked', FIVE.join(' '))
  await farm.tool('farm')
  await page.getByTestId('buy-cottageLand').click()
  await expect(page.getByTestId('panel-farm')).toBeHidden()
  await expectNote(farm, 'Woodland glade added')
  const all = [...FIVE, 'cottage'].join(' ')
  await expectAttrs(world, {
    'data-isles': all,
    'data-docked': all,
    'data-isle-cottage': docked('cottage'),
    'data-pieces': /cottage:baked/,
    'data-paths': /main:to_meadow,to_highland,to_islet,to_cottage,to_wetland,to_grove( |$)/,
  })
  await expect(world).toHaveAttribute('data-paths', /cottage:to_cottage,to_wetland( |$)/)
  await expect(world).toHaveAttribute('data-paths', /wetland:to_wetland,meadow_lake( |$)/)
})

test('the orchard can be claimed: it docks behind the windmill and the island is closed all the way round', async ({ farm, page }) => {
  await farm.load(withFive({ cottageLand: 1 }))
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-docked', [...FIVE, 'cottage'].join(' '))
  await farm.tool('farm')
  await page.getByTestId('buy-orchardLand').click()
  await expect(page.getByTestId('panel-farm')).toBeHidden()
  await expectNote(farm, 'Orchard isle added')
  // Every piece is docked: the island is closed all the way round the farm.
  const all = [...FIVE, 'orchard', 'cottage']
  expect([...all].sort()).toEqual([...DOCK_IDS].sort())
  await expectAttrs(world, { 'data-isles': all.join(' '), 'data-docked': all.join(' '), 'data-isle-orchard': docked('orchard'), 'data-pieces': /orchard:baked/ })
  // Every run on every piece shows now.
  for (const runs of [
    /main:to_meadow,to_highland,to_islet,to_cottage,to_wetland,to_orchard,to_grove( |$)/,
    /highland:to_highland,base_to_orchard,plateau_walk( |$)/,
    /orchard:to_orchard,base_to_orchard,orchard_to_grove( |$)/,
    /grove:to_grove,orchard_to_grove( |$)/,
  ])
    await expect(world).toHaveAttribute('data-paths', runs)
  // The camera still frames the farm on a wide screen; on a phone held upright, the farm and every docked piece's middle.
  const { width, height } = page.viewportSize()!
  await expect(world).toHaveAttribute('data-frame-distance', width >= height ? '35.5' : '130.0')
})
