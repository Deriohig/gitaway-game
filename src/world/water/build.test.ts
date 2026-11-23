import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import waterRaw from '../../../public/models/water.json?raw'
import { skyAt } from '../skyPalette'
import { buildPieceWater, OWNED_WATER, precompileWater, RENDER_ORDER, showPieceWater, waterProgramBroken, waterWithout, watchWaterPrograms, type BuiltWater, type WaterProgramState } from './build'
import { createSharedWaterUniforms, driveWater, resetSessionWater, sessionWaterUniforms, setFlowDock } from './driver'
import { fillPlan } from './fill'
import { makeMapTexture, makeNoiseTexture, type LoadedWater } from './load'
import { waterReadout } from './readout'
import { setWaterReport, WATER_PIECES, waterReport, waterTierReport, type WaterPieceId } from './report'
import type { WaterJson } from './types'
import { bodyUniforms } from './waterMaterial'

const json = JSON.parse(waterRaw) as WaterJson
const WETLAND = ['water_lake', 'water_river', 'water_fall']
const frame = () => driveWater({ t: 0 }, 1 / 30, false, skyAt(13))

/** A piece's load with stand-in bytes and small meshes: its still and ribbon bodies, or the ones named. */
function loaded(piece: WaterPieceId = 'main', nodes?: string[]): LoadedWater {
  const listed = json.pieces[piece].bodies.filter((b) => (nodes ? nodes.includes(b.node) : b.kind === 'still' || b.kind === 'ribbon'))
  return {
    json,
    bodies: listed.map((body) => ({ body, geometry: new THREE.PlaneGeometry(1, 1), parts: [{ node: body.node, length: body.length ?? 0 }] })),
    map: makeMapTexture(new Uint8Array(4 * 4 * 4), [4, 4]),
    noise: makeNoiseTexture(new Uint8Array(2 * 2 * 2), [2, 2]),
    origin: [-8.525, 1.975],
    extent: [9.6, 6.4],
  }
}
const wetlandBuilt = () => buildPieceWater('wetland', loaded('wetland', WETLAND), 'mid')

afterEach(() => {
  resetSessionWater()
  for (const piece of WATER_PIECES) setWaterReport(piece, null)
  waterReadout().bodies.length = 0
  waterReadout().compiled.length = 0
  vi.unstubAllGlobals()
})

