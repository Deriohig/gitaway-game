import { create } from 'zustand'
import { advance } from '../game/advance'
import { now as clockNow, resetClock, subscribeClock } from '../game/clock'
import type { ItemId } from '../game/config'
import { checkSessionMilestones, updateSettings, type Notice, type Result } from '../game/engine'
import { isOn } from '../game/features'
import { isObj } from '../game/sanitize'
import { isNewerSave, migrate, savedVersion } from '../game/save'
import { SAVE_VERSION, createInitialState, type GameState, type JournalEntry, type Settings } from '../game/state'
import { RECAP_AFTER_MS, SEEN_EVERY_MS, markSeen, recapEntries } from '../game/systems/journal'
import { eraseSave, keepOlderSave, noteStamp, readSave, writeBackup, writeSave } from './persistence'

export type PanelId = 'farm' | 'garden' | 'shop' | 'inventory' | 'island' | 'journal' | 'progress' | 'settings'

export interface Toast extends Notice {
  id: number
}

interface GameStore {
  game: GameState
  loaded: boolean
  /** False when this browser blocks storage; the farm then lasts one visit. */
  canSave: boolean
  now: number
  toasts: Toast[]
  panel: PanelId | null
  selectedPlot: number | null
  /** What happened while the player was away, shown once as a card. Null when there's nothing to show. */
  recap: JournalEntry[] | null
  /** The shop item drawn as a ghost on the island. UI only, never saved. */
  preview: ItemId | null

  init: () => Promise<void>
  /** Applies a pure game action at the current time. */
  run: (action: (state: GameState, now: number) => Result) => boolean
  /** Shows a toast that doesn't come from a game action, such as a desktop error. */
  notify: (notice: Notice) => void
  setSettings: (patch: Partial<Settings>) => void
  openPanel: (panel: PanelId | null) => void
  togglePanel: (panel: PanelId) => void
  selectPlot: (id: number | null) => void
  dismissToast: (id: number) => void
  dismissRecap: () => void
  setPreview: (id: ItemId | null) => void
  tick: () => void
  reset: () => Promise<void>
}

const MAX_TOASTS = 4
let toastId = 0
let channel: BroadcastChannel | null = null
const tabId = Math.random().toString(36).slice(2)
/** Saves run one after another; `dirty` means the latest state isn't stored yet. */
let writing: Promise<void> = Promise.resolve()
let dirty = false
let starting: Promise<void> | null = null
let warnedNewer = false

const NEWER_SAVE = "This farm was saved by a newer Gitaway, so changes won't be kept here"

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

