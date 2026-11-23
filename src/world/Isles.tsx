import * as THREE from 'three'
import { createPortal, useThree } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { ITEMS } from '../game/config'
import { useGame } from '../store/game'
import { Flock } from './Animals'
import { DOCK_IDS, PIECES, type DockId } from './blueprint'
import { Composition, PathRibbons } from './Composed'
import { composes, type Category } from './composition'
import { visibleIsles } from './framing'
import { GLADE, GROVE, ISLET, MEADOW, ORCHARD, inWater } from './isleSpots'
import { ISLES, MAIN, type IsleDef, type IsleId, type XZ } from './layout'
import { groundMaterial } from './materials'
import { useMotion } from './motion'
import { Bush, GrassTufts, PineTree, Rock, RoundTree, Wildflowers } from './Nature'
import { usePieceStore } from './pieceLoader'
import { polygonArea } from './pieces'
import { Rising } from './Rising'
import { joinedIsles, useRiseState } from './riseState'
import { showSkirts } from './skirts'
import { Beehive, Haystack, Lighthouse, Log, Mushrooms, Shelter } from './Structures'
import { footprintDrop, rimPoint, type Island } from './terrain'
import { Highland, Wetland } from './WildIsles'

// The unlock pieces of the island (art/BLUEPRINT.md): each rises out of the
// cloud sea when it's bought and docks against the farm's rim, so the farm
// grows into one island. The meadow, grove, islet and orchard are dressed here,
// and the wetland and highland in WildIsles.tsx. The glade (the cottage's
// piece) is left to the art's composition, but for the beehives past the
// farm's own: the retirement cottage dresses it with <OnIsle> once its feature
// is on, as the repo orchard may the orchard.

/**
 * Where a bridge from the main island to an isle used to start and end.
 * @deprecated Docked pieces meet the farm's rim and need no bridge (Rising
 * ignores one for a piece). Kept so features written for bridges still build;
 * drop it when merging them.
 */
export function bridgeEnds(def: IsleDef, inset = 0.35) {
  const [px, py, pz] = def.pos
  const toward = Math.atan2(pz, px)
  const a = rimPoint(MAIN, toward, inset)
  const back = rimPoint(def.island, toward + Math.PI, inset)
  return { from: new THREE.Vector3(a.x, a.y + 0.03, a.z), to: new THREE.Vector3(back.x + px, back.y + py + 0.03, back.z + pz) }
}

/** Rises from under the cloud sea the first time a piece appears, and docks (see Rising.tsx). */
export { Rising } from './Rising'

/** Turns a spot in a piece's own coordinates into a position on its ground, lifted a little if asked. */
export function useLocalAt(def: IsleDef) {
  return (p: XZ, lift = 0): [number, number, number] => [p[0], def.island.height(p[0], p[1]) + lift, p[1]]
}

/**
 * Pieces that weren't there when the farm was opened rise in; the rest are
 * simply there, and in still mode every piece is. A piece that goes (the farm
 * was erased) rises in like any other when it comes back. Call it from a
 * component that stays mounted, not one that only appears with the piece, or
 * it never sees the piece arrive.
 */
export function useRisesIn(id: IsleId): boolean {
  const motion = useMotion()
  const visible = useVisibleIsles()
  // The scene can be drawn before the saved farm has been read, so the pieces
  // that were "already there" are the ones in the farm once it's loaded.
  const loaded = useGame((s) => s.loaded)
  const [initial, setInitial] = useState<IsleId[] | null>(() => (loaded ? visible : null))
  if (loaded && initial === null) setInitial(visible)
  else if (initial?.some((i) => !visible.includes(i))) setInitial(initial.filter((i) => visible.includes(i)))
  return motion !== 'still' && initial !== null && !initial.includes(id)
}

// ---------------------------------------------------------------------------
// Drawing on a piece from elsewhere

const useIsleGroups = create<{ groups: Partial<Record<IsleId, THREE.Group>> }>(() => ({ groups: {} }))

/**
 * Draws its children on a docked piece, in the piece's own coordinates (stand
 * them with `useLocalAt(ISLES[id])`), rising and fading in with it. Nothing is
 * drawn while the piece isn't in the world. For features that dress a piece.
 */
export function OnIsle({ id, children }: { id: IsleId; children: ReactNode }) {
  const group = useIsleGroups((s) => s.groups[id])
  return group ? createPortal(children, group) : null
}

function IsleSlot({ id }: { id: IsleId }) {
  const ref = useCallback(
    (group: THREE.Group | null) => {
      if (!group) return
      useIsleGroups.setState((s) => ({ groups: { ...s.groups, [id]: group } }))
      return () => useIsleGroups.setState((s) => ({ groups: { ...s.groups, [id]: undefined } }))
    },
    [id],
  )
  return <group ref={ref} />
}

// ---------------------------------------------------------------------------
// The pieces

