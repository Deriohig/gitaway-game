import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useGame } from '../../store/game'
import type { IsleId } from '../layout'
import { buildPieceWater, precompileWater, showPieceWater, waterWithout, watchWaterPrograms } from './build'
import { askForWater, disposeWater, giveUpOnWater, waterPiece, waterPiecesFor, type LoadedWater } from './load'
import type { WaterPieceId } from './report'
import { useWaterTier } from './tier'

/**
 * A piece's baked water (spec §4.2), drawn by the patched water material from
 * the art's maps: MAIN's pond and stream as one surface (R1.3) and its farm
 * fall; the wetland's lake, its river and outflow as one ribbon, and its fall;
 * the highland's tarn, and its hot spring while the farm owns the Hot spring
 * (build.ts OWNED_WATER: a body drawn only with its thing, the piece rebuilt
 * without it, or with it once bought). It asks for the piece's water once
 * (load.ts waterPiece; the world has asked already, useAskForWater). Until
 * that is in, and for good if it fails, `legacy` (today's water for the piece)
 * is drawn in its place: nothing waits on it. Once in, its bodies are drawn in
 * the piece's frame (the piece's group places them, I7), the driver fills,
 * retreats and shows the flowing ones from the wetland's dock (water/driver.ts),
 * and the programs of the ones hidden until then are built ahead
 * (build.ts precompileWater). Each body's shader is checked once it is built,
 * drawn or hidden (precompileWater: a wetland docked before has its river and
 * fall in the world, off screen), and again after its first draw: if the GPU
 * couldn't build it, the piece gives the baked water up, draws `legacy` again
 * and then lets the baked water's meshes and maps go (build.ts
 * watchWaterPrograms, load.ts giveUpOnWater and disposeWater). The other pieces
 * keep theirs. Either way it
 * reports what it draws and at which tier (report.ts, `main:v2:pond,fall` or
 * `main:legacy`; the world element's `data-water` and `data-water-tier`), and
 * the dressing follows that (MainIsland.tsx, WildIsles.tsx). It also mounts
 * the tier, so the readout has it.
 */
export function PieceWater({ piece, legacy }: { piece: WaterPieceId; legacy: ReactNode }) {
  const tier = useWaterTier()
  const [loaded, giveUp] = useLoadedWater(piece)
  const without = useWaterWithout(piece)
  const built = useMemo(() => (loaded ? buildPieceWater(piece, loaded, tier, without) : null), [piece, loaded, tier, without])
  const get = useThree((s) => s.get)
  // Before the frame is drawn, so the dressing changes with the water.
  useLayoutEffect(() => showPieceWater(piece, built, tier), [piece, built, tier])
  // Before its first draw too, which the check follows; and the bodies' programs, built and checked from the build's
  // own materials before a rising piece's Fader dresses them in copies.
  useLayoutEffect(() => (built ? watchWaterPrograms(piece, built, giveUp) : undefined), [piece, built, giveUp])
  useLayoutEffect(() => {
    if (!built) return
    const { gl, camera, scene } = get()
    void precompileWater(built, gl, camera, scene, giveUp)
  }, [built, get, giveUp])
  if (!built) return <>{legacy}</>
  return <primitive object={built.root} />
}

/** The nodes of a piece's bodies left undrawn for what the farm owns (build.ts waterWithout): the same list until that changes. */
function useWaterWithout(piece: WaterPieceId): readonly string[] {
  const key = useGame((s) => waterWithout(piece, s.game.owned).join(' '))
  return useMemo(() => (key ? key.split(' ') : []), [key])
}

/** A piece's water as the piece has it, and what it gave up on (to let go of once today's water is drawn). */
interface Held {
  /** The water once it is in, null if it failed or was given up on, and undefined while it loads. */
  loaded: LoadedWater | null | undefined
  dropped?: LoadedWater
}

/**
 * A piece's baked water once it is in, null if it failed or was given up on,
 * and undefined while it loads; and the give-up, for a shader the GPU couldn't
 * build. A water given up on is let go of (disposeWater) after the commit that
 * puts today's water in its place, when nothing draws it any more.
 */
function useLoadedWater(piece: WaterPieceId): [LoadedWater | null | undefined, () => void] {
  const [held, setHeld] = useState<Held>({ loaded: undefined })
  useEffect(() => {
    let live = true
    void waterPiece(piece).then((water) => {
      if (live) setHeld((h) => ({ ...h, loaded: water }))
    })
    return () => {
      live = false
    }
  }, [piece])
  const giveUp = useCallback(() => {
    giveUpOnWater(piece)
    setHeld((h) => ({ loaded: null, dropped: h.loaded ?? h.dropped }))
  }, [piece])
  useEffect(() => {
    if (held.dropped) disposeWater(held.dropped)
  }, [held.dropped])
  return [held.loaded, giveUp]
}

/**
 * Asks for the baked water of the farm and of each piece it has (`inWorld`,
 * the pieces in the world: load.ts waterPiecesFor and askForWater), with the
 * ground: MAIN's and each owned piece's as the world mounts, and a bought
 * piece's when it is bought. So each counts among the world's models from when
 * its ground is needed, and a piece not bought is never fetched. Nothing with
 * the water switch off.
 */
export function useAskForWater(inWorld: readonly IsleId[]): void {
  const key = waterPiecesFor(inWorld).join(' ')
  useEffect(() => askForWater(key.split(' ') as WaterPieceId[]), [key])
}
