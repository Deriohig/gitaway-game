# Letters: Barnaby's field notes

**Status:** approved by the owner on 2026-10-24.
**Branch:** `feat/letters`.
**Roadmap:** B4 in `docs/idle-loop.md`, reshaped by the lore decisions below.

## Goal

Barnaby Wick's ten field notes reach the player as letters. They arrive in the morning post every few days once he has settled on the island, wait in Journal → Letters to be read whenever the player likes, and stay there afterwards. The notes are unnumbered and never counted. Nothing says one is waiting or missing, and nothing says the set has run out.

## Decided

**The owner, on 2026-10-24:**
- **Arrival:** a quiet journal line plus an unread seal on the Letters tab, with no toast.
- **Time away:** at most one letter waits for a returning player.
- **Switch:** `letters` ships switched on, alongside Barnaby.
- **Build:** on main's empty letters skeleton, not by reviving the paused `idle/mail` branch.

**The lore canon** (`docs/lore/CAST.md` C4 and C10, `docs/lore/BIBLE.md` §4.7, `docs/lore/VOICES.md` "Field notes, the full set" and "How the pools fit together"):
- Barnaby's field notes come as letters, and they're unnumbered.
- **No counts** of finds, clues, relics or progress, anywhere.
- **The five animal residents are cut,** along with their letters and the level-5 journal line "A hedgehog in a postie's cap was seen on the path." The residents system "could carry the three central characters instead", and that's the game session's call. This spec makes the call: letters stay, and the residents go.
- **Pacing:**
  - the first note comes the morning after Barnaby has settled;
  - after that, one every few days, picked at random from the notes whose gates are met;
  - a follow-up comes no sooner than two days after the note it follows;
  - each note is sent once;
  - when nothing is unlocked, nothing happens and nothing says so.
- **Only the three characters' arrivals carry a toast.**
- **Nothing piles up for a player's return.** That's the oddities' rule. The owner's time-away answer applies it to letters as "at most one letter waits".

**Where this differs from the lore's letters plan** (VOICES.md "Letters: who writes, and when", Draft, in lore PR #58). Each of that plan's shared rules is tagged Idea, and the owner's answers above decide two of them differently:
- **Toast:** the plan suggests keeping one gentle toast, "A letter from Barnaby". The owner chose no toast: the journal line and the seal instead.
- **Time away:** the plan suggests skipping a note's turn that falls on a closed day, so the next note comes a few days after the player is back. The owner chose that one letter waits for the return, and the next comes a few days after it.

Everything else matches:
- the field notes' schedule and gates;
- sent once and kept;
- nothing said when the post stops;
- the letter view's needs: each line on its own, a bold title without asterisks, and the sender's own sign-off;
- the residents cut.

The plan's one-letter-a-day rule holds automatically, because the field notes are 3 days apart. Its single letters (Barnaby's "Day three", Síofra's and Fin's) are out of scope here. When they come, they bring the one-a-day rule, the "single letters first" order, and a sign-off per letter, since Barnaby signs "Barnaby Wick" on "Day three".

## Scope

**In:**
- the letters system: content, delivery, the save, the journal line and the Letters tab;
- Barnaby's ten field notes;
- removing the cut residents;
- turning `letters` on.

**Out, for later:**
- the weekly postcard (B4);
- letters from Síofra or Fin, and Barnaby's "Day three" letter. They're drafted in VOICES.md, but have no trigger or cadence yet;
- linking a journal line to its letter;
- "Mark all read".

## Content: `src/game/content/letters.ts`

The table is rewritten and holds the ten notes. The text comes word for word from `docs/lore/VOICES.md` "Field notes, the full set", which matches `voice-drafts/barnaby-field-notes.json`.

```ts
export type LetterId =
  | 'bell' | 'bell-rung-back' | 'cloud-sea' | 'cloud-sea-thursday' | 'grove-key'
  | 'grove-tuning-fork' | 'docking-height' | 'siofra-readings' | 'fin' | 'ruin-stairs'

export type LetterSender = 'barnaby'

export type LetterNeed = 'wetland' | 'islet' | 'grove' | 'twoPiecesDocked' | 'siofraMet' | 'finOnJetty' | 'inRuin'

export interface LetterDef {
  id: LetterId
  from: LetterSender
  needs: readonly LetterNeed[]
  /** The note that must have been sent first, at least FOLLOW_UP_DAYS earlier. */
  after: LetterId | null
  /** "Field note: the bell under the wetland." */
  title: string
  established: readonly string[]
  notEstablished: string
  next: string
}
```

- **Senders:** `LETTER_SENDERS: Record<LetterSender, { name: string; signOff: string }>` gives Barnaby the name "Barnaby" and the sign-off "Barnaby". The salutation is `Dear {farm},` for every letter, and `{farm}` is replaced with the farm's name.
- **The notes are stored as their parts, not as a text body.** The layout comes from the parts, so each line stands alone and the title is bold without any Markdown in the data.
- **"Sheefra"** in `siofra-readings` is spelled that way on purpose: Barnaby spells her name differently every time. Nothing in the set uses "í".
- **`LETTERS_PER_DAY` and `LetterTrigger` go.** They were for the residents.

