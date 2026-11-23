# Síofra, the púca: first build

**Status:** approved by the owner on 2026-10-25.
**Branch:** `feat/siofra`.
**Builds after:** the letters PR (`feat/letters`), because one knock-on changes letters code.

## Goal

Síofra, the shape-shifting púca, becomes the island's second character.
- **Before she's met:** she's glimpsed through the Brown hare.
- **The meeting:** she's met properly, as herself, once Barnaby has settled.
- **After that:** she turns up every few days as an extra animal, a gift, or a nap in a ripe row, and you can tap her at a field edge for a line.

She's never counted, never missable, always an extra, and she only ever notices good things. The hare keeps visiting exactly as now, with her name on it once she's met.

## Decided

**By the owner, on 2026-10-25:**
- **Scope:** the lore's "first build".
  - **In:** the hover name, glimpses, the meeting, her 12 taps and 3 naps, five gifts, all eight shapes as past-tense journal lines, and one notice (crops left standing).
  - **Deferred:** the promise, the variety notice, the flowers, bees and trees notice, her shiver lines, her shapes as world actors, and her letter.
- **Tap target:** a figure of her as herself at one field edge. The hare stays a visitor you say hello to.
- **The hare** keeps visiting, renamed "Síofra" once she's met.
- **Shiver lines** come later, with Fin and the shared one-character-per-shiver pick.
- **The meeting** follows the lore's rule (below).
- **Pacing:** a Síofra moment every 2–3 days at most.

**From the lore canon** (`docs/lore/CAST.md` §4 and C6–C8, `docs/lore/VOICES.md` "The púca", including "Ready for the brainstorm"):
- She's always an extra, never a missing or replaced animal, and never menacing.
- She reacts only to what's there, and only positively. She never judges, and nothing fires on an absence.
- Her glimpses never name her. Only the meeting carries a toast.
- Her tap lines have no fixed first line.
- Story text never explains the island.
- No counts anywhere.

## Scope

**In:**
- the character system generalised so a second character fits;
- Síofra's state, meeting, moments, taps and figure;
- the hare's renamed lines once she's met;
- her gifts on her almanac card;
- the "í" font check;
- the letters knock-on.

