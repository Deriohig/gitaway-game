import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { isOn } from '../game/features'
import { Herd } from './Animals'
import { Asset } from './Asset'
import { RipeCranberries, WetSheet } from './Crops'
import { PIECES } from './blueprint'
import { composes, type Category } from './composition'
import { HIGHLAND, OUTCROP_SIZE, WETLAND, grazingGround, inWater, type Outcrop } from './isleSpots'
import { ISLES, type IsleDef, type XZ } from './layout'
import { mat } from './materials'
import { useMotion } from './motion'
import { Bush, GEO, Rock } from './Nature'
import { polygonOutline } from './pieces'
import { rng } from './random'
import { Reeds } from './Reeds'
import { useRiseState } from './riseState'
import { footprintDrop, type Island } from './terrain'
import { Brook, Fall, Lake } from './Water'
import { flowDockFor, setFlowDock } from './water/driver'
import { PieceWater } from './water/PieceWater'
import { useWaterDrawnV2 } from './water/report'

// The wetland and highland (the wild isles), dressed in their own
// coordinates like the meadow, grove and islet (see Isles.tsx): drawn inside
// their piece, rising and docking with it. Everything stands on the piece's
// ground as drawn, read when it's placed (the baked height grid once loaded),
// so nothing here carries a height of its own. Spots are in isleSpots.ts.

type V3 = [number, number, number]

/** A spot in a piece's own coordinates, on its ground, lifted a little if asked. */
const localAt =
  (def: IsleDef) =>
  ([x, z]: XZ, lift = 0): V3 => [x, def.island.height(x, z) + lift, z]

/** Whether a piece has docked: its water flows in once it's in place (as the farm's waterfall stops then). */
const useDocked = (id: 'wetland' | 'highland') => useRiseState((s) => s.docked.includes(id))

// ---------------------------------------------------------------------------
// The wetland

const padGeo = new THREE.CylinderGeometry(1, 1, 1, 9)

/** Lily pads floating on the lake, where it's open water (none on a bank or a shoal), one or two in flower. */
function LilyPads({ island }: { island: Island }) {
  const { lake, pads } = WETLAND
  const afloat = pads.filter(([x, z]) => island.height(x, z) < lake.level - 0.05)
  return (
    <>
      {afloat.map(([x, z], i) => (
        <group key={i} position={[x, lake.level + 0.012, z]} rotation-y={i * 1.9}>
          <mesh geometry={padGeo} material={mat(i % 3 ? 'meadow' : 'leafLight')} scale={[0.17 + (i % 3) * 0.03, 0.012, 0.17 + (i % 3) * 0.03]} />
          {i % 4 === 1 && <mesh geometry={GEO.blobSoft} material={mat('blossom')} position={[0.04, 0.035, 0.02]} scale={[0.05, 0.035, 0.05]} />}
        </group>
      ))}
    </>
  )
}

/**
 * The cranberry bed: a low timber frame of dark, wet peat with puddles
 * shining between the plants, the berries red and ripe, on the lowest ground
 * under it.
 */
function CranberryBed({ island }: { island: Island }) {
  const { at, rot, half } = WETLAND.cranberryBed
  const [w, d] = [half[0] * 2, half[1] * 2]
  const y = island.height(...at) + footprintDrop(island, at[0], at[1], half[0], half[1], rot)
  const plants = useMemo(() => [-1, 0, 1].flatMap((i) => [-1, 1].map((j) => [i * w * 0.31, j * d * 0.24] as XZ)), [w, d])
  return (
    <group position={[at[0], y, at[1]]} rotation-y={rot}>
      <mesh geometry={GEO.box} material={mat('soilDark')} position-y={0.04} scale={[w, 0.08, d]} receiveShadow />
      {[
        [0, d / 2, w + 0.06, 0.06],
        [0, -d / 2, w + 0.06, 0.06],
        [w / 2, 0, 0.06, d],
        [-w / 2, 0, 0.06, d],
      ].map(([x, z, sx, sz], i) => (
        <mesh key={i} geometry={GEO.box} material={mat('woodDark')} position={[x, 0.07, z]} scale={[sx, 0.12, sz]} castShadow receiveShadow />
      ))}
      {/* Standing water over the peat, between the plants. */}
      <group position-y={0.087}>
        <WetSheet width={w - 0.02} depth={d - 0.02} />
      </group>
      {plants.map(([x, z], i) => (
        <group key={i} position={[x, 0.09, z]} rotation-y={i * 1.3} scale={0.8}>
          <RipeCranberries />
        </group>
      ))}
    </group>
  )
}