describe('buildPieceWater', () => {
  it('draws each body as one mesh with its own material, and as a body for the driver', () => {
    const load = loaded()
    const built = buildPieceWater('main', load, 'mid')
    const [mesh] = built.meshes
    const [body] = built.bodies
    expect([built.meshes.length, built.bodies.length, mesh.parent, mesh.name, mesh.material.name]).toEqual([1, 1, built.root, 'water_pond', 'water:main:water_pond'])
    expect(mesh.geometry).toBe(load.bodies[0].geometry)
    expect(mesh.material).toBeInstanceOf(THREE.MeshLambertMaterial)
    expect([body.name, body.kind]).toEqual(['water_pond', 'still'])
    expect(body.mesh).toBe(mesh)
    expect(body.uniforms).toBe(bodyUniforms(mesh.material))
    expect(body.uniforms.uFill.value).toBe(1)
    expect(body.parts).toBe(load.bodies[0].parts)
  })

  it('stands the water in its piece’s own frame', () => {
    for (const piece of WATER_PIECES) {
      const built = buildPieceWater(piece, loaded(piece), 'mid')
      expect(built.root.name).toBe(`water:${piece}`)
      for (const o of [built.root, ...built.meshes]) expect(o.position.toArray(), `${piece} ${o.name}`).toEqual([0, 0, 0])
    }
  })

  it('orders still 2, ribbon 3, fall 5, transparent and never casting a shadow', () => {
    expect(RENDER_ORDER).toEqual({ still: 2, ribbon: 3, fall: 5 })
    const built = wetlandBuilt()
    expect(built.bodies.map((b) => [b.name, b.kind, b.mesh.renderOrder])).toEqual([['water_lake', 'still', 2], ['water_river', 'ribbon', 3], ['water_fall', 'fall', 5]])
    for (const { name, kind, mesh } of built.bodies) {
      const fall = kind === 'fall'
      expect([mesh.material.transparent, mesh.material.depthWrite, mesh.material.side, mesh.castShadow, mesh.receiveShadow], name).toEqual([true, !fall, fall ? THREE.DoubleSide : THREE.FrontSide, false, true])
    }
  })

  it('receives shadows on the mid tier only, and compiles a program per tier', () => {
    const load = loaded()
    const [mid] = buildPieceWater('main', load, 'mid').meshes
    const [phone] = buildPieceWater('main', load, 'phone').meshes
    expect([mid.receiveShadow, phone.receiveShadow]).toEqual([true, false])
    expect(phone.material.customProgramCacheKey()).not.toBe(mid.material.customProgramCacheKey())
  })

  it('builds every piece on the session’s one set of uniforms', () => {
    const builds = [buildPieceWater('main', loaded('main'), 'mid'), buildPieceWater('wetland', loaded('wetland'), 'phone'), buildPieceWater('main', loaded('main'), 'phone')]
    const [main] = builds
    expect(Object.keys(main.shared).sort()).toEqual(Object.keys(createSharedWaterUniforms(json)).sort())
    expect(main.shared).toBe(sessionWaterUniforms(json))
    for (const b of builds) {
      expect(b.shared).toBe(main.shared)
      for (const { name, uniforms } of b.bodies) expect(uniforms.uScrollA, name).toBe(main.shared.uScrollA)
    }
  })
})

describe('showPieceWater', () => {
  it('lists and reports the baked pond, then puts it all back, disposing its material but keeping the load’s mesh and textures', () => {
    const load = loaded()
    const built = buildPieceWater('main', load, 'mid')
    const [mesh] = built.meshes
    const material = vi.spyOn(mesh.material, 'dispose')
    const kept = [vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(load.map, 'dispose'), vi.spyOn(load.noise, 'dispose')]
    const undo = showPieceWater('main', built, 'mid')
    expect([waterReadout().bodies, waterReport()]).toEqual([['main:water_pond'], 'main:v2:pond'])
    undo()
    expect([waterReadout().bodies, waterReport(), waterTierReport()]).toEqual([[], '', ''])
    expect(material).toHaveBeenCalledTimes(1)
    for (const spy of kept) expect(spy).not.toHaveBeenCalled()
    // shown again after being put back, as StrictMode runs an effect twice over
    showPieceWater('main', built, 'mid')
    expect(waterReadout().bodies).toEqual(['main:water_pond'])
  })

  it('reports the tier it is drawn at, and today’s water, while the pond loads or after it failed, and leaves window.__water', () => {
    const undo = showPieceWater('main', buildPieceWater('main', loaded(), 'phone'), 'phone')
    expect(waterTierReport()).toBe('phone')
    undo()
    expect(waterTierReport()).toBe('')
    vi.stubGlobal('window', {})
    const undoLegacy = showPieceWater('main', null, 'mid')
    expect([waterReport(), waterTierReport(), waterReadout().bodies]).toEqual(['main:legacy', 'mid', []])
    expect((window as unknown as { __water?: unknown }).__water).toBe(waterReadout())
    undoLegacy()
    expect(waterReport()).toBe('')
  })

  it('leaves the session’s uniforms to the other pieces when one goes', () => {
    const main = buildPieceWater('main', loaded('main'), 'mid')
    const wetland = buildPieceWater('wetland', loaded('wetland'), 'mid')
    const undoMain = showPieceWater('main', main, 'mid')
    const undoWetland = showPieceWater('wetland', wetland, 'mid')
    const disposed = vi.spyOn(wetland.meshes[0].material, 'dispose')
    undoMain()
    expect(sessionWaterUniforms(json)).toBe(wetland.shared)
    const before = wetland.shared.uScrollA.value.clone()
    frame()
    expect(wetland.shared.uScrollA.value.equals(before)).toBe(false)
    expect([waterReadout().bodies, waterReport()]).toEqual([['wetland:water_lake', 'wetland:water_river', 'wetland:water_outflow'], 'wetland:v2:lake,river,outflow'])
    expect(disposed).not.toHaveBeenCalled()
    undoWetland()
  })

  it('registers its bodies with the driver while shown, and takes them out when it goes', () => {
    const built = buildPieceWater('main', loaded('main', ['water_pond', 'water_fall']), 'mid')
    expect(built.plan).toEqual(fillPlan(json.pieces.main.bodies))
    const fall = built.bodies.find((b) => b.name === 'water_fall')!
    const undo = showPieceWater('main', built, 'mid')
    expect(waterReadout().shown).toEqual(['main:water_fall', 'main:water_pond'])
    setFlowDock('before') // a wetland already there: the farm fall is gone from the next frame
    frame()
    expect([fall.mesh.visible, waterReadout().shown]).toEqual([false, ['main:water_pond']])
    undo()
    expect(waterReadout().shown).toEqual([])
    setFlowDock('none')
    frame()
    expect(fall.mesh.visible).toBe(false)
  })

  it('shows the wetland’s river and fall only once it docks, from the moment it is shown', () => {
    const built = wetlandBuilt()
    showPieceWater('wetland', built, 'mid')
    expect(built.bodies.map((b) => [b.name, b.mesh.visible, b.uniforms.uFill.value])).toEqual([['water_lake', true, 1], ['water_river', false, 0], ['water_fall', false, 0]])
    expect(waterReadout().shown).toEqual(['wetland:water_lake'])
  })
})

