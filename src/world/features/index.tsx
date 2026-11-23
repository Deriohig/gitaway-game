import { FEATURES } from '../../game/features'
import { Ambient } from './Ambient'
import { Barnaby } from './Barnaby'
import { Biomes } from './Biomes'
import { Cottage } from './Cottage'
import { Fishing } from './Fishing'
import { LanternNight } from './LanternNight'
import { Milestones } from './Milestones'
import { RepoOrchard } from './RepoOrchard'
import { Restorations } from './Restorations'
import { Siofra } from './Siofra'
import { Studio } from './Studio'
import { Visitors } from './Visitors'
import { Weather } from './Weather'
import { Workshop } from './Workshop'

// Mount points for the idle-loop features. Each feature draws its part of the
// world in its own file, inside the scene (so it can use the motion context),
// and features never edit the same scene code. A feature that is switched off
// (see features.ts) draws nothing.

export function Features() {
  const on = FEATURES
  return (
    <>
      {on.biomes && <Biomes />}
      {on.cottage && <Cottage />}
      {on.gitEvents && <RepoOrchard />}
      {on.workshop && <Workshop />}
      {on.restorations && <Restorations />}
      {on.visitors && <Visitors />}
      {on.characters && <Barnaby />}
      {on.characters && <Siofra />}
      {on.fishing && <Fishing />}
      {on.milestoneLooks && <Milestones />}
      {on.ambient && <Ambient />}
      {on.seasons && <Weather />}
      {on.gitEvents && <LanternNight />}
      {/* The studio's handles, and the shop's preview ghost, which the studio draws. */}
      {(on.studio || on.shopPreview) && <Studio />}
    </>
  )
}