**Out:** everything listed as deferred above, Fin, and real art for her figure (a placeholder until the art session's model).

## Architecture: per-character slices with shared helpers

- **Barnaby stays put.** He keeps his state (`characters.barnaby`) and behaviour. His existing tests are the guard: they may change their imports, never their expectations.
- **Shared helpers:** the parts of his code a second character needs are lifted out:
  - **the tap pool:** lines heard, the line being said and when, no back-to-back repeat, the 4-second floating label, and an optional fixed first line (Barnaby has one, Síofra hasn't);
  - **morning arrival stamping:** the next 06:00, and stamping a late arrival into the welcome-back recap. This is Barnaby's `nextMorning` / `foundStamp` behaviour.
  
  Barnaby then uses the shared versions, with no change in behaviour.
- **Síofra's slice:** `characters.siofra` holds her own state, and her own system file runs her rules from the `characters` step in `advance()`. The `characters` step's cheap due check covers her too.
- **Her content:** `content/siofra.ts` holds all her lines, mirroring `content/barnaby.ts`.
- **Switch:** everything sits behind the existing `characters` switch, which is on, so she goes live with this PR.

**State** (`characters.siofra`, all fields sanitized on load):

| field | meaning |
|---|---|
| `dueAt: number \| null` | the morning she's to be met, stored once everything she waits for holds (null until then), as Barnaby's `dueAt` is; the meeting happens at it, and it's only put back, never cleared (ruling S6) |
| `metAt: number \| null` | when she was met properly |
| `momentAt: number \| null` | when her last moment posted; pacing counts from it |
| `checkedAt: number \| null` | the last moment time considered, the same cursor idea as letters' `mail.checkedAt` |
| `lastMoment: string \| null` | the id of the last moment line, so the same line never plays twice in a row |
| `given: SiofraGiftId[]` | gifts given, each once, in order (ruling S2: `gifts` already holds the cat and the dog) |
| `met: boolean` | whether she has said a tap line, as Barnaby's `met` |
| `heard`, `said` | her tap pool, as Barnaby's |

## The meeting

- **She's met when all of these hold:**
  1. Barnaby has settled (`barnabySettled`);
  2. the meadow is owned;
  3. it's at least the local day after Barnaby was found;
  4. the player has said hello to the hare at least once.
- **When:** she's met at the first local 06:00 after all four hold, the same morning rhythm as Barnaby's find, using the shared stamping helper.
- **On meeting:**
  - one toast: "A girl with her shoes on the wrong feet is asking the way.";
  - one `character` journal line with the lore's metProperly title and detail.
- **Late meetings:** if that morning passes while the game is closed, the meeting leads the welcome-back recap instead of a toast, as Barnaby's late find does.

## Moments

A moment is one journal line: a glimpse, a shape, the crops-left-standing notice, or a gift.

**Pacing:**
- **The post time:** moments post at 18:00 local. Several lines narrate part of a day ("all morning", "by supper", "by teatime"), and the lore asks for those to post late in the day.
- **The gap:** after a moment, the next can come 2 or 3 local days later. Which of the two is a repeatable pick from the moment's date, so tests can pin it.
- **Shivers:** never straight after one. If a shiver happened in the 15 minutes before a post time, that moment waits until those 15 minutes are up the same evening.
- **Time away:** at most one moment waits for a returning player (the letters rule, using `seenAt`), dated the latest 18:00 crossed, and the gap counts from it.
- **Nothing to post:** nothing happens, and nothing says so.
- **Daylight saving:** local dates and hours use the same calendar arithmetic as letters, never 24 hours in milliseconds.

**The pool at a post time:**
- **Before she's met:** the glimpses (4), and the shapes (8) once the first glimpse has posted. These start only after the hare's first visit, and never while the hare is waiting to be noticed. They're written as `visitor` lines, because a `character` line would name her early.
- **After she's met:** the shapes (8), the crops-left-standing notice, and the gifts she hasn't given yet. Glimpses stop. These are written as `character` lines.
- **Gates:**
  - each shape plays only when the island has what it needs (sheep, a scarecrow, fruit trees, chickens, or nothing);
  - the notice's ripe-crops lines need a ripe crop not yet harvested, and its resting-soil line needs a plot showing resting soil, at the post time.
- **The pick:** a repeatable pick among the eligible lines, never the same line as last time. Shapes, glimpses and notice lines may repeat (the lore's pools repeat). Each gift is given once.

**Gifts:**
- The lore's five: the humming pebble, the warm feather, the four-leaf clover, the dandelion clock and the rain shell.
- They're cosmetic keepsakes, stored in `characters.siofra.given`, apart from `keepsakes.hare`, so the clover sprig's tally never takes them in.
- Each is written as its gift line, and is listed by name on her almanac card, never with a number.

**Shapes in the past tense:** four shapes (sheep, goat, duck, chicken) use the lore's past-tense revisions from "Fit with what's shipped", so nothing claims an animal is there right now when the world can't show it. The other four are already in the past tense.

## Her figure and taps

- **Placement:** a placeholder figure of her as herself, at one spot on the meadow's field edge, near where the hare sits.
  - The plan picks the spot with the placement tests Barnaby's camp uses: clear of paths, trees and blockers, and visible from the default camera.
  - It shows only once she's met.
- **Only one of her:** while the hare is present, the figure is hidden.
- **Tapping:**
  - plays her tap pool through the shared helper: her 12 tap lines plus her 3 naps, in any order from the first tap, never the same line twice running;
  - the second nap ("The cat's windowsill") needs the cat;
  - each line shows as a floating label for about 4 seconds, and is never written to the journal.
- **The placeholder:** a simple procedural figure in code, in the game's placeholder style. The art session's model replaces it later.

## The hare once she's met

- **The visitor stays as it is:** same arrival line, same says lines, same 36-hour return, same clover sprig.
- **Her name on it:** a separate hover-name lookup returns "Síofra" once she's met, and "Brown hare" before. Everything that reads the hare's name reads it through that lookup:
  - the hover label;
  - the almanac card's title;
  - the Say hello button;
  - the keepsake line.
- **Wording once she's met:**
  - the keepsake line reads "Síofra left a clover sprig.";
  - the Say hello button reads "Say hello to Síofra".
  
  There's no "the", so "the síofra" never appears. Before she's met, everything reads exactly as now.
- **`VISITORS.hare.name`** stays "Brown hare".

## The "í" check

Before her name ships, check that the UI font draws "í" (U+00ED), with no fallback glyph. Pin it with the cheapest reliable test the plan can find, for example the bundled font's `unicode-range` or character map. If the font can't draw it, stop and report; don't ship the name.

## Knock-on: Barnaby's letter about her

- On `feat/letters`, the `siofraMet` gate is always false.
- It becomes true once she's met **and** the post being considered is at least 3 local days after the meeting. The lore holds `siofra-readings` "a few days after she's met", so the note never lands the morning after the meeting.
- This edits `needMet` in `src/game/systems/mail.ts`, so it's built after letters merges.

## Copy

- **The source:** every line comes from `docs/lore/VOICES.md` "The púca", "Game lines", word for word, with the four past-tense shape revisions from "Ready for the brainstorm".
- **Limits:** titles ≤ 160 characters, details ≤ 300, the toast ≤ 60, tap lines ≤ 80.
- **The lore session's review:** once this spec is approved, the lore session gets the final slot list and limits, fits her lines to them, and reviews them, as it did for Barnaby. `content/siofra.ts` is the one file that changes for wording.

## Tests

**Unit, red first:**
- **The meeting:**
  - each of the four conditions holds it back;
  - met at the next 06:00 once all four hold;
  - never the morning Barnaby is found;
  - a late meeting leads the recap;
  - one toast only.
- **Moments:**
  - posted at 18:00 local, 2–3 days apart;
  - never within 15 minutes after a shiver;
  - one waits after an absence, not several;
  - nothing posted with nothing eligible;
  - glimpses only after the hare's first visit and before the meeting, never while the hare is waiting;
  - shapes gated by what's owned;
  - the notice only on ripe crops or resting soil;
  - each gift once;
  - never the same line twice running;
  - `visitor` lines before the meeting, `character` after;
  - correct across a daylight-saving change.
- **Taps:**
  - her pool plays all 15 lines, with no fixed first and no back-to-back repeat;
  - nap 2 waits for the cat;
  - Barnaby's tap tests are unchanged.
- **The hare:**
  - the name lookup, the keepsake line and the Say hello label, before and after the meeting;
  - `keepsakes.hare` never counts her gifts.
- **Save:** her slice sanitizes and round-trips, and an old save without it loads with her not met.
- **Content:** every line within its limit, and no counts.
- **The glyph check.**

**e2e (`e2e/siofra.spec.ts`):**
1. Seed Barnaby settled, the meadow owned and the hare already greeted once, then cross the next 06:00.
2. The toast and the journal line appear.
3. Tap her figure: a line shows and isn't written to the journal.
4. Cross the next 18:00 post two or three days later: a moment's line is in the journal.
5. With the hare present: her figure is hidden, and the Say hello button reads "Say hello to Síofra".

The spec runs in CI (desktop), and `npm run e2e:mobile` runs locally before pushing.

## Risks

- **Part-of-day lines:** posting at 18:00 suits them. A player who only opens the game in the morning sees yesterday's moment in the recap, which reads fine in the past tense.
- **The placeholder figure** will look rough until the art session's model arrives. The art bible's sign-off may gate that model.
- **The shared pick for shivers isn't built.** Barnaby keeps remarking alone, which is correct until Fin.
- **"í" in the font:** if the font lacks it, the name can't ship until the font is fixed.
