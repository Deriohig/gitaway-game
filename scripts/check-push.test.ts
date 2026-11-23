import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { freeE2ePort, isRunning, runInParallel } from './check-push.mjs'

// Tiny Node processes stand in for the real checks. Generous timeouts: these also run inside a busy check:push.

const node = process.execPath
const js = (code: string) => ({ command: node, args: ['-e', code] })
const sleeper = (ms: number) => js(`setTimeout(() => {}, ${ms})`)
const exitsAfter = (ms: number, code = 1) => js(`setTimeout(() => process.exit(${code}), ${ms})`)
const SLOW = 20_000

describe('runInParallel: the push checks side by side', () => {
  it('passes when every check passes', async () => {
    const result = await runInParallel([{ name: 'a', ...sleeper(200) }, { name: 'b', ...js('console.log("fine")') }]).done
    expect(result.ok).toBe(true)
    expect(result.results.map((r) => `${r.name} ${r.status}`).sort()).toEqual(['a passed', 'b passed'])
    expect(result.results.find((r) => r.name === 'b')?.output).toContain('fine')
  }, SLOW)

  it('stops the others when one fails, keeping its output, and calls a polite stopped check "stopped"', async () => {
    const started = Date.now()
    const result = await runInParallel([
      { name: 'slow', ...sleeper(60_000) },
      { name: 'broken', ...js('console.log("boom"); process.exit(3)') },
      { name: 'polite', ...js(`process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000)`) },
    ]).done
    expect(result.ok).toBe(false)
    expect(result.failed).toMatchObject({ name: 'broken', code: 3 })
    expect(result.failed?.output).toContain('boom')
    expect(result.results.filter((r) => r.status === 'stopped').map((r) => r.name).sort()).toEqual(['polite', 'slow'])
    expect(Date.now() - started).toBeLessThan(15_000)
  }, SLOW)

  it.skipIf(process.platform === 'win32')('stops everything a check started, even a process that ignores the stop signal', async () => {
    const stubborn = `process.on('SIGTERM', () => {}); console.log('pid', process.pid); setInterval(() => {}, 1000)`
    const parent = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(stubborn)}], { stdio: 'inherit' }); setInterval(() => {}, 1000)`
    const result = await runInParallel([{ name: 'tree', ...js(parent) }, { name: 'broken', ...exitsAfter(1000) }], { graceMs: 500 }).done
    expect(result.failed?.name).toBe('broken')
    const tree = result.results.find((r) => r.name === 'tree')
    expect(tree?.status).toBe('stopped')
    const pid = Number(/pid (\d+)/.exec(tree?.output ?? '')?.[1])
    expect(pid).toBeGreaterThan(0)
    await expect.poll(() => isRunning(pid), { timeout: 5_000 }).toBe(false)
  }, SLOW)

  it.skipIf(process.platform !== 'linux')("frees the e2e port when a stopped run leaves its server in a process group of its own (as Playwright's webServer does)", async () => {
    const server = `const s = require('node:net').createServer().listen(0, '127.0.0.1', () => console.log('serving on port ' + s.address().port + ' pid ' + process.pid))`
    const parent = `const c = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(server)}], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] }); c.stdout.on('data', (d) => process.stdout.write(d)); setInterval(() => {}, 1000)`
    let pid = 0
    try {
      const result = await runInParallel([{ name: 'e2e', ...js(parent), cleanup: freeE2ePort }, { name: 'broken', ...exitsAfter(1500) }], { graceMs: 1_000 }).done
      pid = Number(/ pid (\d+)/.exec(result.results.find((r) => r.name === 'e2e')?.output ?? '')?.[1])
      expect(pid).toBeGreaterThan(0)
      await expect.poll(() => isRunning(pid), { timeout: 5_000 }).toBe(false)
    } finally {
      if (pid && isRunning(pid)) process.kill(pid, 'SIGKILL')
    }
  }, SLOW)
})

describe('isRunning', () => {
  it('counts this process, but not one that has ended and been reaped', async () => {
    expect(isRunning(process.pid)).toBe(true)
    const child = spawn(node, ['-e', ''], { stdio: 'ignore' })
    await new Promise((resolve) => child.once('exit', resolve))
    expect(isRunning(child.pid!)).toBe(false)
  }, SLOW)

  it.skipIf(process.platform !== 'linux')('does not count a zombie, a process that has ended but not been reaped yet', async () => {
    // The shell becomes `sleep 30` (exec) and never reaps its child; kill the child only once that has happened.
    const shell = spawn('sh', ['-c', 'sleep 30 & echo $!; exec sleep 30'], { stdio: ['ignore', 'pipe', 'ignore'] })
    let child = 0
    try {
      child = await new Promise<number>((resolve) => shell.stdout.once('data', (d) => resolve(Number(String(d).trim()))))
      await expect.poll(() => readFileSync(`/proc/${shell.pid}/cmdline`, 'utf8'), { timeout: 10_000 }).toBe('sleep\u000030\u0000')
      process.kill(child, 'SIGKILL')
      await expect.poll(() => readFileSync(`/proc/${child}/stat`, 'utf8').split(') ')[1]?.[0], { timeout: 10_000 }).toBe('Z')
      expect(isRunning(child)).toBe(false)
    } finally {
      shell.kill('SIGKILL')
      if (child && isRunning(child)) process.kill(child, 'SIGKILL')
    }
  }, SLOW)
})