## Gates

A note is unlocked when every item in its `needs` holds and its `after` note, if any, was sent at least `FOLLOW_UP_DAYS` (2) local days before the post being considered.

| need | holds when |
|---|---|
| `wetland`, `islet`, `grove` | that land piece is owned (`state.owned[piece] > 0`) |
| `twoPiecesDocked` | at least two pieces of new land are owned (`landOwned(state) >= 2`) |
| `inRuin` | `characters.barnaby.stage === 'ruin'`, including the case where he went straight to the ruin |
| `siofraMet` | Síofra has been met, and the post is at least 3 local days after the meeting (`SIOFRA_LETTER_DAYS`); see `2026-10-25-siofra-design.md`, Knock-on |
| `finOnJetty` | always false, until Fin is built |

The game state has no separate "docked" flag (the rise is drawn by the world), so owned counts as docked.

## Delivery: `advanceMail` in `src/game/systems/mail.ts`

**Constants:**
- `POST_HOUR = 8`: post comes at 08:00 local time;
- `LETTER_GAP_DAYS = 3`;
- `FOLLOW_UP_DAYS = 2`.

**Rules:**
1. **Nothing before Barnaby settles.** The settle time is the moment `barnabySettled` first becomes true: `foundAt + SETTLE_MS` or `movedAt`, whichever is earlier. With the `characters` switch off he never settles, so no letters come.
2. **When letters are due:**
   - the first is due at 08:00 local on the day after the settle time's local date;
   - each later one is due at 08:00 local, `LETTER_GAP_DAYS` local days after the previous letter's date.
   
   These come from `mail.letters` and Barnaby's own fields, so no new due time is saved.
3. **Letters arrive only on a post time.** A post time is 08:00 local, and a letter is delivered at one only if the post time is on or after the due time and the advance crosses it, from the previous advance up to now. If no note is unlocked at that post time, nothing is delivered, and the next post time is tried. So a gate met at 15:00 brings its letter at 08:00 the next morning, never stamped earlier than the gate.
4. **At most one letter waits for a return.** However long the game was closed, and however catch-up splits the span, at most one letter arrives with a time after `seenAt`, the moment the player last looked. Its time is the latest crossed post time, and the next gap counts from it. `seenAt` only moves on while the page is visible, so a game left open but hidden also holds at most one letter.
5. **Picking a note:** at random among the unlocked notes not yet sent.
   - The pick is deterministic: a pure function of the post time and the notes already sent, such as a hash of the post's local date, so tests can pin it.
   - A note that's already in `mail.letters` is never sent again.
6. **Delivering a letter:**
   - add `{ id, at: postTime, read: false }` to `mail.letters`;
   - write a journal line, kind `letter`, titled "A letter from Barnaby.", at the post time; it carries no detail;
   - no toast, and no notice that asks for attention;
   - the welcome-back recap already gathers the `letter` kind.
7. **When the set is used up,** or every remaining note is locked, nothing happens and nothing says so.

**Time edge cases:**
- **Daylight-saving days:** compute local dates and 08:00 with the codebase's existing local-date helpers (`localDateKey` and its kin), not by adding 24 hours.
- **A clock that moves backwards** delivers nothing new and never removes a letter.

## Save

- **`mail.letters: { id, at, read }[]` keeps its shape.** `sanitizeMail` keeps only known `LetterId`s, the first copy of each, with a valid time.
- **`state.residents` is removed.** Old saves that carry it simply lose it, with no error.
- **No new fields:**
  - the due time comes from the letters and from Barnaby's fields;
  - "crossed this advance" uses the time the state already records for its last advance;
  - "after `seenAt`" uses the existing `seenAt`.
  
  If the plan finds one of those isn't available, it adds the smallest field that is and says so.

## The Letters tab: `src/ui/panels/journal/LettersTab.tsx`

- **When it shows:** while `letters` is on **and** at least one letter has arrived. `journalTabs()` gets that condition, so nobody sees an empty tab that hints something is coming.
- **The seal on the tab:**
  - while any letter is unread, the tab's label carries a small seal mark;
  - it's never a number;
  - its accessible name is "Letters, unread".
- **The list:**
  - unread letters first, then newest first;
  - each row shows the sender's name, the note's title and when it came ("Today", "Yesterday", or the date in en-GB form, such as "24 October");
  - unread rows carry the seal and an accessible name that starts with "Unread:".
- **An opened letter is laid out as drafted:**
  - "Dear {farm}," on its own line;
  - the title in bold;
  - each "Established: …" line, then "Not established: …", then "Next: …", each on its own line;
  - the sign-off, "Barnaby".
- **Behaviour:**
  - opening a letter marks it read, and it stays readable forever;
  - a "‹ All letters" link goes back to the list;
  - focus moves to the letter's title on opening.
- **Style:** `src/styles/features/mail.css`, matching the journal's paper look. The residents' styles go.

## Removing the residents

