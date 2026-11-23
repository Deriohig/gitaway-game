import type { ComponentType } from 'react'
import { almanacPages, type AlmanacPageId } from '../../../surfaces'
import { AnimalsPage } from './AnimalsPage'
import { BuildingsPage } from './BuildingsPage'
import { CropsPage } from './CropsPage'
import { FishPage } from './FishPage'
import { GoodsPage } from './GoodsPage'
import { VisitorsPage } from './VisitorsPage'

export type { AlmanacPageId }

const PAGES: Record<AlmanacPageId, ComponentType> = {
  crops: CropsPage,
  animals: AnimalsPage,
  buildings: BuildingsPage,
  goods: GoodsPage,
  visitors: VisitorsPage,
  fish: FishPage,
}

export interface AlmanacPage {
  id: AlmanacPageId
  label: string
  Page: ComponentType
}

/**
 * The almanac's pages, in order. Each page is its own file, owned by its
 * feature, and is listed while that feature is switched on (see surfaces.ts).
 * Read when called, so the list follows the switches; it can be empty.
 */
export const almanacPageList = (): AlmanacPage[] => almanacPages().map(({ id, label }) => ({ id, label, Page: PAGES[id] }))
