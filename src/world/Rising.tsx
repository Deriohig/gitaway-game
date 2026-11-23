import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ISLES, MAIN, type IsleId } from './layout'
import { useMotion } from './motion'
import { rng } from './random'
import { CLOUD_SEA, RISE_PLANS, arrivalRing, breachCloud, bridgeLaid, riseDepth, riseDone, riseOffset, riseOpacity, type CloudPuffs, type RisePlan } from './riseCurve'
import { useRiseState } from './riseState'

// A newly claimed piece of the island rising out of the cloud sea and docking
// against the farm (the motion itself is in riseCurve.ts). One that was
// already there, or any in still mode, is simply in place. Docked pieces meet
// the farm's rim exactly, so there's no bridge to lay.

const puffGeo = new THREE.IcosahedronGeometry(1, 2)

/** How far below its place something without an isle id starts its rise. */
const PLAIN_DEPTH = 9

/** The cloud sea's own look (see Backdrop), able to fade. */
const puffMaterial = () =>
  new THREE.MeshLambertMaterial({ color: '#FBF5EA', emissive: new THREE.Color('#6A6478'), emissiveIntensity: 0.22, transparent: true, opacity: 0, depthWrite: false })

/** One puff of cloud: where it sits around the isle's middle, and how far out it drifts. */
interface Puff {
  cx: number
  cz: number
  dx: number
  dz: number
  y: number
  size: number
  rot: number
  /** How far it sinks as it spreads. */
  sink: number
}

/** How far from the farm's rim the clouds keep: none billow over or under the farm. */
const FARM_CLEAR = 1.2

/**
 * Puffs around a piece's open coast, `count` of them: each sits by the rim
 * (a share `inset` of the way in from it) and drifts out to sea by `drift` as
 * the cloud spreads. None where the piece meets the farm.
 */
function coastPuffs(id: IsleId, seed: number, count: number, look: (r: () => number) => { inset: number; drift: number; y: number; size: number; sink: number }): Puff[] {
  const { pos, island } = ISLES[id]
  const r = rng(island.spec.seed * seed + 3)
  const list: Puff[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.3
    const { inset, drift, y, size, sink } = look(r)
    const rim = island.outline(a)
    const [cx, cz] = [pos[0] + Math.cos(a) * rim * (1 - inset), pos[2] + Math.sin(a) * rim * (1 - inset)]
    if (Math.hypot(cx, cz) < MAIN.outline(Math.atan2(cz, cx)) + FARM_CLEAR + size * 0.5) continue
    list.push({ cx, cz, dx: Math.cos(a) * drift, dz: Math.sin(a) * drift, y, size, rot: r() * Math.PI, sink })
  }
  return list
}

/** The bank of cloud at the cloud sea that the piece breaks up through, round its coast. */
function bankPuffs(id: IsleId): Puff[] {
  const scale = Math.min(3.4, ISLES[id].island.spec.radius * 0.32)
  return coastPuffs(id, 7, 20, (r) => ({
    inset: 0.05 + r() * 0.1,
    drift: 1.2 + r() * 1.6,
    y: (CLOUD_SEA.bottom + CLOUD_SEA.top) / 2 + 0.4 + (r() - 0.5) * 0.9,
    size: scale * (0.8 + r() * 0.5),
    sink: 0.3,
  }))
}

/**
 * How far under the coast's ground the arrival ring hangs. The same for every
 * piece: a piece's underside tapers up towards its open sides, so its `depth`
 * no longer says how deep its coast is, but the taper fades to nothing at the
 * coast, which is still a full 2 u wall.
 */
const RING_HANG = 1.6

/** The ring of cloud just under the piece's rim as it arrives, along its open coast. */
export function ringPuffs(id: IsleId): Puff[] {
  const { pos, island } = ISLES[id]
  const scale = Math.max(0.85, Math.min(2.2, island.spec.radius / 4))
  const ring = coastPuffs(id, 11, 22, (r) => ({
    inset: 0.02,
    drift: 0.6 + r() * 0.6,
    y: pos[1] - RING_HANG + (r() - 0.5) * 0.25,
    size: scale * (0.6 + r() * 0.4),
    sink: 0.5,
  }))
  // Under the coast's own ground: a piece that steps down to the farm (the highland) is lower there.
  return ring.map((p) => ({ ...p, y: p.y + island.height(p.cx - pos[0], p.cz - pos[2]) }))
}

