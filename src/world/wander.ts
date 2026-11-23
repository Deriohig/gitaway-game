import { isClear, type XZ } from './layout'

// Where the animals amble next (Animals.tsx): a spot in their patch and,
// where their ground is only good in places, the whole straight walk there.
// Plain functions, so they run in tests.

/** The patch an animal keeps to. */
export interface Patch {
  center: XZ
  radius: number
  /** Extra check for spots to avoid (main island only), or for ground to keep to. */
  clear?: (x: number, z: number) => boolean
  /** Check the whole way to a new spot with `clear`, not just the spot: for ground that's only good in places. */
  clearPath?: boolean
}

/** How finely a walk is looked at: a point every this far along it, so it can't step over a small keep-clear area. */
const STEP = 0.05

/** Whether the straight walk from `from` to (x, z) keeps to `clear`, all the way. */
function clearWalk(clear: (x: number, z: number) => boolean, from: XZ, x: number, z: number): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(x - from[0], z - from[1]) / STEP))
  for (let k = 1; k <= steps; k++) if (!clear(from[0] + ((x - from[0]) * k) / steps, from[1] + ((z - from[1]) * k) / steps)) return false
  return true
}

/**
 * Where an animal goes next from `from`, or where it starts (given null), by
 * its own random numbers: a few tries for a spot in its patch it may go to,
 * else it stays put (or starts in the middle).
 */
export function nextSpot(patch: Patch, rand: () => number, from: XZ | null): XZ {
  for (let i = 0; i < 20; i++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * patch.radius
    const x = patch.center[0] + Math.cos(a) * d
    const z = patch.center[1] + Math.sin(a) * d
    if (!patch.clear) return [x, z]
    if (from && patch.clearPath ? clearWalk(patch.clear, from, x, z) : patch.clear(x, z)) return [x, z]
  }
  // Nowhere new to go: stay put, or start in the middle.
  return from ?? patch.center
}

/** An animal ambling about its patch: where it is and is heading, and what it's doing. Plain numbers, changed frame by frame by `stepWalker`. */
export interface Walker {
  pos: XZ
  target: XZ
  /** Seconds left standing before it sets off somewhere new; at 0 or below it's walking. */
  wait: number
  /** Its turn about the vertical (rotation.y), facing +Z at 0. */
  heading: number
  /** Seconds into a hop, or -1 when it isn't hopping. */
  hop: number
  /** Seconds it has stood, which times its pecking or grazing nods. */
  peck: number
}

/** How long a hop takes, in seconds. */
export const HOP_SECONDS = 0.45
/** How high a hop lifts it, in world units. */
const HOP_HEIGHT = 0.22

/** A walker at its start in `patch`, by its own random numbers (which it then goes on drawing from). */
export function startWalker(patch: Patch, rand: () => number): Walker {
  const pos = nextSpot(patch, rand, null)
  const target = nextSpot(patch, rand, pos)
  return { pos, target, wait: rand() * 3, heading: rand() * Math.PI * 2, hop: -1, peck: 0 }
}

/** A click: it hops, unless it's in a hop already. */
export function hopWalker(w: Walker): void {
  if (w.hop < 0) w.hop = 0
}

/** How a walker ambles, and whether it's on the move at all. */
export interface Amble extends Patch {
  speed: number
  /** How long it stands between walks, in seconds: at least, at most. */
  idle: readonly [number, number]
  /** Its own random numbers, the ones it started from. */
  rand: () => number
  /** False in quiet mode (motion.ts): it stands where it is, though a hop still plays out. */
  wandering: boolean
}

/** What a frame of the amble shows: how high a hop lifts it, whether it's walking (and bobs), and whether its head is down. */
export interface Stride {
  lift: number
  walking: boolean
  headDown: boolean
}

/**
 * One frame of an animal's amble, `dt` seconds long (capped by the caller),
 * changing `w`: it stands a while, nodding now and then, picks a spot in its
 * patch, turns towards it and walks there. Not wandering (quiet mode), it
 * stands where it is, neither walking nor turning, with its head up; a hop it
 * is in, or one a click starts, still plays out.
 */
export function stepWalker(w: Walker, dt: number, amble: Amble): Stride {
  if (!amble.wandering) {
    // Standing still: the nod goes back to its start, so the head comes up (Animals.tsx eases it there).
    w.peck = 0
  } else if (w.wait > 0) {
    w.wait -= dt
    w.peck += dt
    if (w.wait <= 0) w.target = nextSpot(amble, amble.rand, w.pos)
  } else {
    const dx = w.target[0] - w.pos[0]
    const dz = w.target[1] - w.pos[1]
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist < 0.05) {
      w.wait = amble.idle[0] + amble.rand() * (amble.idle[1] - amble.idle[0])
      w.peck = 0
    } else {
      let diff = Math.atan2(dx, dz) - w.heading
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      w.heading += diff * Math.min(1, dt * 3)
      if (Math.abs(diff) < 0.6) {
        // Along the way, as far as its pace allows this frame (worked as THREE.Vector2 did it, to the last digit).
        const step = Math.min(dist, amble.speed * dt)
        const inv = 1 / dist
        w.pos = [w.pos[0] + dx * inv * step, w.pos[1] + dz * inv * step]
      }
    }
  }
  let lift = 0
  if (w.hop >= 0) {
    w.hop += dt
    lift = Math.sin(Math.min(1, w.hop / HOP_SECONDS) * Math.PI) * HOP_HEIGHT
    if (w.hop > HOP_SECONDS) w.hop = -1
  }
  const walking = amble.wandering && w.wait <= 0
  return { lift, walking, headDown: !walking && Math.sin(w.peck * 2.2) > 0.55 }
}

/** A clock that stops while the wanderers stand still (the ducks' paddle round the pond), and goes on from where it stopped. */
export interface PausableClock {
  /** Seconds it has spent stopped, before now. */
  held: number
  /** The scene's time when it stopped, while it's stopped. */
  stoppedAt: number | null
}

/** This clock's time at the scene's `elapsed` seconds: the scene's time less the time spent stopped, and still while not `running`. */
export function pausableTime(c: PausableClock, elapsed: number, running: boolean): number {
  if (!running) {
    c.stoppedAt ??= elapsed
    return c.stoppedAt - c.held
  }
  if (c.stoppedAt !== null) {
    c.held += elapsed - c.stoppedAt
    c.stoppedAt = null
  }
  return elapsed - c.held
}

/** How far round itself a farm animal keeps clear of the farm's buildings and keep-clear areas (layout.ts BLOCKERS). */
export const ANIMAL_ROOM = 0.2

/**
 * A patch of the farm for the hens and the dog, clear of its buildings and
 * keep-clear areas where they stop and the whole way between: a patch can
 * take in one (Barnaby's camp, in the first hen yard), and a walk across it
 * would go through the lean-to and him.
 */
export const farmPatch = (center: XZ, radius: number): Patch => ({ center, radius, clear: (x, z) => isClear(x, z, ANIMAL_ROOM), clearPath: true })
