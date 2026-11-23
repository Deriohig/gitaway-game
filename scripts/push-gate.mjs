// The pre-push hook's decisions, kept free of git and the file system so that
// scripts/push-gate.test.ts can test them. scripts/pre-push.mjs (run by
// .githooks/pre-push) and scripts/check-push.mjs do the git calls around them.

/**
 * Paths whose changes can't change the game: docs, art sources, the exported
 * models, the CI workflows (they don't change the app), and Markdown anywhere.
 * A push that only touches these needs no push checks.
 */
const SKIPPED_FOLDERS = ['docs/', 'art/', 'public/models/', '.github/']

/** @param {string} file a path relative to the repository, as git prints it */
function isDocsOrArt(file) {
  return SKIPPED_FOLDERS.some((folder) => file.startsWith(folder)) || file.toLowerCase().endsWith('.md')
}

/**
 * Whether a push that changes these files needs the push checks (types, unit
 * tests and e2e). Only when every file is docs, art or Markdown does it not.
 * @param {string[]} files
 * @returns {boolean}
 */
export function needsCheck(files) {
  return files.some((file) => !isDocsOrArt(file))
}

/**
 * Folders a push of which alone skips the checks (the owner's choice: art
 * pushes stay instant), but which unit tests and e2e read from disk.
 */
const READ_BY_THE_CHECKS = ['public/models/', 'art/config/']

/**
 * The files among these that the checks would read: the game's, and also the
 * models and the art config. Uncommitted changes to any of them mean a run
 * didn't test committed code, so it leaves no pass stamp.
 * @param {string[]} files
 * @returns {string[]}
 */
export function checkedFiles(files) {
  return files.filter(
    (file) => needsCheck([file]) || (!file.toLowerCase().endsWith('.md') && READ_BY_THE_CHECKS.some((folder) => file.startsWith(folder))),
  )
}

/** @param {string} sha */
const isZero = (sha) => /^0+$/.test(sha)

/**
 * @typedef {object} PushUpdate
 * @property {string} localRef the ref being pushed, as `refs/heads/...` or `refs/tags/...`
 * @property {string} localSha the commit (or tag) it points to
 * @property {string} remoteRef the ref it updates on the remote
 * @property {string | null} remoteSha what that ref points to now, or null when the push creates it
 */

/**
 * Reads the lines git writes to the pre-push hook's stdin, one per ref pushed:
 * `<local ref> <local sha> <remote ref> <remote sha>`. Deletions (a local sha
 * of zeros) are left out: they change no code.
 * @param {string} input
 * @returns {PushUpdate[]}
 */
export function parsePrePushInput(input) {
  /** @type {PushUpdate[]} */
  const updates = []
  for (const raw of input.split('\n')) {
    const line = raw.replace(/\r$/, '').trim()
    if (!line) continue
    const fields = line.split(/\s+/)
    const [localRef, localSha, remoteRef, remoteSha] = fields
    if (fields.length !== 4 || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(localSha) || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(remoteSha)) {
      throw new Error(`pre-push: can't read this line from git: "${line}"`)
    }
    if (isZero(localSha)) continue
    updates.push({ localRef, localSha, remoteRef, remoteSha: isZero(remoteSha) ? null : remoteSha })
  }
  return updates
}

/**
 * The paths in `git status --porcelain=v1 -z` output: changed, staged and
 * untracked files, and both sides of a rename or copy.
 * @param {string} output
 * @returns {string[]}
 */
export function parseStatusPaths(output) {
  const entries = output.split('\0')
  /** @type {string[]} */
  const paths = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (!entry) continue
    // `XY path`: two status letters and a space. A rename or copy is followed by
    // the path it came from, as its own entry.
    paths.push(entry.slice(3))
    if (/[RC]/.test(entry.slice(0, 2))) paths.push(entries[++i])
  }
  return paths
}
