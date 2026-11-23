import type { ReactNode } from 'react'
import { isOn } from '../game/features'
import { slotKey } from '../game/systems/studio'
import { useGame } from '../store/game'
import { Cat, Chickens, Dog, Ducks } from './Animals'
import { Farmhouse } from './Farmhouse'
import { Garden } from './Garden'
import {
  BEEHIVES,
  BENCH,
  BUSHES,
  DIRT_PATHS,
  FENCE_RUNS,
  FLOWERBEDS,
  FRUIT_TREES,
  GREENHOUSE,
  HOME_FENCE,
  HOUSE,
  LANTERNS,
  MAIN,
  ROCKS,
  SCARECROW,
  STATIC_TREES,
  STONE_PATHS,
  WELL,
  WINDMILL,
  WOODSHED,
  WOODSHED_ROT,
  bushLook,
  byDockedRim,
  heroSink,
  isClear,
  windmillDrop,
  woodshedDrop,
  type XZ,
} from './layout'
import { Composition, PathRibbons } from './Composed'
import { composes } from './composition'
import { Skirts, useJoinedIsles, usePresentIsles } from './Isles'
import { groundMaterial } from './materials'
import { Bush, FlowerBed, GrassTufts, HeroTree, PineTree, Rock, RoundTree, Wildflowers } from './Nature'
import { useSlot } from './slots'
import { Beehive, Bench, DirtPath, FenceRun, Greenhouse, Lantern, Scarecrow, SteppingStones, Well, Windmill, Woodshed } from './Structures'
import { footprintDrop } from './terrain'
import { Tint } from './Tint'
import { Pond, PondDressing, PondWater, Stream, StreamBridge, StreamFall, StreamWater } from './Water'
import { PieceWater } from './water/PieceWater'
import { useWaterDrawnV2 } from './water/report'

const at = ([x, z]: XZ, lift = 0): [number, number, number] => [x, MAIN.height(x, z) + lift, z]
const ORIGIN: [number, number, number] = [0, 0, 0]

/**
 * How big the farm's own round (`r`) and pine (`p`) trees are drawn: their
 * STATIC_TREES scale times this; the hero tree is its own model. At 1 the
 * painterly models stand about 2.2–3.7 u tall. The composition draws the same
 * models at about 0.62 (round) and 0.72 (pine) of that, about 1.6 u: the owner
 * is to choose between the two (the art session's brief, step 7).
 */
const FARM_TREE_SCALE = { r: 1, p: 1 } as const

function nearPaths(x: number, z: number): boolean {
  for (const path of [...DIRT_PATHS, ...STONE_PATHS]) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i]
      const [bx, bz] = path[i + 1]
      const dx = bx - ax
      const dz = bz - az
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
      if (Math.hypot(x - (ax + dx * t), z - (az + dz * t)) < 0.42) return true
    }
  }
  return false
}

const avoidTufts = (x: number, z: number) => !isClear(x, z, 0.15) || nearPaths(x, z)

/**
 * A thing the player can move, turn and recolour in the studio. It stands in its slot until they do.
 * With a footprint (half-width and half-depth), it settles to the lowest ground under it.
 */
function Placed({ slot, home, rot = 0, lift = 0, foot, children }: { slot: string; home: XZ; rot?: number; lift?: number; foot?: XZ; children: ReactNode }) {
  const s = useSlot(slot, home, rot)
  const sink = foot ? footprintDrop(MAIN, s.x, s.z, foot[0], foot[1], s.rot) : 0
  return (
    <group position={at([s.x, s.z], lift + sink)} rotation-y={s.rot}>
      <Tint swatch={s.tint}>{children}</Tint>
    </group>
  )
}

