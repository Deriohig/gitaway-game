import type { Page, TestInfo } from '@playwright/test'
import { FEATURES } from '../src/game/features'
import { establishedFarm, expect, patiently, test, wellOff } from './fixtures'

// Every piece's water is drawn from the art's baked water, only once the farm has the piece (the world element reports data-water, data-water-tier and
// window.__water). A piece whose water can't load, or whose shader can't be built, alone draws the old water, with one warning.

const SLOW = { timeout: 30_000 }
const deviceTier = (testInfo: TestInfo) => (testInfo.project.name === 'mobile' ? 'phone' : 'mid')

/** Keeps every console warning that mentions the water, from the next page loaded on. Returns a reader. */
async function waterWarnings(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as { waterWarnings: string[] }
    w.waterWarnings = []
    const warn = console.warn.bind(console)
    console.warn = (...args: unknown[]) => {
      const text = args.map(String).join(' ')
      if (/water/i.test(text)) w.waterWarnings.push(text)
      warn(...args)
    }
  })
  return () => page.evaluate(() => (window as unknown as { waterWarnings?: string[] }).waterWarnings ?? [])
}

/** Makes the GPU refuse every water shader (programs reading `uWaterMap`), from the next page loaded on, as a phone whose driver can't build it would. */
async function refuseWaterShader(page: Page) {
  await page.addInitScript(() => {
    const gl = WebGL2RenderingContext.prototype
    const sources = new WeakMap<WebGLShader, string>()
    const attached = new WeakMap<WebGLProgram, WebGLShader[]>()
    const { shaderSource, attachShader, getProgramParameter } = gl
    gl.shaderSource = function (this: WebGL2RenderingContext, shader: WebGLShader, source: string) {
      sources.set(shader, source)
      return shaderSource.call(this, shader, source)
    }
    gl.attachShader = function (this: WebGL2RenderingContext, program: WebGLProgram, shader: WebGLShader) {
      attached.set(program, [...(attached.get(program) ?? []), shader])
      return attachShader.call(this, program, shader)
    }
    gl.getProgramParameter = function (this: WebGL2RenderingContext, program: WebGLProgram, pname: GLenum) {
      const water = (attached.get(program) ?? []).some((shader) => sources.get(shader)?.includes('uWaterMap'))
      return water && pname === this.LINK_STATUS ? false : getProgramParameter.call(this, program, pname)
    }
  })
}

interface WaterReadout {
  tier: string
  bodies: string[]
  misses: string[]
  compiled: string[]
  shown: string[]
}

/** The water's readout, `window.__water`, its lists sorted. */
const readout = (page: Page) =>
  page.evaluate(() => {
    const water = (window as unknown as { __water?: WaterReadout }).__water
    return water && { ...water, bodies: [...water.bodies].sort(), misses: [...water.misses].sort(), compiled: [...water.compiled].sort(), shown: [...water.shown].sort() }
  })

const MAIN_BODIES = ['main:water_fall', 'main:water_pond']
const EVERY_PIECE = 'main:v2:pond,fall wetland:v2:lake,river,fall highland:v2:tarn,spring'
const EVERY_PIECE_NO_SPRING = 'main:v2:pond,fall wetland:v2:lake,river,fall highland:v2:tarn'
const EVERY_BODY = ['highland:water_spring', 'highland:water_tarn', 'main:water_fall', 'main:water_pond', 'wetland:water_fall', 'wetland:water_lake', 'wetland:water_river']
/** With the wetland docked and its water run on, the farm fall is gone (it runs on into the wetland's river). */
const RUN_ON = ['main:water_pond', 'wetland:water_fall', 'wetland:water_lake', 'wetland:water_river']

const waterOf = (piece: 'wetland' | 'highland') => (file: string) => [`water_${piece}.glb`, `water_${piece}.map.bin`].includes(file)

