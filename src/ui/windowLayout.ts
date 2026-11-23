import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition, PhysicalSize, type Window } from '@tauri-apps/api/window'
import { useEffect, useRef } from 'react'
import { isOn } from '../game/features'
import type { WindowLayout } from '../game/state'
import { isDesktop } from '../integrations/localGit'
import { useGame } from '../store/game'

// The desktop app's window layouts (A6, Settings → Attention): Normal, a wide
// short Strip along the bottom of the screen, and a small square in the
// bottom-right Corner of the monitor the window is on, plus keeping the window
// on top of the others. Only the desktop app has a window to shape; the
// capability in src-tauri/capabilities/default.json grants just the calls
// made here.

/** The small layouts' sizes, in logical pixels. */
export const SHAPES = {
  strip: { width: 720, height: 220 },
  corner: { width: 360, height: 360 },
} as const

/** The normal window's size and least size, as src-tauri/tauri.conf.json opens it. */
export const NORMAL_SIZE = { width: 1280, height: 800 }
export const NORMAL_MIN = { width: 900, height: 600 }
/** The least size while small, where the compact HUD still fits. */
export const SMALL_MIN = { width: 320, height: 200 }
/** Room left between a small window and the edges of the screen, in logical pixels. */
export const EDGE = 16

/** Where the window was, and how big, in its normal layout: what Normal goes back to. Physical pixels. */
interface NormalBounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

/** Kept on the device, not in the farm: it's this screen's, and the farm can move to another. */
const KEPT = 'gitaway:normal-window'

type KeptStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): KeptStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

const whole = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

function readKept(storage: KeptStorage | undefined): NormalBounds | null {
  try {
    const b = JSON.parse(storage?.getItem(KEPT) ?? 'null') as Partial<NormalBounds> | null
    if (!b || ![b.x, b.y, b.width, b.height].every(whole) || b.width! <= 0 || b.height! <= 0) return null
    return { x: b.x!, y: b.y!, width: b.width!, height: b.height!, maximized: b.maximized === true }
  } catch {
    return null
  }
}

function keep(storage: KeptStorage | undefined, bounds: NormalBounds) {
  try {
    storage?.setItem(KEPT, JSON.stringify(bounds))
  } catch {
    // Storage is blocked: Normal goes back to the config's size instead.
  }
}

async function boundsOf(win: Window): Promise<NormalBounds> {
  const [at, size, maximized] = await Promise.all([win.outerPosition(), win.innerSize(), win.isMaximized()])
  return { x: at.x, y: at.y, width: size.width, height: size.height, maximized }
}

/**
 * Sizes the window to `inner` (logical pixels) and moves it to where `place`
 * says in the current monitor's work area (the screen less the taskbar or
 * dock), from the outer size it will have: the frame round the page is
 * measured first, so nothing waits on the resize to land.
 */
async function sizeAndPlace(win: Window, inner: { width: number; height: number }, place: (area: { x: number; y: number; width: number; height: number }, outer: { width: number; height: number }, edge: number) => { x: number; y: number }) {
  const monitor = await currentMonitor()
  const scale = monitor?.scaleFactor ?? (await win.scaleFactor())
  const [innerNow, outerNow] = await Promise.all([win.innerSize(), win.outerSize()])
  await win.setSize(new LogicalSize(inner.width, inner.height))
  if (!monitor) return
  const outer = {
    width: Math.round(inner.width * scale) + outerNow.width - innerNow.width,
    height: Math.round(inner.height * scale) + outerNow.height - innerNow.height,
  }
  const { position, size } = monitor.workArea
  const area = { x: position.x, y: position.y, width: size.width, height: size.height }
  const at = place(area, outer, Math.round(EDGE * scale))
  await win.setPosition(new PhysicalPosition(Math.round(Math.max(area.x, at.x)), Math.round(Math.max(area.y, at.y))))
}

/** Along the bottom, in the middle (Strip), or in the bottom-right corner (Corner). */
const SMALL_PLACE = {
  strip: (a: { x: number; y: number; width: number; height: number }, o: { width: number; height: number }, edge: number) => ({ x: a.x + (a.width - o.width) / 2, y: a.y + a.height - o.height - edge }),
  corner: (a: { x: number; y: number; width: number; height: number }, o: { width: number; height: number }, edge: number) => ({ x: a.x + a.width - o.width - edge, y: a.y + a.height - o.height - edge }),
}

