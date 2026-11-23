// The journal (A1): a plain record of what happened on the island, newest
// first. Every notice from the rules goes through `note`, which writes the
// journal line and, unless it is quiet, the toast. Story lines mark firsts and
// each part of the island opening up, in a few plain words.

import { itemAvailable } from '../available'
import { MINUTE, type ItemId } from '../config'
import { isOn, type FeatureId } from '../features'
import { levelForXp } from '../progression'
import { clone, refuse, type Notice, type NoticeKind, type Result } from '../result'
import { count, field, isObj, text, time } from '../sanitize'
import { JOURNAL_KINDS, type GameState, type JournalEntry, type JournalKind } from '../state'

export const JOURNAL = {
  /** Busy kinds keep only their newest lines, each kind on its own. */
  busyKinds: ['work', 'garden', 'build', 'craft'] as readonly JournalKind[],
  keepBusy: 400,
  /** Nothing beyond this many lines is kept, whatever the kind. */
  hardCap: 3000,
  /** Player notes, on an entry or for next time. */
  noteMax: 140,
  titleMax: 160,
  detailMax: 300,
} as const

/** Kinds that make up the welcome-back recap. */
export const RECAP_KINDS: readonly JournalKind[] = ['garden', 'craft', 'visitor', 'letter', 'fish', 'git', 'cottage', 'restoration', 'character']

/**
 * Kinds of line that belong to an idle-loop feature. A save from a build that
 * had the feature on can carry them: they stay in the save, but are left out
 * of the journal and the recap while it's switched off (see features.ts).
 * Every other kind, commits included, is part of every farm.
 */
const KIND_FEATURES: Partial<Record<JournalKind, readonly FeatureId[]>> = {
  visitor: ['visitors'],
  letter: ['letters'],
  restoration: ['restorations'],
  stamp: ['stamps'],
  craft: ['workshop'],
  fish: ['fishing'],
  cottage: ['cottage'],
  character: ['characters'],
}

/** Whether lines of a kind show, with the feature switches as they are. */
export function kindShown(kind: JournalKind): boolean {
  const features = KIND_FEATURES[kind]
  return !features || features.some(isOn)
}

/**
 * Whether a line shows, with the feature switches as they are: its kind's
 * feature is on, and if it's a story line that tells of a feature (known by
 * its words, see `STORY_SHOWN`), that one is too.
 */
export function lineShown(e: JournalEntry): boolean {
  if (!kindShown(e.kind)) return false
  return e.kind !== 'story' || (STORY_SHOWN.get(e.title)?.() ?? true)
}

/** The lines the player sees, in the same order: those of switched-off features are left out. */
export const shownLines = (entries: JournalEntry[]): JournalEntry[] => entries.filter(lineShown)

/** Away at least this long and the recap card gathers what happened. */
export const RECAP_AFTER_MS = 10 * MINUTE

/** While the page is visible, `seenAt` moves on at most this often. */
export const SEEN_EVERY_MS = MINUTE

const DEFAULT_KIND: Record<NoticeKind, JournalKind | false> = {
  reward: 'work',
  session: 'work',
  crop: 'garden',
  level: 'level',
  unlock: 'level',
  animal: 'build',
  info: false,
  warn: false,
}

/** The journal kind a notice is written down as, or false. Warnings never are. */
export function journalKindOf(notice: Notice): JournalKind | false {
  if (notice.kind === 'warn') return false
  return notice.journal ?? DEFAULT_KIND[notice.kind]
}

const BUSY = new Set<JournalKind>(JOURNAL.busyKinds)

/**
 * Applies the retention rules to a newest-first list. A busy line the player
 * wrote a note on is never trimmed with the rest of its kind; only the hard
 * cap applies to it.
 */
export function retain(entries: JournalEntry[]): JournalEntry[] {
  const busy: Partial<Record<JournalKind, number>> = {}
  const kept: JournalEntry[] = []
  for (const e of entries) {
    if (BUSY.has(e.kind)) {
      const n = (busy[e.kind] ?? 0) + 1
      busy[e.kind] = n
      if (n > JOURNAL.keepBusy && !e.note) continue
    }
    kept.push(e)
    if (kept.length >= JOURNAL.hardCap) break
  }
  return kept
}

/** The journal's order: newest first by `at`, and of two lines at the same moment, the one written later. */
const newestFirst = (a: JournalEntry, b: JournalEntry): number => b.at - a.at || b.id - a.id

/**
 * Writes one journal line, stamped `at`, in its place in the journal (see
 * `newestFirst`). Most lines are written as things happen and go on top; a
 * catch-up writes lines at the times things happened, which can be earlier
 * than lines it has already written. Mutates an already-cloned state.
 */
