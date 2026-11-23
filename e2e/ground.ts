import fs from 'node:fs'
import type { DockId } from '../src/world/blueprint'
import { ISLES, MAIN } from '../src/world/layout'
import { groundFrom, parseHeightGrid, sampleGrid, type HeightGridInfo } from '../src/world/pieces'

// The farm's ground as the game draws it: the baked piece's heights when public/models has it, the procedural island's otherwise.

const models = new URL('../public/models/', import.meta.url)

interface Entry {
  status?: string
  height?: HeightGridInfo
}

const manifest = () => JSON.parse(fs.readFileSync(new URL('manifest.json', models), 'utf8')) as { assets?: Record<string, Entry> }

/** A piece's ground height at a point, in its own coordinates, as the game draws it once the piece has loaded. */
export function pieceHeight(id: DockId | 'main'): (x: number, z: number) => number {
  const info = manifest().assets?.[`piece_${id}`]
  const fallback = id === 'main' ? MAIN.height : ISLES[id].island.height
  if (info?.status !== 'ready' || !info.height) return fallback
  const bytes = fs.readFileSync(new URL(info.height.file, models))
  const grid = parseHeightGrid(info.height, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  return groundFrom((x, z) => sampleGrid(grid, x, z))
}

/** The farm's ground height at a point. */
export const mainHeight = pieceHeight('main')

/** Which pieces public/models has baked, by id. */
export function bakedPieces(): string[] {
  return Object.entries(manifest().assets ?? {})
    .filter(([key, entry]) => key.startsWith('piece_') && entry.status === 'ready' && entry.height)
    .map(([key]) => key.slice('piece_'.length))
}