test.describe('with the baked water switched on', () => {
  test.skip(!FEATURES.water, 'the baked water is switched off')

  test('the pond is drawn from the baked water, asked for with the ground', async ({ farm, page }, testInfo) => {
    const warnings = await waterWarnings(page)
    // The world asks for the farm's water as it mounts, before the farm's own piece is in.
    const seen: string[] = []
    const file = (url: string) => new URL(url).pathname.split('/').pop()
    page.on('request', (request) => seen.push(`asked ${file(request.url())}`))
    page.on('requestfinished', (request) => seen.push(`in ${file(request.url())}`))
    await farm.start()
    const world = page.getByTestId('world')
    await expect(world).toHaveAttribute('data-water', 'main:v2:pond,fall', SLOW)
    await expect(world).toHaveAttribute('data-water-tier', deviceTier(testInfo))
    // The pond's body and the farm fall are drawn, their shaders patched in full, and the GPU built them (in software here).
    const drawn = { tier: deviceTier(testInfo), bodies: MAIN_BODIES, misses: [], compiled: MAIN_BODIES, shown: MAIN_BODIES }
    await expect.poll(await patiently(() => readout(page)), { message: 'the water readout', ...SLOW }).toEqual(drawn)
    expect(seen.indexOf('asked water.json'), seen.join(', ')).toBeGreaterThanOrEqual(0)
    expect(seen.indexOf('asked water.json')).toBeLessThan(seen.indexOf('in piece_main.glb'))
    expect(await warnings()).toEqual([])
  })

  // The farm's pond falls back to the old one when its water can't load or draw.
  for (const missing of [true, false]) {
    test(`the farm's pond falls back to the old pond when ${missing ? 'its map is missing' : 'the GPU cannot build its shader'}`, async ({ farm, page }, testInfo) => {
      const warnings = await waterWarnings(page)
      if (missing) await page.route('**/water_main.map.bin', (route) => route.abort())
      else await refuseWaterShader(page)
      await farm.load(establishedFarm())
      const world = page.getByTestId('world')
      const said = missing ? "baked water didn't load" : "baked water can't be drawn on this device"
      await expect.poll(await patiently(warnings), { message: 'warnings that mention the water', ...SLOW }).toEqual([expect.stringContaining(said)])
      await expect(world).toHaveAttribute('data-water', 'main:legacy')
      await expect(world).toHaveAttribute('data-water-tier', deviceTier(testInfo))
      // The world is drawn, not the can't-draw notice, and nothing of the baked water.
      await expect(page.locator('[data-testid="world"] canvas')).toBeVisible()
      await expect(page.locator('.world-fallback')).toBeHidden()
      expect(await readout(page)).toEqual({ tier: deviceTier(testInfo), bodies: [], misses: [], compiled: [], shown: [] })
      expect(await warnings()).toHaveLength(1)
    })
  }

  test('the wetland’s water is asked for only once it is bought, with its ground, and runs on from the farm once it docks', async ({ farm, page }) => {
    const warnings = await waterWarnings(page)
    const asked: string[] = []
    page.on('request', (request) => asked.push(new URL(request.url()).pathname.split('/').pop() ?? ''))
    // Hold the wetland's ground back, so a piece bought meanwhile waits to rise, as on a slow link.
    let release = () => {}
    const released = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/piece_wetland.height.bin', async (route) => {
      await released
      await route.continue()
    })
    await farm.load(wellOff())
    const world = page.getByTestId('world')
    await expect(world).toHaveAttribute('data-models', 'loaded', SLOW)
    await expect(world).toHaveAttribute('data-water', 'main:v2:pond,fall', SLOW)
    expect((await readout(page))?.shown).toEqual(MAIN_BODIES)
    // A piece not bought is never asked for: the wetland's map alone is over half of all the water.
    expect(asked.filter((file) => waterOf('wetland')(file) || waterOf('highland')(file)), 'wild isles’ water asked for').toEqual([])

    await farm.claim('wetland', 'Wetland isle added')
    // Asked for with its ground, while that is still held back.
    await expect.poll(() => asked.filter(waterOf('wetland')).sort()).toEqual(['water_wetland.glb', 'water_wetland.map.bin'])
    release()
    await expect(world).toHaveAttribute('data-docked', 'wetland', SLOW)
    // Docked, its water runs on from the farm's: the farm fall goes, and the river, outflow and wetland fall show.
    await expect.poll(await patiently(async () => (await readout(page))?.shown), { message: 'the bodies showing', timeout: 60_000 }).toEqual(RUN_ON)
    expect(asked.filter(waterOf('highland')), 'the highland’s water asked for').toEqual([])
    expect(await warnings()).toEqual([])
  })

  // The highland's baked spring is drawn only while the farm owns the Hot spring, so nothing appears that the player didn't buy.
  for (const [owns, owned, report, bodies] of [
    ['without', { wetland: 1, highland: 1 }, EVERY_PIECE_NO_SPRING, EVERY_BODY.filter((body) => body !== 'highland:water_spring')],
    ['with', { wetland: 1, highland: 1, hotSpring: 1 }, EVERY_PIECE, EVERY_BODY],
  ] as const) {
    test(`every piece the farm has is drawn from the baked water, the highland's hot spring only ${owns} the Hot spring`, async ({ farm, page }, testInfo) => {
      const warnings = await waterWarnings(page)
      await farm.load(wellOff(owned))
      const world = page.getByTestId('world')
      await expect(world).toHaveAttribute('data-docked', 'wetland highland', SLOW)
      await expect(world).toHaveAttribute('data-water', report, SLOW)
      await expect(world).toHaveAttribute('data-water-tier', deviceTier(testInfo))
      // The wetland was there already, so its water has run on from the farm's: everything shows but the farm fall.
      const shown = bodies.filter((body) => body !== 'main:water_fall')
      const drawn = async () => {
        const water = await readout(page)
        return water && { tier: water.tier, bodies: water.bodies, misses: water.misses, shown: water.shown }
      }
      await expect.poll(await patiently(drawn), { message: `the bodies ${owns} the Hot spring`, ...SLOW }).toEqual({ tier: deviceTier(testInfo), bodies, misses: [], shown })
      expect(await warnings()).toEqual([])
    })
  }

  test('a piece whose map is missing falls back alone', async ({ farm, page }, testInfo) => {
    const warnings = await waterWarnings(page)
    await page.route('**/water_wetland.map.bin', (route) => route.abort())
    await farm.load(wellOff({ wetland: 1, highland: 1, hotSpring: 1 }))
    const world = page.getByTestId('world')
    await expect(world).toHaveAttribute('data-models', 'loaded', SLOW)
    expect(await warnings(), 'the water’s warnings by the time the models are in').toEqual([expect.stringMatching(/wetland piece's baked water didn't load/)])
    await expect(world).toHaveAttribute('data-water', 'main:v2:pond,fall wetland:legacy highland:v2:tarn,spring', SLOW)
    await expect(world).toHaveAttribute('data-water-tier', deviceTier(testInfo))
    await expect(page.locator('.world-fallback')).toBeHidden()
    const water = await readout(page)
    expect(water?.bodies).toEqual(['highland:water_spring', 'highland:water_tarn', ...MAIN_BODIES])
    expect(water?.shown).toEqual(['highland:water_spring', 'highland:water_tarn', 'main:water_pond'])
    expect(await warnings()).toHaveLength(1)
  })
})
