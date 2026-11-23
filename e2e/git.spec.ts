import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { COMMITS } from '../src/game/config'
import { installFakeGit, reportCommits, type GitError } from './fake-git'
import { establishedFarm, expect, START, test } from './fixtures'

/** Waits until the fake has had exactly `calls` activity requests and answered them all. */
async function gitIdle(page: Page, calls: number) {
  const state = () => page.evaluate(() => ({ calls: window.fakeGit.calls.filter((c) => c.cmd === 'repository_activity').length, active: window.fakeGit.active }))
  await expect.poll(state).toEqual({ calls, active: 0 })
}

const activityCalls = (page: Page) => page.evaluate(() => window.fakeGit.calls.filter((c) => c.cmd === 'repository_activity'))

test.beforeEach(async ({ page }) => {
  await installFakeGit(page)
})

for (const { name, path } of [
  { name: 'a watched repository', path: 'C:\\code\\api' },
  { name: 'a repository inside WSL', path: '\\\\wsl.localhost\\Ubuntu\\home\\me\\api' },
]) {
  test(`commits in ${name} pay out once`, async ({ farm, page }) => {
    const wsl = path.startsWith('\\\\wsl')
    await farm.start()
    await page.getByTestId('open-settings').click()
    const status = page.getByTestId('source-local-git-status')
    await expect(status).toHaveText('Not connected')
    await expect(page.getByTestId('source-local-git')).toContainText('Reads only how many commits you made and when: never code, messages, file names or anything from remotes.')
    if (wsl) await expect(page.getByTestId('wsl-hint')).toHaveText('Projects in WSL work too: paste \\\\wsl.localhost\\<distro>\\… into the folder box.')

    await page.evaluate((path) => (window.fakeGit.pick = { path, name: 'api' }), path)
    await page.getByTestId('add-repo').click()
    await farm.expectToast('Watching api')
    await expect(page.getByTestId('repo-api')).toHaveAttribute('title', path)
    await expect(page.getByTestId('repo-api')).toContainText('since 19 Oct 2026')
    await expect(status).toHaveText('Watching 1')
    await gitIdle(page, 1)

    const before = await farm.coinCount()
    await reportCommits(page, 3)
    const latest = await page.evaluate(() => window.fakeGit.activity.latest)
    await page.getByTestId('check-repos').click()
    await farm.expectToast('3 commits')
    await expect.poll(() => farm.coinCount()).toBe(before + 3 * COMMITS.coins)
    // The same report again: the cursor has moved past it, so nothing more is paid.
    await page.getByTestId('check-repos').click()
    await farm.expectToast('No new commits yet')
    expect(await farm.coinCount()).toBe(before + 3 * COMMITS.coins)
    const calls = await activityCalls(page)
    expect(calls.map((c) => c.args.path)).toEqual([path, path, path])
    expect(calls.at(-1)).toEqual({ cmd: 'repository_activity', args: { path, since: latest } })

    if (wsl) return
    await page.getByTestId('remove-repo-api').click()
    await expect(page.getByTestId('repo-api')).toBeHidden()
    await expect(status).toHaveText('Not connected')
    await farm.closePanel()
    await farm.tool('progress')
    await expect(page.getByTestId('today-commits')).toContainText('3 / 20')
    await expect(page.getByTestId('stat-commits')).toContainText('3')
  })
}

/** A problem the native side reports (its message is shown as sent), and the heading the panel gives its kind. */
const problem = (kind: string, title: string, command?: string) => ({ title, error: { kind, message: `Message for ${kind}.`, ...(command && { command }) } as GitError })

const PROBLEMS = [
  problem('wsl-git-missing', "Git isn't installed in WSL", 'sudo apt install git'),
  problem('wsl-distro-not-found', "That WSL distribution isn't installed", 'wsl --list --verbose'),
  problem('wsl-unavailable', "WSL couldn't be started"),
  problem('untrusted-folder', "Git doesn't trust that folder", "git config --global --add safe.directory '%(prefix)///server/share/api'"),
  problem('no-user-email', "Git doesn't know your email", 'git config --global user.email "you@example.com"'),
  problem('not-a-repository', "That folder isn't a Git repository"),
  problem('not-a-folder', "That folder couldn't be found"),
  problem('git-unavailable', "Git couldn't be run"),
  problem('git-timed-out', 'Git took too long'),
  problem('git-failed', "Git couldn't read that folder"),
]

