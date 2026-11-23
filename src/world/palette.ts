// Colours for the world. The brand palette from the art direction, plus a few
// earthy companions for soil, stone and cliffs.

export const PALETTE = {
  ivory: '#F5F0E6',
  cream: '#FFF8EC',
  sage: '#9CAF88',
  meadow: '#7D9B70',
  forest: '#526E58',
  dusty: '#91B7C8',
  sky: '#BFD7DE',
  terracotta: '#C98268',
  wood: '#A9825D',
  gold: '#E8BD72',
  ink: '#403D35',

  grassLight: '#A9BA8C',
  grassDeep: '#6F8C66',
  leaf: '#7D9B70',
  leafLight: '#9DB383',
  leafDark: '#5A7A5E',
  leafAutumn: '#C7A15E',
  blossom: '#E7B8A8',

  soil: '#6E5444',
  soilDark: '#5B4538',
  soilLight: '#8A6B55',
  path: '#C8B08E',
  pathDark: '#B39B7A',
  stone: '#C9BFB0',
  stoneDark: '#9E968B',
  cliffTop: '#B79C86',
  cliffMid: '#A08B86',
  cliffLow: '#8A8796',
  cliffTip: '#737A90',

  wall: '#EFE3CC',
  wallShade: '#E2D2B6',
  roof: '#C98268',
  roofDark: '#A9654F',
  woodDark: '#7D5F45',
  woodLight: '#C29E76',
  window: '#F3D9A4',

  water: '#91B7C8',
  waterDeep: '#6E9AB0',
  foam: '#E8F1F0',

  cloud: '#FFF8EC',
  mountain: '#9AA3BC',
  mountainLight: '#C7CBDB',
  snow: '#F1EFEA',

  white: '#FBF7EF',
  chickenComb: '#C9684E',
  beak: '#E8BD72',
  wool: '#F4EEE2',
  sheepFace: '#5E5550',
  cat: '#D99A62',
  dog: '#B98A63',
  duck: '#F3EBDA',
  duckHead: '#6F8C66',
} as const

export type PaletteKey = keyof typeof PALETTE
