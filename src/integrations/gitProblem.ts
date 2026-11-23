// Explains the desktop app's Git problems. The native side rejects with
// { kind, message, command? }: a stable kind, the sentence to show (what to do
// about it), and the command that fixes it, where one does. The heading comes
// from the kind, never from reading the sentence.

/** What the desktop side's Git commands reject with. */
export interface GitError {
  kind: string
  message: string
  command?: string
}

/** A Git problem, ready to show. */
export interface GitProblem {
  kind: string
  /** What happened, in a few words. */
  title: string
  /** What to do about it. */
  detail: string
  /** A command that fixes it, to copy into a terminal. */
  command?: string
}

const TITLES = new Map<string, string>([
  ['not-a-folder', "That folder couldn't be found"],
  ['unusable-folder', "That folder can't be used"],
  ['not-a-repository', "That folder isn't a Git repository"],
  ['git-unavailable', "Git couldn't be run"],
  ['untrusted-folder', "Git doesn't trust that folder"],
  ['no-user-email', "Git doesn't know your email"],
  ['git-timed-out', 'Git took too long'],
  ['git-failed', "Git couldn't read that folder"],
  ['wsl-unavailable', "WSL couldn't be started"],
  ['wsl-distro-not-found', "That WSL distribution isn't installed"],
  ['wsl-git-missing', "Git isn't installed in WSL"],
  ['interrupted', 'Something went wrong'],
])

const FALLBACK_TITLE = "Couldn't add that folder"
/** The heading a failed check falls back on: the folder was added, so it isn't about adding. */
const CHECK_FALLBACK_TITLE = "Couldn't check that folder"
const FALLBACK_DETAIL = 'Something went wrong while reading it.'

/** What the web side rejects with when Git hasn't answered a check in time (localGit.ts). */
export const GIT_TOOK_TOO_LONG = 'Git took too long to answer. Gitaway will try again in a little while.'

export function isGitError(error: unknown): error is GitError {
  if (typeof error !== 'object' || error === null) return false
  const { kind, message } = error as Partial<GitError>
  return typeof kind === 'string' && typeof message === 'string'
}

/**
 * Heading, advice and fixing command for whatever a Git command rejected with.
 * `fallbackTitle` heads kinds this doesn't know, and errors without a kind.
 */
export function describeGitError(error: unknown, fallbackTitle = FALLBACK_TITLE): GitProblem {
  if (!isGitError(error)) return { kind: 'unknown', title: fallbackTitle, detail: gitErrorText(error) }
  const problem: GitProblem = { kind: error.kind, title: TITLES.get(error.kind) ?? fallbackTitle, detail: error.message || FALLBACK_DETAIL }
  if (typeof error.command === 'string' && error.command) problem.command = error.command
  return problem
}

/** A failed check's problem, for Settings → Commits: headed by the folder's name and what went wrong checking it. */
export function describeCheckProblem(name: string, error: unknown): GitProblem {
  const problem = describeGitError(error, CHECK_FALLBACK_TITLE)
  return { ...problem, title: `${name}: ${problem.title}` }
}

/**
 * Kinds of error whose sentence never names the player's folder. Anything
 * else may (Git's refusal of an untrusted folder names it twice), and so may
 * any fixing command, so a kind added one day stays out of toasts until it is
 * known to be safe.
 */
const FOLDER_FREE = new Set(['not-a-folder', 'not-a-repository', 'git-unavailable', 'git-timed-out', 'git-failed', 'wsl-unavailable', 'interrupted'])

/** Whether a toast may say what the error says. With fair counting on, everything else is left to Settings → Commits. */
export function tellsNoFolder(error: unknown): boolean {
  if (error === GIT_TOOK_TOO_LONG) return true
  return isGitError(error) && FOLDER_FREE.has(error.kind) && !error.command
}

/** One sentence for a toast. The native side's sentence names the fix too. */
export function gitErrorText(error: unknown): string {
  if (typeof error === 'string' && error) return error
  if (isGitError(error) && error.message) return error.message
  if (error instanceof Error && error.message) return error.message
  return FALLBACK_DETAIL
}
