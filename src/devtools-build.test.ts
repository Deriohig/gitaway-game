/// <reference types="node" />
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Builds the web app both ways and inspects each with scripts/check-dev-tools.mjs (which the desktop workflow also
// runs): an ordinary build has no trace of the Dev panel or the clock's time skips, a `--mode devtools` build has them.

const run = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const vite = join(root, 'node_modules/vite/bin/vite.js')
const check = join(root, 'scripts/check-dev-tools.mjs')
// A build is a production build whatever the test runner says about NODE_ENV.
const { NODE_ENV: _testEnv, ...env } = process.env

let temp: string
let ordinary: string
let devtools: string

const build = (outDir: string, ...args: string[]) =>
  run(process.execPath, [vite, 'build', ...args, '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { cwd: root, env })

/** The exit code of the check: 0 when the folder is what was expected of it. */
async function checked(dir: string, expectation: 'with' | 'without') {
  try {
    await run(process.execPath, [check, dir, expectation])
    return 0
  } catch (error) {
    return (error as { code: number }).code
  }
}

async function scriptBytes(dir: string) {
  const names = (await readdir(join(dir, 'assets'))).filter((name) => name.endsWith('.js'))
  const sizes = await Promise.all(names.map(async (name) => (await stat(join(dir, 'assets', name))).size))
  return { count: names.length, bytes: sizes.reduce((sum, size) => sum + size, 0) }
}

beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), 'gitaway-devtools-'))
  ordinary = join(temp, 'ordinary')
  devtools = join(temp, 'devtools')
  await Promise.all([build(ordinary), build(devtools, '--mode', 'devtools')])
}, 240_000)

afterAll(async () => {
  if (temp) await rm(temp, { recursive: true, force: true })
})

describe('the dev-tools build', () => {
  it("has the Dev panel and the clock's time skips with --mode devtools, and no trace of them otherwise", async () => {
    expect(await checked(devtools, 'with')).toBe(0)
    expect(await checked(ordinary, 'without')).toBe(0)
  })

  it('is an optimised production build with the panel added as one more lazy chunk, not a development build', async () => {
    const plain = await scriptBytes(ordinary)
    const withTools = await scriptBytes(devtools)
    expect(withTools.count).toBe(plain.count + 1)
    expect(withTools.bytes).toBeGreaterThan(plain.bytes)
    expect(withTools.bytes).toBeLessThan(plain.bytes * 1.02)
  })

  it('the check fails a build that is not what was expected of it', async () => {
    expect(await checked(ordinary, 'with')).toBe(1)
    expect(await checked(devtools, 'without')).toBe(1)
  })
})
