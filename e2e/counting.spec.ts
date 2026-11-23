import { COMMITS, SESSION, TASKS } from '../src/game/config'
import { FIELD } from '../src/game/fairCounting'
import { FEATURES } from '../src/game/features'
import { localDateKey } from '../src/game/state'
import { REPO_ALIASES } from '../src/game/systems/gitEvents'
import { installFakeGit, reportCommits } from './fake-git'
import { establishedFarm, expect, START, test } from './fixtures'

// Fair counting (A7): no "x / y" counters in the main UI, a reached cap told as a full field, and every rule written
// down in Settings → What counts.
test.skip(!FEATURES.fairCounting, 'fair counting (A7) is switched off')

/** A quota counter, such as "3/12", "3 / 20" or "2 h / 8 h". */
const COUNTER = /\d+(\s*h)?\s*\/\s*\d+/
const TODAY = localDateKey(START.getTime())
const SESSION_CARD = '[data-tour="session"]'

test('the session card and Progress count no quotas, and say nothing of caps below them', async ({ farm, page }) => {
  await farm.start()
  const card = page.locator(SESSION_CARD)
  await farm.logTask('Write the brief')
  await farm.expectToast('Task logged')
  await expect(card.getByRole('list', { name: 'Recent rewards' })).toContainText('Write the brief')
  await expect(card).not.toContainText(COUNTER)
  await expect(card.getByTestId('field-note')).toHaveCount(0)

  await farm.tool('progress')
  const panel = page.getByTestId('panel-progress')
  await expect(panel.getByTestId('today-tasks')).toContainText('1')
  await expect(panel).not.toContainText(COUNTER)
  await expect(panel.getByTestId('field-note')).toHaveCount(0)
})

test('at the task cap, the field is full for today', async ({ farm, page }) => {
  const tasks = Array.from({ length: TASKS.dailyLimit }, (_, i) => `task ${i}`)
  await farm.load(establishedFarm({ daily: { date: TODAY, sessionMinutes: 0, tasks, commits: 0, harvests: 0 } }))
  await farm.expandSession()
  const card = page.locator(SESSION_CARD)
  await expect(card.getByTestId('field-note')).toContainText(FIELD.full)
  await expect(card.getByTestId('field-note')).toContainText(FIELD.fresh)
  await expect(card).not.toContainText(COUNTER)
  await farm.logTask('One more thing')
  await farm.expectToast(FIELD.full)

  await farm.tool('progress')
  const panel = page.getByTestId('panel-progress')
  await expect(panel.getByTestId('field-note')).toContainText(FIELD.full)
  await expect(panel).not.toContainText(COUNTER)
})

test('Settings → What counts sets out the rules, with the numbers the game uses', async ({ farm, page }) => {
  await farm.start()
  await farm.tool('progress')
  await page.getByTestId('open-what-counts').click()
  await expect(page.getByTestId('panel-settings')).toBeVisible()
  await expect(page.getByTestId('what-counts')).toBeInViewport()
  await expect(page.getByTestId('what-counts-caps')).toContainText(`${TASKS.dailyLimit} tasks and ${COMMITS.dailyLimit} commits earn rewards`)
  await expect(page.getByTestId('what-counts-sessions')).toContainText(`earns ${SESSION.coinsPerMinute} coins`)
  await expect(page.getByTestId('what-counts-privacy')).toContainText('Everything stays on this device.')
  // Also from the Settings button.
  await farm.closePanel()
  await page.getByTestId('open-settings').click()
  await expect(page.getByTestId('what-counts-commits')).toContainText(`earns ${COMMITS.coins} coins and ${COMMITS.xp} XP`)
})

/** The folder a fake desktop app picks: inside WSL, where Git's errors name it as Linux sees it. */
const FOLDER = { path: '\\\\wsl.localhost\\Ubuntu\\home\\me\\secret-client-app', name: 'secret-client-app', linux: '/home/me/secret-client-app' }
const TREE = `the ${REPO_ALIASES[0]} tree`

test('repositories go by their trees in rewards, and a full day of commits is a full field', async ({ farm, page }) => {
  await installFakeGit(page, { pick: FOLDER })
  let minutes = 0
  const report = (count: number) => reportCommits(page, count, 60 * ++minutes)

  await farm.start()
  await page.getByTestId('open-settings').click()
  await page.getByTestId('add-repo').click()
  await expect(page.getByTestId('repo-secret-client-app')).toContainText(`secret-client-app · ${TREE} · since`)

  await report(2)
  await page.getByTestId('check-repos').click()
  await farm.expectToast(`+${2 * COMMITS.coins} coins · +${2 * COMMITS.xp} XP from ${TREE}`)
  await farm.closePanel()
  await farm.expandSession()
  const card = page.locator(SESSION_CARD)
  await expect(card.getByRole('list', { name: 'Recent rewards' })).toContainText(`2 commits in ${TREE}`)
  await expect(card).not.toContainText('secret-client-app')

  // The rest of the day's commits, then more: the field is full.
  await page.getByTestId('open-settings').click()
  await report(COMMITS.dailyLimit)
  await page.getByTestId('check-repos').click()
  await farm.expectToast(`${COMMITS.dailyLimit - 2} commits landed`)
  await report(3)
  await page.getByTestId('check-repos').click()
  await farm.expectToast(FIELD.full)
  // Only the toast confirming the folder just chosen names it.
  const named = (await farm.toastsShown()).filter((t) => t.includes('secret-client-app'))
  expect(named).toHaveLength(1)
  expect(named[0]).toMatch(/^Watching secret-client-app/)
})

test('a check that fails keeps the folder out of the toast, and Settings → Commits has the fix', async ({ farm, page }) => {
  const command = `git config --global --add safe.directory '${FOLDER.linux}'`
  const untrusted = {
    kind: 'untrusted-folder',
    message: `Git in Ubuntu won't read ${FOLDER.linux} because another user owns it. If the folder is yours, mark it as safe by running \`${command}\` in Ubuntu, then try again.`,
    command,
  }
  await installFakeGit(page, { pick: FOLDER, fail: { repository_activity: untrusted } })
  await farm.start()
  await page.getByTestId('open-settings').click()
  await page.getByTestId('add-repo').click()
  await farm.expectToast(`Couldn't check ${TREE}`)
  await farm.expectToast('Open Settings → Commits to set it right.')
  const toasts = (await farm.toastsShown()).filter((t) => !t.startsWith('Watching'))
  for (const part of [FOLDER.name, FOLDER.linux, 'safe.directory']) expect(toasts.join('\n')).not.toContain(part)

  const fix = page.getByTestId('check-problem-secret-client-app')
  await expect(fix).toContainText(`secret-client-app: Git doesn't trust that folder`)
  await expect(fix).toContainText(FOLDER.linux)
  await expect(page.getByTestId('check-problem-secret-client-app-command')).toHaveText(command)

  // Trusted at last, the folder is removed and added again: the old note goes with it.
  await page.getByTestId('remove-repo-secret-client-app').click()
  await expect(fix).toBeHidden()
  await page.evaluate(() => (window.fakeGit.fail = {}))
  await page.getByTestId('add-repo').click()
  await expect(page.getByTestId('repo-secret-client-app')).toBeVisible()
  await expect(fix).toBeHidden()
})
