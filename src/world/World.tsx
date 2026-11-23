import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useProgress } from '@react-three/drei'
import { memo, useEffect, useMemo, useRef } from 'react'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { isOn } from '../game/features'
import { useGame } from '../store/game'
import { Backdrop } from './Backdrop'
import { BLUEPRINT } from './blueprint'
import { useComposedStore } from './Composed'
import { DayCycle, SHADOW_REACH } from './DayCycle'
import { Features } from './features'
import { Fireflies } from './Fireflies'
import { defaultFrame, overviewDistance, riseFrame, shadowReachOf, VIEW } from './framing'
import { Isles, usePresentIsles, useVisibleIsles } from './Isles'
import { MainIsland } from './MainIsland'
import { MotionContext, useAttention, useMotion, usePageHidden, WanderContext, type Attention } from './motion'
import { useFarmDrawn, usePieceStore } from './pieceLoader'
import { ReadyMarkers } from './ReadyMarkers'
import { useRiseState } from './riseState'
import { ShiverDriver } from './ShiverDriver'
import { SkyArt } from './SkyArt'
import { WaterDriver } from './Water'
import { useAskForWater } from './water/PieceWater'
import { useWaterReport, useWaterTierReport } from './water/report'
import { WindDriver } from './wind'

const TARGET = new THREE.Vector3(...VIEW.target)
const VIEW_DIR = new THREE.Vector3(...VIEW.dir).normalize()

/**
 * What moves on the Ticker's beat, outside the scene's useFrame: the camera's
 * glide (CameraRig). Each runs just before the Ticker asks for a frame, so it's
 * drawn in that frame and asks for none of its own. On its own animation frames
 * it would be drawn at the display's rate, past the frame cap; in useFrame the
 * orbit controls would see the camera move and ask for another frame each time.
 */
const beat = new Set<() => void>()

/**
 * Draws frames at a gentle, capped rate instead of every display refresh: the
 * motion level's (see motion.ts), or quiet mode's. Each time, it runs `beat`
 * first, so what moves there (the camera's glide) keeps to the same rate. Still
 * mode has no loop and no beat: it redraws only for changes. While the page is
 * hidden there's no loop at all: no animation frames asked for and no redraws,
 * until it's shown again, when it draws straight away.
 */
function Ticker({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate)
  const hidden = usePageHidden()
  useEffect(() => {
    if (hidden) return
    if (!fps) {
      // Still mode: redraw only for changes, plus once a minute for the light.
      invalidate()
      const id = setInterval(() => invalidate(), 60_000)
      return () => clearInterval(id)
    }
    let raf = 0
    let last = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (t - last >= 1000 / fps - 4) {
        last = t
        beat.forEach((step) => step())
        invalidate()
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [fps, hidden, invalidate])
  return null
}

/**
 * How far back the camera sits (see framing.ts): framing the farm, or easing
 * out while a piece rises into place so it's seen; and how far the player may
 * zoom out.
 */
function useFrameDistance(): { framed: number; furthest: number } {
  const isles = useVisibleIsles()
  const present = usePresentIsles()
  const rising = useRiseState((s) => s.rising)
  const size = useThree((s) => s.size)
  const aspect = size.width / Math.max(1, size.height)
  return useMemo(() => {
    const up = present.filter((id) => rising.includes(id))
    const docked = present.filter((id) => !rising.includes(id))
    return {
      framed: up.length ? riseFrame(docked, up, aspect) : defaultFrame(docked, aspect),
      // Far enough to see the whole island as it is now (on a phone held
      // upright that's further than the framing goes).
      furthest: Math.max(MAX_ZOOM, overviewDistance(isles, aspect)),
    }
  }, [isles, present, rising, aspect])
}

/** How far the player may zoom out, at least. */
const MAX_ZOOM = 140

/** How far out shadows reach: over the farm, and over the middle of every docked piece. */
function useShadowReach(): number {
  const isles = useVisibleIsles()
  return useMemo(() => Math.max(SHADOW_REACH, ...isles.map((id) => shadowReachOf(id))), [isles])
}

/** Keeps the haze beyond the island wherever the camera is, zoomed in or out. */
function FogFollow() {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const update = () => {
      if (!(scene.fog instanceof THREE.Fog)) return
      const d = camera.position.distanceTo(TARGET)
      scene.fog.near = d + 40
      scene.fog.far = d + 230
    }
    update()
    controls?.addEventListener('change', update)
    return () => controls?.removeEventListener('change', update)
  }, [controls, scene, camera])
  return null
}

