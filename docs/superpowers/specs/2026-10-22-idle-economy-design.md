# Idle economy: design

- **Status:** agreed in conversation with the owner on 2026-10-22, section by section. This is the written spec for the owner to review before planning.
- **Base:** main at `6c18227`.

## 1. Why

A playtester found wood "really hard to earn". The economy map of main explains why:

- **Wood comes only from working.** Sessions pay 1 wood per 20 minutes, with 1 more per session once you own the grove. Each logged task pays 1 wood. Nothing on the farm makes wood. A player who doesn't work gets **0 wood a day**. They start with 6 and the first piece of land costs 8, so they can never buy any land. Everything buyable needs 407 wood.
- **For coins and XP, the farm out-earns work by 6 to 20 times** once the plots are bought, around day 4 or 5. Coins then pile up, to tens of thousands by day 60, with nothing to buy. So the ratio is the reverse of what the owner wants.
- **Nothing is idle except crops.** Animals, beehives, fruit trees and buildings produce nothing.
- **One crop wins.** With three check-ins a day, the longest crop that fits each gap always pays most per check-in (blueberry). With frequent clicks, radish wins.
- **Levels are too fast and land is too slow.** A 2-hours-a-day worker reaches level 16 by day 7 to 12, but finishes the island only around day 29, held back entirely by wood. Levels 8, 10, 11, 13 and 15 unlock nothing.

The owner's direction:

- **Lean into idle farming.** The farm produces on its own, and **working alongside it pays about 2.5 times what the farm does**, in coins, wood and XP alike. Work and the farm are **separate streams**: working doesn't speed the farm up.
- **It should feel fulfilling.** There is always something new to buy or do, with a generous start and a ramp after it.
- **No crop-maxing on a single crop.**
- **Land is opened in any order** at a flat price that rises steeply with each piece opened, so the full island takes real, sustained work.
- **For the alpha, the full island takes about 2 weeks of 5-day work weeks.**
- **Numbers come from local simulation.** The simulation is exploration only and never runs on CI.

The no-pressure guardrails of `docs/idle-loop.md` §0 still hold:

- Nothing decays, spoils, expires or is taken away.
- Offline production may stop filling at a limit, but is never lost.
- There are no streaks, appointments or absence counters.
- Luck never pays currency.

## 2. Targets, and the local simulator

The simulated players each play 14 days, starting on a Monday:

| Player | Work | Check-ins |
|---|---|---|
| **Worker** | Each weekday: 2 hours of sessions and 4 tasks. Nothing at weekends. | 3 a day: about 09:00, 13:00 and 18:00 |
| **Farmer** | None | 3 a day |
| **Light worker** | Like the worker | 1 a day |

Each player buys sensibly. At each check-in, they pick the best crop for the time until their next check-in, using the rotation bonus (§5).

| # | Target | Measure |
|---|---|---|
| T1 | The island takes about 2 weeks of work | The worker owns all 7 pieces of land by day 13–15. The farmer gets there too, about 3.5 times later (around day 45–50), and is never stuck. |
| T2 | Work pays about 2.5 times the farm | On a workday, work's coins, wood and XP are each 2 to 3 times what the farm produces by itself (harvests plus collected output). |
| T3 | Always something new | The worker can afford something new every day: an item, a piece of land, or a newly unlocked crop or animal. There's no gap longer than a weekend. |
| T4 | A generous start | On day 1 the worker can buy at least 3 things that help: the woodshed, a plot and a chicken. |
| T5 | No single best crop | Over the 14 days, no crop gives more than 40% of harvest income, and at least 4 crops are worth planting. |
| T6 | Neither currency is the wall | Coins and wood run short at roughly the same times. At day 14 the worker isn't sitting on a pile of either. |
| T7 | Players who don't work aren't stuck | The farmer can afford a first piece of land by day 2–3. |

**The simulator** is a local script, `npm run balance`, kept out of `npm test` and CI.

- **It uses the game's real rules.** It calls the engine and catalogue functions on a `GameState` and moves the game clock forward. It doesn't keep its own copy of the rules, so it can't drift from the game.
- **It prints** each player's timeline: purchases, levels, land, crop mix, the work-to-farm ratio per currency, and the pass or fail of each target.
- **It's how numbers get tuned.** Change a number in `config.ts`, run it, and read the report.
- **Today's `src/game/pacing.test.ts` is retired.** Its targets belong to the old economy, and the owner doesn't want a balance simulation on CI.

## 3. Idle producers and collecting

