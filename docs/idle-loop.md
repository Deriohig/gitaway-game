# The idle loop: design spec

This is the build spec for deepening Gitaway's loop between work sessions. It
covers all eighteen moves from the research report (`A1`–`A7`, `B1`–`B7`,
`C1`–`C4`) plus an economy pass. Numbers here are the source of truth, except
where marked as replaced by the idle economy (see §3); code reads them from
config and content tables, never hardcodes them in UI.

## 0. Why, and the rules that keep it kind

Today a player who works about four hours a day owns the whole catalogue
(about 3,700 coins and 170 wood) and reaches level 12 in roughly two weeks.
Between sessions there is little to watch, decide, make, collect or read.
This spec adds those five verbs and stretches the runway to several months.

> **Retuned by the idle economy** (see §3): the numbers above are from before
> it. Now a worker with two hours of sessions and four tasks a weekday owns
> every piece of land in about two weeks, and a player who doesn't work gets
> there in six or seven. The longer runway is left to the features still
> switched off, each tuned with `npm run balance` when it turns on.

Every feature must pass these guardrails. A change that breaks one is a bug.

| ID | Guardrail |
|---|---|
| G1 | **Month-away test.** Nothing decays, expires, resets or is lost while the player is away. The game only adds. Offline production may be *capped*, never taken away. |
| G2 | **Luck pays in delight, never currency.** Random things (visitors, fish, sizes, weather) never pay coins, wood or XP, and never scale with effort (commits, minutes). |
| G3 | **Nothing missable.** Every visitor, fish, letter, stamp and item stays obtainable by a known route. Seasons change looks only. No date-locked events, no percent-complete meters. |
| G4 | **No appointments, absence counters or push.** No "you were away N days", no claim buttons that expire, no notifications, no badges for visitors. |
| G5 | **Rewards inform, caps rest.** No "x / y" quota counters in the main UI; a reached cap reads as "the field is full for today". Every rule is written down in Settings → What counts. |
| G6 | **No ranking or social pressure.** Nothing is compared with anyone. Photos stay local. |
| G7 | **Local and private.** Commit data stays on the device; repository names are aliased on screen by default. |
| G8 | **Light footprint.** New ambient life respects the motion level, quiet mode and the frame cap. Still mode draws nothing that moves. |
| G9 | **Choices, not chores.** Helpers automate clicks, never decisions; manual always works. |

## 1. Architecture

### Systems
Each system lives in `src/game/systems/<name>.ts` and exports:

- `sanitize<Name>(raw: unknown, base, now)`: repairs its slice of a save (called by `migrate`).
- `advance<Name>(s: GameState, now: number, out: Notice[])`: mutates an already-cloned state for time-driven work.
- its pure actions, `(state, ..., now) => Result`, following the engine's conventions (clone, refuse, notices).
- selectors used by UI and world code.

`src/game/advance.ts` exports `advance(state, now): Result`, which clones once
and runs, in order: `rollDay`, crop readiness (the old `collectReadyCrops`),
auto-harvest helper, producers, workshop jobs, visitors, fishing, git events
(lantern night expiry), mail triggers, cottage, stamps. It returns `ok: false`
when nothing changed so the store doesn't save. The store calls `advance`
once a second (the old `collectReadyCrops` call) and once on load.

Systems: `journal`, `visitors`, `workshop` (barn, keep targets, producers,
jobs, crafting, helpers), `restoration`, `fishing`, `mail` (letters,
postcard), `stamps`, `cottage`, `studio` (placements, tints,
variants), `gitEvents`.

Content tables live in `src/game/content/<name>.ts` (visitors, goods,
bundles, fish, letters, stamps, biomes). `config.ts` keeps the
core economy.

Deterministic randomness: `src/game/hash.ts` exports
`hash01(...parts: (string | number)[]): number` (stable, in `[0, 1)`), seeded
with `state.createdAt`. There is no RNG state in saves.

### Journal and notices
`Notice` gains `journal?: JournalKind | false` and `quiet?: boolean`.
`note(s, out, notice)` in `systems/journal.ts` appends the journal entry and,
unless `quiet`, pushes the toast. Default journal kind by notice kind:
reward/session → `work`, crop → `garden`, level/unlock → `level`,
animal → `build`, info → not journaled unless `journal` is set,
warn → never. Stamps and story lines are `quiet`.

### Mount points (so features don't edit the same files)
The foundation creates stub files that each feature fills in:

- World: `src/world/features/*.tsx`, mounted by `src/world/features/index.tsx` inside the scene.
- Panels: `journal` (tabs Journal, Almanac, Stamps, Letters) and `island` (tabs Restorations, Studio), with each tab in its own file under `src/ui/panels/journal/` and `src/ui/panels/island/`. Almanac pages each in their own file under `src/ui/panels/journal/almanac/`.
- Settings: `SettingsPanel` is split into section files under `src/ui/panels/settings/` (General, Attention, World, Helpers, Commits, What counts, Data).
- HUD overlays mounted in `App.tsx`: `<Recap />`, `<StudioOverlay />`, `<PhotoMode />`.
- CSS: one file per feature under `src/styles/features/`, imported from `main.tsx`.
- `useSlot(key, defaultXZ, defaultRot)` in `src/world/slots.ts` returns the position, rotation and tint for a placeable object, reading `placements` and `tints`. Structures that can be moved use it.

### Toolbar
Seven tools, keys 1–7: Farm, Garden, Shop, Stores (the old Inventory panel id
`inventory`, now with Barn and Workbench tabs), Island, Journal, Progress.
Island shows a gentle "opens at level 6" state before then. Labels may hide
on narrow screens; every button keeps its accessible name and test id.

## 2. Save v2

> **Version 3 ships now** (the idle economy, economy spec §7), and
> `src/game/state.ts` is the source of truth. `SAVE_VERSION = 3`. On top of
> the shape below, each plot keeps `lastCrop: CropId | null` (the crop it last
> grew, for fresh soil), and `yields: { at: number; stored: Record<YieldId, number>; xpCarry: number }`
> holds what the farm made on its own, waiting for **Collect all**
> (`src/game/systems/yields.ts`), while `harvestXpCarry: number` is its
> sibling for harvests: the fraction of a point of crop XP carried until it
> makes a whole one (`cropXp` in `src/game/engine.ts`). `producers` stays in the save for the
> workshop, but nothing fills it now. An older farm keeps everything it owns
> and its level, its plots count as fresh soil, it is told once what changed,
> and seeds it can't plant yet at its level are bought back at version 2's
> price.

`SAVE_VERSION = 2`. `migrate` upgrades v1 saves field by field; every new
field has a safe default. New and changed types:

