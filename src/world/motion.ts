import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { isOn } from '../game/features'
import type { MotionPreference } from '../game/state'
import { useGame } from '../store/game'

// How lively the island is drawn. The player picks a motion level (or "auto",
// which follows the system's reduced-motion setting). The attention dial (A6,
// behind its switch) can then only calm it down, never liven it up: quiet
// mode, and saving power while the device runs on battery. Everything that
// moves in the world reads the result from `useMotion()` inside the scene;
// code outside it uses `useAttention()`.

export type MotionLevel = 'full' | 'calm' | 'still'

/** Frames per second the world is drawn at for each motion level. */
export const FPS: Record<MotionLevel, number> = { full: 30, calm: 15, still: 0 }

/** Quiet mode's frame cap. */
export const QUIET_FPS = 10

const RANK: Record<MotionLevel, number> = { still: 0, calm: 1, full: 2 }

/** The motion level the player chose, or the system's on auto. */
export const chosenMotion = (pref: MotionPreference, reducedMotion: boolean): MotionLevel =>
  pref === 'auto' ? (reducedMotion ? 'still' : 'full') : pref

/** The motion level in effect: quiet mode and saving power each hold it at Calm at most, and never raise it. */
export function effectiveMotion(chosen: MotionLevel, { quiet, saving }: { quiet: boolean; saving: boolean }): MotionLevel {
  return (quiet || saving) && RANK[chosen] > RANK.calm ? 'calm' : chosen
}

/** Frames per second for a level, under quiet mode's cap. Still draws only for changes (0). */
export function frameRate(level: MotionLevel, quiet: boolean): number {
  return quiet ? Math.min(FPS[level], QUIET_FPS) : FPS[level]
}

export interface Attention {
  /** The motion level in effect. */
  level: MotionLevel
  /** Frames per second to draw at; 0 draws only for changes. */
  fps: number
  /** Quiet mode is on (never while the Attention switch is off). */
  quiet: boolean
  /** Running on battery has calmed the island down from the player's choice. */
  saving: boolean
}

/**
 * What the attention dial decides from the player's motion level and its own
 * settings. While the Attention switch is off it's the motion level alone,
 * whatever the save says.
 */
export function attentionOf(
  chosen: MotionLevel,
  { on, quiet, batterySaver, discharging }: { on: boolean; quiet: boolean; batterySaver: boolean; discharging: boolean },
): Attention {
  const isQuiet = on && quiet
  const saving = on && batterySaver && discharging && effectiveMotion(chosen, { quiet: false, saving: true }) !== chosen
  const level = effectiveMotion(chosen, { quiet: isQuiet, saving })
  return { level, fps: frameRate(level, isQuiet), quiet: isQuiet, saving }
}

// ---------------------------------------------------------------- battery

/** The parts of the Battery API's BatteryManager read here. */
interface BatteryLike {
  charging: boolean
  addEventListener(type: 'chargingchange', listener: () => void): void
  removeEventListener(type: 'chargingchange', listener: () => void): void
}

/**
 * Follows whether the device runs on battery, where the browser has the
 * Battery API (`navigator.getBattery`: Chromium and the Windows web view have
 * it; Firefox, Safari and the macOS web view don't). Without it, or if it
 * fails, nothing is ever reported, so the device counts as plugged in. Never
 * throws. Returns a function that stops it.
 */
export function watchBattery(nav: unknown, onChange: (discharging: boolean) => void): () => void {
  let stopped = false
  let unlisten = () => {}
  try {
    const getBattery = (nav as { getBattery?: unknown } | null | undefined)?.getBattery
    if (typeof getBattery !== 'function') return () => {}
    // Called on the navigator itself, or Chromium refuses ("Illegal invocation").
    Promise.resolve(getBattery.call(nav) as BatteryLike | null)
      .then((battery) => {
        if (stopped || !battery || typeof battery.addEventListener !== 'function') return
        const update = () => onChange(battery.charging === false)
        battery.addEventListener('chargingchange', update)
        unlisten = () => battery.removeEventListener('chargingchange', update)
        update()
      })
      .catch(() => {})
  } catch {
    // The API is there but refused here (a permissions policy, say): plugged in, as far as the game knows.
  }
  return () => {
    stopped = true
    unlisten()
  }
}

/** True while `active` and the device runs on battery. Asks the browser nothing while not active. */
function useDischarging(active: boolean): boolean {
  const [discharging, setDischarging] = useState(false)
  useEffect(() => {
    if (!active) return
    const stop = watchBattery(globalThis.navigator, setDischarging)
    return () => {
      stop()
      setDischarging(false)
    }
  }, [active])
  return active && discharging
}

// -------------------------------------------------------------- visibility

const pageHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

/** True while the page is hidden (another tab in front, the window minimised): nothing is drawn then. */
export function usePageHidden(): boolean {
  return useSyncExternalStore(subscribeVisibility, pageHidden, () => false)
}

// ------------------------------------------------------------------- hooks

const reducedQuery = '(prefers-reduced-motion: reduce)'

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(reducedQuery).matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia(reducedQuery)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** The attention dial as it stands, for the world's frame loop and Settings → Attention. */
export function useAttention(): Attention {
  const pref = useGame((s) => s.game.settings.motion)
  const reduced = usePrefersReducedMotion()
  const on = isOn('attention')
  const quiet = useGame((s) => s.game.settings.quiet)
  const batterySaver = useGame((s) => s.game.settings.batterySaver)
  const discharging = useDischarging(on && batterySaver)
  return attentionOf(chosenMotion(pref, reduced), { on, quiet, batterySaver, discharging })
}

/** The motion level in effect, for everything drawn in the scene (World.tsx provides it from `useAttention`). */
export const MotionContext = createContext<MotionLevel>('full')
export const useMotion = () => useContext(MotionContext)

/**
 * Whether the island's wanderers (the animals that walk about their patch,
 * and the ducks paddling round the pond) are on the move. Quiet mode stands
 * them still where they are: its "fewer actors".
 */
export const WanderContext = createContext(true)
export const useWandering = () => useContext(WanderContext)
