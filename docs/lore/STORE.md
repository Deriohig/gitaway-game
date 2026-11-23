# Gitaway: store page copy (Draft)

These are drafts for the store page, not canon. They're built from the bible's pitch drafts (`BIBLE.md` §1, "Pitch drafts (Idea)"). Q1 is decided: like the interface, the store page may state the mechanics plainly (`BIBLE.md` §8 and §11). Story text still never explains the island, and nothing here says what the island is.

Every feature claim was checked against `origin/main` at a1fe8bd (2026-10-23). The Barnaby markers were updated at 01f4c43 (2026-10-24), after PR #45 put him in the game; nothing else was rechecked. Anything that isn't on `main` yet is marked *(needs: <what> before launch)*.

---

## 1. Tagline

**In game** (`README.md:3`, `src/ui/Welcome.tsx`). Keep it.

> Commit code. Escape to the countryside.

## 2. One-line pitches

The author chose the lead on 2026-10-24. The count follows each line.

1. **The lead (decided 2026-10-24):** the bible's line, without "there to start again":

   > A cosy idle game about a magical island that grows while you work, and the strangers from other worlds who turn up.

   115 characters. Kept for reference: the bible's full line (136 characters) and the trim without "from other worlds" (118).

   > A cosy idle game about a magical island that grows while you work, and the strangers from other worlds who turn up there to start again.

   > A cosy idle game about a magical island that grows while you work, and the strangers who turn up there to start again.

2. The mechanics and the promise:

   > An idle farm where your work sessions, tasks and commits help a small island grow. Nothing withers when you step away.

   118 characters.

3. The retirement joke, from the README:

   > An idle farming game for developers: the farm you keep promising to retire to, growing quietly beside your workday.

   115 characters.

## 3. Short description

At most 300 characters each (the Steam limit). Counted by script, in characters, with the accents as one character each.

**A. Story first**

> You remember a long day, a bright screen, and then nothing. You wake on a small island above a sea of clouds. It grows while you work: every session, logged task and commit helps it along, and nothing withers when you step away. A wizard, a shape-shifting púca and a skeleton turn up too.

288 characters. *(needs: Síofra and Fin in game before launch)*

**B. The game first** (true on `main` today)

> An idle farming game that sits beside your workday. Clock in for work sessions, log what you finish and let your commits count, and a small island above the clouds slowly becomes the farm you keep promising to retire to. Crops ripen while the game is closed. Nothing withers when you step away.

294 characters.

## 4. Long description ("About this game")

Built on the bible's store blurb, keeping its opening line. 258 words, or 277 with the headings.

### Above the clouds

You remember a long day, a bright screen, and then nothing.

You wake on a small island floating above a sea of clouds. It grows. Nobody can say why.

### Look after it while you work

Clock in when you start working. Work sessions, the tasks you log and, in the desktop app, your own Git commits all help the island along. Spend what they earn on seeds, flower beds, animals and a windmill, and slowly the place becomes the farm you keep promising to retire to.

Crops ripen even while the game is closed. Hens lay, bees fill jars (they never ask for standups), and what they make waits for you. Claim new land and it rises out of the clouds and docks against the farm. It's a miniature countryside diorama: drag to turn it, zoom in close.

### Nothing withers

Nothing decays, spoils or expires, and there are no streaks. Take a break, a weekend, or a fortnight in the sun. Gitaway is meant to sit beside your workday: quiet, slow, and happy to be ignored for hours.

### Others turn up too

A wizard whose spell ran backwards. A púca from Irish folklore, often a hare, sometimes a girl and sometimes a goat on your roof. A skeleton who has finally got round to fishing. They have errands of their own, and none of them asks anything of you. Old pages and half-buried stones hint at everyone who came before.

