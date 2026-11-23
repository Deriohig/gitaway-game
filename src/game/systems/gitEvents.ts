// Git-aware island events (C1, desktop only, local): the repo orchard, lantern
// nights for new tags, and the aliases repositories go by on screen. Commit
// rewards themselves live in the engine and are unchanged.

import { isOn } from '../features'
import type { Notice } from '../result'
import { field, time } from '../sanitize'
import type { GameState, WatchedRepo } from '../state'

/** Orchard tree names, given to repositories in order of the first unused. */
export const REPO_ALIASES = ['Apple', 'Pear', 'Plum', 'Cherry', 'Quince', 'Damson', 'Medlar', 'Fig'] as const

export const ALIAS_MAX = 24

/** The first alias no watched repository is using. */
export function nextAlias(repos: readonly { alias: string }[]): string {
  const taken = new Set(repos.map((r) => r.alias))
  const free = REPO_ALIASES.find((a) => !taken.has(a))
  if (free) return free
  let n = repos.length + 1
  while (taken.has(`Tree ${n}`)) n++
  return `Tree ${n}`
}

/**
 * How a repository is named in toasts and the journal: its alias, unless the
 * player chose real names (a choice that only counts while this feature is on).
 */
export function repoLabel(s: GameState, repo: WatchedRepo): string {
  return isOn('gitEvents') && s.settings.showRepoNames ? repo.name : `the ${repo.alias} tree`
}

/** The orchard islet drifts in once any repository has had a commit counted. */
export const orchardVisible = (s: GameState): boolean => s.repos.some((r) => r.commits > 0)

export function sanitizeGitEvents(raw: unknown, _base: GameState, _now: number): Pick<GameState, 'lanternNightUntil'> {
  return { lanternNightUntil: time(field(raw, 'lanternNightUntil')) }
}

/** Lantern night ends at its morning. Nothing to do until the git feature raises lanterns. */
export function advanceGitEvents(_s: GameState, _now: number, _out: Notice[]): boolean {
  return false
}