/**
 * The jetty at the lake's edge (the wetland_jetty model), at its coast anchor:
 * its y 0 is the waterline, so it stands at the lake's level, its far end out
 * over the water and its shore end on the bank. There's no stand-in: the lake
 * is fine without one until the model is in.
 */
function Jetty() {
  const { at, y, turn } = WETLAND.jetty
  return (
    <group position={[at[0], y, at[1]]} rotation-y={turn}>
      <Asset id="wetland_jetty" fallback={null} />
    </group>
  )
}

/**
 * The wetland: its lake, rivers and waterfall, the jetty, reeds, lily pads,
 * the cranberry bed, and a few rocks and bushes where the art's composition
 * isn't drawn (its own take their place). `risesIn` is whether it is rising
 * in now (Isles.tsx useRisesIn): its dock starts the flowing water (the farm
 * fall retreats, and its river, outflow and fall fill in turn), which is all
 * in place at once for a wetland already there, or in still motion.
 *
 * With the water switch on, its water is the art's baked water
 * (water/PieceWater.tsx): the lake rises with the piece through the clouds,
 * and the lily pads and the jetty with it; the river and fall are drawn from
 * the dock. Today's lake, brooks and fall are drawn in its place once it has
 * docked, until the baked water is in (and for good if it fails), as they are
 * with the switch off.
 */
export function Wetland({ risesIn }: { risesIn: boolean }) {
  const def = ISLES.wetland
  const island = def.island
  const at = localAt(def)
  const docked = useDocked('wetland')
  // Every render, whatever is drawn (C9): the switch off, it is never so.
  const drawnV2 = useWaterDrawnV2('wetland')
  const still = useMotion() === 'still'
  // Where its dock stands for the baked water's flow (water/driver.ts), told again as it changes and never taken
  // back in between: the flow is timed from the first dock, and motion going still and back doesn't play it again.
  // Told before the frame is drawn, as the water's bodies are registered (build.ts showPieceWater), so a wetland
  // already docked never draws one frame as though it hadn't.
  useLayoutEffect(() => setFlowDock(flowDockFor(docked, risesIn, still)), [docked, risesIn, still])
  // Gone (the farm was erased, or a save without it was loaded): the farm fall comes back.
  useLayoutEffect(() => () => setFlowDock('none'), [])
  const givesWay = (category: Category) => composes('wetland', category, island)
  const water = useMemo(() => {
    const line = (pts: typeof WETLAND.river) => ({ points: pts.map((p) => [p.at[0], p.level, p.at[1]] as V3), widths: pts.map((p) => p.width) })
    return { river: line(WETLAND.river), outflow: line(WETLAND.outflow) }
  }, [])
  // The farm's stream flows on into the wetland once it has docked, and the lake drains over the far rim.
  const legacy = docked ? (
    <>
      <Lake {...WETLAND.lake} />
      <Brook {...water.river} />
      <Brook {...water.outflow} />
      <Fall points={WETLAND.fall} width={0.7} />
    </>
  ) : null
  return (
    <>
      {isOn('water') ? <PieceWater piece="wetland" legacy={legacy} /> : legacy}
      {(docked || drawnV2) && (
        <>
          <LilyPads island={island} />
          <Jetty />
        </>
      )}
      <Reeds island={island} reeds={WETLAND.reeds} />
      <CranberryBed island={island} />
      {!givesWay('rocks') &&
        WETLAND.rocks.map((r, i) => <Rock key={i} position={at(r.at)} lift={r.s[1] * 0.4} scale={r.s} color={i % 2 ? 'stone' : 'stoneDark'} />)}
      {!givesWay('shrubs') && WETLAND.bushes.map((p, i) => <Bush key={i} position={at(p, -0.02)} scale={0.75 + (i % 2) * 0.15} seed={i + 120} />)}
    </>
  )
}

// ---------------------------------------------------------------------------
// The highland

const HEATHER_TINTS = ['#9C7BA8', '#B08AB4', '#8E6E95', '#7E8A68', '#A98AA0'].map((c) => new THREE.Color(c))
const heatherMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true })
const heatherCount = HIGHLAND.heather.length * 16

