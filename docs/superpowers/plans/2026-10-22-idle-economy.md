# Idle economy: implementation plan

> **For agentic workers:** you must use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to carry out this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

- **Goal:** the farm produces coins and wood on its own, work pays about 2.5 times the farm, land opens in any order at a rising flat price, crops rotate with a fresh-soil bonus, and the numbers are tuned with a local simulator to a two-week island for a 5-day-week worker.
- **Architecture:**
  - **A new idle-output system,** `yields`. Each kind of output is stored as fractional units on one shared timestamp and settled lazily, the same way crops grow from timestamps.
  - **Plumbing:** it sits beside the engine and is surfaced through Collect all, a bottom-left card row and world labels.
  - **Land** is priced by how many pieces you own, through `itemPrice`. Each plot remembers its last crop.
  - **Tuning:** every tunable number stays in `config.ts` (plus `content/yields.ts`), and a vitest-hosted simulator outside `npm test` tunes them.
- **Tech stack:** TypeScript, React 19, React Three Fiber and drei, zustand, Vitest 5, Playwright. The repo is in WSL; commands run from `/home/me/Projects/gitaway-wt/economy` with `. ~/.nvm/nvm.sh` first.
- **Spec:** `docs/superpowers/specs/2026-10-22-idle-economy-design.md`. Read it before starting; this plan argues from it.

## Global constraints

**Economy rules:**
- Work pays about 2.5 times the farm on a workday, with coins, wood and XP each in the range 2–3 times (target T2).
- Idle output stops at **72 hours' worth** per kind. Nothing is ever taken away.
- The fresh-soil bonus is **+25%** when a harvest's crop differs from the plot's last crop. A plot that has never grown anything counts as fresh.
- These caps don't change:
  - session minutes: 240 per session and 480 per day;
  - tasks: 12 per day, a title once a day;
  - commits: 20 per day, 8 repos;
  - merges are ignored.
- Land price is `base × growth^(land pieces owned)`, with coins and wood each having their own base. Land has no level gate, and owning a piece unlocks its content.
- The repeat-purchase price step stays at 1.12.
- `SAVE_VERSION` becomes 3. Nothing owned is lost, and a player's level is kept.
- No-pressure guardrails:
  - nothing decays, spoils or expires;
  - no streaks or absence counters;
  - luck never pays currency.
- Animals are narrated and never speak (lore decision, 2026-10-22).
- Work and the farm are separate streams: nothing a player owns changes what work pays. That includes the grove: its session-wood bonus moves to the woodshed.

**Process rules:**
- **The simulator is local only.** It must not run in `npm test` or CI, and `src/game/pacing.test.ts` is deleted.
- **Never `git add` `art/` or `public/models/`.** Art requests go to the art session.
- **TDD.** For any bug fix, show the test failing first.
- **e2e.** CI runs the desktop project. Run the mobile project locally before pushing app changes: `npm run e2e:mobile` once PR #40 has merged, `npx playwright test --project=mobile` until then. Use a free port: `E2E_PORT=43xx`.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Docs-only commits carry `[skip ci]`.
- **Files written through `\\wsl.localhost`** end up owned by root. Run `wsl.exe -d Ubuntu-24.04 -u root -- chown $USER:$USER <file>` afterwards.
- **One branch, one PR.** All tasks go on branch `feat/idle-economy`. A single PR to `main` is opened at the end, so main never holds a half-balanced economy.

## Review focus

The inputs most likely to hurt a player that the spec doesn't spell out. Each line's test lives in the named task.

1. **The clock steps back** (system time before `yields.at`). Expected: nothing accrues, nothing is lost, and the same window is never paid twice. Pinned in Task 2.
2. **Buying a source while output is at its cap.** Expected: the stored amount stays, the cap rises with the new source, and accrual resumes. Pinned in Task 2.
3. **Collect all with only fractions waiting.** Expected: it is refused quietly (`ok: false`, no toast), and the fractions are kept. Pinned in Task 2.
4. **A save with the glade and 6 beehives, reloaded.** Expected: all 6 hives survive. `migrate` must clamp to `itemMax(state, id)`, not `ITEMS[id].max`. Pinned in Task 5.
5. **A v1 or v2 farm loaded after the level curve changes.** Expected: the player keeps the level they had. Old tables are frozen so `v1LevelForXp` no longer reads the live table. Pinned in Task 8.

---

### Task 1: The local simulator, measuring today's game

**Files:**
- Create:
  - `vitest.balance.config.ts`
  - `src/game/balance/players.ts`
  - `src/game/balance/strategy.ts`
  - `src/game/balance/report.ts`
  - `src/game/balance/balance.sim.ts`
- Modify: `package.json` (add a `balance` script)
- Delete: `src/game/pacing.test.ts`

