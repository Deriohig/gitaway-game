import { describe, expect, it } from 'vitest'
import { GIT_TOOK_TOO_LONG, describeCheckProblem, describeGitError, gitErrorText, tellsNoFolder, type GitError } from './gitProblem'

// What the desktop side rejects with (git-activity's Error: kind, Display and command), copied from its tests.
const UNTRUSTED: GitError = {
  kind: 'untrusted-folder',
  message:
    "Git won't read \\\\wsl.localhost\\Ubuntu-24.04\\home\\me\\Projects\\gitaway because another user owns it. If the folder is yours, mark it as safe by running `git config --global --add safe.directory '%(prefix)///wsl.localhost/Ubuntu-24.04/home/me/Projects/gitaway'` in PowerShell or Git Bash, then try again.",
  command: "git config --global --add safe.directory '%(prefix)///wsl.localhost/Ubuntu-24.04/home/me/Projects/gitaway'",
}
const NO_EMAIL_IN_WSL: GitError = {
  kind: 'no-user-email',
  message:
    'Git inside Ubuntu-24.04 has no user.email for this repository, so your commits can\'t be told apart. Set the email you commit with by running `git config --global user.email "you@example.com"` in Ubuntu-24.04, then try again.',
  command: 'git config --global user.email "you@example.com"',
}
const NO_GIT_IN_WSL: GitError = {
  kind: 'wsl-git-missing',
  message: "Git isn't installed in Ubuntu-24.04. Install it there with `sudo apt install git`, or pick a folder on a Windows drive.",
  command: 'sudo apt install git',
}
const FALLBACK = "Couldn't add that folder"
const NOTHING = 'Something went wrong while reading it.'

describe('describeGitError', () => {
  it.each([
    [UNTRUSTED, "Git doesn't trust that folder"],
    [NO_EMAIL_IN_WSL, "Git doesn't know your email"],
    [NO_GIT_IN_WSL, "Git isn't installed in WSL"],
  ])('heads $kind with what happened, and keeps the advice and the command', (error, title) => {
    expect(describeGitError(error)).toEqual({ kind: error.kind, title, detail: error.message, command: error.command })
  })

  it('has a heading for every kind the desktop side sends', () => {
    const titles = {
      'not-a-folder': "That folder couldn't be found",
      'unusable-folder': "That folder can't be used",
      'not-a-repository': "That folder isn't a Git repository",
      'git-unavailable': "Git couldn't be run",
      'untrusted-folder': "Git doesn't trust that folder",
      'no-user-email': "Git doesn't know your email",
      'git-timed-out': 'Git took too long',
      'git-failed': "Git couldn't read that folder",
      'wsl-unavailable': "WSL couldn't be started",
      'wsl-distro-not-found': "That WSL distribution isn't installed",
      'wsl-git-missing': "Git isn't installed in WSL",
      interrupted: 'Something went wrong',
    }
    expect(Object.fromEntries(Object.keys(titles).map((kind) => [kind, describeGitError({ kind, message: 'Advice.' }).title]))).toEqual(titles)
  })

  it('offers no command where none fixes it', () => {
    expect(describeGitError({ kind: 'wsl-unavailable', message: 'WSL could not be started.' })).toEqual({ kind: 'wsl-unavailable', title: "WSL couldn't be started", detail: 'WSL could not be started.' })
    expect('command' in describeGitError({ kind: 'git-failed', message: 'x', command: '' })).toBe(false)
  })

  it('falls back to a plain heading for kinds it does not know, not fooled by names every object has', () => {
    expect(describeGitError({ kind: 'something-new', message: 'A new problem.' })).toEqual({ kind: 'something-new', title: FALLBACK, detail: 'A new problem.' })
    expect(describeGitError({ kind: 'constructor', message: 'Odd.' }).title).toBe(FALLBACK)
  })

  it('explains sentences and errors that carry no kind', () => {
    expect(describeGitError('Git took too long to answer.')).toEqual({ kind: 'unknown', title: FALLBACK, detail: 'Git took too long to answer.' })
    expect(describeGitError(new Error('Broken pipe'))).toEqual({ kind: 'unknown', title: FALLBACK, detail: 'Broken pipe' })
    for (const odd of [undefined, null, '', 42, {}, { kind: 3, message: 'x' }, { kind: 'git-failed' }]) {
      expect(describeGitError(odd)).toEqual({ kind: 'unknown', title: FALLBACK, detail: NOTHING })
    }
  })

  it('takes another fallback heading, for a folder that was already added, and known kinds keep their own', () => {
    const checking = "Couldn't check that folder"
    expect(describeGitError(GIT_TOOK_TOO_LONG, checking)).toEqual({ kind: 'unknown', title: checking, detail: GIT_TOOK_TOO_LONG })
    expect(describeGitError({ kind: 'something-new', message: 'A new problem.' }, checking).title).toBe(checking)
    expect(describeGitError(UNTRUSTED, checking).title).toBe("Git doesn't trust that folder")
  })
})

describe('describeCheckProblem', () => {
  it("heads a failed check's note with the folder's name and what went wrong checking it", () => {
    expect(describeCheckProblem('api', GIT_TOOK_TOO_LONG)).toEqual({ kind: 'unknown', title: "api: Couldn't check that folder", detail: GIT_TOOK_TOO_LONG })
    expect(describeCheckProblem('api', UNTRUSTED)).toEqual({ ...describeGitError(UNTRUSTED), title: "api: Git doesn't trust that folder" })
  })
})

describe('tellsNoFolder', () => {
  const plain = ['not-a-folder', 'not-a-repository', 'git-unavailable', 'git-timed-out', 'git-failed', 'wsl-unavailable', 'interrupted']
  it.each(plain)('lets a toast say a %s, unless a fixing command may name the folder', (kind) => {
    expect(tellsNoFolder({ kind, message: 'Something plain.' })).toBe(true)
    expect(tellsNoFolder({ kind, message: 'Something plain.', command: 'git do-it' })).toBe(false)
  })

  it('keeps out kinds that may name the folder, kinds it does not know, and sentences of unknown origin', () => {
    for (const error of [UNTRUSTED, NO_EMAIL_IN_WSL, NO_GIT_IN_WSL, { kind: 'wsl-distro-not-found', message: 'WSL has no distribution called Ubuntu.' }]) {
      expect(tellsNoFolder(error), error.kind).toBe(false)
    }
    expect(tellsNoFolder({ kind: 'something-new', message: 'About /home/me/api.' })).toBe(false)
    expect(tellsNoFolder('Git said something about C:\\code\\api.')).toBe(false)
    expect(tellsNoFolder(new Error('Broken pipe'))).toBe(false)
    // The web side's own sentence when Git takes too long names nothing.
    expect(tellsNoFolder(GIT_TOOK_TOO_LONG)).toBe(true)
  })
})

describe('gitErrorText', () => {
  it('is the one sentence a toast shows', () => {
    expect(gitErrorText(NO_GIT_IN_WSL)).toBe(NO_GIT_IN_WSL.message)
    expect(gitErrorText('Git took too long to answer.')).toBe('Git took too long to answer.')
    expect(gitErrorText(new Error('Broken pipe'))).toBe('Broken pipe')
    expect(gitErrorText({ kind: 'git-failed', message: '' })).toBe(NOTHING)
    expect(gitErrorText(undefined)).toBe(NOTHING)
  })
})
