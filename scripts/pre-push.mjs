// The pre-push hook's work. .githooks/pre-push runs it; `npm install` points git
// at that folder (the "prepare" script: git config core.hooksPath .githooks).
//
// For each ref being pushed it works out which files the push changes: from
// what the remote has now, or for a new branch from where it left origin/main.
//   - Only docs, art or Markdown (needsCheck in push-gate.mjs): nothing to check.
//   - Code with a pass stamp (see check-push.mjs): it passed already.
//   - Otherwise it runs `npm run check:push` (types, unit tests and e2e), and
//     the push goes ahead only if that passes and stamps the code being pushed.
//
// The checks test the files on disk, so they can only vouch for a push of the
// commit that is checked out, with no other changes to the game's files.

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirtyPaths, envWithoutGit, git, gitOrNull, groupRunning, root, stampFile, treeOf } from './check-push.mjs'
import { needsCheck, parsePrePushInput } from './push-gate.mjs'

const say = (/** @type {string} */ line) => console.error(`pre-push: ${line}`)

/** @param {string} message */
function block(message) {
  say(message)
  say('Push stopped.')
  process.exit(1)
}

/**
 * The files a push of this update changes, or null when there is nothing to
 * compare it with (then it is checked).
 * @param {import('./push-gate.mjs').PushUpdate} update
 */
function changedFiles(update) {
  let base = null
  if (update.remoteSha && gitOrNull('cat-file', '-e', `${update.remoteSha}^{commit}`) !== null) base = update.remoteSha
  else if (gitOrNull('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main')) base = gitOrNull('merge-base', update.localSha, 'refs/remotes/origin/main')
  if (!base) return null
  // --no-renames: a file moved out of src/ into docs/ shows its old path too.
  return git('diff', '--name-only', '--no-renames', '-z', base, update.localSha).split('\0').filter(Boolean)
}

/** @returns {Promise<string>} */
function readStdin() {
  return new Promise((resolveInput, reject) => {
    let input = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (input += chunk))
    process.stdin.on('end', () => resolveInput(input))
    process.stdin.on('error', reject)
  })
}

async function main() {
  const updates = parsePrePushInput(await readStdin())

  /** @type {{ ref: string, sha: string, tree: string }[]} */
  const toCheck = []
  for (const update of updates) {
    const files = changedFiles(update)
    const ref = update.remoteRef.replace(/^refs\/(heads|tags)\//, '')
    if (files && !needsCheck(files)) {
      say(`${ref}: only docs, art or Markdown changed, so no checks are needed.`)
      continue
    }
    toCheck.push({ ref, sha: update.localSha, tree: treeOf(update.localSha) })
  }

  const unstamped = toCheck.filter(({ ref, tree }) => {
    if (!existsSync(stampFile(tree))) return true
    say(`${ref}: this code passed npm run check:push already (stamp ${tree.slice(0, 12)}).`)
    return false
  })
  if (unstamped.length === 0) return

  const headTree = treeOf('HEAD')
  const elsewhere = unstamped.find(({ tree }) => tree !== headTree)
  if (elsewhere) {
    block(
      `${elsewhere.ref} (${elsewhere.sha.slice(0, 7)}) hasn't passed npm run check:push, and it isn't the commit checked out here, so the checks can't test it. Check it out, run npm run check:push, and push again.`,
    )
  }
  const dirty = dirtyPaths()
  if (dirty.length) {
    block(
      `npm run check:push tests the files on disk, and these differ from the commit being pushed: ${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? ', ...' : ''}. Commit, remove, or \`git stash -u\` them, then push again.`,
    )
  }

  say(`no pass stamp for this code yet, so running npm run check:push (types, unit tests and e2e). Run it yourself before pushing next time to have the wait over with sooner.`)
  const isWindows = process.platform === 'win32'
  const child = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'check:push'], {
    cwd: root,
    env: envWithoutGit(),
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: isWindows,
    // A process group of its own (npm, the shell npm starts, and check:push),
    // so that a signal to the hook can be passed on to all of it.
    detached: !isWindows,
  })
  // Ctrl+C, or an editor cancelling the push: pass the signal on, and check:push
  // stops its checks.
  /** @type {NodeJS.Signals | null} */
  let cancelled = null
  for (const signal of /** @type {NodeJS.Signals[]} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) {
    process.on(signal, () => {
      cancelled = signal
      try {
        if (isWindows || child.pid === undefined) child.kill(signal)
        else process.kill(-child.pid, signal)
      } catch {
        // Gone already.
      }
    })
  }
  const code = await new Promise((resolveCode) => child.on('close', (exitCode) => resolveCode(exitCode)))
  if (cancelled) {
    // npm can end before check:push has finished stopping its checks: wait for it.
    const deadline = Date.now() + 60_000
    while (groupRunning(child.pid) && Date.now() < deadline) await new Promise((wake) => setTimeout(wake, 200))
    block(`${cancelled}: npm run check:push was stopped.`)
  }
  if (code !== 0) block('npm run check:push failed (above). Fix it, commit, and push again.')
  if (!existsSync(stampFile(headTree))) {
    block("npm run check:push passed but left no pass stamp (files changed while it ran?), so it may not have tested the code being pushed. Push again to check it.")
  }
}

main().catch((error) => block(`${error instanceof Error ? error.message : error}`))
