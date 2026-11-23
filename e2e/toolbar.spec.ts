import type { Page } from '@playwright/test'
import { toolbarTools } from '../src/ui/surfaces'
import { establishedFarm, expect, test } from './fixtures'

// The toolbar's labels hide on narrow phones only when they don't fit, however many tools the switches leave; every
// button keeps its name either way.

/** Each label's own width, the room inside its button, and how wide it is drawn (a pixel when hidden). */
const labels = (page: Page) =>
  page.locator('.toolbar .tool').evaluateAll((tools) =>
    tools.map((tool) => {
      const label = tool.querySelector<HTMLElement>('.tool__label')!
      const style = getComputedStyle(tool)
      return {
        natural: label.scrollWidth,
        room: tool.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
        drawn: label.getBoundingClientRect().width,
      }
    }),
  )

test('toolbar labels stay on a phone whenever they fit, and never spill out', async ({ farm, page }) => {
  await farm.load(establishedFarm())
  await page.evaluate(() => document.fonts.ready)
  const tools = toolbarTools()
  const toolbar = page.getByRole('navigation', { name: 'Farm tools' }).getByRole('button')

  for (const width of [320, 340, 360, 390, 412]) {
    await page.setViewportSize({ width, height: 800 })
    await expect
      .poll(
        async () => {
          const all = await labels(page)
          const fit = all.every((l) => l.natural <= l.room + 0.5)
          // Shown at their own width when they all fit, hidden when any doesn't.
          return all.every((l) => (fit ? Math.abs(l.drawn - l.natural) < 1 : l.drawn <= 1))
        },
        { message: `labels at ${width}px` },
      )
      .toBe(true)
    for (const [i, t] of tools.entries()) await expect(toolbar.nth(i)).toHaveAccessibleName(t.label)
  }

  // Five tools, the most phones will see for now, keep their labels at 360px.
  if (tools.length === 5) {
    await page.setViewportSize({ width: 360, height: 800 })
    await expect.poll(async () => (await labels(page)).every((l) => l.drawn > 1)).toBe(true)
  }
})
