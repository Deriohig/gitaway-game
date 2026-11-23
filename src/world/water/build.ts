import * as THREE from 'three'
import type { ItemId } from '../../game/config'
import { patchOptsFor } from './core'
import { registerWaterBodies, sessionWaterUniforms } from './driver'
import { fillPlan, type FillPlan } from './fill'
import type { LoadedWater } from './load'
import { waterReadout, type WaterReadout } from './readout'
import { setWaterReport, type WaterPieceId } from './report'
import type { WaterTierName } from './tier'
import type { BuiltBody, SharedWaterUniforms, WaterSurfaceKind } from './types'
import { bodyUniforms, createWaterMaterial } from './waterMaterial'

// A piece's baked water, built from its load and shown in the world
// (PieceWater.tsx draws it): plain functions, so they run in tests.

/**
 * The render order of each kind of surface (spec §4.2's table): after the path
 * ribbons (1), still water, then the ribbons, then the falls (and the ripples
 * and mist between and after them).
 */
export const RENDER_ORDER = { still: 2, ribbon: 3, fall: 5 } as const satisfies Record<WaterSurfaceKind, number>

/**
 * A piece's water as drawn: one mesh per surface under a group that stands at
 * the origin of the piece's own frame, the session's shared uniforms they all
 * read, each surface as a body for the driver, and the piece's fills (when
 * each body is drawn, from the wetland's dock: fill.ts).
 */
export interface BuiltWater {
  root: THREE.Group
  meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>[]
  shared: SharedWaterUniforms
  bodies: BuiltBody[]
  plan: FillPlan
}

/**
 * The bodies of a piece's water drawn only while the farm owns a thing
 * (config.ts ITEMS), by node: the highland's hot spring, with the Hot spring.
 * Main draws no spring water, with the item or without it (the item has no
 * model of its own), so the baked spring is drawn only once it is owned:
 * nothing appears that the player didn't buy, and without it the highland is
 * as main draws it, its tarn alone.
 */
export const OWNED_WATER: { readonly [P in WaterPieceId]?: Readonly<Record<string, ItemId>> } = { highland: { water_spring: 'hotSpring' } }

/** The nodes of a piece's bodies left undrawn for what the farm owns (its save's counts): OWNED_WATER's whose thing it has none of. */
export function waterWithout(piece: WaterPieceId, owned: Readonly<Partial<Record<ItemId, number>>>): string[] {
  return Object.entries(OWNED_WATER[piece] ?? {})
    .filter(([, item]) => !((owned[item] ?? 0) > 0))
    .map(([node]) => node)
}

/**
 * The meshes of a piece's water for a tier: each surface's mesh with its own
 * water material, all on the session's one set of shared uniforms (I1), but
 * the ones `without` names (by node: waterWithout's, for what the farm owns).
 * The root stands at the origin: the meshes are in the piece's frame, and the
 * piece's group places it (I7; MAIN's frame is the world's). Every surface is
 * transparent, drawn in its kind's RENDER_ORDER, never casts a shadow and
 * receives them on mid only (spec §4.2 and §5); its material says whether it
 * writes depth (a fall doesn't).
 */
export function buildPieceWater(piece: WaterPieceId, loaded: LoadedWater, tier: WaterTierName, without: readonly string[] = []): BuiltWater {
  const shared = sessionWaterUniforms(loaded.json)
  const root = new THREE.Group()
  root.name = `water:${piece}`
  const drawn = loaded.bodies.filter(({ body }) => !without.includes(body.node))
  const bodies = drawn.map(({ body, geometry, parts }): BuiltBody => {
    const { kind } = patchOptsFor(body, tier)
    const material = createWaterMaterial(piece, body, shared, loaded, tier)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = body.node
    mesh.renderOrder = RENDER_ORDER[kind]
    mesh.castShadow = false
    mesh.receiveShadow = tier === 'mid'
    root.add(mesh)
    return { name: body.node, kind, mesh, uniforms: bodyUniforms(material)!, parts }
  })
  return { root, meshes: bodies.map((b) => b.mesh), shared, bodies, plan: fillPlan(loaded.json.pieces[piece].bodies) }
}

