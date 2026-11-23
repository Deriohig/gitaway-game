import * as THREE from 'three'
import { useMemo, type JSX } from 'react'
import type { CropId } from '../game/config'
import { Asset } from './Asset'
import { WET_BED } from './gardenHeights'
import { mat } from './materials'
import { GEO } from './Nature'
import { smoothstep } from './random'

// Each crop grows by swelling and filling in rather than snapping between
// sprite frames: leaves unfurl, then fruit appears and ripens in colour.

const CROP_COLORS = {
  radish: '#CF7378',
  carrot: '#D98A4E',
  tomato: '#C65A4A',
  tomatoGreen: '#A3B36B',
  sunPetal: '#E8BD72',
  sunCenter: '#7A5A3E',
  pumpkin: '#D98B4A',
  pumpkinGreen: '#A9B26E',
  blueberry: '#5E70A5',
  blueberryGreen: '#9DB08C',
  wheat: '#E2B866',
  wheatGreen: '#B5BE7A',
  wheatStalk: '#CDA85E',
  cranberry: '#9A1C30',
  cranberryPale: '#E3A3A0',
  cranberryRunner: '#7A4A3A',
  lavender: '#8F78BA',
  lavenderPale: '#B7AFC9',
  lavenderLeaf: '#9DAE97',
}

// Spots within a plot, before the stand-in scale is applied.
const LAYOUT: Record<CropId, [number, number][]> = {
  radish: [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]],
  carrot: [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]],
  wheat: [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15], [0, 0]],
  lettuce: [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]],
  tomato: [[-0.14, 0], [0.14, 0]],
  sunflower: [[-0.13, -0.08], [0.13, 0.08]],
  pumpkin: [[0, 0]],
  blueberry: [[-0.13, -0.09], [0.13, 0.09]],
  cranberry: [[-0.13, -0.12], [0.13, -0.12], [0, 0.13]],
  lavender: [[-0.13, -0.09], [0.13, 0.09]],
}

type P = { g: number; f: number }

function Sprout({ g }: { g: number }) {
  return (
    <group scale={0.4 + g * 0.6}>
      <mesh geometry={GEO.blob} material={mat('leafLight')} position={[-0.05, 0.07, 0]} rotation-z={0.6} scale={[0.07, 0.03, 0.05]} />
      <mesh geometry={GEO.blob} material={mat('sage')} position={[0.05, 0.08, 0]} rotation-z={-0.6} scale={[0.07, 0.03, 0.05]} />
      <mesh geometry={GEO.cyl6} material={mat('meadow')} position-y={0.03} scale={[0.01, 0.07, 0.01]} />
    </group>
  )
}

function Radish({ g, f }: P) {
  return (
    <group>
      {[0, 2.1, 4.2].map((a) => (
        <mesh key={a} geometry={GEO.blob} material={mat(a ? 'meadow' : 'leafLight')} position={[Math.cos(a) * 0.05, 0.1 * g + 0.04, Math.sin(a) * 0.05]} rotation={[Math.sin(a) * 0.7, a, Math.cos(a) * 0.7]} scale={[0.05, 0.11 * g + 0.03, 0.03]} />
      ))}
      {f > 0 && <mesh geometry={GEO.ball} material={mat(CROP_COLORS.radish)} position-y={0.03} scale={[0.07 * f, 0.06 * f, 0.07 * f]} />}
    </group>
  )
}

function Carrot({ g, f }: P) {
  return (
    <group>
      {[-0.35, 0, 0.35].map((t, i) => (
        <mesh key={t} geometry={GEO.cone} material={mat(i === 1 ? 'leafLight' : 'meadow')} position={[t * 0.12, 0.09 * g + 0.05, 0]} rotation-z={-t} scale={[0.025, 0.2 * g + 0.04, 0.025]} />
      ))}
      {f > 0 && <mesh geometry={GEO.cone} material={mat(CROP_COLORS.carrot)} position-y={0.02} rotation-x={Math.PI} scale={[0.055 * f, 0.08 * f, 0.055 * f]} />}
    </group>
  )
}

