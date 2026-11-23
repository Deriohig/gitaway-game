import { describe, expect, it } from 'vitest'
import { checkedFiles, needsCheck, parsePrePushInput, parseStatusPaths } from './push-gate.mjs'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const ZERO = '0'.repeat(40)

describe('needsCheck', () => {
  it.each([
    ['docs, art, models, workflows', ['docs/lore/BIBLE.md', 'docs/notes.txt', 'art/blender/farmhouse.blend', 'art/scripts/bake.py', 'public/models/farmhouse.glb', 'public/models/manifest.json', '.github/workflows/ci.yml']],
    ['Markdown at any depth and in any case', ['README.md', 'src/game/NOTES.md', 'e2e/README.md', 'CHANGELOG.MD']],
    ['nothing changed', []],
  ])('skips %s', (_, files) => expect(needsCheck(files)).toBe(false))

  it.each([
    'src/game/config.ts', 'e2e/isles.spec.ts', 'package.json', 'playwright.config.ts', 'scripts/check-push.mjs', '.githooks/pre-push', 'public/favicon.svg', 'src-tauri/src/main.rs',
    // look-alike names are not the skipped folders
    'docsite/index.html', 'artwork.ts', 'src/art/Thing.tsx', 'public/modelsx/a.glb', 'public/models.json', 'src/notes.md.ts', '.githubx/x.yml',
  ])('checks a push of %s', (file) => expect(needsCheck([file])).toBe(true))

  it('checks a push when even one file is not docs or art', () => {
    expect(needsCheck(['README.md', 'docs/a.md', 'art/x.blend', 'src/App.tsx'])).toBe(true)
  })
})

describe('checkedFiles', () => {
  it('counts the game, models and art config (which unit and e2e load), not docs, Markdown, workflows or other art', () => {
    const read = ['src/game/config.ts', 'public/models/farmhouse.glb', 'public/models/manifest.json', 'art/config/look.config.mjs', 'art/config/composition.pieces.json']
    const skipped = ['README.md', 'docs/a.txt', '.github/workflows/ci.yml', 'art/config/STYLE.md', 'art/blender/x.blend', 'public/models/NOTES.md']
    expect(checkedFiles([...read, ...skipped])).toEqual(read)
  })

  it('does not mistake look-alike folders for them', () => {
    expect(checkedFiles(['art/configs/x.json', 'public/modelsx/a.glb'])).toEqual(['public/modelsx/a.glb'])
  })
})

describe('parsePrePushInput', () => {
  const update = (ref: string, local: string, remote: string | null) => ({ localRef: ref, localSha: local, remoteRef: ref, remoteSha: remote })

  it.each([
    ['one update', `refs/heads/fix ${A} refs/heads/fix ${B}\n`, [update('refs/heads/fix', A, B)]],
    ['a new branch (no remote sha)', `refs/heads/new ${A} refs/heads/new ${ZERO}\n`, [update('refs/heads/new', A, null)]],
    ['a deletion (left out)', `(delete) ${ZERO} refs/heads/old ${B}\n`, []],
    [
      'several updates, ignoring blank lines and carriage returns',
      `refs/heads/a ${A} refs/heads/a ${B}\r\n\r\n(delete) ${ZERO} refs/heads/gone ${B}\r\nrefs/tags/v1 ${B} refs/tags/v1 ${ZERO}\r\n`,
      [update('refs/heads/a', A, B), update('refs/tags/v1', B, null)],
    ],
    ['a SHA-256 new branch', `refs/heads/x ${'c'.repeat(64)} refs/heads/x ${'0'.repeat(64)}`, [update('refs/heads/x', 'c'.repeat(64), null)]],
    ['a SHA-256 deletion', `(delete) ${'0'.repeat(64)} refs/heads/x ${'c'.repeat(64)}`, []],
    ['empty input', '', []],
    ['a blank line', '\n', []],
  ])('reads %s', (_, input, expected) => expect(parsePrePushInput(input)).toEqual(expected))

  it.each(['refs/heads/a only-three fields', `refs/heads/a not-a-sha refs/heads/a ${B}`])('refuses a line it does not understand: %s', (line) => {
    expect(() => parsePrePushInput(line)).toThrow(/pre-push/)
  })
})

describe('parseStatusPaths', () => {
  it.each([
    ['changed, staged and untracked paths', ' M src/a.ts\0A  src/b.ts\0?? art/new.png\0', ['src/a.ts', 'src/b.ts', 'art/new.png']],
    ['both sides of a rename or copy', 'R  src/new.ts\0src/old.ts\0 M README.md\0C  docs/b.md\0docs/a.md\0', ['src/new.ts', 'src/old.ts', 'README.md', 'docs/b.md', 'docs/a.md']],
    ['spaces in names', '?? art/my model.glb\0', ['art/my model.glb']],
    ['nothing for a clean tree', '', []],
  ])('lists %s', (_, input, expected) => expect(parseStatusPaths(input)).toEqual(expected))
})