| Source | Makes | Notes |
|---|---|---|
| Chickens and ducks | eggs | The 2 starting chickens produce from the start. Ducks lay too. |
| Sheep | wool | |
| Goats | milk | |
| Beehives | honey | |
| Fruit trees | fruit | |
| **Woodshed** (new) | **wood** | One per farm. Cheap, coins only, affordable on day 1. Fed by the island's own trees. |
| Forest grove (land) | more wood | Raises the woodshed's rate. |
| **Wetland** (land) | **fish** | Idle catches from the wetland's water (§4). |

**Output and value:**

- **What collecting gives.** Goods turn into **coins and a little XP**; wood goes straight into the wood count. There's no barn, goods inventory or crafting in this scope.
- **Starting values** come from `src/game/content/goods.ts`: eggs 10, honey 28, wool 24, milk 20. The new fruit and fish values, and every rate, are tuned by the simulator.
- **Producer timings already sketched** (`PRODUCERS`): eggs every 8 h; honey, wool and milk every 12 h. Those are starting points, not commitments.

**Building up:**

- **It works from timestamps,** like crop growth. Each kind of output stores when it was last collected. What's waiting is `min(limit, elapsed × rate × sources)`, with no ticking.
- **It stops at 3 days' worth** per kind. When full it simply stops filling. Nothing is ever taken away.
- **Buying another source** (an animal, a hive, a tree) first banks what's waiting, at the old count, so output never jumps backwards or forwards.

**Collecting:**

- **Collect all** collects every kind that's ready, in one action. It sits beside **Harvest all** on the bottom-left card, which shows what's ready. The toolbar badge counts ready output as well as ripe crops.
- **The toast** reads like "+64 coins, +7 wood".
- **The journal and recap** get narrated lines, such as "The hens laid 18 eggs." Animals are not characters and do not speak (lore decision, 2026-10-22).
- **A "ready" marker** floats over the coop, hives, trees, woodshed or water when there's something to collect. It is a UI label, like the visitor labels, so it needs no new art.

## 4. Land in any order

**Pricing:**

- **No level gates on land.** All 7 pieces are on offer from the start.
- **One price for every piece not yet owned:** `price = base × growth^(pieces owned)`, in coins and in wood (each with its own base and growth).
- **Tuned for T1 and T7.** The first piece is affordable on day 1–2 for the worker and day 2–3 for the farmer, and the 7th lands around day 14. As a guide, growth near ×1.8 per piece makes the 7th about 35 times the first.
- **The Farm panel** lists every remaining piece at the current price, with a line on what it brings. After a purchase, all the remaining prices step up together.

**What each piece brings.** Owning a piece unlocks its content, with no separate level gate.

| Piece | Brings |
|---|---|
| Meadow isle | Sheep (wool) |
| Forest grove | More wood from the woodshed |
| Lighthouse islet | The lighthouse building |
| Wetland isle | Cranberries, and **fishing** |
| Highland isle | Goats (milk) and lavender |
| Woodland glade | Room for more beehives (wildflowers), so more honey |
| Orchard isle | Room for more fruit trees, so more fruit |

**Other changes:**

- **Content levels.** Cranberry, lavender and goat lose their L9 and L12 gates.
- **Milestones.** The "Claim a second island" milestone counts any piece, not only meadow, grove and islet.

**Checks,** because the art was built and tested in one order:

- **Screenshots** of odd combinations: the orchard alone, the glade without its neighbours, the highland first. Edges ("skirts") and composition paths are meant to handle missing neighbours. Anything that looks wrong goes to the art session.
- **e2e tests** for buying land out of the old order, including the rise and dock.

**Fishing:**

- **For now:** idle catches on the wetland only.
- **Later:** the fish collection page, the big catch and the skeleton fisherman. He arrives when the Pond Jetty is restored, and the lore names him as the angler behind the passive catches.
- **Reuse:** the paused branch `idle/b6-fishing` (about 3,300 lines, mixed with older visitors work) has catch code, a jetty scene and fish data to reuse rather than rewrite.

## 5. Crops with distinct roles

**Grow times match the gaps in a day.** Each crop is the best pick for one kind of time away:

| Gap | Crops |
|---|---|
| At your desk, checking in now and then | radish, carrot, wheat, lettuce (5–30 min) |
| A morning or afternoon | tomato, sunflower, pumpkin (1–3 h) |
| A workday, or lunch to evening | blueberry, cranberry, lavender (4–6 h) |
| Overnight | The longest crops stretched to 8–12 h |

Values are tuned so that, per check-in, the right crop for each gap clearly beats planting a long crop and leaving it ripe and waiting. Ripe crops still wait forever.

**The rotation bonus, "fresh soil":**

- **The bonus.** Planting a different crop from the one a plot last grew gives **+25% when that harvest is sold**.
- **The hint.** Each plot shows it: "Fresh soil: +25% for anything but carrots".
- **No penalty.** Repeating a crop pays its normal price.
- **Saves.** The plot remembers its last crop. A plot that has never grown anything, or that was upgraded from an old save, counts as fresh.

