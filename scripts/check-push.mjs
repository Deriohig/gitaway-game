// npm run check:push: the checks a push that changes the game has to pass,
// run side by side, so the wait is only as long as the slowest (the e2e suite).
//
//   types  npm run type-check
//   unit   npm test
//   e2e    both Playwright projects, desktop and mobile, as one run: one build of
//          the app, with Playwright's workers sharing out the tests of both. A
//          test that fails is run once more (--retries=1) and only counts as a
//          failure if it fails again; one that passes the second time is
//          reported as flaky and doesn't fail the check. The run stops at the
//          first real failure (--max-failures=1, which Playwright counts after
//          the last retry).
//
// The first check to fail stops the others, and its output is shown. When all
// three pass on committed code, it writes a pass stamp for HEAD's tree:
// <git common dir>/e2e-pass/<tree sha>. The pre-push hook (scripts/pre-push.mjs)
// accepts the stamp in place of running the checks again. Worktrees share the
// common dir, so a stamp made in one counts in all of them.
//
// Other sessions on this machine run the e2e suite too, so it runs under
// `flock /tmp/gitaway-e2e.lock`, and serves the build on E2E_PORT, or on the
// first free port from 4300 to 4399.

import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkedFiles, parseStatusPaths } from './push-gate.mjs'

const here = fileURLToPath(import.meta.url)
export const root = resolve(dirname(here), '..')
const LOCK = '/tmp/gitaway-e2e.lock'
const PORTS = { first: 4300, last: 4399 }
const isWindows = process.platform === 'win32'

// ---------------------------------------------------------------------------
// Git, and the pass stamps

/**
 * Runs git in the repository and returns what it printed, trimmed.
 * @param {string[]} args
 */
export function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/**
 * Like git(), but returns null where git fails.
 * @param {string[]} args
 */
export function gitOrNull(...args) {
  try {
    return git(...args)
  } catch {
    return null
  }
}

/** @param {string} rev a commit, tag or ref */
export const treeOf = (rev) => git('rev-parse', `${rev}^{tree}`)

/**
 * The file whose presence says the code with this tree passed the push checks.
 * @param {string} tree
 */
export function stampFile(tree) {
  return join(resolve(root, git('rev-parse', '--git-common-dir')), 'e2e-pass', tree)
}

/**
 * Files that differ from HEAD (changed, staged or untracked) in a way that
 * could change what the checks see: the game's files, the models and the art
 * config (see checkedFiles). Docs and the rest of art don't count.
 */
export function dirtyPaths() {
  const status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
  return checkedFiles(parseStatusPaths(status))
}

/**
 * The environment without git's own variables: a hook can have GIT_DIR and
 * friends set, and the checks shouldn't inherit them.
 */
export function envWithoutGit() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')))
}

// ---------------------------------------------------------------------------
// Running checks side by side

/**
 * @typedef {object} Check
 * @property {string} name
 * @property {string} command
 * @property {string[]} args
 * @property {NodeJS.Signals} [stopSignal] how it is asked to stop (default SIGTERM)
 * @property {number} [graceMs] how long it gets to clean up once stopped, before SIGKILL (default: the run's)
 * @property {(output: string) => void} [cleanup] called with its output once it has been stopped and
 *   killed, for what it started outside its process group
 */

/**
 * @typedef {object} CheckResult
 * @property {string} name
 * @property {'passed' | 'failed' | 'stopped'} status
 * @property {number | null} code
 * @property {string} output its stdout and stderr, together
 * @property {number} seconds
 */

/**
 * @typedef {object} RunOptions
 * @property {string} [cwd]
 * @property {NodeJS.ProcessEnv} [env]
 * @property {(result: CheckResult) => void} [onFinish] told as each check ends
 * @property {number} [graceMs] how long a stopped check gets to clean up before it is killed
 */

/**
 * Starts every check at once, each in its own process group. `done` resolves
 * when all have passed, or as soon as one fails, once the others are stopped.
 * @param {Check[]} checks
 * @param {RunOptions} [options]
 */
