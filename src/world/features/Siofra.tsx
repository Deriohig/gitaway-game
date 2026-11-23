import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { SIOFRA, SIOFRA_NAME } from '../../game/content/siofra'
import { speaking } from '../../game/systems/characterKit'
import { siofraShown, tapSiofra } from '../../game/systems/siofra'
import { useGame } from '../../store/game'
import { Asset } from '../Asset'
import { SIOFRA_SPOT } from '../isleSpots'
import { ISLES } from '../layout'
import { mat } from '../materials'
import { useMotion } from '../motion'
import { GEO } from '../Nature'
import type { PaletteKey } from '../palette'
import { usePieceLoaded } from '../pieceLoader'
import { TAP } from '../places/characters'
import { useRiseState } from '../riseState'
import { useSway } from '../wind'
import { WorldLabel, type V3 } from '../WorldLabel'
import { useScreenReport } from './Barnaby'
import { hitMat, usePointer } from './Visitors'

// Síofra as herself (docs/superpowers/specs/2026-10-25-siofra-design.md, "Her
// figure and taps"): once she's met, she stands at the meadow's field edge, a
// step from where the hare waits, and never while the hare is there (see
// `siofraShown`). Hovering shows her name, and tapping her shows one of her
// lines over her head for a few seconds, never written to the journal.

// ---------------------------------------------------------------------------
// The placeholder

/** The hare's own brown and cream (visitorModels.tsx), and her shoes, hair and skin. */
const BROWN = '#B98A63'
const CREAM = '#FFF8EC'
const SHOES: PaletteKey = 'soilDark'
const HAIR: PaletteKey = 'woodDark'
const SKIN: PaletteKey = 'blossom'

/** One painted piece. */
function P({ g = 'box', c, p, s = 1, r }: { g?: keyof typeof GEO; c: PaletteKey | string; p?: V3; s?: number | V3; r?: V3 }) {
  return <mesh geometry={GEO[g]} material={mat(c)} position={p} scale={s} rotation={r} castShadow receiveShadow />
}

/** Her dress: wide at the hem, narrow at the shoulders, from 0.2 to 0.66. */
const dress = new THREE.CylinderGeometry(0.09, 0.2, 0.46, 7).translate(0, 0.43, 0)

/**
 * A shoe on the wrong foot: its toe turned out, and its bulge, where the big
 * toe goes, on the outside. `side` is 1 for her left foot (+X), -1 for her right.
 */
function Shoe({ side }: { side: 1 | -1 }) {
  return (
    <group position={[side * 0.06, 0, 0.02]} rotation-y={side * 0.35}>
      <P c={SHOES} p={[0, 0.02, 0]} s={[0.055, 0.04, 0.11]} />
      <P g="ball" c={SHOES} p={[side * 0.018, 0.022, 0.05]} s={[0.025, 0.022, 0.025]} />
    </group>
  )
}

/** Blades of grass caught in her hair: where, how they lean (rotation), and which green. */
const GRASS: { p: V3; r: V3; c: PaletteKey }[] = [
  { p: [0.045, 0.9, -0.01], r: [0.1, 0, -0.5], c: 'grassLight' },
  { p: [-0.02, 0.91, -0.04], r: [-0.35, 0, 0.25], c: 'sage' },
  { p: [-0.065, 0.86, 0.01], r: [0.2, 0, 0.8], c: 'grassDeep' },
  { p: [0.07, 0.83, -0.05], r: [-0.3, 0, -0.95], c: 'sage' },
]

/**
 * A stand-in for her, about 1.0 tall on the characters' yardstick, facing +Z
 * with her feet on y = 0: a young woman in a brown dress with a cream collar
 * and hem, the hare's colours, grass in her hair and her shoes on the wrong
 * feet. No wings, no glow. The art session's model replaces it through
 * <Asset id="siofra">.
 */
