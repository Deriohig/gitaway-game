import { CROP_IDS, ITEM_IDS, PLOTS, START, type CropId, type GiftAnimalId, type ItemId } from './config'
import type { LandPiece } from './content/barnaby'
import type { DetailId } from './content/biomes'
import type { BundleId } from './content/bundles'
import type { FishId, FishSpot } from './content/fish'
import { PRODUCER_IDS, type GoodId, type ProducerId, type RecipeId, type StationId } from './content/goods'
import type { LetterId } from './content/letters'
import type { SiofraGiftId } from './content/siofra'
import type { StampId } from './content/stamps'
import type { VisitorId } from './content/visitors'
import { YIELD_IDS, type YieldId } from './content/yields'
import type { VariantSlot } from './systems/studio'

export const SAVE_VERSION = 3

export interface Plot {
  id: number
  crop: CropId | null
  plantedAt: number | null
  readyAt: number | null
  /** Whether the "ready to harvest" note was already shown for this crop. */
  notified: boolean
  /** The crop this plot last harvested, kept while it lies empty and while the next grows; null if it never grew one. */
  lastCrop: CropId | null
}

export interface ActiveSession {
  startedAt: number
  /** Milestone minutes already announced during this session. */
  milestones: number[]
}

export interface RewardEntry {
  at: number
  label: string
  coins: number
  xp: number
  wood: number
}

export interface DailyLedger {
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  sessionMinutes: number
  /** Normalised task titles rewarded today, used to reject duplicates. */
  tasks: string[]
  /** Commits credited today. */
  commits: number
  /** Crops harvested today. */
  harvests: number
}

/** A finished day, kept for the postcard. */
export interface DayRecord {
  date: string
  minutes: number
  tasks: number
  commits: number
  harvests: number
}

/** A local Git repository the player chose to count commits in. */
export interface WatchedRepo {
  path: string
  /** Folder name, for display. */
  name: string
  /** Commit time (Unix seconds) of the newest commit already counted. */
  cursor: number
  addedAt: number
  /** Commits counted from this repository, ever. */
  commits: number
  /** The orchard tree's name, shown instead of the folder name unless the player opts in. */
  alias: string
  /** Creator time (Unix seconds) of the newest tag already seen. */
  tagCursor: number
  /**
   * Author times (Unix seconds), all past the cursor, of commits counted ahead
   * of their dates. The desktop side is handed them back so they never count
   * twice. Left out when there are none.
   */
  ahead?: number[]
}

export type MotionPreference = 'auto' | 'full' | 'calm' | 'still'
export type TimeOfDayPreference = 'clock' | 'morning' | 'afternoon' | 'evening' | 'night'
export type Hemisphere = 'north' | 'south' | 'off'
export type WindowLayout = 'normal' | 'strip' | 'corner'

export interface Settings {
  motion: MotionPreference
  timeOfDay: TimeOfDayPreference
  ambientSound: boolean
  /** Lo-fi music while a work session runs. */
  sessionMusic: boolean
  sessionPanelCollapsed: boolean
  welcomed: boolean
  tutorialDone: boolean
  /** Fewer frames and actors, no toasts. The journal still records everything. */
  quiet: boolean
  /** Drop to calm motion while running on battery. */
  batterySaver: boolean
  /** Which way the seasons turn; off is an eternal late summer. */
  hemisphere: Hemisphere
  weather: boolean
  /** Show real repository names instead of their orchard aliases. */
  showRepoNames: boolean
  /** Desktop window shape. */
  windowLayout: WindowLayout
  keepOnTop: boolean
  /** Here just for the farm: the farm pays FARM_ONLY.pay times as much, and work pays nothing. */
  farmOnly: boolean
}

export interface Stats {
  sessions: number
  sessionMinutes: number
  tasks: number
  planted: number
  harvested: Partial<Record<CropId, number>>
  coinsEarned: number
  commits: number
  visitors: number
  fish: number
  goodsMade: number
  crafted: number
  bundles: number
  photos: number
}

export const JOURNAL_KINDS = [
  'work',
  'garden',
  'build',
  'level',
  'visitor',
  'letter',
  'restoration',
  'stamp',
  'story',
  'git',
  'craft',
  'fish',
  'cottage',
  'character',
] as const

export type JournalKind = (typeof JOURNAL_KINDS)[number]

export interface JournalEntry {
  id: number
  at: number
  kind: JournalKind
  title: string
  detail?: string
  /** The player's own one-line note, at most 140 characters. */
  note?: string
}

export interface PresentVisitor {
  id: VisitorId
  arrivedAt: number
}

export interface Job {
  id: number
  station: StationId
  recipe: RecipeId
  startedAt: number
  readyAt: number
}

export interface Placement {
  x: number
  z: number
  rot: number
}

export interface CaughtFish {
  count: number
  firstAt: number
  /** Biggest so far, in cm. */
  best: number
}

export interface BigCatch {
  id: FishId
  spot: FishSpot
  size: number
  at: number
}

