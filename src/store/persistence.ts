import { createStore, delMany, get, set, type UseStore } from 'idb-keyval'
import { SAVE_VERSION, type GameState } from '../game/state'

// The farm is saved in this browser and nowhere else, in IndexedDB. Each save
// also records `savedAt`, when it was written, next to the farm's own fields
// (`migrate` ignores it, so older versions still read the save).
//
// IndexedDB writes are asynchronous, and one still queued or in flight when
// the page is closed or reloaded can be dropped. So before each write, the
// farm is also copied synchronously into this browser's localStorage, and on
// load whichever of the two is newer wins. The backup only lives while a write
// is in flight: the first save written after it clears it once it lands.
//
// Stamps only go forward. Each is later than any this tab has seen, on a save,
// a backup or another tab's message, so a clock that steps back can't make an
// older copy look newer.

const KEY = 'farm'
const BACKUP_KEY = 'gitaway:farm'

let store: UseStore | null = null
/** The latest stamp this tab has seen or given. */
let latestStamp = 0

/** Where an older version's save is kept, as it was, before this version first writes over it. */
const olderKey = (version: number) => `farm-v${version}`
const OLDER_KEYS = Array.from({ length: SAVE_VERSION - 1 }, (_, i) => olderKey(i + 1))

function db(): UseStore {
  store ??= createStore('gitaway', 'saves')
  return store
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** When a saved farm was written, or null for a save without a stamp. */
export function savedAtOf(raw: unknown): number | null {
  return isRecord(raw) && typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : null
}

/** Remembers a stamp seen elsewhere (such as in another tab's message), so this tab's next one is later. */
export function noteStamp(savedAt: unknown): void {
  if (typeof savedAt === 'number' && Number.isFinite(savedAt)) latestStamp = Math.max(latestStamp, savedAt)
}

/** A stamp for a new save or backup: now, or just after the latest stamp seen if the clock is behind it. */
function nextStamp(): number {
  latestStamp = Math.max(Date.now(), latestStamp + 1)
  return latestStamp
}

/**
 * Chooses between the IndexedDB save and the localStorage backup: the newer
 * one wins, and IndexedDB wins a tie. A save without a stamp was written by an
 * older version (or by hand) after any backup could have been, so it wins too.
 */
export function pickNewest(stored: unknown, backup: unknown): { raw: unknown; fromBackup: boolean } {
  const backupAt = savedAtOf(backup)
  if (backupAt === null) return { raw: stored, fromBackup: false }
  if (!isRecord(stored)) return { raw: backup, fromBackup: true }
  const storedAt = savedAtOf(stored)
  if (storedAt === null || storedAt >= backupAt) return { raw: stored, fromBackup: false }
  return { raw: backup, fromBackup: true }
}

export interface LoadedSave {
  /** The newest saved farm, still to be passed through `migrate`. */
  raw: unknown
  /** True when the farm came from the localStorage backup. */
  fromBackup: boolean
  /** The backup's stamp, or null if there was none. */
  backupAt: number | null
  /** False when IndexedDB can't be used in this browser. */
  available: boolean
}

export async function readSave(): Promise<LoadedSave> {
  let stored: unknown
  let available = false
  try {
    if (typeof indexedDB !== 'undefined') {
      stored = await get(KEY, db())
      available = true
    }
  } catch {
    // Storage is blocked; the backup may still hold something.
  }
  // Read after IndexedDB, so a backup written meanwhile is still seen.
  const backup = readBackup()
  const backupAt = savedAtOf(backup)
  noteStamp(savedAtOf(stored))
  noteStamp(backupAt)
  return { ...pickNewest(stored, backup), backupAt, available }
}

/**
 * Writes the farm to IndexedDB, and returns its stamp, or null if it couldn't
 * be written. A backup taken before this write has done its job once the
 * write lands, so it's cleared then; one taken while the write is on its way
 * is kept.
 */
export async function writeSave(state: GameState, savedAt?: number): Promise<number | null> {
  const backupAt = savedAtOf(readBackup())
  noteStamp(backupAt)
  const at = savedAt ?? nextStamp()
  noteStamp(at)
  try {
    await set(KEY, { ...state, savedAt: at }, db())
  } catch {
    return null
  }
  if (backupAt !== null && backupAt < at) clearBackup(backupAt)
  return at
}

function readBackup(): unknown {
  try {
    const text = localStorage.getItem(BACKUP_KEY)
    return text ? JSON.parse(text) : undefined
  } catch {
    return undefined
  }
}

/** Copies the farm into localStorage synchronously, so it survives the page going away before its save lands. */
export function writeBackup(state: GameState, savedAt = nextStamp()): boolean {
  noteStamp(savedAt)
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ ...state, savedAt }))
    return true
  } catch {
    return false
  }
}

/** Removes the backup, or with a stamp, only if it is still the one with that stamp. */
export function clearBackup(savedAt?: number): void {
  try {
    if (savedAt === undefined || savedAtOf(readBackup()) === savedAt) localStorage.removeItem(BACKUP_KEY)
  } catch {
    // Storage is blocked: there is no backup to remove.
  }
}

export async function eraseSave(): Promise<void> {
  clearBackup()
  try {
    await delMany([KEY, ...OLDER_KEYS], db())
  } catch {
    // Nothing stored, or storage is blocked: either way there is nothing to erase.
  }
}

/** Keeps an older version's save aside, untouched, under `farm-v<version>`. Erasing the farm removes it too. */
export async function keepOlderSave(raw: unknown, version: number): Promise<boolean> {
  try {
    await set(olderKey(version), raw, db())
    return true
  } catch {
    return false
  }
}