// The highland's baked spring is drawn only while the farm owns the Hot spring.
describe('the water a farm draws only once it owns its thing', () => {
  it('leaves the highland’s hot spring out until the farm owns the Hot spring', () => {
    expect(OWNED_WATER).toEqual({ highland: { water_spring: 'hotSpring' } })
    expect(waterWithout('highland', {})).toEqual(['water_spring'])
    expect(waterWithout('highland', { hotSpring: 0, goat: 2 })).toEqual(['water_spring'])
    expect(waterWithout('highland', { hotSpring: 1 })).toEqual([])
    for (const piece of ['main', 'wetland'] as const) expect(waterWithout(piece, {}), piece).toEqual([])
  })

  it('builds, lists and reports only the bodies drawn', () => {
    const load = loaded('highland')
    const tarnAlone = buildPieceWater('highland', load, 'mid', ['water_spring'])
    expect([tarnAlone.meshes.map((m) => m.name), tarnAlone.bodies.map((b) => b.name)]).toEqual([['water_tarn'], ['water_tarn']])
    expect(tarnAlone.root.children).toEqual(tarnAlone.meshes)
    const undo = showPieceWater('highland', tarnAlone, 'mid')
    expect([waterReport(), waterReadout().bodies, waterReadout().shown]).toEqual(['highland:v2:tarn', ['highland:water_tarn'], ['highland:water_tarn']])
    undo()
    showPieceWater('highland', buildPieceWater('highland', load, 'mid', waterWithout('highland', { hotSpring: 1 })), 'mid')
    expect([waterReport(), waterReadout().bodies, waterReadout().shown]).toEqual(['highland:v2:tarn,spring', ['highland:water_tarn', 'highland:water_spring'], ['highland:water_spring', 'highland:water_tarn']])
  })
})

