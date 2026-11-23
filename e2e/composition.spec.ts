import type { PieceId } from '../src/world/blueprint'
import { pieceBatches, shownRuns } from '../src/world/composition'
import { COMPOSITION_ITEMS } from '../src/world/composition.data'
import { establishedFarm, expect, expectAttrs, test } from './fixtures'
import { bakedPieces } from './ground'

// The art's composition: trees, shrubs, rocks, flowers and grass on every piece, and path ribbons whose runs show once
// the pieces they need are in. The world element reports `data-composition` (items per piece) and `data-paths` (runs showing).

const items = (id: PieceId) => pieceBatches(id, COMPOSITION_ITEMS, { source: 'baked' }).reduce((n, b) => n + b.items.length, 0)
const paths = (ids: PieceId[], present: PieceId[]) => ids.map((id) => `${id}:${shownRuns(id, present).join(',')}`).join(' ')

test('a farm draws its composition, and buying the meadow adds its scatter and the runs to it', async ({ farm, page }) => {
  expect(bakedPieces()).toContain('main')
  expect(items('main')).toBeGreaterThan(300)
  await farm.load(establishedFarm())
  const world = page.getByTestId('world')
  // Drawing 9,000 instances and loading the plant models takes a moment on a busy machine.
  const drawn = { timeout: 30_000 }
  // The farm's ribbons are in, but every run on it leads to a piece not bought yet.
  await expectAttrs(world, { 'data-composition': `main:${items('main')}`, 'data-paths': 'main:' }, drawn)
  await farm.claim('meadow', 'Meadow isle added')
  // The farm's run to the meadow and the meadow's own; not the ones to the islet or the wetland.
  expect(paths(['main', 'meadow'], ['meadow'])).toBe('main:to_meadow meadow:to_meadow,meadow_hut')
  await expectAttrs(world, { 'data-docked': 'meadow', 'data-composition': `main:${items('main')} meadow:${items('meadow')}`, 'data-paths': paths(['main', 'meadow'], ['meadow']) }, drawn)
})
