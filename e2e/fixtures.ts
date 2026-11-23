import { expect, test as base, type Locator, type Page } from '@playwright/test'
import { LAND } from '../src/game/config'
import { PIECES, type DockId } from '../src/world/blueprint'
import { almanacPages, journalTabs, toolbarTools } from '../src/ui/surfaces'

/** 09:00 local time on a weekday, so daily caps and the light are predictable. */
export const START = new Date('2026-10-19T09:00:00')

export const test = base.extend<{ farm: Farm }>({
  farm: async ({ page }, use) => {
    await page.clock.install({ time: START })
    await page.addInitScript(recordToasts)
    await use(new Farm(page))
  },
})

/** Keeps the text of every toast the page shows as `toastsShown`: a toast is gone after a few seconds, before a slow machine looks. */
function recordToasts() {
  const w = window as unknown as { toastsShown: string[] }
  w.toastsShown = []
  const toast = '[data-testid="toasts"] > li'
  new MutationObserver((records) => {
    for (const record of records)
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return
        const added = node.matches(toast) ? [node] : Array.from(node.querySelectorAll(toast))
        for (const li of added) w.toastsShown.push((li.textContent ?? '').trim().replace(/\s+/g, ' '))
      })
  }).observe(document, { childList: true, subtree: true })
}

export { expect }

/** Makes the first read of an expect.poll wait for the page however long it takes (drawn in software, a redraw can hold it up for 15 s); later reads are timed as usual. */
export async function patiently<T>(read: () => Promise<T>): Promise<() => Promise<T>> {
  const first = await read()
  let reads = 0
  return () => (reads++ ? read() : Promise.resolve(first))
}

/** Counts the frames drawn on the page's canvas (its clears, not the shadow map's), from the next page loaded on; returns a reader. */
export async function countFrames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { framesDrawn: number }
    w.framesDrawn = 0
    const clear = WebGL2RenderingContext.prototype.clear
    WebGL2RenderingContext.prototype.clear = function (this: WebGL2RenderingContext, mask: number) {
      if (!this.getParameter(this.FRAMEBUFFER_BINDING)) w.framesDrawn++
      return clear.call(this, mask)
    }
  })
  return () => page.evaluate(() => (window as unknown as { framesDrawn: number }).framesDrawn)
}

/** The parts of a saved farm the tests look at. */
export interface SavedFarm {
  plots: { crop: string | null }[]
  seenAt: number
  journal: { title: string }[]
  savedAt?: number
}

export class Farm {
  constructor(readonly page: Page) {}

  coins = () => this.page.getByTestId('coins')
  wood = () => this.page.getByTestId('wood')
  toasts = () => this.page.getByTestId('toasts')

  async coinCount(): Promise<number> {
    return Number((await this.coins().locator('strong').innerText()).replace(/[^0-9]/g, ''))
  }

  /** Opens a fresh farm and gets past the welcome screen and the tour. */
  async start(name = 'Byte Acres') {
    await this.page.goto('/')
    await expect(this.page.getByTestId('welcome')).toBeVisible()
    await this.page.getByTestId('welcome-name').fill(name)
    await this.page.getByTestId('welcome-begin').click()
    await this.page.getByTestId('tutorial-skip').click()
    await expect(this.page.getByTestId('tutorial')).toBeHidden()
    await expect(this.page.getByTestId('farm-name')).toContainText(name)
    await this.expandSession()
  }

  /** On phones the session card starts compact; open it to reach the timer and tasks. */
  async expandSession() {
    const expand = this.page.getByLabel('Expand work session panel')
    if (await expand.isVisible()) await expand.click()
  }

  /** Loads the game with a saved farm already in IndexedDB, at the given path. */
  async load(save: Record<string, unknown>, path = '/') {
    // Seed from another page on the same origin, so the game can't overwrite it.
    await this.page.goto('/favicon.svg')
    await putFarm(this.page, save)
    await this.page.goto(path)
    await expect(this.page.locator('.app[data-ready="true"]')).toBeAttached()
  }

  async tool(name: 'farm' | 'garden' | 'shop' | 'inventory' | 'island' | 'journal' | 'progress') {
    await this.page.getByTestId(`tool-${name}`).click()
    await expect(this.page.getByTestId(`panel-${name}`)).toBeVisible()
  }

  /** The farm as it is saved in IndexedDB right now. */
  async stored(): Promise<SavedFarm | undefined> {
    return (await storedSaves(this.page)).farm as SavedFarm | undefined
  }

  /** The whole saved farm, for the fields `SavedFarm` doesn't name. */
  async saved() {
    return ((await this.stored()) ?? {}) as Record<string, any>
  }