export function runInParallel(checks, options = {}) {
  const { cwd = root, env = process.env, onFinish = () => {}, graceMs = 15_000 } = options
  /** @type {Map<string, { check: Check, child: import('node:child_process').ChildProcess, chunks: Buffer[], closed: Promise<void> }>} */
  const running = new Map()
  /** @type {CheckResult[]} */
  const results = []
  let stopping = false
  /** @type {(value: { ok: boolean, results: CheckResult[], failed?: CheckResult }) => void} */
  let finish = () => {}
  /** @type {Promise<{ ok: boolean, results: CheckResult[], failed?: CheckResult }>} */
  const done = new Promise((resolveDone) => (finish = resolveDone))

  /**
   * Stops every check still running: its stop signal to its whole process
   * group, then time to clean up (Playwright closes its browsers and server),
   * then SIGKILL for whatever of the group is left, and the check's cleanup
   * for anything it started outside its group.
   */
  async function stop() {
    stopping = true
    const left = [...running.values()]
    for (const { check, child } of left) signalGroup(child, check.stopSignal ?? 'SIGTERM')
    await Promise.all(
      left.map(async ({ check, child, chunks, closed }) => {
        const grace = check.graceMs ?? graceMs
        const deadline = Date.now() + grace
        const killer = setTimeout(() => signalGroup(child, 'SIGKILL'), grace)
        await closed
        // The check's first process can end before the ones it started (flock
        // does, on SIGINT): wait for the group, not just for it.
        while (groupAlive(child) && Date.now() < deadline) await new Promise((wake) => setTimeout(wake, 100))
        clearTimeout(killer)
        signalGroup(child, 'SIGKILL')
        check.cleanup?.(Buffer.concat(chunks).toString('utf8'))
      }),
    )
  }

  for (const check of checks) {
    const started = Date.now()
    const child = spawn(check.command, check.args, {
      cwd,
      env,
      // Its own process group, so that stopping it reaches everything it started.
      detached: !isWindows,
      shell: isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    /** @type {Buffer[]} */
    const chunks = []
    child.stdout?.on('data', (chunk) => chunks.push(chunk))
    child.stderr?.on('data', (chunk) => chunks.push(chunk))
    const closed = new Promise((resolveClosed) => {
      /** @param {number | null} code */
      const end = (code) => {
        if (!running.has(check.name)) return
        running.delete(check.name)
        /** @type {CheckResult} */
        const result = {
          name: check.name,
          // A check that was stopped didn't pass, whatever it exited with.
          status: stopping ? 'stopped' : code === 0 ? 'passed' : 'failed',
          code,
          output: Buffer.concat(chunks).toString('utf8'),
          seconds: (Date.now() - started) / 1000,
        }
        results.push(result)
        resolveClosed(undefined)
        onFinish(result)
        if (result.status === 'failed') {
          // Anything it started and left behind goes too.
          signalGroup(child, 'SIGKILL')
          check.cleanup?.(result.output)
          stop().then(() => finish({ ok: false, results, failed: result }))
        } else if (!stopping && running.size === 0) {
          finish({ ok: true, results })
        }
      }
      child.on('error', (error) => {
        chunks.push(Buffer.from(`${check.command}: ${error.message}\n`))
        end(null)
      })
      // 'close' waits for the output to be read. A process left behind holding
      // the pipes open mustn't keep the check running, so give up waiting soon
      // after the check itself exits.
      child.on('exit', (code) => setTimeout(() => end(code), 3_000).unref())
      child.on('close', (code) => end(code))
    })
    running.set(check.name, { check, child, chunks, closed })
  }

  return {
    done,
    stop,
    /** @param {string} name the output so far of a check that is still running */
    output: (name) => Buffer.concat(running.get(name)?.chunks ?? []).toString('utf8'),
  }
}

/**
 * @param {import('node:child_process').ChildProcess} child
 * @param {NodeJS.Signals} signal
 */
function signalGroup(child, signal) {
  if (child.pid === undefined) return
  try {
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-child.pid, signal)
  } catch {
    // Already gone.
  }
}

const isLinux = process.platform === 'linux'

/**
 * A process's state letter (R, S, Z for a zombie, ...) and process group, from
 * /proc (Linux), or null when there is no such process.
 * @param {number} pid
 */
function procStat(pid) {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    // `pid (name) state ppid pgrp ...`; the name can hold spaces and brackets.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    return { state: fields[0], group: Number(fields[2]) }
  } catch {
    return null
  }
}

