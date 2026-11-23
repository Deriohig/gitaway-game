# Gitaway: voice drafts

**Drafts, not canon.** These were first written on 2026-10-22 to test the voices of the three central characters (`CAST.md`), and revised after the author's notes. On 2026-10-23 the narrator's small oddities, Barnaby's full set of field notes and a closing section on how the pools fit together were added. Nothing here is approved game text.

- Names (decided 2026-10-22): **Barnaby Wick** (the wizard), **Síofra** (the púca, said SHEE-fra) and **Finlay, "Fin"** (the skeleton). Most early lines still say "the wizard" or "the skeleton", because the player meets them before learning their names.
- `{farm}` and `{n}` are template slots, as in the existing letters.
- Letters stay under 90 words. Journal lines are one or two sentences, in the A Dark Room manner the journal already uses.

Each group ends with a note on what it's testing.

---

## The welcome, and the echo (Decided 2026-10-22, bible §8)

### The welcome's one line about the collapse

> You remember a long day, a bright screen, and then nothing.

After it, the existing welcome carries on as it is. The line is never revisited.

### The echo

The island shivers whenever work is done somewhere. The characters notice and wonder; the player knows it's their commits.

- *(journal, existing; keep)* A commit landed, and the island felt it faintly, like a ferry docking.
- *(Barnaby)* Every so often the whole island shivers. I've tried to time it. It keeps office hours.
- *(Barnaby, in a letter. A voice sample only, not game text: decided 2026-10-24, since his shipped shiver line already uses the chart joke.)* Shiver, 10:42. Shiver, 10:51. Shiver, 11:30, a big one. I've drawn a chart. The chart looks like somebody's very productive morning. Not mine.
- *(Síofra)* Someone, somewhere, is working very hard. Good for them. I'm having a lie-down.
- *(Fin)* Felt that? The whole jetty hummed. The fish bite better after. I've no idea why, and I've decided not to ask.

**Rule:** they only ever remark on the shiver when it happens, never on its absence. No "it's been quiet lately".

**Note:** these lines are the characters' guesses ("somebody's very productive morning", "someone, somewhere"). None of them ever *knows*. The author approved this framing, with these sample lines, on 2026-10-22.

### The cottage (Decided 2026-10-22, bible Q2)

- *(stage 1, "Pegged out")* Yours already. It just needs walls.
- *(the finale, "Home")* Retired, happily. Kettle on, feet up. Stay as long as you like.

The second line merges the old level-10 card's "You made it. Feet up, kettle on." with the cottage's own Home line.

---

## The island's small oddities

Narrator-only journal lines for bible §12, I2: small things on the island that nobody can account for, which become the wizard's raw material. They're written to bible §3's rules for the island: behaviour, never intent, and every line open to two readings.

### Game lines, for a future game spec (Draft)

The game has no pool like this yet. These lines are ready for when it does. Titles are checked at 160 characters or fewer and details at 300 or fewer. Build from this subsection: it's the source of truth for these lines.

| id | needs | Title | Detail |
|---|---|---|---|
| meadow-edge | meadow | All morning, the grass along the meadow's edge leaned out over the clouds. By teatime it was leaning back in, neat as combed hair. | |
| grove-seed | grove | A winged seed came spinning down in the grove and took most of the morning to land. | |
| islet-cloud | islet | Out on the islet, a cloud no bigger than a wheelbarrow settled into a hollow in the rocks. | The rest drifted by all day. That one stayed put. |
| wetland-sky | wetland | The still water in the wetland reflected the sky a shade bluer than the sky actually was. | It was a perfectly good sky, too. |
| orchard-mist | orchardLand | There was mist in the orchard first thing, lying in neat rows between the trees, like a second crop. | |
| glade-cone | cottageLand | In the glade, a pine cone rolled a little way uphill before it stopped. | It's a gentle slope, but it was definitely up. |
| highland-weather | highland | Rain on the farm and sun on the highland, then the other way round. By lunch they had swapped twice more. | It came out about even. |
| first-place | any | All day, everything you looked for in the farmhouse was in the first place you looked. Even the other sock. | |
| step-wind | any | Twice in one afternoon, the wind dropped just as you sat down on the farmhouse step. Both times it got up again when you did. | |
| cat-sunlight | any | The cat slept in a patch of sunlight in the garden all afternoon. The patch hardly moved, though the sun did. | |
| chickens-facing | any | The chickens lined up along the path, facing the same way, waiting for a bus by the look of it. | Ten minutes later they turned round together. |
| hay-and-marmalade | any | For an hour after sunrise, the whole farm smelled of something you couldn't place, somewhere between hay and marmalade. | |

**Notes for the game:**
- **Pacing.** Occasional: at most one every few days, picked at random from the lines whose `needs` is met. Never on the same day as a character's journal line or letter (Barnaby's, Síofra's or Fin's), so an oddity never lands beside someone's remark and reads as the answer to it. Never on an absence: nothing fires because the player has been gone, and nothing is saved up for their return.
- **When the pool opens.** Once the first land has docked, whichever piece it is (bible §12 keys I1 and I2 off the same event). A line with a piece in `needs` joins the pool once that piece is owned; `any` lines need no piece. If no line can play, nothing happens, and nothing says so.
- **Quiet story lines.** Journal only, with no toast, like the journal's other story lines.
- **Never on a work event.** Post them on the local clock, never on a session, a task or a commit, and never straight after a shiver. Otherwise they'd read as part of the echo (bible §8), and the shiver is the only echo.
- **Repeats.** The pool repeats and plays in random order. Avoid the same line twice in a row.
- **Lines that cover part of a day.** Most narrate a stretch of one: the meadow grass (all morning, then teatime), the seed (most of the morning), the islet cloud (all day), the orchard mist (first thing), the highland (by lunch), the farmhouse search (all day), the step (one afternoon), the cat (all afternoon) and the smell (an hour after sunrise). Post these late in the day or the next morning, not the moment they're picked, and apply the pacing rules to the day of posting.
- **The cat line** needs the cat, who moves in at level 2 today. If the first land docks before then, hold that line until the cat has moved in.
- **The chickens line** needs no gate: every farm starts with two chickens (`START` in `config.ts` on `origin/main`). The wording works for the starting two or for more.
- **The highland line** has rain on the farm. While the seasons and weather feature (A5, `seasons`) is off, it plays as it is; once the game shows weather, play it only on a showery day.
- **Names.** "The glade" assumes the cottage's piece keeps its player-facing name, "Woodland glade", as on `origin/main`.
- **Nobody is needed.** No character speaks, is named or has to be on the island. The cat and the chickens are scenery, and there are no wild visitors.
- **The wizard's raw material.** A field note may one day take one of these up. None of the lines depends on that, and a note that does should leave both readings standing.

**What this tests:**
- Two readings in every line. Three of them:
  - **wetland-sky.** The sceptic: dark, still water deepens the colour of anything it reflects. The believer: the wetland is showing a different sky.
  - **step-wind.** The sceptic: a gusty afternoon, and the step is in the lee of the house. The believer: the wind drops for whoever sits there.
  - **cat-sunlight.** The sceptic: the cat shuffled along with the light in its sleep, and nobody was watching closely. The believer: the light stayed put for the cat.
- Behaviour, never intent. No line says what the island means by anything or how it feels, and none hedges a feeling with "as if".
- Wonder at a human scale: grass at an edge, a seed, a patch of sun, a smell. Nothing grand and nothing spooky.
- Humour that comes from the facts: the chickens waiting for a bus, the other sock, the weather that came out about even, hay and marmalade.
- Nothing withers, leaves for good or goes missing. Things stay put, take their time or turn up.
- Narrator only. No character, no wild visitor, and nothing about the shiver or the player's work.
- Spread across the land: one line for each piece, and five that play anywhere.
- Clear of subjects already taken: Barnaby's land lines and field notes, Síofra's shapes and gifts, Fin's pond weather, the shiver and the live journal.
- Every line stands alone and survives being seen ten times.

---

## The wizard

**Author's notes (2026-10-22):**
- Fewer bureaucracy jokes. Bureaucracy is why he left, not what he jokes about.
- One of his running jokes is the cow with trapped wind. He never tells you the full story: you can find it out on your own. It's taught at magic school, because it can have deadly consequences.

### His arrival (Decided 2026-10-22: the reversed refuge spell, found the next morning, a suspicion he keeps, camping until the highland rises, the very silly old book. The game design camps him in a lean-to beside the garden)

