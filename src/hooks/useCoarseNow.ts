import { useEffect, useState } from 'react'
import { now as clockNow, subscribeClock } from '../game/clock'
import { useGame } from '../store/game'

/** The game's current time (see clock.ts), refreshed every `ms` and whenever the game state or the clock changes. */
export function useCoarseNow(ms: number): number {
  const [now, setNow] = useState(() => clockNow())
  const game = useGame((s) => s.game)
  useEffect(() => {
    setNow(clockNow())
  }, [game])
  useEffect(() => {
    const id = setInterval(() => setNow(clockNow()), ms)
    const unsubscribe = subscribeClock(() => setNow(clockNow()))
    return () => {
      clearInterval(id)
      unsubscribe()
    }
  }, [ms])
  return now
}
