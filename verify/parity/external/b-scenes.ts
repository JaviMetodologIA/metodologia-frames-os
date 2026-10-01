// Reference B's stage scenes (ai-native-sdlc/class/immersive.py: sc_fila … sc_close),
// written as motion-v1 data with the same coordinates and timings. They prove the DSL
// can express a bespoke deck without touching the renderer. Content (labels, sample
// commands) is B's own; this file only builds the reconstruction, never the product.
import type { MotionV1 } from '../../../domains/motion/custom.ts';

type E = MotionV1['elements'][number];
type C = NonNullable<Extract<E, { type: 'rect' }>['fill']>;
type K = [number, number][];

const STAGE: C[] = ['c2', 'c1', 'c3', 'c4', 'accent', 'c5'];

// Visible between fractions a and b of the loop, with a short fade (B's vis()).
const vis = (a: number, b: number, f = 0.025): K =>
  b >= 0.96
    ? [
        [0, 0],
        [a, 0],
        [a + f, 1],
        [0.96, 1],
        [1, 0],
      ]
    : [
        [0, 0],
        [a, 0],
        [a + f, 1],
        [b, 1],
        [b + f, 0],
        [1, 0],
      ];
const at = (x: number, y: number) => [0, x, y] as [number, number, number];

const T = (
  x: number,
  y: number,
  text: string,
  size: number,
  o: { fill?: C; bold?: boolean; mid?: boolean; mono?: boolean } = {},
): E => ({
  type: 'text',
  x,
  y,
  text,
  size,
  ...(o.fill ? { fill: o.fill } : {}),
  ...(o.bold ? { bold: true } : {}),
  ...(o.mid ? { anchor: 'middle' as const } : {}),
  ...(o.mono ? { mono: true } : {}),
});
const glow = (cx: number, cy: number, r: number, opacity: number): E => ({
  type: 'glow',
  cx,
  cy,
  r,
  fill: 'brand',
  opacity,
});
const show = (op: K, children: E[], extra: Partial<Extract<E, { type: 'group' }>> = {}): E => ({
  type: 'group',
  op,
  children,
  ...extra,
});
const doc = (x: number, y: number, w: number, h: number, title: string, lines = 4, accent: C = 'c2'): E => ({
  type: 'group',
  children: [
    { type: 'rect', x, y, w, h, rx: 14, fill: 'card', stroke: 'line', width: 2 },
    ...(title ? [T(x + 18, y + 36, title, 19, { bold: true })] : []),
    ...Array.from({ length: lines }, (_, i): E => ({
      type: 'rect',
      x: x + 18,
      y: y + 58 + i * 26,
      w: Math.round((w - 36) * (i % 2 ? 0.62 : 0.9)),
      h: 9,
      rx: 4,
      fill: accent,
      opacity: 0.55,
    })),
  ],
});
const check = (x: number, y: number, k = 1): E => ({
  type: 'group',
  x,
  y,
  k,
  children: [{ type: 'path', d: 'M-10 0 L-3 8 L11 -9', stroke: 'ok', width: 5 }],
});
const spark = (x: number, y: number, k = 1): E => ({
  type: 'group',
  x,
  y,
  k,
  children: [
    {
      type: 'path',
      d: 'M0 -18 C3 -5 5 -3 18 0 C5 3 3 5 0 18 C-3 5 -5 3 -18 0 C-5 -3 -3 -5 0 -18Z',
      fill: 'c4',
    },
  ],
});
const token = (color: C, r: number, along: { d: string; keys: K }): E => ({
  type: 'group',
  along,
  children: [
    { type: 'glow', cx: 0, cy: 0, r: r * 2.4, fill: color, opacity: 0.9 },
    { type: 'circle', cx: 0, cy: 0, r, fill: color },
  ],
});

// A token that starts `phase` of the way along its loop (B's begin="-k·D/3").
const phased = (p: number): K =>
  p
    ? [
        [0, p],
        [1 - p, 1],
        [1 - p + 0.001, 0],
        [1, p],
      ]
    : [
        [0, 0],
        [1, 1],
      ];