/** What a body is called in the report: its node without the `water_` (water_pond is `pond`). */
const reportName = (node: string) => node.replace(/^water_/, '')

/** The names a piece's bodies have in the readout (`main:water_pond`). */
const readoutNames = (piece: WaterPieceId, built: BuiltWater) => built.meshes.map((m) => `${piece}:${m.name}`)

function unlist(readout: WaterReadout, list: 'bodies' | 'compiled', names: string[]) {
  readout[list] = readout[list].filter((b) => !names.includes(b))
}

/**
 * Shows a piece's water, for as long as it is drawn: its bodies are listed in
 * the readout (`window.__water`, which this makes sure is there even when the
 * piece falls back), and the piece reports `<piece>:v2:<bodies>`, drawn at
 * `tier`. With nothing built (the water loading, or failed), it reports
 * `<piece>:legacy` (at the device's tier still). The driver steps the
 * session's shared uniforms whichever pieces are shown: nothing of them is
 * handed over here. Its bodies are registered with the driver, with the
 * piece's fills, which draws them as the flow from the wetland's dock has
 * them from now on (the readout's `shown`). Returns the undo, for an effect's
 * cleanup: it takes all that back and disposes the meshes' materials, which
 * are the build's own. The meshes' geometry, the map and the noise stay: they
 * are the load's, which is kept for the session (load.ts waterPiece), and the
 * next build (another tier, a remount) draws them again.
 */
export function showPieceWater(piece: WaterPieceId, built: BuiltWater | null, tier: WaterTierName): () => void {
  const readout = waterReadout()
  if (!built) {
    setWaterReport(piece, `${piece}:legacy`, tier)
    return () => setWaterReport(piece, null)
  }
  const names = readoutNames(piece, built)
  unlist(readout, 'bodies', names)
  readout.bodies.push(...names)
  setWaterReport(piece, `${piece}:v2:${built.meshes.map((m) => reportName(m.name)).join(',')}`, tier)
  const unregister = registerWaterBodies(piece, built.bodies, built.plan)
  shown.add(built)
  return () => {
    shown.delete(built)
    unregister()
    unlist(readout, 'bodies', names)
    setWaterReport(piece, null)
    for (const mesh of built.meshes) mesh.material.dispose()
  }
}

/** The builds shown now (showPieceWater): their materials are live, and theirs to judge (precompileWater). */
const shown = new WeakSet<BuiltWater>()

// ---- a shader the GPU can't build -------------------------------------------------

/**
 * What the check reads of a program three has built for a material (three's
 * WebGLProgram): its diagnostics, which three keeps while it checks shader
 * errors (`renderer.debug.checkShaderErrors`, on by default) whenever the
 * program didn't link or its compiler had something to say.
 */
export interface WaterProgramState {
  diagnostics?: { runnable: boolean } | null
}

/**
 * Whether the water can't be drawn with the program three has for it after
 * its first draw: three found that the program didn't compile or link (its
 * diagnostics say it can't run), or there is no program for it at all. A
 * program that built cleanly has no diagnostics, and one whose compiler only
 * warned can run.
 */
export function waterProgramBroken(program: WaterProgramState | undefined): boolean {
  return !program || program.diagnostics?.runnable === false
}

/**
 * Watches the first draw of each of a piece's meshes. By the end of it three
 * has built the mesh's program and checked it; a program the GPU couldn't
 * build (a phone's driver that fails to compile or link the water's shader)
 * draws nothing, which would leave a hole where the pond is. Then `broken` is
 * called, once for the build, and the piece goes back to today's water
 * (PieceWater.tsx). A body whose program built is listed in the readout's
 * `compiled` (`main:water_pond`). Each mesh is looked at once, after its first
 * draw with its own material, and not again: a draw with another material (an
 * override or depth pass) says nothing of the water's program, so it neither
 * gives the water up nor uses the look. Returns the undo, which stops the
 * watch and takes the bodies out of `compiled`.
 */