function Lettuce({ g, f }: P) {
  const s = 0.5 + g * 0.5
  return (
    <group scale={s}>
      {[0, 1.25, 2.5, 3.75, 5].map((a, i) => (
        <mesh key={a} geometry={GEO.blob} material={mat(i % 2 ? 'leafLight' : 'sage')} position={[Math.cos(a) * 0.06, 0.06, Math.sin(a) * 0.06]} rotation={[0.3, a, 0.4]} scale={[0.09, 0.06, 0.07]} />
      ))}
      <mesh geometry={GEO.blob} material={mat('grassLight')} position-y={0.08 + f * 0.03} scale={0.06 + f * 0.04} />
    </group>
  )
}

function Tomato({ g, f }: P) {
  const h = 0.15 + g * 0.35
  return (
    <group>
      <mesh geometry={GEO.box} material={mat('woodLight')} position-y={h / 2 + 0.02} scale={[0.02, h + 0.08, 0.02]} />
      <mesh geometry={GEO.blob} material={mat('meadow')} position-y={h * 0.55} scale={[0.1 * g + 0.03, h * 0.6, 0.1 * g + 0.03]} />
      <mesh geometry={GEO.blob} material={mat('leafLight')} position={[0.03, h * 0.85, 0.02]} scale={0.06 * g + 0.02} />
      {f > 0 &&
        [[0.08, 0.45, 0.05], [-0.07, 0.62, 0.06], [0.05, 0.75, -0.06]].map(([x, y, z], i) => (
          <mesh key={i} geometry={GEO.ball} material={mat(f > 0.6 ? CROP_COLORS.tomato : CROP_COLORS.tomatoGreen)} position={[x, y * h, z]} scale={0.045 * Math.max(0.4, f)} />
        ))}
    </group>
  )
}

function Sunflower({ g, f }: P) {
  const h = 0.15 + g * 0.65
  return (
    <group>
      <mesh geometry={GEO.cyl6} material={mat('meadow')} position-y={h / 2} scale={[0.018, h, 0.018]} />
      <mesh geometry={GEO.blob} material={mat('leafLight')} position={[0.06, h * 0.45, 0]} rotation-z={-0.6} scale={[0.08, 0.025, 0.05]} />
      <mesh geometry={GEO.blob} material={mat('sage')} position={[-0.06, h * 0.6, 0]} rotation-z={0.6} scale={[0.08, 0.025, 0.05]} />
      {f > 0 && (
        <group position-y={h} rotation={[0.35, Math.PI / 4, 0]} scale={0.4 + f * 0.6}>
          <mesh geometry={GEO.cyl} material={mat(CROP_COLORS.sunPetal)} rotation-x={Math.PI / 2} scale={[0.12, 0.02, 0.12]} />
          <mesh geometry={GEO.cyl} material={mat(CROP_COLORS.sunCenter)} position-z={0.012} rotation-x={Math.PI / 2} scale={[0.06, 0.02, 0.06]} />
        </group>
      )}
    </group>
  )
}

function Pumpkin({ g, f }: P) {
  return (
    <group>
      {[0.3, 2.4, 4.4].map((a) => (
        <mesh key={a} geometry={GEO.blob} material={mat('meadow')} position={[Math.cos(a) * 0.18 * g, 0.05, Math.sin(a) * 0.18 * g]} scale={[0.14 * g + 0.04, 0.03, 0.11 * g + 0.03]} rotation-y={a} />
      ))}
      {f > 0 && (
        <group scale={0.35 + f * 0.65}>
          <mesh geometry={GEO.blobSoft} material={mat(f > 0.55 ? CROP_COLORS.pumpkin : CROP_COLORS.pumpkinGreen)} position-y={0.13} scale={[0.22, 0.15, 0.22]} />
          <mesh geometry={GEO.cyl6} material={mat('woodDark')} position-y={0.3} scale={[0.02, 0.07, 0.02]} />
        </group>
      )}
    </group>
  )
}