const fila = (): MotionV1 => ({
  dur: 10,
  freeze: 0.9,
  elements: [
    glow(1180, 480, 400, 0.5),
    ...(
      [
        [870, 'Requisitos', 'card'],
        [1110, 'Build', 'c1'],
        [1350, 'Review', 'card'],
      ] as const
    ).flatMap(([x, lbl, f]): E[] => [
      { type: 'rect', x: x - 80, y: 400, w: 160, h: 120, rx: 20, fill: f, stroke: 'line', width: 2 },
      T(x, 470, lbl, 22, { bold: true, mid: true }),
    ]),
    {
      type: 'circle',
      cx: 1110,
      cy: 370,
      r: 20,
      stroke: 'c4',
      width: 6,
      dash: '8 6',
      origin: [1110, 370],
      rotate: [
        [0, 0],
        [1, 3000],
      ],
    },
    T(1110, 560, 'rápido', 18, { fill: 'c4', bold: true, mid: true }),
    ...[0, 1, 2, 3, 4].flatMap((k): E[] => [
      {
        type: 'rect',
        x: 830,
        y: 590 + k * 30,
        w: 80,
        h: 22,
        rx: 6,
        fill: 'c2',
        op: vis(0.05 + k * 0.12, 0.95),
      },
      {
        type: 'rect',
        x: 1310,
        y: 590 + k * 30,
        w: 80,
        h: 22,
        rx: 6,
        fill: 'accent',
        op: vis(0.12 + k * 0.12, 0.95),
      },
    ]),
    ...[0, 1, 2, 3].map((k): E => {
      const t0 = 0.06 + k * 0.18;
      return show(
        vis(t0, t0 + 0.08, 0.01),
        [{ type: 'rect', x: -18, y: -12, w: 36, h: 24, rx: 5, fill: 'c4' }],
        {
          move: [at(950, 460), [t0, 950, 460], [t0 + 0.08, 1270, 460], [1, 1270, 460]],
        },
      );
    }),
    T(870, 760, 'esperan', 18, { fill: 'c2', mid: true }),
    T(1350, 760, 'esperan', 18, { fill: 'accent', mid: true }),
  ],
});

const plan = (): MotionV1 => ({
  dur: 11,
  freeze: 0.9,
  elements: [
    glow(1180, 450, 420, 0.55),
    ...(
      [
        [880, 250, '¿Qué duele hoy?', 'c'],
        [1140, 330, 'Registrar gastos toma mucho', 'p'],
        [880, 410, '¿Qué sería éxito?', 'c'],
        [1140, 490, '≤ 2 clics', 'p'],
      ] as const
    ).map(([x, y, txt, who], k) =>
      show(vis(0.03 + k * 0.1, 0.95), [
        {
          type: 'rect',
          x,
          y,
          w: 300,
          h: 58,
          rx: 18,
          fill: who === 'c' ? 'c1' : 'card',
          stroke: 'line',
          width: 1.5,
        },
        T(x + 22, y + 37, txt, 19),
        who === 'c'
          ? spark(x - 26, y + 29, 0.8)
          : { type: 'person', x: x + 330, y: y + 52, s: 0.55, fill: 'c2' },
      ]),
    ),
    show(vis(0.45, 0.95), [doc(1000, 590, 300, 220, 'intent.md', 0)]),
    ...[240, 180, 220, 150, 200].map((w, k): E => ({
      type: 'rect',
      x: 1022,
      y: 655 + k * 26,
      w,
      h: 10,
      rx: 5,
      fill: 'c2',
      op: vis(0.5 + k * 0.05, 0.95),
    })),
    show(vis(0.8, 0.95), [
      { type: 'rect', x: 1180, y: 600, w: 120, h: 36, rx: 18, fill: 'ok' },
      T(1240, 624, 'aprobado', 17, { fill: 'ink', bold: true, mid: true }),
    ]),
  ],
});

