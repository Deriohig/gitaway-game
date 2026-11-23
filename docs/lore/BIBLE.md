# Gitaway lore bible

First consolidation, 2026-10-22. This file records the author's creative decisions and marks what is still uncertain. It doesn't make new decisions.

## How to use this bible

Use it for anything that tells the story: journal lines, letters, the hare's lines, item blurbs, relics, store copy and expansion pitches. Before writing, check §2 for what's true and §11 for what must stay open.

Every claim carries one of these tags:

| Tag | Meaning |
|---|---|
| **Canon** | Decided by the author. Write from it. |
| **Implied** | Follows closely from canon, but the author hasn't said it. Safe to lean on; say so if a piece depends on it. |
| **Open** | Deliberately unresolved. No game text may answer it. |
| **Idea** | A suggestion made while consolidating. It is not canon until the author retags it here. |
| **In game** | Text already in the repo. It shows what players see or will see, but it isn't canon by itself. "Unmerged" means it isn't on `main` yet. |
| **Direction** | The author's current intent from the character handover. Write toward it. It's a conceptual foundation, so details may still change. Most of it lives in `CAST.md`. |
| **Decided** | A choice the author made explicitly in a follow-up brainstorm, with its date. It has the same force as Canon, so write from it. It's kept as a separate tag so later readers can see which choices came after the briefs. |

To change canon, retag the item here first, add a line to the changelog at the end, then write the content.

**Terms**
- **The almanac** is the game's collection book. It holds the fish log, keepsakes and found objects. Its few old, written pages are the previous mage's fragment (§6).
- **The residents** are the five animal characters on `idle/mail` (Hazel, Bramble, Ardea, Moss and Corrie). They are cut as characters (§4.7).
- **The residents system** is the code that lets a character arrive, have a home and send letters. It could carry the three central characters instead.

**Sources**

1. The author's lore brief, 2026-10-22. This is the primary source.
2. The author's answer on magic, the same day: "some of the world's inhabitants that get isekai'd into the island come from worlds that have magic, and some others come from worlds that don't have magic. The island itself is inherently magical, but there's a mystery as to what it is and where it comes from and what its objective is."
3. Existing text in the repo, at `origin/main` 6c18227 and on the unmerged `idle/*` lane branches. Where it disagrees with sources 1 or 2, the disagreement is listed in §11 and nothing has been changed.
4. The author's character and narrative direction handover, later on 2026-10-22. It covers the wizard, the púca and a new character, the skeleton fisherman. It's tagged **Direction**, and its detail is in `CAST.md`.

This bible changes no code or art itself; it's groundwork for writing after the alpha. Some decisions imply game text or art for the game session to make (Q2's titles, Q4's tower ruin). Those are passed on, not made here.

### Scope (Direction)

The handover narrows the first story to a small cast: the wizard of §2 (the handover calls him "the magician"), the púca and the skeleton fisherman. The wizard's investigation is the main source of mystery, and the skeleton carries the one real tragedy. The island's history and its relics come in selectively, only where they add emotional or narrative value.

Everything below about the earliest community, the previous mage and the relics is still canon, but it's **background, not a to-do list**. The island can have a vast history that players never learn.

> A small number of deeply realised characters is more valuable than a large cast of interesting backstories.

---

## 1. Premise and narrative identity

**Canon.** Gitaway is a cosy ambient idle farming game for developers. You look after a magical island that keeps growing, while the people who arrive there live their own stories. Work sessions and developer activity can move the game along, but play stays peaceful and optional, and a break is never punished.

**Canon. The island is the protagonist.** The player and the inhabitants can change from one story or expansion pack to the next, but the island persists. Every version shares the same premise: an island that keeps growing and becomes the setting for new lives.

**Canon. Its identity has four parts:**

1. it keeps growing;
2. lives intersect with it;
3. those lives leave traces;
4. nobody knows what it actually is.

**Canon. Visual identity.** A magical miniature countryside diorama: lush land, warm light, charming buildings, winding paths, woodland, ponds, flowers, and an island that keeps getting bigger. The lore supports the look; it doesn't have to explain every magical feature in it.

**In game** (`origin/main`). The current game already says:

- "Commit code. Escape to the countryside." (`README.md:3`, `src/ui/Welcome.tsx`)
- "A small island floats above a sea of clouds, and your real work slowly turns it into the farm you keep promising to retire to." (`README.md:5`)
- "New land rises from the clouds and docks against the farm when you claim it." (`src/ui/panels/FarmPanel.tsx:51`)
- "An island to look after." / "It grows from your real work. Nothing withers if you take a break, a weekend, or a fortnight in the sun." (`src/ui/Tutorial.tsx`)
- The design guardrails G1–G9 in `docs/idle-loop.md` §0: nothing decays or can be missed, no streaks, no "you were away N days", and luck pays in delight, never in currency. These match the brief's no-punishment rule, and they bind the lore too (see §5).

The island floating over a sea of clouds is how *this* story's island looks. Other versions can look different (§10).

### Pitch drafts (Idea)

The author wants the lore to serve a store page. These are drafts, not canon. Q1 is decided (§8): like the interface, the store page may state the mechanics plainly. Store page drafts built from these are in `STORE.md` (Draft, 2026-10-23).

One line:

> A cosy idle game about a magical island that grows while you work, and the strangers from other worlds who turn up there to start again.

Store blurb, about 90 words:

> You remember a long day, a bright screen, and then nothing. You wake on a small island floating above a sea of clouds. It grows. Nobody can say why.
>
> Look after it while you work. Your focus and your commits help it along, and nothing withers when you step away. Others turn up too: a wizard whose spell ran backwards, a hare who is sometimes a girl and sometimes a goat on your roof, and a skeleton who has finally got round to fishing. Old pages and half-buried stones hint at everyone who came before.
>
> Commit code. Escape to the countryside.

---

## 2. Established canon

This section lists canon only, as a quick reference. Implications and details are in the later sections. The handover's direction for the wizard, the púca and the skeleton fisherman, and the later Decided choices about them, live in `CAST.md`. The briefs' canon below is kept as it was given; where a later decision changed something, a note says so.

### The island

- It is inherently magical.
- It grows continually. Nothing established explains its growth or its behaviour.
- Different inhabitants seem to influence or change it in different ways.
- Its landscapes, buildings, magical phenomena and history can differ between stories.
- Its history reaches beyond its current inhabitants.
- Its relationship with its inhabitants is central to the story.
- What it is, where it came from and what its objective is (if it has one) are a mystery.
- It intercepted the summoning spell connected to the wizard's arrival.

### Travellers

- People reach the island from other worlds. Some of those worlds have magic and some don't.
- Arrivals are sudden. How they're presented and what they mean emotionally varies by character.
- An arrival doesn't reveal a character's full backstory or motives.
- Some settle quickly, some find their place slowly, and some stay independent.

### History

- The island has hosted several generations of inhabitants, from different worlds, species and civilisations.
- Its earliest known community arrived separately and became a found family. Each had their own reason to escape their old life. Their life together meant belonging, freedom, connection across differences, care that mattered, and living differently from what their old worlds expected.
- They were biologically incompatible and could not have children together. They grew old and died, and some left before the others died.
- Their absence needs no catastrophe, villain or single tragedy to explain it.
- The island outlived them. Their lives, relationships, departures and physical traces are part of its history.

### The previous mage (he/him)

- He came from the same world as the current wizard.
- He studied the island's magic extensively. Near the end of his time there he formed a theory: the island formed by accident, where spells and magical forces from different regions converged in a pocket dimension bordering several other dimensions, and those dimensions are connected in some way to the travellers who arrive. Even he couldn't categorise the island fully.
- He wanted freedom from bureaucracy and control. He also wanted power, fame and recognition: to prove he was the best and to make something nobody had made before.
- He became interested in creating a magical place of his own. He loved the island, and then left to pursue that ambition elsewhere.
- His theory fed that ambition: if converging spells made the island by accident, a place could be made on purpose. (Adopted 2026-10-22.)
- Back in his world he claimed to have found a beautiful refuge beyond ordinary life. The claim became an obscure rumour, and most people thought him an eccentric crackpot despite his extraordinary magic.
- He vanished again.
- His story is told through a relic fragment, not a full biography or a definitive explanation.
- His departure is a meaningful loss from the island's point of view. What kind of loss is unresolved.

### The current wizard (he/him)

- He is one of the early inhabitants in the current story.
- He is genuinely powerful and knowledgeable. His magic is real and useful, and his theories may be partly right even where his understanding is incomplete. He is not a one-note fool.
- His old world was run by magical bureaucracy: permits, committees, audits, approvals and restrictions.
- He wants peace, serenity and time to practise magic without administrative interference.
- After arriving, he swings between relief, panic and confidence.
- He has heard the obscure rumours about the previous mage. That connection makes the island's history personal to him.
- His arrival is connected to a summoning spell that the island intercepted. He didn't necessarily mean to come to this island. The incident is both funny and mysterious.
- He lives in a wizard tower that feels familiar to him because of that connection.
- He tries to explain the island analytically, through theory.
- He may develop ambitions of his own. His arc isn't decided.

### The púca (she/her)