function Blueberry({ g, f }: P) {
  const s = 0.45 + g * 0.55
  return (
    <group scale={s}>
      <mesh geometry={GEO.blob} material={mat('leafDark')} position-y={0.14} scale={[0.16, 0.13, 0.15]} />
      <mesh geometry={GEO.blob} material={mat('forest')} position={[0.07, 0.22, 0.03]} scale={0.1} />
      {f > 0 &&
        [[0.12, 0.16, 0.06], [-0.1, 0.2, 0.08], [0.02, 0.27, 0.11], [0.09, 0.08, -0.1], [-0.12, 0.1, -0.05]].map(([x, y, z], i) => (
          <mesh key={i} geometry={GEO.ball} material={mat(f > 0.6 ? CROP_COLORS.blueberry : CROP_COLORS.blueberryGreen)} position={[x, y, z]} scale={0.032} />
        ))}
    </group>
  )
}

/** A few stalks that grow tall, then grow ears that turn from green to gold. */
function Wheat({ g, f }: P) {
  const h = 0.12 + g * 0.42
  const ripe = f > 0.6
  return (
    <group>
      {[[-0.035, -0.02, 0.12], [0.035, 0.025, -0.1], [0, -0.03, 0.02]].map(([x, z, lean], i) => (
        <group key={i} position={[x, 0, z]} rotation-z={lean}>
          <mesh geometry={GEO.cyl6} material={mat(ripe ? CROP_COLORS.wheatStalk : 'meadow')} position-y={h / 2} scale={[0.008, h, 0.008]} />
          {f > 0 && (
            <mesh geometry={GEO.blob} material={mat(ripe ? CROP_COLORS.wheat : CROP_COLORS.wheatGreen)} position-y={h + 0.035} scale={[0.022, 0.06 * Math.max(0.4, f), 0.022]} />
          )}
        </group>
      ))}
      <mesh geometry={GEO.blob} material={mat('leafLight')} position={[0.03, 0.05, 0]} rotation-z={-0.7} scale={[0.06, 0.012, 0.02]} />
    </group>
  )
}

/** Each cranberry runner: which way it trails (radians) and how far once grown. */
const RUNNERS: [number, number][] = [[0.3, 0.19], [1.55, 0.15], [2.6, 0.2], [3.75, 0.14], [4.95, 0.17]]

/**
 * Not a bush like the blueberry: a low crown that sends out trailing runners
 * over the wet bed, with small leaves along them and berries that ripen from
 * blush to a deep red.
 */
function Cranberry({ g, f }: P) {
  const reach = 0.4 + g * 0.6
  const berry = mat(f > 0.6 ? CROP_COLORS.cranberry : CROP_COLORS.cranberryPale)
  return (
    <group>
      <mesh geometry={GEO.blob} material={mat('leafDark')} position-y={0.025} scale={[0.08 * reach, 0.03, 0.07 * reach]} />
      {RUNNERS.map(([a, len], i) => (
        <group key={i} rotation-y={a}>
          <mesh geometry={GEO.box} material={mat(CROP_COLORS.cranberryRunner)} position={[0, 0.012, (len * reach) / 2]} rotation-x={-0.06} scale={[0.012, 0.01, len * reach]} />
          {[0.45, 0.85].map((t) => (
            <mesh key={t} geometry={GEO.blob} material={mat(t > 0.5 ? 'forest' : 'leafDark')} position={[(t - 0.6) * 0.04, 0.02, len * reach * t]} scale={[0.03, 0.012, 0.022]} />
          ))}
          {f > 0 && <mesh geometry={GEO.ball} material={berry} position={[0.016, 0.026, len * reach * 0.7]} scale={0.024 * Math.max(0.5, f)} />}
        </group>
      ))}
      {f > 0 &&
        [[0.03, 0.05, 0.02], [-0.03, 0.045, -0.025], [0.0, 0.055, -0.01]].map(([x, y, z], i) => (
          <mesh key={i} geometry={GEO.ball} material={berry} position={[x, y, z]} scale={0.022 * Math.max(0.5, f)} />
        ))}
    </group>
  )
}

/** Cranberries grow in a wet bed: dark standing water across the plot, under the runners. */
const wetBedMat = new THREE.MeshLambertMaterial({ color: '#5A7C8C', transparent: true, opacity: 0.8 })