const design = (): MotionV1 => ({
  dur: 11,
  freeze: 0.9,
  elements: [
    glow(1180, 470, 420, 0.55),
    doc(860, 360, 160, 200, 'intent.md'),
    { type: 'path', d: 'M1030 460 H1110', stroke: 'c2', width: 4, arrow: true },
    doc(1130, 330, 260, 300, 'spec.md', 0),
    ...(
      [
        ['marca', 'c2'],
        ['seguridad', 'c3'],
        ['cumplimiento', 'c4'],
      ] as const
    ).flatMap(([s, c], k): E[] => {
      const t0 = 0.06 + k * 0.12;
      return [
        show(
          vis(t0, 0.95),
          [
            { type: 'rect', x: -70, y: -20, w: 140, h: 40, rx: 20, fill: c },
            T(0, 7, s, 18, { fill: 'ink', bold: true, mid: true }),
          ],
          {
            move: [
              at(960 + k * 170, 200),
              [t0, 960 + k * 170, 200],
              [t0 + 0.1, 1260, 400 + k * 58],
              [1, 1260, 400 + k * 58],
            ],
          },
        ),
        show(vis(t0 + 0.1, 0.95), [check(1362, 400 + k * 58, 0.9)]),
      ];
    }),
    show(vis(0.5, 0.74), [
      { type: 'rect', x: 1152, y: 570, w: 216, h: 40, rx: 10, fill: 'accent' },
      T(1166, 597, '⚑ preocupación', 18, { fill: 'ink', bold: true }),
    ]),
    show(vis(0.76, 0.95), [
      { type: 'rect', x: 1152, y: 570, w: 216, h: 40, rx: 10, fill: 'ok' },
      T(1166, 597, 'resuelta con su dueño', 17, { fill: 'ink', bold: true }),
    ]),
  ],
});

const build = (): MotionV1 => ({
  dur: 12,
  freeze: 0.92,
  elements: [
    glow(1180, 470, 430, 0.55),
    ...[0, 1, 2].map((k) =>
      show(vis(0.02 + k * 0.07, 0.95), [
        { type: 'circle', cx: 880 + k * 70, cy: 220, r: 26, fill: 'c1' },
        T(880 + k * 70, 230, '?', 28, { bold: true, mid: true }),
      ]),
    ),
    T(1100, 228, 'plan mode: el agente pregunta', 20, { fill: 'muted' }),
    doc(860, 290, 620, 210, 'plan.md', 0),
    ...['Test de aceptación en rojo', 'Unit test en rojo', 'Código mínimo', 'Refactor en verde'].flatMap(
      (item, k): E[] => [
        { type: 'rect', x: 884, y: 346 + k * 36, w: 22, h: 22, rx: 5, stroke: 'c2', width: 2.5 },
        T(922, 364 + k * 36, item, 19),
        show(vis(0.25 + k * 0.06, 0.95), [check(895, 357 + k * 36, 0.8)]),
      ],
    ),
    ...(
      [
        ['worktree A · dominio', 0.9, 'c3'],
        ['worktree B · pantalla', 0.7, 'c4'],
        ['worktree C · docs', 0.8, 'c2'],
      ] as const
    ).flatMap(([lbl, reach, c], k): E[] => {
      const y = 560 + k * 80;
      const w = 620 * reach;
      return [
        T(860, y - 10, lbl, 17, { fill: 'muted' }),
        { type: 'rect', x: 860, y, w: 620, h: 22, rx: 11, fill: 'dim', stroke: 'line', width: 1 },
        {
          type: 'rect',
          x: 860,
          y,
          w,
          h: 22,
          rx: 11,
          fill: c,
          attr: {
            name: 'width',
            keys: [
              [0, 0],
              [0.5, 0],
              [0.5 + 0.35 * reach, w],
              [0.95, w],
              [1, 0],
            ],
          },
        },
      ];
    }),
  ],
});

// B types "$ make check" through a growing clip; here each glyph appears in turn.
const typed = (x: number, y: number, s: string, size: number, a: number, b: number): E[] =>
  [...s].flatMap((ch, i): E[] =>
    ch === ' '
      ? []
      : [
          {
            ...T(x + i * size * 0.6, y, ch, size, { fill: 'c4', mono: true }),
            op: vis(a + ((b - a) * i) / s.length, 0.96, 0.001),
          } as E,
        ],
  );