/** Tells the world element which pieces have loaded and from what (`data-pieces`, e.g. "main:baked meadow:procedural"), for tests. */
function usePiecesReport(): string {
  const sources = usePieceStore((s) => s.sources)
  return Object.entries(sources)
    .map(([id, source]) => `${id}:${source}`)
    .join(' ')
}

/**
 * Tells the world element what the composition has drawn, for tests:
 * `data-composition` the items on each piece (e.g. "main:470 meadow:1234"),
 * and `data-paths` the path runs showing on each piece whose ribbons are in
 * (e.g. "main:to_meadow meadow:to_meadow,meadow_hut"; "main:" when none show).
 */
function useComposedReport(): { composition: string; paths: string } {
  const drawn = useComposedStore((s) => s.drawn)
  const paths = useComposedStore((s) => s.paths)
  return useMemo(
    () => ({
      composition: BLUEPRINT.order
        .filter((id) => drawn[id])
        .map((id) => `${id}:${Object.values(drawn[id]!).reduce((n, c) => n + c, 0)}`)
        .join(' '),
      paths: BLUEPRINT.order
        .filter((id) => paths[id])
        .map((id) => `${id}:${paths[id]!.join(',')}`)
        .join(' '),
    }),
    [drawn, paths],
  )
}

/** Writes the camera's distance, and the distance it's heading for, on the world element, for tests. */
function reportCamera(canvas: HTMLCanvasElement, at: number, framed: number) {
  const world = canvas.closest<HTMLElement>('[data-testid="world"]')
  if (!world) return
  world.dataset.cameraDistance = at.toFixed(1)
  world.dataset.frameDistance = framed.toFixed(1)
}

/** Moves the camera to `distance` back along its view: framing the farm, out to show a piece rising and back, or for a new window shape. */
function CameraRig({ distance }: { distance: number }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const invalidate = useThree((s) => s.invalidate)
  const canvas = useThree((s) => s.gl.domElement)
  const motion = useMotion()
  // Read when the view is next reframed: switching the motion level alone
  // leaves the view as it is, zoomed or turned.
  const motionNow = useRef(motion)
  // The glide under way, if any; finishing it puts the camera where it's heading at once.
  const gliding = useRef<(() => void) | null>(null)
  useEffect(() => {
    motionNow.current = motion
    // Still mode has no beat to glide on (see Ticker): a glide under way ends where it was heading.
    if (motion === 'still') gliding.current?.()
  }, [motion])
  const first = useRef(true)
  useEffect(() => {
    const dir = camera.position.clone().sub(TARGET)
    if (first.current || dir.lengthSq() < 1) {
      first.current = false
      camera.position.copy(TARGET).addScaledVector(VIEW_DIR, distance)
      camera.lookAt(TARGET)
      reportCamera(canvas, distance, distance)
      invalidate()
      return
    }
    if (motionNow.current === 'still') {
      // Nothing moves in still mode: the view is simply framed anew.
      camera.position.copy(TARGET).addScaledVector(dir.normalize(), distance)
      controls?.update()
      reportCamera(canvas, distance, distance)
      invalidate()
      return
    }
    // Glide out (or in) along the current viewing direction, a step on each of the
    // Ticker's beats: drawn in the frames the motion level draws anyway, no more often.
    const from = dir.length()
    const unit = dir.normalize()
    const start = performance.now()
    const moveTo = (t: number) => {
      const e = 1 - Math.pow(1 - t, 3)
      const at = from + (distance - from) * e
      camera.position.copy(TARGET).addScaledVector(unit, at)
      controls?.update()
      reportCamera(canvas, at, distance)
    }
    const stop = () => {
      beat.delete(step)
      gliding.current = null
    }
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / 1600)
      moveTo(t)
      if (t >= 1) stop()
    }
    reportCamera(canvas, from, distance)
    beat.add(step)
    gliding.current = () => {
      moveTo(1)
      stop()
      invalidate()
    }
    return stop
  }, [distance, camera, controls, invalidate, canvas])
  return null
}