/** Heather in low cushions, in drifts over the moor's level ground, off the water, the rim and the kept spots: one draw. */
function Heather({ island }: { island: Island }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const rim = polygonOutline(PIECES.highland.outline)
    const level = (x: number, z: number) => {
      const h = island.height(x, z)
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2
        if (Math.abs(island.height(x + Math.cos(a) * 0.3, z + Math.sin(a) * 0.3) - h) > 0.12) return false
      }
      return true
    }
    const free = (x: number, z: number) =>
      rim(Math.atan2(z, x)) - Math.hypot(x, z) > 0.6 &&
      !inWater('highland', [x, z], 0.3) &&
      HIGHLAND.kept.every((k) => Math.hypot(x - k.at[0], z - k.at[1]) > k.r + 0.15) &&
      level(x, z)
    const r = rng(29)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const s = new THREE.Vector3()
    const p = new THREE.Vector3()
    let placed = 0
    for (const [cx, cz] of HIGHLAND.heather) {
      for (let i = 0; i < 16; i++) {
        const a = r() * Math.PI * 2
        const d = Math.sqrt(r()) * 1.5
        const x = cx + Math.cos(a) * d
        const z = cz + Math.sin(a) * d
        const k = 0.1 + r() * 0.09
        const tint = HEATHER_TINTS[Math.floor(r() * HEATHER_TINTS.length)]
        if (!free(x, z)) continue
        p.set(x, island.height(x, z) + k * 0.25, z)
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r() * Math.PI)
        s.set(k * 1.3, k * 0.7, k)
        m.compose(p, q, s)
        mesh.setMatrixAt(placed, m)
        mesh.setColorAt(placed, tint)
        placed++
      }
    }
    mesh.count = placed
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [island])
  return <instancedMesh ref={ref} args={[GEO.blob, heatherMat, heatherCount]} receiveShadow castShadow frustumCulled={false} />
}

/** A stand-in crag until the outcrop's model is in: weathered stones piled to the model's size. */
function OutcropStandIn({ model }: { model: Outcrop['model'] }) {
  const { half, height } = OUTCROP_SIZE[model]
  return (
    <group>
      <mesh geometry={GEO.rock} material={mat('cliffMid')} position-y={height * 0.3} scale={[half[0] * 0.95, height * 0.38, half[1] * 0.9]} rotation={[0.2, 0.6, 0.1]} castShadow receiveShadow />
      <mesh geometry={GEO.rock} material={mat('cliffTop')} position={[half[0] * 0.15, height * 0.7, -half[1] * 0.1]} scale={[half[0] * 0.6, height * 0.3, half[1] * 0.55]} rotation={[0.4, 1.2, 0]} castShadow />
    </group>
  )
}

/** An outcrop against a riser, settled to the lowest ground under it, so none of its foot hangs in the air. */
function OutcropAt({ island, outcrop }: { island: Island; outcrop: Outcrop }) {
  const { model, at, rot, scale } = outcrop
  const { half } = OUTCROP_SIZE[model]
  const y = island.height(...at) + footprintDrop(island, at[0], at[1], half[0] * scale, half[1] * scale, rot)
  return (
    <group position={[at[0], y, at[1]]} rotation-y={rot} scale={scale}>
      <Asset id={model} fallback={<OutcropStandIn model={model} />} />
    </group>
  )
}

/**
 * The highland: its tarn, outcrops on the risers, goats grazing the terrace,
 * and rocks and heather about the moor where the art's composition isn't
 * drawn (its own rocks, flowers and shrubs take their place). With the water
 * switch on, its tarn is the art's baked water (water/PieceWater.tsx), rising
 * with the piece, and so is its hot spring once the farm owns the Hot spring
 * (today's water has none); today's tarn is drawn in their place once it has
 * docked, until the baked water is in (and for good if it fails), as it is
 * with the switch off.
 */
export function Highland({ goats }: { goats: number }) {
  const def = ISLES.highland
  const island = def.island
  const at = localAt(def)
  const docked = useDocked('highland')
  const grazing = useMemo(() => grazingGround(island.height, HIGHLAND.goats), [island])
  const givesWay = (category: Category) => composes('highland', category, island)
  const legacy = docked ? <Lake {...HIGHLAND.tarn} /> : null
  return (
    <>
      {isOn('water') ? <PieceWater piece="highland" legacy={legacy} /> : legacy}
      {HIGHLAND.outcrops.map((o, i) => (
        <OutcropAt key={i} island={island} outcrop={o} />
      ))}
      {!givesWay('rocks') &&
        HIGHLAND.rocks.map((r, i) => <Rock key={i} position={at(r.at)} lift={r.s[1] * 0.4} scale={r.s} color={i % 2 ? 'stoneDark' : 'stone'} />)}
      {!givesWay('flowers') && <Heather island={island} />}
      <Herd count={goats} island={island} pasture={HIGHLAND.goats} clear={grazing} />
    </>
  )
}
