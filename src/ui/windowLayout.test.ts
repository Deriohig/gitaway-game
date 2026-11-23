/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { LogicalSize, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DockId } from '../world/blueprint'
import { defaultFrame, frameDistance } from '../world/framing'
import { createWindowShaper, EDGE, NORMAL_MIN, NORMAL_SIZE, SHAPES } from './windowLayout'

// Tauri's window API is replaced by a stand-in window on a monitor: logical sizes become physical ones at the
// monitor's scale, and the frame round the page adds to the outer size.

type Size = { width: number; height: number }
type Point = { x: number; y: number }
type Dim = LogicalSize | PhysicalSize

/** The window methods the layouts use. Any other call fails the test, so the permission list below stays complete. */
const WINDOW_CALLS = ['innerSize', 'outerSize', 'outerPosition', 'isMaximized', 'scaleFactor', 'setSize', 'setMinSize', 'setPosition', 'setAlwaysOnTop', 'maximize', 'unmaximize'] as const

class FakeWindow {
  log: string[] = []
  minSize: Size | null = null
  onTop = false
  maximized = false
  /** `frame` is the title bar and borders, in physical pixels. */
  constructor(public inner: Size, public at: Point, public scale = 1, public frame: Size = { width: 16, height: 40 }) {}
  private phys = (s: Dim): Size => (s instanceof LogicalSize ? { width: Math.round(s.width * this.scale), height: Math.round(s.height * this.scale) } : { width: s.width, height: s.height })
  innerSize = async () => new PhysicalSize(this.inner.width, this.inner.height)
  outerSize = async () => new PhysicalSize(this.inner.width + this.frame.width, this.inner.height + this.frame.height)
  outerPosition = async () => new PhysicalPosition(this.at.x, this.at.y)
  isMaximized = async () => this.maximized
  scaleFactor = async () => this.scale
  setSize = async (s: Dim) => {
    if (this.maximized) throw new Error('a maximised window keeps its size')
    this.inner = this.phys(s)
    this.log.push(`size ${s.type} ${s.width}x${s.height}`)
  }
  setMinSize = async (s: Dim | null) => {
    this.minSize = s && this.phys(s)
    this.log.push(s ? `min ${s.type} ${s.width}x${s.height}` : 'min none')
  }
  setPosition = async (p: PhysicalPosition) => ((this.at = { x: p.x, y: p.y }), this.log.push(`position ${p.x},${p.y}`))
  setAlwaysOnTop = async (on: boolean) => ((this.onTop = on), this.log.push(`on top ${on}`))
  maximize = async () => ((this.maximized = true), this.log.push('maximize'))
  unmaximize = async () => ((this.maximized = false), this.log.push('unmaximize'))
}

const tauri = vi.hoisted(() => ({ window: null as unknown, monitor: null as unknown }))

vi.mock('@tauri-apps/api/window', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/window')>()),
  getCurrentWindow: () =>
    new Proxy(tauri.window as object, {
      get(target, key) {
        if (typeof key === 'string' && !(WINDOW_CALLS as readonly string[]).includes(key)) throw new Error(`the layouts called window.${key}, which isn't in WINDOW_CALLS`)
        return Reflect.get(target, key)
      },
    }),
  currentMonitor: async () => tauri.monitor,
}))

/** A monitor whose work area (the screen less the taskbar) is at `at`, `size` across, in physical pixels. */
const monitor = (at: Point, size: Size, scaleFactor: number) => ({
  name: 'Monitor',
  scaleFactor,
  position: new PhysicalPosition(at.x, at.y),
  size: new PhysicalSize(size.width, size.height + 80),
  workArea: { position: new PhysicalPosition(at.x, at.y), size: new PhysicalSize(size.width, size.height) },
})

const items = new Map<string, string>()
const storage = { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) }
const BEFORE = { inner: { width: 3000, height: 1700 }, at: { x: 200, y: 120 } }
let win: FakeWindow

beforeEach(() => {
  items.clear()
  win = new FakeWindow(BEFORE.inner, BEFORE.at, 2) // on a 4K screen at 200%: work area 3840 x 2080 physical pixels
  tauri.window = win
  tauri.monitor = monitor({ x: 0, y: 0 }, { width: 3840, height: 2080 }, 2)
})