const test = (): MotionV1 => ({
  dur: 11,
  freeze: 0.9,
  elements: [
    glow(1180, 470, 420, 0.55),
    {
      type: 'rect',
      x: 860,
      y: 220,
      w: 620,
      h: 440,
      rx: 18,
      fill: 'ink',
      opacity: 0.55,
      stroke: 'line',
      width: 2,
    },
    { type: 'circle', cx: 890, cy: 248, r: 7, fill: 'c5' },
    { type: 'circle', cx: 914, cy: 248, r: 7, fill: 'c4' },
    { type: 'circle', cx: 938, cy: 248, r: 7, fill: 'c2' },
    ...typed(892, 306, '$ make check', 26, 0.02, 0.14),
    ...[
      'AC-001.1 pagado en 1 clic',
      'AC-001.3 gasto en 2 clics',
      'AC-001.4 total al centavo',
      'AC-002.1 día 31 en febrero',
      'evals: trazabilidad',
    ].map((name, k) => {
      const y = 360 + k * 52;
      return show(vis(0.18 + k * 0.04, 0.95), [
        { type: 'circle', cx: 900, cy: y, r: 11, fill: 'c5' },
        { type: 'circle', cx: 900, cy: y, r: 11, fill: 'ok', op: vis(0.45 + k * 0.07, 0.95, 0.01) },
        T(926, y + 7, name, 20, { mono: true }),
      ]);
    }),
    show(vis(0.82, 0.95), [
      { type: 'rect', x: 1210, y: 600, w: 240, h: 44, rx: 22, fill: 'ok' },
      T(1330, 629, 'check OK', 20, { fill: 'ink', bold: true, mid: true }),
    ]),
    show(vis(0.82, 0.95), [spark(1180, 622, 0.9)]),
  ],
});

const deploy = (): MotionV1 => ({
  dur: 13,
  freeze: 0.9,
  elements: [
    glow(1180, 470, 430, 0.55),
    doc(860, 150, 300, 200, 'PR #42'),
    {
      type: 'rect',
      x: 860,
      y: 150,
      w: 300,
      h: 6,
      fill: 'c4',
      opacity: 0.9,
      move: [at(0, 0), [0.02, 0, 0], [0.22, 0, 194], [0.24, 0, 0], [1, 0, 0]],
    },
    ...(
      [
        ['Alta', 'c5'],
        ['Media', 'c3'],
        ['Nit', 'c2'],
      ] as const
    ).map(([lbl, c], k) =>
      show(vis(0.08 + k * 0.06, 0.95), [
        { type: 'rect', x: 1190, y: 170 + k * 56, w: 130, h: 40, rx: 20, fill: c },
        T(1255, 197 + k * 56, lbl, 18, { fill: 'ink', bold: true, mid: true }),
      ]),
    ),
    T(1340, 230, 'REVIEW.md', 18, { fill: 'muted' }),
    { type: 'line', x1: 860, y1: 560, x2: 1500, y2: 560, stroke: 'line', width: 4 },
    ...(
      [
        [930, 'DEV', 'libre'],
        [1170, 'STAGING', 'pregunta'],
        [1410, 'PROD', 'gate humano'],
      ] as const
    ).flatMap(([x, lbl, sub]): E[] => [
      { type: 'rect', x: x - 6, y: 500, w: 12, h: 120, rx: 6, fill: 'c2', opacity: 0.7 },
      T(x, 660, lbl, 20, { bold: true, mid: true }),
      T(x, 688, sub, 16, { fill: 'muted', mid: true }),
    ]),
    show(vis(0.46, 0.56), [
      { type: 'circle', cx: 1170, cy: 470, r: 22, fill: 'c3' },
      T(1170, 479, '?', 24, { fill: 'ink', bold: true, mid: true }),
    ]),
    show(vis(0.52, 0.58), [check(1170, 470, 1.2)]),
    { type: 'rect', x: 1386, y: 455, w: 48, h: 40, rx: 8, fill: 'accent' },
    {
      type: 'path',
      d: 'M1396 457 v-12 a14 14 0 0 1 28 0 v12',
      stroke: 'accent',
      width: 6,
      move: [at(0, 0), [0.8, 0, 0], [0.84, 0, -12], [0.95, 0, -12], [1, 0, 0]],
    },
    show(vis(0.72, 0.95), [
      { type: 'person', x: 1470, y: 490, s: 0.7, fill: 'c4' },
      T(1440, 420, 'autorización', 16, { fill: 'c4' }),
    ]),
    token('c4', 12, {
      d: 'M860 560 H1500',
      keys: [
        [0, 0],
        [0.3, 0],
        [0.4, 0.48],
        [0.56, 0.48],
        [0.66, 0.8],
        [0.84, 0.8],
        [0.94, 1],
        [1, 1],
      ],
    }),
  ],
});

