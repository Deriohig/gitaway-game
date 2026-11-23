// species.mjs -- the one table of the trees and bushes, revision 2 (art/specs/2026-10-22-painterly-trees-design.md "Revision 2", task
// R1): free CC0 models (Quaternius Stylized Nature MegaKit, Standard tier) repainted by scripts/reskin.mjs into art/reskin/<id>.glb
// (`node reskin.mjs --recipe <id>`, or `--all`). The Meshy-era concept prompts stay in art/meshy/<folder>/concept_prompt.txt as a record.
//   * SPECIES: id = the composition's asset name; source = the MegaKit glTF (<pack>/glTF/<source>.gltf); kind = broad | conifer | bush;
//     height = game units at scale 1 (today's models', so the composition scales still fit); cap = the most triangles the model may
//     keep; ramp = the concept folder (art/meshy/<ramp>/source/concept_1.png) its foliage is painted from; barkRamp = the concept its
//     bark is painted from (barkPart: which bark pixels, 'barkGrey' = the beech's silvery bark), or bark: 'birch' = repainted white
//     with dark marks; overlay = painted cards added to the crown ('apple', in `Canopy') or the bush ('berry'); approved = an
//     owner-approved model whose bytes are pinned (tests/reskin.test.mjs RS8): the fir as the fir fix rebuilt it (the owner,
//     2026-10-25: "Just fix them and put them into the game"), the flowering bush as R1 recoloured it on the owner's "Yes, recolour
//     it" (its cards and blossom kept). Every conifer keeps round 1's ramp, rebuilt (reskin.mjs step 3c); every broadleaf and bush
//     takes R1's look.
//   * tune (optional, reskin.mjs's per-model knobs, chosen on the look sheets): trim = thin to exactly this share of the leaf cards (fewer,
//     bigger cards, R1's trim), minKeep = the card floor when thinning to the cap, growMax = the most the kept cards grow (default 1.5),
//     trunkOnly = keep only the trunk of the bark (every branch out; a conifer always does), coneReach = (conifer) its cone's
//     reach at the lowest frond over the source fronds' own (a broader fir), stretch = the xz scale over the height's (a broader crown),
//     leafTex = another of the pack's leaf pictures on the same cards, sides: 'faceOut' = leaves single-faced and wound outward on a
//     single-sided material (as the bushes) instead of duplicated faces: twice the cards in a tight cap, hueSpread = the foliage ramp's
//     end hues pushed this much further from its middle (a concept with a small shadow-to-sun hue gap keeps it in the texture).
//   * far (optional, trees only): the far version's knobs over reskin.mjs FAR (task 11b: <id>_far.glb, for distant trees and
//     low-power draws; cards = the share of the near version's leaf cards kept, default 0.37, growMax 1.5, barkTris 120, overlay 6;
//     maxTris = its triangle target, by kind reskin.mjs FAR_MAX: broadleaf <= 1,000, the conifers <= 500, the sapling's set to 500 here;
//     reskin.mjs refuses to write a far version over it).
//   * AUTUMN: a species' geometry, byte for byte, with its foliage on an autumn ramp around `hue` degrees (reskin.mjs autumnStops).
export const SPECIES = [
  // (far: a conifer's big frond strips of 22 tris thinned to half and grown read as dark blobs, so every frond stays, each simplified:
  // 46 fronds in 470 tris beside a 24-tri trunk tube. coneReach: Pine_5 is a broad cone; its own longest frond made a slimmer fir)
  { id: 'tree_pine_a', source: 'Pine_5', kind: 'conifer', height: 2.55, cap: 1200, ramp: 'tree_fir', barkRamp: 'tree_fir', approved: true, tune: { coneReach: 1.18 }, far: { cards: 1, leafTris: 470 } },
  // Pine_1: the slender spire on a long bare trunk (Pine_5 is a broad cone); its dead lower twigs out (with them it is 3,947 tris)
  { id: 'tree_pine_b', source: 'Pine_1', kind: 'conifer', height: 1.97, cap: 1200, ramp: 'tree_fir', barkRamp: 'tree_fir', tune: { trunkOnly: true }, far: { cards: 1, leafTris: 470 } },
  { id: 'tree_round_a', source: 'CommonTree_1', kind: 'broad', height: 2.3, cap: 3500, ramp: 'tree_oak', barkRamp: 'tree_oak', tune: { trim: 0.6, growMax: 1.4 } },
  { id: 'tree_round_b', source: 'CommonTree_2', kind: 'broad', height: 2.3, cap: 3500, ramp: 'tree_beech', barkRamp: 'tree_beech', barkPart: 'barkGrey', tune: { trim: 0.6, growMax: 1.4 } },
  // TwistedTree_3: the broadest UPRIGHT crown (TwistedTree_1 is wider but leans ~30 deg, a windswept sprawl); 3,728 tris at 60 %
  // (far: its 743 cards at 37 % are 1,100 tris alone; 29 % fits 1,000 beside the trunk)
  { id: 'tree_spread', source: 'TwistedTree_3', kind: 'broad', height: 1.92, cap: 3500, ramp: 'tree_maple', barkRamp: 'tree_maple', tune: { trim: 0.55, growMax: 1.4, stretch: 1.15 }, far: { cards: 0.29 } },
  // the sapling thinned harder (to the 50 % floor) into airy pads; single-faced leaves wound outward: two-sided by duplicated faces,
  // 1,500 tris hold only 39 % of the cards
  { id: 'tree_sapling', source: 'CommonTree_5', kind: 'broad', height: 1.34, cap: 1500, ramp: 'tree_sapling', barkRamp: 'tree_sapling', tune: { trunkOnly: true, sides: 'faceOut', trim: 0.5, growMax: 1.25 }, far: { maxTris: 500 } },
  // the birch concept's shadows are olive (its own shadow-to-sun hue gap 21.6 deg): end hues x 1.3 out, so the texture keeps it (RS4c)
  { id: 'tree_birch', source: 'CommonTree_3', kind: 'broad', height: 2.3, cap: 3000, ramp: 'tree_birch', bark: 'birch', tune: { trim: 0.6, growMax: 1.4, hueSpread: 1.3 } },
  { id: 'tree_fruit', source: 'CommonTree_1', kind: 'broad', height: 1.9, cap: 3500, ramp: 'tree_apple', barkRamp: 'tree_apple', overlay: 'apple', tune: { trim: 0.6, growMax: 1.4 } },
  { id: 'bush_a', source: 'Bush_Common', kind: 'bush', height: 0.9, cap: 600, ramp: 'bush_leafy', tune: { leafTex: 'Leaves_NormalTree_C.png' } },
  { id: 'bush_flowering', source: 'Bush_Common_Flowers', kind: 'bush', height: 0.9, cap: 600, ramp: 'bush_flowering', approved: true },
  { id: 'bush_berry', source: 'Bush_Common', kind: 'bush', height: 0.9, cap: 600, ramp: 'bush_leafy', overlay: 'berry', tune: { leafTex: 'Leaves_NormalTree_C.png' } },
];

export const AUTUMN = [
  { id: 'tree_oak_autumn', from: 'tree_round_a', hue: 22 },
  { id: 'tree_beech_autumn', from: 'tree_round_b', hue: 36 },
  { id: 'tree_birch_autumn', from: 'tree_birch', hue: 48 },
];
