import type { BrowserContext, Page } from '@playwright/test'
import { expect, test } from './fixtures'

// Every change is saved as it happens, so leaving the page straight after an action must keep it, even while that save
// is still on its way to IndexedDB. A save usually lands within milliseconds, so these tests hold the page's writes (or
// keep the storage busy) until it goes away. Without the backup, the change is lost every time.

/** From now on this page's saves never land: each write is queued as usual and its transaction kept busy, so it is still in flight when the page goes away. */
async function holdWrites(page: Page) {
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      const request = put.apply(this, args)
      const keepBusy = () => {
        this.get('farm').onsuccess = keepBusy
      }
      keepBusy()
      return request
    }
  })
}

const leaving: Record<string, (page: Page, context: BrowserContext) => Promise<Page>> = {
  'reloading': async (page) => {
    await page.reload()
    return page
  },
  'closing the tab': async (page, context) => {
    await page.close()
    return context.newPage()
  },
  // The tab ends without its pagehide or visibilitychange handlers getting to run, as when it crashes.
  'the tab being cut short': async (page, context) => {
    const cdp = await context.newCDPSession(page)
    const crashed = page.waitForEvent('crash')
    void cdp.send('Page.crash').catch(() => {})
    await crashed
    return context.newPage()
  },
}

for (const [how, leave] of Object.entries(leaving)) {
  test(`a crop planted just before ${how} is still there`, async ({ farm, page, context }) => {
    await farm.start()
    await farm.tool('garden')
    await holdWrites(page)
    await page.getByTestId('plant-radish').click()
    await farm.expectToast('Planted 4 radishes')
    const next = await leave(page, context)
    if (next !== page) await next.goto('/')
    await next.getByTestId('tool-garden').click()
    await expect(next.getByTestId('plot-0')).toHaveAccessibleName(/Radish/)
  })
}

// Regression: a tab's backup once won over a newer save from another tab when the clock stepped back after the backup
// was taken, so the tabs took turns reloading it and writing it, and the other tab's crop was lost.
test("another tab's newer save beats this tab's backup, even after the clock steps back", async ({ farm, page, context }) => {
  // Two tabs draw the world, and each redraws when the other saves: twice the drawing of a one-tab test.
  test.slow()
  await farm.start()
  const other = await context.newPage()
  await other.goto('/')
  await expect(other.getByTestId('farm-name')).toContainText('Byte Acres')

  // This tab goes into the background, which backs the farm up; then the computer's clock steps back a minute.
  await farm.setHidden(true)
  await page.clock.setSystemTime((await page.evaluate(() => Date.now())) - 60_000)
  // The other tab plants: that's the newest save, whatever the clock says.
  await other.getByTestId('tool-garden').click()
  await other.getByTestId('plant-radish').click()
  await expect(other.getByTestId('plot-0')).toHaveAccessibleName(/Radish/)

  // Coming back, and loading again, both take it.
  await farm.setHidden(false)
  await farm.tool('garden')
  await expect(page.getByTestId('plot-0')).toHaveAccessibleName(/Radish/)
  await page.reload()
  await farm.tool('garden')
  await expect(page.getByTestId('plot-0')).toHaveAccessibleName(/Radish/)

  // The tabs have settled: IndexedDB isn't being written over and over. The clock is held first, so the game's own timed
  // saves stop; tabs answering each other's saves need no timer, so they would go on. Each tab has its own copy of the
  // clock, so it's held half a minute ahead of both.
  await expect(other.getByTestId('plot-0')).toHaveAccessibleName(/Radish/)
  const times = await Promise.all([page, other].map((tab) => tab.evaluate(() => Date.now())))
  await page.clock.pauseAt(Math.max(...times) + 30_000)
  let last: number | undefined
  await expect
    .poll(
      async () => {
        const at = (await farm.stored())?.savedAt
        const quiet = at === last
        last = at
        return quiet
      },
      { message: 'a second with nothing written to IndexedDB', intervals: [1000] },
    )
    .toBe(true)
  expect((await farm.stored())?.plots[0].crop).toBe('radish')
})
