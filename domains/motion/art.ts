// Illustration library. Two families:
//   built-in generics drawn in TS (iso, grid, rings, spiral, door);
//   illustrations written as motion-v1 data: the six ported from reference A's
//   bespoke drawings (build_class6.py ART, recoloured to token names) and the
//   figures added here. Each draws itself, then holds; labels come from the slide.
import { renderMotion, type MotionV1 } from './custom.ts';
import { draw, slideTr, vis } from './smil.ts';

export const COL = [
  'var(--c2)',
  'var(--c1)',
  'var(--c3)',
  'var(--c4)',
  'var(--accent)',
  'var(--c5)',
  'var(--c2)',
  'var(--c1)',
];

// Generic illustrations for zig slides (A's isometric and geometric families),
// centred on (cx, cy). Each draws itself, then holds.
type Art = (cx: number, cy: number, D: number, labels?: string[]) => string;

const BUILTIN: Record<'iso' | 'grid' | 'rings' | 'spiral' | 'door', Art> = {
  iso: (cx, cy, D) =>
    [0, 1, 2]
      .map((k) => {
        const y = cy + 120 - k * 90;
        const t = 0.06 + k * 0.14;
        return `<g opacity="0">${vis(t, 1, D)}<path d="M${cx} ${y + 60} L${cx + 180} ${y} L${cx} ${y - 60} L${cx - 180} ${y} Z" fill="${COL[k + 1]}" fill-opacity=".35" stroke="${COL[k + 1]}" stroke-width="3">${slideTr(
          [
            [0, '0 22'],
            [t, '0 22'],
            [t + 0.08, '0 0'],
            [1, '0 0'],
          ],
          D,
        )}</path></g>`;
      })
      .join(''),
  grid: (cx, cy, D) => {
    const lines = [-2, -1, 0, 1, 2]
      .map(
        (k, i) =>
          `<path d="M${cx - 200} ${cy + k * 70} H${cx + 200} M${cx + k * 70} ${cy - 200} V${cy + 200}" pathLength="1" stroke-dasharray="1" stroke="var(--c2)" stroke-width="2" fill="none">${draw(D, 0.3 + i * 0.05, 0.5 + i * 0.05)}</path>`,
      )
      .join('');
    return `<path d="M${cx - 150} ${cy} C${cx - 150} ${cy - 160} ${cx + 170} ${cy - 120} ${cx + 140} ${cy + 20} S${cx - 60} ${cy + 190} ${cx - 150} ${cy}" pathLength="1" stroke-dasharray="1" fill="none" stroke="var(--accent)" stroke-width="3" opacity=".6">${draw(D, 0.02, 0.3)}</path>${lines}<circle cx="${cx}" cy="${cy}" r="9" fill="var(--c4)" opacity="0">${vis(0.62, 1, D)}</circle>`;
  },
  rings: (cx, cy, D) =>
    [200, 140, 80]
      .map(
        (r, k) =>
          `<circle cx="${cx}" cy="${cy}" r="${r}" pathLength="1" stroke-dasharray="1" fill="none" stroke="${COL[k + 1]}" stroke-width="3">${draw(D, 0.04 + k * 0.1, 0.2 + k * 0.1)}</circle>`,
      )
      .join('') +
    `<path d="M${cx - 10} ${cy - 60} L${cx + 12} ${cy - 10} L${cx - 8} ${cy + 20} L${cx + 10} ${cy + 64}" pathLength="1" stroke-dasharray="1" fill="none" stroke="var(--accent)" stroke-width="4">${draw(D, 0.5, 0.64)}</path>`,
  spiral: (cx, cy, D) => {
    let d = `M${cx} ${cy}`;
    for (let a = 0; a < 5.2 * Math.PI; a += 0.3)
      d += ` L${(cx + 12 * a * Math.cos(a)).toFixed(1)} ${(cy + 12 * a * Math.sin(a)).toFixed(1)}`;
    return `<path d="${d}" pathLength="1" stroke-dasharray="1" fill="none" stroke="var(--c2)" stroke-width="3">${draw(D, 0.02, 0.6)}</path><line x1="${cx + 220}" y1="${cy - 210}" x2="${cx + 220}" y2="${cy + 210}" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>`;
  },
  door: (cx, cy, D) => {
    const cells = (side: -1 | 1) =>
      [0, 1, 2, 3]
        .flatMap((r) =>
          [0, 1].map(
            (c) =>
              `<rect x="${cx + (side < 0 ? -200 + c * 100 : c * 100)}" y="${cy - 200 + r * 100}" width="92" height="92" rx="10" fill="var(--card)" stroke="var(--c2)" stroke-width="2"/>`,
          ),
        )
        .join('');
    return (
      `<rect x="${cx - 40}" y="${cy - 200}" width="80" height="400" fill="var(--accent)" opacity=".25"/>` +
      `<g>${cells(-1)}${slideTr(
        [
          [0, '0 0'],
          [0.2, '0 0'],
          [0.4, '-90 0'],
          [0.95, '-90 0'],
          [1, '0 0'],
        ],
        D,
      )}</g>` +
      `<g>${cells(1)}${slideTr(
        [
          [0, '0 0'],
          [0.2, '0 0'],
          [0.4, '90 0'],
          [0.95, '90 0'],
          [1, '0 0'],
        ],
        D,
      )}</g>`
    );
  },
};

