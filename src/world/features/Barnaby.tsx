import * as THREE from 'three'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { BARNABY } from '../../game/content/barnaby'
import { speaking, tapBarnaby, tapLine } from '../../game/systems/characters'
import { useGame } from '../../store/game'
import { Asset } from '../Asset'
import { OnIsle, useLocalAt } from '../Isles'
import { RUIN } from '../isleSpots'
import { HOUSE, ISLES, MAIN } from '../layout'
import { useMotion } from '../motion'
import { GEO } from '../Nature'
import { CAMP, CAMP_ROT, CAMP_STAND, TAP } from '../places/characters'
import { footprintDrop } from '../terrain'
import { useSway } from '../wind'
import { WorldLabel, type V3 } from '../WorldLabel'
import { hitMat, usePointer } from './Visitors'
import { BarnabyShell, CampShell, RuinShell } from './barnabyModels'

// Barnaby Wick in the world (docs/superpowers/specs/2026-10-22-barnaby-design.md
// §5): camping by the garden, then living in the highland's ruin, which is
// drawn whenever the highland is the farm's. Hovering shows his name, and
// tapping him shows one of his lines over his head for a few seconds.

/** Where his labels float, above his hat. */
const LABEL_AT: V3 = [0, 1.35, 0]

const seen = new THREE.Vector3()

/**
 * Writes where a character stands on screen on the world element, for tests:
 * `key` is its dataset name (`barnabyScreen` is `data-barnaby-screen`), "x,y"
 * in CSS pixels from the page's top left, as the view or they move; empty once
 * they've gone.
 */
export function useScreenReport(anchor: RefObject<THREE.Object3D | null>, key: 'barnabyScreen' | 'siofraScreen') {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const canvas = useThree((s) => s.gl.domElement)
  const invalidate = useThree((s) => s.invalidate)
  const world = useMemo(() => canvas.closest<HTMLElement>('[data-testid="world"]'), [canvas])
  useEffect(() => {
    // Draw a frame for them, so they're reported in still mode too.
    invalidate()
    return () => {
      if (world) world.dataset[key] = ''
    }
  }, [world, invalidate, key])
  useFrame(() => {
    const o = anchor.current
    if (!o || !world) return
    camera.updateMatrixWorld()
    const p = o.getWorldPosition(seen).project(camera)
    const at = `${(size.left + ((p.x + 1) / 2) * size.width).toFixed(1)},${(size.top + ((1 - p.y) / 2) * size.height).toFixed(1)}`
    if (world.dataset[key] !== at) world.dataset[key] = at
  })
}

/** Barnaby himself, standing at `at` facing `face` (rotation.y). */
function Figure({ at, face }: { at: V3; face: number }) {
  const run = useGame((s) => s.run)
  // Each read as a plain value, so neither the game's clock ticking by nor a fresh copy of the
  // game draws him again: the line he's saying, when he said it, and whether it's still up.
  const line = useGame((s) => s.game.characters.barnaby.said?.index ?? null)
  const saidAt = useGame((s) => s.game.characters.barnaby.said?.at ?? null)
  const says = useGame((s) => speaking(s.game.characters.barnaby.said, s.now))
  const motion = useMotion()
  const body = useRef<THREE.Group>(null)
  useSway(body, 1.3, motion === 'still' ? 0 : 0.03)
  const hit = useRef<THREE.Mesh>(null)
  useScreenReport(hit, 'barnabyScreen')
  const [hovered, setHovered] = useState(false)
  const pointer = usePointer()

  const tap = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    run((s, now) => tapBarnaby(s, now))
  }

  return (
    <group position={at} rotation-y={face}>
      <group ref={body}>
        <Asset id="barnaby" fallback={<BarnabyShell />} />
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
        <WorldLabel key={saidAt} at={LABEL_AT} motion={motion} testId="barnaby-says" says>
          {tapLine(line)}
        </WorldLabel>
      ) : (
        hovered && (
          <WorldLabel at={LABEL_AT} motion={motion} testId="barnaby-name">
            {BARNABY.name}
          </WorldLabel>
        )
      )}
    </group>
  )
}

/** Where his camp stands: on the lowest ground under it, as the woodshed stands. Read when it's placed, on the farm's ground as drawn. */
export function campAt(): V3 {
  const [x, z] = CAMP
  return [x, MAIN.height(x, z) + footprintDrop(MAIN, x, z, 0.5, 0.35, CAMP_ROT), z]
}

/** Which way he faces by his camp (rotation.y): his front (+Z) to the farmhouse. */
export const CAMP_FACE = Math.atan2(HOUSE.x - CAMP_STAND[0], HOUSE.z - CAMP_STAND[1])

/** His camp by the garden, and him by it, facing the farmhouse. */
function Camp() {
  const [sx, sz] = CAMP_STAND
  return (
    <>
      <group position={campAt()} rotation-y={CAMP_ROT}>
        <Asset id="barnaby_camp" fallback={<CampShell />} />
      </group>
      <Figure at={[sx, MAIN.height(sx, sz), sz]} face={CAMP_FACE} />
    </>
  )
}

/** The ruin on the highland's plateau, drawn inside the piece (see OnIsle), so its ground is read once the piece is in the world; and him in it once he lives there. */
function Ruin({ home }: { home: boolean }) {
  const ground = useLocalAt(ISLES.highland)
  return (
    <>
      <group position={ground(RUIN.at)} rotation-y={RUIN.turn}>
        <Asset id="tower_ruin" fallback={<RuinShell />} />
      </group>
      {home && <Figure at={ground(RUIN.stand)} face={RUIN.turn} />}
    </>
  )
}

/** Barnaby, his camp while he camps, and the highland's ruin. */
export function Barnaby() {
  const stage = useGame((s) => s.game.characters.barnaby.stage)
  const highland = useGame((s) => s.game.owned.highland > 0)
  return (
    <>
      {stage === 'camp' && <Camp />}
      {highland && (
        <OnIsle id="highland">
          <Ruin home={stage === 'ruin'} />
        </OnIsle>
      )}
    </>
  )
}
