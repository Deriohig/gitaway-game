/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { JOURNAL } from '../systems/journal'
import { MOMENT_IDS, SIOFRA, SIOFRA_NAME, type MomentLine } from './siofra'

const HEADING = '### Game lines, for the game spec (2026-10-25)'
const TOAST_MAX = 60
const TAP_MAX = 80

/** The púca's fitted game lines in the lore, from their heading to the rule after them, as lines. */
function loreLines(): string[] {
  const voices = readFileSync(new URL('../../../docs/lore/VOICES.md', import.meta.url), 'utf8')
  const start = voices.indexOf(HEADING)
  expect(start, `the lore has a "${HEADING}" subsection`).toBeGreaterThanOrEqual(0)
  const end = voices.indexOf('\n---', start)
  return voices.slice(start, end === -1 ? undefined : end).split('\n')
}

/** The lines under a bold label (`**label**`): from the first that isn't blank to the next blank line. */
function block(lines: string[], label: string): string[] {
  const at = lines.findIndex((l) => l.startsWith(`**${label}**`))
  expect(at, `the lore has "${label}"`).toBeGreaterThanOrEqual(0)
  const rest = lines.slice(at + 1)
  const body = rest.slice(rest.findIndex((l) => l !== ''))
  const end = body.indexOf('')
  return end === -1 ? body : body.slice(0, end)
}

const cells = (row: string): string[] =>
  row
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim().replace(/^`(.*)`$/, '$1'))
/** The rows of a table block, as cells, after its header and its separator. */
const table = (lines: string[], label: string): string[][] => block(lines, label).slice(2).map(cells)
/** The items of a numbered list block, without their numbers. */
const numbered = (lines: string[], label: string): string[] => block(lines, label).map((l) => l.replace(/^\d+\. /, ''))
/** One bullet of a block, written `- *Key:* text`. */
function bullet(lines: string[], key: string): string {
  const prefix = `- *${key}:* `
  const found = lines.find((l) => l.startsWith(prefix))
  expect(found, `the lore has "${key}"`).toBeDefined()
  return found!.slice(prefix.length)
}

const SHAPE_NEEDS: Record<string, string | null> = { nothing: null, sheep: 'sheep', scarecrow: 'scarecrow', fruitTree: 'fruitTree', chicken: 'chicken' }
const NOTICE_NEEDS: Record<string, string> = { ripeCrop: 'ripe', restingSoil: 'resting' }

const moments = (): MomentLine[] => [...SIOFRA.glimpses, ...SIOFRA.shapes, ...SIOFRA.cropsLeftStanding, ...Object.values(SIOFRA.gifts)]

