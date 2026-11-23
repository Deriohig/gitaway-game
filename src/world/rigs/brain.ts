import type * as THREE from 'three'
import type { MotionLevel } from '../motion'
import { rng } from '../random'
import type { RigController } from './RigController'

// What each rigged animal plays, and when (GAME-NOTE "Behaviours"): a stand
// picked each time it stops, a once-clip over it now and then, and what a tap
// or the pointer over it does. The wandering itself stays in wander.ts; this
// only turns what the walker does into clips.

export type Species = 'dog' | 'cat_sleeping' | 'goat' | 'chicken' | 'duck' | 'sheep' | 'hare'

interface Stand {
  clip: string
  /** How likely it is, against the others. */
  weight: number
  /** Seconds it adds to the stand, at least and at most: a lie-down lasts. */
  longer?: readonly [number, number]
}

interface Behaviour {
  /** The loop played while the object moves. */
  walk?: string
  stands: Stand[]
  /** Once-clips played over a stand now and then. */
  oneShots: string[]
  /** Seconds between them, at least and at most, at full motion. */
  every: readonly [number, number]
  /** The stands they may play over (any loop by default). */
  over?: string[]
  /** They may play while it moves too (the ducks are always paddling). */
  whileMoving?: boolean
  tap?: {
    clip?: string
    /** Seconds it looks at you for. */
    look?: number
    /** Seconds it's happy for, wagging wider. */
    happy?: number
    /** The walker's hop goes with it (the hen flaps up). */
    lift?: boolean
  }
  /** What the pointer over it plays, at most this often (seconds). */
  hover?: { clip: string; every: number }
}

export const BEHAVIOURS: Record<Species, Behaviour> = {
  dog: {
    walk: 'Walk',
    stands: [
      { clip: 'Idle', weight: 0.35 },
      { clip: 'Sniff', weight: 0.3 },
      { clip: 'Sit', weight: 0.25 },
      { clip: 'Lie', weight: 0.1, longer: [8, 15] },
    ],
    // Not over Sit, Lie or Sleep: a once-clip starts and ends standing.
    oneShots: ['Scratch', 'PlayBow'],
    over: ['Idle', 'Sniff'],
    every: [6, 14],
    tap: { clip: 'Happy', look: 3, happy: 4 },
  },
  cat_sleeping: { stands: [{ clip: 'Sleep', weight: 1 }], oneShots: ['EarTwitch', 'TailFlick'], every: [5, 15], tap: { clip: 'Peek' } },
  goat: {
    walk: 'Walk',
    stands: [
      { clip: 'Graze', weight: 0.5 },
      { clip: 'Idle', weight: 0.3 },
      { clip: 'Chew', weight: 0.2 },
    ],
    oneShots: ['HeadShake'],
    every: [8, 18],
    tap: { clip: 'Hop' },
  },
  sheep: {
    walk: 'Walk',
    stands: [
      { clip: 'Graze', weight: 0.55 },
      { clip: 'Idle', weight: 0.45 },
    ],
    oneShots: ['Bleat'],
    every: [8, 20],
    tap: { clip: 'Hop' },
  },
  chicken: { walk: 'Walk', stands: [{ clip: 'Idle', weight: 1 }], oneShots: ['Peck', 'Peck', 'Scratch', 'Fluff'], every: [2, 6], tap: { clip: 'Flap', lift: true } },
  duck: { walk: 'Paddle', stands: [{ clip: 'Idle', weight: 1 }], oneShots: ['Preen', 'Dabble', 'Shake'], every: [8, 20], whileMoving: true },
  // She waits in one spot, so she never hops (Hop lands forward).
  hare: { stands: [{ clip: 'Idle', weight: 1 }], oneShots: ['Look', 'EarTwitch', 'Groom'], every: [4, 10], hover: { clip: 'Alert', every: 6 } },
}

export class RigBrain {
  private readonly b: Behaviour
  private readonly rand: () => number
  /** Whether it was moving last frame; null before the first. */
  private moving: boolean | null = null
  private nextIn: number
  private clock = 0
  private lookFor = 0
  private happyFor = 0
  private hovered: THREE.Vector3 | null = null
  private hoverAt = -Infinity
  /** Still mode, as of the last frame: nothing plays, a tap included. */
  private still = false

  constructor(
    private readonly rig: RigController,
    species: Species,
    seed: number,
  ) {
    this.b = BEHAVIOURS[species]
    this.rand = rng(seed * 104_729 + 7)
    this.nextIn = this.between(this.b.every)
  }

  /**
   * One frame, `dt` seconds: whether the object is moving, and how fast (world
   * units a second, drawn `scale` times the rig's size). Returns the seconds a
   * stand just picked adds to the walker's wait (a lie-down lasts), else 0.
   * Calm plays the once-clips half as often; still plays nothing.
   */
  step(dt: number, moving: boolean, motion: MotionLevel, speed = 0, scale = 1): number {
    this.still = motion === 'still'
    if (this.still) return 0
    this.clock += dt
    let longer = 0
    const walks = moving && !!this.b.walk
    if (walks) {
      this.rig.setBase(this.b.walk!)
      this.rig.setWalkSpeed(speed, scale)
    } else if (this.moving !== false) {
      const stand = this.pick()
      this.rig.setBase(stand.clip)
      if (stand.longer) longer = this.between(stand.longer)
    }
    this.moving = walks

    this.nextIn -= motion === 'calm' ? dt / 2 : dt
    if (this.nextIn <= 0) {
      this.nextIn = this.between(this.b.every)
      const free = walks ? this.b.whileMoving : !this.rig.busy && this.rig.isLoop(this.rig.base) && (!this.b.over || this.b.over.includes(this.rig.base))
      if (free && this.b.oneShots.length) this.rig.playOnce(this.b.oneShots[Math.floor(this.rand() * this.b.oneShots.length)])
    }

    if (this.lookFor > 0) {
      this.lookFor -= dt
      if (this.lookFor <= 0 && !this.hovered) this.rig.lookAt(null)
    }
    if (this.happyFor > 0) {
      this.happyFor -= dt
      if (this.happyFor <= 0) this.rig.setMood('content')
    }
    return longer
  }

  /** A tap from the camera at `from`. Returns whether the walker should hop as well. */
  tap(from: THREE.Vector3): boolean {
    const t = this.b.tap
    if (!t || this.still) return false
    if (t.clip) this.rig.playOnce(t.clip, true)
    if (t.look) {
      this.rig.lookAt(from)
      this.lookFor = t.look
    }
    if (t.happy) {
      this.rig.setMood('happy')
      this.happyFor = t.happy
    }
    return !!t.lift
  }

  /** The pointer over it, seen from the camera at `from` (null once it leaves): it looks at you. */
  hover(from: THREE.Vector3 | null): void {
    this.hovered = from
    if (this.still) return
    if (!from) {
      if (this.lookFor <= 0) this.rig.lookAt(null)
      return
    }
    this.rig.lookAt(from)
    const h = this.b.hover
    if (h && this.clock - this.hoverAt >= h.every && this.rig.playOnce(h.clip)) this.hoverAt = this.clock
  }

  private between([lo, hi]: readonly [number, number]): number {
    return lo + this.rand() * (hi - lo)
  }

  private pick(): Stand {
    const total = this.b.stands.reduce((n, s) => n + s.weight, 0)
    let r = this.rand() * total
    for (const s of this.b.stands) if ((r -= s.weight) < 0) return s
    return this.b.stands[this.b.stands.length - 1]
  }
}
