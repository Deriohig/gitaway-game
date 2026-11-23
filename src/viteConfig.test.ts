import { describe, expect, it } from 'vitest'
import type { HtmlTagDescriptor, Plugin, UserConfig, UserConfigFnObject } from 'vite'
import config from '../vite.config'

const resolve = (command: 'serve' | 'build'): UserConfig => (config as UserConfigFnObject)({ command, mode: 'development' })

/** The production build's Content-Security-Policy connect-src sources. */
function connectSources(): string[] {
  const plugin = (resolve('build').plugins ?? []).flat().find((p): p is Plugin => !!p && (p as Plugin).name === 'gitaway-csp')
  expect(plugin).toBeDefined()
  const tags = (plugin!.transformIndexHtml as () => HtmlTagDescriptor[])()
  const policy = String(tags.find((tag) => tag.attrs?.['http-equiv'] === 'Content-Security-Policy')?.attrs?.content ?? '')
  const directive = policy.split(';').map((d) => d.trim().split(/\s+/)).find(([name]) => name === 'connect-src')
  return directive?.slice(1) ?? []
}

/** Whether a source list lets the page connect to `url` (scheme and exact-origin sources only). */
const allows = (sources: string[], url: string) => {
  const { protocol, origin, host } = new URL(url)
  return sources.some((source) => source === protocol || source === origin || source === `${protocol}//${host}`)
}

describe('the Vite config', () => {
  // art/scripts has its own pages and three.js: scanned for dependencies, they made the dev server pre-bundle art's older three.
  it("looks for dependencies to pre-bundle only from the game's own page", () => {
    for (const command of ['serve', 'build'] as const) expect(resolve(command).optimizeDeps?.entries).toEqual(['index.html'])
  })

  // Tauri sends commands to Rust as requests to ipc://localhost (macOS) or http://ipc.localhost (Windows).
  it.each([
    ['ipc://localhost/pick_repository', true],
    ['http://ipc.localhost/pick_repository', true],
    ['https://example.com/', false],
    ['http://localhost/', false],
  ])('the policy lets the page connect to %s: %s', (url, allowed) => expect(allows(connectSources(), url)).toBe(allowed))
})
