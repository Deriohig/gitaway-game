import { invoke } from '@tauri-apps/api/core'
import { GIT_TOOK_TOO_LONG, gitErrorText } from './gitProblem'

// The desktop app's two Git commands. The native side does the reading and
// hands back a folder name, or commit counts with times, never anything else.
// They reject with { kind, message, command? } (see gitProblem.ts).

export interface PickedRepository {
  path: string
  /** Folder name, for display. */
  name: string
}

export interface RepositoryActivity {
  /** The player's own commits newer than `since`, not merges or empty, and not counted before. */
  count: number
  /** Commit time (Unix seconds) of the newest of them, never later than the clock; `since` if there are none. */
  latest: number
  /** Author times of commits counted ahead of their dates, to hand back next time. Absent when there are none. */
  ahead?: number[]
  /** Commits passed over because another watched folder counted them. Absent when there are none. */
  passed?: number
}

/** How long a count may take before it is given up on. */
const ACTIVITY_TIMEOUT_MS = 25_000

export const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * Opens a folder picker. Resolves to null if the player cancels. No time limit:
 * the dialog stays open for as long as the player needs.
 */
export const pickRepository = () => invoke<PickedRepository | null>('pick_repository')

/**
 * `since` is Unix seconds, and `ahead` the last answer's `ahead` (sent only
 * when there is something to send). Rejects if Git hasn't answered in 25
 * seconds, so a stuck call can't stall later checks.
 */
export function repositoryActivity(path: string, since: number, ahead: readonly number[] = []): Promise<RepositoryActivity> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(GIT_TOOK_TOO_LONG), ACTIVITY_TIMEOUT_MS)
  })
  const args = ahead.length ? { path, since, ahead: [...ahead] } : { path, since }
  return Promise.race([invoke<RepositoryActivity>('repository_activity', args), timeout]).finally(() => clearTimeout(timer))
}

/** The native side rejects with a sentence meant for the player; anything else gets a plain fallback. */
export const errorText = gitErrorText
