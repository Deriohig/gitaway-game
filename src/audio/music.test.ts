import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SESSION_TRACKS, nextTrack } from './music'

describe('session music', () => {
  it.each([
    [0, undefined, 1],
    [2, undefined, 0],
    [4, 5, 0],
  ])('after track %i (of %s) plays track %i', (from, count, next) => expect(nextTrack(from, count)).toBe(next))

  it.each(SESSION_TRACKS)('ships $title', ({ file }) => {
    expect(existsSync(new URL(`../../public/${file}`, import.meta.url))).toBe(true)
  })
})