export function write(s: GameState, kind: JournalKind, title: string, detail: string | undefined, at: number): JournalEntry {
  const entry: JournalEntry = { id: ++s.journalSeq, at, kind, title: title.slice(0, JOURNAL.titleMax) }
  if (detail) entry.detail = detail.slice(0, JOURNAL.detailMax)
  // Its id is the newest, so it goes above every line from the same moment or before.
  const place = s.journal.findIndex((e) => e.at <= at)
  s.journal.splice(place < 0 ? s.journal.length : place, 0, entry)
  if (s.journal.length > JOURNAL.keepBusy) s.journal = retain(s.journal)
  return entry
}

/**
 * The one way rules tell the player something: writes the journal line (if the
 * notice has a journal kind), stamped `at`, and queues the toast (unless it's quiet).
 */
export function note(s: GameState, out: Notice[], notice: Notice, at: number): void {
  const kind = journalKindOf(notice)
  if (kind) {
    const words = notice.entry ?? { title: notice.title, detail: notice.detail }
    write(s, kind, words.title, words.detail, at)
  }
  if (!notice.quiet) out.push(notice)
}

/**
 * When to stamp a line about something that happened on its own, as time
 * catches up: when it happened, but never later than `now`, and never at or
 * before the last time the player was here (`seenAt`), or the recap, which
 * gathers the lines after that, would leave it out. (A tab hidden just after
 * something happened, before a tick saw it, is last seen after it.)
 */
export function eventTime(s: GameState, happened: number, now: number): number {
  return Math.min(now, Math.max(happened, s.seenAt + 1))
}

/** A quiet story line: journal only. */
export function tell(s: GameState, title: string, now: number, detail?: string): void {
  write(s, 'story', title, detail, now)
}

// ---------------------------------------------------------------------------
// Story lines

export type First = 'session' | 'task' | 'harvest' | 'commit'

const FIRSTS: Record<First, [string, string?]> = {
  session: ['You clocked in, did the work and clocked out again.', 'The chickens noticed.'],
  task: ['One thing done, and written down. It counts.'],
  harvest: ['The first harvest. Small, but it came out of your own soil.'],
  commit: ['A commit landed, and the island felt it faintly, like a ferry docking.'],
}

/** Writes the story line for a first. Callers check that it is the first. */
export function firstStory(s: GameState, first: First, now: number): void {
  const [title, detail] = FIRSTS[first]
  tell(s, title, now, detail)
}

/**
 * What opens at each level, told plainly (spec §4). Openings that need
 * building are told when built. A line that tells of a feature is only
 * written while that feature is switched on (see features.ts).
 *
 * Each line is told once, by its id, as soon as the farm has reached its
 * level and its feature is on: at the level-up, or later, when a farm already
 * past that level gets the feature in a new release.
 */
export const LADDER: Partial<Record<number, { id: string; line: string; feature?: FeatureId }[]>> = {
  2: [
    { id: 'almanac', line: 'The cat brought in an old almanac. Most of its pages are blank.', feature: 'almanac' },
    { id: 'wheat', line: 'There is wheat seed in the shop now.' },
  ],
  3: [{ id: 'workshop', line: 'Someone has drawn up plans for a workbench and a barn.', feature: 'workshop' }],
  6: [
    { id: 'restorations', line: 'A notice board has gone up by the path, with a list of old places worth mending.', feature: 'restorations' },
    { id: 'studio', line: 'There is a studio now, for moving things about until they look right.', feature: 'studio' },
  ],
}

const LADDER_LINES = Object.entries(LADDER).flatMap(([level, lines]) => (lines ?? []).map((l) => ({ ...l, level: Number(level) })))

/** Marks a story line as told, writing it unless the journal already has it (from before `told` was kept). */
function tellOnce(s: GameState, id: string, line: string, now: number): void {
  s.told.push(id)
  if (!s.journal.some((e) => e.kind === 'story' && e.title === line)) tell(s, line, now)
}

const ladderDue = (s: GameState, level: number) =>
  LADDER_LINES.filter((l) => l.level <= level && (!l.feature || isOn(l.feature)) && !s.told.includes(l.id))

/** Tells the ladder lines due by `level` that haven't been told yet. Mutates an already-cloned state. */
export function tellLadder(s: GameState, now: number, level = levelForXp(s.xp)): boolean {
  const due = ladderDue(s, level)
  for (const { id, line } of due) tellOnce(s, id, line, now)
  return due.length > 0
}

export const BUILT: Partial<Record<ItemId, string>> = {
  workbench: "There's a workbench under the oak now. It smells of sawdust.",
  barn: 'The barn is up. Nothing in it will ever spoil. The kitchen is through the side door.',
  press: 'The oil press creaks when it turns. It is meant to.',
  loom: 'The spinning wheel sits by the window, waiting for wool.',
}

/** The story line for building the first of something, if it has one and the thing is part of the game right now. */
export function builtStory(s: GameState, item: ItemId, now: number): void {
  const line = BUILT[item]
  if (line && itemAvailable(item)) tell(s, line, now)
}

/** Told once, to a farm upgraded from a save before version 3, when the economy was retuned (see save.ts). */
export const ECONOMY_CHANGED_ID = 'economy3'