  /** Pretends the tab went into the background (or came back). */
  async setHidden(hidden: boolean) {
    await this.page.evaluate((h) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  }

  async closePanel() {
    await this.page.getByTestId('close-panel').click()
  }

  /** The text of every toast this page has shown since it was opened, gone or not. */
  toastsShown(): Promise<string[]> {
    return this.page.evaluate(() => (window as unknown as { toastsShown?: string[] }).toastsShown ?? [])
  }

  /** Expects a toast saying `text` to have been shown since the page was opened, whether or not it has gone again. */
  async expectToast(text: string | RegExp) {
    const says = typeof text === 'string' ? expect.stringContaining(text) : expect.stringMatching(text)
    await expect.poll(await patiently(() => this.toastsShown()), { message: `a toast saying ${text}` }).toContainEqual(says)
  }

  /** Lets time pass, firing the game's timers along the way. */
  async wait(duration: string) {
    await this.page.clock.fastForward(duration)
    await this.page.clock.runFor(1100)
  }

  /** Opens the Farm panel and buys `id` there, expecting the toast. */
  async claim(id: string, toast: string | RegExp) {
    await this.tool('farm')
    await this.page.getByTestId(`buy-${id}`).click()
    await this.expectToast(toast)
  }

  /** Logs a finished task from the session card. */
  async logTask(title: string) {
    await this.page.getByTestId('task-input').fill(title)
    await this.page.getByTestId('task-submit').click()
  }

  /** Holds the game's clock five minutes on, so a toast or a line stays up while the test looks at it. */
  async holdClock() {
    await this.page.clock.pauseAt(new Date(START.getTime() + 5 * 60_000))
  }

  /** Waits until the camera has settled where the view puts it (once the pieces have docked). */
  async viewSettled(timeout = 10_000) {
    const world = this.page.getByTestId('world')
    await expect.poll(async () => (await world.getAttribute('data-camera-distance')) === (await world.getAttribute('data-frame-distance')), { timeout }).toBe(true)
  }

  /** Opens the Visitors page of the almanac, through the tabs there are. */
  async openVisitorsPage() {
    const { page } = this
    await page.keyboard.press(toolbarTools().find((t) => t.id === 'journal')!.key)
    await expect(page.getByTestId('panel-journal')).toBeVisible()
    if (journalTabs().length > 1) await page.getByTestId('tab-almanac').click()
    if (almanacPages().length > 1) await page.getByTestId('tab-visitors').click()
    const visitorsPage = page.getByTestId('visitors-page')
    await expect(visitorsPage).toBeVisible()
    return visitorsPage
  }
}

/** Every key in the game's IndexedDB store, with what it holds. */
export function storedSaves(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const open = indexedDB.open('gitaway')
        open.onsuccess = () => {
          const db = open.result
          const out: Record<string, unknown> = {}
          if (!db.objectStoreNames.contains('saves')) {
            db.close()
            return resolve(out)
          }
          const cursor = db.transaction('saves').objectStore('saves').openCursor()
          cursor.onsuccess = () => {
            const c = cursor.result
            if (!c) {
              db.close()
              return resolve(out)
            }
            out[String(c.key)] = c.value
            c.continue()
          }
          cursor.onerror = () => reject(cursor.error)
        }
        open.onerror = () => reject(open.error)
      }),
  )
}

/** Writes a saved farm into IndexedDB (making the store when there is none yet). */
export function putFarm(page: Page, save: Record<string, unknown>) {
  return page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('gitaway')
        open.onupgradeneeded = () => open.result.createObjectStore('saves')
        open.onsuccess = () => {
          const tx = open.result.transaction('saves', 'readwrite')
          tx.objectStore('saves').put(data, 'farm')
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
        open.onerror = () => reject(open.error)
      }),
    save,
  )
}

/** Expects each attribute of an element to read as given, in turn. */
export async function expectAttrs(el: Locator, attrs: Record<string, string | RegExp>, options?: { timeout: number }) {
  for (const [name, value] of Object.entries(attrs)) await expect(el).toHaveAttribute(name, value, options)
}

/** What `data-siofra-screen` and `data-barnaby-screen` read when a figure is drawn: "x,y" in CSS pixels. */
export const SCREEN_POINT = /^\d+(\.\d+)?,\d+(\.\d+)?$/

/** A piece's `data-isle-<id>` once it's docked: drawn, at its own height, at its place in the blueprint. */
export const docked = (id: DockId) => `y=0.00 shown at=${PIECES[id].dockedPosition[0].toFixed(2)},${PIECES[id].dockedPosition[2].toFixed(2)}`

/** What a piece of land costs with `owned` pieces owned. */
export const landPrice = (owned: number) => ({
  coins: Math.round(LAND.coins.base * LAND.coins.growth ** owned),
  wood: Math.round(LAND.wood.base * LAND.wood.growth ** owned),
})

/** A farm that has been going for a while: level 7, well stocked. */
export function establishedFarm(overrides: Record<string, unknown> = {}) {
  const now = START.getTime()
  return {
    version: 1,
    createdAt: now - 30 * 86_400_000,
    farmName: 'Old Orchard',
    coins: 2000,
    wood: 120,
    xp: 1100,
    levelSeen: 7,
    seeds: { radish: 3, carrot: 3, lettuce: 2, tomato: 2, sunflower: 1, pumpkin: 1, blueberry: 1 },
    plots: [],
    owned: { plot: 0, chicken: 2 },
    gifts: ['cat', 'dog'],
    session: null,
    daily: { date: '2026-10-19', sessionMinutes: 0, tasks: [] },
    recent: [],
    stats: { sessions: 12, sessionMinutes: 900, tasks: 20, planted: 30, harvested: { radish: 10, carrot: 8 }, coinsEarned: 2400 },
    settings: { motion: 'auto', timeOfDay: 'clock', ambientSound: false, sessionPanelCollapsed: false, welcomed: true, tutorialDone: true },
    ...overrides,
  }
}

/** A save override setting the motion level (the suite's browser prefers reduced motion, which "auto" follows). */
export const motion = (level: 'auto' | 'full' | 'calm' | 'still') => ({ settings: { ...establishedFarm().settings, motion: level } })

/** A well-off farm, owning `owned` too: coins and wood enough to claim the wild isles. */
export const wellOff = (owned: Record<string, number> = {}) => establishedFarm({ coins: 4000, wood: 200, owned: { plot: 0, chicken: 2, ...owned } })
