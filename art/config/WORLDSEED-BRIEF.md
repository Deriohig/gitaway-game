# Gitaway — Worldseed-Inspired Art Direction & Living World (user brief, 2026-10-18, verbatim)

> **Pointer (2026-10-24).** [../ART-BIBLE.md](../ART-BIBLE.md) is now the single source of truth for the look; it carries this brief forward together with the 2026-10-22 painterly decision. This verbatim brief stays as the record.

## Objective

Transform the existing Gitaway countryside into a beautiful, magical miniature world inspired by Worldseed.

Primary reference: https://thechosenvictor.com/showcase/worldseed

Study the reference carefully before making changes. Explore the live experience, inspect its publicly available source code if available, and identify the visual techniques responsible for its aesthetic.

Gitaway should evoke the feeling of a handcrafted fantasy diorama: a little world suspended in the sky, filled with lush vegetation, beautiful lighting, charming buildings, organic terrain, and small details that make it feel alive.

The world should gradually develop as the player works. It should feel like a place that is growing and becoming more beautiful over time, rather than a static farming map.

The goal is to match the feeling and visual quality of Worldseed, not to copy its assets or rebuild Gitaway from scratch.

## 1. Audit the existing project first

Before changing code:

- Inspect the current repository, rendering architecture, scene construction, materials, shaders, lighting, animation systems, and asset-generation pipeline.
- Identify the installed Three.js version and whether the application uses native Three.js or React Three Fiber.
- Inspect the current procedural GLB assets and how they are assembled into the world.
- Run the existing scene and capture screenshots before making changes.
- Identify the main causes of the current flat appearance.

Do not assume the solution is simply increasing saturation, adding bloom, or adding more geometry.

Determine whether the main problems come from colour management, lighting, material response, shadows, terrain colour variation, vegetation shapes, atmosphere, composition, or some combination of these.

## 2. Preserve the approved world

The current island is the baseline. Preserve:

- The existing floating-island footprint and overall silhouette.
- The farmhouse position and scale.
- The growing plots, fences, garden, and farm layout.
- The existing woodland, meadow, orchard, and other regional compositions.
- The main paths and their destinations.
- The existing lake, river, waterfall, cliffs, and terrain.
- The overall camera composition and playable scale.

Do not randomly regenerate the world, change the seed, redesign the island, or move major landmarks.

You may improve the geometry, materials, lighting, transitions, and details of existing elements, provided their intended locations and functions remain intact.

Keep the existing seed and make comparisons using identical camera positions.

## 3. Establish a Worldseed-inspired visual direction

Move away from a generic low-poly landscape and towards a cohesive, handcrafted fantasy miniature.

### Terrain and landscape

- Introduce more organic variation in terrain colour, shape, and shading.
- Create richer meadows with multiple complementary greens rather than a predominantly uniform yellow-green.
- Use darker, cooler greens in shaded woodland and brighter, warmer greens in sunlit clearings.
- Give terrain subtle tonal variation that follows the landscape and lighting.
- Improve the transition between grass, soil, paths, rock, and water.
- Make cliffs feel like intentional geological formations with varied rock faces, layers, and silhouettes.
- Keep the island readable as a miniature world from the wide camera view.

Avoid noisy textures, excessive surface detail, random colour speckling, and indiscriminate polygon subdivision.

### Vegetation

Improve the visual character of trees, bushes, flowers, and ground cover.

- Make tree silhouettes more varied, organic, and visually distinctive.
- Give broadleaf trees more nuanced canopy shapes and colour variation.
- Avoid forests made from repetitive, obviously duplicated tree silhouettes.
- Use a coherent palette across pine trees, deciduous trees, shrubs, grass, and flowers.
- Make flower patches feel intentionally composed, with clusters and colour relationships instead of uniform random scattering.
- Improve the transition between open meadow, woodland edge, and dense forest.
- Use layered vegetation and overlapping silhouettes to create depth.

Prefer improving and reusing the existing scripted asset pipeline. Do not introduce AI-generated models or require manually modelling the entire world.

### Farmhouse and focal points

Keep the farmhouse and farm layout where they are, but improve their visual integration with the landscape.

Pay attention to:

- Warm, readable roof and wall materials.
- Natural contact shadows beneath buildings, fences, rocks, and plants.
- Small garden details and flowerbeds.
- A clear visual hierarchy between the farmhouse, growing plots, paths, and distant scenery.
- Warm windows and subtle signs of life where appropriate.

