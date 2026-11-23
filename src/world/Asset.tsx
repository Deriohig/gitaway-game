import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { holdModel, prepareModel } from './assetMaterials'

// Hand-made models (see art/ASSETS.md) replace the procedural stand-ins as
// they are marked "ready" in public/models/manifest.json. Until then, or if a
// model fails to load, the stand-in is drawn instead.

interface ManifestEntry {
  file: string
  status: 'draft' | 'ready'
}

let manifest: Promise<Record<string, ManifestEntry>> | null = null

export function loadManifest() {
  manifest ??= fetch(`${import.meta.env.BASE_URL}models/manifest.json`)
    .then((r) => (r.ok ? r.json() : { assets: {} }))
    .then((m) => (m?.assets ?? {}) as Record<string, ManifestEntry>)
    .catch(() => ({}))
  return manifest
}

function useReadyUrl(id: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void loadManifest().then((assets) => {
      const entry = assets[id]
      if (live && entry?.status === 'ready') setUrl(`${import.meta.env.BASE_URL}models/${entry.file}`)
    })
    return () => {
      live = false
    }
  }, [id])
  return url
}

/** Draws `fallback` in place of its children if they fail to load. */
export class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

type V3 = [number, number, number]

/** Where the model stands inside the Asset's parent, when it differs from the stand-in. */
export interface ModelPlace {
  position?: V3
  rotation?: V3
  scale?: number | V3
}

interface ModelProps {
  url: string
  onLoad?: (root: THREE.Object3D) => void
  onFrame?: (root: THREE.Object3D, time: number, delta: number) => void
  place?: ModelPlace
  /**
   * A colour multiplier for this copy of the model alone, such as an animal's
   * coat (see coats.ts). Pass the same Color each time: a new one remakes it.
   */
  tint?: THREE.Color
}

function Model({ url, onLoad, onFrame, place, tint }: ModelProps) {
  // No Draco or meshopt: assets are plain .glb, so nothing is fetched from a CDN.
  const { scene } = useGLTF(url, false, false)
  const root = useMemo(() => prepareModel(scene, tint), [scene, tint])
  useEffect(() => holdModel(root), [root])
  useEffect(() => onLoad?.(root), [root, onLoad])
  useFrame(({ clock }, dt) => onFrame?.(root, clock.elapsedTime, dt))
  return <primitive object={root} {...place} />
}

function Loaded({ url, render }: { url: string; render: (scene: THREE.Group) => ReactNode }) {
  const { scene } = useGLTF(url, false, false)
  return <>{render(scene)}</>
}

/**
 * Hands the model for `id`, once it is ready, to `children` as it was loaded:
 * shared with every other use of it, so read it and don't change it. Until
 * then, or if it fails to load, draws `fallback` (nothing by default). For
 * drawing a model some other way than as it is, such as instanced.
 */
export function WithModel({ id, fallback = null, children }: { id: string; fallback?: ReactNode; children: (scene: THREE.Group) => ReactNode }) {
  const url = useReadyUrl(id)
  if (!url) return <>{fallback}</>
  return (
    <Fallback fallback={fallback}>
      <Suspense fallback={fallback}>
        <Loaded url={url} render={children} />
      </Suspense>
    </Fallback>
  )
}

/**
 * Draws the model for `id` once it is ready, otherwise the procedural fallback.
 * `place` moves, turns or scales the model alone, for stand-ins built to another size;
 * `tint` recolours this copy of it alone.
 */
export function Asset({ id, fallback, onLoad, onFrame, place, tint }: { id: string; fallback: ReactNode } & Omit<ModelProps, 'url'>) {
  const url = useReadyUrl(id)
  if (!url) return <>{fallback}</>
  return (
    <Fallback fallback={fallback}>
      <Suspense fallback={fallback}>
        <Model url={url} onLoad={onLoad} onFrame={onFrame} place={place} tint={tint} />
      </Suspense>
    </Fallback>
  )
}