type Els = MotionV1['elements'];
type Keys = [number, number][];

// Reference A's CSS timings on a 12 s loop: draw (d1 0 s, d2 .55 s, d3 .85 s), pop, lift.
const D1: [number, number] = [0.02, 0.2];
const D2: [number, number] = [0.07, 0.25];
const D3: [number, number] = [0.1, 0.28];
const appear = (a: number): Keys => [
  [0, 0],
  [a, 0],
  [a + 0.05, 1],
  [0.96, 1],
  [1, 0],
];
const pop = (a = 0.3) => ({
  op: appear(a),
  scale: [
    [0, 0.7],
    [a, 0.7],
    [a + 0.05, 1],
    [1, 1],
  ] as Keys,
});
const lift = (a: number) => ({
  op: appear(a),
  move: [
    [0, 0, 22],
    [a, 0, 22],
    [a + 0.07, 0, 0],
    [1, 0, 0],
  ] as [number, number, number][],
});
const bob = (dy: number): [number, number, number][] => [
  [0, 0, 0],
  [0.25, 0, -dy],
  [0.5, 0, 0],
  [0.75, 0, -dy],
  [1, 0, 0],
];
const label = (labels: string[], i: number, x: number, y: number, fill: 'white' | 'accent') =>
  labels[i]
    ? [
        {
          type: 'text' as const,
          x,
          y,
          text: labels[i]!,
          size: 13,
          anchor: 'middle' as const,
          bold: true,
          fill,
        },
      ]
    : [];