export const useGame = create<GameStore>((set, get) => {
  const pushNotices = (notices: Notice[]) => {
    // Quiet mode keeps the journal and drops the toasts, except the answer to a click that didn't work.
    // It's part of the Attention dial (A6), so a saved quiet setting counts only while that is on.
    const quiet = isOn('attention') && get().game.settings.quiet
    const shown = quiet ? notices.filter((n) => n.kind === 'warn') : notices
    if (!shown.length) return
    const added = shown.map((n) => ({ ...n, id: ++toastId }))
    set((s) => ({ toasts: [...s.toasts, ...added].slice(-MAX_TOASTS) }))
  }

  // Every change is written straight away (writes are tiny). A write can still
  // be queued or in flight when the page goes away, so `persist` first takes a
  // synchronous backup, which the write clears once it lands, and loading
  // picks the newer copy. The other tabs hear each save's stamp, so theirs
  // come later.
  const flush = async () => {
    if (!dirty || !get().loaded) return
    dirty = false
    const savedAt = await writeSave(get().game)
    const ok = savedAt !== null
    if (ok) channel?.postMessage({ type: 'saved', from: tabId, savedAt })
    if (ok !== get().canSave) set({ canSave: ok })
  }

  /** Says once a session that this farm belongs to a newer Gitaway, so nothing is saved. */
  const warnNewer = () => {
    if (warnedNewer) return
    warnedNewer = true
    pushNotices([{ kind: 'warn', title: NEWER_SAVE }])
  }

  /**
   * Runs once a saved farm is read, before anything is written: a newer
   * Gitaway's farm gets its warning, and an older version's save is kept
   * aside, as it was, ahead of the first write that upgrades it.
   */
  const guardStored = (raw: unknown, game: GameState) => {
    if (isNewerSave(game)) return warnNewer()
    const version = savedVersion(raw)
    if (isObj(raw) && version < SAVE_VERSION) {
      writing = writing.then(async () => {
        await keepOlderSave(raw, version)
      })
    }
  }

  const persist = () => {
    // A newer Gitaway's farm is never written over (see `isNewerSave`): nothing
    // is saved this session, not even a backup, so no backup can replace it.
    if (isNewerSave(get().game)) return warnNewer()
    // The write is asynchronous, and the page can go away before it lands:
    // closed, reloaded, or cut short before its pagehide handler gets to run.
    // So the farm is first backed up synchronously (see `writeSave`).
    if (get().loaded) writeBackup(get().game)
    dirty = true
    writing = writing.then(flush)
  }

  /**
   * Picks up changes saved by another tab, once our own writes have landed.
   * The newer of the save and the backup wins, so an older backup never
   * replaces a newer save; a newer one (from a tab that closed before its last
   * write landed) is adopted and written to IndexedDB, and that write clears
   * it once it lands, as on start, so it's adopted only once.
   */
  const reload = () => {
    writing = writing.then(async () => {
      if (dirty) return
      const { raw, fromBackup } = await readSave()
      const state = migrate(raw, clockNow())
      if (!state) return
      set({ game: state })
      if (fromBackup) persist()
    })
    return writing
  }

  /**
   * Lets the farm catch up with the time that passed, on load and on coming
   * back to the tab. After a real absence, what happened is gathered into the
   * recap card instead of a pile of toasts.
   */
  const catchUp = () => {
    if (!get().loaded) return
    const now = clockNow()
    const before = get().game
    const since = before.seenAt
    const result = advance(before, now)
    // The recap card is part of the journal (A1); without it, catching up shows the usual toasts.
    const lines = isOn('journal') && now - since >= RECAP_AFTER_MS && result.state.settings.welcomed ? recapEntries(result.state, since) : []
    const seen = markSeen(result.state, now)
    set({ game: seen.state, now })
    if (result.ok || seen.ok) persist()
    if (lines.length) {
      const earlier = get().recap ?? []
      set({ recap: [...lines, ...earlier.filter((e) => !lines.some((l) => l.id === e.id))] })
    } else {
      pushNotices(result.notices)
    }
  }

  /** Catch-ups waiting for the farm to be read back first (see `rejoin`). */
  let rejoining = 0

  /**
   * Reads the farm back, then catches up with the time away: on coming back
   * to the tab, or after the computer slept. Until that's done the tick leaves
   * catching up to it, or the one-second timer (which a browser fires as soon
   * as a hidden tab is shown again) would tell the time away in toasts and mark
   * the farm seen before the recap could gather it.
   */
  const rejoin = () => {
    rejoining++
    void reload()
      .then(catchUp)
      .finally(() => rejoining--)
  }

  const start = async () => {
    const now = clockNow()
    const { raw, available, fromBackup } = await readSave()
    // What upgrading an older version's farm has to say, told on this load only.
    const upgrade: Notice[] = []
    const game = migrate(raw, now, upgrade) ?? createInitialState(now)
    guardStored(raw, game)
    set({ game, loaded: true, canSave: available, now })
    // A new farm, a newer one from the backup, or an older version's farm just
    // upgraded goes into IndexedDB straight away, so what the upgrade told is
    // kept and never told again; once that write lands, the backup is cleared
    // (see `writeSave`).
    const upgraded = isObj(raw) && savedVersion(raw) < SAVE_VERSION
    if (available && (!raw || fromBackup || upgraded)) persist()
    pushNotices(upgrade)

    // Keep several open tabs in step: whoever saves last, the others reload.
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('gitaway')
      channel.onmessage = (e) => {
        if (e.data?.type !== 'saved' || e.data.from === tabId) return
        noteStamp(e.data.savedAt)
        void reload()
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') rejoin()
      else get().run(markSeen)
    })
    // The last moment the player was here.
    window.addEventListener('pagehide', () => get().run(markSeen))
    // A development build's clock skipped ahead, here or in another tab: catch
    // up straight away. When it goes back (the farm was erased) there's nothing
    // to catch up, and the farm on its way out is left alone.
    subscribeClock(() => {
      if (clockNow() > get().now) get().tick()
    })
    catchUp()
    get().tick()
  }

  return {
    game: createInitialState(clockNow()),
    loaded: false,
    canSave: true,
    now: clockNow(),
    toasts: [],
    panel: null,
    selectedPlot: null,
    recap: null,
    preview: null,

    init: () => {
      starting ??= start()
      return starting
    },

    run: (action) => {
      const now = clockNow()
      const result = action(get().game, now)
      if (result.ok) {
        set({ game: result.state, now })
        persist()
      }
      pushNotices(result.notices)
      return result.ok
    },

    notify: (notice) => pushNotices([notice]),

    setSettings: (patch) => {
      get().run((s) => updateSettings(s, patch))
    },

    openPanel: (panel) => set({ panel }),
    togglePanel: (panel) => set((s) => ({ panel: s.panel === panel ? null : panel })),
    selectPlot: (id) => set({ selectedPlot: id }),
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    dismissRecap: () => set({ recap: null }),
    setPreview: (preview) => set({ preview }),

    tick: () => {
      const now = clockNow()
      const previous = get().now
      set({ now })
      // While the tab is hidden nothing is announced; coming back catches up in
      // one go, and the tick leaves it to that until it's done.
      if (!get().loaded || hidden() || rejoining) return
      // A long gap since the last tick, with the tab never hidden, means the
      // computer slept: catch up as on coming back to the tab, recap and all.
      if (now - previous >= RECAP_AFTER_MS) {
        rejoin()
        return
      }
      const { run } = get()
      if (get().game.session) run(checkSessionMilestones)
      run(advance)
      if (now - get().game.seenAt >= SEEN_EVERY_MS) run(markSeen)
    },

    reset: async () => {
      dirty = false
      await writing
      await eraseSave()
      // A development build's skipped time goes with the farm (see clock.ts).
      resetClock()
      const fresh = createInitialState(clockNow())
      set({ game: fresh, now: clockNow(), toasts: [], panel: null, selectedPlot: null, recap: null, preview: null })
      const savedAt = await writeSave(fresh)
      channel?.postMessage({ type: 'saved', from: tabId, savedAt })
    },
  }
})