export function MainIsland() {
  const owned = useGame((s) => s.game.owned)
  const gifts = useGame((s) => s.game.gifts)
  // Scatter by the rim makes way where a piece has docked alongside: the edge
  // is now the middle of the island. Not before it has docked.
  const docked = useJoinedIsles()
  const byEdge = (p: XZ) => byDockedRim(p, docked)
  const present = usePresentIsles()
  // The farm stream's fall goes when the wetland docks: its river carries on instead.
  const waterfall = !docked.includes('wetland')
  const pondDrawn = useWaterDrawnV2('main')

  return (
    <group>
      <mesh geometry={MAIN.geometry} material={groundMaterial(MAIN)} receiveShadow castShadow />
      <Skirts island={MAIN} />
      <Composition piece="main" island={MAIN} />
      <PathRibbons piece="main" island={MAIN} present={present} />
      {/* The art's grass and flowers take the place of the farm's own where its composition is drawn. */}
      {!composes('main', 'grass', MAIN) && <GrassTufts island={MAIN} count={190} avoid={avoidTufts} seed={3} />}
      {!composes('main', 'flowers', MAIN) && <Wildflowers island={MAIN} count={110} avoid={avoidTufts} seed={7} />}

      <Farmhouse position={at([HOUSE.x, HOUSE.z])} rotation={HOUSE.rot} />
      {DIRT_PATHS.map((p, i) => (
        <DirtPath key={i} points={p} width={i === 0 ? 0.6 : 0.5} />
      ))}
      {isOn('water') ? (
        // The art's pond and stream, one baked surface, and its farm fall, with the dressing, the fall's mist and the
        // bridge on its shore once it is drawn; today's water, fall, dressing and bridge until then (and for good if it
        // fails). The baked fall retreats as the wetland docks (water/driver.ts); its mist stays today's blobs (PR 5).
        <>
          <PieceWater
            piece="main"
            legacy={
              <>
                <PondWater />
                <StreamWater />
              </>
            }
          />
          <PondDressing mode={pondDrawn ? 'v2' : 'legacy'} />
          <StreamFall waterfall={waterfall} mode={pondDrawn ? 'v2' : 'legacy'} />
          <StreamBridge mode={pondDrawn ? 'v2' : 'legacy'} />
        </>
      ) : (
        <>
          <Pond />
          <Stream waterfall={waterfall} />
        </>
      )}
      <Garden />
      {HOME_FENCE.map(([a, b], i) => (
        <FenceRun key={i} from={a} to={b} />
      ))}

      {STATIC_TREES.map((t, i) =>
        byEdge(t.at) ? null : i === 0 ? (
          <HeroTree key={i} position={at(t.at, -0.05)} scale={t.s} seed={t.seed} sink={heroSink()} />
        ) : t.kind === 'p' ? (
          <PineTree key={i} position={at(t.at, -0.05)} scale={t.s * FARM_TREE_SCALE.p} seed={t.seed} />
        ) : (
          <RoundTree key={i} position={at(t.at, -0.05)} scale={t.s * FARM_TREE_SCALE.r} seed={t.seed} />
        ),
      )}
      {BUSHES.map((b, i) => (byEdge(b) ? null : <Bush key={i} position={at(b, -0.03)} {...bushLook(i)} />))}
      {ROCKS.map((r, i) =>
        byEdge(r.at) ? null : <Rock key={i} position={at(r.at)} lift={r.s * 0.3} scale={[r.s, r.s * 0.7, r.s]} color={i % 2 ? 'stoneDark' : 'stone'} />,
      )}

      {/* Things the player has added */}
      {FENCE_RUNS.slice(0, owned.fence).map(([a, b], i) => (
        <FenceRun key={i} from={a} to={b} />
      ))}
      {STONE_PATHS.slice(0, owned.path).map((p, i) => (
        <SteppingStones key={i} points={p} seed={i + 1} />
      ))}
      {FLOWERBEDS.slice(0, owned.flowerbed).map((p, i) => (
        <Placed key={i} slot={slotKey('flowerbed', i)} home={p}>
          <FlowerBed position={ORIGIN} seed={i + 1} />
        </Placed>
      ))}
      {LANTERNS.slice(0, owned.lantern).map((p, i) => (
        <Placed key={i} slot={slotKey('lantern', i)} home={p}>
          <Lantern position={ORIGIN} />
        </Placed>
      ))}
      {FRUIT_TREES.slice(0, owned.fruitTree).map((p, i) => (
        <Placed key={i} slot={slotKey('fruitTree', i)} home={p} lift={-0.04}>
          <RoundTree position={ORIGIN} scale={0.72} seed={i + 40} fruit={i % 2 ? 'terracotta' : 'gold'} />
        </Placed>
      ))}
      {BEEHIVES.slice(0, owned.beehive).map((p, i) => (
        <Placed key={i} slot={slotKey('beehive', i)} home={p}>
          <Beehive position={ORIGIN} seed={i + 1} />
        </Placed>
      ))}
      {owned.bench > 0 && (
        <Placed slot={slotKey('bench', 0)} home={[BENCH.x, BENCH.z]} rot={BENCH.rot} foot={[0.5, 0.24]}>
          <Bench position={ORIGIN} rotation={0} />
        </Placed>
      )}
      {owned.scarecrow > 0 && (
        <Placed slot={slotKey('scarecrow', 0)} home={SCARECROW}>
          <Scarecrow position={ORIGIN} />
        </Placed>
      )}
      {owned.well > 0 && (
        <Placed slot={slotKey('well', 0)} home={WELL} foot={[0.45, 0.45]}>
          <Well position={ORIGIN} />
        </Placed>
      )}
      {/* On the lowest ground under its round base. */}
      {owned.windmill > 0 && <Windmill position={at(WINDMILL, windmillDrop())} />}
      {owned.greenhouse > 0 && <Greenhouse position={at([GREENHOUSE.x, GREENHOUSE.z])} rotation={GREENHOUSE.rot} />}
      {/* On the lowest ground under its posts. */}
      {owned.woodshed > 0 && (
        <Woodshed position={at(WOODSHED, woodshedDrop())} rotation={WOODSHED_ROT} />
      )}

      {/* Residents */}
      <Chickens count={owned.chicken} />
      <Ducks count={owned.duck} />
      {gifts.includes('cat') && <Cat />}
      {gifts.includes('dog') && <Dog />}
    </group>
  )
}