/** The pids under /proc. */
const procPids = () => readdirSync('/proc').filter((name) => /^\d+$/.test(name)).map(Number)

/**
 * Whether a process is running. A zombie (ended, waiting to be reaped) isn't.
 * @param {number} pid
 */
export function isRunning(pid) {
  if (isLinux) {
    const stat = procStat(pid)
    return stat !== null && stat.state !== 'Z'
  }
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Whether anything of a process group is still running (never, on Windows).
 * @param {number | undefined} group the group's id: the pid of the process that leads it
 */
export function groupRunning(group) {
  if (isWindows || group === undefined) return false
  if (isLinux) return procPids().some((pid) => procStat(pid)?.group === group && isRunning(pid))
  try {
    process.kill(-group, 0)
    return true
  } catch {
    return false
  }
}

/** @param {import('node:child_process').ChildProcess} child */
const groupAlive = (child) => groupRunning(child.pid)

/**
 * The pids of the processes listening on a TCP port.
 * @param {number} port
 * @returns {number[]}
 */
function listenersOn(port) {
  if (isWindows) return []
  if (!isLinux) {
    const lsof = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })
    return (lsof.stdout ?? '').split('\n').filter(Boolean).map(Number)
  }
  // The sockets in LISTEN state (0A) on the port, by inode, then the processes holding them.
  const sockets = new Set()
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let rows = ''
    try {
      rows = readFileSync(table, 'utf8')
    } catch {
      continue
    }
    for (const row of rows.split('\n').slice(1)) {
      const fields = row.trim().split(/\s+/)
      if (fields.length > 9 && fields[3] === '0A' && parseInt(fields[1].split(':')[1], 16) === port) sockets.add(`socket:[${fields[9]}]`)
    }
  }
  if (sockets.size === 0) return []
  return procPids().filter((pid) => {
    try {
      return readdirSync(`/proc/${pid}/fd`).some((fd) => {
        try {
          return sockets.has(readlinkSync(`/proc/${pid}/fd/${fd}`))
        } catch {
          return false
        }
      })
    } catch {
      return false
    }
  })
}

/**
 * Whether a process runs in this checkout (Linux and macOS; elsewhere, no).
 * @param {number} pid
 */
function runsHere(pid) {
  try {
    const cwd = isLinux
      ? readlinkSync(`/proc/${pid}/cwd`)
      : (spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).stdout ?? '')
          .split('\n')
          .find((line) => line.startsWith('n'))
          ?.slice(1)
    if (!cwd) return false
    const here = realpathSync(root)
    const there = realpathSync(cwd)
    return there === here || there.startsWith(`${here}/`)
  } catch {
    return false
  }
}

/**
 * The e2e check's cleanup. Playwright starts its web server (`vite build`, then
 * `vite preview`) in a process group of its own, so when a stopped e2e run has
 * to be killed, the server can be left behind holding its port. This finds the
 * port in the run's output ("serving on port", printed by e2eUnderLock) and
 * kills whatever of this checkout still listens there, with its process group.
 * @param {string} output
 */
export function freeE2ePort(output) {
  const port = Number(/serving on port (\d+)/.exec(plain(output))?.[1])
  if (!port) return
  const ownGroup = isLinux ? procStat(process.pid)?.group : undefined
  for (const pid of listenersOn(port)) {
    if (!runsHere(pid)) continue
    const group = isLinux ? procStat(pid)?.group : undefined
    try {
      if (group && group !== ownGroup) process.kill(-group, 'SIGKILL')
      else process.kill(pid, 'SIGKILL')
    } catch {
      // Gone already.
    }
  }
}

