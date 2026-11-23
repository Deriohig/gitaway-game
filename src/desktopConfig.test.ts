/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// "Gitaway Dev" is the normal Tauri config with tauri.devtools.conf.json merged over it as a JSON Merge Patch
// (RFC 7396): objects merge key by key, anything else (arrays too) is replaced whole.

type Json = Record<string, unknown>
const text = (file: string) => readFileSync(new URL(`../src-tauri/${file}`, import.meta.url), 'utf8')
const read = (file: string): Json => JSON.parse(text(file))

function mergePatch(target: unknown, patch: unknown): unknown {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return patch
  const merged: Json = typeof target === 'object' && target !== null && !Array.isArray(target) ? { ...(target as Json) } : {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key]
    else merged[key] = mergePatch(merged[key], value)
  }
  return merged
}

type Config = {
  productName: string
  identifier: string
  mainBinaryName?: string
  build: Json
  app: { windows: Json[] }
  bundle: Json & { targets?: string[]; icon?: string[]; macOS?: { minimumSystemVersion?: string; signingIdentity?: string | null; hardenedRuntime?: boolean } }
}
const base = read('tauri.conf.json') as Config
const merged = mergePatch(base, read('tauri.devtools.conf.json')) as Config

describe('the dev-tools desktop config', () => {
  it('installs next to the normal app, with its own name, bundle id (which names the farm storage) and program file', () => {
    expect(merged).toMatchObject({ productName: 'Gitaway Dev', identifier: 'dev.gitaway.desktop.devtools', mainBinaryName: 'gitaway-dev' })
    expect(base).toMatchObject({ productName: 'Gitaway' })
    expect(base.identifier).not.toBe(merged.identifier)
    expect(base.mainBinaryName).toBeUndefined()
    for (const config of [base, merged]) expect(config.identifier).toMatch(/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/)
  })

  it('builds the web app with the dev tools on, and is otherwise the same', () => {
    expect(merged.build.beforeBuildCommand).toBe('npm run build:devtools')
    expect(base.build.beforeBuildCommand).toBe('npm run build')
    expect(merged.build.frontendDist).toBe(base.build.frontendDist)
    // The windows are an array, so the override repeats every setting: only the title differs.
    expect(base.app.windows).toHaveLength(1)
    expect(merged.app.windows).toEqual([{ ...base.app.windows[0], title: 'Gitaway (dev tools)' }])
    expect(merged.bundle).toEqual(base.bundle)
  })
})

describe('the macOS app', () => {
  it('needs macOS 13.3 (Safari 16.4, the first WebKit that parses three.js static blocks), signed ad hoc ("-", no Apple account) so Apple Silicon opens it', () => {
    expect(base.bundle.macOS).toMatchObject({ minimumSystemVersion: '13.3', signingIdentity: '-' })
    expect(base.bundle.macOS?.hardenedRuntime).not.toBe(false)
    expect(merged.bundle.macOS).toEqual(base.bundle.macOS)
  })

  it('is packed as a disk image with a Mac icon, still as an installer on Windows, and the program is named after the Cargo package', () => {
    expect(base.bundle.targets).toEqual(expect.arrayContaining(['nsis', 'dmg']))
    expect(base.bundle.icon).toContain('icons/icon.icns')
    expect(text('Cargo.toml').match(/^\[package\]\s+name = "([^"]+)"/m)?.[1]).toBe('gitaway')
  })

  it('has an Info.plist (merged into both apps) that says why Gitaway reads Documents, Desktop and Downloads, and leaves name, identifier and version to the config', () => {
    const keys = [...text('Info.plist').matchAll(/<key>([^<]+)<\/key>/g)].map((match) => match[1])
    expect(keys).toEqual(expect.arrayContaining(['NSDocumentsFolderUsageDescription', 'NSDesktopFolderUsageDescription', 'NSDownloadsFolderUsageDescription']))
    for (const key of ['CFBundleIdentifier', 'CFBundleName', 'CFBundleDisplayName', 'CFBundleExecutable', 'LSMinimumSystemVersion', 'CFBundleVersion']) expect(keys).not.toContain(key)
  })
})
