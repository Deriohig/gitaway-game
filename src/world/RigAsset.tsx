import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Asset, Fallback, loadManifest } from './Asset'
import { holdModel, prepareModel } from './assetMaterials'
import { useMotion } from './motion'
import { loadRigs, rigEntryFor, type RigEntry } from './rigs/data'
import { RigController } from './rigs/RigController'

// An animal drawn from its rig (public/models/rigs.json, beside the manifest),
// skinned and playing its clips, in place of the plain model for `id`. Without
// a rig for it, or if the rig fails to load, the plain model is drawn as before
// (and the stand-in until that's in).

interface RigAssetProps {
  /** The model the game asks for: `dog`, `sheep`, `visitor_hare`. */
  id: string
  fallback: ReactNode
  /** A colour multiplier for this copy alone (see coats.ts). Pass the same Color each time. */
  tint?: THREE.Color
  /** For the plain model, if that's drawn instead: its named parts, as Asset hands them. */
  onLoad?: (root: THREE.Object3D) => void
  /** The rig's controller once it's in, and null once it's gone. Pass the same function each time. */
  onRig?: (rig: RigController | null) => void
  /** Sets this copy's own timing, so two of the same animal never move in step. */
  seed?: number
}

/** The rig entry for `id`, once rigs.json and the manifest are in: null if it has none. */
function useRigEntry(id: string): RigEntry | null | undefined {
  const [entry, setEntry] = useState<RigEntry | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void Promise.all([loadRigs(), loadManifest()]).then(([rigs, assets]) => {
      if (live) setEntry(rigEntryFor(rigs, id, assets[id]?.file))
    })
    return () => {
      live = false
    }
  }, [id])
  return entry
}

export function RigAsset({ id, fallback, tint, onLoad, onRig, seed = 0 }: RigAssetProps) {
  const entry = useRigEntry(id)
  if (entry === undefined) return <>{fallback}</>
  const plain = <Asset id={id} fallback={fallback} onLoad={onLoad} tint={tint} />
  if (!entry) return plain
  return (
    <Fallback fallback={plain}>
      <Suspense fallback={fallback}>
        <RigModel url={`${import.meta.env.BASE_URL}models/${entry.file}`} entry={entry} tint={tint} seed={seed} onRig={onRig} />
      </Suspense>
    </Fallback>
  )
}

const frustum = new THREE.Frustum()
const viewProjection = new THREE.Matrix4()
const bounds = new THREE.Sphere()

/** Whether the rig's (grown) bounds are in the camera's view: an animal off screen isn't played (GAME-NOTE "Performance"). */
function inView(camera: THREE.Camera, mesh: THREE.SkinnedMesh | null): boolean {
  if (!mesh?.boundingSphere) return true
  frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
  return frustum.intersectsSphere(bounds.copy(mesh.boundingSphere).applyMatrix4(mesh.matrixWorld))
}

function RigModel({ url, entry, tint, seed, onRig }: { url: string; entry: RigEntry; tint?: THREE.Color; seed: number; onRig?: (rig: RigController | null) => void }) {
  // No Draco or meshopt: rigs are plain .glb, like the models. The clips come with them, shared by every copy.
  const { scene, animations } = useGLTF(url, false, false)
  const root = useMemo(() => prepareModel(scene, tint), [scene, tint])
  const rig = useMemo(() => new RigController(root, animations, entry, seed), [root, animations, entry, seed])
  useEffect(() => holdModel(root), [root])
  useEffect(() => () => rig.dispose(), [rig])
  useEffect(() => {
    onRig?.(rig)
    return () => onRig?.(null)
  }, [rig, onRig])
  const motion = useMotion()
  // Drawn on the Ticker's beat like everything else (World.tsx): a rig never asks for a frame of its own.
  useFrame(({ camera }, dt) => rig.update(dt, motion, inView(camera, rig.mesh)))
  return <primitive object={root} />
}
