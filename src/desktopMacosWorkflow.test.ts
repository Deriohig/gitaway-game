/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// .github/workflows/desktop-macos.yml builds the Mac apps; macOS minutes cost ten times Linux ones. There is no YAML
// parser among the dependencies, so the file is read as text.

const workflowUrl = new URL('../.github/workflows/desktop-macos.yml', import.meta.url)
const workflow = existsSync(workflowUrl) ? readFileSync(workflowUrl, 'utf8') : ''

/** The `on:` block's triggers (the two-space-indented keys), and whether any limits itself to paths. */
function triggers(): { events: string[]; hasPaths: boolean } {
  const block = workflow.match(/^on:\n((?:[ \t#].*\n|\n)*)/m)?.[1] ?? ''
  return { events: [...block.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]), hasPaths: /^ {4}paths:/m.test(block) }
}

/** Where `text` first appears, failing the test if it doesn't. */
function at(text: string, from = 0): number {
  const index = workflow.indexOf(text, from)
  expect(index, `expected the workflow to contain: ${text}`).toBeGreaterThanOrEqual(0)
  return index
}

describe('the macOS desktop workflow', () => {
  it('exists, and runs only when started by hand (a push would start four Mac builds)', () => {
    expect(workflow).not.toBe('')
    expect(triggers()).toEqual({ events: ['workflow_dispatch'], hasPaths: false })
  })

  it('cancels a run that a newer one supersedes', () => {
    expect(workflow).toMatch(/^concurrency:\n {2}group: desktop-macos-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true\n/m)
  })

  it('builds for Apple Silicon and Intel on an Apple Silicon runner, within a time limit', () => {
    expect(workflow).toContain('runs-on: macos-latest')
    expect(workflow).toMatch(/^ {4}timeout-minutes: \d+$/m)
    expect(workflow).toMatch(/- target: aarch64-apple-darwin\n/)
    expect(workflow).toMatch(/- target: x86_64-apple-darwin\n/)
    expect(workflow).toContain('rustup target add ${{ matrix.target }}')
  })

  it('names the four disk images and uploads each for 14 days, failing if there is none', () => {
    for (const name of ['gitaway-macos-arm64', 'gitaway-macos-arm64-dev', 'gitaway-macos-x64', 'gitaway-macos-x64-dev']) expect(workflow).toMatch(new RegExp(`: ${name}\\n`))
    const dmg = 'path: src-tauri/target/${{ matrix.target }}/release/bundle/dmg/'
    const uploads = workflow.split('uses: actions/upload-artifact@').slice(1)
    expect(uploads).toHaveLength(2)
    uploads.forEach((upload, i) => {
      expect(upload).toContain('retention-days: 14')
      expect(upload).toContain('if-no-files-found: error')
      expect(upload).toContain(i ? 'name: ${{ matrix.dev-artifact }}' : 'name: ${{ matrix.artifact }}')
      expect(upload).toContain(dmg + (i ? 'Gitaway Dev_*.dmg' : 'Gitaway_*.dmg'))
    })
  })

  it('builds, checks and uploads the normal app, clears the bundles, then the same for Gitaway Dev', () => {
    const bundles = 'rm -rf src-tauri/target/${{ matrix.target }}/release/bundle'
    const app = (name: string) => `src-tauri/target/\${{ matrix.target }}/release/bundle/macos/${name}.app`
    const normal = at('npx tauri build --target ${{ matrix.target }} --bundles dmg\n', at(bundles))
    const normalApp = at(`scripts/check-macos-app.sh "${app('Gitaway')}" dev.gitaway.desktop gitaway`, at('node scripts/check-dev-tools.mjs dist without', normal))
    const dev = at('npx tauri build --target ${{ matrix.target }} --bundles dmg --config src-tauri/tauri.devtools.conf.json', at(bundles, at('name: ${{ matrix.artifact }}', normalApp)))
    const devApp = at(`scripts/check-macos-app.sh "${app('Gitaway Dev')}" dev.gitaway.desktop.devtools gitaway-dev`, at('node scripts/check-dev-tools.mjs dist with\n', dev))
    at('name: ${{ matrix.dev-artifact }}', devApp)
  })

  it('tests the git-activity crate once, in the Apple Silicon job', () => {
    const test = at('cargo test --manifest-path src-tauri/Cargo.toml -p git-activity')
    expect(workflow.slice(workflow.lastIndexOf('- name:', test), test)).toContain("if: matrix.target == 'aarch64-apple-darwin'")
  })

  it('pins every action to a full commit, and adds no secrets (the apps are signed ad hoc)', () => {
    const uses = [...workflow.matchAll(/uses: (\S+)/g)].map((match) => match[1])
    expect(uses.length).toBeGreaterThan(0)
    for (const action of uses) expect(action).toMatch(/@[0-9a-f]{40}$/)
    expect(workflow).not.toMatch(/^[^#]*\$\{\{\s*secrets\./m)
  })
})