function placePuffs(group: THREE.Group | null, puffs: Puff[], material: THREE.MeshLambertMaterial, state: CloudPuffs | null) {
  if (!group) return
  group.visible = state !== null && state.opacity > 0.01
  if (!state || !group.visible) return
  material.opacity = state.opacity
  group.children.forEach((child, i) => {
    const p = puffs[i]
    if (!p) return
    const s = p.size * state.swell
    child.position.set(p.cx + p.dx * state.spread, p.y - p.sink * (state.spread - 1), p.cz + p.dz * state.spread)
    child.scale.set(s, s * 0.45, s * 0.8)
  })
}

const isOurs = (made: Set<THREE.Material>, m: THREE.Material | THREE.Material[]) => (Array.isArray(m) ? m.every((x) => made.has(x)) : made.has(m))

/**
 * Writes how a piece is drawn on the world element, for tests:
 * `data-isle-<id>` reads like "y=-2.40 shown at=10.90,11.70", its height
 * against its docked place, whether it's drawn, and where it is docked (x, z).
 * Null takes it away.
 */
function reportIsle(canvas: HTMLCanvasElement, id: IsleId, state: string | null) {
  const world = canvas.closest<HTMLElement>('[data-testid="world"]')
  if (!world) return
  if (state === null) world.removeAttribute(`data-isle-${id}`)
  else world.setAttribute(`data-isle-${id}`, state)
}

/**
 * Fades a rising isle in. The scene's materials are shared, so while the isle
 * is see-through its meshes wear transparent copies; once it's solid they get
 * their own back and the copies are thrown away. Meshes that appear mid-rise
 * (a model that finished loading, say) are picked up on the next frame.
 */
class Fader {
  private copies = new Map<THREE.Material, THREE.Material>()
  private made = new Set<THREE.Material>()
  private swapped = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()

  apply(root: THREE.Object3D, opacity: number) {
    if (opacity >= 1) return this.restore()
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || isOurs(this.made, mesh.material)) return
      this.swapped.set(mesh, mesh.material)
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => this.copyOf(m)) : this.copyOf(mesh.material)
    })
    for (const [original, copy] of this.copies) copy.opacity = (original.transparent ? original.opacity : 1) * opacity
  }

  restore() {
    if (!this.swapped.size) return
    for (const [mesh, original] of this.swapped) if (isOurs(this.made, mesh.material)) mesh.material = original
    this.swapped.clear()
    this.made.forEach((m) => m.dispose())
    this.made.clear()
    this.copies.clear()
  }

  private copyOf(m: THREE.Material): THREE.Material {
    let copy = this.copies.get(m)
    if (!copy) {
      copy = m.clone()
      // Shader tweaks (the wind in the grass) aren't copied by clone().
      copy.onBeforeCompile = m.onBeforeCompile
      copy.customProgramCacheKey = m.customProgramCacheKey
      copy.transparent = true
      this.copies.set(m, copy)
      this.made.add(copy)
    }
    return copy
  }
}

interface RisingProps {
  /**
   * The piece, which then rises from under the cloud sea into its docked
   * place in ISLES, fading in through the clouds. Without one, the children
   * simply rise into place from a little below, at the pace of the motion level.
   */
  id?: IsleId
  /** True for a piece that has just been claimed; one that was already there is simply in place. */
  animate: boolean
  /**
   * A bridge laid once a plain rise (no `id`) has settled, `laid` running from
   * 0 to 1. A piece with an `id` docks against the farm and never has one: the
   * prop is ignored for it (kept so features written for bridges still build).
   */
  bridge?: (laid: number) => ReactNode
  children: ReactNode
}

