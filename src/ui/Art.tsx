import type { JSX } from 'react'
import type { CropId, ItemId } from '../game/config'

// Little illustrations for crops and things you can build, in the same hand
// as the icons: soft fills, warm ink outline.

const INK = '#403D35'
const S = { stroke: INK, strokeWidth: 1.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const leaf = (d: string, fill = '#9CAF88') => <path d={d} fill={fill} {...S} />

const CROP_ART: Record<CropId, JSX.Element> = {
  radish: (
    <>
      {leaf('M12 9.5c-1-3.4-.2-5.6 1.6-6.3 1.4 2 .6 4.4-1.6 6.3Z')}
      {leaf('M12 9.5c-2.6-2-5-2-6-.6 1.8 1.4 4 1.4 6 .6Z', '#7D9B70')}
      <path d="M12 9.2c3.6 0 5.6 2.4 5.6 5.2 0 3.2-2.6 5.6-5.6 7-3-1.4-5.6-3.8-5.6-7 0-2.8 2-5.2 5.6-5.2Z" fill="#CF7378" {...S} />
      <path d="M10 13.5c.4-1 1.1-1.6 2-1.8" stroke="#F3C7C4" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </>
  ),
  carrot: (
    <>
      {leaf('M12.5 8.5c-.4-2.8.5-4.8 2.3-5.5.8 2.2-.2 4.2-2.3 5.5Z')}
      {leaf('M12 8.5c-1.8-2-3.8-2.4-5-1.4 1.2 1.8 3.2 2.2 5 1.4Z', '#7D9B70')}
      <path d="M9 9h7l-3.2 11.4a.6.6 0 0 1-1.1 0Z" fill="#D98A4E" {...S} />
      <path d="M10.4 12.5h1.6M11.2 15.5h1.4" stroke="#A9653A" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  wheat: (
    <>
      <path d="M8.5 21 10 10M12 21V8M15.5 21 14 10" stroke="#B98E45" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <ellipse cx="9.8" cy="7.6" rx="1.6" ry="3.2" fill="#E8BD72" {...S} transform="rotate(-12 9.8 7.6)" />
      <ellipse cx="12" cy="5.6" rx="1.6" ry="3.4" fill="#EDCB86" {...S} />
      <ellipse cx="14.2" cy="7.6" rx="1.6" ry="3.2" fill="#E8BD72" {...S} transform="rotate(12 14.2 7.6)" />
    </>
  ),
  lettuce: (
    <>
      <path d="M12 20c-4.4 0-7.5-2.6-7.5-6 0-2.6 1.8-4.2 3.4-4.4.6-2.2 2.2-3.6 4.1-3.6s3.5 1.4 4.1 3.6c1.6.2 3.4 1.8 3.4 4.4 0 3.4-3.1 6-7.5 6Z" fill="#A9BA8C" {...S} />
      <path d="M12 20c-2-1.6-2.8-4-2.4-6.6M12 20c2-1.6 2.8-4 2.4-6.6M12 10v10" stroke="#7D9B70" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </>
  ),
  tomato: (
    <>
      <circle cx="12" cy="13.5" r="6.5" fill="#C65A4A" {...S} />
      <path d="M12 7.2l-1.6-1.8M12 7.2l2.6-1.2M12 7.2 9 8.2M12 7.2l3.2 1" stroke="#526E58" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.6 12a3.6 3.6 0 0 1 2.2-2.2" stroke="#EBA597" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
  sunflower: (
    <>
      <path d="M12 21v-7" {...S} fill="none" />
      {leaf('M12 17.5c1.8-2.2 3.8-2.4 5-1.4-1.4 1.6-3.2 2-5 1.4Z', '#7D9B70')}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <ellipse key={a} cx="12" cy="5" rx="1.7" ry="2.8" fill="#E8BD72" stroke={INK} strokeWidth="1" transform={`rotate(${a} 12 9.5)`} />
      ))}
      <circle cx="12" cy="9.5" r="3" fill="#7A5A3E" {...S} />
    </>
  ),
  pumpkin: (
    <>
      <path d="M12.4 7.5c0-1.6.6-2.8 1.8-3.4" stroke="#7D5F45" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <ellipse cx="12" cy="14" rx="8" ry="6" fill="#D98B4A" {...S} />
      <path d="M12 8.2c-2 1.4-2.8 3.6-2.8 5.8s.8 4.4 2.8 5.8c2-1.4 2.8-3.6 2.8-5.8S14 9.6 12 8.2Z" fill="#E4A065" {...S} />
    </>
  ),
  blueberry: (
    <>
      {leaf('M12 8c-.2-2.6 1.4-4.4 4-4.6.2 2.6-1.4 4.4-4 4.6Z')}
      <circle cx="8.6" cy="14.2" r="3.6" fill="#5E70A5" {...S} />
      <circle cx="15.2" cy="12.6" r="3.6" fill="#6F82B6" {...S} />
      <circle cx="13" cy="17.6" r="3.2" fill="#55669A" {...S} />
      <path d="M14.6 11.6l1 .1M7.8 13.2l1 .1" stroke="#C9D2EA" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  cranberry: (
    <>
      {leaf('M6 9.5c1.5-3 5-4 7.5-2.5-2 2.5-5 3.5-7.5 2.5Z', '#7D9B70')}
      {leaf('M12.5 8c1.8-2.4 4.6-2.8 6.5-1.4-1.8 2-4.4 2.4-6.5 1.4Z')}
      <circle cx="9" cy="14.5" r="3" fill="#B8384A" {...S} />
      <circle cx="15" cy="13" r="3.2" fill="#C94A57" {...S} />
      <circle cx="12.5" cy="18" r="2.8" fill="#A93244" {...S} />
      <path d="M14 12l1 .2M8.3 13.7l.9.1" stroke="#F0B5BC" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  lavender: (
    <>
      <path d="M12 21V10M12 21 8.4 12M12 21l3.6-9" stroke="#7D9B70" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M12 3.5c1.3 1.2 1.3 4.8 0 6.3-1.3-1.5-1.3-5.1 0-6.3Z" fill="#9C86C4" {...S} />
      <path d="M7.4 6c1.4.8 1.9 4 .9 5.8-1.6-1-2-4.2-.9-5.8Z" fill="#8F78BA" {...S} />
      <path d="M16.6 6c1.1 1.6.7 4.8-.9 5.8-1-1.8-.5-5 .9-5.8Z" fill="#8F78BA" {...S} />
    </>
  ),
}

const ITEM_ART: Record<ItemId, JSX.Element> = {
  plot: (
    <>
      <path d="M3.5 13.5 12 9l8.5 4.5L12 18Z" fill="#8A6B55" {...S} />
      <path d="M3.5 13.5V15L12 19.5 20.5 15v-1.5" fill="#6E5444" {...S} />
      <path d="M7.5 12.3l8 4.2M10 11l8 4.2" stroke="#5B4538" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  flowerbed: (
    <>
      <path d="M4 17c0-2 3.6-3 8-3s8 1 8 3-3.6 3-8 3-8-1-8-3Z" fill="#8A6B55" {...S} />
      <circle cx="8" cy="12" r="2.2" fill="#C98268" {...S} />
      <circle cx="12.5" cy="10" r="2.2" fill="#E8BD72" {...S} />
      <circle cx="16.5" cy="12.5" r="2.2" fill="#E7B8A8" {...S} />
      <path d="M8 14.2v2M12.5 12.2v3.5M16.5 14.7v1.6" stroke="#526E58" strokeWidth="1.2" />
    </>
  ),
  fence: (
    <>
      <path d="M5 8l1.5-2L8 8v11H5ZM11 8l1.5-2L14 8v11h-3ZM17 8l1.5-2L20 8v11h-3Z" fill="#C29E76" {...S} />
      <path d="M3 11h18M3 15.5h18" stroke="#7D5F45" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  path: (
    <>
      <ellipse cx="7" cy="18" rx="3" ry="1.8" fill="#C9BFB0" {...S} />
      <ellipse cx="13" cy="14" rx="2.7" ry="1.6" fill="#E0D7C9" {...S} />
      <ellipse cx="17" cy="9.5" rx="2.4" ry="1.4" fill="#C9BFB0" {...S} />
      <ellipse cx="14" cy="5.5" rx="2" ry="1.2" fill="#E0D7C9" {...S} />
    </>
  ),
  lantern: (
    <>
      <path d="M9 21h6M12 21V9" {...S} fill="none" />
      <path d="M12 5.5l-3.5 2h7Z" fill="#403D35" {...S} />
      <rect x="9.3" y="7.5" width="5.4" height="6" rx="1" fill="#F3D9A4" {...S} />
      <circle cx="12" cy="10.5" r="1.4" fill="#E8BD72" />
    </>
  ),
  bench: (
    <>
      <path d="M4 11.5h16v2H4ZM4 7h16v2.6H4Z" fill="#C29E76" {...S} />
      <path d="M6 13.5v5M18 13.5v5M6.5 9.6v1.9M17.5 9.6v1.9" {...S} fill="none" />
    </>
  ),
  scarecrow: (
    <>
      <path d="M12 21V8M5 11.5h14" {...S} fill="none" />
      <path d="M9 10h6l.6 5.5H8.4Z" fill="#91B7C8" {...S} />
      <circle cx="12" cy="7" r="2.5" fill="#F0E2C8" {...S} />
      <path d="M8.5 5.2h7L12 2.4Z" fill="#A9825D" {...S} />
    </>
  ),
  woodshed: (
    <>
      <path d="M4.5 11v9M19.5 8v12" {...S} fill="none" />
      <path d="M3 10 21 6.8V9L3 12.2Z" fill="#A9825D" {...S} />
      {[[8, 18.2], [12, 18.2], [16, 18.2], [10, 14.9], [14, 14.9]].map(([x, y]) => (
        <g key={`${x},${y}`}>
          <circle cx={x} cy={y} r="1.8" fill={y > 16 ? '#C29E76' : '#E2C79E'} {...S} />
          <circle cx={x} cy={y} r=".55" fill="#7D5F45" />
        </g>
      ))}
    </>
  ),
  well: (
    <>
      <path d="M6 13.5h12v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 18.5Z" fill="#C9BFB0" {...S} />
      <ellipse cx="12" cy="13.5" rx="6" ry="1.6" fill="#6E9AB0" {...S} />
      <path d="M7 13V7.5M17 13V7.5" {...S} fill="none" />
      <path d="M5 8l7-4 7 4Z" fill="#C98268" {...S} />
    </>
  ),
  beehive: (
    <>
      <path d="M7.5 18.5h9l1-3h-11Z" fill="#E8BD72" {...S} />
      <path d="M6.5 15.5h11l-.8-3.2H7.3Z" fill="#FFF8EC" {...S} />
      <path d="M7.3 12.3h9.4L15 9H9Z" fill="#E8BD72" {...S} />
      <path d="M8.5 9 12 5.5 15.5 9" fill="#A9654F" {...S} />
      <circle cx="18.5" cy="7" r="1.2" fill="#403D35" />
    </>
  ),
  fruitTree: (
    <>
      <path d="M12 21v-6" stroke="#7D5F45" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="10" r="6.5" fill="#7D9B70" {...S} />
      <circle cx="9.5" cy="9" r="1.3" fill="#C98268" />
      <circle cx="14.5" cy="11.5" r="1.3" fill="#E8BD72" />
      <circle cx="12.5" cy="7" r="1.2" fill="#C98268" />
    </>
  ),
  windmill: (
    <>
      <path d="M9 21l1.2-11h3.6L15 21Z" fill="#FFF8EC" {...S} />
      <path d="M9.6 10.2 12 7l2.4 3.2Z" fill="#C98268" {...S} />
      <path d="M12 9.5 5 4.5M12 9.5l7-5M12 9.5l-5.5 6M12 9.5l5.5 6" stroke="#7D5F45" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="9.5" r="1.3" fill="#403D35" />
    </>
  ),
  greenhouse: (
    <>
      <path d="M4.5 12 12 6l7.5 6v8h-15Z" fill="#DCEBE8" {...S} />
      <path d="M12 6v14M4.5 12h15M8.2 9v11M15.8 9v11" stroke="#FFF8EC" strokeWidth="1.2" />
      <circle cx="9" cy="17" r="1.6" fill="#7D9B70" />
      <circle cx="15" cy="16.5" r="1.6" fill="#9CAF88" />
    </>
  ),
  meadow: (
    <>
      <path d="M3.5 11.5c2-2 15-2 17 0l-2 2.5-6.5 6-6.5-6Z" fill="#B79C86" {...S} />
      <path d="M3.5 11.5c3-3.2 14-3.2 17 0" fill="#A9BA8C" {...S} />
      <path d="M8 9.5l.5-2M11 9l.4-2.4M14.5 9.2l.6-2M17 10l.8-1.6" stroke="#526E58" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
  grove: (
    <>
      <path d="M3.5 14c2-2 15-2 17 0l-2 2-6.5 5-6.5-5Z" fill="#B79C86" {...S} />
      <path d="M8 13 10.5 5 13 13Z" fill="#526E58" {...S} />
      <path d="M12 13.2l2.8-9 2.8 9Z" fill="#7D9B70" {...S} />
      <path d="M5.8 13.4l1.6-4.6 1.6 4.6Z" fill="#7D9B70" {...S} />
    </>
  ),
  islet: (
    <>
      <path d="M6 13c1.5-1.6 10.5-1.6 12 0l-2 3-4 4.5-4-4.5Z" fill="#A08B86" {...S} />
      <path d="M6 13c2-2.2 10-2.2 12 0" fill="#A9BA8C" {...S} />
      <path d="M2.5 18c2 0 2-1 4-1M17.5 18c2 0 2-1 4-1" stroke="#91B7C8" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
  lighthouse: (
    <>
      <path d="M9.5 21 10.5 8h3l1 13Z" fill="#F5F0E6" {...S} />
      <path d="M10.1 13.5h3.8M9.8 17.5h4.4" stroke="#C98268" strokeWidth="2" />
      <rect x="10" y="5.5" width="4" height="2.6" fill="#F3D9A4" {...S} />
      <path d="M9.6 5.6 12 3l2.4 2.6Z" fill="#A9654F" {...S} />
      <path d="M15.5 6.8 21 5M15.5 6.8 21 8.8" stroke="#E8BD72" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  chicken: (
    <>
      <path d="M6 13.5c0-3 2.4-5 5-5 .2-2 1.4-3.4 3.2-3.4 1.6 0 2.8 1.2 2.8 2.8 0 .8-.2 1.4-.6 2 1 .9 1.6 2.2 1.6 3.6 0 3.3-2.8 5.5-6 5.5s-6-2.2-6-5.5Z" fill="#FFF8EC" {...S} />
      <path d="M17 7.6l2 .7-2 .9" fill="#E8BD72" {...S} />
      <path d="M13.3 5.3c.2-1 .8-1.6 1.6-1.8.1.8-.3 1.5-1.6 1.8Z" fill="#C9684E" {...S} />
      <circle cx="15" cy="7.4" r=".7" fill="#403D35" />
      <path d="M10.5 19v2M13 19v2" {...S} fill="none" />
    </>
  ),
  duck: (
    <>
      <path d="M4.5 14c0 3 3 5 7.5 5s7-2 7-4.5c0-1.4-1-2.2-2.6-2.2-1.6 0-2 .7-3.4.7-.6 0-1-.4-1-1 0-.8.8-1.2.8-2.4a3 3 0 0 0-5.8-.8c-.2.6-.2 1.2 0 1.8L4.5 14Z" fill="#FFF8EC" {...S} />
      <path d="M7 9.5a3 3 0 0 1 5.6-1.2" fill="#7D9B70" stroke="none" />
      <path d="M6.6 10.4 4 11l2.8.8" fill="#E8BD72" {...S} />
      <path d="M2.5 20.5c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 3-1" stroke="#91B7C8" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
  sheep: (
    <>
      <path d="M6.5 15.5a2.4 2.4 0 0 1 .4-4.6 2.6 2.6 0 0 1 4.4-2 2.6 2.6 0 0 1 4.4 1 2.4 2.4 0 0 1 1.4 4.4 2.4 2.4 0 0 1-3 2.6 2.6 2.6 0 0 1-4.4 0 2.4 2.4 0 0 1-3.2-1.4Z" fill="#F4EEE2" {...S} />
      <ellipse cx="18.2" cy="10.8" rx="2.2" ry="2.8" fill="#5E5550" {...S} />
      <path d="M9 18v2.5M13.5 18v2.5" {...S} fill="none" />
    </>
  ),
  workbench: (
    <>
      <path d="M3.5 10h17v2.4h-17Z" fill="#C29E76" {...S} />
      <path d="M5.5 12.4V20M18.5 12.4V20M5.5 16.5h13" {...S} fill="none" />
      <path d="M7.5 10V7.6h3.2V10" fill="#E2C79E" {...S} />
      <path d="M13.6 9.4l3.4-3.2" stroke="#7D5F45" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16.2 4.6l2.2 2.2-1.1 1.1-2.2-2.2Z" fill="#B5AFA3" {...S} />
    </>
  ),
  barn: (
    <>
      <path d="M4 11 12 5l8 6v9H4Z" fill="#C98268" {...S} />
      <path d="M9 20v-5.5h6V20" fill="#FFF8EC" {...S} />
      <path d="M9 14.5l6 5.5M15 14.5 9 20" stroke="#A9654F" strokeWidth="1.1" />
      <path d="M10.5 9.8h3v2.2h-3Z" fill="#FFF8EC" {...S} />
    </>
  ),
  press: (
    <>
      <path d="M5.5 20V8.5M14.5 20V8.5M4 20h12" {...S} fill="none" />
      <path d="M4 8.5h12" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <path d="M10 8.5V4.5M7.5 4.5h5" {...S} fill="none" />
      <rect x="7.5" y="12" width="5" height="4.5" rx="1" fill="#E8BD72" {...S} />
      <path d="M17.6 13h2v6.6a.8.8 0 0 1-.8.8h-.4a.8.8 0 0 1-.8-.8Z" fill="#E8BD72" {...S} />
    </>
  ),
  loom: (
    <>
      <circle cx="10" cy="11" r="6" fill="#FFF8EC" {...S} />
      <path d="M10 5v12M4 11h12M5.8 6.8l8.4 8.4M14.2 6.8l-8.4 8.4" stroke="#A9825D" strokeWidth="1" />
      <circle cx="10" cy="11" r="1.3" fill="#A9825D" {...S} />
      <path d="M10 17l-2.6 3.5M10 17l2.6 3.5M16 11l3.5 3v6" {...S} fill="none" />
      <circle cx="19" cy="9.5" r="1.8" fill="#F4EEE2" {...S} />
    </>
  ),
  wetland: (
    <>
      <path d="M3.5 13c2-2 15-2 17 0l-2 2.5-6.5 5-6.5-5Z" fill="#B79C86" {...S} />
      <path d="M3.5 13c3-2.6 14-2.6 17 0" fill="#7FA79A" {...S} />
      <path d="M8 12V6.5M10.2 12V8.2M16 12V7" stroke="#526E58" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M7.4 6.4h1.2v2.6H7.4ZM15.4 6.9h1.2v2.6h-1.2Z" fill="#7D5F45" />
      <ellipse cx="12.8" cy="12.3" rx="1.8" ry=".55" fill="#91B7C8" />
    </>
  ),
  highland: (
    <>
      <path d="M3.5 14c2-2 15-2 17 0l-2 2-6.5 5-6.5-5Z" fill="#A08B86" {...S} />
      <path d="M3.5 14 8 8l3 3.2 3.4-5.7 6.1 8.5Z" fill="#9C86A8" {...S} />
      <path d="M14.4 5.5l-1.4 2.4 1.4.6 1.3-.7Z" fill="#F5F0E6" />
      <path d="M6.5 14v-2.6l.8-.8.8.8V14" fill="#C9BFB0" {...S} />
    </>
  ),
  cottageLand: (
    <>
      <path d="M3.5 14c2-2 15-2 17 0l-2 2-6.5 5-6.5-5Z" fill="#B79C86" {...S} />
      <path d="M3.5 14c3-2.4 14-2.4 17 0" fill="#A9BA8C" {...S} />
      <path d="M4.8 13.4 6.7 7.2l1.9 6.2Z" fill="#526E58" {...S} />
      <path d="M15.6 13.4l2.1-6.8 2.1 6.8Z" fill="#7D9B70" {...S} />
      <circle cx="11.2" cy="12.5" r=".75" fill="#E7A6AE" />
      <circle cx="13.1" cy="12.9" r=".65" fill="#FBF1DA" />
    </>
  ),
  orchardLand: (
    <>
      <path d="M3.5 14c2-2 15-2 17 0l-2 2-6.5 5-6.5-5Z" fill="#B79C86" {...S} />
      <path d="M8 13.6v-3M16 13.6v-3" stroke="#7D5F45" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="8.4" r="3.3" fill="#7D9B70" {...S} />
      <circle cx="16" cy="8.4" r="3.3" fill="#9CAF88" {...S} />
      <circle cx="7" cy="7.8" r=".9" fill="#C98268" />
      <circle cx="9" cy="9.5" r=".9" fill="#E8BD72" />
      <circle cx="16.8" cy="7.5" r=".9" fill="#C98268" />
    </>
  ),
  boardwalk: (
    <>
      <path d="M2.5 17.5c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 3-1" stroke="#91B7C8" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M3 10.5h18V13H3Z" fill="#C29E76" {...S} />
      <path d="M7 10.5V13M11 10.5V13M15 10.5V13" stroke="#7D5F45" strokeWidth="1.1" />
      <path d="M5 13v3.5M19 13v3.5" {...S} fill="none" />
    </>
  ),
  lilyLantern: (
    <>
      <ellipse cx="12" cy="17.2" rx="7.5" ry="2.6" fill="#7D9B70" {...S} />
      <path d="M12 17.2l3.6-2" stroke="#526E58" strokeWidth="1.2" />
      <path d="M9.5 15.5V10a2.5 2.5 0 0 1 5 0v5.5Z" fill="#F3D9A4" {...S} />
      <circle cx="12" cy="12.4" r="1.3" fill="#E8BD72" />
      <path d="M12 7.5V5.2" {...S} fill="none" />
    </>
  ),
  goat: (
    <>
      <path d="M5.5 12.2c0-1.7 1.6-2.9 4-2.9h4.6c1.4 0 2.6 1 2.6 2.4v3c0 1.3-1 2.3-2.3 2.3H7.8c-1.3 0-2.3-1-2.3-2.3Z" fill="#F4EEE2" {...S} />
      <path d="M15.6 10.6 18 8.4c.9-.4 2 .2 2 1.2v1.7l-1.8 1.4" fill="#E7DCC8" {...S} />
      <path d="M18.4 8.3c-.2-1.6-1-2.6-2.2-3M19.5 8.6c.4-1.4.2-2.6-.6-3.6" stroke="#7D5F45" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M8.5 17v3M13.6 17v3M19.8 12.6l-.4 1.6" {...S} fill="none" />
    </>
  ),
  stoneCircle: (
    <>
      <ellipse cx="12" cy="18" rx="9" ry="2.6" fill="#A9BA8C" {...S} />
      <path d="M5 17.5v-7l1.4-1.5 1.4 1.5v7ZM10.6 16.5v-9L12 6l1.4 1.5v9ZM16.2 17.5v-7l1.4-1.5 1.4 1.5v7Z" fill="#C9BFB0" {...S} />
    </>
  ),
  gazebo: (
    <>
      <path d="M4 10 12 4l8 6Z" fill="#C98268" {...S} />
      <path d="M5.5 10v9.5M18.5 10v9.5M10 10v9.5M14 10v9.5" {...S} fill="none" />
      <path d="M4.5 19.5h15M5.5 14.5h13" stroke="#C29E76" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  hotSpring: (
    <>
      <ellipse cx="12" cy="16" rx="8" ry="3.4" fill="#C9BFB0" {...S} />
      <ellipse cx="12" cy="15.6" rx="5.8" ry="2.2" fill="#9CC6D1" {...S} />
      <path d="M9 11c-1-1.4 1-2.2 0-3.6M12 10.5c-1-1.4 1-2.2 0-3.6M15 11c-1-1.4 1-2.2 0-3.6" stroke="#91B7C8" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    </>
  ),
  observatory: (
    <>
      <path d="M6 20v-8h12v8Z" fill="#F5F0E6" {...S} />
      <path d="M5.5 12a6.5 6 0 0 1 13 0Z" fill="#91B7C8" {...S} />
      <path d="M12 9.5 16.5 5" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10.5 20v-4h3v4" fill="#A9825D" {...S} />
      <circle cx="19.5" cy="4.5" r=".9" fill="#E8BD72" />
    </>
  ),
  birdhouse: (
    <>
      <path d="M12 21v-5.5" {...S} fill="none" />
      <path d="M8.5 9.3h7v6.2h-7Z" fill="#E2C79E" {...S} />
      <path d="M7 9.8 12 5l5 4.8" fill="#C98268" {...S} />
      <circle cx="12" cy="12.2" r="1.4" fill={INK} />
    </>
  ),
  planter: (
    <>
      {leaf('M8 13c-.4-2.4.8-4 2.6-4.4.4 2-.6 3.6-2.6 4.4Z')}
      {leaf('M12.5 13c-.2-3 1.2-5 3.4-5.4.2 2.8-1 4.6-3.4 5.4Z', '#7D9B70')}
      {leaf('M11 13c-1.4-1.6-3-2-4.2-1.2 1 1.4 2.6 1.8 4.2 1.2Z')}
      <path d="M5 13h14l-1.3 6.5H6.3Z" fill="#C29E76" {...S} />
      <path d="M6 16h12" stroke="#A9825D" strokeWidth="1.1" />
    </>
  ),
  signpost: (
    <>
      <path d="M12 21V4" stroke="#7D5F45" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 5.8h6.5l2 1.8-2 1.8H12Z" fill="#E2C79E" {...S} />
      <path d="M12 11.5H6L4 13.3l2 1.8h6Z" fill="#C29E76" {...S} />
    </>
  ),
  windChime: (
    <>
      <path d="M12 3v3" {...S} fill="none" />
      <path d="M6 6h12" stroke="#7D5F45" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 6v6M11 6v8M14 6v5M17 6v7" stroke={INK} strokeWidth=".9" />
      <rect x="7.3" y="12" width="1.4" height="4.5" rx=".7" fill="#BFD7DE" {...S} />
      <rect x="10.3" y="14" width="1.4" height="4.5" rx=".7" fill="#E8BD72" {...S} />
      <rect x="13.3" y="11" width="1.4" height="4.5" rx=".7" fill="#BFD7DE" {...S} />
      <rect x="16.3" y="13" width="1.4" height="4.5" rx=".7" fill="#E8BD72" {...S} />
    </>
  ),
  picnicTable: (
    <>
      <path d="M4 9.5h16v2.2H4Z" fill="#C29E76" {...S} />
      <path d="M7.5 11.7 5.5 19M16.5 11.7l2 7.3" {...S} fill="none" />
      <path d="M3 15.2h18" stroke="#A9825D" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 9.5V8c0-.8.7-1.5 1.5-1.5h3c.8 0 1.5.7 1.5 1.5v1.5" fill="#C98268" {...S} />
    </>
  ),
  hammock: (
    <>
      <path d="M4 20V6M20 20V6" stroke="#7D5F45" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 9c4 7 12 7 16 0" fill="#91B7C8" {...S} />
      <path d="M4 9c4 4 12 4 16 0" fill="none" stroke={INK} strokeWidth="1" />
    </>
  ),
  arbour: (
    <>
      <path d="M5 21V11a7 7 0 0 1 14 0v10" fill="none" stroke="#C29E76" strokeWidth="2.2" />
      <circle cx="5.6" cy="12.5" r="1.5" fill="#C98268" {...S} />
      <circle cx="8.2" cy="6.6" r="1.5" fill="#E7B8A8" {...S} />
      <circle cx="12" cy="4.6" r="1.5" fill="#C98268" {...S} />
      <circle cx="15.8" cy="6.6" r="1.5" fill="#E7B8A8" {...S} />
      <circle cx="18.4" cy="12.5" r="1.5" fill="#C98268" {...S} />
    </>
  ),
  rowboat: (
    <>
      <path d="M2.5 18.5c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 3-1" stroke="#91B7C8" strokeWidth="1.3" strokeLinecap="round" fill="none" />
      <path d="M3 11.5h18l-2.5 4.4a2 2 0 0 1-1.8 1.1H7.3a2 2 0 0 1-1.8-1.1Z" fill="#C29E76" {...S} />
      <path d="M6 9l5 5M18 9l-5 5" stroke="#7D5F45" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  dovecote: (
    <>
      <path d="M12 21v-5" {...S} fill="none" />
      <path d="M7.5 8.5h9v7.5h-9Z" fill="#FFF8EC" {...S} />
      <path d="M6.5 8.8 12 4l5.5 4.8Z" fill="#C98268" {...S} />
      <circle cx="10" cy="11" r="1" fill={INK} />
      <circle cx="14" cy="11" r="1" fill={INK} />
      <circle cx="12" cy="14" r="1" fill={INK} />
    </>
  ),
  treehouse: (
    <>
      <path d="M12 21V11" stroke="#7D5F45" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="8" r="6.5" fill="#7D9B70" {...S} />
      <path d="M8.2 13.2h7.6V9.4H8.2Z" fill="#C29E76" {...S} />
      <path d="M7.4 9.6 12 6.4l4.6 3.2" fill="#C98268" {...S} />
      <path d="M9.2 21l.8-7.8M8.8 18h1.6M9.2 15.5h1.4" stroke="#7D5F45" strokeWidth="1" strokeLinecap="round" />
    </>
  ),
}

function Svg({ children, size, className }: { children: JSX.Element; size: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

export function CropArt({ crop, size = 28, className }: { crop: CropId; size?: number; className?: string }) {
  return <Svg size={size} className={className}>{CROP_ART[crop]}</Svg>
}

export function ItemArt({ item, size = 32, className }: { item: ItemId; size?: number; className?: string }) {
  return <Svg size={size} className={className}>{ITEM_ART[item]}</Svg>
}
