import * as THREE from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { now as clockNow } from '../game/clock'
import type { CropId } from '../game/config'
import { cropProgress, harvest, isReady } from '../game/engine'
import type { Plot } from '../game/state'
import { useGame } from '../store/game'
import { useCoarseNow } from '../hooks/useCoarseNow'
import { Asset } from './Asset'
import { CropPlants } from './Crops'
import { CROP_Y, SPARKLE, sparkleY } from './gardenHeights'
import { GARDEN, MAIN, plotCenter } from './layout'
import { mat } from './materials'
import { useMotion } from './motion'
import { GEO } from './Nature'

const bedGeo = new THREE.CylinderGeometry(0.6, 0.68, 0.16, 4, 1)
bedGeo.rotateY(Math.PI / 4)
const sparkleGeo = new THREE.OctahedronGeometry(1, 0)
const sparkleMat = new THREE.MeshLambertMaterial({ color: '#F6E3B4', emissive: new THREE.Color('#E8BD72'), emissiveIntensity: 0.6, flatShading: true })
const ringMat = new THREE.MeshBasicMaterial({ color: '#FFF8EC', transparent: true, opacity: 0.85 })

export function onPlotClick(plot: Plot) {
  const { run, selectPlot, openPanel } = useGame.getState()
  if (isReady(plot, clockNow())) {
    run((s, now) => harvest(s, plot.id, now))
    return
  }
  selectPlot(plot.id)
  openPanel('garden')
}

function Outline({ color }: { color?: string }) {
  const half = GARDEN.plot / 2 + 0.03
  const m = useMemo(() => (color ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }) : ringMat), [color])
  return (
    <group position-y={0.17}>
      {[[0, half, 2 * half, 0.04], [0, -half, 2 * half, 0.04], [half, 0, 0.04, 2 * half], [-half, 0, 0.04, 2 * half]].map(([x, z, w, d], i) => (
        <mesh key={i} geometry={GEO.box} material={m} position={[x, 0, z]} scale={[w, 0.02, d]} />
      ))}
    </group>
  )
}

/** The sparkle over a ready plot: just clear of the top of its ripe crop (see gardenHeights.ts). */
function ReadyMarker({ crop }: { crop: CropId }) {
  const ref = useRef<THREE.Mesh>(null)
  const phase = useMemo(() => Math.random() * 6, [])
  const y = sparkleY(crop)
  useFrame(({ clock }) => {
    const m = ref.current
    if (!m) return
    m.position.y = y + Math.sin(clock.elapsedTime * 1.4 + phase) * SPARKLE.bob
    m.rotation.y = clock.elapsedTime * 0.6 + phase
  })
  return <mesh ref={ref} geometry={sparkleGeo} material={sparkleMat} position-y={y} scale={[0.07, SPARKLE.half, 0.07]} />
}

/** A few motes that drift up and fade after a harvest. */
function HarvestPuff({ onDone }: { onDone: () => void }) {
  const group = useRef<THREE.Group>(null)
  const start = useRef<number | null>(null)
  const material = useMemo(() => {
    const m = sparkleMat.clone()
    m.transparent = true
    return m
  }, [])
  useFrame(({ clock }) => {
    start.current ??= clock.elapsedTime
    const t = (clock.elapsedTime - start.current) / 1.4
    if (t >= 1) return onDone()
    const g = group.current
    if (!g) return
    g.position.y = 0.2 + t * 0.8
    g.rotation.y = t * 2
    material.opacity = 1 - t
  })
  return (
    <group ref={group}>
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} geometry={sparkleGeo} material={material} position={[Math.cos(a) * 0.25, a * 0.03, Math.sin(a) * 0.25]} scale={0.05} />
      ))}
    </group>
  )
}

/**
 * One plot: drawn again only when what it shows changes (its crop's growth,
 * ready or not, hovered or chosen), never for the clock alone, so a still
 * world isn't redrawn while the garden waits.
 */
const PlotView = memo(function PlotView({ plot, index, progress, ready, selected }: { plot: Plot; index: number; progress: number; ready: boolean; selected: boolean }) {
  const [hover, setHover] = useState(false)
  const [puffs, setPuffs] = useState<number[]>([])
  const motion = useMotion()
  const prevCrop = useRef(plot.crop)
  const [x, z] = plotCenter(index)
  const y = MAIN.height(x, z) - 0.02

  useEffect(() => {
    if (prevCrop.current && !plot.crop && motion !== 'still') setPuffs((p) => [...p, Date.now()])
    prevCrop.current = plot.crop
  }, [plot.crop, motion])

  // The same handlers from one drawing to the next: new ones would count as a change and draw the world again.
  const over = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(true)
    document.body.style.cursor = 'pointer'
  }, [])
  const out = useCallback(() => {
    setHover(false)
    document.body.style.cursor = ''
  }, [])
  const click = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      onPlotClick(plot)
    },
    [plot],
  )

  return (
    <group position={[x, y, z]}>
      {/* The plot, its crop and its sparkle answer the pointer as one: a click high on a tall crop acts on
          the crop's own plot, not on whatever lies behind it on screen. */}
      <group onPointerOver={over} onPointerOut={out} onClick={click}>
        <Asset
          id="plot"
          fallback={
            <>
              <mesh geometry={bedGeo} material={mat(plot.crop ? 'soil' : 'soilLight')} position-y={0.08} receiveShadow castShadow />
              {!plot.crop &&
                [-0.24, 0, 0.24].map((dz) => (
                  <mesh key={dz} geometry={GEO.box} material={mat('soilDark')} position={[0, 0.165, dz]} scale={[0.7, 0.02, 0.06]} />
                ))}
            </>
          }
        />
        {plot.crop && (
          <group position-y={CROP_Y}>
            <CropPlants crop={plot.crop} progress={progress} />
          </group>
        )}
        {ready && plot.crop && <ReadyMarker crop={plot.crop} />}
      </group>
      {(hover || selected) && <Outline color={ready ? '#E8BD72' : undefined} />}
      {puffs.map((id) => (
        <HarvestPuff key={id} onDone={() => setPuffs((p) => p.filter((q) => q !== id))} />
      ))}
    </group>
  )
})

export function Garden() {
  const plots = useGame((s) => s.game.plots)
  const selected = useGame((s) => (s.panel === 'garden' ? s.selectedPlot : null))
  const now = useCoarseNow(4000)
  return (
    <group>
      {plots.map((plot, i) => (
        <PlotView key={plot.id} plot={plot} index={i} progress={cropProgress(plot, now)} ready={isReady(plot, now)} selected={selected === plot.id} />
      ))}
    </group>
  )
}