The farm should feel like the welcoming heart of the island.

## 4. Fix the lighting and colour first

This is a priority.

The current scene looks relatively flat despite having plenty of geometry. Diagnose and improve the lighting system before compensating with more objects or stronger colours.

Aim for a warm, late-afternoon fantasy atmosphere:

- A clear directional sunlight source.
- Soft but readable cast shadows.
- Stronger separation between illuminated and shaded surfaces.
- Natural ambient fill without washing out the terrain.
- Gentle atmospheric depth between foreground, middle distance, and background.
- A cohesive sky and horizon colour.
- Warm highlights balanced by cooler shadows.
- Rich, nuanced colours without excessive saturation.

Review Three.js colour management, output colour space, tone mapping, exposure, material roughness, shadow settings, and environment lighting.

Avoid blowing out pale surfaces, crushing forest shadows into black, or making the entire scene orange.

Use post-processing only where it adds meaningful value. If bloom is introduced, use it sparingly and preferably selectively for genuinely bright elements.

## 5. Make the water feel magical

Improve the existing lake, river, and waterfall without relocating them.

The water should complement the stylised landscape rather than look like a flat blue disc or a realistic simulation dropped into a miniature world.

Consider:

- Layered shallow and deep water colours.
- Beautiful turquoise, blue-green, and teal tones.
- Subtle animated surface normals and gentle ripples.
- Soft reflections and controlled highlights.
- Shoreline colour transitions and occasional foam.
- Small, subtle caustic patterns where appropriate.
- A continuous river surface that follows its existing route.
- A waterfall with a convincing source, falling water, and splash or foam at its destination.

Water should be visually appealing from both the close farm camera and the full-island overview.

Reference: https://github.com/boona13/threejs-grass-water-shaders

Inspect the implementation and licensing, and verify compatibility with the project's actual renderer and Three.js version before adapting anything.

## 6. Improve paths and connectivity

The existing path network should feel like natural countryside footpaths, not a collection of broad, angular strips.

Preserve the current destinations and overall layout while improving the geometry.

- Use smooth curves where appropriate.
- Build continuous-width ground surfaces along sampled path curves.
- Follow the terrain without floating above it or intersecting it.
- Create clean geometry at junctions, intersections, and endpoints.
- Remove visible gaps, abrupt width changes, sharp corners, and accidental overlaps.
- Blend path edges naturally into the surrounding grass.
- Keep important routes readable from the overview camera.
- Use local widening only where a genuine junction or clearing requires it.

Treat path connectivity and path appearance as separate concerns. Validate the underlying network rather than merely smoothing its rendered points.

Reference: https://threejs.org/docs/pages/CatmullRomCurve3.html

Do not use TubeGeometry as a shortcut for a flat ground path.

## 7. Make the world feel alive

The scene should have subtle, continuous movement that reinforces the feeling of a living miniature world.

Prioritise:

1. Gentle wind moving grass and small plants.
2. Subtle movement in tree canopies while keeping trunks stable.
3. Slow water ripples and flowing water.
4. A drifting cloud layer.
5. Occasional butterflies, floating pollen, or tiny magical particles.
6. Small environmental details such as flowers swaying or warm cottage windows.

Movement should be restrained, smooth, and calming. Avoid constant particle explosions, excessive screen effects, fast movement, or distracting animations.

Implement animations efficiently using shared time values, shader uniforms, instancing, or other suitable techniques. Avoid creating a separate timer or expensive update loop for every object.

The world should still look beautiful when all animations are paused.

## 8. Make gradual world-building a first-class design principle

Gitaway is a game about gradually building a beautiful countryside through work sessions.

The world should be designed to support visible progression, even if the current implementation does not yet have a complete progression system.

Think in terms of carefully designed, reusable environmental growth stages:

- A bare patch becomes a grassy clearing.
- Wildflowers gradually appear.
- A sapling grows into a tree.
- A meadow develops into a small orchard.
- A garden gains plants and decorative details.
- A path gradually becomes established.
- A new destination develops into a charming little place.

These should be designed as intentional visual transformations, not arbitrary object spawning.

First, establish the art direction and improve the existing scene. Then identify how the existing game-state and progression systems could drive these transformations.

Do not invent or replace game mechanics without understanding the current implementation. Do not implement a large new progression system as a distraction from the visual improvements.

