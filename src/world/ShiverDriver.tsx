import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { now as clockNow } from '../game/clock'
import type { GameState, ShiverSize } from '../game/state'
import { useGame } from '../store/game'
import { useMotion } from './motion'
import { shiverWave } from './wind'

// The shiver in the world (docs/superpowers/specs/2026-10-22-barnaby-design.md
// §4): when work is done while the game is open, a gust rolls out from the
// farmhouse through the grass and the trees (wind.ts), about 2 s for a big
// shiver and 1 s for a small one. In still mode nothing moves.

/** Each size of shiver: how hard its gust pushes at first, and for how many seconds it runs. */
const SHIVERS: Record<ShiverSize, { peak: number; seconds: number }> = {
  big: { peak: 1.6, seconds: 2.0 },
  small: { peak: 0.8, seconds: 1.0 },
}

/** How fast the gust's front rolls out from the farmhouse, in world units a second. */
const SPEED = 14

/** How long after it came a shiver still sets the world moving: one read from a save is older, and doesn't. */
const FRESH_MS = 3000

/** The gust `t` seconds into a shiver of `size`: how hard it pushes, fading to nothing, and how far out from the farmhouse its front is. */
export function shiverEnvelope(size: ShiverSize, t: number): { strength: number; radius: number } {
  const { peak, seconds } = SHIVERS[size]
  return { strength: t < seconds ? peak * (1 - t / seconds) : 0, radius: SPEED * t }
}

/** Whether a shiver that came `at` is still fresh enough at `now` to set the world moving. */
export const gustStillFresh = (at: number, now: number): boolean => now - at <= FRESH_MS

/**
 * When the gust for the latest shiver starts, if it's a new one: one not seen
 * yet (`seenAt` is the last one seen), that came no more than a few seconds
 * ago. A gust already playing is played afresh from this start.
 */
export function gustStart(seenAt: number | null, shiver: GameState['characters']['shiver'], now: number): number | null {
  if (!shiver || shiver.at === seenAt || !gustStillFresh(shiver.at, now)) return null
  return shiver.at
}

/** The shivers this page has seen: the latest's time, and how many. */
const seen = { at: null as number | null, count: 0 }

/**
 * Plays the gust for each new shiver, and writes the shiver on the world
 * element for tests: `data-shiver`, "<size>:<n>", the latest one's size and how
 * many this page has seen, written in still mode too. Mount once inside the
 * Canvas.
 */
export function ShiverDriver() {
  // Read as plain values, so the game's clock ticking by doesn't run this again.
  const at = useGame((s) => s.game.characters.shiver?.at ?? null)
  const size = useGame((s) => s.game.characters.shiver?.size ?? null)
  const motion = useMotion()
  const invalidate = useThree((s) => s.invalidate)
  const canvas = useThree((s) => s.gl.domElement)
  const world = useMemo(() => canvas.closest<HTMLElement>('[data-testid="world"]'), [canvas])
  /**
   * The gust playing: its size, when its shiver came by the game's clock, and
   * when it started by the frame clock (null until its first frame).
   */
  const gust = useRef<{ size: ShiverSize; at: number; from: number | null } | null>(null)

  useEffect(() => {
    if (at === null || size === null) return
    const start = gustStart(seen.at, { at, size }, clockNow())
    if (start === null) return
    seen.at = start
    seen.count++
    if (world) world.dataset.shiver = `${size}:${seen.count}`
    if (motion === 'still') return
    // From its own start at its own size: a gust already playing gives way to it.
    gust.current = { size, at: start, from: null }
    invalidate()
  }, [at, size, motion, world, invalidate])

  useFrame(({ clock }) => {
    const g = gust.current
    if (!g) return
    // A hidden window draws no frames, so a gust that came then waits for its first until the window is
    // shown again, perhaps hours later. By then it no longer follows the work, so it's dropped.
    if (g.from === null && !gustStillFresh(g.at, clockNow())) {
      calm()
      return
    }
    g.from ??= clock.elapsedTime
    const { strength, radius } = shiverEnvelope(g.size, clock.elapsedTime - g.from)
    // Still mode, chosen while it plays, stops it. While it plays the Ticker (World.tsx) draws the
    // frames, at the rate the player's motion setting allows.
    if (strength > 0 && motion !== 'still') {
      shiverWave.strength.value = strength
      shiverWave.radius.value = radius
    } else calm()
  })

  /** Ends the gust, and the shiver in the wind with it. */
  function calm() {
    gust.current = null
    shiverWave.strength.value = 0
    shiverWave.radius.value = 0
  }
  return null
}
