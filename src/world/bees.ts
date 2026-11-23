import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PALETTE } from './palette'

// The bees that fly about a beehive.

/** A geometry painted one colour, as vertex colours (for the shared vertex-coloured material). */
function painted(geometry: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone()
  const c = new THREE.Color(color)
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: g.getAttribute('position').count }, () => [c.r, c.g, c.b]).flat(), 3))
  return g
}

const ball = () => new THREE.IcosahedronGeometry(1, 1)
/** A band round the body, which runs along Z. */
const band = (rx: number, ry: number, z: number) =>
  new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).scale(rx, 0.006, ry).rotateX(Math.PI / 2).translate(0, 0, z)
const wing = (side: number) =>
  new THREE.IcosahedronGeometry(1, 0)
    .scale(0.022, 0.003, 0.013)
    .rotateY(side * 0.35)
    .rotateZ(side * 0.25)
    .translate(side * 0.02, 0.022, 0.002)

/**
 * One bee, facing +Z, drawn with vertexMat: a golden body with two dark
 * bands, a dark head and pale wings, all one mesh. It is drawn about three
 * times life size, as the stand-in animals are drawn larger than life, so it
 * reads from the farm view.
 */
export const beeGeometry: THREE.BufferGeometry = mergeGeometries([
  painted(ball().scale(0.022, 0.02, 0.032).translate(0, 0, -0.008), PALETTE.gold),
  painted(band(0.0225, 0.0205, -0.014), PALETTE.ink),
  painted(band(0.0195, 0.0178, -0.026), PALETTE.ink),
  painted(ball().scale(0.013, 0.013, 0.013).translate(0, 0.002, 0.03), PALETTE.ink),
  painted(wing(1), PALETTE.cream),
  painted(wing(-1), PALETTE.cream),
])!

/** Where bee `i` of a hive is round it, unturned: on a wavering loop well clear of the hive's sides. */
function loop(i: number, seed: number, time: number): THREE.Vector3 {
  const t = time * (0.9 + i * 0.25) + seed + i * 2
  const swell = 1 + 0.12 * Math.sin(t * 3.7 + i)
  return new THREE.Vector3(Math.cos(t) * (0.45 + i * 0.1) * swell, 0.6 + Math.sin(t * 2.3) * 0.12, Math.sin(t) * (0.4 + i * 0.04) * swell)
}

/** Where bee `i` of a hive is, `time` seconds in, in the hive's own frame, and its turn (rotation.y) to face the way it flies. */
export function beeAt(i: number, seed: number, time: number): { x: number; y: number; z: number; heading: number } {
  const p = loop(i, seed, time)
  const ahead = loop(i, seed, time + 0.01).sub(p)
  return { x: p.x, y: p.y, z: p.z, heading: Math.atan2(ahead.x, ahead.z) }
}