export interface Letter {
  id: LetterId
  at: number
  read: boolean
}

/** A big shiver follows a work session with credited minutes; a small one, a task or a counted commit. */
export type ShiverSize = 'big' | 'small'

/** Barnaby's arc: not on the island yet, camping by the garden, then living in the highland's ruin. */
export type BarnabyStage = 'away' | 'camp' | 'ruin'

export interface GameState {
  /** SAVE_VERSION, or a newer Gitaway's version when the farm came from its save (never written over). */
  version: number
  createdAt: number
  farmName: string
  coins: number
  wood: number
  xp: number
  /** Highest level already celebrated, so level-ups are announced once. */
  levelSeen: number
  seeds: Record<CropId, number>
  plots: Plot[]
  /** The fraction of a point of XP harvests have carried over, in [0, 1) (see `cropXp` in engine.ts). */
  harvestXpCarry: number
  owned: Record<ItemId, number>
  /**
   * What the farm made on its own up to `at`, in fractional units, waiting to
   * be collected, and the fraction of a point of XP collecting has carried
   * over, in [0, 1) (see systems/yields.ts).
   */
  yields: { at: number; stored: Record<YieldId, number>; xpCarry: number }
  gifts: GiftAnimalId[]
  session: ActiveSession | null
  daily: DailyLedger
  repos: WatchedRepo[]
  recent: RewardEntry[]
  stats: Stats
  settings: Settings

  /** Newest first. Busy kinds keep their newest 400 lines (and any with a note); everything else is kept. */
  journal: JournalEntry[]
  journalSeq: number
  /** The last time the player was here, looking. */
  seenAt: number
  /** "Note for next time", or '' (at most 140 characters). */
  nextNote: string
  /** Story lines already told, by id (see `STORY_IDS` in systems/journal.ts). */
  told: string[]
  /** Finished days, newest first, at most 14. */
  history: DayRecord[]
  /** Names the player gave the cat, the dog and the first chicken ('' for none yet). */
  names: { cat: string; dog: string; flagship: string }

  visitors: {
    /** When visitors started arriving (level 4 first reached), or null before then. */
    since: number | null
    /** The next 36-hour period that hasn't been looked at yet. */
    nextPeriod: number
    present: PresentVisitor[]
    /** Times each visitor has been noticed. */
    seen: Partial<Record<VisitorId, number>>
  }
  keepsakes: Partial<Record<VisitorId, number>>

  barn: { produce: Partial<Record<CropId, number>>; goods: Partial<Record<GoodId, number>> }
  /** Keep up to this many of a crop in the barn instead of selling it at harvest. */
  keep: Partial<Record<CropId, number>>
  jobs: Job[]
  jobSeq: number
  /** Fractional production since `at`, per producer. */
  producers: { at: number | null; progress: Record<ProducerId, number> }
  /** Goods made, ever. */
  made: Partial<Record<GoodId, number>>
  helpers: { replant: boolean; harvest: boolean }

  restoration: {
    /** Amounts brought so far, one per need of the bundle. */
    progress: Partial<Record<BundleId, number[]>>
    /** When each bundle was finished. */
    done: Partial<Record<BundleId, number>>
    /** When each hidden detail on the biome isles was noticed (absent until one is). */
    found?: Partial<Record<DetailId, number>>
  }

  fishing: {
    /** The next catch slot to look at, per spot. */
    slots: Partial<Record<FishSpot, number>>
    caught: Partial<Record<FishId, CaughtFish>>
    /** A big catch waiting at the jetty to be noticed. */
    big: BigCatch | null
  }

  /** Letters that have arrived, and the last post time considered (see systems/mail.ts). */
  mail: { letters: Letter[]; checkedAt: number | null }
  /** When each stamp was earned. */
  stamps: Partial<Record<StampId, number>>
  /** Sky lanterns are up until this time, after a new tag. */
  lanternNightUntil: number | null
  /** Moved things, keyed `${itemId}#${index}`. */
  placements: Record<string, Placement>
  /** Palette swatch per thing, keyed like placements. */
  tints: Record<string, number>
  variants: Partial<Record<VariantSlot, number>>
  /** Highest retirement cottage stage already announced. */
  cottageSeen: number