/** Where the window's outer edges are, in physical pixels. */
const edges = () => ({ left: win.at.x, top: win.at.y, right: win.at.x + win.inner.width + win.frame.width, bottom: win.at.y + win.inner.height + win.frame.height })
const expectBackToBefore = () => expect({ inner: win.inner, at: win.at }).toEqual(BEFORE)
const sizeLog = () => win.log.filter((l) => l.startsWith('size'))
const NORMAL_MIN_PX = { width: NORMAL_MIN.width * 2, height: NORMAL_MIN.height * 2 }
/** Makes one window method throw, returning a function that puts it back. */
function breakMethod(method: 'setSize' | 'setPosition') {
  const real = win[method]
  win[method] = async () => {
    throw new Error('not allowed')
  }
  return () => void (win[method] = real as never)
}

describe('the window layouts', () => {
  it.each([
    ['strip', { width: 720, height: 220 }, { width: 1440, height: 440 }],
    ['corner', { width: 360, height: 360 }, { width: 720, height: 720 }],
  ] as const)('make a %s %o logical pixels, placed on the screen', async (shape, logical, inner) => {
    await createWindowShaper(storage).apply(shape, false)
    expect(SHAPES[shape]).toEqual(logical)
    expect(win.log).toContain(`size Logical ${logical.width}x${logical.height}`)
    expect(win.inner).toEqual(inner)
    // The least size comes down from the normal window's, or it couldn't be this small.
    expect(win.minSize!.width).toBeLessThanOrEqual(inner.width)
    expect(win.minSize!.height).toBeLessThanOrEqual(inner.height)
    const e = edges()
    expect(e.bottom).toBe(2080 - EDGE * 2)
    if (shape === 'strip') expect(e.left + e.right).toBe(3840) // along the bottom in the middle
    else expect(e.right).toBe(3840 - EDGE * 2) // bottom-right of the work area
  })

  it('use the monitor the window is on, whatever its place and scale; with none known, resize and stay put', async () => {
    tauri.monitor = monitor({ x: -1920, y: 40 }, { width: 1920, height: 1040 }, 1) // a second screen to the left at 100%
    win.scale = 1
    await createWindowShaper(storage).apply('corner', false)
    expect(win.inner).toEqual({ width: 360, height: 360 })
    expect(edges()).toMatchObject({ right: -EDGE, bottom: 40 + 1040 - EDGE })

    win = new FakeWindow(BEFORE.inner, BEFORE.at, 2)
    tauri.window = win
    tauri.monitor = null
    await createWindowShaper(storage).apply('corner', false)
    expect(win.inner).toEqual({ width: 720, height: 720 })
    expect(win.at).toEqual(BEFORE.at)
  })

  it('keep the window on top, or not, whatever its shape, changing nothing else', async () => {
    const shaper = createWindowShaper(storage)
    await shaper.apply('normal', true)
    expect([win.onTop, win.log]).toEqual([true, ['on top true']])
    await shaper.apply('corner', true)
    expect(win.onTop).toBe(true)
    await shaper.apply('corner', false)
    expect([win.onTop, win.log.at(-1), sizeLog()]).toEqual([false, 'on top false', ['size Logical 360x360']])
  })

  it('go back from Strip or Corner to the size and place from before, with the normal least size', async () => {
    const shaper = createWindowShaper(storage)
    for (const shape of ['strip', 'corner', 'normal'] as const) await shaper.apply(shape, false)
    expectBackToBefore()
    expect(win.log).toContain(`min Logical ${NORMAL_MIN.width}x${NORMAL_MIN.height}`)
    expect(win.minSize).toEqual(NORMAL_MIN_PX)
  })

  it('unmaximise a maximised window to make it small, and maximise it again on going back', async () => {
    win.maximized = true
    const shaper = createWindowShaper(storage)
    await shaper.apply('corner', false)
    expect([win.maximized, win.inner]).toEqual([false, { width: 720, height: 720 }])
    await shaper.apply('normal', false)
    expect(win.maximized).toBe(true)
  })

  it('take the chosen layout up again at launch (first launch or after quitting), still going back to the size from before', async () => {
    await createWindowShaper(storage).apply('corner', false) // last time: normal to corner, then quit
    win = new FakeWindow({ width: NORMAL_SIZE.width * 2, height: NORMAL_SIZE.height * 2 }, { x: 640, y: 240 }, 2) // opens at the config's size
    tauri.window = win
    const shaper = createWindowShaper(storage)
    await shaper.apply('corner', false, { atLaunch: true })
    expect(win.inner).toEqual({ width: 720, height: 720 })
    await shaper.apply('normal', false)
    expectBackToBefore()

    // At a first launch (nothing kept) it goes back to the size the window opened at.
    items.clear()
    win = new FakeWindow(BEFORE.inner, BEFORE.at, 2)
    tauri.window = win
    const first = createWindowShaper(storage)
    await first.apply('strip', false, { atLaunch: true })
    await first.apply('normal', false)
    expectBackToBefore()
  })

  it("with nothing kept (storage blocked), go back to the config's size in the middle of the screen", async () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const shaper = createWindowShaper(blocked)
    await shaper.apply('corner', false)
    await shaper.apply('normal', false)
    expect(win.log).toContain(`size Logical ${NORMAL_SIZE.width}x${NORMAL_SIZE.height}`)
    const e = edges()
    expect([e.left + e.right, e.top + e.bottom]).toEqual([3840, 2080])
  })

  it('make one change at a time, in order, and carry on after one fails', async () => {
    const shaper = createWindowShaper(storage)
    await Promise.all([shaper.apply('strip', false), shaper.apply('corner', false)])
    expect(sizeLog()).toEqual(['size Logical 720x220', 'size Logical 360x360'])
    const restore = breakMethod('setSize')
    await expect(shaper.apply('strip', false)).rejects.toThrow('not allowed')
    restore()
    await shaper.apply('normal', false)
    expectBackToBefore()
  })

  it('recover from a change that failed part-way: Normal puts it right, and the layout is made in full when asked again', async () => {
    const shaper = createWindowShaper(storage)
    let restore = breakMethod('setSize') // the least size came down, then resizing failed
    await expect(shaper.apply('corner', false)).rejects.toThrow('not allowed')
    expect(win.minSize!.width).toBeLessThan(NORMAL_MIN_PX.width)
    restore()
    await shaper.apply('normal', false)
    expect(win.minSize).toEqual(NORMAL_MIN_PX)
    expectBackToBefore()

    restore = breakMethod('setPosition')
    await expect(shaper.apply('corner', false)).rejects.toThrow('not allowed')
    restore()
    await shaper.apply('corner', false)
    expect(edges()).toMatchObject({ right: 3840 - EDGE * 2, bottom: 2080 - EDGE * 2 })
    await shaper.apply('normal', false)
    expectBackToBefore()
  })
})