- The first brief made her a druid. **Decided (2026-10-22):** she's a púca, an Irish shape-shifting fae (`CAST.md` §4). The facts below still hold.
- She is an important early character. She is new to the island's timeline and has no link to any previous inhabitant.
- As she settles in, the land around her becomes more magical: plants, flowers, woodland and other natural features change.
- She understands the island, at least partly, through her relationship with nature and through caring for it. *(As a púca, that understanding is lived, never a source of answers: she gets along with the island and can't explain any of it.)*
- Her backstory, motives, personality and arrival are open. *(Since decided: her personality, her world and her errands, `CAST.md` §4. Still open: her motives, and how she first came through.)*

### The player

- The player character is a viewpoint and the island's caretaker, not the hero of its story.
- They are a software engineer. Their last memory is collapsing from exhaustion after a hard day. They wake somewhere impossible. Whether they died, dreamed or were transported is unresolved.
- They develop, expand, restore and care for the island. Mostly they watch the inhabitants' own stories, in quiet companionship. They shape the place people live in but don't control those people, and they aren't responsible for fixing every problem.
- Their reflections are sparse and optional. The game never tells them what to learn.

### Stories and characters

- A story usually starts from a character's longing. Sometimes it's connected to a previous inhabitant and sometimes it's entirely new. Characters pursue it on their own terms, and success, happiness, a change of heart or a lesson are never guaranteed.
- Characters are flawed and complicated, not heroes and villains. Not everyone has good motives, but nobody is purely evil or perfectly virtuous.
- The island doesn't solve its inhabitants' problems for them.
- The wizard and the previous mage share frustrations, but not necessarily motives or values. Neither the wizard nor the púca is automatically right, and neither exists to prove the other wrong.

### Relics

- About twenty are planned. That's a starting target, not a fixed count. They reveal fragments of earlier inhabitants' lives.
- There are three kinds: standalone, interconnected and mystery-deepening. Some resolve fully; others stay incomplete or contradictory.
- Formats vary. Relics are narrative discoveries, and they don't need material rewards. Players never have to collect them all.
- How relics are obtained is open. *(For the first story, decided: see Q6.)*

### Expansions

- Expansions may bring different protagonists, inhabitants, layouts, visuals and gameplay. The island is the connection; how its versions relate is unresolved.
- Characters and expansions don't have to share one cast or one timeline.

---

## 3. The island and its unresolved mysteries

### What we know

See §2. **In game:** in the current story the island floats above a sea of clouds, and new land rises out of the clouds and docks against it.

- **Seasons (Decided 2026-10-25).**
  - **Seasons stay a game convention.** With the game's seasons on (`docs/idle-loop.md` A5; the `seasons` switch is off), the look follows the player's month. Story text never names the current season, so Síofra's "a season late" is her own reckoning and reads right either way.
  - **Until then, it's a long late summer.** The gold trees on the wild isles (the art's autumn accents) are simply gold trees, all year, not a sign of autumn.
  - **When seasons come, they only add.** Blossom, colour, and frost and snow on top. A few leaves may drift down, but the crowns stay full, the lawns are pale with frost but never brown, and nothing looks as if it's wilting.
- **The distant isles and the sky (Decided 2026-10-25).** The lore says nothing about what the distant isles are, and never will. They're land and trees only, with no building, light, smoke, path or boat. They never come nearer, never change as the game goes on, and never get a name, so a sceptic sees scenery and a believer can wonder. Story text never mentions them: a character may look out at the horizon (Barnaby's far hills), never at somewhere to go. The sky holds weather, light and the odd flock of birds, and no light or craft crosses it. What the isles are stays open on purpose: this is a rule that keeps the question open, not an answer to it.

### What stays unresolved (Open)

- Whether it is conscious, sentient, instinctive or something else entirely.
- Whether it deliberately chooses, summons or rescues people.
- Whether its growth comes from its inhabitants, from its own magic, or from some interaction between the two.
- Whether it has emotions in a human sense, and whether its apparent response to care has a purpose.
- Whether it understands the difference between death, departure and rejection.
- Where it truly came from, and what its objective is, if it has one.
- How its different versions are connected.
- Whether its responses to people are intentional, emergent, or only read that way by the people watching.

**A tension to keep, not fix.** The author's answer on magic speaks of the island's "objective", while the brief leaves open whether it acts on purpose at all. Treat "what is its objective?" as part of the mystery, including the possibility that it has none.

### The convergence theory

It is **Canon** that the previous mage held this theory (§2). Whether it's true is **Open**. Rules for writing it:

- Present it as his theory, in his own voice or reported by someone who read his work, never as narrator fact.
- It can be partly right. Even if it explains how the island formed, it may not explain what the island has become.
- Other characters can doubt it, extend it, or never hear of it.
- **Implied:** if the island grew out of spells from several regions, travellers from magic worlds might find pieces of its magic familiar. That would fit the tower feeling familiar to the wizard. Nothing confirms it.

### Writing the island (rules 1–6 are Idea, except the art note under rule 6; rule 7 is Decided)

These working rules are drawn from the canon above, and they keep the mystery open.

1. **Show behaviour, not intent.** Write what the island does (land rises, a bell rings, flowers appear), not what it wants.
2. **Feelings go through a witness.** If the island seems glad or lonely, let a character think so, or hedge with "as if". The narrator never confirms it.
3. **Apply the two-readings test.** Every response from the island should allow at least two readings: a sceptic could explain it away, and a believer could read intent into it. If only one reading works, it's too decisive.
4. **Different eyes see different islands.** The wizard measures it, the púca relates to it, and a traveller from a world without magic may find the whole thing impossible. Let them disagree.
5. **It doesn't fix people.** Growth, beauty and magic happen around problems; they don't solve them.
6. **Show loss without decay.** The island may seem to feel absence, but the guardrails forbid decay and missable content (`docs/idle-loop.md` G1–G9), so absence must never look like the player's things wilting. Show it instead as stillness, quiet, or things left exactly as they were.
   **For the art (Decided 2026-10-25):**
   - **Decay is any change for the worse.** Nothing on the island ever looks worse than it did. Wear is a material, never a state: worn paths, weathered planks and moss are painted in from the start and never spread.
   - **Old traces may be weathered,** but anything left behind is whole and where it was put, with moss around it, never over it.
   - **Ruin belongs only to the island's old stonework** (the tower base, the stones, the cairn). Nothing the player builds and nothing an inhabitant brings is ever broken; an inhabitant may live among the old stonework, as Barnaby does in the ruin. A restoration's "before" look is unfinished or overgrown, never rotten or falling in.
   - **The review test** has two parts: does anything get worse, and is anything of the player's broken?
7. **These rules are for story text.** The interface may state the mechanics plainly ("It grows from your real work"). The journal's story lines, the characters and the letters never explain the island (§8, decided 2026-10-22).

### The guiding theme

"A good home doesn't demand that you stay. It gives you a reason to want to."

This is **Canon as a theme**, not a statement of the island's intentions. It describes how the game treats people: there's no pressure to stay and no punishment for leaving. It can be true of the island without the island meaning it.

---

## 4. Character profiles

This section holds the facts about each character. §6 designs the previous mage's relic, §7 covers how the wizard and the púca work together, and §8 sets the rules for the player's role. For the three central characters, the handover's direction (personality, introduction and how each story unfolds) is in `CAST.md`. These profiles keep the canon.

Each profile has four parts: **Established** (canon), **Implied**, **Unresolved** (open) and **Possible directions** (ideas, not canon).

**Names (Decided 2026-10-22):** the wizard is **Barnaby Wick**, the púca is **Síofra** (said SHEE-fra), and the skeleton fisherman is **Finlay**, who goes by "Fin". Nobody else has an established name, including the previous mage and the earliest community; don't invent names for them in game text.

### 4.1 The island

**Established.** See §2 and §3.

**Implied.**
- It responds to magic in some way, since it intercepted a spell.
- Its traces are eclectic, because people from many worlds, species and civilisations have lived on it. That suits a diorama that mixes styles.
- In the current story its growth shows as land rising from the cloud sea and docking (In game).

**Unresolved.** Everything in §3's open list.

**Possible directions (Idea).**
- It keeps things. The reader decides whether it collects them or simply never erases them.
- Inhabitants explain it in ways that can't all be true, and the game never declares a winner.

### 4.2 The earliest known community

**Established.** See §2, History.

**Implied.**
- With no children, and with members leaving or dying over time, the community ended gradually rather than suddenly.
- Someone was last. Either the final member died on the island or the final member left; which is unknown.
- They'd be the obvious source of relics, but in the first story they're background: a handful of traces at most (see Scope).
- At least some members could leave the island. Where they went is unknown.

**Unresolved.** How many there were, who they were, which worlds they came from, how long they stayed, whether the island brought them, whether anyone lived there between them and now, and whether the previous mage was one of them.

**Possible directions (Idea).**
- An interconnected relic set, with one perspective per member, where the accounts don't quite agree.
- The cairn note "Gone for a walk. Back by teatime." (In game, unmerged: `idle/restoration` `src/game/content/biomes.ts:57`) fits "some left before the others died". Nobody can tell whether it marks a walk, a departure or a goodbye.
- The old stones on the highland, and the ruins on the upper plateau of the concept art, could be things they built. Corrie's letter kept this open ("Nobody knows who first put them there."), but it goes with the cut residents (§4.7); the line could pass to one of the three central characters.

### 4.3 The previous mage

**Established.** See §2. He/him.

**Implied.**
- Leaving was possible, at least for him, and so was getting back to his own world.
- His rumour is how the current wizard knows of the island, so the wizard isn't a complete stranger to it even though he didn't mean to come.
- The tower feels familiar to the wizard "because of this connection". Something in it is recognisable to someone from their world. That stops short of saying the mage built or owned it.
- The approved draft of his old pages (page v, `VOICES.md`) has him planting an oak "by the tower". That leans towards him having lived there. **Decided (2026-10-22): let it hint.** Never state whether the tower was his.
- **Canon (adopted by the author, 2026-10-22):** his theory fed his ambition. If converging spells made this place by accident, a place could be made on purpose.

**Unresolved.** His name; when he lived on the island; whether he belonged to the earliest community; whether the tower was his; whether his project worked; where he went when he vanished again; whether he ever came back; whether his theory is right; and how the island experienced his leaving.

**Possible directions (Idea).** See §6.

### 4.4 The current wizard

**Established.** See §2. He/him.