*(needs: Síofra in person, Fin, the almanac's old pages and the restorations before launch)*

### Kept on your device

There's no account and no analytics, and your farm stays on your device. Commit tracking counts your new commits and never sees your code.

Commit code. Escape to the countryside.

## 5. Feature bullets

- **It grows while you work.** Clock in for a work session and log what you finish. In the desktop app, your own Git commits count too. All of it helps the island grow.
- **The farm keeps going on its own.** Crops ripen in real time, even while the game is closed. Hens lay, sheep grow fleeces, bees fill jars and the woodshed stacks logs, and whatever they make waits until you collect it.
- **Land from the clouds.** Claim a meadow, a forest grove, a lighthouse islet, a wetland, a highland and more. Each piece rises out of the clouds and docks against the farm.
- **Nothing withers.** Nothing decays, spoils or expires. No streaks, no wilting, no feeding. Take a holiday.
- **Beside your workday.** Lo-fi music by Freaq Studios plays while a session runs, and a switch turns it off. The light follows your clock, from a cool morning to a blue night with lit windows and fireflies.
- **Private by design.** No account and no analytics. Your farm stays on your device, and commit tracking reads only how many commits there are and when, never your code.
- **Neighbours with errands of their own.** A wizard, a púca and a skeleton turn up, and none of them asks anything of you. *(needs: Síofra and Fin in game before launch)*

Where each is true on `main`:

| Bullet | Evidence on `origin/main` |
|---|---|
| It grows while you work | `README.md` "How to play" 1 and 2; `src/ui/SessionCard.tsx`; `e2e/work.spec.ts`; commits: `src/ui/panels/settings/Commits.tsx`, `e2e/git.spec.ts` |
| The farm keeps going on its own | `src/game/content/yields.ts`; `README.md` "How to play" 3 and 4; `e2e/yields.spec.ts` |
| Land from the clouds | `src/game/config.ts` (the land items); `src/ui/panels/FarmPanel.tsx:52`; `src/world/Rising.tsx`; `e2e/land.spec.ts` |
| Nothing withers | `README.md` "Fair by design"; `docs/idle-loop.md` G1 to G9; `src/ui/Tutorial.tsx:10` |
| Beside your workday | `src/audio/music.ts`; `src/ui/panels/settings/General.tsx`; `e2e/music.spec.ts` (merged in #42); `src/world/DayCycle.tsx`; `src/world/Fireflies.tsx` |
| Private by design | `README.md` "Privacy" and "Commit tracking in the desktop app"; `src-tauri/crates/git-activity`; `src/ui/Welcome.tsx` |
| Neighbours with errands of their own | Partly on `main`. Barnaby is live (PR #45, `src/game/content/barnaby.ts`); the Brown hare visitor (her first appearance) is live (`src/game/content/visitors.ts`); Fin has no code; fishing is switched off (`src/game/features.ts`) |

## 6. The cast, one line each

- **Barnaby Wick**, a wizard whose spell from a very silly old book ran backwards. All he wanted was peace and quiet, so naturally he has started a research programme.
- **Síofra** (SHEE-fra), a púca from Irish folklore: often a hare, sometimes a girl, sometimes a goat on your roof, and usually a season late for something. *(needs: Síofra in person before launch)*
- **Fin**, like the fishy bit: a skeleton who has finally got round to fishing, and who will tell you about barbels for as long as you let him. *(needs: Fin and fishing in game before launch)*

## 7. Press blurb

> Gitaway is a cosy idle farming game for developers. You wake on a small island above a sea of clouds, and your work sessions, tasks and commits help it grow. Nothing withers when you step away. A wizard, a púca and a skeleton fisherman turn up, each with errands of their own.

52 words. *(needs: Síofra and Fin in game before launch)*

## 8. Notes for the author

- **Síofra and the hare (decided 2026-10-24).** The author chose to say it, so sections 4 and 6 call her "often a hare". That tells players the Brown hare on the meadow is her, which `CAST.md` §4 otherwise keeps as a quiet hint in the game. It isn't one of the §11 mysteries.
- **Her shapes are Ideas.** The goat on the roof is one of `CAST.md` §4's Idea shapes, as it was in the bible's blurb. If it isn't built, swap in a shape that is.
- **Fin (a spoiler call).** Only "finally got round to fishing" touches his past. I left out "prepared, not practised" (he knows everything and has hardly ever fished): next to "finally" it points too close to the saving and the waiting. The barbels are present-day affection, nothing more.
- **Barnaby (a spoiler call).** Only "ran backwards", "a very silly old book" and "peace and quiet" (CAST §3, "came for peace"). Nothing about the rumours, his secret or the previous mage, and nothing says who reversed the spell or whether on purpose.
- **The island.** Nothing says what it is or why it grows: "It grows. Nobody can say why." The mechanics are stated plainly instead, in the interface's voice ("help it grow", "help it along"), as Q1 allows. The retirement line is the README's own, and Q2 leans into it; nothing points at Fin turning it around.
- **"Cosy" and Steam's tag.** The copy uses "cosy", the house style. Steam's tag uses the American spelling, with a z, and its tag names aren't ours to change, so apply the tag as it stands. It doesn't change the copy. (This doc doesn't spell the tag out because the voice checker flags it.)
- **Pronunciation.** The cast line gives "SHEE-fra" for press and streamers. The game itself still teaches it through Barnaby's spellings (`CAST.md` §4, Idea). Check that the store page's font has the "í" and "ú".
- **What this depends on that isn't shipped:**
  - Barnaby: live on `main` since PR #45 (2026-10-24), and so is the shiver in the grass and trees. The copy doesn't mention the shiver yet; it could now.
  - Síofra in person: the Brown hare visitor (her first appearance) is live.
  - Fin and fishing: `idle/b6-fishing` is a local branch, not merged, and `fishing` is off in `src/game/features.ts`. The wetland's fish on `main` are an idle yield ("fish can be caught"), not Fin's fishing, so no bullet claims fishing.
  - The almanac's old pages (`almanac` is off) and the old stones (`restorations` and `biomes` are off): the last sentence of "Others turn up too".
  - Letters: on the unmerged `idle/mail`. The copy doesn't mention them.
  - The tagline, pitches 2 and 3, short description B and six of the seven bullets are true on `main` today, so there's a launch-safe set if the characters slip. Pitch 1's "strangers" is story framing, but it still leans on them.
  - Restorations, when they turn on, make the wetland and highland wait on restored bundles (`requiresBundles` in `src/game/config.ts`). "In any order" was left out of the land bullet for that reason. `README.md` and `FarmPanel.tsx` say it today, so put it back only if the lands stay open without restorations.
- **Visitors.** On `main` all 22 wild visitors are still live (`visitors` is on), though the lore drops all but the Brown hare. The copy doesn't mention visitors, so it holds either way.
- **Commits are desktop only.** In a browser, commit tracking says "Desktop app only". Pitch 2, both short descriptions, the press blurb and the two privacy lines (the long description's "Kept on your device" and the "Private by design" bullet) mention commits without the qualifier. If any listing offers the web build, add "in the desktop app" to each. If the store sells only the desktop app, delete "in the desktop app" from the long description's "Look after it while you work" and from the first bullet. The tagline is a slogan and stays as it is.
- **The journal is live but not in the copy.** Its short story lines are on `main` (`journal` is on). It could replace a bullet if you'd like the voice on the page.
- **Platforms are left out.** The repo builds a Windows installer, Mac disk images and a static web build, but nothing confirms which of them are store platforms.
- **Numbers are left out.** No counts of land, crops or levels, no grow times, no "about two weeks". The economy is still being tuned with `npm run balance`. Add them back if they're fixed at launch.
- **The long description and the bullets overlap.** Each is written to stand alone. If both go in "About this game", keep the story sections ("Above the clouds", "Others turn up too") and let the bullets carry the mechanics; otherwise use the bullets off Steam (a press kit, an itch.io page).
