// The island's characters: Barnaby Wick (docs/superpowers/specs/2026-10-22-barnaby-design.md),
// Síofra (docs/superpowers/specs/2026-10-25-siofra-design.md: her slice of the
// save here, her step in siofra.ts), and the shiver that runs through the
// island when work is done.
// They never pay coins, wood or XP, nothing of theirs counts down, and they
// never leave. While the switch is off (see features.ts) their slice stays in
// the save.

import { BARNABY, type LandPiece } from '../content/barnaby'
import { MOMENT_IDS, SIOFRA, type SiofraGiftId } from '../content/siofra'
import { isOn } from '../features'
import { levelForXp } from '../progression'
import { clone, refuse, type Notice, type Result } from '../result'
import { bool, field, oneOf, ownKey, time } from '../sanitize'
import { localDateKey, type BarnabyStage, type GameState, type ShiverSize } from '../state'
import { barnabySettled, barnabySettledAt, SETTLE_MS } from './barnaby'
import { indices, list, morningStamp, nextMorning, notAfter, pickTap, saidFrom, SAYS_MS, speaking, staleDue } from './characterKit'
import { note, write } from './journal'
import { advanceSiofra, siofraDue } from './siofra'

// Importers of Barnaby's pieces keep finding them here.
export { barnabySettled, barnabySettledAt, nextMorning, SAYS_MS, SETTLE_MS, speaking }

// ---------------------------------------------------------------------------
// Barnaby's arc (spec §2): found the morning after level 6, camping by the
// garden, then living in the highland's ruin. The stage never goes back.

/** Once the farm reaches this level, he's due the next morning. */
export const ARRIVAL_LEVEL = 6
/** He's found at this local hour. */
export const ARRIVAL_HOUR = 6
// When he counts as settled (SETTLE_MS, barnabySettled, barnabySettledAt) is in barnaby.ts.

/** Every piece of land he has a line for, in the order he sees to them. */
const LAND_PIECES = Object.keys(BARNABY.land) as LandPiece[]

const ownedLand = (s: GameState): LandPiece[] => LAND_PIECES.filter((piece) => s.owned[piece] > 0)

/** A due time of his more than a day off, set while the clock ran ahead and since put right (see `staleDue`). */
const stale = (dueAt: number, now: number): boolean => staleDue(dueAt, now, ARRIVAL_HOUR)

/**
 * Whether `advanceCharacters` has anything to do, cheaply, for `DUE` in
 * advance.ts: Barnaby's step (see `barnabyDue`) or Síofra's (see `siofraDue`).
 */
export function charactersDue(s: GameState, now: number): boolean {
  return barnabyDue(s, now) || siofraDue(s, now)
}

/** Whether `advanceBarnaby` has anything to do: he's to be scheduled, or rescheduled, or found, or there's land he hasn't seen to. */
function barnabyDue(s: GameState, now: number): boolean {
  const b = s.characters.barnaby
  if (b.stage === 'away') {
    if (b.dueAt !== null && now >= b.dueAt) return true
    // Scheduling him, or putting back a due time that's stale, waits for the level.
    return levelForXp(s.xp) >= ARRIVAL_LEVEL && (b.dueAt === null || stale(b.dueAt, now))
  }
  return LAND_PIECES.some((piece) => s.owned[piece] > 0 && !b.sawLand.includes(piece))
}

/**
 * Finds him, at `at` (see `morningStamp`): a toast, and the journal line stamped
 * then. Land the farm already owns gets no line. If the highland is one, he
 * goes straight up to its ruin.
 */
function findBarnaby(s: GameState, at: number, now: number, out: Notice[]): void {
  const b = s.characters.barnaby
  b.foundAt = at
  b.sawLand = ownedLand(s)
  note(s, out, { kind: 'info', title: BARNABY.found.toast, journal: false }, now)
  write(s, 'character', BARNABY.found.title, BARNABY.found.detail, at)
  if (s.owned.highland > 0) {
    b.stage = 'ruin'
    b.movedAt = at
    write(s, 'character', BARNABY.straightToRuin.title, BARNABY.straightToRuin.detail, at)
  } else b.stage = 'camp'
}