/** Grass tufts per square unit of a piece's top. */
const TUFT_DENSITY = 0.5

/**
 * A baked piece's cliff skirts along its seams with other pieces (see
 * skirts.ts): each shows while the piece it faces isn't in the world, and
 * hides the moment that piece starts rising. Nothing for a piece without them.
 */
export function Skirts({ island }: { island: Island }) {
  const root = island.skirts
  const present = usePresentIsles()
  const invalidate = useThree((s) => s.invalidate)
  useLayoutEffect(() => {
    if (!root) return
    showSkirts(root, ['main', ...present])
    invalidate()
  }, [root, present, invalidate])
  return root ? <primitive object={root} /> : null
}

/**
 * Whether the game's own scatter of a kind makes way on a piece: where the
 * art's composition places that kind there (see composition.ts).
 */
export const givesWayOn = (id: IsleId) => (category: Category) => composes(id, category, ISLES[id].island)

/** A piece's ground, its grass, the art's composition on it, whatever else is drawn on it, and a place for features to draw more. */
function Piece({ id, present, children }: { id: IsleId; present: readonly IsleId[]; children?: ReactNode }) {
  const def = ISLES[id]
  const givesWay = givesWayOn(id)
  const tufts = useMemo(
    () => ({ count: Math.round(polygonArea(PIECES[id].outline) * TUFT_DENSITY), avoid: offBuildings(id), seed: 31 + DOCK_IDS.indexOf(id) * 7 }),
    [id],
  )
  return (
    <group position={def.pos}>
      <mesh geometry={def.island.geometry} material={groundMaterial(def.island)} receiveShadow castShadow />
      <Skirts island={def.island} />
      {!givesWay('grass') && <GrassTufts island={def.island} count={tufts.count} avoid={tufts.avoid} seed={tufts.seed} />}
      <Composition piece={id} island={def.island} />
      <PathRibbons piece={id} island={def.island} present={present} />
      {children}
      <IsleSlot id={id} />
    </group>
  )
}

/** Keeps scatter off a piece's spots for buildings to come, out of its water, and off the wild isles' risers and banks. */
function offBuildings(id: IsleId) {
  const keep = PIECES[id].flatZones.filter((z) => z.kind === 'building' || z.kind === 'restoration')
  const wild = id === 'wetland' || id === 'highland'
  // Read when the scatter is placed, once the piece's ground is in.
  const steep = (x: number, z: number) => {
    const h = ISLES[id].island.height
    const y = h(x, z)
    return [0, 1, 2, 3].some((k) => Math.abs(h(x + Math.cos(k * 1.57) * 0.25, z + Math.sin(k * 1.57) * 0.25) - y) > 0.2)
  }
  return (x: number, z: number) =>
    keep.some((k) => Math.hypot(x - k.at[0], z - k.at[1]) < k.r + 0.1) || inWater(id, [x, z], 0.15) || (wild && steep(x, z))
}

const meadowFlowersAvoid = offBuildings('meadow')

/** How the meadow's two haystacks are turned, as the art turns them. */
const HAYSTACK_TURNS = [0.35, 2.2]

function Meadow() {
  const def = ISLES.meadow
  const at = useLocalAt(def)
  const sheep = useGame((s) => s.game.owned.sheep)
  // The art's flowers, shrubs and trees take the place of these; the rock in the wildflowers stays.
  const givesWay = givesWayOn('meadow')
  return (
    <>
      {/* Its flower drifts. */}
      {!givesWay('flowers') && <Wildflowers island={def.island} count={150} avoid={meadowFlowersAvoid} seed={23} />}
      <Shelter position={at(MEADOW.shelter)} rotation={0.7} />
      {/* On the lowest ground under each, turned as the art turns them. */}
      {MEADOW.haystacks.map((p, i) => (
        <Haystack key={i} position={at(p, footprintDrop(def.island, p[0], p[1], 0.45))} rotation={HAYSTACK_TURNS[i]} />
      ))}
      {!givesWay('shrubs') && MEADOW.bushes.map((p, i) => <Bush key={i} position={at(p, -0.02)} scale={0.8} seed={i + 60} flowers />)}
      {!givesWay('trees') && <RoundTree position={at(MEADOW.tree, -0.05)} scale={0.95} seed={71} />}
      <Rock position={at(MEADOW.rock)} lift={0.08} scale={[0.3, 0.2, 0.3]} />
      <Flock count={sheep} island={def.island} pasture={MEADOW.pasture} />
    </>
  )
}