/**
 * Shapes the desktop window. It remembers which layout the window has (at
 * launch, the normal one the config opens), and on leaving Normal keeps the
 * window's size and place, on the device, to go back to. Changes run one at a
 * time, in order; one that fails rejects without stopping the next.
 */
export function createWindowShaper(storage: KeptStorage | undefined = browserStorage()) {
  /** The layout the window has; null after a change failed part-way, when it may be neither, so the next is made in full. */
  let current: WindowLayout | null = 'normal'
  let queue: Promise<unknown> = Promise.resolve()

  const toNormal = async (win: Window) => {
    await win.setMinSize(new LogicalSize(NORMAL_MIN.width, NORMAL_MIN.height))
    const kept = readKept(storage)
    if (!kept) {
      await sizeAndPlace(win, NORMAL_SIZE, (a, o) => ({ x: a.x + (a.width - o.width) / 2, y: a.y + (a.height - o.height) / 2 }))
      return
    }
    await win.setSize(new PhysicalSize(kept.width, kept.height))
    await win.setPosition(new PhysicalPosition(kept.x, kept.y))
    if (kept.maximized) await win.maximize()
  }

  const toSmall = async (win: Window, layout: Exclude<WindowLayout, 'normal'>) => {
    if (await win.isMaximized()) await win.unmaximize()
    await win.setMinSize(new LogicalSize(SMALL_MIN.width, SMALL_MIN.height))
    await sizeAndPlace(win, SHAPES[layout], SMALL_PLACE[layout])
  }

  const apply = async (layout: WindowLayout, keepOnTop: boolean, atLaunch: boolean) => {
    const win = getCurrentWindow()
    if (layout !== current) {
      // Leaving the normal layout: keep where it is, to go back to. At launch it has only just
      // opened at the config's size, so what was kept when it last left Normal stands.
      if (layout !== 'normal' && current === 'normal' && !(atLaunch && readKept(storage))) keep(storage, await boundsOf(win))
      // From here until it's done the window may be neither layout: if this fails, the next change is made in full.
      current = null
      if (layout === 'normal') await toNormal(win)
      else await toSmall(win, layout)
      current = layout
    }
    // A window opens below the others, so at launch there's nothing to undo.
    if (keepOnTop || !atLaunch) await win.setAlwaysOnTop(keepOnTop)
  }

  return {
    /** Gives the window `layout`, on top of the others or not. `atLaunch` is the first call, as the app opens. */
    apply(layout: WindowLayout, keepOnTop: boolean, { atLaunch = false }: { atLaunch?: boolean } = {}): Promise<void> {
      const run = queue.then(() => apply(layout, keepOnTop, atLaunch))
      queue = run.catch(() => {})
      return run
    },
  }
}

let shaper: ReturnType<typeof createWindowShaper> | null = null

/** Gives the desktop window a layout, and says so with a warning if it can't. */
function shapeWindow(layout: WindowLayout, keepOnTop: boolean, atLaunch = false) {
  shaper ??= createWindowShaper()
  shaper.apply(layout, keepOnTop, { atLaunch }).catch(() => {
    useGame.getState().notify({ kind: 'warn', title: "The window couldn't change its layout", detail: 'Try again, or resize it by hand.' })
  })
}

/**
 * Gives the window the layout it's set to again, for picking the layout
 * that's already chosen: after a change that failed, that's how to try again.
 */
export function reshapeWindow() {
  if (!isOn('attention') || !isDesktop()) return
  const { windowLayout, keepOnTop } = useGame.getState().game.settings
  shapeWindow(windowLayout, keepOnTop)
}

/**
 * Keeps the desktop window in the layout the player chose (Settings →
 * Attention): at launch, when it isn't the usual one, and on every change.
 * Does nothing in a browser, or while the Attention switch is off.
 */
export function useWindowLayout() {
  const loaded = useGame((s) => s.loaded)
  const layout = useGame((s) => s.game.settings.windowLayout)
  const keepOnTop = useGame((s) => s.game.settings.keepOnTop)
  const launched = useRef(false)
  useEffect(() => {
    if (!loaded || !isOn('attention') || !isDesktop()) return
    const atLaunch = !launched.current
    launched.current = true
    if (atLaunch && layout === 'normal' && !keepOnTop) return
    shapeWindow(layout, keepOnTop, atLaunch)
  }, [loaded, layout, keepOnTop])
}