test('a folder that cannot be added says why, with the command that fixes it', async ({ farm, page }) => {
  await farm.start()
  await page.getByTestId('open-settings').click()
  const note = page.getByTestId('git-problem')
  await expect(note).toBeHidden()
  const failWith = (error: GitError) => page.evaluate((error) => (window.fakeGit.fail.pick_repository = error), error)

  for (const { error, title } of PROBLEMS) {
    await failWith(error)
    await page.getByTestId('add-repo').click()
    // Each new problem replaces the last, and is announced.
    await expect(note).toHaveAttribute('role', 'alert')
    await expect(note).toHaveAttribute('data-kind', error.kind)
    await expect(note.getByTestId('git-problem-title')).toHaveText(title)
    await expect(note.getByTestId('git-problem-detail')).toHaveText(error.message)
    const copy = note.getByRole('button', { name: 'Copy' })
    if (error.command) {
      await expect(note.getByTestId('git-problem-command')).toHaveText(error.command)
      await copy.click()
      await expect(note.getByRole('button', { name: 'Copied' })).toBeVisible()
      expect((await page.evaluate(() => window.fakeGit.copied)).at(-1)).toBe(error.command)
    } else {
      await expect(note.getByTestId('git-problem-command')).toHaveCount(0)
      await expect(copy).toHaveCount(0)
    }
  }
  await expect(page.getByTestId('source-local-git-status')).toHaveText('Not connected')
  // The note takes the place of the passing toast.
  expect((await farm.toastsShown()).filter((t) => t.includes("Couldn't add that folder"))).toEqual([])
  await note.getByRole('button', { name: 'Dismiss' }).click()
  await expect(note).toBeHidden()

  // It also goes when a folder is added after all.
  await failWith(PROBLEMS[0].error)
  await page.getByTestId('add-repo').click()
  await expect(note).toBeVisible()
  await page.evaluate(() => (window.fakeGit.fail = {}))
  await page.getByTestId('add-repo').click()
  await farm.expectToast('Watching api')
  await expect(note).toBeHidden()
})

test('quick repeated checks never overlap or pay twice', async ({ farm, page }) => {
  await farm.start()
  await page.getByTestId('open-settings').click()
  await page.getByTestId('add-repo').click()
  await farm.expectToast('Watching api')
  await gitIdle(page, 1)
  const before = await farm.coinCount()

  await page.evaluate(() => {
    window.fakeGit.delay = 400
    window.fakeGit.activity = { count: 3, latest: Math.floor(Date.now() / 1000) + 60 }
    // Two clicks before the first answer arrives, and the window regaining focus meanwhile.
    const button = document.querySelector<HTMLButtonElement>('[data-testid="check-repos"]')!
    button.click()
    button.click()
    window.dispatchEvent(new Event('focus'))
  })
  await farm.expectToast('3 commits')
  await page.getByTestId('check-repos').click()
  await farm.expectToast('No new commits yet')

  expect(await farm.coinCount()).toBe(before + 3 * COMMITS.coins)
  expect(await farm.toasts().getByText('3 commits landed').count()).toBe(1)
  const git = await page.evaluate(() => window.fakeGit)
  expect(git.maxActive).toBe(1)
  // One check when added, one shared by both clicks and the focus, then the last click.
  expect(await activityCalls(page)).toHaveLength(3)
})

test('with the day’s commit rewards collected, Check now says so, and an exported farm leaves out where repositories live', async ({ farm, page }) => {
  const addedAt = START.getTime() - 3_600_000
  const base = establishedFarm()
  await farm.load(
    establishedFarm({
      daily: { ...base.daily, commits: 20 },
      stats: { ...base.stats, commits: 20 },
      repos: [{ path: 'C:\\Users\\someone\\code\\api', name: 'api', cursor: Math.floor(addedAt / 1000), addedAt }],
    }),
  )
  await gitIdle(page, 1)
  const before = await farm.coinCount()
  await reportCommits(page, 2)
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('source-local-git-status')).toHaveText('Watching 1')
  await page.getByTestId('check-repos').click()
  await farm.expectToast("Today's commit rewards are all collected. They reset tomorrow.")
  expect(await farm.coinCount()).toBe(before)

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-farm').click()])
  const text = await readFile(await download.path(), 'utf8')
  expect(JSON.parse(text).repos).toEqual([{ name: 'api' }])
  expect(text).not.toContain('someone')
})
