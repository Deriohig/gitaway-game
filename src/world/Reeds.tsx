import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Reed } from './isleSpots'
import { rng } from './random'
import type { Island } from './terrain'
import { windMaterial } from './wind'

// The game's reeds: three blades from one root, a bulrush head on some,
// leaning in the wind. The wetland stands them in its shallows and round its
// lake (WildIsles.tsx); the farm's Teardrop, the art's (water/pondDressing.ts
// teardropReeds, drawn by Water.tsx). Each set is two draws, the blades and the
// heads.

/** A reed: three blades from one root, a unit tall (each is scaled to its height), the tallest in the middle. */
function reedGeometry(): THREE.BufferGeometry {
  const blades = [
    { r: 0.024, h: 1, tilt: 0, turn: 0 },
    { r: 0.018, h: 0.72, tilt: 0.22, turn: 0.4 },
    { r: 0.016, h: 0.6, tilt: -0.26, turn: 2.2 },
  ].map(({ r, h, tilt, turn }) => {
    const g = new THREE.ConeGeometry(r, h, 4)
    g.translate(0, h / 2, 0)
    g.rotateZ(tilt)
    g.rotateY(turn)
    return g
  })
  return mergeGeometries(blades)!
}

/** A bulrush's brown head, near the top of the middle blade. */
function headGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 6)
  g.translate(0, 0.84, 0)
  return g
}

const reedGeo = reedGeometry()
const headGeo = headGeometry()
// The same lean in the wind, so a head stays on its reed.
const reedMat = windMaterial('#ffffff', 1.1)
const headMat = windMaterial('#7A5A3E', 1.1)
/** The greens a reed's blades are tinted, one picked for each reed. */
export const REED_TINTS = ['#7D9B70', '#93A97E', '#6F8C66', '#A3B07A'].map((c) => new THREE.Color(c))

/** Where Reeds stands each reed (its blades) and each bulrush head, and each reed's tint. */
export interface ReedPlacement {
  /** Each reed's blades: at its spot, a little into the ground, turned by where it stands, and scaled up to its height. */
  blades: THREE.Matrix4[]
  /** Each reed's tint, one of REED_TINTS. */
  tints: THREE.Color[]
  /** The heads, on the reeds that carry one, in their order: placed as the reed is, so the head sits on it. */
  heads: THREE.Matrix4[]
}

/**
 * How Reeds places `reeds` on ground whose height at x, z is `height`: a plain function, so it runs in tests. The
 * tints are drawn in turn from one seed, so a set of reeds is tinted the same every time.
 */
export function reedPlacement(height: (x: number, z: number) => number, reeds: readonly Reed[]): ReedPlacement {
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const r = rng(17)
  const place = (reed: Reed) => {
    const [x, z] = reed.at
    p.set(x, height(x, z) - 0.03, z)
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ((x * 7.3 + z * 3.1) % 1) * Math.PI * 2)
    s.set(1, reed.height, 1)
    return new THREE.Matrix4().compose(p, q, s)
  }
  const blades = reeds.map(place)
  const tints = reeds.map(() => REED_TINTS[Math.floor(r() * REED_TINTS.length)])
  const heads = reeds.filter((reed) => reed.head).map(place)
  return { blades, tints, heads }
}

/**
 * Reeds standing in the shallows and round the shore, leaning in the wind, on `island`'s ground as it is when they
 * are placed: one draw for the blades, one for the heads. `name`, if given, names the blades' mesh, and the heads'
 * `<name>_heads` (tests find them by it).
 */
export function Reeds({ island, reeds, name = '' }: { island: Island; reeds: readonly Reed[]; name?: string }) {
  const blades = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const withHeads = useMemo(() => reeds.filter((r) => r.head), [reeds])
  useLayoutEffect(() => {
    const placed = reedPlacement((x, z) => island.height(x, z), reeds)
    const fill = (mesh: THREE.InstancedMesh | null, matrices: THREE.Matrix4[], tints: THREE.Color[] | null) => {
      if (!mesh) return
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
      tints?.forEach((c, i) => mesh.setColorAt(i, c))
      mesh.count = matrices.length
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    fill(blades.current, placed.blades, placed.tints)
    fill(heads.current, placed.heads, null)
  }, [island, reeds])
  return (
    <>
      <instancedMesh ref={blades} name={name} args={[reedGeo, reedMat, reeds.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={heads} name={name && `${name}_heads`} args={[headGeo, headMat, Math.max(1, withHeads.length)]} frustumCulled={false} />
    </>
  )
}