/** Slides the painted mountains a little as the view turns, for depth. */
function ParallaxSync() {
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  useEffect(() => {
    if (!controls) return
    const update = () => {
      const pan = controls.getAzimuthalAngle() - Math.PI / 4
      document.documentElement.style.setProperty('--pan', pan.toFixed(3))
    }
    controls.addEventListener('change', update)
    update()
    return () => controls.removeEventListener('change', update)
  }, [controls])
  return null
}

/** What the scene is drawn with from the attention dial (see motion.ts), as plain values so the canvas stays memoised. */
type SceneDial = { motion: Attention['level']; fps: number; quiet: boolean }

function Scene({ motion, fps, quiet }: SceneDial) {
  const { framed, furthest } = useFrameDistance()
  const shadowReach = useShadowReach()
  // The farm's own piece and the pieces in it load first, so everything placed on them stands on the
  // ground that's drawn; the rest load in the background (see pieceLoader.ts).
  const visible = useVisibleIsles()
  const ready = useFarmDrawn(visible, useGame((s) => s.loaded))
  // The baked water of the farm and of each piece it has is asked for with the ground, so it counts among the
  // models from when that ground is needed: once `data-models` says they are in, the water has settled too (see
  // water/PieceWater.tsx). A piece not bought is never asked for.
  useAskForWater(visible)
  return (
    <MotionContext.Provider value={motion}>
      <Ticker fps={fps} />
      {/* Before the wind, so what sways on the CPU feels the shiver in the frame it's set for. */}
      <ShiverDriver />
      <WindDriver />
      <WaterDriver />
      <DayCycle cameraDistance={framed} shadowReach={shadowReach} />
      <CameraRig distance={framed} />
      <ParallaxSync />
      <FogFollow />
      <OrbitControls
        makeDefault
        target={TARGET}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.45}
        zoomSpeed={0.6}
        minDistance={14}
        maxDistance={furthest}
        minPolarAngle={0.62}
        maxPolarAngle={1.22}
        minAzimuthAngle={Math.PI / 4 - 0.85}
        maxAzimuthAngle={Math.PI / 4 + 0.85}
      />
      <Backdrop />
      {ready && (
        // Quiet mode stands the animals still (see motion.ts).
        <WanderContext.Provider value={!quiet}>
          <MainIsland />
          <Isles />
          <Features />
          <ReadyMarkers />
          {motion !== 'still' && <Fireflies count={motion === 'calm' ? 14 : 26} />}
        </WanderContext.Provider>
      )}
    </MotionContext.Provider>
  )
}

/**
 * Where the models are: `loading` while the loader has any of them (or the textures it unpacks) in
 * flight, `loaded` once it has had some and they are all in, `none` until it has had any. For tests.
 */
function useModelsState(): 'none' | 'loading' | 'loaded' {
  const active = useProgress((s) => s.active)
  const had = useProgress((s) => s.total > 0)
  return active ? 'loading' : had ? 'loaded' : 'none'
}

