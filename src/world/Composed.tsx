import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { WithModel } from './Asset'
import type { PieceId } from './blueprint'
import {
  batchFeet,
  composedOn,
  drawsFar,
  farEverywhere,
  farModelOf,
  loadCompositionItems,
  modelParts,
  nearestFoot,
  pieceBatches,
  readyRibbons,
  showRuns,
  type Batch,
  type CompositionItems,
} from './composition'
import { COMPOSITION_META } from './composition.meta'
import type { DockedIsland } from './pieces'
import { composedPart, type Version } from './composedParts'

// The art session's composition drawn on a piece (see composition.ts): its
// trees, shrubs, rocks, flowers and grass as one InstancedMesh per asset per
// mesh of the asset's model, and its path ribbons, all inside the piece's own
// group, so they rise, fade in and dock with it. A batch of trees is drawn
// from its far models once it is far from the camera, and always on a phone
// (TreeBatch). The instances stand where they are put once, and are never
// moved again; the crowns sway and the grass leans in the vertex shader
// (wind.ts).

/** What the composition has drawn, for tests: each piece's items, by asset, and the path runs showing on each piece whose ribbons are in. UI only. */
export const useComposedStore = create<{ drawn: Partial<Record<PieceId, Record<string, number>>>; paths: Partial<Record<PieceId, string[]>> }>(() => ({
  drawn: {},
  paths: {},
}))

/** How many trees the composition draws now, on every piece, for the Farm panel's count. */
export const useComposedTrees = (): number =>
  useComposedStore((s) =>
    Object.values(s.drawn).reduce((n, byAsset) => n + Object.entries(byAsset ?? {}).reduce((m, [asset, count]) => m + (COMPOSITION_META.assets[asset]?.category === 'trees' ? count : 0), 0), 0),
  )

function reportDrawn(piece: PieceId, asset: string, count: number | null) {
  useComposedStore.setState((s) => {
    const mine = { ...s.drawn[piece] }
    if (count === null) delete mine[asset]
    else mine[asset] = count
    return { drawn: { ...s.drawn, [piece]: Object.keys(mine).length ? mine : undefined } }
  })
}

function reportPaths(piece: PieceId, runs: string[] | null) {
  useComposedStore.setState((s) => ({ paths: { ...s.paths, [piece]: runs ?? undefined } }))
}

let itemsIn: CompositionItems | null = null

/** Every item of the composition, once loaded (the first piece to draw it loads it). */
function useCompositionItems(wanted: boolean): CompositionItems | null {
  const [items, setItems] = useState(itemsIn)
  useEffect(() => {
    if (!wanted || items) return
    let live = true
    void loadCompositionItems().then((all) => {
      itemsIn = all
      if (live) setItems(all)
    })
    return () => {
      live = false
    }
  }, [wanted, items])
  return items
}

/**
 * One asset's items on a piece, from a model of it: an InstancedMesh for each
 * of the model's meshes, drawn while `shown`. `onIn` hears when they join the
 * scene and when they leave it.
 */
function Instances({
  batch,
  scene,
  island,
  version = 'near',
  shown = true,
  onIn,
}: {
  batch: Batch
  scene: THREE.Group
  island: DockedIsland
  version?: Version
  shown?: boolean
  onIn?: (isIn: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const meshes = useMemo(() => {
    const conifer = scene.getObjectByName('Crown') !== undefined
    return modelParts(scene).map((part) => composedPart(batch, part, conifer, island.height, version))
  }, [batch, scene, island, version])
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes])
  useLayoutEffect(() => {
    onIn?.(true)
    return () => onIn?.(false)
  }, [onIn])
  // Shown or hidden between frames (frameloop "demand"): draw one for it.
  useLayoutEffect(() => invalidate(), [shown, invalidate])
  return (
    <>
      {meshes.map((m) => (
        <primitive key={m.uuid} object={m} visible={shown} />
      ))}
    </>
  )
}

/** Reports a batch's items drawn on its piece while it is mounted. */
function Drawn({ piece, batch }: { piece: PieceId; batch: Batch }) {
  useEffect(() => {
    reportDrawn(piece, batch.asset, batch.items.length)
    return () => reportDrawn(piece, batch.asset, null)
  }, [piece, batch])
  return null
}

/** A batch with one model: the shrubs, rocks, flowers and grass. */
function OneModelBatch({ piece, batch, island }: { piece: PieceId; batch: Batch; island: DockedIsland }) {
  return (
    <WithModel id={batch.asset}>
      {(scene) => (
        <>
          <Instances batch={batch} scene={scene} island={island} />
          <Drawn piece={piece} batch={batch} />
        </>
      )}
    </WithModel>
  )
}

/**
 * Whether the trees are drawn far everywhere here: on a phone, held either
 * way up (farEverywhere). The screen is the device's, so turning it changes
 * nothing; a mouse plugged in or taken out does.
 */
export function useFarEverywhere(): boolean {
  const coarse = useMediaQuery('(pointer: coarse)')
  return typeof screen !== 'undefined' && farEverywhere(coarse, screen)
}

/** Which of a tree batch's models it wants drawn now, and which it has wanted so far (and so loaded, or is loading). */
interface Choice {
  far: boolean
  wanted: Record<Version, boolean>
}