These go:
- `src/game/content/residents.ts`;
- `src/world/features/Residents.tsx` and its mount in `src/world/features/index.tsx`;
- the residents' places in `src/world/places/mail.ts` (the whole file, unless something else uses it);
- the `residents` switch in `src/game/features.ts`;
- `state.residents` and its sanitizing;
- the level-5 ladder line "A hedgehog in a postie's cap was seen on the path." in `src/game/systems/journal.ts`;
- `residents` from the `letter` kind's switches and from the mail step's switches in `advance.ts`;
- every test assertion that names the residents.

**Two restoration lines that name the cut residents** change too. They're behind `restorations`, which is off, and the wording comes from the lore session:
- `keeperCottage.change` becomes "A cottage by the lighthouse, with a light in the window.";
- `reedBeds.change` becomes "Tall reed beds along the boardwalk.".

**Also update:**
- `docs/idle-loop.md` B4, so it says the residents are cut and letters carry the characters' field notes;
- the file map's "mail" lane.

## Three live text fixes (one separate commit)

These come from the lore session's canon pass (`voice-drafts/canon-pass-2026-10-24.md`, findings 1 to 3). The owner approved including them in this PR on 2026-10-24.

1. **`src/game/systems/visitors.ts`, `FIRST_VISITOR_STORY`:** "The first wild visitor has been and gone. Word of the island is getting about." becomes "The hare has been and gone. It was in no hurry."
2. **`src/ui/panels/journal/almanac/VisitorsPage.tsx`, the empty-page lines:**
   - "Nobody is visiting just now. Wild things come by in their own time." becomes "Nobody is visiting just now. The hare comes by now and then.";
   - "Wild visitors start coming by once the farm reaches level ${UNLOCKS.visitors}." becomes "The hare starts coming by once the farm reaches level ${UNLOCKS.visitors}.".
3. **`src/ui/panels/progress/CottageCard.tsx`:** it stays a stand-in that no longer reads as a finish line at level 10.
   - **Keep the section title "Retirement plan":** `e2e/build.spec.ts` expects it.
   - **aria-label:** "Progress to Islander".
   - **Caption:** "{n}% of the way to becoming an Islander.", and "You're an Islander." at 100%.
   - **"You made it. Feet up, kettle on." is removed.** It moves to the cottage's Home when the cottage ships; see the pending-copy notes.

Every test that asserts the old text changes with it.

## Switch

`letters: true` in `src/game/features.ts`. The tests that read the switch list are updated to match.

## Tests

**Unit tests, written to fail first:**
- **Delivery:**
  - no letter before Barnaby settles;
  - the first letter at 08:00 on the morning after he settles, both after 3 days and on moving into the ruin, including the case where he went straight to the ruin;
  - a 3-day gap between letters;
  - a follow-up never within 2 days of the note it follows;
  - every gate in the table;
  - nothing unlocked, so nothing delivered, and the letter comes the morning after a gate is met, never stamped before it;
  - a long absence delivers exactly one letter, dated the latest post time, even when catch-up runs in steps;
  - each note is sent once, and the set running out is silent;
  - the pick is repeatable for the same inputs;
  - a daylight-saving change still gives 08:00 local;
  - a backwards clock delivers nothing new.
- **Content:**
  - the ten ids;
  - every note under 90 words, counting the salutation, the parts and the sign-off;
  - the text matches the lore drafts word for word;
  - no `**` and no stray newlines in any part;
  - every `after` names a real note.
- **The journal:** one "A letter from Barnaby." line per letter, kind `letter`, at the post time, with no toast.
- **The save:**
  - unknown ids and duplicates are dropped;
  - an old save with `residents` loads cleanly without it;
  - `mail` survives a save and a load.
- **The layout,** as a component test or e2e: separate lines, a bold title, the farm's name in the salutation, no asterisks.

**e2e (`e2e/letters.spec.ts`), the happy path:**
1. Use the existing dev hooks to bring Barnaby to settled, then cross the next 08:00.
2. The journal shows "A letter from Barnaby.".
3. Journal → Letters appears with the seal.
4. Opening the letter shows its title and lines, and the seal is gone.
5. After a reload, the letter is still there and still read.

The spec runs in CI (desktop), and `npm run e2e:mobile` runs locally before pushing.

**Existing tests:** feature, journal, save and economy tests that name the residents or the hedgehog line are updated. No other e2e should change, because the tab stays hidden until a letter arrives.

## Risks and things to watch

- **Barnaby's dev hooks:** the e2e needs a way to reach "settled" and cross 08:00 quickly. If the existing hooks can't, the plan adds the smallest dev-only hook.
- **Draft text:** VOICES.md marks the notes "Draft". They ship as written, and the lore session can revise the wording in `content/letters.ts` at any time without touching the logic.
- **Two notes wait:** `siofra-readings` and `fin` can't arrive until Síofra and Fin exist. When they're built, the lore suggests holding `siofra-readings` a few days after she's met; that's for the Síofra spec.
- **"Thursday":** the journal already shows weekdays in its day headings, so on 2026-10-25 the owner chose wording that's true on any day ("by Thursday… give or take a Thursday"). The grove notes still assume the piece keeps the name "grove".
