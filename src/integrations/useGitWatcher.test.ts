import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { repositoryActivity } = vi.hoisted(() => ({ repositoryActivity: vi.fn() }))
vi.mock('./localGit', async (importOriginal) => ({ ...(await importOriginal<typeof import('./localGit')>()), repositoryActivity }))

import { unwatchRepository, watchRepository } from '../game/engine'
import { createInitialState } from '../game/state'
import { useFeatures } from '../game/testing'
import { useGame } from '../store/game'
import { checkProblems, checkReposNow } from './useGitWatcher'

// What happens when a check of a watched repository fails. The desktop side's error for a folder Git won't
// trust names the folder, and the command that fixes it names it again.

const T0 = Date.UTC(2026, 9, 19, 9, 0, 0)
const NAME = 'secret-client-app'
const SETTINGS = "Couldn't check the Apple tree Open Settings → Commits to set it right."
const untrusted = (linux: string) => ({
  kind: 'untrusted-folder',
  message: `Git in Ubuntu won't read ${linux} because another user owns it. If the folder is yours, mark it as safe by running \`git config --global --add safe.directory '${linux}'\` in Ubuntu, then try again.`,
  command: `git config --global --add safe.directory '${linux}'`,
})
const NO_EMAIL = {
  kind: 'no-user-email',
  message: 'Git inside Ubuntu has no user.email for this repository, so your commits can\'t be told apart. Set the email you commit with by running `git config --global user.email "you@example.com"` in Ubuntu, then try again.',
  command: 'git config --global user.email "you@example.com"',
}

// One toast per repository and run of the game, so each test watches a folder of its own.
let n = 0
function watching(): { path: string; linux: string } {
  const linux = `/home/me/work-${++n}/${NAME}`
  const path = `\\\\wsl.localhost\\Ubuntu${linux.replace(/\//g, '\\')}`
  useGame.setState({ game: watchRepository(createInitialState(T0), { path, name: NAME }, T0).state, toasts: [] })
  return { path, linux }
}
/** Every word the toasts said. */
const said = () => useGame.getState().toasts.map((t) => `${t.title} ${t.detail ?? ''}`)
const unwatch = (path: string) => useGame.setState({ game: unwatchRepository(useGame.getState().game, path).state })
/** Watches a folder, fails its check with the error (made from its Linux path), and returns the folder. */
async function failWith(error: unknown | ((linux: string) => unknown)) {
  const folder = watching()
  repositoryActivity.mockRejectedValue(typeof error === 'function' ? error(folder.linux) : error)
  await checkReposNow()
  return folder
}

beforeEach(() => {
  // The desktop app's web view.
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
})
afterEach(() => {
  vi.unstubAllGlobals()
  repositoryActivity.mockReset()
})

describe('a check that fails, with fair counting on', () => {
  useFeatures({ fairCounting: true })

  it('names the repository by its tree, and keeps its folder out of the toast', async () => {
    const { path, linux } = await failWith(untrusted)
    expect(said()).toEqual([SETTINGS])
    for (const part of [NAME, linux, 'wsl.localhost', 'safe.directory']) expect(said().join('\n')).not.toContain(part)
    // Settings → Commits, where folders are named, keeps the whole fix.
    expect(checkProblems().get(path)).toEqual(untrusted(linux))
  })

  it.each([
    ['any fix that needs a command', NO_EMAIL, SETTINGS],
    ['a kind not known to name no folder, so a new kind can never leak one', (linux: string) => ({ kind: 'some-future-kind', message: `Git said something about ${linux}.` }), SETTINGS],
    ['a plain sentence', 'Git took too long to answer. Gitaway will try again in a little while.', "Couldn't check the Apple tree Git took too long to answer. Gitaway will try again in a little while."],
    ['a kind known to name no folder', { kind: 'git-timed-out', message: 'Git took too long to answer for this repository.' }, "Couldn't check the Apple tree Git took too long to answer for this repository."],
  ])('says, for %s, what it may', async (_, error, toast) => {
    await failWith(error)
    expect(said()).toEqual([toast])
  })

  it('forgets the problem when its repository is removed', async () => {
    const { path } = await failWith(untrusted)
    expect(checkProblems().has(path)).toBe(true)
    unwatch(path)
    expect(checkProblems().has(path)).toBe(false)
  })

  it('records nothing for a repository removed while it was being checked', async () => {
    const { path, linux } = watching()
    let fail: (error: unknown) => void = () => {}
    repositoryActivity.mockReturnValue(new Promise((_, reject) => (fail = reject)))
    const checking = checkReposNow()
    await vi.waitFor(() => expect(repositoryActivity).toHaveBeenCalled())
    unwatch(path)
    fail(untrusted(linux))
    await checking
    expect(checkProblems().has(path)).toBe(false)
  })

  it('forgets the problem once a check works again', async () => {
    const { path } = await failWith(untrusted)
    expect(checkProblems().has(path)).toBe(true)
    repositoryActivity.mockReset()
    repositoryActivity.mockResolvedValue({ count: 0, latest: 0 })
    await checkReposNow()
    expect(checkProblems().has(path)).toBe(false)
  })
})

describe('a check that fails, with fair counting off', () => {
  useFeatures({ fairCounting: false })

  it('says it as it always has', async () => {
    const { linux } = await failWith(untrusted)
    expect(said()).toEqual([`Couldn't check ${NAME} ${untrusted(linux).message}`])
  })
})
