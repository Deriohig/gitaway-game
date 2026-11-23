/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { letterParts, letterWordCount } from '../systems/mail'
import { LETTERS, LETTER_IDS, type LetterDef } from './letters'

/** The lore's section on the field notes: from its heading to the next one. */
function loreSection(): string {
  const voices = readFileSync(new URL('../../../docs/lore/VOICES.md', import.meta.url), 'utf8')
  const start = voices.indexOf('### Field notes, the full set')
  expect(start, 'the lore has a "Field notes, the full set" section').toBeGreaterThanOrEqual(0)
  const end = voices.indexOf('\n### ', start + 1)
  return voices.slice(start, end === -1 ? undefined : end)
}

describe('the field notes', () => {
  it('holds the ten notes, from Barnaby, chained and gated as the lore says', () => {
    const note = (needs: string, after: string | null = null) => ({ from: 'barnaby', needs: [needs], after })
    expect(Object.fromEntries(LETTER_IDS.map((id) => [id, { from: LETTERS[id].from, needs: [...LETTERS[id].needs], after: LETTERS[id].after }]))).toEqual({
      bell: note('wetland'),
      'bell-rung-back': note('wetland', 'bell'),
      'cloud-sea': note('islet'),
      'cloud-sea-thursday': note('islet', 'cloud-sea'),
      'grove-key': note('grove'),
      'grove-tuning-fork': note('grove', 'grove-key'),
      'docking-height': note('twoPiecesDocked'),
      'siofra-readings': note('siofraMet'),
      fin: note('finOnJetty'),
      'ruin-stairs': note('inRuin'),
    })
    for (const id of LETTER_IDS) expect(LETTERS[id].id).toBe(id)
  })

  it('counts the salutation, the title, the lines and the sign-off, and keeps every note under 90 words', () => {
    const small: LetterDef = { id: 'bell', from: 'barnaby', needs: [], after: null, title: 'Field note: a b.', established: ['x y'], notEstablished: 'z', next: 'w v u' }
    // "Dear {farm}," 2, the title 4, "Established: x y" 3, "Not established: z" 3, "Next: w v u" 4, "Barnaby" 1.
    expect(letterWordCount(small)).toBe(2 + 4 + 3 + 3 + 4 + 1)
    expect(letterWordCount(LETTERS['cloud-sea'])).toBe(2 + 5 + 31 + 13 + 11 + 1)
    for (const id of LETTER_IDS) expect(letterWordCount(LETTERS[id]), id).toBeLessThan(90)
  })

  it('matches the lore drafts word for word, with no Markdown or line breaks in any part', () => {
    const lore = loreSection()
    for (const id of LETTER_IDS) {
      const { salutation, title, lines, signOff } = letterParts(LETTERS[id], '{farm}')
      const quote = [`> ${salutation}`, '>', `> **${title}**`, ...lines.map((l) => `> ${l}`), '>', `> ${signOff}`].join('\n')
      expect(lore, id).toContain(quote)
      for (const part of [salutation, title, ...lines, signOff]) expect(part, id).not.toMatch(/\*\*|\n/)
    }
  })

  it('lays a note out as its established lines, then what is not established, then what is next', () => {
    expect(letterParts(LETTERS['cloud-sea'], 'Brookside').lines).toEqual([
      "Established: it isn't wet. I lowered a weighted string off the islet, as far as it would go, and it came back up as dry as the inside of my hat.",
      "Not established: whether that's wonderful or alarming. It's certainly one of the two.",
      'Next: Thursday. Same string, with a wet sponge on the end.',
    ])
    const bell = letterParts(LETTERS.bell, 'Brookside')
    expect([bell.lines.length, bell.signOff]).toEqual([4, 'Barnaby'])
  })

  it('puts the farm name in the salutation literally', () => {
    expect(letterParts(LETTERS.bell, 'A $& B').salutation).toBe('Dear A $& B,')
    expect(letterParts(LETTERS.bell, '{farm}').salutation).toBe('Dear {farm},')
  })
})
