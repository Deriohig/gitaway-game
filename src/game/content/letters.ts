// Letters (B4): Barnaby's ten field notes, sent one at a time in the morning post. Each is delivered once;
// nothing is owed and nothing expires. Warm, lightly funny, never urgent.
//
// The notes are kept as their parts, not as a text body: the layout (`letterParts` in systems/mail.ts) builds the
// letter from them, so each line stands alone and the title is bold without any Markdown in the data. The text is word
// for word from docs/lore/VOICES.md, "Field notes, the full set". "Sheefra" is spelled that way on purpose.

/** A letter's id, in the order the notes are listed in the lore. */
export type LetterId =
  | 'bell' | 'bell-rung-back' | 'cloud-sea' | 'cloud-sea-thursday' | 'grove-key'
  | 'grove-tuning-fork' | 'docking-height' | 'siofra-readings' | 'fin' | 'ruin-stairs'

export type LetterSender = 'barnaby'

/** What the island must have for a note to be unlocked (see the gates in systems/mail.ts). */
export type LetterNeed = 'wetland' | 'islet' | 'grove' | 'twoPiecesDocked' | 'siofraMet' | 'finOnJetty' | 'inRuin'

export interface LetterDef {
  id: LetterId
  from: LetterSender
  needs: readonly LetterNeed[]
  /** The note that must have been sent first, at least FOLLOW_UP_DAYS earlier. */
  after: LetterId | null
  /** "Field note: the bell under the wetland." */
  title: string
  /** The answers, one line each. At most two; the layout prefixes each with "Established: ". */
  established: readonly string[]
  /** The question this note leaves open. */
  notEstablished: string
  /** What he'll try next. */
  next: string
}

export const LETTERS: Record<LetterId, LetterDef> = {
  bell: {
    id: 'bell',
    from: 'barnaby',
    needs: ['wetland'],
    after: null,
    title: 'Field note: the bell under the wetland.',
    established: [
      "it rings, once, low. Green, I'm told. Sounds can't be green. I've written it down anyway.",
      'there is nothing down there. I checked, twice, with a rope.',
    ],
    notEstablished: 'what rang it.',
    next: 'ring it back. Dusk, longer rope.',
  },
  'bell-rung-back': {
    id: 'bell-rung-back',
    from: 'barnaby',
    needs: ['wetland'],
    after: 'bell',
    title: 'Field note: the wetland bell, rung back.',
    established: [
      "at dusk I rang a teacup over the wetland. A beat later, something below rang back, in the teacup's note and not its own.",
      'there is still nothing down there. Longer rope, same nothing.',
    ],
    notEstablished: 'whether it was answering me or the teacup.',
    next: 'the good china. Then a saucer, as a control.',
  },
  'cloud-sea': {
    id: 'cloud-sea',
    from: 'barnaby',
    needs: ['islet'],
    after: null,
    title: 'Field note: the cloud sea.',
    established: [
      "it isn't wet. I lowered a weighted string off the islet, as far as it would go, and it came back up as dry as the inside of my hat.",
    ],
    notEstablished: "whether that's wonderful or alarming. It's certainly one of the two.",
    next: 'Thursday. Same string, with a wet sponge on the end.',
  },
  'cloud-sea-thursday': {
    id: 'cloud-sea-thursday',
    from: 'barnaby',
    needs: ['islet'],
    after: 'cloud-sea',
    title: 'Field note: the cloud sea, by Thursday.',
    established: [
      'a sponge, lowered off the islet sopping wet, came back up dry and warm.',
      "it's wonderful, not alarming. I said I'd know by Thursday, and I do, give or take a Thursday. The why I'll keep to myself.",
    ],
    notEstablished: 'where the water went.',
    next: 'a bucket. A full one, on the longest string I own.',
  },
  'grove-key': {
    id: 'grove-key',
    from: 'barnaby',
    needs: ['grove'],
    after: null,
    title: 'Field note: the creak in the grove.',
    established: [
      "it's the trees, not the wind. They creak on still days too, all in the same key.",
      "it isn't a key I know. It sits between two that I do, and won't be talked out of it.",
    ],
    notEstablished: "what it's in tune with, if anything.",
    next: "my tuning fork, on a still day. If it and the trees disagree, it won't be the fork.",
  },
  'grove-tuning-fork': {
    id: 'grove-tuning-fork',
    from: 'barnaby',
    needs: ['grove'],
    after: 'grove-key',
    title: 'Field note: the grove and the tuning fork.',
    established: [
      "the grove's creak isn't the trees after all. Struck in there, my tuning fork rings in the grove's key. Outside, it's back to its own. It has never done that before. Marvellous.",
    ],
    notEstablished: 'whether the grove is out of tune, or the rest of us are.',
    next: "I'll leave the fork there for a week, and see what key it comes home in.",
  },
  'docking-height': {
    id: 'docking-height',
    from: 'barnaby',
    needs: ['twoPiecesDocked'],
    after: null,
    title: 'Field note: how new land docks.',
    established: [
      'it comes in level with the old. I went looking for a difference with my finest ruler, and the ruler gave up first.',
    ],
    notEstablished: 'what keeps it that way.',
    next: 'a sterner ruler.',
  },
  'siofra-readings': {
    id: 'siofra-readings',
    from: 'barnaby',
    needs: ['siofraMet'],
    after: null,
    title: 'Field note: Sheefra.',
    established: [
      "she can't be measured. A goat at nine, a crow at noon, and never once, thank goodness, a cow.",
      'she\'s no use as a source. I asked about other worlds. "Oh, loads," she said, and told me about a puddle.',
    ],
    notEstablished: 'whether she has a usual shape, or just a favourite.',
    next: "I'll ask her, very politely, to hold still.",
  },
  fin: {
    id: 'fin',
    from: 'barnaby',
    needs: ['finOnJetty'],
    after: null,
    title: 'Field note: what holds Fin together.',
    established: [
      'no spell that I can find. I examined him all afternoon. He examined a tench.',
      "something registers, though. My needle lifts a little when I stand near him, and stays lifted whether he's casting, untangling or explaining roach.",
    ],
    notEstablished: "what exactly I'm reading.",
    next: 'a more sensitive instrument, and a chair for the part about barbels.',
  },
  'ruin-stairs': {
    id: 'ruin-stairs',
    from: 'barnaby',
    needs: ['inRuin'],
    after: null,
    title: 'Field note: the stairs in the ruin.',
    established: [
      "they're good stairs. Sound stone, well laid, and not a wobble in any of the ones I tested.",
    ],
    notEstablished: "that there's more stair than there is tower. I've chosen not to establish that.",
    next: 'a rug for the bottom step.',
  },
}

export const LETTER_IDS = Object.keys(LETTERS) as LetterId[]

export const LETTER_SENDERS: Record<LetterSender, { name: string; signOff: string }> = {
  barnaby: { name: 'Barnaby', signOff: 'Barnaby' },
}

/** The opening line of every letter. `{farm}` is the farm's name. */
export const SALUTATION = 'Dear {farm},'