```ts
type JournalKind = 'work' | 'garden' | 'build' | 'level' | 'visitor' | 'letter' | 'restoration'
  | 'stamp' | 'story' | 'git' | 'craft' | 'fish' | 'cottage'
interface JournalEntry { id: number; at: number; kind: JournalKind; title: string; detail?: string; note?: string }
interface DayRecord { date: string; minutes: number; tasks: number; commits: number; harvests: number }
interface PresentVisitor { id: VisitorId; arrivedAt: number }
interface Job { id: number; station: StationId; recipe: RecipeId; startedAt: number; readyAt: number }
interface Placement { x: number; z: number; rot: number }

interface WatchedRepo { path; name; cursor; addedAt; commits: number; alias: string; tagCursor: number }
interface DailyLedger { date; sessionMinutes; tasks; commits; harvests: number }
interface Stats { ...; visitors: number; fish: number; goodsMade: number; crafted: number; bundles: number; photos: number }
interface Settings {
  ...; quiet: boolean; batterySaver: boolean; hemisphere: 'north' | 'south' | 'off'; weather: boolean
  showRepoNames: boolean; windowLayout: 'normal' | 'strip' | 'corner'; keepOnTop: boolean
}

interface GameState {
  ...existing
  journal: JournalEntry[]          // newest first; see retention
  journalSeq: number
  seenAt: number                   // last time the player was present
  nextNote: string                 // '' when none, ≤ 140 chars
  history: DayRecord[]             // last 14 days, newest first
  names: { cat: string; dog: string; flagship: string }
  visitors: { since: number | null; nextPeriod: number; present: PresentVisitor[]; seen: Partial<Record<VisitorId, number>> }
  keepsakes: Partial<Record<VisitorId, number>>
  barn: { produce: Partial<Record<CropId, number>>; goods: Partial<Record<GoodId, number>> }
  keep: Partial<Record<CropId, number>>
  jobs: Job[]
  jobSeq: number
  producers: { at: number | null; progress: Record<ProducerId, number> }
  made: Partial<Record<GoodId, number>>
  restoration: { progress: Partial<Record<BundleId, number[]>>; done: Partial<Record<BundleId, number>> }
  fishing: { slots: Partial<Record<FishSpot, number>>; caught: Partial<Record<FishId, { count: number; firstAt: number; best: number }>>; big: { id: FishId; spot: FishSpot; size: number; at: number } | null }
  mail: { letters: { id: LetterId; at: number; read: boolean }[]; checkedAt: number | null }
  stamps: Partial<Record<StampId, number>>
  helpers: { replant: boolean; harvest: boolean }
  lanternNightUntil: number | null
  placements: Record<string, Placement>   // key `${itemId}#${index}`
  tints: Record<string, number>
  variants: Partial<Record<VariantSlot, number>>
  cottageSeen: number
}
```

Journal retention: entries of kind `work`, `garden`, `build` and `craft` keep
the newest 400 (a line the player wrote a note on is never trimmed this
way); every other kind is kept forever. Hard cap 3,000 entries.

`history`: when `rollDay` starts a new day, the finished ledger is pushed as a
`DayRecord`; keep 14.

## 3. Economy pass

> **Partly replaced by the idle economy** (spec:
> [`superpowers/specs/2026-10-22-idle-economy-design.md`](superpowers/specs/2026-10-22-idle-economy-design.md)).
> The farm now makes things on its own, work pays about 2.5 times what the
> farm does, and land opens in any order. Levels, wood, land prices and the
> three new crops below were retuned for it. Where this section and
> `src/game/config.ts` disagree, config wins. Old rules are struck through, or
> noted beneath where a table changed in place. Things behind switched-off features (the workbench,
> barn, oil press, spinning wheel, boardwalk, lily lantern, standing stones,
> hot spring, gazebo, observatory and the workbench crafts) are still on the
> old scale until their feature turns on and gets its own pass with
> `npm run balance`.

### Levels (20)
~~`LEVEL_XP` keeps levels 1–12 and adds:
`5000, 6100, 7350, 8750, 10300, 12000, 13850, 15850` (levels 13–20).~~
Replaced (economy spec §6): `LEVEL_XP` is now `0, 40, 120, 260, 460, 720, 1050, 1500,
2000, 2800, 3600, 4450, 5400, 6450, 7600, 8900, 10350, 12000, 13850, 15850`.
Levels 8–17 were raised, and no level asks less XP than before. Every level
from 2 to 12 unlocks something; above that, levels give titles only, apart
from the not-yet-retuned late buildings below.
New titles 13–20: Drystone Waller, Wetland Warden, Lantern Keeper, Highland
Crofter, Almanac Author, Archipelago Steward, Sky Gardener, Part of the Furniture.

### Repeat pricing (A3)
For items with `max > 1`, except `plot`: the n-th extra unit (n = owned minus
starting count) costs `round(base × 1.12^n)` coins and `round(wood × 1.12^n)`
wood. The shop shows the next price. Prices are listed in Settings → What counts.

### New and changed maxima
chicken 8, duck 5, sheep 6, flowerbed 8, fruitTree 8, lantern 6, beehive 3.
Layout gains enough slots for each.

### Wood and the first isle
> **Replaced by the idle economy** (spec:
> [`superpowers/specs/2026-10-22-idle-economy-design.md`](superpowers/specs/2026-10-22-idle-economy-design.md),
> §§3, 4 and 6). Wood no longer comes only from working, and land has no level
> gate.

~~Wood comes from work sessions (one piece per 20 credited minutes,
`SESSION.minutesPerWood`, plus one per session with the grove) and from tasks:
each rewarded task pays 1 wood (`TASKS.wood`) with its coins and XP. A
repeated task or one over the daily limit pays nothing, wood included. The
meadow isle costs 140 coins and **8 wood** (it was 12), so its wood no longer
waits on two hours of sessions: a new farm starts with 6, and two logged tasks
make up the rest. It still opens at level 3.~~

Wood now comes from three places:

- **Work sessions:** one piece per 10 credited minutes
  (`SESSION.minutesPerWood`). The grove no longer adds wood per session.
- **Tasks:** each rewarded task pays 2 wood (`TASKS.wood`) with its coins and
  XP. A repeated task or one over the daily limit still pays nothing, wood
  included.
- **The woodshed** (50 coins, no level): a log every 6 hours from the island's
  own trees (`YIELDS.wood`), and twice that once the forest grove is owned.
  It fills up to 3 days' worth (`YIELD_CAP_HOURS`) and then stops filling,
  never losing what is there. **Collect all** brings the logs in.

Land is no longer level-gated or bought in a set order. All seven pieces (the
meadow, forest grove, lighthouse islet, wetland, highland, woodland glade and
orchard isle; economy spec §4) are on offer from level 1, at one price for
every piece not yet owned: `LAND` gives coins
`100 × 1.75ⁿ` and wood `8 × 1.57ⁿ`, where n is how many pieces are already
owned. The first piece costs 100 coins and 8 wood; the seventh, 2,872 coins and
120 wood. A new farm starts with 300 coins and 12 wood (`START`), enough for
the woodshed, the first piece of land and a chicken. The wetland and highland
will also wait on restored bundles (`requiresBundles`) once restorations are
switched on.

### New crops
| id | name | seed | grow min | coins | xp | level | requires |
|---|---|---|---|---|---|---|---|
| wheat | Wheat | 5 | 20 | 6 | 1 | 2 | — |
| cranberry | Cranberry | 14 | 240 | 16 | 1 | 1 | wetland |
| lavender | Lavender | 12 | 600 | 16 | 1 | 1 | highland |

These are the idle economy's values (economy spec §5), replacing the old ones (wheat
8 seed, 16 coins, 3 XP; cranberry 180 minutes, level 9; lavender 200 minutes,
level 12). The two isle crops are open once their isle is owned, so their level
is 1. A crop that differs from the one its plot last grew sells for 25% more
(`BONUS.freshSoil`).

`CropDef` gains `requires?: ItemId`. Blurbs: wheat "Mills into flour, or
sways nicely if you'd rather."; cranberry "Tart, red and very at home in
the wet."; lavender "Smells like a long weekend."

### New items
`ItemDef` gains `source?: 'shop' | 'workbench'` (default shop),
`craftMinutes?: number` (workbench items), `requiresBundles?: number` and
`island?: IslandId`.

Shop items:

| id | name | cat | coins | wood | max | level | requires | xp | effect |
|---|---|---|---|---|---|---|---|---|---|
| workbench | Workbench | building | 60 | 6 | 1 | 3 | — | 12 | Craft decorations from wood. |
| barn | Barn | building | 90 | 10 | 1 | 3 | — | 15 | Keeps harvests and goods. Nothing in here ever spoils. Opens the kitchen. |
| press | Oil press | building | 160 | 12 | 1 | 5 | barn | 20 | Presses sunflowers into oil. |
| loom | Spinning wheel | building | 200 | 10 | 1 | 6 | sheep | 24 | Spins wool into yarn. |
| wetland | Wetland isle | land | `LAND` | `LAND` | 1 | 1 | requiresBundles 4 | 80 | A reedy island of still water and dragonflies. |
| highland | Highland isle | land | `LAND` | `LAND` | 1 | 1 | requiresBundles 9 | 80 | A windy island of heather and old stones. |
| boardwalk | Boardwalk | decor | 45 | 6 | 3 | 9 | wetland | 6 | — |
| lilyLantern | Lily lantern | decor | 30 | 1 | 4 | 9 | wetland | 5 | — |
| goat | Goat | animal | 150 | 0 | 4 | 1 | highland | 9 | Gives a pail of milk every 12 hours (built from `YIELDS.milk`). |
| stoneCircle | Standing stones | decor | 250 | 0 | 1 | 12 | highland | 20 | — |
| gazebo | Gazebo | building | 900 | 24 | 1 | 13 | — | 60 | — |
| hotSpring | Hot spring | building | 1100 | 20 | 1 | 15 | highland | 70 | — |
| observatory | Observatory | building | 1600 | 40 | 1 | 16 | islet | 90 | — |

The wetland, highland and goat rows show the idle economy's values (economy spec §4):
the isles are priced by `LAND` and open at level 1 (they were 1,200 coins and
30 wood at level 9, and 2,000 coins and 45 wood at level 12, with 110 XP for
the highland), and the goat costs 150 coins and needs only the highland (it was
80 coins at level 12). The other rows still match `config.ts`, but their prices
are on the old scale (see the note at the top of this section).

Workbench crafts (`source: 'workbench'`, wood only, take real time, one at a time):

| id | name | wood | minutes | max | level | requires | xp |
|---|---|---|---|---|---|---|---|
| birdhouse | Birdhouse | 3 | 20 | 3 | 3 | — | 4 |
| planter | Planter box | 4 | 30 | 4 | 3 | — | 4 |
| signpost | Signpost | 2 | 15 | 1 | 3 | — | 3 |
| windChime | Wind chime | 2 | 15 | 2 | 4 | — | 3 |
| picnicTable | Picnic table | 6 | 45 | 1 | 5 | — | 8 |
| hammock | Hammock | 5 | 40 | 1 | 6 | — | 7 |
| arbour | Rose arbour | 8 | 60 | 1 | 7 | — | 10 |
| rowboat | Rowboat | 10 | 90 | 1 | 8 | Fishing Bench restored | 12 |
| dovecote | Dovecote | 9 | 60 | 1 | 9 | — | 12 |
| treehouse | Treehouse | 16 | 120 | 1 | 10 | grove | 20 |

Write a one-line blurb in the game's voice for each new item.

## 4. Unlock ladder

> Land is no longer level-gated (economy spec §4), so the wetland and
> highland rows below are struck through. The rest of the ladder is the
> idle-loop features' own; the full list of crops, animals, buildings and decor
> that every level from 2 to 12 unlocks is in `config.ts` (economy spec §6).

| Level | What opens |
|---|---|
| 1 | Garden, shop, sessions, tasks, journal |
| 2 | Almanac (arrives with the cat), wheat |
| 3 | Workbench, barn and kitchen |
| 4 | Visitors start arriving |
| 5 | Oil press (the animal residents were cut from the story) |
| 6 | Restoration board and island studio; spinning wheel |
| ~~9~~ | ~~Wetland isle (with 4 bundles restored)~~ |
| 9 | Retirement cottage, stage 1 (by XP: its 2,550 XP was level 10 on the old curve, and is level 9 on the idle economy's) |
| ~~12~~ | ~~Highland isle (with 9 bundles restored)~~ |

Each system that opens writes one plain `story` line to the journal (A Dark
Room style), e.g. "There's a workbench under the oak now. It smells of
sawdust." Firsts also write story lines: first session, first task, first
harvest, first commit counted, first visitor, first letter, first bundle.

## 5. Features

### A1. Welcome-back recap and journal
- **Journal tab**: entries grouped by local day, filter chips by kind, newest first, paged (50 at a time). Any entry can carry a one-line player note (≤ 140 chars), editable inline.
- **Note for next time**: when ending a session, an optional field "Note for next time". It shows at the top of the recap and on the idle session card ("Last time you noted: …") with a clear button.
- **Recap**: on load, and on returning to a visible tab, if `now − seenAt ≥ 10 min`, run `advance` first, then gather journal entries with `at > seenAt` of kinds garden, craft, visitor, letter, fish, git, cottage, restoration. If any, show one dismissible card ("While you were out…" is banned; use "On the island" plus the farm name), up to 6 lines, then "and N more in the journal". Never mention how long the player was away. Toasts from that catch-up are not shown. Buttons: "Open journal", "Lovely".
- `seenAt` updates while the page is visible, at most once a minute, and on `pagehide`.
- **Postcard**: (owned by mail) see B4.

### A2. Almanac
Tabs inside Journal → Almanac: Crops, Animals, Buildings and decor, Goods,
Visitors, Fish. Each entry is a card; undiscovered entries show the art as a
silhouette (CSS `filter: brightness(0) opacity(.35)`) and a hint of how to
find it ("Visits when fruit trees are around"). No counts anywhere (the lore's
rule, decided 2026-10-22, `docs/lore/BIBLE.md`): no percent meter, no "12
found", no "seen 3 times", no "×2" on a keepsake. A card is a silhouette or it
is filled in, and what it says about a thing it has met is numberless ("Seen
before"). The save still keeps the tallies (`visitors.seen`, `keepsakes`,
`stats`); only their display is gone. Discovery: crop harvested once; animal
owned or gifted; item owned once; good made once; visitor seen; fish caught.

**Preview before buy**: every shop card has a "Preview" toggle that draws a
translucent ghost of the item at the slot it would take. Store field
`preview: ItemId | null` (UI only, not saved).

### A3. Milestones change the look
Repeat pricing as in §3. Visual tiers (procedural, swappable for assets):
chickens ≥ 3 → small coop, ≥ 6 → coop with a run; flowerbeds ≥ 4 → a trellis
arch on the path, ≥ 8 → roses on it; fruit trees ≥ 3 → ladder and crates,
≥ 6 → picnic blanket and a swing; lanterns ≥ 4 → string lights between them;
beehives 3 → apiary sign; ducks ≥ 3 → duck house on the pond; sheep ≥ 4 →
shelter on the meadow. No numeric bonuses.

### A4. Ambient life
Chimney smoke from the farmhouse; bees around hives and flower beds;
butterflies near flower beds by day; fireflies gather at lanterns at night;
windmill sails turn; leaf fall in autumn (with A5). Cat routine: naps on the
porch or bench, stretches, wanders. Dog routine: trots the path, sits by the
door, follows the sheep on the meadow. Clicking a creature makes it hop or
look up and shows its name; clicks pay nothing. Short synthesized sounds for
plant, harvest, buy and craft when ambient sound is on, never on idle events.
**Names**: Farm panel → "Your animals" lets the player name the cat, the dog
and one flagship animal (the first chicken). Names show in hover labels and
journal lines.

### A5. Seasons, weather and variants
- Season from the local month by `settings.hemisphere` (north default; off = eternal late summer). Spring: blossom on fruit trees and fresh greens. Summer: deep greens. Autumn: amber foliage and leaf fall. Winter: pale frosted grass, snow caps on roofs, light snowfall. Crops grow the same in every season.
- Weather per local day from `hash01(createdAt, date)`: clear 50%, cloudy 25%, drizzle 15% (snow in winter), mist 10%. Toggle in Settings → World. Particles only at full motion.
- **Variants**: fixed buildings offer looks the player picks for free, in Island → Studio: farmhouse roof (3), windmill sails (3), bench (2), scarecrow outfit (3), well roof (2), greenhouse frame (2), lighthouse stripes (3). `VariantSlot` ids: roof, sails, bench, scarecrow, wellRoof, greenhouse, lighthouse.

### A6. Attention dial
- Settings → Attention: **Quiet mode** (10 fps, fewer actors, no toasts; the journal still records everything), **Save power on battery** (default on; drops to calm when the Battery API reports discharging), and the existing motion level.
- Pause drawing when the page is hidden (no rAF loop while `document.hidden`).
- **Desktop window layouts** (Tauri only): Normal, Strip (wide and short, e.g. 720×220), Corner (360×360, bottom-right of the current monitor), and "Keep on top". Uses `@tauri-apps/api/window`; add the needed `core:window:*` permissions to `src-tauri/capabilities/default.json` and nothing more.
- **Compact HUD**: when the viewport is under 560×420 (any platform), the HUD collapses to one bar: coins, the session timer with start/stop, and buttons for Garden and Journal.

### A7. Fair counting
- Remove "x / y" counters from the main UI (session minutes, task count, commit count). Near or at a cap, say "The field is full for today" with a soft explanation; never "behind".
- Settings → **What counts**: plain rules for sessions, tasks, commits, crops, caps, prices and privacy, generated from config so it can't drift.
- Desktop commit counting ignores merge commits and empty commits (see C1).

### B1. Visitors
> **2026-10-23:** only the Brown hare (`hare`) remains; the other visitors below were cut (lore decision, `docs/lore/`). Restoration bundles no longer need visitors or keepsakes (B3).

Visitors are attracted by what you build and arrive on their own time.

- **Schedule**: once level 4 is first reached, set `visitors.since = now`. Time after that is split into 36-hour periods. Period `k` produces at most one arrival at `since + (k + hash01(createdAt, 'visit', k)) × 36 h`. On arrival, pick among visitors whose conditions hold: unseen ones first (choose by `hash01`), otherwise any eligible one. Skip if 3 are already present. When catching up after a long absence, process at most the last 6 periods.
- **Present** visitors stay until noticed (forever is fine). They stand near what attracted them. Clicking one, or "Say hello" in the Almanac's "Here now" list (keyboard path), notices it: `seen[id]++`, `keepsakes[id]++`, `stats.visitors++`, a journal line in the visitor's voice, no coins, XP or sound.
- Content (`content/visitors.ts`):

| id | name | island | needs | keepsake |
|---|---|---|---|---|
| butterfly | Red admiral | main | flowerbed ≥ 2 | Pressed petal |
| bumblebee | Bumblebee | main | beehive ≥ 1 | Scrap of comb |
| robin | Robin | main | fruitTree ≥ 2 | Robin's feather |
| heron | Grey heron | main | (the pond, always) | Heron's feather |
| toad | Common toad | main | well ≥ 1 | Smooth pebble |
| owl | Barn owl | main | windmill ≥ 1 | Soft owl feather |
| fox | Red fox | main | path ≥ 2 | Lost button |
| moth | Luna moth | main | lantern ≥ 2 | Silver thread |
| kingfisher | Kingfisher | main | duck ≥ 1 | Blue feather |
| hare | Brown hare | meadow | meadow | Clover sprig |
| skylark | Skylark | meadow | sheep ≥ 2 | Lark's song sheet |
| squirrel | Red squirrel | grove | grove | Hazelnut |
| deer | Roe deer | grove | grove, level 8 | Velvet antler tip |
| puffin | Puffin | islet | islet | Sand eel (wooden) |
| petrel | Storm petrel | islet | lighthouse | Sea-glass bead |
| frog | Tree frog | wetland | wetland | Lily pad |
| dragonfly | Emperor dragonfly | wetland | wetland, boardwalk ≥ 1 | Wing of light |
| otter | Otter | wetland | wetland, Reed Beds restored | Polished shell |
| eagle | Golden eagle | highland | highland | Eagle's plume |
| ptarmigan | Ptarmigan | highland | highland | White feather |
| marten | Pine marten | highland | highland, Crofter's Bothy restored | Pine cone |
| hedgehogWild | Wild hedgehog | main | planter ≥ 2 | Fallen leaf |

### B2. Workbench, barn and goods
- **Barn**: `barn.produce` (crops) and `barn.goods`. Nothing spoils. Sell one stack or "Sell everything not needed for a bundle"; raw crops sell at the harvest value (windmill bonus applies).
- **Keep targets** (the decision per harvest): in the barn, each crop has "Keep up to N" (0 by default = sell on harvest, exactly like today). While `produce[crop] < keep[crop]`, harvested crops go to the barn instead of being sold ("3 tomatoes to the barn"). XP is still earned on harvest.
- **Producers**: ~~need the barn: eggs 1 per chicken per 8 h; honey 1 per hive per 12 h; wool 1 per sheep per 12 h; milk 1 per goat per 12 h. Accrue fractionally from `producers.at`; offline accrual is capped at 48 h worth (a cap, not a loss). Whole units move to the barn automatically.~~ Replaced by the idle economy (economy spec §3): producers need no barn. They make eggs, wool, milk, honey, fruit, fish and wood at the rates in `content/yields.ts`, fill up to 72 h worth (`YIELD_CAP_HOURS`), and **Collect all** turns them straight into coins and wood, so none of them reach the barn. The barn, keep targets, stations and goods below stay behind the `workshop` switch, on the old scale; when it turns on, the recipes and bundles that use eggs, wool, milk or honey need a way for those goods to reach the barn again.
- **Stations**, one job each, no deadlines, output goes to the barn automatically when done:

| station | needs | recipes |
|---|---|---|
| mill | windmill | flour: 3 wheat → 1, 30 min |
| kitchen | barn | jam: 2 blueberry → 1, 45 min · sauce: 3 tomato → 1, 40 min · pickles: 3 carrot → 1, 30 min · pie: 1 pumpkin + 1 flour + 2 eggs → 1, 60 min · cranberrySauce: 2 cranberry → 1, 50 min · cheese: 2 milk → 1, 60 min |
| press | press | oil: 3 sunflower → 1, 40 min · soap: 2 lavender + 1 oil → 1, 60 min |
| loom | loom | yarn: 3 wool → 1, 45 min |
| workbench | workbench | the crafts in §3 (wood → an item, owned++ when done) |

- Goods (`content/goods.ts`) and sell values: eggs 10, honey 28, wool 24, milk 20, flour 58, jam 265, sauce 145, pickles 65, pie 190, cranberrySauce 230, oil 200, soap 490, yarn 86, cheese 48. Making a good grants a little XP (5% of its value, rounded, min 1). Chain income stays below session income because it is limited by crop supply.
- Journal lines for finished jobs (kind `craft`), toast "Your jam is ready" (no claim needed).

### B3. Island restorations
A notice board appears on the main island at level 6. Each bundle lists
needs; the player brings things over time (deposits are permanent and
partial deposits are fine). Needs of kind crop, good, wood, coins and
`anyKeepsakes` are consumed; `built` and `seen` are conditions. A finished
bundle grants XP, a journal line, and a permanent change in the world.

> **2026-10-23:** only the Brown hare remains among the visitors (lore decision, `docs/lore/`), so no bundle needs a visitor seen or keepsakes any more; the needs that asked for them were dropped or replaced (`src/game/content/bundles.ts` has the current lists).

> **2026-10-24:** the table below is synced to `bundles.ts`, so only crop, good, wood and coins needs are brought and only `built` needs are conditions. The rules and the board are on main behind the `restorations` switch, still off. Crops and goods reach the barn only through the workshop (B2), also off, so until it turns on only wood and coins can be brought.

| # | id | island | name | needs | xp | change |
|---|---|---|---|---|---|---|
| 1 | gardenGate | main | Garden Gate | 6 carrot, 6 radish, 4 wheat | 40 | a stone arch over the garden gate; the scarecrow learns to replant (B7) |
| 2 | pondJetty | main | Fishing Bench | 8 wood, 2 honey | 60 | a bench by the pond; fishing opens (B6) |
| 3 | kitchenShelf | main | Kitchen Shelf | 2 flour, 2 jam, 6 eggs | 80 | a porch with a herb rack and a little table |
| 4 | waterwheel | main | Waterwheel | 300 coins, 10 wood | 60 | a waterwheel on the stream |
| 5 | wildflowers | meadow | Wildflower Meadow | built beehive, 6 sunflower, built flowerbed ≥ 2 | 70 | the meadow bursts into wildflowers |
| 6 | shepherdsHut | meadow | Shepherd's Hut | 4 wool, 2 yarn, 12 wood | 90 | a shepherd's hut on wheels |
| 7 | stoneBridge | meadow | Drystone Wall | 600 coins, 20 wood | 80 | a drystone wall and gate where the meadow meets the farm |
| 8 | mushroomRing | grove | Mushroom Ring | built lantern, 4 pumpkin, 10 wood | 90 | a mushroom ring that glows at night |
| 9 | woodcutter | grove | Woodcutter's Hut | 25 wood, built birdhouse ≥ 1, 2 oil | 100 | a woodcutter's hut |
| 10 | treetopWalk | grove | Treetop Walk | 900 coins, 20 wood | 100 | rope walkways between the trees |
| 11 | keeperCottage | islet | Keeper's Cottage | built lighthouse, 4 oil | 110 | a cottage by the lighthouse, with a light in the window |
| 12 | skyHarbour | islet | Sky Harbour | 3 jam, 3 sauce, 3 pickles | 120 | a little harbour with a moored sky-boat; cloud fishing opens |
| 13 | signalFire | islet | Signal Fire | 1200 coins, 30 wood | 110 | a beacon on the islet's point |
| 14 | boardwalkLoop | wetland | Boardwalk Loop | 6 cranberry, 20 wood | 120 | a boardwalk ring; wetland fishing opens |
| 15 | reedBeds | wetland | Reed Beds | 4 cranberrySauce, built boardwalk | 130 | tall reed beds along the boardwalk |
| 16 | heronHide | wetland | Stilt Hide | 1600 coins, 30 wood | 120 | a bird hide on stilts |
| 17 | stoneCircle | highland | Stone Circle | built goat ≥ 2, 6 lavender, 6 milk | 140 | the old stones stand upright again |
| 18 | bothy | highland | Crofter's Bothy | 2 soap, 4 yarn, 2 pie, 2 cheese | 150 | a stone bothy with a peat fire; tarn fishing opens |
| 19 | summitCairn | highland | Summit Cairn | 2000 coins, 40 wood | 150 | a cairn on the highest point |

A bundle is listed once its island is owned (main from level 6, and no
other island before the board goes up then). Within an island, all bundles
are open at once.

### B4. Letters
The five animal residents were cut from the story (lore decision,
2026-10-22), with their homes, their letters and the level-5 hedgehog line.
Letters now carry the island's characters' field notes, starting with
Barnaby's (spec: `docs/superpowers/specs/2026-10-24-letters-design.md`).
Nothing is owed, nothing expires, no replies are expected, and nothing is
ever counted.

- **Content** (`content/letters.ts`): Barnaby's ten field notes, unnumbered, word for word from `docs/lore/VOICES.md` "Field notes, the full set", kept as parts (title, Established lines, Not established, Next) rather than a text body.
- **Delivery** (`systems/mail.ts`, the `mail` step of `advance`): the morning post comes at 08:00 local. The first note comes the morning after Barnaby has settled, then one every 3 local days, picked at random (repeatably) among the notes whose gates are met: the wetland, the islet, the grove, two pieces of new land, the ruin, and Síofra met at least 3 local days before the post (the note on Fin waits until he is built). A follow-up comes no sooner than 2 days after the note it follows, each note is sent once, and when nothing is unlocked or the set runs out, nothing happens and nothing says so. However long the game was closed, at most one letter waits for the player's return. The save keeps `mail.letters` and one cursor, `mail.checkedAt`.
- **Arrival**: a quiet journal line, kind `letter`, "A letter from Barnaby.", which the welcome-back recap gathers. No toast.
- **Journal → Letters** (`ui/panels/journal/LettersTab.tsx`): the tab appears once the first letter has come. Unread first, then newest, each kept and readable forever. While any is unread, the tab and each unread row carry a small wax seal, never a number; the tab's accessible name is "Letters, unread". A row shows the sender, the title and when it came (Today, Yesterday, or "24 October"). An opened letter is laid out as drafted: "Dear {farm},", the title in bold, each line on its own, and "Barnaby"; "‹ All letters" goes back.
- **For later**: letters from Síofra and Fin, Barnaby's "Day three" letter, the weekly postcard, linking a journal line to its letter, and "Mark all read".

### Characters
The island's characters live behind the `characters` switch, in the
`characters` step of `advance` (`systems/characters.ts`, with the pieces
they share in `systems/characterKit.ts`). Nothing of theirs pays, counts
down or can be missed. Barnaby Wick came first (spec:
`docs/superpowers/specs/2026-10-22-barnaby-design.md`).

**Síofra, the púca** (spec: `docs/superpowers/specs/2026-10-25-siofra-design.md`;
`systems/siofra.ts`, `content/siofra.ts`, `world/features/Siofra.tsx`) is
glimpsed through the Brown hare before she's met. She's met at 06:00 local
once Barnaby has settled, the meadow is owned, the hare has had a hello, and
it's at least the day after Barnaby was found, with her only toast. After that a moment
of hers (a shape, the crops-left-standing notice, or one of five gifts, each
given once) is a quiet journal line at 18:00 local, 2 or 3 local days apart,
never in the 15 minutes after a shiver, and at most one waits for a returning
player. Her figure stands at the meadow's field edge, hidden while the hare is
there, and a tap shows one of her lines for 4 seconds, never in the journal.
The hare carries her name once she's met, and Barnaby's note about her waits
until 3 local days after the meeting.

### B5. Island studio
Island → Studio, from level 6.
- **Move**: select a placeable object (click it in the world, or pick it from a list), drag across the ground or nudge with the arrow keys (0.25 snap), rotate ±45° with buttons or Q/E. Placement must stay on the island and clear of `BLOCKERS`; invalid spots show red and don't save. "Reset" returns it to its slot.
- **Recolour**: 8 palette swatches per object (`tints`).
- **Variants**: the looks from A5.
- Placeable: flowerbed, lantern, bench, scarecrow, beehive, fruitTree, well, and every workbench craft.
- **Photo mode**: hides the HUD, adds a soft frame with the farm name, and saves a PNG on the device ("Save postcard"). `stats.photos++`. Nothing is uploaded.
- The shop "Preview" ghost (A2) is shared with studio rendering.

### B6. Fishing
Opens with the Fishing Bench. Spots: `pond` (Fishing Bench), `cloud` (Sky Harbour),
`wetland` (Boardwalk Loop), `tarn` (Crofter's Bothy).
- Each open spot catches one fish every 45 min of real time (slot `k` from when the spot opened), even while closed, processing at most the last 8 slots on catch-up. The fish is chosen with `hash01` among that spot's fish whose time of day (day 06–20 local / night / any) matches the slot's time; an uncaught species is preferred half of the time. Size is `hash01` within the species' range.
- Catch and release: fish only fill the Almanac (`caught[id]`); they pay nothing (G2). Only a first catch of a species writes a journal line.
- Not the wetland's idle fish (economy spec §3): those are a steady yield, not luck, and **Collect all** turns them into coins. B6's catches, when fishing turns on later, still pay nothing.
- Big catch: about 1 in 8 catches (size in the top 15% of the range) waits at the jetty as a splash until noticed (only one at a time; later big catches while one waits are recorded as normal catches). Noticing it writes a journal line and a keepsake-like "photo" in the Almanac.
- `content/fish.ts`: 40 fish (pond 12, cloud 10, wetland 10, tarn 8). Real fish for pond, wetland and tarn; gentle sky-fantasy for cloud (e.g. Nimbus minnow, Cirrus eel). Each: id, name, spot, time, size range in cm, colours and shape parameters for a procedural SVG card, and a one-line note.

### B7. Helpers
Settings → Helpers, each off by default and optional forever:
- **Replanting scarecrow** (needs scarecrow and Garden Gate restored): after any harvest, replant the same crop if seeds remain.
- **Garden robin** (needs the wetland isle): harvests ripe crops automatically (offline too, at their ready time), honouring keep targets.
- The dog herds the sheep on the meadow (visual only).

### C1. Git-aware island events (desktop only, local)
- **Fair counting** in `crates/git-activity`: add `--no-merges`; skip empty commits (no file changes, e.g. via `--shortstat` and counting only commits with a stat line). Add new tag detection: tags whose creator date is in `(tagsSince, now]`, from `git for-each-ref refs/tags --format=%(creatordate:unix)`. The command becomes `repository_activity(path, since, tagsSince) -> { count, latest, tags }`. Keep the existing time limits and flags. Rust tests for each rule.
- **Repo orchard**: ~~a small free islet drifts in when any repository first has a commit counted.~~ Replaced by the idle economy (economy spec §4): the orchard's piece is land now, the orchard isle (`orchardLand`), claimed for coins and wood like any other piece, and the repo orchard grows on it once it is owned. Each watched repository with commits has a tree that grows in five stages by its lifetime counted commits (1, 10, 50, 150, 400). Trees are named by an alias picked when the repo is watched (Apple, Pear, Plum, Cherry, Quince, Damson, Medlar, Fig, in order of the first unused).
- **First commit in a new repository**: journal line (kind `git`) "A sapling for the Plum tree".
- **Lantern night**: a new tag raises sky lanterns until 06:00 local the next morning (`lanternNightUntil`). Journal line. Cosmetic only.
- **Aliases on screen**: `settings.showRepoNames` (off by default) decides whether toasts, the journal and the orchard show real repository names or aliases. Real names are never written into new journal entries when it is off.
- Commit rewards themselves are unchanged.

### C2. Biome islands
Wetland and highland are new isles (positions chosen so the framed view
still fits; suggested starting points: wetland near-right, highland far
back and tall). Each brings a crop, visitors, bundles, a helper,
fishing and **one hidden detail** that's never required: wetland has a
sunken bell that rings once in the journal when the player clicks the
ripples; highland has a carved note on a cairn stone. Earlier islands keep
everything; nothing resets. The camera framing grows to include them.

### C3. Retirement cottage
Lifetime XP raises a cottage in six stages, ~~on its own small isle that rises
from the clouds at stage 1~~. Replaced by the idle economy (economy spec §4):
the cottage's piece is land now, the woodland glade (`cottageLand`), claimed
for coins and wood like any other piece, and the cottage is built on it once
it is owned. Stage 1's 2,550 XP is level 9 on the idle economy's curve (it was
level 10).

| stage | XP | name |
|---|---|---|
| 1 | 2,550 | Pegged out |
| 2 | 6,100 | Foundations |
| 3 | 10,300 | Timber frame |
| 4 | 15,850 | Roof on |
| 5 | 24,000 | Windows and door |
| 6 | 36,000 | Home |

Progress → "Retirement cottage": the stage, a picture, and a bar to the next
stage. No ETA, no schedule, never "behind". Each stage writes a `cottage`
journal line once (`cottageSeen`).

### C4. Quiet stamps
`content/stamps.ts`: 60–70 stamps, each `{ id, name, hint, hidden?, test(state) }`.
Checked in `advance`; awarding writes a `stamp` journal line, quietly (no
toast). Journal → Stamps shows a grid; hidden stamps don't appear until
earned and are never counted. Cover: focus hours (1, 10, 50, 100, 250),
tasks, every crop harvested once (one each), every good made once, each
building, each animal, naming pets, each island's visitors all seen, each
island restored, fishing (no stamps for counts of species, per the no-counts rule in A2), letters, repo watched,
first commit counted, first lantern night, moving and recolouring things, a
photo, each cottage stage, and 4–5 secrets (e.g. naming the cat "Git",
harvesting 16 plots at once). Every stamp must be reachable within weeks of
normal play. Nothing about streaks, odd hours or long sessions.

## 6. Placeholder art and asset ids

Every new thing is drawn procedurally first, through `<Asset id="…">` so a
hand-made model replaces it when the asset session marks it ready. Ids:

- Buildings: `workbench`, `barn`, `press`, `loom`, `gazebo`, `hot_spring`, `observatory`, `mailbox`, `notice_board`.
- Crafts: `birdhouse`, `planter`, `signpost`, `wind_chime`, `picnic_table`, `hammock`, `arbour`, `rowboat`, `dovecote`, `treehouse`.
- Milestones: `coop_small`, `coop_run`, `trellis_arch`, `orchard_ladder`, `picnic_blanket`, `string_lights`, `apiary_sign`, `duck_house`, `sheep_shelter`.
- Restorations: `garden_arch`, `jetty`, `porch_rack`, `waterwheel`, `wildflowers`, `shepherds_hut`, `stone_bridge`, `mushroom_ring`, `woodcutter_hut`, `treetop_walk`, `keeper_cottage`, `sky_harbour`, `sky_boat`, `signal_fire`, `boardwalk_loop`, `reed_beds`, `heron_hide`, `standing_stones`, `bothy`, `cairn`.
- Visitors: `visitor_<id>` for each visitor in B1.
- Residents: cut from the story, so no assets (`hedge_cottage`, `burrow_door` and `otter_holt` are no longer wanted).
- Biomes: `isle_props_wetland` (reeds, lily pads), `isle_props_highland` (heather, boulders), `goat`, `boardwalk`, `lily_lantern`.
- Crops: `crop_wheat_[1-3]`, `crop_cranberry_[1-3]`, `crop_lavender_[1-3]`.
- Git: `repo_tree_[1-5]`, `sky_lantern`.
- Cottage: `cottage_[1-6]`.
- Fish are 2D procedural SVG cards; no models.

## 7. Testing

- Unit tests for every system: deterministic, fixed timestamps, `TZ=UTC`. Cover the guardrails directly (e.g. a month away loses nothing; visitors and fish never change coins, wood or XP; offline caps).
- Migration: a v1 save migrates to v2 losslessly, and a v2 save round-trips.
- E2E (Playwright, desktop and mobile) for every happy path: recap after time passes, journal note, almanac silhouettes, preview ghost, crafting at the workbench, keep target and kitchen job, noticing a visitor, depositing into and finishing a bundle, reading a letter and the postcard, fishing big catch, studio move and photo, quiet mode, what counts, stamps, cottage stage. Seed advanced states with `farm.load()`; move time with `page.clock`.
- Bug fixes are red-green: the test is seen failing before the fix.

## 8. File map

The foundation is in place: save v2 and migration, the economy pass, the
journal, `advance`, and empty mount points for every feature. Each feature
group below owns the files listed; every file is in one lane only. Files under
**Foundation** are shared: import them, don't edit them. Where a lane has to
touch a shared file, the parts it may change are named.

### How the pieces fit

- **Systems.** `src/game/systems/<name>.ts` exports `sanitize<Name>(raw, base, now)`
  (called by `migrate`, given the whole raw save) and
  `advance<Name>(s, now, out): boolean`, which returns true when it changed `s`.
  That flag is the only change check `advance` makes. The order is the `STEPS`
  list in `src/game/advance.ts`: day, crops, workshop, visitors, fishing,
  restoration, gitEvents, mail, cottage, studio, stamps, journal. Before it
  clones, `advance` asks each active step's cheap check in `DUE` (same file)
  whether it has work; a step without one counts as always due, which is
  correct but copies the whole farm every second. A lane that fills in its
  step adds its own `DUE` entry there.
- **Notices.** Write them with `note(s, out, notice, now)` from
  `systems/journal.ts` (the time is the fourth argument; rules stay pure).
  `notice.entry` gives the journal line different words from the toast;
  `quiet` skips the toast; `tell(s, title, now)` writes a story line.
- **Shared rule helpers** are in `src/game/core.ts` (`clone`, `refuse`,
  `grantXp(s, xp, out, now)`, `grantCoins`, `rollDay`, `addRecent`),
  `src/game/sanitize.ts` and `src/game/hash.ts`. Systems import these, not the
  engine, to keep imports one-way.
- **Level-triggered work** (visitors starting at level 4, level letters, cottage
  stages) happens in the system's `advance` by looking at the state, never by
  editing `grantXp`.
- **Ids** for fish, letters and stamps are plain strings, so their tables fill
  in without touching `state.ts`. Sanitizers drop ids that aren't in a table.
- **UI-only state** for a feature (what the studio has selected, say) lives in
  that feature's own small store, not in `src/store/game.ts`. The store already
  has `preview`/`setPreview` and `recap`/`dismissRecap`.
- **World.** Features draw inside the scene from `src/world/features/<Name>.tsx`.
  Things they build on the main island reserve space in
  `src/world/places/<lane>.ts` (types only from `layout.ts`). New isles use
  `Rising` (given the isle's id and a `bridge` to draw, laid once the isle has
  settled; the motion is in `riseCurve.ts`), `bridgeEnds`, `useLocalAt` and
  `useRisesIn` from `Isles.tsx`, and
  their positions in `ISLES`; `visibleIsles` in `framing.ts` already shows the
  wetland and highland when owned, the orchard via `orchardVisible` and the
  cottage via `cottageStage`, and the camera frames whatever is visible.
- **Placeables** stand where `useSlot(key, home, rot)` says, keyed
  `slotKey(item, index)`, wrapped in `<Tint swatch>`.
- **Art and icons.** `Art.tsx` has a picture for every crop and item; `Icon.tsx`
  adds journal, island, letter, stamp, fish, hammer, bird, camera and pot. Other
  art (goods, visitors, fish cards, stamps) is drawn in the lane's own files.
- **Tests.** Unit tests sit next to the system (`systems/<name>.test.ts`). E2E
  specs are `e2e/<lane>.spec.ts`; lane-only helpers go in the spec or
  `e2e/<lane>.helpers.ts`. Run several suites at once with
  `E2E_PORT=<free port> npm run e2e`.
- **Feature switches.** Each feature ships in its own pull request, which turns
  its switch on in `src/game/features.ts` (one line). While a switch is off the
  player sees nothing of it: `ItemDef.feature`/`CropDef.feature` keep its things
  out of the shop, the unlock notices and `buyItem` (`src/game/available.ts`),
  `src/ui/surfaces.ts` hides its tools, tabs, almanac pages and settings
  sections, `LADDER` story lines carry their feature, its `STEPS` entry doesn't
  run, and its world mount and isle aren't drawn or framed. Save data stays.
  Tests flip switches with `withFeatures`/`useFeatures` from
  `src/game/testing.ts`; e2e specs `test.skip` on `FEATURES`. Switches: A1
  `journal`, A2 `almanac` and `shopPreview`, A3 `milestoneLooks`, A4 `ambient`,
  A5 `seasons`, A6 `attention`, A7 `fairCounting`, B1 `visitors`, B2 `workshop`,
  B3 `restorations`, B4 `letters` (the animal residents were cut, and their
  switch with them), B5 `studio`, B6 `fishing`,
  B7 `helpers`, C1 `gitEvents`, C2 `biomes`, C3 `cottage`, C4 `stamps`, and
  `lateBuildings` for the gazebo and observatory, which nothing draws yet.

### Foundation (shared)

`src/game/{config,state,save,core,result,sanitize,hash,advance,progression,engine,features,available,testing}.ts`,
`src/ui/surfaces.ts`,
`src/store/*`, `src/main.tsx`, `src/world/{layout,framing,Asset,random,skyRef}.ts(x)`,
`src/ui/{Panel,Icon,Art,Logo,Welcome,Tutorial}.tsx`, `src/ui/format.ts`,
`src/ui/panels/SettingsPanel.tsx`, `src/ui/panels/settings/{General,Data,Segmented}.tsx`,
`src/hooks/*`, `src/styles/{app,tokens}.css`, `e2e/fixtures.ts`,
`playwright.config.ts`, this spec.

### records: A1 polish, A2 crops/animals/buildings, A7 UI, C4

- `src/game/systems/journal.ts` and its test, `src/game/systems/stamps.ts`, `src/game/content/stamps.ts`
- `src/ui/Recap.tsx`, `src/ui/SessionCard.tsx` (note for next time, the task counter), `src/ui/panels/ProgressPanel.tsx` (today's counters)
- `src/ui/panels/journal/{JournalPanel,JournalTab,AlmanacTab,StampsTab}.tsx`
- `src/ui/panels/journal/almanac/{index.ts,CropsPage,AnimalsPage,BuildingsPage}.tsx`
- `src/ui/panels/settings/WhatCounts.tsx`, `src/ui/panels/GardenPanel.tsx`
- `src/styles/features/{journal,almanac,recap,stamps}.css`, `e2e/journal.spec.ts`
- In `engine.ts`: the cap wording in `startSession`, `endSession` and `logTask`.

### workshop: B2, B7, the Goods page

- `src/game/systems/workshop.ts`, `src/game/content/goods.ts`
- `src/ui/panels/InventoryPanel.tsx`, `src/ui/panels/stores/{ThingsTab,BarnTab,WorkbenchTab}.tsx`
- `src/ui/panels/settings/Helpers.tsx`, `src/ui/panels/journal/almanac/GoodsPage.tsx`
- `src/world/features/Workshop.tsx`, `src/world/places/workshop.ts`, `src/styles/features/workshop.css`
- In `engine.ts`: `harvestInto`, `harvest`, `harvestAll` and `plantInto` (keep targets, the replanting scarecrow).

### visitors: B1, B6, the Visitors and Fish pages

- `src/game/systems/{visitors,fishing}.ts`, `src/game/content/{visitors,fish}.ts`
- `src/ui/panels/journal/almanac/{VisitorsPage,FishPage}.tsx`
- `src/world/features/{Visitors,Fishing}.tsx`, `src/styles/features/{visitors,fishing}.css`

### restoration: B3, C2, C3 (with the Progress card)

- `src/game/systems/{restoration,cottage}.ts`, `src/game/content/bundles.ts`, a new `src/game/content/biomes.ts`
- `src/ui/panels/island/{IslandPanel,RestorationsTab}.tsx`, `src/ui/panels/progress/CottageCard.tsx`
- `src/world/features/{Restorations,Biomes,Cottage}.tsx`, `src/world/places/restoration.ts`, `src/world/Isles.tsx`
- `src/styles/features/{restoration,cottage}.css`
- In `layout.ts`: only the `wetland`, `highland` and `cottage` lines of `ISLES`.

### mail: B4

- `src/game/systems/mail.ts`, `src/game/content/letters.ts`
- `src/ui/panels/journal/LettersTab.tsx`, `src/styles/features/mail.css`
- `e2e/letters.spec.ts`

### git: C1

- `src-tauri/crates/git-activity/**`, `src-tauri/src/lib.rs`, `src/integrations/*`
- `src/game/systems/gitEvents.ts`, `src/game/commits.test.ts`, `src/ui/panels/settings/Commits.tsx`
- `src/world/features/{RepoOrchard,LanternNight}.tsx`, `src/styles/features/git.css`, `e2e/git.spec.ts`
- In `engine.ts`: `watchRepository`, `unwatchRepository`, `recordCommits`. In `layout.ts`: only the `orchard` line of `ISLES`.

### atmosphere: A3, A4, A5

- `src/world/features/{Milestones,Ambient,Weather}.tsx`
- `src/world/{MainIsland,Animals,Structures,Farmhouse,Nature,Crops,Garden,Fireflies,DayCycle,Backdrop,SkyArt,Water}.tsx`
- `src/world/{materials,palette,skyPalette,terrain,wind}.ts`, `src/audio/ambient.ts`
- `src/ui/panels/FarmPanel.tsx` (Your animals), `src/ui/panels/settings/World.tsx`
- A new `src/game/systems/names.ts` for naming (the `names` slice is already sanitized in `save.ts`)
- `src/styles/features/atmosphere.css`

### studio: A6, B5, the shop Preview ghost

- `src/game/systems/studio.ts`
- `src/world/{slots.ts,Tint.tsx,World.tsx,motion.ts}`, `src/world/features/Studio.tsx`
- `src/ui/{StudioOverlay,PhotoMode,Hud,Toasts,ItemCard}.tsx`, `src/ui/panels/ShopPanel.tsx`
- `src/ui/panels/island/StudioTab.tsx`, `src/ui/panels/settings/Attention.tsx`
- `src/App.tsx` (the compact HUD), `src-tauri/capabilities/default.json`
- `src/styles/features/{studio,attention}.css`

### Choices the foundation made

- `note` takes the time as a fourth argument, and every action that writes to
  the journal takes `now` (`buyItem(s, id, now)`, `buySeeds(s, crop, n, now)`).
- `LADDER` story lines are told by condition, not at the level-up alone: once
  the farm has reached the level and the feature is on, each line is written
  once and its id kept in `told`. A farm already past a level still hears a
  feature's line when that feature ships.
- A save from a newer Gitaway keeps its `version` in the loaded state
  (`isNewerSave`): it's read as far as it can be and never written over, with
  one warning toast. An older version's save is copied, as it was, to
  `farm-v<version>` in the same store before the first write upgrades it;
  erasing the farm removes the copy too.
- `ItemDef.requiresBundle` names one restoration (the rowboat's Fishing Bench);
  `UNLOCKS` in `config.ts` holds the ladder levels the UI checks.
- Past level 20 each level costs 2,200 XP more (the old step was 900).
- Quiet mode drops every toast except warnings, which answer a click.
- `CottageCard` starts as the old retirement bar, for the cottage to replace.
  The cottage writes its own stage lines, so the journal tells nothing at level 10.
- While the tab is hidden nothing is announced; coming back runs `advance`
  once, and after ten minutes or more the recap replaces the toasts. A tick
  that comes ten minutes or more after the last one (the computer slept with
  the tab in view) catches up the same way.