export function watchWaterPrograms(piece: WaterPieceId, built: BuiltWater, broken: () => void): () => void {
  const readout = waterReadout()
  const compiled: string[] = []
  let told = false
  const restores = built.meshes.map((mesh) => {
    const own = mesh.onAfterRender
    const restore = () => {
      mesh.onAfterRender = own
    }
    mesh.onAfterRender = (renderer, scene, camera, geometry, material, group) => {
      own.call(mesh, renderer, scene, camera, geometry, material, group)
      if (material !== mesh.material) return
      restore()
      const { currentProgram } = renderer.properties.get(material) as { currentProgram?: WaterProgramState }
      if (!waterProgramBroken(currentProgram)) {
        const name = `${piece}:${mesh.name}`
        compiled.push(name)
        if (!readout.compiled.includes(name)) readout.compiled.push(name)
      } else if (!told) {
        told = true
        broken()
      }
    }
    return restore
  })
  return () => {
    for (const restore of restores) restore()
    unlist(readout, 'compiled', compiled)
  }
}

// ---- building the shaders ahead (I8) ----------------------------------------------

/** A program as three keeps it for a material, as far as the precompile reads it: its diagnostics, and its first use. */
type ProgramAsBuilt = WaterProgramState & { getUniforms?: () => unknown }

/**
 * Whether a material's program, as three has built it, can't be drawn. Three
 * checks a program's link on its first use (when its uniforms are first asked
 * for, WebGLProgram's onFirstUse), which a compile leaves to the first draw:
 * this asks for it now, as that draw would, so the program's diagnostics are
 * there to read. A material three has no program for can't be drawn either.
 */
function builtBroken(renderer: Pick<THREE.WebGLRenderer, 'properties'>, material: THREE.Material): boolean {
  const { currentProgram } = renderer.properties.get(material) as { currentProgram?: ProgramAsBuilt }
  currentProgram?.getUniforms?.()
  return waterProgramBroken(currentProgram)
}

/**
 * Builds the programs of a piece's water ahead of its draw (I8): one
 * `renderer.compileAsync(built.root, camera, scene)`, with the scene's lights,
 * so that a body hidden until its fill (the wetland's river and fall) doesn't
 * stall the frame it first shows in, on a phone, on a shader compile. It is
 * only a head start: a compile that fails (rejecting, or throwing before its
 * promise) is swallowed, and the draw builds whatever it didn't.
 *
 * Then, with `broken`, every body built is judged as its first draw would
 * judge it (C10): a program that didn't link, or none at all, calls `broken`,
 * once, if the build is still shown. The ones hidden for now are judged so a
 * river the GPU can't build gives the wetland up with its build, not at its
 * dock, where its lake would flip back to today's water; and the ones drawn
 * already (a wetland docked before) too, since the watch
 * (watchWaterPrograms) judges a body only when it is drawn, which one off
 * screen at the default camera may not be for a long while. Call it before
 * the build's first frame, as the watch is: it reads the build's own
 * materials, which a rising piece's Fader then dresses in copies.
 */
export async function precompileWater(
  built: BuiltWater,
  renderer: Pick<THREE.WebGLRenderer, 'compileAsync' | 'properties'>,
  camera: THREE.Camera,
  scene: THREE.Scene,
  broken?: () => void,
): Promise<void> {
  const own = built.meshes.map((mesh) => mesh.material)
  try {
    await renderer.compileAsync(built.root, camera, scene)
  } catch {
    // only a head start: the draw builds it
  }
  // A build gone meanwhile has had its materials disposed: three has nothing of them to judge.
  if (broken && shown.has(built) && own.some((material) => builtBroken(renderer, material))) broken()
}
