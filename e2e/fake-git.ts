import type { Page } from '@playwright/test'

// The desktop app reads Git through two native commands. A stand-in for the Tauri bridge answers them, so the whole
// flow runs in a plain browser.

/** What the native side rejects with: a stable kind, the sentence to show, and the command that fixes it. */
export interface GitError {
  kind: string
  message: string
  command?: string
}

export interface FakeGit {
  /** The repository the folder picker resolves to. */
  pick: { path: string; name: string }
  activity: { count: number; latest: number }
  /** Commands that should reject, with what the native side would send. */
  fail: Record<string, GitError | string>
  calls: { cmd: string; args: Record<string, unknown> }[]
  /** How long activity takes to answer, in ms. */
  delay: number
  /** Activity calls running right now, and the most there have ever been at once. */
  active: number
  maxActive: number
  /** Text put on the clipboard. */
  copied: string[]
}

declare global {
  interface Window {
    fakeGit: FakeGit
  }
}

/** Stands the fake bridge in from the next page loaded on, as `window.fakeGit`. */
export async function installFakeGit(page: Page, init: { pick?: FakeGit['pick']; fail?: FakeGit['fail'] } = {}) {
  await page.addInitScript((init) => {
    const git: FakeGit = {
      pick: init.pick ?? { path: 'C:\\code\\api', name: 'api' },
      activity: { count: 0, latest: 0 },
      fail: init.fail ?? {},
      calls: [],
      delay: 0,
      active: 0,
      maxActive: 0,
      copied: [],
    }
    window.fakeGit = git
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => void git.copied.push(text) } })
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
          git.calls.push({ cmd, args })
          if (git.fail[cmd]) throw git.fail[cmd]
          if (cmd === 'pick_repository') return git.pick
          if (cmd === 'repository_activity') {
            git.maxActive = Math.max(git.maxActive, ++git.active)
            await new Promise((resolve) => setTimeout(resolve, git.delay))
            git.active--
            return git.activity
          }
          throw `Unknown command ${cmd}`
        },
        transformCallback: () => 0,
      },
    })
  }, init)
}

/** Has the fake report `count` commits, the newest `ahead` seconds from now. */
export const reportCommits = (page: Page, count: number, ahead = 60) =>
  page.evaluate(([n, a]) => (window.fakeGit.activity = { count: n, latest: Math.floor(Date.now() / 1000) + a }), [count, ahead])