/** A plot's wet bed, in the crops' frame: a sheet just over the plot's furrows (see gardenHeights.ts). */
function WetBed() {
  const { top, depth, radius } = WET_BED
  return <mesh geometry={GEO.cyl} material={wetBedMat} position-y={top - depth / 2} scale={[radius[0], depth, radius[1]]} />
}

/** Standing water for a bed of cranberries `width` by `depth`, the same as a plot's. */
export function WetSheet({ width, depth }: { width: number; depth: number }) {
  return <mesh geometry={GEO.box} material={wetBedMat} scale={[width, 0.006, depth]} />
}

/** A plot's worth of ripe cranberries, without the plot's own wet bed (for a bed of several). */
export function RipeCranberries() {
  return (
    <group scale={STAND_IN_SCALE}>
      {LAYOUT.cranberry.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={i * 2.1}>
          <Cranberry g={1} f={1} />
        </group>
      ))}
    </group>
  )
}

/** A grey-green mound with spikes that flower purple. */
function Lavender({ g, f }: P) {
  const s = 0.45 + g * 0.55
  return (
    <group scale={s}>
      <mesh geometry={GEO.blob} material={mat(CROP_COLORS.lavenderLeaf)} position-y={0.07} scale={[0.13, 0.08, 0.13]} />
      {[0, 1.05, 2.1, 3.15, 4.2, 5.25].map((a) => (
        <group key={a} position={[Math.cos(a) * 0.06, 0.08, Math.sin(a) * 0.06]} rotation={[Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]}>
          <mesh geometry={GEO.cyl6} material={mat('sage')} position-y={0.08} scale={[0.006, 0.16, 0.006]} />
          {f > 0 && (
            <mesh geometry={GEO.blob} material={mat(f > 0.6 ? CROP_COLORS.lavender : CROP_COLORS.lavenderPale)} position-y={0.17} scale={[0.018, 0.05 * Math.max(0.4, f), 0.018]} />
          )}
        </group>
      ))}
    </group>
  )
}

const PLANTS: Record<CropId, (p: P) => JSX.Element> = {
  radish: Radish,
  carrot: Carrot,
  wheat: Wheat,
  lettuce: Lettuce,
  tomato: Tomato,
  sunflower: Sunflower,
  pumpkin: Pumpkin,
  blueberry: Blueberry,
  cranberry: Cranberry,
  lavender: Lavender,
}

/** Growth stage for crop models: 1 sprout, 2 growing, 3 ready. */
const stageOf = (progress: number) => (progress >= 1 ? 3 : progress < 0.34 ? 1 : 2)

/**
 * All the plants in one garden plot at a given growth (0 to 1). A cranberry
 * bed's water is drawn here, once, beside the model or its stand-in alike: the
 * crop models are the plants alone.
 */
export function CropPlants({ crop, progress }: { crop: CropId; progress: number }) {
  return (
    <>
      {crop === 'cranberry' && <WetBed />}
      <Asset id={`crop_${crop}_${stageOf(progress)}`} fallback={<GrowingPlants crop={crop} progress={progress} />} />
    </>
  )
}

// The stand-ins are drawn a little larger than life so they read from afar.
const STAND_IN_SCALE = 1.45

function GrowingPlants({ crop, progress }: { crop: CropId; progress: number }) {
  const Plant = PLANTS[crop]
  const g = smoothstep(0, 0.65, progress)
  const f = smoothstep(0.5, 1, progress)
  const spots = LAYOUT[crop]
  const tilt = useMemo(() => spots.map((_, i) => (i * 1.37) % 1), [spots])
  if (progress < 0.12) {
    return (
      <group scale={STAND_IN_SCALE}>
        {spots.map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <Sprout g={progress / 0.12} />
          </group>
        ))}
      </group>
    )
  }
  return (
    <group scale={STAND_IN_SCALE}>
      {spots.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={crop === 'sunflower' ? 0 : tilt[i] * Math.PI * 2}>
          <Plant g={g} f={f} />
        </group>
      ))}
    </group>
  )
}