export function SiofraShell() {
  return (
    <group>
      <Shoe side={1} />
      <Shoe side={-1} />
      {[1, -1].map((side) => (
        <P key={side} g="cyl" c={SKIN} p={[side * 0.055, 0.13, 0]} s={[0.026, 0.2, 0.026]} />
      ))}
      <mesh geometry={dress} material={mat(BROWN)} castShadow receiveShadow />
      <P g="cyl" c={CREAM} p={[0, 0.215, 0]} s={[0.205, 0.035, 0.205]} />
      <P g="cyl" c={CREAM} p={[0, 0.64, 0]} s={[0.12, 0.05, 0.11]} />
      {[1, -1].map((side) => (
        <group key={side}>
          <P g="cyl" c={BROWN} p={[side * 0.125, 0.5, 0]} s={[0.032, 0.24, 0.032]} r={[0, 0, side * 0.2]} />
          <P g="ball" c={SKIN} p={[side * 0.15, 0.37, 0.01]} s={0.03} />
        </group>
      ))}
      <P g="cyl" c={SKIN} p={[0, 0.69, 0]} s={[0.035, 0.06, 0.035]} />
      <P g="ball" c={SKIN} p={[0, 0.79, 0]} s={0.095} />
      <P g="ball" c={HAIR} p={[0, 0.815, -0.025]} s={[0.102, 0.095, 0.1]} />
      <P c={HAIR} p={[0, 0.72, -0.07]} s={[0.15, 0.17, 0.05]} />
      {[1, -1].map((side) => (
        <P key={side} g="ball" c="ink" p={[side * 0.033, 0.795, 0.088]} s={0.012} />
      ))}
      {GRASS.map((b, i) => (
        <P key={i} g="cone" c={b.c} p={b.p} r={b.r} s={[0.012, 0.1, 0.012]} />
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Her at the field edge

/** Where her labels float, over her head. */
const LABEL_AT: V3 = [0, 1.3, 0]

/** Which way she faces (rotation.y): to the camera, as the visitors' π/4 does. */
const FACE = Math.PI / 4

/** Her, standing at `at`. */
function Figure({ at }: { at: V3 }) {
  const run = useGame((s) => s.run)
  // Each read as a plain value, as Barnaby's are, so the game's clock ticking by doesn't draw her again.
  const line = useGame((s) => s.game.characters.siofra.said?.index ?? null)
  const saidAt = useGame((s) => s.game.characters.siofra.said?.at ?? null)
  const says = useGame((s) => speaking(s.game.characters.siofra.said, s.now))
  const motion = useMotion()
  const body = useRef<THREE.Group>(null)
  useSway(body, 2.1, motion === 'still' ? 0 : 0.03)
  const hit = useRef<THREE.Mesh>(null)
  useScreenReport(hit, 'siofraScreen')
  const [hovered, setHovered] = useState(false)
  const pointer = usePointer()

  const tap = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    run((s, now) => tapSiofra(s, now))
  }

  return (
    <group position={at} rotation-y={FACE}>
      <group ref={body}>
        <Asset id="siofra" fallback={<SiofraShell />} />
      </group>
      <mesh
        ref={hit}
        geometry={GEO.ball}
        material={hitMat}
        position-y={TAP.height}
        scale={TAP.reach}
        onClick={tap}
        onPointerOver={(e) => {
          e.stopPropagation()
          pointer.enter()
          setHovered(true)
        }}
        onPointerOut={() => {
          pointer.leave()
          setHovered(false)
        }}
      />
      {says && line !== null ? (
        // A fresh label for each line, so each eases in.
        <WorldLabel key={saidAt} at={LABEL_AT} motion={motion} testId="siofra-says" says>
          {SIOFRA.taps[line]?.line}
        </WorldLabel>
      ) : (
        hovered && (
          <WorldLabel at={LABEL_AT} motion={motion} testId="siofra-name">
            {SIOFRA_NAME}
          </WorldLabel>
        )
      )}
    </group>
  )
}

/**
 * Síofra at the meadow's field edge while she's there to be seen (see
 * `siofraShown`), stood on its ground as the hare is: in the world's
 * coordinates, once the meadow's files are in (or its stand-in is ready) and
 * it has docked, so she's never in the air over a meadow still rising in.
 */
export function Siofra() {
  const shown = useGame((s) => siofraShown(s.game))
  const loaded = usePieceLoaded(SIOFRA_SPOT.isle)
  const docked = useRiseState((s) => s.docked.includes(SIOFRA_SPOT.isle))
  if (!shown || !loaded || !docked) return null
  const def = ISLES[SIOFRA_SPOT.isle]
  const [px, py, pz] = def.pos
  const [x, z] = SIOFRA_SPOT.at
  return <Figure at={[px + x, py + def.island.height(x, z) + SIOFRA_SPOT.lift, pz + z]} />
}
