import 'fake-indexeddb/auto'
import { createStore, set } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrate } from '../game/save'
import { createInitialState } from '../game/state'
import { clearBackup, eraseSave, noteStamp, pickNewest, readSave, savedAtOf, writeBackup, writeSave } from './persistence'

const T0 = Date.UTC(2026, 9, 17, 9, 0, 0)

const farm = (farmName: string, savedAt?: number) => ({ ...createInitialState(T0), farmName, ...(savedAt === undefined ? {} : { savedAt }) })
const named = (farmName: string) => ({ ...createInitialState(T0), farmName })

/** localStorage as a browser that blocks site data exposes it: every call throws. */
const blockedStorage = new Proxy(
  {},
  {
    get() {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    },
  },
)

describe('pickNewest', () => {
  it.each<[string, unknown, unknown, boolean]>([
    ['takes the backup when it is newer than the save', farm('Saved', 1000), farm('Backup', 2000), true],
    ['never lets an older backup replace a newer save', farm('Saved', 3000), farm('Backup', 2000), false],
    ['keeps the save on a tie', farm('Saved', 2000), farm('Backup', 2000), false],
    ['trusts a save with no stamp, as older versions wrote it', farm('Saved'), farm('Backup', 2000), false],
    ['ignores a backup with no stamp', farm('Saved', 1000), farm('Backup'), false],
    ['ignores a backup with a stamp that is not a number', farm('Saved', 1000), { ...farm('Backup'), savedAt: 'later' }, false],
    ['ignores a backup that is not a farm', farm('Saved', 1000), 'garbage', false],
  ])('%s', (_, save, backup, fromBackup) => {
    const pick = pickNewest(save, backup)
    expect(pick.fromBackup).toBe(fromBackup)
    expect((pick.raw as { farmName: string }).farmName).toBe(fromBackup ? 'Backup' : 'Saved')
  })

  it('uses the save when there is no backup, and the backup when there is no save', () => {
    expect(pickNewest(farm('Saved', 1000), undefined)).toMatchObject({ fromBackup: false, raw: { farmName: 'Saved' } })
    expect(pickNewest(undefined, farm('Backup', 1000))).toMatchObject({ fromBackup: true, raw: { farmName: 'Backup' } })
    expect(pickNewest(undefined, undefined)).toEqual({ raw: undefined, fromBackup: false })
  })
})

describe('save and backup', () => {
  beforeEach(async () => {
    const items = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) })
    await eraseSave()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('stamps the save without changing what migrate reads', async () => {
    await writeSave(named('Stamped'), 1234)
    const { raw, fromBackup, available } = await readSave()
    expect([available, fromBackup]).toEqual([true, false])
    expect(raw).toMatchObject({ farmName: 'Stamped', savedAt: 1234 })
    expect(migrate(raw, T0)).toEqual(named('Stamped'))
  })

  it('loads the backup taken on leaving when the last save never landed', async () => {
    await writeSave(named('Before'), 1000)
    expect(writeBackup(named('After'), 2000)).toBe(true)
    const loaded = await readSave()
    expect(loaded).toMatchObject({ fromBackup: true, backupAt: 2000, raw: { farmName: 'After' } })
    expect(migrate(loaded.raw, T0)?.farmName).toBe('After')
  })

  it('clears the backup once a save written after it lands', async () => {
    writeBackup(named('Backup'), 1000)
    await writeSave(named('Saved'), 2000)
    expect(await readSave()).toMatchObject({ fromBackup: false, backupAt: null, raw: { farmName: 'Saved' } })
  })

  it('keeps a backup taken while a save was still on its way', async () => {
    const saving = writeSave(named('Saving'))
    writeBackup(named('Backup'))
    await saving
    expect(await readSave()).toMatchObject({ fromBackup: true, raw: { farmName: 'Backup' } })
  })

  it('stamps go forward even when the clock steps back, and come after a stamp another tab announced', async () => {
    // Another tab saved a minute later than this tab's clock now says.
    await set('farm', farm('Other Tab', T0 + 60_000), createStore('gitaway', 'saves'))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    await readSave()
    await writeSave(farm('Saved'))
    const savedAt = savedAtOf((await readSave()).raw)!
    expect(savedAt).toBeGreaterThan(T0 + 60_000)
    writeBackup(farm('Backup'))
    expect((await readSave()).backupAt).toBeGreaterThan(savedAt)
    noteStamp(T0 + 120_000)
    await writeSave(farm('Saved again'))
    expect(savedAtOf((await readSave()).raw)).toBeGreaterThan(T0 + 120_000)
  })

  it('clears a backup only while it is still the one that was read', async () => {
    writeBackup(createInitialState(T0), 1000)
    clearBackup(999)
    expect((await readSave()).backupAt).toBe(1000)
    clearBackup(1000)
    expect((await readSave()).backupAt).toBeNull()
  })

  it('erasing the farm removes the save and the backup', async () => {
    await writeSave(createInitialState(T0), 1000)
    writeBackup(createInitialState(T0), 2000)
    await eraseSave()
    expect(await readSave()).toMatchObject({ raw: undefined, fromBackup: false, backupAt: null })
  })

  it('still saves and loads when localStorage is blocked', async () => {
    await writeSave(named('Saved'), 1000)
    vi.stubGlobal('localStorage', blockedStorage)
    expect(writeBackup(createInitialState(T0), 2000)).toBe(false)
    expect(() => clearBackup()).not.toThrow()
    expect(await readSave()).toMatchObject({ fromBackup: false, backupAt: null, raw: { farmName: 'Saved' } })
    await expect(eraseSave()).resolves.toBeUndefined()
  })
})
