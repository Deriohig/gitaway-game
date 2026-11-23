import type * as THREE from 'three'

// How a waiting visitor (B1) stands at rest, which is all Still mode draws (G8).

/** A moving part's pose as modelled. */
export interface Rest {
  rx: number
  ry: number
  sx: number
}

export type Rests = Map<THREE.Object3D, Rest>

/** A part's pose as modelled, noted the first time it's asked for (before it ever moves). */
export function restOf(rests: Rests, o: THREE.Object3D): Rest {
  let r = rests.get(o)
  if (!r) {
    r = { rx: o.rotation.x, ry: o.rotation.y, sx: o.scale.x }
    rests.set(o, r)
  }
  return r
}

/** Still: the body back in its place at its own size (no hop, no breath), every part as modelled. Nothing moves. */
export function holdStill(body: THREE.Object3D | null, parts: readonly (THREE.Object3D | null)[], rests: Rests): void {
  if (body) {
    body.position.set(0, 0, 0)
    body.scale.y = 1
  }
  for (const o of parts) {
    if (!o) continue
    const r = restOf(rests, o)
    o.rotation.x = r.rx
    o.rotation.y = r.ry
    o.scale.x = r.sx
  }
}
