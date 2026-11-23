import type { MotionLevel } from './motion'

// How a newly claimed isle rises out of the cloud sea and settles into place.
// Only numbers here, so the motion is unit-tested; Rising.tsx draws it.
//
// The isle starts with its top just under the cloud sea, unseen, and fades in
// as it comes up through it. At full motion it eases up, rises a touch past
// its place, settles back, and the bridge is laid out to it; clouds billow
// where it breaks through and ring its base as it arrives. Calm motion is a
// slower, plain ease into place with no clouds, and the bridge simply appears.
// Still motion has no rise at all: the isle is just there.

/** The cloud sea's band of heights (Backdrop's CLOUD_SEA_Y). */
export const CLOUD_SEA = { bottom: -14, top: -10.5 } as const

export interface RisePlan {
  /** Seconds from the start until the isle is in place. */
  seconds: number
  /** How far it rises past its place before settling back, in world units (0: it doesn't). */
  overshoot: number
  /** Clouds billow where it breaks through the cloud sea and ring its base as it arrives. */
  puffs: boolean
  /** Seconds the bridge takes to be laid out once the isle has settled (0: it appears at once). */
  bridgeSeconds: number
}

export const RISE_PLANS: Record<MotionLevel, RisePlan | null> = {
  full: { seconds: 4.4, overshoot: 0.22, puffs: true, bridgeSeconds: 0.6 },
  calm: { seconds: 5.6, overshoot: 0, puffs: false, bridgeSeconds: 0 },
  still: null,
}

/** Share of a rise with an overshoot spent coming up; the rest settles back. */
const CLIMB = 0.8

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}

/** How far below its place an isle whose ground sits at height `y` starts: with its top just under the cloud sea. */
export const riseDepth = (y: number): number => y - CLOUD_SEA.bottom

/**
 * The isle's height offset `t` seconds into its rise: from `-depth` up to its
 * place (and, with an overshoot, a little past it and back), then 0 for good.
 * Smooth all the way: no jumps and no sudden stops.
 */
export function riseOffset(plan: RisePlan, depth: number, t: number): number {
  if (t <= 0) return -depth
  if (t >= plan.seconds) return 0
  const u = t / plan.seconds
  if (plan.overshoot <= 0) return -depth * (1 - smooth(u))
  if (u < CLIMB) {
    // Eases in under the clouds, comes up through them briskly, and slows
    // towards the top of the overshoot.
    const e = 1 - (1 - smooth(u / CLIMB)) ** 2
    return -depth + (depth + plan.overshoot) * e
  }
  const v = (u - CLIMB) / (1 - CLIMB)
  return (plan.overshoot * (1 + Math.cos(Math.PI * v))) / 2
}

/** How opaque the isle is with its ground at height `top`: unseen under the cloud sea, solid as it clears it. */
export function riseOpacity(top: number): number {
  return smooth((top - CLOUD_SEA.bottom) / (CLOUD_SEA.top + 0.5 - CLOUD_SEA.bottom))
}

/** How much of the bridge is laid, from 0 to 1. Nothing until the isle has settled. */
export function bridgeLaid(plan: RisePlan, t: number): number {
  if (t < plan.seconds) return 0
  if (riseDone(plan, t)) return 1
  return clamp01((t - plan.seconds) / plan.bridgeSeconds)
}

/** Whether everything is in place: the isle settled and its bridge laid. */
export const riseDone = (plan: RisePlan, t: number): boolean => t >= plan.seconds + plan.bridgeSeconds

export interface CloudPuffs {
  /** 0 to 1. */
  opacity: number
  /** How far the puffs have drifted out from where they started, as a factor of their radius. */
  spread: number
  /** How big they are, as a factor of their size. */
  swell: number
}

/**
 * The bank of cloud the isle breaks through, at the cloud sea: it gathers
 * first, then billows out and thins as the isle comes up through it. Null
 * when there's none (before, after, or without puffs).
 */
export function breachCloud(plan: RisePlan, t: number): CloudPuffs | null {
  const end = 0.62 * plan.seconds
  if (!plan.puffs || t < 0 || t >= end) return null
  const gather = smooth(t / (0.1 * plan.seconds))
  const out = smooth((t - 0.14 * plan.seconds) / (end - 0.14 * plan.seconds))
  return { opacity: 0.95 * gather * (1 - smooth((t - 0.24 * plan.seconds) / (end - 0.24 * plan.seconds))), spread: 1 + 0.85 * out, swell: 0.75 + 0.25 * gather + 0.3 * out }
}

/** The soft ring of cloud around the isle's base as it arrives at its place, drifting out and fading. */
export function arrivalRing(plan: RisePlan, t: number): CloudPuffs | null {
  const start = CLIMB * plan.seconds * 0.9
  // Gone by the time the bridge is laid.
  const length = Math.min(0.42 * plan.seconds, plan.seconds + plan.bridgeSeconds - start - 0.05)
  if (!plan.puffs || t < start || t >= start + length) return null
  const k = (t - start) / length
  return { opacity: 0.9 * smooth(k / 0.18) * (1 - smooth((k - 0.3) / 0.7)), spread: 1 + 0.32 * smooth(k), swell: 0.6 + 0.4 * smooth(k / 0.5) }
}