/** Writes his line, journal only, for each piece of land claimed since he was found. Claiming the highland moves him. */
function seeToLand(s: GameState, now: number, out: Notice[]): boolean {
  const b = s.characters.barnaby
  const fresh = ownedLand(s).filter((piece) => !b.sawLand.includes(piece))
  for (const piece of fresh) {
    b.sawLand.push(piece)
    const { title, detail } = BARNABY.land[piece]
    note(s, out, { kind: 'info', journal: 'character', quiet: true, title, detail }, now)
    if (piece === 'highland' && b.stage === 'camp') {
      b.stage = 'ruin'
      b.movedAt = now
    }
  }
  return fresh.length > 0
}

/**
 * The characters step: Barnaby's, then Síofra's (see siofra.ts), so hers sees
 * him as he is now. True if either changed anything. Mutates an already-cloned
 * state.
 */
export function advanceCharacters(s: GameState, now: number, out: Notice[]): boolean {
  const barnaby = advanceBarnaby(s, now, out)
  const siofra = advanceSiofra(s, now, out)
  return barnaby || siofra
}

/**
 * Schedules him once the farm reaches level 6 (again, if the clock ran ahead
 * when he was), finds him when that morning comes, then sees to land as it's
 * claimed. Mutates an already-cloned state.
 */
function advanceBarnaby(s: GameState, now: number, out: Notice[]): boolean {
  const b = s.characters.barnaby
  if (b.stage !== 'away') return seeToLand(s, now, out)
  if (b.dueAt === null || stale(b.dueAt, now)) {
    if (levelForXp(s.xp) < ARRIVAL_LEVEL) return false
    b.dueAt = nextMorning(now, ARRIVAL_HOUR)
    return true
  }
  if (now < b.dueAt) return false
  findBarnaby(s, morningStamp(b.dueAt, now, ARRIVAL_HOUR), now, out)
  return true
}

/**
 * His remark on a shiver, journal only (spec §3, §4): once he's on the island,
 * at most once a local day. Each line tagged with the shiver's size or
 * "either" comes round once, in order, before any of them comes round again.
 * Mutates an already-cloned state.
 */
export function barnabyRemark(s: GameState, size: ShiverSize, now: number, out: Notice[]): void {
  const b = s.characters.barnaby
  const today = localDateKey(now)
  if (b.stage === 'away' || b.lastRemarkDay === today) return
  const fits = BARNABY.shiver.flatMap((line, i) => (line.size === size || line.size === 'either' ? [i] : []))
  let index = fits.find((i) => !b.remarksUsed.includes(i))
  if (index === undefined) {
    b.remarksUsed = b.remarksUsed.filter((i) => !fits.includes(i))
    index = fits[0]
  }
  const { title, detail } = BARNABY.shiver[index]
  note(s, out, { kind: 'info', journal: 'character', quiet: true, title, detail }, now)
  b.remarksUsed.push(index)
  b.lastRemarkDay = today
}

// ---------------------------------------------------------------------------
// Taps (spec §3)

/** His tap lines, as one pool: the camp's, then the ruin's. */
const TAP_LINES = BARNABY.tapCamp.length + BARNABY.tapRuin.length

/** The line a tap index stands for: 0-11 are the camp's, 12-16 the ruin's. */
export function tapLine(index: number): string {
  const camp = BARNABY.tapCamp.length
  return index < camp ? BARNABY.tapCamp[index] : BARNABY.tapRuin[index - camp]
}

/**
 * The camp tap about the lean-to (ruling R12), which is no longer there once
 * he's moved into the ruin. It's in the pool only while he camps.
 */
const LEAN_TO_TAP = 11

/** The tap lines he has where he lives: the camp's, plus the ruin's once he's moved there, but not the lean-to line. */
function tapPool(stage: BarnabyStage): number[] {
  const ruin = stage === 'ruin'
  const lines = ruin ? TAP_LINES : BARNABY.tapCamp.length
  const every = Array.from({ length: lines }, (_, i) => i)
  return ruin ? every.filter((i) => i !== LEAN_TO_TAP) : every
}

/**
 * Taps him: picks a line for the label over his head, and remembers it in
 * `said`. The first tap ever is always his introduction. After that each line
 * of the pool (see `tapPool`) comes round once, picked by `rand`, before any
 * comes round again; and the first of a new round is never the line he's just
 * said. No notice, no journal line, nothing paid. Refused while he's away or
 * the characters are off.
 */
export function tapBarnaby(state: GameState, now: number, rand: () => number = Math.random): Result {
  if (!isOn('characters') || state.characters.barnaby.stage === 'away') return refuse(state)
  const s = clone(state)
  const b = s.characters.barnaby
  let index = 0
  if (b.met) {
    const tap = pickTap(tapPool(b.stage), b.heard, b.said, rand)
    index = tap.index
    b.heard = tap.heard
  } else if (!b.heard.includes(index)) b.heard.push(index)
  b.met = true
  b.said = { index, at: now }
  return { state: s, notices: [], ok: true }
}

