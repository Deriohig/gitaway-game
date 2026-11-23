// Checks a built web app (a dist folder) for the dev tools: the Dev panel and
// the game clock's time skips.
//
//   node scripts/check-dev-tools.mjs <dist-folder> with      the build must have them
//   node scripts/check-dev-tools.mjs <dist-folder> without   the build must have none of them
//
// An ordinary build (`npm run build`) must be "without": a player's copy of the
// game can't move its own clock or hand itself coins. A dev-tools build
// (`npm run build:devtools`, the "Gitaway Dev" desktop app) must be "with".
// The desktop workflow runs this on the folder each installer is built from,
// and src/devtools-build.test.ts runs it on fresh builds of both kinds.
//
// It looks for text the tools leave in a minified bundle (labels, test ids,
// class names and the clock's storage key), and for a chunk named after the panel.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const MARKERS = [
  ['Open the dev tools', "the Dev tab's label"],
  ['dev-open', "the Dev tab's test id"],
  ['dev-panel', "the panel's test id"],
  ['dev__toggle', "the panel's styles"],
  ['gitaway:dev-clock', "the game clock's stored offset"],
]
const TEXT = new Set(['.js', '.mjs', '.css', '.html'])

const [dir, expectation] = process.argv.slice(2)
if (!dir || (expectation !== 'with' && expectation !== 'without')) {
  console.error('usage: node scripts/check-dev-tools.mjs <dist-folder> <with|without>')
  process.exit(2)
}

function* files(folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else yield path
  }
}

const found = new Map() // marker text -> the files that have it
let scanned = 0
let panelChunk = false
for (const path of files(dir)) {
  const name = relative(dir, path)
  if (/devpanel/i.test(name)) panelChunk = true
  if (!TEXT.has(extname(path))) continue
  scanned += 1
  const text = readFileSync(path, 'utf8')
  for (const [marker] of MARKERS) {
    if (text.includes(marker)) found.set(marker, [...(found.get(marker) ?? []), name])
  }
}

if (scanned === 0) {
  console.error(`No built files in ${dir}: build the web app first.`)
  process.exit(2)
}

const problems = []
if (expectation === 'with') {
  for (const [marker, what] of MARKERS) {
    if (!found.has(marker)) problems.push(`missing "${marker}" (${what})`)
  }
} else {
  for (const [marker, what] of MARKERS) {
    if (found.has(marker)) problems.push(`found "${marker}" (${what}) in ${found.get(marker).join(', ')}`)
  }
  if (panelChunk) problems.push('found a file named after the Dev panel')
}

if (problems.length > 0) {
  console.error(`${dir} should be a build ${expectation} the dev tools, but:`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log(`${dir}: ${expectation} the dev tools, as it should be (${scanned} files checked).`)