describe('watchWaterPrograms', () => {
  const renderer = (currentProgram?: WaterProgramState) => ({ properties: { get: () => (currentProgram ? { currentProgram } : {}) } }) as unknown as THREE.WebGLRenderer
  /** Three's draw of a mesh: its onAfterRender, called after the draw. */
  const draw = (mesh: THREE.Mesh, by: THREE.WebGLRenderer, material: THREE.Material = mesh.material as THREE.Material) =>
    mesh.onAfterRender(by, new THREE.Scene(), new THREE.Camera(), mesh.geometry, material, null as unknown as THREE.Group)
  const failed = { diagnostics: { runnable: false } }
  const watched = (tier: 'phone' | 'mid' = 'mid') => {
    const built = buildPieceWater('main', loaded(), tier)
    const broken = vi.fn()
    const undo = watchWaterPrograms('main', built, broken)
    return { mesh: built.meshes[0], broken, undo }
  }

  it.each<[string, WaterProgramState | undefined, number]>([
    ["falls back after the first draw when the program didn't link", failed, 1],
    ['falls back when three has no program for it after the draw', undefined, 1],
    ['keeps the water when its program built cleanly', {}, 0],
    ['keeps the water when its program built with warnings', { diagnostics: { runnable: true } }, 0],
  ])('%s', (_, program, calls) => {
    const { mesh, broken } = watched()
    expect(broken).not.toHaveBeenCalled()
    draw(mesh, renderer(program))
    expect(broken).toHaveBeenCalledTimes(calls)
    expect(waterProgramBroken(program)).toBe(calls === 1)
  })

  it('reads the first draw only, through the material it drew with, tells once, and judges no other pass’s material', () => {
    const built = buildPieceWater('main', loaded(), 'mid')
    const [mesh] = built.meshes
    const plain = mesh.onAfterRender
    const broken = vi.fn()
    watchWaterPrograms('main', built, broken)
    const get = vi.fn(() => ({ currentProgram: failed }))
    const by = { properties: { get } } as unknown as THREE.WebGLRenderer
    draw(mesh, by, new THREE.MeshDepthMaterial()) // an override or a depth pass says nothing of the water's program
    expect([get, broken, waterReadout().compiled].map((m) => (Array.isArray(m) ? m : m.mock.calls.length))).toEqual([0, 0, []])
    draw(mesh, by)
    draw(mesh, by)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(mesh.material)
    expect(broken).toHaveBeenCalledTimes(1)
    expect(mesh.onAfterRender).toBe(plain)
  })

  it('stops watching when it is undone, before any draw', () => {
    const { mesh, broken, undo } = watched()
    undo()
    draw(mesh, renderer(failed))
    expect(broken).not.toHaveBeenCalled()
  })

  it('lists a built body in the readout’s compiled after its first draw, once, until undone, and not one that did not link', () => {
    const { mesh, undo } = watched()
    expect(waterReadout().compiled).toEqual([])
    draw(mesh, renderer({}))
    draw(watched().mesh, renderer({})) // a rebuild of the same body is listed once
    expect(waterReadout().compiled).toEqual(['main:water_pond'])
    undo()
    expect(waterReadout().compiled).toEqual([])
    draw(watched('phone').mesh, renderer(failed))
    expect(waterReadout().compiled).toEqual([])
  })
})

