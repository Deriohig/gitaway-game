// Mail (B4): letters from the island's characters. Each is delivered once;
// nothing is owed and nothing expires. Barnaby's field notes come in the
// morning post, one every few days once he has settled, with a quiet journal
// line and never a toast (docs/superpowers/specs/2026-10-24-letters-design.md).

import { BARNABY, type LandPiece } from '../content/barnaby'
import { LETTERS, LETTER_IDS, LETTER_SENDERS, SALUTATION, type LetterDef, type LetterId, type LetterNeed } from '../content/letters'
import { isOn } from '../features'
import { clone, refuse, type Notice, type Result } from '../result'
import { bool, field, isObj, time } from '../sanitize'
import { localDateKey, type GameState, type Letter } from '../state'
import { barnabySettledAt } from './characters'
import { eventTime, write } from './journal'

/** A letter id this version knows (own keys only, so `toString` and its kin are not letters). */
function isLetterId(x: unknown): x is LetterId {
  return typeof x === 'string' && Object.hasOwn(LETTERS, x)
}

export function sanitizeMail(raw: unknown, _base: GameState, now: number): Pick<GameState, 'mail'> {
  const list = field(field(raw, 'mail'), 'letters')
  const delivered = new Set<LetterId>()
  const letters: Letter[] = []
  for (const l of Array.isArray(list) ? list : []) {
    if (!isObj(l)) continue
    const id = l.id
    if (!isLetterId(id) || delivered.has(id)) continue
    const at = time(l.at)
    if (at === null) continue
    delivered.add(id)
    // A letter can't have come after now: a clock that ran ahead, since put right, mustn't hold up the post.
    letters.push({ id, at: Math.min(at, now), read: bool(l.read, false) })
  }
  // A post time from the future (the clock was ahead, then corrected) is not trusted.
  const checkedAt = time(field(field(raw, 'mail'), 'checkedAt'))
  return { mail: { letters, checkedAt: checkedAt !== null && checkedAt <= now ? checkedAt : null } }
}

/**
 * A letter laid out in its parts: the salutation, the bold title, one line each for what is established, what is not
 * and what is next, and the sign-off. The farm's name goes in literally (no `$&` or `{farm}` in it means anything).
 */
export function letterParts(def: LetterDef, farmName: string): { salutation: string; title: string; lines: string[]; signOff: string } {
  return {
    salutation: SALUTATION.replace('{farm}', () => farmName),
    title: def.title,
    lines: [...def.established.map((e) => `Established: ${e}`), `Not established: ${def.notEstablished}`, `Next: ${def.next}`],
    signOff: LETTER_SENDERS[def.from].signOff,
  }
}

/** The words in a letter, salutation to sign-off. The farm's name counts as one word, whatever it turns out to be. */
export function letterWordCount(def: LetterDef): number {
  const { salutation, title, lines, signOff } = letterParts(def, '{farm}')
  return [salutation, title, ...lines, signOff].reduce((n, part) => n + part.split(/\s+/).filter(Boolean).length, 0)
}

// ---------------------------------------------------------------------------
// The morning post (spec "Delivery", rulings R1, R2 and R4). Local dates and
// hours throughout, never 24 hours in milliseconds, so a daylight-saving day
// still posts at 08:00.

/** The post comes at this local hour. */
export const POST_HOUR = 8
/** Local days from one letter to the next. */
export const LETTER_GAP_DAYS = 3
/** A follow-up comes no sooner than this many local days after the note it follows. */
export const FOLLOW_UP_DAYS = 2

/** Every piece of new land, as Barnaby has them (see characters.ts). */
const LAND_PIECES = Object.keys(BARNABY.land) as LandPiece[]

/** 08:00 local on `ms`'s local date, `addDays` local days on. */
export function postTimeOn(ms: number, addDays = 0): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + addDays)
  d.setHours(POST_HOUR, 0, 0, 0)
  return d.getTime()
}

/** The latest post time at or before `now`: today's 08:00 from 08:00 on, yesterday's before. */
export function latestPost(now: number): number {
  const today = postTimeOn(now)
  return today <= now ? today : postTimeOn(now, -1)
}

/**
 * When the next letter is due: the first at 08:00 the morning after Barnaby settled, each later one `LETTER_GAP_DAYS`
 * local days after the latest letter. Null until he has settled.
 */
export function letterDue(s: GameState): number | null {
  const settled = barnabySettledAt(s)
  if (settled === null) return null
  const letters = s.mail.letters
  if (letters.length === 0) return postTimeOn(settled, 1)
  let last = letters[0].at
  for (let i = 1; i < letters.length; i++) if (letters[i].at > last) last = letters[i].at
  return postTimeOn(last, LETTER_GAP_DAYS)
}