describe("Síofra's lines", () => {
  it('names her with its í as one character, in the hare lines too, and gives every moment its own id', () => {
    expect(SIOFRA_NAME).toBe('Síofra'.normalize('NFC'))
    expect(SIOFRA.hareOnceMet).toEqual({ keepsakeLine: `${SIOFRA_NAME} left a clover sprig.`, sayHello: `Say hello to ${SIOFRA_NAME}` })
    const ids = moments().map((l) => l.id)
    expect(ids).toEqual([
      ...['glimpse-1', 'glimpse-2', 'glimpse-3', 'glimpse-4'],
      ...['shape-sheep', 'shape-goat', 'shape-crow', 'shape-fruit-tree', 'shape-duck', 'shape-chicken', 'shape-stone', 'shape-hedge'],
      ...['notice-ripe-1', 'notice-resting', 'notice-ripe-2'],
      ...['gift-pebble', 'gift-feather', 'gift-clover', 'gift-dandelion', 'gift-shell'],
    ])
    expect(MOMENT_IDS).toEqual(ids)
  })

  it('fits every line to its place, and counts nothing: no digits in any line', () => {
    for (const { title, detail } of [SIOFRA.met, ...moments()]) {
      expect(title.length, title).toBeGreaterThan(0)
      expect(title.length, title).toBeLessThanOrEqual(JOURNAL.titleMax)
      expect(detail.length, title).toBeGreaterThan(0)
      expect(detail.length, title).toBeLessThanOrEqual(JOURNAL.detailMax)
    }
    expect(SIOFRA.met.toast.length).toBeLessThanOrEqual(TOAST_MAX)
    for (const { line } of SIOFRA.taps) {
      expect(line.length, line).toBeGreaterThan(0)
      expect(line.length, line).toBeLessThanOrEqual(TAP_MAX)
    }
    const everything = [
      ...Object.values(SIOFRA.met),
      ...Object.values(SIOFRA.hareOnceMet),
      ...moments().flatMap((l) => [l.title, l.detail]),
      ...Object.values(SIOFRA.gifts).map((g) => g.item),
      ...SIOFRA.taps.map((t) => t.line),
    ]
    for (const text of everything) expect(text).not.toMatch(/\d/)
  })

  it('writes the sheep, goat, duck and chicken shapes in the past tense', () => {
    const wanted = ['shape-sheep', 'shape-goat', 'shape-duck', 'shape-chicken']
    const past = SIOFRA.shapes.filter((s) => wanted.includes(s.id))
    expect(past.map((s) => s.id)).toEqual(wanted)
    for (const { id, title, detail } of past) expect(`${title} ${detail}`, id).not.toMatch(/There's|is lounging|has joined|is sitting/i)
  })

  it('holds the duckling tap until ducks and the second nap until the cat', () => {
    expect(SIOFRA.taps.map((t) => t.needs)).toEqual(Array.from({ length: 15 }, (_, i) => (i === 4 ? 'duck' : i === 13 ? 'cat' : undefined)))
    expect(SIOFRA.taps[4].line).toMatch(/^Can't stop\. A duckling/)
    expect(SIOFRA.taps[13].line).toMatch(/^Nap scores\. Farmhouse roof/)
  })
})

describe("Síofra's lines match the lore word for word", () => {
  const lore = loreLines()

  it('her hover name, the hare once she is met, and the meeting', () => {
    expect(lore.find((l) => l.startsWith('**Hover name:**'))).toBe(`**Hover name:** ${SIOFRA_NAME}`)
    const once = block(lore, 'hareOnceMet')
    expect(SIOFRA.hareOnceMet).toEqual({ keepsakeLine: bullet(once, 'Keepsake line'), sayHello: bullet(once, 'Say hello button') })
    const met = block(lore, 'metProperly')
    expect(SIOFRA.met).toEqual({ toast: bullet(met, 'Toast'), title: bullet(met, 'Title'), detail: bullet(met, 'Detail') })
  })

  it('the glimpses, the shapes with what each needs, and the crops-left-standing notices', () => {
    expect(SIOFRA.glimpses.map((g) => [g.title, g.detail])).toEqual(table(lore, 'hare.glimpses'))
    expect(SIOFRA.shapes.map((s) => [s.id, s.needs, s.title, s.detail])).toEqual(
      table(lore, 'shapes').map(([shape, needs, title, detail]) => [`shape-${shape.replace(' ', '-')}`, SHAPE_NEEDS[needs], title, detail]),
    )
    expect(SIOFRA.cropsLeftStanding.map((n) => [n.needs, n.title, n.detail])).toEqual(
      table(lore, 'noticesCropsLeftStanding').map(([needs, title, detail]) => [NOTICE_NEEDS[needs], title, detail]),
    )
  })

  it('the gifts by name, then the taps and the naps', () => {
    expect(Object.values(SIOFRA.gifts).map((g) => [g.item, g.title, g.detail])).toEqual(table(lore, 'gifts'))
    expect(SIOFRA.taps.map((t) => t.line)).toEqual([...numbered(lore, 'tapHerself'), ...numbered(lore, 'naps')])
  })
})
