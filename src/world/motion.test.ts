import { describe, expect, it, vi } from 'vitest'
import { attentionOf, chosenMotion, effectiveMotion, FPS, frameRate, QUIET_FPS, watchBattery, type MotionLevel } from './motion'

// The attention dial: quiet mode and the battery saver only ever calm the island down, and quiet mode caps the frame rate.

const LEVELS: MotionLevel[] = ['full', 'calm', 'still']
const RANK: Record<MotionLevel, number> = { still: 0, calm: 1, full: 2 }

describe('the motion level in effect', () => {
  it.each([['full', true, 'full'], ['calm', false, 'calm'], ['still', false, 'still'], ['auto', false, 'full'], ['auto', true, 'still']] as const)(
    'with the choice %s and the system asking for still=%s is %s',
    (choice, systemStill, level) => expect(chosenMotion(choice, systemStill)).toBe(level),
  )

  it('drops to calm in quiet mode or while saving power, from lively', () => {
    expect(effectiveMotion('full', { quiet: true, saving: false })).toBe('calm')
    expect(effectiveMotion('full', { quiet: false, saving: true })).toBe('calm')
    expect(effectiveMotion('full', { quiet: false, saving: false })).toBe('full')
  })

  it('never raises a level the player chose lower', () => {
    for (const chosen of LEVELS)
      for (const quiet of [false, true])
        for (const saving of [false, true]) expect(RANK[effectiveMotion(chosen, { quiet, saving })]).toBeLessThanOrEqual(RANK[chosen])
  })
})

describe('the frame cap', () => {
  it('is 30, 15 and only-on-change (0) by level, and ten a second in quiet mode, where still stays still', () => {
    expect(LEVELS.map((l) => frameRate(l, false))).toEqual([30, 15, 0])
    expect(QUIET_FPS).toBe(10)
    expect(LEVELS.map((l) => frameRate(l, true))).toEqual([10, 10, 0])
  })
})

describe('the dial as a whole', () => {
  const on = { on: true, quiet: false, batterySaver: false, discharging: false }

  it('with the Attention switch off, is the motion level alone, whatever the save says', () => {
    for (const chosen of LEVELS) {
      expect(attentionOf(chosen, { on: false, quiet: true, batterySaver: true, discharging: true })).toEqual({ level: chosen, fps: FPS[chosen], quiet: false, saving: false })
    }
  })

  it('in quiet mode, draws calmly at ten frames a second', () => {
    expect(attentionOf('full', { ...on, quiet: true })).toEqual({ level: 'calm', fps: 10, quiet: true, saving: false })
    expect(attentionOf('still', { ...on, quiet: true })).toEqual({ level: 'still', fps: 0, quiet: true, saving: false })
  })

  it('saves power only on battery, and only when the saver is on; nothing said if already calmer', () => {
    expect(attentionOf('full', { ...on, batterySaver: true, discharging: true })).toEqual({ level: 'calm', fps: FPS.calm, quiet: false, saving: true })
    expect(attentionOf('full', { ...on, batterySaver: true }).level).toBe('full')
    expect(attentionOf('full', { ...on, discharging: true }).level).toBe('full')
    expect(attentionOf('still', { ...on, batterySaver: true, discharging: true })).toEqual({ level: 'still', fps: 0, quiet: false, saving: false })
  })
})

/** A stand-in for the Battery API's BatteryManager. */
class FakeBattery extends EventTarget {
  constructor(public charging: boolean) {
    super()
  }
  plug(charging: boolean) {
    this.charging = charging
    this.dispatchEvent(new Event('chargingchange'))
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('watching the battery', () => {
  it('reports running on battery, and plugging in and out; a plugged-in device is not on battery', async () => {
    const battery = new FakeBattery(false)
    const seen: boolean[] = []
    watchBattery({ getBattery: async () => battery }, (d) => seen.push(d))
    await settle()
    battery.plug(true)
    battery.plug(false)
    expect(seen).toEqual([true, false, true])

    const plugged: boolean[] = []
    watchBattery({ getBattery: async () => new FakeBattery(true) }, (d) => plugged.push(d))
    await settle()
    expect(plugged).toEqual([false])
  })

  it('asks the browser with the navigator itself, as Chromium needs', async () => {
    const nav = {
      getBattery(this: unknown) {
        if (this !== nav) throw new TypeError('Illegal invocation')
        return Promise.resolve(new FakeBattery(false))
      },
    }
    const onChange = vi.fn()
    watchBattery(nav, onChange)
    await settle()
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('does nothing, and never throws, where there is no Battery API or it refuses, at once or later', async () => {
    const onChange = vi.fn()
    for (const nav of [undefined, null, {}, { getBattery: 'no' }]) expect(() => watchBattery(nav, onChange)()).not.toThrow()
    const refused = () => {
      throw new DOMException('Not allowed', 'NotAllowedError')
    }
    expect(() => watchBattery({ getBattery: refused }, onChange)).not.toThrow()
    expect(() => watchBattery({ getBattery: () => Promise.reject(new Error('no battery')) }, onChange)).not.toThrow()
    expect(() => watchBattery({ getBattery: async () => null }, onChange)).not.toThrow()
    await settle()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops listening once stopped, even before the battery answers', async () => {
    const battery = new FakeBattery(false)
    const early = vi.fn()
    watchBattery({ getBattery: async () => battery }, early)()
    const late = vi.fn()
    const stop = watchBattery({ getBattery: async () => battery }, late)
    await settle()
    expect(late).toHaveBeenCalledTimes(1)
    stop()
    battery.plug(true)
    expect(early).not.toHaveBeenCalled()
    expect(late).toHaveBeenCalledTimes(1)
  })
})