function Grove() {
  const at = useLocalAt(ISLES.grove)
  // The art's trees and rocks take the place of the clumps and the rock; the big tree, the log and the mushrooms stay.
  const givesWay = givesWayOn('grove')
  return (
    <>
      {!givesWay('trees') &&
        GROVE.trees.map((t, i) =>
          t.pine ? (
            <PineTree key={i} position={at(t.p, -0.05)} scale={t.s} seed={i + 100} />
          ) : (
            <RoundTree key={i} position={at(t.p, -0.05)} scale={t.s * 0.9} seed={i + 100} />
          ),
        )}
      <RoundTree position={at(GROVE.bigTree, -0.05)} scale={1.5} seed={97} />
      <Log position={at(GROVE.log)} rotation={GROVE.logTurn} />
      <Mushrooms position={at(GROVE.mushrooms)} seed={4} />
      <Mushrooms position={at([GROVE.mushrooms[0] + 0.45, GROVE.mushrooms[1] - 0.3])} seed={8} />
      {!givesWay('rocks') && <Rock position={at(GROVE.rock)} lift={0.05} scale={[0.25, 0.18, 0.25]} />}
    </>
  )
}

/** The beehives past the farm's own, in the glade's wildflowers, which make room for them. */
function Glade({ hives }: { hives: number }) {
  const at = useLocalAt(ISLES.cottage)
  return (
    <>
      {GLADE.hives.slice(0, hives).map((p, i) => (
        <Beehive key={i} position={at(p)} seed={ITEMS.beehive.max + i + 1} />
      ))}
    </>
  )
}

/**
 * The orchard's fruit trees in their rows, drawn as the farm's fruit trees are
 * (the art's fruit tree, or its stand-in until that is in), each on the ground
 * at its own spot as it is drawn.
 */
function Orchard() {
  const at = useLocalAt(ISLES.orchard)
  return (
    <>
      {ORCHARD.rows.map((p, i) => (
        <RoundTree key={i} position={at(p, -0.04)} scale={ORCHARD.treeScale} seed={i + 140} fruit={i % 2 ? 'terracotta' : 'gold'} />
      ))}
    </>
  )
}

function Islet({ lighthouse }: { lighthouse: boolean }) {
  const at = useLocalAt(ISLES.islet)
  // The art's shrubs take the place of the bush; the rocks along the coast stay.
  const givesWay = givesWayOn('islet')
  return (
    <>
      {ISLET.rocks.map((r, i) => (
        <Rock key={i} position={at(r.at)} lift={r.s[1] * 0.4} scale={r.s} color={i % 2 ? 'stone' : 'stoneDark'} />
      ))}
      {!givesWay('shrubs') && <Bush position={at(ISLET.bush, -0.02)} scale={0.7} seed={5} />}
      {lighthouse && <Lighthouse position={at(ISLET.lighthouse)} />}
    </>
  )
}

/** The unlock pieces in the world, each docked against the farm. */
export function Isles() {
  const owned = useGame((s) => s.game.owned)
  // A piece bought before its files are in waits for them (or its stand-in) before it rises.
  const present = usePresentIsles()
  // One hook per piece, always in the same order.
  const rise = {} as Record<DockId, boolean>
  for (const id of DOCK_IDS) rise[id] = useRisesIn(id)
  return (
    <group>
      {present.map((id) => (
        <Rising key={id} id={id} animate={rise[id]}>
          <Piece id={id} present={present}>
            {id === 'meadow' && <Meadow />}
            {id === 'grove' && <Grove />}
            {id === 'islet' && <Islet lighthouse={owned.lighthouse > 0} />}
            {id === 'wetland' && <Wetland risesIn={rise.wetland} />}
            {id === 'highland' && <Highland goats={owned.goat} />}
            {id === 'cottage' && <Glade hives={Math.max(0, owned.beehive - ITEMS.beehive.max)} />}
            {id === 'orchard' && <Orchard />}
          </Piece>
        </Rising>
      ))}
    </group>
  )
}

/** A list from a joined string (which keeps a selector's result stable between renders). */
const split = (key: string): IsleId[] => (key ? (key.split(' ') as IsleId[]) : [])

/** The unlock pieces in the world right now: the ones the farm has. */
export function useVisibleIsles(): IsleId[] {
  const key = useGame((s) => visibleIsles(s.game).join(' '))
  return useMemo(() => split(key), [key])
}

/** The pieces in the world whose files are in (or whose stand-in is ready): the ones drawn, risen or rising. */
export function usePresentIsles(): IsleId[] {
  const visible = useVisibleIsles()
  const key = usePieceStore((s) => visible.filter((id) => s.sources[id] !== undefined).join(' '))
  return useMemo(() => split(key), [key])
}

/**
 * The pieces joined to the farm (see joinedIsles): the farm's rim along them
 * is the middle of the island now. One rising in joins once it has docked.
 */
export function useJoinedIsles(): IsleId[] {
  const present = usePresentIsles()
  const docked = useRiseState((s) => s.docked)
  // One hook per piece, always in the same order.
  const risingIn: IsleId[] = []
  for (const id of DOCK_IDS) if (useRisesIn(id)) risingIn.push(id)
  const key = joinedIsles(present, risingIn, docked).join(' ')
  return useMemo(() => split(key), [key])
}