const maintain = (): MotionV1 => {
  const [x0, x1, yc, s] = [860, 1470, 500, 72];
  const ys = [0, -0.4, 0.3, -0.2, 0.5, -0.3, 0.1, 0.6, -0.1, 0.4, 1.3, 2.3, 1.6];
  const pts = ys.map((v, i) => [x0 + 20 + i * ((x1 - x0 - 40) / (ys.length - 1)), yc - v * s] as const);
  const [bx, by] = pts[11]!;
  return {
    dur: 12,
    freeze: 0.9,
    elements: [
      glow(1180, 470, 420, 0.5),
      { type: 'rect', x: x0, y: yc - s, w: x1 - x0, h: 2 * s, fill: 'c2', opacity: 0.12 },
      { type: 'rect', x: x0, y: yc - 2 * s, w: x1 - x0, h: 4 * s, fill: 'c2', opacity: 0.07 },
      ...[1, 2, 3].flatMap((k): E[] => [
        ...[-1, 1].map((sign): E => ({
          type: 'line',
          x1: x0,
          y1: yc + sign * k * s,
          x2: x1,
          y2: yc + sign * k * s,
          stroke: 'c2',
          width: 1.5,
          dash: '6 8',
          opacity: +(0.7 - k * 0.12).toFixed(2),
        })),
        T(x1 + 10, yc - k * s + 6, `${k}σ`, 16, { fill: 'muted' }),
      ]),
      { type: 'line', x1: x0, y1: yc, x2: x1, y2: yc, stroke: 'c2', width: 2 },
      {
        type: 'path',
        d: 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L'),
        stroke: 'c4',
        width: 4,
        draw: [0.02, 0.55],
      },
      {
        type: 'circle',
        cx: +bx.toFixed(1),
        cy: +by.toFixed(1),
        r: 12,
        fill: 'accent',
        op: vis(0.5, 0.95),
        attr: {
          name: 'r',
          keys: [
            [0, 12],
            [0.5, 12],
            [0.56, 26],
            [0.62, 12],
            [0.68, 22],
            [0.74, 12],
            [1, 12],
          ],
        },
      },
      show(vis(0.62, 0.95), [
        {
          type: 'group',
          move: [
            at(Math.round(bx), Math.round(by - 110)),
            [0.62, Math.round(bx), Math.round(by - 110)],
            [0.8, 1070, 230],
            [1, 1070, 230],
          ],
          children: [doc(-80, -50, 160, 100, 'intent.md', 1, 'accent')],
        },
      ]),
      show(vis(0.8, 0.95), [
        { type: 'rect', x: 860, y: 200, w: 100, h: 60, rx: 14, fill: 'c2' },
        T(910, 238, 'Plan', 22, { fill: 'ink', bold: true, mid: true }),
      ]),
    ],
  };
};