// A hidden body's program is built with its piece, then every body's program is checked as the first draw would.
describe('precompileWater', () => {
  const camera = new THREE.PerspectiveCamera()
  const scene = new THREE.Scene()

  /** A program as three builds it: its diagnostics are set only when its uniforms are first asked for. */
  function program(links: boolean) {
    const p: WaterProgramState & { getUniforms: () => object } = {
      getUniforms: vi.fn(() => {
        if (!links) p.diagnostics = { runnable: false }
        return {}
      }),
    }
    return p
  }
  /** A program for each of a build's materials, one that links unless `fails` says it is that mesh's. */
  const programsOf = (built: BuiltWater, fails: (mesh: THREE.Mesh) => boolean = () => false) => new Map(built.meshes.map((mesh) => [mesh.material, program(!fails(mesh))]))
  function renderer(programs: ReadonlyMap<THREE.Material, WaterProgramState>, compileAsync: (...args: unknown[]) => unknown = vi.fn(async () => {})) {
    const get = vi.fn((material: THREE.Material) => (programs.has(material) ? { currentProgram: programs.get(material) } : {}))
    return { compileAsync, properties: { get } } as unknown as THREE.WebGLRenderer & { compileAsync: ReturnType<typeof vi.fn>; properties: { get: typeof get } }
  }
  /** The wetland's water, shown: the lake drawn, its river and fall hidden until the dock. */
  function wetland() {
    const built = wetlandBuilt()
    const undo = showPieceWater('wetland', built, 'mid')
    const [lake, river, fall] = built.bodies
    return { built, lake, river, fall, undo, visible: [lake, river, fall].map((b) => b.mesh.visible) }
  }

  it('builds the hidden bodies’ shaders ahead, once, and leaves a failed compile (rejecting or throwing) to the draw', async () => {
    const { built, visible } = wetland()
    expect(visible).toEqual([true, false, false])
    const by = renderer(programsOf(built))
    await precompileWater(built, by, camera, scene)
    expect(by.compileAsync).toHaveBeenCalledTimes(1)
    expect(by.compileAsync).toHaveBeenCalledWith(built.root, camera, scene)
    for (const compileAsync of [vi.fn(() => Promise.reject(new Error('no compile'))), vi.fn(() => { throw new Error('no compile') })]) {
      await expect(precompileWater(built, renderer(new Map(), compileAsync), camera, scene)).resolves.toBeUndefined()
      expect(compileAsync).toHaveBeenCalledTimes(1)
    }
  })

  it.each([['lake', 'none'], ['river', 'none'], ['river', 'before'], ['fall', 'before']] as const)('gives the piece up once its shaders are built, when the %s’s program didn’t link (dock %s), and keeps it when all built', async (which, dock) => {
    setFlowDock(dock) // docked before: every body is drawn from the first frame, off screen
    const w = wetland()
    const programs = programsOf(w.built, (mesh) => mesh === w[which].mesh)
    const broken = vi.fn()
    const done = precompileWater(w.built, renderer(programs), camera, scene, broken)
    expect(broken).not.toHaveBeenCalled()
    await done
    expect(broken).toHaveBeenCalledTimes(1)
    expect(programs.get(w[which].mesh.material)!.getUniforms).toHaveBeenCalled()
    const ok = vi.fn()
    await precompileWater(w.built, renderer(programsOf(w.built)), camera, scene, ok)
    expect(ok).not.toHaveBeenCalled()
  })

  it('checks after a compile that failed too: a body left without a program is one the draw can’t use', async () => {
    const { built, river } = wetland()
    const programs = programsOf(built)
    programs.delete(river.mesh.material)
    const broken = vi.fn()
    await precompileWater(built, renderer(programs, vi.fn(() => Promise.reject(new Error('no compile')))), camera, scene, broken)
    expect(broken).toHaveBeenCalledTimes(1)
  })

  it('checks the build’s own materials, not the copies a rising piece’s Fader dresses the meshes in meanwhile', async () => {
    const { built } = wetland()
    const own = built.meshes.map((mesh) => mesh.material)
    const by = renderer(programsOf(built))
    const done = precompileWater(built, by, camera, scene, vi.fn())
    for (const body of built.bodies) body.mesh.material = body.mesh.material.clone()
    await done
    expect(by.properties.get.mock.calls.map(([m]) => m)).toEqual(own)
  })

  it('says nothing for a build that has gone by the time its shaders are in (its materials disposed)', async () => {
    const { built, undo } = wetland()
    const by = renderer(new Map())
    const broken = vi.fn()
    const done = precompileWater(built, by, camera, scene, broken)
    undo()
    await done
    expect(broken).not.toHaveBeenCalled()
    expect(by.properties.get).not.toHaveBeenCalled()
  })
})
