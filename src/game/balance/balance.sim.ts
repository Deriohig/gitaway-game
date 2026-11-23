import { expect, it } from 'vitest'
import { FARM_ONLY, ITEMS } from '../config'
import { PROFILES, T0, play } from './players'
import { evaluate, printReport } from './report'

// `npm run balance` (spec §2). Local only: the default test run and CI leave
// `.sim.ts` files out. The workers play a 15th day so that T1's day 13–15
// window can be seen; T2 to T6 still read days 1–14.
it('meets the balance targets', () => {
  // The players' days, workdays and check-in hours are local times, and they're only Monday mornings under UTC.
  if (new Date(T0).getHours() !== 0) {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    throw new Error(`The balance simulator needs TZ=UTC, but it is running in ${zone}. Run it with \`npm run balance\`.`)
  }
  const logs = {
    worker: play(PROFILES.worker, 15),
    light: play(PROFILES.light, 15),
    farmer: play(PROFILES.farmer, 60),
  }
  const results = evaluate(logs)
  printReport(logs, results)
  expect(results.filter((r) => !r.pass).map((r) => r.id)).toEqual([])
})

// The farm-only setting is tuned to the worker's pace: no faster, or it would beat working.
it('farm-only keeps pace with the worker', () => {
  const lastLand = (logs: ReturnType<typeof play>) => logs.filter((l) => l.bought.some((id) => ITEMS[id].category === 'land')).at(-1)!.day
  const worker = lastLand(play(PROFILES.worker, 30))
  const farmOnly = lastLand(play(PROFILES.farmer, 30, { farmOnly: true }))
  console.log(`farm-only at ${FARM_ONLY.pay}x owns all the land on day ${farmOnly}; the worker on day ${worker}`)
  expect(farmOnly).toBeGreaterThanOrEqual(worker)
  expect(farmOnly).toBeLessThanOrEqual(worker + 3)
})
