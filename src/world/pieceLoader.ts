import * as THREE from 'three'
import { useEffect } from 'react'
import { GLTFLoader } from 'three-stdlib'
import { create } from 'zustand'
import { loadManifest } from './Asset'
import { piecesInPlay, type DockId, type PieceId } from './blueprint'
import { ISLES, MAIN } from './layout'
import { bakedIsland, parseHeightGrid, type DockedIsland, type HeightGridInfo } from './pieces'
import { pieceMat } from './materials'
import { takeSkirts } from './skirts'
import type { Island } from './terrain'

// Loading the baked island pieces (art/BLUEPRINT.md, "Baked pieces"): each
// piece's mesh and height grid, listed in public/models/manifest.json as
// `piece_<id>`. A piece that isn't listed, fails to load, or is still loading
// PIECE_TIMEOUT_MS after the farm needs it stays procedural for good, so
// nothing placed on it moves. The farm is drawn once its own piece and the
// pieces in it are in (see World.tsx); the others load in the background, and
// one bought before its files are in waits for them before it rises (see
// Isles.tsx).

export type PieceSource = 'baked' | 'procedural'

interface PieceEntry {
  file: string
  status: 'draft' | 'ready'
  height?: HeightGridInfo
}

/** How long a piece's files may take before it is drawn from its procedural stand-in instead. */
export const PIECE_TIMEOUT_MS = 8000

/** Which pieces have loaded, and from what, and whether the farm has been drawn. UI only, never saved. */
export const usePieceStore = create<{ sources: Partial<Record<PieceId, PieceSource>>; drawn: boolean }>(() => ({ sources: {}, drawn: false }))

const islandOf = (id: PieceId): DockedIsland => (id === 'main' ? MAIN : ISLES[id].island)

const url = (file: string) => `${import.meta.env.BASE_URL}models/${file}`

async function fetchPiece(id: PieceId) {
  const assets = (await loadManifest()) as Record<string, PieceEntry | undefined>
  const entry = assets[`piece_${id}`]
  if (entry?.status !== 'ready' || !entry.height) return null
  const info = entry.height
  const [gltf, buffer] = await Promise.all([
    new GLTFLoader().loadAsync(url(entry.file)),
    fetch(url(info.file)).then((r) => {
      if (!r.ok) throw new Error(`${info.file}: ${r.status}`)
      return r.arrayBuffer()
    }),
  ])
  // Its cliff skirts, if the piece has any, come out first: the mesh left is its ground.
  const skirts = takeSkirts(gltf.scene, pieceMat)
  let mesh: THREE.Mesh | null = null
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
  })
  if (!mesh) throw new Error(`${entry.file} has no mesh`)
  const found = mesh as THREE.Mesh
  const geometry = found.geometry
  // The piece is drawn in its own coordinates, so any node transform is baked in.
  if (!found.matrixWorld.equals(new THREE.Matrix4())) geometry.applyMatrix4(found.matrixWorld)
  geometry.computeBoundingSphere()
  ;(found.material as THREE.Material).dispose()
  return bakedIsland(id, geometry, parseHeightGrid(info, buffer), skirts)
}

/** Each piece's ground once settled, baked or procedural: settled once, for good. */
const settled = new Map<PieceId, Promise<PieceSource>>()
/** Settles a piece that hasn't settled yet, with its baked Island or null for its stand-in. */
const settle = new Map<PieceId, (island: Island | null) => void>()

/** Fetches a piece's files, once, and settles it with them when they're in (or have failed). */
function track(id: PieceId) {
  if (settled.has(id)) return
  settled.set(
    id,
    new Promise<PieceSource>((resolve) => {
      settle.set(id, (island) => {
        // Only the first word counts: files that turn up after the stand-in was drawn are left be.
        if (!settle.delete(id)) return
        islandOf(id).use(island)
        const source: PieceSource = island ? 'baked' : 'procedural'
        usePieceStore.setState((s) => ({ sources: { ...s.sources, [id]: source } }))
        resolve(source)
      })
    }),
  )
  void fetchPiece(id)
    .catch((error: unknown) => {
      console.warn(`The ${id} piece didn't load, so it is drawn procedurally.`, error)
      return null
    })
    .then((island) => settle.get(id)?.(island))
}

/**
 * Starts loading a piece in the background, once, and hands it to its island
 * (MAIN or ISLES) when its files are in or have failed. Resolves to where its
 * ground came from. A slow load holds nothing up until the piece is needed.
 */
export function loadPiece(id: PieceId): Promise<PieceSource> {
  track(id)
  return settled.get(id)!
}

const needed = new Set<PieceId>()

/**
 * A piece the farm needs now (its own, one it has, one just bought): loaded as
 * loadPiece does, but given PIECE_TIMEOUT_MS from now, after which it is drawn
 * from its procedural stand-in for good, so nothing placed on it moves.
 */
export function needPiece(id: PieceId): Promise<PieceSource> {
  track(id)
  if (!needed.has(id)) {
    needed.add(id)
    setTimeout(() => {
      if (!settle.has(id)) return
      console.warn(`The ${id} piece's files took longer than ${PIECE_TIMEOUT_MS / 1000} s, so it is drawn procedurally.`)
      settle.get(id)?.(null)
    }, PIECE_TIMEOUT_MS)
  }
  return settled.get(id)!
}

/** The pieces the farm waits for before it is drawn: its own, and those in it now. The rest never hold it up. */
export function piecesToWaitFor(inWorld: readonly DockId[]): PieceId[] {
  return ['main', ...inWorld]
}

/** Whether a piece has loaded, or fallen back to its stand-in: what a bought piece waits for before it rises. */
export const usePieceLoaded = (id: PieceId): boolean => usePieceStore((s) => s.sources[id] !== undefined)

/**
 * Starts loading every piece in play and says whether the farm can be drawn:
 * once the saved farm has been read and its own piece, and each piece in it,
 * has loaded or fallen back. Pieces still to buy load in the background; one
 * bought is needed from then on. Once drawn, the farm stays drawn, whatever
 * is bought next.
 */
export function useFarmDrawn(inWorld: readonly DockId[], farmLoaded: boolean): boolean {
  const waitFor = piecesToWaitFor(inWorld)
  const play = piecesInPlay().join(' ')
  const need = waitFor.join(' ')
  useEffect(() => {
    for (const id of play.split(' ') as PieceId[]) void loadPiece(id)
  }, [play])
  useEffect(() => {
    // Before the saved farm is read, the pieces it has aren't known: only the farm's own is needed yet.
    for (const id of need.split(' ') as PieceId[]) void needPiece(id)
  }, [need])
  const ready = usePieceStore((s) => farmLoaded && waitFor.every((id) => s.sources[id] !== undefined))
  const drawn = usePieceStore((s) => s.drawn)
  useEffect(() => {
    if (ready && !drawn) usePieceStore.setState({ drawn: true })
  }, [ready, drawn])
  return drawn || ready
}