  /** The island's characters (see systems/characters.ts). Kept while their switch is off. */
  characters: {
    /** The latest shiver, from work done while the game was open, or null before the first. */
    shiver: { at: number; size: ShiverSize } | null
    barnaby: {
      stage: BarnabyStage
      /** When he's due to be found, or null before that's known. */
      dueAt: number | null
      foundAt: number | null
      /** When he moved into the ruin. */
      movedAt: number | null
      /** Pieces of land already seen to, so each piece's line is written at most once. */
      sawLand: LandPiece[]
      /** Shiver lines already used, by index into `BARNABY.shiver`. */
      remarksUsed: number[]
      /** The local date (YYYY-MM-DD) of his last shiver line. */
      lastRemarkDay: string | null
      /** Whether he has introduced himself (the first tap's line). */
      met: boolean
      /** Tap lines heard, by index into his camp lines followed by his ruin lines. */
      heard: number[]
      /** The tap line he's saying, and when he said it. */
      said: { index: number; at: number } | null
    }
    /** Síofra, the púca (see content/siofra.ts). */
    siofra: {
      /** When she's to be met, set once everything she waits for holds (null until then), as Barnaby's `dueAt` is. */
      dueAt: number | null
      /** When she was met properly, or null while she hasn't been. */
      metAt: number | null
      /** When her last moment was posted; the gap to the next counts from it. */
      momentAt: number | null
      /** The last moment post time considered, so each post time is looked at once (the cursor idea of `mail.checkedAt`). */
      checkedAt: number | null
      /** The id of her last moment line, so the same line never plays twice running. */
      lastMoment: string | null
      /** The gifts she has given, each once, in order. Apart from `gifts`, which holds the cat and the dog, and from `keepsakes.hare`. */
      given: SiofraGiftId[]
      /** Whether she has said a tap line. */
      met: boolean
      /** Tap lines heard, by index into her twelve lines followed by her three naps. */
      heard: number[]
      /** The tap line she's saying, and when she said it. */
      said: { index: number; at: number } | null
    }
  }
}

export const PET_NAME_MAX = 24

export function localDateKey(now: number): string {
  const d = new Date(now)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function emptyPlot(id: number, lastCrop: CropId | null = null): Plot {
  return { id, crop: null, plantedAt: null, readyAt: null, notified: false, lastCrop }
}

/** The first line in every new farm's journal. */
export const OPENING_LINE = 'A farmhouse, a pond and four beds of soil.'

export function createInitialState(now: number): GameState {
  const seeds = Object.fromEntries(CROP_IDS.map((id) => [id, START.seeds[id] ?? 0])) as Record<CropId, number>
  const owned = Object.fromEntries(ITEM_IDS.map((id) => [id, START.animals[id] ?? 0])) as Record<ItemId, number>
  return {
    version: SAVE_VERSION,
    createdAt: now,
    farmName: START.farmName,
    coins: START.coins,
    wood: START.wood,
    xp: 0,
    levelSeen: 1,
    seeds,
    plots: Array.from({ length: PLOTS.starting }, (_, i) => emptyPlot(i)),
    harvestXpCarry: 0,
    owned,
    yields: { at: now, stored: Object.fromEntries(YIELD_IDS.map((id) => [id, 0])) as Record<YieldId, number>, xpCarry: 0 },
    gifts: [],
    session: null,
    daily: { date: localDateKey(now), sessionMinutes: 0, tasks: [], commits: 0, harvests: 0 },
    repos: [],
    recent: [],
    stats: {
      sessions: 0,
      sessionMinutes: 0,
      tasks: 0,
      planted: 0,
      harvested: {},
      coinsEarned: 0,
      commits: 0,
      visitors: 0,
      fish: 0,
      goodsMade: 0,
      crafted: 0,
      bundles: 0,
      photos: 0,
    },
    settings: {
      motion: 'auto',
      timeOfDay: 'clock',
      ambientSound: false,
      sessionMusic: true,
      sessionPanelCollapsed: false,
      welcomed: false,
      tutorialDone: false,
      quiet: false,
      batterySaver: true,
      hemisphere: 'north',
      weather: true,
      showRepoNames: false,
      windowLayout: 'normal',
      keepOnTop: false,
      farmOnly: false,
    },

    journal: [{ id: 1, at: now, kind: 'story', title: OPENING_LINE, detail: "It isn't much yet. It's yours." }],
    journalSeq: 1,
    seenAt: now,
    nextNote: '',
    told: [],
    history: [],
    names: { cat: '', dog: '', flagship: '' },
    visitors: { since: null, nextPeriod: 0, present: [], seen: {} },
    keepsakes: {},
    barn: { produce: {}, goods: {} },
    keep: {},
    jobs: [],
    jobSeq: 0,
    producers: { at: null, progress: Object.fromEntries(PRODUCER_IDS.map((id) => [id, 0])) as Record<ProducerId, number> },
    made: {},
    helpers: { replant: false, harvest: false },
    restoration: { progress: {}, done: {} },
    fishing: { slots: {}, caught: {}, big: null },
    mail: { letters: [], checkedAt: null },
    stamps: {},
    lanternNightUntil: null,
    placements: {},
    tints: {},
    variants: {},
    cottageSeen: 0,
    characters: {
      shiver: null,
      barnaby: { stage: 'away', dueAt: null, foundAt: null, movedAt: null, sawLand: [], remarksUsed: [], lastRemarkDay: null, met: false, heard: [], said: null },
      siofra: { dueAt: null, metAt: null, momentAt: null, checkedAt: null, lastMoment: null, given: [], met: false, heard: [], said: null },
    },
  }
}
