# Gitaway: the current cast

This is the working doc for the first story's three central characters. It was started on 2026-10-22 from the author's character and narrative direction handover, then shaped the same day by the author's choices in a brainstorm. It sits alongside `BIBLE.md`, which holds the world, the canon and the writing rules.

> A small number of deeply realised characters is more valuable than a large cast of interesting backstories.
> (the handover's guiding principle)

## How to read this

The tags are the bible's (Canon, Implied, Open, Idea, In game, Direction, Decided), and its tag table defines them. The two that matter most here:

| Tag | Meaning |
|---|---|
| **Direction** | The author's current intent, from the handover. Write toward it. It's a conceptual foundation rather than finished canon, so details may change. |
| **Decided** | A choice the author made explicitly in a brainstorm, with its date. It has the force of canon: write from it, and don't reopen it without the author. |

A heading tagged "(Idea)" can still contain bullets tagged **Decided** inline. The inline tag wins.

Nothing here is a script. None of the three backstories is written, and this doc deliberately doesn't write them.

---

## 1. Scope

**Direction.**

- The first story centres on three inhabitants: the wizard, the púca and the skeleton fisherman. The player watches, and the island persists.
- The wizard's investigation is the main source of mystery.
- The island's history doesn't need a large cast of previous inhabitants. Relics and historical stories come in selectively, only where they add real emotional or narrative value.
- There is one tragedy, developed carefully: the skeleton's. It gets no tragic subplots around it, and not every character is tragic. Contrast, humour, ordinary life and genuine happiness are essential.
- The island can have a vast history that the player never learns.

**What this changes in the bible.** The bible's canon stays as it was, apart from the púca replacing "druid" as what she is (§4). What changes is its scope:

| Bible material | Before | Now |
|---|---|---|
| The earliest community (Canon) | A main source of relics | Background: true, but the first story doesn't need to tell it. |
| About 20 relics (Canon target) | A slate to fill | Selective: a handful in the first story, about twenty as the long-run target across stories (§8, C4, decided 2026-10-24). |
| The previous mage (Canon) | A relic storyline of his own | A thread inside the wizard's investigation: the almanac's old pages (C10). |
| The first-story outline (Idea) | Four strands, with a large history strand | Rewritten around the three characters (bible §12). |
| The animal residents (In game, unmerged) | An open question | **Cut** from the first story (Decided 2026-10-22, §8, C4). |

---

## 2. How the three fit together

**Direction.**

| Character | Narrative role | Central question |
|---|---|---|
| The wizard | Mystery, magic, discovery | What is this place? |
| The púca | Nature, living in the moment, contentment | What if happiness is already here? |
| The skeleton fisherman | Tragedy, time, unfulfilled dreams | What if someday never comes? |

Together they make a progression. The wizard makes the player curious about the world, the púca encourages them to appreciate being in it, and the skeleton reminds them that their own life is happening now. These are underlying themes, never dialogue prompts and never lessons. Each character has to be a believable person first.

**When they arrive (Idea). Beats key off events, not level numbers.** The game session's approved economy rebalance takes the level gates off land: all seven pieces are on offer from level 1, in any order, and the level curve is being retuned (`docs/superpowers/specs/2026-10-22-idle-economy-design.md` on `feat/idle-economy`, not shipped yet). So:

- The wizard arrives at a set early level (Decided 2026-10-22). The game session's design places it at the first morning (06:00) after level 6.
- The púca is glimpsed as the Brown hare visitor whenever the meadow is claimed (§4), and met properly once the wizard has settled.
- The skeleton arrives when the Fishing Bench is restored; fishing opens with it (In game, `origin/main` `src/game/content/bundles.ts`, `pondJetty`). The bench is early on the restoration list, which gives his story the long runway it needs. However early he arrives, his reveal lands last.

**How the three get along (Idea).** The contrast is the point, and nobody plays mediator.

- **The wizard and the púca.** He measures; she can't be measured, and his readings of her contradict each other. He never translates for her, summons her or supplies her (see §4, Two traps).
- **The wizard and the skeleton.** The wizard may find the skeleton fascinating as a phenomenon, and be tactless about it, which is funny. The skeleton would probably rather talk about fish.
- **The púca and the skeleton.** He lived for "someday" and missed "now"; she has only "now", and no "someday" at all. Neither is right, and neither teaches the other. A time-blind fae and a lifelong planner are funny together.
- None of these has to become a friendship.

---

## 3. The wizard

The handover calls him "the magician". The first brief and the bible's canon call him "the wizard" and give him a "wizard tower". He is the same character. **Decided (2026-10-22):** the game calls him the **wizard** (§8, C5).

### Established (Canon, bible §2)

He is genuinely powerful and knowledgeable, and he fled a world of magical bureaucracy. He wants peace and time to practise magic. He arrived by a summoning spell that the island intercepted, and he swings between relief, panic and confidence. He has heard the rumours of the previous mage, lives in a tower that feels familiar, and tries to explain the island. His arc isn't set.

### Direction (handover)

- **Central question:** *What is this place?* He's the main character through whom the player explores the island's magic: what it is, how it works, where it came from, why it behaves strangely, and how it might relate to other worlds or dimensions.
- He's the natural way to bring in magical discoveries, experiments, mysteries and unusual events.
- He isn't a one-dimensional comic fool: his curiosity, knowledge and ambitions are real, even when his interpretations are wrong. *(The handover had his humour come from frustration with permits and committees. On 2026-10-22 the author made bureaucracy jokes rare; his running gag is the cow. See "Beyond the theme".)*
- **Theme:** understanding how something works doesn't necessarily mean understanding what it means.
- He explores the mystery; he doesn't explain everything. The island keeps its ambiguity and wonder.

### Implied

- The previous mage came from his world, so the mage's fragment belongs naturally inside the wizard's investigation rather than in a storyline of its own.
- The handover calls his ambitions real, while the first brief says he mainly wants peace and "may develop ambitions of his own". The two fit if his ambition at the start is to *understand* the island, not to be famous for it. Confirm or correct.

### Name (Decided 2026-10-22)

**Barnaby Wick.** It's friendly and slightly comic, and "Wick" hints at candles and lanterns.

### Appearance (In game, adopted 2026-10-25)

**Decided (2026-10-25): the lore adopts his look as the game draws it.** A crumpled pointed hat with a brass band, a slate-teal robe (never purple), a warm scarf, a lantern at his hip and a satchel, and no long white beard. **Decided (2026-10-25):** his short brown beard is the art's detail, and story text never names it. His age stays ambiguous, and Open. Sources: `art/scripts/assets/barnaby.mjs` on `origin/main`, and the art bible's decision log, row "2026-10-23 | Barnaby" (`art/ART-BIBLE.md` on `art/art-bible`, PR #60).

### Open

His age; his connection to the previous mage, beyond their shared world and the rumours; whether his ambition grows into something like the previous mage's; and whether his investigation ever reaches an answer.

### Beyond the theme (Idea)

These are personality notes, not backstory.

- **Bureaucracy is why he left, not what he jokes about.** **Decided (2026-10-22):** the author found bureaucracy jokes annoying, so keep them rare, a passing mention of relief at most.
- **The cow.** **Decided (2026-10-22):** one of his running jokes is a cow with trapped wind. "Do you know what happens when a cow gets trapped wind?" He never tells you the full story; you can find out on your own. It's taught at magic school, because it can have deadly consequences. **Idea:** the first thing he did on the island was check for cows, and there aren't any. The gag withholds its ending, much as he explores the island without explaining it.
- **He's showy when nervous and generous when interested.** Panic comes out as jargon. Curiosity comes out as explaining things to whoever is nearby, the cat included.
- **He's bad at resting.** He came for peace and immediately started a research programme.
- **His theories are often partly right.** The joke shouldn't always be that he's wrong.

### How the mystery unfolds through him (Idea)

- **One answer, one new question.** Each experiment or discovery settles something small and opens something bigger. Nothing he finds closes the mystery.
- **Field notes, as letters.** **Decided (2026-10-22):** his findings reach the player as letters ("Field note: the bell under the wetland…"). They're unnumbered, so nobody wonders what they missed. The almanac goes to the previous mage instead (below).
- **The subjects are already in the game.** Land rising from the clouds and docking, the cloud sea and its fish, the wetland bell, the old stones, the lantern nights. He doesn't need new mysteries; he needs to look closely at the ones that exist.
- **Experiments go harmlessly wrong.** This is comedy, and it never costs the player anything on their island (bible §5, the guardrails).
- **The previous mage, in the almanac.** **Decided (2026-10-22):** the almanac is old and "most of its pages are blank" (In game, `origin/main` `src/game/systems/journal.ts:165`). The pages that aren't blank are the previous mage's: unsigned, and they are his fragment (bible §6). One day Barnaby recognises the handwriting, and says it's "nobody's". **Idea:** the old pages turn up one at a time, as "a page you hadn't noticed before". Were they always there, or did they appear? That passes the two-readings test, and it keeps the fragment from being the first thing found.

### His arrival (Decided 2026-10-22)

- **The spell was for the refuge itself.** Half as a joke, he tried the crackpot mage's old spell from the rumours, to summon the refuge *to him*. The island intercepted it and ran it the other way: it summoned *him*. This keeps the canon's "intercepted" and "didn't mean to travel here". *Open:* whether the island did it on purpose. **Decided (2026-10-22):** he found the spell in a very silly old book back home, long dismissed as nonsense. (He wakes up holding a scrap of it.)
- **He suspects, and won't say.** From day one he half-knows this is the crackpot's refuge, and he won't admit it, even to himself. It's a secret of his own.
- **He's found the next morning.** Like the cat moving in, he arrives while the player is away, and the journal records it. Nothing is missable.
- **His tower is the ruin on the upper plateau,** which is on the highland piece. The layout spec gives that piece "a flat-topped plateau", a summit cairn, a tarn, standing stones, a bothy and "ruins later" (`art/config/world-layout.spec.md:53`).
- **He camps until the highland rises,** whenever the player claims it. If the highland is already there when he arrives, he walks straight up to the ruin on his first morning, and there's no camping beat. The game design gives him a lean-to and bedroll beside the garden "for now", and he keeps looking at the far hills. (The existing journal line "The cloud has lifted off the far hills." already belongs to the highland.) When the highland docks, he goes straight to the ruin and recognises it. That pays off his suspicion, beside the island's oldest traces: the stones and the "Back by teatime" cairn.

**Implied.** The crackpot's spell survived in his world in that silly old book, and it still works.

**Practical.** The ruin is one model, the tower's broken base (bible §11, Q4, Decided 2026-10-25), and the art has built it with his camp. The player is never asked to rescue or house him; he sorts himself out.

---

## 4. The púca (formerly the druid)

### Decided (2026-10-22)

- **She's a púca, not a druid.** A púca is an Irish shape-shifting fae of the field edges. She's often a hare, sometimes a girl, and whatever else she fancies (see "She can be many things" below; the specific shapes there are Ideas). The research called the concept "the Hare of the Corner".
- **She's ageless and looks young.** She's a fae with no real age who looks like a young woman.
- **She's super chill and lives in the moment.** She isn't learning contentment. She already lives it.
- **She meets you through how you treat the land, crops and nature,** and never preaches about it. Her story is about her as a character, not a message about nature.
- **She notices three things,** all of which the game already tracks:
  - **Crops left standing.** Ripe crops you haven't harvested yet, and empty plots the game calls "resting soil". This is folklore's "púca's share", the bit of crop left in the field for her.
  - **Variety.** How many different crops you've grown (`stats.harvested`).
  - **Flowers, bees and trees.** Flower beds, beehives and fruit trees.
- **Her flaw is time-blindness.** "See you soon" means next season, and she forgets promises. She has no "someday" at all.
- **She can be many things.** The author wants her shape-shifting to be a big part of her: not just a hare and a girl, but whatever she fancies being that day. **Idea:** a fourth sheep when you bought three, a goat on the farmhouse roof, a crow the scarecrow puts up with, the pear tree for a morning, a hedge when the wizard asks her to hold still. Rules:
  - She's always an *extra* animal, never a missing one. She never takes or replaces the player's animals.
  - She's never menacing. Folklore's púca can be a dark horse that takes riders on wild night rides; that's dropped.
  - Her shapes are delight, and never a puzzle the player has to solve.

### Still standing from earlier

- **Canon (first brief).** She's new to the island and has no tie to its past. Nature becomes more magical around her. She understands the island intuitively, through caring for it. She isn't automatically right. *(As a púca, that understanding is lived and never a source of answers: she gets on with the island and can't explain any of it.)*
- **Direction (handover).** Her central question is *What if happiness is already here?* She is not a mystical dispenser of wisdom; she has her own personality, flaws and story. Her story is sincere, not preachy.

### Superseded

- "Druid" as what she is.
- Two of my earlier notes: that she arrives unsettled, and that she keeps finding one more thing to plant. She's chill. What her chill costs her is time-blindness.

### Name (Decided 2026-10-22)

**Síofra**, said SHEE-fra. It's Irish for "changeling" or "elf-like", a fitting name for a shape-shifter.

- **Idea:** let the game teach the pronunciation through character, not a tooltip. Barnaby keeps spelling it differently in his notes; she likes the third version best.
- **Practical:** check that the game's UI font has the accented "í".

### Her world (Decided 2026-10-22)

- **She's a wanderer between worlds.** She drifts from world to world, and the island is just the latest field edge.
- **She can't find the way back to wherever she started, and isn't bothered.** "It was a hedge. Or a gate. Something with a gap in it."
- **Her errands,** which are hers alone and keep her clear of the manic pixie trap:
  - **She helps animals with things:** mysterious favours nobody asked for.
  - **She collects odd things:** pebbles that hum, a feather that's warmer than it should be. Some turn up as gifts.
  - **She naps, seriously.** She has favourite spots and rates them.
- **Superseded:** the handover's "escaping the noise and demands of city life". Her story isn't an escape; she wandered in.
- **Rule: her wandering never explains the island.** She has seen many worlds, but she's no use to Barnaby as a source: she can't remember them properly and doesn't compare. "Worlds? Oh, loads. One had very good puddles." This keeps her a neighbour, not a key (see Two traps).

### Open

- Whether she drifts on one day. If she ever did, it would be a departure. The residents system assumes everyone stays, and leaving must never feel like lost content (guardrail G1). **Decided (2026-10-24): leave it as a quiet question, never answered** (option 2 below). She's never stayed anywhere this long, and hasn't noticed.
  - **Options (Idea):**
    1. **She stays.** She's here for good, as the residents system assumes: safe for G1, but "hasn't noticed" becomes a plain joke with no ache.
    2. **Never answered, as above.** Story text never has her leave or promise to stay, so nothing is lost (G1) and her time-blindness keeps a tender edge.
    3. **Off and back.** She's away a while and back a season late, never for good: a beat for her time-blindness, but an absence, so her beats must wait, and nothing may remark on the gap.
  - **Recommendation (adopted 2026-10-24):** option 2, the Idea already here. It keeps the question and needs nothing built. The cost: no beat may ever say she's staying or leaving, and the hint must stay faint, a line at most, or it sounds like a farewell.
- How she first came through.
- Whether the land changes because of her magic, because the island responds to her, or both.

### Folklore roots

From the research. The thinner sources are charm, not citation.

- **Kept:** the púca is an Irish shape-shifter tied to the harvest. It takes the shape of a hare, a horse, a goat and others, and it's mischievous rather than wicked. Popular sources describe a "púca's share" of the crop left in the field. Hares are a natural shape for her, since they live in meadows and at field edges. Gitaway keeps the shape-shifting, the field edges, the share and the harmless mischief.
- **Dropped:** in folklore, an offended spirit spoils the crop or leaves for good. In Gitaway she never punishes, never sulks and never leaves because of anything the player did (the guardrails).
- **Not adopted for now:** the Scots "Goodman's Croft", a patch of land deliberately left unfarmed for a supernatural "good man". It's a real precedent for wild corners, but wild corners would need a new mechanic.

### How she reacts (rule 1 is Decided; rules 2–4 are Ideas from the research and the guardrails)

1. **Only to what you add.** A field of nothing but radishes gets an ordinary day, with nothing held back.
2. **She shows it rather than says it.** Through where she naps (in the crops you left standing), who tags along behind her (animals), and what grows where she's been.
3. **Odd little gifts.** Random, cosmetic and delight-only: never currency, and never something to optimise. **Idea:** a humming pebble, or a hare's track that leads to a nice view.
4. **No meters.** There are no hearts and no hidden scores. Anything she might have done can still happen later.

### What her time-blindness gives the story (Idea)

- **It costs her, not the player.** She forgets she promised to show you something. She turns up a season late to something that mattered to someone else. She can't understand why anyone worries.
- **She is the skeleton's exact opposite**, and that comes from her flaw, not from a lesson (§2).
- **It's funny now and can be tender later.** For example, she keeps a promise a season late without realising it was ever late.
- **The folklore root is fae time:** Oisín spends about three years in Tír na nÓg while about three hundred pass in Ireland.
- **Seasons (Decided 2026-10-25)** stay a game convention, and story text never names the current one, so "a season late" is her own reckoning (bible §3, "What we know").

### Comic texture (Idea)

- Shoes on the wrong feet. Directions that loop. Harmless pranks, half-caught.
- She's a hare when you look straight at her and a girl out of the corner of your eye. *(Not taken for the art, 2026-10-25: she has two models, the hare and herself, and no camera trick; see "How she looks".)*
- She can't remember which shape she was yesterday: "Something with a tail."
- **Not adopted:** lying as a hobby, or being horrified by thanks. The author chose time-blindness as her flaw.

### Two traps

- **Stardew Valley.** A wizard plus a nature spirit can read as Stardew's Wizard and its Junimos. Five rules keep her clear of that:
  1. She's one named person with a voice, not a swarm or a mascot.
  2. The wizard never translates for her, summons her or supplies her; comically, he can't measure her.
  3. Her reactions never gate bundles or form a checklist.
  4. Everyone can see her.
  5. She's a neighbour, not a key to the island's mystery.
- **The manic pixie dream girl.** A burnt-out engineer meeting a carefree nature girl who exists to heal them is a cliché. She has errands of her own that the player isn't part of, and the player's burnout isn't her project.

### The hare visitor (In game)

A "Brown hare" visits once the meadow is claimed and the farm has reached level 4, comes back every 36 hours or so, and leaves a clover sprig (live, `origin/main` `src/game/content/visitors.ts`). Since the visitors were cut, it's the only one. Its lines already sound like her: "I was here first, technically. But the grass is long and I'm not one to argue." and "Same grass, same me. Slightly longer ears today, I think."

**Decided (2026-10-22):** the hare visitor *is* her first appearance, before anyone knows what she is (§8, C6). Her keepsake is already a clover sprig. The other visitors are dropped (C4), so she's the only wild visitor left, and the only animal that talks. Both are quiet hints.

### Introduction (Idea)

- **Glimpsed first** as the Brown hare visitor on the meadow, whenever it's claimed, and as a hare in the crops you left standing.
- **Met properly** at a field edge or a gate, once the wizard has settled.
- **Her home** is the field edges and hedges, not a house. She's wherever crops were left standing.
- **Talking to her is optional.** Most of her story is in where she naps and what turns up.

### How she looks (Decided 2026-10-25)

- **Two models only.** One is the hare (`visitor_hare`). The other is Síofra as herself: a young woman on the character yardstick, in the hare's warm brown and cream, with grass in her hair, her shoes on the wrong feet, and no wings, glow or fairy trappings. Only one of the two is ever on the island at a time.
- **Her other shapes stay journal lines.** If they ever become world actors, they use ordinary models and differ only in what they do (dozing, sitting on a roof ridge), never by a mark, a tint or a glow, so there's nothing to spot.
- **Where she's been, more of what's already there turns up slowly, and it stays when she moves on:** clover between the ripe rows, a drift of one wildflower, a bed standing a little taller. It never shows as light coming off her.
- **Her gifts and tracks.** Gifts are small plain objects on the doorstep, and their hum and warmth are in the words only. Her tracks stay in the journal.

---

## 5. The skeleton fisherman

He is new in the handover, and the brainstorm settled his shape. The handover's content below is **Direction**, the brainstorm's choices are **Decided**, and the rest is tagged as it goes.

### Decided (2026-10-22)

- **Why he waited: the goalposts kept moving.** Rest always came after the next milestone, and the milestone kept moving. (What the milestones were was settled later the same day: saving. See the next block.)
- **Who's missing: the man he would have been.** There's no lost loved one at the centre. If anyone else ever appears, they're a thin thread: never named, and never the explanation.
- **His death was ordinary and unearned.** There's no lesson in it, and it wasn't overwork. The specifics stay Open.
- **He's prepared, not practised.** He knows everything about fishing from years of planning, and has hardly ever actually fished. On the surface that's funny: encyclopaedic, enthusiastic and bad at it. In hindsight it's devastating: a lifetime spent preparing to live.
- **His jokes are worse.** Groan-worthy fish puns, told with total sincerity, and the energy of a lovable bore who'd happily talk about barbels for an hour. Still no skull puns, no jokes about being dead, and no music.

### Decided later on 2026-10-22: his goalposts, his world, his clues

- **The goalposts: until he'd saved enough.** He kept saving for the time to fish (to stop, to retire, to go), and "enough" kept rising. Meanwhile he bought the gear piece by piece. **Implied:** he could always afford the rod, never the time. This is the root of "prepared, not practised". It also sits squarely on the game's own premise, "the farm you keep promising to retire to".
- **His world had no magic.** It was an ordinary world like ours. How he came to be a talking skeleton on the island stays a mystery.
- **No arc in the present.** He's already at peace. He doesn't change; the player's understanding of him does.
- **The clues are three objects.** Each makes sense alone, and any two point the same way:
  1. **The licences.** A bundle of fishing licences, one for every year, all renewed and none used.
  2. **The tackle box** with its price sticker still on.
  3. **The rods still in their wrappers.** Glimpsed early (Idea: through his shed window), and named in his congratulations at the finale.
- **Gooseberries, done differently.** Chekhov's story borrows the same shape, a man saving for a country life, but its narrator condemns the dream. Here the dream is never judged. Borrow the object, not the verdict.

*Still Open:* what "enough" was for exactly, how he died beyond "ordinary and unearned", and the people in his life.

### Where he is (Decided 2026-10-25)

In the author's words: "The wetland. But if it's not unlocked he sits by the pond." And later: "The pond is too small for a jetty. Only the lake has one. He uses the bench by the pond."

- **His jetty stands on the wetland lake** (the art's `wetland_jetty`). Restoring the Fishing Bench, on the home island, is still what brings him. The jetty can stand empty on the lake before the Fishing Bench is restored, and Fin comes with the restoration.
- **Two stages.** *By the pond:* the Fishing Bench is restored but the wetland hasn't docked yet, so he sits on the bench by the home pond. The pond has no jetty; only the lake has one. *At the jetty:* once the wetland has docked, he fishes from the jetty on the wetland lake, and that's his home from then on. If the wetland docked first, he's at the jetty from the start.
- **His bench (Decided 2026-10-25).** By the pond he sits on the pond bench. With his build it appears, free, when he does, and the shop stops selling it; a player who already bought one keeps it. His fish never pay, so the wetland's fish yield goes with his build too (bible §11 C).
- **His shed and his clue objects** stand by the jetty on the wetland lake, where the art keeps a patch for the shed (`art/BLUEPRINT.md` on `origin/main`, "Shed patch"). **Implied:** so the clues wait for the wetland.
- **Decided (2026-10-25):** once he's at the jetty, he still fishes the home pond sometimes. So the pond stays one of his waters in both stages, and a line that has him fishing the pond fits either. **Implied:** the big catch waits with him: by the pond, then at the jetty. `VOICES.md` sorts his lines by stage (his "Notes for the game").

### Direction (handover)

- **The surface.** An amusing, eccentric skeleton who spends his time fishing beside the island's pond. He tells terrible jokes and makes ridiculous observations about fish, and he seems like a charming background character. His humour and everyday presence are essential: the player must enjoy him before they learn the truth.
- **Underneath.** Fishing was a simple life he always wanted and never got round to living. There was always something else first, and then he died before he got the chance.
- **Now.** His existence isn't an eternal punishment. The island offers him peace, and the chance to fish at last. That happiness doesn't erase the life he lost or the things he can never get back. His story holds both truths at once.
- **The emotional aim.** The weight of great tragic character stories, such as those in One Piece. The player forms a real attachment, and later discoveries change how they understand him.
- **Theme.** You can spend your whole life preparing to live and never actually get round to it.
- **The takeaway.** Not "work harder to achieve your dreams", but closer to: you don't need to earn the right to enjoy your life, and you shouldn't assume someday is guaranteed.

### Open: don't invent these

- How he died, beyond "ordinary and unearned".
- Exactly what "enough" was for. (The milestones themselves are settled: saving. See above.)
- The people in his life.
- How he came to the island and how long he has been there. (His world is settled: no magic.)

*Open by design:* the handover says "Do not invent definitive details for the skeleton's tragedy", so writers leave these open. Only the author may decide them, and only when it helps.

### Name (Decided 2026-10-22)

**Finlay**, who insists on "Fin, like the fishy bit". It's an ordinary name, and the pun is terrible and very him. **Idea:** his full name turns up late, on something he owns, as one of the reveal's quiet fragments.

### Why these choices (from the research)

- **Grief for the unlived self, not for a lost partner.** Chekhov's "Gooseberries", Tolstoy's *The Death of Ivan Ilyich* and Kurosawa's *Ikiru* all land without a lost loved one at the centre. A shared dream that keeps getting put off, plus a dead spouse, is the template of Pixar's *Up*.
- **An ordinary death fits "someday isn't guaranteed".** Death by overwork would mirror the player's collapse, turn the message into "work less", and push players towards "I died too".
- **Moving goalposts is the shape closest to the takeaway:** you don't need to earn the right to enjoy your life. It's also the most preachy if said out loud, so nobody ever says it.

### Implied

- **He mirrors the player.** The player collapsed from exhaustion after a hard day; he kept moving his own goalposts until it was too late. The handover wants this mirror: "the skeleton reminds the player that their own life is happening right now". An ordinary death keeps the mirror faint (§8, C2).
- **He is the only inhabitant we know died before arriving.** The earliest community grew old and died, presumably on the island, and nothing in the canon brings them back as skeletons. So his case may be different. This stays Open.

### Already in the game

- **The fishing system implies an angler nobody has shown.** On the unmerged `idle/b6-fishing` branch, fishing is catch and release. Open spots land a fish every 45 minutes of real time on their own. Fish never pay; they only fill the almanac. "A big catch waits at the jetty until it's noticed." (`src/game/systems/fishing.ts:1-3`).
- **The Fishing Bench** (id `pondJetty`, called the Pond Jetty until 2026-10-25) is the restoration that opens fishing: "A bench by the pond; fishing opens." (Decided 2026-10-25, so the pond has no jetty; bible §11 C). The jetty's model, `wetland_jetty`, is drawn only on the wetland lake, once the wetland has docked (`src/world/WildIsles.tsx`), and the restoration draws nothing on the home island. It used to require the heron to have visited first. With the visitors dropped, that requirement went (Decided 2026-10-22; gone from the game on main). The heron may stay at the pond as scenery, as Fin's "competition".
- **Four spots open over time:** the pond, the wetland boardwalk, the highland tarn by the bothy, and the cloud sea from the Sky Harbour. There are 40 fish, mostly real British freshwater species plus a few sky-fantasy ones, and each has a one-line note (`idle/b6-fishing` `src/game/content/fish.ts`).

### How he looks (Decided 2026-10-25)

- **The owner's model prompt is his look** (2026-10-25): a sun hat, a sage fishing waistcoat, an A-pose model, and no rod in the model. The rod is a separate prop, so his arrival can have him holding it the wrong way round.
- **His figure.** He stands on the 1.0 to 1.1 u character yardstick, like Barnaby. He's painted in the palette's warm creams, never white, and his eyes are soft warm shade, never black and never lit.
- **He reads as warm** through an easy, seated pose (on his stool at the jetty, on the bench by the pond) and lived-in kit (the bucket, the towel). Nothing plays on what he is, and no instrument and no scene of him alone in fog goes near him.
- **His shed** is a small, sound timber hut of the woodshed's family. The rods in wrappers stand behind its window, the biscuit tin sits closed on a shelf (the licences are never drawn), and the tackle box sits by his stool with a plain sticker that shows no figures. Each is a named click mesh. They only need to read up close, because each one's line says what's there.
- **The big catch** is a fish's tail over the rim of his bucket, with no species or size shown. Once it's noticed it goes back, and the bucket is as it was.

### Ideas that use what's there

- **He is the angler.** The passive fishing already implies someone at the jetty. He arrives when the jetty is restored, and the catches are his. No new mechanic is needed.
- **The fish notes are in his voice.** The 40 one-line notes become his ridiculous observations, and "prepared, not practised" gives them their joke: he knows every fish and catches them clumsily.
- **New places to fish.** Each newly opened spot is somewhere new for him to fish. That's the present-day happiness the handover asks for, built into progression the game already has. It isn't an arc: he doesn't change; he just has more water.
- **The big catch.** He's the one waiting proudly at the jetty with it. Noticing it is a small daily kindness, never a chore.

### The reveal: a structure, not a script (Idea)

1. **Affection.** For a long while he's simply good company: jokes, fish, running gags. This is by far the longest phase.
2. **Small things that don't quite add up.** Behaviours that read as quirks now and as meaning later. **Picked (2026-10-22):** the unused licences, the tackle box with its price sticker, and the rods in wrappers (see "Decided later" above). Other kinds that could join them: something he always does, something he always says, something he avoids.
3. **Fragments.** A few, all optional: an object, a memory, a quiet conversation. Each makes sense alone, and none explains everything.
4. **Understanding.** The player puts it together. Nobody says it out loud. He goes on fishing.
5. **After.** He's still happy, and it's still sad. At least one moment of real present-day joy comes after the player understands.

### Techniques (from the research)

- **Clues converge.** Several fragments hint at the same unstated fact, so any two are enough and none is required (as in *Gone Home* and *Unpacking*).
- **Heavy facts go in objects, weather and absence.** His letters stay ordinary and never mention his death. Mist or dusk can come before a heavier fragment, as a soft signal.
- **Tap lines are written to survive repetition.** A discovery changes how an old line sounds, rather than unlocking a separate pool of sad lines. No catchphrase spells out the theme (avoid the word "later").
- **His jokes are real joy, not a mask.** Later fragments add a "because" to his cheer, not a "beneath". He never jokes about being dead, and the sad fragments carry no punchlines. One voice speaks in both registers.
- **End on an image, not a statement.** Something like dusk at the pond, holding both truths at once.
- **No quest completes his wish,** because the island has already given him the fishing. No farewell, either: he doesn't pass on.

### Rules for the reveal (Idea)

- No exposition dump, ever. The player assembles the story.
- Nothing is gated behind grind, timed, or missable. A beat waits until the player looks.
- No "unlocked" messages and no completion counters. They turn grief into loot.
- Seeing all of it is optional, and seeing part of it should still move someone.
- No other tragic subplot runs alongside his.
- Nobody, him included, makes a speech about what it means.

### Risks to watch

- **Brook** (One Piece's skeleton musician). Avoid everything that makes Brook Brook: music, skull puns, gentlemanly manners mixed with crude gags, decades of solitude in fog, waiting on a promise, a recorded last song, being revived. (Passing mist as weather is fine; it's the decades alone in fog that are Brook's.) Brook's loss is an obligation he kept. This one is permission he never gave himself.
- **Other skeletons and fishermen.** *Coco* already has a comic skeleton with a hidden sorrow. *Spiritfarer*, the closest game to Gitaway, reportedly has a cheerful fisherman uncle hiding his pain. A cheerful mask over pain has been done, so his cheer is real.
- **The idle loop is itself "later".** No fourth-wall nudges. Developers playing while they work must never feel accused.
- **The player's fate.** Keep the echo faint (§8, C2).
- **The island as an afterlife.** Never explain where the dead go (bible §3, Open).
- **Residents never leave.** The residents system assumes everyone "arrive[s] and stay[s]" (`idle/mail` `src/game/content/residents.ts`). That suits him: he stays.

---

## 6. Bringing them into the game (Idea)

The game already has two systems that suit a small cast:

- **Residents** (unmerged, `idle/mail`). A resident arrives when a level, an owned item or a restoration is reached. Each has a small home in the world, an arrival line in the journal, and occasional short letters. "Nothing is owed, and nothing fades." (`src/game/content/residents.ts`) The five animal residents are cut (C4), so this system could carry the three central characters instead. That's the game session's call.
- **Visitors** (live, but being removed). Only the Brown hare stays (C4). Her entry keeps its arrival line, first-meeting line and repeat line.

| | Arrival | Home | Main channels |
|---|---|---|---|
| **Wizard** | Found one morning, at a set early level (the reversed refuge spell) | A lean-to and bedroll beside the garden "for now" (the game design), then the tower ruin on the highland plateau once the highland has risen | Journal lines, letters (his field notes), small visible experiments, and recognising the almanac's old pages |
| **Púca** | Glimpsed as a hare once the meadow is claimed; met properly later | Field edges and hedges | Where she naps, who tags along, odd little gifts, short lines |
| **Skeleton** | When the Fishing Bench is restored | On the bench by the home pond until the wetland has docked, then the jetty on the wetland lake (Decided 2026-10-25, §5) | Lines when tapped, the fish notes, the big catch, a few found objects |

Low-pressure rules for all three:

- They arrive on their own. The player is never asked to rescue, house or recruit anyone.
- Every interaction is optional. Nothing is timed and nothing can be missed: a beat waits until the player looks, and stays readable in the journal afterwards.
- Stories move with presence and time, not tasks. Nobody hands out quests.
- Notifications stay at the journal's usual quiet line.
- Arrivals are spaced out, so each character has the stage to themselves for a while.

---

## 7. Existing material: what supports the cast and what conflicts

| Existing material | Status | Effect | Note |
|---|---|---|---|
| The previous mage | Canon | Supports the wizard | A thread in his investigation, not a story of its own: the almanac's old pages (C10). |
| The earliest community; about 20 relics | Canon; target | In tension with the scope | Keep as background. Cut the first story's relics to a handful; about twenty stays the long-run target (C4, decided 2026-10-24). |
| Five animal residents, about 35 letters | Unmerged, `idle/mail` | **Cut** (C4) | Their letters and the level-5 journal line "A hedgehog in a postie's cap was seen on the path." go with them. The visitors were later dropped too, except the hare; the heron may stay as pond scenery. |
| Fishing: catch and release, passive catches, four spots, 40 fish notes | Unmerged, `idle/b6-fishing` | Strongly supports the skeleton | See §5. |
| The Fishing Bench restoration | `origin/main` | Supports the skeleton | Second on the restoration list: a long runway for him. |
| Ripe crops that wait; "Resting soil"; distinct crops grown; flower beds, beehives, fruit trees | Live, `origin/main` | Supports the púca | The three things she notices are already tracked. |
| The Brown hare visitor ("Slightly longer ears today, I think.") | Live, `origin/main` | **Is the púca's first appearance** (C6) | See §4. |
| Folklore spirits who leave or spoil the crop when offended | Folklore | Conflicts with the guardrails | Keep the etiquette comedy, drop the punishment. |
| Stardew's Wizard and Junimos | Precedent | Risk of reading as a copy | See §4, Two traps. |
| "Nothing withers if you take a break…" | Live, Tutorial | Supports the púca and the skeleton | It's practically their theme already. |
| The wetland bell, the old stones, the cloud sea, the rising land | Live and unmerged | Supports the wizard | Ready-made subjects for his investigation. |
| "The farm you keep promising to retire to"; today's titles "Early Retirement" and "Retired, Happily" | Live: README and level titles | **The skeleton's trap, in the game's own words** | Kept on purpose; the titles are being renamed, with one finale (§8, C1). |
| The player collapsing from exhaustion | Canon | Mirrors the skeleton | The echo is kept faint (C2). |
| Residents "arrive and stay" | Unmerged, `idle/mail` | Fits the skeleton; rules out departures | See §5, Risks. |

---

## 8. Decisions for the cast

**C1. The retirement framing and the skeleton.** **Decided (2026-10-22): lean into it.** The game's premise is "the farm you keep promising to retire to", and its level ladder ends at "Retired, Happily". That is exactly the skeleton's "someday". Kept on purpose, his story is how the game quietly turns its own premise around. **Finish lines (Decided 2026-10-22):**
- **One finale, at the end.** The cottage reaching Home is the retirement and awards "Retired, Happily".
- **Renamed titles.** The title that is "Early Retirement" today becomes "Islander", and today's "Retired, Happily" becomes "Part of the Furniture". The level each title sits at may move with the economy rebalance, so the lore keys off the titles, not the numbers.
- **Nothing is withheld on the way.** The cottage is "Yours already. It just needs walls." from the first peg. Full details are in bible Q2.

**Fin at the two milestones (Decided 2026-10-22).**
- **On earning "Islander", a light line.** Draft: "Fin said congratulations, and that he'd lend you a rod any time. Just say."
- **At the finale.** "Fin said congratulations, and asked if you'd like to borrow a rod. He has several. Most of them are still in their wrappers." By then most players will know his story. The line carries "prepared, not practised" with no lesson attached.

**C2. How loudly the skeleton echoes the player.** **Decided (2026-10-22): keep it faint.** The mirror is about putting life off, never about dying. Nothing in his story suggests the player died. His ordinary, unearned death helps.

**C3. The skeleton's shape.** **Decided (2026-10-22):** moving goalposts; the person missing is the man he would have been; an ordinary, unearned death; prepared, not practised (§5). Still Open: the specifics.

**C4. How small is small.** **Decided (2026-10-22): the five animal residents are cut as characters** (Hazel, Bramble, Ardea, Moss and Corrie, with their letters). In the author's words, animals "can stay in the game, they're just not characters": they're resources and cosmetics. The cat and the dog stay. **Decided later on 2026-10-22: the wild visitors are dropped altogether, except the Brown hare.** This supersedes an earlier decision the same day to narrate them. She's the púca; being the only visitor and the only animal that talks quietly hints she's no ordinary hare. The Fishing Bench no longer needs the heron to have visited, and the heron may stay at the pond as scenery. The game session has been told, with the knock-ons (no code changed by this session). **Decided (2026-10-24): a handful in the first story, with about twenty as the long-run target** (option 1 below). A handful tied to the three characters follows the handover.

**Options (Idea):**

1. **Keep "about twenty" as the long-run target, a handful here.** No retag: canon (bible §2, §9) never says which stories the twenty cover, so the "about 20 relics" rows (§1, §7) just need a note.
2. **A handful, and retire the twenty.** Retagging the canon target (bible §2, §9) gives the first story a clear ceiling; later stories set their own.
3. **No number at all.** Retag it to drop the figure, adding a relic only where it serves a strand: closest to the handover's "selectively", but nothing to plan by.

**Recommendation (adopted 2026-10-24):** option 1. It changes no canon and unblocks the writing now, with bible §9's handful (one or two traces, Barnaby's finds, the old pages). The cost: "about twenty" lingers as a figure later stories inherit, and the rows need that note or read as a slate to fill.

**C5. Magician or wizard.** **Decided (2026-10-22): wizard.** His home stays the wizard tower.

**C6. The hare visitor.** **Decided (2026-10-22): it's her.** The live Brown hare visitor is the púca's first appearance.

**C7. The púca's name and world.** **Decided (2026-10-22):**
- her name is Síofra;
- she's a wanderer between worlds who can't find the way back and isn't bothered;
- her errands are helping animals, collecting odd things and napping seriously;
- "escaping city life" no longer applies.

*Open:* whether she drifts on one day.

**C8. The wizard's arrival.** **Decided (2026-10-22):**
- the crackpot's refuge spell, reversed by the island;
- he suspects and won't say;
- he's found the next morning;
- his tower is the ruin on the highland plateau;
- he camps until the highland rises.

Also decided later that day: he arrives at a set early level (the game session picks which), and the spell came from a very silly old book back home.

*Still open:* whether the island reversed it on purpose. (Where he camps is settled by the game design: a lean-to beside the garden. He arrives at 06:00 the first morning after level 6 and counts as settled 3 days later, or on moving into the ruin, whichever comes first. His game lines are in `VOICES.md`.)

**C9. Names.** **Decided (2026-10-22):** Barnaby Wick (the wizard), Síofra (the púca) and Finlay, "Fin" (the skeleton).

**C10. How clues are found.** **Decided (2026-10-22):**
- **Objects wait in the world** until noticed, like the hare and the big catch (e.g. Fin's tackle box on the jetty, his shed window). Tapping one writes a quiet journal line and keeps it in the almanac.
- **Barnaby's field notes come as letters.**
  - **Decided (2026-10-25): the letters exist only in the interface:** the Letters tab, its unread seal and the quiet journal line, as the owner's design has it (`VOICES.md`, "Letters: who writes, and when"). There's no post box at the farm, the camp or the ruin, and no postie or delivery animal. Nobody is ever seen bringing a letter. A field note is simply there at 08:00, the way a neighbour's note turns up. A post box would also suggest post that goes somewhere off the island, which bible Q7 keeps out.
- **The almanac's old pages are the previous mage's.**
- **No count anywhere.** Nothing says "3 of 8". The rule covers finds, clues and relics. An ordinary number in a character's line (Síofra counting your crop varieties) is fine.

---

## Changelog

- **2026-10-22.** Started from the author's character and narrative direction handover. Checked against `BIBLE.md` and the repo (`origin/main`, `idle/mail`, `idle/b6-fishing`). No game files were changed.
- **2026-10-22, decisions.** C5: wizard. C1: lean into the retirement framing.
- **2026-10-22, brainstorm.** Informed by research on poignant short narratives and on fae and nature-spirit folklore, and by a map of the game's land-care mechanics. The druid became a púca (the Hare of the Corner): ageless, chill and time-blind. She notices crops left standing, variety, and flowers, bees and trees. The skeleton got his shape: moving goalposts, the man he would have been, an ordinary death, prepared not practised. Added C6 and C7.
- **2026-10-22, more decisions.** C2: keep the echo faint. C4: the five animal residents are cut. C6: the hare visitor is the púca. Voice drafts for all three are in `VOICES.md`.
- **2026-10-22, voice notes.** The wizard gets fewer bureaucracy jokes and the cow gag. The púca leans into being many things. The skeleton gets worse jokes. Animals stay as resources and cosmetics, not characters.
- **2026-10-22, the wizard's arrival.** Visitors are narrated, not spoken, except the hare (the game session was told). The wizard's arrival is settled (C8): the reversed refuge spell, found the next morning, a suspicion he keeps to himself, and the highland tower ruin after camping until level 12.
- **2026-10-22, names.** Barnaby Wick, Síofra and Finlay ("Fin") (C9).
- **2026-10-22, the echo.** Bible Q1 is settled: all three characters notice the island shiver when the player works, and none of them knows why. Barnaby times it ("It keeps office hours"). They never remark on its absence. Lines are in `VOICES.md`.
- **2026-10-22, finish lines.** One finale (the cottage's Home awards "Retired, Happily"). L10 is "Islander" and L20 "Part of the Furniture". The cottage is "Yours already". Fin congratulates the player at L10 and at the finale (C1).
- **2026-10-22, Fin's clues.** His goalposts: until he'd saved enough. His world had no magic. He has no present arc. His clues are the unused licences, the tackle box with its price sticker, and the rods in wrappers (§5).
- **2026-10-22, events not levels.** Following the game session's heads-up about the economy rebalance (land without level gates, a retuned curve), beats now key off events: the meadow claimed, the jetty restored, the highland risen, a title earned. If the highland is already there when the wizard arrives, he skips camping.
- **2026-10-22, how clues are found (C10).** Objects are noticed in the world, then logged in the journal and kept in the almanac. Barnaby's field notes come as letters. The almanac's old pages are the previous mage's. No counts.
- **2026-10-22, Síofra's world (C7).** She's a wanderer between worlds who can't find the way back and isn't bothered. Her errands: helping animals, collecting odd things, napping seriously. "City life" no longer applies, and her wandering never explains the island.
- **2026-10-22, read-through.** Fixed stale text from the day's decisions:
  - the tag notes;
  - her many shapes;
  - Fin's runway;
  - Fin's "no present arc" in the fishing spots;
  - the order of §8 (C8 now comes before C9);
  - the scope of the "no counts" rule;
  - unnumbered field notes.
- **2026-10-22, last decisions.** Barnaby arrives at a set early level (the game session picks which). The spell came from a very silly old book. Page v's hint that the tower was the previous mage's stays, and is never stated.
- **2026-10-22, Barnaby's game lines.** Written for the game session's owner-approved design, and stored in `VOICES.md`. The design: found at 06:00 after level 6, a lean-to beside the garden, the ruin once the highland is claimed, settled after 3 days. The windmill-loft idea is retired.
- **2026-10-22, no visitors (C4).** The wild visitors are dropped altogether, except the Brown hare (Síofra), superseding the decision to narrate them. The jetty's heron requirement goes, and the heron may stay as pond scenery.
- **2026-10-23, evening drafts.** Options and a recommendation, tagged Idea and not decided, for the relic count (after C4) and for whether Síofra drifts on one day (§4). One line in §5 says why Fin's specifics stay open. Barnaby's full set of field notes, the letters C10 decided on, is drafted in `VOICES.md`. Nothing decided.
- **2026-10-24, decisions.** The relic count: a handful in the first story, with about twenty as the long-run target (C4). Whether Síofra drifts on: never answered (§4). Barnaby's echo letter is a voice sample only.
- **2026-10-24, brought up to date.** §4's hare matches the game (level 4 as well as the meadow, back every 36 hours or so, the only visitor), and §5's Pond Jetty no longer needs the heron in the game. In `VOICES.md`: Síofra is ready for her design brainstorm, the letters have a plan, and the stone loach's note loses its exclamation mark, which the fishing branch's test forbids. Nothing decided.
- **2026-10-25, two small calls.** Barnaby's "Day three" letter reaches every path: in the ruin, "my lean-to" becomes "the ruin". Fin's letter now catches the same tench twice instead of catching nothing, so it agrees with the almanac (both in `VOICES.md`). `VOICES.md` also records the owner's letters design (2026-10-24): the field notes first, post at 08:00 every 3 days at most, no toast, and one letter waiting after time away.
- **2026-10-25, Fin's place and Barnaby's look.** Fin's jetty stands on the wetland lake, and until the wetland has docked he sits by the home pond; his shed and clue objects are by the jetty (§5, §6). Barnaby's look is adopted as the game draws it, and his age stays Open (§3). In `VOICES.md`, Fin's lines carry stage gates, a found line for the pond stage is drafted, and two lines say "lake" for "pond".
- **2026-10-25, the art's questions answered, and Fin's pond.** The author approved the lore answers for the art (Decided): how Fin looks, with the owner's model prompt (§5), how Síofra looks (§4), and that the letters exist only in the interface (C10); seasons are pointed to from her time-blindness (§4). The rest are in the bible. Fin's pond: he still fishes it sometimes once he's at the jetty; the pond is too small for a jetty, so by the pond he sits on the bench; and the jetty can stand empty on the lake until the Pond Jetty is restored (§5, §6). Barnaby's short brown beard is the art's detail, and story text never names it (§3). In `VOICES.md`, the pond-stage found is decided and says "bench", a quiet journal line marks Fin's move to the jetty, and "lake" is the word for the wetland's water.
- **2026-10-25, the Fishing Bench.** The Pond Jetty restoration is renamed the Fishing Bench, with the card "A bench by the pond; fishing opens." (§5, §7; bible §11 C), so the pond has no jetty anywhere. Its id stays `pondJetty`, and it still brings Fin. The tutorial's first title becomes "An island to look after".
- **2026-10-25, Fin's brainstorm answered.** §5 gains his bench: the pond bench, free when he arrives. The rest of the answers are in `VOICES.md`, Fin's "Ready for the brainstorm".