it('frames the island in Strip and Corner as on any screen at least as wide as it is tall', () => {
  const docked: DockId[] = ['meadow', 'grove', 'islet', 'wetland', 'highland', 'orchard', 'cottage']
  for (const { width, height } of [SHAPES.strip, SHAPES.corner]) expect(defaultFrame(docked, width / height)).toBe(frameDistance([], width / height))
})

describe('the desktop capability', () => {
  const capability = JSON.parse(readFileSync(new URL('../../src-tauri/capabilities/default.json', import.meta.url), 'utf8')) as { windows: string[]; permissions: string[] }
  const docs = readFileSync(new URL('../../node_modules/@tauri-apps/api/window.d.ts', import.meta.url), 'utf8')

  /** The permission a window method needs beyond `core:window:default`, from the API's own documentation. */
  const needs = (method: string): string | null => {
    const doc = docs.match(new RegExp(`/\\*\\*((?:(?!\\*/)[\\s\\S])*)\\*/\\s*${method}\\(`))?.[1] ?? ''
    expect(doc, `the docs for ${method}`).not.toBe('')
    return doc.match(/Requires the `(core:window:[a-z-]+)` permission \(not included/)?.[1] ?? null
  }

  it('grants the main window just what the layouts use, and nothing more', () => {
    const required = [...new Set(WINDOW_CALLS.map(needs).filter((p): p is string => p !== null))].sort()
    expect(required).toEqual(['maximize', 'set-always-on-top', 'set-min-size', 'set-position', 'set-size', 'unmaximize'].map((p) => `core:window:allow-${p}`))
    expect(capability.windows).toEqual(['main'])
    expect(capability.permissions).toEqual(['core:default', ...required])
  })
})
