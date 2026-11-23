import { POND } from './layout'

/**
 * The ducks keep to two rings round the pond's open middle (POND), as
 * fractions of its radius: three round the outer one, two the other way round
 * the inner one, spaced evenly round each. The rings are further apart than
 * two ducks are wide, so ducks going opposite ways pass side by side, and
 * ducks on the same ring keep their distance. Both keep well inside the pond,
 * clear of its edge, and inside the pond Water.tsx draws until the baked water
 * ships.
 */
const RINGS = [
  { r: 0.56, turn: 0.12, ducks: 3 },
  { r: 0.3, turn: -0.2, ducks: 2 },
]

/**
 * Where a duck is on the pond `time` seconds in: odd seeds on the outer ring,
 * even seeds on the inner, bobbing a little (`bob`). `heading` is its turn
 * (rotation.y), for a duck that faces +Z, as the model and its stand-in do.
 */
export function duckAt(seed: number, time: number): { x: number; z: number; bob: number; heading: number } {
  const ring = RINGS[(seed - 1) % 2]
  const place = Math.floor((seed - 1) / 2) % ring.ducks
  const phase = seed * 2.1
  const t = time * ring.turn + (place / ring.ducks) * Math.PI * 2 + (seed % 2 ? 0 : Math.PI / 2)
  const radius = POND.r * ring.r
  return {
    x: POND.x + Math.cos(t) * radius,
    z: POND.z + Math.sin(t) * radius,
    bob: Math.sin(time * 1.6 + phase) * 0.012,
    // Along the ring, the way it goes: (-sin t, cos t) one way round, the opposite the other.
    heading: -t + (ring.turn > 0 ? 0 : Math.PI),
  }
}