const roles = (): MotionV1 => ({
  dur: 12,
  freeze: 0.5,
  elements: [
    glow(800, 800, 700, 0.4),
    { type: 'rect', x: 260, y: 760, w: 1080, h: 70, rx: 35, stroke: 'line', width: 3 },
    ...[380, 590, 800, 1010, 1220].flatMap((x, k): E[] => {
      const t = 0.04 + k * 0.09;
      return [
        { type: 'person', x, y: 730, s: 0.7, fill: STAGE[k]! },
        {
          type: 'rect',
          x: x - 3,
          y: 752,
          w: 6,
          h: 18,
          fill: STAGE[k]!,
          op: [
            [0, 0.3],
            [t, 0.3],
            [t + 0.02, 1],
            [t + 0.1, 0.3],
            [1, 0.3],
          ],
        },
      ];
    }),
    ...[0, 1, 2].map((k) => token(STAGE[k * 2]!, 9, { d: 'M295 795 H1305', keys: phased(k / 3) })),
  ],
});

const chain = (center: [string, string]): MotionV1 => {
  const [cx, cy, r] = [1170, 460, 230];
  return {
    dur: 14,
    freeze: 0.5,
    elements: [
      glow(cx, cy, 400, 0.55),
      ...[0, 1, 2, 3, 4, 5, 6].map((k): E => {
        const a = -90 + (k * 360) / 7;
        const t = +(0.02 + k * (0.96 / 7)).toFixed(4);
        return {
          type: 'group',
          x: cx,
          y: cy,
          turn: +(a + 90).toFixed(1),
          children: [
            {
              type: 'group',
              move: [
                at(0, 0),
                [t, 0, 0],
                [t + 0.03, 0, -26],
                [t + 0.09, 0, -26],
                [t + 0.12, 0, 0],
                [1, 0, 0],
              ],
              children: [
                { type: 'rect', x: -34, y: -r - 20, w: 68, h: 40, rx: 20, stroke: 'c2', width: 9 },
                {
                  type: 'rect',
                  x: -34,
                  y: -r - 20,
                  w: 68,
                  h: 40,
                  rx: 20,
                  stroke: 'accent',
                  width: 9,
                  op: [
                    [0, 0],
                    [t, 0],
                    [t + 0.02, 1],
                    [t + 0.1, 1],
                    [t + 0.12, 0],
                    [1, 0],
                  ],
                },
              ],
            },
          ],
        };
      }),
      T(cx, cy - 6, center[0], 30, { bold: true, mid: true }),
      T(cx, cy + 28, center[1], 18, { fill: 'muted', mid: true }),
    ],
  };
};

const close = (): MotionV1 => ({
  dur: 12,
  freeze: 0.9,
  elements: [
    glow(1160, 470, 440, 0.7),
    {
      type: 'circle',
      cx: 1160,
      cy: 470,
      r: 330,
      stroke: 'c2',
      width: 2,
      dash: '3 14',
      opacity: 0.5,
      origin: [1160, 470],
      rotate: [
        [0, 0],
        [1, 85.6], // 29 dash periods: the loop restarts without a visible jump
      ],
    },
    {
      type: 'rect',
      x: 880,
      y: 200,
      w: 560,
      h: 440,
      rx: 18,
      fill: 'ink',
      opacity: 0.45,
      stroke: 'line',
      width: 2,
    },
    ...[
      'ai-native-sdlc/',
      '├── CLAUDE.md',
      '├── REVIEW.md',
      '├── templates/',
      '├── .claude/ skills · hooks · agents',
      '├── evals/',
      '├── ops/',
      '├── work/        ← tu intent',
      '└── ejemplo/mis-cuentas/',
    ].map((ln, k) =>
      show(vis(0.04 + k * 0.06, 0.95), [
        T(912, 250 + k * 44, ln, 21, { fill: ln.includes('tu intent') ? 'c4' : 'white', mono: true }),
      ]),
    ),
  ],
});

export const B_SCENES: Record<string, (s: Record<string, unknown>) => MotionV1> = {
  fila,
  plan,
  design,
  build,
  test,
  deploy,
  maintain,
  roles,
  chain: (s) => chain((s.center as [string, string]) ?? ['el loop', 'se rompe y se repara']),
  close,
};