/** Rises from under the cloud sea the first time a piece appears (see riseCurve.ts) and docks. */
export function Rising({ id, animate, bridge: bridgeProp, children }: RisingProps) {
  // Without an id there's no piece to look up: no clouds, no fading, just the rise.
  const def = id ? ISLES[id] : null
  const bridge = id ? undefined : bridgeProp
  const motion = useMotion()
  // Fixed when the piece appears. Still mode has no plan: the piece is just there.
  // Without a bridge to lay, it's done the moment it settles.
  const [plan] = useState<RisePlan | null>(() => {
    const p = animate ? RISE_PLANS[motion] : null
    return p && !bridge ? { ...p, bridgeSeconds: 0 } : p
  })
  const depth = def ? riseDepth(def.pos[1]) : PLAIN_DEPTH
  const [startY] = useState(() => (plan ? -depth : 0))
  const [settled, setSettled] = useState(plan === null)
  const [laid, setLaid] = useState(plan === null ? 1 : 0)
  const moving = plan !== null && !settled

  const group = useRef<THREE.Group>(null)
  const bank = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Group>(null)
  const started = useRef<number | null>(null)
  const laidShown = useRef(laid)
  const fader = useMemo(() => new Fader(), [])
  const bankMat = useMemo(puffMaterial, [])
  const ringMat = useMemo(puffMaterial, [])
  const puffs = useMemo(() => (id ? { bank: bankPuffs(id), ring: ringPuffs(id) } : null), [id])
  const setRising = useRiseState((s) => s.setRising)
  const setDocked = useRiseState((s) => s.setDocked)
  const canvas = useThree((s) => s.gl.domElement)

  const report = () => {
    const g = group.current
    if (!id || !def || !g) return
    reportIsle(canvas, id, `y=${g.position.y.toFixed(2)} ${g.visible ? 'shown' : 'hidden'} at=${def.pos[0].toFixed(2)},${def.pos[2].toFixed(2)}`)
  }

  const finish = () => {
    const g = group.current
    if (g) {
      g.position.y = 0
      g.visible = true
    }
    fader.restore()
    if (puffs) {
      placePuffs(bank.current, puffs.bank, bankMat, null)
      placePuffs(ring.current, puffs.ring, ringMat, null)
    }
    laidShown.current = 1
    setLaid(1)
    setSettled(true)
  }

  // Told to the world element while it's on its way, and once it's docked (see riseState.ts).
  useEffect(() => {
    if (!moving || !id) return
    setRising(id, true)
    return () => setRising(id, false)
  }, [moving, id, setRising])
  useEffect(() => {
    if (!settled || !id) return
    setDocked(id, true)
    return () => setDocked(id, false)
  }, [settled, id, setDocked])

  // Switched to still mode part way: straight into place.
  useEffect(() => {
    if (moving && motion === 'still') finish()
  })

  // How it's drawn, on the world element for tests: when it appears, as its
  // bridge is laid and once it has settled (and every frame on the way up).
  useEffect(report, [settled, laid])
  useEffect(
    () => () => {
      if (id) reportIsle(canvas, id, null)
    },
    [canvas, id],
  )

  useEffect(
    () => () => {
      fader.restore()
      bankMat.dispose()
      ringMat.dispose()
    },
    [fader, bankMat, ringMat],
  )

  useFrame(({ clock }) => {
    if (!moving || !plan) return
    started.current ??= clock.elapsedTime
    const t = clock.elapsedTime - started.current
    const g = group.current
    if (g) {
      const y = riseOffset(plan, depth, t)
      const opacity = def ? riseOpacity(def.pos[1] + y) : 1
      g.position.y = y
      g.visible = opacity > 0.005
      if (g.visible) fader.apply(g, opacity)
    }
    if (puffs) {
      placePuffs(bank.current, puffs.bank, bankMat, breachCloud(plan, t))
      placePuffs(ring.current, puffs.ring, ringMat, arrivalRing(plan, t))
    }
    // The bridge is laid in a couple of dozen steps, not a re-render every frame.
    const next = Math.ceil(bridgeLaid(plan, t) * 24) / 24
    if (next !== laidShown.current) {
      laidShown.current = next
      setLaid(next)
    }
    if (riseDone(plan, t)) finish()
    report()
  })

  return (
    <>
      {/* An isle starts out unseen under the clouds; without one to fade, it's drawn from the start. */}
      <group ref={group} position-y={startY} visible={plan === null || !def}>
        {children}
      </group>
      {bridge && laid > 0 && bridge(laid)}
      {plan?.puffs && puffs && moving && (
        <>
          <group ref={bank} visible={false}>
            {puffs.bank.map((p, i) => (
              <mesh key={i} geometry={puffGeo} material={bankMat} rotation-y={p.rot} />
            ))}
          </group>
          <group ref={ring} visible={false}>
            {puffs.ring.map((p, i) => (
              <mesh key={i} geometry={puffGeo} material={ringMat} rotation-y={p.rot} />
            ))}
          </group>
        </>
      )}
    </>
  )
}