// ---------------------------------------------------------------------------
// Saves

const STAGES: readonly BarnabyStage[] = ['away', 'camp', 'ruin']
const SHIVER_SIZES: readonly ShiverSize[] = ['big', 'small']

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function shiverFrom(raw: unknown, now: number): GameState['characters']['shiver'] {
  const at = notAfter(time(field(raw, 'at')), now)
  const size = SHIVER_SIZES.find((x) => x === field(raw, 'size'))
  return at !== null && size ? { at, size } : null
}

/**
 * A time of a moment's pacing that isn't after now, or null: a clock that ran
 * ahead and was put right can't have stamped it, and the pacing just starts
 * again (as `mail.checkedAt` is read). Not for the meeting: see `siofraFrom`.
 */
const notFuture = (raw: unknown, now: number): number | null => {
  const t = time(raw)
  return t !== null && t <= now ? t : null
}

/** Síofra's tap lines, her twelve and then her three naps, as one pool. */
const SIOFRA_TAP_LINES = SIOFRA.taps.length

/**
 * Repairs the saved Síofra. A save from before her has no slice, and loads her
 * as not met. A meeting time ahead of the clock is put back to now, as
 * Barnaby's `foundAt` is: she was met, and never gets a second meeting. Her
 * due time is kept as saved, as his is: the characters step puts back one
 * that's stale (see siofra.ts).
 */
function siofraFrom(raw: unknown, now: number): GameState['characters']['siofra'] {
  const lastMoment = field(raw, 'lastMoment')
  return {
    dueAt: time(field(raw, 'dueAt')),
    metAt: notAfter(time(field(raw, 'metAt')), now),
    momentAt: notFuture(field(raw, 'momentAt'), now),
    checkedAt: notFuture(field(raw, 'checkedAt'), now),
    lastMoment: typeof lastMoment === 'string' && MOMENT_IDS.includes(lastMoment) ? lastMoment : null,
    given: [...new Set(list(field(raw, 'given')).filter((id): id is SiofraGiftId => ownKey(SIOFRA.gifts, id)))],
    met: bool(field(raw, 'met'), false),
    heard: indices(field(raw, 'heard'), SIOFRA_TAP_LINES),
    said: saidFrom(field(raw, 'said'), SIOFRA_TAP_LINES, now),
  }
}

/**
 * Repairs the saved characters. `farm` is the farm being loaded, with what it
 * owns already final: Barnaby only lives in the ruin while the highland is
 * the farm's, and camps by the garden otherwise.
 */
export function sanitizeCharacters(raw: unknown, farm: GameState, now: number): Pick<GameState, 'characters'> {
  const c = field(raw, 'characters')
  const b = field(c, 'barnaby')
  let stage = oneOf(field(b, 'stage'), STAGES, 'away')
  // Without the highland he's back at the camp, as if he'd never moved.
  const demoted = stage === 'ruin' && !farm.owned.highland
  if (demoted) stage = 'camp'
  // Found means found at some time: now, if the save lost it.
  const foundAt = notAfter(time(field(b, 'foundAt')), now) ?? (stage === 'away' ? null : now)
  // At the ruin means moved at some time: when he was found, if the save lost it.
  const movedAt = demoted ? null : (notAfter(time(field(b, 'movedAt')), now) ?? (stage === 'ruin' ? foundAt : null))
  const day = field(b, 'lastRemarkDay')
  return {
    characters: {
      shiver: shiverFrom(field(c, 'shiver'), now),
      barnaby: {
        stage,
        dueAt: time(field(b, 'dueAt')),
        foundAt,
        movedAt,
        sawLand: [...new Set(list(field(b, 'sawLand')).filter((id): id is LandPiece => ownKey(BARNABY.land, id)))],
        remarksUsed: indices(field(b, 'remarksUsed'), BARNABY.shiver.length),
        lastRemarkDay: typeof day === 'string' && DATE_KEY.test(day) ? day : null,
        met: bool(field(b, 'met'), false),
        heard: indices(field(b, 'heard'), TAP_LINES),
        said: saidFrom(field(b, 'said'), TAP_LINES, now),
      },
      siofra: siofraFrom(field(c, 'siofra'), now),
    },
  }
}
