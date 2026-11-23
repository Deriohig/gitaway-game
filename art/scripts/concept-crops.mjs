// concept-crops.mjs  --  cut the per-preset CONCEPT CROPS out of the 3 blueprint sheets.
// =============================================================================
// Usage:  node concept-crops.mjs [sourceDir]
//   sourceDir defaults to $CONCEPT_SRC or art/reference/uploads. Writes
//   art/reference/concept/<preset>.png + art/reference/concept/crops.json.
//
// Each crop is the picture area of the blueprint panel that matches a camera
// preset (panel header bar + thumbnail strip excluded). The rects were picked by
// eye on the 1536x1024 sheets; crops.json records them so the targets are
// reproducible. NO dependencies (lib/png.mjs = zlib only).
// =============================================================================
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readPNG, writePNG, crop } from './lib/png.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../reference/concept');
const SRC = process.argv[2] || process.env.CONCEPT_SRC ||
  path.resolve(__dirname, '../reference/uploads');

// The three blueprint sheets (1536x1024 RGB).
const SHEETS = {
  spec:        '2a390fa4-image.png', // "World Layout Specification" (regions, farm plan, camera views)
  layout:      '303fcd96-image.png', // "World Layout" (A..H region panels)
  perspective: 'f17d005d-image.png', // "World Layout (Perspective View)" (close-ups)
};

// preset -> { sheet, rect:[x,y,w,h], panel }  (picture area only)
export const CROPS = {
  default_mobile: { sheet: 'spec',        rect: [416, 527, 355, 180], panel: '5. Farm Layout (3D Close-up Reference)' },
  default_desktop:{ sheet: 'spec',        rect: [721, 823, 136, 152], panel: '9. Camera Reference Views - Default View (Main)' },
  farm_to_meadow: { sheet: 'perspective', rect: [336, 550, 294, 200], panel: '2. Farm Clearing -> Meadow (Transition)' },
  rocky_ledge:    { sheet: 'perspective', rect: [639, 550, 285, 200], panel: '3. Rocky Ledge Example' },
  plateau:        { sheet: 'layout',      rect: [392, 820, 372, 108], panel: 'F. Upper Plateau (Procedural)' },
  world_edge:     { sheet: 'layout',      rect: [1157, 820, 371, 108], panel: 'H. World Edge (Procedural)' },
  wide_island:    { sheet: 'perspective', rect: [0, 88, 798, 398],   panel: 'World Layout (Perspective View) - main island view' },
  // photo-mode whole-island orbits share the spec sheet's large perspective island view
  orbit_ne:       { sheet: 'spec',        rect: [0, 100, 780, 392],  panel: 'World Layout Specification - main island view' },
  orbit_sw:       { sheet: 'spec',        rect: [0, 100, 780, 392],  panel: 'World Layout Specification - main island view' },
  orbit_back:     { sheet: 'spec',        rect: [0, 100, 780, 392],  panel: 'World Layout Specification - main island view' },
  // ---- spec v3.1 (blueprint island from docking pieces) comparison set ----
  max_zoom_all:      { sheet: 'spec',        rect: [0, 100, 780, 392],  panel: 'World Layout Specification - the whole island' },
  max_zoom_portrait: { sheet: 'spec',        rect: [190, 100, 420, 392], panel: 'World Layout Specification - island (portrait cut)' },
  island_wide:       { sheet: 'perspective', rect: [0, 88, 798, 398],   panel: 'World Layout (Perspective View) - joined island' },
  highland:          { sheet: 'layout',      rect: [392, 820, 372, 108], panel: 'F. Upper Plateau (Procedural)' },
  islet:             { sheet: 'perspective', rect: [639, 550, 285, 200], panel: '3. Rocky Ledge Example (rocky coast)' },
  grove:             { sheet: 'perspective', rect: [1232, 550, 302, 200], panel: '5. Woodland Grove Example' },
  meadow:            { sheet: 'layout',      rect: [775, 586, 370, 132], panel: 'C. Meadow (Procedural)' },
  wetland_edge:      { sheet: 'perspective', rect: [932, 550, 290, 200], panel: '4. Lake Area Example' },
  rim_edge:          { sheet: 'layout',      rect: [1157, 820, 371, 108], panel: 'H. World Edge (Procedural)' },
};

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cache = {};
  const record = {};
  for (const [preset, c] of Object.entries(CROPS)) {
    const file = path.join(SRC, SHEETS[c.sheet]);
    if (!cache[file]) cache[file] = readPNG(file);
    const img = crop(cache[file], ...c.rect);
    writePNG(path.join(OUT, preset + '.png'), img);
    record[preset] = { sheet: SHEETS[c.sheet], rect: c.rect, panel: c.panel, size: [img.width, img.height] };
    console.log('  ' + preset.padEnd(16) + c.rect.join(',').padEnd(20) + c.panel);
  }
  fs.writeFileSync(path.join(OUT, 'crops.json'), JSON.stringify(record, null, 2) + '\n');
  console.log('  -> ' + OUT);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