/**
 * Every story line that can be told, by id. The wetland and highland once had
 * lines for when they could be claimed; land has no level now, so a save's
 * ids for those are dropped (the lines stay in its journal).
 */
export const STORY_IDS: readonly string[] = [...LADDER_LINES.map((l) => l.id), ECONOMY_CHANGED_ID]

/**
 * Story lines that tell of a feature, by their words, with whether that
 * feature is part of the game right now. A saved line keeps only its words, so
 * one worded differently by another build can't be told apart and stays shown.
 */
const STORY_SHOWN = new Map<string, () => boolean>([
  ...LADDER_LINES.flatMap(({ line, feature }) => (feature ? [[line, () => isOn(feature)] as const] : [])),
  ...Object.entries(BUILT).flatMap(([item, line]) => (line ? [[line, () => itemAvailable(item as ItemId)] as const] : [])),
])

/** Whether `advanceJournal` has anything to tell. Cheap, so an idle second can skip the clone. */
export const journalDue = (s: GameState): boolean => ladderDue(s, levelForXp(s.xp)).length > 0

/** Tells, once each, the ladder lines a farm has come to (a feature switched on, or a save from before the line existed). */
export function advanceJournal(s: GameState, now: number, _out: Notice[]): boolean {
  return tellLadder(s, now)
}

// ---------------------------------------------------------------------------
// Recap and presence

/**
 * Journal lines worth a welcome back: things that happened since `since`, the
 * last written first. A catch-up writes lines at the times things happened,
 * so this is the order it told them in, not the journal's (see `newestFirst`).
 */
export function recapEntries(s: GameState, since: number): JournalEntry[] {
  return s.journal.filter((e) => e.at > since && RECAP_KINDS.includes(e.kind) && lineShown(e)).sort((a, b) => b.id - a.id)
}

/** The player is here and looking. */
export function markSeen(state: GameState, now: number): Result {
  if (state.seenAt === now) return refuse(state)
  const s = clone(state)
  s.seenAt = now
  return { state: s, notices: [], ok: true }
}

const cleanNote = (raw: string) => raw.replace(/\s+/g, ' ').trim().slice(0, JOURNAL.noteMax)

/** Sets the player's one-line note on an entry; an empty note clears it. */
export function setEntryNote(state: GameState, id: number, raw: string): Result {
  const target = state.journal.find((e) => e.id === id)
  const clean = cleanNote(raw)
  if (!target || (target.note ?? '') === clean) return refuse(state)
  const s = clone(state)
  const entry = s.journal.find((e) => e.id === id)!
  if (clean) entry.note = clean
  else delete entry.note
  return { state: s, notices: [], ok: true }
}

/** Sets the "Note for next time"; an empty note clears it. */
export function setNextNote(state: GameState, raw: string): Result {
  const clean = cleanNote(raw)
  if (clean === state.nextNote) return refuse(state)
  const s = clone(state)
  s.nextNote = clean
  return { state: s, notices: [], ok: true }
}

// ---------------------------------------------------------------------------
// Saves

function entryFrom(raw: unknown): JournalEntry | null {
  if (!isObj(raw)) return null
  const id = count(raw.id)
  const at = time(raw.at)
  const kind = JOURNAL_KINDS.find((k) => k === raw.kind)
  const title = text(raw.title, JOURNAL.titleMax)
  if (!id || at === null || !kind || !title) return null
  const entry: JournalEntry = { id, at, kind, title }
  const detail = text(raw.detail, JOURNAL.detailMax)
  if (detail) entry.detail = detail
  const note = text(raw.note, JOURNAL.noteMax)
  if (note) entry.note = note
  return entry
}

export function sanitizeJournal(raw: unknown, _base: GameState, now: number): Pick<GameState, 'journal' | 'journalSeq' | 'seenAt' | 'nextNote' | 'told'> {
  const list = field(raw, 'journal')
  const seen = new Set<number>()
  const entries = (Array.isArray(list) ? list : [])
    .map(entryFrom)
    .filter((e): e is JournalEntry => !!e && !seen.has(e.id) && !!seen.add(e.id))
    // Saves before lines were put in their place by time kept them newest first by id.
    .sort(newestFirst)
  const journal = retain(entries)
  const journalSeq = Math.max(count(field(raw, 'journalSeq')), ...journal.map((e) => e.id), 0)
  // A save without a seenAt was last played by a version that didn't track it:
  // treat the player as just arrived, so nothing is recapped twice.
  const seenAt = Math.min(time(field(raw, 'seenAt')) ?? now, now)
  const rawTold = field(raw, 'told')
  const told = [...new Set((Array.isArray(rawTold) ? rawTold : []).filter((id): id is string => typeof id === 'string' && STORY_IDS.includes(id)))]
  return { journal, journalSeq, seenAt, nextNote: cleanNote(text(field(raw, 'nextNote'), JOURNAL.noteMax)), told }
}
