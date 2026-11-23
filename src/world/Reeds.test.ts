import * as THREE from 'three'
import { expect, it } from 'vitest'
import { COMPOSITION_REEDS } from './composition.data'
import { WETLAND, type Reed } from './isleSpots'
import { ISLES, MAIN } from './layout'
import { rng } from './random'
import { REED_TINTS, reedPlacement } from './Reeds'
import { teardropReeds } from './water/pondDressing'

// The game's reeds: three blades from one root and, on some, a bulrush head, leaning in the wind. The wetland stands
// them in its shallows; the farm's Teardrop stands the art's with the same drawing.

/** How WildIsles.tsx placed and tinted its reeds before they were shared, copied as it was: what they must stay. */
function before(height: (x: number, z: number) => number, reeds: readonly Reed[]) {
  const tints = ['#7D9B70', '#93A97E', '#6F8C66', '#A3B07A'].map((c) => new THREE.Color(c))
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  const r = rng(17)
  const place = (list: readonly Reed[], tint: boolean) =>
    list.map((reed) => {
      const [x, z] = reed.at
      p.set(x, height(x, z) - 0.03, z)
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ((x * 7.3 + z * 3.1) % 1) * Math.PI * 2)
      s.set(1, reed.height, 1)
      m.compose(p, q, s)
      return { matrix: m.toArray(), tint: tint ? tints[Math.floor(r() * tints.length)].getHex() : null }
    })
  return { blades: place(reeds, true), heads: place(reeds.filter((reed) => reed.head), false) }
}

/** What reedPlacement gives, in the same terms. */
function now(height: (x: number, z: number) => number, reeds: readonly Reed[]) {
  const { blades, tints, heads } = reedPlacement(height, reeds)
  return {
    blades: blades.map((m, i) => ({ matrix: m.toArray(), tint: tints[i].getHex() })),
    heads: heads.map((m) => ({ matrix: m.toArray(), tint: null })),
  }
}

it('draws the wetland’s reeds exactly as before they were shared: the same spots, turns, heights, heads and tints', () => {
  const island = ISLES.wetland.island
  const height = (x: number, z: number) => island.height(x, z)
  expect(WETLAND.reeds.length).toBeGreaterThan(40)
  expect(now(height, WETLAND.reeds)).toEqual(before(height, WETLAND.reeds))
  expect(REED_TINTS.map((c) => `#${c.getHexString().toUpperCase()}`)).toEqual(['#7D9B70', '#93A97E', '#6F8C66', '#A3B07A'])
})

it('draws the Teardrop’s 7 art reeds on the farm’s ground at their spots, as tall as the art has them, with 4 heads and the wetland’s tints', () => {
  const reeds = teardropReeds(COMPOSITION_REEDS)
  const height = (x: number, z: number) => MAIN.height(x, z)
  const { blades, tints, heads } = reedPlacement(height, reeds)
  expect(blades).toHaveLength(7)
  expect(tints).toHaveLength(7)
  const stands = (m: THREE.Matrix4) => {
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    m.decompose(p, new THREE.Quaternion(), s)
    return { at: [p.x, p.y, p.z], height: s.y }
  }
  const art = COMPOSITION_REEDS.main!
  const headed = art.filter((reed) => reed.head)
  expect(heads).toHaveLength(4)
  const expected = ({ x, z, height: tall }: (typeof art)[number]) => ({ at: [x, height(x, z) - 0.03, z].map((v) => expect.closeTo(v, 6)), height: expect.closeTo(tall, 6) })
  blades.forEach((m, i) => expect(stands(m), `reed ${i}`).toEqual(expected(art[i])))
  heads.forEach((m, i) => expect(stands(m), `head ${i}`).toEqual(expected(headed[i])))
  for (const tint of tints) expect(REED_TINTS).toContain(tint)
})