const eye = new THREE.Vector3()

/**
 * A batch of trees, drawn from its near models or its far ones: far once its
 * nearest tree is FAR_SWITCH.in from the camera, near again within
 * FAR_SWITCH.out, as the frame is drawn; and far everywhere on a phone. Each
 * model loads the first time it's wanted, and stays from then on, so turning
 * back is instant; while the wanted one loads, the other stays drawn. The far
 * models are drawn with their own small textures (art/BLUEPRINT.md, "Far
 * versions"), so a phone never loads the near ones' at all.
 */
function TreeBatch({ piece, batch, island, far: farId, phone }: { piece: PieceId; batch: Batch; island: DockedIsland; far: string; phone: boolean }) {
  const group = useRef<THREE.Group>(null)
  const invalidate = useThree((s) => s.invalidate)
  const feet = useMemo(() => batchFeet(batch.items, island.height, COMPOSITION_META.assets[batch.asset]?.yOffset ?? 0), [batch, island])
  const [choice, setChoice] = useState<Choice | null>(() => (phone ? { far: true, wanted: { near: false, far: true } } : null))
  const farNow = useRef<boolean | null>(choice?.far ?? null)
  useFrame(({ camera }) => {
    const g = group.current
    if (!g) return
    // In the piece's own frame, where the feet are: the piece may still be rising into place.
    const far = drawsFar(farNow.current ?? false, phone ? 0 : nearestFoot(feet, g.worldToLocal(eye.copy(camera.position))), phone)
    if (far === farNow.current) return
    farNow.current = far
    setChoice((c) => ({ far, wanted: { near: !!c?.wanted.near || !far, far: !!c?.wanted.far || far } }))
  })
  // The first frame decides which to load: draw one.
  useLayoutEffect(() => invalidate(), [invalidate])
  const [isIn, setIsIn] = useState<Record<Version, boolean>>({ near: false, far: false })
  const nearIn = useCallback((v: boolean) => setIsIn((s) => ({ ...s, near: v })), [])
  const farIn = useCallback((v: boolean) => setIsIn((s) => ({ ...s, far: v })), [])
  // The wanted model once it's in, the other until then.
  const want: Version = choice?.far ? 'far' : 'near'
  const other: Version = want === 'far' ? 'near' : 'far'
  const drawn: Version | null = !choice ? null : isIn[want] ? want : isIn[other] ? other : null
  return (
    <group ref={group}>
      {drawn && <Drawn piece={piece} batch={batch} />}
      {choice?.wanted.near && (
        <WithModel id={batch.asset}>{(scene) => <Instances batch={batch} scene={scene} island={island} shown={drawn === 'near'} onIn={nearIn} />}</WithModel>
      )}
      {choice?.wanted.far && (
        <WithModel id={farId}>{(scene) => <Instances batch={batch} scene={scene} island={island} version="far" shown={drawn === 'far'} onIn={farIn} />}</WithModel>
      )}
    </group>
  )
}

/**
 * The composition's trees, shrubs, rocks, flowers and grass on a piece: drawn
 * inside the piece's group, on its baked ground. Nothing while the switch is
 * off, or on a piece drawn from its procedural stand-in.
 */
export function Composition({ piece, island }: { piece: PieceId; island: DockedIsland }) {
  const on = composedOn(island)
  const items = useCompositionItems(on)
  const phone = useFarEverywhere()
  const batches = useMemo(() => (items && on ? pieceBatches(piece, items, island) : []), [items, on, piece, island])
  return (
    <group name={`composition_${piece}`}>
      {batches.map((batch) => {
        const far = farModelOf(batch.asset)
        return far ? (
          <TreeBatch key={batch.asset} piece={piece} batch={batch} island={island} far={far} phone={phone} />
        ) : (
          <OneModelBatch key={batch.asset} piece={piece} batch={batch} island={island} />
        )
      })}
    </group>
  )
}

/** A piece's ribbons, from its own model (no other use of it): the runs shown for the pieces in the world, the rest hidden. */
function Ribbons({ piece, scene, present }: { piece: PieceId; scene: THREE.Group; present: readonly PieceId[] }) {
  const invalidate = useThree((s) => s.invalidate)
  const root = useMemo(() => {
    const copy = scene.clone(true)
    readyRibbons(copy)
    return copy
  }, [scene])
  const key = present.join(' ')
  useLayoutEffect(() => {
    const runs = showRuns(root, piece, key ? (key.split(' ') as PieceId[]) : [])
    invalidate()
    reportPaths(piece, runs)
  }, [root, piece, key, invalidate])
  useEffect(() => () => reportPaths(piece, null), [piece])
  return <primitive object={root} />
}

/**
 * A piece's path ribbons (public/models/paths_<piece>.glb), on its baked
 * ground: each run shows once every piece it needs is in the world, rising
 * or docked, and stays hidden for pieces never bought. `present` is the
 * pieces in the world besides the farm, which is always there.
 */
export function PathRibbons({ piece, island, present }: { piece: PieceId; island: DockedIsland; present: readonly PieceId[] }) {
  if (!composedOn(island) || !COMPOSITION_META.paths[piece].length) return null
  return <WithModel id={`paths_${piece}`}>{(scene) => <Ribbons piece={piece} scene={scene} present={present} />}</WithModel>
}
