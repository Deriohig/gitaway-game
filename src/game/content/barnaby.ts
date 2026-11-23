// Barnaby Wick's lines, written by the lore session from docs/lore/VOICES.md
// and copied verbatim, in order, from the appendix of
// docs/superpowers/specs/2026-10-22-barnaby-design.md. Change them there first.
// None of them explains why the island grows, and none of them counts.

export type LandPiece = 'meadow' | 'grove' | 'islet' | 'wetland' | 'highland' | 'cottageLand' | 'orchardLand'

/** A journal line: its title, and the detail under it. */
export interface Line {
  title: string
  detail?: string
}

export const BARNABY: {
  /** Shown on hover. */
  name: string
  /** Being found: a toast, and a journal line. Once. */
  found: Line & { toast: string }
  /** Written the day he's found, after `found`, when the highland is already the farm's. Once. */
  straightToRuin: Line
  /** Once per piece claimed after he's found. The highland's is his moving line. */
  land: Record<LandPiece, Line>
  /** After a live shiver, at most one a day, from the lines tagged with its size or "either". */
  shiver: (Line & { size: 'big' | 'small' | 'either' })[]
  /** What he says when tapped, as a floating label, never journaled. The first tap is always the first line. */
  tapCamp: string[]
  /** Added to the tap lines once he's at the ruin. */
  tapRuin: string[]
} = {
  name: 'Barnaby Wick',

  found: {
    toast: 'Someone is asleep in the radishes.',
    title: 'There was a man in a pointed hat asleep in the radishes this morning.',
    detail:
      'He was holding a scrap of very old paper. He woke, looked around and said "Ah. That\'s unexpected," in the voice of someone for whom it was not entirely unexpected. His name, he says, is Barnaby Wick.',
  },

  straightToRuin: {
    title: 'One look at the highland, and Barnaby walked straight up to the ruin on the plateau.',
    detail: "He stood there for a long time. When he came down, he said it was a perfectly ordinary ruin, and that he'd be staying in it, thank you very much.",
  },

  land: {
    meadow: {
      title: 'At dawn, Barnaby paced out the new meadow. At dusk he did it again, got a different answer, and seemed delighted.',
      detail: "He's written both answers down, side by side, and won't say which one he believes.",
    },
    grove: {
      title: "The new grove creaks in a key Barnaby has never heard, and he's heard most of them.",
      detail: "He's going back tomorrow with a tuning fork, which he seems to have had on him all along.",
    },
    islet: {
      title: 'Off the new islet, Barnaby lowered a weighted string into the cloud sea. It came back up perfectly dry.',
      detail: "He says that's either very good news or very bad news, and that he'll know which by Thursday.",
    },
    wetland: {
      title: 'Barnaby waded into the new wetland and came back with wet boots and a theory.',
      detail: "The theory is about the reeds. He won't share it until it's better. It may never be better.",
    },
    orchardLand: {
      title: '"It can\'t be that hard," said Barnaby, and sat down in the new orchard to watch an apple grow.',
      detail: "One moved, apparently. He isn't sure which way.",
    },
    cottageLand: {
      title: 'Even Barnaby went quiet in the new glade.',
      detail: "He called it the sort of place you shouldn't measure. Then he measured it anyway, looking sorry about it.",
    },
    highland: {
      title: 'The new plateau has a ruin on top. Barnaby walked straight up to it and stood there for a long time.',
      detail: 'He came back down, fetched his bedroll from the lean-to, and was moved in before dark.',
    },
  },

  shiver: [
    {
      size: 'big',
      title: 'A long, deep shiver ran through the island, like a dog settling down.',
      detail: 'Barnaby wrote "pleased?" in his notes, crossed it out, and wrote it again.',
    },
    {
      size: 'big',
      title: 'A big shiver, the kind that walks teacups across saucers.',
      detail: "Barnaby added it to his chart of the shivers, which looks to him like somebody's very productive day. Not his.",
    },
    { size: 'either', title: "The island shivered, and Barnaby's compass spun once, politely, then pointed at the kettle." },
    { size: 'big', title: 'The whole island shivered. Barnaby has started timing it. He says it keeps office hours.' },
    { size: 'either', title: 'As the island shivered, Barnaby held very still and listened, in case it had more to say.' },
    { size: 'small', title: 'A small shiver, barely anything. Barnaby felt it in his teeth and wrote it down.' },
    { size: 'small', title: 'The island twitched, ever so slightly. Like a pond, Barnaby said, when a fish merely thinks about jumping.' },
    { size: 'small', title: 'A tiny shiver ran under the garden. Barnaby put his ear to the ground and stayed there until the cat came to check on him.' },
  ],

  tapCamp: [
    'Barnaby Wick. At your service. Well, at my own service, mostly.',
    'No committees. Nobody to tell me no. I may have to lie down.',
    "Where's the edge? There's always an edge. Oh. There it is.",
    "Leave it with me. I've handled stranger than an island. Not much stranger.",
    'My spell was a summoning. You bring the thing to you. Nobody told the island.',
    "A very silly old book got me here. I'm careful now what I call silly.",
    'Do you know what happens when a cow gets trapped wind? No? Good.',
    'They teach the cow at magic school, you know. First year.',
    "I'm not saying it's the cow. The barn at my old school was rebuilt. Twice.",
    'If you ever look up the cow, stand well back.',
    'I explained cloud tides to the cat. She left halfway through. Fair.',
    // Camp only, by its index: LEAN_TO_TAP in systems/characters.ts.
    "The lean-to is purely temporary. I've grown very attached to it.",
  ],

  tapRuin: [
    "It's a perfectly ordinary ruin. Stop looking at me like that.",
    'It smells familiar. Old paper and rain. Never mind.',
    "Two readings, two answers. I'd be worried if they agreed.",
    "The stairs go up further than the tower does. I've stopped checking.",
    "From up here the island looks like it's thinking. I'm not going to interrupt.",
  ],
}
