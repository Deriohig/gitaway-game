import * as THREE from 'three'
import { mat } from '../materials'
import { GEO } from '../Nature'
import type { PaletteKey } from '../palette'

// Procedural stand-ins for Barnaby Wick, his camp and the highland's ruin
// (docs/superpowers/specs/2026-10-22-barnaby-design.md §5): chunky low-poly
// shapes in the island's palette, each in its own frame with +Z to the front
// and its foot on y = 0. A hand-made model replaces each one through
// <Asset id="barnaby" | "barnaby_camp" | "tower_ruin">.

type V3 = [number, number, number]

/** One painted piece. */
function P({ g = 'box', c, p, s = 1, r }: { g?: keyof typeof GEO; c: PaletteKey; p?: V3; s?: number | V3; r?: V3 }) {
  return <mesh geometry={GEO[g]} material={mat(c)} position={p} scale={s} rotation={r} castShadow receiveShadow />
}

/** His robe: wide at the hem, narrow at the shoulders. */
const robe = new THREE.CylinderGeometry(0.095, 0.24, 0.56, 6).translate(0, 0.28, 0)

/** Barnaby, about 1.05 tall: a robe, a round head with a white beard, and a tall pointed hat that leans a little. */
export function BarnabyShell() {
  return (
    <group>
      <mesh geometry={robe} material={mat('cliffTip')} castShadow receiveShadow />
      <P g="ball" c="blossom" p={[0, 0.65, 0]} s={0.11} />
      <P g="cone" c="white" p={[0, 0.58, 0.065]} s={[0.08, 0.18, 0.08]} r={[Math.PI, 0, 0]} />
      <P g="cyl" c="cliffTip" p={[0, 0.74, 0]} s={[0.18, 0.024, 0.18]} />
      <P g="cyl" c="gold" p={[0, 0.77, 0]} s={[0.125, 0.04, 0.125]} />
      <group position-y={0.75} rotation-z={-0.14}>
        <P g="cone" c="cliffTip" p={[0, 0.16, 0]} s={[0.125, 0.32, 0.125]} />
      </group>
    </group>
  )
}

/**
 * The lean-to: a canvas sheet propped on a ridge pole at the open front (+Z)
 * and resting on the ground at the back, 0.92 wide (x).
 */
const LEAN = { halfWidth: 0.4, front: 0.16, back: -0.3, ridge: 0.56 }
const roofLength = Math.hypot(LEAN.ridge, LEAN.front - LEAN.back)
const roofPitch = -Math.atan2(LEAN.ridge, LEAN.front - LEAN.back)

/**
 * The camp, about 1.0 by 0.7: a lean-to, with a bedroll laid out from under
 * it, its pillow in the shelter and its red blanket out in front. The bedroll
 * lies right of the middle, leaving room for Barnaby before the left end
 * (places/characters.ts CAMP_STAND).
 */
export function CampShell() {
  const { halfWidth, front, back, ridge } = LEAN
  return (
    <group>
      {[-halfWidth, halfWidth].map((x) => (
        <P key={x} c="woodDark" p={[x, ridge / 2, front]} s={[0.045, ridge, 0.045]} />
      ))}
      <P g="cyl" c="woodDark" p={[0, ridge, front]} s={[0.022, 2 * halfWidth + 0.12, 0.022]} r={[0, 0, Math.PI / 2]} />
      <P c="wallShade" p={[0, ridge / 2, (front + back) / 2]} s={[2 * halfWidth + 0.12, 0.03, roofLength]} r={[roofPitch, 0, 0]} />
      <P c="dusty" p={[0.14, 0.025, 0.125]} s={[0.32, 0.05, 0.69]} />
      <P c="terracotta" p={[0.14, 0.045, 0.24]} s={[0.34, 0.07, 0.42]} />
      <P g="cyl" c="cream" p={[0.14, 0.07, -0.12]} s={[0.06, 0.3, 0.06]} r={[0, 0, Math.PI / 2]} />
    </group>
  )
}

/**
 * The tower's broken walls, round a ring 1.9 across with its open side to the
 * front (+Z): each at a bearing (degrees from +Z towards +X), its width, and
 * its height, with a broken step on top of the taller ones.
 */
const RING = 0.84
const WALLS: { at: number; width: number; height: number }[] = [
  { at: 118, width: 0.58, height: 0.6 },
  { at: 166, width: 0.66, height: 1.2 },
  { at: 214, width: 0.62, height: 0.95 },
  { at: 262, width: 0.56, height: 0.42 },
]
/** Fallen stones at the walls' feet: where (in the ruin's frame) and how big. They keep clear of where Barnaby stands, 0.4 back from the middle (isleSpots.ts RUIN). */
const RUBBLE: [number, number, number][] = [
  [0.95, -0.05, 0.13],
  [0.55, 0.62, 0.09],
  [-0.62, -0.62, 0.1],
  [-0.98, 0.2, 0.12],
  [0.42, -0.5, 0.08],
]

/** The ruin of an old round tower, about 2.0 across and at most 1.4 tall: four broken stone walls and some rubble. */
export function RuinShell() {
  return (
    <group>
      {WALLS.map(({ at, width, height }, i) => {
        const a = (at * Math.PI) / 180
        return (
          <group key={at} position={[RING * Math.sin(a), 0, RING * Math.cos(a)]} rotation-y={a}>
            {/* Set a little into the ground. */}
            <P c="stone" p={[0, (height - 0.1) / 2, 0]} s={[width, height + 0.1, 0.24]} />
            {height > 0.8 && <P c="stoneDark" p={[(i % 2 ? 1 : -1) * width * 0.27, height + 0.08, 0]} s={[width * 0.46, 0.16, 0.22]} />}
          </group>
        )
      })}
      {RUBBLE.map(([x, z, s]) => (
        <P key={`${x},${z}`} g="rock" c="stoneDark" p={[x, s * 0.4, z]} s={[s, s * 0.8, s]} r={[0.3, x * 3, 0.2]} />
      ))}
    </group>
  )
}
