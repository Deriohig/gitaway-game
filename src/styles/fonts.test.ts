import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { brotliDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { SIOFRA_NAME } from '../game/content/siofra'

// Síofra's name ships only if the UI fonts draw "í" (U+00ED) themselves, not a fallback. The browser takes U+0000-00FF
// from each font's latin subset, so that file's cmap must have it. WOFF2 tables are Brotli-compressed, which Node's zlib reads.

const require = createRequire(import.meta.url)
const FONTS = {
  Inter: '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  Fraunces: '@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2',
} as const
/** WOFF2 table directory: known-tag indices for cmap, glyf and loca; 63 means the tag follows in full. */
const [CMAP, GLYF, LOCA, OWN_TAG] = [0, 10, 11, 63]

/** A UIntBase128 (WOFF2 §4.1) at `at`: the number, and where the next field starts. */
function base128(b: Buffer, at: number): [number, number] {
  let value = 0
  for (let i = 0; i < 5; i++) {
    value = value * 128 + (b[at + i] & 0x7f)
    if ((b[at + i] & 0x80) === 0) return [value, at + i + 1]
  }
  throw new Error('a UIntBase128 longer than five bytes')
}

/** The 'cmap' table of a WOFF2 file: all tables are one decompressed stream, each as long as the directory says (transformed length if transformed). */
function cmapOf(file: string): Buffer {
  const b = readFileSync(require.resolve(file))
  expect(b.toString('latin1', 0, 4), 'a WOFF2 file').toBe('wOF2')
  expect(b.toString('latin1', 4, 8), 'one font, not a collection').not.toBe('ttcf')
  let at = 48
  let offset = 0
  let cmap: { offset: number; length: number } | null = null
  for (let i = 0; i < b.readUInt16BE(12); i++) {
    const flags = b[at++]
    const index = flags & 0x3f
    const tag = index === OWN_TAG ? b.toString('latin1', at, (at += 4)) : ''
    let length: number
    ;[length, at] = base128(b, at)
    // 'glyf' and 'loca' are transformed unless their version is 3; every other table, unless it's 0.
    const glyphs = index === GLYF || index === LOCA || tag === 'glyf' || tag === 'loca'
    if (glyphs ? flags >> 6 !== 3 : flags >> 6 !== 0) [length, at] = base128(b, at)
    if (index === CMAP || tag === 'cmap') cmap = { offset, length }
    offset += length
  }
  const stream = brotliDecompressSync(b.subarray(at, at + b.readUInt32BE(20)))
  expect(stream.length, 'the tables, end to end').toBe(offset)
  expect(cmap, 'a character map').not.toBeNull()
  return stream.subarray(cmap!.offset, cmap!.offset + cmap!.length)
}

/** The glyph a format 4 subtable (segment mapping to delta values) gives `code`, 0 for none. */
function format4(t: Buffer, code: number): number {
  const segments2 = t.readUInt16BE(6)
  const [ends, starts] = [14, 16 + segments2]
  const [deltas, ranges] = [starts + segments2, starts + 2 * segments2]
  for (let i = 0; i < segments2; i += 2) {
    if (t.readUInt16BE(ends + i) < code) continue
    const start = t.readUInt16BE(starts + i)
    if (start > code) return 0
    const delta = t.readUInt16BE(deltas + i)
    const range = t.readUInt16BE(ranges + i)
    if (range === 0) return (code + delta) & 0xffff
    const glyph = t.readUInt16BE(ranges + i + range + 2 * (code - start))
    return glyph === 0 ? 0 : (glyph + delta) & 0xffff
  }
  return 0
}

/** The glyph a format 12 subtable (segmented coverage) gives `code`, 0 for none. */
function format12(t: Buffer, code: number): number {
  for (let i = 0; i < t.readUInt32BE(12); i++) {
    const at = 16 + 12 * i
    const start = t.readUInt32BE(at)
    if (code >= start && code <= t.readUInt32BE(at + 4)) return t.readUInt32BE(at + 8) + (code - start)
  }
  return 0
}

/** The glyph the cmap's Unicode subtables (platform 0, or Windows 3/1 and 3/10) give a code point; 0, the missing glyph, means a fallback font. */
function glyphFor(cmap: Buffer, code: number): number {
  let read = 0
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const [platform, encoding] = [cmap.readUInt16BE(4 + 8 * i), cmap.readUInt16BE(6 + 8 * i)]
    if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue
    const t = cmap.subarray(cmap.readUInt32BE(8 + 8 * i))
    const format = t.readUInt16BE(0)
    if (format !== 4 && format !== 12) continue
    read++
    const glyph = format === 4 ? format4(t, code) : format12(t, code)
    if (glyph !== 0) return glyph
  }
  expect(read, 'a Unicode subtable read').toBeGreaterThan(0)
  return 0
}

describe('the bundled fonts', () => {
  it.each(Object.entries(FONTS))('%s draws every letter of her name itself, the "í" too, and the map can say no', (_, file) => {
    expect([...SIOFRA_NAME]).toEqual(['S', 'í', 'o', 'f', 'r', 'a']) // "í" is the one character U+00ED
    const cmap = cmapOf(file)
    for (const letter of [...SIOFRA_NAME, 'í']) expect(glyphFor(cmap, letter.codePointAt(0)!), letter).toBeGreaterThan(0)
    expect(glyphFor(cmap, 0x100), 'Ā (U+0100) is in the latin-ext file, not this one').toBe(0)
  })
})