- *(journal, the morning he's found)* There was a man in a pointed hat asleep in the radishes this morning, holding a scrap of very old paper. He woke, looked around and said "Ah. That's unexpected," in the voice of someone for whom it was not entirely unexpected.
- *(tap, first meeting)* Barnaby Wick. At your service. Well. At my own service, mostly. It's very new.
- *(tap)* It's a summoning. You bring the thing to you. Everyone knows that. Nobody told the island.
- *(tap)* Where did I get the spell? A book. An old one. A very silly old book. Let's not.
- *(journal)* Barnaby has put up a lean-to beside the garden, "for now". He keeps looking at the far hills.
- *(journal, when the highland docks)* The wizard walked straight up to the ruin on the plateau and stood there for a long time. He came back down and said it was a perfectly ordinary ruin. Then he moved into it.

### Journal lines

- *(after he's moved into the ruin)* Barnaby says the tower smells familiar, and then won't say whose.
- The first thing the wizard did on the island was check for cows. There aren't any. He seemed very relieved, and wouldn't say why.
- The wizard measured the meadow twice and got two different answers. He seemed delighted.

### When tapped

- *(relief)* No committees. Nobody to tell me no. I may have to lie down.
- *(panic)* Where's the edge? There's always an edge. Oh. There it is. That's quite a long way down.
- *(confidence)* Leave it with me. I've handled far stranger than an island. Not much stranger. But stranger.
- I explained cloud tides to the cat. She left halfway through. Fair. It's a difficult middle section.
- Your hare was a goat this morning, and a crow at lunch. I have readings. I'd rather not discuss the readings.
- I'd love to know what's holding him together. He'd love to talk about bream. We're at an impasse.
- The new land docked at exactly the height of the old. To the inch. Islands don't do that. Well. This one does.

### The cow (a running gag, one line per tap, never finished)

- Do you know what happens when a cow gets trapped wind? No? Good. Some things you have to find out for yourself.
- They teach the cow at magic school, you know. First year. Nobody's laughing by the end of the lesson.
- I'm not saying it's the cow. I'm just saying there's a reason the barn at my old school was rebuilt. Twice.
- You looked it up, didn't you. About the cow. Don't. Well. Do. But stand well back.

### A field note (sent as a letter; decided 2026-10-22)

> Dear {farm},
>
> **Field note: the bell under the wetland.**
> Established: it rings, once, low. Green, I'm told. Sounds can't be green. I've written it down anyway.
> Established: there is nothing down there. I checked, twice, with a rope.
> Not established: what rang it.
> Next: ring it back. Dusk, longer rope.
>
> Barnaby

### The almanac's old pages (decided: they're the previous mage's)

#### The pages themselves (draft, 2026-10-22)

Six short pages, unsigned. Each makes sense alone, and they can turn up in any order, though the last works best last. They're written to bible §6: fascination, the convergence theory with a crack of doubt, freedom and ambition side by side, loving the island and leaving anyway, a hint he's in over his head, and no ending.

The "Seven Orders", the "Examining Board" and the "nine circles" are invented flavour for this draft. They aren't canon.

> **i.** Day forty, or thereabouts. The days here don't keep count, so I've stopped asking them to.
>
> Measured the meadow at dawn: eleven hundred paces. At dusk: eleven hundred and four. Nothing grew. Nothing moved. The island simply had more of itself by evening.
>
> I have been the finest practitioner of my generation for twenty years, and I have never been so happily wrong about anything.

> **ii.** Tried to file the island under the Seven Orders. It is not a Ward. It is not a Well. It is certainly not a Gate, though things do come through.
>
> It may be all seven, badly. It may be an eighth.
>
> I would pay good money to watch the Examining Board try to stamp it.

> **iii.** I think I have it.
>
> Spells spill. Every working ever cast leaves a little over, the way a kettle leaves steam. Somewhere between all the worlds, the leftovers ran together and settled, and became ground. That's what I'm standing on: everyone's spare magic.
>
> It explains the soil. It explains the arrivals.
>
> It doesn't explain why the island seems pleased when I water the beans.

> **iv.** If it happened by accident, it can be done on purpose.
>
> Nobody has ever made a place. Not a room, not a pocket, not a garden behind a door. A place, with its own weather.
>
> I could. I am almost certain I could.
>
> Imagine their faces.

> **v.** I have planted an oak by the tower. I won't see it grown.
>
> That's the trouble with a place like this. It will let you stay for ever, and never once ask you to.
>
> I'm going. Not because it isn't enough. Because I have to know whether I could make one.

> **vi.** The working is drawn. Nine circles, and a tenth I can't quite close. It will close. It has to.
>
> If anyone reads this: the beans want watering on Thursdays. The island doesn't mind if you forget.
>
> I'll

**What this tests:**
- **Each requirement from §6 has a page:** fascination (i), can't be categorised (ii), the theory and its crack (iii), ambition (iv), love and leaving (v), in over his head with no ending (vi).
- **Barnaby echoes:** the same meadow-measuring experiment (i; Barnaby "measured the meadow twice"), and the board he'd also have hated (ii). A player who knows Barnaby can notice the parallels; one who doesn't loses nothing.
- **Two readings:** "seems pleased" (iii) is hedged. The island's intent stays open.
- **The guiding theme,** in his own words and not as a lesson: "It will let you stay for ever, and never once ask you to."
- **The game's own guardrail, in the fiction:** "The island doesn't mind if you forget."
- **A quiet grace note:** the oak by the tower (v) could be why there's woodland on the plateau. Nobody says so.
- **Open questions it leaves alone:** whether the theory is right, whether he succeeded, whether he came back. "I'll" could be "I'll be back", or nothing.
- **The "accident to on purpose" link** (iv) is now canon (adopted 2026-10-22).

**Author's notes (2026-10-22):** the voice is spot on. Keep "I'll" as the last word. Keep the oak, and never point it out.

#### Discovery lines

- *(journal, Idea: pages turn up one at a time)* The almanac fell open at a page you hadn't noticed before. Someone's handwriting, small and very sure of itself.
- *(journal, when Barnaby sees them)* Barnaby borrowed the almanac, turned to the back and went very quiet. He gave it back an hour later and said the handwriting was nobody's.

### A letter

> Dear {farm},
>
> Day three. I have measured the meadow, the pond and the sky above the pond, and none of them agree with each other. Marvellous.
>
> I've also slept for eleven hours, which I haven't done since I was a boy. Nobody came to wake me. I keep expecting someone to.
>
> If you hear a bang from my lean-to tonight, that's science. If you hear two, that's also science, but stand further back.
>
> Warmly, and slightly singed,
> Barnaby Wick

*In the ruin (Decided 2026-10-25):* if he lives in the ruin when it's sent, "a bang from my lean-to tonight" becomes "a bang from the ruin tonight". Nothing else changes, so every player gets the letter.

### Game lines, for the game spec (2026-10-22)

The game session asked for these. They follow its owner-approved design:
- he's found at 06:00 the first morning after level 6;
- he camps in a lean-to beside the garden until the highland is claimed, then moves into the plateau ruin;
- he's ambient: you tap him for a line;
- he remarks on a shiver at most once a day, and only right after one.

Titles are checked at 160 characters or fewer and details at 300 or fewer. Revised on 2026-10-23 after an independent critique. Build from this subsection: the wizard's earlier lists word some of these lines differently, and a few of those depend on Síofra or Fin.

**Hover name:** Barnaby Wick

**found**
- *Toast:* Someone is asleep in the radishes.
- *Title:* There was a man in a pointed hat asleep in the radishes this morning.
- *Detail:* He was holding a scrap of very old paper. He woke, looked around and said "Ah. That's unexpected," in the voice of someone for whom it was not entirely unexpected. His name, he says, is Barnaby Wick.

**straightToRuin** (the highland was already owned when he's found)
- *Title:* One look at the highland, and Barnaby walked straight up to the ruin on the plateau.
- *Detail:* He stood there for a long time. When he came down, he said it was a perfectly ordinary ruin, and that he'd be staying in it, thank you very much.

**land** (a piece claimed after he arrives)

| Piece | Title | Detail |
|---|---|---|
| meadow | At dawn, Barnaby paced out the new meadow. At dusk he did it again, got a different answer, and seemed delighted. | He's written both answers down, side by side, and won't say which one he believes. |
| grove | The new grove creaks in a key Barnaby has never heard, and he's heard most of them. | He's going back tomorrow with a tuning fork, which he seems to have had on him all along. |
| islet | Off the new islet, Barnaby lowered a weighted string into the cloud sea. It came back up perfectly dry. | He says that's either very good news or very bad news, and that he'll know which by Thursday. |
| wetland | Barnaby waded into the new wetland and came back with wet boots and a theory. | The theory is about the reeds. He won't share it until it's better. It may never be better. |
| orchardLand | "It can't be that hard," said Barnaby, and sat down in the new orchard to watch an apple grow. | One moved, apparently. He isn't sure which way. |
| cottageLand | Even Barnaby went quiet in the new glade. | He called it the sort of place you shouldn't measure. Then he measured it anyway, looking sorry about it. |
| highland (moving into the ruin) | The new plateau has a ruin on top. Barnaby walked straight up to it and stood there for a long time. | He came back down, fetched his bedroll from the lean-to, and was moved in before dark. |

**shiver** (at most once a day, right after one)

| Fits | Title | Detail |
|---|---|---|
| big | A long, deep shiver ran through the island, like a dog settling down. | Barnaby wrote "pleased?" in his notes, crossed it out, and wrote it again. |
| big | A big shiver, the kind that walks teacups across saucers. | Barnaby added it to his chart of the shivers, which looks to him like somebody's very productive day. Not his. |
| either | The island shivered, and Barnaby's compass spun once, politely, then pointed at the kettle. | |
| big | The whole island shivered. Barnaby has started timing it. He says it keeps office hours. | |
| either | As the island shivered, Barnaby held very still and listened, in case it had more to say. | |
| small | A small shiver, barely anything. Barnaby felt it in his teeth and wrote it down. | |
| small | The island twitched, ever so slightly. Like a pond, Barnaby said, when a fish merely thinks about jumping. | |
| small | A tiny shiver ran under the garden. Barnaby put his ear to the ground and stayed there until the cat came to check on him. | |

**tap at the camp** (floating label, not written to the journal)
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

**tap at the ruin** (added to the pool once he's there)
1. It's a perfectly ordinary ruin. Stop looking at me like that.
2. It smells familiar. Old paper and rain. Never mind.
3. Two readings, two answers. I'd be worried if they agreed.
4. The stairs go up further than the tower does. I've stopped checking.
5. From up here the island looks like it's thinking. I'm not going to interrupt.

**Notes for the game:**
- **The first tap** is always camp line 1, his introduction. After that, taps are random, and line 1 stays in the pool with the rest.
- **The lean-to line** (camp 12) belongs to the camp phase only. Drop it from the pool when he moves into the ruin, and never use it in the straightToRuin case, where there's no lean-to.
- **The cow lines** work in any order, and none of them finishes the story.
- **The shiver lines** are the characters' guesses ("somebody's very productive day"), and he never knows. None of them can fire on an absence.
- **The tap lines** don't depend on Síofra or Fin being on the island yet.
- **Land lines and time:** meadow (dawn and dusk), orchard (sitting down to watch an apple grow) and highland ("before dark") imply some time passing. If the journal posts the instant a piece is claimed, post these the next morning instead, or accept the looseness.
- **Names and days:** "glade" in cottageLand assumes the piece's player-facing name is "Woodland glade", as on `origin/main`; check it. "By Thursday" (islet) is his plan, so it reads fine although the journal shows weekdays.
- **The meadow line** quietly echoes the previous mage's first old page (the same dawn-and-dusk measuring). Leave it unexplained.
- **The ruin line** "Old paper and rain" quietly points at the almanac's old pages. Don't point at the oak by the tower.

**What this tests:**
- Humour that comes from him rather than from forms: the cow, the edge, the cat, the bangs. Only one line mentions committees, and only as relief.
- His real curiosity and competence: readings, rope, measurements that "disagree, marvellously".
- The relief, panic and confidence cycle.
- One answer, one new question, in the field note, which arrives as a letter.
- The almanac's old pages: he recognises the hand and won't say whose it is.
- A running gag that withholds its ending, the way he explores the island without explaining it.
- A secret of his own: he suspects this is the crackpot's refuge, and every line around the spell and the ruin dodges saying so.
- He can't measure the púca, and he's tactless about the skeleton.

### Field notes, the full set (Draft)

This is the source of truth for Barnaby's field notes, and the single field note above ("A field note") is the original draft.

Each note is a letter in that draft's shape: `Dear {farm},`, a blank line, a bold title, one or two `Established:` lines, one `Not established:` line, one `Next:` line, a blank line, and `Barnaby`. Each settles one small answer and opens one new question, and stays under 90 words, counting the salutation and the sign-off. They're unnumbered (`CAST.md` C10). The line in italics above each note gives its id, what it needs, and the note it follows, if any. The bell note is the original, word for word.

*bell: needs wetland*

> Dear {farm},
>
> **Field note: the bell under the wetland.**
> Established: it rings, once, low. Green, I'm told. Sounds can't be green. I've written it down anyway.
> Established: there is nothing down there. I checked, twice, with a rope.
> Not established: what rang it.
> Next: ring it back. Dusk, longer rope.
>
> Barnaby

*bell-rung-back: needs wetland; after bell*

> Dear {farm},
>
> **Field note: the wetland bell, rung back.**
> Established: at dusk I rang a teacup over the wetland. A beat later, something below rang back, in the teacup's note and not its own.
> Established: there is still nothing down there. Longer rope, same nothing.
> Not established: whether it was answering me or the teacup.
> Next: the good china. Then a saucer, as a control.
>
> Barnaby

*cloud-sea: needs islet*

> Dear {farm},
>
> **Field note: the cloud sea.**
> Established: it isn't wet. I lowered a weighted string off the islet, as far as it would go, and it came back up as dry as the inside of my hat.
> Not established: whether that's wonderful or alarming. It's certainly one of the two.
> Next: Thursday. Same string, with a wet sponge on the end.
>
> Barnaby

*cloud-sea-thursday: needs islet; after cloud-sea*

> Dear {farm},
>
> **Field note: the cloud sea, by Thursday.**
> Established: a sponge, lowered off the islet sopping wet, came back up dry and warm.
> Established: it's wonderful, not alarming. I said I'd know by Thursday, and I do, give or take a Thursday. The why I'll keep to myself.
> Not established: where the water went.
> Next: a bucket. A full one, on the longest string I own.
>
> Barnaby

*grove-key: needs grove*

> Dear {farm},
>
> **Field note: the creak in the grove.**
> Established: it's the trees, not the wind. They creak on still days too, all in the same key.
> Established: it isn't a key I know. It sits between two that I do, and won't be talked out of it.
> Not established: what it's in tune with, if anything.
> Next: my tuning fork, on a still day. If it and the trees disagree, it won't be the fork.
>
> Barnaby

*grove-tuning-fork: needs grove; after grove-key*

> Dear {farm},
>
> **Field note: the grove and the tuning fork.**
> Established: the grove's creak isn't the trees after all. Struck in there, my tuning fork rings in the grove's key. Outside, it's back to its own. It has never done that before. Marvellous.
> Not established: whether the grove is out of tune, or the rest of us are.
> Next: I'll leave the fork there for a week, and see what key it comes home in.
>
> Barnaby

*docking-height: needs twoPiecesDocked*

> Dear {farm},
>
> **Field note: how new land docks.**
> Established: it comes in level with the old. I went looking for a difference with my finest ruler, and the ruler gave up first.
> Not established: what keeps it that way.
> Next: a sterner ruler.
>
> Barnaby

*siofra-readings: needs siofraMet*

> Dear {farm},
>
> **Field note: Sheefra.**
> Established: she can't be measured. A goat at nine, a crow at noon, and never once, thank goodness, a cow.
> Established: she's no use as a source. I asked about other worlds. "Oh, loads," she said, and told me about a puddle.
> Not established: whether she has a usual shape, or just a favourite.
> Next: I'll ask her, very politely, to hold still.
>
> Barnaby

*fin: needs finOnJetty*

> Dear {farm},
>
> **Field note: what holds Fin together.**
> Established: no spell that I can find. I examined him all afternoon. He examined a tench.
> Established: something registers, though. My needle lifts a little when I stand near him, and stays lifted whether he's casting, untangling or explaining roach.
> Not established: what exactly I'm reading.
> Next: a more sensitive instrument, and a chair for the part about barbels.
>
> Barnaby

*ruin-stairs: needs inRuin*

> Dear {farm},
>
> **Field note: the stairs in the ruin.**
> Established: they're good stairs. Sound stone, well laid, and not a wobble in any of the ones I tested.
> Not established: that there's more stair than there is tower. I've chosen not to establish that.
> Next: a rug for the bottom step.
>
> Barnaby

**Notes for the game:**
- **Pacing.** The first note comes the morning after Barnaby has settled: 3 days after he's found, or when he moves into the ruin, whichever comes first. After that, one comes every few days, picked at random from the notes whose gates are met. A follow-up comes no sooner than two days after the note it follows. If nothing is unlocked, nothing happens, and nothing ever says so. *In the game's design (owner-approved 2026-10-24): post at 08:00, one every 3 days at most; see "Letters: who writes, and when".*
- **Each note is sent once,** and stays readable afterwards with the other letters. When the set runs out, the notes simply stop, and nothing says so either.
- **Gates.** Everything in `needs` must be true, and the note named in `after` must have been sent first. The land keys are the land piece ids (only `wetland`, `islet` and `grove` are used). The others: `twoPiecesDocked`, two pieces of new land have docked; `siofraMet`, Síofra has been met properly, as herself; `finOnJetty`, the Fishing Bench is restored and Fin is here, by the pond or at the jetty (the id stays, since the letters code already uses it; Fin's two stages are in his "Notes for the game"); `inRuin`, Barnaby has moved into the ruin, including the straightToRuin case.
- **Chains.** Three pairs: the bell (`bell`, then `bell-rung-back`), the cloud sea (`cloud-sea`, then `cloud-sea-thursday`) and the grove (`grove-key`, then `grove-tuning-fork`). Each follow-up is a callback that reads fine on its own, weeks later, without the first. The other four notes stand alone.
- **Síofra and Fin** are each in one note only, and each note waits for them (`siofraMet`, `finOnJetty`). No other note mentions either of them. Her note's title spells her "Sheefra" on purpose: Barnaby spells it a different way every time (`CAST.md` §4). Nothing in the set needs the accented "í".
- **The letters system.** It's built on `feat/letters` to the owner's design (approved 2026-10-24, recorded in "Letters: who writes, and when"). That design keeps each `Established:`, `Not established:` and `Next:` line on its own line, prints the title in bold without asterisks, signs each note once, and paces the notes as above. Until it merges, `letters` is off on main.
- **Thursday.** The journal's day headings show weekdays, so the Thursday note says "give or take a Thursday" and reads right whichever day it lands (Decided 2026-10-25). His islet land line's "by Thursday" is a plan, so it's fine on any day.
- **Times of day** (dusk, nine, noon, all afternoon) are his reports of what he did, so the notes fit whenever they arrive.
- **The ruin note** is about the stairs alone. Like his other ruin lines, it never points at the oak by the tower.

**What this tests:**
- One answer, one new question, every time, and every answer stays small: a teacup's note, a dry sponge, a tuning fork in the grove's key.
- His competence: a control saucer, his finest ruler and then a sterner one, and a tuning fork he'd trust over the trees.
- Theories that are partly right, from a man who enjoys being wrong: the creak is the trees, until it's the grove ("Marvellous.").
- Two readings throughout: an echo or an answer; air that dries things, or something that takes the water; land that finds its level, or is kept there.
- What he keeps back: the why of the Thursday verdict ("wonderful, not alarming"), and the stairs, the one thing in the set he chooses not to establish. His suspicion about the refuge is never said.
- He can't measure Síofra and he's tactless about Fin, and neither appears until they're there. Fin's note is present-day affection only: tench, roach and barbels.
- The cow, once, in passing, never finished.
- Follow-ups as callbacks that stand alone.

---

## The púca

**Author's notes (2026-10-22):**
- Likes the voice.
- Lean into her ability to be different things, not just a hare.

### As the Brown hare visitor, before anyone knows

The visitor's two existing lines stay as they are: "I was here first, technically. But the grass is long and I'm not one to argue." and "Same grass, same me. Slightly longer ears today, I think." Two more:

- You left the end of that row standing. I've been sitting in it. It's very good sitting.
- What season is it? It feels like a nice one.

### Journal lines

- There was a hare asleep in the carrots you hadn't picked. When you looked again, there was a pair of shoes beside the carrots, and no hare.
- You have four sheep. You bought three. The fourth one is very relaxed about it.
- There's a goat on the farmhouse roof. None of your goats can do that.
- A crow sat on the scarecrow all morning. The scarecrow allowed it, which isn't like him.
- A girl with her shoes on the wrong feet asked the way to the meadow. She was standing in it.
- The bees have a new friend. She's lying in the flower bed explaining something to them, very slowly. They seem to agree.
- Someone left a pebble on the doorstep. It hums when it's warm.

### When tapped

- Oh, hello. Have we met? We have. I remember the face, I think. It was this one.
- *(first meeting as herself)* Síofra. SHEE-fra. Barnaby spells it a different way every time. I like the third one best.
- I was the pear tree for a bit this morning. You walked right past. Rude, but fair.
- Which one was I yesterday? Honestly can't remember. Something with a tail.
- That row you left standing? I napped in it, as a hare, then as me, then as a hare again. Best nap in ages. Ages being about an afternoon.
- {n} sorts of crop! I've napped in nearly all of them. The radishes were a squeeze.
- Can't stop, I'm helping the bees with something. They'll tell you. They won't, actually.
- Your wizard asked me to hold still for a reading. So I held still as a hedge. He didn't like that.
- I'll show you where the clover's best. Remind me. Not now. Some other now.
- *(much later)* I said I'd show you the clover. Last spring, was it? Well. It's out now. Now's a good time for clover.

### Her world and her errands (decided 2026-10-22)

- *(to Barnaby, overheard)* Worlds? Oh, loads. One had very good puddles.
- Home? It was a hedge. Or a gate. Something with a gap in it. I'll find it if I need it. I haven't needed it.
- Can't stop. A duckling's lost its nerve. Not its mother, its nerve.
- I collect things that are a bit warmer than they should be. This feather, for instance. You can have it. No, really, you have it.
- Naps, ranked. Third row of the carrots: eight. Under the fruit trees: nine. Barnaby's lean-to: four. He snores in Latin.
- *(Idea, much later)* How long have I been here? A while? A while. Hm. That's new.

### A letter

> Dear you,
>
> I'm writing this so I remember to tell you something. I've forgotten what. It was good, though. It was about the bees, or the fruit trees, or possibly the moon.
>
> I'll come and tell you in person instead. Soon. Hare soon, not wizard soon. I might be a goat by then, so look twice.
>
> Here's a clover in the meantime. It's the four-leafed sort. I counted twice and got four both times, which never happens.
>
> Síofra x

### Game lines, for a future game spec (Draft)

Síofra isn't in the game yet: the game team called her "a later sub-project". These lines are ready for when she is, in the same shape as Barnaby's. They assume this design:
- she's glimpsed first as the Brown hare visitor, once the meadow is claimed, and the visitor's two lines stay word for word;
- she's met properly, as herself, once Barnaby has settled (three days after he's found, or when he moves into the ruin), and never before the meadow is claimed;
- she's ambient: you tap her for a line;
- her shapes, notices and gifts turn up now and then as journal lines, and nothing counts them;
- she remarks on a shiver at most once a day, and only right after one.

Titles are checked at 160 characters or fewer, details at 300 or fewer, the toast at 60 or fewer and tap lines at 80 or fewer. The naps and the promise setup are tap lines too, and are also 80 or fewer. Build from this subsection: her earlier lists word some of these lines differently, and a few of those depend on Barnaby. For her first build, use "Game lines, for the game spec (2026-10-25)" below, which fits these lines to the approved spec.

**Hover name:** Síofra

**hare.says** (the live Brown hare visitor's lines, word for word)
1. I was here first, technically. But the grass is long and I'm not one to argue.
2. Same grass, same me. Slightly longer ears today, I think.

**hare.glimpses** (journal lines while she's only the hare; none of them names her)

| Title | Detail |
|---|---|
| There was a hare asleep in the long grass. When you looked again, there was a pair of shoes there instead, and no hare. | They'd been left side by side, very neatly, the left one on the right and the right one on the left. |
| The hare's tracks crossed the meadow in the dew, stopped halfway, and carried on as footprints. | Bare ones, in no particular hurry. Near the field edge they turned back into a hare's. |
| Two dips in the long grass this morning: one hare-shaped, and one about the size of someone lying on their back to watch the clouds. | Only the hare was seen leaving. |
| At the field edge, the hare sat up and watched the sun go down, all the way to the end, the way people do and hares don't. | Then it stretched, gave a small, contented sigh, and loped off to find its supper. |

**metProperly** (once Barnaby has settled)
- *Toast:* A girl with her shoes on the wrong feet is asking the way.
- *Title:* A girl with her shoes on the wrong feet asked the way to the meadow. She was standing in it.
- *Detail:* She thanked you for the directions anyway. "Síofra," she said. "SHEE-fra. Barnaby spells it a different way every time. I like the third one best."

**tapHerself** (tapping her as herself; floating label, not written to the journal)
1. Oh, hello. Have we met? We have. I remember the face, I think. It was this one.
2. I was a fruit tree this morning. You walked right past. Rude, but fair.
3. Which one was I yesterday? Honestly can't remember. Something with a tail.
4. Worlds? Oh, loads. One had very good puddles.
5. Can't stop. A duckling's lost its nerve. Not its mother, its nerve.
6. Helping the bees with something. They'll tell you. They won't, actually.
7. Home? A hedge. Or a gate. Something with a gap in it. I haven't needed it.
8. See you soon. My soon, not yours. Mine's roomier.
9. Busy. Lying in the sun. Doing the other side next.
10. Tried being a sheep once. Lot of standing about. I'd do it again.
11. There's a snail going the long way round. I'm keeping it company.
12. I collect things warmer than they ought to be. Pebbles. Feathers. One Tuesday.

**shapes** (journal lines; each plays only when the island has what it needs)

| Needs | Title | Detail |
|---|---|---|
| sheep owned | There's one more sheep in the meadow than you bought. The extra one is very relaxed about it. | Rather than grazing, it's having a doze, and its ears are a slightly unusual length. |
| nothing | A goat is sitting on the ridge of the farmhouse roof, as if it had always been there. | It doesn't appear to belong to anyone, and it's perfectly comfortable about that. |
| scarecrow owned | A crow sat on the scarecrow all morning. The scarecrow allowed it, which isn't like him. | At noon the crow hopped down and walked off towards the field edge. It didn't seem to think of flying. |
| fruit trees owned | This morning there was an extra fruit tree, and its leaves were on the wrong way round. | Around eleven, it yawned. By lunchtime there were only the usual trees again. |
| nothing | Out on the pond, a duck you don't remember buying is lounging on a lily pad, wings folded behind its head. | Now and then it tries a quack, very carefully, to see if it's got the hang of it yet. |
| chickens owned | An extra chicken has joined yours today, a step behind the others and copying them, not very well. | It pecks at nothing, very seriously. Once, when it thought nobody was looking, it scratched behind its ear with a back foot. |
| nothing | Overnight, a stone turned up by the path, round and smooth and just the right size for sitting on. | Every time you passed it, it was a little further into the sun. |
| nothing | A bit of hedge had grown beside the farmhouse overnight. As you went by, it sneezed. | By supper it had wandered off, presumably to sneeze somewhere else. |

**noticesCropsLeftStanding** (ripe crops not picked yet, or resting soil)

| Needs | Title | Detail |
|---|---|---|
| ripe crops | Síofra napped at the end of a ripe row all afternoon, as a hare, then as herself, then as a hare again. | She woke with a leaf stuck to her cheek, and seemed very pleased with the whole arrangement. |
| resting soil | A bed of resting soil caught the sun, and Síofra lay down in it as if it had been made up for her. | The cat came and lay down beside her. By teatime the dog had joined them, and nobody was in any hurry to get up. |
| ripe crops | Clover came up between the ripe rows overnight, in a neat little line about the width of a hare. | At the end of it sat Síofra, admiring the rows the way some people admire paintings. |

**noticesVariety** (how many different crops have been grown; `{n}` is that number)

| Title | Detail |
|---|---|
| {n} different crops have grown in the garden, and Síofra has napped in nearly all of them. | The radishes, she says, were a squeeze. She doesn't hold it against them. |
| Síofra gave the cat a slow tour of the garden, stopping at every different crop along the way. | The cat, who doesn't usually do tours, stayed for the whole thing. At the end they both lay down in the last row and shut their eyes. |
| Wildflowers have turned up along the garden's edge, a different sort beside each different crop, as if they'd been asked to match. | Síofra was sitting among them with her eyes shut, humming. |

**noticesFlowersBeesTrees** (each plays only when the island has what it needs)

| Needs | Title | Detail |
|---|---|---|
| flower beds owned | Síofra spent the morning cross-legged by a flower bed, chin in her hands, watching the flowers open. | When she got up, the ones nearest her were standing a little taller, and looking rather pleased with themselves. |
| beehives owned | The bees have a new friend. She's lying by the hives, explaining something to them very slowly. | They seem to agree. |
| fruit trees owned | Under the fruit trees, a hare was asleep, and the branches seemed to lean in a little, as if not to wake it. | Later there was a girl there instead, still asleep, with blossom in her hair. |

**gifts** (cosmetic keepsakes, delight only)

| Item | Title | Detail |
|---|---|---|
| Humming pebble | Someone left a pebble on the doorstep. It hums when it's warm. | Not a tune, exactly. More the sort of hum you do when you're pleased and haven't noticed. |
| Warm feather | Síofra gave you a feather, warmer than any feather has a right to be. | You tried to hand it back. "No, really," she said, "you have it." It's still warm. |
| Four-leaf clover | There was a four-leaf clover on the doorstep, pressed flat inside a folded leaf. | Scratched on the leaf, in tiny letters: "Counted twice. Four both times." |
| Dandelion clock | Síofra left you a dandelion clock that won't blow away, however hard you puff. | She says it keeps perfect time. She's never once checked it. |
| Rain shell | A little spiral shell turned up on the windowsill. It smells of rain whenever you hold it close. | Warm rain, the sort you don't mind getting caught in. |

**naps** (tap lines; they can join her tap pool)
1. Naps, ranked. Third row of the carrots: eight. The meadow's long grass: nine.
2. Nap scores. Farmhouse roof: seven. The cat's windowsill: ten. Spoken for.
3. Best nap of all time: resting soil, in the sun. All time being this week.

**promise** (the setup is a tap line; keptLate is a journal line that comes a good while after it)
- *Setup:* I'll show you where the clover's best. Not now. Some other now.
- *keptLate title:* Síofra turned up at the field edge with grass in her hair. "I said I'd show you the clover. Last spring, was it? Well. It's out now."
- *keptLate detail:* It was a whole bank of it, thick and green and busy with bees, and it had spread a long way since she last looked. She seemed surprised, then pleased. "Now's a good time for clover," she said. It was.

**shiver** (at most once a day, right after one)

| Fits | Title | Detail |
|---|---|---|
| either | The island shivered. Up on the farmhouse roof, Síofra opened one eye. | "Someone, somewhere, is working very hard," she said. "Good for them. I'm having a lie-down." Then she shut the eye again. |
| big | A big shiver ran through the island, and every blade of the long grass stood up at once. | Síofra, who'd been lying in it, said "Ooh," and lay back down a little to the left. |
| small | The smallest of shivers. Síofra said it tickled. | That was all she had to say on the subject. |
| either | Síofra was halfway to being a goat when the island shivered. | She finished being a goat anyway. You can't just leave a goat half done, she says. |

**Notes for the game:**
- **No fixed first tap.** The metProperly detail introduces her, so all 12 tap lines, and the naps with them, can play in any order from the start.
- **Before and after she's met.** The hare lines come first, and the glimpses never name her or state anything outright. The shapes don't name her either, so they can play on either side of meeting her. Everything else is for after she's met. The hover name "Síofra" is for after she's met too: until then the hare keeps the visitor's own name, "Brown hare".
- **The shapes** are always an extra: one more sheep than you bought, a duck you don't remember buying, a goat that doesn't belong to anyone. None of the player's animals is ever missing or changed, nothing is menacing, and nothing asks the player to find her. The goat and duck lines work whether or not the player owns goats or ducks.
- **The notices** are positive only, and fire only on what's there: a field of nothing but radishes gets an ordinary day, with nothing held back (`CAST.md` §4). She shows it rather than says it: where she naps, who tags along (the cat and the dog, who both arrive before she does), and what comes up where she's been. The `{n}` line reads best from about five crops up.
- **The promise.** The setup plays once, and keptLate follows a good while later, whenever suits. There's nothing for the player to do in between. The setup drops the VOICES line's "Remind me", so the lateness is hers alone, and keptLate never says anyone was kept waiting.
- **The gifts** are keepsakes, like the hare's clover sprig: random, cosmetic, never currency.
- **The shiver lines** are reactions. Her only guess is "someone, somewhere", and she doesn't wonder any further. None of them can fire on an absence. Let only one character remark on any one shiver, picked at random from those on the island, so her line never lands straight after Barnaby's or Fin's.
- **What the lines need.** Only the metProperly detail mentions Barnaby, and nothing mentions Fin. The tap lines and naps need what every island has by the time she's met (the meadow, the farmhouse, the cat, and carrots and resting soil at some point), except tap 5, the duckling, which plays only once ducks are owned. The cat is also in two notices (the resting soil and the garden tour) and nap 2, and the dog is in the resting-soil notice. Both arrive before Barnaby today (levels 2 and 5); if the rebalance ever moves either after she's met, hold those lines until it's there. The bees in tap 6 and keptLate are ordinary bees and need no beehives. "I was a fruit tree" is her being one, so it works with no fruit trees owned. Every shape and notice that needs something says so in its `needs`.
- **Lines that cover part of a day.** Some narrate a stretch of it: the crow (all morning, then noon), the extra fruit tree (eleven, then lunchtime), the hedge (by supper), the ripe-row nap (all afternoon), the resting-soil lie-down (by teatime), the flower bed (all morning), the stone (every time you passed it), the hare under the fruit trees (later a girl) and the hare watching the sun go down. Post these late in the day or the next morning, not the moment they're picked.

**What this tests:**
- Shape-shifting played for delight: an extra sheep, a goat on the roof, a crow the scarecrow puts up with, a pear tree, a hedge. Never menacing, and never at the cost of the player's animals. She's an extra animal, never a missing one.
- She's chill and in the moment ("some other now", "something with a tail").
- She's time-blind: the promise kept a season late, and "hare soon, not wizard soon".
- She notices crops left standing, variety, and flowers, bees and trees, and never once judges.
- She has errands of her own, which keeps her clear of the manic pixie trap: animals' favours, odd collections, ranked naps.
- Gifts are delight only: a humming pebble, a four-leaf clover, a warm feather.
- A wanderer between worlds whose wandering explains nothing ("very good puddles").
- A quiet open question, never stated: she's never stayed anywhere this long.
- Her letter opens "Dear you", not "Dear {farm}", on purpose: names and places don't stick to her.

#### Ready for the brainstorm (Draft, 2026-10-24)

Prep for the owner's brainstorm on Síofra, built from the game session's answer (2026-10-24) on what main's code can host and what each kind of slot costs. It decides nothing. The slot set above stays the working proposal, no line in it is changed here (revisions under Fit are suggestions), and everything new is tagged Idea. Checked against `origin/main` on 2026-10-24. Cost key, from the game session: **Cheap** reuses what Barnaby built; **Medium** needs its own rule and tests; **Expensive** is new world behaviour plus art. *(inferred)* marks a tier the game session did not give.

**Her slots by build cost**

| Slot | Cost | Sits on (main) | Gate | Notes |
|---|---|---|---|---|
| Hover name | Cheap *(inferred)* | Barnaby's `name`, "Shown on hover" (`src/game/content/barnaby.ts`); the hare's `VISITORS.hare.name` | Once met. "Brown hare" until then | Check the UI font has the "í" (`CAST.md` §4, Name). See Fit for the keepsake line. |
| hare.says | Shipped | `VISITORS.hare.says` (`src/game/content/visitors.ts`), written by `noticeVisitor` as a `visitor` journal title, with "The brown hare left a clover sprig." as its detail | Line 1 on the first hello, line 2 on every later one. The meadow owned, and visitors open (level 4) | So their surface is the journal. Untouched, word for word. |
| hare.glimpses | Cheap | Journal lines, between the hare's visits (`src/game/systems/visitors.ts`) | Before she's met. **Idea:** after the hare's first visit, and never while she's waiting | Kind: see Fit. The sunset one is a part-of-day line. |
| metProperly | Cheap | Barnaby's find: a toast, then a `character` line; `barnabySettled(s, now)` covers both his cues | Barnaby settled, and the meadow owned | The toast is under 60. **Idea:** if the cue passes while the game is closed, stamp it like his late find. |
| tapHerself | Cheap | `tapBarnaby`'s pool: `heard`, `said`, no back-to-back repeat, a 4 s label | Once met. Tap 5 needs ducks | She has no fixed first tap, so the slice needs that as an option. Needs something to tap (Questions). |
| shapes | Cheap as journal lines; Expensive as world actors | Journal lines gated on `owned`, as `VisitorNeed` reads it; nothing yet for actors | Each line's `needs`; either side of meeting | Actors wait for the art bible's sign-off. See Fit for tense. |
| noticesCropsLeftStanding | Medium | One detector over the plots: ripe crops, or the HUD's "Resting soil" | Once met, while ripe crops or resting soil are there | Folklore's "púca's share" (`CAST.md` §4, Folklore roots). |
| noticesVariety | Medium | `stats.harvested`, per crop grown | Once met. The `{n}` line from about five crops | Its own detector and pacing rule. |
| noticesFlowersBeesTrees | Medium | `owned.flowerbed`, `owned.beehive`, `owned.fruitTree` | Once met, by each line's `needs` | A detector and pacing rule for each. |
| gifts | Cheap | `keepsakes` (`src/game/state.ts`) and the almanac's Visitors cards | Once met | One keepsake name per visitor today, so five gifts need a small list of their own. `economy.test.ts` already keeps keepsakes out of every bundle. The letters plan would hold the four-leaf clover until her letter has gone ("Letters: who writes, and when"), and her letter isn't in this build. |
| naps | Cheap as tap lines; Medium as poses | Her tap pool; for poses, a spot like Barnaby's camp (`src/world/places/characters.ts`) | Once met. Nap 2 needs the cat | A stand-in pose is cheap; real art goes through the art session. |
| promise | Medium | Nothing yet: a stored promise in her slice, with its own trigger | The setup once, once met; keptLate on an event, a good while after | **Idea:** hang keptLate on one of the hare's visits. Build both halves together. |
| shiver | Medium *(inferred)* | `barnabyRemark`, and his own `lastRemarkDay` cap | Once met, right after a shiver, once a day | Needs the shared pick (one character per shiver), a new rule Fin will need too. |

**A first build (Idea)**

A proposal for the brainstorm, not a decision.
- **The fixed cost:** generalising the characters slice per character, about a day's careful work (the game session's estimate). Most slots below sit on it.
- **In it:** the hover name; the glimpses; metProperly; the 12 tap lines and the three naps as taps, from one stand-in at one spot; the five gifts as keepsakes; all eight shapes as journal lines only, with the four present-tense ones in the past tense (see Fit); and one medium slot, crops left standing. Pacing stays the lore's "now and then" (see "Collisions and gaps").
- **Why crops left standing:** it's how she meets the player (`CAST.md` §4, Decided: "through how you treat the land"), it's the púca's share, and it's what the hare already does in the long grass. The taps carry her time-blindness meanwhile ("My soon, not yours").
- **Deferred:** the other two notices (a detector each); the promise, with its setup tap held back so it's never made without keptLate behind it; the shiver lines, until the shared pick, best built once for her and Fin; the naps as poses; and every shape as a world actor.
- **Why that's fine:** she's always an extra. Nothing of hers replaces or removes anything, nothing counts her, and "anything she might have done can still happen later" (`CAST.md` §4, How she reacts). A shape, a notice or the promise added later is one more thing turning up, so nothing earlier needs rewriting. Until the shared pick is built, Barnaby remarks alone, as he does now.

**Fit with what's shipped**

The hare's lines and return stay as they are. Every revision below is a suggestion, not applied.
- **The `arrives` and `says` lines** are untouched, and no draft line repeats or rewords them. Live, word for word: arrives "A brown hare is sitting up in the long grass of the meadow, ears at full height."; says "I was here first, technically. But the grass is long and I'm not one to argue." then "Same grass, same me. Slightly longer ears today, I think." Nap 1's long grass, glimpse 4's sitting up and the extra sheep's ears echo them quietly. No clash.
- **The 36-hour return.** Each 36-hour period brings her once if she isn't already waiting, at a hashed moment inside it, so her visits come irregularly, which suits her. Clash: glimpses 1, 3 and 4 have her gone ("no hare", "seen leaving", "loped off"), which is wrong while she's waiting under "Here now". Suggest the gate in the glimpses row. **Idea:** her stand-in steps out while the hare is here, so there's only ever one of her (`CAST.md` §4, "How she looks", Decided 2026-10-25).
- **The clover sprig.** The hare leaves one at every hello. The four-leaf clover gift, the clover line among the crops left standing, and keptLate's clover bank already make clover hers. **Idea:** let the link go no further than the lines take it: the almanac card stays "Clover sprig", and no line sets the sprig beside her other clovers. Once she's met, the keepsake line names her anyway ("Síofra left a clover sprig.", under "The hover name"), and her letter's clover comes signed. Store her gifts apart from `keepsakes.hare`, or the sprig's tally takes them in. No line changes.
- **The journal kind.** The hare's lines are `visitor` (the Visitors chip, with a bird icon); Barnaby's are `character` (Characters, a sparkle). Both kinds show in the recap. **Idea:** glimpses, and shapes before she's met, stay `visitor`, since a Characters entry would name her early. Everything after the meeting is `character`, and the hare's own lines stay `visitor`, as shipped.
- **The hover name.** The hare's hover label, the almanac card and the Say hello button all read `VISITORS.hare.name`. `keepsakeLine` (the journal detail, the almanac's thanks line and the farewell label) and the button's label lowercase it after "the". Renamed to "Síofra" once she's met, they would read "The síofra left a clover sprig." and "Say hello to the síofra". Suggest, for the spec: keep "Brown hare" in the visitor's def, give her hover name its own field for all of those to read, and once she's met drop the "the": "Síofra left a clover sprig." and "Say hello to Síofra".
- **The present-tense shapes.** Four shapes say an extra animal is there now, which a journal-only build can't show: the player would look and find nothing. Suggest the past tense, titles and details together, so all eight shapes can play in the first build (not four) and nothing changes when the actors come:
  - sheep: "There was one more sheep in the meadow than you bought. The extra one was very relaxed about it." / "Rather than grazing, it had a doze, and its ears were a slightly unusual length."
  - goat: "A goat was sitting on the ridge of the farmhouse roof, as if it had always been there." / "It didn't appear to belong to anyone, and it was perfectly comfortable about that."
  - duck: "Out on the pond, a duck you don't remember buying was lounging on a lily pad, wings folded behind its head." / "Now and then it tried a quack, very carefully, to see if it had the hang of it yet."
  - chicken: "An extra chicken had joined yours, a step behind the others and copying them, not very well." / "It pecked at nothing, very seriously. Once, when it thought nobody was looking, it scratched behind its ear with a back foot."
  - In the past tense the duck ("Now and then") and the chicken ("Once, when it thought nobody was looking") narrate a stretch of time, so they would join her "Lines that cover part of a day".
- **Outside her pool.** `FIRST_VISITOR_STORY` ("The first wild visitor has been and gone. Word of the island is getting about.") promises more visitors, and she's the only one (`CAST.md` C4). Suggest, for the spec: "The hare has been and gone. It was in no hurry." It says "The hare", not "The brown hare", because it posts beside the keepsake line "The brown hare left a clover sprig." The hare also waits for level 4 (`UNLOCKS.visitors`), not only the meadow, which the design list above doesn't say.

**Questions for the brainstorm**

1. **What do you tap once she's met?** *Recommendation (Idea):* a stand-in of her as herself at one field edge, the cheap end of the naps' cost, while the hare stays a visitor you say hello to. Her home is "the field edges and hedges", and she's met "at a field edge or a gate" (`CAST.md` §4, Introduction).
2. **Does the hare keep visiting after she's met?** *Recommendation (Idea):* yes, word for word, with the 36-hour return and the clover sprig: `CAST.md` C6 makes the hare her first appearance, and nothing retires it. Its hover reads "Síofra" once she's met ("Before and after she's met" above), with the keepsake line reworded as in Fit.
3. **Which medium slot comes first?** *Recommendation (Idea):* crops left standing, as above. The promise next, since it's her flaw's payoff, "funny now and can be tender later" (`CAST.md` §4, What her time-blindness gives the story).
4. **Shapes as journal lines before the world actors?** *Recommendation (Idea):* yes. The author asked to "lean into her ability to be different things", and the design list above has her shapes "turn up now and then as journal lines".
5. **When exactly is she met?** *Recommendation (Idea):* Barnaby settled and the meadow owned, held to at least the day after he's found ("Settling, and crowded days", Idea). **Idea:** also after the hare's first visit, so the hare still comes first when the meadow is claimed late.
6. **Her shiver lines in the first build, or later?** *Recommendation (Idea):* the characters notice the shiver ("The echo", Decided), but the lore asks for one picker drawing on whoever is on the island and hasn't remarked today ("The shared pick and the daily limit", Idea). Build that once, with her or with Fin.

### Game lines, for the game spec (2026-10-25)

The game session asked for these for her first build, which holds them in one wording file, `content/siofra.ts`. They follow the owner-approved design, `docs/superpowers/specs/2026-10-25-siofra-design.md` on `feat/siofra`, and this subsection is the source of truth for that build: build from it, not from "Game lines, for a future game spec" above. Titles are checked at 160 characters or fewer, details at 300 or fewer, the toast at 60 or fewer, and the tap lines and naps at 80 or fewer. Every line is the draft's, word for word, except six: the four past-tense shapes from "Fit with what's shipped", the sunset glimpse, moved to yesterday evening because moments post at 18:00, before the game's sun goes down, and tap 9, which no longer says "in the sun" because she can be tapped at night. Her promise, the variety notice, the flowers, bees and trees notice, her shiver lines and her letter are deferred, so none of them is here.

**Hover name:** Síofra

**hareOnceMet** (the hare's wording once she's met, built from the hover name; before that, everything reads "Brown hare", exactly as now)
- *Keepsake line:* Síofra left a clover sprig.
- *Say hello button:* Say hello to Síofra

**hare.glimpses** (journal lines, `visitor` kind, before she's met; none of them names her)

| Title | Detail |
|---|---|
| There was a hare asleep in the long grass. When you looked again, there was a pair of shoes there instead, and no hare. | They'd been left side by side, very neatly, the left one on the right and the right one on the left. |
| The hare's tracks crossed the meadow in the dew, stopped halfway, and carried on as footprints. | Bare ones, in no particular hurry. Near the field edge they turned back into a hare's. |
| Two dips in the long grass this morning: one hare-shaped, and one about the size of someone lying on their back to watch the clouds. | Only the hare was seen leaving. |
| At the field edge yesterday evening, the hare sat up and watched the sun go down, all the way to the end, the way people do and hares don't. | Then it stretched, gave a small, contented sigh, and loped off to find its supper. |

**metProperly** (at 06:00 the morning she's met: the toast if the game is open, and one `character` journal line)
- *Toast:* A girl with her shoes on the wrong feet is asking the way.
- *Title:* A girl with her shoes on the wrong feet asked the way to the meadow. She was standing in it.
- *Detail:* She thanked you for the directions anyway. "Síofra," she said. "SHEE-fra. Barnaby spells it a different way every time. I like the third one best."

**tapHerself** (tapping her figure at the field edge; floating label, not written to the journal)
1. Oh, hello. Have we met? We have. I remember the face, I think. It was this one.
2. I was a fruit tree this morning. You walked right past. Rude, but fair.
3. Which one was I yesterday? Honestly can't remember. Something with a tail.
4. Worlds? Oh, loads. One had very good puddles.
5. Can't stop. A duckling's lost its nerve. Not its mother, its nerve.
6. Helping the bees with something. They'll tell you. They won't, actually.
7. Home? A hedge. Or a gate. Something with a gap in it. I haven't needed it.
8. See you soon. My soon, not yours. Mine's roomier.
9. Busy. Lying in the grass. Doing the other side next.
10. Tried being a sheep once. Lot of standing about. I'd do it again.
11. There's a snail going the long way round. I'm keeping it company.
12. I collect things warmer than they ought to be. Pebbles. Feathers. One Tuesday.

**naps** (tap lines, in the same pool as tapHerself)
1. Naps, ranked. Third row of the carrots: eight. The meadow's long grass: nine.
2. Nap scores. Farmhouse roof: seven. The cat's windowsill: ten. Spoken for.
3. Best nap of all time: resting soil, in the sun. All time being this week.

**gifts** (each given once, as a cosmetic keepsake, and listed by name on her almanac card)

| Name | Title | Detail |
|---|---|---|
| Humming pebble | Someone left a pebble on the doorstep. It hums when it's warm. | Not a tune, exactly. More the sort of hum you do when you're pleased and haven't noticed. |
| Warm feather | Síofra gave you a feather, warmer than any feather has a right to be. | You tried to hand it back. "No, really," she said, "you have it." It's still warm. |
| Four-leaf clover | There was a four-leaf clover on the doorstep, pressed flat inside a folded leaf. | Scratched on the leaf, in tiny letters: "Counted twice. Four both times." |
| Dandelion clock | Síofra left you a dandelion clock that won't blow away, however hard you puff. | She says it keeps perfect time. She's never once checked it. |
| Rain shell | A little spiral shell turned up on the windowsill. It smells of rain whenever you hold it close. | Warm rain, the sort you don't mind getting caught in. |

**shapes** (journal lines, `visitor` kind before she's met and `character` after; each plays only when the island owns what it needs)

| Shape | Needs | Title | Detail |
|---|---|---|---|
| sheep | `sheep` | There was one more sheep in the meadow than you bought. The extra one was very relaxed about it. | Rather than grazing, it had a doze, and its ears were a slightly unusual length. |
| goat | nothing | A goat was sitting on the ridge of the farmhouse roof, as if it had always been there. | It didn't appear to belong to anyone, and it was perfectly comfortable about that. |
| crow | `scarecrow` | A crow sat on the scarecrow all morning. The scarecrow allowed it, which isn't like him. | At noon the crow hopped down and walked off towards the field edge. It didn't seem to think of flying. |
| fruit tree | `fruitTree` | This morning there was an extra fruit tree, and its leaves were on the wrong way round. | Around eleven, it yawned. By lunchtime there were only the usual trees again. |
| duck | nothing | Out on the pond, a duck you don't remember buying was lounging on a lily pad, wings folded behind its head. | Now and then it tried a quack, very carefully, to see if it had the hang of it yet. |
| chicken | `chicken` | An extra chicken had joined yours, a step behind the others and copying them, not very well. | It pecked at nothing, very seriously. Once, when it thought nobody was looking, it scratched behind its ear with a back foot. |
| stone | nothing | Overnight, a stone turned up by the path, round and smooth and just the right size for sitting on. | Every time you passed it, it was a little further into the sun. |
| hedge | nothing | A bit of hedge had grown beside the farmhouse overnight. As you went by, it sneezed. | By supper it had wandered off, presumably to sneeze somewhere else. |

**noticesCropsLeftStanding** (journal lines, `character` kind, once she's met; each needs its condition at the post time)

| Needs | Title | Detail |
|---|---|---|
| `ripeCrop` | Síofra napped at the end of a ripe row all afternoon, as a hare, then as herself, then as a hare again. | She woke with a leaf stuck to her cheek, and seemed very pleased with the whole arrangement. |
| `restingSoil` | A bed of resting soil caught the sun, and Síofra lay down in it as if it had been made up for her. | The cat came and lay down beside her. By teatime the dog had joined them, and nobody was in any hurry to get up. |
| `ripeCrop` | Clover came up between the ripe rows overnight, in a neat little line about the width of a hare. | At the end of it sat Síofra, admiring the rows the way some people admire paintings. |

**Notes for the game:**
- **No fixed first tap.** The metProperly detail introduces her, so all fifteen tap lines (the twelve and the three naps) play in any order from the first tap, and never the same one twice running.
- **Tap gates.** Nap 2 ("The cat's windowsill") needs the cat. The cat moves in at level 2 and she's met only after Barnaby (level 6), so today it always holds; keep the gate in case the ladder moves. The build plan (`feat/siofra`, owner-approved 2026-10-25) also holds tap 5, the duckling, until ducks are owned, as the earlier draft did. The line would read fine without them, as one of her own errands, so the gate is a choice, not a need.
- **Moment gates.** A shape with a `needs` item plays only while at least one is owned, and "nothing" needs nothing. The notice's `ripeCrop` lines need a ripe crop not yet harvested, and its `restingSoil` line a plot showing resting soil, at the post time. The resting-soil line has the cat and the dog in it (levels 2 and 5), and both are always there by the time she's met.
- **The glimpses.** They start after the hare's first visit, stop at the meeting, and never post while the hare is waiting to be noticed, since several of them have the hare gone.
- **Kinds.** Before she's met, everything of hers is a `visitor` line: the glimpses, and the shapes once the first glimpse has posted. A `character` line would name her early, and none of these names her. From the meeting on, everything is `character`: metProperly, the shapes, the notice and the gifts. The shapes keep the same words on either side. The hare's own lines (its arrival and its two says lines) stay `visitor`, word for word, in `content/visitors.ts`, and nothing here repeats them.
- **The 18:00 post.** Every moment line reads right at 18:00 local, or up to 15 minutes later after a shiver: all past tense, and nothing claims an animal is there right now. On the game's sky, which follows the clock (`src/world/skyPalette.ts`), 18:00 is late afternoon (the evening light comes at about 18:36, and night at 21:36), so no moment may say the sun has already set. That's why the sunset glimpse is yesterday evening's. metProperly posts at 06:00 instead, with its toast if the game is open, and leads the recap if not.
- **Lines that cover part of a day.** All of these are over by 18:00: the dew (glimpse 2), "this morning" (glimpse 3), the crow (all morning, then noon), the fruit tree (this morning, eleven, then lunchtime), the duck (now and then), the chicken (once, when it thought nobody was looking), the stone (every time you passed it), the hedge (by supper), the ripe-row nap (all afternoon) and the resting soil (by teatime). A moment read in the next morning's recap keeps its own date, so its "this morning" means that day's.
- **Gifts.** Each is given once, in any order, and never counted. They're stored apart from `keepsakes.hare`, so the clover sprig's tally never takes them in, and the almanac card lists them by name. The letters plan's hold on the four-leaf clover doesn't apply, since her letter isn't in this build ("No hold without letters").
- **Numbers.** The nap scores, "Four both times" and "One Tuesday" are jokes, not tallies. Nothing of hers counts anything.
- **No shiver lines.** Hers come later, with Fin and the shared pick, and nothing here mentions a shiver.

**What this tests:**
- Shape-shifting for delight in a build that can't show it: eight extras, told after the fact, so the player never goes looking for an animal that isn't there.
- She's glimpsed before she's named: the shoes, the tracks that turn into footprints, the dip the size of a person, the hare that watches the sunset.
- She meets the player through the land: the crops left standing, the púca's share, and nothing ever judges a field.
- She's chill and time-blind in the taps ("My soon, not yours", "Something with a tail").
- Her errands are her own: the bees, the snail, the duckling and the ranked naps.
- Her gifts are delight only, each given once and never currency.
- Her wandering explains nothing ("very good puddles"), and nothing says she's staying or going.

---

## The skeleton fisherman

**Author's note (2026-10-22):** worse jokes. Groan-worthy puns, and a lovable bore about fish.

Everything here is phase 1, affection (`CAST.md` §5), unless it's marked. Each line should be funny on its own, and read differently once the player knows. No skull puns, no jokes about being dead, and no music.

### Journal lines

- The jetty is finished. There's already someone at the end of it: a skeleton in a sun hat, holding a rod the wrong way round, perfectly happy.
- The skeleton on the jetty has started calling the heron "the competition". *(The heron stays as pond scenery now that the visitors are gone.)*
- The skeleton told the ducks a joke about a trout. The ducks left. He told it again to the pond.
- Mist on the pond this morning. The skeleton fished anyway, caught nothing, and stayed until it lifted.

### When tapped

- *(first meeting)* Finlay. Fin, like the fishy bit. I've been waiting years to say that to someone.
- Oh my cod. Sorry. I say that when I'm excited. I'm always excited.
- Caught a fish! Well. A fish was near the hook, briefly. I'm counting it.
- Why are fish so clever? They live in schools. I've been saving that one.
- Why did the fish blush? It saw the pond's bottom. I've got loads of these. Loads.
- I'm not fishing for compliments. I'm fishing for tench. Compliments also welcome.
- What do you call a fish with a crown? A kingfisher. No. Wait. That's a bird. That's the competition.
- I'm here just for the halibut. There are no halibut here. I just like saying it.
- I know the Latin name of everything in this pond. I don't know which end of the worm goes on first.
- The book says you hold it like this. The fish say otherwise.
- Did you know the gudgeon has barbels? Little whiskers, for tasting the bottom. I could tell you about barbels for an hour. I will, if you sit down.
- Big one this morning! It's in the bucket. Have a look, and then it's going back. They always go back.
- Nice day for it. They're all nice days for it, now.

### Fish notes, the full set (Draft)

These replace the narrator notes on `idle/b6-fishing` in `src/game/content/fish.ts`, in his voice, for the game team to adopt or not.

| Fish | Spot | Note |
|---|---|---|
| Three-spined stickleback | pond | Three spines, and a stickler about his nest: the male builds it, guards it and fans the eggs himself. Nobody gets near. Quite right. |
| Common minnow | pond | Calling something a minnow is meant to be a put-down. The minnows wear it with pride. There are loads of them, all having a lovely time. |
| Rudd | pond | Not a roach. Everyone says roach. Look: redder fins, golden sides, and a mouth turned up for feeding at the surface. Not a roach. |
| Roach | pond | Silver, sensible, everywhere. The fish equivalent of a good cardigan. |
| Perch | pond | Striped like a tiny tiger, and just as bold. First to the worm every time, and far better with worms than I am. |
| Gudgeon | pond | Two little barbels for tasting its way along the bottom. I won't go on about barbels. (I'm going to go on about barbels.) |
| Crucian carp | pond | Round, bronze and never in a hurry. Bites so gently the float barely twitches. Missed eleven before this one. Worth it. |
| Tench | pond | Called the doctor fish: other fish were said to rub against it to get well. I've read every book about it. It's lovelier in person. |
| Common bream | pond | Arrives at dusk with the whole shoal, all slime and dignity. There's a towel kept just for bream. |
| Mirror carp | pond | A few big scales like dinner plates, and it never forgets a crust. Not vain, I'd say. Just reflective. |
| European eel | pond | Travels thousands of miles from the Sargasso Sea to reach fresh water. Meanwhile, I get lost going round the pond. |
| Pike | pond | All teeth and opinions. I respect him enormously, from a safe distance. |
| Nimbus minnow | cloud sea | Swims in cloud. The books don't cover this. For once, I'm learning on the job. |
| Cirrus eel | cloud sea | My notes so far: long, wispy, very fast. Then I blinked. That's all my notes. |
| Cumulus carp | cloud sea | Grows a little on warm afternoons. Shrinks a little when I start on about barbels. A good listener, considering. |
| Stratus flounder | cloud sea | Lies flat along the bottom, being a grey day. Looks a bit under the weather. It isn't. That's just its face. |
| Sunbeam perch | cloud sea | Warm to the touch, like a hot-water bottle with fins. Only bites while the sun's out. I hold it a moment before it goes back. |
| Rainbow skipper | cloud sea | Turns up after a shower and skips across the cloud tops in arcs. No pot of gold at either end, though. I've been to both. |
| Lantern loach | cloud sea | Carries its own little lights for the night shift. I always pack a torch and can never find it, so I sit by the loach. |
| Moonscale bream | cloud sea | Each scale holds a little moonlight and gives it back slowly. I give the bream back rather quicker. |
| Stargazer | cloud sea | Eyes on top of its head, so it watches the stars and never the hook. That's how we met. |
| Aurora trout | cloud sea | Green and violet down its sides, like the northern lights. Not in any of my books, so I've added it to all of them, in pencil. |
| Bleak | wetland | Not as bleak as the name suggests. Quite cheerful, actually. Somebody owes it an apology. |
| Ruffe | wetland | A prickly little cousin of the perch, also called the pope. Nobody can tell me why. I've looked into it thoroughly. Nobody can tell me why. |
| Silver bream | wetland | Like a common bream that's tidied itself up for company. Telling the two apart takes a magnifying glass and most of an afternoon. Bliss. |
| Ide | wetland | Ide love to say we're close. It moves through the reeds in little groups and keeps itself to itself. Politely, mind. |
| Bitterling | wetland | Lays its eggs inside a freshwater mussel, and the mussel just lets it. I can explain how. It takes about an hour. Two, with questions. |
| Dace | wetland | Quick, slim and silver, and gone before I've finished saying hello. I'm working on a shorter hello. |
| Weatherfish | wetland | Supposed to wriggle before a storm. I've watched one for three days. Lovely weather. Lovely fish. |
| Spined loach | wetland | Keeps a tiny spine folded under each eye, just in case, and hides in the silt all day. Never caught off guard. Except by me, by accident. |
| Zander | wetland | Big glassy eyes, made for hunting in the dark. Gives me a look as it goes back. I like to think it's respect. |
| Burbot | wetland | The only member of the cod family that lives in fresh water, so 'oh my cod' is, for once, technically correct. Likes cold nights. |
| Brown trout | tarn | Spotted like a speckled egg and very particular about its flies. I tie my own. It can tell. |
| Arctic charr | tarn | Left over from the last ice age and still fond of cold, deep water. Blushes red every autumn. Charr-ming. Sorry. |
| Grayling | tarn | Known as the lady of the stream. Flies a fin like a sail and is said to smell of thyme. I've had a sniff. Mostly fish. |
| Schelly | tarn | Shy whitefish of the cold lakes. Feeds in shoals out in the middle, always exactly one cast further than I can manage. |
| Vendace | tarn | One of the rarest fish in Britain, and it comes up to feed after dark. I bring a flask, a blanket and a spare flask. Straight back it goes. |
| Bullhead | tarn | Bull-headed, frankly. Has lived under the same stone for years and won't consider moving. Also known as the miller's thumb. You're welcome. |
| Ferox trout | tarn | A brown trout that moved to the deep end and grew enormous. Rarely seen. Much discussed, mostly by me, mostly after dark. |
| Stone loach | tarn | Stone me: six barbels. The gudgeon only has two. I try not to have favourites, but I've drawn this one in three colours. |

### A letter

> Dear {farm},
>
> Thank you for the jetty. I've been meaning to say. I've sat on a lot of jetties in my mind, and this one beats all of them. It's real, for a start.
>
> Caught a tench today, and put it back. Caught it again an hour later. I think it likes the company. Reely.
>
> If you're passing at dusk, the pond does a thing with the light. I won't spoil it.
>
> Tight lines,
> Fin (on the jetty)

### At the milestones (Decided 2026-10-22)

- *(journal, on earning the "Islander" title)* Fin said congratulations, and that he'd lend you a rod any time. Just say.
- *(journal, the finale: the cottage is Home, "Retired, Happily")* Fin said congratulations, and asked if you'd like to borrow a rod. He has several. Most of them are still in their wrappers.

### His clues (Decided 2026-10-22: three objects)

Each makes sense alone, and any two point the same way: he saved for the time to fish, and bought the gear while he waited. **Delivery (decided 2026-10-22):** each object waits in the world until noticed, like the hare and the big catch. Tapping it writes the journal line below and keeps the object in the almanac. Nothing counts them.

- *(the licences)* There's a biscuit tin on the shelf in Fin's shed. Inside: fishing licences, held together with a rubber band. One for every year. Every one of them is still crisp.
- *(the tackle box)* Fin's tackle box still has the price sticker on. He says he keeps meaning to take it off.
- *(the rods, early)* There's a shed by the jetty now. Through the window: rods, a good few of them, most still in their wrappers.
- *(the rods, at the finale)* See "At the milestones" above.

### Not picked yet

- *(something he says)* Did you know carp can live for decades? I read that in a book I bought for when I had time. I have time now. No idea where the book is. *(Decided 2026-10-25: a Fin tap line, at any time, trimmed to fit a tap: tap 14 in "Game lines, for the game spec (2026-10-25)" below.)*
- *(something he says, about saving)* I'd have come years ago. You know how it is. Always one more thing to put by. *(Decided 2026-10-25: a Fin tap line, at any time: tap 13 in "Game lines, for the game spec (2026-10-25)" below.)*
- *(Síofra, late, about him; possibly too pointed)* Your fisherman says he's got all the time in the world now. I didn't know you could run out. *(Decided 2026-10-25: a rare Síofra tap line, only after all three of Fin's clues have been found, trimmed to fit a tap: "For Síofra's later build" in "Game lines, for the game spec (2026-10-25)" below.)*

### Game lines, for a future game spec (Draft)

*His build takes its wording from "Game lines, for the game spec (2026-10-25)" below, not from this subsection.*

Fin isn't in the game yet. These lines are ready for when he is, in the same shape as Barnaby's. They assume this design:
- he arrives when the Fishing Bench restoration is done: he's simply already there, fishing, on the bench by the pond until the wetland has docked and then at the end of the jetty on the wetland lake (decided 2026-10-25);
- he's ambient: you tap him for a line;
- he remarks on a shiver at most once a day, and only right after one.

Titles are checked at 160 characters or fewer, details at 300 or fewer, the toast at 60 or fewer and tap lines at 80 or fewer. Build from this subsection: his earlier lists word some of these lines differently. For his first build, use "Game lines, for the game spec (2026-10-25)" below, which fits these lines to the owner's answers.

**Hover name:** Fin

**found** (the Fishing Bench is restored after the wetland has docked: `atJetty`)
- *Toast:* Someone's already fishing off the jetty.
- *Title:* The jetty is finished. There's already someone at the end of it: a skeleton in a sun hat, holding a rod the wrong way round, perfectly happy.
- *Detail:* He waved with the rod, nearly lost it in the lake, and introduced himself. "Finlay. Fin, like the fishy bit." He looked very pleased with that.

**found, by the pond** (the Fishing Bench is restored before the wetland has docked: `byPond`. Decided 2026-10-25)
- *Toast:* Someone's already fishing at the pond.
- *Title:* There's already someone fishing at the pond: a skeleton in a sun hat, sitting on the bench with a rod the wrong way round, perfectly happy.
- *Detail:* He waved with the rod, nearly lost it in the pond, and introduced himself. "Finlay. Fin, like the fishy bit." He looked very pleased with that.

**movedToJetty** (he was found by the pond, `byPond`, and the wetland has now docked. Decided 2026-10-25)
- *Title:* The jetty is finished. There's already someone at the end of it: a skeleton in a sun hat, holding a rod the wrong way round, perfectly happy.
- No toast and no detail.

**tap at the jetty** (floating label, not written to the journal; by the pond too, before the wetland has docked)
1. Oh my cod. Sorry. I say that when I'm excited. I'm always excited.
2. I'm here just for the halibut. There are no halibut here. I just like saying it.
3. Why are fish so clever? They live in schools. I've been saving that one.
4. Fish with a crown? A kingfisher. No, that's a bird. Birds are the competition.
5. I don't like to carp on. Unless it's about carp. Then there's no stopping me.
6. I could tell you about barbels for an hour. I will, if you sit down.
7. A fish feels footsteps through its lateral line. Hence the tiptoeing.
8. Eels can cross wet grass on a damp night to find a new pond. Show-offs.
9. The book says you hold it like this. The fish say otherwise.
10. I know the Latin for every fish here. Not which end of the worm goes on first.
11. Catch and release. Mostly release. Mostly before the catch.
12. They always go back. Each one gets a joke first, to take home.

**bigCatch** (the player notices the big catch waiting at the jetty, or by the pond before the wetland has docked; the rows that name the jetty, "Big catch at the jetty" and "You found Fin at the jetty", wait for `atJetty`)

| Title | Detail |
|---|---|
| There was a big one on Fin's line, and Fin was trying very hard to look calm about it. | He managed about a second. After that you got the proper name of every fin on it, before it went back. |
| Big catch at the jetty. Fin held it up so you could see the whole of it, and the whole of it was splendid. | He says it's the finest of its kind. He says that every time, and means it every time. They always go back, and so did this one. |
| Reeling in the big one took a minute. Fin's account of it took twenty. | He slipped it back, gently, and finished the story anyway. |
| Fin turned the big catch this way and that, admiring it from every side, and pronounced it perfect. | Back it went, lowered as carefully as if it were made of glass. |
| You found Fin at the jetty with a big one, telling it what a good fish it was. | It took the compliment well. He let it go with a little more ceremony than was strictly necessary. |

**shiver** (at most once a day, right after one; the rows that name the jetty or the lake wait for `atJetty`)

| Fits | Title | Detail |
|---|---|---|
| big | The island gave a big shiver, and the whole jetty hummed. | "Felt that?" said Fin. "The fish bite better after. I've no idea why, and I've decided not to ask." |
| big | The big shiver set ripples running in across the pond from every bank. | Fin raised his sun hat to it, just in case. Then he got his line back in, sharpish. |
| small | A small shiver. The tip of Fin's rod gave a little nod. | Fin nodded back. It seemed only polite. |
| small | Barely a shiver, but the lake noticed: one small ring spread out from the jetty and away. | "Well, I never," said Fin, and watched it all the way to the far bank. |
| either | The island shivered, and the jetty rocked a little. Fin's guess is a very large fish rolling over, a long way down. | He's already wondering what it would bite on. |
| either | Just as the island shivered, Fin's float dipped, bobbed up, and went under properly. | Fin isn't one to look a gift fish in the mouth. He reeled it in, had a good look anyway, and let it go. |

**newSpot** (a new spot opens to fishing)

| Spot | Title | Detail |
|---|---|---|
| wetland (Boardwalk Loop) | Fin walked the new boardwalk all the way round and arrived back where he'd started, delighted. | The reeds are full of fish he's read all about, so he's brought the books along to let the fish check his facts. |
| tarn (Crofter's Bothy) | Up by the new bothy, the tarn is cold, deep and perfectly clear. Fin says you can watch the fish making up their minds. | Brown trout, Arctic charr, and the shy schelly out in the middle. He named them all on the way up, then again at the top, for luck. |
| cloud (Sky Harbour) | The Sky Harbour is finished, and Fin is already sitting on the edge of it, dangling a line into the clouds. | He's been through every book he owns, and not one of them covers this. He says it's the best thing a book has never told him. |

**weather** (ambient journal lines at the pond; each plays only in its own weather)

| Kind | Title | Detail |
|---|---|---|
| mist | Mist on the pond. Fin can't see his float, so he's decided to trust it. | The fish can't see him either, he says, so it's all perfectly fair. |
| drizzle | A fine drizzle came over the pond. Fin pulled his sun hat down a little and stayed exactly where he was. | Light rain brings the fish up to feed, apparently. He's read it in four books, and is now testing it personally. |
| dusk | Dusk at the pond. The light went gold, then pink, then a colour there's no word for, and Fin stopped fishing to watch it. | Afterwards he just said "There," quietly, as if he were handing it to you. |

**milestones** (word for word from "At the milestones", with no detail)

| Milestone | Title | Detail |
|---|---|---|
| islander | Fin said congratulations, and that he'd lend you a rod any time. Just say. | |
| finale | Fin said congratulations, and asked if you'd like to borrow a rod. He has several. Most of them are still in their wrappers. | |

**clues** (each object waits in the world until it's noticed; tapping it writes the line)

| Clue | Title | Detail |
|---|---|---|
| licences | There's a biscuit tin on the shelf in Fin's shed. | Inside: fishing licences, held together with a rubber band. One for every year. Every one of them is still crisp. |
| tackleBox | Fin's tackle box still has the price sticker on. | He says he keeps meaning to take it off. |
| rodsEarly | There's a shed by the jetty now. | Through the window: rods, a good few of them, most still in their wrappers. |

**Notes for the game:**
- **Where he is (decided 2026-10-25).** His jetty stands on the wetland lake. Restoring the Fishing Bench brings him, but until the wetland has docked he sits on the bench by the home pond, which is too small for a jetty (`CAST.md` §5). Two stage gates follow, and both need him here (`finOnJetty`): `byPond`, the wetland hasn't docked yet; `atJetty`, it has. On the usual path he starts by the pond and moves to the jetty when the wetland docks; if it docked first, he's at the jetty from the start. Once he's at the jetty he still fishes the home pond sometimes (decided 2026-10-25), so the pond stays one of his waters in both stages, and a line that has him fishing the pond plays in either.
  - **`byPond` only:** "found, by the pond".
  - **The move, `movedToJetty` (decided 2026-10-25):** on the usual path, when the wetland docks after he was found by the pond, one quiet journal line marks his move. It's the jetty found's title on its own, word for word, with no toast and no detail, so he isn't introduced twice. It plays once, and never if he was found at the jetty.
  - **`atJetty` only:** the found (its detail reworded 2026-10-25 to "in the lake", since the jetty isn't on the pond); the big catches "Big catch at the jetty" and "You found Fin at the jetty"; the shivers "the whole jetty hummed" (the echo's sample line too), "the jetty rocked a little" and "Barely a shiver" (reworded 2026-10-25 to "the lake noticed", for the same reason); all three clues, since his shed and his things stand by the jetty, on the patch the art keeps for the shed; and his letter.
  - **Both, word for word:** all 12 taps, the other big catches and shivers, newSpot, the weather (mist, drizzle and dusk at the pond), the milestones, the other fish notes and Barnaby's `fin` note.
  - **The earlier lists**, which aren't built from: "The skeleton on the jetty has started calling the heron" needs `atJetty`, and "everything in this pond" works only by the pond (tap 10 says it in a form that fits both).
- **"Lake" (decided 2026-10-25)** is the player-facing word for the wetland's water, as in the jetty found's detail and the "Barely a shiver" line.
- **No fixed first tap.** The found detail introduces him, so all 12 tap lines can play in any order from the start.
- **The big catch lines** name no species, size or spot, so they fit any big catch, including one from the cloud sea waiting at the jetty, or by the pond before the wetland has docked. They can sit beside the game's own species-and-size line, or replace it.
- **The shiver lines** are reactions and guesses ("a very large fish rolling over"), and he never knows the cause. None of them can fire on an absence. Barnaby already remarks on shivers, so once Fin is here, let only one character remark on any one shiver, picked at random from those on the island. Otherwise a single shiver can post two or three shiver lines in a row.
- **Bites after a shiver** ("The fish bite better after", and the float that goes under just as the island shivers) are Fin's belief and a happy coincidence, not a mechanic. The game's catches don't change after a shiver.
- **The weather lines** each carry a `kind`: mist, drizzle or dusk. Play mist and drizzle only when the pond shows that weather, and dusk only at dusk on the local clock. They're best kept occasional, the dusk line especially, which quietly pays off his letter ("the pond does a thing with the light"). Leave it unexplained.
- **The clues** need the shed. The rodsEarly line introduces it ("There's a shed by the jetty now"), so it reads best before the licences. Only the clues carry his past. Two other lines read differently once you know ("I've been saving that one", and the dusk line), but neither points at it.
- **The tap lines** don't depend on Barnaby, Síofra or the heron being there.

**What this tests:**
- Terrible puns, told with total sincerity: "oh my cod", "just for the halibut", "reely", and the kingfisher that turns out to be the competition.
- Lovable bore energy: an hour on barbels, if you sit down.
- He's prepared, not practised: Latin names but no worm sense, the book against the fish, and learning on the job only in the cloud sea.
- Catch and release: "They always go back."
- Lines that reread later: "I've been saving that one", "all nice days, now", "in my mind".
- An ordinary letter that never mentions death and points at dusk at the pond.

#### Ready for the brainstorm (Draft, 2026-10-25)

**Decided by the owner (2026-10-25), answering the questions below.** Where these differ from the Ideas below, these win.
- **The fish yield goes,** with Fin's build: the wetland's card becomes "Cranberries grow here.", so nothing pays for fish (Q1, option a). Until then the wetland keeps it.
- **His bench is the pond bench.** It appears, free, when he does, at its own spot by the pond, and the shop stops selling it, with his build. A player who already bought one keeps it, and he sits on it (Q2).
- **Notes before he's here:** the narrator's note for any fish caught before he arrives, his own once he's here (Q3).
- **Big catches:** once he's here, any spot's big catch waits at his bucket, by the pond or on the jetty (Q4).
- **Unblocking his arrival** (the restorations and the honey) is the game session's call (Q5).
- **The shared shiver pick** is built in his build, one character per shiver (Q6).
- **The clues by the lake jetty:** accepted that a player who never claims the wetland never finds them (Q7).
- **Islander, or a spot, before he's here:** his line for it is skipped (Q8).
- **His dusk line** posts with Síofra's moments, at 18:00 (Q9).
- **"The jetty is finished."** stays as his found title at the jetty, word for word with movedToJetty (Fit).

Prep for the owner's brainstorm on Fin's build, as Síofra's was for hers. It decides nothing. The game lines above stay the working proposal, no line in them is changed here (revisions under Fit are suggestions), and everything new is tagged Idea. Checked on 2026-10-25 against `origin/main` 9d1c165, `idle/b6-fishing` 1ef74b5, `feat/siofra` a5d99cd (c695ff9 plus main's #71) and `idle/a5-seasons-weather` fcc7b16, with each point of the fit-check of 2026-10-24 (`fin-fit-2026-10-24.md` in the voice drafts) checked again; its M numbers are cited below. Cost key, as for Síofra: **Cheap** reuses what Barnaby built; **Medium** needs its own rule and tests; **Expensive** is new world behaviour plus art. The game session gave no tiers for Fin, so every tier here is *(inferred)*, read from the code.

**His slots by build cost**

| Slot | Cost | Sits on (main) | Gate | Notes |
|---|---|---|---|---|
| Hover name | Cheap *(inferred)* | Barnaby's `name`, "Shown on hover" (`src/game/content/barnaby.ts`) | Once found | "Fin" from the start. The found detail introduces him, so there's no stage before his name, unlike Síofra's. |
| found (`atJetty`) | Cheap *(inferred)* | `findBarnaby`'s toast and `character` line (`src/game/systems/characters.ts`), watching `restoration.done.pondJetty`. The `restoration` step runs before `characters` (`src/game/advance.ts`), so he's there the same tick | The Fishing Bench restored, with the wetland owned (owned counts as docked, as `NEEDS` in `src/game/systems/mail.ts` reads it) | Its toast lands beside the restoration's, and its title says the jetty is finished: see Fit. |
| found, by the pond (`byPond`) | Cheap *(inferred)* | As found | The Fishing Bench restored, the wetland not owned yet | The usual path: the bench is second on the board, and with the board on, the wetland waits for four finished restorations (`requiresBundles`, `src/game/config.ts`). |
| movedToJetty | Cheap *(inferred)* | `seeToLand`, which already moves Barnaby on a claim, with a quiet `character` line | Found `byPond`, then the wetland claimed. Once | No toast and no detail, and never if he was found at the jetty. |
| Tap at the jetty (12) | Cheap *(inferred)* | `tapBarnaby` on main; `pickTap`, `SAYS_MS` and `saidFrom` in `src/game/systems/characterKit.ts` (`feat/siofra`) | Once found, in either stage | No fixed first tap, which the kit already allows for Síofra. |
| His figure, at two spots | Medium as a stand-in; Expensive as the model *(inferred)* | Barnaby's `TAP` and `CHARACTER_BLOCKERS` (`src/world/places/characters.ts`); Síofra's placeholder at `SIOFRA_SPOT` (`src/world/features/Siofra.tsx`, `src/world/isleSpots.ts`, `feat/siofra`); `<Jetty />` at the `wetland_jetty` anchor (`src/world/WildIsles.tsx`) | On the bench by the pond in `byPond`; on the jetty in `atJetty` | Nothing draws a bench for the restoration yet (Questions). His look is `CAST.md` §5's, with the rod a separate prop. Once he's at the jetty he still fishes the pond sometimes (Decided 2026-10-25, `CAST.md` §5), so whether the figure is ever shown there is a build call (Idea). |
| bigCatch (5) | Expensive *(inferred)* | Only the `fishing.big` save slot and its sanitiser (`src/game/systems/fishing.ts`); the catches, `noticeBigCatch` and the reel-in are on `idle/b6-fishing` | A big catch waiting, once he's here. Two rows wait for `atJetty` | The B6 port first, then his bucket with a tail over the rim (`CAST.md` §5, How he looks). b6's own quiet `fish` line can sit beside his. |
| shiver (6) | Medium *(inferred)* | `barnabyRemark` and his `lastRemarkDay`; `shiver()` calls only him (`src/game/systems/shiver.ts`) | Once here, right after one, at most once a day. Three rows wait for `atJetty` | Needs the shared pick (Questions). `ShiverSize` is big or small, as his `fits` tags expect. |
| newSpot: wetland | Cheap *(inferred)* | A watcher on `restoration.done.boardwalkLoop`, like `sawLand`; `FISH_SPOTS.wetland.opensWith` (`src/game/content/fish.ts`) | The Boardwalk Loop done, once he's here (Idea) | Always `atJetty` *(inferred)*: the loop is on the wetland's board, so the wetland is owned. |
| newSpot: tarn | Cheap *(inferred)* | As above, on `bothy` | The Crofter's Bothy done, once he's here (Idea) | The highland's board. |
| newSpot: cloud | Cheap *(inferred)* | As above, on `skyHarbour` | The Sky Harbour done, once he's here (Idea) | The islet's board. |
| weather: mist | Expensive *(inferred)* | Nothing yet: `seasons` is off and `Weather()` draws nothing (`src/world/features/Weather.tsx`). `weatherForDay` is on `idle/a5-seasons-weather` | A misty day, once he's here | The line is cheap; the weather isn't. |
| weather: drizzle | Expensive *(inferred)* | As mist | A drizzly day, once he's here | On A5, drizzle falls as snow in winter, so the line would rest then *(inferred)*. |
| weather: dusk | Medium *(inferred)* | The sky follows the clock (`src/world/skyPalette.ts`), but game code has no dusk. Síofra's 18:00 moments (`feat/siofra`) are the nearest rule | Dusk on the local clock, once he's here | 18:00 comes before the evening light (18:36), so dusk needs a post time of its own (Questions). |
| milestone: Islander | Cheap *(inferred)* | The level-up line in `src/game/core.ts`; `levelTitle(10)` is "Islander" | Earned once he's here (Questions) | No detail. |
| milestone: finale | Cheap, after the cottage *(inferred)* | Nothing yet: `cottage` is off and `advanceCottage` does nothing (`src/game/systems/cottage.ts`) | The cottage reaches Home | Waits on the cottage feature. It carries the rods in their wrappers. |
| clue: rodsEarly | Expensive *(inferred)* | Nothing for found objects: no such page in `AlmanacPageId` (`src/ui/surfaces.ts`). `findDetail` (`src/game/systems/restoration.ts`) is the nearest one-off line | `atJetty`, and the shed | The shed is post-alpha art (bible Q4), on the `shedPatch` (`art/BLUEPRINT.md`). Reads best first. |
| clue: tackleBox | Cheap after the first *(inferred)* | The same object system | `atJetty` | By his stool, with a sticker that shows no figures (`CAST.md` §5). |
| clue: licences | Cheap after the first *(inferred)* | The same object system | `atJetty`, and the shed | The biscuit tin stays shut on its shelf: the licences are never drawn. |
| His letter | Medium *(inferred)* | The letters on main (`letters` on, `src/game/systems/mail.ts`); `LetterSender` is only `'barnaby'` (`src/game/content/letters.ts`) | `atJetty` | Later, by the owner's letters design. Needs a second sender, and keeps its own sign-off. |
| Fish notes (40) | Cheap on b6's table; the port is Expensive *(inferred)* | `FISH` is empty on main (`src/game/content/fish.ts`); the 40 fish and their narrator notes are on `idle/b6-fishing` | Each fish once caught; his voice once he's here (Questions) | Ids, names and spots still match b6 one for one. |
| Barnaby's `fin` note | Cheap *(inferred)* | `finOnJetty: () => false` in `NEEDS` (`src/game/systems/mail.ts`) | `finOnJetty`, in either stage | One gate to wire. The note names no jetty, so it reads right by the pond too. |

**A first build (Idea)**

A proposal for the brainstorm, not a decision.
- **The fixed cost:** a `fin` slice beside `barnaby` and `siofra` in `state.characters`, on the kit `feat/siofra` adds, and the B6 port from `idle/b6-fishing`, which his catches and notes stand on. *(inferred)* The port is the larger part.
- **In it:** the hover name; both founds and movedToJetty; the 12 taps, from a stand-in on the bench and then the jetty; the big catches; the three newSpot lines; the Islander line; the 40 fish notes; Barnaby's `fin` note; and one medium slot, his six shiver lines with the shared pick.
- **Why those:** they're his first phase, affection, "by far the longest phase" (`CAST.md` §5, The reveal): jokes, fish and the big catch, which is "a small daily kindness" (`CAST.md` §5, Ideas that use what's there). The bench's card says "fishing opens", so *(inferred)* the port belongs in the same build. The shared pick is needed as soon as a second character remarks, and Síofra's build left it for his (`feat/siofra`, the Síofra spec).
- **Deferred:** mist and drizzle, until A5's weather; dusk, until it has a post time of its own; the finale, until the cottage; the three clues, until the shed and somewhere in the almanac for found objects; his letter, by the letters design; and the real model.
- **Why that's fine:** he's an extra, like Síofra. Nothing of his removes anything, and nothing counts him. The clues are the slowest strand anyway (bible §12, S3 to S5), and "nothing depends on the player seeing everything" (bible §12, Loose dependencies). Each deferred line is one more thing turning up later, so nothing built first needs rewriting.

**Fit with what's shipped**

His lines stay as they are. Every revision below is a suggestion, not applied.
- **Fishing is still a shell on main.** `FISH` is empty, `advanceFishing` returns false, `Fishing()` draws nothing and `fishing` is off (`src/game/features.ts`). The fit-check's premise holds (M1): his notes replace nothing on main yet, and the port comes first.
- **The wetland's fish yield.** "{n} fish were landed in the wetland." pays coins (`src/game/content/yields.ts`, `fish`), from the day the isle is bought, and the wetland's card reads "Cranberries grow here, and fish can be caught." (`src/game/config.ts`). Nothing clashes while he's out of the game (M4). See Questions.
- **b6's jetty is on the pond.** b6's scene (`src/world/features/Fishing.tsx`) rests a rod at the tip of a jetty on the pond, and shows only the pond's big catch (M5, M6). The pond has no jetty. Suggest, for the port: the rod becomes his prop, and the big catch shows at his bucket, wherever he sits.
- **Where a catch is said to be.** b6 words a first catch by its spot ("at the pond", "in the wetland"), not by where he sits, which fits "he still fishes the pond sometimes". The wetland's fish bite only once the Boardwalk Loop is done, so until then every catch is the pond's, even with him at the jetty. No line clashes.
- **"The jetty is finished."** The jetty comes with the wetland, and the Fishing Bench builds nothing on the lake. Found at the jetty, his title reads as if the bench had finished it. movedToJetty plays as the wetland docks, so there it reads fine. Suggest, for the jetty found only: "There's already someone at the end of the jetty: a skeleton in a sun hat, holding a rod the wrong way round, perfectly happy." This would end the word-for-word tie between that title and movedToJetty (Decided 2026-10-25, his notes, "The move"), which would keep the old title and read fine as the wetland docks, so the owner decides. His letter's "Thank you for the jetty" still reads: claiming the wetland brought it. `art/ASSETS.md` (`jetty`) still says the restoration "builds the wetland jetty", under its old name: suggest it says the jetty comes with the wetland.
- **The board's picture.** `BundleArt.tsx` (`pondJetty`, `src/ui/panels/island/BundleArt.tsx`) still draws a jetty with a rod, for a card that now says "A bench by the pond; fishing opens." Suggest the picture becomes a bench by water, with the rod resting against it. It's the art's call, and not a line change.
- **Two toasts on the bench's day.** `finish()` writes "Fishing Bench restored" with a toast (`src/game/systems/restoration.ts`), and his found brings a second on the same tick. Suggest: his stays, as one of the three arrivals' toasts ("Toasts, taps and letters"), and the game session decides whether the restoration's goes quiet.
- **Found at once, not at 06:00.** Barnaby is found at the next 06:00; Fin is "simply already there". Suggest: build the two apart, so his find doesn't take the 06:00 rule by accident. A save that already has the bench restored when his build ships would find him on the next tick; none can exist on main today.
- **What keeps him out on main.** `restorations` is off, so no deposit lands. The bench asks for 8 wood and 2 honey (`src/game/content/bundles.ts`, `pondJetty`), and honey is now collected straight into coins, never reaching the barn (`docs/idle-loop.md` B2), so it can't be finished even with the switch on (M10). See Questions.
- **Visits, not moves.** The newSpot lines have him sitting at the Sky Harbour, walking the boardwalk and naming fish at the bothy, while his figure is on the bench or the jetty (M11). Suggest: read them as visits, and keep the one figure where it is.
- **One image, two voices.** Barnaby's small-shiver line about a pond and a jumping fish is close to Fin's pond-ripple shivers (M15). The one-character-per-shiver rule keeps them apart on any one shiver. No line changes.
- **Fixed since 2026-10-24:** M2, M9, M12 and M14.
- **Still open, for the port.** b6's Fish page shows counts ("{n} found", "caught … times", "{n} big ones"), against the no-counts rule (M13); the stone loach's card draws two barbels to the note's six (M7); the bream's "Arrives at dusk" sits beside "By night" (M8). Each is the game session's, and none is a line change.

**Questions for the brainstorm**

1. **The fish yield.** The wetland's idle yield lands fish and pays coins for them ("{n} fish were landed in the wetland."), and Fin's fish always go back and never pay. Does the wetland keep a fish yield that pays, beside his catch and release? *Options (Idea):* (a) the yield goes, and the wetland's card becomes "Cranberries grow here." (the one way bible §11 C names); (b) the yield stays as it is, kept apart from his catching; (c) the yield stays and its line is reworded so it doesn't read as angling (the fit-check's M4). Only (a) leaves nothing that pays for fish beside "his fish never pay"; (b) and (c) keep the wetland's coins. G2 (`docs/idle-loop.md`) says random things, fish among them, never pay, but the yield is a steady rate, not a roll, so whether G2 covers it is part of the call. *Recommendation (Idea):* none of the three over the others. (a) is the only one the bible spells out. The call is the author's, to settle in this design, and what the farm would lose in coins is the game session's to weigh. *Sources:* bible §11 C, the fish-yield row; `src/game/content/yields.ts`; `src/game/config.ts` (`wetland`); the fit-check's M4.
2. **Fin's bench.** The shop sells a "Pond bench" (decor, from level 10, one only: `src/game/config.ts`, `bench`), drawn at its own slot by the pond (`BENCH`, `src/world/layout.ts`). Does Fin sit on that one, or does the Fishing Bench restoration bring its own? *Options (Idea):* (a) the shop's: one bench, one slot and no new art, but it's drawn only once the player has reached level 10 and paid 500 coins, so on the usual path he'd have nowhere to sit when he arrives, and the restoration would draw nothing; (b) its own: drawn when the restoration is done, so restoring it is all it takes, at the cost of two benches by one small pond unless the shop's moves or goes, which is the art's call. *Recommendation (Idea):* (b), since the board opens at level 6 (`UNLOCKS.island`) and the shop's bench at 10; (a) is the cheaper build if the owner would sooner hold his arrival until the bench is bought. *Sources:* bible Q4 (Open); `CAST.md` §5, Already in the game.
3. **Fin's notes before Fin.** The cloud sea, the wetland and the tarn can open before the Fishing Bench, and his notes are in the first person. *Recommendation (Idea):* keep b6's narrator notes for any fish caught before he's here, and show his once he is, as a second field (M3). The pond opens with him, so its 12 fish are always his. *Sources:* "Collisions and gaps", "Fin's lines before Fin"; `FISH_SPOTS` (`src/game/content/fish.ts`).
4. **Big catches from other spots.** b6 shows only the pond's; the rest wait on their almanac card. *Recommendation (Idea):* once he's here, any spot's big catch waits at his bucket, by the pond or on the jetty; before that, as b6 does. His big-catch lines name no spot. *Sources:* his notes, "The big catch lines"; `CAST.md` §5, How he looks; b6 `src/world/features/Fishing.tsx`.
5. **The restorations and the workshop.** He can't arrive on main: the board is off, and the bench's honey can't reach the barn. *Recommendation (Idea):* the game session's sequencing call, either a way for honey to reach the barn or other needs for the bench. The lore asks only that restoring it brings him and opens fishing. *Sources:* `src/game/content/bundles.ts` (`pondJetty`); `docs/idle-loop.md` B2 and B3.
6. **The shared shiver pick.** Barnaby remarks alone (`src/game/systems/shiver.ts`), and Síofra's build left her shiver lines for Fin's. *Recommendation (Idea):* build one picker in his build, drawing on whoever is here and hasn't remarked today; her rows join it when her shiver lines are built. Whether the day is capped across everyone stays the game session's call. *Sources:* "The shared pick and the daily limit" (Idea); Shared rules, "One character per shiver".
7. **The clues wait for the wetland.** His shed and things stand by the lake jetty, so a player who never claims the wetland never finds them. *Recommendation (Idea):* accept it. Seeing all of it is optional (`CAST.md` §5, Rules for the reveal), and the finale line still carries the rods in their wrappers. *Sources:* bible Q4 (Implied); bible §12, S3 and S4.
8. **Islander, and spots, before Fin.** Level 10 can come before the bench, and so can a spot. *Recommendation (Idea):* skip his line if he isn't here when it happens: a late congratulations reads oddly, and neither line is a clue. "Fin's lines before Fin" holds them until `finOnJetty`; this asks what happens to one held. *Sources:* "Collisions and gaps"; the fit-check's open call 3.
9. **When does dusk post?** Síofra's moments post at 18:00, before the evening light. *Recommendation (Idea):* a post time inside the sky's evening, after 18:36 and before night at 21:36 (`src/world/skyPalette.ts`), never straight after a shiver, and only now and then. The sky's `isNight` starts at 21:00, though, and b6's fish bite by night from 20:00 (`FISHING.dayEnds`), so 20:00 to 21:00 fits all three edges *(inferred)*. *Sources:* his notes, "The weather lines"; "Ambient lines straight after a shiver".

### Game lines, for the game spec (2026-10-25)

These are for Fin's first build, which can hold them in one wording file, as Barnaby's and Síofra's builds do (Idea: `content/fin.ts`). They follow the owner's answers of 2026-10-25 ("Decided by the owner" in "Ready for the brainstorm" above) and the first build proposed there, and this subsection is the source of truth for that build: build from it, not from "Game lines, for a future game spec" above. Titles are checked at 160 characters or fewer, details at 300 or fewer, the toasts at 60 or fewer, the tap lines at 80 or fewer and the fish notes at 150 or fewer. Every line is the draft's, word for word, except three, each the owner's call, 2026-10-25: tap 14, the carp line from "Not picked yet", trimmed to fit a tap, from "Did you know carp can live for decades? I read that in a book I bought for when I had time. I have time now. No idea where the book is." to "Carp can live for decades. I read it in a book I bought for when I had time."; Síofra's late line, trimmed to fit a tap, from "Your fisherman says he's got all the time in the world now. I didn't know you could run out." to "Fin says he's got all the time in the world. I didn't know you could run out."; and the dusk line, moved to yesterday's dusk because it posts at 18:00, before the game's evening light, from "Dusk at the pond. The light went gold" to "Dusk at the pond yesterday. The light went gold". Two of his lines join from "Not picked yet" (the owner, 2026-10-25): taps 13 and 14. His mist and drizzle lines, the finale line, his clues and his letter are deferred, so none of them is here. His dusk line is here, but deferred too, with its post time. The gates are defined in "Where he is, and the gates", in the notes. One Síofra line is recorded at the end for her later build.

**Hover name:** Fin (shown from the moment he's found)

**found** (the Fishing Bench is restored after the wetland has docked: `atJetty`. He's simply already there, so it plays on the restoration's tick: the toast, and one `character` journal line)
- *Toast:* Someone's already fishing off the jetty.
- *Title:* The jetty is finished. There's already someone at the end of it: a skeleton in a sun hat, holding a rod the wrong way round, perfectly happy.
- *Detail:* He waved with the rod, nearly lost it in the lake, and introduced himself. "Finlay. Fin, like the fishy bit." He looked very pleased with that.

**foundByPond** (the Fishing Bench is restored before the wetland has docked: `byPond`. As found, with him on the pond bench, which appears, free, when he does)
- *Toast:* Someone's already fishing at the pond.
- *Title:* There's already someone fishing at the pond: a skeleton in a sun hat, sitting on the bench with a rod the wrong way round, perfectly happy.
- *Detail:* He waved with the rod, nearly lost it in the pond, and introduced himself. "Finlay. Fin, like the fishy bit." He looked very pleased with that.

**movedToJetty** (he was found `byPond`, and the wetland has now docked: once, and never if he was found at the jetty. One quiet `character` journal line, the found title on its own, word for word)
- *Title:* The jetty is finished. There's already someone at the end of it: a skeleton in a sun hat, holding a rod the wrong way round, perfectly happy.
- No toast and no detail.

**tapAtJetty** (tapping his figure, on the bench by the pond in `byPond` and on the jetty in `atJetty`; floating label, not written to the journal; every line plays in either stage)
1. Oh my cod. Sorry. I say that when I'm excited. I'm always excited.
2. I'm here just for the halibut. There are no halibut here. I just like saying it.
3. Why are fish so clever? They live in schools. I've been saving that one.
4. Fish with a crown? A kingfisher. No, that's a bird. Birds are the competition.
5. I don't like to carp on. Unless it's about carp. Then there's no stopping me.
6. I could tell you about barbels for an hour. I will, if you sit down.
7. A fish feels footsteps through its lateral line. Hence the tiptoeing.
8. Eels can cross wet grass on a damp night to find a new pond. Show-offs.
9. The book says you hold it like this. The fish say otherwise.
10. I know the Latin for every fish here. Not which end of the worm goes on first.
11. Catch and release. Mostly release. Mostly before the catch.
12. They always go back. Each one gets a joke first, to take home.
13. I'd have come years ago. You know how it is. Always one more thing to put by.
14. Carp can live for decades. I read it in a book I bought for when I had time.

**bigCatch** (once he's here, any spot's big catch waits at his bucket, by the pond or on the jetty, until it's noticed; noticing it writes one `character` journal line. The two rows that name the jetty wait for `atJetty`. *Idea, Barnaby's pattern:* from the rows whose gate holds, each comes round once, at random, before any comes round again, and never the same row twice running)

| Gate | Title | Detail |
|---|---|---|
| `finOnJetty` | There was a big one on Fin's line, and Fin was trying very hard to look calm about it. | He managed about a second. After that you got the proper name of every fin on it, before it went back. |
| `atJetty` | Big catch at the jetty. Fin held it up so you could see the whole of it, and the whole of it was splendid. | He says it's the finest of its kind. He says that every time, and means it every time. They always go back, and so did this one. |
| `finOnJetty` | Reeling in the big one took a minute. Fin's account of it took twenty. | He slipped it back, gently, and finished the story anyway. |
| `finOnJetty` | Fin turned the big catch this way and that, admiring it from every side, and pronounced it perfect. | Back it went, lowered as carefully as if it were made of glass. |
| `atJetty` | You found Fin at the jetty with a big one, telling it what a good fish it was. | It took the compliment well. He let it go with a little more ceremony than was strictly necessary. |

**shiver** (right after a shiver, when the shared pick chooses him, at most once a day; one `character` journal line, from the rows tagged with the shiver's size or "either". The three rows that name the jetty or the lake wait for `atJetty`. *Idea, Barnaby's pattern:* from the rows whose gate holds and whose size is the shiver's or "either", each comes round once, at random, before any comes round again, and never the same row twice running)

| Size | Gate | Title | Detail |
|---|---|---|---|
| big | `atJetty` | The island gave a big shiver, and the whole jetty hummed. | "Felt that?" said Fin. "The fish bite better after. I've no idea why, and I've decided not to ask." |
| big | `finOnJetty` | The big shiver set ripples running in across the pond from every bank. | Fin raised his sun hat to it, just in case. Then he got his line back in, sharpish. |
| small | `finOnJetty` | A small shiver. The tip of Fin's rod gave a little nod. | Fin nodded back. It seemed only polite. |
| small | `atJetty` | Barely a shiver, but the lake noticed: one small ring spread out from the jetty and away. | "Well, I never," said Fin, and watched it all the way to the far bank. |
| either | `atJetty` | The island shivered, and the jetty rocked a little. Fin's guess is a very large fish rolling over, a long way down. | He's already wondering what it would bite on. |
| either | `finOnJetty` | Just as the island shivered, Fin's float dipped, bobbed up, and went under properly. | Fin isn't one to look a gift fish in the mouth. He reeled it in, had a good look anyway, and let it go. |

**newSpot** (a new spot opens to fishing while he's here; one `character` journal line, once per spot, and skipped if the spot opened before he arrived)

| Spot | Opens with | Title | Detail |
|---|---|---|---|
| wetland | `boardwalkLoop` | Fin walked the new boardwalk all the way round and arrived back where he'd started, delighted. | The reeds are full of fish he's read all about, so he's brought the books along to let the fish check his facts. |
| tarn | `bothy` | Up by the new bothy, the tarn is cold, deep and perfectly clear. Fin says you can watch the fish making up their minds. | Brown trout, Arctic charr, and the shy schelly out in the middle. He named them all on the way up, then again at the top, for luck. |
| cloud | `skyHarbour` | The Sky Harbour is finished, and Fin is already sitting on the edge of it, dangling a line into the clouds. | He's been through every book he owns, and not one of them covers this. He says it's the best thing a book has never told him. |

**milestones** (one `character` journal line, with no detail; skipped if he isn't here when it's earned)

| Milestone | Title |
|---|---|
| islander | Fin said congratulations, and that he'd lend you a rod any time. Just say. |

**weatherDusk** (deferred: not in this build. An ambient `character` journal line at the pond, its weather `dusk`, kept occasional. It posts at 18:00 with Síofra's moments (the owner, 2026-10-25), before the game's evening light, so it tells of yesterday's dusk. Once he's here, in either stage; how often isn't set beyond "occasional" (his draft notes). It isn't a weather line: the key `weatherDusk` and its weather `dusk` are only its names)
- *Title:* Dusk at the pond yesterday. The light went gold, then pink, then a colour there's no word for, and Fin stopped fishing to watch it.
- *Detail:* Afterwards he just said "There," quietly, as if he were handing it to you.

**fishNotes** (his note for each fish, the field `finNote`, on its almanac card once he's here; word for word from "Fish notes, the full set", with the ids from `idle/b6-fishing`)

| Fish | Id | Spot | finNote |
|---|---|---|---|
| Three-spined stickleback | `stickleback` | pond | Three spines, and a stickler about his nest: the male builds it, guards it and fans the eggs himself. Nobody gets near. Quite right. |
| Common minnow | `minnow` | pond | Calling something a minnow is meant to be a put-down. The minnows wear it with pride. There are loads of them, all having a lovely time. |
| Rudd | `rudd` | pond | Not a roach. Everyone says roach. Look: redder fins, golden sides, and a mouth turned up for feeding at the surface. Not a roach. |
| Roach | `roach` | pond | Silver, sensible, everywhere. The fish equivalent of a good cardigan. |
| Perch | `perch` | pond | Striped like a tiny tiger, and just as bold. First to the worm every time, and far better with worms than I am. |
| Gudgeon | `gudgeon` | pond | Two little barbels for tasting its way along the bottom. I won't go on about barbels. (I'm going to go on about barbels.) |
| Crucian carp | `crucian` | pond | Round, bronze and never in a hurry. Bites so gently the float barely twitches. Missed eleven before this one. Worth it. |
| Tench | `tench` | pond | Called the doctor fish: other fish were said to rub against it to get well. I've read every book about it. It's lovelier in person. |
| Common bream | `bream` | pond | Arrives at dusk with the whole shoal, all slime and dignity. There's a towel kept just for bream. |
| Mirror carp | `mirrorCarp` | pond | A few big scales like dinner plates, and it never forgets a crust. Not vain, I'd say. Just reflective. |
| European eel | `eel` | pond | Travels thousands of miles from the Sargasso Sea to reach fresh water. Meanwhile, I get lost going round the pond. |
| Pike | `pike` | pond | All teeth and opinions. I respect him enormously, from a safe distance. |
| Nimbus minnow | `nimbusMinnow` | cloud | Swims in cloud. The books don't cover this. For once, I'm learning on the job. |
| Cirrus eel | `cirrusEel` | cloud | My notes so far: long, wispy, very fast. Then I blinked. That's all my notes. |
| Cumulus carp | `cumulusCarp` | cloud | Grows a little on warm afternoons. Shrinks a little when I start on about barbels. A good listener, considering. |
| Stratus flounder | `stratusFlounder` | cloud | Lies flat along the bottom, being a grey day. Looks a bit under the weather. It isn't. That's just its face. |
| Sunbeam perch | `sunbeamPerch` | cloud | Warm to the touch, like a hot-water bottle with fins. Only bites while the sun's out. I hold it a moment before it goes back. |
| Rainbow skipper | `rainbowSkipper` | cloud | Turns up after a shower and skips across the cloud tops in arcs. No pot of gold at either end, though. I've been to both. |
| Lantern loach | `lanternLoach` | cloud | Carries its own little lights for the night shift. I always pack a torch and can never find it, so I sit by the loach. |
| Moonscale bream | `moonscaleBream` | cloud | Each scale holds a little moonlight and gives it back slowly. I give the bream back rather quicker. |
| Stargazer | `stargazer` | cloud | Eyes on top of its head, so it watches the stars and never the hook. That's how we met. |
| Aurora trout | `auroraTrout` | cloud | Green and violet down its sides, like the northern lights. Not in any of my books, so I've added it to all of them, in pencil. |
| Bleak | `bleak` | wetland | Not as bleak as the name suggests. Quite cheerful, actually. Somebody owes it an apology. |
| Ruffe | `ruffe` | wetland | A prickly little cousin of the perch, also called the pope. Nobody can tell me why. I've looked into it thoroughly. Nobody can tell me why. |
| Silver bream | `silverBream` | wetland | Like a common bream that's tidied itself up for company. Telling the two apart takes a magnifying glass and most of an afternoon. Bliss. |
| Ide | `ide` | wetland | Ide love to say we're close. It moves through the reeds in little groups and keeps itself to itself. Politely, mind. |
| Bitterling | `bitterling` | wetland | Lays its eggs inside a freshwater mussel, and the mussel just lets it. I can explain how. It takes about an hour. Two, with questions. |
| Dace | `dace` | wetland | Quick, slim and silver, and gone before I've finished saying hello. I'm working on a shorter hello. |
| Weatherfish | `weatherfish` | wetland | Supposed to wriggle before a storm. I've watched one for three days. Lovely weather. Lovely fish. |
| Spined loach | `spinedLoach` | wetland | Keeps a tiny spine folded under each eye, just in case, and hides in the silt all day. Never caught off guard. Except by me, by accident. |
| Zander | `zander` | wetland | Big glassy eyes, made for hunting in the dark. Gives me a look as it goes back. I like to think it's respect. |
| Burbot | `burbot` | wetland | The only member of the cod family that lives in fresh water, so 'oh my cod' is, for once, technically correct. Likes cold nights. |
| Brown trout | `brownTrout` | tarn | Spotted like a speckled egg and very particular about its flies. I tie my own. It can tell. |
| Arctic charr | `charr` | tarn | Left over from the last ice age and still fond of cold, deep water. Blushes red every autumn. Charr-ming. Sorry. |
| Grayling | `grayling` | tarn | Known as the lady of the stream. Flies a fin like a sail and is said to smell of thyme. I've had a sniff. Mostly fish. |
| Schelly | `schelly` | tarn | Shy whitefish of the cold lakes. Feeds in shoals out in the middle, always exactly one cast further than I can manage. |
| Vendace | `vendace` | tarn | One of the rarest fish in Britain, and it comes up to feed after dark. I bring a flask, a blanket and a spare flask. Straight back it goes. |
| Bullhead | `bullhead` | tarn | Bull-headed, frankly. Has lived under the same stone for years and won't consider moving. Also known as the miller's thumb. You're welcome. |
| Ferox trout | `ferox` | tarn | A brown trout that moved to the deep end and grew enormous. Rarely seen. Much discussed, mostly by me, mostly after dark. |
| Stone loach | `stoneLoach` | tarn | Stone me: six barbels. The gudgeon only has two. I try not to have favourites, but I've drawn this one in three colours. |

**For Síofra's later build** (deferred: not part of his build. A rare Síofra tap line, gate `allFinCluesFound` (defined in "Where he is, and the gates" below): it plays only after all three of Fin's clues have been found. It's her line, not his, so it joins her tap pool when her build takes it up)
- Fin says he's got all the time in the world. I didn't know you could run out.

**Notes for the game:**
- **Where he is (decided 2026-10-25), and the gates.**
  - `finOnJetty`: he's here, in either stage. It's the same need as Barnaby's `fin` note, and it doesn't mean on the jetty. A slot or row with no gate named plays under `finOnJetty`.
  - `byPond`: he's here, and the wetland hasn't docked yet.
  - `atJetty`: he's here, and the wetland has docked.
  - **Docked** *(from the code)*: the game state has no docked flag, so the wetland has docked once it's owned (`s.owned.wetland > 0`), as `NEEDS` in `src/game/systems/mail.ts` reads it ("owned counts as docked"). Its rising in (`useRiseState`, `src/world/Isles.tsx`) is drawing only.
  - `allFinCluesFound` *(Idea)*: all three clue objects (the licences, the tackle box and the early rods) have been noticed, so each has written its line and is kept in the almanac. It's a silent check: nothing shows the player a count, and the line it gates is optional. It can't hold until his clues are built.
  - On the usual path he starts by the pond and moves to the jetty when the wetland docks; if it docked first, he's at the jetty from the start. Only foundByPond is `byPond` only, and only found and the rows marked `atJetty` wait for `atJetty`. Everything else plays in either stage, since he still fishes the home pond sometimes, except movedToJetty, a one-off on the change from `byPond` to `atJetty`, and the wetland newSpot, which is always `atJetty` in practice *(from the code)*, since the Boardwalk Loop is on the wetland's board.
- **How he first arrives on main** (the restorations and the honey) is the game session's call (the owner, 2026-10-25, Q5). The lore asks only that restoring the Fishing Bench brings him and opens fishing.
- **His bench (the owner, 2026-10-25).** It's the pond bench. With his build it appears, free, when he does, at its own spot by the pond, and the shop stops selling it. A player who already bought one keeps it, and he sits on it. "Sitting on the bench" in foundByPond is that bench.
- **The fish yield (the owner, 2026-10-25)** goes with his build: the wetland's card becomes "Cranberries grow here.", so nothing pays for fish. No line here pays for one.
- **No fixed first tap.** The found detail introduces him, so all 14 tap lines play in any order from the first tap, and never the same one twice running. Taps 13 and 14 come from "Not picked yet" and play at any time (the owner, 2026-10-25).
- **Notes before he arrives (the owner, 2026-10-25).** b6's narrator notes stay for any fish caught before he's here, and his are a second field, shown once he's here. *Idea:* the narrator's keeps b6's field name, `note`, and his is `finNote`. The pond opens with him, so its 12 fish always have his. Ids, names and spots match b6 one for one.
- **Big catches (the owner, 2026-10-25).** Once he's here, any spot's big catch waits at his bucket, by the pond or on the jetty: a fish's tail over the rim (`CAST.md` §5, How he looks). The lines name no species, size or spot, so they fit any big catch, and b6's own quiet `fish` line can sit beside his.
- **The shared shiver pick (the owner, 2026-10-25)** is built in his build: one character per shiver. *Idea:* picked at random from whoever is on the island and hasn't remarked today; whether the day is capped across everyone stays the game session's call. Síofra's shiver lines join it when hers are built. His lines are reactions and guesses, he never knows the cause, and none fires on an absence. "The fish bite better after" and the float that goes under are his belief and a happy coincidence, not a mechanic.
- **Before he's here (the owner, 2026-10-25).** If Islander is earned, or a spot opens, before he arrives, his line for it is skipped, not held.
- **Kinds.** Every journal line here is a `character` line, as Barnaby's are.
- **Barnaby's `fin` note** is in this build, but its wording is Barnaby's and already on main (`src/game/content/letters.ts`), so nothing of it is here. Its one need, `finOnJetty`, is `() => false` in `src/game/systems/mail.ts` until Fin is built, and holds in either stage: the note names no jetty.
- **"Lake" (decided 2026-10-25)** is the player-facing word for the wetland's water, as in the found detail and the "Barely a shiver" row.
- **Deferred.** The weather lines: mist and drizzle until the game has weather (`seasons` is off; `weatherForDay` is on `idle/a5-seasons-weather`), and the dusk line above is deferred too (the owner, 2026-10-25): it needs no weather, only a post at 18:00 with Síofra's moments, and those are already on main *(from the code: `MOMENT_HOUR` in `src/game/systems/siofra.ts`)*, so it needn't wait for the weather when it's built. The finale line, until the cottage (`cottage` is off). The three clues, until his shed and a place in the almanac for found objects; they stand by the lake jetty, so a player who never claims the wetland never finds them (the owner, 2026-10-25). His letter, until the letters have a second sender (`LetterSender` is only `'barnaby'`). Their wording stays in "Game lines, for a future game spec" above, and each joins this subsection when it's built.
- **The earlier lists** ("Journal lines" and "When tapped") aren't built from, as before.

---

## How the pools fit together (Draft)

This section gathers the scheduling rules already written in each pool's "Notes for the game", so the game team can see in one place how the pools share the journal, the toasts, the tap labels, the letters and the shiver. It adds no rules. Each pool's own notes stay the source of truth for its lines, and where this section and a pool's notes disagree, this section says so instead of choosing. Anything that goes beyond the notes is tagged Idea. The pools are Barnaby's game lines and his field notes, the island's small oddities, Síofra's game lines and Fin's game lines; Fin's fish notes get a row of their own, because they show in the almanac. Sources are cited by these pool names, and "notes" means a pool's "Notes for the game".

### The pools at a glance

| Pool and section | Where it shows | What can set it off | Cadence and limits | Gates |
|---|---|---|---|---|
| **Barnaby's game lines** (The wizard: "Game lines, for the game spec") | Journal: found, straightToRuin, land, shiver. Toast: found only. Floating tap label: the camp and ruin taps. | found: 06:00 the first morning after level 6. straightToRuin: the highland already owned when he's found. land: a piece claimed after he arrives; the highland's line is his move into the ruin. shiver: right after one. Taps: the player. | Shiver and part-of-day lines: see Shared rules. Taps after the first are random, and camp line 1 stays in the pool. Otherwise not set. | Ruin taps once he's in the ruin. Camp line 12 only while camping, and never in the straightToRuin case. |
| **Barnaby's field notes** (The wizard: "Field notes, the full set") | Letter, readable afterwards with the other letters. | Time. The first comes the morning after he has settled (3 days after he's found, or on moving into the ruin, whichever comes first); after that, one at random from the notes whose gates are met. | One every few days. A follow-up no sooner than two days after the note it follows. Each note is sent once. | Each note's `needs` (`wetland`, `islet`, `grove`, `twoPiecesDocked`, `siofraMet`, `finOnJetty`, `inRuin`) and `after`. A letters system: on main the `letters` switch is on and posts these notes (PR #63); `idle/mail` delivers up to two a day in trigger order, not this pacing. |
| **The island's small oddities** (The island's small oddities: "Game lines, for a future game spec") | Journal only, with no toast. | The local clock, at random from the lines whose `needs` is met. | At most one every few days. Avoid the same line twice in a row. The same-day, shiver, absence and part-of-day rules: see Shared rules. | The first land docked, whichever piece. A piece in `needs` must be owned; `any` needs none. The cat line waits for the cat (level 2 today). Once the game shows weather, the highland line plays only on a showery day. |
| **Síofra's game lines** (The púca: "Game lines, for a future game spec") | Journal: glimpses, metProperly, shapes, notices, gifts, keptLate, shiver. Toast: metProperly only. Floating tap label: tapHerself, the naps and the promise setup. hare.says: the live visitor's own lines, as journal titles (in game). | The meadow claimed and level 4 reached (the hare, in game). Barnaby settled (metProperly). shiver: right after one. Taps: the player. | Shiver and part-of-day lines: see Shared rules. The promise setup plays once, and keptLate comes "a good while later". How often the shapes, notices and gifts come: "now and then", nothing more. | Never met before the meadow is claimed. The hare lines come first, the shapes play either side of meeting her, and everything else comes after. Shapes and notices by their `needs`; tap 5 needs ducks. The cat and dog lines wait if either comes after her. |
| **Fin's game lines** (The skeleton fisherman: "Game lines, for a future game spec") | Journal: found, movedToJetty, bigCatch, shiver, newSpot, weather, milestones, clues. Toast: found only. Floating tap label: the jetty taps. A noticed clue is also kept in the almanac. | The Fishing Bench restored (found: by the pond, or at the jetty if the wetland has already docked). The wetland docking after he was found by the pond (movedToJetty). The player noticing the big catch. shiver: right after one. A new spot opening. Mist, drizzle or dusk at the pond. The Islander title and the finale. Tapping a clue. Taps: the player. | Shiver lines: see Shared rules. Weather lines best kept occasional, dusk especially. Otherwise not set. | Mist and drizzle only when the pond shows that weather; dusk only at dusk on the local clock. The clues need the shed, and rodsEarly reads best before the licences. Stage gates (decided 2026-10-25, his notes' "Where he is"): `byPond` until the wetland has docked, `atJetty` after; the clues and the lines that name the jetty wait for `atJetty`. |
| **Fin's fish notes** (The skeleton fisherman: "Fish notes, the full set") | The almanac's fish log, in place of the narrator notes in `src/game/content/fish.ts` on `idle/b6-fishing`. | Not set. The fish land on their own at open spots (`CAST.md` §5, "Already in the game"). | Open spots land a fish every 45 minutes of real time (same source). | The fish's spot is open: pond, cloud sea, wetland or tarn. Not tied to Fin being there. |

### Shared rules

These bind more than one pool. Each ends with the sections it comes from.

- **One character per shiver.** Only one character remarks on any one shiver, picked at random from those on the island, so a single shiver never posts two or three lines in a row. *(Síofra's and Fin's notes. Barnaby's game-line notes don't say it; Fin's notes name him.)*
- **Each character's shiver lines at most once a day, and only right after one.** The cap covers no other lines. Read with the rule above, a day with all three on the island can hold up to three shiver lines, each after a different shiver. *(The design list at the top of each character's game lines, and each shiver table's heading.)* *In game (PR #45):* Barnaby's cap is built on his side (`lastRemarkDay`), so he makes at most one shiver remark a day, however many shivers there are.
- **Shiver lines carry a size.** Every shiver table tags its lines big, small or either. These notes don't say how the game decides a shiver's size. *(All three characters' shiver tables.)*
- **Only the oddities are kept off work events.** They post on the local clock, never on a session, a task or a commit and never straight after a shiver, because "the shiver is the only echo". The other pools' notes don't say the same of their ambient lines (see "Ambient lines straight after a shiver"). Fin's better bites after a shiver are his belief, not a mechanic. *(The oddities' "Never on a work event"; Fin's notes; "The echo", Decided.)*
- **Never on an absence.** No shiver line can fire on one. The oddities add that nothing fires because the player has been gone, and nothing is saved up for their return. *(Barnaby's, Síofra's and Fin's shiver notes; the oddities' "Pacing"; "The echo", Decided.)*
- **Nothing to play, nothing said.** The oddities and the field notes do nothing when no line is available, and nothing says so. Síofra's notices fire only on what's there. *(The oddities' "When the pool opens"; the field notes' "Pacing"; Síofra's "The notices".)*
- **Oddities keep clear of the characters.** No oddity on the same day as Barnaby's, Síofra's or Fin's journal line or letter, so it never reads as the answer to a remark. As written, taps don't count: they're floating labels, not journal lines. *(The oddities' "Pacing".)*
- **Lines that cover part of a day.** The oddities and Síofra post them late in the day or the next morning, not the moment they're picked, and the oddities apply their pacing to the day of posting. Barnaby's meadow, orchard and highland land lines go the next morning if the journal would otherwise post them the instant a piece is claimed, or the looseness is accepted. *(The oddities', Síofra's and Barnaby's notes.)*
- **Only Barnaby has a fixed first tap.** It is always his introduction, camp line 1. Síofra and Fin have none, because the metProperly and found details introduce them, so their taps play in any order from the start. Síofra's hover name stays "Brown hare" until she's met. *(All three characters' notes.)* *In game (PR #45):* a new round of his taps never starts on the line he just said.
- **Toasts, taps and letters.** Only the three arrivals carry a toast: Barnaby's found, Síofra's metProperly and Fin's found. Every tap line is a floating label, never written to the journal. The field notes are the only letters with a schedule. *(Each character's game lines; the oddities' "Quiet story lines"; the field notes' "Pacing".)* Letters carry no toast (the owner's call, 2026-10-24): a quiet journal line and an unread seal instead.
- **No pool waits on another, except by a gate.** Barnaby's and Fin's taps need nobody else. Only Síofra's metProperly detail mentions Barnaby, and nothing of hers mentions Fin. The field notes wait for `siofraMet` and `finOnJetty` before naming them. The oddities need nobody. *(All five pools' notes.)*
- **Shared assumptions.** "The glade" (the oddities, and Barnaby's cottageLand line) assumes the piece keeps the name "Woodland glade". "Thursday" (Barnaby's islet line and two field notes) reads fine although the journal shows weekdays: the plans are plans, and the verdict says "give or take a Thursday". *(The oddities' "Names"; Barnaby's "Names and days"; the field notes' "Thursday".)*

### A dry run: one player's first fortnight

**Idea.** One plausible path, day by day, keyed to the events in bible §12 ("What sets each beat off"). It's an illustration, not a schedule. The player opens the island every day and works every day except day 12, when they open it and do no work. The levels and days are invented. They claim the meadow, the islet, the wetland and, late, the highland. **Collision** marks two rules meeting, **Silent** a pool held back, and **Gap** a question the docs leave open. Every Collision and Gap is taken up under "Collisions and gaps". It predates the hare's shipped level-4 gate (`CAST.md` §4, The hare visitor), so read her day-1 and day-2 lines as starting once level 4 is reached, on day 3 or 4.

| Day | What happens | What could fire, and where | Watch |
|---|---|---|---|
| 1 | The meadow is claimed and docks: the first land. | The oddities open: the meadow and `any` lines (journal). The Brown hare visitor, and her glimpses (journal). | **Collision:** a glimpse and an oddity on one day, if a glimpse counts as a character's line. Nobody yet remarks on the shivers. |
| 2 | Level 2: the cat moves in. | The cat line joins the oddities. Glimpses, and shapes, which play either side of meeting her (journal). | **Gap:** nothing says when the shapes may start. |
| 3 | The islet is claimed. | islet-cloud joins the oddities. Hare lines and shapes. | `twoPiecesDocked` is true, but no field note comes before Barnaby settles. |
| 4 | Level 6, in the evening. | As day 3. | Nothing new until 06:00. |
| 5 | 06:00: Barnaby is found. | found (toast, journal). Camp taps, the first always line 1 (labels). A shiver line, right after one (journal). | **Silent:** the oddities, blocked by his found line alone. |
| 6 | The wetland is claimed. | His wetland land line and a shiver line (journal). Hare lines and shapes. | Two Barnaby journal lines in one day: nothing stops it. **Silent:** the oddities. |
| 7 | An ordinary working day. | His shiver line and taps. Hare lines and shapes. | **Silent:** the oddities, on any day with a character's shiver line. |
| 8 | Barnaby settles, 3 days after he's found. | Síofra's metProperly (toast, journal), then the rest of her pool. Shiver lines. | **Gap:** two characters now share the shivers (see "The shared pick"). |
| 9 | The morning after he settles. | The first field note (letter): bell, cloud-sea, docking-height or siofra-readings. Síofra's journal lines. Shiver lines. | **Collision:** siofra-readings could come the morning after she's met. **Silent:** the oddities, blocked by the letter. |
| 10 | The Fishing Bench is restored. | Fin's found (toast, journal), jetty taps (labels), big catches (journal), pond fish notes (almanac). Shiver lines. | **Collision:** three arrivals in six days. The `fin` note joins the field notes. The wetland docked on day 6, so he's at the jetty from the start: the jetty found, and no pond stage. On the usual path the Fishing Bench is restored early (second on the list), well before four are done and the wetland can be claimed (`origin/main` `src/game/config.ts`), and he starts by the pond. |
| 11 | Dusk at the pond. | Fin's dusk line (journal). A second field note, the earliest a follow-up to day 9's could come (letter). Shiver lines. | **Gap:** only the field notes are scheduled as letters; Síofra's and Fin's single letters have no slot. |
| 12 | A day with no work: the player opens the island but starts nothing. | No shiver lines. Síofra's notices, shapes and gifts, and Fin's weather (journal). An oddity, but only if no character posts in the journal. | **Silent:** the shiver lines, as they should be: nobody remarks on a day without work. The oddities' best chance. |
| 13 | The highland is claimed, late. | His highland land line ("before dark", so perhaps the next morning). Ruin taps join, and camp line 12 drops. | He settled on day 8, so moving in starts nothing new. `ruin-stairs` joins the field notes. |
| 14 | The next morning. | His held-over highland line, a field note (`ruin-stairs`, `fin` or a follow-up), and everyone's journal lines. | A held-over land line and a field note share one morning, and no rule stops that. **Silent:** the oddities again. |

### Collisions and gaps

No two pools' notes contradict each other outright. Each item says where it comes from, and every recommendation is an Idea for the game team or the author.

- **The shared pick and the daily limit.** *From:* Síofra's and Fin's notes; each character's design list. If the character picked for a shiver has already remarked today, nothing says whether someone else takes it or nobody does, and nothing caps the day's total. Barnaby's game-line notes don't mention the shared pick. **Idea:** build one shiver picker with Barnaby's lines, drawing only on characters who are on the island (Barnaby once found, Síofra once met, Fin once the jetty is restored) and haven't remarked today. Whether to cap the day across all three is the game team's call. *In game (PR #45):* only Barnaby's own daily cap is built. The shared pick isn't, because he's the only character so far, and the one-per-shiver rule goes on top when a second one arrives.
- **What blocks an oddity.** *From:* the oddities' "Pacing". The rule runs one way: no character pool knows about it, and a shiver line can still come after an oddity has posted. Nor does it say whether Síofra's glimpses and shapes, which don't name her, count as a character's line. **Idea:** count every journal line from the three characters' pools, glimpses and shapes included, since a shape beside an oddity is the very answer the rule guards against. One way to close it: post an oddity late in the day, and let no shiver line follow it that day. If a claim, a restoration or a tapped clue lands after one, the game team decides which wins.
- **Oddities and a steady worker.** *From:* the oddities' "Pacing"; every character's shiver lines. Once Barnaby is here, any day with a shiver line blocks the oddities, so someone who works every day may rarely see one (the dry run, days 5 to 14). Nothing breaks: they're occasional by design. **Idea:** accept it, or let the characters remark on only some working days. The author's call.
- **Settling, and crowded days.** *From:* Barnaby's found and straightToRuin; the field notes' "Pacing"; Síofra's design list; `CAST.md` §6 (Idea: arrivals are spaced out). On the usual path her meeting and the first field note fall on consecutive days. But straightToRuin settles him at once, so found (a toast), straightToRuin and, if the meadow is claimed, her metProperly (a second toast) can share his first morning, with the first field note the next. A highland claimed during his first 3 days squeezes his highland line, her meeting and the first note into a day or two in the same way. siofra-readings can also be the first note, the morning after she's met, and in the dry run all three arrive within six days. **Idea:** hold her meeting until at least the day after he's found, which still keeps "once Barnaby has settled", and hold siofra-readings for a few days after `siofraMet`.
- **When Síofra's shapes may start.** *From:* Síofra's "Before and after she's met". The shapes don't name her, so they "can play on either side of meeting her", but nothing says when they begin. They could start the day after the meadow is claimed, beside the hare's glimpses. **Idea:** start them after the first glimpse, so the hare lines do come first, and leave the rest to the game team.
- **Letters outside the pools.** *From:* "A letter" under the wizard, the púca and the skeleton; "The echo" (Decided). Only the field notes have a schedule. Barnaby's "Day three" letter, Síofra's and Fin's single letters and the echo's shiver-chart letter sit outside the game lines, with no trigger or cadence. Built as they stand, two letters could land on one day (`idle/mail` allows two a day), and the echo's letter recounts a morning of three shivers in one remark, which neither "only right after one" nor "at most once a day" covers. **Idea:** one letter a day across everyone, keeping the field notes' pacing. Whether the echo's letter line is ever sent is the author's call: it's Decided text. *Decided (2026-10-24):* the echo's shiver-chart letter is a voice sample only, not game text. *Plan:* every letter's sender, trigger, cadence and gates, and the shared letter rules, are in "Letters: who writes, and when" below.
- **Ambient lines straight after a shiver.** *From:* the oddities' "Never on a work event"; Síofra's design list ("now and then"); Fin's weather notes. Only the oddities are kept off work events. A Síofra shape or gift, or a Fin weather line, posted straight after a shiver could read as part of the echo. **Idea:** post those on the local clock too, never straight after a shiver.
- **Time away.** *From:* the oddities' "Pacing"; the field notes' "Pacing"; Barnaby's design list; `CAST.md` §6 (Idea: a beat waits until the player looks). Only the oddities say nothing is saved up for a return. The 3-day settle runs on real time, open or closed, *in game (PR #45)*: `barnabySettled` compares `foundAt + SETTLE_MS` with the clock. Nothing says whether "every few days" and "now and then" count while the game is closed. The 06:00 find is settled *in game (PR #45)*: if that morning passes while the game is closed, his found line (or straightToRuin, if the highland is already owned) leads the recap shown on return instead of a toast. After more than one night away, it's stamped at 06:00 on the day the player comes back, so the journal never shows "Today" twice. **Idea:** apply the oddities' rule to every pool that runs on time, and let the one-off arrivals wait until the player looks.
- **Fin's lines before Fin.** *From:* Fin's newSpot and milestones; Fin's fish notes; `CAST.md` C1 (Decided). Nothing gates newSpot, the Islander line or the fish notes on Fin being there. His newSpot table ties each spot to its own restoration, and the docs only say the Fishing Bench is "second on the restoration list" (`CAST.md` §7), so the Sky Harbour, the boardwalk or the Islander title could come before he does. **Idea:** hold his newSpot and Islander lines until `finOnJetty`, as the cat line waits for the cat, and keep the narrator fish notes for anything caught before he's there.
- **Part-of-day lines in Fin's pool.** *From:* Fin's notes. They list none, but his wetland newSpot line has him walk the whole boardwalk round, and his tarn line has him name the fish "on the way up, then again at the top". **Idea:** treat those like Barnaby's land lines: the next morning, or accept the looseness.

### Letters: who writes, and when (Draft)

This brings together every letter already written in this file and says who sends it, when, how often and behind which gates. It adds no letter text. The field notes keep the schedule their own notes set. The docs give the three single letters no trigger, so every trigger and gate proposed for them, and every shared rule below, is an Idea for the author and the game session. Triggers hang on events, never on dates: Barnaby found, Síofra met, Fin on the restored jetty. "His third day" counts the day he's found as the first, and "settled" is as in the field notes' "Pacing" (3 days after he's found, or on moving into the ruin, whichever comes first). The code cited is on the unmerged `idle/mail` branch unless it says `origin/main`. Run against the dry run, this puts "Day three" on day 7, the first field note on day 9, Síofra's letter on day 10 and Fin's on day 12. Two knock-ons for the author: day 10 is Fin's arrival too, so his toast and her letter's share it, and Fin's letter blocks day 12's oddity, the dry run's best chance for one ("Oddities keep clear of the characters").

| Sender | The letter | When | Gates | Notes |
|---|---|---|---|---|
| Barnaby, signing "Barnaby" | The field notes, as one group: bell, bell-rung-back, cloud-sea, cloud-sea-thursday, grove-key, grove-tuning-fork, docking-height, siofra-readings, fin and ruin-stairs (The wizard: "Field notes, the full set"). | From their notes: the first the morning after he settles (his fifth day, or sooner if he moves into the ruin first), then one every few days at random from the notes whose gates are met, a follow-up no sooner than two days after the note it follows. Each is sent once. | Each note's `needs` and `after` ("Gates", "Chains"). | Their notes are the source of truth. "A field note" under the wizard is the bell note's first draft, not a second letter. When the set runs out they stop, and nothing says so. The "Settling, and crowded days" Idea holds siofra-readings for a few days after `siofraMet`. |
| Barnaby, signing "Barnaby Wick" | "Day three" (The wizard: "A letter"). | **Idea:** his third day, the day before he settles. Once. If the player isn't there or the meadow isn't owned yet, it waits. | **Idea:** the meadow owned, since the letter measures it. In the ruin, its lean-to becomes the ruin (Decided 2026-10-25, under the letter). | **Decided (2026-10-25):** every path gets it. If he lives in the ruin when it's sent, one phrase changes (under the letter). Nothing makes it lapse. |
| Síofra, signing "Síofra x" | "Dear you" (The púca: "A letter"). | **Idea:** the second day after she's met properly, so the meeting has its day to itself. Once. | **Idea:** `siofraMet`. She signs "Síofra", and the player first learns her name at the meeting. | Opens "Dear you", not `{farm}`, on purpose (her "What this tests"). Its clover ends on the same gag as her four-leaf clover gift (her "gifts"), "counted twice, four both times". **Idea:** hold that gift until the letter has gone, so the second time reads as her repeating herself. |
| Fin, signing "Fin (on the jetty)" | "Thank you for the jetty" (The skeleton fisherman: "A letter"). | **Idea:** his third day at the jetty, since the letter has "I've been meaning to say". Once. | **Idea:** `atJetty` (his notes, "Where he is"): it thanks him for the jetty and is signed from it, so it waits for the wetland to dock. | His dusk weather line pays it off (his notes, "The weather lines"). **Idea:** hold that line until the letter has gone (so, for a player who meets him by the pond, until the wetland has docked). Its catch line was reworded on 2026-10-25 to agree with the almanac: he catches a tench, puts it back, and catches it again. |
| Barnaby | The shiver chart ("The echo"). | Never sent. | None. | A voice sample only, not game text (Decided 2026-10-24). It's listed so nobody builds it. |

**Decided by the owner (2026-10-24, the game's letters design, `docs/superpowers/specs/2026-10-24-letters-design.md` on `feat/letters`).** Where these differ from the Ideas below, these win.
- **The field notes first.** The first build sends only Barnaby's ten field notes, word for word. "Day three", Síofra's and Fin's letters come later, with the one-a-day rule, "single letters first" and a sign-off per letter.
- **Post at 08:00.** Letters arrive at 08:00 local time. The first comes the morning after he settles. After that, one comes every 3 days at most, at random from the unlocked notes, and a follow-up comes at least 2 days after the note it follows.
- **No toast.** Instead there's a quiet journal line, "A letter from Barnaby.", and an unread seal on the Letters tab, never a count. The tab appears once the first letter has arrived.
- **Time away.** At most one letter waits for a returning player, dated the latest 08:00 post, and the next comes 3 days after it.
- **The residents' letters are gone**, with the residents.

**Decided (2026-10-25):** the letters exist only in the interface, with no post box, no postie and nobody seen bringing one (`CAST.md` C10).

**Shared letter rules:** each is an Idea.
- **One a day.** At most one letter on any local day, across all senders. It replaces `idle/mail`'s `LETTERS_PER_DAY = 2`, as "Letters outside the pools" suggests, and counts the way `deliveredOn` does: the letters already delivered that local day.
- **Single letters first.** If a single letter and a field note are due on the same day, the single letter goes and the note waits for the next free day. The notes come "every few days" anyway, so the slip doesn't show, and a follow-up still comes at least two days after the note it follows. Two single letters due together go in the order their moments came.
- **Never on an absence.** No letter is sent because the player has been away, and none mentions it. Every trigger above is a character's own moment, never a gap in the player's work.
- **Time away.** *For the field notes, the owner chose otherwise (above).* The field notes follow the oddities' rule (their "Pacing"). A note's turn that falls on a day the game stays closed is skipped, not sent late, but the note stays in the set for a later turn: the next one comes a few days after the player is back, so a month away brings one note, not a month's worth, and no note is lost. A note that falls due on a day the player opens the game goes out that day. The three single letters are one-offs and nothing may be missed, so each waits for the player's next visit and then takes its turn at one a day. This replaces `idle/mail`'s rule that after a long absence the backlog "comes a couple a day over the following days" (`mail.test.ts`).
- **Sent once, kept.** Each letter goes out once and stays readable in the Letters tab, read or not, as on `idle/mail` (delivered once each, "never removed") and in the field notes' own notes. When there's nothing left to send, the post simply stops, and nothing says so.
- **No hold without letters.** A line held until a letter has gone (her four-leaf clover, Fin's dusk line) is held only once letters are built. Until then it plays as its own pool says, so nothing waits on a system that isn't there.

**What the code needs (for the game session):**
- **The letter view.** `letterParagraphs` in `src/game/systems/mail.ts` splits a body on blank lines and folds every other line break into a space. A field note's title and its `Established:`, `Not established:` and `Next:` lines share one block, so they'd run together as one paragraph; each needs a line of its own. The bold title (`**...**`) would print with its asterisks: render it bold, or store it as the letter's `title` and cut it from the body, since the reader already prints `title` above the body. The two-line sign-offs ("Warmly, and slightly singed," over "Barnaby Wick", and "Tight lines," over "Fin (on the jetty)") need their break kept too.
- **The sender.** A `LetterDef` comes `from` a `ResidentId`. The portrait, the letter head's "From" line and the resident's own title ("a hedgehog postie"), the filter chips, the toast ("A letter from Hazel") and the `signOff` printed under the body are all the resident's, and `waitingLetters` sends only from residents who have moved in. These letters need the three characters as senders, there once Barnaby is found, Síofra is met and Fin is on the jetty. The view prints the sender's `signOff` under every body. These letters carry their own sign-off (Barnaby's differ: "Barnaby" on the notes, "Barnaby Wick" on "Day three"), so that line must be left out or it doubles.
- **Titles.** `title` is required: the list row, its screen-reader label, the reader's heading, the journal line and the toast all print it, so a blank one won't do. The field notes have theirs, the bold line. **Idea:** for the three single letters, use each one's own first words, so nothing new is written: "Day three", "Dear you" and "Thank you for the jetty". The author can rename them.
- **Triggers and order.** `idle/mail`'s triggers are farm facts that stay true once true (`resident`, `firstHarvest`, `firstGood`, `island`, `built`, `bundle`, `level`, `sessions`, `firstCommit`, `firstVisitor`, `fish`), sent in a fixed `TRIGGER_ORDER`. These letters need days since a character's moment, Barnaby's stage, the field notes' `needs` and `after`, a random pick with its spacing, and the rules above.
- **What can be reused.** The save shape, `mail.letters` (`id`, `at`, `read`), already on `origin/main` with `sanitizeMail`, which drops unknown ids and repeats. Also once-only delivery, `deliveredOn` for the cap, `readLetter`, `markAllRead`, `lettersForTab` (unread first, then newest), `hasUnread` (a flag, never a count), `{farm}` filling, the 90-word check (`LETTER_WORDS`, `wordCount`), the quiet `letter` journal line on delivery, and the Letters tab's list, reader and focus handling, with the chips filtering by character.
- **The toast.** *Superseded: the owner chose no toast (above).* **Idea:** keep `idle/mail`'s one gentle toast ("A letter from Barnaby", with the letter's title as its detail), taking the name from the character, not `RESIDENTS`. Nothing else tells the player a letter is waiting: outside the Letters tab, `hasUnread` only drives Hazel's mailbox, which goes with her, and the journal line is quiet. With one letter a day, the "Two letters from" form is never used. This adds letters to the toast rule in "Toasts, taps and letters".
- **The residents' letters are cut** (`CAST.md` C4): the five residents, their 36 letters on `idle/mail`, and the lines there that wait on Hazel (the first letter's story line, and the empty Letters tab's text). On `origin/main` (PR #63), `residents.ts` is gone, `letters.ts` types its only sender as `'barnaby'`, `LETTERS` holds Barnaby's ten field notes, `advanceMail` posts them and the `letters` switch is on. Main's level-5 line "A hedgehog in a postie's cap was seen on the path." is gone from `LADDER` in `src/game/systems/journal.ts`, as `CAST.md` §7 cuts it with them.
