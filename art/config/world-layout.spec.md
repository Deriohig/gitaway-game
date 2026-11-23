# Gitaway — World Layout Specification v3.1: ONE BLUEPRINT ISLAND, BUILT FROM DOCKING PIECES (LOCKED anchor)

> **Pointer (2026-10-24).** Layout stays frozen as specified here; composition and camera rules are summarised in [../ART-BIBLE.md](../ART-BIBLE.md) §E.

Supersedes v2 (separate floating isles) and v1 (one static ~220 u island). Decided by the user on 2026-10-18:
**the unlock isles rise from the clouds and dock into place, so the fully unlocked world is the single
continuous island shown in the blueprint images.** v3.1 adds the game session's constraints (2026-10-18).
Game numbers come from branch `feat/idle-loop` (src/world/layout.ts, terrain.ts, Isles.tsx, framing.ts).
Judge every stage against THIS.

## 0. Core principle
The blueprint island from the images, assembled piece by piece. The game starts with the farm piece floating above
a soft cloud sea. Each unlock is a piece of the same island that rises from the clouds and docks against the
island, its edges meeting exactly. Fully unlocked, the pieces form the one continuous island of the blueprint:
farm at the centre, clearing, meadows, woodland, rocky ledges, lake/river/waterfall, the upper plateau, a misty rim.
Gentle and welcoming at the centre; deliberate drama at the outer rim and on selected pieces. The images govern
LAYOUT and STYLE; the close-up panels show what each region should look like.

## 1. Pieces and the Island contract
- Every piece implements `Island` from src/world/terrain.ts: `geometry` (watertight, island-local, origin at its
  centre at flat-ground level, hanging to ≈ −5.5 × depth), `height(x, z)`, `outline(theta)`, `random()`. Everything
  is placed by local x/z + `height()`, never absolute y. Use terrain.ts's θ convention everywhere.
- All pieces are CUT FROM ONE PARENT HEIGHTFIELD (the blueprint island). Neighbouring pieces share identical heights
  along every seam, so docked pieces join with no visible step or gap — and the seam ground is gentle enough to walk
  across (the dog and sheep cross onto the meadow).
- Each piece is closed on its own (outer-rim skirt + seam walls + underside), so it can rise alone. When docked, seam
  walls sit back-to-back inside the joined island and are not visible from the gameplay camera.
