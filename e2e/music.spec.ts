import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/** The session music player, or null before any session has played it. */
function music(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLAudioElement>('[data-testid="session-music"]')
    return el && { paused: el.paused, src: el.src, currentTime: el.currentTime, error: el.error?.code ?? null, volume: el.volume }
  })
}

/** Waits until the music really plays: a file that loaded and decoded, and has got going. */
async function expectPlaying(page: Page) {
  await expect
    .poll(
      async () => {
        const m = await music(page)
        return m && { paused: m.paused, error: m.error, started: m.currentTime > 0 }
      },
      { message: 'the session music is playing' },
    )
    .toEqual({ paused: false, error: null, started: true })
}

const expectStopped = (page: Page) => expect.poll(() => music(page), { timeout: 10_000 }).toMatchObject({ paused: true })

/** Refuses to play anything until the player has touched the page, counting input as the HTML spec does. Chromium's own check
 * can't be used: each page.evaluate from Playwright counts as a user gesture. */
async function strictAutoplay(page: Page) {
  await page.addInitScript(() => {
    let touched = false
    const counts = (e: Event) => {
      if (!e.isTrusted) return false
      if (e instanceof KeyboardEvent) return e.key !== 'Escape'
      if (e instanceof PointerEvent) return e.type === 'pointerdown' ? e.pointerType === 'mouse' : e.pointerType !== 'mouse'
      return true // mousedown, touchend
    }
    for (const type of ['keydown', 'mousedown', 'pointerdown', 'pointerup', 'touchend']) window.addEventListener(type, (e) => (touched ||= counts(e)), { capture: true })
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      return touched ? play.call(this) : Promise.reject(new DOMException('No input yet.', 'NotAllowedError'))
    }
  })
}

test('a work session plays the lo-fi, ending it stops it, and each session starts on the next track', async ({ farm, page }) => {
  const requested: string[] = []
  page.on('request', (req) => requested.push(req.url()))
  await farm.start()
  await page.waitForTimeout(1000)
  expect(requested.filter((url) => url.endsWith('.mp3')), 'nothing downloads before a session starts').toEqual([])

  await page.getByTestId('start-session').click()
  await expectPlaying(page)
  const first = (await music(page))?.src
  expect(first).toMatch(/music\/lofi-[a-z-]+\.mp3$/)
  await page.getByTestId('end-session').click()
  await expectStopped(page)

  await page.getByTestId('start-session').click()
  await expectPlaying(page)
  expect((await music(page))?.src).not.toBe(first)
})

test('the switch turns session music off, even mid-session', async ({ farm, page }) => {
  await farm.start()
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('session-music-toggle')).toBeChecked()
  await farm.closePanel()
  await page.getByTestId('start-session').click()
  await expectPlaying(page)

  await page.getByTestId('open-settings').click()
  await page.getByTestId('session-music-toggle').uncheck()
  await expectStopped(page)
  await farm.closePanel()
  await page.getByTestId('end-session').click()
  await page.getByTestId('start-session').click()
  await expect(page.getByTestId('end-session')).toBeVisible()
  await page.waitForTimeout(1000)
  expect(await music(page)).toMatchObject({ paused: true })
})

for (const gesture of ['a key press', 'a tap on a phone']) {
  test(`after a reload mid-session, the music waits for ${gesture}`, async ({ farm, page, hasTouch }) => {
    const tap = gesture !== 'a key press'
    test.skip(tap && !hasTouch, 'Needs a touch screen.')
    await strictAutoplay(page)
    await farm.start()
    await page.getByTestId('start-session').click()
    await expectPlaying(page)

    await page.reload()
    await expect(page.locator('.app[data-ready="true"]')).toBeAttached()
    // Long enough for the game to ask for the music, and be refused.
    await page.waitForTimeout(1000)
    expect(await music(page)).toMatchObject({ paused: true })
    if (tap) await page.getByTestId('coins').tap()
    else await page.keyboard.press('Shift')
    await expectPlaying(page)
  })
}