**Interfaces:**
- Produces:
  - `type PlayerKind = 'worker' | 'farmer' | 'light'`.
  - `interface PlayerProfile { kind: PlayerKind; checkIns: number[] /* hours after local midnight */; workdays: number[] /* 1–5 = Mon–Fri */; sessionMinutes: number; tasks: number }`.
  - `PROFILES: Record<PlayerKind, PlayerProfile>`:
    - worker: check-ins [9, 13, 18]; workdays 1–5; 120 minutes; 4 tasks.
    - farmer: the same check-ins, no workdays.
    - light: check-ins [18], workdays 1–5, 120 minutes, 4 tasks.
  - `interface DayLog { day: number; level: number; bought: ItemId[]; unlocked: string[]; coins: number; wood: number; harvest: Partial<Record<CropId, number>>; earned: { work: Tally; farm: Tally } }`, where `type Tally = { coins: number; wood: number; xp: number }`.
  - `play(profile: PlayerProfile, days: number): DayLog[]`, in `players.ts`. It starts with `createInitialState(T0)`, where `T0` is Monday 2026-10-19 00:00 UTC, and runs under `TZ=UTC`.
  - `checkIn(s: GameState, now: number, nextGapMs: number, log: DayLog): GameState`, in `strategy.ts`. It runs `advance`, harvests, buys, then plants for the gap.
  - `interface TargetResult { id: 'T1'|'T2'|'T3'|'T4'|'T5'|'T6'|'T7'; pass: boolean; detail: string }`.
  - `evaluate(logs: Record<PlayerKind, DayLog[]>): TargetResult[]` and `printReport(logs, results): void`, in `report.ts`.

- [ ] **Step 1: Add the balance config and script**

`vitest.balance.config.ts` uses `defineConfig` from `vitest/config` with:
- `define: { __DEV_TOOLS__: 'false' }`;
- `test: { include: ['src/game/balance/**/*.sim.ts'], environment: 'node', testTimeout: 120_000 }`.

Add to `package.json`: `"balance": "TZ=UTC vitest run --config vitest.balance.config.ts"`.

The default `vite.config.ts` include (`src/**/*.test.ts`) already leaves `*.sim.ts` out of `npm test`.

- [ ] **Step 2: Write `players.ts` and `strategy.ts` against today's engine**

These use only real engine exports: `advance`, `startSession`, `endSession`, `logTask`, `harvestAll`, `buyItem`, `buySeeds`, `plant`, `itemPrice`, `buyBlock`, `isCropUnlocked`, `growMs`, `harvestValue`, `levelForXp`, `unlocksAtLevel`.

