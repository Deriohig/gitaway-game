import type { Response } from '@playwright/test'
import { establishedFarm, expect, test } from './fixtures'

// The hand-made models (public/models) are drawn wherever they're marked ready. Their textures are unpacked into blob:
// URLs, which the content policy has to let the loader read.
test('the models load without tripping the content policy, the animals and furnishings among them', async ({ farm, page }) => {
  test.slow()
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(String(error)))
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|Couldn't load texture/.test(msg.text())) problems.push(msg.text())
  })
  const fetched: Response[] = []
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('.glb')) fetched.push(response)
  })

  await farm.load(
    establishedFarm({
      owned: { plot: 0, chicken: 2, duck: 2, windmill: 1, well: 1, bench: 1, meadow: 1, sheep: 2, greenhouse: 1, beehive: 1, lantern: 1, scarecrow: 1, islet: 1, lighthouse: 1, highland: 1, goat: 1, flowerbed: 1 },
    }),
  )
  await expect(page.getByTestId('world')).toHaveAttribute('data-drawn', 'true', { timeout: 30_000 })
  // The isles' things load once their pieces have: wait until the loader has every model in.
  await expect(page.getByTestId('world')).toHaveAttribute('data-models', 'loaded', { timeout: 45_000 })

  // The animals come as their rigs, in place of their plain models.
  const batch = [
    ...['cat_sleeping', 'chicken', 'dog', 'duck', 'goat'].map((id) => `${id}_rig.glb`),
    ...['beehive', 'flowerbed', 'greenhouse', 'lantern', 'lighthouse', 'scarecrow'].map((id) => `${id}.glb`),
  ]
  const arrived = fetched.filter((r) => r.status() === 200).map((r) => new URL(r.url()).pathname.split('/').pop())
  expect(batch.filter((file) => !arrived.includes(file))).toEqual([])
  expect((await Promise.all(fetched.map((r) => r.finished()))).filter(Boolean)).toEqual([])
  expect(fetched.filter((r) => r.status() !== 200)).toEqual([])
  expect(problems).toEqual([])
})