/**
 * Local days after Síofra is met before Barnaby's note about her can come, so it never lands the morning after the
 * meeting (docs/superpowers/specs/2026-10-25-siofra-design.md, "Knock-on").
 */
export const SIOFRA_LETTER_DAYS = 3

/** The spec's gates, at the post time `post`. The state has no separate "docked" flag, so owned counts as docked. */
const NEEDS: Record<LetterNeed, (s: GameState, post: number) => boolean> = {
  wetland: (s) => s.owned.wetland > 0,
  islet: (s) => s.owned.islet > 0,
  grove: (s) => s.owned.grove > 0,
  twoPiecesDocked: (s) => LAND_PIECES.filter((piece) => s.owned[piece] > 0).length >= 2,
  inRuin: (s) => s.characters.barnaby.stage === 'ruin',
  // She's been met, and the post is at least `SIOFRA_LETTER_DAYS` local days after the meeting's.
  siofraMet: (s, post) => {
    const met = s.characters.siofra.metAt
    return met !== null && post >= postTimeOn(met, SIOFRA_LETTER_DAYS)
  },
  // Until Fin is built.
  finOnJetty: () => false,
}

/** Whether the island has what a note needs, at the post time `post`. */
export const needMet = (s: GameState, need: LetterNeed, post: number): boolean => NEEDS[need](s, post)

/**
 * The notes that could come at the post time `post`, in table order: not yet sent, every need met, and the note each
 * follows (if any) sent at least `FOLLOW_UP_DAYS` local days before.
 */
export function unlockedNotes(s: GameState, post: number): LetterId[] {
  const sentAt = (id: LetterId) => s.mail.letters.find((l) => l.id === id)?.at
  return LETTER_IDS.filter((id) => {
    const def = LETTERS[id]
    if (sentAt(id) !== undefined || !def.needs.every((need) => needMet(s, need, post))) return false
    if (def.after === null) return true
    const afterAt = sentAt(def.after)
    return afterAt !== undefined && postTimeOn(afterAt, FOLLOW_UP_DAYS) <= post
  })
}

/** 32-bit FNV-1a over a string's UTF-16 code units (the keys hashed here are ASCII). */
function fnv1a(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** One of `ids`, at random but repeatably: picked by the post's local date and the notes already sent, in order. */
export function pickNote(ids: readonly LetterId[], post: number, sent: readonly LetterId[]): LetterId {
  return ids[fnv1a(`${localDateKey(post)}|${sent.join(',')}`) % ids.length]
}

/**
 * Whether `advanceMail` has anything to do, cheaply, for `DUE` in advance.ts: Barnaby has settled (with the characters
 * on), a letter is due by the latest post time, and that post hasn't been considered yet.
 */
export function mailDue(s: GameState, now: number): boolean {
  if (!isOn('characters') || s.mail.letters.length >= LETTER_IDS.length) return false
  const due = letterDue(s)
  if (due === null) return false
  const post = latestPost(now)
  return post >= due && (s.mail.checkedAt === null || post > s.mail.checkedAt)
}

/**
 * The morning post: at most one letter per post time, and only at the latest one crossed. While a letter that came
 * after the player last looked is waiting, nothing more comes, so however long the game was closed (or however
 * catch-up splits the span) one letter waits at most. With nothing unlocked the post passes in silence, and the next
 * one is tried. A letter writes one quiet journal line and no toast. Mutates an already-cloned state.
 */
export function advanceMail(s: GameState, now: number, _out: Notice[]): boolean {
  if (!mailDue(s, now)) return false
  const post = latestPost(now)
  s.mail.checkedAt = post
  if (s.mail.letters.some((l) => l.at > s.seenAt)) return true
  const ids = unlockedNotes(s, post)
  if (ids.length === 0) return true
  const id = pickNote(ids, post, s.mail.letters.map((l) => l.id))
  const at = eventTime(s, post, now)
  s.mail.letters.push({ id, at, read: false })
  write(s, 'letter', `A letter from ${LETTER_SENDERS[LETTERS[id].from].name}.`, undefined, at)
  return true
}

// ---------------------------------------------------------------------------
// Reading

/** Opens a letter: marks it read. Refused for one that hasn't come, or is read already. */
export function readLetter(state: GameState, id: LetterId): Result {
  const i = state.mail.letters.findIndex((l) => l.id === id)
  if (i < 0 || state.mail.letters[i].read) return refuse(state)
  const s = clone(state)
  s.mail.letters[i].read = true
  return { state: s, notices: [], ok: true }
}

/** Whether any letter that has come is still unread. */
export const hasUnread = (s: GameState): boolean => s.mail.letters.some((l) => !l.read)

/** Letters as the Letters tab lists them: unread first, then newest first. */
export const lettersForTab = (letters: readonly Letter[]): Letter[] =>
  [...letters].sort((a, b) => Number(a.read) - Number(b.read) || b.at - a.at)