**Prices:**

- **Crop prices and XP come down overall,** so the farm earns about 1 part in 3.5 of the worker's total (T2).
- **Every crop still has its unlock:** a level, or its piece of land.
- **Checked by T5.**

## 6. Levels, unlocks and work pay

**Level curve:**

- **The shape.** The worker reaches levels 2–4 on day 1, then about one level a day or a little slower, to around level 10–12 by day 14. The farmer follows the same ladder about 3.5 times more slowly.
- **Above that range,** levels give titles only.
- **Exact XP** comes from the simulator (T1, T3).
- **The tests follow.** `progression.test.ts` keeps its rule that level gaps never shrink. Its pinned unlock lists change.

**Every level from 2 to about 12 unlocks at least one thing.** Today's empty levels (8, 10, 11, 13, 15) and the slots land used to take are filled by spreading out:

- the existing crops, animals, buildings and decor;
- the woodshed;
- the new producers.

**Work pays about 2.5 times the farm (T2).** Session pay per minute (coins, XP, wood), task pay and commit pay are retuned:

- **Wood from work** gets more generous than today's 1 per 20 minutes.
- **The fair-by-design caps don't change:** 4 h per session, 8 h a day, 12 tasks a day, 20 commits a day, a task title once a day, merges ignored.

**A generous start (T4).** Starting coins and wood rise, so that on day 1 the worker can buy the woodshed, a plot and a chicken, and be well on the way to a first piece of land.

**Repeat purchases** keep their 1.12× price step (`economy.test.ts`), unless the simulator shows it must change.

## 7. Saves

- **Save version 3.** `SAVE_VERSION` goes from 2 to 3, using the existing pattern: the older save is kept aside before the first write that upgrades it.
- **Kept on upgrade:** everything owned, plus coins, wood and XP.
- **Producers** start counting at the moment of the upgrade, with no back pay.
- **Plots** start with no last crop, so they count as fresh soil.
- **Land already owned** stays owned. Only future prices follow the formula.
- **The woodshed** is a new item, owned by nobody yet.

## 8. Tests

- **The local simulator** (`npm run balance`, §2) is not part of `npm test` and not on CI. `pacing.test.ts` is retired.
- **New unit tests:**
  - producer build-up, the 3-day limit, banking when a source is bought, and time away;
  - Collect all;
  - the any-order land price;
  - the rotation bonus;
  - the version 2 → 3 upgrade;
  - every level from 2 to 12 unlocking something;
  - the work-pay figures.
- **Updated tests:** `economy.test.ts`, `engine.test.ts`, `progression.test.ts`, `commits.test.ts` and the e2e tests that check exact numbers (`work.spec.ts`, `build.spec.ts`, `garden.spec.ts`, `first-run.spec.ts`, `wild-isles.spec.ts`, `ring-isles.spec.ts`) move to the new numbers. The land tests stop assuming level gates.
- **New e2e happy paths:**
  - buy the woodshed, let time pass, Collect all, and see coins and wood rise;
  - buy land out of the old order, and see it rise and dock;
  - see the fresh-soil hint and its bonus on a harvest.
- **Running them.** CI runs the desktop project. The mobile project runs locally (`npm run e2e:mobile`) before each push.
- **Screenshots** of odd land combinations, at the default view and zoomed out.

## 9. Docs and art

- **Docs:**
  - the README's numbers, and its "Fair by design" section;
  - `docs/idle-loop.md` §3 (economy pass), which describes the old wood rules and level gates. It gets a pointer to this spec, and its numbers are updated or marked as replaced.
- **Art,** asked of the art session, both procedural with no Meshy credits:
  - a **woodshed**;
  - a small **jetty on the wetland**.

  Until they land, the woodshed uses a placeholder and fishing works without a jetty.

## 10. Out of scope

- The barn, goods inventory, processing and crafting (the workshop branch, `idle/workshop`). Goods sell straight into coins here.
- The fish collection page, big catches, and the skeleton fisherman and his voice.
- Restorations, including the Pond Jetty.
- Helpers (auto-harvest, replanting).
- Residents and letters. The five animal residents are cut, per the lore decision of 2026-10-22.
- Seasons, weather and the attention dial.
- Balance beyond the alpha's 2-week island. Later content gets its own pacing pass.

## 11. Delivery

The implementation plan decides how the work splits into PRs. The likely order:

1. the local simulator against today's game, as a baseline;
2. producers, the woodshed and Collect all;
3. land in any order, including fishing on the wetland;
4. the crop, level and work-pay retune, iterated with the simulator until T1–T7 pass;
5. the save upgrade, docs, and the art asks.
