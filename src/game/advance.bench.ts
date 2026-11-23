// How long `advance` takes on a farm with a long journal. The store calls it
// once a second, so an idle second should cost next to nothing. Not part of
// `npm test`; run with `npx vitest bench --run src/game/advance.bench.ts`.

import { test } from 'vitest'
import { advance } from './advance'
import { longJournalFarm } from './testing'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)

test('advance with 2,400 journal lines', async ({ bench }) => {
  const idle = longJournalFarm(T0)
  const ripe = longJournalFarm(T0)
  for (const p of ripe.plots) p.readyAt = T0

  await bench.compare(
    bench('an idle second', () => {
      advance(idle, T0 + 1000)
    }),
    bench('a second when a crop ripens', () => {
      advance(ripe, T0 + 1000)
    }),
  )
})
