import * as THREE from 'three'
import type { Page } from '@playwright/test'
import { CROPS, type CropId } from '../src/game/config'
import { defaultFrame, VIEW } from '../src/world/framing'
import { plotCenter } from '../src/world/layout'
import { glbMeshes } from '../src/world/testing'
import { START, establishedFarm, expect, test } from './fixtures'
import { mainHeight } from './ground'

// The garden as the world draws it, with the art's crop and plot models in. These farms have nothing docked, so the
// camera stands where defaultFrame puts it, on every screen.

const MINUTE = 60_000

/** A plot sown so that its crop is `progress` of the way grown at START; 1 is ready (since a minute ago). */
function sown(id: number, crop: CropId, progress: number) {
  const span = CROPS[crop].growMinutes * MINUTE
  const plantedAt = START.getTime() - progress * span - (progress >= 1 ? MINUTE : 0)
  return { id, crop, plantedAt, readyAt: plantedAt + span, notified: progress >= 1, lastCrop: null }
}
const empty = (id: number) => ({ id, crop: null, plantedAt: null, readyAt: null, notified: false, lastCrop: null })

/** Garden.tsx stands a plot 0.02 into the ground, and its crops 0.16 up it, on its soil. */
function soilOf(index: number): THREE.Vector3 {
  const [x, z] = plotCenter(index)
  return new THREE.Vector3(x, mainHeight(x, z) - 0.02 + 0.16, z)
}

type Point = { x: number; y: number }

/** Waits for the models and the camera to settle, then gives the default camera's view of the page. */
async function settledView(page: Page) {
  const world = page.getByTestId('world')
  await expect(world).toHaveAttribute('data-models', 'loaded', { timeout: 30_000 })
  await expect.poll(async () => (await world.getAttribute('data-camera-distance')) === (await world.getAttribute('data-frame-distance'))).toBe(true)
  const box = (await world.locator('canvas').boundingBox())!
  const aspect = box.width / box.height
  const distance = defaultFrame([], aspect)
  expect(Math.abs(Number(await world.getAttribute('data-frame-distance')) - distance)).toBeLessThan(0.1)
  const camera = new THREE.PerspectiveCamera(30, aspect, 0.5, 600)
  const target = new THREE.Vector3(...VIEW.target)
  camera.position.copy(target).addScaledVector(new THREE.Vector3(...VIEW.dir).normalize(), distance)
  camera.lookAt(target)
  camera.updateMatrixWorld()
  return {
    onPage(p: THREE.Vector3): Point {
      const v = p.clone().project(camera)
      return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height }
    },
    rayAt({ x, y }: Point): THREE.Raycaster {
      const ray = new THREE.Raycaster()
      ray.setFromCamera(new THREE.Vector2(((x - box.x) / box.width) * 2 - 1, 1 - ((y - box.y) / box.height) * 2), camera)
      return ray
    },
  }
}

/** Whether the world shows at a point on the page, not a panel over it. */
const worldShowsAt = (page: Page, { x, y }: Point) => page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.tagName === 'CANVAS', [x, y])

test('a click high on a tall ripe crop harvests its own plot, not the plot behind it on screen', async ({ farm, page }) => {
  // Plot 3 has ripe tomatoes, 1.2 tall; plot 0, the next plot back from it, ripe radishes.
  await farm.load(establishedFarm({ plots: [sown(0, 'radish', 1), empty(1), empty(2), sown(3, 'tomato', 1)] }))
  const view = await settledView(page)

  // The tomato plant where the game draws it, on plot 3's soil, read from its model.
  const soil = soilOf(3)
  const plant = glbMeshes('public/models/crop_tomato_3.glb')
  for (const mesh of plant) {
    mesh.position.copy(soil)
    mesh.updateMatrixWorld()
  }
  const behind = soilOf(0)

  // A point high up the plant, firmly on it, where the ray on past the plant comes down on plot 0.
  let spot: Point | undefined
  for (let h = 1.05; h >= 0.7 && !spot; h -= 0.05) {
    const p = view.onPage(soil.clone().setY(soil.y + h))
    const firm = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dy]) => {
      const hit = view.rayAt({ x: p.x + dx, y: p.y + dy }).intersectObjects(plant)[0]
      return hit && hit.point.y - soil.y > 0.6
    })
    if (!firm) continue
    const { ray } = view.rayAt(p)
    const down = ray.at((behind.y - ray.origin.y) / ray.direction.y, new THREE.Vector3())
    if (Math.abs(down.x - behind.x) < 0.4 && Math.abs(down.z - behind.z) < 0.4) spot = p
  }
  expect(spot, 'a point high on the tomato plant with plot 0 behind it on screen').toBeDefined()
  expect(await worldShowsAt(page, spot!), 'the tomato plant not under a panel').toBe(true)

  await page.mouse.click(spot!.x, spot!.y)
  await farm.expectToast('Harvested tomato')
  await expect.poll(async () => (await farm.stored())?.plots.map((p) => p.crop)).toEqual(['radish', null, null, null])
})

