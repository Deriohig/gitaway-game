// The animal rigs (art/blender/rigs/GAME-NOTE.md): skinned, animated copies of
// the animal models, listed in public/models/rigs.json beside the manifest.
// Each entry names its file, the model it was built from, its bones, the
// clips it plays and the clamp for a live look.

export type ClipType = 'loop' | 'hold' | 'once'

export interface RigClip {
  /** loop: first frame = last; hold: eases in, then the last frame is held; once: starts and ends at the default pose. */
  type: ClipType
  duration: number
  /** Units travelled per cycle, walks only. */
  stride?: number
}

export interface RigEntry {
  /** Its key in rigs.json: the animal's id, `hare` for the visitor_hare model. */
  key: string
  file: string
  /** The model it was built from (same geometry; the sheep's is not the one the game drew before). */
  source: string
  facing: '+Z' | '+X'
  bones: string[]
  /** The bones the game may drive on top of the clips. */
  live: string[]
  /** Eyelid joints: scale 0 = open, uniform 1 = closed. */
  lids: string[]
  /** The live look's clamp, in degrees, measured on the rig (ruling R31), and the bones it turns. */
  look: { yaw: number; pitch: number; bones: string[] }
  clips: Record<string, RigClip>
}

export type Rigs = Record<string, RigEntry>

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [])

/** The entries of a rigs.json, each with its key; none for anything malformed. */
export function parseRigs(json: unknown): Rigs {
  const animals = (json as { animals?: unknown } | null)?.animals
  if (!animals || typeof animals !== 'object') return {}
  const rigs: Rigs = {}
  for (const [key, raw] of Object.entries(animals as Record<string, Record<string, unknown>>)) {
    if (!raw || typeof raw.file !== 'string' || typeof raw.source !== 'string' || !raw.clips || typeof raw.clips !== 'object') continue
    const look = (raw.look ?? {}) as { yaw?: unknown; pitch?: unknown; bones?: unknown }
    rigs[key] = {
      key,
      file: raw.file,
      source: raw.source,
      facing: raw.facing === '+X' ? '+X' : '+Z',
      bones: strings(raw.bones),
      live: strings(raw.live),
      lids: strings(raw.lids),
      look: { yaw: Number(look.yaw) || 0, pitch: Number(look.pitch) || 0, bones: strings(look.bones) },
      clips: raw.clips as Record<string, RigClip>,
    }
  }
  return rigs
}

let rigs: Promise<Rigs> | null = null

/** rigs.json, fetched once; no rigs if it can't be had, so every animal draws its plain model. */
export function loadRigs(): Promise<Rigs> {
  rigs ??= fetch(`${import.meta.env.BASE_URL}models/rigs.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then(parseRigs)
    .catch(() => ({}))
  return rigs
}

/**
 * The rig for the model the game asks for by `id`, whose manifest file is
 * `file`: the entry of that key, or else the one built from that file (the
 * hare's key is `hare`, its model `visitor_hare`). Null when there is none.
 */
export function rigEntryFor(all: Rigs, id: string, file: string | undefined): RigEntry | null {
  return all[id] ?? Object.values(all).find((e) => e.source === file) ?? null
}