## 9. Work from visual references, not vague descriptions

Use Worldseed as the primary reference for:

- Overall miniature-world aesthetic.
- Organic shapes and handcrafted composition.
- Colour relationships.
- Vegetation character.
- Environmental atmosphere.
- The sense of a small world that can grow and evolve.

Use additional references only for specific techniques, not to introduce conflicting art styles.

Useful technical references:

- Three.js examples: https://threejs.org/examples/
- Three.js colour management: https://threejs.org/manual/pages/color-management.html
- Three.js shadow guidance: https://threejs.org/manual/pages/shadows.html
- Animated grass and water: https://github.com/boona13/threejs-grass-water-shaders

If a reference cannot be inspected or its source code is unavailable, state that clearly. Do not claim to have analysed source code that you have not accessed.

## 10. Test at fixed camera positions

Capture consistent before-and-after screenshots at the same seed and camera positions.

Review at least:

1. Full floating-island overview.
2. Close farm view.
3. Lake, river, and waterfall.
4. Woodland and meadow transition.
5. Path junctions.
6. Cliff edge and island underside.

Check both desktop and mobile layouts.

Evaluate the actual rendered result, not just whether the code compiles.

If a change makes the world less attractive, introduces visual artefacts, or harms the composition, revert or correct it rather than building additional changes on top of a regression.

## 11. Performance and implementation constraints

- Reuse the existing renderer and architecture.
- Avoid introducing large dependencies without a clear benefit.
- Prefer reusable materials, instancing, and efficient shaders.
- Preserve deterministic world generation.
- Avoid unnecessary per-frame allocations.
- Keep mobile performance in mind.
- Do not sacrifice readability or stability for visual effects.
- Keep the debug tools functional, but make sure the normal presentation can be viewed without debug overlays obscuring the world.

## 12. Deliverables

Implement the improvements in the existing project rather than merely describing them.

Work in this order:

1. Audit the current renderer and capture a baseline.
2. Identify the largest causes of the flat appearance.
3. Improve lighting, colour management, and material response.
4. Refine terrain and vegetation materials and silhouettes.
5. Improve water rendering.
6. Fix path geometry and connectivity.
7. Add restrained environmental animation.
8. Refine atmosphere and final visual details.
9. Test the fixed camera views and check performance.

After implementation, report:

- The main visual problems identified.
- Which files and systems changed.
- The rendering and art-direction techniques adopted.
- Which reference implementations were actually inspected.
- Before-and-after screenshots from matching camera positions.
- Any remaining visual issues or performance trade-offs.
- How the improvements prepare the world for gradual environmental progression.

Final acceptance criterion: Gitaway should feel like a cohesive, vibrant, handcrafted fantasy miniature that could sit alongside Worldseed as a related experience, while retaining its own countryside identity, existing world layout, and developer-focused gameplay.

Do not stop after changing a few colours. Inspect, implement, render, compare, and iterate until the result visibly improves.

---

## Lead's notes: how this merges with LOOK-BRIEF.md (user decision, 2026-10-18)
- This brief supersedes and absorbs LOOK-BRIEF.md. Already done under LOOK-BRIEF: Phase 0 audit + baseline (7 fixed views, AUDIT.md, lookPresets.json + panel), Phase 1 lighting (Neutral, low warm sun, hemisphere fill, fitted shadows, sky dome, 3 moods), Phase 2 materials (in progress). Values may be retuned toward the Worldseed reference.
- Pace (user): merged plan with TWO checkpoints. Before/after sheets at every stage, but stop for the user only (1) after look + vegetation (lighting, terrain, vegetation silhouettes, cliffs, farmhouse integration) and (2) after water + paths. Then animation, atmosphere/post, the progression write-up and final perf without a stop.
- The asset lane widens (user): new tree silhouettes/variants, bushes, flower clusters, cliff geology, farmhouse details, all in the scripted pipeline (no AI models); the draw-call fix (vertex colours + one opaque material, `Tint` kept on placeables) folds in.
- Paths: rebuilt geometry (CatmullRom-sampled ribbon surfaces, clean junctions), same network destinations; the stable export stays frozen unless the user approves.
- Comparison set: the 7 views (full, farm, lake, waterfall, junction, woodland, edge) + default_mobile + default_desktop.
- Progression: design reusable growth stages as assets/parameters; how the game drives them is a write-up for the game session (no new mechanics).