- Undersides are shaped from the PARENT outline (depth by distance to the parent's outer rim), so docked pieces'
  undersides read as one island underside rather than a cluster of separate tips.
- A piece's world position is its docked position; `Rising` lifts it from 9 u below into that position. Each piece is
  its own mesh/group with its pivot at its local origin.
- The core stays three-free (arrays + functions, node-tested) with a thin adapter that builds the BufferGeometry.

## 2. The parent island and its scale
- **Compact and round: ≤ ~60 u across, as compact as the pieces' flat cores and drama allow, rounder rather than
  long.** Reason: at the gameplay cap (distance 130–140, fov 30) a landscape screen shows ~75 u of height, but a
  portrait phone (aspect ~0.45) shows only ~35 u of width; the game can raise the cap for phones, but the farm gets
  tiny if the island is large.
- Layout follows the blueprint images, rotated to fit the game camera, which looks from +x/+z over the near side at
  the garden: **the near side (the camera's line of sight to the farm) holds only LOW pieces**; tall and dramatic
  pieces go on the sides and far side (−x/−z).
- The centre piece is the game's main island (§3): r ≈ 8.8, every layout.ts coordinate unchanged.

## 3. The pieces (one per unlock; every unlock piece docks DIRECTLY to the main piece)
Petal layout around the main piece, so ANY subset of unlocks is coherent and each piece looks finished against the
main piece on its own; the main piece must still look like a whole island with nothing docked. Every piece is
optional (some players never unlock the orchard, wetland, highland or cottage).

| Piece | Blueprint region(s) | Placement | Flat core (local) | Must contain / reserve |
|---|---|---|---|---|
| main | A farm + B clearing + a little C | centre | per layout.ts | the farm at the game's positions; pond + stream; rim slots stay off seams |
| meadow | C meadow | NEAR side (low) | r ≈ 2.6 | shelter, haystacks, shepherd's hut, sheep shelter, wildflowers, up to 6 sheep; its seam is where the game puts a drystone wall + gate |
| wetland | E lake + G river & waterfall | left, at the main rim where the stream exits (θ = 2.42) (low) | r ≈ 2.4 firm ground beside the lake | lake (with a boardwalk-loop spot and the sunken-bell spot in it), river from the main stream exit to the lake, waterfall off the wetland's outer rim; heron hide, reed beds |
| grove | woodland | side / far side | r ≈ 2.4 (trees crowd the edges) | woodcutter's hut, mushroom ring, treehouse |
| highland | F upper plateau + D rocky ledges | FAR side (−x/−z) | r ≈ 2.8 | the main drama: flat-topped plateau + ledges; a high point for the summit cairn; a small tarn on the plateau (fishing); hot spring; standing stones, bothy, up to 4 goats; ruins later |
| islet | rocky coast | side / far, an outer promontory | r ≈ 1.6 near the lighthouse | OPEN outward coast (never a seam) for the sky harbour (sky-boat mooring over the cloud sea), cloud fishing, the keeper's cottage, the signal fire on the outermost point, and the lighthouse |
| orchard | (orchard) | side or far side (up to 8 trees — not near) | r ≈ 1.8 | 8 small trees with signs, one per repository |
| cottage | (cottage plot) | side or far side (grows to two storeys + chimney — not near) | r ≈ 1.8 | the cottage + a small garden; its build spot on the piece's OUTER half |
- Seams run through GENTLE terrain (never across a cliff).
- Main-rim features on seams: when a piece docks along a θ range of MAIN, the game hides rim-only effects there (the
  stream's waterfall at θ 2.42, cliff decor) and keeps slots off the seam. Main's near-rim slots today include bushes
  at (7.4, 1.8) and (−6.6, 2.3), trees at (−7.3, −1.1) and (−6.2, −5.6), the well at (−6.1, 0.9) and fruit-tree slots
  out to r ≈ 6.7 — keep them valid.
- These piece definitions supersede the game's `ISLES` numbers in layout.ts (so the old highland/orchard lane edits
  are moot); changing the game is the game session's lane (paused by the user for now).

## 4. Elevation, cliffs, drama and water
- One parent heightfield: tier solver |Δtier| ≤ 1, flat-core stamps, per-face slope colouring, triangle-exact sampler.
  Tier steps are tenths of a unit at this scale.
- Drama budget: gentle interior and seams; rocky faces at the OUTER rim and on the highland and islet pieces; the main
  piece's interior stays gentle (players drag placeables anywhere inside its outline), tall things on its far side.
- Outer rim: warm-stone cliff skirts hanging toward the cloud sea (reuse the game's makeIsland cliff-ring + tip look).
- **Water is drawn by the game.** The terrain carves the basins/channels and exports their geometry (§10): the wetland
  lake (outline + level), the river (polyline + width + level, starting exactly where the main stream meets the main
  rim at θ 2.42 and matching its width and level), the wetland waterfall (points), the highland tarn (outline +
  level), and the existing main pond + stream. The proof may show flat placeholder water.

## 5. Sea, rise and atmosphere
- Cloud sea at y ≈ −14 to −10.5 (`CLOUD_SEA_Y`). Rise: 9 u below the docked position, eased up over 4.5 s.
- Haze only beyond the island; fog camera-relative (near = camDist + 40, far = + 230); sky gradient per the game.
- The game will fit its sun shadow box to the docked island.

## 6. Composition (per piece; STYLE.md rules, rescaled)
- Main: hero = the farm at the game's positions; the clearing stays open; a meadow ring with flower drifts; a few
  far-side tree clumps; paths from the porch per the layout.ts path slots.
- Each unlock piece: ONE identity and ONE focal element; clustered scatter scaled to the piece; open space around its
  focal element and its flat core. Fully unlocked, the regions read as the blueprint's connected regions, with paths
  continuing across seams.

## 7. Cameras, unlock states, comparison set (game parity: NoToneMapping, fov 30)
Unlock states: `?unlocked=main` (start), `?unlocked=all` (the joined blueprint island), `?unlocked=<list>` (subsets),
and a rise preview of one piece mid-dock.
Gameplay presets (clamped: distance 14–140, polar 0.62–1.22, azimuth π/4 ± 0.85, from +x/+z):
1. **default_mobile** — main piece hero, portrait (primary). The farm must not be occluded by any docked piece.
2. **default_desktop** — main piece, desktop.
3. **farm_to_meadow** — the farm → meadow transition.
4. **max_zoom_all** — the fully joined island at the maximum gameplay zoom, landscape AND portrait (report how much of
   the island fits in portrait).
Photo presets (free orbit): **island_wide**, **highland**, **islet**, **grove**, **meadow**, **wetland_edge**,
**rim_edge**, **docking** (a piece mid-rise). Each preset has a matching concept crop where the images provide one.

## 8. Generation order
0. Transcribe MAIN, slots and BLOCKERS from layout.ts (read-only) into world.config, citing the commit.
A. Island core with BOTH paths: an island from its own spec, and a piece cut from a parent heightfield.
B. The parent blueprint island: centre = the game's MAIN constraints; other regions per the images and §3.
C. Cut the pieces; verify seams (zero height delta, walkable), each piece closed, any unlock subset coherent, no
   occlusion of the farm from the gameplay presets.
D. Per-piece composition + carved water features.
E. Cloud sea, sky, cameras, unlock states, rise preview, lighting toggle.
F. Export piece data (§10). Verify with the toolkit at every preset and unlock state.
Deferred: drawing water (game-side; proof placeholders allowed), highland ruins, and the missing assets (windmill,
greenhouse, well, bench, scarecrow, lanterns, beehives, fruit trees, lighthouse, sheep shelter, haystacks, cottage
stages, harbour, signal fire, …) — reserved footprints under `?debug=1`.

## 9. Guardrails
- Island contract preserved for every piece; the main piece keeps every layout.ts coordinate.
- Deterministic, config-driven, no new deps, no AI-generated models; core three-free + node-tested.
- All judging under game-parity rendering; STYLE.md applies (rescaled per piece).
- The art side never edits src/; the user coordinates merges; the game session announces island-number changes.

## 10. Piece data export (for the game) — JSON next to the config
Per piece:
- `id`, docked position (world), and which config entry builds its Island contract functions;
- outline polygon (local);
- the MAIN θ range it docks along, plus the seam polyline (local and world);
- flat zones as labelled discs or polygons (buildings, restorations, animals);
- water features: lake/tarn outline + level; river polyline + width + level; waterfall points;
- open-coast anchor points where they matter (islet: harbour mooring, cloud fishing, signal fire, lighthouse,
  keeper's cottage).