**Direction.** The handover calls him "the magician"; on 2026-10-22 the author chose **wizard** as the game's word for him. His central question is *What is this place?*, and his investigation is the main source of mystery. He explores it without explaining it. See `CAST.md` §3.

**Longing (Canon).** Freedom to practise magic, and a peaceful life.

**Implied.**
- His old world's magical bureaucracy maps neatly onto the corporate process developers know: approvals, audits, change committees. The satire is aimed at systems, not at people. **Decided (2026-10-22): keep bureaucracy jokes rare.** It's why he left, not his main humour; his running gag is the cow (`CAST.md` §3).
- He is the story's first clear voice from a world with magic. The player is the voice from a world without it.
- **Decided (2026-10-22):** he suspects from the start that this is the crackpot's refuge, and won't say.

**Decided (2026-10-22):** he found the spell in a very silly old book back home, long dismissed as nonsense.

**Unresolved.** His age; whether the island reversed his spell on purpose; what his "connection" to the previous mage is beyond their shared world and the rumours (family, student, admirer and institution are all possible, and none is decided); the tower's history; and his arc, including whether ambition grows in him. (His name and the summoning are decided: §4 intro and §7. His appearance is decided too, as the game draws him: `CAST.md` §3, 2026-10-25.)

**Possible directions (Idea).**
- The summoning incident: decided (§7).
- He tries to categorise the island and fails in useful ways: some of his theories land.
- He finds or recognises the previous mage's fragment, and it stirs something in him. What, exactly, isn't decided.
- He has to work out what freedom feels like once there's nobody left to resist.

### 4.5 The púca (formerly the druid)

**Established.** See §2. She/her.

**Decided (2026-10-22).** She's a púca, not a druid: an Irish shape-shifting fae of the field edges. She's often a hare, sometimes an ageless girl who looks young, and whatever else she fancies being that day. She's always an extra animal, never a missing one, and never menacing. She's super chill and lives in the moment, and her flaw is that she's time-blind. She meets the player through how they treat the land, noticing three things: crops left standing, variety, and flowers, bees and trees. She's a wanderer between worlds who can't find the way back and isn't bothered. Her own errands are helping animals, collecting odd things and napping seriously. Her wandering never explains the island.

**Direction.** Her central question is *What if happiness is already here?* She is not a dispenser of wisdom; she has her own flaws and her own story. See `CAST.md` §4.

**Implied.**
- She is the character most tied to the island's visible lushness: the world gets more magical where she is.
- Her noticing how the player treats the land is a quiet parallel to the player's caretaking. Don't spell it out.
- She shows that a newcomer with no tie to the past can matter. This is the brief's own example (§10).
- Being a púca suggests she comes from a world with magic. **Decided (2026-10-22):** she's a wanderer between worlds, and the island is just the latest field edge.

**Unresolved.** How she first came through, whether she'll drift on one day, and whether the land changes because of her magic, because the island responds to her, or both. (Her name, her world, her personality and her errands are now decided; see `CAST.md` §4.)

**Possible directions (Idea).**
- Her changes appear before anyone meets her: unfamiliar plants, footprints, flowers where none grew. These are the brief's own foreshadowing examples.
- She doesn't explain herself, which frustrates the wizard.
- Caring doesn't make her automatically wise. She can be wrong about the island too.

### 4.6 The player

**Established.** See §2 and §8.

**Implied.**
- They come from a world without magic, recognisably ours.
- If they have a longing, the fiction never names it. The collapse speaks for itself.
- The game addresses them as "you", and their pronouns are never set.

**Unresolved.** What happened to them, whether they can leave, and what their arrival means. (How their real-world work fits the fiction is decided: §8, Q1.)

**Possible directions (Idea).** The player's reflections can mostly come from their own notes. The journal already keeps lines the player has written a note on (In game, `origin/main`). That means the game needs very few reflections of its own.

### 4.7 Existing cast in the codebase (In game)

This cast was written before the brief, and the brief doesn't mention it. **Decided:** the residents are cut as characters (below; §11, Q3).

