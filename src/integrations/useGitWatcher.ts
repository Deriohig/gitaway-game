import { useEffect, useSyncExternalStore } from 'react'
import { deviceTime } from '../game/clock'
import { recordCommits, type Notice } from '../game/engine'
import { FIELD, earnedAll } from '../game/fairCounting'
import { isOn } from '../game/features'
import type { WatchedRepo } from '../game/state'
import { repoLabel } from '../game/systems/gitEvents'
import { useGame } from '../store/game'
import { tellsNoFolder } from './gitProblem'
import { errorText, isDesktop, repositoryActivity } from './localGit'

// Asks the desktop side for new commits in the watched repositories: when the
// game opens, every couple of minutes, and whenever the window comes back into
// focus. The game rules decide what a report is worth.

const INTERVAL = 2 * 60_000
/** Automatic checks (the timer and window focus) keep at least this far apart. */
const MIN_GAP = 30_000

interface CheckSummary {
  /** At least one repository paid out. */
  paid: boolean
  /** New commits turned up, but today's allowance was already used up. */
  capped: boolean
  failed: boolean
}

let inFlight: Promise<CheckSummary> | null = null
let manual: Promise<void> | null = null
let lastStarted = 0
/** Repositories that have already shown an error this session. One toast each is plenty. */
const warned = new Set<string>()

// The last error each watched folder's check ran into, by path, until a check
// of it works again. With fair counting on, Settings → Commits shows it in
// full, since a toast keeps the folder's name and path out (A7, G7).
let problems: ReadonlyMap<string, unknown> = new Map()
const listeners = new Set<() => void>()

function setProblem(path: string, error: unknown) {
  if (error === undefined ? !problems.has(path) : problems.get(path) === error) return
  const next = new Map(problems)
  if (error === undefined) next.delete(path)
  else next.set(path, error)
  problems = next
  for (const listener of listeners) listener()
}

/** The checks' last errors, by repository path. */
export const checkProblems = (): ReadonlyMap<string, unknown> => problems

// A repository that stops being watched takes its problem with it, so adding
// it again (the usual step after trusting the folder) starts clean.
useGame.subscribe((state, before) => {
  if (state.game.repos === before.game.repos) return
  for (const path of problems.keys()) if (!state.game.repos.some((r) => r.path === path)) setProblem(path, undefined)
})

const stillWatched = (path: string) => useGame.getState().game.repos.some((r) => r.path === path)

/** Puts away a check's problem, as its note's Dismiss does. */
export const forgetCheckProblem = (path: string) => setProblem(path, undefined)

/** The checks' last errors, by repository path, for a component. */
export function useCheckProblems(): ReadonlyMap<string, unknown> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    checkProblems,
    checkProblems,
  )
}

/** The toast for a check that failed. With fair counting on it names the repository by its tree, and leaves any folder or command to Settings → Commits. */
function checkFailed(repo: WatchedRepo, error: unknown): Notice {
  if (!isOn('fairCounting')) return { kind: 'warn', title: `Couldn't check ${repo.name}`, detail: errorText(error) }
  const detail = tellsNoFolder(error) ? errorText(error) : 'Open Settings → Commits to set it right.'
  return { kind: 'warn', title: `Couldn't check ${repoLabel(useGame.getState().game, repo)}`, detail }
}

async function checkEach(): Promise<CheckSummary> {
  const summary: CheckSummary = { paid: false, capped: false, failed: false }
  for (const { path } of useGame.getState().game.repos) {
    // Read the repository again each time round: it may have been removed or moved on meanwhile.
    const repo = useGame.getState().game.repos.find((r) => r.path === path)
    if (!repo) continue
    // The report counts from this cursor. If the cursor has moved by the time it
    // arrives, the rules turn the report down rather than pay twice.
    const since = repo.cursor
    try {
      const activity = await repositoryActivity(repo.path, since, repo.ahead)
      setProblem(repo.path, undefined)
      const before = useGame.getState().game.stats.commits
      // Commit times are the device's: the cursor follows its clock, not a dev build's skipped one.
      if (useGame.getState().run((s, now) => recordCommits(s, repo.path, { ...activity, since }, now, deviceTime(now)))) {
        if (useGame.getState().game.stats.commits > before) summary.paid = true
        // Commits another watched folder counted only move the cursor: nothing new to tell.
        else if (activity.count > 0) summary.capped = true
      }
    } catch (error) {
      summary.failed = true
      // A repository removed while it was being checked leaves no problem behind.
      if (stillWatched(repo.path)) setProblem(repo.path, error)
      if (warned.has(repo.path)) continue
      warned.add(repo.path)
      useGame.getState().notify(checkFailed(repo, error))
    }
  }
  return summary
}

/** Checks never overlap: asking mid-check shares the one already running. */
function checkRepos(): Promise<CheckSummary> {
  if (!inFlight) {
    lastStarted = Date.now()
    inFlight = checkEach().finally(() => (inFlight = null))
  }
  return inFlight
}

/** For the timer and window focus: skipped if a check ran moments ago. */
function checkSoon() {
  if (inFlight || Date.now() - lastStarted < MIN_GAP) return
  void checkRepos()
}

async function checkByHand(): Promise<void> {
  if (!isDesktop() || !useGame.getState().game.repos.length) return
  // A check that started before the click may have just missed a commit, so look again after it.
  await inFlight
  const { paid, capped, failed } = await checkRepos()
  const { notify } = useGame.getState()
  if (paid || failed) return
  if (capped && isOn('fairCounting')) notify({ kind: 'info', title: FIELD.full, detail: `${earnedAll(['commits'])} ${FIELD.fresh}` })
  else if (capped) notify({ kind: 'info', title: "Today's commit rewards are all collected. They reset tomorrow." })
  else notify({ kind: 'info', title: 'No new commits yet', detail: 'Gitaway looks again every couple of minutes.' })
}

/** For the "Check now" button. Skips the gap between automatic checks; repeated clicks share one check. */
export function checkReposNow(): Promise<void> {
  manual ??= checkByHand().finally(() => (manual = null))
  return manual
}

/** Mounted once. Does nothing outside the desktop app or while no repository is watched. */
export function useGitWatcher() {
  const loaded = useGame((s) => s.loaded)
  const watching = useGame((s) => s.game.repos.length > 0)
  useEffect(() => {
    if (!loaded || !watching || !isDesktop()) return
    checkSoon()
    const id = setInterval(checkSoon, INTERVAL)
    window.addEventListener('focus', checkSoon)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', checkSoon)
    }
  }, [loaded, watching])
}
