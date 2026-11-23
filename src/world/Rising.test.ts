import type { ComponentProps } from 'react'
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import { DOCK_IDS } from './blueprint'
import { ISLES } from './layout'
import { ringPuffs, type Rising } from './Rising'
import { standOnBakedGround } from './testing'

type Props = ComponentProps<typeof Rising>

// Type checks: `npm run type-check` fails if either form of Rising (with an isle id, or a plain rise in place) stops compiling.
it('takes an isle id, or none for a plain rise in place', () => {
  expectTypeOf<{ id: 'meadow'; animate: boolean; children: null }>().toExtend<Props>()
  expectTypeOf<{ animate: boolean; children: null }>().toExtend<Props>()
  expectTypeOf<{ animate: boolean; bridge: (laid: number) => null; children: null }>().toExtend<Props>()
  expectTypeOf<{ id: 'atlantis'; animate: boolean; children: null }>().not.toExtend<Props>() // an id that isn't an isle is refused
})

describe('the ring of cloud round a piece as it arrives', () => {
  let putBack = () => {}
  beforeAll(() => {
    putBack = standOnBakedGround(['main', ...DOCK_IDS])
  })
  afterAll(() => putBack())

  it('hangs under the coast, below the ground there, even where the highland steps down towards the farm', () => {
    for (const id of DOCK_IDS) {
      const { pos, island } = ISLES[id]
      const puffs = ringPuffs(id)
      expect(puffs.length, id).toBeGreaterThan(8)
      for (const p of puffs) {
        const ground = pos[1] + island.height(p.cx - pos[0], p.cz - pos[2])
        // Its top (squashed to 0.45 of its size, swelling to its size at most) stays under the ground beside it.
        expect(p.y + p.size * 0.45, `${id} puff at ${p.cx.toFixed(1)}, ${p.cz.toFixed(1)}`).toBeLessThan(ground)
      }
    }
  })
})