| Who | Status | Notes |
|---|---|---|
| The cat and the dog ("A cat has moved in", "A dog wandered up the path") | Live | Ordinary animals. Players can name them on the unmerged `idle/atmosphere` branch. |
| 22 wild visitors (`src/game/content/visitors.ts`) | Removed (in game, PR #47), except the Brown hare | A fox, a hare, a petrel and others, with dry one-liners and keepsakes. **Decided (2026-10-22): dropped altogether, except the Brown hare**, who is Síofra. |
| Hazel (hedgehog postie), Bramble (badger miller), Ardea (heron lighthouse keeper), Moss (otter ferry keeper), Corrie (stoat crofter) | Unmerged, `idle/mail` | Talking animal residents with about 35 letters, written for a retirement farm in a British village. |

*Superseded options, for the record:* (a) island natives, (b) travellers like everyone else, (c) ambient village life.

**Decided (2026-10-22): the five animal residents are cut as characters** from the first story. Animals stay in the game as resources and cosmetics; they just aren't characters. **The wild visitors are dropped altogether, except the Brown hare**, who is the púca (`CAST.md` C4, C6). That supersedes an earlier decision the same day to narrate them. The heron may stay at the pond as scenery. The cut takes the residents along with their letters and the level-5 journal line "A hedgehog in a postie's cap was seen on the path." (`origin/main` `src/game/systems/journal.ts`, behind the `letters` switch). The cat, the dog and the Brown hare stay. The residents and letters system on `idle/mail` could carry the three central characters instead; that's for the game session to decide (`CAST.md` §8, C4).

### 4.8 The skeleton fisherman (Direction)

He is new in the handover. He isn't in §2's canon list, but his shape is Decided (below). On the surface he's an eccentric, joking skeleton who fishes by the pond. Underneath, fishing was the simple life he kept putting off until he died. His central question is *What if someday never comes?* He carries the first story's one real tragedy. **Decided (2026-10-22):** he kept moving the goalposts; the person missing from his story is the man he would have been, not a lost loved one; his death was ordinary and unearned; and he's prepared, not practised, knowing everything about fishing and having hardly ever done it. Later the same day: his goalposts were **saving**, as "enough" kept rising and he bought the gear while he waited. His world had **no magic**. He has **no arc in the present**. His clues are three objects: unused licences, a tackle box with its price sticker on, and rods still in their wrappers. How he died, the people in his life, and the specifics are still Open, and must not be invented. **Decided (2026-10-25):** his jetty stands on the wetland lake, and until the wetland has docked he sits on the bench by the pond, which has no jetty. See `CAST.md` §5.

---

## 5. Themes and tone

### Tone (Canon)

- Cosy and whimsical, and now and then absurd.
- Funny on the surface, sincere underneath.
- Shaped by isekai and fantasy without leaning on their tropes uncritically.
- Emotionally thoughtful, never preachy or melodramatic.
- Comfortable with uncertainty, flawed characters and imperfect endings.

### The existing voice (In game)

The current text already does "funny on the surface" well. It's dry, gentle and affectionate about developer life.

- "Ripens over a long meeting." (tomato)
- "A small, buzzing workforce. They never ask for standups." (beehive)
- "A commit landed, and the island felt it faintly, like a ferry docking." (journal)
- "It doesn't ask where you've been." (petrel; a visitor being removed, but the line shows the voice)

Journal story lines are deliberately short, in the manner of A Dark Room (`docs/idle-loop.md` §4). Keep that economy.

### Themes (Canon, as guides, not lessons)

- It's okay to want a different life.
- People don't need to earn the right to rest or enjoy themselves.
- Freedom means different things to different people.
- Community can matter without everyone becoming the same.
- You can care about a place and still choose to leave.
- A person can have admirable intentions and selfish motives at the same time.
- Knowing how something works isn't the same as knowing what it means.
- An ordinary life can matter without becoming legendary.
- Caring for others doesn't require controlling their choices.
- A place can become meaningful even if it wasn't made for a meaningful purpose.

### Where the cast already carries the themes (Implied)

| Theme | Who carries it |
|---|---|
| Rest | The player (the collapse), Barnaby (he wants peace), and Fin, who never let himself. |
| You don't need to earn it; someday isn't guaranteed | Fin, who kept saving until he had "enough". |
| Happiness already here | Síofra, who has only "now", and pays for it in time-blindness. |
| Freedom means different things | Barnaby (freedom to practise) and the previous mage (freedom, plus power and fame). |
| Admirable and selfish at once | The previous mage. |
| How something works versus what it means | Barnaby explains and Síofra simply lives there; the convergence theory itself. |
| Caring without controlling | The player's whole role. |
| Leaving a place you love | The previous mage, and the members of the earliest community who left. |
| An ordinary life matters | Fin, and the earliest community, whose traces can be small and everyday. |

### Isekai, handled with care (Idea)

These notes for writers are a synthesis of the canon.

- **The fantasy is rest, not power.** The genre usually rewards arrival with strength. Here the player gets a place to look after and nobody to beat. The previous mage is the counterpoint: he's the one who wanted power.
- **The collapse is sincere.** Burnout is how the player gets here, and it's never played for a gag. The comedy belongs to the wizard's arrival.
- **The player isn't chosen.** They are a caretaker. Nothing says the island picked them (Open).
- **Going home isn't the goal.** Some travellers may want to go back and some won't, but it's never the main quest.
- **Levels and titles stay out of the fiction.** The game has levels, but characters never talk about them like status screens.

### Writing rules

1. Characters don't announce themes. Let a choice or a small object carry them.
2. Keep the sincere part unspoken. A line can be funny and true without explaining the true part.
3. Deaths and departures happen off-screen or through small things: no deathbeds and no speeches.
4. There are no villains, only complicated motives.
5. Aim developer humour at systems, never at the player or their job. The game never asks whether they're working enough.
6. Respect the guardrails: no urgency, no guilt, nothing missable, nothing decays.

### Examples (Idea; illustrations, not canon text)

| Too much | Better |
|---|---|
| "The island chose you." | "Nobody has explained why the island keeps making room. It just does." |
| "The wizard learned that rest matters." | "Barnaby spent the afternoon on the windmill steps and measured nothing." |
| "The island mourns its lost inhabitants." | "Nobody has moved the chair by the old stones. The moss grows around it, not over it." |

---

## 6. The previous mage's relic story

### What's fixed (Canon)

- His story arrives as a relic fragment: not a biography, and not a definitive explanation.
- Whether his project succeeded, what happened after he left, and whether he ever came back all stay Open.

### What the fragment has to carry

These requirements are drawn from the canon. They're not a script.

1. His fascination with how the island's magic works.
2. The convergence theory, as his own idea late in his stay, with a sense that it doesn't quite account for everything.
3. Both motives side by side: escaping bureaucracy, and wanting to be the best and to make what nobody else has.
4. That he loved the island and decided to leave anyway.
5. A hint that he may be in over his head.
6. No ending. It stops before his fate, his project or the island's nature is settled.

### What it must not do

- Confirm his theory, his success, his whereabouts or the island's intentions.
- Make him a villain or a hero.
- Require the player to have found anything else first.

### Three perspectives on one man (Idea)

His story divides naturally into an interconnected set:

- **The rumour**, from his world, told by the wizard: the crackpot who claimed to have found a refuge. This is the world's view of him.
- **The fragment**, in his own voice. This is his view.
- **The traces** he left on the island, perhaps something in the tower, or the oak he planted by it (page v). This is the island's side. What and where they are is otherwise Open.

Each piece makes sense alone. Together they don't quite agree, and that's the point: the contradictions come from perspective, as the brief asks.

### Format options (Idea)

- Loose research notes: measurements and diagrams, with asides that admit more than he meant to.
- An unfinished letter that was never sent. Whom it was for is a question in itself.
- A memory or vision that plays out in the tower.
- Writing in the margins of the almanac. (In game: "The cat brought in an old almanac. Most of its pages are blank." `origin/main` `src/game/systems/journal.ts:165`.) This would make the almanac partly his, which is a decision, not a detail.

**Decided (2026-10-22): the almanac.** The almanac's few pages that aren't blank are his: unsigned, and together they are the fragment. Barnaby one day recognises the handwriting, and claims it's "nobody's" (`CAST.md` §3 and C10). The almanac itself arrives early (it's an everyday object), but its old pages turn up later. **Idea:** the pages turn up one at a time, as "a page you hadn't noticed before", which allows two readings (always there, or newly appeared) and keeps the fragment from being found first.

**Drafted (2026-10-22):** six short pages in `VOICES.md`, written to the requirements above. The author approved the voice, kept the unfinished "I'll" as the last word, and kept the oak by the tower as an unspoken grace note (it may be why there's woodland on the plateau; nobody says so). The pages are still drafts, not final text.

### Voice notes (Idea)

Precise and showy, and fond of his own phrasing. Scornful of committees, the one thing he plainly shares with the wizard. Every so often a plain sentence slips out that shows how much he wanted this.

### Where it might surface (Idea)

- It's at its richest when the wizard is there to recognise the handwriting or the spellwork, which gives it personal weight. The player can still understand it without him.
- It belongs in the middle of the first story or later, once the island's history has started to show (§12). It deepens the mystery, so it shouldn't be the first relic.

---

## 7. The current wizard and the púca

### Two ways of knowing (Canon)

The wizard tries to explain the island. The púca understands it, at least partly, through nature and through caring for it. Neither is automatically right, and neither exists to prove the other wrong. *(With the púca, her understanding is lived and never a source of answers: she gets on with the island and can't explain any of it.)*

### What that gives the writing (Idea)

- **Friction.** He measures something she has just changed. They disagree about whether the island "likes" something, and neither can prove it.
- **Cooperation.** A moment where each is partly right about something small (where the bees went, why the pond is warm), never about what the island is. Síofra is a neighbour, not a key to the mystery.
- **Distance.** They don't have to become friends. The brief allows "humour, friction, cooperation, distance, or mutual change".
- **A neutral player.** The player sees both and never judges between them.

### The wizard and the previous mage

**Canon.** They share frustrations, but not necessarily motives or values. The mage wanted power and fame as well as freedom; the wizard mostly wants to be left alone to do magic.

**Open.** Whether the fragment tempts the wizard, confirms that he's different, or does both at different times. Don't decide his arc in advance.

### The wizard's arrival

**Canon.** A summoning spell, intercepted by the island. It's both comic and mysterious, he wasn't necessarily aiming for this island, and he arrives in a cycle of relief, panic and confidence.

**Open.** Why the island caught it, and whether it reversed it on purpose. (What the summoning was for, and who cast it, are now decided: see below.)

**Options that were weighed (the third was chosen):**

1. He was summoning something mundane, such as a document, a familiar or a committee stamp, and the spell pulled him instead.
2. Someone in his world summoned him, perhaps to an audit, and the island caught the spell in transit.
3. He tried to summon the rumoured refuge itself, half as a joke, and it worked better than he expected.

Option 3 ties the arrival most closely to the rumour, but it leans towards the island "answering" him. Options 1 and 2 leave the island's intent more open.

**Decided (2026-10-22): option 3, reversed.** He tried the crackpot mage's spell to summon the refuge *to him*. The island intercepted it and summoned *him* instead. Whether it did so on purpose stays Open. He suspects from the start where he is, and won't say. He's found the next morning, as the cat is. See `CAST.md` §3.

### The púca's arrival

**Decided (2026-10-22).** She's glimpsed before she's met, as the live Brown hare visitor ("Slightly longer ears today, I think."), whenever the meadow is claimed. She's met properly at a field edge once Barnaby has settled (`CAST.md` §4, C6). Her arrival isn't tied to the past, so it's quieter than the wizard's. *Open:* how she first came through.

### Where they live

- **Canon.** The wizard lives in a wizard tower that feels familiar to him. Its full history, its ownership and its link to the previous mage are not established.
- **Idea.** The púca lives at the field edges and in the hedges, not in a house: wherever crops were left standing.
- **Decided (2026-10-22).** The tower is the ruin on the upper plateau, on the highland piece (`art/config/world-layout.spec.md:53` already lists "ruins later" there). He camps until the highland rises, whenever the player claims it, and recognises the ruin when it docks. If it's already there when he arrives, he goes straight to the ruin.
  - **Decided (2026-10-25): how the ruin looks.** The built model is the tower: one ruin, the broken base of an ordinary dry-stone tower. "Wizard tower" names where he lives, and what's familiar is his, carried in words and in how long he stands there, never on the stones. When he moves in, only his own things change it (the bedroll, the kettle on its three stones, the books and candle stub, a warm light in the empty window after dusk), and his camp moves in with him, so nothing is left behind. The stairs show as a few sound steps climbing into the thickness of the back wall, as old round towers' stairs do, so where they stop is never shown. One ordinary oak stands in the plateau's woodland near the ruin: the same tree as anywhere else, never framed, lit, tapped or named. Whether the ruin was the previous mage's stays open on purpose: the oak hints at it, and nothing states it (§4.3).
- **Practical.** The tower is the ruin itself: one model, the broken base of an ordinary dry-stone tower (Decided 2026-10-25, §11 Q4). The art has built it with his camp (the Barnaby trio: the wizard, the camp and the tower ruin); placing them is the game's and the art's work.

### Their effect on the island

- **The púca (Canon).** Nature grows more magical around her. **Decided (2026-10-25), how it looks:** where she's been, more of what's already there turns up slowly, and it stays when she moves on (clover between the ripe rows, a drift of one wildflower, a bed standing a little taller). It never shows as light coming off her (`CAST.md` §4, "How she looks").
- **The wizard (Open).** Whether and how he changes the island. Canon says inhabitants change it "in different ways", so he may well. **Idea:** something structured or orderly, such as the tower, wards, or a lantern that never goes out. Don't settle it here.

---

## 8. The player's role

### Canon

See §2: caretaker, not hero. They develop, expand, restore and care for the island; they watch the inhabitants' stories in quiet companionship; they shape the place, not the people; they're not responsible for fixing everything; and their reflections are sparse and optional.

### How the existing systems already fit (In game)

| The brief says | The game already has |
|---|---|
| Develop and expand | Building, planting, and claiming land that rises and docks. |
| Restore | The notice board "of old places worth mending", and restoration bundles (`origin/main` `src/game/content/bundles.ts`, behind the `restorations` switch). |
| Watch the inhabitants' own stories | The Brown hare comes and goes on her own (the other visitors are dropped). The unmerged residents and letters system could carry the three central characters. |
| Sparse, optional reflection | The journal's short story lines, and the player's own notes on them. |
| No punishment for breaks | G1–G9, and "Nothing withers if you take a break…" |

### What the player is not

A hero, a chosen one, a judge, a fixer, or someone who makes decisions for other people.

### Writing the player

- Address them as "you". Never give them a name, a gender or an appearance.
- Keep their inner life to a few lines across the whole story: observations, not conclusions.
- Their reflections come from the inhabitants' stories. The game offers a moment and never says what it means.
- The collapse can be mentioned once, plainly, at the start. It doesn't need revisiting.
- Inhabitants ask the player for nothing, or for small things. They don't hand out quests the player has to solve.

### The real-work question (Decided 2026-10-22; see §11, Q1)

**Decided: an echo the inhabitants notice, plus two voices.**

- **In the story,** the island shivers whenever work is done somewhere. The inhabitants notice it and wonder, and nobody explains it. The player knows it's their own commits and focus sessions; the characters don't. That dramatic irony is the joke, and it keeps open whether the player died, dreamed or was transported. The existing line "A commit landed, and the island felt it faintly, like a ferry docking." is exactly this.
- **Two voices.** The interface (welcome, tutorial, session card, shop) may state the mechanics plainly: "It grows from your real work", "Clock in". Story text (the journal's story lines, characters and letters) never explains the island.
- **The opening** gets one line about the collapse in the welcome. A draft: "You remember a long day, a bright screen, and then nothing." It's never revisited.
- **Guardrail:** characters remark on the shiver when it happens, never on its absence. No "it's been quiet lately", no "you haven't been working".
- **How it looks (Decided 2026-10-25).** The shiver belongs to the whole island, so the one wave from the farmhouse (`wind.ts`) carries on through everything it meets: grass and tree crowns sway; still water takes a soft ring or two as the front passes; and light things on water or on posts give a small nod (the jetty deck, the moored sky-boat, a rod tip, a kettle lid). Buildings, rock and the land itself stay still, and nothing glows, cracks or falls. A big shiver differs from a small one only in strength and reach. Story text never says where the wave starts, so the characters can keep guessing.

The options that were weighed, for the record:

In the fiction, the player has been carried off to the island. In the real game, the player keeps working, and their focus sessions and commits move things along (In game). The two need a relationship, or a deliberate decision not to have one. **Options (Idea):**

1. **Leave it outside the fiction.** The game never explains it. The work loop is a game convention, like the seasons in a farming game.
2. **An echo.** Somehow the island feels the work of the life the player left behind. The existing line "A commit landed, and the island felt it faintly, like a ferry docking." already reads this way, and it keeps the mystery.
3. **Work carries on from the island.** The player still works, from somewhere impossible. It's funny, but it weakens the "escape".

Option 2 was chosen. Because the interface may speak plainly, the "clock in" wording (`src/ui/Welcome.tsx:28`, `src/ui/Tutorial.tsx:13`, `src/ui/SessionCard.tsx:216`) and the Tutorial's "It grows from your real work" stay as they are.

---

## 9. Relics and environmental storytelling

### Canon

- About twenty are planned; the count isn't fixed.
- They reveal fragments of earlier inhabitants' lives, from different worlds, species and civilisations.
- They can be found through exploration, purchases, restoration, expansion, environmental clues or the inhabitants. The general mechanics are open; the first story's are decided (Q6).
- There are three types: standalone, interconnected and mystery-deepening. Some resolve fully; others stay incomplete or contradictory.
- Formats include letters and records, personal objects, visions and memories, short dialogues, environmental scenes and changes, and other light forms. They don't all use the same format.
- Relics are narrative discoveries, not reward containers. The story is the value and material rewards aren't required. The tone can be funny, tender, ordinary, surprising, unsettling or mysterious. Not every relic advances the mystery, and some feel complete without explaining the island. Some change how earlier events read. Contradictions come from perspective, incomplete knowledge or genuine uncertainty, never from arbitrary confusion.
- Relics can be found naturally, introduced by inhabitants, or hinted at by the environment. How much guidance there is varies, and so does the order. Where possible, each makes sense alone, and earlier finds enrich later ones rather than unlock them. There's no urgency, guilt, punishing missed events or excessive notifications, and no obligation to collect them all.

### A checklist for each relic (Idea)

1. Does it make sense if it's the first one found?
2. Which type is it? If it belongs to a set, which set?
3. Whose perspective is it, so that any contradiction has a source?
4. Does the format suit this story, or is it just habit?
5. Does it answer an Open question? If it does, rewrite it.
6. Is anything urgent, missable or guilt-making? Remove it.
7. Is the story enough without a reward?

### How many, and which (Idea, revised for the handover)

About twenty stays the long-run target across stories (decided 2026-10-24, `CAST.md` §8, C4). For the first story, start with a handful, each tied to the current cast (set out in "The first story's relics" below):

- one or two everyday traces of earlier lives, as standalone pieces;
- the wizard's finds, which carry most of the mystery and reach the player as his letters;
- Fin's three objects (the licences, the tackle box, the rods), which are part of his reveal rather than separate relics;
- the previous mage's fragment: the almanac's old pages (decided, §6).

If more come later, the original mix still works as a guide: about half standalone, two or three small interconnected sets, and three or four mystery-deepening finds, none of them decisive.

### Relic record template (Idea)

```
id:
title:
type:                 standalone | interconnected (set: …) | mystery
format:
whose life / which world (as far as known):
what it reveals:
what it leaves open:
perspective and bias:
where / how found:    (object noticed in the world | letter | almanac page | journal line; see Q6)
enriched by / enriches:
tone:
status:               idea | approved | written | in game
```

### The first story's relics (Decided 2026-10-24)

The handful is complete with what already exists. Each record uses the template above, with only the fields that matter. None of them adds a new relic or answers an Open question (§11).

**The cairn stone** (`note`)
- **Type:** standalone, an everyday trace of an earlier life.
- **Format:** an object noticed in the world, then a journal line (Q6). In game: the highland's hidden detail (`src/game/content/biomes.ts`, `DETAILS.note`).
- **Look (Decided 2026-10-25):** words that are never legible. One flat stone carries two short rows of shallow cut marks, one row for each sentence, worn soft, so they read as someone's writing and not as a pattern or a symbol. The words themselves are only in the journal line. A little moss sits around the stone, never over the marks.
- **Whose:** someone who once lived on the highland. Perhaps one of the earliest community (Idea, never stated), and never the previous mage (Q5).
- **What it reveals:** someone lived here, and went for a walk.
- **What it leaves open:** whether they came back, which teatime, and where a walk goes on an island.
- **Perspective:** the carver's own words, and the narrator's moss, which "has its doubts".
- **Tone:** tender and funny. A departure without decay (§3, rule 6).
- **Status:** in game, behind the biome details.

**The bell under the wetland** (`bell`)
- **Type:** mystery-deepening: something beneath the island.
- **Format:** an environmental scene (ripples with no wind), then a journal line. In game: the wetland's hidden detail (`biomes.ts`, `DETAILS.bell`).
- **Look (Decided 2026-10-25):** the bell is heard, never seen. Nothing is drawn under the water at any zoom, light or water level, and the `Bell` mesh is an invisible click target at the ripples. Until it's noticed, slow rings spread by the reeds on a windless day; in still mode they're drawn as frozen rings. Once it's noticed, that water is as still as the rest of the lake. Both readings stand: a spring or a fish below, or something far down that rang.
- **Whose:** nobody's that anyone knows.
- **What it reveals:** something far below the reeds rings, once.
- **What it leaves open:** what rang it, and whether it answers.
- **Enriches:** Barnaby's two bell notes (`VOICES.md`, "Field notes, the full set"), which follow it up without settling it. Each one stands alone.
- **Status:** in game. The notes wait for the letters system.

**The previous mage's old pages**
- **Type:** an interconnected set of six, mystery-deepening, none of them decisive.
- **Format:** almanac pages, found one at a time (§6, Q6).
- **Whose:** the previous mage's, unsigned. Unplaced in time on purpose (Q5): no page mentions the earliest community.
- **What it leaves open:** whether his convergence theory is right, whether he succeeded, and whether he came back. It ends on "I'll".
- **Status:** written (`VOICES.md`). The almanac is switched off.

**Barnaby's field notes** (the wizard's finds)
- **Type:** an interconnected set of ten letters, three of them follow-ups.
- **Perspective and bias:** Barnaby's own. He half-suspects this is the refuge, and won't say.
- **Status:** written (`VOICES.md`). Letters are switched off.

**Fin's three objects** (the licences, the tackle box, the rods)
- These are part of his reveal, not separate relics (`CAST.md` §5). They're written in his game lines; Fin and fishing are switched off.

**Not relics, on purpose:** the Stone Circle's old stones and the restored huts stay scenery for now. If more relics come later, the mix above is the guide.

### Hooks already in the game

The hooks are **In game**. Using them as relics is an **Idea**.

| Hook | Where | Possible use |
|---|---|---|
| The almanac: "Most of its pages are blank." | `origin/main` `src/game/systems/journal.ts:165`, behind the `almanac` switch | **Decided:** where found objects are kept, and its few old pages are the previous mage's fragment (§6). |
| The notice board "of old places worth mending" | `origin/main` `journal.ts:172`, plus the restoration bundles | Restoration as a route to discovery, which the brief lists. |
| A cairn stone carved "Gone for a walk. Back by teatime." | `origin/main` `src/game/content/biomes.ts` (the highland's hidden detail) | **Decided (2026-10-24):** the first story's everyday trace (see "The first story's relics"). |
| A wetland bell, "low and green, from somewhere far below the reeds" | `origin/main` `biomes.ts` (the wetland's hidden detail) | **Decided (2026-10-24):** the first story's mystery-deepening find (see "The first story's relics"). |
| The old stones: "The old stones stand upright again." | `origin/main` `src/game/content/bundles.ts:127` | Something the earliest community built or found. Corrie's letter about it is cut with the residents. A subject for the wizard. |
| The upper plateau, "Woodland + Ruins" | Concept art, `art/reference/concept/island_wide.png` | Physical traces of older inhabitants. |
| The Sky Harbour and the lighthouse islet | `origin/main` `bundles.ts:106`; the lighthouse model | **Decided (Q7, 2026-10-24):** places, not routes. No story arrival or departure uses them, and who built the harbour stays Open. How they look: Q7 (Decided 2026-10-25). |

### Environmental storytelling

- **Canon.** Before an arrival there can be strange lights, footprints, unfamiliar plants and small changes. Not every arrival needs them.
- **Canon.** The púca's effect on the plant life is the cast's clearest environmental storytelling.
- **Idea.** Show the traces of people who left without any decay (§3, rule 6).
- **Decided (2026-10-25).** For the art, what counts as decay, and what may look weathered or ruined: §3, the note under rule 6.
- **Decided (2026-10-22).** No count anywhere. Nothing says "3 of 8".

---

## 10. Expansion-pack principles

### Canon

- Expansions can bring different protagonists, inhabitants, layouts, visual concepts and gameplay.
- The island is the connection. How its versions relate is unresolved.
- An expansion may inherit a building, a relic or a magical phenomenon, or it may be entirely new. The púca shows that a newcomer with no ties to the past can matter.
- There's no single forced cast or timeline.
- The island's lasting identity is its growth, the lives that cross it, the traces they leave, and the mystery of what it is.

**Decided (2026-10-25).** The lore never says what the distant isles on this story's horizon are, so they settle nothing about how the versions relate (§3, "What we know").

### Working principles (Idea)

1. **Each expansion stands alone.** Nobody needs an earlier one to follow it.
2. **Inherit lightly.** A carried-over building, relic or phenomenon is a nod, never a requirement.
3. **Echoes may disagree.** One version of the island can contradict another. Don't reconcile them through plot.
4. **Start from a longing.** Each expansion opens with someone wanting something.
5. **Constants:** growth, care, arrivals, traces, the mystery, and the no-punishment guardrails.
6. **Variables:** the layout, the cast, the look, the gameplay, and which kinds of magic show up.
7. **Protected threads.** The previous mage's project and fate are Open. An expansion touches them only after the author decides what's true.

### Expansion pitch template (Idea)

```
longing:            whose, and what they want
who arrives:
how the island looks this time:
what is inherited, if anything:
open questions it brushes against (and must not answer):
gameplay change:
```

---

## 11. Open questions and unresolved decisions

### A. Deliberate mysteries: keep them open

Don't answer any of these in game text unless the author decides otherwise:

- Whether the island is conscious, chooses or summons people, means its responses, or has an objective.
- Whether its growth comes from the inhabitants, from its own nature, or from both.
- Whether it understands the difference between death, departure and rejection.
- Where it truly came from, and whether the convergence theory is right.
- Whether the previous mage's project worked, what became of him, and whether he came back.
- How the island's versions in different expansions connect.
- The player's fate and what their arrival means.
- How the characters' stories end.
- How relics are obtained in general. (The first story's vehicles are decided: Q6.)

### Also open: undecided, but not mysteries

These are things nobody has chosen yet. Unlike the mysteries above, they can be decided whenever it helps.
- **Barnaby:** whether the island reversed his spell on purpose; his age (his appearance is decided, as the game draws him: `CAST.md` §3, 2026-10-25); which early level brings him (the game session places it in the new curve).
- **Whether the tower was the previous mage's.** Page v hints that it was, and that hint stays; it's never stated (§4.3).
- **Fin:** what "enough" was for; how he died, beyond "ordinary and unearned"; the people in his life; how he came to the island.
- **Síofra:** how she first came through. (Whether she drifts on one day stays unanswered on purpose: `CAST.md` §4, decided 2026-10-24.)

### B. Decisions that would change the writing or the build

In priority order. Each one blocks real text or code.

**Q1. How real work fits the fiction.** **Decided (2026-10-22):** the inhabitants notice an echo they can't explain; the interface speaks plainly and story text never explains; one line about the collapse goes in the welcome (§8). Originally: the player has been carried off, but the real player keeps committing. The options are in §8. The Tutorial line "It grows from your real work" (`src/ui/Tutorial.tsx`) also gives growth a cause, which the canon keeps open. *Affects:* the Welcome and Tutorial copy, the journal's commit lines, the "clock in" wording and the store pitch.

**Q2. What becomes of the retirement framing.** **Decided (2026-10-22): lean into it.** Keep the retirement framing on purpose, and let the skeleton's story quietly turn it around (`CAST.md` §8, C1).

**The finish lines (decided 2026-10-22): one finale, at the end.**
- The cottage reaching **Home** (36,000 XP today) is the retirement, and **"Retired, Happily"** becomes the title it awards.
- "Early Retirement" (level 10 today) is renamed **"Islander"**.
- The old "Retired, Happily" (level 20 today) is renamed **"Part of the Furniture"**.
- The game session's economy rebalance retunes the level curve, so these levels may move. The lore keys off the titles and the cottage, not the numbers.
- The progress card's "You made it. Feet up, kettle on." moves to the finale, where it can merge with the cottage's own "Kettle on, feet up. Stay as long as you like."
- The milestone "Retire early (level 10)" needs new wording.
- **Nothing is withheld before the finale.** The cottage is yours from the first peg: its first line changes from "Yours, one day." to "Yours already. It just needs walls." That keeps a far-off finale from reading as "grind now, enjoy later", the very thing Fin's story argues against.
- These were game text changes for the game session. The titles, the milestone and the welcome line are done (in game, PR #42), and so is the cottage card (PR #63). The cottage lines are still on the lane branches.

The original problem, for the record: The current game is built on "the farm you keep promising to retire to": the README, the level titles from "Early Retirement" (L10, `src/game/config.ts:471`) to "Retired, Happily" (L20, `config.ts:481`), and the cottage's "Home" stage on the unmerged branches. It also has three different finish lines: L10, L20, and the cottage's Home at about 36,000 XP. The new canon is about a burnt-out engineer who becomes a caretaker. The two can coexist (the retirement dream is the player's own joke, and the island is where it comes true), but the author should choose. *Affects:* the level titles, the cottage, the README and the store pitch.

**Q3. Where the existing animal cast fits.** **Decided (2026-10-22): cut the five residents** (§4.7). Later that day the wild visitors were dropped too, all except the Brown hare (`CAST.md` C4). Originally: five talking-animal residents and about 35 letters are written and waiting on `idle/mail`, and 22 visitors are live. Are they island natives, travellers, or ambient life outside the story (§4.7)? *Affects:* whether the letters merge as written, and how "different species" plays out in the relic history.

**Q4. The tower and the púca's home.** **Mostly decided (2026-10-22).** The wizard's tower is the ruin on the highland's upper plateau, and he camps until the highland rises. The púca lives at the field edges and in the hedges (Idea), so she needs no building. *Built, in the game (`tower_ruin`, `barnaby_camp`):* the ruin art and his camp (the game design: a lean-to and bedroll beside the garden). *Still needed, post-alpha:* a small shed by the jetty on the wetland lake for Fin's rods and biscuit tin (see `VOICES.md`; **Decided 2026-10-25:** a small, sound timber hut of the woodshed's family, `CAST.md` §5, "How he looks"), and his bench spot by the pond. The shop sells a "Pond bench" (decor, from level 10, `src/game/config.ts`). **Decided (2026-10-25):** with Fin's build, that bench appears, free, when he does, at its own spot by the pond, and the shop stops selling it; a player who already bought one keeps it, and he sits on it. **Decided (2026-10-25):** the jetty, and so the shed, stands on the wetland lake, where the art keeps a shed patch (`art/BLUEPRINT.md`); until the wetland has docked, Fin sits on the bench by the pond (**Implied:** so his clue objects, §12 S3 and S4, wait for the wetland; `CAST.md` §5). *Affects:* art and layout slots on the highland and on the wetland lake.

**Q5. When the previous mage lived on the island.** Was he one of the earliest community, or a later inhabitant? *Affects:* the order of the relic sets, and whether he appears in the found family's traces. **Decided (2026-10-24): option 3, unplaced on purpose.** Neither his pages nor the earliest community's traces mention the other, so either order stays possible. Until this is revisited, no relic links him to the found family or says who built the tower.

**Options (Idea):**

1. **One of the earliest community.** His pages and their traces become one set, and his leaving becomes one of their departures, which risks a tragic subplot beside Fin's (`CAST.md` §1).
2. **Later, after they had gone.** Two separate sets in a known order: his pages could notice their traces, never the reverse, and he becomes someone who lived there between them and now (§4.2).
3. **Unplaced, on purpose.** Neither his pages nor the community's traces mention the other, so either order stays possible; the six drafted pages already name nobody.

**Recommendation (adopted 2026-10-24):** option 3. It gives the writing its answer (neither appears in the other's traces), keeps §4.2's two questions open, and changes no drafted page. The cost: no relic may link him to the found family, or say who built the tower, until this is revisited.

**Q6. The first relic vehicles.** **Decided (2026-10-22):**
- **Objects wait in the world** until noticed, like the hare and the big catch. Tapping one writes a quiet journal line and keeps the object in the almanac.
- **Barnaby's field notes come as letters.**
- **The almanac's old pages are the previous mage's fragment.**
- **No count anywhere.**

See `CAST.md` C10. Originally: the mechanics are rightly open, but writers need to know whether a given relic is an almanac page, an object or a scene, because each needs different UI. Picking two or three vehicles for the first story would unblock the writing without closing off the rest.

**Q7. The harbour and the lighthouse.** Do they mean people once travelled to and from the island on purpose? If so, how does that sit with arrivals being sudden? This is lower priority; one sentence of canon would settle it. **Decided (2026-10-24): option 3, places, not routes.** No arrival or departure in story text uses the harbour, the lighthouse or the Signal Fire, and who built the harbour, and why, stays Open.

**Options (Idea):**

1. **For leaving, not arriving.** Arrivals stay sudden and leavers get a way off the island, but an exit in plain view brushes against whether the player can leave.
2. **An earlier inhabitant's hope.** Someone built the harbour for planned travel that never came: a new backstory the first story doesn't need, and an unused harbour must read as stillness, not neglect (§3, rule 6).
3. **Places, not routes.** No arrival or departure in story text uses the harbour, lighthouse or Signal Fire, and who built the harbour, and why, stays Open; the lighthouse is the player's own building (In game, `src/game/config.ts`).

**Recommendation (adopted 2026-10-24):** option 3. It keeps arrivals sudden and the harbour's past open, and unblocks Fin's cloud fishing and the lighthouse at night. The cost: the moored sky-boat stays a loose end, and a departure by sky needs the author first.

**How they look (Decided 2026-10-25):**
- **The sky-boat stays moored.** It bobs, its sail stays furled, and nobody boards it or takes it out, so Q7's loose end stays loose. The rowboat only goes on the island's own water, never on the cloud sea. What the sky-boat is for stays open on purpose: this is a rule that keeps the question open, not an answer to it.
- **The beam and the Signal Fire are lights for the night.** The beam turns slowly and the fire burns steadily. Nothing on the horizon ever answers them, so they may be for someone or for no one.
- **Nobody moves into the Keeper's Cottage.** It belongs with the player's lighthouse, a place like the harbour, and its windows light at dusk by the day cycle, like every building's.

The cast has its own decisions, C1–C10 in `CAST.md` §8. All of them are decided except the Open items each one notes (the specifics of Fin's past).

### C. Existing text to review against this bible

Checked against `origin/main` on 2026-10-25, after PR #63. The lore's text fixes (branch `lore/text-fixes`) are counted, since they land with this version of the table. Rows marked **Resolved** need no more than the small leftover they name, if any. Every other row is text still in the game. "Live" means a player can see it today; otherwise the row names the switch that hides it. They're listed so they can be fixed, or checked again, the next time these files are edited.

| Text | Where | Issue |
|---|---|---|
| "It grows from your real work." | `src/ui/Tutorial.tsx` | **Resolved (Q1):** fine as the interface's plain voice. |
| "the island felt it faintly, like a ferry docking" | `src/game/systems/journal.ts` | **Resolved (Q1):** this is the echo framing exactly. Keep it. |
| Bridges: the meadow "reached by a little bridge", the "Bridge Builder" title, "can be reached now", the `stone_bridge` asset, Hazel's islet letter (now cut with the residents) | `feat/idle-loop` `config.ts`, `art/ASSETS.md`, `idle/mail` | **Resolved (in game, PR #14):** land rises and docks, with no bridge, and no bridge is left in the player's text on `origin/main`. The meadow's bundle is the Drystone Wall and the L13 title is "Drystone Waller". Only the `stone_bridge` entry in `art/ASSETS.md` and the `stoneBridge` bundle id (a code name, with a comment saying why) remain, and neither is player-facing. |
| Three names for the main island: "Around the farm", "Home island", "the main island" | The Visitors page (which may go with the visitors), the restoration board, the stamps | **Resolved (with the lore's text fixes):** "Home island" is the one name. The Visitors page's home section now matches the restoration board, and the stamps are empty. |
| "This island is yours" | `src/ui/Tutorial.tsx`, live | **Resolved (Decided 2026-10-25; with the lore's text fixes):** the title becomes "An island to look after": caretaking, not ownership. |
| "contemporary… a digital terrarium, not a farming sim" | `art/ASSETS.md`, not player-facing | Reads against the canon's magical island. The art is frozen, so this is only flagged. |
| The Sky Harbour and the lighthouse | `src/game/content/bundles.ts` (`skyHarbour`) | **Resolved (Q7):** places, not routes. "A little harbour with a moored sky-boat; cloud fishing opens." implies no route, and the sky-boat is the loose end Q7 accepts. The lighthouse blurb (`src/game/config.ts`) now reads "A steady light for the end of a long sprint." (with the lore's text fixes). |
| "The first wild visitor has been and gone. Word of the island is getting about." | `src/game/systems/visitors.ts` (`FIRST_VISITOR_STORY`), live | **Resolved (in game, PR #63):** it reads "The hare has been and gone. It was in no hurry." |
| "Nobody is visiting just now. Wild things come by in their own time." and "Wild visitors start coming by once the farm reaches level {n}." | `src/ui/panels/journal/almanac/VisitorsPage.tsx`, live | **Resolved (in game, PR #63):** "Nobody is visiting just now. The hare comes by now and then." and "The hare starts coming by once the farm reaches level {n}." |
| "Retirement plan", "Progress to early retirement", "You made it. Feet up, kettle on." and "{n}% of the way to early retirement." | `src/ui/panels/progress/CottageCard.tsx`, live | **Resolved (in game, PR #63):** no finish line at level 10. The bar is "Progress to Islander", and the caption reads "{n}% of the way to becoming an Islander." until "You're an Islander." The section title "Retirement plan" stays (C1, `CAST.md` §8), and the finale line waits for the cottage's Home (Q2). |
| "A cottage by the lighthouse; Ardea the heron moves in." | `src/game/content/bundles.ts` (`keeperCottage`), behind the `restorations` switch | **Resolved (in game, PR #63):** "A cottage by the lighthouse, with a light in the window." |
| "Reed beds and an otter holt." | `src/game/content/bundles.ts` (`reedBeds`), behind `restorations` | **Resolved:** the card reads "Tall reed beds along the boardwalk." (in game, PR #63), and the bundle's picture on the board loses the holt (with the lore's text fixes). |
| "A wooden jetty on the pond; fishing opens." | `src/game/content/bundles.ts` (`pondJetty`, its name and card), behind `restorations` | **Resolved (Decided 2026-10-25; with the lore's text fixes):** the restoration is renamed the Fishing Bench, and its card reads "A bench by the pond; fishing opens." The pond has no jetty: Fin's jetty stands on the wetland lake, and by the pond he sits on the bench (§4.8; `CAST.md` §5). The id stays `pondJetty`. |
| "A hedgehog in a postie's cap was seen on the path." | `src/game/systems/journal.ts` (the level-5 ladder line), behind `letters` | **Resolved (in game, PR #63):** the line and its ladder entry are gone. |
| Hazel, Bramble, Ardea, Moss and Corrie, with their titles ("a hedgehog postie" and the rest) and homes | `src/game/content/residents.ts`, behind `residents` | **Resolved (in game, PR #63):** `residents.ts` is gone, and the five with it. |
| "{n} fish were landed in the wetland." (paid in coins) and the wetland's "Cranberries grow here, and fish can be caught." | `src/game/content/yields.ts` (the fish yield), live; `src/game/config.ts` (the wetland's effect), live | Fin's fish always go back and never pay (`CAST.md` §5; B6), and his jetty stands on the wetland lake (§4.8). Nothing clashes while Fin and `fishing` are out of the game, but once they're in, the farm sells the fish he puts back. **Decided (2026-10-25):** the fish yield goes with Fin's build, and the effect becomes "Cranberries grow here." (`VOICES.md`, Fin's "Ready for the brainstorm"). Until then the row stands. |

---

## 12. A provisional first-story outline

**Idea.** This is a flexible set of beats, not a script. Only the opening has a fixed place. It was revised on 2026-10-22 for the cast handover: the story now runs on its three central characters, and history comes in only where it helps them. Each character's detail is in `CAST.md`.

The story runs as several **strands** that interleave. Within a strand, beats lean towards an order; across strands, the order is loose. Every find should still make sense on its own.

### Opening (fixed)

**O1. Waking somewhere impossible.** The player's last memory is collapsing after a hard day. They wake on a small island in the clouds, and nothing is explained. One plain line about the collapse goes in the welcome (decided, Q1; draft: "You remember a long day, a bright screen, and then nothing."), then the caretaking begins. (In game: the Welcome and Tutorial already give a gentle start.)

### The island

- **I1. It grows.** The first new land rises from the clouds and docks: whichever piece the player claims first. It's observed, never explained.
- **I2. Small oddities.** Things the player can't account for, each open to two readings (§3). They become the wizard's raw material. *(Draft lines: `VOICES.md`, "The island's small oddities".)*

### The wizard: *What is this place?*

- **W1. Found one morning.** He's in the radishes, after his attempt to summon the refuge to him was reversed (§7). Comic and baffled, he cycles through relief, panic and confidence.
- **W2. Camping, and the far hills.** He makes do in a lean-to beside the garden (the game design), mentions the old rumour of a crackpot mage who found a refuge, and won't say what he suspects.
- **W3. Experiments and field notes.** His notes arrive as letters. Each settles one small answer and opens one new question, and some of his theories are partly right. *(Draft set: `VOICES.md`, "Field notes, the full set".)*
- **W4. The ruin on the plateau.** When the highland docks, he goes straight to the tower ruin and stands there a long time. Then he calls it "a perfectly ordinary ruin" and moves in.
- **W5. The old pages.** The almanac's few written pages turn out to be in a hand Barnaby knows. He goes very quiet, and says it's "nobody's" (§6).

### The púca: *What if happiness is already here?*

- **P1. Glimpsed, then met.** She's the Brown hare visitor, and a hare in the crops you left standing, from whenever the meadow is claimed. She's met properly, as herself, at a field edge once Barnaby has settled.
- **P2. She's around.** Napping in the crops you left standing, being an extra sheep or a goat on the roof, helping animals with things, leaving odd little gifts. The land around her grows more magical.
- **P3. Time-blindness.** A promise she forgot, kept a season late. Her "now" sits alongside the wizard's theories and the skeleton's "someday", without cancelling either.

### The skeleton fisherman: *What if someday never comes?*

- **S1. A skeleton on the jetty.** The Fishing Bench is restored and someone is already fishing: from the jetty on the wetland lake if the wetland has docked, and on the bench by the pond until it has (Decided 2026-10-25, `CAST.md` §5). Delight comes first.
- **S2. Good company.** A long stretch of jokes, fish and the big catch. This is the longest stretch in the story.
- **S3. Small things that don't add up.** The tackle box's price sticker, and the rods glimpsed through the shed window.
- **S4. A few optional fragments.** The bundle of unused licences, one for every year. Each object waits in the world until noticed.
- **S5. Understanding.** No speech, and real joy afterwards.

### History, selectively

- **H1. One or two everyday traces** of earlier lives, only where they add something (the cairn, the wetland bell, the old stones are candidates). The almanac arrives early as an ordinary object; its old pages come later, in W5.
- **H2.** Anything else from the island's past arrives through the wizard's investigation.

### Later in the first story (Idea)

- **A resting point, not an ending.** The first story can settle without resolving anything: the island still growing, the mystery still open, the skeleton still fishing.

### Loose dependencies

- W2 follows W1. W4 needs the highland to have risen; if it's already there when he arrives, W2's camping is skipped. W5 means more after W4, but it must also stand alone.
- The skeleton's strand is the slowest. S5 should land after the player has spent time with all three characters.
- The púca's strand and the wizard's strand don't depend on each other.
- Nothing depends on the player seeing everything.

### What sets each beat off (Idea)

Beats key off events, not level numbers. The game session's approved economy rebalance (`feat/idle-economy`, not shipped yet) puts every land piece on sale from level 1, in any order, and retunes the level curve. Nothing is wired up.

| Event | Beats it can set off |
|---|---|
| The game starts | O1; the almanac arrives (an ordinary object at first) |
| The first land is claimed (any piece) | I1, I2 |
| A set early level (the game design: 06:00 the first morning after level 6) | W1, W2 |
| The meadow is claimed | P1: the Brown hare visitor |
| Barnaby has settled (after W2) | P1: Síofra met properly, as herself |
| The Fishing Bench is restored | S1, then S2 over time |
| The highland is claimed | W4: Barnaby moves into the ruin (straight away, if the highland came first) |
| The player earns the "Islander" title | Fin's light congratulations |
| Time, presence and the player's own pace | W3, W5, P2, P3, S3–S5. S5 lands only after the player has had time with all three. |
| The cottage reaches Home | The finale: "Retired, Happily", and Fin's rods in their wrappers |

---

## Changelog

- **2026-10-22.** First consolidation, from the author's lore brief and their answer on magic. Existing repo text was reviewed at `origin/main` 6c18227 and on the `idle/*` lane branches. No game text or code was changed.
- **2026-10-22, later.** Folded in the character and narrative direction handover. Added the **Direction** tag, a scope note, the skeleton fisherman (§4.8) and pointers to the new `CAST.md`. Revised the relic count (§9) and the first-story outline (§12), both of which were Ideas, around a small cast. No canon changed.
- **2026-10-22, decisions.** The game calls him the **wizard**. The retirement framing stays, on purpose (Q2). The skeleton's tragedy centres on dying before he could live the dream; whether someone else is missing is being researched (`CAST.md` C3).
- **2026-10-22, brainstorm.** The druid is now a **púca**, the Hare of the Corner: ageless, chill and time-blind. She notices crops left standing, variety, and flowers, bees and trees. The skeleton's shape is settled: moving goalposts, the man he would have been, an ordinary death, prepared not practised. The pitch and §12 were updated to match.
- **2026-10-22, more decisions.** The five animal residents are cut as characters (Q3); animals stay as resources and cosmetics. The Brown hare visitor is the púca. The skeleton's echo of the player stays faint.
- **2026-10-22, the wizard's arrival.** The refuge spell, reversed by the island. He's found the next morning and keeps his suspicion to himself. His tower is the ruin on the highland plateau, and he camps until level 12 (§7, Q4, §12). Visitors are narrated, not spoken, except the hare.
- **2026-10-22, names.** Barnaby Wick (the wizard), Síofra (the púca) and Finlay, "Fin" (the skeleton).
- **2026-10-22, real work and the fiction (Q1).** The inhabitants notice an echo they can't explain; the player knows it's their work. The interface speaks plainly and story text never explains (§3, rule 7). One line about the collapse goes in the welcome. Characters never remark on the echo's absence.
- **2026-10-22, finish lines (Q2).** One finale: the cottage's Home is the retirement and awards "Retired, Happily". L10 becomes "Islander" and L20 "Part of the Furniture". The cottage is "Yours already" from the first peg.
- **2026-10-22, Fin's clues.** Saving as his goalposts, an ordinary world without magic, no present arc, and three clue objects (§4.8).
- **2026-10-22, events not levels.** After the game session's heads-up about the economy rebalance (land without level gates, a retuned curve), §12's level table became an event table. The wizard's camping, the hare's first glimpse and Fin's congratulations now key off events and titles.
- **2026-10-22, how clues are found (Q6).** Objects are noticed in the world, logged in the journal and kept in the almanac. Barnaby's field notes come as letters. The almanac's old pages are the previous mage's fragment. No counts.
- **2026-10-22, the old pages drafted.** Six draft pages of the previous mage's fragment are in `VOICES.md` (§6). The author approved the voice, the unfinished "I'll" and the unspoken oak. "If it happened by accident, it can be done on purpose" is now canon (§2, §4.3).
- **2026-10-22, Síofra's world.** She's a wanderer between worlds who can't find the way back and isn't bothered, with errands of her own. "Escaping city life" no longer applies (§4.5, `CAST.md` C7).
- **2026-10-22, read-through.** Fixed stale text from the day's decisions:
  - Tags and terms: added **Decided** to the tag table and a short Terms list (the almanac, the residents, the residents system).
  - The pitch no longer leads with bureaucracy.
  - Druid-era leftovers now carry notes.
  - The wizard's and the púca's decided items are no longer marked Open.
  - Added an "Also open" list to §11.
  - Filled in §12's beats for Fin's objects and meeting Síofra.
  - Recorded that page v leans towards the tower having been the previous mage's.
- **2026-10-22, last decisions.** The tower hint on page v stays and is never stated. Barnaby arrives at a set early level, which the game session places in its new curve. He found the spell in a very silly old book back home.
- **2026-10-22, no visitors.** The wild visitors are dropped altogether, except the Brown hare (Síofra), superseding the decision to narrate them. The Pond Jetty no longer needs the heron to have visited, and the heron may stay as pond scenery. The game session was told, with the knock-ons.
- **2026-10-23, evening drafts.** Q5 and Q7 (§11) each gained options and a recommendation, tagged Idea and not decided; so did the relic count and whether Síofra drifts on (`CAST.md` C4 and §4). New drafts, pointed to from §1, I2 and W3: the island's small oddities and Barnaby's full set of field notes in `VOICES.md`, and store page copy in `STORE.md`. `VOICES.md` also gained "How the pools fit together", which gathers the game-line pools' scheduling rules in one place. No canon changed.
- **2026-10-24, the last open calls.** The author decided: Q5, the previous mage stays unplaced on purpose; Q7, the harbour, the lighthouse and the Signal Fire are places, not routes; the relic count is a handful in the first story, with about twenty as the long-run target (`CAST.md` C4); and whether Síofra drifts on is never answered (`CAST.md` §4). Barnaby's echo letter is a voice sample only. The store copy leads with the shorter pitch and calls Síofra often a hare.
- **2026-10-24, the first story's relics.** §9 now records the handful: the cairn stone and the wetland bell (the game's two hidden details), the previous mage's old pages, Barnaby's field notes and Fin's three objects. The hooks table is brought up to date. No new relic, and no canon changed.
- **2026-10-24, game text re-checked.** §11 C's table was refreshed against `origin/main` after PR #54: a new intro, file paths in place of line numbers, the bridges, island-name and Sky Harbour rows resolved or mostly resolved, and seven rows added for text that still contradicts canon, three of them live. Q2's note on the game text now says only the cottage card is left. `VOICES.md` gained a letters plan and Síofra's brainstorm prep, both Draft. No canon changed.
- **2026-10-25, Fin's place and Barnaby's look.** Fin's jetty stands on the wetland lake, and until the wetland has docked he sits by the pond (§4.8, §11 Q4, §12 S1; `CAST.md` §5). Barnaby's look is adopted as the game draws it, and his age stays open (§4.4, §11). `VOICES.md` sorts Fin's lines by stage.
- **2026-10-25, the art's questions answered, and Fin's pond.** The author approved the lore answers for the art (Decided): seasons and the distant isles (§3, with a pointer in §10), traces without decay (§3, rule 6, pointed to from §9), the ruin's look (§7, so Q4 needs the ruin art only), how Síofra's changes look (§7), the shiver's reach (§8), the cairn stone's and the bell's looks (§9), the sky-boat, the beam, the Signal Fire and the Keeper's Cottage (Q7, pointed to from §9's hooks), and Fin's shed (Q4). How Fin and Síofra look and the letters are in `CAST.md` (§5, §4, C10). What the distant isles are, what the sky-boat is for and whether the ruin was the previous mage's stay open on purpose. Fin's pond: it's too small for a jetty, so by the pond he sits on the bench (§4.8, Q4, §12 S1; `CAST.md` §5). The Pond Jetty's card is to become "A wooden jetty; fishing opens." once the letters PR has merged (§11 C).
- **2026-10-25, the game text brought into line.** §11 C is checked again after PR #63. In game, the first-visitor line, the Visitors page, the cottage card, the keeper's cottage, the reed beds' card, the hedgehog line and the residents are resolved. The lore's text fixes land with this version: the lighthouse blurb, "Old Hand" for level 11, "Stilt Hide", "Home island", the notice board's first line, the reed beds' picture without the holt, and eight interface strings without em dashes. The author decided two more (Decided): the Pond Jetty is renamed the Fishing Bench, with the card "A bench by the pond; fishing opens.", so the pond has no jetty anywhere; and the tutorial's first title becomes "An island to look after". One point stays open, by the author's choice: the wetland's fish yield against Fin's catch and release, to settle in Fin's build (new row).
- **2026-10-25, Fin's brainstorm answered.** The author answered the nine questions in `VOICES.md`, Fin's "Ready for the brainstorm" (Decided). With his build, the wetland's fish yield goes (§11 C), and the pond bench appears, free, when he does and leaves the shop (Q4).
