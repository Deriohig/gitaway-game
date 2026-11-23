# Barnaby, the shiver, and the characters system: design

- **Status:** agreed with the owner on 2026-10-22, section by section. This is the written spec for the owner to review before planning.
- **Base:** main at `8d0306f`, which includes the idle economy (#43).
- **Part of a larger lane.** The characters lane splits into sub-projects. This is the first:
  1. **Barnaby, plus the shared character system and the shiver** (this spec).
  2. Letters and clue objects: Barnaby's field notes, the tap-to-notice story objects, and the almanac's old pages.
  3. Síofra, built on the brown hare.
  4. Restorations onto main, then Fin at the Pond Jetty with fishing.
- **Canon:** `docs/lore/BIBLE.md`, `CAST.md` and `VOICES.md`. Where this spec and the lore differ on wording, the lore wins. Where they differ on mechanics, this spec wins, and the lore session is told.

## 1. What the player gets

Barnaby Wick is a wizard whose refuge spell went wrong. One morning he's found asleep in the radishes. He camps beside the garden, then moves into the tower ruin on the highland once it's claimed. He never leaves and never asks for anything:
- you can tap him for a line;
- now and then he remarks in the journal on what the island does.

From day one, the island **shivers** when work is done. Barnaby notices; nobody knows why.

**Guardrails still hold** (`docs/idle-loop.md` §0):
- nothing decays or expires;
- no streaks or counters;
- characters never pay coins, wood or XP;
- story text never explains why the island grows;
- no counts appear anywhere.

## 2. Barnaby's arc

| Stage | When | Where |
|---|---|---|
| `away` | until he's found | not on the island |
| `camp` | found, highland not owned | beside the garden on the main island |
| `ruin` | the highland is owned (at arrival, or when it's claimed later) | the highland's ruin spot |

- **Found the next morning.** He's due at the first 06:00, local time, after the farm reaches level 6. When the game advances past that moment, he's found:
  - the journal entry is stamped at 06:00, and a toast shows when the player is next there;
  - after a longer absence, when he's found on a later day than he was due, the entry is stamped at that day's 06:00 (or when he's found, if that's before 06:00), so it sits in the journal's day with the rest of the catch-up (ruling R17);
  - farms already at level 6 or above when this ships get him at the first 06:00 after they next load.
- **Straight to the ruin.** If the highland is already owned when he's found, the "found" line is followed the same day by the straight-to-ruin line, and his stage becomes `ruin`.
- **Moving house.** When the highland is claimed while he's camping, his stage becomes `ruin`, the highland's land line (his moving line) is written, and the camp is no longer drawn.
- **He never leaves.** Nothing about him counts down or needs tending.
- **Settled.** Barnaby counts as settled at whichever comes first:
  - 3 days after he's found;
  - the moment his stage becomes `ruin`.

  Síofra's sub-project uses this as her cue. This spec only defines it and exposes it as `barnabySettled(state, now): boolean`.

## 3. His lines

**Who writes them.** All copy is the lore session's, written from `VOICES.md`. It is in the appendix at the end of this spec. The plan copies it verbatim.

| Slot | Shown as | Rule |
|---|---|---|
| `found` | a toast plus a journal line | once |
| `straightToRuin` | a journal line | once, only when the highland is already owned at arrival |
| `land[piece]`, one per piece (`highland` is the moving line) | a journal line | once per piece, only for pieces claimed after he's found |
| `shiver` (8 lines, each tagged big, small or either) | a journal line | at most one a day, only straight after a live shiver; picks from the lines whose tag matches that shiver's size, or "either", unused lines first |
| `tapCamp` (12) and `tapRuin` (5 extra, added once he's at the ruin) | a floating speech label for about 4 s | not journaled; the first tap is always camp line 1 (his introduction); after that, random without repeats until the pool is used up, and a new round never starts with the line he's just said; the lean-to line (camp line 12) leaves the pool once he's at the ruin (ruling R12) |
| hover name | a label on hover | "Barnaby Wick" |

**Journal.**
- **A new kind:** Barnaby's lines use a new journal kind, `character`, which is added to `RECAP_KINDS` so the "while you were away" recap shows them.
- **Once-only:** once-only lines are recorded in the `characters` slice (his stage and `sawLand`; see §6), not as the journal's `told` ids (ruling R2).
- **Limits:** a title is at most 160 characters, and a detail at most 300.

**Chattiness.**
- Lines the player causes (being found, claiming land) always appear.
- Unprompted remarks (shivers) are capped at one per local day.

## 4. The shiver

- **Triggers:**
  - **big:** a work session ends with credited minutes;
  - **small:** a task is logged, or a commit is counted (within the daily caps; merges never count).
- **Live only.** Commits counted while catching up on load (time away) don't shiver. Only work done while the game is open does.
- **From day one.** The island shivers whether or not Barnaby has arrived.
- **In the world:**
  - a gust rolls out from the farmhouse across the composition's grass, flowers and trees, and the procedural plants, through the existing wind shader (`wind.ts`), as a transient boost to the gust amplitude;
  - about 2 s for a big shiver, about 1 s for a small one;
  - in still-motion mode nothing moves;
  - no sound, no camera shake.
- **For tests only:** the world element carries `data-shiver="<size>:<n>"`, where n increments per shiver in this page session. It's never shown as a number in the UI.
- **Barnaby's remark.** After a live shiver, if he's on the island and hasn't remarked on a shiver today, he writes one `shiver` line.

## 5. In the world

- **Barnaby:**
  - drawn as `<Asset id="barnaby" fallback={<BarnabyShell />}>`, where the shell is a chunky low-poly stand-in in the island's style (robe, round head, tall pointed hat);
  - a small idle sway and look-around, and static in still-motion mode;
  - hover shows his name, and tapping shows a tap line as a floating label (the shared `WorldLabel`);
  - test hooks (ruling R1): test ids `barnaby-says` on the label with his line and `barnaby-name` on the hover label; on the world element, `data-barnaby="<stage>"`, `data-barnaby-screen` (where he stands on screen, "x,y" in CSS pixels) and `data-shiver` (§4).
- **The camp:**
  - `<Asset id="barnaby_camp" fallback={<CampShell />}>`, a bedroll and a lean-to, drawn only while his stage is `camp`;
  - placed at a new `CAMP` spot on the edge of the garden, clear of the plots, paths, woodshed, `BLOCKERS` and `SLOT_DISCS`, with its own blocker so animals and the composition keep off it.
- **The ruin:**
  - `<Asset id="tower_ruin" fallback={<RuinShell />}>`, a few broken stone walls on the highland's reserved `ruins` spot (piece-local about (-1.89, -4.21), r 1; the `plateau_walk` path already ends there);
  - drawn whenever the highland is owned, because it's part of that land; Barnaby stands in it once his stage is `ruin`.
- **Art requests,** for the art session's own PR: `barnaby`, `barnaby_camp` and `tower_ruin`, each with its size and spot. Meshy or procedural is the art session's call.
- **Screenshots:** the camp, the ruin and Barnaby, from the default view, zoomed in, and two orbit angles.

## 6. Saves and the switch

- **New save slice:**
  ```ts
  characters: {
    shiver: { at: number; size: 'big' | 'small' } | null
    barnaby: {
      stage: 'away' | 'camp' | 'ruin'
      dueAt: number | null
      foundAt: number | null
      movedAt: number | null
      sawLand: LandPiece[]
      remarksUsed: number[]
      lastRemarkDay: string | null
      met: boolean
      heard: number[]
      said: { index: number; at: number } | null
    }
  }
  ```
- **Loading:** it's sanitized on load with safe defaults. A missing or junk slice becomes `away`. There's no save-version bump, because the slice is new with defaults, as `settings.sessionMusic` was.
- **The switch:** a new `characters` feature, **on** by default. Switched off, nothing is drawn, written or shivered.

## 7. Tests

**Unit, red then green:**
- **Arrival:**
  - he's found at the first 06:00 after level 6;
  - level 6 reached at 05:00 means he's found at 06:00 that same day;
  - an already-high farm gets him the morning after load.
- **The highland:** he goes straight to the ruin if it's owned, and moves when it's claimed; land lines appear only for pieces claimed after he's found.
- **Settled:** at 3 days, or at the move.
- **Shivers:** the right sizes; none from load catch-up; at most one remark a day.
- **Tap lines:** they cycle without repeating until the pool is exhausted.
- **The save:** junk or a missing slice gives `away`; a saved slice survives a round-trip through the save, each field repaired on load.
- **No currency:** no characters path changes coins, wood or XP.

**e2e (CI runs desktop; mobile runs locally before pushing):**
- a level-6 farm passes 06:00, then `data-barnaby="camp"`, the found toast and the journal line appear;
- claiming the highland gives `data-barnaby="ruin"`;
- tapping Barnaby shows a line;
- logging a task changes `data-shiver` to `small:…`, and ending a session to `big:…`.

`npm run balance` must still pass T1–T7, since nothing here touches currency.

## 8. Out of scope

- Barnaby's field notes as letters, the clue objects, and the almanac's pages (sub-project 2).
- Síofra beyond defining "settled" (sub-project 3).
- Fin, restorations and fishing (sub-project 4).
- The windmill loft (also retired in the lore), and any asks or errands from characters.

## Appendix: Barnaby's lines (lore session, 2026-10-22)

Revised 2026-10-23 from the lore session's critique pass; the lean-to tap is camp-only.

Verbatim. Each entry gives the title, then the detail after " / ". Lengths checked: titles 41–122 characters, details at most 199, tap labels 45–77. The same copy is in `docs/lore/VOICES.md` under "Game lines, for the game spec".

**Hover name:** Barnaby Wick

**found**
- **Toast:** Someone is asleep in the radishes.
- **Title:** There was a man in a pointed hat asleep in the radishes this morning.
- **Detail:** He was holding a scrap of very old paper. He woke, looked around and said "Ah. That's unexpected," in the voice of someone for whom it was not entirely unexpected. His name, he says, is Barnaby Wick.

**straightToRuin**
- **Title:** One look at the highland, and Barnaby walked straight up to the ruin on the plateau.
- **Detail:** He stood there for a long time. When he came down, he said it was a perfectly ordinary ruin, and that he'd be staying in it, thank you very much.

**land**
- **meadow:** At dawn, Barnaby paced out the new meadow. At dusk he did it again, got a different answer, and seemed delighted. / He's written both answers down, side by side, and won't say which one he believes.
- **grove:** The new grove creaks in a key Barnaby has never heard, and he's heard most of them. / He's going back tomorrow with a tuning fork, which he seems to have had on him all along.
- **islet:** Off the new islet, Barnaby lowered a weighted string into the cloud sea. It came back up perfectly dry. / He says that's either very good news or very bad news, and that he'll know which by Thursday.
- **wetland:** Barnaby waded into the new wetland and came back with wet boots and a theory. / The theory is about the reeds. He won't share it until it's better. It may never be better.
- **orchardLand:** "It can't be that hard," said Barnaby, and sat down in the new orchard to watch an apple grow. / One moved, apparently. He isn't sure which way.
- **cottageLand:** Even Barnaby went quiet in the new glade. / He called it the sort of place you shouldn't measure. Then he measured it anyway, looking sorry about it.
- **highland** (moving into the ruin): The new plateau has a ruin on top. Barnaby walked straight up to it and stood there for a long time. / He came back down, fetched his bedroll from the lean-to, and was moved in before dark.

**shiver**
- [big] A long, deep shiver ran through the island, like a dog settling down. / Barnaby wrote "pleased?" in his notes, crossed it out, and wrote it again.
- [big] A big shiver, the kind that walks teacups across saucers. / Barnaby added it to his chart of the shivers, which looks to him like somebody's very productive day. Not his.
- [either] The island shivered, and Barnaby's compass spun once, politely, then pointed at the kettle.
- [big] The whole island shivered. Barnaby has started timing it. He says it keeps office hours.
- [either] As the island shivered, Barnaby held very still and listened, in case it had more to say.
- [small] A small shiver, barely anything. Barnaby felt it in his teeth and wrote it down.
- [small] The island twitched, ever so slightly. Like a pond, Barnaby said, when a fish merely thinks about jumping.
- [small] A tiny shiver ran under the garden. Barnaby put his ear to the ground and stayed there until the cat came to check on him.

**tapCamp**
1. Barnaby Wick. At your service. Well, at my own service, mostly.
2. No committees. Nobody to tell me no. I may have to lie down.
3. Where's the edge? There's always an edge. Oh. There it is.
4. Leave it with me. I've handled stranger than an island. Not much stranger.
5. My spell was a summoning. You bring the thing to you. Nobody told the island.
6. A very silly old book got me here. I'm careful now what I call silly.
7. Do you know what happens when a cow gets trapped wind? No? Good.
8. They teach the cow at magic school, you know. First year.
9. I'm not saying it's the cow. The barn at my old school was rebuilt. Twice.
10. If you ever look up the cow, stand well back.
11. I explained cloud tides to the cat. She left halfway through. Fair.
12. The lean-to is purely temporary. I've grown very attached to it.

**tapRuin** (added to the pool once he's at the ruin)
1. It's a perfectly ordinary ruin. Stop looking at me like that.
2. It smells familiar. Old paper and rain. Never mind.
3. Two readings, two answers. I'd be worried if they agreed.
4. The stairs go up further than the tower does. I've stopped checking.
5. From up here the island looks like it's thinking. I'm not going to interrupt.

**The lore session's notes:**
- The cow lines work in any order, and none of them finishes the story.
- The shiver lines are his guesses. He never learns the cause, and none of them can fire on an absence.
- No line depends on Síofra or Fin.
- The meadow line deliberately echoes the previous mage's first almanac page (the same dawn-and-dusk measuring). Never explain it.
- The cat line assumes the cat, given at level 2, is on the farm. By level 6 she always is.
