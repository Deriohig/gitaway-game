/// <reference path="../dev-tools.d.ts" />
// (The e2e specs type-check some game files without the app's own types; this file reads `__DEV_TOOLS__`.)

// The game's one clock. Everything that reads the current time for the game
// (the store, the timers on screen, the light in the world) asks `now()`, so a
// development build (or a dev-tools build) can move it forward to try out
// things that take hours.
//
// In ordinary builds the offset is always 0 and `now()` is `Date.now()`:
// every branch that could change it checks `__DEV_TOOLS__`, which the build
// replaces with `false`, so that code isn't even in the bundle.

const STORAGE_KEY = 'gitaway:dev-clock'

type Listener = () => void
const listeners = new Set<Listener>()

/** The stored offset, so a reload in development doesn't make the clock jump backwards. */
function readStored(): number {
  try {
    const value = Number(globalThis.localStorage?.getItem(STORAGE_KEY))
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  } catch {
    return 0
  }
}

function store(value: number) {
  try {
    if (value > 0) globalThis.localStorage?.setItem(STORAGE_KEY, String(value))
    else globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    // Storage is blocked: the offset lasts until the page is reloaded.
  }
}

let offset = __DEV_TOOLS__ ? readStored() : 0

// Every open tab shares the stored offset: a later skip made in another tab is
// taken up here (and `skipAhead` goes on from the furthest one), so no tab's
// clock goes back on a reload; erasing the farm in any tab, which removes it,
// puts them all back on the device's clock.
if (__DEV_TOOLS__) {
  globalThis.addEventListener?.('storage', (e: StorageEvent) => {
    if (e.key !== null && e.key !== STORAGE_KEY) return
    const stored = readStored()
    if (stored === offset || (stored < offset && stored > 0)) return
    offset = stored
    changed()
  })
}

/** The game's current time, in milliseconds since the epoch. */
export function now(): number {
  return Date.now() + offset
}

/** How far the game clock is ahead of the device's clock. Always 0 in production. */
export function clockOffset(): number {
  return offset
}

/**
 * The device's time when the game clock reads `at`: what real-world times,
 * such as when a commit was made, are compared with. In production, where
 * the offset is 0, it is `at` itself.
 */
export function deviceTime(at: number): number {
  return at - offset
}

/** The offset after skipping ahead by `ms`. It only ever moves forward: going back would trip the clock-skew guards. */
export function skippedOffset(current: number, ms: number): number {
  return current + (Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : 0)
}

function changed() {
  listeners.forEach((listener) => listener())
}

/**
 * Dev-tools builds only: moves the game clock forward by `ms`, and keeps it
 * there across reloads. It goes on from the stored offset if another tab has
 * skipped further, so it never undoes that tab's skip. Returns the new offset.
 */
export function skipAhead(ms: number): number {
  if (!__DEV_TOOLS__) return 0
  const next = skippedOffset(Math.max(offset, readStored()), ms)
  if (next === offset) return offset
  offset = next
  store(offset)
  changed()
  return offset
}

/** Puts the game clock back on the device's time, as erasing the farm does. Nothing to do in production. */
export function resetClock(): void {
  if (!__DEV_TOOLS__) return
  const had = offset !== 0
  offset = 0
  store(0)
  if (had) changed()
}

/** Calls `listener` whenever the offset changes (only ever in a build with the dev tools). Returns the unsubscribe. */
export function subscribeClock(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
