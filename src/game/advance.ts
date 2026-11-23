// Everything that happens on its own as time passes, in one place. The store
// calls `advance` once a second and once on load. It clones the state once,
// lets each part of the game catch up in a fixed order, and reports whether
// anything changed, so an idle second costs no save.
//
// Each step mutates the clone and returns true if it changed anything. That
// flag is the whole change check: there's no deep comparison of states.
// Before cloning, cheap `DUE` checks ask whether any step has work at all,
// so an idle second doesn't copy the whole farm either.

import { CROPS } from './config'
import { clone, rollDay } from './core'
import { isReady } from './engine'
import { isOn, type FeatureId } from './features'
import type { Notice, Result } from './result'
import { localDateKey, type GameState } from './state'
import { advanceCharacters, charactersDue } from './systems/characters'
import { advanceCottage } from './systems/cottage'
import { advanceFishing } from './systems/fishing'
import { advanceGitEvents } from './systems/gitEvents'
import { advanceJournal, eventTime, journalDue, note } from './systems/journal'
import { advanceMail, mailDue } from './systems/mail'
import { advanceRestoration, restorationDue } from './systems/restoration'
import { advanceStamps } from './systems/stamps'
import { advanceStudio } from './systems/studio'
import { advanceVisitors, visitorsDue } from './systems/visitors'
import { advanceWorkshop } from './systems/workshop'
import { advanceYields, yieldsDue } from './systems/yields'

type Step = (s: GameState, now: number, out: Notice[]) => boolean

/**
 * Marks newly ripe crops as announced and writes one gentle note for them,
 * stamped when the last of them ripened: after a while away, that can be long
 * before now.
 */
export function advanceCrops(s: GameState, now: number, out: Notice[]): boolean {
  const fresh = s.plots.filter((p) => isReady(p, now) && !p.notified)
  if (!fresh.length) return false
  for (const plot of s.plots) if (isReady(plot, now)) plot.notified = true
  const kinds = new Set(fresh.map((p) => p.crop!))
  const title =
    fresh.length === 1
      ? `Your ${CROPS[fresh[0].crop!].name.toLowerCase()} is ready`
      : kinds.size === 1
        ? `Your ${CROPS[fresh[0].crop!].plural} are ready`
        : `${fresh.length} crops are ready`
  const ripe = Math.max(...fresh.map((p) => p.readyAt!))
  note(s, out, { kind: 'crop', title, detail: 'Harvest whenever you like. They will wait.', entry: { title } }, eventTime(s, ripe, now))
  return true
}

/**
 * The order things catch up in (spec §1). Later steps see what earlier ones
 * did. A step that belongs to features runs only while one of them is
 * switched on (see features.ts); the rest always run.
 */
export const STEPS: [name: string, step: Step, features?: readonly FeatureId[]][] = [
  ['day', (s, now) => rollDay(s, now)],
  ['crops', advanceCrops],
  // What the farm made on its own, said once after an absence.
  ['yields', advanceYields],
  // The garden robin's harvests, producers, then finished station jobs.
  ['workshop', advanceWorkshop, ['workshop', 'helpers']],
  ['visitors', advanceVisitors, ['visitors']],
  ['fishing', advanceFishing, ['fishing']],
  ['restoration', advanceRestoration, ['restorations']],
  ['gitEvents', advanceGitEvents, ['gitEvents']],
  ['mail', advanceMail, ['letters']],
  ['cottage', advanceCottage, ['cottage']],
  ['studio', advanceStudio, ['studio']],
  ['stamps', advanceStamps, ['stamps']],
  // Barnaby: due, found, and his lines for land claimed since; then Síofra: her meeting, and her moments (shapes, a notice, gifts).
  ['characters', advanceCharacters, ['characters']],
  // Story lines for isles that can be claimed; each line checks its own feature.
  ['journal', advanceJournal],
]

/**
 * Cheap checks, by step name, for whether a step has anything to do. Each must
 * be true whenever its step would change something. A step without a check is
 * always taken as due: correct, but it copies the farm every second, so a
 * feature that fills in its step should add its check here.
 */
export const DUE: Partial<Record<string, (s: GameState, now: number) => boolean>> = {
  day: (s, now) => s.daily.date !== localDateKey(now),
  crops: (s, now) => s.plots.some((p) => isReady(p, now) && !p.notified),
  yields: yieldsDue,
  visitors: visitorsDue,
  restoration: restorationDue,
  mail: mailDue,
  characters: charactersDue,
  journal: journalDue,
}

const runs = (features?: readonly FeatureId[]) => !features || features.some(isOn)
const due = (name: string, s: GameState, now: number) => !Object.hasOwn(DUE, name) || DUE[name]!(s, now)

/** The steps that run with the switches as they are, by name. */
export const activeSteps = (): string[] => STEPS.filter(([, , features]) => runs(features)).map(([name]) => name)

export function advance(state: GameState, now: number): Result {
  // With nothing due nothing would change, so there's nothing to copy.
  if (!STEPS.some(([name, , features]) => runs(features) && due(name, state, now))) return { state, notices: [], ok: false }
  const s = clone(state)
  const out: Notice[] = []
  let changed = false
  for (const [, step, features] of STEPS) if (runs(features)) changed = step(s, now, out) || changed
  if (!changed) return { state, notices: [], ok: false }
  return { state: s, notices: out, ok: true }
}
