// Síofra's lines, written by the lore session and copied word for word from
// docs/lore/VOICES.md, "The púca", "Game lines, for the game spec (2026-10-25)"
// (docs/superpowers/specs/2026-10-25-siofra-design.md). Change them there first.
// She is only ever an extra, only ever notices good things, and nothing of hers
// counts anything.

/** Her name, once she's met. The "í" is the single character U+00ED. */
export const SIOFRA_NAME = 'Síofra'

/** A journal line of hers, posted as a moment. `id` is unique across every pool and is what `lastMoment` remembers. */
export interface MomentLine {
  id: string
  title: string
  detail: string
}

/** What a shape needs the island to own before it plays: at least one of these, or nothing. */
export type ShapeNeed = 'sheep' | 'scarecrow' | 'fruitTree' | 'chicken' | null

/** What a crops-left-standing notice needs at the post time: a ripe crop not yet harvested, or a plot showing resting soil. */
export type NoticeNeed = 'ripe' | 'resting'

/** The five keepsakes she gives, each once. */
export type SiofraGiftId = 'pebble' | 'feather' | 'clover' | 'dandelion' | 'shell'

/** What a tap line needs the island to own before it can play: the cat or a duck. */
export type TapNeed = 'cat' | 'duck'

export const SIOFRA: {
  /** Meeting her properly, at 06:00: the toast (the only one she has), and one journal line. */
  met: { toast: string; title: string; detail: string }
  /**
   * What the hare's own wording becomes once she's met, built from her name: the line under the hare's words, and
   * the Say hello button. Before that, everything reads "Brown hare", exactly as the visitor's definition has it.
   */
  hareOnceMet: { keepsakeLine: string; sayHello: string }
  /** Before she's met, after the hare's first visit: journal lines that never name her. */
  glimpses: readonly MomentLine[]
  /** Each plays only while the island owns what it needs. */
  shapes: readonly (MomentLine & { needs: ShapeNeed })[]
  /** Once she's met, each plays only while its condition holds at the post time. */
  cropsLeftStanding: readonly (MomentLine & { needs: NoticeNeed })[]
  /** Each given once. `item` is the keepsake's name, listed on her almanac card. */
  gifts: Record<SiofraGiftId, MomentLine & { item: string }>
  /** What she says when tapped, as a floating label, never journaled: her twelve lines, then her three naps. */
  taps: readonly { line: string; needs?: TapNeed }[]
} = {
  met: {
    toast: 'A girl with her shoes on the wrong feet is asking the way.',
    title: 'A girl with her shoes on the wrong feet asked the way to the meadow. She was standing in it.',
    detail: 'She thanked you for the directions anyway. "Síofra," she said. "SHEE-fra. Barnaby spells it a different way every time. I like the third one best."',
  },

  hareOnceMet: {
    keepsakeLine: 'Síofra left a clover sprig.',
    sayHello: 'Say hello to Síofra',
  },

  glimpses: [
    {
      id: 'glimpse-1',
      title: 'There was a hare asleep in the long grass. When you looked again, there was a pair of shoes there instead, and no hare.',
      detail: "They'd been left side by side, very neatly, the left one on the right and the right one on the left.",
    },
    {
      id: 'glimpse-2',
      title: "The hare's tracks crossed the meadow in the dew, stopped halfway, and carried on as footprints.",
      detail: "Bare ones, in no particular hurry. Near the field edge they turned back into a hare's.",
    },
    {
      id: 'glimpse-3',
      title: 'Two dips in the long grass this morning: one hare-shaped, and one about the size of someone lying on their back to watch the clouds.',
      detail: 'Only the hare was seen leaving.',
    },
    {
      id: 'glimpse-4',
      title: "At the field edge yesterday evening, the hare sat up and watched the sun go down, all the way to the end, the way people do and hares don't.",
      detail: 'Then it stretched, gave a small, contented sigh, and loped off to find its supper.',
    },
  ],

  shapes: [
    {
      id: 'shape-sheep',
      needs: 'sheep',
      title: 'There was one more sheep in the meadow than you bought. The extra one was very relaxed about it.',
      detail: 'Rather than grazing, it had a doze, and its ears were a slightly unusual length.',
    },
    {
      id: 'shape-goat',
      needs: null,
      title: 'A goat was sitting on the ridge of the farmhouse roof, as if it had always been there.',
      detail: "It didn't appear to belong to anyone, and it was perfectly comfortable about that.",
    },
    {
      id: 'shape-crow',
      needs: 'scarecrow',
      title: "A crow sat on the scarecrow all morning. The scarecrow allowed it, which isn't like him.",
      detail: "At noon the crow hopped down and walked off towards the field edge. It didn't seem to think of flying.",
    },
    {
      id: 'shape-fruit-tree',
      needs: 'fruitTree',
      title: 'This morning there was an extra fruit tree, and its leaves were on the wrong way round.',
      detail: 'Around eleven, it yawned. By lunchtime there were only the usual trees again.',
    },
    {
      id: 'shape-duck',
      needs: null,
      title: "Out on the pond, a duck you don't remember buying was lounging on a lily pad, wings folded behind its head.",
      detail: 'Now and then it tried a quack, very carefully, to see if it had the hang of it yet.',
    },
    {
      id: 'shape-chicken',
      needs: 'chicken',
      title: 'An extra chicken had joined yours, a step behind the others and copying them, not very well.',
      detail: 'It pecked at nothing, very seriously. Once, when it thought nobody was looking, it scratched behind its ear with a back foot.',
    },
    {
      id: 'shape-stone',
      needs: null,
      title: 'Overnight, a stone turned up by the path, round and smooth and just the right size for sitting on.',
      detail: 'Every time you passed it, it was a little further into the sun.',
    },
    {
      id: 'shape-hedge',
      needs: null,
      title: 'A bit of hedge had grown beside the farmhouse overnight. As you went by, it sneezed.',
      detail: 'By supper it had wandered off, presumably to sneeze somewhere else.',
    },
  ],

  cropsLeftStanding: [
    {
      id: 'notice-ripe-1',
      needs: 'ripe',
      title: 'Síofra napped at the end of a ripe row all afternoon, as a hare, then as herself, then as a hare again.',
      detail: 'She woke with a leaf stuck to her cheek, and seemed very pleased with the whole arrangement.',
    },
    {
      id: 'notice-resting',
      needs: 'resting',
      title: 'A bed of resting soil caught the sun, and Síofra lay down in it as if it had been made up for her.',
      detail: 'The cat came and lay down beside her. By teatime the dog had joined them, and nobody was in any hurry to get up.',
    },
    {
      id: 'notice-ripe-2',
      needs: 'ripe',
      title: 'Clover came up between the ripe rows overnight, in a neat little line about the width of a hare.',
      detail: 'At the end of it sat Síofra, admiring the rows the way some people admire paintings.',
    },
  ],

  gifts: {
    pebble: {
      id: 'gift-pebble',
      item: 'Humming pebble',
      title: "Someone left a pebble on the doorstep. It hums when it's warm.",
      detail: "Not a tune, exactly. More the sort of hum you do when you're pleased and haven't noticed.",
    },
    feather: {
      id: 'gift-feather',
      item: 'Warm feather',
      title: 'Síofra gave you a feather, warmer than any feather has a right to be.',
      detail: 'You tried to hand it back. "No, really," she said, "you have it." It\'s still warm.',
    },
    clover: {
      id: 'gift-clover',
      item: 'Four-leaf clover',
      title: 'There was a four-leaf clover on the doorstep, pressed flat inside a folded leaf.',
      detail: 'Scratched on the leaf, in tiny letters: "Counted twice. Four both times."',
    },
    dandelion: {
      id: 'gift-dandelion',
      item: 'Dandelion clock',
      title: "Síofra left you a dandelion clock that won't blow away, however hard you puff.",
      detail: "She says it keeps perfect time. She's never once checked it.",
    },
    shell: {
      id: 'gift-shell',
      item: 'Rain shell',
      title: 'A little spiral shell turned up on the windowsill. It smells of rain whenever you hold it close.',
      detail: "Warm rain, the sort you don't mind getting caught in.",
    },
  },

  taps: [
    { line: 'Oh, hello. Have we met? We have. I remember the face, I think. It was this one.' },
    { line: 'I was a fruit tree this morning. You walked right past. Rude, but fair.' },
    { line: "Which one was I yesterday? Honestly can't remember. Something with a tail." },
    { line: 'Worlds? Oh, loads. One had very good puddles.' },
    // The duckling needs ducks, as the lore gates it.
    { line: "Can't stop. A duckling's lost its nerve. Not its mother, its nerve.", needs: 'duck' },
    { line: "Helping the bees with something. They'll tell you. They won't, actually." },
    { line: "Home? A hedge. Or a gate. Something with a gap in it. I haven't needed it." },
    { line: "See you soon. My soon, not yours. Mine's roomier." },
    { line: 'Busy. Lying in the grass. Doing the other side next.' },
    { line: "Tried being a sheep once. Lot of standing about. I'd do it again." },
    { line: "There's a snail going the long way round. I'm keeping it company." },
    { line: 'I collect things warmer than they ought to be. Pebbles. Feathers. One Tuesday.' },
    // The three naps.
    { line: "Naps, ranked. Third row of the carrots: eight. The meadow's long grass: nine." },
    // The cat's windowsill needs the cat.
    { line: "Nap scores. Farmhouse roof: seven. The cat's windowsill: ten. Spoken for.", needs: 'cat' },
    { line: 'Best nap of all time: resting soil, in the sun. All time being this week.' },
  ],
}

/** Every moment line's id, in the order of the pools: glimpses, shapes, notices, gifts. What `lastMoment` can hold. */
export const MOMENT_IDS: readonly string[] = [
  ...SIOFRA.glimpses.map((l) => l.id),
  ...SIOFRA.shapes.map((l) => l.id),
  ...SIOFRA.cropsLeftStanding.map((l) => l.id),
  ...Object.values(SIOFRA.gifts).map((l) => l.id),
]
