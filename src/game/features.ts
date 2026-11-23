// Feature switches for the idle loop (docs/idle-loop.md §5). The foundation
// ships with every feature that isn't finished yet switched off. While a
// switch is off the player sees nothing of that feature: its things aren't in
// the shop, its tools, tabs and settings are hidden, it writes no story lines
// or unlock notices, and its step in `advance` doesn't run. Its save data
// stays, so turning it on later picks up where the save left off.
//
// A feature's pull request turns its own switch on here, in one line.

export const FEATURES = {
  /** A1: the Journal tab and the welcome-back recap. */
  journal: true,
  /** A2: the almanac's Crops, Animals and Buildings pages. */
  almanac: false,
  /** A2: the shop's Preview ghost. */
  shopPreview: false,
  /** A3: looks that change with how many of a thing you own. */
  milestoneLooks: false,
  /** A4: ambient life, creature routines and names. */
  ambient: false,
  /** A5: seasons, weather and building variants. */
  seasons: false,
  /** A6: quiet mode, battery saving and desktop window layouts. */
  attention: false,
  /** A7: Settings → What counts, and caps told without counters. */
  fairCounting: false,
  /** B1: wild visitors and their almanac page. */
  visitors: true,
  /** B2: workbench, barn, press, spinning wheel, goods and crafts. */
  workshop: false,
  /** B3: the restoration board and its bundles. */
  restorations: false,
  /** B4: letters from the island's characters, read in Journal → Letters (the postcard is for later). */
  letters: true,
  /** B5: the island studio and photo mode. */
  studio: false,
  /** B6: fishing. */
  fishing: false,
  /** B7: the replanting scarecrow and the garden robin. */
  helpers: false,
  /** C1: the repo orchard, lantern nights and repository aliases. */
  gitEvents: false,
  /** C2: the decor, buildings and hidden details of the wetland and highland. */
  biomes: false,
  /** C2: the wetland and highland isles themselves, their crops and the goat. */
  wildIsles: true,
  /** The cottage and orchard pieces as plain land to buy after the highland, closing the island round the farm. */
  ringIsles: true,
  /** C3: the retirement cottage. */
  cottage: false,
  /** C4: quiet stamps. */
  stamps: false,
  /** The gazebo and the observatory: priced in config, but no feature draws them yet. */
  lateBuildings: false,
  /** The art session's composition: the trees, shrubs, rocks, flowers, grass and path ribbons on every piece. */
  composition: true,
  /** The island's characters: Barnaby Wick, his lines and his camp and ruin, and the shiver that follows work. */
  characters: true,
  /** The art session's water: every piece's water drawn from the baked water data, with the painterly water material (the farm's pond, stream and fall, the wetland's lake, river and fall, the highland's tarn, and its hot spring once the Hot spring is owned), the flowing water starting as the wetland docks. On since the owner saw the pond in the game. Off, the game's own water stays on every piece: the round pond, the ribbon streams and brooks, the falls and the lakes. */
  water: true,
}

export type FeatureId = keyof typeof FEATURES

/** Whether a feature is switched on. Read when called, so tests can flip a switch. */
export const isOn = (feature: FeatureId): boolean => FEATURES[feature]