- **Work:** on each workday the worker runs `startSession` at 09:00 and `endSession` at `09:00 + sessionMinutes`, then logs `tasks` distinct titles at 12:00. Work earnings are measured as the state difference across those calls (coins, wood, XP), and everything else counts as farm.
- **Buying,** greedy, at each check-in:
  1. land, whenever every land price is affordable (cheapest first, today's order);
  2. otherwise the item with the shortest payback that `buyBlock` allows, keeping `40 × plots` coins back for seeds;
  3. decor only when nothing else is affordable.
- **Planting,** per empty plot: the unlocked crop with the highest `harvestValue − seedCost` whose `growMs` is no more than the gap to the next check-in. Ties go to the longer grow time.

- [ ] **Step 3: Write `report.ts` with the seven targets from spec §2**

Each target is an exact predicate over the logs:

| Target | Passes when |
|---|---|
| T1 | The worker owns all 7 land pieces on day 13–15, and the farmer owns them by day 50 |
| T2 | For each worker workday and each of coins, wood and XP, `work / farm` is between 2 and 3 (the median across workdays is used) |
| T3 | Every day from 1 to 14, the worker's `bought.length + unlocked.length ≥ 1`, except Saturday and Sunday |
| T4 | The worker's day-1 `bought` includes at least 3 items |
| T5 | Across days 1–14, the worker's largest crop share of harvest coins is at most 40%, and at least 4 crops have a share of 5% or more |
| T6 | At the end of day 14, the worker's coins and wood are each less than the price of the most expensive item it bought |
| T7 | The farmer's first land purchase is on day 3 or earlier |

`printReport` prints per player:
- the day on which each land piece was bought;
- the day each level was reached;
- the crop shares;
- the median T2 ratios;
- one line per target: `PASS` or `FAIL` plus its detail.

- [ ] **Step 4: Write `balance.sim.ts`**

One `it('meets the balance targets', ...)` that plays 14 days for the worker and light worker and 60 for the farmer, prints the report, then runs `expect(results.filter((r) => !r.pass).map((r) => r.id)).toEqual([])`.

- [ ] **Step 5: Run it against today's game and check that it fails as the spec predicts**

Run: `npm run balance`.

Expected:
- the report prints, and the run FAILS;
- T1 fails: wood-gated, about day 29;
- T2 fails: the farm out-earns work;
- T7 fails: the farmer gets no wood.

Keep that output for the PR description.

- [ ] **Step 6: Delete `src/game/pacing.test.ts` and check nothing else imports it**

Run: `npx tsc -b && TZ=UTC npx vitest run`.

Expected: PASS, with one test file fewer than before.

- [ ] **Step 7: Commit**

```bash
git add vitest.balance.config.ts package.json src/game/balance src/game/pacing.test.ts
git commit -m "Add a local balance simulator and retire the pacing test"
```

---

### Task 2: Idle yields: state, accrual and Collect all

**Files:**
- Create:
  - `src/game/content/yields.ts`
  - `src/game/systems/yields.ts`
  - `src/game/systems/yields.test.ts`
- Modify:
  - `src/game/state.ts` (`GameState.yields`, `createInitialState`)
  - `src/game/save.ts` (sanitize `yields` in `migrate`)
  - `src/game/engine.ts` (`buyItem` settles first; `sessionPreview` drops the grove bonus)
  - `src/game/config.ts` (remove `BONUS.groveWoodPerSession`; add the yield constants below; add the `'woodshed'` `ItemId` and `ITEMS.woodshed`)
  - `src/ui/Art.tsx` (`ITEM_ART.woodshed`, needed because `ITEM_ART` must have an entry for every item)
  - `src/game/advance.ts` (the `yields` step and its `DUE` entry)
  - `src/game/advance.test.ts` (step-order pin)
  - `src/game/engine.test.ts` (grove session-wood test)
  - `src/game/economy.test.ts` (the woodshed's entry)

**Interfaces:**
- Produces:
  - In `content/yields.ts`:
    - `type YieldId = 'eggs' | 'wool' | 'milk' | 'honey' | 'fruit' | 'fish' | 'wood'`.
    - `interface YieldDef { id: YieldId; unit: [one: string, many: string]; hours: number /* hours for one unit from one source */; pays: 'coins' | 'wood'; value: number /* per unit */; xp: number /* per unit, may be fractional */; line: (n: number) => string /* narrated */ }`.
    - `YIELDS: Record<YieldId, YieldDef>`, `YIELD_IDS: YieldId[]`.
  - In `config.ts`:
    - `YIELD_CAP_HOURS = 72`;
    - `GROVE_WOOD_SOURCES = 1` (sources the grove adds to the woodshed);
    - `ORCHARD_FRUIT_TREES = 8` (see Task 5).
  - `GameState.yields: { at: number; stored: Record<YieldId, number> }`. `stored` is fractional units.
  - In `systems/yields.ts`:
    - `yieldSources(s: GameState, id: YieldId): number`;
    - `settleYields(s: GameState, now: number): void`, which mutates;
    - `waitingYields(s: GameState, now: number): Record<YieldId, number>`: whole units, pure;
    - `collectAll(state: GameState, now: number): Result`;
    - `sanitizeYields(raw: unknown, now: number): Pick<GameState, 'yields'>`;
    - `advanceYields(s: GameState, now: number, out: Notice[]): boolean`, with the shape of `advance.ts`'s `Step`;
    - `yieldsDue(s: GameState, now: number): boolean`.
  - `ItemId` `'woodshed'`, with `ITEMS.woodshed` set to:
    - `{ id: 'woodshed', name: 'Woodshed', category: 'building', coins: 30, wood: 0, max: 1, unlockLevel: 1, xp: 6, blurb: 'A lean-to for the logs the island's own trees give up.', effect: 'Stacks wood to collect, more once you own the grove.' }`;
    - it is placed before `well` in the table, so it is listed first among buildings;
    - its coins are tuned in Task 8.

    `ITEM_ART.woodshed` is an SVG icon of a lean-to with stacked logs, in the style of the neighbouring icons.

**Starting values** (Task 8 tunes them):

| Yield | hours | pays | value | xp |
|---|---|---|---|---|
| eggs | 8 | coins | 10 | 0.5 |
| wool | 12 | coins | 24 | 1 |
| milk | 12 | coins | 20 | 1 |
| honey | 12 | coins | 28 | 1 |
| fruit | 12 | coins | 8 | 0.5 |
| fish | 6 | coins | 15 | 1 |
| wood | 4 | wood | 1 | 0.5 |

**Sources:**

| Yield | Sources |
|---|---|
| eggs | `owned.chicken + owned.duck` |
| wool | `owned.sheep` |
| milk | `owned.goat` |
| honey | `owned.beehive` |
| fruit | `owned.fruitTree` (Task 5 adds the orchard) |
| fish | `owned.wetland > 0 ? 1 : 0` |
| wood | `owned.woodshed > 0 ? 1 + owned.grove * GROVE_WOOD_SOURCES : 0` |

**Narrated lines:**

| Yield | Line |
|---|---|
| eggs | "The hens laid N eggs." |
| wool | "The sheep grew N fleeces." |
| milk | "The goats gave N pails of milk." |
| honey | "The bees filled N jars of honey." |
| fruit | "The trees dropped N baskets of fruit." |
| fish | "N fish were landed in the wetland." |
| wood | "N logs were split and stacked." |

Each uses the singular form when N is 1.

- [ ] **Step 1: Write the failing unit tests in `systems/yields.test.ts`**

Use `T0 = Date.UTC(2026, 9, 17, 9, 0, 0)`, `fresh = () => createInitialState(T0)` and `HOUR = 3_600_000`. Every expected number is computed from `YIELDS`, so the tests survive tuning.

- **`two starting hens lay from the start`:** `waitingYields(fresh(), T0 + 24 * HOUR).eggs === Math.floor(2 * 24 / YIELDS.eggs.hours)`.
- **`output stops at 72 hours' worth and nothing is lost`:**
  - `waitingYields(s, T0 + 30 * 24 * HOUR).eggs === Math.floor(2 * 72 / YIELDS.eggs.hours)`;
  - the same value after `settleYields` at 30 days and again at 31 days.
- **`buying a source banks what is waiting at the old count`:**
  1. at `T0 + 9h`, `buyItem(s, 'chicken', t)`;
  2. at `T0 + 18h`, eggs === `Math.floor((2 * 9 + 3 * 9) / YIELDS.eggs.hours)`.
- **`at the cap, a new source raises the cap and accrual resumes`** (Review focus 2):
  1. settle at 30 days;
  2. buy a chicken;
  3. after a further 8 h, the stored amount is greater than its old cap and at most `3 * 72 / hours`.
- **`a clock that steps back pays nothing and never pays a window twice`** (Review focus 1):
  1. settle at `T0 + 10h`;
  2. `settleYields(s, T0 + 5h)`: `stored` unchanged and `at` still `T0 + 10h`;
  3. settle at `T0 + 12h`: only 2 hours accrued.
- **`collectAll pays coins, wood and XP, keeps fractions, and writes narrated lines`:**
  - with a woodshed (set `owned.woodshed = 1`) and 2 hens, after 13 hours, `collectAll` returns `ok`;
  - coins rise by `eggs × YIELDS.eggs.value`;
  - wood rises by `woodUnits × YIELDS.wood.value`;
  - `stored.eggs` equals the leftover fraction (`< 1`);
  - one notice has `kind: 'reward'`, title `/^\+\d+ coins, \+\d+ wood$/`, `journal: 'garden'`, and an `entry.title` containing "The hens laid".
- **`collectAll with only fractions waiting is refused quietly`** (Review focus 3): after 1 hour, `collectAll(...).ok === false` with `notices.length === 0`, and the state is unchanged.
- **`a fresh farm's yields start counting at creation, and an old save's at load`:** `sanitizeYields({}, T5).yields` equals `{ at: T5, stored: <all 0> }`.
- **`the grove adds woodshed sources and no longer adds session wood`:**
  - `yieldSources` for wood equals `1 + GROVE_WOOD_SOURCES` with a woodshed and the grove;
  - a 45-minute session with the grove pays `Math.floor(45 / SESSION.minutesPerWood)` wood.
- **`the woodshed is a level 1 building for coins only, one per farm`** (in `economy.test.ts`): `ITEMS.woodshed` has `category: 'building'`, `unlockLevel: 1`, `wood: 0` and `max: 1`, and `buyBlock(s, 'woodshed') === null` on a fresh farm with enough coins.
- **`after an absence the recap says what is waiting`:**
  - `advance(s, s.seenAt + RECAP_AFTER_MS + 9 * HOUR)` writes one `garden` journal entry naming the waiting eggs;
  - `yieldsDue` is false while `now - seenAt < RECAP_AFTER_MS`.

- [ ] **Step 2: Run them and check they fail**

Run: `TZ=UTC npx vitest run src/game/systems/yields.test.ts`.

Expected: FAIL: the module is not found.

- [ ] **Step 3: Implement**

- **`content/yields.ts`:** the table above.
- **`config.ts`:** the constants above, and remove `BONUS.groveWoodPerSession` and its use at `engine.ts:81,87`.
- **`state.ts`:** add `yields` to `GameState`, set in `createInitialState(now)` as `{ at: now, stored: <0 for every YieldId> }`.
- **`systems/yields.ts`:**
  - `settleYields` adds `max(0, now − at) × sources ÷ (hours × 3_600_000)` per kind, capped at `YIELD_CAP_HOURS × sources ÷ hours`. It sets `at = max(at, now)`, never moving `at` back.
  - `waitingYields` settles a clone and floors the result.
  - `collectAll`:
    1. clone and settle;
    2. take the whole units of each kind and reduce `stored` by them;
    3. `grantCoins` and/or add wood;
    4. `grantXp(s, Math.round(totalXp), out, now)`;
    5. call `note()` once with title `"+N coins, +M wood"` (omit a zero part), `detail` the joined lines, `journal: 'garden'`, and `entry: { title: joined lines }`;
    6. if no whole unit is waiting, `refuse(state)` with no notice.
  - `advanceYields` writes one quiet `garden` line, "Waiting to be collected: 18 eggs, 3 fleeces and 7 logs.", via `note(..., { kind: 'info', journal: 'garden', quiet: true, title })`.
  - `yieldsDue = now − s.seenAt ≥ RECAP_AFTER_MS && any waiting`.
- **`advance.ts`:** register `['yields', advanceYields]` straight after `'crops'`, with a `DUE.yields` entry. Update the pinned order in `advance.test.ts`.
- **`save.ts`:** `Object.assign(s, sanitizeYields(field(raw, 'yields'), now))`. A missing or invalid `at` becomes `now`, and stored values are clamped to `[0, cap]`.
- **`engine.ts`:** `buyItem` calls `settleYields(s, now)` before `owned[id]++`.
- **`engine.test.ts`:** update the grove session test to the new rule.

- [ ] **Step 4: Run them and check they pass, with the rest of the unit suite**

Run: `TZ=UTC npx vitest run && npx tsc -b`.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "Let the farm produce on its own: idle yields and Collect all"
```

---

### Task 3: The woodshed in the world

**Files:**
- Modify:
  - `src/world/layout.ts` (`WOODSHED: XZ`, plus a `BLOCKERS` entry)
  - `src/world/Structures.tsx` (`WoodshedShell` fallback and placement)
  - `src/world/MainIsland.tsx` (draw it when owned)
  - `src/world/World.tsx` (`data-woodshed`)
- Test: `src/game/economy.test.ts`, `e2e/build.spec.ts`

**Interfaces:**
- Consumes: `ITEMS.woodshed` and `yieldSources` (Task 2).
- Produces: `WOODSHED: XZ` in `layout.ts`, which Task 4's markers use.

- [ ] **Step 1: Write the failing e2e test**

In `e2e/build.spec.ts`, `a new farm can build a woodshed`:
  1. `farm.start()`;
  2. open the Farm tool, `buy-woodshed`;
  3. the toast reads `Woodshed added`;
  4. the `world` element shows the woodshed (add `data-woodshed="true"` on the world when it is owned, set in `World.tsx`).

- [ ] **Step 2: Run them and check they fail**

Run: `E2E_PORT=4351 npx playwright test e2e/build.spec.ts --project=desktop`.

Expected: FAIL.

- [ ] **Step 3: Implement**

- **Placement:** pick `WOODSHED` on the main island beside the farmhouse, clear of the `BLOCKERS` and `SLOT_DISCS` areas, and add its own blocker.
- **Drawing:** `<Asset id="woodshed" fallback={<WoodshedShell />} />`. `WoodshedShell` is procedural: a lean-to roof on posts over a pile of cylinders, using the materials of the neighbouring structures.

- [ ] **Step 4: Run them and check they pass**

Run the same commands. Expected: PASS.

- [ ] **Step 5: Screenshot the woodshed at the default view and zoomed in**

Use the alpha screenshot script, `scratchpad/alpha-shots.mjs`, adapted to own a woodshed. Check it sits on the ground and clears the path and farmhouse.

- [ ] **Step 6: Commit**

```bash
git add src/game/economy.test.ts src/world e2e/build.spec.ts
git commit -m "Draw the woodshed beside the farmhouse"
```

---

### Task 4: Collecting in the UI, and ready markers in the world

**Files:**
- Create:
  - `src/world/WorldLabel.tsx` (`WorldLabel` moved out of `src/world/features/Visitors.tsx`, which then imports it)
  - `src/world/ReadyMarkers.tsx`
  - `e2e/yields.spec.ts`
- Modify:
  - `src/ui/Hud.tsx` (`NextCrop` gets a collect row; the toolbar badge)
  - `src/ui/panels/GardenPanel.tsx` (a Collect all button beside Harvest all)
  - `src/world/World.tsx` (mount `ReadyMarkers`)
  - `src/styles/features/visitors.css` (rename `.vis-label` to `.world-label`, or add a shared class)

**Interfaces:**
- Consumes: `waitingYields`, `collectAll` and `YIELDS` (Task 2); `WOODSHED` (Task 3).
- Produces:
  - `WorldLabel({ at, children, farewell?, motion })`, exported from `src/world/WorldLabel.tsx`, together with `type V3 = [number, number, number]`.
  - Test ids:
    - `collect-all` in the Garden panel;
    - `collect-all-quick` on the bottom-left card;
    - `ready-${yieldId}` on each marker's label `<div>`.

- [ ] **Step 1: Write the failing e2e tests in `e2e/yields.spec.ts`**

- **`the woodshed's wood and the hens' eggs wait, and Collect all brings them in`:**
  1. `farm.load(establishedFarm({ owned: { plot: 0, chicken: 2, woodshed: 1 } }))`;
  2. `farm.wait('13:00:00')`;
  3. `collect-all-quick` is visible;
  4. read the coins and wood counts;
  5. click it;
  6. coins and wood both rose; the toast matches `/^\+\d+ coins, \+\d+ wood$/`;
  7. `collect-all-quick` is hidden.
- **`ready markers float over what has something waiting`:** after 13 h, `getByTestId('ready-eggs')` and `getByTestId('ready-wood')` are attached; after collecting, they are detached.
- **`the garden panel collects too`:** open Garden, `collect-all` is enabled, click it, and the same toast appears.

- [ ] **Step 2: Run them and check they fail**

Run: `E2E_PORT=4352 npx playwright test e2e/yields.spec.ts --project=desktop`.

Expected: FAIL.

- [ ] **Step 3: Implement**

- **`NextCrop`:**
  - Read `waitingYields(game, now)` with `useCoarseNow(5000)`.
  - When any count is above 0, render a row above the crop content: a short summary ("18 eggs · 7 logs") and the `collect-all-quick` button, `run(collectAll)`.
  - This row also shows when the Garden panel is open: move the `panel === 'garden'` early return below it.
- **The toolbar badge** on Garden counts ripe plots plus the yield kinds with at least 1 unit waiting. Its `aria-label` is `${n} ready`.
- **`GardenPanel`:** a `collect-all` button beside `harvest-all`, disabled when nothing is waiting.
- **`ReadyMarkers`:** one `WorldLabel` per kind with something waiting, showing "N eggs" and so on, placed at:

  | Yield | Where |
  |---|---|
  | eggs | the centre of `CHICKEN_YARDS[0]` |
  | honey | `BEEHIVES[0]` |
  | fruit | `FRUIT_TREES[0]`, or the first orchard row when no fruit tree is owned |
  | wood | `WOODSHED` |
  | wool | the meadow pasture, through `OnIsle id="meadow"` |
  | milk | the highland herd, through `OnIsle id="highland"` |
  | fish | `WETLAND.lake`, through `OnIsle id="wetland"` |

  Heights use the island height helper plus 1.2. Pass `motion` from `useMotion()`.

- [ ] **Step 4: Run them and check they pass, on desktop and on mobile locally**

Run: `E2E_PORT=4352 npx playwright test e2e/yields.spec.ts`.

Expected: PASS on both projects.

- [ ] **Step 5: Commit**

```bash
git add src/ui src/world src/styles e2e/yields.spec.ts
git commit -m "Collect all from the card and the garden, with ready markers over the farm"
```

---

### Task 5: Land in any order, with what each piece brings

**Files:**
- Modify:
  - `src/game/config.ts`:
    - add `LAND = { coins: 60, wood: 5, growth: 1.8 }` (tuned in Task 8);
    - add `GLADE_HIVES = 3`;
    - on every land item, set `unlockLevel` to 1 and `coins`/`wood` to 0, with a comment that land is priced by `LAND`;
    - set `unlockLevel: 1` on cranberry, lavender, sheep, goat and lighthouse (each keeps its `requires`);
    - give each land item an `effect` line.
  - `src/game/engine.ts`:
    - `itemPrice` gets a land branch;
    - add `landOwned` and `itemMax`;
    - `buyBlock` uses `itemMax`.
  - `src/game/systems/yields.ts`: fruit sources add `owned.orchardLand ? ORCHARD_FRUIT_TREES : 0`.
  - `src/game/save.ts`: clamp `owned` with `itemMax(s, id)` after land counts are restored.
  - `src/game/systems/journal.ts`: remove the level-based wetland and highland `ISLE_OPENINGS` lines, and their tests.
  - `src/ui/ItemCard.tsx`: show the max from `itemMax`.
  - `src/ui/panels/FarmPanel.tsx`:
    - the island count uses `landOwned`;
    - the New land text becomes "Land rises from the clouds and docks against the farm. Claim pieces in any order: each one makes the next cost more."
  - `src/ui/panels/ProgressPanel.tsx:27`: the milestone counts `landOwned(game) > 0`.
  - `src/world/isleSpots.ts`: add `GLADE.hives: XZ[]`, 3 spots on the cottage piece.
  - `src/world/Isles.tsx`: draw hives 4–6 on the glade when `owned.cottageLand` is set.
- Test:
  - `src/game/economy.test.ts`;
  - `src/game/progression.test.ts`;
  - `src/game/save.test.ts`;
  - `e2e/land.spec.ts` (create);
  - `e2e/wild-isles.spec.ts` and `e2e/ring-isles.spec.ts` (drop the level-gate assertions).

**Land effect lines:**

| Item | Effect |
|---|---|
| meadow | "Sheep can graze here: wool to collect." |
| grove | "Your woodshed stacks more wood." |
| islet | "Room for the lighthouse." |
| wetland | "Cranberries grow here, and fish can be caught." |
| highland | "Goats and lavender." |
| cottageLand | "Wildflowers: room for 3 more beehives." |
| orchardLand | "Its 8 trees bear fruit to collect." |

**Interfaces:**
- Produces:
  - `landOwned(s: GameState): number`;
  - `itemMax(s: GameState, id: ItemId): number`, which is `ITEMS[id].max + (id === 'beehive' && s.owned.cottageLand ? GLADE_HIVES : 0)`;
  - `itemPrice` for land: `{ coins: Math.round(LAND.coins * LAND.growth ** landOwned(s)), wood: Math.round(LAND.wood * LAND.growth ** landOwned(s)) }`.
- Consumes: `yieldSources` (Task 2).

**Orchard interpretation,** to confirm with the owner when the plan is reviewed: the orchard isle's 8 drawn trees count as fruit sources. That is simpler than raising the fruit-tree maximum, which would draw extra trees over the existing rows.

- [ ] **Step 1: Write the failing unit tests**

In `economy.test.ts`:
- `every land piece costs the same, rising by LAND.growth with each one owned`: for 0 to 6 pieces owned in any mix, every unowned land item's price equals the formula.
- `land has no level gate`: on a fresh farm with enough coins and wood, `buyBlock(s, 'orchardLand') === null`.
- `owning a piece unlocks its content`:
  - with only `highland`, `isCropUnlocked(s, 'lavender')` holds and `buyBlock(s, 'goat')` isn't `'level'`;
  - with only `wetland`, `yieldSources(s, 'fish') === 1`.
- `the glade makes room for 3 more beehives`: `itemMax(s, 'beehive')` is `ITEMS.beehive.max + 3`, and `buyBlock` allows a fourth hive.
- `the orchard's trees bear fruit`: `yieldSources(s, 'fruit') === owned.fruitTree + 8` with the orchard.

In `save.test.ts`:
- `a farm with the glade keeps all six hives through a reload` (Review focus 4).

In `progression.test.ts`:
- Replace the land entries in the pinned `nextUnlock` lists. Land no longer appears in level unlocks.

- [ ] **Step 2: Write the failing e2e tests in `e2e/land.spec.ts`**

- **`land can be claimed in any order, and each piece raises the price of the rest`:**
  1. `establishedFarm({ coins: 50000, wood: 5000 })` at level 1 (set `xp: 0`, `levelSeen: 1`);
  2. open the Farm tool and read the price on `item-orchardLand`;
  3. buy the orchard first;
  4. `data-docked` gains `orchard`;
  5. `item-meadow` now shows a price `LAND.growth` times higher, rounded.
- **`the highland first brings goats and lavender at once`:** buy the highland at level 1. Then Shop → Animals has `buy-goat` with text `Adopt`, and Seeds lists lavender as unlocked.

- [ ] **Step 3: Run them and check they fail**

Run: `TZ=UTC npx vitest run src/game` and `E2E_PORT=4353 npx playwright test e2e/land.spec.ts --project=desktop`.

Expected: FAIL.

- [ ] **Step 4: Implement as listed under Files, then update `wild-isles.spec.ts` and `ring-isles.spec.ts`**

Remove the "Level N brings … isle" and disabled-at-level assertions. Keep the rise, dock, paths and content checks.

- [ ] **Step 5: Run the whole unit suite and the isle specs and check they pass**

Run: `TZ=UTC npx vitest run && npx tsc -b && E2E_PORT=4353 npx playwright test e2e/land.spec.ts e2e/isles.spec.ts e2e/wild-isles.spec.ts e2e/ring-isles.spec.ts e2e/composition.spec.ts`.

Expected: PASS on both projects.

- [ ] **Step 6: Screenshot odd land mixes**

Take the default view and the farthest zoom of:
- the orchard alone;
- the glade alone;
- the highland alone;
- the glade with the meadow.

Check edges (skirts) and paths. Send anything that looks wrong to the art session as an art request, with the screenshot; don't edit `art/`.

- [ ] **Step 7: Commit**

```bash
git add src e2e
git commit -m "Open land in any order at one rising price; each piece brings something"
```

---

### Task 6: Fresh soil

**Files:**
- Modify:
  - `src/game/state.ts` (`Plot.lastCrop`, `emptyPlot`)
  - `src/game/engine.ts` (`harvestInto` keeps `lastCrop`; `harvestValue(state, crop, fresh = false)`; add `isFresh`)
  - `src/game/config.ts` (`BONUS.freshSoil = 0.25`)
  - `src/game/save.ts` (`plotFrom` keeps a valid `lastCrop`, even on an empty plot)
  - `src/ui/panels/GardenPanel.tsx` (the hint on an empty selected plot; `SeedPicker` sublines show `+25%` on fresh crops)
- Test: `src/game/engine.test.ts`, `src/game/save.test.ts` (plot shape at `:270`), `e2e/garden.spec.ts`

**Interfaces:**
- Produces:
  - `Plot.lastCrop: CropId | null`;
  - `isFresh(plot: Plot, crop: CropId): boolean`, which is `plot.lastCrop !== crop`;
  - `harvestValue(state: GameState, crop: CropId, fresh?: boolean): number`.

  Existing callers keep the 2-argument form for the base price.

**Hint copy,** exact:
- after a harvest: `Fresh soil: +25% for anything but ${CROPS[last].plural.toLowerCase()}`;
- on a plot that has never grown anything: `Fresh soil: +25% for any crop`.

- [ ] **Step 1: Write the failing tests**

In `engine.test.ts`:
- `a different crop from the plot's last pays 25% more`:
  1. plant and harvest carrot on plot 0;
  2. plant radish on plot 0 and harvest it;
  3. coins rise by `Math.round(CROPS.radish.coins * 1.25)` (no windmill).
- `the same crop again pays its normal price`: harvest radish then radish again; the second pays `CROPS.radish.coins`.
- `a plot that never grew anything counts as fresh`.

In `save.test.ts`:
- an empty plot round-trips `lastCrop: 'carrot'`;
- the pinned shape gains `lastCrop: null`.

In `e2e/garden.spec.ts`:
- `an empty plot shows its fresh-soil hint`: after harvesting radishes, select plot 0, and the text `Fresh soil: +25% for anything but radishes` is visible.

- [ ] **Step 2: Run them and check they fail**

Run: `TZ=UTC npx vitest run src/game/engine.test.ts src/game/save.test.ts`.

Expected: FAIL.

- [ ] **Step 3: Implement as listed under Files**

- [ ] **Step 4: Run them and check they pass**

Run: `TZ=UTC npx vitest run && E2E_PORT=4354 npx playwright test e2e/garden.spec.ts`.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src e2e/garden.spec.ts
git commit -m "Reward rotating crops with a fresh-soil bonus"
```

---

### Task 7: The simulator plays the new game

**Files:**
- Modify: `src/game/balance/strategy.ts` and `src/game/balance/report.ts`

**Interfaces:**
- Consumes: `collectAll`, `waitingYields`, `landOwned`, `itemMax`, `isFresh` and `harvestValue(state, crop, fresh)`, from Tasks 2, 5 and 6.

- [ ] **Step 1: Update `checkIn` to the new game**

The order becomes:
1. `advance`;
2. `collectAll` when anything is waiting;
3. harvest;
4. buy;
5. plant.

**Buying:**
- the woodshed first;
- land whenever affordable, choosing by what it brings, in this order: grove, meadow, wetland, highland, orchard, glade, islet;
- yield sources (hens, ducks, hives, trees, sheep, goats) by payback: `price ÷ (value per hour)`, from `YIELDS`;
- then buildings, plots and decor as before.

**Planting:** per plot, choose the crop that maximises `harvestValue(s, crop, isFresh(plot, crop)) − seedCost` among those that ripen before the next check-in.

**Farm earnings:** collected yields now count as farm.

- [ ] **Step 2: Run the simulator and record where today's numbers land**

Run: `npm run balance`.

Expected: the report prints, and some targets may still FAIL. Keep the output: it is Task 8's starting point.

- [ ] **Step 3: Commit**

```bash
git add src/game/balance
git commit -m "Teach the balance simulator to collect, choose land and rotate crops"
```

---

### Task 8: Tune to the targets; level ladder; save version 3

**Files:**
- Modify:
  - `src/game/config.ts`: the tunables are `START`, `SESSION.coinsPerMinute/xpPerMinute/minutesPerWood`, `TASKS.coins/xp/wood`, `COMMITS.coins/xp`, `CROPS[*].coins/xp/growMinutes/seedCost/unlockLevel`, `ITEMS[*].coins/wood/unlockLevel`, `LAND`, `LEVEL_XP`, `GROVE_WOOD_SOURCES` and `levelBonus`. Caps don't change.
  - `src/game/content/yields.ts`: `hours`, `value` and `xp`.
  - `src/game/state.ts`: `SAVE_VERSION = 3`.
  - `src/game/save.ts`: freeze `V2_LEVEL_XP`, make `v1LevelForXp` read the frozen tables, and add `v2LevelForXp`; this is the v3 upgrade step.
  - `README.md` and `src/ui/Hud.tsx` `WOOD_TITLE` (the wood tooltip): the numbers.
- Test:
  - `src/game/progression.test.ts`;
  - `src/game/economy.test.ts`;
  - `src/game/engine.test.ts`;
  - `src/game/commits.test.ts`;
  - `src/game/save.test.ts`;
  - the e2e specs that pin numbers: `work.spec.ts`, `build.spec.ts`, `garden.spec.ts`, `first-run.spec.ts`, `saves.spec.ts` (version 3), `journal.spec.ts:16` and `ring-isles.spec.ts:26`.

**Interfaces:**
- Produces:
  - `V2_LEVEL_XP: readonly number[]`, a copy of today's `LEVEL_XP`;
  - `v2LevelForXp(xp: number): number`.
  - In `migrate`, for `savedVersion(raw) < 3`:
    - `oldLevel` is `v1LevelForXp(xp)` for version 1, and `v2LevelForXp(xp)` for version 2;
    - then `s.xp = Math.max(s.xp, xpForLevel(oldLevel))`.

- [ ] **Step 1: Write the failing rule tests first**

In `progression.test.ts`:
- `every level from 2 to 12 unlocks at least one thing`:

  ```ts
  for (let l = 2; l <= 12; l++) {
    const u = unlocksAtLevel(l)
    expect(u.crops.length + u.items.length + u.gifts.length, `level ${l}`).toBeGreaterThan(0)
  }
  ```

- Keep `level gaps never shrink`.

In `save.test.ts`:
- `a version 2 farm keeps its level under the new curve`: XP of `V2_LEVEL_XP[9]` (old level 10) loads at `levelForXp(xp) === 10`.
- `a version 1 farm keeps its old level` (Review focus 5).
- The upgraded save has `version: 3`.

- [ ] **Step 2: Run them and check they fail**

Run: `TZ=UTC npx vitest run src/game/progression.test.ts src/game/save.test.ts`.

Expected: FAIL. Levels 8, 10 and 11 are empty, and version is 2.

- [ ] **Step 3: Implement the save-version-3 step and spread the unlock levels so every level from 2 to 12 has something**

Use the existing crops, animals, buildings, decor and the woodshed. Land no longer takes level slots.

- [ ] **Step 4: Tune until `npm run balance` passes T1–T7**

Change one group of numbers at a time and rerun `npm run balance` after each:
1. land and wood first (T1, T7);
2. then work against the farm (T2);
3. then the level curve and unlocks (T3, T4);
4. then crops (T5);
5. then leftovers (T6).

Expected at the end: every target PASS. Save the final report text for the PR.

- [ ] **Step 5: Update the tests that pin numbers to the chosen values, and run everything**

Prefer symbolic expectations, built from config constants, over literals where the test's intent allows.

Run: `TZ=UTC npx vitest run && npx tsc -b && E2E_PORT=4355 npx playwright test`.

Expected: PASS on both projects.

- [ ] **Step 6: Commit**

```bash
git add src README.md e2e
git commit -m "Tune the economy to a two-week island for a 5-day-week worker; save version 3"
```

---

### Task 9: Docs, art requests, and the PR

**Files:**
- Modify:
  - `README.md` ("Fair by design" and the economy lines);
  - `docs/idle-loop.md` §3 and "Wood and the first isle": a pointer to the spec, with the old wood rules and level gates marked as replaced.

- [ ] **Step 1: Update the docs**

- [ ] **Step 2: Send the art session two requests**

Use `SendMessage` to the session named "Remote control", or look up its id with `ListAgents`. Each request is procedural, with no Meshy credits:
- **`woodshed`:** a lean-to with stacked logs, matching the farmhouse palette, at the `WOODSHED` spot.
- **`jetty`:** a small jetty on the wetland's lake edge. The brief is at `art/ASSETS.md:194`.

Each request names its asset id and says the game draws a fallback until the model lands.

- [ ] **Step 3: Run the whole suite and the mobile project locally**

Run: `TZ=UTC npx vitest run && npx tsc -b && npm run build && E2E_PORT=4356 npx playwright test`.

Expected: PASS on both projects.

- [ ] **Step 4: Commit the docs, push, and open the PR**

```bash
git add README.md docs/idle-loop.md
git commit -m "Point the docs at the idle economy [skip ci]"
git push -u origin feat/idle-economy
gh pr create --base main --title "Idle economy: the farm produces on its own, land in any order, fresh soil" --body-file <body>
```

The PR body includes:
- the before and after `npm run balance` reports;
- the land screenshots;
- the orchard interpretation;
- the art requests sent;
- the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