/** A line without its colours, for matching. */
const plain = (/** @type {string} */ line) => line.replace(/\x1b\[[0-9;]*m/g, '')

// ---------------------------------------------------------------------------
// The e2e check, run under the lock

/** @param {number} port */
function isFree(port) {
  return new Promise((resolveFree) => {
    const server = createServer()
    server.once('error', () => resolveFree(false))
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => server.close(() => resolveFree(true)))
  })
}

/**
 * E2E_PORT if it is free, or else the first free port from 4300 to 4399. A port
 * already in use is refused: Playwright would reuse whatever is serving there
 * and test that in place of this build.
 */
async function choosePort() {
  const fixed = process.env.E2E_PORT
  if (fixed) {
    if (await isFree(Number(fixed))) return Number(fixed)
    throw new Error(
      `E2E_PORT=${fixed} is in use. Playwright would test whatever is serving there in place of this build. Stop it, or unset E2E_PORT to use a free port from ${PORTS.first} to ${PORTS.last}.`,
    )
  }
  for (let port = PORTS.first; port <= PORTS.last; port++) if (await isFree(port)) return port
  throw new Error(`No port from ${PORTS.first} to ${PORTS.last} is free for the e2e server. Set E2E_PORT to a free one.`)
}

/** Runs once the lock is held (or straight away where there is no flock). */
async function e2eUnderLock() {
  const started = Number(process.env.CHECK_PUSH_STARTED ?? Date.now())
  let port
  try {
    port = await choosePort()
  } catch (error) {
    console.error(`e2e: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
  console.log(`e2e: began ${((Date.now() - started) / 1000).toFixed(1)}s after check:push did (the wait for ${LOCK} included); serving on port ${port}`)
  const cli = join(root, 'node_modules/@playwright/test/cli.js')
  const args = ['test', '--project=desktop', '--project=mobile', '--retries=1', '--max-failures=1', '--forbid-only']
  const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: 'inherit', env: { ...process.env, E2E_PORT: String(port) } })
  // Playwright is in this process group, so a stop or a Ctrl+C reaches it as
  // well; it closes its browsers and server, and this waits for it to finish.
  for (const signal of /** @type {NodeJS.Signals[]} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) process.on(signal, () => {})
  child.on('exit', (code) => process.exit(code ?? 1))
}

/** The command for the e2e check: this script again, under flock where there is one. */
function e2eCheck() {
  const self = [here, '--e2e-under-lock']
  const hasFlock = !isWindows && !spawnSync('flock', ['--version'], { stdio: 'ignore' }).error
  if (hasFlock) {
    // -o: only flock holds the lock, not the processes the suite starts, so it
    // is let go as soon as the run ends.
    return { command: 'flock', args: ['-o', LOCK, process.execPath, ...self], locked: true }
  }
  return { command: process.execPath, args: self, locked: false }
}

// ---------------------------------------------------------------------------
// npm run check:push

/** @param {number} seconds */
function duration(seconds) {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  return `${Math.floor(seconds / 60)}m ${String(Math.round(seconds % 60)).padStart(2, '0')}s`
}

/** The lines Playwright ends a run with: the counts, and the flaky tests' names. */
function e2eSummary(/** @type {string} */ output) {
  const lines = output.trimEnd().split('\n')
  const first = lines.findIndex((line) => /^\s+\d+ (passed|failed|flaky|skipped|interrupted|did not run)\b/.test(plain(line)))
  return first < 0 ? [] : lines.slice(first)
}

async function checkPush() {
  const say = (/** @type {string} */ line) => console.log(line)
  const startTree = treeOf('HEAD')
  const startDirty = dirtyPaths()
  const e2e = e2eCheck()

  say('check:push: types, unit tests and e2e (desktop and mobile), side by side. The first to fail stops the others.')
  if (startDirty.length) say(`Uncommitted changes (${startDirty.slice(0, 3).join(', ')}${startDirty.length > 3 ? ', ...' : ''}): this run won't leave a pass stamp.`)
  if (!e2e.locked) say(`flock isn't available here, so e2e runs without waiting for ${LOCK}.`)
  else if (spawnSync('flock', ['-n', LOCK, 'true']).status !== 0) say(`e2e is waiting for another run on this machine to let go of ${LOCK}.`)

  const started = Date.now()
  const env = { ...envWithoutGit(), CHECK_PUSH_STARTED: String(started), ...(process.stdout.isTTY ? { FORCE_COLOR: '1' } : {}) }
  const npm = isWindows ? 'npm.cmd' : 'npm'
  const run = runInParallel(
    [
      { name: 'types', command: npm, args: ['run', 'type-check'] },
      { name: 'unit', command: npm, args: ['test'] },
      // SIGINT is Ctrl+C to Playwright: it closes its browsers and server, which
      // can take a while on a busy machine.
      { name: 'e2e', command: e2e.command, args: e2e.args, stopSignal: 'SIGINT', graceMs: 45_000, cleanup: freeE2ePort },
    ],
    {
      env,
      onFinish: (result) => {
        if (result.status === 'passed') say(`  passed  ${result.name.padEnd(5)}  ${duration(result.seconds)}`)
        if (result.status === 'failed') say(`  FAILED  ${result.name.padEnd(5)}  ${duration(result.seconds)}: stopping the others`)
      },
    },
  )

  // A minute can pass with nothing to show: say how the e2e run is getting on.
  const heartbeat = setInterval(() => {
    const done = run.output('e2e').split('\n').filter((line) => /^\s+(✓|✘|ok|x)\s+\d+ /.test(plain(line))).length
    say(`  ...     e2e    ${duration((Date.now() - started) / 1000)}, ${done} test runs done`)
  }, 60_000)

  let interrupted = false
  for (const signal of /** @type {NodeJS.Signals[]} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) {
    process.on(signal, () => {
      if (interrupted) return
      interrupted = true
      say(`check:push: ${signal}, stopping the checks.`)
      run.stop().then(() => process.exit(130))
    })
  }

  const { ok, results, failed } = await run.done
  clearInterval(heartbeat)
  if (interrupted) return
  const total = duration((Date.now() - started) / 1000)

  if (!ok && failed) {
    say(`\n----- ${failed.name} output -----`)
    process.stdout.write(failed.output.endsWith('\n') ? failed.output : `${failed.output}\n`)
    say(`-----\ncheck:push failed after ${total}: ${failed.name} (exit code ${failed.code}). The other checks were stopped.`)
    process.exit(1)
  }

  const e2eOutput = results.find((result) => result.name === 'e2e')?.output ?? ''
  const summary = e2eSummary(e2eOutput)
  const lockLine = e2eOutput.split('\n').find((line) => line.startsWith('e2e: began'))
  if (lockLine) say(`\n${lockLine}`)
  if (summary.length) say(summary.join('\n'))
  if (summary.some((line) => /^\s+\d+ flaky\b/.test(plain(line)))) {
    say('Flaky tests failed once and passed when run again. They don\'t fail the check, but are worth a look.')
  }
  say(`\ncheck:push passed in ${total}.`)

  // The stamp has to describe committed code, the same before and after the run.
  const endDirty = dirtyPaths()
  if (startDirty.length || endDirty.length) {
    const files = [...new Set([...startDirty, ...endDirty])]
    say(`No pass stamp: these files differ from the last commit, so the checks didn't test committed code: ${files.slice(0, 10).join(', ')}${files.length > 10 ? ', ...' : ''}`)
    return
  }
  if (treeOf('HEAD') !== startTree) {
    say('No pass stamp: HEAD changed while the checks ran.')
    return
  }
  const file = stampFile(startTree)
  mkdirSync(dirname(file), { recursive: true })
  const times = results.map((result) => `${result.name} ${duration(result.seconds)}`).join(', ')
  writeFileSync(file, `passed ${new Date().toISOString()} at ${git('rev-parse', 'HEAD')} (${times}; total ${total})\n`)
  say(`Pass stamp for tree ${startTree.slice(0, 12)}: ${file}`)
}

// Run as a script (not imported by a test or by scripts/pre-push.mjs).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(here)) {
  if (process.argv[2] === '--e2e-under-lock') await e2eUnderLock()
  else await checkPush()
}