export function World() {
  const { level: motion, fps, quiet } = useAttention()
  const farmName = useGame((s) => s.game.farmName)
  const isles = useVisibleIsles()
  const rising = useRiseState((s) => s.rising)
  const docked = useRiseState((s) => s.docked)
  const pieces = usePiecesReport()
  const composed = useComposedReport()
  const drawn = usePieceStore((s) => s.drawn)
  const models = useModelsState()
  const water = useWaterReport()
  const waterTier = useWaterTierReport()
  const woodshed = useGame((s) => s.game.owned.woodshed > 0)
  const barnaby = useGame((s) => (isOn('characters') ? s.game.characters.barnaby.stage : 'away'))
  const siofra = useGame((s) => (isOn('characters') && s.game.characters.siofra.metAt !== null ? 'met' : 'unmet'))
  const label = useMemo(
    () => `${farmName}: a small farm on a floating island above a sea of clouds, with a farmhouse, garden, pond and animals.`,
    [farmName],
  )
  return (
    // `data-isles`, `data-rising` and `data-docked` tell tests which pieces are in the world, which are still
    // rising into place and which are docked in it (each also writes how it's drawn as `data-isle-<id>`, see
    // Rising.tsx); `data-pieces` which pieces have loaded, baked or procedural; `data-drawn` whether the farm
    // is drawn yet; `data-models` whether the models are in (the baked water among them); `data-water` what
    // each piece's water is drawn as (`main:v2:pond,fall` for the art's baked pond and fall, `main:legacy` for today's while
    // it loads or if it failed; empty with the water switch off) and `data-water-tier` the tier it is drawn at,
    // phone or mid (see water/report.ts); `data-composition` and `data-paths` what the art's composition has
    // drawn on each piece (see useComposedReport); `data-woodshed` whether the farm has its woodshed, which
    // MainIsland draws by the farmhouse; `data-barnaby` Barnaby Wick's stage
    // (`away` while the characters are switched off), and `data-barnaby-screen` where he stands on screen,
    // "x,y" in CSS pixels, empty when he isn't drawn: it starts empty here, and features/Barnaby.tsx writes
    // it while he's drawn (React never sets it again, as its value here never changes); `data-siofra` whether
    // Síofra has been met (`unmet` while the characters are switched off), and `data-siofra-screen` where she
    // stands on screen, in the same way, written by features/Siofra.tsx while her figure is drawn; `data-shiver`
    // the latest shiver this page has seen, "<size>:<n>" with n how many it has seen, empty before the first:
    // it starts empty here, and ShiverDriver.tsx writes it, in the same way; and `data-motion` and `data-fps`
    // the motion level and frame cap in effect (see motion.ts).
    <div
      className="world"
      role="img"
      aria-label={label}
      data-testid="world"
      data-isles={isles.join(' ')}
      data-rising={rising.join(' ')}
      data-docked={isles.filter((id) => docked.includes(id)).join(' ')}
      data-pieces={pieces}
      data-drawn={drawn ? 'true' : 'false'}
      data-models={models}
      data-water={water}
      data-water-tier={waterTier}
      data-composition={composed.composition}
      data-paths={composed.paths}
      data-woodshed={woodshed ? 'true' : 'false'}
      data-barnaby={barnaby}
      data-barnaby-screen=""
      data-siofra={siofra}
      data-siofra-screen=""
      data-shiver=""
      data-motion={motion}
      data-fps={fps}
    >
      <SkyArt />
      <WorldCanvas motion={motion} fps={fps} quiet={quiet} />
    </div>
  )
}

/**
 * The canvas and the scene in it. The scene's parts follow the game
 * themselves, so the canvas is drawn again for what changes in the world, not
 * each time the page around it does (a panel opening, say, or the world
 * element's reports for tests): each fresh pass over the scene would draw
 * another frame.
 */
const WorldCanvas = memo(function WorldCanvas({ motion, fps, quiet }: SceneDial) {
  return (
    <Canvas
      flat
      shadows="percentage"
      dpr={[1, 1.75]}
      frameloop="demand"
      camera={{ fov: 30, near: 0.5, far: 600, position: [30, 28, 30] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
      fallback={<div className="world-fallback">Your browser can't draw the 3D island, but the farm still works.</div>}
    >
      <Scene motion={motion} fps={fps} quiet={quiet} />
    </Canvas>
  )
})