// Illustrations drawn in a 320×300 box (A's viewBox), placed and scaled by the caller.
const DATA: Record<string, (labels: string[]) => Els> = {
  // A · geo-precision: a vague shape resolves into a precise grid.
  precision: () => [
    {
      type: 'path',
      d: 'M30 150 C 60 60, 150 40, 200 70 S 300 150, 250 210 S 90 250, 30 150 Z',
      stroke: 'c3',
      width: 1.4,
      opacity: 0.55,
      draw: D1,
    },
    {
      type: 'group',
      stroke: 'c2',
      width: 1.6,
      draw: D2,
      children: [
        { type: 'rect', x: 96, y: 86, w: 128, h: 128, rx: 4 },
        { type: 'path', d: 'M96 118h128M96 150h128M96 182h128M128 86v128M160 86v128M192 86v128' },
      ],
    },
    { type: 'circle', cx: 160, cy: 150, r: 7, fill: 'accent', origin: [160, 150], ...pop() },
  ],
  // A · geo-lupa: three concentric circles reveal a crack at the centre.
  magnifier: () => [
    { type: 'circle', cx: 160, cy: 150, r: 110, stroke: 'c2', width: 1.5, draw: D1 },
    { type: 'circle', cx: 160, cy: 150, r: 76, stroke: 'c2', width: 1.5, draw: D2 },
    { type: 'circle', cx: 160, cy: 150, r: 42, stroke: 'c2', width: 1.5, draw: D3 },
    {
      type: 'path',
      d: 'M150 126 l14 22 -12 8 16 26',
      stroke: 'accent',
      width: 3.4,
      origin: [160, 150],
      ...pop(),
    },
  ],
  // A · geo-presupuesto: a spiral that stops at a marked edge.
  budget: () => [
    {
      type: 'path',
      d: 'M160 150 m0 -14 a14 14 0 1 1 -14 14 a28 28 0 1 1 28 28 a42 42 0 1 1 -42 -42 a56 56 0 1 1 56 56 a70 70 0 1 1 -70 -70',
      stroke: 'c3',
      width: 1.6,
      draw: D1,
    },
    {
      type: 'group',
      origin: [258, 150],
      ...pop(),
      children: [
        { type: 'line', x1: 258, y1: 52, x2: 258, y2: 248, stroke: 'accent', width: 3.2 },
        { type: 'circle', cx: 258, cy: 150, r: 6, fill: 'accent' },
      ],
    },
  ],
  // A · geo-puerta: a grid that opens and carries on past the edge.
  gateway: () => [
    {
      type: 'group',
      stroke: 'c2',
      width: 1.5,
      draw: D1,
      children: [
        { type: 'path', d: 'M40 60h100v180H40z' },
        { type: 'path', d: 'M40 105h100M40 150h100M40 195h100M90 60v180' },
      ],
    },
    {
      type: 'group',
      stroke: 'c3',
      width: 1.5,
      opacity: 0.8,
      draw: D2,
      skewY: -7,
      y: 20,
      children: [
        { type: 'path', d: 'M180 60h100v180H180z' },
        { type: 'path', d: 'M180 105h100M180 150h100M180 195h100' },
      ],
    },
    {
      type: 'path',
      d: 'M146 150h26m-8 -8 8 8 -8 8',
      stroke: 'accent',
      width: 2.6,
      origin: [160, 150],
      ...pop(),
    },
  ],
  // A · iso-proceso: layers of a process, observe and decide below, build on top.
  layers: (l) => [
    {
      type: 'group',
      ...lift(0.04),
      children: [
        {
          type: 'path',
          d: 'M160 212 L262 158 L160 104 L58 158 Z',
          fill: 'c2',
          stroke: 'c2',
          width: 1.4,
          opacity: 0.35,
        },
        ...label(l, 0, 160, 168, 'white'),
      ],
    },
    {
      type: 'group',
      ...lift(0.11),
      children: [
        {
          type: 'path',
          d: 'M160 162 L262 108 L160 54 L58 108 Z',
          fill: 'c3',
          stroke: 'c3',
          width: 1.4,
          opacity: 0.35,
        },
        ...label(l, 1, 160, 118, 'white'),
      ],
    },
    {
      type: 'group',
      ...lift(0.18),
      children: [
        {
          type: 'path',
          d: 'M160 112 L262 58 L160 4 L58 58 Z',
          fill: 'accent',
          stroke: 'accent',
          width: 1.4,
          opacity: 0.35,
        },
        ...label(l, 2, 160, 68, 'accent'),
      ],
    },
  ],
  // A · iso-migracion: three loose files regroup into the layers of a deployed system.
  migration: () => [
    {
      type: 'group',
      stroke: 'muted',
      width: 1.3,
      opacity: 0.65,
      draw: D1,
      children: [
        { type: 'rect', x: 26, y: 56, w: 46, h: 58, rx: 3 },
        { type: 'rect', x: 26, y: 126, w: 46, h: 58, rx: 3 },
        { type: 'rect', x: 26, y: 196, w: 46, h: 58, rx: 3 },
      ],
    },
    {
      type: 'path',
      d: 'M92 155h34m-11 -9 11 9 -11 9',
      stroke: 'accent',
      width: 2.4,
      origin: [109, 155],
      ...pop(),
    },
    {
      type: 'path',
      d: 'M222 222 L300 180 L222 138 L144 180 Z',
      fill: 'c2',
      stroke: 'c2',
      width: 1.4,
      opacity: 0.3,
      ...lift(0.04),
    },
    {
      type: 'path',
      d: 'M222 180 L300 138 L222 96 L144 138 Z',
      fill: 'c2',
      stroke: 'c2',
      width: 1.4,
      opacity: 0.4,
      ...lift(0.11),
    },
    {
      type: 'group',
      ...lift(0.18),
      children: [
        {
          type: 'path',
          d: 'M222 138 L300 96 L222 54 L144 96 Z',
          fill: 'c3',
          stroke: 'c3',
          width: 1.4,
          opacity: 0.5,
        },
        { type: 'circle', cx: 222, cy: 96, r: 7, fill: 'accent' },
      ],
    },
  ],

  // ---- figures added in the successor
  // A team: three people linked, the links draw, a shared token pulses at the centre.
  team: (l) => [
    { type: 'path', d: 'M80 200 L160 90 L240 200 Z', stroke: 'c2', width: 2, opacity: 0.6, draw: D1 },
    { type: 'person', x: 160, y: 100, s: 1.1, fill: 'c4', ...lift(0.1) },
    { type: 'person', x: 80, y: 210, s: 1.1, fill: 'c2', ...lift(0.16) },
    { type: 'person', x: 240, y: 210, s: 1.1, fill: 'c3', ...lift(0.22) },
    {
      type: 'circle',
      cx: 160,
      cy: 168,
      r: 12,
      fill: 'accent',
      origin: [160, 168],
      op: appear(0.3),
      scale: [
        [0, 1],
        [0.4, 1],
        [0.5, 1.3],
        [0.6, 1],
        [0.8, 1.3],
        [0.9, 1],
        [1, 1],
      ],
    },
    ...label(l, 0, 160, 290, 'accent'),
  ],
  // An isometric desk: a slab, two screens whose lines type themselves.
  office: () => [
    {
      type: 'path',
      d: 'M160 250 L290 185 L160 120 L30 185 Z',
      fill: 'card',
      stroke: 'c2',
      width: 1.6,
      ...lift(0.03),
    },
    {
      type: 'group',
      ...lift(0.1),
      children: [
        {
          type: 'path',
          d: 'M95 170 L95 90 L160 58 L160 138 Z',
          fill: 'c2',
          stroke: 'c2',
          width: 1.4,
          opacity: 0.9,
        },
        {
          type: 'path',
          d: 'M107 150 L148 130 M107 134 L148 114 M107 118 L140 102',
          stroke: 'c4',
          width: 3,
          draw: [0.2, 0.4],
        },
      ],
    },
    {
      type: 'group',
      ...lift(0.17),
      children: [
        {
          type: 'path',
          d: 'M170 138 L170 58 L235 90 L235 170 Z',
          fill: 'c2',
          stroke: 'c2',
          width: 1.4,
          opacity: 0.9,
        },
        {
          type: 'path',
          d: 'M182 102 L223 122 M182 118 L223 138 M182 134 L212 149',
          stroke: 'accent',
          width: 3,
          draw: [0.3, 0.5],
        },
      ],
    },
  ],
  // A dashboard: a panel, bars that rise (decorative, no figures), a trend line that draws.
  dashboard: () => [
    { type: 'rect', x: 30, y: 40, w: 260, h: 220, rx: 14, fill: 'card', stroke: 'c2', width: 1.6, draw: D1 },
    ...[0, 1, 2, 3, 4].map((i) => ({
      type: 'rect' as const,
      x: 56 + i * 42,
      y: 230 - (40 + i * 22),
      w: 26,
      h: 40 + i * 22,
      rx: 4,
      fill: (i === 4 ? 'accent' : 'c2') as 'accent' | 'c2',
      origin: [69 + i * 42, 230] as [number, number],
      op: appear(0.1 + i * 0.04),
      scale: [
        [0, 0.01],
        [0.1 + i * 0.04, 0.01],
        [0.18 + i * 0.04, 1],
        [1, 1],
      ] as Keys,
    })),
    {
      type: 'path',
      d: 'M56 150 L98 130 L140 138 L182 100 L224 84 L262 60',
      stroke: 'c4',
      width: 3,
      draw: [0.35, 0.55],
    },
    { type: 'circle', cx: 262, cy: 60, r: 6, fill: 'c4', op: appear(0.55) },
  ],
  // A factory line: boxes ride a conveyor, two cogs turn.
  factory: () => [
    { type: 'line', x1: 20, y1: 230, x2: 300, y2: 230, stroke: 'c2', width: 3, draw: D1 },
    {
      type: 'icon',
      name: 'cog',
      x: 90,
      y: 110,
      size: 110,
      stroke: 'c2',
      origin: [90, 110],
      rotate: [
        [0, 0],
        [1, 360],
      ],
    },
    {
      type: 'icon',
      name: 'cog',
      x: 200,
      y: 140,
      size: 80,
      stroke: 'accent',
      origin: [200, 140],
      rotate: [
        [0, 360],
        [1, 0],
      ],
    },
    ...[0, 1, 2].map((i) => ({
      type: 'rect' as const,
      x: -10,
      y: 200,
      w: 30,
      h: 30,
      rx: 4,
      fill: (['c2', 'c3', 'accent'] as const)[i]!,
      move: [
        [0, i * 110, 0],
        [1, i * 110 + 110, 0],
      ] as [number, number, number][],
    })),
  ],
  // Security: a shield draws itself, rings pulse outward.
  shield: () => [
    {
      type: 'circle',
      cx: 160,
      cy: 150,
      r: 120,
      stroke: 'c2',
      width: 1.2,
      opacity: 0.5,
      origin: [160, 150],
      scale: [
        [0, 0.8],
        [0.5, 1.05],
        [1, 0.8],
      ],
      op: [
        [0, 0.6],
        [0.5, 0.1],
        [1, 0.6],
      ],
    },
    { type: 'icon', name: 'shield-check', x: 160, y: 150, size: 200, stroke: 'accent', draw: [0.04, 0.3] },
  ],
  // Launch: a rocket bobs, its trail draws and fades.
  rocket: () => [
    {
      type: 'path',
      d: 'M70 250 L130 190 M40 230 L110 160 M100 280 L150 230',
      stroke: 'c2',
      width: 3,
      opacity: 0.7,
      draw: [0.1, 0.3],
    },
    {
      type: 'icon',
      name: 'rocket',
      x: 180,
      y: 120,
      size: 190,
      stroke: 'accent',
      draw: [0.02, 0.2],
      move: bob(10),
    },
    { type: 'icon', name: 'sparkles', x: 60, y: 60, size: 50, stroke: 'c4', op: appear(0.3) },
  ],
  // A route: a map draws, a dashed path crosses it, the pin drops.
  map: () => [
    { type: 'icon', name: 'map', x: 160, y: 160, size: 250, stroke: 'c2', draw: D1 },
    { type: 'path', d: 'M70 220 C 120 120, 200 240, 250 90', stroke: 'accent', width: 3, draw: [0.25, 0.5] },
    {
      type: 'icon',
      name: 'map-pin',
      x: 250,
      y: 70,
      size: 60,
      stroke: 'accent',
      op: appear(0.5),
      move: [
        [0, 0, -40],
        [0.5, 0, -40],
        [0.56, 0, 0],
        [1, 0, 0],
      ],
    },
  ],
  // An idea: a bulb draws, rays pop around it.
  bulb: () => [
    { type: 'icon', name: 'lightbulb', x: 160, y: 160, size: 190, stroke: 'accent', draw: [0.02, 0.25] },
    ...[0, 1, 2, 3, 4].map((i) => {
      const a = ((-150 + i * 30) * Math.PI) / 180;
      return {
        type: 'line' as const,
        x1: +(160 + 110 * Math.cos(a)).toFixed(1),
        y1: +(150 + 110 * Math.sin(a)).toFixed(1),
        x2: +(160 + 140 * Math.cos(a)).toFixed(1),
        y2: +(150 + 140 * Math.sin(a)).toFixed(1),
        stroke: 'c4' as const,
        width: 4,
        op: appear(0.3 + i * 0.03),
      };
    }),
  ],
};

const fromData =
  (els: (labels: string[]) => Els, k = 1.5): Art =>
  (cx, cy, D, labels = []) =>
    renderMotion({
      dur: D,
      freeze: 0.9,
      elements: [{ type: 'group', x: cx - 160 * k, y: cy - 150 * k, k, children: els(labels) }],
    });

export const ARTS = [
  'iso',
  'grid',
  'rings',
  'spiral',
  'door',
  'precision',
  'magnifier',
  'budget',
  'gateway',
  'layers',
  'migration',
  'team',
  'office',
  'dashboard',
  'factory',
  'shield',
  'rocket',
  'map',
  'bulb',
] as const;
export type ArtName = (typeof ARTS)[number];

export const ART: Record<ArtName, Art> = {
  ...BUILTIN,
  ...(Object.fromEntries(Object.entries(DATA).map(([k, v]) => [k, fromData(v)])) as Record<
    Exclude<ArtName, keyof typeof BUILTIN>,
    Art
  >),
};

// The data illustrations, exposed so the gate can hold them to the motion-v1 rules.
export const ART_DATA = DATA;
